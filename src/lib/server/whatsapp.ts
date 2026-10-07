import "server-only";
import { all, get, getSetting, nowIso, run } from "./db";
import { DEFAULT_SETTINGS } from "./seed";
import { fmtHour } from "@/lib/hours";

// WhatsApp Business Cloud API (oficial da Meta).
// Sem WHATSAPP_TOKEN/WHATSAPP_PHONE_ID → modo simulação: as mensagens ficam salvas na inbox
// com status "simulada", para desenvolver e testar sem número aprovado.

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
export const WA_LIVE = Boolean(TOKEN && PHONE_ID);

export function conversationFor(phone: string) {
  let c = get<{ id: number }>("SELECT id FROM wa_conversations WHERE phone = ?", phone);
  if (!c) {
    const cust = get<{ id: number }>("SELECT id FROM customers WHERE phone = ?", phone);
    const id = Number(run("INSERT INTO wa_conversations (phone, customer_id, last_message_at) VALUES (?, ?, ?)", phone, cust?.id ?? null, nowIso()).lastInsertRowid);
    c = { id };
  }
  return c.id;
}

/** janela de 24 h desde a última mensagem do cliente (regra da Meta para texto livre) */
export function inWindow(conversationId: number) {
  const c = get<{ last_inbound_at: string | null }>("SELECT last_inbound_at FROM wa_conversations WHERE id = ?", conversationId);
  return !!c?.last_inbound_at && Date.now() - new Date(c.last_inbound_at).getTime() < 24 * 3600 * 1000;
}

type SendOpts = { kind?: "text" | "template" | "system"; author?: string; internal?: boolean };

export async function sendWhatsApp(phone: string, body: string, opts: SendOpts = {}) {
  const convId = conversationFor(phone);
  const at = nowIso();
  if (opts.internal) {
    run("INSERT INTO wa_messages (conversation_id, direction, kind, body, status, internal, author, at) VALUES (?, 'out', 'note', ?, 'nota', 1, ?, ?)", convId, body, opts.author ?? null, at);
    return { ok: true };
  }
  let status = "simulada";
  let waId: string | null = null;
  if (WA_LIVE) {
    try {
      // Fora da janela de 24 h, a Meta só aceita template aprovado. Aqui enviamos texto quando possível;
      // as notificações transacionais devem ter templates equivalentes cadastrados (ver README).
      const res = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: phone.replace("+", ""), type: "text", text: { body, preview_url: true } }),
      });
      const json = (await res.json()) as { messages?: { id: string }[]; error?: { message: string } };
      status = res.ok ? "enviada" : "falhou";
      waId = json.messages?.[0]?.id ?? null;
      if (!res.ok) console.error("WhatsApp:", json.error?.message);
    } catch (e) {
      status = "falhou";
      console.error(e);
    }
  }
  run("INSERT INTO wa_messages (conversation_id, direction, kind, body, status, author, wa_id, at) VALUES (?, 'out', ?, ?, ?, ?, ?, ?)",
    convId, opts.kind ?? "text", body, status, opts.author ?? null, waId, at);
  run("UPDATE wa_conversations SET last_message_at = ? WHERE id = ?", at, convId);
  return { ok: status !== "falhou", status };
}

/** Mensagem recebida (webhook real ou simulador). Roda o bot de entrada quando ninguém está atendendo. */
export async function receiveWhatsApp(phone: string, text: string, waId?: string) {
  const convId = conversationFor(phone);
  const at = nowIso();
  run("INSERT INTO wa_messages (conversation_id, direction, body, status, wa_id, at) VALUES (?, 'in', ?, 'recebida', ?, ?)", convId, text, waId ?? null, at);
  run("UPDATE wa_conversations SET last_message_at = ?, last_inbound_at = ?, unread = unread + 1, status = 'aberta' WHERE id = ?", at, at, convId);
  await bot(convId, phone, text.trim());
}

const SITE = () => process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

async function bot(convId: number, phone: string, text: string) {
  const conv = get<{ assigned_to: string | null; bot_stage: string | null }>("SELECT assigned_to, bot_stage FROM wa_conversations WHERE id = ?", convId);
  if (conv?.assigned_to || conv?.bot_stage === "humano") return; // atendente assumiu
  const t = text.toLowerCase();
  const store = getSetting("store", DEFAULT_SETTINGS.store);
  const send = (b: string) => sendWhatsApp(phone, b, { kind: "system", author: "bot" });

  if (/^(parar|sair|stop)$/i.test(text)) {
    run("UPDATE customers SET marketing_opt_in = 0 WHERE phone = ?", phone);
    return send("Pronto, não vamos mais te mandar promoções. As mensagens dos teus pedidos continuam chegando normalmente.");
  }
  if (t === "1" || t.includes("pedir") || t.includes("cardápio") || t.includes("cardapio")) {
    return send(`Bora! 🍣 Faz teu pedido por aqui: ${SITE()}/?utm_source=whatsapp`);
  }
  if (t === "2" || t.includes("status") || t.includes("meu pedido")) {
    const o = get<{ code: string; status: string; eta_minutes: number | null }>(
      `SELECT o.code, o.status, o.eta_minutes FROM orders o JOIN customers c ON c.id = o.customer_id WHERE c.phone = ? ORDER BY o.id DESC LIMIT 1`, phone);
    if (!o) return send("Não achei pedido nesse número. Quer fazer um? Digita 1 😉");
    const { ORDER_STATUS } = await import("@/lib/format");
    return send(`Teu último pedido #${o.code} está: *${ORDER_STATUS[o.status as keyof typeof ORDER_STATUS]}*. Acompanha aqui: ${SITE()}/pedido/${o.code}`);
  }
  if (t === "3" || t.includes("horário") || t.includes("horario") || t.includes("endereço") || t.includes("endereco")) {
    const hours = getSetting("hours", DEFAULT_SETTINGS.hours);
    const names = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const lines = [2, 3, 4, 5, 6, 0, 1].map((d) => `${names[d]}: ${hours[d]?.length ? hours[d].map(([a, b]) => `${fmtHour(a)}–${fmtHour(b)}`).join(" e ") : "fechado"}`);
    return send(`📍 ${store.address}\n\n🕒 ${lines.join("\n")}`);
  }
  if (t === "4" || t.includes("atendente") || t.includes("humano") || t.includes("pessoa")) {
    run("UPDATE wa_conversations SET bot_stage = 'humano' WHERE id = ?", convId);
    return send("Beleza! Já chamei alguém da equipe pra te responder por aqui 🙌");
  }
  if (conv?.bot_stage !== "menu") {
    run("UPDATE wa_conversations SET bot_stage = 'menu' WHERE id = ?", convId);
    return send(`Oi! Aqui é o ${store.name} 🥢⚡\n\n1️⃣ Fazer pedido\n2️⃣ Status do meu pedido\n3️⃣ Horários e endereço\n4️⃣ Falar com atendente`);
  }
}

export function listConversations(filter: string) {
  const where = filter === "resolvidas" ? "c.status = 'resolvida'" : filter === "humano" ? "c.status = 'aberta' AND (c.bot_stage = 'humano' OR c.assigned_to IS NOT NULL)" : "c.status = 'aberta'";
  return all(`SELECT c.*, cu.name AS customer_name,
      (SELECT body FROM wa_messages m WHERE m.conversation_id = c.id AND m.internal = 0 ORDER BY m.id DESC LIMIT 1) AS last_body
    FROM wa_conversations c LEFT JOIN customers cu ON cu.phone = c.phone
    WHERE ${where} ORDER BY c.last_message_at DESC LIMIT 200`);
}

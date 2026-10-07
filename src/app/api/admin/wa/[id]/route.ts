import { z } from "zod";
import { api, body, idParam } from "@/lib/server/api";
import { all, get, run } from "@/lib/server/db";
import { HttpError, requireStaff } from "@/lib/server/session";
import { inWindow, sendWhatsApp } from "@/lib/server/whatsapp";

type Conv = { id: number; phone: string; customer_id: number | null; status: string; assigned_to: string | null; bot_stage: string | null };

export const GET = api<{ id: string }>(async (_req, ctx) => {
  await requireStaff();
  const id = await idParam(ctx);
  const conv = get<Conv>("SELECT * FROM wa_conversations WHERE id = ?", id);
  if (!conv) throw new HttpError(404, "Conversa não encontrada");
  run("UPDATE wa_conversations SET unread = 0 WHERE id = ?", id);
  const messages = all("SELECT * FROM wa_messages WHERE conversation_id = ? ORDER BY id", id);
  const customer = get<{ id: number; name: string | null; loyalty_cents: number; tags: string; notes: string }>(
    "SELECT id, name, loyalty_cents, tags, notes FROM customers WHERE phone = ?", conv.phone);
  const orders = customer ? all("SELECT id, code, status, total_cents, created_at, payment_method, payment_status, type FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT 6", customer.id) : [];
  const stats = customer ? get<{ n: number; spent: number }>("SELECT COUNT(*) n, COALESCE(SUM(total_cents),0) spent FROM orders WHERE customer_id = ? AND status != 'cancelado'", customer.id) : null;
  return { conversation: conv, window: inWindow(id), messages, customer: customer ? { ...customer, tags: JSON.parse(customer.tags) } : null, orders, stats };
});

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), text: z.string().min(1).max(4000) }),
  z.object({ action: z.literal("note"), text: z.string().min(1).max(2000) }),
  z.object({ action: z.literal("assign"), to: z.string().nullable() }),
  z.object({ action: z.literal("resolve") }),
  z.object({ action: z.literal("reopen") }),
  z.object({ action: z.literal("bot"), on: z.boolean() }),
]);

export const POST = api<{ id: string }>(async (req, ctx) => {
  const s = await requireStaff();
  const id = await idParam(ctx);
  const conv = get<Conv>("SELECT * FROM wa_conversations WHERE id = ?", id);
  if (!conv) throw new HttpError(404, "Conversa não encontrada");
  const a = await body(req, action);
  switch (a.action) {
    case "send":
      // Regra da Meta: texto livre só dentro da janela de 24 h (em modo simulação apenas avisamos).
      if (!inWindow(id) && process.env.WHATSAPP_TOKEN) throw new HttpError(409, "Fora da janela de 24 h: use um template aprovado");
      if (!conv.assigned_to) run("UPDATE wa_conversations SET assigned_to = ?, bot_stage = 'humano' WHERE id = ?", s.name, id);
      await sendWhatsApp(conv.phone, a.text, { author: s.name });
      break;
    case "note": await sendWhatsApp(conv.phone, a.text, { author: s.name, internal: true }); break;
    case "assign": run("UPDATE wa_conversations SET assigned_to = ?, bot_stage = CASE WHEN ? IS NULL THEN NULL ELSE 'humano' END WHERE id = ?", a.to, a.to, id); break;
    case "resolve": run("UPDATE wa_conversations SET status = 'resolvida', assigned_to = NULL, bot_stage = NULL, unread = 0 WHERE id = ?", id); break;
    case "reopen": run("UPDATE wa_conversations SET status = 'aberta' WHERE id = ?", id); break;
    case "bot": run("UPDATE wa_conversations SET bot_stage = ?, assigned_to = CASE WHEN ? THEN NULL ELSE assigned_to END WHERE id = ?", a.on ? null : "humano", a.on ? 1 : 0, id); break;
  }
  return { ok: true };
});

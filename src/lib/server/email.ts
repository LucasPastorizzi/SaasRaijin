import "server-only";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser, type AddressObject } from "mailparser";
import { all, db, get, getSetting, nowIso, run } from "./db";
import { DEFAULT_SETTINGS } from "./seed";
import { brl, PAYMENT_LABEL } from "@/lib/format";

/* ------------------------------------------------------------------
   E-mail da loja dentro do painel.
   - Leitura: IMAP (Gmail, Outlook, Hostinger, Zoho… qualquer provedor).
   - Envio: SMTP.
   Sem EMAIL_* configurado → modo simulação (mensagens ficam só no banco).
------------------------------------------------------------------- */

const env = () => ({
  user: process.env.EMAIL_USER,
  password: process.env.EMAIL_PASSWORD,
  imapHost: process.env.EMAIL_IMAP_HOST,
  imapPort: Number(process.env.EMAIL_IMAP_PORT || 993),
  smtpHost: process.env.EMAIL_SMTP_HOST,
  smtpPort: Number(process.env.EMAIL_SMTP_PORT || 465),
  fromName: process.env.EMAIL_FROM_NAME || "Raijin Sushi",
});
export const emailConfig = () => {
  const e = env();
  return { imap: !!(e.user && e.password && e.imapHost), smtp: !!(e.user && e.password && e.smtpHost), address: e.user ?? null };
};

let schemaReady = false;
function ensureSchema() {
  if (schemaReady) return;
  db().exec(`
    CREATE TABLE IF NOT EXISTS email_messages (
      id INTEGER PRIMARY KEY, folder TEXT NOT NULL DEFAULT 'entrada', uid INTEGER, message_id TEXT, in_reply_to TEXT, refs TEXT,
      direction TEXT NOT NULL, from_addr TEXT, from_name TEXT, to_addrs TEXT, cc TEXT, subject TEXT, text TEXT, html TEXT,
      date TEXT NOT NULL, seen INTEGER NOT NULL DEFAULT 0, attachments TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'ok',
      author TEXT, customer_id INTEGER
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_email_uid ON email_messages(folder, uid) WHERE uid IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_email_date ON email_messages(date);
  `);
  schemaReady = true;
}

const addrList = (a: AddressObject | AddressObject[] | undefined) =>
  (Array.isArray(a) ? a : a ? [a] : []).flatMap((x) => x.value).map((v) => v.address).filter(Boolean).join(", ");
const customerByEmail = (addr: string | null | undefined) =>
  addr ? get<{ id: number }>("SELECT id FROM customers WHERE lower(email) = lower(?)", addr)?.id ?? null : null;

/* ---------------- leitura (IMAP) ---------------- */

function imapClient() {
  const e = env();
  return new ImapFlow({ host: e.imapHost!, port: e.imapPort, secure: e.imapPort === 993, auth: { user: e.user!, pass: e.password! }, logger: false });
}

/** Busca no IMAP os e-mails novos da caixa de entrada (até `limit`) e guarda no banco. */
export async function syncInbox(limit = 60) {
  ensureSchema();
  if (!emailConfig().imap) return { synced: 0, simulated: true };
  const client = imapClient();
  await client.connect();
  let synced = 0;
  const lock = await client.getMailboxLock("INBOX");
  try {
    const box = client.mailbox;
    const total = box && typeof box !== "boolean" ? box.exists : 0;
    if (!total) return { synced: 0 };
    const lastUid = get<{ u: number | null }>("SELECT MAX(uid) u FROM email_messages WHERE folder = 'entrada'")?.u ?? 0;
    // primeira sincronização: últimos `limit`; depois: só UIDs novos
    const range = lastUid ? `${lastUid + 1}:*` : `${Math.max(1, total - limit + 1)}:*`;
    const msgs = await client.fetchAll(range, { uid: true, flags: true, source: true }, lastUid ? { uid: true } : undefined);
    for (const m of msgs) {
      if (!m.source || m.uid <= lastUid) continue;
      const p = await simpleParser(m.source);
      const from = p.from?.value[0];
      run(`INSERT OR IGNORE INTO email_messages (folder, uid, message_id, in_reply_to, refs, direction, from_addr, from_name, to_addrs, cc, subject, text, html, date, seen, attachments, customer_id)
        VALUES ('entrada', ?, ?, ?, ?, 'in', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        m.uid, p.messageId ?? null, p.inReplyTo ?? null, Array.isArray(p.references) ? p.references.join(" ") : p.references ?? null,
        from?.address ?? null, from?.name || null, addrList(p.to), addrList(p.cc), p.subject ?? "(sem assunto)",
        (p.text ?? "").slice(0, 100_000), typeof p.html === "string" ? p.html.slice(0, 400_000) : null,
        (p.date ?? new Date()).toISOString(), m.flags?.has("\\Seen") ? 1 : 0,
        JSON.stringify(p.attachments.map((a) => ({ name: a.filename ?? "anexo", size: a.size, type: a.contentType }))), customerByEmail(from?.address));
      synced++;
    }
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
  return { synced };
}

/** Marca como lido no banco e no servidor IMAP. */
export async function markSeen(id: number) {
  ensureSchema();
  const m = get<{ uid: number | null; seen: number; folder: string }>("SELECT uid, seen, folder FROM email_messages WHERE id = ?", id);
  if (!m || m.seen) return;
  run("UPDATE email_messages SET seen = 1 WHERE id = ?", id);
  if (m.uid && m.folder === "entrada" && emailConfig().imap) {
    const client = imapClient();
    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      try { await client.messageFlagsAdd(String(m.uid), ["\\Seen"], { uid: true }); } finally { lock.release(); }
    } catch (e) { console.error("IMAP seen:", (e as Error).message); } finally { await client.logout().catch(() => {}); }
  }
}

/* ---------------- envio (SMTP) ---------------- */

export async function sendEmail(o: { to: string; subject: string; text: string; html?: string; inReplyToId?: number; author?: string; cc?: string }) {
  ensureSchema();
  const e = env();
  const parent = o.inReplyToId ? get<{ message_id: string | null; refs: string | null }>("SELECT message_id, refs FROM email_messages WHERE id = ?", o.inReplyToId) : undefined;
  const refs = [parent?.refs, parent?.message_id].filter(Boolean).join(" ") || undefined;
  let status = "simulado", messageId: string | null = null;
  if (emailConfig().smtp) {
    try {
      const transport = nodemailer.createTransport({ host: e.smtpHost, port: e.smtpPort, secure: e.smtpPort === 465, auth: { user: e.user, pass: e.password } });
      const info = await transport.sendMail({
        from: { name: e.fromName, address: e.user! }, to: o.to, cc: o.cc, subject: o.subject, text: o.text, html: o.html,
        inReplyTo: parent?.message_id ?? undefined, references: refs,
      });
      status = "enviado"; messageId = info.messageId;
    } catch (err) {
      status = "falhou";
      console.error("SMTP:", (err as Error).message);
    }
  }
  const id = Number(run(`INSERT INTO email_messages (folder, message_id, in_reply_to, refs, direction, from_addr, from_name, to_addrs, cc, subject, text, html, date, seen, status, author, customer_id)
    VALUES ('enviados', ?, ?, ?, 'out', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    messageId, parent?.message_id ?? null, refs ?? null, e.user ?? "loja@simulado", e.fromName, o.to, o.cc ?? null, o.subject, o.text, o.html ?? null,
    nowIso(), status, o.author ?? null, customerByEmail(o.to.split(",")[0]?.trim())).lastInsertRowid);
  return { id, status };
}

/** Simulador (desenvolvimento): injeta um e-mail recebido. */
export function simulateIncoming(from: string, fromName: string, subject: string, text: string) {
  ensureSchema();
  run(`INSERT INTO email_messages (folder, direction, from_addr, from_name, to_addrs, subject, text, date, customer_id) VALUES ('entrada', 'in', ?, ?, ?, ?, ?, ?, ?)`,
    from, fromName, env().user ?? "loja@simulado", subject, text, nowIso(), customerByEmail(from));
}

/* ---------------- consulta ---------------- */

export type EmailRow = { id: number; folder: string; direction: string; from_addr: string | null; from_name: string | null; to_addrs: string | null;
  subject: string | null; date: string; seen: number; status: string; customer_id: number | null; preview: string; attachments: string };

export function listEmails(folder: "entrada" | "enviados", q?: string, onlyUnread = false) {
  ensureSchema();
  const where = ["folder = ?"]; const p: (string | number)[] = [folder];
  if (onlyUnread) where.push("seen = 0");
  if (q) { where.push("(subject LIKE ? OR from_addr LIKE ? OR from_name LIKE ? OR to_addrs LIKE ? OR text LIKE ?)"); const like = `%${q}%`; p.push(like, like, like, like, like); }
  return all<EmailRow>(`SELECT id, folder, direction, from_addr, from_name, to_addrs, subject, date, seen, status, customer_id, attachments,
      substr(replace(replace(COALESCE(text,''), char(10), ' '), char(13), ' '), 1, 160) AS preview
    FROM email_messages WHERE ${where.join(" AND ")} ORDER BY date DESC LIMIT 200`, ...p);
}

export function emailDetail(id: number) {
  ensureSchema();
  const m = get<EmailRow & { text: string | null; html: string | null; cc: string | null; message_id: string | null }>("SELECT * FROM email_messages WHERE id = ?", id);
  if (!m) return null;
  const customer = m.customer_id ? get<{ id: number; name: string | null; phone: string }>("SELECT id, name, phone FROM customers WHERE id = ?", m.customer_id) : null;
  const orders = customer ? all("SELECT code, status, total_cents, created_at FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT 5", customer.id) : [];
  return { ...m, attachments: JSON.parse(m.attachments) as { name: string; size: number; type: string }[], customer, orders };
}

export const unreadCount = () => { ensureSchema(); return get<{ n: number }>("SELECT COUNT(*) n FROM email_messages WHERE folder = 'entrada' AND seen = 0")!.n; };

/* ---------------- confirmação de pedido por e-mail ---------------- */

export async function sendOrderEmail(orderId: number, status: "novo" | "entregue") {
  const ops = getSetting("ops", DEFAULT_SETTINGS.ops) as typeof DEFAULT_SETTINGS.ops & { emailReceipts?: boolean };
  if (ops.emailReceipts === false) return;
  const o = get<{ code: string; total_cents: number; subtotal_cents: number; delivery_fee_cents: number; discount_cents: number; payment_method: string; type: string; email: string | null; name: string | null }>(
    `SELECT o.code, o.total_cents, o.subtotal_cents, o.delivery_fee_cents, o.discount_cents, o.payment_method, o.type, c.email, c.name
     FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?`, orderId);
  if (!o?.email) return;
  const items = all<{ qty: number; name: string; variant: string | null; total_cents: number }>("SELECT qty, name, variant, total_cents FROM order_items WHERE order_id = ?", orderId);
  const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3333";
  const first = o.name?.split(" ")[0] ?? "";
  const subject = status === "novo" ? `Recebemos teu pedido #${o.code} 🍣` : `Pedido #${o.code} entregue — bom apetite!`;
  const rows = items.map((i) => `<tr><td style="padding:6px 0">${i.qty}× ${esc(i.name)}${i.variant ? ` · ${esc(i.variant)}` : ""}</td><td style="padding:6px 0;text-align:right">${brl(i.total_cents)}</td></tr>`).join("");
  const html = `<div style="background:#f3ece1;padding:24px;font-family:Arial,sans-serif;color:#161412">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:18px;padding:28px">
      <p style="margin:0;font-weight:700;font-size:22px">raijin <span style="font-size:10px;letter-spacing:4px">SUSHI</span></p>
      <h1 style="font-size:26px;margin:18px 0 6px">${status === "novo" ? `Oi ${esc(first)}, recebemos teu pedido!` : "Pedido entregue ⚡"}</h1>
      <p style="color:#555;margin:0 0 18px">Pedido <b>#${o.code}</b> · ${o.type === "delivery" ? "entrega" : "retirada"} · ${PAYMENT_LABEL[o.payment_method]}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}
        <tr><td style="padding:6px 0;color:#777">Entrega</td><td style="text-align:right;color:#777">${brl(o.delivery_fee_cents)}</td></tr>
        ${o.discount_cents ? `<tr><td style="color:#2f9e5b">Desconto</td><td style="text-align:right;color:#2f9e5b">− ${brl(o.discount_cents)}</td></tr>` : ""}
        <tr><td style="padding-top:10px;border-top:2px solid #161412;font-weight:700">Total</td><td style="padding-top:10px;border-top:2px solid #161412;text-align:right;font-weight:700">${brl(o.total_cents)}</td></tr>
      </table>
      <p style="margin:24px 0 0"><a href="${site}/pedido/${o.code}" style="background:#ef7d32;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:700">Acompanhar pedido</a></p>
    </div></div>`;
  const text = `${subject}\nTotal: ${brl(o.total_cents)}\nAcompanhe: ${site}/pedido/${o.code}`;
  await sendEmail({ to: o.email, subject, text, html, author: "sistema" }).catch(() => {});
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

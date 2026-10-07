import crypto from "node:crypto";
import { z } from "zod";
import { api, body } from "@/lib/server/api";
import { get, nowIso, run } from "@/lib/server/db";
import { HttpError, startSession } from "@/lib/server/session";
import { sendWhatsApp, WA_LIVE } from "@/lib/server/whatsapp";
import { normPhone } from "@/lib/format";

// Login do cliente pelo WhatsApp: pede código → recebe no Whats → confirma.
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request"), phone: z.string().min(10, "Telefone inválido") }),
  z.object({ action: z.literal("verify"), phone: z.string(), code: z.string().length(6, "O código tem 6 dígitos"), name: z.string().max(80).optional(), optIn: z.boolean().optional() }),
]);

export const POST = api(async (req) => {
  const input = await body(req, schema);
  const phone = normPhone(input.phone);
  if (phone.length < 13 || phone.length > 14) throw new HttpError(400, "Confere o número com DDD");

  if (input.action === "request") {
    const prev = get<{ expires_at: number }>("SELECT expires_at FROM otp_codes WHERE phone = ?", phone);
    if (prev && prev.expires_at - 9 * 60_000 > Date.now()) throw new HttpError(429, "Aguarde um minutinho para pedir outro código");
    const code = String(crypto.randomInt(100000, 1000000));
    run("INSERT INTO otp_codes (phone, code, expires_at, attempts) VALUES (?, ?, ?, 0) ON CONFLICT(phone) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at, attempts = 0",
      phone, code, Date.now() + 10 * 60_000);
    await sendWhatsApp(phone, `Teu código Raijin é *${code}*. Não compartilhe com ninguém. Vale por 10 minutos.`, { kind: "template", author: "sistema" });
    const known = get<{ name: string | null }>("SELECT name FROM customers WHERE phone = ?", phone);
    // Em modo simulação (sem WhatsApp configurado) devolvemos o código para facilitar o desenvolvimento.
    return { ok: true, known: !!known?.name, devCode: WA_LIVE || process.env.NODE_ENV === "production" ? undefined : code };
  }

  const row = get<{ code: string; expires_at: number; attempts: number }>("SELECT * FROM otp_codes WHERE phone = ?", phone);
  if (!row || row.expires_at < Date.now()) throw new HttpError(400, "Código expirado. Pede outro.");
  if (row.attempts >= 5) throw new HttpError(429, "Muitas tentativas. Pede um novo código.");
  if (row.code !== input.code) {
    run("UPDATE otp_codes SET attempts = attempts + 1 WHERE phone = ?", phone);
    throw new HttpError(400, "Código incorreto");
  }
  run("DELETE FROM otp_codes WHERE phone = ?", phone);
  let c = get<{ id: number; name: string | null }>("SELECT id, name FROM customers WHERE phone = ?", phone);
  if (!c) {
    const id = Number(run("INSERT INTO customers (phone, name, marketing_opt_in, opt_in_at) VALUES (?, ?, ?, ?)",
      phone, input.name?.trim() || null, input.optIn ? 1 : 0, input.optIn ? nowIso() : null).lastInsertRowid);
    run("UPDATE wa_conversations SET customer_id = ? WHERE phone = ?", id, phone);
    c = { id, name: input.name ?? null };
  } else if (!c.name && input.name) {
    run("UPDATE customers SET name = ? WHERE id = ?", input.name.trim(), c.id);
  }
  await startSession("customer", c.id);
  return { ok: true };
});

import { z } from "zod";
import { api, body, idParam } from "@/lib/server/api";
import { audit, run } from "@/lib/server/db";
import { requireStaff } from "@/lib/server/session";
import { normPhone } from "@/lib/format";

const patch = z.object({
  name: z.string().min(2), phone: z.string().min(10), pin: z.string().regex(/^\d{4,6}$/, "PIN de 4 a 6 números"),
  vehicle: z.enum(["moto", "carro", "bike"]), plate: z.string().max(10).nullable(), pix_key: z.string().max(120).nullable(),
  pay_rule: z.enum(["fixed", "pct"]), pay_value: z.number().int().min(0), daily_cents: z.number().int().min(0),
  active: z.boolean(), on_shift: z.boolean(),
}).partial();

export const PATCH = api<{ id: string }>(async (req, ctx) => {
  const s = await requireStaff("gerente");
  const id = await idParam(ctx);
  const p = await body(req, patch);
  const cols = Object.entries(p).map(([k, v]) => [k, k === "phone" ? normPhone(String(v)) : typeof v === "boolean" ? (v ? 1 : 0) : v] as const);
  if (p.on_shift === false) cols.push(["shift_started_at", null] as never);
  if (p.on_shift === true) cols.push(["shift_started_at", new Date().toISOString()] as never);
  if (cols.length) run(`UPDATE couriers SET ${cols.map(([k]) => `${k} = ?`).join(", ")} WHERE id = ?`, ...(cols.map(([, v]) => v) as (string | number | null)[]), id);
  audit(s.email, "motoboy.editar", { id, ...p, pin: p.pin ? "***" : undefined });
  return { ok: true };
});

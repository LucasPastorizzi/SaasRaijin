import { z } from "zod";
import { api, body, idParam } from "@/lib/server/api";
import { audit, nowIso, run } from "@/lib/server/db";
import { customerDetail } from "@/lib/server/crm";
import { HttpError, requireStaff } from "@/lib/server/session";

export const GET = api<{ id: string }>(async (_req, ctx) => {
  await requireStaff();
  const c = customerDetail(await idParam(ctx));
  if (!c) throw new HttpError(404, "Cliente não encontrado");
  return c;
});

const patch = z.object({
  name: z.string().min(1).max(80), email: z.string().email().or(z.literal("")), birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")),
  tags: z.array(z.string().min(1).max(30)).max(20), notes: z.string().max(2000), marketing_opt_in: z.boolean(), loyalty_adjust_cents: z.number().int(),
}).partial();

export const PATCH = api<{ id: string }>(async (req, ctx) => {
  const s = await requireStaff();
  const id = await idParam(ctx);
  const p = await body(req, patch);
  if (p.name !== undefined) run("UPDATE customers SET name = ? WHERE id = ?", p.name, id);
  if (p.email !== undefined) run("UPDATE customers SET email = ? WHERE id = ?", p.email || null, id);
  if (p.birthday !== undefined) run("UPDATE customers SET birthday = ? WHERE id = ?", p.birthday || null, id);
  if (p.tags !== undefined) run("UPDATE customers SET tags = ? WHERE id = ?", JSON.stringify(p.tags), id);
  if (p.notes !== undefined) run("UPDATE customers SET notes = ? WHERE id = ?", p.notes, id);
  if (p.marketing_opt_in !== undefined) run("UPDATE customers SET marketing_opt_in = ?, opt_in_at = ? WHERE id = ?", p.marketing_opt_in ? 1 : 0, nowIso(), id);
  if (p.loyalty_adjust_cents) run("UPDATE customers SET loyalty_cents = MAX(0, loyalty_cents + ?) WHERE id = ?", p.loyalty_adjust_cents, id);
  audit(s.email, "cliente.editar", { id, ...p });
  return customerDetail(id);
});

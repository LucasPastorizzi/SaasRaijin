import { z } from "zod";
import { api, body } from "@/lib/server/api";
import { all, nowIso, run } from "@/lib/server/db";
import { currentCustomer, endSession, requireCustomer } from "@/lib/server/session";

export const GET = api(async () => {
  const c = await currentCustomer();
  if (!c) return { customer: null };
  const addresses = all("SELECT a.*, z.name AS zone_name, z.fee_cents FROM customer_addresses a LEFT JOIN delivery_zones z ON z.id = a.zone_id WHERE customer_id = ? ORDER BY a.id DESC", c.id);
  const orders = all<{ id: number; code: string; status: string; total_cents: number; created_at: string; type: string; rating: number | null }>(
    "SELECT id, code, status, total_cents, created_at, type, rating FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT 30", c.id);
  const items = orders.length ? all<{ order_id: number; product_id: number; name: string; qty: number; variant: string | null; options: string; notes: string | null }>(
    `SELECT order_id, product_id, name, qty, variant, options, notes FROM order_items WHERE order_id IN (${orders.map((o) => o.id).join(",")})`) : [];
  return {
    customer: c, addresses,
    orders: orders.map((o) => ({ ...o, items: items.filter((i) => i.order_id === o.id).map((i) => ({ ...i, options: JSON.parse(i.options) })) })),
  };
});

const patch = z.object({
  name: z.string().min(2).max(80).optional(), email: z.string().email().or(z.literal("")).optional(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).optional(), marketing_opt_in: z.boolean().optional(),
  deleteAddressId: z.number().int().optional(),
});
export const PATCH = api(async (req) => {
  const c = await requireCustomer();
  const p = await body(req, patch);
  if (p.name !== undefined) run("UPDATE customers SET name = ? WHERE id = ?", p.name, c.id);
  if (p.email !== undefined) run("UPDATE customers SET email = ? WHERE id = ?", p.email || null, c.id);
  if (p.birthday !== undefined) run("UPDATE customers SET birthday = ? WHERE id = ?", p.birthday || null, c.id);
  if (p.marketing_opt_in !== undefined) run("UPDATE customers SET marketing_opt_in = ?, opt_in_at = ? WHERE id = ?", p.marketing_opt_in ? 1 : 0, nowIso(), c.id);
  if (p.deleteAddressId) run("DELETE FROM customer_addresses WHERE id = ? AND customer_id = ?", p.deleteAddressId, c.id);
  return { ok: true };
});

export const DELETE = api(async () => {
  await endSession("customer");
  return { ok: true };
});

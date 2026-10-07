import { z } from "zod";
import { api, body } from "@/lib/server/api";
import { all, audit, get, run } from "@/lib/server/db";
import { HttpError, requireStaff } from "@/lib/server/session";

const schema = z.object({
  code: z.string().min(3, "Código com 3+ caracteres").max(30).transform((s) => s.toUpperCase().replace(/\s/g, "")),
  type: z.enum(["pct", "fixed", "free_delivery"]),
  value: z.number().int().min(0),
  min_cents: z.number().int().min(0).default(0),
  starts_at: z.string().nullable().optional(),
  ends_at: z.string().nullable().optional(),
  max_uses: z.number().int().min(1).nullable().optional(),
  per_customer: z.number().int().min(1).default(1),
  first_order_only: z.boolean().default(false),
  active: z.boolean().default(true),
  description: z.string().max(200).nullable().optional(),
});

export const GET = api(async () => {
  await requireStaff();
  return { coupons: all("SELECT * FROM coupons ORDER BY active DESC, id DESC") };
});

export const POST = api(async (req) => {
  const s = await requireStaff("gerente");
  const c = await body(req, schema);
  if (c.type === "pct" && c.value > 100) throw new HttpError(400, "Percentual até 100%");
  if (get("SELECT id FROM coupons WHERE code = ?", c.code)) throw new HttpError(409, "Já existe cupom com esse código");
  const id = Number(run(`INSERT INTO coupons (code, type, value, min_cents, starts_at, ends_at, max_uses, per_customer, first_order_only, active, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, c.code, c.type, c.value, c.min_cents, c.starts_at ?? null, c.ends_at ?? null, c.max_uses ?? null,
    c.per_customer, c.first_order_only ? 1 : 0, c.active ? 1 : 0, c.description ?? null).lastInsertRowid);
  audit(s.email, "cupom.criar", { id, code: c.code });
  return { id };
});

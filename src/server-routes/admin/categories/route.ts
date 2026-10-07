import { z } from "zod";
import { api, body } from "@/lib/server/api";
import { audit, get, run } from "@/lib/server/db";
import { requireStaff } from "@/lib/server/session";

export const POST = api(async (req) => {
  const s = await requireStaff("gerente");
  const { name, emoji } = await body(req, z.object({ name: z.string().min(2, "Nome da categoria"), emoji: z.string().max(4).optional() }));
  const sort = (get<{ m: number | null }>("SELECT MAX(sort) m FROM categories")?.m ?? 0) + 1;
  const id = Number(run("INSERT INTO categories (name, emoji, sort) VALUES (?, ?, ?)", name, emoji ?? null, sort).lastInsertRowid);
  audit(s.email, "categoria.criar", { id, name });
  return { id };
});

// Reordenar: { order: [id, id, ...] }
export const PATCH = api(async (req) => {
  await requireStaff("gerente");
  const { order } = await body(req, z.object({ order: z.array(z.number().int()) }));
  order.forEach((id, i) => run("UPDATE categories SET sort = ? WHERE id = ?", i, id));
  return { ok: true };
});

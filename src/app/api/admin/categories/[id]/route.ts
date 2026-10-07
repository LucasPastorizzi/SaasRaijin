import { z } from "zod";
import { api, body, idParam } from "@/lib/server/api";
import { audit, get, run } from "@/lib/server/db";
import { HttpError, requireStaff } from "@/lib/server/session";

export const PATCH = api<{ id: string }>(async (req, ctx) => {
  const s = await requireStaff("gerente");
  const id = await idParam(ctx);
  const p = await body(req, z.object({ name: z.string().min(2).optional(), emoji: z.string().max(4).nullable().optional(), active: z.boolean().optional() }));
  if (p.name !== undefined) run("UPDATE categories SET name = ? WHERE id = ?", p.name, id);
  if (p.emoji !== undefined) run("UPDATE categories SET emoji = ? WHERE id = ?", p.emoji, id);
  if (p.active !== undefined) run("UPDATE categories SET active = ? WHERE id = ?", p.active ? 1 : 0, id);
  audit(s.email, "categoria.editar", { id, ...p });
  return { ok: true };
});

export const DELETE = api<{ id: string }>(async (_req, ctx) => {
  const s = await requireStaff("gerente");
  const id = await idParam(ctx);
  const n = get<{ n: number }>("SELECT COUNT(*) n FROM products WHERE category_id = ? AND deleted = 0", id)!.n;
  if (n) throw new HttpError(409, "Mova ou exclua os produtos desta categoria antes");
  run("DELETE FROM categories WHERE id = ?", id);
  audit(s.email, "categoria.excluir", { id });
  return { ok: true };
});

import { z } from "zod";
import { api, body, idParam } from "@/lib/server/api";
import { audit, run } from "@/lib/server/db";
import { requireStaff } from "@/lib/server/session";

const patch = z.object({
  active: z.boolean(), value: z.number().int().min(0), min_cents: z.number().int().min(0), ends_at: z.string().nullable(),
  max_uses: z.number().int().nullable(), description: z.string().max(200).nullable(),
}).partial();

export const PATCH = api<{ id: string }>(async (req, ctx) => {
  const s = await requireStaff("gerente");
  const id = await idParam(ctx);
  const p = await body(req, patch);
  const cols = Object.entries(p).map(([k, v]) => [k, typeof v === "boolean" ? (v ? 1 : 0) : v] as const);
  if (cols.length) run(`UPDATE coupons SET ${cols.map(([k]) => `${k} = ?`).join(", ")} WHERE id = ?`, ...(cols.map(([, v]) => v) as (string | number | null)[]), id);
  audit(s.email, "cupom.editar", { id, ...p });
  return { ok: true };
});

export const DELETE = api<{ id: string }>(async (_req, ctx) => {
  const s = await requireStaff("gerente");
  const id = await idParam(ctx);
  run("DELETE FROM coupons WHERE id = ?", id);
  audit(s.email, "cupom.excluir", { id });
  return { ok: true };
});

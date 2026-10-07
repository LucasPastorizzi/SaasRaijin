import { api, body, idParam } from "@/lib/server/api";
import { audit, get, run, tx } from "@/lib/server/db";
import { HttpError, requireStaff } from "@/lib/server/session";
import { productPatch as patch, saveRelations } from "@/lib/server/catalog";

export const PATCH = api<{ id: string }>(async (req, ctx) => {
  // pausar/despausar pode ser feito por qualquer um da equipe (cozinha avisa que acabou)
  const s = await requireStaff();
  const id = await idParam(ctx);
  const p = await body(req, patch);
  const onlyPause = Object.keys(p).every((k) => k === "paused" || k === "stock");
  if (!onlyPause && !["admin", "gerente"].includes(s.role)) throw new HttpError(403, "Só gerente ou admin editam produtos");
  const cur = get<{ price_cents: number }>("SELECT price_cents FROM products WHERE id = ? AND deleted = 0", id);
  if (!cur) throw new HttpError(404, "Produto não encontrado");

  tx(() => {
    const cols: [string, unknown][] = [];
    const map: Record<string, (v: unknown) => unknown> = {
      category_id: (v) => v, name: (v) => v, description: (v) => v, price_cents: (v) => v, promo_price_cents: (v) => v ?? null,
      promo_until: (v) => v ?? null, image: (v) => v ?? null, tags: (v) => JSON.stringify(v), pieces: (v) => v ?? null,
      prep_minutes: (v) => v ?? null, sku: (v) => v ?? null, stock: (v) => v ?? null, active: (v) => (v ? 1 : 0), paused: (v) => (v ? 1 : 0),
    };
    for (const [k, fn] of Object.entries(map)) if (k in p) cols.push([k, fn((p as Record<string, unknown>)[k])]);
    if (cols.length) run(`UPDATE products SET ${cols.map(([k]) => `${k} = ?`).join(", ")} WHERE id = ?`, ...(cols.map(([, v]) => v) as (string | number | null)[]), id);
    if (p.price_cents !== undefined && p.price_cents !== cur.price_cents)
      run("INSERT INTO price_history (product_id, old_cents, new_cents, changed_by) VALUES (?, ?, ?, ?)", id, cur.price_cents, p.price_cents, s.name);
    saveRelations(id, p);
  });
  audit(s.email, onlyPause ? (p.paused ? "produto.pausar" : "produto.despausar") : "produto.editar", { id });
  return { ok: true };
});

export const DELETE = api<{ id: string }>(async (_req, ctx) => {
  const s = await requireStaff("gerente");
  const id = await idParam(ctx);
  run("UPDATE products SET deleted = 1, active = 0 WHERE id = ?", id); // exclusão lógica: mantém o histórico dos pedidos
  audit(s.email, "produto.excluir", { id });
  return { ok: true };
});

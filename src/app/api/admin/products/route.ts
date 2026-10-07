import { api, body } from "@/lib/server/api";
import { audit, get, run, tx } from "@/lib/server/db";
import { requireStaff } from "@/lib/server/session";
import { productSchema, saveRelations } from "@/lib/server/catalog";

export const POST = api(async (req) => {
  const s = await requireStaff("gerente");
  const p = await body(req, productSchema);
  const id = tx(() => {
    const sort = (get<{ m: number | null }>("SELECT MAX(sort) m FROM products WHERE category_id = ?", p.category_id)?.m ?? 0) + 1;
    const id = Number(run(`INSERT INTO products (category_id, name, description, price_cents, promo_price_cents, promo_until, image, tags, pieces, prep_minutes, sku, stock, active, paused, sort)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      p.category_id, p.name, p.description, p.price_cents, p.promo_price_cents ?? null, p.promo_until ?? null, p.image ?? null, JSON.stringify(p.tags),
      p.pieces ?? null, p.prep_minutes ?? null, p.sku ?? null, p.stock ?? null, p.active ? 1 : 0, p.paused ? 1 : 0, sort).lastInsertRowid);
    saveRelations(id, p);
    run("INSERT INTO price_history (product_id, old_cents, new_cents, changed_by) VALUES (?, NULL, ?, ?)", id, p.price_cents, s.name);
    return id;
  });
  audit(s.email, "produto.criar", { id, name: p.name });
  return { id };
});

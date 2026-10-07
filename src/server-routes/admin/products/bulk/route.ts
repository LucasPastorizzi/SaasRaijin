import { z } from "zod";
import { api, body } from "@/lib/server/api";
import { all, audit, run, tx } from "@/lib/server/db";
import { requireStaff } from "@/lib/server/session";

// Ações em massa: reajuste de preço (% ou valor) e pausar/despausar.
const schema = z.object({
  productIds: z.array(z.number().int()).min(1, "Selecione produtos"),
  action: z.enum(["pct", "add", "pause", "unpause", "duplicate"]),
  value: z.number().optional(),
});

export const POST = api(async (req) => {
  const s = await requireStaff("gerente");
  const { productIds, action, value = 0 } = await body(req, schema);
  const ids = productIds.join(",");
  tx(() => {
    if (action === "pause" || action === "unpause") {
      run(`UPDATE products SET paused = ? WHERE id IN (${ids})`, action === "pause" ? 1 : 0);
      return;
    }
    if (action === "duplicate") {
      for (const id of productIds) {
        const nid = Number(run(`INSERT INTO products (category_id, name, description, price_cents, image, tags, pieces, prep_minutes, active, paused, sort)
          SELECT category_id, name || ' (cópia)', description, price_cents, image, tags, pieces, prep_minutes, 0, 0, sort + 1 FROM products WHERE id = ?`, id).lastInsertRowid);
        run("INSERT INTO product_variants (product_id, name, price_cents, sort) SELECT ?, name, price_cents, sort FROM product_variants WHERE product_id = ?", nid, id);
        run("INSERT INTO product_option_groups (product_id, group_id, sort) SELECT ?, group_id, sort FROM product_option_groups WHERE product_id = ?", nid, id);
      }
      return;
    }
    const rows = all<{ id: number; price_cents: number }>(`SELECT id, price_cents FROM products WHERE id IN (${ids})`);
    for (const r of rows) {
      const next = Math.max(0, action === "pct" ? Math.round((r.price_cents * (100 + value)) / 100 / 10) * 10 : r.price_cents + Math.round(value));
      run("UPDATE products SET price_cents = ? WHERE id = ?", next, r.id);
      run("UPDATE product_variants SET price_cents = MAX(0, " + (action === "pct" ? `ROUND(price_cents * ${(100 + value) / 100} / 10) * 10` : `price_cents + ${Math.round(value)}`) + ") WHERE product_id = ?", r.id);
      run("INSERT INTO price_history (product_id, old_cents, new_cents, changed_by) VALUES (?, ?, ?, ?)", r.id, r.price_cents, next, `${s.name} (em massa)`);
    }
  });
  audit(s.email, `produtos.${action}`, { productIds, value });
  return { ok: true };
});

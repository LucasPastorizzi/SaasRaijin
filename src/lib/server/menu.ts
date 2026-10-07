import "server-only";
import { all } from "./db";

export type MenuOption = { id: number; name: string; price_cents: number; paused: number };
export type MenuGroup = { id: number; name: string; min: number; max: number; options: MenuOption[] };
export type MenuProduct = {
  id: number; category_id: number; name: string; description: string; price_cents: number; promo_price_cents: number | null;
  promo_until: string | null; image: string | null; tags: string[]; pieces: number | null; paused: number; active: number; stock: number | null;
  sort: number; prep_minutes: number | null; sku: string | null;
  variants: { id: number; name: string; price_cents: number }[]; groups: MenuGroup[];
};
export type MenuCategory = { id: number; name: string; emoji: string | null; sort: number; active: number };

/** preço efetivo considerando promoção vigente */
export function effectivePrice(p: { price_cents: number; promo_price_cents: number | null; promo_until: string | null }) {
  if (p.promo_price_cents != null && (!p.promo_until || new Date(p.promo_until).getTime() > Date.now())) return p.promo_price_cents;
  return p.price_cents;
}

export function loadMenu({ includeHidden = false } = {}) {
  const categories = all<MenuCategory>(`SELECT * FROM categories ${includeHidden ? "" : "WHERE active = 1"} ORDER BY sort, id`);
  const products = all<Omit<MenuProduct, "tags" | "variants" | "groups"> & { tags: string }>(
    `SELECT p.* FROM products p JOIN categories c ON c.id = p.category_id WHERE p.deleted = 0 ${includeHidden ? "" : "AND p.active = 1 AND c.active = 1"} ORDER BY c.sort, p.sort, p.id`);
  const variants = all<{ id: number; product_id: number; name: string; price_cents: number }>("SELECT * FROM product_variants ORDER BY sort, id");
  const groups = all<Omit<MenuGroup, "options">>("SELECT * FROM option_groups ORDER BY sort, id");
  const options = all<MenuOption & { group_id: number }>("SELECT * FROM options ORDER BY sort, id");
  const links = all<{ product_id: number; group_id: number }>("SELECT * FROM product_option_groups ORDER BY sort");

  const groupMap = new Map(groups.map((g) => [g.id, { ...g, options: options.filter((o) => o.group_id === g.id) }]));
  const full: MenuProduct[] = products.map((p) => ({
    ...p,
    tags: JSON.parse(p.tags || "[]"),
    paused: p.paused || (p.stock !== null && p.stock <= 0 ? 1 : 0),
    variants: variants.filter((v) => v.product_id === p.id),
    groups: links.filter((l) => l.product_id === p.id).map((l) => groupMap.get(l.group_id)!).filter(Boolean),
  }));
  return { categories, products: full, groups: [...groupMap.values()] };
}

/** "Os mais vendidos": top 6 dos últimos 30 dias */
export function bestSellers() {
  return all<{ product_id: number; qty: number }>(`SELECT oi.product_id, SUM(oi.qty) AS qty FROM order_items oi
    JOIN orders o ON o.id = oi.order_id WHERE o.status != 'cancelado' AND datetime(o.created_at) >= datetime('now', '-30 days') AND oi.product_id IS NOT NULL
    GROUP BY oi.product_id ORDER BY qty DESC LIMIT 6`).map((r) => r.product_id);
}

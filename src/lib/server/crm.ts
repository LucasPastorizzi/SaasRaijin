import "server-only";
import { all, get } from "./db";

export const SEGMENTS = {
  todos: "Todos",
  novos: "Novos (1 pedido)",
  recorrentes: "Recorrentes",
  vip: "VIP",
  em_risco: "Em risco (30–60 dias)",
  sumidos: "Sumidos (+60 dias)",
  aniversariantes: "Aniversariantes do mês",
  sem_pedido: "Sem pedido (só conversa)",
} as const;
export type Segment = keyof typeof SEGMENTS;

export type CustomerStats = {
  id: number; phone: string; name: string | null; email: string | null; birthday: string | null; marketing_opt_in: number;
  tags: string[]; notes: string; loyalty_cents: number; created_at: string;
  orders: number; spent: number; avg: number; first_order: string | null; last_order: string | null; days_since: number | null; recent60: number; segments: Segment[];
};

/** Métricas e segmentos de todos os clientes (RFM simplificado). */
export function customersWithStats(): CustomerStats[] {
  const rows = all<Omit<CustomerStats, "tags" | "segments" | "avg" | "days_since"> & { tags: string }>(`
    SELECT c.id, c.phone, c.name, c.email, c.birthday, c.marketing_opt_in, c.tags, c.notes, c.loyalty_cents, c.created_at,
      COUNT(o.id) AS orders, COALESCE(SUM(o.total_cents), 0) AS spent,
      MIN(o.created_at) AS first_order, MAX(o.created_at) AS last_order,
      SUM(CASE WHEN datetime(o.created_at) >= datetime('now','-60 days') THEN 1 ELSE 0 END) AS recent60
    FROM customers c LEFT JOIN orders o ON o.customer_id = c.id AND o.status != 'cancelado'
    GROUP BY c.id`);
  const spent90 = new Map(all<{ customer_id: number; s: number }>(`SELECT customer_id, SUM(total_cents) s FROM orders
    WHERE status != 'cancelado' AND datetime(created_at) >= datetime('now','-90 days') GROUP BY customer_id`).map((r) => [r.customer_id, r.s]));
  const sorted = [...spent90.values()].sort((a, b) => b - a);
  const vipCut = sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * 0.1) - 1)] : Infinity;
  const month = new Date().getMonth() + 1;

  return rows.map((r) => {
    const days = r.last_order ? Math.floor((Date.now() - new Date(r.last_order).getTime()) / 86400000) : null;
    const seg: Segment[] = [];
    if (r.orders === 0) seg.push("sem_pedido");
    if (r.orders === 1) seg.push("novos");
    if (r.recent60 >= 2) seg.push("recorrentes");
    if ((spent90.get(r.id) ?? 0) >= vipCut && (spent90.get(r.id) ?? 0) > 0) seg.push("vip");
    if (days !== null && days >= 30 && days < 60) seg.push("em_risco");
    if (days !== null && days >= 60) seg.push("sumidos");
    if (r.birthday && Number(r.birthday.slice(5, 7)) === month) seg.push("aniversariantes");
    return { ...r, tags: JSON.parse(r.tags || "[]"), avg: r.orders ? Math.round(r.spent / r.orders) : 0, days_since: days, segments: seg };
  });
}

export function customerDetail(id: number) {
  const stats = customersWithStats().find((c) => c.id === id);
  if (!stats) return null;
  const addresses = all("SELECT a.*, z.name AS zone_name FROM customer_addresses a LEFT JOIN delivery_zones z ON z.id = a.zone_id WHERE customer_id = ?", id);
  const orders = all<{ id: number; code: string; status: string; total_cents: number; created_at: string; type: string; rating: number | null }>(
    "SELECT id, code, status, total_cents, created_at, type, rating FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT 100", id);
  const favorites = all<{ name: string; qty: number }>(`SELECT oi.name, SUM(oi.qty) qty FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.customer_id = ? AND o.status != 'cancelado' GROUP BY oi.name ORDER BY qty DESC LIMIT 5`, id);
  const conv = get<{ id: number }>("SELECT id FROM wa_conversations WHERE phone = ?", stats.phone);
  const messages = conv ? all<{ direction: string; body: string; at: string; internal: number }>(
    "SELECT direction, body, at, internal FROM wa_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 30", conv.id) : [];
  const avgRating = get<{ r: number | null }>("SELECT AVG(rating) r FROM orders WHERE customer_id = ? AND rating IS NOT NULL", id)?.r ?? null;
  return { ...stats, addresses, orders, favorites, conversationId: conv?.id ?? null, messages, avgRating };
}

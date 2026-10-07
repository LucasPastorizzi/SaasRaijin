import "server-only";
import { all, get, nowIso, run, tx } from "./db";

export type CourierRow = {
  id: number; name: string; phone: string; pin: string; vehicle: string; plate: string | null; pix_key: string | null;
  pay_rule: "fixed" | "pct"; pay_value: number; daily_cents: number; active: number; on_shift: number; shift_started_at: string | null;
  last_lat: number | null; last_lng: number | null; last_seen_at: string | null;
};

/** quanto o motoboy recebe por uma entrega */
export function payFor(c: Pick<CourierRow, "pay_rule" | "pay_value">, deliveryFeeCents: number) {
  return c.pay_rule === "pct" ? Math.round((deliveryFeeCents * c.pay_value) / 100) : c.pay_value;
}

/** Entregas concluídas ainda não acertadas + dinheiro recebido em mãos. */
export function settlementPreview(courierId: number) {
  const c = get<CourierRow>("SELECT * FROM couriers WHERE id = ?", courierId);
  if (!c) return null;
  const orders = all<{ id: number; code: string; delivery_fee_cents: number; total_cents: number; payment_method: string; change_for_cents: number | null; delivered_at: string }>(
    `SELECT id, code, delivery_fee_cents, total_cents, payment_method, change_for_cents, delivered_at FROM orders
     WHERE courier_id = ? AND status = 'entregue' AND settlement_id IS NULL ORDER BY delivered_at`, courierId);
  const pay = orders.reduce((s, o) => s + payFor(c, o.delivery_fee_cents), 0) + (orders.length ? c.daily_cents : 0);
  const cash = orders.filter((o) => o.payment_method === "cash").reduce((s, o) => s + o.total_cents, 0);
  // saldo > 0: motoboy devolve à loja; < 0: loja paga ao motoboy
  return { courier: c, orders: orders.map((o) => ({ ...o, pay: payFor(c, o.delivery_fee_cents) })), pay, cash, balance: cash - pay };
}

export function settle(courierId: number, by: string) {
  const p = settlementPreview(courierId);
  if (!p || !p.orders.length) return null;
  return tx(() => {
    const id = Number(run(`INSERT INTO courier_settlements (courier_id, started_at, ended_at, deliveries, pay_cents, cash_collected_cents, balance_cents, settled_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, courierId, p.orders[0].delivered_at, nowIso(), p.orders.length, p.pay, p.cash, p.balance, by).lastInsertRowid);
    run(`UPDATE orders SET settlement_id = ? WHERE id IN (${p.orders.map((o) => o.id).join(",")})`, id);
    return { id, ...p };
  });
}

export function couriersOverview() {
  return all<CourierRow & { open_deliveries: number; today_deliveries: number }>(`SELECT k.*,
      (SELECT COUNT(*) FROM orders o WHERE o.courier_id = k.id AND o.status IN ('aceito','preparo','pronto','saiu')) AS open_deliveries,
      (SELECT COUNT(*) FROM orders o WHERE o.courier_id = k.id AND o.status = 'entregue' AND date(o.delivered_at) = date('now')) AS today_deliveries
    FROM couriers k ORDER BY k.active DESC, k.on_shift DESC, k.name`);
}

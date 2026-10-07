import "server-only";
import { all, get } from "./db";

export function openCashSession() {
  return get<{ id: number; opened_at: string; opened_by: string; opening_cents: number }>("SELECT * FROM cash_sessions WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1") ?? null;
}

/** Totais de um período por forma de pagamento + movimentos de caixa. */
export function cashSummary(sessionId: number) {
  const s = get<{ id: number; opened_at: string; closed_at: string | null; opening_cents: number; counted_cash_cents: number | null }>("SELECT * FROM cash_sessions WHERE id = ?", sessionId);
  if (!s) return null;
  const until = s.closed_at ?? new Date().toISOString();
  const byMethod = all<{ payment_method: string; n: number; total: number }>(`SELECT payment_method, COUNT(*) n, SUM(total_cents) total FROM orders
    WHERE status = 'entregue' AND datetime(delivered_at) >= datetime(?) AND datetime(delivered_at) <= datetime(?) GROUP BY payment_method`, s.opened_at, until);
  const movements = all<{ id: number; type: string; amount_cents: number; note: string | null; by: string | null; at: string }>(
    "SELECT * FROM cash_movements WHERE session_id = ? ORDER BY id", sessionId);
  const courierPaid = get<{ v: number }>("SELECT COALESCE(SUM(pay_cents),0) v FROM courier_settlements WHERE datetime(created_at) >= datetime(?) AND datetime(created_at) <= datetime(?)", s.opened_at, until)!.v;
  const cashIn = byMethod.find((m) => m.payment_method === "cash")?.total ?? 0;
  const sup = movements.filter((m) => m.type === "suprimento").reduce((a, m) => a + m.amount_cents, 0);
  const san = movements.filter((m) => m.type === "sangria").reduce((a, m) => a + m.amount_cents, 0);
  const expectedCash = s.opening_cents + cashIn + sup - san - courierPaid;
  return { session: s, byMethod, movements, courierPaid, expectedCash, gross: byMethod.reduce((a, m) => a + m.total, 0) };
}

export function report(days: number) {
  const since = `-${Math.max(1, Math.min(365, days))} days`;
  const totals = get<{ n: number; gross: number; fees: number; discounts: number }>(`SELECT COUNT(*) n, COALESCE(SUM(total_cents),0) gross,
    COALESCE(SUM(delivery_fee_cents),0) fees, COALESCE(SUM(discount_cents),0) discounts FROM orders
    WHERE status != 'cancelado' AND datetime(created_at) >= datetime('now', ?)`, since)!;
  const canceled = get<{ n: number }>("SELECT COUNT(*) n FROM orders WHERE status = 'cancelado' AND datetime(created_at) >= datetime('now', ?)", since)!.n;
  const byDay = all<{ day: string; n: number; total: number }>(`SELECT date(datetime(created_at, '-3 hours')) day, COUNT(*) n, SUM(total_cents) total FROM orders
    WHERE status != 'cancelado' AND datetime(created_at) >= datetime('now', ?) GROUP BY day ORDER BY day`, since);
  const byWeekday = all<{ wd: string; n: number; total: number }>(`SELECT strftime('%w', datetime(created_at, '-3 hours')) wd, COUNT(*) n, SUM(total_cents) total FROM orders
    WHERE status != 'cancelado' AND datetime(created_at) >= datetime('now', ?) GROUP BY wd ORDER BY wd`, since);
  const topItems = all<{ name: string; qty: number; total: number }>(`SELECT oi.name, SUM(oi.qty) qty, SUM(oi.total_cents) total FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.status != 'cancelado' AND datetime(o.created_at) >= datetime('now', ?) GROUP BY oi.name ORDER BY qty DESC LIMIT 10`, since);
  const byPayment = all<{ payment_method: string; n: number; total: number }>(`SELECT payment_method, COUNT(*) n, SUM(total_cents) total FROM orders
    WHERE status != 'cancelado' AND datetime(created_at) >= datetime('now', ?) GROUP BY payment_method`, since);
  const timing = get<{ prep: number | null; delivery: number | null }>(`SELECT
    AVG((julianday(ready_at) - julianday(accepted_at)) * 1440) prep,
    AVG((julianday(delivered_at) - julianday(created_at)) * 1440) delivery
    FROM orders WHERE status = 'entregue' AND datetime(created_at) >= datetime('now', ?)`, since)!;
  const repeat = get<{ total: number; repeat: number }>(`SELECT COUNT(*) total, SUM(CASE WHEN n > 1 THEN 1 ELSE 0 END) repeat FROM
    (SELECT customer_id, COUNT(*) n FROM orders WHERE status != 'cancelado' AND datetime(created_at) >= datetime('now', ?) GROUP BY customer_id)`, since)!;
  const coupons = all<{ coupon_code: string; n: number; discount: number }>(`SELECT coupon_code, COUNT(*) n, SUM(discount_cents) discount FROM orders
    WHERE coupon_code IS NOT NULL AND status != 'cancelado' AND datetime(created_at) >= datetime('now', ?) GROUP BY coupon_code`, since);
  const rating = get<{ r: number | null; n: number }>("SELECT AVG(rating) r, COUNT(rating) n FROM orders WHERE rating IS NOT NULL AND datetime(created_at) >= datetime('now', ?)", since)!;
  return { totals, canceled, avgTicket: totals.n ? Math.round(totals.gross / totals.n) : 0, byDay, byWeekday, topItems, byPayment, timing, repeat, coupons, rating };
}

import { z } from "zod";
import { api, body } from "@/lib/server/api";
import { all, nowIso, run } from "@/lib/server/db";
import { settlementPreview } from "@/lib/server/couriers";
import { HttpError, requireCourier } from "@/lib/server/session";

export const GET = api(async () => {
  const c = await requireCourier();
  const deliveries = all<Record<string, unknown> & { address: string | null }>(`SELECT o.id, o.code, o.status, o.total_cents, o.payment_method, o.payment_status, o.change_for_cents,
      o.address, o.notes, o.created_at, o.dispatched_at, o.eta_minutes, cu.name AS customer_name, cu.phone AS customer_phone,
      (SELECT SUM(qty) FROM order_items WHERE order_id = o.id) AS items
    FROM orders o JOIN customers cu ON cu.id = o.customer_id
    WHERE o.courier_id = ? AND o.status IN ('aceito','preparo','pronto','saiu') ORDER BY o.id`, c.id)
    .map((d) => ({ ...d, address: d.address ? JSON.parse(d.address) : null }));
  const summary = settlementPreview(c.id);
  return {
    courier: { id: c.id, name: c.name, on_shift: !!c.on_shift, shift_started_at: c.shift_started_at },
    deliveries,
    summary: summary && { deliveries: summary.orders.length, pay: summary.pay, cash: summary.cash, balance: summary.balance },
  };
});

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("shift"), on: z.boolean() }),
  z.object({ action: z.literal("location"), lat: z.number(), lng: z.number() }),
]);

export const POST = api(async (req) => {
  const c = await requireCourier();
  const a = await body(req, action);
  if (a.action === "shift") {
    if (!a.on) {
      const open = all("SELECT id FROM orders WHERE courier_id = ? AND status = 'saiu'", c.id);
      if (open.length) throw new HttpError(409, "Finalize as entregas em rota antes de encerrar o turno");
    }
    run("UPDATE couriers SET on_shift = ?, shift_started_at = ? WHERE id = ?", a.on ? 1 : 0, a.on ? nowIso() : null, c.id);
  } else {
    run("UPDATE couriers SET last_lat = ?, last_lng = ?, last_seen_at = ? WHERE id = ?", a.lat, a.lng, nowIso(), c.id);
  }
  return { ok: true };
});

import { z } from "zod";
import { api, body } from "@/lib/server/api";
import { get, nowIso, run } from "@/lib/server/db";
import { orderDetail } from "@/lib/server/orders";
import { currentCustomer, currentStaff, HttpError } from "@/lib/server/session";

async function load(code: string) {
  const o = orderDetail("code", code);
  if (!o) throw new HttpError(404, "Pedido não encontrado");
  const [c, s] = await Promise.all([currentCustomer(), currentStaff()]);
  if (!s && c?.id !== o.customer_id) throw new HttpError(403, "Esse pedido é de outra conta");
  return o;
}

export const GET = api<{ code: string }>(async (_req, ctx) => {
  const o = await load((await ctx.params).code);
  const courier = o.courier_id ? get<{ name: string; vehicle: string; last_lat: number | null; last_lng: number | null; last_seen_at: string | null }>(
    "SELECT name, vehicle, last_lat, last_lng, last_seen_at FROM couriers WHERE id = ?", o.courier_id) : null;
  return { ...o, courier };
});

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("review"), rating: z.number().int().min(1).max(5), comment: z.string().max(500).optional() }),
  z.object({ action: z.literal("pay-dev") }),
]);

export const POST = api<{ code: string }>(async (req, ctx) => {
  const o = await load((await ctx.params).code);
  const a = await body(req, action);
  if (a.action === "review") {
    if (o.status !== "entregue") throw new HttpError(409, "Dá pra avaliar depois da entrega");
    run("UPDATE orders SET rating = ?, rating_comment = ? WHERE id = ?", a.rating, a.comment ?? null, o.id);
    return { ok: true };
  }
  // Simula a confirmação do Pix (em produção quem faz isso é o webhook do gateway).
  if (process.env.NODE_ENV === "production") throw new HttpError(404, "Indisponível");
  run("UPDATE orders SET payment_status = 'pago' WHERE id = ?", o.id);
  run("INSERT INTO order_events (order_id, status, note, by, at) VALUES (?, 'pagamento', 'Pix confirmado', 'gateway', ?)", o.id, nowIso());
  return { ok: true };
});

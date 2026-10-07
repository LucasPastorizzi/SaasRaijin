import { z } from "zod";
import { api, body, idParam } from "@/lib/server/api";
import { nowIso, run } from "@/lib/server/db";
import { assignCourier, orderDetail, setStatus } from "@/lib/server/orders";
import { HttpError, requireStaff } from "@/lib/server/session";

export const GET = api<{ id: string }>(async (_req, ctx) => {
  await requireStaff();
  const o = orderDetail("id", await idParam(ctx));
  if (!o) throw new HttpError(404, "Pedido não encontrado");
  return o;
});

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), to: z.enum(["aceito", "preparo", "pronto", "saiu", "entregue", "cancelado"]), eta: z.number().int().min(5).max(180).optional(), reason: z.string().max(200).optional() }),
  z.object({ action: z.literal("assign"), courierId: z.number().int().nullable() }),
  z.object({ action: z.literal("paid") }),
]);

export const PATCH = api<{ id: string }>(async (req, ctx) => {
  const s = await requireStaff();
  const id = await idParam(ctx);
  const a = await body(req, action);
  if (a.action === "status") {
    if (a.to === "cancelado" && !a.reason) throw new HttpError(400, "Informe o motivo do cancelamento");
    await setStatus(id, a.to, s.name, { eta: a.eta, reason: a.reason });
  } else if (a.action === "assign") {
    assignCourier(id, a.courierId, s.name);
  } else {
    run("UPDATE orders SET payment_status = 'pago' WHERE id = ?", id);
    run("INSERT INTO order_events (order_id, status, note, by, at) VALUES (?, 'pagamento', 'Marcado como pago', ?, ?)", id, s.name, nowIso());
  }
  return orderDetail("id", id);
});

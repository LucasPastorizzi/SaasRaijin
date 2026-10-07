import { z } from "zod";
import { api, body, idParam } from "@/lib/server/api";
import { get, nowIso, run } from "@/lib/server/db";
import { setStatus } from "@/lib/server/orders";
import { HttpError, requireCourier } from "@/lib/server/session";

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pickup") }),
  z.object({ action: z.literal("arrived") }),
  z.object({ action: z.literal("deliver"), pin: z.string().length(4, "Código de 4 dígitos") }),
  z.object({ action: z.literal("issue"), kind: z.enum(["ausente", "endereco", "recusado", "outro"]), note: z.string().max(300).optional() }),
]);

export const POST = api<{ id: string }>(async (req, ctx) => {
  const c = await requireCourier();
  const id = await idParam(ctx);
  const o = get<{ status: string; courier_id: number; delivery_pin: string }>("SELECT status, courier_id, delivery_pin FROM orders WHERE id = ?", id);
  if (!o || o.courier_id !== c.id) throw new HttpError(404, "Entrega não encontrada");
  const a = await body(req, action);
  const by = `motoboy:${c.name}`;
  switch (a.action) {
    case "pickup":
      if (o.status !== "pronto") throw new HttpError(409, "O pedido ainda não está pronto na cozinha");
      await setStatus(id, "saiu", by);
      break;
    case "arrived":
      run("INSERT INTO order_events (order_id, status, note, by, at) VALUES (?, 'chegou', 'Motoboy chegou no endereço', ?, ?)", id, by, nowIso());
      break;
    case "deliver":
      if (o.status !== "saiu") throw new HttpError(409, "Marque que saiu para entrega primeiro");
      if (a.pin !== o.delivery_pin) throw new HttpError(400, "Código de entrega não confere");
      await setStatus(id, "entregue", by);
      break;
    case "issue":
      run("INSERT INTO order_events (order_id, status, note, by, at) VALUES (?, 'ocorrencia', ?, ?, ?)", id, `${a.kind}${a.note ? `: ${a.note}` : ""}`, by, nowIso());
      break;
  }
  return { ok: true };
});

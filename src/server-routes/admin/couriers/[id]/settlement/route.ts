import { api, idParam } from "@/lib/server/api";
import { audit } from "@/lib/server/db";
import { settle, settlementPreview } from "@/lib/server/couriers";
import { HttpError, requireStaff } from "@/lib/server/session";

// Acerto do turno do motoboy: entregas não acertadas, valor a pagar e dinheiro recebido.
export const GET = api<{ id: string }>(async (_req, ctx) => {
  await requireStaff();
  const p = settlementPreview(await idParam(ctx));
  if (!p) throw new HttpError(404, "Motoboy não encontrado");
  return p;
});

export const POST = api<{ id: string }>(async (_req, ctx) => {
  const s = await requireStaff("gerente");
  const r = settle(await idParam(ctx), s.name);
  if (!r) throw new HttpError(409, "Nenhuma entrega para acertar");
  audit(s.email, "motoboy.acerto", { settlement: r.id, pay: r.pay, cash: r.cash });
  return r;
});

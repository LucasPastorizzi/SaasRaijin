import { z } from "zod";
import { api, body } from "@/lib/server/api";
import { get } from "@/lib/server/db";
import { isStrictProd } from "@/lib/server/env";
import { endSession, HttpError, startSession } from "@/lib/server/session";
import { normPhone } from "@/lib/format";

export const GET = api(() => ({ demo: !isStrictProd() }));

const schema = z.union([
  z.object({ phone: z.string().min(10, "Telefone"), pin: z.string().min(4, "PIN") }),
  z.object({ demo: z.literal(true) }),
]);

export const POST = api(async (req) => {
  const input = await body(req, schema);
  if ("demo" in input) {
    if (isStrictProd()) throw new HttpError(404, "Indisponível");
    const c = get<{ id: number }>("SELECT id FROM couriers WHERE active = 1 ORDER BY id LIMIT 1");
    if (!c) throw new HttpError(404, "Nenhum motoboy cadastrado");
    await startSession("courier", c.id);
    return { ok: true };
  }
  const c = get<{ id: number; pin: string }>("SELECT id, pin FROM couriers WHERE phone = ? AND active = 1", normPhone(input.phone));
  if (!c || c.pin !== input.pin) throw new HttpError(401, "Telefone ou PIN incorretos");
  await startSession("courier", c.id);
  return { ok: true };
});

export const DELETE = api(async () => {
  await endSession("courier");
  return { ok: true };
});

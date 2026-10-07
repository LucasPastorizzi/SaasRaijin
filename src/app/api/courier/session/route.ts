import { z } from "zod";
import { api, body } from "@/lib/server/api";
import { get } from "@/lib/server/db";
import { endSession, HttpError, startSession } from "@/lib/server/session";
import { normPhone } from "@/lib/format";

export const POST = api(async (req) => {
  const { phone, pin } = await body(req, z.object({ phone: z.string().min(10, "Telefone"), pin: z.string().min(4, "PIN") }));
  const c = get<{ id: number; pin: string }>("SELECT id, pin FROM couriers WHERE phone = ? AND active = 1", normPhone(phone));
  if (!c || c.pin !== pin) throw new HttpError(401, "Telefone ou PIN incorretos");
  await startSession("courier", c.id);
  return { ok: true };
});

export const DELETE = api(async () => {
  await endSession("courier");
  return { ok: true };
});

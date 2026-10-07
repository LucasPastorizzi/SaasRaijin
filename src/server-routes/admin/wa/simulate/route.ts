import { z } from "zod";
import { api, body } from "@/lib/server/api";
import { HttpError, requireStaff } from "@/lib/server/session";
import { receiveWhatsApp } from "@/lib/server/whatsapp";
import { normPhone } from "@/lib/format";
import { isStrictProd } from "@/lib/server/env";

// Simulador: injeta uma mensagem "recebida" como se viesse do cliente. Só fora de produção.
export const POST = api(async (req) => {
  await requireStaff();
  if (isStrictProd() && process.env.WHATSAPP_TOKEN) throw new HttpError(404, "Indisponível");
  const { phone, text } = await body(req, z.object({ phone: z.string().min(10), text: z.string().min(1).max(2000) }));
  await receiveWhatsApp(normPhone(phone), text);
  return { ok: true };
});

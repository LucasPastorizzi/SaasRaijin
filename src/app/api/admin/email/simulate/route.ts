import { z } from "zod";
import { api, body } from "@/lib/server/api";
import { emailConfig, simulateIncoming } from "@/lib/server/email";
import { HttpError, requireStaff } from "@/lib/server/session";

// Simulador de e-mail recebido — só quando o IMAP não está configurado.
export const POST = api(async (req) => {
  await requireStaff();
  if (emailConfig().imap) throw new HttpError(404, "Indisponível com e-mail real configurado");
  const m = await body(req, z.object({ from: z.email(), name: z.string().max(80).default(""), subject: z.string().min(1), text: z.string().min(1) }));
  simulateIncoming(m.from, m.name, m.subject, m.text);
  return { ok: true };
});

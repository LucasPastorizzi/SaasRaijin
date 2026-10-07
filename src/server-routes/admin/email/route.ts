import { z } from "zod";
import { api, body } from "@/lib/server/api";
import { audit } from "@/lib/server/db";
import { emailConfig, listEmails, sendEmail, syncInbox, unreadCount } from "@/lib/server/email";
import { HttpError, requireStaff } from "@/lib/server/session";

export const GET = api(async (req) => {
  await requireStaff();
  const u = new URL(req.url).searchParams;
  if (u.get("count") === "1") return { unread: unreadCount() };
  let syncError: string | null = null;
  if (u.get("sync") === "1") {
    try { await syncInbox(); } catch (e) { syncError = `Não consegui ler a caixa de entrada: ${(e as Error).message}`; }
  }
  const folder = u.get("folder") === "enviados" ? "enviados" : "entrada";
  return { emails: listEmails(folder, u.get("q") || undefined, u.get("unread") === "1"), unread: unreadCount(), config: emailConfig(), syncError };
});

const schema = z.object({
  to: z.string().min(3).refine((s) => s.split(",").every((x) => z.email().safeParse(x.trim()).success), "E-mail do destinatário inválido"),
  cc: z.string().optional(),
  subject: z.string().min(1, "Assunto").max(300),
  text: z.string().min(1, "Escreva a mensagem").max(50_000),
  inReplyToId: z.number().int().optional(),
});

export const POST = api(async (req) => {
  const s = await requireStaff("gerente", "atendente");
  const m = await body(req, schema);
  const r = await sendEmail({ ...m, author: s.name });
  if (r.status === "falhou") throw new HttpError(502, "O servidor de e-mail recusou o envio. Confira as configurações SMTP.");
  audit(s.email, "email.enviar", { to: m.to, subject: m.subject, status: r.status });
  return r;
});

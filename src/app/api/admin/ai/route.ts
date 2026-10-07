import { z } from "zod";
import { api, body } from "@/lib/server/api";
import { audit } from "@/lib/server/db";
import { AiNotConfigured, askAssistant } from "@/lib/server/ai";
import { HttpError, requireStaff } from "@/lib/server/session";

// Assistente de IA do painel — só gerente e admin (acessa relatórios e dados de clientes).
const schema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) })).min(1).max(40)
    .refine((m) => m[m.length - 1].role === "user", "A última mensagem precisa ser do usuário"),
});

export const POST = api(async (req) => {
  const s = await requireStaff("gerente");
  const { messages } = await body(req, schema);
  try {
    const r = await askAssistant(messages);
    audit(s.email, "ia.pergunta", { pergunta: messages[messages.length - 1].content.slice(0, 300), ferramentas: r.toolsUsed, uso: r.usage });
    return r;
  } catch (e) {
    if (e instanceof AiNotConfigured) throw new HttpError(503, "Assistente não configurado: defina ANTHROPIC_API_KEY no .env.local e reinicie o app.");
    throw e;
  }
});

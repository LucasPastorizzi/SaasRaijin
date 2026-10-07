import { z } from "zod";
import { api, body } from "@/lib/server/api";
import { audit } from "@/lib/server/db";
import { customersWithStats, type Segment } from "@/lib/server/crm";
import { requireStaff } from "@/lib/server/session";
import { sendWhatsApp } from "@/lib/server/whatsapp";

// Campanha simples para um segmento — só clientes com opt-in de marketing (LGPD).
// Em produção, campanhas fora da janela de 24 h exigem TEMPLATE aprovado pela Meta.
const schema = z.object({
  segment: z.string(),
  text: z.string().min(5, "Escreva a mensagem").max(1000),
  preview: z.boolean().optional(),
});

export const POST = api(async (req) => {
  const s = await requireStaff("gerente");
  const { segment, text, preview } = await body(req, schema);
  const target = customersWithStats().filter((c) => c.marketing_opt_in && (segment === "todos" || c.segments.includes(segment as Segment)));
  if (preview) return { count: target.length };
  for (const c of target) {
    const msg = text.replaceAll("{nome}", c.name?.split(" ")[0] ?? "").trim() + "\n\nPra não receber mais promoções, responda PARAR.";
    await sendWhatsApp(c.phone, msg, { kind: "template", author: `campanha:${s.name}` });
  }
  audit(s.email, "campanha.enviar", { segment, count: target.length });
  return { sent: target.length };
});

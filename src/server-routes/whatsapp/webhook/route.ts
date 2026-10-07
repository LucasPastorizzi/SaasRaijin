import crypto from "node:crypto";
import { connection } from "next/server";
import { run } from "@/lib/server/db";
import { receiveWhatsApp } from "@/lib/server/whatsapp";

// Webhook da WhatsApp Cloud API.
// GET: verificação (hub.challenge). POST: mensagens recebidas e status (enviada/entregue/lida).

export async function GET(req: Request) {
  await connection();
  const u = new URL(req.url).searchParams;
  if (u.get("hub.mode") === "subscribe" && u.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(u.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

type WebhookBody = {
  entry?: { changes?: { value?: {
    messages?: { from: string; id: string; type: string; text?: { body: string }; interactive?: { button_reply?: { title: string }; list_reply?: { title: string } } }[];
    statuses?: { id: string; status: string }[];
  } }[] }[];
};

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (secret) {
    const sig = req.headers.get("x-hub-signature-256") ?? "";
    const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return new Response("bad signature", { status: 401 });
  }
  const data = JSON.parse(raw) as WebhookBody;
  for (const e of data.entry ?? []) for (const ch of e.changes ?? []) {
    for (const m of ch.value?.messages ?? []) {
      const text = m.text?.body ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? `[${m.type}]`;
      await receiveWhatsApp("+" + m.from, text, m.id);
    }
    for (const st of ch.value?.statuses ?? []) {
      const label = { sent: "enviada", delivered: "entregue", read: "lida", failed: "falhou" }[st.status] ?? st.status;
      run("UPDATE wa_messages SET status = ? WHERE wa_id = ?", label, st.id);
    }
  }
  return Response.json({ ok: true });
}

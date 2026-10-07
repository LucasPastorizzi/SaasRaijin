import { api } from "@/lib/server/api";
import { get } from "@/lib/server/db";
import { requireStaff } from "@/lib/server/session";
import { listConversations, WA_LIVE } from "@/lib/server/whatsapp";

export const GET = api(async (req) => {
  await requireStaff();
  const filter = new URL(req.url).searchParams.get("filter") || "abertas";
  const unread = get<{ n: number }>("SELECT COALESCE(SUM(unread),0) n FROM wa_conversations WHERE status = 'aberta'")!.n;
  return { conversations: listConversations(filter), unread, live: WA_LIVE };
});

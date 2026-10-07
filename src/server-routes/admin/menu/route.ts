import { api } from "@/lib/server/api";
import { all } from "@/lib/server/db";
import { loadMenu } from "@/lib/server/menu";
import { requireStaff } from "@/lib/server/session";

export const GET = api(async () => {
  await requireStaff();
  const menu = loadMenu({ includeHidden: true });
  const priceHistory = all(`SELECT h.*, p.name FROM price_history h JOIN products p ON p.id = h.product_id ORDER BY h.id DESC LIMIT 50`);
  return { ...menu, priceHistory };
});

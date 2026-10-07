import { api } from "@/lib/server/api";
import { report } from "@/lib/server/finance";
import { requireStaff } from "@/lib/server/session";

export const GET = api(async (req) => {
  await requireStaff("gerente");
  const days = Number(new URL(req.url).searchParams.get("days") || 30);
  return report(days);
});

import { api } from "@/lib/server/api";
import { customersWithStats, SEGMENTS, type Segment } from "@/lib/server/crm";
import { requireStaff } from "@/lib/server/session";
import { fold } from "@/lib/format";

export const GET = api(async (req) => {
  await requireStaff();
  const url = new URL(req.url);
  const segment = (url.searchParams.get("segment") || "todos") as Segment;
  const q = fold(url.searchParams.get("q") || "");
  const sort = url.searchParams.get("sort") || "last";
  const all = customersWithStats();
  const counts = Object.fromEntries(Object.keys(SEGMENTS).map((k) => [k, k === "todos" ? all.length : all.filter((c) => c.segments.includes(k as Segment)).length]));
  let list = segment === "todos" ? all : all.filter((c) => c.segments.includes(segment));
  if (q) list = list.filter((c) => fold(`${c.name ?? ""} ${c.phone} ${c.tags.join(" ")}`).includes(q));
  list.sort((a, b) => sort === "spent" ? b.spent - a.spent : sort === "orders" ? b.orders - a.orders : (b.last_order ?? "").localeCompare(a.last_order ?? ""));
  return { customers: list.slice(0, 500), counts, segments: SEGMENTS };
});

import { api, body } from "@/lib/server/api";
import { createOrder, orderSchema } from "@/lib/server/orders";
import { requireCustomer } from "@/lib/server/session";

export const POST = api(async (req) => {
  const c = await requireCustomer();
  const input = await body(req, orderSchema);
  return createOrder(input, c.id, "app");
});

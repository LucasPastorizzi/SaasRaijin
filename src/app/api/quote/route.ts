import { api, body } from "@/lib/server/api";
import { orderSchema, quoteOrder } from "@/lib/server/orders";
import { currentCustomer } from "@/lib/server/session";

// Calcula subtotal, taxa, desconto e total no servidor (o checkout mostra este valor).
export const POST = api(async (req) => {
  const input = await body(req, orderSchema);
  return quoteOrder(input, await currentCustomer());
});

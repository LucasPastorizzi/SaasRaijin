import { z } from "zod";
import { api, body } from "@/lib/server/api";
import { get, run } from "@/lib/server/db";
import { activeOrders, createOrder, orderSchema } from "@/lib/server/orders";
import { requireStaff } from "@/lib/server/session";
import { normPhone } from "@/lib/format";

export const GET = api(async () => {
  await requireStaff();
  return { orders: activeOrders() };
});

// Pedido manual (telefone, balcão ou WhatsApp) criado pela equipe.
const manual = orderSchema.extend({
  phone: z.string().min(10, "Telefone do cliente"),
  name: z.string().min(2, "Nome do cliente"),
  channel: z.enum(["telefone", "balcao", "whatsapp"]),
});

export const POST = api(async (req) => {
  const s = await requireStaff("gerente", "atendente");
  const input = await body(req, manual);
  const phone = normPhone(input.phone);
  let c = get<{ id: number }>("SELECT id FROM customers WHERE phone = ?", phone);
  if (!c) c = { id: Number(run("INSERT INTO customers (phone, name) VALUES (?, ?)", phone, input.name).lastInsertRowid) };
  return createOrder(input, c.id, input.channel, s.name);
});

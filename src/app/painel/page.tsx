import type { Metadata } from "next";
import { OrdersBoard } from "@/components/painel/orders-board";

export const metadata: Metadata = { title: "Pedidos" };

export default function Page() {
  return <OrdersBoard />;
}

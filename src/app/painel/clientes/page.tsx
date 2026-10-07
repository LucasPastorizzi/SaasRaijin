import type { Metadata } from "next";
import { CustomersList } from "@/components/painel/crm";

export const metadata: Metadata = { title: "Clientes" };

export default function Page() {
  return <CustomersList />;
}

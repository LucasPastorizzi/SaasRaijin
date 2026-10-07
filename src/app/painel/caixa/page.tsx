import type { Metadata } from "next";
import { CashAdmin } from "@/components/painel/ops";

export const metadata: Metadata = { title: "Caixa" };

export default function Page() {
  return <CashAdmin />;
}

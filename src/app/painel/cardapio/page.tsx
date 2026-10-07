import type { Metadata } from "next";
import { MenuAdmin } from "@/components/painel/menu-admin";

export const metadata: Metadata = { title: "Cardápio" };

export default function Page() {
  return <MenuAdmin />;
}

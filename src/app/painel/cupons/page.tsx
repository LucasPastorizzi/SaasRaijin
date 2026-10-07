import type { Metadata } from "next";
import { CouponsAdmin } from "@/components/painel/ops";

export const metadata: Metadata = { title: "Cupons" };

export default function Page() {
  return <CouponsAdmin />;
}

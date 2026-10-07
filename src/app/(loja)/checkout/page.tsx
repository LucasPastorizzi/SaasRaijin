import type { Metadata } from "next";
import { Checkout } from "@/components/checkout";

export const metadata: Metadata = { title: "Carrinho" };

export default function Page() {
  return <Checkout />;
}

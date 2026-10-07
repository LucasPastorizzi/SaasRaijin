import type { Metadata } from "next";
import { CouriersAdmin } from "@/components/painel/couriers-admin";

export const metadata: Metadata = { title: "Motoboys" };

export default function Page() {
  return <CouriersAdmin />;
}

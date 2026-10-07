import type { Metadata } from "next";
import { Account } from "@/components/account";

export const metadata: Metadata = { title: "Minha conta" };

export default function Page() {
  return <Account />;
}

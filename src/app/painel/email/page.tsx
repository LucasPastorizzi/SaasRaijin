import type { Metadata } from "next";
import { MailClient } from "@/components/painel/mail";

export const metadata: Metadata = { title: "E-mail" };

export default function Page() {
  return <MailClient />;
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { Inbox } from "@/components/painel/inbox";

export const metadata: Metadata = { title: "WhatsApp" };

export default function Page() {
  return (
    <Suspense>
      <Inbox />
    </Suspense>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { PanelShell } from "@/components/painel/shell";

export const metadata: Metadata = { title: { default: "Painel", template: "%s · Painel Raijin" }, robots: { index: false } };

export default function PainelLayout({ children }: LayoutProps<"/painel">) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-paper" />}>
      <PanelShell>{children}</PanelShell>
    </Suspense>
  );
}

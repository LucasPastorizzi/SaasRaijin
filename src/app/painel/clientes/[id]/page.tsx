import { Suspense } from "react";
import { CustomerDetail } from "@/components/painel/crm";

export default function Page() {
  return (
    <Suspense>
      <CustomerDetail />
    </Suspense>
  );
}

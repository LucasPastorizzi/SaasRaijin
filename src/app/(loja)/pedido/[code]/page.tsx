import { Suspense } from "react";
import { Tracking } from "@/components/tracking";

export default function Page() {
  return (
    <Suspense>
      <Tracking />
    </Suspense>
  );
}

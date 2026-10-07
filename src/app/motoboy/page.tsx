import type { Metadata } from "next";
import { CourierApp } from "@/components/courier-app";

export const metadata: Metadata = { title: "App do motoboy", robots: { index: false } };

export default function Page() {
  return <CourierApp />;
}

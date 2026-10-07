import { api } from "@/lib/server/api";
import { all, getSetting } from "@/lib/server/db";
import { bestSellers, loadMenu } from "@/lib/server/menu";
import { DEFAULT_SETTINGS } from "@/lib/server/seed";
import { openStatus } from "@/lib/hours";
import { isStrictProd } from "@/lib/server/env";

export const GET = api(() => {
  const { categories, products } = loadMenu();
  const hours = getSetting("hours", DEFAULT_SETTINGS.hours);
  const ops = getSetting("ops", DEFAULT_SETTINGS.ops);
  return {
    store: getSetting("store", DEFAULT_SETTINGS.store),
    hours,
    ops: { minOrderCents: ops.minOrderCents, deliveryBaseMinutes: ops.deliveryBaseMinutes, allowScheduling: ops.allowScheduling, pickupEnabled: ops.pickupEnabled },
    status: openStatus(hours, ops.forceClosed),
    payments: getSetting("payments", DEFAULT_SETTINGS.payments),
    loyalty: getSetting("loyalty", DEFAULT_SETTINGS.loyalty),
    zones: all("SELECT id, name, fee_cents, extra_minutes FROM delivery_zones WHERE active = 1 ORDER BY sort, name"),
    categories,
    products,
    bestSellers: bestSellers(),
    demo: !isStrictProd(),
  };
});

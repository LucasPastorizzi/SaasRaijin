import { z } from "zod";
import { api, body } from "@/lib/server/api";
import { all, audit, getSetting, run, setSetting, tx } from "@/lib/server/db";
import { DEFAULT_SETTINGS } from "@/lib/server/seed";
import { requireStaff } from "@/lib/server/session";
import { WA_LIVE } from "@/lib/server/whatsapp";

export const GET = api(async () => {
  await requireStaff();
  return {
    ...Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((k) => [k, getSetting(k, DEFAULT_SETTINGS[k as keyof typeof DEFAULT_SETTINGS])])),
    zones: all("SELECT * FROM delivery_zones ORDER BY sort, name"),
    integrations: { whatsapp: WA_LIVE, payments: Boolean(process.env.PAYMENT_PROVIDER), site: process.env.NEXT_PUBLIC_SITE_URL ?? null },
  };
});

const hours = z.record(z.string(), z.array(z.tuple([z.number().min(0).max(24), z.number().min(0).max(30)])));
const schema = z.object({
  store: z.object({ name: z.string(), tagline: z.string(), phone: z.string(), address: z.string(), instagram: z.string() }).optional(),
  hours: hours.optional(),
  ops: z.object({ minOrderCents: z.number().int(), prepMinutes: z.number().int(), deliveryBaseMinutes: z.number().int(), forceClosed: z.boolean(),
    autoPrint: z.boolean(), allowScheduling: z.boolean(), pickupEnabled: z.boolean() }).optional(),
  payments: z.object({ pix: z.boolean(), card_online: z.boolean(), cash: z.boolean(), card_machine: z.boolean() }).optional(),
  loyalty: z.object({ enabled: z.boolean(), everyCents: z.number().int().min(100), rewardCents: z.number().int().min(0) }).optional(),
  messages: z.record(z.string(), z.string().max(1000)).optional(),
  zones: z.array(z.object({ id: z.number().int().optional(), name: z.string().min(2), fee_cents: z.number().int().min(0), extra_minutes: z.number().int().min(0), active: z.boolean() })).optional(),
});

export const PUT = api(async (req) => {
  const s = await requireStaff("gerente");
  const p = await body(req, schema);
  tx(() => {
    for (const k of ["store", "hours", "ops", "payments", "loyalty", "messages"] as const) if (p[k]) setSetting(k, p[k]);
    if (p.zones) {
      const keep = p.zones.filter((z) => z.id).map((z) => z.id);
      // zonas removidas são desativadas (pedidos antigos referenciam o id)
      run(`UPDATE delivery_zones SET active = 0${keep.length ? ` WHERE id NOT IN (${keep.join(",")})` : ""}`);
      p.zones.forEach((z, i) => {
        if (z.id) run("UPDATE delivery_zones SET name = ?, fee_cents = ?, extra_minutes = ?, active = ?, sort = ? WHERE id = ?", z.name, z.fee_cents, z.extra_minutes, z.active ? 1 : 0, i, z.id);
        else run("INSERT INTO delivery_zones (name, fee_cents, extra_minutes, active, sort) VALUES (?, ?, ?, ?, ?)", z.name, z.fee_cents, z.extra_minutes, z.active ? 1 : 0, i);
      });
    }
  });
  audit(s.email, "config.salvar", Object.keys(p));
  return { ok: true };
});

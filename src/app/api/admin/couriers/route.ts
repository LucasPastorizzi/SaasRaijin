import { z } from "zod";
import { api, body } from "@/lib/server/api";
import { all, audit, get, run } from "@/lib/server/db";
import { couriersOverview } from "@/lib/server/couriers";
import { HttpError, requireStaff } from "@/lib/server/session";
import { normPhone } from "@/lib/format";

const courierSchema = z.object({
  name: z.string().min(2, "Nome do motoboy"),
  phone: z.string().min(10, "WhatsApp do motoboy"),
  pin: z.string().regex(/^\d{4,6}$/, "PIN de 4 a 6 números"),
  vehicle: z.enum(["moto", "carro", "bike"]).default("moto"),
  plate: z.string().max(10).nullable().optional(),
  pix_key: z.string().max(120).nullable().optional(),
  pay_rule: z.enum(["fixed", "pct"]),
  pay_value: z.number().int().min(0),
  daily_cents: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
});

export const GET = api(async () => {
  await requireStaff();
  const settlements = all(`SELECT s.*, k.name FROM courier_settlements s JOIN couriers k ON k.id = s.courier_id ORDER BY s.id DESC LIMIT 30`);
  return { couriers: couriersOverview(), settlements };
});

export const POST = api(async (req) => {
  const s = await requireStaff("gerente");
  const c = await body(req, courierSchema);
  const phone = normPhone(c.phone);
  if (get("SELECT id FROM couriers WHERE phone = ?", phone)) throw new HttpError(409, "Já existe motoboy com esse telefone");
  const id = Number(run(`INSERT INTO couriers (name, phone, pin, vehicle, plate, pix_key, pay_rule, pay_value, daily_cents, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    c.name, phone, c.pin, c.vehicle, c.plate ?? null, c.pix_key ?? null, c.pay_rule, c.pay_value, c.daily_cents, c.active ? 1 : 0).lastInsertRowid);
  audit(s.email, "motoboy.criar", { id, name: c.name });
  return { id };
});

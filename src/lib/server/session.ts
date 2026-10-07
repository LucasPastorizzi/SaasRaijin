import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { get } from "./db";
import { isStrictProd } from "./env";

// Sessões em cookie assinado (HMAC). Três "portas": cliente, equipe e motoboy.
type Kind = "customer" | "staff" | "courier";
const COOKIE: Record<Kind, string> = { customer: "rj_c", staff: "rj_s", courier: "rj_m" };
const TTL: Record<Kind, number> = { customer: 60 * 60 * 24 * 90, staff: 60 * 60 * 12, courier: 60 * 60 * 16 };

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s && isStrictProd()) throw new Error("Defina SESSION_SECRET nas variáveis de ambiente");
  return s || "dev-only-secret-troque-em-producao";
}

const sign = (data: string) => crypto.createHmac("sha256", secret()).update(data).digest("base64url");

function encode(payload: object) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}
function decode<T>(token: string | undefined): T | null {
  if (!token) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const ok = sign(data);
  if (ok.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(ok), Buffer.from(sig))) return null;
  const p = JSON.parse(Buffer.from(data, "base64url").toString()) as T & { exp: number };
  return p.exp > Date.now() ? p : null;
}

export async function startSession(kind: Kind, id: number) {
  const jar = await cookies();
  jar.set(COOKIE[kind], encode({ id, exp: Date.now() + TTL[kind] * 1000 }), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: TTL[kind],
  });
}
export async function endSession(kind: Kind) {
  (await cookies()).delete(COOKIE[kind]);
}
async function sessionId(kind: Kind) {
  const p = decode<{ id: number }>((await cookies()).get(COOKIE[kind])?.value);
  return p?.id ?? null;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export type Staff = { id: number; name: string; email: string; role: "admin" | "gerente" | "atendente" | "cozinha" };
export async function currentStaff() {
  const id = await sessionId("staff");
  return id ? (get<Staff>("SELECT id, name, email, role FROM staff WHERE id = ? AND active = 1", id) ?? null) : null;
}
export async function requireStaff(...roles: Staff["role"][]) {
  const s = await currentStaff();
  if (!s) throw new HttpError(401, "Faça login no painel");
  if (roles.length && s.role !== "admin" && !roles.includes(s.role)) throw new HttpError(403, "Sem permissão para esta ação");
  return s;
}

export type Customer = { id: number; phone: string; name: string | null; email: string | null; loyalty_cents: number; marketing_opt_in: number };
export async function currentCustomer() {
  const id = await sessionId("customer");
  return id ? (get<Customer>("SELECT id, phone, name, email, loyalty_cents, marketing_opt_in FROM customers WHERE id = ?", id) ?? null) : null;
}
export async function requireCustomer() {
  const c = await currentCustomer();
  if (!c) throw new HttpError(401, "Entre com teu WhatsApp para continuar");
  return c;
}

export type Courier = { id: number; name: string; phone: string; on_shift: number; shift_started_at: string | null; pay_rule: string; pay_value: number; daily_cents: number };
export async function requireCourier() {
  const id = await sessionId("courier");
  const c = id ? get<Courier>("SELECT id, name, phone, on_shift, shift_started_at, pay_rule, pay_value, daily_cents FROM couriers WHERE id = ? AND active = 1", id) : null;
  if (!c) throw new HttpError(401, "Entre no app do motoboy");
  return c;
}

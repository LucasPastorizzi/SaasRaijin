import { z } from "zod";
import { api, body } from "@/lib/server/api";
import { audit, get } from "@/lib/server/db";
import { verifyPassword } from "@/lib/server/password";
import { currentStaff, endSession, HttpError, startSession } from "@/lib/server/session";

export const GET = api(async () => ({ staff: await currentStaff() }));

export const POST = api(async (req) => {
  const { email, password } = await body(req, z.object({ email: z.string().email("E-mail inválido"), password: z.string().min(1) }));
  const s = get<{ id: number; password_hash: string; active: number }>("SELECT id, password_hash, active FROM staff WHERE email = ?", email.toLowerCase());
  if (!s || !s.active || !verifyPassword(password, s.password_hash)) throw new HttpError(401, "E-mail ou senha incorretos");
  await startSession("staff", s.id);
  audit(email, "login");
  return { ok: true };
});

export const DELETE = api(async () => {
  await endSession("staff");
  return { ok: true };
});

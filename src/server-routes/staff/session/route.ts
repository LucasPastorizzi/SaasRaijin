import { z } from "zod";
import { api, body } from "@/lib/server/api";
import { audit, get } from "@/lib/server/db";
import { isStrictProd } from "@/lib/server/env";
import { verifyPassword } from "@/lib/server/password";
import { currentStaff, endSession, HttpError, startSession } from "@/lib/server/session";

export const GET = api(async () => ({ staff: await currentStaff(), demo: !isStrictProd() }));

const schema = z.union([
  z.object({ email: z.string().email("E-mail inválido"), password: z.string().min(1) }),
  z.object({ demo: z.literal(true) }),
]);

export const POST = api(async (req) => {
  const input = await body(req, schema);
  if ("demo" in input) {
    // Demonstração: entra como o primeiro admin, sem senha. Desligado em produção real.
    if (isStrictProd()) throw new HttpError(404, "Indisponível");
    const admin = get<{ id: number; email: string }>("SELECT id, email FROM staff WHERE role = 'admin' AND active = 1 ORDER BY id LIMIT 1");
    if (!admin) throw new HttpError(500, "Sem usuário admin");
    await startSession("staff", admin.id);
    audit(admin.email, "login.demo");
    return { ok: true };
  }
  const s = get<{ id: number; password_hash: string; active: number }>("SELECT id, password_hash, active FROM staff WHERE email = ?", input.email.toLowerCase());
  if (!s || !s.active || !verifyPassword(input.password, s.password_hash)) throw new HttpError(401, "E-mail ou senha incorretos");
  await startSession("staff", s.id);
  audit(input.email, "login");
  return { ok: true };
});

export const DELETE = api(async () => {
  await endSession("staff");
  return { ok: true };
});

import { api, idParam } from "@/lib/server/api";
import { emailDetail, markSeen } from "@/lib/server/email";
import { HttpError, requireStaff } from "@/lib/server/session";

export const GET = api<{ id: string }>(async (_req, ctx) => {
  await requireStaff();
  const id = await idParam(ctx);
  await markSeen(id);
  const m = emailDetail(id);
  if (!m) throw new HttpError(404, "E-mail não encontrado");
  return m;
});

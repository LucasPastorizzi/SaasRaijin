import { api, body, idParam } from "@/lib/server/api";
import { audit, run, tx } from "@/lib/server/db";
import { requireStaff } from "@/lib/server/session";
import { groupSchema, saveOptions } from "@/lib/server/catalog";

export const PUT = api<{ id: string }>(async (req, ctx) => {
  const s = await requireStaff("gerente");
  const id = await idParam(ctx);
  const g = await body(req, groupSchema);
  tx(() => {
    run("UPDATE option_groups SET name = ?, min = ?, max = ? WHERE id = ?", g.name, g.min, g.max, id);
    saveOptions(id, g.options);
  });
  audit(s.email, "adicionais.editar", { id });
  return { ok: true };
});

export const DELETE = api<{ id: string }>(async (_req, ctx) => {
  const s = await requireStaff("gerente");
  const id = await idParam(ctx);
  run("DELETE FROM option_groups WHERE id = ?", id);
  audit(s.email, "adicionais.excluir", { id });
  return { ok: true };
});

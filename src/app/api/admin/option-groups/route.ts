import { api, body } from "@/lib/server/api";
import { audit, run, tx } from "@/lib/server/db";
import { requireStaff } from "@/lib/server/session";
import { groupSchema, saveOptions } from "@/lib/server/catalog";

export const POST = api(async (req) => {
  const s = await requireStaff("gerente");
  const g = await body(req, groupSchema);
  const id = tx(() => {
    const id = Number(run("INSERT INTO option_groups (name, min, max) VALUES (?, ?, ?)", g.name, g.min, g.max).lastInsertRowid);
    saveOptions(id, g.options);
    return id;
  });
  audit(s.email, "adicionais.criar", { id, name: g.name });
  return { id };
});

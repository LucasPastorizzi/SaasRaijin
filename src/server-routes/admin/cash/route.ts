import { z } from "zod";
import { api, body } from "@/lib/server/api";
import { all, audit, nowIso, run } from "@/lib/server/db";
import { cashSummary, openCashSession } from "@/lib/server/finance";
import { HttpError, requireStaff } from "@/lib/server/session";

export const GET = api(async () => {
  await requireStaff();
  const open = openCashSession();
  const history = all<{ id: number; opened_at: string; closed_at: string; opening_cents: number; counted_cash_cents: number | null }>(
    "SELECT * FROM cash_sessions WHERE closed_at IS NOT NULL ORDER BY id DESC LIMIT 15");
  return {
    current: open ? cashSummary(open.id) : null,
    history: history.map((h) => ({ ...h, summary: cashSummary(h.id) })),
  };
});

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open"), opening_cents: z.number().int().min(0) }),
  z.object({ action: z.literal("movement"), type: z.enum(["sangria", "suprimento"]), amount_cents: z.number().int().min(1), note: z.string().max(200).optional() }),
  z.object({ action: z.literal("close"), counted_cash_cents: z.number().int().min(0), notes: z.string().max(500).optional() }),
]);

export const POST = api(async (req) => {
  const s = await requireStaff("gerente", "atendente");
  const a = await body(req, action);
  const open = openCashSession();
  if (a.action === "open") {
    if (open) throw new HttpError(409, "Já existe um caixa aberto");
    run("INSERT INTO cash_sessions (opened_at, opened_by, opening_cents) VALUES (?, ?, ?)", nowIso(), s.name, a.opening_cents);
  } else {
    if (!open) throw new HttpError(409, "Abra o caixa primeiro");
    if (a.action === "movement") run("INSERT INTO cash_movements (session_id, type, amount_cents, note, by, at) VALUES (?, ?, ?, ?, ?, ?)", open.id, a.type, a.amount_cents, a.note ?? null, s.name, nowIso());
    else run("UPDATE cash_sessions SET closed_at = ?, closed_by = ?, counted_cash_cents = ?, notes = ? WHERE id = ?", nowIso(), s.name, a.counted_cash_cents, a.notes ?? null, open.id);
  }
  audit(s.email, `caixa.${a.action}`, a);
  return { ok: true };
});

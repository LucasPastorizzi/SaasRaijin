"use client";
import { useState } from "react";
import { Plus, Trash2, LockOpen, Lock, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Card, PageHead, Stat, canManage, useStaff } from "./shell";
import { Badge, Button, cx, Field, Input, Select, Sheet, Spinner, Toggle, useToast } from "../ui";
import { api, inputToCents, useApi } from "@/lib/client";
import { brl, fmtDate, fmtDateTime, fmtTime, PAYMENT_LABEL } from "@/lib/format";

/* ---------------- Cupons ---------------- */
type Coupon = { id: number; code: string; type: "pct" | "fixed" | "free_delivery"; value: number; min_cents: number; ends_at: string | null; max_uses: number | null; uses: number; per_customer: number; first_order_only: number; active: number; description: string | null };
const couponLabel = (c: Coupon) => (c.type === "pct" ? `${c.value}% off` : c.type === "fixed" ? `${brl(c.value)} off` : "Frete grátis");

export function CouponsAdmin() {
  const staff = useStaff();
  const toast = useToast();
  const { data, reload } = useApi<{ coupons: Coupon[] }>("/api/admin/coupons");
  const [open, setOpen] = useState(false);
  return (
    <div>
      <PageHead title="cupons" sub="Descontos para o app e campanhas">{canManage(staff) && <Button size="sm" onClick={() => setOpen(true)}><Plus className="size-4" />Novo cupom</Button>}</PageHead>
      <div className="grid gap-3 px-4 pb-10 sm:px-6 md:grid-cols-2 xl:grid-cols-3">
        {!data ? <Spinner /> : data.coupons.map((c) => (
          <Card key={c.id} className={cx("relative overflow-hidden p-4", !c.active && "opacity-55")}>
            <span className="absolute -right-6 -top-6 size-20 rounded-full bg-salmon/12" />
            <div className="flex items-start justify-between gap-2">
              <div><p className="font-mono text-lg font-bold tracking-wider">{c.code}</p><p className="text-sm text-salmon-deep font-semibold">{couponLabel(c)}</p></div>
              {canManage(staff) && <Toggle checked={!!c.active} onChange={async (v) => { await api(`/api/admin/coupons/${c.id}`, { method: "PATCH", body: { active: v } }); reload(); }} />}
            </div>
            {c.description && <p className="mt-2 text-sm text-ink/65">{c.description}</p>}
            <div className="mt-3 flex flex-wrap gap-1">
              {c.min_cents > 0 && <Badge>mín. {brl(c.min_cents)}</Badge>}
              {c.first_order_only ? <Badge tone="salmon">1º pedido</Badge> : null}
              <Badge>{c.uses}{c.max_uses ? `/${c.max_uses}` : ""} usos</Badge>
              {c.ends_at && <Badge tone={new Date(c.ends_at) < new Date() ? "danger" : "neutral"}>até {fmtDate(c.ends_at)}</Badge>}
            </div>
            {canManage(staff) && <button aria-label="Excluir" className="absolute bottom-3 right-3 cursor-pointer text-ink/35 hover:text-torii" onClick={async () => { if (confirm(`Excluir ${c.code}?`)) { await api(`/api/admin/coupons/${c.id}`, { method: "DELETE" }); reload(); } }}><Trash2 className="size-4" /></button>}
          </Card>
        ))}
      </div>
      {open && <CouponForm onClose={() => setOpen(false)} onSaved={() => { setOpen(false); reload(); toast("Cupom criado", "ok"); }} />}
    </div>
  );
}

function CouponForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ code: "", type: "pct", value: "10", min: "", ends: "", max: "", per: "1", first: false, description: "" });
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });
  return (
    <Sheet open onClose={onClose} title="Novo cupom" footer={<Button className="w-full" disabled={!f.code} onClick={async () => {
      try {
        await api("/api/admin/coupons", { body: { code: f.code, type: f.type, value: f.type === "pct" ? Number(f.value) : f.type === "fixed" ? inputToCents(f.value) : 0,
          min_cents: f.min ? inputToCents(f.min) : 0, ends_at: f.ends ? new Date(f.ends).toISOString() : null, max_uses: f.max ? Number(f.max) : null,
          per_customer: Number(f.per) || 1, first_order_only: f.first, description: f.description || null } });
        onSaved();
      } catch (e) { toast((e as Error).message, "error"); }
    }}>Criar cupom</Button>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Código" className="col-span-2"><Input value={f.code} onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/\s/g, "") })} placeholder="EX.: VOLTA10" /></Field>
        <Field label="Tipo"><Select value={f.type} onChange={(e) => set({ type: e.target.value })}><option value="pct">Percentual</option><option value="fixed">Valor fixo</option><option value="free_delivery">Frete grátis</option></Select></Field>
        {f.type !== "free_delivery" && <Field label={f.type === "pct" ? "Desconto (%)" : "Desconto (R$)"}><Input inputMode="decimal" value={f.value} onChange={(e) => set({ value: e.target.value })} /></Field>}
        <Field label="Pedido mínimo (R$)"><Input inputMode="decimal" value={f.min} onChange={(e) => set({ min: e.target.value })} /></Field>
        <Field label="Válido até"><Input type="datetime-local" value={f.ends} onChange={(e) => set({ ends: e.target.value })} /></Field>
        <Field label="Limite total de usos"><Input inputMode="numeric" value={f.max} onChange={(e) => set({ max: e.target.value })} placeholder="sem limite" /></Field>
        <Field label="Usos por cliente"><Input inputMode="numeric" value={f.per} onChange={(e) => set({ per: e.target.value })} /></Field>
        <Field label="Descrição" className="col-span-2"><Input value={f.description} onChange={(e) => set({ description: e.target.value })} /></Field>
        <div className="col-span-2"><Toggle checked={f.first} onChange={(v) => set({ first: v })} label="Só no primeiro pedido" /></div>
      </div>
    </Sheet>
  );
}

/* ---------------- Caixa ---------------- */
type Summary = { session: { id: number; opened_at: string; closed_at: string | null; opening_cents: number; counted_cash_cents: number | null }; byMethod: { payment_method: string; n: number; total: number }[];
  movements: { id: number; type: string; amount_cents: number; note: string | null; by: string | null; at: string }[]; courierPaid: number; expectedCash: number; gross: number };

export function CashAdmin() {
  const toast = useToast();
  const { data, reload } = useApi<{ current: Summary | null; history: { id: number; opened_at: string; closed_at: string; summary: Summary }[] }>("/api/admin/cash", 15000);
  const [opening, setOpening] = useState("200,00");
  const [mov, setMov] = useState<{ type: "sangria" | "suprimento"; amount: string; note: string } | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const post = async (body: object) => { try { await api("/api/admin/cash", { body }); reload(); } catch (e) { toast((e as Error).message, "error"); } };
  if (!data) return <div className="grid h-80 place-items-center"><Spinner /></div>;
  const s = data.current;
  return (
    <div>
      <PageHead title="caixa" sub={s ? `Aberto às ${fmtTime(s.session.opened_at)}` : "Caixa fechado"}>
        {s && <><Button size="sm" variant="line" onClick={() => setMov({ type: "sangria", amount: "", note: "" })}><ArrowUpRight className="size-4" />Sangria</Button>
          <Button size="sm" variant="line" onClick={() => setMov({ type: "suprimento", amount: "", note: "" })}><ArrowDownLeft className="size-4" />Suprimento</Button>
          <Button size="sm" variant="ink" onClick={() => setClosing("")}><Lock className="size-4" />Fechar caixa</Button></>}
      </PageHead>
      <div className="px-4 pb-10 sm:px-6">
        {!s ? (
          <Card className="flex max-w-md flex-col gap-3 p-5">
            <p className="font-semibold">Abrir caixa</p>
            <Field label="Fundo de troco (R$)"><Input inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} /></Field>
            <Button onClick={() => post({ action: "open", opening_cents: inputToCents(opening) })}><LockOpen className="size-4" />Abrir caixa</Button>
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Vendido no turno" value={brl(s.gross)} hint="pedidos entregues" />
              <Stat label="Fundo de troco" value={brl(s.session.opening_cents)} />
              <Stat label="Pago a motoboys" value={brl(s.courierPaid)} />
              <Stat label="Dinheiro esperado na gaveta" value={brl(s.expectedCash)} />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card className="p-4"><p className="font-bold">Por forma de pagamento</p>
                <ul className="mt-2 divide-y divide-ink/8 text-sm">{s.byMethod.map((m) => <li key={m.payment_method} className="flex justify-between py-2"><span>{PAYMENT_LABEL[m.payment_method]} <span className="text-ink/50">({m.n})</span></span><b>{brl(m.total)}</b></li>)}
                  {!s.byMethod.length && <li className="py-2 text-ink/55">Nada vendido ainda neste turno</li>}</ul></Card>
              <Card className="p-4"><p className="font-bold">Movimentações</p>
                <ul className="mt-2 divide-y divide-ink/8 text-sm">{s.movements.map((m) => <li key={m.id} className="flex justify-between py-2"><span>{fmtTime(m.at)} · {m.type}{m.note ? ` — ${m.note}` : ""}</span><b className={m.type === "sangria" ? "text-torii" : "text-ok"}>{m.type === "sangria" ? "−" : "+"} {brl(m.amount_cents)}</b></li>)}
                  {!s.movements.length && <li className="py-2 text-ink/55">Sem sangrias ou suprimentos</li>}</ul></Card>
            </div>
          </>
        )}
        <h2 className="pb-2 pt-8 text-lg font-bold">Caixas anteriores</h2>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-ink/4 text-left text-xs uppercase tracking-wider text-ink/55"><tr><th className="p-3">Período</th><th className="p-3 text-right">Vendido</th><th className="p-3 text-right">Esperado</th><th className="p-3 text-right">Contado</th><th className="p-3 text-right">Diferença</th></tr></thead>
            <tbody className="divide-y divide-ink/8">{data.history.map((h) => {
              const diff = (h.summary.session.counted_cash_cents ?? 0) - h.summary.expectedCash;
              return <tr key={h.id}><td className="p-3">{fmtDateTime(h.opened_at)} → {fmtTime(h.closed_at)}</td><td className="p-3 text-right">{brl(h.summary.gross)}</td><td className="p-3 text-right">{brl(h.summary.expectedCash)}</td>
                <td className="p-3 text-right">{brl(h.summary.session.counted_cash_cents ?? 0)}</td><td className={cx("p-3 text-right font-semibold", diff === 0 ? "text-ok" : "text-torii")}>{diff === 0 ? "ok" : brl(diff)}</td></tr>;
            })}</tbody>
          </table>
          {!data.history.length && <p className="p-6 text-center text-ink/55">Nenhum caixa fechado ainda</p>}
        </Card>
      </div>
      {mov && <Sheet open onClose={() => setMov(null)} title={mov.type === "sangria" ? "Sangria (retirada)" : "Suprimento (reforço)"} footer={<Button className="w-full" disabled={!mov.amount} onClick={async () => { await post({ action: "movement", type: mov.type, amount_cents: inputToCents(mov.amount), note: mov.note || undefined }); setMov(null); }}>Registrar</Button>}>
        <div className="flex flex-col gap-3"><Field label="Valor (R$)"><Input inputMode="decimal" value={mov.amount} onChange={(e) => setMov({ ...mov, amount: e.target.value })} autoFocus /></Field><Field label="Observação"><Input value={mov.note} onChange={(e) => setMov({ ...mov, note: e.target.value })} /></Field></div>
      </Sheet>}
      {closing !== null && s && <Sheet open onClose={() => setClosing(null)} title="Fechar caixa" footer={<Button className="w-full" disabled={!closing} onClick={async () => { await post({ action: "close", counted_cash_cents: inputToCents(closing) }); setClosing(null); }}>Fechar caixa</Button>}>
        <p className="text-sm text-ink/65">Dinheiro esperado na gaveta: <b>{brl(s.expectedCash)}</b>. Conte o dinheiro e informe o valor.</p>
        <Field label="Dinheiro contado (R$)" className="mt-3"><Input inputMode="decimal" value={closing} onChange={(e) => setClosing(e.target.value)} autoFocus /></Field>
        {closing && <p className={cx("mt-2 text-sm font-semibold", inputToCents(closing) === s.expectedCash ? "text-ok" : "text-torii")}>Diferença: {brl(inputToCents(closing) - s.expectedCash)}</p>}
      </Sheet>}
    </div>
  );
}

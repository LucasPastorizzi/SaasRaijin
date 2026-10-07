"use client";
import { useState } from "react";
import { Plus, Pencil, Bike, Car, HandCoins, Smartphone } from "lucide-react";
import { Card, PageHead, canManage, useStaff } from "./shell";
import { Badge, Button, cx, Field, Input, Select, Sheet, Spinner, Toggle, useToast } from "../ui";
import { api, centsToInput, inputToCents, useApi } from "@/lib/client";
import { brl, fmtDateTime, fmtPhone, fmtTime } from "@/lib/format";
import type { CourierRow } from "@/lib/server/couriers";

type Overview = { couriers: (CourierRow & { open_deliveries: number; today_deliveries: number })[]; settlements: { id: number; name: string; deliveries: number; pay_cents: number; cash_collected_cents: number; balance_cents: number; settled_by: string; created_at: string }[] };
type Preview = { courier: CourierRow; orders: { id: number; code: string; delivery_fee_cents: number; total_cents: number; payment_method: string; delivered_at: string; pay: number }[]; pay: number; cash: number; balance: number };

const payRule = (c: Pick<CourierRow, "pay_rule" | "pay_value" | "daily_cents">) =>
  `${c.pay_rule === "pct" ? `${c.pay_value}% da taxa` : `${brl(c.pay_value)} por entrega`}${c.daily_cents ? ` + diária ${brl(c.daily_cents)}` : ""}`;

export function CouriersAdmin() {
  const staff = useStaff();
  const { data, reload } = useApi<Overview>("/api/admin/couriers", 10000);
  const [edit, setEdit] = useState<CourierRow | "new" | null>(null);
  const [settle, setSettle] = useState<number | null>(null);
  if (!data) return <div className="grid h-80 place-items-center"><Spinner /></div>;
  const onShift = data.couriers.filter((c) => c.on_shift && c.active).length;

  return (
    <div>
      <PageHead title="motoboys" sub={`${onShift} em turno agora · app do motoboy em /motoboy`}>
        <a href="/motoboy" target="_blank" className="inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold ring-1 ring-ink/20"><Smartphone className="size-4" />Abrir app do motoboy</a>
        {canManage(staff) && <Button size="sm" onClick={() => setEdit("new")}><Plus className="size-4" />Cadastrar motoboy</Button>}
      </PageHead>
      <div className="grid gap-3 px-4 sm:px-6 md:grid-cols-2 xl:grid-cols-3">
        {data.couriers.map((c) => (
          <Card key={c.id} className={cx("p-4", !c.active && "opacity-55")}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className={cx("grid size-11 place-items-center rounded-xl", c.on_shift ? "bg-ok/15 text-ok" : "bg-ink/6 text-ink/50")}>{c.vehicle === "carro" ? <Car className="size-5" /> : <Bike className="size-5" />}</span>
                <div>
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-xs text-ink/55">{fmtPhone(c.phone)}{c.plate ? ` · ${c.plate}` : ""}</p>
                </div>
              </div>
              <Badge tone={!c.active ? "neutral" : c.on_shift ? (c.open_deliveries ? "salmon" : "ok") : "neutral"}>
                {!c.active ? "inativo" : c.on_shift ? (c.open_deliveries ? "em rota" : "disponível") : "fora do turno"}
              </Badge>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-ink/4 p-2"><dt className="text-[11px] text-ink/55">em aberto</dt><dd className="font-bold">{c.open_deliveries}</dd></div>
              <div className="rounded-xl bg-ink/4 p-2"><dt className="text-[11px] text-ink/55">hoje</dt><dd className="font-bold">{c.today_deliveries}</dd></div>
              <div className="rounded-xl bg-ink/4 p-2"><dt className="text-[11px] text-ink/55">turno desde</dt><dd className="font-bold">{c.shift_started_at ? fmtTime(c.shift_started_at) : "—"}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-ink/60">Pagamento: {payRule(c)}{c.pix_key ? ` · Pix ${c.pix_key}` : ""}</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="ink" className="flex-1" onClick={() => setSettle(c.id)}><HandCoins className="size-4" />Acerto do turno</Button>
              {canManage(staff) && <Button size="sm" variant="line" onClick={() => setEdit(c)} aria-label="Editar"><Pencil className="size-4" /></Button>}
            </div>
          </Card>
        ))}
      </div>

      <h2 className="px-4 pb-2 pt-8 text-lg font-bold sm:px-6">Últimos acertos</h2>
      <div className="px-4 pb-10 sm:px-6">
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-ink/4 text-left text-xs uppercase tracking-wider text-ink/55"><tr><th className="p-3">Quando</th><th className="p-3">Motoboy</th><th className="p-3 text-right">Entregas</th><th className="p-3 text-right">A pagar</th><th className="p-3 text-right">Dinheiro recebido</th><th className="p-3 text-right">Saldo</th></tr></thead>
            <tbody className="divide-y divide-ink/8">
              {data.settlements.map((s) => (
                <tr key={s.id}><td className="p-3">{fmtDateTime(s.created_at.includes("T") ? s.created_at : s.created_at.replace(" ", "T") + "Z")}</td><td className="p-3">{s.name}</td><td className="p-3 text-right">{s.deliveries}</td>
                  <td className="p-3 text-right">{brl(s.pay_cents)}</td><td className="p-3 text-right">{brl(s.cash_collected_cents)}</td>
                  <td className={cx("p-3 text-right font-semibold", s.balance_cents >= 0 ? "text-ok" : "text-torii")}>{s.balance_cents >= 0 ? `devolveu ${brl(s.balance_cents)}` : `recebeu ${brl(-s.balance_cents)}`}</td></tr>
              ))}
            </tbody>
          </table>
          {!data.settlements.length && <p className="p-6 text-center text-ink/55">Nenhum acerto ainda</p>}
        </Card>
      </div>

      {edit && <CourierForm courier={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {settle && <SettleSheet id={settle} onClose={() => setSettle(null)} onDone={() => { setSettle(null); reload(); }} />}
    </div>
  );
}

function CourierForm({ courier, onClose, onSaved }: { courier: CourierRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    name: courier?.name ?? "", phone: courier ? fmtPhone(courier.phone) : "", pin: courier?.pin ?? "", vehicle: courier?.vehicle ?? "moto", plate: courier?.plate ?? "",
    pix_key: courier?.pix_key ?? "", pay_rule: courier?.pay_rule ?? "fixed", pay_value: courier ? (courier.pay_rule === "pct" ? String(courier.pay_value) : centsToInput(courier.pay_value)) : "6,00",
    daily: centsToInput(courier?.daily_cents ?? 0), active: courier ? !!courier.active : true,
  });
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });
  const save = async () => {
    const body = { name: f.name, phone: f.phone, pin: f.pin, vehicle: f.vehicle, plate: f.plate || null, pix_key: f.pix_key || null, pay_rule: f.pay_rule,
      pay_value: f.pay_rule === "pct" ? Number(f.pay_value) : inputToCents(f.pay_value), daily_cents: inputToCents(f.daily), active: f.active };
    try { if (courier) await api(`/api/admin/couriers/${courier.id}`, { method: "PATCH", body }); else await api("/api/admin/couriers", { body }); toast("Motoboy salvo", "ok"); onSaved(); }
    catch (e) { toast((e as Error).message, "error"); }
  };
  return (
    <Sheet open onClose={onClose} title={courier ? "Editar motoboy" : "Novo motoboy"} footer={<Button className="w-full" onClick={save}>Salvar</Button>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome" className="col-span-2"><Input value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="WhatsApp"><Input inputMode="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
        <Field label="PIN de acesso ao app" hint="4 a 6 números"><Input inputMode="numeric" maxLength={6} value={f.pin} onChange={(e) => set({ pin: e.target.value.replace(/\D/g, "") })} /></Field>
        <Field label="Veículo"><Select value={f.vehicle} onChange={(e) => set({ vehicle: e.target.value })}><option value="moto">Moto</option><option value="carro">Carro</option><option value="bike">Bike</option></Select></Field>
        <Field label="Placa"><Input value={f.plate} onChange={(e) => set({ plate: e.target.value.toUpperCase() })} /></Field>
        <Field label="Chave Pix" className="col-span-2"><Input value={f.pix_key} onChange={(e) => set({ pix_key: e.target.value })} /></Field>
        <Field label="Forma de pagamento"><Select value={f.pay_rule} onChange={(e) => set({ pay_rule: e.target.value as "fixed" | "pct" })}><option value="fixed">Valor fixo por entrega</option><option value="pct">% da taxa de entrega</option></Select></Field>
        <Field label={f.pay_rule === "pct" ? "Percentual (%)" : "Valor por entrega (R$)"}><Input inputMode="decimal" value={f.pay_value} onChange={(e) => set({ pay_value: e.target.value })} /></Field>
        <Field label="Diária fixa (R$)" hint="0 = sem diária"><Input inputMode="decimal" value={f.daily} onChange={(e) => set({ daily: e.target.value })} /></Field>
        <div className="flex items-end pb-2"><Toggle checked={f.active} onChange={(v) => set({ active: v })} label="Ativo" /></div>
      </div>
    </Sheet>
  );
}

function SettleSheet({ id, onClose, onDone }: { id: number; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { data } = useApi<Preview>(`/api/admin/couriers/${id}/settlement`);
  return (
    <Sheet open onClose={onClose} title={data ? `Acerto · ${data.courier.name}` : "Acerto"} footer={data && data.orders.length > 0 && (
      <Button className="w-full" onClick={async () => { try { await api(`/api/admin/couriers/${id}/settlement`, { body: {} }); toast("Acerto registrado", "ok"); onDone(); } catch (e) { toast((e as Error).message, "error"); } }}>Confirmar acerto</Button>
    )}>
      {!data ? <Spinner /> : !data.orders.length ? <p className="py-8 text-center text-ink/60">Nenhuma entrega pendente de acerto.</p> : (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Card className="p-3"><p className="text-xs text-ink/55">Entregas</p><p className="text-xl font-bold">{data.orders.length}</p></Card>
            <Card className="p-3"><p className="text-xs text-ink/55">A pagar ao motoboy</p><p className="text-xl font-bold">{brl(data.pay)}</p></Card>
            <Card className="p-3"><p className="text-xs text-ink/55">Dinheiro com ele</p><p className="text-xl font-bold">{brl(data.cash)}</p></Card>
          </div>
          <p className={cx("mt-3 rounded-2xl p-3 text-center font-semibold", data.balance >= 0 ? "bg-ok/10 text-ok" : "bg-salmon/12 text-salmon-deep")}>
            {data.balance >= 0 ? `Motoboy devolve ${brl(data.balance)} para a loja` : `Loja paga ${brl(-data.balance)} ao motoboy`}
          </p>
          <ul className="mt-4 divide-y divide-ink/8 text-sm">
            {data.orders.map((o) => <li key={o.id} className="flex justify-between py-2"><span>#{o.code} · {fmtTime(o.delivered_at)} · {o.payment_method === "cash" ? `dinheiro ${brl(o.total_cents)}` : "pago"}</span><b>{brl(o.pay)}</b></li>)}
          </ul>
        </>
      )}
    </Sheet>
  );
}

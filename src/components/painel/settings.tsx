"use client";
import { useState } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { Card, PageHead, canManage, useStaff } from "./shell";
import { Badge, Button, Field, Input, Spinner, Textarea, Toggle, useToast } from "../ui";
import { api, centsToInput, inputToCents, useApi } from "@/lib/client";
import { DAY_SHORT, fmtHour, type Hours } from "@/lib/hours";

type Settings = {
  store: { name: string; tagline: string; phone: string; address: string; instagram: string };
  hours: Hours;
  ops: { minOrderCents: number; prepMinutes: number; deliveryBaseMinutes: number; forceClosed: boolean; autoPrint: boolean; allowScheduling: boolean; pickupEnabled: boolean; emailReceipts?: boolean };
  payments: { pix: boolean; card_online: boolean; cash: boolean; card_machine: boolean };
  loyalty: { enabled: boolean; everyCents: number; rewardCents: number };
  messages: Record<string, string>;
  zones: { id?: number; name: string; fee_cents: number; extra_minutes: number; active: number | boolean }[];
  integrations: { email: { imap: boolean; smtp: boolean; address: string | null }; whatsapp: boolean; payments: boolean; site: string | null };
};

const toTime = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
const fromTime = (s: string) => { const [a, b] = s.split(":").map(Number); return a + (b || 0) / 60; };
const MSG_LABEL: Record<string, string> = { novo: "Pedido recebido", aceito: "Pedido aceito", preparo: "Em preparo", pronto: "Pronto para retirada", saiu: "Saiu para entrega", entregue: "Entregue", cancelado: "Cancelado" };

export function SettingsAdmin() {
  const staff = useStaff();
  const toast = useToast();
  const { data } = useApi<Settings>("/api/admin/settings");
  if (!data) return <div className="grid h-80 place-items-center"><Spinner /></div>;
  return <SettingsForm initial={data} manage={canManage(staff)} toast={toast} />;
}

function SettingsForm({ initial, manage, toast }: { initial: Settings; manage: boolean; toast: ReturnType<typeof useToast> }) {
  const [s, setS] = useState<Settings>(initial);
  const [busy, setBusy] = useState(false);
    const save = async () => {
    setBusy(true);
    try {
      await api("/api/admin/settings", { method: "PUT", body: { store: s.store, hours: s.hours, ops: s.ops, payments: s.payments, loyalty: s.loyalty, messages: s.messages,
        zones: s.zones.map((z) => ({ ...z, active: !!z.active })) } });
      toast("Configurações salvas", "ok");
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  };
  const setHours = (d: number, list: [number, number][]) => setS({ ...s, hours: { ...s.hours, [d]: list } });

  return (
    <div>
      <PageHead title="configurações" sub="Loja, horários, entrega, pagamentos e mensagens">
        {manage && <Button size="sm" loading={busy} onClick={save}><Save className="size-4" />Salvar tudo</Button>}
      </PageHead>
      <fieldset disabled={!manage} className="grid gap-4 px-4 pb-16 sm:px-6 xl:grid-cols-2">
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="font-bold">Operação agora</h2>
          <Toggle checked={s.ops.forceClosed} onChange={(v) => setS({ ...s, ops: { ...s.ops, forceClosed: v } })} label="Fechar loja temporariamente (pausa todos os pedidos)" />
          <Toggle checked={s.ops.allowScheduling} onChange={(v) => setS({ ...s, ops: { ...s.ops, allowScheduling: v } })} label="Permitir pedidos agendados quando fechado" />
          <Toggle checked={s.ops.pickupEnabled} onChange={(v) => setS({ ...s, ops: { ...s.ops, pickupEnabled: v } })} label="Aceitar retirada no balcão" />
          <Toggle checked={s.ops.emailReceipts ?? true} onChange={(v) => setS({ ...s, ops: { ...s.ops, emailReceipts: v } })} label="Enviar confirmação de pedido por e-mail (clientes com e-mail cadastrado)" />
          <div className="grid grid-cols-3 gap-3">
            <Field label="Pedido mínimo (R$)"><Input inputMode="decimal" value={centsToInput(s.ops.minOrderCents)} onChange={(e) => setS({ ...s, ops: { ...s.ops, minOrderCents: inputToCents(e.target.value) } })} /></Field>
            <Field label="Tempo de preparo (min)"><Input type="number" value={s.ops.prepMinutes} onChange={(e) => setS({ ...s, ops: { ...s.ops, prepMinutes: Number(e.target.value) } })} /></Field>
            <Field label="Tempo de entrega base (min)"><Input type="number" value={s.ops.deliveryBaseMinutes} onChange={(e) => setS({ ...s, ops: { ...s.ops, deliveryBaseMinutes: Number(e.target.value) } })} /></Field>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-bold">Horários de funcionamento</h2>
          <div className="mt-3 flex flex-col gap-2">
            {[2, 3, 4, 5, 6, 0, 1].map((d) => (
              <div key={d} className="flex flex-wrap items-center gap-2">
                <span className="w-10 text-sm font-semibold">{DAY_SHORT[d]}</span>
                {(s.hours[d] ?? []).map(([a, b], i) => (
                  <span key={i} className="flex items-center gap-1 rounded-xl bg-ink/5 p-1">
                    <input type="time" className="rounded-lg bg-white px-1.5 py-1 text-sm" value={toTime(a)} onChange={(e) => setHours(d, s.hours[d].map((x, j) => (j === i ? [fromTime(e.target.value), x[1]] : x)) as [number, number][])} />
                    –<input type="time" className="rounded-lg bg-white px-1.5 py-1 text-sm" value={toTime(b)} onChange={(e) => setHours(d, s.hours[d].map((x, j) => (j === i ? [x[0], fromTime(e.target.value)] : x)) as [number, number][])} />
                    <button type="button" aria-label="Remover turno" className="px-1 text-ink/40 hover:text-torii cursor-pointer" onClick={() => setHours(d, s.hours[d].filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></button>
                  </span>
                ))}
                {!(s.hours[d] ?? []).length && <Badge>fechado</Badge>}
                <button type="button" className="text-xs font-semibold text-salmon-deep cursor-pointer" onClick={() => setHours(d, [...(s.hours[d] ?? []), [19, 22]])}>+ turno</button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink/55">Ex. atual: {[3].map((d) => (s.hours[d] ?? []).map(([a, b]) => `${fmtHour(a)}–${fmtHour(b)}`).join(" e "))} na quarta.</p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between"><h2 className="font-bold">Bairros e taxas de entrega</h2>
            <Button type="button" size="sm" variant="ghost" onClick={() => setS({ ...s, zones: [...s.zones, { name: "", fee_cents: 600, extra_minutes: 0, active: true }] })}><Plus className="size-4" />Bairro</Button></div>
          <div className="mt-3 flex flex-col gap-2">
            {s.zones.map((z, i) => (
              <div key={z.id ?? `n${i}`} className="flex items-center gap-2">
                <Input placeholder="Bairro" value={z.name} onChange={(e) => setS({ ...s, zones: s.zones.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <Input className="w-24" inputMode="decimal" aria-label="Taxa" value={centsToInput(z.fee_cents)} onChange={(e) => setS({ ...s, zones: s.zones.map((x, j) => (j === i ? { ...x, fee_cents: inputToCents(e.target.value) } : x)) })} />
                <Input className="w-20" type="number" aria-label="Minutos extras" title="minutos extras" value={z.extra_minutes} onChange={(e) => setS({ ...s, zones: s.zones.map((x, j) => (j === i ? { ...x, extra_minutes: Number(e.target.value) } : x)) })} />
                <Toggle checked={!!z.active} onChange={(v) => setS({ ...s, zones: s.zones.map((x, j) => (j === i ? { ...x, active: v } : x)) })} />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink/55">Taxa em R$ · minutos extras somados ao tempo de entrega. Desativar um bairro bloqueia novos pedidos para ele.</p>
        </Card>

        <Card className="flex flex-col gap-3 p-5">
          <h2 className="font-bold">Pagamentos e cashback</h2>
          <div className="grid grid-cols-2 gap-3">
            <Toggle checked={s.payments.pix} onChange={(v) => setS({ ...s, payments: { ...s.payments, pix: v } })} label="Pix online" />
            <Toggle checked={s.payments.card_online} onChange={(v) => setS({ ...s, payments: { ...s.payments, card_online: v } })} label="Cartão online" />
            <Toggle checked={s.payments.cash} onChange={(v) => setS({ ...s, payments: { ...s.payments, cash: v } })} label="Dinheiro" />
            <Toggle checked={s.payments.card_machine} onChange={(v) => setS({ ...s, payments: { ...s.payments, card_machine: v } })} label="Maquininha" />
          </div>
          <Toggle checked={s.loyalty.enabled} onChange={(v) => setS({ ...s, loyalty: { ...s.loyalty, enabled: v } })} label="Programa de cashback" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="A cada (R$)"><Input inputMode="decimal" value={centsToInput(s.loyalty.everyCents)} onChange={(e) => setS({ ...s, loyalty: { ...s.loyalty, everyCents: inputToCents(e.target.value) } })} /></Field>
            <Field label="Ganha (R$)"><Input inputMode="decimal" value={centsToInput(s.loyalty.rewardCents)} onChange={(e) => setS({ ...s, loyalty: { ...s.loyalty, rewardCents: inputToCents(e.target.value) } })} /></Field>
          </div>
        </Card>

        <Card className="flex flex-col gap-3 p-5">
          <h2 className="font-bold">Dados da loja</h2>
          <Field label="Nome"><Input value={s.store.name} onChange={(e) => setS({ ...s, store: { ...s.store, name: e.target.value } })} /></Field>
          <Field label="Frase"><Input value={s.store.tagline} onChange={(e) => setS({ ...s, store: { ...s.store, tagline: e.target.value } })} /></Field>
          <Field label="WhatsApp (+55…)"><Input value={s.store.phone} onChange={(e) => setS({ ...s, store: { ...s.store, phone: e.target.value } })} /></Field>
          <Field label="Endereço"><Input value={s.store.address} onChange={(e) => setS({ ...s, store: { ...s.store, address: e.target.value } })} /></Field>
        </Card>

        <Card className="flex flex-col gap-3 p-5">
          <h2 className="font-bold">Mensagens automáticas do WhatsApp</h2>
          <p className="text-xs text-ink/55">Variáveis: {"{nome} {codigo} {total} {eta} {link} {motoboy} {pin} {motivo}"}. Em produção, cada uma precisa de um template equivalente aprovado na Meta.</p>
          {Object.entries(s.messages).map(([k, v]) => (
            <Field key={k} label={MSG_LABEL[k] ?? k}><Textarea rows={2} value={v} onChange={(e) => setS({ ...s, messages: { ...s.messages, [k]: e.target.value } })} /></Field>
          ))}
        </Card>

        <Card className="flex flex-col gap-2 p-5">
          <h2 className="font-bold">Integrações</h2>
          <p className="text-sm">E-mail: {s.integrations.email.imap && s.integrations.email.smtp ? <Badge tone="ok">{s.integrations.email.address}</Badge> : <Badge tone="warn">simulação</Badge>}</p>
          <p className="text-sm">WhatsApp Cloud API: {s.integrations.whatsapp ? <Badge tone="ok">conectado</Badge> : <Badge tone="warn">simulação</Badge>}</p>
          <p className="text-sm">Gateway de pagamento (Pix/cartão): {s.integrations.payments ? <Badge tone="ok">conectado</Badge> : <Badge tone="warn">simulação</Badge>}</p>
          <p className="text-xs text-ink/55">As chaves ficam nas variáveis de ambiente do servidor (ver README), nunca no painel.</p>
        </Card>
      </fieldset>
    </div>
  );
}

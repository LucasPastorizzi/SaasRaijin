"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Megaphone, MessageCircle, Star, Tag, X, ArrowLeft, Sparkles } from "lucide-react";
import { Card, PageHead, Stat, canManage, useStaff } from "./shell";
import { Badge, Button, cx, Field, Input, Select, Sheet, Spinner, Textarea, Toggle, useToast } from "../ui";
import { api, inputToCents, useApi } from "@/lib/client";
import { brl, fmtDate, fmtDateTime, fmtPhone, fmtTime, ORDER_STATUS, type OrderStatus } from "@/lib/format";
import type { CustomerStats } from "@/lib/server/crm";

type ListRes = { customers: CustomerStats[]; counts: Record<string, number>; segments: Record<string, string> };
const SEG_TONE: Record<string, "salmon" | "ok" | "warn" | "danger" | "ink" | "neutral"> = { vip: "ink", recorrentes: "ok", novos: "salmon", em_risco: "warn", sumidos: "danger", aniversariantes: "salmon" };

export function CustomersList() {
  const staff = useStaff();
  const [segment, setSegment] = useState("todos");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("last");
  const [campaign, setCampaign] = useState(false);
  const { data } = useApi<ListRes>(`/api/admin/customers?segment=${segment}&q=${encodeURIComponent(q)}&sort=${sort}`);

  return (
    <div>
      <PageHead title="clientes" sub="CRM: quem pede, quanto, quando e o quê">
        {canManage(staff) && <Button size="sm" onClick={() => setCampaign(true)}><Megaphone className="size-4" />Campanha no WhatsApp</Button>}
      </PageHead>
      {data && (
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 sm:px-6">
          {Object.entries(data.segments).map(([k, l]) => (
            <button key={k} onClick={() => setSegment(k)} className={cx("shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold cursor-pointer", segment === k ? "bg-ink text-paper" : "bg-ink/6")}>
              {l} <span className="opacity-60">{data.counts[k]}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2 px-4 pt-4 sm:px-6">
        <Input className="max-w-xs" placeholder="Buscar por nome, telefone ou tag" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select className="max-w-[220px]" value={sort} onChange={(e) => setSort(e.target.value)}><option value="last">Pedido mais recente</option><option value="spent">Quem mais gastou</option><option value="orders">Mais pedidos</option></Select>
      </div>
      <div className="px-4 pb-10 pt-4 sm:px-6">
        {!data ? <Spinner /> : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-ink/4 text-left text-xs uppercase tracking-wider text-ink/55">
                <tr><th className="p-3">Cliente</th><th className="p-3">Segmentos</th><th className="p-3 text-right">Pedidos</th><th className="p-3 text-right">Gasto total</th><th className="p-3 text-right">Ticket médio</th><th className="p-3 text-right">Último pedido</th></tr>
              </thead>
              <tbody className="divide-y divide-ink/8">
                {data.customers.map((c) => (
                  <tr key={c.id} className="hover:bg-ink/[.02]">
                    <td className="p-3"><Link href={`/painel/clientes/${c.id}`} className="font-semibold hover:text-salmon-deep">{c.name ?? "Sem nome"}</Link><p className="text-xs text-ink/55">{fmtPhone(c.phone)}{c.marketing_opt_in ? " · aceita promo" : ""}</p></td>
                    <td className="p-3"><div className="flex flex-wrap gap-1">{c.segments.map((s) => <Badge key={s} tone={SEG_TONE[s] ?? "neutral"}>{data.segments[s]?.split(" (")[0]}</Badge>)}{c.tags.map((t) => <Badge key={t}>#{t}</Badge>)}</div></td>
                    <td className="p-3 text-right">{c.orders}</td>
                    <td className="p-3 text-right font-semibold">{brl(c.spent)}</td>
                    <td className="p-3 text-right">{brl(c.avg)}</td>
                    <td className="p-3 text-right">{c.last_order ? <>{fmtDate(c.last_order)}<p className="text-xs text-ink/50">há {c.days_since} dias</p></> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.customers.length && <p className="p-8 text-center text-ink/55">Nenhum cliente neste filtro</p>}
          </Card>
        )}
      </div>
      {campaign && data && <Campaign segments={data.segments} onClose={() => setCampaign(false)} />}
    </div>
  );
}

function Campaign({ segments, onClose }: { segments: Record<string, string>; onClose: () => void }) {
  const toast = useToast();
  const [segment, setSegment] = useState("em_risco");
  const [text, setText] = useState("Oi {nome}! Tá com saudade do Raijin? 🍣 Usa o cupom VOLTA10 e ganha 10% no próximo pedido. Pede aqui: ");
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = async (s = segment) => { const r = await api<{ count: number }>("/api/admin/customers/broadcast", { body: { segment: s, text, preview: true } }); setCount(r.count); };
  return (
    <Sheet open onClose={onClose} title="Campanha no WhatsApp" footer={
      <Button className="w-full" loading={busy} disabled={!count} onClick={async () => {
        if (!confirm(`Enviar para ${count} clientes?`)) return;
        setBusy(true);
        try { const r = await api<{ sent: number }>("/api/admin/customers/broadcast", { body: { segment, text } }); toast(`Enviado para ${r.sent} clientes`, "ok"); onClose(); }
        catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
      }}>Enviar para {count ?? "…"} clientes</Button>}>
      <div className="flex flex-col gap-3">
        <Field label="Segmento"><Select value={segment} onChange={(e) => { setSegment(e.target.value); preview(e.target.value); }}>{Object.entries(segments).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Mensagem" hint="{nome} vira o primeiro nome. O texto de saída (PARAR) é adicionado automaticamente."><Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => preview()} /></Field>
        <Button variant="line" onClick={() => preview()}>Calcular alcance</Button>
        {count !== null && <p className="text-sm">Alcance: <b>{count}</b> clientes com opt-in de promoções neste segmento.</p>}
        <p className="rounded-xl bg-ink/5 p-3 text-xs text-ink/60">Na API oficial do WhatsApp, mensagens de marketing para quem não falou com vocês nas últimas 24 h precisam de <b>template aprovado pela Meta</b> e têm custo por envio.</p>
      </div>
    </Sheet>
  );
}

type Detail = CustomerStats & {
  addresses: { id: number; street: string; number: string; zone_name: string }[];
  orders: { id: number; code: string; status: string; total_cents: number; created_at: string; type: string; rating: number | null }[];
  favorites: { name: string; qty: number }[]; conversationId: number | null;
  messages: { direction: string; body: string; at: string; internal: number }[]; avgRating: number | null;
};

export function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { data: c, setData } = useApi<Detail>(`/api/admin/customers/${id}`);
  const [tag, setTag] = useState("");
  const [loyalty, setLoyalty] = useState("");
  if (!c) return <div className="grid h-80 place-items-center"><Spinner /></div>;
  const patch = async (body: object) => { try { setData(await api<Detail>(`/api/admin/customers/${id}`, { method: "PATCH", body })); } catch (e) { toast((e as Error).message, "error"); } };

  return (
    <div className="pb-10">
      <div className="px-4 pt-5 sm:px-6"><Link href="/painel/clientes" className="inline-flex items-center gap-1 text-sm text-ink/60 hover:text-ink"><ArrowLeft className="size-4" />Clientes</Link></div>
      <PageHead title={c.name?.toLowerCase() ?? "cliente"} sub={<>{fmtPhone(c.phone)} · cliente desde {fmtDate(c.created_at.includes("T") ? c.created_at : c.created_at.replace(" ", "T") + "Z")}</>}>
        {c.conversationId && <Link href={`/painel/whatsapp?c=${c.conversationId}`} className="inline-flex h-9 items-center gap-2 rounded-lg bg-ink px-3.5 text-sm font-semibold text-paper"><MessageCircle className="size-4" />Conversa</Link>}
      </PageHead>
      <div className="flex flex-wrap gap-1.5 px-4 sm:px-6">{c.segments.map((s) => <Badge key={s} tone={SEG_TONE[s] ?? "neutral"}>{s.replace("_", " ")}</Badge>)}</div>
      <div className="grid gap-3 px-4 pt-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-5">
        <Stat label="Pedidos" value={c.orders} />
        <Stat label="Gasto total" value={brl(c.spent)} />
        <Stat label="Ticket médio" value={brl(c.avg)} />
        <Stat label="Último pedido" value={c.days_since !== null ? `há ${c.days_since} d` : "—"} hint={c.last_order ? fmtDate(c.last_order) : undefined} />
        <Stat label="Avaliação média" value={c.avgRating ? <span className="inline-flex items-center gap-1">{c.avgRating.toFixed(1)}<Star className="size-5 fill-salmon text-salmon" /></span> : "—"} />
      </div>

      <div className="grid gap-4 px-4 pt-4 sm:px-6 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <h2 className="font-bold">Pedidos</h2>
            <ul className="mt-2 divide-y divide-ink/8 text-sm">
              {c.orders.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                  <a href={`/pedido/${o.code}`} target="_blank" className="font-semibold hover:text-salmon-deep">#{o.code}</a>
                  <span className="text-ink/55">{fmtDateTime(o.created_at)}</span>
                  <Badge tone={o.status === "entregue" ? "ok" : o.status === "cancelado" ? "danger" : "salmon"}>{ORDER_STATUS[o.status as OrderStatus]}</Badge>
                  <span>{o.rating ? `${o.rating}★` : ""}</span>
                  <b>{brl(o.total_cents)}</b>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-4">
            <h2 className="font-bold">Últimas mensagens</h2>
            <ul className="mt-2 flex flex-col gap-1.5 text-sm">
              {c.messages.slice(0, 12).map((m, i) => (
                <li key={i} className={cx("max-w-[85%] rounded-2xl px-3 py-2", m.direction === "in" ? "self-start bg-white ring-1 ring-ink/8" : m.internal ? "self-end bg-amber-100" : "self-end bg-salmon/12")}>
                  <p className="whitespace-pre-wrap">{m.body}</p><p className="mt-0.5 text-[10px] text-ink/45">{fmtDateTime(m.at)}</p>
                </li>
              ))}
              {!c.messages.length && <p className="text-ink/55">Sem conversa ainda.</p>}
            </ul>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <h2 className="font-bold">Favoritos</h2>
            <ul className="mt-2 text-sm">{c.favorites.map((f) => <li key={f.name} className="flex justify-between py-0.5"><span>{f.name}</span><b>{f.qty}×</b></li>)}</ul>
          </Card>
          <Card className="flex flex-col gap-3 p-4">
            <h2 className="flex items-center gap-2 font-bold"><Tag className="size-4" />Tags e notas</h2>
            <div className="flex flex-wrap gap-1.5">{c.tags.map((t) => <span key={t} className="inline-flex items-center gap-1 rounded-full bg-ink/6 px-2.5 py-1 text-xs font-semibold">#{t}<button aria-label="Remover tag" className="cursor-pointer" onClick={() => patch({ tags: c.tags.filter((x) => x !== t) })}><X className="size-3" /></button></span>)}</div>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (tag) { patch({ tags: [...c.tags, tag.trim()] }); setTag(""); } }}>
              <Input placeholder="ex.: sem-cream-cheese" value={tag} onChange={(e) => setTag(e.target.value)} /><Button variant="ink">Adicionar</Button>
            </form>
            <Textarea placeholder="Notas internas (só a equipe vê)" defaultValue={c.notes} onBlur={(e) => e.target.value !== c.notes && patch({ notes: e.target.value })} />
          </Card>
          <Card className="flex flex-col gap-3 p-4">
            <h2 className="font-bold">Dados</h2>
            <Field label="Aniversário"><Input type="date" defaultValue={c.birthday ?? ""} onBlur={(e) => patch({ birthday: e.target.value })} /></Field>
            <Field label="E-mail"><Input type="email" defaultValue={c.email ?? ""} onBlur={(e) => patch({ email: e.target.value })} /></Field>
            <Toggle checked={!!c.marketing_opt_in} onChange={(v) => patch({ marketing_opt_in: v })} label="Aceita promoções (opt-in)" />
            <div className="text-sm">{c.addresses.map((a) => <p key={a.id}>📍 {a.street}, {a.number} — {a.zone_name}</p>)}</div>
          </Card>
          <Card className="flex flex-col gap-2 p-4">
            <h2 className="flex items-center gap-2 font-bold"><Sparkles className="size-4 text-salmon" />Cashback: {brl(c.loyalty_cents)}</h2>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); patch({ loyalty_adjust_cents: inputToCents(loyalty) }); setLoyalty(""); }}>
              <Input inputMode="decimal" placeholder="+5,00 ou -5,00" value={loyalty} onChange={(e) => setLoyalty(e.target.value)} /><Button variant="ink" disabled={!loyalty}>Ajustar</Button>
            </form>
          </Card>
          <p className="text-xs text-ink/45">Atualizado {fmtTime(new Date().toISOString())}</p>
        </div>
      </div>
    </div>
  );
}

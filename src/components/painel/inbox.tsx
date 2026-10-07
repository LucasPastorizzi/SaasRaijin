"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Bot, CheckCheck, FlaskConical, Send, StickyNote, UserCheck } from "lucide-react";
import { Card, useStaff } from "./shell";
import { Badge, Button, cx, Input, Spinner, Textarea, useToast } from "../ui";
import { api, useApi } from "@/lib/client";
import { brl, fmtPhone, fmtTime, ORDER_STATUS, PAYMENT_LABEL, type OrderStatus } from "@/lib/format";

type Conv = { id: number; phone: string; customer_name: string | null; status: string; assigned_to: string | null; unread: number; last_message_at: string; last_body: string | null; bot_stage: string | null };
type Msg = { id: number; direction: "in" | "out"; kind: string; body: string; status: string; internal: number; author: string | null; at: string };
type Thread = {
  conversation: Conv; window: boolean; messages: Msg[];
  customer: { id: number; name: string | null; loyalty_cents: number; tags: string[]; notes: string } | null;
  orders: { id: number; code: string; status: OrderStatus; total_cents: number; created_at: string; payment_method: string; payment_status: string; type: string }[];
  stats: { n: number; spent: number } | null;
};

const QUICK: [string, string][] = [
  ["/cardapio", "Faz teu pedido por aqui, rapidinho: {site}"],
  ["/horario", "Atendemos almoço (buffet) de quarta a sábado, 11h30–13h30, e jantar de terça a sábado, 19h–22h 🍣"],
  ["/pix", "Pode pagar pelo Pix direto no link do pedido, a confirmação é automática ✅"],
  ["/atraso", "Desculpa a demora! Teu pedido já tá saindo, mais uns minutinhos 🛵"],
  ["/obrigado", "Valeu demais pela preferência! 🧡 Qualquer coisa é só chamar."],
];

export function Inbox() {
  const params = useSearchParams();
  const [filter, setFilter] = useState("abertas");
  const [sel, setSel] = useState<number | null>(params.get("c") ? Number(params.get("c")) : null);
  const { data, reload } = useApi<{ conversations: Conv[]; live: boolean }>(`/api/admin/wa?filter=${filter}`, 4000);

  return (
    <div className="flex h-[calc(100dvh-3.5rem-4.5rem)] lg:h-dvh">
      <aside className={cx("flex w-full flex-col border-r border-ink/10 md:w-80 md:shrink-0", sel && "hidden md:flex")}>
        <div className="px-4 pb-3 pt-5">
          <h1 className="h-title text-3xl">whatsapp</h1>
          <p className="mt-1 text-xs text-ink/55">{data?.live ? "Conectado à API oficial" : "Modo simulação (configure WHATSAPP_TOKEN)"}</p>
          <div className="mt-3 flex gap-1.5">
            {[["abertas", "Abertas"], ["humano", "Com atendente"], ["resolvidas", "Resolvidas"]].map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} className={cx("rounded-full px-3 py-1.5 text-xs font-semibold cursor-pointer", filter === k ? "bg-ink text-paper" : "bg-ink/6")}>{l}</button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!data ? <div className="p-6"><Spinner /></div> : data.conversations.map((c) => (
            <button key={c.id} onClick={() => setSel(c.id)} className={cx("flex w-full items-start gap-3 border-b border-ink/6 px-4 py-3 text-left cursor-pointer", sel === c.id ? "bg-salmon/10" : "hover:bg-ink/[.03]")}>
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-paper">{(c.customer_name ?? "?").slice(0, 1)}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2"><b className="truncate text-sm">{c.customer_name ?? fmtPhone(c.phone)}</b><span className="text-[11px] text-ink/45">{fmtTime(c.last_message_at)}</span></span>
                <span className="mt-0.5 flex items-center gap-2"><span className="truncate text-xs text-ink/60">{c.last_body}</span>{c.unread > 0 && <span className="ml-auto rounded-full bg-salmon px-1.5 text-[11px] font-bold text-white">{c.unread}</span>}</span>
                {c.assigned_to && <span className="mt-1 inline-block text-[11px] text-ink/50">👤 {c.assigned_to}</span>}
              </span>
            </button>
          ))}
          {data && !data.conversations.length && <p className="p-6 text-center text-sm text-ink/55">Nenhuma conversa</p>}
        </div>
        {data && !data.live && <Simulator onSent={reload} />}
      </aside>
      <section className={cx("min-w-0 flex-1", !sel && "hidden md:block")}>
        {sel ? <ThreadView id={sel} onBack={() => setSel(null)} onChange={reload} /> : <div className="grid h-full place-items-center text-ink/45">Escolha uma conversa</div>}
      </section>
    </div>
  );
}

function ThreadView({ id, onBack, onChange }: { id: number; onBack: () => void; onChange: () => void }) {
  const staff = useStaff();
  const toast = useToast();
  const { data, reload } = useApi<Thread>(`/api/admin/wa/${id}`, 3000);
  const [text, setText] = useState("");
  const [note, setNote] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [data?.messages.length]);
  if (!data) return <div className="grid h-full place-items-center"><Spinner /></div>;
  const c = data.conversation;
  const act = async (body: object) => { try { await api(`/api/admin/wa/${id}`, { body }); reload(); onChange(); } catch (e) { toast((e as Error).message, "error"); } };
  const site = typeof window !== "undefined" ? window.location.origin : "";
  const suggestions = text.startsWith("/") ? QUICK.filter(([k]) => k.startsWith(text)) : [];

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-ink/10 px-4 py-3">
          <button className="md:hidden cursor-pointer" onClick={onBack} aria-label="Voltar"><ArrowLeft className="size-5" /></button>
          <div className="min-w-0 flex-1"><p className="truncate font-semibold">{data.customer?.name ?? fmtPhone(c.phone)}</p><p className="text-xs text-ink/55">{fmtPhone(c.phone)} · {data.window ? "janela de 24 h aberta" : "fora da janela de 24 h (só template)"}</p></div>
          {c.assigned_to ? <Badge tone="ink"><UserCheck className="size-3" />{c.assigned_to}</Badge> : <Button size="sm" variant="line" onClick={() => act({ action: "assign", to: staff.name })}>Assumir</Button>}
          {c.bot_stage === "humano" || c.assigned_to ? <Button size="sm" variant="ghost" title="Devolver ao robô" onClick={() => act({ action: "bot", on: true })}><Bot className="size-4" /></Button> : null}
          {c.status === "aberta" ? <Button size="sm" variant="ink" onClick={() => act({ action: "resolve" })}><CheckCheck className="size-4" /><span className="hidden sm:inline">Resolver</span></Button>
            : <Button size="sm" variant="line" onClick={() => act({ action: "reopen" })}>Reabrir</Button>}
        </header>
        <div className="seigaiha flex-1 overflow-y-auto px-4 py-4">
          <div className="mx-auto flex max-w-2xl flex-col gap-2">
            {data.messages.map((m) => (
              <div key={m.id} className={cx("max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                m.direction === "in" ? "self-start rounded-bl-md bg-white" : m.internal ? "self-end rounded-br-md bg-amber-100" : m.author === "bot" || m.author === "sistema" ? "self-end rounded-br-md bg-ink/8" : "self-end rounded-br-md bg-salmon text-white")}>
                {m.internal ? <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">nota interna</p> : null}
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={cx("mt-1 text-right text-[10px]", m.direction === "out" && !m.internal && m.author !== "bot" && m.author !== "sistema" ? "text-white/70" : "text-ink/45")}>
                  {m.direction === "out" && m.author ? `${m.author} · ` : ""}{fmtTime(m.at)}{m.direction === "out" && !m.internal ? ` · ${m.status}` : ""}
                </p>
              </div>
            ))}
            <div ref={end} />
          </div>
        </div>
        <form className="relative border-t border-ink/10 p-3" onSubmit={async (e) => { e.preventDefault(); if (!text.trim()) return; await act({ action: note ? "note" : "send", text }); setText(""); }}>
          {suggestions.length > 0 && (
            <div className="absolute bottom-full left-3 right-3 mb-2 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-ink/10">
              {suggestions.map(([k, v]) => <button type="button" key={k} className="block w-full px-4 py-2 text-left text-sm hover:bg-salmon/10 cursor-pointer" onClick={() => setText(v.replace("{site}", site))}><b>{k}</b> <span className="text-ink/60">{v.slice(0, 60)}…</span></button>)}
            </div>
          )}
          <div className="flex items-end gap-2">
            <button type="button" title="Nota interna" onClick={() => setNote(!note)} className={cx("grid size-11 shrink-0 place-items-center rounded-xl cursor-pointer", note ? "bg-amber-200" : "bg-ink/6")}><StickyNote className="size-4.5" /></button>
            <Textarea rows={1} className={cx("min-h-11 resize-none", note && "bg-amber-50")} placeholder={note ? "Nota interna (cliente não vê)" : "Mensagem — digite / para respostas rápidas"} value={text}
              onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement).requestSubmit(); } }} />
            <Button className="size-11 shrink-0 !px-0" aria-label="Enviar"><Send className="size-4.5" /></Button>
          </div>
        </form>
      </div>

      {/* ficha do cliente ao lado */}
      <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-ink/10 p-4 xl:block">
        {data.customer ? (
          <>
            <Link href={`/painel/clientes/${data.customer.id}`} className="text-lg font-bold hover:text-salmon-deep">{data.customer.name ?? "Cliente"}</Link>
            <div className="mt-2 grid grid-cols-2 gap-2 text-center">
              <Card className="p-2"><p className="text-[11px] text-ink/55">pedidos</p><p className="font-bold">{data.stats?.n ?? 0}</p></Card>
              <Card className="p-2"><p className="text-[11px] text-ink/55">gasto</p><p className="font-bold">{brl(data.stats?.spent ?? 0)}</p></Card>
            </div>
            {data.customer.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{data.customer.tags.map((t) => <Badge key={t}>#{t}</Badge>)}</div>}
            {data.customer.notes && <p className="mt-3 rounded-xl bg-amber-50 p-2.5 text-xs">{data.customer.notes}</p>}
            <p className="mt-4 text-sm font-semibold">Últimos pedidos</p>
            <ul className="mt-2 flex flex-col gap-2">
              {data.orders.map((o) => (
                <li key={o.id}><Card className="p-3 text-sm">
                  <div className="flex justify-between"><b>#{o.code}</b><Badge tone={o.status === "entregue" ? "ok" : o.status === "cancelado" ? "danger" : "salmon"}>{ORDER_STATUS[o.status]}</Badge></div>
                  <p className="mt-1 text-xs text-ink/55">{fmtTime(o.created_at)} · {PAYMENT_LABEL[o.payment_method]} · {o.payment_status}</p>
                  <p className="mt-1 font-semibold">{brl(o.total_cents)}</p>
                  <button className="mt-1 text-xs font-semibold text-salmon-deep underline cursor-pointer" onClick={() => setText(`Acompanha teu pedido #${o.code} aqui: ${site}/pedido/${o.code}`)}>enviar link do pedido</button>
                </Card></li>
              ))}
              {!data.orders.length && <p className="text-sm text-ink/55">Ainda não pediu.</p>}
            </ul>
          </>
        ) : <p className="text-sm text-ink/55">Contato ainda não é cliente cadastrado.</p>}
      </aside>
    </div>
  );
}

/** Simulador de mensagem recebida (desenvolvimento sem WhatsApp configurado) */
function Simulator({ onSent }: { onSent: () => void }) {
  const [phone, setPhone] = useState("(51) 99111-2233");
  const [text, setText] = useState("oi");
  return (
    <form className="border-t border-ink/10 bg-ink/[.03] p-3" onSubmit={async (e) => { e.preventDefault(); await api("/api/admin/wa/simulate", { body: { phone, text } }); setText(""); onSent(); }}>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink/60"><FlaskConical className="size-3.5" />Simular mensagem de cliente</p>
      <div className="flex gap-1.5"><Input className="h-9 w-36 text-sm" value={phone} onChange={(e) => setPhone(e.target.value)} /><Input className="h-9 text-sm" value={text} onChange={(e) => setText(e.target.value)} /><Button size="sm" variant="ink">ok</Button></div>
    </form>
  );
}

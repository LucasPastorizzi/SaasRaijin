"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, FlaskConical, Inbox, Paperclip, PenSquare, RefreshCw, Reply, Search, Send, X } from "lucide-react";
import { Card } from "./shell";
import { Badge, Button, cx, Field, Input, Sheet, Spinner, Textarea, useToast } from "../ui";
import { api, useApi } from "@/lib/client";
import { brl, fmtDate, fmtDateTime, fmtPhone, fmtTime, ORDER_STATUS, type OrderStatus } from "@/lib/format";

type Row = { id: number; folder: string; from_addr: string | null; from_name: string | null; to_addrs: string | null; subject: string | null; date: string; seen: number; status: string; customer_id: number | null; preview: string; attachments: string };
type ListRes = { emails: Row[]; unread: number; config: { imap: boolean; smtp: boolean; address: string | null }; syncError: string | null };
type Detail = Row & { text: string | null; html: string | null; cc: string | null; attachments: { name: string; size: number; type: string }[];
  customer: { id: number; name: string | null; phone: string } | null; orders: { code: string; status: OrderStatus; total_cents: number; created_at: string }[] };
type Draft = { to: string; cc?: string; subject: string; text: string; inReplyToId?: number };

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

export function MailClient() {
  const toast = useToast();
  const [folder, setFolder] = useState<"entrada" | "enviados">("entrada");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [syncing, setSyncing] = useState(false);
  const url = `/api/admin/email?folder=${folder}&q=${encodeURIComponent(q)}`;
  const { data, reload, setData } = useApi<ListRes>(url, 20000);

  // busca e-mails novos no servidor ao abrir e a cada 2 min
  const sync = async (silent = false) => {
    setSyncing(true);
    try {
      const r = await api<ListRes>(`${url}&sync=1`);
      setData(r);
      if (r.syncError && !silent) toast(r.syncError, "error");
    } catch (e) { if (!silent) toast((e as Error).message, "error"); } finally { setSyncing(false); }
  };
  useEffect(() => {
    let alive = true;
    const go = () => api<ListRes>(`/api/admin/email?folder=entrada&sync=1`).then((r) => { if (alive && folder === "entrada" && !q) setData(r); }).catch(() => {});
    go();
    const t = setInterval(go, 120_000);
    return () => { alive = false; clearInterval(t); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const live = data?.config.imap && data?.config.smtp;
  return (
    <div className="flex h-[calc(100dvh-3.5rem-4.5rem)] lg:h-dvh">
      <aside className={cx("flex w-full flex-col border-r border-ink/10 md:w-96 md:shrink-0", sel && "hidden md:flex")}>
        <div className="px-4 pb-3 pt-5">
          <div className="flex items-center justify-between gap-2">
            <h1 className="h-title text-3xl">e-mail</h1>
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" aria-label="Atualizar" onClick={() => sync()} disabled={syncing}><RefreshCw className={cx("size-4", syncing && "animate-spin")} /></Button>
              <Button size="sm" onClick={() => setDraft({ to: "", subject: "", text: "" })}><PenSquare className="size-4" />Escrever</Button>
            </div>
          </div>
          <p className="mt-1 text-xs text-ink/55">{live ? data?.config.address : data ? "Modo simulação (configure EMAIL_* no .env.local)" : ""}</p>
          <div className="mt-3 flex gap-1.5">
            {([["entrada", "Entrada", Inbox], ["enviados", "Enviados", Send]] as const).map(([k, l, Icon]) => (
              <button key={k} onClick={() => { setFolder(k); setSel(null); }} className={cx("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold cursor-pointer", folder === k ? "bg-ink text-paper" : "bg-ink/6")}>
                <Icon className="size-3.5" />{l}{k === "entrada" && !!data?.unread && <span className="rounded-full bg-salmon px-1.5 text-white">{data.unread}</span>}
              </button>
            ))}
          </div>
          <label className="mt-3 flex h-10 items-center gap-2 rounded-xl border border-ink/12 bg-white/70 px-3"><Search className="size-4 text-ink/40" />
            <input className="h-full flex-1 bg-transparent text-sm outline-none" placeholder="Buscar e-mails" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!data ? <div className="p-6"><Spinner /></div> : data.emails.map((m) => (
            <button key={m.id} onClick={() => setSel(m.id)} className={cx("block w-full border-b border-ink/6 px-4 py-3 text-left cursor-pointer", sel === m.id ? "bg-salmon/10" : "hover:bg-ink/[.03]")}>
              <span className="flex items-center justify-between gap-2">
                <span className={cx("truncate text-sm", !m.seen && "font-bold")}>
                  {!m.seen && <span className="mr-1.5 inline-block size-2 rounded-full bg-salmon align-middle" />}
                  {folder === "entrada" ? (m.from_name || m.from_addr) : `Para: ${m.to_addrs}`}
                </span>
                <span className="shrink-0 text-[11px] text-ink/45">{isToday(m.date) ? fmtTime(m.date) : fmtDate(m.date)}</span>
              </span>
              <span className={cx("mt-0.5 block truncate text-sm", !m.seen ? "font-semibold" : "text-ink/80")}>{m.subject}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink/50">
                {m.customer_id && <Badge tone="salmon">cliente</Badge>}
                {JSON.parse(m.attachments).length > 0 && <Paperclip className="size-3" />}
                {m.status !== "ok" && folder === "enviados" && <Badge tone={m.status === "enviado" ? "ok" : m.status === "falhou" ? "danger" : "neutral"}>{m.status}</Badge>}
                <span className="truncate">{m.preview}</span>
              </span>
            </button>
          ))}
          {data && !data.emails.length && <p className="p-6 text-center text-sm text-ink/55">Nenhum e-mail aqui</p>}
        </div>
        {data && !data.config.imap && <Simulator onDone={reload} />}
      </aside>

      <section className={cx("min-w-0 flex-1", !sel && "hidden md:block")}>
        {sel ? <MailView id={sel} onBack={() => setSel(null)} onReply={setDraft} onRead={reload} /> : <div className="grid h-full place-items-center text-ink/45">Escolha um e-mail</div>}
      </section>

      {draft && <Composer draft={draft} live={!!data?.config.smtp} onClose={() => setDraft(null)} onSent={() => { setDraft(null); reload(); }} />}
    </div>
  );
}

function MailView({ id, onBack, onReply, onRead }: { id: number; onBack: () => void; onReply: (d: Draft) => void; onRead: () => void }) {
  const { data: m } = useApi<Detail>(`/api/admin/email/${id}`);
  useEffect(() => { if (m) onRead(); }, [m?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!m) return <div className="grid h-full place-items-center"><Spinner /></div>;
  const incoming = m.folder === "entrada";
  const reply = () => onReply({
    to: incoming ? m.from_addr ?? "" : m.to_addrs ?? "",
    subject: /^re:/i.test(m.subject ?? "") ? m.subject ?? "" : `Re: ${m.subject ?? ""}`,
    text: `\n\n— Em ${fmtDateTime(m.date)}, ${m.from_name || m.from_addr} escreveu:\n${(m.text ?? "").split("\n").map((l) => `> ${l}`).join("\n").slice(0, 4000)}`,
    inReplyToId: m.id,
  });
  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-ink/10 px-5 py-4">
          <button className="mb-2 inline-flex items-center gap-1 text-sm text-ink/60 md:hidden cursor-pointer" onClick={onBack}><ArrowLeft className="size-4" />Voltar</button>
          <h2 className="text-xl font-bold leading-tight">{m.subject}</h2>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <p><b>{m.from_name || m.from_addr}</b> <span className="text-ink/55">&lt;{m.from_addr}&gt;</span><span className="block text-xs text-ink/55">para {m.to_addrs}{m.cc ? ` · cc ${m.cc}` : ""} · {fmtDateTime(m.date)}</span></p>
            <Button size="sm" variant="ink" onClick={reply}><Reply className="size-4" />Responder</Button>
          </div>
          {m.attachments.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{m.attachments.map((a, i) => <Badge key={i}><Paperclip className="size-3" />{a.name} · {Math.ceil(a.size / 1024)} KB</Badge>)}</div>}
        </header>
        <div className="flex-1 overflow-y-auto bg-white">
          {m.html
            // HTML do e-mail isolado: iframe sem scripts, sem acesso ao painel
            ? <iframe title="Conteúdo do e-mail" sandbox="allow-popups allow-popups-to-escape-sandbox" className="h-full min-h-[60vh] w-full"
                srcDoc={`<base target="_blank"><meta name="referrer" content="no-referrer"><style>body{font-family:system-ui,sans-serif;font-size:14px;color:#161412;margin:20px;word-wrap:break-word}img{max-width:100%;height:auto}</style>${m.html}`} />
            : <pre className="whitespace-pre-wrap break-words p-5 font-sans text-[14.5px] leading-relaxed">{m.text}</pre>}
        </div>
      </div>
      <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-ink/10 p-4 xl:block">
        {m.customer ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">Cliente</p>
            <Link href={`/painel/clientes/${m.customer.id}`} className="mt-1 block text-lg font-bold hover:text-salmon-deep">{m.customer.name ?? "Cliente"}</Link>
            <p className="text-sm text-ink/60">{fmtPhone(m.customer.phone)}</p>
            <p className="mt-4 text-sm font-semibold">Últimos pedidos</p>
            <ul className="mt-2 flex flex-col gap-2">{m.orders.map((o) => (
              <li key={o.code}><Card className="p-3 text-sm"><div className="flex justify-between"><b>#{o.code}</b><Badge tone={o.status === "entregue" ? "ok" : o.status === "cancelado" ? "danger" : "salmon"}>{ORDER_STATUS[o.status]}</Badge></div>
                <p className="mt-1 text-xs text-ink/55">{fmtDate(o.created_at)} · {brl(o.total_cents)}</p></Card></li>
            ))}</ul>
          </>
        ) : <p className="text-sm text-ink/55">Remetente não está no CRM. Cadastre o e-mail na ficha do cliente para ligar as mensagens a ele.</p>}
      </aside>
    </div>
  );
}

function Composer({ draft, live, onClose, onSent }: { draft: Draft; live: boolean; onClose: () => void; onSent: () => void }) {
  const toast = useToast();
  const [d, setD] = useState(draft);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open onClose={onClose} wide title={draft.inReplyToId ? "Responder e-mail" : "Novo e-mail"} footer={
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ink/55">{live ? "Envia pela conta de e-mail da loja" : "Modo simulação: o e-mail fica salvo em Enviados, sem sair de verdade"}</p>
        <Button loading={busy} disabled={!d.to || !d.subject || !d.text.trim()} onClick={async () => {
          setBusy(true);
          try { const r = await api<{ status: string }>("/api/admin/email", { body: d }); toast(r.status === "enviado" ? "E-mail enviado" : "E-mail salvo (simulação)", "ok"); onSent(); }
          catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
        }}><Send className="size-4" />Enviar</Button>
      </div>}>
      <div className="flex flex-col gap-3">
        <Field label="Para" hint="Separe vários com vírgula"><Input type="email" multiple value={d.to} onChange={(e) => setD({ ...d, to: e.target.value })} autoFocus={!d.to} /></Field>
        <Field label="Cc (opcional)"><Input value={d.cc ?? ""} onChange={(e) => setD({ ...d, cc: e.target.value || undefined })} /></Field>
        <Field label="Assunto"><Input value={d.subject} onChange={(e) => setD({ ...d, subject: e.target.value })} /></Field>
        <Field label="Mensagem"><Textarea rows={12} value={d.text} onChange={(e) => setD({ ...d, text: e.target.value })} autoFocus={!!d.to} /></Field>
      </div>
    </Sheet>
  );
}

function Simulator({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ from: "fornecedor@exemplo.com", name: "Fornecedor Peixes", subject: "Cotação salmão da semana", text: "Olá! Segue a cotação do salmão para esta semana. Fico no aguardo do pedido." });
  if (!open) return <button className="flex items-center gap-1.5 border-t border-ink/10 px-4 py-3 text-xs font-semibold text-ink/60 hover:bg-ink/[.03] cursor-pointer" onClick={() => setOpen(true)}><FlaskConical className="size-3.5" />Simular e-mail recebido</button>;
  return (
    <form className="flex flex-col gap-2 border-t border-ink/10 bg-ink/[.03] p-3" onSubmit={async (e) => { e.preventDefault(); await api("/api/admin/email/simulate", { body: f }); setOpen(false); onDone(); }}>
      <div className="flex items-center justify-between"><p className="flex items-center gap-1.5 text-xs font-semibold text-ink/60"><FlaskConical className="size-3.5" />Simular e-mail recebido</p><button type="button" aria-label="Fechar" onClick={() => setOpen(false)} className="cursor-pointer"><X className="size-4" /></button></div>
      <Input className="h-9 text-sm" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} placeholder="De (e-mail)" />
      <Input className="h-9 text-sm" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder="Assunto" />
      <Textarea className="text-sm" rows={2} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
      <Button size="sm" variant="ink">Receber</Button>
    </form>
  );
}

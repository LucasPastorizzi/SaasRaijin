"use client";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Printer, Send, Sparkles, X, RotateCcw, Wrench } from "lucide-react";
import { Button, cx, Textarea } from "../ui";
import { api } from "@/lib/client";
import { brl, fmtPhone, PAYMENT_LABEL } from "@/lib/format";
import type { PrintDoc } from "@/lib/server/ai";

type Turn = { role: "user" | "assistant"; content: string; prints?: PrintDoc[]; tools?: string[]; error?: boolean };

const SUGGESTIONS = [
  "Como foram as vendas dos últimos 7 dias comparado com a semana anterior?",
  "Quais clientes VIP estão há mais tempo sem pedir?",
  "Qual o item mais vendido nas sextas-feiras?",
  "Imprime o relatório de vendas de hoje",
  "Imprime a comanda do último pedido",
  "Quanto cada motoboy tem para acertar?",
];
const TOOL_LABEL: Record<string, string> = {
  relatorio_vendas: "relatório de vendas", buscar_pedidos: "pedidos", pedidos_em_andamento: "pedidos abertos", clientes: "clientes",
  cardapio: "cardápio", motoboys: "motoboys", caixa: "caixa", consulta_sql: "consulta no banco", preparar_impressao: "impressão", imprimir_comanda: "comanda",
};

export function AssistantButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Abrir assistente de IA"
        className="fixed bottom-24 right-4 z-40 flex h-12 items-center gap-2 rounded-full bg-ink px-4 font-semibold text-paper shadow-[0_12px_30px_-8px_rgba(22,20,18,.6)] transition hover:bg-salmon lg:bottom-6 cursor-pointer">
        <Sparkles className="size-4.5 text-salmon-soft" />Assistente
      </button>
      {open && <AssistantPanel onClose={() => setOpen(false)} />}
    </>
  );
}

function AssistantPanel({ onClose }: { onClose: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState<PrintDoc | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [turns, busy]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);

  const ask = async (q: string) => {
    if (!q.trim() || busy) return;
    const next = [...turns.filter((t) => !t.error), { role: "user" as const, content: q.trim() }];
    setTurns(next); setText(""); setBusy(true);
    try {
      const r = await api<{ reply: string; prints: PrintDoc[]; toolsUsed: string[] }>("/api/admin/ai", {
        body: { messages: next.map((t) => ({ role: t.role, content: t.content })).slice(-30) },
      });
      setTurns([...next, { role: "assistant", content: r.reply, prints: r.prints, tools: r.toolsUsed }]);
    } catch (e) {
      setTurns([...next, { role: "assistant", content: (e as Error).message, error: true }]);
    } finally { setBusy(false); }
  };

  const print = (doc: PrintDoc) => {
    setPrinting(doc);
    setTimeout(() => { window.print(); setPrinting(null); }, 80);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Assistente de IA">
      <div className="absolute inset-0 bg-ink/40 anim-fade" onClick={onClose} />
      <section className="relative flex h-full w-full max-w-xl flex-col bg-paper shadow-2xl anim-rise">
        <header className="flex items-center justify-between gap-3 border-b border-ink/10 bg-ink px-5 py-4 text-paper">
          <div>
            <p className="flex items-center gap-2 text-lg font-bold"><Sparkles className="size-5 text-salmon" />assistente raijin</p>
            <p className="text-xs text-paper/60">Pergunte sobre vendas, clientes, pedidos e motoboys, ou peça uma impressão.</p>
          </div>
          <div className="flex gap-1">
            {turns.length > 0 && <button aria-label="Nova conversa" title="Nova conversa" className="grid size-9 place-items-center rounded-full hover:bg-white/10 cursor-pointer" onClick={() => setTurns([])}><RotateCcw className="size-4" /></button>}
            <button aria-label="Fechar" className="grid size-9 place-items-center rounded-full hover:bg-white/10 cursor-pointer" onClick={onClose}><X className="size-5" /></button>
          </div>
        </header>

        <div className="seigaiha flex-1 overflow-y-auto px-4 py-5">
          {!turns.length && (
            <div className="flex flex-col gap-2">
              <p className="mb-1 text-sm font-semibold text-ink/60">Experimente:</p>
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => ask(s)} className="rounded-2xl bg-white/80 px-4 py-3 text-left text-sm ring-1 ring-ink/8 transition hover:ring-salmon cursor-pointer">{s}</button>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-3">
            {turns.map((t, i) => (
              <div key={i} className={cx("max-w-[92%]", t.role === "user" ? "self-end" : "self-start")}>
                <div className={cx("rounded-2xl px-4 py-3 text-[14.5px] leading-relaxed shadow-sm",
                  t.role === "user" ? "rounded-br-md bg-salmon text-white" : t.error ? "rounded-bl-md bg-torii/10 text-torii" : "rounded-bl-md bg-white")}>
                  {t.role === "assistant" && !t.error ? <Markdown text={t.content} /> : <p className="whitespace-pre-wrap">{t.content}</p>}
                </div>
                {t.tools && t.tools.length > 0 && (
                  <p className="mt-1 flex items-center gap-1 px-1 text-[11px] text-ink/45"><Wrench className="size-3" />consultou: {t.tools.map((x) => TOOL_LABEL[x] ?? x).join(", ")}</p>
                )}
                {t.prints?.map((p, k) => (
                  <div key={k} className="mt-2 flex items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-paper">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{p.kind === "comanda" ? `Comanda #${p.order.code}` : p.titulo}</p>
                      <p className="text-xs text-paper/60">{p.kind === "comanda" || p.formato === "termica_80mm" ? "Impressora térmica 80 mm" : "Folha A4"}</p>
                    </div>
                    <Button size="sm" onClick={() => print(p)}><Printer className="size-4" />Imprimir</Button>
                  </div>
                ))}
              </div>
            ))}
            {busy && (
              <div className="self-start rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-sm">
                <span className="flex gap-1">{[0, 1, 2].map((d) => <span key={d} className="size-2 animate-bounce rounded-full bg-salmon" style={{ animationDelay: `${d * 120}ms` }} />)}</span>
              </div>
            )}
            <div ref={end} />
          </div>
        </div>

        <form className="border-t border-ink/10 p-3" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
          <div className="flex items-end gap-2">
            <Textarea rows={1} className="min-h-12 resize-none" placeholder="Ex.: quanto vendemos ontem no Pix?" value={text} disabled={busy}
              onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(text); } }} />
            <Button className="size-12 shrink-0 !px-0" aria-label="Enviar" disabled={busy || !text.trim()}><Send className="size-4.5" /></Button>
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-ink/45">A IA só lê os dados; não altera pedidos, preços ou cadastros. Confira números importantes no relatório.</p>
        </form>
      </section>
      {printing && createPortal(<PrintView doc={printing} />, document.body)}
    </div>
  );
}

/* ---------- impressão ---------- */
function PrintView({ doc }: { doc: PrintDoc }) {
  const issued = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  if (doc.kind === "comanda") {
    const o = doc.order;
    return (
      <div className="printing print-80">
        <p className="center bold">RAIJIN SUSHI</p>
        <p>Pedido #{o.code} — {new Date(o.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
        <p>{o.type === "delivery" ? "ENTREGA" : "RETIRADA"} · {o.customer_name} · {fmtPhone(o.customer_phone)}</p>
        {o.address && <p>{o.address.street}, {o.address.number} {o.address.complement ?? ""} — {o.address.zone}</p>}
        <hr />
        {o.items.map((i, k) => (
          <div key={k}><p>{i.qty}x {i.name}{i.variant ? ` (${i.variant})` : ""} <span className="right">{brl(i.total_cents)}</span></p>
            {i.options.map((x, j) => <p key={j}>&nbsp;&nbsp;+ {x.name}</p>)}{i.notes && <p>&nbsp;&nbsp;obs: {i.notes}</p>}</div>
        ))}
        <hr />
        <p className="bold">TOTAL {brl(o.total_cents)}</p>
        <p>{PAYMENT_LABEL[o.payment_method]} {o.payment_status === "pago" ? "(PAGO)" : ""}</p>
        {o.change_for_cents && <p>Troco para {brl(o.change_for_cents)}</p>}
        {o.notes && <p>Obs: {o.notes}</p>}
        <p className="small">Reimpressão · {issued}</p>
      </div>
    );
  }
  const thermal = doc.formato === "termica_80mm";
  return (
    <div className={cx("printing", thermal ? "print-80" : "print-a4")}>
      <header className="ph">
        <div><p className="brand">raijin <span>SUSHI</span></p><h1>{doc.titulo}</h1>{doc.subtitulo && <p className="sub">{doc.subtitulo}</p>}</div>
        {!thermal && <p className="small">Emitido em {issued}</p>}
      </header>
      {doc.blocos.map((b, i) => (
        <Fragment key={i}>
          {b.tipo === "texto" && <p className="txt">{b.texto}</p>}
          {b.tipo === "destaques" && <div className="kpis">{b.itens.map((it, k) => <div key={k}><span>{it.rotulo}</span><b>{it.valor}</b></div>)}</div>}
          {b.tipo === "tabela" && (
            <table>
              <thead><tr>{b.colunas.map((c, k) => <th key={k}>{c}</th>)}</tr></thead>
              <tbody>{b.linhas.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
              {b.total && <tfoot><tr>{b.total.map((c, j) => <td key={j}>{c}</td>)}</tr></tfoot>}
            </table>
          )}
        </Fragment>
      ))}
      {thermal && <p className="small">{issued}</p>}
    </div>
  );
}

/* ---------- markdown mínimo (negrito, listas, tabelas) ---------- */
function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <Fragment key={i}>{p}</Fragment>));
}
function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*\|/.test(l)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
        i++;
      }
      i--;
      out.push(
        <div key={i} className="my-2 overflow-x-auto"><table className="w-full text-[13px]">
          <thead><tr>{rows[0]?.map((c, k) => <th key={k} className="border-b border-ink/15 px-2 py-1 text-left font-semibold">{inline(c)}</th>)}</tr></thead>
          <tbody>{rows.slice(1).map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j} className="border-b border-ink/8 px-2 py-1">{inline(c)}</td>)}</tr>)}</tbody>
        </table></div>);
    } else if (/^\s*[-*•]\s+/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*•]\s+/, "")); i++; }
      i--;
      out.push(<ul key={i} className="my-1.5 list-disc space-y-0.5 pl-5">{items.map((it, k) => <li key={k}>{inline(it)}</li>)}</ul>);
    } else if (/^\s*\d+[.)]\s+/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+[.)]\s+/, "")); i++; }
      i--;
      out.push(<ol key={i} className="my-1.5 list-decimal space-y-0.5 pl-5">{items.map((it, k) => <li key={k}>{inline(it)}</li>)}</ol>);
    } else if (/^#{1,4}\s+/.test(l)) {
      out.push(<p key={i} className="mt-2 font-bold">{inline(l.replace(/^#+\s+/, ""))}</p>);
    } else if (l.trim()) {
      out.push(<p key={i} className="my-1">{inline(l)}</p>);
    }
  }
  return <div>{out}</div>;
}

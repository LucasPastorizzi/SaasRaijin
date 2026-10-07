"use client";
import { useState } from "react";
import { Download, Star } from "lucide-react";
import { Card, PageHead, Stat } from "./shell";
import { Button, cx, Spinner } from "../ui";
import { useApi } from "@/lib/client";
import { brl, PAYMENT_LABEL } from "@/lib/format";
import { DAY_SHORT } from "@/lib/hours";

type Report = {
  totals: { n: number; gross: number; fees: number; discounts: number }; canceled: number; avgTicket: number;
  byDay: { day: string; n: number; total: number }[]; byWeekday: { wd: string; n: number; total: number }[];
  topItems: { name: string; qty: number; total: number }[]; byPayment: { payment_method: string; n: number; total: number }[];
  timing: { prep: number | null; delivery: number | null }; repeat: { total: number; repeat: number }; coupons: { coupon_code: string; n: number; discount: number }[];
  rating: { r: number | null; n: number };
};

export function Reports() {
  const [days, setDays] = useState(30);
  const { data: r } = useApi<Report>(`/api/admin/reports?days=${days}`);
  const csv = () => {
    if (!r) return;
    const rows = [["dia", "pedidos", "faturamento"], ...r.byDay.map((d) => [d.day, d.n, (d.total / 100).toFixed(2).replace(".", ",")])];
    const blob = new Blob([rows.map((x) => x.join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `raijin-faturamento-${days}d.csv`; a.click();
  };
  return (
    <div>
      <PageHead title="relatórios" sub="Números do delivery e do balcão">
        <div className="flex rounded-xl bg-ink/6 p-1">{[7, 30, 90].map((d) => <button key={d} onClick={() => setDays(d)} className={cx("rounded-lg px-3 py-1.5 text-sm font-semibold cursor-pointer", days === d ? "bg-ink text-paper" : "")}>{d} dias</button>)}</div>
        <Button size="sm" variant="line" onClick={csv}><Download className="size-4" />CSV</Button>
      </PageHead>
      {!r ? <div className="grid h-60 place-items-center"><Spinner /></div> : (
        <div className="flex flex-col gap-4 px-4 pb-10 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Faturamento" value={brl(r.totals.gross)} hint={`${r.totals.n} pedidos · ${r.canceled} cancelados`} />
            <Stat label="Ticket médio" value={brl(r.avgTicket)} />
            <Stat label="Recompra" value={r.repeat.total ? `${Math.round((r.repeat.repeat / r.repeat.total) * 100)}%` : "—"} hint={`${r.repeat.repeat} de ${r.repeat.total} clientes pediram 2+ vezes`} />
            <Stat label="Avaliação" value={r.rating.r ? <span className="inline-flex items-center gap-1">{r.rating.r.toFixed(1)}<Star className="size-5 fill-salmon text-salmon" /></span> : "—"} hint={`${r.rating.n} avaliações`} />
            <Stat label="Tempo de preparo" value={r.timing.prep ? `${Math.round(r.timing.prep)} min` : "—"} hint="do aceite ao pronto" />
            <Stat label="Tempo total" value={r.timing.delivery ? `${Math.round(r.timing.delivery)} min` : "—"} hint="do pedido à entrega" />
            <Stat label="Taxas de entrega" value={brl(r.totals.fees)} />
            <Stat label="Descontos" value={brl(r.totals.discounts)} />
          </div>

          <Card className="p-4">
            <p className="font-bold">Faturamento por dia</p>
            <Bars data={r.byDay.map((d) => ({ label: d.day.slice(8, 10) + "/" + d.day.slice(5, 7), value: d.total, sub: `${d.n} pedidos` }))} />
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <p className="font-bold">Por dia da semana</p>
              <Bars data={[0, 1, 2, 3, 4, 5, 6].map((w) => { const x = r.byWeekday.find((d) => Number(d.wd) === w); return { label: DAY_SHORT[w], value: x?.total ?? 0, sub: `${x?.n ?? 0} pedidos` }; })} />
            </Card>
            <Card className="p-4">
              <p className="font-bold">Formas de pagamento</p>
              <ul className="mt-3 flex flex-col gap-2.5">{r.byPayment.map((p) => {
                const pct = r.totals.gross ? (p.total / r.totals.gross) * 100 : 0;
                return <li key={p.payment_method}><div className="flex justify-between text-sm"><span>{PAYMENT_LABEL[p.payment_method]}</span><b>{brl(p.total)} · {Math.round(pct)}%</b></div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink/8"><div className="h-full rounded-full bg-salmon" style={{ width: `${pct}%` }} /></div></li>;
              })}</ul>
            </Card>
            <Card className="p-4">
              <p className="font-bold">Mais vendidos</p>
              <ol className="mt-2 divide-y divide-ink/8 text-sm">{r.topItems.map((t, i) => <li key={t.name} className="flex justify-between py-2"><span><span className="mr-2 font-jp text-salmon">{["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"][i]}</span>{t.name}</span><span><b>{t.qty}×</b> <span className="text-ink/55">{brl(t.total)}</span></span></li>)}</ol>
            </Card>
            <Card className="p-4">
              <p className="font-bold">Cupons</p>
              <ul className="mt-2 divide-y divide-ink/8 text-sm">{r.coupons.map((c) => <li key={c.coupon_code} className="flex justify-between py-2"><span className="font-mono font-semibold">{c.coupon_code}</span><span>{c.n} usos · − {brl(c.discount)}</span></li>)}
                {!r.coupons.length && <li className="py-2 text-ink/55">Nenhum cupom usado no período</li>}</ul>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Bars({ data }: { data: { label: string; value: number; sub: string }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="no-scrollbar mt-4 flex h-48 items-end gap-1 overflow-x-auto">
      {data.map((d, i) => (
        <div key={i} className="group flex min-w-6 flex-1 flex-col items-center gap-1" title={`${d.label}: ${brl(d.value)} · ${d.sub}`}>
          <span className="text-[10px] font-semibold text-ink/0 group-hover:text-ink/70">{Math.round(d.value / 100)}</span>
          <div className="w-full rounded-t-md bg-salmon/80 transition group-hover:bg-salmon" style={{ height: `${(d.value / max) * 150}px`, minHeight: d.value ? 3 : 0 }} />
          <span className="text-[10px] text-ink/50">{d.label}</span>
        </div>
      ))}
      {!data.length && <p className="m-auto text-sm text-ink/55">Sem pedidos no período</p>}
    </div>
  );
}

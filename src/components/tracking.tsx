"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Check, Copy, MessageCircle, Star, Bike, ChefHat, PackageCheck, Receipt, Store } from "lucide-react";
import { useShop } from "./shop";
import { Badge, Button, cx, Spinner, Textarea, useToast } from "./ui";
import { Bolt } from "./logo";
import { api, useApi } from "@/lib/client";
import { brl, fmtTime, ORDER_STATUS, PAYMENT_LABEL, type OrderStatus } from "@/lib/format";
import type { OrderDetail } from "@/lib/server/orders";

type Tracked = OrderDetail & { courier: { name: string; vehicle: string } | null };

export function Tracking() {
  const { code } = useParams<{ code: string }>();
  const fresh = useSearchParams().get("novo") === "1";
  const { menu, requireLogin, reloadMe } = useShop();
  const { data: o, error, reload } = useApi<Tracked>(`/api/orders/${code}`, 5000);
  const toast = useToast();

  if (error?.status === 401 || error?.status === 403) return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="h-title text-3xl">entre para ver o pedido</h1>
      <Button className="mt-6" onClick={async () => { if (await requireLogin()) { await reloadMe(); reload(); } }}>Entrar com WhatsApp</Button>
    </div>
  );
  if (error) return <p className="py-24 text-center text-ink/60">{error.message}</p>;
  if (!o) return <div className="grid min-h-[60dvh] place-items-center"><Spinner /></div>;

  const steps: { k: OrderStatus; label: string; icon: typeof Check }[] = [
    { k: "novo", label: "Recebido", icon: Receipt },
    { k: "aceito", label: "Aceito", icon: Check },
    { k: "preparo", label: "Em preparo", icon: ChefHat },
    ...(o.type === "delivery"
      ? [{ k: "saiu" as const, label: "Saiu para entrega", icon: Bike }, { k: "entregue" as const, label: "Entregue", icon: PackageCheck }]
      : [{ k: "pronto" as const, label: "Pronto para retirar", icon: Store }, { k: "entregue" as const, label: "Retirado", icon: PackageCheck }]),
  ];
  const order: OrderStatus[] = ["novo", "aceito", "preparo", "pronto", "saiu", "entregue"];
  const reached = (k: OrderStatus) => order.indexOf(o.status) >= order.indexOf(k) || (k === "preparo" && order.indexOf(o.status) > order.indexOf("aceito"));
  const at = (k: string) => o.events.find((e) => e.status === k)?.at;
  const wa = menu?.store.phone.replace(/\D/g, "");

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      {fresh && o.status === "novo" && (
        <div className="anim-pop mb-6 flex flex-col items-center rounded-3xl bg-ink px-6 py-8 text-center text-paper">
          <Bolt className="size-20" />
          <h1 className="h-title mt-2 text-4xl">pedido enviado!</h1>
          <p className="mt-2 text-paper/70">Já avisamos a cozinha. Tu recebe cada etapa aqui e no WhatsApp.</p>
        </div>
      )}

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink/55">Pedido #{o.code}</p>
          <h1 className="h-title mt-1 text-4xl">{o.status === "cancelado" ? "cancelado" : ORDER_STATUS[o.status].toLowerCase()}</h1>
        </div>
        {o.eta_minutes && !["entregue", "cancelado"].includes(o.status) && o.accepted_at && (
          <div className="text-right"><p className="text-xs text-ink/55">previsão</p><p className="text-2xl font-bold">{fmtTime(new Date(new Date(o.accepted_at).getTime() + o.eta_minutes * 60000).toISOString())}</p></div>
        )}
      </div>

      {o.scheduled_for && <Badge tone="salmon" className="mt-3">Agendado para {new Date(o.scheduled_for).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</Badge>}

      {o.status === "cancelado" ? (
        <p className="mt-5 rounded-2xl bg-torii/10 p-4 text-torii">Motivo: {o.cancel_reason}</p>
      ) : (
        <ol className="mt-6 flex flex-col">
          {steps.map((s, i) => {
            const done = reached(s.k), current = done && (i === steps.length - 1 || !reached(steps[i + 1].k));
            return (
              <li key={s.k} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span className={cx("grid size-10 place-items-center rounded-full transition-colors", done ? "bg-salmon text-white" : "bg-ink/8 text-ink/35", current && o.status !== "entregue" && "pulse-ring")}><s.icon className="size-5" /></span>
                  {i < steps.length - 1 && <span className={cx("w-0.5 flex-1 min-h-6", reached(steps[i + 1].k) ? "bg-salmon" : "bg-ink/10")} />}
                </div>
                <div className="pb-5 pt-2"><p className={cx("font-semibold", !done && "text-ink/40")}>{s.label}</p>{at(s.k) && <p className="text-xs text-ink/55">{fmtTime(at(s.k))}</p>}</div>
              </li>
            );
          })}
        </ol>
      )}

      {o.status === "saiu" && (
        <div className="rounded-3xl bg-ink p-5 text-paper">
          <p className="text-sm text-paper/65">{o.courier?.name ?? "Nosso motoboy"} está a caminho 🛵</p>
          <p className="mt-2 text-sm">Código de entrega — informe ao motoboy:</p>
          <p className="mt-1 font-mono text-4xl font-bold tracking-[.3em] text-salmon">{o.delivery_pin}</p>
        </div>
      )}

      {o.payment_method === "pix" && o.payment_status === "pendente" && o.status !== "cancelado" && <PixBox code={o.code} total={o.total_cents} onPaid={reload} demo={!!menu?.demo} />}

      {o.status === "entregue" && !o.rating && <Review code={o.code} onDone={() => { reload(); toast("Valeu pela avaliação! 🧡", "ok"); }} />}

      <section className="mt-6 rounded-3xl bg-white/60 p-5 ring-1 ring-ink/8">
        <h2 className="font-bold">Itens</h2>
        <ul className="mt-3 flex flex-col gap-2.5 text-sm">
          {o.items.map((i, k) => (
            <li key={k} className="flex justify-between gap-3">
              <span><b>{i.qty}×</b> {i.name}{i.variant ? ` · ${i.variant}` : ""}
                {(i.options.length > 0 || i.notes) && <span className="block text-xs text-ink/55">{[...i.options.map((x) => x.name), i.notes && `“${i.notes}”`].filter(Boolean).join(" · ")}</span>}</span>
              <span className="font-semibold">{brl(i.total_cents)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 grid grid-cols-2 gap-y-1 border-t border-ink/10 pt-3 text-sm">
          <dt className="text-ink/60">Subtotal</dt><dd className="text-right">{brl(o.subtotal_cents)}</dd>
          {o.type === "delivery" && <><dt className="text-ink/60">Entrega</dt><dd className="text-right">{brl(o.delivery_fee_cents)}</dd></>}
          {!!o.discount_cents && <><dt className="text-ink/60">Desconto {o.coupon_code && `(${o.coupon_code})`}</dt><dd className="text-right text-ok">− {brl(o.discount_cents)}</dd></>}
          {!!o.loyalty_used_cents && <><dt className="text-ink/60">Cashback</dt><dd className="text-right text-ok">− {brl(o.loyalty_used_cents)}</dd></>}
          <dt className="font-bold">Total</dt><dd className="text-right font-bold">{brl(o.total_cents)}</dd>
          <dt className="text-ink/60">Pagamento</dt><dd className="text-right">{PAYMENT_LABEL[o.payment_method]}{o.payment_status === "pago" ? " · pago" : ""}</dd>
          {o.change_for_cents && <><dt className="text-ink/60">Troco para</dt><dd className="text-right">{brl(o.change_for_cents)}</dd></>}
        </dl>
        {o.address && <p className="mt-3 border-t border-ink/10 pt-3 text-sm text-ink/70">📍 {o.address.street}, {o.address.number}{o.address.complement ? ` — ${o.address.complement}` : ""} · {o.address.zone}</p>}
      </section>

      <div className="mt-5 flex flex-wrap gap-2">
        {wa && <a href={`https://wa.me/${wa}?text=${encodeURIComponent(`Oi! Sobre o pedido #${o.code}`)}`} target="_blank" rel="noopener" className="inline-flex h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-paper"><MessageCircle className="size-4" />Falar com o Raijin</a>}
        <Link href="/" className="inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold ring-1 ring-ink/20">Voltar ao cardápio</Link>
      </div>
    </div>
  );
}

function PixBox({ code, total, onPaid, demo }: { code: string; total: number; onPaid: () => void; demo: boolean }) {
  const toast = useToast();
  // TODO(produção): o copia-e-cola vem do gateway (Mercado Pago/Asaas). Aqui é um exemplo.
  const copy = `00020126580014BR.GOV.BCB.PIX0136raijin-exemplo-pix52040000530398654${String((total / 100).toFixed(2)).padStart(6, "0")}5802BR5912RAIJIN SUSHI6005IVOTI62080504${code}6304ABCD`;
  return (
    <div className="mt-2 rounded-3xl bg-white/70 p-5 ring-2 ring-salmon/40">
      <p className="font-bold">Pague com Pix · {brl(total)}</p>
      <p className="mt-1 text-sm text-ink/60">Copie o código e cole no app do teu banco. A confirmação é automática.</p>
      <div className="mt-3 flex gap-2">
        <code className="min-w-0 flex-1 truncate rounded-xl bg-ink/6 px-3 py-2.5 text-xs">{copy}</code>
        <Button variant="ink" onClick={() => { navigator.clipboard.writeText(copy); toast("Código Pix copiado", "ok"); }}><Copy className="size-4" />Copiar</Button>
      </div>
      {demo && (
        <button className="mt-3 text-xs font-semibold text-salmon-deep underline cursor-pointer" onClick={async () => { await api(`/api/orders/${code}`, { body: { action: "pay-dev" } }); onPaid(); }}>
          (demonstração) simular pagamento confirmado
        </button>
      )}
    </div>
  );
}

function Review({ code, onDone }: { code: string; onDone: () => void }) {
  const [r, setR] = useState(0);
  const [c, setC] = useState("");
  return (
    <div className="mt-2 rounded-3xl bg-salmon/10 p-5">
      <p className="font-bold">Como foi teu pedido?</p>
      <div className="mt-2 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} aria-label={`${n} estrelas`} onClick={() => setR(n)} className="cursor-pointer"><Star className={cx("size-8", n <= r ? "fill-salmon text-salmon" : "text-ink/25")} /></button>
        ))}
      </div>
      {r > 0 && <>
        <Textarea className="mt-3" placeholder="Quer contar mais? (opcional)" value={c} onChange={(e) => setC(e.target.value)} />
        <Button className="mt-3" onClick={async () => { await api(`/api/orders/${code}`, { body: { action: "review", rating: r, comment: c || undefined } }); onDone(); }}>Enviar avaliação</Button>
      </>}
    </div>
  );
}

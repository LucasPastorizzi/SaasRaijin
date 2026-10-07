"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Bike, Store, Minus, Plus, Tag, Trash2, Wallet, QrCode, CreditCard, Banknote, Sparkles } from "lucide-react";
import { useShop } from "./shop";
import { Badge, Button, cx, DishArt, Field, Input, Select, Spinner, Textarea, useToast } from "./ui";
import { api } from "@/lib/client";
import { brl } from "@/lib/format";

type Quote = { subtotal: number; fee: number; discount: number; loyaltyUsed: number; total: number; zone: string | null };
type Pay = "pix" | "card_online" | "cash" | "card_machine";
const PAY: { id: Pay; label: string; hint: string; icon: typeof QrCode }[] = [
  { id: "pix", label: "Pix", hint: "Pague agora, confirmação na hora", icon: QrCode },
  { id: "card_online", label: "Cartão online", hint: "Crédito pelo app", icon: CreditCard },
  { id: "cash", label: "Dinheiro", hint: "Na entrega ou retirada", icon: Banknote },
  { id: "card_machine", label: "Cartão na maquininha", hint: "Débito ou crédito na entrega", icon: Wallet },
];

export function Checkout() {
  const { menu, me, cart, setQty, clear, subtotal, requireLogin } = useShop();
  const router = useRouter();
  const toast = useToast();
  const [type, setType] = useState<"delivery" | "pickup">("delivery");
  const [addrPick, setAddrId] = useState<number | "new" | null>(null);
  const [addr, setAddr] = useState({ street: "", number: "", complement: "", reference: "", zoneId: 0 });
  const [payPick, setPay] = useState<Pay>("pix");
  const [changeFor, setChangeFor] = useState("");
  const [coupon, setCoupon] = useState("");
  const [couponApplied, setCouponApplied] = useState<string | null>(null);
  const [useLoyalty, setUseLoyalty] = useState(false);
  const [notes, setNotes] = useState("");
  const [schedule, setSchedule] = useState("");
  const [quoteRaw, setQuote] = useState<Quote | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // padrões derivados: último endereço salvo e primeira forma de pagamento habilitada
  const addrId: number | "new" = addrPick ?? me?.addresses?.[0]?.id ?? "new";
  const pay: Pay = !menu || menu.payments[payPick] ? payPick : ((Object.keys(menu.payments) as Pay[]).find((k) => menu.payments[k]) ?? "cash");

  const address = useMemo(() => {
    if (type !== "delivery") return undefined;
    if (addrId !== "new") {
      const a = me?.addresses?.find((x) => x.id === addrId);
      return a ? { street: a.street, number: a.number, complement: a.complement ?? undefined, reference: a.reference ?? undefined, zoneId: a.zone_id } : undefined;
    }
    return addr.street && addr.number && addr.zoneId ? { ...addr, complement: addr.complement || undefined, reference: addr.reference || undefined } : undefined;
  }, [type, addrId, addr, me]);

  const payload = useMemo(() => ({
    items: cart.map((l) => ({ productId: l.productId, variantId: l.variantId, qty: l.qty, optionIds: l.optionIds, notes: l.notes })),
    type, address, saveAddress: addrId === "new", paymentMethod: pay,
    changeFor: pay === "cash" && changeFor ? Math.round(Number(changeFor.replace(",", ".")) * 100) : undefined,
    coupon: couponApplied ?? undefined, useLoyalty, notes: notes || undefined,
    scheduledFor: schedule ? new Date(schedule).toISOString() : undefined,
  }), [cart, type, address, addrId, pay, changeFor, couponApplied, useLoyalty, notes, schedule]);

  // orçamento no servidor (taxa, desconto, total)
  const canQuote = cart.length > 0 && (type !== "delivery" || !!address);
  const quote = canQuote ? quoteRaw : null;
  useEffect(() => {
    if (!canQuote) return;
    const t = setTimeout(() => api<Quote>("/api/quote", { body: payload }).then((q) => { setQuote(q); setQuoteErr(null); })
      .catch((e: Error) => { setQuoteErr(e.message); if (couponApplied && /cupom/i.test(e.message)) setCouponApplied(null); }), 250);
    return () => clearTimeout(t);
  }, [payload, canQuote, couponApplied]);

  if (!menu) return <div className="grid min-h-[60dvh] place-items-center"><Spinner /></div>;
  if (!cart.length) return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <span className="font-jp text-6xl text-salmon/40">空</span>
      <h1 className="h-title text-4xl">carrinho vazio</h1>
      <p className="text-ink/60">Bora escolher alguma coisa gostosa?</p>
      <Link href="/" className="inline-flex h-12 items-center rounded-2xl bg-salmon px-6 font-semibold text-white">Ver cardápio</Link>
    </div>
  );

  const zone = menu.zones.find((z) => z.id === address?.zoneId);
  const scheduling = !menu.status.open;
  const submit = async () => {
    if (!(await requireLogin())) return;
    if (scheduling && !schedule) return toast("Escolha um horário para agendar", "error");
    setBusy(true);
    try {
      const o = await api<{ code: string }>("/api/orders", { body: payload });
      clear();
      router.push(`/pedido/${o.code}?novo=1`);
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-40 pt-6">
      <h1 className="h-title text-4xl">teu pedido</h1>

      {/* itens */}
      <section className="mt-5 divide-y divide-ink/10 rounded-3xl bg-white/60 px-4 ring-1 ring-ink/8">
        {cart.map((l) => (
          <div key={l.key} className="flex items-center gap-3 py-3.5">
            <div className="size-14 shrink-0 overflow-hidden rounded-xl">{l.image ? <img src={l.image} alt="" className="size-full object-cover" /> : <DishArt seed={l.name} className="size-full" />}</div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-tight">{l.name}{l.variant ? ` · ${l.variant}` : ""}</p>
              {(l.optionNames.length > 0 || l.notes) && <p className="mt-0.5 line-clamp-2 text-xs text-ink/55">{[...l.optionNames, l.notes && `“${l.notes}”`].filter(Boolean).join(" · ")}</p>}
              <p className="mt-1 text-sm font-bold">{brl(l.unit * l.qty)}</p>
            </div>
            <div className="flex h-10 items-center rounded-xl bg-ink/6">
              <button aria-label="Menos" className="grid size-10 place-items-center cursor-pointer" onClick={() => setQty(l.key, l.qty - 1)}>{l.qty === 1 ? <Trash2 className="size-4 text-torii" /> : <Minus className="size-4" />}</button>
              <span className="w-5 text-center text-sm font-bold">{l.qty}</span>
              <button aria-label="Mais" className="grid size-10 place-items-center cursor-pointer" onClick={() => setQty(l.key, l.qty + 1)}><Plus className="size-4" /></button>
            </div>
          </div>
        ))}
        <Link href="/" className="block py-3.5 text-center text-sm font-semibold text-salmon-deep">+ Adicionar mais itens</Link>
      </section>

      {/* entrega */}
      <section className="mt-7">
        <h2 className="text-lg font-bold">Como tu quer receber?</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {([["delivery", "Entrega", Bike], ["pickup", "Retirar no balcão", Store]] as const).map(([k, label, Icon]) => (
            <button key={k} disabled={k === "pickup" && !menu.ops.pickupEnabled} onClick={() => setType(k)}
              className={cx("flex h-16 items-center justify-center gap-2 rounded-2xl border-2 font-semibold transition cursor-pointer disabled:opacity-40", type === k ? "border-salmon bg-salmon/8" : "border-ink/10 bg-white/50")}>
              <Icon className="size-5" />{label}
            </button>
          ))}
        </div>

        {type === "delivery" ? (
          <div className="mt-4 flex flex-col gap-3">
            {!!me?.addresses?.length && (
              <Field label="Endereço">
                <Select value={String(addrId)} onChange={(e) => setAddrId(e.target.value === "new" ? "new" : Number(e.target.value))}>
                  {me.addresses.map((a) => <option key={a.id} value={a.id}>{a.street}, {a.number} — {a.zone_name}</option>)}
                  <option value="new">+ Novo endereço</option>
                </Select>
              </Field>
            )}
            {addrId === "new" && (
              <div className="grid grid-cols-6 gap-3">
                <Field label="Bairro" className="col-span-6">
                  <Select value={addr.zoneId} onChange={(e) => setAddr({ ...addr, zoneId: Number(e.target.value) })}>
                    <option value={0}>Selecione o bairro</option>
                    {menu.zones.map((z) => <option key={z.id} value={z.id}>{z.name} — taxa {brl(z.fee_cents)}</option>)}
                  </Select>
                </Field>
                <Field label="Rua" className="col-span-4"><Input autoComplete="address-line1" value={addr.street} onChange={(e) => setAddr({ ...addr, street: e.target.value })} /></Field>
                <Field label="Número" className="col-span-2"><Input inputMode="numeric" value={addr.number} onChange={(e) => setAddr({ ...addr, number: e.target.value })} /></Field>
                <Field label="Complemento" className="col-span-3"><Input placeholder="Apto, bloco…" value={addr.complement} onChange={(e) => setAddr({ ...addr, complement: e.target.value })} /></Field>
                <Field label="Referência" className="col-span-3"><Input placeholder="Perto de…" value={addr.reference} onChange={(e) => setAddr({ ...addr, reference: e.target.value })} /></Field>
                <p className="col-span-6 text-xs text-ink/55">Não achou teu bairro? Ainda não entregamos aí — dá pra retirar no balcão.</p>
              </div>
            )}
            {zone && <p className="text-sm text-ink/65">Entrega em {zone.name}: {menu.ops.deliveryBaseMinutes + zone.extra_minutes}–{menu.ops.deliveryBaseMinutes + zone.extra_minutes + 10} min</p>}
          </div>
        ) : (
          <p className="mt-4 rounded-2xl bg-white/60 p-4 text-sm ring-1 ring-ink/8">Retire em <b>{menu.store.address}</b></p>
        )}
      </section>

      {scheduling && (
        <section className="mt-7">
          <h2 className="text-lg font-bold">Agendar pedido</h2>
          <p className="mt-1 text-sm text-ink/60">{menu.status.label}. Escolhe quando tu quer receber.</p>
          <Input type="datetime-local" className="mt-3" value={schedule} onChange={(e) => setSchedule(e.target.value)} min={new Date().toISOString().slice(0, 16)} />
        </section>
      )}

      {/* pagamento */}
      <section className="mt-7">
        <h2 className="text-lg font-bold">Pagamento</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {PAY.filter((p) => menu.payments[p.id]).map(({ id, label, hint, icon: Icon }) => (
            <button key={id} onClick={() => setPay(id)} className={cx("flex items-center gap-3 rounded-2xl border-2 p-3.5 text-left transition cursor-pointer", pay === id ? "border-salmon bg-salmon/8" : "border-ink/10 bg-white/50")}>
              <span className="grid size-10 place-items-center rounded-xl bg-ink/6"><Icon className="size-5" /></span>
              <span><b className="block text-[15px]">{label}</b><span className="text-xs text-ink/55">{hint}</span></span>
            </button>
          ))}
        </div>
        {pay === "cash" && (
          <Field label="Troco para quanto?" hint="Deixe vazio se não precisar de troco" className="mt-3">
            <Input inputMode="decimal" placeholder="Ex.: 100" value={changeFor} onChange={(e) => setChangeFor(e.target.value)} />
          </Field>
        )}
      </section>

      {/* cupom e cashback */}
      <section className="mt-7 flex flex-col gap-3">
        {couponApplied ? (
          <div className="flex items-center justify-between rounded-2xl bg-ok/10 px-4 py-3 text-sm"><span className="flex items-center gap-2 font-semibold text-ok"><Tag className="size-4" />Cupom {couponApplied} aplicado</span>
            <button className="font-semibold underline cursor-pointer" onClick={() => setCouponApplied(null)}>remover</button></div>
        ) : (
          <form className="flex gap-2" onSubmit={async (e) => {
            e.preventDefault();
            try { await api<Quote>("/api/quote", { body: { ...payload, coupon } }); setCouponApplied(coupon.toUpperCase()); setCoupon(""); toast("Cupom aplicado!", "ok"); }
            catch (err) { toast((err as Error).message, "error"); }
          }}>
            <Input placeholder="Cupom de desconto" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} />
            <Button variant="ink" disabled={!coupon || (type === "delivery" && !address)}>Aplicar</Button>
          </form>
        )}
        {menu.loyalty.enabled && (me?.customer?.loyalty_cents ?? 0) > 0 && (
          <label className="flex items-center justify-between gap-3 rounded-2xl bg-salmon/10 px-4 py-3 text-sm">
            <span className="flex items-center gap-2"><Sparkles className="size-4 text-salmon" />Usar {brl(me!.customer!.loyalty_cents)} de cashback</span>
            <input type="checkbox" className="size-5 accent-salmon" checked={useLoyalty} onChange={(e) => setUseLoyalty(e.target.checked)} />
          </label>
        )}
        <Textarea placeholder="Observações do pedido (opcional)" maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </section>

      {/* resumo fixo */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink/10 bg-paper/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <dl className="grid grid-cols-2 gap-y-0.5 text-sm text-ink/70">
            <dt>Subtotal</dt><dd className="text-right">{brl(quote?.subtotal ?? subtotal)}</dd>
            {type === "delivery" && <><dt>Entrega</dt><dd className="text-right">{quote ? (quote.fee ? brl(quote.fee) : "grátis") : "—"}</dd></>}
            {!!quote?.discount && <><dt>Desconto</dt><dd className="text-right text-ok">− {brl(quote.discount)}</dd></>}
            {!!quote?.loyaltyUsed && <><dt>Cashback</dt><dd className="text-right text-ok">− {brl(quote.loyaltyUsed)}</dd></>}
          </dl>
          {quoteErr && <p className="mt-1 text-sm font-medium text-torii">{quoteErr}</p>}
          <Button size="lg" className="mt-2 w-full" loading={busy} disabled={!quote || !!quoteErr} onClick={submit}>
            {scheduling ? "Agendar" : "Fazer pedido"} {quote && <Badge tone="ink" className="bg-white/20 text-white">{brl(quote.total)}</Badge>}
          </Button>
          {!me?.customer && <p className="mt-1.5 text-center text-xs text-ink/55">Tu vai confirmar teu WhatsApp antes de enviar</p>}
        </div>
      </div>
    </div>
  );
}

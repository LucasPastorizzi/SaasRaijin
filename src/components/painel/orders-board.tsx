"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellOff, Bike, Printer, Store, X, Plus, AlertTriangle, Phone } from "lucide-react";
import { Card, PageHead } from "./shell";
import { Badge, Button, cx, Field, Input, Select, Sheet, Spinner, Textarea, useToast } from "../ui";
import { api, useApi } from "@/lib/client";
import { brl, fmtPhone, fmtTime, minutesAgo, ORDER_STATUS, PAYMENT_LABEL, type OrderStatus } from "@/lib/format";
import type { OrderDetail, OrderRow } from "@/lib/server/orders";
import type { MenuProduct } from "@/lib/server/menu";

type BoardOrder = OrderRow & { address: Record<string, string> | null; items: { name: string; variant: string | null; qty: number; options: { name: string }[]; notes: string | null }[] };
type Courier = { id: number; name: string; on_shift: number; active: number; open_deliveries: number };

const COLS: { key: string; title: string; statuses: OrderStatus[] }[] = [
  { key: "novo", title: "Novos", statuses: ["novo"] },
  { key: "cozinha", title: "Na cozinha", statuses: ["aceito", "preparo"] },
  { key: "pronto", title: "Prontos", statuses: ["pronto"] },
  { key: "rota", title: "Em rota", statuses: ["saiu"] },
  { key: "fim", title: "Concluídos (12 h)", statuses: ["entregue", "cancelado"] },
];

export function OrdersBoard() {
  const toast = useToast();
  const { data, reload } = useApi<{ orders: BoardOrder[] }>("/api/admin/orders", 4000);
  const { data: cdata, reload: reloadCouriers } = useApi<{ couriers: Courier[] }>("/api/admin/couriers", 15000);
  const [openId, setOpenId] = useState<number | null>(null);
  const [manual, setManual] = useState(false);
  const [sound, setSound] = useState(true);
  const [mobileCol, setMobileCol] = useState("novo");
  const seen = useRef<Set<number> | null>(null);
  const audio = useRef<AudioContext | null>(null);

  const orders = useMemo(() => data?.orders ?? [], [data]);
  const pending = orders.filter((o) => o.status === "novo");

  // som repetindo enquanto houver pedido novo não aceito
  useEffect(() => {
    if (!data) return;
    const ids = new Set(orders.map((o) => o.id));
    if (seen.current) {
      const fresh = orders.filter((o) => !seen.current!.has(o.id) && o.status === "novo");
      if (fresh.length) toast(`🔔 Novo pedido #${fresh[0].code} de ${fresh[0].customer_name ?? "cliente"}`, "ok");
    }
    seen.current = ids;
  }, [data, orders, toast]);
  useEffect(() => {
    if (!sound || !pending.length) return;
    const beep = () => {
      try {
        audio.current ??= new AudioContext();
        const ctx = audio.current, t = ctx.currentTime;
        [0, 0.18, 0.36].forEach((d, i) => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.frequency.value = [880, 1175, 1480][i]; o.type = "sine";
          g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.3, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.16);
          o.connect(g).connect(ctx.destination); o.start(t + d); o.stop(t + d + 0.18);
        });
      } catch {}
    };
    beep();
    const i = setInterval(beep, 6000);
    return () => clearInterval(i);
  }, [sound, pending.length]);

  const act = async (id: number, body: object) => {
    try { await api(`/api/admin/orders/${id}`, { method: "PATCH", body }); reload(); reloadCouriers(); }
    catch (e) { toast((e as Error).message, "error"); }
  };

  const couriers = cdata?.couriers.filter((c) => c.active) ?? [];

  return (
    <div>
      <PageHead title="pedidos" sub={<>{pending.length ? <b className="text-salmon-deep">{pending.length} aguardando aceite</b> : "Nenhum pedido esperando"} · atualiza sozinho</>}>
        <Button variant={sound ? "ink" : "line"} size="sm" onClick={() => { setSound(!sound); audio.current?.resume(); }}>{sound ? <Bell className="size-4" /> : <BellOff className="size-4" />}{sound ? "Som ligado" : "Som desligado"}</Button>
        <Button size="sm" onClick={() => setManual(true)}><Plus className="size-4" />Pedido manual</Button>
      </PageHead>

      {/* abas mobile */}
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 pb-3 lg:hidden">
        {COLS.map((c) => {
          const n = orders.filter((o) => c.statuses.includes(o.status)).length;
          return <button key={c.key} onClick={() => setMobileCol(c.key)} className={cx("shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold cursor-pointer", mobileCol === c.key ? "bg-ink text-paper" : "bg-ink/6")}>{c.title} {n > 0 && `(${n})`}</button>;
        })}
      </div>

      {!data ? <div className="grid h-60 place-items-center"><Spinner /></div> : (
        <div className="grid gap-3 px-4 pb-8 sm:px-6 lg:grid-cols-5">
          {COLS.map((col) => {
            const list = orders.filter((o) => col.statuses.includes(o.status));
            return (
              <section key={col.key} className={cx("min-w-0 rounded-2xl bg-ink/[.035] p-2.5", mobileCol !== col.key && "hidden lg:block")}>
                <h2 className="flex items-center justify-between px-1.5 pb-2 text-sm font-bold">{col.title}<span className="rounded-full bg-ink/8 px-2 text-xs">{list.length}</span></h2>
                <div className="flex flex-col gap-2.5">
                  {list.map((o) => <OrderCard key={o.id} o={o} couriers={couriers} onOpen={() => setOpenId(o.id)} act={act} />)}
                  {!list.length && <p className="px-2 py-6 text-center text-xs text-ink/45">vazio</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {openId && <OrderSheet id={openId} couriers={couriers} onClose={() => setOpenId(null)} act={async (b) => { await act(openId, b); }} />}
      {manual && <ManualOrder onClose={() => setManual(false)} onCreated={() => { setManual(false); reload(); }} />}
    </div>
  );
}

function OrderCard({ o, couriers, onOpen, act }: { o: BoardOrder; couriers: Courier[]; onOpen: () => void; act: (id: number, b: object) => Promise<void> }) {
  const age = minutesAgo(o.created_at);
  const late = !!(o.accepted_at && o.eta_minutes && !["entregue", "cancelado"].includes(o.status) && minutesAgo(o.accepted_at) > o.eta_minutes);
  const [eta, setEta] = useState(o.eta_minutes ?? 40);
  return (
    <Card className={cx("anim-rise overflow-hidden", o.status === "novo" && "ring-2 ring-salmon", late && "ring-2 ring-torii")}>
      <button onClick={onOpen} className="block w-full p-3 text-left cursor-pointer">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold">#{o.code}</span>
          <span className={cx("text-xs font-semibold", age > 30 && o.status !== "entregue" ? "text-torii" : "text-ink/50")}>{fmtTime(o.created_at)} · {age < 120 ? `${age} min` : ""}</span>
        </div>
        <p className="mt-0.5 truncate text-sm font-medium">{o.customer_name ?? fmtPhone(o.customer_phone)}</p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Badge tone={o.type === "delivery" ? "ink" : "neutral"}>{o.type === "delivery" ? <><Bike className="size-3" />{o.address?.zone}</> : <><Store className="size-3" />Retirada</>}</Badge>
          <Badge tone={o.payment_status === "pago" ? "ok" : "warn"}>{PAYMENT_LABEL[o.payment_method]?.split(" ")[0]}{o.payment_status === "pago" ? " ✓" : ""}</Badge>
          {o.channel !== "app" && <Badge>{o.channel}</Badge>}
          {o.scheduled_for && <Badge tone="salmon">agendado {fmtTime(o.scheduled_for)}</Badge>}
          {late && <Badge tone="danger"><AlertTriangle className="size-3" />atrasado</Badge>}
        </div>
        <ul className="mt-2 space-y-0.5 text-xs text-ink/70">
          {o.items.slice(0, 4).map((i, k) => <li key={k} className="truncate"><b>{i.qty}×</b> {i.name}{i.variant ? ` (${i.variant})` : ""}</li>)}
          {o.items.length > 4 && <li>+ {o.items.length - 4} itens</li>}
        </ul>
        <p className="mt-2 text-sm font-bold">{brl(o.total_cents)}</p>
      </button>
      <div className="flex flex-wrap gap-1.5 border-t border-ink/8 p-2.5">
        {o.status === "novo" && <>
          <Select className="h-9 w-20 text-sm" value={eta} onChange={(e) => setEta(Number(e.target.value))} aria-label="Tempo estimado">{[20, 30, 40, 50, 60, 75, 90].map((m) => <option key={m} value={m}>{m}′</option>)}</Select>
          <Button size="sm" className="flex-1" onClick={() => act(o.id, { action: "status", to: "aceito", eta })}>Aceitar</Button>
        </>}
        {o.status === "aceito" && <Button size="sm" variant="ink" className="flex-1" onClick={() => act(o.id, { action: "status", to: "preparo" })}>Iniciar preparo</Button>}
        {o.status === "preparo" && <Button size="sm" variant="ink" className="flex-1" onClick={() => act(o.id, { action: "status", to: "pronto" })}>Pronto</Button>}
        {o.status === "pronto" && o.type === "pickup" && <Button size="sm" className="flex-1" onClick={() => act(o.id, { action: "status", to: "entregue" })}>Retirado</Button>}
        {["aceito", "preparo", "pronto"].includes(o.status) && o.type === "delivery" && (
          <Select className="h-9 flex-1 text-sm" value={o.courier_id ?? ""} aria-label="Motoboy"
            onChange={(e) => act(o.id, { action: "assign", courierId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Motoboy…</option>
            {couriers.map((c) => <option key={c.id} value={c.id}>{c.on_shift ? "🟢" : "⚪"} {c.name} ({c.open_deliveries})</option>)}
          </Select>
        )}
        {o.status === "pronto" && o.type === "delivery" && <Button size="sm" className="flex-1" disabled={!o.courier_id} onClick={() => act(o.id, { action: "status", to: "saiu" })}>Saiu</Button>}
        {o.status === "saiu" && <Button size="sm" variant="ink" className="flex-1" onClick={() => act(o.id, { action: "status", to: "entregue" })}>Entregue</Button>}
      </div>
    </Card>
  );
}

function OrderSheet({ id, couriers, onClose, act }: { id: number; couriers: Courier[]; onClose: () => void; act: (b: object) => Promise<void> }) {
  const { data: o, reload } = useApi<OrderDetail>(`/api/admin/orders/${id}`, 5000);
  const [cancel, setCancel] = useState<string | null>(null);
  const run = async (b: object) => { await act(b); reload(); };
  return (
    <Sheet open onClose={onClose} wide title={o ? <>Pedido #{o.code} <Badge tone={o.status === "cancelado" ? "danger" : "salmon"} className="ml-2 align-middle">{ORDER_STATUS[o.status]}</Badge></> : "Pedido"}>
      {!o ? <Spinner /> : (
        <div className="grid gap-5 md:grid-cols-[1.2fr_1fr]">
          <div>
            <Card className="p-4">
              <p className="font-semibold">{o.customer_name ?? "Cliente"}</p>
              <a href={`tel:${o.customer_phone}`} className="inline-flex items-center gap-1 text-sm text-ink/65"><Phone className="size-3.5" />{fmtPhone(o.customer_phone)}</a>
              {o.address && <p className="mt-2 text-sm">📍 {o.address.street}, {o.address.number}{o.address.complement ? ` — ${o.address.complement}` : ""} · <b>{o.address.zone}</b>{o.address.reference ? <span className="block text-ink/55">Ref.: {o.address.reference}</span> : null}</p>}
              {o.notes && <p className="mt-2 rounded-xl bg-salmon/10 p-2.5 text-sm">📝 {o.notes}</p>}
            </Card>
            <ul className="mt-4 divide-y divide-ink/8">
              {o.items.map((i, k) => (
                <li key={k} className="flex justify-between gap-3 py-2 text-sm">
                  <span><b>{i.qty}×</b> {i.name}{i.variant ? ` · ${i.variant}` : ""}
                    {(i.options.length > 0 || i.notes) && <span className="block text-xs text-ink/55">{[...i.options.map((x) => x.name), i.notes && `“${i.notes}”`].filter(Boolean).join(" · ")}</span>}</span>
                  <span className="font-semibold">{brl(i.total_cents)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-2 grid grid-cols-2 gap-y-1 border-t border-ink/10 pt-3 text-sm">
              <dt className="text-ink/60">Subtotal</dt><dd className="text-right">{brl(o.subtotal_cents)}</dd>
              <dt className="text-ink/60">Entrega</dt><dd className="text-right">{brl(o.delivery_fee_cents)}</dd>
              {!!o.discount_cents && <><dt className="text-ink/60">Desconto {o.coupon_code}</dt><dd className="text-right">− {brl(o.discount_cents)}</dd></>}
              {!!o.loyalty_used_cents && <><dt className="text-ink/60">Cashback</dt><dd className="text-right">− {brl(o.loyalty_used_cents)}</dd></>}
              <dt className="font-bold">Total</dt><dd className="text-right font-bold">{brl(o.total_cents)}</dd>
              <dt className="text-ink/60">Pagamento</dt><dd className="text-right">{PAYMENT_LABEL[o.payment_method]} · <b>{o.payment_status}</b></dd>
              {o.change_for_cents && <><dt className="text-ink/60">Troco para</dt><dd className="text-right">{brl(o.change_for_cents)} (levar {brl(o.change_for_cents - o.total_cents)})</dd></>}
            </dl>
          </div>
          <div className="flex flex-col gap-3">
            {o.type === "delivery" && !["entregue", "cancelado"].includes(o.status) && (
              <Field label="Motoboy">
                <Select value={o.courier_id ?? ""} onChange={(e) => run({ action: "assign", courierId: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">Sem motoboy</option>
                  {couriers.map((c) => <option key={c.id} value={c.id}>{c.on_shift ? "🟢" : "⚪"} {c.name} — {c.open_deliveries} em aberto</option>)}
                </Select>
              </Field>
            )}
            <p className="text-sm text-ink/60">Código de entrega: <b className="font-mono text-ink">{o.delivery_pin}</b></p>
            <div className="flex flex-wrap gap-2">
              <Button variant="line" size="sm" onClick={() => window.print()}><Printer className="size-4" />Imprimir comanda</Button>
              {o.payment_status !== "pago" && o.status !== "cancelado" && <Button variant="line" size="sm" onClick={() => run({ action: "paid" })}>Marcar como pago</Button>}
              {!["entregue", "cancelado"].includes(o.status) && <Button variant="danger" size="sm" onClick={() => setCancel("")}><X className="size-4" />Cancelar</Button>}
            </div>
            {cancel !== null && (
              <div className="rounded-2xl bg-torii/8 p-3">
                <Textarea placeholder="Motivo (vai para o cliente no WhatsApp)" value={cancel} onChange={(e) => setCancel(e.target.value)} />
                <div className="mt-2 flex gap-2">
                  {["Item em falta", "Fora da área", "Cliente pediu"].map((r) => <button key={r} className="rounded-full bg-white px-2.5 py-1 text-xs cursor-pointer" onClick={() => setCancel(r)}>{r}</button>)}
                </div>
                <Button variant="danger" size="sm" className="mt-2" disabled={!cancel} onClick={async () => { await run({ action: "status", to: "cancelado", reason: cancel }); setCancel(null); }}>Confirmar cancelamento</Button>
              </div>
            )}
            <div>
              <p className="mb-2 text-sm font-semibold">Linha do tempo</p>
              <ol className="space-y-1.5 text-sm">
                {o.events.map((e, k) => <li key={k} className="flex gap-2"><span className="w-12 shrink-0 text-ink/50">{fmtTime(e.at)}</span><span><b>{ORDER_STATUS[e.status as OrderStatus] ?? e.status}</b>{e.note ? ` — ${e.note}` : ""}<span className="text-ink/45"> · {e.by}</span></span></li>)}
              </ol>
            </div>
          </div>

          {/* comanda impressa (80 mm) */}
          <div className="print-ticket hidden print:block">
            <p style={{ textAlign: "center", fontWeight: 700 }}>RAIJIN SUSHI</p>
            <p>Pedido #{o.code} — {new Date(o.created_at).toLocaleString("pt-BR")}</p>
            <p>{o.type === "delivery" ? "ENTREGA" : "RETIRADA"} · {o.customer_name} · {fmtPhone(o.customer_phone)}</p>
            {o.address && <p>{o.address.street}, {o.address.number} {o.address.complement} — {o.address.zone}</p>}
            <p>--------------------------------</p>
            {o.items.map((i, k) => <div key={k}><p>{i.qty}x {i.name}{i.variant ? ` (${i.variant})` : ""}  {brl(i.total_cents)}</p>{i.options.map((x, j) => <p key={j}>   + {x.name}</p>)}{i.notes && <p>   obs: {i.notes}</p>}</div>)}
            <p>--------------------------------</p>
            <p>TOTAL {brl(o.total_cents)} · {PAYMENT_LABEL[o.payment_method]} {o.payment_status === "pago" ? "(PAGO)" : ""}</p>
            {o.change_for_cents && <p>Troco para {brl(o.change_for_cents)}</p>}
            {o.notes && <p>Obs: {o.notes}</p>}
          </div>
        </div>
      )}
    </Sheet>
  );
}

/* Pedido manual: telefone, balcão ou WhatsApp */
function ManualOrder({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const { data: menu } = useApi<{ products: MenuProduct[]; zones: { id: number; name: string; fee_cents: number }[] }>("/api/menu");
  const [phone, setPhone] = useState(""), [name, setName] = useState(""), [channel, setChannel] = useState("telefone");
  const [type, setType] = useState<"delivery" | "pickup">("delivery");
  const [addr, setAddr] = useState({ street: "", number: "", zoneId: 0, complement: "" });
  const [pay, setPay] = useState("cash");
  const [items, setItems] = useState<{ productId: number; variantId: number | null; qty: number; name: string; price: number }[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const results = (menu?.products ?? []).filter((p) => !p.paused && q && p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 6);
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  return (
    <Sheet open onClose={onClose} wide title="Pedido manual" footer={
      <div className="flex items-center justify-between gap-3"><span className="font-bold">{brl(total)} + entrega</span>
        <Button loading={busy} disabled={!items.length || !phone || !name} onClick={async () => {
          setBusy(true);
          try {
            await api("/api/admin/orders", { body: { phone, name, channel, type, paymentMethod: pay, items: items.map((i) => ({ productId: i.productId, variantId: i.variantId, qty: i.qty, optionIds: [] })),
              address: type === "delivery" ? { street: addr.street, number: addr.number, zoneId: addr.zoneId, complement: addr.complement || undefined } : undefined, saveAddress: type === "delivery" } });
            toast("Pedido criado", "ok"); onCreated();
          } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
        }}>Criar pedido</Button></div>
    }>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="WhatsApp do cliente"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(51) 9…" /></Field>
        <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Canal"><Select value={channel} onChange={(e) => setChannel(e.target.value)}><option value="telefone">Telefone</option><option value="whatsapp">WhatsApp</option><option value="balcao">Balcão</option></Select></Field>
        <Field label="Tipo"><Select value={type} onChange={(e) => setType(e.target.value as "delivery" | "pickup")}><option value="delivery">Entrega</option><option value="pickup">Retirada</option></Select></Field>
        <Field label="Pagamento"><Select value={pay} onChange={(e) => setPay(e.target.value)}>{Object.entries(PAYMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        {type === "delivery" && <Field label="Bairro"><Select value={addr.zoneId} onChange={(e) => setAddr({ ...addr, zoneId: Number(e.target.value) })}><option value={0}>—</option>{menu?.zones.map((z) => <option key={z.id} value={z.id}>{z.name} ({brl(z.fee_cents)})</option>)}</Select></Field>}
        {type === "delivery" && <><Field label="Rua"><Input value={addr.street} onChange={(e) => setAddr({ ...addr, street: e.target.value })} /></Field>
          <Field label="Número"><Input value={addr.number} onChange={(e) => setAddr({ ...addr, number: e.target.value })} /></Field>
          <Field label="Complemento"><Input value={addr.complement} onChange={(e) => setAddr({ ...addr, complement: e.target.value })} /></Field></>}
      </div>
      <Field label="Adicionar item" className="mt-4"><Input placeholder="Buscar produto…" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {results.flatMap((p): { p: MenuProduct; v: MenuProduct["variants"][number] | null }[] => (p.variants.length ? p.variants.map((v) => ({ p, v })) : [{ p, v: null }])).map(({ p, v }) => (
          <button key={`${p.id}-${v?.id}`} className="rounded-full bg-ink/6 px-3 py-1.5 text-sm hover:bg-salmon hover:text-white cursor-pointer"
            onClick={() => { setItems([...items, { productId: p.id, variantId: v?.id ?? null, qty: 1, name: `${p.name}${v ? ` · ${v.name}` : ""}`, price: v?.price_cents ?? p.price_cents }]); setQ(""); }}>
            {p.name}{v ? ` · ${v.name}` : ""} — {brl(v?.price_cents ?? p.price_cents)}
          </button>
        ))}
      </div>
      <ul className="mt-3 divide-y divide-ink/8">
        {items.map((i, k) => (
          <li key={k} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span>{i.name}</span>
            <span className="flex items-center gap-2"><Input type="number" min={1} className="h-9 w-16" value={i.qty} onChange={(e) => setItems(items.map((x, j) => (j === k ? { ...x, qty: Math.max(1, Number(e.target.value)) } : x)))} />
              <b className="w-20 text-right">{brl(i.price * i.qty)}</b>
              <button aria-label="Remover" className="cursor-pointer text-ink/40 hover:text-torii" onClick={() => setItems(items.filter((_, j) => j !== k))}><X className="size-4" /></button></span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

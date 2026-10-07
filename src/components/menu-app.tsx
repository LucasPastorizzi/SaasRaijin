"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, Minus, Plus, Search, ShoppingBag, User, Bike, Flame, Leaf, Sparkles } from "lucide-react";
import { useShop, type MenuData } from "./shop";
import { Badge, Button, cx, DishArt, Sheet, Spinner, Textarea } from "./ui";
import { Logo } from "./logo";
import { brl, fold } from "@/lib/format";
import type { MenuProduct } from "@/lib/server/menu";

const effective = (p: MenuProduct) =>
  p.promo_price_cents != null && (!p.promo_until || new Date(p.promo_until).getTime() > Date.now()) ? p.promo_price_cents : p.price_cents;
const fromPrice = (p: MenuProduct) => (p.variants.length ? Math.min(...p.variants.map((v) => v.price_cents)) : effective(p));

export function ShopHeader() {
  const { me, count } = useShop();
  return (
    <header className="sticky top-0 z-30 border-b border-ink/10 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4">
        <Link href="/" aria-label="Raijin Sushi — cardápio"><Logo small /></Link>
        <nav className="flex items-center gap-1.5">
          <Link href="/conta" className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold hover:bg-ink/5">
            <User className="size-4.5" /><span className="hidden sm:inline">{me?.customer?.name?.split(" ")[0] ?? "Entrar"}</span>
          </Link>
          <Link href="/checkout" className="relative inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-3.5 text-sm font-semibold text-paper">
            <ShoppingBag className="size-4.5" />{count > 0 && <span>{count}</span>}
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function MenuApp() {
  const { menu } = useShop();
  const [q, setQ] = useState("");
  const [active, setActive] = useState<number | null>(null);
  const [open, setOpen] = useState<MenuProduct | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  const sections = useMemo(() => {
    if (!menu) return [];
    const f = fold(q.trim());
    return menu.categories
      .map((c) => ({ ...c, items: menu.products.filter((p) => p.category_id === c.id && (!f || fold(`${p.name} ${p.description}`).includes(f))) }))
      .filter((c) => c.items.length);
  }, [menu, q]);

  // scroll-spy das categorias
  useEffect(() => {
    if (!sections.length) return;
    const obs = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setActive(Number((vis.target as HTMLElement).dataset.cat));
    }, { rootMargin: "-140px 0px -60% 0px" });
    document.querySelectorAll("[data-cat]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [sections]);
  useEffect(() => {
    const el = tabsRef.current?.querySelector(`[data-tab="${active}"]`) as HTMLElement | null;
    el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [active]);

  if (!menu) return <div className="grid min-h-[70dvh] place-items-center"><Spinner /></div>;
  const best = menu.bestSellers.map((id) => menu.products.find((p) => p.id === id)).filter((p): p is MenuProduct => !!p && !p.paused);

  return (
    <div className="pb-32">
      <Hero menu={menu} />

      {/* busca + abas */}
      <div className="sticky top-16 z-20 border-b border-ink/10 bg-paper/90 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 pt-3">
          <label className="flex h-11 items-center gap-2 rounded-xl border border-ink/12 bg-white/70 px-3 focus-within:border-salmon">
            <Search className="size-4.5 text-ink/45" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar no cardápio (ex.: temaki camarão)" className="h-full flex-1 bg-transparent text-[15px] outline-none" aria-label="Buscar no cardápio" />
          </label>
          <div ref={tabsRef} className="no-scrollbar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-2.5">
            {sections.map((c) => (
              <a key={c.id} data-tab={c.id} href={`#cat-${c.id}`}
                className={cx("shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors", active === c.id ? "bg-ink text-paper" : "bg-ink/6 text-ink/75 hover:bg-ink/10")}>
                {c.name}
              </a>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-4">
        {!q && best.length > 0 && (
          <section className="mt-7">
            <h2 className="h-title flex items-center gap-2 text-2xl"><Flame className="size-5 text-salmon" />os mais pedidos</h2>
            <div className="no-scrollbar -mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-1">
              {best.map((p) => (
                <button key={p.id} onClick={() => setOpen(p)} className="w-40 shrink-0 overflow-hidden rounded-2xl bg-white/70 text-left ring-1 ring-ink/8 transition hover:-translate-y-0.5 hover:ring-salmon cursor-pointer">
                  <div className="aspect-square overflow-hidden">{p.image ? <img src={p.image} alt="" className="size-full object-cover" /> : <DishArt seed={p.name} className="size-full" />}</div>
                  <div className="p-3"><p className="line-clamp-2 text-sm font-semibold leading-tight">{p.name}</p><p className="mt-1 text-sm font-bold text-salmon-deep">{brl(fromPrice(p))}</p></div>
                </button>
              ))}
            </div>
          </section>
        )}

        {sections.map((c) => (
          <section key={c.id} id={`cat-${c.id}`} data-cat={c.id} className="scroll-mt-40 pt-8">
            <h2 className="h-title text-2xl">{c.name}</h2>
            <div className="mt-2 divide-y divide-ink/10">
              {c.items.map((p) => <ProductRow key={p.id} p={p} onOpen={() => setOpen(p)} />)}
            </div>
          </section>
        ))}
        {!sections.length && <p className="py-20 text-center text-ink/60">Nada encontrado para “{q}”.</p>}
      </main>

      {open && <ProductSheet key={open.id} product={open} onClose={() => setOpen(null)} storeOpen={menu.status.open || menu.ops.allowScheduling} />}
      <CartBar />
    </div>
  );
}

function Hero({ menu }: { menu: MenuData }) {
  return (
    <section className="seigaiha border-b border-ink/10">
      <div className="mx-auto max-w-3xl px-4 py-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="h-title text-[44px] sm:text-6xl">bateu a <span className="text-salmon">fome?</span></h1>
            <p className="mt-2 text-ink/65">{menu.store.tagline} · Sushi, temaki e pokes</p>
          </div>
          <span className="hidden font-jp text-6xl text-salmon/25 sm:block" aria-hidden>雷神</span>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Badge tone={menu.status.open ? "ok" : "danger"} className="py-1 text-[13px]"><span className={cx("size-2 rounded-full", menu.status.open ? "bg-ok" : "bg-torii")} />{menu.status.label}</Badge>
          <Badge className="py-1 text-[13px]"><Bike className="size-3.5" />{menu.ops.deliveryBaseMinutes}–{menu.ops.deliveryBaseMinutes + 10} min</Badge>
          <Badge className="py-1 text-[13px]"><Clock className="size-3.5" />Pedido mínimo {brl(menu.ops.minOrderCents)}</Badge>
          {menu.loyalty.enabled && <Badge tone="salmon" className="py-1 text-[13px]"><Sparkles className="size-3.5" />{brl(menu.loyalty.rewardCents)} de volta a cada {brl(menu.loyalty.everyCents)}</Badge>}
        </div>
        {!menu.status.open && (
          <p className="mt-4 rounded-2xl bg-ink px-4 py-3 text-sm text-paper">
            Estamos fechados agora{menu.ops.allowScheduling ? " — mas tu pode montar o pedido e agendar pro próximo horário." : "."}
          </p>
        )}
      </div>
    </section>
  );
}

function ProductRow({ p, onOpen }: { p: MenuProduct; onOpen: () => void }) {
  const price = fromPrice(p);
  const promo = p.promo_price_cents != null && effective(p) !== p.price_cents;
  return (
    <button onClick={onOpen} disabled={!!p.paused} className="group flex w-full items-start gap-4 py-4 text-left disabled:opacity-55 cursor-pointer disabled:cursor-not-allowed">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <h3 className="text-[17px] font-semibold leading-snug group-hover:text-salmon-deep">{p.name}</h3>
          {p.tags.includes("novo") && <Badge tone="salmon">novo</Badge>}
          {p.tags.includes("vegetariano") && <Badge tone="ok"><Leaf className="size-3" />veg</Badge>}
          {p.paused ? <Badge tone="danger">esgotado</Badge> : null}
        </div>
        {p.description && <p className="mt-1 line-clamp-2 text-sm text-ink/60">{p.description}</p>}
        <p className="mt-2 flex items-baseline gap-2 text-[15px] font-bold">
          {p.variants.length ? <span className="text-xs font-medium text-ink/55">a partir de</span> : null}
          <span className={promo ? "text-salmon-deep" : ""}>{brl(price)}</span>
          {promo && <s className="text-xs font-medium text-ink/45">{brl(p.price_cents)}</s>}
          {p.pieces ? <span className="text-xs font-medium text-ink/45">· {p.pieces} peças</span> : null}
        </p>
      </div>
      <div className="relative size-24 shrink-0 overflow-hidden rounded-2xl ring-1 ring-ink/8">
        {p.image ? <img src={p.image} alt="" loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-105" /> : <DishArt seed={p.name} className="size-full" />}
        {!p.paused && <span className="absolute bottom-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-paper text-ink shadow"><Plus className="size-4" /></span>}
      </div>
    </button>
  );
}

function ProductSheet({ product: p, onClose, storeOpen }: { product: MenuProduct; onClose: () => void; storeOpen: boolean }) {
  const { add } = useShop();
  const [variant, setVariant] = useState<number | null>(p.variants[0]?.id ?? null);
  const [opts, setOpts] = useState<number[]>([]);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");

  const base = variant ? p.variants.find((v) => v.id === variant)!.price_cents : effective(p);
  const extra = p.groups.flatMap((g) => g.options).filter((o) => opts.includes(o.id)).reduce((s, o) => s + o.price_cents, 0);
  const unit = base + extra;
  const missing = p.groups.find((g) => g.options.filter((o) => opts.includes(o.id)).length < g.min);

  const toggle = (gid: number, oid: number) => {
    const g = p.groups.find((x) => x.id === gid)!;
    const inGroup = opts.filter((o) => g.options.some((x) => x.id === o));
    if (opts.includes(oid)) return setOpts(opts.filter((o) => o !== oid));
    if (g.max === 1) return setOpts([...opts.filter((o) => !inGroup.includes(o)), oid]);
    if (inGroup.length >= g.max) return;
    setOpts([...opts, oid]);
  };

  return (
    <Sheet open onClose={onClose} title={p.name}
      footer={
        <div className="flex items-center gap-3">
          <div className="flex h-12 items-center rounded-2xl bg-ink/6">
            <button aria-label="Menos" className="grid size-12 place-items-center cursor-pointer" onClick={() => setQty(Math.max(1, qty - 1))}><Minus className="size-4" /></button>
            <span className="w-6 text-center font-bold">{qty}</span>
            <button aria-label="Mais" className="grid size-12 place-items-center cursor-pointer" onClick={() => setQty(qty + 1)}><Plus className="size-4" /></button>
          </div>
          <Button size="lg" className="flex-1" disabled={!!missing || !storeOpen}
            onClick={() => {
              add({ productId: p.id, variantId: variant, optionIds: opts, qty, notes: notes.trim() || undefined, name: p.name,
                variant: p.variants.find((v) => v.id === variant)?.name ?? null,
                optionNames: p.groups.flatMap((g) => g.options).filter((o) => opts.includes(o.id)).map((o) => o.name), unit, image: p.image });
              onClose();
            }}>
            {missing ? `Escolha: ${missing.name.replace("Poke · ", "")}` : <>Adicionar · {brl(unit * qty)}</>}
          </Button>
        </div>
      }>
      <div className="-mx-5 -mt-1 mb-4 aspect-[16/9] overflow-hidden">
        {p.image ? <img src={p.image} alt={p.name} className="size-full object-cover" /> : <DishArt seed={p.name} className="size-full" />}
      </div>
      {p.description && <p className="text-ink/70">{p.description}</p>}

      {p.variants.length > 0 && (
        <fieldset className="mt-5">
          <legend className="mb-2 flex w-full items-center justify-between font-semibold">Escolha a opção <Badge tone="ink">obrigatório</Badge></legend>
          <div className="flex flex-col gap-2">
            {p.variants.map((v) => (
              <label key={v.id} className={cx("flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3", variant === v.id ? "border-salmon bg-salmon/8" : "border-ink/12")}>
                <span className="flex items-center gap-3"><input type="radio" name="variant" className="accent-salmon" checked={variant === v.id} onChange={() => setVariant(v.id)} />{v.name}</span>
                <b>{brl(v.price_cents)}</b>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {p.groups.map((g, gi) => {
        const n = g.options.filter((o) => opts.includes(o.id)).length;
        return (
          <fieldset key={g.id} className="mt-5">
            <legend className="mb-2 flex w-full items-center justify-between gap-3 font-semibold">
              <span>{p.groups.length > 2 && <span className="mr-1.5 font-jp text-salmon">{["一", "二", "三", "四", "五", "六"][gi]}</span>}{g.name.replace("Poke · ", "")}</span>
              <span className="text-xs font-medium text-ink/55">{g.min ? <Badge tone={n >= g.min ? "ok" : "ink"}>{n >= g.min ? "ok" : `escolha ${g.min}`}</Badge> : null} {g.max > 1 && `até ${g.max}`}</span>
            </legend>
            <div className="flex flex-col gap-2">
              {g.options.map((o) => {
                const on = opts.includes(o.id);
                const full = !on && g.max > 1 && n >= g.max;
                return (
                  <label key={o.id} className={cx("flex items-center justify-between rounded-xl border px-4 py-3", on ? "border-salmon bg-salmon/8" : "border-ink/12", (o.paused || full) ? "opacity-45" : "cursor-pointer")}>
                    <span className="flex items-center gap-3">
                      <input type={g.max === 1 ? "radio" : "checkbox"} className="accent-salmon" checked={on} disabled={!!o.paused || full} onChange={() => toggle(g.id, o.id)} />
                      {o.name}{o.paused ? " (acabou)" : ""}
                    </span>
                    {o.price_cents > 0 && <span className="text-sm font-semibold">+ {brl(o.price_cents)}</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      <div className="mt-5">
        <label className="mb-2 block font-semibold" htmlFor="obs">Alguma observação?</label>
        <Textarea id="obs" maxLength={200} placeholder="Ex.: sem cebolinha, cortar ao meio…" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {!storeOpen && <p className="mt-4 text-sm text-torii">A loja está fechada e não aceita agendamento agora.</p>}
    </Sheet>
  );
}

function CartBar() {
  const { count, subtotal } = useShop();
  if (!count) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <Link href="/checkout" className="anim-rise mx-auto flex h-14 max-w-3xl items-center justify-between rounded-2xl bg-salmon px-5 font-semibold text-white shadow-[0_14px_40px_-10px_rgba(239,125,50,.8)] transition hover:bg-ink">
        <span className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-lg bg-white/20 text-sm">{count}</span>Ver carrinho</span>
        <span>{brl(subtotal)}</span>
      </Link>
    </div>
  );
}

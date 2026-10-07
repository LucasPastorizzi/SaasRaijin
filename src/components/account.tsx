"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, MapPin, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { useShop } from "./shop";
import { Badge, Button, Field, Input, Spinner, Toggle, useToast } from "./ui";
import { api } from "@/lib/client";
import { brl, fmtDateTime, fmtPhone, ORDER_STATUS, type OrderStatus } from "@/lib/format";

export function Account() {
  const { me, menu, reloadMe, requireLogin, add } = useShop();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);

  if (!me) return <div className="grid min-h-[60dvh] place-items-center"><Spinner /></div>;
  if (!me.customer) return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="h-title text-4xl">tua conta</h1>
      <p className="mt-3 text-ink/60">Entra com teu WhatsApp para ver pedidos, endereços e cashback.</p>
      <Button size="lg" className="mt-6" onClick={() => requireLogin()}>Entrar com WhatsApp</Button>
    </div>
  );
  const c = me.customer;

  // "Pedir de novo": recria o carrinho a partir do pedido (itens que ainda existem)
  const reorder = (o: NonNullable<typeof me.orders>[number]) => {
    let skipped = 0;
    for (const it of o.items) {
      const p = menu?.products.find((x) => x.id === it.product_id);
      if (!p || p.paused) { skipped++; continue; }
      const v = it.variant ? p.variants.find((x) => x.name === it.variant) : null;
      const optIds = p.groups.flatMap((g) => g.options).filter((op) => it.options.some((x) => x.name === op.name)).map((op) => op.id);
      const base = v ? v.price_cents : p.promo_price_cents ?? p.price_cents;
      const extra = p.groups.flatMap((g) => g.options).filter((op) => optIds.includes(op.id)).reduce((s, op) => s + op.price_cents, 0);
      add({ productId: p.id, variantId: v?.id ?? null, optionIds: optIds, qty: it.qty, notes: it.notes ?? undefined, name: p.name, variant: v?.name ?? null,
        optionNames: it.options.map((x) => x.name), unit: base + extra, image: p.image });
    }
    if (skipped) toast(`${skipped} item(ns) não estão disponíveis e ficaram de fora`, "info");
    router.push("/checkout");
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="h-title text-4xl">oi, {c.name?.split(" ")[0] ?? "tudo bem"}?</h1>
          <p className="mt-1 text-ink/60">{fmtPhone(c.phone)}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={async () => { await api("/api/me", { method: "DELETE" }); await reloadMe(); }}><LogOut className="size-4" />Sair</Button>
      </div>

      {menu?.loyalty.enabled && (
        <div className="mt-5 flex items-center justify-between rounded-3xl bg-ink p-5 text-paper">
          <div><p className="flex items-center gap-2 text-sm text-paper/65"><Sparkles className="size-4 text-salmon" />Teu cashback</p><p className="mt-1 text-3xl font-bold">{brl(c.loyalty_cents)}</p></div>
          <p className="max-w-[12rem] text-right text-xs text-paper/60">A cada {brl(menu.loyalty.everyCents)} em pedidos, ganha {brl(menu.loyalty.rewardCents)} pra usar no checkout.</p>
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-bold">Teus pedidos</h2>
        {!me.orders?.length && <p className="mt-3 text-ink/60">Nenhum pedido ainda. <Link className="font-semibold text-salmon-deep" href="/">Ver cardápio</Link></p>}
        <ul className="mt-3 flex flex-col gap-3">
          {me.orders?.map((o) => (
            <li key={o.id} className="rounded-2xl bg-white/60 p-4 ring-1 ring-ink/8">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/pedido/${o.code}`} className="min-w-0">
                  <p className="font-semibold">#{o.code} · {brl(o.total_cents)}</p>
                  <p className="text-xs text-ink/55">{fmtDateTime(o.created_at)}</p>
                  <p className="mt-1 line-clamp-1 text-sm text-ink/70">{o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</p>
                </Link>
                <Badge tone={o.status === "entregue" ? "ok" : o.status === "cancelado" ? "danger" : "salmon"}>{ORDER_STATUS[o.status as OrderStatus]}</Badge>
              </div>
              <Button variant="line" size="sm" className="mt-3" onClick={() => reorder(o)}><RotateCcw className="size-4" />Pedir de novo</Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold">Endereços</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {me.addresses?.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/60 p-3.5 text-sm ring-1 ring-ink/8">
              <span className="flex items-center gap-2"><MapPin className="size-4 text-salmon" />{a.street}, {a.number} — {a.zone_name}</span>
              <button aria-label="Remover endereço" className="cursor-pointer text-ink/40 hover:text-torii" onClick={async () => { await api("/api/me", { method: "PATCH", body: { deleteAddressId: a.id } }); reloadMe(); }}><Trash2 className="size-4" /></button>
            </li>
          ))}
          {!me.addresses?.length && <p className="text-sm text-ink/60">Os endereços dos teus pedidos aparecem aqui.</p>}
        </ul>
      </section>

      <section className="mt-8 flex flex-col gap-4 rounded-3xl bg-white/60 p-5 ring-1 ring-ink/8">
        <h2 className="text-lg font-bold">Teus dados</h2>
        <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!name) return; await api("/api/me", { method: "PATCH", body: { name } }); await reloadMe(); toast("Salvo", "ok"); }}>
          <Field label="Nome" className="flex-1"><Input value={name ?? c.name ?? ""} onChange={(e) => setName(e.target.value)} /></Field>
          <Button variant="ink" className="self-end">Salvar</Button>
        </form>
        <Toggle checked={!!c.marketing_opt_in} label="Receber promoções no WhatsApp"
          onChange={async (v) => { await api("/api/me", { method: "PATCH", body: { marketing_opt_in: v } }); await reloadMe(); }} />
        <p className="text-xs text-ink/55">Teus dados são usados só para entregar e melhorar teus pedidos (LGPD). Para excluir tua conta, fala com a gente no WhatsApp.</p>
      </section>
    </div>
  );
}

"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { api, useApi, useLocalStorage } from "@/lib/client";
import { Button, Field, Input, Sheet, ToastProvider, useToast } from "./ui";
import type { MenuCategory, MenuProduct } from "@/lib/server/menu";
import type { Hours } from "@/lib/hours";

/* ---------------- tipos do cardápio público ---------------- */
export type MenuData = {
  store: { name: string; tagline: string; phone: string; address: string; instagram: string };
  hours: Hours;
  ops: { minOrderCents: number; deliveryBaseMinutes: number; allowScheduling: boolean; pickupEnabled: boolean };
  status: { open: boolean; label: string };
  payments: Record<"pix" | "card_online" | "cash" | "card_machine", boolean>;
  loyalty: { enabled: boolean; everyCents: number; rewardCents: number };
  zones: { id: number; name: string; fee_cents: number; extra_minutes: number }[];
  categories: MenuCategory[];
  products: MenuProduct[];
  bestSellers: number[];
};

export type Me = {
  customer: { id: number; phone: string; name: string | null; email: string | null; loyalty_cents: number; marketing_opt_in: number } | null;
  addresses?: { id: number; street: string; number: string; complement: string | null; reference: string | null; zone_id: number; zone_name: string; fee_cents: number }[];
  orders?: { id: number; code: string; status: string; total_cents: number; created_at: string; type: string; rating: number | null;
    items: { product_id: number; name: string; qty: number; variant: string | null; options: { name: string }[]; notes: string | null }[] }[];
};

/* ---------------- carrinho ---------------- */
export type CartLine = {
  key: string; productId: number; variantId: number | null; optionIds: number[]; qty: number; notes?: string;
  name: string; variant: string | null; optionNames: string[]; unit: number; image: string | null;
};

type ShopCtx = {
  menu: MenuData | null; reloadMenu: () => void;
  me: Me | null; reloadMe: () => Promise<void>;
  cart: CartLine[]; add: (l: Omit<CartLine, "key">) => void; setQty: (key: string, qty: number) => void; clear: () => void;
  count: number; subtotal: number;
  requireLogin: () => Promise<boolean>;
};
const Ctx = createContext<ShopCtx | null>(null);
export const useShop = () => useContext(Ctx)!;

export function ShopProvider({ children }: { children: ReactNode }) {
  return <ToastProvider><ShopInner>{children}</ShopInner></ToastProvider>;
}

function ShopInner({ children }: { children: ReactNode }) {
  const { data: menu, reload: reloadMenu } = useApi<MenuData>("/api/menu", 60_000);
  const { data: me, reload: reloadMe } = useApi<Me>("/api/me");
  const [cart, setCart] = useLocalStorage<CartLine[]>("raijin-cart", []);
  const [login, setLogin] = useState<{ resolve: (ok: boolean) => void } | null>(null);

  const add = useCallback((l: Omit<CartLine, "key">) => {
    const key = `${l.productId}:${l.variantId ?? ""}:${[...l.optionIds].sort().join(",")}:${l.notes ?? ""}`;
    setCart((c) => {
      const ex = c.find((x) => x.key === key);
      return ex ? c.map((x) => (x.key === key ? { ...x, qty: x.qty + l.qty } : x)) : [...c, { ...l, key }];
    });
  }, [setCart]);
  const setQty = useCallback((key: string, qty: number) => setCart((c) => (qty <= 0 ? c.filter((x) => x.key !== key) : c.map((x) => (x.key === key ? { ...x, qty } : x)))), [setCart]);
  const clear = useCallback(() => setCart([]), [setCart]);

  const requireLogin = useCallback(() => {
    if (me?.customer) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => setLogin({ resolve }));
  }, [me]);

  const value = useMemo<ShopCtx>(() => ({
    menu, reloadMenu, me, reloadMe, cart, add, setQty, clear,
    count: cart.reduce((s, l) => s + l.qty, 0), subtotal: cart.reduce((s, l) => s + l.unit * l.qty, 0), requireLogin,
  }), [menu, reloadMenu, me, reloadMe, cart, add, setQty, clear, requireLogin]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <LoginSheet open={!!login} onDone={async (ok) => { if (ok) await reloadMe(); login?.resolve(ok); setLogin(null); }} />
    </Ctx.Provider>
  );
}

/* ---------------- login pelo WhatsApp ---------------- */
function LoginSheet({ open, onDone }: { open: boolean; onDone: (ok: boolean) => void }) {
  const toast = useToast();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [optIn, setOptIn] = useState(true);
  const [known, setKnown] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => { setStep("phone"); setCode(""); setErr(null); setDevCode(null); };
  const request = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ known: boolean; devCode?: string }>("/api/auth/otp", { body: { action: "request", phone } });
      setKnown(r.known); setDevCode(r.devCode ?? null); setStep("code");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true); setErr(null);
    try {
      await api("/api/auth/otp", { body: { action: "verify", phone, code, name: name || undefined, optIn } });
      toast("Pronto, tu entrou! 🍣", "ok");
      reset(); onDone(true);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={() => { reset(); onDone(false); }} title="Entrar com WhatsApp">
      {step === "phone" ? (
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); request(); }}>
          <p className="text-sm text-ink/65">Te mandamos um código no WhatsApp. Sem senha, sem cadastro chato.</p>
          <Field label="Teu WhatsApp" error={err}>
            <Input inputMode="tel" autoComplete="tel" placeholder="(51) 99999-9999" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus />
          </Field>
          <Button size="lg" loading={busy} disabled={phone.replace(/\D/g, "").length < 10}>Receber código</Button>
        </form>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); verify(); }}>
          <p className="text-sm text-ink/65">Digita o código de 6 dígitos que chegou no teu WhatsApp. <button type="button" className="underline cursor-pointer" onClick={reset}>Trocar número</button></p>
          {devCode && <p className="rounded-xl bg-salmon/12 px-3 py-2 text-sm text-salmon-deep">Modo desenvolvimento (WhatsApp não configurado): código <b>{devCode}</b></p>}
          <Field label="Código" error={err}>
            <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus className="tracking-[.5em] text-lg font-semibold" />
          </Field>
          {!known && (
            <>
              <Field label="Como te chamamos?"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Teu nome" autoComplete="given-name" /></Field>
              <label className="flex items-start gap-2.5 text-sm text-ink/70"><input type="checkbox" className="mt-1 accent-salmon" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />Quero receber promoções do Raijin no WhatsApp (dá pra sair quando quiser).</label>
            </>
          )}
          <Button size="lg" loading={busy} disabled={code.length !== 6}>Entrar</Button>
        </form>
      )}
    </Sheet>
  );
}

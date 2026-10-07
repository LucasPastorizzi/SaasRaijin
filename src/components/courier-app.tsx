"use client";
import { useEffect, useState } from "react";
import { Banknote, CreditCard, MapPin, MessageCircle, Navigation, Phone, Power, CheckCircle2, AlertTriangle, LogOut } from "lucide-react";
import { Logo } from "./logo";
import { Badge, Button, cx, Field, Input, Select, Sheet, Spinner, Textarea, ToastProvider, useToast } from "./ui";
import { api, useApi } from "@/lib/client";
import { brl, fmtTime, PAYMENT_LABEL } from "@/lib/format";

type Delivery = {
  id: number; code: string; status: string; total_cents: number; payment_method: string; payment_status: string; change_for_cents: number | null;
  address: { street: string; number: string; complement?: string; reference?: string; zone?: string } | null; notes: string | null;
  customer_name: string | null; customer_phone: string; items: number; eta_minutes: number | null;
};
type Me = { courier: { id: number; name: string; on_shift: boolean; shift_started_at: string | null }; deliveries: Delivery[]; summary: { deliveries: number; pay: number; cash: number; balance: number } | null };

export function CourierApp() {
  return <ToastProvider><CourierInner /></ToastProvider>;
}

function CourierInner() {
  const { data, error, reload } = useApi<Me>("/api/courier/me", 5000);
  if (error?.status === 401) return <CourierLogin onDone={reload} />;
  if (!data) return <div className="grid min-h-dvh place-items-center"><Spinner /></div>;
  return <Dashboard me={data} reload={reload} />;
}

function CourierLogin({ onDone }: { onDone: () => void }) {
  const [phone, setPhone] = useState(""), [pin, setPin] = useState(""), [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const { data: demo } = useApi<{ demo: boolean }>("/api/courier/session");
  return (
    <div className="flex min-h-dvh flex-col bg-ink px-5 py-10 text-paper">
      <Logo tone="paper" />
      <h1 className="h-title mt-10 text-4xl">app do<br /><span className="text-salmon">motoboy</span></h1>
      <form className="mt-8 flex flex-col gap-3 text-ink" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr(null);
        try { await api("/api/courier/session", { body: { phone, pin } }); onDone(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
      }}>
        <Input inputMode="tel" placeholder="Teu WhatsApp" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-14 bg-paper text-lg" />
        <Input inputMode="numeric" type="password" placeholder="PIN" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className="h-14 bg-paper text-lg tracking-[.4em]" />
        {err && <p className="text-sm font-semibold text-salmon-soft">{err}</p>}
        <Button size="lg" loading={busy}>Entrar</Button>
        {demo?.demo && <Button type="button" size="lg" variant="paper" onClick={async () => { await api("/api/courier/session", { body: { demo: true } }); onDone(); }}>Entrar como motoboy de demonstração</Button>}
      </form>
      <p className="mt-auto pt-10 text-xs text-paper/50">O PIN é cadastrado pelo gerente no painel.</p>
    </div>
  );
}

function Dashboard({ me, reload }: { me: Me; reload: () => void }) {
  const toast = useToast();
  const [deliver, setDeliver] = useState<Delivery | null>(null);
  const [issue, setIssue] = useState<Delivery | null>(null);

  // envia a localização a cada ~30 s durante o turno (rastreio no painel/cliente)
  useEffect(() => {
    if (!me.courier.on_shift || !("geolocation" in navigator)) return;
    const send = () => navigator.geolocation.getCurrentPosition((p) => api("/api/courier/me", { body: { action: "location", lat: p.coords.latitude, lng: p.coords.longitude } }).catch(() => {}), () => {}, { enableHighAccuracy: true, maximumAge: 20000 });
    send();
    const t = setInterval(send, 30000);
    return () => clearInterval(t);
  }, [me.courier.on_shift]);

  const act = async (id: number, body: object, ok: string) => {
    try { await api(`/api/courier/orders/${id}`, { body }); toast(ok, "ok"); reload(); return true; } catch (e) { toast((e as Error).message, "error"); return false; }
  };

  return (
    <div className="min-h-dvh pb-10">
      <header className="sticky top-0 z-20 bg-ink px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] text-paper">
        <div className="flex items-center justify-between">
          <Logo tone="paper" small />
          <button aria-label="Sair" className="text-paper/60 cursor-pointer" onClick={async () => { await api("/api/courier/session", { method: "DELETE" }); location.reload(); }}><LogOut className="size-5" /></button>
        </div>
        <p className="mt-3 text-sm text-paper/60">Oi, {me.courier.name.split(" ")[0]}!</p>
        <button onClick={async () => { try { await api("/api/courier/me", { body: { action: "shift", on: !me.courier.on_shift } }); reload(); } catch (e) { toast((e as Error).message, "error"); } }}
          className={cx("mt-2 flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-lg font-bold cursor-pointer", me.courier.on_shift ? "bg-ok text-white" : "bg-paper/10 text-paper")}>
          <Power className="size-5" />{me.courier.on_shift ? `Em turno desde ${fmtTime(me.courier.shift_started_at)}` : "Iniciar turno"}
        </button>
        {me.summary && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-paper/8 p-2"><p className="text-[11px] text-paper/55">entregas</p><p className="font-bold">{me.summary.deliveries}</p></div>
            <div className="rounded-xl bg-paper/8 p-2"><p className="text-[11px] text-paper/55">a receber</p><p className="font-bold">{brl(me.summary.pay)}</p></div>
            <div className="rounded-xl bg-paper/8 p-2"><p className="text-[11px] text-paper/55">dinheiro em mãos</p><p className="font-bold">{brl(me.summary.cash)}</p></div>
          </div>
        )}
      </header>

      <main className="flex flex-col gap-3 p-4">
        <h2 className="h-title text-2xl">tuas entregas</h2>
        {!me.deliveries.length && <p className="rounded-2xl bg-white/60 p-6 text-center text-ink/55 ring-1 ring-ink/8">{me.courier.on_shift ? "Nenhuma entrega atribuída. Aguarde a loja 🍣" : "Inicie o turno para receber entregas."}</p>}
        {me.deliveries.map((d) => {
          const maps = d.address ? encodeURIComponent(`${d.address.street}, ${d.address.number}, ${d.address.zone ?? ""}, Ivoti - RS`) : "";
          const cash = d.payment_method === "cash" && d.payment_status !== "pago";
          const machine = d.payment_method === "card_machine" && d.payment_status !== "pago";
          return (
            <article key={d.id} className={cx("anim-rise overflow-hidden rounded-3xl bg-white ring-1 ring-ink/8", d.status === "saiu" && "ring-2 ring-salmon")}>
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <b className="text-lg">#{d.code}</b>
                  <Badge tone={d.status === "saiu" ? "salmon" : d.status === "pronto" ? "ok" : "neutral"}>{d.status === "saiu" ? "em rota" : d.status === "pronto" ? "pronto p/ retirar" : "na cozinha"}</Badge>
                </div>
                <p className="mt-2 font-semibold">{d.customer_name ?? "Cliente"}</p>
                {d.address && <p className="mt-1 flex gap-1.5 text-sm text-ink/75"><MapPin className="mt-0.5 size-4 shrink-0 text-salmon" />{d.address.street}, {d.address.number}{d.address.complement ? ` — ${d.address.complement}` : ""} · <b>{d.address.zone}</b></p>}
                {d.address?.reference && <p className="ml-5.5 text-xs text-ink/55">Ref.: {d.address.reference}</p>}
                {d.notes && <p className="mt-2 rounded-xl bg-salmon/10 p-2 text-sm">📝 {d.notes}</p>}
                <div className={cx("mt-3 flex items-center gap-2 rounded-2xl p-3 text-sm font-semibold", cash ? "bg-amber-100" : machine ? "bg-sky-100" : "bg-ok/10 text-ok")}>
                  {cash ? <Banknote className="size-5" /> : <CreditCard className="size-5" />}
                  {cash ? <>Cobrar {brl(d.total_cents)} em dinheiro{d.change_for_cents ? ` · levar troco p/ ${brl(d.change_for_cents)} (${brl(d.change_for_cents - d.total_cents)})` : ""}</>
                    : machine ? <>Levar maquininha · {brl(d.total_cents)}</> : <>Já pago ({PAYMENT_LABEL[d.payment_method]})</>}
                </div>
              </div>
              <div className="grid grid-cols-3 border-t border-ink/8 text-sm font-semibold">
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${maps}`} target="_blank" rel="noopener" className="flex items-center justify-center gap-1.5 py-3 hover:bg-ink/4"><Navigation className="size-4" />Rota</a>
                <a href={`tel:${d.customer_phone}`} className="flex items-center justify-center gap-1.5 border-x border-ink/8 py-3 hover:bg-ink/4"><Phone className="size-4" />Ligar</a>
                <a href={`https://wa.me/${d.customer_phone.replace(/\D/g, "")}`} target="_blank" rel="noopener" className="flex items-center justify-center gap-1.5 py-3 hover:bg-ink/4"><MessageCircle className="size-4" />Whats</a>
              </div>
              <div className="flex gap-2 border-t border-ink/8 p-3">
                {d.status === "pronto" && <Button size="lg" className="flex-1" onClick={() => act(d.id, { action: "pickup" }, "Bora! Cliente avisado 🛵")}>Peguei, saindo</Button>}
                {["aceito", "preparo"].includes(d.status) && <p className="flex-1 py-3 text-center text-sm text-ink/55">Aguardando a cozinha…</p>}
                {d.status === "saiu" && <>
                  <Button size="lg" variant="line" onClick={() => act(d.id, { action: "arrived" }, "Chegada registrada")}>Cheguei</Button>
                  <Button size="lg" className="flex-1" onClick={() => setDeliver(d)}><CheckCircle2 className="size-5" />Entregue</Button>
                </>}
                <Button size="lg" variant="ghost" aria-label="Ocorrência" onClick={() => setIssue(d)}><AlertTriangle className="size-5" /></Button>
              </div>
            </article>
          );
        })}
      </main>

      {deliver && <DeliverSheet d={deliver} onClose={() => setDeliver(null)} onConfirm={async (pin) => { if (await act(deliver.id, { action: "deliver", pin }, "Entrega concluída ✅")) setDeliver(null); }} />}
      {issue && <IssueSheet onClose={() => setIssue(null)} onSend={async (kind, note) => { if (await act(issue.id, { action: "issue", kind, note }, "Ocorrência enviada para a loja")) setIssue(null); }} />}
    </div>
  );
}

function DeliverSheet({ d, onClose, onConfirm }: { d: Delivery; onClose: () => void; onConfirm: (pin: string) => void }) {
  const [pin, setPin] = useState("");
  return (
    <Sheet open onClose={onClose} title={`Entregar #${d.code}`}>
      <p className="text-sm text-ink/65">Peça ao cliente o <b>código de entrega de 4 dígitos</b> (aparece no app e no WhatsApp dele).</p>
      <Input inputMode="numeric" maxLength={4} autoFocus value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className="mt-4 h-16 text-center text-3xl font-bold tracking-[.5em]" />
      <Button size="lg" className="mt-4 w-full" disabled={pin.length !== 4} onClick={() => onConfirm(pin)}>Confirmar entrega</Button>
    </Sheet>
  );
}

function IssueSheet({ onClose, onSend }: { onClose: () => void; onSend: (kind: string, note?: string) => void }) {
  const [kind, setKind] = useState("ausente"), [note, setNote] = useState("");
  return (
    <Sheet open onClose={onClose} title="Ocorrência">
      <div className="flex flex-col gap-3">
        <Field label="O que aconteceu?"><Select value={kind} onChange={(e) => setKind(e.target.value)}><option value="ausente">Cliente ausente</option><option value="endereco">Endereço errado / não encontrado</option><option value="recusado">Pedido recusado</option><option value="outro">Outro</option></Select></Field>
        <Textarea placeholder="Detalhes (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button size="lg" onClick={() => onSend(kind, note || undefined)}>Avisar a loja</Button>
      </div>
    </Sheet>
  );
}

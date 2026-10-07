"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/logo";
import { Button, Field, Input } from "@/components/ui";
import { api, useApi } from "@/lib/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data } = useApi<{ demo: boolean }>("/api/staff/session");
  return (
    <div className="seigaiha grid min-h-dvh place-items-center px-4">
      <form className="w-full max-w-sm rounded-3xl bg-paper p-7 shadow-xl ring-1 ring-ink/10"
        onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setErr(null);
          try { await api("/api/staff/session", { body: { email, password } }); router.replace("/painel"); }
          catch (e) { setErr((e as Error).message); setBusy(false); }
        }}>
        <Logo />
        <h1 className="h-title mt-6 text-3xl">painel da equipe</h1>
        <div className="mt-5 flex flex-col gap-3">
          <Field label="E-mail"><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></Field>
          <Field label="Senha" error={err}><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <Button size="lg" className="mt-1" loading={busy}>Entrar</Button>
          {data?.demo && (
            <Button type="button" size="lg" variant="line" onClick={async () => { setBusy(true); try { await api("/api/staff/session", { body: { demo: true } }); router.replace("/painel"); } catch (e) { setErr((e as Error).message); setBusy(false); } }}>
              Entrar como demonstração
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

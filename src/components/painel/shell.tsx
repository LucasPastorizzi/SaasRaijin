"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { ClipboardList, UtensilsCrossed, Bike, Users, MessageCircle, Ticket, Wallet, BarChart3, Settings, LogOut, ExternalLink } from "lucide-react";
import { Logo } from "../logo";
import { cx, Spinner, ToastProvider } from "../ui";
import { api, useApi } from "@/lib/client";

export type StaffUser = { id: number; name: string; email: string; role: "admin" | "gerente" | "atendente" | "cozinha" };
const StaffCtx = createContext<StaffUser | null>(null);
export const useStaff = () => useContext(StaffCtx)!;
export const canManage = (s: StaffUser) => s.role === "admin" || s.role === "gerente";

const NAV = [
  { href: "/painel", label: "Pedidos", icon: ClipboardList },
  { href: "/painel/cardapio", label: "Cardápio", icon: UtensilsCrossed },
  { href: "/painel/motoboys", label: "Motoboys", icon: Bike },
  { href: "/painel/clientes", label: "Clientes", icon: Users },
  { href: "/painel/whatsapp", label: "WhatsApp", icon: MessageCircle, badge: "wa" },
  { href: "/painel/cupons", label: "Cupons", icon: Ticket },
  { href: "/painel/caixa", label: "Caixa", icon: Wallet },
  { href: "/painel/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/painel/config", label: "Configurações", icon: Settings },
];

export function PanelShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { data, loading } = useApi<{ staff: StaffUser | null }>(path === "/painel/login" ? null : "/api/staff/session");
  const { data: wa } = useApi<{ unread: number }>(data?.staff ? "/api/admin/wa?filter=abertas" : null, 8000);

  useEffect(() => { if (!loading && data && !data.staff) router.replace("/painel/login"); }, [data, loading, router]);

  if (path === "/painel/login") return <ToastProvider>{children}</ToastProvider>;
  if (!data?.staff) return <div className="grid min-h-dvh place-items-center"><Spinner /></div>;

  const active = (href: string) => (href === "/painel" ? path === "/painel" : path.startsWith(href));
  return (
    <StaffCtx.Provider value={data.staff}>
      <ToastProvider>
        <div className="flex min-h-dvh">
          <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-ink/10 bg-ink text-paper lg:flex">
            <div className="px-5 py-5"><Logo tone="paper" small /></div>
            <nav className="flex flex-1 flex-col gap-0.5 px-3">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className={cx("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors", active(n.href) ? "bg-salmon text-white" : "text-paper/70 hover:bg-white/8 hover:text-paper")}>
                  <n.icon className="size-4.5" />{n.label}
                  {n.badge === "wa" && !!wa?.unread && <span className="ml-auto rounded-full bg-salmon px-1.5 text-xs font-bold text-white">{wa.unread}</span>}
                </Link>
              ))}
            </nav>
            <div className="border-t border-white/10 p-4 text-sm">
              <p className="font-semibold">{data.staff.name}</p>
              <p className="text-xs capitalize text-paper/55">{data.staff.role}</p>
              <div className="mt-3 flex gap-3 text-paper/70">
                <a href="/" target="_blank" className="inline-flex items-center gap-1 hover:text-paper"><ExternalLink className="size-3.5" />Loja</a>
                <button className="inline-flex items-center gap-1 hover:text-paper cursor-pointer" onClick={async () => { await api("/api/staff/session", { method: "DELETE" }); router.replace("/painel/login"); }}><LogOut className="size-3.5" />Sair</button>
              </div>
            </div>
          </aside>

          <div className="min-w-0 flex-1 pb-20 lg:pb-0">
            {/* topo mobile */}
            <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-ink/10 bg-ink px-4 text-paper lg:hidden">
              <Logo tone="paper" small />
              <button className="text-sm text-paper/70 cursor-pointer" onClick={async () => { await api("/api/staff/session", { method: "DELETE" }); router.replace("/painel/login"); }}>Sair</button>
            </header>
            {children}
          </div>

          {/* navegação mobile */}
          <nav className="no-scrollbar fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-ink/10 bg-paper/95 backdrop-blur pb-[env(safe-area-inset-bottom)] lg:hidden">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={cx("relative flex min-w-[76px] flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold", active(n.href) ? "text-salmon-deep" : "text-ink/55")}>
                <n.icon className="size-5" />{n.label}
                {n.badge === "wa" && !!wa?.unread && <span className="absolute right-4 top-1 size-2 rounded-full bg-salmon" />}
              </Link>
            ))}
          </nav>
        </div>
      </ToastProvider>
    </StaffCtx.Provider>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 px-4 pb-4 pt-6 sm:px-6">
      <div><h1 className="h-title text-3xl sm:text-4xl">{title}</h1>{sub && <p className="mt-1 text-sm text-ink/60">{sub}</p>}</div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-2xl bg-white/70 ring-1 ring-ink/8", className)}>{children}</div>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink/55">{hint}</p>}
    </Card>
  );
}

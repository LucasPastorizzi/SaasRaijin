"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { X } from "lucide-react";

const cx = (...c: (string | number | false | null | undefined)[]) => c.filter((x) => typeof x === "string" && x).join(" ");
export { cx };

type BtnVariant = "salmon" | "ink" | "line" | "ghost" | "danger" | "paper";
export function Button({ variant = "salmon", size = "md", className, loading, children, ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" | "lg"; loading?: boolean }) {
  const v: Record<BtnVariant, string> = {
    salmon: "bg-salmon text-white hover:bg-ink",
    ink: "bg-ink text-paper hover:bg-salmon",
    line: "border-[1.5px] border-ink/80 text-ink hover:bg-ink hover:text-paper",
    ghost: "text-ink hover:bg-ink/5",
    danger: "bg-torii text-white hover:bg-ink",
    paper: "bg-paper text-ink hover:bg-white",
  };
  const s = { sm: "h-9 px-3.5 text-sm rounded-lg", md: "h-11 px-5 text-[15px] rounded-xl", lg: "h-14 px-6 text-base rounded-2xl" }[size];
  return (
    <button {...p} disabled={p.disabled || loading}
      className={cx("inline-flex items-center justify-center gap-2 font-semibold transition-colors duration-300 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salmon cursor-pointer select-none", v[variant], s, className)}>
      {loading ? <span className="size-4 rounded-full border-2 border-current border-t-transparent animate-spin" /> : null}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children, className }: { label?: string; hint?: string; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={cx("flex flex-col gap-1.5", className)}>
      {label && <span className="text-[13px] font-semibold text-ink/80">{label}</span>}
      {children}
      {hint && !error && <span className="text-xs text-ink/55">{hint}</span>}
      {error && <span className="text-xs font-medium text-torii">{error}</span>}
    </label>
  );
}

const inputCls = "h-11 w-full rounded-xl border border-ink/15 bg-white/70 px-3.5 text-[15px] outline-none transition focus:border-salmon focus:ring-2 focus:ring-salmon/25 placeholder:text-ink/35";
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputCls, p.className)} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx(inputCls, "h-auto min-h-20 py-2.5", p.className)} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(inputCls, "pr-8", p.className)} />;

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="inline-flex items-center gap-2.5 cursor-pointer">
      <span className={cx("relative h-6 w-11 rounded-full transition-colors", checked ? "bg-salmon" : "bg-ink/20")}>
        <span className={cx("absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-5.5" : "translate-x-0.5")} />
      </span>
      {label && <span className="text-sm font-medium">{label}</span>}
    </button>
  );
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "salmon" | "ink" | "ok" | "warn" | "danger"; className?: string }) {
  const t = { neutral: "bg-ink/7 text-ink/75", salmon: "bg-salmon/15 text-salmon-deep", ink: "bg-ink text-paper", ok: "bg-ok/12 text-ok", warn: "bg-amber-500/15 text-amber-700", danger: "bg-torii/12 text-torii" }[tone];
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", t, className)}>{children}</span>;
}

/** Modal (desktop) / bottom sheet (mobile) */
export function Sheet({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    const o = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", k); document.body.style.overflow = o; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/50 anim-fade" onClick={onClose} />
      <div className={cx("relative w-full bg-paper sm:rounded-3xl rounded-t-3xl shadow-2xl anim-sheet flex flex-col max-h-[92dvh]", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        <div className="flex items-center justify-between gap-4 px-5 pt-5 pb-3">
          <div className="text-xl font-bold tracking-tight">{title}</div>
          <button onClick={onClose} aria-label="Fechar" className="grid size-9 place-items-center rounded-full bg-ink/6 hover:bg-ink/12 cursor-pointer"><X className="size-4.5" /></button>
        </div>
        <div className="overflow-y-auto px-5 pb-5 flex-1">{children}</div>
        {footer && <div className="border-t border-ink/10 p-4">{footer}</div>}
      </div>
    </div>
  );
}

/* toasts */
type Toast = { id: number; text: string; tone: "ok" | "error" | "info" };
const ToastCtx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { id, text, tone }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={cx("anim-rise pointer-events-auto max-w-md rounded-2xl px-4 py-3 text-sm font-medium shadow-xl",
            t.tone === "error" ? "bg-torii text-white" : t.tone === "ok" ? "bg-ink text-paper" : "bg-white text-ink")}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      {icon && <div className="mb-1 text-ink/30">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {children && <div className="max-w-sm text-sm text-ink/60">{children}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx("inline-block size-6 rounded-full border-[3px] border-salmon border-t-transparent animate-spin", className)} aria-label="Carregando" />;
}

/** Placeholder ilustrado quando o produto não tem foto */
export function DishArt({ seed, className }: { seed: string; className?: string }) {
  const h = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0);
  const variants = [
    <g key="a"><ellipse cx="50" cy="64" rx="30" ry="9" fill="#161412" opacity=".08" /><rect x="24" y="40" width="52" height="22" rx="11" fill="#fff" /><path d="M26 44c8-7 40-7 48 0v6H26z" fill="#ef7d32" /><path d="M34 42l4 8M46 40l4 10M58 41l4 9" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity=".7" /></g>,
    <g key="b"><circle cx="50" cy="52" r="22" fill="#161412" /><circle cx="50" cy="52" r="15" fill="#fff" /><circle cx="50" cy="52" r="8" fill="#ef7d32" /></g>,
    <g key="c"><path d="M28 34 72 28 52 76z" fill="#2a2622" /><path d="M30 34c6-10 18-12 24-8 6-6 16-3 18 2l-42 6z" fill="#ef7d32" /><path d="M42 40l8 20" stroke="#9be08f" strokeWidth="3" strokeLinecap="round" /></g>,
    <g key="d"><path d="M22 46h56c0 14-12 24-28 24S22 60 22 46z" fill="#161412" /><path d="M30 46c0-8 6-12 12-11 3-6 13-7 17-1 7-2 12 5 10 12z" fill="#ef7d32" /><circle cx="44" cy="40" r="3" fill="#fff" /><circle cx="56" cy="38" r="3" fill="#9be08f" /></g>,
  ];
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <rect width="100" height="100" fill={h % 2 ? "#ebe2d3" : "#f6b07e33"} />
      {variants[h % variants.length]}
    </svg>
  );
}

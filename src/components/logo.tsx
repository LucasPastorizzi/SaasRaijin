export function LogoMark({ className = "size-10", tone = "ink" }: { className?: string; tone?: "ink" | "paper" }) {
  const c = tone === "ink" ? "#161412" : "#f3ece1";
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" style={{ overflow: "visible" }}>
      <rect x="18" y="20" width="62" height="62" rx="10" fill="#ef7d32" />
      <g stroke="#fff" strokeOpacity=".55" strokeWidth="3" strokeLinecap="round" fill="none">
        <path d="M26 44c8-5 16-5 24 0s16 5 24 0" /><path d="M26 58c8-5 16-5 24 0s16 5 24 0" /><path d="M26 72c8-5 16-5 24 0" />
      </g>
      <rect x="18" y="20" width="62" height="62" rx="10" fill="none" stroke={c} strokeWidth="7" />
      <path d="M8 6 92 94" stroke={c} strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ tone = "ink", small = false }: { tone?: "ink" | "paper"; small?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark className={small ? "size-8" : "size-10"} tone={tone} />
      <span className="flex flex-col leading-none">
        <b className={`${small ? "text-xl" : "text-[26px]"} font-bold tracking-tight`}>raijin</b>
        <small className="text-[8.5px] font-semibold tracking-[.55em] pl-0.5 mt-0.5">SUSHI</small>
      </span>
    </span>
  );
}

/** Raio ⚡ desenhado (confirmação de pedido) */
export function Bolt({ className = "size-24" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M13.5 1 4 14h6.5L9 23l11-14h-7z" fill="none" stroke="#ef7d32" strokeWidth="1.6" strokeLinejoin="round"
        strokeDasharray="120" style={{ animation: "bolt 1s ease forwards" }} />
    </svg>
  );
}

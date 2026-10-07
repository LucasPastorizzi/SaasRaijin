// Horários de funcionamento — puro, usado no servidor e no cliente.
// hours: { "0": [[18, 22.5]], "1": [], ... } (0 = domingo; horas decimais)

export type Hours = Record<string, [number, number][]>;

const DAY = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
export const DAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export const fmtHour = (h: number) => `${Math.floor(h)}h${h % 1 ? String(Math.round((h % 1) * 60)).padStart(2, "0") : ""}`;

/** "agora" no fuso de São Paulo */
export function spNow(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", weekday: "short", hour: "numeric", minute: "numeric", hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const h = (Number(get("hour")) % 24) + Number(get("minute")) / 60;
  return { day, h };
}

export function openStatus(hours: Hours, forceClosed = false) {
  const { day, h } = spNow();
  if (forceClosed) return { open: false, label: "Fechado temporariamente", closesAt: null as number | null };
  const cur = (hours[day] ?? []).find(([a, b]) => h >= a && h < b);
  if (cur) return { open: true, label: cur[1] >= 24 ? "Aberto agora" : `Aberto · até ${fmtHour(cur[1])}`, closesAt: cur[1] };
  for (let i = 0; i < 8; i++) {
    const d = (day + i) % 7;
    const nx = (hours[d] ?? []).find(([a]) => i > 0 || h < a);
    if (nx) {
      const when = i === 0 ? "hoje" : i === 1 ? "amanhã" : DAY[d];
      return { open: false, label: `Fechado · abre ${when} às ${fmtHour(nx[0])}`, closesAt: null };
    }
  }
  return { open: false, label: "Fechado", closesAt: null };
}

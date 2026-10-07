// Utilitários puros (usados no servidor e no cliente)

export const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** "29,90" | "29.90" | "29" → 2990 */
export const toCents = (v: string | number) => {
  if (typeof v === "number") return Math.round(v * 100);
  const n = Number(v.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/** Normaliza telefone BR para E.164 (+55DDDNUMERO) */
export const normPhone = (raw: string) => {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (!d.startsWith("55")) d = "55" + d;
  return "+" + d;
};

export const fmtPhone = (e164: string) => {
  const d = e164.replace(/\D/g, "").replace(/^55/, "");
  if (d.length < 10) return e164;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
};

export const fmtTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "";

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";

export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? `${fmtDate(iso)} ${fmtTime(iso)}` : "";

export const minutesAgo = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 60000);

/** remove acentos para busca */
export const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export const ORDER_STATUS = {
  novo: "Recebido",
  aceito: "Aceito",
  preparo: "Em preparo",
  pronto: "Pronto",
  saiu: "Saiu para entrega",
  entregue: "Entregue",
  cancelado: "Cancelado",
} as const;
export type OrderStatus = keyof typeof ORDER_STATUS;

export const PAYMENT_LABEL: Record<string, string> = {
  pix: "Pix online",
  card_online: "Cartão online",
  cash: "Dinheiro na entrega",
  card_machine: "Cartão na maquininha",
};

"use client";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: opts.body ? { "Content-Type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (json as { error?: string }).error ?? "Algo deu errado");
  return json as T;
}

/** GET com recarga manual e polling opcional (tempo real simples). */
export function useApi<T>(url: string | null, intervalMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const reload = useCallback(async () => {
    if (!url) return;
    try { setData(await api<T>(url)); setError(null); } catch (e) { setError(e as ApiError); }
  }, [url]);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    const run = () => api<T>(url).then((d) => { if (alive) { setData(d); setError(null); } }).catch((e: ApiError) => { if (alive) setError(e); });
    run();
    const t = intervalMs ? setInterval(() => { if (document.visibilityState === "visible") run(); }, intervalMs) : undefined;
    return () => { alive = false; if (t) clearInterval(t); };
  }, [url, intervalMs]);

  return { data, error, loading: !!url && !data && !error, reload, setData };
}

const lsSubscribe = (cb: () => void) => { window.addEventListener("storage", cb); window.addEventListener("ls-change", cb); return () => { window.removeEventListener("storage", cb); window.removeEventListener("ls-change", cb); }; };

/** Estado persistido no localStorage, seguro para SSR/hidratação. */
export function useLocalStorage<T>(key: string, initial: T) {
  const raw = useSyncExternalStore(lsSubscribe, () => { try { return localStorage.getItem(key); } catch { return null; } }, () => null);
  const value = useMemo<T>(() => { try { return raw ? (JSON.parse(raw) as T) : initial; } catch { return initial; } }, [raw]); // eslint-disable-line react-hooks/exhaustive-deps
  const setValue = useCallback((next: T | ((prev: T) => T)) => {
    let prev = initial;
    try { const r = localStorage.getItem(key); if (r) prev = JSON.parse(r); } catch {}
    const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
    try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
    window.dispatchEvent(new Event("ls-change"));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return [value, setValue] as const;
}

/** Entrada de dinheiro "29,90" ↔ centavos */
export const centsToInput = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));
export const inputToCents = (s: string) => {
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

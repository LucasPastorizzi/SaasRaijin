import "server-only";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { seed } from "./seed";
import { dbPath } from "./env";

// Banco local (SQLite embutido no Node). Em produção, trocar por Postgres (Supabase) —
// o SQL foi escrito para ser portável (sem features exclusivas do SQLite além de json_*).

const DB_PATH = dbPath();

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'atendente', active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS delivery_zones (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, fee_cents INTEGER NOT NULL, extra_minutes INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, emoji TEXT, sort INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY, category_id INTEGER NOT NULL REFERENCES categories(id),
  name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', price_cents INTEGER NOT NULL,
  promo_price_cents INTEGER, promo_until TEXT, image TEXT, tags TEXT NOT NULL DEFAULT '[]',
  pieces INTEGER, prep_minutes INTEGER, sku TEXT, stock INTEGER,
  active INTEGER NOT NULL DEFAULT 1, paused INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_variants (
  id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL, price_cents INTEGER NOT NULL, sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS option_groups (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, min INTEGER NOT NULL DEFAULT 0, max INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS options (
  id INTEGER PRIMARY KEY, group_id INTEGER NOT NULL REFERENCES option_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL, price_cents INTEGER NOT NULL DEFAULT 0, paused INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS product_option_groups (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES option_groups(id) ON DELETE CASCADE,
  sort INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (product_id, group_id)
);

CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL, old_cents INTEGER, new_cents INTEGER NOT NULL,
  changed_by TEXT, at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY, phone TEXT UNIQUE NOT NULL, name TEXT, email TEXT, birthday TEXT,
  marketing_opt_in INTEGER NOT NULL DEFAULT 0, opt_in_at TEXT, tags TEXT NOT NULL DEFAULT '[]', notes TEXT NOT NULL DEFAULT '',
  loyalty_cents INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS customer_addresses (
  id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label TEXT, street TEXT NOT NULL, number TEXT NOT NULL, complement TEXT, reference TEXT,
  zone_id INTEGER REFERENCES delivery_zones(id), created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS couriers (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT UNIQUE NOT NULL, pin TEXT NOT NULL,
  vehicle TEXT NOT NULL DEFAULT 'moto', plate TEXT, pix_key TEXT,
  pay_rule TEXT NOT NULL DEFAULT 'fixed', pay_value INTEGER NOT NULL DEFAULT 600, daily_cents INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1, on_shift INTEGER NOT NULL DEFAULT 0, shift_started_at TEXT,
  last_lat REAL, last_lng REAL, last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, type TEXT NOT NULL, value INTEGER NOT NULL DEFAULT 0,
  min_cents INTEGER NOT NULL DEFAULT 0, starts_at TEXT, ends_at TEXT, max_uses INTEGER, per_customer INTEGER NOT NULL DEFAULT 1,
  first_order_only INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, uses INTEGER NOT NULL DEFAULT 0,
  description TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, customer_id INTEGER NOT NULL REFERENCES customers(id),
  channel TEXT NOT NULL DEFAULT 'app', type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'novo',
  subtotal_cents INTEGER NOT NULL, discount_cents INTEGER NOT NULL DEFAULT 0, delivery_fee_cents INTEGER NOT NULL DEFAULT 0,
  loyalty_used_cents INTEGER NOT NULL DEFAULT 0, total_cents INTEGER NOT NULL,
  payment_method TEXT NOT NULL, payment_status TEXT NOT NULL DEFAULT 'pendente', change_for_cents INTEGER,
  address TEXT, zone_id INTEGER, coupon_code TEXT, notes TEXT, eta_minutes INTEGER, scheduled_for TEXT,
  courier_id INTEGER REFERENCES couriers(id), delivery_pin TEXT, settlement_id INTEGER,
  cancel_reason TEXT, rating INTEGER, rating_comment TEXT,
  created_at TEXT NOT NULL, accepted_at TEXT, ready_at TEXT, dispatched_at TEXT, delivered_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER, name TEXT NOT NULL, variant TEXT, unit_cents INTEGER NOT NULL, qty INTEGER NOT NULL,
  options TEXT NOT NULL DEFAULT '[]', notes TEXT, total_cents INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL, note TEXT, by TEXT, at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS courier_settlements (
  id INTEGER PRIMARY KEY, courier_id INTEGER NOT NULL REFERENCES couriers(id), started_at TEXT, ended_at TEXT NOT NULL,
  deliveries INTEGER NOT NULL, pay_cents INTEGER NOT NULL, cash_collected_cents INTEGER NOT NULL,
  balance_cents INTEGER NOT NULL, settled_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wa_conversations (
  id INTEGER PRIMARY KEY, phone TEXT UNIQUE NOT NULL, customer_id INTEGER REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'aberta', assigned_to TEXT, unread INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT, last_inbound_at TEXT, bot_stage TEXT
);
CREATE TABLE IF NOT EXISTS wa_messages (
  id INTEGER PRIMARY KEY, conversation_id INTEGER NOT NULL REFERENCES wa_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'text', body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'enviada',
  internal INTEGER NOT NULL DEFAULT 0, author TEXT, wa_id TEXT, at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS otp_codes (phone TEXT PRIMARY KEY, code TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS cash_sessions (
  id INTEGER PRIMARY KEY, opened_at TEXT NOT NULL, opened_by TEXT, opening_cents INTEGER NOT NULL DEFAULT 0,
  closed_at TEXT, closed_by TEXT, counted_cash_cents INTEGER, notes TEXT
);
CREATE TABLE IF NOT EXISTS cash_movements (
  id INTEGER PRIMARY KEY, session_id INTEGER NOT NULL REFERENCES cash_sessions(id), type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL, note TEXT, by TEXT, at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY, actor TEXT, action TEXT NOT NULL, detail TEXT, at TEXT NOT NULL DEFAULT (datetime('now')));
`;

const g = globalThis as unknown as { __raijinDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (g.__raijinDb) return g.__raijinDb;
  fs.mkdirSync(/*turbopackIgnore: true*/ path.dirname(DB_PATH), { recursive: true });
  const fresh = !fs.existsSync(/*turbopackIgnore: true*/ DB_PATH);
  const d = new DatabaseSync(/*turbopackIgnore: true*/ DB_PATH);
  d.exec(SCHEMA);
  const has = d.prepare("SELECT COUNT(*) AS n FROM categories").get() as { n: number };
  if (fresh || has.n === 0) seed(d);
  g.__raijinDb = d;
  return d;
}

/* helpers ---------------------------------------------------------------- */
type Param = string | number | null | bigint;
export const all = <T = Record<string, unknown>>(sql: string, ...p: Param[]) => db().prepare(sql).all(...p) as T[];
export const get = <T = Record<string, unknown>>(sql: string, ...p: Param[]) => db().prepare(sql).get(...p) as T | undefined;
export const run = (sql: string, ...p: Param[]) => db().prepare(sql).run(...p);

export function tx<T>(fn: () => T): T {
  const d = db();
  d.exec("BEGIN");
  try { const r = fn(); d.exec("COMMIT"); return r; } catch (e) { d.exec("ROLLBACK"); throw e; }
}

export const nowIso = () => new Date().toISOString();

export function getSetting<T>(key: string, fallback: T): T {
  const r = get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key);
  return r ? (JSON.parse(r.value) as T) : fallback;
}
export function setSetting(key: string, value: unknown) {
  run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, JSON.stringify(value));
}

export function audit(actor: string, action: string, detail?: unknown) {
  run("INSERT INTO audit_log (actor, action, detail) VALUES (?, ?, ?)", actor, action, detail ? JSON.stringify(detail) : null);
}

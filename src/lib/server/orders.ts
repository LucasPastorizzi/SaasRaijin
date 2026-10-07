import "server-only";
import { z } from "zod";
import { all, audit, get, getSetting, nowIso, run, tx } from "./db";
import { DEFAULT_SETTINGS, randomPin } from "./seed";
import { effectivePrice, loadMenu } from "./menu";
import { HttpError } from "./session";
import { sendWhatsApp } from "./whatsapp";
import { brl, type OrderStatus } from "@/lib/format";
import { openStatus } from "@/lib/hours";

export const cartItemSchema = z.object({
  productId: z.number().int(),
  variantId: z.number().int().nullable().optional(),
  qty: z.number().int().min(1).max(50),
  optionIds: z.array(z.number().int()).default([]),
  notes: z.string().max(200).optional(),
});
export const orderSchema = z.object({
  items: z.array(cartItemSchema).min(1, "Carrinho vazio"),
  type: z.enum(["delivery", "pickup"]),
  address: z.object({
    street: z.string().min(2, "Informe a rua"), number: z.string().min(1, "Informe o número"),
    complement: z.string().optional(), reference: z.string().optional(), zoneId: z.number().int(),
  }).optional(),
  saveAddress: z.boolean().optional(),
  paymentMethod: z.enum(["pix", "card_online", "cash", "card_machine"]),
  changeFor: z.number().int().optional(),
  coupon: z.string().optional(),
  useLoyalty: z.boolean().optional(),
  notes: z.string().max(300).optional(),
  scheduledFor: z.string().optional(),
});
export type OrderInput = z.infer<typeof orderSchema>;

/** Recalcula tudo no servidor — nunca confiar em preço vindo do cliente. */
export function priceCart(items: OrderInput["items"]) {
  const { products } = loadMenu();
  const lines = items.map((it) => {
    const p = products.find((x) => x.id === it.productId);
    if (!p) throw new HttpError(400, "Um item do carrinho não existe mais");
    if (p.paused) throw new HttpError(409, `${p.name} está esgotado no momento`);
    const variant = it.variantId ? p.variants.find((v) => v.id === it.variantId) : null;
    if (p.variants.length && !variant) throw new HttpError(400, `Escolha uma opção de ${p.name}`);
    if (it.variantId && !variant) throw new HttpError(400, `Opção inválida para ${p.name}`);
    const valid = new Set(p.groups.flatMap((g) => g.options.map((o) => o.id)));
    if (it.optionIds.some((id) => !valid.has(id))) throw new HttpError(400, `Adicional inválido para ${p.name}`);
    const base = variant ? variant.price_cents : effectivePrice(p);
    const chosen = p.groups.flatMap((g) => g.options.filter((o) => it.optionIds.includes(o.id)).map((o) => ({ ...o, group: g.name })));
    for (const g of p.groups) {
      const n = chosen.filter((o) => o.group === g.name).length;
      if (n < g.min) throw new HttpError(400, `${p.name}: escolha pelo menos ${g.min} em "${g.name}"`);
      if (n > g.max) throw new HttpError(400, `${p.name}: no máximo ${g.max} em "${g.name}"`);
    }
    if (chosen.some((o) => o.paused)) throw new HttpError(409, `Uma opção de ${p.name} acabou`);
    const unit = base + chosen.reduce((s, o) => s + o.price_cents, 0);
    return {
      productId: p.id, name: p.name, variant: variant?.name ?? null, unit, qty: it.qty, notes: it.notes ?? null,
      options: chosen.map((o) => ({ name: o.name, group: o.group, price_cents: o.price_cents })), total: unit * it.qty, stock: p.stock,
    };
  });
  return { lines, subtotal: lines.reduce((s, l) => s + l.total, 0) };
}

export function checkCoupon(code: string, subtotal: number, customerId: number | null) {
  const c = get<{ id: number; code: string; type: string; value: number; min_cents: number; starts_at: string | null; ends_at: string | null;
    max_uses: number | null; uses: number; per_customer: number; first_order_only: number; active: number }>(
    "SELECT * FROM coupons WHERE code = ? COLLATE NOCASE", code.trim());
  if (!c || !c.active) throw new HttpError(404, "Cupom inválido");
  const now = Date.now();
  if (c.starts_at && new Date(c.starts_at).getTime() > now) throw new HttpError(400, "Esse cupom ainda não começou");
  if (c.ends_at && new Date(c.ends_at).getTime() < now) throw new HttpError(400, "Cupom expirado");
  if (c.max_uses != null && c.uses >= c.max_uses) throw new HttpError(400, "Cupom esgotado");
  if (subtotal < c.min_cents) throw new HttpError(400, `Cupom válido para pedidos a partir de ${brl(c.min_cents)}`);
  if (customerId) {
    const used = get<{ n: number }>("SELECT COUNT(*) n FROM orders WHERE customer_id = ? AND coupon_code = ? AND status != 'cancelado'", customerId, c.code)!.n;
    if (used >= c.per_customer) throw new HttpError(400, "Tu já usou esse cupom");
    if (c.first_order_only) {
      const n = get<{ n: number }>("SELECT COUNT(*) n FROM orders WHERE customer_id = ? AND status != 'cancelado'", customerId)!.n;
      if (n > 0) throw new HttpError(400, "Cupom válido só no primeiro pedido");
    }
  }
  return c;
}

function quote(input: OrderInput, customerId: number | null, loyaltyBalance: number) {
  const ops = getSetting("ops", DEFAULT_SETTINGS.ops);
  const { lines, subtotal } = priceCart(input.items);
  if (subtotal < ops.minOrderCents) throw new HttpError(400, `Pedido mínimo de ${brl(ops.minOrderCents)}`);
  let fee = 0, zone: { id: number; name: string; fee_cents: number; extra_minutes: number } | undefined;
  if (input.type === "delivery") {
    if (!input.address) throw new HttpError(400, "Informe o endereço de entrega");
    zone = get("SELECT id, name, fee_cents, extra_minutes FROM delivery_zones WHERE id = ? AND active = 1", input.address.zoneId);
    if (!zone) throw new HttpError(400, "Ainda não entregamos nesse bairro. Que tal retirar no balcão?");
    fee = zone.fee_cents;
  } else if (!ops.pickupEnabled) throw new HttpError(400, "Retirada indisponível no momento");
  let discount = 0, coupon: string | null = null;
  if (input.coupon) {
    const c = checkCoupon(input.coupon, subtotal, customerId);
    coupon = c.code;
    if (c.type === "pct") discount = Math.round((subtotal * c.value) / 100);
    else if (c.type === "fixed") discount = Math.min(c.value, subtotal);
    else if (c.type === "free_delivery") discount = fee;
  }
  const beforeLoyalty = subtotal + fee - discount;
  const loyaltyUsed = input.useLoyalty ? Math.min(loyaltyBalance, beforeLoyalty) : 0;
  return { lines, subtotal, fee, discount, coupon, zone, loyaltyUsed, total: beforeLoyalty - loyaltyUsed };
}

export function quoteOrder(input: OrderInput, customer: { id: number; loyalty_cents: number } | null) {
  const q = quote(input, customer?.id ?? null, customer?.loyalty_cents ?? 0);
  return { subtotal: q.subtotal, fee: q.fee, discount: q.discount, loyaltyUsed: q.loyaltyUsed, total: q.total, zone: q.zone?.name ?? null };
}

export async function createOrder(input: OrderInput, customerId: number, channel: "app" | "whatsapp" | "balcao" | "telefone" = "app", by = "cliente") {
  const settings = { ops: getSetting("ops", DEFAULT_SETTINGS.ops), hours: getSetting("hours", DEFAULT_SETTINGS.hours), payments: getSetting("payments", DEFAULT_SETTINGS.payments) };
  const status = openStatus(settings.hours, settings.ops.forceClosed);
  if (channel === "app") {
    if (!status.open && !input.scheduledFor) throw new HttpError(409, `${status.label}. Tu pode agendar o pedido.`);
    if (!settings.payments[input.paymentMethod]) throw new HttpError(400, "Forma de pagamento indisponível");
  }
  const customer = get<{ id: number; name: string | null; phone: string; loyalty_cents: number }>("SELECT id, name, phone, loyalty_cents FROM customers WHERE id = ?", customerId)!;
  const q = quote(input, customerId, customer.loyalty_cents);
  if (input.paymentMethod === "cash" && input.changeFor && input.changeFor < q.total) throw new HttpError(400, "O troco precisa ser para um valor maior que o total");

  const at = nowIso();
  const order = tx(() => {
    const code = nextCode();
    const address = input.type === "delivery" && input.address ? JSON.stringify({ ...input.address, zone: q.zone?.name }) : null;
    const id = Number(run(`INSERT INTO orders (code, customer_id, channel, type, subtotal_cents, discount_cents, delivery_fee_cents, loyalty_used_cents, total_cents,
        payment_method, payment_status, change_for_cents, address, zone_id, coupon_code, notes, scheduled_for, delivery_pin, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?, ?, ?, ?, ?, ?, ?)`,
      code, customerId, channel, input.type, q.subtotal, q.discount, q.fee, q.loyaltyUsed, q.total, input.paymentMethod,
      input.changeFor ?? null, address, q.zone?.id ?? null, q.coupon, input.notes ?? null, input.scheduledFor ?? null, randomPin(), at).lastInsertRowid);
    for (const l of q.lines) {
      run("INSERT INTO order_items (order_id, product_id, name, variant, unit_cents, qty, options, notes, total_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        id, l.productId, l.name, l.variant, l.unit, l.qty, JSON.stringify(l.options), l.notes, l.total);
      if (l.stock !== null) run("UPDATE products SET stock = MAX(stock - ?, 0) WHERE id = ?", l.qty, l.productId);
    }
    run("INSERT INTO order_events (order_id, status, by, at) VALUES (?, 'novo', ?, ?)", id, by, at);
    if (q.coupon) run("UPDATE coupons SET uses = uses + 1 WHERE code = ?", q.coupon);
    if (q.loyaltyUsed) run("UPDATE customers SET loyalty_cents = loyalty_cents - ? WHERE id = ?", q.loyaltyUsed, customerId);
    if (input.saveAddress && input.address) {
      const exists = get("SELECT id FROM customer_addresses WHERE customer_id = ? AND street = ? AND number = ?", customerId, input.address.street, input.address.number);
      if (!exists) run("INSERT INTO customer_addresses (customer_id, label, street, number, complement, reference, zone_id) VALUES (?, 'Endereço', ?, ?, ?, ?, ?)",
        customerId, input.address.street, input.address.number, input.address.complement ?? null, input.address.reference ?? null, input.address.zoneId);
    }
    return { id, code };
  });
  await notify(order.id, "novo");
  return order;
}

function nextCode() {
  const last = get<{ code: string }>("SELECT code FROM orders ORDER BY id DESC LIMIT 1");
  return String((last ? Number(last.code) : 1000) + 1);
}

/* ---------------- transições de status ---------------- */

const FLOW: Record<string, OrderStatus[]> = {
  novo: ["aceito", "cancelado"],
  aceito: ["preparo", "pronto", "cancelado"],
  preparo: ["pronto", "cancelado"],
  pronto: ["saiu", "entregue", "cancelado"],
  saiu: ["entregue", "cancelado"],
  entregue: [],
  cancelado: [],
};

export async function setStatus(orderId: number, to: OrderStatus, by: string, extra: { eta?: number; reason?: string; courierId?: number } = {}) {
  const o = get<{ id: number; status: string; type: string; customer_id: number; total_cents: number; payment_status: string; loyalty_used_cents: number; courier_id: number | null }>(
    "SELECT id, status, type, customer_id, total_cents, payment_status, loyalty_used_cents, courier_id FROM orders WHERE id = ?", orderId);
  if (!o) throw new HttpError(404, "Pedido não encontrado");
  if (!FLOW[o.status]?.includes(to)) throw new HttpError(409, `Não dá pra ir de "${o.status}" para "${to}"`);
  if (to === "saiu" && o.type !== "delivery") throw new HttpError(409, "Pedido de retirada não sai para entrega");
  if (to === "saiu" && !(extra.courierId ?? o.courier_id)) throw new HttpError(409, "Atribua um motoboy antes");
  const at = nowIso();
  tx(() => {
    const col = { aceito: "accepted_at", pronto: "ready_at", saiu: "dispatched_at", entregue: "delivered_at" }[to as string];
    run(`UPDATE orders SET status = ?${col ? `, ${col} = ?` : ""} WHERE id = ?`, ...(col ? [to, at, orderId] : [to, orderId]));
    if (to === "aceito") run("UPDATE orders SET eta_minutes = ? WHERE id = ?", extra.eta ?? getSetting("ops", DEFAULT_SETTINGS.ops).deliveryBaseMinutes, orderId);
    if (extra.courierId) run("UPDATE orders SET courier_id = ? WHERE id = ?", extra.courierId, orderId);
    if (to === "cancelado") {
      run("UPDATE orders SET cancel_reason = ? WHERE id = ?", extra.reason ?? "Não informado", orderId);
      if (o.loyalty_used_cents) run("UPDATE customers SET loyalty_cents = loyalty_cents + ? WHERE id = ?", o.loyalty_used_cents, o.customer_id);
      if (o.payment_status === "pago") run("UPDATE orders SET payment_status = 'estornado' WHERE id = ?", orderId); // TODO: estorno no gateway
    }
    if (to === "entregue") {
      run("UPDATE orders SET payment_status = 'pago' WHERE id = ? AND payment_status = 'pendente'", orderId);
      const loyalty = getSetting("loyalty", DEFAULT_SETTINGS.loyalty);
      if (loyalty.enabled) {
        const earn = Math.floor(o.total_cents / loyalty.everyCents) * loyalty.rewardCents;
        if (earn) run("UPDATE customers SET loyalty_cents = loyalty_cents + ? WHERE id = ?", earn, o.customer_id);
      }
    }
    run("INSERT INTO order_events (order_id, status, note, by, at) VALUES (?, ?, ?, ?, ?)", orderId, to, extra.reason ?? null, by, at);
  });
  audit(by, `pedido.${to}`, { orderId });
  await notify(orderId, to);
}

export function assignCourier(orderId: number, courierId: number | null, by: string) {
  const o = get<{ status: string; type: string }>("SELECT status, type FROM orders WHERE id = ?", orderId);
  if (!o) throw new HttpError(404, "Pedido não encontrado");
  if (o.type !== "delivery") throw new HttpError(409, "Só pedidos de entrega têm motoboy");
  if (["entregue", "cancelado"].includes(o.status)) throw new HttpError(409, "Pedido já finalizado");
  run("UPDATE orders SET courier_id = ? WHERE id = ?", courierId, orderId);
  run("INSERT INTO order_events (order_id, status, note, by, at) VALUES (?, 'motoboy', ?, ?, ?)", orderId,
    courierId ? `Atribuído a ${get<{ name: string }>("SELECT name FROM couriers WHERE id = ?", courierId)?.name}` : "Motoboy removido", by, nowIso());
}

async function notify(orderId: number, status: string) {
  const o = get<{ code: string; total_cents: number; eta_minutes: number | null; delivery_pin: string; cancel_reason: string | null; phone: string; name: string | null; courier: string | null }>(
    `SELECT o.code, o.total_cents, o.eta_minutes, o.delivery_pin, o.cancel_reason, c.phone, c.name, k.name AS courier
     FROM orders o JOIN customers c ON c.id = o.customer_id LEFT JOIN couriers k ON k.id = o.courier_id WHERE o.id = ?`, orderId);
  if (!o) return;
  const tpl = (getSetting("messages", DEFAULT_SETTINGS.messages) as Record<string, string>)[status];
  if (!tpl) return;
  const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const text = tpl
    .replaceAll("{nome}", o.name?.split(" ")[0] ?? "")
    .replaceAll("{codigo}", o.code)
    .replaceAll("{total}", brl(o.total_cents))
    .replaceAll("{eta}", String(o.eta_minutes ?? ""))
    .replaceAll("{link}", `${site}/pedido/${o.code}`)
    .replaceAll("{motoboy}", o.courier ?? "nosso motoboy")
    .replaceAll("{pin}", o.delivery_pin)
    .replaceAll("{motivo}", o.cancel_reason ?? "");
  await sendWhatsApp(o.phone, text, { kind: "template", author: "sistema" });
  if (status === "novo" || status === "entregue") {
    const { sendOrderEmail } = await import("./email");
    await sendOrderEmail(orderId, status).catch((e) => console.error("e-mail do pedido:", e));
  }
}

/* ---------------- leitura ---------------- */

export type OrderRow = {
  id: number; code: string; customer_id: number; channel: string; type: string; status: OrderStatus; subtotal_cents: number; discount_cents: number;
  delivery_fee_cents: number; loyalty_used_cents: number; total_cents: number; payment_method: string; payment_status: string; change_for_cents: number | null;
  address: string | null; coupon_code: string | null; notes: string | null; eta_minutes: number | null; scheduled_for: string | null; courier_id: number | null;
  delivery_pin: string; cancel_reason: string | null; rating: number | null; rating_comment: string | null; created_at: string; accepted_at: string | null;
  ready_at: string | null; dispatched_at: string | null; delivered_at: string | null; customer_name: string | null; customer_phone: string; courier_name: string | null;
};

export function orderDetail(where: "id" | "code", value: number | string) {
  const o = get<OrderRow>(`SELECT o.*, c.name AS customer_name, c.phone AS customer_phone, k.name AS courier_name
    FROM orders o JOIN customers c ON c.id = o.customer_id LEFT JOIN couriers k ON k.id = o.courier_id WHERE o.${where} = ?`, value);
  if (!o) return null;
  const items = all<{ name: string; variant: string | null; unit_cents: number; qty: number; options: string; notes: string | null; total_cents: number; product_id: number }>(
    "SELECT * FROM order_items WHERE order_id = ?", o.id).map((i) => ({ ...i, options: JSON.parse(i.options) as { name: string; price_cents: number }[] }));
  const events = all<{ status: string; note: string | null; by: string | null; at: string }>("SELECT status, note, by, at FROM order_events WHERE order_id = ? ORDER BY id", o.id);
  return { ...o, address: o.address ? (JSON.parse(o.address) as Record<string, string>) : null, items, events };
}
export type OrderDetail = NonNullable<ReturnType<typeof orderDetail>>;

export function activeOrders() {
  const rows = all<OrderRow>(`SELECT o.*, c.name AS customer_name, c.phone AS customer_phone, k.name AS courier_name
    FROM orders o JOIN customers c ON c.id = o.customer_id LEFT JOIN couriers k ON k.id = o.courier_id
    WHERE o.status NOT IN ('entregue','cancelado') OR datetime(COALESCE(o.delivered_at, o.created_at)) >= datetime('now','-12 hours')
    ORDER BY o.id DESC LIMIT 300`);
  const ids = rows.map((r) => r.id);
  const items = ids.length ? all<{ order_id: number; name: string; variant: string | null; qty: number; options: string; notes: string | null }>(
    `SELECT order_id, name, variant, qty, options, notes FROM order_items WHERE order_id IN (${ids.join(",")})`) : [];
  return rows.map((r) => ({
    ...r, address: r.address ? JSON.parse(r.address) : null,
    items: items.filter((i) => i.order_id === r.id).map((i) => ({ ...i, options: JSON.parse(i.options) })),
  }));
}

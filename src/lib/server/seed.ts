import type { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import { hashPassword } from "./password";
import type { Hours } from "@/lib/hours";

// Cardápio real do Raijin (preços de referência, out/2026 — confirmar com o restaurante).
// Adicionais e zonas de entrega são EXEMPLOS para desenvolvimento: ajustar pelo painel.

type P = { n: string; d?: string; p: number; pcs?: number; tags?: string[]; img?: string; variants?: [string, number][]; groups?: string[] };
const MENU: { cat: string; emoji: string; items: P[] }[] = [
  { cat: "Promoção", emoji: "🔥", items: [
    { n: "Combo hot roll", d: "24 unidades com crisp de alho-poró, cream cheese, cebolinha e tarê.", p: 5400, pcs: 24, tags: ["promo"], img: "/img/hot.jpg" },
  ]},
  { cat: "Hambúrguer de sushi", emoji: "🍔", items: [
    { n: "Hambúrguer de salmão", d: "Base de arroz 150 g, cream cheese 40 g, salmão cru 70 g, tarê, crisp e cebolinha.", p: 4500, tags: ["novo"] },
    { n: "Hambúrguer de salmão selado", d: "Base de arroz 150 g, cream cheese 40 g, salmão selado 70 g, tarê, crisp e cebolinha.", p: 4500 },
    { n: "Hambúrguer de camarão salteado", d: "Base de arroz 150 g, cream cheese 40 g, camarão 70 g, tarê, crisp e cebolinha.", p: 5000 },
  ]},
  { cat: "Porções", emoji: "🥢", items: [
    { n: "Hot (tarê e crisp)", d: "Hot roll crocante coberto com tarê e crisp.", p: 2200, img: "/img/hot.jpg", variants: [["10 unidades", 2200], ["20 unidades", 3700]], groups: ["Molhos extras"] },
    { n: "Hot com camarão", d: "8 unidades de hot roll com cream cheese, camarão e tarê.", p: 3700, pcs: 8, tags: ["mais-vendido"], groups: ["Molhos extras"] },
    { n: "Hot especial", d: "10 unidades cobertas com cream cheese, tarê, gergelim e cebolinha.", p: 2500, pcs: 10, groups: ["Molhos extras"] },
    { n: "Hot premium", d: "10 unidades de hot philadelphia coberto com salmão, cream cheese e cebolinha.", p: 3200, pcs: 10, tags: ["mais-vendido"], groups: ["Molhos extras"] },
    { n: "Rolinho primavera", d: "Massa crocante recheada com legumes. 6 unidades.", p: 2200, pcs: 6, tags: ["vegetariano"] },
    { n: "Ussuzukuri", d: "12 lâminas finas de salmão com molho cítrico.", p: 4000, pcs: 12 },
  ]},
  { cat: "Big Hot", emoji: "⚡", items: [
    { n: "Big Hot de salmão selado", d: "Hot crocante aberto recheado com cream cheese, salmão selado, gergelim, tarê e cebolinha.", p: 4200 },
    { n: "Big Hot de camarão salteado", d: "Hot crocante aberto recheado com cream cheese, camarão salteado, gergelim, tarê e cebolinha.", p: 4700, tags: ["mais-vendido"] },
  ]},
  { cat: "Crocantes", emoji: "✨", items: [
    { n: "Crocante Philadelphia", d: "Nori crocante, arroz, cream cheese, salmão cru 80 g, cebolinha, gergelim e tarê.", p: 4500 },
    { n: "Crocante Philadelphia selado", d: "Nori crocante, arroz, cream cheese, salmão selado 80 g, cebolinha, gergelim e tarê.", p: 4500 },
    { n: "Crocante de camarão salteado", d: "Nori crocante, arroz, cream cheese, camarão salteado, cebolinha, gergelim e tarê.", p: 5500 },
  ]},
  { cat: "Pokes", emoji: "🥗", items: [
    { n: "Monte seu poke", d: "Faça do seu jeito: escolha base, proteína, acompanhamentos, crocantes e molho.", p: 3900, tags: ["novo"], groups: ["Poke · Base", "Poke · Proteína", "Poke · Acompanhamentos", "Poke · Crocantes", "Poke · Molho"] },
    { n: "Poke selado com geleia de pimenta", d: "Arroz, salmão maçaricado com geleia de pimenta, cream cheese, cebolinha, picles de cebola roxa e crisp.", p: 4500 },
    { n: "Poke Philadelphia", d: "Arroz, salmão, cream cheese, cebolinha, picles de cebola roxa e crisp. Acompanha 2 shoyu e 1 tarê.", p: 4500 },
    { n: "Poke especial", d: "Arroz, salmão cru, cream cheese, sunomono, crisp de couve e cebola roxa.", p: 4500 },
    { n: "Poke especial 2.0", d: "Arroz, salmão cru 60 g, cream cheese, manga, tomate cereja, crisp de alho-poró, crisp de couve, cebolinha e gergelim.", p: 4700 },
    { n: "Poke de camarão", d: "Arroz, camarão salteado, cream cheese, crisp de alho-poró, crisp de couve, cebola roxa, cebolinha e gergelim.", p: 5500 },
  ]},
  { cat: "Temakis", emoji: "🍙", items: [
    { n: "Temaki Philadelphia", d: "Arroz, salmão, cream cheese e cebolinha. Acompanha 2 shoyu e 2 tarê.", p: 2900, groups: ["Tirar ingredientes"] },
    { n: "Temaki Alaska", d: "Arroz, salmão, cream cheese, pepino, cebolinha e gergelim.", p: 2800, groups: ["Tirar ingredientes"] },
    { n: "Temaki Skin", d: "Arroz, cream cheese, skin, cebolinha e gergelim.", p: 2200 },
    { n: "Temaki Philadelphia hot", d: "Salmão e cream cheese, empanado na panko, coberto com tarê e cebolinha.", p: 3300 },
    { n: "Temaki camarão salteado", d: "Arroz, camarão salteado, cream cheese e cebolinha verde.", p: 3800, tags: ["mais-vendido"] },
    { n: "Temaki camarão hot", d: "Temaki hot recheado com arroz, cream cheese e camarão.", p: 5500 },
  ]},
  { cat: "Yakisoba", emoji: "🍜", items: [
    { n: "Yakisoba de salmão", d: "Macarrão para yakisoba, legumes, molho oriental e salmão.", p: 5000 },
    { n: "Yakisoba de camarão", d: "Macarrão para yakisoba, legumes, molho oriental e camarão.", p: 5500 },
    { n: "Yakisoba de frango", d: "Macarrão para yakisoba, legumes, molho oriental e frango.", p: 4500 },
    { n: "Yakisoba vegetariano", d: "Macarrão para yakisoba, legumes e molho oriental.", p: 3990, tags: ["vegetariano"] },
  ]},
  { cat: "Combinados especiais", emoji: "🍱", items: [
    { n: "Combinado Salmão", d: "18 peças + 1 temaki philadelphia: 8 uramaki philadelphia e 10 hot philadelphia com tarê e crisp.", p: 7200, pcs: 18, img: "/img/rolls.jpg" },
    { n: "Combinado 22 peças", d: "4 lâminas de salmão, 4 joe com cebolinha, 8 hossomaki philadelphia e 6 niguiris com raspas de limão.", p: 8200, pcs: 22 },
    { n: "Combinado 26 peças", d: "8 uramaki peixe crocante com geleia de pimenta, 4 lâminas de salmão, 4 joe, 2 niguiris e 10 hot especial.", p: 7000, pcs: 26 },
    { n: "Combinado 40 peças", d: "4 lâminas de salmão, 4 joe selado, 16 hots, 8 uramaki de peixe com geleia de pimenta e 8 uramaki alaska.", p: 11800, pcs: 40 },
  ]},
  { cat: "Tradicionais Raijin", emoji: "雷", items: [
    { n: "Mini Sensei", d: "8 uramaki philadelphia, 3 niguiris de salmão e 5 hossomaki de salmão.", p: 4500, pcs: 16 },
    { n: "Combinado 1", d: "8 hot philadelphia ao tarê e crisp, 8 uramaki philadelphia e 8 hossomaki kani com cebola roxa.", p: 5800, pcs: 24 },
    { n: "Combinado 2", d: "8 uramaki philadelphia, 8 hossomaki de skin e 8 uramaki peixe crocante com geleia de pimenta.", p: 5800, pcs: 24 },
    { n: "Combinado 3", d: "8 uramaki philadelphia, 4 niguiris de salmão, 8 hossomaki de kani e 4 joe de pepino com tataki.", p: 7200, pcs: 24 },
    { n: "Combo Sensei misto", d: "8 hossomaki misto, 8 uramaki misto, 8 niguiris misto e 8 joe.", p: 6300, pcs: 32 },
    { n: "Combo Sensei", d: "8 hossomaki salmão, 8 uramaki philadelphia, 8 niguiris salmão e 8 joe salmão.", p: 8500, pcs: 32, img: "/img/rolls.jpg" },
    { n: "Combinado 4", d: "20 hots, 8 hossomaki salmão, 8 hossomaki pepino, 8 hossomaki kani e 8 uramaki philadelphia.", p: 9500, pcs: 52 },
    { n: "Combinado 5", d: "20 hots, 32 hossomakis variados e 8 uramaki de peixe crocante com geleia de pimenta.", p: 9900, pcs: 60 },
    { n: "Combo Kyoto", d: "16 hossomakis salmão, 16 uramakis philadelphia, 8 niguiris e 4 joe de salmão.", p: 13000, pcs: 44 },
    { n: "Combinado 6", d: "16 hossomaki philadelphia, 16 uramaki philadelphia, 4 joe, 4 niguiris e 10 sashimis.", p: 16000, pcs: 50 },
    { n: "Combinado 8", d: "20 hots, 32 uramakis, 8 hossomaki skin, 8 hossomaki pepino, 10 sashimi flambado e 2 temakis.", p: 22000, pcs: 80 },
    { n: "Combo vegetariano", d: "30 peças + 10 hots vegetarianos.", p: 7000, pcs: 40, tags: ["vegetariano"] },
  ]},
  { cat: "Peças", emoji: "🍣", items: [
    { n: "Sashimi", d: "10 lâminas de salmão cru fresco.", p: 4500, pcs: 10 },
    { n: "Lâmina de salmão", d: "Sashimi por unidade.", p: 550, pcs: 1 },
    { n: "Uramaki Phila", d: "8 unidades. Arroz, salmão, cream cheese e cebolinha.", p: 2700, pcs: 8 },
    { n: "Uramaki Phila especial", d: "8 unidades. Uramaki phila com camarão salteado.", p: 3900, pcs: 8 },
    { n: "Uramaki peixe crocante", d: "8 unidades. Arroz, peixe crocante, cream cheese e geleia.", p: 2500, pcs: 8 },
    { n: "Uramaki Alaska", d: "8 unidades. Arroz, salmão, cream cheese, pepino e cebolinha.", p: 2500, pcs: 8 },
    { n: "Uramaki Skin", d: "Arroz, skin, tarê, gergelim e cebolinha.", p: 2300 },
    { n: "Hossomaki Phila", d: "8 unidades. Arroz, salmão, cream cheese e cebolinha.", p: 2200, pcs: 8 },
    { n: "Hossomaki pepino", d: "8 unidades. Arroz e pepino.", p: 1200, pcs: 8, tags: ["vegetariano"] },
    { n: "Hossomaki kani", d: "8 unidades. Arroz e kani.", p: 1500, pcs: 8 },
    { n: "Joe", d: "4 unidades. Arroz, salmão e cream cheese.", p: 2700, pcs: 4, tags: ["mais-vendido"] },
    { n: "Joe com camarão", d: "4 unidades. Salmão, arroz, cream cheese e camarão salteado.", p: 3500, pcs: 4 },
    { n: "Niguiri", d: "4 unidades. Arroz e salmão cru fresco.", p: 2700, pcs: 4 },
  ]},
  { cat: "Molhos e extras", emoji: "🥡", items: [
    { n: "Shoyu light sachê", d: "8 ml", p: 100 },
    { n: "Tarê sachê", d: "8 ml", p: 100 },
  ]},
  { cat: "Bebidas", emoji: "🥤", items: [
    { n: "Água sem gás", p: 500 }, { n: "Água com gás", p: 500 },
    { n: "Coca-Cola lata", d: "350 ml", p: 700 }, { n: "Coca-Cola Zero lata", d: "350 ml", p: 700 },
    { n: "Sprite", d: "350 ml", p: 700 }, { n: "Fanta Guaraná", d: "350 ml", p: 700 },
    { n: "Suco de uva Del Valle", d: "Lata", p: 900 },
  ]},
];

const GROUPS: { name: string; min: number; max: number; opts: [string, number][] }[] = [
  { name: "Molhos extras", min: 0, max: 4, opts: [["Shoyu extra", 100], ["Tarê extra", 100], ["Geleia de pimenta", 300]] },
  { name: "Tirar ingredientes", min: 0, max: 3, opts: [["Sem cebolinha", 0], ["Sem cream cheese", 0], ["Sem gergelim", 0]] },
  { name: "Poke · Base", min: 1, max: 1, opts: [["Arroz japonês", 0], ["Mix de folhas", 0], ["Metade arroz, metade folhas", 0]] },
  { name: "Poke · Proteína", min: 1, max: 2, opts: [["Salmão cru", 0], ["Salmão selado", 0], ["Camarão salteado", 800], ["Kani", 0]] },
  { name: "Poke · Acompanhamentos", min: 2, max: 4, opts: [["Manga", 0], ["Pepino", 0], ["Tomate cereja", 0], ["Sunomono", 0], ["Picles de cebola roxa", 0], ["Cream cheese", 0]] },
  { name: "Poke · Crocantes", min: 0, max: 2, opts: [["Crisp de alho-poró", 0], ["Crisp de couve", 0], ["Gergelim", 0]] },
  { name: "Poke · Molho", min: 1, max: 2, opts: [["Tarê", 0], ["Shoyu", 0], ["Molho cítrico", 0], ["Geleia de pimenta", 200]] },
];

const ZONES: [string, number, number][] = [
  ["Centro", 500, 0], ["Sete de Setembro", 500, 0], ["Concórdia", 600, 5], ["Harmonia", 600, 5],
  ["Bom Jardim", 700, 5], ["25 de Julho", 700, 10], ["Jardim Panorâmico", 800, 10], ["Feitoria Nova", 900, 15],
];

export const DEFAULT_SETTINGS = {
  store: {
    name: "Raijin Sushi", tagline: "Sua escolha de sushi em Ivoti", phone: "+5551998362378",
    address: "Rua Pinto Bandeira, 305 · Sala 01 · Sete de Setembro · Ivoti/RS", instagram: "raijinsushi",
  },
  hours: { "0": [], "1": [], "2": [[19, 22]], "3": [[11.5, 13.5], [19, 22]], "4": [[11.5, 13.5], [19, 22]], "5": [[11.5, 13.5], [19, 22]], "6": [[11.5, 13.5], [19, 22]] } as Hours,
  ops: { minOrderCents: 3000, prepMinutes: 30, deliveryBaseMinutes: 35, forceClosed: false, autoPrint: false, allowScheduling: true, pickupEnabled: true, emailReceipts: true },
  payments: { pix: true, card_online: false, cash: true, card_machine: true },
  loyalty: { enabled: true, everyCents: 10000, rewardCents: 500 },
  messages: {
    novo: "Oi {nome}! 🍣 Recebemos teu pedido #{codigo} ({total}). Já já a gente confirma por aqui.",
    aceito: "Pedido #{codigo} confirmado! ⚡ Previsão: {eta} min. Acompanha aqui: {link}",
    preparo: "Teu pedido #{codigo} já tá sendo preparado 🔪🍣",
    pronto: "Pedido #{codigo} pronto pra retirada! Te esperamos no Raijin 🥢",
    saiu: "Pedido #{codigo} saiu pra entrega com {motoboy} 🛵 Código de entrega: {pin}",
    entregue: "Pedido #{codigo} entregue! Bom apetite 🥢 Conta pra gente como foi: {link}",
    cancelado: "Pedido #{codigo} foi cancelado. Motivo: {motivo}. Qualquer dúvida é só chamar aqui.",
  },
};

const FIRST = ["Ana", "Bruno", "Carla", "Diego", "Eduarda", "Felipe", "Gabriela", "Henrique", "Isadora", "João", "Larissa", "Marcos", "Natália", "Otávio", "Paula", "Rafael", "Sabrina", "Tiago", "Vanessa", "William", "Yasmin", "Lucas", "Fernanda", "Gustavo"];
const LAST = ["Schmitt", "Becker", "Klein", "Silva", "Müller", "Santos", "Weber", "Oliveira", "Fischer", "Souza", "Hoffmann", "Lima"];

export function seed(d: DatabaseSync) {
  d.exec("BEGIN");
  try {
    const set = d.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) set.run(k, JSON.stringify(v));

    if (process.env.NODE_ENV === "production" && !process.env.ADMIN_PASSWORD) throw new Error("Defina ADMIN_EMAIL e ADMIN_PASSWORD antes do primeiro start em produção");
    d.prepare("INSERT OR IGNORE INTO staff (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')")
      .run("Administrador", (process.env.ADMIN_EMAIL || "admin@raijin.local").toLowerCase(), hashPassword(process.env.ADMIN_PASSWORD || "raijin123"));

    const zIns = d.prepare("INSERT INTO delivery_zones (name, fee_cents, extra_minutes, sort) VALUES (?, ?, ?, ?)");
    ZONES.forEach(([n, f, m], i) => zIns.run(n, f, m, i));

    const gIns = d.prepare("INSERT INTO option_groups (name, min, max, sort) VALUES (?, ?, ?, ?)");
    const oIns = d.prepare("INSERT INTO options (group_id, name, price_cents, sort) VALUES (?, ?, ?, ?)");
    const groupId: Record<string, number> = {};
    GROUPS.forEach((g, i) => {
      const id = Number(gIns.run(g.name, g.min, g.max, i).lastInsertRowid);
      groupId[g.name] = id;
      g.opts.forEach(([n, p], j) => oIns.run(id, n, p, j));
    });

    const cIns = d.prepare("INSERT INTO categories (name, emoji, sort) VALUES (?, ?, ?)");
    const pIns = d.prepare("INSERT INTO products (category_id, name, description, price_cents, image, tags, pieces, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    const vIns = d.prepare("INSERT INTO product_variants (product_id, name, price_cents, sort) VALUES (?, ?, ?, ?)");
    const pgIns = d.prepare("INSERT INTO product_option_groups (product_id, group_id, sort) VALUES (?, ?, ?)");
    const productIds: { id: number; price: number; name: string }[] = [];
    MENU.forEach((c, ci) => {
      const cid = Number(cIns.run(c.cat, c.emoji, ci).lastInsertRowid);
      c.items.forEach((it, i) => {
        const pid = Number(pIns.run(cid, it.n, it.d ?? "", it.p, it.img ?? null, JSON.stringify(it.tags ?? []), it.pcs ?? null, i).lastInsertRowid);
        it.variants?.forEach(([vn, vp], j) => vIns.run(pid, vn, vp, j));
        it.groups?.forEach((gn, j) => pgIns.run(pid, groupId[gn], j));
        if (c.cat !== "Molhos e extras" && c.cat !== "Bebidas") productIds.push({ id: pid, price: it.p, name: it.n });
      });
    });

    d.prepare("INSERT INTO couriers (name, phone, pin, vehicle, plate, pix_key, pay_rule, pay_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run("Motoboy Exemplo 1", "+5551990000001", "1234", "moto", "ABC1D23", "motoboy1@pix.exemplo", "fixed", 600);
    d.prepare("INSERT INTO couriers (name, phone, pin, vehicle, plate, pix_key, pay_rule, pay_value, daily_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("Motoboy Exemplo 2", "+5551990000002", "4321", "moto", "XYZ9K87", "motoboy2@pix.exemplo", "pct", 80, 3000);

    d.prepare("INSERT INTO coupons (code, type, value, min_cents, first_order_only, description) VALUES (?, ?, ?, ?, ?, ?)")
      .run("BEMVINDO10", "pct", 10, 4000, 1, "10% no primeiro pedido acima de R$ 40");
    d.prepare("INSERT INTO coupons (code, type, value, min_cents, description) VALUES (?, ?, ?, ?, ?)")
      .run("FRETEGRATIS", "free_delivery", 0, 8000, "Frete grátis acima de R$ 80");

    // Dados fictícios para o painel/CRM ter o que mostrar em desenvolvimento
    if (process.env.SEED_DEMO !== "0") {
      seedDemo(d, productIds);
      d.exec("UPDATE orders SET settlement_id = 0"); // histórico de demonstração já "acertado"
    }
    d.exec("COMMIT");
  } catch (e) { d.exec("ROLLBACK"); throw e; }
}

function seedDemo(d: DatabaseSync, products: { id: number; price: number; name: string }[]) {
  const rnd = mulberry32(42);
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const zones = d.prepare("SELECT id, fee_cents FROM delivery_zones").all() as { id: number; fee_cents: number }[];
  const custIns = d.prepare("INSERT INTO customers (phone, name, marketing_opt_in, opt_in_at, created_at) VALUES (?, ?, ?, ?, ?)");
  const addrIns = d.prepare("INSERT INTO customer_addresses (customer_id, label, street, number, zone_id) VALUES (?, 'Casa', ?, ?, ?)");
  const ordIns = d.prepare(`INSERT INTO orders (code, customer_id, type, status, subtotal_cents, delivery_fee_cents, total_cents, payment_method, payment_status,
    address, zone_id, eta_minutes, courier_id, delivery_pin, created_at, accepted_at, ready_at, dispatched_at, delivered_at, rating)
    VALUES (?, ?, ?, 'entregue', ?, ?, ?, ?, 'pago', ?, ?, 35, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const itIns = d.prepare("INSERT INTO order_items (order_id, product_id, name, unit_cents, qty, total_cents) VALUES (?, ?, ?, ?, ?, ?)");
  const streets = ["Av. Presidente Lucena", "Rua Pinto Bandeira", "Rua Bento Gonçalves", "Rua São Paulo", "Rua Santos Dumont", "Rua Tiradentes", "Rua Engenheiro Jorge Schury"];
  let seq = 1000;
  for (let c = 0; c < 28; c++) {
    const name = `${FIRST[c % FIRST.length]} ${pick(LAST)}`;
    const phone = `+55519${String(81000000 + c * 3711).padStart(8, "0")}`;
    const created = daysAgo(Math.floor(rnd() * 150) + 20, rnd);
    const cid = Number(custIns.run(phone, name, rnd() > 0.3 ? 1 : 0, created, created).lastInsertRowid);
    const z = pick(zones);
    addrIns.run(cid, pick(streets), String(Math.floor(rnd() * 2000) + 10), z.id);
    // perfil: alguns VIP, alguns sumidos
    const profile = c % 7 === 0 ? "vip" : c % 5 === 0 ? "sumido" : "normal";
    const n = profile === "vip" ? 14 + Math.floor(rnd() * 8) : profile === "sumido" ? 2 + Math.floor(rnd() * 3) : 1 + Math.floor(rnd() * 6);
    for (let k = 0; k < n; k++) {
      const age = profile === "sumido" ? 70 + Math.floor(rnd() * 60) : Math.floor(rnd() * 85);
      const at = daysAgo(age, rnd, true);
      const items = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => ({ p: pick(products), q: rnd() > 0.8 ? 2 : 1 }));
      const sub = items.reduce((s, i) => s + i.p.price * i.q, 0);
      const delivery = rnd() > 0.2;
      const fee = delivery ? z.fee_cents : 0;
      const t = new Date(at).getTime();
      const iso = (min: number) => new Date(t + min * 60000).toISOString();
      const oid = Number(ordIns.run(String(seq++), cid, delivery ? "delivery" : "pickup", sub, fee, sub + fee,
        pick(["pix", "pix", "cash", "card_machine"]), delivery ? JSON.stringify({ street: pick(streets), number: "123", zone: "" }) : null,
        delivery ? z.id : null, delivery ? (rnd() > 0.5 ? 1 : 2) : null, String(1000 + Math.floor(rnd() * 9000)),
        at, iso(2), iso(25), delivery ? iso(28) : null, iso(delivery ? 48 : 30), rnd() > 0.5 ? 4 + Math.round(rnd()) : null).lastInsertRowid);
      items.forEach((i) => itIns.run(oid, i.p.id, i.p.name, i.p.price, i.q, i.p.price * i.q));
    }
  }
}

function daysAgo(n: number, rnd: () => number, dinnerTime = false) {
  const d = new Date(Date.now() - n * 86400000);
  if (dinnerTime) d.setUTCHours(22 + Math.floor(rnd() * 3), Math.floor(rnd() * 60)); // 19h–21h59 em SP
  if (d.getTime() > Date.now() - 3 * 3600_000) d.setTime(d.getTime() - 86400000); // nunca no futuro
  return d.toISOString();
}
function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const randomPin = () => String(crypto.randomInt(1000, 10000));

import "server-only";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { all, db, getSetting } from "./db";
import { DEFAULT_SETTINGS } from "./seed";
import { report, cashSummary, openCashSession } from "./finance";
import { customersWithStats, SEGMENTS, type Segment } from "./crm";
import { couriersOverview, settlementPreview } from "./couriers";
import { activeOrders, orderDetail } from "./orders";
import { loadMenu } from "./menu";
import { emailDetail, listEmails } from "./email";
import { brl, fold, ORDER_STATUS, PAYMENT_LABEL } from "@/lib/format";
import { openStatus } from "@/lib/hours";

/* ------------------------------------------------------------------
   Assistente de IA do painel (Claude + ferramentas somente leitura).
   - Consulta relatórios, pedidos, clientes, cardápio, motoboys e caixa.
   - Prepara impressões (relatório A4 / cupom 80 mm / comanda de pedido).
   Nada aqui altera dados: as ferramentas só leem.
------------------------------------------------------------------- */

const MODEL = "claude-opus-5-5";

export type PrintBlock =
  | { tipo: "texto"; texto: string }
  | { tipo: "destaques"; itens: { rotulo: string; valor: string }[] }
  | { tipo: "tabela"; colunas: string[]; linhas: string[][]; total?: string[] };
export type PrintDoc =
  | { kind: "documento"; titulo: string; subtitulo?: string; formato: "a4" | "termica_80mm"; blocos: PrintBlock[] }
  | { kind: "comanda"; order: NonNullable<ReturnType<typeof orderDetail>> };

export type ChatTurn = { role: "user" | "assistant"; content: string };

/* ---------- consulta SQL somente leitura (perguntas livres) ---------- */

let ro: DatabaseSync | null = null;
function readOnlyDb() {
  db(); // garante que o banco existe e está migrado
  ro ??= new DatabaseSync(/*turbopackIgnore: true*/ process.env.DATABASE_PATH || path.join(process.cwd(), "data", "raijin.db"), { readOnly: true });
  return ro;
}
const BLOCKED = /\b(staff|otp_codes|password_hash|pin|sqlite_\w+|pragma|attach|detach|load_extension|vacuum|insert|update|delete|drop|alter|create|replace)\b/i;

export function safeSelect(sql: string) {
  const q = sql.trim().replace(/;+\s*$/, "");
  if (!/^(select|with)\b/i.test(q)) return { error: "Só consultas SELECT são permitidas." };
  if (q.includes(";")) return { error: "Envie uma única consulta, sem ';' no meio." };
  if (BLOCKED.test(q)) return { error: "Consulta usa tabela ou comando não permitido." };
  try {
    const rows = readOnlyDb().prepare(`SELECT * FROM (${q}) LIMIT 200`).all();
    return { rows, truncated: rows.length === 200 };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

const SCHEMA_DOC = `
Tabelas (SQLite). Dinheiro SEMPRE em centavos (inteiro). Datas em ISO UTC: para horário de Ivoti use datetime(coluna, '-3 hours').
- orders(id, code, customer_id, channel[app|whatsapp|balcao|telefone], type[delivery|pickup], status[novo|aceito|preparo|pronto|saiu|entregue|cancelado],
  subtotal_cents, discount_cents, delivery_fee_cents, loyalty_used_cents, total_cents, payment_method[pix|card_online|cash|card_machine], payment_status[pendente|pago|estornado],
  change_for_cents, address(JSON), zone_id, coupon_code, notes, eta_minutes, scheduled_for, courier_id, cancel_reason, rating(1-5), rating_comment,
  created_at, accepted_at, ready_at, dispatched_at, delivered_at)
- order_items(order_id, product_id, name, variant, unit_cents, qty, options(JSON), notes, total_cents)
- order_events(order_id, status, note, by, at)
- customers(id, phone, name, email, birthday, marketing_opt_in, tags(JSON), notes, loyalty_cents, created_at)
- customer_addresses(customer_id, street, number, zone_id)
- delivery_zones(id, name, fee_cents, extra_minutes, active)
- categories(id, name, sort, active) / products(id, category_id, name, description, price_cents, promo_price_cents, promo_until, tags, pieces, stock, active, paused, deleted)
- product_variants(product_id, name, price_cents) / option_groups(id, name, min, max) / options(group_id, name, price_cents, paused)
- price_history(product_id, old_cents, new_cents, changed_by, at)
- couriers(id, name, vehicle, pay_rule[fixed|pct], pay_value, daily_cents, active, on_shift) / courier_settlements(courier_id, deliveries, pay_cents, cash_collected_cents, balance_cents, created_at)
- coupons(code, type[pct|fixed|free_delivery], value, min_cents, uses, active)
- cash_sessions(id, opened_at, closed_at, opening_cents, counted_cash_cents) / cash_movements(session_id, type[sangria|suprimento], amount_cents, at)
- wa_conversations(phone, status, assigned_to, last_message_at) / wa_messages(conversation_id, direction[in|out], body, at)
- email_messages(id, folder[entrada|enviados], direction, from_addr, from_name, to_addrs, subject, text, date, seen, customer_id)
Pedidos válidos para faturamento: status != 'cancelado'.`;

/* ---------- ferramentas ---------- */

const json = (v: unknown) => JSON.stringify(v);
const money = (c: number | null | undefined) => brl(c ?? 0);

export function buildTools(prints: PrintDoc[]) {
  return [
    betaZodTool({
      name: "relatorio_vendas",
      description: "Resumo de vendas dos últimos N dias: faturamento, nº de pedidos, ticket médio, cancelados, recompra, tempos médios, avaliação, vendas por dia e por dia da semana, top itens, formas de pagamento e cupons.",
      inputSchema: z.object({ dias: z.number().int().min(1).max(365).describe("Janela em dias, contando hoje") }),
      run: async ({ dias }) => {
        const r = report(dias);
        return json({
          periodo_dias: dias, faturamento: money(r.totals.gross), pedidos: r.totals.n, ticket_medio: money(r.avgTicket), cancelados: r.canceled,
          taxas_entrega: money(r.totals.fees), descontos: money(r.totals.discounts),
          recompra: r.repeat.total ? `${Math.round((r.repeat.repeat / r.repeat.total) * 100)}% (${r.repeat.repeat} de ${r.repeat.total} clientes)` : "—",
          tempo_preparo_min: r.timing.prep && Math.round(r.timing.prep), tempo_total_min: r.timing.delivery && Math.round(r.timing.delivery),
          avaliacao_media: r.rating.r && Number(r.rating.r.toFixed(2)), avaliacoes: r.rating.n,
          por_dia: r.byDay.map((d) => ({ dia: d.day, pedidos: d.n, total: money(d.total) })),
          por_dia_semana: r.byWeekday.map((d) => ({ dia_semana: ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][Number(d.wd)], pedidos: d.n, total: money(d.total) })),
          top_itens: r.topItems.map((t) => ({ item: t.name, qtd: t.qty, total: money(t.total) })),
          pagamentos: r.byPayment.map((p) => ({ forma: PAYMENT_LABEL[p.payment_method], pedidos: p.n, total: money(p.total) })),
          cupons: r.coupons.map((c) => ({ cupom: c.coupon_code, usos: c.n, desconto: money(c.discount) })),
        });
      },
    }),

    betaZodTool({
      name: "buscar_pedidos",
      description: "Lista pedidos com filtros. Use para perguntas sobre pedidos específicos, de um cliente, por status ou de um período.",
      inputSchema: z.object({
        codigo: z.string().optional().describe("Código do pedido, ex.: 1150"),
        cliente: z.string().optional().describe("Parte do nome ou telefone do cliente"),
        status: z.enum(["novo", "aceito", "preparo", "pronto", "saiu", "entregue", "cancelado"]).optional(),
        desde_dias: z.number().int().min(0).max(365).optional().describe("Só pedidos dos últimos N dias (0 = hoje)"),
        limite: z.number().int().min(1).max(50).optional(),
      }),
      run: async ({ codigo, cliente, status, desde_dias, limite = 20 }) => {
        const where: string[] = []; const p: (string | number)[] = [];
        if (codigo) { where.push("o.code = ?"); p.push(codigo); }
        if (status) { where.push("o.status = ?"); p.push(status); }
        if (desde_dias !== undefined) { where.push("date(datetime(o.created_at, '-3 hours')) >= date(datetime('now', '-3 hours'), ?)"); p.push(`-${desde_dias} days`); }
        let rows = all<{ code: string; status: string; type: string; total_cents: number; payment_method: string; created_at: string; name: string | null; phone: string; courier: string | null; rating: number | null }>(
          `SELECT o.code, o.status, o.type, o.total_cents, o.payment_method, o.created_at, o.rating, c.name, c.phone, k.name courier
           FROM orders o JOIN customers c ON c.id = o.customer_id LEFT JOIN couriers k ON k.id = o.courier_id
           ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY o.created_at DESC LIMIT 300`, ...p);
        if (cliente) { const f = fold(cliente); rows = rows.filter((r) => fold(`${r.name ?? ""} ${r.phone}`).includes(f)); }
        return json(rows.slice(0, limite).map((r) => ({ codigo: r.code, status: ORDER_STATUS[r.status as keyof typeof ORDER_STATUS], tipo: r.type, total: money(r.total_cents),
          pagamento: PAYMENT_LABEL[r.payment_method], cliente: r.name, telefone: r.phone, motoboy: r.courier, avaliacao: r.rating, criado_em: r.created_at })));
      },
    }),

    betaZodTool({
      name: "pedidos_em_andamento",
      description: "Pedidos abertos agora (novos, na cozinha, prontos, em rota), com atrasos e motoboy atribuído.",
      inputSchema: z.object({}),
      run: async () => json(activeOrders().filter((o) => !["entregue", "cancelado"].includes(o.status)).map((o) => ({
        codigo: o.code, status: ORDER_STATUS[o.status], tipo: o.type, cliente: o.customer_name, total: money(o.total_cents), criado_em: o.created_at,
        aceito_em: o.accepted_at, eta_min: o.eta_minutes, motoboy: o.courier_name, itens: o.items.map((i: { qty: number; name: string }) => `${i.qty}× ${i.name}`),
      }))),
    }),

    betaZodTool({
      name: "clientes",
      description: `Clientes do CRM com métricas (pedidos, gasto, ticket médio, dias desde o último pedido) e segmentos. Segmentos: ${Object.keys(SEGMENTS).join(", ")}.`,
      inputSchema: z.object({
        segmento: z.enum(Object.keys(SEGMENTS) as [Segment, ...Segment[]]).optional(),
        busca: z.string().optional().describe("Nome, telefone ou tag"),
        ordenar: z.enum(["gasto", "pedidos", "recente", "sumido"]).optional(),
        limite: z.number().int().min(1).max(50).optional(),
      }),
      run: async ({ segmento = "todos", busca, ordenar = "gasto", limite = 15 }) => {
        let list = customersWithStats();
        const total = list.length;
        if (segmento !== "todos") list = list.filter((c) => c.segments.includes(segmento));
        if (busca) { const f = fold(busca); list = list.filter((c) => fold(`${c.name ?? ""} ${c.phone} ${c.tags.join(" ")}`).includes(f)); }
        list.sort((a, b) => ordenar === "pedidos" ? b.orders - a.orders : ordenar === "recente" ? (b.last_order ?? "").localeCompare(a.last_order ?? "")
          : ordenar === "sumido" ? (b.days_since ?? -1) - (a.days_since ?? -1) : b.spent - a.spent);
        return json({ total_clientes: total, encontrados: list.length, clientes: list.slice(0, limite).map((c) => ({
          nome: c.name, telefone: c.phone, pedidos: c.orders, gasto: money(c.spent), ticket_medio: money(c.avg), dias_sem_pedir: c.days_since,
          segmentos: c.segments, aceita_promo: !!c.marketing_opt_in, cashback: money(c.loyalty_cents), tags: c.tags,
        })) });
      },
    }),

    betaZodTool({
      name: "cardapio",
      description: "Produtos do cardápio com preço, promoção, estoque e se estão pausados. Filtre por texto.",
      inputSchema: z.object({ busca: z.string().optional(), somente_pausados: z.boolean().optional() }),
      run: async ({ busca, somente_pausados }) => {
        const { categories, products } = loadMenu({ includeHidden: true });
        let list = products;
        if (busca) { const f = fold(busca); list = list.filter((p) => fold(p.name).includes(f)); }
        if (somente_pausados) list = list.filter((p) => p.paused);
        return json(list.slice(0, 80).map((p) => ({ produto: p.name, categoria: categories.find((c) => c.id === p.category_id)?.name, preco: money(p.price_cents),
          promo: p.promo_price_cents != null ? money(p.promo_price_cents) : null, pausado: !!p.paused, visivel: !!p.active, estoque: p.stock,
          variacoes: p.variants.map((v) => `${v.name} ${money(v.price_cents)}`) })));
      },
    }),

    betaZodTool({
      name: "motoboys",
      description: "Situação dos motoboys: em turno, entregas em aberto e de hoje, e o acerto pendente (entregas não acertadas, valor a pagar, dinheiro em mãos, saldo).",
      inputSchema: z.object({}),
      run: async () => json(couriersOverview().map((c) => {
        const s = settlementPreview(c.id);
        return { nome: c.name, ativo: !!c.active, em_turno: !!c.on_shift, entregas_abertas: c.open_deliveries, entregas_hoje: c.today_deliveries,
          acerto_pendente: s && { entregas: s.orders.length, a_pagar: money(s.pay), dinheiro_em_maos: money(s.cash),
            saldo: s.balance >= 0 ? `motoboy devolve ${money(s.balance)}` : `loja paga ${money(-s.balance)}` } };
      })),
    }),

    betaZodTool({
      name: "caixa",
      description: "Caixa do turno atual (se aberto): vendido por forma de pagamento, sangrias/suprimentos, pago a motoboys e dinheiro esperado na gaveta. Também o status da loja (aberta/fechada).",
      inputSchema: z.object({}),
      run: async () => {
        const open = openCashSession();
        const s = open ? cashSummary(open.id) : null;
        const ops = getSetting("ops", DEFAULT_SETTINGS.ops);
        return json({
          loja: openStatus(getSetting("hours", DEFAULT_SETTINGS.hours), ops.forceClosed).label,
          caixa: s ? { aberto_em: s.session.opened_at, fundo: money(s.session.opening_cents), vendido: money(s.gross),
            por_forma: s.byMethod.map((m) => ({ forma: PAYMENT_LABEL[m.payment_method], pedidos: m.n, total: money(m.total) })),
            movimentos: s.movements.map((m) => ({ tipo: m.type, valor: money(m.amount_cents), obs: m.note })), pago_motoboys: money(s.courierPaid),
            dinheiro_esperado: money(s.expectedCash) } : "fechado",
        });
      },
    }),

    betaZodTool({
      name: "emails",
      description: "Lê os e-mails da loja guardados no painel (caixa de entrada ou enviados). Busque por texto, filtre não lidos ou abra um e-mail pelo id para ler o conteúdo.",
      inputSchema: z.object({
        pasta: z.enum(["entrada", "enviados"]).optional(),
        busca: z.string().optional(),
        nao_lidos: z.boolean().optional(),
        abrir_id: z.number().int().optional().describe("Id de um e-mail para ler o texto completo"),
      }),
      run: async ({ pasta = "entrada", busca, nao_lidos, abrir_id }) => {
        if (abrir_id) {
          const m = emailDetail(abrir_id);
          return m ? json({ id: m.id, de: `${m.from_name ?? ""} <${m.from_addr}>`, para: m.to_addrs, assunto: m.subject, data: m.date, texto: (m.text ?? "").slice(0, 6000),
            anexos: m.attachments.map((a) => a.name), cliente: m.customer?.name ?? null }) : "E-mail não encontrado.";
        }
        return json(listEmails(pasta, busca, nao_lidos).slice(0, 25).map((m) => ({ id: m.id, de: m.from_name || m.from_addr, para: m.to_addrs, assunto: m.subject,
          data: m.date, lido: !!m.seen, cliente: !!m.customer_id, trecho: m.preview })));
      },
    }),

    betaZodTool({
      name: "consulta_sql",
      description: `Consulta SQL SOMENTE LEITURA para perguntas que as outras ferramentas não cobrem. Uma única instrução SELECT/WITH; até 200 linhas.\n${SCHEMA_DOC}`,
      inputSchema: z.object({ sql: z.string().describe("Uma consulta SELECT"), objetivo: z.string().describe("O que esta consulta responde, em uma frase") }),
      run: async ({ sql }) => json(safeSelect(sql)),
    }),

    betaZodTool({
      name: "preparar_impressao",
      description: "Monta um documento para a equipe imprimir (aparece com um botão Imprimir no chat). Use 'a4' para relatórios e listas; 'termica_80mm' para cupom curto na impressora térmica. Valores já formatados em R$.",
      inputSchema: z.object({
        titulo: z.string(),
        subtitulo: z.string().optional().describe("Ex.: período, data de emissão"),
        formato: z.enum(["a4", "termica_80mm"]),
        blocos: z.array(z.discriminatedUnion("tipo", [
          z.object({ tipo: z.literal("texto"), texto: z.string() }),
          z.object({ tipo: z.literal("destaques"), itens: z.array(z.object({ rotulo: z.string(), valor: z.string() })) }),
          z.object({ tipo: z.literal("tabela"), colunas: z.array(z.string()), linhas: z.array(z.array(z.string())), total: z.array(z.string()).optional() }),
        ])).min(1),
      }),
      run: async (doc) => {
        prints.push({ kind: "documento", ...doc });
        return "Documento pronto. O usuário verá um botão para imprimir; não repita o conteúdo inteiro na resposta.";
      },
    }),

    betaZodTool({
      name: "imprimir_comanda",
      description: "Prepara a comanda (cupom de cozinha/entrega 80 mm) de um pedido pelo código, para imprimir ou reimprimir.",
      inputSchema: z.object({ codigo: z.string() }),
      run: async ({ codigo }) => {
        const o = orderDetail("code", codigo.replace(/\D/g, ""));
        if (!o) return `Pedido #${codigo} não encontrado.`;
        prints.push({ kind: "comanda", order: o });
        return `Comanda do pedido #${o.code} pronta para imprimir (${o.items.length} itens, ${money(o.total_cents)}).`;
      },
    }),
  ];
}

const SYSTEM = `Você é o assistente de gestão do Raijin Sushi (Ivoti/RS), dentro do painel da equipe.
Responda em português do Brasil, direto e com números concretos. A equipe usa no balcão, então seja breve: comece pela resposta, depois os detalhes que importam.

Como trabalhar:
- Use as ferramentas para buscar os dados reais antes de responder; nunca invente números. Se a ferramenta específica não cobre a pergunta, use consulta_sql.
- Valores vêm em centavos no banco; mostre sempre em R$ (ex.: R$ 1.234,50). Horários: fuso de Ivoti (UTC-3).
- Quando fizer comparação (semana vs semana anterior, dia vs dia), diga a variação em % e em R$.
- Se a pergunta for ambígua quanto ao período, assuma o mais provável (ex.: "essa semana" = últimos 7 dias) e diga o que assumiu.
- Para pedidos de impressão ("imprime", "quero imprimir", "gera um relatório pra imprimir"), monte o documento com preparar_impressao ou imprimir_comanda e responda com uma frase curta dizendo o que foi preparado.
- Você só lê dados. Se pedirem para alterar algo (preço, status, cadastro), explique onde fazer isso no painel.
- Dados de clientes são pessoais (LGPD): mostre só o necessário para a pergunta.
- Formatação: parágrafos curtos, listas com "-" e tabelas em markdown simples quando ajudar. Sem títulos grandes.`;

export class AiNotConfigured extends Error {}

export async function askAssistant(history: ChatTurn[]) {
  const prints: PrintDoc[] = [];
  const toolsUsed: string[] = [];
  const store = getSetting("store", DEFAULT_SETTINGS.store);
  const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "short" });

  // Contexto volátil (data/hora) vai na última mensagem do usuário, para não invalidar o cache do prompt de sistema.
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((t, i) =>
    i === history.length - 1 && t.role === "user"
      ? { role: "user", content: `[${now} · ${store.name}]\n${t.content}` }
      : { role: t.role, content: t.content });

  let client: Anthropic;
  try { client = new Anthropic(); } catch { throw new AiNotConfigured(); }

  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    max_iterations: 12,
    system: SYSTEM,
    cache_control: { type: "ephemeral" },
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    tools: buildTools(prints).map((t) => {
      const run = t.run;
      return { ...t, run: (input: never, ctx?: never) => { toolsUsed.push(t.name); return run(input, ctx); } };
    }),
    messages,
  });

  let final: Anthropic.Beta.BetaMessage;
  try {
    final = await runner;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || /api ?key|authentication|credentials/i.test((e as Error).message)) throw new AiNotConfigured();
    throw e;
  }

  const text = final.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
  const reply = final.stop_reason === "refusal"
    ? "Não consegui responder a esse pedido. Tenta reformular a pergunta."
    : final.stop_reason === "max_tokens" ? `${text}\n\n(resposta cortada por tamanho — peça um recorte menor)`
      : text || (prints.length ? "Pronto, preparei para impressão." : "Não encontrei uma resposta.");

  // métrica simples de uso, útil para acompanhar custo
  const usage = final.usage;
  return { reply, prints, toolsUsed: [...new Set(toolsUsed)], usage: { input: usage.input_tokens, output: usage.output_tokens, cache_read: usage.cache_read_input_tokens ?? 0 } };
}

/** Sugestões exibidas no chat */
export const SUGGESTIONS = [
  "Como foram as vendas dos últimos 7 dias comparado com a semana anterior?",
  "Quais clientes VIP estão há mais tempo sem pedir?",
  "Qual o item mais vendido nas sextas-feiras?",
  "Imprime o relatório de vendas de hoje",
  "Imprime a comanda do último pedido",
  "Quanto cada motoboy tem para acertar?",
];

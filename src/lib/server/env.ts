import "server-only";
import path from "node:path";

/**
 * Modo demonstração: liga sozinho na Vercel (ou com DEMO_MODE=1).
 * - banco em disco temporário, recriado com dados de exemplo a cada "cold start";
 * - botões de entrar como demonstração; código do WhatsApp aparece na tela;
 * - Pix e mensagens podem ser simulados.
 * Para produção de verdade: DEMO_MODE=0 + banco persistente (ver README).
 */
export const isDemo = () => process.env.DEMO_MODE === "1" || (process.env.DEMO_MODE !== "0" && !!process.env.VERCEL);

/** Produção "real": exige segredos e esconde ferramentas de simulação. */
export const isStrictProd = () => process.env.NODE_ENV === "production" && !isDemo();

/** Pasta de dados (banco + uploads). Na Vercel só /tmp é gravável. */
export const dataDir = () =>
  process.env.DATA_DIR ||
  (process.env.DATABASE_PATH ? path.dirname(process.env.DATABASE_PATH) : process.env.VERCEL ? "/tmp/raijin" : path.join(process.cwd(), "data"));

export const dbPath = () => process.env.DATABASE_PATH || path.join(dataDir(), "raijin.db");

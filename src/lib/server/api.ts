import "server-only";
import { connection } from "next/server";
import { ZodError, type ZodType } from "zod";
import { HttpError } from "./session";

type Ctx<P> = { params: Promise<P> };

/** Envolve um Route Handler: garante execução em tempo de requisição e padroniza erros em JSON. */
export function api<P = Record<string, string>>(fn: (req: Request, ctx: Ctx<P>) => Promise<unknown> | unknown) {
  return async (req: Request, ctx: Ctx<P>) => {
    await connection();
    try {
      const out = await fn(req, ctx);
      return out instanceof Response ? out : Response.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError) return Response.json({ error: e.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
      console.error(e);
      return Response.json({ error: "Erro interno" }, { status: 500 });
    }
  };
}

export async function body<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const json = await req.json().catch(() => ({}));
  return schema.parse(json);
}

export const idParam = async (ctx: { params: Promise<{ id: string }> }) => {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) throw new HttpError(400, "ID inválido");
  return id;
};

import "server-only";

// params tipado como never: cada rota declara o formato dos seus próprios params
type Handler = (req: Request, ctx: { params: Promise<never> }) => Promise<Response> | Response;
export type RouteModule = Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", Handler>>;

/** Encontra a rota pelo caminho ("admin/orders/{id}") e chama o handler com os params. */
export async function dispatch(routes: [string, RouteModule][], method: string, req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const parts = ((await ctx.params).path ?? []).map(decodeURIComponent);
  for (const [pattern, mod] of routes) {
    const segs = pattern ? pattern.split("/") : [];
    if (segs.length !== parts.length) continue;
    const params: Record<string, string> = {};
    if (!segs.every((s, i) => (s.startsWith("{") ? ((params[s.slice(1, -1)] = parts[i]), true) : s === parts[i]))) continue;
    const fn = mod[method as keyof RouteModule];
    if (!fn) return Response.json({ error: "Método não permitido" }, { status: 405 });
    return fn(req, { params: Promise.resolve(params) as Promise<never> });
  }
  return Response.json({ error: "Rota não encontrada" }, { status: 404 });
}

#!/usr/bin/env python3
"""Gera src/app/api/[...path]/route.ts a partir de src/server-routes/**/route.ts.
Rode depois de criar ou remover uma rota: python3 scripts/gen-api-router.py"""
import os
base = "src/server-routes"
routes = [([] if (r := os.path.relpath(root, base)) == "." else r.split(os.sep)) for root, _, files in os.walk(base) if "route.ts" in files]
routes.sort(key=lambda s: (len(s), [1 if x.startswith("[") else 0 for x in s]))  # estáticas antes de dinâmicas
imports = [f'import * as r{i} from "@/server-routes/{"/".join(s)}/route";' for i, s in enumerate(routes)]
table = [f'  ["{"/".join("{" + x[1:-1] + "}" if x.startswith("[") else x for x in s)}", r{i}],' for i, s in enumerate(routes)]
code = """// GERADO por scripts/gen-api-router.py — não editar à mão.
// Todas as rotas da API passam por esta única função (na Vercel = uma só instância,
// então loja, painel e motoboy enxergam o mesmo banco no modo demonstração).
import { dispatch, type RouteModule } from "@/lib/server/router";
""" + "\n".join(imports) + """

const ROUTES: [string, RouteModule][] = [
""" + "\n".join(table) + """
];

type Ctx = { params: Promise<{ path?: string[] }> };
const handle = (method: string) => (req: Request, ctx: Ctx) => dispatch(ROUTES, method, req, ctx);
export const GET = handle("GET");
export const POST = handle("POST");
export const PUT = handle("PUT");
export const PATCH = handle("PATCH");
export const DELETE = handle("DELETE");
"""
os.makedirs("src/app/api/[...path]", exist_ok=True)
open("src/app/api/[...path]/route.ts", "w").write(code)
print(f"{len(routes)} rotas")

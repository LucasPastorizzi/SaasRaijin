// GERADO por scripts/gen-api-router.py — não editar à mão.
// Todas as rotas da API passam por esta única função (na Vercel = uma só instância,
// então loja, painel e motoboy enxergam o mesmo banco no modo demonstração).
import { dispatch, type RouteModule } from "@/lib/server/router";
import * as r0 from "@/server-routes/quote/route";
import * as r1 from "@/server-routes/me/route";
import * as r2 from "@/server-routes/menu/route";
import * as r3 from "@/server-routes/orders/route";
import * as r4 from "@/server-routes/courier/me/route";
import * as r5 from "@/server-routes/courier/session/route";
import * as r6 from "@/server-routes/auth/otp/route";
import * as r7 from "@/server-routes/admin/customers/route";
import * as r8 from "@/server-routes/admin/settings/route";
import * as r9 from "@/server-routes/admin/products/route";
import * as r10 from "@/server-routes/admin/couriers/route";
import * as r11 from "@/server-routes/admin/option-groups/route";
import * as r12 from "@/server-routes/admin/cash/route";
import * as r13 from "@/server-routes/admin/coupons/route";
import * as r14 from "@/server-routes/admin/ai/route";
import * as r15 from "@/server-routes/admin/menu/route";
import * as r16 from "@/server-routes/admin/orders/route";
import * as r17 from "@/server-routes/admin/categories/route";
import * as r18 from "@/server-routes/admin/email/route";
import * as r19 from "@/server-routes/admin/upload/route";
import * as r20 from "@/server-routes/admin/wa/route";
import * as r21 from "@/server-routes/admin/reports/route";
import * as r22 from "@/server-routes/staff/session/route";
import * as r23 from "@/server-routes/whatsapp/webhook/route";
import * as r24 from "@/server-routes/files/[name]/route";
import * as r25 from "@/server-routes/orders/[code]/route";
import * as r26 from "@/server-routes/admin/customers/broadcast/route";
import * as r27 from "@/server-routes/admin/products/bulk/route";
import * as r28 from "@/server-routes/admin/email/simulate/route";
import * as r29 from "@/server-routes/admin/wa/simulate/route";
import * as r30 from "@/server-routes/courier/orders/[id]/route";
import * as r31 from "@/server-routes/admin/customers/[id]/route";
import * as r32 from "@/server-routes/admin/products/[id]/route";
import * as r33 from "@/server-routes/admin/couriers/[id]/route";
import * as r34 from "@/server-routes/admin/option-groups/[id]/route";
import * as r35 from "@/server-routes/admin/coupons/[id]/route";
import * as r36 from "@/server-routes/admin/orders/[id]/route";
import * as r37 from "@/server-routes/admin/categories/[id]/route";
import * as r38 from "@/server-routes/admin/email/[id]/route";
import * as r39 from "@/server-routes/admin/wa/[id]/route";
import * as r40 from "@/server-routes/admin/couriers/[id]/settlement/route";

const ROUTES: [string, RouteModule][] = [
  ["quote", r0],
  ["me", r1],
  ["menu", r2],
  ["orders", r3],
  ["courier/me", r4],
  ["courier/session", r5],
  ["auth/otp", r6],
  ["admin/customers", r7],
  ["admin/settings", r8],
  ["admin/products", r9],
  ["admin/couriers", r10],
  ["admin/option-groups", r11],
  ["admin/cash", r12],
  ["admin/coupons", r13],
  ["admin/ai", r14],
  ["admin/menu", r15],
  ["admin/orders", r16],
  ["admin/categories", r17],
  ["admin/email", r18],
  ["admin/upload", r19],
  ["admin/wa", r20],
  ["admin/reports", r21],
  ["staff/session", r22],
  ["whatsapp/webhook", r23],
  ["files/{name}", r24],
  ["orders/{code}", r25],
  ["admin/customers/broadcast", r26],
  ["admin/products/bulk", r27],
  ["admin/email/simulate", r28],
  ["admin/wa/simulate", r29],
  ["courier/orders/{id}", r30],
  ["admin/customers/{id}", r31],
  ["admin/products/{id}", r32],
  ["admin/couriers/{id}", r33],
  ["admin/option-groups/{id}", r34],
  ["admin/coupons/{id}", r35],
  ["admin/orders/{id}", r36],
  ["admin/categories/{id}", r37],
  ["admin/email/{id}", r38],
  ["admin/wa/{id}", r39],
  ["admin/couriers/{id}/settlement", r40],
];

type Ctx = { params: Promise<{ path?: string[] }> };
const handle = (method: string) => (req: Request, ctx: Ctx) => dispatch(ROUTES, method, req, ctx);
export const GET = handle("GET");
export const POST = handle("POST");
export const PUT = handle("PUT");
export const PATCH = handle("PATCH");
export const DELETE = handle("DELETE");

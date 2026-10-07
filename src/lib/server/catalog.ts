import "server-only";
import { z } from "zod";
import { run } from "./db";

export const productSchema = z.object({
  category_id: z.number().int(),
  name: z.string().min(2, "Nome do produto"),
  description: z.string().max(600).default(""),
  price_cents: z.number().int().min(0, "Preço inválido"),
  promo_price_cents: z.number().int().min(0).nullable().optional(),
  promo_until: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  pieces: z.number().int().nullable().optional(),
  prep_minutes: z.number().int().nullable().optional(),
  sku: z.string().nullable().optional(),
  stock: z.number().int().nullable().optional(),
  active: z.boolean().default(true),
  paused: z.boolean().default(false),
  variants: z.array(z.object({ name: z.string().min(1), price_cents: z.number().int().min(0) })).default([]),
  groupIds: z.array(z.number().int()).default([]),
});

// PATCH: todos os campos opcionais e SEM defaults (para não apagar variações/adicionais sem querer)
export const productPatch = z.object({
  category_id: z.number().int(), name: z.string().min(2), description: z.string().max(600), price_cents: z.number().int().min(0),
  promo_price_cents: z.number().int().min(0).nullable(), promo_until: z.string().nullable(), image: z.string().nullable(),
  tags: z.array(z.string()), pieces: z.number().int().nullable(), prep_minutes: z.number().int().nullable(), sku: z.string().nullable(),
  stock: z.number().int().nullable(), active: z.boolean(), paused: z.boolean(),
  variants: z.array(z.object({ name: z.string().min(1), price_cents: z.number().int().min(0) })), groupIds: z.array(z.number().int()),
}).partial();

export function saveRelations(id: number, p: { variants?: { name: string; price_cents: number }[]; groupIds?: number[] }) {
  if (p.variants) {
    run("DELETE FROM product_variants WHERE product_id = ?", id);
    p.variants.forEach((v, i) => run("INSERT INTO product_variants (product_id, name, price_cents, sort) VALUES (?, ?, ?, ?)", id, v.name, v.price_cents, i));
  }
  if (p.groupIds) {
    run("DELETE FROM product_option_groups WHERE product_id = ?", id);
    p.groupIds.forEach((g, i) => run("INSERT INTO product_option_groups (product_id, group_id, sort) VALUES (?, ?, ?)", id, g, i));
  }
}

export const groupSchema = z.object({
  name: z.string().min(2, "Nome do grupo"),
  min: z.number().int().min(0),
  max: z.number().int().min(1),
  options: z.array(z.object({ id: z.number().int().optional(), name: z.string().min(1), price_cents: z.number().int().min(0), paused: z.boolean().default(false) })).min(1, "Adicione ao menos uma opção"),
}).refine((g) => g.max >= g.min, "Máximo precisa ser maior ou igual ao mínimo");

export function saveOptions(groupId: number, options: z.infer<typeof groupSchema>["options"]) {
  const keep = options.filter((o) => o.id).map((o) => o.id);
  run(`DELETE FROM options WHERE group_id = ?${keep.length ? ` AND id NOT IN (${keep.join(",")})` : ""}`, groupId);
  options.forEach((o, i) => {
    if (o.id) run("UPDATE options SET name = ?, price_cents = ?, paused = ?, sort = ? WHERE id = ? AND group_id = ?", o.name, o.price_cents, o.paused ? 1 : 0, i, o.id, groupId);
    else run("INSERT INTO options (group_id, name, price_cents, paused, sort) VALUES (?, ?, ?, ?, ?)", groupId, o.name, o.price_cents, o.paused ? 1 : 0, i);
  });
}


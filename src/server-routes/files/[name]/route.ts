import fs from "node:fs/promises";
import path from "node:path";
import { connection } from "next/server";
import { dataDir } from "@/lib/server/env";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

// Serve as fotos enviadas pelo painel (guardadas junto com o banco).
export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  await connection();
  const name = (await ctx.params).name;
  if (!/^[\w-]+\.(jpg|png|webp)$/.test(name)) return new Response("not found", { status: 404 });
  try {
    const buf = await fs.readFile(/*turbopackIgnore: true*/ path.join(dataDir(), "uploads", name));
    return new Response(new Uint8Array(buf), { headers: { "Content-Type": TYPES[name.split(".").pop()!], "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}

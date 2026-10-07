import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { api } from "@/lib/server/api";
import { HttpError, requireStaff } from "@/lib/server/session";
import { dataDir } from "@/lib/server/env";

// Upload de foto de produto: salva na pasta de dados e é servido por /api/files/<nome>.
// Produção com várias instâncias: trocar por Supabase Storage / S3 / Vercel Blob — ver README.
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export const POST = api(async (req) => {
  await requireStaff("gerente");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Envie uma imagem");
  const ext = TYPES[file.type];
  if (!ext) throw new HttpError(400, "Use JPG, PNG ou WebP");
  if (file.size > 4 * 1024 * 1024) throw new HttpError(400, "Imagem até 4 MB");
  const dir = path.join(dataDir(), "uploads");
  await fs.mkdir(/*turbopackIgnore: true*/ dir, { recursive: true });
  const name = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
  await fs.writeFile(/*turbopackIgnore: true*/ path.join(dir, name), Buffer.from(await file.arrayBuffer()));
  return { url: `/api/files/${name}` };
});

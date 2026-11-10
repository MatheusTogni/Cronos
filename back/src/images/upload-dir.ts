import { mkdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

/** Pasta das imagens enviadas pelo mestre (UPLOAD_DIR no .env; padrão ./uploads). Lida sob demanda. */
export const uploadDir = () => resolve(process.env.UPLOAD_DIR || 'uploads');

export function ensureUploadDir() {
  const dir = uploadDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** `basename` impede que um nome vindo do banco escape da pasta. */
export const uploadPath = (filename: string) =>
  join(uploadDir(), basename(filename));

/** URL pública da imagem (servida pelo Nest em /api/uploads; em produção pode ser o nginx). */
export const uploadUrl = (filename: string) =>
  `/api/uploads/${basename(filename)}`;

import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mime from 'mime-types';

export function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function ensureDir(p) {
  return fs.mkdir(p, { recursive: true });
}

export function safeJson(obj) {
  return JSON.stringify(obj, null, 2);
}

export function isProbablyApi(contentType, url, method, status) {
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('application/json')) return true;
  if (ct.includes('text/json')) return true;
  if (ct.includes('text/plain')) return true; // многие бэки отдают json с text/plain
  if (/(?:^|\W)(api|graphql|rpc|ajax)(?:\W|$)/i.test(url)) return true;
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') return true;
  if (status >= 400 && status < 600) return true; // ошибки бэка полезны для моков
  return false;
}

export function pickExt(url, contentType, defaultExt = 'bin') {
  // 1) по content-type
  if (contentType) {
    const ext = mime.extension(contentType.split(';')[0].trim());
    if (ext) return ext;
  }
  // 2) по URL
  try {
    const u = new URL(url);
    const base = path.basename(u.pathname);
    const idx = base.lastIndexOf('.');
    if (idx > 0 && idx < base.length - 1) {
      const ext = base.slice(idx + 1).split('?')[0].split('#')[0];
      if (/^[a-z0-9]{1,6}$/i.test(ext)) return ext.toLowerCase();
    }
  } catch {}
  // 3) угадайка по подстрокам
  if (/wasm/i.test(url)) return 'wasm';
  if (/font/i.test(url)) return 'woff2';
  return defaultExt;
}

export async function writeFileIfChanged(filepath, buf) {
  try {
    const existing = await fs.readFile(filepath);
    if (Buffer.compare(existing, buf) === 0) return;
  } catch {}
  await fs.writeFile(filepath, buf);
}

export function nowTs() {
  return new Date().toISOString();
}

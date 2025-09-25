// src/capture/util.mjs
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const nowTs = () => new Date().toISOString();

export async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true }).catch(()=>{});
}

export function safeJson(x){ return JSON.stringify(x, null, 2); }

export function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export async function writeFileIfChanged(filePath, buf){
  try {
    const cur = await fs.readFile(filePath);
    if (cur.length === buf.length) return; // дешёвая проверка; при надобности сравнивать sha
  } catch {}
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, buf);
}

// Более умная эвристика «это API, а не статический ассет»
export function isProbablyApi(contentType, url, method, status){
  const m = String(method||'GET').toUpperCase();
  const ct = String(contentType||'').toLowerCase();
  const u = new URL(url);

  // 1) Любой state-changing/логирующий запрос
  if (m !== 'GET') return true;              // POST/PUT/PATCH/DELETE → API
  if (status === 204 && m !== 'GET') return true;

  // 2) JSON не всегда API — отфильтруем очевидные ассеты
  const pathname = u.pathname.toLowerCase();
  const isStaticJson = pathname.endsWith('.json') && (
    pathname.includes('/assets/') || pathname.includes('/renderer/') ||
    pathname.includes('/build/')  || pathname.includes('/manifest') ||
    pathname.includes('/locale/') || pathname.includes('/preload/')
  );
  if (isStaticJson) return false;

  // 3) Характерные API-маркеры
  const apiMarkers = [
    '/api/', '/v1/', '/v2/', '/token', '/connect', '/interact', '/collect', '/rum',
    '/ee/', '/identity/', '/config', '/configuration', '/gameapi'
  ];
  if (apiMarkers.some(mk => pathname.includes(mk))) return true;

  // 4) По content-type
  if (ct.includes('application/json') || ct.includes('text/plain')) return true;

  return false;
}

export function pickExt(url, contentType){
  const ct = String(contentType||'').split(';')[0].trim().toLowerCase();
  if (ct === 'application/json') return 'json';
  if (ct === 'text/javascript' || ct === 'application/javascript') return 'js';
  if (ct === 'text/css') return 'css';
  if (ct.startsWith('image/')) return ct.slice(6).replace('jpeg','jpg');
  if (ct.startsWith('audio/')) return ct.slice(6);
  if (ct.startsWith('video/')) return ct.slice(6);
  if (ct.includes('font') || ct === 'font/woff2') return 'woff2';

  // по URL
  const m = /[?#]/.test(url) ? url.split(/[?#]/)[0] : url;
  const dot = m.lastIndexOf('.');
  if (dot > -1 && dot > m.lastIndexOf('/')) return m.slice(dot+1).toLowerCase();
  return 'bin';
}
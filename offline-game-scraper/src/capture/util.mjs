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

// ===== нормализация URL (точная и «loose») =====
export function normUrl(u){
  try{
    const x=new URL(u); x.hash='';
    const pairs=[...x.searchParams.entries()].sort(([a],[b])=>a.localeCompare(b));
    x.search=''; for(const [k,v] of pairs) x.searchParams.append(k,v);
    return x.toString();
  }catch{ return u; }
}

const VOLATILE = new Set(['token','auth','_','v','ver','verid','cb','cache','t','ts','timestamp']);
export function normUrlLoose(u){
  try{
    const x=new URL(u); x.hash='';
    const pairs=[...x.searchParams.entries()]
      .filter(([k])=>!VOLATILE.has(k.toLowerCase()))
      .sort(([a],[b])=>a.localeCompare(b));
    x.search=''; for(const [k,v] of pairs) x.searchParams.append(k,v);
    return x.toString();
  }catch{ return u; }
}

// ===== ассет/апи эвристики =====
export function isStaticJsonPath(p){
  const s = p.toLowerCase();
  return s.endsWith('.json') && (
    s.includes('/assets/')   || s.includes('/renderer/') ||
    s.includes('/build/')    || s.includes('/manifest')  ||
    s.includes('/locale/')   || s.includes('/preload/')  ||
    s.includes('/package.json')
  );
}

export function isProbablyApi(contentType, url, method, status){
  const m = String(method||'GET').toUpperCase();
  const ct = String(contentType||'').toLowerCase();
  const { pathname, hostname } = new URL(url);

  // все state-changing
  if (m !== 'GET') return true;
  if (status === 204 && m !== 'GET') return true;

  // явные API-маркеры
  const ap = pathname.toLowerCase();
  const hasMarker = ['/api/','/v1/','/v2/','/graphql','/connect','/token','/interact','/collect','/gameapi','/configuration']
    .some(k => ap.includes(k));

  if (hasMarker) {
    // но если это статический JSON ассет — не API
    if (isStaticJsonPath(pathname)) return false;
    return true;
  }

  // content-type
  if (ct.includes('application/json') || ct.includes('text/plain')) {
    // JSON-ассеты (конфиги, layout) — не API
    if (isStaticJsonPath(pathname)) return false;
    // JSON с «сторонних» доменов (не CDN) — часто API
    if (!/^(static|cdn|assets?)\./i.test(hostname)) return true;
  }

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
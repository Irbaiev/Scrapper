#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import http from 'node:http';
import { normUrl, normUrlLoose, isStaticJsonPath } from '../src/capture/util.mjs';

function parseArgs(argv){ const a={}; for(let i=2;i<argv.length;i++){ const t=argv[i]; if(t.startsWith('--')){ const k=t.slice(2); const v=(i+1<argv.length && !argv[i+1].startsWith('--'))? argv[++i]: true; a[k]=v; } } return a; }
const safeJson = (x)=> JSON.stringify(x, null, 2);
const shortHash = (s)=> crypto.createHash('sha1').update(String(s)).digest('hex').slice(0,8);
const fetchNode = (url, {referer}={}) => new Promise((res, rej) => {
  const mod = url.startsWith('https:') ? https : http;
  const req = mod.get(url, {
    rejectUnauthorized: false,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      ...(referer ? { Referer: referer } : {})
    }
  }, r => {
    const chunks=[]; r.on('data',c=>chunks.push(c));
    r.on('end',()=>res({status:r.statusCode||0, headers:r.headers, body:Buffer.concat(chunks)}));
  });
  req.on('error', rej);
});
const mirrorRelFor = (uStr)=>{ const u=new URL(uStr); let p=u.pathname; if(p.endsWith('/')) p+='index.html'; if(u.search){ const tag='.__q_'+shortHash(u.search); const dot=p.lastIndexOf('.'); p=(dot>-1&&dot>=p.lastIndexOf('/'))? (p.slice(0,dot)+tag+p.slice(dot)) : (p+tag); } return path.posix.join('mirror', u.hostname, p.replace(/^\//,'')); };

async function copyEnsure(src, dst){ await fs.mkdir(path.dirname(dst), {recursive:true}); await fs.copyFile(src, dst); }

async function main(){
  const args = parseArgs(process.argv);
  const capDir = path.resolve(String(args.capture||''));
  const outDir = path.resolve(String(args.out||path.join('dist','build')));
  const doRewrite = true; // всегда делаем rewrite
  const doPrefetch = true; // всегда докачиваем внешние

  const manifest = JSON.parse(await fs.readFile(path.join(capDir,'manifest.json'),'utf8'));
  await fs.mkdir(outDir, { recursive: true });

  const assetsOut = path.join(outDir,'assets');
  const mocksApiOut = path.join(outDir,'mocks','api');
  const mocksWsOut  = path.join(outDir,'mocks','ws');
  await fs.mkdir(assetsOut,{recursive:true});
  await fs.mkdir(mocksApiOut,{recursive:true});
  await fs.mkdir(mocksWsOut,{recursive:true});
  await fs.mkdir(path.join(outDir,'mirror'),{recursive:true});
  await fs.mkdir(path.join(outDir,'runtime'),{recursive:true});

  // -------- 1) ассеты
  // формируем ASSET_MAP только с реальными именами файлов и без дублей
  const seenAssets = new Set();
  const assetMap = {}; // abs-normalized -> relative 'assets/<hash>.<ext>'

  for (const [abs, meta] of Object.entries(manifest.assets||{})) {
    const absNorm = normUrl(abs);
    const src = path.join(capDir, meta.path); // storage/assets/<hash>.<ext>
    const rel = path.posix.join('assets', path.basename(meta.path)); // без переименования!
    if (!seenAssets.has(rel)) {
      await copyEnsure(src, path.join(outDir, rel));
      seenAssets.add(rel);
    }
    assetMap[absNorm] = rel;
  }

  // -------- 2) строим полный список внешних URL (HTML, CSS, inline, loadScript, srcset, poster, xlink:href)
  const mirrorMap = {};
  const extUrls = new Set();

  // главный HTML
  const htmlMeta = manifest.assets[manifest.url];
  let html = await fs.readFile(path.join(capDir, htmlMeta.path), 'utf8');

  // HTML src/href
  html.replace(/(?:src|href)=["'`](https?:\/\/[^"'`]+)["'`]/gi, (_,u)=>{ extUrls.add(u); return _; });

  // loadScript("…")
  html.replace(/loadScript\((["'`])(https?:\/\/[^"'`]+)\1/gi, (_,q,u)=>{ extUrls.add(u); return _; });

  // srcset (несколько URL)
  html.replace(/\s+srcset=(["'])([^"']+)\1/gi, (_,q,val)=>{
    val.split(',').forEach(part=>{
      const u = part.trim().split(/\s+/)[0];
      if(/^https?:\/\//i.test(u)) extUrls.add(u);
    });
    return _;
  });

  // inline style url(...)
  html.replace(/url\((['"]?)(https?:\/\/[^'")]+)\1\)/gi, (_,q,u)=>{ extUrls.add(u); return _; });

  // xlink:href/use href/poster/source
  html.replace(/\s+(?:xlink:href|href|poster|data-src|src)=["'`](https?:\/\/[^"'`]+)["'`]/gi, (_,u)=>{ extUrls.add(u); return _; });

  // CSS files: url(...)
  for (const [abs, meta] of Object.entries(manifest.assets||{})){
    if (!/\.css$/i.test(meta.path)) continue;
    try{
      const css = await fs.readFile(path.join(capDir, meta.path), 'utf8');
      let m; const re=/url\((['"]?)(https?:\/\/[^'")]+)\1\)/gi;
      while((m=re.exec(css))) extUrls.add(m[2]);
    }catch{}
  }

  // prefetch внешки с реферером страницы, заполнение mirrorIndex.json
  for (const u of extUrls) {
    const r = await fetchNode(u, { referer: manifest.url }).catch(()=>null);
    if (r && r.status>=200 && r.status<400) {
      const rel = mirrorRelFor(u);
      await fs.mkdir(path.join(outDir, path.dirname(rel)), { recursive: true });
      await fs.writeFile(path.join(outDir, rel), r.body);
      mirrorMap[normUrl(u)] = rel; // относительный путь
    }
  }

  // -------- 3) API map (из manifest.api)
  const apiMap = [];
  for (const e of (manifest.api||[])) {
    const src = path.join(capDir, e.file);
    const base = path.basename(e.file);
    await copyEnsure(src, path.join(outDir,'mocks','api', base));
    const rec = JSON.parse(await fs.readFile(path.join(outDir,'mocks','api',base),'utf8'));
    apiMap.push({
      method: (rec.request?.method||e.method||'GET').toUpperCase(),
      url: e.urlNorm || normUrl(e.url),
      file: `mocks/api/${base}`,
      contentType: rec.response?.contentType || rec.response?.headers?.['content-type'] || 'application/json'
    });
  }

  // auto-promote: если apiMap пуст — поднимем «подозрительные» JSON из ассетов
  if (apiMap.length===0) {
    for (const [abs, meta] of Object.entries(manifest.assets||{})) {
      const { pathname, hostname } = new URL(abs);
      if (!/\.json(\?|$)/i.test(pathname)) continue;
      if (/^(static|cdn|assets?)\./i.test(hostname)) continue;   // вероятно CDN
      if (isStaticJsonPath(pathname)) continue;                   // явный ассет-JSON

      // превратим в GET-мок
      const body = await fs.readFile(path.join(capDir, meta.path));
      const rec = {
        time: new Date().toISOString(),
        request:  { method:'GET', url: abs, headers:{} },
        response: { status:200, headers:{'content-type':'application/json'}, bodyB64: body.toString('base64') }
      };
      const base = `${Date.now()}_${Math.random().toString(36).slice(2)}.json`;
      await fs.writeFile(path.join(outDir,'mocks','api', base), JSON.stringify(rec,null,2));
      apiMap.push({ method:'GET', url: normUrl(abs), file:`mocks/api/${base}`, contentType:'application/json' });
    }
  }
  await fs.writeFile(path.join(outDir,'mocks','apiMap.json'), JSON.stringify(apiMap,null,2));

  // WS map
  const wsMap = [];
  for (const e of (manifest.ws||[])) {
    const base = path.basename(e.file);
    await copyEnsure(path.join(capDir, e.file), path.join(outDir,'mocks','ws', base));
    wsMap.push({ url: normUrl(e.url), file: `mocks/ws/${base}` });
  }
  await fs.writeFile(path.join(outDir,'mocks','wsMap.json'), JSON.stringify(wsMap,null,2));

  // -------- 4) Зеркало
  await fs.writeFile(path.join(outDir,'mirrorIndex.json'), safeJson(mirrorMap));

  // -------- 5) SW (работает из ЛЮБОЙ подпапки)
  const sw = `/* auto-gen */
const ASSET_MAP = ${JSON.stringify(assetMap)};
const API_MAP_PATH = 'mocks/apiMap.json';
const BASE = new URL(self.registration.scope).pathname.replace(/[^/]+$/, '');
const ASSETS_CACHE = 'offline-assets-v3';

// нормализации
const VOLATILE = new Set(['token','auth','_','v','ver','verid','cb','cache','t','ts','timestamp']);
function norm(u){ try{ const x=new URL(u); x.hash=''; const a=[...x.searchParams.entries()].sort(([p],[q])=>p.localeCompare(q)); x.search=''; for(const [k,v] of a) x.searchParams.append(k,v); return x.toString(); }catch{return u} }
function normLoose(u){ try{ const x=new URL(u); x.hash=''; const a=[...x.searchParams.entries()].filter(([k])=>!VOLATILE.has(k.toLowerCase())).sort(([p],[q])=>p.localeCompare(q)); x.search=''; for(const [k,v] of a) x.searchParams.append(k,v); return x.toString(); }catch{return u} }

// кэшируем БЕЗ дублей
self.addEventListener('install', e=>{
  e.waitUntil((async()=>{
    const cache=await caches.open(ASSETS_CACHE);
    const uniq = Array.from(new Set(Object.values(ASSET_MAP))).map(p=> BASE+p);
    for (const u of uniq) { try{ await cache.add(u); } catch{} }
  })());
  self.skipWaiting();
});

self.addEventListener('activate', e=> e.waitUntil(self.clients.claim()));

// helpers
const text200=(t,ctype='application/javascript')=> new Response(t,{status:200,headers:{'content-type':ctype}});
function cors204(origin='*'){ return new Response(null,{status:204,headers:{
  'access-control-allow-origin': origin,
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': '*,content-type,authorization',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
}});}

let API_MAP=null; async function getApi(){ if(API_MAP) return API_MAP; try{ const r=await fetch(BASE+API_MAP_PATH); API_MAP=await r.json(); }catch{ API_MAP=[]; } return API_MAP; }

self.addEventListener('fetch', (event)=>{
  const req=event.request, url=req.url, u=new URL(url);
  if (u.protocol==='chrome-extension:' || u.protocol==='devtools:') return;

  event.respondWith((async()=>{
    // preflight
    if (req.method==='OPTIONS') return cors204(req.headers.get('origin')||'*');

    // аналитика → заглушка (GET/POST)
    if (u.hostname==='www.googletagmanager.com' || u.hostname==='static.cloudflareinsights.com' ||
        u.hostname==='region1.analytics.google.com' || u.hostname==='stats.g.doubleclick.net') {
      return text200('/* offline noop */');
    }
    if (/\\/cdn-cgi\\/rum/i.test(u.pathname)) return text200(''); // Cloudflare RUM

    // API моки (точный и loose)
    try{
      const map = await getApi();
      const m = req.method.toUpperCase();
      const k = map.find(x=> x.method===m && (x.url===norm(url) || x.url===normLoose(url)));
      if (k){
        const rec = await (await fetch(BASE+k.file)).json();
        const headers = new Headers(rec.response?.headers || { 'content-type': k.contentType || 'application/json' });
        headers.set('access-control-allow-origin','*');
        headers.set('access-control-allow-credentials','true');
        const b64 = rec.response?.bodyB64;
        const body = b64 ? Uint8Array.from(atob(b64), c=>c.charCodeAt(0)) : null;
        return new Response(body, { status: rec.response?.status||200, headers });
      }
    }catch{}

    // ассеты из карты
    const key = ASSET_MAP[norm(url)] || ASSET_MAP[normLoose(url)];
    if (key){
      const cache=await caches.open(ASSETS_CACHE);
      const p = BASE+key;
      const hit = await cache.match(p);
      if (hit) return hit;
      try{ const r=await fetch(p); if (r.ok){ await cache.put(p, r.clone()); return r; } }catch{}
      return new Response(null,{status:404});
    }

    // best-effort: пробуем как есть; если оффлайн — 204
    try{ return await fetch(req); } catch { return new Response(null,{status:204}); }
  })());
});`;
  await fs.writeFile(path.join(outDir,'sw.js'), sw);

  // -------- 6) runtime/offline.js (вычисляет BASE автоматически)
  const rt = `/* auto-gen */
(()=> {
  // BASE — папка, где лежит offline.js (или документ)
  const script = document.currentScript;
  const BASE = (()=> {
    try{
      if (script?.src) return new URL(script.src, location.href).pathname.replace(/[^/]+$/, '');
    }catch{}
    return location.pathname.replace(/[^/]+$/, '');
  })();

  // встраиваем mirrorIndex.json как константу (чтобы XHR.open был синхронным)
  const MIRROR = ${JSON.stringify(mirrorMap, null, 2)};
  function norm(u){ try{ const x=new URL(u, location.href); x.hash=''; const a=[...x.searchParams.entries()].sort(([p],[q])=>p.localeCompare(q)); x.search=''; for(const [k,v] of a) x.searchParams.append(k,v); return x.toString(); } catch { return u; } }

  // регистрация SW
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(BASE+'sw.js', { scope: BASE })
      .then(reg => {
        if (!navigator.serviceWorker.controller) {
          navigator.serviceWorker.addEventListener('controllerchange', ()=> location.reload(), { once:true });
        } else reg.update().catch(()=>{});
      })
      .catch(()=>{});
  }

  // helper: если есть зеркало — верни локальный путь
  function localFromMirror(u) {
    const k = norm(u);
    return MIRROR[k] ? BASE + MIRROR[k] : null;
  }

  // fetch: синхронная подмена
  const _fetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    try{
      const url = typeof input==='string' ? input : (input?.url||'');
      if (/^https?:\\/\\//i.test(url)) {
        const local = localFromMirror(url);
        if (local && String((init?.method)||'GET').toUpperCase()==='GET') {
          return _fetch(local, init);
        }
      }
    }catch{}
    return _fetch(input, init);
  };

  // XHR: синхронная подмена (без async race)
  const _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest){
    try{
      if (/^https?:\\/\\//i.test(url)){
        const local = localFromMirror(url);
        if (local && String(method||'GET').toUpperCase()==='GET') {
          return _open.call(this, method, local, ...rest);
        }
      }
    }catch{}
    return _open.call(this, method, url, ...rest);
  };

  // динамические элементы: <script>/<link> и window.loadScript()
  (function patchDynamic(){
    const origCreate = document.createElement;
    document.createElement = function(tag){
      const el = origCreate.call(document, tag);
      if (tag.toLowerCase()==='script') {
        const d = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype,'src');
        if (d?.set) Object.defineProperty(el,'src',{ set(v){ const l = /^https?:\\/\\//i.test(v) ? localFromMirror(v) : null; d.set.call(el, l||v); }, get(){ return d.get.call(el); }});
      }
      if (tag.toLowerCase()==='link') {
        const d = Object.getOwnPropertyDescriptor(HTMLLinkElement.prototype,'href');
        if (d?.set) Object.defineProperty(el,'href',{ set(v){ const l = /^https?:\\/\\//i.test(v) ? localFromMirror(v) : null; d.set.call(el, l||v); }, get(){ return d.get.call(el); }});
      }
      return el;
    }

    if (typeof window.loadScript==='function' && !window.__patchedLoadScript) {
      const orig = window.loadScript;
      window.loadScript = function(u, cb){
        try { const l = /^https?:\\/\\//i.test(u) ? localFromMirror(u) : null; return orig.call(this, l||u, cb); }
        catch { return orig.apply(this, arguments); }
      };
      window.__patchedLoadScript = true;
    }
  })();
})();`;
  await fs.writeFile(path.join(outDir,'runtime','offline.js'), rt);

  // -------- 7) HTML: фикс meta viewport, инъекция offline.js + перепись ссылок на mirror (RELATIVE!)
  
  // фикс meta viewport (точка с запятой → запятая)
  html = html.replace(
    /<meta\s+name=["']viewport["']\s+content=["']([^"']+)["']\s*\/?>/i,
    (m,content)=>{
      const fixed = content.replace(/;\s*/g, ', ');
      return m.replace(content, fixed);
    }
  );

  const inject = `\n  <script src="runtime/offline.js"></script>\n`; // относительный путь
  let outHtml = html;
  if(/<head[^>]*>/i.test(outHtml)) outHtml = outHtml.replace(/<head[^>]*>/i, m=> m + inject);
  else outHtml = inject + outHtml;

  // общее преобразование атрибутов
  function replaceAttr(tag, attr){
    const re = new RegExp(`<${tag}[^>]*?${attr}=(["'\\\`])(https?:\\/\\/[^"'\\\`]+)\\1`, 'gi');
    outHtml = outHtml.replace(re, (m,q,abs)=>{
      const local = mirrorMap[normUrl(abs)];
      return local ? m.replace(abs, local) : m;
    });
  }
  ['script','link','img','iframe','source','video'].forEach(t=>{
    replaceAttr(t,'src'); if (t==='link') replaceAttr('link','href'); if (t==='video') replaceAttr('video','poster');
  });

  // srcset
  outHtml = outHtml.replace(/\s+srcset=(["'])([^"']+)\1/gi, (m,q,val)=>{
    const parts = val.split(',').map(p=>{
      const [u, d] = p.trim().split(/\s+/,2);
      const local = /^https?:\/\//i.test(u) ? mirrorMap[normUrl(u)] : null;
      return (local||u) + (d?(' '+d):'');
    });
    return ` srcset="${parts.join(', ')}"`;
  });

  // inline url(...)
  outHtml = outHtml.replace(/url\((['"]?)(https?:\/\/[^'")]+)\1\)/gi,
    (m,q,abs)=> { const local = mirrorMap[normUrl(abs)]; return local ? m.replace(abs, local) : m; });

  // xlink:href / <use href>
  outHtml = outHtml.replace(/\s+(xlink:href|href)=(["'])(https?:\/\/[^"']+)\2/gi,
    (m,attr,q,abs)=>{ const local = mirrorMap[normUrl(abs)]; return local ? m.replace(abs, local) : m; });

  await fs.writeFile(path.join(outDir,'index.html'), outHtml);
  await fs.writeFile(path.join(outDir,'build.json'), safeJson({ from: capDir, createdAt: new Date().toISOString() }));

  console.log('[build] ok:', outDir);
}

main().catch(e=>{ console.error('[build] error', e); process.exit(1); });
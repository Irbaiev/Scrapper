#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import mime from 'mime-types';
import https from 'node:https';
import http from 'node:http';

function parseArgs(argv){ const a={}; for(let i=2;i<argv.length;i++){ const t=argv[i]; if(t.startsWith('--')){ const k=t.slice(2); const v=(i+1<argv.length && !argv[i+1].startsWith('--'))? argv[++i]: true; a[k]=v; } } return a; }
const safeJson = (x)=> JSON.stringify(x, null, 2);
const shortHash = (s)=> crypto.createHash('sha1').update(String(s)).digest('hex').slice(0,8);

const fetchNode = (url)=> new Promise((res, rej)=>{
  const mod = url.startsWith('https:') ? https : http;
  const req = mod.get(url, { rejectUnauthorized:false }, r=>{
    const chunks=[]; r.on('data',c=>chunks.push(c));
    r.on('end',()=> res({ status:r.statusCode, headers:r.headers, body:Buffer.concat(chunks) }));
  });
  req.on('error', rej);
});

function normalizeUrl(u){ try{ const x=new URL(u); x.hash=''; const pairs=[...x.searchParams.entries()].sort(([a],[b])=>a.localeCompare(b)); x.search=''; for(const [k,v] of pairs) x.searchParams.append(k,v); return x.toString(); }catch{ return u; } }
function mirrorPathForUrl(uStr){
  const u = new URL(uStr);
  let p = u.pathname; if (p.endsWith('/')) p += 'index.html';
  if (u.search) {
    const tag = `.__q_${shortHash(u.search)}`;
    const dot = p.lastIndexOf('.');
    p = (dot>-1 && dot>=p.lastIndexOf('/')) ? (p.slice(0,dot)+tag+p.slice(dot)) : (p+tag);
  }
  return path.posix.join('mirror', u.hostname, p.replace(/^\//,''));
}
async function copyFileEnsure(src, dst){ await fs.mkdir(path.dirname(dst), { recursive: true }); await fs.copyFile(src, dst); }

async function main(){
  const args = parseArgs(process.argv);
  const capDir = path.resolve(String(args.capture||''));
  const outDir = path.resolve(String(args.out||path.join('dist','build')));
  const wantMirror = String(args.structure||'mirror') !== 'flat';
  const doRewrite = Boolean(args['rewrite-html']);
  const doPrefetch = Boolean(args['prefetch-missing']);

  const manifest = JSON.parse(await fs.readFile(path.join(capDir, 'manifest.json'), 'utf8'));
  await fs.mkdir(outDir, { recursive: true });
  const assetsOut = path.join(outDir, 'assets');
  const mocksApiOut = path.join(outDir, 'mocks','api');
  const mocksWsOut = path.join(outDir, 'mocks','ws');
  await fs.mkdir(assetsOut, { recursive: true });
  await fs.mkdir(mocksApiOut, { recursive: true });
  await fs.mkdir(mocksWsOut, { recursive: true });
  if (wantMirror) await fs.mkdir(path.join(outDir, 'mirror'), { recursive: true });

  // 1) Копия ассетов (+ карты)
  const assetMap = {};   // abs -> assets/..
  const mirrorMap = {};  // abs -> /mirror/..
  for (const [absUrl, meta] of Object.entries(manifest.assets)){
    const src = path.join(capDir, meta.path);
    const fname = path.basename(meta.path);
    await copyFileEnsure(src, path.join(assetsOut, fname));
    const key = normalizeUrl(absUrl);
    assetMap[key] = `assets/${fname}`;
    if (wantMirror){
      const rel = mirrorPathForUrl(absUrl);
      await copyFileEnsure(src, path.join(outDir, rel));
      mirrorMap[key] = '/' + rel;
    }
  }

  // 2) Prefetch отсутствующих файлов (по HTML, включая loadScript и url(...) в CSS)
  if (doPrefetch && wantMirror){
    const ensure = async (abs)=>{
      const key = normalizeUrl(abs); if (mirrorMap[key]) return;
      try{
        const r = await fetchNode(abs);
        if ((r.status||200) >= 200 && (r.status||200) < 400) {
          const ctype = r.headers['content-type']||'';
          const u = new URL(abs); let p=u.pathname; if (p.endsWith('/')) p+='index.html';
          if (u.search){ const tag=`.__q_${shortHash(u.search)}`; const dot=p.lastIndexOf('.'); p=(dot>-1&&dot>=p.lastIndexOf('/'))? (p.slice(0,dot)+tag+p.slice(dot)) : (p+tag); }
          const rel = path.posix.join('mirror', u.hostname, p.replace(/^\//,''));
          await fs.mkdir(path.join(outDir, path.dirname(rel)), { recursive: true });
          await fs.writeFile(path.join(outDir, rel), r.body);
          mirrorMap[key] = '/' + rel;
        }
      }catch{}
    };

    const mainHtmlMeta = manifest.assets[manifest.url];
    if (mainHtmlMeta){
      const html = await fs.readFile(path.join(capDir, mainHtmlMeta.path), 'utf8');
      const urls = new Set();
      html.replace(/(?:src|href)=("|'|`)(https?:\/\/[^"'`]+)\1/gi, (_,q,u)=>{ urls.add(u); return _; });
      html.replace(/loadScript\(("|'|`)(https?:\/\/[^"'`]+)\1\)/gi, (_,q,u)=>{ urls.add(u); return _; });
      for (const u of urls) await ensure(u);
    }

    // CSS url(...)
    for (const [absUrl, meta] of Object.entries(manifest.assets)){
      if (!/\.css$/i.test(meta.path)) continue;
      try {
        const css = await fs.readFile(path.join(capDir, meta.path), 'utf8');
        const reg = /url\((['"]?)(https?:\/\/[^'")]+)\1\)/gi;
        let m; const found = new Set();
        while ((m = reg.exec(css))) found.add(m[2]);
        for (const u of found) await ensure(u);
      } catch {}
    }
  }

  // 3) API/WS карты
  const apiMap = [];
  for (const entry of manifest.api){
    const src = path.join(capDir, entry.file); const base = path.basename(entry.file);
    await copyFileEnsure(src, path.join(mocksApiOut, base));
    const rec = JSON.parse(await fs.readFile(path.join(mocksApiOut, base),'utf8'));
    apiMap.push({
      method:(rec.request?.method||'GET').toUpperCase(),
      url: normalizeUrl(rec.request?.url||entry.url),
      file:`mocks/api/${base}`,
      status: rec.response?.status||200,
      contentType: rec.response?.contentType||rec.response?.headers?.['content-type']||rec.response?.headers?.['Content-Type']||'application/json'
    });
  }
  await fs.writeFile(path.join(outDir,'mocks','apiMap.json'), safeJson(apiMap));

  const wsMap = [];
  for (const entry of manifest.ws){
    const src = path.join(capDir, entry.file); const base = path.basename(entry.file);
    await copyFileEnsure(src, path.join(mocksWsOut, base));
    const j = JSON.parse(await fs.readFile(path.join(mocksWsOut, base),'utf8'));
    wsMap.push({ url: normalizeUrl(j.url||entry.url), file: `mocks/ws/${base}` });
  }
  await fs.writeFile(path.join(outDir,'mocks','wsMap.json'), safeJson(wsMap));

  // 4) Индекс зеркала
  if (wantMirror) await fs.writeFile(path.join(outDir,'mirrorIndex.json'), safeJson(mirrorMap));

  // 5) SW (фиксированный; без тела у 204/404, всегда локальный файл для ассетов)
  const sw = `/* auto-generated */
const ASSET_MAP=${JSON.stringify(assetMap)};
const API_MAP_PATH='/mocks/apiMap.json';
const ASSETS_CACHE='offline-assets-v1';
self.addEventListener('install', e=>{ e.waitUntil((async()=>{ const cache=await caches.open(ASSETS_CACHE); await cache.addAll(Object.values(ASSET_MAP)); })()); self.skipWaiting(); });
self.addEventListener('activate', e=>{ e.waitUntil(self.clients.claim()); });
function norm(u){try{const x=new URL(u);x.hash='';const p=[...x.searchParams.entries()].sort(([a],[b])=>a.localeCompare(b));x.search='';for(const [k,v] of p) x.searchParams.append(k,v);return x.toString();}catch{return u}}
let API_MAP=null; async function getApiMap(){ if(API_MAP) return API_MAP; const res=await fetch(API_MAP_PATH); API_MAP=await res.json(); return API_MAP; }
self.addEventListener('fetch', (event)=>{
  const req=event.request; const url=norm(req.url); const u=new URL(url);
  event.respondWith((async()=>{
    // глушим аналитику
    if(u.hostname==='www.googletagmanager.com' || u.hostname==='static.cloudflareinsights.com'){
      return new Response('/* offline noop */',{status:200, headers:{'content-type':'application/javascript'}});
    }
    // ассеты по карте -> локальный файл
    const assetRel=ASSET_MAP[url];
    if(assetRel){
      const cache=await caches.open(ASSETS_CACHE);
      const hit=await cache.match(assetRel); if(hit) return hit;
      const res=await fetch(assetRel).catch(()=>null);
      if(res && res.ok){ await cache.put(assetRel, res.clone()); return res; }
      return new Response(null,{status:404});
    }
    // API моки
    try {
      const map=await getApiMap(); const m = map.find(x=> x.url===url && x.method===req.method);
      if(m){
        const data=await fetch(m.file); const rec=await data.json();
        const body = rec.response?.bodyB64 ? Uint8Array.from(atob(rec.response.bodyB64), c=>c.charCodeAt(0)) : null;
        return new Response(body, { status: rec.response?.status||200, headers: rec.response?.headers||{'content-type': m.contentType} });
      }
    } catch(e){}
    // фолбэк
    try{ return await fetch(req); } catch{ return new Response(null,{status:204}); }
  })());
});`;
  await fs.writeFile(path.join(outDir,'sw.js'), sw);

  // 6) runtime/offline.js — ранняя регистрация + fetch/XHR патч + базовый WS-мок
  const runtimeDir = path.join(outDir,'runtime'); await fs.mkdir(runtimeDir,{recursive:true});
  const runtime = `/* auto-generated */
(()=> {
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('/sw.js').then(reg=>{
      if(!navigator.serviceWorker.controller){
        navigator.serviceWorker.addEventListener('controllerchange', ()=> location.reload(), { once:true });
      } else { reg.update().catch(()=>{}); }
    }).catch(()=>{});
  }
  // mirror индекс
  let MIRROR=null; async function getMirror(){ if(MIRROR) return MIRROR; try{ const r=await fetch('/mirrorIndex.json'); MIRROR=await r.json(); }catch{ MIRROR={}; } return MIRROR; }
  function norm(u){ try{ const x=new URL(u, location.href); x.hash=''; const arr=[...x.searchParams.entries()].sort(([a],[b])=>a.localeCompare(b)); x.search=''; for(const [k,v] of arr) x.searchParams.append(k,v); return x.toString(); } catch { return u; } }

  // fetch патч
  const origFetch = window.fetch.bind(window);
  window.fetch = async function(input, init){
    try{
      const url = typeof input==='string'? input : (input?.url||'');
      if(/^https?:\/\//i.test(url)){
        const local = (await getMirror())[norm(url)];
        const method = (init?.method||'GET').toUpperCase();
        if(local && method==='GET'){ return origFetch(local, init); }
      }
    } catch {}
    return origFetch(input, init);
  };

  // XHR патч
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest){
    try{
      if(/^https?:\/\//i.test(url)){
        getMirror().then(m=>{
          const n = norm(url);
          if(m[n] && String(method||'GET').toUpperCase()==='GET'){
            try { origOpen.call(this, method, m[n], ...rest); } catch { origOpen.call(this, method, url, ...rest); }
          } else {
            origOpen.call(this, method, url, ...rest);
          }
        });
        return;
      }
    } catch {}
    return origOpen.call(this, method, url, ...rest);
  };

  // Простой WS mock (replay) — оставляем базовым
  const origWS = window.WebSocket;
  let WS_MAP=null; async function getWsMap(){ if(WS_MAP) return WS_MAP; try{ const r=await fetch('/mocks/wsMap.json'); WS_MAP=await r.json(); }catch{ WS_MAP=[]; } return WS_MAP; }
  function normAbs(u){ try{ const x=new URL(u, location.href); x.hash=''; const p=[...x.searchParams.entries()].sort(([a],[b])=>a.localeCompare(b)); x.search=''; for(const [k,v] of p) x.searchParams.append(k,v); return x.toString(); }catch{return u} }
  class MockWS {
    constructor(url){ this.url=normAbs(url); this.readyState=0; this.binaryType='blob'; setTimeout(()=>{ this.readyState=1; this.onopen && this.onopen({type:'open'}); this._replay(); },0); }
    async _replay(){
      try{
        const map=await getWsMap(); const item = map.find(x=>x.url===this.url);
        if(!item){ this.close(); return; }
        const dump = await (await fetch(item.file)).json();
        const frames = (dump.frames||[]).filter(f=> f.dir==='in');
        let last = frames.length? frames[0].t : Date.now();
        for(const f of frames){
          const dt = Math.min(1000, Math.max(0, f.t - last)); await new Promise(r=> setTimeout(r, dt));
          let data = f.payload;
          if (f.opcode===2){ try { const bin=Uint8Array.from(atob(data), c=>c.charCodeAt(0)); data = (this.binaryType==='arraybuffer') ? bin.buffer : new Blob([bin.buffer]); } catch {} }
          this.onmessage && this.onmessage({ data, type:'message' }); last = f.t;
        }
      } finally { this.close(); }
    }
    send(){} close(){ if(this.readyState===3) return; this.readyState=3; this.onclose && this.onclose({ code:1000, reason:'offline-mock', wasClean:true }); }
    addEventListener(t, cb){ this['on'+t]=cb; } removeEventListener(t){ this['on'+t]=null; } dispatchEvent(){ return true; }
  }
  window.WebSocket = function(url, protocols){ return new MockWS(url, protocols); };
  window.WebSocket.prototype = origWS ? origWS.prototype : {};
})();
`;
  await fs.writeFile(path.join(runtimeDir,'offline.js'), runtime);

  // 7) index.html: инъекция + HTML-rewrite (+ loadScript)
  const mainHtmlMeta = manifest.assets[manifest.url];
  if(!mainHtmlMeta) throw new Error(`Не найден HTML главной страницы в manifest.assets по URL: ${manifest.url}`);
  let html = await fs.readFile(path.join(capDir, mainHtmlMeta.path), 'utf8');
  const injection = `\n  <script src="/runtime/offline.js"></script>\n`;
  if(/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, m=> m + injection);
  else if(/<html[^>]*>/i.test(html)) html = html.replace(/<html[^>]*>/i, m=> m + `\n<head>${injection}</head>`);
  else html = injection + html;

  if (doRewrite && wantMirror){
    const replaceAttr = (tag, attr) => {
      const re = new RegExp(`<${tag}[^>]*?${attr}=("|'|\\\`)(https?:\\/\\/[^"'\\\`]+)\\1`, 'gi');
      html = html.replace(re, (m, q, abs) => {
        const key = normalizeUrl(abs);
        const local = mirrorMap[key];
        return local ? m.replace(abs, local) : m;
      });
    };
    replaceAttr('script','src');
    replaceAttr('link','href');
    replaceAttr('img','src');
    // loadScript('https://...') → локально, если есть
    html = html.replace(/loadScript\(("|'|`)(https?:\/\/[^"'`]+)\1\)/gi, (m, q, abs)=>{
      const local = mirrorMap[normalizeUrl(abs)];
      return local ? m.replace(abs, local) : m;
    });
  }

  await fs.writeFile(path.join(outDir,'index.html'), html);
  await fs.writeFile(path.join(outDir,'build.json'), safeJson({
    from: capDir, createdAt: new Date().toISOString(),
    structure: wantMirror? 'mirror':'flat',
    rewriteHtml: !!doRewrite,
    prefetchMissing: !!doPrefetch
  }));

  console.log('[build] ok:', outDir);
}

main().catch(e=>{ console.error('[build] error', e); process.exit(1); });
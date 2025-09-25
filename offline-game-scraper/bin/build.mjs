#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import http from 'node:http';

function parseArgs(argv){ const a={}; for(let i=2;i<argv.length;i++){ const t=argv[i]; if(t.startsWith('--')){ const k=t.slice(2); const v=(i+1<argv.length && !argv[i+1].startsWith('--'))? argv[++i]: true; a[k]=v; } } return a; }
const safeJson = (x)=> JSON.stringify(x, null, 2);
const shortHash = (s)=> crypto.createHash('sha1').update(String(s)).digest('hex').slice(0,8);
const normUrl = (u)=>{ try{ const x=new URL(u); x.hash=''; const p=[...x.searchParams.entries()].sort(([a],[b])=>a.localeCompare(b)); x.search=''; for(const [k,v] of p) x.searchParams.append(k,v); return x.toString(); }catch{ return u; } };
const fetchNode = (url)=> new Promise((res, rej)=>{ const mod=url.startsWith('https:')?https:http; const req=mod.get(url,{rejectUnauthorized:false},r=>{const chunks=[]; r.on('data',c=>chunks.push(c)); r.on('end',()=>res({status:r.statusCode||0, headers:r.headers, body:Buffer.concat(chunks)}));}); req.on('error',rej);});
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
  const assetMap = {};   // abs -> assets/<hash>.<ext> (RELATIVE!)
  const mirrorMap = {};  // abs -> mirror/… (RELATIVE!)
  for (const [abs, meta] of Object.entries(manifest.assets||{})){
    const src = path.join(capDir, meta.path);
    const fname = path.basename(meta.path);
    await copyEnsure(src, path.join(assetsOut, fname));
    assetMap[normUrl(abs)] = `assets/${fname}`;
  }

  // -------- 2) PRELOAD внешних (по HTML + CSS + loadScript)
  const ensureMirror = async (abs) => {
    const key = normUrl(abs); if (mirrorMap[key]) return;
    try {
      const r = await fetchNode(abs);
      if (r.status>=200 && r.status<400) {
        const rel = mirrorRelFor(abs);
        await fs.mkdir(path.join(outDir, path.dirname(rel)), { recursive: true });
        await fs.writeFile(path.join(outDir, rel), r.body);
        mirrorMap[key] = rel; // << RELATIVE (без /)
      }
    } catch {}
  };

  // главный HTML
  const htmlMeta = manifest.assets[manifest.url];
  let html = await fs.readFile(path.join(capDir, htmlMeta.path), 'utf8');

  // вытащим прямые внешние URL из HTML
  const extUrls = new Set();
  html.replace(/(?:src|href)=("|'|`)(https?:\/\/[^"'`]+)\1/gi, (_,q,u)=>{ extUrls.add(u); return _; });
  html.replace(/loadScript\(("|'|`)(https?:\/\/[^"'`]+)\1/gi, (_,q,u)=>{ extUrls.add(u); return _; });

  // и из всех CSS ассетов
  for (const [abs, meta] of Object.entries(manifest.assets||{})){
    if (!/\.css$/i.test(meta.path)) continue;
    try {
      const css = await fs.readFile(path.join(capDir, meta.path), 'utf8');
      let m; const re=/url\((['"]?)(https?:\/\/[^'")]+)\1\)/gi;
      while((m=re.exec(css))) extUrls.add(m[2]);
    } catch {}
  }
  await Promise.all([...extUrls].map(ensureMirror));

  // -------- 3) API/WS карты
  const apiMap = [];
  for (const entry of (manifest.api||[])) {
    const src = path.join(capDir, entry.file); const base = path.basename(entry.file);
    await copyEnsure(src, path.join(mocksApiOut, base));
    const rec = JSON.parse(await fs.readFile(path.join(mocksApiOut, base),'utf8'));
    apiMap.push({
      method: (rec.request?.method||'GET').toUpperCase(),
      url: normUrl(rec.request?.url||entry.url),
      file: `mocks/api/${base}`,
      status: rec.response?.status||200,
      contentType: rec.response?.contentType || rec.response?.headers?.['content-type'] || rec.response?.headers?.['Content-Type'] || 'application/json'
    });
  }
  await fs.writeFile(path.join(outDir,'mocks','apiMap.json'), safeJson(apiMap));

  const wsMap = [];
  for (const entry of (manifest.ws||[])) {
    const src = path.join(capDir, entry.file); const base = path.basename(entry.file);
    await copyEnsure(src, path.join(mocksWsOut, base));
    wsMap.push({ url: normUrl(entry.url), file: `mocks/ws/${base}` });
  }
  await fs.writeFile(path.join(outDir,'mocks','wsMap.json'), safeJson(wsMap));

  // -------- 4) Зеркало
  await fs.writeFile(path.join(outDir,'mirrorIndex.json'), safeJson(mirrorMap));

  // -------- 5) SW (работает из ЛЮБОЙ подпапки)
  const sw = `/* auto-generated */
const ASSET_MAP=${JSON.stringify(assetMap)};
const API_MAP_PATH='mocks/apiMap.json'; // relative to scope
const BASE=new URL(self.registration.scope).pathname.replace(/[^/]+$/,'');
const ASSETS_CACHE='offline-assets-v2';

function log(){/* mute in prod */} // можно включить лог при отладке

function norm(u){try{const x=new URL(u);x.hash='';const a=[...x.searchParams.entries()].sort(([p],[q])=>p.localeCompare(q));x.search='';for(const [k,v] of a)x.searchParams.append(k,v);return x.toString();}catch{return u}}

let API_MAP=null; async function getApi(){ if(API_MAP) return API_MAP; const r=await fetch(BASE+API_MAP_PATH).catch(()=>null); API_MAP=r? await r.json(): []; return API_MAP; }

self.addEventListener('install', e=>{
  e.waitUntil((async()=>{
    const cache=await caches.open(ASSETS_CACHE);
    await cache.addAll(Object.values(ASSET_MAP).map(p=> BASE+p));
  })());
  self.skipWaiting();
});

self.addEventListener('activate', e=>{ e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', (event)=>{
  const req=event.request;
  const urlStr=req.url;
  const u=new URL(urlStr);

  // игнор внутренних схем
  if (u.protocol==='chrome-extension:' || u.protocol==='devtools:') return;

  event.respondWith((async()=>{
    // аналитика — глушим
    if (u.hostname==='www.googletagmanager.com' || u.hostname==='static.cloudflareinsights.com')
      return new Response('/* offline noop */',{status:200,headers:{'content-type':'application/javascript'}});

    // ассеты из карты
    const key=norm(urlStr);
    const assetRel=ASSET_MAP[key];
    if (assetRel){
      const cache=await caches.open(ASSETS_CACHE);
      const hit=await cache.match(BASE+assetRel);
      if (hit) return hit;
      try{ const res=await fetch(BASE+assetRel); if(res.ok){ await cache.put(BASE+assetRel,res.clone()); return res; } }catch{}
      return new Response(null,{status:404});
    }

    // API — из моков
    try{
      const map=await getApi();
      const method=req.method.toUpperCase();
      const mm = map.find(x=> x.method===method && x.url===norm(urlStr));
      if (mm){
        const data=await fetch(BASE+mm.file);
        const rec=await data.json();
        const b64=rec.response?.bodyB64;
        const body=b64? Uint8Array.from(atob(b64), c=>c.charCodeAt(0)) : null;
        const hdr=rec.response?.headers || {'content-type': mm.contentType};
        return new Response(body, { status: rec.response?.status||200, headers: hdr });
      }
    }catch(e){}

    // всё остальное — пусть идёт как есть (или 204 оффлайн)
    try{ return await fetch(req); } catch { return new Response(null,{status:204}); }
  })());
});`;
  await fs.writeFile(path.join(outDir,'sw.js'), sw);

  // -------- 6) runtime/offline.js (вычисляет BASE автоматически)
  const rt = `/* auto-generated */
(()=> {
  // BASE = путь папки, где лежит offline.js (или документ)
  const script = document.currentScript;
  const BASE = (()=> {
    try{
      if (script?.src) {
        const u = new URL(script.src, location.href);
        return u.pathname.replace(/[^/]+$/, '');
      }
    }catch{}
    const p = location.pathname.replace(/[^/]+$/, '');
    return p.endsWith('/')? p : p + '/';
  })();

  function norm(u){ try{ const x=new URL(u, location.href); x.hash=''; const a=[...x.searchParams.entries()].sort(([p],[q])=>p.localeCompare(q)); x.search=''; for(const [k,v] of a)x.searchParams.append(k,v); return x.toString(); } catch { return u; } }

  // регистрация SW с правильным scope
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register(BASE+'sw.js', { scope: BASE })
      .then(reg=>{
        if(!navigator.serviceWorker.controller){
          navigator.serviceWorker.addEventListener('controllerchange', ()=> location.reload(), { once:true });
        } else { reg.update().catch(()=>{}); }
      })
      .catch(()=>{});
  }

  // mirrorIndex — относительный к BASE
  let MIRROR=null; async function getMirror(){ if(MIRROR) return MIRROR; try{ const r=await fetch(BASE+'mirrorIndex.json'); MIRROR=await r.json(); }catch{ MIRROR={}; } return MIRROR; }

  // патч fetch/XHR → если есть локальный mirror, используем его
  const origFetch = window.fetch.bind(window);
  window.fetch = async function(input, init){
    try{
      const url = typeof input==='string'? input : (input?.url||'');
      if(/^https?:\\/\\//i.test(url)){
        const local = (await getMirror())[norm(url)];
        if(local && (init?.method||'GET').toUpperCase()==='GET'){ return origFetch(BASE+local, init); }
      }
    } catch {}
    return origFetch(input, init);
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest){
    try{
      if(/^https?:\\/\\//i.test(url)){
        getMirror().then(m=>{
          const n=norm(url); const local=m[n];
          if(local && String(method||'GET').toUpperCase()==='GET'){
            try { origOpen.call(this, method, BASE+local, ...rest); } catch { origOpen.call(this, method, url, ...rest); }
          } else origOpen.call(this, method, url, ...rest);
        });
        return;
      }
    } catch {}
    return origOpen.call(this, method, url, ...rest);
  };
})();`;
  await fs.writeFile(path.join(outDir,'runtime','offline.js'), rt);

  // -------- 7) HTML: инъекция offline.js + перепись ссылок на mirror (RELATIVE!)
  const inject = `\n  <script src="runtime/offline.js"></script>\n`; // относительный путь
  let outHtml = html;
  if(/<head[^>]*>/i.test(outHtml)) outHtml = outHtml.replace(/<head[^>]*>/i, m=> m + inject);
  else outHtml = inject + outHtml;

  // replace src/href/img → mirror/… (relative)
  const replAttr = (tag, attr) => {
    const re = new RegExp(`<${tag}[^>]*?${attr}=(["'\`])(https?:\/\/[^"'\`]+)\\1`, 'gi');
    outHtml = outHtml.replace(re, (m, q, abs)=>{
      const local = mirrorMap[normUrl(abs)];
      return local ? m.replace(abs, local) : m;
    });
  };
  replAttr('script','src');
  replAttr('link','href');
  replAttr('img','src');
  // loadScript('https://…') → mirror/…
  outHtml = outHtml.replace(/loadScript\((["'`])(https?:\/\/[^"'`]+)\1\)/gi, (m,q,abs)=>{
    const local = mirrorMap[normUrl(abs)];
    return local ? m.replace(abs, local) : m;
    });

  await fs.writeFile(path.join(outDir,'index.html'), outHtml);
  await fs.writeFile(path.join(outDir,'build.json'), safeJson({ from: capDir, createdAt: new Date().toISOString() }));

  console.log('[build] ok:', outDir);
}

main().catch(e=>{ console.error('[build] error', e); process.exit(1); });
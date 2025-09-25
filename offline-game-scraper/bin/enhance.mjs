#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv){ const a={}; for(let i=2;i<argv.length;i++){ const t=argv[i]; if(t.startsWith('--')){ const k=t.slice(2); const v=(i+1<argv.length && !argv[i+1].startsWith('--'))? argv[++i]: true; a[k]=v; } } return a; }
const safeJson = (x)=> JSON.stringify(x, null, 2);

function normUrl(u){ try{ const x=new URL(u); x.hash=''; const pairs=[...x.searchParams.entries()].sort(([a],[b])=>a.localeCompare(b)); x.search=''; for(const [k,v] of pairs) x.searchParams.append(k,v); return x.toString(); }catch{ return u; } }
function baseOf(u){ try{ const x=new URL(u); x.hash=''; x.search=''; return x.toString(); }catch{ return u; } }

function stripVolatile(obj, regexes){ if(!obj || typeof obj!== 'object') return obj; const rx = regexes.map(r=> new RegExp(r)); const recur=(v)=>{ if(Array.isArray(v)) return v.map(recur); if(v && typeof v==='object'){ const out={}; for(const [k,val] of Object.entries(v)){ if(rx.some(r=> r.test(k))) continue; out[k]=recur(val); } return out; } return v; }; return recur(obj); }
function sortKeysStable(v){ if(Array.isArray(v)) return v.map(sortKeysStable); if(v && typeof v==='object'){ const out={}; for(const k of Object.keys(v).sort()) out[k]=sortKeysStable(v[k]); return out; } return v; }

async function buildApiIndex(captureDir, distDir, cfg){
  const manifest = JSON.parse(await fs.readFile(path.join(captureDir,'manifest.json'),'utf8'));
  const stripQ = new Set(cfg.api?.stripQueryKeys||[]);
  const rxKeys = cfg.api?.stripBodyKeysRegex||[];

  const index = {}; // key = METHOD + ' ' + baseURL; value: array of variants

  for(const entry of manifest.api){
    const absPath = path.join(captureDir, entry.file);
    const rec = JSON.parse(await fs.readFile(absPath,'utf8'));
    const method = (rec.request?.method||'GET').toUpperCase();
    const url = rec.request?.url || entry.url;

    // Normalize query
    const u = new URL(url);
    const kept=[]; for(const [k,v] of u.searchParams){ if(!stripQ.has(k)) kept.push([k,v]); }
    kept.sort(([a],[b])=> a.localeCompare(b));
    const qNorm = kept.map(([k,v])=> `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    const base = baseOf(url);

    // Normalize body (JSON if possible)
    let bodyNorm = null;
    if(rec.request?.bodyB64){
      try{
        const raw = Buffer.from(rec.request.bodyB64, 'base64').toString('utf8');
        try{ const j = JSON.parse(raw); const stripped = stripVolatile(j, rxKeys); const sorted = sortKeysStable(stripped); bodyNorm = JSON.stringify(sorted); }
        catch{ bodyNorm = raw.trim(); }
      }catch{}
    }

    const key = method + ' ' + base;
    index[key] ||= [];
    index[key].push({ q: qNorm, body: bodyNorm, file: path.posix.join('mocks','api', path.basename(entry.file)), status: rec.response?.status||200, headers: rec.response?.headers||{}, contentType: rec.response?.contentType||rec.response?.headers?.['content-type']||rec.response?.headers?.['Content-Type']||'application/json' });
  }

  await fs.writeFile(path.join(distDir,'mocks','apiIndex.json'), safeJson(index));
}

async function writeWsMode(distDir, cfg){
  const wsCfg = { mode: cfg.ws?.mode||'replay', loop: !!cfg.ws?.loop, maxDelayMs: Number(cfg.ws?.maxDelayMs||800) };
  await fs.writeFile(path.join(distDir,'mocks','ws.mode.json'), JSON.stringify(wsCfg));
}

async function patchSW(distDir){
  const sw = `/* auto-generated (adv) */\nconst API_INDEX_PATH='/mocks/apiIndex.json';\nconst ASSETS_CACHE='offline-assets-v1';\nasync function getApiIndex(){ self.__apiIndex ||= (await fetch(API_INDEX_PATH)).json(); return self.__apiIndex; }\nfunction norm(u){try{const x=new URL(u); x.hash=''; const p=[...x.searchParams.entries()].sort(([a],[b])=>a.localeCompare(b)); x.search=''; for(const [k,v] of p) x.searchParams.append(k,v); return x.toString();}catch{return u}}\nfunction base(u){try{const x=new URL(u); x.hash=''; x.search=''; return x.toString();}catch{return u}}\nself.addEventListener('install', e=>{ self.skipWaiting(); });\nself.addEventListener('activate', e=>{ e.waitUntil(self.clients.claim()); });\nself.addEventListener('fetch', (event)=>{ const req=event.request; const url=norm(req.url); event.respondWith((async()=>{\n  // 1) Сначала ассеты из кэша (из Шага 2 уже закешированы)\n  try{ const cache = await caches.open(ASSETS_CACHE); const hit = await cache.match(new URL(url).pathname); if(hit) return hit; }catch{}\n  // 2) API-моки (устойчивый матчинг)\n  try{ const idx = await getApiIndex(); const method=req.method.toUpperCase(); const key = method+' '+base(url); const variants = idx[key];\n    if(variants && variants.length){\n      // normalize query\n      const u = new URL(url); const items = [...u.searchParams.entries()].sort(([a],[b])=>a.localeCompare(b));\n      const qNorm = items.map(([k,v])=> encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');\n      let bodyNorm = null; if(method !== 'GET' && method !== 'HEAD'){ try{ const raw = await req.clone().text(); try{ const j=JSON.parse(raw); const sorted = JSON.stringify(sortKeysStable(j)); bodyNorm = sorted; } catch{ bodyNorm = raw.trim(); } }catch{} }\n      const sameQ = variants.filter(v=> v.q === qNorm);\n      const pick = (sameQ.length? sameQ: variants).find(v=> (v.body? v.body===bodyNorm : true)) || variants[0];\n      if(pick){ const j = await (await fetch(pick.file)).json(); const body = j.response?.bodyB64 ? Uint8Array.from(atob(j.response.bodyB64), c=> c.charCodeAt(0)) : new Uint8Array(); return new Response(body, { status: j.response?.status||pick.status||200, headers: j.response?.headers||{'content-type': pick.contentType||'application/json'} }); }\n    }\n  }catch(e){}\n  // 3) Фолбэк — пробуем сеть (в оффлайне вернёт ошибку)\n  try{ return await fetch(req); } catch{ return new Response('',{status:204}); }\n})()); });\nfunction sortKeysStable(v){ if(Array.isArray(v)) return v.map(sortKeysStable); if(v && typeof v==='object'){ const out={}; for(const k of Object.keys(v).sort()) out[k]=sortKeysStable(v[k]); return out; } return v; }`;
  await fs.writeFile(path.join(distDir,'sw.js'), sw);
}

async function writeRuntimeAdv(distDir){
  const js = `/* auto-generated (adv) */\n(()=>{\n  // Перерегистрация SW на случай замены\n  if('serviceWorker' in navigator){ navigator.serviceWorker.getRegistration().then(r=>{ if(!r) navigator.serviceWorker.register('/sw.js'); else r.update(); }).catch(()=>{}); }\n  // Продвинутый WS с режимами и бинарными кадрами\n  const orig = window.WebSocket;\n  let CFG=null; async function getCfg(){ if(CFG) return CFG; const r=await fetch('/mocks/ws.mode.json'); CFG=await r.json(); return CFG; }\n  let WS_MAP=null; async function getWs(){ if(WS_MAP) return WS_MAP; const r=await fetch('/mocks/wsMap.json'); WS_MAP=await r.json(); return WS_MAP; }\n  function norm(u){ try{ const x=new URL(u, location.href); x.hash=''; const p=[...x.searchParams.entries()].sort(([a],[b])=>a.localeCompare(b)); x.search=''; for(const [k,v] of p) x.searchParams.append(k,v); return x.toString(); }catch{ return u; } }\n  class AdvWS{\n    constructor(url){ this.url = norm(url); this.readyState=0; this.protocol=''; this.binaryType='blob'; this.bufferedAmount=0; setTimeout(()=>{ this.readyState=1; this.onopen && this.onopen({type:'open'}); this._init(); }, 0); }\n    async _init(){ const cfg = await getCfg(); const map = await getWs(); this._cfg = cfg; this._dump = (map.find(x=>x.url===this.url) ? await (await fetch(map.find(x=>x.url===this.url).file)).json() : {frames:[]}); this._in = this._dump.frames.filter(f=> f.dir==='in'); this._out = this._dump.frames.filter(f=> f.dir==='out'); if(cfg.mode==='replay') this._replay(cfg.loop); }\n    async _replay(loop){ let lastT = this._in.length? this._in[0].t : Date.now(); do{ for(const f of this._in){ const dt = Math.min(this._cfg.maxDelayMs, Math.max(0, f.t - lastT)); await new Promise(r=> setTimeout(r, dt)); const data = this._payload(f); this.onmessage && this.onmessage({ data, type:'message' }); lastT = f.t; } } while(loop); this.close(); }\n    _payload(f){ let data = f.payload; if(f.opcode===2){ try{ const bin = Uint8Array.from(atob(data), c=> c.charCodeAt(0)); data = (this.binaryType==='arraybuffer') ? bin.buffer : new Blob([bin.buffer]); }catch{} } return data; }\n    send(msg){ // в simulate отдаём ответ на каждую send\n      if(this._cfg?.mode==='simulate'){ const f = this._in.shift(); if(f){ const data = this._payload(f); setTimeout(()=>{ this.onmessage && this.onmessage({ data, type:'message' }); if(this._cfg.loop) this._in.push(f); }, 50); } }\n    }\n    close(){ if(this.readyState===3) return; this.readyState=3; this.onclose && this.onclose({ code:1000, reason:'offline-adv', wasClean:true }); }\n    addEventListener(t, cb){ this['on'+t]=cb; }\n    removeEventListener(t){ this['on'+t]=null; }\n    dispatchEvent(){ return true; }\n  }\n  window.WebSocket = function(url, proto){ return new AdvWS(url, proto); };\n  window.WebSocket.prototype = orig ? orig.prototype : {};\n})();`;
  await fs.writeFile(path.join(distDir,'runtime','offline-adv.js'), js);
}

async function injectRuntime(distDir){
  const idx = path.join(distDir,'index.html');
  let html = await fs.readFile(idx, 'utf8');
  if(!/offline-adv\.js/.test(html)){
    const inj = `\n  <script src="/runtime/offline-adv.js"></script>\n`;
    if(/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, m=> m + inj);
    else html = inj + html;
    await fs.writeFile(idx, html);
  }
}

async function main(){
  const args = parseArgs(process.argv);
  const dist = path.resolve(String(args.dist||''));
  const capture = path.resolve(String(args.capture||''));
  const cfgPath = path.resolve(String(args.config||''));
  if(!dist || !capture) throw new Error('Usage: enhance --dist ./dist/<slug> --capture ./capture/<slug> [--config ./mock.config.json]');
  const cfg = (await fs.readFile(cfgPath).then(b=>JSON.parse(b.toString())).catch(()=>({})));

  await buildApiIndex(capture, dist, cfg);
  await writeWsMode(dist, cfg);
  await patchSW(dist);
  await writeRuntimeAdv(dist);
  await injectRuntime(dist);

  console.log('[enhance] ok:', dist);
}

main().catch(e=>{ console.error('[enhance] error', e); process.exit(1); });

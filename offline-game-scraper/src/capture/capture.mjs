// src/capture/capture.mjs
import path from 'node:path';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { sha256, ensureDir, safeJson, isProbablyApi, pickExt, writeFileIfChanged, nowTs, normUrl, normUrlLoose, isStaticJsonPath } from './util.mjs';
import { autoInteract } from './interact.mjs';

export async function capture(url, {
  outDir,
  harvestMs = 60000,
  headless = true,
  scenario = 'default',       // default | legacy | mobile | all
  interact = 'auto',          // auto | off
  loadAll = false,
  __dirname,
  safeName,
  appendNdjson,
  attachCdpNetworkSniffer     // CDP-сниффер для WS
} = {}) {

  const storageDir = path.join(outDir, 'storage');
  const assetsDir = path.join(storageDir, 'assets');
  const apiDir = path.join(storageDir, 'api');
  const wsDir = path.join(storageDir, 'ws');
  const logsDir = path.join(outDir, 'logs');
  await ensureDir(assetsDir); await ensureDir(apiDir); await ensureDir(wsDir); await ensureDir(logsDir);

  const logPath = path.join(logsDir, `capture-${Date.now()}.ndjson`);
  const jlog = async (obj) => { try { await fs.appendFile(logPath, JSON.stringify({ t: Date.now(), ...obj }) + '\n'); } catch {} };

  const manifest = { createdAt: nowTs(), url, assets: {}, api: [], ws: [], errors: [] };
  const counts = { assets: 0, api: 0, ws: 0, errors: 0 };
  const scenarios = (scenario === 'all') ? ['default','legacy','mobile'] : [scenario];

  const deriveFallback = (u) => {
    try { const x = new URL(u); x.pathname = x.pathname.replace(/\/es6\//i, '/').replace(/\.es6(\.[a-z]+)$/i, '$1'); return x.toString(); }
    catch { return u; }
  };

  for (const sc of scenarios) {
    await jlog({ phase: 'scenario.start', sc });

    const browser = await chromium.launch({
      headless: false, // для лучшего захвата WS
      args: [
        '--disable-blink-features=AutomationControlled',
        '--mute-audio',
      ]
    });
    const context = await browser.newContext({
      acceptDownloads: true,
      ignoreHTTPSErrors: true,
      viewport: sc === 'mobile' ? { width: 390, height: 780 } : { width: 1366, height: 768 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'Europe/Bucharest',
      javaScriptEnabled: true,
      serviceWorkers: 'allow',
      permissions: ['clipboard-read', 'clipboard-write'],
    });

    // CDP-сниффер для WS из iframe и WebWorkers
    let disposeCdp = null;
    if (attachCdpNetworkSniffer) {
      disposeCdp = await attachCdpNetworkSniffer(browser, outDir, manifest, counts);
    }

    // минимальная антибот-маскировка
    await context.addInitScript(() => {
      try { Object.defineProperty(navigator, 'webdriver', { get: () => false }); } catch {}
    });

    if (sc === 'legacy') {
      await context.addInitScript(() => {
        try { window.browserSupportsAllFeatures = () => false; } catch {}
        try { Object.defineProperty(window, 'SharedArrayBuffer', { get(){ return undefined; } }); } catch {}
      });
    }

    const page = await context.newPage();

    // === WebSocket хук: инжектируем до навигации ===
    await context.exposeBinding('__wsTap', async (_source, payload) => {
      try {
        // Группируем по URL соединения
        const u = new URL(payload.url);
        const baseDir = path.join(outDir, 'ws', safeName(u.host), ...u.pathname.split('/').map(safeName));
        const conn = payload.connId || 'unknown';

        const metaFile = path.join(baseDir, `${conn}.meta.json`);
        const logFile  = path.join(baseDir, `${conn}.ndjson`);

        if (payload.type === 'ws-open') {
          await fs.writeFile(metaFile, JSON.stringify({
            url: payload.url,
            origin: payload.origin,
            openedAt: payload.ts
          }, null, 2));
        } else if (payload.type === 'ws-frame') {
          // Сохраняем кадры: текст отдельно, бинарь — base64
          await appendNdjson(logFile, {
            ts: payload.ts,
            dir: payload.dir,
            opcode: payload.opcode,    // 1 – текст, 2 – бинарь
            text: payload.text ?? null,
            base64: payload.base64 ?? null
          });
        } else if (payload.type === 'ws-close' || payload.type === 'ws-error') {
          await appendNdjson(logFile, payload);
        }
      } catch (e) {
        // игнорируем ошибки хука
      }
    });

    // Инжектируем WebSocket хук во все фреймы
    await context.addInitScript({ path: path.resolve(__dirname, '../src/inject/ws-hook.js') });

    // === WebSocket: ловим на уровне контекста ===
    context.on('websocket', (ws) => {
      const rec = { url: ws.url(), frames: [], created: Date.now() };
      ws.on('framereceived', d => rec.frames.push({dir:'in',  t:Date.now(), opcode: typeof d==='string'?1:2, payload: typeof d==='string'? d : Buffer.from(d).toString('base64')}));
      ws.on('framesent',     d => rec.frames.push({dir:'out', t:Date.now(), opcode: typeof d==='string'?1:2, payload: typeof d==='string'? d : Buffer.from(d).toString('base64')}));
      ws.on('close', async () => {
        const out = path.join(wsDir, `${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
        await fs.writeFile(out, JSON.stringify(rec,null,2));
        manifest.ws.push({ url: rec.url, file: path.relative(outDir, out).replace(/\\/g,'/') });
        counts.ws++;
        await jlog({ ev: 'ws.saved', url: rec.url, frames: rec.frames.length });
      });
    });

    // === API/ассеты — вешаемся на context, не только page ===
    context.on('response', async (resp) => {
      try{
        const req = resp.request();
        const url = resp.url();
        const method = req.method();
        const status = resp.status();
        const headers = resp.headers();
        const ct = headers['content-type'] || headers['Content-Type'] || '';
        if (/^(data:|chrome-extension:)/i.test(url)) return;

        // тело
        let body = Buffer.alloc(0);
        try { body = await resp.body(); } catch {}

        // API?
        if (isProbablyApi(ct, url, method, status)) {
          let reqBody = null;
          try { reqBody = req.postDataBuffer(); } catch {}
          const record = {
            time: nowTs(),
            request: { method, url, headers: req.headers(), bodyB64: reqBody ? Buffer.from(reqBody).toString('base64') : null },
            response:{ status, headers, contentType: ct, bodyB64: Buffer.from(body).toString('base64') }
          };
          const fname = path.join(apiDir, `${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
          await fs.writeFile(fname, JSON.stringify(record,null,2));
          manifest.api.push({ url, urlNorm: normUrl(url), urlLoose: normUrlLoose(url), method, status,
            file: path.relative(outDir, fname).replace(/\\/g,'/') });
          counts.api++;
          return;
        }

        // ассеты (всё остальное)
        const hash = sha256(body);
        const ext  = pickExt(url, ct);
        const rel  = path.join('storage','assets', `${hash}.${ext}`);
        await writeFileIfChanged(path.join(outDir, rel), body);
        if (!manifest.assets[url]) {
          manifest.assets[url] = {
            path: rel.replace(/\\/g,'/'),
            sha256: hash,
            size: body.length,
            status, headers, contentType: ct
          };
          counts.assets++;
        }
      }catch(e){
        manifest.errors.push({ type:'response', url: resp.url(), message: String(e) }); counts.errors++;
      }
    });

    // === Network: отслеживание ошибок ===
    const failed = [];
    page.on('requestfailed', (req) => {
      failed.push({ url: req.url(), method: req.method(), failure: req.failure()?.errorText || 'failed' });
      jlog({ ev: 'requestfailed', url: req.url(), method: req.method(), err: req.failure()?.errorText });
    });

    // Навигация с явными таймаутами
    await jlog({ phase: 'goto', url });
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); }
    catch (e) { await jlog({ phase: 'goto.error', error: String(e) }); }

    try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}

    // Ждем выполнения JavaScript и появления iframe для автоматических игр
    try {
      // Ждем выполнения основного JavaScript
      await page.waitForTimeout(5000);
      
      // Принудительно выполняем JavaScript, который может создавать iframe
      await page.evaluate(() => {
        // Ищем функции, которые могут создавать iframe
        if (typeof window.loadScript === 'function') {
          try { window.loadScript('https://static.casino.guru/res/51b4b89e718381e2f9a228c43123b76ba/build/es6/appGame.es6.js'); } catch {}
        }
        // Ждем немного для выполнения
        return new Promise(resolve => setTimeout(resolve, 3000));
      });
      
      // Ждем появления iframe (может создаваться динамически)
      await page.waitForSelector('iframe', { timeout: 20000 }).catch(() => {});
      
      // Ждем загрузки iframe
      const iframes = page.locator('iframe');
      const count = await iframes.count().catch(() => 0);
      for (let i = 0; i < count; i++) {
        try {
          await iframes.nth(i).waitFor({ state: 'attached', timeout: 10000 });
          await page.waitForTimeout(5000); // Дополнительное время для загрузки контента iframe
        } catch {}
      }
      
      // Для автоматических игр - ждем первый раунд (10+ секунд)
      await page.waitForTimeout(15000);
      
      // Ждем загрузки ресурсов iframe
      try {
        const frames = page.frames();
        for (const frame of frames) {
          const frameUrl = frame.url();
          if (frameUrl && !frameUrl.startsWith('about:') && frameUrl.includes('staging.playzia.com')) {
            console.log('Waiting for iframe resources:', frameUrl);
            // Ждем загрузки ресурсов iframe
            await frame.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
            await page.waitForTimeout(5000); // Дополнительное время
            
            // Принудительно загружаем ресурсы iframe
            const baseUrl = frameUrl.replace(/\/[^\/]*$/, '/');
            const iframeResources = [
              'wrapper.css',
              'js/jquery.min.js', 
              'js/wrapper.js'
            ];
            
            for (const resource of iframeResources) {
              const fullUrl = baseUrl + resource;
              try {
                console.log('Fetching iframe resource:', fullUrl);
                await context.request.get(fullUrl, { timeout: 10000 });
              } catch (e) {
                console.log('Failed to fetch iframe resource:', fullUrl, e.message);
              }
            }
          }
        }
      } catch {}
    } catch {}

    // Авто-интерактивность (в т.ч. клики внутрь iframe)
    let stopInteract = null;
    if (interact === 'auto') { 
      try { 
        stopInteract = await autoInteract(page, { everyMs: 4000, iframeHints: ['staging.', 'turbogames.'] });
        // Дополнительное время для загрузки контента после интерактивности
        await page.waitForTimeout(10000);
      } catch {} 
    }

    // Принудительная догрузка fallback-бандлов
    if (loadAll) {
      try {
        await page.evaluate(() => {
          const load = (u) => new Promise(res => {
            const s = document.createElement('script');
            s.src = u; s.async = true; s.onload = s.onerror = () => res();
            document.head.appendChild(s);
          });
          const deriveFallback = (u) => {
            try { const x = new URL(u, location.href);
              x.pathname = x.pathname.replace(/\/es6\//i, '/').replace(/\.es6(\.[a-z]+)$/i, '$1');
              return x.toString();
            } catch { return u; }
          };
          const tasks = [];
          document.querySelectorAll('script[src]').forEach(scr => {
            const src = scr.getAttribute('src');
            if (/\/es6\/.+\.es6\.js(\?|#|$)/i.test(src)) {
              const fb = deriveFallback(src);
              if (fb !== src) tasks.push(load(fb));
            }
          });
          if (typeof window.loadScript === 'function' && !window.__patchedLoadScript) {
            const orig = window.loadScript;
            window.loadScript = function(u, cb) {
              try { const fb = deriveFallback(u); if (fb !== u) return orig.call(window, u, () => orig.call(window, fb, cb)); }
              catch {}
              return orig.apply(window, arguments);
            };
            window.__patchedLoadScript = true;
          }
          return Promise.allSettled(tasks);
        });
      } catch {}
    }

    // Жёсткий watchdog — ждём ровно harvestMs
    await jlog({ phase: 'harvest.start', ms: harvestMs });
    await new Promise(r => setTimeout(r, harvestMs));

    // Ретраи неуспешных GET (в обход CSP/CORS)
    for (const f of failed) {
      if (f.method !== 'GET') continue;
      try {
        const r1 = await context.request.get(f.url, { timeout: 15000 });
        if (r1.ok()) {
          const buf = Buffer.from(await r1.body());
          const ct = r1.headers()['content-type'] || '';
          const hash = sha256(buf);
          const ext = pickExt(f.url, ct);
          const rel = path.join('storage', 'assets', `${hash}.${ext}`);
          await writeFileIfChanged(path.join(outDir, rel), buf);
          if (!manifest.assets[f.url]) {
            manifest.assets[f.url] = {
              path: rel.replace(/\\/g,'/'),
              sha256: hash,
              size: buf.length,
              status: r1.status(),
              headers: r1.headers(),
              contentType: ct
            };
            counts.assets++;
          }
          await jlog({ ev: 'retry.saved', url: f.url, status: r1.status() });
        } else {
          await jlog({ ev: 'retry.fail', url: f.url, status: r1.status() });
        }
      } catch (e) {
        manifest.errors.push({ type: 'retry', url: f.url, error: String(e) });
        counts.errors++;
        await jlog({ ev: 'retry.error', url: f.url, error: String(e) });
      }
    }

    await jlog({ phase: 'scenario.end', sc });

    // Закрытие
    try { stopInteract?.(); } catch {}
    try { disposeCdp?.(); } catch {}
    try { await context.close(); } catch {}
    try { await browser.close(); } catch {}
  }

  // manifest — всегда в конце
  try {
    await fs.writeFile(path.join(outDir, 'manifest.json'), safeJson(manifest));
    await jlog({ phase: 'manifest.saved', counts });
  } catch (e) {
    await jlog({ phase: 'manifest.error', error: String(e) });
  }

  return { counts, outDir };
}
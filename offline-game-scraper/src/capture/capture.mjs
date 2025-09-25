// src/capture/capture.mjs
import path from 'node:path';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { sha256, ensureDir, safeJson, isProbablyApi, pickExt, writeFileIfChanged, nowTs } from './util.mjs';
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
  appendNdjson
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
      headless,
      args: ['--disable-blink-features=AutomationControlled'],
    });
    const context = await browser.newContext({
      acceptDownloads: true,
      ignoreHTTPSErrors: true,
      viewport: sc === 'mobile' ? { width: 390, height: 780 } : { width: 1600, height: 900 },
      userAgent: sc === 'mobile'
        ? 'Mozilla/5.0 (Linux; Android 11; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      javaScriptEnabled: true,
      serviceWorkers: 'allow',
    });

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
      const rec = { url: ws.url(), frames:[], created: Date.now() };
      ws.on('framereceived', d => rec.frames.push({dir:'in', t:Date.now(), dataType: typeof d, payload: typeof d==='string'? d : Buffer.from(d).toString('base64')}));
      ws.on('framesent', d => rec.frames.push({dir:'out',t:Date.now(), dataType: typeof d, payload: typeof d==='string'? d : Buffer.from(d).toString('base64')}));
      ws.on('close', async () => {
        const out = path.join(wsDir, `${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
        await fs.writeFile(out, JSON.stringify(rec, null, 2));
        manifest.ws.push({ url: rec.url, file: path.relative(outDir, out).replace(/\\/g,'/')});
        counts.ws++;
        await jlog({ ev: 'ws.saved', url: rec.url, frames: rec.frames.length });
      });
    });

    // === API: ловим на уровне контекста (включая cross-origin iframe) ===
    context.on('response', async (resp) => {
      try {
        const req = resp.request();
        const url = resp.url();
        const type = req.resourceType();
        const ct = (resp.headers()['content-type'] || '').toLowerCase();
        
        // считаем API любые XHR/fetch ИЛИ JSON не из каталога assets/renderer/build/…
        const isX = (type==='xhr' || type==='fetch');
        const isJson = ct.includes('application/json');
        if (!isX && !isJson) return;

        const u = new URL(url);
        const body = await resp.body().catch(() => null);

        // Куда сохранять
        const baseDir = path.join(outDir, 'api', safeName(u.host), ...u.pathname.split('/').map(safeName));
        const leaf = u.search ? safeName(u.search) : '';
        const ext = ct.includes('json') ? '.json' : (ct.includes('text') ? '.txt' : '.bin');
        const file = path.join(baseDir, (leaf || 'index') + ext);

        await fs.mkdir(path.dirname(file), { recursive: true });
        if (body) await fs.writeFile(file, body);

        // мета на всякий случай
        const meta = {
          method: req.method(),
          status: resp.status(),
          headers: resp.headers(),
          ct,
          url
        };
        await fs.writeFile(file + '.meta.json', JSON.stringify(meta, null, 2));
        
        // Добавить в manifest.api
        manifest.api.push({
          url: url,
          method: req.method(),
          status: resp.status(),
          file: path.relative(outDir, file).replace(/\\/g,'/')
        });
        
        // Обновляем счетчики
        counts.api++;
        await jlog({ ev: 'api.saved', url, method: req.method(), status: resp.status(), file });
      } catch (e) {
        await jlog({ ev: 'api.error', error: String(e) });
      }
    });

    // === Network: сбор ассетов (не API/WS) ===
    const failed = [];
    page.on('requestfailed', (req) => {
      failed.push({ url: req.url(), method: req.method(), failure: req.failure()?.errorText || 'failed' });
      jlog({ ev: 'requestfailed', url: req.url(), method: req.method(), err: req.failure()?.errorText });
    });

    page.on('response', async (resp) => {
      const req = resp.request();
      const method = req.method();
      const absUrl = req.url();
      try {
        const status = resp.status();
        const headers = resp.headers();
        const contentType = headers['content-type'] || headers['Content-Type'] || '';

        if (/^(data:|chrome-extension:)/i.test(absUrl)) return;

        // тело ответа
        let body; try { body = await resp.body(); } catch { body = Buffer.alloc(0); }

        // Только ассеты (API и WS обрабатываются хуками выше)
        const hash = sha256(body);
        const ext = pickExt(absUrl, contentType);
        const rel = path.join('storage', 'assets', `${hash}.${ext}`);
        await writeFileIfChanged(path.join(outDir, rel), body);
        if (!manifest.assets[absUrl]) {
          manifest.assets[absUrl] = {
            path: rel.replace(/\\/g,'/'),
            sha256: hash,
            size: body.length,
            status,
            headers,
            contentType
          };
          counts.assets++;
        }
      } catch (e) {
        manifest.errors.push({ type: 'response', url: absUrl, message: String(e) });
        counts.errors++;
        await jlog({ ev: 'error.response', url: absUrl, error: String(e) });
      }
    });

    // Навигация с явными таймаутами
    await jlog({ phase: 'goto', url });
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); }
    catch (e) { await jlog({ phase: 'goto.error', error: String(e) }); }

    try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}

    // Авто-интерактивность (в т.ч. клики внутрь iframe)
    if (interact === 'auto') { try { await autoInteract(page); } catch {} }

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
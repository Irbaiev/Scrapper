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
  interact = 'auto',         // auto | off
  loadAll = false            // принудительно догружать fallback-скрипты
} = {}) {

  // ==== подготовка папок + лог ====
  const storageDir = path.join(outDir, 'storage');
  const assetsDir = path.join(storageDir, 'assets');
  const apiDir = path.join(storageDir, 'api');
  const wsDir = path.join(storageDir, 'ws');
  const logsDir = path.join(outDir, 'logs');
  await ensureDir(assetsDir); await ensureDir(apiDir); await ensureDir(wsDir); await ensureDir(logsDir);
  const logPath = path.join(logsDir, `capture-${Date.now()}.ndjson`);
  const jlog = async (obj) => {
    try { await fs.appendFile(logPath, JSON.stringify({ t: Date.now(), ...obj }) + '\n'); } catch {}
  };

  const manifest = { createdAt: nowTs(), url, assets: {}, api: [], ws: [], errors: [] };
  const counts = { assets: 0, api: 0, ws: 0, errors: 0 };

  const scenarios = (scenario === 'all') ? ['default', 'legacy', 'mobile'] : [scenario];

  // helper: сделать из ES6 пути fallback-путь
  function deriveFallback(u) {
    try {
      const x = new URL(u);
      x.pathname = x.pathname.replace(/\/es6\//i, '/').replace(/\.es6(\.[a-z]+)$/i, '$1');
      return x.toString();
    } catch { return u; }
  }

  // ==== цикл по сценариям ====
  for (const sc of scenarios) {
    await jlog({ phase: 'scenario.start', sc });

    // харденинг против антибота + стабильное закрытие
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
    });

    // убираем navigator.webdriver
    await context.addInitScript(() => {
      try { Object.defineProperty(navigator, 'webdriver', { get: () => false }); } catch {}
    });

    // Legacy: насильно включаем fallback-бандлы
    if (sc === 'legacy') {
      await context.addInitScript(() => {
        try { window.browserSupportsAllFeatures = () => false; } catch {}
        try { Object.defineProperty(window, 'SharedArrayBuffer', { get(){ return undefined; } }); } catch {}
      });
    }

    const page = await context.newPage();

    // ===== WS: ловим на всём контексте (включая cross-origin iframes) =====
    const wsRecs = [];
    const wsHandler = (ws) => {
      const rec = { url: ws.url(), frames: [], created: Date.now(), scenario: sc };
      ws.on('framereceived', (data) => {
        rec.frames.push({ dir: 'in', t: Date.now(), payload: typeof data === 'string' ? data : data.toString('base64'), opcode: typeof data === 'string' ? 1 : 2 });
      });
      ws.on('framesent', (data) => {
        rec.frames.push({ dir: 'out', t: Date.now(), payload: typeof data === 'string' ? data : data.toString('base64'), opcode: typeof data === 'string' ? 1 : 2 });
      });
      ws.on('close', () => { rec.closed = true; });
      wsRecs.push(rec);
    };
    context.on('websocket', wsHandler);

    // ===== сетевые ответы =====
    const failed = [];
    page.on('requestfailed', (req) => {
      failed.push({ url: req.url(), method: req.method(), failure: req.failure()?.errorText || 'failed' });
      jlog({ type: 'requestfailed', url: req.url(), method: req.method(), err: req.failure()?.errorText });
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

        // финализируем тело (без зависаний)
        let body;
        try { body = await resp.body(); } catch { body = Buffer.alloc(0); }

        // API
        if (isProbablyApi(contentType, absUrl, method, status)) {
          const reqBody = await req.postDataBuffer().catch(() => null);
          const record = {
            time: nowTs(),
            request: { method, url: absUrl, headers: req.headers(), bodyB64: reqBody ? Buffer.from(reqBody).toString('base64') : null },
            response: { status, headers, contentType, bodyB64: Buffer.from(body).toString('base64') }
          };
          const fname = path.join(apiDir, `${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
          await fs.writeFile(fname, safeJson(record));
          manifest.api.push({ file: path.relative(outDir, fname).replace(/\\/g, '/'), url: absUrl, method, status });
          counts.api++;
          await jlog({ type: 'api.saved', url: absUrl, method, status, file: fname });
          return; // ВАЖНО: без удаления из какого-либо pending (мы его больше не ведём)
        }

        // ассеты
        const hash = sha256(body);
        const ext = pickExt(absUrl, contentType);
        const rel = path.join('storage', 'assets', `${hash}.${ext}`);
        const filepath = path.join(outDir, rel);
        await writeFileIfChanged(filepath, body);
        if (!manifest.assets[absUrl]) {
          manifest.assets[absUrl] = {
            path: rel.replace(/\\/g, '/'),
            sha256: hash,
            size: body.length,
            status,
            headers,
            contentType
          };
          counts.assets++;
        }
      } catch (e) {
        manifest.errors.push({ type: 'response', url: absUrl, message: String(e) }); counts.errors++;
        await jlog({ type: 'error.response', url: absUrl, error: String(e) });
      }
    });

    // ===== навигация с жёсткими таймаутами =====
    await jlog({ phase: 'goto', url });
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
      await jlog({ phase: 'goto.error', error: String(e) });
    }
    try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}

    // ===== авто-интерактивность для запуска WS/API =====
    if (interact === 'auto') {
      try { await autoInteract(page); } catch {}
    }

    // ===== принудительная догрузка fallback-бандлов =====
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
          // патчим loadScript если есть
          if (typeof window.loadScript === 'function' && !window.__patchedLoadScript) {
            const orig = window.loadScript;
            window.loadScript = function(u, cb) {
              try {
                const fb = deriveFallback(u);
                if (fb !== u) return orig.call(window, u, () => orig.call(window, fb, cb));
              } catch {}
              return orig.apply(window, arguments);
            };
            window.__patchedLoadScript = true;
          }
          return Promise.allSettled(tasks);
        });
      } catch {}
    }

    // ===== жёсткий watchdog, чтобы точно закрыть браузер =====
    await jlog({ phase: 'harvest.start', ms: harvestMs });
    const watchdog = new Promise(res => setTimeout(res, harvestMs));
    await watchdog; // гарантированно ждём

    // ===== ретраи неуспешных GET (в обход CORS) =====
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
              path: rel.replace(/\\/g, '/'),
              sha256: hash,
              size: buf.length,
              status: r1.status(),
              headers: r1.headers(),
              contentType: ct
            };
            counts.assets++;
          }
          await jlog({ type: 'retry.saved', url: f.url, status: r1.status() });
        } else {
          await jlog({ type: 'retry.fail', url: f.url, status: r1.status() });
        }
      } catch (e) {
        manifest.errors.push({ type: 'retry', url: f.url, error: String(e) }); counts.errors++;
        await jlog({ type: 'retry.error', url: f.url, error: String(e) });
      }
    }

    // ===== сохранение WS дампов из всего контекста =====
    let idx = 0;
    for (const rec of wsRecs) {
      const fname = path.join(wsDir, `${Date.now()}_${sc}_${++idx}.json`);
      await fs.writeFile(fname, safeJson(rec));
      manifest.ws.push({ file: path.relative(outDir, fname).replace(/\\/g, '/'), url: rec.url });
      counts.ws++;
    }
    await jlog({ phase: 'scenario.end', sc, ws: wsRecs.length });

    // ===== чистое закрытие =====
    try { await context.close(); } catch {}
    try { await browser.close(); } catch {}
  }

  // ===== запись манифеста ВСЕГДА (даже при ошибках выше) =====
  try {
    await fs.writeFile(path.join(outDir, 'manifest.json'), safeJson(manifest));
    await jlog({ phase: 'manifest.saved', counts });
  } catch (e) {
    await jlog({ phase: 'manifest.error', error: String(e) });
  }

  return { counts, outDir };
}
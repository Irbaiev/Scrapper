import path from 'node:path';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { sha256, ensureDir, safeJson, isProbablyApi, pickExt, writeFileIfChanged, nowTs } from './util.mjs';

export async function capture(url, { outDir, harvestMs = 12000, headless = true } = {}) {
  const storageDir = path.join(outDir, 'storage');
  const assetsDir = path.join(storageDir, 'assets');
  const apiDir = path.join(storageDir, 'api');
  const wsDir = path.join(storageDir, 'ws');
  await ensureDir(assetsDir);
  await ensureDir(apiDir);
  await ensureDir(wsDir);

  const manifest = {
    createdAt: nowTs(),
    url,
    assets: {},        // absUrl -> { path, sha256, size, status, headers, contentType }
    api: [],           // массив { request, response }
    ws: [],            // массив { url, frames: [...], closed: true, closeCode?, closeReason? }
    errors: [],
  };

  let counts = { assets: 0, api: 0, ws: 0 };

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    acceptDownloads: true,
    ignoreHTTPSErrors: true,
    // эмулируем типичный десктоп
    viewport: { width: 1600, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    javaScriptEnabled: true,
  });

  // CDP для WebSocket - включаем ДО создания страницы
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Page.enable');

  const wsById = new Map();
  client.on('Network.webSocketCreated', (e) => {
    console.log('[capture] WebSocket created:', e.url);
    wsById.set(e.requestId, { url: e.url, frames: [], created: Date.now() });
  });
  client.on('Network.webSocketFrameSent', (e) => {
    const entry = wsById.get(e.requestId);
    if (entry) entry.frames.push({ dir: 'out', t: Date.now(), payload: e.response.payloadData, opcode: e.response.opcode });
  });
  client.on('Network.webSocketFrameReceived', (e) => {
    const entry = wsById.get(e.requestId);
    if (entry) entry.frames.push({ dir: 'in', t: Date.now(), payload: e.response.payloadData, opcode: e.response.opcode });
  });
  client.on('Network.webSocketClosed', (e) => {
    const entry = wsById.get(e.requestId);
    if (entry) entry.closed = true;
  });

  const pendingResponses = new Set();

  page.on('response', async (resp) => {
    try {
      const req = resp.request();
      const method = req.method();
      const absUrl = req.url();
      const status = resp.status();
      const headers = resp.headers();
      const contentType = headers['content-type'] || headers['Content-Type'] || '';

      // игнорируем data: и chrome-extension:
      if (/^(data:|chrome-extension:)/i.test(absUrl)) return;

      // ждём завершения
      pendingResponses.add(resp);
      await resp.finished();

      let body;
      try { body = await resp.body(); } catch { body = Buffer.alloc(0); }

      // сохраняем API отдельно (для будущих моков)
      if (isProbablyApi(contentType, absUrl, method, status)) {
        console.log('[capture] API detected:', method, absUrl, status);
        const reqBody = await req.postDataBuffer().catch(() => null);
        const record = {
          time: nowTs(),
          request: { method, url: absUrl, headers: req.headers(), bodyB64: reqBody ? Buffer.from(reqBody).toString('base64') : null },
          response: { status, headers, contentType, bodyB64: Buffer.from(body).toString('base64') }
        };
        const fname = path.join(apiDir, `${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
        await fs.writeFile(fname, safeJson(record));
        manifest.api.push({ file: path.relative(outDir, fname), url: absUrl, method, status });
        counts.api++;
        console.log('[capture] API saved:', counts.api);
        pendingResponses.delete(resp);
        return;
      }

      // сохраняем ассет
      const hash = sha256(body);
      const ext = pickExt(absUrl, contentType);
      const rel = path.join('storage', 'assets', `${hash}.${ext}`);
      const filepath = path.join(outDir, rel);
      await writeFileIfChanged(filepath, body);

      manifest.assets[absUrl] = {
        path: rel.replace(/\\/g, '/'),
        sha256: hash,
        size: body.length,
        status,
        headers,
        contentType
      };
      counts.assets++;
    } catch (e) {
      manifest.errors.push({ type: 'response', message: String(e) });
    } finally {
      pendingResponses.delete(resp);
    }
  });

  // Загружаем страницу и ждём активность
  console.log('[capture] Loading page:', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  
  // Обрабатываем все iframe для WebSocket'ов
  const frames = page.frames();
  console.log('[capture] Found', frames.length, 'frames');
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    try {
      console.log('[capture] Frame', i, 'URL:', frame.url());
      // CDP уже включен для основной страницы, WebSocket'ы должны детектироваться
    } catch (e) {
      console.log('[capture] Frame error:', e.message);
    }
  }
  
  // подождём первичную сеть/рендер
  console.log('[capture] Waiting for network idle...');
  try { await page.waitForLoadState('networkidle', { timeout: 10000 }); } catch {}
  
  console.log('[capture] Harvesting for', harvestMs, 'ms...');
  // затем даём игре «пожить» и послать всё что хочет
  try {
    await Promise.race([
      page.waitForTimeout(harvestMs),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Harvest timeout')), harvestMs + 5000))
    ]);
  } catch (e) {
    console.log('[capture] Harvest interrupted:', e.message);
  }

  // дождаться всех pending
  if (pendingResponses.size) {
    await Promise.allSettled([...pendingResponses].map(r => r.finished().catch(() => {})));
  }

  // Сохраняем WebSocket дампы
  let wsCount = 0;
  for (const entry of wsById.values()) {
    const fname = path.join(wsDir, `${++wsCount}_${Date.now()}.json`);
    await fs.writeFile(fname, safeJson({ url: entry.url, created: entry.created, frames: entry.frames, closed: !!entry.closed }));
    manifest.ws.push({ file: path.relative(outDir, fname), url: entry.url });
  }
  counts.ws = wsCount;

  // Финальный дамп манифеста
  console.log('[capture] Saving manifest...');
  await fs.writeFile(path.join(outDir, 'manifest.json'), safeJson(manifest));
  console.log('[capture] Done!');

  // await context.close();
  // await browser.close();

  try { 
    await context.close(); 
  } catch (e) {
    console.log('[capture] Context close error:', e.message);
  }
  try { 
    await browser.close(); 
  } catch (e) {
    console.log('[capture] Browser close error:', e.message);
  }

  return { counts, outDir };
}

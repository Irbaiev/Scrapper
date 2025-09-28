// node tools/capture-playwright.js --url <URL> --out capture/bananza
const { chromium } = require('playwright');
const fs = require('fs'); 
const path = require('path'); 
const m = require('minimist');

(async () => {
  const { url, out = 'capture/bananza' } = m(process.argv.slice(2));
  if (!url) throw new Error('--url required');
  fs.mkdirSync(out, { recursive: true });

  const browser = await chromium.launch({ headless: false }); // Показываем браузер
  const context = await browser.newContext({ 
    recordHar: { path: path.join(out, 'bananza.har') },
    // Отключаем блокировку ресурсов
    ignoreHTTPSErrors: true,
    bypassCSP: true
  });
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Network.enable');
  const cdpEvents = [];
  for (const ev of ['Network.requestWillBeSent', 'Network.responseReceived', 'Network.webSocketCreated', 'Network.webSocketFrameSent', 'Network.webSocketFrameReceived']) {
    client.on(ev, (data) => cdpEvents.push({ ev, data, ts: Date.now() }));
  }

  // Отключаем блокировку рекламы и трекинга
  await page.route('**/*', route => route.continue());
  
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  
  // Ждем загрузки игры
  await page.waitForTimeout(10000);
  
  // Пытаемся найти и кликнуть на кнопку Play если есть
  try {
    await page.click('button:has-text("Play"), .play-button, [data-testid="play-button"]', { timeout: 5000 });
    await page.waitForTimeout(5000);
  } catch (e) {
    console.log('Play button not found or already playing');
  }

  await context.close();
  await browser.close();
  fs.writeFileSync(path.join(out, 'bananza.cdp.json'), JSON.stringify(cdpEvents, null, 2));
  console.log('Saved HAR+CDP to', out);
})();

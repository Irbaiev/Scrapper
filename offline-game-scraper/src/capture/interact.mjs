// src/capture/interact.mjs
export async function autoInteract(page, { everyMs = 5000, iframeHints = [] } = {}) {
  // 1) первичный user-gesture (клик/фокус) — некоторые движки без этого не открывают WS
  try {
    await page.bringToFront();
    await page.mouse.move(50, 50);
    await page.mouse.down(); await page.mouse.up();
    await page.keyboard.press('Space');
  } catch {}

  // 2) каждые N секунд «шевелим» мышь и кликаем безопасную область
  const jiggle = setInterval(async () => {
    try {
      const box = await page.viewportSize();
      if (!box) return;
      const x = 40 + Math.floor(Math.random()*80);
      const y = 40 + Math.floor(Math.random()*80);
      await page.mouse.move(x, y);
      await page.mouse.down(); await page.mouse.up();
      await page.keyboard.press('ArrowRight');
    } catch {}
  }, everyMs);

  // 3) ждём и кликаем по iframe-ам
  const clickInsideIframes = async () => {
    try {
      const frames = page.frames();
      for (const fr of frames) {
        const url = fr.url() || '';
        // если есть хинты — приоритезируем (например, ['staging.playzia.com', 'turbogames.io'])
        if (iframeHints.length && !iframeHints.some(h => url.includes(h))) continue;
        const body = await fr.$('body');
        if (body) {
          await body.click({ trial: true }).catch(()=>{});
          await fr.evaluate(() => {
            document.documentElement.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          }).catch(()=>{});
        }
      }
    } catch {}
  };

  const watcher = setInterval(clickInsideIframes, 3000);

  // 4) Очевидные кнопки на топ-странице (если есть)
  const selectors = [
    'button:has-text("Play")', 'button:has-text("Start")', 'button:has-text("Spin")',
    'button[autofocus]', '[role="button"]:not([disabled])', '.start-button', '.play', '.spin'
  ];
  for (const s of selectors) {
    const el = await page.$(s).catch(()=>null);
    if (el) { try { await el.click({ timeout: 1000 }); } catch {} }
  }

  // 5) Координатные клики в каждый iframe (универсально для любого домена)
  const iframes = page.locator('iframe');
  const count = await iframes.count().catch(()=>0);
  for (let i = 0; i < count; i++) {
    const handle = await iframes.nth(i).elementHandle().catch(()=>null);
    if (!handle) continue;
    const box = await handle.boundingBox().catch(()=>null);
    if (!box || box.width < 10 || box.height < 10) continue;

    const cx = Math.round(box.x + box.width / 2);
    const cy = Math.round(box.y + box.height / 2);

    // Несколько кликов + скролл внутри iframe
    try { await page.mouse.click(cx, cy, { clickCount: 1 }); } catch {}
    try { await page.mouse.click(cx, cy, { clickCount: 2 }); } catch {}
    try { await page.mouse.wheel(0, 200); } catch {}
    // ещё раз через секунду
    await page.waitForTimeout(800).catch(()=>{});
    try { await page.mouse.click(cx, cy, { clickCount: 1 }); } catch {}
  }

  // 6) Немного «жизни» в окне
  const v = page.viewportSize() || { width: 1200, height: 800 };
  await page.mouse.move(v.width/2+40, v.height/2+20);
  await page.mouse.wheel(0, 200);

  return () => { clearInterval(jiggle); clearInterval(watcher); };
}

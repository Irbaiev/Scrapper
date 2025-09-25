// src/capture/interact.mjs
export async function autoInteract(page) {
  try {
    // Базовая «разблокировка»
    await page.mouse.move(100, 100);
    await page.keyboard.down(' '); await page.keyboard.up(' ');
    await page.keyboard.press('Enter');

    // Очевидные кнопки на топ-странице (если есть)
    const selectors = [
      'button:has-text("Play")', 'button:has-text("Start")', 'button:has-text("Spin")',
      'button[autofocus]', '[role="button"]:not([disabled])', '.start-button', '.play', '.spin'
    ];
    for (const s of selectors) {
      const el = await page.$(s).catch(()=>null);
      if (el) { try { await el.click({ timeout: 1000 }); } catch {} }
    }

    // Координатные клики в каждый iframe (универсально для любого домена)
    // кликаем 2-3 раза по центру и скроллим — это обычно достаточно, чтобы
    // игра инициировала WS / API / аудио.
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

    // Немного «жизни» в окне
    const v = page.viewportSize() || { width: 1200, height: 800 };
    await page.mouse.move(v.width/2+40, v.height/2+20);
    await page.mouse.wheel(0, 200);
  } catch {}
}

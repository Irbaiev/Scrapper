export async function autoInteract(page) {
  try {
    // Разблокировка аудио/входа
    await page.mouse.move(100, 100);
    await page.keyboard.down(' '); await page.keyboard.up(' ');
    await page.keyboard.press('Enter');

    // Клики по "очевидным" кнопкам
    const selectors = [
      'button:has-text("Play")', 'button:has-text("Start")', 'button:has-text("Spin")',
      'button[autofocus]', '[role="button"]:not([disabled])', '.start-button', '.play', '.spin'
    ];
    for (const s of selectors) {
      const el = await page.$(s).catch(()=>null);
      if (el) { try { await el.click({ timeout: 1000 }); } catch {} }
    }

    // Клик по центру холста
    const v = page.viewportSize() || { width: 1200, height: 800 };
    await page.mouse.click(Math.floor(v.width/2), Math.floor(v.height/2));

    // Немного "жизни"
    await page.mouse.move(v.width/2+50, v.height/2+30);
    await page.mouse.wheel(0, 200);
  } catch {}
}

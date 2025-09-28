// node tools/validate-playwright.js --url http://localhost:8080/index.html --out logs/diag.json
import { chromium } from 'playwright'; 
import fs from 'fs'; 
import path from 'path';
import m from 'minimist';

(async()=>{
  const { url, out='logs/diag.json' } = m(process.argv.slice(2));
  fs.mkdirSync(path.dirname(out), { recursive:true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const allowed = new URL(url).origin;
  const report = { externalBlocked:[], responses:[], errors:[], console:[], chunks:[] };

  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(allowed) || u.startsWith('file://')) return route.continue();
    report.externalBlocked.push(u); 
    return route.abort();
  });
  page.on('response', r => report.responses.push({url:r.url(), status:r.status()}));
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', msg => { if (msg.type()==='error') report.console.push(msg.text()); });
  page.on('requestfailed', r => { 
    const et=r.failure()?.errorText||''; 
    if (/ChunkLoadError|chunk/i.test(et)) report.chunks.push(r.url()); 
  });

  try { 
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }); 
    await page.waitForTimeout(3000); 
  } catch(e) { 
    report.errors.push('goto: '+e.message); 
  }
  await browser.close();
  fs.writeFileSync(out, JSON.stringify(report,null,2));
  const has404 = report.responses.some(r=>r.status>=400);
  if (report.externalBlocked.length || has404 || report.errors.length || report.console.length || report.chunks.length) {
    console.error('❌ OFFLINE VALIDATION FAILED\n', JSON.stringify({
      external: report.externalBlocked.length, 
      http4xx5xx: has404, 
      errors: report.errors.length, 
      console: report.console.length, 
      chunks: report.chunks.length
    }, null, 2));
    process.exit(2);
  }
  console.log('✅ Offline validation passed');
})();

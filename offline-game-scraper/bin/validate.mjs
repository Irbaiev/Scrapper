#!/usr/bin/env node
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

function parseArgs(argv){ const a={}; for(let i=2;i<argv.length;i++){ const t=argv[i]; if(t.startsWith('--')){ const k=t.slice(2); const v=(i+1<argv.length && !argv[i+1].startsWith('--'))? argv[++i]: true; a[k]=v; } } return a; }
const sleep = (ms)=> new Promise(r=> setTimeout(r, ms));

async function main(){
  const args = parseArgs(process.argv);
  const url = String(args.url||'http://localhost:4173');
  const seconds = Number(args.seconds||20);
  const failOnExternal = Boolean(args['fail-on-external']);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 900 } });

  const external = [];
  const consoleErrors = [];
  const requests = [];

  // Блок/лог внешних доменов
  await context.route('**/*', (route)=>{
    const req = route.request();
    const reqUrl = new URL(req.url());
    const pageUrl = route.request().frame()?.page()?.url();
    let sameOrigin = false;
    try{ const p = new URL(pageUrl); sameOrigin = (p.origin === reqUrl.origin); }catch{}
    if(!sameOrigin){
      external.push({ url: req.url(), method: req.method() });
      if(failOnExternal) return route.abort();
    }
    return route.continue();
  });

  const page = await context.newPage();

  page.on('console', (msg)=>{
    if(['error','warning'].includes(msg.type())) consoleErrors.push({ type: msg.type(), text: msg.text() });
  });
  page.on('request', (req)=>{ requests.push({ url: req.url(), method: req.method() }); });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  try{ await page.waitForLoadState('networkidle', { timeout: 10000 }); }catch{}
  await sleep(seconds * 1000);

  await page.screenshot({ path: 'validate-screenshot.png', fullPage: true });

  const report = { url, seconds, totals: { requests: requests.length, external: external.length, consoleErrors: consoleErrors.length }, external, consoleErrors };
  await fs.writeFile('validate-report.json', JSON.stringify(report, null, 2));

  await context.close();
  await browser.close();

  console.log('[validate] ok');
  if(failOnExternal && external.length){ process.exit(1); }
}

main().catch(e=>{ console.error('[validate] error', e); process.exit(1); });

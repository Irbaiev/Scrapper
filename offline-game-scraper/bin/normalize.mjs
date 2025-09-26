#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const cap = process.argv[2] || './_cap';

(async ()=>{
  const manPath = path.join(cap, 'manifest.json');
  const m = JSON.parse(await fs.readFile(manPath,'utf8'));
  const capRoot = path.dirname(manPath);

  // 1) meta viewport в HTML
  const htmlMeta = m.assets[m.url];
  if (htmlMeta) {
    const p = path.join(capRoot, htmlMeta.path);
    let s = await fs.readFile(p, 'utf8');
    s = s.replace(/(<meta\s+name=["']viewport["']\s+content=["'])([^"']+)(["'])/i,
      (m, a, content, z)=> a + content.replace(/;\s*/g, ', ') + z);
    await fs.writeFile(p, s);
  }

  // 2) единый токен
  const TOKEN_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/ig;
  let token = null;
  for (const a of (m.api||[])) {
    if (!/\/connect/i.test(a.url)) continue;
    const rec = JSON.parse(await fs.readFile(path.join(capRoot, a.file),'utf8'));
    const body = rec.response?.bodyB64 ? Buffer.from(rec.response.bodyB64, 'base64').toString('utf8') : '';
    try { const j = JSON.parse(body||'{}'); if (j.token){ token = j.token; break; } } catch {}
  }
  if (token) {
    // пройдёмся по JSON-ассетам
    for (const [abs, meta] of Object.entries(m.assets||{})) {
      if (!/\.json(\?|$)/i.test(abs)) continue;
      const p = path.join(capRoot, meta.path);
      try {
        const s = await fs.readFile(p,'utf8');
        const s2 = s.replace(TOKEN_RE, token);
        if (s2 !== s) await fs.writeFile(p,s2);
      } catch {}
    }
  }

  // 3) заглушки .map (частый источник 404 → чёрный экран в devtools)
  for (const [abs, meta] of Object.entries(m.assets||{})) {
    if (!/\.js(\?|$)/i.test(abs)) continue;
    const p = path.join(capRoot, meta.path);
    try {
      const s = await fs.readFile(p, 'utf8');
      const m1 = s.match(/\/\/# sourceMappingURL=([^\s]+)/);
      if (m1) {
        const mapRel = m1[1].split('?')[0];
        const mapAbs = path.join(path.dirname(p), mapRel);
        await fs.mkdir(path.dirname(mapAbs), { recursive: true });
        await fs.writeFile(mapAbs, '{}').catch(()=>{});
      }
    } catch {}
  }

  console.log('[normalize] done for', cap);
})();


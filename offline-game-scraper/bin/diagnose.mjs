#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const cap = process.argv[2] || './_cap';
const out = process.argv[3] || './_report';

(async ()=>{
  await fs.mkdir(out, { recursive: true });
  const manPath = path.join(cap, 'manifest.json');
  const exists = await fs.stat(manPath).catch(()=>null);
  if (!exists) { console.error('no manifest.json in', cap); process.exit(1); }
  const m = JSON.parse(await fs.readFile(manPath,'utf8'));

  const htmlUrl = m.url || '';
  const assetsN = Object.keys(m.assets||{}).length;
  const apiN = (m.api||[]).length;
  const wsN = (m.ws||[]).length;
  const ext = Object.keys(m.assets||{}).filter(u=>/^https?:\/\//.test(u) && !/localhost|127\.0\.0\.1/.test(u));

  // эвристики «чёрного экрана»
  const risks = [];
  if (!assetsN) risks.push('нет ассетов — вероятно, заглушка/редирект');
  if (ext.length>0) risks.push(`есть внешние ресурсы (${ext.length}) — потребуется mirror`);
  if (apiN===0) risks.push('нет API — если игра online, геймплей не поедет');
  if (wsN===0) risks.push('нет WS — многие игры требуют WS для геймплея');

  // токены
  const connect = (m.api||[]).find(a => /\/connect/i.test(a.url));
  let tokenInfo = 'не найден';
  if (connect) {
    try {
      const rec = JSON.parse(await fs.readFile(path.join(path.dirname(manPath), connect.file),'utf8'));
      const body = rec.response?.bodyB64 ? Buffer.from(rec.response.bodyB64, 'base64').toString('utf8') : '';
      const j = JSON.parse(body||'{}');
      if (j.token) tokenInfo = `найден (${j.token.slice(0,8)}...)`;
    } catch {}
  }
  
  // Также проверяем API map в билде (если это билд, а не capture)
  if (tokenInfo === 'не найден') {
    try {
      const apiMapPath = path.join(path.dirname(manPath), 'mocks', 'apiMap.json');
      const apiMap = JSON.parse(await fs.readFile(apiMapPath, 'utf8'));
      const connectApi = apiMap.find(a => /\/connect/i.test(a.url));
      if (connectApi) {
        const rec = JSON.parse(await fs.readFile(path.join(path.dirname(manPath), connectApi.file),'utf8'));
        const body = rec.response?.bodyB64 ? Buffer.from(rec.response.bodyB64, 'base64').toString('utf8') : '';
        const j = JSON.parse(body||'{}');
        if (j.token) tokenInfo = `найден (${j.token.slice(0,8)}...)`;
      }
    } catch {}
  }

  const md = `# Offline Diagnose

- Source URL: ${htmlUrl}
- assets: **${assetsN}**, api: **${apiN}**, ws: **${wsN}**
- External assets (raw): ${ext.length}

## Risks
${risks.length? risks.map(r=>`- ${r}`).join('\n') : '- низкие'}

## Tokens
- connect: ${tokenInfo}

## Next steps
1. build: \`node bin/build.mjs --capture "${cap}" --out ./dist/game\`
2. serve: \`node bin/serve.mjs --root ./dist --port 8080\`
3. открыть \`http://localhost:8080/game/\` и проверить:
   - ServiceWorker активен (scope = /game/)
   - внешние → /game/mirror/...
   - ошибок 404/500 нет
`;
  await fs.writeFile(path.join(out,'report.md'), md);
  console.log('[diagnose] report ->', path.join(out,'report.md'));
})();


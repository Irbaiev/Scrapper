#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { capture } from '../src/capture/capture.mjs';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = (i + 1 < argv.length && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
      args[key] = val;
    }
  }
  return args;
}

function slugFromUrl(u) {
  try {
    const { hostname, pathname, searchParams } = new URL(u);
    const id = searchParams.get('gameId') || '';
    const cleanPath = pathname.replace(/\/+$/, '').split('/').filter(Boolean).join('-');
    return [hostname, cleanPath, id].filter(Boolean).join('_');
  } catch {
    return 'capture';
  }
}

(async () => {
  const args = parseArgs(process.argv);
  if (!args.url) {
    console.error('Usage: node bin/scrape.mjs --url <URL> [--time 12000] [--out ./capture/<slug>] [--headless]');
    process.exit(1);
  }

  const time = Number(args.time ?? 12000);
  const outDir = path.resolve(String(args.out ?? path.join('capture', slugFromUrl(args.url))));
  await fs.mkdir(outDir, { recursive: true });

  const result = await capture(args.url, {
    outDir,
    harvestMs: time,
    headless: Boolean(args.headless),
  });

  console.log('\n[done] saved to:', outDir);
  console.log('assets:', result.counts.assets, '| api:', result.counts.api, '| ws:', result.counts.ws);
})();

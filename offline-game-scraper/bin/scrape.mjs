#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { capture } from '../src/capture/capture.mjs';
import { attachCdpNetworkSniffer } from '../src/capture/cdp-sniffer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function safeName(s) {
  return s.replace(/[^a-z0-9_\-\.]/gi, '_').slice(0, 200);
}

async function appendNdjson(file, obj) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, JSON.stringify(obj) + '\n');
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = (i + 1 < argv.length && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
      args[k] = v;
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
  } catch { return 'capture'; }
}

(async () => {
  const args = parseArgs(process.argv);
  if (!args.url) {
    console.error('Usage: node bin/scrape.mjs --url <URL> [--time 60000] [--scenario default|legacy|mobile|all] [--interact auto|off] [--load-all] [--out ./capture/<slug>] [--headless]');
    process.exit(1);
  }

  const time = Number(args.time ?? 60000);
  const scenario = String(args.scenario ?? 'default');
  const interact = String(args.interact ?? 'auto');
  const loadAll = Boolean(args['load-all']);
  const outDir = path.resolve(String(args.out ?? path.join('capture', slugFromUrl(args.url))));
  await fs.mkdir(outDir, { recursive: true });

  const result = await capture(args.url, {
    outDir,
    harvestMs: time,
    headless: Boolean(args.headless),
    scenario,
    interact,
    loadAll,
    __dirname,
    safeName,
    appendNdjson,
    attachCdpNetworkSniffer,
  });

  console.log('\n[done] saved to:', outDir);
  console.log('assets:', result.counts.assets, '| api:', result.counts.api, '| ws:', result.counts.ws, '| errors:', result.counts.errors);
})();

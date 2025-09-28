#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import http from 'node:http';
import { normUrl, normUrlLoose, isStaticJsonPath } from '../src/capture/util.mjs';

const SAFE_JSON_SPACES = 2;
const VOLATILE_PARAMS = ['token','auth','_','v','ver','verid','cb','cache','t','ts','timestamp'];

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const peek = argv[i + 1];
    if (peek && !peek.startsWith('--')) {
      args[key] = peek;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeJson(file, value) {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, JSON.stringify(value, null, SAFE_JSON_SPACES));
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

const toPosix = (value) => value.replace(/\\/g, '/');

function shortHash(input, length = 8) {
  return crypto.createHash('sha1').update(String(input)).digest('hex').slice(0, length);
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function resolveExtension(pathname, options = {}) {
  const ext = path.posix.extname(pathname);
  if (ext) return pathname;

  const sourceExt = options.sourcePath ? path.posix.extname(toPosix(options.sourcePath)) : '';
  if (sourceExt) {
    const normalized = sourceExt.toLowerCase();
    if (normalized === '.html' || normalized === '.htm') return `${pathname}.html`;
    return `${pathname}${normalized}`;
  }

  const lower = String(options.contentType || '').toLowerCase();
  if (lower.includes('text/html') || lower.includes('application/xhtml')) return `${pathname}.html`;
  if (lower.includes('application/json')) return `${pathname}.json`;
  if (lower.includes('javascript')) return `${pathname}.js`;
  if (lower.includes('text/css')) return `${pathname}.css`;
  if (lower.startsWith('image/')) {
    const type = lower.split('/')[1]?.split(';')[0] || 'img';
    const normalized = type.replace('jpeg', 'jpg');
    return `${pathname}.${normalized}`;
  }
  if (lower.startsWith('font/')) {
    const type = lower.split('/')[1]?.split(';')[0] || 'font';
    return `${pathname}.${type}`;
  }
  if (lower.startsWith('text/')) return `${pathname}.txt`;
  return `${pathname}.html`;
}

function mirrorRelFor(urlStr, options = {}) {
  const url = new URL(urlStr);
  let pathname = url.pathname;
  if (pathname.endsWith('/')) {
    pathname += 'index.html';
  } else {
    pathname = resolveExtension(pathname, options);
  }

  if (url.search) {
    const tag = `.__q_${shortHash(url.search)}`;
    const dot = pathname.lastIndexOf('.');
    if (dot > -1 && dot >= pathname.lastIndexOf('/')) {
      pathname = `${pathname.slice(0, dot)}${tag}${pathname.slice(dot)}`;
    } else {
      pathname = `${pathname}${tag}`;
    }
  }

  return path.posix.join('mirror', url.hostname, pathname.replace(/^\//, ''));
}

function sortedQueryString(searchParams) {
  if (!searchParams || Array.from(searchParams.keys()).length === 0) return '';
  const tuples = [];
  for (const [key, value] of searchParams.entries()) tuples.push([key, value]);
  tuples.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  return tuples.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

async function fetchBinary(url, { referer } = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? https : http;
    const req = mod.get(url, {
      rejectUnauthorized: false,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        ...(referer ? { Referer: referer } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode || 0,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
    });
    req.on('error', reject);
  });
}

function decodeRecordBody(record) {
  const bodyB64 = record?.request?.bodyB64;
  if (!bodyB64) return null;
  try {
    return Buffer.from(bodyB64, 'base64');
  } catch {
    return null;
  }
}

function normalizeJson(value) {
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = normalizeJson(value[key]);
      return acc;
    }, {});
  }
  return value;
}

function tryParseJson(buffer) {
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    return null;
  }
}

function normalizeBody(buffer, contentType) {
  if (!buffer || buffer.length === 0) return '';
  if (!contentType) return buffer.toString('utf8');
  const lower = contentType.toLowerCase();
  if (lower.includes('application/json')) {
    const parsed = tryParseJson(buffer);
    if (parsed) return JSON.stringify(normalizeJson(parsed));
    return buffer.toString('utf8');
  }
  if (lower.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(buffer.toString('utf8'));
    const tuples = [];
    for (const [key, value] of params.entries()) tuples.push([key, value]);
    tuples.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
    return tuples.map(([k, v]) => `${k}=${v}`).join('&');
  }
  return buffer.toString('utf8');
}

function buildMockKey(method, urlStr, bodyHash = '') {
  const url = new URL(urlStr);
  const pathname = url.pathname || '/';
  const query = sortedQueryString(url.searchParams);
  const upperMethod = method.toUpperCase();
  const key = `${upperMethod}|${pathname}|${query}|${bodyHash}`;
  return { key, pathname, query };
}

async function loadOverrides(captureDir, explicit) {
  const candidates = [];
  if (explicit) candidates.push(path.resolve(explicit));
  candidates.push(path.join(captureDir, 'mirror.overrides.json'));
  candidates.push(path.resolve('mirror.overrides.json'));

  const result = new Map();
  for (const file of candidates) {
    try {
      const stat = await fs.stat(file);
      if (!stat.isFile()) continue;
      const json = JSON.parse(await fs.readFile(file, 'utf8'));
      for (const [rawKey, rawValue] of Object.entries(json)) {
        if (typeof rawValue !== 'string') continue;
        result.set(normUrl(rawKey), toPosix(rawValue));
      }
    } catch {
      // ignore missing override files
    }
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.capture) {
    console.error('Usage: node bin/build.mjs --capture <capture_dir> [--out <dist_dir>] [--overrides <file>]');
    process.exitCode = 1;
    return;
  }

  const captureDir = path.resolve(args.capture);
  const outDir = path.resolve(args.out || path.join('dist', 'build'));
  const overrideMap = await loadOverrides(captureDir, args.overrides || null);

  console.log('[build] capture:', captureDir);
  console.log('[build] out    :', outDir);
  if (overrideMap.size) console.log('[build] overrides:', overrideMap.size);

  const manifest = await readJson(path.join(captureDir, 'manifest.json'));

  await fs.rm(outDir, { recursive: true, force: true }).catch(() => {});
  await ensureDir(outDir);
  await ensureDir(path.join(outDir, 'mirror'));
  await ensureDir(path.join(outDir, 'mocks', 'api'));
  await ensureDir(path.join(outDir, 'mocks', 'ws'));
  await ensureDir(path.join(outDir, 'runtime'));

  const canonicalMap = new Map();
  const assetMetadata = new Map();
  const unusedOverrides = new Map(overrideMap);
  const copiedPaths = new Set();

  async function writeMirror(rel, data) {
    const target = path.join(outDir, rel);
    if (!copiedPaths.has(rel)) {
      await ensureDir(path.dirname(target));
      await fs.writeFile(target, data);
      copiedPaths.add(rel);
    }
  }

  function registerAsset(absUrl, relPath, meta) {
    const key = normUrl(absUrl);
    canonicalMap.set(key, toPosix(relPath));
    if (meta) assetMetadata.set(key, meta);
  }

  const captureAssets = manifest.assets || {};
  for (const [absUrl, meta] of Object.entries(captureAssets)) {
    const normKey = normUrl(absUrl);
    const relOverride = unusedOverrides.has(normKey) ? unusedOverrides.get(normKey) : null;
    if (relOverride) unusedOverrides.delete(normKey);
    const rel = relOverride || mirrorRelFor(absUrl, { contentType: meta.contentType || meta.headers?.['content-type'], sourcePath: meta.path });
    const sourcePath = path.join(captureDir, meta.path);
    const data = await fs.readFile(sourcePath);
    await writeMirror(rel, data);
    registerAsset(absUrl, rel, {
      path: rel,
      sha256: sha256(data),
      size: data.length,
      status: meta.status ?? 200,
      headers: meta.headers ?? {},
      contentType: meta.contentType || meta.headers?.['content-type'] || '',
    });
  }

  const mainHtmlEntry = captureAssets[manifest.url];
  if (!mainHtmlEntry) throw new Error('Manifest main URL missing in assets');
  const originalHtml = await fs.readFile(path.join(captureDir, mainHtmlEntry.path), 'utf8');

  const externalUrls = new Set();
  const collect = (value) => {
    if (!value) return;
    if (/^https?:\/\//i.test(value)) externalUrls.add(value);
  };

  originalHtml.replace(/(?:src|href)=["'`](https?:\/\/[^"'`]+)["'`]/gi, (_, url) => { collect(url); return _; });
  originalHtml.replace(/loadScript\((["'`])(https?:\/\/[^"'`]+)\1/gi, (_, __, url) => { collect(url); return _; });
  originalHtml.replace(/\s+srcset=(["'])([^"']+)\1/gi, (_, __, list) => {
    list.split(',').forEach((part) => collect(part.trim().split(/\s+/)[0]));
    return _;
  });
  originalHtml.replace(/url\((['"]?)(https?:\/\/[^'")]+)\1\)/gi, (_, __, url) => { collect(url); return _; });
  originalHtml.replace(/\s+(data-src|poster|xlink:href)=(["'])(https?:\/\/[^"']+)\2/gi, (_, __, ___, url) => { collect(url); return _; });

  for (const [absUrl, meta] of Object.entries(captureAssets)) {
    if (!/\.css$/i.test(meta.path)) continue;
    const css = await fs.readFile(path.join(captureDir, meta.path), 'utf8').catch(() => null);
    if (!css) continue;
    css.replace(/url\((['"]?)(https?:\/\/[^'")]+)\1\)/gi, (_, __, url) => { collect(url); return _; });
  }

  for (const key of canonicalMap.keys()) externalUrls.delete(key);

  for (const url of externalUrls) {
    const normKey = normUrl(url);
    if (canonicalMap.has(normKey)) continue;
    const relOverride = unusedOverrides.has(normKey) ? unusedOverrides.get(normKey) : null;
    if (relOverride) unusedOverrides.delete(normKey);
    try {
      const response = await fetchBinary(url, { referer: manifest.url });
      if (response.status < 200 || response.status >= 300) {
        console.warn('[build] skip external', url, 'status', response.status);
        continue;
      }
      const rel = relOverride || mirrorRelFor(url, { contentType: response.headers?.['content-type'] });
      await writeMirror(rel, response.body);
      registerAsset(url, rel, {
        path: rel,
        sha256: sha256(response.body),
        size: response.body.length,
        status: response.status,
        headers: response.headers,
        contentType: response.headers?.['content-type'] || '',
      });
    } catch (err) {
      console.warn('[build] fetch failed', url, err?.message || err);
    }
  }

  for (const [normKey, rel] of unusedOverrides.entries()) {
    canonicalMap.set(normKey, toPosix(rel));
    if (!assetMetadata.has(normKey)) {
      assetMetadata.set(normKey, { path: rel, sha256: '', size: 0, status: 200, headers: {}, contentType: '' });
    }
  }

  const apiManifestEntries = manifest.api || [];
  const apiMocks = [];
  const apiDir = path.join(outDir, 'mocks', 'api');

  for (const entry of apiManifestEntries) {
    const src = path.join(captureDir, entry.file);
    const base = path.basename(entry.file);
    const dst = path.join(apiDir, base);
    await ensureDir(path.dirname(dst));
    await fs.copyFile(src, dst);

    const record = JSON.parse(await fs.readFile(dst, 'utf8'));
    const method = (record?.request?.method || entry.method || 'GET').toUpperCase();
    const url = entry.url || record?.request?.url;
    const normKey = normUrl(url);
    const bodyBuffer = decodeRecordBody(record);
    const reqContentType = record?.request?.headers?.['content-type'] || record?.request?.headers?.['Content-Type'] || '';
    const bodyNormalized = normalizeBody(bodyBuffer, reqContentType);
    const bodyHash = bodyNormalized ? sha256(Buffer.from(bodyNormalized, 'utf8')) : '';
    const { key, pathname, query } = buildMockKey(method, url, bodyHash);
    const contentType = record?.response?.contentType || record?.response?.headers?.['content-type'] || 'application/json';

    apiMocks.push({
      method,
      url: normKey,
      key,
      pathname,
      query,
      bodyHash,
      file: toPosix(path.join('mocks', 'api', base)),
      contentType,
    });
  }

  if (apiMocks.length === 0) {
    for (const [absUrl, meta] of Object.entries(captureAssets)) {
      const url = new URL(absUrl);
      if (!/\.json(\?|$)/i.test(url.pathname)) continue;
      if (/^(static|cdn|assets?)\./i.test(url.hostname)) continue;
      if (isStaticJsonPath(url.pathname)) continue;
      const buffer = await fs.readFile(path.join(captureDir, meta.path));
      const base = `${Date.now()}_${Math.random().toString(36).slice(2)}.json`;
      const record = {
        time: new Date().toISOString(),
        request: { method: 'GET', url: absUrl, headers: {} },
        response: { status: 200, headers: { 'content-type': 'application/json' }, bodyB64: buffer.toString('base64') },
      };
      await fs.writeFile(path.join(apiDir, base), JSON.stringify(record, null, SAFE_JSON_SPACES));
      const { key, pathname, query } = buildMockKey('GET', absUrl, '');
      apiMocks.push({
        method: 'GET',
        url: normUrl(absUrl),
        key,
        pathname,
        query,
        bodyHash: '',
        file: toPosix(path.join('mocks', 'api', base)),
        contentType: 'application/json',
      });
    }
  }

  await writeJson(path.join(outDir, 'mocks', 'apiMap.json'), apiMocks);

  const wsEntries = [];
  for (const entry of manifest.ws || []) {
    try {
      const src = path.join(captureDir, entry.file);
      const base = path.basename(entry.file);
      const dst = path.join(outDir, 'mocks', 'ws', base);
      await ensureDir(path.dirname(dst));
      await fs.copyFile(src, dst);
      wsEntries.push({ url: normUrl(entry.url), file: toPosix(path.join('mocks', 'ws', base)) });
    } catch (err) {
      console.warn('[build] ws copy failed', entry.file, err?.message || err);
    }
  }
  await writeJson(path.join(outDir, 'mocks', 'wsMap.json'), wsEntries);

  const sortedEntries = Array.from(canonicalMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const mirrorIndex = Object.fromEntries(sortedEntries);
  await writeJson(path.join(outDir, 'mirrorIndex.json'), mirrorIndex);

  const finalAssets = {};
  for (const [key, rel] of sortedEntries) {
    const meta = assetMetadata.get(key) || { path: rel, sha256: '', size: 0, status: 200, headers: {}, contentType: '' };
    finalAssets[key] = { ...meta, path: rel };
  }
  manifest.assets = finalAssets;
  await writeJson(path.join(outDir, 'manifest.json'), manifest);

  function replaceAbsolute(value) {
    if (!value) return value;
    try {
      const key = normUrl(value);
      const rel = mirrorIndex[key];
      if (!rel) return value;
      return rel;
    } catch {
      return value;
    }
  }

  let rewrittenHtml = originalHtml;
  rewrittenHtml = rewrittenHtml.replace(/(src|href)=(["'])(https?:\/\/[^"']+)(["'])/gi, (m, attr, q, url, close) => `${attr}=${q}${replaceAbsolute(url)}${close}`);
  rewrittenHtml = rewrittenHtml.replace(/srcset=(["'])([^"']+)(["'])/gi, (m, q, value, close) => {
    const parts = value.split(',').map((chunk) => {
      const [src, descriptor] = chunk.trim().split(/\s+/, 2);
      if (!/^https?:/i.test(src)) return chunk.trim();
      const local = replaceAbsolute(src);
      return descriptor ? `${local} ${descriptor}` : local;
    });
    return `srcset=${q}${parts.join(', ')}${q}`;
  });
  rewrittenHtml = rewrittenHtml.replace(/url\((['"]?)(https?:\/\/[^'")]+)\1\)/gi, (m, q, url) => `url(${replaceAbsolute(url)})`);

  if (!/runtime\/offline\.js/.test(rewrittenHtml)) {
    rewrittenHtml = rewrittenHtml.replace(/<head[^>]*>/i, (match) => `${match}\n  <script src="runtime/offline.js"></script>`);
  }

  await fs.writeFile(path.join(outDir, 'index.html'), rewrittenHtml);
  await writeJson(path.join(outDir, 'build.json'), { from: captureDir, createdAt: new Date().toISOString() });

  // Service Worker больше не генерируется автоматически
  // Используйте статический sw.js или создавайте вручную

  const runtimeLines = [
    '/* auto-generated */',
    '(() => {',
    '  const MIRROR = %%MIRROR_MAP%%;',
    '  const VOLATILE = new Set(%%VOLATILE_SET%%);',
    '',
    '  function deriveBase() {',
    '    const script = document.currentScript;',
    '    const fallback = new URL(window.location.href);',
    '    const fromScript = (() => {',
    '      if (!script || !script.src) return null;',
    '      try {',
    '        const url = new URL(script.src, window.location.href);',
    '        return url.pathname;',
    '      } catch {',
    '        return null;',
    '      }',
    '    })();',
    '    const raw = fromScript || fallback.pathname;',
    '    let base = raw.replace(/runtime\/[^/]*$/, "");',
    '    base = base.replace(/[^/]+$/, "");',
    '    return base.endsWith("/") ? base : `${base}/`;',
    '  }',
    '',
    '  const BASE = deriveBase();',
    '  window.__OFFLINE_BASE__ = BASE;',
    '  try {',
    '    window.__webpack_public_path__ = BASE;',
    '  } catch {',
    '    // ignore',
    '  }',
    '',
    '  function norm(url) {',
    '    try {',
    '      const u = new URL(url, window.location.href);',
    '      u.hash = "";',
    '      const pairs = [...u.searchParams.entries()].sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));',
    '      u.search = "";',
    '      for (const [k, v] of pairs) u.searchParams.append(k, v);',
    '      return u.toString();',
    '    } catch {',
    '      return url;',
    '    }',
    '  }',
    '',
    '  function normLoose(url) {',
    '    try {',
    '      const u = new URL(url, window.location.href);',
    '      u.hash = "";',
    '      const pairs = [...u.searchParams.entries()]',
    '        .filter(([key]) => !VOLATILE.has(key.toLowerCase()))',
    '        .sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));',
    '      u.search = "";',
    '      for (const [k, v] of pairs) u.searchParams.append(k, v);',
    '      return u.toString();',
    '    } catch {',
    '      return url;',
    '    }',
    '  }',
    '',
    '  function localFromMirror(url) {',
    '    const key = norm(url);',
    '    const loose = normLoose(url);',
    '    const rel = MIRROR[key] || MIRROR[loose];',
    '    return rel ? `${BASE}${rel}` : null;',
    '  }',
    '',
    '  const originalFetch = window.fetch;',
    '  window.fetch = async function patchedFetch(input, init) {',
    '    try {',
    '      const url = typeof input === "string" ? input : input?.url;',
    '      const method = (init?.method || (typeof input === "object" && input?.method) || "GET").toUpperCase();',
    '      if (method === "GET" && /^https?:\/\//i.test(url)) {',
    '        const local = localFromMirror(url);',
    '        if (local) return originalFetch.call(this, local, init);',
    '      }',
    '    } catch {',
    '      // ignore',
    '    }',
    '    return originalFetch.call(this, input, init);',
    '  };',
    '',
    '  const originalOpen = XMLHttpRequest.prototype.open;',
    '  XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {',
    '    try {',
    '      if (method && method.toUpperCase() === "GET" && /^https?:\/\//i.test(url)) {',
    '        const local = localFromMirror(url);',
    '        if (local) return originalOpen.call(this, method, local, ...rest);',
    '      }',
    '    } catch {',
    '      // ignore',
    '    }',
    '    return originalOpen.call(this, method, url, ...rest);',
    '  };',
    '',
    '  const originalCreate = document.createElement;',
    '  document.createElement = function patchedCreate(tagName) {',
    '    const el = originalCreate.call(document, tagName);',
    '    const tag = String(tagName || "").toLowerCase();',
    '    if (tag === "script") {',
    '      const desc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, "src");',
    '      if (desc?.set) {',
    '        Object.defineProperty(el, "src", {',
    '          set(value) {',
    '            const local = /^https?:\/\//i.test(value) ? localFromMirror(value) : null;',
    '            return desc.set.call(this, local || value);',
    '          },',
    '          get() {',
    '            return desc.get.call(this);',
    '          },',
    '        });',
    '      }',
    '    }',
    '    if (tag === "link") {',
    '      const desc = Object.getOwnPropertyDescriptor(HTMLLinkElement.prototype, "href");',
    '      if (desc?.set) {',
    '        Object.defineProperty(el, "href", {',
    '          set(value) {',
    '            const local = /^https?:\/\//i.test(value) ? localFromMirror(value) : null;',
    '            return desc.set.call(this, local || value);',
    '          },',
    '          get() {',
    '            return desc.get.call(this);',
    '          },',
    '        });',
    '      }',
    '    }',
    '    return el;',
    '  };',
    '})();',
  ];

  let runtimeSource = runtimeLines.join('\n');
  runtimeSource = runtimeSource.replace('%%MIRROR_MAP%%', JSON.stringify(mirrorIndex, null, 2));
  runtimeSource = runtimeSource.replace('%%VOLATILE_SET%%', JSON.stringify(VOLATILE_PARAMS));

  await fs.writeFile(path.join(outDir, 'runtime', 'offline.js'), runtimeSource);

  console.log('[build] assets:', sortedEntries.length);
  console.log('[build] api mocks:', apiMocks.length);
  console.log('[build] ws entries:', wsEntries.length);
}

main().catch((err) => {
  console.error('[build] failed:', err);
  process.exitCode = 1;
});


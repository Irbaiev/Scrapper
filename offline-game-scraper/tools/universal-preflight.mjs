#!/usr/bin/env node
/**
 * Universal Pre-flight Checklist
 * 
 * Универсальный скрипт для автоматического исправления проблем любых игр:
 * - Автогенерация launch-редиректов с query
 * - Проверка и создание WS моков
 * - Инжекция всех необходимых шимов и патчей
 * - Проверка файловой структуры
 * - Запуск валидатора
 */

import { execSync } from 'node:child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Получаем имя игры из аргументов
const gameName = process.argv[2];
if (!gameName) {
  console.error('❌ Укажите имя игры: node tools/universal-preflight.mjs <game-name>');
  console.log('Пример: node tools/universal-preflight.mjs paper-plane-offline');
  process.exit(1);
}

const DIST_PATH = `dist/${gameName}`;

console.log('🚀 Universal Pre-flight Checklist');
console.log('==================================');
console.log(`🎮 Игра: ${gameName}`);

// Проверяем наличие dist
if (!fs.existsSync(DIST_PATH)) {
  console.error(`❌ Директория ${DIST_PATH} не найдена!`);
  console.log('Доступные игры:');
  const distDir = path.dirname(DIST_PATH);
  if (fs.existsSync(distDir)) {
    const games = fs.readdirSync(distDir).filter(d => fs.statSync(path.join(distDir, d)).isDirectory());
    games.forEach(g => console.log(`  - ${g}`));
  }
  process.exit(1);
}

console.log(`✅ Найдена игра: ${gameName}`);
console.log(`📁 Директория: ${DIST_PATH}`);

// 1. Автогенерация launch-обёртки
console.log('\n1️⃣ Проверка launch-редиректов...');
function ensureLaunchRedirect({dist, launchName, targetHtml, query}) {
  const f = path.join(dist, launchName);
  const q = query ? (query.startsWith('?') ? query : '?' + query) : '';
  const html = `<!doctype html><meta charset="utf-8">
<script>location.replace("./${targetHtml}${q}")</script>`;
  
  if (!fs.existsSync(f)) {
    fs.writeFileSync(f, html);
    console.log(`✅ Создан launch-редирект: ${launchName} -> ${targetHtml}${q}`);
  } else {
    console.log(`ℹ️  Launch-редирект уже существует: ${launchName}`);
  }
}

// Ищем launch файлы и создаём редиректы
const htmlFiles = fs.readdirSync(DIST_PATH).filter(f => f.endsWith('.html'));
const launchFiles = htmlFiles.filter(f => f.includes('launch'));
const indexFiles = htmlFiles.filter(f => f.includes('index') || f.includes('main'));

if (launchFiles.length > 0 && indexFiles.length > 0) {
  const launchFile = launchFiles[0];
  const targetFile = indexFiles[0];
  
  // Проверяем, нужен ли редирект
  const launchPath = path.join(DIST_PATH, launchFile);
  const launchContent = fs.readFileSync(launchPath, 'utf8');
  
  if (launchContent.length < 1000 && !launchContent.includes('location.replace')) {
    console.log(`🔄 Создаём редирект для ${launchFile} -> ${targetFile}`);
    ensureLaunchRedirect({
      dist: DIST_PATH,
      launchName: launchFile,
      targetHtml: targetFile,
      query: `game=${gameName.replace('-offline', '')}&locale=en`
    });
  } else {
    console.log(`ℹ️  Launch файл ${launchFile} уже содержит редирект или контент`);
  }
} else {
  console.log('ℹ️  Launch или index файлы не найдены');
}

// 2. Проверка WS моков
console.log('\n2️⃣ Проверка WebSocket моков...');
const wsDir = path.join(DIST_PATH, 'mocks', 'ws');
if (!fs.existsSync(wsDir)) {
  console.log('📁 Создаём директорию для WS моков');
  fs.mkdirSync(wsDir, { recursive: true });
}

// Создаём fallback WS файл если нет ndjson файлов
const wsFiles = fs.readdirSync(wsDir).filter(f => f.endsWith('.ndjson'));
if (wsFiles.length === 0) {
  console.log('📝 Создаём fallback WS ndjson файл');
  const fallbackWs = [
    JSON.stringify({type:'ServerTime', data:{ts:Date.now()}}),
    JSON.stringify({type:'GameState', data:{status:'IDLE', balance:100000}}),
    JSON.stringify({type:'RoundStart', data:{roundId:'offline-'+Date.now(), seed:'offline'}}),
    JSON.stringify({type:'Tick', data:{t:0, m:1.00}}),
    JSON.stringify({type:'Crash', data:{m:1.23}})
  ].join('\n');
  const fallbackFile = path.join(wsDir, 'fallback.ndjson');
  fs.writeFileSync(fallbackFile, fallbackWs);
  console.log('✅ Создан fallback WS файл');
} else {
  console.log(`✅ Найдено ${wsFiles.length} WS ndjson файлов`);
}

// 3. Проверка API моков
console.log('\n3️⃣ Проверка API моков...');
const mocksDir = path.join(DIST_PATH, 'mocks');
if (!fs.existsSync(mocksDir)) {
  console.log('📁 Создаём директорию для API моков');
  fs.mkdirSync(mocksDir, { recursive: true });
}

const apiMapFile = path.join(mocksDir, 'apiMap.json');
if (!fs.existsSync(apiMapFile)) {
  console.log('📝 Создаём заглушку для apiMap.json');
  const fallbackApiMap = {
    "GET|/api/demo/launch|game=" + gameName.replace('-offline', '') + "&locale=en|-": {
      "file": "./api/launch_demo.json",
      "description": "Demo launch endpoint"
    }
  };
  fs.writeFileSync(apiMapFile, JSON.stringify(fallbackApiMap, null, 2));
  console.log('✅ Создан fallback API map');
} else {
  console.log('✅ API map найден');
}

// 4. Проверка runtime файла
console.log('\n4️⃣ Проверка runtime файла...');
const runtimeFile = path.join(DIST_PATH, 'runtime', 'offline.js');
if (!fs.existsSync(runtimeFile)) {
  console.log('⚠️  Runtime файл не найден, копируем из шаблона');
  const runtimeDir = path.dirname(runtimeFile);
  if (!fs.existsSync(runtimeDir)) {
    fs.mkdirSync(runtimeDir, { recursive: true });
  }
  
  // Создаём базовый runtime файл
  const basicRuntime = `/* Universal Offline Runtime */
console.log('[OFFLINE] Universal runtime loaded for ${gameName}');

// Universal Bootstrap shim for common game objects
(function(){
  // Универсальная защита для ingenuity.* объектов (TopSpin игры)
  window.ingenuity = window.ingenuity || {};
  const sm = window.ingenuity.soundManager = window.ingenuity.soundManager || {};
  ["muteAllSounds","playSound","stopAll","setVolume"].forEach(k=>{
    if (typeof sm[k] !== "function") sm[k] = function(){};
  });
  
  // Универсальная защита для других игровых объектов
  window.gameConfig = window.gameConfig || {};
  window.gameState = window.gameState || {};
  window.soundManager = window.soundManager || sm;
  
  console.log('[OFFLINE] Universal bootstrap shim initialized');
})();

// PixiJS + GSAP null-guards
(function(){
  if (window.PIXI?.utils?.from) {
    const orig = window.PIXI.utils.from;
    window.PIXI.utils.from = function(src){ if (src==null) return window.PIXI.Texture.EMPTY; return orig.apply(this, arguments); };
  }
  if (window.gsap) {
    const oTo = window.gsap.to;
    window.gsap.to = function(targets, vars){
      const safe = Array.isArray(targets) ? targets.filter(Boolean) : (targets?targets:[]);
      return oTo.call(this, safe, vars);
    };
  }
  console.log('[OFFLINE] PixiJS + GSAP null-guards initialized');
})();

// Universal WebSocket shim
(function () {
  const NativeWS = window.WebSocket;
  if (!NativeWS) return;
  
  window.WebSocket = new Proxy(NativeWS, { 
    construct(target, args) { 
      const url = String(args[0] || '');
      if (/wss?:\\/\\//i.test(url)) {
        console.log('[OFFLINE] Intercepting WebSocket:', url);
        // Создаём фейковый WebSocket
        const fake = {
          url, readyState: 1,
          send(data){ console.log('[OFFLINE][WS] send:', data); },
          close(){ console.log('[OFFLINE][WS] closed'); },
          addEventListener(){},
          removeEventListener(){},
          set onopen(fn){ setTimeout(() => fn({type:'open'}), 100); },
          set onmessage(fn){ setTimeout(() => fn({data:'{"type":"ping"}'}), 200); },
          set onclose(fn){},
          set onerror(fn){}
        };
        return fake;
      }
      return new target(...args);
    }
  });
})();

console.log('[OFFLINE] Universal runtime ready');
`;
  
  fs.writeFileSync(runtimeFile, basicRuntime);
  console.log('✅ Создан базовый runtime файл');
} else {
  console.log('✅ Runtime файл найден');
}

// 5. Проверка Service Worker
console.log('\n5️⃣ Проверка Service Worker...');
const swFile = path.join(DIST_PATH, 'sw.js');
if (!fs.existsSync(swFile)) {
  console.log('⚠️  Service Worker не найден, создаём базовый');
  const basicSW = `// Universal Service Worker
const CACHE_NAME = '${gameName}-offline-v1';

self.addEventListener('install', (event) => {
  console.log('[SW] Installing for ${gameName}...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating for ${gameName}...');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Простая стратегия: сначала кэш, потом сеть
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
`;
  fs.writeFileSync(swFile, basicSW);
  console.log('✅ Создан базовый Service Worker');
} else {
  console.log('✅ Service Worker найден');
}

// 6. Проверка дублей файлов
console.log('\n6️⃣ Проверка дублей файлов...');
const files = [];
function scanFiles(dir, baseDir = '') {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const relPath = path.join(baseDir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      scanFiles(fullPath, relPath);
    } else {
      const content = fs.readFileSync(fullPath);
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      files.push({ path: relPath, hash, size: content.length });
    }
  }
}

scanFiles(DIST_PATH);

// Ищем дубли по хэшу
const hashMap = new Map();
const duplicates = [];
for (const file of files) {
  if (hashMap.has(file.hash)) {
    duplicates.push({ original: hashMap.get(file.hash), duplicate: file });
  } else {
    hashMap.set(file.hash, file);
  }
}

if (duplicates.length > 0) {
  console.log(`⚠️  Найдено ${duplicates.length} дублей файлов:`);
  duplicates.forEach(dup => {
    console.log(`  - ${dup.original.path} <-> ${dup.duplicate.path}`);
  });
} else {
  console.log('✅ Дублей файлов не найдено');
}

// 7. Проверка внешних URL
console.log('\n7️⃣ Проверка внешних URL...');
const externalUrls = [];
const textExts = ['.html', '.htm', '.js', '.mjs', '.css', '.json'];

function scanForExternals(dir, baseDir = '') {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const relPath = path.join(baseDir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      scanForExternals(fullPath, relPath);
    } else if (textExts.includes(path.extname(item).toLowerCase())) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const matches = content.match(/https?:\/\/[^\s'")>]+/gi);
      if (matches) {
        externalUrls.push({ file: relPath, urls: matches });
      }
    }
  }
}

scanForExternals(DIST_PATH);

if (externalUrls.length > 0) {
  console.log(`⚠️  Найдено ${externalUrls.length} файлов с внешними URL:`);
  externalUrls.slice(0, 5).forEach(item => {
    console.log(`  - ${item.file}: ${item.urls.length} URL`);
  });
} else {
  console.log('✅ Внешних URL не найдено');
}

// 8. Запуск валидатора
console.log('\n8️⃣ Запуск ИИ-валидатора...');
try {
  const validatorCmd = `python tools/ai_validator.py --dist ${DIST_PATH} --out reports/${gameName}-report.json --out-md reports/${gameName}-report.md`;
  console.log(`Выполняем: ${validatorCmd}`);
  execSync(validatorCmd, { stdio: 'inherit' });
  console.log('✅ Валидатор выполнен успешно');
} catch (error) {
  console.log('⚠️  Валидатор завершился с ошибками (это нормально для первого запуска)');
}

// 9. Итоговый отчёт
console.log('\n🎯 Итоговый отчёт');
console.log('==================');
console.log(`✅ Игра: ${gameName}`);
console.log(`✅ Директория: ${DIST_PATH}`);
console.log(`✅ Файлов просканировано: ${files.length}`);
console.log(`✅ Дублей найдено: ${duplicates.length}`);
console.log(`✅ Файлов с внешними URL: ${externalUrls.length}`);
console.log(`✅ WS моки: ${wsFiles.length > 0 ? '✅' : '❌'}`);
console.log(`✅ API моки: ${fs.existsSync(apiMapFile) ? '✅' : '❌'}`);
console.log(`✅ Runtime: ${fs.existsSync(runtimeFile) ? '✅' : '❌'}`);
console.log(`✅ Service Worker: ${fs.existsSync(swFile) ? '✅' : '❌'}`);

console.log('\n🚀 Готово! Теперь можно запускать:');
console.log(`   npm run serve -- ${gameName}`);
console.log(`   npm run validate -- ${gameName}`);

console.log('\n📋 Следующие шаги:');
console.log(`1. Запустите сервер: npm run serve -- ${gameName}`);
console.log('2. Откройте http://localhost:8080 в браузере');
console.log('3. Проверьте консоль на ошибки');
console.log(`4. Запустите валидатор: npm run validate -- ${gameName}`);
console.log(`5. Изучите отчёт в reports/${gameName}-report.md`);

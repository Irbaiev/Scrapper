// node build.mjs
import { execSync } from 'node:child_process';
import fs from 'fs'; 
import path from 'path';

// Поддержка разных игр через аргументы
const gameName = process.argv[2] || 'default-game';
const dist = `dist/${gameName}`;

if (!fs.existsSync(dist)) {
  console.error(`❌ dist не найден: ${dist}`);
  console.log('Доступные игры:');
  const distDir = path.dirname(dist);
  if (fs.existsSync(distDir)) {
    const games = fs.readdirSync(distDir).filter(d => fs.statSync(path.join(distDir, d)).isDirectory());
    games.forEach(g => console.log(`  - ${g}`));
  }
  process.exit(1);
}

console.log(`🎮 Сборка игры: ${gameName}`);
console.log(`📁 Директория: ${dist}`);

console.log('1) scaffold configs');
execSync(`node tools/scaffold-configs.cjs --dist ${dist}`, { stdio:'inherit' });

console.log('2) preflight (rewrite externals, publicPath, inject gameParam)');
execSync(`node tools/preflight.cjs --dist ${dist}`, { stdio:'inherit' });

console.log('3) автогенерация launch-обёрток и фиксов');
ensureLaunchRedirects(dist, gameName);

console.log('4) готово. Клади свой sw.js (если ещё не лежит) и запускай сервер.');

// Автогенерация launch-обёртки с редиректом и query
function ensureLaunchRedirect({dist, launchName, targetHtml, query}) {
  const fs = require('fs'), p = require('path');
  const f = p.join(dist, launchName);
  const q = query ? (query.startsWith('?') ? query : '?' + query) : '';
  const html = `<!doctype html><meta charset="utf-8">
<script>location.replace("./${targetHtml}${q}")</script>`;
  if (!fs.existsSync(f)) fs.writeFileSync(f, html);
  console.log(`✅ Создан launch-редирект: ${launchName} -> ${targetHtml}${q}`);
}

function ensureLaunchRedirects(distPath, gameName) {
  const fs = require('fs'), p = require('path');
  
  // Универсальные проверки для всех игр
  const mirrorIndex = p.join(distPath, 'mirrorIndex.json');
  if (!fs.existsSync(mirrorIndex)) {
    console.log('⚠️  mirrorIndex.json не найден');
  }
  
  const mocksDir = p.join(distPath, 'mocks');
  if (!fs.existsSync(mocksDir)) {
    console.log('⚠️  mocks директория не найдена, создаём');
    fs.mkdirSync(mocksDir, { recursive: true });
  }
  
  // Проверяем наличие WS моков
  const wsDir = p.join(distPath, 'mocks', 'ws');
  if (!fs.existsSync(wsDir)) {
    console.log('⚠️  WS моки не найдены, создаём директорию');
    fs.mkdirSync(wsDir, { recursive: true });
  }
  
  // Ищем launch файлы и создаём редиректы
  const htmlFiles = fs.readdirSync(distPath).filter(f => f.endsWith('.html'));
  const launchFiles = htmlFiles.filter(f => f.includes('launch'));
  const indexFiles = htmlFiles.filter(f => f.includes('index') || f.includes('main'));
  
  if (launchFiles.length > 0 && indexFiles.length > 0) {
    const launchFile = launchFiles[0];
    const targetFile = indexFiles[0];
    
    // Проверяем, нужен ли редирект (если launch файл пустой или содержит только редирект)
    const launchPath = p.join(distPath, launchFile);
    const launchContent = fs.readFileSync(launchPath, 'utf8');
    
    if (launchContent.length < 1000 && !launchContent.includes('location.replace')) {
      console.log(`🔄 Создаём редирект для ${launchFile} -> ${targetFile}`);
      ensureLaunchRedirect({
        dist: distPath,
        launchName: launchFile,
        targetHtml: targetFile,
        query: `game=${gameName.replace('-offline', '')}&locale=en`
      });
    }
  }
  
  // Создаём fallback WS файл если нет ndjson файлов
  const wsFiles = fs.readdirSync(wsDir).filter(f => f.endsWith('.ndjson'));
  if (wsFiles.length === 0) {
    console.log('⚠️  WS ndjson файлы не найдены, создаём заглушку');
    const fallbackWs = [
      JSON.stringify({type:'ServerTime', data:{ts:Date.now()}}),
      JSON.stringify({type:'GameState', data:{status:'IDLE', balance:100000}}),
      JSON.stringify({type:'RoundStart', data:{roundId:'offline-'+Date.now(), seed:'offline'}}),
      JSON.stringify({type:'Tick', data:{t:0, m:1.00}}),
      JSON.stringify({type:'Crash', data:{m:1.23}})
    ].join('\n');
    const fallbackFile = p.join(wsDir, 'fallback.ndjson');
    fs.writeFileSync(fallbackFile, fallbackWs);
  }
}

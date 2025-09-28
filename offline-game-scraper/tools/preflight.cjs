// node tools/preflight.js --dist dist/bananza
const fs = require('fs'); 
const path = require('path'); 
const m = require('minimist');

const EXTERNAL = /(https?:)?\/\/|^wss?:\/\//i;
const SKIP_FILES = /(?:^|\/)sw\.js$/i;

function read(p){ return fs.readFileSync(p,'utf8'); }
function write(p,c){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,c); }
function list(dir){ 
  const out=[]; 
  (function walk(d){ 
    for(const f of fs.readdirSync(d)){ 
      const p=path.join(d,f); 
      const s=fs.statSync(p); 
      if(s.isDirectory()) walk(p); 
      else out.push(p);
    } 
  })(dir); 
  return out; 
}

function rewriteExternals(file, distRoot) {
  let c = read(file), changed = false;
  // переписываем в html/css/js ссылки вида http(s):// → ./__ext__/...
  c = c.replace(/\b(src|href|srcset)=["']([^"']+)["']/gi, (m,attr,u)=>{
    if (EXTERNAL.test(u)) { 
      changed = true; 
      return `${attr}="./__ext__/${encodeURIComponent(u)}"`; 
    }
    return m;
  });
  
  // НЕ трогаем xmlns атрибуты
  c = c.replace(/xmlns:?[a-zA-Z]*\s*=\s*["']([^"']+)["']/gi, (m,url)=>{
    // Восстанавливаем оригинальные xmlns
    if (url.includes('__ext__/http%3A%2F%2F')) {
      changed = true;
      const originalUrl = decodeURIComponent(url.replace('./__ext__/', ''));
      return m.replace(url, originalUrl);
    }
    return m;
  });
  c = c.replace(/url\(\s*["']?([^"')]+)["']?\s*\)/gi, (m,u)=>{
    if (EXTERNAL.test(u)) { 
      changed = true; 
      return `url("./__ext__/${encodeURIComponent(u)}")`; 
    }
    return m;
  });
  
  // Обработка прямых ссылок в JavaScript коде
  if (file.endsWith('.html') || file.endsWith('.js')) {
    // loadScript("https://...") → loadScript("./__ext__/...")
    c = c.replace(/loadScript\s*\(\s*["']([^"']+)["']/gi, (m,url)=>{
      if (EXTERNAL.test(url)) {
        changed = true;
        return `loadScript("./__ext__/${encodeURIComponent(url)}"`;
      }
      return m;
    });
    
    // appendSvgSprite("https://...") → appendSvgSprite("./__ext__/...")
    c = c.replace(/appendSvgSprite\s*\(\s*["']([^"']+)["']/gi, (m,url)=>{
      if (EXTERNAL.test(url)) {
        changed = true;
        return `appendSvgSprite("./__ext__/${encodeURIComponent(url)}"`;
      }
      return m;
    });
    
    // value="https://..." → value="./__ext__/..."
    c = c.replace(/value\s*=\s*["']([^"']+)["']/gi, (m,url)=>{
      if (EXTERNAL.test(url)) {
        changed = true;
        return `value="./__ext__/${encodeURIComponent(url)}"`;
      }
      return m;
    });
    
    // 'https://...' в строках
    c = c.replace(/['"](https?:\/\/[^'"]+)['"]/gi, (m,url)=>{
      if (EXTERNAL.test(url)) {
        changed = true;
        return `"./__ext__/${encodeURIComponent(url)}"`;
      }
      return m;
    });
  }
  
  if (file.endsWith('.js')) {
    // ранний publicPath
    if (!/__webpack_public_path__/.test(c)) {
      c = `var __webpack_public_path__ = './';\n` + c; 
      changed = true;
    }
    // убрать sourceMappingURL (часто ломает)
    c = c.replace(/\/\/# sourceMappingURL=.*$/gm,'');
  }
  if (changed) write(file, c);
  return changed;
}

function injectGameParam(indexHtmlPath){
  let html = read(indexHtmlPath);
  if (!/window\.gameParam/.test(html)) {
    html = html.replace(/<head>/i, `<head>\n<script>
window.gameParam = window.gameParam || {};
window.gameParam.gameCode = window.gameParam.gameCode || "";
window.loadPlatformConfig = window.loadPlatformConfig || function(){};
</script>\n`);
    write(indexHtmlPath, html);
    return true;
  }
  return false;
}

(async()=>{
  const { dist } = m(process.argv.slice(2));
  if (!dist) throw new Error('--dist required');
  const files = list(dist).filter(p=>/\.(html?|js|css)$/i.test(p) && !SKIP_FILES.test(p));
  let rew=0, inj=false;
  for (const f of files) rew += rewriteExternals(f, dist) ? 1 : 0;

  const indexHtml = fs.existsSync(path.join(dist,'index.html')) ? path.join(dist,'index.html') : null;
  if (indexHtml) inj = injectGameParam(indexHtml);

  // собрать список __ext__/ и скачать/скопировать, если нужно. Здесь — просто падать, если остались внешки.
  const remained = [];
  for (const f of files) {
    const content = read(f);
    // Игнорируем комментарии и строки в JS и CSS файлах
    if (f.endsWith('.js') || f.endsWith('.css')) {
      // Убираем комментарии и строки для проверки
      const cleanContent = content
        .replace(/\/\*[\s\S]*?\*\//g, '') // блочные комментарии
        .replace(/\/\/.*$/gm, '') // строчные комментарии
        .replace(/"[^"]*"/g, '""') // строки в двойных кавычках
        .replace(/'[^']*'/g, "''"); // строки в одинарных кавычках
      
      if (EXTERNAL.test(cleanContent)) {
        remained.push(path.relative(dist,f));
      }
    } else {
      // Исключаем xmlns из проверки
      const cleanContent = content.replace(/xmlns:?[a-zA-Z]*\s*=\s*["'][^"']*["']/gi, '');
      if (EXTERNAL.test(cleanContent)) {
        remained.push(path.relative(dist,f));
      }
    }
  }
  if (remained.length) {
    console.error('❌ Остались внешние ссылки после preflight:', remained.slice(0,20));
    process.exit(2);
  }
  console.log(`✅ Preflight: переписано ${rew} файлов. Инжект gameParam: ${inj?'да':'нет'}.`);
})();

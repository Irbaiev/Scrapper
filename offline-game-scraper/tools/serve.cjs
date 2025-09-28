// node tools/serve.js --dir dist/bananza --port 8080
const http = require('http'); 
const fs = require('fs'); 
const path = require('path'); 
const m = require('minimist');
const mime = { 
  '.html':'text/html', 
  '.js':'application/javascript', 
  '.css':'text/css', 
  '.json':'application/json', 
  '.svg':'image/svg+xml', 
  '.woff2':'font/woff2', 
  '.woff':'font/woff', 
  '.ttf':'font/ttf', 
  '.png':'image/png', 
  '.jpg':'image/jpeg' 
};

(async()=>{
  const { dir='dist/bananza', port=8080 } = m(process.argv.slice(2));
  const server = http.createServer((req,res)=>{
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(dir, urlPath.replace(/^\//,''));
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { 
      res.writeHead(404, {'Access-Control-Allow-Origin':'*'}).end('404'); 
      return; 
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': mime[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin':'*',
      'Cache-Control': ext==='.html' ? 'no-store' : 'public, max-age=31536000, immutable'
    });
    fs.createReadStream(file).pipe(res);
  });
  server.listen(port, ()=>console.log(`serve ${dir} on http://localhost:${port}`));
})();

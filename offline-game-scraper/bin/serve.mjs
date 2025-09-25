#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import mime from 'mime-types';

function parseArgs(argv){const a={}; for(let i=2;i<argv.length;i++){const k=argv[i]; if(k.startsWith('--')){const key=k.slice(2); const v=(i+1<argv.length && !argv[i+1].startsWith('--'))? argv[++i]: true; a[key]=v; }} return a;}

const args = parseArgs(process.argv);
const ROOT = path.resolve(String(args.root||'dist'));
const PORT = Number(args.port||4173);

const server = http.createServer(async (req,res)=>{
  try{
    const url = new URL(req.url, 'http://x');
    let filePath = path.join(ROOT, decodeURIComponent(url.pathname));
    if (filePath.endsWith('/')) filePath = path.join(filePath, 'index.html');
    // Без выхода за корень
    if(!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }

    // Заголовки безопасности/медиа
    res.setHeader('Cross-Origin-Opener-Policy','same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
    res.setHeader('Accept-Ranges','bytes');
    res.setHeader('Cache-Control','no-cache');

    if(!fs.existsSync(filePath)) { res.writeHead(404); return res.end('not found'); }

    const stat = await fsp.stat(filePath);
    if(stat.isDirectory()) { res.writeHead(404); return res.end('not found'); }
    const ctype = mime.contentType(path.extname(filePath)) || 'application/octet-stream';
    res.setHeader('Content-Type', ctype);

    const range = req.headers['range'];
    if(range){
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let start = m && m[1] ? parseInt(m[1],10) : 0;
      let end = m && m[2] ? parseInt(m[2],10) : stat.size-1;
      if(start> end){ [start,end]=[0,stat.size-1]; }
      res.statusCode = 206;
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', end-start+1);
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.setHeader('Content-Length', stat.size);
    fs.createReadStream(filePath).pipe(res);
  }catch(e){ res.writeHead(500); res.end(String(e)); }
});

server.listen(PORT, ()=>{
  console.log(`[serve] ${ROOT} → http://localhost:${PORT}`);
});

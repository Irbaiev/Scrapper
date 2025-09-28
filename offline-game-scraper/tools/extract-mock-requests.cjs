#!/usr/bin/env node
const fs = require('fs'); 
const path = require('path'); 
const crypto = require('crypto'); 
const m = require('minimist');

const hash = s => crypto.createHash('sha1').update(s || '').digest('hex').slice(0,10);
const stable = o => {
  if (o === null || o === undefined) return 'null';
  if (Array.isArray(o)) return `[${o.map(stable).join(',')}]`;
  if (typeof o === 'object') return `{${Object.keys(o).sort().map(k=>JSON.stringify(k)+':'+stable(o[k])).join(',')}}`;
  return JSON.stringify(o);
};
const sortedQuery = u => { 
  try { 
    const url=new URL(u); 
    const arr=[...url.searchParams.entries()].filter(([k])=>k!=='_').sort(); 
    return arr.map(([k,v])=>`${k}=${v}`).join('&'); 
  } catch(e){ 
    return ''; 
  } 
}
const pathname = u => { 
  try { 
    return (new URL(u)).pathname; 
  } catch { 
    return String(u).split('?')[0]; 
  } 
}

function keyFrom(req) {
  const method = (req.method||'GET').toUpperCase();
  const p = pathname(req.url);
  const q = sortedQuery(req.url) || '-';
  let body = '';
  if (req.postData) {
    if (req.postData.mimeType?.includes('json')) {
      try { 
        body = stable(JSON.parse(req.postData.text||'{}')); 
      } catch { 
        body = req.postData.text||''; 
      }
    } else if (Array.isArray(req.postData.params)) {
      body = req.postData.params.map(p=>`${p.name}=${p.value||''}`).sort().join('&');
    } else {
      body = req.postData.text||'';
    }
  }
  const b = body ? hash(body) : '-';
  return `${method}|${p}|${q}|${b}`;
}

function fromHAR(har) {
  const entries = (har.log && har.log.entries) || [];
  return entries.map(e => ({
    method: e.request?.method,
    url: e.request?.url,
    postData: e.request?.postData,
    res: { 
      status: e.response?.status, 
      mime: e.response?.content?.mimeType, 
      text: e.response?.content?.text, 
      encoding: e.response?.content?.encoding 
    }
  }));
}

function fromCDP(cdp) {
  // только WS и запросы без HAR (бонус)
  return cdp.filter(x => x.ev==='Network.requestWillBeSent').map(x => ({
    method: x.data.request?.method,
    url: x.data.request?.url,
    postData: x.data.request?.postData ? { 
      text: x.data.request.postData, 
      mimeType: x.data.request?.headers?['Content-Type']:'' 
    } : null,
    res: {}
  }));
}

(async()=>{
  const { har, cdp, out='mocks', 'save-responses':saveResponses=false } = m(process.argv.slice(2));
  if (!har && !cdp) throw new Error('--har or --cdp required');
  fs.mkdirSync(out, { recursive:true });
  const fixturesDir = path.join(out, 'fixtures'); 
  if (saveResponses) fs.mkdirSync(fixturesDir, { recursive:true });

  const items = [];
  if (har) items.push(...fromHAR(JSON.parse(fs.readFileSync(har,'utf8'))));
  if (cdp) items.push(...fromCDP(JSON.parse(fs.readFileSync(cdp,'utf8'))));

  const map = new Map();
  for (const r of items) {
    const k = keyFrom(r);
    const rec = map.get(k) || { 
      key:k, 
      method:r.method, 
      pathname: pathname(r.url), 
      query: sortedQuery(r.url), 
      count:0, 
      statuses:new Set(), 
      samples:[], 
      example:null 
    };
    rec.count++;
    if (r.res?.status) rec.statuses.add(String(r.res.status));
    if (!rec.example && r.postData) rec.example = r.postData;
    if (saveResponses && r.res?.text) {
      const fname = `fx_${hash(k)}.txt`;
      const buf = r.res.encoding==='base64' ? Buffer.from(r.res.text,'base64') : Buffer.from(r.res.text,'utf8');
      fs.writeFileSync(path.join(fixturesDir, fname), buf);
      rec.samples.push({ file: `fixtures/${fname}`, mime: r.res.mime||'' });
    }
    map.set(k, rec);
  }

  const index = [...map.values()].sort((a,b)=>b.count - a.count).map(x=>({
    key: x.key, 
    method: x.method, 
    pathname: x.pathname, 
    query: x.query,
    count: x.count, 
    statuses: [...x.statuses], 
    sample: x.samples[0]||null,
    fixture: x.samples[0]?.file || null
  }));

  fs.writeFileSync(path.join(out,'mock-index.json'), JSON.stringify(index, null, 2));
  console.log('Wrote', path.join(out,'mock-index.json'), 'endpoints:', index.length);
})();

/* auto-generated */
(()=> {
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('/sw.js').then(reg=>{
      if(!navigator.serviceWorker.controller){
        navigator.serviceWorker.addEventListener('controllerchange', ()=> location.reload(), { once:true });
      } else { reg.update().catch(()=>{}); }
    }).catch(()=>{});
  }
  // mirror индекс
  let MIRROR=null; async function getMirror(){ if(MIRROR) return MIRROR; try{ const r=await fetch('/mirrorIndex.json'); MIRROR=await r.json(); }catch{ MIRROR={}; } return MIRROR; }
  function norm(u){ try{ const x=new URL(u, location.href); x.hash=''; const arr=[...x.searchParams.entries()].sort(([a],[b])=>a.localeCompare(b)); x.search=''; for(const [k,v] of arr) x.searchParams.append(k,v); return x.toString(); } catch { return u; } }

  // fetch патч
  const origFetch = window.fetch.bind(window);
  window.fetch = async function(input, init){
    try{
      const url = typeof input==='string'? input : (input?.url||'');
      if(/^https?:///i.test(url)){
        const local = (await getMirror())[norm(url)];
        const method = (init?.method||'GET').toUpperCase();
        if(local && method==='GET'){ return origFetch(local, init); }
      }
    } catch {}
    return origFetch(input, init);
  };

  // XHR патч
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest){
    try{
      if(/^https?:///i.test(url)){
        getMirror().then(m=>{
          const n = norm(url);
          if(m[n] && String(method||'GET').toUpperCase()==='GET'){
            try { origOpen.call(this, method, m[n], ...rest); } catch { origOpen.call(this, method, url, ...rest); }
          } else {
            origOpen.call(this, method, url, ...rest);
          }
        });
        return;
      }
    } catch {}
    return origOpen.call(this, method, url, ...rest);
  };

  // Простой WS mock (replay) — оставляем базовым
  const origWS = window.WebSocket;
  let WS_MAP=null; async function getWsMap(){ if(WS_MAP) return WS_MAP; try{ const r=await fetch('/mocks/wsMap.json'); WS_MAP=await r.json(); }catch{ WS_MAP=[]; } return WS_MAP; }
  function normAbs(u){ try{ const x=new URL(u, location.href); x.hash=''; const p=[...x.searchParams.entries()].sort(([a],[b])=>a.localeCompare(b)); x.search=''; for(const [k,v] of p) x.searchParams.append(k,v); return x.toString(); }catch{return u} }
  class MockWS {
    constructor(url){ this.url=normAbs(url); this.readyState=0; this.binaryType='blob'; setTimeout(()=>{ this.readyState=1; this.onopen && this.onopen({type:'open'}); this._replay(); },0); }
    async _replay(){
      try{
        const map=await getWsMap(); const item = map.find(x=>x.url===this.url);
        if(!item){ this.close(); return; }
        const dump = await (await fetch(item.file)).json();
        const frames = (dump.frames||[]).filter(f=> f.dir==='in');
        let last = frames.length? frames[0].t : Date.now();
        for(const f of frames){
          const dt = Math.min(1000, Math.max(0, f.t - last)); await new Promise(r=> setTimeout(r, dt));
          let data = f.payload;
          if (f.opcode===2){ try { const bin=Uint8Array.from(atob(data), c=>c.charCodeAt(0)); data = (this.binaryType==='arraybuffer') ? bin.buffer : new Blob([bin.buffer]); } catch {} }
          this.onmessage && this.onmessage({ data, type:'message' }); last = f.t;
        }
      } finally { this.close(); }
    }
    send(){} close(){ if(this.readyState===3) return; this.readyState=3; this.onclose && this.onclose({ code:1000, reason:'offline-mock', wasClean:true }); }
    addEventListener(t, cb){ this['on'+t]=cb; } removeEventListener(t){ this['on'+t]=null; } dispatchEvent(){ return true; }
  }
  window.WebSocket = function(url, protocols){ return new MockWS(url, protocols); };
  window.WebSocket.prototype = origWS ? origWS.prototype : {};
})();

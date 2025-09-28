// Перехват fetch/XHR/sendBeacon → перенаправляем на SW (он обслужит по MOCKS)
(function(){
  const origFetch = window.fetch;
  window.fetch = function(input, init={}) {
    try {
      const url = typeof input === 'string' ? input : input.url;
      const u = new URL(url, location.href);
      if (u.origin !== location.origin) {
        // Превращаем в локальный алиас, чтобы SW видел и мог замокать
        const alias = './__ext__/' + encodeURIComponent(u.href);
        return origFetch(alias, init);
      }
    } catch {}
    return origFetch(input, init);
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, async, user, pw) {
    try {
      const u = new URL(url, location.href);
      if (u.origin !== location.origin) url = './__ext__/' + encodeURIComponent(u.href);
    } catch {}
    return origOpen.call(this, method, url, async!==false, user, pw);
  };

  const origBeacon = navigator.sendBeacon?.bind(navigator);
  if (origBeacon) {
    navigator.sendBeacon = function(url, data){
      try {
        const u = new URL(url, location.href);
        if (u.origin !== location.origin) url = './__ext__/' + encodeURIComponent(u.href);
      } catch {}
      try { return origBeacon(url, data); } catch { return true; }
    };
  }
})();

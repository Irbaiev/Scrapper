// src/inject/ws-hook.js
(() => {
  const NativeWS = window.WebSocket;

  // Безопасно вызвать привязку Playwright (exposeBinding)
  const callBridge = (payload) => {
    try {
      // имя биндинга зададим в скрипте: __wsTap
      window.__wsTap && window.__wsTap(payload);
    } catch (e) {
      // игнор
    }
  };

  const toBase64Async = (data) => new Promise((resolve) => {
    try {
      if (typeof data === 'string') {
        resolve({ opcode: 1, text: data });
        return;
      }
      // ArrayBuffer / TypedArray
      if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
        const u8 = data instanceof Uint8Array ? data : new Uint8Array(data.buffer || data);
        let bin = '';
        for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
        resolve({ opcode: 2, base64: btoa(bin) });
        return;
      }
      // Blob
      if (typeof Blob !== 'undefined' && data instanceof Blob) {
        const fr = new FileReader();
        fr.onload = () => {
          const u8 = new Uint8Array(fr.result);
          let bin = '';
          for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
          resolve({ opcode: 2, base64: btoa(bin) });
        };
        fr.readAsArrayBuffer(data);
        return;
      }
      // Fallback (неизвестный тип)
      resolve({ opcode: 2, base64: null, note: 'unknown payload type' });
    } catch (e) {
      resolve({ opcode: 2, base64: null, note: 'convert error' });
    }
  });

  // Генерим стабильный id для соединения
  const newConnId = () =>
    Math.random().toString(36).slice(2) + Date.now().toString(36);

  // Патчим конструктор
  window.WebSocket = class PatchedWS extends NativeWS {
    constructor(url, protocols) {
      super(url, protocols);
      const connId = newConnId();
      const origin = location.origin;

      // Сообщаем о создании
      callBridge({ type: 'ws-open', url: this.url || url, connId, origin, ts: Date.now() });

      // Входящие
      this.addEventListener('message', async (evt) => {
        const converted = await toBase64Async(evt.data);
        callBridge({ type: 'ws-frame', dir: 'in', connId, url: this.url || url, ts: Date.now(), ...converted });
      });

      // Закрытие/ошибка — полезно для оффлайн-реплея
      this.addEventListener('close', (evt) => {
        callBridge({ type: 'ws-close', connId, url: this.url || url, code: evt.code, reason: evt.reason, ts: Date.now() });
      });
      this.addEventListener('error', () => {
        callBridge({ type: 'ws-error', connId, url: this.url || url, ts: Date.now() });
      });

      // Переопределяем send
      const nativeSend = this.send;
      this.send = async function (data) {
        const converted = await toBase64Async(data);
        callBridge({ type: 'ws-frame', dir: 'out', connId, url: this.url || url, ts: Date.now(), ...converted });
        return nativeSend.call(this, data);
      };

      return this;
    }
  };
})();

/** The small wx surface used by the existing Canvas game, backed by browser APIs. */
export function installWechatBridge({canvas, surface, api, modal}) {
  const events = {start: [], move: [], end: [], hide: [], show: []};
  const transientStorage = new Map();
  let mainCreated = false;
  let activePointer = null;
  let lastPoint = null;
  const assetBase = new URL('./', location.href);
  function assetURL(file) {
    return new URL(String(file).replace(/^\//, '').replace(/\.wasm\.br$/, '.wasm'), assetBase).href;
  }
  function emit(name, payload) { for (const callback of events[name]) callback(payload); }
  function point(event) {
    const rect = canvas.getBoundingClientRect();
    return {identifier: event.pointerId, clientX: event.clientX - rect.left, clientY: event.clientY - rect.top};
  }
  function packet(touch, ending = false, canceled = false) {
    return {touches: ending ? [] : [touch], changedTouches: [touch], canceled};
  }
  function secondaryCanvas(width = 1, height = 1) {
    const target = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(width, height) : document.createElement('canvas');
    target.width = width;
    target.height = height;
    target.isOffscreenCanvas = true;
    return target;
  }
  canvas.addEventListener('pointerdown', event => {
    if (activePointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    activePointer = event.pointerId;
    lastPoint = point(event);
    try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
    emit('start', packet(lastPoint));
  });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== activePointer) return;
    event.preventDefault();
    lastPoint = point(event);
    emit('move', packet(lastPoint));
  });
  function finish(event, canceled) {
    if (event.pointerId !== activePointer) return;
    event.preventDefault();
    const end = canceled ? lastPoint : point(event);
    activePointer = null;
    emit('end', packet(end, true, canceled));
    try { canvas.releasePointerCapture(event.pointerId); } catch (_) {}
  }
  canvas.addEventListener('pointerup', event => finish(event, false));
  canvas.addEventListener('pointercancel', event => finish(event, true));
  canvas.addEventListener('lostpointercapture', event => {
    if (activePointer === event.pointerId) finish(event, true);
  });
  canvas.addEventListener('wheel', event => {
    if (activePointer !== null) return;
    event.preventDefault();
    const start = point(event);
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? surface.clientHeight : 1;
    const distance = Math.max(-240, Math.min(240, event.deltaY * unit));
    if (!distance) return;
    emit('start', packet(start));
    emit('move', packet({...start, clientY: start.clientY - distance}));
    emit('end', packet({...start, clientY: start.clientY - distance}, true));
  }, {passive: false});
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && activePointer !== null) {
      activePointer = null;
      emit('end', packet(lastPoint, true, true));
    }
    emit(document.hidden ? 'hide' : 'show');
  });
  const nativeWasm = globalThis.WebAssembly;
  if (nativeWasm) {
    const facade = Object.create(nativeWasm);
    facade.instantiateStreaming = undefined;
    facade.instantiate = async (source, imports) => {
      if (typeof source === 'string') {
        const response = await fetch(assetURL(source));
        if (!response.ok) throw new Error('PAG runtime file returned ' + response.status);
        source = await response.arrayBuffer();
      }
      return nativeWasm.instantiate(source, imports);
    };
    globalThis.WXWebAssembly = facade;
  }
  globalThis.wx = {
    env: {USER_DATA_PATH: '/preview-cache'},
    getSystemInfoSync() {
      const width = surface.clientWidth, height = surface.clientHeight;
      return {windowWidth: width, windowHeight: height, screenWidth: width, screenHeight: height,
        pixelRatio: Math.max(1, Math.min(2, devicePixelRatio || 1)),
        safeArea: {top: 16, bottom: height - 12}, platform: 'web', system: navigator.platform || 'Web'};
    },
    getStorageSync(key) {
      try { return localStorage.getItem('roles.web.wx.' + key) || ''; } catch (_) { return transientStorage.get(key) || ''; }
    },
    setStorageSync(key, value) {
      transientStorage.set(key, value);
      try { localStorage.setItem('roles.web.wx.' + key, String(value)); } catch (_) {}
    },
    removeStorageSync(key) {
      transientStorage.delete(key);
      try { localStorage.removeItem('roles.web.wx.' + key); } catch (_) {}
    },
    login(options) { queueMicrotask(() => options.success({code: 'web-preview'})); },
    request(options) {
      queueMicrotask(() => {
        const response = api.request(options.method || 'GET', options.url, options.data);
        options.success(response);
      });
    },
    createCanvas() { if (!mainCreated) { mainCreated = true; return canvas; } return secondaryCanvas(); },
    createOffscreenCanvas(options) { return secondaryCanvas(options.width, options.height); },
    createImage() { return new Image(); },
    createInnerAudioContext() {
      const audio=new Audio();audio.preload='auto';let alive=true;
      return {
        get src(){return audio.src;},set src(value){audio.src=assetURL(value);},
        get autoplay(){return audio.autoplay;},set autoplay(value){audio.autoplay=value;},
        get loop(){return audio.loop;},set loop(value){audio.loop=value;},
        get volume(){return audio.volume;},set volume(value){audio.volume=value;},
        play(){if(!alive)return;const playing=audio.play();if(playing)playing.catch(()=>{});},
        stop(){audio.pause();try{audio.currentTime=0;}catch(_){}},
        destroy(){if(!alive)return;alive=false;audio.pause();audio.removeAttribute('src');audio.load();},
        onCanplay(callback){audio.addEventListener('canplay',()=>{if(alive)callback();});},
        onError(callback){audio.addEventListener('error',()=>{if(alive)callback({errMsg:'Audio asset unavailable'});});},
      };
    },
    base64ToArrayBuffer(text) {
      const raw = atob(text), bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      return bytes.buffer;
    },
    getFileSystemManager() {
      return {accessSync() {}, mkdirSync() {}, readFile(options) {
        fetch(assetURL(options.filePath)).then(response => {
          if (!response.ok) throw new Error('Preview asset returned ' + response.status);
          return response.arrayBuffer();
        }).then(data => options.success({data}), error => options.fail({errMsg: error.message}));
      }};
    },
    onTouchStart(callback) { events.start.push(callback); },
    onTouchMove(callback) { events.move.push(callback); },
    onTouchEnd(callback) { events.end.push(callback); },
    onHide(callback) { events.hide.push(callback); },
    onShow(callback) { events.show.push(callback); },
    showModal(options) { modal(options); },
    showToast() {},
    vibrateShort() { if (typeof navigator.vibrate === 'function') navigator.vibrate(8); },
  };
}

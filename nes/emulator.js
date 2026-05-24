import { els } from './dom.js';
import { AudioEngine } from './audio.js';

const SCREEN_WIDTH = 256, SCREEN_HEIGHT = 240;
const ctx = els.canvas.getContext('2d', { alpha: false });
const imageData = ctx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);

let renderedFrames = 0;
export const getRenderedFrames = () => renderedFrames;
export const resetRenderedFrames = () => { renderedFrames = 0; };
export const getSystem = () => system;

let nes = null;
let currentROMBytes = null, currentROMName = null;
export const getCurrentROMBytes = () => currentROMBytes;
export const getCurrentROMName = () => currentROMName;
export let originalROMBytes = null, originalROMName = null;

let emuWorker = null, usingWorker = false;
let running = false;
let watchdogTimer = null;
let system = 'nes'; // 'nes' | 'gb'
let gbInited = false;
let gbJoypad = { up:false, down:false, left:false, right:false, a:false, b:false, start:false, select:false };
let gbInputRAF = null;

function getGB() {
  return (window.WasmBoy && (window.WasmBoy.WasmBoy || window.WasmBoy)) || null;
}

function bytesToBinaryString(bytes) {
  let out = ''; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) out += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return out;
}

// Detect GB ROM via Nintendo logo header pattern
function isGBROM(bytes) {
  if (!bytes || bytes.length < 0x150) return false;
  const logo = [
    0xCE,0xED,0x66,0x66,0xCC,0x0D,0x00,0x0B,0x03,0x73,0x00,0x83,0x00,0x0C,0x00,0x0D,
    0x00,0x08,0x11,0x1F,0x88,0x89,0x00,0x0E,0xDC,0xCC,0x6E,0xE6,0xDD,0xDD,0xD9,0x99,
    0xBB,0xBB,0x67,0x63,0x6E,0x0E,0xEC,0xCC,0xDD,0xDC,0x99,0x9F,0xBB,0xB9,0x33,0x3E
  ];
  for (let i = 0; i < logo.length; i++) {
    if (bytes[0x104 + i] !== logo[i]) return false;
  }
  return true;
}

function startLoop() {
  if (running) return;
  running = true;
  if (system === 'nes' && usingWorker && emuWorker) emuWorker.postMessage({ type: 'resume' });
  if (system === 'gb') { startGBInputLoop(); getGB()?.play?.(); }
}

function stopLoop() {
  running = false;
  if (usingWorker && emuWorker) emuWorker.postMessage({ type: 'pause' });
  if (system === 'gb') getGB()?.pause?.();
  stopGBInputLoop();
}

function clearWatchdog(){ if (watchdogTimer){ clearTimeout(watchdogTimer); watchdogTimer=null; } }
function armWatchdog(bytes, name){
  clearWatchdog();
  watchdogTimer = setTimeout(() => {
    els.statusText.textContent = 'Emulator stalled — restarting…';
    restartWorker(bytes, name);
  }, 3000);
}

// Ensure canvas has correct pixel size after switching systems
function applyCanvasForSystem(sys) {
  if (sys === 'gb') {
    els.canvas.width = 160; els.canvas.height = 144;
  } else {
    els.canvas.width = 256; els.canvas.height = 240;
  }
  els.wrap.dataset.system = sys; // tag wrapper for fullscreen sizing
  els.wrap.dataset.gbMode = getGBMode();
  els.canvas.style.width = '100%';
  els.canvas.style.height = 'auto';
  els.canvas.style.imageRendering = 'pixelated';
}

export const emulator = {
  create: () => {
    try {
      emuWorker = new Worker('emuWorker.js');
      emuWorker.onmessage = (e) => {
        const { type } = e.data || {};
        if (type === 'ready') {
          usingWorker = true;
          els.statusText.textContent = 'Using Worker (jsnes)';
          if (window._pendingLoad) {
            const { bytes, name } = window._pendingLoad;
            loadBytes(bytes, name);
            window._pendingLoad = null;
          }
        } else if (type === 'frame') {
          const buf = new Uint8ClampedArray(e.data.buffer);
          imageData.data.set(buf);
          ctx.putImageData(imageData, 0, 0);
          renderedFrames++;
        } else if (type === 'audio') {
          const L = new Float32Array(e.data.left); const R = new Float32Array(e.data.right);
          for (let i = 0; i < L.length; i++) AudioEngine.enqueueSample(L[i], R[i]);
        } else if (type === 'loaded') {
          clearWatchdog();
          els.pauseBtn.disabled = false;
          els.resetBtn.disabled = false;
          AudioEngine.resume();
          els.dropHint.style.display = 'none';
          startLoop();
          els.wrap.focus();
        } else if (type === 'error') {
          console.error(e.data.message);
          els.statusText.textContent = e.data.message || 'Worker error';
          restartWorker(currentROMBytes, currentROMName);
        }
      };
      emuWorker.postMessage({ type: 'init' });
    } catch (e) {
      console.error("Failed to create worker", e);
      els.statusText.textContent = 'Failed to load emulator worker.';
    }
  },

  get worker() { return emuWorker; },
  get isRunning() { return running; },

  pause: () => {
    if (!running) return;
    stopLoop();
    AudioEngine.pause();
    els.pauseBtn.textContent = 'Resume';
    els.statusText.textContent = 'Paused';
  },

  resume: () => {
    if (running) return;
    if (system === 'nes') AudioEngine.resume();
    startLoop();
    els.pauseBtn.textContent = 'Pause';
    els.statusText.textContent = 'Running';
  },

  reset: () => {
    try {
      stopLoop(); AudioEngine.clear();
      if (system === 'gb') { 
        getGB()?.reset?.(); 
        startLoop(); 
        els.pauseBtn.textContent='Pause'; 
        els.statusText.textContent='Reset'; 
        return; 
      }
      if (usingWorker && emuWorker && currentROMBytes) {
        loadBytes(currentROMBytes, currentROMName);
        els.pauseBtn.textContent = 'Pause'; els.statusText.textContent = 'Reset';
        return;
      }
    } catch (e) { console.error(e); }
  },

  corruptRAM: (seed, count) => {
    if (usingWorker && emuWorker) {
      emuWorker.postMessage({ type: 'corruptRAM', payload: { seed, count } });
      return true;
    }
    return false;
  },
  button: (btnCode, down) => {
    if (system === 'nes') {
      emuWorker?.postMessage({ type:'button', payload:{ player:1, btn: btnCode, down } });
    } else if (system === 'gb') {
      const map = {
        [jsnes.Controller.BUTTON_UP]:'up',
        [jsnes.Controller.BUTTON_DOWN]:'down',
        [jsnes.Controller.BUTTON_LEFT]:'left',
        [jsnes.Controller.BUTTON_RIGHT]:'right',
        [jsnes.Controller.BUTTON_A]:'a',
        [jsnes.Controller.BUTTON_B]:'b',
        [jsnes.Controller.BUTTON_START]:'start',
        [jsnes.Controller.BUTTON_SELECT]:'select'
      };
      const k = map[btnCode]; if (!k) return;
      gbJoypad[k] = !!down; 
    }
  },
  setGBMode: (mode) => {
    try {
      els.wrap.dataset.gbMode = mode;
      localStorage.setItem('gbMode', mode);
      if (system === 'gb' && currentROMBytes && getGB()) {
        (async () => {
          const wasRunning = running;
          stopLoop();
          await getGB().config({ isGbcEnabled: (mode === 'gbc') });
          await getGB().loadROM(currentROMBytes);
          if (wasRunning) startLoop();
        })();
      }
    } catch (e) { console.error(e); }
  }
};

function restartWorker(bytes, name){
  try { emuWorker?.terminate?.(); } catch {}
  emuWorker = null; usingWorker = false; running = false;
  els.pauseBtn.disabled = true; els.resetBtn.disabled = true;
  window._pendingLoad = (bytes && name) ? { bytes: bytes.slice(), name } : window._pendingLoad;
  emulator.create();
}

export function loadBytes(bytes, name) {
  currentROMBytes = bytes.slice(); currentROMName = name;
  const byExtGB = /\.gbc?$/i.test(name || '');
  const byHeaderGB = isGBROM(bytes);
  const isGB = byExtGB || byHeaderGB;
  if (isGB && getGB()) {
    system = 'gb'; running = false;
    try { emuWorker?.terminate?.(); } catch {}
    usingWorker = false; emuWorker = null;
    (async () => {
      try {
        const GB = getGB();
        if (!GB) { els.statusText.textContent = 'WasmBoy not available'; return; }
        if (!gbInited) {
          await GB.config({
            isAudioEnabled: true, isGbcEnabled: (getGBMode() === 'gbc'), frameSkip: 0,
            isWasmBoyUsingWorkers: false,
            wasmUrl: 'https://unpkg.com/wasmboy@0.7.1/dist/wasmboy.wasm'
          });
          await GB.setCanvas(els.canvas);
          await GB.disableDefaultJoypad();
          gbInited = true;
        } else {
          await GB.config({
            isGbcEnabled: (getGBMode() === 'gbc'),
            isWasmBoyUsingWorkers: false,
            wasmUrl: 'https://unpkg.com/wasmboy@0.7.1/dist/wasmboy.wasm'
          });
        }
        applyCanvasForSystem('gb');
        els.touchControls?.classList.add('gb');
        await GB.loadROM(bytes);
        els.dropHint.style.display = 'none';
        els.statusText.textContent = `Loaded (Game Boy): ${name}`;
        els.pauseBtn.disabled = false; els.resetBtn.disabled = false;
        // Auto-show on-screen controls for touch devices if no preference saved
        if (('ontouchstart' in window) && localStorage.getItem('touchControls') == null && els.touchControls && els.toggleTouchBtn) {
          els.touchControls.hidden = false;
          els.toggleTouchBtn.setAttribute('aria-pressed', 'true');
          els.toggleTouchBtn.textContent = 'Hide On-Screen Controls';
          localStorage.setItem('touchControls', '1');
        }
        els.wrap.focus();
        startLoop();
      } catch (err) {
        console.error('GB load failed:', err);
        let msg = '';
        if (err && typeof err === 'object' && 'text' in err && typeof err.text === 'function') {
          try { msg = await err.text(); } catch {}
        }
        els.statusText.textContent = `GB load failed: ${err?.message || msg || String(err)}`;
      }
    })();
    return;
  }
  system = 'nes';
  applyCanvasForSystem('nes');
  els.touchControls?.classList.remove('gb');
  // Ensure GB is paused when switching back to NES
  try { getGB()?.pause?.(); } catch {}
  if (emuWorker) {
    if (usingWorker) {
      const copy = bytes.slice();
      emuWorker.postMessage({ type: 'loadROM', payload: { bytes: copy.buffer } }, [copy.buffer]);
      els.dropHint.style.display = 'none';
      els.statusText.textContent = `Loaded: ${name}`;
      els.pauseBtn.disabled = false; els.resetBtn.disabled = false;
      AudioEngine.resume();
      running = true;
      armWatchdog(bytes.slice(), name);
    } else {
      window._pendingLoad = { bytes: bytes.slice(), name };
      els.statusText.textContent = 'Waiting for worker…';
      els.dropHint.style.display = 'none';
    }
  } else {
    // No worker (likely after GB) — recreate and queue the load
    window._pendingLoad = { bytes: bytes.slice(), name };
    els.statusText.textContent = 'Starting NES worker…';
    emulator.create();
  }
}

export async function loadROMFromFile(file) {
  if (!file) return;
  els.statusText.textContent = `Loading ${file.name}…`;
  try {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    originalROMBytes = bytes.slice(); originalROMName = file.name;
    loadBytes(bytes, file.name);
    els.romInput.value = '';
  } catch (e) {
    console.error(e);
    els.statusText.textContent = 'Failed to load ROM';
  }
}

export async function loadROMFromURL(url, name = url.split('/').pop()) {
  els.statusText.textContent = `Loading ${name}…`;
  try {
    const safeUrl = url.includes("'") ? url.replace(/'/g, '%27') : url;
    const res = await fetch(encodeURI(safeUrl));
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const urlExt = (url.match(/\.[A-Za-z0-9]+$/) || [])[0] || '';
    const normalizedName = /\.[A-Za-z0-9]+$/.test(name) ? name : (name + urlExt);
    originalROMBytes = bytes.slice(); originalROMName = normalizedName;
    loadBytes(bytes, normalizedName);
  } catch (e) {
    console.error(e);
    els.statusText.textContent = `Failed to load ROM: ${name}`;
  }
}

function startGBInputLoop() {
  if (gbInputRAF) return;
  const tick = () => {
    if (system === 'gb' && running) { getGB()?.setJoypadState?.(gbJoypad); }
    gbInputRAF = requestAnimationFrame(tick);
  };
  gbInputRAF = requestAnimationFrame(tick);
}

function stopGBInputLoop() { if (gbInputRAF) { cancelAnimationFrame(gbInputRAF); gbInputRAF = null; } }

function getGBMode() { return localStorage.getItem('gbMode') || 'mono'; }
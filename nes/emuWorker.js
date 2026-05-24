// Worker: jsnes loop off the main thread to avoid UI freezes
let nes = null;
let running = false;
let rafTimer = null;

function xmur3(str){let h=1779033703^str.length;for(let i=0;i<str.length;i++)h=Math.imul(h^str.charCodeAt(i),3432918353),h=h<<13|h>>>19;return ()=>{h=Math.imul(h^h>>>16,2246822507);h=Math.imul(h^h>>>13,3266489909);return (h^h>>>16)>>>0;};}
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
function corruptBytes(bytes, seed, count=25, skip=16){if(!seed) return bytes; const seedFn=xmur3(seed), rnd=mulberry32(seedFn()); const n=bytes.length; const used=new Set(); for(let i=0;i<count && n>skip;i++){let idx; do{idx=skip+Math.floor(rnd()*(n-skip));}while(used.has(idx)); used.add(idx); bytes[idx]=Math.floor(rnd()*256);} return bytes;}

function bytesToBinaryString(bytes) {
  let out = ''; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) out += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return out;
}

function startLoop() {
  if (running) return;
  running = true;
  const STEP = 1000/60;
  let last = performance.now();
  function tick() {
    if (!running) return;
    const now = performance.now();
    let framesToRun = Math.floor((now - last)/STEP);
    if (framesToRun < 1) { rafTimer = setTimeout(tick, 1); return; }
    framesToRun = Math.min(framesToRun, 2);
    for (let i=0;i<framesToRun;i++){
      try {
        nes.frame();
      } catch (e) {
        running = false;
        postMessage({ type:'error', message: 'Frame error: '+e.message });
        return;
      }
      last += STEP;
    }
    rafTimer = setTimeout(tick, 0);
  }
  tick();
}
function stopLoop(){ running = false; if (rafTimer) clearTimeout(rafTimer); rafTimer = null; }

self.onmessage = async (e) => {
  const { type, payload } = e.data || {};
  if (type === 'init') {
    importScripts('https://unpkg.com/jsnes/dist/jsnes.min.js');
    nes = new self.jsnes.NES({
      onFrame: (frame) => {
        // frame could be RGB array or packed; normalize to RGBA Uint8ClampedArray
        let out;
        if (frame.length === 256*240*3) {
          out = new Uint8ClampedArray(256*240*4);
          for (let i=0, j=0, k=0; i<frame.length; i+=3) {
            out[j++] = frame[i]; out[j++] = frame[i+1]; out[j++] = frame[i+2]; out[j++] = 255;
          }
        } else if (frame.length === 256*240) {
          out = new Uint8ClampedArray(256*240*4);
          for (let i=0, j=0; i<frame.length; i++) {
            const px = frame[i];
            out[j++] = px & 0xFF;
            out[j++] = (px >> 8) & 0xFF;
            out[j++] = (px >> 16) & 0xFF;
            out[j++] = 255;
          }
        } else {
          return;
        }
        postMessage({ type:'frame', buffer: out.buffer }, [out.buffer]);
      },
      onAudioSample: (l, r) => {
        // batch send small chunks
        if (!self._al) { self._al = []; self._ar = []; self._ac = 0; }
        self._al.push(l); self._ar.push(r); self._ac++;
        if (self._ac >= 2048) {
          const L = new Float32Array(self._al); const R = new Float32Array(self._ar);
          postMessage({ type:'audio', left: L.buffer, right: R.buffer }, [L.buffer, R.buffer]);
          self._al = []; self._ar = []; self._ac = 0;
        }
      }
    });
    if (typeof nes.stop !== 'function') nes.stop = () => {};
    postMessage({ type:'ready' });
  } else if (type === 'loadROM') {
    try {
      stopLoop();
      const bytes = new Uint8Array(payload.bytes);
      const romStr = bytesToBinaryString(bytes);
      nes.loadROM(romStr);
      startLoop();
      postMessage({ type:'loaded' });
    } catch (err) {
      postMessage({ type:'error', message: 'Load ROM failed' });
    }
  } else if (type === 'pause') {
    stopLoop();
  } else if (type === 'resume') {
    startLoop();
  } else if (type === 'reset') {
    try { nes.reset(); } catch {}
    startLoop();
  } else if (type === 'button') {
    const { player, btn, down } = payload;
    try { nes[down ? 'buttonDown' : 'buttonUp'](player, btn); } catch {}
  } else if (type === 'corruptRAM') {
    try {
      const { seed, count } = payload;
      const mem = nes?.cpu?.mem || nes?.cpu?.memory;
      if (mem && mem.length) corruptBytes(mem, seed, count, 0x10);
      postMessage({ type:'ramCorrupted' });
    } catch (e) {
      postMessage({ type:'error', message: 'RAM corruption failed' });
    }
  }
};
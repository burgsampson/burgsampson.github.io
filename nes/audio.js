import { els } from './dom.js';

export const AudioEngine = (() => {
  let audioCtx = null, gain = null, node = null;
  const bufferL = [], bufferR = [];
  let muted = false;

  function ensureContext() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)(); // use device sampleRate
    gain = audioCtx.createGain();
    gain.gain.value = parseFloat(els.volume.value);
    node = audioCtx.createScriptProcessor(1024, 0, 2);
    node.onaudioprocess = (e) => {
      const outL = e.outputBuffer.getChannelData(0);
      const outR = e.outputBuffer.getChannelData(1);
      const len = outL.length;
      for (let i = 0; i < len; i++) {
        outL[i] = (!muted && bufferL.length) ? bufferL.shift() : 0;
        outR[i] = (!muted && bufferR.length) ? bufferR.shift() : 0;
      }
    };
    node.connect(gain);
    gain.connect(audioCtx.destination);
  }

  function enqueueSample(l, r) {
    bufferL.push(l); bufferR.push(r);
    const MAX = 8192; const over = bufferL.length - MAX;
    if (over > 0) { bufferL.splice(0, over); bufferR.splice(0, over); }
  }

  function resume() { ensureContext(); audioCtx.resume?.(); }
  function pause() { audioCtx?.suspend?.(); }
  function setMuted(m) { muted = m; }
  function setVolume(v) { if (gain) gain.gain.value = v; }
  function context() { ensureContext(); return audioCtx; }
  function sampleRate() { ensureContext(); return audioCtx.sampleRate; }
  function clear() { bufferL.length = 0; bufferR.length = 0; }

  return { enqueueSample, resume, pause, setMuted, setVolume, context, sampleRate, clear, get muted(){return muted;} }
})();
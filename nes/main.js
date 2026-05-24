// Minimal, clean NES emulator powered by jsnes.
const SCREEN_WIDTH = 256, SCREEN_HEIGHT = 240;

import { els } from './dom.js';
import { AudioEngine } from './audio.js';
import { emulator, loadROMFromURL, getRenderedFrames, resetRenderedFrames, getSystem } from './emulator.js';
import { setupUI } from './ui.js';
import { setupSeeds } from './seeds.js';

function main() {
  // Initialize emulator
  emulator.create();

  // Setup UI event listeners
  setupUI();

  // Global error handlers
  window.addEventListener('unhandledrejection', (e) => {
    e.preventDefault?.();
    console.error('unhandledRejection:', e.reason);
    els.statusText.textContent = `Error: ${e?.reason?.message || String(e?.reason || 'Unknown error')}`;
  });
  window.addEventListener('error', (e) => {
    console.error('error:', e.error || e.message);
    els.statusText.textContent = `Error: ${e?.error?.message || e?.message || 'Unknown error'}`;
  });

  // Setup seed sharing functionality
  setupSeeds();

  // Auto-load bundled ROM based on selector, and react to changes
  els.gameSelect?.addEventListener('change', () => {
    const path = els.gameSelect.value;
    const name = els.gameSelect.options[els.gameSelect.selectedIndex].textContent;
    loadROMFromURL(path, name);
  });
  loadROMFromURL('/Super Mario Bros. (Japan, USA).nes', 'Super Mario Bros. (Japan, USA)');

  // FPS monitor
  let lastFpsTime = performance.now();
  function fpsTick() {
    const now = performance.now();
    if (getSystem() === 'gb') { 
      els.fpsText.textContent = ''; 
      lastFpsTime = now; 
      resetRenderedFrames(); 
      requestAnimationFrame(fpsTick); 
      return; 
    }
    if (now - lastFpsTime >= 1000) {
      const frames = getRenderedFrames();
      resetRenderedFrames();
      els.fpsText.textContent = `${frames} fps`;
      lastFpsTime = now;
    }
    requestAnimationFrame(fpsTick);
  }
  fpsTick();

  // Start audio on first interaction (mobile-friendly)
  const onceResume = () => AudioEngine.resume();
  ['click', 'touchstart', 'keydown'].forEach(ev => {
    window.addEventListener(ev, onceResume, { once: true, passive: true });
  });
}

main();
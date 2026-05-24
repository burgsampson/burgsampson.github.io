import { els } from './dom.js';
import { AudioEngine } from './audio.js';
import { emulator, loadROMFromFile, loadBytes, originalROMBytes, originalROMName } from './emulator.js';
import { corruptBytes } from './corruption.js';

function togglePause() {
  if (emulator.isRunning) {
    emulator.pause();
  } else {
    emulator.resume();
  }
}

export function corruptAndReload() {
  if (!originalROMBytes) {
    els.statusText.textContent = 'Load a ROM first';
    return;
  }
  let seed = (els.seedInput?.value || '').trim();
  const mode = (els.modeSelect?.value || 'rom');
  const count = Math.max(1, Math.min(65536, parseInt(els.byteCountInput?.value, 10) || 25));

  if (!seed) {
    seed = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    if (els.seedInput) els.seedInput.value = seed;
  }

  if (mode === 'ram') {
    const ok = emulator.corruptRAM(seed, count);
    els.statusText.textContent = ok ? `RAM corrupted • seed: ${seed} • bytes: ${count}` : 'RAM corruption failed';
    return;
  }

  const src = originalROMBytes.slice();
  corruptBytes(src, seed, count);
  const nameWithExt = (() => {
    const n = originalROMName || 'rom.gb';
    const m = n.match(/^(.*?)(\.[A-Za-z0-9]+)$/);
    return m ? `${m[1]} (corrupted)${m[2]}` : `${n} (corrupted)`;
  })();
  loadBytes(src, nameWithExt);
  els.statusText.textContent = `ROM corrupted • seed: ${seed} • bytes: ${count}`;
}

const keyMap = {
  'ArrowUp': { player: 1, button: jsnes.Controller.BUTTON_UP },
  'ArrowDown': { player: 1, button: jsnes.Controller.BUTTON_DOWN },
  'ArrowLeft': { player: 1, button: jsnes.Controller.BUTTON_LEFT },
  'ArrowRight': { player: 1, button: jsnes.Controller.BUTTON_RIGHT },
  'KeyW': { player: 1, button: jsnes.Controller.BUTTON_UP },
  'KeyS': { player: 1, button: jsnes.Controller.BUTTON_DOWN },
  'KeyA': { player: 1, button: jsnes.Controller.BUTTON_LEFT },
  'KeyD': { player: 1, button: jsnes.Controller.BUTTON_RIGHT },
  'KeyX': { player: 1, button: jsnes.Controller.BUTTON_A },
  'KeyK': { player: 1, button: jsnes.Controller.BUTTON_A },
  'KeyZ': { player: 1, button: jsnes.Controller.BUTTON_B },
  'KeyJ': { player: 1, button: jsnes.Controller.BUTTON_B },
  'Enter': { player: 1, button: jsnes.Controller.BUTTON_START },
  'ShiftRight': { player: 1, button: jsnes.Controller.BUTTON_SELECT },
};

function handleKey(e, isDown) {
  const mapping = keyMap[e.code];
  if (mapping) {
    e.preventDefault();
    emulator.button(mapping.button, isDown);
  } else if (isDown) {
    if (e.code === 'KeyP') togglePause();
    if (e.code === 'KeyR') emulator.reset();
  }
}

export function setupUI() {
  els.romInput.addEventListener('change', (e) => loadROMFromFile(e.target.files?.[0]));
  els.openRomBtn?.addEventListener('click', () => els.romInput?.click());

  ['dragenter', 'dragover'].forEach(ev => els.wrap.addEventListener(ev, (e) => {
    e.preventDefault(); e.stopPropagation(); els.dropHint.style.color = '#bbb';
  }));
  ['dragleave', 'drop'].forEach(ev => els.wrap.addEventListener(ev, (e) => {
    e.preventDefault(); e.stopPropagation(); els.dropHint.style.color = '#ddd';
  }));
  els.wrap.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files?.[0];
    if (file) loadROMFromFile(file);
  });

  els.pauseBtn.addEventListener('click', togglePause);
  els.resetBtn.addEventListener('click', () => emulator.reset());

  els.fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) els.wrap.requestFullscreen?.();
    else document.exitFullscreen?.();
  });

  els.muteBtn.addEventListener('click', () => {
    const next = !AudioEngine.muted;
    AudioEngine.setMuted(next);
    els.muteBtn.setAttribute('aria-pressed', String(next));
    els.muteBtn.textContent = next ? 'Unmute' : 'Mute';
  });

  els.volume.addEventListener('input', (e) => AudioEngine.setVolume(parseFloat(e.target.value)));

  document.getElementById('seedSubmitBtn').addEventListener('click', corruptAndReload);

  ['keydown', 'keyup'].forEach(type => els.wrap.addEventListener(type, (e) => handleKey(e, type === 'keydown')));

  els.controlsBtn?.addEventListener('click', () => els.controlsDialog?.showModal());
  els.creditsBtn?.addEventListener('click', () => els.creditsDialog?.showModal());
  document.querySelectorAll('[data-close-dialog]').forEach(btn => btn.addEventListener('click', (e) => e.target.closest('dialog')?.close()));
  els.seedRandomBtn?.addEventListener('click', () => {
    const seed = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    if (els.seedInput) els.seedInput.value = seed;
    corruptAndReload();
  });

  // GB display mode selector
  const gbMode = localStorage.getItem('gbMode') || 'mono';
  if (els.gbPaletteSelect) {
    els.gbPaletteSelect.value = gbMode;
    els.gbPaletteSelect.addEventListener('change', () => {
      const mode = els.gbPaletteSelect.value;
      localStorage.setItem('gbMode', mode);
      emulator.setGBMode(mode);
    });
  }

  setupTouchControls();
  setupResponsiveControls();
}

function setupTouchControls() {
  const btnForData = {
    UP: 'ArrowUp', DOWN: 'ArrowDown',
    LEFT: 'ArrowLeft', RIGHT: 'ArrowRight',
    A: 'KeyX', B: 'KeyZ',
    START: 'Enter', SELECT: 'ShiftRight'
  };

  const bindButton = (el) => {
    const code = btnForData[el.dataset.btn]; if (!code) return;
    const activePointers = new Set();
    const dispatchKey = (type) => els.wrap.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    const down = (e) => {
      e.preventDefault(); els.wrap.focus();
      activePointers.add(e.pointerId ?? -1);
      if (typeof e.pointerId === 'number' && e.type.startsWith('pointer')) { try { el.setPointerCapture(e.pointerId); } catch {} }
      el.classList.add('active'); dispatchKey('keydown'); navigator.vibrate?.(10);
    };
    const up = (e) => { e.preventDefault(); if (!activePointers.has(e.pointerId ?? -1)) return; activePointers.delete(e.pointerId ?? -1); if (activePointers.size===0){ el.classList.remove('active'); dispatchKey('keyup'); } };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('mousedown', down);
    window.addEventListener('mouseup', up);
  };

  els.touchControls?.querySelectorAll('[data-btn]')?.forEach(bindButton);

  // remember original location to restore after fullscreen
  const anchor = document.createComment('touch-controls-anchor');
  const parent = els.touchControls.parentElement;
  parent?.insertBefore(anchor, els.touchControls.nextSibling);

  document.addEventListener('fullscreenchange', () => {
    const fs = document.fullscreenElement === els.wrap;
    if (fs) {
      els.wrap.appendChild(els.touchControls);
      els.touchControls.classList.add('in-fullscreen');
    } else {
      anchor.parentNode?.insertBefore(els.touchControls, anchor);
      els.touchControls.classList.remove('in-fullscreen');
    }
  });

  const persisted = localStorage.getItem('touchControls');
  const initialVisible = persisted ? (persisted === '1') : ('ontouchstart' in window);
  const setVisible = (v) => {
    if (!els.touchControls || !els.toggleTouchBtn) return;
    els.touchControls.hidden = !v;
    els.toggleTouchBtn.setAttribute('aria-pressed', String(v));
    els.toggleTouchBtn.textContent = v ? 'Hide On-Screen Controls' : 'Show On-Screen Controls';
    localStorage.setItem('touchControls', v ? '1' : '0');
  };
  setVisible(initialVisible);

  els.toggleTouchBtn?.addEventListener('click', () => setVisible(els.touchControls.hidden));
  els.touchControls?.addEventListener('contextmenu', (e) => e.preventDefault());
}

function setupResponsiveControls() {
  const controls = els.controlsContainer; if (!controls) return;
  const anchor = document.createComment('controls-anchor');
  controls.parentElement.insertBefore(anchor, controls);
  const BREAKPOINT = 860; // px: use pop-out menu at/under this width
  const apply = () => {
    const useMenu = window.innerWidth <= BREAKPOINT;
    if (useMenu) {
      if (controls.parentElement !== els.menuControlsSlot) els.menuControlsSlot.appendChild(controls);
      controls.classList.add('stacked'); els.menuBtn.hidden = false;
    } else {
      if (controls.parentNode !== anchor.parentNode) anchor.parentNode.insertBefore(controls, anchor.nextSibling);
      controls.classList.remove('stacked'); els.menuBtn.hidden = true; if (els.menuDialog.open) els.menuDialog.close();
    }
  };
  apply();
  let rt; const schedule = () => { clearTimeout(rt); rt = setTimeout(apply, 150); };
  addEventListener('resize', schedule); addEventListener('orientationchange', schedule);
  els.menuBtn.addEventListener('click', () => els.menuDialog.showModal());
  els.menuDialog?.addEventListener('close', () => { /* no-op */ });
}
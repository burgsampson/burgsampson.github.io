import { els } from './dom.js';
import { loadROMFromURL, originalROMName, getCurrentROMName } from './emulator.js';
import { corruptAndReload } from './ui.js';
import WebsimSocket from '@websim/websim-socket';

const room = new WebsimSocket();
let allSeeds = [];
let currentPage = 1;
let features = [];
let isBK = false;
let seedsV1 = [], seedsV2 = [];
let featuresV1 = [], featuresV2 = [];

function clean(str, max = 120) {
  str = (str || '').trim();
  if (str.length > max) str = str.slice(0, max);
  return str.replace(/[\x00-\x1F\x7F]/g, ''); // only remove control chars, preserve case
}

async function postSeed() {
  const title = clean(els.seedTitleInput.value, 120);
  const seed = clean(els.seedInput.value, 80);
  const mode = (els.modeSelect?.value || 'rom');
  const byteCount = Math.max(1, Math.min(65536, parseInt(els.byteCountInput?.value, 10) || 25));
  const rom = els.gameSelect?.options[els.gameSelect.selectedIndex]?.textContent || (originalROMName || 'Super Mario Bros. (Japan, USA)');
  if (!title || !seed) {
    els.statusText.textContent = 'Title and seed required';
    return;
  }
  try {
    await room.collection('seed_v2').create({ title, seed, mode, rom, byteCount });
    els.seedTitleInput.value = '';
    els.statusText.textContent = 'Seed posted';
  } catch (e) {
    console.error(e);
    els.statusText.textContent = 'Failed to post seed';
  }
}

/* Add a normalizer so v1 and v2 render uniformly */
function normalizeSeed(s) {
  return {
    id: s.id,
    title: s.title || s.name || 'Untitled',
    seed: s.seed || s.value || '',
    mode: (s.mode || 'rom'),
    rom: s.rom || s.game || 'Super Mario Bros. (Japan, USA)',
    byteCount: s.byteCount || s.bytes || 25,
    username: s.username,
    created_at: s.created_at
  };
}

/* Merge V1 + V2 then render */
function mergeAndRender() {
  const merged = [...seedsV1, ...seedsV2].map(normalizeSeed)
    .sort((a,b) => (new Date(b.created_at||0)) - (new Date(a.created_at||0)));
  renderSeeds(merged);
  renderFeatured();
}

function renderSeeds(seeds) {
  allSeeds = seeds.slice();
  const q = (els.seedSearchInput?.value || '').toLowerCase().trim();
  const list = els.seedList;
  list.textContent = '';

  const filtered = allSeeds.filter(s => {
    const u = `@${s.username || ''}`.toLowerCase();
    return [s.title, s.seed, s.mode, s.rom, u].some(v => (v || '').toLowerCase().includes(q));
  });

  const size = 10;
  const totalPages = Math.ceil(Math.max(1, filtered.length) / size);
  currentPage = Math.max(1, Math.min(currentPage, totalPages));

  const start = (currentPage - 1) * size;
  const pageItems = filtered.slice(start, start + size);

  pageItems.forEach(s => {
    const item = document.createElement('div'); item.className = 'seed-item';
    const meta = document.createElement('div'); meta.className = 'seed-meta';
    const title = document.createElement('div'); title.textContent = s.title;
    const info = document.createElement('div'); info.className = 'muted';
    const mode = s.mode || 'rom';
    info.textContent = `by @${s.username} — ROM: ${s.rom} — Mode: ${mode.toUpperCase()} — Bytes: ${s.byteCount || 25}`;
    meta.append(title, info);

    const actions = document.createElement('div'); actions.className = 'seed-actions';
    const useBtn = document.createElement('button'); useBtn.textContent = 'Use Seed';
    useBtn.addEventListener('click', async () => {
      const romLabel = (s.rom || 'Super Mario Bros. (Japan, USA)').replace(/\.nes$/i, '');
      if (els.gameSelect) {
        let found = false;
        for (let i = 0; i < els.gameSelect.options.length; i++) {
          const label = els.gameSelect.options[i].textContent.replace(/\.nes$/i, '');
          if (label.toLowerCase() === romLabel.toLowerCase()) {
            els.gameSelect.selectedIndex = i;
            found = true;
            break;
          }
        }
        if (!found) els.gameSelect.selectedIndex = 0;
      }

      const selectedPath = els.gameSelect?.value;
      const selectedName = els.gameSelect?.options[els.gameSelect.selectedIndex]?.textContent;

      if (getCurrentROMName() !== selectedName) {
        await loadROMFromURL(selectedPath, selectedName);
      }

      els.seedInput.value = s.seed;
      if (els.modeSelect) els.modeSelect.value = s.mode || 'rom';
      if (els.byteCountInput) els.byteCountInput.value = s.byteCount || 25;

      corruptAndReload();
    });

    actions.append(useBtn);
    if (isBK) {
      const f2 = featuresV2.find(f => f.seed_id === s.id);
      const fb = document.createElement('button'); fb.textContent = f2 ? 'Unfeature' : 'Feature';
      fb.addEventListener('click', () => toggleFeature(s.id, !!f2, f2?.id));
      actions.append(fb);
    }
    item.append(meta, actions);
    list.append(item);
  });

  if (els.pageInfo) els.pageInfo.textContent = `Page ${currentPage} / ${totalPages} • ${filtered.length} results`;
  if (els.prevPageBtn) els.prevPageBtn.disabled = (currentPage <= 1);
  if (els.nextPageBtn) els.nextPageBtn.disabled = (currentPage >= totalPages);
}

function renderFeatured() {
  const list = els.featuredList; if (!list) return;
  list.textContent = '';
  const combinedFeatures = [...featuresV1, ...featuresV2];
  const featuredSeeds = combinedFeatures.map(f => allSeeds.find(s => s.id === f.seed_id)).filter(Boolean);
  featuredSeeds.forEach(s => {
    const item = document.createElement('div'); item.className = 'seed-item';
    const meta = document.createElement('div'); meta.className = 'seed-meta';
    const t = document.createElement('div'); t.textContent = s.title;
    const i = document.createElement('div'); i.className = 'muted';
    i.textContent = `by @${s.username} — ROM: ${s.rom} — Mode: ${(s.mode||'rom').toUpperCase()} — Bytes: ${s.byteCount||25}`;
    meta.append(t,i);
    const actions = document.createElement('div'); actions.className = 'seed-actions';
    const useBtn = document.createElement('button'); useBtn.textContent = 'Use Seed';
    useBtn.addEventListener('click', async () => {
      const romLabel = (s.rom || 'Super Mario Bros. (Japan, USA)').replace(/\.nes$/i, '');
      if (els.gameSelect) {
        let found = false;
        for (let i = 0; i < els.gameSelect.options.length; i++) {
          const label = els.gameSelect.options[i].textContent.replace(/\.nes$/i, '');
          if (label.toLowerCase() === romLabel.toLowerCase()) {
            els.gameSelect.selectedIndex = i;
            found = true;
            break;
          }
        }
        if (!found) els.gameSelect.selectedIndex = 0;
      }
      const selectedPath = els.gameSelect?.value;
      const selectedName = els.gameSelect?.options[els.gameSelect.selectedIndex]?.textContent;
      if (getCurrentROMName() !== selectedName) {
        await loadROMFromURL(selectedPath, selectedName);
      }
      els.seedInput.value = s.seed;
      if (els.modeSelect) els.modeSelect.value = s.mode || 'rom';
      if (els.byteCountInput) els.byteCountInput.value = s.byteCount || 25;
      corruptAndReload();
    });
    actions.append(useBtn); item.append(meta, actions); list.append(item);
  });
}

async function toggleFeature(seedId, isFeatured, featureId) {
  try {
    if (isFeatured && featureId) await room.collection('feature_v2').delete(featureId);
    else await room.collection('feature_v2').create({ seed_id: seedId });
  } catch (e) { console.error(e); }
}

export function setupSeeds() {
  els.postSeedBtn.addEventListener('click', postSeed);
  els.seedSearchInput?.addEventListener('input', () => { currentPage = 1; renderSeeds(allSeeds); });
  els.prevPageBtn?.addEventListener('click', () => { currentPage = Math.max(1, currentPage - 1); renderSeeds(allSeeds); });
  els.nextPageBtn?.addEventListener('click', () => { currentPage++; renderSeeds(allSeeds); });
  // Subscribe to both v1 and v2, then merge
  room.collection('seed_v1').subscribe((seeds) => { seedsV1 = seeds.slice(); mergeAndRender(); });
  room.collection('seed_v2').subscribe((seeds) => { seedsV2 = seeds.slice(); mergeAndRender(); });

  (async () => {
    const me = await window.websim.getCurrentUser(); isBK = (me?.username === 'BookwormKevin');
    room.collection('feature_v1').subscribe((fs) => { featuresV1 = fs.slice(); renderFeatured(); });
    room.collection('feature_v2').subscribe((fs) => { featuresV2 = fs.slice(); renderFeatured(); });
  })();

  // Featured collapse/expand
  const applyFeaturedState = (collapsed) => {
    if (!els.featuredSection || !els.featuredToggleBtn) return;
    els.featuredSection.classList.toggle('collapsed', collapsed);
    els.featuredToggleBtn.textContent = collapsed ? 'Show' : 'Hide';
    els.featuredToggleBtn.setAttribute('aria-expanded', String(!collapsed));
    localStorage.setItem('featuredCollapsed', collapsed ? '1' : '0');
  };
  const initialCollapsed = localStorage.getItem('featuredCollapsed') === '1';
  applyFeaturedState(initialCollapsed);
  els.featuredToggleBtn?.addEventListener('click', () => {
    const next = !els.featuredSection.classList.contains('collapsed');
    applyFeaturedState(next);
  });
}

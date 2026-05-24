export function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
  };
}

export function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function corruptBytes(bytes, seed, count = 25, skip = 16) {
  if (!seed) return bytes;
  const seedFn = xmur3(seed);
  const rnd = mulberry32(seedFn());
  const n = bytes.length;
  const used = new Set();
  for (let i = 0; i < count && n > skip; i++) {
    let idx;
    do {
      idx = skip + Math.floor(rnd() * (n - skip));
    } while (used.has(idx));
    used.add(idx);
    bytes[idx] = Math.floor(rnd() * 256);
  }
  return bytes;
}
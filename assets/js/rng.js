// Seeded pseudo-random numbers so every team sees the same experiment for the same seed.
// mulberry32: small, fast, good enough for classroom simulations (not for cryptography).

export function seedRandom(seed = 20260920) {
  let a = (Number(seed) >>> 0) || 1;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Turn any string into a 32-bit seed (FNV-1a) so "R1", "팀명" etc. can seed experiments.
export function hashSeed(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// Standard normal via Box–Muller.
export function normal(rng) {
  let u = 0;
  while (u === 0) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Gamma(shape, 1) via Marsaglia–Tsang.
export function gamma(shape, rng) {
  if (shape < 1) return gamma(shape + 1, rng) * Math.pow(rng(), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x;
    let v;
    do {
      x = normal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x ** 4) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

// Student-t with `df` degrees of freedom (raw, variance df/(df-2)).
export function studentT(df, rng) {
  const chi2 = 2 * gamma(df / 2, rng);
  return normal(rng) / Math.sqrt(chi2 / df);
}

// Student-t rescaled to unit variance (requires df > 2).
export function standardizedT(df, rng) {
  return studentT(df, rng) * Math.sqrt((df - 2) / df);
}

export function shuffleInPlace(array, rng) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

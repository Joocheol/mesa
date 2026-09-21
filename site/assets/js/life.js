// Conway's Game of Life: B3/S23, 8 neighbours, synchronous update from the previous generation.
// Boundary: "dead" (cells outside the grid are dead) or "torus" (wraps around).
import { seedRandom } from "./rng.js";

export function emptyGrid(size) {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

export function step(grid, boundary = "dead") {
  const n = grid.length;
  const next = emptyGrid(n);
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      let alive = 0;
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          if (!dr && !dc) continue;
          let rr = r + dr;
          let cc = c + dc;
          if (boundary === "torus") { rr = (rr + n) % n; cc = (cc + n) % n; }
          else if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
          alive += grid[rr][cc];
        }
      }
      next[r][c] = grid[r][c] ? (alive === 2 || alive === 3 ? 1 : 0) : (alive === 3 ? 1 : 0);
    }
  }
  return next;
}

export const liveCount = (grid) => grid.reduce((s, row) => s + row.reduce((a, b) => a + b, 0), 0);

export const PATTERNS = {
  block: { name: "블록 (정지)", cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
  blinker: { name: "블링커 (주기 2)", cells: [[0, -1], [0, 0], [0, 1]] },
  glider: { name: "글라이더 (이동)", cells: [[-1, 0], [0, 1], [1, -1], [1, 0], [1, 1]] },
  rpent: { name: "R-펜토미노 (오래 발산)", cells: [[-1, 0], [-1, 1], [0, -1], [0, 0], [1, 0]] },
  random: { name: "무작위 25%", cells: null },
};

export function patternGrid(name, size = 30, seed = 1) {
  const grid = emptyGrid(size);
  const p = PATTERNS[name];
  if (!p) throw new Error(`알 수 없는 패턴: ${name}`);
  if (p.cells === null) {
    const rng = seedRandom(seed);
    for (let r = 0; r < size; r += 1) for (let c = 0; c < size; c += 1) grid[r][c] = rng() < 0.25 ? 1 : 0;
    return grid;
  }
  const mid = Math.floor(size / 2);
  for (const [dr, dc] of p.cells) grid[mid + dr][mid + dc] = 1;
  return grid;
}

export const cloneGrid = (grid) => grid.map((row) => [...row]);

// Number of cells that differ between two grids of the same size.
export function difference(a, b) {
  let d = 0;
  for (let r = 0; r < a.length; r += 1) for (let c = 0; c < a.length; c += 1) if (a[r][c] !== b[r][c]) d += 1;
  return d;
}

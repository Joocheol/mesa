// Price-process models. All functions return arrays of daily log returns
// (paths × days) unless stated otherwise. dt = 1/252 trading days.
import { seedRandom, normal, standardizedT, shuffleInPlace } from "./rng.js";
import { mean, variance, sd } from "./stats.js";

const DT = 1 / 252;

// Geometric Brownian motion with exact lognormal transition.
// mu = annual arithmetic drift of the price process, sigma = annual volatility.
export function gbmReturns({ days, paths, mu, sigma, seed = 1 }) {
  const rng = seedRandom(seed);
  const drift = (mu - 0.5 * sigma * sigma) * DT;
  const vol = sigma * Math.sqrt(DT);
  return Array.from({ length: paths }, () => Array.from({ length: days }, () => drift + vol * normal(rng)));
}

// Same drift/vol but standardized Student-t shocks (fat tails, no clustering).
export function tReturns({ days, paths, mu, sigma, df = 4.5, seed = 1 }) {
  if (!(df > 2)) throw new Error("t 충격의 자유도는 2보다 커야 분산이 정의됩니다.");
  const rng = seedRandom(seed);
  const drift = (mu - 0.5 * sigma * sigma) * DT;
  const vol = sigma * Math.sqrt(DT);
  return Array.from({ length: paths }, () => Array.from({ length: days }, () => drift + vol * standardizedT(df, rng)));
}

// Bootstrap from the training log returns. blockLength = 1 → individual resampling.
export function bootstrapReturns(train, { days, paths, blockLength = 1, seed = 1 }) {
  if (train.length < 5) throw new Error("재추출에는 추정 수익률이 최소 5개 필요합니다.");
  const rng = seedRandom(seed);
  const L = Math.max(1, Math.min(blockLength, train.length));
  return Array.from({ length: paths }, () => {
    const out = [];
    while (out.length < days) {
      const start = Math.floor(rng() * (train.length - L + 1));
      for (let i = 0; i < L && out.length < days; i += 1) out.push(train[start + i]);
    }
    return out;
  });
}

export function shuffleReturns(values, seed = 7) {
  return shuffleInPlace([...values], seedRandom(seed));
}

// ---- GARCH(1,1) with standardized Student-t innovations, fitted by MLE (Nelder–Mead) ----

function lgamma(x) {
  // Lanczos approximation
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i += 1) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function nelderMead(f, x0, { maxIter = 4000, tol = 1e-9, step = 0.5 } = {}) {
  const n = x0.length;
  let simplex = [x0.map(Number)];
  for (let i = 0; i < n; i += 1) {
    const p = [...x0];
    p[i] += step;
    simplex.push(p);
  }
  let values = simplex.map(f);
  let iter = 0;
  for (; iter < maxIter; iter += 1) {
    const order = values.map((v, i) => i).sort((a, b) => values[a] - values[b]);
    simplex = order.map((i) => simplex[i]);
    values = order.map((i) => values[i]);
    if (Math.abs(values[n] - values[0]) < tol * (Math.abs(values[0]) + 1e-12)) break;
    const centroid = Array(n).fill(0);
    for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) centroid[j] += simplex[i][j] / n;
    const worst = simplex[n];
    const reflect = centroid.map((c, j) => c + (c - worst[j]));
    const fr = f(reflect);
    if (fr < values[0]) {
      const expand = centroid.map((c, j) => c + 2 * (c - worst[j]));
      const fe = f(expand);
      if (fe < fr) { simplex[n] = expand; values[n] = fe; } else { simplex[n] = reflect; values[n] = fr; }
    } else if (fr < values[n - 1]) {
      simplex[n] = reflect; values[n] = fr;
    } else {
      const contract = centroid.map((c, j) => c + 0.5 * (worst[j] - c));
      const fc = f(contract);
      if (fc < values[n]) { simplex[n] = contract; values[n] = fc; }
      else {
        for (let i = 1; i <= n; i += 1) {
          simplex[i] = simplex[i].map((x, j) => simplex[0][j] + 0.5 * (x - simplex[0][j]));
          values[i] = f(simplex[i]);
        }
      }
    }
  }
  return { x: simplex[0], value: values[0], iterations: iter, converged: iter < maxIter };
}

function unpack(theta) {
  const mu = theta[0];
  const omega = Math.exp(theta[1]);
  const alpha = 0.999 / (1 + Math.exp(-theta[2]));
  const beta = (0.999 - alpha) / (1 + Math.exp(-theta[3]));
  const dof = 4.01 + Math.exp(theta[4]);
  return { mu, omega, alpha, beta, dof };
}

function garchVariance(returns, mu, omega, alpha, beta) {
  const v = new Array(returns.length);
  v[0] = Math.max(variance(returns), 1e-12);
  for (let i = 1; i < returns.length; i += 1) v[i] = omega + alpha * (returns[i - 1] - mu) ** 2 + beta * v[i - 1];
  return v;
}

// Returns {success, message, mu, omega, alpha, beta, dof, logLikelihood, iterations}.
// Failure is reported honestly; callers must not substitute guessed parameters.
export function fitGarchT(trainReturns) {
  const returns = trainReturns.filter(Number.isFinite);
  if (returns.length < 30) return { success: false, message: "GARCH-t 적합에는 추정 수익률이 최소 30개 필요합니다." };
  const scale = sd(returns);
  if (!(scale > 0)) return { success: false, message: "수익률이 상수여서 분산을 추정할 수 없습니다." };
  const z = returns.map((r) => r / scale);
  const objective = (theta) => {
    const { mu, omega, alpha, beta, dof } = unpack(theta);
    const v = garchVariance(z, mu, omega, alpha, beta);
    const constant = lgamma((dof + 1) / 2) - lgamma(dof / 2) - 0.5 * Math.log(Math.PI * (dof - 2));
    let ll = 0;
    for (let i = 0; i < z.length; i += 1) {
      if (!(v[i] > 0) || !Number.isFinite(v[i])) return 1e100;
      const r2 = (z[i] - mu) ** 2 / v[i];
      ll += constant - 0.5 * Math.log(v[i]) - ((dof + 1) / 2) * Math.log1p(r2 / (dof - 2));
    }
    return Number.isFinite(ll) ? -ll : 1e100;
  };
  const initial = [mean(z), Math.log(0.02), -2.2, 2.2, Math.log(6 - 4.01)];
  const result = nelderMead(objective, initial, { maxIter: 6000 });
  if (!Number.isFinite(result.value) || result.value >= 1e99) return { success: false, message: "우도가 유한하지 않습니다.", iterations: result.iterations };
  const p = unpack(result.x);
  if (p.alpha + p.beta >= 1) return { success: false, message: "비정상 적합: alpha + beta ≥ 1", iterations: result.iterations };
  return {
    success: true,
    message: result.converged ? "수렴" : "최대 반복 도달 (결과는 근사치)",
    converged: result.converged,
    mu: p.mu * scale,
    omega: p.omega * scale * scale,
    alpha: p.alpha,
    beta: p.beta,
    dof: p.dof,
    logLikelihood: -result.value - returns.length * Math.log(scale),
    iterations: result.iterations,
    n: returns.length,
  };
}

export function garchReturns({ fit, days, paths, seed = 1, burnIn = 250 }) {
  if (!fit?.success) throw new Error(`성공한 GARCH 적합이 필요합니다: ${fit?.message || "없음"}`);
  const rng = seedRandom(seed);
  const unconditional = fit.omega / Math.max(1e-6, 1 - fit.alpha - fit.beta);
  return Array.from({ length: paths }, () => {
    const out = [];
    let v = unconditional;
    let prev = fit.mu;
    for (let i = 0; i < days + burnIn; i += 1) {
      v = fit.omega + fit.alpha * (prev - fit.mu) ** 2 + fit.beta * v;
      prev = fit.mu + Math.sqrt(Math.max(v, 1e-14)) * standardizedT(fit.dof, rng);
      if (i >= burnIn) out.push(prev);
    }
    return out;
  });
}

// "같은 평균, 다른 운명": multiplicative ±step investment.
export function repeatedInvestment({ initial = 100, up = 0.2, down = 0.2, steps = 100, paths = 1000, seed = 1 }) {
  const rng = seedRandom(seed);
  const finals = [];
  const samplePaths = [];
  for (let p = 0; p < paths; p += 1) {
    let wealth = initial;
    const path = [wealth];
    for (let s = 0; s < steps; s += 1) {
      wealth *= rng() < 0.5 ? 1 + up : 1 - down;
      if (p < 20) path.push(wealth);
    }
    finals.push(wealth);
    if (p < 20) samplePaths.push(path);
  }
  const theoreticalMean = initial * ((1 + up + 1 - down) / 2) ** steps;
  const medianTheory = initial * Math.sqrt((1 + up) * (1 - down)) ** steps;
  return { finals, samplePaths, theoreticalMean, medianTheory };
}

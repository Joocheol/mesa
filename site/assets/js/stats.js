// Descriptive statistics used across the workshop. Every function is pure.

export const sum = (xs) => xs.reduce((a, b) => a + b, 0);
export const mean = (xs) => (xs.length ? sum(xs) / xs.length : NaN);

export function variance(xs) {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1);
}
export const sd = (xs) => Math.sqrt(variance(xs));

export function skewness(xs) {
  if (xs.length < 3) return NaN;
  const m = mean(xs);
  const s = Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / xs.length);
  if (s === 0) return NaN;
  return sum(xs.map((x) => ((x - m) / s) ** 3)) / xs.length;
}

// Excess kurtosis (normal = 0), population moments.
export function excessKurtosis(xs) {
  if (xs.length < 4) return NaN;
  const m = mean(xs);
  const s = Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / xs.length);
  if (s === 0) return NaN;
  return sum(xs.map((x) => ((x - m) / s) ** 4)) / xs.length - 3;
}

export function quantile(values, q) {
  if (!values.length) return NaN;
  const xs = [...values].sort((a, b) => a - b);
  const pos = (xs.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return xs[lo] + (xs[hi] - xs[lo]) * (pos - lo);
}
export const median = (xs) => quantile(xs, 0.5);

export function autocorrelation(xs, lag) {
  if (xs.length <= lag + 2) return NaN;
  const m = mean(xs);
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i += 1) den += (xs[i] - m) ** 2;
  for (let i = 0; i < xs.length - lag; i += 1) num += (xs[i] - m) * (xs[i + lag] - m);
  return den === 0 ? NaN : num / den;
}

export function logReturns(prices) {
  const out = [];
  for (let i = 1; i < prices.length; i += 1) out.push(Math.log(prices[i] / prices[i - 1]));
  return out;
}

export function pathFromReturns(returns, initial = 100) {
  const path = [initial];
  let value = initial;
  for (const r of returns) {
    value *= Math.exp(r);
    path.push(value);
  }
  return path;
}

export const normalPdf = (x, mu = 0, sigma = 1) =>
  Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma)) / (sigma * Math.sqrt(2 * Math.PI));

export function binomialPmf(n, k, p = 0.5) {
  let c = 1;
  for (let i = 1; i <= k; i += 1) c = (c * (n - k + i)) / i;
  return c * p ** k * (1 - p) ** (n - k);
}

// The "검사표": four numbers every page reports the same way.
// trainMean / trainSd define the ±3σ band and are estimated on the training window only.
export function diagnostics(returns, trainMean = mean(returns), trainSd = sd(returns)) {
  const n = returns.length;
  const squares = returns.map((r) => (r - mean(returns)) ** 2);
  return {
    n,
    annVol: n > 1 ? sd(returns) * Math.sqrt(252) : NaN,
    kurtosis: excessKurtosis(returns),
    skew: skewness(returns),
    exceed3: n ? returns.filter((r) => Math.abs((r - trainMean) / trainSd) > 3).length / n : NaN,
    acf1: autocorrelation(squares, 1),
    acf5: autocorrelation(squares, 5),
  };
}

export const METRIC_LABELS = {
  annVol: "연율 변동성",
  kurtosis: "초과첨도",
  skew: "왜도",
  exceed3: "±3σ 초과 빈도",
  acf1: "제곱수익률 ACF(1)",
  acf5: "제곱수익률 ACF(5)",
};
export const METRIC_KEYS = ["annVol", "kurtosis", "exceed3", "acf1", "acf5"];

// Runs analysis for the coin-flip game. seq: array of "H"/"T".
export function runsAnalysis(seq) {
  const n = seq.length;
  if (!n) return null;
  let runs = 1;
  let longest = 1;
  let current = 1;
  let heads = 0;
  for (let i = 0; i < n; i += 1) {
    if (seq[i] === "H") heads += 1;
    if (i > 0) {
      if (seq[i] === seq[i - 1]) current += 1;
      else {
        runs += 1;
        current = 1;
      }
      longest = Math.max(longest, current);
    }
  }
  const expectedRuns = (n + 1) / 2; // fair coin
  const sdRuns = Math.sqrt((n - 1) / 4);
  const zRuns = (runs - expectedRuns) / sdRuns;
  // expected longest run for fair coin ≈ log2(n) + 0.33 (Schilling)
  const expectedLongest = Math.log2(n) + 0.33;
  let alternations = 0;
  for (let i = 1; i < n; i += 1) if (seq[i] !== seq[i - 1]) alternations += 1;
  const alternationRate = n > 1 ? alternations / (n - 1) : NaN;
  return { n, heads, runs, longest, expectedRuns, sdRuns, zRuns, expectedLongest, alternationRate };
}

// A transparent "human-ness" verdict: too many runs (alternating), too short a longest run.
export function humanVerdict(analysis) {
  if (!analysis) return { score: 0, label: "입력 없음" };
  let score = 0;
  const notes = [];
  if (analysis.zRuns > 1.3) { score += 2; notes.push(`교대가 너무 잦음 (runs z=${analysis.zRuns.toFixed(2)})`); }
  else if (analysis.zRuns > 0.7) { score += 1; notes.push("교대가 조금 잦음"); }
  if (analysis.longest <= Math.floor(analysis.expectedLongest) - 1) { score += 2; notes.push(`최장 연속 ${analysis.longest} — 기대값 ${analysis.expectedLongest.toFixed(1)}보다 짧음`); }
  else if (analysis.longest <= Math.floor(analysis.expectedLongest)) { score += 1; notes.push("최장 연속이 기대보다 약간 짧음"); }
  const share = analysis.heads / analysis.n;
  if (Math.abs(share - 0.5) < 0.04 && analysis.n >= 20) { score += 1; notes.push("앞/뒤 비율이 너무 정확히 반반"); }
  const label = score >= 3 ? "사람이 쓴 것 같음" : score === 2 ? "판단 유보" : "동전(난수) 같음";
  return { score, label, notes };
}

// Brier score for a 3-way choice reported as p = confidence in the chosen option.
// correct → 1 - (1-p)^2, wrong → 1 - p^2. Max 1, min 0. 50% always yields 0.75.
export function brier(confidencePct, correct) {
  const p = Math.min(1, Math.max(0, Number(confidencePct) / 100));
  return correct ? 1 - (1 - p) ** 2 : 1 - p ** 2;
}

export const fmt = (value, digits = 2) =>
  Number.isFinite(value) ? Number(value).toLocaleString("ko-KR", { maximumFractionDigits: digits, minimumFractionDigits: digits }) : "—";
export const pct = (value, digits = 1) => (Number.isFinite(value) ? `${fmt(value * 100, digits)}%` : "—");

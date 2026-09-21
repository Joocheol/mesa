// Runs the team's repaired model (t / GARCH-t / bootstrap / GBM baseline) over a window
// and compares its diagnostics to the real window. Shared by 05-repair and 10-round3.
import { gbmReturns, tReturns, garchReturns, bootstrapReturns } from "./models.js";
import { diagnostics, quantile, METRIC_KEYS, METRIC_LABELS, fmt, pct } from "./stats.js";

export const MODEL_LABELS = { gbm: "GBM (기준선)", t: "독립 t 충격", garch: "GARCH(1,1)-t", bootstrap: "블록 재추출" };

export function simulate(data, config, days, paths, seed) {
  const est = data.estimates;
  if (config.model === "gbm") return gbmReturns({ days, paths, mu: est.gbmMu, sigma: est.annVol, seed });
  if (config.model === "t") return tReturns({ days, paths, mu: est.gbmMu, sigma: est.annVol, df: config.df ?? 4.5, seed });
  if (config.model === "garch") {
    const fit = data.garch();
    if (!fit.success) throw new Error(`GARCH-t 적합 실패: ${fit.message}`);
    return garchReturns({ fit, days, paths, seed });
  }
  if (config.model === "bootstrap") return bootstrapReturns(data.trainReturns, { days, paths, blockLength: config.blockLength ?? 10, seed });
  throw new Error(`알 수 없는 모형: ${config.model}`);
}

const FORMATS = { annVol: (v) => pct(v), kurtosis: (v) => fmt(v, 2), exceed3: (v) => pct(v), acf1: (v) => fmt(v, 3), acf5: (v) => fmt(v, 3) };

export function compareToReal(data, sims, realReturns) {
  const est = data.estimates;
  const real = diagnostics(realReturns, est.dailyMean, est.dailySd);
  const per = sims.map((s) => diagnostics(s, est.dailyMean, est.dailySd));
  const rows = METRIC_KEYS.map((k) => {
    const values = per.map((d) => d[k]).filter(Number.isFinite);
    const lo = quantile(values, 0.05); const hi = quantile(values, 0.95); const median = quantile(values, 0.5);
    return { key: k, label: METRIC_LABELS[k], real: real[k], median, lo, hi, pass: real[k] >= lo && real[k] <= hi, fmt: FORMATS[k] };
  });
  return { rows, passCount: rows.filter((r) => r.pass).length, real };
}

export function runTeamModelOnWindow(data, config, realReturns, { paths = 200, seed = 1 } = {}) {
  const sims = simulate(data, config, realReturns.length, paths, seed);
  const result = compareToReal(data, sims, realReturns);
  const label = `${MODEL_LABELS[config.model]}${config.model === "t" ? ` (자유도 ${config.df})` : config.model === "bootstrap" ? ` (블록 ${config.blockLength})` : ""}`;
  return { ...result, label, sims };
}

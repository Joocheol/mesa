import { initChrome, $, bindRange, status } from "../ui.js";
import { loadState, saveState, markComplete } from "../state.js";
import { loadMarket } from "../data.js";
import { gbmReturns } from "../models.js";
import { pathFromReturns, mean, median, quantile, fmt, pct } from "../stats.js";
import { lineChart, histogram, COLORS } from "../chart.js";

initChrome();
const state = loadState();
const data = await loadMarket();
const est = data.estimates;

$("#estimates").innerHTML = `
  <div class="stat"><span class="number">${fmt(est.annLogMean * 100, 1)}%</span><span class="label">연 로그수익률 평균</span></div>
  <div class="stat"><span class="number">${fmt(est.annVol * 100, 1)}%</span><span class="label">연 변동성 σ</span></div>
  <div class="stat"><span class="number">${fmt(est.gbmMu * 100, 1)}%</span><span class="label">가격 드리프트 μ</span></div>`;

function resetParams() {
  $("#mu").value = Math.round(est.gbmMu * 100);
  $("#sigma").value = Math.round(est.annVol * 100);
}
resetParams();
for (const id of ["mu", "sigma", "days", "seed"]) bindRange($(`#${id}`), $(`[data-out="${id}"]`));
$("#reset-params").addEventListener("click", () => { resetParams(); for (const id of ["mu", "sigma"]) $(`#${id}`).dispatchEvent(new Event("input")); });

function run() {
  const mu = Number($("#mu").value) / 100; const sigma = Number($("#sigma").value) / 100;
  const days = Number($("#days").value); const seed = Number($("#seed").value);
  const show = gbmReturns({ days, paths: 20, mu, sigma, seed });
  lineChart($("#paths"), show.map((r, i) => ({ values: pathFromReturns(r), width: 1.2, opacity: 0.85, color: COLORS[i % COLORS.length] })), { log: true, xLabel: "거래일", yLabel: "가격 (로그축)" });
  const dist = gbmReturns({ days, paths: 1000, mu, sigma, seed: seed + 1000 });
  const finals = dist.map((r) => 100 * Math.exp(r.reduce((a, b) => a + b, 0)));
  const m = mean(finals); const med = median(finals);
  histogram($("#finals"), finals, { bins: 40, xLabel: "최종 가격", refLines: [{ value: m, label: "평균", color: COLORS[1] }, { value: med, label: "중앙값", color: COLORS[0] }] });
  const theoryMean = 100 * Math.exp(mu * days / 252);
  $("#gbm-stats").innerHTML = `
    <div class="stat"><span class="number">${fmt(m, 1)}</span><span class="label">표본 평균 (이론 ${fmt(theoryMean, 1)})</span></div>
    <div class="stat"><span class="number">${fmt(med, 1)}</span><span class="label">중앙값</span></div>
    <div class="stat"><span class="number">${pct(finals.filter((f) => f < 100).length / finals.length)}</span><span class="label">100 미만 경로 · 5%~95% ${fmt(quantile(finals, 0.05), 0)}~${fmt(quantile(finals, 0.95), 0)}</span></div>`;
  saveState({ gbmParams: { mu, sigma, days, seed } });
  markComplete("gbm");
}
$("#run").addEventListener("click", run);
if (state.gbmParams) { $("#mu").value = Math.round(state.gbmParams.mu * 100); $("#sigma").value = Math.round(state.gbmParams.sigma * 100); $("#days").value = state.gbmParams.days; $("#seed").value = state.gbmParams.seed; for (const id of ["mu", "sigma", "days", "seed"]) $(`#${id}`).dispatchEvent(new Event("input")); }
run();

$("#assumption").value = state.gbmAssumption || "";
$("#changed").value = state.gbmChanged || "";
$("#save").addEventListener("click", () => { saveState({ gbmAssumption: $("#assumption").value, gbmChanged: $("#changed").value }); $("#save-status").textContent = "저장했습니다."; });

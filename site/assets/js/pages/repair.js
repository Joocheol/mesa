import { initChrome, $, $$, status, bindRange } from "../ui.js";
import { loadState, saveState, markComplete } from "../state.js";
import { loadMarket } from "../data.js";
import { submitScore } from "../classroom.js";
import { lineChart, COLORS } from "../chart.js";
import { pathFromReturns, fmt, METRIC_KEYS, METRIC_LABELS } from "../stats.js";
import { simulate, compareToReal, runTeamModelOnWindow, MODEL_LABELS } from "../repair.js";

initChrome();
const data = await loadMarket();
const state = loadState();
const DESC = {
  t: "정규분포 대신 두꺼운 꼬리의 t 분포에서 충격을 뽑습니다. 충격은 서로 독립이므로 변동성 군집은 생기지 않습니다.",
  garch: "오늘의 분산이 어제의 충격²과 어제의 분산에 의존합니다(σ²ₜ = ω + α·ε²ₜ₋₁ + β·σ²ₜ₋₁). 충격은 t 분포. 추정 구간으로만 최대우도 적합했으며 실패하면 실패로 보고합니다.",
  bootstrap: "추정 구간의 실제 수익률을 블록 단위로 다시 뽑습니다. 분포는 자동으로 맞지만, 원본에 없던 시나리오는 만들지 못합니다.",
};
let model = state.repair?.model || null;
let lastResult = null;
let gbmBaseline = null;

bindRange($("#df"), $("#df-out")); bindRange($("#block"), $("#block-out")); bindRange($("#seed"), $("#seed-out"));
if (state.repair?.df) $("#df").value = state.repair.df;
if (state.repair?.blockLength) $("#block").value = state.repair.blockLength;
for (const id of ["df", "block"]) $(`#${id}`).dispatchEvent(new Event("input"));

const fit = data.garch();
$("#garch-info").textContent = fit.success ? `추정 구간 적합: ω=${fit.omega.toExponential(2)}, α=${fmt(fit.alpha, 3)}, β=${fmt(fit.beta, 3)}, α+β=${fmt(fit.alpha + fit.beta, 3)}, 자유도=${fmt(fit.dof, 1)}, 반복 ${fit.iterations}회, ${fit.message}` : `GARCH-t 적합 실패: ${fit.message} — 이 선택지는 실행할 수 없습니다. 실패도 결과입니다.`;

function selectModel(m) {
  model = m;
  $$("[data-model]").forEach((b) => b.classList.toggle("selected", b.dataset.model === m));
  $$("[data-param]").forEach((p) => p.classList.toggle("hidden", p.dataset.param !== m));
  $("#model-desc").textContent = DESC[m];
}
$$("[data-model]").forEach((b) => b.addEventListener("click", () => selectModel(b.dataset.model)));
selectModel(model || "t");

const OPTIONS = ["좋아짐", "그대로", "나빠짐"];
$("#predict-table").innerHTML = `<tr><th>지표</th><th>예측</th></tr>${METRIC_KEYS.map((k) => `<tr><td>${METRIC_LABELS[k]}</td><td><select data-predict="${k}">${OPTIONS.map((o) => `<option${state.repairPredict?.[k] === o ? " selected" : ""}>${o}</option>`).join("")}</select></td></tr>`).join("")}`;
const predictions = () => Object.fromEntries($$("[data-predict]").map((s) => [s.dataset.predict, s.value]));

function config() {
  return { model, df: Number($("#df").value), blockLength: Number($("#block").value) };
}

function run() {
  const cfg = config();
  const seed = Number($("#seed").value);
  const val = data.valReturns;
  try {
    gbmBaseline = compareToReal(data, simulate(data, { model: "gbm" }, val.length, 200, seed), val);
    lastResult = runTeamModelOnWindow(data, cfg, val, { paths: 200, seed });
  } catch (error) { return status("run-status", error.message, "error"); }
  const pred = predictions();
  let hits = 0;
  const rows = lastResult.rows.map((r, i) => {
    const base = gbmBaseline.rows[i];
    const dNew = Math.abs(r.median - r.real); const dOld = Math.abs(base.median - base.real);
    const tol = Math.max(Math.abs(r.real) * 0.1, 1e-6);
    const outcome = dNew < dOld - tol ? "좋아짐" : dNew > dOld + tol ? "나빠짐" : "그대로";
    const hit = pred[r.key] === outcome; if (hit) hits += 1;
    return `<tr class="${outcome === "좋아짐" ? "better" : outcome === "나빠짐" ? "worse" : ""}"><td>${r.label}</td><td class="num">${r.fmt(r.real)}</td><td class="num">${base.fmt(base.median)}${base.pass ? "" : " ✗"}</td><td class="num">${r.fmt(r.median)} <span class="muted small">(${r.fmt(r.lo)}~${r.fmt(r.hi)})</span>${r.pass ? "" : " ✗"}</td><td>${outcome}</td><td>${pred[r.key]} ${hit ? "✓" : "✗"}</td></tr>`;
  });
  $("#result-table").innerHTML = `<tr><th>지표</th><th class="num">실제 (검증)</th><th class="num">GBM</th><th class="num">${lastResult.label}</th><th>변화</th><th>예측</th></tr>${rows.join("")}`;
  $("#result-note").textContent = `✗ = 실제값이 5~95% 범위 밖. '변화'는 중앙값과 실제의 거리가 GBM보다 줄었는지(±10% 허용). 검증 구간 ${val.length}일, 200경로, 시드 ${seed}.`;
  lineChart($("#paths"), lastResult.sims.slice(0, 20).map((r, i) => ({ values: pathFromReturns(r), width: 1.1, opacity: 0.85, color: COLORS[i % COLORS.length] })), { log: true });
  lineChart($("#returns"), [{ values: lastResult.sims[0], color: COLORS[1], width: 1 }], { yLabel: "로그수익률" });
  $("#pass-count").textContent = lastResult.passCount; $("#gbm-pass").textContent = gbmBaseline.passCount; $("#hits").textContent = hits;
  saveState({ repairPredict: pred, repairRun: { model: cfg.model, passCount: lastResult.passCount, gbmPass: gbmBaseline.passCount, hits, seed } });
  status("run-status", `실행 완료 — ${lastResult.label}: 통과 ${lastResult.passCount}/5 (GBM ${gbmBaseline.passCount}/5), 예측 적중 ${hits}/5`, "ok");
  markComplete("repair");
}
$("#run").addEventListener("click", run);

$("#worse").value = state.repairWorse || "";
$("#assumption").value = state.repairAssumption || "";
$("#submit").addEventListener("click", async () => {
  if (!lastResult) return status("submit-status", "먼저 실행하세요.", "error");
  if (!$("#worse").value.trim()) return status("submit-status", "나빠졌거나 그대로인 지표를 적어야 제출할 수 있습니다 — 한계도 결과입니다.", "error");
  const cfg = config();
  saveState({ repair: cfg, repairWorse: $("#worse").value, repairAssumption: $("#assumption").value, repairScore: lastResult.passCount });
  const detail = `${lastResult.label} · 통과 ${lastResult.passCount}/5 · GBM ${gbmBaseline.passCount}/5`;
  try { await submitScore("repair", lastResult.passCount, detail); status("submit-status", `저장·제출했습니다: ${detail}`, "ok"); }
  catch (error) { status("submit-status", `서버 제출 실패 (${error.message}). 모형은 이 브라우저에 저장했습니다.`, "warning"); }
  markComplete("repair");
});

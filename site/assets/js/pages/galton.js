import { initChrome, $, $$, bindRange } from "../ui.js";
import { loadState, saveState, markComplete } from "../state.js";
import { seedRandom } from "../rng.js";
import { binomialPmf, normalPdf, mean, median, quantile, fmt } from "../stats.js";
import { barChart, lineChart, histogram, COLORS } from "../chart.js";
import { repeatedInvestment } from "../models.js";

initChrome();
const state = loadState();
for (const id of ["rows", "balls", "p", "up", "down", "steps", "seed"]) bindRange($(`#${id}`), $(`[data-out="${id}"]`));

// ---------- Galton board ----------
const canvas = $("#board");
const ctx = canvas.getContext("2d");
let anim = null;
let counts = [];
let landed = 0;
let balls = [];
let rowsN = 12;
let pRight = 0.5;
let total = 0;
let rng = seedRandom(3);

function layout() {
  const w = canvas.width; const h = canvas.height;
  const top = 30; const bottom = h - 60;
  const dy = (bottom - top) / (rowsN + 1);
  const dx = Math.min(dy, (w - 40) / (rowsN + 2));
  return { w, h, top, bottom, dy, dx, cx: w / 2 };
}
function drawBoard() {
  const { w, h, top, dy, dx, cx } = layout();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#3a4468";
  for (let r = 0; r < rowsN; r += 1) for (let k = 0; k <= r; k += 1) {
    ctx.beginPath(); ctx.arc(cx + (k - r / 2) * dx, top + (r + 1) * dy, 2.5, 0, Math.PI * 2); ctx.fill();
  }
  // bins
  const maxC = Math.max(...counts, 1);
  const binW = dx * 0.85;
  const barH = 40;
  counts.forEach((c, k) => {
    const x = cx + (k - rowsN / 2) * dx;
    const hgt = (c / maxC) * barH;
    ctx.fillStyle = COLORS[0];
    ctx.fillRect(x - binW / 2, h - 12 - hgt, binW, hgt);
  });
  ctx.fillStyle = COLORS[2];
  for (const b of balls) {
    ctx.beginPath(); ctx.arc(cx + b.x * dx, top + b.row * dy + b.frac * dy, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = "#9aa5c4"; ctx.font = "12px monospace";
  ctx.fillText(`${landed.toLocaleString()} / ${total.toLocaleString()} 공 착지`, 12, 18);
}
function stepBall(b) {
  b.frac += 0.25;
  if (b.frac >= 1) {
    b.frac = 0; b.row += 1;
    if (rng() < pRight) { b.x += 0.5; b.right += 1; } else b.x -= 0.5;
    if (b.row >= rowsN) { counts[b.right] += 1; landed += 1; return false; }
  }
  return true;
}
function updateLanding() {
  const labels = counts.map((_, k) => String(k));
  const bin = counts.map((_, k) => landed * binomialPmf(rowsN, k, pRight));
  const mu = rowsN * pRight; const sigma = Math.sqrt(rowsN * pRight * (1 - pRight));
  const norm = counts.map((_, k) => landed * normalPdf(k, mu, sigma));
  barChart($("#landing"), labels, counts, { overlays: [{ values: bin, color: COLORS[1] }, { values: norm, color: COLORS[4], dash: "5 4" }], xLabel: "오른쪽으로 튄 횟수" });
  const maxDev = Math.max(...counts.map((c, k) => Math.abs(c - bin[k])));
  $("#galton-note").textContent = landed ? `${landed.toLocaleString()}개 착지 · 관측과 이항분포의 최대 차이 ${fmt(maxDev, 0)}개 · 이론 평균 ${fmt(mu, 1)}, 표준편차 ${fmt(sigma, 2)}` : "아직 떨어진 공이 없습니다.";
}
function start() {
  cancelAnimationFrame(anim);
  rowsN = Number($("#rows").value); pRight = Number($("#p").value); total = Number($("#balls").value);
  counts = Array(rowsN + 1).fill(0); landed = 0; balls = []; rng = seedRandom(3 + rowsN * 7 + total);
  let launched = 0;
  if ($("#fast").checked) {
    for (let i = 0; i < total; i += 1) { let r = 0; for (let k = 0; k < rowsN; k += 1) if (rng() < pRight) r += 1; counts[r] += 1; }
    landed = total; drawBoard(); updateLanding(); markComplete("galton"); return;
  }
  const perFrame = Math.max(1, Math.round(total / 240));
  const frame = () => {
    for (let i = 0; i < perFrame && launched < total; i += 1) { balls.push({ x: 0, row: 0, frac: 0, right: 0 }); launched += 1; }
    balls = balls.filter(stepBall);
    drawBoard();
    if (landed % 25 === 0 || landed === total) updateLanding();
    if (balls.length || launched < total) anim = requestAnimationFrame(frame);
    else { updateLanding(); markComplete("galton"); }
  };
  anim = requestAnimationFrame(frame);
}
$("#drop").addEventListener("click", start);
$("#stop").addEventListener("click", () => cancelAnimationFrame(anim));
drawBoard();

// ---------- Compound world ----------
function runCompound() {
  const up = Number($("#up").value) / 100; const down = Number($("#down").value) / 100;
  const steps = Number($("#steps").value); const seed = Number($("#seed").value);
  const { finals, samplePaths, theoreticalMean, medianTheory } = repeatedInvestment({ up, down, steps, paths: 1000, seed });
  const m = mean(finals); const med = median(finals); const loss = finals.filter((f) => f < 100).length / finals.length;
  lineChart($("#compound-paths"), samplePaths.map((p, i) => ({ values: p, width: 1.2, opacity: 0.8, color: COLORS[i % COLORS.length] })), { log: true, xLabel: "회차", yLabel: "자산 (로그축)" });
  const logs = finals.map((f) => Math.log10(Math.max(f, 1e-6)));
  histogram($("#compound-hist"), logs, { bins: 40, xLabel: "log10(최종 자산)", refLines: [{ value: Math.log10(m), label: "평균", color: COLORS[1] }, { value: Math.log10(med), label: "중앙값", color: COLORS[0] }, { value: 2, label: "원금 100", color: COLORS[4] }] });
  const g = { mean: Number($("#guess-mean").value), median: Number($("#guess-median").value), loss: Number($("#guess-loss").value) };
  $("#compound-stats").innerHTML = `
    <div class="stat"><span class="number">${fmt(m, 0)}</span><span class="label">표본 평균 (이론 ${fmt(theoreticalMean, 0)})${g.mean ? ` · 예상 ${g.mean}` : ""}</span></div>
    <div class="stat"><span class="number">${fmt(med, 1)}</span><span class="label">중앙값 (이론 ${fmt(medianTheory, 1)})${g.median ? ` · 예상 ${g.median}` : ""}</span></div>
    <div class="stat"><span class="number">${fmt(loss * 100, 1)}%</span><span class="label">원금 미만 경로${g.loss ? ` · 예상 ${g.loss}%` : ""} · 상위 1% ${fmt(quantile(finals, 0.99), 0)}</span></div>`;
  saveState({ compoundGuess: g, compoundResult: { mean: m, median: med, loss } });
  markComplete("galton");
}
$("#run-compound").addEventListener("click", runCompound);

$("#galton-predict").value = state.galtonPredict || "";
$("#galton-learned").value = state.galtonLearned || "";
if (state.compoundGuess) { $("#guess-mean").value = state.compoundGuess.mean || ""; $("#guess-median").value = state.compoundGuess.median || ""; $("#guess-loss").value = state.compoundGuess.loss || ""; }
$("#save").addEventListener("click", () => { saveState({ galtonPredict: $("#galton-predict").value, galtonLearned: $("#galton-learned").value }); $("#save-status").textContent = "저장했습니다."; });

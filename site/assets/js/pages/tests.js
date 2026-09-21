import { initChrome, $, escapeHtml } from "../ui.js";
import { loadState, saveState, markComplete } from "../state.js";
import { loadMarket } from "../data.js";
import { buildRound } from "../rounds.js";
import { voteState, leaderboard, poll } from "../classroom.js";
import { lineChart, histogram, scatter, COLORS } from "../chart.js";
import { diagnostics, pathFromReturns, normalPdf, mean, sd, brier, fmt, pct, METRIC_KEYS, METRIC_LABELS } from "../stats.js";
import { shuffleReturns } from "../models.js";
import { simulate, compareToReal } from "../repair.js";

initChrome();
const data = await loadMarket();
const state = loadState();
const est = data.estimates;
const round1 = buildRound("round1", data);

// ---- A. reveal ----
function renderReveal(correct, counts) {
  const saved = loadState().votes?.round1;
  const own = saved ? { correct: saved.choice === correct, score: brier(saved.confidence, saved.choice === correct) } : null;
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
  $("#r1-reveal").innerHTML = `<div class="grid three">
    ${round1.cards.map((c) => `<div class="card soft${c.letter === correct ? " correct" : ""}"><h3>${c.letter} · ${c.name}</h3>${counts ? `<p class="stat"><span class="number">${counts[c.letter] || 0}</span><span class="label">팀 선택 (${total ? Math.round(((counts[c.letter] || 0) / total) * 100) : 0}%)</span></p>` : ""}</div>`).join("")}
  </div>
  ${own ? `<p style="margin-top:.8rem">우리 팀: <strong>${saved.choice}</strong> 선택 · 확신도 ${saved.confidence}% · ${own.correct ? "정답" : "오답"} · 브라이어 <strong>${fmt(own.score, 3)}</strong></p>` : `<p class="muted small" style="margin-top:.8rem">이 브라우저에 R1 제출 기록이 없습니다.</p>`}`;
}
async function refreshReveal() {
  try {
    const s = await voteState("round1");
    $("#r1-state").textContent = s.revealed ? "공개됨" : `${s.submissionCount}팀 제출 · 비공개`;
    if (s.revealed) { renderReveal(s.correctChoice, s.counts); renderCalibration(); }
  } catch (error) {
    $("#r1-state").textContent = "서버 없음";
    if (loadState().localReveal?.round1) renderReveal(round1.answer, null);
  }
}

// ---- B. calibration ----
async function renderCalibration() {
  let votes = [];
  let activities = {};
  try { const lb = await leaderboard(); votes = lb.votes; activities = lb.activities; } catch { /* offline */ }
  const rows = votes.filter((v) => activities[v.activity_id]?.revealed).map((v) => ({ conf: v.confidence, correct: v.choice === activities[v.activity_id].correctChoice ? 1 : 0, team: v.team_name }));
  if (!rows.length) { $("#calibration-table").innerHTML = `<tr><td class="muted">공개된 라운드의 학급 투표가 아직 없습니다 (서버 연결 필요).</td></tr>`; return; }
  const bins = [[34, 50], [50, 65], [65, 80], [80, 90], [90, 101]];
  const points = [];
  const tableRows = bins.map(([lo, hi]) => {
    const inBin = rows.filter((r) => r.conf >= lo && r.conf < hi);
    if (!inBin.length) return `<tr><td>${lo}~${hi - 1}%</td><td class="num">0</td><td class="num">—</td><td class="num">—</td></tr>`;
    const acc = mean(inBin.map((r) => r.correct)); const avgConf = mean(inBin.map((r) => r.conf)) / 100;
    points.push({ x: avgConf, y: acc, r: 4 + Math.min(10, inBin.length), color: COLORS[1] });
    return `<tr><td>${lo}~${hi - 1}%</td><td class="num">${inBin.length}</td><td class="num">${pct(avgConf, 0)}</td><td class="num">${pct(acc, 0)}</td></tr>`;
  });
  scatter($("#calibration"), points, { xRange: [0.3, 1], yRange: [0, 1], diagonal: true, xLabel: "확신도", yLabel: "정답률" });
  const overall = mean(rows.map((r) => r.correct)); const avgConf = mean(rows.map((r) => r.conf)) / 100;
  $("#calibration-table").innerHTML = `<tr><th>확신도 구간</th><th class="num">팀 수</th><th class="num">평균 확신도</th><th class="num">실제 정답률</th></tr>${tableRows.join("")}<tr><td><strong>전체</strong></td><td class="num">${rows.length}</td><td class="num">${pct(avgConf, 0)}</td><td class="num">${pct(overall, 0)}</td></tr>`;
}

// ---- C. metrics ----
function renderMetrics() {
  const train = data.trainReturns;
  const gbm = compareToReal(data, simulate(data, { model: "gbm" }, train.length, 200, 11), train);
  let garch = null;
  try { garch = compareToReal(data, simulate(data, { model: "garch" }, train.length, 200, 12), train); } catch { /* fit failed */ }
  const fmtRow = (r) => `${r.fmt(r.median)} <span class="muted small">(${r.fmt(r.lo)}~${r.fmt(r.hi)})</span>`;
  $("#metric-table").innerHTML = `<tr><th>검사 항목</th><th class="num">실제 (추정 구간)</th><th class="num">GBM</th><th class="num">GARCH-t</th></tr>${gbm.rows.map((r, i) => `<tr><td>${r.label}</td><td class="num"><strong>${r.fmt(r.real)}</strong></td><td class="num${r.pass ? "" : " muted"}">${fmtRow(r)}${r.pass ? "" : " ✗"}</td><td class="num${garch?.rows[i].pass ? "" : " muted"}">${garch ? fmtRow(garch.rows[i]) : "적합 실패"}${garch && !garch.rows[i].pass ? " ✗" : ""}</td></tr>`).join("")}`;
  const fit = data.garch();
  $("#metric-note").textContent = `✗ = 실제값이 모형의 5~95% 범위 밖. GBM 통과 ${gbm.passCount}/5${garch ? ` · GARCH-t 통과 ${garch.passCount}/5 (α=${fmt(fit.alpha, 3)}, β=${fmt(fit.beta, 3)}, 자유도=${fmt(fit.dof, 1)}, ${fit.message})` : ""}. 추정 구간 ${train.length}일.`;
  lineChart($("#ret-real"), [{ values: train, color: COLORS[0], width: 1 }], { yLabel: "로그수익률" });
  lineChart($("#ret-gbm"), [{ values: simulate(data, { model: "gbm" }, train.length, 1, 5)[0], color: COLORS[2], width: 1 }], { yLabel: "로그수익률" });
}

// ---- D. shuffle ----
function renderShuffle(seed) {
  const orig = data.trainReturns;
  const shuf = shuffleReturns(orig, seed);
  const m = mean(orig); const s = sd(orig);
  const range = [Math.min(...orig), Math.max(...orig)];
  histogram($("#hist-orig"), orig, { bins: 40, range, overlays: [{ pdf: (x) => normalPdf(x, m, s), color: COLORS[4] }], xLabel: "로그수익률" });
  histogram($("#hist-shuf"), shuf, { bins: 40, range, overlays: [{ pdf: (x) => normalPdf(x, m, s), color: COLORS[4] }], xLabel: "로그수익률" });
  lineChart($("#path-orig"), [{ values: pathFromReturns(orig), color: COLORS[0] }], { log: true });
  lineChart($("#path-shuf"), [{ values: pathFromReturns(shuf), color: COLORS[1] }], { log: true });
  const a = diagnostics(orig, est.dailyMean, est.dailySd); const b = diagnostics(shuf, est.dailyMean, est.dailySd);
  const f = { annVol: pct, kurtosis: (v) => fmt(v, 2), exceed3: pct, acf1: (v) => fmt(v, 3), acf5: (v) => fmt(v, 3) };
  $("#shuffle-table").innerHTML = `<tr><th>검사 항목</th><th class="num">원본</th><th class="num">순서 섞음 (시드 ${seed})</th><th>변했나?</th></tr>${METRIC_KEYS.map((k) => { const changed = Math.abs(a[k] - b[k]) > Math.abs(a[k]) * 0.15 + 1e-9; return `<tr class="${changed ? "worse" : ""}"><td>${METRIC_LABELS[k]}</td><td class="num">${f[k](a[k])}</td><td class="num">${f[k](b[k])}</td><td>${changed ? "예 — 시간구조 검사" : "아니오 — 분포 검사"}</td></tr>`; }).join("")}`;
}

let shuffleSeed = 1;
$("#shuffle").addEventListener("click", () => { shuffleSeed += 1; renderShuffle(shuffleSeed); markComplete("tests"); });
renderMetrics();
renderShuffle(shuffleSeed);
$("#my-reason").value = state.votes?.round1?.reason || "(R1 제출 기록 없음)";
$("#translated").value = state.testsTranslated || "";
$("#learned").value = state.testsLearned || "";
$("#save").addEventListener("click", () => { saveState({ testsTranslated: $("#translated").value, testsLearned: $("#learned").value }); $("#save-status").textContent = "저장했습니다."; markComplete("tests"); });
poll(refreshReveal, 4000);

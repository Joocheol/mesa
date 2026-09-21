// Shared by 03-round1, 06-round2, 11-round3. The page's <body data-round="round1"> picks the round.
import { initChrome, $, $$, status, bindRange, escapeHtml } from "../ui.js";
import { loadState, saveState, markComplete, team } from "../state.js";
import { loadMarket } from "../data.js";
import { buildRound } from "../rounds.js";
import { voteState, submitVote, poll } from "../classroom.js";
import { lineChart, COLORS } from "../chart.js";
import { METRIC_KEYS, METRIC_LABELS, fmt, pct, brier } from "../stats.js";
import { runTeamModelOnWindow } from "../repair.js";

initChrome();
const roundId = document.body.dataset.round;
const data = await loadMarket();
const state = loadState();
let round = null;
let serverState = null;
let revealedLocally = Boolean(state.localReveal?.[roundId]);

function metricRows(cards) {
  return METRIC_KEYS.map((k) => `<tr><td>${METRIC_LABELS[k]}</td>${cards.map((c) => `<td class="num">${k === "exceed3" ? pct(c.metrics[k]) : k === "annVol" ? pct(c.metrics[k]) : fmt(c.metrics[k], 3)}</td>`).join("")}</tr>`).join("");
}

function renderCards() {
  const wrap = $("#cards");
  wrap.innerHTML = round.cards.map((c) => `<div class="card" data-card="${c.letter}"><div class="section-head"><h3>익명 ${c.letter}</h3><span class="pill" data-card-name="${c.letter}"></span></div>${round.show.chart ? `<div class="chart" data-chart="${c.letter}"></div><p class="chart-caption">${round.days}거래일 · 시작 100 · 로그축</p>` : ""}</div>`).join("");
  if (round.show.chart) round.cards.forEach((c, i) => lineChart($(`[data-chart="${c.letter}"]`), [{ values: c.path, color: COLORS[0], width: 1.8 }], { log: true }));
  if (round.show.metrics) {
    $("#metrics-wrap").classList.remove("hidden");
    $("#metrics").innerHTML = `<tr><th>검사 항목</th>${round.cards.map((c) => `<th class="num">${c.letter}</th>`).join("")}</tr>${metricRows(round.cards)}<tr><td class="muted small">±3σ 기준: 추정 구간 σ=${pct(data.estimates.dailySd, 2)}/일 · 표본 ${round.days}일</td>${round.cards.map(() => "<td></td>").join("")}</tr>`;
  }
  $("#choices").innerHTML = round.cards.map((c) => `<button class="choice" type="button" data-choice="${c.letter}">${c.letter}가 진짜</button>`).join("");
  $$("[data-choice]").forEach((b) => b.addEventListener("click", () => { $$("[data-choice]").forEach((x) => x.classList.remove("selected")); b.classList.add("selected"); $$("[data-card]").forEach((x) => x.classList.toggle("selected", x.dataset.card === b.dataset.choice)); }));
  const saved = state.votes?.[roundId];
  if (saved) { $(`[data-choice="${saved.choice}"]`)?.click(); $("#reason").value = saved.reason || ""; $("#confidence").value = saved.confidence; $("#confidence").dispatchEvent(new Event("input")); }
}

function renderReveal(correct, counts) {
  round.cards.forEach((c) => {
    $(`[data-card-name="${c.letter}"]`).textContent = c.name;
    const card = $(`[data-card="${c.letter}"]`);
    card.classList.toggle("correct", c.letter === correct);
  });
  const saved = loadState().votes?.[roundId];
  const own = saved ? { correct: saved.choice === correct, score: brier(saved.confidence, saved.choice === correct) } : null;
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
  $("#reveal").classList.remove("hidden");
  $("#reveal").innerHTML = `<div class="status ok">정답 공개: <strong>${correct}</strong>가 실제 주가입니다.</div>
    ${own ? `<div class="grid three" style="margin:.6rem 0"><div class="stat"><span class="number">${saved.choice}</span><span class="label">우리 팀 선택 · ${own.correct ? "정답" : "오답"}</span></div><div class="stat"><span class="number">${saved.confidence}%</span><span class="label">우리 확신도</span></div><div class="stat"><span class="number">${fmt(own.score, 3)}</span><span class="label">브라이어 점수 (${own.correct ? "1−(1−p)²" : "1−p²"})</span></div></div>` : `<p class="muted small">이 브라우저에서는 제출 기록이 없습니다.</p>`}
    ${counts ? `<p class="small muted">학급 분포 (${total}팀): ${["A", "B", "C"].map((l) => `${l} ${counts[l] || 0}팀 (${total ? Math.round(((counts[l] || 0) / total) * 100) : 0}%)`).join(" · ")}</p>` : ""}
    <p class="small">${roundId === "round1" ? "차트 모양만으로는 생성 과정을 확정할 수 없습니다. 다음 페이지에서 '왜 그렇게 골랐는지'를 숫자로 바꿉니다." : roundId === "round2" ? "숫자만 보고 고른 결과입니다. R1과 비교해 팀의 정답률·확신도가 어떻게 달라졌는지 리더보드에서 확인하세요." : "봉인 구간의 실제 변동성은 추정 구간과 크게 다를 수 있습니다. 모형이 '추정 구간의 특징'을 재현했다는 것과 '미래를 예측'한다는 것은 다릅니다."}</p>`;
}

async function refresh() {
  try {
    serverState = await voteState(roundId);
    $("#server-note").textContent = `서버 연결됨 · ${serverState.submissionCount}팀 제출 · ${serverState.open ? "접수 중" : "마감"} · ${serverState.revealed ? "공개됨" : "정답 비공개"}`;
    $("#submit").disabled = !serverState.open || serverState.revealed;
    if (serverState.revealed) renderReveal(serverState.correctChoice, serverState.counts);
    if (roundId === "round3") unseal(serverState.open || serverState.revealed);
  } catch (error) {
    $("#server-note").textContent = `서버에 연결할 수 없습니다 (${error.message}). 답안은 이 브라우저에만 저장됩니다.`;
    $("#submit").disabled = false;
    if (roundId === "round3") unseal(revealedLocally || Boolean(loadState().localUnseal));
    if (revealedLocally) renderReveal(round.answer, null);
  }
}

// Round 3 shows the sealed window only once the instructor opens the round (or offline override).
let examRendered = false;
function unseal(allowed) {
  const gate = $("#seal-gate");
  const content = $("#round-content");
  if (allowed) { gate.classList.add("hidden"); content.classList.remove("hidden"); if (!examRendered) { examRendered = true; renderTeamModelExam(); } }
  else { gate.classList.remove("hidden"); content.classList.add("hidden"); }
}

async function renderTeamModelExam() {
  const slot = $("#team-exam");
  if (!slot) return;
  const repair = loadState().repair;
  if (!repair) { slot.innerHTML = `<p class="muted small">이 브라우저에는 2b 수리 작업실에서 저장한 팀 모형이 없습니다.</p>`; return; }
  const sealed = data.sealed();
  const result = runTeamModelOnWindow(data, repair, sealed.testReturns, { paths: 200, seed: 77 });
  slot.innerHTML = `<p class="small">우리 팀 모형: <strong>${escapeHtml(result.label)}</strong> · 모수는 2b에서 저장한 값 그대로(고정) · 200경로 × ${sealed.testReturns.length}일</p>
    <div class="table-wrap"><table><tr><th>검사 항목</th><th class="num">봉인 구간 실제</th><th class="num">우리 모형 중앙값</th><th class="num">5%~95%</th><th>실제가 범위 안?</th></tr>
    ${result.rows.map((r) => `<tr class="${r.pass ? "better" : "worse"}"><td>${r.label}</td><td class="num">${r.fmt(r.real)}</td><td class="num">${r.fmt(r.median)}</td><td class="num">${r.fmt(r.lo)} ~ ${r.fmt(r.hi)}</td><td>${r.pass ? "예" : "아니오"}</td></tr>`).join("")}</table></div>
    <p class="small muted">통과 ${result.passCount}/${result.rows.length}. 이 표를 본 뒤 모형을 바꾸면 그 결과는 '탐색적 재평가'로 표시해야 합니다 — 봉인 구간은 한 번만 봉인 구간입니다.</p>`;
  saveState({ round3Exam: { passCount: result.passCount, label: result.label, at: new Date().toISOString() } });
}

async function main() {
  round = buildRound(roundId, data);
  renderCards();
  bindRange($("#confidence"), $("#confidence-out"), (v) => `${v}%`);
  $("#submit").addEventListener("click", async () => {
    const chosen = $("[data-choice].selected");
    if (!chosen) return status("vote-status", "먼저 A/B/C 중 하나를 고르세요.", "error");
    const t = team();
    if (!t.teamName) return status("vote-status", "팀 입장 페이지에서 팀명을 먼저 입력하세요.", "error");
    const vote = { choice: chosen.dataset.choice, confidence: Number($("#confidence").value), reason: $("#reason").value.trim(), at: new Date().toISOString() };
    if (!vote.reason) return status("vote-status", "이유를 한 문장 적어 주세요 — 다음 교시의 검사 항목이 됩니다.", "error");
    saveState({ votes: { ...(loadState().votes || {}), [roundId]: vote } });
    try {
      await submitVote(roundId, vote);
      status("vote-status", "제출했습니다. 강사가 공개할 때까지 정답과 학급 분포는 보이지 않습니다. 다시 제출하면 덮어씁니다.", "ok");
    } catch (error) {
      status("vote-status", `서버 제출 실패: ${error.message}. 답안은 이 브라우저에 저장했습니다.`, "warning");
    }
    markComplete(roundId);
    refresh();
  });
  $("#local-reveal")?.addEventListener("click", () => {
    if (!confirm("서버 없이 이 브라우저에서만 정답을 공개합니다. 강사용 오프라인 기능입니다. 계속할까요?")) return;
    revealedLocally = true;
    saveState({ localReveal: { ...(loadState().localReveal || {}), [roundId]: true } });
    renderReveal(round.answer, null);
  });
  $("#local-unseal")?.addEventListener("click", () => {
    if (!confirm("서버 없이 봉인을 해제합니다. 강사가 R3를 시작할 때만 누르세요.")) return;
    saveState({ localUnseal: true });
    unseal(true);
  });
  poll(refresh, 3000);
}
main();

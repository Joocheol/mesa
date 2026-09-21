import { initChrome, $, $$, status, escapeHtml, download } from "../ui.js";
import { loadState, saveState, markComplete, team } from "../state.js";
import { ROUNDS } from "../pages.js";
import { fmt } from "../stats.js";

initChrome();
const state = loadState();
const IDS = ["goal", "evidence", "failure", "missing", "next"];
const LABELS = { goal: "재현 목표", evidence: "검증 근거", failure: "사용하기 어려운 상황", missing: "빠진 참여자·정보·거래 구조", next: "다음 실험" };
const RUBRIC = { problem: "문제 정의가 분명한가", fair: "비교가 공정한가 (표본 길이·구간·시드)", repeat: "반복 실행으로 확인했는가", limits: "한계를 설명했는가" };

IDS.forEach((id) => { $(`#card-${id}`).value = state.modelCard?.[id] || ""; });
$("#rubric").innerHTML = `<tr><th>항목</th><th>점수</th></tr>${Object.entries(RUBRIC).map(([k, v]) => `<tr><td>${v}</td><td><select data-rubric="${k}">${[0, 1, 2].map((n) => `<option value="${n}"${(state.rubric?.[k] ?? 0) === n ? " selected" : ""}>${n} — ${["없음", "부분적", "명확한 근거"][n]}</option>`).join("")}</select></td></tr>`).join("")}`;
$("#review-note").value = state.reviewNote || "";
$("#lookback-note").value = state.lookbackNote || "";

const votes = state.votes || {};
$("#summary").innerHTML = `<table>
  <tr><th>활동</th><th>기록</th></tr>
  <tr><td>0 · 사람 난수</td><td class="small">${escapeHtml(state.coinLearned || "—")}</td></tr>
  <tr><td>1a · 곱셈 세계 예상/실제</td><td class="small">${state.compoundResult ? `평균 예상 ${state.compoundGuess?.mean || "?"} → 실제 ${fmt(state.compoundResult.mean, 0)} · 중앙값 예상 ${state.compoundGuess?.median || "?"} → 실제 ${fmt(state.compoundResult.median, 1)}` : "—"}</td></tr>
  <tr><td>1b · GBM 가정</td><td class="small">${escapeHtml(state.gbmAssumption || "—")}</td></tr>
  ${Object.keys(ROUNDS).map((id) => `<tr><td>${ROUNDS[id].label}</td><td class="small">${votes[id] ? `${votes[id].choice} · 확신도 ${votes[id].confidence}% · "${escapeHtml(votes[id].reason)}"` : "—"}</td></tr>`).join("")}
  <tr><td>2b · 수리</td><td class="small">${state.repair ? `${state.repair.model} · 통과 ${state.repairScore ?? "?"}/5 · 나빠진 지표: ${escapeHtml(state.repairWorse || "—")}` : "—"}</td></tr>
  <tr><td>3a · 우리 규칙</td><td class="small">${Object.values(state.teamRules || {}).filter(Boolean).map(escapeHtml).join(" / ") || "—"}</td></tr>
  <tr><td>3b · ABM</td><td class="small">${state.abmScore != null ? `통과 ${state.abmScore}/5 · ${escapeHtml(state.abmNotes || "")}` : "—"}</td></tr>
  <tr><td>4a · LLM</td><td class="small">${escapeHtml(state.llmNotes || "—")}</td></tr>
  <tr><td>4b · 봉인 구간 성적</td><td class="small">${state.round3Exam ? `${escapeHtml(state.round3Exam.label)} · 통과 ${state.round3Exam.passCount}/5` : "—"}</td></tr>
</table>`;

$("#lookback").innerHTML = votes.round1 ? `<div class="grid three"><div class="stat"><span class="number">${votes.round1.choice}</span><span class="label">R1 선택 · 확신도 ${votes.round1.confidence}%</span></div><div class="stat"><span class="number">${votes.round2?.confidence ?? "—"}%</span><span class="label">R2 확신도</span></div><div class="stat"><span class="number">${votes.round3?.confidence ?? "—"}%</span><span class="label">R3 확신도</span></div></div><blockquote class="small">R1에서 쓴 이유: "${escapeHtml(votes.round1.reason)}"</blockquote><p class="small muted">번역 메모(2a): ${escapeHtml(state.testsTranslated || "—")}</p>` : `<p class="muted small">이 브라우저에 R1 기록이 없습니다.</p>`;

function collect() {
  const modelCard = Object.fromEntries(IDS.map((id) => [id, $(`#card-${id}`).value]));
  const rubric = Object.fromEntries($$("[data-rubric]").map((s) => [s.dataset.rubric, Number(s.value)]));
  saveState({ modelCard, rubric, reviewNote: $("#review-note").value, lookbackNote: $("#lookback-note").value });
  return { modelCard, rubric };
}
$("#save").addEventListener("click", () => { collect(); status("final-status", "이 브라우저에 저장했습니다.", "ok"); markComplete("final"); });
$("#download-md").addEventListener("click", () => {
  const { modelCard, rubric } = collect();
  const t = team();
  const body = [`# 한 장 모형 설명서 — ${t.teamName || "팀"}`, "", ...IDS.flatMap((id) => [`## ${LABELS[id]}`, modelCard[id] || "(미작성)", ""]), "## 교차 심사", ...Object.entries(rubric).map(([k, v]) => `- ${RUBRIC[k]}: ${v}/2`), `- 심사 메모: ${$("#review-note").value || "—"}`, "", "## 처음 판단 다시 보기", $("#lookback-note").value || "—", "", "> 일부 통계적 특징의 재현은 미래 가격의 정확한 예측을 뜻하지 않는다.", "", `생성 시각: ${new Date().toISOString()}`].join("\n");
  download(`model-card-${t.teamName || "team"}.md`, body, "text/markdown");
  markComplete("final");
});
$("#download-json").addEventListener("click", () => { collect(); download(`workshop-record-${team().teamName || "team"}.json`, JSON.stringify(loadState(), null, 2), "application/json"); });

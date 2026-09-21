import { initChrome, $, $$, status, escapeHtml } from "../ui.js";
import { instructor, poll } from "../classroom.js";
import { loadMarket } from "../data.js";
import { buildRound } from "../rounds.js";
import { ROUNDS } from "../pages.js";

initChrome();
const data = await loadMarket();
const answers = Object.fromEntries(Object.keys(ROUNDS).map((id) => [id, buildRound(id, data).answer]));
let activeRound = "round1";
const classCode = () => $("#class-code").value.trim().toUpperCase() || "MESA";

async function refresh() {
  try {
    const me = await instructor.me();
    if (!me.ok) { $("#login").classList.remove("hidden"); $("#console").classList.add("hidden"); return; }
    const results = await Promise.all(Object.keys(ROUNDS).map((id) => instructor.results(classCode(), id)));
    $("#login").classList.add("hidden"); $("#console").classList.remove("hidden");
    $("#console-state").textContent = `${classCode()} · 갱신 ${new Date().toLocaleTimeString("ko-KR")}`;
    $("#rounds").innerHTML = results.map((r) => `<div class="card${r.revealed ? " correct" : ""}"><p class="eyebrow">${ROUNDS[r.activityId].label}</p><p><strong>${r.submissionCount}팀 제출</strong><br><span class="small muted">${r.open ? "접수 중" : "마감"} · ${r.revealed ? `공개됨 · 정답 ${r.correctChoice}` : "비공개"} · 계산된 정답 <strong>${answers[r.activityId]}</strong></span></p>
      <div class="actions"><button class="button small" data-act="open" data-round="${r.activityId}" data-value="${!r.open}">${r.open ? "마감" : "열기"}</button><button class="button small ${r.revealed ? "" : "primary"}" data-act="reveal" data-round="${r.activityId}" data-value="${!r.revealed}">${r.revealed ? "다시 숨기기" : "정답 공개"}</button><button class="button small danger" data-act="reset" data-round="${r.activityId}">이 라운드 초기화</button></div></div>`).join("");
    $$("[data-act]").forEach((b) => b.addEventListener("click", () => act(b.dataset.act, b.dataset.round, b.dataset.value === "true")));
    $("#round-tabs").innerHTML = Object.keys(ROUNDS).map((id) => `<button class="choice${id === activeRound ? " selected" : ""}" type="button" data-tab="${id}">${id.replace("round", "R")}</button>`).join("");
    $$("[data-tab]").forEach((b) => b.addEventListener("click", () => { activeRound = b.dataset.tab; refresh(); }));
    const r = results.find((x) => x.activityId === activeRound);
    $("#votes-title").textContent = `제출 현황 · ${ROUNDS[activeRound].label}`;
    $("#votes").innerHTML = `<tr><th>팀</th><th>선택</th><th class="num">확신도</th><th>이유</th><th>시각</th></tr>${r.votes.length ? r.votes.map((v) => `<tr class="${r.revealed ? (v.choice === r.correctChoice ? "better" : "worse") : ""}"><td>${escapeHtml(v.team_name)}</td><td>${v.choice}</td><td class="num">${v.confidence}%</td><td>${escapeHtml(v.reason)}</td><td class="small muted">${new Date(v.updated_at).toLocaleTimeString("ko-KR")}</td></tr>`).join("") : `<tr><td colspan="5" class="muted">아직 제출이 없습니다.</td></tr>`}`;
    const s = await instructor.scores(classCode());
    $("#scores").innerHTML = `<tr><th>활동</th><th>팀</th><th class="num">점수</th><th>내용</th></tr>${s.scores.length ? s.scores.map((x) => `<tr><td>${x.activity_id}</td><td>${escapeHtml(x.team_name)}</td><td class="num">${x.value}</td><td class="small">${escapeHtml(x.detail)}</td></tr>`).join("") : `<tr><td colspan="4" class="muted">아직 없습니다.</td></tr>`}`;
  } catch (error) {
    $("#login").classList.remove("hidden"); $("#console").classList.add("hidden");
    if (!/로그인/.test(error.message)) status("login-status", error.message, "error");
  }
}

async function act(kind, roundId, value) {
  try {
    if (kind === "open") await instructor.state(classCode(), roundId, { open: value });
    if (kind === "reveal") {
      if (value && !confirm(`${ROUNDS[roundId].label}의 정답(${answers[roundId]})을 모든 참가자에게 공개합니다. 제출은 자동으로 마감됩니다.`)) return;
      await instructor.state(classCode(), roundId, { revealed: value, correctChoice: answers[roundId], ...(value ? { open: false } : {}) });
    }
    if (kind === "reset") { if (!confirm(`${ROUNDS[roundId].label}의 모든 제출을 삭제하고 비공개·접수 중으로 되돌립니다.`)) return; await instructor.reset(classCode(), roundId); }
    status("console-status", "적용했습니다.", "ok");
    refresh();
  } catch (error) { status("console-status", error.message, "error"); }
}

$("#login").addEventListener("submit", async (e) => {
  e.preventDefault();
  try { await instructor.login($("#password").value); status("login-status", "인증 성공", "ok"); refresh(); }
  catch (error) { status("login-status", error.message, "error"); }
});
$("#logout").addEventListener("click", async () => { await instructor.logout(); location.reload(); });
$("#reset-all").addEventListener("click", async () => {
  if (!confirm(`수업 ${classCode()}의 모든 투표·점수·라운드 상태를 초기화합니다. 되돌릴 수 없습니다.`)) return;
  try { await instructor.reset(classCode(), ""); status("console-status", "초기화했습니다.", "ok"); refresh(); } catch (error) { status("console-status", error.message, "error"); }
});
$("#class-code").addEventListener("change", refresh);
poll(refresh, 4000);

import { initChrome, $, status, escapeHtml } from "../ui.js";
import { instructor, poll } from "../classroom.js";
import { loadMarket } from "../data.js";
import { buildRound } from "../rounds.js";
import { PAGES, ROUNDS } from "../pages.js";

initChrome();

const PHASE_LABELS = { setup: "준비", activity: "활동 중", paused: "일시정지", debrief: "디브리프", break: "휴식", ended: "종료" };
const pageMap = Object.fromEntries(PAGES.map((p) => [p.id, p]));
const classCode = () => $("#class-code").value.trim().toUpperCase() || "MESA";
let current = null;
let dirtyActivity = false;
let roundAnswers = {};

$("#activity").innerHTML = PAGES.map((p) => `<option value="${p.id}">${p.block} · ${p.no} ${escapeHtml(p.title)} (${p.minutes}분)</option>`).join("");

try {
  const market = await loadMarket();
  roundAnswers = Object.fromEntries(Object.keys(ROUNDS).map((id) => [id, buildRound(id, market).answer]));
} catch { /* round controls show an unavailable state */ }

function urls() {
  const code = encodeURIComponent(classCode());
  const present = `${location.origin}/present.html?class=${code}`;
  const join = `${location.origin}/join.html?class=${code}`;
  $("#open-present").href = present;
  $("#present-url").textContent = present;
  $("#join-url").textContent = join;
  return { present, join };
}

function setTimer() {
  if (!current) return;
  const remaining = current.endsAt ? Math.max(0, current.endsAt - Math.floor(Date.now() / 1000)) : Number(current.remainingSeconds || 0);
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  $("#facilitator-timer").textContent = `${mm}:${ss}`;
  $("#facilitator-timer").classList.toggle("expired", remaining === 0 && ["activity", "debrief", "break"].includes(current.phase));
}

async function setPhase(phase, durationSeconds = 0, activityId = $("#activity").value) {
  try {
    current = await instructor.setFacilitation({ classCode: classCode(), activityId, phase, durationSeconds, message: $("#message").value.trim() });
    dirtyActivity = false;
    status("control-status", "프로젝터에 반영했습니다.", "ok");
    await refresh();
  } catch (error) { status("control-status", error.message, "error"); }
}

async function refreshRound(results) {
  const id = current?.activityId;
  const card = $("#round-control");
  if (!ROUNDS[id]) { card.classList.add("hidden"); return; }
  card.classList.remove("hidden");
  const round = results.find((r) => r.activityId === id);
  $("#round-title").textContent = ROUNDS[id].label;
  $("#round-answer").textContent = roundAnswers[id] ? `강사용 정답 ${roundAnswers[id]}` : "정답 계산 불가";
  $("#round-summary").textContent = `${round.submissionCount}팀 제출 · ${round.open ? "접수 중" : "마감"} · ${round.revealed ? "정답 공개됨" : "정답 비공개"}`;
  $("#toggle-round").textContent = round.open ? "제출 마감" : "제출 열기";
  $("#toggle-round").dataset.open = String(!round.open);
  $("#reveal-round").disabled = round.revealed;
}

async function refresh() {
  try {
    const me = await instructor.me();
    if (!me.ok) { $("#login").classList.remove("hidden"); $("#facilitator").classList.add("hidden"); return; }
    const [facilitation, presence, ...results] = await Promise.all([
      instructor.facilitation(classCode()),
      instructor.presence(classCode()),
      ...Object.keys(ROUNDS).map((id) => instructor.results(classCode(), id)),
    ]);
    current = facilitation;
    $("#login").classList.add("hidden");
    $("#facilitator").classList.remove("hidden");
    $("#connection-state").textContent = `${classCode()} · 연결됨`;
    $("#current-title").textContent = pageMap[current.activityId]?.title || current.activityId;
    $("#current-phase").textContent = PHASE_LABELS[current.phase] || current.phase;
    $("#current-phase").dataset.phase = current.phase;
    if (!dirtyActivity) {
      $("#activity").value = current.activityId;
      $("#minutes").value = pageMap[current.activityId]?.minutes || 10;
      $("#message").value = current.message || "";
    }
    const nowMs = Date.now();
    const rows = presence.devices || [];
    const active = rows.filter((d) => nowMs - Date.parse(d.updated_at) < 2 * 60 * 1000);
    $("#active-devices").textContent = active.length;
    $("#known-devices").textContent = rows.length;
    $("#presence-table").innerHTML = `<tr><th>팀</th><th>현재 화면</th><th>상태</th></tr>${rows.length ? rows.map((d) => { const live = nowMs - Date.parse(d.updated_at) < 2 * 60 * 1000; return `<tr><td>${escapeHtml(d.team_name)}</td><td>${escapeHtml(pageMap[d.activity_id]?.title || d.activity_id)}</td><td class="${live ? "live" : "muted"}">${live ? "접속 중" : "자리 비움"}</td></tr>`; }).join("") : `<tr><td colspan="3" class="muted">아직 입장한 기기가 없습니다.</td></tr>`}`;
    $("#round-counts").innerHTML = results.map((r) => `<div class="stat"><span class="number">${r.submissionCount}</span><span class="label">${ROUNDS[r.activityId].label}</span></div>`).join("");
    await refreshRound(results);
    urls();
    setTimer();
  } catch (error) {
    $("#connection-state").textContent = "연결 확인 필요";
    if (!/로그인/.test(error.message)) status("control-status", error.message, "error");
  }
}

$("#login").addEventListener("submit", async (event) => {
  event.preventDefault();
  try { await instructor.login($("#password").value); status("login-status", "인증되었습니다.", "ok"); await refresh(); }
  catch (error) { status("login-status", error.message, "error"); }
});
$("#class-code").addEventListener("change", () => { urls(); refresh(); });
$("#activity").addEventListener("change", () => { dirtyActivity = true; $("#minutes").value = pageMap[$("#activity").value]?.minutes || 10; });
$("#prepare").addEventListener("click", () => setPhase("setup"));
$("#start").addEventListener("click", () => setPhase("activity", Math.round(Number($("#minutes").value) * 60)));
$("#pause").addEventListener("click", () => current && setPhase("paused", 0, current.activityId));
$("#resume").addEventListener("click", () => current && setPhase("activity", current.remainingSeconds || 0, current.activityId));
$("#debrief").addEventListener("click", () => setPhase("debrief", 5 * 60));
$("#break").addEventListener("click", () => setPhase("break", 10 * 60));
$("#end").addEventListener("click", () => current && setPhase("ended", 0, current.activityId));
$("#next").addEventListener("click", () => {
  const index = PAGES.findIndex((p) => p.id === (current?.activityId || $("#activity").value));
  const next = PAGES[Math.min(PAGES.length - 1, index + 1)];
  $("#activity").value = next.id;
  $("#minutes").value = next.minutes;
  setPhase("setup", 0, next.id);
});
$("#toggle-round").addEventListener("click", async () => {
  if (!current || !ROUNDS[current.activityId]) return;
  await instructor.state(classCode(), current.activityId, { open: $("#toggle-round").dataset.open === "true" });
  refresh();
});
$("#reveal-round").addEventListener("click", async () => {
  if (!current || !ROUNDS[current.activityId]) return;
  const answer = roundAnswers[current.activityId];
  if (!answer || !confirm(`${ROUNDS[current.activityId].label} 정답(${answer})을 공개하고 제출을 마감합니다.`)) return;
  await instructor.state(classCode(), current.activityId, { open: false, revealed: true, correctChoice: answer });
  refresh();
});
$("#copy-join").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(urls().join); status("control-status", "참가 링크를 복사했습니다.", "ok"); }
  catch { status("control-status", "주소를 선택해 직접 복사해 주세요.", "warning"); }
});
$("#logout").addEventListener("click", async () => { await instructor.logout(); location.reload(); });

urls();
setInterval(setTimer, 250);
poll(refresh, 4000);

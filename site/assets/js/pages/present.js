import { presentation } from "../classroom.js";
import { PAGES } from "../pages.js";

const $ = (selector) => document.querySelector(selector);
const pageMap = Object.fromEntries(PAGES.map((p) => [p.id, p]));
const PHASE_LABELS = { setup: "준비", activity: "활동 중", paused: "일시정지", debrief: "디브리프", break: "휴식", ended: "종료" };
const params = new URLSearchParams(location.search);
const classCode = (params.get("class") || "MESA").trim().toUpperCase();
let state = null;
let framedActivity = null;

const joinUrl = `${location.origin}/join.html?class=${encodeURIComponent(classCode)}`;
$("#projector-join-url").textContent = joinUrl;
$("#projector-class-code").textContent = classCode;

function timer() {
  if (!state) return;
  const seconds = state.endsAt ? Math.max(0, state.endsAt - Math.floor(Date.now() / 1000)) : Number(state.remainingSeconds || 0);
  $("#present-timer").textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  $("#present-timer").classList.toggle("expired", seconds === 0 && ["activity", "debrief", "break"].includes(state.phase));
}

function render() {
  const page = pageMap[state.activityId] || PAGES[0];
  $("#present-title").textContent = `${page.no} · ${page.title}`;
  $("#present-summary").textContent = state.message || page.summary;
  $("#present-phase").textContent = PHASE_LABELS[state.phase] || state.phase;
  $("#present-active").textContent = state.activeDevices || 0;
  const submissions = $("#present-submissions");
  if (state.round) { submissions.classList.remove("hidden"); submissions.textContent = `${state.round.submissionCount}팀 제출`; }
  else submissions.classList.add("hidden");

  const cover = $("#present-cover");
  const frame = $("#activity-frame");
  const showCover = ["setup", "break", "ended"].includes(state.phase);
  cover.classList.toggle("hidden", !showCover);
  frame.classList.toggle("hidden", showCover);
  if (state.phase === "break") {
    $("#cover-eyebrow").textContent = "휴식";
    $("#cover-title").textContent = "잠시 쉬어 갑니다";
    $("#cover-message").textContent = state.message || `다음 활동: ${page.title}`;
  } else if (state.phase === "ended") {
    $("#cover-eyebrow").textContent = "수업 종료";
    $("#cover-title").textContent = "수고하셨습니다";
    $("#cover-message").textContent = state.message || "마지막 기록을 저장하고 모형 설명서를 내려받으세요.";
  } else {
    $("#cover-eyebrow").textContent = `${page.block} · ${page.no}`;
    $("#cover-title").textContent = page.title;
    $("#cover-message").textContent = state.message || page.summary;
  }
  if (!showCover && framedActivity !== page.id) {
    framedActivity = page.id;
    frame.src = `${page.file}?projector=1&class=${encodeURIComponent(classCode)}`;
  }
  timer();
}

async function refresh() {
  try {
    state = await presentation(classCode);
    $("#present-error").classList.add("hidden");
    render();
  } catch (error) {
    $("#present-error").textContent = `진행 화면에 연결할 수 없습니다: ${error.message}`;
    $("#present-error").classList.remove("hidden");
  }
}

setInterval(timer, 250);
setInterval(refresh, 3000);
refresh();

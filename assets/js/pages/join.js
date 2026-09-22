import { initChrome, $, status } from "../ui.js";
import { loadState, saveState, resetState } from "../state.js";
import { PAGES } from "../pages.js";

initChrome();
const form = $("#join-form");
const state = loadState();
form.classCode.value = new URLSearchParams(location.search).get("class") || state.classCode || "MESA";
form.teamName.value = state.teamName || "";
form.members.value = state.members || "";
const done = (state.completed || []).length;
$("#progress-note").textContent = done ? `${done}/${PAGES.length} 활동 완료 · 팀 ${state.teamName || "(미입력)"}` : "아직 저장된 활동이 없습니다.";

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const classCode = form.classCode.value.trim().toUpperCase();
  const teamName = form.teamName.value.trim();
  if (!classCode || !teamName) return status("join-status", "수업 코드와 팀명을 입력하세요.", "error");
  saveState({ classCode, teamName, members: form.members.value.trim() });
  location.href = "00-random.html";
});
$("#reset-all").addEventListener("click", () => {
  if (!confirm("이 브라우저에 저장된 모든 진행 상태·답안·시장 기록을 지웁니다. 서버에 제출한 투표는 남습니다.")) return;
  resetState();
  location.reload();
});

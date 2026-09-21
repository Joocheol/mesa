import { initChrome, $, $$, status } from "../ui.js";
import { loadState, saveState, markComplete } from "../state.js";
import { seedRandom } from "../rng.js";
import { runsAnalysis, humanIndex, humanVerdict } from "../stats.js";

initChrome();
const state = loadState();
let human = state.coinHuman || [];
let coin = state.coinMachine || [];
let locked = false;

function renderSeq(node, seq, highlightLongest = false) {
  let longestStart = 0; let longestLen = 0; let cur = 0; let start = 0;
  for (let i = 0; i < seq.length; i += 1) {
    if (i > 0 && seq[i] === seq[i - 1]) cur += 1; else { cur = 1; start = i; }
    if (cur > longestLen) { longestLen = cur; longestStart = start; }
  }
  node.innerHTML = seq.map((s, i) => `<span class="${s}${highlightLongest && i >= longestStart && i < longestStart + longestLen ? " run" : ""}">${s}</span>`).join("");
}
function render() {
  renderSeq($("[data-seq-human]"), human);
  renderSeq($("[data-seq-coin]"), coin);
  $("[data-count-human]").textContent = human.length;
  saveState({ coinHuman: human, coinMachine: coin });
}
function setLocked(next) {
  locked = next;
  $$("[data-add], [data-undo], [data-clear], [data-flip], [data-seed], #analyze").forEach((control) => { control.disabled = next; });
}
$$("[data-add]").forEach((b) => b.addEventListener("click", () => { if (!locked && human.length < 30) { human.push(b.dataset.add); render(); } }));
$("[data-undo]").addEventListener("click", () => { human.pop(); render(); });
$("[data-clear]").addEventListener("click", () => { human = []; render(); });
$("[data-flip]").addEventListener("click", () => {
  const rng = seedRandom(Number($("[data-seed]").value) || 1);
  coin = Array.from({ length: 30 }, () => (rng() < 0.5 ? "H" : "T"));
  render();
});

function card(title, a, v, h) {
  return `<div class="card soft"><p class="eyebrow">${title}</p>
    <table><tr><th>지표</th><th class="num">관측</th><th class="num">공정한 동전 기대</th></tr>
    <tr><td>앞면 개수</td><td class="num">${a.heads} / ${a.n}</td><td class="num">${(a.n / 2).toFixed(1)} ± ${Math.sqrt(a.n / 4).toFixed(1)}</td></tr>
    <tr><td>연속 묶음 수 (runs)</td><td class="num">${a.runs}</td><td class="num">${a.expectedRuns.toFixed(1)} ± ${a.sdRuns.toFixed(1)}</td></tr>
    <tr><td>runs z-점수</td><td class="num">${a.zRuns.toFixed(2)}</td><td class="num">0 ± 1</td></tr>
    <tr><td>최장 연속</td><td class="num">${a.longest}</td><td class="num">≈ ${a.expectedLongest.toFixed(1)}</td></tr>
    </table>
    <p class="small" style="margin-top:.5rem"><strong>${v.label}</strong> · 사람다움 지수 ${h.value}<br><span class="muted">${(v.notes || []).join(" · ") || "특이점 없음"}</span></p></div>`;
}

$("#analyze").addEventListener("click", () => {
  if (human.length < 30 || coin.length < 30) return status("verdict", "두 수열 모두 30개가 필요합니다.", "error");
  const aH = runsAnalysis(human); const aC = runsAnalysis(coin);
  const vH = humanVerdict(aH); const vC = humanVerdict(aC);
  const hH = humanIndex(aH); const hC = humanIndex(aC);
  renderSeq($("[data-seq-human]"), human, true);
  renderSeq($("[data-seq-coin]"), coin, true);
  $("#analysis").innerHTML = card("A · 손으로 쓴 수열", aH, vH, hH) + card("B · 진짜 동전", aC, vC, hC);
  const gap = hH.raw - hC.raw;
  const guess = Math.abs(gap) < 0.15 ? null : gap > 0 ? "A" : "B";
  const msg = guess ? `검사기의 판정: ${guess}가 사람이 쓴 수열입니다. ${guess === "A" ? "맞았습니다 — 실제로 A가 사람이었죠." : "틀렸습니다! 이번에는 사람이 검사를 속였습니다. 30개만으로는 완벽히 구별할 수 없습니다."}` : "검사기가 판단을 유보했습니다. 두 수열의 사람다움 지수가 너무 가깝습니다. 30개는 짧습니다 — 표본이 더 있으면 갈립니다.";
  status("verdict", msg, guess === "A" ? "ok" : "warning");
  $("#detector-rules").classList.remove("hidden");
  $("#retry").classList.remove("hidden");
  setLocked(true);
  markComplete("random");
});

$("#retry").addEventListener("click", () => {
  human = [];
  coin = [];
  $("#analysis").innerHTML = "";
  $("#verdict").className = "status hidden";
  $("#verdict").textContent = "";
  $("#detector-rules").classList.add("hidden");
  $("#retry").classList.add("hidden");
  setLocked(false);
  render();
  $('[data-add="H"]').focus();
});

$("#predict").value = state.coinPredict || "";
$("#learned").value = state.coinLearned || "";
$("#save").addEventListener("click", () => { saveState({ coinPredict: $("#predict").value, coinLearned: $("#learned").value }); $("#save-status").textContent = "저장했습니다."; });
render();

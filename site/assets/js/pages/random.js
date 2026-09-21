import { initChrome, $, $$, status } from "../ui.js";
import { loadState, saveState, markComplete } from "../state.js";
import { seedRandom } from "../rng.js";
import { coinRoundEvidence, cumulativeHumanProbability, runsAnalysis, humanIndex, humanVerdict } from "../stats.js";

initChrome();
const state = loadState();
const MAX_ROUNDS = 5;
let rounds = Array.isArray(state.coinRounds) ? state.coinRounds.slice(0, MAX_ROUNDS) : [];
let human = state.coinHuman || [];
let coin = state.coinMachine || [];
let locked = false;
if (rounds.length && human.length === 30 && coin.length === 30) {
  human = [];
  coin = [];
}

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
function roundEvidence(round) {
  return coinRoundEvidence(runsAnalysis(round.human), runsAnalysis(round.coin));
}
function renderSeries() {
  const panel = $("#series");
  if (!rounds.length) {
    panel.classList.add("hidden");
    $("#reset-series").classList.add("hidden");
    return 0.5;
  }
  const evidence = rounds.map(roundEvidence);
  let runningLogOdds = 0;
  const rows = evidence.map((item, i) => {
    runningLogOdds += item.logOdds;
    const probability = cumulativeHumanProbability([runningLogOdds]);
    return `<tr><td>${i + 1}판</td><td class="num">${item.human.value}</td><td class="num">${item.coin.value}</td><td class="num">${item.logOdds >= 0 ? "+" : ""}${item.logOdds.toFixed(2)}</td><td class="num">${Math.round(probability * 100)}%</td></tr>`;
  });
  const probability = cumulativeHumanProbability(evidence.map((item) => item.logOdds));
  const pct = Math.round(probability * 100);
  $("#human-probability").textContent = `${pct}%`;
  $("#round-count").textContent = `${rounds.length} / ${MAX_ROUNDS}`;
  $("#series-summary").textContent = rounds.length < 3
    ? `${3 - rounds.length}판을 더 하면 한 번의 우연에 덜 흔들립니다.`
    : "권장 3판을 채웠습니다. 최대 5판까지 누적할 수 있습니다.";
  $("#round-history").innerHTML = rows.join("");
  panel.classList.remove("hidden");
  $("#reset-series").classList.remove("hidden");
  return probability;
}
function updateRoundPrompt() {
  $("#round-prompt").textContent = rounds.length >= MAX_ROUNDS
    ? "최대 5판을 완료했습니다. 아래 누적 결과를 확인하거나 기록을 초기화하세요."
    : rounds.length
    ? `${rounds.length + 1}판째 수열을 완성하세요. 이전 판의 증거는 그대로 누적됩니다.`
    : "먼저 수열을 완성해 판정하세요. 검사 규칙은 첫 제출 뒤 공개됩니다.";
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
    <tr><td>긴 run 상위 3개</td><td class="num">${a.longest} · ${a.secondLongest} · ${a.thirdLongest}</td><td class="num">≈ ${a.expectedLongest.toFixed(1)} · ${a.expectedSecondLongest.toFixed(1)} · ${a.expectedThirdLongest.toFixed(1)}</td></tr>
    <tr><td>길이 1 run 비율</td><td class="num">${Math.round(a.singletonRate * 100)}%</td><td class="num">≈ 50%</td></tr>
    </table>
    <p class="small" style="margin-top:.5rem"><strong>${v.label}</strong> · 사람다움 지수 ${h.value}<br><span class="muted">${(v.notes || []).join(" · ") || "특이점 없음"}</span></p></div>`;
}

$("#analyze").addEventListener("click", () => {
  if (rounds.length >= MAX_ROUNDS) return status("verdict", "최대 5판을 완료했습니다. 새 누적 검사를 시작하려면 기록을 초기화하세요.", "warning");
  if (human.length < 30 || coin.length < 30) return status("verdict", "두 수열 모두 30개가 필요합니다.", "error");
  const aH = runsAnalysis(human); const aC = runsAnalysis(coin);
  const vH = humanVerdict(aH); const vC = humanVerdict(aC);
  const hH = humanIndex(aH); const hC = humanIndex(aC);
  renderSeq($("[data-seq-human]"), human, true);
  renderSeq($("[data-seq-coin]"), coin, true);
  $("#analysis").innerHTML = card("A · 손으로 쓴 수열", aH, vH, hH) + card("B · 진짜 동전", aC, vC, hC);
  rounds.push({ human: [...human], coin: [...coin], seed: Number($("[data-seed]").value) || 1 });
  saveState({ coinRounds: rounds, coinHuman: human, coinMachine: coin });
  const probability = renderSeries();
  updateRoundPrompt();
  const pct = Math.round(probability * 100);
  const headline = pct >= 55
    ? "당신이 사람인 것 같습니다."
    : pct <= 45
      ? "아직 사람이라고 보기 어렵습니다."
      : "아직 판단을 유보합니다.";
  status("verdict", `${headline} (수업용 모형의 누적 추정확률 ${pct}%)\n${rounds.length}판의 증거를 합쳤습니다. 이 값은 실제 신원 확률이나 검증된 진단 정확도가 아닙니다.`, pct >= 55 ? "ok" : "warning");
  $("#detector-rules").classList.remove("hidden");
  $("#retry").classList.toggle("hidden", rounds.length >= MAX_ROUNDS);
  $("#retry").textContent = rounds.length < 3 ? "다음 판 추가" : "한 판 더 추가";
  setLocked(true);
  markComplete("random");
});

$("#retry").addEventListener("click", () => {
  human = [];
  coin = [];
  $("[data-seed]").value = String((Number($("[data-seed]").value) || 10) + 1);
  $("#analysis").innerHTML = "";
  $("#verdict").className = "status hidden";
  $("#verdict").textContent = "";
  $("#retry").classList.add("hidden");
  setLocked(false);
  render();
  updateRoundPrompt();
  $('[data-add="H"]').focus();
});

$("#reset-series").addEventListener("click", () => {
  rounds = [];
  human = [];
  coin = [];
  $("[data-seed]").value = "10";
  $("#analysis").innerHTML = "";
  $("#verdict").className = "status hidden";
  $("#verdict").textContent = "";
  $("#detector-rules").classList.add("hidden");
  $("#retry").classList.add("hidden");
  saveState({ coinRounds: [], coinHuman: [], coinMachine: [] });
  setLocked(false);
  render();
  renderSeries();
  updateRoundPrompt();
  $('[data-add="H"]').focus();
});

$("#predict").value = state.coinPredict || "";
$("#learned").value = state.coinLearned || "";
$("#save").addEventListener("click", () => { saveState({ coinPredict: $("#predict").value, coinLearned: $("#learned").value }); $("#save-status").textContent = "저장했습니다."; });
if (rounds.length) $("[data-seed]").value = String((Number(rounds.at(-1).seed) || 9) + 1);
render();
renderSeries();
updateRoundPrompt();
if (rounds.length) $("#detector-rules").classList.remove("hidden");
if (rounds.length >= MAX_ROUNDS) setLocked(true);

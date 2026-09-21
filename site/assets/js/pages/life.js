import { initChrome, $, bindRange } from "../ui.js";
import { loadState, saveState, markComplete } from "../state.js";
import { seedRandom } from "../rng.js";
import { step, liveCount, PATTERNS, patternGrid, cloneGrid, difference } from "../life.js";

initChrome();
const SIZE = 30;
const state = loadState();
let a = patternGrid("glider", SIZE);
let b = cloneGrid(a);
let flipped = null;
let gen = 0;
let timer = null;
const history = [];

$("#pattern").innerHTML = Object.entries(PATTERNS).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join("");
bindRange($("#speed"), $("#speed-out"), (v) => `${v} 세대/초`); bindRange($("#seed"), $("#seed-out"));

function draw(canvas, grid, highlight) {
  const ctx = canvas.getContext("2d");
  const cell = canvas.width / SIZE;
  ctx.fillStyle = "#171c2e"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(154,165,196,.15)";
  for (let i = 0; i <= SIZE; i += 1) { ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, canvas.height); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(canvas.width, i * cell); ctx.stroke(); }
  for (let r = 0; r < SIZE; r += 1) for (let c = 0; c < SIZE; c += 1) if (grid[r][c]) { ctx.fillStyle = "#54e5ca"; ctx.fillRect(c * cell + 1, r * cell + 1, cell - 2, cell - 2); }
  if (highlight) { ctx.strokeStyle = "#ffb454"; ctx.lineWidth = 2; ctx.strokeRect(highlight[1] * cell + 1, highlight[0] * cell + 1, cell - 2, cell - 2); ctx.lineWidth = 1; }
}
function render() {
  draw($("#board-a"), a, flipped); draw($("#board-b"), b, flipped);
  $("[data-gen]").textContent = gen; $("[data-live-a]").textContent = liveCount(a); $("[data-live-b]").textContent = liveCount(b); $("[data-diff]").textContent = difference(a, b);
  $("#log").innerHTML = `<tr><th class="num">세대</th><th class="num">원본 셀</th><th class="num">쌍둥이 셀</th><th class="num">다른 셀</th></tr>${history.slice(-8).map((h) => `<tr><td class="num">${h.gen}</td><td class="num">${h.a}</td><td class="num">${h.b}</td><td class="num">${h.d}</td></tr>`).join("")}`;
}
function pickFlip() {
  const rng = seedRandom(Number($("#seed").value) * 7 + gen);
  // flip a cell adjacent to a live cell when possible, so the change is meaningful
  const live = [];
  for (let r = 0; r < SIZE; r += 1) for (let c = 0; c < SIZE; c += 1) if (a[r][c]) live.push([r, c]);
  let target;
  if (live.length) { const [r, c] = live[Math.floor(rng() * live.length)]; target = [Math.min(SIZE - 1, Math.max(0, r + (rng() < 0.5 ? -1 : 1))), Math.min(SIZE - 1, Math.max(0, c + (rng() < 0.5 ? -1 : 1)))]; }
  else target = [Math.floor(rng() * SIZE), Math.floor(rng() * SIZE)];
  b = cloneGrid(a); b[target[0]][target[1]] = 1 - b[target[0]][target[1]]; flipped = target;
}
function reset() {
  stop();
  a = patternGrid($("#pattern").value, SIZE, Number($("#seed").value)); gen = 0; history.length = 0;
  pickFlip(); history.push({ gen, a: liveCount(a), b: liveCount(b), d: difference(a, b) }); render();
}
function advance() {
  const boundary = $("#boundary").value;
  a = step(a, boundary); b = step(b, boundary); gen += 1;
  if (gen % 4 === 0 || gen < 8) history.push({ gen, a: liveCount(a), b: liveCount(b), d: difference(a, b) });
  render(); markComplete("life");
}
function stop() { clearInterval(timer); timer = null; $("#play").textContent = "재생"; }
$("#step").addEventListener("click", advance);
$("#play").addEventListener("click", () => { if (timer) return stop(); $("#play").textContent = "일시정지"; timer = setInterval(advance, 1000 / Number($("#speed").value)); });
$("#speed").addEventListener("input", () => { if (timer) { clearInterval(timer); timer = setInterval(advance, 1000 / Number($("#speed").value)); } });
$("#reset").addEventListener("click", reset);
$("#pattern").addEventListener("change", reset);
$("#flip").addEventListener("click", () => { if (timer) stop(); b = cloneGrid(a); pickFlip(); render(); });
$("#board-a").addEventListener("click", (e) => {
  if (timer) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const c = Math.floor(((e.clientX - rect.left) / rect.width) * SIZE); const r = Math.floor(((e.clientY - rect.top) / rect.height) * SIZE);
  a[r][c] = 1 - a[r][c]; b[r][c] = a[r][c]; if (flipped) b[flipped[0]][flipped[1]] = 1 - a[flipped[0]][flipped[1]]; render();
});
$("#life-notes").value = state.lifeNotes || "";
$("#save").addEventListener("click", () => { saveState({ lifeNotes: $("#life-notes").value }); $("#save-status").textContent = "저장했습니다."; markComplete("life"); });
reset();

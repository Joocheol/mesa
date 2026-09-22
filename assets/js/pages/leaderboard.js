import { initChrome, $, escapeHtml } from "../ui.js";
import { team, saveState } from "../state.js";
import { leaderboard, poll } from "../classroom.js";
import { ROUNDS } from "../pages.js";
import { scatter, COLORS } from "../chart.js";
import { brier, mean, fmt, pct } from "../stats.js";

initChrome();
$("#class-code").value = team().classCode;
$("#class-code").addEventListener("change", () => { saveState({ classCode: $("#class-code").value.trim().toUpperCase() }); refresh(); });

function compute(lb) {
  const teams = new Map();
  const get = (name) => { if (!teams.has(name)) teams.set(name, { name, rounds: {}, gen: {} }); return teams.get(name); };
  for (const v of lb.votes) {
    const a = lb.activities[v.activity_id];
    if (!a?.revealed) continue;
    const correct = v.choice === a.correctChoice;
    get(v.team_name).rounds[v.activity_id] = { correct, choice: v.choice, confidence: v.confidence, score: brier(v.confidence, correct) };
  }
  for (const s of lb.scores) if (s.activity_id === "repair") get(s.team_name).gen[s.activity_id] = { value: Number(s.value), detail: s.detail };
  const rows = [...teams.values()].map((t) => {
    const detect = Object.values(t.rounds).reduce((a, r) => a + r.score, 0);
    return { ...t, detect };
  }).sort((a, b) => b.detect - a.detect);
  return rows;
}

async function refresh() {
  let lb;
  try { lb = await leaderboard($("#class-code").value.trim().toUpperCase()); }
  catch (error) { $("#lb-state").textContent = `서버 없음: ${error.message}`; return; }
  $("#lb-state").textContent = `갱신 ${new Date().toLocaleTimeString("ko-KR")}`;
  $("#round-states").innerHTML = Object.entries(ROUNDS).map(([id, r]) => { const a = lb.activities[id]; return `<div class="card soft"><p class="eyebrow">${r.label}</p><p class="small">${r.weapon}</p><p><strong>${lb.submissionCounts?.[id] || 0}팀 제출</strong> · ${a.open ? "접수 중" : "마감"} · ${a.revealed ? `공개됨 (정답 ${a.correctChoice})` : "비공개"}</p></div>`; }).join("");
  const rows = compute(lb);
  const me = team().teamName;
  $("#board").innerHTML = `<tr><th>#</th><th>팀</th>${Object.keys(ROUNDS).map((id) => `<th class="num">${id.replace("round", "R")}</th>`).join("")}<th class="num">Brier 보상 합계</th><th class="num">수리 진단</th></tr>${rows.length ? rows.map((t, i) => `<tr${t.name === me ? ' class="better"' : ""}><td>${i + 1}</td><td>${escapeHtml(t.name)}</td>${Object.keys(ROUNDS).map((id) => { const r = t.rounds[id]; return `<td class="num">${r ? `${fmt(r.score, 2)} <span class="muted small">${r.choice || ""}${r.correct ? "○" : "×"} ${r.confidence}%</span>` : "—"}</td>`; }).join("")}<td class="num"><strong>${fmt(t.detect, 2)}</strong></td><td class="num">${t.gen.repair ? `${t.gen.repair.value}/5 범위 안` : "—"}</td></tr>`).join("") : `<tr><td colspan="7" class="muted">아직 공개된 라운드나 제출된 진단이 없습니다.</td></tr>`}`;
  // calibration across revealed rounds
  const votes = lb.votes.filter((v) => lb.activities[v.activity_id]?.revealed).map((v) => ({ conf: v.confidence, correct: v.choice === lb.activities[v.activity_id].correctChoice ? 1 : 0, id: v.activity_id }));
  const bins = [[34, 50], [50, 65], [65, 80], [80, 90], [90, 101]];
  const points = bins.map(([lo, hi]) => votes.filter((v) => v.conf >= lo && v.conf < hi)).filter((b) => b.length).map((b) => ({ x: mean(b.map((v) => v.conf)) / 100, y: mean(b.map((v) => v.correct)), r: 4 + Math.min(12, b.length), color: COLORS[1] }));
  scatter($("#calibration"), points, { xRange: [0.3, 1], yRange: [0, 1], diagonal: true, xLabel: "선택 확률", yLabel: "학급 정답률" });
  $("#rounds-table").innerHTML = `<tr><th>라운드</th><th class="num">팀 수</th><th class="num">정답률</th><th class="num">평균 확신도</th><th class="num">간격</th></tr>${Object.keys(ROUNDS).map((id) => { const b = votes.filter((v) => v.id === id); if (!b.length) return `<tr><td>${id.replace("round", "R")}</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td></tr>`; const acc = mean(b.map((v) => v.correct)); const c = mean(b.map((v) => v.conf)) / 100; return `<tr><td>${id.replace("round", "R")}</td><td class="num">${b.length}</td><td class="num">${pct(acc, 0)}</td><td class="num">${pct(c, 0)}</td><td class="num">${pct(c - acc, 0)}</td></tr>`; }).join("")}`;
}
poll(refresh, 3000);

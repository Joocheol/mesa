import { initChrome, $, $$, status, escapeHtml, bindRange } from "../ui.js";
import { loadState, saveState, markComplete } from "../state.js";
import { loadMarket } from "../data.js";
import { submitScore } from "../classroom.js";
import { lineChart, COLORS } from "../chart.js";
import { diagnostics, fmt, pct } from "../stats.js";
import { CONDITIONS, ACTIONS, TEMPLATES, runMarket, abmChecks } from "../abm.js";
import { ROLE_CARDS } from "../auction.js";

initChrome();
const data = await loadMarket();
const state = loadState();
const DEFAULT_COUNTS = { value: 15, trend: 10, loss: 8, cash: 5, noise: 6, custom: 8 };
let config = state.abmConfig || { types: Object.entries(TEMPLATES).map(([type, t]) => ({ type, count: DEFAULT_COUNTS[type], params: { ...t.params }, clauses: t.clauses.map((c) => ({ ...c, when: [...c.when] })) })) };
let lastResult = null;

// team rules from 3a
const rules = state.teamRules || {};
const roles = state.teamRoles || {};
$("#team-rules").innerHTML = Object.keys(rules).length ? Object.entries(rules).map(([id, text]) => `<p><strong>${escapeHtml(roles[id]?.name || id)}</strong> <span class="muted">(${escapeHtml(ROLE_CARDS.find((r) => r.id === roles[id]?.role)?.name || roles[id]?.role || "")})</span>: ${escapeHtml(text) || "<em>(미작성)</em>"}</p>`).join("") : `<p class="muted">3a에서 저장한 규칙이 없습니다. 아래 "우리 팀 규칙" 카드에서 직접 조립하세요.</p>`;

const PARAM_LABELS = { m: "기준가 괴리 m", k: "추세 창 k(라운드)", L: "손절 손실률 L", q: "확률 q" };
const PARAM_RANGE = { m: [0, 0.2, 0.01], k: [1, 10, 1], L: [0.01, 0.3, 0.01], q: [0, 1, 0.05] };

function clauseHtml(t, ci, clause) {
  const conds = (i) => `<select data-cond="${t.type}:${ci}:${i}">${["", ...Object.keys(CONDITIONS)].map((k) => `<option value="${k}"${(clause.when[i] || "") === k ? " selected" : ""}>${k ? CONDITIONS[k].label : "(조건 없음)"}</option>`).join("")}</select>`;
  return `<div class="rule"><span class="kw">IF</span>${conds(0)}<span class="kw">AND</span>${conds(1)}<span class="kw">THEN</span><span class="then"><select data-then="${t.type}:${ci}">${Object.entries(ACTIONS).map(([k, v]) => `<option value="${k}"${clause.then === k ? " selected" : ""}>${v}</option>`).join("")}</select> <label class="small" style="display:inline">직전가 ± <input type="number" data-offset="${t.type}:${ci}" value="${clause.offset}" step="0.1" min="0" max="10" style="width:64px;display:inline-block">%</label></span></div>`;
}

function renderCards() {
  $("#agent-cards").innerHTML = config.types.map((t) => {
    const tpl = TEMPLATES[t.type];
    const params = Object.keys(tpl.params);
    return `<div class="card agent-card" style="--c:${tpl.color}"><div class="section-head"><h3>${tpl.name}</h3><label class="pill" style="margin:0">인원 <input type="number" data-count="${t.type}" value="${t.count}" min="0" max="60" style="width:64px;display:inline-block;margin-left:.3rem"></label></div>
      ${t.clauses.map((c, ci) => clauseHtml(t, ci, c)).join("")}
      <div class="actions"><button class="button small" data-add-clause="${t.type}" type="button">+ 절 추가</button>${t.clauses.length > 1 ? `<button class="button small" data-del-clause="${t.type}" type="button">− 마지막 절 삭제</button>` : ""}<button class="button small" data-reset-type="${t.type}" type="button">템플릿으로</button></div>
      <div class="controls">${params.map((p) => `<div class="field"><label>${PARAM_LABELS[p]} <span class="value" data-pout="${t.type}:${p}">${t.params[p]}</span></label><input type="range" data-param="${t.type}:${p}" min="${PARAM_RANGE[p][0]}" max="${PARAM_RANGE[p][1]}" step="${PARAM_RANGE[p][2]}" value="${t.params[p]}"></div>`).join("")}</div>
      <p class="small muted">기준가는 에이전트마다 ±2% 흩어져 있고 뉴스에 따라 ±1% 움직입니다. 각 에이전트는 주식 10주·같은 값의 현금으로 시작(시작가 1,000)하고, 매 라운드 70% 확률로 시장을 봅니다.</p></div>`;
  }).join("");
  $$("[data-count]").forEach((i) => i.addEventListener("change", () => { config.types.find((t) => t.type === i.dataset.count).count = Math.max(0, Number(i.value) || 0); persist(); }));
  $$("[data-cond]").forEach((s) => s.addEventListener("change", () => { const [type, ci, i] = s.dataset.cond.split(":"); const c = config.types.find((t) => t.type === type).clauses[Number(ci)]; const when = [c.when[0] || "", c.when[1] || ""]; when[Number(i)] = s.value; c.when = when.filter(Boolean); if (!c.when.length) c.when = ["always"]; persist(); renderCards(); }));
  $$("[data-then]").forEach((s) => s.addEventListener("change", () => { const [type, ci] = s.dataset.then.split(":"); config.types.find((t) => t.type === type).clauses[Number(ci)].then = s.value; persist(); }));
  $$("[data-offset]").forEach((s) => s.addEventListener("change", () => { const [type, ci] = s.dataset.offset.split(":"); config.types.find((t) => t.type === type).clauses[Number(ci)].offset = Number(s.value); persist(); }));
  $$("[data-param]").forEach((s) => s.addEventListener("input", () => { const [type, p] = s.dataset.param.split(":"); config.types.find((t) => t.type === type).params[p] = Number(s.value); $(`[data-pout="${s.dataset.param}"]`).textContent = s.value; persist(); }));
  $$("[data-add-clause]").forEach((b) => b.addEventListener("click", () => { config.types.find((t) => t.type === b.dataset.addClause).clauses.push({ when: ["always"], then: "hold", offset: 0.5 }); persist(); renderCards(); }));
  $$("[data-del-clause]").forEach((b) => b.addEventListener("click", () => { config.types.find((t) => t.type === b.dataset.delClause).clauses.pop(); persist(); renderCards(); }));
  $$("[data-reset-type]").forEach((b) => b.addEventListener("click", () => { const t = config.types.find((x) => x.type === b.dataset.resetType); const tpl = TEMPLATES[t.type]; t.params = { ...tpl.params }; t.clauses = tpl.clauses.map((c) => ({ ...c, when: [...c.when] })); persist(); renderCards(); }));
}
function persist() { saveState({ abmConfig: config }); }

bindRange($("#rounds"), $("#rounds-out")); bindRange($("#newsProb"), $("#news-out")); bindRange($("#seed"), $("#seed-out"));

function run(cfgOverride) {
  const cfg = cfgOverride || { ...config, rounds: Number($("#rounds").value), seed: Number($("#seed").value), newsProb: Number($("#newsProb").value) };
  try { return runMarket(cfg); } catch (error) { status("run-status", error.message, "error"); return null; }
}
function render(result) {
  lastResult = result;
  lineChart($("#price"), [{ values: result.prices, color: COLORS[0], width: 1.6 }], { log: true, xLabel: "라운드", yLabel: "가격" });
  lineChart($("#returns"), [{ values: result.returns, color: COLORS[1], width: 1 }], { yLabel: "로그수익률" });
  const checks = abmChecks(result);
  const passCount = checks.filter((c) => c.pass).length;
  $("#checks").innerHTML = `<tr><th>검사</th><th class="num">값</th><th>통과</th></tr>${checks.map((c) => `<tr class="${c.pass ? "better" : "worse"}"><td>${c.label}</td><td class="num">${c.value}</td><td>${c.pass ? "예" : "아니오"}</td></tr>`).join("")}`;
  const real = diagnostics(data.trainReturns);
  const d = result.diagnostics;
  $("#compare").innerHTML = `<tr><th>모양 지표</th><th class="num">에이전트 시장</th><th class="num">실제 (추정 구간)</th></tr><tr><td>초과첨도</td><td class="num">${d ? fmt(d.kurtosis, 2) : "—"}</td><td class="num">${fmt(real.kurtosis, 2)}</td></tr><tr><td>±3σ 초과 빈도</td><td class="num">${d ? pct(d.exceed3, 2) : "—"}</td><td class="num">${pct(real.exceed3, 2)}</td></tr><tr><td>제곱수익률 ACF(1)</td><td class="num">${d ? fmt(d.acf1, 3) : "—"}</td><td class="num">${fmt(real.acf1, 3)}</td></tr><tr><td>제곱수익률 ACF(5)</td><td class="num">${d ? fmt(d.acf5, 3) : "—"}</td><td class="num">${fmt(real.acf5, 3)}</td></tr><tr><td>라운드당 변동성</td><td class="num">${d ? pct(d.annVol / Math.sqrt(252), 2) : "—"}</td><td class="num">${pct(real.annVol / Math.sqrt(252), 2)} <span class="muted small">/일</span></td></tr>`;
  $("#types-table").innerHTML = `<tr><th>유형</th><th class="num">인원</th><th class="num">매수</th><th class="num">매도</th><th class="num">관망</th><th class="num">평균 수익률</th></tr>${config.types.map((t) => { const a = result.actionsByType[t.type] || { buy: 0, sell: 0, hold: 0 }; return `<tr><td><span style="color:${TEMPLATES[t.type].color}">●</span> ${TEMPLATES[t.type].name}</td><td class="num">${t.count}</td><td class="num">${a.buy}</td><td class="num">${a.sell}</td><td class="num">${a.hold}</td><td class="num">${pct(result.wealthByType[t.type] || 0, 1)}</td></tr>`; }).join("")}`;
  $("#pass-count").textContent = passCount;
  status("run-status", `${result.prices.length - 1}라운드 실행 · 마지막 가격 ${result.prices[result.prices.length - 1]} · 통과 ${passCount}/5`, "ok");
  saveState({ abmRun: { passCount, at: new Date().toISOString() } });
  markComplete("abm");
  return passCount;
}
$("#run").addEventListener("click", () => { const r = run(); if (r) render(r); });

$("#sweep").addEventListener("click", () => {
  const rows = [0, 5, 15, 30].map((n) => {
    const cfg = { ...config, types: config.types.map((t) => (t.type === "trend" ? { ...t, count: n } : t)), rounds: Number($("#rounds").value), seed: Number($("#seed").value), newsProb: Number($("#newsProb").value) };
    const r = runMarket(cfg);
    const d = r.diagnostics;
    const ratio = Math.max(...r.prices) / Math.min(...r.prices);
    return `<tr><td class="num">${n}</td><td class="num">${d ? fmt(d.kurtosis, 2) : "—"}</td><td class="num">${d ? pct(d.exceed3, 2) : "—"}</td><td class="num">${d ? fmt(d.acf1, 3) : "—"}</td><td class="num">${fmt(ratio, 1)}배</td><td class="num">${r.prices[r.prices.length - 1]}</td></tr>`;
  });
  $("#sweep-table").innerHTML = `<tr><th class="num">추세추종 인원</th><th class="num">초과첨도</th><th class="num">±3σ 초과</th><th class="num">ACF(1)</th><th class="num">최고/최저</th><th class="num">마지막 가격</th></tr>${rows.join("")}`;
  markComplete("abm");
});

$("#abm-notes").value = state.abmNotes || "";
$("#submit").addEventListener("click", async () => {
  if (!lastResult) return status("submit-status", "먼저 시장을 실행하세요.", "error");
  const passCount = abmChecks(lastResult).filter((c) => c.pass).length;
  saveState({ abmNotes: $("#abm-notes").value, abmConfig: config, abmScore: passCount });
  const detail = `ABM ${config.types.map((t) => `${TEMPLATES[t.type].name} ${t.count}`).join(", ")} · 통과 ${passCount}/5`;
  try { await submitScore("abm", passCount, detail); status("submit-status", `제출했습니다: ${detail}`, "ok"); }
  catch (error) { status("submit-status", `서버 제출 실패 (${error.message}). 구성은 이 브라우저에 저장했습니다.`, "warning"); }
});

renderCards();
const first = run(); if (first) render(first);

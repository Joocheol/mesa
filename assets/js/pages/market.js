import { initChrome, $, $$, status, escapeHtml, download } from "../ui.js";
import { loadState, saveState, markComplete } from "../state.js";
import { clearAuction, validateOrder, settle, ROLE_CARDS, NEWS } from "../auction.js";
import { lineChart, COLORS } from "../chart.js";

initChrome();

function defaultMarket() {
  return { round: 1, lastPrice: 100, teams: ROLE_CARDS.map((r, i) => ({ id: `T${i + 1}`, name: `${i + 1}팀`, role: r.id, cash: 1000, stock: 10, avgCost: 100 })), history: [], seq: 0 };
}
let market = loadState().market || defaultMarket();
const roleName = (id) => ROLE_CARDS.find((r) => r.id === id)?.name || id;
const news = () => NEWS[(market.round - 1) % NEWS.length];

function renderOrders() {
  $("[data-round]").textContent = market.round;
  $("[data-price]").textContent = market.lastPrice;
  $("[data-news]").innerHTML = `<p class="eyebrow">공통 뉴스</p>${escapeHtml(news().text)}`;
  $("#orders").innerHTML = `<tr><th>팀</th><th>역할</th><th>잔고</th><th>주문</th><th>지정가</th><th>이유 (선택)</th></tr>${market.teams.map((t) => `<tr data-team="${t.id}"><td><input type="text" value="${escapeHtml(t.name)}" data-name style="width:90px"></td><td><select data-role>${ROLE_CARDS.map((r) => `<option value="${r.id}"${r.id === t.role ? " selected" : ""}>${r.name}</option>`).join("")}${t.role === "llm" ? `<option value="llm" selected>LLM 팀</option>` : ""}</select></td><td class="small mono">현금 ${t.cash} · ${t.stock}주</td><td><select data-side><option value="hold">관망</option><option value="buy">매수 1주</option><option value="sell">매도 1주</option></select></td><td><input type="number" data-limit value="${market.lastPrice}" min="1" step="1" style="width:90px"></td><td><input type="text" data-reason placeholder="한 문장"></td></tr>`).join("")}`;
  $$("[data-team]").forEach((row) => {
    const t = market.teams.find((x) => x.id === row.dataset.team);
    $("[data-name]", row).addEventListener("change", (e) => { t.name = e.target.value.trim() || t.name; persist(); });
    $("[data-role]", row).addEventListener("change", (e) => { t.role = e.target.value; persist(); });
  });
  const proposal = loadState().llmProposals;
  if (proposal) for (const [teamId, p] of Object.entries(proposal)) { const row = $(`[data-team="${teamId}"]`); if (row && p.round === market.round) { $("[data-side]", row).value = p.action; if (p.limit_price) $("[data-limit]", row).value = p.limit_price; $("[data-reason]", row).value = `LLM: ${p.reason}`; } }
}

function collectOrders() {
  const orders = [];
  for (const row of $$("[data-team]")) {
    const t = market.teams.find((x) => x.id === row.dataset.team);
    const side = $("[data-side]", row).value;
    const price = Number($("[data-limit]", row).value);
    const reason = $("[data-reason]", row).value.trim();
    const order = { id: t.id, side, price, reason };
    const err = validateOrder(order, t, 1);
    if (err) throw new Error(`${t.name}: ${err}`);
    if (side !== "hold") { market.seq += 1; order.seq = market.seq; }
    orders.push(order);
  }
  return orders;
}

function renderPreview(result) {
  $("#preview-table").innerHTML = `<table><tr><th class="num">후보가격</th><th class="num">D(p) 매수</th><th class="num">S(p) 매도</th><th class="num">체결량</th></tr>${result.table.map((r) => `<tr${r.price === result.price && !result.noTrade ? ' class="better"' : ""}><td class="num">${r.price}</td><td class="num">${r.demand}</td><td class="num">${r.supply}</td><td class="num">${r.volume}</td></tr>`).join("")}</table><p class="small muted">${result.noTrade ? `무거래 · 가격 ${result.price} 유지` : `${result.price}에 ${result.volume}주 체결 예정`}</p>`;
}

function renderHistory() {
  const prices = [100, ...market.history.map((h) => h.price)];
  lineChart($("#price-chart"), [{ values: prices, color: COLORS[0], width: 2 }], { xLabel: "라운드", yLabel: "가격" });
  $("#history").innerHTML = `<tr><th>R</th><th>뉴스</th><th class="num">가격</th><th class="num">체결</th><th>주문</th></tr>${market.history.length ? market.history.map((h) => `<tr><td>${h.round}</td><td class="small">${escapeHtml(h.news.slice(0, 24))}…</td><td class="num">${h.price}${h.noTrade ? " <span class='muted small'>(무거래)</span>" : ""}</td><td class="num">${h.volume}</td><td class="small">${h.orders.filter((o) => o.side !== "hold").map((o) => `${escapeHtml(o.name)} ${o.side === "buy" ? "매수" : "매도"}@${o.price}`).join(", ") || "전원 관망"}</td></tr>`).join("") : `<tr><td colspan="5" class="muted">아직 확정된 라운드가 없습니다.</td></tr>`}`;
}

function renderRules() {
  const rules = loadState().teamRules || {};
  $("#rules").innerHTML = market.teams.map((t) => `<div class="field"><label>${escapeHtml(t.name)} · ${roleName(t.role)}</label><textarea data-rule="${t.id}" placeholder="만약 ___ 이면 ___ 에 매수/매도, 아니면 관망">${escapeHtml(rules[t.id] || "")}</textarea></div>`).join("");
}

function persist() { saveState({ market }); }

$("#preview").addEventListener("click", () => {
  try { renderPreview(clearAuction(collectOrders().filter((o) => o.side !== "hold"), market.lastPrice)); market.seq -= 0; }
  catch (error) { status("market-status", error.message, "error"); }
});
$("#clear").addEventListener("click", () => {
  let orders;
  try { orders = collectOrders(); } catch (error) { return status("market-status", error.message, "error"); }
  const active = orders.filter((o) => o.side !== "hold");
  const result = clearAuction(active, market.lastPrice);
  const participants = new Map(market.teams.map((t) => [t.id, t]));
  try { settle(participants, result.fills); } catch (error) { return status("market-status", error.message, "error"); }
  market.history.push({ round: market.round, news: news().text, price: result.price, volume: result.volume, noTrade: result.noTrade, orders: orders.map((o) => ({ ...o, name: market.teams.find((t) => t.id === o.id).name })), fills: result.fills, balances: market.teams.map((t) => ({ id: t.id, cash: t.cash, stock: t.stock })) });
  market.lastPrice = result.price;
  market.round += 1;
  persist();
  status("market-status", result.noTrade ? `무거래 — 가격 ${result.price} 유지. 잔여 주문 만료.` : `${result.price}에 ${result.volume}주 체결: ${result.fills.map((f) => `${participants.get(f.buyer).name}←${participants.get(f.seller).name}`).join(", ")}. 잔여 주문 만료.`, "ok");
  renderOrders(); renderHistory(); renderPreview(result);
  markComplete("market");
});
$("#add-team").addEventListener("click", () => {
  const i = market.teams.length;
  if (i >= 8) return status("market-status", "팀은 최대 8개입니다.", "warning");
  market.teams.push({ id: `T${i + 1}`, name: `${i + 1}팀`, role: ROLE_CARDS[i % ROLE_CARDS.length].id, cash: 1000, stock: 10, avgCost: 100 });
  persist(); renderOrders(); renderRules();
});
$("#reset").addEventListener("click", () => { if (!confirm("시장 기록을 모두 지우고 1라운드로 돌아갑니다.")) return; market = defaultMarket(); persist(); renderOrders(); renderHistory(); renderRules(); $("#preview-table").innerHTML = ""; });
$("#export").addEventListener("click", () => download("classroom-market.json", JSON.stringify(market, null, 2), "application/json"));
$("#save-rules").addEventListener("click", () => { saveState({ teamRules: Object.fromEntries($$("[data-rule]").map((t) => [t.dataset.rule, t.value.trim()])), teamRoles: Object.fromEntries(market.teams.map((t) => [t.id, { name: t.name, role: t.role }])) }); $("#rules-status").textContent = "저장했습니다 — 3c에서 불러옵니다."; markComplete("market"); });

renderOrders(); renderHistory(); renderRules();

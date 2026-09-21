import { initChrome, $, status, escapeHtml } from "../ui.js";
import { loadState, saveState, markComplete } from "../state.js";
import { ROLE_CARDS, NEWS } from "../auction.js";
import { fmt, pct } from "../stats.js";

initChrome();
const state = loadState();
const bank = await fetch("assets/data/llm-responses.json").then((r) => r.json());

const RESEARCH = [
  { title: "FCLAgent (2025)", url: "https://arxiv.org/abs/2510.12189", observed: "LLM은 매수/매도 방향만 판단하고 가격·수량은 규칙이 정하는 하이브리드 구조. 경로 의존 패턴과 시장 경로에 따라 달라지는 손실회피 기준점을 시뮬레이션에서 관찰했다고 보고.", interpretation: "자연어 판단을 넣는다고 시장이 현실적이 되는 것은 아니다. 판단부와 주문·체결 규칙을 분리하고 어떤 패턴을 어느 조건에서 재현했는지 한정해야 한다." },
  { title: "실험시장 인간 vs LLM (2025)", url: "https://arxiv.org/abs/2505.07457", observed: "LLM 참가자의 결정이 가격을 바꾸고 다시 결정에 영향을 주는 피드백 실험. 넓은 경향(양/음의 피드백 시장)은 재현했지만 인간보다 행동 이질성이 작았다고 보고.", interpretation: "평균 패턴이 비슷해도 참여자 간 다양성과 미시 경로는 다를 수 있다. 오늘 화면은 이 연구 질문을 소개하며, 강사 작성 예시 자체는 재현 실험이 아니다." },
  { title: "더 좋은 모형, 더 위험한 시스템 (2026)", url: "https://arxiv.org/abs/2609.04373", observed: "능력이 높은 LLM들 사이의 행동 상관이 커질 수 있다. 공유 추론이 맞을 때는 참여 증가가 위험을 줄이지만, 공통 오정보 환경에서는 같은 상관이 위험이 된다고 보고.", interpretation: "개별 성능과 시스템 수준의 다양성·안정성을 분리해 평가해야 한다. 공통 프롬프트·공통 학습 배경이 만드는 동조를 스트레스 시나리오로 점검한다." },
];
$("#research").innerHTML = RESEARCH.map((r) => `<div class="card soft"><h3><a href="${r.url}" target="_blank" rel="noreferrer">${r.title} ↗</a></h3><p class="small"><strong>관찰</strong> ${r.observed}</p><p class="small muted"><strong>해석</strong> ${r.interpretation}</p></div>`).join("");

$("#role").innerHTML = ROLE_CARDS.map((r) => `<option value="${r.id}">${r.name}</option>`).join("");
$("#news").innerHTML = NEWS.map((n, i) => `<option value="${i}">${n.text.slice(0, 40)}…</option>`).join("");

function buildPrompt() {
  const role = ROLE_CARDS.find((r) => r.id === $("#role").value);
  const news = NEWS[Number($("#news").value)];
  return bank.prompt_template.replace("{role}", role.name).replace("{role_desc}", role.desc).replace("{cash}", "1000").replace("{stock}", "10").replace("{news}", news.text).replace("{price}", $("#price").value);
}
function renderPrompt() { $("#prompt").value = buildPrompt(); renderConformity(); }

function agreementOf(actions) {
  const counts = {};
  for (const a of actions) counts[a] = (counts[a] || 0) + 1;
  const top = Math.max(0, ...Object.values(counts));
  return { top, share: actions.length ? top / actions.length : NaN, counts };
}
function renderConformity() {
  const role = $("#role").value; const ni = String(Number($("#news").value) % 6);
  const responses = bank.responses[role]?.[ni] || [];
  $("#llm-table").innerHTML = `<tr><th>에이전트</th><th>행동</th><th class="num">지정가</th><th>이유</th></tr>${responses.map((r, i) => `<tr><td>${bank.agents[i]}</td><td>${{ buy: "매수", sell: "매도", hold: "관망" }[r.action]}</td><td class="num">${r.limit_price ?? "—"}</td><td class="small">${escapeHtml(r.reason)}</td></tr>`).join("")}`;
  const llm = agreementOf(responses.map((r) => r.action));
  const prices = responses.map((r) => r.limit_price).filter(Number.isFinite);
  const spread = prices.length > 1 ? Math.max(...prices) - Math.min(...prices) : 0;
  // humans: orders from the classroom market (page 3a) in the round with the same news
  const market = loadState().market;
  const round = market?.history?.find((h) => h.news === NEWS[Number(ni)].text);
  const humanActions = round ? round.orders.map((o) => o.side) : [];
  const human = agreementOf(humanActions);
  $("#agreement").innerHTML = `<div class="stat"><span class="number">${pct(llm.share, 0)}</span><span class="label">강사 작성 예시 4개의 최다 행동 비율 (${Object.entries(llm.counts).map(([k, v]) => `${{ buy: "매수", sell: "매도", hold: "관망" }[k]} ${v}`).join(", ")})</span></div><div class="stat"><span class="number">${spread}</span><span class="label">예시 지정가 범위 (최고−최저)</span></div><div class="stat"><span class="number">${round ? pct(human.share, 0) : "—"}</span><span class="label">사람 ${humanActions.length || 0}팀의 최다 행동 비율 (참고용·조건 다름)</span></div>`;
  if (round) {
    $("#human-table").innerHTML = `<tr><th>팀</th><th>역할</th><th>행동</th><th class="num">지정가</th><th>이유</th></tr>${round.orders.map((o) => { const t = market.teams.find((x) => x.id === o.id); return `<tr><td>${escapeHtml(o.name)}</td><td>${ROLE_CARDS.find((r) => r.id === t?.role)?.name || ""}</td><td>${{ buy: "매수", sell: "매도", hold: "관망" }[o.side]}</td><td class="num">${o.side === "hold" ? "—" : o.price}</td><td class="small">${escapeHtml(o.reason || "")}</td></tr>`; }).join("")}`;
    $("#human-note").textContent = "사람 팀은 역할이 서로 다르고 오른쪽 사례는 강사 작성 예시이므로 두 비율을 비교해 LLM과 사람의 차이라고 결론낼 수 없습니다.";
  } else {
    $("#human-table").innerHTML = ""; $("#human-note").textContent = "3a에서 이 뉴스로 진행한 라운드 기록이 이 브라우저에 없습니다. 강사 화면에서 비교하세요.";
  }
}
["role", "news", "price"].forEach((id) => $(`#${id}`).addEventListener("input", renderPrompt));
renderPrompt();

$("#copy").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("#prompt").value); status("validate-status", "복사했습니다.", "ok"); } catch { status("validate-status", "클립보드 접근이 막혔습니다. 직접 선택해 복사하세요.", "warning"); } });

let validated = null;
$("#validate").addEventListener("click", () => {
  try {
    const raw = $("#response").value.trim().replace(/^```(json)?/i, "").replace(/```$/, "");
    const value = JSON.parse(raw);
    const allowed = new Set(["action", "limit_price", "reason"]);
    const extra = Object.keys(value).filter((k) => !allowed.has(k));
    if (extra.length) throw new Error(`허용하지 않은 필드: ${extra.join(", ")}`);
    if (!["buy", "sell", "hold"].includes(value.action)) throw new Error("action은 buy, sell, hold 중 하나여야 합니다.");
    if (value.action === "hold" ? value.limit_price != null : !Number.isInteger(value.limit_price) || value.limit_price <= 0) throw new Error(value.action === "hold" ? "hold의 limit_price는 null이어야 합니다." : "매수/매도 limit_price는 양의 정수여야 합니다.");
    if (typeof value.reason !== "string" || !value.reason.trim() || value.reason.length > 500) throw new Error("reason은 1~500자의 문자열이어야 합니다.");
    if (!$("#human-ok").checked) throw new Error("사람이 내용을 확인했다는 체크가 필요합니다.");
    validated = { ...value, reason: value.reason.trim() };
    $("#to-market").disabled = false;
    status("validate-status", "형식과 최소 제약을 통과했습니다. 외부 AI 텍스트는 코드로 실행되지 않으며, 사람이 확인한 뒤에만 주문이 됩니다.", "ok");
    markComplete("llm");
  } catch (error) { validated = null; $("#to-market").disabled = true; status("validate-status", error.message, "error"); }
});
$("#to-market").addEventListener("click", () => {
  if (!validated) return;
  const market = loadState().market;
  if (!market) return status("validate-status", "3a 시장이 아직 없습니다. 먼저 3a에서 시장을 만드세요.", "warning");
  let llmTeam = market.teams.find((t) => t.role === "llm");
  if (!llmTeam) { llmTeam = { id: `T${market.teams.length + 1}`, name: "LLM 팀", role: "llm", cash: 1000, stock: 10, avgCost: 100 }; market.teams.push(llmTeam); }
  saveState({ market, llmProposals: { ...(loadState().llmProposals || {}), [llmTeam.id]: { ...validated, round: market.round, at: new Date().toISOString() } } });
  status("validate-status", `${llmTeam.name}의 ${market.round}라운드 주문 칸에 채워 두었습니다. 3a 페이지에서 확인 후 체결하세요.`, "ok");
});

$("#llm-notes").value = state.llmNotes || "";
$("#save").addEventListener("click", () => { saveState({ llmNotes: $("#llm-notes").value }); $("#save-status").textContent = "저장했습니다."; markComplete("llm"); });

// Rule-based agent market. Agents are assembled from IF/THEN clauses (no code needed),
// trade one share per round through the same single-price auction as the human market.
import { seedRandom, normal } from "./rng.js";
import { clearAuction, settle } from "./auction.js";
import { logReturns, diagnostics, mean, sd } from "./stats.js";

// ---- Conditions available in the rule builder ----
export const CONDITIONS = {
  always: { label: "항상", test: () => true },
  news_good: { label: "뉴스가 좋음", test: (ctx) => ctx.news > 0 },
  news_bad: { label: "뉴스가 나쁨", test: (ctx) => ctx.news < 0 },
  below_ref: { label: "가격 < 내 기준가 × (1−m)", param: "m", test: (ctx, a, p) => ctx.price < a.ref * (1 - p.m) },
  above_ref: { label: "가격 > 내 기준가 × (1+m)", param: "m", test: (ctx, a, p) => ctx.price > a.ref * (1 + p.m) },
  trend_up: { label: "최근 k라운드 수익률 > 0", param: "k", test: (ctx, a, p) => ctx.momentum(a.k(p.k)) > 0 },
  trend_down: { label: "최근 k라운드 수익률 < 0", param: "k", test: (ctx, a, p) => ctx.momentum(a.k(p.k)) < 0 },
  in_loss: { label: "보유 평단 대비 L% 이상 손실", param: "L", test: (ctx, a, p) => a.stock > 0 && ctx.price < a.avgCost * (1 - p.L) },
  random: { label: "확률 q로", param: "q", test: (ctx, a, p) => ctx.rng() < p.q },
  has_cash: { label: "현금이 가격 이상", test: (ctx, a) => a.cash >= ctx.price },
  has_stock: { label: "주식 보유 중", test: (ctx, a) => a.stock > 0 },
};
export const ACTIONS = { buy: "매수", sell: "매도", hold: "관망" };

// Templates mirror the four role cards plus a noise trader. Each clause: {when:[cond ids], then, offset(%)}.
export const TEMPLATES = {
  value: { name: "가치 중시", color: "#54e5ca", params: { m: 0.03 }, clauses: [
    { when: ["below_ref"], then: "buy", offset: 0.5, anchor: "ref" },
    { when: ["above_ref"], then: "sell", offset: 0.5, anchor: "ref" },
  ] },
  trend: { name: "추세 추종", color: "#ffb454", params: { k: 3 }, clauses: [
    { when: ["trend_up"], then: "buy", offset: 2.0 },
    { when: ["trend_down"], then: "sell", offset: 2.0 },
  ] },
  loss: { name: "손실 민감", color: "#ff6b7a", params: { L: 0.05, m: 0.03 }, clauses: [
    { when: ["in_loss"], then: "sell", offset: 1.5 },
    { when: ["news_good", "below_ref"], then: "buy", offset: 0.2, anchor: "ref" },
  ] },
  cash: { name: "현금 확보 필요", color: "#c59cff", params: { q: 0.3 }, clauses: [
    { when: ["random", "has_stock"], then: "sell", offset: 0.8 },
  ] },
  noise: { name: "노이즈", color: "#9aa5c4", params: { q: 0.5 }, clauses: [
    { when: ["random"], then: "buy", offset: 0.7 },
    { when: ["always"], then: "sell", offset: 0.7 },
  ] },
  custom: { name: "우리 팀 규칙", color: "#6aa8ff", params: { m: 0.03, k: 3, L: 0.05, q: 0.3 }, clauses: [
    { when: ["news_good"], then: "buy", offset: 0.5 },
    { when: ["news_bad"], then: "sell", offset: 0.5 },
  ] },
};

function decide(agent, spec, ctx) {
  for (const clause of spec.clauses) {
    if (clause.when.every((c) => CONDITIONS[c].test(ctx, agent, spec.params))) return clause;
  }
  return null;
}

// config: { types: [{type, count, clauses, params}], rounds, seed, newsProb, startPrice }
export function runMarket(config) {
  const rng = seedRandom(config.seed || 1);
  const startPrice = config.startPrice || 1000;
  const inventory = config.inventory || 10; // shares (and price×shares in cash) per agent
  const activity = config.activity ?? 0.7; // probability an agent looks at the market this round
  const agents = [];
  const participants = new Map();
  let id = 0;
  for (const t of config.types) {
    for (let i = 0; i < t.count; i += 1) {
      id += 1;
      // Heterogeneity keeps agents from moving in lock-step: private reference value,
      // private trend window (0.5×–1.5× of k) and a per-round random limit offset.
      const kMul = 0.5 + rng();
      const a = { id: `a${id}`, type: t.type, cash: startPrice * inventory, stock: inventory, avgCost: startPrice, ref: startPrice * (1 + 0.02 * normal(rng)), k: (k) => Math.max(1, Math.round(k * kMul)) };
      agents.push(a); participants.set(a.id, a);
    }
  }
  const prices = [startPrice];
  const volumes = [];
  const newsLog = [];
  const actionsByType = {};
  let fundamental = startPrice;
  let price = startPrice;
  const momentum = (k) => (prices.length > k ? Math.log(prices[prices.length - 1] / prices[prices.length - 1 - k]) : 0);
  for (let r = 0; r < config.rounds; r += 1) {
    const u = rng();
    const news = u < config.newsProb / 2 ? 1 : u < config.newsProb ? -1 : 0;
    fundamental = Math.round(fundamental * (1 + 0.01 * news));
    for (const a of agents) if (news) a.ref = Math.round(a.ref * (1 + 0.01 * news)); // reference values move with news
    const ctx = { price, news, momentum, rng, fundamental };
    const orders = [];
    let seq = 0;
    for (const a of agents) {
      const spec = config.types.find((t) => t.type === a.type);
      const clause = rng() < activity ? decide(a, spec, ctx) : null;
      const action = clause?.then || "hold";
      actionsByType[a.type] = actionsByType[a.type] || { buy: 0, sell: 0, hold: 0 };
      if (!clause || action === "hold") { actionsByType[a.type].hold += 1; continue; }
      const offset = (clause.offset / 100) * (0.5 + rng()); // sloped demand/supply curve
      // "ref"-anchored orders sit at the agent's own valuation (a wall); "last"-anchored orders chase the price.
      const base = clause.anchor === "ref" ? a.ref : price;
      const limit = Math.max(1, Math.round(action === "buy" ? base * (1 + offset) : base * (1 - offset)));
      if (action === "buy" && a.cash < limit) { actionsByType[a.type].hold += 1; continue; }
      if (action === "sell" && a.stock < 1) { actionsByType[a.type].hold += 1; continue; }
      seq += 1;
      orders.push({ id: a.id, side: action, price: limit, seq });
      actionsByType[a.type][action] += 1;
    }
    const result = clearAuction(orders, price);
    settle(participants, result.fills);
    price = result.price;
    prices.push(price);
    volumes.push(result.volume);
    newsLog.push(news);
  }
  const returns = logReturns(prices);
  const wealthByType = {};
  for (const t of config.types) {
    const group = agents.filter((a) => a.type === t.type);
    wealthByType[t.type] = group.length ? mean(group.map((a) => a.cash + a.stock * price)) / (startPrice * inventory * 2) - 1 : 0;
  }
  return { prices, returns, volumes, newsLog, actionsByType, wealthByType, fundamental, diagnostics: returns.length > 10 ? diagnostics(returns) : null };
}

// Five sanity/stylized-fact checks for the generator score of the ABM stage.
export function abmChecks(result) {
  const p = result.prices;
  const d = result.diagnostics;
  const tradedShare = result.volumes.filter((v) => v > 0).length / result.volumes.length;
  const ratio = Math.max(...p) / Math.min(...p);
  return [
    { label: "가격이 붕괴·폭주하지 않음 (최고/최저 < 10배)", pass: ratio < 10, value: `${ratio.toFixed(1)}배` },
    { label: "거래가 있는 라운드 비율 > 30%", pass: tradedShare > 0.3, value: `${Math.round(tradedShare * 100)}%` },
    { label: "초과첨도 > 0.5 (두꺼운 꼬리)", pass: d ? d.kurtosis > 0.5 : false, value: d ? d.kurtosis.toFixed(2) : "—" },
    { label: "±3σ 초과 빈도 > 0.3%", pass: d ? d.exceed3 > 0.003 : false, value: d ? `${(d.exceed3 * 100).toFixed(2)}%` : "—" },
    { label: "제곱수익률 ACF(1) > 0.05 (변동성 군집)", pass: d ? d.acf1 > 0.05 : false, value: d ? d.acf1.toFixed(3) : "—" },
  ];
}

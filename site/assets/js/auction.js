// Educational single-price (call) auction. Pure functions; used by the human market
// (07) and by the agent market (08). Every order is for exactly one share.
//
// Clearing rule (also in docs/workshop/auction-rules.md):
// 1. candidate prices = submitted limit prices ∪ {last price}
// 2. D(p) = # buy orders with limit ≥ p, S(p) = # sell orders with limit ≤ p
// 3. pick max min(D,S) → min |D−S| → closest to last price → lower price
// 4. volume 0 → no trade, price unchanged
// 5. buys filled high-limit first, sells low-limit first, ties by sequence

export function clearAuction(orders, lastPrice) {
  const buys = orders.filter((o) => o.side === "buy");
  const sells = orders.filter((o) => o.side === "sell");
  const candidates = [...new Set([lastPrice, ...buys.map((o) => o.price), ...sells.map((o) => o.price)])].sort((a, b) => a - b);
  const table = candidates.map((p) => {
    const demand = buys.filter((o) => o.price >= p).length;
    const supply = sells.filter((o) => o.price <= p).length;
    return { price: p, demand, supply, volume: Math.min(demand, supply), imbalance: Math.abs(demand - supply) };
  });
  const ranked = [...table].sort((a, b) => b.volume - a.volume || a.imbalance - b.imbalance || Math.abs(a.price - lastPrice) - Math.abs(b.price - lastPrice) || a.price - b.price);
  const chosen = ranked[0];
  if (!chosen || chosen.volume === 0) return { price: lastPrice, volume: 0, demand: chosen?.demand ?? 0, supply: chosen?.supply ?? 0, fills: [], noTrade: true, table };
  const eligibleBuys = buys.filter((o) => o.price >= chosen.price).sort((a, b) => b.price - a.price || a.seq - b.seq).slice(0, chosen.volume);
  const eligibleSells = sells.filter((o) => o.price <= chosen.price).sort((a, b) => a.price - b.price || a.seq - b.seq).slice(0, chosen.volume);
  const fills = eligibleBuys.map((b, i) => ({ buyer: b.id, seller: eligibleSells[i].id, price: chosen.price }));
  return { price: chosen.price, volume: chosen.volume, demand: chosen.demand, supply: chosen.supply, fills, noTrade: false, table };
}

// Validate one participant's order against their balances. Returns an error string or null.
export function validateOrder(order, participant, tick = 1) {
  if (order.side === "hold") return null;
  if (!Number.isInteger(order.price) || order.price <= 0) return "지정가는 양의 정수여야 합니다.";
  if (order.price % tick) return `지정가는 호가단위 ${tick}의 배수여야 합니다.`;
  if (order.side === "buy" && participant.cash < order.price) return "지정가만큼의 현금이 없습니다.";
  if (order.side === "sell" && participant.stock < 1) return "매도할 주식이 없습니다.";
  return null;
}

// Apply fills to a map of participants (mutates). Asserts conservation.
export function settle(participants, fills) {
  const cashBefore = sum(participants, "cash");
  const stockBefore = sum(participants, "stock");
  for (const f of fills) {
    const buyer = participants.get(f.buyer);
    const seller = participants.get(f.seller);
    if (buyer === seller) throw new Error("자기 거래는 허용되지 않습니다.");
    if (buyer.cash < f.price || seller.stock < 1) throw new Error("확정 시점 잔고 검사 실패");
    buyer.cash -= f.price; buyer.stock += 1; seller.cash += f.price; seller.stock -= 1;
    buyer.avgCost = buyer.avgCost == null ? f.price : (buyer.avgCost * (buyer.stock - 1) + f.price) / buyer.stock;
  }
  if (sum(participants, "cash") !== cashBefore || sum(participants, "stock") !== stockBefore) throw new Error("현금·주식 총량 보존이 깨졌습니다.");
  for (const p of participants.values()) if (p.cash < 0 || p.stock < 0) throw new Error("음수 현금 또는 공매도가 발생했습니다.");
}

function sum(map, key) { let s = 0; for (const p of map.values()) s += p[key]; return s; }

export const ROLE_CARDS = [
  { id: "value", name: "가치 중시", desc: "기준가치와 현재 가격의 차이를 살핀다. 가치 추정 자체가 틀릴 수 있다는 반대 근거도 하나 적는다." },
  { id: "trend", name: "추세 추종", desc: "최근 가격 방향을 참고한다. 추세가 갑자기 끝날 수 있는 신호도 하나 적는다." },
  { id: "loss", name: "손실 민감", desc: "손실 가능성을 크게 본다. 지나친 회피의 기회비용도 하나 적는다." },
  { id: "cash", name: "현금 확보 필요", desc: "현금 수요를 우선한다. 불리한 가격에 매도할 때의 비용도 하나 적는다." },
];

export const NEWS = [
  { text: "1라운드 · 분기 실적이 시장 예상을 소폭 상회했다. 다만 경영진은 다음 분기 수요 둔화 가능성을 언급했다.", tone: 1 },
  { text: "2라운드 · 주요 고객사가 장기 공급 계약을 연장했다는 보도. 규모는 공개되지 않았다.", tone: 1 },
  { text: "3라운드 · 경쟁사가 대규모 증설을 발표했다. 업계 전반의 가격 경쟁 우려가 제기된다.", tone: -1 },
  { text: "4라운드 · 중앙은행이 예상보다 매파적인 발언을 했다. 위험자산 전반이 약세다.", tone: -1 },
  { text: "5라운드 · 특별한 뉴스가 없다. 거래량이 얇다.", tone: 0 },
  { text: "6라운드 · 회사가 자사주 매입을 발표했다. 규모는 시가총액의 1% 수준.", tone: 1 },
];

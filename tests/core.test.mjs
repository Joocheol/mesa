// node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seedRandom, normal, standardizedT, hashSeed } from "../site/assets/js/rng.js";
import { mean, sd, excessKurtosis, diagnostics, runsAnalysis, humanIndex, humanVerdict, brier, logReturns, pathFromReturns, autocorrelation } from "../site/assets/js/stats.js";
import { gbmReturns, tReturns, fitGarchT, garchReturns, bootstrapReturns, shuffleReturns, repeatedInvestment } from "../site/assets/js/models.js";
import { clearAuction, settle, validateOrder } from "../site/assets/js/auction.js";
import { runMarket, abmChecks, TEMPLATES } from "../site/assets/js/abm.js";

const dataset = JSON.parse(readFileSync(new URL("../site/assets/data/dataset.json", import.meta.url), "utf8"));
const csvLines = readFileSync(new URL(`../site/assets/data/${dataset.csv}`, import.meta.url), "utf8").replace(/^\uFEFF/, "").trim().split(/\r?\n/);
const csvHeader = csvLines[0].split(",").map((name) => name.trim().toLowerCase());
const closeIndex = csvHeader.indexOf("adj close") >= 0 ? csvHeader.indexOf("adj close") : csvHeader.indexOf("close");
assert.ok(closeIndex >= 0, "active dataset needs a Close or Adj Close column");
const closes = csvLines.slice(1)
  .map((line) => line.split(",")[closeIndex])
  .filter((value) => value && value !== "null")
  .map(Number);
const returns = logReturns(closes);
const train = returns.slice(0, Math.floor(returns.length * 0.6));

test("seeded rng is deterministic and uniform-ish", () => {
  const a = seedRandom(42); const b = seedRandom(42);
  assert.equal(a(), b());
  const xs = Array.from({ length: 20000 }, seedRandom(7));
  assert.ok(Math.abs(mean(xs) - 0.5) < 0.01);
  assert.notEqual(hashSeed("round1"), hashSeed("round2"));
});

test("normal and standardized t have the right moments", () => {
  const rng = seedRandom(3);
  const z = Array.from({ length: 30000 }, () => normal(rng));
  assert.ok(Math.abs(sd(z) - 1) < 0.02);
  assert.ok(Math.abs(excessKurtosis(z)) < 0.15);
  const t = Array.from({ length: 30000 }, () => standardizedT(5, rng));
  assert.ok(Math.abs(sd(t) - 1) < 0.03, "variance standardization");
  assert.ok(excessKurtosis(t) > 2, "fat tails");
});

test("GBM exact transition matches theoretical mean", () => {
  const paths = gbmReturns({ days: 252, paths: 4000, mu: 0.05, sigma: 0.2, seed: 9 });
  const finals = paths.map((r) => 100 * Math.exp(r.reduce((a, b) => a + b, 0)));
  assert.ok(Math.abs(mean(finals) - 100 * Math.exp(0.05)) < 1.5);
  assert.deepEqual(gbmReturns({ days: 5, paths: 1, mu: 0, sigma: 0.2, seed: 1 }), gbmReturns({ days: 5, paths: 1, mu: 0, sigma: 0.2, seed: 1 }), "same seed reproduces");
});

test("t shocks require df > 2 and keep the target volatility", () => {
  assert.throws(() => tReturns({ days: 10, paths: 1, mu: 0, sigma: 0.2, df: 2 }));
  const r = tReturns({ days: 252, paths: 200, mu: 0, sigma: 0.3, df: 4.5, seed: 2 }).flat();
  assert.ok(Math.abs(sd(r) * Math.sqrt(252) - 0.3) < 0.03);
});

test("GARCH-t fit on the training window succeeds and simulation clusters volatility", () => {
  const fit = fitGarchT(train);
  assert.equal(fit.success, true, fit.message);
  assert.ok(fit.alpha + fit.beta < 1);
  assert.ok(fit.dof > 4);
  const sims = garchReturns({ fit, days: 600, paths: 30, seed: 4 });
  const d = sims.map((s) => diagnostics(s, mean(train), sd(train)));
  assert.ok(mean(d.map((x) => x.kurtosis)) > 0.5, "fat tails from GARCH-t");
  assert.equal(fitGarchT(train.slice(0, 10)).success, false, "too short reports failure");
  assert.equal(fitGarchT(Array(50).fill(0.001)).success, false, "constant series reports failure");
});

test("bootstrap keeps blocks contiguous and shuffle preserves the multiset", () => {
  const src = Array.from({ length: 50 }, (_, i) => i);
  const [b] = bootstrapReturns(src, { days: 30, paths: 1, blockLength: 10, seed: 1 });
  for (let i = 1; i < 30; i += 1) if (i % 10 !== 0) assert.equal(b[i], b[i - 1] + 1, "within-block order preserved");
  const s = shuffleReturns(src, 3);
  assert.deepEqual([...s].sort((x, y) => x - y), src);
  assert.notDeepEqual(s, src);
});

test("shuffling real returns kills squared-return autocorrelation but not kurtosis", () => {
  const shuf = shuffleReturns(train, 5);
  const a = diagnostics(train); const b = diagnostics(shuf);
  assert.ok(Math.abs(a.kurtosis - b.kurtosis) < 1e-9);
  assert.ok(a.acf1 > 0.05 && Math.abs(b.acf1) < 0.05);
});

test("repeated ±20% investment: mean ≈ 100, median far below", () => {
  const r = repeatedInvestment({ paths: 4000, steps: 100, seed: 8 });
  assert.ok(Math.abs(mean(r.finals) - 100) < 20);
  const med = [...r.finals].sort((a, b) => a - b)[2000];
  assert.ok(med < 30);
  assert.ok(Math.abs(r.medianTheory - 100 * Math.pow(Math.sqrt(1.2 * 0.8), 100)) < 1e-9);
});

test("runs analysis separates alternating human sequences from coin flips", () => {
  const human = "HTHTHHTHTHTHTTHTHTHHTHTHTHTHTH".split("");
  assert.equal(humanVerdict(runsAnalysis(human)).label, "사람이 쓴 것 같음");
  const rng = seedRandom(11);
  let coinLike = 0;
  for (let i = 0; i < 50; i += 1) { const seq = Array.from({ length: 30 }, () => (rng() < 0.5 ? "H" : "T")); if (humanVerdict(runsAnalysis(seq)).score < 3) coinLike += 1; }
  assert.ok(coinLike >= 40, `coin sequences mostly pass (${coinLike}/50)`);
});

test("opening coin game uses a continuous comparison and a stable first-round example", () => {
  const human = "HTHTHHTHTHTHTTHTHTHHTHTHTHTHTH".split("");
  const rng = seedRandom(10);
  const coin = Array.from({ length: 30 }, () => (rng() < 0.5 ? "H" : "T"));
  assert.ok(humanIndex(runsAnalysis(human)).raw > humanIndex(runsAnalysis(coin)).raw);

  const simulation = seedRandom(20260921);
  let correct = 0;
  for (let round = 0; round < 1000; round += 1) {
    const person = [simulation() < 0.5 ? "H" : "T"];
    while (person.length < 30) {
      const previous = person.at(-1);
      person.push(simulation() < 0.60 ? (previous === "H" ? "T" : "H") : previous);
    }
    const fair = Array.from({ length: 30 }, () => (simulation() < 0.5 ? "H" : "T"));
    if (humanIndex(runsAnalysis(person)).raw > humanIndex(runsAnalysis(fair)).raw) correct += 1;
  }
  assert.ok(correct >= 750, `detector should win most blind first rounds (${correct}/1000)`);
});

test("three-category Brier reward is proper at the extremes", () => {
  assert.equal(brier(100, true), 1); assert.equal(brier(100, false), 0);
  assert.ok(brier(50, true) > brier(50, false));
  assert.ok(Math.abs(brier(100 / 3, true) - brier(100 / 3, false)) < 1e-12, "uniform probabilities are uninformative");
  assert.ok(brier(80, true) > brier(60, true));
});

test("auction tie-break follows |D−S| then distance to last price", () => {
  // buys 103,101 ; sells 99,102 ; last 100
  const r = clearAuction([
    { id: "a", side: "buy", price: 103, seq: 1 }, { id: "b", side: "buy", price: 101, seq: 2 },
    { id: "c", side: "sell", price: 99, seq: 3 }, { id: "d", side: "sell", price: 102, seq: 4 },
  ], 100);
  // candidates 99..103: p=99 D=2 S=1 v=1; 100 D=2 S=1 v=1; 101 D=2 S=1 v=1; 102 D=1 S=2 v=1; 103 D=1 S=2 v=1
  // all volume 1, imbalance 1 → closest to last: 100 → price 100
  assert.equal(r.volume, 1); assert.equal(r.price, 100);
  assert.deepEqual(r.fills, [{ buyer: "a", seller: "c", price: 100 }]);
  const none = clearAuction([{ id: "a", side: "buy", price: 90, seq: 1 }, { id: "c", side: "sell", price: 110, seq: 2 }], 100);
  assert.equal(none.noTrade, true); assert.equal(none.price, 100);
  const same = clearAuction([{ id: "a", side: "buy", price: 100, seq: 2 }, { id: "b", side: "buy", price: 100, seq: 1 }, { id: "c", side: "sell", price: 100, seq: 3 }], 100);
  assert.equal(same.fills[0].buyer, "b", "earlier sequence wins at equal price");
});

test("settlement conserves cash and shares and rejects self-trade", () => {
  const p = new Map([["a", { cash: 1000, stock: 10, avgCost: 100 }], ["c", { cash: 1000, stock: 10, avgCost: 100 }]]);
  settle(p, [{ buyer: "a", seller: "c", price: 105 }]);
  assert.equal(p.get("a").cash + p.get("c").cash, 2000);
  assert.equal(p.get("a").stock + p.get("c").stock, 20);
  assert.throws(() => settle(p, [{ buyer: "a", seller: "a", price: 100 }]));
  assert.equal(validateOrder({ side: "buy", price: 5000 }, { cash: 100, stock: 1 }), "지정가만큼의 현금이 없습니다.");
  assert.equal(validateOrder({ side: "sell", price: 100 }, { cash: 100, stock: 0 }), "매도할 주식이 없습니다.");
  assert.equal(validateOrder({ side: "hold" }, { cash: 0, stock: 0 }), null);
});

test("agent market runs deterministically and more trend followers fatten the tails", () => {
  const counts = { value: 15, trend: 10, loss: 8, cash: 5, noise: 6, custom: 8 };
  const types = Object.entries(TEMPLATES).map(([type, t]) => ({ type, count: counts[type], params: { ...t.params }, clauses: t.clauses }));
  const cfg = (n, seed) => ({ types: types.map((t) => (t.type === "trend" ? { ...t, count: n } : t)), rounds: 250, seed, newsProb: 0.4 });
  assert.deepEqual(runMarket(cfg(10, 1)).prices, runMarket(cfg(10, 1)).prices);
  const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const low = med([1, 2, 3, 4, 5].map((s) => runMarket(cfg(0, s)).diagnostics.kurtosis));
  const high = med([1, 2, 3, 4, 5].map((s) => runMarket(cfg(30, s)).diagnostics.kurtosis));
  assert.ok(high > low, `kurtosis rises with trend followers (${low.toFixed(2)} → ${high.toFixed(2)})`);
  const checks = abmChecks(runMarket(cfg(10, 1)));
  assert.equal(checks.length, 5);
});

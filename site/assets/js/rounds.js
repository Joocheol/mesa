// Deterministic A/B/C trios for the three tournament rounds. Every team sees the same
// letters; the instructor console uses the same function to know the answer.
import { seedRandom, hashSeed, shuffleInPlace } from "./rng.js";
import { gbmReturns, garchReturns, tReturns } from "./models.js";
import { diagnostics, pathFromReturns, mean, sd } from "./stats.js";

const LETTERS = ["A", "B", "C"];

function fakeModels(data, days, tag) {
  const est = data.estimates;
  const gbm = gbmReturns({ days, paths: 1, mu: est.gbmMu, sigma: est.annVol, seed: hashSeed(`${tag}-gbm`) })[0];
  const fit = data.garch();
  let second;
  if (fit.success) second = { key: "garch", name: "GARCH(1,1)-t", returns: garchReturns({ fit, days, paths: 1, seed: hashSeed(`${tag}-garch`) })[0] };
  else second = { key: "t", name: "t 충격 (GARCH 적합 실패로 대체)", returns: tReturns({ days, paths: 1, mu: est.gbmMu, sigma: est.annVol, df: 4.5, seed: hashSeed(`${tag}-t`) })[0] };
  return [{ key: "gbm", name: "GBM", returns: gbm }, second];
}

export function buildRound(id, data) {
  const est = data.estimates;
  let real;
  let days;
  let show;
  if (id === "round1") {
    days = 150; // last 150 days of the training window (in-sample; never the sealed test window)
    real = data.trainReturns.slice(-days);
    show = { chart: true, metrics: false };
  } else if (id === "round2") {
    days = data.valReturns.length;
    real = data.valReturns;
    show = { chart: false, metrics: true };
  } else if (id === "round3") {
    const sealed = data.sealed();
    days = sealed.testReturns.length;
    real = sealed.testReturns;
    show = { chart: true, metrics: true };
  } else throw new Error(`알 수 없는 라운드: ${id}`);

  const cards = [{ key: "real", name: `실제 ${data.meta.instrument || "주가"}`, returns: real }, ...fakeModels(data, days, id)];
  shuffleInPlace(cards, seedRandom(hashSeed(`${id}-letters`)));
  cards.forEach((card, i) => {
    card.letter = LETTERS[i];
    card.path = pathFromReturns(card.returns, 100);
    card.metrics = diagnostics(card.returns, est.dailyMean, est.dailySd);
  });
  return { id, days, cards, answer: cards.find((c) => c.key === "real").letter, show };
}

export const LETTERS_ABC = LETTERS;

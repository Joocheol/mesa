// Loads the active versioned market snapshot and splits it chronologically.
// Pages before Round 3 must never call `sealed()`; the final 20% is held out for the class sequence.
import { logReturns, mean, sd } from "./stats.js";
import { fitGarchT } from "./models.js";

// assets/data/dataset.json points at the active snapshot (see scripts/prepare_snapshot.py).
const DATASET = "assets/data/dataset.json";
const SPLIT = { train: 0.6, validation: 0.2 };

let cache = null;

// Accepts our own date,close files and raw Yahoo Finance exports (Date, …, Close, Adj Close, Volume).
function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const iDate = header.indexOf("date");
  const iClose = header.indexOf("adj close") >= 0 ? header.indexOf("adj close") : header.indexOf("close");
  if (iDate < 0 || iClose < 0) throw new Error("CSV에 date, close 열이 필요합니다.");
  const rows = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    if (!cells[iClose] || cells[iClose] === "null") continue; // Yahoo holiday rows
    const close = Number(cells[iClose]);
    if (!(close > 0)) throw new Error(`0 이하 가격: ${line}`);
    rows.push({ date: cells[iDate].slice(0, 10), close });
  }
  for (let i = 1; i < rows.length; i += 1) {
    if (rows[i].date <= rows[i - 1].date) throw new Error(`날짜 순서/중복 오류: ${rows[i].date}`);
  }
  return rows;
}

export async function loadMarket() {
  if (cache) return cache;
  const dataset = await fetch(DATASET).then((r) => { if (!r.ok) throw new Error(`dataset.json 로딩 실패 (${r.status})`); return r.json(); });
  const [csvText, meta] = await Promise.all([
    fetch(`assets/data/${dataset.csv}`).then((r) => { if (!r.ok) throw new Error(`CSV 로딩 실패 (${r.status})`); return r.text(); }),
    fetch(`assets/data/${dataset.metadata}`).then((r) => (r.ok ? r.json() : {})),
  ]);
  meta.csv_file = dataset.csv;
  const rows = parseCsv(csvText);
  const closes = rows.map((r) => r.close);
  const returns = logReturns(closes);
  const n = returns.length;
  const nTrain = Math.floor(n * SPLIT.train);
  const nVal = Math.floor(n * SPLIT.validation);
  // return i is between price i and i+1
  const trainReturns = returns.slice(0, nTrain);
  const valReturns = returns.slice(nTrain, nTrain + nVal);
  const testReturns = returns.slice(nTrain + nVal);
  const trainMean = mean(trainReturns);
  const trainSd = sd(trainReturns);
  const estimates = {
    dailyMean: trainMean,
    dailySd: trainSd,
    annLogMean: trainMean * 252,
    annVol: trainSd * Math.sqrt(252),
    // arithmetic drift of the price process: mu = m*252 + sigma²/2
    gbmMu: trainMean * 252 + 0.5 * trainSd * trainSd * 252,
  };
  const open = {
    rows: rows.slice(0, nTrain + nVal + 1),
    returns: returns.slice(0, nTrain + nVal),
  };
  cache = {
    meta,
    rows,
    closes,
    returns,
    split: {
      nTrain,
      nVal,
      nTest: n - nTrain - nVal,
      trainRange: [rows[0].date, rows[nTrain].date],
      valRange: [rows[nTrain].date, rows[nTrain + nVal].date],
      testRange: [rows[nTrain + nVal].date, rows[n].date],
    },
    trainReturns,
    valReturns,
    estimates,
    open, // prices & returns visible before the final exam
    // Held-out accessor: only Round 3 / final pages should call this.
    sealed: () => ({ testReturns, testRows: rows.slice(nTrain + nVal), range: cache.split.testRange }),
    garch: () => getGarch(trainReturns),
  };
  return cache;
}

let garchCache = null;
function getGarch(trainReturns) {
  if (garchCache) return garchCache;
  try {
    const stored = sessionStorage.getItem("fm-garch-fit-v1");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.n === trainReturns.length) { garchCache = parsed; return garchCache; }
    }
  } catch { /* storage unavailable */ }
  garchCache = fitGarchT(trainReturns);
  try { sessionStorage.setItem("fm-garch-fit-v1", JSON.stringify(garchCache)); } catch { /* ignore */ }
  return garchCache;
}

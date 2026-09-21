import { PAGES, SCHEDULE } from "../pages.js";
import { initChrome, $, escapeHtml } from "../ui.js";
import { loadState } from "../state.js";
import { loadMarket } from "../data.js";
import { lineChart } from "../chart.js";

initChrome();

const done = new Set(loadState().completed || []);
$("[data-course-map]").innerHTML = PAGES.map((p) => `<a class="card course-card${done.has(p.id) ? " done" : ""}" href="${p.file}"><span class="step-no">${p.block} · ${p.no}</span><h3>${p.title} · ${p.minutes}분</h3><p class="muted small">${p.summary}</p></a>`).join("");
$("[data-schedule]").innerHTML = SCHEDULE.map((s) => `<div class="timeline-item${s.isBreak ? " break" : ""}"><time>${s.t}</time><span>${s.label} <span class="muted">(${s.len}분)</span></span></div>`).join("");

try {
  const data = await loadMarket();
  const { meta, open, split, rows } = data;
  $("[data-data-name]").textContent = `${meta.instrument || "실제 주가"} (${meta.symbol || ""})`;
  $("[data-data-range]").textContent = `${rows[0].date} ~ ${rows[rows.length - 1].date}`;
  $("[data-data-count]").textContent = rows.length.toLocaleString();
  $("[data-data-last]").textContent = `${rows[rows.length - 1].close.toLocaleString()}원`;
  $("[data-meta-instrument]").textContent = `${meta.instrument || "—"} · ${meta.market || ""} · ${meta.currency || ""}`;
  const src = $("[data-meta-source]");
  src.textContent = `${meta.source_name || "—"} · ${meta.acquired_at || ""}`;
  if (meta.source_url) src.href = meta.source_url;
  $("[data-meta-price]").textContent = meta.price_definition || "—";
  $("[data-meta-split]").textContent = `추정 ${split.nTrain}일 (${split.trainRange[0]}~${split.trainRange[1]}) · 검증 ${split.nVal}일 · 최종평가 ${split.nTest}일 (봉인)`;
  $("[data-meta-hash]").textContent = meta.csv_sha256 || "—";
  const closes = open.rows.map((r) => r.close / open.rows[0].close * 100);
  lineChart($("[data-home-chart]"), [{ values: closes, width: 1.8 }], { log: true, xTicks: [{ value: 0, label: open.rows[0].date.slice(0, 7) }, { value: closes.length - 1, label: open.rows[open.rows.length - 1].date.slice(0, 7) }] });
} catch (error) {
  $("[data-data-name]").textContent = `데이터를 불러오지 못했습니다: ${escapeHtml(error.message)} — http 서버로 여세요.`;
}

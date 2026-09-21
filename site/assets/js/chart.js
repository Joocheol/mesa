// Small dependency-free SVG charts. All charts scale with the container via viewBox.
const NS = "http://www.w3.org/2000/svg";
const W = 640;
const H = 300;
const PAD = { l: 52, r: 16, t: 18, b: 34 };

export const COLORS = ["#54e5ca", "#ffb454", "#6aa8ff", "#c59cff", "#ff6b7a", "#7ee787", "#f0e68c"];

function el(tag, attrs = {}, text) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function niceTicks(min, max, count = 5) {
  if (!(max > min)) return [min];
  const span = max - min;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const ticks = [];
  for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) ticks.push(Number(t.toFixed(10)));
  return ticks;
}

function logTicks(min, max) {
  const ticks = [];
  const lo = Math.floor(Math.log10(min));
  const hi = Math.ceil(Math.log10(max));
  const span = Math.log10(max) - Math.log10(min);
  const mults = span > 2.5 ? [1] : span > 1.2 ? [1, 3] : [1, 2, 5];
  for (let e = lo; e <= hi; e += 1) for (const m of mults) { const t = m * 10 ** e; if (t >= min && t <= max) ticks.push(t); }
  return ticks.length ? ticks : [min, max];
}

function frame(container, { xLabel, yLabel } = {}) {
  container.innerHTML = "";
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
  container.appendChild(svg);
  if (yLabel) svg.appendChild(el("text", { x: 6, y: 12, "font-size": 11 }, yLabel));
  if (xLabel) svg.appendChild(el("text", { x: W - PAD.r, y: H - 4, "text-anchor": "end", "font-size": 11 }, xLabel));
  return svg;
}

function axes(svg, xs, ys, { log = false, xTicks = null, yFormat = (v) => String(v) } = {}) {
  const x0 = PAD.l;
  const x1 = W - PAD.r;
  const y0 = H - PAD.b;
  const y1 = PAD.t;
  const yScale = (v) => y0 - ((log ? Math.log(v) : v) - ys[0]) / (ys[1] - ys[0]) * (y0 - y1);
  const xScale = (v) => x0 + (v - xs[0]) / (xs[1] - xs[0] || 1) * (x1 - x0);
  const ticks = log ? logTicks(Math.exp(ys[0]), Math.exp(ys[1])) : niceTicks(ys[0], ys[1], 5);
  for (const t of ticks) {
    const y = yScale(t);
    if (y < y1 - 1 || y > y0 + 1) continue;
    svg.appendChild(el("line", { x1: x0, x2: x1, y1: y, y2: y, class: "grid" }));
    svg.appendChild(el("text", { x: x0 - 6, y: y + 4, "text-anchor": "end" }, yFormat(t)));
  }
  const xt = xTicks || niceTicks(xs[0], xs[1], 6);
  for (const t of xt) {
    const x = xScale(typeof t === "object" ? t.value : t);
    const anchor = x < x0 + 20 ? "start" : x > x1 - 20 ? "end" : "middle";
    svg.appendChild(el("text", { x, y: y0 + 16, "text-anchor": anchor }, typeof t === "object" ? t.label : String(t)));
  }
  svg.appendChild(el("line", { x1: x0, x2: x1, y1: y0, y2: y0, class: "axis" }));
  svg.appendChild(el("line", { x1: x0, x2: x0, y1: y0, y2: y1, class: "axis" }));
  return { xScale, yScale };
}

// series: [{values, color, width, dash, label}] ; x = index unless xs given.
export function lineChart(container, series, { log = false, yLabel, xLabel, xTicks, yFormat, band } = {}) {
  const svg = frame(container, { xLabel, yLabel });
  const all = series.flatMap((s) => s.values).filter((v) => Number.isFinite(v) && (!log || v > 0));
  if (!all.length) return;
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (band) { lo = Math.min(lo, ...band.low); hi = Math.max(hi, ...band.high); }
  if (log) { lo = Math.log(lo); hi = Math.log(hi); }
  const padY = (hi - lo || 1) * 0.06;
  const len = Math.max(...series.map((s) => s.values.length));
  const { xScale, yScale } = axes(svg, [0, len - 1], [lo - padY, hi + padY], { log, xTicks, yFormat: yFormat || ((v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : String(+v.toFixed(2)))) });
  if (band) {
    const up = band.high.map((v, i) => `${xScale(i)},${yScale(v)}`);
    const dn = band.low.map((v, i) => `${xScale(i)},${yScale(v)}`).reverse();
    svg.appendChild(el("polygon", { points: [...up, ...dn].join(" "), fill: band.color || COLORS[0], opacity: 0.15 }));
  }
  series.forEach((s, i) => {
    const pts = s.values.map((v, j) => (Number.isFinite(v) && (!log || v > 0) ? `${xScale(j).toFixed(1)},${yScale(v).toFixed(1)}` : null)).filter(Boolean);
    svg.appendChild(el("polyline", { points: pts.join(" "), fill: "none", stroke: s.color || COLORS[i % COLORS.length], "stroke-width": s.width || 1.6, "stroke-dasharray": s.dash || "none", opacity: s.opacity ?? 1 }));
  });
}

// values: numeric array; overlay: {pdf: fn(x), color} drawn on density scale.
export function histogram(container, values, { bins = 30, xLabel, yLabel = "빈도", overlays = [], range, refLines = [] } = {}) {
  const svg = frame(container, { xLabel, yLabel });
  const xs = values.filter(Number.isFinite);
  if (!xs.length) return;
  const min = range ? range[0] : Math.min(...xs);
  const max = range ? range[1] : Math.max(...xs);
  const width = (max - min || 1) / bins;
  const counts = Array(bins).fill(0);
  for (const v of xs) {
    let b = Math.floor((v - min) / width);
    if (b >= bins) b = bins - 1;
    if (b < 0) b = 0;
    counts[b] += 1;
  }
  const maxCount = Math.max(...counts, 1);
  const { xScale, yScale } = axes(svg, [min, max], [0, maxCount * 1.08], { yFormat: (v) => String(Math.round(v)) });
  counts.forEach((c, i) => {
    const x = xScale(min + i * width);
    const x2 = xScale(min + (i + 1) * width);
    svg.appendChild(el("rect", { x: x + 0.5, y: yScale(c), width: Math.max(1, x2 - x - 1), height: yScale(0) - yScale(c), fill: COLORS[0], opacity: 0.75 }));
  });
  for (const o of overlays) {
    const pts = [];
    for (let i = 0; i <= 120; i += 1) {
      const x = min + ((max - min) * i) / 120;
      const y = o.pdf(x) * xs.length * width; // density → expected count
      pts.push(`${xScale(x).toFixed(1)},${yScale(Math.min(y, maxCount * 1.08)).toFixed(1)}`);
    }
    svg.appendChild(el("polyline", { points: pts.join(" "), fill: "none", stroke: o.color || COLORS[1], "stroke-width": 2, "stroke-dasharray": o.dash || "none" }));
  }
  for (const r of refLines) {
    const x = xScale(r.value);
    svg.appendChild(el("line", { x1: x, x2: x, y1: yScale(0), y2: PAD.t, stroke: r.color || COLORS[4], "stroke-width": 1.5, "stroke-dasharray": "4 3" }));
    svg.appendChild(el("text", { x: x + 4, y: PAD.t + 12, fill: r.color || COLORS[4] }, r.label));
  }
}

// Discrete bars at integer x (Galton board landing counts) with optional theoretical overlays.
export function barChart(container, labels, counts, { overlays = [], yLabel = "공 개수", xLabel } = {}) {
  const svg = frame(container, { xLabel, yLabel });
  const maxCount = Math.max(...counts, ...overlays.flatMap((o) => o.values), 1);
  const n = labels.length;
  const { xScale, yScale } = axes(svg, [-0.5, n - 0.5], [0, maxCount * 1.08], { xTicks: labels.map((l, i) => ({ value: i, label: l })), yFormat: (v) => String(Math.round(v)) });
  const bw = (xScale(1) - xScale(0)) * 0.8;
  counts.forEach((c, i) => svg.appendChild(el("rect", { x: xScale(i) - bw / 2, y: yScale(c), width: bw, height: yScale(0) - yScale(c), fill: COLORS[0], opacity: 0.75 })));
  overlays.forEach((o, k) => {
    const pts = o.values.map((v, i) => `${xScale(i)},${yScale(v)}`).join(" ");
    svg.appendChild(el("polyline", { points: pts, fill: "none", stroke: o.color || COLORS[k + 1], "stroke-width": 2, "stroke-dasharray": o.dash || "none" }));
    o.values.forEach((v, i) => svg.appendChild(el("circle", { cx: xScale(i), cy: yScale(v), r: 3, fill: o.color || COLORS[k + 1] })));
  });
}

// points: [{x, y, color, label}] ; used for calibration and metric comparisons
export function scatter(container, points, { xLabel, yLabel, xRange, yRange, diagonal = false } = {}) {
  const svg = frame(container, { xLabel, yLabel });
  if (!points.length) return;
  const xs = xRange || [Math.min(...points.map((p) => p.x)), Math.max(...points.map((p) => p.x))];
  const ys = yRange || [Math.min(...points.map((p) => p.y)), Math.max(...points.map((p) => p.y))];
  const { xScale, yScale } = axes(svg, xs, ys, {});
  if (diagonal) svg.appendChild(el("line", { x1: xScale(xs[0]), y1: yScale(ys[0]), x2: xScale(xs[1]), y2: yScale(ys[1]), class: "grid" }));
  for (const p of points) {
    svg.appendChild(el("circle", { cx: xScale(p.x), cy: yScale(p.y), r: p.r || 5, fill: p.color || COLORS[0], opacity: p.opacity ?? 0.85 }));
    if (p.label) svg.appendChild(el("text", { x: xScale(p.x) + 7, y: yScale(p.y) + 4 }, p.label));
  }
}

// Monte-Carlo style dot cloud for the coin game is not needed; kept for symmetry.
export function legend(container, items) {
  container.innerHTML = items.map((i) => `<span style="--c:${i.color}">${i.label}</span>`).join("");
}

// Shared page chrome: header with progress, activity head, prev/next nav, helpers.
import { PAGES, neighbours, pageById } from "./pages.js";
import { loadState, team } from "./state.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function status(target, message, type = "") {
  const node = typeof target === "string" ? document.getElementById(target) : target;
  if (!node) return;
  node.className = `status ${type}`.trim();
  node.textContent = message;
  node.classList.remove("hidden");
}

export function escapeHtml(value) {
  const node = document.createElement("span");
  node.textContent = String(value ?? "");
  return node.innerHTML;
}

export function download(name, text, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function bindRange(input, output, format = (v) => v) {
  const update = () => { output.textContent = format(input.value); };
  input.addEventListener("input", update);
  update();
}

function renderHeader() {
  const header = document.createElement("header");
  header.className = "site-header";
  header.innerHTML = `<div class="inner">
    <a class="brand" href="index.html"><span class="brand-mark">FM</span><span>가짜 주식시장 만들기</span></a>
    <div class="progress-wrap"><div class="progress-label"><span data-progress-label></span><span>진행률</span></div><div class="progress-track"><div class="progress-fill" data-progress-fill></div></div></div>
    <a class="team-chip" href="join.html" data-team-chip></a>
    <a class="pill" href="leaderboard.html">리더보드</a>
  </div>`;
  document.body.prepend(header);
  updateProgress();
  document.addEventListener("fm:progress", updateProgress);
}

export function updateProgress() {
  const state = loadState();
  const done = new Set(state.completed || []);
  const count = PAGES.filter((p) => done.has(p.id)).length;
  const current = pageById(document.body.dataset.page);
  const label = $("[data-progress-label]");
  const fill = $("[data-progress-fill]");
  if (label) label.textContent = `${count}/${PAGES.length}${current ? ` · ${current.no} ${current.title}` : ""}`;
  if (fill) fill.style.width = `${(count / PAGES.length) * 100}%`;
  const chip = $("[data-team-chip]");
  const t = team();
  if (chip) chip.innerHTML = t.teamName ? `<strong>${escapeHtml(t.teamName)}</strong> · ${escapeHtml(t.classCode)}` : "팀 입장 →";
}

function renderPageHead() {
  const current = pageById(document.body.dataset.page);
  const slot = $("[data-page-head]");
  if (!current || !slot) return;
  slot.innerHTML = `<div class="page-head">
    <div><p class="eyebrow">${current.block} · ${current.no}</p><h1>${current.title}</h1><p class="lead muted">${current.summary}</p></div>
    <div class="meta"><span class="pill">⏱ ${current.minutes}분</span>${slot.dataset.weapon ? `<span class="pill accent">${slot.dataset.weapon}</span>` : ""}</div>
  </div>
  <div class="loop"><div><strong>예상</strong>먼저 답을 적는다</div><div><strong>실행</strong>돌려 본다</div><div><strong>비교</strong>예상과 다른 이유</div><div><strong>변경</strong>가정 하나만 바꾼다</div></div>`;
}

function renderNav() {
  const current = pageById(document.body.dataset.page);
  const slot = $("[data-page-nav]");
  if (!current || !slot) return;
  const { prev, next } = neighbours(current.id);
  slot.className = "page-nav";
  slot.innerHTML = `${prev ? `<a class="button" href="${prev.file}">← ${prev.no} ${prev.title}</a>` : `<a class="button" href="index.html">← 개요</a>`}${next ? `<a class="button primary" href="${next.file}">${next.no} ${next.title} →</a>` : `<a class="button primary" href="leaderboard.html">리더보드 →</a>`}`;
}

function labelUnnamedControls() {
  const explicitLabels = $$('label[for]');
  for (const control of $$('input, select, textarea')) {
    const hasExplicitLabel = control.id && explicitLabels.some((label) => label.htmlFor === control.id);
    if (hasExplicitLabel || control.getAttribute('aria-label') || control.getAttribute('aria-labelledby')) continue;
    const label = control.closest('.field')?.querySelector('label') || control.closest('label');
    const text = label?.textContent?.replace(/\s+/g, ' ').trim();
    if (text) control.setAttribute('aria-label', text);
  }
}

export function initChrome() {
  renderHeader();
  renderPageHead();
  renderNav();
  labelUnnamedControls();
}

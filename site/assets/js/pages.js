// The course map. Order here is the order of the day.
export const PAGES = [
  { id: "random", file: "00-random.html", no: "0", title: "사람은 난수를 못 만든다", minutes: 20, block: "0교시", summary: "손으로 쓴 동전 30개와 진짜 동전을 검사로 구별합니다." },
  { id: "galton", file: "01-galton.html", no: "1a", title: "골턴 보드와 곱셈 세계", minutes: 25, block: "1교시", summary: "더하는 세계에서 정규분포가, 곱하는 세계에서 다른 운명이 나옵니다." },
  { id: "gbm", file: "02-gbm.html", no: "1b", title: "우리 팀의 첫 가짜 시장 (GBM)", minutes: 15, block: "1교시", summary: "추정 구간의 μ·σ로 GBM을 만들고 모수 하나만 바꿔 봅니다." },
  { id: "round1", file: "03-round1.html", no: "1c", title: "R1 · 눈으로 판별", minutes: 15, block: "1교시", summary: "실제·GBM·GARCH-t 차트 셋 중 진짜를 고르고 확신도를 겁니다." },
  { id: "tests", file: "04-tests.html", no: "2a", title: "공개 · 보정 · 검사표", minutes: 25, block: "2교시", summary: "R1 정답 공개, 확신도 보정, 말을 숫자로 바꾸는 검사표, 순서 섞기." },
  { id: "repair", file: "05-repair.html", no: "2b", title: "모형 수리 작업실", minutes: 25, block: "2교시", summary: "t 충격 · GARCH-t · 블록 재추출 중 하나로 고치고, 나빠진 지표도 적습니다." },
  { id: "round2", file: "06-round2.html", no: "2c", title: "R2 · 검사표로 판별", minutes: 10, block: "2교시", summary: "차트 없이 숫자만 보고 진짜를 고릅니다." },
  { id: "market", file: "07-market.html", no: "3a", title: "사람이 시장이 된다", minutes: 25, block: "3교시", summary: "역할 카드 · 뉴스 · 지정가 주문 · 단일가 체결 4라운드, 그리고 우리 규칙 적기." },
  { id: "life", file: "08-life.html", no: "3b", title: "Game of Life — 창발 맛보기", minutes: 10, block: "3교시", summary: "두 줄짜리 규칙에서 움직이는 패턴이 나옵니다. 셀 하나를 바꾼 쌍둥이 세계와 비교합니다." },
  { id: "abm", file: "09-abm.html", no: "3c", title: "규칙이 시장이 된다 — ABM이라는 분야", minutes: 25, block: "3교시", summary: "3a의 규칙을 에이전트로 조립해 시장을 돌리고, 행위자 기반 모형이 어디까지 왔고 무엇이 더 연구되어야 하는지 봅니다." },
  { id: "llm", file: "10-llm.html", no: "4a", title: "규칙 대신 LLM을 앉히면?", minutes: 30, block: "4교시", summary: "ABM의 최전선 — 같은 카드를 받은 LLM 4명은 얼마나 같은 판단을 하는가." },
  { id: "round3", file: "11-round3.html", no: "4b", title: "R3 · 봉인 구간 최종전", minutes: 15, block: "4교시", summary: "처음 보는 최종 20% 구간에서 모형을 평가합니다." },
  { id: "final", file: "12-final.html", no: "5", title: "설명서와 되돌아보기", minutes: 40, block: "5교시", summary: "한 장 설명서, 교차 심사, 처음 판단 다시 보기, 리더보드." },
];

export const SCHEDULE = [
  { t: "00:00", len: 20, label: "0교시 · 사람은 난수를 못 만든다" },
  { t: "00:20", len: 55, label: "1교시 · 동전에서 주가로 (골턴 → 곱셈 → GBM → R1)" },
  { t: "01:15", len: 10, label: "휴식", isBreak: true },
  { t: "01:25", len: 60, label: "2교시 · 검사기를 만들고 모형을 고친다 (공개 → 검사표 → 수리 → R2)" },
  { t: "02:25", len: 10, label: "휴식", isBreak: true },
  { t: "02:35", len: 60, label: "3교시 · 사람이 시장이 된다 → Game of Life → 규칙이 시장이 된다 (ABM이라는 분야)" },
  { t: "03:35", len: 45, label: "4교시 · 규칙 대신 LLM을 앉히면? (ABM의 최전선) → R3 최종전" },
  { t: "04:20", len: 40, label: "5교시 · 설명서와 되돌아보기" },
];

export const ROUNDS = {
  round1: { activityId: "round1", label: "R1 · 눈으로 판별", weapon: "차트만" },
  round2: { activityId: "round2", label: "R2 · 검사표로 판별", weapon: "숫자만" },
  round3: { activityId: "round3", label: "R3 · 봉인 구간 최종전", weapon: "차트 + 검사표, 처음 보는 구간" },
};

export function pageById(id) { return PAGES.find((p) => p.id === id); }
export function neighbours(id) {
  const i = PAGES.findIndex((p) => p.id === id);
  return { prev: i > 0 ? PAGES[i - 1] : null, next: i >= 0 && i < PAGES.length - 1 ? PAGES[i + 1] : null };
}

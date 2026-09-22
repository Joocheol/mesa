// The course map. Order here is the order of the day.
export const PAGES = [
  { id: "random", file: "00-random.html", no: "0", title: "사람은 난수를 못 만든다", minutes: 20, block: "0교시", summary: "손으로 쓴 동전 30개와 진짜 동전을 검사로 구별합니다." },
  { id: "galton", file: "01-galton.html", no: "1a", title: "골턴 보드와 곱셈 세계", minutes: 25, block: "1교시", summary: "더하는 세계에서 정규분포가, 곱하는 세계에서 다른 운명이 나옵니다." },
  { id: "gbm", file: "02-gbm.html", no: "1b", title: "우리 팀의 첫 가짜 시장 (GBM)", minutes: 15, block: "1교시", summary: "추정 구간의 μ·σ로 GBM을 만들고 모수 하나만 바꿔 봅니다." },
  { id: "round1", file: "03-round1.html", no: "1c", title: "R1 · 눈으로 판별", minutes: 15, block: "1교시", summary: "실제·GBM·GARCH-t 차트 셋 중 진짜를 고르고 확신도를 겁니다." },
  { id: "tests", file: "04-tests.html", no: "2a", title: "공개 · 확신도 되돌아보기 · 검사표", minutes: 25, block: "2교시", summary: "R1 정답 공개, 확신도–정답률 수업 요약, 말을 숫자로 바꾸는 검사표, 순서 섞기." },
  { id: "repair", file: "05-repair.html", no: "2b", title: "모형 수리 작업실", minutes: 25, block: "2교시", summary: "t 충격 · GARCH-t · 블록 재추출 중 하나로 고치고, 나빠진 지표도 적습니다." },
  { id: "round2", file: "06-round2.html", no: "2c", title: "R2 · 검사표로 판별", minutes: 10, block: "2교시", summary: "차트 없이 숫자만 보고 진짜를 고릅니다." },
  { id: "market", file: "07-market.html", no: "3a", title: "사람이 시장이 된다", minutes: 25, block: "3교시", summary: "역할 카드 · 뉴스 · 지정가 주문 · 단일가 체결 4라운드, 그리고 우리 규칙 적기." },
  { id: "life", file: "08-life.html", no: "3b", title: "Game of Life — 창발 맛보기", minutes: 10, block: "3교시", summary: "두 줄짜리 규칙에서 움직이는 패턴이 나옵니다. 셀 하나를 바꾼 쌍둥이 세계와 비교합니다." },
  { id: "abm", file: "09-abm.html", no: "3c", title: "규칙이 시장이 된다 — ABM이라는 분야", minutes: 25, block: "3교시", summary: "3a의 규칙을 에이전트로 조립해 시장을 돌리고, 행위자 기반 모형이 어디까지 왔고 무엇이 더 연구되어야 하는지 봅니다." },
  { id: "llm", file: "10-llm.html", no: "4a", title: "규칙 대신 LLM을 앉히면?", minutes: 30, block: "4교시", summary: "강사 작성 가상 사례로 동조 가설과 올바른 반복 실험을 구분합니다." },
  { id: "round3", file: "11-round3.html", no: "4b", title: "R3 · 처음 보는 구간 최종전", minutes: 15, block: "4교시", summary: "수업 중 처음 공개하는 최종 20% 구간에서 모형을 평가합니다." },
  { id: "final", file: "12-final.html", no: "5", title: "설명서와 되돌아보기", minutes: 40, block: "5교시", summary: "한 장 설명서, 교차 심사, 처음 판단 다시 보기, 리더보드." },
];

export const SCHEDULE = [
  { t: "00:00", len: 20, label: "0교시 · 사람은 난수를 못 만든다" },
  { t: "00:20", len: 55, label: "1교시 · 동전에서 주가로 (골턴 → 곱셈 → GBM → R1)" },
  { t: "01:15", len: 10, label: "휴식", isBreak: true },
  { t: "01:25", len: 60, label: "2교시 · 검사기를 만들고 모형을 고친다 (공개 → 검사표 → 수리 → R2)" },
  { t: "02:25", len: 10, label: "휴식", isBreak: true },
  { t: "02:35", len: 60, label: "3교시 · 사람이 시장이 된다 → Game of Life → 규칙이 시장이 된다 (ABM이라는 분야)" },
  { t: "03:35", len: 45, label: "4교시 · 규칙 대신 LLM을 앉히면? (연구 가설 설계) → R3 최종전" },
  { t: "04:20", len: 40, label: "5교시 · 설명서와 되돌아보기" },
];

export const ROUNDS = {
  round1: { activityId: "round1", label: "R1 · 눈으로 판별", weapon: "차트만" },
  round2: { activityId: "round2", label: "R2 · 검사표로 판별", weapon: "숫자만" },
  round3: { activityId: "round3", label: "R3 · 처음 보는 구간 최종전", weapon: "차트 + 검사표, 수업 중 처음 공개" },
};

export const BEGINNER_NOTES = {
  random: {
    title: "난수는 ‘규칙이 없음’이 아니라 ‘결과를 미리 특정할 수 없음’입니다",
    body: "시드는 난수의 출발점입니다. 같은 시드와 같은 규칙을 쓰면 같은 결과가 다시 나와, 실험을 재현하고 비교할 수 있습니다.",
    terms: [["난수·시드", "randomness"], ["몬테카를로", "monte-carlo"]],
  },
  galton: {
    title: "한 번의 결과보다 반복했을 때 생기는 분포를 봅니다",
    body: "더하기가 반복되는 과정과 곱하기가 반복되는 과정은 평균이 같아도 전혀 다른 모양을 만듭니다. 평균과 중앙값을 함께 보세요.",
    terms: [["분포·경로", "distribution"], ["로그수익률", "returns"]],
  },
  gbm: {
    title: "모형은 현실을 복사한 것이 아니라, 가정을 실행 가능한 규칙으로 만든 것입니다",
    body: "μ는 평균적인 방향, σ는 흔들림의 크기, 경로는 한 번의 가능한 미래입니다. 여러 경로를 돌려 결과의 범위를 비교합니다.",
    terms: [["모형·모수", "simulation"], ["경로·반복실행", "monte-carlo"], ["GBM", "models"]],
  },
  round1: {
    title: "확신도는 기분의 세기가 아니라 선택한 답에 배정한 확률입니다",
    body: "세 후보가 있으므로 정보가 전혀 없으면 약 33%입니다. 80%를 냈다면 같은 종류의 판단을 많이 했을 때 대략 80%는 맞아야 한다는 뜻입니다.",
    terms: [["확률·확신도", "probability"], ["Brier 보상", "probability"]],
  },
  tests: {
    title: "검사표는 ‘진짜냐 가짜냐’를 한 숫자로 판정하지 않습니다",
    body: "각 지표는 흔들림, 꼬리, 극단값, 시간 순서처럼 서로 다른 특징을 봅니다. 한 지표가 맞아도 전체 모형이 맞다는 뜻은 아닙니다.",
    terms: [["다섯 지표", "diagnostics"], ["분포와 시간구조", "diagnostics"]],
  },
  repair: {
    title: "추정에 쓴 자료와 평가에 쓸 자료를 분리해야 합니다",
    body: "처음 60%로 모형을 정하고 다음 20%에서 비교합니다. 실행 뒤 결과를 보고 같은 평가 구간에 계속 맞추면 과적합이 생깁니다.",
    terms: [["추정·검증·최종평가", "validation"], ["t·GARCH·재추출", "models"], ["예측 범위", "reading-results"]],
  },
  round2: {
    title: "가장 튀는 숫자 하나가 아니라 지표의 조합을 읽습니다",
    body: "변동성은 전체 흔들림, 첨도와 ±3σ는 극단값, 제곱수익률 ACF는 큰 변동이 이어지는지를 말합니다.",
    terms: [["검사표 읽기", "diagnostics"], ["판단 기록", "reading-results"]],
  },
  market: {
    title: "가격은 뉴스만이 아니라 주문 규칙과 제약에서도 나옵니다",
    body: "지정가는 ‘이 가격까지는 사거나 팔겠다’는 한계 가격입니다. 이 활동에서는 가장 많이 체결되는 하나의 가격으로 모든 거래를 맞춥니다.",
    terms: [["상태·규칙·상호작용", "simulation"], ["단일가 경매", "market"]],
  },
  life: {
    title: "창발은 개별 규칙에 직접 쓰지 않은 전체 패턴이 나타나는 현상입니다",
    body: "각 셀은 이웃만 보고 동시에 갱신됩니다. 움직이는 명령이 없어도 전체 패턴은 이동해 보일 수 있습니다.",
    terms: [["창발", "abm"], ["동시 갱신", "abm"]],
  },
  abm: {
    title: "ABM은 참여자를 먼저 만들고 전체 결과를 관찰하는 상향식 모형입니다",
    body: "한 번의 실행은 하나의 사례일 뿐입니다. 시드와 구성비를 바꿔 반복하고, 같은 현상을 다른 규칙도 만들 수 있는지 비교해야 합니다.",
    terms: [["ABM·창발", "abm"], ["반복·민감도", "reading-results"]],
  },
  llm: {
    title: "LLM 응답은 모형의 출력이며, 설명처럼 보이는 문장도 관측자료입니다",
    body: "모델 버전·프롬프트·온도·정보를 고정하고 여러 번 반복해야 비교할 수 있습니다. 이 페이지의 네 응답은 실험 결과가 아닌 강사 작성 예시입니다.",
    terms: [["통제된 반복", "llm"], ["관측과 해석", "reading-results"]],
  },
  round3: {
    title: "처음 보는 자료는 일반화 여부를 확인하지만 미래 예측력을 자동으로 증명하지 않습니다",
    body: "최종 구간은 모형을 고치는 데 쓰지 않습니다. 결과를 본 뒤 모형을 바꾸면 그 구간은 더 이상 ‘처음 보는 자료’가 아닙니다.",
    terms: [["데이터 누수", "validation"], ["일반화와 예측", "reading-results"]],
  },
  final: {
    title: "좋은 모형 설명서는 성과보다 사용 조건과 실패 조건을 먼저 밝힙니다",
    body: "무엇을 재현했는지, 어떤 자료로 확인했는지, 무엇을 빠뜨렸는지, 어디에 쓰면 안 되는지를 함께 기록하세요.",
    terms: [["결과 해석 체크리스트", "reading-results"], ["흔한 오해", "mistakes"]],
  },
};

export function pageById(id) { return PAGES.find((p) => p.id === id); }
export function neighbours(id) {
  const i = PAGES.findIndex((p) => p.id === id);
  return { prev: i > 0 ? PAGES[i - 1] : null, next: i >= 0 && i < PAGES.length - 1 ? PAGES[i + 1] : null };
}

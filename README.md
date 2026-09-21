# 가짜 주식시장 만들기 — 속이는 팀과 잡아내는 팀

은행 퀀트·리스크 실무자를 위한 **5시간 참여형 시뮬레이션 워크숍**. 참가자는 코드를 쓰지 않고, 조당 노트북 한 대의 브라우저로 모든 실습을 진행한다. 손으로 쓴 동전 던지기에서 시작해 주가 모형을 만들고, 검사기를 만들고, 직접 시장이 되어 보고, 그 규칙을 에이전트에게 넘기고, 마지막에 LLM을 앉혀 본다. 하루 종일 한 가지 질문이 반복된다 — **진짜처럼 보이는가, 아니면 검사를 견디는가?**

```bash
node scripts/dev_server.mjs 8787      # http://127.0.0.1:8787 · 강사 비밀번호 mesa
```

## 하루를 하나로 묶는 장치 — 인간 GAN 토너먼트

팀은 **생성자**(가짜를 만든다)와 **판별자**(가짜를 잡는다) 역할을 번갈아 맡는다. 세 번의 판별 라운드는 무기가 다르다.

| 라운드 | 무기 | 실제 구간 |
|---|---|---|
| R1 (1교시 끝) | 차트만 | 추정 구간 마지막 150일 |
| R2 (2교시 끝) | 검사표 숫자만 | 검증 구간 전체 |
| R3 (4교시) | 차트 + 검사표 | **봉인된 최종 20%** — 강사가 열기 전엔 보이지 않음 |

판별은 확신도(0~100)와 함께 제출하고 **브라이어 점수**(맞으면 1−(1−p)², 틀리면 1−p²)로 채점한다. PD 모형 보정과 같은 원리이며, 하루가 끝나면 학급 보정 곡선이 리더보드에 남는다. 생성 점수는 2b(수리 모형)의 검사 통과 수다. 3교시의 Game of Life와 에이전트 시장은 채점하지 않는 '전망' 활동이다 — ABM은 "왜"를 말할 수 있는 유일한 모형이지만 검증이 가장 어려워 더 연구되어야 할 분야라는 것이 결론이다.

## 시간표 (300분, 휴식 20분 포함)

| 시각 | 교시 | 페이지 |
|---|---|---|
| 00:00 | 0 · 사람은 난수를 못 만든다 (20) | `00-random` |
| 00:20 | 1 · 동전에서 주가로 (55): 골턴 보드 → 곱셈 세계 → 첫 GBM → **R1** | `01-galton` `02-gbm` `03-round1` |
| 01:15 | 휴식 (10) | |
| 01:25 | 2 · 검사기를 만들고 모형을 고친다 (60): 공개·보정 → 검사표·순서 섞기 → 수리 작업실 → **R2** | `04-tests` `05-repair` `06-round2` |
| 02:25 | 휴식 (10) | |
| 02:35 | 3 · 사람이 시장이 된다 (25) → Game of Life 창발 맛보기 (10) → 규칙이 시장이 된다 · ABM이라는 분야 (25) | `07-market` `08-life` `09-abm` |
| 03:35 | 4 · 규칙 대신 LLM을 앉히면? (ABM의 최전선) → **R3** 봉인 구간 최종전 (45) | `10-llm` `11-round3` |
| 04:20 | 5 · 설명서와 되돌아보기 (40) | `12-final` `leaderboard` |

이틀(3h+2h)로 나눌 때는 1일차 = 0~2교시 + 설명서 v1, 2일차 = 리캡 + 3~5교시. 자세한 진행안은 [`docs/workshop/instructor-guide.md`](docs/workshop/instructor-guide.md).

## 구조

```
site/                 정적 사이트 (외부 CDN 없음, ES 모듈)
  assets/js/          rng · stats · models(GBM/t/GARCH-t/bootstrap) · auction · abm · life · chart · rounds · classroom
  assets/js/pages/    페이지별 스크립트
  assets/data/        KOSPI 200(활성)·SK하이닉스 스냅샷 + 메타데이터, dataset.json, LLM 사전 생성 응답
worker/index.js       팀 투표·점수·라운드 상태 API (Workers 스타일 fetch, D1)
drizzle/              D1 스키마
scripts/              dev_server.mjs (node:sqlite로 D1 흉내), build_sites_worker.py (배포 번들)
tests/                node --test (핵심 계산) · unittest (정적 사이트 검사)
docs/workshop/        강사 진행안 · 활동지 · 역할 카드 · 경매 규칙 · 설명서 템플릿 · 배포
```

모든 시뮬레이션(GBM, t 충격, GARCH(1,1)-t 최대우도 적합, 블록 재추출, 단일가 경매, 규칙 기반 에이전트 시장)은 **브라우저에서** 실행된다. 서버는 팀 투표·점수·라운드 열기/공개만 담당하며, 서버가 없어도 각 팀 화면은 동작한다(오프라인 공개 버튼).

## 데이터

기본 스냅샷은 **KOSPI 200 지수**(`^KS200`, Yahoo Finance) 마지막 1,500거래일(2018‑11‑23 ~ 2024‑12‑30)이다: `site/assets/data/kospi200-daily.csv`. 추정 구간에 2020년 급락, 봉인 구간에 2024년 8월 급락이 들어 있어 두꺼운 꼬리·변동성 군집이 실제 데이터에서 드러난다. 시간순 60/20/20으로 나누어 추정 구간에서만 모수를 정하고, 최종 20%는 R3까지 봉인한다. SK하이닉스(000660) 스냅샷도 함께 들어 있다.

활성 데이터는 `site/assets/data/dataset.json`이 가리킨다. Yahoo Finance에서 새로 내려받은 CSV(`Date, …, Close, Adj Close`)로 갱신하려면:

```bash
python3 scripts/prepare_snapshot.py ~/Downloads/^KS200.csv --name kospi200 \
  --instrument "KOSPI 200 지수" --symbol "^KS200" --price close --activate
npm test   # 해시·순서 검사
```

교육용 고정 스냅샷이며 재배포·상업적 이용 조건은 원 출처를 확인해야 한다.

## 실행·검증·배포

```bash
npm test                                   # node --test + python unittest
node scripts/dev_server.mjs 8787           # 로컬 수업 서버 (in-memory D1)
python3 scripts/build_sites_worker.py      # dist/server/index.js + dist/.openai/{hosting.json,drizzle/}
```

`main`에 푸시하면 GitHub Actions가 테스트를 돌린 뒤 `site/`를 **GitHub Pages**에 배포한다(정적 · 투표 서버 없음 → 각 라운드의 "오프라인 공개" 버튼 사용). 실시간 팀 투표·리더보드까지 쓰려면 `dist/`를 Sites + D1에 배포하고 환경 비밀값 `INSTRUCTOR_PASSWORD_HASH`(sha256 hex)와 `SESSION_SIGNING_SECRET`을 설정한다. 저장소에는 비밀값이 없다. 강사 콘솔은 수업 진행 도구이며 보안 수준의 비밀 유지를 주장하지 않는다. 자세한 절차는 [`docs/workshop/deployment.md`](docs/workshop/deployment.md).

## Mesa 입문 예제

`app0.py`~`app6.py`, `mesa_demo.ipynb`는 Python Mesa/Solara 입문 예제(사전학습·강사 시연용)로 그대로 보존한다. 워크숍 당일 실습에는 필요하지 않다.

## 범위와 한계

실제 주문 전송·증권사 연결·자동 투자·GAN/diffusion 학습·딥헤징은 포함하지 않는다. GARCH-t와 경매, 에이전트 시장은 교육용 구현이다. 실제 자료와 일부 검사가 맞는다고 해서 미래 가격을 예측하거나 시장 전체를 재현한 것은 아니다.

# 가짜 주식시장 만들기 — 속이는 팀과 잡아내는 팀

은행 퀀트·리스크 실무자를 위한 **3시간+2시간 권장 참여형 시뮬레이션 워크숍**. 한 번에 5시간으로 압축할 수도 있지만, 토론과 기기 설정 시간을 확보하려면 이틀 운영을 권장한다. 참가자는 코드를 쓰지 않고 조당 노트북 한 대의 브라우저로 실습한다. 하루 종일 한 가지 질문이 반복된다 — **진짜처럼 보이는가, 아니면 검사를 견디는가?**

시뮬레이션을 처음 접하는 참가자는 첫 활동 전에 [`site/guide.html`](site/guide.html)의 10분 개념 가이드를 읽는다. 모형·모수·시드·경로·분포·검증 구간·검사표·ABM을 비전공자 언어로 설명하며, 모든 활동 상단에서 관련 항목으로 다시 이동할 수 있다.

```bash
node scripts/dev_server.mjs 8787      # http://127.0.0.1:8787 · 강사 비밀번호 mesa
```

## 하루를 하나로 묶는 장치 — 인간 GAN 토너먼트

팀은 **생성자**(가짜를 만든다)와 **판별자**(가짜를 잡는다) 역할을 번갈아 맡는다. 세 번의 판별 라운드는 무기가 다르다.

| 라운드 | 무기 | 실제 구간 |
|---|---|---|
| R1 (1교시 끝) | 차트만 | 추정 구간 마지막 150일 |
| R2 (2교시 끝) | 검사표 숫자만 | 검증 구간 전체 |
| R3 (4교시) | 차트 + 검사표 | 수업 중 처음 공개하는 최종 20% |

판별은 선택한 답의 확률 p와 함께 제출한다. 나머지 확률은 두 후보에 균등 배분해 **3범주 Brier loss**를 계산하고, 리더보드에는 읽기 쉬운 보상 `1−loss/2`를 표시한다. 세 라운드는 보정의 원리를 체험하기 위한 공동 문항이지 팀의 보정도를 추정할 표본은 아니다. 2b의 5개 지표 범위 포함 수는 별도 진단이며 순위 점수에 합산하지 않는다. ABM은 참여자 수준의 메커니즘 가설을 표현할 수 있지만 인과를 자동으로 증명하지 않는다.

## 압축 시간표 (300분, 휴식 20분 포함)

아래는 숙련된 강사와 사전 입장 확인을 전제로 한 압축안이다. 첫 운영은 3시간+2시간으로 나누고 Game of Life 문헌·LLM 외부 실행 중 하나를 선택 활동으로 두는 편이 안전하다.

| 시각 | 교시 | 페이지 |
|---|---|---|
| 00:00 | 0 · 사람은 난수를 못 만든다 (20) | `00-random` |
| 00:20 | 1 · 동전에서 주가로 (55): 골턴 보드 → 곱셈 세계 → 첫 GBM → **R1** | `01-galton` `02-gbm` `03-round1` |
| 01:15 | 휴식 (10) | |
| 01:25 | 2 · 검사기를 만들고 모형을 고친다 (60): 공개·보정 → 검사표·순서 섞기 → 수리 작업실 → **R2** | `04-tests` `05-repair` `06-round2` |
| 02:25 | 휴식 (10) | |
| 02:35 | 3 · 사람이 시장이 된다 (25) → Game of Life 창발 맛보기 (10) → 규칙이 시장이 된다 · ABM이라는 분야 (25) | `07-market` `08-life` `09-abm` |
| 03:35 | 4 · 규칙 대신 LLM을 앉히면? (연구 가설 설계) → **R3** 처음 보는 구간 최종전 (45) | `10-llm` `11-round3` |
| 04:20 | 5 · 설명서와 되돌아보기 (40) | `12-final` `leaderboard` |

이틀(3h+2h)로 나눌 때는 1일차 = 0~2교시 + 설명서 v1, 2일차 = 리캡 + 3~5교시. 자세한 진행안은 [`docs/workshop/instructor-guide.md`](docs/workshop/instructor-guide.md).

## 구조

```
site/                 정적 사이트 (외부 CDN 없음, ES 모듈)
  guide.html          초심자를 위한 10분 개념 가이드
  assets/js/          rng · stats · models(GBM/t/GARCH-t/bootstrap) · auction · abm · life · chart · rounds · classroom
  assets/js/pages/    페이지별 스크립트
  assets/data/        KOSPI 200(활성)·SK하이닉스 스냅샷 + 메타데이터, dataset.json, 강사 작성 LLM 가상 예시
worker/index.js       팀 투표·점수·라운드 상태 API (Workers 스타일 fetch, D1)
drizzle/              D1 스키마
scripts/              dev_server.mjs (node:sqlite로 D1 흉내), build_sites_worker.py (배포 번들)
tests/                node --test (핵심 계산) · unittest (정적 사이트 검사)
docs/workshop/        강사 진행안 · 활동지 · 역할 카드 · 경매 규칙 · 설명서 템플릿 · 배포
```

모든 시뮬레이션(GBM, t 충격, GARCH(1,1)-t 최대우도 적합, 블록 재추출, 단일가 경매, 규칙 기반 에이전트 시장)은 **브라우저에서** 실행된다. 서버는 팀 투표·점수·라운드 열기/공개만 담당하며, 서버가 없어도 각 팀 화면은 동작한다(오프라인 공개 버튼).

## 데이터

기본 스냅샷은 **KOSPI 200 지수**(`^KS200`, Yahoo Finance) 1,500거래일(2018‑11‑23 ~ 2024‑12‑30)이다: `site/assets/data/kospi200-daily.csv`. 시간순 60/20/20으로 나누어 추정 구간에서만 모수를 정한다. 최종 20%는 수업 진행상 R3까지 UI에서 숨기지만 공개 저장소의 공개 데이터이므로 보안 시험용 비밀 구간은 아니다. 고부담 평가에는 별도의 비공개 데이터를 서버에서 제공해야 한다.

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

`main`에 푸시하면 GitHub Actions가 테스트를 돌린 뒤 `site/`를 **GitHub Pages**에 배포한다. 실시간 팀 투표를 쓰려면 `dist/`를 Sites + D1에 배포하고 환경 비밀값을 설정한다. 오프라인 공개 버튼은 API 연결이 실패한 경우에만 나타난다. 클래스 코드·클라이언트 계산 점수·UI 잠금은 인증이나 고부담 평가 통제가 아니다. 자세한 절차는 [`docs/workshop/deployment.md`](docs/workshop/deployment.md).

## Mesa 입문 예제

`app0.py`~`app6.py`, `mesa_demo.ipynb`는 Python Mesa/Solara 입문 예제(사전학습·강사 시연용)로 그대로 보존한다. 워크숍 당일 실습에는 필요하지 않다.

## 범위와 한계

실제 주문 전송·증권사 연결·자동 투자·GAN/diffusion 학습·딥헤징은 포함하지 않는다. GARCH-t와 경매, 에이전트 시장은 교육용 구현이다. 실제 자료와 일부 검사가 맞는다고 해서 미래 가격을 예측하거나 시장 전체를 재현한 것은 아니다.

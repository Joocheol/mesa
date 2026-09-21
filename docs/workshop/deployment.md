# 배포와 운영

## 로컬 (리허설·서버 없는 교실)

```bash
node scripts/dev_server.mjs 8787
```

- `site/`를 디스크에서 서빙하고, `worker/index.js`의 API를 in-memory SQLite(D1 흉내)로 실행한다. 서버를 재시작하면 투표가 사라진다.
- 강사 비밀번호 기본값 `mesa`. 바꾸려면 `INSTRUCTOR_PASSWORD=... node scripts/dev_server.mjs`.
- 같은 네트워크의 참가자 노트북이 강사 노트북 IP:8787로 접속하면 실시간 투표가 동작한다.
- 서버 없이 `python3 -m http.server --directory site`로만 열어도 각 팀 화면은 동작한다. 정답 공개는 각 라운드 페이지의 "오프라인 공개", R3는 "오프라인 봉인 해제"를 강사가 누른다.

## Sites + D1 배포

```bash
python3 scripts/build_sites_worker.py
# dist/server/index.js (사이트 자산 내장) · dist/.openai/hosting.json · dist/.openai/drizzle/*.sql
```

환경 비밀값(저장소에 넣지 않음):

| 이름 | 값 |
|---|---|
| `INSTRUCTOR_PASSWORD_HASH` | `echo -n '비밀번호' \| sha256sum` 의 hex |
| `SESSION_SIGNING_SECRET` | 임의의 긴 문자열 |

D1 바인딩 이름은 `DB`. 마이그레이션은 `drizzle/0000_classroom.sql`.

## API 요약

| 경로 | 설명 |
|---|---|
| `GET /api/vote/state?class_code&activity_id` | 라운드 열림/공개/제출 수 (+공개 시 분포·정답) |
| `POST /api/vote` | 팀 판별 제출 (열려 있고 비공개일 때만) |
| `POST /api/score` | 생성 점수 (`repair`, `abm`) |
| `GET /api/leaderboard?class_code` | 공개된 라운드의 투표 + 점수 |
| `POST /api/instructor/login` | 쿠키 발급 (8시간) |
| `GET /api/instructor/results`, `/scores` · `POST /state`, `/reset` | 강사 조작 |

라운드 상태 기본값: R1·R2 열림, **R3 닫힘(봉인)**. 초기화도 같은 기본값으로 돌아간다.

## 새 회차 준비

1. 강사 콘솔에서 "이 수업의 모든 투표·점수 초기화" 또는 새 수업 코드 사용.
2. 참가자 브라우저는 `join.html` 하단의 "진행 상태 모두 지우기".
3. 데이터를 바꾸려면 `site/assets/data/`의 CSV·메타데이터를 교체하고 `tests/test_static_site.py`의 해시 검사를 통과시킨다.

# Step 3: report-text

> **TASK-30** 일일 · 월말 보고 문장 · **REQ-030** · AC-030.1 ~ AC-030.4
> Phase 6 `precheck-6-stats` · Step 3 — `docs/precheck/plan.md` §6
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-30 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-030에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-030.1**: 일 운영 숫자로 `formatReport(day | month)`가 원본 `reports.py`의 `format_report`·`report_notes`와 같은 글(골든)
- **AC-030.2**: 환불·변경수납·예치금이 있는 날은 원본처럼 그 날 금액만 '확인 필요'로 두고 나머지 숫자는 그대로
- **AC-030.3**: 오늘보다 뒤 날짜는 원본처럼 만들지 않는다
- **AC-030.4**: `lib/report/reportText.ts`의 입력 모양은 집계 숫자만(환자 줄·차트번호 칸이 없다)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·017·018·019
- `/docs/precheck/plan.md` §6 (Phase·Step 순서)
- `/specs/precheck/requirements.md` — REQ-030
- `/specs/precheck/design.md` — 2절 표(일일·월말 보고 문장 원본), 3절(`lib/report/reportText.ts`), 10절(골든: Python)
- `/specs/precheck/tasks.md` — TASK-30 (수정 범위·메모)
- `/src/lib/analytics/dates.ts`
- 이전 step에서 만든 파일:
  - `src/workers/precheck/statsRows.ts`(`toOperationalDays`), `src/types/precheck.ts`(`OperationalDay`) (Step 0)
  - `scripts/precheck/golden/*` (Python 골든 실행 글 방식, Step 2)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 브랜치 `main`, 폴더 `YangjiBareun_사전점검/`, 커밋 `2a1069b` (README 1.24.5)
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 이 사본은 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다(GitHub 비교로 확인). 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`·`*Tests.cs`)은 모두 가짜 자료다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `medicore/reports.py` (`format_report`·`report_notes`)
  - `vendor/drbit_export/OperationalReportData.cs` (`SetFinanceUnconfirmed`: 환불·변경수납·예치금 날의 금액 '확인 필요')
  - `tests/test_reports.py`, `tools/test_report_payment_sql.py`, `tools/smoke_reports.py`

## 수정 범위 (tasks.md TASK-30)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/report/reportText.ts`
  - `src/lib/report/reportText.test.ts`
  - `scripts/precheck/golden/*`
  - `fixtures/precheck/golden/report-*.json`
  - `src/types/report.ts`
- Tests:
  - `src/lib/report/reportText.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **골든 테스트**: 같은 가짜 자료를 원본(양지바른 `2a1069b`)과 우리 함수에 넣어 결과가 순서까지 같은지 깊은 비교한다. 원본 결과는 `scripts/precheck/golden/`의 스크립트로 한 번 만들어 `fixtures/precheck/golden/<이름>.json`에 커밋한다. JS 원본은 `node:vm`으로(원본 시험 `tests/test_claim_html.py`가 스크립트를 꺼내는 방식과 같게), Python 원본은 `python3 -I`로 돌린다. 골든 파일 머리에 `{ "source": "seoseungkwan/shared@2a1069b", "file": …, "entry": … }`를 적는다. 일부러 다르게 한 것만 `knownDiffs`에 이유와 함께 적고, 적지 않은 차이는 실패다. 골든 시험은 원본 없이 커밋한 골든 파일과 비교해서 돈다(골든을 다시 만들 때만 `YANGJI_SRC`가 필요) (design.md 10절)
- **금액**: 원 단위 정수. 반올림하지 않고 원 미만은 항목마다 버린다. 합계는 항목 금액의 합 (CLAUDE.md, ADR-008)
- **날짜는 한 곳**: 날짜 계산은 `src/lib/analytics/dates.ts`(한국 날짜, `YYYY-MM-DD`). 시험은 `TZ=Asia/Seoul`에서 돈다 (CLAUDE.md)
- **원본은 저장소 밖**: 원본 경로는 `YANGJI_SRC` 환경 변수나 스크립트 인자로만 받는다. 원본 파일 자체(예: `mx999_v22.html`)를 저장소에 복사·커밋하지 않는다. 커밋하는 것은 옮긴 코드, 옮긴 표, 골든 결과, design.md 10절이 정한 원본 SQL 사본뿐이다 (tasks.md 머리말)
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험은 `fixtures/`의 가짜 자료만 쓴다(이름 '가상환자NN', 차트번호 `9`로 시작하는 6자리, 전화 `010-0000-NNNN`). 실제 비트 내보내기·청구 파일(`*.GHP`·`*.CAR`)을 커밋하지 않는다 (CLAUDE.md, design.md 10절)

## 작업

### 1. 입력 모양 (`src/types/report.ts`)
```ts
export type ReportDay = { date: string; /* 원본 reports.py가 쓰는 집계 칸만: 환자 수·신환·치료 건수·금액 등 */ financeUnconfirmed: boolean }
export type ReportInput = { kind: 'day'; day: ReportDay } | { kind: 'month'; month: string; days: ReportDay[] }
```
- 차트번호·이름·환자 줄 칸을 두지 않는다(AC-030.4). 시험이 타입 칸 이름을 검사한다(예: 칸 목록에 `chart`·`name`·`rows`가 없음)

### 2. 코드 (`src/lib/report/reportText.ts`)
```ts
export function formatReport(input: ReportInput, today: string): { text: string; unconfirmedLines: number[] } | { error: 'future-date' }
```
- 원본 `format_report`·`report_notes` 줄을 옮긴다. 환불·변경수납·예치금이 있는 날은 그 날 금액만 '확인 필요'(원본 `SetFinanceUnconfirmed`와 같은 뜻), 나머지 숫자는 그대로(AC-030.2). '확인 필요' 줄 번호를 함께 돌려준다(화면이 표시한다, TASK-31)
- 오늘보다 뒤 날짜면 만들지 않는다(AC-030.3). 오늘은 인자로 받는다
- 금액은 원 단위 정수, 반올림 없음

### 3. 골든
- `scripts/precheck/golden/reports.py`(작은 실행 글)가 `medicore/reports.py`를 `python3 -I`로 가짜 집계 숫자에 돌려 `fixtures/precheck/golden/report-*.json`에. 일·월, 환불 날, 미래 날 사례

### 4. 시험 (`reportText.test.ts`)
- AC-030.1(골든 비교), AC-030.2, AC-030.3, AC-030.4(입력 칸 검사)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.3 chrome.runtime이 없으면 no-extension', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-30 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-30 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/lib/report/reportText.test.ts
python3 ~/.claude/harness/bin/tdd-run TASK-30 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-030.1 ~ AC-030.4이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/precheck-6-stats/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 보고 입력에 차트번호·이름·환자 줄을 넣지 마라. 이유: 보고 문장은 복사해 밖(메신저 등)으로 나간다. 집계 숫자만(AC-030.4)
- 환불·예치금 날의 금액을 계산해 '맞춰' 보이지 마라. 이유: 원본처럼 '확인 필요'로 둔다. 틀린 금액이 보고되면 안 된다(AC-030.2)
- 원본 문장 모양을 다듬지 마라. 이유: 골든과 같아야 한다(AC-030.1)
- 기존 테스트를 깨뜨리지 마라. 이유: 통계 시험이 계속 통과해야 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다

# Step 2: report-text

> **TASK-10** 원장님 보고 문장 (골든) · **REQ-510** · AC-510.1 ~ AC-510.4
> Phase 3 · 숫자와 글 `stats-3-numbers` · Step 2 — `specs/stats/tasks.md`
> 명세 `specs/stats/`가 승인된 뒤에만 시작한다(`python3 ~/.claude/harness/bin/sdd status stats`). 이 step은 TASK-10 하나만 한다. 다른 TASK의 일은 하지 않는다.
> 옮겨 옴: precheck REQ-030 — 사전점검 명세의 같은 몫은 그 명세가 다음에 뺀다. 이 step은 `specs/stats`만 따른다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/stats/requirements.md`의 REQ-510(원장님 보고 문장 (`lib/report/reportText.ts`))에 있다. 아래는 같은 글이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-510.1**: Given 보고 숫자 한 벌(일일·월말)과 병원 이름, When `formatReport`, Then 원본 `medicore/reports.py`의 `format_report`·`report_notes`와 같은 글·안내다(골든 `fixtures/stats/golden/report-*.json`, 원본을 `python3 -I`로 돌림). 일부러 다르게 한 곳은 골든의 `knownDiffs`에 이유와 함께 적는다: 금액과 건당진료비는 원 미만을 버린다(원본은 반올림, CLAUDE.md 금액 규칙). 적지 않은 차이는 실패다
- **AC-510.2**: Given 금액 확인 필요 벌, When 만들면, Then 원본처럼 금액 줄은 "확인 필요"이고 다른 숫자는 그대로이며, 돌려주는 `unconfirmedLines`에 그 줄 번호들이 있다
- **AC-510.3**: Given 오늘보다 뒤 날짜·달, When 만들려 하면, Then 글을 만들지 않고 `{ error: 'future-date' }`다. `{ ok: false }` 벌이면 `{ error: 'unconfirmed', reason }`이다
- **AC-510.4**: Given `src/types/report.ts`의 입력 모양, When 열쇠를 보면, Then 집계 숫자·기간·병원 이름뿐이다(`chart`·`name`·`rows`·`patient` 칸 없음). 시험이 열쇠 목록을 못 박는다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/specs/stats/requirements.md` — REQ-510
- `/specs/stats/design.md` — '구성 요소 / 인터페이스' TASK-10, '결정과 트레이드오프'(보고 숫자는 저장하지 않는다)
- `/specs/stats/tasks.md` — TASK-10 (수정 범위·메모)
- `/src/types/report.ts` (TASK-5의 `ReportNumbers`)
- `/src/lib/analytics/dates.ts`(요일)
- `/src/components/charts/format.ts` (숫자 글자 — 원본 글과 다르면 원본을 따른다)
- 이전 step에서 만든 파일: TASK-5 (`ReportNumbers` 모양)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 커밋 `2a1069b`, 폴더 `YangjiBareun_사전점검/`
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다. 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`·`*Tests.cs`)은 모두 가짜 자료다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `medicore/reports.py` (`format_report`·`report_notes`·`validate_report`·`validate_period`·`_won`·`TREATMENTS`)
  - `tests/test_reports*.py` 등 보고 시험(있으면 사례로)
  - `vendor/drbit_export/OperationalReportData.cs` (`SetFinanceUnconfirmed` 사유 글)

## 수정 범위 (tasks.md TASK-10)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/report/reportText.ts`
  - `src/lib/report/reportText.test.ts`
  - `src/types/report.ts`
  - `scripts/stats/golden/reports.py`
  - `fixtures/stats/golden/report-*.json`
- Tests:
  - `src/lib/report/reportText.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **골든 테스트**: 같은 가짜 입력을 원본(양지바른 `2a1069b`)과 우리 함수에 넣어 결과가 순서까지 같은지 깊은 비교한다. 원본 결과는 `scripts/stats/golden/`의 작은 실행 글로 한 번 만들어 `fixtures/stats/golden/<이름>.json`에 커밋한다. Python 원본은 `python3 -I`로 돌린다. 골든 파일 머리에 `{ "source": "seoseungkwan/shared@2a1069b", "file": …, "entry": …, "knownDiffs": [...] }`를 적는다. 일부러 다르게 한 것만 `knownDiffs`에 이유와 함께 적고, 적지 않은 차이는 실패다. 시험은 원본 없이 커밋한 골든 파일과 견주어 돈다(골든을 다시 만들 때만 `YANGJI_SRC`가 필요)
- **금액**: 원 단위 정수. 반올림하지 않고 원 미만은 항목마다 버린다. 합계는 항목 금액의 합 (CLAUDE.md, plan.md §5)
- **날짜는 한 곳**: 날짜 계산은 `src/lib/analytics/dates.ts`(한국 날짜, `YYYY-MM-DD`). 시험은 `TZ=Asia/Seoul`에서 돈다 (CLAUDE.md)
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험은 `fixtures/`의 가짜 자료와 시험 안에서 만든 가짜 값만 쓴다(차트번호는 `9`로 시작하는 6자리 가짜, 이름·전화·주민번호 없음). 차트번호·주민번호 모양은 소스에 통째로 쓰지 않고 조각을 이어 만든다(stats-core 규칙). 실제 비트 내보내기를 커밋하지 않는다 (CLAUDE.md)
- **원본은 저장소 밖**: 원본 경로는 `YANGJI_SRC` 환경 변수나 스크립트 인자로만 받는다. 원본 파일 통째를 저장소에 복사·커밋하지 않는다. 커밋하는 것은 옮긴 코드, 원본 SQL 문장 사본(`original-sql/*.sql`), 골든 결과뿐이다 (specs/stats/tasks.md 머리말)

## 작업

### 1. 코드 (`src/lib/report/reportText.ts`, 환자 구역 밖 — 숫자만 받는다)
- design.md TASK-10 시그니처. 원본 `format_report`·`report_notes`의 줄을 그대로 옮긴다(제목 줄·띄어쓰기·치료 차례(일일·월말이 다름)·LA 줄·"신환 내원경로" 고정 줄·"고생하셨습니다 !!")
- 금액·건당진료비: 원 미만 버림(`Math.floor`), 천 단위 쉼표 + "원"(AC-510.1 `knownDiffs`)
- 확인 필요(AC-510.2): 원본처럼 금액 자리를 "확인 필요"로, 사유 줄, `unconfirmedLines` = 그 줄 번호(0부터)
- 미래(AC-510.3): 일일은 그 날이 오늘보다 뒤, 월말은 그 달이 이번 달보다 뒤면 `{ error: 'future-date' }`. `ok: false` 벌은 `{ error: 'unconfirmed', reason }`

### 2. 모양 (`src/types/report.ts`)
- 입력 열쇠는 숫자·기간·병원 이름뿐. 시험이 `Object.keys`로 못 박는다(AC-510.4)

### 3. 골든 (`scripts/stats/golden/reports.py` → `fixtures/stats/golden/report-*.json`)
- 원본 `format_report`·`report_notes`를 `python3 -I`로: 일일 보통 날, 일일 확인 필요, 월말 LA 있음, 월말 LA 없음, 총환 0명. 입력은 원본 `validate_report`를 지나는 가짜 값(병원 이름 "가상의원", `profile_id`·`institution_code`는 가짜 모양)
- `knownDiffs`: 원 미만 금액 버림(원본 `ROUND_HALF_UP`) — 골든 입력에 원 미만 금액 사례를 하나 넣어 차이가 그 줄뿐인지 시험이 본다

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-501.2 31일째에만 다시 오면 30일 재방문이 아니다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-10 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-10 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/lib/report/reportText.test.ts
python3 ~/.claude/harness/bin/tdd-run TASK-10 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status stats`에서 AC-510.1 ~ AC-510.4이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가(새 패키지 없음)?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/stats-3-numbers/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (원본 접근, 목업 승인, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 보고 입력에 차트번호·이름·환자 줄을 넣지 마라. 이유: 보고 문장은 복사해 밖(메신저 등)으로 나간다. 집계 숫자만(AC-510.4)
- 확인 필요 날의 금액을 계산해 '맞춰' 보이지 마라. 이유: 틀린 금액이 보고되면 안 된다(AC-510.2)
- 원본 문장 모양을 다듬지 마라(`knownDiffs` 밖). 이유: 골든과 같아야 한다(AC-510.1)
- 금액을 반올림하지 마라. 이유: 원 미만은 버린다(CLAUDE.md)
- 기존 테스트를 깨뜨리지 마라. 이유: 지금 통계 엔진·청구·탭 틀 시험이 계속 통과해야 한다(이 TASK의 Files에 있는 시험만, 정한 칸만 고친다)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- `specs/precheck/`·`phases/precheck-*`를 고치지 마라. 이유: 청구 브랜치가 그 파일을 가진다. 그쪽이 할 일은 `specs/stats/design.md` '사전점검 명세가 할 일'에 적혀 있다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 새 npm·NuGet 패키지를 넣지 마라. 이유: `package.json`·csproj가 수정 범위 밖이고 ADR 기술 스택 밖이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`plan.md`를 고치지 마라 · `docs/*`. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다

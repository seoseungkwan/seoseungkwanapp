# Step 1: rx-label-code

> **TASK-5** 타입과 입력 묶음·지문 — 고친 점: 빈 처방 이름은 코드로 · **REQ-505** · AC-505.6
> Phase 3b `ai-report-3b-fixes` · Step 1 — `specs/ai-report/tasks.md` 머리말 '할 순서' 3b
> 명세 `specs/ai-report/`는 사용자가 고친 명세(requirements.md '고친 점', 2026-11-01)를 다시 승인한 뒤에만 이 step을 돌린다. 이 step은 TASK-5의 '할 일(3b)'만 한다. 다른 TASK의 일은 하지 않는다.
> **병렬 가능**: 이 phase의 Step 0~4는 서로의 결과를 쓰지 않고 수정 범위가 겹치지 않아 동시에 돌 수 있다(Step 2의 답 검사는 처방 지표 이름의 모양 `처방 '<이름>' 환자`만 보므로 이 step의 변경과 부딪히지 않는다). `npm install`은 없다. 같은 폴더에서 동시에 돌면 `npm run build`(`.next/`)·`npm test`는 한 번에 하나만 돌린다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/ai-report/requirements.md`의 REQ-505에 있다. 시험 이름에 이 AC ID를 넣는다.

- **AC-505.6**: 고른 달 처방 이름이 빈 글자이거나 빈칸뿐인 처방이면 그 처방 지표 이름은 `처방 '<코드>' 환자`다(이름은 지금처럼 고른 달 것을 본다). 이름이 빈 글자인 자료와 빈칸뿐인 자료는 같은 지표 이름·같은 지문이 되고, 이름이 있는 처방의 지표 이름은 그대로다
- AC-505.1 ~ AC-505.5의 기존 시험(정해 둔 지문 값 `b0f04865…` 포함)은 그대로 통과해야 한다

## 읽어야 할 파일

- `/CLAUDE.md`
- `/specs/ai-report/requirements.md` — '고친 점' 1, REQ-505
- `/specs/ai-report/design.md` — '지표 목록' 표 7번 줄과 그 아래 설명(빈 이름이면 지문이 바뀌는 까닭)
- `/specs/ai-report/tasks.md` — 머리말 '모든 TASK 공통'·'할 순서' 3b, TASK-5 '할 일(3b)'
- 이전 step에서 만든 파일:
  - `src/lib/ai/input.ts` (`buildReportInput` — 처방 지표를 만드는 `rx:` 부분, Phase 1 Step 2)
  - `src/lib/ai/input.test.ts` (시험 자료 만드는 법, 정해 둔 지문 시험)
  - `src/types/aiReport.ts` (읽기만)
  - `src/lib/payload/validate.ts` (읽기만 — 처방 이름이 빈 글자여도 검사를 통과한다)

## 수정 범위 (tasks.md TASK-5)

- Files: `src/types/aiReport.ts`, `src/lib/ai/input.ts`, `src/lib/ai/input.test.ts`
- Tests: `src/lib/ai/input.test.ts`
- TDD: required
- **이 step은 `src/lib/ai/input.ts`·`src/lib/ai/input.test.ts`만 고친다.** 타입(`src/types/aiReport.ts`)은 바꾸지 않는다

## 꼭 지킬 규칙 (CRITICAL)

- **순수 함수**: `src/lib/ai/`는 네트워크·DB·SDK·`node:` 모듈을 쓰지 않는다(AC-513.3)
- **바꾸는 것은 처방 지표 이름 하나**: 지표 ID(`rx:<code>`)·순서·값·그룹·동네·입력의 다른 칸은 그대로. 이름이 있는 자료의 입력과 지문은 한 글자도 달라지지 않아야 한다(정해 둔 지문 시험이 증명한다)
- **지어낸 숫자는 시험 파일 안에만**, 처방코드는 `FAKE-…` 같은 지어낸 글자

## 작업

### 규칙 (design '지표 목록' 7)
- 처방 지표 이름 = `처방 '<이름>' 환자`. 이름은 고른 달 `rx[]`의 그 처방 이름(지금 그대로)
- 그 이름이 빈 글자이거나 빈칸뿐이면(`name.trim() === ''`) 이름 대신 처방 코드를 쓴다 → `처방 '<코드>' 환자`
- 예: 코드 `FAKE-X09`, 이름 `''` 또는 `'   '` → `처방 'FAKE-X09' 환자`. 이름 `'가짜 처방 가'` → `처방 '가짜 처방 가' 환자`(그대로)
- 이름이 비어 있지 않으면 앞뒤 빈칸을 자르지 않고 지금처럼 그대로 쓴다

### 시험 (`src/lib/ai/input.test.ts`에 더한다)
- AC-505.6: 고른 달에 이름 `''`인 처방 → 라벨이 코드 라벨
- AC-505.6: 이름 `'   '`(빈칸뿐)인 처방 → 코드 라벨. 다른 것은 같고 이름만 `''`·`'   '`로 다른 두 자료의 입력(`toEqual`)과 `reportFingerprint`가 같다
- AC-505.6: 이름이 있는 처방은 그대로. 고른 달에서 이름이 비고 지난달에는 이름이 있어도 라벨은 코드다(이름은 고른 달 것만 본다)
- 시험 자료는 `validateMonthPayload`를 통과하는 가짜 자료로 만든다(파일 안 기존 도우미를 쓴다)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-505.6 고른 달 처방 이름이 빈 글자면 지표 이름에 코드를 쓴다', …)`
2. `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-5 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일(`src/lib/ai/input.ts`)을 고칠 수 없다(훅이 막는다)
3. 구현하고 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-5 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

### 이 PC(윈도우)에서
- 하네스 도구는 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/<도구>`로 부른다
- `execute.py`는 이 PC에서 쓰지 않는다. 오케스트레이터가 step마다 새 세션을 연다. 이 세션은 이 step 하나만 하고 끝낸다
- 파일을 읽어 줄로 나눌 때는 늘 `split(/\r?\n/)`
- `npm test` 기준선: 46개가 이미 실패한다(2026-11-01). 실패 수가 46개를 넘지 않고, 이 step의 시험은 모두 통과해야 한다

## Acceptance Criteria

```bash
npx vitest run src/lib/ai/input.test.ts
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-5 --expect green
npm run lint -- --max-warnings=0
npm run build   # 같은 폴더에서 다른 step과 동시에 돌고 있으면 한 번에 하나만
npm test        # 실패는 기준선 46개 이하
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/sdd status ai-report
```

- 위 커맨드가 모두 에러 없이 끝나야 한다(`npm test`는 기준선 실패만 남아야 한다)
- `sdd status ai-report`에서 AC-505.6이 `src/lib/ai/input.test.ts`와 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 체크리스트:
   - 이름이 있는 자료의 입력·지문이 그대로인가? (정해 둔 지문 시험 통과)
   - `src/lib/ai/input.ts`가 여전히 순수 함수인가? (import는 `lib/analytics/dates`와 타입만)
3. 결과에 따라 `phases/ai-report-3b-fixes/index.json`의 Step 1을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python -X utf8`로 JSON을 읽고 써서 고친다(편집 도구는 훅이 막는다). 같은 phase의 다른 step도 이 파일을 고칠 수 있으니 읽은 바로 뒤에 자기 step 칸만 바꿔 쓴다
- `summary`에는 바꾼 라벨 규칙, 더한 시험 수, RED→GREEN, 기준선 실패 수를 한 줄로 담는다

## 금지사항

- 지표 ID·순서·값·다른 라벨을 바꾸지 마라. 이유: 지문이 바뀌면 이름이 있는 자료의 리포트도 '숫자가 바뀌었어요'로 보인다
- `ReportInput`·`ReportMetric`에 칸을 더하지 마라(`src/types/aiReport.ts` 그대로). 이유: 모든 입력의 지문이 바뀌고 Step 2의 답 검사와 겹친다
- `lib/payload`·`lib/analytics`(환자 자료 구역)를 고치지 마라. 이유: 읽어서 쓰기만 한다(tasks.md 공통)
- `specs/` 아래 파일을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀린다. 명세와 다른 점을 찾으면 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊긴다
- `eslint-disable`로 규칙을 피하지 마라. 이유: 린트 경고 0이 끝 조건이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 오케스트레이터가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니다

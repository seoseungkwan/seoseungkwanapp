# Step 2: output-names-blank

> **TASK-7** AI 답 검사 — 고친 점: 이름 안의 숫자 허용, 폭 없는 글자, `__proto__` · **REQ-507** · AC-507.6 ~ AC-507.9
> Phase 3b `ai-report-3b-fixes` · Step 2 — `specs/ai-report/tasks.md` 머리말 '할 순서' 3b
> 명세 `specs/ai-report/`는 사용자가 고친 명세(requirements.md '고친 점', 2026-11-01)를 다시 승인한 뒤에만 이 step을 돌린다. 이 step은 TASK-7의 '할 일(3b)'만 한다. 다른 TASK의 일은 하지 않는다.
> **병렬 가능**: 이 phase의 Step 0~4는 서로의 결과를 쓰지 않고 수정 범위가 겹치지 않아 동시에 돌 수 있다. 이 step은 지표 label의 정해진 모양만 본다 — Step 1(빈 처방 이름 → 코드)이 끝났든 아니든 결과가 같다. `npm install`은 없다. 같은 폴더에서 동시에 돌면 `npm run build`(`.next/`)·`npm test`는 한 번에 하나만 돌린다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/ai-report/requirements.md`의 REQ-507에 있다. 시험 이름에 이 AC ID를 넣는다.

- **AC-507.6**: 입력 지표 이름에 글자와 숫자가 함께 든 이름(예: 처방 그룹 '도수치료2', 처방 'MRI 3T', 동네 '역삼1동')이 있고 카드 문장이나 요약이 그 이름을 글자 그대로 쓰면, 그 이름 안의 숫자는 숫자 규칙에 걸리지 않는다. 한 이름이 다른 이름을 품어도(예: '물리치료1'과 '물리치료12') 긴 이름부터 지워 둘 다 걸리지 않는다
- **AC-507.7**: 같은 입력에서 이름 밖 숫자("역삼1동 환자가 524명"), 바꿔 쓴 이름('도수치료 2'), 숫자·기호뿐인 이름(동네 '1', 처방 '2-3')의 숫자는 그대로 숫자 규칙 어김이다
- **AC-507.8**: 요약이나 카드 문장이 빈칸과 폭 없는 글자(U+200B~U+200D·U+2060·U+FEFF)뿐이면 빈 글자로 보아 1자 기준을 못 넘어 null. 앞뒤의 폭 없는 글자는 빈칸처럼 떼고 길이를 잰다
- **AC-507.9**: JSON 답의 맨 위나 카드 안에 `"__proto__"` 열쇠가 있으면 null(남는 칸)
- AC-507.1 ~ AC-507.5의 기존 시험은 그대로 통과해야 한다

## 읽어야 할 파일

- `/CLAUDE.md` (AI 답은 글자로만 그린다)
- `/specs/ai-report/requirements.md` — 배경 8, '고친 점' 3·7, REQ-507
- `/specs/ai-report/design.md` — 'AI 답 검사' 1·2·4(숫자 규칙 1~3과 그 아래 설명), '지표 목록' 6~8(label 모양), '결정과 트레이드오프'의 '이름 안의 숫자는 허용'
- `/specs/ai-report/tasks.md` — 머리말 '모든 TASK 공통'·'할 순서' 3b, TASK-7 '할 일(3b)'
- 이전 step에서 만든 파일:
  - `src/lib/ai/output.ts` (`hasForbiddenNumber`·`trimmedText`·`exactly`·`parseAiReport`, Phase 3 Step 0)
  - `src/lib/ai/output.test.ts` (시험 입력 만드는 법)
  - `src/lib/ai/input.ts` (읽기만 — label을 만드는 모양: `처방 그룹 '<이름>' 환자|신환|재진`, `처방 '<이름>' 환자`, `동네 '<이름>' 환자`)
  - `src/types/aiReport.ts` (읽기만)

## 수정 범위 (tasks.md TASK-7)

- Files: `src/lib/ai/output.ts`, `src/lib/ai/output.test.ts`
- Tests: `src/lib/ai/output.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **순수 함수**: `src/lib/ai/`는 네트워크·DB·SDK·`node:` 모듈을 쓰지 않는다(AC-513.3)
- **AI 답은 믿지 않는다**: 모양이 어긋나면 고쳐 쓰지 않고 null, 숫자 규칙을 어긴 카드는 버린다(지금 원칙 그대로)
- **이름은 label에서 꺼낸다**: `ReportInput`·`input.ts`는 바꾸지 않는다(Step 1과 겹치지 않게, 지문이 바뀌지 않게)
- **숫자뿐인 이름은 허용 목록에 넣지 않는다**: 이름 '1'이 문장의 모든 1을 허용하게 되므로

## 작업

### 1. 이름 꺼내기 (design 'AI 답 검사' 4-1)
- `input.metrics` 가운데 지표 ID가
  - `group:`로 시작 → label이 `처방 그룹 '`로 시작하고 `' 환자`·`' 신환`·`' 재진` 가운데 하나로 끝나면 그 사이
  - `rx:`로 시작 → label이 `처방 '`로 시작하고 `' 환자`로 끝나면 그 사이
  - `region:`으로 시작 → label이 `동네 '`로 시작하고 `' 환자`로 끝나면 그 사이
- 앞뒤 정해진 글자 길이로 뗀다(가운데 `'`를 찾지 않는다 — 이름에 `'`가 있어도 된다). 모양이 안 맞는 label은 건너뛴다
- 글자(`/\p{L}/u`)와 숫자(`/\p{N}/u`)가 **둘 다** 있는 이름만 남긴다. 같은 이름은 한 번만. 긴 이름부터(길이 내림차순) 정렬

### 2. 숫자 규칙 (차례대로, 요약·카드 문장 둘 다)
1. 이름 지우기: 긴 이름부터, 글자에서 그 이름이 나오는 곳을 모두 `' '`(빈칸 하나)로 바꾼다. 정규식이 아니라 글자 그대로 찾는다(예: `split(name).join(' ')`)
2. 허용 낱말 지우기: 지금 그대로(`/\d{4}년/g`, `/\d{1,2}월/g`, `14일`, `7일` → `' '`)
3. `/\p{N}/u`가 남으면 어김
- `hasForbiddenNumber(text)`는 이름 목록을 두 번째 인자로 받게 바꿔도 된다. 기존 시험이 한 인자로 부르므로 기본값(빈 목록)을 둔다. 예: `hasForbiddenNumber(text: string, names: readonly string[] = [])`

### 3. 길이 재기 (design 'AI 답 검사' 2)
- 앞뒤에서 빈칸(`\s`)과 폭 없는 글자(U+200B·U+200C·U+200D·U+2060·U+FEFF)를 뗀다. 예: `/^[\s\u200B-\u200D\u2060\uFEFF]+|[\s\u200B-\u200D\u2060\uFEFF]+$/g`
- 뗀 글자가 1~최대 자(요약 200, 카드 120)면 그 글자를 쓰고, 아니면 null. 가운데 글자는 건드리지 않는다

### 4. `__proto__` (design 'AI 답 검사' 1)
- `JSON.parse('{"__proto__":…}')`는 그 열쇠를 자기 칸으로 만든다 → 지금 `exactly()`가 남는 칸으로 막을 것이다. 시험으로 고정한다(맨 위에 셋째 열쇠로, 카드 안에 넷째 열쇠로, 그리고 정해진 열쇠 하나를 `__proto__`로 바꿔 둔 경우)

### 5. 시험 (`src/lib/ai/output.test.ts`에 더한다)
- 시험 입력: 글자와 숫자가 든 이름을 가진 가짜 자료(그룹 이름 '도수치료2', 처방 이름 'MRI 3T', 동네 '역삼1동', 그룹 '물리치료1'·'물리치료12', 숫자뿐인 동네 '1'·처방 '2-3')로 `buildReportInput`을 쓰거나, `ReportMetric`을 손으로 써서 만든다. 처방코드는 `FAKE-…`
- AC-507.6: 카드 문장·요약에 이름을 그대로 쓰면 카드가 남고 요약도 통과. '물리치료12'를 쓴 문장도 통과(긴 이름부터). `hasForbiddenNumber`를 직접 부르는 시험도 둔다
- AC-507.7: "역삼1동 환자가 524명" → 그 카드가 빠진다. '도수치료 2' → 빠진다. 숫자뿐인 이름 '1'·'2-3'을 쓴 문장 → 빠진다. 요약이 이름 밖 숫자를 쓰면 null
- AC-507.8: 요약 `'\u200B\u200B'`·`' \uFEFF '` → null. 카드 문장 `'\u2060'` → null. 앞뒤에 폭 없는 글자가 붙은 정상 문장은 떼어 낸 글자로 돌려준다
- AC-507.9: `"__proto__"` 열쇠가 든 JSON 답 글자 → null

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름에 AC ID를 넣는다. 예: `it('AC-507.6 자료에 있는 이름 안의 숫자는 숫자 규칙에 걸리지 않는다', …)`
2. `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-7 --expect red` 로 실패(RED)를 확인하고 기록한다(AC-507.9 시험은 지금 코드로도 통과할 수 있다 — 다른 새 시험이 실패하면 된다). RED 기록 전에는 `src/lib/ai/output.ts`를 고칠 수 없다(훅이 막는다)
3. 구현하고 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-7 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

### 이 PC(윈도우)에서
- 하네스 도구는 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/<도구>`로 부른다
- `execute.py`는 이 PC에서 쓰지 않는다. 오케스트레이터가 step마다 새 세션을 연다. 이 세션은 이 step 하나만 하고 끝낸다
- 파일을 읽어 줄로 나눌 때는 늘 `split(/\r?\n/)`
- `npm test` 기준선: 46개가 이미 실패한다(2026-11-01). 실패 수가 46개를 넘지 않고, 이 step의 시험은 모두 통과해야 한다

## Acceptance Criteria

```bash
npx vitest run src/lib/ai/output.test.ts
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-7 --expect green
npm run lint -- --max-warnings=0
npm run build   # 같은 폴더에서 다른 step과 동시에 돌고 있으면 한 번에 하나만
npm test        # 실패는 기준선 46개 이하
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/sdd status ai-report
```

- 위 커맨드가 모두 에러 없이 끝나야 한다(`npm test`는 기준선 실패만 남아야 한다)
- `sdd status ai-report`에서 AC-507.6 ~ AC-507.9가 `src/lib/ai/output.test.ts`와 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 체크리스트:
   - 숫자뿐인 이름이 허용 목록에 들어가지 않는가? 이름 밖 숫자는 여전히 걸리는가?
   - 근거 줄은 여전히 `basisLine`으로만 만드는가? (AI 글자에서 숫자를 꺼내 쓰지 않는다)
   - `src/lib/ai/output.ts`가 순수 함수인가?
3. 결과에 따라 `phases/ai-report-3b-fixes/index.json`의 Step 2를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python -X utf8`로 JSON을 읽고 써서 고친다(편집 도구는 훅이 막는다). 같은 phase의 다른 step도 이 파일을 고칠 수 있으니 읽은 바로 뒤에 자기 step 칸만 바꿔 쓴다
- `summary`에는 `hasForbiddenNumber` 새 모양, 이름 꺼내는 규칙, 길이 재기, 더한 시험 수, RED→GREEN을 한 줄로 담는다

## 금지사항

- `input.ts`·`src/types/aiReport.ts`를 고치거나 `ReportInput`에 이름 칸을 더하지 마라. 이유: 지문이 바뀌고 Step 1과 겹친다
- 이름을 정규식으로 만들어 찾지 마라. 이유: 이름 안의 `.`·`(`·`+` 같은 글자가 정규식 뜻이 된다
- 숫자 규칙을 어긴 카드를 고쳐 쓰지 마라(숫자만 지우고 남기기 등). 이유: 버리는 것이 설계다
- `specs/` 아래 파일을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀린다. 명세와 다른 점을 찾으면 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊긴다
- `eslint-disable`로 규칙을 피하지 마라. 이유: 린트 경고 0이 끝 조건이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 오케스트레이터가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니다

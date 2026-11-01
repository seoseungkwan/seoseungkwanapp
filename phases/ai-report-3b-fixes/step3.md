# Step 3: prompt-names

> **TASK-8** 지시문·사용자 메시지·JSON 스키마 — 고친 점: 이름 안의 숫자 · **REQ-508** · AC-508.4
> Phase 3b `ai-report-3b-fixes` · Step 3 — `specs/ai-report/tasks.md` 머리말 '할 순서' 3b
> 명세 `specs/ai-report/`는 사용자가 고친 명세(requirements.md '고친 점', 2026-11-01)를 다시 승인한 뒤에만 이 step을 돌린다. 이 step은 TASK-8의 '할 일(3b)'만 한다. 다른 TASK의 일은 하지 않는다.
> **병렬 가능**: 이 phase의 Step 0~4는 서로의 결과를 쓰지 않고 수정 범위가 겹치지 않아 동시에 돌 수 있다. `npm install`은 없다. 같은 폴더에서 동시에 돌면 `npm run build`(`.next/`)·`npm test`는 한 번에 하나만 돌린다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/ai-report/requirements.md`의 REQ-508에 있다. 시험 이름에 이 AC ID를 넣는다.

- **AC-508.4**: `systemPrompt()`에 자료에 있는 이름(처방명·그룹명·동네 이름)은 숫자가 들어 있어도 자료에 적힌 글자 그대로 쓸 수 있고, 숫자로만 된 이름과 그 밖의 숫자는 쓰지 않는다는 규칙이 있다. 문장·요약에 숫자를 쓰지 않는다는 규칙은 그대로 있다
- AC-508.1 ~ AC-508.3의 기존 시험은 그대로 통과해야 한다(AC-508.3은 문장만 고쳤고 뜻은 같다 — 스키마는 바꾸지 않는다)

## 읽어야 할 파일

- `/CLAUDE.md`
- `/specs/ai-report/requirements.md` — 배경 8, '고친 점' 3, REQ-508
- `/specs/ai-report/design.md` — '지시문'(이름 안의 숫자 줄, `PROMPT_VERSION`), 'AI 답 검사' 4(같은 뜻의 검사 규칙 — 지시문과 어긋나지 않게)
- `/specs/ai-report/tasks.md` — 머리말 '모든 TASK 공통'·'할 순서' 3b, TASK-8 '할 일(3b)'
- 이전 step에서 만든 파일:
  - `src/lib/ai/prompt.ts` (`SYSTEM_PROMPT`의 '[숫자 규칙]' 묶음, `PROMPT_VERSION`, Phase 2 Step 3)
  - `src/lib/ai/prompt.test.ts` (지시문 시험 — 날짜·판 번호가 없어야 하는 시험 포함)

## 수정 범위 (tasks.md TASK-8)

- Files: `src/lib/ai/prompt.ts`, `src/lib/ai/prompt.test.ts`
- Tests: `src/lib/ai/prompt.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **지시문은 고정 글자**: 날짜·병원 이름·숫자 값·사용자 정보를 넣지 않는다. `\d{4}-\d{2}`·`\d{4}년` 모양이 없어야 한다(기존 시험)
- **숫자 금지 줄은 그대로**: "요약과 카드 문장에는 숫자를 쓰지 않습니다" 줄을 지우거나 약하게 바꾸지 않는다. 새 줄은 그 아래 예외로 붙인다
- **검사와 같은 뜻**: 답 검사(Step 2)는 글자와 숫자가 함께 든 이름을 글자 그대로 쓴 것만 허용한다. 지시문도 "글자 그대로, 줄이거나 띄어 쓰지 않는다", "숫자로만 된 이름은 쓰지 않는다"를 말한다
- **순수 함수**: `src/lib/ai/`는 네트워크·SDK·`node:` 모듈을 쓰지 않는다

## 작업

### 1. `SYSTEM_PROMPT` '[숫자 규칙]'에 한 줄 (design '지시문')
- "크기는 …" 줄 다음(또는 "달 이름…" 줄 다음)에 한 줄. 아래 뜻과 낱말을 담는다(합니다체):
  ```text
  - 자료에 있는 이름(처방명·그룹명·동네 이름)에 숫자가 들어 있으면 그 이름은 자료에 적힌 글자 그대로 써도 됩니다. 이름을 줄이거나 띄어 쓰지 않습니다. 숫자로만 된 이름은 쓰지 않고, 그 밖의 숫자는 쓰지 않습니다.
  ```
- 예시로 숫자가 든 이름을 지시문에 쓰지 않아도 된다(쓰면 '고정 글자' 시험의 날짜 모양에 걸리지 않는지 본다)

### 2. `PROMPT_VERSION`
- `'ai-report-1'` → `'ai-report-2'`(design '지시문'). 지시문 글자 안에 판 이름이 없어야 한다(기존 시험)

### 3. 시험 (`src/lib/ai/prompt.test.ts`에 더한다)
- AC-508.4: 지시문의 한 줄에 `자료에 있는 이름`·`글자 그대로`가 함께 있다
- AC-508.4: 같은 줄(또는 이웃 줄)에 숫자로만 된 이름을 쓰지 않는다는 말(`숫자로만 된 이름`)과 그 밖의 숫자는 쓰지 않는다는 말이 있다
- AC-508.4: `숫자를 쓰지 않습니다`가 그대로 있다
- `PROMPT_VERSION`이 `'ai-report-2'`다
- 줄로 나눌 때는 `split(/\r?\n/)`

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름에 AC ID를 넣는다. 예: `it('AC-508.4 자료에 있는 이름은 숫자가 있어도 글자 그대로 쓰게 한다', …)`
2. `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-8 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 `src/lib/ai/prompt.ts`를 고칠 수 없다(훅이 막는다)
3. 구현하고 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-8 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

### 이 PC(윈도우)에서
- 하네스 도구는 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/<도구>`로 부른다
- `execute.py`는 이 PC에서 쓰지 않는다. 오케스트레이터가 step마다 새 세션을 연다. 이 세션은 이 step 하나만 하고 끝낸다
- `npm test` 기준선: 46개가 이미 실패한다(2026-11-01). 실패 수가 46개를 넘지 않고, 이 step의 시험은 모두 통과해야 한다

## Acceptance Criteria

```bash
npx vitest run src/lib/ai/prompt.test.ts
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-8 --expect green
npm run lint -- --max-warnings=0
npm run build   # 같은 폴더에서 다른 step과 동시에 돌고 있으면 한 번에 하나만
npm test        # 실패는 기준선 46개 이하
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/sdd status ai-report
```

- 위 커맨드가 모두 에러 없이 끝나야 한다(`npm test`는 기준선 실패만 남아야 한다)
- `sdd status ai-report`에서 AC-508.4가 `src/lib/ai/prompt.test.ts`와 이어져 보여야 한다. REQ-508 줄에 다른 REQ의 AC가 끼어 있지 않아야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 체크리스트:
   - 숫자 금지 규칙이 그대로 있고, 새 줄은 예외로만 읽히는가?
   - 지시문에 날짜·판 번호·숫자 값이 없는가?
3. 결과에 따라 `phases/ai-report-3b-fixes/index.json`의 Step 3을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python -X utf8`로 JSON을 읽고 써서 고친다(편집 도구는 훅이 막는다). 같은 phase의 다른 step도 이 파일을 고칠 수 있으니 읽은 바로 뒤에 자기 step 칸만 바꿔 쓴다
- `summary`에는 더한 지시문 줄 글자, `PROMPT_VERSION`, 더한 시험 수, RED→GREEN을 한 줄로 담는다

## 금지사항

- `reportJsonSchema()`·`userMessage()`를 바꾸지 마라. 이유: 이번 고친 점은 지시문 한 줄뿐이다
- 지시문에 날짜·숫자 값·병원 정보를 넣지 마라. 이유: 지시문은 고정 글자다(design '지시문')
- `specs/` 아래 파일을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀린다. 명세와 다른 점을 찾으면 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊긴다
- `eslint-disable`로 규칙을 피하지 마라. 이유: 린트 경고 0이 끝 조건이다
- 진짜 Claude를 부르지 마라(`npm run ai:try` 포함). 이유: 비용이 든다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 오케스트레이터가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니다

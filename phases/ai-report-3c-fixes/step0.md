# Step 0: plan-name-exception

> **TASK-1** 문서 — `plan.md` AI 분석 줄의 이름 안 숫자 예외 · **REQ-501** · AC-501.4
> Phase 3c `ai-report-3c-fixes` · Step 0 — `specs/ai-report/tasks.md` 머리말 '할 순서' 3c
> 명세 `specs/ai-report/`는 사용자가 고친 명세(requirements.md '고친 점' 9~11, 2026-11-01)를 다시 승인한 뒤에만 이 step을 돌린다. 이 step은 TASK-1의 '할 일(3c)'만 한다. 다른 TASK의 일은 하지 않는다.
> **차례로 돈다**: Step 0 → Step 1. 두 step은 서로의 결과를 쓰지 않고 수정 범위가 겹치지 않는다. `npm install`은 없다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/ai-report/requirements.md`의 REQ-501에 있다. 이 TASK는 TDD 예외(문서 글자만)라 시험 파일이 없고, 아래 'Acceptance Criteria'의 찾기 명령으로 본다.

- **AC-501.4**: `plan.md` §2-3의 '리포트의 근거 숫자는 앱이 채운다' 줄에서 AI 문장에 숫자를 쓰지 않는다는 뜻은 그대로이고, 같은 줄에 자료에 있는 이름(처방명·그룹명·동네 이름 가운데 글자와 숫자가 함께 든 것)을 글자 그대로 쓴 숫자는 예외이고 숫자로만 된 이름은 예외가 아니라는 말이 ADR-024과 같은 글자로 **(사용자, 2026-11-01)** 표시와 함께 있다
- AC-501.1 ~ AC-501.3은 앞 phase에서 맞췄다. 이 step 뒤에도 그대로 맞아야 한다(`docs/ADR.md`를 고치지 않는다)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 고칠 까닭과 정확한 글자를 파악하라:

- `/CLAUDE.md` — 문서 순서(`plan.md`가 부딪히면 이긴다). 그래서 이 예외가 `plan.md`에 없으면 사용자 결정과 어긋난다
- `/plan.md` §2-3 — 고칠 줄
- `/docs/ADR.md` — ADR-024의 '근거 숫자는 앱이 채운다' 줄(글자를 맞출 원본. 읽기만 한다)
- `/specs/ai-report/requirements.md` — '고친 점' 3·9, REQ-501
- `/specs/ai-report/tasks.md` — 머리말 '모든 TASK 공통'·'할 순서' 3c, TASK-1 '할 일(3c)'

## 수정 범위 (tasks.md TASK-1)

TASK-1의 Files는 `docs/ADR.md`, `docs/ARCHITECTURE.md`, `plan.md`, `.env.example`, `.gitignore`, `e2e/lib/env.test.ts`다. **이 step은 그 가운데 `plan.md`의 그 한 줄만 고친다.**

- Tests: 없음
- TDD: exempt — 문서 글자만 고친다

## 꼭 지킬 규칙 (CRITICAL)

- **옛 글자는 지우지 않는다**: 그 줄의 지금 글자는 한 글자도 바꾸지 않고, 새 문장을 사이에 넣기만 한다
- **글자를 ADR-024과 맞춘다**: 새 문장은 ADR-024에 있는 문장과 글자까지 같다. 뜻을 풀어 다시 쓰지 않는다
- **사용자 결정 표시**: 새 문장 끝에 **(사용자, 2026-11-01)**
- **열쇠 값·`sk-ant-` 글자를 쓰지 않는다** (CLAUDE.md 보안 규칙)

## 작업

tasks.md TASK-1 '할 일(3c)'을 그대로 한다. `plan.md` §2-3의 이 줄을:

```text
- 리포트의 근거 숫자는 앱이 채운다(AI는 카드마다 근거 지표만 고르고 문장에는 숫자를 쓰지 않는다, ADR-024). 원인 추측은 '추정'이라고 쓴다 **(사용자, 2026-11-01)**
```

이렇게 바꾼다(`ADR-024).` 뒤에 두 문장을 넣는다):

```text
- 리포트의 근거 숫자는 앱이 채운다(AI는 카드마다 근거 지표만 고르고 문장에는 숫자를 쓰지 않는다, ADR-024). 다만 자료에 있는 이름(처방명·그룹명·동네 이름 가운데 글자와 숫자가 함께 든 것)을 글자 그대로 쓴 숫자는 예외다. 숫자로만 된 이름은 예외가 아니다 **(사용자, 2026-11-01)**. 원인 추측은 '추정'이라고 쓴다 **(사용자, 2026-11-01)**
```

다른 줄·다른 문서는 고치지 않는다.

## TDD 순서

이 TASK는 `TDD: exempt`다. 시험 파일이 없으므로 `tdd-run`을 부르지 않는다. 아래 'Acceptance Criteria'의 찾기 명령이 확인이다.

### 이 PC(윈도우)에서
- 하네스 도구는 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/<도구>`로 부른다(`python3 ~/.claude/...` 대신)
- `execute.py`는 이 PC에서 쓰지 않는다. 오케스트레이터(메인 세션)가 step마다 새 세션을 열어 이 파일을 준다. 이 세션은 이 step 하나만 하고 끝낸다
- 파일을 읽어 줄로 나눌 때는 늘 `split(/\r?\n/)`를 쓴다
- `git status`에는 줄바꿈만 다른 가짜 "M" 파일이 수백 개 보인다. 무엇이 바뀌었는지는 `git diff -w --ignore-cr-at-eol -- <파일>`로 본다
- `npm test` 기준선: 이 PC는 .NET 10이 없어 46개가 이미 실패한다(2026-11-01). 이 step은 문서만 고치므로 실패 수가 46개를 넘으면 안 된다

## Acceptance Criteria

```bash
grep -n "자료에 있는 이름" plan.md
node -e "const l=require('fs').readFileSync('plan.md','utf8').split(/\r?\n/).filter(x=>x.includes('리포트의 근거 숫자는 앱이 채운다'));process.exit(l.length===1&&['문장에는 숫자를 쓰지 않는다, ADR-024). 다만 자료에 있는 이름(처방명·그룹명·동네 이름 가운데 글자와 숫자가 함께 든 것)을 글자 그대로 쓴 숫자는 예외다. 숫자로만 된 이름은 예외가 아니다 **(사용자, 2026-11-01)**. 원인 추측은',\"'추정'이라고 쓴다 **(사용자, 2026-11-01)**\"].every(w=>l[0].includes(w))?0:1)"
node -e "const f=require('fs');const s='다만 자료에 있는 이름(처방명·그룹명·동네 이름 가운데 글자와 숫자가 함께 든 것)을 글자 그대로 쓴 숫자는 예외다. 숫자로만 된 이름은 예외가 아니다 **(사용자, 2026-11-01)**';process.exit(f.readFileSync('plan.md','utf8').includes(s)&&f.readFileSync('docs/ADR.md','utf8').includes(s)?0:1)"
test "$(git diff -w --ignore-cr-at-eol --numstat -- plan.md | cut -f1,2)" = "$(printf '1\t1')"   # plan.md는 한 줄만 바뀌었다
git diff -w --ignore-cr-at-eol --quiet -- docs/ADR.md   # ADR-024은 이미 맞다. 고치지 않는다
npm run lint -- --max-warnings=0
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/sdd check ai-report
```

- 위 커맨드가 모두 에러 없이(종료 코드 0) 끝나야 한다
- `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/verify`는 기준선 실패(46개) 때문에 test 단계에서 멈출 수 있다. 그때는 실패 수가 46개를 넘지 않는지 보고 summary에 적는다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 체크리스트를 확인한다:
   - 그 줄의 옛 글자(근거 숫자는 앱이 채운다·문장에 숫자를 쓰지 않는다·ADR-024·원인 추측은 '추정')가 그대로 남았는가?
   - 새 문장이 ADR-024의 문장과 글자까지 같은가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (열쇠 값 없음)
3. 결과에 따라 `phases/ai-report-3c-fixes/index.json`의 Step 0을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python -X utf8`로 JSON을 읽고 써서 고친다(편집 도구는 훅이 막는다). 읽은 바로 뒤에 자기 step 칸만 바꿔 쓴다
- `summary`에는 `plan.md`에 더한 문장의 자리와 글자를 한 줄로 담는다

## 금지사항

- `plan.md`의 다른 줄이나 그 줄의 옛 글자를 고치지 마라. 이유: 이 step의 할 일은 문장 하나를 넣는 것뿐이다
- `docs/ADR.md`를 고치지 마라(TASK-1 Files 안의 다른 파일도). 이유: ADR-024은 3b에서 이미 맞췄고, 이 줄이 글자를 맞출 원본이다
- 앱 코드(`src/**`)·`package.json`·`supabase/**`를 고치지 마라. 이유: 코드는 Step 1이 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- `CLAUDE.md`·`.harness/*`를 고치지 마라. 이유: 규칙 문서는 사용자 승인으로만 바뀐다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 오케스트레이터(메인 세션)가 한다

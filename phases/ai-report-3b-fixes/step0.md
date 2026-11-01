# Step 0: adr-fixes

> **TASK-1** 문서 — ADR-024 고친 점 두 줄 · **REQ-501** · AC-501.3
> Phase 3b `ai-report-3b-fixes` · Step 0 — `specs/ai-report/tasks.md` 머리말 '할 순서' 3b
> 명세 `specs/ai-report/`는 사용자가 고친 명세(requirements.md '고친 점', 2026-11-01)를 다시 승인한 뒤에만 이 step을 돌린다. 이 step은 TASK-1의 '할 일(3b)'만 한다. 다른 TASK의 일은 하지 않는다.
> **병렬 가능**: 이 phase의 Step 0~4는 서로의 결과를 쓰지 않고 수정 범위가 겹치지 않아 동시에 돌 수 있다. `npm install`은 없다. 같은 폴더에서 동시에 돌면 `npm run build`(`.next/`)·`npm test`는 한 번에 하나만 돌린다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/ai-report/requirements.md`의 REQ-501에 있다. 이 TASK는 TDD 예외(문서 글자만)라 시험 파일이 없고, 아래 'Acceptance Criteria'의 찾기 명령으로 본다.

- **AC-501.3**: ADR-024에 (1) 비용 기록은 거절한 시도까지 청구된 모든 시도의 토큰(`usage.iterations`의 합)으로 센다는 줄, (2) AI 문장에 숫자를 쓰지 않되 자료에 있는 이름(글자와 숫자가 함께 든 이름)을 글자 그대로 쓴 숫자는 예외라는 줄이 있다
- AC-501.1·AC-501.2는 Phase 1에서 맞췄다. 이 step 뒤에도 그대로 맞아야 한다(ADR-024의 옛 문장을 지우지 않는다)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 고칠 까닭과 정확한 규칙을 파악하라:

- `/CLAUDE.md`
- `/docs/ADR.md` — ADR-024 전체(제목·**결정**·**이유**·**트레이드오프**·**바꾸는 것** 모양), ADR-007 끝 줄
- `/specs/ai-report/requirements.md` — 배경 8·10, '고친 점' 2·3, REQ-501
- `/specs/ai-report/design.md` — 'Claude 부르기'의 사용량, '비용'의 '대신 답한 부름', 'AI 답 검사' 4(숫자 규칙), '결정과 트레이드오프'의 '이름 안의 숫자는 허용'
- `/specs/ai-report/tasks.md` — 머리말 '모든 TASK 공통'·'할 순서' 3b, TASK-1 '할 일(3b)'

## 수정 범위 (tasks.md TASK-1)

TASK-1의 Files는 `docs/ADR.md`, `docs/ARCHITECTURE.md`, `plan.md`, `.env.example`, `.gitignore`, `e2e/lib/env.test.ts`다. **이 step은 그 가운데 `docs/ADR.md` 하나만 고친다.**

- Tests: 없음
- TDD: exempt — 문서 글자만 고친다

## 꼭 지킬 규칙 (CRITICAL)

- **옛 문장은 지우지 않는다**: ADR-024의 "AI 문장에는 숫자를 쓰지 않는다"는 그대로 두고 뒤에 예외 문장을 잇는다. 트레이드오프의 "다른 모델로 다시 돌린 부름은 그 가격이 표에 없으면 비싸게 센다"도 그대로 둔다
- **사용자 결정 표시**: 사용자가 정한 두 줄 끝에 **(사용자, 2026-11-01)**
- **열쇠 값·`sk-ant-` 글자를 쓰지 않는다** (CLAUDE.md 보안 규칙)

## 작업

tasks.md TASK-1 '할 일(3b)'을 그대로 한다. `docs/ADR.md`의 ADR-024 **결정** 목록에서:

1. '**근거 숫자는 앱이 채운다**' 줄 끝(“숫자 규칙을 어긴 카드는 버린다(고쳐 쓰지 않는다)” 뒤)에 한 문장을 잇는다. 아래 글자 `자료에 있는 이름`이 그대로 들어가야 한다:
   ```text
   다만 자료에 있는 이름(처방명·그룹명·동네 이름 가운데 글자와 숫자가 함께 든 것)을 글자 그대로 쓴 숫자는 예외다. 숫자로만 된 이름은 예외가 아니다 **(사용자, 2026-11-01)**
   ```
2. '**모델**' 줄 아래에 '**비용**' 줄 하나를 더한다. 아래 글자 `usage.iterations`가 그대로 들어가야 한다:
   ```text
   - **비용**: 거절하고 다른 모델이 대신 답하면 맨 위 사용량은 마지막 시도 몫뿐이다. 비용 기록은 거절한 시도까지 청구된 모든 시도의 토큰(`usage.iterations`의 합)으로 세고, 값은 마지막에 답한 모델 값(표에 없으면 표에서 가장 비싼 값)이다 **(사용자, 2026-11-01)**
   ```

다른 ADR·`docs/ARCHITECTURE.md`·`plan.md`·설정 파일은 고치지 않는다.

## TDD 순서

이 TASK는 `TDD: exempt`다. 시험 파일이 없으므로 `tdd-run`을 부르지 않는다. 아래 'Acceptance Criteria'의 찾기 명령이 확인이다.

### 이 PC(윈도우)에서
- 하네스 도구는 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/<도구>`로 부른다(`python3 ~/.claude/...` 대신). 다른 TASK의 RED는 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-n --expect red`, GREEN은 같은 명령에 `--expect green`이다
- `execute.py`는 이 PC에서 쓰지 않는다. 오케스트레이터(메인 세션)가 step마다 새 세션을 열어 이 파일을 준다. 이 세션은 이 step 하나만 하고 끝낸다
- 파일을 읽어 줄로 나눌 때는 늘 `split(/\r?\n/)`를 쓴다
- 이 worktree에는 이 step 전부터 바뀐 파일이 있을 수 있다. 시작할 때 `git status --short`를 적어 두고, 끝에 견줘 이 step이 더 바꾼 파일이 `docs/ADR.md`(와 `phases/ai-report-3b-fixes/index.json` 상태 기록)뿐인지 본다
- `npm test` 기준선: 이 PC는 .NET 10이 없어 46개가 이미 실패한다(2026-11-01). 이 step은 문서만 고치므로 실패 수가 늘면 안 된다

## Acceptance Criteria

```bash
grep -n "usage.iterations" docs/ADR.md
grep -n "자료에 있는 이름" docs/ADR.md
node -e "const t=require('fs').readFileSync('docs/ADR.md','utf8');const i=t.indexOf('### ADR-024');const s=i<0?'':t.slice(i);const n=s.indexOf('\n### ',1);const a=n<0?s:s.slice(0,n);process.exit(i>=0&&['usage.iterations','자료에 있는 이름','(사용자, 2026-11-01)','claude-opus-5-5','지문','덮어','자료 없음','앱이','숫자를 쓰지 않는다'].every(w=>a.includes(w))?0:1)"
grep -n "모델·저장: ADR-024" docs/ADR.md
git diff --stat -- docs/ADR.md
npm run lint -- --max-warnings=0
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/sdd check ai-report
```

- 위 커맨드가 모두 에러 없이(종료 코드 0) 끝나야 한다
- `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/verify`는 기준선 실패(46개) 때문에 test 단계에서 멈출 수 있다. 그때는 실패 수가 46개를 넘지 않는지 보고 summary에 적는다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ADR-024의 옛 결정(달마다 저장·지문·근거 숫자는 앱이 채움·모델·자료 없음·쓰기 함수 둘)이 그대로 남았는가?
   - 새 두 줄이 requirements '고친 점' 2·3, design '비용'·'AI 답 검사' 4와 같은 뜻인가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (열쇠 값 없음)
3. 결과에 따라 `phases/ai-report-3b-fixes/index.json`의 Step 0을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python -X utf8`로 JSON을 읽고 써서 고친다(편집 도구는 훅이 막는다). 같은 phase의 다른 step도 이 파일을 고칠 수 있으니 읽은 바로 뒤에 자기 step 칸만 바꿔 쓴다
- `summary`에는 ADR-024에 더한 두 줄의 자리와 글자를 한 줄로 담는다

## 금지사항

- ADR-024·ADR-007의 옛 문장을 지우거나 고쳐 쓰지 마라. 이유: 무엇이 언제 바뀌었는지 남아야 한다
- `docs/ADR.md` 밖의 파일을 고치지 마라(TASK-1 Files 안의 다른 파일도). 이유: 이 step의 할 일은 ADR-024 두 줄뿐이다
- 앱 코드(`src/**`)·`package.json`·`supabase/**`를 고치지 마라. 이유: 코드는 Step 1~4가 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- `CLAUDE.md`·`.harness/*`를 고치지 마라. 이유: 규칙 문서는 사용자 승인으로만 바뀐다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 오케스트레이터(메인 세션)가 한다

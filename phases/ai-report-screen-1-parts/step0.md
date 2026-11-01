# Step 0: error-code-types

> **TASK-1** 읽기 오류 번호와 화면 타입 · **REQ-701** · AC-701.1
> Phase 1 `ai-report-screen-1-parts` · Step 0. 이 step이 끝나야 Step 1~3이 시작한다(모두 이 step의 타입을 쓴다).
> 명세 `specs/ai-report-screen/`는 승인되어 있다. 이 step은 TASK-1 하나만 한다.

## 읽어야 할 파일
- `/CLAUDE.md`, `/specs/ai-report-screen/requirements.md`(REQ-701, 배경), `/specs/ai-report-screen/design.md`('타입'), `/specs/ai-report-screen/tasks.md`(머리말 '모든 TASK 공통', TASK-1)
- `/src/lib/errors.ts`, `/src/lib/errors.test.ts`, `/src/types/errors.ts`, `/src/types/aiReport.ts`

## 수정 범위 (이 목록 밖은 SDD 훅이 막는다)
- `src/lib/errors.ts`, `src/lib/errors.test.ts`, `src/types/errors.ts`, `src/types/aiReport.ts`

## 작업
1. `E-AI-READ`를 오류 번호 목록과 문구에 더한다. 글자는 정확히 아래와 같다.
   - what: `저장한 AI 리포트를 읽지 못했어요`
   - fix: `[다시 읽기]를 눌러 주세요. 계속되면 오류 번호와 함께 문의해 주세요.`
2. 시험 AC-701.1: 위 글자와 정확히 같고, "병원"이 없고, "니다."로 끝나는 문장이 없다. `errors.test.ts`에 모든 번호를 적어 둔 목록이 있으면 거기에도 더한다.
3. `src/types/aiReport.ts`에 타입을 더한다.
   ```ts
   export type AiUsageView = { calls: number; tokens: number; costMicroUsd: number }
   export type ShownReport = Omit<SavedReport, 'inputHash'>
   export type ReportView = { report: ShownReport | null; stale: boolean; usage: AiUsageView }
   ```

## 꼭 지킬 규칙
- `AiErrorCode`는 지금 넷 그대로 둔다. `E-AI-READ`는 `POST`가 쓰지 않으므로 `ErrorCode`에만 더한다(`route.ts`의 `Record<AiErrorCode, number>`가 넓어지면 안 된다).
- `ReportInput`·`ReportMetric`의 칸과 순서를 건드리지 않는다. 열쇠 순서가 곧 지문이다.

## TDD 순서
1. 시험을 먼저 쓴다. 이름에 `AC-701.1`을 넣는다.
2. `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-1 --expect red`로 RED를 기록한다. 그 전에는 구현 파일을 고치지 않는다.
3. 구현 뒤 `... tdd-run TASK-1 --expect green`. 정리한 뒤 다시 green을 본다.

## 이 PC(윈도우)에서
- 하네스 도구는 위처럼 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/<도구>`로 부른다.
- 파일은 Edit·Write 도구로만 고친다. 스크립트·`sed`로 고치지 않는다(훅을 안 거치고 줄바꿈이 바뀐다). `src`는 LF다.

## Acceptance Criteria
```bash
npx vitest run src/lib/errors.test.ts
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-1 --expect green
npx tsc --noEmit
npm run lint -- --max-warnings=0
```
전체 `npm test`·`npm run build`는 이 step에서 돌리지 않는다. 단계 끝에 메인이 돌린다.

## 금지사항
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 리뷰 PASS 뒤 메인이 한다.
- `phases/**/index.json`을 고치지 마라. 이유: 메인이 기록한다. 대신 답의 마지막에 한 줄 요약을 적어라.
- `specs/`·`.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀린다. 명세와 다른 점을 찾으면 고치지 말고 답에 적어라.
- 시험을 지우거나 약하게 바꾸거나 `eslint-disable`을 쓰지 마라.

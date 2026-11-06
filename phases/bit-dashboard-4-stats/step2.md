# Step 2: report-partial

> **TASK-10** 덜 끝난 지난 날의 보고 문장 · `specs/bit-dashboard/tasks.md`
> 명세가 승인 상태인지 먼저 본다: `python3 ~/.claude/harness/bin/sdd status`

## 읽어야 할 파일

- `/CLAUDE.md`
- `/specs/bit-dashboard/requirements.md`(AC-605.2·AC-605.9), `/specs/bit-dashboard/design.md`('### 날짜 고르기'), `/specs/bit-dashboard/tasks.md`
- `/src/components/dashboard/summary/view.ts`의 `todayView`·`reportSentence`, `/src/components/dashboard/summary/ReportBlock.tsx`

## 작업

시작 조건: 통계 TASK-16(`phases/stats-4-screen` step 3)이 끝났다. 같은 `view.ts`·`view.test.ts`를 고치기 때문이다. TASK-8(step 1)과는 파일이 겹치지 않아 같은 때 돌아도 된다.

AC-605.9: 고른 지난 날의 줄이 `partial: true`면 큰 문장은 "{M}월 {D}일 환자 N명까지 확인됐어요.", 아래 줄은 "그날 자료가 중간까지만 저장돼 있어요."다. `reportSentence`가 `dayLabel`이 있고 `state === 'open'`일 때 이 두 줄을 `first`·`rest`로 돌려준다. 오늘의 덜 끝난 문장과 끝난 날 문장은 그대로다.

## 이 step을 돌리는 방식 (꼭 지킨다)

- 작업 폴더는 시킨 쪽이 알려 준 한 곳이다. 다른 폴더를 고치지 않는다.
- 이 TASK의 `Files`만 고친다.
- `git commit`·`git add`·`git stash`·`git merge`·`git reset`을 하지 마라. 이유: 커밋은 독립 리뷰가 PASS한 뒤 이 step을 시킨 쪽이 한다.
- `specs/bit-dashboard/` 아래를 고치지 마라. 이유: 명세를 바꾸면 승인이 무효가 된다. 승인 범위 밖 파일이 꼭 필요하거나 명세와 코드가 부딪히면 멈추고 무엇이 왜 필요한지 보고한다.
- `phases/**/index.json`·`approval.json`·`tdd-log.jsonl`을 직접 고치지 마라. 이유: 상태는 시킨 쪽이, 시험 기록은 훅과 `tdd-run`이 쓴다.
- 전체 `npm test`를 돌리지 마라. 이유: 같은 폴더의 다른 작업과 부딪히고 오래 걸린다. 이 TASK 시험과 고친 파일 가까운 시험만 돌린다.
- 이전부터 실패하는 시험: `src/components/ui/classes.test.ts`, `e2e/lib/envFile.test.ts`, `src/app/(app)/tabFrame.test.tsx`, `src/components/landing/rules.test.ts`, `src/components/charts/rules.test.ts`, `src/lib/analytics/aggregate.test.ts`. 이 파일들의 실패 수가 늘면 보고한다. 고치러 가지 않는다.
- 실제 환자 자료를 쓰지 않는다. 시험은 가짜 자료만 쓴다.

## TDD 차례 (`.claude/skills/tdd/SKILL.md`)

1. 시험을 먼저 쓴다. 시험 이름에 AC ID를 넣는다.
2. `python3 ~/.claude/harness/bin/tdd-run TASK-10 --expect red`로 실패를 기록한다. 실패 이유가 기대한 동작이 없어서인지 본다. 이 기록 전에는 구현 파일을 고칠 수 없다.
3. 최소 구현 뒤 `python3 ~/.claude/harness/bin/tdd-run TASK-10 --expect green`.
4. 정리 뒤 다시 `--expect green`. `npx eslint`로 고친 파일을 검사하고 `npx tsc --noEmit`으로 타입을 본다.

## 끝나고 보고할 것

고친 파일, 맞춘 AC, 마지막 시험 결과(개수 그대로), 못 한 것·판단이 필요한 것. 통과하지 않았으면 그렇게 적는다.

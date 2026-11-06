# Step 1: live-dashboard

> **TASK-8** 통계의 저장 숫자 읽기와 잇기 · `specs/bit-dashboard/tasks.md`
> 명세가 승인 상태인지 먼저 본다: `python3 ~/.claude/harness/bin/sdd status`

## 읽어야 할 파일

- `/CLAUDE.md`
- `/specs/bit-dashboard/requirements.md`, `/specs/bit-dashboard/design.md`, `/specs/bit-dashboard/tasks.md`
- `/src/components/dashboard/live/BitDashboard.tsx`, `/src/lib/storage/stats.ts`의 `readDays`, `/src/components/common/ErrorCard.tsx`, `/src/components/stats/StatsScreen.tsx`의 [다시 읽기] 카드
- `/specs/stats/requirements.md` REQ-516(AC-516.1·516.3·516.4)

## 작업

AC-601.14·AC-601.19(2026-11-06 사용자 결정)와 통계 AC-516.1·AC-516.3·AC-516.4의 페이지 쪽. 모양은 design.md '### 화면'의 `LiveDashboard` 두 줄을 따른다. `wip-stats-dashboard-source` `5abd9db`의 `LiveDashboard`는 `BitDashboard` 없이 `DashboardHome`을 바로 그려서 쓰지 않는다. 새로 쓴다.

통계 TASK-16(`phases/stats-4-screen` step 3)과 같은 때 돌 수 있다. 그 TASK의 여섯 파일(`source.ts`·`view.ts`·`DashboardAnalysis.tsx`와 시험)은 고치지 않는다. `toSummarySource(result: Awaited<ReturnType<typeof readDays>> | null): SummarySource`를 그 모양대로 부르고, GREEN 기록은 그 함수가 작업 폴더에 생긴 뒤 한다.

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
2. `python3 ~/.claude/harness/bin/tdd-run TASK-8 --expect red`로 실패를 기록한다. 실패 이유가 기대한 동작이 없어서인지 본다. 이 기록 전에는 구현 파일을 고칠 수 없다.
3. 최소 구현 뒤 `python3 ~/.claude/harness/bin/tdd-run TASK-8 --expect green`.
4. 정리 뒤 다시 `--expect green`. `npx eslint`로 고친 파일을 검사하고 `npx tsc --noEmit`으로 타입을 본다.

## 끝나고 보고할 것

고친 파일, 맞춘 AC, 마지막 시험 결과(개수 그대로), 못 한 것·판단이 필요한 것. 통과하지 않았으면 그렇게 적는다.

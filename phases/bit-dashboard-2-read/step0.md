# Step 0: read-bit-days

> **TASK-3** 비트 읽기 한 번 (`readBitDays`) · `specs/bit-dashboard/tasks.md`
> 명세가 승인 상태인지 먼저 본다: `python3 ~/.claude/harness/bin/sdd status`

## 읽어야 할 파일

- `/CLAUDE.md`
- `/specs/bit-dashboard/requirements.md`, `/specs/bit-dashboard/design.md`, `/specs/bit-dashboard/tasks.md`
- `/src/workers/statsClient.ts`, `/src/workers/stats/jobs.ts` (`requestLoad`, `StatsLoaded`)
- `connectScreenBridge`가 있는 `/src/lib/bridge/` 파일
- `/src/lib/errors.ts`

## 작업

`src/components/dashboard/live/readBitDays.ts`와 시험을 만든다. 시그니처와 차례는 `design.md`의 "### 읽기" 절이 정한다. 핵심 규칙:

- 맞출 AC: REQ-601 가운데 읽기가 맡는 것(AC-601.7의 `busy` → `E-BIT-IN-USE`, AC-601.9의 `days`만 꺼내기, AC-601.12의 `days: null` → `E-BIT-DATA-UNSURE`), AC-604.2(옛 도우미면 `stats.rows`를 부르지 않음). `sdd status`로 TASK-3에 묶인 AC를 확인한다.
- `runtime`이 없으면 Worker도 만들지 않고 `not-ready`다. 모든 길에서 `finally`로 통로를 닫고 Worker를 끝낸다.
- `E-ANALYZE-TIMEOUT`은 `E-BIT-READ-FAILED`로 바꾼다. `useBridge`를 쓰지 않는다.
- `months`·`report`·`checks`를 답에 담지 않는다.
- 환자 자료 구역 규칙을 어기지 않는다: 차트번호·환자 줄이 이 파일에 머물면 안 된다.
- 통계 쪽 답 모양(`stats.rows`)이 곧 바뀔 수 있다(v2 `patientDays`, 미확정). 이 함수는 `StatsLoaded.days`만 쓰므로 도우미 답 모양에 직접 기대지 않게 쓴다. 시험은 가짜 Worker로 한다.

## 이 step을 돌리는 방식 (꼭 지킨다)

- 작업 폴더는 `seoseungkwanapp/.claude/worktrees/feat-bit-dashboard` 하나다. 다른 폴더를 고치지 않는다.
- 같은 폴더에서 다른 step이 동시에 돌 수 있다. 이 TASK의 `Files`만 고친다.
- `git commit`·`git add`·`git stash`·`git merge`·`git reset`을 하지 마라. 이유: 커밋은 독립 리뷰가 PASS한 뒤 이 step을 시킨 쪽이 한다.
- `specs/bit-dashboard/` 아래를 고치지 마라. 이유: 명세를 바꾸면 승인이 무효가 된다. 승인 범위 밖 파일이 꼭 필요하거나 명세와 코드가 부딪히면 멈추고 무엇이 왜 필요한지 보고한다.
- `phases/**/index.json`·`approval.json`·`tdd-log.jsonl`을 직접 고치지 마라. 이유: 상태는 시킨 쪽이, 시험 기록은 훅과 `tdd-run`이 쓴다.
- 전체 `npm test`를 돌리지 마라. 이유: 같은 폴더의 다른 작업과 부딪히고 오래 걸린다. 이 TASK 시험과 고친 파일 가까운 시험만 돌린다.
- 이전부터 실패하는 시험: `src/components/ui/classes.test.ts`, `e2e/lib/envFile.test.ts`, `src/app/(app)/tabFrame.test.tsx`, `src/components/landing/rules.test.ts`, `src/components/charts/rules.test.ts`, `src/lib/analytics/aggregate.test.ts`. 이 파일들의 실패 수가 늘면 보고한다. 고치러 가지 않는다.
- 실제 환자 자료를 쓰지 않는다. 시험은 가짜 자료만 쓴다.

## TDD 차례 (`.claude/skills/tdd/SKILL.md`)

1. 시험을 먼저 쓴다. 시험 이름에 AC ID를 넣는다.
2. `python3 ~/.claude/harness/bin/tdd-run TASK-3 --expect red`로 실패를 기록한다. 실패 이유가 기대한 동작이 없어서인지 본다. 이 기록 전에는 구현 파일을 고칠 수 없다.
3. 최소 구현 뒤 `python3 ~/.claude/harness/bin/tdd-run TASK-3 --expect green`.
4. 정리 뒤 다시 `--expect green`. `npx eslint`로 고친 파일을 검사하고 `npx tsc --noEmit`으로 타입을 본다.

## 끝나고 보고할 것

고친 파일, 맞춘 AC, 마지막 시험 결과(개수 그대로), 못 한 것·판단이 필요한 것. 통과하지 않았으면 그렇게 적는다.

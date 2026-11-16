# 작업 분할: 수납일지 탭

> 형식: `## TASK-n: 제목` 아래에 `- Phase:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 고친다. TASK마다 일꾼 하나. 같은 Phase는 병렬(최대 2), 앞 Phase가 합쳐진 뒤 다음 Phase.
> MVP 모드: 중간 검토 없이 마지막(TASK-7)에 전체 검사·검토 한 번. Phase 끝마다 그 Phase 시험 파일만 돌린다.
>
> | Phase | TASK | 하는 일 |
> |---|---|---|
> | 1 | TASK-1 | 도우미: 하루 장부 읽기·PC 저장 칸·0.8.0 |
> | 1 | TASK-2 | 순수 규칙: 장부·메모 분류·묶음 판단·통계 전환 셈 + 울타리(lib/sunap) |
> | 2 | TASK-3 | 서버 표 migration + 저장 함수 |
> | 2 | TASK-4 | 장부 Worker |
> | 3 | TASK-5 | 수납일지 화면 + 울타리(components/sunap/rows) |
> | 3 | TASK-6 | 통계 '예약·전환' 칸 |
> | 4 | TASK-7 | 탭·주소 잇기 + 전체 검사·화면 확인 |
>
> - 겹치는 파일: `eslint.config.mjs`·`src/guardrails.test.ts`는 TASK-2(Phase 1)와 TASK-5(Phase 3)만, 차례로 고친다
> - **사용자 단계**: (1) 배포 전 `20261116000000_sunap.sql`을 Supabase SQL Editor에 붙여 넣기 (2) 배포 뒤 도우미 0.8.0 정식 판을 접수 PC에 설치. Claude는 실제 Supabase에 붙지 않는다

## TASK-1: 도우미 하루 장부 읽기·PC 저장 칸·0.8.0
- Phase: 1
- AC: AC-4902.1, AC-4902.2, AC-4902.3, AC-4902.4, AC-4902.5, AC-4902.6
- REQ: REQ-4902
- Files: helper/src/Precheck.Core/Sunap/**, helper/src/Precheck.Core/Bit/Sql.cs, helper/src/Precheck.Core/Contact/ContactCommands.cs, helper/src/Precheck.Core/Store/**, helper/Directory.Build.props, helper/tests/**, src/lib/bridge/commands.json, src/lib/bridge/versions.ts, src/lib/bridge/*.test.ts, src/types/bridge.ts
- Tests: helper/tests/Precheck.Core.Tests/Sunap/SunapTargets.test.cs, helper/tests/Precheck.Core.Tests/Store/WorkStoreSunap.test.cs, helper/tests/Precheck.Core.Tests/Protocol/CommandTable.test.cs, src/lib/bridge/handshake.test.ts
- TDD: required — design.md '도우미 답'·'PC 저장'. SQL은 가짜 DB(기존 Revenue·Contact 시험의 가짜 방식)로 본다. 메모 읽는 새 상수 말고 `ReservationsSql`은 고치지 않는다. 버전을 고정한 기존 시험(0.7.0 → 0.8.0)은 숫자만 바꾼다. `src/types/bridge.ts`는 `contact.targets` kind에 `'sunap'`만 더한다

## TASK-2: 순수 규칙 + lib/sunap 울타리
- Phase: 1
- AC: AC-4901.1, AC-4901.2, AC-4901.3, AC-4901.4, AC-4901.5, AC-4901.6, AC-4901.7, AC-4901.8, AC-4906.4, AC-4907.3
- REQ: REQ-4901, REQ-4906, REQ-4907
- Files: src/types/sunap.ts, src/lib/sunap/**, src/lib/analytics/groupMatch.ts, src/lib/analytics/groupMatch.test.ts, src/lib/analytics/sunapRates.ts, src/lib/analytics/sunapRates.test.ts, eslint.config.mjs, src/guardrails.test.ts, CLAUDE.md
- Tests: src/lib/sunap/memo.test.ts, src/lib/sunap/ledger.test.ts, src/lib/analytics/groupMatch.test.ts, src/lib/analytics/sunapRates.test.ts, src/guardrails.test.ts
- TDD: required — 타입·순수 함수만(design.md '순수 규칙'·'예'). `aggregate.ts`는 고치지 않고 `groupMatches`가 같은 결과인지 같은 예로 견준다. eslint 환자 자료 구역 목록에 `src/lib/sunap/**`을 더하고 guardrails에 증명 하나, CLAUDE.md 구역 목록 한 단어만 더한다

## TASK-3: 서버 표 + 저장 함수
- Phase: 2
- AC: AC-4903.1, AC-4903.2, AC-4903.3, AC-4903.4
- REQ: REQ-4903
- Files: supabase/migrations/20261116000000_sunap.sql, supabase/sunap.rls.test.ts, src/lib/storage/sunap.ts, src/lib/storage/sunap.test.ts, docs/ARCHITECTURE.md
- Tests: supabase/sunap.rls.test.ts, src/lib/storage/sunap.test.ts
- TDD: required — design.md 'DB'·'저장 함수'. RLS 시험은 `supabase/worklog.rls.test.ts`처럼 PGlite로 진짜 migration을 돌린다. ARCHITECTURE.md DB 표 목록에 세 줄만 더한다. **실제 Supabase에 붙여 넣지 않는다**

## TASK-4: 장부 Worker
- Phase: 2
- AC: AC-4904.1, AC-4904.2, AC-4904.3, AC-4904.4
- REQ: REQ-4904
- Files: src/workers/sunap.worker.ts, src/workers/sunap/**
- Tests: src/workers/sunap/handler.test.ts
- TDD: required — design.md 'Worker 메시지'. 본보기 `src/workers/patients.worker.ts`·`patients/handler.ts`. 가짜 port로 조각·`store.save` 보내기를 본다

## TASK-5: 수납일지 화면 + rows 울타리
- Phase: 3
- AC: AC-4905.1, AC-4905.2, AC-4905.3, AC-4905.4, AC-4905.5, AC-4905.6, AC-4905.7, AC-4905.8
- REQ: REQ-4905
- Files: src/components/sunap/**, eslint.config.mjs, src/guardrails.test.ts
- Tests: src/components/sunap/SunapScreen.test.tsx, src/components/sunap/rows/LedgerRows.test.tsx, src/components/sunap/RemoteView.test.tsx, src/guardrails.test.ts
- TDD: required — design.md '화면'. 시안 글자 그대로. Worker·저장 함수·`useBridge`는 시험에서 흉내 낸다. eslint에 `components/sunap/rows` 블록(`patientRowsRules` 본보기, 화면 블록 뒤)과 guardrails 증명을 더한다

## TASK-6: 통계 '예약·전환' 칸
- Phase: 3
- AC: AC-4906.1, AC-4906.2, AC-4906.3
- REQ: REQ-4906
- Files: src/components/stats/**, src/workers/stats.worker.ts, src/workers/stats/**, src/workers/statsClient.ts, src/workers/statsClient.test.ts, src/types/stats.ts
- Tests: src/components/stats/sections/SunapSection.test.tsx, src/components/stats/StatsToc.test.tsx, src/components/stats/StatsScreen.test.tsx, src/workers/stats/jobs.test.ts
- TDD: required — 목차·칸 목록을 고정한 시험(`StatsToc.test.tsx`·`StatsScreen.test.tsx`)은 새 칸 하나만큼만 고친다. 통계 화면은 `loadSunapSettings`로 묶음 id를 읽어 `useStatsRxGroups` 목록에서 정의를 찾아 Worker에 넘긴다

## TASK-7: 탭·주소 잇기 + 마무리
- Phase: 4
- AC: AC-4907.1, AC-4907.2
- REQ: REQ-4907
- Files: src/components/shell/menu.ts, src/components/shell/shell.test.tsx, src/app/(app)/sunap/page.tsx, src/app/(app)/sunap/page.test.tsx, src/app/(app)/tabFrame.test.tsx, src/app/titles.test.tsx, src/app/notFound.test.tsx, src/components/dashboard/briefing/features.ts, src/components/dashboard/briefing/features.test.ts, src/components/dashboard/briefing/DashboardHome.test.tsx, src/components/preview/sample.ts, src/components/preview/sample.test.ts, src/components/sunap/**
- Tests: src/components/shell/shell.test.tsx, src/app/(app)/sunap/page.test.tsx, src/app/(app)/tabFrame.test.tsx, src/app/titles.test.tsx
- TDD: required — 메뉴 줄 하나 + 주소 화면 하나 + 목록을 고정한 시험만 맞춘다. 그 뒤 전체 검사(`npm test`·`npm run lint`·`npm run build`)와 화면 확인(로그인 없는 하네스, 1440·390, 합성 자료). 화면 확인에서 고칠 것이 나오면 `src/components/sunap/**`만 고친다

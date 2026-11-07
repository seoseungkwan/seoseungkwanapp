# 작업 분할: 메모 입력 현황에서 날짜를 직접 완료로 바꾸기

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- AC:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`, `- 차례:`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
>
> **할 순서**: Phase 1(TASK-1 · TASK-2 · TASK-3 나란히) → Phase 2(TASK-4 · TASK-5 나란히, TASK-2 뒤). 같은 Phase끼리 파일이 겹치지 않는다(사용자 지시 2026-11-06).
> 검토는 끝에 한 번. 전체 검사(`tsc`·lint·vitest, `src/guardrails.test.ts` 포함)·`npm run build`·390·1440px 화면 사진은 Phase 2 끝에 한다.
> 시험 자료의 날짜·숫자는 지어낸 값이다. `helper/**`·`extension/**`·`src/lib/bridge/**`·`src/lib/precheck/**`·`src/workers/**`·`src/components/claim/rows/**`는 고치지 않는다. 지금 시험의 기대값은 AC-2806.3의 예외 말고는 바꾸지 않는다.

## 먼저 할 일 (코드 작업 아님)
1. 화면 목업 `docs/mockups/claim-day-done/index.html`(B 방식)은 사용자가 2026-11-08 "B"로 골랐다. 이 명세 승인을 목업 승인으로도 본다
2. 사용자가 `/sdd approve claim-day-done`을 입력한다

## TASK-1: 완료 표시 표와 권한 (마이그레이션)
- REQ: REQ-2805
- AC: AC-2805.1~AC-2805.7
- Files: supabase/migrations/20261108000000_claim_day_closes.sql, supabase/claimDayCloses.rls.test.ts
- Tests: supabase/claimDayCloses.rls.test.ts
- TDD: required — `precheck.rls.test.ts`와 같은 방법(PGlite, Supabase 흉내, 실제 마이그레이션 파일을 차례로: auth → precheck_settings → precheck_counts → 이 파일). design.md의 SQL과 머리 주석. 다른 마이그레이션 파일은 고치지 않는다
- 차례: Phase 1

## TASK-2: 완료 표시 읽기·저장·지우기 (저장소)
- REQ: REQ-2801, REQ-2802, REQ-2806
- AC: AC-2801.3(요청 모양), AC-2801.5(실패 → E-DAYCLOSE-FAILED), AC-2801.6(ignoreDuplicates), AC-2802.2(지우기 요청 모양), AC-2803.3(표 없음 → 빈 목록), AC-2806.1
- Files: src/lib/storage/claimDayCloses.ts, src/lib/storage/claimDayCloses.test.ts, src/lib/storage/claimCounts.ts, src/types/db.ts, src/types/errors.ts, src/lib/errors.ts, src/lib/errors.test.ts
- Tests: src/lib/storage/claimDayCloses.test.ts, src/lib/errors.test.ts
- TDD: required — 가짜 클라이언트(`claimCounts.test.ts`처럼, 실제 Supabase에 붙지 않음). `claimCounts.ts`는 표 없음 판정·`readRows`를 내보내기만 더한다(동작·지금 시험 그대로). 새 오류 번호 `E-DAYCLOSE-FAILED`와 문구
- 차례: Phase 1

## TASK-3: 끝난 날 규칙에 완료 표시 더하기 (날짜 목록)
- REQ: REQ-2804
- AC: AC-2804.1, AC-2804.2, AC-2804.3
- Files: src/components/claim/dateList.ts, src/components/claim/dateList.test.ts
- Tests: src/components/claim/dateList.test.ts
- TDD: required — `buildDateList`·`listRange`에 선택 인자 `closed: ReadonlySet<string> = new Set()`. 지금 시험은 그대로 통과해야 한다
- 차례: Phase 1

## TASK-4: 비트 PC 화면이 완료 표시를 읽기
- REQ: REQ-2804
- AC: AC-2804.4, AC-2804.5, AC-2806.3(ClaimScreen 가짜 서버)
- Files: src/components/claim/ClaimScreen.tsx, src/components/claim/ClaimScreen.test.tsx
- Tests: src/components/claim/ClaimScreen.test.tsx
- TDD: required — `loadDates`·`refreshDates`에서 `readClosedDays`(TASK-2)를 같은 범위로 함께 읽고 TASK-3의 인자로 넘긴다. 가짜 서버는 `claim_day_closes`를 알게 한다(지금 시험의 기대값은 그대로). 화면 모양은 바꾸지 않는다
- 차례: Phase 2 (TASK-2·TASK-3 뒤)

## TASK-5: 밖에서 보는 화면 — 고르기·[완료로 저장]·완료로 바꾼 날·[되돌리기]
- REQ: REQ-2801, REQ-2802, REQ-2803, REQ-2806
- AC: AC-2801.1~AC-2801.7, AC-2802.1~AC-2802.4, AC-2803.1~AC-2803.3, AC-2806.2, AC-2806.3(OutsideCounts 가짜 서버·읽기 수·표 칸)
- Files: src/components/claim/OutsideCounts.tsx, src/components/claim/OutsideCounts.test.tsx
- Tests: src/components/claim/OutsideCounts.test.tsx
- TDD: required — jsdom. design.md '밖에서 보는 화면' 그대로. 가짜 서버에 `claim_day_closes`의 읽기·upsert·delete를 더하고 보낸 값(표 이름·칸·날짜)을 기록해 본다. 지금 모양·부품(`ds.*`·`ErrorCard`)을 쓴다. 끝나면 390·1440px 화면 사진(로그인 없는 하네스, 합성 숫자)
- 차례: Phase 2 (TASK-2 뒤, TASK-4와 나란히)

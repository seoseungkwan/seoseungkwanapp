# 작업 분할: 환자 탭 비트 명단 두 도구 — 예약 문자 명단 · 장기 미방문 명단

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- AC:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`, `- 차례:`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
>
> **할 순서**: 먼저 할 일 → Phase 1(TASK-1 도우미 · TASK-3 계산 · TASK-6 문구 종류, 파일이 겹치지 않음) → Phase 2(TASK-2 도우미 명령 · TASK-4 Worker) → Phase 3(TASK-5 화면) → Phase 4(TASK-7 도우미 릴리스, 사용자가 "만들어"라고 할 때만) → Phase 5(전체 검사·검토).
> 도우미 코드는 이 명세와 `stats-bit-sections`가 모두 승인된 뒤에 만든다. 시험 자료는 모두 지어낸 값이다.

## 먼저 할 일 (코드 작업 아님)
1. 사용자가 시안 `docs/mockups/patients-bit-lists/index.html`을 승인한다
2. 사용자가 `/sdd approve patients-bit-lists`를 입력한다
3. 예약 안내 기본 문구: 사용자가 양식을 주면 AC-2805.3 글을 바꿔 재승인을 받는다(안 주면 자리 글로 만든다)

## TASK-1: 도우미 SQL과 읽기 (예약 · 장기 미방문)
- REQ: REQ-2801
- AC: AC-2801.1, AC-2801.2, AC-2801.3, AC-2801.4, AC-2801.6
- Files: helper/src/Precheck.Core/Contact/ListSql.cs, helper/src/Precheck.Core/Contact/ReservationTargets.cs, helper/src/Precheck.Core/Contact/LapsedTargets.cs, helper/src/Precheck.Core/Bit/Sql.cs, helper/tests/Precheck.Core.Tests/Contact/Read/ListTargets.test.cs, helper/tests/Precheck.Core.Tests/Contact/Read/Support.test.cs
- Tests: helper/tests/contact-read.dotnet.test.ts
- TDD: required — 인자 검사(비트 안 건드림), 가짜 DB로 줄 모양·전화 고르기·그날 옴·그 뒤 처음 온 날·예약 있음·마지막 진료 처방(조건·차례·20개·이름), 문장 글 못 박기, `Sql.IsAllowed`
- 차례: Phase 1

## TASK-2: contact.targets kind 나누기와 명령 표
- REQ: REQ-2801, REQ-2806
- AC: AC-2801.5, AC-2806.3
- Files: helper/src/Precheck.Core/Contact/ContactCommands.cs, src/lib/bridge/commands.json, helper/tests/Precheck.Core.Tests/Contact/Read/ContactContract.test.cs, helper/tests/Precheck.Core.Tests/Protocol/CommandTable.test.cs, src/lib/bridge/protocol.test.ts
- Tests: helper/tests/contact-read.dotnet.test.ts, helper/tests/protocol.dotnet.test.ts, src/lib/bridge/protocol.test.ts
- TDD: required — 네 kind가 맞는 처리기로 감, followup·injection 지금 시험 그대로, 모르는 kind는 지금처럼 막힘
- 차례: Phase 2 (TASK-1 뒤)

## TASK-3: 예약·장기 미방문 계산 (순수 함수)
- REQ: REQ-2803, REQ-2804, REQ-2802
- AC: AC-2802.7, AC-2803.0, AC-2803.1, AC-2803.2, AC-2803.5, AC-2803.6, AC-2803.7, AC-2803.9, AC-2804.1, AC-2804.2, AC-2804.3, AC-2804.4, AC-2804.6, AC-2804.7
- Files: src/lib/patients/reservations.ts, src/lib/patients/reservations.test.ts, src/lib/patients/lapsed.ts, src/lib/patients/lapsed.test.ts, src/types/patients.ts
- Tests: src/lib/patients/reservations.test.ts, src/lib/patients/lapsed.test.ts
- TDD: required — 답 모양 검사, 처음 고를 날(내일 → 모레 → 14일 안 가장 가까운 날 → 내일), 날짜 단추 인원수, 고른 날 WR·NR·OC 거르기, 안 보낸 분만 복사, 번호 없는 분 목록, 아직 안 오신 분만, 묶음 이름 맞추기·묶음 없음·처방 이름 두 개, 시각 글(오전·오후 12:00), 복사 네 칸·날짜 제목 줄·번호 없는 분 빼기, 안 오심·비트 표시·그 뒤, 백분율, 달 전 날짜(31일·2월), 경계 날은 긴 쪽, 연도 붙는 범위 글, 차례
- 차례: Phase 1

## TASK-4: Worker 메시지 (list · filter)
- REQ: REQ-2802, REQ-2806
- AC: AC-2802.2, AC-2802.6, AC-2802.7, AC-2803.8, AC-2804.5, AC-2806.1, AC-2806.3, AC-2806.4
- Files: src/workers/patients/handler.ts, src/workers/patients/handler.test.ts, src/workers/patients/jobs.ts, src/workers/patients/jobs.test.ts, src/types/patients.ts
- Tests: src/workers/patients/handler.test.ts, src/workers/patients/jobs.test.ts
- TDD: required — 포트 조각 받기·틀린 답은 그 도구만 실패·화면 메시지에 차트번호 글자 없음·`s|`·`l|` 표시 저장(묶어 표시 포함)·지우기 규칙·F/U·정기 주사 메시지와 표시 그대로·건수(counts) 그대로. 묶음(이름·코드)은 화면이 filter에 실어 보낸다
- 차례: Phase 2 (TASK-3 뒤)

## TASK-5: 화면 두 도구
- REQ: REQ-2802, REQ-2803, REQ-2804
- AC: AC-2802.1, AC-2802.2, AC-2802.3, AC-2802.4, AC-2802.5, AC-2802.6, AC-2803.0, AC-2803.8, AC-2803.9, AC-2804.5, AC-2804.6, AC-2804.7, AC-2803.1, AC-2803.2, AC-2803.3, AC-2803.4, AC-2803.5, AC-2803.6, AC-2804.2, AC-2804.3, AC-2804.4, AC-2806.2
- Files: src/components/patients/tools.ts, src/components/patients/tools.test.ts, src/components/patients/useBitList.ts, src/components/patients/useBitList.test.ts, src/components/patients/ReservationTool.tsx, src/components/patients/ReservationTool.test.tsx, src/components/patients/LapsedTool.tsx, src/components/patients/LapsedTool.test.tsx, src/components/patients/rows/ReservationRows.tsx, src/components/patients/rows/ReservationRows.test.tsx, src/components/patients/rows/LapsedRows.tsx, src/components/patients/rows/LapsedRows.test.tsx, src/components/patients/PatientsScreen.tsx, src/components/patients/PatientsScreen.test.tsx, src/components/patients/PatientsEntry.tsx, src/components/patients/PatientsEntry.test.tsx, src/components/patients/ToolRow.test.tsx, src/lib/bridge/versions.ts, src/types/bridge.ts, src/app/(app)/patients/page.test.tsx
- Tests: src/components/patients/tools.test.ts, src/components/patients/useBitList.test.ts, src/components/patients/ReservationTool.test.tsx, src/components/patients/LapsedTool.test.tsx, src/components/patients/rows/ReservationRows.test.tsx, src/components/patients/rows/LapsedRows.test.tsx, src/components/patients/PatientsScreen.test.tsx, src/components/patients/PatientsEntry.test.tsx
- TDD: required — 시안 글·단추(aria-pressed)·보냄·연락함 체크·[보냄으로 표시]·번호 없는 분 칸·마지막 진료 고르기(묶음은 `lib/storage/statsRxGroups.ts`로 읽기만, 그 파일은 고치지 않음)·처음 열 때 한 번 읽기·다시 불러오기·업데이트 안내·오류 줄·빈 명단·모두 보기·복사 알림. 도구 수를 세는 지금 시험(`src/app/(app)/patients/page.test.tsx`의 도구 링크 목록 포함)은 다섯으로만 고친다(AC-2806.3). `src/types/bridge.ts`의 `contact.targets` kind 타입에 `lapsed`·`reservation`을 더한다(2026-11-08 구현 중 범위 밖으로 드러나 더함)
- 차례: Phase 3 (TASK-4 뒤)

## TASK-6: 문자 문구 '예약 안내' 종류
- REQ: REQ-2805
- AC: AC-2805.1, AC-2805.2, AC-2805.3, AC-2805.4
- Files: supabase/migrations/20261108000000_message_templates_reservation.sql, supabase/patients.rls.test.ts, src/lib/patientMessages/defaults.ts, src/lib/patientMessages/defaults.test.ts, src/lib/storage/messageTemplates.ts, src/lib/storage/messageTemplates.test.ts, src/types/db.ts, src/components/patients/useTemplates.ts, src/components/patients/useTemplates.test.ts, src/components/patients/MessagesTool.tsx, src/components/patients/MessagesTool.test.tsx, src/components/patients/FollowupTool.tsx, src/components/patients/FollowupTool.test.tsx
- Tests: supabase/patients.rls.test.ts, src/lib/patientMessages/defaults.test.ts, src/components/patients/useTemplates.test.ts, src/components/patients/MessagesTool.test.tsx, src/components/patients/FollowupTool.test.tsx
- TDD: required — kind 셋 받고 그 밖 막힘(실제 DB 시험), 기본 문구 셋, 새 문구 종류 셋·도움말 글, F/U 고르기 둘 그대로. 실제 Supabase에 바꿈을 적용하는 것은 사용자 OK 뒤
- 차례: Phase 1

## TASK-7: 도우미 릴리스 (이 묶음 한 번)
- REQ: REQ-2802
- AC: AC-2802.5
- Files: helper/Directory.Build.props, src/lib/bridge/versions.ts, src/lib/bridge/handshake.test.ts
- Tests: src/lib/bridge/handshake.test.ts
- TDD: required — 도우미 버전 = `LATEST_HELPER` = 새 도구가 보는 `LIST_HELPER`(지금 시험이 같은지 본다). `MIN_HELPER`는 그대로
- 차례: Phase 4 — 두 명세의 도우미 TASK가 모두 끝나고 사용자가 "만들어"라고 한 뒤에만. 옆 창의 도우미 바꿈과 버전을 합친다. 빌드는 GitHub Actions(`helper.yml`), 설치 안내는 그 뒤

## Phase 5: 전체 검사·검토 (코드 작업 아님)
- `npx tsc --noEmit`·`npm run lint`·`npm test`(`src/guardrails.test.ts` 포함)·C# 시험 감싸개·`npm run e2e`(환자 탭, 보내는 요청에 이름·전화 없음)
- `harness-reviewer` 검토 한 번
- 화면 사진(PC·휴대폰)을 시안과 견줘 사용자에게 보인다. 새 도우미를 깐 뒤 의원 PC에서 내일 예약 수·지난 주 예약 수를 비트 예약 화면과 견준다

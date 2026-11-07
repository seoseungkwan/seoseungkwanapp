# 작업 분할: 통계 탭 비트 전용 세 칸 — 환자 구성 · 시간대별 접수 · 원장님별

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- AC:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`, `- 차례:`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
>
> **할 순서**: 먼저 할 일 → Phase 1(TASK-1 도우미 · TASK-3 계산, 파일이 겹치지 않음) → Phase 2(TASK-2 도우미 답 · TASK-4 Worker 받기) → Phase 3(TASK-5 Worker 일) → Phase 4(TASK-6 화면) → Phase 5(전체 검사·검토).
> 도우미 코드는 다섯 기능(`stats-bit-sections`·`patients-lapsed`·`patients-reservations`)이 모두 승인된 뒤에 만든다. 도우미 빌드·버전 올리기는 `patients-reservations`의 마지막 TASK에서 사용자가 "만들어"라고 할 때 한 번만 한다.
> 시험 자료는 모두 지어낸 값이다. 지금 시험의 기대값은 바꾸지 않는다(AC-2701.7·AC-2708.3).

## 먼저 할 일 (코드 작업 아님)
1. 사용자가 시안 `docs/mockups/stats-bit-sections/index.html`을 승인한다
2. 사용자가 `/sdd approve stats-bit-sections`를 입력한다
3. 이 PC에 .NET 10 SDK가 없으면(지금 8.0만 있음) 사용자 OK를 받고 `~/.dotnet`에 설치한다(C# 시험 감싸개가 찾는 곳)

## TASK-1: 도우미 새 SQL과 읽기 (접수 줄 · 사람 줄 · 원장님 이름 · 날·원장님 금액)
- REQ: REQ-2701
- AC: AC-2701.1, AC-2701.2, AC-2701.3, AC-2701.4, AC-2701.5, AC-2701.6, AC-2701.7
- Files: helper/src/Precheck.Core/Stats/StatsSql.cs, helper/src/Precheck.Core/Stats/StatsRows.cs, helper/tests/Precheck.Core.Tests/Stats/StatsSql.test.cs, helper/tests/Precheck.Core.Tests/Stats/StatsRows.test.cs, helper/tests/Precheck.Core.Tests/Stats/StatsExtra.test.cs
- Tests: helper/tests/stats-rows.dotnet.test.ts, helper/tests/bit-read-speed.dotnet.test.ts
- TDD: required — 가짜 DB(지금 StatsRows 시험의 가짜)로 줄 모양·접수 시각·보험 이름 고르기·주소 앞부분(`AddressHead`)·생년월일 검사·달 나누기·같은 (날, 진료의) 더하기·0원 버리기. 새 문장 글을 시험이 글자로 못 박고 `Sql.IsAllowed`를 지나는지 본다
- 차례: Phase 1

## TASK-2: 도우미 답 v3
- REQ: REQ-2701
- AC: AC-2701.1, AC-2701.3, AC-2701.4, AC-2701.5, AC-2701.7
- Files: helper/src/Precheck.Core/Stats/StatsPayload.cs, helper/src/Precheck.Core/Stats/StatsCommands.cs, helper/tests/Precheck.Core.Tests/Stats/StatsRows.test.cs, helper/tests/Precheck.Core.Tests/Stats/StatsExtra.test.cs
- Tests: helper/tests/stats-rows.dotnet.test.ts
- TDD: required — `v:3`, v2 열쇠 값이 지금 시험과 같음, 새 열쇠 넷의 차례·모양, null 칸
- 차례: Phase 2 (TASK-1 뒤)

## TASK-3: 세 칸 계산 (순수 함수)
- REQ: REQ-2703, REQ-2704, REQ-2705, REQ-2707
- AC: AC-2703.1, AC-2703.2, AC-2703.3, AC-2703.4, AC-2703.5, AC-2703.6, AC-2703.7, AC-2703.8, AC-2704.1, AC-2704.2, AC-2704.3, AC-2704.4, AC-2705.1, AC-2705.2, AC-2705.3, AC-2705.4, AC-2705.5, AC-2707.1, AC-2707.2
- Files: src/lib/analytics/patientMix.ts, src/lib/analytics/patientMix.test.ts, src/lib/analytics/visitHours.ts, src/lib/analytics/visitHours.test.ts, src/lib/analytics/doctorStats.ts, src/lib/analytics/doctorStats.test.ts, src/types/stats.ts
- Tests: src/lib/analytics/patientMix.test.ts, src/lib/analytics/visitHours.test.ts, src/lib/analytics/doctorStats.test.ts
- TDD: required — 만 나이 경계(생일 전날·당일), 묶음 명 합 = 실환자, 1위 시 구 이름, 같은 이름 동 괄호, 그 밖·동 없는 주소·주소 없음, 1% 미만, 문 연 날 나누기, 월~일 일곱 줄·8~20시 고정·8시 전/21시 뒤 접수 접어 넣기, 보험·동네 많이 온 차례(연령대는 나이 차례), 시 이름(오전·낮·오후), 단계 ⌈⌉, 진료의 미지정, 매출만 있는 진료의, 합계 실환자 한 번, 한 분 이하, 복사 글
- 차례: Phase 1

## TASK-4: Worker가 v2·v3 답을 받는다
- REQ: REQ-2702
- AC: AC-2702.1, AC-2702.2, AC-2708.3
- Files: src/workers/stats/helperData.ts, src/workers/stats/helperData.test.ts
- Tests: src/workers/stats/helperData.test.ts
- TDD: required — v2 그대로, v3 새 열쇠 모양 검사(모르는 열쇠·칸 수·날짜·시각·금액·없는 차트·없는 진료의 → E-BRIDGE-BAD-REPLY)
- 차례: Phase 2

## TASK-5: Worker 일 sections와 통로
- REQ: REQ-2702, REQ-2708
- AC: AC-2702.1, AC-2702.3, AC-2702.4, AC-2708.1, AC-2708.2
- Files: src/workers/stats/jobs.ts, src/workers/stats/jobs.test.ts, src/workers/statsClient.ts, src/workers/statsClient.test.ts, src/types/stats.ts, src/components/stats/useStatsWorker.ts, src/components/stats/useStatsWorker.test.ts
- Tests: src/workers/stats/jobs.test.ts, src/workers/statsClient.test.ts, src/components/stats/useStatsWorker.test.ts
- TDD: required — none·old-helper·ready, 범위 밖, 화면으로 가는 메시지를 JSON으로 펴서 차트번호·생년월일·주소 앞부분·진료의 코드가 없음, 저장 줄 열쇠 목록 그대로
- 차례: Phase 3 (TASK-3·TASK-4 뒤)

## TASK-6: 화면 세 칸
- REQ: REQ-2706, REQ-2707
- AC: AC-2706.1, AC-2706.2, AC-2706.3, AC-2706.4, AC-2706.5, AC-2706.6, AC-2707.1, AC-2707.2
- Files: src/components/stats/sections/PatientMixSection.tsx, src/components/stats/sections/PatientMixSection.test.tsx, src/components/stats/sections/VisitHoursSection.tsx, src/components/stats/sections/VisitHoursSection.test.tsx, src/components/stats/sections/DoctorsSection.tsx, src/components/stats/sections/DoctorsSection.test.tsx, src/components/stats/sections/StatsSections.tsx, src/components/stats/StatsScreen.tsx, src/components/stats/StatsScreen.test.tsx
- Tests: src/components/stats/sections/PatientMixSection.test.tsx, src/components/stats/sections/VisitHoursSection.test.tsx, src/components/stats/sections/DoctorsSection.test.tsx, src/components/stats/StatsScreen.test.tsx
- TDD: required — 시안 글·단추(aria-pressed)·세 상태 안내·한 분 안내·[자세히]·[표 복사] 글. StatsScreen 시험은 새 시험만 더한다(sections 묻기·넘기기)
- 차례: Phase 4

## Phase 5: 전체 검사·검토 (코드 작업 아님)
- `npx tsc --noEmit`·`npm run lint`·`npm test`(`src/guardrails.test.ts` 포함)·C# 시험 감싸개
- `harness-reviewer` 검토 한 번
- 화면 사진(PC·휴대폰)을 시안과 견줘 사용자에게 보인다

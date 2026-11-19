# 작업 분할: EMR 고르기와 의사랑·이지스 폴더 준비 (emr-choice)

> 형식: `## TASK-n: 제목` 아래에 `- Phase:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`.
> 기준 갈래 `feat-emr-choice`(운영 `887ad320`에서). 같은 Phase의 TASK는 파일이 겹치지 않는다. 검토는 마지막 한 번.
> 사용자 "빨리 할 수 있는 건 빨리, 병렬로 할 수 있는 건 병렬로" → 일꾼: Phase 1 셋(TASK-2·3·7) → TASK-3이 합쳐지면 Phase 2 셋(TASK-4·5·6). TASK-7은 Phase 1에서 시작해 끝까지 따로 돈다.
>
> | Phase | TASK (동시에) |
> |---|---|
> | 0 | TASK-1 시안(끝남, 승인 2026-11-19) |
> | 1 | TASK-2 SQL · TASK-3 자료 모양·읽기저장 · TASK-7 폴더 조사 도구·문서 |
> | 2 | TASK-4 병원 정보 칸 · TASK-5 대시보드 · TASK-6 연결 화면 (모두 TASK-3 다음) |

## TASK-1: 시안과 결정 기록
- Phase: 0
- AC: AC-7102.2, AC-7103.1, AC-7104.1
- REQ: REQ-7102, REQ-7103, REQ-7104
- Files: docs/mockups/emr-choice/index.html, docs/mockups/emr-choice/notes.md
- Tests: 없음
- TDD: exempt — 클릭 시안(지어낸 병원 이름)과 사용자 결정 기록 문서다. 2026-11-19 "굿 …"으로 승인됐다.

## TASK-2: 쓰는 EMR 칸 SQL
- Phase: 1
- AC: AC-7101.1, AC-7101.2
- REQ: REQ-7101
- Files: supabase/migrations/20261119300000_clinic_emr.sql, supabase/clinicEmr.rls.test.ts
- Tests: supabase/clinicEmr.rls.test.ts
- TDD: required — design.md 6절. 새 시험이 PGlite에 clinicProfile.rls.test.ts와 같은 앞 migration들, 20261119000000_clinic_profile.sql, 이 파일을 차례로 돌린다. 파일이 없으면 시험마다 실패(RED). 옛 clinicProfile.rls.test.ts는 고치지 않고 통과해야 한다.

## TASK-3: EMR 자료 모양·글·읽기저장
- Phase: 1
- AC: AC-7102.1, AC-7102.3
- REQ: REQ-7102
- Files: src/types/clinicProfile.ts, src/lib/clinic/emrText.ts, src/lib/clinic/emrText.test.ts, src/lib/storage/clinicProfile.ts, src/lib/storage/clinicProfile.test.ts, src/components/settings/ClinicProfileCard.tsx, src/components/settings/ClinicProfileCard.test.tsx, src/components/ai-report/ReportBody.test.tsx, src/components/calendar/CalendarScreen.test.tsx, src/components/calendar/useCalendarData.test.ts, src/components/clinic/useClinicProfile.test.ts, src/components/dashboard/live/BitDashboard.test.tsx, src/components/stats/sections/ReportSection.test.tsx, src/components/stats/useStatsCalendar.test.ts, src/lib/calendar/clinic.test.ts
- Tests: src/lib/clinic/emrText.test.ts, src/lib/storage/clinicProfile.test.ts
- TDD: required — design.md 1·2절. ClinicProfileCard.tsx와 목록의 다른 시험 파일은 `emr`이 생겨 타입 검사가 깨지는 곳만 고친다(시험 글자에는 `emr: 'bit'` 더하기, 화면 바뀜 없음 — 칸은 TASK-4). ClinicProfileCard는 읽은 `profile.emr`을 그리기 자료(draft)에 그대로 들고 가 저장에 실어 보낸다('bit'로 박지 않는다 — Phase 사이에도 고른 값이 지켜진다). `npx tsc --noEmit -p .`가 지나야 끝.

## TASK-4: 병원 정보 '쓰는 EMR' 칸
- Phase: 2
- AC: AC-7102.2
- REQ: REQ-7102
- Files: src/components/settings/ClinicProfileCard.tsx, src/components/settings/ClinicProfileCard.test.tsx
- Tests: src/components/settings/ClinicProfileCard.test.tsx
- TDD: required — design.md 3절. TASK-3 다음. 칸 자리(호칭 아래)·단추 넷·도움말·고르기·저장에 실려 가는지.

## TASK-5: 비트가 아닌 병원의 대시보드 첫 화면
- Phase: 2
- AC: AC-7103.1, AC-7103.2
- REQ: REQ-7103
- Files: src/components/dashboard/briefing/DashboardHome.tsx, src/components/dashboard/briefing/DashboardHome.test.tsx, src/components/dashboard/live/BitDashboard.tsx, src/components/dashboard/live/BitDashboard.test.tsx
- Tests: src/components/dashboard/briefing/DashboardHome.test.tsx, src/components/dashboard/live/BitDashboard.test.tsx
- TDD: required — design.md 4절. TASK-3 다음. EMR 셋(의사랑·이지스·그 밖)의 제목·글·링크, 없어지는 것 넷, bit·읽는 중·실패·줄 없음은 그대로. StickyConnect.test.tsx는 고치지 않고 통과해야 한다.

## TASK-6: 비트가 아닌 병원의 비트 PC 연결 화면
- Phase: 2
- AC: AC-7104.1, AC-7104.2
- REQ: REQ-7104
- Files: src/components/claim/setup/SetupScreen.tsx, src/components/claim/setup/SetupScreen.test.tsx
- Tests: src/components/claim/setup/SetupScreen.test.tsx
- TDD: required — design.md 5절. TASK-3 다음. `useClinicProfile`을 vi.mock으로 바꿔 원장·데스크 × EMR 셋, bit·읽는 중·실패는 지금 그대로(옛 시험은 고치지 않고 통과). page.test.tsx는 고치지 않고 통과해야 한다.

## TASK-7: 의사랑·이지스 폴더 조사 도구와 준비 문서
- Phase: 1
- AC: AC-7105.1, AC-7105.2, AC-7105.3, AC-7105.4, AC-7105.5, AC-7105.6, AC-7106.1
- REQ: REQ-7105, REQ-7106
- Files: scripts/emr-survey/emr-survey.ps1, scripts/emr-survey/README.md, scripts/emr-survey/emrSurvey.test.ts, docs/emr/README.md
- Tests: scripts/emr-survey/emrSurvey.test.ts
- TDD: required — design.md 7절. 시험이 임시 폴더에 가짜 파일만 만들어 PowerShell로 돌린다(윈도우가 아니면 건너뜀). 스크립트가 없으면 실패(RED). docs/emr/README.md는 이미 있는 조사 글에 폴더 조사 도구를 가리키는 줄만 더한다.

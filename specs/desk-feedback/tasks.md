# 작업 분할: 시연 피드백 — 데스크 계정·다음 예약 번호·물리치료 칸

> 형식: `## TASK-n: 제목` 아래에 `- Phase:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 고친다. TASK마다 일꾼 하나. 같은 Phase는 병렬(최대 2)이고 **같은 Phase의 TASK끼리 파일이 겹치지 않는다**. 앞 Phase가 합쳐진 뒤 다음 Phase.
> MVP 모드: 중간 검토 없이 마지막에 전체 검사·검토 한 번. Phase 끝마다 그 Phase 시험 파일만 돌린다.
>
> | Phase | TASK | 하는 일 |
> |---|---|---|
> | 1 | TASK-1 | 데스크 계정 SQL·RLS 시험 + ADR-031·plan.md·CLAUDE.md·ARCHITECTURE |
> | 1 | TASK-2 | ② 대시보드 물리치료 칸 + new-mark 뒤 깨진 `visitBasis.test.ts` 고침 |
> | 2 | TASK-3 | ① 수납일지 다음 예약 번호 키·↓·번호표 |
> | 2 | TASK-4 | ④ 데스크 화면: 세 탭·막힌 화면(DeskGate)·칩·링크 숨김 |
> | 3 | TASK-5 | ④ 문지기: readMe(my_desk)·gate 'desk'·레이아웃·/stats·/claim/setup |
> | 3 | TASK-6 | ③ 설정 '데스크 계정' 칸·저장 함수·오류 문구 |
>
> - **갈래**: new-mark TASK-1(도우미 `PatientDaysSql` 여섯째 칸 NewMark)이 합쳐진 갈래 위에서 한다. 그 갈래에서 `visitBasis.test.ts`의 SQL 글 시험이 깨져 있고 TASK-2가 고친다. 시연 때문에 stats-insights Phase 2~4(TASK-6~8)보다 먼저 한다.
> - **stats-insights 남은 TASK-6~8과 겹치는 파일**: `docs/ADR.md` 하나(stats-insights TASK-6). 이 명세 TASK-1이 먼저 ADR-031을 넣는다. stats-insights TASK-6이 먼저 ADR을 넣었으면 그다음 번호를 쓰고 design.md 'ADR-031' 글의 번호만 바꾼다. 그 밖의 파일(`src/components/stats/**`·`src/workers/stats/**`·`src/types/stats.ts`·`docs/UI_GUIDE.md`·`src/app/globals.css`)은 이 명세가 고치지 않는다.
> - 이 명세 안 TASK끼리는 Phase가 달라도 겹치는 파일이 없다. 잇는 곳: TASK-4가 `AppShell`에 `desk?` 칸을 만들고 TASK-5가 레이아웃에서 넘긴다. TASK-5·6은 TASK-1의 SQL 함수 이름(design.md 'DB')을 그대로 쓴다.
> - **사용자 단계**: 배포 전 `supabase/migrations/20261118100000_desk_accounts.sql`을 Supabase SQL Editor에 붙여 넣기(SQL 먼저, 웹 다음 — design.md '배포 순서'). Claude는 실제 Supabase에 붙지 않는다. 도우미 새 판은 없다.

## TASK-1: 데스크 계정 DB·ADR-031
- Phase: 1
- AC: AC-6303.1, AC-6303.2, AC-6303.3, AC-6303.4, AC-6303.5, AC-6303.6, AC-6303.7, AC-6303.8
- REQ: REQ-6303
- Files: supabase/migrations/20261118100000_desk_accounts.sql, supabase/desk.rls.test.ts, docs/ADR.md, docs/ARCHITECTURE.md, plan.md, CLAUDE.md
- Tests: supabase/desk.rls.test.ts
- TDD: required — design.md '③④ 데스크 계정 — DB'. 시험은 `supabase/sunap.rls.test.ts`·`calendar.rls.test.ts`처럼 PGlite에서 진짜 migration을 차례로 돌린다(auth → precheck_settings → worklog·worklog_bit_fields·worklog_memo_font·worklog_cash_float → stats_rx_groups·stats_rx_groups_exclude → stats·revenue·ai_report(AC-6303.5의 표가 있게) → sunap → calendar → 이 파일). 흉내 `auth.users`에는 `last_sign_in_at` 칸을 더하고, 사용자마다 JWT의 `sub`·`email`을 넣는다. 원장 A·B, 대기·거절 병원, 데스크(A 메일), 아무 병원 없는 사용자로 표 권한·정책·기본값·트리거(rev·1년 지우기)·restrictive 가입 막기·두 번 실행·`my_hospital_id()` 글자 그대로를 본다. `docs/ADR.md` 끝에 design.md 'ADR-031' 글, `CLAUDE.md`는 design.md가 적은 한 줄만, `plan.md`는 §0-1·§2-1에 "데스크 계정은 예외(ADR-031)", §5 DB 표에 `hospital_members` 한 줄, §10 "직원·원장 계정과 역할(구성원 표)" 뒤에 "→ 2026-11-18 사용자가 '데스크 계정 따로'로 데스크 역할만 다시 꺼냄(ADR-031, specs/desk-feedback). 다른 역할은 그대로 미룸", `docs/ARCHITECTURE.md`는 DB 표·인증 줄만. **실제 Supabase에 붙여 넣지 않는다**

## TASK-2: 대시보드 물리치료 칸
- Phase: 1
- AC: AC-6302.1, AC-6302.2, AC-6302.3, AC-6302.4
- REQ: REQ-6302
- Files: src/components/dashboard/live/rxGroups.ts, src/components/dashboard/live/rxGroups.test.ts, src/components/dashboard/live/BitDashboard.tsx, src/components/dashboard/live/BitDashboard.test.tsx, src/components/dashboard/live/DashboardSkeleton.tsx, src/components/dashboard/live/DashboardSkeleton.test.tsx, src/components/dashboard/live/visitBasis.test.ts, src/components/dashboard/summary/view.ts, src/components/dashboard/summary/view.test.ts, src/components/dashboard/summary/DailySection.tsx, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/components/dashboard/summary/LiveDashboard.test.tsx, src/app/(app)/dashboard/page.test.tsx, src/app/(app)/tabFrame.test.tsx
- Tests: src/components/dashboard/live/rxGroups.test.ts, src/components/dashboard/summary/view.test.ts, src/components/dashboard/live/BitDashboard.test.tsx, src/components/dashboard/live/DashboardSkeleton.test.tsx
- TDD: required — design.md '② 대시보드 물리치료 칸'. 도우미·Worker·저장 모양은 고치지 않는다(묶음별 환자 수는 하루 줄 `groups`에 이미 있다). `readDashboardGroups`의 수납일지 설정 읽기는 따로 감싸 실패해도 묶음은 그대로다. 칸 수를 다섯으로 고정한 기존 시험(BitDashboard·DashboardAnalysis·LiveDashboard·dashboard page·tabFrame·뼈대)은 여섯 칸·'숫자 6개와 보고 문장에 적용'으로 수만 맞춘다. 화면 글은 시안 ② 그대로이되 칸 아래 '재진 중'은 넣지 않는다(requirements.md '시안과 다르게 정한 것')
- 메모: visitBasis.test.ts의 SQL 글 기대값에 new-mark NewMark 칸을 더함(new-mark TASK-1 뒤 깨진 시험 고침). `helper/src/Precheck.Core/Stats/StatsSql.cs`는 고치지 않는다.

## TASK-3: 수납일지 다음 예약 번호 고르기
- Phase: 2
- AC: AC-6301.1, AC-6301.2, AC-6301.3, AC-6301.4, AC-6301.5
- REQ: REQ-6301
- Files: src/components/sunap/rsvKeys.ts, src/components/sunap/rsvKeys.test.ts, src/components/sunap/rows/LedgerRows.tsx, src/components/sunap/rows/LedgerRows.test.tsx, src/components/sunap/rows/RsvPicker.tsx, src/components/sunap/SunapScreen.test.tsx
- Tests: src/components/sunap/rsvKeys.test.ts, src/components/sunap/rows/LedgerRows.test.tsx
- TDD: required — design.md '① 다음 예약 번호 고르기'. `rsvKeys.ts`는 순수 함수만(장부 줄 울타리 `components/sunap/rows`가 불러도 되게 네트워크·저장소·supabase 없음). 키는 `onEdit`(지금의 고치기 길)로만 보낸다. 번호표·판 번호 때문에 같은 글자가 둘 보여 깨지는 기존 시험(LedgerRows·SunapScreen)은 범위를 좁혀(`within`) 맞춘다. 마감한 날 동작은 바꾸지 않는다

## TASK-4: 데스크 화면 — 세 탭·막힌 화면·링크 숨김
- Phase: 2
- AC: AC-6306.1, AC-6306.2, AC-6306.3, AC-6306.4
- REQ: REQ-6306
- Files: src/components/shell/menu.ts, src/components/shell/role.tsx, src/components/shell/DeskGate.tsx, src/components/shell/DeskGate.test.tsx, src/components/shell/AppShell.tsx, src/components/shell/TabBar.tsx, src/components/shell/AccountMenu.tsx, src/components/shell/shell.test.tsx, src/components/worklog/BitNotice.tsx, src/components/worklog/BitNotice.test.tsx, src/components/sunap/SunapSettings.tsx, src/components/sunap/SunapSettings.test.tsx
- Tests: src/components/shell/shell.test.tsx, src/components/shell/DeskGate.test.tsx, src/components/worklog/BitNotice.test.tsx, src/components/sunap/SunapSettings.test.tsx
- TDD: required — design.md '④ 데스크 화면'. 새 칸은 모두 선택 칸(`desk?`, `useDesk()` 기본 거짓)이라 원장 화면과 기존 시험은 그대로여야 한다. `DeskGate` 시험은 `next/navigation`의 `usePathname`·`useRouter`를 흉내 내 '/dashboard' 바꾸기·막힌 화면·세 탭·옆 화면 옮김을 본다. 막힌 화면·칩 글은 시안 ④ 그대로. 앱 틀 파일 글자 규칙(색 값 주석 금지 등, `comments.test.ts`·`classes.test.ts`)을 지킨다

## TASK-5: 데스크 로그인 — 문지기·레이아웃
- Phase: 3
- AC: AC-6305.1, AC-6305.2, AC-6305.3, AC-6305.4, AC-6305.5
- REQ: REQ-6305
- Files: src/lib/auth/hospital.server.ts, src/lib/auth/hospital.server.test.ts, src/lib/auth/gate.ts, src/lib/auth/gate.test.ts, src/lib/auth/guard.server.ts, src/lib/auth/guard.server.test.ts, src/app/(app)/layout.tsx, src/app/(app)/layout.test.tsx, src/app/(app)/stats/page.tsx, src/app/(app)/stats/page.test.tsx, src/app/(app)/claim/setup/page.tsx, src/app/(app)/claim/setup/page.test.tsx, src/app/api/ai/forms/route.test.ts
- Tests: src/lib/auth/hospital.server.test.ts, src/lib/auth/gate.test.ts, src/lib/auth/guard.server.test.ts, src/app/(app)/layout.test.tsx, src/app/(app)/stats/page.test.tsx, src/app/(app)/claim/setup/page.test.tsx, src/app/api/ai/forms/route.test.ts
- TDD: required — design.md '④ 데스크 로그인 — 문지기'. 문지기는 읽기만 한다(`my_desk` 부르기 하나, ADR-004·ADR-031). 원장 판정·`middleware.ts`·`/auth/callback`·AI 경로 코드는 고치지 않는다(AI 경로는 시험 하나로 403을 증명). `Me.desk`는 선택 칸이라 다른 시험의 `Me` 흉내는 고치지 않는다. 레이아웃 시험의 데스크 경우는 `DeskGate`가 쓰는 `useRouter`도 흉내 낸다

## TASK-6: 설정 '데스크 계정' 칸
- Phase: 3
- AC: AC-6304.1, AC-6304.2, AC-6304.3
- REQ: REQ-6304
- Files: src/types/desk.ts, src/lib/storage/desk.ts, src/lib/storage/desk.test.ts, src/components/settings/DeskAccounts.tsx, src/components/settings/DeskAccounts.test.tsx, src/components/settings/SettingsPage.tsx, src/app/(app)/settings/page.test.tsx, src/lib/errors.ts, src/lib/errors.test.ts, src/types/errors.ts, src/components/settings/InstallFilesCard.test.tsx
- Tests: src/lib/storage/desk.test.ts, src/components/settings/DeskAccounts.test.tsx, src/lib/errors.test.ts
- TDD: required — design.md '③ 설정 데스크 계정 칸'. 저장 시험은 부르는 함수 이름·인자가 정해 둔 것뿐인지, 틀린 답·오류에서 Supabase 문구·메일이 새지 않는지 본다. 화면 시험은 저장 함수를 흉내 내 다섯 답·5줄 꺼짐·[빼기]·읽기 실패를 본다. 오류 여섯은 design.md 표 글 그대로. 설정 페이지 시험은 새 칸이 맨 아래에 있는지만 더하고 저장은 흉내 낸다

## TASK-7: 검토 고침 (설정 읽기 따로 기다리기·메일 예시 빼기·계획 문서 표 차례)
- Phase: 4
- AC: AC-6302.5, AC-6304.3
- REQ: REQ-6302, REQ-6304
- Files: src/components/dashboard/live/rxGroups.ts, src/components/dashboard/live/rxGroups.test.ts, src/lib/errors.ts, src/lib/errors.test.ts, src/components/settings/DeskAccounts.test.tsx, plan.md
- Tests: src/components/dashboard/live/rxGroups.test.ts, src/lib/errors.test.ts
- TDD: required — 마지막 검토(2026-11-18 오후)에서 나온 것. 오류 문구의 메일 예시는 '코드 속 메일 모양 글자는 관리자 연락처 하나'(AC-409.3) 규칙 때문에 뺀다. plan.md DB 표의 데스크 줄(`hospital_members`)은 rx-picker·treatment-trend 문서 시험이 차례를 보는 줄들(`rx_groups`·`stats_rx_picks`·`sales_days`) 아래로 옮긴다.

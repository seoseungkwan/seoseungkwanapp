# 작업 분할: 웹앱 ↔ 병원 구글 시트·캘린더 잇기 (google-link)

> 형식: `## TASK-n: 제목` 아래에 `- Phase:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 고친다. TASK마다 일꾼 하나(각자 git worktree, ssk-parallel-workers). **Phase별로 step, 같은 Phase는 병렬이고 같은 Phase의 TASK끼리 파일이 겹치지 않는다.** 다음 Phase는 앞 Phase를 모두 합친 뒤 시작한다. 같은 Phase에서 새로 만드는 파일은 서로 부르지 않는다(필요하면 자기 입력 타입을 스스로 둔다 — design.md 10절).
> **MVP 모드**: 중간 검토 없이 Phase 끝마다 그 Phase 시험 파일과 `npx tsc --noEmit`만 돌리고, 마지막 TASK-23에서 전체 검사 → 화면 사진 → 독립 검토 한 번(재검토는 사용자에게 묻고). **시험 먼저(TDD)**: 시험 이름에 AC ID, 실패(RED)를 본 뒤 만든다. 가짜 이름(시안의 홍길동·최시안 등)·가짜 메일(`@fake.test`)·지어낸 비밀 글자만.
> **화면 TASK(15~22)의 화면 글자·자리·모양은 승인된 시안 `docs/mockups/google-link`(`sunap.html`·`notes-sunap.md`·`calendar.html`·`notes-calendar.md`, 사용자 2026-11-26 "이대로 만들기") 그대로**다. 다른 곳은 design.md 2절 '시안과 다른 곳' 표뿐. **폰 전용 모양은 만들지 않는다**(사용자 규칙 2026-11-21 — `max-md:` 새 줄 없음, 폰 폭 사진 없음, 넓은 표는 표 칸만 옆으로 밀림).
> 비밀 글자(수납 TOKEN·예약 KEY)는 커밋·로그·출력·시험 스냅숏에 진짜 값을 내지 않는다(design.md 5절).
>
> | Phase | TASK | 하는 일 |
> |---|---|---|
> | 1 | TASK-1 | 문서: ADR-052~055 · CLAUDE.md 예외 두 줄 · plan.md · ARCHITECTURE.md + 문서 시험 |
> | 1 | TASK-2 | DB: migration 하나(예약 칸·새 표 여덟·트리거·색 옮기기·휴무 'm-' 줄·`calendar_off_names`) + RLS 시험 |
> | 1 | TASK-3 | 예약 자료 모양: 11색·꽉 채운 칸·5분 시작·시행자 없음·구글 칸(타입·토큰·저장 함수·쓰는 곳 모두) |
> | 1 | TASK-4 | 구글 연결 타입·저장 함수(`lib/storage/gcal`·`gsheet`) + 오류 번호(E-GCAL-*·E-GSHEET-*) |
> | 1 | TASK-5 | 수납 구글 코드 8판(`google-code/sheet`) + 가짜 구글 + 시험 옮기기 |
> | 1 | TASK-6 | CSP: connect 두 origin · `/sunap`만 frame-src |
> | 1 | TASK-7 | 순수 셈: 구글 제목 알아보기·제목 꼴·칠하기·off 줄·맞춤 판단(`lib/calendar/g*`) |
> | 1 | TASK-8 | 순수 셈: 수납 넣기 계획·결과 글·설정 검사·상태 알림(`lib/gsheet`) |
> | 1 | TASK-9 | 도우미 Core: 비트시트 줄 만들기·설정·가져오기·지문·답 읽기 옮기기(`Precheck.Core/Sheet`) |
> | 2 | TASK-10 | 도우미 0.14.0 + 크롬 확장 0.5.0: 수납 명령 여덟·비밀 글자·주소 바꾸기 확인 창·클립보드·시간 제한·`calday` 400일 + 통로 명령표·판 |
> | 2 | TASK-11 | 예약 구글 코드 1판(`google-code/calendar`) + 가짜 캘린더 + 웹에 싣는 코드 만들기 |
> | 2 | TASK-12 | 예약 맞춤 엔진(`lib/gcal`): 부르기·받기·보내기·처음 가져오기·돌기·상태 + 울타리 |
> | 2 | TASK-13 | 수납 넣기 돌리기(`lib/gsheet/runner`·`reply`) |
> | 3 | TASK-14 | 보이지 않는 두 부품(`GoogleSheetAuto`·`GcalSync`) + 비트 통로 빌리기(`bitLane`·`useBridge`) |
> | 3 | TASK-15 | 수납일지 구글 시트 보기(틀·띠·달 고르기·넣기 단추·덮어쓰기 창·결과 줄·알림·none·nobit·err) |
> | 3 | TASK-16 | 수납일지 시트 설정 화면(네 칸·가져오기 알림·안내문) |
> | 3 | TASK-17 | 설정 › 구글 캘린더 › 잇기 · 맞춤 방법 + 안 메뉴 틀 |
> | 3 | TASK-18 | 설정 › 구글 캘린더 › 시행자·종류 |
> | 3 | TASK-19 | 처음 가져오기 미리 보기 |
> | 3 | TASK-20 | 예약표 칸 칠하기·종일 칩·고쳐야 함 빗금·주황 시계·5분 자리(`calendar/rows`) |
> | 3 | TASK-21 | 예약 탭: 구글 띠·고쳐야 할 판·자세히 구역·닿지 못함·저장 잇기·톱니·지난 도착 채우기 |
> | 3 | TASK-22 | 직원 탭 휴가 → 구글 off 줄 |
> | 4 | TASK-23 | 잇기(앱 틀·탭 줄 점·데스크 문지기·설정 안 메뉴·새 페이지·수납 탭 머리) + 전체 검사·화면 사진·검토 한 번 |
> | 4 | TASK-24 | 사용자와 함께 확인(시험 아님) |
>
> - 같은 Phase 파일 겹침 확인(2026-11-26):
>   - Phase 1 — TASK-1은 문서 넷 + `src/googleLinkDocs.test.ts`, TASK-2는 `supabase/` 아래 정해 둔 파일, TASK-3은 `src/types/calendar.ts`·`clinicProfile.ts`·`src/lib/calendar/{shapes,counts,clinic,occupancy,rules,rebook}*`·`src/lib/storage/{calendar,clinicProfile}*`·`src/components/calendar/**`·`src/components/stats/**`·`src/components/location/map/KakaoMap*`·`src/components/location/LocationScreen.test.tsx`·`src/workers/calendar/**`·정해 둔 설정·직원·비교·알림 파일·`globals.css`·`theme.test.ts`·`docs/UI_GUIDE.md`, TASK-4는 `src/types/{gcal,gsheet,errors}.ts`·`src/lib/storage/{gcal,gsheet,maskPrivate}*`·`src/lib/errors*`, TASK-5는 `google-code/sheet/`·`google-code/test/{fakeGoogle,sheet,sheetMonths}*`·`vitest.config.ts`, TASK-6은 `src/lib/csp*`·`next.config.ts`·`src/{location,sunap}-headers.test.ts`, TASK-7은 `src/lib/calendar/{gshapes,gtitle,goff,gsync,gpaint,josa}*`, TASK-8은 `src/lib/gsheet/{shapes,plan,result,check,status}*`, TASK-9는 `helper/src/Precheck.Core/Sheet/`·`helper/tests/Precheck.Core.Tests/Sheet/`·`helper/tests/sheet-core.dotnet.test.ts` → 겹침 없음. TASK-4는 TASK-3의 `CalColor`를, TASK-7은 `types/calendar.ts`를, TASK-8은 `types/gsheet.ts`를 import하지 않는다(각자 모양을 둠).
>   - Phase 2 — TASK-10은 `helper/` 나머지·`src/lib/bridge/`의 정해 둔 파일·`src/types/bridge.ts`·`extension/manifest.json`·확장 시험·판 글자 시험, TASK-11은 `google-code/calendar/`·`google-code/test/{fakeCalendar,calendar}*`·`scripts/google-code.mjs`·`scripts/googleCode.test.ts`·`src/lib/gcal/calendarCode.ts`·`package.json`, TASK-12는 `src/lib/gcal/`의 정해 둔 파일(`calendarCode.ts` 밖)·`eslint.config.mjs`·`src/guardrails.test.ts`, TASK-13은 `src/lib/gsheet/{runner,reply}*` → 겹침 없음. TASK-13은 TASK-10의 `types/bridge.ts`를 import하지 않는다.
>   - Phase 3 — TASK-14는 `src/components/gsheet/auto/`·`src/components/gcal/`·`src/components/claim/{bitLane,useBridge}*`, TASK-15는 `src/components/gsheet/view/`, TASK-16은 `src/components/gsheet/settings/`, TASK-17은 `src/components/gcalSettings/{frame,connect,rules}/`, TASK-18은 `src/components/gcalSettings/colors/`, TASK-19는 `src/components/gcalSettings/import/`, TASK-20은 `src/components/calendar/rows/`·`src/lib/calendar/layout*`, TASK-21은 `src/components/calendar/`의 `rows/` 밖 정해 둔 파일·`src/components/calendar/gcal/`·`src/workers/calendar/`·`src/app/(app)/calendar/`, TASK-22는 `src/components/staff/leave/` → 겹침 없음. TASK-20·21은 예약표 prop `RowsGoogle`(design.md 10-4, TASK-7이 둠) 이름 그대로 주고받는다. 화면끼리는 서로 부르지 않고 TASK-23이 잇는다.
>   - Phase 4 — TASK-23·24.
> - 고치지 않는 것: 앞 migration 파일 모두, `src/app/api/**`(새 서버 코드 없음), `src/middleware.ts`·`src/lib/supabase/**`·`src/lib/auth/**`, 확장 코드(`extension/src/background.ts`·`relay.ts` — 코드는 그대로, 판 글자 `extension/manifest.json` 0.5.0과 다시 묶는 명령표만 TASK-10), 업무일지 탭(`src/components/worklog/**`), 웹앱 수납일지 화면(`src/components/sunap/**` — [웹앱 수납일지]에 그대로 씀), `bitsheet/`(옮기기만, 그 폴더는 고치지 않음), `docs/mockups/google-link/`(승인된 시안).
> - 다른 갈래와 겹칠 수 있는 파일: `CLAUDE.md`·`docs/ADR.md`(번호 052~055)·`docs/ARCHITECTURE.md`·`plan.md`, `src/types/errors.ts`·`src/lib/errors.ts`, `src/lib/bridge/commands.json`·`versions.ts`·`helper/Directory.Build.props`(도우미 판), `src/app/globals.css`·`docs/UI_GUIDE.md`, `src/components/shell/AppShell.tsx`·`TabBar.tsx`·`menu.ts`, `src/components/claim/bitLane.ts`·`useBridge.ts`, `src/lib/csp.ts`·`next.config.ts`, `supabase/adminView.rls.test.ts`(AC-8002.8 목록), `eslint.config.mjs`·`src/guardrails.test.ts`, `vitest.config.ts`·`package.json`. 합칠 때 앞 갈래를 먼저 받고 번호·목록만 맞춘다. 다시 만드는 휴가 트리거 함수 둘은 합칠 때 그 함수의 마지막 정의를 다시 옮긴다.
> - **사용자 단계**: (1) 시안 승인 — 끝(2026-11-26 "이대로 만들기"). (2) `/sdd approve google-link` — `CLAUDE.md` 예외 두 줄(design.md 17절)도 이 승인에 든다. (3) 모두 합친 뒤 배포 전 Supabase SQL Editor에 `supabase/migrations/20261126000000_google_link.sql`을 붙여 넣고 Run(SQL 먼저, 웹 다음). 멈추면 그 글을 Claude에게 알린다. Claude는 실제 Supabase에 붙지 않는다. (4) 도우미 0.14.0과 크롬 확장 0.5.0을 한 묶음으로 의원 PC에 설치(`helper.yml`이 `precheck-helper-0.14.0.zip`과 `precheck-extension-0.5.0.zip`을 함께 만든다, `ssk-clinic-pc-files`). 확장이 옛 판(0.4.x)이면 수납 넣기는 `E-GSHEET-EXT` 안내만 보인다. (5) TASK-24를 사용자와 함께. **배포·합치기(운영 갈래)는 사용자가 말할 때만** 한다.

## TASK-1: 문서 — ADR-052~055 · CLAUDE.md 예외 두 줄 · plan.md · ARCHITECTURE.md
- Phase: 1
- AC: AC-8501.1, AC-8501.2, AC-8501.3
- REQ: REQ-8501
- Files: docs/ADR.md, docs/ARCHITECTURE.md, plan.md, CLAUDE.md, src/googleLinkDocs.test.ts
- Tests: src/googleLinkDocs.test.ts
- TDD: required — 시험이 먼저 `docs/ADR.md` 끝의 ADR-052~055 제목·ADR-030 제목 꼬리 ` (ADR-053이 넓힘)`, `CLAUDE.md`의 `예외 (ADR-052)`·`예외 (ADR-053)` 두 줄(design.md 17절 글 그대로, '예외 (ADR-046·047)' 줄 바로 다음), `CLAUDE.md`의 CRITICAL 줄들이 지금 글과 같음(시험 안에 지금 CRITICAL 줄 글을 적어 두고 견줌), `plan.md` §4·§5 줄·`docs/ARCHITECTURE.md` 줄(design.md 18절)을 본다. 글은 design.md 16~18절에서 한 글자도 바꾸지 않고 옮긴다. 지금 문서 시험(`src/b2b-merge.test.ts`·`src/inventoryDocs.test.ts` 등 문서를 읽는 시험)도 고치지 않고 지나야 한다

## TASK-2: DB — 새 migration 하나 + RLS 시험
- Phase: 1
- AC: AC-8502.1, AC-8502.2, AC-8502.3, AC-8502.4, AC-8502.5, AC-8502.6, AC-8502.7, AC-8502.8, AC-8502.9, AC-8502.10, AC-8502.11, AC-8502.12, AC-8502.13, AC-8502.14
- REQ: REQ-8502
- Files: supabase/migrations/20261126000000_google_link.sql, supabase/googleLink.rls.test.ts, supabase/calendar.rls.test.ts, supabase/clinicEmr.rls.test.ts, supabase/clinicProfile.rls.test.ts, supabase/staff.rls.test.ts, supabase/adminView.rls.test.ts
- Tests: supabase/googleLink.rls.test.ts, supabase/calendar.rls.test.ts, supabase/clinicEmr.rls.test.ts, supabase/clinicProfile.rls.test.ts, supabase/staff.rls.test.ts, supabase/adminView.rls.test.ts
- TDD: required — design.md 7절 그대로(칸 이름·제약 이름·트리거 이름·권한 표 7-5·색 옮기기 표 7-4·기본 종류 jsonb). SQL은 Write 도구로 쓴다(머리 주석 모양은 `20261124000000_admin_view.sql`, 두 번 실행 안전, 기본 권한 모두 거둔 뒤 필요한 것만 줌, 보는 관리자 정책은 ADR-046 이름·꼴). 시험은 `supabase/location.rls.test.ts`의 PGlite + Supabase 흉내를 옮기고 지금 모든 migration을 파일 이름 차례로 → 이 파일 → 이 파일(파일이 없으면 시험마다 실패 = RED, `existsSync`). 계정은 원장·데스크·다른 병원·승인 대기·anon·보는 관리자(요청 머리 `set_config('request.headers', …)`). 휴가 트리거 두 함수는 `20261121000000_staff.sql`의 지금 정의를 글자 그대로 옮기고 'm-' 갈래만 더한다. 꼭 넣을 시험: 구글과 이어진 1년 지난 예약·메모·off 줄을 둔 뒤 새 예약을 넣어 1년 지우기를 돌리면 `gcal_deletes`·`gcal_off_days`가 그대로(AC-8502.10), 사용자 고침 → `auto`만 고침 → `g_note`만 고침 사이에 `g_wait_at`이 첫 값 그대로이고 `g_wait`를 비우면 null·사용자는 `g_wait_at`을 못 씀(AC-8502.11, 종일 메모도), `orig_start` 1435(AC-8502.12), **구글에서 메모 글을 고치면 양쪽에 고친 글로 남음(DB 몫)**: 원장·데스크가 구글과 이은 종일 메모의 `memo`·`day`를 고치면 같은 줄이 바뀌고 `gcal_deletes`에 줄이 생기지 않으며 `g_event_id` 그대로, off 줄 `memo`·`day` 고치기는 `P0001`, `type`·`staff_*`·`part`·`leave_id` 고치기는 권한 없음, 보는 관리자는 고치기 0줄(AC-8502.13), `gsheet_settings.conf`에 `scriptUrl`·`url`·`shareWith` 열쇠가 있으면 거부(AC-8502.14), **`g_wait_at`은 DB가 준 시각 글자 그대로 견줌**: 고친 뒤 읽은 `g_wait_at` 글자(마이크로초까지)를 그대로 조건에 넣은 `update … where g_wait_at = $1`은 1줄, 그 글자를 JS `Date`로 바꿨다 되돌린 글자(밀리초)로는 0줄임을 PGlite에서 보인다, 보는 관리자가 `calendar_allday` 새 칸은 읽고 `calendar_appts`·`gcal_*`는 0줄(AC-8502.2), `calendar_settings.staff` 색 옮기기(AC-8502.4). 옛 RLS 시험 다섯은 **새 규칙이 기대를 바꾼 곳만**(시작 345가 이제 됨·시행자 세 칸 null·`kinds` 기본값·색 이름) 고치고 그 줄에 `google-link AC-8502.x` 주석을 단다. `adminView.rls.test.ts`는 AC-8002.8 목록에 새 표 여덟('보기 ○' gsheet 셋·'보기 ×' gcal 다섯)만 더한다. **실제 Supabase에 붙여 넣지 않는다**

## TASK-3: 예약 자료 모양 — 11색 · 꽉 채운 칸 · 5분 시작 · 시행자 없음 · 구글 칸
- Phase: 1
- AC: AC-8503.1, AC-8503.2, AC-8503.3, AC-8503.4, AC-8503.5, AC-8503.6, AC-8505.3
- REQ: REQ-8503, REQ-8505
- Files: src/types/calendar.ts, src/types/clinicProfile.ts, src/lib/calendar/shapes.ts, src/lib/calendar/counts.ts, src/lib/calendar/counts.test.ts, src/lib/calendar/clinic.ts, src/lib/calendar/clinic.test.ts, src/lib/calendar/occupancy.ts, src/lib/calendar/occupancy.test.ts, src/lib/calendar/rules.ts, src/lib/calendar/rules.test.ts, src/lib/calendar/rebook.ts, src/lib/calendar/rebook.test.ts, src/lib/storage/calendar.ts, src/lib/storage/calendar.test.ts, src/lib/storage/clinicProfile.ts, src/lib/storage/clinicProfile.test.ts, src/components/calendar/**, src/components/stats/**, src/workers/calendar/**, src/components/admin/compare/statsInput.ts, src/components/admin/compare/statsInput.test.ts, src/lib/admin/compare/rank.ts, src/lib/admin/compare/rank.test.ts, src/lib/analytics/alerts.ts, src/lib/analytics/alerts.test.ts, src/components/settings/ClinicProfileCard.tsx, src/components/settings/ClinicProfileCard.test.tsx, src/components/settings/viewMode.test.tsx, src/components/staff/labels.ts, src/components/staff/schedule/WeekTable.tsx, src/components/staff/StaffNav.test.tsx, src/components/staff/leave/testData.ts, src/components/staff/leave/LeaveScreen.test.tsx, src/components/staff/roster/RosterScreen.test.tsx, src/components/staff/roster/pcOnly.test.tsx, src/components/location/map/KakaoMap.tsx, src/components/location/map/KakaoMap.test.tsx, src/components/location/LocationScreen.test.tsx, src/app/globals.css, src/app/theme.test.ts, docs/UI_GUIDE.md
- Tests: src/lib/calendar/rules.test.ts, src/lib/calendar/rebook.test.ts, src/components/calendar/AddPanel.test.tsx, src/components/location/map/KakaoMap.test.tsx, src/app/theme.test.ts, src/components/calendar/colors.test.ts, src/lib/storage/calendar.test.ts, src/lib/storage/clinicProfile.test.ts, src/lib/calendar/counts.test.ts, src/components/settings/ClinicProfileCard.test.tsx, src/components/stats/sections/CalendarSection.test.tsx, src/components/calendar/rows/TimeGrid.test.tsx
- TDD: required — design.md 10-1·10-3(저장 함수 `storage/calendar.ts` 몫)·7-4 그대로. 시험 먼저: 11색 차례·hex·글자색(`theme.test.ts`), 색판 이름 글(병원 정보·예약 설정 서랍), 저장 함수의 새 칸 이름·5분·시행자 세 칸 함께·보내는 칸에 전화·성별·나이·생일 없음·개인정보 모양이 남은 `g_title`은 보내지 않음(AC-8505.3, 가리기 함수는 TASK-4 몫이라 부르지 않음)·`g_wait_at`은 보내지 않음·`markApptSent`·`applyGoogleAppt` 조건(`g_wait_at` 그대로일 때만), `g_moved` 변경 셈, 지운 시행자·종류 = 캘린더 기본 색. 예약 칸·종일 칩·월 보기 칩은 이 TASK에서 **꽉 채운 모양**(색 + `--cal-<이름>-on` 글자색)으로만 바꾸고 칸 글·자리는 그대로(취소·변경·구글 색 차례·시계·빗금은 TASK-20). 시행자 null은 칸 표시 없음·통계 줄 이름 `시행자 없음`. 직원 탭 휴가 칩·근무표 점·입지 지도 둘레 점은 같은 hex의 `--leave-*`·`--staff-dot`·`--map-other*` 토큰으로 옮겨 그 화면이 바뀌지 않게(시험: 클래스·값, UI_GUIDE 줄). **5분 시작은 모두 이 TASK**: `rules.ts` `parseStart`(5분 단위·1435), 추가·고치기 판 글·고르기 목록(design.md 2절 표 16), 저장 함수. 시행자 null은 `rules.ts` 다음 주 초안·`rebook.ts` 묶음 열쇠에서도 다룬다(TASK-21은 5분을 다루지 않음). 시험 안 옛 20색 이름은 design.md 7-4 표대로 새 이름으로 바꾸고, 그 밖 기대는 바꾸지 않는다. 끝에 `npx tsc --noEmit`이 지나야 한다(이 Files 안에서만 고침)

## TASK-4: 구글 연결 타입 · 저장 함수 · 오류 번호
- Phase: 1
- AC: AC-8505.1, AC-8505.2, AC-8505.3, AC-8524.2, AC-8515.5
- REQ: REQ-8505, REQ-8524
- Files: src/types/gcal.ts, src/types/gsheet.ts, src/lib/storage/gcal.ts, src/lib/storage/gcal.test.ts, src/lib/storage/gsheet.ts, src/lib/storage/gsheet.test.ts, src/lib/storage/maskPrivate.ts, src/lib/storage/maskPrivate.test.ts, src/types/errors.ts, src/lib/errors.ts, src/lib/errors.test.ts
- Tests: src/lib/storage/gcal.test.ts, src/lib/storage/gsheet.test.ts, src/lib/storage/maskPrivate.test.ts, src/lib/errors.test.ts
- TDD: required — design.md 10-2·10-3·9-3·14절 그대로. 본보기 `src/lib/storage/staff.ts`·`staff.test.ts`(가짜 `supabaseBrowser`, 보내는 칸·고르는 칸을 글자로 견줌). `types/gcal.ts`는 11색 이름 `GColor`를 스스로 둔다. 비밀 글자는 `loadGcalLink` 답에만(다른 함수 답·오류 글에 없음을 시험), 실패는 `GcalStorageError('offline'|'failed')`·`GsheetStorageError` 하나. 기본값(비트시트 7판·예약 look·rules)은 design.md 10-2 그대로 상수로. 기록 넣기는 숫자·오류 번호·칸 주소만 보내고 다른 열쇠가 섞이면 보내지 않음. `saveGsheetSettings`는 `scriptUrl`·`url`·`shareWith` 열쇠가 든 값을 보내지 않고 `'invalid'`(코드 주소·메일은 도우미에만, AC-8505.2). `maskPrivate`(design.md 10-3)는 전화·주민번호·메일 모양 조각마다 `…`(`privacyProblem`과 같은 모양을 `it.each`로). 오류 번호 E-GCAL-* 아홉·E-GSHEET-* 스물둘(`E-GSHEET-EXT`·`E-GSHEET-DECLINED` 포함)은 글자 그대로(시험이 design.md 표 글을 적어 견줌)

## TASK-5: 수납 구글 코드 8판 · 가짜 구글 · 시험 옮기기
- Phase: 1
- AC: AC-8506.1, AC-8506.2, AC-8506.3, AC-8506.4, AC-8506.5
- REQ: REQ-8506
- Files: google-code/sheet/Code.gs, google-code/test/fakeGoogle.ts, google-code/test/sheet.test.ts, google-code/test/sheetMonths.test.ts, vitest.config.ts
- Tests: google-code/test/sheet.test.ts, google-code/test/sheetMonths.test.ts
- TDD: required — 비트시트 작업 트리 파일(`../bitsheet/apps-script/Code.gs`·`test/code.test.js`·`test/fake-google.js`, git HEAD 말고 파일 그대로)을 옮긴다. 먼저 `vitest.config.ts` include에 `google-code/test/**/*.test.ts`를 더하고, 7판 시험을 vitest로 옮겨(기대값 그대로) 7판 코드로 초록을 본 뒤, 새 시험(hello의 mac이 `HMAC-SHA256(TOKEN, nonce)`이고 nonce 꼴이 틀리면 `bad_request`, 코드가 `ScriptApp`을 부르지 않음(가짜 구글에 `ScriptApp`이 없어도 돎), 비밀 글자 자리 그대로면 `token_not_set`(7판과 같은 이름), months·소유 확인·sheetGid·`__TOKEN__` 한 번·답에 이름·차트번호 없음)을 RED로 보고 8판으로 고친다(design.md 8-1). vm으로 `Code.gs`를 불러 돈다. 진짜 구글에 붙지 않는다

## TASK-6: CSP — connect 두 origin · `/sunap`만 frame-src
- Phase: 1
- AC: AC-8504.1, AC-8504.2, AC-8504.3
- REQ: REQ-8504
- Files: src/lib/csp.ts, src/lib/csp.test.ts, next.config.ts, src/location-headers.test.ts, src/sunap-headers.test.ts
- Tests: src/lib/csp.test.ts, src/location-headers.test.ts, src/sunap-headers.test.ts
- TDD: required — design.md 6절. `buildCsp`에 `opts.sheetFrame`, next.config 머리 `/sunap`·`/sunap/:path*`만 `sheetFrame: true`. 시험은 지금 `location-headers.test.ts` 모양으로 `next.config.ts` `headers()`를 불러 경로마다 CSP 글을 본다(와일드카드 없음, 다른 경로 frame-src 없음, `frame-ancestors 'none'`·`object-src 'none'`·`X-Frame-Options: DENY` 그대로, `/location` 카카오 그대로)

## TASK-7: 순수 셈 — 구글 제목 알아보기 · 제목 꼴 · 칠하기 · off 줄 · 맞춤 판단
- Phase: 1
- AC: AC-8520.1, AC-8520.2, AC-8520.3, AC-8520.4, AC-8520.5, AC-8520.6, AC-8521.1, AC-8521.2, AC-8521.3, AC-8521.4, AC-8522.1, AC-8522.2, AC-8522.3, AC-8523.1, AC-8523.2, AC-8523.3, AC-8523.4, AC-8523.5, AC-8523.6, AC-8523.7, AC-8523.8
- REQ: REQ-8520, REQ-8521, REQ-8522, REQ-8523
- Files: src/lib/calendar/gshapes.ts, src/lib/calendar/gtitle.ts, src/lib/calendar/gtitle.test.ts, src/lib/calendar/goff.ts, src/lib/calendar/goff.test.ts, src/lib/calendar/gsync.ts, src/lib/calendar/gsync.test.ts, src/lib/calendar/gpaint.ts, src/lib/calendar/gpaint.test.ts, src/lib/calendar/josa.ts, src/lib/calendar/josa.test.ts
- Tests: src/lib/calendar/gtitle.test.ts, src/lib/calendar/goff.test.ts, src/lib/calendar/gsync.test.ts, src/lib/calendar/gpaint.test.ts, src/lib/calendar/josa.test.ts
- TDD: required — 환자 자료 구역(네트워크·console·저장소·React·supabase 없음, `src/guardrails.test.ts` 그대로 지나야 함). design.md 10-4·12-1·13절. 알아보기 예 표(13절)는 `it.each`로 그대로, 까닭 글 일곱·고르기 글·미리 보기 여덟 줄·경고 다섯 글은 notes-calendar 글자를 시험에 적어 견준다. 조사는 `josa.ts`(이/가·을/를·은/는·와/과·로/으로, 한글 받침·ㄹ 받침·숫자 소리·그 밖 글자 — design.md 2절 표 7의 틀 글마다 받침 있는 낱말·없는 낱말 둘씩). off 줄: 목록 밖 이름은 남김(AC-8522.3), `offEventId`가 base32hex 글자만. 맞춤 판단은 `g_wait_at`으로 견준다 — '웹앱 고침 → 도착 바뀜 → 그 사이 구글 고침' 시험(AC-8523.2). `gshapes.ts`가 입력 모양·11색 colorId 표를 스스로 두고 `types/calendar.ts`를 import하지 않는다. 예약표 prop 모양 `RowsGoogle`도 여기 둔다. 시각은 한국 시각 글자만 다루고 날짜 셈은 `lib/analytics/dates.ts`를 쓴다

## TASK-8: 순수 셈 — 수납 넣기 계획 · 결과 글 · 설정 검사 · 상태 알림
- Phase: 1
- AC: AC-8512.1, AC-8512.2, AC-8512.3, AC-8512.4
- REQ: REQ-8512
- Files: src/lib/gsheet/shapes.ts, src/lib/gsheet/plan.ts, src/lib/gsheet/plan.test.ts, src/lib/gsheet/result.ts, src/lib/gsheet/result.test.ts, src/lib/gsheet/check.ts, src/lib/gsheet/check.test.ts, src/lib/gsheet/status.ts, src/lib/gsheet/status.test.ts
- Tests: src/lib/gsheet/plan.test.ts, src/lib/gsheet/result.test.ts, src/lib/gsheet/check.test.ts, src/lib/gsheet/status.test.ts
- TDD: required — 계획은 비트시트 `../bitsheet/app/src/Core/AutoPlanner.cs`와 그 시험(`app/tests/Tests.cs`의 AutoPlanner 시험들)을 TS로 옮긴다(같은 시각 표를 `it.each`로). 결과 글·막는 글은 notes-sunap `done`·`done-warn`·'저장 때 막는 글'·'진료실 저장 때 막는 글'·'저절로 넣기 막는 글'의 글자를 시험에 적어 견준다. 네트워크·저장소·React 없음. `types/gsheet.ts`(TASK-4)를 import하지 않고 `shapes.ts`에 자기 모양을 둔다

## TASK-9: 도우미 Core — 비트시트 줄 만들기·설정·가져오기·지문·답 읽기 옮기기
- Phase: 1
- AC: AC-8510.1, AC-8510.2, AC-8510.3, AC-8510.4, AC-8510.5
- REQ: REQ-8510
- Files: helper/src/Precheck.Core/Sheet/**, helper/tests/Precheck.Core.Tests/Sheet/**, helper/tests/sheet-core.dotnet.test.ts
- Tests: helper/tests/sheet-core.dotnet.test.ts
- TDD: required — 비트시트 작업 트리 파일(`../bitsheet/app/src/Core/*.cs`·`Bit/BitSql.cs`·`BitSource.cs`, 시험 `app/tests/Tests.cs`·`Fix7Tests.cs`)을 netstandard2.0 `Precheck.Core.Sheet`로 옮기고 시험 기대값을 바꾸지 않는다(design.md 9-1). 비트 읽기는 도우미 `IBitDb`(SELECT만·READ UNCOMMITTED·늘 되돌림)로. 새로: `SheetSettingsJson`·`BitSheetImport`(`IProtector`로 풂, 깨진 파일은 오류 번호만)·`SheetCode`(`__TOKEN__` 한 번)·`RowsPrint`(SHA-256)·`SheetReply`(숫자·칸 주소만, 오류 → design.md 9-3 번호)·`SheetUrls`(주소 꼴·넘김 host 검사)·`ISheetTransport`(보내기 약속, 진짜 HTTP는 TASK-10). 감싸개는 `helper/tests/sunap-read.dotnet.test.ts` 모양(FILTER `Sheet`, `PATH="$HOME/.dotnet:$PATH"`). 실제 비트·구글에 붙지 않는다

## TASK-10: 도우미 0.14.0 — 수납 명령 · 비밀 글자 · 주소 바꾸기 확인 창 · 클립보드 · calday 400일 · 명령표
- Phase: 2
- AC: AC-8511.1, AC-8511.2, AC-8511.3, AC-8511.4, AC-8511.5, AC-8511.6, AC-8511.7, AC-8541.2
- REQ: REQ-8511, REQ-8541
- Files: helper/src/Precheck.Core/Protocol/**, helper/src/Precheck.Core/Calendar/**, helper/src/Precheck.Core/Sheet/**, helper/src/Precheck.Core/Bit/Sql.cs, helper/src/Precheck.Core/Precheck.Core.csproj, helper/src/Precheck.Helper/**, helper/src/Precheck.Windows/**, helper/Directory.Build.props, helper/tests/Precheck.Core.Tests/Protocol/**, helper/tests/Precheck.Core.Tests/Calendar/**, helper/tests/Precheck.Core.Tests/Sheet/**, helper/tests/Precheck.Windows.Tests/Sheet/**, helper/tests/protocol.dotnet.test.ts, helper/tests/calendar-read.dotnet.test.ts, helper/tests/sheet-commands.dotnet.test.ts, helper/tests/build.test.ts, helper/tests/input-wiring.dotnet.test.ts, extension/manifest.json, extension/src/manifest.test.ts, src/lib/bridge/commands.json, src/lib/bridge/versions.ts, src/lib/bridge/protocol.test.ts, src/lib/bridge/client.test.ts, src/lib/bridge/handshake.test.ts, src/types/bridge.ts, extension/src/background.test.ts, extension/src/relay.test.ts, src/components/autoUpload/AutoUpload.test.tsx, src/components/autoUpload/runUpload.test.ts, src/components/claim/memo/MemoPanel.test.tsx, src/lib/autoUpload/plan.test.ts, src/components/stats/loadPlan.test.ts
- Tests: helper/tests/sheet-commands.dotnet.test.ts, helper/tests/protocol.dotnet.test.ts, helper/tests/calendar-read.dotnet.test.ts, helper/tests/build.test.ts, src/lib/bridge/protocol.test.ts, extension/src/manifest.test.ts, extension/src/relay.test.ts
- TDD: required — design.md 9-2. 명령 여덟은 `commands.json`에(모두 `patient: false`, `sheet.link`만 `confirm: true`, args 모양 그대로 — `sheet.link` 밖에는 주소 칸 없음) → 도우미가 실은 표를 읽는다. 시험 먼저: 명령표 모양·판 글자(`versions.ts` `LATEST_HELPER`·`SHEET_HELPER`·`CAL_PAST_HELPER`·`SHEET_EXTENSION`, `Directory.Build.props` 0.14.0, `extension/manifest.json` 0.5.0 — `manifest.test.ts`의 판 시험을 0.5.0으로), 새 확장 빌드의 `checkRequest`가 `sheet.*`를 받음(`relay.test.ts`), `sheet.code`가 클립보드 약속(`IClipboard`)에 코드를 넣고 답에 비밀 글자가 없음, `sheet.dat` DPAPI(`IProtector` 가짜로), **주소는 이 PC 확인 창으로만 바뀜**: `sheet.link`는 가짜 `ISheetConfirm`(새 약속, 지금 `IConfirmWindow`는 고치지 않음)이 [바꾸기](참)일 때만 `sheet.dat`에 주소·메일을 적고, [취소]·2분 지남(거짓)이면 `E-GSHEET-DECLINED`에 전 값 그대로, 같은 값이면 창을 띄우지 않음, 비밀 글자가 없으면 창 없이 `E-GSHEET-SECRET`, 창 글에 주소와 메일이 다 보임, 주소 꼴(`/macros/s/…/exec`·`/a/macros/{도메인}/s/…/exec` 됨, `/dev`·다른 host·http 안 됨) → `E-GSHEET-URL`. `sheet.ping`·`sheet.months`·`sheet.fill`에 `url`·`shareWith`·`scriptUrl` 열쇠가 오면 거절하고 늘 `sheet.dat` 주소로만 보냄(가짜 `ISheetTransport`가 부른 주소를 봄). 바꾼 뒤 `hello`의 mac(`HMAC(비밀 글자, nonce)`)이 맞기 전에는 token·줄을 보내지 않고 틀리면 `E-GSHEET-KEY`, `sheet.import`는 창 없이 비트시트 주소·메일·비밀 글자를 옮기고 웹 답에 셋이 없음, 비트 읽기 20초·구글 45초·전체 60초 시간 제한 → `E-GSHEET-TIMEOUT`, 구글 `token_not_set`·`bad_token` → `E-GSHEET-NOKEY`·`KEY`, 넘김 host가 `script.googleusercontent.com`이 아니면 멈춤, 지문 같으면 안 보냄, auto 덮어쓰기 거절, 날짜 범위, 기록 줄에 이름·차트번호·비밀 글자·주소·메일 없음, `calday` 오늘 − 400일 받음·401일 거절. 진짜 HTTP(`HttpWebRequest`, TLS 1.2, 60초, 넘김 손으로)·클립보드(STA)·확인 창(새 파일 `SheetConfirmWindow` — 지금 `ConfirmWindow.cs`의 STA 창 꼴을 따르되 그 파일은 고치지 않음, 제목·글·단추 `바꾸기`·`취소`는 2절 표 17 글)은 `Precheck.Windows`(윈도 CI에서만 빌드). `Precheck.Core.csproj`에 `google-code/sheet/Code.gs`를 `SheetCode.gs`로 싣는다(`build.test.ts`가 봄). `0.13.2`를 글자로 적은 시험은 `LATEST_HELPER`를 따르게만 고친다(기대 뜻은 그대로). `MIN_HELPER`·`MIN_EXTENSION`은 그대로. 확장 코드(`relay.ts`·`background.ts`)는 고치지 않는다 `Bit/Sql.cs`의 `IsAllowed`·`ParametersOf`에 `Sheet.SheetSql`을 더한다(지금 `CalendarSql`·`ListSql`과 같은 꼴, 시험은 `Sheet/` 시험 폴더에) — 안 더하면 `ReadOnlyGuard`가 수납 비트 읽기를 모두 막는다.

## TASK-11: 예약 구글 코드 1판 · 가짜 캘린더 · 웹에 싣는 코드
- Phase: 2
- AC: AC-8507.1, AC-8507.2, AC-8507.3, AC-8507.4, AC-8507.5, AC-8507.6, AC-8507.7
- REQ: REQ-8507
- Files: google-code/calendar/Code.gs, google-code/test/fakeCalendar.ts, google-code/test/calendar.test.ts, scripts/google-code.mjs, scripts/googleCode.test.ts, src/lib/gcal/calendarCode.ts, package.json
- Tests: google-code/test/calendar.test.ts, scripts/googleCode.test.ts
- TDD: required — design.md 8-2 표 그대로. 가짜 `Calendar.Events`(list·get·insert·patch·remove, updatedMin·showDeleted·singleEvents·pageToken 흉내, 지운 일정 status 'cancelled'·410)·`CalendarList`·`LockService`·`ContentService`·`Utilities`를 메모리로 두고 vm으로 `Code.gs`를 불러 돈다. 같은 `put` 두 번 = 일정 하나, `dropDay` 앞·가운데·뒤, `off` 하루·여러 날·빈 제목·그날 사람이 만든 off 일정 찾아 고치기·**두 PC가 같은 날 off를 함께 보내도 그날 off 일정 하나**(`newId`), 지운 off 되살림, `changes`의 410 → `too_old`, 오류(`token_not_set`·`bad_token` 이름은 수납 코드와 같음). 답·오류 글에 제목·이름이 없음. `npm run google-code`가 `src/lib/gcal/calendarCode.ts`를 만들고 시험이 `Code.gs`와 글자 그대로 같은지, `buildCalendarCode`가 `__KEY__` 한 곳만 바꾸는지 본다. 진짜 구글에 붙지 않는다

## TASK-12: 예약 맞춤 엔진 — 부르기 · 받기 · 보내기 · 처음 가져오기 · 돌기 · 상태 · 울타리
- Phase: 2
- AC: AC-8505.3, AC-8524.1, AC-8524.2, AC-8524.3, AC-8525.1, AC-8525.2, AC-8525.3, AC-8525.4, AC-8525.5, AC-8526.1, AC-8526.2, AC-8526.3, AC-8526.4, AC-8526.5, AC-8526.6, AC-8526.7, AC-8527.1, AC-8527.2, AC-8527.3
- REQ: REQ-8505, REQ-8524, REQ-8525, REQ-8526, REQ-8527
- Files: src/lib/gcal/client.ts, src/lib/gcal/client.test.ts, src/lib/gcal/deps.ts, src/lib/gcal/pull.ts, src/lib/gcal/pull.test.ts, src/lib/gcal/push.ts, src/lib/gcal/push.test.ts, src/lib/gcal/importRead.ts, src/lib/gcal/importRead.test.ts, src/lib/gcal/loop.ts, src/lib/gcal/loop.test.ts, src/lib/gcal/status.ts, src/lib/gcal/status.test.ts, eslint.config.mjs, src/guardrails.test.ts
- Tests: src/lib/gcal/client.test.ts, src/lib/gcal/pull.test.ts, src/lib/gcal/push.test.ts, src/lib/gcal/importRead.test.ts, src/lib/gcal/loop.test.ts, src/lib/gcal/status.test.ts, src/guardrails.test.ts
- TDD: required — design.md 10-5·12절. 판단은 `lib/calendar/g*`(TASK-7), 적기는 `lib/storage/calendar`·`gcal`(TASK-3·4)만 부른다. `deps.ts`가 부르기·저장·시각을 받는 모양(시험은 가짜 deps — 가짜 구글 답 + 메모리 DB)이다. 시험 먼저: `fetch` 부르기 모양(POST·text/plain·credentials omit·주소 꼴·30초·로그인 HTML·판), 오류 번호 아홉, 두 PC가 같은 바뀜을 함께 받아도 예약 하나·`pulled_until` 앞으로만, 양쪽 고침 나중 쪽(`g_wait_at`)·덮인 줄, 보낸 뒤 `g_wait`는 `g_wait_at`이 그대로일 때만 비움, `too_old` → [이은 날 0시, 오늘 + 2년 0시)를 처음부터 다시 받고 그 범위 안·`g_event_id` 있음·보낼 것 없음인 짝만 목록에 없으면 지움으로, **보낼 것 남은 새 예약·메모가 있을 때 too_old가 와도 안 지움**(id를 미리 정한 `g_wait` 예약·`g_wait` 참 메모, 범위 밖 2년 뒤 예약도 그대로, AC-8525.5), **구글에서 메모 글을 고치면 양쪽에 고친 글로 남음**(받기가 짝 메모를 고치기로 적어 지우기·넣기가 없고 지움 줄이 생기지 않음 → 다음 보내기에 구글 remove 없음, 여러 날 메모 날짜 범위 바뀜은 남는 날 고치기·새 날 넣기·빠진 날만 지우기 + 그 지움 줄 바로 버림, AC-8525.3), `g_wait_at` 조건은 저장소가 준 글자를 그대로 넘김(가짜 deps가 마이크로초 글자를 주고 `Date`로 바꾼 글자가 오면 시험 실패), 못 보냄 → 1분 다시·차례, 이은 날 전 예약·지움 줄·off 날은 안 보내고 버림(AC-8526.7), 웹앱 종일 메모 id `ssk` + 32자, 두 PC가 같은 날 off를 함께 보내도 `newId` 하나, 구글 글은 적기 전에 `maskPrivate`(AC-8505.3), 도착 안 보냄/제목 앞, 색 바꿈 대상, 처음 가져오기 두 번 눌러도 둘 아님·웹앱에만 있던 오늘 뒤 예약 보냄·구글 제목·색 안 바꿈. 울타리: `eslint.config.mjs`에 `src/lib/gcal/**`(`client.ts` 밖 fetch·XMLHttpRequest·WebSocket 금지, console·브라우저 저장소 금지)와 `src/components/gcalSettings/**/rows/**`(`components/calendar/rows`와 같은 규칙)를 더하고 `src/guardrails.test.ts`가 증명한다. `calendarCode.ts`(TASK-11)는 고치지 않는다

## TASK-13: 수납 넣기 돌리기 — runner · reply
- Phase: 2
- AC: AC-8513.1, AC-8513.2, AC-8513.5
- REQ: REQ-8513
- Files: src/lib/gsheet/runner.ts, src/lib/gsheet/runner.test.ts, src/lib/gsheet/reply.ts, src/lib/gsheet/reply.test.ts
- Tests: src/lib/gsheet/runner.test.ts, src/lib/gsheet/reply.test.ts
- TDD: required — design.md 10-4·11절 1~6. `runFill(deps, job)`는 받은 `call`로만 도우미를 부르고(가짜 call), `reply.ts`가 `sheet.status`·`sheet.link`·`sheet.fill`·`sheet.months` 답 모양을 검사해 숫자·칸 주소·파일 id·gid만 남긴다(다른 열쇠·글자가 섞이면 `E-BRIDGE-BAD-REPLY`, `sheet.status`의 `url`·`shareWith`는 설정 칸 보이기용 `GsheetPinned`로만 내고 기록·서버로 가는 값에는 없음). `runFill`이 `sheet.fill`에 주소·메일을 넘기지 않음(가짜 call이 받은 args를 봄). `secretTag`가 다르면 `sheet.fill`을 한 번도 부르지 않음, 손 넣기 force, 기록은 숫자만, 새 달 파일이면 달 목록 다시 받기, 120초 넘으면 실패로 적음. `types/bridge.ts`(TASK-10)를 import하지 않는다

## TASK-14: 보이지 않는 두 부품 · 비트 통로 빌리기
- Phase: 3
- AC: AC-8513.3, AC-8513.4, AC-8525.1, AC-8540.1, AC-8541.2
- REQ: REQ-8513, REQ-8525, REQ-8540, REQ-8541
- Files: src/components/gsheet/auto/**, src/components/gcal/**, src/components/claim/bitLane.ts, src/components/claim/bitLane.test.ts, src/components/claim/useBridge.ts, src/components/claim/useBridge.test.ts
- Tests: src/components/gsheet/auto/GoogleSheetAuto.test.tsx, src/components/gcal/GcalSync.test.tsx, src/components/claim/bitLane.test.ts, src/components/claim/useBridge.test.ts
- TDD: required — 본보기 `src/components/autoUpload/AutoUpload.tsx`(그 파일은 고치지 않음). `GoogleSheetAuto`: 30초마다 깨어 보는 중이면 끝, `borrowScreenCall()` 또는 `enterBackground` + `connectScreenBridge`, `E-BRIDGE-BUSY`면 기록 없이 다음 차례, `navigator.locks.request('ssk-gsheet', {ifAvailable:true})`, 서버 마지막 넣기 (간격 − 1)분 안이면 건너뜀, `planFills` → `runFill` → `fillStatus`. `GcalSync`: 이은 병원에서 `lib/gcal/loop` 시작·멈춤, 보는 중·잇지 않음이면 아무것도 안 함. `bitLane`에 `lendScreenCall({call, busy}) → 거두기`·`borrowScreenCall()`(빌린 통로로는 `sheet.*`만, 스트림 없음, 화면에 기다리는 요청·스트림이 있으면 null), `useBridge`가 ready일 때 빌려주고 닫을 때 거둔다(시험: 청구 입력 스트림 중에는 빌리지 않음). hello의 `helperVersion` < `SHEET_HELPER`나 `extensionVersion` < `SHEET_EXTENSION`이면 `sheet.*`를 한 번도 부르지 않고 상태만 알림(AC-8541.2). 지금 `bitLane`·`useBridge` 시험은 고치지 않고 지나야 한다. 둘 다 아무것도 그리지 않는다

## TASK-15: 수납일지 구글 시트 보기
- Phase: 3
- AC: AC-8514.2, AC-8514.3, AC-8514.4, AC-8514.5, AC-8514.6, AC-8514.7, AC-8515.1, AC-8515.2, AC-8515.3, AC-8515.4, AC-8515.5, AC-8541.2
- REQ: REQ-8514, REQ-8515, REQ-8541
- Files: src/components/gsheet/view/**
- Tests: src/components/gsheet/view/SheetView.test.tsx, src/components/gsheet/view/MonthPicker.test.tsx, src/components/gsheet/view/OverwriteDialog.test.tsx, src/components/gsheet/view/SheetBand.test.tsx
- TDD: required — notes-sunap 상태 `none`·`sheet`·`filling`·`done`·`done-warn`·`newmonth`·`pastmonth`·`nobit`·`err-google`·`err-frame`·`overwrite`의 화면 글 그대로(글은 `view/labels.ts` 한 곳, 시험은 notes 글자를 적어 견줌) + design.md 2절 표 2·8. 틀 주소는 파일 id·gid 모양을 본 뒤에만(`referrerPolicy="no-referrer"`), 20초 load 없으면 err-frame. 띠·결과 줄은 `lib/gsheet/status`·`result`, 넣기는 props로 받은 `onFill(job)`(TASK-23이 `runFill`을 잇는다), 설정 열기는 `onOpenSettings`. 넣는 PC가 아니면 넣기·덮어쓰기·설정 단추 없음, 옛 도우미·옛 확장 안내 두 줄(design.md 2절 표 2, `E-GSHEET-EXT`). PC 화면만 앱 안 이동(메뉴 `Link`·`DeskGate`의 `router.replace`·대시보드 카드)은 문서를 새로 받지 않아 `/sunap` CSP(`frame-src`)가 걸리지 않는다 — 시트 보기는 틀을 그리기 전에 `performance.getEntriesByType('navigation')[0]`을 보고, 그 항목이 있고 `new URL(entry.name).pathname`이 `isUnder(…, '/sunap')`(`menu.ts`)가 아닐 때만 `location.replace(지금 주소)`로 한 번 새로 불러온다. 항목이 없으면 부르지 않고, sessionStorage 표시 하나로 새로 불러오는 고리를 막는다(표시가 있으면 부르지 않음, 저장소가 막히면 부르지 않음 — 틀이 막히면 `err-frame` 안내). 표시는 `/sunap`에서 연 문서에서 지운다(그래서 다음에 다른 문서를 거쳐 들어와도 다시 한 번 새로 불러온다 — 30분 자동 로그아웃 뒤 다시 로그인한 데스크). 시험(가짜 값은 전체 주소): `https://example.test/dashboard`에서 연 문서 → 한 번, `https://example.test/sunap`에서 연 문서 → 안 부름, 항목 없음 → 안 부름, 표시가 있는 채 `/dashboard` 문서 → 안 부름, 표시가 있는 채 `https://example.test/sunap` 문서 → 표시 지움, 그 뒤 `https://example.test/dashboard` 문서 → 다시 한 번.

## TASK-16: 수납일지 시트 설정 화면 · 안내문
- Phase: 3
- AC: AC-8516.1, AC-8516.2, AC-8516.3, AC-8516.4, AC-8516.5, AC-8516.6, AC-8517.1
- REQ: REQ-8516, REQ-8517
- Files: src/components/gsheet/settings/**
- Tests: src/components/gsheet/settings/SheetSettings.test.tsx, src/components/gsheet/settings/PickDialog.test.tsx, src/components/gsheet/settings/SheetGuide.test.tsx
- TDD: required — notes-sunap `settings` 화면 글·칸·기본값·풀이 글·고르기 창·목록 자리 글·[그대로 가져오기] 알림·'넣는 PC' 줄·최근 기록 꼴 그대로(글은 `settings/labels.ts`). 도우미 부르기는 props로 받은 `call`(가짜)로 `sheet.status`·`sheet.code`·`sheet.link`·`sheet.import`·`sheet.ping`·`sheet.catalog`, 저장은 `lib/storage/gsheet`, 막는 글은 `lib/gsheet/check`. '구글에서 받은 주소'·'함께 쓸 직원 메일' 두 칸은 `sheet.status` 값으로 채우고, 바뀐 채 [연결 시험]·[저장]이면 `sheet.link`를 먼저 부르고 기다리는 동안 `이 PC 화면에 뜬 확인 창에서 [바꾸기]를 눌러 주세요.`, `E-GSHEET-DECLINED`면 오류 카드·두 칸은 전 값, 서버 저장(`saveGsheetSettings`에 가는 값)에 두 칸이 없음, 도우미·비밀 글자가 없는 PC에서는 두 칸이 비고 잠김(design.md 2절 표 17). 복사 뒤 서버 `secret_tag`만 새로 적고 비밀 글자는 화면·props에 없다. 안내문 `SheetGuide`는 비트시트 `apps-script/SETUP.md`를 웹앱 말로(프로그램 → 웹앱 [설정], 낱말 풀이 표 그대로, 사진·환자 값 없음)

## TASK-17: 설정 › 구글 캘린더 › 잇기 · 맞춤 방법 · 안 메뉴 틀
- Phase: 3
- AC: AC-8528.1, AC-8528.2, AC-8528.3, AC-8528.4, AC-8528.5, AC-8531.1, AC-8531.2, AC-8531.3
- REQ: REQ-8528, REQ-8531
- Files: src/components/gcalSettings/frame/**, src/components/gcalSettings/connect/**, src/components/gcalSettings/rules/**
- Tests: src/components/gcalSettings/frame/GcalFrame.test.tsx, src/components/gcalSettings/connect/Connect.test.tsx, src/components/gcalSettings/rules/Rules.test.tsx
- TDD: required — notes-calendar '공통'·`connect`·`rules` 글 그대로 + design.md 2절 표 1(서비스 켜기 줄)·12(데스크 보기만). [구글 코드 복사]는 `crypto.getRandomValues` 32바이트 → `buildCalendarCode`(TASK-11) → 클립보드(가짜 `navigator.clipboard`), 비밀 글자 칸은 가림·[보기]/[숨기기], 저장한 비밀 글자는 다시 그리지 않음(시험: DOM에 비밀 글자 없음), 주소·비밀 글자는 [연결 시험]이 된 뒤에만 `saveGcalConnection`. 캘린더 줄 고르기·보기만 캘린더 못 고름·`'{캘린더}'{으로/로} 잇고 다음 →`·이어짐 띠 `{캘린더}{와/과} 이어짐`(조사는 `lib/calendar/josa`, design.md 2절 표 7). 맞춤 방법 열다섯 줄·[저장]·[잇기 끊기] 한 번 더 묻기. 데스크(`useDesk`)는 모든 칸·단추가 잠김

## TASK-18: 설정 › 구글 캘린더 › 시행자·종류
- Phase: 3
- AC: AC-8529.1, AC-8529.2, AC-8521.4
- REQ: REQ-8529, REQ-8521
- Files: src/components/gcalSettings/colors/**
- Tests: src/components/gcalSettings/colors/StaffKinds.test.tsx, src/components/gcalSettings/colors/ColorPalette.test.tsx
- TDD: required — notes-calendar `colors` 글·표·색판·네 줄·제목 꼴과 미리 보기 그대로. 미리 보기·경고는 `lib/calendar/gtitle`·`gpaint`(TASK-7), 경고·띠 글의 조사는 `josa`(`{시행자}{과/와} {시행자}{이/가} …`·`'{취소|변경}'{으로/로} 알아봐요`·`{캘린더}{을/를} 골랐어요`·`{종류}{으로/로} 봐요`). 저장은 시행자 → `lib/storage/clinicProfile`, 종류 → `lib/storage/calendar`(설정), 취소·변경 색·글 없을 때·제목 꼴 → `lib/storage/gcal`, 그 뒤 `colorChangeTargets` 예약에 `g_wait='color'` + `pushWaiting`(TASK-12). 처음 잇기면 단추 글 `[저장하고 가져오기 미리 보기 →]`, 잇지 않은 병원은 [저장]만(design.md 2절 표 9). 데스크는 보기만

## TASK-19: 처음 가져오기 미리 보기
- Phase: 3
- AC: AC-8530.1, AC-8530.2, AC-8530.3, AC-8530.4
- REQ: REQ-8530
- Files: src/components/gcalSettings/import/**
- Tests: src/components/gcalSettings/import/ImportPreview.test.tsx, src/components/gcalSettings/import/rows/ImportRows.test.tsx
- TDD: required — notes-calendar `import` 글·카드·거르기·표 머리·꼬리표·아래 띠·알림 그대로(design.md 2절 표 14: '… 더 있어요' 글 없음). 읽기·적기는 `lib/gcal/importRead`(TASK-12). 환자 이름을 그리는 표 줄은 `import/rows/` 안(울타리: 네트워크·저장소·console·supabase 없음). 보이는 줄만 그리는 긴 표(4,000줄 시험 데이터로 그린 줄 수가 화면 높이 만큼만인지 봄). 고르기·되돌리기·가져오지 않기 숫자

## TASK-20: 예약표 칸 칠하기 · 종일 칩 · 고쳐야 함 빗금 · 주황 시계 · 5분 자리
- Phase: 3
- AC: AC-8532.2, AC-8532.3, AC-8532.4, AC-8532.5
- REQ: REQ-8532
- Files: src/components/calendar/rows/**, src/lib/calendar/layout.ts, src/lib/calendar/layout.test.ts
- Tests: src/components/calendar/rows/TimeGrid.test.tsx, src/components/calendar/rows/PhoneWeekList.test.tsx, src/lib/calendar/layout.test.ts
- TDD: required — notes-calendar '색 규칙'·`week` 칸 모양 그대로. 칸 색·colorId는 `lib/calendar/gpaint.apptPaint`(TASK-7), prop `RowsGoogle`(없으면 지금처럼 TASK-3 모양). 취소 = 취소 색 + 흐림 + 가운데 줄, 변경 = 변경 색 + '변경' 꼬리표, 못 보냄(`waiting`) = 주황 시계, 고쳐야 할 것(`fixes`) = 노란 빗금 '고쳐야 함 {구글 제목}', 종일 off 한 칩·반차 흰 칩·메모 기본 색 칩과 말풍선 글. 시작 09:15 칸 자리(시간 칸 10분 그대로), 빈 화면 글에서 '구글 캘린더에 있던 예약은 옮겨 오지 않아요.' 뺌, 시행자 없는 예약은 표시 없이. 울타리(`components/calendar/rows`) 그대로. 이 폴더 밖은 고치지 않는다

## TASK-21: 예약 탭 — 구글 띠 · 고쳐야 할 판 · 자세히 · 닿지 못함 · 저장 잇기 · 톱니 · 지난 도착
- Phase: 3
- AC: AC-8532.1, AC-8529.3, AC-8533.1, AC-8534.1, AC-8534.2, AC-8534.3, AC-8535.1, AC-8535.2, AC-8536.1, AC-8536.2, AC-8526.1, AC-8526.5, AC-8541.2
- REQ: REQ-8532, REQ-8529, REQ-8533, REQ-8534, REQ-8535, REQ-8536, REQ-8526, REQ-8541
- Files: src/components/calendar/AddPanel.tsx, src/components/calendar/AddPanel.test.tsx, src/components/calendar/AllDayPanel.tsx, src/components/calendar/AllDayPanel.test.tsx, src/components/calendar/CalendarScreen.tsx, src/components/calendar/CalendarScreen.test.tsx, src/components/calendar/CalendarSettings.tsx, src/components/calendar/CalendarSettings.test.tsx, src/components/calendar/CalendarToolbar.tsx, src/components/calendar/CalendarToolbar.test.tsx, src/components/calendar/DetailPanel.tsx, src/components/calendar/DetailPanel.test.tsx, src/components/calendar/MonthGrid.tsx, src/components/calendar/MonthGrid.test.tsx, src/components/calendar/SummaryLine.tsx, src/components/calendar/SummaryLine.test.tsx, src/components/calendar/RateTable.tsx, src/components/calendar/RateTable.test.tsx, src/components/calendar/colors.ts, src/components/calendar/colors.test.ts, src/components/calendar/useCalendarData.ts, src/components/calendar/useCalendarData.test.ts, src/components/calendar/useCalendarWorker.ts, src/components/calendar/useCalendarWorker.test.ts, src/components/calendar/gcal/**, src/workers/calendar/**, src/app/(app)/calendar/page.tsx, src/app/(app)/calendar/page.test.tsx
- Tests: src/components/calendar/gcal/GcalBand.test.tsx, src/components/calendar/gcal/FixPanel.test.tsx, src/components/calendar/gcal/pastArrival.test.ts, src/components/calendar/DetailPanel.test.tsx, src/components/calendar/useCalendarData.test.ts, src/components/calendar/CalendarScreen.test.tsx, src/components/calendar/AddPanel.test.tsx
- TDD: required — notes-calendar `week`(띠·안내 줄)·`detail`(구글 구역·도착 끝 글)·`fix`·`err` 글 그대로 + design.md 2절 표 4·5·6·13. 띠·보낼 것 수는 `lib/gcal/status`, 탭에 들어오면 `requestPull()`, [지금 맞추기] 알림. 저장 잇기(`useCalendarData`): 넣기·고치기·옮기기·취소·되돌리기·지우기 때 `g_wait`(+ 새 예약 `g_event_id = 'ssk' + 32자`·`g_from='web'`, 칸을 고치면 `g_keep_title=false`)를 같은 쓰기에 실은 뒤 `pushAppt`, 못 보내면 알림 '웹앱에 저장했어요. 구글에는 다시 닿으면 보내요.'. 도착 바뀜은 보내지 않음(규칙 'title'일 때만). 시행자 없는 예약의 고치기 판에만 '없음'(5분 시작은 TASK-3이 끝냄), 웹앱 종일 메모는 넣는 쓰기에 `g_event_id = 'ssk' + 32자`, 띠·자세히 글의 조사는 `josa`(`{캘린더}{와/과} 이어짐`·`{제목}{으로/로} 다시 적혀요`). 톱니 → `/settings/google-calendar?tab=colors`(옛 서랍은 잇지 않은 병원에도 쓰지 않음 — `CalendarSettings.tsx`는 지우고 그 시험도). 지난 도착 채우기(`gcal/pastArrival.ts` 계획 + 지금 `calday` 길): 비트 PC·도우미 `CAL_PAST_HELPER` 이상이면 한 주씩, 아래 판이면 62일 안만, 진행은 `setArrivalProgress`, 다 하면 알림 한 번. 고쳐야 할 판 [예약표에 넣기]·[가져오지 않기]. 예약표에 `RowsGoogle`을 넘긴다. `rows/`는 고치지 않는다

## TASK-22: 직원 탭 휴가 → 구글 off 줄
- Phase: 3
- AC: AC-8537.1, AC-8537.2, AC-8537.3
- REQ: REQ-8537
- Files: src/components/staff/leave/**
- Tests: src/components/staff/leave/LeaveEditor.test.tsx, src/components/staff/leave/LeaveScreen.test.tsx, src/components/staff/leave/gcalOff.test.ts
- TDD: required — notes-calendar `staff` 글(세 경우·지금 → 저장하면·오른쪽 미리 보기·저장한 뒤·알림·목록 꼬리표) 그대로. 지금 off 줄은 `lib/storage/gcal.listOffDays`, 새 줄은 `lib/calendar/goff.composeOffTitle`(TASK-7, 목록 밖 이름은 남김), `(예약 시행자 ({표시}) {이름}{과/와} 이어져 있어요)` 조사는 `josa`, 저장 뒤 날마다 `pushOffDay`(TASK-12), 못 보내면 조용히(다음 맞춤). 잇지 않은 병원은 지금 글·동작 그대로(지금 시험이 고치지 않고 지나야 함). PC 화면만

## TASK-23: 잇기 · 전체 검사 · 화면 사진 · 검토 한 번
- Phase: 4
- AC: AC-8514.1, AC-8528.1, AC-8540.1, AC-8540.2, AC-8540.3, AC-8540.4, AC-8541.1, AC-8541.3
- REQ: REQ-8514, REQ-8528, REQ-8540, REQ-8541
- Files: src/components/shell/AppShell.tsx, src/components/shell/TabBar.tsx, src/components/shell/menu.ts, src/components/shell/shell.test.tsx, src/components/shell/DeskGate.test.tsx, src/components/settings/SettingsPage.tsx, src/app/(app)/settings/page.test.tsx, src/components/claim/setup/SetupScreen.tsx, src/components/claim/setup/SetupScreen.test.tsx, src/components/gcalSettings/GcalSettingsScreen.tsx, src/components/gcalSettings/GcalSettingsScreen.test.tsx, src/app/(app)/settings/google-calendar/page.tsx, src/app/(app)/settings/google-calendar/page.test.tsx, src/components/gsheet/SunapTab.tsx, src/components/gsheet/SunapTab.test.tsx, src/app/(app)/sunap/page.tsx, src/app/(app)/sunap/page.test.tsx, src/app/titles.test.tsx, src/googleLinkWiring.test.ts, src/lib/forms/backgroundDocs.test.ts
- Tests: src/components/shell/shell.test.tsx, src/components/shell/DeskGate.test.tsx, src/components/gcalSettings/GcalSettingsScreen.test.tsx, src/components/gsheet/SunapTab.test.tsx, src/app/(app)/settings/google-calendar/page.test.tsx, src/app/(app)/sunap/page.test.tsx, src/app/titles.test.tsx, src/googleLinkWiring.test.ts
- TDD: required — 앱 틀에 `<GoogleSheetAuto />`·`<GcalSync />`(한 줄씩), 탭 줄 '수납일지' 주황 점(`lib/gsheet/status`), `menu.ts` 데스크 주소에 `/settings/google-calendar`만 더함, 설정 안 메뉴 두 곳에 '구글 캘린더' + '새', `GcalSettingsScreen`이 TASK-17 틀·잇기·맞춤 방법 + TASK-18 + TASK-19를 `?tab=`으로 잇고 처음 잇기 차례(①→②→③)만 열어 둠, `SunapTab`이 탭 머리 두 칸 + TASK-15 보기(넣기 `runFill` 잇기) + TASK-16 설정 + 지금 `SunapScreen`. `googleLinkWiring.test.ts`: `types/gcal` `GColor` = `types/calendar` `CAL_COLORS`, `lib/calendar/gshapes` colorId 표 = `CAL_COLOR_ID`, `lib/gsheet/shapes` = `types/gsheet` 열쇠. 그다음 `ssk-finish-check`대로 `npm run lint`·`npm test`·`npm run build`·`dotnet test`(새로 깨진 것 없음), `ssk-screen-check`로 PC 너비(1440) 시안 상태마다(수납 13·예약 11) 사진을 찍어 시안과 견주고(폰 사진 없음), 독립 검토 한 번(재검토는 사용자에게 묻고). 다른 TASK 파일에서 깨진 것은 이 TASK가 고치지 않고 그 TASK로 돌려보낸다 `src/lib/forms/backgroundDocs.test.ts`(AC-4613.5)의 connect 기대값에 구글 두 origin을 더한다(TASK-6 뒤 그 시험만 깨짐).

## TASK-24: 사용자와 함께 확인 (시험 아님)
- Phase: 4
- AC: AC-8542.1, AC-8542.2, AC-8542.3
- REQ: REQ-8542
- Files: specs/google-link/user-checks.md
- TDD: exempt — 진짜 병원 구글 계정·비트 PC에서 사용자와 함께 하는 확인이라 시험으로 만들 수 없다. 사용자가 배포를 말한 뒤에만: SQL 실행 확인(`ssk-supabase-sql`) → 도우미 0.14.0 + 크롬 확장 0.5.0 한 묶음(`helper.yml` zip 둘, `ssk-clinic-pc-files`) 설치 → 수납 구글 코드 붙이기·[그대로 가져오기]·[지금 넣기]·5분 넣기 줄 수(개수만) → 틀 안 시트 열림 → 예약 구글 코드 붙이기(서비스 켜기 포함)·잇기·처음 가져오기·양쪽 2분 맞춤·취소 색·off 줄 → 구글 색 한국어 이름·토마토를 다른 뜻으로 쓰는지 → 비트시트 프로그램 끄기. 본 것과 고칠 것을 `user-checks.md`에 적는다(이름·차트번호·비밀 글자·주소 id는 적지 않음)

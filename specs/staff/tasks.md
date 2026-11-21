# 작업 분할: 직원 탭 — 명단 · 근무표 · 휴가 · 급여 (staff)

> 형식: `## TASK-n: 제목` 아래 `- Phase:`·`- AC:`·`- REQ:`·`- Files:`(수정 범위)·`- Tests:`·`- TDD:`. 승인되면 Files/Tests 경로만 고친다. TASK마다 일꾼 하나. **같은 Phase의 TASK끼리 파일이 겹치지 않는다.** 앞 Phase를 합친 뒤 다음 Phase.
> 사용자 규칙: 계획 최소, Phase별 step, 같은 Phase는 병렬, 중간 검토 없이 **마지막에 전체 검사·검토 한 번**. Phase 끝마다 그 Phase 시험 파일만 돌린다.
>
> | Phase | TASK | 하는 일 |
> |---|---|---|
> | 0 | TASK-1 | 시안 네 장·명세 (끝남, 사용자 승인 2026-11-21) |
> | 1 | TASK-2 | DB: 열 표·RLS·예약 휴무 트리거·바구니 + RLS 시험 + ADR-035 |
> | 1 | TASK-3 | 형·저장 층·오류 문구·공용 읽기 훅 |
> | 1 | TASK-4 | 연차 셈 |
> | 1 | TASK-5 | 근무표 셈 + 명단 셈(알림·근속·보관) |
> | 1 | TASK-6 | 급여 셈 + 세무사 엑셀 + 명세서 그림 파일 |
> | 1 | TASK-7 | 엑셀 올리기 읽기 + 양식 파일 |
> | 1 | TASK-8 | 탭 틀: 탭 켜기·작은 메뉴·layout·데스크 막기 |
> | 1 | TASK-9 | 예약 달력 반차 휴무 |
> | 2 | TASK-10~13 | 화면 넷: 명단 · 근무표 · 휴가 · 급여 |
> | 3 | TASK-14 | 합치기 통합 시험 · 전체 검사 · PC 너비 화면 사진 · 마지막 검토 한 번 |
>
> - **기준 갈래** `feat-staff`(운영 b2ab27e5). 폰 전용 모양은 만들지 않는다(사진도 PC 너비만).
> - **잇는 곳**: Phase 1 순수 함수(TASK-4~7)는 `@/types/staff`를 불러오지 않고 design.md 4절 이름·모양 그대로 자기 입력 형을 둔다. Phase 2는 TASK-3의 `createStaffStore`·`useStaffBase`, TASK-4~7 함수, TASK-8의 `StaffNav`·`labels`·`TableScroll`을 design.md 이름 그대로 쓴다.
> - **사용자 단계**(배포 때): ① `supabase/migrations/20261121000000_staff.sql`을 SQL Editor에 붙여 넣기(먼저 — 예약 달력이 새 칸을 읽음) ② 웹 배포("배포해"). plan.md 고침은 총괄 창. Claude는 실제 Supabase에 붙지 않는다.

## TASK-1: 시안·명세
- Phase: 0
- AC: AC-7612.1, AC-7613.1, AC-7614.1, AC-7615.1
- REQ: REQ-7612, REQ-7613, REQ-7614, REQ-7615
- Files: docs/mockups/staff/list.html, docs/mockups/staff/schedule.html, docs/mockups/staff/leave.html, docs/mockups/staff/pay.html, docs/mockups/staff/notes.md
- Tests: 없음
- TDD: exempt — 클릭 시안(지어낸 사람)과 승인 기록이다. 2026-11-21 "좋아 그리고 폰은 안해도돼"로 승인됐다.

## TASK-2: DB — 직원 표·권한·예약 휴무 트리거·바구니
- Phase: 1
- AC: AC-7601.1, AC-7601.2, AC-7601.3, AC-7601.4, AC-7601.5, AC-7601.6, AC-7601.7, AC-7602.1, AC-7602.2, AC-7602.3, AC-7602.4, AC-7602.5, AC-7603.1, AC-7603.2, AC-7603.3
- REQ: REQ-7601, REQ-7602, REQ-7603
- Files: supabase/migrations/20261121000000_staff.sql, supabase/staff.rls.test.ts, docs/ADR.md, docs/ARCHITECTURE.md
- Tests: supabase/staff.rls.test.ts
- TDD: required — design.md 1절·2절. `clinicEmr.rls.test.ts` 틀(PGlite, 진짜 migration 차례). 옛 RLS 시험은 고치지 않고 통과해야 한다. `docs/ADR.md` 끝에 ADR-035(design.md 2절 글), `docs/ARCHITECTURE.md` DB 표 목록에 한 줄씩. **실제 Supabase에 붙여 넣지 않는다**

## TASK-3: 형·저장 층·오류 문구·공용 읽기 훅
- Phase: 1
- AC: AC-7610.1, AC-7610.2, AC-7610.3, AC-7610.4, AC-7610.5
- REQ: REQ-7610
- Files: src/types/staff.ts, src/lib/storage/staff.ts, src/lib/storage/staff.test.ts, src/lib/storage/staffFiles.ts, src/lib/storage/staffFiles.test.ts, src/lib/errors.ts, src/lib/errors.test.ts, src/components/staff/useStaffBase.ts, src/components/staff/useStaffBase.test.ts, src/types/errors.ts
- Tests: src/lib/storage/staff.test.ts, src/lib/storage/staffFiles.test.ts, src/lib/errors.test.ts, src/components/staff/useStaffBase.test.ts
- TDD: required — design.md 3절·5절. 가짜 클라이언트로 보내는 칸이 정해 둔 것뿐인지(hospital_id·주민번호 모양 없음)·1,000줄 쪽 읽기·틀린 줄 버림·오류 번호만 던짐·파일 줄 먼저 → 올리기, 실패 때 줄 지움·퇴사자 지우기 차례·예약 수 세기가 `day`만 읽는지·`saveRules`가 보는 달부터만 줄을 고치는지를 본다.

## TASK-4: 연차 셈
- Phase: 1
- AC: AC-7604.1, AC-7604.2, AC-7604.3, AC-7604.4, AC-7604.5, AC-7604.6, AC-7604.7, AC-7604.8
- REQ: REQ-7604
- Files: src/lib/staff/leave.ts, src/lib/staff/leave.test.ts
- Tests: src/lib/staff/leave.test.ts
- TDD: required — design.md 4절. AC-7604.8 보기 여섯 명(휴가 목록은 시험에서 합이 맞게 지어냄, 이도윤은 시안 휴가 ④ 목록)과 이도윤 11-28 더한 뒤 16/7/9, 지난 기간 정산 2026-07 2일. 1월 1일 기준·퇴사 차이·파트타임 가산(정유나 2027-09-02 10일)·15시간 미만·결근 달·carry를 경계값으로.

## TASK-5: 근무표 셈 + 명단 셈
- Phase: 1
- AC: AC-7605.1, AC-7605.2, AC-7605.3, AC-7605.4, AC-7605.5, AC-7605.6, AC-7605.7, AC-7607.1, AC-7607.2, AC-7607.3
- REQ: REQ-7605, REQ-7607
- Files: src/lib/staff/schedule.ts, src/lib/staff/schedule.test.ts, src/lib/staff/roster.ts, src/lib/staff/roster.test.ts
- Tests: src/lib/staff/schedule.test.ts, src/lib/staff/roster.test.ts
- TDD: required — design.md 4절. 보기 11월 일한 사람 수·더 일한 시간 합, 다섯째 토요일, 2028년 공휴일 목록 없음, 12-21~12-23 3일, 알림 요일(11-24 화·11-25 수), 근속, 오세린·문태호 보관.

## TASK-6: 급여 셈 + 세무사 엑셀 + 명세서 그림 파일
- Phase: 1
- AC: AC-7606.1, AC-7606.2, AC-7606.3, AC-7606.4, AC-7606.5, AC-7606.6, AC-7609.1, AC-7609.2, AC-7609.3
- REQ: REQ-7606, REQ-7609
- Files: src/lib/staff/pay.ts, src/lib/staff/pay.test.ts, src/lib/staff/taxExcel.ts, src/lib/staff/taxExcel.test.ts, src/lib/staff/slipPng.ts, src/lib/staff/slipPng.test.ts
- Tests: src/lib/staff/pay.test.ts, src/lib/staff/taxExcel.test.ts, src/lib/staff/slipPng.test.ts
- TDD: required — design.md 4절. 보기 11월 합계(18,615,000·20,765,000·17.5%)·6월 18.2·9월 18.3·10월 16.9, 뺀 항목이 보는 달부터 빠짐, 빈 칸만 가져오기, 규칙 바꿈이 앞 달을 안 건드림. 세무사 엑셀은 `xlsx`로 만든 통을 다시 읽어 칸·합계 줄·계좌(이달 입사자만)·메모를 본다. `taxSheet` 입력은 셈이 끝난 숫자(남은 연차·분)라 TASK-4·5를 불러오지 않는다.

## TASK-7: 엑셀 올리기 읽기 + 양식 파일
- Phase: 1
- AC: AC-7608.1, AC-7608.2, AC-7608.3, AC-7608.4, AC-7608.5
- REQ: REQ-7608
- Files: src/lib/staff/rosterExcel.ts, src/lib/staff/rosterExcel.test.ts, public/staff/staff-template.xlsx, scripts/make_staff_template.py, .gitignore, .vercelignore, src/vercel-config.test.ts, fixtures/make-fake-fixtures.test.ts
- Tests: src/lib/staff/rosterExcel.test.ts
- TDD: required — design.md 4절. 양식은 총괄 창 스크립트(scratchpad `make_staff_template.py`)를 `scripts/`로 옮겨 `public/staff/staff-template.xlsx`를 만든다(지어낸 보기 줄만). 시험은 그 파일의 머리 줄이 `ROSTER_HEADERS`와 같은지, `xlsx`로 만든 통으로 날짜 세 모양·시간 두 모양·직종 '기타'·보기 줄 건너뜀·비운 칸 그대로·문제 줄 까닭·300줄을 본다.

## TASK-8: 탭 틀 — 탭 켜기·작은 메뉴·layout·데스크 막기
- Phase: 1
- AC: AC-7611.1, AC-7611.2, AC-7611.3, AC-7611.4
- REQ: REQ-7611
- Files: src/components/shell/menu.ts, src/components/shell/shell.test.tsx, src/components/common/notReadyFeatures.ts, src/components/common/notReadyFeatures.test.ts, src/components/dashboard/briefing/features.ts, src/components/dashboard/briefing/features.test.ts, src/app/(app)/notReadyPages.test.tsx, src/app/titles.test.tsx, src/app/notFound.test.tsx, src/app/(app)/staff/layout.tsx, src/app/(app)/staff/layout.test.tsx, src/app/(app)/staff/page.tsx, src/components/staff/StaffNav.tsx, src/components/staff/StaffNav.test.tsx, src/components/staff/labels.ts, src/components/staff/TableScroll.tsx, src/app/(app)/tabFrame.test.tsx
- Tests: src/components/staff/StaffNav.test.tsx, src/app/(app)/staff/layout.test.tsx, src/components/shell/shell.test.tsx, src/components/common/notReadyFeatures.test.ts, src/components/dashboard/briefing/features.test.ts, src/app/(app)/notReadyPages.test.tsx, src/app/titles.test.tsx
- TDD: required — design.md 6절. `/staff/page.tsx`는 여기서 빈 명단 자리(제목만)로 두고 TASK-10이 바꾼다. 옛 시험은 직원이 준비 중이 아니게 된 곳만 고친다.

## TASK-9: 예약 달력 반차 휴무
- Phase: 1
- AC: AC-7616.1, AC-7616.2
- REQ: REQ-7616
- Files: src/lib/calendar/shapes.ts, src/lib/calendar/rules.ts, src/lib/calendar/rules.test.ts, src/lib/storage/calendar.ts, src/lib/storage/calendar.test.ts, src/components/calendar/AllDayPanel.tsx, src/components/calendar/AllDayPanel.test.tsx, src/components/calendar/MonthGrid.tsx, src/components/calendar/MonthGrid.test.tsx, src/components/calendar/rows/parts.tsx, src/components/calendar/rows/PhoneWeekList.tsx, src/components/calendar/rows/PhoneWeekList.test.tsx, src/components/calendar/rows/TimeGrid.test.tsx, src/components/calendar/AddPanel.tsx, src/components/calendar/AddPanel.test.tsx, src/components/calendar/CalendarScreen.tsx, src/components/calendar/CalendarScreen.test.tsx, src/types/calendar.ts, src/lib/calendar/occupancy.ts, src/lib/calendar/occupancy.test.ts
- Tests: src/lib/calendar/rules.test.ts, src/lib/storage/calendar.test.ts, src/components/calendar/AllDayPanel.test.tsx, src/components/calendar/MonthGrid.test.tsx, src/components/calendar/rows/PhoneWeekList.test.tsx, src/components/calendar/AddPanel.test.tsx
- TDD: required — design.md 7절. `CalAllDay.part`는 선택 칸(`part?: 'am' | 'pm' | null`, 없으면 종일)이라 옛 시험 줄은 그대로 둔다. `lib/calendar`는 환자 자료 구역 규칙을 그대로 지킨다(가드레일 시험 통과).

## TASK-10: 명단 화면
- Phase: 2
- AC: AC-7612.1, AC-7612.2, AC-7612.3, AC-7612.4, AC-7612.5, AC-7612.6
- REQ: REQ-7612
- Files: src/app/(app)/staff/page.tsx, src/components/staff/roster/*
- Tests: src/components/staff/roster/*.test.tsx
- TDD: required — 시안 list.html ①~⑥(폰 장면 ⑦은 만들지 않음). 알림 요일은 셈한 값(시안의 '11-24 월요일'은 틀림 → 화요일).

## TASK-11: 근무표 화면
- Phase: 2
- AC: AC-7613.1, AC-7613.2, AC-7613.3, AC-7613.4
- REQ: REQ-7613
- Files: src/app/(app)/staff/schedule/page.tsx, src/components/staff/schedule/*
- Tests: src/components/staff/schedule/*.test.tsx
- TDD: required — 시안 schedule.html ①~⑤(폰 장면 ⑥은 만들지 않음).

## TASK-12: 휴가 화면
- Phase: 2
- AC: AC-7614.1, AC-7614.2, AC-7614.3, AC-7614.4, AC-7614.5, AC-7614.6
- REQ: REQ-7614
- Files: src/app/(app)/staff/leave/page.tsx, src/components/staff/leave/*
- Tests: src/components/staff/leave/*.test.tsx
- TDD: required — 시안 leave.html ①~⑤ + ⑥ '나'(폰 장면 ⑦은 만들지 않음).

## TASK-13: 급여 화면
- Phase: 2
- AC: AC-7615.1, AC-7615.2, AC-7615.3, AC-7615.4, AC-7615.5, AC-7615.6, AC-7615.7, AC-7615.8, AC-7615.9, AC-7615.10
- REQ: REQ-7615
- Files: src/app/(app)/staff/pay/page.tsx, src/components/staff/pay/*
- Tests: src/components/staff/pay/*.test.tsx
- TDD: required — 시안 pay.html ①~⑧(폰 장면 ⑨는 만들지 않음). 그림은 `dataviz` 규칙·`globals.css` 토큰.

## TASK-14: 합치기 통합 시험 · 전체 검사 · 마지막 검토
- Phase: 3
- AC: AC-7611.2, AC-7611.3, AC-7611.4
- REQ: REQ-7611
- Files: src/app/(app)/staff/staff.integration.test.tsx
- Tests: src/app/(app)/staff/staff.integration.test.tsx
- TDD: required — 네 화면을 가짜 저장소로 함께 그려 작은 메뉴 이동·데스크 막기·넓은 표만 밀림을 본다. 그다음 `npm run lint`·`npm test`·`npm run build`, ssk-screen-check로 PC 너비 사진, ssk-finish-check로 마지막 검토 한 번. 검토에서 나온 고침은 해당 TASK 파일 안에서만.

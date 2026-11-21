# 작업 분할: 직원 탭 — 명단 · 근무표 · 휴가 · 급여 (staff)

> 형식: `## TASK-n: 제목` 아래 `- Phase:`·`- AC:`·`- REQ:`·`- Files:`(수정 범위)·`- Tests:`·`- TDD:`. 승인되면 Files/Tests 경로만 고친다. TASK마다 일꾼 하나. **같은 Phase의 TASK끼리 파일이 겹치지 않는다.** 앞 Phase를 합친 뒤 다음 Phase.
> 사용자 규칙: 계획 최소, Phase별 step, 같은 Phase는 병렬, 중간 검토 없이 **마지막에 전체 검사·검토 한 번**. Phase 끝마다 그 Phase 시험 파일만 돌린다.
>
> | Phase | TASK | 하는 일 |
> |---|---|---|
> | 0 | TASK-1 | 시안 네 장·명세 (끝남, 사용자 승인 2026-11-21) |
> | 1 | TASK-2 | DB: 열 표·RLS·예약 휴무 트리거·바구니 + RLS 시험 + ADR-039 |
> | 1 | TASK-3 | 형·저장 층·오류 문구·공용 읽기 훅 |
> | 1 | TASK-4 | 연차 셈 |
> | 1 | TASK-5 | 근무표 셈 + 명단 셈(알림·근속·보관) |
> | 1 | TASK-6 | 급여 셈 + 세무사 엑셀 + 명세서 그림 파일 |
> | 1 | TASK-7 | 엑셀 올리기 읽기 + 양식 파일 |
> | 1 | TASK-8 | 탭 틀: 탭 켜기·작은 메뉴·layout·데스크 막기 |
> | 1 | TASK-9 | 예약 달력 반차 휴무 |
> | 2 | TASK-10~13 | 화면 넷: 명단 · 근무표 · 휴가 · 급여 |
> | 3 | TASK-14 | 합치기 통합 시험 · 전체 검사 · PC 너비 화면 사진 · 마지막 검토 한 번 |
> | 4 | TASK-15~17 | 검토 고침(2026-11-21): 급여 · 명단·근무표·휴가(+주민번호 모양 막기) · DB 권한·파일 지우기 |
> | 5 | TASK-18~19 | 넘어온 연차 시작 값(2026-11-21 사용자 결정 '웹앱 시작 기간부터 + 사람마다 직접 적기', 'pay'도 시작 기간 앞은 안 보임·안 정산 — 총괄 결정): DB · 연차 셈 |
> | 6 | TASK-20 | 넘어온 연차: 형·저장 층·엑셀·양식·명단 화면 + 휴가 화면 시험 |
>
> - **Phase 4(검토 고침)**: 독립 검토 VERDICT FIX와 사용자 답(`requirements.md` '사용자 결정 — 검토 뒤')을 고친다. 세 TASK는 파일이 겹치지 않아 함께 돈다. 통합 시험(`src/app/(app)/staff/staff.integration.test.tsx`)·`components/ui/classes.ts`는 고치지 않고 그대로 통과해야 한다. 합친 뒤 Phase 4 시험 파일 + 전체 검사, 그다음 **고친 곳만 짧게 다시 검토**(사용자). 각 화면 TASK는 폴더마다 `pcOnly.test.tsx`(design.md 6절 '폰 모양 없음')를 둔다 — ① 폴더 안 소스(시험 파일 밖)에 폭 경계 접두(`sm:`·`md:`·`lg:`·`xl:`·`2xl:`·`max-sm:`·`max-md:`·`max-lg:`·`max-xl:`·`min-[…]:`·`max-[…]:`)와 `ds.segment.group`이 없다 ② 그 폴더 화면을 그려 모든 요소 class에 폭 경계 접두 + 모양 클래스(`grid`·`grid-cols-*`·`flex`·`flex-col`·`flex-row`·`block`·`hidden`·`w-full`·`col-span-*`)가 없다(ds 손가락 크기 `max-md:h-11`·`max-md:min-h-11`·`max-md:text-lead`·`max-md:p*-*`는 통과). 넓은 표·달력은 `TableScroll` 안·최소 폭.
>
> - **Phase 5·6(넘어온 연차 시작 값)**: Phase 5의 TASK-18(DB)·TASK-19(연차 셈)은 파일이 겹치지 않아 함께 돈다. TASK-20(Phase 6)은 TASK-19를 합친 뒤 돈다 — 휴가 화면 시험(시작 기간 앞 지난 기간 줄·끝 안내가 없음, 'pay'·'carry' 모두)이 새 셈을 써야 하기 때문. 셈의 새 칸은 `LeavePerson`의 **선택 칸**이고(없으면 지금 셈), 시험 도구의 직원 등록일은 가장 이른 입사일보다 앞(예 '2000-01-01')이라 지금 시험 숫자가 그대로다(등록일이 입사 전이면 시작 기간 = 첫 기간). 폰 전용 모양 없음. Phase 6을 합친 뒤 Phase 5·6 시험 파일 + `npx vitest run src/components/staff src/lib/staff src/lib/storage supabase/staff.rls.test.ts`, 전체 검사(lint·test·build) 한 번. 다시 검토는 사용자에게 물어본다. 배포 때 SQL은 지금처럼 이 한 파일을 먼저 붙인다(아직 운영에 실행하지 않음).
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
- TDD: required — design.md 1절·2절. `clinicEmr.rls.test.ts` 틀(PGlite, 진짜 migration 차례). 옛 RLS 시험은 고치지 않고 통과해야 한다. `docs/ADR.md` 끝에 ADR-039(design.md 2절 글), `docs/ARCHITECTURE.md` DB 표 목록에 한 줄씩. **실제 Supabase에 붙여 넣지 않는다**

## TASK-3: 형·저장 층·오류 문구·공용 읽기 훅
- Phase: 1
- AC: AC-7610.1, AC-7610.2, AC-7610.3, AC-7610.4, AC-7610.5
- REQ: REQ-7610
- Files: src/types/staff.ts, src/lib/storage/staff.ts, src/lib/storage/staff.test.ts, src/lib/storage/staffFiles.ts, src/lib/storage/staffFiles.test.ts, src/lib/errors.ts, src/lib/errors.test.ts, src/components/staff/useStaffBase.ts, src/components/staff/useStaffBase.test.ts, src/types/errors.ts
- Tests: src/lib/storage/staff.test.ts, src/lib/storage/staffFiles.test.ts, src/lib/errors.test.ts, src/components/staff/useStaffBase.test.ts
- TDD: required — design.md 3절·5절. 가짜 클라이언트로 보내는 칸이 정해 둔 것뿐인지(hospital_id·주민번호 모양 없음)·1,000줄 쪽 읽기·틀린 줄 버림·오류 번호만 던짐·파일 줄 먼저 → 올리기, 실패 때 줄 지움·퇴사자 지우기 차례·예약 수 세기가 `day`만 읽는지·`saveRules`가 보는 달부터만 줄을 고치는지를 본다. 열쇠 줄(기본 근무·바뀐 날·더 일한 시간·급여 줄·달 줄)은 upsert가 아니라 '고치고, 없으면 넣기'다(design.md 5절 '열쇠 줄 저장' — 검토 뒤 명세를 지금 코드에 맞춤).

## TASK-4: 연차 셈
- Phase: 1
- AC: AC-7604.1, AC-7604.2, AC-7604.3, AC-7604.4, AC-7604.5, AC-7604.6, AC-7604.7, AC-7604.8
- REQ: REQ-7604
- Files: src/lib/staff/leave.ts, src/lib/staff/leave.test.ts
- Tests: src/lib/staff/leave.test.ts
- TDD: required — design.md 4절. AC-7604.8 보기 여섯 명(휴가 목록은 시험에서 합이 맞게 지어냄, 이도윤은 시안 휴가 ④ 목록)과 이도윤 11-28 더한 뒤 16/7/9, 지난 기간 정산 2026-07 2일. 1월 1일 기준·퇴사 차이·파트타임 가산(정유나 2027-09-02 10일)·15시간 미만·결근 달·carry를 경계값으로. 퇴사로 끝난 기간은 'carry' 병원도 퇴사 달에 정산한다(AC-7604.7, 검토 뒤 명세에 적음 — 코드·시험은 이미 그렇다).

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
- TDD: required — design.md 4절. 양식은 총괄 창 스크립트(scratchpad `make_staff_template.py`)를 `scripts/`로 옮겨 `public/staff/staff-template.xlsx`를 만든다(지어낸 보기 줄만). 시험은 그 파일의 머리 줄이 `ROSTER_HEADERS`와 같은지, `xlsx`로 만든 통으로 날짜 세 모양·시간 두 모양·직종 '기타'·보기 줄 건너뜀·비운 칸 그대로·문제 줄 까닭·300줄을 본다. 직종이 비면 새 사람 '기타'(직접 적은 직종 없음)·DB 한도를 넘는 글 칸은 그 까닭 글로 문제 줄(AC-7608.3, 검토 뒤 명세에 적음 — 코드는 이미 그렇다).

## TASK-8: 탭 틀 — 탭 켜기·작은 메뉴·layout·데스크 막기
- Phase: 1
- AC: AC-7611.1, AC-7611.2, AC-7611.3, AC-7611.4
- REQ: REQ-7611
- Files: src/components/shell/menu.ts, src/components/shell/shell.test.tsx, src/components/common/notReadyFeatures.ts, src/components/common/notReadyFeatures.test.ts, src/components/dashboard/briefing/features.ts, src/components/dashboard/briefing/features.test.ts, src/app/(app)/notReadyPages.test.tsx, src/app/titles.test.tsx, src/app/notFound.test.tsx, src/app/(app)/staff/layout.tsx, src/app/(app)/staff/layout.test.tsx, src/app/(app)/staff/page.tsx, src/components/staff/StaffNav.tsx, src/components/staff/StaffNav.test.tsx, src/components/staff/labels.ts, src/components/staff/TableScroll.tsx, src/app/(app)/tabFrame.test.tsx
- Tests: src/components/staff/StaffNav.test.tsx, src/app/(app)/staff/layout.test.tsx, src/components/shell/shell.test.tsx, src/components/common/notReadyFeatures.test.ts, src/components/dashboard/briefing/features.test.ts, src/app/(app)/notReadyPages.test.tsx, src/app/titles.test.tsx
- TDD: required — design.md 6절. `/staff/page.tsx`는 여기서 빈 명단 자리(제목만)로 두고 TASK-10이 바꾼다. 옛 시험은 직원이 준비 중이 아니게 된 곳만 고친다.

## TASK-9: 예약 달력 반차 휴무
- Phase: 1
- AC: AC-7616.1, AC-7616.2, AC-7616.3
- REQ: REQ-7616
- Files: src/lib/calendar/shapes.ts, src/lib/calendar/rules.ts, src/lib/calendar/rules.test.ts, src/lib/storage/calendar.ts, src/lib/storage/calendar.test.ts, src/components/calendar/AllDayPanel.tsx, src/components/calendar/AllDayPanel.test.tsx, src/components/calendar/MonthGrid.tsx, src/components/calendar/MonthGrid.test.tsx, src/components/calendar/rows/parts.tsx, src/components/calendar/rows/PhoneWeekList.tsx, src/components/calendar/rows/PhoneWeekList.test.tsx, src/components/calendar/rows/TimeGrid.test.tsx, src/components/calendar/AddPanel.tsx, src/components/calendar/AddPanel.test.tsx, src/components/calendar/CalendarScreen.tsx, src/components/calendar/CalendarScreen.test.tsx, src/types/calendar.ts, src/lib/calendar/occupancy.ts, src/lib/calendar/occupancy.test.ts
- Tests: src/lib/calendar/rules.test.ts, src/lib/storage/calendar.test.ts, src/components/calendar/AllDayPanel.test.tsx, src/components/calendar/MonthGrid.test.tsx, src/components/calendar/rows/PhoneWeekList.test.tsx, src/components/calendar/AddPanel.test.tsx, src/lib/calendar/occupancy.test.ts
- TDD: required — design.md 7절. `CalAllDay.part`는 선택 칸(`part?: 'am' | 'pm' | null`, 없으면 종일)이라 옛 시험 줄은 그대로 둔다. `lib/calendar`는 환자 자료 구역 규칙을 그대로 지킨다(가드레일 시험 통과).

## TASK-10: 명단 화면
- Phase: 2
- AC: AC-7612.1, AC-7612.2, AC-7612.3, AC-7612.4, AC-7612.5, AC-7612.6
- REQ: REQ-7612
- Files: src/app/(app)/staff/page.tsx, src/components/staff/roster/*
- Tests: src/components/staff/roster/RosterScreen.test.tsx, src/lib/staff/roster.test.ts
- TDD: required — 시안 list.html ①~⑥(폰 장면 ⑦은 만들지 않음). 알림 요일은 셈한 값(시안의 '11-24 월요일'은 틀림 → 화요일).

## TASK-11: 근무표 화면
- Phase: 2
- AC: AC-7613.1, AC-7613.2, AC-7613.3, AC-7613.4
- REQ: REQ-7613
- Files: src/app/(app)/staff/schedule/page.tsx, src/components/staff/schedule/*
- Tests: src/components/staff/schedule/WeekView.test.tsx, src/components/staff/schedule/MonthView.test.tsx, src/components/staff/schedule/PlanEditor.test.tsx, src/components/staff/schedule/DayDialog.test.tsx
- TDD: required — 시안 schedule.html ①~⑤(폰 장면 ⑥은 만들지 않음).

## TASK-12: 휴가 화면
- Phase: 2
- AC: AC-7614.1, AC-7614.2, AC-7614.3, AC-7614.4, AC-7614.5, AC-7614.6
- REQ: REQ-7614
- Files: src/app/(app)/staff/leave/page.tsx, src/components/staff/leave/*
- Tests: src/components/staff/leave/LeaveScreen.test.tsx, src/components/staff/leave/LeaveEditor.test.tsx, src/components/staff/leave/page.test.tsx
- TDD: required — 시안 leave.html ①~⑤ + ⑥ '나'(폰 장면 ⑦은 만들지 않음). 기본 근무가 없는 사람의 휴가 날은 공휴일·휴진일만 빼고 센다(AC-7614.3, 검토 뒤 명세에 적음 — 코드 `leaveView.ts countableDays`는 이미 그렇다).

## TASK-13: 급여 화면
- Phase: 2
- AC: AC-7615.1, AC-7615.2, AC-7615.3, AC-7615.4, AC-7615.5, AC-7615.6, AC-7615.7, AC-7615.8, AC-7615.9, AC-7615.10
- REQ: REQ-7615
- Files: src/app/(app)/staff/pay/page.tsx, src/components/staff/pay/*
- Tests: src/components/staff/pay/PayView.test.tsx, src/components/staff/pay/MonthPay.test.tsx, src/components/staff/pay/IncentivePart.test.tsx, src/components/staff/pay/TaxFiles.test.tsx, src/components/staff/pay/LaborCost.test.tsx, src/components/staff/pay/PaySlip.test.tsx, src/lib/staff/pay.test.ts, src/lib/storage/staff.test.ts
- TDD: required — 시안 pay.html ①~⑧(폰 장면 ⑨는 만들지 않음). 그림은 `dataviz` 규칙·`globals.css` 토큰.

## TASK-14: 합치기 통합 시험 · 전체 검사 · 마지막 검토
- Phase: 3
- AC: AC-7611.2, AC-7611.3, AC-7611.4
- REQ: REQ-7611
- Files: src/app/(app)/staff/staff.integration.test.tsx
- Tests: src/app/(app)/staff/staff.integration.test.tsx
- TDD: required — 네 화면을 가짜 저장소로 함께 그려 작은 메뉴 이동·데스크 막기·넓은 표만 밀림을 본다. 그다음 `npm run lint`·`npm test`·`npm run build`, ssk-screen-check로 PC 너비 사진, ssk-finish-check로 마지막 검토 한 번. 검토에서 나온 고침은 해당 TASK 파일 안에서만.

## TASK-15: 검토 고침 — 급여
- Phase: 4
- AC: AC-7615.2, AC-7615.4, AC-7615.6, AC-7615.7, AC-7615.9, AC-7615.10, AC-7615.11, AC-7610.1, AC-7611.4
- REQ: REQ-7615, REQ-7610, REQ-7611
- Files: src/components/staff/pay/PayView.tsx, src/components/staff/pay/PayView.test.tsx, src/components/staff/pay/MonthPay.tsx, src/components/staff/pay/MonthPay.test.tsx, src/components/staff/pay/AdjustPanel.tsx, src/components/staff/pay/ItemsEditor.tsx, src/components/staff/pay/RulesEditor.tsx, src/components/staff/pay/IncentivePart.tsx, src/components/staff/pay/IncentivePart.test.tsx, src/components/staff/pay/LaborCost.tsx, src/components/staff/pay/LaborCharts.tsx, src/components/staff/pay/LaborCost.test.tsx, src/components/staff/pay/SlipPart.tsx, src/components/staff/pay/PaySlip.tsx, src/components/staff/pay/PaySlip.test.tsx, src/components/staff/pay/parts.tsx, src/components/staff/pay/usePayData.ts, src/components/staff/pay/payPeople.ts, src/components/staff/pay/payTestKit.tsx, src/components/staff/pay/pcOnly.test.tsx, src/lib/staff/pay.ts, src/lib/staff/pay.test.ts, src/lib/errors.ts, src/lib/errors.test.ts, docs/ADR.md, docs/UI_GUIDE.md
- Tests: src/components/staff/pay/PayView.test.tsx, src/components/staff/pay/MonthPay.test.tsx, src/components/staff/pay/IncentivePart.test.tsx, src/components/staff/pay/LaborCost.test.tsx, src/components/staff/pay/PaySlip.test.tsx, src/components/staff/pay/pcOnly.test.tsx, src/lib/staff/pay.test.ts, src/lib/errors.test.ts
- TDD: required — 검토(2026-11-21) 4·5·6·11 + 화면 사진 + 사용자 결정. ① 저장 실패는 줄마다 기억해 다른 줄 저장이 성공해도 E-STAFF-SAVE-FAILED가 남는다(`usePayData.ts`, AC-7615.2) ② [항목 고치기]·[인센티브 규칙 고치기] 저장 중에는 단추를 막아 두 번 저장·덮어쓰기가 없다(`ItemsEditor`·`RulesEditor`, AC-7615.4) ③ 보는 달 줄 하나로: 이달 급여·인센티브·세무사 엑셀(`payPeople.ts`)·인건비·명세서가 '저장된 줄 ?? 새 줄(고정 수당 포함)'을 같이 쓰고, 인건비 '{n}명' = 그달 재직자 수(AC-7615.11) ④ 인건비 그림: 저장된 급여 줄이 없는 달은 막대·% 점을 비우고 '{M}월 급여 자료 없음', 달별 표 '–'(`LaborCharts`·`LaborCost`, AC-7615.9) ⑤ 폰 모양 없애기: `PayView`·`AdjustPanel`의 `ds.segment.group` → `pay/parts.tsx`의 PC 단추 묶음 틀, `LaborCost` `md:grid-cols-3`·`SlipPart` `md:grid-cols-[…]`·`MonthPay` `lg:grid-cols-[…]`·`RulesEditor` `lg:grid-cols-2` → 폭과 상관없는 칸 나눔, 넓은 칸은 `TableScroll` 안·최소 폭(AC-7611.4, `pcOnly.test.tsx`) ⑥ 줄맞춤: `MonthPay`·`LaborCost` 머리·합계 칸의 기본 `text-right`가 `text-left`·`text-center`를 이기지 않게(시안대로, AC-7615.2·7615.9) ⑦ [엑셀 받기] 실패는 E-STAFF-EXCEL-FAILED, `errors.ts` 그 번호 문구를 AC-7610.1 글로 넓힘(AC-7615.7) ⑧ 명세서 미리 보기는 A4 그대로임을 시험으로 지킴(AC-7615.10) ⑨ 문서: `docs/ADR.md` ADR-039에 넷째 줄(design.md 2절, 제목·첫 세 줄 그대로·맨 끝 그대로), `docs/UI_GUIDE.md` 굵기 예외에 '급여 명세서 그림'. 화면 글은 `requirements.md` '화면 글 기본값' 그대로. 통합 시험은 고치지 않고 통과.

## TASK-16: 검토 고침 — 명단·근무표·휴가 + 주민번호 모양 막기
- Phase: 4
- AC: AC-7612.2, AC-7612.3, AC-7612.7, AC-7613.1, AC-7613.2, AC-7613.4, AC-7614.1, AC-7614.3, AC-7614.4, AC-7608.3, AC-7608.6, AC-7610.4, AC-7610.6, AC-7611.4
- REQ: REQ-7612, REQ-7613, REQ-7614, REQ-7608, REQ-7610, REQ-7611
- Files: src/components/staff/roster/MemberCard.tsx, src/components/staff/roster/MemberForm.tsx, src/components/staff/roster/RosterList.tsx, src/components/staff/roster/RosterScreen.tsx, src/components/staff/roster/ExcelPreview.tsx, src/components/staff/roster/RosterScreen.test.tsx, src/components/staff/roster/pcOnly.test.tsx, src/components/staff/schedule/ScheduleScreen.tsx, src/components/staff/schedule/WeekTable.tsx, src/components/staff/schedule/MonthView.tsx, src/components/staff/schedule/DayDialog.tsx, src/components/staff/schedule/parts.tsx, src/components/staff/schedule/scheduleTestKit.tsx, src/components/staff/schedule/WeekView.test.tsx, src/components/staff/schedule/MonthView.test.tsx, src/components/staff/schedule/DayDialog.test.tsx, src/components/staff/schedule/pcOnly.test.tsx, src/components/staff/leave/LeaveDialog.tsx, src/components/staff/leave/LeaveEditor.tsx, src/components/staff/leave/LeaveRecord.tsx, src/components/staff/leave/LeaveScreen.tsx, src/components/staff/leave/LeaveStatusTable.tsx, src/components/staff/leave/leaveView.ts, src/components/staff/leave/testData.ts, src/components/staff/leave/LeaveScreen.test.tsx, src/components/staff/leave/LeaveEditor.test.tsx, src/components/staff/leave/page.test.tsx, src/components/staff/leave/pcOnly.test.tsx, src/lib/staff/nationalId.ts, src/lib/staff/nationalId.test.ts, src/lib/staff/rosterExcel.ts, src/lib/staff/rosterExcel.test.ts, src/lib/storage/staff.ts, src/lib/storage/staff.test.ts
- Tests: src/components/staff/roster/RosterScreen.test.tsx, src/components/staff/roster/pcOnly.test.tsx, src/components/staff/schedule/WeekView.test.tsx, src/components/staff/schedule/MonthView.test.tsx, src/components/staff/schedule/DayDialog.test.tsx, src/components/staff/schedule/pcOnly.test.tsx, src/components/staff/leave/LeaveScreen.test.tsx, src/components/staff/leave/LeaveEditor.test.tsx, src/components/staff/leave/page.test.tsx, src/components/staff/leave/pcOnly.test.tsx, src/lib/staff/nationalId.test.ts, src/lib/staff/rosterExcel.test.ts, src/lib/storage/staff.test.ts
- TDD: required — 검토(2026-11-21) 1·7·8·12 + 화면 사진 + 작은 것. ① 주민번호 모양: `lib/staff/nationalId.ts` `hasNationalId`(AC-7610.6 막는 보기·반례 모두 시험) → 저장 층 `checkMember`가 주소·메모에서 막음(`saveMember`·`importRoster`, AC-7610.6), `rosterExcel.ts` 주소·메모 칸 문제 줄(AC-7608.6), `MemberForm` 칸 아래 글(AC-7612.7) — 전화·계좌 모양 메모는 저장되는 반례 시험 ② 한 사람 기록 [고치기]는 묶음 전체를 넘긴다(`leaveView.ts`·`LeaveRecord`·`LeaveEditor`, 기간 밖 날이 지워지지 않음, AC-7614.4) ③ 지우고 넣기 중간 실패 → 다시 읽기(`DayDialog`·`LeaveEditor`, AC-7613.4·7614.3) ④ 넘어온 연차: 명단 카드 '생긴 연차' = 생긴만 + '넘어옴 {n}일'(`MemberCard`, AC-7612.2), 휴가 표 아래 글 'carry'면 '막대 = 남은 ÷ (생긴 + 넘어옴).'(`LeaveScreen`, AC-7614.1) ⑤ 폰 모양 없애기: `LeaveDialog` `max-md:grid-cols-*`·`ds.segment.group`, `RosterList` `ds.segment.group` → `schedule/parts.tsx` PC 틀, 근무표 달 달력은 `TableScroll` 안·최소 폭(`MonthView`, AC-7613.2·7611.4, 폴더마다 `pcOnly.test.tsx`) ⑥ 근무표 공휴일·휴진 칸 회색을 시안 `--closed`쯤으로 진하게(`WeekTable`·`MonthView`, 예: `bg-line/60`, AC-7613.1) ⑦ `ScheduleScreen`은 병원 정보를 다 읽기 전에 기본값으로 그리지 않고 '근무표를 불러오는 중이에요'(AC-7613.1) ⑧ `purgeMember`: 바구니가 지운 개수가 서류 수보다 적으면 E-STAFF-FILE-FAILED·직원 줄 그대로(AC-7610.4) ⑨ 입사일 글 '입사일을 적어 주세요. 연차와 근속을 셀 때 써요.'와 '화면 글 기본값' 글이 그대로인지(AC-7612.3·7613.1·7613.2·7614.1·7608.3). `staff.ts`의 열쇠 줄 저장은 그대로 둔다. 통합 시험은 고치지 않고 통과.

## TASK-17: 검토 고침 — DB 권한·파일 지우기
- Phase: 4
- AC: AC-7601.1, AC-7610.3
- REQ: REQ-7601, REQ-7610
- Files: supabase/migrations/20261121000000_staff.sql, supabase/staff.rls.test.ts, src/lib/storage/staffFiles.ts, src/lib/storage/staffFiles.test.ts
- Tests: supabase/staff.rls.test.ts, src/lib/storage/staffFiles.test.ts
- TDD: required — 검토(2026-11-21) 3 + 작은 것. ① SQL: 기본 근무·바뀐 날·더 일한 시간·급여 줄·달 줄 다섯 표의 update 권한에서 열쇠 칸(staff_id·from_day·day·kind·month)을 빼 design.md 1절 권한 표와 똑같이(주석의 'upsert' 말도 '고치고, 없으면 넣기'로). revoke all 뒤 다시 주므로 두 번 실행해도·이미 실행한 DB에 다시 붙여도 그 표가 된다(AC-7601.1) ② `staff.rls.test.ts`: `GRANTS`를 design 1절 표대로, 'upsert(열쇠 칸까지 SET)' 시험을 '값 칸 update·열쇠와 함께 insert는 되고 열쇠 칸 update는 거절'로 바꿈. ADR-039 문서 시험은 첫 세 줄을 그대로 보게 둔다(TASK-15가 넷째 줄을 더함) ③ `staffFiles.ts deleteFile`: 바구니가 0개를 지우면 E-STAFF-FILE-FAILED·줄 그대로(AC-7610.3). 실제 Supabase에는 붙이지 않는다(배포 때 사용자가 SQL Editor에).

## TASK-18: 넘어온 연차 — DB 칸 둘
- Phase: 5
- AC: AC-7601.1, AC-7601.8
- REQ: REQ-7601
- Files: supabase/migrations/20261121000000_staff.sql, supabase/staff.rls.test.ts
- Tests: supabase/staff.rls.test.ts
- TDD: required — design.md 1절 '넘어온 연차 시작 값'·권한 표·시험 끝 줄. ① `staff_members` `create table` 안 `used_before_from` 다음에 `carry_start numeric(4, 1) not null default 0 check (carry_start between -30 and 100 and carry_start * 2 = trunc(carry_start * 2))`·`registered_on date not null default (now() at time zone 'Asia/Seoul')::date`, 표 바로 아래 같은 정의의 `alter table public.staff_members add column if not exists …` 두 줄(두 칸 없는 앞 판을 실행한 DB), 직원 표 위 주석에 두 칸 뜻(시작 값 = 'carry' 셈의 시작 기간 넘어옴, 등록일 = 웹앱에 처음 넣은 날·DB가 정함) ② 직원 칸 권한 insert/update에 `carry_start`만 더하고(주석 '값 칸 열일곱'), `registered_on`은 주지 않는다(AC-7601.1) ③ `staff.rls.test.ts`: 칸 모양·`GRANTS`·기본값 0·범위(−30·100·−0.5 됨, −30.5·100.5·1.3·null 거절)·등록일 = 넣은 때 한국 오늘·원장이 `registered_on`을 넣거나 고치면 권한 거절·다른 칸 고쳐도 등록일 그대로·두 칸을 지운 표에 파일을 다시 붙이면 두 칸이 같은 정의로 다시 생김·두 번 실행. 옛 시험은 그대로 통과. **실제 Supabase에는 붙이지 않는다**(배포 때 사용자가 SQL Editor에 — 이 파일은 아직 운영에 실행하지 않았다).

## TASK-19: 넘어온 연차 — 연차 셈 시작 기간
- Phase: 5
- AC: AC-7604.7, AC-7604.9
- REQ: REQ-7604
- Files: src/lib/staff/leave.ts, src/lib/staff/leave.test.ts
- Tests: src/lib/staff/leave.test.ts
- TDD: required — design.md 4절 '넘김 시작 기간'. `LeavePerson`에 선택 칸 `carryStart?: number`·`registeredOn?: string | null`(없으면 시작 기간 = 첫 기간·시작 값 0 — 지금 셈과 같아 옛 시험·다른 폴더는 그대로). 장부에서 끝날이 등록일보다 앞인 기간은 넘어옴 0·다음으로 안 넘김, 시작 기간 넘어옴 = `carryStart`('carry'만), **'pay'·'carry' 모두** 앞 기간이 시작 기간 앞이면 `previous` null·`settleInMonth`는 시작 기간 앞 줄(기간 끝·퇴사 모두)을 내지 않음(그것뿐이면 null), 시작 기간과 그 뒤 정산은 지금처럼('올해 이미 쓴 연차' 반영). 시험: AC-7604.9 보기 이도윤(등록일 2026-11-21 · 시작 값 없음 16/0/6/10 · 시작 값 3 → 넘어옴 3·남은 13 · 2027-07-20 넘어옴 13·남은 29·previous 2026-07-17~2027-07-16 · 'pay'면 16/6/10·previous null·`settleInMonth('2026-07')` null·`settleInMonth('2027-07')` = 시작 기간 남은 일수), 옛 셈이면 크게 쌓였을 넘어옴이 0인지, 1월 1일 기준(등록일이 든 해), 등록일이 입사 전(첫 기간), 퇴사 뒤 등록(넘어옴 0·정산 null — 두 설정), 음수 시작 값(−1.5), `settleInMonth`(퇴사 달 정산에 시작 값 포함)·`remainingAt`(등록일 앞 날은 넘어옴 0)을 경계값으로. AC-7604.8 보기는 그대로 통과(등록일 없음 = 첫 기간). 이 TASK는 `@/types/staff`를 불러오지 않는다(TASK-18과 기다리지 않음).

## TASK-20: 넘어온 연차 — 형·저장 층·엑셀·양식·명단 화면 + 휴가 화면 시험
- Phase: 6
- AC: AC-7608.1, AC-7608.7, AC-7610.7, AC-7612.8, AC-7611.4, AC-7614.4, AC-7614.6
- REQ: REQ-7608, REQ-7610, REQ-7612, REQ-7611, REQ-7614
- Files: src/types/staff.ts, src/lib/storage/staff.ts, src/lib/storage/staff.test.ts, src/lib/staff/rosterExcel.ts, src/lib/staff/rosterExcel.test.ts, scripts/make_staff_template.py, public/staff/staff-template.xlsx, src/components/staff/roster/MemberForm.tsx, src/components/staff/roster/ExcelPreview.tsx, src/components/staff/roster/RosterScreen.tsx, src/components/staff/roster/RosterScreen.test.tsx, src/components/staff/roster/pcOnly.test.tsx, src/components/staff/leave/testData.ts, src/components/staff/leave/LeaveScreen.test.tsx, src/components/staff/pay/payTestKit.tsx, src/components/staff/schedule/scheduleTestKit.tsx, src/components/staff/useStaffBase.test.ts, src/app/(app)/staff/staff.integration.test.tsx
- Tests: src/lib/storage/staff.test.ts, src/lib/staff/rosterExcel.test.ts, src/components/staff/roster/RosterScreen.test.tsx, src/components/staff/roster/pcOnly.test.tsx, src/components/staff/leave/LeaveScreen.test.tsx, src/components/staff/useStaffBase.test.ts, src/app/(app)/staff/staff.integration.test.tsx
- TDD: required — design.md 3절·4절 '엑셀 넘어온 연차(일)'·5절 '넘어온 연차 칸'·6절 '넘어온 연차 칸', 화면 글은 requirements '화면 글 기본값' '넘어온 연차' 그대로. ① 형: `StaffMember`에 `carryStart: number`·`registeredOn: string`, `saveMember` 입력은 `Omit<StaffMember, 'id' | 'registeredOn'>` ② 저장 층: `carry_start` 보내기·읽기, `registered_on`은 읽기만(보내는 줄에 없음 — 새 직원·고침·엑셀 모두), 범위 밖 시작 값이면 아무것도 안 보냄(E-STAFF-SAVE-FAILED), 읽은 줄 등록일이 날짜가 아니면 버림, 엑셀 고침 줄은 적힌 시작 값만(AC-7610.7) ③ 엑셀: `ROSTER_HEADERS` 22칸(맨 끝 '넘어온 연차(일)'), 옛 21칸 양식도 읽음(그 칸은 빈 칸·22번째 칸 안 읽음), 범위·0.5 단위·음수 글자·문제 줄 까닭, 새 직원 비면 0, 고침 줄 비면 그대로·바뀌면 '{칸들}' 맨 끝 '넘어온 연차'(AC-7608.1·7608.7) ④ 양식: `scripts/make_staff_template.py` 맨 끝 칸·숫자 확인·칸 도움말·'안내' 줄 → `py -3.12 -I scripts/make_staff_template.py`로 `public/staff/staff-template.xlsx`를 다시 만들고 스크립트 확인 통과(지어낸 보기 줄만, 바탕화면 옛 양식은 건드리지 않음) ⑤ 명단 화면: `MemberForm`은 'carry'일 때만 '넘어온 연차' 칸(처음 값·비우면 0·음수·까닭 글·적은 값 그대로), 'pay'면 칸 없음·더하기 0·고치기 지금 값, `ExcelPreview`는 'carry'일 때만 '넘어온 연차' 칸(`RosterScreen`이 `settings.leftover`를 넘김, AC-7612.8), 폴더 `pcOnly.test.tsx` 그대로 통과(AC-7611.4) ⑥ 시험 도구: `StaffMember`를 만드는 곳(`leave/testData.ts`·`pay/payTestKit.tsx`·`schedule/scheduleTestKit.tsx`·`useStaffBase.test.ts`·`RosterScreen.test.tsx`·`roster/pcOnly.test.tsx`·`storage/staff.test.ts`)에 `carryStart: 0`·`registeredOn: '2000-01-01'`(가장 이른 입사일보다 앞 — 지금 시험 숫자 그대로) ⑦ 휴가 화면 시험(`LeaveScreen.test.tsx`, 화면 코드는 고치지 않음 — TASK-19 셈의 `previous` null을 그대로 그림): 지난 기간이 등록일보다 앞에 끝난 사람은 한 사람 기록에 '지난 연차 기간' 줄이 없고(AC-7614.4), 이번 달에 이미 끝난 그런 기간은 끝 안내에 없다(AC-7614.6) — 'pay'·'carry' 모두, 등록일이 앞이면 지금처럼 보이는 반례도. 통합 시험은 깨질 때만 시험 도구 값을 맞춘다(화면 코드·`components/ui/classes.ts`는 고치지 않음). 끝에 `npx vitest run src/components/staff src/lib/staff src/lib/storage`로 휴가·급여·근무표 폴더 시험도 그대로 통과하는지 본다. `lib/staff/leave.ts`·휴가·급여·근무표 폴더 화면 코드(`leaveView.ts`·`LeaveRecord.tsx`·`EndNotice.tsx`·`payPeople.ts` 포함)는 고치지 않는다 — 고쳐야 할 것 같으면 보고에 적는다.

## TASK-21: 더보기 판 머리 '준비 중 0개' 빼기
- Phase: 7
- AC: AC-7611.5
- REQ: REQ-7611
- Files: src/components/shell/MoreMenu.tsx, src/components/shell/shell.test.tsx
- Tests: src/components/shell/shell.test.tsx
- TDD: required — design.md 6절. `MoreMenu.tsx` 판 머리 `<p>`에서 `NOT_READY`가 0이면 '준비 중 {n}개' `<span>`을 그리지 않는다('다른 메뉴 {n}개' `<span>`과 `<p>` 클래스는 그대로). `shell.test.tsx` AC-2702.2 시험의 판 머리 글 목록을 `NOT_READY_FEATURES.length`가 0이면 '다른 메뉴 {n}개' 하나, 아니면 둘로 기대하게 고치고 이름에 AC-7611.5를 더한다. 0일 때 판 안에 '준비 중 0개' 글이 없다는 기대도 더한다. 다른 화면·`menu.ts`는 고치지 않는다.

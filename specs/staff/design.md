# 설계: 직원 탭 — 명단 · 근무표 · 휴가 · 급여 (staff)

> 기능 ID `staff`. 기준 갈래 `feat-staff`(운영 b2ab27e5). 시안 `docs/mockups/staff/` 승인(notes.md). 결정 기록 ADR-035(ADR-034는 재고 명세가 씀).
> 주민번호는 저장하지 않으므로 암호화 방식 결정은 없다. 폰 전용 모양은 만들지 않는다 — 넓은 표·달력은 `overflow-x-auto` 칸 하나만 밀린다.

## 1. DB — `supabase/migrations/20261121000000_staff.sql` (REQ-7601~7603)

머리 글은 다른 migration처럼(무엇·실행: 운영자가 SQL Editor에 붙여 한 번·앞에 필요한 파일 auth → … → calendar → desk_accounts → clinic_profile → clinic_emr → hospital_emr·관문: 웹 배포 전·두 번 실행해도 됨·권한 요약). `my_hospital_id()`(승인된 원장만, 데스크·대기는 null)·`calendar_bump()`는 다시 만들지 않는다.

### 표
모든 표: `id uuid pk default gen_random_uuid()`, `hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade`(설정·달 줄은 hospital_id가 키).

| 표 | 칸 | 하나만 |
|---|---|---|
| `staff_members` | name · job · job_other · employment · weekly_hours numeric(4,1) default 40 · hired_on date not null · left_on · phone · birthday · address · bank · account_no · calendar_staff_id · memo · used_before numeric(3,1) default 0 · used_before_from date · created_at · updated_at | (hospital_id, name, hired_on) · (id, hospital_id) · (hospital_id, calendar_staff_id) where not null |
| `staff_week_plans` 기본 근무 | staff_id · from_day date · week jsonb(길이 7 월~일, 칸 = `{start,end,lunchFrom,lunchTo}` 분 또는 null, 1,000바이트) · sat_rotation | (staff_id, from_day) |
| `staff_day_changes` 바뀐 날 | staff_id · day · start_min · end_min · lunch_from · lunch_to · memo(50) | (staff_id, day) |
| `staff_overtime` | staff_id · day · kind · minutes | (staff_id, day, kind) |
| `staff_leaves` | group_id uuid not null · staff_id · day · kind · part · paid boolean default true · memo(50) | (staff_id, day) |
| `staff_settings` | **hospital_id pk** · leave_basis · leftover · pay_items jsonb · updated_at | — |
| `staff_incentive_rules` | staff_id · name · method · unit_amount bigint · percent numeric(5,2) · sort int | — |
| `staff_pay_lines` | month text · staff_id(null 가능) · amounts jsonb `{항목id: 원}` · incentives jsonb · adjust bigint default 0 · adjust_reason · adjust_memo(30) · updated_at | (hospital_id, month, staff_id) |
| `staff_pay_months` | **pk (hospital_id, month)** · employer_cost bigint(null 가능, ≥ 0) · cost_saved_on date · copied_on date | — |
| `staff_files` | kind · staff_id · month · name(100) · path(200) · size int · mime · created_at | (path) |

- 자식 표 직원 키: `foreign key (staff_id, hospital_id) references public.staff_members (id, hospital_id) on delete cascade`. `staff_pay_lines`만 `on delete set null (staff_id)`(PG15 칸 목록 문법).
- check는 AC-7601.4~7601.6 그대로. 0.5 단위 = `x * 2 = trunc(x * 2)`. 근무 칸(바뀐 날): `(start_min is null) = (end_min is null)`, `(lunch_from is null) = (lunch_to is null)`, 점심은 근무 안, 모두 `% 10 = 0`. week jsonb 안 모양은 앱(`checkWeek`)이 보고 DB는 배열·길이·크기만. 방식별: `per_case`·`fixed` ⇒ unit_amount not null·percent null, `percent` ⇒ 반대. 휴가: `(kind = 'half') = (part is not null)`, `kind = 'sick' or paid = (kind <> 'unpaid')`. 파일: `(kind = 'doc' and staff_id is not null and month is null and mime in (pdf, jpeg, png)) or (kind = 'tax' and staff_id is null and month is not null and mime in (pdf, zip, xlsx, xls, jpeg, png))`, path 모양 `^[0-9a-f-]{36}/(doc/[0-9a-f-]{36}|tax/[0-9]{4}-[0-9]{2})/[0-9a-f-]{36}\.[a-z0-9]{1,5}$` + `split_part(path, '/', 1) = hospital_id::text`.
- `pay_items` 기본값: `[{"id":"base","name":"기본급","kind":"amount","base":true,"removedFrom":null}, {"id":"overtime","name":"연장수당",…}, {"id":"meal","name":"식대",…}, {"id":"incentive","name":"인센티브","kind":"incentive","base":true,…}, {"id":"bonus","name":"상여",…}]`(배열·30개·4,000바이트만 DB가, 안 모양은 앱 `checkPayItems`). 항목은 `removedFrom`('YYYY-MM') 앞 달에만 보인다.
- 트리거(모두 `set search_path = ''`, 함수 revoke all): touch(updated_at, `clinic_profiles_touch` 모양) — members·settings·pay_lines. `staff_files_limit`(before insert, invoker): 같은 병원 같은 직원 'doc' 또는 같은 달 'tax'가 이미 20개면 raise.

### 권한 (revoke all from public, anon, authenticated 뒤)
| 표 | authenticated |
|---|---|
| staff_members | select · delete · insert/update(name, job, job_other, employment, weekly_hours, hired_on, left_on, phone, birthday, address, bank, account_no, calendar_staff_id, memo, used_before, used_before_from) |
| staff_week_plans | select · delete · insert(staff_id, from_day, week, sat_rotation) · update(week, sat_rotation) |
| staff_day_changes | select · delete · insert(staff_id, day, start_min, end_min, lunch_from, lunch_to, memo) · update(start_min, end_min, lunch_from, lunch_to, memo) |
| staff_overtime | select · delete · insert(staff_id, day, kind, minutes) · update(minutes) |
| staff_leaves | select · delete · insert(group_id, staff_id, day, kind, part, paid, memo) — 고치기 없음(묶음을 지우고 다시 넣는다) |
| staff_settings | select · insert/update(leave_basis, leftover, pay_items) |
| staff_incentive_rules | select · delete · insert(staff_id, name, method, unit_amount, percent, sort) · update(name, method, unit_amount, percent, sort) |
| staff_pay_lines | select · insert(month, staff_id, amounts, incentives, adjust, adjust_reason, adjust_memo) · update(amounts, incentives, adjust, adjust_reason, adjust_memo) |
| staff_pay_months | select · insert(month, employer_cost, cost_saved_on, copied_on) · update(employer_cost, cost_saved_on, copied_on) |
| staff_files | select · delete · insert(kind, staff_id, month, name, path, size, mime) |

정책은 표마다 `for all to authenticated using/with check (hospital_id = (select public.my_hospital_id()))`(clinic_profiles·calendar_appts와 같은 글). 데스크 정책은 두지 않는다. `staff_members` delete만 따로: `using (hospital_id = (select public.my_hospital_id()) and left_on is not null and left_on + interval '3 years' < (now() at time zone 'Asia/Seoul')::date)`(AC-7601.7).

### 예약 휴무 잇기 (REQ-7602)
```sql
alter table public.calendar_allday add column if not exists part text;
alter table public.calendar_allday add column if not exists leave_id uuid references public.staff_leaves (id) on delete cascade;
-- 이름 있는 제약 calendar_allday_part: part is null or (type = 'off' and part in ('am','pm')) — clinic_profile 파일의 do 블록 모양으로 없을 때만 더함
```
- 사용자 insert 칸 목록(day, type, memo, staff_id, staff_name)은 그대로 → part·leave_id는 트리거만 쓴다. select는 표 단위라 원장·데스크 모두 두 칸을 읽는다.
- `staff_leave_link()` (security definer, after insert on staff_leaves for each row): 직원 `calendar_staff_id`가 있고 `clinic_profiles.staff`에 그 id 사람이 있으면 `insert into calendar_allday (hospital_id, day, type, staff_id, staff_name, part, leave_id) values (new.hospital_id, new.day, 'off', …, left(이름, 10), new.part, new.id) on conflict (hospital_id, day, staff_id) where type = 'off' do nothing`(손으로 넣은 휴무 그대로). 지우기는 `on delete cascade`.
- `staff_member_relink()` (security definer, after update of calendar_staff_id on staff_members, 값이 바뀐 줄만): `delete from calendar_allday where leave_id in (그 직원 휴가)` → 새 id가 있으면 `day >= 한국 오늘 − 1년` 휴가마다 위와 같이 넣기.
- `calendar_allday` statement 트리거 `calendar_bump()`가 그대로 rev를 올린다(원장 세션).

### 바구니 (REQ-7603)
`insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('staff-files', 'staff-files', false, 10000000, array['application/pdf','image/jpeg','image/png','application/zip','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel']) on conflict (id) do update …`. 정책 clinic-logos 모양: 읽기·지우기 = `bucket_id = 'staff-files' and (storage.foldername(name))[1] = (select public.my_hospital_id())::text`, 올리기 = 같은 조건 + `exists (select 1 from public.staff_files f where f.hospital_id = (select public.my_hospital_id()) and f.path = objects.name)`. update 정책 없음.

### 시험 `supabase/staff.rls.test.ts`
`clinicEmr.rls.test.ts` 틀(PGlite, CHAIN → clinic_profile → clinic_emr → hospital_emr → 이 파일 → 이 파일 다시). 사람: 원장 A·B, A 데스크, 대기·거절 원장, 병원 없음, anon. 본다: 열 표 칸 권한(`information_schema.column_privileges`로 정확히 위 표)·RLS·제약·남의 병원 직원 id 거절·cascade/set null·지우기 정책(3년)·트리거(넣기·지우기·손 휴무 그대로·병원 정보에 없는 시행자·연결 끊기·바꾸기·rev 오름)·calendar_allday 옛 줄·정책·insert 칸 그대로·파일 줄 종류·20개 한도·바구니 정책·두 번 실행.

## 2. 결정 기록 ADR-035 (`docs/ADR.md` 끝)
> ### ADR-035: 직원 자료(연락처·주소·생일·계좌·근무·휴가·급여·서류 파일)를 Supabase에 원장만 보게 둔다. 주민번호는 두지 않는다
> - plan.md 4절 '서버로 가는 것: 직원 이름·직종·금액'을 넓힌다. 표마다 RLS `my_hospital_id()`(승인된 원장) 하나, 데스크 정책 없음. 서류·세무사 파일은 비공개 바구니 `staff-files`.
> - 휴가 → 예약 '휴무'는 앱이 아니라 DB 트리거가 잇는다(휴가와 종일 줄이 어긋나지 않게). `calendar_allday`에 `part`·`leave_id`를 더한다.
> - [급여 확정] 잠금은 두지 않는다(사용자). 달 줄이 그때 인센티브 규칙을 복사해 두고, 규칙을 고치면 보는 달부터만 바꿔 지난 달 금액이 안 바뀐다.

`docs/ARCHITECTURE.md` DB 표 목록에 열 표·바구니 한 줄씩. (plan.md는 총괄 창이 고친다.)

## 3. 형 — `src/types/staff.ts`
```ts
export const STAFF_JOBS = ['간호사', '간호조무사', '물리치료사', '방사선사', '원무', '기타'] as const
export type StaffJob = (typeof STAFF_JOBS)[number]
export type Employment = 'regular' | 'contract' | 'part'
export type DayShift = { start: number; end: number; lunchFrom: number | null; lunchTo: number | null } | null // 분, 10분 단위, null = 쉼
export type SatRotation = 'every' | '1-3' | '2-4'
export type WeekPlan = { id: string; staffId: string; from: string; week: DayShift[] /* 7칸 월~일 */; sat: SatRotation }
export type StaffMember = { id: string; name: string; job: StaffJob; jobOther: string | null; employment: Employment; weeklyHours: number
  hiredOn: string; leftOn: string | null; phone: string | null; birthday: string | null; address: string | null; bank: string | null
  accountNo: string | null; calendarStaffId: string | null; memo: string | null; usedBefore: number; usedBeforeFrom: string | null }
export type DayChange = { staffId: string; day: string; shift: DayShift; memo: string | null }
export type OvertimeKind = 'extended' | 'night' | 'holiday'
export type Overtime = { staffId: string; day: string; kind: OvertimeKind; minutes: number }
export type LeaveKind = 'annual' | 'half' | 'family' | 'sick' | 'maternity' | 'unpaid'
export type Leave = { id: string; groupId: string; staffId: string; day: string; kind: LeaveKind; part: 'am' | 'pm' | null; paid: boolean; memo: string | null }
export type LeaveBasis = 'hire' | 'jan1'
export type Leftover = 'pay' | 'carry'
export type PayItem = { id: string; name: string; kind: 'amount' | 'incentive'; base: boolean; removedFrom: string | null }
export type StaffSettings = { leaveBasis: LeaveBasis; leftover: Leftover; payItems: PayItem[] }
export type IncentiveMethod = 'per_case' | 'percent' | 'fixed'
export type IncentiveRule = { id: string; staffId: string; name: string; method: IncentiveMethod; unitAmount: number | null; percent: number | null; sort: number }
export type IncentiveEntry = { ruleId: string | null; name: string; method: IncentiveMethod; unitAmount: number | null; percent: number | null; count: number | null; sales: number | null }
export type AdjustReason = 'prorate' | 'deduct' | 'other'
export type PayLine = { id: string | null; month: string; staffId: string | null; amounts: Record<string, number>; incentives: IncentiveEntry[]
  adjust: number; adjustReason: AdjustReason | null; adjustMemo: string | null }
export type PayMonth = { month: string; employerCost: number | null; costSavedOn: string | null; copiedOn: string | null }
export type StaffFile = { id: string; kind: 'doc' | 'tax'; staffId: string | null; month: string | null; name: string; path: string; size: number; mime: string; createdAt: string }
```
`lib/staff/*` 순수 함수는 이 파일을 **불러오지 않고** 필요한 칸만 든 자기 입력 형을 둔다(같은 Phase 일꾼이 서로 기다리지 않게). 칸 이름이 위와 같아 구조가 맞아 그대로 넘긴다. `lib/staff`는 네트워크·저장소·React를 쓰지 않는다(엑셀 받기 한 함수만 `xlsx` writeFile, 그림 파일은 `slipPng.ts`).

## 4. 순수 함수 (`src/lib/staff/`)
| 파일 | 내보내는 것 | AC |
|---|---|---|
| `leave.ts` | `annualDays(years)` · `ceilHalf(x)` · `leaveStatus({ person, leaves, basis, leftover, today })` → `{ period: {from,to}, basis, firstYear, granted, carried, used, left, next: {day, days, inDays} \| null, endsThisMonth: boolean, previous: {from,to,granted,used,left,settledMonth} \| null }` · `settleInMonth({ person, leaves, basis, leftover, month })` → 그달 끝난 기간 정산 일수 \| null · `remainingAt(…, day)` · `retireGap(…)` | REQ-7604 |
| `schedule.ts` | `checkWeek(week)` · `nthSaturday(day)` · `planOn(plans, day)` · `shiftOn({ member, plans, changes, day })` · `isChangedDay(…)` · `dayKind(day, { hours, closedDates })` → `{ holiday: boolean, closed: boolean, noHolidayList: boolean }` · `holidayPrefill(shift)` · `monthOvertime(overtime, month)` · `expandLeave({ from, to }, ctx)` · `workingCount(day, ctx)` · `fmtMinutes(m)`('2시간 30분') · `weekSummary(plan)`('월~금 09:00~18:00 (점심 13:00~14:00)' 줄들) | REQ-7605 |
| `pay.ts` | `visibleItems(items, month)` · `checkPayItems(items)` · `incentiveAmount(entry)` · `lineTotal(line, items, month)` → `{ total, incentive, problem }` · `newLine({ month, staffId, rules })` · `copyPrev(line, prev, items, month)` · `applyRules(entries, rules)` · `laborCost(lines, items, month, employerCost)` · `revenueRatio(cost, revenue)`(소수 첫째 반올림, 0·null → null) · `monthRevenue(days)`(`revenueDayValues` 합) | REQ-7606 |
| `roster.ts` | `upcoming(members, today)` → `{ day, staffId, kind: 'birthday' \| 'anniversary', years? }[]` · `tenure(hiredOn, today)` · `keepUntil(leftOn)` · `canPurge(member, today)` · `splitActive(members, today)` · `employedIn(member, month)` | REQ-7607 |
| `rosterExcel.ts` | `ROSTER_HEADERS`(21칸) · `readRoster(buffer, existing, ctx)` → `{ problem: string \| null, rows: { line, action: 'new' \| 'update' \| 'problem', reason: string \| null, changed: string[], member: Partial<…>, plan: { week, sat } \| null }[] }` | REQ-7608 |
| `taxExcel.ts` | `taxSheet(input)` → `{ fileName, sheetName, rows: (string \| number \| null)[][] }`(순수) · `downloadTaxExcel(sheet)` | REQ-7609 |
| `slipPng.ts` | `downloadSlipPng(svg, fileName): Promise<boolean>` — `lib/forms/png.ts`의 `svgForImage`(글꼴 data: 주소)로 캔버스 → PNG(서식 탭과 같은 길, `png.ts`는 고치지 않음) | AC-7615.10 |

- 날짜는 모두 `lib/analytics/dates.ts`(`addDays`·`addMonthsToDay`·`weekdayOf`·`monthRange`·`parseDateCell`), '2026.03.02'는 `rosterExcel.ts`가 '-'로 바꿔 `parseDateCell`에 넘긴다. 공휴일은 `lib/analytics/holidays.ts` `HOLIDAYS`(목록 첫 해~끝 해 밖이면 `noHolidayList`).
- 연차 기간(입사일 기준): 0번 = [입사일, 입사일+1년) 달마다 1일, k번(k≥1) = [입사일+k년, +k+1년) `annualDays(k)`. 1월 1일 기준: 0번은 같고, 입사 다음 해 1월 1일 비례, 그 뒤 해마다. 오늘이 든 기간을 보인다.
- 인센티브 % 셈은 정수로: `Math.floor(sales * Math.round(percent * 100) / 10000)`.
- 엑셀 넣은 기본 근무 점심 = 병원 정보 그 요일 `lunchFrom~lunchTo`(근무 안일 때).

## 5. 저장 층 — `src/lib/storage/staff.ts`·`staffFiles.ts`, 오류 `src/lib/errors.ts`
`createStaffStore(client: SupabaseClient)` → `listMembers()` · `saveMember(m, id?)` · `purgeMember(member)`(서류 파일 먼저) · `importRoster(rows)` · `listPlans()` · `savePlan(staffId, from, week, sat)` · `listChanges(range)` · `saveChange(c)` · `resetDay(staffId, day)`(바뀐 날·더 일한 시간 지움) · `listOvertime(range)` · `saveOvertime(o)`(0이면 지움) · `listLeaves(range)` · `addLeaveGroup(rows)` · `replaceLeaveGroup(groupId, rows)` · `deleteLeaveGroup(groupId)` · `countAppts(calendarStaffId, days)`(`calendar_appts`에서 `day`만 select, status 취소 빼고) · `loadSettings()`(줄 없으면 기본값) · `saveSettings(s)`(upsert onConflict hospital_id) · `listRules()` · `saveRules(staffId, rules, fromMonth)`(규칙 저장 + fromMonth 이후 줄 `applyRules`) · `listPayLines(fromMonth, toMonth)` · `savePayLine(line)`(upsert onConflict hospital_id,month,staff_id) · `listPayMonths(fromMonth, toMonth)` · `savePayMonth(m)`. `staffFiles.ts`: `listFiles(kind)` · `uploadFile({ kind, staffId \| month, file })` · `deleteFile(f)` · `downloadFile(f)`. `clinicProfile.ts`의 `Pick<SupabaseClient, …>`·1,000줄씩 읽기 방식을 따른다. 엑셀 넣기 = 새 줄 한 번 insert(+ 기본 근무 줄) → 고침 줄은 10개씩 update(적힌 칸만).

오류 번호 다섯(AC-7610.1) `E-STAFF-READ-FAILED`·`E-STAFF-SAVE-FAILED`·`E-STAFF-FILE-FAILED`·`E-STAFF-EXCEL-FAILED`·`E-STAFF-IMAGE-FAILED` — 문구는 `E-CLINIC-*` 말투.

## 6. 화면
- 주소 `/staff`(명단) · `/staff/schedule` · `/staff/leave` · `/staff/pay`. `src/app/(app)/staff/layout.tsx`(server): `currentMe()` — 데스크면 `null`(막힌 화면은 DeskGate), 아니면 제목 '직원' + `<StaffNav />` + children. 각 page.tsx는 `metadata: { title: '직원' }`·`dynamic = 'force-dynamic'`, 오늘은 `todayInKorea()`로 넘긴다.
- `menu.ts`: 직원 `href: '/staff'`·`ready: true`, `MenuHref`에 '/staff'. `notReadyFeatures.ts`에서 '/staff' 항목·형 빼기. `dashboard/briefing/features.ts` 직원 status 'ready'. DeskGate는 고치지 않는다(DESK_PATHS 밖이라 이미 막힘).
- 공용(Phase 1 탭 틀 TASK): `src/components/staff/StaffNav.tsx`, `useStaffBase.ts`(직원·설정·기본 근무·병원 정보 `useClinicProfile` 읽기 + 다시 읽기), `labels.ts`(직종·근무 형태·휴가 종류·방식 글자, 휴가 색 — 예약 달력 색 토큰을 빌림), `TableScroll.tsx`(넓은 표만 옆으로 밀리는 칸).
- 화면 부품은 `src/components/staff/{roster,schedule,leave,pay}/`로 나눠 Phase 2 일꾼이 겹치지 않게 한다. 모양은 `ds` 클래스(`components/ui/classes.ts`)와 `globals.css` 토큰.
- 급여 작은 메뉴 다섯은 `/staff/pay` 한 화면 안 상태(주소 `?part=` 하나로 기억). 금액·실적 칸은 blur에 저장(같은 칸 저장 중이면 끝난 뒤 한 번 더), 병원 부담분만 [저장].
- 명세서: `components/staff/pay/PaySlip.tsx`가 SVG 한 장으로 그린다. [인쇄·PDF]는 서식 탭처럼 `window.print` + `@media print`(명세서만), [그림 파일]은 `lib/staff/slipPng.ts`.
- 인건비 그림: 보는 달과 앞 5달(6달). 위 막대(지급 합계 + 병원 부담분 쌓음), 아래 % 선. 매출은 `createRevenueStore(supabaseBrowser()).loadDays(monthRange)` → `monthRevenue`(통계 목표 칸 `useStatsGoals`와 같은 길).

## 7. 예약 달력 반차 (REQ-7616)
`lib/calendar/shapes.ts` `CalAllDay`에 선택 칸 `part?: 'am' | 'pm' | null`(없으면 종일 — 옛 시험 줄 그대로), `lib/storage/calendar.ts` `toAllDay`·select에 part(없으면 null). `lib/calendar/rules.ts` `warnings(draft, appts, allday, noon = 780)` — part 'am'은 `draft.start < noon`, 'pm'은 `draft.start + draft.len > noon`일 때만 off. `CalendarScreen`이 그 요일 병원 정보 `hours[요일]?.lunchFrom ?? 780`을 넘긴다. 이름표 글은 `AllDayPanel`·`MonthGrid`·`rows/parts.tsx`·`rows/PhoneWeekList.tsx`·`AddPanel` '휴무' 칩에서 '오전 휴무'·'오후 휴무'.

## 8. 배포 순서
① `20261121000000_staff.sql`을 SQL Editor에 붙이기(ssk-supabase-sql) — **먼저**: 예약 달력이 `calendar_allday.part`를 읽으므로 SQL 없이 웹을 올리면 예약 종일 줄 읽기가 실패한다. ② Storage `staff-files`가 Private인지 보기 ③ 웹 배포.

## 9. 위험
- `on delete set null (staff_id)`는 PG15+ 문법 — Supabase·PGlite는 됨. 안 되면 트리거로 대신.
- 트리거가 `clinic_profiles.staff` JSON에서 이름을 찾는다 — 병원 정보 모양이 바뀌면 같이 고친다(시험이 지킨다).
- 직원 개인정보가 서버로 간다(ADR-035). 원장 RLS 하나에 기대므로 RLS 시험이 열 표 모두·데스크·다른 병원을 본다. 화면·오류에 Supabase 내용을 보이지 않는다.
- blur 저장이 많다 — 칸마다 그 줄 하나만 upsert. 엑셀 넣기 중간 실패는 일부만 들어간다(다시 올리면 고침).

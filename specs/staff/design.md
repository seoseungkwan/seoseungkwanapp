# 설계: 직원 탭 — 명단 · 근무표 · 휴가 · 급여 (staff)

> 기능 ID `staff`. 기준 갈래 `feat-staff`(운영 b2ab27e5). 시안 `docs/mockups/staff/` 승인(notes.md). 결정 기록 ADR-035(ADR-034는 재고 명세가 씀).
> 주민번호는 저장하지 않으므로 암호화 방식 결정은 없다. 폰 전용 모양은 만들지 않는다 — 넓은 표·달력은 `overflow-x-auto` 칸 하나만 밀린다.

## 1. DB — `supabase/migrations/20261121000000_staff.sql` (REQ-7601~7603)

머리 글은 다른 migration처럼(무엇·실행: 운영자가 SQL Editor에 붙여 한 번·앞에 필요한 파일 auth → … → calendar → desk_accounts → clinic_profile → clinic_emr → hospital_emr·관문: 웹 배포 전·두 번 실행해도 됨·권한 요약). `my_hospital_id()`(승인된 원장만, 데스크·대기는 null)·`calendar_bump()`는 다시 만들지 않는다.

### 표
모든 표: `id uuid pk default gen_random_uuid()`, `hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade`(설정·달 줄은 hospital_id가 키).

| 표 | 칸 | 하나만 |
|---|---|---|
| `staff_members` | name · job · job_other · employment · weekly_hours numeric(4,1) default 40 · hired_on date not null · left_on · phone · birthday · address · bank · account_no · calendar_staff_id · memo · used_before numeric(3,1) default 0 · used_before_from date · carry_start numeric(4,1) default 0 · registered_on date default 한국 오늘 · created_at · updated_at | (hospital_id, name, hired_on) · (id, hospital_id) · (hospital_id, calendar_staff_id) where not null |
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
- **넘어온 연차 시작 값**(2026-11-21, AC-7601.8): `carry_start numeric(4, 1) not null default 0 check (carry_start between -30 and 100 and carry_start * 2 = trunc(carry_start * 2))`(넘어온 연차 시작 값 — 'carry' 병원 셈의 시작 기간 넘어옴), `registered_on date not null default (now() at time zone 'Asia/Seoul')::date`(웹앱에 처음 넣은 날 — 시작 기간을 정함, 칸 권한 없음이라 DB 기본값만). 이 파일은 아직 운영에 실행하지 않았으므로 새 migration 없이 `create table` 안 `used_before_from` 다음에 둔다. 두 칸이 없는 앞 판을 실행한 DB에도 들어가게 표 만들기 바로 아래 `alter table public.staff_members add column if not exists carry_start …`·`… registered_on …` 두 줄(같은 정의)을 둔다(머리 글의 '칸은 없을 때만 더하고' 약속). 직원 표 위 주석에 두 칸 뜻을 `used_before`처럼 한 줄씩.
- `pay_items` 기본값: `[{"id":"base","name":"기본급","kind":"amount","base":true,"removedFrom":null}, {"id":"overtime","name":"연장수당",…}, {"id":"meal","name":"식대",…}, {"id":"incentive","name":"인센티브","kind":"incentive","base":true,…}, {"id":"bonus","name":"상여",…}]`(배열·30개·4,000바이트만 DB가, 안 모양은 앱 `checkPayItems`). 항목은 `removedFrom`('YYYY-MM') 앞 달에만 보인다.
- 트리거(모두 `set search_path = ''`, 함수 revoke all): touch(updated_at, `clinic_profiles_touch` 모양) — members·settings·pay_lines. `staff_files_limit`(before insert, invoker): 같은 병원 같은 직원 'doc' 또는 같은 달 'tax'가 이미 20개면 raise.

### 권한 (revoke all from public, anon, authenticated 뒤)
> 이 표가 맞다(2026-11-21 검토 뒤 확인). 기본 근무·바뀐 날·더 일한 시간·급여 줄·달 줄의 **열쇠 칸(직원·시작일·날·종류·달)에는 update 권한이 없다** — 앱은 upsert를 쓰지 않고 '고치고, 없으면 넣기'로 저장한다(5절). SQL이 열쇠 칸 update를 주던 것은 빼고, RLS 시험은 이 표 그대로(열쇠 칸 update 없음·열쇠 칸을 바꾸는 update는 거절)를 본다.

| 표 | authenticated |
|---|---|
| staff_members | select · delete · insert/update(name, job, job_other, employment, weekly_hours, hired_on, left_on, phone, birthday, address, bank, account_no, calendar_staff_id, memo, used_before, used_before_from, carry_start) — `registered_on`은 칸 권한 없음 |
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
`clinicEmr.rls.test.ts` 틀(PGlite, CHAIN → clinic_profile → clinic_emr → hospital_emr → 이 파일 → 이 파일 다시). 사람: 원장 A·B, A 데스크, 대기·거절 원장, 병원 없음, anon. 본다: 열 표 칸 권한(`information_schema.column_privileges`로 정확히 위 표 — 열쇠 칸 update 없음)·앱 저장 모양('고치고, 없으면 넣기' — 값 칸 update·열쇠와 함께 insert가 되고, 열쇠 칸 update는 거절)·RLS·제약·남의 병원 직원 id 거절·cascade/set null·지우기 정책(3년)·트리거(넣기·지우기·손 휴무 그대로·병원 정보에 없는 시행자·연결 끊기·바꾸기·rev 오름)·calendar_allday 옛 줄·정책·insert 칸 그대로·파일 줄 종류·20개 한도·바구니 정책·두 번 실행.
넘어온 연차(AC-7601.8): 칸 모양(`carry_start` numeric 4,1·`registered_on` date, 둘 다 not null)·칸 권한(insert/update에 `carry_start`, `registered_on`은 없음)·`carry_start` 기본 0·−30·100·−0.5 됨, −30.5·100.5·1.3·null 거절·`registered_on`이 넣은 때 `(now() at time zone 'Asia/Seoul')::date`·원장이 `registered_on`을 넣거나 고치면 권한 거절·두 칸을 지운(앞 판) 표에 다시 붙이면 두 칸이 같은 정의로 생김.

## 2. 결정 기록 ADR-035 (`docs/ADR.md` 끝)
> ### ADR-035: 직원 자료(연락처·주소·생일·계좌·근무·휴가·급여·서류 파일)를 Supabase에 원장만 보게 둔다. 주민번호는 두지 않는다
> - plan.md 4절 '서버로 가는 것: 직원 이름·직종·금액'을 넓힌다. 표마다 RLS `my_hospital_id()`(승인된 원장) 하나, 데스크 정책 없음. 서류·세무사 파일은 비공개 바구니 `staff-files`.
> - 휴가 → 예약 '휴무'는 앱이 아니라 DB 트리거가 잇는다(휴가와 종일 줄이 어긋나지 않게). `calendar_allday`에 `part`·`leave_id`를 더한다.
> - [급여 확정] 잠금은 두지 않는다(사용자). 달 줄이 그때 인센티브 규칙을 복사해 두고, 규칙을 고치면 보는 달부터만 바꿔 지난 달 금액이 안 바뀐다.
> - 급여 명세서 그림(`components/staff/pay/PaySlip.tsx`의 SVG)은 그림 파일·인쇄로 내보내는 종이라 그림 안에서만 글꼴 `SlipPretendard`(서식 안내문과 같은 `public/poster/fonts/` 파일) 700·900을 쓴다. 급여 화면의 칸·단추·표는 400·500·600 그대로다. (2026-11-21 검토 뒤 더함)

`docs/ARCHITECTURE.md` DB 표 목록에 열 표·바구니 한 줄씩. (plan.md는 총괄 창이 고친다.)
검토 뒤(Phase 4): ADR-035에 위 넷째 줄을 더하고(첫 세 줄·제목은 그대로 — `staff.rls.test.ts`가 본다, ADR-035는 그대로 맨 끝), `docs/UI_GUIDE.md` 굵기 규칙 줄의 예외와 ADR-028 예외 줄 옆에 '급여 명세서 그림'(ADR-035, `components/staff/pay/PaySlip.tsx` SVG 안의 `SlipPretendard` 700·900만)을 적는다.

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
  accountNo: string | null; calendarStaffId: string | null; memo: string | null; usedBefore: number; usedBeforeFrom: string | null
  carryStart: number /* 넘어온 연차 시작 값 −30~100, 0.5 단위 */; registeredOn: string /* 웹앱에 처음 넣은 날 — DB가 정함, 읽기만 */ }
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
`registeredOn`은 DB가 정하는 읽기 칸이라 `saveMember` 입력은 `Omit<StaffMember, 'id' | 'registeredOn'>`이다(2026-11-21 넘어온 연차).
`lib/staff/*` 순수 함수는 이 파일을 **불러오지 않고** 필요한 칸만 든 자기 입력 형을 둔다(같은 Phase 일꾼이 서로 기다리지 않게). 칸 이름이 위와 같아 구조가 맞아 그대로 넘긴다. `lib/staff`는 네트워크·저장소·React를 쓰지 않는다(엑셀 받기 한 함수만 `xlsx` writeFile, 그림 파일은 `slipPng.ts`).

## 4. 순수 함수 (`src/lib/staff/`)
| 파일 | 내보내는 것 | AC |
|---|---|---|
| `leave.ts` | `annualDays(years)` · `ceilHalf(x)` · `leaveStatus({ person, leaves, basis, leftover, today })` → `{ period: {from,to}, basis, firstYear, granted, carried, used, left, next: {day, days, inDays} \| null, endsThisMonth: boolean, previous: {from,to,granted,used,left,settledMonth} \| null }` · `settleInMonth({ person, leaves, basis, leftover, month })` → 그달 끝난 기간 정산 일수 \| null · `remainingAt(…, day)` · `retireGap(…)` | REQ-7604 |
| `schedule.ts` | `checkWeek(week)` · `nthSaturday(day)` · `planOn(plans, day)` · `shiftOn({ member, plans, changes, day })` · `isChangedDay(…)` · `dayKind(day, { hours, closedDates })` → `{ holiday: boolean, closed: boolean, noHolidayList: boolean }` · `holidayPrefill(shift)` · `monthOvertime(overtime, month)` · `expandLeave({ from, to }, ctx)` · `workingCount(day, ctx)` · `fmtMinutes(m)`('2시간 30분') · `weekSummary(plan)`('월~금 09:00~18:00 (점심 13:00~14:00)' 줄들) | REQ-7605 |
| `pay.ts` | `visibleItems(items, month)` · `checkPayItems(items)` · `incentiveAmount(entry)` · `lineTotal(line, items, month)` → `{ total, incentive, problem }` · `newLine({ month, staffId, rules })` · `copyPrev(line, prev, items, month)` · `applyRules(entries, rules)` · `laborCost(lines, items, month, employerCost)` · `revenueRatio(cost, revenue)`(소수 첫째 반올림, 0·null → null) · `monthRevenue(days)`(`revenueDayValues` 합) | REQ-7606 |
| `roster.ts` | `upcoming(members, today)` → `{ day, staffId, kind: 'birthday' \| 'anniversary', years? }[]` · `tenure(hiredOn, today)` · `keepUntil(leftOn)` · `canPurge(member, today)` · `splitActive(members, today)` · `employedIn(member, month)` | REQ-7607 |
| `rosterExcel.ts` | `ROSTER_HEADERS`(22칸 — 맨 끝 '넘어온 연차(일)', 옛 양식 21칸 = 앞 21칸도 읽음) · `readRoster(buffer, existing, ctx)` → `{ problem: string \| null, rows: { line, action: 'new' \| 'update' \| 'problem', reason: string \| null, changed: string[], member: Partial<…>, plan: { week, sat } \| null }[] }` | REQ-7608 |
| `taxExcel.ts` | `taxSheet(input)` → `{ fileName, sheetName, rows: (string \| number \| null)[][] }`(순수) · `downloadTaxExcel(sheet)` | REQ-7609 |
| `slipPng.ts` | `downloadSlipPng(svg, fileName): Promise<boolean>` — `lib/forms/png.ts`의 `svgForImage`(글꼴 data: 주소)로 캔버스 → PNG(서식 탭과 같은 길, `png.ts`는 고치지 않음) | AC-7615.10 |
| `nationalId.ts` (검토 뒤) | `hasNationalId(text): boolean` — 주민번호 모양(붙임표·점·빈칸 나눔 6+7, 붙여 쓴 13자리). 전각 숫자·긴 줄표는 맞춘 글로 검사만 하고 받은 글은 바꾸지 않는다(`lib/worklog/notes.ts` `privacyProblem`과 같은 맞춤 방식, 전화·메일은 보지 않음). 저장 층 `checkMember`·`rosterExcel.ts`·명단 칸이 이 한 함수를 쓴다 | AC-7610.6 |

- 날짜는 모두 `lib/analytics/dates.ts`(`addDays`·`addMonthsToDay`·`weekdayOf`·`monthRange`·`parseDateCell`), '2026.03.02'는 `rosterExcel.ts`가 '-'로 바꿔 `parseDateCell`에 넘긴다. 공휴일은 `lib/analytics/holidays.ts` `HOLIDAYS`(목록 첫 해~끝 해 밖이면 `noHolidayList`).
- 연차 기간(입사일 기준): 0번 = [입사일, 입사일+1년) 달마다 1일, k번(k≥1) = [입사일+k년, +k+1년) `annualDays(k)`. 1월 1일 기준: 0번은 같고, 입사 다음 해 1월 1일 비례, 그 뒤 해마다. 오늘이 든 기간을 보인다.
- **넘김 시작 기간**(2026-11-21, AC-7604.9): `leave.ts`의 `LeavePerson`에 **선택 칸** `carryStart?: number`·`registeredOn?: string | null`을 더한다(`StaffMember`를 그대로 넘기면 들어간다. 선택 칸이라 다른 곳·옛 시험은 그대로 — 없으면 시작 기간 = 첫 기간·시작 값 0 = 지금 셈). 장부(`ledger`)는 기간마다 `period.to < registeredOn`이면 '시작 기간 앞'으로 보고 넘어옴 0·다음으로 넘기지 않음, 그렇지 않은 첫 기간의 넘어옴 = `carryStart`('carry'일 때만), 그 뒤는 지금처럼 앞 기간 남은 일수. **'pay'·'carry' 모두**(같은 날 총괄 결정) `leaveStatus`의 `previous`는 앞 기간이 시작 기간 앞이면 null이고, `settleInMonth`는 시작 기간 앞 줄(`row.to < registeredOn`, 기간 끝·퇴사 모두)을 건너뛴다(남은 것이 없으면 null). `remainingAt`은 같은 장부를 쓰므로 따라 바뀐다. 급여 `payPeople.ts`(세무사 엑셀 '정산할 연차'·메모)·휴가 `leaveView.ts`·`LeaveRecord.tsx`(지난 기간 줄)·`EndNotice`·명단 `rosterText.ts`는 고치지 않는다 — 직원을 그대로 넘기고 `previous`·정산 값이 null이면 이미 줄·안내를 그리지 않는다.
- 인센티브 % 셈은 정수로: `Math.floor(sales * Math.round(percent * 100) / 10000)`.
- 엑셀 넣은 기본 근무 점심 = 병원 정보 그 요일 `lunchFrom~lunchTo`(근무 안일 때).
- **엑셀 '넘어온 연차(일)'**(2026-11-21, AC-7608.1·7608.7): 머리 줄이 22칸 `ROSTER_HEADERS`면 새 양식, 앞 21칸만 같고 21칸이면 옛 양식이다. 옛 양식은 22번째 칸을 읽지 않고 그 칸을 빈 칸으로 본다(`raw`의 그 칸은 ''). `RosterMember`·`RosterExisting`에 `carryStart: number`, 고침 비교 칸 차례는 지금 끝(… 계좌번호 · 기본 근무 · 메모) 뒤에 '넘어온 연차'. 양식은 `scripts/make_staff_template.py` `COLUMNS` 맨 끝(메모 뒤)에 `넘어온 연차(일)`(kind number, 보기 줄 빈칸), 숫자 확인(custom: 숫자·−30~100·0.5 단위, 경고만 — '올해 이미 쓴 연차(일)' 모양), 칸 도움말·'안내' 시트 한 줄(requirements '화면 글 기본값')을 더하고, 같은 스크립트로 `public/staff/staff-template.xlsx`를 다시 만든다(스크립트 확인이 새 칸·확인·안내 글을 본다). 사용자 바탕화면의 옛 양식 파일은 건드리지 않는다.

## 5. 저장 층 — `src/lib/storage/staff.ts`·`staffFiles.ts`, 오류 `src/lib/errors.ts`
`createStaffStore(client: SupabaseClient)` → `listMembers()` · `saveMember(m, id?)`(주소·메모에 주민번호 모양이면 안 보냄, AC-7610.6) · `purgeMember(member)`(서류 파일 먼저 — 바구니가 지운 개수가 서류 수보다 적으면 실패) · `importRoster(rows)`(같은 검사) · `listPlans()` · `savePlan(staffId, from, week, sat)`(열쇠 줄 저장) · `listChanges(range)` · `saveChange(c)`(열쇠 줄 저장) · `resetDay(staffId, day)`(바뀐 날·더 일한 시간 지움) · `listOvertime(range)` · `saveOvertime(o)`(0이면 지움, 아니면 열쇠 줄 저장) · `listLeaves(range)` · `addLeaveGroup(rows)` · `replaceLeaveGroup(groupId, rows)` · `deleteLeaveGroup(groupId)` · `countAppts(calendarStaffId, days)`(`calendar_appts`에서 `day`만 select, status 취소 빼고) · `loadSettings()`(줄 없으면 기본값) · `saveSettings(s)`(upsert onConflict hospital_id) · `listRules()` · `saveRules(staffId, rules, fromMonth)`(규칙 저장 + fromMonth 이후 줄 `applyRules`) · `listPayLines(fromMonth, toMonth)` · `savePayLine(line)`(열쇠 줄 저장 — 열쇠 달·직원, 줄 id를 알면 그 id로 고침) · `listPayMonths(fromMonth, toMonth)` · `savePayMonth(m)`(열쇠 줄 저장 — 열쇠 달). `staffFiles.ts`: `listFiles(kind)` · `uploadFile({ kind, staffId \| month, file })` · `deleteFile(f)`(바구니가 0개를 지우면 실패, 줄은 그대로) · `downloadFile(f)`. `clinicProfile.ts`의 `Pick<SupabaseClient, …>`·1,000줄씩 읽기 방식을 따른다. 엑셀 넣기 = 새 줄 한 번 insert(+ 기본 근무 줄) → 고침 줄은 10개씩 update(적힌 칸만).

**열쇠 줄 저장**(지금 방식, 2026-11-21 검토 뒤 명세를 코드에 맞춤): 기본 근무(직원·시작일)·바뀐 날(직원·날)·더 일한 시간(직원·날·종류)·급여 줄(달·직원)·달 줄(달)은 **upsert를 쓰지 않는다**. 그 열쇠로 먼저 값 칸만 고치고(`update(값).eq(열쇠…).select()`), 고친 줄이 없으면 열쇠와 함께 넣고(`insert`), 넣다가 겹치면(23505 — 다른 창이 그새 넣음) 한 번 더 고친다. upsert는 겹칠 때 보낸 열쇠 칸까지 고치려 해 열쇠 칸 update 권한이 있어야 하는데, 1절 권한 표대로 그 권한은 없다. 설정(`saveSettings`)만 upsert onConflict hospital_id다 — hospital_id를 보내지 않아(기본값 `my_hospital_id()`) 겹칠 때 고치는 칸이 값 세 칸뿐이다.

**넘어온 연차 칸**(2026-11-21, AC-7610.7): 보내는 칸(`MEMBER_FIELDS`)에 `carryStart` → `carry_start`를 더하고, `registeredOn` → `registered_on`은 **읽는 칸(select)에만** 둔다(보내는 칸·`memberBody`에 없음 — 칸 권한이 없다). `checkMember`는 `carryStart`를 −30~100·0.5 단위로 보고, 읽은 줄은 `registered_on`이 날짜가 아니면 버린다. 엑셀 넣기 새 줄 기본값 `carryStart: 0`, 고침 줄은 `{ ...지금 값, ...적힌 칸 }`이라 적힌 `carryStart`만 바뀐다('올해 이미 쓴 연차'는 지금처럼 지금 값).

**바구니 지우기 개수**: Storage `remove(paths)`는 권한에 막히거나 없는 파일이면 오류 없이 지운 것만(0개일 수 있음) 돌려준다. `deleteFile`·`purgeMember`는 돌려받은 개수가 보낸 개수보다 적으면 `E-STAFF-FILE-FAILED`를 던지고 줄을 지우지 않는다(AC-7610.3·7610.4).

오류 번호 다섯(AC-7610.1) `E-STAFF-READ-FAILED`·`E-STAFF-SAVE-FAILED`·`E-STAFF-FILE-FAILED`·`E-STAFF-EXCEL-FAILED`·`E-STAFF-IMAGE-FAILED` — 문구는 `E-CLINIC-*` 말투. 세무사 엑셀 [엑셀 받기] 실패는 새 번호를 만들지 않고 `E-STAFF-EXCEL-FAILED`를 쓰며, 그 문구를 '엑셀 파일을 읽거나 만들지 못했어요'로 넓힌다(AC-7610.1 글 그대로 — `E-STAFF-FILE-FAILED` 문구는 올리기 이야기라 맞지 않음).

## 6. 화면
- 주소 `/staff`(명단) · `/staff/schedule` · `/staff/leave` · `/staff/pay`. `src/app/(app)/staff/layout.tsx`(server): `currentMe()` — 데스크면 `null`(막힌 화면은 DeskGate), 아니면 제목 '직원' + `<StaffNav />` + children. 각 page.tsx는 `metadata: { title: '직원' }`·`dynamic = 'force-dynamic'`, 오늘은 `todayInKorea()`로 넘긴다.
- `menu.ts`: 직원 `href: '/staff'`·`ready: true`, `MenuHref`에 '/staff'. `notReadyFeatures.ts`에서 '/staff' 항목·형 빼기. `dashboard/briefing/features.ts` 직원 status 'ready'. DeskGate는 고치지 않는다(DESK_PATHS 밖이라 이미 막힘).
- 공용(Phase 1 탭 틀 TASK): `src/components/staff/StaffNav.tsx`, `useStaffBase.ts`(직원·설정·기본 근무·병원 정보 `useClinicProfile` 읽기 + 다시 읽기), `labels.ts`(직종·근무 형태·휴가 종류·방식 글자, 휴가 색 — 예약 달력 색 토큰을 빌림), `TableScroll.tsx`(넓은 표만 옆으로 밀리는 칸).
- 화면 부품은 `src/components/staff/{roster,schedule,leave,pay}/`로 나눠 Phase 2 일꾼이 겹치지 않게 한다. 모양은 `ds` 클래스(`components/ui/classes.ts`)와 `globals.css` 토큰.
- **폰 모양 없음**(AC-7611.4, 검토 뒤): 직원 부품은 폭 경계 접두가 붙은 칸 나눔·쌓임 클래스를 쓰지 않는다. `ds.segment.group`은 폰에서 칸 나눔(`max-md:grid max-md:w-full`)이라 쓰지 않고, 폴더마다 근무표 `schedule/parts.tsx`의 `SEG_GROUP`(그 클래스에서 폰 칸 나눔만 뺀 것) 같은 PC 틀을 쓴다(명단·휴가는 `schedule/parts.tsx`를 불러 써도 된다, 급여는 `pay/parts.tsx`에 둔다). `components/ui/classes.ts`는 고치지 않는다. 폭이 모자랄 수 있는 표·달력(근무표 달 보기 포함)은 `TableScroll` 안에 최소 폭(휴가 달력 `min-w-190`처럼)을 준다. 시험은 폴더마다 `pcOnly.test.tsx`: ① 폴더 안 소스(시험 밖)에 폭 경계 접두와 `ds.segment.group`이 없다 ② 화면을 그려 모든 요소의 class에 폭 경계 접두 + 모양 클래스(`grid`·`grid-cols-*`·`flex`·`flex-col`·`flex-row`·`block`·`hidden`·`w-full`·`col-span-*`)가 없다(ds 손가락 크기 클래스는 통과).
- **넘어온 연차 칸**(2026-11-21, AC-7612.8): `roster/MemberForm.tsx`는 `settings.leftover === 'carry'`일 때만 '예약 · 연차 · 메모' 구역 메모 앞에 '넘어온 연차' 칸(`Field`, 입력 `max-w-32` + '일' — '올해 이미 쓴 연차'와 같은 모양)을 보이고, 'pay'면 칸 없이 더하기 0·고치기 지금 값을 보낸다. `roster/ExcelPreview.tsx`는 `leftover`를 받아(`RosterScreen.tsx`가 `settings.leftover`를 넘김) 'carry'일 때만 '올해 쓴 연차' 다음에 '넘어온 연차' 칸을 그린다. 명단 카드·휴가·급여 폴더는 고치지 않는다(셈이 바뀐 숫자를 그대로 보임). 폰 모양 없음(AC-7611.4) 그대로.
- 급여 작은 메뉴 다섯은 `/staff/pay` 한 화면 안 상태(주소 `?part=` 하나로 기억). 금액·실적 칸은 blur에 저장(같은 칸 저장 중이면 끝난 뒤 한 번 더), 병원 부담분만 [저장].
- 명세서: `components/staff/pay/PaySlip.tsx`가 SVG 한 장으로 그린다. [인쇄·PDF]는 서식 탭처럼 `window.print` + `@media print`(명세서만), [그림 파일]은 `lib/staff/slipPng.ts`. 화면 미리 보기도 같은 A4 SVG 그대로(내용 높이로 줄이지 않음, AC-7615.10).
- 인건비 그림: 보는 달과 앞 5달(6달). 위 막대(지급 합계 + 병원 부담분 쌓음), 아래 % 선. 매출은 `createRevenueStore(supabaseBrowser()).loadDays(monthRange)` → `monthRevenue`(통계 목표 칸 `useStatsGoals`와 같은 길). 저장된 급여 줄이 없는 달은 막대·점을 그리지 않고(선은 끊김) '{M}월 급여 자료 없음'(AC-7615.9).
- 보는 달의 줄(AC-7615.11, 검토 뒤): `PayView`가 그달 재직자마다 '저장된 줄 ?? `newLine`'을 한 번 만들어 이달 급여·인센티브·세무사 엑셀(`payPeople.ts`)·인건비(`LaborCost`)·명세서에 같은 배열로 넘긴다. 인건비 '{n}명' = 그달 재직자 수. 저장 실패는 줄마다 기억해 다른 줄 저장이 성공해도 실패 안내가 남고(`usePayData`), 항목·규칙 저장 중에는 그 창 단추를 막는다.

## 7. 예약 달력 반차 (REQ-7616)
`lib/calendar/shapes.ts` `CalAllDay`에 선택 칸 `part?: 'am' | 'pm' | null`(없으면 종일 — 옛 시험 줄 그대로), `lib/storage/calendar.ts` `toAllDay`·select에 part(없으면 null). `lib/calendar/rules.ts` `warnings(draft, appts, allday, noon = 780)` — part 'am'은 `draft.start < noon`, 'pm'은 `draft.start + draft.len > noon`일 때만 off. `CalendarScreen`이 그 요일 병원 정보 `hours[요일]?.lunchFrom ?? 780`을 넘긴다. 이름표 글은 `AllDayPanel`·`MonthGrid`·`rows/parts.tsx`·`rows/PhoneWeekList.tsx`·`AddPanel` '휴무' 칩에서 '오전 휴무'·'오후 휴무'.

## 8. 배포 순서
① `20261121000000_staff.sql`을 SQL Editor에 붙이기(ssk-supabase-sql) — **먼저**: 예약 달력이 `calendar_allday.part`를 읽으므로 SQL 없이 웹을 올리면 예약 종일 줄 읽기가 실패한다. ② Storage `staff-files`가 Private인지 보기 ③ 웹 배포.

## 9. 위험
- `on delete set null (staff_id)`는 PG15+ 문법 — Supabase·PGlite는 됨. 안 되면 트리거로 대신.
- 트리거가 `clinic_profiles.staff` JSON에서 이름을 찾는다 — 병원 정보 모양이 바뀌면 같이 고친다(시험이 지킨다).
- 직원 개인정보가 서버로 간다(ADR-035). 원장 RLS 하나에 기대므로 RLS 시험이 열 표 모두·데스크·다른 병원을 본다. 화면·오류에 Supabase 내용을 보이지 않는다.
- blur 저장이 많다 — 칸마다 그 줄 하나만 '고치고, 없으면 넣기'(5절 열쇠 줄 저장). 엑셀 넣기 중간 실패는 일부만 들어간다(다시 올리면 고침).
- 웹앱 등록일(`registered_on`)은 DB가 넣은 날로 정하고 화면에서 고칠 수 없다. 시작 기간이 생각과 다르면 원장은 '넘어온 연차' 시작 값으로 맞춘다. 웹앱을 쓰기 전 기간은 기록이 없어 '쓴 0'으로 보일 수밖에 없으므로 'pay'·'carry' 모두 지난 기간 줄·끝 안내·정산에서 뺀다(AC-7604.9 — 'pay'는 같은 날 총괄 결정). 그래서 웹앱을 쓰기 전 달의 세무사 엑셀을 만들어도 정산 일수가 나오지 않는다.
- 지우고 다시 넣는 저장(휴가 묶음 고치기·그날만 바꾸기 되돌리기)은 중간에 실패하면 일부만 남을 수 있다 — 실패하면 그 기간을 다시 읽어 화면을 DB와 맞춘다(AC-7613.4·7614.3).

# 설계: 병원 정보 한 곳 + 다른 병원 청구메모

> 기능 ID `clinic-profile`. 바탕: 2026-11-18 조사 일꾼 5명(예약·서식/문자·통계/AI·청구메모·설정/SQL) 보고. 고칠 곳 줄 번호는 운영 c94e9f72 기준.
> 결정 기록: ADR-033(병원 정보를 한 곳에 두고, 페이지 guard가 내 병원 정보 이름을 읽는다). 시안 없음(사용자 결정) — 화면은 지금 설정 칸 모양(`CashFloatSetting`·`DeskAccounts`)과 `ds` 클래스를 따른다.

## 1. DB — `supabase/migrations/20261119000000_clinic_profile.sql` (REQ-6601)

머리 글은 다른 migration처럼: 무엇을 만드나, "실행: 운영자가 Supabase 관리 화면 → SQL Editor에 붙여 한 번 실행한다", 앞에 필요한 파일(auth·precheck_settings·…·calendar·desk_accounts), 관문(웹 배포 전), 두 번 실행해도 됨, 권한 요약.

```sql
create table if not exists public.clinic_profiles (
  hospital_id uuid primary key default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  display_name text check (display_name is null or (display_name = btrim(display_name) and char_length(display_name) between 1 and 50)),
  phone text check (phone is null or phone ~ '^[0-9]{9,11}$'),
  address text check (address is null or char_length(address) <= 100),
  honorific text not null default '원장님' check (honorific in ('원장님','대표원장님','선생님')),
  hours jsonb not null check (jsonb_typeof(hours) = 'array' and jsonb_array_length(hours) = 7 and octet_length(hours::text) <= 2000),
  closed_dates jsonb not null default '[]' check (jsonb_typeof(closed_dates) = 'array' and octet_length(closed_dates::text) <= 8000),
  staff jsonb not null default '[]' check (jsonb_typeof(staff) = 'array' and octet_length(staff::text) <= 12000),
  logo_path text check (logo_path is null or char_length(logo_path) <= 120),
  updated_at timestamptz not null default now()
);
```
- `hours` 기본값은 없다(앱이 늘 7칸을 보낸다. 옮기기 insert는 아래에서 만든다).
- RLS 켜기 → `revoke all … from public, anon, authenticated` → `grant select` + `grant insert(display_name, phone, address, honorific, hours, closed_dates, staff, logo_path), update(같은 칸) to authenticated`. delete 없음.
- 정책: "내 병원 정보 읽기/넣기/고치기" = `hospital_id = (select public.my_hospital_id())`, "데스크 병원 정보 읽기" select = `hospital_id = (select public.my_desk_hospital_id())`.
- 트리거 둘: 자기 touch 함수(`clinic_profiles_touch`, security invoker, `set search_path = ''`, revoke all — `touch_updated_at`은 부르지 않는다)로 updated_at, 그리고 `after insert or update … for each statement execute function public.calendar_bump()`(예약 화면이 5초마다 rev를 보고 다시 읽는다, AC-6601.5). `my_hospital_id()`·`calendar_bump()`는 다시 만들지 않는다.
- 옮기기(AC-6601.4): `insert into clinic_profiles (hospital_id, staff, hours) select s.hospital_id, (시행자 배열 각 원소에 {"role":"staff","calendar":true}를 더함, ordinality 차례), (월~토 {open: open_hour*60, close: close_hour*60, lunchFrom: null, lunchTo: null}, 일요일은 sunday면 같은 값 아니면 null — 차례는 월(0)~일(6)) from calendar_settings s on conflict (hospital_id) do nothing;` 예약 줄은 손대지 않는다(예약은 staff_id 글자로 사람을 가리키므로 id만 같으면 된다).
- `my_desk()`: `create or replace`로 같은 모양(hospital_id, hospital_name) 그대로, 이름만 `coalesce(p.display_name, h.name)`(left join clinic_profiles). security definer·search_path·권한 줄은 desk_accounts와 같은 글자.
- 저장소: `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('clinic-logos','clinic-logos', false, 1000000, array['image/png']) on conflict (id) do update …`. 정책(form-backgrounds와 같은 모양): 읽기·지우기 = `(storage.foldername(name))[1] = (select public.my_hospital_id())::text`, 넣기 = 같은 조건 + `exists (select 1 from public.clinic_profiles p where p.hospital_id = (select public.my_hospital_id()) and p.logo_path = name)`. update 정책 없음.
- 시험 `supabase/clinicProfile.rls.test.ts`: `desk.rls.test.ts`처럼 진짜 migration을 차례로(… calendar → desk_accounts → 이 파일) PGlite에서 돌린다. 원장 A·B, A 데스크, 대기·거절·병원 없음, 칸 권한·정책·제약·옮기기(예약 줄 그대로)·rev·바구니 정책·두 번 실행·`my_desk()` 이름·`my_hospital_id()` 글자 그대로.

## 2. 앱 자료 모양 — `src/types/clinicProfile.ts`, `src/lib/storage/clinicProfile.ts`

```ts
export const HONORIFICS = ['원장님', '대표원장님', '선생님'] as const
export type DayHours = { open: number; close: number; lunchFrom: number | null; lunchTo: number | null } | null // 분, 10분 단위, null = 휴진
export type ClinicStaff = { id: string; name: string; role: 'doctor' | 'staff'; mark: string; color: CalColor; calendar: boolean }
export type ClinicProfile = { displayName: string | null; phone: string | null; address: string | null; honorific: Honorific;
  hours: DayHours[] /* 7칸, 월~일 */; closedDates: string[] /* YYYY-MM-DD 오름차순 */; staff: ClinicStaff[]; logoPath: string | null }
export const DEFAULT_HOURS: DayHours[] // 월~금 540~1080 점심 780~840, 토 540~780, 일 null
```
- `checkProfile(p): string[]`(까닭 목록, 비면 통과): 이름 1~50, 전화 숫자 9~11, 주소 100, 호칭 셋, 요일마다 0 ≤ open < close ≤ 1440·10분 단위·점심은 둘 다 있거나 둘 다 null이고 open ≤ lunchFrom < lunchTo ≤ close, 휴진일 날짜 모양·겹침 없음·200개, 직원 30명·id 1~40 겹침 없음·이름 1~10·표시 1자 겹침 없음·색 20색 안.
- `loadClinicProfile(client)`: `.maybeSingle()`. 줄 없음 → `null`(부르는 쪽이 기본값·가입 이름을 쓴다). 칸마다 검사해 틀린 칸만 기본값으로(예약 `loadCalendarSettings`와 같은 방식). 실패는 `'failed'`.
- `saveClinicProfile(client, p)`: `checkProfile` 통과 뒤 `upsert(…, { onConflict: 'hospital_id' })`, hospital_id는 보내지 않는다. 저장 때 1년 넘게 지난 휴진일을 뺀다(AC-6602.4).
- 로고: `uploadLogo(client, png: Blob)` = 새 이름 `{hospital_id}/{uuid}.png`로 먼저 줄의 logo_path를 고치고 → 올리기 → 실패면 logo_path를 옛 값으로 되돌림 → 성공이면 옛 파일 지우기(실패는 무시). `downloadLogo(client, path)` = Blob → 바이트 → PNG 머리 글자 확인 → `data:image/png;base64,…`(CSP `img-src data:`가 이미 됨, 밖 주소를 쓰지 않는다). hospital_id는 `select hospital_id`로 읽은 자기 줄 값.
- `normalizeLogo(file): Promise<Blob | 'too-big' | 'unreadable'>`(브라우저): `createImageBitmap` → 긴 변 1,200px 안으로 → canvas PNG. 1,000,000바이트 넘으면 'too-big'.
- 공용 훅 `src/components/clinic/useClinicProfile.ts`: 한 번 읽어 `{ state: 'loading'|'ready'|'failed', profile: ClinicProfile(기본값 채움), saved: boolean, signupName, logoDataUrl }`. 서식·문자·통계·대시보드·예약이 쓴다. 이름은 `profile.displayName ?? signupName`.
- 표시 도우미(순수, `src/lib/clinic/format.ts`): `phoneText(digits)`(02-123-4567·02-1234-5678·031-123-4567·010-1234-5678), `hoursText(hours)`(같은 시간인 월~금은 '평일'로 묶고, 점심은 괄호, 휴진 요일은 '일·공휴일 휴진'처럼 끝에), `calendarRange(hours)`(문 여는 요일의 가장 이른 시작 내림~가장 늦은 끝 올림, 정시 단위; 문 여는 날 없으면 8~20).

## 3. 설정 '병원 정보' 칸 — `src/components/settings/ClinicProfileCard.tsx` (REQ-6602)
- `SettingsPage.tsx`: 맨 위(설치 파일 칸 앞)에 `{!desk && <ClinicProfileCard />}`, 작은 메뉴 글 '청구' → '설정'.
- 모양: `CashFloatSetting`과 같은 Load 상태·`ds.panel`·`ds.panelTitle` '병원 정보'. 칸 차례 AC-6602.1. 진료시간은 요일 일곱 줄(요일 이름 · '휴진' 체크 · 시작 · 끝 · '점심' 시작 · 끝, `select` 10분 단위 06:00~23:50), 좁은 화면은 한 요일이 두 줄. 휴진일은 날짜 칸 + [더하기] + 칩 목록(칩마다 ×). 직원은 줄마다 이름 · '원장님/직원' segment · 표시 · 색 고르기(예약 설정의 색 판 부품 그대로) · '예약에 보이기' 체크 · ▲▼ · [빼기], 아래 [+ 사람 더하기].
- [저장] 하나가 표와 로고를 함께 한다(로고가 바뀌었으면 로고 먼저). 결과 '저장했어요' / 오류 칸 + [다시 저장]. 저장한 뒤 `router.refresh()`로 헤더 이름을 다시 읽는다.
- 오류 번호 셋 `E-CLINIC-READ-FAILED`·`E-CLINIC-SAVE-FAILED`·`E-CLINIC-LOGO-FAILED`(types/errors.ts·lib/errors.ts, '무엇이·어떻게').

## 4. 헤더 이름 — guard (AC-6602.8, AC-6606.5, ADR-033)
- `src/lib/auth/hospital.server.ts` `readMe`: 승인된 원장이면 `clinic_profiles`에서 `display_name` 한 칸만 읽어(`maybeSingle`) `hospital.name`을 그것으로 바꿔 돌려준다(없거나 실패면 가입 이름). 쓰지 않는다. 데스크는 `my_desk()`가 이미 바꾼 이름을 준다.
- ADR-033 글: "페이지 guard가 읽는 줄에 '내 병원 정보 이름'을 더한다(읽기만). CLAUDE.md 서버 코드 예외 줄에 '병원 정보 이름'을 더한다."

## 5. 예약 (REQ-6603)
- `CalSettings`는 모양 그대로(`staff`·`openHour`·`closeHour`·`sunday`)에 `days: DayHours[]`·`closedDates: string[]`를 더한다. `useCalendarData`가 예약 설정과 병원 정보를 함께 읽어 합친다(`mergeClinic(calSettings, profile | null)` 순수 함수, `src/lib/calendar/clinic.ts`): 병원 정보가 있으면 staff = `profile.staff.filter(s => s.calendar)`를 `CalStaff`로, openHour·closeHour = `calendarRange`, sunday = 일요일이 문 여는 날, days·closedDates = 병원 정보. 없으면 예약 설정 값 그대로 + days = 모든 요일 openHour~closeHour·점심 없음(일요일은 sunday일 때만), closedDates = [].
- rev가 오르면 지금처럼 설정을 다시 읽는다(병원 정보도 함께).
- `TimeGrid`: 요일마다 `days[weekday]`로 진료시간 밖·점심을 회색 띠(`bg-canvas`, 점심 띠 안에 '점심' text-caption), 휴진일 열 머리 '휴진' + 열 회색. 휴진 요일은 `shownDays`에서 빠진다(`CalendarScreen` `shownDays`·`stepDay`가 days를 본다). `MonthGrid`·`PhoneWeekList`는 휴진일 칸에 '휴진'.
- `CalendarSettings`: 시행자·보이는 시간 구역을 빼고 AC-6603.4 글 + 원장일 때 `/settings` 링크. `saveCalendarSettings`는 kinds만 보낸다(staff·open_hour·close_hour·sunday 칸은 DB에 남겨 두고 쓰지 않는다 — 되돌리기 쉽게).
- 통계 예약 칸(`useStatsCalendar`)도 `mergeClinic`을 거친 설정을 쓴다.

## 6. 서식 (REQ-6604)
- 로고 자리 값: `type PosterLogo = { kind: 'image'; href: string /* data:image/png */ } | { kind: 'text'; text: string }`. `FormsScreen`이 `useClinicProfile`로 만들어 `Poster`·`GuideWorkspace → GuidePoster`에 넘긴다. 읽는 중에는 `null` → 인쇄·그림 파일 단추 막힘(AC-6604.2).
- `Poster.tsx`·`GuidePoster.tsx`: image면 `<image href … preserveAspectRatio="xMidYMid meet">`(LOGO·GUIDE_LOGO 상자 그대로), text면 같은 상자 가운데 굵은(900) 글자, 크기는 `fitSize`로 상자 폭에 맞춤(최대 상자 높이의 80%), 색은 휴진 안내는 지금 진한 글자색, 환자 안내문은 띠 색.
- `layout.ts`·`guideLayout.ts`: `href` 칸을 뺀 상자 자리만 둔다. `public/poster/logo.png`는 지우지 않는다(`assets.test.ts`가 지문을 보므로 그대로 두되 화면은 쓰지 않는다).
- `png.ts`: 로고가 이미 `data:`면 그대로 둔다(내 배경과 같은 방식), `assets.logo`와 `/poster/logo.png` 읽기를 뺀다. 그림 파일에 `/poster/` 주소가 남으면 실패(지금 검사 그대로).
- 색: `src/components/forms/guideColors.ts`에 `type GuidePalette = { yellow; dark; white; note; shadow }`, `guidePalette(colors: GuideColors | null, logo: GuideColors | null): GuidePalette`(직접 > 로고 > 지금 색). `logoPalette(rgba, w, h): GuideColors | null`은 `src/lib/forms/logoColors.ts`(순수, accent.ts의 색상 칸 나누기 방식: 알파 < 128·채도 < 0.25·밝기 < 0.12 또는 > 0.88인 점 빼고 15° 칸 24개 중 가장 많은 칸의 평균색 → main, 같은 색상·채도 0.35·밝기 0.16 → dark, 대비 맞추기는 `contrastRatio`). 로고 PNG는 `FormsScreen`이 한 번 캔버스(최대 64px)로 읽어 점을 뽑는다.
- `GuideContent`에 `colors: { main: string; dark: string } | null`을 더한다(값은 `#rrggbb`). `checkGuideValue`는 `colors` 열쇠가 없는 옛 값도 받아 null로 채운다. 저장 크기 제약(16,000바이트)은 그대로 충분하다.
- `GuidePoster`·`guidePictures`(그림 16개·AI 그림)는 `GUIDE_COLORS` 대신 받은 `palette`를 쓴다. `DRAW_COLOR_VALUES`도 palette로 만든다.
- `GuideEditor`: '진회색 띠' 아래 fieldset '색' — segment [자동][직접 고르기], 직접이면 '바탕색'·'띠 색' `<input type="color">` 둘, 대비 < 4.5면 경고 글(AC-6604.5). 자동이면 '병원 로고 색이에요'(로고 색 있음) 또는 '기본 색이에요'.

## 7. 문자 (REQ-6605)
- `src/lib/patientMessages/fill.ts`: `fillClinic(body, info: { name; phone; hoursText } )`를 더한다 — 넷 글자를 차례로(`[병원명 설정 필요]` → `병원 진료시간 설정 필요` → `병원명 설정 필요` → `전화번호 설정 필요`) 값이 있을 때만 바꾼다. `DEFAULT_TEMPLATES`와 골든 파일은 그대로.
- 미리보기·복사 네 곳(`MessagesTool`·`FollowupTool`·`RecallTool`·`ReservationTool`)은 `fillTemplate` 뒤에 `fillClinic`을 부른다. 병원 정보는 `PatientsScreen`(또는 `PatientsEntry`)이 `useClinicProfile`로 한 번 읽어 넘긴다. 환자 줄 그리는 `components/patients/rows`는 고치지 않는다.

## 8. 통계·대시보드·AI (REQ-6606)
- `src/lib/analytics/visitHours.ts`: 순수 `foldHours(view, { from, to })` — from 앞 칸은 from 칸에, to 뒤 칸은 to 칸에 더한다(8 ≤ from ≤ to ≤ 20으로 자름). `VisitHoursSection`이 `calendarRange(profile.hours)`를 받아 접고, 아래 글 AC-6606.1, 휴진 요일 줄은 뺀다. Worker·저장 모양(13칸)·`validate.ts`·AI 입력은 그대로.
- `holidayEffect({ today, days, closedDates? })`: 안에서 `HOLIDAYS ∪ closedDates` 집합을 만든다. `HolidaySection`이 넘긴다.
- 호칭: 보고 받는 사람 글만 — `ReportSection.tsx:51`, `StatsSections.tsx:80`, `revenueView.ts:134,195`, `DailySection.tsx:75`, `BitDashboard.tsx:86`, `AiBrief.tsx:142`, `ReportBody.tsx:211`. '원장님별'(`DoctorsSection`·`doctorStats.ts`·`PatientMixSection`)과 `lib/ai/input.ts`·`output.ts` 이름표는 그대로.
- AI: `app/api/ai/store.ts`에 `loadHonorific(sb)`(RLS 세션으로 `clinic_profiles.honorific` 한 칸, 셋 밖이면 '원장님'), `generate.ts` 의존에 더함, `lib/ai/prompt.ts` `systemPrompt(honorific)`이 첫 줄 '원장님께'를 호칭으로, `PROMPT_VERSION` 하나 올림. POST 몸통은 `{month}` 그대로.
- 병원 이름: `app/(app)/stats/page.tsx:24`가 guard의 바뀐 이름(`readMe`)을 그대로 쓰므로 따로 고칠 것이 없다(4절).

## 9. 청구메모 잠금 풀기 (REQ-6607)
- `src/lib/precheck/memo/phrases.ts` `neutralPhrases()`: `defaultPhrases()` 사본에서 `PRIVATE_CODES = ['A15','A19','A21','A41','A49','carm1','sono1']`(대소문자 무시) CODEMAP 줄을 빼고, `TPL.lidoCodes = ''`, `procedureDrugs = {}`, `memoRules` 지움. `validatePhrases`를 통과해야 한다(시험). `defaults.json`·`codeMap.json`·`ourClinic.json`은 그대로다(같음 시험·골든이 본다). `index.ts`에서 내보낸다.
- `src/lib/storage/claimSettings.ts` `startHospitalSettings(client, phrases): Promise<'ok'|'failed'>`: `select hospital_id` 줄 읽기 → 없으면 `insert({ phrases })`(dx_links는 DB 기본값 `[]`), 23505(다른 창이 먼저 만듦)면 다시 읽어 'ok' → 있으면 `update({ phrases }).eq('hospital_id', id)`(상병 연결표 그대로). migration은 필요 없다(권한이 이미 있다).
- `HospitalPhrases.tsx` 'blocked' 상태: 파란 안내 글 AC-6607.1 + 두 단추. [기본 문구로 바로 시작] → `startHospitalSettings(neutralPhrases())` → 다시 읽어 'ready', '기본' 탭. [처음 질문 하기] → 16절 처음 질문 화면.
- 잠금 글: `lib/errors.ts` `E-MEMO-NO-SETTINGS` 글을 AC-6607.4로 바꾸고, `MemoPanel.tsx`·`DxLinks.tsx`의 잠금 칸에 `/settings` 링크 '설정으로 가기'. 옛 명세 `specs/precheck` AC-014.8·AC-018.18 글은 이 명세가 대신한다(옛 명세 파일은 고치지 않는다). 옛 시험(`errors.test.ts`·`HospitalPhrases.test.tsx`·`DxLinks.test.tsx`·`MemoPanel.test.tsx`·`jobs.test.ts`·`phrases.test.ts`의 해당 줄)은 새 글로 고치고 이름에 AC-6607.x를 더한다. Worker의 막음 판단(`jobs.ts:132`)은 그대로다(줄이 생기면 풀린다).

## 10. 약 역할 (REQ-6608)
- 새 순수 파일 `src/lib/precheck/drugRoles.ts`(환자 자료 구역):
  - `type DrugRole = 'steroid' | 'localAnesthetic' | 'cartilage'`
  - `drugRole(info: DrugInfoEntry | null): DrugRole | null` — AC-6608.1(주성분코드 7번째 글자 'B', 분류 131·132 빼기, 성분 이름 정규식). 분류번호만으로 정하지 않는다(245에 에피네프린도 있다).
  - `chosenRole(entry): DrugRole | 'none' | null` — CODEMAP 줄 깃발: steroid/localAnesthetic/cartilage 중 true인 것 → 그 역할, 셋 다 false → 'none'([아님]), 깃발 없음 → null([자동]).
  - `drugRoles(catalog: HospitalCatalog, drugInfo, codemap): Map<string, DrugRole | 'none'>` — 코드마다 `chosenRole ?? drugRole(drugInfo.map[standardCode])`(AC-6608.2). 대문자 코드로 맞춘다.
- 점검(`rules/run.ts`): `runRules(month, tables, settings, roles)`로 넷째 값을 받는다(`jobs.ts`가 `drugRoles(month.catalog, tables.drugInfo, phrases.CODEMAP)`를 만들어 넘김, 병원 문구가 없으면 빈 CODEMAP). `classesOf`에서 역할 steroid → `steroid_injection`, localAnesthetic → `local_anesthetic`, cartilage → (히알루론·PN·콜라겐 분류가 없을 때) `hyaluronate_20mg`, 'none' → 그 세 분류와 하위 분류를 뺀다. `STEROID`·`LIDO_CODES`·`DEFAULT_DRUG_NAMES`(이름 추측)를 지우고, `catalogEntry`의 역할 추측은 `drugRole`로 바꾼다. `compile.ts`는 `clinic_codes`를 코드 묶음에 더하지 않는다(`rules.json`·가짜 원본 표는 자료로 그대로 둔다; 그 칸을 보는 compile 시험은 '더하지 않는다'로 고친다).
- `runRules`는 `rules/engine.ts`에 있다(넷째 값 `roles`를 받아 `createRun(month, tables, roles)`). 점검 골든 22건은 옛 동작(약 이름 짐작 19 · A15·A49 코드로만 2 · 보험코드 자리 A21 1)을 고정한 것이라, 가짜 처방 목록에 성분 보험코드를 넣어 같은 결과가 성분으로 나오게 고치고 남는 차이만 `knownDiffs`에 적는다(2026-11-18 TASK-3 일꾼 보고).
- 우리 의원: 처방 목록 보험코드가 성분표에서 lidocaine·dexamethasone·triamcinolone·iohexol·sodium hyaluronate로 나온다(2026-11-18 비트 DB 읽기, 코드만 봄). 지금도 성분 이름이 줄 이름표에 붙어 분류 정규식이 맞으므로 결과가 같다 — AC-6608.4 시험은 가짜 달 + 이 다섯 코드·보험코드로 고치기 전과 같은 결과를 본다.
- 메모: `jobs.ts` `memoViews`가 같은 `roles`를 `tables`에 실어(`MemoTables.roles?`) 엔진에 넘긴다. 엔진 `isCartilageDrug`: 깃발 → `roles.get(code) === 'cartilage'` → 지금 이름 정규식. 메모는 여전히 연골주사 역할만 읽는다(스테로이드·마취약은 메모가 안 씀, 지금과 같음).
- 설정 `phrases/CodesTab.tsx`: 약 줄(`k`가 약이거나 비트 종류가 약)에 '역할' `select`(AC-6608.5) → CODEMAP 줄 깃발로 쓴다(자동 = 세 깃발 지움, 아님 = 셋 다 false). `validatePhrases`는 이미 세 깃발을 받는다(`CODE_KEYS`).

## 11. 연골주사 약 이름 (REQ-6609)
- 안 바꾸는 것: `chart.ts` 사전의 '연골주사 = 아라간' 등은 **안쪽 표시 글자**로 남긴다(골든 그대로). 이 글자가 메모 글에 그대로 나오지 않게 하는 것이 일이다.
- `engine.ts`: 엔진을 만들 때 `cartilageNames` = 연골주사 역할 CODEMAP 줄의 `n`·`displayName`·`bitName` + `tables.cartilageNames`(memoViews가 처방 목록에서 역할이 cartilage인 줄 이름을 넘김). 이 이름마다 사전 줄 `{ kind: 'proc', term: 이름, target: '아라간' }`을 더해 차트 글을 읽을 때 안쪽 표시로 바꾼다(`normalizeChartLine`이 이미 사전을 먼저 돈다). 약 이름이 필요한 곳(`CARTILAGE_NAME` 대신 쓰던 자리, 연골주사 줄의 약 표시)은 그날 처방의 연골주사 약 이름 → `cartilageNames[0]` → '연골주사약' 차례.
- 우리 의원은 A49 이름이 '아라간'이라 결과가 같다(AC-6609.3 = 지금 골든 그대로).
- 범위 밖: `lib/patients/followup.ts`(환자 탭 F/U 찾는 말)의 '아라간'은 이 기능에서 바꾸지 않는다.

## 12. 입력 방식 기억 (REQ-6610)
- 같은 SQL 파일: `alter table public.claim_hospital_settings add column if not exists input_mode text;` + `check (input_mode is null or input_mode in ('code','date'))`(이름 있는 제약, 있으면 건너뛰기) + `grant update (input_mode) on table public.claim_hospital_settings to authenticated;`. 정책은 지금 것(내 병원 줄)이 그대로 막는다. `precheck.rls.test.ts`의 칸 권한 목록 시험을 새 칸까지로 고친다.
- `claimSettings.ts`: `readInputMode(client): Promise<{ hospitalId: string; mode: 'code'|'date'|null } | null>`(실패·줄 없음 → null), `saveInputMode(client, hospitalId, mode)`(`update({ input_mode }).eq('hospital_id', hospitalId)`, 결과 무시). `readHospitalSettings`는 고치지 않는다(설정 바뀜 띠와 상관없게).
- `ClaimScreen.tsx`가 읽어 `MemoPanel` → `InputMode`로 `savedMode`를 넘기고, `defaultSelection(visible, savedMode?)`가 'code'면 처방코드별로 시작. 고를 때 `onModeChange`로 ClaimScreen이 저장한다(`components/claim/memo`는 저장소를 직접 부르지 않는다).

## 13. 뒤에 붙이기 (REQ-6611, 도우미 0.12.0)
- 명령 모양 `src/lib/bridge/commands.json` `bit.input` 항목에 `appends`(글, 4,000자까지)를 더한다 — `replaces`와 함께 오면 거절. 이 파일 하나를 도우미도 쓴다.
- 도우미(`helper/src/Precheck.Core`): `InputCommands.cs` 읽기, `BatchCheck.cs` 항목·한도, `InputRunner.cs` — 비트 메모가 `appends`와 같을 때만(줄바꿈 맞춘 뒤) `합친 글 = 기존.TrimEnd() + "\n" + 우리 메모`를 지금 쓰기 길(`MemoWriter.Write` → `SaveOriginal` → `SaveAndConfirm(item, 합친 글)`)로 넣고 결과 이유 '붙임(기존 메모 뒤에)'. 다르면 '바뀜'. '묻지 않기'로는 붙이지 않는다(항목에 `appends`가 있을 때만). 합친 글이 `BitBytes` 3,000 넘으면 '길이 넘음(비트 메모 칸 3,000바이트)'. `BitBytes(text)` = 글자마다 ASCII 1, 나머지 2(비트 `OcmBilCmt varchar(3000)`, 2026-11-18 비트 DB 칸 정보로 확인). 끊긴 쓰기 되살리기는 '마지막 원본 + \n + 우리 메모'와 같으면 끝난 것으로 본다. `InputPrompt.cs`에 '다른 메모 뒤에 붙이는 환자 {N}명'.
- 견주기(사용자 결정 '좁히기'): '비트 메모 = 앞 글 + `\n` + 우리 메모'는 그 진료의 붙임 기록(붙일 때 본 앞 글, 끝 공백 뺌)이 있고 앞 글이 그것과 같을 때만 '같음'이다. 웹은 붙임이 완료되면 그 앞 글을 붙임 기록으로 남기고 `compareMemo(ours, inBit, appendedFrom?)`로 넘긴다(`memoCompare.ts`의 `visitMemos`·`jobs.ts`). 붙임 기록은 메모리에만 두지 않고 그 달 완료 표시와 함께 도우미 저장소(`store.save`의 `done` 칸, 도우미가 암호화해 그 PC에만 둠)에 남겨 [자료 불러오기]를 다시 해도 유지한다 — 키 모양은 구현이 정하되 옛 판 웹이 읽어도 깨지지 않게 하고, 도우미 저장 코드는 고치지 않는다. [이 메모로 바꾸기]·[바꾸지 않기]를 누르거나 비트 글이 기록과 달라지면 지운다. 기록이 없으면 지금처럼 '다름'. 도우미 `MemoMatcher.cs`는 정확히 같을 때만 Same이고(묻지 않기·이미 있음 판단에 붙임 꼬리를 쓰지 않는다), 끊긴 붙이기 되살리기는 지금처럼 `Matches(existing, Join(original, memo))`다 — `MemoCompare.IsAppended`는 쓰는 곳이 없어지면 지운다. 사례 표 `helper/tests/Precheck.Core.Tests/Claim/memo-compare-cases.test.json`은 줄마다 쪽별 기대값을 둔다(웹: 붙임 기록 있음·없음·앞 글 다름, 도우미: 정확히 같을 때만 같음).
- 웹: `types/precheck.ts` 승인 값에 'append'를 더하고(`memoApprove`), `jobs.ts`가 그 환자 항목을 `appends`(화면에서 본 비트 메모)로 만든다. `MemoDetail.tsx`(rows) 단추 [뒤에 붙이기], 표시 '메모 뒤에 붙임'(`leftGroups.ts`), `MemoPanel.tsx`는 `APPEND_HELPER` 미만이면 단추를 감춘다.
- 판: `helper/Directory.Build.props` 0.12.0, `src/lib/bridge/versions.ts` `LATEST_HELPER = '0.12.0'`·`APPEND_HELPER = '0.12.0'`(MIN_HELPER 그대로), 판 번호가 박힌 시험(`handshake.test.ts` 등).
- 도우미 C# 시험은 net10(`dotnet test`)으로 하고, 다른 일꾼과 동시에 돌리지 않는다.

## 14. 차트 줄임말 (REQ-6612)
- `Phrases`에 선택 칸 `chartWords?: { term: string; target: string }[]`. `validatePhrases`: 배열 100줄, 각 칸 앞뒤 빈칸 없는 1~40자, term은 대소문자 무시 겹침 없음. 없으면 빈 표. `diffPhrases`·`saveDiffRows`가 '차트 줄임말' 줄로 보인다.
- 엔진: `dictionary.aliases` = `tables.dictionary`의 줄 + `chartWords`(kind 'proc') + 11절 연골주사 이름 줄. `normalizeDictionary`가 이미 긴 말부터 한 번만, 낱말 경계를 지켜 바꾼다(AC-6612.2).
- 화면: 새 `src/components/settings/phrases/WordsTab.tsx`, `HospitalPhrases.tsx` TABS에 `{ key: 'words', label: '차트 줄임말' }`('메모 시험' 앞), `tabOf`가 `chartWords` 경로를 'words'로.

## 15. 숨은 칸 (REQ-6613)
- `ReasonTab.tsx`에 `intervalCodes`·`twoSiteRules`(여러 줄)·`reasonPriority`(고르기), `ProcTab.tsx` 'Central 시술 문구' 아래 `mainCentralCodes`. `HospitalPhrases.tsx` `REASON_KEYS`·`PROC_KEYS`에 더한다.
- 흐린 기본 글: `engine.ts`의 안쪽 기본값('LA358, KK090' 등)을 `src/lib/precheck/memo/engineDefaults.ts` 상수로 옮겨 엔진과 화면이 함께 쓴다(값 그대로).

## 16. 처음 질문 (REQ-6614)
바탕: 승인 시안(가입 질문, 2026-11-01)의 화면 모양(시작 → 붙여 넣기/보기 고르기 → 쪽마다 질문 + 보기 메모 → 확인)을 따르되 쪽은 넷. 시안의 보기 메모는 시안 안 흉내 엔진 글이었고, 여기서는 진짜 엔진(`createMemoEngine(phrases, {}).fullText(visit)`, 메인 스레드, 메모 시험 탭과 같음)을 쓴다.

- 순수 함수 `src/lib/precheck/memo/onboarding/`(환자 자료 구역 규칙 그대로):
  - `sampleVisits.ts`: 가짜 진료 3건 `Visit`(차트 줄·처방 코드는 `neutralPhrases()` CODEMAP에 있는 표준 코드: 허리 MBB L4,5,S1 both + SNB Rt / 어깨 관절 주사 Rt / 무릎 연골주사 Rt 2회차 + K-L 3/3). 이름·차트번호는 '가짜' 글자.
  - `answers.ts`: `type Answers = { sideStyle; cartilageSideLang; sideMode; sideSpread; carm: string | null; sono: string | null; ending: string | null; levelSep; klg: 'paren' | 'plain' | 'ko'; mark: string; lineJoin }`(null = 안 씀). `applyAnswers(base: Phrases, a: Answers): Phrases` — AC-6614.7 칸만. 문구 토큰은 지우고 다시 붙인다: 앞 `{C-arm} `·`{Sono} `, 끝 ` {시행함}`이 이미 있으면 떼고, 켜진 답이면 정한 문구에 한 번 붙인다(붙이는 문구 목록은 AC-6614.7 — `{C-arm}`은 mainPeripheral 빼고, icnb·ara 안 건드림, ts는 끝맺음 빼고). 고정 멘트(`fixedPhrases`)의 C-arm·Sono·시행함 줄은 `text`를 답으로, `on`을 켜짐으로. `answersOf(phrases): Answers`(다시 할 때 지금 값으로 시작).
  - `presets.ts`: 보기 4개의 `Answers`와 이름. `NONE_PRESET = 1`(보기 2, 0부터 셈).
  - `readMemo.ts`: `readMemo(text): Record<keyof Answers, { value } | 'mixed' | null>` — AC-6614.3 규칙만. 결과에 메모 글을 담지 않는다(값 목록 안 값만).
  - `preview.ts`: `previewMemos(phrases): string[]` — 가짜 3건 `fullText`.
- 화면 `src/components/settings/firstRun/`: `FirstRunScreen.tsx`(단계 상태 — start · paste · pick · page 0~3 · confirm · saved, 브라우저 저장소 안 씀), `QuestionPage.tsx`(쪽 넷, 고르기는 `ds` 라디오·칩), `ExampleAside.tsx`(보기 메모 `pre`, 넓은 화면 오른쪽 `aside`, 폰 아래), `ConfirmPage.tsx`(`diffPhrases`로 바뀌는 것 표). 붙여 넣기 칸 `src/components/settings/firstRun/paste/PasteBox.tsx`만 환자 글이 닿으므로 **울타리에 더한다**: `eslint.config.mjs` 환자 줄 구역 목록과 `src/guardrails.test.ts`에 이 폴더(네트워크·저장소·console·supabase 금지). PasteBox는 `readMemo` 결과만 위로 올리고 글은 자기 상태에만 둔다.
- 주소 `src/app/(app)/settings/first-run/page.tsx`: 설정 page와 같은 guard(원장만). 저장은 `readHospitalSettings` → 맞으면 그 문구, 아니면 `neutralPhrases()` → `applyAnswers` → `validatePhrases` → `writeHospitalSettings(phrases, 지금 dxLinks 또는 [])`. 오류 번호 `E-FIRST-RUN-SAVE-FAILED`(2절 TASK의 errors).
- 들어가는 곳: `HospitalPhrases.tsx` 잠금 칸 [처음 질문 하기] · 준비된 화면 위 작은 링크 [처음 질문 다시 하기] → `/settings/first-run`.

## 17. 결정 기록 (ADR-033)
`docs/ADR.md` 끝에 더한다:
> ### ADR-033: 병원 정보를 한 곳(clinic_profiles)에 두고, 페이지 guard가 그 이름을 읽는다
> - 결정: 병원 이름·로고·전화·주소·호칭·요일별 진료시간·휴진일·원장님·직원을 `clinic_profiles` 한 줄(RLS 내 병원, 고치기는 원장만, 데스크는 읽기만)과 비공개 Storage `clinic-logos`에 둔다. 서식·문자·예약·통계·대시보드·AI가 이것을 읽는다. 예약 시행자 목록은 이것의 '예약에 보이기' 사람으로 합친다(옛 칸은 남겨 두고 읽지 않는다).
> - 서버 코드 예외(ADR-004)를 한 칸 넓힌다: 페이지 guard(`hospital.server.ts`)가 내 병원 줄과 함께 `clinic_profiles.display_name` 한 칸을 읽는다(쓰지 않는다). AI 경로는 호칭 한 칸을 DB에서 읽고 브라우저 값을 쓰지 않는다.
> - 대가: 데스크가 예약 시행자를 더하지 못한다(원장이 병원 정보에서). 진료시간은 통계에서 보이는 칸만 바꾸고 저장 모양은 그대로다.
`CLAUDE.md` 서버 코드 줄의 '내 병원·관리자·데스크 줄만' → '내 병원·관리자·데스크 줄과 병원 정보 이름만'(ADR-033).

## 배포 순서
1. SQL `20261119000000_clinic_profile.sql`을 사용자가 SQL Editor에 붙여 넣기 → 밖에서 `clinic_profiles` 401 42501 확인.
2. 도우미 0.12.0 정식 판(뒤에 붙이기) → 관리자 설치 파일에 올림.
3. 웹 배포(사용자 "배포해").
4. 우리 의원: 설정 → 병원 정보에서 로고(`public/poster/logo.png`를 바탕화면에 꺼내 줌)·진료시간 확인 → 저장.

## 위험
- 예약 시행자를 데스크가 더는 고치지 못한다(원장만) — 사용자 확인 대상으로 requirements에 적음.
- 로고가 가로로 긴 모양이 아니면 상자 안에서 작게 보인다(비율 지킴).
- 병원 이름의 드문 글자는 포스터 글꼴(부분 글꼴)에 없어 인쇄·그림 파일에서 다른 글꼴로 나올 수 있다.
- SQL을 넣기 전에 웹을 올리면 병원 정보 읽기가 실패한다 → 앱은 실패를 '줄 없음'처럼 다뤄 예약·서식·문자가 지금처럼(예약 설정 시행자, 이름 글자 로고) 돌아간다.

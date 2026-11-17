# 설계: 예약 탭 (구글 캘린더 대신)

## 흐름
```
[모든 기기] CalendarScreen ─(lib/storage/calendar.ts, RLS)→ Supabase calendar_appts · calendar_allday · calendar_settings
            보이는 동안 5초마다 calendar_rev(숫자 하나) → 바뀌면 보이는 기간만 다시 읽기
[비트 PC]   이름·차트번호 → bridge.stream('contact.targets', {kind:'calfind', q}) → 도우미 0.10.0 → 확장 → lib/bridge → calendar.worker
            → found(이름·차트번호·성별·나이·마지막 내원) → rows/BitPicks(울타리) → 고른 이름·차트번호 두 칸만 판에
            보이는 기간 → contact.targets {kind:'calday', from, to} → calendar.worker(+ 화면이 준 예약 id·차트번호)
            → days(예약 id별 도착 auto · 비트 예약 칸) → setApptAuto(id, auto)만 서버로 / 비트 예약 칸은 rows/TimeGrid에만
[통계 탭]   useStatsCalendar → listCalendarCounts(12달, 이름·차트·메모 칸 없음) → rateSummary → CalendarSection
[수납일지]  도우미 0.10.0 sunap 답 v:3(줄 끝 건강생활) → sunap read.ts → 장부 줄 health → LedgerRows 칩 · dayTotals free_n
```

## 시안과 다른 곳 · 이 명세가 정한 것 (Claude 판단, 사용자 확인 대상은 tasks.md 끝)
- 주소는 `/calendar`, 통계 칸 id는 `stats-calendar`(이름 '예약', '예약·전환' 다음)
- 기본 시행자 목록은 비어 있다(시안의 (가)~(원)은 지어낸 이름). 시행자가 없으면 더하기 판에 '설정에서 시행자를 먼저 더해 주세요'와 [설정]
- 이름은 1~20자, 메모 100자까지. 둘 다 전화·주민번호·메일 모양이면 저장하지 않는다(`privacyProblem`, 이유 글)
- 차트번호 없는 예약(신환)은 도착이 저절로 바뀌지 않는다(늘 '아직', 손으로 고름)
- 비트 찾기는 똑같은 이름(성만 적으면 안 찾음) 또는 똑같은 차트번호, 20명까지. 더 있으면 '같은 이름이 많아요. 차트번호로 찾아 주세요'
- 처음 자리로 되돌리면 '변경' 표시가 없어진다. 날짜·시작을 옮기면 도착 자동 값이 비워진다(새 자리에서 다시 셈)
- 월 칸 `변경 N`은 취소를 뺀다(월 칸이 취소를 안 세므로). 요약 줄·통계는 취소도 센다
- 비트 읽기 범위: calday는 오늘−62일 ~ 오늘+92일, 42일까지. 화면이 그 안으로 잘라 부른다(더 지난 날은 도착을 다시 셈하지 않고 서버 값 그대로)
- 요약 줄 상태 `?s=summary`·통계 `?s=stats` 시안은 지금 만드는 중이다. 글·칸은 이 명세(REQ-5907)를 따르고 시안이 다르면 시안을 고친다

## ADR-030 (TASK-1이 `docs/ADR.md` 끝에 넣는 글)
### ADR-030: 예약 탭은 환자 이름·차트번호를 서버에 저장한다 (구글 캘린더 대신)
**맥락**: 의원은 공용 구글 캘린더에 예약(이름·차트번호·담당·종류)을 적어 왔다. 2026-11-17 사용자: 웹앱 '예약' 탭이 구글 캘린더를 대신하고, 접수·치료실·진료실 PC와 폰(총괄·원장님)이 같은 예약표를 몇 초 안에 본다. 이것은 "환자 개인정보는 의원 PC 밖으로 나가지 않는다 · 서버에는 집계 숫자만"(`CLAUDE.md` 아키텍처 규칙, ADR-003·020·021)에 부딪힌다. 그래서 이 탭의 표에만 예외를 연다
**결정** (사용자, `specs/clinic-calendar`):
- **서버에 두는 것**: 예약 한 줄(`calendar_appts`: 날짜·시작·길이·환자 이름·차트번호(없어도 됨)·시행자·종류·메모 100자·도착 상태·처음 자리), 종일 줄(`calendar_allday`: 메모 20자·시행자 휴무), 설정(`calendar_settings`), 바뀜 숫자(`calendar_rev`)
- **두지 않는 것**: 전화번호·주민번호·주소·성별·나이·생일·마지막 내원·비트 접수 목록·비트 자체 예약(RsvInf). 비트 찾기 결과 중 사람이 고른 이름·차트번호 두 칸만 예약 칸에 들어간다. 이름·메모가 전화·주민번호·메일 모양이면 앱이 보내지 않는다
- **비트에서 서버로 가는 값은 도착 자동 표시(`auto`: 왔음·안 옴·없음) 하나다.** 비트 PC Worker가 그날 접수 차트번호와 예약 차트번호를 견주어 예약 id마다 셈하고, 화면은 그 id·값만 적는다. 접수 목록은 Worker 밖으로 나가지 않는다(ADR-020 길 그대로). 폰은 그 값을 읽기만 한다
- **읽기**: RLS로 승인된 내 병원 계정만. 기본 권한을 모두 거둔 뒤 필요한 칸 권한만 준다. anon 없음. AI로는 보내지 않는다
- **지우기**: 날짜가 한국 날짜 오늘−1년보다 이른 예약·종일 줄은 예약을 넣을 때마다 DB 트리거가 지운다(확장 기능·예약 작업 없음)
- **다른 PC**: 보이는 동안 5초마다 `calendar_rev` 숫자 하나만 읽고 바뀌었을 때만 다시 읽는다. 실시간 연결(Supabase Realtime)은 쓰지 않아 CSP `connect-src`는 그대로다
**이유**: 구글 캘린더를 대신하고 폰에서도 이름으로 예약을 봐야 한다 **(사용자, 2026-11-17)**. 신환은 차트번호가 없어 이름이 있어야 한다. 도착 표시를 폰에서도 보려면 비트 PC가 정한 값이 서버에 있어야 한다 **(사용자)**
**대안**: (1) 비트 예약만 쓰기 — 폰에서 못 보고 담당·종류 칸이 없다. (2) 차트번호만 — 신환·폰에서 누군지 모른다. (3) Realtime — CSP에 wss origin을 더하고 구독 권한을 따로 다뤄야 한다. (4) pg_cron으로 매일 지움 — 확장을 켜야 하고 PGlite 시험으로 증명하지 못한다
**트레이드오프**: 환자 이름·차트번호가 의원 밖(Supabase 서울)에 1년까지 남는다. 계정이 털리면 보인다 → 구글 로그인·관리자 승인·30분 자동 로그아웃 그대로. 메모의 개인정보는 모양 검사로만 막는다. 예약을 하나도 넣지 않는 동안은 지난 줄이 지워지지 않는다(매일 넣으므로 늦어도 하루). 5초 읽기로 요청이 는다(PC 셋이 하루 10시간이면 약 2만 번, 답은 숫자 하나)

**`CLAUDE.md` 아키텍처 규칙에 더할 줄** (ADR-029 줄 다음):
`- 예외 (ADR-030): 예약 탭만 환자 이름·차트번호를 서버(calendar_appts, RLS 내 병원)에 둔다 — 전화·성별·나이·생일·비트 접수 목록·비트 예약은 두지 않고, 비트에서 온 값은 비트 PC가 정한 도착 표시(auto) 하나만 적는다. 이름·메모는 개인정보 모양이면 안 보내고, 지난 예약은 1년 뒤 DB가 지운다`
그리고 환자 자료 구역 목록(둘째 CRITICAL 줄)에 `lib/calendar`, 울타리 화면 목록에 `components/calendar/rows`를 더한다.

## DB (`supabase/migrations/20261117010000_calendar.sql`, 사용자가 SQL Editor에 붙여 넣음)
본보기 `20261116000000_sunap.sql`. 모두 `if not exists`·`drop … if exists`로 두 번 실행 안전, RLS 켜고 `revoke all … from anon, authenticated` 뒤 필요한 권한만, 정책은 `hospital_id = (select public.my_hospital_id())`.
- `calendar_settings`(병원 한 줄): `hospital_id` 기본 키(기본 `my_hospital_id()`), `kinds` jsonb(배열, 8,000바이트 미만, 기본 아래), `staff` jsonb(배열, 8,000바이트 미만, 기본 `[]`), `open_hour` int 5~12 기본 8, `close_hour` int 12~24 기본 20, `sunday` bool 기본 false. 권한: select, insert/update(다섯 칸). 지우기 없음
  - 기본 kinds: `[{"id":"dosu","name":"도수","len":30,"color":null},{"id":"jabo","name":"자보도수","len":30,"color":null},{"id":"shock","name":"충격파","len":15,"color":null},{"id":"inj","name":"주사","len":10,"color":"pink"},{"id":"visit","name":"진료","len":10,"color":"lime"}]` (color null = 시행자 색 따름)
- `calendar_appts`(예약 한 줄): `id` uuid 기본 gen_random_uuid(), `hospital_id`, `day` date, `start_min` smallint 0~1430·10의 배수, `len_min` smallint 5~240·5의 배수, `name` text(앞뒤 빈칸 뺀 1~20자), `chart` text null(`^[0-9]{1,10}$`), `staff_id` text 1~40, `staff_name` text 1~10, `staff_mark` text 1자, `kind_id` text 1~40, `kind_name` text 1~10, `memo` text 0~100 기본 '', `status` text 기본 'auto' in ('auto','came','noshow','cancel'), `auto` text null in ('came','noshow'), `orig_day` date null, `orig_start` smallint null, `created_at`·`updated_at` timestamptz 기본 now(). 색인 (hospital_id, day)
  - 권한: select·delete, insert(day, start_min, len_min, name, chart, staff_id, staff_name, staff_mark, kind_id, kind_name, memo, status), update(같은 칸 + auto). `orig_*`·`created_at`·`updated_at`·`id`·`hospital_id`는 칸 권한 없음
  - 트리거 `calendar_appts_move`(BEFORE UPDATE, 줄마다): updated_at = now(). (day, start_min)이 바뀌면 auto := null, old.orig_day가 null이면 orig := old 자리, 새 자리가 orig와 같으면 orig := null
  - 트리거 `calendar_appts_prune`(AFTER INSERT, 문장마다, invoker 권한·RLS 그대로): `delete from calendar_appts / calendar_allday where hospital_id = my_hospital_id() and day < ((now() at time zone 'Asia/Seoul')::date - interval '1 year')::date`
- `calendar_allday`(종일 한 줄): `id`, `hospital_id`, `day`, `type` in ('memo','off'), `memo` text null, `staff_id` text null, `staff_name` text null, `created_at`. 검사: memo면 memo 1~20자·staff 칸 null, off면 staff_id·staff_name 있음·memo null. off는 (hospital_id, day, staff_id) 하나만(부분 unique 색인). 권한: select·delete, insert(day, type, memo, staff_id, staff_name). 고치기 없음(지우고 다시 넣음)
- `calendar_rev`(병원 한 줄): `hospital_id` 기본 키, `rev` bigint 기본 0, `changed_at`. 권한: select만. 세 표의 AFTER INSERT/UPDATE/DELETE 문장 트리거가 `security definer`(search_path '') 함수 `calendar_bump()`로 내 병원 줄을 넣거나 rev + 1(my_hospital_id()가 null이면 아무것도 안 함). 함수 실행 권한은 public·anon·authenticated에서 거둔다

## 모양 (`src/types/calendar.ts`, TASK-1)
```ts
export type CalColor = 'blue' | 'teal' | 'purple' | 'orange' | 'pink' | 'lime' | 'navy' | 'sky' | 'brown' | 'gray'
export type CalKind = { id: string; name: string; len: number; color: CalColor | null } // null = 시행자 색 따름
export type CalStaff = { id: string; name: string; mark: string; color: CalColor }
export type CalSettings = { kinds: CalKind[]; staff: CalStaff[]; openHour: number; closeHour: number; sunday: boolean }
export type ApptStatus = 'auto' | 'came' | 'noshow' | 'cancel'
export type ApptAuto = 'came' | 'noshow' | null
export type CalAppt = { id: string; day: string; start: number; len: number; name: string; chart: string | null
  staffId: string; staffName: string; staffMark: string; kindId: string; kindName: string; memo: string
  status: ApptStatus; auto: ApptAuto; origDay: string | null; origStart: number | null }
export type ApptDraft = Omit<CalAppt, 'id' | 'auto' | 'origDay' | 'origStart'>
export type CalCountRow = Pick<CalAppt, 'day' | 'staffId' | 'staffName' | 'kindId' | 'kindName' | 'status' | 'auto' | 'origDay'>
export type CalAllDay = { id: string; day: string; type: 'memo' | 'off'; memo: string | null; staffId: string | null; staffName: string | null }
```
- `src/lib/calendar/shapes.ts`(TASK-3)는 셈에 쓰는 칸만 같은 이름으로 둔다(같은 Phase라 `types/calendar.ts`를 import하지 않음). TASK-8의 tsc가 두 모양이 맞는지 본다

## 저장 함수 (`src/lib/storage/calendar.ts`)
- `listAppts(client, from, to)` → `CalAppt[]` (날·시작 차례, 1,000줄씩 `range`로 나눠 다 읽음) · `listCalendarCounts(client, from, to)` → `CalCountRow[]`(그 칸만 select, 나눠 읽음)
- `addAppt(client, draft)` → `CalAppt | 'blocked'` · `updateAppt(client, id, patch: Partial<ApptDraft>)` → `CalAppt | 'blocked'` · `setApptAuto(client, id, auto)`(auto 칸만) · `deleteAppt(client, id)`
- `listAllDay(client, from, to)` · `addAllDay(client, item)` → `CalAllDay | 'blocked'` · `deleteAllDay(client, id)`
- `loadCalendarSettings(client)`(줄 없음·모양 틀림 → `DEFAULT_CAL_SETTINGS`) · `saveCalendarSettings(client, s)` → `'invalid'` 또는 저장(upsert onConflict hospital_id) · `checkCalendarSettings(s)` → 문제 목록(종류 0개·이름 1~10자 아님·길이 5~120·5의 배수 아님·id 겹침·한 글자 표시 겹침/1자 아님·색 이름 밖·시간 범위 밖)
- `loadCalendarRev(client)` → number(줄 없으면 0)
- 이름·메모 앞뒤 빈칸을 빼고 `privacyProblem`(`lib/worklog/notes`)이면 보내지 않고 `'blocked'`. 오류는 `CalendarStorageError('offline'|'failed')`(본보기 `lib/storage/sunap.ts`)

## 순수 셈 (`src/lib/calendar/`, 환자 자료 구역)
- `layout.ts`: `layoutDay(blocks: {key, start, len}[]) → Map<key, {col, cols, span}>` — 시작 이른 차례(같으면 긴 칸 먼저)로 겹치는 묶음을 만들고, 묶음 안에서 비어 있는 가장 왼쪽 열에 둔다. cols = 묶음의 열 수, span = 오른쪽 열들이 그 시간에 비어 있는 만큼 넓힘. 비트 예약 칸·취소 칸도 같이 놓는다
- `rules.ts`: `warnings(draft, appts, allday)` → `{overlap: string[], off: boolean}` · `arrivalOf(appt, cameCharts: ReadonlySet<string>, now: Date)` · `shownStatus(appt)` → `'came'|'noshow'|'cancel'|'none'` · `nextWeek(appt)` · `visibleGhosts(ghosts, appts)` · `ageOn(birth: 'YYYYMMDD', today: 'YYYY-MM-DD')` · `slotLabel(day, start)` → `'11/18 (수) 15:00'`. 한국 날짜·시각은 `lib/analytics/dates.ts`로
- `counts.ts`: `monthCells(appts, allday, from, to, today)` → 날마다 `{total, kinds: [{kindId, kindName, n}], noshow: number|null, moved, allday}` · `rateSummary(rows: CalCountRow[])` → `{total, cancel, moved, noshow, byStaff: Row[], byKind: Row[]}`(Row = `{id, label, total, cancel, moved, noshow}`, 예약 많은 차례) · `monthTrend(rows, months)` → 달마다 rateSummary의 네 수 · `ratePct(part, whole)`(= `sunapPct` 규칙: `Math.round(x*1000)/10` + `toFixed(1)` + '%', 0이면 '–')
- 끝 = 시작 + 길이(분). 겹침은 [시작, 끝) 끼리. 오늘 전 날 = 한국 날짜

## 도우미 답 (`contact.targets`, 조각 하나의 JSON)
```json
{ "v": 1, "kind": "calfind", "today": "2026-11-17", "more": false,
  "rows": [["10231", "김○○", "F", "19650312", "20261110"]] }
{ "v": 1, "kind": "calday", "from": "2026-11-16", "to": "2026-11-21", "today": "2026-11-17",
  "came": [["20261116", "10231"]], "rsv": [["10231", "김○○", "202611181030"], [null, "이○○", "202611191400"]] }
```
- calfind rows: 차트번호, 이름, 성별(`PbsSexTyp`를 'M'|'F'|null로, 실제 값 모양은 TASK-2가 비트에서 개수로 확인), 생일(`PbsBirDte`, `StatsRows.Birth`와 같은 검사, 아니면 null), 마지막 내원(센 접수 중 가장 늦은 날 YYYYMMDD|null). 찾기: q가 숫자면 `RTRIM(b.PbsChtNum)=@q`, 아니면 `RTRIM(b.PbsPatNam)=@q`. 이 병원 접수(상태 무관)가 있는 환자만. `TOP 21`로 읽어 21째가 있으면 `more`. 차례: 마지막 내원 늦은 차례, 같으면 차트번호
- calday came: 기간(@from ≤ OcmAcpDtm < @to+1일) 센 접수(`StatsSql` Visits 조건: 외래·WN/HN/TN/PN·`OcmRsuYon<>'O'`·이 병원)의 [날, 차트번호] 중복 없음, 빈 차트번호 뺌. rsv: 같은 기간 외래·이 병원·(`RsvInf` 'R'·'' 줄 있음 또는 WR·NR·CR)·CN 아님인 접수의 [차트번호|null, 이름|null, OcmAcpDtm 12자리], 시각이 틀린 줄은 건너뜀(`SunapSql.NextReservationSql` 조건과 같게)
- 새 SQL 상수는 `helper/src/Precheck.Core/Calendar/CalendarSql.cs`(`FindSql`·`CameSql`·`RsvSql`), 처리기 `Calendar/CalendarTargets.cs`(`FindKind = "calfind"`, `DayKind = "calday"`), `Bit/Sql.cs` 허용 사슬에 `Calendar.CalendarSql.IsAllowed`·`ParametersOf`
- `ContactCommands`: `TargetsArgs`가 선택 칸 q를 읽고 `BuildTargets`에 넘긴다. calfind는 q가 있어야 하고 다른 kind는 q가 없어야 한다. calfind는 from = to = 오늘
- 명령 표: `contact.targets.args.kind.values`에 `calfind`·`calday`, `args.q = {type: 'string', min: 1, max: 20, optional: true}`. 확장은 명령 이름만 보므로 새 판이 없다
- 판: `helper/Directory.Build.props` 0.10.0, `versions.ts` `LATEST_HELPER = '0.10.0'`, 새 `CAL_HELPER = '0.10.0'`(이보다 낮으면 예약 탭은 비트 없는 기기처럼 그린다). 판 박힌 시험은 숫자만 바꾼다

## Worker 메시지 (`src/workers/calendar.worker.ts` + `src/workers/calendar/{handler,read,messages}.ts`)
- 본보기 `src/workers/sunap/*`(조각 받기 `createAssembler`, `bridge-port`). 화면이 스트림을 열고 결과 `{id}|{code}`만 넘긴다
- 화면 → Worker: `bridge-port` · `find {targets}` · `days {targets, now: number, appts: {id, day, start, len, chart, status, auto}[]}`
- Worker → 화면: `found {rows: {chart, name, sex: '남'|'여'|'', age: number|null, last: string|null}[], more}` · `days {from, to, auto: [id, ApptAuto][], ghosts: {key, day, start, chart: string|null, name: string|null}[]}` · `error {op, code}`
- 읽기 검사: 차트번호 숫자 1~10자, 이름 1~40자, 날짜·시각 모양, 성별 'M'|'F'|null, v·kind·기간이 부른 것과 같음. 틀리면 `E-BRIDGE-BAD-REPLY`(반쪽 결과 없음)

## 화면 (`src/components/calendar/`, 모양은 앱 토큰·`components/ui/classes.ts`, 글은 시안 그대로)
- 울타리 `rows/`(props만): `TimeGrid.tsx`(일·주 시간 표, 종일 줄, 예약 칸, 비트 예약 칸, 도착·변경 표시, 지금 선, 빈 칸 누름 `onSlot(day, start)`), `ApptBlock.tsx`, `GhostBlock.tsx`, `PhoneWeekList.tsx`(폰 주 보기), `BitPicks.tsx`(고르기 목록, 고르면 `{name, chart}`만 위로)
- 그 밖: `MonthGrid.tsx`(수만), `colors.ts`(종류 색 → 없으면 시행자 색 → 목록에 없으면 회색), `CalendarToolbar.tsx`, `SummaryLine.tsx` + `RateTable.tsx`(요약 줄·시행자별/종류별 표, 통계 칸도 씀), `AddPanel.tsx`(더하기·고치기, 비트 찾기 자리는 화면이 넣는 `lookup` 칸), `DetailPanel.tsx`, `AllDayPanel.tsx`, `CalendarSettings.tsx`, `CalendarScreen.tsx`, `useCalendarData.ts`(기간 읽기·5초 rev·저장), `useCalendarWorker.ts`(bridge·Worker)
- 비트 PC 판정: `useBridge` handshake 버전 ≥ `CAL_HELPER`. 시안 10색은 `globals.css :root` 토큰 `--cal-*` 열(옅은 바탕은 `color-mix`), 토큰 표·`theme.test.ts`에 더한다
- 시간 칸: 10분 = 20px, 보이는 시간 `openHour`~`closeHour`, 그 밖 예약은 일·주 보기에 안 보인다(월 수·요약에는 든다). 비트 예약 칸 길이 20분
- 통계 칸 `components/stats/sections/CalendarSection.tsx`: 12달 그림(`components/charts`의 막대/선) + 표(달·예약·취소율·변경율·안 옴율) + 달 고르기 + `RateTable` 둘. 읽기는 `useStatsCalendar`(이번 달 1일 −11달 ~ 오늘, 통계 기간과 따로)

## 다시 읽기
- `useCalendarData`: 보이는 동안(`visibilityState === 'visible'`) 5초마다 `loadCalendarRev`, 값이 바뀌면 보이는 기간(일·주: `listAppts` + `listAllDay`, 월: `listCalendarCounts` + `listAllDay`)과 설정을 다시 읽는다. 다시 보이면·내가 저장하면 바로 읽는다. 늦게 온 앞 답은 버린다
- 비트 PC: 기간을 그릴 때와 오늘이 든 기간을 보는 동안 60초마다 `days` → 받은 auto를 하나씩 `setApptAuto`. 같은 예약을 다시 적지 않게 Worker가 서버 값과 다른 것만 준다

## 메뉴 (`feat-nav-worklog`가 합쳐진 뒤)
- MENU 차례: 대시보드 · 통계 · 청구 · 고시·공지 · 환자 · 업무일지 · 수납일지 · **예약**(`/calendar`, ready, primary) · AI 리포트 · 서식 · 직원 · 재고 · 주소록 · 설정 → 전체 14, 주요 일곱(대시보드·통계·청구·환자·업무일지·수납일지·예약). 시안 탭 줄과 같다
- `MenuLabel`·`MenuPath`·`MenuHref`에 예약을 더하고, 메뉴를 고정한 시험(`shell`·`tabFrame`·`titles`·`notFound`·`notReadyPages`·`notReadyFeatures`·`features`·`DashboardHome`·`sample`·`DashboardPreview`)은 수만 맞춘다

## 수납일지 건강생활 (도우미 + 웹)
- `SunapTargets.cs`: `Version = 3`, 줄 끝에 `Math.Max(Won(row.Health), 0)` 한 칸. 지금 rows 11칸 `[chart, name, time, kind, cash, card, check, misu, codes, rsv, doctor]` → 12칸
- `src/types/sunap.ts`: `SunapReplyRowV3 = [...SunapReplyRowV2, health: number]`, `SunapReply`에 v:3, `LedgerRow.health: number`(v1·v2는 0). `src/workers/sunap/read.ts`는 v1·v2·v3를 받는다
- `ledger.ts`: `free = cash·card·transfer·unpaid 모두 0 && health === 0`. `dayTotals`의 free_n은 그 `free`로 센다(서버 칸 그대로, 이미 마감한 날 숫자는 안 바뀜)
- `LedgerRows.tsx`: 네 칸이 0이고 health > 0이면(고친 금액 칸 없을 때) FREE 칩 자리에 `건강생활 · {won(health)}원` 칩, 범례에 '건강생활 = 건강생활유지비로 낸 돈'. `SunapCards.tsx` FREE 줄은 `free_n` 그대로

## 예 (시험 숫자)
- `layoutDay`: A 14:00–14:30, B 14:20–14:40, C 14:30–15:00, D 15:00–15:30 → A {col 0, cols 2, span 1}, B {1, 2, 1}, C {0, 2, 1}, D {0, 1, 1}. E 09:00–09:30, F 09:00–09:10, G 09:10–09:20 → E {0, 2, 1}, F {1, 2, 1}, G {1, 2, 1}. K 11:00–12:00, L 11:00–11:30, M 11:00–11:30, N 11:30–12:00 → K {0, 3, 1}, L {1, 3, 1}, M {2, 3, 1}, N {1, 3, 2}(그 시간에 셋째 열이 비어 넓힘)
- `monthCells`(오늘 11/17): 11/16 = 도수 2(하나는 auto noshow)·주사 1(status noshow)·취소 도수 1 → 예약 3, 도수 2·주사 1, 안 옴 2, 변경 0. 11/18 = 도수 2·주사 1·진료 1(11/17에서 옮겨 옴)·취소 도수 1(11/19에서 옮겨 옴) → 예약 4, 안 옴 null, 변경 1, 종일 '(나) 휴무'
- `rateSummary`: 10줄(취소 2, 처음 자리 있음 1(취소 아님), noshow 1) → 예약 10 · 취소 2 (20.0%) · 변경 1 (10.0%) · 안 옴 1 (10.0%). 3줄 중 1 → 33.3%, 2/3 → 66.7%, 0줄 → '–'
- `arrivalOf`(11/17 10:40): 09:30+30분 차트 10231·접수 있음 → came, 09:30+30분 접수 없음 → noshow, 10:30+30분 접수 없음 → null, 차트 없음 → null, status came → null

## 위험
- 비트 `PbsSexTyp` 값 모양·이름 찾기 속도를 아직 실제로 보지 않았다 → TASK-2가 `ssk-bit-db-probe`로 값 종류 개수·걸린 시간만 본다(이름·차트번호는 출력하지 않는다)
- 비트 PC가 하나도 켜져 있지 않은 날은 도착이 '아직'으로 남는다(폰은 비트 PC가 적은 값만 본다)
- 30분 자동 로그아웃은 그대로라 접수 PC가 오래 손대지 않으면 로그인 화면이 된다(5초 읽기는 움직임으로 치지 않는다)
- 무료 플랜 요청량: 5초 rev 읽기와 통계 칸 12달 읽기(하루 100건이면 약 3만 줄, 1,000줄씩 30번)는 작다고 보지만 첫 주에 Supabase 사용량 화면을 한 번 본다
- 같은 예약을 두 PC가 동시에 고치면 나중 저장이 이긴다(고친 기록 없음)
- `feat-nav-worklog`가 합쳐지기 전에 Phase 3을 시작하면 메뉴 수가 다르다 → Phase 3 전에 합친다

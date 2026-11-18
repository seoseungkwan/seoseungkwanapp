# 설계: 시연 피드백 — 데스크 계정·다음 예약 번호·물리치료 칸

## 개요
- 네 덩어리는 서로 따로 돈다. ①·②는 서버·도우미를 바꾸지 않는 화면 일이고, ③·④(데스크 계정)만 새 SQL이 있다.
- **도우미 변경 없음.** ②가 쓰는 묶음별 환자 수는 대시보드 비트 읽기가 이미 만든다(아래 ②). 도우미 0.11.0(stats-insights TASK-5)과 상관없다.
- 데스크는 "화면 숨기기 + 서버 막기" 두 겹이다. 서버 쪽은 `my_hospital_id()`(원장 전용)를 건드리지 않고, 데스크에게 열 표에만 새 정책을 더한다. 그래서 다른 표 25개 남짓은 데스크에게 저절로 닫혀 있다.

## 흐름
1. ① 장부 다음 예약 칸 키 → `rsvKeys.ts`(순수) → 지금의 장부 고치기 길(`onEdit` → Worker 패치). 서버 없음.
2. ② `LiveDashboard` → `readDashboardGroups()`(통계 묶음 + 수납일지 설정의 `ptGroup`) → `BitDashboard` → `DailySection ptKey` → `ptCount`(하루 줄 `groups`).
3. ③ 설정 '데스크 계정' → `add_desk_member` / `desk_members` / `remove_desk_member` → 표 `hospital_members`.
4. ④ 데스크 구글 로그인 → `/auth/callback`(그대로) → `/dashboard` → (app) 레이아웃 문지기: `readMe()` → 내 병원 줄 없음 → `my_desk()` → `desk` → gate 'desk' → `AppShell desk` → `DeskGate`가 '/dashboard'를 '/sunap'으로 바꿈. 세 탭 화면은 지금처럼 브라우저 Supabase를 쓰고 RLS 데스크 정책이 그 병원 줄만 준다.

## ① 다음 예약 번호 고르기 (TASK-3)
새 파일 `src/components/sunap/rsvKeys.ts`(순수, 환자 값을 받지 않는 `labels.ts`와 같은 자리. `components/sunap/rows` 울타리 안에서 불러도 된다):
```ts
export type RsvChoice = 'bit' | HandRsvKind
export type RsvKeyChoice = { key: string /* '0'~'9' */; choice: RsvChoice; label: string }
export const RSV_KEY_TIP = '판이 열려 있을 때도 숫자 키를 치면 바로 고르고 닫혀요.'
export function rsvKeyChoices(kinds: readonly RsvKindDef[]): RsvKeyChoice[] // 0 bit · 1 none · 2~9 = kinds[0..7]
export function rsvNow(row: LedgerRow, kinds: readonly RsvKindDef[]): RsvChoice // RsvPicker의 now 식을 옮김
export function rsvPatchFor(row: LedgerRow, kinds: readonly RsvKindDef[], choice: RsvChoice): LedgerPatch | null // 같으면 null
export function rsvKeyPatch(row: LedgerRow, kinds: readonly RsvKindDef[], key: string): LedgerPatch | null
```
- `LedgerRows.tsx`: 다음 예약 칸 단추에 `data-rsv-cell`·`aria-describedby={번호표 id}`·`onKeyDown`. Ctrl·Alt·Meta가 눌렸으면 그냥 둔다. 숫자면 `rsvKeyPatch` → 있으면 `onEdit(row.chart, patch)` + `preventDefault`. `ArrowDown`이면 표 안 `[data-rsv-cell]` 단추들(DOM 차례 = 세운 차례)에서 다음 것에 `focus()` + `preventDefault`. 판을 닫는 `close()`는 그 줄 단추로 초점을 돌린다(줄 열쇠 = 차트번호).
- 번호표: `PanelHead`와 표 사이 `<p id>` 한 줄, 고칠 수 있고 줄이 있을 때만. `kbd` 모양은 `components/claim/rows/MemoDetail.tsx`의 `kbdPlain`과 같은 토큰(`border-line-strong bg-surface text-ink-2`)을 rows 안 상수로 둔다. 차례 1·2·…·0.
- `RsvPicker.tsx`: `now`를 `rsvNow`로. 선택지 줄 앞에 `kbd` 칸(번호 없으면 빈 칸, 줄 칸 모양 `22px 18px 1fr auto`). 판 안 감싸개 `onKeyDown`에서 숫자면 `rsvPatchFor` → 있으면 `onPick` → `onClose`. 안내 글 둘(지금 것)에 `RSV_KEY_TIP` 한 줄을 더한다.
- 마감한 날은 칸이 단추가 아니라 키·번호표가 없다(지금 그대로).

## ② 대시보드 물리치료 칸 (TASK-2)
- **기준 = 수납일지 '물리치료' 칸과 같음**: 그 병원 수납일지 설정의 `ptGroup`(통계 처방 묶음 id)을 열쇠로 바꾼 것(`SunapScreen`의 `defOf`와 같은 식 `groupDefs([묶음])[0]?.id ?? null`). 대시보드 비트 읽기는 이미 통계 묶음 정의(`groupDefs(rows)`)를 모두 싣고, 하루 줄 `DayPayload.groups`에 묶음별 `patients`(그날 그 묶음 처방을 받은 환자 수, `groupMatches`와 같은 규칙 — sunap-ilji AC-4906.4 시험이 증명)가 있다. 도우미·Worker·저장 모양은 바뀌지 않는다. 묶음 처방이 없는 날은 `groups`에 그 열쇠 줄이 없다 → 0.
- `live/rxGroups.ts`:
  ```ts
  export type DashboardGroups = { lines: RxGroupLine[]; defs: RxGroupDef[]; pt?: string | null }
  export function toDashboardGroups(rows: readonly StatsRxGroup[], ptGroup?: string | null): DashboardGroups
  export async function readDashboardGroups(): Promise<DashboardGroups | null>
  ```
  `readDashboardGroups`는 `listStatsRxGroups()`와 따로 감싼 `loadSunapSettings(supabaseBrowser())`를 함께 기다린다. 설정 쪽은 어떤 실패(동기 던짐 포함)도 `undefined`로 바꿔 `pt`만 비운다. 묶음 쪽 실패는 지금처럼 null.
- `summary/view.ts`: `export function ptCount(day: string, days: readonly DayPayload[], key: string): number | null` (`rowOn` 재사용).
- `summary/DailySection.tsx`: prop `ptKey?: string | null`(undefined = 모름 → '자료 없음', null = 안 고름 → `PT_UNSET = '수납일지 설정에서 묶음을 고르면 나와요'`). `countCells`에 재진 뒤 '물리치료' 칸. `KPI_ROW` `grid-cols-6`(768px 미만 `grid-cols-2`), `KPI_CELLS` 여섯(768px 미만: 홀수 칸 왼쪽 0·세로선 없음, 둘째 줄부터 위 1px 선, 지금 다섯째 칸의 두 칸 폭은 없앰). '숫자 5개와 보고 문장에 적용' → '숫자 6개와 보고 문장에 적용'. 보고 문장·`TodayCounts`는 그대로.
- `live/BitDashboard.tsx`: `groups`가 'pending'·null이면 `ptKey` 없음, 아니면 `groups.pt`를 `DailySection`에 넘긴다. `LiveDashboard.tsx`는 고치지 않는다.
- `live/DashboardSkeleton.tsx`: 숫자 줄 `md:grid-cols-6`, 칸 여섯.
- `live/visitBasis.test.ts`: **visitBasis.test.ts의 SQL 글 기대값에 new-mark NewMark 칸을 더함(new-mark TASK-1 뒤 깨진 시험 고침).** 'AC-602.2·AC-4401.2 SQL 글' 시험의 기대 글에서 `First90` 바로 뒤에 `,SUM(CASE WHEN o.OcmDgsNfs='1' THEN 1 ELSE 0 END) NewMark`를 더한다. `StatsSql.cs`는 고치지 않는다. 나머지 기대(HASH 하나, Visits 글에 OcmDgsNfs 없음)는 그대로.

## ③④ 데스크 계정 — DB (TASK-1, `supabase/migrations/20261118100000_desk_accounts.sql`)
본보기 `20261116000000_sunap.sql`·`20261117010000_calendar.sql`. `if not exists`·`create or replace`·`drop policy if exists`로 두 번 실행해도 그대로. 앞에 auth·precheck_settings(`my_hospital_id`)·worklog 넷·stats_rx_groups 둘·sunap·calendar가 들어가 있어야 한다.
- 표 `hospital_members`: `id uuid pk default gen_random_uuid()`, `hospital_id uuid not null references hospitals(id) on delete cascade`, `email text not null unique check (email = lower(btrim(email)) and char_length(email) between 3 and 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')`, `role text not null default 'desk' check (role = 'desk')`, `created_at timestamptz not null default now()`. 색인 (hospital_id). RLS 켬, `revoke all … from anon, authenticated`, 정책·표 권한 없음(함수로만).
- 함수(모두 `security definer`, `set search_path = ''`, public·anon에서 거두고 authenticated에 실행 권한):
  - `my_desk_hospital_id() returns uuid stable` — `hospital_members m join hospitals h on h.id = m.hospital_id and h.status = 'approved' where m.email = lower((select auth.jwt()) ->> 'email') and not exists (select 1 from hospitals o where o.owner_id = (select auth.uid()))`. 자기 병원 줄이 있으면(어느 상태든) 데스크가 아니다.
  - `my_clinic_hospital_id() returns uuid stable` — `coalesce(public.my_hospital_id(), public.my_desk_hospital_id())`.
  - `my_desk() returns table (hospital_id uuid, hospital_name text) stable` — 그 병원 id·이름 한 줄(문지기가 읽음).
  - `add_desk_member(p_email text) returns text volatile` — 원장(`my_hospital_id()` not null)이 아니면 `raise … errcode '42501'`. 메일 = `lower(btrim(coalesce(p_email, '')))`. 차례: 모양 틀림 'bad' → 그 병원 줄을 `for update`로 잡아 같은 병원 동시 더하기를 줄 세움 → `hospitals.email`(lower, 어느 상태든)과 같으면 'taken' → 어느 병원 `hospital_members`에 있으면 'used' → 그 병원 줄이 5개 이상이면 'limit' → 넣고 'added'.
  - `desk_members() returns table (id uuid, email text, created_at timestamptz, signed_in_at timestamptz) stable` — `where m.hospital_id = public.my_hospital_id()`(원장 아니면 빈 목록), `signed_in_at = (select u.last_sign_in_at from auth.users u where lower(u.email) = m.email and u.last_sign_in_at > m.created_at)`, `order by created_at, id`.
  - `remove_desk_member(p_id uuid) returns void volatile` — `delete … where id = p_id and hospital_id = public.my_hospital_id()`.
- 데스크 정책(새 이름 '데스크 …', `hospital_id = (select public.my_desk_hospital_id())`, 기존 정책·글자는 그대로 두고 더하기만):
  - `for all`(실제로 되는 것은 지금 표 권한대로): `worklog_days`·`sunap_days`·`sunap_spends`·`sunap_settings`·`calendar_settings`·`calendar_appts`·`calendar_allday`
  - `for select`: `worklog_settings`(시재 설정은 설정 탭 몫)·`stats_rx_groups`(수납일지가 Block·물리치료 묶음 정의로 읽음. 빠지면 마감 때 Block·물리치료가 0으로 올라가는 숨은 위험)·`calendar_rev`
- 넣는 표 일곱(위 `for all` 일곱)의 `hospital_id` 기본값을 `public.my_clinic_hospital_id()`로 바꾼다(`alter table … alter column hospital_id set default …`). 원장에게는 값이 같다.
- `calendar_bump()`·`calendar_appts_prune()`를 `create or replace`로 같은 글에 `my_hospital_id()` 자리만 `my_clinic_hospital_id()`로 바꿔 다시 만든다(실행 권한 거둠도 그대로). 안 바꾸면 데스크가 바꿔도 다른 PC가 새로 읽지 않고 1년 지우기도 안 한다.
- `hospitals`에 restrictive 정책 하나: `create policy "데스크 메일은 병원 가입 못 함" on hospitals as restrictive for insert to authenticated with check ((select public.my_desk_hospital_id()) is null)`. 기존 정책 글은 그대로.
- **`my_hospital_id()`는 다시 만들지 않는다**(여러 파일에 같은 글이 있고 시험이 그 글을 본다).

## ③ 설정 '데스크 계정' 칸 (TASK-6)
- `src/types/desk.ts`: `DeskMember = { id: string; email: string; addedAt: string; signedInAt: string | null }`, `DeskAddResult = 'added' | 'bad' | 'taken' | 'used' | 'limit'`, `DESK_MAX = 5`.
- `src/lib/storage/desk.ts`(브라우저 → RLS·함수, `lib/storage/sunap.ts`와 같은 모양): `type Client = Pick<SupabaseClient, 'rpc'>`, `class DeskStorageError(kind: 'offline' | 'failed')`, `deskEmail(text): string | null`(앞뒤 빈칸 빼고 소문자, 모양·254자 검사), `listDeskMembers(client)`, `addDeskMember(client, email)`, `removeDeskMember(client, id)`. 답 글자가 다섯 가운데 하나가 아니면 failed.
- `src/components/settings/DeskAccounts.tsx`('use client'): 시안 ③ 그대로. 모양은 `ds.panel`·`ds.button.primary`([더하기])·`ds.button.secondarySmall`([빼기]), 상태 글은 '로그인함 · {M/D}'가 positive 600, '아직 로그인 안 함'이 muted. 메일 칸에는 화면 읽기용 이름 '데스크 구글 메일'. 줄 날짜 = `todayInKorea(new Date(signedInAt))`의 월/일. 오류는 `ErrorCard`. `SettingsPage.tsx` 맨 아래(`CashFloatSetting` 다음)에 놓는다. 설정 화면은 원장만 오므로(데스크는 DeskGate가 막음) 따로 거르지 않는다.
- `lib/errors.ts`·`types/errors.ts`에 여섯:

| 번호 | 무엇이 | 어떻게 고치나 |
|---|---|---|
| E-DESK-READ-FAILED | 데스크 계정 목록을 불러오지 못했어요 | 인터넷 연결을 확인하고 [다시 불러오기]를 눌러 주세요. |
| E-DESK-SAVE-FAILED | 데스크 계정을 바꾸지 못했어요 | 인터넷 연결을 확인하고 다시 눌러 주세요. 계속되면 오류 번호와 함께 문의해 주세요. |
| E-DESK-EMAIL-BAD | 메일 주소 모양이 아니에요 | 데스크가 로그인할 구글 메일 주소를 그대로 적어 주세요. |
| E-DESK-EMAIL-TAKEN | 이미 병원 계정으로 가입된 메일이에요 | 병원 계정은 데스크가 될 수 없어요. 데스크용 다른 구글 메일을 적어 주세요. |
| E-DESK-EMAIL-USED | 이미 데스크 계정으로 더한 메일이에요 | 목록을 확인해 주세요. 다른 병원의 데스크 메일이면 그 병원에서 먼저 빼야 해요. |
| E-DESK-LIMIT | 데스크 계정은 5개까지예요 | 쓰지 않는 계정을 [빼기]한 뒤 더해 주세요. |

## ④ 데스크 로그인 — 문지기 (TASK-5)
- `lib/auth/hospital.server.ts`: `export type Desk = { hospitalId: string; hospitalName: string }`, `Me`에 `desk?: Desk`(선택 칸 — 지금 시험들의 `Me` 흉내가 그대로 맞는다). 병원 줄이 null일 때만 `supabase.rpc('my_desk')`. 오류면 `HospitalReadError`. 쓰기 없음.
- `lib/auth/gate.ts`: `HospitalState`에 'desk'. `case 'desk'`: '/login'·'/signup'·'/pending'·`isAdminPath` → '/sunap', 그 밖 null. 레이아웃은 지금처럼 '/dashboard'로 판정하므로 데스크의 '/dashboard'를 여기서 돌리지 않는다(돌리면 모든 화면이 수납일지로 간다) — 화면 쪽 `DeskGate`가 바꾼다.
- `lib/auth/guard.server.ts`: 상태 = `me.hospital?.status ?? (me.desk ? 'desk' : 'none')`.
- `app/(app)/layout.tsx`: `approvedMe()` → 원장(승인) 또는 데스크(병원 줄 없음 + desk)일 때 `{ name, email, isAdmin, desk }`, 아니면 지금처럼 던짐. 데스크는 `isAdmin: false`. `generateMetadata`도 같은 이름.
- `app/(app)/stats/page.tsx`·`app/(app)/claim/setup/page.tsx`: `me.desk`면 `return null`(던지면 앱 틀 대신 오류 화면이 뜬다). 다른 페이지는 서버에서 내 줄을 읽지 않아 그대로다. `/admin`은 gate가 '/sunap'으로 보낸다.
- AI 경로들은 `readMe().hospital`이 승인일 때만 열어 데스크는 이미 403이다(코드 그대로, 시험 하나로 증명).

## ④ 데스크 화면 (TASK-4)
- `components/shell/menu.ts`: `DESK_MENU`(PRIMARY_MENU에서 업무일지·수납일지·예약), `DESK_HOME = '/sunap'`, `isDeskPath(pathname)`(`isUnder`로 세 주소).
- `components/shell/role.tsx`('use client'): `RoleProvider({ desk, children })`, `useDesk(): boolean`(기본 거짓 → 원장 화면·지금 시험 그대로).
- `components/shell/DeskGate.tsx`('use client'): `usePathname`·`useRouter`. '/dashboard'면 `useEffect`에서 `router.replace(DESK_HOME)`하고 null, `isDeskPath`면 children, 아니면 `DeskBlocked`(같은 파일: `ds.panel` 가운데 정렬 카드, 제목 h1 '데스크 계정은 볼 수 없는 화면이에요', 글 '업무일지 · 수납일지 · 예약만 쓸 수 있어요.', `Link` `ds.button.primary` '수납일지로 가기' → '/sunap').
- `AppShell.tsx`: prop `desk?: boolean`. 참이면 `TabBar desk`, `AccountMenu desk`, 본문을 `<RoleProvider desk><DeskGate>{children}</DeskGate></RoleProvider>`로 감싼다. 거짓·없음이면 지금 그대로.
- `TabBar.tsx`: prop `desk?: boolean` → 탭 띠 = `DESK_MENU`, `MoreMenu`를 그리지 않는다. `AccountMenu.tsx`: prop `desk?: boolean` → 단추 안 메일 앞(768px 미만에서도)과 메뉴 머리에 `ds.chip.warning` '데스크'.
- 링크 숨김: `worklog/BitNotice.tsx`의 '연결하러 가기', `sunap/SunapSettings.tsx`의 '처방 묶음 고치러 가기 →'를 `useDesk()`가 참이면 그리지 않는다. 수납일지 [설정]·예약 [예약 설정]의 고르기·[저장]은 그대로(사용자 결정).

## 결정과 트레이드오프
- **메일로 맞춘다(사용자 id 잇기 없음)**: 첫 로그인 때 사용자 id를 적으려면 로그인 콜백이나 문지기가 DB에 써야 하는데 ADR-004는 읽기만 허용한다. Supabase는 같은 메일을 계정 하나로 묶고 구글 메일은 확인된 메일이라 메일로 맞춰도 된다. '로그인함'은 `auth.users.last_sign_in_at`을 원장 전용 함수가 읽어 낸다. 트레이드오프: Supabase 인증 설정의 '메일 확인(Confirm email)'을 끄면 남이 그 메일로 가입해 데스크가 될 수 있다 → 끄지 않는다(ADR에 적음).
- **`my_hospital_id()` 그대로 + 데스크 정책 열**: `my_hospital_id()`에 데스크를 넣으면 한 번에 모든 표(통계·매출·청구·AI·서식)가 데스크에게 열린다. 정책을 더하는 쪽은 열 표를 하나하나 고르는 대신, 앞으로 세 탭에 새 표가 생기면 그 표에도 데스크 정책을 더해야 한다.
- **표 권한 없이 함수 넷**: 원장도 다른 병원 메일(가입 신청 여부)을 보지 못해 확인은 정의자 함수만 할 수 있다. 읽기·빼기도 함수로 모아 표 권한을 0으로 둔다.
- **막힌 화면은 화면 쪽(`DeskGate`)**: (app) 레이아웃은 지금 주소를 모르고 옆 화면으로 옮길 때 다시 그려지지 않는다. 주인 화면들을 경로 묶음 `(owner)`로 옮기면 페이지·시험 파일 수십 개가 움직인다. `usePathname`으로 거르는 한 파일이 가장 작다. 자료는 RLS가 막으므로 화면 막기를 빠져나가도 보이는 것이 없다.
- **첫 화면 수납일지**: 콜백은 그대로 '/dashboard'로 보내고 `DeskGate`가 '/sunap'으로 바꾼다(콜백·대시보드 페이지를 고치지 않는다). 잠깐 빈 본문이 보일 수 있다.
- **물리치료 = 수납일지 기준**: 사용자 결정. 비트 '과별초재진'의 물리치료(진찰료 산정안함 + 물리치료)와 다르고, 비트보다 많게 나온다(11-18 약 9명 vs 1명).

## 위험 / 미해결 질문
- **배포 순서**: SQL 없이 웹을 올리면 병원 줄 없는 사용자(새 가입자·데스크)의 `readMe`가 `my_desk`를 못 불러 오류 화면이 된다 → 반드시 SQL 먼저.
- `20261117010000_calendar.sql`을 나중에 다시 붙여 넣으면 `calendar_bump`·`calendar_appts_prune`가 옛 글로 돌아간다 → 그때는 이 파일도 다시 붙여 넣는다(파일 머리 주석에 적는다).
- 데스크 PC의 확장·도우미 설치와 비트 PC 연결(/claim/setup·설치 파일)은 데스크가 못 연다 → 원장 계정으로 그 PC에서 먼저 하고 로그아웃한 뒤 데스크로 로그인한다.
- 데스크를 [빼기]하면 그 PC는 다음 읽기·저장부터 실패하고, 다음 화면 이동 때 가입 신청 화면으로 간다(가입 신청을 보내도 관리자 승인이 있어야 한다).
- 대시보드 물리치료는 비트 처방 기준이라 수납일지에서 손으로 고친 물리치료 표시는 들어가지 않는다. 물리치료 묶음을 만들기 전에 저장한 날(폰 등 비트 없는 기기에서 보는 저장 숫자)은 0으로 보인다.
- 시안의 '재진 중' 글을 뺀 것, 거절된 신청 메일도 거절하는 것은 사용자 확인 대상이다(requirements.md '시안과 다르게 정한 것').

## 배포 순서
1. 모든 TASK를 합친 뒤 전체 검사(`npm test`·`npm run lint`·`npm run build`, ssk-finish-check).
2. 사용자: Supabase SQL Editor에 `supabase/migrations/20261118100000_desk_accounts.sql` 전체를 붙여 넣고 Run(`20261116000000_sunap.sql`·`20261117010000_calendar.sql`이 이미 들어가 있어야 함). Claude는 실제 Supabase에 붙지 않는다.
3. 웹 배포(ssk-deploy). 도우미·확장 새 판은 없다.
4. 원장 계정 [설정] → '데스크 계정'에 데스크 메일을 더하고, 데스크 PC에서 그 메일로 로그인해 세 탭·막힌 화면을 확인한다.

## ADR-031 (TASK-1이 `docs/ADR.md` 끝에 넣는 글)
### ADR-031: 데스크 계정 — 병원마다 '데스크' 역할 계정을 따로 둔다 (plan.md §10 "직원·원장 계정과 역할"을 다시 꺼냄)
**맥락**: plan.md §0-1·§10은 혼자 쓰는 MVP라 직원 계정·역할(구성원 표)을 2차로 미뤘다. 2026-11-18 시연(ERP 업체 부장님)에서 데스크 PC는 업무일지·수납일지·예약만 봐야 한다는 말이 나왔고, 사용자가 "데스크 계정 따로"(서버가 막음)를 골랐다. 원장 계정을 데스크 PC에 같이 쓰면 통계·매출·청구가 다 보인다
**결정** (사용자, `specs/desk-feedback`):
- 역할은 '데스크' 하나다. 원장(병원 계정 = `hospitals.owner_id`)이 설정에서 데스크 구글 메일을 5개까지 더하고 뺀다. 그 메일로 로그인하면 가입 승인 없이 그 병원의 데스크다. 표 `hospital_members`(병원·메일·역할 'desk'), 사용자 표 권한은 없고 정의자 함수(`add_desk_member`·`desk_members`·`remove_desk_member`·`my_desk`)로만 다룬다
- 데스크는 로그인 메일(JWT의 email)로 맞춘다. 사용자 id는 적지 않는다(로그인 콜백·문지기가 쓰지 않게)
- `my_hospital_id()`는 그대로 원장 전용이다. 데스크는 `my_desk_hospital_id()`와 '데스크 …' 정책이 연 표에서만 읽고 쓴다: `worklog_days`·`sunap_days`·`sunap_spends`·`sunap_settings`·`calendar_settings`·`calendar_appts`·`calendar_allday`(표 권한대로), `worklog_settings`·`stats_rx_groups`·`calendar_rev`(읽기). 이 표들의 `hospital_id` 기본값과 예약 트리거 둘은 `my_clinic_hospital_id()`(원장 먼저, 아니면 데스크)
- 이미 병원 가입 신청(승인·대기·거절)이 있는 메일은 데스크가 될 수 없고, 데스크 메일은 병원 가입 신청을 못 한다(restrictive 정책). 기존 계정을 데스크로 바꾸는 것은 미룸(사용자 결정 미룸, 2026-11-18)
- 화면: 탭 셋(업무일지·수납일지·예약), 첫 화면 수납일지, 다른 주소는 막힌 화면(`DeskGate`). AI 경로는 원장만(그대로)
- ADR-004 덧붙임: 페이지 문지기(`readMe`)는 내 병원 줄이 없을 때 `my_desk()`로 내 데스크 줄을 읽는다. 쓰지 않는다
**이유**: 데스크 PC에서 원장 자료가 보이지 않아야 하고, 주소를 쳐도 서버가 주지 않아야 한다 **(사용자, 2026-11-18)**
**대안**: (1) `my_hospital_id()`에 데스크를 넣기 — 모든 표가 한꺼번에 데스크에 열린다. (2) 화면만 숨기기 — 주소·개발자 도구로 자료가 보인다. (3) 직원 PIN — 계정·세션 구조를 새로 만들어야 한다. (4) 첫 로그인 때 사용자 id 적기 — 콜백·문지기가 DB에 써야 한다
**트레이드오프**: 데스크 구글 메일이 서버(Supabase 서울)에 남는다(환자 정보 아님). 메일로 맞추므로 Supabase 인증의 메일 확인(Confirm email)을 끄지 않는다. 세 탭에 새 표가 생기면 그 표에도 데스크 정책을 따로 더해야 한다. 데스크 PC의 확장·도우미 설치와 비트 PC 연결은 원장 계정으로 한다. `20261117010000_calendar.sql`을 다시 붙여 넣으면 이 SQL도 다시 붙여 넣어야 한다
**바꾸는 것**: `plan.md` §0-1·§2-1·§5 DB 표·§10, `CLAUDE.md` 인증 예외 줄(내 병원·관리자·데스크 줄, ADR-004·ADR-031), `docs/ARCHITECTURE.md` DB 표·인증

**`CLAUDE.md`에서 바꿀 글**: 셋째 CRITICAL 줄의 "세션과 내 병원·관리자 줄만 읽고 쓰지 않는다 (ADR-004)" → "세션과 내 병원·관리자·데스크 줄만 읽고 쓰지 않는다 (ADR-004·ADR-031)". 그 밖은 그대로.

# 설계: 수납일지 장부 다른 기기에서 보기(계정마다)

> 기능 ID: `sunap-phone` · 요구사항: `requirements.md` (REQ-6501~6508) · 결정 기록: ADR-033(아래 글 그대로 `docs/ADR.md` 끝에 붙임)

## 0. 시안 없음 (사용자 지시)
- 사용자 2026-11-18: **"시안만들지말고 바로 해"**. 이 기능은 클릭 목업 없이 바로 만든다(`CLAUDE.md` '화면은 클릭 목업을 사용자가 승인한 뒤에만 구현한다'의 이 기능만의 예외, 사용자 지시).
- 그래서 새 모양을 만들지 않고 지금 부품을 그대로 쓴다:
  - 계정 목록 = 설정 탭 `components/settings/DeskAccounts.tsx`의 목록 모양(`ds.panel` 칸·`ds.panelTitle` 제목·`rounded-control border border-line` 목록·줄마다 메일과 상태, 실패는 `ErrorCard` + [다시 불러오기]). 스위치 = `components/stats/sections/RoughSwitch.tsx`의 `role="switch"` 단추 모양(색은 수납일지 토큰 `bg-accent`·`bg-line-strong`).
  - 다른 기기 화면 = 지금 `RemoteView`(잠금 줄·합계 카드·'아직 마감 전이에요'·지출 목록·자물쇠 카드).
  - 읽기 전용 장부 = 지금 `rows/LedgerRows`(새 `readOnly`) + `rows/PaidRows`, 접수 PC 장부 화면과 같은 두 칸 배치.
- 화면 글자는 아래 '화면 글자'가 정한다(따옴표 안 그대로, `{ }`는 바뀌는 값). 말투는 '~해요'.

## 1. 한눈에
```
[접수 PC: 도우미·비트 있음, 모드 ledger]                 [다른 기기: 모드 device·old-helper]
 Worker 장부 보기(불러오기·고치기·마감·마감 풀기)          useSharedLedger(day)
   └ useShareUpload: 5초 기다림(마감은 바로)                  ├ sunap_share_status() → can_view?
        ├ sunap_share_status() → sharing?                     ├ 31일 안?
        └ saveSunapCopy → toSharedLedger(고른 칸만)           └ loadSunapCopy → readSharedLedger
             → rpc save_sunap_copy (정의자 함수)                    → RemoteView + rows/SharedLedgerPanel(보기만)
                         │                                                   ▲
                         ▼                                                   │ RLS: 켠 계정 + 31일 안만
              sunap_ledger_copies (병원·날 한 줄) ───────────────────────────┘
              sunap_share_viewers (켠 스위치 한 줄 = 한 계정)  ← 원장: 수납일지 [설정] '다른 기기에서 장부 보기'
```
- 접수 PC는 지금과 똑같이 장부를 PC 안(도우미 암호화)에 두고, 켠 계정이 있을 때만 **사본**을 서버에 하나 더 둔다. 고치기·마감은 사본과 상관없다.
- 다른 기기는 사본을 읽기만 한다. 마감 상태·합계·지출은 지금처럼 `sunap_days`·`sunap_spends`에서 읽는다(사본에는 마감 표시가 없다).

## 2. 서버 (`supabase/migrations/20261118200000_sunap_share.sql`, TASK-1)

### 2-1. 머리 주석 (AC-6501.8)
- 첫 줄: `-- 수납일지 장부 다른 기기에서 보기: 켠 계정(sunap_share_viewers)·장부 사본(sunap_ledger_copies)·정의자 함수 다섯·트리거 둘`, 둘째 줄 `-- (spec sunap-phone REQ-6501, ADR-033)`.
- 실행 방법: 'Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다)'.
- 앞 migration: auth·precheck_settings(my_hospital_id())·업무일지 넷·stats_rx_groups 둘·`20261116000000_sunap.sql`·`20261117010000_calendar.sql`·`20261118100000_desk_accounts.sql`(hospital_members·my_desk_hospital_id()·my_clinic_hospital_id()). 이 셋 함수와 hospital_members는 여기서 다시 만들지 않는다.
- '두 번 붙여 넣어도 그대로다(표·색인은 없을 때만 만들고, 함수·트리거는 바꿔 쓰고, 권한은 거두고 다시 주고, 정책은 지우고 다시 만든다. 이미 있던 줄은 그대로)'.
- 관문: '이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다'.
- 무엇을 왜(ADR-033): 켠 계정만·장부 칸만·전화·주민번호·주소·진료의·처방코드·비트 예약 메모 없음·쓰기는 save_sunap_copy 하나·31일.
- 지우기: '예약 작업(pg_cron)·확장 기능을 쓰지 않는다. 사본을 저장할 때마다 트리거가 모든 병원의 한국 날짜 오늘 − 30일보다 이른 줄을 지우고, 읽기 정책은 그런 줄을 처음부터 주지 않는다. 마지막 켠 스위치가 없어지면(끄기·데스크 줄 빼기) 그 병원 사본을 바로 지운다'.
- 줄 끝은 LF.

### 2-2. 표
```sql
-- 켠 스위치 한 줄 = 한 계정. member_id null = 원장(병원 계정), 아니면 그 데스크 줄
create table if not exists public.sunap_share_viewers (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  member_id uuid references public.hospital_members (id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists sunap_share_viewers_owner on public.sunap_share_viewers (hospital_id) where member_id is null;
create unique index if not exists sunap_share_viewers_member on public.sunap_share_viewers (member_id) where member_id is not null;
alter table public.sunap_share_viewers enable row level security;
revoke all on table public.sunap_share_viewers from anon, authenticated;   -- 정책 없음. 함수로만

-- 병원·날 장부 사본 한 줄
create table if not exists public.sunap_ledger_copies (
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  work_date date not null,
  ledger_rows jsonb not null,
  paid_rows jsonb not null default '[]'::jsonb,
  rsv_kinds jsonb not null,
  sent_at timestamptz not null default now(),
  primary key (hospital_id, work_date),
  check (octet_length(ledger_rows::text) < 400000 and octet_length(paid_rows::text) < 30000 and octet_length(rsv_kinds::text) < 4000),
  check (public.sunap_copy_ok(ledger_rows, paid_rows, rsv_kinds))
);
alter table public.sunap_ledger_copies enable row level security;
revoke all on table public.sunap_ledger_copies from anon, authenticated;
grant select on table public.sunap_ledger_copies to authenticated;          -- 넣기·고치기·지우기 권한 없음
```
- `sunap_copy_ok`는 표보다 먼저 만든다(check가 부른다).

### 2-3. 함수 (모두 `set search_path = ''`, 이름은 스키마까지 적음)
| 함수 | 모양 | 하는 일 | 실행 권한 |
|---|---|---|---|
| `sunap_copy_ok(p_rows jsonb, p_paid jsonb, p_kinds jsonb) returns boolean` | plpgsql **immutable** | 셋 다 배열·줄 수(400·100·10)·열쇠 모음(아래 '열쇠')·rsv 객체 열쇠·name 1~40자 글자·chart 1~20자 글자·note 글자 100자 이하(미수 입금 줄 name·chart도 같은 모양)·종류 id 1~40자·label 1~10자 글자·counts 참거짓. `stats_rx_group_parts_ok`처럼 `jsonb_array_elements` 돌기 | 아무에게도 안 줌 |
| `sunap_share_view_hospital() returns uuid` | sql stable **definer** | 이 사용자 자기 스위치가 켜져 있으면 그 병원 id, 아니면 null: 원장 = `member_id is null and hospital_id = my_hospital_id()`, 데스크 = 그 줄의 `member_id`가 `hospital_members`에서 `email = lower(jwt email) and hospital_id = my_desk_hospital_id()`인 줄 | authenticated (정책이 부른다) |
| `sunap_share_status() returns table (sharing boolean, can_view boolean)` | sql stable definer | 늘 한 줄: sharing = `my_clinic_hospital_id()` 병원에 켠 줄이 있음, can_view = `sunap_share_view_hospital() is not null` | authenticated |
| `sunap_share_accounts() returns table (member_id uuid, email text, viewing boolean)` | sql stable definer | 원장만: 첫 줄 원장(null, `lower(coalesce(jwt email, 병원 줄 email))`, 원장 스위치), 그다음 `hospital_members` 그 병원 줄(created_at, id 차례). 원장이 아니면 빈 목록 | authenticated |
| `set_sunap_share(p_member uuid, p_on boolean) returns void` | plpgsql volatile definer | `my_hospital_id()` null → 42501. p_on null → 22023. 병원 줄 `for update`로 잠금. p_member가 null이 아니고 내 병원 데스크 줄이 아니면 그냥 끝. 켜기 = `insert … on conflict do nothing`, 끄기 = 그 줄 delete(트리거가 사본을 지울지 정한다) | authenticated |
| `save_sunap_copy(p_day date, p_rows jsonb, p_paid jsonb, p_kinds jsonb) returns timestamptz` | plpgsql volatile definer | `my_clinic_hospital_id()` null → 42501. p_day가 null이거나 한국 오늘 − 30일 ~ 오늘 밖 → 22023. 병원 줄 `for key share` 잠금 → 켠 줄이 없으면 null. 있으면 `insert … on conflict (hospital_id, work_date) do update`(세 칸·sent_at = now()) 하고 sent_at을 돌려준다. 모양이 틀리면 표 check가 23514 | authenticated |
| `sunap_ledger_copies_prune() returns trigger` | plpgsql definer | `delete from sunap_ledger_copies where work_date < (now() at time zone 'Asia/Seoul')::date - 30` (모든 병원) | 아무에게도 안 줌 |
| `sunap_share_viewers_gone() returns trigger` | plpgsql definer | 지워진 줄의 병원 줄을 `for update`로 잠그고, 그 병원에 켠 줄이 없으면 그 병원 사본을 다 지운다 | 아무에게도 안 줌 |

- 함수마다 `revoke all on function … from public, anon, authenticated;` 뒤 위 표의 다섯에만 `grant execute … to authenticated;`.
- 트리거:
  - `create or replace trigger sunap_ledger_copies_prune after insert on public.sunap_ledger_copies for each statement execute function public.sunap_ledger_copies_prune();` — `insert … on conflict do update`도 문장 단위 insert 트리거를 부른다(예약 탭 `calendar_appts_prune`과 같은 꼴).
  - `create or replace trigger sunap_share_viewers_gone after delete on public.sunap_share_viewers for each row execute function public.sunap_share_viewers_gone();` — 끄기(`set_sunap_share`)와 데스크 줄 빼기(`remove_desk_member` → `on delete cascade`) 둘 다 여기로 온다.
- 트리거 함수가 정의자인 까닭: authenticated에 사본 지우기 권한이 없다. 지금은 정의자 함수 안에서만 불리지만(그래서 호출자 권한으로도 돌지만) 길이 하나 더 생겨도 지우기가 막히지 않게 한다.
- 잠금 까닭: '저장 함수가 켠 줄을 본 뒤 → 다른 곳에서 마지막 스위치를 끄고 사본을 지움 → 저장 함수가 새 사본을 넣음'이면 끈 뒤에도 사본이 남는다. 저장은 병원 줄을 `for key share`, 끄기 트리거·`set_sunap_share`는 `for update`로 잡아 차례를 세운다(서로 막고, 다른 병원 줄 고치기는 막지 않는다).

### 2-4. 열쇠 (앱 `lib/sunap/share.ts`와 같은 모음)
- 장부 줄: `chart, name, time, kind, cash, card, transfer, unpaid, health, free, block, pt, rsv, note, edited` (15) — `LedgerRow`에서 `doctor`만 뺐다.
- `rsv`: `kind, source, at`.
- 미수 입금 줄: `chart, name, time, cash, card`.
- 종류: `id, label, counts` (`words` = 비트 예약 메모 말은 안 보낸다).
- DB는 열쇠가 이 모음 **안에 있는지**(더 있으면 거부)·길이·줄 수만 본다. 값 하나하나의 모양(시각·금액·구분)은 앱이 보낼 때와 읽을 때 본다.

### 2-5. 읽기 정책 (AC-6501.6)
```sql
drop policy if exists "장부 보기 켠 계정 읽기 (원장·데스크)" on public.sunap_ledger_copies;
create policy "장부 보기 켠 계정 읽기 (원장·데스크)" on public.sunap_ledger_copies for select to authenticated
  using (hospital_id = (select public.sunap_share_view_hospital())
         and work_date >= ((now() at time zone 'Asia/Seoul')::date - 30));
```
- 정책 하나가 원장(`my_hospital_id()` + 원장 스위치)과 데스크(`my_desk_hospital_id()` + 로그인 메일로 맞춘 자기 줄 스위치)를 다 본다. ADR-031 '새 표에는 데스크 정책을 따로 더한다'를 이 정책이 채운다(데스크도 이 정책으로만 읽는다).
- 넣기·고치기·지우기 정책은 없다(권한도 없다). 원장·데스크 모두 `save_sunap_copy`로만 쓴다. `insert … on conflict do update`는 있는 줄에 읽기 정책도 걸어서, 스위치를 끈 접수 계정이 바로 쓰면 실패한다 — 그래서 쓰기는 정의자 함수 하나로 모았다.
- 31일 정책 + 트리거: 트리거는 누가 저장할 때만 도니, 아무도 저장하지 않는 동안 지난 줄이 남을 수 있다. 정책이 그런 줄을 주지 않아 화면에는 늘 31일 안만 보인다(예약 탭 ADR-030과 같은 꼴).

### 2-6. 시험 (`supabase/sunapShare.rls.test.ts`, PGlite)
- `desk.rls.test.ts` 꼴: CHAIN(desk 시험의 CHAIN + `20261118100000_desk_accounts.sql`) 뒤 이 파일. 파일이 없으면 빈 글자로 돌아 시험마다 실패.
- 사람: 병원 A 원장·B 원장·승인 대기 C·거절 D·병원 없음 E·A 데스크 K·L·B 데스크 M·anon (JWT `sub`·`email`).
- 본다: 표·칸 권한, RLS 켜짐, 정책 목록(하나), 함수 정의자·search_path·실행 권한 표, 계정 목록·스위치(AC-6501.2), 상태(AC-6501.3), 저장(AC-6501.4·5), 읽기(AC-6501.6, 시계를 바꾸지 않고 `work_date`를 오늘 − 30·− 31로 넣어 본다 — 오늘 − 31 줄은 저장 트리거가 바로 지우므로 시험이 DB 주인 역할에서 `alter table … disable trigger sunap_ledger_copies_prune`로 잠깐 끄고 넣은 뒤 다시 켠다), 지우기(AC-6501.7), 두 번 돌리기·LF·머리 주석·쓴 문장 종류(AC-6501.8), 앞 함수 글자 그대로(`pg_proc.prosrc` 견주기).

## 3. 고르기·검사 (`src/lib/sunap/share.ts`, 환자 자료 구역, TASK-2)
```ts
export const SHARE_DAYS = 31
export const SHARE_ROWS_MAX = 400
export const SHARE_PAID_MAX = 100
export const NOTE_HIDDEN = '접수 PC에서만 보여요'
export const SHARE_ROW_KEYS = ['chart','name','time','kind','cash','card','transfer','unpaid','health','free','block','pt','rsv','note','edited'] as const
export const SHARE_RSV_KEYS = ['kind','source','at'] as const
export const SHARE_PAID_KEYS = ['chart','name','time','cash','card'] as const
export const SHARE_KIND_KEYS = ['id','label','counts'] as const
export type SharedRow = Omit<LedgerRow, 'doctor'>
export type SharedKind = Pick<RsvKindDef, 'id' | 'label' | 'counts'>
export type SharedLedger = { rows: SharedRow[]; paid: PaidRow[]; kinds: SharedKind[] }
export type SharedCopy = { day: string; sentAt: string; ledger: SharedLedger }
export function toSharedLedger(ledger: { rows: readonly LedgerRow[]; paid: readonly PaidRow[] }, kinds: readonly RsvKindDef[]): SharedLedger | null
export function readSharedLedger(raw: unknown): SharedLedger | null   // {rows, paid, kinds} 모양
export function sharedToLedger(day: string, shared: SharedLedger): Ledger
export function sharedKinds(shared: SharedLedger): RsvKindDef[]
export function shareOldest(today: string): string                 // addDays(today, -(SHARE_DAYS - 1))
export function inShareWindow(day: string, today: string): boolean
```
- 고르기는 **열쇠 목록으로 새 객체를 만든다**(받은 객체를 펼치거나 그대로 넘기지 않는다). 그래서 Worker 줄에 무엇이 붙어 와도 정해 둔 열쇠만 나간다. 시험은 phone·rrn·address·birth·memo·codes·doctor를 붙인 줄로 결과 열쇠와 `JSON.stringify` 글자를 본다.
- 값 검사(AC-6502.3): 시각 `''` 또는 `^([01]\d|2[0-3]):[0-5]\d$`, 구분 `new·d90·re`, 금액·건강생활 0~99,999,999 정수, rsv.kind = `none`·`unknown`·종류 id 모양(`lib/sunap/kinds.ts`의 검사를 쓴다), rsv.source `hand·bit`, rsv.at null 또는 `^\d{12}$`, edited ⊂ `LEDGER_EDITED_FIELDS`, 종류 id·이름 1~10자·counts.
- 비고: `privacyProblem(note)`(`@/lib/worklog/notes`, 이미 lib/sunap이 쓰는 길)이면 `NOTE_HIDDEN`.
- `readSharedLedger`도 같은 검사(비고 바꾸기는 안 함 — 서버 값 그대로, 100자 넘으면 null). 하나라도 틀리면 null.
- `sharedToLedger`: `{ day, unsure: false, rows: rows.map(r => ({ ...r, doctor: null })), paid, closedAt: null, late: false, doctors: [] }`. `sharedKinds`: `kinds.map(k => ({ ...k, words: [] }))`. 합계는 `dayTotals(sharedToLedger(…), sharedKinds(…))`로 센다(원래 장부와 같음 — AC-6502.4 시험).
- 이 파일은 `lib/sunap` 울타리 안이다(네트워크·저장소·React 없음). `components/sunap/rows/**`에 두지 않는다.

## 4. 저장 (`src/lib/storage/sunapShare.ts`, TASK-3)
```ts
type Client = Pick<SupabaseClient, 'from' | 'rpc'>
export class SunapShareError extends Error { readonly kind: 'offline' | 'failed' }
export type ShareAccount = { memberId: string | null; email: string; viewing: boolean }
export type ShareStatus = { sharing: boolean; canView: boolean }
export function listShareAccounts(client: Client): Promise<ShareAccount[]>
export function setShareView(client: Client, memberId: string | null, on: boolean): Promise<void>
export function loadShareStatus(client: Client): Promise<ShareStatus>
export function saveSunapCopy(client: Client, day: string, ledger: { rows: readonly LedgerRow[]; paid: readonly PaidRow[] }, kinds: readonly RsvKindDef[]): Promise<string | null>
export function loadSunapCopy(client: Client, day: string): Promise<SharedCopy | null>
```
- `lib/storage/sunap.ts`·`desk.ts` 꼴: `send()` 감싸개, 상태 0 = offline, 그 밖 오류·던짐 = failed, 오류 글에 Supabase 글·받은 값 없음.
- `saveSunapCopy`가 `toSharedLedger`를 직접 부른다(부르는 쪽이 고른 값을 넘기지 않는다 — 고르기를 건너뛸 길이 없다). 몸통 `{ p_day, p_rows, p_paid, p_kinds }`.
- `loadSunapCopy`: `.from('sunap_ledger_copies').select('work_date, ledger_rows, paid_rows, rsv_kinds, sent_at').eq('work_date', day).maybeSingle()`. RLS가 병원·켠 계정·31일을 정하니 병원 조건은 앱이 넣지 않는다.
- 업로드는 이 파일 하나로만 한다(화면·Worker·rows는 supabase를 부르지 않는다).

## 5. 화면

### 5-1. `src/components/sunap/ShareAccounts.tsx` (TASK-5)
```ts
export function ShareAccounts({ onChange }: { onChange?(): void }): JSX.Element | null
```
- `useDesk()`가 참이면 `null`(읽지도 않음). 원장이면 열 때 `listShareAccounts(supabaseBrowser())`.
- 줄: 메일(`break-all`) + 칩('원장(나)' 또는 '데스크') + 오른쪽 스위치(`role="switch"`, `aria-checked`, `aria-label` '{메일} 장부 보기', 옆 글 '켬'·'끔'). 폰 폭에서 줄은 두 줄로 접힌다(스위치 높이 44px).
- 누르기: 켠 수 `on = viewing인 줄 수`.
  - 끔 → 켬이고 `on === 0`: 확인 상자 '처음 켜기'. 켬 → 끔이고 `on === 1`: 확인 상자 '마지막 끄기'. 그 밖은 바로 보낸다.
  - 확인 상자는 목록 바로 아래 같은 칸 안의 상자(`role="alertdialog"`, `aria-labelledby` 제목, 그린 뒤 초점은 [취소]). 겹친 창을 하나 더 띄우지 않는다. Esc는 상자의 `onKeyDown`이 받아 `stopPropagation()` 하고 상자만 닫는다(설정 판의 document Esc 듣개까지 가지 않는다).
  - 보내는 동안 모든 스위치 `disabled`, 누른 스위치 `aria-busy`. 성공 → 목록 다시 읽기 → `onChange?.()`. 마지막 끄기 성공이면 '서버에 둔 장부를 지웠어요.'(`role="status"`). 실패 → `ErrorCard code="E-SUNAP-SHARE-SAVE-FAILED"`, 목록 값은 그대로.
- 설정 판의 [저장]·[취소]와 따로 바로 저장된다(맨 아래 글이 그렇게 말한다).
- `SunapSettings`는 선택 칸 `share?: ReactNode`를 받아 판 맨 위(첫 칸 Block 고르기 앞)에 그린다. `SunapSettings`는 `ShareAccounts`를 import하지 않는다(부르는 쪽이 넣는다 — 그래서 지금 `SunapScreen.test.tsx`는 이 TASK에서 바뀌지 않는다).

### 5-2. `src/components/sunap/rows/LedgerRows.tsx` `readOnly` · `rows/SharedLedgerPanel.tsx` (TASK-4)
- `LedgerRows`에 `readOnly?: boolean`. 참이면 `editable`을 거짓으로 보고 칸 단추·번호표·고치기 판·키보드 고치기를 그리지 않는다. 칸 머리 hint = '접수 PC가 보낸 장부예요 · 보기만 할 수 있어요'(마감 안내 hint 대신), 범례 = '직원이 고친 칸(비트 값과 다름)'. 거르기·찾기·줄 세우기는 그대로(읽기만).
- `rows/SharedLedgerPanel.tsx` (환자 줄 울타리 안 — 네트워크·저장소 없음, 받은 값만 그림):
```ts
export function SharedLedgerPanel(props: {
  day: string
  copy: SharedCopy
  closedText: string | null      // 서버 마감 줄의 상태 칩 글(stateText), 서버를 아직 못 읽었으면 null → ' · …' 빼고 그림
  refreshing: boolean
  onRefresh(): void
  aside: ReactNode               // 오른쪽 칸(RemoteView가 지출 목록을 넣는다)
})
```
  - 맨 위 줄 `<p>`: '접수 PC에서 {시각}에 보냄 · {closedText}' + [새로 읽기](`aria-busy`=refreshing). 시각: sentAt의 한국 날짜 = day면 `savedTimeText`, 아니면 `{monthDay(그 날짜)} {HH:MM}`.
  - `LedgerRows rows={copy.ledger.rows에 doctor null} totals={dayTotals(sharedToLedger(day, copy.ledger), sharedKinds(copy.ledger))} kinds={sharedKinds(copy.ledger)} readOnly editable={false} closed={false} onEdit={() => {}}`.
  - 그 아래 `grid grid-cols-2 gap-3 max-lg:grid-cols-1`: `PaidRows paid={copy.ledger.paid}` | `aside`. 바깥 상자 `min-w-0`, 표는 지금처럼 자기 `overflow-x-auto` 안에서만 밀린다 → 390px에서 화면이 옆으로 밀리지 않는다.

### 5-3. `src/components/sunap/RemoteView.tsx` (TASK-6)
```ts
export type SharedView =
  | { kind: 'loading' }
  | { kind: 'off'; sharing: boolean }            // 내 스위치 꺼짐
  | { kind: 'old' }                              // 켜짐, 31일 밖
  | { kind: 'none' }                             // 켜짐, 사본 없음
  | { kind: 'ready'; copy: SharedCopy; refreshing: boolean }
  | { kind: 'failed'; viewer: boolean }          // viewer = 상태는 읽었고 켜짐(사본 읽기 실패). 거짓 = 상태부터 못 읽음
export function RemoteView(props: { server: ServerDayView; reason: RemoteReason; onRetry(): void; day?: string; share?: SharedView; onShareReload?(): void })
```
- `share`가 없으면(모드 old-day) 지금과 한 글자도 같다.
- 잠금 줄: viewer(old·none·ready·failed viewer) = 보기 전용 잠금 줄, 그 밖 = 지금 잠금 줄.
- 서버 숫자 칸(불러오는 중·실패·합계·'아직 마감 전이에요')은 지금 그대로.
- 지출 목록: ready면 `SharedLedgerPanel`의 `aside`로 옮기고, 그 밖은 지금 자리.
- 사본 자리:
  - loading → `role="status"` '접수 PC가 보낸 장부를 불러오는 중이에요'
  - off → 지금 자물쇠 카드(sharing이면 몸 글 앞 문장만 바꿈) + 그 아래 힌트 `<p>`(원장 = `useDesk()` 거짓 / 데스크)
  - old·none → 자물쇠 카드 모양의 안내 칸(제목·몸 글)
  - ready → `SharedLedgerPanel`(closedText = 서버 ready면 `stateText(server.closed?.closedAt ?? null, server.closed?.late ?? false)`, 아니면 null)
  - failed viewer → `ErrorCard code="E-SUNAP-SHARE-READ-FAILED"` + [다시 불러오기](`aria-label` '보낸 장부 다시 불러오기')
  - failed 아님 viewer → 지금 자물쇠 카드 + 위 오류 카드·단추

### 5-4. 훅 (TASK-7)
`src/components/sunap/useShareUpload.ts`
```ts
export const SHARE_WAIT_MS = 5000
export type ShareSend = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent'; at: string } | { kind: 'failed' }
export function useShareUpload(args: { day: string; today: string; view: { day: string; rows: readonly LedgerRow[]; paid: readonly PaidRow[] } | null; kinds: readonly RsvKindDef[] }): {
  sharing: boolean | null   // null = 모름(아직 못 읽음·31일 밖)
  send: ShareSend
  flush(): void             // 기다리는 보내기를 바로(마감 성공 뒤)
  retry(): void             // [다시 보내기]: 상태부터 바로
  recheck(): void           // 스위치가 바뀐 뒤: 상태를 읽고 켜져 있으면 지금 보기를 바로 보냄
}
```
- 날이 31일 안일 때만 돈다(`inShareWindow`). 날을 열 때 상태를 한 번 읽어 `sharing`을 안다.
- `view`가 그날 새 객체로 바뀔 때마다 5초 타이머를 다시 건다(앞 것은 버림). 타이머가 끝나면 '상태 → 켜짐이면 저장'. 그 사이 `send`는 `sending`(켜진 줄 알 때만 보임).
- 날이 바뀌면 기다리던 앞 날 일은 바로 돌리고 그 답은 버린다(새 날 상태 줄에 안 씀). 화면을 떠나면(unmount) 기다리던 일은 버린다.
- 한 번에 하나만 보낸다(보내는 중 새 일이 오면 끝난 뒤 마지막 것만).
- 실패: 저장이 던짐, 또는 `sharing === true`인데 상태 읽기가 던짐 → `failed`. `sharing`이 모름·거짓일 때 상태 읽기가 던지면 조용히 넘어간다.
- `supabaseBrowser()`는 훅 안에서 부른다.

`src/components/sunap/useSharedLedger.ts`
```ts
export function useSharedLedger(args: { day: string; today: string; enabled: boolean }): { view: SharedView; reload(): void }
```
- enabled일 때만: 상태 → can_view 거짓이면 `off{sharing}` → 31일 밖이면 `old` → `loadSunapCopy` → null이면 `none`, 아니면 `ready`.
- 처음(그날 첫 읽기)은 `loading`. 다시 읽기([새로 읽기]·`reload`·`visibilitychange`로 보임)는 앞 값을 두고 ready면 `refreshing: true`.
- 날이 바뀌면 늦게 온 앞 날 답은 버린다(읽기 번호).
- 실패: 상태가 던짐 → `failed{viewer:false}`, 사본이 던짐 → `failed{viewer:true}`.

### 5-5. `src/components/sunap/SunapScreen.tsx` 잇기 (TASK-9)
- `LedgerView`(접수 PC):
  - `const upload = useShareUpload({ day, today, view, kinds })`.
  - `DayBar` children 맨 앞(비트 불러옴 글 뒤): `upload.sharing === true`이고 `send`가 sending이면 '다른 기기로 보내는 중…', sent면 '다른 기기로 보냄 · {savedTimeText(new Date(at))}'(`text-small text-muted tabular-nums`).
  - 잠금 줄: `upload.sharing === true`면 보내는 글, 아니면 지금 글.
  - 잠금 줄 아래: `send.kind === 'failed'`면 `ErrorCard code="E-SUNAP-SHARE-SEND-FAILED"` + [다시 보내기] → `upload.retry()`.
  - `closeDay`: `closeSunapDay` 성공 뒤 `upload.flush()`.
  - 설정 판: `<SunapSettings … share={<ShareAccounts onChange={upload.recheck} />} />`.
- `Connected`(다른 기기):
  - `const shared = useSharedLedger({ day, today, enabled: mode === 'device' || mode === 'old-helper' })`.
  - `RemoteView`에 old-day가 아니면 `share={shared.view} onShareReload={shared.reload} day={day}`.
  - 원장(`!useDesk()`)이고 모드 device·old-helper면 `DayBar` children에 [설정]. 누르면 `loadSunapSettings` + `listStatsRxGroups`를 읽어 `SunapSettings`를 연다(`share={<ShareAccounts onChange={shared.reload} />}`, [저장] = `saveSunapSettings`). 읽기 실패면 `ErrorCard code="E-SETTINGS-FAILED"`(DayBar 아래), [설정]을 다시 누르면 다시 읽는다. 데스크는 [설정]이 없다.
- 모드 connecting·old-day는 지금 그대로(훅은 enabled 거짓이라 아무것도 읽지 않는다).
- 시험: `SunapScreen.test.tsx`에 `vi.mock('@/lib/storage/sunapShare')`(기본: 상태 `{sharing:false, canView:false}`, 계정 빈 목록)를 더해 지금 시험이 그대로 통과하게 하고, 새 AC 시험을 더한다.

## 6. 화면 글자
| 곳 | 글 |
|---|---|
| 설정 칸 제목 | '다른 기기에서 장부 보기' |
| 설정 칸 설명 | '켠 계정은 폰·집 PC처럼 장부가 안 열리는 기기에서도 그날 장부를 볼 수 있어요. 보기만 하고, 고치거나 마감할 수는 없어요.' |
| 원장 줄 칩 / 데스크 줄 칩 | '원장(나)' / '데스크' |
| 스위치 이름 / 옆 글 | '{메일} 장부 보기' / '켬'·'끔' |
| 데스크 줄 없음 | '데스크 계정은 설정 탭 → 데스크 계정에서 더할 수 있어요.' |
| 목록 읽는 중 | '계정 목록을 불러오는 중이에요' |
| 맨 아래 글 | '스위치는 누르면 바로 저장돼요. 켠 계정이 있으면 접수 PC가 그날 장부(이름·차트번호·금액·다음 예약·비고)를 서버에 보내요. 전화·주민번호·주소는 보내지 않아요. 서버의 장부는 31일이 지나면 지워지고, 마지막 계정을 끄면 바로 지워져요.' |
| 처음 켜기 확인 | 제목 '장부를 서버에 보낼까요?' · 글 '켜면 접수 PC가 그날 장부의 이름·차트번호를 서버에 보내요. 31일 동안 두고, 장부 보기를 켠 계정만 볼 수 있어요.' · [취소] [켜기] |
| 마지막 끄기 확인 | 제목 '서버에 둔 장부를 지울까요?' · 글 '끄면 장부 보기를 켠 계정이 하나도 없어서 서버에 둔 장부를 바로 지워요. 접수 PC의 장부는 그대로예요.' · [취소] [끄고 지우기] |
| 지운 뒤 | '서버에 둔 장부를 지웠어요.' |
| 접수 PC 잠금 줄(켬) | '환자 이름 줄과 고친 칸은 **이 접수 PC 안에** 저장돼요. 장부 보기를 켠 계정이 있어서 이 날 장부를 서버에도 보내요(31일 뒤 지워요). 전화·주민번호·주소는 보내지 않아요.' |
| 접수 PC 상태 줄 | '다른 기기로 보내는 중…' / '다른 기기로 보냄 · {HH:MM}' |
| 접수 PC 실패 단추 | [다시 보내기] |
| 다른 기기 잠금 줄(켬) | '이 기기에서는 접수 PC가 보낸 장부를 보기만 할 수 있어요. 고치거나 마감하려면 접수 PC에서 수납일지를 여세요.' |
| 사본 맨 위 줄 | '접수 PC에서 {HH:MM 또는 M월 D일 HH:MM}에 보냄 · {마감 상태}' · [새로 읽기] |
| 읽기 전용 표 hint / 범례 | '접수 PC가 보낸 장부예요 · 보기만 할 수 있어요' / '직원이 고친 칸(비트 값과 다름)' |
| 사본 없음 | 제목 '이 날 장부는 아직 접수 PC에서 보내지 않았어요' · 글 '접수 PC에서 이 날 수납일지를 열면 자동으로 보내요.' |
| 31일 지남 | 제목 '31일이 지난 장부는 볼 수 없어요' · 글 '다른 기기에서는 오늘부터 30일 전까지의 장부만 볼 수 있어요.' |
| 사본 읽는 중 | '접수 PC가 보낸 장부를 불러오는 중이에요' |
| 끈 계정 카드 몸 글 앞 문장(누가 켬) | '이름·차트번호가 든 줄은 서버로 올리지 않아요.' → '장부 보기를 켠 계정만 다른 기기에서 장부를 볼 수 있어요.' |
| 끈 계정 힌트(원장) | '[설정]에서 내 계정의 장부 보기를 켜면 이 기기에서도 장부를 볼 수 있어요.' |
| 끈 계정 힌트(데스크) | '원장님께 수납일지 [설정]에서 이 계정의 장부 보기를 켜 달라고 해 주세요.' |
| 사본 실패 단추 | [다시 불러오기] (이름 '보낸 장부 다시 불러오기') |

## 7. 오류 번호 (`src/lib/errors.ts`, `src/types/errors.ts`, TASK-2)
| 번호 | 무엇이(what) | 어떻게(fix) |
|---|---|---|
| E-SUNAP-SHARE-LIST-FAILED | '장부 보기 계정 목록을 불러오지 못했어요' | '인터넷 연결을 확인하고 [다시 불러오기]를 눌러 주세요.' |
| E-SUNAP-SHARE-SAVE-FAILED | '장부 보기를 바꾸지 못했어요' | '인터넷 연결을 확인하고 다시 눌러 주세요. 계속되면 오류 번호와 함께 문의해 주세요.' |
| E-SUNAP-SHARE-SEND-FAILED | '장부를 다른 기기로 보내지 못했어요' | '인터넷 연결을 확인하고 [다시 보내기]를 눌러 주세요. 이 PC의 장부는 그대로예요.' |
| E-SUNAP-SHARE-READ-FAILED | '접수 PC가 보낸 장부를 불러오지 못했어요' | '인터넷 연결을 확인하고 [다시 불러오기]를 눌러 주세요.' |
- `ErrorCode`에 한 묶음(주석 `// 수납일지 장부 다른 기기에서 보기 (spec sunap-phone)`)으로 더하고, `errors.test.ts`의 `ALL_CODES`와 새 표 시험(글자 그대로·이 넷뿐)을 더한다.

## 8. 문서 (TASK-8)

### 8-1. ADR-033 (`docs/ADR.md` 끝에 그대로)
```
### ADR-033: 수납일지 장부를 켠 계정만 다른 기기에서 본다 — 장부 사본을 31일 서버에 둔다
**맥락**: 수납일지 환자 장부는 도우미·비트가 있는 PC(보통 접수 PC)에서만 열리고, 서버에는 마감 합계 숫자만 간다(specs/sunap-ilji, ADR-020). 2026-11-18 사용자: 원장이 폰·집 PC에서도 그날 장부를 보고 싶다. 기기가 아니라 계정으로 정한다. 이것은 "환자 개인정보는 의원 PC 밖으로 나가지 않는다"(`CLAUDE.md` 아키텍처 규칙)에 부딪힌다. 그래서 ADR-030(예약 탭)처럼 이 표에만 예외를 연다
**결정** (사용자, `specs/sunap-phone`):
- **켜는 사람**: 원장(병원 계정)만 수납일지 [설정] '다른 기기에서 장부 보기'에서 계정마다(원장 자기·데스크마다) 스위치를 켠다. 기본은 꺼짐. 데스크는 목록을 못 보고 자기 스위치도 못 바꾼다
- **서버에 두는 것**: 켠 계정이 하나라도 있는 동안, 장부가 열리는 PC가 그날 장부 사본(`sunap_ledger_copies`: 장부 칸 열다섯 — 차트번호·이름·접수 시각·구분·현금·카드·계좌·미수·건강생활·0원·Block·물리치료·다음 예약(종류·직접/비트·예약 시각)·비고·고친 칸 / 미수 입금 줄 / 다음 예약 종류 이름)을 보낸다
- **두지 않는 것**: 전화·주민번호·주소·생일·진료의·처방코드·비트 예약 메모 글·원장님별 표. 비고가 전화·주민번호·메일 모양이면 그 비고만 '접수 PC에서만 보여요'로 바꿔 보낸다. 앱은 정해 둔 열쇠로 새 객체를 만들고 DB는 그 밖의 열쇠를 거부한다
- **읽기**: RLS로 자기 스위치를 켠 계정만(원장 = 내 병원 + 원장 스위치, 데스크 = 로그인 메일로 맞춘 자기 줄 스위치), 한국 날짜 오늘 − 30일 ~ 오늘. 보기만 한다(고치기·마감은 접수 PC)
- **쓰기**: 정의자 함수 `save_sunap_copy` 하나. 켠 계정이 없으면 저장하지 않는다. 표에 쓰기 권한이 없다
- **지우기**: 사본을 저장할 때마다 트리거가 31일 지난 줄을 지우고, 정책이 그런 줄을 주지 않는다(pg_cron 없음). 마지막 켠 스위치가 없어지면(끄기·데스크 줄 빼기) 그 병원 사본을 바로 지운다
**이유**: 원장이 의원 밖에서도 그날 장부를 봐야 한다 **(사용자, 2026-11-18)**. 계정마다 켜서 꼭 필요한 사람만 보게 하고, 켠 사람이 없으면 서버에 아무것도 남지 않게 했다 **(사용자)**
**대안**: (1) 기기로 정하기 — 폰을 바꾸거나 잃으면 다시 정해야 하고, 계정이 털렸을 때 막는 힘은 같다. (2) 합계 숫자만 — 지금과 같아 바라는 것을 못 한다. (3) Realtime — CSP에 wss origin을 더해야 한다. (4) pg_cron — 확장을 켜야 하고 PGlite 시험으로 증명하지 못한다. (5) 종단 간 암호화 — 열쇠를 폰에 나눠 줄 길이 없다
**트레이드오프**: 켠 동안 환자 이름·차트번호·금액이 의원 밖(Supabase 서울)에 31일까지 남는다. 켠 계정이 털리면 보인다 → 구글 로그인·관리자 승인·30분 자동 로그아웃 그대로. 비고의 개인정보는 모양 검사로만 막는다. 다른 기기는 실시간이 아니라 열 때·[새로 읽기]·화면이 다시 보일 때 읽는다. 아무도 저장하지 않는 동안 지난 줄이 남을 수 있지만 정책이 보이지 않게 한다
**바꾸는 것**: `CLAUDE.md` 아키텍처 규칙에 '예외 (ADR-033)' 한 줄(ADR-030 줄 바로 아래). 수납일지 머리 주석의 "서버에는 마감할 때 합계만"은 "켠 계정이 없을 때"로 읽는다
```

### 8-2. `CLAUDE.md` (ADR-030 줄 바로 아래 한 줄)
```
- 예외 (ADR-033): 수납일지만 원장이 [설정]에서 '장부 보기'를 켠 계정이 있는 동안 그날 장부 사본(장부 칸만: 이름·차트번호·금액·다음 예약·비고)을 서버(sunap_ledger_copies)에 둔다 — 전화·주민번호·주소·진료의·처방코드·비트 예약 메모는 두지 않고, 켠 계정만 31일 안의 날을 읽고(RLS), 쓰기는 DB 함수 하나(켠 계정이 없으면 저장 안 함)다. 31일 지난 사본은 DB가 지우고, 마지막 계정을 끄면 바로 지운다
```

### 8-3. DB 표 줄
- `plan.md` '### DB 표 (Claude 판단)' `hospital_members` 줄 바로 아래:
```
| `sunap_share_viewers` | 수납일지 '장부 보기'를 켠 계정 한 줄(member_id null = 원장, 아니면 데스크 줄). 원장만 정의자 함수로 켜고 끈다. 표 권한·정책 없음. ADR-033, specs/sunap-phone **(사용자, 2026-11-18)** |
| `sunap_ledger_copies` | 수납일지 장부 사본(병원·날 한 줄, 장부 칸만 — 전화·주민번호·주소·진료의·처방코드 없음). 켠 계정만 31일 안을 읽고, 쓰기는 `save_sunap_copy`만, 31일 지나면·마지막 계정을 끄면 DB가 지운다. ADR-033, specs/sunap-phone **(사용자, 2026-11-18)** |
```
- `docs/ARCHITECTURE.md` DB 표 `sunap_settings` 줄 바로 아래:
```
| `sunap_share_viewers` | 수납일지 장부 보기를 켠 계정: `id`·`hospital_id`·`member_id`(null = 원장, 아니면 `hospital_members` 줄, 지워지면 함께 지움)·`created_at`. 병원마다 원장 한 줄·데스크 줄마다 한 줄. 표 권한·정책이 없고 `sunap_share_accounts`·`set_sunap_share`(원장만)·`sunap_share_status`로만 다룬다. 마지막 줄이 지워지면 트리거가 그 병원 사본을 지운다 (ADR-033, specs/sunap-phone) |
| `sunap_ledger_copies` | 수납일지 장부 사본: `hospital_id`·`work_date`(기본 키 둘)·`ledger_rows`(400줄까지, 열쇠 열다섯)·`paid_rows`(100줄까지)·`rsv_kinds`(10개까지, id·label·counts)·`sent_at`. 읽기만 authenticated(정책: `sunap_share_view_hospital()` + 한국 오늘 − 30일 이후), 쓰기는 `save_sunap_copy`만(켠 계정 없으면 안 씀). 저장마다 트리거가 31일 지난 줄을 지운다. 저장은 `lib/storage/sunapShare.ts`, 고르기는 `lib/sunap/share.ts` (ADR-033, specs/sunap-phone) |
```
- `docs/ARCHITECTURE.md` 폴더 설명(예약 탭 줄 바로 아래) 한 줄:
```
- 수납일지 장부 다른 기기에서 보기: `lib/sunap/share.ts`(환자 구역, 보낼 칸 고르기·읽은 값 검사) · `lib/storage/sunapShare.ts`(저장, 표 둘·함수 다섯) · `components/sunap/ShareAccounts.tsx`(설정 스위치) · `components/sunap/rows/SharedLedgerPanel.tsx`(보기 전용 장부) · migration `supabase/migrations/20261118200000_sunap_share.sql` — 켠 계정만 장부 사본을 31일 서버에 두는 예외(ADR-033), `specs/sunap-phone/design.md`
```

## 9. 결정과 트레이드오프 (Claude 판단)
- **사본 한 줄 = 병원·날**: 접수 PC가 둘이면 나중에 보낸 것이 이긴다(범위 밖). 줄 단위 표로 나누지 않아 쓰기 한 번·지우기 쉬움.
- **켠 계정이 없으면 DB가 안 받음**: 앱이 상태를 잘못 알아도 사본이 생기지 않는다. 상태 읽기는 보내기 전마다 한 번(5초에 한 번 꼴) — 요청 수가 작다.
- **5초 기다림**: 고치기를 몇 번 이어서 해도 한 번만 보낸다. 마감은 바로(다른 기기에서 마감한 장부를 빨리 보려고).
- **원장 다른 기기 [설정]**: 원장이 폰에서 자기 스위치를 켤 수 있어야 한다. 데스크는 지금처럼 없다.
- **데스크 줄 빼기 = 스위치 없앰**: cascade로 함께 지운다. 마지막이면 사본도 지운다(묻지 않음 — 데스크 계정 칸은 이 명세 밖이라 고치지 않는다).
- **31일 = 오늘 − 30 ~ 오늘(한국)**: 사용자 '31일 보관'을 '오늘을 넣어 31일'로 읽었다.
- **비고 가리기**: 전화·주민번호·메일 모양 비고는 가린다(ADR-030 메모와 같은 검사).
- **진료의 칸 빼기**: 원장님별 표는 이 화면에 없고 사용자 결정의 '장부 칸'에 없다.

## 10. 위험
- 켠 계정이 털리면 31일 치 장부가 보인다 → 기본 꺼짐·원장만 켬·끄면 바로 지움·확인 상자 글로 알림.
- 상태 읽기·보내기 실패가 접수 일을 막으면 안 된다 → 실패는 카드 하나와 [다시 보내기]뿐, 고치기·마감은 그대로(AC-6505.5·6).
- SQL을 넣기 전에 사이트를 올리면: 접수 PC는 상태 읽기가 실패해도 모름이라 아무것도 안 보이지만, 다른 기기는 '접수 PC가 보낸 장부를 불러오지 못했어요'가 보인다 → **SQL 먼저**(아래 배포 순서).
- 다른 기기는 실시간이 아니다 → 맨 위 줄에 보낸 시각과 [새로 읽기].

## 11. 배포 순서
1. 사용자가 `supabase/migrations/20261118200000_sunap_share.sql`을 SQL Editor에 붙여 실행(desk_accounts 다음).
2. 사이트 배포(도우미 새 판 없음 — 지금 0.8.0 이상 그대로).
3. 원장이 수납일지 [설정]에서 스위치를 켜고 폰에서 확인.

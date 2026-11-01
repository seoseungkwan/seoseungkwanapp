# 설계: 업무일지

> 기준: `requirements.md`, 시안 `docs/mockups/worklog/index.html`(사용자 승인 v2), `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/ADR.md`, `docs/UI_GUIDE.md`, `specs/tab-frame/design.md` '다음 명세가 탭을 채울 때'.
> 표시: **(사용자)** 사용자가 정함 / **(Claude 판단)** 고쳐도 됨

## 1. 한눈에

```
[화면 /worklog] page.tsx(서버) → currentMe()의 병원 id(업무사항 열쇠용) + todayInKorea()
   └ WorklogScreen(클라이언트) ── 날짜 줄·저장 상태(WorklogToolbar) + 엑셀 양식(WorklogSheet)
        ├ 숫자·비고 → 화면 밖 자동 저장 제어(worklogSession, 800ms 묶음) → saveWorklogDay → Supabase worklog_days (RLS, hospital_id = my_hospital_id())
        ├ 업무사항 → memoStore → 이 PC localStorage (서버로 가는 길 없음)
        └ 계산·글자 모양·날짜 이동 → lib/worklog (순수 함수)
```

- 화면은 날짜로 고른 **하루 한 장**이다. 오늘(한국 날짜)로 열리고, 화면을 연 채 자정이 지나면 새 날의 빈 양식으로 바뀐다 **(사용자)**
- 서버에는 숫자 14칸과 지출 비고 5칸만 간다. 업무사항은 그 PC 브라우저에만 있다 **(사용자)**
- 합계 넷은 저장하지 않고 그릴 때 계산한다(ARCHITECTURE '저장은 세기 숫자만') **(Claude 판단)**
- Phase 4: 비트 PC가 연결되면 신환·재진과 수입 칸을 비트 숫자로 저절로 채운다(빈 칸만, 적은 칸은 '다름'으로 알림). 매출 갈래의 `revenue.days` 하나를 불러 쓴다 — 20절 **(사용자)**

## 2. 엑셀 원본에서 확인한 것 (사용자 업로드, 서식·계산식만 읽음)

- 시트 26개(10.01~10.31 근무일), 모두 같은 틀. 인쇄 범위 `A1:I23`, A4 세로(`paperSize=9`)
- 계산식: `D6 = SUM(C5,C6)` · `E15 = SUM(E9:I12)` · `E22 = SUM(E17:G21)` · `E23 = E15-E22`
- 서식: 금액 `#,###"원"`(0이면 "원"만), 날짜 `yyyy/mm/dd aaa`
- 열 너비(글자 수): A 11.875 · B~D 8.5 · E 6.625 · F 4.375 · G 9.75 · H 9.5 · I 12.875 → 시안 `colgroup` 14.5·10.6·10.6·10.6·8.4·5.8·12·11.8·15.7%
- 줄 높이(pt): 1행 39.75 · 2행 18 · 3행 33.75 · 4~6행 21 · 7~16행 30 · 17·18행 15 · 19~23행 30 (합 634.5pt)
- 지출의 넷째 줄 이름은 26개 시트 모두 글자 그대로 "free"다(빈 줄이 아니라 고정 이름)
- 합친 칸 46개:

| 자리 | 내용 |
|---|---|
| A1:I1 | 제목 "업  무  일  지"(맑은 고딕 32pt) |
| A2:E3 | 날짜(연보라, 14pt) · F2:F3 "결/재" · G2·H2·I2 "담당·팀장·원장" · G3·H3·I3 빈 도장 칸(연보라) |
| A4:A6 | "환 자 / 현 황" · B4 "외래"(C4·D4 빈칸) · B5 "신 환"/C5 입력/D5 "합  계"(연보라) · B6 "재 진"/C6 입력/D6 자동(연보라) |
| E4:F6 · G4:I6 | "업무사항" · 업무사항 칸(11pt) |
| A7:A15 | "수   입" · B7:D7~B14:D14 이름 8개 + E7:I7~E14:I14 입력 · B15:D15 "수납액"/E15:I15 자동(둘 다 연보라). 7·8행(총진료비·조합청구액)은 회색 |
| A16:A22 | "지 출" · B16:D16 "항목" · E16:G16 "금액" · H16:I16 "비고" |
| B17:D18 · E17:G18 · H17:I18 | 현금(두 줄 높이) · 금액 · 비고(10pt) |
| B19:D19 … B21:D21 | 카드 · 환불 · free (금액 E:G, 비고 H:I) |
| B22:D22 · E22:G22 · H22:I22 | "총 지 불 액"(회색) · 자동(회색) · 비고(회색) |
| A23:D23 · E23:I23 | "합   계" · 자동(연보라), 아래 굵은 선 |

## 3. 목업과 다른 점 (2026-11-01 사용자 결정 반영)

| 시안 v2 | 실제 화면 |
|---|---|
| 아래 엑셀 시트 탭 줄(10.01 …) | **없다**. 날짜 줄(전날·날짜 고르기·다음 날·오늘로)로 고른다 **(사용자)** |
| 위 [달 고르기] | 날짜 고르기 칸(`<input type="date">`, 최대 = 오늘)으로 바꾼다 **(Claude 판단)** |
| [저장] 단추 + "저장했어요" 알림 | **자동 저장**. [저장] 단추가 없고 [인쇄] 옆에 저장 상태 글이 있다 **(사용자)** |
| [인쇄] → 목업 안 미리보기 창 | 브라우저 인쇄(`window.print()`)를 바로 연다. 미리보기는 브라우저 인쇄 창이 보여 준다 **(Claude 판단)** |
| 업무사항 흐린 안내 "환자 이름·차트번호는 적지 않아요" | "이 PC에만 저장돼요"(업무사항은 서버로 안 가므로 사실대로) **(Claude 판단)** |
| 목업의 옛 탭 줄·위쪽 띠 | 지금 앱 틀(`AppShell`, 탭 13개)을 그대로 쓴다 |
| 폰 화면에서도 칸을 고칠 수 있음 | 폰(터치 기기)은 같은 양식을 화면 폭에 맞춰 **보기만** 한다(`plan.md` §1) **(사용자 답 2026-11-01)**. 좁은 PC 창은 그대로 고칠 수 있다 |
| 칸 초점 테두리 초록 `#107C41` | 그대로(`--xl-focus` 토큰) |
| 목업 숫자(지어낸 예시) | 실제 화면은 서버 값만. 없는 날은 빈 양식 |

## 4. 파일과 구성 요소

| 파일 | 하는 일 | TASK |
|---|---|---|
| `src/types/worklog.ts` | 칸 열쇠·DB 칸 이름 표·하루 값 모양·합계 모양 | 2 |
| `src/lib/worklog/calc.ts` | 합계 넷, 숫자 읽기, 칸 글자 모양 | 2 |
| `src/lib/worklog/days.ts` | 날짜 이동·자정 넘김·날짜 칸 글자·저장 시각 글자 | 2 |
| `src/lib/worklog/notes.ts` | 비고 개인정보 모양 검사 | 2 |
| `src/lib/worklog/memoStore.ts` | 업무사항 이 PC 저장소(localStorage) | 3 |
| `supabase/migrations/20261101000100_worklog.sql` | 표 `worklog_days`·RLS·권한·공용 함수(`my_hospital_id`·`touch_updated_at`) | 4 |
| `src/lib/storage/worklogDays.ts` | 하루 읽기·저장(Supabase), 오류 종류 나누기 | 5 |
| `src/lib/worklog/autosave.ts` | 자동 저장 제어(묶기·다시 시도·끊김·상태) | 6 |
| `src/app/globals.css` · 규칙 시험 셋 | 엑셀 색 토큰 넷, 굵기·CSS Module 예외 | 7 |
| `src/components/worklog/WorklogSheet.tsx` · `sheet.module.css` | 엑셀 양식 표(그리기만, 값은 props) | 8 |
| `src/components/worklog/WorklogToolbar.tsx` | 날짜 줄·저장 상태·오류 카드·[인쇄] | 9 |
| `src/components/worklog/WorklogScreen.tsx` | 화면 조립: 읽기·자동 저장·업무사항·자정·폰·떠나기 확인 | 10 |
| `src/components/worklog/useWorklogDay.ts` | WorklogScreen의 날짜별 값·읽기 상태(화면에서 뗀 훅) | 10 |
| `src/components/worklog/worklogSession.ts` | 화면 밖(모듈 하나)에 사는 자동 저장 제어·떠나기 확인·로그아웃 정리 | 10 |
| `sheet.module.css` 인쇄 부분 · `AppShell.tsx` | 인쇄 CSS, 앱 틀 인쇄 숨김 | 11 |
| `src/app/(app)/worklog/page.tsx` + 탭 목록 셋 | 진짜 화면 연결 | 12 |
| `e2e/worklog.spec.ts` | 실제 Supabase 확인 | 13 |

- `lib/worklog`는 환자 자료 구역이 아니다(업무사항은 사용자가 손으로 적는 글이고 비트 파일이 아니다). 그래도 `calc`·`days`·`notes`·`autosave`는 순수 TS로 두고 React·supabase를 쓰지 않는다 **(Claude 판단)**
- `lib/storage/`는 ARCHITECTURE의 '(예정) 검사한 달·일 숫자만 저장' 자리다. 사전점검도 이 폴더에 새 파일을 만든다(파일은 겹치지 않는다)

## 5. 자료 모양 (`src/types/worklog.ts`)

| 열쇠 | 칸 이름(`aria-label`, 시안 그대로) | 엑셀 | DB 칸 | 종류 |
|---|---|---|---|---|
| `newPatients` | 신환 | C5 | `new_patients` | 인원 |
| `returnPatients` | 재진 | C6 | `return_patients` | 인원 |
| `totalFee` | 총진료비 | E7 | `total_fee` | 금액 |
| `claimAmount` | 조합청구액 | E8 | `claim_amount` | 금액 |
| `cashIn` | 현금수납 | E9 | `cash_in` | 금액 |
| `cardIn` | 카드수납 | E10 | `card_in` | 금액 |
| `transferIn` | 계좌이체 | E11 | `transfer_in` | 금액 |
| `localCurrencyIn` | 지역화폐 | E12 | `local_currency_in` | 금액 |
| `unpaidNew` | 미수발생 | E13 | `unpaid_new` | 금액 |
| `unpaidPaid` | 미수입금 | E14 | `unpaid_paid` | 금액 |
| `spendCash` | 지출 현금 금액 | E17 | `spend_cash` | 금액 |
| `spendCard` | 지출 카드 금액 | E19 | `spend_card` | 금액 |
| `spendRefund` | 환불 금액 | E20 | `spend_refund` | 금액 |
| `spendFree` | 지출 free 금액 | E21 | `spend_free` | 금액 |
| `noteCash` | 지출 현금 비고 | H17 | `note_cash` | 비고 |
| `noteCard` | 지출 카드 비고 | H19 | `note_card` | 비고 |
| `noteRefund` | 환불 비고 | H20 | `note_refund` | 비고 |
| `noteFree` | 지출 free 비고 | H21 | `note_free` | 비고 |
| `noteTotal` | 총 지불액 비고 | H22 | `note_total` | 비고 |
| (이 PC) | 업무사항 | G4 | 없음 | localStorage |

```ts
export type WorklogCountKey = 'newPatients' | 'returnPatients'
export type WorklogWonKey = 'totalFee' | 'claimAmount' | 'cashIn' | 'cardIn' | 'transferIn' | 'localCurrencyIn'
  | 'unpaidNew' | 'unpaidPaid' | 'spendCash' | 'spendCard' | 'spendRefund' | 'spendFree'
export type WorklogNumberKey = WorklogCountKey | WorklogWonKey
export type WorklogNoteKey = 'noteCash' | 'noteCard' | 'noteRefund' | 'noteFree' | 'noteTotal'
/** 서버에 저장하는 하루 값. 업무사항은 여기 없다(따로 memoStore) */
export type WorklogDay = Record<WorklogNumberKey, number | null> & Record<WorklogNoteKey, string>
export type WorklogTotals = { visits: number; received: number; spent: number; net: number }
export const WORKLOG_COUNT_KEYS: readonly WorklogCountKey[]
export const WORKLOG_WON_KEYS: readonly WorklogWonKey[]
export const WORKLOG_NOTE_KEYS: readonly WorklogNoteKey[]
export const WORKLOG_COLUMNS: Readonly<Record<WorklogNumberKey | WorklogNoteKey, string>>  // 위 표의 DB 칸
export const NOTE_MAX = 100
export const MEMO_MAX = 2000
export function emptyWorklogDay(): WorklogDay   // 숫자 null, 비고 ''
```
- 값이 없음 = `null`(엑셀 빈칸). 0을 치면 0으로 저장하고 입력 칸에는 빈 글자로 보인다(시안·엑셀 `#,###"원"`과 같다)
- 인원은 0~99,999, 금액은 0~999,999,999,999(12자리, 시안이 받는 길이). 음수는 받지 않는다(엑셀에 음수 입력이 없고, 빼는 것은 지출 줄이 한다)

## 6. 순수 함수

```ts
// calc.ts
export function worklogTotals(day: WorklogDay): WorklogTotals  // AC-002.1~002.4
export function parseCount(text: string): number | null        // 숫자만, 앞 0 지움, 앞 5자리
export function parseWon(text: string): number | null          // 숫자만, 앞 0 지움, 앞 12자리
export function wonInputText(n: number | null, focused: boolean): string  // ''|'1,234,500원'|'1,234,500'
export function wonAutoText(n: number): string                 // '원'|'1,234,500원'|'-12,000원'
export function countText(n: number | null): string            // ''|'86'
// days.ts (날짜 계산은 lib/analytics/dates.ts의 addDays·compareYmd·isYmd·weekdayOf만 쓴다)
export function previousDay(ymd: string): string
export function nextDay(ymd: string, today: string): string | null
export function clampToToday(input: string, today: string): string
export function dayAfterRollover(selected: string, oldToday: string, newToday: string): string
export function sheetDateText(ymd: string): string             // '2026/10/28 수'
export function savedTimeText(at: Date): string                // '14:05' (Asia/Seoul, h23)
// notes.ts
export function notePrivacyProblem(text: string): boolean      // AC-002.10
```
- 쉼표는 `ko-KR` 천 단위(`1,234,500`). 금액은 정수만 다룬다(나눗셈이 없어 버림 규칙이 필요 없다)
- `notePrivacyProblem`의 모양은 `lib/payload/validate.ts`의 전화·붙임표 주민번호·붙여 쓴 주민번호·메일과 같은 정규식을 옮긴다(그 파일은 환자 자료 구역이고 상수를 내보내지 않아 불러오지 않는다). 13자리 붙여 쓴 주민번호를 잡는 것은 금액이 12자리까지라 금액 숫자와 부딪히지 않는다

## 7. 업무사항 이 PC 저장소 (`memoStore.ts`)

```ts
export type MemoResult = { ok: true; text: string } | { ok: false }
export function memoKey(hospitalId: string, ymd: string): string     // 'worklog:memo:v1:<id>:<ymd>'
export function readMemo(hospitalId: string, ymd: string, storage?: Storage | null): MemoResult
export function writeMemo(hospitalId: string, ymd: string, text: string, storage?: Storage | null): { ok: boolean }
```
- 기본 `storage`는 `globalThis.localStorage`(없거나 읽다 던지면 실패). 시험은 가짜 Storage를 넣는다
- 병원 id를 열쇠에 넣는다: 같은 PC 크롬에서 다른 구글 계정(다른 병원)으로 들어와도 남의 업무사항이 보이지 않는다
- 로그아웃·자동 로그아웃(30분) 때 지우지 않는다. 지우면 적어 둔 업무사항이 사라진다 **(Claude 판단)**
- 암호화하지 않는다. 엑셀 파일을 그 PC에 두던 것과 같은 수준이다. 크롬 '인터넷 사용 기록 삭제(쿠키 및 사이트 데이터)'를 하면 사라진다 → '사용자에게 물을 것' 3
- 업무사항은 [백업 내려받기](사전점검 TASK-32)에도 들어가지 않는다(서버 표가 아니다)

## 8. DB 표 (`supabase/migrations/20261101000100_worklog.sql`, TASK-4)

```sql
-- 공용 함수 둘: 갈래마다 글자 그대로 같다(cross-branch C1, precheck design.md 8-1과 같은 본문). 어느 갈래가 먼저 들어가도 된다
create or replace function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
  as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
revoke execute on function public.my_hospital_id() from public, anon;
grant execute on function public.my_hospital_id() to authenticated;
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end $$;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;

create table public.worklog_days (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  work_date date not null,
  new_patients integer check (new_patients between 0 and 99999),
  return_patients integer check (return_patients between 0 and 99999),
  total_fee bigint check (total_fee between 0 and 999999999999),
  -- claim_amount · cash_in · card_in · transfer_in · local_currency_in · unpaid_new · unpaid_paid
  -- spend_cash · spend_card · spend_refund · spend_free : 모두 같은 bigint 제약
  note_cash text check (char_length(note_cash) between 1 and 100),
  -- note_card · note_refund · note_free · note_total : 같은 text 제약
  updated_at timestamptz not null default now(),
  primary key (hospital_id, work_date)
);
alter table public.worklog_days enable row level security;
revoke all on table public.worklog_days from anon, authenticated;
grant select on table public.worklog_days to authenticated;
grant insert (work_date, <값 19칸>) on table public.worklog_days to authenticated;
grant update (work_date, <값 19칸>) on table public.worklog_days to authenticated;
-- 정책 셋(select · insert with check · update using + with check), 모두 hospital_id = (select public.my_hospital_id())
create trigger worklog_days_updated_at before update on public.worklog_days for each row execute function public.touch_updated_at();
```
- **병원 id는 DB 기본값 `my_hospital_id()`로만 채워진다**(cross-branch C1). 브라우저는 `hospital_id`를 보내지 않고 그 칸에는 넣기·고치기 권한이 없다. 승인 안 된 병원은 `my_hospital_id()`가 null이라 아무 줄도 못 보고 못 넣는다
- upsert(`insert … on conflict (hospital_id, work_date) do update`)는 보낸 칸만 `update set`에 쓴다(PostgREST). 보낸 칸은 `work_date` + 19칸이라 `work_date`에도 update 권한을 준다(같은 병원 안 날짜 옮기기는 앱이 하지 않는다). 충돌 판정은 기본값으로 채운 `hospital_id`로 한다
- 지우기 권한은 없다(화면에 지우기가 없다. 빈 칸으로 저장하면 된다). `updated_at`은 권한이 없어 방아쇠·기본값으로만 바뀐다
- 방아쇠 함수는 직접 실행 권한을 거둔다(방아쇠로 불릴 때는 권한을 보지 않는다 — 시험이 update 뒤 `updated_at`이 바뀌는지로 증명)
- 시험: `supabase/worklog.rls.test.ts`(PGlite, `supabase/rls.test.ts`와 같은 Supabase 흉내 + auth migration을 먼저 실행). 공용 함수 둘이 **이미 있을 때**(다른 갈래가 먼저 들어감)도 이 migration이 실패하지 않는지 한 번 더 돈다
- **실제 Supabase에 붙여 넣는 것은 사용자 OK가 필요하다.** TASK-4는 파일과 시험만 만든다. 운영자(사용자)가 SQL 편집기에 붙여 넣는 때는 Phase 2를 마친 뒤 화면을 실제로 볼 때다. Claude가 직접 실행하지 않는다

## 9. 하루 읽기·저장 (`src/lib/storage/worklogDays.ts`)

```ts
export type WorklogErrorKind = 'offline' | 'failed' | 'private'
export class WorklogStorageError extends Error {
  readonly kind: WorklogErrorKind
  readonly field?: WorklogNoteKey          // private일 때 막힌 비고 칸
}
type Client = Pick<SupabaseClient, 'from'>
export async function loadWorklogDay(client: Client, ymd: string): Promise<WorklogDay | null>
export async function saveWorklogDay(client: Client, ymd: string, day: WorklogDay): Promise<void>
```
- 읽기: `from('worklog_days').select(<정한 칸 목록>).eq('work_date', ymd).maybeSingle()`(내 병원 줄만 보이는 것은 RLS가 한다) → 화면 모양. null 칸은 `null`/`''`
- 저장: 먼저 비고 다섯 칸을 `notePrivacyProblem`으로 본다(걸리면 네트워크 없이 `private`). 그다음 `upsert(row, { onConflict: 'hospital_id,work_date' })`. `row`는 `work_date` + `WORKLOG_COLUMNS` 19칸뿐이고(`hospital_id`는 보내지 않는다), 받은 객체의 다른 열쇠는 무시한다(업무사항이 섞여 와도 안 간다)
- 오류 종류: `navigator.onLine === false`면 부르기 전에 `offline`. 응답 `status === 0`(postgrest-js가 연결 실패를 이렇게 돌려준다)이면 `offline`. 그 밖의 `error`는 `failed`. 오류 객체에 Supabase `message`·`details`를 넣지 않는다(CLAUDE.md '오류 내용은 화면에 그대로 보이지 않는다')

## 10. 자동 저장 (`src/lib/worklog/autosave.ts`)

```ts
/** 날짜 하나의 상태. pending = 800ms 기다리는 중 */
export type DaySaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'offline' | 'failed' | 'blocked'
/** 바깥에 보이는 전체 상태. pending은 saving으로 보인다 */
export type SaveState = 'idle' | 'saving' | 'saved' | 'offline' | 'failed' | 'blocked'
export type AutosaveSnapshot = { state: SaveState; savedAt: Date | null; blockedField: WorklogNoteKey | null }
export type AutosaveOptions = {
  save: (ymd: string, day: WorklogDay) => Promise<void>   // WorklogStorageError를 던진다
  delayMs?: number                 // 800
  retryDelaysMs?: readonly number[] // [2000, 5000, 15000]
  offlineRetryMs?: number          // 15000
  now?: () => Date
  timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout }
  onChange?: (snapshot: AutosaveSnapshot) => void
}
export function createAutosave(options: AutosaveOptions): {
  change(ymd: string, day: WorklogDay): void
  flush(): void
  retry(): void
  online(): void
  hasUnsaved(): boolean
  snapshot(): AutosaveSnapshot
  pendingDay(ymd: string): WorklogDay | null   // 아직 저장 안 된 최신 값(AC-006.10)
  dispose(): void                             // 로그아웃 때만
}
```
- 제어는 **화면 밖 모듈 하나**(`components/worklog/worklogSession.ts`)가 한 벌만 만든다. 화면이 내려가도(앱 안 다른 탭) 저장·다시 하기가 이어지고, 돌아오면 `pendingDay`로 저장 안 된 값을 다시 보인다(AC-010.11)

| 날짜 하나의 상태 | 들어옴 | 다음 |
|---|---|---|
| idle·saved·failed·offline·blocked | `change` | pending(800ms 타이머, 그 사이 `change`는 값만 바꾸고 타이머를 다시 건다) |
| pending | 타이머 끝·`flush` | saving |
| saving | 성공 | 그동안 바뀐 값이 있으면 saving 다시, 없으면 saved(`savedAt = now()`) |
| saving | `failed` | 2초 → 5초 → 15초 뒤 다시(그 사이 `change`면 그 값으로). 세 번 다 실패하면 failed(타이머 없음) |
| saving | `offline` | offline. 15초마다 다시, `online()`이면 바로 |
| saving | `private` | blocked(칸 이름). 다시 하지 않는다. 다음 `change`가 풀어 준다 |
| failed | `retry()` | 바로 saving |

- 바깥에 보이는 `snapshot().state`는 날짜 전부 중 가장 나쁜 것: failed > blocked > offline > saving(pending 포함) > saved > idle. `savedAt`은 가장 최근 성공 시각
- `hasUnsaved()`: pending·saving·offline·failed·blocked인 날짜가 하나라도 있으면 참
- 화면 값은 늘 화면(React 상태)에 있다. 자동 저장은 "마지막으로 보낼 값"만 들고 있다 → 저장이 실패해도 화면 값은 그대로다(`plan.md` §8 '값을 화면에 두고 [다시 저장]')
- 브라우저 저장소에 임시 사본을 두지 않는다(`plan.md` §10 '입력값 임시 저장'은 2차). 대신 저장 안 된 값이 있으면 떠나기 확인을 묻는다 **(Claude 판단)**

## 11. 화면

### 11-1. `WorklogSheet` (그리기만)
```ts
type Props = {
  ymd: string
  day: WorklogDay
  memo: string
  readOnly: boolean
  memoNotice?: string                       // 보기만일 때 업무사항 칸 글(폰)
  invalidNote?: WorklogNoteKey | null       // 개인정보 모양으로 막힌 비고 칸
  onNumber(key: WorklogNumberKey, value: number | null): void
  onNote(key: WorklogNoteKey, value: string): void
  onMemo(value: string): void
}
```
- 시안의 `<table class="sheet">`를 칸·글자·`aria-label`·합친 칸까지 그대로 옮긴다(2절 표). 클래스는 `sheet.module.css`의 이름(`sheet`·`lav`·`gray`·`date`·`small`·`memo`·`title`·`in`·`L`·`R`·`B`·`r1`·`r2`·`r3`·`r28`·`r20`)
- 금액 칸의 초점 글자/떠남 글자는 칸이 스스로 정한다(초점 상태만 칸 안에 둔다). 값은 늘 props에서 온다
- 비고는 100자(`NOTE_MAX`), 업무사항은 2,000자(`MEMO_MAX`)까지, 빈 업무사항 흐린 안내 "이 PC에만 저장돼요". 업무사항·비고는 `spellCheck={false}`(브라우저 맞춤법 검사가 글을 밖으로 보낼 수 있다)
- 양식 안에 `ds` 단추·칩·앱 토큰 글자 모양을 넣지 않는다(엑셀 모양만)
- 바깥 종이: 시안 `.paper`(흰 바탕·1px `line`·안쪽 24px, 폰 8px). `.paper`는 상자 하나이고 안의 `table`은 테두리를 가진 상자가 아니라 엑셀 칸 선이다 — UI_GUIDE '상자 안 상자'의 예외로 적는다(TASK-1)

### 11-2. `WorklogToolbar`
```ts
type Props = {
  ymd: string; today: string
  onDate(ymd: string): void
  status: ToolbarStatus      // 'loading' | 'empty' | 'saving' | 'saved' | 'offline' | 'failed' | 'blocked' | 'memo-failed' | 'load-failed'
  savedAt: Date | null
  onRetrySave(): void; onReload(): void; onPrint(): void
}
```
- PC: 한 줄. 왼쪽 [‹ 전날] · 날짜 칸 · [다음 날 ›] · [오늘로](오늘이 아닐 때만) / 오른쪽 상태 글 · [인쇄]. 폭은 시안 `.work`(737px, 가운데)
- 폰(768px 미만): 두 줄. 날짜 줄(44px) / 상태 글 · [인쇄]
- 단추: `ds.button.secondary`(전날·다음 날·오늘로·인쇄), 날짜 칸 `ds.input`. 상태 글 small `ink-2`(끊김은 `warning` 글자 + 아이콘), `role="status"`
- 오류 카드는 날짜 줄 아래 전체 폭에 하나(`ErrorCard`) + 그 아래 단추([다시 저장]·[다시 불러오기]). 문구는 `lib/errors.ts`

| 번호 | 무엇이 | 어떻게 고치나 |
|---|---|---|
| `E-WORKLOG-SAVE-FAILED` | 업무일지를 저장하지 못했어요 | 적은 값은 화면에 그대로 있어요. [다시 저장]을 눌러 주세요. 계속되면 오류 번호와 함께 관리자에게 알려 주세요. |
| `E-WORKLOG-LOAD-FAILED` | 이 날 업무일지를 불러오지 못했어요 | 인터넷 연결을 확인하고 [다시 불러오기]를 눌러 주세요. 불러오기 전에는 칸을 고칠 수 없어요. |
| `E-WORKLOG-MEMO-FAILED` | 업무사항을 이 PC에 저장하지 못했어요 | 적은 글은 화면에 남아 있어요. 다른 곳에 옮겨 두고, 크롬 설정에서 이 사이트의 데이터 저장을 허용해 주세요. |
| `E-WORKLOG-NOTE-PRIVATE` | 비고에 전화번호나 주민번호 모양 글자가 있어 저장하지 않았어요 | 빨갛게 표시된 비고 칸에서 그 글자를 지우면 바로 저장돼요. 환자 정보는 이 PC에만 저장되는 업무사항 칸에 적어 주세요. |

### 11-3. `WorklogScreen` + `useWorklogDay` + `worklogSession`
```ts
export function WorklogScreen(props: { hospitalId: string; initialToday: string }): JSX.Element  // 'use client'
// worklogSession.ts — 모듈 하나에 한 벌(화면이 내려가도 남는다)
export function worklogAutosave(): ReturnType<typeof createAutosave>   // 처음 부를 때 만든다. save = (ymd, day) => saveWorklogDay(supabaseBrowser(), ymd, day)
export function startWorklogSession(): () => void                       // beforeunload·online·SIGNED_OUT 듣기(한 번만), 돌려준 함수는 시험용 정리
```
- 처음: 고른 날 = 오늘 = `initialToday`. 30초마다와 `visibilitychange`(보임)마다 `todayInKorea()`를 다시 보고 `dayAfterRollover`로 옮긴다
- 날짜별 화면 값: `Map<ymd, { load: 'loading' | 'ready' | 'error'; day: WorklogDay; memo: string }>`. 처음 여는 날만 읽는다. 읽기 응답은 요청 번호로 맞춰 늦게 온 옛 응답을 버린다. 자동 저장 제어에 `pendingDay(ymd)`가 있으면 서버 값 대신 그 값을 쓴다(저장 안 된 값이 우선)
- 읽는 중·읽기 실패면 양식은 `readOnly`(빈 양식이 서버 값을 덮어쓰지 않게)
- 숫자·비고 바뀜 → 화면 값 바꾸고 `autosave.change(ymd, day)`. 업무사항 바뀜 → 화면 값 바꾸고 `writeMemo`(실패면 'memo-failed')
- 날짜 옮김 → `autosave.flush()` 뒤 새 날 보이기. 옮긴 뒤에도 옛 날짜 저장은 계속된다(상태 글은 전체 상태)
- **앱 안 이동**(Next 링크로 다른 탭, 화면이 내려감): 내려갈 때 `flush()`만 부르고 `dispose()`는 부르지 않는다 → 저장·다시 하기가 모듈에서 이어진다. `beforeunload`는 브라우저를 떠날 때만 울리므로 앱 안 이동은 이 길로 지킨다(AC-010.11)
- **보기만은 터치 기기로 정한다**: `matchMedia('(hover: none) and (pointer: coarse)')`가 참이면 `readOnly` + `memoNotice = '업무사항은 의원 PC에서만 보여요'`, 이때 `writeMemo`·`autosave.change`를 부르지 않는다. 화면 폭(768px 미만)은 배치만 바꾼다 — 반쪽 창·150% 확대한 의원 PC도 그대로 고친다(AC-010.10) **(Claude 판단)**
- `beforeunload`(모듈이 한 번 건다): `hasUnsaved()`면 `preventDefault()`(+ `returnValue = ''`). `visibilitychange` hidden → `flush()`. `online` → `autosave.online()`
- **로그아웃**: `supabaseBrowser().auth.onAuthStateChange`의 `SIGNED_OUT`(30분 자동 로그아웃의 `signOut()` 포함) → 떠나기 확인을 떼고, `dispose()`, 화면 값(업무사항 포함)을 지운다. 그래야 `IdleLogout`의 `window.location.assign('/login')`이 떠나기 확인에 막혀 공용 PC 화면에 일지가 남는 일이 없다. 이 PC 저장소의 업무사항은 지우지 않는다(AC-010.12)
- [인쇄] → `flush()` → `window.print()`
- Supabase 클라이언트는 `supabaseBrowser()`. 시험은 `vi.mock`으로 `lib/storage/worklogDays`·`memoStore`·`lib/supabase/browser`를 바꾼다

## 12. 엑셀 서식 예외 (TASK-7)

- UI_GUIDE는 Pretendard 하나·400/500/600·토큰 밖 색 금지·앱 화면 Tailwind만이다. 사용자가 "엑셀이랑 완전 똑같이"를 골랐으므로 **양식 칸 안만** 예외로 둔다 **(사용자 결정에서 나온 Claude 판단)**
  - 색: `:root`에 `--xl-ink #000000`·`--xl-lav #CCCCFF`·`--xl-gray #D9D9D9`·`--xl-focus #107C41`. 흰 종이는 `--surface`, 흐린 안내 글은 `--muted`. `@theme inline`에 넣지 않는다(Tailwind 색 이름을 만들지 않는다)
  - 글꼴: `"Gulim", "굴림", "Apple SD Gothic Neo", sans-serif`(칸), 제목 `"Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", sans-serif`. 시스템 글꼴 이름만 쓰고 글꼴 파일을 싣지 않는다(시안의 구글 글꼴 `Nanum Gothic`·`IBM Plex`는 쓰지 않는다 — CSP·UI_GUIDE). 의원 PC(윈도우)에는 굴림·맑은 고딕이 있다. 폰은 비슷한 고딕으로 보인다
  - 굵기: 칸 글자 700(엑셀 굵게). 굴림은 굵은 글꼴 파일이 없어 윈도우가 굵게 만든다 — 엑셀과 같다
  - 크기·높이: 엑셀 pt를 화면 px로 옮긴 시안 값(17px 등)과 인쇄 pt 값. Tailwind 대괄호 값 금지 규칙 때문에 CSS Module 한 파일(`sheet.module.css`)에 둔다
- 규칙 시험은 지우지 않고 **예외 한 파일**만 연다: `fonts.test.ts`(700), `classes.test.ts`(APP_DIRS에 `src/components/worklog` 더하기, `*.module.css` 파일·import 예외 한 개씩), `theme.test.ts`(토큰 표에 넷). 다른 파일은 그대로 잡힌다

## 13. 인쇄 (TASK-11)

- `sheet.module.css` `@media print`: `@page { size: A4 portrait; margin: 12mm; }`, `.paper`는 테두리·여백 없음, `.sheet { width: 100%; }` + pt 변수(시안 그대로), `print-color-adjust: exact`, 흐린 안내 글 투명
  - Next CSS Modules가 `@page`를 거부하면 그 한 줄만 `globals.css` 끝 `@media print { @page … }`로 옮긴다(TASK-11 Files에 있다)
- 앱 틀: `AppShell`의 위쪽 묶음(`sticky` div)·건너뛰기 링크에 `print:hidden`, 본문 안쪽 감싸개에 `print:p-0`. 다른 화면 인쇄에도 같은 효과다(지금 인쇄하는 화면이 없다)
- 날짜 줄·상태·오류 카드: `print:hidden`
- 한 장 확인: 시험은 CSS의 줄 높이 pt 합(634.5pt)이 A4 인쇄 높이(273mm ≈ 773.9pt) 안인지 본다. 실제 PDF 한 쪽은 E2E(TASK-13)

## 14. 탭 연결 (TASK-12, tab-frame '다음 명세가 탭을 채울 때')

- `menu.ts`: `MenuHref`에 `'/worklog'`, 업무일지 `{ href: '/worklog', ready: true }`
- `dashboard/briefing/features.ts`: 업무일지 `status: 'ready'`(설명 글자는 그대로)
- `notReadyFeatures.ts`: `/worklog` 항목과 `NotReadyPath`의 `'/worklog'` 빼기
- `(app)/worklog/page.tsx`: `export const dynamic = 'force-dynamic'`, `metadata = { title: '업무일지' }`, `currentMe()`로 병원 id → `<WorklogScreen hospitalId initialToday={todayInKorea()} />`
- 고칠 시험: `src/app/(app)/notReadyPages.test.tsx`(업무일지 줄 빼기), `src/app/titles.test.tsx`(업무일지를 준비 중 목록 밖 `{ path: '/worklog', title: '업무일지' }`로), `src/components/common/notReadyFeatures.test.ts`, `src/components/dashboard/briefing/features.test.ts`, `src/components/shell/shell.test.tsx`(준비 중 칩·ready 기대), `src/app/(app)/tabFrame.test.tsx`(ready·soon 칸을 나누는 기대가 있으면), `src/components/dashboard/briefing/DashboardHome.test.tsx`(기능 목차 옆 글 `INDEX_SIDE` "12개 가운데 1개는 지금 …"·준비 중 개수·사용 가능 개수 — `FeatureIndex.tsx`는 목록에서 세므로 코드는 그대로, 시험 기대만 바뀐다). 기대 숫자는 손으로 적지 않고 `DASHBOARD_FEATURES`에서 센다(cross-branch C5, AC-012.5). '지금 바로 쓸 수 있어요'(`ReadyNow.tsx`)는 청구만 말해 그대로다
- `shell.test.tsx`의 "준비 중 주소 /worklog" 탭 띠 밀기 시험은 경로만 쓰므로 그대로 통과한다. 이름 글자만 '준비 중'이 틀리게 되므로, 그 시험을 고칠 일이 생기면 아직 준비 중인 `/inventory`로 바꾼다(이 TASK에서는 고치지 않아 겹침을 줄인다)

## 15. E2E (TASK-13, `e2e/worklog.spec.ts`)

- 승인 계정(`accounts.signIn(context, 'approved')`)으로 `/worklog` → 날짜 칸으로 **시험 날짜 2020-01-02**(지난 날, 실제 오늘 일지를 더럽히지 않음) → 숫자 몇 칸·비고·업무사항(가짜 표식 + 가짜 환자 이름 "가상환자01"·차트번호 "900001"·전화 "010-0000-0001"·주민번호 모양 "900101-1234567") → "저장했어요" 기다림 → 새로 고침 → **날짜를 다시 2020-01-02로 고름**(날짜는 주소에 없고 화면은 오늘로 열린다) → 값 확인
- `page.on('request')`로 **모든 요청**(Supabase·같은 origin Next/Vercel·그 밖)의 주소와 본문을 모아 위 가짜 글자가 하나도 없는지 본다(cross-branch C7). `accounts.client('approved')`로 그 날 줄을 다시 읽어 모든 칸에 없는지 본다. 요청 머리(headers)·쿠키·`apikey` 값은 모으지 않는다(주소에서도 `apikey`·`access_token` 같은 query는 지우고 본다). 걸린 것은 값 대신 **이름만** 담는다(예: `hits = ['표식', '전화']` → `expect(hits).toEqual([])`, cross-branch C11)
- 새 `browser.newContext()`(다른 PC 흉내)로 같은 날 → 숫자는 보이고 업무사항은 빈 칸
- `page.emulateMedia({ media: 'print' })` + `page.pdf({ format: 'A4', printBackground: true })` → 쪽 수 1(`/\/Type\s*\/Page(?!s)/g`로 센다 — `/Pages`를 세지 않게)
- 끝에 그 날 값을 빈 칸으로 저장해 둔다(지우기 권한이 없다). 시험 계정은 가짜 병원이다
- 실제 Supabase에 migration이 들어가야 돈다 → 그 전에는 `blocked`

## 16. 결정과 트레이드오프

- **하루 한 줄 표, 칸마다 열** vs jsonb 한 칸: 칸 단위 제약(음수·길이)을 DB가 지키고, 업무사항 칸이 없음을 시험으로 증명할 수 있다(`plan.md` §0 '코드 대신 DB 제약'). 양식이 바뀌면 migration이 필요하다
- **날마다 전체 줄 upsert** vs 칸 하나씩 patch: 단순하고 실패 뒤 다시 하기 쉽다. 두 PC가 같은 날을 동시에 고치면 마지막 저장이 이긴다(동시 수정 막기는 §10 2차)
- **800ms 묶음 + 3번 다시**: 칠 때마다 요청하지 않으면서 "적으면 곧 저장됨"을 지킨다. 무료 Supabase 요청 수에도 부담이 없다
- **업무사항 localStorage**: 가장 단순하고 동기라 빨리 읽힌다(하루 2,000자 × 수년도 5MB 안). IndexedDB·암호화는 쓰지 않는다
- **폰 보기만**: 아이폰 입력 확대(16px 미만 글자) 문제와 엑셀 칸 크기를 함께 지키기 어렵다. `plan.md` §1과 같다
- **병원 id는 공용 `my_hospital_id()` 기본값**: 다른 갈래와 같은 글자(`create or replace`)라 어느 쪽이 먼저 들어가도 된다. 브라우저가 병원 id를 보내지 않으니 꾸밀 길이 없다
- **자동 저장 제어를 화면 밖 모듈에**: 앱 안 이동에서 값을 잃지 않는다. 대신 로그아웃 때 정리를 꼭 해야 한다(11-3절)
- **보기만 = 터치 기기**: 폭으로 정하면 반쪽 창·확대한 의원 PC가 막힌다. 터치 노트북(마우스 없음)은 보기만이 될 수 있다 — 의원 PC는 마우스를 쓴다

## 17. 위험

- **비고에 환자 이름**: 사용자 답(2026-11-01) — 비고에는 환자 이름을 적지 않는다. 그래도 전화·주민번호·메일 모양은 막는다
- **업무사항 사라짐**: 크롬 사이트 데이터 삭제·PC 교체·다른 크롬 프로필이면 없다. 화면 안내 "이 PC에만 저장돼요"로 알린다
- **굴림이 없는 PC**: 맥·폰은 비슷한 고딕으로 보여 칸 글자가 넘칠 수 있다. 칸은 `overflow`를 숨기지 않고 줄바꿈 없이 둔다(엑셀과 같음). 의원 PC 기준으로 확인한다
- **`@page`와 CSS Modules**: 거부되면 globals.css로 한 줄 옮긴다(13절)
- **자정 넘김 중 입력**: 옛 오늘에 치던 값은 옛 날짜로 저장되고 화면만 새 날로 바뀐다. 입력 중(초점이 양식 안)이면 넘김을 초점이 나갈 때까지 미룬다
- **세션 만료**: 30분 자동 로그아웃(`SIGNED_OUT`)이면 저장 못 한 값은 버리고 화면을 지운다(공용 PC에 일지를 남기지 않는 쪽을 고름). 그 전에 저장이 인증 오류로 실패하면 `failed` 카드다

## 18. 다른 작업과 겹치는 파일 (cross-branch C8)

같은 때 계획하는 통계·매출·환자 갈래, 사전점검·AI 리포트 갈래와 같이 고칠 수 있는 파일이다. 모두 **더하기만** 하고 다른 줄은 바꾸지 않는다.

| 파일 | 고치는 것 | TASK | 같이 고치는 갈래 |
|---|---|---|---|
| `supabase/migrations/` + 공용 함수 `my_hospital_id()`·`touch_updated_at()` | 새 파일 `20261101000100_worklog.sql`(·Phase 4 `…0110_worklog_bit_fields.sql`), 공용 함수는 C1 글자 그대로 | 4·15 | 통계·환자·매출·사전점검 |
| `src/lib/errors.ts` · `src/types/errors.ts` · `src/lib/errors.test.ts` | 끝에 `E-WORKLOG-*` 넷(C3, 다른 갈래 번호와 겹치지 않음) | 9 | 사전점검·통계·환자·매출 |
| `docs/ADR.md` | 끝에 업무일지 ADR 하나. 번호는 그때 마지막 번호 + 1(합칠 때 다시 매김, 시험은 번호를 보지 않는다) | 1 | 모두 |
| `docs/ARCHITECTURE.md` · `docs/UI_GUIDE.md` · `plan.md` | 줄·절 더하기, '하지 마라' 세 줄 꼬리표, plan.md §5 꼬리표 한 줄 | 1 | 모두 |
| `src/app/globals.css` | `:root` 끝에 `--xl-*` 넷(필요하면 인쇄 `@page` 한 블록) | 7·11 | — |
| `src/app/theme.test.ts` · `src/app/fonts.test.ts` · `src/components/ui/classes.test.ts` | 예외 표 한 줄씩(`APP_DIRS`에 한 줄) | 7 | 화면을 더하는 갈래(`APP_DIRS`) |
| `src/components/shell/AppShell.tsx` · `shell.test.tsx` | `print:hidden`·`print:p-0` 세 곳, 시험 하나 | 11 | — |
| `src/components/shell/menu.ts`(`MenuHref` 줄) · `src/components/dashboard/briefing/features.ts` · `src/components/common/notReadyFeatures.ts` (+ 시험) | 업무일지 한 줄씩 | 12 | 통계·환자·매출 |
| `src/app/(app)/tabFrame.test.tsx` · `notReadyPages.test.tsx` · `src/app/titles.test.tsx` · `src/components/dashboard/briefing/DashboardHome.test.tsx` | 업무일지 줄, 목록에서 세는 기대 | 12 | 통계·환자·매출 |
| `phases/index.json` · `.harness/active` | phase 줄 더하기 · 활성 기능 이름 | — | 모두 |
| `eslint.config.mjs` · `src/guardrails.test.ts` · 도우미 `Sql.cs`·`Program.cs`·`commands.json` | **고치지 않는다**(Phase 4도 매출 명령을 불러 쓰기만) | — | 통계·환자·매출·사전점검 |

- **합칠 때 숫자 다시 맞춤**: 준비 중 개수(`notReadyFeatures.test.ts`의 `toHaveLength(10)` 같은 기대), `MenuHref` 합집합, 대시보드 `INDEX_SIDE`·준비 중·사용 가능 개수, `phases/index.json` 줄 순서, `.harness/active`. 이 명세의 시험은 목록에서 세게 바꾸지만(C5) 다른 갈래 시험에 남은 손 숫자는 합칠 때 맞춘다
- 사전점검 갈래가 막아 두라고 한 파일(`src/workers/precheck/jobs.ts`·`helper/…/Commands/*`·`SqlBitDb.cs`·`src/types/precheck.ts`)은 고치지 않는다. `src/lib/errors.ts`만 더하기로 고친다
- [백업 내려받기](사전점검 TASK-32 `lib/backup/tables.ts`)가 생기면 `worklog_days`를 그 표 목록에 더해야 한다. 이 명세 밖이다(그 TASK가 들어간 뒤 한 줄)

## 19. 사용자에게 물을 것

1. ~~비고 칸에 환자 이름이나 차트번호를 적으시나요?~~ — **답함(2026-11-01)**: 적지 않는다. 비고는 서버에 저장한다(전화·주민번호 모양은 그래도 막는다)
2. ~~휴대폰에서도 고쳐야 하나요?~~ — **답함(2026-11-01)**: 보기만. 업무사항은 폰에 보이지 않는다
3. **업무사항이 크롬 데이터 삭제나 PC 교체 때 사라져도 괜찮나요?** — **Claude 판단 (기본값)**: 괜찮다고 보고 백업하지 않는다(엑셀 파일을 PC에 두던 것과 같다). 화면에 "이 PC에만 저장돼요"를 보인다

## 20. 비트에서 채우기 (Phase 4, 2026-11-01 사용자 결정 더함)

### 20-1. 자료 길 (새 읽기 코드를 만들지 않는다)
```
[의원 PC] 업무일지 열기 → useBridge() (components/claim/useBridge, 고치지 않음)
   ready → bridge.call('revenue.days', {from: 그날, to: 그날})   ← 매출 갈래 명령(숫자 명령, 환자 줄 없음, 답 검사 isRevenueDays는 lib/bridge)
   → bitValuesFrom(그날 줄)(순수) → mergeBit(빈 칸만 채움 · 다르면 알림) → 화면 값 + bitFields
   → 자동 저장(worklog_days + bit_fields)
[폰(터치 기기)·다른 PC] 저장된 값과 bit_fields 표시만. 비트 읽기 없음
```
- **모든 비트 숫자는 매출 명령 `revenue.days` 하나에서 온다**(`specs/revenue/design.md` 5-2·5-4절): 금액은 양지바른 일일보고 기준(외래환자경영통계, 회계일 = 수납일 기준 정상수납 + 미수입금), 신환·재진은 접수일 기준 `newPatients`·`returnVisits`(= `visits − newPatients`). 환불·변경수납·예치금이 있는 날은 금액 일곱 칸이 `null` + `unconfirmed`(확인 필요) → 업무일지는 그날 **금액 칸만** 채우지 않고 "이 날은 비트 금액 확인이 필요해요. 직접 적어 주세요"를 보인다. 신환·재진은 그날도 채운다(`null`이 아니면)
- 업무일지 자신은 도우미·명령 표·통로·검사·Worker를 고치지 않고, 통계 갈래의 길(`stats.rows`·Worker·저장 숫자)도 쓰지 않는다
- `sales_days`(매출 저장 표)에 쓰지 않는다(매출 5-4절: 하루만 따로 쓰는 길은 없다). 업무일지는 자기 표 `worklog_days`에만 쓴다

### 20-2. 칸 맞춤 표 (매출 계약 `specs/revenue/design.md` 5-2절 그대로 — TASK-19 의원 PC 확인으로 확정)

| 업무일지 칸(열쇠) | `revenue.days` 칸 | DB 칸 | 채우기 |
|---|---|---|---|
| 신환(`newPatients`) | `newPatients` | `new_patients` | 채움(`unconfirmed`인 날도) |
| 재진(`returnPatients`) | `returnVisits` | `return_patients` | 채움(`unconfirmed`인 날도) |
| 총진료비(`totalFee`) | `total` | `total_fee` | 채움 |
| 조합청구액(`claimAmount`) | `insurer` | `claim_amount` | 채움 |
| 현금수납(`cashIn`) | `cash` | `cash_in` | 채움 |
| 카드수납(`cardIn`) | `card` | `card_in` | 채움 |
| 계좌이체(`transferIn`) | `transfer` | `transfer_in` | 채움 |
| 미수입금(`unpaidPaid`) | `receivableIn` | `unpaid_paid` | 채움 |
| 미수발생(`unpaidNew`) | — | `unpaid_new` | **계약에 생기기 전에는 안 채움** |
| 지역화폐(`localCurrencyIn`) | — | `local_currency_in` | **계약에 생기기 전에는 안 채움** |
| 지출 넷·비고·업무사항 | — | — | 손으로만 **(사용자)** |

- 값이 `null`인 칸은 비트 값이 없는 것으로 본다(지어내지 않는다). `visits`·`noncovered`·`patientsToDate`는 업무일지에 칸이 없어 쓰지 않는다

### 20-3. 맞추는 규칙 (`src/lib/worklog/bitFill.ts`, 순수 함수)
```ts
export type BitValues = Partial<Record<WorklogNumberKey, number>>       // 값이 있는 칸만
export const BIT_FILL_KEYS: readonly WorklogNumberKey[]                  // 20-2절 '채움' 여덟 칸
export function bitValuesFrom(revenueDay: RevenueDayRow | null): { values: BitValues; unconfirmed: boolean }
export type BitMerge = { day: WorklogDay; bitFields: WorklogNumberKey[]; changed: boolean; differs: Array<{ key: WorklogNumberKey; typed: number; bit: number }> }
export function mergeBit(day: WorklogDay, bitFields: readonly WorklogNumberKey[], bit: BitValues): BitMerge
export function takeBitValue(day: WorklogDay, bitFields: readonly WorklogNumberKey[], key: WorklogNumberKey, bit: BitValues): BitMerge   // [비트 숫자로 바꾸기]
```
- 빈 칸 → 채우고 비트 칸. 비트 칸 → 비트 값을 따라간다. 손으로 적은 칸 → 그대로 두고 다르면 `differs`. 사람이 칸을 고치면 화면이 그 칸을 `bitFields`에서 뺀다
- 비트 칸을 사람이 비우면 다음 비트 읽기에서 다시 채워진다(빈 칸 = 아직 안 적음). "0"을 뜻하면 0을 적는다 — 위험에 적는다 **(Claude 판단)**

### 20-4. 비트 칸 표시 (`bit_fields`, TASK-15·16·17)
- `alter table public.worklog_days add column bit_fields text[] not null default '{}' check (bit_fields <@ array['new_patients', 'return_patients', 'total_fee', 'claim_amount', 'cash_in', 'card_in', 'transfer_in', 'local_currency_in', 'unpaid_new', 'unpaid_paid']::text[])` + `grant insert (bit_fields), update (bit_fields) on table public.worklog_days to authenticated`(정책은 그대로 `my_hospital_id()`). 새 migration 파일 `20261101000110_worklog_bit_fields.sql`(TASK-4 파일은 고치지 않는다). 나중에 계약에 칸이 생길 것을 생각해 check 목록은 열 칸 모두를 받는다
- 저장해 두는 까닭: 폰·다른 PC에서도 어느 칸이 비트에서 왔는지 보이고, 다시 열어도 '비트 칸은 따라가고 적은 칸은 지킨다'가 이어진다 **(Claude 판단)**
- **자동 저장 길 전체가 `bitFields`를 나른다**(TASK-16·17): `loadWorklogDay` → `{ day, bitFields }`, `saveWorklogDay(client, ymd, day, bitFields?)`, 자동 저장 `change(ymd, day, bitFields?)`·`pendingDay(ymd)` → `{ day, bitFields? }`, `worklogSession`의 `save`도 같은 모양. **`bitFields`를 받지 않은 저장은 `bit_fields` 칸을 보내지 않는다**(빈 목록 `[]`을 보내 저장된 표시를 지우지 않게) — 비트를 읽지 않는 화면(폰·연결 안 된 PC)·앱 안 이동 뒤 저장이 표시를 지우지 않는다
- 목록 밖 이름은 버린다(열쇠 이름 ↔ DB 칸 이름)
- **합치기·배포 관문**: TASK-16 뒤로 읽기·쓰기가 `bit_fields`를 쓴다 → `20261101000110_worklog_bit_fields.sql`을 실제 Supabase에 붙여 넣기 전(사용자 OK)에는 Phase 4를 main에 합치거나 배포하지 않는다. 붙여 넣은 뒤 실제 Supabase 확인(TASK-18)을 하고, **TASK-18 통과 전에는 4단계를 합치거나 배포하지 않는다**

### 20-5. 화면 (TASK-17)
- 비트 칸: 칸 모서리 작은 표시(엑셀 메모 표시처럼, `--xl-focus` 색) + 양식 아래 한 줄 "표시한 칸은 비트에서 불러온 숫자예요". 인쇄에서는 숨긴다
- 다른 칸: 양식 아래 목록 "현금수납 · 적은 값 120,000원 · 비트 125,000원 [비트 숫자로 바꾸기]"(`ds.button.secondarySmall`)
- 안내 한 줄(날짜 줄 아래, 오류 카드 아님): 연결 안 됨 "비트 PC가 연결되지 않아 직접 적어요" · 확장/도우미 없음·옛 판 "비트 PC 연결을 마치면 숫자를 저절로 채워요"(`/claim/setup` 글자 링크)(통로 오류 `E-BRIDGE-REJECTED`·`E-HELPER-UNKNOWN-COMMAND`도 이 '확장/도우미 새 버전' 상태로 본다 — 매출 설계 5절과 같음, '읽기 실패'가 아니다) · 읽기 실패 "비트 숫자를 불러오지 못했어요. 직접 적어도 돼요" · 확인 필요 날 "이 날은 환불·예치금이 있어 비트 금액을 확인해야 해요. 금액은 직접 적어 주세요"
- 다시 읽기: 그날을 열 때, 날짜를 옮길 때, 오늘이면 화면이 보이는 동안 10분마다. 터치 기기(보기만, `readOnly` — 11-3절과 같은 판정)에서는 읽지 않는다
- **화면 시안이 먼저다**: 이 표시·목록·안내는 승인된 시안 v2에 없다 → TASK-17 전에 시안을 더해(예시 숫자) 사용자 OK를 받는다(CLAUDE.md 화면 규칙)

### 20-6. 의원 PC 확인 (TASK-19, 코드 없음, Phase 4 배포 뒤)
- 총괄이 지난 날 사흘(환불 없는 날 둘 + 환불 있는 날 하나)을 골라 **업무일지 화면(비트가 채운 칸)**·그날 엑셀 업무일지·비트 '외래환자경영통계'를 칸마다 견준다: 날짜별 신환·재진, 수납 나눔(현금·카드·계좌·미수입금), 총진료비, 조합청구액(= 공단부담인지), 그리고 미수발생·지역화폐가 비트에 따로 있는지
- 수납 나눔과 날짜별 신환·재진은 **매출 갈래가 넘긴 확인**이다(그 칸은 매출 탭에 없고 업무일지 화면에만 그려진다, `specs/revenue/design.md` 5절)
- 결과는 `docs/worklog/bit-check.md`에 "같음 / 다름(어떻게) / 비트에 없음"으로만 적는다(숫자는 적지 않는다 — 실제 매출 숫자는 저장소에 두지 않는다)
- 20-2절과 다르면 명세를 고친다(채우는 칸 목록). 미수발생·지역화폐가 비트에 있거나 수납 나눔·신환·재진 기준이 다르면 매출 갈래에 계약 변경을 알린다

### 20-7. 더하는 위험
- 엑셀 업무일지 숫자가 진료일 기준이었다면 수납일 기준인 비트 금액과 날마다 조금 다를 수 있다. 신환·재진은 접수일 기준이라 엑셀과 같을 가능성이 높다 → TASK-19가 확인한다
- 오늘은 진료 중 숫자가 늘어난다: 비트 칸은 10분마다 따라가고, 사람이 고친 칸은 '다름'으로만 알린다
- `bit_fields` 칸이 실제 Supabase에 없는데 Phase 4가 배포되면 읽기·쓰기가 모두 실패한다 → 20-4절 관문

### 20-8. 겹치는 파일 (Phase 4)
| 파일 | 하는 일 |
|---|---|
| `src/components/claim/useBridge.ts` · `src/lib/bridge/*` · `src/types/revenue.ts` | 불러 쓰기만(고치지 않음) |
| `src/lib/storage/worklogDays.ts` · `src/lib/worklog/autosave.ts` · `src/types/worklog.ts` · `src/components/worklog/*` | 이 명세 파일(Phase 1~3에서 만든 것)에 `bitFields`·표시 더하기 |
| `supabase/migrations/` | 새 파일 `20261101000110_worklog_bit_fields.sql`(C2) |

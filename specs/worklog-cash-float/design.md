# 설계: 업무일지 현금 시재

## 개요
- 업무일지 하루 줄(`worklog_days`)에 시재 칸 12개(장수 8 · 그날 시재 · 확인란 2 · 이유)를 더하고, 병원 설정 표 `worklog_settings`(시재 금액 하나)를 새로 만든다(새 migration 하나)
- 시재는 칸 목록(`WORKLOG_CELL_KEYS` 32칸)에 넣지 않는다. 업무사항 글씨 크기(`memoFontPt`)·비트 칸 목록과 같은 길로 나른다: 읽기가 함께 읽고, 자동 저장이 "아는 값·최신 값"을 칸마다 들고 **바뀐 시재 칸만** 보내며, 모르면 보내지 않는다
- 계산·추측은 순수 모듈 `src/lib/worklog/cashFloat.ts` 한 곳. 화면은 양식 아래 새 상자 `CashFloatBox`(양식은 그대로)
- 새 오류 번호는 없다(저장 실패·막힌 글은 지금 `E-WORKLOG-SAVE-FAILED`·`E-WORKLOG-NOTE-PRIVATE`, 설정 화면은 `E-SETTINGS-FAILED`)

## 코드로 확인한 것 (b25e50f)
- 저장 길: `WorklogScreen` → `useWorklogDay`(날짜별 `Slot`) → `worklogSession.worklogAutosave()` → `createAutosave`(`save(ymd, changes, bits?, font?)`, `serverDay(ymd, server, focus, bits?, font?)`) → `saveWorklogDay(client, ymd, changes, bits?, font?)`. 크기·목록은 "모르면 없음, 바뀌었을 때만, 안 넘기면 인자 수가 그대로"다
- 비트: `useBitFill`이 `revenue.days`를 읽어 `bit.values.cashIn`(= 비트 현금, 확인 필요 날은 없음)·`bit.lastReadAt`·`bit.status`를 준다. [비트 숫자로 바꾸기]는 `WorklogScreen.onTakeBit(key)` → `applyBit(takeBitValue(…))` → `autosave.change`
- 막힌 칸: `blockedCellKeys`(notes.ts) → 자동 저장 `snapshot().blocked` → 날짜 줄 `E-WORKLOG-NOTE-PRIVATE` 카드·상태 "빨간 칸 빼고 저장했어요"
- 병원 설정 표 `claim_hospital_settings`는 청구 문구(phrases 필수 jsonb, 검사 막음)라 시재를 넣으면 문구가 없는 병원은 저장할 수 없다 → 새 표
- **Postgres upsert 함정**: `insert … on conflict do update`는 충돌을 보기 전에 넣을 줄로 not null·check를 검사한다. 그래서 "장수가 있으면 시재가 있어야 한다" 같은 칸끼리 묶는 제약을 두면, 장수만 보내는 upsert가 서버 줄에 시재가 있어도 거부된다 → 그 규칙은 코드(`withFloatSnapshot`)가 지키고 DB에는 두지 않는다. 새 칸은 모두 기본값이 있거나 null 허용이다
- migration 이름 `20261105000300`은 모든 갈래·명세에서 비어 있다. REQ 1601~는 비어 있다

## 구성 요소 / 인터페이스

### 규칙 (`src/types/worklog.ts` · `src/lib/worklog/cashFloat.ts`, TASK-1)
```ts
// types/worklog.ts 에 더함
export const CASH_PIECES = [50000, 10000, 5000, 1000, 500, 100, 50, 10] as const
export type CashPiece = (typeof CASH_PIECES)[number]
export type CashCountKey = `count${CashPiece}`
export const CASH_COUNT_KEYS: readonly CashCountKey[]          // CASH_PIECES 차례
export type WorklogCash = Record<CashCountKey, number> & {
  floatWon: number | null   // 그날 쓴 시재(처음 장수를 적을 때 설정 금액). null = 아직 안 셈
  refundCash: boolean       // 환불을 현금으로 돌려줌
  unpaidCash: boolean       // 미수입금을 현금으로 받음
  reason: string            // 차이 이유, '' = 없음
}
export type WorklogCashKey = keyof WorklogCash
export type WorklogCashChanges = Partial<WorklogCash>
export type WorklogBlockedKey = WorklogCellKey | 'cashReason'
export const CASH_FLOAT_DEFAULT = 300_000, CASH_FLOAT_MAX = 10_000_000, CASH_COUNT_MAX = 9999, CASH_REASON_MAX = 200
export const WORKLOG_CASH_COLUMNS: Readonly<Record<WorklogCashKey, string>>
  // count50000 → cash_count_50000 … count10 → cash_count_10, floatWon → cash_float,
  // refundCash → cash_refund_cash, unpaidCash → cash_unpaid_cash, reason → cash_reason
export function emptyWorklogCash(): WorklogCash
export type WorklogSavedDay = { day; bitFields; memoFontPt?; cash?: WorklogCash }   // cash 선택(지금 시험 mock 그대로 타입 통과)

// lib/worklog/cashFloat.ts (순수 함수)
export function countedWon(cash: WorklogCash): number
export function hasCount(cash: WorklogCash): boolean
export function expectedWon(day: WorklogDay, cash: WorklogCash, floatWon: number | null): number | null
export function cellAmount(day: WorklogDay, key: 'cashIn' | 'spendCash' | 'spendRefund' | 'unpaidPaid'): number  // readCell, 숫자 아님 → 0
export type CashVerdict = { kind: 'not-counted' } | { kind: 'no-float' } | { kind: 'match' } | { kind: 'short' | 'over'; won: number }
export function cashVerdict(cash: WorklogCash, expected: number | null): CashVerdict
export type CashGuess =
  | { kind: 'bit-cash'; typed: number; bit: number; gap: number }   // gap = typed − bit
  | { kind: 'change'; piece: 50000 | 10000 | 5000 | 1000; count: 1 | 2; direction: 'more' | 'less' }
  | { kind: 'none' }
export function guessCashDifference(diff: number, typedCashIn: number | null, bitCashIn: number | undefined): CashGuess[]
export function toCashCount(text: string): number                 // 숫자만, 앞 4자리
export function parseFloatSetting(text: string): number | 'invalid' | 'too-big'   // 쉼표·빈칸·끝 '원' 허용
export function withFloatSnapshot(cash: WorklogCash, settingWon: number): WorklogCash
export function toWorklogCash(values: Partial<Record<WorklogCashKey, unknown>>): WorklogCash   // 읽은 값 거르기
export function cashSaveValue(key: WorklogCashKey, value: WorklogCash[WorklogCashKey]): number | boolean | string | null | undefined  // 보낼 값, undefined = 보내지 않음
export function cashReasonBlocked(reason: string): boolean       // notes.privacyProblem
export function wonText(n: number): string                       // '147,000원'
```
- 있어야 할 돈의 칸은 일지 글자를 `cellText.readCell`로 읽는다(합계와 같은 규칙). 숫자가 아니면 0이고 확인란도 숨는다(AC-1605.3)
- 거스름돈 추측: |diff|를 [50000, 10000, 5000, 1000] 차례로 보고 처음 나누어떨어지고 몫이 1~2인 권종 하나(시안 그대로)
- 장수·시재·확인란 값은 원 단위 정수·참거짓이라 나눗셈·반올림이 없다

### DB: `supabase/migrations/20261105000300_worklog_cash_float.sql` (TASK-2)
```sql
-- 업무일지 현금 시재 (worklog-cash-float REQ-1602): 그날 센 장수·그날 시재·환불/미수입금 현금 표시·차이 이유, 병원 시재 설정
-- 실행: 운영자가 Supabase SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 0100(업무일지)·0110(비트 칸)·0200(업무사항 글씨 크기)이 먼저 들어가 있어야 한다.
-- 관문: 새 화면부터 읽기가 이 칸들을 고른다. 이 파일을 붙여 넣기 전에는 새 화면을 사이트에 올리지 않는다(붙여 넣는 것은 지금 사이트에 해가 없다).
-- 칸끼리 묶는 제약은 두지 않는다: upsert는 충돌 전에 넣을 줄을 검사해 장수만 보낸 저장이 거부된다. 두 번 붙여 넣어도 그대로다
alter table public.worklog_days
  add column if not exists cash_count_50000 integer not null default 0 check (cash_count_50000 between 0 and 9999),
  -- … cash_count_10000 · 5000 · 1000 · 500 · 100 · 50 · 10 같은 모양
  add column if not exists cash_float integer check (cash_float between 0 and 10000000),
  add column if not exists cash_refund_cash boolean not null default false,
  add column if not exists cash_unpaid_cash boolean not null default false,
  add column if not exists cash_reason text check (char_length(cash_reason) between 1 and 200);
grant insert (cash_count_50000, …, cash_reason), update (cash_count_50000, …, cash_reason) on table public.worklog_days to authenticated;

create table if not exists public.worklog_settings (
  hospital_id uuid primary key default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  cash_float integer not null default 300000 check (cash_float between 0 and 10000000)
);
alter table public.worklog_settings enable row level security;
revoke all on table public.worklog_settings from anon, authenticated;
grant select on table public.worklog_settings to authenticated;
grant insert (cash_float), update (cash_float) on table public.worklog_settings to authenticated;
drop policy if exists "승인된 내 병원 줄만" on public.worklog_settings;   -- 다시 붙여 넣어도 되게
create policy "승인된 내 병원 줄만" on public.worklog_settings
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
```
- 지우기 권한이 없다(`for all` 정책이어도 표 권한이 없으면 거부). 저장 시각 칸·방아쇠는 없다(업무일지와 같게)
- 시험: `supabase/worklog.rls.test.ts` 끝에 새 묶음(0200 묶음과 같은 방식, `SLOW`). PGlite: 흉내 → auth → 0100 → 0110 → 0200 → 시험 줄 → 실행 전 모양 → 0300 → 실행 뒤 모양 → 0300 한 번 더. `schemaSnapshot(added)`는 거를 칸 이름 **목록**도 받게 넓힌다(기본값·위 묶음 기대는 그대로). 같은 표 위라 `worklog_settings` 시험도 이 묶음에 둔다
- **실제 Supabase에 붙여 넣지 않는다**(사용자 단계)

### 읽기·저장 (`src/lib/storage/worklogDays.ts`, TASK-3 · `src/lib/storage/worklogSettings.ts`, TASK-4)
```ts
export async function loadWorklogDay(client, ymd): Promise<WorklogSavedDay | null>   // cash 늘 채움
export async function saveWorklogDay(client, ymd, changes, bitFields?, memoFontPt?, cash?: WorklogCashChanges): Promise<void>
// worklogSettings.ts (새 파일)
export async function loadCashFloatSetting(client): Promise<number>   // 줄 없음·범위 밖 → 300000
export async function saveCashFloatSetting(client, won: number): Promise<void>
```
- 읽기: `SELECT` 끝에 새 12칸(`WORKLOG_CASH_COLUMNS` 차례). `cash = toWorklogCash(칸 → 열쇠)`
- 저장: 받은 시재 칸마다 `cashSaveValue`(범위 밖·틀린 모양·개인정보 모양 이유 → 보내지 않음, 이유는 앞뒤 빈칸을 빼고 비면 null). `cash`가 `undefined`면 시재 칸이 없다
- 설정: `send`·`failIfOffline`은 `worklogDays.ts`와 같은 모양(던지면 `WorklogStorageError('failed')`, status 0 → `offline`). `WorklogStorageError`는 `worklogDays.ts`에서 불러온다. 별도 파일로 둔 까닭: 지금 화면 시험이 `worklogDays`를 가짜로 바꾸는데, 다른 표의 함수를 같은 파일에 두면 섞인다

### 자동 저장 (`src/lib/worklog/autosave.ts`, TASK-5)
```ts
save: (ymd, changes, bitFields?, memoFontPt?, cash?: WorklogCashChanges) => Promise<void>
export type AutosaveDay = { day; bitFields?; memoFontPt?; cash?: WorklogCash }
export type AutosaveSnapshot = { …; blocked: { ymd: string; fields: readonly WorklogBlockedKey[] } | null }
changeCash(ymd: string, cash: WorklogCash): void
serverDay(ymd, server, focusKey?, bitFields?, memoFontPt?, cash?: WorklogCash): AutosaveDay
```
- 날짜 칸에 `knownCash`·`latestCash`(`WorklogCash | null`, null = 모름)·`sendingCash`(`WorklogCashChanges | null`)
- 보낼 시재 `cashToSend(entry)`: 최신 시재를 알 때, `cashSaveValue`로 견줘 아는 시재(모르면 `emptyWorklogCash()`)와 다른 칸만. 이유가 막힌 모양이면 이유는 빼고 `blocked`에 `'cashReason'`. 아무 칸도 없으면 null
- `send`: 시재가 null이면 **지금과 똑같은** 부르기(인자 둘·셋·넷). 있으면 `save(ymd, changes, bits ?? undefined, font ?? undefined, cash)`
- `succeeded`: 보낸 칸을 `knownCash`에 얹는다. `failed`: 그대로
- `serverDay` 여섯째: 최신 시재를 모르면 아는·최신 = 받은 값. 알면 보내는 중이거나 저장 안 된 칸은 두고 나머지 칸만 받은 값
- `change`·`changeMemoFont`는 시재를 건드리지 않는다. `dayOf`는 최신 시재를 알 때만 `cash`를 넣는다

### 상자 (`src/components/worklog/CashFloatBox.tsx`, TASK-6)
```ts
export type CashGuessMode = { kind: 'bit'; bitCashIn: number | undefined } | { kind: 'other-pc' } | { kind: 'none' }
export type CashFloatBoxProps = {
  mode: 'edit' | 'locked' | 'view'        // edit = PC 읽기 끝남, locked = PC 불러오는 중·실패, view = 터치 기기
  day: WorklogDay                          // 일지 칸(읽기만)
  cash: WorklogCash
  floatWon: number | null                  // cash.floatWon ?? 설정 금액, 모르면 null
  floatSetting: 'ready' | 'loading' | 'error'
  guess: CashGuessMode
  saveText: string                         // 날짜 줄 저장 상태와 같은 글(aria-hidden)
  onCash(next: WorklogCash): void
  onTakeBitCash(): void
  onReloadFloat(): void
}
```
- 그림(PC, 768px 이상 두 칸 / 미만 한 칸, 시안 그대로):
```
현금 시재                                              저장했어요 · 18:05
┌ 세어 본 현금 ───────────┐  ┌ 있어야 할 돈 ─────────────────────┐
│ 종류   장수   금액       │  │ 시재 설정 금액            300,000원 │
│ 5만원권 [ 6]  300,000원  │  │ + 현금수납 일지           147,000원 │
│ …                        │  │ − 지출 현금 일지           12,000원 │
│ 합계          430,000원  │  │ − 환불 [ ]현금으로 돌려줌   8,000원 │
└──────────────────────────┘  │ + 미수입금 [ ]현금으로 받음 5,000원 │
                              │ 있어야 할 돈              435,000원 │
[ 5,000원 모자라요  세어 본 돈 430,000원 · 있어야 할 돈 435,000원 ]
  이렇게 생겼을 수 있어요 · (가)(나)(다)  /  다른 PC 한 줄
  차이 이유 (선택) [            ]  환자 이름·차트번호는 적지 않아요
```
- 앱 규칙(`ds`·토큰·Pretendard). 결과 상자 색은 토큰 `positive`/`negative`(soft 배경). 장수 칸 `ds.input` 폭 고정·오른쪽 맞춤·`inputMode="numeric"`·`maxLength={4}`, 768px 미만 44px
- 결과 글 자리는 `aria-live="polite"`(역할 없음). `role="status"`·`output`·`ErrorCard`를 쓰지 않는다(지금 화면 시험이 그것을 센다)
- [이 날만 고치기](AC-1605.8): 상자 안 작은 상태(열림·적는 글)만 들고, 저장은 `onCash({ ...cash, floatWon: n })` 한 번이다. 그래서 화면·자동 저장은 장수 칸과 같은 길(`changeCash` → 바뀐 칸 `floatWon`만)이고 새 저장 함수·새 칸이 없다. 설정(`worklog_settings`)은 건드리지 않는다
- 상자 맨 바깥 `print:hidden`. `view`는 머리(제목·저장 상태 글)·두 줄(세어 본 돈·있어야 할 돈)·결과·이유(읽기만)뿐

### 설정 칸 (`src/components/settings/CashFloatSetting.tsx`, TASK-7)
- 시안 '설정 · 시재 금액' 그대로. `SettingsPage`의 `DxLinks` 아래(뒤 TASK 주석 앞)에 놓는다. 읽기·저장은 `worklogSettings.ts`. 실패는 `ErrorCard code="E-SETTINGS-FAILED"`, 읽기 실패에 [다시 불러오기]
- 입력은 `parseFloatSetting`. 저장되면 칸 글을 쉼표 금액으로 다시 쓴다

### 화면 잇기 (TASK-8)
- `useWorklogDay`: `Slot`에 `cash?: WorklogCash`. **Slot을 새로 만드는 곳(`slotOf`·`setCell`·`setMemoFont`·`editBit`)이 모두 시재를 이어 간다.** `fromServer`는 `serverDay(…, 크기, saved === null ? emptyWorklogCash() : saved.cash ?? emptyWorklogCash())`. 새 `setCash(cash): boolean`(ready일 때만). 돌려주는 값에 `cash`(없으면 `emptyWorklogCash()`). `setCell`·`editBit`이 돌려주는 모양은 그대로(`{ day }`·`{ day, bitFields }`)
- 새 훅 `src/components/worklog/useCashFloatSetting.ts`: `useCashFloatSetting(enabled)` → `{ status: 'loading' | 'ready' | 'error'; won: number | null; reload() }`. `enabled`가 거짓(터치 기기)이면 읽지 않는다. 효과에서만 읽는다(서버 그리기에서 부르지 않는다)
- `worklogSession`: `save: (ymd, changes, bits, font, cash) => cash !== undefined ? saveWorklogDay(c, ymd, changes, bits, font, cash) : 지금 그대로`
- `WorklogToolbar.tsx`: `statusText`에 `export`만 붙인다(상자의 저장 상태 글을 같은 글로)
- `WorklogScreen`:
```ts
const setting = useCashFloatSetting(!viewOnly)
const floatWon = cash.floatWon ?? (setting.status === 'ready' ? setting.won : null)
function onCash(next: WorklogCash) {
  if (readOnly) return
  const snap = setting.status === 'ready' ? withFloatSnapshot(next, setting.won) : next
  if (snap.floatWon === null && hasCount(snap)) return          // 시재 없이 센 날을 만들지 않는다
  if (setCash(snap)) autosave.changeCash(ymd, snap)
}
const guess: CashGuessMode = viewOnly ? { kind: 'none' }
  : bitHere && BIT_READABLE.includes(bit.status) && bit.lastReadAt !== null ? { kind: 'bit', bitCashIn: bit.values.cashIn }
  : bit.status === 'not-connected' || bit.status === 'setup-needed' ? { kind: 'other-pc' } : { kind: 'none' }
// <BitSheetNotes …/> 아래에 <CashFloatBox mode={viewOnly ? 'view' : readOnly ? 'locked' : 'edit'} … onTakeBitCash={() => onTakeBit('cashIn')} />
```
- 차례: 날짜 줄 → 비트 안내 줄 → 양식 → 비트 설명·다름 목록 → **현금 시재 상자**(비트 설명은 양식 표시를 풀이하므로 양식 바로 밑에 둔다)
- 새 화면 시험은 새 파일 `WorklogScreen.cash.test.tsx`(지금 `WorklogScreen.test.tsx`와 같은 가짜들 + `worklogSettings` 가짜). 지금 화면 시험 파일은 고치지 않는다(글씨 크기 TASK-8과 겹치지 않게)

## 데이터 흐름
```
장수 칸 → CashFloatBox.onCash → WorklogScreen.onCash(withFloatSnapshot) → useWorklogDay.setCash(화면 바로)
        → autosave.changeCash → 800ms → save(그날, {}, undefined, undefined, { count5000: 2, floatWon: 300000 })
        → saveWorklogDay(…, 6번째) → upsert { work_date, cash_count_5000: 2, cash_float: 300000 } (RLS)
읽기 → loadWorklogDay → { day, bitFields, memoFontPt, cash } → serverDay(…, cash) → Slot → 상자
비트 답(이미 있음) → bit.values.cashIn → guessCashDifference(브라우저 안) → 상자 추측 글
설정 탭 → saveCashFloatSetting → worklog_settings / 업무일지 화면 열 때 loadCashFloatSetting
```
- 서버로 더 가는 것은 장수·시재 금액·켬/끔·이유 글뿐이다. 환자 자료·AI 경로와 상관없다(`worklog_days`는 AI 경로가 읽지 않는다). 추측은 그 PC에 이미 있는 비트 숫자로만 계산하고 어디에도 보내지 않는다

## 결정과 트레이드오프
- **칸 목록에 넣지 않는다**: 32칸을 못 박은 시험·칸 글자 규칙이 흔들린다. 글씨 크기와 같은 따로 나르는 길을 쓴다
- **시재 칸마다 바뀐 것만 보낸다**: 두 PC가 다른 권종을 고쳐도 서로 덮지 않는다(칸과 같은 이유)
- **그날 시재는 첫 장수 때 한 번**: 화면이 `withFloatSnapshot`으로 붙여 같은 저장에 보낸다. DB 묶음 제약은 upsert 함정 때문에 두지 않는다
- **설정 표를 새로**: 청구 설정 줄은 문구 검사에 묶여 있다
- **추측 모드는 비트 '다름' 목록 규칙을 따른다**: 다시 읽는 중에도 앞 값으로 보여 깜빡이지 않게 `BIT_READABLE` + 그날 읽기 한 번 끝남

## 시안과 다른 곳
| 시안 | 실제 | 까닭 |
|---|---|---|
| 상자 위 엑셀 양식 끝 조각(줄여 그림) | 실제 양식 전체가 위에 있다 | 시안이 줄여 그렸다 |
| 상자 머리 저장 글이 상자만의 흉내 | 날짜 줄 저장 상태와 같은 글(자동 저장 한 벌) | 같은 저장 상태(사용자 결정 9) |
| [비트 숫자로 고치기]가 현금수납만 바꿈 | 지금 [비트 숫자로 바꾸기]와 같은 길이라 다른 빈 비트 칸도 함께 맞춰질 수 있다 | 사용자 결정 7(지금 방법을 그대로) |
| 장수 칸 아무 자리 수 | 숫자만 4자리(9999장)까지 | DB 범위 |
| 설정 0원·빈 칸 모두 "숫자로 적어 주세요" | 0원은 된다(시재 없이 쓰는 병원), 1천만원 넘으면 따로 안내 | 범위를 분명히 |
| 시안 글꼴 IBM Plex Sans KR | 앱 Pretendard | UI_GUIDE |
| 시재 줄에 단추 없음, 작은 글 늘 "설정 금액" | 센 날은 [이 날만 고치기]와 작은 글 "이 날 금액" | 2026-11-05 사용자 추가 답 |

## 시안이 말하지 않아 정한 것
- requirements.md '이 명세에서 Claude가 정한 것' 10~14. 그 밖: 확인란은 금액이 지워져도 켜진 값이 남지만 계산에는 0이다. 그날 시재가 없는데 장수가 있는 줄(있으면 안 되지만)은 PC에서는 설정 금액으로 계산하고 휴대폰에서는 결과를 보이지 않는다(`no-float`)

## 다른 기능에 미치는 것
- 업무일지 양식·인쇄·비트 채우기·글씨 크기: 동작 그대로(상자는 양식 밖·인쇄 숨김, 그 저장들에 시재 없음)
- 설정 화면: 패널 하나 더함. 다른 갈래(병원 문구 TASK-18 등)가 `SettingsPage.tsx`를 고치면 합칠 때 한 줄이 겹칠 수 있다
- E2E `e2e/worklog-bit.spec.ts`: 고치지 않는다(새 칸은 기본값). 실제 DB에 0300을 붙인 뒤 돈다

## 기존 명세·시험과의 관계
- **승인된 `specs/worklog`·`specs/worklog-memo-font`는 고치지 않는다.** worklog AC-005.1·AC-016.1·memo-font AC-1503.1의 읽는 칸 목록에 새 12칸이, 읽은 모양에 `cash`가 더해진다
- 바꾸는 기존 기대(줄 번호는 b25e50f 기준, 그 뒤 옮겨졌으면 같은 기대를 찾는다):
  - `src/lib/storage/worklogDays.test.ts`: `SELECT` 상수(:28)에 새 12칸, 칸 차례 기대(:167)에 새 12칸, 읽은 모양 통째 기대 `toEqual({ day, bitFields, memoFontPt })` 아홉 곳(:176·:182~192·:199·:205·:523~526·:576·:582·:689·:719)에 `cash: emptyWorklogCash()`(:197의 모두 null 줄은 상수에서 만들어 그대로 빈 시재). 저장 쪽 기대는 하나도 바뀌지 않는다(TASK-3)
  - `src/components/worklog/useWorklogDay.test.tsx`: `serverDay` 부르기 기대 여섯 곳(:389·:581·:595·:609·:762·:875)에 여섯째 인자 `emptyWorklogCash()`(가짜 응답에 `cash`가 없음 → 빈 시재). `setCell`·`editBit` 돌려준 값 기대(:630·:707·:906)는 그대로(TASK-8)
  - `supabase/worklog.rls.test.ts`: `schemaSnapshot(added)`(:657)가 목록도 받게만 넓힌다. 0110·0200 묶음 기대는 그대로(TASK-2)
- **고치지 않은 채 통과해야 하는 것**(바뀌면 멈추고 보고한다):
  - `autosave.test.ts` 전부: 인자 수(:991·:1001·:1300·:1309·:1317), `save.mock.calls` 통째 배열(:1172~:1448), `serverDay`·`pendingDay` 통째 모양(:1086·:1133·:1218·:1336~1339·:1385~1395), `snapshot().blocked` 모양
  - `worklogSession.test.ts`(:77 인자 셋, 크기 다섯 인자 시험)
  - `WorklogScreen.test.tsx` 전부: 저장 상태 도움 함수(`getAllByRole('status')`에서 `OUTPUT` 뺀 것이 하나), `cardCodes`(`role="alert"` 전부), `rowTexts`(`listitem` 전부), `sheetCells`(표 '업무일지' 안), `button('다시 불러오기')`, `getByLabelText('현금수납')` 등 칸 이름, `document.body.textContent`에 '수정'·'고친 사람' 없음, `save.mock.calls[0]` 인자 수(:1483·:1506·:1958), 서버 그리기(:198). 지키는 방법: 상자는 표 밖, 안 센 날 `li`·`status`·`alert`·`output`이 없음, 설정 읽기 실패는 카드가 아닌 줄과 [시재 금액 다시 불러오기], 칸 이름은 "5만원권 장수"·"현금으로 돌려줌"·"현금으로 받음"·"차이 이유 (선택)"로 양식 이름과 다름. 이 파일의 가짜 클라이언트에는 `from`이 없어 설정 읽기가 실패 줄이 된다(그래도 위 기대에 닿지 않는다)
  - `WorklogToolbar.test.tsx`(단추 수 :265 등), `WorklogSheet.test.tsx`, `sheet.print.test.ts`·`sheet.style.test.ts`, `BitNotice.test.tsx`, `useBitFill.test.tsx`, `src/app/(app)/tabFrame.test.tsx`(설정 화면 import), `src/components/ui/classes.test.ts`, `src/guardrails.test.ts`

## 사용자가 할 일
1. **사이트에 올리기 전에** 운영 Supabase SQL 편집기에 `20261105000200_worklog_memo_font.sql`(아직이면)과 `supabase/migrations/20261105000300_worklog_cash_float.sql`을 이 차례로 붙여 한 번씩 실행한다. 빠뜨리면 업무일지가 모든 날 "불러오지 못했어요"가 된다. 먼저 붙여 넣는 것은 지금 사이트에 해가 없다
2. 사이트에 올리는 것은 사용자 말("배포해")로만 한다
3. 올린 뒤 손 확인(지난 날짜, 지어낸 숫자): ① 설정에서 시재 금액 저장 ② PC에서 장수 → 맞아요/모자라요 ③ 환불·미수입금 확인란 ④ 새로 고침해도 같음 ⑤ 휴대폰에서 결과만 ⑥ 인쇄 미리보기에 상자 없음 ⑦ 비트 PC에서 추측·[비트 숫자로 고치기] ⑧ 끝나면 그날 장수 지우기

## 위험 / 미해결 질문
- SQL 관문(위 1번). 새 화면은 읽을 때 새 칸을 고르므로 칸이 없는 DB에서는 모든 날 읽기가 실패한다
- 두 PC가 거의 동시에 첫 장수를 적으면 나중 PC의 설정 금액이 그날 시재가 된다(보통 같은 설정이라 같다)
- 설정을 틀리게 둔 채 센 날은 [이 날만 고치기]로 날마다 고쳐야 한다(여러 날 한 번에 고치기는 범위 밖)
- `WorklogScreen.tsx`·`WorklogToolbar.tsx`(`export` 한 단어)는 글씨 크기 TASK-8과 겹친다. 그 TASK가 합쳐진 뒤 만든다
- 화면 확인(TASK-9)은 이 서버(2 CPU·7.8GB·스왑 없음)에 다른 일이 없을 때 돌린다

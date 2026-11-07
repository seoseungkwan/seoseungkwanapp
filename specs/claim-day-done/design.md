# 설계: 메모 입력 현황에서 날짜를 직접 완료로 바꾸기

## 개요
- 완료 표시는 건수 표(`claim_day_counts`)를 고치지 않고 **새 표 `claim_day_closes`** 에 (병원, 날짜, 바꾼 시각) 한 줄로 둔다. '끝난 날'은 지금 규칙(남은 메모 0이고 진료 수가 같음) **또는** 완료 표시가 있는 날이다
- 바꾸는 곳은 밖에서 보는 화면(`OutsideCounts.tsx`) 하나다. 체크 칸으로 날을 골라 [완료로 저장] → 새 표에 넣기, 아래 접힌 "완료로 바꾼 날"의 [되돌리기] → 그 날짜 줄 지우기
- 비트 PC 청구 화면(`ClaimScreen.tsx`)은 날짜 목록을 읽을 때 완료 표시도 읽어 `dateList.ts`에 넘긴다. 화면 모양은 바꾸지 않는다(끝난 날 묶음에 들어갈 뿐)
- 서버 코드는 없다. 브라우저 → Supabase, 권한은 RLS(ADR-004)

## 화면 목업
- `docs/mockups/claim-day-done/index.html` (2026-11-08 사용자가 A/B 가운데 B를 고름. 휴대폰·PC 폭, 실패 보기 조작판). 실제 화면은 지금 `OutsideCounts`의 모양·부품(`ds.panel`·`ds.table.*`·`ds.chip.*`·`ErrorCard`)을 그대로 쓰고, 시안의 새 부분만 더한다:
  - 표 첫 칸: 체크 칸(`{M/D (요일)} 고르기`). 머리 칸은 비어 있다(읽기 프로그램용 이름 '고르기'는 숨김 글)
  - 'N일 남음' 아래 고르기 줄(옅은 파랑 바탕): 글 + [완료로 저장](주 단추). 저장 뒤에는 옅은 초록 바탕의 '{N}일을 완료로 바꿨어요' + [되돌리기](글 단추)
  - 고르기 줄 아래 오류 안내(`ErrorCard code="E-DAYCLOSE-FAILED"`), 실패 때만
  - 패널 맨 아래 `<details>` "완료로 바꾼 날 {N}"(접힘이 처음). 펼치면 안내 한 줄 + 표(날짜·'완료로 바꿈 · 시각' / 입력함 / 메모 필요 / '완료' 칩 / [되돌리기])
  - 시안의 조작판·앱 틀·글꼴 값은 시안용이다. 색·간격은 지금 토큰과 `ds`를 쓴다

## 구성 요소 / 인터페이스

### DB — `supabase/migrations/20261108000000_claim_day_closes.sql` (새 파일)
```sql
create table if not exists public.claim_day_closes (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  visit_date date not null,
  closed_at timestamptz not null default now(),
  primary key (hospital_id, visit_date)
);
alter table public.claim_day_closes enable row level security;
revoke all on table public.claim_day_closes from anon, authenticated;
grant select, delete on table public.claim_day_closes to authenticated;
grant insert (visit_date) on table public.claim_day_closes to authenticated;
drop policy if exists "승인된 내 병원 줄만" on public.claim_day_closes;
create policy "승인된 내 병원 줄만" on public.claim_day_closes
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
```
- 머리 주석은 지금 마이그레이션들처럼: 무엇·실행 방법(운영자가 SQL Editor에 붙여 한 번)·앞에 있어야 할 파일(`20261028000000_auth.sql`, `20261030000100_precheck_counts.sql`)·두 번 붙여도 그대로·관문(아래 '올리는 차례')
- 고치기(update) 권한은 주지 않는다. `closed_at`은 DB가 정하고 사람이 꾸밀 수 없다. 글자 칸이 없어 이름·차트번호·메모가 들어갈 수 없다(ADR-021)

### 저장소 — `src/lib/storage/claimDayCloses.ts` (새 파일)
```ts
export type ClaimDayClose = { visit_date: string; closed_at: string }
export class DayCloseError extends Error { readonly code: ErrorCode = 'E-DAYCLOSE-FAILED' }
/** 완료 표시 읽기. range가 있으면 그 기간(gte/lte), 없으면 최근 날부터 400줄. 표 없음(PGRST205·42P01·404) → [], 그 밖의 실패 → CountsReadError(claimCounts.ts의 것을 다시 쓴다) */
export function readClosedDays(sb: SupabaseClient, range?: DateRange): Promise<ClaimDayClose[]>
/** 날짜들을 완료로. 빈 목록이면 부르지 않는다. 같은 날은 하나로. 날짜가 하나라도 isYmd가 아니면 보내지 않고 DayCloseError.
 *  upsert(rows: {visit_date}[], { onConflict: 'hospital_id,visit_date', ignoreDuplicates: true }) — 이미 있으면 그대로(처음 시각 유지). 실패(표 없음 포함) → DayCloseError */
export function closeDays(sb: SupabaseClient, dates: readonly string[]): Promise<void>
/** 완료 표시 지우기. delete().in('visit_date', dates). 빈 목록이면 부르지 않는다. 검사·실패는 closeDays와 같다 */
export function reopenDays(sb: SupabaseClient, dates: readonly string[]): Promise<void>
```
- 표 없음 판정·`readRows`는 `claimCounts.ts`와 같은 규칙이다. 나눠 쓰려면 `claimCounts.ts`에서 내보내기만 더한다(동작은 그대로)
- `src/types/db.ts`: `ClaimDayCloseRow = { hospital_id: string; visit_date: string; closed_at: string }`
- `src/types/errors.ts`·`src/lib/errors.ts`·`src/lib/errors.test.ts`: `'E-DAYCLOSE-FAILED'` — what '완료 표시를 저장하지 못했어요', fix '고른 날짜는 그대로 있어요. 인터넷 연결을 확인하고 다시 눌러 주세요. 처음 쓰는 거라면 서버 준비(마이그레이션)가 끝났는지 확인해 주세요. 계속되면 오류 번호와 함께 문의해 주세요.'(문구는 '무엇이·어떻게·번호' 규칙)

### 날짜 목록 — `src/components/claim/dateList.ts`
```ts
export function buildDateList(days: readonly DayCount[], counts: readonly ClaimDayCount[], closed: ReadonlySet<string> = new Set()): DateRow[]
//   done = closed.has(day.date) || (left === 0 && count?.visits === day.visits)
export function listRange(today: string, counts: readonly ClaimDayCount[], closed: ReadonlySet<string> = new Set()): DateRange
//   oldestLeft는 closed에 없는 날만 본다
```
- 기본값이 빈 Set이라 지금 부르는 곳·시험은 그대로다. `unfinishedPeriod`·`defaultPeriod`·`statusOf`는 `done`을 따르므로 바꾸지 않는다

### 비트 PC 화면 — `src/components/claim/ClaimScreen.tsx`
- `loadDates`: 건수 읽기와 같은 범위(`addDays(today, -399)`~`today`)로 `readClosedDays`를 함께 부른다. 건수 실패 → 지금 그대로(counts = [], readFailed). 완료 표시만 실패 → closed = 빈 Set, readFailed = true. `buildDateList(days, counts, closed)`·`listRange(today, counts, closed)`
- `refreshDates`: 같이 읽고, 어느 쪽이든 실패하면 지금처럼 보던 목록을 둔다
- `remember(counts, mark)`(건수 올리기)는 건수만 받는다. 바꾸지 않는다

### 밖에서 보는 화면 — `src/components/claim/OutsideCounts.tsx`
- 읽기: `Promise.all([readOutsideCounts(sb), readClosedDays(sb)])`. 지금의 '마지막에 부른 답만 쓴다'(`ask === last`)와 창 초점 다시 읽기를 그대로 쓴다. 어느 하나라도 실패 → 지금처럼 `E-COUNTS-FAILED`
- 상태: `ready`에 `closed: ClaimDayClose[]`를 더한다. 화면 안 상태: `picked: Set<string>`, `saving: boolean`, `reopening: Set<string>`, `justSaved: string[] | null`, `failed: boolean`
- 그리는 값: `closedSet = new Set(closed.map(c => c.visit_date))`, 위 목록 = `counts.days.filter(d => !closedSet.has(d.visit_date))`, 'N일 남음' = 그 길이, 아래 칸 = `closed`(최근 날부터) + 같은 날짜의 건수 줄(있고 남은 메모가 있으면 숫자)
- 저장: `closeDays(sb, [...picked])` → 성공하면 다시 읽기(read()) 하고 `justSaved = 고른 날짜`, `picked` 비움. 실패하면 `failed = true`, 고른 것 그대로. 되돌리기: `reopenDays(sb, [date])`(알림 줄의 [되돌리기]는 `justSaved` 전부) → 성공하면 다시 읽기, 실패하면 `failed = true`
- 다시 읽기가 끝나기 전 사이에도 화면이 맞게: 저장·되돌리기 성공 직후 `closed`를 그 자리에서 고쳐 그린 뒤(시각은 서버 답이 올 때까지 지금 시각) 다시 읽은 답으로 바꾼다. 다시 읽기가 실패하면 고쳐 그린 화면을 둔다(저장은 이미 성공했다)
- 고르기 줄은 위 목록이 0줄이면 그리지 않는다. 체크 칸·[완료로 저장]은 `saving` 동안 막힌다
- 올린 건수가 하나도 없으면(`total === 0`, '아직 올린 건수가 없어요') 지금 그대로이고 고르기 줄·"완료로 바꾼 날"을 그리지 않는다
- 밖에서 보는 화면의 `readClosedDays`는 기간 없이(최근 날부터 400줄) 부른다
- 휴대폰 폭: 지금의 `max-md:hidden`/`md:hidden` 칸 나눔을 그대로 쓰고 체크 칸 칸만 더한다

## 데이터 흐름
```
[휴대폰·집 PC] OutsideCounts
  읽기: claim_day_counts·claim_month_counts·contact_counts (지금) + claim_day_closes (새) ──► 남은 날 = 남은 메모 있고 완료 표시 없는 날
  [완료로 저장]: closeDays → POST claim_day_closes [{visit_date}…] (on conflict do nothing)
  [되돌리기]:   reopenDays → DELETE claim_day_closes where visit_date in (…)
                                   ▲ RLS: 승인된 내 병원 줄만
[비트 PC] ClaimScreen.loadDates/refreshDates
  readDayCounts + readClosedDays(같은 400일) ──► buildDateList(days, counts, closed) / listRange(today, counts, closed)
  건수 올리기(useCountsUpload → claim_day_counts)는 그대로. 완료 표시와 서로 건드리지 않는다
```

## 결정과 트레이드오프
- **새 표 vs 건수 표에 칸 더하기**: 건수 표에 칸을 더하면 `touch_updated_at` 트리거가 `updated_at`을 바꿔 '마지막으로 바뀐 시각 · 비트 PC에서 올라옴'이 틀리고, 되돌리기가 '칸 비우기'라 고치기 권한이 늘어난다. 새 표는 넣기·지우기만으로 끝나고 건수 올리기와 서로 묶이지 않는다 → 새 표
- **'끝난 날' 정의를 넓힘**: `done = 완료 표시 || 지금 규칙`. 비트 PC에서 [입력 안 된 날짜 모두]가 그 날을 건너뛴다. 그 날에 다시 일을 하려면 기간을 직접 고르거나 되돌린다(지금도 끝난 날은 고를 수 있다)
- **저장 뒤 다시 읽기**: 화면은 곧바로 고쳐 그리고, 다시 읽어 서버와 맞춘다. 다른 창의 저장도 창 초점 다시 읽기로 맞는다(실시간 알림은 범위 밖)
- **ADR-021(서버에는 숫자와 설정만)**: 새 표는 날짜·시각뿐이다. CLAUDE.md의 '완료 표시는 도우미가 그 PC에 암호화'는 **환자별** 완료 표시이고, 이것은 **날짜별** 표시라 환자와 이어지지 않는다
- **되돌리기는 바로 저장**: 사용자가 고른 B는 '고른 뒤 저장'이지만, 되돌리기는 드물고 한 줄씩이라 묻지 않고 바로 지운다(사용자에게 알림, 2026-11-08)

## 올리는 차례(관문)
1. 운영자가 `supabase/migrations/20261108000000_claim_day_closes.sql`을 Supabase SQL Editor에 붙여 한 번 실행한다
2. 그다음 사이트에 올린다. 거꾸로 올려도 해는 없다(표가 없으면 읽기는 완료 표시 없음, 저장만 `E-DAYCLOSE-FAILED`)

## 위험 / 미해결 질문
- PostgREST의 `ignoreDuplicates` upsert는 `on conflict do nothing`이라 고치기 권한 없이 된다. 실제 Supabase에서는 배포 뒤 한 번 눌러 확인한다(시험은 PGlite와 가짜 클라이언트)
- 완료 표시는 최근 400줄만 읽는다(건수 읽기와 같은 길이). 그보다 옛날 표시는 화면에 안 보이지만 해가 없다
- 휴대폰에서 49줄을 하나씩 체크하는 수고: '모두 고르기'는 범위 밖(필요하면 다음에)

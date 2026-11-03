# 설계: 통계 처방 골라 보기

## 개요
- 통계 탭 처방별 신환·재진 아래에 전체 폭 칸 `처방 골라 보기`를 더한다. 저장된 날 숫자(`stats_days`)로 그리므로 비트 PC가 아니어도, 휴대폰에서도 된다
- 숫자는 처방 추세가 쓰는 `buildTrend`·`rxRow`·`rxDetail`을 다시 쓴다. 그래프·표는 `StackedBarChart`·`ChartLegend`·`DetailToggle`·`NumberTable`·`DeltaText`를 쓴다
- 고른 처방은 새 표 `stats_rx_picks`에 한 줄씩 둔다. **새 표라서 사용자가 SQL 파일을 운영 Supabase에 손으로 붙여 넣어야 하고, 사이트에 올리기 전에 해야 한다**(아래 '사용자가 할 일')
- `30 초진` = 재진은 파서 값 표 한 줄과 안내 글 하나다. 맨 뒤 TASK라 빼도 나머지가 돈다

## 코드로 확인한 한계 (rx-picker 메모의 목록을 지금 코드에 다시 대 봄)
| # | 메모의 내용 | 확인 결과 | 근거 |
|---|---|---|---|
| 1 | 건수는 사람 수가 아니다. 날 칸 `patients`는 날 수, 건 = 날의 합 | 맞음. 처방별 신환·재진은 '명'이고 비트 불러온 뒤에만 있어 한 쪽의 두 표가 다를 수 있다. 합계는 두 처방 받은 사람을 빼지 못한다 | `aggregate.ts:284`, `rxTrend.ts:124`(건 = 그날 환자 수의 합), `RxSplitSection.tsx:16`, `StatsScreen.tsx:190` |
| 2 | 신환 기준이 길마다 다르다 | 맞음. 파일 = 줄의 표시, 비트 = 첫 내원일 = 그날. 어느 쪽도 '그 처방을 처음 받음'이 아니다 | `columnMap.ts:52`, `helperData.ts:239`·`253`, specs/stats/design.md:312 |
| 3 | 구분 없음 = 건수 − 신환 − 재진이고 데이터 변경 없이 그린다. 파일 길에서만 생긴다 | 맞음. `newPatients + returning ≤ patients`만 검사한다. 비트 길 `firstVisit`은 늘 참·거짓이라 `UNKNOWN`이 없다 | `validate.ts:92`, `aggregate.ts:197`·`280-282`, `helperData.ts:239` |
| 4 | 값별로 나눌 수 없다. 처방 줄 열쇠가 정해져 있다 | 맞음 | `validate.ts:29`, `validate.ts:39-44`(`exactly`) |
| 5 | `30 초진`은 `columnMap.ts`를 고치고, 저장된 날은 파일을 다시 넣어야 바뀐다 | 맞음. 끝난 옛 줄을 덜 끝난 새 줄로 덮지만 않는다. 다시 넣는 파일의 끝난 날은 바뀐다 | `columnMap.ts:50-52`, `20261101000200_stats.sql:116`, `SourcePicker.tsx:34-43`(`fileCovered`) |
| 6 | 찾기 목록은 더 읽어야 한다. 줄 없는 처방은 이름이 없다. `rxList`가 0건을 뺀다 | 맞음. 페이지는 지금·비교 기간만 읽는다. 넓은 읽기는 빈 판정에만 쓰고 버린다. `rxList`는 0건을 지우고 5줄로 자른다 | `useStatsData.ts:39-40`·`46`, `view.ts:363-364` |
| 7 | 건수 − 지난 기간 ≠ 증감일 수 있다 | 맞음. 다만 메모의 자리(`RxTrendSection.tsx:31`)는 안내 글이고 규칙은 `view.ts:326-334`(`keptPairs`·`comparableOf`), 안내 수는 `view.ts:368-373`이다 | 위 줄 |
| 8 | 고른 처방을 둘 곳이 없다 | 맞음. 아래 '저장 위치' | 아래 |
| 9 | 처방 추세 그래프는 신환 + 재진만 쌓아 구분 없음이 안 보인다 | 맞음. 이번에 고치지 않는다. 환자 수 추이(`view.ts:233`)·대시보드(`summary/view.ts:105`)도 같다 | `RxTrendSection.tsx:67` |

- **날 줄에 처방이 다 있는가: 코드로는 있다.** `toDayPayloads`가 칸의 `rx`를 자르지 않고 옮기고(`toDayPayloads.ts:26-28`), 파일·비트 두 길 모두 이 함수를 쓴다(`SourcePicker.tsx:50`, `workers/stats/jobs.ts:70`). `validate.ts:11` `MAX_RX` 5000. 다만 하루 줄은 65,536바이트까지다(`20261101000200_stats.sql`, `stats.ts:34`). 넘으면 잘리는 것이 아니라 저장 전체가 실패한다(`stats.ts:61-69`). 그래서 저장되어 있으면 그날 처방은 전부다
- **확인하지 못한 것**
  - `30 초진` 3,296줄·`진찰료산정안함` 88줄은 메모에만 있다. 코드·시험·문서 어디에도 이 글자가 없고 실제 파일은 열지 않았다. 띄어쓰기가 다를 수 있어 `readVisit`이 빈칸을 뺀 글자로 본다(`30초진`도 맞음). 맞는지는 파일을 다시 넣은 뒤 구분 없음이 줄어드는지로 사용자가 본다
  - 하루 줄 실제 크기, 넓은 읽기(최대 731일)의 실제 시간·용량은 재지 않았다(실제 자료 없음). 아래 '찾기 목록' 참고

## 구성 요소 / 인터페이스

### DB: `supabase/migrations/20261103000000_rx_picks.sql` (전체)
```sql
-- 통계 탭 '처방 골라 보기'에서 고른 처방(stats_rx_picks)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261028000000_auth.sql이 들어가 있어야 한다. 사이트에 올리기 전에 붙인다. 표가 없으면 이 칸만 읽기 오류를 보인다.
--
-- 왜: 고른 처방을 휴대폰과 컴퓨터에서 같이 보려고 계정에 둔다. 환자 자료 구역에는 브라우저 저장소를 쓰지 않는다.
-- 처방 코드와 이름뿐이고(통계 일 숫자에 이미 있는 값) 환자 칸은 없다.
--
-- 권한: 로그인 안 한 사용자(anon)는 아무것도 못 한다. 승인된 병원 사용자만 자기 병원 줄을 읽고 넣고 지운다.
-- hospital_id·pick_order는 칸 권한이 없어 DB가 정한다. 고치기는 아무에게도 없다(뺐다가 다시 넣으면 맨 뒤로 간다)

-- 여러 브랜치가 같이 쓰는 함수(cross-branch C1, 글자 그대로)
create or replace function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
  as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
revoke execute on function public.my_hospital_id() from public, anon;
grant execute on function public.my_hospital_id() to authenticated;

create table public.stats_rx_picks (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  code text not null check (char_length(code) between 1 and 100 and code !~ '[[:cntrl:]]'),
  name text not null check (char_length(name) <= 100 and name !~ '[[:cntrl:]]'),
  pick_order bigint generated always as identity,
  primary key (hospital_id, code)
);
-- 앱은 코드 대소문자를 가리지 않는다(buildTrend). 대소문자만 다른 코드를 또 고르지 못하게
create unique index stats_rx_picks_code_once on public.stats_rx_picks (hospital_id, upper(code));

alter table public.stats_rx_picks enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고 필요한 것만 준다
revoke all on table public.stats_rx_picks from anon, authenticated;
grant select, delete on table public.stats_rx_picks to authenticated;
grant insert (code, name) on table public.stats_rx_picks to authenticated;
-- Supabase는 순서표에도 기본 권한을 준다. 넣기는 이 권한이 없어도 된다(identity 칸은 순서표 권한을 보지 않는다)
revoke all on sequence public.stats_rx_picks_pick_order_seq from anon, authenticated;

-- (select …): 문장마다 한 번 계산한다. 승인되지 않은 병원은 null이라 아무 줄도 맞지 않는다
create policy "내 병원 고른 처방 읽기" on public.stats_rx_picks
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));
create policy "내 병원 고른 처방 넣기" on public.stats_rx_picks
  for insert to authenticated
  with check (hospital_id = (select public.my_hospital_id()));
create policy "내 병원 고른 처방 지우기" on public.stats_rx_picks
  for delete to authenticated
  using (hospital_id = (select public.my_hospital_id()));
```

### 저장 코드
```ts
// src/types/rxPicks.ts
export type RxPick = { code: string; name: string }

// src/lib/payload/validate.ts (더함)
export function validateRxPick(value: unknown): RxPick | null

// src/lib/storage/rxPicks.ts (stats.ts와 같은 모양, deps?.client ?? supabaseBrowser())
export class RxPickStoreError extends Error { readonly code: ErrorCode }
export function readRxPicks(deps?): Promise<RxPick[]>
export function addRxPick(pick: RxPick, deps?): Promise<'added' | 'already'>   // 'already' = 23505(저장된 글자는 다를 수 있다)
export function removeRxPick(storedCode: string, deps?): Promise<void>         // 받은 글자 그대로 지운다
export function clearRxPicks(deps?): Promise<void>                // .delete().gte('pick_order', 0): 조건 없는 지우기를 막는 설정에 걸리지 않게. 줄은 RLS가 고른다
```
- `lib/storage/stats.ts`의 `readAllPages`에 `export`만 붙여 쓴다(Supabase가 1000줄에서 말없이 자른다). 다른 곳은 고치지 않는다
- `src/types/db.ts`에 `StatsRxPickRow`, `src/types/errors.ts`·`lib/errors.ts`에 번호 둘을 더한다

### 숫자 (순수 함수, 시험은 가짜 일 줄)
```ts
// src/components/stats/view.ts (더함. 기존 rxRow·chunks·pointsByCode·rowsIn·codeKey를 쓴다)
export type RxLine = { code: string; name: string }  // RxPick과 같은 모양. view.ts는 지금처럼 타입을 밖에서 들여오지 않아도 된다
export function rxPickRows(input: StatsInput, picks: readonly RxLine[]): RxPickRow[]   // 부르기 전 codeKey로 합친다(AC-804.12)
export { codeKey }  // 지금 있는 대문자 규칙을 내보내 훅·목록이 같은 규칙을 쓴다
export type RxPickRow = RxTrendRow & { gapCount: number }  // partial은 표에 쓰지 않는다

// src/components/stats/rxPickView.ts (새 파일, 같은 소스 규칙: 화면·서버·저장소 없음)
export const COLUMN_NAME: Record<StatsPeriod, string>      // 지난 7일 · 지난 30일 · 지난 90일 · 작년 같은 달
export function rateText(part: number, whole: number): string     // whole 0 → '–'
export function addedRateText(row: RxPickRow): string             // 보이는 두 비율 글자의 합(천분율 정수로 더해 소수 오차 없음)
export function rxPickTotal(rows: readonly RxPickRow[]): RxPickRow | null   // 둘 이상일 때만
export function pickComparedNote(input: StatsInput): string | null          // rxComparedCells로 AC-805.7 첫 글
export function rxPeriodCounts(input: StatsInput): Map<string, number>  // 대문자 코드 → 표의 건수와 같은 셈(덮은 기간 안)
export const GRAIN_NAME: Record<StatsPeriod, '일' | '주' | '달'>
export function rxCatalog(days: readonly DayPayload[], extra: readonly RxLine[], check: (line: RxLine) => boolean): RxLine[]  // 코드당 최근 이름, 가나다 차례, check(validateRxPick)에 걸리면 뺌
export function searchCatalog(catalog: readonly RxLine[], query: string): RxLine[]
export function rxPickCopyText(args: { hospitalName: string; periodName: string; range: StatsRange; rows: readonly RxPickRow[]; total: RxPickRow | null }): string  // periodName은 부르는 쪽이 준다(PERIOD_NAME이 화면 파일에 있다)
```

### 훅
```ts
// src/components/stats/useRxPicks.ts
export type RxPicksView = {
  picks: readonly RxPick[]
  state: 'reading' | 'ready' | 'read-failed'
  saveFailed: boolean
  toggle(line: RxPick): void; remove(code: string): void; clear(): void
  reread(): void; retrySave(): void
}
export function useRxPicks(): RxPicksView

// src/components/stats/useRxCatalog.ts
export function useRxCatalog(today: string, revision: number): { days: readonly DayPayload[]; state: 'idle' | 'reading' | 'ready' | 'failed'; open(): void; retry(): void }
```
- `useRxPicks`: 요청을 줄(ref 배열)에 넣고 한 번에 하나만 보낸다. 실패하면 멈추고 남긴다. 다음 동작이나 [다시 저장]이 멈춘 곳부터 잇는다. 넣기·빼기는 두 번 보내도 결과가 같다(23505, 없는 줄 지우기 모두 성공)
  - 대소문자: 줄을 찾는 것은 언제나 `codeKey`이고 지우는 것은 언제나 저장된 글자다. `'already'`면 `readRxPicks`로 그 줄의 저장 글자를 받아 화면 값을 고친다. 저장된 `abc`를 화면이 `ABC`로 들고 있으면 지워도 0줄인데 성공으로 보여, 다시 열 때 돌아오기 때문이다
  - 내려간 뒤: 요청 줄은 React 상태 밖이라 끝까지 보낸다. 내려간 뒤에는 상태를 고치지 않고, 실패하면 버린다. 다음에 열면 서버가 기준이다. 같은 순간 다시 그린 칸은 아직 안 끝난 요청 앞의 목록을 볼 수 있지만 그 칸을 다시 열면 맞는다
- `useRxCatalog`: `open()`을 처음 부를 때 `readDays`로 넓은 범위를 읽어 일 줄을 React 상태에 둔다. `revision`이 바뀌면 다음 `open()`에 다시 읽는다(이미 열려 있으면 부르는 쪽이 `open()`을 다시 부른다). 읽기마다 번호를 두어 늦게 온 앞 답은 버린다(`useStatsData`의 `current`와 같은 방식)
- `useStatsData`: 돌려주는 값에 `revision: attempt`를 더한다(저장·[다시 읽기]마다 는다). 다른 값은 그대로다

### 화면 (`src/components/stats/sections/`)
| 파일 | 하는 일 | 받는 것 |
|---|---|---|
| `RxPickSearch.tsx` | 찾기 칸·목록·칩·[모두 지우기]. 혼자 상태를 갖는 것은 글자·활성 줄·열림뿐 | `catalog`·`picks`·`counts`·`catalogState`·`disabled`·`onToggle`·`onRemove`·`onClear`·`onOpen`·`onRetryCatalog` |
| `RxPickTable.tsx` | 뜻 줄·칸 머리·줄·얇은 띠(빗금 path 상수를 이 파일에 둔다)·합계·안내·[표 복사] | `input`·`rows`·`total`·`hospitalName`·`opened`·`onToggle`·`renderPanel(row)` |
| `RxPickDetail.tsx` | 열린 칸: 머리·단추 묶음·범례·그래프·안내·[자세히] | `line`·`input`·`mode`·`onMode` |
| `RxPickerSection.tsx` | 위 셋과 두 훅을 잇고 `opened`·`modes`를 든다(열쇠는 `codeKey`, 처방이 빠지면 둘 다 지운다). 칩 이름은 `rxPickRows` 줄의 이름을 넘긴다. 읽기·저장 오류 카드 | `input`·`saved`·`hospitalName`·`revision`·`className` |

- `RxTrendSection.tsx`는 `longLabel`·`tickLabel`·`comparisonAt`·`detailNote`에 `export`만 붙인다(처방 추세 화면은 그대로). 칸 이름 표(`GRAIN_NAME`)는 `RxPickTable`도 써야 해서 `rxPickView.ts`에 둔다
- `StatsSections.tsx`: 다섯째 칸 다음에 `RxPickerSection`. `revision`은 선택 prop(기본 0). 이 파일을 직접 그리는 `PeriodSummary.test.tsx`가 있어 필수로 하지 않는다
- `StatsScreen.tsx`: `WAITING`에 `{ title: '처방 골라 보기', place: 'col-span-12' }`, `data.revision`을 넘긴다

### 차트 부품 (`src/components/charts/`, 옵션을 주지 않으면 지금 그림 그대로)
- `StackedBarChart`: `BarSeries.tone`에 `'hatch-warning'` 추가. 그 계열 조각은 `bg-warning-soft` + `text-warning` 빗금 path(기존 `HATCH` 재사용, 패턴·id·그라데이션 없음). `hideZeroTotals?: boolean` 추가(합계 0인 칸의 글자를 그리지 않음)
- `ChartLegend`: `mark`에 `'hatch-warning'` 추가(10×10, `text-warning` 빗금)
- 시험: 지금 시험은 그대로 통과하고 새 값만 더한다. `rules.test.ts`(토큰 클래스·currentColor·서버에서 그림)를 지킨다
- 빗금이 두 곳이다: 막대 조각은 `StackedBarChart`의 `HATCH`(`:42`, 닿는 길이 440, compact 막대 20×160이라 충분)다. 얇은 띠는 이 상수를 쓰지 않는다. 내보내지 않았고 TASK-7은 그 파일을 고치지 못하며, 1024px 미만 띠는 전체 폭(최대 약 975px)이라 440으로는 끊긴다. 그래서 `RxPickTable.tsx`에 닿는 길이 1200의 path 상수를 따로 둔다
- `dense`는 쓰지 않는다. 처방 추세는 7/12 칸이라 16칸이 넘으면 `dense`(`RxTrendSection.tsx:105`)이지만, 이 칸은 전체 폭이고 시안은 30칸에도 글자를 둔다(시안 :498)

## 데이터 흐름
```
stats_days ─ readDays(지금·비교 기간) → useStatsData.input → rxPickRows → RxPickTable
                                                          └ rxDetail   → RxPickDetail
stats_days ─ readDays(넓은 범위, 처음 열 때) → useRxCatalog → rxCatalog + input.days + picks → RxPickSearch
stats_rx_picks ⇄ lib/storage/rxPicks ⇄ useRxPicks → RxPickSearch·rxPickRows
파일 → parseBitGrid(readVisit) → aggregate → toDayPayloads → saveStats (REQ-813은 이 길의 첫 칸만 바꾼다)
```
- 환자 자료 구역(`lib/parsers`·`lib/analytics`·`lib/payload`·`workers`)에 네트워크·저장소를 더하지 않는다. `validateRxPick`은 순수 함수다. `lib/storage/rxPicks.ts`는 구역 밖이고 구역에서 부를 수 없다(지금 `eslint.config.mjs`의 `lib/storage` 금지 그대로)
- 서버로 가는 값: 처방 코드·이름(`stats_days` 안에 이미 있는 값)뿐이다. `rx_groups`처럼 설정이다. 환자 칸은 없다

## 결정과 트레이드오프

### 저장 위치: 새 표 `stats_rx_picks`
| 후보 | 왜 아닌가 |
|---|---|
| `rx_groups`에 약속한 줄 하나 | ① `save_rx_groups`가 받은 목록에 없는 내 병원 줄을 **지운다**(`20261101000400_revenue.sql:100`). 매출 탭에서 묶음을 한 번 저장하면 고른 처방이 사라진다. ② 매출 묶음 화면·계산이 모든 줄을 치료 묶음으로 읽는다(`RevenueScreen.tsx:49`, specs/revenue/design.md:353 '순서상 첫 묶음'). 줄이 하나 있으면 "묶음이 없을 때의 제안"도 사라진다(`treatments.ts:19`). ③ 코드 모양이 `^[0-9A-Za-z가-힣_.-]{1,30}$`(`…revenue.sql:64`)인데 `validate.ts`는 100자·빈칸·괄호까지 받는다(`validate.ts:10`·`55`). 그런 처방은 찾아지는데 고르면 저장 실패다. ④ 이름 칸이 없어 0건 처방의 이름을 둘 곳이 없다. 고치려면 매출 코드·승인된 매출 명세를 건드린다 |
| `rx_groups`에 칸 더하기(`favorite`) | 묶음에 별표를 다는 일이지 처방을 고르는 일이 아니다. 낱개 처방마다 묶음을 만들면 ①②가 그대로다 |
| `claim_hospital_settings`에 칸 더하기 | 청구 설정 표이고 `phrases`가 필수라(`20261030000000_precheck_settings.sql`) 청구 설정을 저장한 적 없는 계정은 줄을 못 만든다. 통계가 청구 표에 기대게 된다 |
| 브라우저 저장소 | 기기마다 달라 결정 3과 어긋난다 |
- 대가: 사용자가 SQL을 손으로 붙여야 한다. `plan.md:36`은 즐겨찾기를 별표한 그룹으로, "코드 하나짜리 그룹도 만들 수 있다 → 표 하나로 끝난다"(Claude 판단)고 적었고 `plan.md:117`·`docs/ARCHITECTURE.md:85`도 같다. 위 ①~④ 때문에 낱개 처방 고르기는 그 표로 끝나지 않는다. 묶음 즐겨찾기 이야기는 그대로 두고 `plan.md` DB 표와 `docs/ARCHITECTURE.md` 표에 새 줄을 더한다(AC-815.3, TASK-1)

### 줄마다 한 행 vs 병원마다 한 행(jsonb)
- 줄마다 한 행을 고른다. 칸마다 DB 제약(`plan.md §0` "같은 효과면 코드 대신 DB 제약")이 걸리고, 코드 겹침은 고유 색인이 막고, 차례는 `pick_order`가 준다. 개수 한도가 필요 없다(시안 '고르는 개수 제한 없음')
- 무엇보다 **기기 사이에 덮어쓰지 않는다**. 컴퓨터 화면을 어제부터 열어 둔 채 휴대폰에서 C를 고르고, 컴퓨터에서 B를 빼도 C가 남는다. 목록 통째 저장이면 C가 사라진다(plan.md §10이 동시 수정 막기를 뒤로 미뤘으므로 여기서 버전 번호를 만들 수 없다)
- 대가: 화면에 요청 줄이 필요하다(AC-812.4). 누른 차례가 곧 저장 차례여야 해서 한 번에 하나씩 보낸다. 다른 기기의 바뀜은 그 화면을 다시 열어야 보인다(실시간 구독은 없다)

### 누구의 것인가: `hospital_id`로 묶는다(칸은 사용자 칸 없이)
- 지금 한 계정 = 한 병원이다(`hospitals.owner_id unique`, `20261028000000_auth.sql:12`, `my_hospital_id()`). 직원 계정은 plan.md §10으로 미뤘다. 그래서 병원으로 묶는 것이 곧 계정으로 묶는 것이고 다른 표(`docs/ARCHITECTURE.md:78` "모든 표에 hospital_id")와 같다
- 운영자(`admins`)도 자기 병원 줄만 본다. 남의 병원 고른 처방을 보는 길은 만들지 않는다
- 직원 계정이 생기면 그때 `user_id` 칸을 더하는 migration을 쓴다. 지금 빈 칸을 미리 두지 않는다

### 찾기 목록: 처음 열 때 넓게 한 번 읽는다
- `readDays`를 넓은 범위로 한 번 더 부른다. 검사(`validateDayPayload`)를 그대로 지나고 새 SQL이 없다. 기간 단추 [최근 12개월]이 이미 같은 범위를 읽으므로 새 부담의 크기를 아는 일이다. 처음 열 때만이라 찾기를 안 쓰는 날(고른 처방은 저장돼 있음)에는 들지 않는다
- 대안: 코드·이름만 돌려주는 DB 함수. 빠르지만 SQL이 늘고 줄 검사를 지나지 않은 값이 나온다. 넓은 읽기가 실제로 느리다고 사용자가 말하면 그때 더한다
- 달 줄(`stats_months`)은 쓰지 않는다. 파일 길의 덜 덮인 달은 저장하지 않아(`stats.ts:98`) 처방이 빠진다
- 고른 처방에 이름을 같이 저장한다. 목록을 읽기 전, 읽기 실패 때, 넓은 범위 밖으로 밀려난 처방도 이름이 있어야 칩·0건 줄을 그린다

### 표 줄은 처방 추세 함수를 다시 쓴다
- `rxRow`를 그대로 불러 처방 추세와 한 쪽에서 숫자가 어긋나지 않는다. 0건을 지우는 것(`view.ts:363`)과 5줄 자르기는 `rxList`의 일이라 `rxPickRows`에 넣지 않는다
- 건 기준의 비율은 '이미 정한 것' 1이다. 서로 다른 환자 수는 저장돼 있지 않아 기간 비율을 '명'으로 낼 길도 없다(한계 1). 안내 줄로 뜻을 적는다
- `plan.md:35`·`docs/PRD.md:17`은 처방별 신환율·재진율을 "그 처방을 받은 환자 중 비율"로 적었고 `CLAUDE.md:4`는 plan.md가 이긴다고 한다. 하루 안에서는 건 = 환자라 같고, 여러 날에서는 건 기준이 된다. 2026-11-03 사용자가 시안을 승인했고 건수 기준을 안내받았으며 이의를 말하지 않았다. 사용자가 또렷이 결정한 것으로 적지 않고, 이 칸에 한정한 날짜 줄을 두 문서에 더한다(REQ-815). 처방별 신환·재진 칸은 명 그대로다

### [표 복사]는 `CopyButton`을 쓰지 않는다
- 시안은 글 줄로 결과를 알리고 실패하면 읽기 전용 칸을 연다. `CopyButton`은 단추 글자를 2초 바꾸고 "표를 길게 눌러" 안내를 준다. 여기 표는 `div` 줄이라 길게 눌러 복사가 안 되므로 이 안내가 틀린다. `CopyButton`에 갈래를 넣으면 다른 칸 시험을 건드리므로, 이 칸 안에 짧게 둔다

### `30 초진` TASK를 맨 뒤에 둔다
- 앞 TASK는 시안 글자 그대로 동작한다. TASK-10은 `readVisit` 한 줄과 `GAP_NOTE` 상수만 바꾸고 뒤에 기대는 TASK가 없다. 빼려면 REQ-813과 TASK-10만 지우면 된다(명세가 바뀌니 다시 검토·승인)
- 빈칸을 뺀 글자로 비교한다(`value.replace(/\s+/g, '') === '30초진'`). 이 값 하나만 더하고 `초진`·`초진외`는 넓히지 않는다. 뜻이 다른 값을 재진에 넣지 않으려고

## 시안과 다른 곳 (까닭은 앱 규칙. 보고에 적는다)
| 시안 | 실제 | 까닭 |
|---|---|---|
| `새 칸` 칩 | 없음 | 시안에서 새 칸을 가리키는 표시로 본다. 영구 표시가 아니다 |
| 900px에서 쌓임 | 1024px에서 쌓임 | `classes.test.ts:671`이 `max-[…]` 폭 접두사를 막는다(허용: md·lg·max-md·max-lg). 칸 합계 폭(약 920px)도 900px 화면에 들어가지 않는다 |
| 증감 `↑ 12건 (+3.5%)` | `▲ 12건 (+3.5%) 늘어남` | 앱의 `DeltaText`·UI_GUIDE "화살표와 글자". 시안이 그린 처방 추세도 실제 앱은 ▲다. 증감 칸은 처방 추세와 같은 176px |
| 구분 없음 빗금 `repeating-linear-gradient` | svg path 빗금 | UI_GUIDE가 그라데이션을 막고 빗금은 path로 정해 뒀다 |
| 비교 막대가 이번 막대와 같은 폭 | 가는 막대 | `StackedBarChart`를 다시 쓴다(처방 추세 그래프와 같은 모양) |
| 줄 위아래 10px | 12px(`py-3`) | 간격 단계에 10px가 없다(`classes.test.ts:636`) |
| 주의 줄의 `30 초진` | '이미 정한 것' 2로 글자 바꿈(AC-813.5) | 재진으로 세자고 권했고 이의 없음 |
| `신환률`·`재진률`(사용자 말도 같음) | `신환율`·`재진율` | 앱 화면이 이미 이 글자다(`FeaturesSection.tsx:13-14`, `preview/sample.ts:72`), plan.md도 같다 |
| 설명 줄이 h2 아래(시안 :71) | h2 옆, 좁으면 아래로(`Section`의 `desc`, `parts.tsx:46`) | 통계 칸이 모두 같은 틀이다 |
| 안내 묶음 폭 72ch(시안 :165) | `max-w-160`(640px) | 통계 화면의 글 폭이 이 값이고(`StatsScreen.tsx:282`), 대괄호 임의 값을 쓰지 않는다 |
| 목록에서 뺐다 다시 고르면 그래프가 열린 채(시안 :580-586), 칩으로 빼면 닫힘(:618) | 어느 길로 빠져도 닫힘 | 빼는 길마다 달라지지 않게 규칙 하나로 한다 |
| 안내 줄 12개월만 | 날 기간에 덮이지 않은 날이 있을 때도 안내(AC-805.7) | 메모 한계 7. 시안 자료에는 구멍이 없어 안 그렸다 |
| 없음 | 저장된 숫자 없음(AC-801.3), 이 기간 자료 없음(AC-804.11), 읽는 중·읽기 실패·저장 실패(REQ-812), 목록 더 읽는 중·읽기 실패(AC-802.6) | 시안이 그리지 않은 상태다. 다른 칸의 빈 상태·오류 카드 규칙을 따른다 |

## 기존 명세·시험과의 관계
- **승인된 명세는 고치지 않는다.** specs/stats·stats-core·stats-file-rows의 승인이 그대로다
- specs/stats/requirements.md:163(처방코드 그룹·즐겨찾기 화면과 `rx_groups` 표는 범위 밖): 묶음을 만들지 않으므로 어긋나지 않는다. 고른 처방은 다른 표다
- specs/stats AC-513.1·AC-514.1·AC-514.10(일곱 칸 차례·기다리는 칸): AC-801.1·801.2가 대신한다. 다음 시험을 TASK-9에서 함께 고친다: `StatsScreen.test.tsx:51`(SECTIONS)·`:301`(시험 이름 '일곱 칸')·`:1215-1227`(배치), `PeriodSummary.test.tsx:45-49`(TITLES·이름)·`:264`(이름)·`:321`(`toHaveLength(7)`). `StatsScreen.test.tsx`의 `:307`·`:407`·`:900`·`:915`는 SECTIONS 길이를 따라가므로 저절로 맞는다. 두 파일에는 저장 코드 가짜도 더한다
- specs/stats AC-514.9: 숫자·이름을 브라우저 저장소에 두지 않는다는 뜻은 그대로이고 새 파일에도 같은 소스 검사를 건다(AC-812.6). 고른 처방의 코드·이름이 서버에 가는 것은 일 숫자 저장과 같은 값이다
- stats-core AC-004.2("표에 없는 초재진 값은 알 수 없음"): 값 표에 `30 초진`을 더해도 문장이 그대로 맞다. `columnMap.ts:49`의 주석은 고친다. **`30 초진`을 못 박은 시험·가짜 파일은 없다**(`src`·`fixtures`·`e2e`·`docs`·`specs` 찾음). 값 표 시험은 `초진외`·`기타`·`신환자`만 보고(`columnMap.test.ts:106-108`, `parseBit.test.ts:310`), `fixtures/make-fake-fixtures.ts:80`도 그 두 값이다. 그대로 통과한다
- specs/stats/design.md:312·323(파일과 비트 신환 기준이 다르다, 파일 안내 문장): 그대로다
- `plan.md`·`docs/PRD.md`: 승인 명세가 아니라 계획 문서다. 비율 기준 줄과 표 줄을 더한다(REQ-815). 그래야 부딪히지 않는다

### `30 초진`으로 숫자가 바뀌는 곳 (파일 길, 파일을 다시 넣은 날만)
- 통계 탭만 바뀐다: 기간 요약 재진 합계, 환자 수 추이 막대(신환 + 재진이라 높아진다), 처방 추세의 재진 글자·막대, 새 칸. 하루 평균 환자 수·요일별(`patients`)·처방 건수·신환·재방문율은 그대로다
- 대시보드는 바뀌지 않는다: 저장 숫자 자리는 늘 없음이고(`summary/source.ts:10-12`) 숫자는 비트를 바로 읽는다(`live/BitDashboard.tsx:87`·`98`, 비트 길은 `readVisit`을 쓰지 않는다). AI 리포트도 바뀌지 않는다: 달 읽기가 아직 늘 없음이다(`app/api/ai/store.ts:23-28`). `readDays`·`readMonths`를 부르는 화면은 `useStatsData.ts`뿐이다

## 사용자가 할 일
1. **사이트에 올리기 전에** `supabase/migrations/20261103000000_rx_picks.sql` 전체를 운영 Supabase SQL 편집기에 붙여 한 번 실행한다. 빠뜨리면 통계 탭의 이 칸만 오류 카드를 보이고 다른 칸은 그대로다
2. 파일로 넣어 둔 기간을 다시 넣는다(`30 초진`을 재진으로 다시 세려고). 안 넣으면 그 날들은 구분 없음으로 남고 안내 줄이 그 까닭을 말한다

## 위험 / 미해결 질문
- 넓은 범위 읽기가 휴대폰에서 느릴 수 있다(재지 못함). 처음 열 때 한 번뿐이고 목록은 화면에 있는 처방으로 먼저 나온다
- 처방이 1,000개를 넘으면 목록 줄이 많다. 가상 목록은 만들지 않는다
- 다른 기기에서 지운 처방이 열린 화면에 남을 수 있다. 다시 열면 맞는다
- E2E(TASK-11)는 SQL을 붙인 뒤에야 돌 수 있고 `next build`가 필요해 이 서버에서는 다른 일이 없을 때 돌린다(메모리 7.8GB, 스왑 없음)

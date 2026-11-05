# 설계: 통계 같은 처방 재방문(F/U률)

## 개요
- 처방 골라 보기 안, 건수 표 바로 아래에 묶음 `같은 처방 재방문`을 더한다. 고른 처방마다 "기간 안에 새로 시작한 환자 중 7·14·30일 안에 같은 처방을 또 받은 비율"과 "평균 몇 번 더"를 보인다
- **셈은 의원 PC 안에서만 한다.** 파일 길(Web Worker)과 비트 길(통계 Worker) 모두 `aggregate()`를 지나므로 거기서 환자를 날 사이로 이어 센다. 결과는 일 칸마다 처방별 `starts`·`back`·`more` 세 숫자뿐이고 환자 번호·날짜 목록은 칸 밖으로 나가지 않는다
- 서버에는 지금 저장 모양(`stats_days.payload` jsonb)에 칸 `again` 하나를 더해 날마다 저장한다. **jsonb 안의 칸이라 이 숫자에는 DB 마이그레이션이 필요 없다**(`20261101000200_stats.sql:41-47`은 `schemaVersion`·`day`·`partial`·크기만 본다)
- 고른 날 수(7·14·30)는 `RxPickerSection`의 React 상태다. 기간을 바꿔도 남고 다시 열면 늘 7일이다(2026-11-05 사용자 결정). 브라우저 저장소·서버 표를 쓰지 않는다
- **운영 SQL이 필요 없다.** 새 표·새 칸·새 함수가 없다
- 화면은 저장된 날 숫자로 그려서 휴대폰에서도 된다. 도우미·확장·`helperData.ts`·`columnMap.ts`는 바꾸지 않는다

## 코드로 확인한 길 (호출자가 읽어 둔 것을 지금 코드에 다시 대 봄)
| # | 내용 | 확인 결과 | 근거 |
|---|---|---|---|
| 1 | 파일 길은 날 사이의 같은 환자를 안다 | 맞음. 차트번호는 꼭 있는 칸이고, 번호는 한 번에 넣은 묶음 전체에서 한 번 매긴다. 따로 넣은 묶음끼리는 이어지지 않는다 | `columnMap.ts:10`, `analyzeFiles.ts:34`·`68` |
| 2 | 비트 길은 날 사이의 같은 환자를 안다 | 맞음. 진료 줄이 `[차트번호, 진료일, 처방코드, 첫 내원일]`이고 같은 `aggregate`를 지난다. 외래 줄만 온다(`outpatient: true`) | `helperData.ts:231-244`, `jobs.ts:41-42` |
| 3 | 세는 곳은 `aggregate.ts` | 맞음. 처방 칸은 이미 "같은 환자·같은 날·같은 처방 = 1건"이다. 입원 줄은 건너뛴다 | `aggregate.ts:194`·`200-201` |
| 4 | 신환 재방문처럼 날 숫자만 저장 | 맞음. 재방문은 센 그대로 칸에 두고, 창이 다 덮였는지는 요약이 정해 null(집계 중)로 저장한다 | `aggregate.ts:251-264`, `compare.ts:101-119`, `toMonthPayload.ts:14-22` |
| 5 | 저장 모양은 정한 열쇠만 받는다 | 맞음. `exactly()`가 열쇠 밖을 거부하고 날 줄 열쇠는 `DAY_KEYS` 여덟 개다 | `validate.ts:29`·`43-48` |
| 6 | DB 칸이면 마이그레이션 | 칸이 아니다. `payload` jsonb 안이고 표는 크기 65,536바이트만 본다. 넘으면 저장 전체가 실패한다 | `20261101000200_stats.sql:46`, `stats.ts:34`·`61-69` |
| 7 | 비트는 비교 기간 첫 달 1일 ~ 오늘만 | 맞음. 화면 읽기는 비교 기간 첫날 ~ 기간 끝만 읽는다 | `view.ts:134`, `useStatsData.ts:38-41` |
| 8 | 위쪽 신환 재방문율의 옮기기 | 최근 30일의 30일 줄만 오늘 − 60 ~ 오늘 − 31로 옮긴다. 이 기능은 시안대로 더 넓게 옮긴다(최근 7일은 세 창 모두) | `view.ts:133`, `view.ts:294-304` |
| 9 | 두 길 모두 `toDayPayloads`로 저장 | 맞음. 파일 길은 화면 쪽에서, 비트 길은 Worker에서 부른다. 두 곳 모두 `AnalysisResult`를 넘기므로 `again`은 칸(`BucketStats`) 안에 두면 부르는 곳을 고치지 않는다 | `SourcePicker.tsx:50`, `jobs.ts:70` |

- **확인하지 못한 것**: 실제 하루 줄 크기(실제 자료를 열지 않음). 처방 300개인 날을 어림하면 지금 약 51KB + `again` 약 18KB로 넘을 수 있다. 그래서 REQ-1304의 빼고 저장하는 길을 둔다

## 구성 요소 / 인터페이스

### 타입
```ts
// src/types/analysis.ts (TASK-2)
// 같은 처방 재방문 원래 숫자. 이 날 그 처방을 새로 시작한 (환자, 날) 수와, 그중 다음 날부터 7·14·30일째까지 같은 처방을 또 받은 수·더 받은 날 수의 합.
// 덮은 기간과 상관없이 센 그대로('집계 중'은 toDayPayloads가 정한다)
export type RxAgain = { code: string; starts: number; back: [number, number, number]; more: [number, number, number] }
// BucketStats에 더함: 일 칸에만 있다(주·달 칸에는 열쇠가 없다)
again?: RxAgain[]

// src/types/payload.ts (TASK-1)
export const AGAIN_WINDOWS = [7, 14, 30] as const
export type AgainWindow = (typeof AGAIN_WINDOWS)[number]
export type AgainCounts = [number | null, number | null, number | null] // 7·14·30일. null = 그 창이 아직 다 지나지 않음
export type DayAgainPayload = {
  ready: [boolean, boolean, boolean] // 그날 ~ 그날 + N일이 다 덮이고 끝났나. 뒤가 true면 앞도 true
  rx: Array<{ code: string; starts: number; back: AgainCounts; more: AgainCounts }> // 그날 시작이 있는 처방만, 코드 순
}
// DayPayload에 더함. 없으면 이 기능 전에 저장한 날(0이 아니라 '셀 수 없음')
again?: DayAgainPayload
```
- 이름을 `fu`·`followup`으로 하지 않는다: 지금 `followup`은 1회·2회·3~5회·6회+ 나눔이고 날 줄에는 없다고 정해 두었다(stats-core AC-008.2)

### 세기: `aggregate.ts` (TASK-2)
- 줄을 훑을 때(입원 줄은 지금처럼 건너뜀) 처방 번호 → 환자 → 받은 날 `Set`을 모은다. 다 훑은 뒤 처방·환자마다 날을 글자 순으로 늘어놓고:
  - 시작 = 앞 날과의 차이(`diffDays`)가 30보다 큰 날(첫 날 포함)
  - 시작 d의 창 N: d 뒤 날 중 1 ≤ 차이 ≤ N인 날 수 = `more`, 하나라도 있으면 `back` 1
  - 시작 d의 일 칸(`bucketsOfDate.get(d)[0]`)에 처방별로 더한다
- `toStats`가 일 칸에만 `again`(코드 순, `starts` ≥ 1만)을 붙인다. 주·달 칸은 그대로다
- 비용: 줄 수만큼 `Set`에 넣고 환자·처방마다 한 번 정렬. 지금도 칸마다 Map을 쓰므로 같은 크기다

### 날 숫자: `toDayPayloads.ts` (TASK-4)
```ts
// 신환 재방문 revisitView와 같은 규칙: 그날 ~ 그날 + N일이 다 덮이고 끝났을 때만 숫자
const readyOf = (day: string, summary: Summary) =>
  AGAIN_WINDOWS.map((n) => bucketState({ from: day, to: addDays(day, n) }, summary.covered, summary.today) === 'complete')
// partial인 날은 ready를 모두 false로 둔다(검사 AC-1303.2)
again: { ready, rx: (bucket.again ?? []).map(({ code, starts, back, more }) => ({ code, starts, back: ready.map((r, k) => (r ? back[k] : null)), more: … })) }
```
- `lib/payload` → `lib/analytics/coverage`·`dates` 가져오기는 같은 환자 자료 구역 안이다(울타리 그대로)
- 비트 길의 오늘 진료 끝은 `jobs.ts:57`이 요약의 오늘을 내일로 넘기므로 저절로 맞는다(AC-1302.4)

### 검사: `validate.ts` (TASK-1)
```ts
const AGAIN_KEYS = ['ready', 'rx']
const AGAIN_RX_KEYS = ['code', 'starts', 'back', 'more']
function againOf(value: unknown, rx: DayPayload['rx'], partial: boolean): DayAgainPayload | null
// validateDayPayload: exactly(value, DAY_KEYS, ['again']). 있으면 againOf, 없으면 돌려주는 객체에도 없다
```
- 규칙은 AC-1303.2 ~ 1303.5. 코드는 `isCode`(처방 코드와 같은 검사), 숫자는 `isCount`
- `MonthPayload`·`validateMonthPayload`는 그대로다

### 크기: `lib/storage/stats.ts` (TASK-5)
```ts
// allChecked의 날 쪽: 검사한 줄이 MAX_DAY_BYTES를 넘고 again이 있으면 again을 뺀 줄로 다시 잰다. 그래도 넘으면 지금처럼 던진다
function fitDay(payload: DayPayload): DayPayload
```

### 화면 숫자: `components/stats/againView.ts` (TASK-6, 순수)
```ts
export type AgainSpan = { from: string; to: string; days: number; shifted: boolean; countFrom: string; countTo: string }
export type AgainDayKind = 'ok' | 'no' | 'out'
export type AgainStrip = { from: string; to: string; runs: { kind: AgainDayKind; days: number }[]; ok: number; no: number; out: number }
export type AgainRow = { code: string; name: string; starts: number; back: number; more: number; wait: number }
export type AgainView = { span: AgainSpan; strip: AgainStrip; gapDays: number; hasRows: boolean; hasAgain: boolean; rows: AgainRow[] }

export function againSpan(range: StatsRange, win: AgainWindow): AgainSpan
export function againExtraSpan(range: StatsRange): DateRange | null
export function needsExtra(range: StatsRange, win: AgainWindow): boolean
export function againView(input: StatsInput, win: AgainWindow, picks: readonly RxLine[]): AgainView
export function againRateText(row: AgainRow): string // rateText(back, starts)
export function againAverageText(row: AgainRow): string // '평균 2.3번 더' | '–'
export const isFewStarts = (row: AgainRow) => row.starts >= 1 && row.starts <= 9
export function againBaseText(view: AgainView, range: StatsRange, periodName: string): { lead: string; strong: string; tail: string } // periodName은 화면이 parts.tsx의 PERIOD_NAME에서 넘긴다(순수 파일이 .tsx를 불러오지 않게)
```
- 오늘은 `range.load.to`(`parts.tsx:27`의 `todayOf`와 같다). E = min(`range.current.to`, 오늘 − 1). 12개월의 기간 끝은 이달 말일이라 E로 자른다
- `rateText`(`rxPickView.ts:25`)·`codeKey`(`view.ts`)를 다시 쓴다. 평균은 정수 나눗셈 `Math.floor((10 * more) / starts) / 10`이다(부동소수 오차 없음)

### 훅 (TASK-7)
```ts
// components/stats/useAgainDays.ts
export function useAgainDays(input: StatsInput, win: AgainWindow, revision: number, enabled: boolean): { input: StatsInput; state: 'ready' | 'reading' | 'failed'; retry(): void }
```
- 넓은 날 줄 읽기는 최근 7일 + 14·30일만, 30일 창에 맞춘 넓은 범위를 한 번 읽어 14일에도 쓴다. 열쇠는 `오늘|revision`. 실패 번호는 지금 있는 `E-STATS-READ-FAILED`(`readDays`·`readCoverage`가 던지는 번호)다
- 고른 날 수에는 훅을 두지 않는다. `useState<AgainWindow>(7)` 하나다

### 화면 (TASK-8·9)
- `sections/RxPickAgain.tsx`: props만 받는다 `{ picks, input, win, onWin, daysState, onRetryDays }`. 안에서 `againView`를 `useMemo`로 부른다. 줄 띠의 빗금은 `RxPickTable.tsx`의 `BAND_HATCH`와 같은 svg path 방식으로 이 파일 안에 둔다(조각 폭이 띠 전체일 수 있어 닿는 길이 1200)
- 넓으면(1024px 이상) 다섯 칸 `lg:grid-cols-[minmax(150px,1fr)_minmax(200px,1.5fr)_136px_132px_112px]` `gap-x-4`, 좁으면 두 칸 그리드에 네 줄(AC-1307.11)
- 날 수 단추는 `RxPickDetail.tsx:31-35`의 단추 묶음 모양(기간 단추와 같음)에 `max-md:grid-cols-3`
- `RxPickerSection.tsx`(TASK-9): `const [win, setWin] = useState<AgainWindow>(7)`와 `useAgainDays`를 위에 두고(빈 상태보다 위, 지금 규칙. 그래서 기간을 바꿔도 날 수가 남는다) `state === 'ready'`일 때 표 뒤에 `RxPickAgain`. `picks`는 `rows`(건수 표 줄)에서 코드·이름을 받는다. `useAgainDays`의 `enabled` = 고른 처방이 하나 이상

## 데이터 흐름
```
[의원 PC] 파일 ─ Worker: parseBitFile → aggregate(again 셈) ─┐
          비트 ─ 도우미 → 확장 → lib/bridge → 통계 Worker: aggregate(again 셈) ─┤
                                                                   ↓ (칸에는 처방별 몇 명뿐)
                                        toDayPayloads: ready = 그날 + N일이 덮이고 끝났나 → 숫자 또는 null
                                                                   ↓ validateDayPayload → saveStats(크기 넘으면 again만 뺌)
[Supabase] stats_days.payload.again (jsonb, 새 표·새 칸 없음)
                                                                   ↓ readDays (+ 최근 7일 14·30일만 넓은 범위 한 번 더)
[화면·휴대폰] againView(고른 날 수 = 화면 상태, 처음 7): 센 범위 → 날마다 ok/no/out → 처방별 합 → RxPickAgain
```
- 서버로 가는 것: 날 줄의 `again`(코드·숫자)뿐이다. 고른 날 수는 서버로 가지 않는다. 차트번호·환자 번호·날짜 목록·파일 이름은 없다

## 결정과 트레이드오프

### 어디서 세나: `aggregate` 안(칸에 붙임)
- `AnalysisResult`에 칸을 더하면 `analyzeFiles.test.ts:81`의 `toStrictEqual`과 부르는 두 곳(`SourcePicker.tsx`·`jobs.ts`)을 고쳐야 한다. 칸(`BucketStats`) 안에 두면 부르는 곳은 그대로이고 그 시험은 `aggregate()`로 기대값을 만들어 저절로 맞는다. 대신 `aggregate.test.ts`의 일 칸 통째 비교에 `again`을 더해야 한다(아래 '기존 시험')

### 저장 모양: 날 줄의 칸 하나, `ready` + null
- 처방 줄(`rx[]`)마다 칸을 더하면 시작이 없는 처방도 칸이 생기고 크기가 커진다. 시작이 있는 처방만 따로 둔다
- `ready`를 날에 따로 두는 까닭: 시작이 하나도 없는 날도 "센 날"인지 "아직 셀 수 없는 날"인지 띠에 그려야 한다. 처방 줄의 null은 `ready`와 늘 같아야 하고 검사가 본다(서로 어긋난 줄을 받지 않는다)
- 옛 날 줄(칸 없음)은 0이 아니라 '셀 수 없음'으로 읽는다. 버전을 올리지 않는다(신환 재방문 `within30`·`after30`을 더할 때와 같은 방법, `types/payload.ts:6-7`)
- 덮어쓰기: 끝난 날을 다시 저장하면 새 `again`으로 바뀐다(`stats_keep_complete`는 끝난 줄을 덜 끝난 줄로만 안 바꾼다). 그래서 짧은 파일을 다시 넣으면 그날의 14·30일 숫자가 null로 돌아갈 수 있다. 신환 재방문 `within14/30`이 지금 그렇게 동작하는 것과 같고, **2026-11-05 사용자가 이대로 두기로 정했다**(알려진 한계, 위험 1)

### 크기를 넘는 날: 실패 대신 `again`만 뺀다
- 이 기능 때문에 지금 되던 저장이 깨지면 안 된다. 뺀 날은 '아직 셀 수 없는 날'로 보여 거짓말하지 않는다

### 고른 날 수: 화면 상태 (사용자 결정)
- 2026-11-05 사용자가 "남기지 않는다, 늘 7일로 시작"으로 정했다. 그래서 브라우저 저장소도 서버 표도 쓰지 않고 운영 SQL도 없다. 통계 화면의 "화면 상태는 메모리에만"(specs/stats AC-514.9)과도 맞는다
- `RxPickerSection`은 기간별 key 없이 그대로 남으므로(rx-picker AC-806.5) 기간을 바꿔도 고른 날 수가 남는다. 다른 탭에 갔다 오면 칸이 다시 그려져 7일이다

### 최근 7일 + 14·30일은 날 줄을 한 번 더 읽는다
- 시안의 옮기기(지켜볼 날이 다 지난 가장 최근 같은 길이 기간)는 최근 7일에서 비교 기간보다 앞(최대 오늘 − 37일)까지 간다. 페이지 읽기(`useStatsData.ts:38-41`)를 넓히면 다른 칸의 셈·시험(rx-picker AC-802.5 읽기 횟수)이 바뀐다. 그래서 이 묶음만 필요할 때 따로 읽는다

### 자료 첫 30일은 센다(안내만)
- 사용자가 승인한 시안대로 센다. 앞 기록이 없는 날을 빼면 따로 넣은 파일·비트 짧은 불러오기에서 거의 모든 날이 빠진다. 대신 안내 `자료 첫 30일`을 늘 보인다(위험 1)

## 시안과 다른 곳 (까닭은 앱 규칙이나 시안에 없는 상태. 보고에 적는다)
| 시안 | 실제 | 까닭 |
|---|---|---|
| '제가 정한 부분' 11 "고른 날 수는 다음에 열어도 남아요" | 늘 `7일 안`으로 열린다. 기간을 바꾸는 동안만 남는다 | 2026-11-05 사용자 결정 |
| `새 칸` 칩, 맨 위 안내·`예시` 칩, 조작 줄, `건수 · 지금 있는 표예요` 줄, `이 위에/아래에 … 그대로 있어요` 줄, `제가 정한 부분` | 없음 | 시안에서만 쓰는 표시다(rx-picker AC-801.4와 같다) |
| 처방 골라 보기 설명 `신환률·재진률` | `신환율·재진율` | 앱 글자가 이미 `율`이다(rx-picker '시안과 다른 곳') |
| 900px(틀 폭)에서 쌓임 | 1024px(`max-lg`)에서 쌓임 | `classes.test.ts`가 허용하는 폭 접두사는 md·lg·max-md·max-lg뿐이다. 건수 표도 1024px에서 쌓인다 |
| 휴대폰 줄 위아래 14px | 12px(`py-3`) | 간격 단계에 14px가 없다(`classes.test.ts`의 `SPACE_STEPS`) |
| 8일째 글자 `faint` | `muted` | 글자는 muted 이상(`classes.test.ts`, AC-407.1). 점선 네모는 그대로 |
| 빗금 `repeating-linear-gradient` | svg path 빗금 | UI_GUIDE·`classes.test.ts`가 그라데이션을 막는다(rx-picker와 같다) |
| 안내 폭 72ch·76ch·80ch | `max-w-160`(640px) | 통계 화면 글 폭이고 대괄호 임의 값을 쓰지 않는다(rx-picker와 같다) |
| 예시 칸 표시 `<i aria-label>` | `role="img"` + `aria-label` | 역할 없는 `i`의 이름은 화면 읽기가 읽지 않는다 |
| '달마다 따로 넣어서, 달 끝 무렵…' 문장(조작 줄 '달마다 따로'일 때) | 센 범위 안에 셀 수 없는 날이 있으면 ` 그 안에서도 {n}일은 셀 수 없어요(따로 넣은 파일의 끝 무렵, 이 칸이 생기기 전에 저장한 날 등).` | 앱은 파일을 어떻게 넣었는지 모른다. 저장된 날 줄로만 안다 |
| 없음 | 날 줄 더 읽는 중·실패, 이 기간 자료 없음, `again` 없는 옛 줄뿐(AC-1307.10) | 시안이 그리지 않은 상태다. 다른 칸의 빈 상태·오류 카드 규칙을 따른다 |

## 기존 명세·시험과의 관계
- **승인된 명세는 고치지 않는다.** 대신 이 명세의 AC가 대신하는 곳을 적는다
- stats-core AC-008.2(날 줄에 담는 것, '동네와 F/U는 없다'): 뜻은 그대로다(`again`은 F/U 나눔이 아니다). 시험 `toDayPayloads.test.ts`의 '하루 칸 숫자 그대로'(:92)·'모든 층의 열쇠가 정해진 것뿐이다'(:116)에 `again`을 더한다(TASK-4, AC-1302.2)
- `aggregate.test.ts`의 일 칸 통째 비교(:234 근처 `toEqual`)에 `again`을 더한다. 다른 칸의 기대값은 바꾸지 않는다(TASK-2, AC-1301.6)
- rx-picker AC-801.1의 설명 글: AC-1308.1이 대신한다. `StatsScreen.test.tsx:1608`·`RxPickerSection.test.tsx:44`의 글을 바꾼다(TASK-9)
- 처방 골라 보기를 그리는 시험 파일(`StatsScreen.test.tsx`·`RxPickerSection.test.tsx`·`PeriodSummary.test.tsx`)에 새 저장 가짜는 필요 없다. 새 묶음은 저장 코드를 부르지 않고, 넓은 날 줄 읽기는 최근 7일 + 14·30일을 누를 때만 나가는데 지금 시험은 그 단추를 누르지 않는다
- rx-picker AC-812.6 소스 검사는 `RxPick*.tsx`를 저절로 모으므로 `RxPickAgain.tsx`도 든다. 훅·순수 파일은 AC-1306.2가 본다
- specs/stats AC-514.9(화면 상태는 메모리에만): 고른 날 수는 React 상태에만 있다. 그 시험이 그대로 맞다
- `validate.test.ts`·`stats.test.ts`·`jobs.test.ts:121`(`validateDayPayload(day)`가 그대로)·`analyzeFiles.test.ts:81`은 그대로 통과해야 한다(옛 모양 줄은 `again`이 없어도 된다)
- 대시보드·AI 리포트는 바뀌지 않는다: `src/app`·`components/dashboard` 어디도 `stats_days`·`validateDayPayload`를 읽지 않는다(2026-11-05 찾음). 날 줄을 읽는 화면은 `useStatsData.ts`와 처방 찾기 목록(`useRxCatalog.ts`)뿐이고 둘 다 `readDays` → `validateDayPayload`를 지나 `again`이 있어도 그대로다

## 사용자가 할 일
1. **운영 SQL은 없다.** 사이트에 올리는 일은 사용자가 말할 때만 한다
2. 사이트에 올린 뒤 비트에서 다시 불러오거나 파일을 다시 넣는다. 그 전에 저장한 날은 '세기 전에 저장했어요'로 보인다. 파일은 여러 달을 **한 번에 같이** 넣어야 30일 창까지 이어서 센다
3. 개인정보 E2E(TASK-10)는 새 SQL 없이 시험 계정(`.env.local`)만 기다린다

## 위험 / 미해결 질문
1. **덮어쓰기와 첫 30일(사용자 결정으로 둔다, 알려진 한계)**: 비트에서 최근 7일처럼 짧게 불러오면 불러온 첫 30일 안의 날이 다시 저장되며, 전에 넓게 불러와 바르게 센 그날 숫자를 "전부터 받던 환자도 새로 시작"으로 센 숫자로 덮는다. 짧은 파일을 다시 넣어도 14·30일 숫자가 '셀 수 없음'으로 돌아갈 수 있다. 신환 재방문 숫자도 지금 같다. 2026-11-05 사용자가 이대로 두기로 했다. 화면 안내 `자료 첫 30일`·`파일을 따로 넣을 때`가 이 한계를 알린다
2. 하루 줄 크기: 처방이 아주 많은 날은 `again`을 빼고 저장한다(그날만 셀 수 없음). 실제 크기는 재지 못했다
3. 최근 7일 + 30일의 넓은 읽기(23일)는 휴대폰에서 조금 늦을 수 있다. 그동안 '더 읽는 중' 한 줄이 보인다
4. 이 서버는 2 CPU·스왑 없음이라 시험은 Phase 끝에 파일 하나씩, 전체 검사(`verify`)와 E2E는 다른 일이 없을 때 돌린다

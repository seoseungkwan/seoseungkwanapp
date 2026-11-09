# 설계: 통계 비트 불러올 기간 고르기 (최근 1년·2년·전체 기간, 나눠 읽기)

## 개요
- 비트 칸(`SourcePicker.tsx` `BitLoad`)에 '불러올 기간' 묶음 단추와 안내 줄을 더한다. 누르면 화면(`StatsScreen.tsx`)이 순수 함수 `planLoad`로 조각 계획을 세우고, 조각을 새것부터 하나씩 지금의 `load(...)`로 읽어 `partSave`로 다듬은 값을 지금의 `data.save(...)`로 저장한다
- 새 파일은 순수 모듈 하나(`src/components/stats/loadPlan.ts`)와 그 시험뿐이다. Worker에는 칸 하나(`keep`)만 더한다. 도우미·확장·`commands.json`·DB·서버는 그대로다
- 조각이 하나(합친 기간 800일 이하)면 지금과 한 글자도 다르지 않게 돈다. '지금 보는 기간'이 처음 값이므로 누르는 방법을 바꾸지 않은 사람에게는 지금과 같다
- **2026-11-09 고침(최종 검토 FIX 뒤, TASK-6 ~ 9)**: 넷째 단추 이름 '전체 기간'(결정 15) · 이웃 조각 쪽 여유 31일(결정 1) · keepAt은 비교 범위를 먼저(결정 5) · 옛 조각은 after30을 null로 저장하고 첫 재방문까지 날수가 둘을 합쳐 보임(결정 16, 'after30을 읽는 곳') · [이어서 불러오기]는 연결이 ready일 때만(결정 17). 새 파일은 없다

## 지금 `load(...)`가 돌려주는 것과 화면이 그것으로 하는 일 (코드에서 따라감)
1. `useStatsWorker().load({ range, today, closeToday, groups })` → `useBridge.stream('stats.rows', { from, to })`(도우미가 `maxDays` 800을 넘으면 E-HELPER-BAD-MESSAGE로 거절, `CommandTable.CheckPeriod`) → 조각은 통로 포트로 Worker에만 감 → `requestLoad`가 Worker에 `{ type: 'load', streamId, from, to, today, closeToday, groups }`
2. Worker `createStatsHost.load` → 글자가 다 오면 `loadJob` → 답 `StatsLoaded`와 함께 **Worker 메모리를 통째로 바꾼다**: `memory`(진료 줄·날 합계·처방 이름, 처방별 신환·재진 `split`이 씀)와 `bit`(접수 줄·사람 표·원장님 표, 세 칸 `sections`가 씀). 다음 load가 덮는다
3. `StatsLoaded` = `range`(읽은 범위) · `covered`(읽은 첫날 ~ min(끝, 끝난 마지막 날), 저장할 덮은 기간) · `quality`·`checks` · `months`·`days`(incomplete면 null) · `sections?`(v3 도우미의 달마다 세 칸 합계, v2면 열쇠 없음) · `report`(**`to`의** 일일 두 날·월말 두 달 숫자, `helperData.checkReport`)
4. 화면 `loadFromBit`: `setReport`(보고 문장) → `setLoads(n + 1)`(이 값이 바뀌면 효과가 `split(splitSpan)`·`sections(splitSpan, previous)`를 Worker에 묻는다. Worker 메모리 범위 밖이면 `{ kind: 'none' }` → '이 기간은 아직 불러오지 않았어요 · 이 기간을 고른 채 [비트에서 불러오기]를 누르면 보여요.') → incomplete면 `setIncomplete`(확인 카드, 저장 안 함) → 아니면 `data.save({ months, days, covered, source: 'bit', sections })` → `saveStats`가 달·날 줄 upsert, 덮은 기간 줄 하나 insert(800일 이하 제약) → 성공하면 `attempt + 1`로 지금 기간을 다시 읽음
5. 저장 쪽 사실: DB 트리거(`stats_keep_complete`)는 완전한 줄을 덜 된 줄로 바꾸지 않는다. 완전한 줄끼리는 덮는다

## 구성 요소 / 인터페이스

### `src/components/stats/loadPlan.ts` (새 파일, 순수)
```ts
export type LoadSpan = 'view' | '1y' | '2y' | 'all'
export const LOAD_SPANS: readonly { span: LoadSpan; name: string }[] // 지금 보는 기간 · 최근 1년 · 최근 2년 · 전체 기간('all', 2026-11-09 이름 고침)
export const MAX_READ_DAYS = 800 // commands.json stats.rows maxDays · stats_coverage 제약과 같다(AC-3305.1 시험이 묶는다)
const PART_MONTHS = 24
const NEIGHBOR_DAYS = 31 // 이웃 조각 쪽 여유(2026-11-09 고침, 결정 1). 30일 창을 늘 담고 이웃 달(31일 이하)도 늘 통째로 담는다
export type LoadPart = { save: DateRange; read: DateRange } // save = 저장할 달들, read = 도우미에 묻는 범위(이웃 조각 쪽으로 31일씩 더함). 모양은 그대로다
export type LoadPlan = { span: LoadSpan; whole: DateRange; parts: LoadPart[]; keepAt: number } // parts는 새것부터
export function planLoad(today: string, range: StatsRange, span: LoadSpan): LoadPlan
export function partSave(view: StatsLoaded, part: LoadPart): SaveInput // source 'bit'
export function loadHint(today: string, range: StatsRange, plan: LoadPlan): string // 단추 아래 안내 줄
export function monthsLabel(span: DateRange): string // '2022년 12월 – 2024년 11월' · 한 달이면 '2020년 1월'
export function progressText(plan: LoadPlan, at: number): string // 읽는 중 줄(N ≥ 2)
export function doneText(plan: LoadPlan, savedTo: string): [string, string]
export function stoppedText(plan: LoadPlan, done: number, reason: string): [string, string] // reason = '(오류 번호 …)' 또는 확인 건수 글
```
- 날짜는 `lib/analytics/dates.ts`(`addDays`·`addMonths`·`monthRange`·`monthOf`·`diffDays`·`compareYmd`)만 쓴다. `FIRST_DAY`·`lastDayOf`는 `periodPick.ts`에서, `readSpan`(값)과 `StatsRange`(타입)는 `view.ts`에서 가져온다(`view.ts`는 `loadPlan.ts`를 부르지 않아 순환이 없다)
- `periodPick.ts`의 `spanLabel`·`hasFinal`을 `export`만 한다(동작은 그대로). 날짜 글·받침 조사를 두 곳에 두지 않으려고
- `planLoad` 셈
  1. 단추 첫날: view 없음, 1y `addMonths(monthOf(today), -11)`의 1일, 2y `-23`의 1일, all `FIRST_DAY`. whole = { min(`range.load.from`, 단추 첫날), today }
  2. `diffDays(whole.from, whole.to) + 1 ≤ MAX_READ_DAYS`면 `parts = [{ save: whole, read: whole }]`
  3. 넘으면 k = 0, 1, …: 끝 달 = 오늘 달 − 24k, 첫 달 = 끝 달 − 23. save = { max(첫 달 1일, whole.from), k = 0이면 today 아니면 끝 달 말일 }. save 첫날이 whole.from이면 멈춘다
  4. read(2026-11-09 고침): 가장 옛 조각이 아니면 from = `addDays(save.from, -NEIGHBOR_DAYS)`, 가장 새 조각이 아니면 to = `addDays(save.to, NEIGHBOR_DAYS)`. 가장 새 조각의 to는 오늘, 가장 옛 조각의 from은 whole.from 그대로. 가장 긴 read는 save 731일 + 31 + 31 = 793일이다. AC-3302.4 시험이 2026 ~ 2032년 모든 날로 read ≤ 800·save ≤ 731과, 가장 새 조각이 아니면 read.to ≥ save.to + 30일·다음 달 말일, 가장 옛 조각이 아니면 read.from ≤ save.from − 30일·앞 달 1일을 확인한다
  5. keepAt(2026-11-09 고침): 비교 범위 `cmp = { readSpan(range).from, min(readSpan(range).to, today) }`, 지금 범위 `cur = { range.current.from, min(range.current.to, today) }`(StatsScreen `splitSpan`과 같은 범위). `at = parts.findIndex(p => p.read ⊇ cmp)`, 없으면 `parts.findIndex(p => p.read ⊇ cur)`, 그것도 없으면 0. 조각이 하나면 0
- `partSave`: save 달 범위(`monthOf(save.from)` ~ `monthOf(save.to)`)로 months·sections를 거르고 날 범위로 days를 거른다. covered는 겹친 구간. 조각이 하나면 거르는 것이 없어 Worker 값 그대로다(AC-3302.6)
  - after30(2026-11-09, AC-3302.7): `compareYmd(read.to, save.to) > 0`인 조각 — 곧 조각이 둘 이상인 계획에서 가장 새 조각이 아닌 것(가장 새 조각과 조각 하나는 read.to = save.to = 오늘) — 은 거른 months·days 줄마다 `revisit: { ...row.revisit, after30: null }`로 보낸다. 다른 칸은 손대지 않는다. 계획 전체를 받지 않고 `part`만으로 정하므로 `partSave(view, part)` 모양과 `LoadPart` 모양은 그대로다(StatsScreen은 고치지 않는다)
- `loadHint`: 날짜 글 = `spanLabel(whole, false)`(끝이 늘 오늘이라 해가 같으면 해 없이, 넘으면 양 끝). 걸리는 때: N ≥ 2 → `${N}분쯤`, 하나면 100일 이하 '빨리 끝나요.' · 400일 이하 '30초쯤' · 그 위 '1분쯤'. 시안의 넷(70일·344일·709일·4조각)이 이 규칙으로 나온다. 실측이 아니라 어림이다

### `src/components/stats/SourcePicker.tsx`
```ts
type Props = { …지금 칸; range: StatsRange; progress: string | null; onLoad(closeToday: boolean, span: LoadSpan): void }
```
- `BitLoad`에 `useState<LoadSpan>('view')`. 시안 순서대로: '불러올 기간' 줄(`basis-full flex flex-wrap items-center gap-x-3 gap-y-1.5`, 글 `text-small font-semibold text-ink`, 묶음 `${ds.segment.group} max-md:grid-cols-2`, 단추 `ds.segment.button` + `on`/`off`, `aria-pressed`, `disabled={job !== null}`) → [비트에서 불러오기]·'오늘 진료 끝'(지금 그대로) → 안내 줄 `<p className="basis-full text-small text-ink-2">{loadHint(...)}</p>` → '오늘 진료 끝' 안내 줄(지금 그대로)
- 계획은 `useMemo(() => planLoad(today, range, span))`로 안내 줄에만 쓰고, 누를 때는 `onLoad(closeToday, span)`만 넘긴다(화면이 같은 함수로 다시 세운다)
- 읽는 중 줄: `job === 'bit' && progress !== null`이면 `progress`, 아니면 지금 `WORKING[job]`

### `src/components/stats/StatsScreen.tsx`
- 새 상태 두 개
  ```ts
  const [partAt, setPartAt] = useState<{ plan: LoadPlan; at: number } | null>(null) // 읽는 중인 조각(N ≥ 2일 때 읽는 중 줄)
  type LoadRun = { plan: LoadPlan; done: number; savedTo: string; stop: string | null } // stop null = 다 끝남
  const [run, setRun] = useState<LoadRun | null>(null) // 끝난·멈춘 나눠 읽기(상자·이어서)
  ```
- `runJob`이 'bit'·'file'을 시작할 때 지우는 안내에 `run`을 더한다. `partAt`은 읽기 함수의 `finally`에서 지운다
- 읽기 함수 하나를 처음 누를 때와 [이어서 불러오기]가 같이 쓴다
  ```ts
  async function readParts(plan: LoadPlan, start: number, closeToday: boolean, savedTo: string) {
    const groupDefs = groups.forLoad() // 누를 때 한 번(treatment-trend 1205.7). 모든 조각이 같이 쓴다
    for (let i = start; i < plan.parts.length; i++) {
      const part = plan.parts[i]
      if (plan.parts.length > 1) setPartAt({ plan, at: i })
      let view: StatsLoaded
      try {
        view = await load({ range: part.read, today, closeToday: i === 0 && closeToday, keep: i === plan.keepAt, groups: groupDefs })
      } catch (error) {
        if (i === 0) throw error // 지금처럼 runJob이 오류 카드
        return setRun({ plan, done: i, savedTo, stop: `(오류 번호 ${errorCodeOf(error)})` })
      }
      if (i === 0) setReport({ numbers: view.report, loadedAt: clockOf(new Date()), closedToday: closeToday })
      if (i === plan.keepAt) setLoads((n) => n + 1)
      if (view.quality !== 'valid' || view.months === null || view.days === null) {
        if (i === 0) return setIncomplete({ kind: 'bit', checks: view.checks }) // 지금 그대로
        return setRun({ plan, done: i, savedTo, stop: incompleteLine({ kind: 'bit', checks: view.checks }) })
      }
      const saved = await data.save(partSave(view, part))
      setSavedUnread(saved)
      if (!saved) return i === 0 ? undefined : setRun({ plan, done: i, savedTo, stop: '(오류 번호 E-STATS-SAVE-FAILED)' })
    }
    setRun({ plan, done: plan.parts.length, savedTo, stop: null })
  }
  ```
  - 누름: `loadFromBit(closeToday, span)` → `plan = planLoad(today, range, span)` → `runJob('bit', () => readParts(plan, 0, closeToday, lastDayOf(today, closeToday)))`
  - [이어서 불러오기]: `runJob('bit', () => readParts(run.plan, run.done, false, run.savedTo))`
  - `keep`은 keepAt 조각만 참이라 `load`가 메시지에 칸을 싣지 않는다. 조각이 하나면 keepAt = 0이라 지금 메시지와 같다
- 상자(띠 아래, 개인정보 안내 줄 위. 시안의 `#result`): `run`이 있고 `run.plan.parts.length > 1`일 때만
  - 다 끝남(`stop === null`): `role="status"` `mt-3 text-body` · 첫 줄 `font-semibold text-ink` · 둘째 줄 `mt-0.5 text-small text-ink-2` (`doneText`)
  - 멈춤(`stop !== null && done ≥ 1`): 같은 모양(`stoppedText`) + `mt-2 ${ds.button.secondary}` [이어서 불러오기] (`aria-disabled={busy || undefined}`, 막혔으면 `onClick` 없음)
  - `busy`(2026-11-09 고침, AC-3303.10) = `job !== null || state !== 'ready'`. `state`는 이미 받는 `useStatsWorker().state`(비트 PC 연결 상태)다. 끊김·연결 확인 중·다른 창이 쓰는 중이면 눌러도 일을 시작하지 않는다. [다시 확인]으로 'ready'가 되면 다시 누를 수 있다. 막는 방법은 지금 `job !== null`과 같다(`LoadRunBox`가 `aria-disabled`를 달고 `onClick`을 뺀다)
  - [이어서 불러오기]를 누르면 `runJob('bit')`가 `run`을 지우므로 이어서 읽는 동안 상자와 단추는 없다(AC-3303.9). 상자가 보이는 채 일이 있는 때는 [다시 저장](일 'save', `run`을 지우지 않음)뿐이다
  - `done === 0`(첫 조각에서 멈춤)은 상자를 그리지 않는다. 그런 멈춤은 `readParts`가 `setRun`을 부르지 않는 길이라 생기지 않는다
- `SourcePicker`에 `range`·`progress={partAt && job === 'bit' ? progressText(partAt.plan, partAt.at) : null}`·`onLoad={loadFromBit}`을 넘긴다

### `src/components/stats/view.ts` · `sections/RevisitSection.tsx` — 첫 재방문까지 날수 합치기 (2026-11-09, REQ-3306)
```ts
export type FirstRevisitKey = 'within7' | 'days8to14' | 'days15to30' | 'after30' | 'never' | 'after30OrNever'
// FirstRevisit 모양은 그대로(items의 key가 하나 는다)
```
- `firstRevisitOf(units)`: 센 단위(`countedUnits(units, 'within30')`, 지금 그대로)의 줄 가운데 하나라도 `(revisit.after30 ?? null) === null`이면 items 넷 — '7일 안'·'8~14일'·'15~30일'(지금 셈) + `{ key: 'after30OrNever', label: '30일 넘어 다시 왔거나 아직 안 옴', count: cohort − within30 }`. 아니면 지금 다섯 그대로. from·to·cohort·null 규칙(cohort 0이면 null)은 그대로다. `sumOf`가 null을 0으로 치는 것은 within7·14·30 합에만 남는다(그 셋은 센 단위에서 늘 숫자)
- `rateOf`·`revisitRates`의 d7·d14·d30·d30Cohort는 고치지 않는다(after30을 읽지 않는다)
- `RevisitSection.tsx`
  - `FirstRevisitList`: 막대를 line-strong으로 칠하는 줄을 `item.key === 'never' || item.key === 'after30OrNever'`로. 줄 모양(`grid-cols-[112px_minmax(0,1fr)_auto]`, 이름 자르지 않음)·막대 폭(가장 큰 값 대비)은 그대로라 넷이면 넷 가운데 가장 큰 값이 기준이다. 합친 이름은 112px 칸에서 줄을 바꾼다(끝 검토 사진으로 본다)
  - `FirstRevisitBlock`: "'30일 넘어 다시 옴'은 불러온 자료 끝날(…)까지 본 수라, 다시 불러오면 늘 수 있어요." 안내(`Note`)는 items에 `after30` 줄이 있을 때만 그린다(합친 넷이면 그 줄이 없다). 새 글은 더하지 않는다
  - `tableOf`: 지금처럼 `first.items`로 줄을 만드므로 합치면 '첫 재방문 30일 넘어 다시 왔거나 아직 안 옴' 줄 하나가 된다(고칠 것 없음)

### Worker 쪽 `keep`
- `src/types/stats.ts` `StatsLoadRequest`에 `keep?: boolean`(false면 이 답의 진료 줄·접수 줄을 메모리에 남기지 않는다)
- `src/workers/stats/jobs.ts` `createStatsHost.load`: `if (request.keep !== false) { memory = loaded.memory; bit = loaded.bit }`. 답(`loaded`)은 지금처럼 보낸다. 환자 자료 구역 규칙(네트워크·console·저장소·React import 없음)은 그대로다
- `src/workers/statsClient.ts` `requestLoad`: `keep === false`일 때만 메시지에 `keep: false`를 싣는다(지금 시험이 메시지 모양을 `toEqual`로 본다)
- `src/components/stats/useStatsWorker.ts` `load`: `keep?: boolean`을 받아 `requestLoad`로 넘긴다

## after30을 읽는 곳 (2026-11-09 코드에서 따라감, `grep -rn after30 src`)
옛 조각이 after30 null을 저장하면(AC-3302.7) 아래가 그것을 만난다. 어디서도 null을 0으로 바꿔 숫자처럼 쓰지 않는다
| 곳 | after30을 어떻게 쓰나 | null이면 |
|---|---|---|
| `components/stats/view.ts` `firstRevisitOf` | 첫 재방문 '30일 넘어 다시 옴'·'아직 다시 안 옴'(지금은 null을 0으로 쳐 '아직 다시 안 옴'이 커진다) | 합친 넷(TASK-7, AC-3306.1) |
| `components/stats/sections/RevisitSection.tsx` | items를 그리고 '30일 넘어 다시 옴' 끝날 안내 | 합친 줄 그림·안내 숨김(TASK-7, AC-3306.2) |
| `components/stats/view.ts` `rateOf`(7·14·30일 줄) | 읽지 않음(within7·14·30만) | 그대로 |
| `components/dashboard/summary/view.ts`·`FlowSection.tsx` | 읽지 않음(within7·14·30만) | 그대로 |
| `lib/ai/input.ts` `buildReportInput`(AI 입력·지문, 서버 `app/api/ai/`가 DB 값으로 부름) | 읽지 않음(재방문 지표는 `revisit.within7`·`revisit.within14`뿐) | 그대로 — 0을 지어 보내지 않음을 시험으로 묶는다(TASK-9, AC-3306.3) |
| `lib/ai/basis.ts`·`app/api/ai/*` | revisit을 읽지 않음 | 그대로 |
| `lib/payload/validate.ts` revisitOf | within30 숫자 + after30 null을 받는다('집계 중은 앞에서 뒤로 번짐'의 뒤만 null) | 그대로(지금 시험 '30일 숫자, after30 null(뒤만 null)') |
| `lib/storage/stats.ts` | validate로 저장·읽기 | 그대로 |
| `lib/analytics/aggregate.ts`·`compare.ts` `revisitView`·`lib/payload/toMonthPayload.ts`·`toDayPayloads.ts` | Worker 안에서 after30을 만든다(30일 창이 다 지났으면 숫자) | 그대로. null로 바꾸는 곳은 `partSave` 하나다 |

## 데이터 흐름
```
[불러올 기간] span ─┐
range(지금 보는 기간) ┴→ planLoad → parts(새것부터) ─┬→ loadHint(안내 줄)
                                                    └→ 누름 → 조각 i마다:
   load(read_i, closeToday: i==0, keep: i==keepAt) → 도우미 stats.rows(≤ 800일) → Worker loadJob
   → i==0: 보고 문장 / i==keepAt: loads+1 → split·sections(Worker 메모리 = keepAt 조각)
   → incomplete: i==0 확인 카드 · i≥1 멈춤
   → partSave(view, part_i)(가장 새 조각이 아니면 after30 null) → saveStats(달·날 upsert, 덮은 기간 = save_i) → 다시 읽기
   → 실패: i==0 지금 카드 · i≥1 멈춤 상자 + [이어서 불러오기](i부터, 연결이 ready일 때만)
저장된 일 줄 → view.ts revisitRates → firstRevisitOf(after30 null이 들면 합친 넷) → RevisitSection
```
- 서버로 가는 것은 지금의 저장 모양(달·날·세 칸 합계·덮은 기간)뿐이다. 조각이 많아도 줄 모양·크기 한도는 그대로이고 덮은 기간 줄이 조각마다 하나씩 는다. after30 null은 지금도 받는 값이라 저장 모양은 그대로다

## 결정과 트레이드오프
1. **24달 조각 + 이웃 조각 쪽으로 31일씩 더 읽고 빼기**(2026-11-09 고침): 날 줄의 신환 재방문(7·14·30일 창, `aggregate.ts` `REVISIT_DAYS`)과 같은 처방 재방문(again, `AGAIN_DAYS` 7·14·30)은 그날 뒤 30일이 읽은 범위 안에 있어야 숫자가 되고(아니면 '셀 수 없음' null), 같은 처방 '시작'은 앞 30일을 본다(`AGAIN_GAP` 30, fu-rate). 여유 없이 자르면 옛 조각 끝 30일이 '셀 수 없음'으로, 새 조각 첫 30일이 '시작'을 더 세어 저장되고, 전에 넓게 불러와 바르게 저장한 날을 덮는다(완전한 줄끼리라 트리거가 막지 않는다). 더 읽은 날은 `partSave`가 버린다(그 날은 이웃 조각이 바르게 저장한다)
   - 처음 판은 이웃 달 하나(앞 달 1일 ~ / ~ 다음 달 말일)였다. 2월은 28·29일이라 save 끝이 1월 31일이면 read가 2월 28일에 끝나 1월 30·31일의 30일 창이, save 첫날이 3월 1일이면 read가 2월 1일에 시작해 3월 1·2일의 앞 30일이 잘렸다(검토가 확인함). 그래서 여유를 날로 잰다
   - 30일이 아니라 31일인 까닭: 30일이면 save 끝(달 말일) + 30일이 다음 달 말일에 하루 못 미치는 달(다음 달이 31일)이 있어, 2024년(월별) + 지금 보는 기간의 둘째 read가 2023-01-01 ~ 2024-12-30이 되어 2024년을 다 담는 조각이 없어지고 keepAt이 0으로 떨어진다(AC-3303.3의 '둘째 조각 뒤 2024년 숫자'가 깨지고 처방별이 '불러오지 않았어요'). 31일은 30일 창을 늘 담고(≥ 30) 이웃 달(28 ~ 31일)도 늘 통째로 담아, 달·해로 고른 기간이 조각 경계에 닿아도 한 read가 다 담는다. 가장 긴 read는 731 + 62 = 793일로 800일 안이다(사용자 결정 '30일, 가장 길면 791일'에서 하루씩 넓힌 것. 재승인 때 함께 본다)
2. **800일 이하는 한 번에**: 지금 되는 불러오기(빠른 단추 넷, 최근에 가까운 달·해)는 요청·저장이 그대로다. 최근 2년(709일)도 한 번이다. 800일을 넘는 것만 나눈다
3. **새것부터**: 시안대로. 중간에 멈춰도 최근 숫자가 먼저 남는다
4. **보고 문장은 첫 조각**: `report`는 읽은 끝(`to`)의 날·달 숫자라 오늘에 끝나는 첫 조각만 맞다
5. **처방별·세 칸은 keepAt 조각, Worker는 그 조각만 메모리에 남김(`keep`)**: 새것부터 읽으면 마지막에 읽는 조각이 가장 옛것이라, 지금처럼 매번 메모리를 바꾸면 최근 30일을 보며 전체 기간을 읽은 뒤 처방별 신환·재진이 '불러오지 않았어요'가 된다. keepAt은 옛 달·해를 보며 누른 경우(지금은 도우미가 거절하던 경우)도 그 기간 처방별·세 칸이 나오게 고른다
   - 고르는 차례(2026-11-09 고침): ① read가 비교 범위(`readSpan(range)` = 가장 앞 비교 기간 첫날 ~ 지금 보는 기간 끝, 오늘에서 자름)를 다 담는 가장 새 조각 ② 없으면 지금 보는 기간을 다 담는 가장 새 조각 ③ 그것도 없으면 0. 처음 판은 ②만 보아서, 2024년 11월(일별)을 보며 누르면 첫 read(2024-10-31 ~)가 11월만 담아 keepAt 0이 되고 세 칸의 바로 전 기간(10월) 대비가 빠졌다. 세 칸은 `range.previous`를 Worker 메모리에 묻기 때문이다
   - ①은 `readSpan`을 그대로 써서 작년 같은 기간(`lastYear`, Worker에 묻지 않는다)까지 담는 조각을 찾는다. 작년은 못 담고 바로 전 기간까지만 담는 조각이 있어도 ①이 아니면 ②로 간다(①·② 사이 한 칸을 더 두지 않았다. 사용자 결정 그대로)
   - 다 담는 조각이 없으면(조각 경계를 넓게 걸친 직접 날짜·해) 첫 조각을 남기고 그 기간은 지금처럼 '불러오지 않았어요' 안내다
6. **확인 필요(incomplete)인 조각은 멈춘다**: 시안의 멈춤 상자와 [이어서 불러오기]를 그대로 쓴다. 비트에서 기록을 고친 뒤 [이어서 불러오기]가 그 조각부터 다시 읽는다. 건너뛰고 계속하면 시안에 없는 '몇 조각은 저장 안 함' 글이 또 필요하다
7. **첫 조각에서 멈추면 지금과 같다**: 저장된 조각이 없으니 [이어서 불러오기]는 [비트에서 불러오기]와 같다. 지금의 오류·확인·다시 저장 카드를 그대로 쓴다
8. **둘째 조각부터의 읽기 실패는 상자에만 번호**: 시안대로 상자 한 곳에 번호를 둔다. 통로가 끊기면 띠의 비트 칸이 지금처럼 연결 상태와 [다시 확인]을 따로 보인다. 저장 실패는 [다시 저장] 카드가 `data.unsaved`에서 나오므로 함께 보인다(번호가 두 곳)
9. **저장 실패도 멈춤**: `data.retrySave`는 마지막 못 한 저장 하나만 들고 있다. 계속 읽으면 다음 조각이 그것을 덮는다. [이어서 불러오기]는 그 조각부터 다시 읽는다(같은 값을 다시 덮어 해가 없다)
10. **끝난 상자는 조각이 둘 이상일 때만**: 시안에서 한 번 읽기는 끝난 뒤 고르기 상태로 돌아간다. 지금처럼 출처 줄 '· 방금'이 알린다
11. **저장한 끝날 글의 해**: 시안의 '2020년 1월 1일 – 11월 8일'은 2020년 11월 8일로 읽힌다. 안내 줄과 같은 규칙(해를 넘으면 양 끝)으로 '2020년 1월 1일 – 2026년 11월 8일'로 쓴다
12. **안내 글 넓히기**: 시안은 최근 30일만 보였다. 다른 기간은 이름·비교 이름·받침 조사·'(1년)' 괄호·나눠 읽기·걸리는 때를 AC-3301.4 규칙으로 만든다(시안의 네 글은 규칙에서 그대로 나온다)
13. **불러올 기간을 기억하지 않음**: 화면을 열 때마다(그리고 비트 칸이 다시 그려질 때마다, '오늘 진료 끝'과 같이) '지금 보는 기간'이다. 메인 세션이 정한 것
14. **'오늘 진료 끝'은 첫 조각에만**: 다른 조각은 끝이 어제보다 앞이라 값이 숫자를 바꾸지 않지만, 뜻을 분명히 하려고 false로 보낸다
15. **넷째 단추 이름 '전체 기간'**(2026-11-09 사용자 결정): 의원이 비트를 2020년 뒤부터 써서 '2020년부터'가 뜻이 없다. 읽는 범위(`FIRST_DAY` 2020-01-01 ~ 오늘)·`LoadSpan` 값 'all'·안내 줄 글(실제 날짜 '2020년 1월 1일 – …'와 '한 번 저장한 달은 남으니…')·다 끝난 상자 글('2020년부터 어느 달·해든')은 그대로다. 바뀌는 것은 `LOAD_SPANS`의 이름 하나와 그것을 단추 이름으로 찾는 시험들이다. 시안 `index.html` 단추 글도 바꿨고 사진 넷은 옛 이름 그대로 둔다(`notes.md`)
16. **옛 조각의 after30은 null, 첫 재방문까지 날수는 합쳐 보이기**(2026-11-09 사용자 결정 "옛날 달은 둘을 합쳐 보이기"): '30일 넘어 다시 옴'(`aggregate.ts` ~293줄 `after30 = !within30 && later.length > 0`)은 30일 창과 달리 끝이 없어 read 끝날까지 본 수다. 가장 새 조각이 아닌 조각은 read가 save 끝 + 31일에 끝나므로 그 달의 after30이 실제보다 작고, 그만큼 '아직 다시 안 옴'이 커진다. 그래서 그 조각은 after30을 null(셀 수 없음)로 저장하고(within7·14·30·cohort는 31일 여유로 바르다), 첫 재방문까지 날수는 센 단위에 after30 null이 하나라도 들면 둘을 '30일 넘어 다시 왔거나 아직 안 옴'(= cohort − within30, 늘 바름) 하나로 보인다
   - 일부러 덮는다: 전에 '최근 12개월'·'최근 2년'처럼 오늘까지 한 번에 읽어 after30을 숫자로 저장한 달도, 그 달이 나눠 읽기의 옛 조각에 들면 null로 덮인다. 그 달을 다시 한 번에 읽으면(800일 이하, read 끝 = 오늘) 다시 숫자가 된다. 오늘에서 대략 800일보다 먼 달은 한 번에 읽을 길이 없어 늘 합쳐 보인다
   - 조각 하나인 불러오기와 가장 새 조각은 그대로다(read가 오늘에 끝나 after30이 지금 뜻 그대로 '불러온 자료 끝날까지 본 수'다)
   - 'after30을 읽는 곳' 표의 다른 곳은 after30을 읽지 않거나 null을 이미 받는다. AI 입력은 재방문 지표가 7·14일뿐이라 after30이 들어가지 않고, 그것을 시험으로 묶는다(TASK-9)
   - 합친 줄의 막대는 '아직 다시 안 옴'처럼 line-strong이다(아직 안 온 사람이 들어 있다). 끝날 안내("'30일 넘어 다시 옴'은 … 늘 수 있어요.")는 그 줄이 없으니 그리지 않고, 새 글을 더하지 않는다
17. **[이어서 불러오기]는 연결이 ready일 때만**(2026-11-09 검토 FIX): 셋째 조각에서 통로가 끊겨 멈추면 그 단추를 바로 누를 수 있었고, 눌러도 끊긴 통로로 곧 다시 멈췄다. 다른 단추([비트에서 불러오기])는 연결이 ready가 아니면 아예 그려지지 않는다(`BitCell`). [이어서 불러오기]는 상자에 남아야 하므로(멈춘 곳을 알려야 함) 그리되 `aria-disabled`로 막는다(지금 일 있을 때와 같은 방법)
18. **시험 고침**(2026-11-09 검토 FIX): `StatsScreen.test.tsx`의 AC-3303.9 시험은 이어서 읽는 동안 `queryByRole(…)?.getAttribute('aria-disabled') ?? 'true'`로 보아 단추가 없어도 통과했다. 실제로는 `runJob('bit')`가 상자를 지워 단추가 없으므로 `toBeNull()`로 본다(일 중 `aria-disabled`는 [다시 저장] 시험이 이미 본다). AC-3305.2는 어느 시험 이름에도 없어서, 지금 동작을 지키는 'AC-514.3 불러올 범위로 …' 시험 이름에 더한다(기대값은 그대로)

## 위험 / 미해결 질문
1. **한 조각의 줄 수 한도**: 도우미는 한 번에 진료 줄·접수 줄 각각 700,000줄까지다(넘으면 E-STATS-TOO-BIG). 지금 최근 12개월이 24달을 읽고, 나눠 읽기는 이웃 조각 쪽 31일씩까지 793일 가까이 읽는다. 아주 바쁜 의원이면 한 조각이 이 한도를 넘을 수 있고, 그때는 멈춤 상자에 그 번호가 나오며 [이어서 불러오기]로도 넘지 못한다(조각 크기를 줄이는 것은 범위 밖)
2. **걸리는 때는 어림**: '4분쯤'은 조각당 1분으로 친 것이다. 실제 비트 PC 시간은 재지 않았다. 조각마다 지금의 한도(통로 20분, 끝 뒤 Worker 120초)는 그대로다
3. **다 담는 조각이 없는 기간**: 조각 경계를 넓게 걸친 직접 날짜나 해(경계는 오늘 달에 따라 움직인다)는 저장은 되지만 처방별·세 칸이 '불러오지 않았어요'다. 그 안내의 '이 기간을 고른 채 [비트에서 불러오기]를 누르면 보여요'가 그 경우엔 맞지 않는다. 지금 보는 기간은 담지만 비교 범위는 못 담는 조각만 있으면(예 2025년 월별 → 비교할 2024년이 두 조각에 걸침) 처방별은 나오고 세 칸의 바로 전 기간 대비만 빠진다
4. **첫 조각이 확인 필요이고 keepAt이 0이 아님**: 확인 카드의 '처방별 신환·재진과 보고 문장은 방금 불러온 숫자예요.' 가운데 처방별은 이번 답이 아니다(옛 달을 보며 누르고 첫 조각에 기록 문제가 있을 때만)
5. **2020년보다 앞**: 직접 날짜의 긴 비교처럼 `range.load`가 2020년 앞이면(예 5년 직접 날짜 → 바로 전 5년) 지금 규칙대로 그 날부터 여러 조각을 읽는다(지금은 도우미가 거절하던 경우)
6. **덮어쓰기**: 늘 고른 기간 전체를 다시 읽어 덮는다. 전에 다른 범위로 저장한 날의 재방문 숫자가 바뀔 수 있는 것은 지금(fu-rate 2026-11-05 사용자 결정)과 같다. 파일로 저장한 달도 비트 숫자로 덮인다(지금과 같다)
7. **창을 닫으면**: 저장된 조각은 남지만 멈춘 상자·이어서는 기억하지 않는다. 다시 열어 같은 단추를 누르면 처음부터 다시 읽는다
8. 조각마다 저장 뒤 지금 기간을 다시 읽어 아래 칸이 잠깐 '불러오는 중'이 된다(조각 수만큼). 지금 저장 뒤와 같은 동작이다
9. **합친 줄 이름이 길다**: '30일 넘어 다시 왔거나 아직 안 옴'은 112px 이름 칸에서 두세 줄로 바뀐다. 줄 모양은 지금 그대로 두고(새 시안 없음) 끝 검토의 1440·390px 사진으로 본다. 보기 나쁘면 사용자에게 묻는다
10. **옛 달은 늘 합쳐 보임**: 오늘에서 대략 800일보다 먼 달은 오늘까지 한 번에 읽을 수 없어 after30이 늘 null이다. 그 달이 든 기간의 첫 재방문까지 날수는 늘 넷이다(사용자 결정)

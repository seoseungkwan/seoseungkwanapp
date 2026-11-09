# 설계: 통계 비트 불러올 기간 고르기 (최근 1년·2년·2020년부터 전부, 나눠 읽기)

## 개요
- 비트 칸(`SourcePicker.tsx` `BitLoad`)에 '불러올 기간' 묶음 단추와 안내 줄을 더한다. 누르면 화면(`StatsScreen.tsx`)이 순수 함수 `planLoad`로 조각 계획을 세우고, 조각을 새것부터 하나씩 지금의 `load(...)`로 읽어 `partSave`로 다듬은 값을 지금의 `data.save(...)`로 저장한다
- 새 파일은 순수 모듈 하나(`src/components/stats/loadPlan.ts`)와 그 시험뿐이다. Worker에는 칸 하나(`keep`)만 더한다. 도우미·확장·`commands.json`·DB·서버는 그대로다
- 조각이 하나(합친 기간 800일 이하)면 지금과 한 글자도 다르지 않게 돈다. '지금 보는 기간'이 처음 값이므로 누르는 방법을 바꾸지 않은 사람에게는 지금과 같다

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
export const LOAD_SPANS: readonly { span: LoadSpan; name: string }[] // 지금 보는 기간 · 최근 1년 · 최근 2년 · 2020년부터 전부
export const MAX_READ_DAYS = 800 // commands.json stats.rows maxDays · stats_coverage 제약과 같다(AC-3305.1 시험이 묶는다)
const PART_MONTHS = 24
export type LoadPart = { save: DateRange; read: DateRange } // save = 저장할 달들, read = 도우미에 묻는 범위(이웃 달 하나씩 더함)
export type LoadPlan = { span: LoadSpan; whole: DateRange; parts: LoadPart[]; keepAt: number } // parts는 새것부터
export function planLoad(today: string, range: StatsRange, span: LoadSpan): LoadPlan
export function partSave(view: StatsLoaded, part: LoadPart): SaveInput // source 'bit'
export function loadHint(today: string, range: StatsRange, plan: LoadPlan): string // 단추 아래 안내 줄
export function monthsLabel(span: DateRange): string // '2022년 12월 – 2024년 11월' · 한 달이면 '2020년 1월'
export function progressText(plan: LoadPlan, at: number): string // 읽는 중 줄(N ≥ 2)
export function doneText(plan: LoadPlan, savedTo: string): [string, string]
export function stoppedText(plan: LoadPlan, done: number, reason: string): [string, string] // reason = '(오류 번호 …)' 또는 확인 건수 글
```
- 날짜는 `lib/analytics/dates.ts`(`addMonths`·`monthRange`·`monthOf`·`diffDays`·`compareYmd`)만 쓴다. `FIRST_DAY`·`lastDayOf`는 `periodPick.ts`에서 가져온다
- `periodPick.ts`의 `spanLabel`·`hasFinal`을 `export`만 한다(동작은 그대로). 날짜 글·받침 조사를 두 곳에 두지 않으려고
- `planLoad` 셈
  1. 단추 첫날: view 없음, 1y `addMonths(monthOf(today), -11)`의 1일, 2y `-23`의 1일, all `FIRST_DAY`. whole = { min(`range.load.from`, 단추 첫날), today }
  2. `diffDays(whole.from, whole.to) + 1 ≤ MAX_READ_DAYS`면 `parts = [{ save: whole, read: whole }]`
  3. 넘으면 k = 0, 1, …: 끝 달 = 오늘 달 − 24k, 첫 달 = 끝 달 − 23. save = { max(첫 달 1일, whole.from), k = 0이면 today 아니면 끝 달 말일 }. save 첫날이 whole.from이면 멈춘다
  4. read: 가장 옛 조각이 아니면 from = save 첫 달의 앞 달 1일, 가장 새 조각이 아니면 to = save 끝 달의 다음 달 말일. 26달 = 793일이 가장 길다(AC-3302.4 시험이 2026 ~ 2032년 모든 날로 확인)
  5. keepAt = `parts.findIndex(p => read ⊇ { range.current.from, min(range.current.to, today) })`, 없으면 0 (StatsScreen `splitSpan`과 같은 범위)
- `partSave`: save 달 범위(`monthOf(save.from)` ~ `monthOf(save.to)`)로 months·sections를 거르고 날 범위로 days를 거른다. covered는 겹친 구간. 조각이 하나면 거르는 것이 없어 Worker 값 그대로다(AC-3302.6)
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
  - 멈춤(`stop !== null && done ≥ 1`): 같은 모양(`stoppedText`) + `mt-2 ${ds.button.secondary}` [이어서 불러오기] (`aria-disabled={job !== null || undefined}`)
  - `done === 0`(첫 조각에서 멈춤)은 상자를 그리지 않는다. 그런 멈춤은 `readParts`가 `setRun`을 부르지 않는 길이라 생기지 않는다
- `SourcePicker`에 `range`·`progress={partAt && job === 'bit' ? progressText(partAt.plan, partAt.at) : null}`·`onLoad={loadFromBit}`을 넘긴다

### Worker 쪽 `keep`
- `src/types/stats.ts` `StatsLoadRequest`에 `keep?: boolean`(false면 이 답의 진료 줄·접수 줄을 메모리에 남기지 않는다)
- `src/workers/stats/jobs.ts` `createStatsHost.load`: `if (request.keep !== false) { memory = loaded.memory; bit = loaded.bit }`. 답(`loaded`)은 지금처럼 보낸다. 환자 자료 구역 규칙(네트워크·console·저장소·React import 없음)은 그대로다
- `src/workers/statsClient.ts` `requestLoad`: `keep === false`일 때만 메시지에 `keep: false`를 싣는다(지금 시험이 메시지 모양을 `toEqual`로 본다)
- `src/components/stats/useStatsWorker.ts` `load`: `keep?: boolean`을 받아 `requestLoad`로 넘긴다

## 데이터 흐름
```
[불러올 기간] span ─┐
range(지금 보는 기간) ┴→ planLoad → parts(새것부터) ─┬→ loadHint(안내 줄)
                                                    └→ 누름 → 조각 i마다:
   load(read_i, closeToday: i==0, keep: i==keepAt) → 도우미 stats.rows(≤ 800일) → Worker loadJob
   → i==0: 보고 문장 / i==keepAt: loads+1 → split·sections(Worker 메모리 = keepAt 조각)
   → incomplete: i==0 확인 카드 · i≥1 멈춤
   → partSave(view, part_i) → saveStats(달·날 upsert, 덮은 기간 = save_i) → 다시 읽기
   → 실패: i==0 지금 카드 · i≥1 멈춤 상자 + [이어서 불러오기](i부터)
```
- 서버로 가는 것은 지금의 저장 모양(달·날·세 칸 합계·덮은 기간)뿐이다. 조각이 많아도 줄 모양·크기 한도는 그대로이고 덮은 기간 줄이 조각마다 하나씩 는다

## 결정과 트레이드오프
1. **24달 조각 + 이웃 달 하나씩 더 읽고 빼기**: 날 줄의 신환 재방문(7·14·30일 창)과 같은 처방 재방문(again)은 그날 뒤 30일이 읽은 범위 안에 있어야 숫자가 되고(아니면 '셀 수 없음' null), 같은 처방 '시작'은 앞 30일을 본다(fu-rate). 이웃 달 없이 자르면 옛 조각 끝 30일이 '셀 수 없음'으로, 새 조각 첫 30일이 '시작'을 더 세어 저장되고, 전에 넓게 불러와 바르게 저장한 날을 덮는다(완전한 줄끼리라 트리거가 막지 않는다). 한 달씩 더 읽어도 가장 긴 read는 793일이라 한도 안이다. 더 읽은 달은 `partSave`가 버린다(그 달은 이웃 조각이 바르게 저장한다)
2. **800일 이하는 한 번에**: 지금 되는 불러오기(빠른 단추 넷, 최근에 가까운 달·해)는 요청·저장이 그대로다. 최근 2년(709일)도 한 번이다. 800일을 넘는 것만 나눈다
3. **새것부터**: 시안대로. 중간에 멈춰도 최근 숫자가 먼저 남는다
4. **보고 문장은 첫 조각**: `report`는 읽은 끝(`to`)의 날·달 숫자라 오늘에 끝나는 첫 조각만 맞다
5. **처방별·세 칸은 keepAt 조각, Worker는 그 조각만 메모리에 남김(`keep`)**: 새것부터 읽으면 마지막에 읽는 조각이 가장 옛것이라, 지금처럼 매번 메모리를 바꾸면 최근 30일을 보며 전부를 읽은 뒤 처방별 신환·재진이 '불러오지 않았어요'가 된다. keepAt은 지금 보는 기간을 다 담는 조각이라 옛 달·해를 보며 누른 경우(지금은 도우미가 거절하던 경우)도 그 기간 처방별·세 칸이 나온다. 다 담는 조각이 없으면(조각 경계를 넓게 걸친 직접 날짜·해) 첫 조각을 남기고 그 기간은 지금처럼 '불러오지 않았어요' 안내다
6. **확인 필요(incomplete)인 조각은 멈춘다**: 시안의 멈춤 상자와 [이어서 불러오기]를 그대로 쓴다. 비트에서 기록을 고친 뒤 [이어서 불러오기]가 그 조각부터 다시 읽는다. 건너뛰고 계속하면 시안에 없는 '몇 조각은 저장 안 함' 글이 또 필요하다
7. **첫 조각에서 멈추면 지금과 같다**: 저장된 조각이 없으니 [이어서 불러오기]는 [비트에서 불러오기]와 같다. 지금의 오류·확인·다시 저장 카드를 그대로 쓴다
8. **둘째 조각부터의 읽기 실패는 상자에만 번호**: 시안대로 상자 한 곳에 번호를 둔다. 통로가 끊기면 띠의 비트 칸이 지금처럼 연결 상태와 [다시 확인]을 따로 보인다. 저장 실패는 [다시 저장] 카드가 `data.unsaved`에서 나오므로 함께 보인다(번호가 두 곳)
9. **저장 실패도 멈춤**: `data.retrySave`는 마지막 못 한 저장 하나만 들고 있다. 계속 읽으면 다음 조각이 그것을 덮는다. [이어서 불러오기]는 그 조각부터 다시 읽는다(같은 값을 다시 덮어 해가 없다)
10. **끝난 상자는 조각이 둘 이상일 때만**: 시안에서 한 번 읽기는 끝난 뒤 고르기 상태로 돌아간다. 지금처럼 출처 줄 '· 방금'이 알린다
11. **저장한 끝날 글의 해**: 시안의 '2020년 1월 1일 – 11월 8일'은 2020년 11월 8일로 읽힌다. 안내 줄과 같은 규칙(해를 넘으면 양 끝)으로 '2020년 1월 1일 – 2026년 11월 8일'로 쓴다
12. **안내 글 넓히기**: 시안은 최근 30일만 보였다. 다른 기간은 이름·비교 이름·받침 조사·'(1년)' 괄호·나눠 읽기·걸리는 때를 AC-3301.4 규칙으로 만든다(시안의 네 글은 규칙에서 그대로 나온다)
13. **불러올 기간을 기억하지 않음**: 화면을 열 때마다(그리고 비트 칸이 다시 그려질 때마다, '오늘 진료 끝'과 같이) '지금 보는 기간'이다. 메인 세션이 정한 것
14. **'오늘 진료 끝'은 첫 조각에만**: 다른 조각은 끝이 어제보다 앞이라 값이 숫자를 바꾸지 않지만, 뜻을 분명히 하려고 false로 보낸다

## 위험 / 미해결 질문
1. **한 조각의 줄 수 한도**: 도우미는 한 번에 진료 줄·접수 줄 각각 700,000줄까지다(넘으면 E-STATS-TOO-BIG). 지금 최근 12개월이 24달을 읽고, 나눠 읽기는 이웃 달까지 26달을 읽는다. 아주 바쁜 의원이면 한 조각이 이 한도를 넘을 수 있고, 그때는 멈춤 상자에 그 번호가 나오며 [이어서 불러오기]로도 넘지 못한다(조각 크기를 줄이는 것은 범위 밖)
2. **걸리는 때는 어림**: '4분쯤'은 조각당 1분으로 친 것이다. 실제 비트 PC 시간은 재지 않았다. 조각마다 지금의 한도(통로 20분, 끝 뒤 Worker 120초)는 그대로다
3. **다 담는 조각이 없는 기간**: 조각 경계를 넓게 걸친 직접 날짜나 해(경계는 오늘 달에 따라 움직인다)는 저장은 되지만 처방별·세 칸이 '불러오지 않았어요'다. 그 안내의 '이 기간을 고른 채 [비트에서 불러오기]를 누르면 보여요'가 그 경우엔 맞지 않는다
4. **첫 조각이 확인 필요이고 keepAt이 0이 아님**: 확인 카드의 '처방별 신환·재진과 보고 문장은 방금 불러온 숫자예요.' 가운데 처방별은 이번 답이 아니다(옛 달을 보며 누르고 첫 조각에 기록 문제가 있을 때만)
5. **2020년보다 앞**: 직접 날짜의 긴 비교처럼 `range.load`가 2020년 앞이면(예 5년 직접 날짜 → 바로 전 5년) 지금 규칙대로 그 날부터 여러 조각을 읽는다(지금은 도우미가 거절하던 경우)
6. **덮어쓰기**: 늘 고른 기간 전체를 다시 읽어 덮는다. 전에 다른 범위로 저장한 날의 재방문 숫자가 바뀔 수 있는 것은 지금(fu-rate 2026-11-05 사용자 결정)과 같다. 파일로 저장한 달도 비트 숫자로 덮인다(지금과 같다)
7. **창을 닫으면**: 저장된 조각은 남지만 멈춘 상자·이어서는 기억하지 않는다. 다시 열어 같은 단추를 누르면 처음부터 다시 읽는다
8. 조각마다 저장 뒤 지금 기간을 다시 읽어 아래 칸이 잠깐 '불러오는 중'이 된다(조각 수만큼). 지금 저장 뒤와 같은 동작이다

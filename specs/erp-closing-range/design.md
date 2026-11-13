# 설계: ERP 마감일지 기간 채우기

> 지금 확장(spec erp-closing-fill)의 하루 채우기 부품(`askDay`·`planCells`·`fillAll`·안내 틀)을 그대로 쓰고, 날짜 바꾸기·저장·기간 흐름·안내만 더한다. ERP 도우미(`helper-erp/`, 0.2.0)·`helper/`·`src/`는 고치지 않는다.
> ERP 화면 사실은 `notes/erp-screen-1113.md`(줄 번호는 그 파일 기준). 실제 로그인 화면은 TASK-6에서 본다.

## 1. 흐름
```
[기간 채우기] → 기간 고르기(시작일·끝일) → [살펴보기]
  날마다: 날짜 바꾸기 → 다 불러옴 → 멈출 일 있나 → 마감일지 있음·상태 읽기 → closing.day(진료 수·함께 있는 진료)
→ 승인 안내 [덮어쓰고 저장 시작] (함께 있는 진료 고른 것 없으면 여기서 고름)
  채울 날마다: 날짜 바꾸기 → 다 불러옴 → 멈출 일 있나 → 되살린 입력 띠면 건너뜀 → closing.day 다시 →
    진료 0건이면 건너뜀 → planCells + fillAll('all') → [전체 저장] 확인 → [일일 상세 저장] 확인 → 다시 불러오기 기다림
→ 끝 안내 / [멈추기] → 멈춤 안내 [이어서 하기] / 멈출 일 → 멈춤 안내
```
- 한 번에 하나: 날짜 바꾸기·저장은 앞 차례가 끝난 뒤에만. 두 저장 모두 '저장되었습니다.' 쪽지라 동시에 누르지 않는다(조사 3절)
- 시간 어림: 하루 = 살펴보기(불러오기 1~2초 + 도우미 2초) + 채우기(불러오기 + 도우미 2초 + 채우기 + 저장 둘). 화면에 시간은 보이지 않는다

## 2. ERP 화면 다루기 `extension-erp/src/erpday.ts` (새 파일, TASK-2)
DOM만 다룬다. 칸 찾기·넣기는 `fill.ts`, 마감 일자 읽기는 `main.ts` `readDate`를 그대로 쓴다(`readDate`는 `main.ts`에서 그대로 export, 순환 import를 피하려면 TASK-2가 `readDate`·`dateLabels`를 `erpday.ts`로 옮기고 `main.ts`가 다시 export).
- `setDate(doc, date): Promise<void>` — '마감 일자' 날짜 칸(`readDate`가 찾는 그 `input.datepicker-input`)에 기본 value 설정 함수 + `input` 이벤트(bubbles). **focus를 주지 않는다**(달력 창이 열림). `FALLBACK_MS`(1,000) 뒤에도 `readDate(doc) !== date`면 `history.replaceState({ ...history.state, usr: { ...(history.state?.usr ?? {}), selectDate: date } }, '', location.pathname)` + `window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }))`(조사 1절 둘째 길, 뒤로 가기 기록 안 쌓임)
- `waitLoaded(doc, date, timeoutMs = LOAD_TIMEOUT_MS): Promise<LoadResult>` — 100ms마다 보고 아래가 `STABLE_MS`(400) 동안 이어지면 'ok':
  - `readDate(doc) === date` · `.closing-pdf-out` 안에 '불러오는 중입니다.' 없음 · `.load-state-error` 없음 · 업무일지 1 탭이면 `.closing-w1-box`가 하나 이상 · `#closing-panel-w2 .cdf-empty`에 '로딩 중' 없음 · '전체 저장' 단추가 있으면 `disabled` 아님(불러온 날 ≠ 고른 날이면 막혀 있음, 조사 1절)
  - 시작할 때 1 탭이 아니면 `#closing-tab-w1`을 누른다(1 저장 카드는 1 탭에만 있음, 조사 3절)
  - `.load-state-error`가 `STABLE_MS` 동안 보이면 'error', 시간이 넘으면 'timeout'
- `blocker(doc): Block | null` — 차례대로 `.dialog-overlay`가 보임(크기 있음) → `{ kind: 'dialog' }` · 날짜 칸 없이 '(오늘)' 글자 → `todayOnly` · `.closing-w1-box`나 `.cdf-table`을 품은 `fieldset[disabled]` → `readOnly` · `.cdf-save-bar`가 없음 → `noSaveBar`. 다 불러온 뒤에만 부른다
- `draftNotice(doc): boolean` — `.journal-draft-notice`가 보임
- `readJournal(doc): JournalState` — `exists` = 글자가 '마감일지 삭제'인 `button`이 있음(조사 5절) · `status` = `exists`일 때 label '상태' 옆 `select` 값('draft'|'confirmed', 그 밖이면 null), 아니면 null
- `save(doc, which: 'w1' | 'w2', timeoutMs = SAVE_TIMEOUT_MS): Promise<SaveResult>`
  - 단추: w1 = `#closing-panel-w2` 밖, 글자(앞뒤 공백 정리)가 정확히 '전체 저장'인 `button` / w2 = `.cdf-save-bar` 안 글자 '일일 상세 저장'인 `button`. 없거나 `disabled`면 'missing'(누르지 않음). w1은 누르기 전에 1 탭으로
  - 누르기 전에 `MutationObserver`(document.body, subtree)를 켜 **새로 붙은** `.toast-success`·`.toast-error`만 본다(이미 있던 쪽지는 세지 않음)
  - `click()` 한 번 → 새 `.toast-error` = 'error' · 새 `.toast-success`를 봤고 그 단추 글자가 '저장 중...'이 아님 = 'ok' · `timeoutMs` 넘음 = 'timeout'. 끝나면 관찰을 끈다
- 상수(`rangeTypes.ts`): `LOAD_TIMEOUT_MS` 30,000 · `SAVE_TIMEOUT_MS` 30,000 · `STABLE_MS` 400 · `FALLBACK_MS` 1,000
- 누르는 것은 `#closing-tab-w1`·`#closing-tab-w2`·위 두 저장 단추뿐이다(AC-3703.2). 상태 select는 읽기만

## 3. 기간 흐름 `extension-erp/src/range.ts` (새 파일, TASK-4)
DOM을 모른다. 부품을 받아 차례만 정한다(가짜 부품으로 시험).
```ts
export type RangeDeps = {
  setDate(date: string): Promise<void>
  waitLoaded(date: string): Promise<LoadResult>
  blocker(): Block | null
  draftNotice(): boolean
  readJournal(): JournalState
  /** closing.day. 도우미 오류는 { block: { kind: 'helper', code } } */
  askDay(date: string): Promise<{ day: ClosingDay } | { block: Block }>
  /** planCells(day, settings, choice) + fillAll(doc, plan, 'all') */
  fill(day: ClosingDay, choice: OverlapChoice | undefined): Promise<void>
  save(which: 'w1' | 'w2'): Promise<SaveResult>
  /** 화면을 떠났으면 true: 곧바로 조용히 끝낸다(아무 안내 없음) */
  gone(): boolean
}
export function rangeDays(from: string, to: string): string[]          // 'YYYY-MM-DD' 옛날부터, 양 끝 포함
export function scanRange(days, deps, onProgress: (done: number) => void, cancel: () => boolean):
  Promise<{ scan: ScanSummary } | { block: Block } | { cancelled: true } | { gone: true }>
export function runRange(days: string[], deps, choice: OverlapChoice | undefined,
  onProgress: (saved: number, current: string) => void, stop: () => boolean, prior?: RunSummary):
  Promise<{ run: RunSummary; outcome: 'end' | 'stopped' | 'blocked'; block?: Block } | { gone: true }>
```
- `scanRange` 날마다: `setDate` → `waitLoaded`('ok'가 아니면 그날은 `unloaded`에 넣고 다음 날로 — 채우기 때 다시 불러오도록 `fill`에도 넣는다, 도우미는 부르지 않음) → `blocker()` 있으면 `{ block }` → `readJournal()` → `askDay`(block이면 `{ block }`) → `total === 0`이면 `zero`, 아니면 `exists`에 따라 `written`(status 함께) 또는 `fresh` → `overlapVisits += overlap?.visits ?? 0`. `cancel()`이면 지금 날을 끝낸 뒤 `{ cancelled: true }`
- `runRange` 날마다(`stop()`·`gone()`은 날짜를 바꾸기 전에 본다): `setDate` → `waitLoaded`('ok' 아니면 `failed` 'load') → `blocker()`면 멈춤(그날은 `remaining` 앞에 남음) → `draftNotice()`면 `skipped` 'draft' → `askDay`(block이면 멈춤) → `total === 0`이면 `skipped` 'zero' → `fill` → `save('w1')`('ok' 아니면 `failed` 'w1Error'|'w1Timeout', 'missing'은 'w1Error') → `save('w2')`(같은 규칙 'w2…') → 둘 다 'ok'면 `saved`에 넣고 `waitLoaded`(결과는 보지 않음, 다음 날 setDate 전에 다시 불러오기가 끝나게) → `onProgress`
- `prior`가 있으면(이어서 하기) 그 `saved`·`skipped`·`failed`에 더한다. `total`은 처음 승인 때 S 그대로
- 승인 때 건너뛸 날(진료 0건)은 `runRange`에 넣지 않고 main이 `skipped` 'zero'로 `prior`에 넣어 끝 안내에 보인다

## 4. 기간 안내 `extension-erp/src/rangeView.ts` (새 파일) · `panel.ts` (TASK-3)
- `panel.ts`: 단추 줄에 [기간 채우기](`.fill-btn2` 흰 바탕·`--line-strong` 테두리·같은 높이, [비트 값 채우기] 왼쪽). `createDock(doc, handlers)`의 handlers에 `onRange(): void`·`onRangeAction(action: RangeAction): void`를 더하고 `Dock`에 `showRange(view: RangeView): void`·`setRangeBusy(on: boolean): void`(두 단추·[지난 결과] 막기)를 더한다. 기간 안내는 지금 `.panel`·`.acts`(늘 보이는 단추 줄)·스크롤·글꼴 규칙 그대로 같은 그림자 뿌리 안에 그린다. Esc·×는 `pick`·`todayOnly`·`confirm`·`stopped`·`blocked`·`end`에서만 `close`, `scanning`·`running`은 없다. 다른 안내를 보이면 기간 안내는 사라진다
- `rangeView.ts`: `renderRange(doc, view: RangeView, act: (a: RangeAction) => void): HTMLElement`(그 안내 몸통) · `RANGE_TEXT` · `periodLabel(from, to)` · `dayList(days, confirmed?)`. 글은 모두 textContent. `panel.ts`가 `rangeView.ts`를 부르므로 `rangeView.ts`는 `panel.ts`를 import하지 않는다(순환) — `OVERLAP_TEXT`가 필요하면 TASK-3이 작은 새 파일로 옮기거나 `renderRange`에 넘긴다(`panel.ts`의 지금 export 이름은 그대로)
- 날짜 모양: `periodLabel` — 같은 날 '{M}월 {D}일' · 같은 달 '{M}월 {D}일~{D2}일' · 같은 해 '{M}월 {D}일~{M2}월 {D2}일' · 다른 해 '{Y}년 {M}월 {D}일~{Y2}년 {M2}월 {D2}일'. `dayList` — 'M/D'를 ' · '로, 확정한 날은 뒤에 ' 확정', 10개를 넘으면 앞 10개 + ' 외 {k}일'. '지금:' 줄은 '{M}월 {D}일'. 숫자는 쉼표
- 글 (`RANGE_TEXT`, 시안 그대로 + 시안에 없는 것):
  - 단추 '기간 채우기' · 머리 작은 글(`.pt`): pick '기간 채우기' · scanning '기간 채우기 · 살펴보는 중' · confirm '기간 채우기 · 확인' · running '기간 채우기 · 저장 중' · stopped·blocked '기간 채우기 · 멈춤' · end '기간 채우기 · 끝'
  - pick: '채울 기간을 골라 주세요.' · 칸 이름 '시작일'·'끝일'(`input[type=date]`, `max` = 오늘) · '오늘 뒤 날짜는 고를 수 없어요. [살펴보기]를 누르면 기간 안 날마다 이미 적어 둔 것이 있는지 먼저 봐요. 아직 아무 칸도 바꾸지 않아요.' · 막는 줄: 빈 칸 '시작일과 끝일을 골라 주세요.' / 시작일 > 끝일 '시작일이 끝일보다 뒤예요.' / 오늘 뒤 '오늘 뒤 날짜는 고를 수 없어요.' · [닫기]·[살펴보기]
  - todayOnly: '이 계정은 오늘 마감일지만 열 수 있어 기간 채우기를 쓸 수 없어요.' · '날짜를 고를 수 있는 계정으로 열어 주세요. 아무 칸도 바꾸지 않았어요.' · [닫기]
  - scanning: '기간 안 날을 살펴보는 중이에요.' · 진행 막대 · '{N}일 중 {k}일' · '아직 아무 칸도 바꾸지 않아요.' · [그만두기]
  - confirm: 굵은 줄 '{기간} 중 {S}일을 비트 값으로 덮어쓰고 저장해요.'(시작일 = 끝일이면 '{기간}을 비트 값으로 덮어쓰고 저장해요.') · 묶음 '새로 채울 날 {n}일' / '이미 적어 둔 날 {m}일 — 작성중 {a}일 · 확정 {b}일 ({dayList})' / '확인하지 못한 날 {u}일 — 채울 때 다시 불러와요 ({dayList})' / '진료 0건이라 건너뛸 날 {z}일 ({dayList})' · 경고 '이미 적어 둔 {m}일도 비트 값으로 바뀌어요.'(+ b > 0이면 ' 확정한 날도 바뀌어요.') / '날마다 ERP의 '전체 저장'과 '일일 상세 저장'을 확장이 눌러요. 상태(작성중·확정)는 그대로 둬요.' / 함께 있는 진료(AC-3702.3) '씨암·SONO를 같이 받은 진료는 지난번 고른 대로 {OVERLAP_TEXT.into} 넣어요.' 또는 묻는 줄 '씨암·SONO를 같이 받은 진료가 {K}건 있어요. 어디에 넣을까요?' + `OVERLAP_TEXT.choice` 세 단추(누른 것 `aria-pressed="true"`) · 작은 줄 '도는 동안 이 크롬 창을 닫거나 다른 화면으로 옮기지 마세요.' · [닫기]·[덮어쓰고 저장 시작]. S = 0이면 '{기간}에는 채울 날이 없어요.' + 건너뛸 날 묶음 + [닫기]
  - running: '{S}일 중 {k}일 저장했어요.' · 진행 막대 · '지금: {M월 D일} 채우는 중' · '[멈추기]를 누르면 지금 날까지 저장하고 멈춰요. 멈춘 뒤 다시 시작하면 남은 날부터 이어 가요.' · [멈추기](누르면 막히고 글자 '멈추는 중…')
  - stopped: '멈췄어요. {k}일 저장했어요.' · '남은 날 {r}일 ({dayList})' · 결과 줄(아래) · [닫기]·[이어서 하기]
  - blocked: 굵은 줄·작은 줄 = 까닭(아래) · '{k}일 저장했어요. 남은 {r}일은 하지 않았어요.' · 결과 줄 · [닫기](+ dialog·noSaveBar·helper면 [이어서 하기])
    - dialog 'ERP 화면에 안내 창이 떠서 멈췄어요.' / 'ERP 창을 보고 닫은 뒤 [이어서 하기]를 눌러 주세요.'
    - todayOnly = 위 todayOnly 두 줄
    - noSaveBar '업무일지 2 저장 줄이 없어 멈췄어요.' / 'ERP에 진료실이 하나 이상 있어야 업무일지 2를 저장할 수 있어요. 확인한 뒤 [이어서 하기]를 눌러 주세요.'
    - readOnly '이 화면은 읽기 전용이라 저장할 수 없어요(본사 열람 등).' / '저장할 수 있는 계정으로 열어 주세요.'
    - helper = `errors.ts` `explain(code)`의 무엇·어떻게 그대로
  - end: '{n}일을 비트 값으로 저장했어요.'(n = 0이면 '저장한 날이 없어요.') · 결과 줄 · '직접 넣는 칸(담당자·지출·특이사항 등)은 건드리지 않았어요.' · [닫기]
  - 결과 줄(stopped·blocked·end 같이 씀, 0인 줄 없음): '건너뛴 날 {z}일 — 진료 0건 ({dayList})' / '건너뛴 날 {d}일 — 저장하지 않은 입력이 남은 날 ({dayList})' / '저장 못 한 날 {f}일' 아래 날마다 '{M/D}: {까닭}'과 끝에 '그날을 열어 [비트 값 채우기]로 다시 해 주세요.'
    - 까닭: load 'ERP가 그날을 불러오지 못했어요.' · w1Error 'ERP가 업무일지 1 저장 오류를 알렸어요.' · w1Timeout 'ERP가 업무일지 1을 저장했다는 답을 주지 않았어요.' · w2Error 'ERP가 업무일지 2 저장 오류를 알렸어요(업무일지 1은 저장됨).' · w2Timeout 'ERP가 업무일지 2를 저장했다는 답을 주지 않았어요(업무일지 1은 저장됨).'

## 5. 공용 타입 `extension-erp/src/rangeTypes.ts` (새 파일, TASK-1)
```ts
export const LOAD_TIMEOUT_MS = 30_000
export const SAVE_TIMEOUT_MS = 30_000
export const STABLE_MS = 400
export const FALLBACK_MS = 1_000
export type JournalState = { exists: boolean; status: 'draft' | 'confirmed' | null }
export type LoadResult = 'ok' | 'error' | 'timeout'
export type SaveResult = 'ok' | 'error' | 'timeout' | 'missing'
export type Block = { kind: 'dialog' } | { kind: 'todayOnly' } | { kind: 'noSaveBar' } | { kind: 'readOnly' } | { kind: 'helper'; code: string }
export type SkipWhy = 'zero' | 'draft'
export type FailWhy = 'load' | 'w1Error' | 'w1Timeout' | 'w2Error' | 'w2Timeout'
export type ScanSummary = {
  from: string; to: string
  fill: string[]                                   // 채울 날(새로 + 이미 + 못 불러온 날), 옛날부터. S = fill.length
  fresh: string[]; written: { date: string; status: 'draft' | 'confirmed' | null }[]; zero: string[]; unloaded: string[]
  overlapVisits: number
}
export type RunSummary = {
  from: string; to: string; total: number          // total = 승인 때 S
  saved: string[]; skipped: { date: string; why: SkipWhy }[]; failed: { date: string; why: FailWhy }[]; remaining: string[]
}
export type RangeView =
  | { kind: 'pick'; from: string; to: string; today: string }
  | { kind: 'todayOnly' }
  | { kind: 'scanning'; total: number; done: number }
  | { kind: 'confirm'; scan: ScanSummary; last?: OverlapChoice }
  | { kind: 'running'; total: number; saved: number; current: string; stopping?: boolean }
  | { kind: 'stopped'; run: RunSummary }
  | { kind: 'blocked'; block: Block; run: RunSummary }
  | { kind: 'end'; run: RunSummary }
export type RangeAction =
  | { kind: 'scan'; from: string; to: string } | { kind: 'cancelScan' }
  | { kind: 'start'; choice?: OverlapChoice } | { kind: 'stop' } | { kind: 'resume' } | { kind: 'close' }
```
(`OverlapChoice`·`ClosingDay`는 `types.ts`에서 import)

## 6. 잇기 `extension-erp/src/main.ts` (TASK-4)
- [기간 채우기](`onRange`): `busy`면 무시 → 날짜 칸 없이 '(오늘)'면 `todayOnly` → 설정 `load()`(null이면 지금처럼 설정 화면 열기 + `first`) → `pick`(처음 값 AC-3701.1)
- `scan` → `busy = true`, `setRangeBusy(true)`, 지금 [되돌리기]·[지난 결과] 기억을 지움(`remember(null)`) → `scanRange` → `scanning` 진행 → 결과: `confirm`(설정 `overlap`을 `last`로) / `blocked`(k = 0) / 그만둠이면 닫기
- `start` → 고른 것이 있으면 `saveOverlap`(실패해도 진행) → `prior` = 진료 0건 날을 `skipped` 'zero'로 → `runRange(scan.fill, …)` → `running` 진행 → `end`·`stopped`·`blocked`
- `stop` → 멈춤 표시(`stopping`)만, `runRange`의 `stop()`이 true가 됨 · `resume` → 남은 날로 `runRange`(prior = 앞 결과) · `close` → 숨기고 `busy = false`, `setRangeBusy(false)`
- deps는 `erpday.ts` 함수에 `doc`을 묶고, `askDay`는 지금 함수(오류 → `{ block: { kind: 'helper', code } }`, 오늘 뒤 날짜는 기간에서 이미 막힘), `fill`은 `planCells(day, settings, choice)` + `fillAll(doc, plan, 'all')`, `gone`은 지금 `visit` 비교
- 화면을 떠나면(`leave`) 도는 흐름은 `gone()`으로 조용히 끝나고 기억은 사라진다(AC-3704.3)

## 7. 시험
- `extension-erp/src/__tests__/erpPage.ts`(가짜 ERP 화면, TASK-2가 넓힘, 지금 시험은 그대로 통해야 함): 옵션 `days`(날짜 → { status, values, draftNotice, loadError }) · `loadMs`(날짜를 바꾼 뒤 새 날이 그려지기까지, 'never' 가능) · `saveResult(which, date)`('ok'·'error'·'never') · `saveMs` · `noSaveBar` · '마감일지 삭제' 단추(그날 마감일지 있을 때) · '상태' select · 1 탭에만 있는 저장 카드('중간저장'·'전체 저장') · `.cdf-save-bar`('중간저장'·'일일 상세 저장'·'초기화') · `.toast-container` 쪽지 · `.closing-pdf-out` '불러오는 중입니다.' · `showDialog()`. 날짜 칸 `input` 이벤트(또는 popstate의 `history.state.usr.selectDate`)면 그날을 다시 그린다. `ErpPage`에 `saves`(눌린 저장: which·date·그때 state 복사) · `date()`
- `erpday.test.ts`(TASK-2) · `rangeView.test.ts`·`panel.test.ts`(TASK-3) · `range.test.ts`(가짜 deps)·`main.range.test.ts`(가짜 화면 + 가짜 chrome.runtime, TASK-4) · `manifest.test.ts`·`readme.test.ts`(TASK-5)
- 확장 시험은 `npx vitest run extension-erp`, 빌드 `npm run ext-erp:build`

## 8. 위험
- 날짜 바꾸기·저장 쪽지·불러옴 신호는 공개 JS를 읽은 것(실측 없음) → TASK-6에서 하루 이틀로 먼저 본다. 안 되면 그 부분만 고쳐 명세를 다시 승인
- ERP가 판을 자주 바꾼다(11-10·11-11·11-13 세 번) → 표시를 못 찾으면 그날 '불러오지 못함'·'missing'으로 멈추거나 건너뛰지 아무거나 누르지 않는다
- 로그인이 풀리면 화면이 /login으로 가 확장 기억이 사라진다 → 다시 [살펴보기]부터(같은 값으로 다시 저장되어 괜찮음)
- 원무(오늘만) 계정은 쓸 수 없다(AC-3701.3)

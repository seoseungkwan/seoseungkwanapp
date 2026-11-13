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
- `setDate(doc, date): Promise<void>` — '마감 일자' 날짜 칸(`readDate`가 찾는 그 `input.datepicker-input`)에 기본 value 설정 함수 + `input` 이벤트(bubbles). **focus를 주지 않는다**(달력 창이 열림). `FALLBACK_MS`(1,000) 뒤에도 `readDate(doc) !== date`이고 `location.pathname === '/h/closing'`이면(화면을 떠났으면 하지 않음) `history.replaceState({ ...history.state, usr: { ...(history.state?.usr ?? {}), selectDate: date } }, '', location.pathname)` + `window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }))`(조사 1절 둘째 길, 뒤로 가기 기록 안 쌓임)
- `waitLoaded(doc, date, timeoutMs = LOAD_TIMEOUT_MS): Promise<LoadResult>` — 100ms마다 보고 아래가 `STABLE_MS`(400) 동안 이어지면 'ok':
  - `readDate(doc) === date` · `.closing-pdf-out` 안에 '불러오는 중입니다.' 없음 · `.load-state-error` 없음 · 업무일지 1 탭이면 `.closing-w1-box`가 하나 이상 · `#closing-panel-w2 .cdf-empty`에 '로딩 중' 없음 · '전체 저장' 단추가 있으면 `disabled` 아님(불러온 날 ≠ 고른 날이면 막혀 있음, 조사 1절)
  - 시작할 때 1 탭이 아니면 `#closing-tab-w1`을 누른다(1 저장 카드는 1 탭에만 있음, 조사 3절)
  - `.load-state-error`가 `STABLE_MS` 동안 보이면 'error', 시간이 넘으면 'timeout'
- `blocker(doc): Block | null` — 차례대로 `.dialog-overlay`가 보임(크기 있음) → `{ kind: 'dialog' }` · 날짜 칸 없이 '(오늘)' 글자 → `todayOnly` · `.closing-w1-box`나 `.cdf-table`을 품은 `fieldset[disabled]` → `readOnly` · `.cdf-save-bar`가 없음 → `noSaveBar` · 저장 단추가 하나씩이 아님(`#closing-panel-w2` 밖 글자 '전체 저장' `button`이 정확히 1개, `.cdf-save-bar` 안 '일일 상세 저장' `button`이 정확히 1개가 아니면) → `noSaveButton`. 다 불러온 뒤에만 부른다
- `todayOnly(doc): boolean` — 날짜 칸 없이 '(오늘)' 글자(안내 창이 떠 있어도 같음). `blocker`의 todayOnly도 이것을 쓴다
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
  /** 마감 일자 칸이 그날인가(readDate === date) */
  dateIs(date: string): boolean
  /** planCells(day, settings, choice)의 넣을 칸 중 화면에서 찾지 못한 칸 수(fill.ts locate 'notFound'). 칸은 바꾸지 않는다 */
  missingCells(day: ClosingDay, choice: OverlapChoice | undefined): Promise<number>
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
- `runRange` 날마다(`stop()`·`gone()`은 날짜를 바꾸기 전에 본다): `setDate` → `waitLoaded`('ok' 아니면 `failed` 'load') → `blocker()`면 멈춤(그날은 `remaining` 앞에 남음) → `draftNotice()`면 `skipped` 'draft' → `askDay`(block이면 멈춤) → `total === 0`이면 `skipped` 'zero' → 그날 `overlap.visits > 0`인데 `choice`가 없으면 멈춤 `overlapUnpicked` → `dateIs` 아니면 멈춤 `dateChanged` → `missingCells > 0`이면 멈춤 `{ kind: 'cellsMissing', count }` → `fill` → `dateIs` → `save('w1')` → `dateIs` → `save('w2')`. 멈춤은 모두 그날을 `remaining` 앞에 남긴다. 아래 저장 규칙: `save('w1')`('ok' 아니면 `failed` 'w1Error'|'w1Timeout', 'missing'은 'w1Error') → `save('w2')`(같은 규칙 'w2…') → 둘 다 'ok'면 `saved`에 넣고 `waitLoaded`(결과는 보지 않음, 다음 날 setDate 전에 다시 불러오기가 끝나게). `onProgress(saved, 지금 날)`은 하루를 시작할 때 부른다('지금:'에 끝난 날이 보이지 않게)
- `prior`가 있으면(이어서 하기) 그 `saved`·`skipped`·`failed`에 더한다. `total`은 처음 승인 때 S 그대로
- 승인 때 건너뛸 날(진료 0건)은 `runRange`에 넣지 않고 main이 `skipped` 'zero'로 `prior`에 넣어 끝 안내에 보인다

## 4. 기간 안내 `extension-erp/src/rangeView.ts` (새 파일) · `panel.ts` (TASK-3)
- `panel.ts`: 단추 줄에 [기간 채우기](`.fill-btn2` 흰 바탕·`--line-strong` 테두리·같은 높이, [비트 값 채우기] 왼쪽). `createDock(doc, handlers)`의 handlers에 `onRange(): void`·`onRangeAction(action: RangeAction): void`를 더하고 `Dock`에 `showRange(view: RangeView): void`·`setRangeBusy(on: boolean): void`(두 단추·[지난 결과] 막기)를 더한다. 기간 안내는 지금 `.panel`·`.acts`(늘 보이는 단추 줄)·스크롤·글꼴 규칙 그대로 같은 그림자 뿌리 안에 그린다. Esc·×는 `pick`·`todayOnly`·`confirm`·`stopped`·`blocked`·`end`에서만 `close`, `scanning`·`running`은 없다. 다른 안내를 보이면 기간 안내는 사라진다
- `rangeView.ts`: `renderRange(doc, view: RangeView, act: (a: RangeAction) => void): HTMLElement`(그 안내 몸통) · `RANGE_TEXT` · `periodLabel(from, to)` · `dayList(days, confirmed?)`. 글은 모두 textContent. `panel.ts`가 `rangeView.ts`를 부르므로 `rangeView.ts`는 `panel.ts`를 import하지 않는다(순환) — `OVERLAP_TEXT`가 필요하면 TASK-3이 작은 새 파일로 옮기거나 `renderRange`에 넘긴다(`panel.ts`의 지금 export 이름은 그대로)
- 날짜 모양: `periodLabel(from, to, today?)` — 같은 날 '{M}월 {D}일' · 같은 달 '{M}월 {D}일~{D2}일' · 같은 해 '{M}월 {D}일~{M2}월 {D2}일' · 다른 해 '{Y}년 {M}월 {D}일~{Y2}년 {M2}월 {D2}일'. 앞 셋은 그 해가 `today`의 해가 아니면 앞에 '{Y}년 '을 붙인다(연도를 잘못 친 것이 보이게). `dayList` — 'M/D'를 ' · '로, 확정한 날은 뒤에 ' 확정', 10개를 넘으면 앞 10개 + ' 외 {k}일'. '지금:' 줄은 '{M}월 {D}일'. 숫자는 쉼표
- 글 (`RANGE_TEXT`, 시안 그대로 + 시안에 없는 것):
  - 단추 '기간 채우기' · 머리 작은 글(`.pt`): pick '기간 채우기' · scanning '기간 채우기 · 살펴보는 중' · confirm '기간 채우기 · 확인' · running '기간 채우기 · 저장 중' · stopped·blocked '기간 채우기 · 멈춤' · end '기간 채우기 · 끝'
  - pick: '채울 기간을 골라 주세요.' · 칸 이름 '시작일'·'끝일'(`input[type=date]`, `max` = 오늘) · '오늘 뒤 날짜는 고를 수 없어요. [살펴보기]를 누르면 기간 안 날마다 이미 적어 둔 것이 있는지 먼저 봐요. 아직 아무 칸도 바꾸지 않아요.' · 막는 줄: 빈 칸 '시작일과 끝일을 골라 주세요.' / 시작일 > 끝일 '시작일이 끝일보다 뒤예요.' / 오늘 뒤 '오늘 뒤 날짜는 고를 수 없어요.'(이 차례로 첫 하나, 기간 길이 제한 없음 — 12절) · [닫기]·[살펴보기]
  - todayOnly: '이 계정은 오늘 마감일지만 열 수 있어 기간 채우기를 쓸 수 없어요.' · '날짜를 고를 수 있는 계정으로 열어 주세요. 아무 칸도 바꾸지 않았어요.' · [닫기]
  - scanning: '기간 안 날을 살펴보는 중이에요.' · 진행 막대 · '{N}일 중 {k}일' · '아직 아무 칸도 바꾸지 않아요.' · [그만두기]
  - confirm: 굵은 줄 '{기간} 중 {S}일을 비트 값으로 덮어쓰고 저장해요.'(시작일 = 끝일이면 '{기간}을 비트 값으로 덮어쓰고 저장해요.') · 묶음 '새로 채울 날 {n}일' / '이미 적어 둔 날 {m}일 — 작성중 {a}일 · 확정 {b}일 ({dayList})' / '확인하지 못한 날 {u}일 — 채울 때 다시 불러와요 ({dayList})' / '진료 0건이라 건너뛸 날 {z}일 ({dayList})' · 경고 '이미 적어 둔 {m}일도 비트 값으로 바뀌어요.'(+ b > 0이면 ' 확정한 날도 바뀌어요.') / '날마다 ERP의 '전체 저장'과 '일일 상세 저장'을 확장이 눌러요. 상태(작성중·확정)는 그대로 둬요.' / 함께 있는 진료(AC-3702.3) '씨암·SONO를 같이 받은 진료는 지난번 고른 대로 {OVERLAP_TEXT.into} 넣어요.' 또는 묻는 줄 '씨암·SONO를 같이 받은 진료가 {K}건 있어요. 어디에 넣을까요?' + `OVERLAP_TEXT.choice` 세 단추(누른 것 `aria-pressed="true"`) · 작은 줄 '도는 동안 이 크롬 창을 닫거나 다른 화면으로 옮기지 마세요.' · [닫기]·[덮어쓰고 저장 시작]. S = 0이면 '{기간}에는 채울 날이 없어요.' + 건너뛸 날 묶음 + [닫기]
  - running: '{S}일 중 {k}일 저장했어요.' · 진행 막대 · '지금: {M월 D일} 채우는 중' · '[멈추기]를 누르면 지금 날까지 저장하고 멈춰요. 멈춘 뒤 다시 시작하면 남은 날부터 이어 가요.' · [멈추기](누르면 막히고 글자 '멈추는 중…')
  - stopped: '멈췄어요. {k}일 저장했어요.' · '남은 날 {r}일 ({dayList})' · 결과 줄(아래) · [닫기]·[이어서 하기]
  - blocked: 굵은 줄·작은 줄 = 까닭(아래) · '{k}일 저장했어요. 남은 {r}일은 하지 않았어요.' · 결과 줄 · [닫기](+ dialog·noSaveBar·helper·dateChanged면 [이어서 하기])
    - dialog 'ERP 화면에 안내 창이 떠서 멈췄어요.' / 'ERP 창을 보고 닫은 뒤 [이어서 하기]를 눌러 주세요.'
    - todayOnly = 위 todayOnly 두 줄
    - noSaveBar '업무일지 2 저장 줄이 없어 멈췄어요.' / 'ERP에 진료실이 하나 이상 있어야 업무일지 2를 저장할 수 있어요. 확인한 뒤 [이어서 하기]를 눌러 주세요.'
    - readOnly '이 화면은 읽기 전용이라 저장할 수 없어요(본사 열람 등).' / '저장할 수 있는 계정으로 열어 주세요.'
    - helper = `errors.ts` `explain(code)`의 무엇 · 어떻게 + ' (번호 {code})'(하루 채우기 오류 안내와 같이, '이 번호를 알려 주세요'가 가리킬 번호)
    - dateChanged '채우는 동안 ERP 마감 일자가 바뀌어 멈췄어요.' / '그날은 저장하지 않았어요. 도는 동안에는 마감 일자를 바꾸지 말고 [이어서 하기]를 눌러 주세요.'
    - cellsMissing 'ERP 화면에서 찾지 못한 칸이 {n}개 있어 멈췄어요.' / 'ERP 화면이 바뀌었을 수 있어요. 그날은 아무 칸도 바꾸지 않았어요. [비트 값 채우기]를 누르면 어느 칸인지 보여요.'
    - noSaveButton 'ERP 저장 단추를 찾지 못해 멈췄어요.' / ''전체 저장'과 '일일 상세 저장'이 하나씩 있어야 해요. ERP 화면이 바뀌었을 수 있어요. 그날은 아무 칸도 바꾸지 않았어요.'
    - overlapUnpicked '씨암·SONO를 같이 받은 진료를 어디에 넣을지 정하지 않아 멈췄어요.' / '그날은 아무 칸도 바꾸지 않았어요. [닫기] 뒤 [기간 채우기]를 다시 하면 살펴본 뒤 어디에 넣을지 물어요.'
    - unexpected '확장에 뜻밖의 문제가 생겨 멈췄어요.' / '이 화면을 새로고침(F5)한 뒤 [기간 채우기]를 다시 해 주세요. 저장한 날은 '이미 적어 둔 날'로 보여요.'
  - end: '{n}일을 비트 값으로 저장했어요.'(n = 0이면 '저장한 날이 없어요.') · 결과 줄 · '직접 넣는 칸(담당자·지출·특이사항 등)은 건드리지 않았어요.' · [닫기]
  - 결과 줄(stopped·blocked·end 같이 씀, 0인 줄 없음): '건너뛴 날 {z}일 — 진료 0건 ({dayList})' / '건너뛴 날 {d}일 — 저장하지 않은 입력이 남은 날 ({dayList})' / '저장 못 한 날 {f}일' 아래 날마다 '{M/D}: {까닭}'과 끝에 '그날을 열어 [비트 값 채우기]로 다시 해 주세요.'
    - 까닭: load 'ERP가 그날을 불러오지 못했어요.' · w1Error 'ERP가 업무일지 1 저장 오류를 알렸어요.' · w1Timeout 'ERP가 업무일지 1을 저장했다는 답을 주지 않았어요.' · w2Error 'ERP가 업무일지 2 저장 오류를 알렸어요(업무일지 1은 저장됨).' · w2Timeout 'ERP가 업무일지 2를 저장했다는 답을 주지 않았어요(업무일지 1은 저장됨).'

## 5. 공용 타입 `extension-erp/src/rangeTypes.ts` (새 파일, TASK-1)
```ts
export const LOAD_TIMEOUT_MS = 30_000
export const SAVE_TIMEOUT_MS = 30_000
export const STABLE_MS = 400
export const FALLBACK_MS = 1_000
// MAX_DAYS 없음(12절, 기간 길이 제한 없음)
export type JournalState = { exists: boolean; status: 'draft' | 'confirmed' | null }
export type LoadResult = 'ok' | 'error' | 'timeout'
export type SaveResult = 'ok' | 'error' | 'timeout' | 'missing'
export type Block = { kind: 'dialog' } | { kind: 'todayOnly' } | { kind: 'noSaveBar' } | { kind: 'readOnly' } | { kind: 'helper'; code: string }
  | { kind: 'noSaveButton' } | { kind: 'dateChanged' } | { kind: 'cellsMissing'; count: number } | { kind: 'overlapUnpicked' } | { kind: 'unexpected' }
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
- [기간 채우기](`onRange`): `busy`면 무시 → `todayOnly(doc)`(안내 창이 떠 있어도)면 `todayOnly` → 설정 `load()`(null이면 지금처럼 설정 화면 열기 + `first`) → `pick`(처음 값 AC-3701.1, `today`를 넘겨 periodLabel이 해를 붙이게). `scan`은 pick과 같은 막는 규칙을 한 번 더 본다(기간 길이는 보지 않음)
- `runRange`에 넘기는 `choice`는 승인 때 고른 것, 없으면 설정의 지난번 고른 것(둘 다 없으면 undefined → 그날 함께 있는 진료가 있으면 `overlapUnpicked`로 멈춤)
- 살펴보기·채우기 흐름에서 뜻밖의 오류(throw)는 잡아서 그때까지의 결과로 `blocked` `{ kind: 'unexpected' }`를 보인다([닫기]로 단추가 풀림). `gone()`이면 아무것도 보이지 않는다
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

## 9. 설정 '매출로 셀 코드'는 코드만 (REQ-3707, TASK-9)
- 설정 화면(`options.ts` `amountRow`): '이 글자 뒤에 숫자' 줄(`data-prefixes`·글자 칸 `data-prefix`·[더하기] `data-padd`)과 그 처리(`addPrefixFrom`·입력·Enter)를 지운다. 안내 글은 `AMOUNT.about` 첫 문장만: '{이름} 코드가 있는 진료에서 아래 코드의 금액만 치료별 매출 {이름}에 넣어요.' 코드 줄(`data-extras`) 이름 글은 '셀 코드'
- 앞글자는 읽지 않는다(사용자 "그 내가 원하는것만 읽게해야해"): `settings.ts` `defaultRule`은 `{ prefixes: [], codes: [] }`, `cleanAmounts`는 저장값의 `prefixes`를 버리고 늘 `[]`(셀 코드만 다듬음). 그래서 `toGroups`는 셀 코드가 있을 때만 `amountPrefixes: []`·`amountCodes`를 붙인다(도우미 0.2.0 그대로, 지금 씨암 설정과 같은 모양). `options.ts`의 앞글자 조각·[×](`data-pdel`) 처리도 지운다. `AmountRule` 타입의 `prefixes` 칸은 도우미 모양 때문에 남기고 늘 빈 목록
- `settings.ts`의 `addPrefix`·`cleanPrefix`·`MAX_PREFIXES`는 쓰는 곳이 없어 지운다
- 셀 코드가 비면 '비어 있으면 위 코드 줄 금액만 넣어요.' 그대로
- README 처음 값 표(씨암·SONO 줄)와 '매출로 셀 코드' 설명을 화면 글에 맞춘다: 처음 값은 셀 코드 없음, 셀 코드는 찾아서 하나씩 더함(20개까지), 새 판으로 바꾼 뒤 씨암·SONO 셀 코드를 확인할 것(전 판 처음 값 LA로 세던 SONO 등은 코드를 넣기 전까지 매출이 줄어듦). '이 글자 뒤에 숫자' 설명은 지운다
- 시안: 바뀌는 것은 줄 하나를 지우는 것뿐이라 클릭 목업 대신 사용자 답의 글 그림으로 본다(2026-11-13)

## 10. 등록된 코드 전부에서 찾기 (REQ-3708, TASK-10·11·12)
- 잰 것(2026-11-13 이 PC 비트 DB, 건수만): SeeMst 609,202줄 · 코드 546,073개 · 오늘 쓸 수 있는 코드 391,980개(전부 SeeMdcTyp 1). 1년 쓴 코드는 410개. 코드·이름 찾기 TOP 30 한 번이 연결 포함 약 3초. 그래서 목록을 통째로 받지 않고(네이티브 메시지 1MB 넘음) 도우미가 글자마다 찾는다
- 도우미(TASK-10): `ClosingSql.FindCodesSql` = `SELECT TOP 30 UPPER(LTRIM(RTRIM(s.SeeOdrCod))) Code, MAX(s.SeeKorNam) Name FROM dbo.SeeMst s WHERE s.SeeOdrCod<>'' AND @day BETWEEN s.SeeAdpDte AND s.SeeExpDte AND (s.SeeOdrCod LIKE @starts OR s.SeeKorNam LIKE @contains) GROUP BY UPPER(LTRIM(RTRIM(s.SeeOdrCod))) ORDER BY Code`. `@starts` = 글자 + '%', `@contains` = '%' + 글자 + '%'이고 글자 안의 `%`·`_`·`[`는 `[%]`·`[_]`·`[[]`로 바꾼다. 시간 제한 15초. `Parameters`에 넣고, `commands.json`에 `closing.findCodes { text }`(patient false)를 더한다(인자 꼴은 표가 아는 글자 꼴을 쓰고, 없으면 표를 넓힌다). 답 `{ codes: [{ code, name }] }`. 이름이 NULL이면 null
- 확장(TASK-11): `types.ts` `ClosingCommand`에 `closing.findCodes`, `background.ts` `COMMANDS`에 더함. `options.ts` '셀 코드' 찾기만 바꾼다(묶음 코드 찾기 줄은 지금처럼 1년 목록). 0.4초 늦춰 묻기·마지막 질문 답만 쓰기·'찾는 중…'·'등록된 코드에 없어요.'·옛 도우미 안내 줄은 REQ-3708 글 그대로
- 판·안내서(TASK-12): `helper-erp/Directory.Build.props` 0.3.0, 판 번호가 박힌 시험 함께(찾기: `grep -rn "0\.2\.0" helper-erp/tests extension-erp/src`), README 두 곳 짝 문장
- 위험: 진료 중 DB에 찾기 질문이 몰릴 수 있다 → 2자 이상·0.4초 늦춤·설정 화면에서만. 이름 LIKE '%…%'는 표를 훑지만 39만 줄 한 번이 3초 안이라 받아들인다

## 11. 읽지 않을 처방 규칙 (REQ-3709, TASK-10·11·14)
- 바뀐 까닭(2026-11-13): 처음 명세는 '코드 하나가 있으면 그 진료를 줄에서 통째로 뺌'이었다(TASK-10이 이 모양으로 만듦). 사용자가 'LA357은 LA248과 같이 있으면 SONO이니 씨암에서 안 셈'을 원했고, 질문 답 "LA357만 빼기"(씨암 · SONO를 한 진료에서 같이 하면 진료 통째로 빼기는 씨암을 실제보다 적게 셈 — 11-12에도 CARM1+SONO1 진료 10건). 그래서 규칙 = '이 처방(code)은 같이 있을 처방(with)이 그 진료에 있으면 그 줄에서 없는 것으로 봄'. 진료를 통째로 빼려면 그 줄 코드(예: CARM1)를 '이 처방'으로 고르면 된다. 같은 날 더함(사용자 "조건을 여러개 걸수있게"·"모든 치료별에서", 질문 답 "규칙마다 고름"·"건수 세는 줄 모두"): 규칙마다 '빼는 때' = 하나라도 있으면(처음) / 모두 있을 때만(`all`), 넣는 줄 = 건수를 세는 묶음 모두(`injection`·`ptVisit` 빼고 17줄)
- 도우미(TASK-14, TASK-10이 만든 코드 하나 모양을 바꿈): `commands.json` `closing.day` groups 항목 `exclude`(선택) = 배열 0~20, 항목 `{ code: 코드 꼴, with: 배열 1~5 코드 꼴, all: bool(선택) }`(object·array·bool 꼴은 지금 표가 앎, `helper/` 고치지 않음). `ClosingDay`의 `Wanted`가 규칙 목록을 들고, 진료마다 그 묶음에서 쓸 처방 = 원래 처방 − {맞는 규칙의 code}(맞는 규칙: `all`이면 with가 모두, 아니면 하나라도 원래 처방에 있음. 같은 code 규칙이 여럿이면 하나라도 맞으면 뺌). 이 '그 묶음에서 쓸 처방'으로 ① 진료가 묶음에 드는지(묶음 코드가 하나라도 있음) → 사람이 묶음에 드는지·사람 수 ② 묶음 금액 — 매출 규칙이 없으면 그 묶음에 드는 진료들의 묶음 코드 금액 합(지금은 사람 합 `person.Amounts`라 진료 합으로 바꾸되 규칙이 없으면 같은 답), 매출 규칙이 있으면 지금처럼 `RuleAmount`(셀 코드 금액) ③ overlap(씨암 · SONO 두 묶음 모두에 드는 진료, 금액은 묶음마다 자기 '쓸 처방'으로)을 센다. with는 원래 처방으로 본다(다른 규칙으로 빠진 처방도 with로는 셈). 원 미만은 지금처럼 묶음 합에서 버린다. 주사1회환자(`injection`)·물리치료내원(`ptVisit`) 묶음은 exclude를 쓰지 않는다(확장도 보내지 않음). 규칙이 없거나 빈 묶음은 0.2.0과 같은 답(시험으로 확인)
- 확장 설정(TASK-11): `Settings.excludes?: Partial<Record<GroupKey, { code: string; with: string[]; all: boolean }[]>>`(타입 `ExcludeRule`, 저장값에 `all`이 없거나 참/거짓이 아니면 false). normalize: 모르는 key·`injection`·`ptVisit` 버림, code는 그 줄 `picks[key]`에 있거나(씨암 · SONO) 그 줄 `amounts[key].codes`에 있어야 함(없으면 그 규칙 버림), with는 코드 꼴만·겹침 버림·code와 같은 것 버림·5개까지, with가 비면 규칙 버림, code · with(차례 상관없이) · all이 모두 같은 규칙은 앞 것만(같은 code에 조건이 다른 규칙은 여럿 둠), 20개까지. `toGroups`는 규칙이 있는 묶음에만 `exclude: [{ code, with, all }]`를 붙인다. [처음 값으로]는 excludes를 비운다(`resetPicks`가 `excludes: {}`). 줄에서 코드를 빼면 그 줄을 다시 그릴 때 normalize로 그 규칙이 빠진다
- 설정 화면(TASK-11): 건수를 세는 줄(세 절의 17줄, 주사1회환자·물리치료내원 빼고)마다 그 줄 코드 줄(씨암 · SONO는 셀 코드 줄) 아래 `orow exc` 줄 `data-excludes={key}`. 글·배치는 승인 시안 `docs/mockups/erp-closing-range/exclude.html` 그대로(규칙 조각 `.rule`, 새 규칙 칸 `.tray`: '이 처방' `<select data-xcode>` · '같이 있을 처방' 조각 + 찾기 칸 `data-xfind` · '빼는 때' 라디오 둘 `data-xall`(name은 줄마다 따로) · [규칙 더하기] `data-xadd`, 아래 글 `.hint`/까닭 `.hint.err`). 새 규칙 칸에 담는 중인 것은 화면에만 두고 [저장]에 들어가지 않는다. 찾기는 REQ-3708 셀 코드 찾기 부품을 같이 쓴다(0.4초 늦춤 · 마지막 답 · 옛 도우미 안내 줄). 시안의 '새로' 꼬리표와 맨 위 검은 상태 줄은 시안에만 있다

## 12. 기간 길이 제한 없음 (AC-3701.2, TASK-13)
- 2026-11-13 사용자 "자동입력 기간 길게해" → 질문 답 "제한 없음". `rangeTypes.ts` `MAX_DAYS`와 `RANGE_TEXT.pick.tooLong`, `pickProblem`의 넷째 막는 줄, `main.ts` scan의 `span > MAX_DAYS`를 지운다. 막는 것은 빈 칸·시작일 > 끝일·끝일 > 오늘 셋
- 긴 기간(예: 2년 730일)도 살펴보기·채우기가 되고 날짜 목록은 지금처럼 `LIST_MAX`로 줄인다. 하루 약 15~20초라 1년이면 살펴보기 약 20분 + 채우기 1시간 30분~2시간 — 사용자에게 알림. README 기간 고르기 문장에서 '한 번에 92일(약 3달)까지'를 빼고 '오래 걸리니 [멈추기]·[이어서 하기]를 쓰라'로

## 13. 함께 있는 진료는 돈이 두 번 셀 때만 묻기 (REQ-3710, TASK-15)
- 까닭: 셀 코드만 세게 된 뒤(REQ-3707) 씨암·SONO 줄은 서로 다른 코드 금액을 세므로, 같은 진료에 둘이 있어도 돈이 두 번 들어가지 않는다. 2026-11-13 실제 11-13 함께 있는 진료 5건 = 씨암 쪽 LA358만 · SONO 쪽 LA247·KK090 — 겹친 금액 없음. 두 번 세는 것은 같은 코드를 양쪽 돈 코드에 넣었을 때뿐
- `settings.ts`에 순수 함수 `overlapNeedsAsk(settings): boolean` — 씨암 돈 코드(amounts.carm 셀 코드가 있으면 그것, 없으면 picks.carm)와 SONO 돈 코드(같은 식)가 하나라도 같으면(대문자·앞뒤 공백 뗀 값) true
- `main.ts` [비트 값 채우기]: `overlapNeedsAsk`가 false면 `askOverlap`을 부르지 않고 choice 없이 칸 계획(cells.ts는 choice 없으면 둘 다 넣은 값) · 끝 안내 결과에 overlap 줄을 넣지 않는다. true면 지금 그대로
- `main.ts` [기간 채우기]: false면 승인 안내로 넘기는 scan에서 함께 있는 진료 줄이 나오지 않게 하고(`overlapVisits` 0으로 보이게 또는 rangeView에 묻지 않음 표시 — 일꾼이 고르되 rangeView 글은 그대로), 채우기에는 choice 'both'를 넘겨 `overlapUnpicked`로 멈추지 않는다. 지난번 고른 것(`settings.overlap`)은 읽지도 저장하지도 않는다. true면 지금 그대로
- 새 글 없음. cells.ts·range.ts 셈은 바꾸지 않는다(필요하면 그 TASK 보고에 까닭)

## 14. 그날 실제로 두 번 센 돈이 있을 때만 묻기 (REQ-3711, TASK-16·17)
- 까닭: 사용자 설정은 LA272가 씨암·SONO 셀 코드 양쪽에 있어 13절 `overlapNeedsAsk`가 늘 true다. 그런데 11-12 함께 있는 진료 10건(씨암 LA358 / SONO LA247·C8140010·KK090·KK062)과 11-13 5건에는 LA272가 없어 실제로 두 번 센 돈이 0이다. 설정만 보고는 알 수 없고 그날 진료를 봐야 하므로 도우미가 센다(질문 답 "2번으로하자")
- 도우미(TASK-16): `ClosingOverlap`에 `Shared`(`[JsonPropertyName("shared")]`, long) 더함. `Overlap(visits, wanted)` 안에서 함께 있는 진료(`visit.Has(carm) && visit.Has(sono)`)마다 `visit.CodesFor(carm)` 가운데 `carm.Counts(code)`이고, 그 코드가 `visit.CodesFor(sono)`에도 있고 `sono.Counts(code)`인 줄의 `Amount`를 `ClosingRead.Add`로 더한다(코드마다 한 번). 다 더한 뒤 `ClosingRead.Won`. overlap이 null인 조건·visits·carm·sono 셈은 그대로. 새 SQL·매개변수·commands.json 바뀜 없음(답 모양은 commands.json에 적지 않음). 판 번호 0.3.0 그대로(install.ps1은 판과 상관없이 덮어 깜 — 확인함)
- 확장 타입(TASK-17): `types.ts` `ClosingDay.overlap?: { visits; carm; sono; shared?: number } | null`. `main.ts` `readDay`는 `shared`가 있으면(undefined가 아니면) 다른 숫자 칸과 같은 검사(0 이상 정수)를 하고 틀리면 null
- 묻는 조건 한 곳(TASK-17): `settings.ts`에 순수 함수 `overlapAsks(overlap: ClosingDay['overlap'], settings: Settings): boolean` = overlap이 있고 visits > 0이고, `typeof overlap.shared === 'number'`면 shared > 0, 아니면 `overlapNeedsAsk(settings)`. 13절 `overlapNeedsAsk`는 옛 도우미 길로 남긴다
- 하루(TASK-17): `main.ts` 함께 있는 진료 묻기의 조건 `day.overlap && day.overlap.visits > 0 && overlapNeedsAsk(settings)`를 `overlapAsks(day.overlap, settings)`로 바꾼다. 나머지(askOverlap·saveOverlap·끝 안내 overlap 줄은 물었을 때만)는 그대로
- 기간(TASK-17): `main.ts` `rangeDeps(r).askDay`가 도우미 답을 range.ts에 넘기기 전에 `overlapAsks`가 false인 날은 `overlap: null`로 바꿔 넘긴다(묻지 않는 날 = 함께 있는 진료 없음과 같게). 그러면 range.ts 살펴보기의 `overlapVisits`는 묻는 날의 visits만 더하고, 채우기의 'overlapUnpicked' 멈춤도 묻는 날에만 걸리며, planCells는 overlap이 없으니 둘 다 넣은 값이다 — range.ts·rangeView.ts·cells.ts 셈과 글은 바꾸지 않는다. `scanFlow`는 13절의 `overlapNeedsAsk` 갈래를 지우고 `scan.overlapVisits > 0`일 때만 `last: settings.overlap`을 넘긴다(0이면 last 없이). [덮어쓰고 저장 시작]은 `ask = scan.overlapVisits > 0`, `r.choice = ask ? (action.choice ?? settings.overlap) : undefined`, saveOverlap은 ask이고 새로 고른 것일 때만(지금 그대로). choice가 undefined인데 채울 때 묻는 날이 새로 생기면 range.ts가 지금처럼 'overlapUnpicked'로 멈춘다(AC-3711.3)
- 안내서(TASK-17): `extension-erp/README.md` 4-2 소절 함께 있는 진료 문장과 기간 승인 안내 문장(AC-3711.4). `readme.test.ts`의 AC-3710.3 문장 시험은 AC-3711.4 문장으로 바꾼다(기대값 바뀜 까닭: REQ-3711). 확장 manifest 0.3.0 그대로
- 위험: 옛 도우미(shared 없음)와 새 확장을 같이 쓰면 13절 그대로 묻는다(멈추거나 틀리지 않음). 새 도우미와 옛 확장(0.3.0 c 묶음)은 shared를 모르고 지금처럼 읽는다(readDay가 모르는 칸은 보지 않음 — 시험으로 확인)

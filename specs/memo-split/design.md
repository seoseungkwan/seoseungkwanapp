# 설계: 비트에 입력 — 환자별 두 칸 보기와 복사(완료)

## 개요
- 메모 칸(`MemoPanel`)의 '고르기' 단계 모양을 바꾼다: 위 도구 줄(요약 · [비트 메모 전체 불러오기] · [비트에 입력 (N명)] · 입력 방식 한 줄) + 두 칸(왼쪽 환자 목록 | 오른쪽 고른 환자 상세). 아래 메모 표는 없앤다
- 새 일은 하나: **복사(완료)**. 화면이 클립보드에 우리 메모를 넣고, 성공하면 Worker에 알려 그 진료를 완료로 둔다. 완료 저장 자리는 지금 달 칸의 `done`(도우미가 그 PC에 암호화해 둠) 그대로다. 도우미·확장·서버·DB는 바꾸지 않는다
- 묶음·차례·까닭·비교는 지금처럼 Worker의 `inputTargets`가 정한다. 화면은 그것을 목록 차례로 펼치고 고른 사람·보기·복사 상태만 쥔다

## 화면 목업
- `docs/mockups/memo-split/index.html`(시안 4). 실제 화면은 `ds.*`·토큰으로 같은 모양: 초록 단추는 `positive` 바탕, 고른 줄은 `accent-soft` 바탕 + 왼쪽 3px `accent-strong` 선, 확인 필요는 `warning`, 복사 실패는 `negative`. 작은 상태 표는 `ds.chip.*` 크기(글자 + 기호)
- 두 칸 높이: `lg` 이상에서 `h-[max(30rem,calc(100dvh-<위 머리 높이>))]` 고정, 각 칸 `overflow-y-auto` + `overscroll-contain`. `lg` 미만은 위아래(목록 `max-h-[40dvh]`)

## 구성 요소 / 인터페이스

### `src/types/precheck.ts`
```ts
/** 목록 한 줄. done은 완료(완료 표시·입력 기록 done, 또는 비트 메모가 우리 메모와 같음) */
export type TargetRow = TargetVisit & { …지금 칸; done: boolean }
export type PrecheckFromScreen = …지금 것
  | { type: 'memoCopied'; visitKey: string; text: string }   // 복사 성공한 글(AC-3104.1)
  | { type: 'memoUndone'; visitKey: string }                 // [완료 풀기](AC-3104.2)
```

### `src/lib/precheck/inputTargets.ts` (환자 자료 구역, 순수)
```ts
export type TargetContext = { …지금 칸; /** 자리를 지킬 사람: 완료여도 완료가 아닌 것처럼 묶음을 정하고 done만 켠다(AC-3104.4) */ keep?: ReadonlySet<string> }
```
- `reasonOf`: `done = context.done.has(key) || plan.done.length > 0`. `done && !keep.has(key)`이면 지금처럼 `'done'`. keep이면 완료를 빼고 나머지 까닭을 그대로 본다(비교 '같음'이어도 `skipped`가 비어 입력할 사람이 된다)
- 줄마다 `done`을 싣는다. 입력할 사람(`batch`)에는 keep인 완료 줄이 섞일 수 있다
- `replacing`·`MAX_BATCH`·0명 안내는 `batch`에서 `done`을 뺀 수로 센다. 0명 안내의 `open`도 `done` 줄을 뺀다(AC-3104.5)
- `chipsOf`는 그대로(`context.done`이면 뺀다)

### `src/workers/precheck/jobs.ts`
- 상태 `copiedNow: Set<string>`: 이 불러오기에서 복사로 **새로** 완료한 사람. `loadStart`에서 비운다
- `memoScreenView`: `inputTargets(…, { …, keep: copiedNow })`. 입력 묶음 만들기(`buildInputBatch`)는 keep 없이 부르고 `!row.done`만 싣는다(겹으로 지킴)
- `memoCopied`: 진료가 있고, `currentViews()`의 그 글 === `m.text`, `hasMemo`·빈 메모 아님·`unfinished` 거짓, `finishedKeys()`에 없을 때만:
  `work.done.add(key)` · `work.released.delete(key)` · `work.saved.set(key, work.saved.get(key) ?? text)` · `months.get(month).done.set(key, text)` · 남은 고친 글의 `release` 표시 지움(입력 '완료'와 같게) · `copiedNow.add(key)` · `viewsCache = null` · `markMonth` · `saveMonth`
- `memoUndone`: `finishedKeys().has(key)`이고 비교가 '같음'이 아닐 때만 `releaseDone(key, month)` · `copiedNow.delete(key)` · `markMonth` · `saveMonth`
- 날짜별 건수(`postDayCounts`)는 부르지 않는다(범위 밖)

### `src/components/claim/claimLoad.ts`
- `ClaimChannel.tell`이 받는 종류에 `'memoCopied' | 'memoUndone'`을 더한다

### `src/components/claim/rows/` (환자 줄 화면, props로만)
- `leftGroups.ts`: 지금 `MemoRows.tsx`의 `LEFT_GROUPS`를 옮기고(`StuckBand` import만 바꿈), 목록 차례 `LIST_ORDER = ['mark','diff','manual','held','unread','done','nomemo']`
- `MemoList.tsx`
  ```ts
  export type ListGroup = { id: 'batch' | LeftReason; name: string; rows: TargetRow[]; total: number }
  export type Show = 'all' | 'todo' | 'done'
  MemoList(props: { groups: ListGroup[]; counts: Record<Show, number>; show: Show; selectedKey: string | null; failed: ReadonlySet<string>; empty: string; onShow(show: Show): void; onPick(key: string): void })
  ```
  묶음 머리는 `sticky top-0`. 고른 줄이 바뀌면 `scrollIntoView({ block: 'nearest' })`. 상태 표는 `RowTags`(아래 상세 머리와 같이 씀)
- `MemoDetail.tsx`
  ```ts
  export type CopyStatus = 'editing' | 'failed' | 'failedAgain' | 'reopened' | 'mark' | 'none' | 'locked' | 'stuck' | 'copied' | 'done' | 'ready'
  MemoDetail(props: {
    row: TargetRow; group: ListGroup['id']; position: { index: number; total: number }; tableRow: MemoTableRow | undefined
    canPrev: boolean; canNext: boolean; onPrev(): void; onNext(): void
    status: CopyStatus; copying: boolean; failed: boolean; copyBlocked: boolean
    editing: boolean; locked: boolean; reading: boolean; startBlocked: boolean; showUnsaved: boolean; heldCount: number
    card: ReactNode
    onCopy(): void; onUndone(): void; onEdit(): void; onEditDone(text: string): void; onApprove(approved: boolean): void; onHeldRetry(): void
  })
  ```
  지금 `MemoRows.tsx`의 `Editor`·`ChartLines`·`RxRows`를 표 모양으로 고쳐 옮긴다(증상 표: 이름표 | 원문, 바탕색 없음, 시술 이름표 굵게. 처방 표: 종류·코드·처방명(짧은 이름)·총투여량·급여)
- 지운다: `MemoRows.tsx`·`MemoRows.test.tsx`·`MemoTable.tsx`·`MemoTable.test.tsx`

### `src/components/claim/memo/`
- `copyMemo.ts`: `copyText(text: string): Promise<boolean>` — `navigator.clipboard.writeText`, 안 되면 숨긴 `textarea` + `document.execCommand('copy')`, 그것도 안 되면 false. 오류 내용은 버린다(환자 글이 섞일 수 있음)
- `memoSplit.ts`(순수):
  ```ts
  /** targets → 목록 묶음(입력할 사람 먼저, 그다음 LIST_ORDER). 보기로 거르되 stayKey는 남긴다(AC-3101.6) */
  export function listGroups(targets: InputTargets, show: Show, stayKey: string | null): ListGroup[]
  export function showCounts(targets: InputTargets): Record<Show, number>
  /** 보이는 차례의 앞·뒤 사람. 없으면 null */
  export function neighbor(groups: ListGroup[], key: string, step: 1 | -1): string | null
  /** 고를 사람: 지금 사람이 있으면 그대로, 아니면 맨 위(AC-3101.8) */
  export function keepOrFirst(groups: ListGroup[], key: string | null): string | null
  export function copyStatus(input: { row: TargetRow; editing: boolean; failed: boolean; reopened: boolean; justCopied: boolean; locked: boolean; storeStuck: boolean }): CopyStatus
  export const canCopy = (row: TargetRow) => row.hasMemo && !isBlankMemo(row.text) && !row.unfinished
  ```
  `copyStatus` 차례: editing > locked > stuck > failed(완료면 failedAgain) > reopened > mark > none > copied(완료이고 방금) > done > ready
- `useSplitKeys.ts`: `document` keydown 하나. `enabled`(고르기 단계·알림 창 없음)일 때만. 글 칸·글자 칸(동그라미 제외)·select·Ctrl/Alt/⌘면 그냥 둔다. `ArrowUp/Down` → `onMove(±1)` + `preventDefault`. `event.code === 'KeyC' && !event.repeat` → `onCopy()` + `preventDefault`
- `InputMode.tsx`: 같은 이름·동작을 한 줄 모양으로(`flex flex-wrap`). `BitMemoButton` 자리는 도구 줄로 옮긴다(children 없앰). `defaultSelection(visible)` = `{ mode: 'date', kind: 'range', rangeFrom: visible.from, rangeTo: visible.to, … }`
- `MemoPanel.tsx`: 새 상태 `selectedKey`·`show`(처음 'all')·`stayKey`(미완료·완료 보기에서 고른 채 완료가 바뀐 사람)·`failed: Set`·`copying: string | null`·`justCopied: string | null`·`reopened: string | null`·`picked`(사람이 처음 골랐나, AC-3102.5). `open` 상태는 없앤다
  - 복사: `canCopy`·막힘 확인 → `copying = key` → `text = drafts.valueOf(key, row.text)` → `copyText(text)` → 성공: `failed`에서 빼고 `channel.tell({ type: 'memoCopied', visitKey: key, text })`, 그 사람이 아직 골라져 있으면 `justCopied = key`, `refresh()` / 실패: `failed`에 넣음. 끝에 `copying = null`
  - [완료 풀기]: `tell memoUndone` → `refresh()`
  - 고치기 끝(`onEditDone`): 글이 바뀌었고 그 줄이 완료였으면 `reopened = key`, `justCopied = null`. 고치기는 지금처럼 `drafts.change` + `flush`
  - 사람 바꾸기: `justCopied`·`reopened`·`editing`을 지우고 `selectedKey`를 바꾼다. 사람이 고른 첫 번째면 `bit.readOnce()`(입력 중이 아니면)
  - `focusKey`가 있으면 처음 `selectedKey = focusKey`, `editing = focusKey`
  - [먼저 고치기]: `selectedKey = editing = marks[0].key`
  - [비트에 입력 (N명)]: N = `batch.filter(r => !r.done).length`. `press()`·확인 표시 알림은 지금 그대로(수만 이 N)

## 데이터 흐름
```
[C · 복사(완료)] → copyText(우리 메모) ─성공→ tell memoCopied{key, text} → Worker: done 표시 + 달 칸 done=text + copiedNow → store.save(도우미, 그 PC)
                                    └실패→ failed에 넣음(화면만)                    └→ memoView 다시: 같은 묶음·차례, row.done = true
[완료 풀기] → tell memoUndone{key} → Worker: releaseDone(done=false) → store.save → memoView 다시
[↑↓·줄 누름] → selectedKey (화면만) → 상세 다시 그림
```
- 환자 글은 Worker ↔ 화면 메모리 ↔ 클립보드(그 PC)에만 있다. 서버·브라우저 저장소·로그로 가지 않는다

## 결정과 트레이드오프
- **완료 저장 자리**: 새 칸을 만들지 않고 자동 입력 '완료'와 같은 달 칸 `done`을 쓴다. 그래서 도우미 판을 올리지 않아도 되고, 다시 열어도 완료가 남으며, [비트에 입력]도 자동으로 뺀다. 대신 '복사로 완료'와 '자동 입력으로 완료'는 다시 불러온 뒤 구별되지 않는다(둘 다 '완료')
- **자리 지키기(keep)**: 복사한 사람이 곧바로 '이미 입력됨' 묶음으로 내려가면 ↓가 엉뚱한 사람으로 간다. 이 불러오기 안에서 새로 완료한 사람만 Worker가 기억해 같은 자리에 둔다. 새 [자료 불러오기] 뒤에는 지금 규칙대로 '이미 입력됨'으로 간다
- **메모 표 없앰**: 페이지 스크롤을 없애려는 목표와 맞춘다. 그 표의 고치기·상태는 오른쪽 상세가 한 사람씩 대신하고, 처음 방식을 날짜별 전체로 해 기간의 모든 환자가 왼쪽에 나오게 한다
- **복사 글**: 화면이 쥔 고치던 글(`drafts.valueOf`)을 복사하고 같은 글을 Worker에 보낸다. Worker는 메시지 차례대로 처리하므로 고친 글(`editMemo`)이 먼저 반영되고, 글이 다르면 완료하지 않는다(엉뚱한 글이 완료로 얼지 않게)
- **[완료 풀기]**는 완료 표시로 된 완료만 푼다. 비교 '같음'은 비트 메모가 이미 같아 풀어도 다시 완료라 단추를 두지 않는다
- 날짜 목록 숫자는 복사 순간에 다시 보내지 않는다: 건수는 서버로 가는 곁일이고 지금 규칙(불러오기·입력 끝)에서 반영된다

## 위험 / 미해결 질문
- 클립보드 쓰기는 사람이 누른 순간에만 된다(브라우저 규칙). C 키·단추 모두 사람 동작이라 된다. 실패하면 오류색으로 남겨 다시 누르게 한다
- 저장 답을 못 받은 채(저장 실패) 새 [자료 불러오기]를 하면 복사로 한 완료·풀기가 사라질 수 있다(고친 글만 다시 얹는 지금 규칙). 저장 실패 안내와 [다시 저장]이 보이므로 그대로 둔다
- 이미 입력됨 사람의 [완료 풀기]는 그 사람이 입력할 사람 묶음으로 옮겨진다(골라진 채 따라감). 드문 일이라 그대로 둔다
- 전역 키(↑↓·C)가 다른 칸과 부딪히지 않게 글 칸·알림 창·입력 중에는 쓰지 않는다(AC-3102.4)

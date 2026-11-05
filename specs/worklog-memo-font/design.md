# 설계: 업무일지 업무사항 글씨 크기

## 개요
- 업무일지 하루 줄(`worklog_days`)에 숫자 칸 `memo_font_pt` 하나를 더한다(새 migration). 크기는 칸 글자가 아니라 **그날의 설정 하나**라서 칸 목록(`WORKLOG_CELL_KEYS` 32칸·`WorklogDay`)에 넣지 않고, 비트 칸 목록(`bit_fields`, worklog design.md 20-4절)과 같은 길로 나른다: 읽기가 함께 읽고, 자동 저장이 "아는 값·최신 값"을 들고 **바뀌었을 때만** 보내며, 모르면 보내지 않는다
- 화면: 날짜 줄 아래 줄에 [가−] 숫자 [가+], 양식 업무사항 칸은 CSS 변수 `--memo-pt`로 크기를 바꾸고, 칸을 넘는지 재서 잘림 안내 한 줄을 띄운다
- 새 오류 번호는 없다(크기 저장 실패는 지금의 `E-WORKLOG-SAVE-FAILED` 카드와 [다시 저장]이 그대로 말한다)

## 코드로 확인한 것 (9b353e5)
- 업무사항 글씨는 `sheet.module.css`의 `.sheet .memo { font-size: var(--c11) }` 한 줄이다. `--c11`은 PC 15px, `@media (max-width: 767px)` 10px, `@media print` 11pt다. 칸 높이는 `calc(var(--h28) * 3)`, 줄 간격 1.35, 인쇄는 `overflow: hidden`이다
- 저장 길: `WorklogScreen` → `useWorklogDay`(날짜별 화면 값) → 화면 밖 한 벌 `worklogSession.worklogAutosave()` → `createAutosave`(`lib/worklog/autosave.ts`) → `saveWorklogDay`(`lib/storage/worklogDays.ts`). 비트 칸 목록은 이미 `save(ymd, changes, bitFields?)`·`serverDay(…, bitFields?)`·`AutosaveDay = { day, bitFields? }`로 "모르면 없음, 바뀌었을 때만 보냄"을 한다
- 비트 채우기(`applyBit` → `editBit`)와 칸 고치기(`setCell`)는 `useWorklogDay`의 날짜 칸(`Slot`)을 `{ status, day, bitFields }`로 새로 만든다 → 크기를 Slot에 더하면 이 두 곳이 크기를 **떨어뜨리지 않게** 해야 한다(AC-1508.5의 위험 자리)
- 날짜 줄(`WorklogToolbar`)은 `max-w-184.25`(737px) 화면 안에 한 줄: 왼쪽 [전날]·날짜(160px)·[다음 날]·[오늘로], 오른쪽 상태 글·[인쇄]. 단추는 `ds.button.secondary`(PC 36px, 768px 미만 44px). 툴바 전체가 `print:hidden`
- CSP `style-src`에 `'unsafe-inline'`이 있고(`src/lib/csp.ts`), 양식은 이미 `<col style={{ width }}>`로 인라인 스타일을 쓴다
- 규칙 시험: 양식 CSS Module을 부를 수 있는 소스는 `WorklogSheet.tsx` 하나다(`classes.test.ts`). 양식 CSS의 `var(--…)` 이름은 허용 목록 안이어야 한다(`sheet.style.test.ts` `SIZE_VARS`). 소스 tsconfig는 시험 파일도 타입 검사한다(`**/*.ts(x)`)
- migration 이름 `20261105000200`은 모든 갈래에서 비어 있다(`20261105000000` claim-guard, `…0100` stats_rx_groups)

## 구성 요소 / 인터페이스

### 규칙 (`src/types/worklog.ts` · `src/lib/worklog/memoFont.ts`, TASK-1)
```ts
// types/worklog.ts 에 더함
export const MEMO_FONT_PTS = [8, 9, 10, 11, 12, 14, 16] as const
export type MemoFontPt = (typeof MEMO_FONT_PTS)[number]
export const MEMO_FONT_DEFAULT: MemoFontPt = 11
/** 서버에서 읽은 하루. memoFontPt가 없으면 11로 본다 */
export type WorklogSavedDay = { day: WorklogDay; bitFields: WorklogNumberKey[]; memoFontPt?: MemoFontPt }

// lib/worklog/memoFont.ts (순수 함수)
export function toMemoFontPt(value: unknown): MemoFontPt          // 목록 안 숫자만 그대로, 아니면 11
export function stepMemoFont(pt: MemoFontPt, step: -1 | 1): MemoFontPt  // 목록에서 한 칸 옆, 끝이면 그대로
export function canStepMemoFont(pt: MemoFontPt, step: -1 | 1): boolean
```
- `memoFontPt`를 선택 칸으로 둔 까닭: 읽기는 늘 채우지만, 지금 시험 mock(`{ day, bitFields: [] }`)이 고치지 않고 타입 검사를 지나고 뜻도 "크기 칸이 없는 옛 줄 = 11"과 같다 **(Claude 판단)**

### DB: `supabase/migrations/20261105000200_worklog_memo_font.sql` (TASK-2)
```sql
-- 업무일지 업무사항 글씨 크기(memo_font_pt): 그날 업무사항 칸 글씨 pt (worklog-memo-font REQ-1502)
-- 실행: 운영자가 Supabase SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 0100(업무일지)·0110(비트 칸 표시)이 먼저 들어가 있어야 한다.
-- 관문: 새 화면부터 읽기가 이 칸을 고른다. 이 파일을 붙여 넣기 전에는 새 화면을 사이트에 올리지 않는다
-- (붙여 넣는 것은 지금 사이트에 해가 없다: 옛 화면은 이 칸을 읽지도 보내지도 않고, 새 줄은 11이 된다)
-- 칸 하나와 그 칸의 넣기·고치기 권한만 더한다. 정책(my_hospital_id())·다른 칸·공용 함수는 그대로다.
-- 이미 있던 줄은 11이 된다. 칸이 이미 있으면 건너뛰므로 두 번 붙여 넣어도 그대로다
alter table public.worklog_days add column if not exists memo_font_pt smallint not null default 11
  check (memo_font_pt in (8, 9, 10, 11, 12, 14, 16));

-- 읽기는 표 권한(select)에 이미 들어 있다. upsert가 보낸 칸을 모두 SET에 쓰니 넣기·고치기 둘 다 준다
grant insert (memo_font_pt), update (memo_font_pt) on table public.worklog_days to authenticated;
```
- 0110과 같은 모양이다(칸 하나 + 칸 권한, `if not exists`). 정책은 줄 단위(`hospital_id = my_hospital_id()`)라 새 칸에도 그대로 걸린다
- 목록은 DB 제약이 지킨다(CLAUDE.md '같은 효과면 DB 제약'). 앱 목록 `MEMO_FONT_PTS`와 같은지는 RLS 시험이 `@/types/worklog`를 읽어 일곱 값은 되고 그 옆 값은 안 되는 것으로 본다(AC-1502.3)
- 시험: `supabase/worklog.rls.test.ts` 끝에 새 묶음(0110 묶음과 같은 방식). PGlite: Supabase 흉내 → auth → 0100 → 0110 → 시험 줄 하나 → 실행 전 모양 → 0200 → 실행 뒤 모양. 실행 전·뒤 견주기는 0110 묶음의 `schemaSnapshot`을 쓰되 `memo_font_pt` 칸·그 제약을 빼고 보게 거르는 칸 이름을 인자로 받게 한다(0110 묶음의 기대는 그대로). 위의 0100·0110 묶음은 고치지 않는다
- **실제 Supabase에 붙여 넣지 않는다**(사용자 단계, '사용자가 할 일')

### 하루 읽기·저장 (`src/lib/storage/worklogDays.ts`, TASK-3)
```ts
export async function loadWorklogDay(client, ymd): Promise<WorklogSavedDay | null>   // memoFontPt 늘 채움
export async function saveWorklogDay(
  client, ymd, changes: WorklogChanges,
  bitFields?: readonly WorklogNumberKey[],
  memoFontPt?: MemoFontPt,
): Promise<void>
```
- 읽기: `SELECT` = 값 32칸 + `bit_fields` + `memo_font_pt`. `memoFontPt = toMemoFontPt(data.memo_font_pt)`(목록 밖·null·칸 없음 → 11)
- 저장: `memoFontPt`가 `undefined`면 `memo_font_pt` 칸을 넣지 않는다. 목록 안이면 `memo_font_pt: pt`(숫자). 목록 밖(타입을 넘어 온 값)이면 넣지 않는다(마지막 문, 비트 목록의 `pickBitFields`와 같은 뜻). 보낼 칸이 하나도 없으면 지금처럼 네트워크 없음
- 셋째 인자가 `undefined`이고 다섯째만 있어도 된다(`Array.isArray(bitFields)` 검사는 그대로라 `bit_fields`가 가지 않는다)

### 자동 저장 (`src/lib/worklog/autosave.ts`, TASK-4)
```ts
export type AutosaveOptions = {
  save: (ymd: string, changes: WorklogChanges, bitFields?: readonly WorklogNumberKey[], memoFontPt?: MemoFontPt) => Promise<void>
  // 나머지 그대로
}
export type AutosaveDay = { day: WorklogDay; bitFields?: WorklogNumberKey[]; memoFontPt?: MemoFontPt }
// createAutosave(...) 가 돌려주는 것에 더함
changeMemoFont(ymd: string, pt: MemoFontPt): void
serverDay(ymd, server, focusKey?, bitFields?, memoFontPt?: MemoFontPt): AutosaveDay   // 다섯째 인자 더함
```
- 날짜 칸(`DayEntry`)에 `knownFont`·`latestFont`·`sendingFont`(`MemoFontPt | null`, null = 모름)를 더한다. 비트 목록(`knownBits`·`latestBits`·`sendingBits`)과 같은 규칙이다
  - 보낼 크기 `fontToSend(entry)`: 최신 크기를 알고 아는 크기와 다를 때만(아는 크기를 모르면 늘 다름). 아니면 null
  - `send`: 보낼 칸·목록·크기가 모두 없으면 지금처럼 끝(blocked·settled). 크기가 null이면 **지금과 똑같이** `save(ymd, changes)` 또는 `save(ymd, changes, bits)`로 부른다(인자 수가 늘지 않는다, AC-1504.2). 크기가 있으면 `save(ymd, changes, bits ?? undefined, font)`
  - `succeeded`: 보낸 크기를 `knownFont`로. `failed`: 그대로(다음 시도가 다시 구한다)
  - `changeMemoFont`: `change`와 같은 타이머 규칙(저장 중이 아니면 pending + 800ms). 날짜 칸이 없으면 빈 하루·모르는 목록·모르는 크기로 만들고 `latestFont`만 정한다(그 날 칸 값은 건드리지 않는다)
  - `serverDay`: 다섯째 인자가 있고, 보내는 중인 크기가 없고, `fontToSend`가 null이면 `knownFont = latestFont = 받은 크기`. 새 날짜 칸이면 받은 크기로 만든다
  - `dayOf`: `latestFont`를 알면 `memoFontPt`를 넣는다(모르면 칸이 없다 → 지금 시험의 `toEqual({ day })`가 그대로)
  - `change(ymd, day, bitFields?)`는 크기를 건드리지 않는다(칸 고치기·비트 채우기 → AC-1504.2·AC-1508.5)
- 칸을 넣지 않고 `changeMemoFont`를 따로 둔 까닭: 크기는 칸 글자가 아니라(`cellSaveText`·막는 모양 검사가 없다) 칸 차이 계산(`splitDifference`)과 섞지 않는다. 화면은 단추를 누를 때만 이것을 부른다 **(Claude 판단)**

### 자동 저장 한 벌 (`src/components/worklog/worklogSession.ts`, TASK-7)
```ts
save: (ymd, changes, bitFields, memoFontPt) =>
  memoFontPt !== undefined
    ? saveWorklogDay(supabaseBrowser(), ymd, changes, bitFields, memoFontPt)
    : bitFields === undefined
      ? saveWorklogDay(supabaseBrowser(), ymd, changes)
      : saveWorklogDay(supabaseBrowser(), ymd, changes, bitFields)
```

### 양식 (`src/components/worklog/WorklogSheet.tsx` · `sheet.module.css`, TASK-5)
```ts
export type WorklogSheetProps = {
  // 지금 칸 그대로 +
  memoFontPt?: MemoFontPt                       // 없으면 11
  onMemoOverflow?(overflows: boolean): void     // 업무사항 글이 칸을 넘는지 바뀔 때만
}
```
- 업무사항 `td`에 `style={{ '--memo-pt': pt } as CSSProperties}`(숫자 그대로, 단위 없음). CSS `.sheet .memo { font-size: calc(var(--c11) * var(--memo-pt, 11) / 11); }`. 폰·인쇄 블록은 `--c11`만 바꾸므로 고치지 않는다. 시안의 `--pt`·`--memo` 두 변수 대신 `--memo-pt` 하나로 한다(이름이 양식 다른 변수와 부딪히지 않게)
- 인라인 변수로 한 까닭: 크기마다 클래스 일곱 개를 두는 것보다 한 줄이고 시안과 같은 계산이다. CSP가 이미 허용하고 양식이 같은 방식(`col` 폭)을 쓴다 **(Claude 판단)**
- 잘림 재기(`MemoCell` 안): textarea `ref`로 `scrollHeight > clientHeight + 1`(반올림 1px 여유, 시안 그대로). `useLayoutEffect`가 `day.memo`·`memoFontPt`가 바뀐 뒤 재고, `resize`(window)와 `document.fonts?.ready`에도 잰다. 마지막으로 알린 값과 다를 때만 `onMemoOverflow`를 부른다. 읽기 전용이어도 잰다(보일지는 툴바가 정한다)
- 잴 상자는 화면의 업무사항 칸이다(시안 그대로). PC 보통 창의 칸(84px 높이·15px 글씨)과 인쇄 칸(63pt·11pt)은 비율이 거의 같다('위험'의 좁은 창)
- 시험: jsdom은 크기를 재지 않으므로 시험이 textarea의 `scrollHeight`·`clientHeight`를 `Object.defineProperty`로 정한다. CSS 시험(`sheet.print.test.ts`·`sheet.style.test.ts`)은 파일 글을 읽어 본다

### 날짜 줄 (`src/components/worklog/WorklogToolbar.tsx`, TASK-6)
```ts
export type MemoFontControl = { pt: MemoFontPt; disabled: boolean; overflow: boolean; onStep(step: -1 | 1): void }
// props 에 더함
memoFont?: MemoFontControl | null   // 없음 = 터치 기기(묶음·안내 없음)
```
- 그림(PC):
```
[‹ 전날] [2026-11-05] [다음 날 ›] [오늘로]            저장했어요 · 14:05  [인쇄]   ← 지금 그대로
                                        업무사항 글씨 [가−] 11 [가+]          ← 새 줄, 오른쪽 끝
⚠ 업무사항 글이 칸보다 길어서 인쇄하면 아랫부분이 잘려요. 글씨를 줄이면 다 들어갈 수 있어요.   ← 넘칠 때만
(오류 카드: 저장 실패·불러오기 실패·막힌 칸 — 지금 그대로)
```
- 768px 미만(좁은 PC 창): 지금 두 줄(날짜 / 상태·[인쇄]) 아래 셋째 줄 오른쪽 끝. 단추·숫자 칸 44px
- 글씨 묶음: `role="group"` `aria-label="업무사항 글씨 크기"`. 글자 "업무사항 글씨"(`text-small text-ink-2`), [가−]·[가+]는 `ds.button.secondary` + 정사각형(`w-9 px-0`, 768px 미만 `max-md:w-11`), 보이는 글자 "가" + 작은 "−"/"+", 이름은 `aria-label`. 숫자는 `<output aria-live="polite">`(단추와 같은 높이, 1px `line-strong` 선, 가운데). 끝 단추 `disabled`는 `canStepMemoFont`로 정한다
- 잘림 안내: `<p>` 한 줄, `Icon name="alert"`(`text-negative`, `mt-0.5 shrink-0`) + 글(`text-small text-ink-2`). BitNotice 줄과 같은 모양이다. 오류 카드가 아니다
- 공용 아이콘 `alert`(`Icon.tsx` `ICON_NAMES` 끝): `<circle cx="8" cy="8" r="6" />` + `<path d="M8 4.67v3.66" />` + `<path d="M8 11h.01" />`(시안 `ICON_WARN`을 `info`의 원 크기에 맞춤)

### 화면 잇기 (`useWorklogDay.ts` · `WorklogScreen.tsx`, TASK-7)
- `useWorklogDay`: `Slot`에 `memoFontPt?: MemoFontPt`. **Slot을 새로 만드는 모든 곳이 크기를 이어 간다**: `slotOf`(읽기·`pendingDay`), `setCell`, `editBit`. 읽기의 `fromServer`는 `serverDay(…, 목록, saved === null ? 11 : saved.memoFontPt ?? 11)`로 크기를 넘긴다
  - 새 함수 `setMemoFont(pt): boolean` — 그날이 `ready`일 때만 Slot 크기를 바꾸고 참
  - 돌려주는 값에 `memoFontPt: MemoFontPt`(Slot에 없으면 11)
- `WorklogScreen`:
```ts
const [memoOverflow, setMemoOverflow] = useState(false)
function onMemoFont(step: -1 | 1) {
  if (readOnly) return
  const next = stepMemoFont(memoFontPt, step)
  if (next === memoFontPt || !setMemoFont(next)) return
  autosave.changeMemoFont(ymd, next)
}
// <WorklogToolbar memoFont={viewOnly ? null : { pt: memoFontPt, disabled: readOnly, overflow: memoOverflow, onStep: onMemoFont }} … />
// <WorklogSheet memoFontPt={memoFontPt} onMemoOverflow={setMemoOverflow} … />
```
- 비트 채우기(`applyBit`)·칸 고치기(`onCell`)는 지금처럼 `autosave.change(ymd, day, bitFields)`만 부른다(크기를 넘기지 않는다)

## 데이터 흐름
```
[가+] → WorklogScreen.onMemoFont → useWorklogDay.setMemoFont(12)(화면 바로 바뀜)
      → autosave.changeMemoFont(그날, 12) → 800ms → save(그날, {}, undefined, 12)
      → worklogSession → saveWorklogDay(client, 그날, {}, undefined, 12)
      → upsert { work_date, memo_font_pt: 12 }  (RLS·DB 제약·기본 hospital_id)
읽기(처음·60초·다시 보일 때) → loadWorklogDay → { day, bitFields, memoFontPt }
      → serverDay(…, memoFontPt) (저장 안 된 크기는 그대로) → Slot → 양식 --memo-pt · 툴바 숫자
양식 → onMemoOverflow(넘음) → WorklogScreen 상태 → 툴바 잘림 안내(PC, 읽기가 끝난 날만)
```
- 서버로 가는 것은 그날 크기 숫자 하나가 더해질 뿐이다. 환자 자료·AI 경로와 상관없다(`worklog_days`는 AI 경로가 읽지 않는다, worklog AC-005.5 그대로)

## 결정과 트레이드오프
- **칸 목록에 넣지 않는다**: `WORKLOG_CELL_KEYS`에 넣으면 칸 32개를 못 박은 시험(worklog AC-004.1·양식·막는 모양·칸 글자 읽기)이 모두 흔들리고, 숫자 하나에 글자 칸 규칙(`cellSaveText`·막는 모양)이 걸린다. 비트 목록이 이미 쓰는 "따로 나르는 그날 값" 길을 쓴다
- **바뀌었을 때만 보낸다**: 크기를 늘 보내면 다른 칸을 고칠 때마다 다른 PC가 고른 크기를 이 PC가 아는 옛 크기로 덮는다. 비트 목록과 같은 이유다
- **크기만 바꾼 빈 날도 줄이 생긴다**: 아무것도 적지 않은 날에 크기만 바꾸면 `work_date` + `memo_font_pt`만 든 줄이 생긴다. 보이는 것은 같다(빈 양식). 지금도 칸 하나만 적으면 줄이 생기므로 같은 규칙이다 **(Claude 판단)**
- **800ms 묶음**: 시안은 "누르자마자 저장"이라 했지만 다른 칸도 800ms 묶는다. 여러 번 누르면 마지막 크기만 한 번 간다. 상태 글은 누르자마자 "저장하는 중이에요"가 된다
- **잘림 재기는 화면 칸으로**: 인쇄 칸을 따로 흉내 낸 숨은 상자로 재면 좁은 창에서도 맞지만 코드가 늘고 시안과 다르다. 의원 PC는 보통 넓은 창이라 시안 방식으로 한다

## 시안과 다른 곳 (까닭은 실제 화면. 보고에 적는다)
| 시안 | 실제 | 까닭 |
|---|---|---|
| 글씨 묶음이 날짜 줄 오른쪽(상태 글 앞) 한 줄 안 | 날짜 줄 **바로 아래 줄 오른쪽 끝**(업무사항 칸 위쪽) | 실제 날짜 줄에는 시안에 없는 [오늘로]·[인쇄]가 있어 737px 한 줄에 다 들어가지 않는다(날짜 묶음 약 360~440px + 상태 글·[인쇄] 약 180px + 글씨 묶음 약 210px). 지금 날짜 줄은 그대로 둔다 |
| 날짜 줄에 [오늘로]·[인쇄] 없음 | 있음(지금 그대로) | 시안이 줄여 그렸다 |
| 잘림 안내가 날짜 줄 바로 아래 | 글씨 줄 바로 아래(오류 카드·비트 안내 줄보다 위) | 단추와 안내를 붙여 둔다. 비트 안내 줄은 시안에 없었다 |
| 경고 그림이 시안 안 SVG | 공용 아이콘에 `alert`로 더함(원 크기는 `info`와 같게) | 아이콘은 `Icon.tsx` 한 곳(UI_GUIDE) |
| 누르면 0.7초 뒤 "저장했어요"(흉내) | 다른 칸과 같은 0.8초 묶음 뒤 저장 | 자동 저장 한 벌 |
| 시안 글꼴(IBM Plex Sans KR·Nanum Gothic) | 앱 Pretendard·양식 굴림 | UI_GUIDE·worklog 그대로 |
| CSS 변수 `--pt`·`--memo` | `--memo-pt` 하나 | 계산은 같다 |

## 시안이 말하지 않아 정한 것
- 불러오는 중·불러오기 실패인 날: 두 단추가 눌리지 않고(숫자는 보임) 잘림 안내가 없다
- 저장된 크기가 없거나(SQL 전 줄은 붙인 뒤 11이 됨) 목록 밖이면 11
- 좁은 PC 창(768px 미만, 마우스): 글씨 줄이 셋째 줄이 되고 단추·숫자 칸이 44px
- 크기만 바꾼 빈 날도 줄이 생긴다(위 '결정')
- 화면 읽기 프로그램: 묶음 이름 "업무사항 글씨 크기", 단추 이름 "업무사항 글씨 작게/크게", 숫자는 바뀌면 읽어 준다(`aria-live="polite"`)

## 다른 기능에 미치는 것
- **업무일지 비트 채우기**: 동작 그대로. 비트 채우기 저장에 크기가 실리지 않는다(AC-1508.5)
- **업무일지 인쇄**: 업무사항 칸 글씨만 고른 크기. 나머지 그대로
- **E2E `e2e/worklog-bit.spec.ts`**: 고치지 않는다(새 칸은 기본값 11이라 읽은 줄 비교에 영향 없음. 실제 DB에 0200을 붙인 뒤 돌린다)
- **AI 리포트·대시보드**: `worklog_days`를 읽지 않는다

## 기존 명세·시험과의 관계
- **승인된 `specs/worklog`는 고치지 않는다.** 이 명세가 덧붙인다
- worklog AC-011.1의 "업무사항 11pt"는 기본 크기(11)일 때다. 다른 크기는 이 명세 AC-1505.2가 대신한다. 시험 `sheet.print.test.ts:106`(`.sheet .memo`의 `font-size`가 `var(--c11)`)을 calc 기대로 고친다(TASK-5)
- worklog AC-005.1·AC-016.1의 읽는 칸 목록에 `memo_font_pt`가, 읽은 모양에 `memoFontPt: 11`이 더해진다(AC-1503.1). 시험 `worklogDays.test.ts`의 `SELECT` 상수(:26)·칸 차례 기대(:164)·읽은 모양 기대(:173·:195·:201·:571·:577)를 고친다(TASK-3)
- worklog AC-010.13·AC-017.7 시험 `useWorklogDay.test.tsx:388`(`serverDay(DAY, server, 'cardIn', ['cashIn'])`)에 다섯째 인자 `11`이 더해진다(TASK-7)
- 양식 CSS 허용 변수 목록 `sheet.style.test.ts:25`(`SIZE_VARS`)에 `--memo-pt`를 더한다(TASK-5). 공용 아이콘 수·이름 시험(`Icon.test.tsx`)은 22개·`alert`로 고친다(TASK-6, tab-frame·ui-90·worklog TASK-17이 아이콘을 더한 것과 같은 길)
- 숫자 칸 `output`은 그 자체로 `role="status"`라서, PC 화면에 글씨 묶음이 그려지면 `WorklogScreen.test.tsx:103`의 도움 함수 `statusText = () => screen.getByRole('status').textContent`가 둘을 찾아 던진다. 이 도움 함수만 **저장 상태 글 하나를 고르게** 바꾼다(예: `getAllByRole('status')`에서 `output`이 아닌 것). 이 함수를 쓰는 22곳의 기대 글은 그대로다(TASK-7, 2026-11-05 TASK-6 보고로 더함)
- 위 말고 다른 승인된 시험의 기대값이 바뀌어야 하면 멈추고 보고한다. 특히 `autosave.test.ts`의 인자 수 시험(:991·:1001)과 `worklogSession.test.ts:77`(인자 셋), `WorklogToolbar.test.tsx:265`(단추 수)는 **고치지 않은 채 통과해야 한다**(크기를 넘기지 않는 저장은 지금과 같다)

## 사용자가 할 일
1. **사이트에 올리기 전에** `supabase/migrations/20261105000200_worklog_memo_font.sql` 전체를 운영 Supabase SQL 편집기에 붙여 한 번 실행한다. 빠뜨리고 올리면 업무일지가 모든 날 "이 날 업무일지를 불러오지 못했어요"가 되어 고칠 수 없다. 먼저 붙여 넣는 것은 지금 사이트에 해가 없다
2. 사이트에 올리는 것은 사용자 말("배포해")로만 한다. 이 갈래는 지금 사이트(9b353e5)에서 시작했다
3. 올린 뒤 손 확인(지난 날짜 하나에 지어낸 글로): ① PC에서 [가+]·[가−] → 저장했어요 → 새로 고침해도 같은 크기 ② 다른 PC·휴대폰에서 그 날 같은 크기, 휴대폰에 단추 없음 ③ 글을 길게 → 잘림 안내 → 줄이면 사라짐 ④ 인쇄 미리보기에서 고른 크기, 단추·안내 없음 ⑤ 다음 날은 11 ⑥ 의원 PC에서 비트가 채운 뒤에도 크기 그대로 ⑦ 끝나면 그 날 글을 지우고 크기를 11로

## 위험 / 미해결 질문
- **SQL 관문**: 위 1번. 새 화면은 읽을 때 `memo_font_pt`를 고르므로 칸이 없는 DB에서는 모든 날 읽기가 실패한다. 비트 칸(0110) 때와 같은 관문으로 막는다(읽기를 두 번 시도하는 우회 코드는 두지 않는다)
- 좁은 PC 창(768px 미만)은 업무사항 칸 비율(66px 높이·10px 글씨)이 인쇄(63pt·11pt)와 달라 안내가 실제 인쇄와 한 줄쯤 어긋날 수 있다. 보통 창은 거의 같다. 마지막 확인은 인쇄 미리보기다
- 굴림이 없는 기기(맥·휴대폰)는 비슷한 고딕으로 보여 줄 바꿈이 조금 다르다(지금도 같다)
- 화면 확인(TASK-8)은 개발 서버·브라우저가 필요해 이 서버(2 CPU·7.8GB·스왑 없음)에 다른 일이 없을 때 돌린다

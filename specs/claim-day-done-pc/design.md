# 설계: 비트 PC 청구 화면에서 고른 기간의 날짜를 완료로 저장

## 개요
- `claim-day-done`이 만든 것(표 `claim_day_closes`, `src/lib/storage/claimDayCloses.ts`, `buildDateList`의 완료 표시 규칙)을 그대로 쓴다. 이 기능은 비트 PC 화면(`DateStep`·`ClaimScreen`)에 단추·알림·되돌리기를 더하고, 줄에 '바꾼 시각'을 싣는 것뿐이다

## 화면 목업
- `docs/mockups/claim-day-done-pc/index.html`의 **나**(2026-11-08 사용자가 고름). 실제 화면은 지금 `DateStep`의 부품·토큰(`ds.*`, `ErrorCard`)을 쓴다
  - 왼쪽 '진료한 날짜' 패널의 머리 줄 아래, 표 위에 고르기 줄(옅은 파랑): 글 + [고른 날 완료로 저장](`ds.button.primarySmall`). 저장 뒤 옅은 초록: '{N}일을 완료로 바꿨어요' + [되돌리기](`ds.textButton`)
  - 그 아래 실패 안내 `ErrorCard code="E-DAYCLOSE-FAILED"`
  - 완료 표시 줄: 안내 칸 '완료로 바꿈 · 시각', 새 마지막 칸에 [되돌리기](`ds.button.secondarySmall`). 머리 칸은 빈 칸(`aria-label="완료 되돌리기"`)
  - 오른쪽 기간 패널(`PeriodPanel`)은 그대로

## 구성 요소 / 인터페이스

### `src/components/claim/dateList.ts`
```ts
export type DateRow = { …지금 칸; /** 사람이 완료로 바꾼 시각(claim_day_closes.closed_at). 아니면 null */ closedAt: string | null }
export function buildDateList(days, counts, closed: ReadonlySet<string> | ReadonlyMap<string, string> = new Set()): DateRow[]
//   done 규칙은 그대로(closed.has). closedAt = closed가 Map이면 closed.get(date) ?? null, Set이면 null
export function listRange(today, counts, closed: ReadonlySet<string> | ReadonlyMap<string, string> = new Set())  // has만 쓴다
/** 고른 기간 안의 덜 끝난 날(AC-2901.1). 목록 차례 그대로 */
export function closablePeriodDates(rows: readonly DateRow[], period: DateRange): string[]
```
- 지금 시험은 Set을 넘겨 그대로 통과한다(closedAt 칸이 더해지는 `toEqual` 기대가 있으면 그 시험만 칸을 더한다 — AC-2903.2의 '기대값 그대로'는 화면 동작 기준이다)

### `src/components/claim/DateStep.tsx` (그리기만, 상태 없음)
```ts
export type CloseState = { saving: boolean; reopening: ReadonlySet<string>; justSaved: readonly string[]; failed: boolean; blocked: boolean }
DateStep props에 더함: close: CloseState; onCloseDates(dates: string[]): void; onReopen(dates: string[]): void
```
- 고르기 줄: `dates.kind === 'ready'`일 때. `justSaved.length > 0`이면 알림, 아니면 '고른 기간에서 아직 입력 안 된 날 {N}일' + 단추(N = `closablePeriodDates(rows, period).length`, `saving || blocked || N === 0`이면 막힘)
- `DayRow`: `row.closedAt`이면 안내 칸 글을 '완료로 바꿈 · {checkedAtText}', 끝 칸에 [되돌리기](`reopening.has || blocked`면 막힘). 표의 `colSpan`은 8로
- 체크 칸으로 기간이 바뀌면(onPeriod) 알림을 지우는 것은 ClaimScreen이 한다

### `src/components/claim/ClaimScreen.tsx` (상태·서버)
- 상태 `close: CloseState`(처음: 모두 비움). `blocked = busy`(불러오는 중·입력 확인·입력 중, 지금 `busy.current`와 같은 조건)
- `onCloseDates(dates)`: `saving` → `closeDays(supabaseBrowser(), dates)` → 성공: `justSaved = dates`, 목록 다시 읽기 / 실패: `failed = true`
- `onReopen(dates)`: `reopening`에 넣고 `reopenDays` → 성공: `justSaved`에서 그 날 빼기, 목록 다시 읽기 / 실패: `failed = true`
- 목록 다시 읽기: `refreshDates`와 같은 읽기(건수+완료 표시)를 쓰되, 저장 직후에는 `busy`가 아니면 바로 다시 묻는다. 실패하면 보던 목록을 둔다
- 완료 표시 읽기는 `readClosedDays` 답을 `Map(visit_date → closed_at)`으로 만들어 넘긴다(지금은 Set)
- 기간이 바뀌면(`setPeriod`) `justSaved`·`failed`를 비운다

## 데이터 흐름
```
[체크 칸] → period → closablePeriodDates(rows, period) → [고른 날 완료로 저장] → closeDays → claim_day_closes(POST, 날짜만)
                                                                                     └→ 다시 읽기: readDayCounts + readClosedDays → buildDateList(…, Map) → 줄 내려감·closedAt
[되돌리기] → reopenDays → claim_day_closes(DELETE in) → 다시 읽기
```

## 결정과 트레이드오프
- 체크 칸 하나가 '불러올 기간'과 '완료로 바꿀 날'을 함께 고른다(사용자가 고른 나). 기간은 35일 한도라 한 번에 많아야 35일이다
- 화면을 그 자리에서 고치지 않고 다시 읽는다: 비트 PC 목록은 도우미 진료 수(claim.dates)와 서버 건수를 합쳐 만들어서, 다시 읽는 것이 가장 단순하고 맞다(1초 안팎)
- 묻는 창 없이 바로 저장하고 알림의 [되돌리기]로 거둔다

## 위험 / 미해결 질문
- 다시 읽는 사이(1초 안팎) 줄이 아직 위에 있다. 단추가 '저장 중…'으로 막혀 두 번 누르지 못한다
- 불러오기·입력 중에는 막는다: 그때 목록을 새로 묻지 않는 지금 규칙과 맞춘다

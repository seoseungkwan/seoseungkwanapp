# 설계: 예약 탭 다듬기 — 색 20색 · 시작 시간 쳐서 넣기 · 같은 시간 하나 더

시안: `docs/mockups/calendar-colors/index.html` (①설정 색판 ②주 보기 칸 ③폰 목록 띠 ④시작 칸 ⑤오른쪽 빈 줄). SQL·도우미 새 판 없음.

## 1. 색 20색 (REQ-6001)

### 색 값 (UI_GUIDE '예약 색판' 표에 더함)
| 이름(CAL_COLORS) | 토큰 | 값 | 화면 이름 |
|---|---|---|---|
| red | `cal-red` | `#DC2626` | 빨강 |
| yellow | `cal-yellow` | `#CA8A04` | 노랑 |
| green | `cal-green` | `#22C55E` | 초록 |
| mint | `cal-mint` | `#2DD4BF` | 민트 |
| magenta | `cal-magenta` | `#D946EF` | 자주 |
| wine | `cal-wine` | `#9F1239` | 와인 |
| forest | `cal-forest` | `#166534` | 진초록 |
| lavender | `cal-lavender` | `#A78BFA` | 연보라 |
| coral | `cal-coral` | `#FB7185` | 산호 |
| black | `cal-black` | `#1F2937` | 검정 |

- 옛 10색 값은 그대로. 차례는 옛 아홉(파랑~갈색) → 새 열 → 회색(맨 끝). 회색은 지운 종류·시행자의 색(`CAL_FALLBACK`)이라 새 시행자 자동 색에서 가장 늦게 나오게 한다(설정 판 `[+ 시행자 더하기]`는 지금처럼 `CAL_COLORS.find(안 쓴 색)`).
- 고른 까닭: 20색 사이 가장 가까운 두 색의 색 차이(CIEDE2000)가 14.1로, 지금 10색 안의 가장 가까운 두 색(14.8)과 비슷하다.
- 저장은 jsonb 안 글자라 SQL이 필요 없다. 검사는 `lib/storage/calendar.ts`의 `isColor`가 `CAL_COLORS`를 보므로 코드는 그대로이고 시험만 더한다.

### 바꾸는 곳
- `src/types/calendar.ts`: `CAL_COLORS` 20개(위 차례). 주석 '10색' → '20색'.
- `src/components/calendar/colors.ts`: `CAL_TONES`·`CAL_COLOR_LABEL`에 새 10색(클래스 이름은 통째로 적는다 — Tailwind가 소스 글자에서 찾음).
- `src/components/calendar/CalendarSettings.tsx`: `COLOR_NAMES`에 새 10색, 주석 '10색' → '20색'. 색판 그리기는 `CAL_COLORS.map`이라 그대로.
- `src/components/calendar/CalendarToolbar.tsx`: `calVar` 주석의 '10색' → '20색'만.
- `src/app/globals.css`: `:root`에 `--cal-{새 색}`과 `--cal-{새 색}-soft: color-mix(in srgb, var(--cal-{색}) 13%, var(--surface))`, `@theme inline`에 `--color-cal-{새 색}`·`--color-cal-{새 색}-soft`.
- `docs/UI_GUIDE.md` '예약 색판' 표: 20줄(위 차례).
- 시험: `colors.test.ts`·`src/app/theme.test.ts`(CAL_COLOR_TOKENS 20개, 없는 이름 예를 `bg-cal-red` → `bg-cal-gold`)·`CalendarSettings.test.tsx`(색판 20개·새 색 저장·자동 색)·`src/lib/storage/calendar.test.ts`(새 색 검사·저장·읽기).

## 2. 시작 시간 쳐서 넣기 (REQ-6002)

### 시간 읽기 `parseStart(text: string, openHour: number, closeHour: number): number | 'format' | 'step'` (`lib/calendar/rules.ts`, 순수)
1. 앞뒤 빈칸을 뺀다. 빈 글 → `'format'`.
2. 모양(앞에서부터 처음 맞는 것):
   - 숫자 3~4개(`930`, `1430`) → 시 = 끝 두 자리 앞, 분 = 끝 두 자리
   - 숫자 1~2개 + 가름(`:`·`시`·`.`·빈칸) + 숫자 1~2개 + `분`(있어도 됨) (`14:30`, `9:30`, `14시30분`, `14 30`) → 시, 분
   - 숫자 1~2개 + `시`(있어도 됨) (`14`, `14시`) → 시, 분 0
   - 그 밖 → `'format'`
3. 시 0~23, 분 0~59가 아니면 `'format'`. 분이 10의 배수가 아니면 `'step'`.
4. 분 = 시×60 + 분. **오후로 보기:** 시가 12 미만이고, 분이 보이는 시작(openHour×60)보다 앞이고, 분+720이 보이는 끝(closeHour×60)보다 앞이면 분+720. (진료 전 새벽은 쓸 일이 없어 '230'은 14:30으로 본다)
5. 돌려주는 값은 0~1430(서버 `start_min` 검사와 같음).

| 글 (보이는 시간 9~19시) | 결과 |
|---|---|
| `1430` · `14:30` · `14시30분` · `14 30` | 870 |
| `930` · `9:30` | 570 |
| `14` · `14시` | 840 |
| `230` | 870 |
| `830` | 510 (20:30은 보이는 시간 밖이라 그대로) |
| `1435` | `'step'` |
| `25시` · `1460` · `abc` · `` | `'format'` |

### 판 (`components/calendar/AddPanel.tsx`)
- '시작' `<select>` → `<input id="{ids}-start" type="text" inputMode="numeric" autoComplete="off" placeholder="예: 1430" list="{ids}-starts">` + `<datalist id="{ids}-starts">`(보이는 시간 안 10분 칸 `HH:MM`, 지금 시각이 칸 밖이면 그 값도 — 지금 `starts` 셈 그대로).
- 판 안 상태 `startText`(처음 `hm(draft.start)`)와 `startTouched`(blur 뒤 true).
  - 바꿀 때: `startText` 갱신, `parseStart`가 숫자면 `onDraft({ ...draft, start })`(지금 `set({ start })`와 같은 길).
  - blur: 숫자로 읽히면 `startText = hm(그 값)`, `startTouched = true`.
  - 판 밖에서 `draft.start`가 바뀌어 `parseStart(startText)`와 다르면 `startText = hm(draft.start)`, 오류 지움(AC-6002.4).
- 못 읽는 동안: `missing` 맨 앞에 '시작'을 넣어 저장 줄·[저장] 막힘을 지금 규칙대로. 오류 글은 `startTouched`일 때만, 칸 아래 `HINT` 자리에 `text-negative`(lib/errors가 아닌 칸 안내 글 — 지금 판 안내 글과 같은 자리), 칸 `aria-invalid`·`aria-describedby`.
  - 오류 글: `'format'` → '시간을 14:30처럼 적어 주세요', `'step'` → '10분 단위로 적어 주세요 (예: 14:30)'.
- 안내 글 '10분 단위' → '1430처럼 쳐도 돼요 · 10분 단위'.
- 시험: `AddPanel.test.tsx`(칸 모양·쳐서 넣기·오류·바깥 바뀜), `CalendarScreen.test.tsx`(select 값 '650' 등을 글 `10:50`으로, change 값 '580' → '0940' 등). `rules.test.ts`(표).

## 3. 같은 시간 하나 더 (REQ-6003)

### 칸 놓기 (`components/calendar/rows/ApptBlock.tsx`)
- `export const BLOCK_GUTTER_PX = 20`. `placeStyle`:
  ```ts
  const part = (n: number) => (n / place.cols).toFixed(4)
  left: `calc((100% - ${BLOCK_GUTTER_PX}px) * ${part(place.col)} + 1px)`
  width: `calc((100% - ${BLOCK_GUTTER_PX}px) * ${part(place.span)} - 2px)`
  ```
  예약 칸·비트 예약 칸(`GhostBlock`이 같은 `placeStyle`을 씀) 모두 따른다. 일·주 보기 같은 값.

### 누름과 미리 보기 (`components/calendar/rows/TimeGrid.tsx`)
- 누름은 그대로: 날 칸 `onClick`에서 예약 칸(`[data-block]`) 밖이면 `onSlot(day, slotAt(e))`. 칸이 줄어 오른쪽 줄이 늘 '밖'이 된다(AC-6003.2).
- 미리 보기: `hover` 상태에 `edge: boolean`(= `e.clientX >= rect.right - BLOCK_GUTTER_PX`). edge면 오른쪽 줄 안에만 글 없는 점선 칸(`data-hover="edge"`, `right-0.5 w-4`, 높이 10분 칸 = `SLOT_PX - 2`), 아니면 지금 '+ HH:MM' 칸(`data-hover="full"`). 둘 다 `pointer-events-none`·`aria-hidden`·`max-md:hidden`.
- 시험: `TimeGrid.test.tsx` — 칸 style 글자(1칸·2칸 나란히), 오른쪽 줄 누름 → onSlot, 칸 누름 → onAppt만, edge/full 미리 보기(getBoundingClientRect를 시험에서 정함).

## 위험
- 되돌리기: 새 색으로 설정을 저장한 뒤 옛 판(dbfd17b)으로 되돌리면 옛 검사가 그 줄을 못 읽어 종류는 처음 값, 시행자는 빈 목록으로 보인다(서버 값은 남음, 새 판으로 오면 그대로). 되돌릴 일이 있으면 새 색을 먼저 옛 색으로 바꾼다.
- 대비: 옅은 바탕 위 `muted` 글(길이 '30분')은 지금 10색도 3.8~4.2:1로 4.5가 안 된다(UI_GUIDE 글과 다름). 새 색도 3.8~4.4로 같은 범위 — 이번 범위 밖, 따로 고칠 일로 남긴다. 진한 색 표시(색판 네모·띠) 가운데 민트(1.9:1)·초록(2.3:1)은 흰 바탕과 대비가 낮지만 네모에 1px 테두리가 있고 이름(aria-label·title)과 칸 글 (표시)가 함께 알려 준다.
- 좁은 칸: 20px를 비우면 주 보기 칸 글이 조금 더 잘린다(전체 글은 마우스 올림·화면 읽기, 지금 규칙 그대로).
- 치는 중 읽힘: '1'을 치면 13:00으로 잠깐 읽혀 '새 예약' 칸이 움직인다 — 다 치면 맞는 자리로 간다(저장은 [저장]에서만).

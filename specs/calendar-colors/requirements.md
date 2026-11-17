# 요구사항: 예약 탭 다듬기 — 색 20색 · 시작 시간 쳐서 넣기 · 같은 시간 하나 더

> 기능 ID: `calendar-colors` · 형식: 요구사항은 `### REQ-001: 제목`, 수용 기준은 `- AC-001.1: Given/When/Then`.
> 각 AC 는 테스트 하나 이상으로 검증되어야 하며, 테스트 이름에 AC ID 를 넣는다.

## 배경 / 목표
사용자 요청(2026-11-17, 예약 탭 clinic-calendar 배포 dbfd17b 뒤):
1. "캘린더 예약목록 색좀 다양하게 못하나" → 고른 답 '고를 색 늘리기'(10색 → 20색). 시안 `docs/mockups/calendar-colors/` ①~③ 승인("이대로 만들기").
2. "예약 시간 … 내가 타자로도 예약시간 입력되게해줘" → 더하기 판 '시작'을 쳐서 넣는 칸으로. 시안 ④.
3. "동시간 예약할때 전에 예약한사람이 칸을 다 채워서 위로올려서 예약해야하는데 그 시간칸으로 예약할수있게해 예약칸을 조금 줄이고" → 예약 칸 폭을 줄여 오른쪽 빈 줄을 누르면 그 시간으로 더하기. 시안 ⑤.

## 요구사항

### REQ-6001: 예약 색판 20색
- AC-6001.1: Given `CAL_COLORS`(types/calendar.ts), When 보면, Then 20개가 이 차례다: blue·teal·purple·orange·pink·lime·navy·sky·brown·red·yellow·green·mint·magenta·wine·forest·lavender·coral·black·gray. `CAL_COLOR_LABEL`(colors.ts)과 `COLOR_NAMES`(CalendarSettings.tsx)는 같은 차례로 파랑·청록·보라·주황·분홍·연두·남색·하늘·갈색·빨강·노랑·초록·민트·자주·와인·진초록·연보라·산호·검정·회색이고, `CAL_TONES`는 20색 모두 `bg-cal-{색}`·`bg-cal-{색}-soft`·`border-cal-{색}`·`ring-cal-{색}/25`다
- AC-6001.2: Given `src/app/globals.css`, When 보면, Then `:root`에 새 10색이 design.md '색 값' 표 그대로 있고 옅은 바탕(`-soft`)은 20색 모두 그 색 13% + `--surface`이며, `@theme inline`에 `--color-cal-{색}`·`--color-cal-{색}-soft`가 있다. 실제 Tailwind로 돌리면 20색의 `bg-cal-*`·`bg-cal-*-soft`·`border-cal-*`가 `var(토큰)`을 쓰고, 표에 없는 이름(`bg-cal-gold`·`bg-cal-blue-strong`)은 만들어지지 않는다
- AC-6001.3: Given [설정], When 종류 줄 색 단추를 누르면, Then 색판은 '시행자 색 따름' 뒤에 20색이 AC-6001.1 차례로 있고, 시행자 줄 색판은 20색만 있다(시행자 색 따름 없음). 새 색(예: 빨강)을 골라 [저장]하면 그 색 이름(`red`)으로 저장된다
- AC-6001.4: Given [설정], When [+ 시행자 더하기]를 누르면, Then 새 시행자 색은 아직 안 쓴 색 가운데 AC-6001.1 차례로 첫 색이다(파랑~갈색 아홉을 다 쓰면 빨강, 회색은 맨 끝)
- AC-6001.5: Given 설정 검사·저장·읽기(`lib/storage/calendar.ts`), When 새 10색이 든 종류·시행자를 보면, Then `checkCalendarSettings`는 문제 없음, `saveCalendarSettings`는 보내고, `loadCalendarSettings`는 그 색을 그대로 돌려준다. 표에 없는 이름(`gold`)은 지금처럼 `kind-color`·`staff-color` 문제다

### REQ-6002: 시작 시간을 쳐서 넣기
- AC-6002.1: Given `parseStart(text, openHour, closeHour)`(lib/calendar/rules.ts), When 글을 읽으면, Then design.md '시간 읽기' 표대로 분(0~1430, 10분 단위)이나 `'format'`·`'step'`을 돌려준다. `1430`·`14:30`·`14시30분`·`14 30` → 870, `930`·`9:30` → 570, `14`·`14시` → 840, 보이는 시간 9~19시에서 `230` → 870(오후로 봄), `830` → 510(오후로 보면 보이는 시간 밖이라 그대로), `1435` → `'step'`, `25시`·`1460`·`abc`·빈 글 → `'format'`
- AC-6002.2: Given 예약 더하기·고치기 판, When 그리면, Then '시작'은 글 칸(`<input>`, 이름표 '시작', placeholder '예: 1430', `inputMode="numeric"`)이고 값은 `HH:MM`(예: 10:50), 아래 안내는 '1430처럼 쳐도 돼요 · 10분 단위', 고르기 목록(`<datalist>`)은 보이는 시간 안 10분 칸 `HH:MM`이다. 글을 쳐서 읽히면 바로 그 시각이 판(draft.start)에 들어가 판 위 시간 줄과 예약표 '새 예약' 칸이 따라 움직이고, 칸을 벗어나면(blur) 글이 `HH:MM` 모양이 된다
- AC-6002.3: Given '시작' 칸, When 못 읽는 글이 있는 동안, Then 판의 시각(draft.start)은 마지막으로 읽힌 값 그대로이고, 저장 줄은 '시작'이 맨 앞에 든 '… 칸을 채우면 저장할 수 있어요'(예: '시작 칸을 채우면 저장할 수 있어요')이며 [저장]이 막힌다. 그 글을 두고 칸을 벗어나면 칸 아래 오류 글('시간을 14:30처럼 적어 주세요' 또는 '10분 단위로 적어 주세요 (예: 14:30)')과 칸 `aria-invalid="true"`가 보인다(치는 동안에는 오류 글을 안 보인다). 바르게 고치면 오류가 사라진다
- AC-6002.4: Given 판이 열린 채, When 판 밖에서 draft 시각이 바뀌면(예약표 빈 칸을 다시 누름), Then '시작' 글도 그 시각 `HH:MM`으로 바뀐다

### REQ-6003: 같은 시간에 하나 더 — 예약 칸 오른쪽 빈 줄
- AC-6003.1: Given 일·주 보기 예약표, When 예약 칸과 비트 예약 칸을 그리면, Then 날 칸 오른쪽 20px를 비우고 그 안에서 나란히 놓인다: `left = calc((100% - 20px) * col/cols + 1px)`, `width = calc((100% - 20px) * span/cols - 2px)`(`placeStyle`)
- AC-6003.2: Given 예약이 있는 시간, When 그 높이의 오른쪽 빈 줄(예약 칸 밖)을 누르면, Then `onSlot(그날, 그 10분 칸 시각)`이 불려 그 시각으로 더하기 판이 열린다. 예약 칸을 누르면 지금처럼 `onAppt`(자세히 판)이고 `onSlot`은 안 불린다
- AC-6003.3: Given 마우스, When 날 칸 오른쪽 20px 위에 있으면, Then 그 10분 칸 높이에 글 없는 좁은 점선 칸(`data-hover="edge"`)이 오른쪽 줄 안에만 보이고, 나머지 빈 곳에서는 지금처럼 '+ HH:MM' 미리 보기(`data-hover="full"`)다. 예약 칸 위에서는 둘 다 없다

## 범위 밖
- 칸 모양(옅은 13% 바탕·왼쪽 3px 띠·글 색)·월 보기·폰 주 목록 모양은 그대로(색만 늘어난다)
- 5분 단위 시작(서버 `start_min % 10 = 0` 그대로, SQL 없음)
- 끌어 옮기기, 길이 칸 모양
- 옅은 바탕 위 `muted` 글 대비(지금 10색도 3.8~4.2:1, UI_GUIDE와 다름)는 이번에 고치지 않는다(design.md '위험')

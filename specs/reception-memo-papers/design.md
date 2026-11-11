# 설계: 접수 현황 수정 묶음

## 1. 보류 노랑 (REQ-3401)
`theme.css`의 `--status-hold-*` 세 값만 바꾼다. `.status-hold`는 이미 이 변수를 쓴다. shell.test의 승인 색 목록에 #FFD43B·#C9A100을 더한다.

## 2. 충격파 (REQ-3402)
- 저장 모양은 그대로(`det` 글 하나). 목록만 넓힌다: `ArrangeChoices` Eswt = 1~4부위 + 타수×부위 16개. 그래서 파일·쓰기 길·`add` op는 바뀌지 않는다(옛 "N부위" 값도 그대로 읽힘).
- 화면: 충격파 빈 칸은 두 줄 고르기 창(시안 `eswtSheet`). 칸 그리기는 det를 " "로 나눠 앞이 "…타"면 `.hit` 줄을 더한다.

## 3. 메모 (REQ-3403)
- 새 `reception/www/memo.js`: `memoBox()`(머리 칸 요소), `openMemo()`(큰 창), 저장 읽기·쓰기(try/catch, 모양 검사). `board.js topOf`가 어레인지 탭일 때만 로고 뒤에 `memoBox()`를 넣고 `.top-row`에 `with-memo`를 단다. 창은 `document.body`에 붙여 판 다시 그리기에 안 지워진다. 숨김·끊김(app.js가 화면을 지울 때)에는 열린 창을 저장하고 닫는다.
- 손글씨는 `<canvas>` → `toDataURL('image/png')`. 펜 색은 `getComputedStyle(document.documentElement)`로 `--memo-ink`·`--memo-red`를 읽는다. 작은 그림은 `img src=data:`(CSP `img-src 'self' data:` 이미 허용). 띠·되돌리기는 지금 띠 모양을 따른다.
- ESLint: `files: ['reception/www/memo.js']` 덮어쓰기로 `localStorage`만 뺀 같은 규칙.

## 4. 지난 진료기록부 (REQ-3404)
- C#: `ReceptionSql`에 `HistoryCte`를 쓰는 4문장(`H.Seq BETWEEN @first AND @last`, 첫 칸 VisitId). `PastPaperReader.Get(services, keys, board, key, from, clock)` = `HistoryReader`의 열쇠·판 확인 → `HistoryCount` → 4문장 → 내원별로 `PrevPaper`와 같은 칸(`PaperReader` 도우미 재사용) → `PastPapers.ToJson`. 크기는 `PaperChunk.SizeAt(from)` = from 0이면 2, 아니면 3. `ReceptionRouter`에 `/papers` 길(`?from=N`, `HistoryReader.TryFrom`).
- 화면: `api.js getPapers(k, from)`. `detail.js`의 `historyOf`가 "지난 진료기록부" 자리(`.past-list`)를 그리고, app.js가 상세를 열 때 한 번 `getPapers(k,0)`로 채운다(`fillPast`). [더 보기]는 detail.js 안에서 `onMore` 콜백으로 app.js가 읽어 붙인다. 종이 카드는 charts.js `prevOf`의 모양을 `detail.js`에서 함께 쓰도록 `pastCard(paper)`로 꺼낸다.

## 위험
- 지난 종이 한 쪽은 문장 5개(8초 안). 3장씩이라 줄 수가 작다.
- localStorage 예외는 메모 파일 하나로 묶고 시험으로 증명한다.

# 설계: 어레인지 돌아옴·고르기 목록 전체 고치기·비고 기록부

> 기능 ID: `reception-arrange-tune` · 바탕: 갈래 `feat-reception-pick-lists`(fa54335) 위. 시안 `docs/mockups/reception-arrange-tune/Mock.html`.
> 고치는 곳은 접수 현황 프로그램(`PrecheckReception.exe`)의 `helper/src/Precheck.Core/Reception/**`와 화면 `reception/www/**`뿐이다. 운영 웹사이트·청구 도우미·DB는 건드리지 않는다.

## 1. 돌아옴 (REQ-3601·3602)

### 도우미 (C#)
- `VisitMark`(ArrangeMarks.cs)에 `Back`·`BackStop`(string? "HH:MM")을 더한다. 생성자 끝 선택 인자로 두어 다른 부르는 곳은 그대로 컴파일된다. `WithAway`처럼 `WithBack(back, backStop)`을 둔다. `IsEmpty`는 두 칸도 본다.
- 저장(ArrangeMarks 쓰기·읽기): 내원 칸 목록에 `back`·`backStop`을 더하되 각각 값이 있을 때만 쓴다. 읽기는 두 칸이 없어도 받고, 있으면 `IsTimeOrNull`로 본다(지금 away·ended와 같다). back 없이 backStop만 있으면 깨진 파일이다. 옛 파일은 그대로 읽힌다.
- 쓰기(ArrangeWrite.Apply):
  - `away on` → `WithAway(hhmm).WithBack(null, null)`
  - `away off` → `WithAway(null).WithBack(hhmm, null)`
  - `away clear`(되돌리기 전용 새 값) → `WithAway(null).WithBack(null, null)`
  - 칸 쓰기(step·set·add·remove·part)가 받아지면, `Back != null && BackStop == null`일 때 결과 표시에 `WithBack(Back, hhmm)`. X-RAY 칸 쓰기는 지금 `XrayOnly`(표시 없이 X-ray만)로 끝나는데, 셈 중이면 `ArrangeWriteResult.Marks(mark.WithBack(Back, hhmm), xray)`로 표시와 X-ray를 함께 낸다(라우터는 지금처럼 둘 다 쓴다). 칸 쓰기가 400 등으로 받아지지 않으면 바꾸지 않는다
  - ptf·end는 back을 건드리지 않는다. X-ray 화면(`/api/xray`, XrayMarks)은 VisitMark를 쓰지 않으니 그대로다
- 판(ArrangeBuilder·BoardModel): `ArrangeRow`에 `Back`·`BackWait`(string?)를 더해 JSON `back`·`backWait`로 늘 쓴다(null이면 null). `BackWait`는 `Back != null && BackStop == null`이고 판 시각(`BoardInput.ReadAt`, 판 "at"의 시:분)이 있을 때 `Span(분) + "째"`. 분 = 판 시각 − back(음수면 0). `Span`은 BoardBuilder의 "18분"·"1시간 4분"·"2시간" 글과 같게 한다(같은 함수를 internal로 나눠 쓴다).

### 화면 (arrange.js·api.js·style.css)
- `api.js` 어레인지 줄 모양 검사에 `back`(null | 시:분)·`backWait`(null | 빈 글 아닌 글)을 더한다.
- `awayOf`: away면 지금 그대로. 아니고 `back`이면 `span.rtn-tag`("돌아옴 {back}") + backWait가 있으면 `span.wt.rtn-wt`(backWait, 기다린 글 `.wt` 모양을 물려받음). class 이름과 색은 시안 그대로다(`.back`은 이미 다른 규칙이 있어 쓰지 않는다).
- `LEGEND`에 `['rtn', '돌아옴']`(away 뒤, ptup 앞), 접수 머리 설명·`HOWTO` 둘째 줄·`FOOT`은 시안 글.
- `planOf`: `away` off(지금 자리비움) → `{ ...row, away: null, back: stamp, backWait: '0분째' }`, 띠 `${name} · 돌아옴 ${stamp}`, 되돌리기 `{ op: 'away', v: 'on' }`. `away` on → `{ away: stamp, back: null, backWait: null }`, 되돌리기 `{ op: 'away', v: 'clear' }`. `away` clear → `{ away: null, back: null, backWait: null }`, 띠 글은 주고(app.js가 띠 글이 없는 쓰기를 버리므로) 되돌리기는 null. app.js는 고치지 않는다. 칸 쓰기(X-RAY 칸 포함) → 그 줄 `backWait: null`(back은 둔다). `api.js` `setArrange`는 away v로 `clear`도 받는다.

## 2. 고르기 목록 넓히기 (REQ-3603·3604)

### 모양
판 `picks` = 저장 파일 = `POST /api/lists` 몸:
```json
{ "carm": { "procs": [{ "n": "목", "noDrug": false }], "drugs": ["TP"] },
  "sono": { "parts": ["목"], "plains": ["소독"], "withs": ["DNA"] },
  "pt": ["ICE", "HP"], "ds": ["30분", "50분"],
  "eswt": { "hits": ["2000타", "3000타", "4000타", "6000타"], "counts": ["1부위", "2부위", "3부위", "4부위"] },
  "trac": ["목", "허리"] }
```
- 한도: 이름 1~10글자(지금 규칙), PT·도수·견인·부위 수 1~8, 타수 0~8, 무리 안 겹침 없음. 가장 큰 몸은 8192바이트 안에 든다(한글 이름 30바이트 × 140개 안팎).

### 도우미 (C#)
- `PickLists`: `Pt`·`Ds`·`EswtHits`·`EswtCounts`·`Trac`(IReadOnlyList<string>)와 한도 상수를 더한다. `Defaults`에 AC-3603.1 값. 읽기(`ReceptionLists`의 파일 읽기)는 넷이 모두 없으면 그 넷만 기본값, 일부만 있으면 깨진 파일, 모두 있으면 모양 검사. 몸 읽기(`POST /api/lists`)는 여섯 모두 있어야 한다. JSON 쓰기(`Write(writer)`)는 여섯 모두 쓴다.
- `ArrangeChoices`: 고정 목록 `Pt`·`Ds`·`Eswt`·`Trac`을 없앤다.
  - `AddOf(col, PickLists lists)`: PT·도수·견인 = 그 목록, 충격파 = 부위 수 + 타수 × 부위 수("{타수} {부위 수}"), X-RAY = "X-ray 찍기", SONO·C-ARM = 빈 목록(지금처럼 PickLists 규칙).
  - `IsDetail(col, det)`: PT·도수·충격파·견인은 1~21글자·"|"·제어 글자 없음(`IsText`), 다른 칸은 "". 목록 소속은 보지 않는다.
- `ArrangeWrite.AddCell`은 `ArrangeChoices.AddOf(col, lists)`로 본다(지금 `lists` 인자 그대로).
- 몸 한도: `HttpRequestReader.MaxBody` 8192, 라우터 `ListsMaxBody` = MaxBody. 256·1024는 그대로.
- 충격파 타수 시험(`EswtChoices.test.cs`)처럼 고정 목록 글을 쓰던 시험은 기본 목록(`PickLists.Defaults`)으로 고친다. C# 시험 하나가 `PickLists.Defaults`를 AC-3603.1 값(차례 그대로)에 고정한다.

### 화면
- `api.js` `picks` 모양 검사에 새 무리, `setLists` 한도 8192. `picks.js`의 초안 만들기·내보내기(draftOf·picksOf)는 같은 TASK에서 새 무리를 그대로 넘기게만 고친다(그래야 지금 [저장] 시험이 깨지지 않는다).
- `arrange.js`: `CHOICES`·`ESWT_COUNTS`·`ESWT_HITS`를 없애고 넣기 창은 판 `picks`(pt·ds·trac 목록, 충격파는 `eswt.counts` 줄·`eswt.hits` 줄, 타수가 비면 타수 줄 없음)를 쓴다. 충격파 칸 글을 타수·부위 수로 나누는 곳(`ESWT_SPLIT`)은 "타"로 끝난다고 보지 않고 판 `eswt.hits`의 이름 + 빈칸으로 시작하는지로 나눈다. 열 머리 작은 글은 PT·도수·견인 목록 `join('·')`(넘치면 줄임표), 충격파 "타수·부위 수". X-RAY 넣기는 그대로. `picks`가 없으면 PT·도수·충격파·견인 넣기 창도 열지 않는다. `planOf`의 add 검사도 판 `picks`로 본다(도우미 AddOf와 같은 규칙).
- `picks.js`: `TABS`에 PT(종류)·도수(시간)·충격파(타수·부위 수, 위 안내)·견인(부위)을 더한다. 무리마다 `min`(마지막 ✕ 끄기: PT·도수·부위 수·견인 1, 타수 0)과 `max`(8).
  - 이름 바꾸기: 창이 `renaming = { tab, group, index, text }` 하나를 갖는다. 이름 글을 누르면 그 줄이 글 칸 + [바꾸기]·[취소] + 안내가 된다. [바꾸기]는 더하기와 같은 이름 규칙(자기 자신과는 겹침으로 보지 않음, 개수 한도는 보지 않음)을 지나면 초안의 그 자리만 바꾸고, 아니면 줄을 연 채 안내 글을 빨갛게 한다. C-ARM 시술은 `noDrug`를 둔다. 다른 이름을 누르면 그 줄로 옮기고, 다른 탭·▲·▼·✕를 누르면 닫는다. 글 칸의 Esc는 바꾸기만 닫고 창은 닫지 않는다(지금 창의 Esc 처리보다 먼저 받는다). 다시 그리기에도 바꾸던 글과 초점이 남는다(지금 창 규칙).
- 지금 시험이 화면 `CHOICES`와 C# 글을 견주던 곳(AC-3308.7·AC-3402.1)은 C# 파일을 읽지 않고 `fixtures.ts` 기본 `picks`를 AC-3603.1 값(차례 그대로)에 고정하는 시험으로 바꾼다. C# 쪽은 TASK-2 시험이 같은 값에 고정하므로 두 쪽이 명세 하나로 맞는다(일꾼 B 혼자서도 통과한다).

## 3. 비고와 기록부 (REQ-3605)
- `style.css` `.lastsym`: `-webkit-line-clamp: 3; line-clamp: 3`.
- `arrange.js` `memoOf`: 비고 칸 안을 `button.memo-btn`(누르면 `act.call('onChart', row.k)`)으로 감싼다. 글은 지금처럼 글 마디로만 넣는다.
- `charts.js` `renderCharts(host, row, today, prev, view)`: `view.older`('reading' | 'error' | papers 답)·`view.onMore(from)`을 받는다. 직전 카드가 있으면(prev가 답이고 null이 아님) 그 아래 `section.older` = 머리 "그 전 진료기록부" + `.past-list`. 답이면 `detail.js`가 내보내는 `appendPast(list, page, onMore)`(지금 `appendPage`를 첫 장 [지난번] 없이 쓰는 것)로 붙인다. 빈 답 "그 전 기록부는 없어요.", 읽는 중·실패 글은 상세와 같다. 같은 환자를 다시 그리면 `section.older`는 두고 안 바꾼다.
- `detail.js`: `appendPage`를 `appendPast`로 내보낸다(상세의 지금 동작·시험은 그대로).
- `app.js` `drawChart`: 새 환자를 열 때 `chart.older = 'reading'`으로 두고 `getPapers(k, 1)`을 한 번 읽는다(지금 차례 번호·`poll.signal()` 규칙, 다른 환자·숨김·끊김이면 버림). [더 보기]는 같은 규칙으로 `getPapers(k, next)`. 저절로 다시 읽기에는 다시 읽지 않는다.

## 4. 결정과 위험
- 돌아옴 시간을 화면이 아니라 도우미가 센다: 폰 시계를 쓰지 않는다는 지금 규칙(판 at)을 따른다. 판을 다시 읽는 간격만큼 숫자가 늦게 바뀐다(목록 기다린 글과 같다).
- 칸 글을 목록 소속 대신 모양으로 본다: 목록을 고쳐도 아침에 넣은 칸이 깨진 파일이 되지 않게. 대신 아무 글이나 받지 않도록 add만 지금 목록으로 본다.
- 몸 한도를 8192로 올린다: 목록 여섯 무리가 4096을 넘을 수 있다. 머리 한도·길별 한도(256·1024)는 그대로라 다른 길에는 영향이 없다.
- 그 전 기록부를 열 때 한 번 더 읽는다(비트 읽기 한 번 늘어남). 상세와 같은 8초 한도·읽기 전용 길을 쓴다.
- 되돌리기 위험: 하루 중간에 옛 판 exe로 되돌리면 옛 판은 새 칸(back)이 든 표시 파일과 새 무리가 든 목록 파일을 깨진 파일로 본다. 그날 어레인지 표시는 사라지고 목록은 기본값이 된다(설치 안내에 적는다).

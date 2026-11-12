# 설계: 접수 현황 SONO·C-ARM 고르기 목록 + 목록 고치기

## 1. 목록 (REQ-3501)
- 새 `PickLists.cs`: `PickLists`(Procs `[(N, NoDrug)]`·Drugs·Parts·Plains·Withs), `Defaults`, `TryParse`(모양 규칙), `Write(Utf8JsonWriter)`, 쓰기 검사 `IsCarm(v, t)`·`IsSono(v, t)`(쪽 글 오른·왼·양은 고정).
- 새 `ReceptionLists.cs`(`reception-lists.dat`): XrayMarks와 같은 머리·IProtector·잠금·임시 파일 → 바꾸기, 날짜 없음. `Current()`(없으면 기본값, 깨졌으면 기본값 + E-STORE-BROKEN 한 번), `Save(PickLists)`(실패는 E-STORE-FAILED → 503).
- 라우터 생성자 끝 선택 인자 `ReceptionLists? lists = null`(없으면 `/api/lists` 404, 목록은 기본값). `ReceptionServices`가 같은 `data\`·DPAPI로 만든다.
- 판: `Board.ToJson(arrange, picks = null)` — arrange를 쓸 때만 맨 위 `picks`. 맨 위 `lists`는 이미 줄 목록(queue…done)이라 이름을 `picks`로 한다.

## 2. 칸 표시·쓰기 (REQ-3502)
- `CellMark`·`ArrangeCell`에 `Tags`(끝 선택 인자, 기본 빈 목록). 파일 칸 `tags`는 비지 않을 때만. `ArrangeChoices.IsPart`는 SONO·C-ARM이면 모양만 본다(줄 1~13글자 = 쪽 글 + 빈칸 + 10글자, 6줄까지, "|"·제어 글자 없음). tags도 모양만(1~10글자, 12개까지). `ArrangeChoices`에서 SONO·C-ARM 부위 목록과 `PartLater`를 뺀다.
- `ArrangeOp.T`, `TryParse`가 `t`를 받는다. `Apply(…, paid, picks = null)`: sono·carm의 add·part는 `picks ?? Defaults`로 보고 Part = v, Tags = t를 "|"로 나눈 것. `ArrangeBuilder`는 표시의 Tags를 칸에 옮기고(처방에서만 온 칸은 빈 목록) `BoardModel` 칸 JSON에 `tags`를 쓴다.
- 몸 한도: `HttpRequestReader.MaxBody` 4096(Content-Length 자리 수 검사도 넷까지). 라우터가 쓰기 검사 앞에서 길마다 xray 256·arrange 1024·lists 4096을 본다(413). `ClientGuard.WriteOk`는 MaxBody와 견준다. arrange를 1024로 둔 까닭: 가장 긴 몸(SONO 6줄 + 같이 12개, 한글 3바이트)이 약 650바이트다.

## 3. 화면 (REQ-3503~3505)
- `api.js`: `isCell`에 tags, `isBoard`에 picks(없으면 받음), `setArrange(k, op, col, v, t)`, `setLists(picks)`. 몸 한도는 길마다.
- `arrange.js`: CHOICES·PARTS에서 sono·carm을 빼고 판 `picks`를 읽는다. 창 값(C-ARM `proc`·`drug`, SONO `side`·`picked`·`withs`)은 충격파처럼 `onSheet`로 넘겨 다시 그리기에 남기고, 목록 밖 값은 안 고른 것이다. `onAdd`·`onPart`가 t를 더 받는다. 칸은 part를 "|"로 나눠 줄마다 `.det`, tags는 `.tags > .drug`. `planOf` add·part도 v·t로 같은 칸을 미리 그린다.
- 새 `picks.js`: 목록 고치기 창. 판 picks의 사본(초안)을 창이 갖고, `renderArrange`는 열린 목록 창을 지우지 않는다(적던 글·초점이 남게). [저장] → `view.onLists(draft)` → app.js `setLists` → 띠 → `poll.readNow()`. 숨김·끊김 때는 지금처럼 함께 지운다.
- `board.js topOf`: 어레인지 탭이면 `.top-status` 앞에 [☰ 목록 고치기]. 새 색 없음(시안 모양은 지금 토큰만 씀).

## 위험
- 목록을 바꾸는 사이 열린 넣기 창의 고른 값이 목록에서 빠지면 풀린다. 이미 넣은 칸은 모양만 보므로 그대로 보인다.
- "{시술}은 약재 없이 넣어요"는 시안 글 그대로라 받침 없는 이름을 새로 더하면 "은"이 어색할 수 있다.

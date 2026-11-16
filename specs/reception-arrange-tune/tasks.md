# 작업 분할: 어레인지 돌아옴·고르기 목록 전체 고치기·비고 기록부

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> **Phase 1** — 일꾼 둘이 나란히. 두 줄은 같은 파일을 고치지 않는다(A는 `helper/`만, B는 `reception/`만).
> - **A 도우미(C#)**: Step 1 TASK-1 → Step 2 TASK-2
> - **B 화면**: Step 1 TASK-3 → Step 2 TASK-4 → Step 3 TASK-5. 새 판 모양(줄 `back`·`backWait`, `picks` 새 무리)은 `fixtures.ts`의 가짜 판으로 쓴다
> **Phase 2** — 새 TASK 없음: 합치기 → 전체 시험·lint·build → 화면 확인 → 전체 검토 한 번 → 접수 현황 새 설치 파일.

## TASK-1: 돌아옴 표시·판 칸 (C#)
- Step: Phase 1 (A) Step 1
- AC: AC-3601.1, AC-3601.2, AC-3601.3, AC-3601.4
- REQ: REQ-3601
- Files: helper/src/Precheck.Core/Reception/ArrangeMarks.cs, helper/src/Precheck.Core/Reception/ArrangeWrite.cs, helper/src/Precheck.Core/Reception/ArrangeBuilder.cs, helper/src/Precheck.Core/Reception/BoardModel.cs, helper/src/Precheck.Core/Reception/BoardBuilder.cs, helper/tests/Precheck.Core.Tests/Reception/ArrangeBack.test.cs, helper/tests/Precheck.Core.Tests/Reception/ArrangeMarks.test.cs, helper/tests/Precheck.Core.Tests/Reception/ArrangeWrite.test.cs, helper/tests/Precheck.Core.Tests/Reception/ArrangeBuilder.test.cs, helper/tests/reception-arrange-tune.dotnet.test.ts
- Tests: helper/tests/reception-arrange-tune.dotnet.test.ts, helper/tests/reception-arrange-marks.dotnet.test.ts, helper/tests/reception-arrange-write.dotnet.test.ts, helper/tests/reception-arrange-board.dotnet.test.ts, helper/tests/reception-board.dotnet.test.ts
- TDD: required
- 지금 `away off` 뒤 표시가 없어지는 것을 보던 시험(ArrangeWrite.test.cs)은 새 규칙(off → back, clear → 없음)으로 고친다. 새 C# 시험 이름 공간 `Precheck.Core.Tests.Reception.ArrangeTune`(TASK-2도 같은 감싸개 `reception-arrange-tune.dotnet.test.ts`). 새 인자는 끝 선택 인자라 다른 부르는 곳은 그대로 컴파일된다

## TASK-2: 고르기 목록 넓히기·칸 글 모양·몸 한도 (C#)
- Step: Phase 1 (A) Step 2
- AC: AC-3603.1, AC-3603.2, AC-3603.3, AC-3603.4, AC-3603.5
- REQ: REQ-3603
- Files: helper/src/Precheck.Core/Reception/PickLists.cs, helper/src/Precheck.Core/Reception/ReceptionLists.cs, helper/src/Precheck.Core/Reception/ArrangeMarks.cs, helper/src/Precheck.Core/Reception/ArrangeWrite.cs, helper/src/Precheck.Core/Reception/Http/HttpRequestReader.cs, helper/src/Precheck.Core/Reception/Http/ReceptionRouter.cs, helper/tests/Precheck.Core.Tests/Reception/ArrangeTuneLists.test.cs, helper/tests/Precheck.Core.Tests/Reception/PickLists.test.cs, helper/tests/Precheck.Core.Tests/Reception/PickWrite.test.cs, helper/tests/Precheck.Core.Tests/Reception/EswtChoices.test.cs, helper/tests/Precheck.Core.Tests/Reception/ArrangeMarks.test.cs, helper/tests/Precheck.Core.Tests/Reception/ArrangeWrite.test.cs, helper/tests/Precheck.Core.Tests/Reception/Http/*.test.cs, helper/tests/reception-arrange-tune.dotnet.test.ts, helper/tests/reception-pick-lists.dotnet.test.ts, helper/tests/reception-http.dotnet.test.ts, helper/tests/reception-eswt-hits.dotnet.test.ts
- Tests: helper/tests/reception-arrange-tune.dotnet.test.ts, helper/tests/reception-pick-lists.dotnet.test.ts, helper/tests/reception-eswt-hits.dotnet.test.ts, helper/tests/reception-arrange-write.dotnet.test.ts, helper/tests/reception-arrange-marks.dotnet.test.ts, helper/tests/reception-http.dotnet.test.ts, helper/tests/reception-server.dotnet.test.ts
- TDD: required
- 고정 목록 글(ICE·HP 등 ArrangeChoices)을 쓰던 시험은 `PickLists.Defaults`로 고친다. 4096바이트를 박아 둔 시험(감싸개 이름 포함)은 새 한도로 고친다. 목록 밖 칸 글을 막던 예는 AC-3603.4대로 모양 검사 예로 바꾼다

## TASK-3: 어레인지 표 — 돌아옴·넣기 창 목록·비고 (화면)
- Step: Phase 1 (B) Step 1
- AC: AC-3602.1, AC-3602.2, AC-3602.3, AC-3602.4, AC-3604.4, AC-3604.5, AC-3605.1, AC-3605.2
- REQ: REQ-3602, REQ-3604, REQ-3605
- Files: reception/www/api.js, reception/www/arrange.js, reception/www/picks.js, reception/www/style.css, reception/tests/api.test.ts, reception/tests/arrange.test.ts, reception/tests/arrange-app.test.ts, reception/tests/picks.test.ts, reception/tests/fixtures.ts
- Tests: reception/tests/api.test.ts, reception/tests/arrange.test.ts, reception/tests/arrange-app.test.ts, reception/tests/picks.test.ts
- TDD: required
- fixtures.ts에 줄 `back`·`backWait`와 `picks` 새 무리 기본값을 더한다(TASK-4·5가 쓴다). picks.js는 draftOf·picksOf가 새 무리를 그대로 넘기게만 고친다(창 모양은 TASK-4). arrange-app.test.ts에 "자리비움 → [되돌리기] → `POST /api/arrange` away clear가 가고 돌아옴이 생기지 않는다" 시험을 더한다. 화면 `CHOICES`와 C# `ArrangeChoices`를 견주던 시험(AC-3308.7·AC-3402.1)은 C# 파일을 읽지 않고 fixtures 기본 `picks`를 AC-3603.1 값에 고정하는 시험으로 바꾼다. style.css 색 출처 시험에 새 시안(`docs/mockups/reception-arrange-tune/Mock.html`)을 더한다

## TASK-4: 목록 고치기 창 — 새 탭·이름 바꾸기 (화면)
- Step: Phase 1 (B) Step 2
- AC: AC-3604.1, AC-3604.2, AC-3604.3
- REQ: REQ-3604
- Files: reception/www/picks.js, reception/www/style.css, reception/tests/picks.test.ts, reception/tests/fixtures.ts
- Tests: reception/tests/picks.test.ts
- TDD: required

## TASK-5: 기록부 — 그 전 진료기록부 (화면)
- Step: Phase 1 (B) Step 3
- AC: AC-3605.3, AC-3605.4
- REQ: REQ-3605
- Files: reception/www/charts.js, reception/www/detail.js, reception/www/app.js, reception/www/style.css, reception/tests/charts.test.ts, reception/tests/detail.test.ts, reception/tests/arrange-app.test.ts, reception/tests/fixtures.ts
- Tests: reception/tests/charts.test.ts, reception/tests/detail.test.ts, reception/tests/arrange-app.test.ts
- TDD: required
- 상세(detail.js)의 지금 동작·시험은 그대로다. `appendPast`를 내보내기만 한다

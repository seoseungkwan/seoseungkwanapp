# 작업 분할: 접수 현황 SONO·C-ARM 고르기 목록 (시술·약재·쪽·부위·같이 하는 것) + 목록 고치기

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> **Phase 1** — 일꾼 둘이 나란히. 두 줄은 같은 파일을 고치지 않는다(A는 `helper/`만, B는 `reception/`만).
> - **A 도우미(C#)**: Step 1 TASK-1 → Step 2 TASK-2 → Step 3 TASK-3
> - **B 화면**: Step 1 TASK-4 → Step 2 TASK-5 → Step 3 TASK-6. 새 판 모양(`picks`·칸 `tags`)은 `fixtures.ts`의 가짜 판으로 쓴다
> **Phase 2** — 새 TASK 없음: 합치기 → 전체 시험·lint·build → 전체 검토 한 번 → 접수 현황 새 판.

## TASK-1: 고르기 목록·저장 (C#)
- Step: Phase 1 (A) Step 1
- AC: AC-3501.1, AC-3501.2
- REQ: REQ-3501
- Files: helper/src/Precheck.Core/Reception/PickLists.cs, helper/src/Precheck.Core/Reception/ReceptionLists.cs, helper/tests/Precheck.Core.Tests/Reception/PickLists.test.cs, helper/tests/reception-pick-lists.dotnet.test.ts
- Tests: helper/tests/reception-pick-lists.dotnet.test.ts
- TDD: required
- 새 C# 시험 이름 공간 `Precheck.Core.Tests.Reception.PickChoices`(TASK-2·3도 같은 감싸개)

## TASK-2: 칸 표시·쓰기 검사·판 칸 (C#)
- Step: Phase 1 (A) Step 2
- AC: AC-3502.1, AC-3502.2, AC-3502.3, AC-3501.4
- REQ: REQ-3502, REQ-3501
- Files: helper/src/Precheck.Core/Reception/ArrangeMarks.cs, helper/src/Precheck.Core/Reception/ArrangeWrite.cs, helper/src/Precheck.Core/Reception/ArrangeBuilder.cs, helper/src/Precheck.Core/Reception/BoardModel.cs, helper/tests/Precheck.Core.Tests/Reception/PickWrite.test.cs, helper/tests/Precheck.Core.Tests/Reception/ArrangeMarks.test.cs, helper/tests/Precheck.Core.Tests/Reception/ArrangeWrite.test.cs, helper/tests/Precheck.Core.Tests/Reception/ArrangeBuilder.test.cs, helper/tests/reception-pick-lists.dotnet.test.ts
- Tests: helper/tests/reception-pick-lists.dotnet.test.ts, helper/tests/reception-arrange-marks.dotnet.test.ts, helper/tests/reception-arrange-write.dotnet.test.ts, helper/tests/reception-arrange-board.dotnet.test.ts
- TDD: required
- 새 인자는 모두 끝 선택 인자(`Tags`·`picks`)라 라우터(TASK-3)와 다른 시험은 그대로 컴파일된다. "부위는 나중에"·옛 부위 목록을 쓰던 시험은 새 규칙으로 고친다

## TASK-3: 길·몸 한도·연결 (C#)
- Step: Phase 1 (A) Step 3
- AC: AC-3501.3, AC-3501.4, AC-3502.4
- REQ: REQ-3501, REQ-3502
- Files: helper/src/Precheck.Core/Reception/Http/ReceptionRouter.cs, helper/src/Precheck.Core/Reception/Http/HttpRequestReader.cs, helper/src/Precheck.Reception/ReceptionServices.cs, helper/tests/Precheck.Core.Tests/Reception/Http/ListsRoute.test.cs, helper/tests/Precheck.Core.Tests/Reception/Http/ArrangeRoute.test.cs, helper/tests/Precheck.Core.Tests/Reception/Http/ReceptionRouter.test.cs, helper/tests/Precheck.Core.Tests/Reception/Http/HttpRequestReader.test.cs, helper/tests/Precheck.Core.Tests/Reception/Http/ClientGuard.test.cs, helper/tests/Precheck.Core.Tests/Reception/Http/ReceptionServer.test.cs, helper/tests/Precheck.Core.Tests/Reception/ReceptionStart.test.cs, helper/tests/reception-pick-lists.dotnet.test.ts, helper/tests/reception-http.dotnet.test.ts, helper/tests/reception-server.dotnet.test.ts
- Tests: helper/tests/reception-pick-lists.dotnet.test.ts, helper/tests/reception-http.dotnet.test.ts, helper/tests/reception-server.dotnet.test.ts, helper/tests/reception-arrange-write.dotnet.test.ts
- TDD: required
- 256바이트를 박아 둔 시험(HttpRequestReader·ClientGuard·ReceptionServer)은 새 한도로 고친다. 접수 현황 프로그램(net48) 컴파일은 reception-arrange-write 감싸개의 buildDotnet이 본다

## TASK-4: 판 모양·쓰기 묻기 (화면 api.js)
- Step: Phase 1 (B) Step 1
- AC: AC-3502.5
- REQ: REQ-3502
- Files: reception/www/api.js, reception/tests/api.test.ts, reception/tests/fixtures.ts
- Tests: reception/tests/api.test.ts
- TDD: required
- fixtures.ts에 기본 목록 `picks`와 칸 `tags: []`를 더한다(TASK-5·6이 쓴다)

## TASK-5: C-ARM·SONO 넣기 창과 칸 (화면)
- Step: Phase 1 (B) Step 2
- AC: AC-3503.1, AC-3503.2, AC-3503.3, AC-3503.4, AC-3504.1, AC-3504.2, AC-3504.3, AC-3504.4
- REQ: REQ-3503, REQ-3504
- Files: reception/www/arrange.js, reception/www/app.js, reception/www/style.css, reception/tests/arrange.test.ts, reception/tests/arrange-app.test.ts, reception/tests/fixtures.ts
- Tests: reception/tests/arrange.test.ts, reception/tests/arrange-app.test.ts
- TDD: required
- 화면 CHOICES와 C# ArrangeChoices를 견주는 옛 시험은 sono·carm을 빼고 남긴다(C# 쪽은 TASK-2가 나머지 글을 그대로 둔다)

## TASK-6: 목록 고치기 (화면)
- Step: Phase 1 (B) Step 3
- AC: AC-3505.1, AC-3505.2, AC-3505.3, AC-3505.4
- REQ: REQ-3505
- Files: reception/www/picks.js, reception/www/arrange.js, reception/www/board.js, reception/www/app.js, reception/www/style.css, reception/tests/picks.test.ts, reception/tests/board.test.ts, reception/tests/arrange-app.test.ts, reception/tests/fixtures.ts
- Tests: reception/tests/picks.test.ts, reception/tests/board.test.ts, reception/tests/arrange-app.test.ts
- TDD: required

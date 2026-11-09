# 작업 분할: 접수 현황 어레인지 탭

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> Phase 1(TASK-1·2·3)이 끝나면 갈래를 올려(사용자 OK 뒤) Actions zip으로 의원 PC 확인을 돌린다. 그동안 Phase 2(TASK-4~11)를 가짜 지도로 만든다. Phase 3(TASK-12)은 확인 보고서가 온 뒤.
> 나란히 할 수 있는 것: TASK-4와 TASK-5(파일 겹치지 않음), C# 줄(TASK-4~8)과 화면 줄(TASK-9~10). 검토는 다 합친 뒤 한 번(메모 impl-workflow-style).

## TASK-1: 처방 → 칸 지도 (`ArrangeMap`)
- Step: Phase 1
- AC: AC-3301.1, AC-3301.2, AC-3301.4
- REQ: REQ-3301
- Files: helper/src/Precheck.Core/Reception/ArrangeMap.cs, helper/tests/Precheck.Core.Tests/Reception/ArrangeMap.test.cs, helper/tests/reception-arrange-map.dotnet.test.ts
- Tests: helper/tests/reception-arrange-map.dotnet.test.ts
- TDD: required
- C# 시험 이름 공간 `Precheck.Core.Tests.Reception.ArrangeMapping`. 확인 전 규칙은 design.md 2절의 둘(SONO1·CARM1)뿐. 가짜 지도(시험용 규칙 목록, X-ray `^G\d{4}$`)로 `Match`·`ManualOnly`를 증명한다

## TASK-2: 의원 PC 확인 한 단계 (처방 코드 표 · 부위 칸 찾기)
- Step: Phase 1 (TASK-1 뒤)
- AC: AC-3302.1, AC-3302.2, AC-3302.3, AC-3302.4, AC-3302.5, AC-3302.6
- REQ: REQ-3302
- Files: helper/src/Precheck.Core/Reception/Check/CheckRunner.cs, helper/src/Precheck.Core/Reception/Check/CheckSql.cs, helper/src/Precheck.Core/Reception/Check/ProbeSql.cs, helper/src/Precheck.Core/Reception/Check/CheckReport.cs, helper/tests/Precheck.Core.Tests/Reception/Check/*.test.cs, helper/tests/reception-check-*.dotnet.test.ts
- Tests: helper/tests/reception-check-arrange.dotnet.test.ts, helper/tests/reception-check-runner.dotnet.test.ts, helper/tests/reception-check-sql.dotnet.test.ts, helper/tests/reception-check-report.dotnet.test.ts, helper/tests/reception-check-codes.dotnet.test.ts, helper/tests/reception-check-symptom.dotnet.test.ts, helper/tests/reception-check-probe.dotnet.test.ts
- TDD: required
- 새 C# 시험은 `Check/CheckArrange.test.cs`(이름 공간 `Precheck.Core.Tests.Reception.Check`의 `CheckArrange` 갈래, 새 감싸개 `reception-check-arrange.dotnet.test.ts`). 단계 글 1/10~10/10·`CheckRound` 4를 고정한 지금 시험은 1/11~11/11·5로 바꾼다. AC-3302.6은 [의원 PC]라 `reception-check.cmd`·보고서 줄 모양 글만 본다

## TASK-3: 새 비트 문장 (`TodayOrderTimes` · 직전 종이 넷)
- Step: Phase 1 (TASK-2와 나란히)
- AC: AC-3303.1, AC-3307.2
- REQ: REQ-3303, REQ-3307
- Files: helper/src/Precheck.Core/Reception/ReceptionSql.cs, helper/tests/Precheck.Core.Tests/Reception/ArrangeSql.test.cs, helper/tests/Precheck.Core.Tests/Reception/ReceptionSql.test.cs, helper/tests/Precheck.Core.Tests/Reception/PaperSql.test.cs, helper/tests/reception-arrange-sql.dotnet.test.ts, helper/tests/reception-sql.dotnet.test.ts, helper/tests/reception-paper-sql.dotnet.test.ts
- Tests: helper/tests/reception-arrange-sql.dotnet.test.ts, helper/tests/reception-sql.dotnet.test.ts, helper/tests/reception-paper-sql.dotnet.test.ts
- TDD: required
- C# 시험 이름 공간 `Precheck.Core.Tests.Reception.ArrangeSql`. 문장 글은 design.md 5절. 지금 시험이 문장·매개변수 목록을 고정해 두었으면 새 다섯을 더한다. 확인 명령의 빠르기 단계가 `ReceptionSql`의 문장을 모두 재는 시험이 새 문장 때문에 깨지면 이 TASK를 멈추고 TASK-2 범위(CheckRunner)에서 매개변수를 준다(두 TASK가 끝난 뒤 한 번 더 GREEN 확인)

## TASK-4: 어레인지 표시 저장 (`ArrangeMarks`)
- Step: Phase 2 (TASK-1 뒤, TASK-5와 나란히)
- AC: AC-3304.1, AC-3304.2, AC-3304.3, AC-3304.4, AC-3312.3
- REQ: REQ-3304, REQ-3312
- Files: helper/src/Precheck.Core/Reception/ArrangeMarks.cs, helper/tests/Precheck.Core.Tests/Reception/ArrangeMarks.test.cs, helper/tests/reception-arrange-marks.dotnet.test.ts
- Tests: helper/tests/reception-arrange-marks.dotnet.test.ts
- TDD: required
- C# 시험 이름 공간 `Precheck.Core.Tests.Reception.ArrangeStore`. 가짜 폴더·가짜 암호화(`XrayMarks` 시험의 것과 같은 모양). 고르기 목록 `ArrangeChoices`(design.md 4절)도 이 파일에 둔다

## TASK-5: 오늘 처방 시각 읽기 (`BoardInput` · `BoardReader`)
- Step: Phase 2 (TASK-3 뒤, TASK-4와 나란히)
- AC: AC-3303.2, AC-3303.3
- REQ: REQ-3303
- Files: helper/src/Precheck.Core/Reception/BoardInput.cs, helper/src/Precheck.Core/Reception/BoardReader.cs, helper/tests/Precheck.Core.Tests/Reception/BoardOrders.test.cs, helper/tests/Precheck.Core.Tests/Reception/BoardReader.test.cs, helper/tests/Precheck.Core.Tests/Reception/BoardCache.test.cs, helper/tests/Precheck.Core.Tests/Reception/HistoryReader.test.cs, helper/tests/Precheck.Core.Tests/Reception/PaperReader.test.cs, helper/tests/Precheck.Core.Tests/Reception/Http/ReceptionRouter.test.cs, helper/tests/Precheck.Core.Tests/Reception/Http/ReceptionServer.test.cs, helper/tests/reception-arrange-orders.dotnet.test.ts, helper/tests/reception-board.dotnet.test.ts, helper/tests/reception-cache.dotnet.test.ts, helper/tests/reception-history.dotnet.test.ts, helper/tests/reception-paper.dotnet.test.ts, helper/tests/reception-http.dotnet.test.ts, helper/tests/reception-server.dotnet.test.ts
- Tests: helper/tests/reception-arrange-orders.dotnet.test.ts, helper/tests/reception-board.dotnet.test.ts, helper/tests/reception-cache.dotnet.test.ts, helper/tests/reception-history.dotnet.test.ts, helper/tests/reception-paper.dotnet.test.ts, helper/tests/reception-http.dotnet.test.ts, helper/tests/reception-server.dotnet.test.ts
- TDD: required
- C# 시험 이름 공간 `Precheck.Core.Tests.Reception.ArrangeOrders`. `VisitRow`의 `Orders`는 생성자 끝 선택 인자(지금 호출 그대로). 지금 시험의 가짜 비트가 모르는 문장에 던지면 새 문장 답(빈 줄)만 더한다

## TASK-6: 어레인지 자료 만들기 (`ArrangeBuilder` · 판 JSON)
- Step: Phase 2 (TASK-1·4·5 뒤)
- AC: AC-3301.3, AC-3305.1, AC-3305.2, AC-3305.3, AC-3305.4, AC-3305.5, AC-3305.6, AC-3305.7, AC-3305.8, AC-3305.9
- REQ: REQ-3301, REQ-3305
- Files: helper/src/Precheck.Core/Reception/ArrangeBuilder.cs, helper/src/Precheck.Core/Reception/BoardModel.cs, helper/tests/Precheck.Core.Tests/Reception/ArrangeBuilder.test.cs, helper/tests/reception-arrange-board.dotnet.test.ts
- Tests: helper/tests/reception-arrange-board.dotnet.test.ts, helper/tests/reception-board.dotnet.test.ts
- TDD: required
- C# 시험 이름 공간 `Precheck.Core.Tests.Reception.ArrangeBoard`. 답 모양은 design.md 7절. `Board.ToJson()`(인자 없음)의 답은 지금과 한 글자도 같아야 한다(지금 BoardBuilder 시험 그대로 GREEN)

## TASK-7: 쓰기 길 (`POST /api/arrange` · `ArrangeWrite` · 연결)
- Step: Phase 2 (TASK-6 뒤)
- AC: AC-3306.1, AC-3306.2, AC-3306.3, AC-3306.4, AC-3306.5, AC-3306.6
- REQ: REQ-3306
- Files: helper/src/Precheck.Core/Reception/ArrangeWrite.cs, helper/src/Precheck.Core/Reception/Http/ReceptionRouter.cs, helper/src/Precheck.Core/Reception/ReceptionLog.cs, helper/src/Precheck.Reception/ReceptionServices.cs, helper/tests/Precheck.Core.Tests/Reception/ArrangeWrite.test.cs, helper/tests/Precheck.Core.Tests/Reception/Http/ArrangeRoute.test.cs, helper/tests/reception-arrange-write.dotnet.test.ts
- Tests: helper/tests/reception-arrange-write.dotnet.test.ts, helper/tests/reception-http.dotnet.test.ts
- TDD: required
- C# 시험 이름 공간 `Precheck.Core.Tests.Reception.ArrangeWriting`. 라우터 생성자의 새 인자는 끝 선택 인자(지금 라우터 시험 그대로). `/api/board` 답의 `arrange`도 이 TASK에서 라우터가 넘긴다(AC-3305.1을 라우터로 한 번 더 본다). `ReceptionServices.cs`(윈도우 exe 쪽)는 진짜 저장소·DPAPI·`ArrangeMap.Rules`를 넘기는 몇 줄만

## TASK-8: 직전 기록부 (`PrevPaperReader` · `GET /api/visit/{k}/prev`)
- Step: Phase 2 (TASK-3·7 뒤)
- AC: AC-3307.1, AC-3307.3, AC-3307.4
- REQ: REQ-3307
- Files: helper/src/Precheck.Core/Reception/PrevPaperReader.cs, helper/src/Precheck.Core/Reception/Http/ReceptionRouter.cs, helper/src/Precheck.Core/Reception/PaperReader.cs, helper/src/Precheck.Core/Reception/HistoryBuilder.cs, helper/tests/Precheck.Core.Tests/Reception/PrevPaperReader.test.cs, helper/tests/Precheck.Core.Tests/Reception/Http/PrevRoute.test.cs, helper/tests/reception-arrange-prev.dotnet.test.ts
- Tests: helper/tests/reception-arrange-prev.dotnet.test.ts, helper/tests/reception-paper.dotnet.test.ts, helper/tests/reception-history.dotnet.test.ts, helper/tests/reception-http.dotnet.test.ts
- TDD: required
- C# 시험 이름 공간 `Precheck.Core.Tests.Reception.PrevPaper`. `PaperReader`·`HistoryBuilder`는 글 정리·"N일 전" 규칙을 함께 쓰려고 `internal` 도우미를 꺼내는 데만 고친다(답 모양 그대로)

## TASK-9: 어레인지 표 화면 (`arrange.js` · 머리 탭)
- Step: Phase 2 (C# 줄과 나란히, 가짜 판 자료로)
- AC: AC-3308.1, AC-3308.2, AC-3308.3, AC-3308.4, AC-3308.5, AC-3308.6, AC-3308.7, AC-3308.8, AC-3308.10, AC-3308.12, AC-3308.13, AC-3312.1
- REQ: REQ-3308, REQ-3312
- Files: reception/www/arrange.js, reception/www/board.js, reception/www/theme.css, reception/www/style.css, reception/tests/arrange.test.ts, reception/tests/board.test.ts, reception/tests/fixtures.ts, reception/tests/shell.test.ts, reception/tests/layout.test.ts, reception/tests/app.test.ts, reception/tests/offline.test.ts, reception/tests/poll.test.ts, reception/tests/alert.test.ts, reception/tests/dom.test.ts
- Tests: reception/tests/arrange.test.ts, reception/tests/board.test.ts, reception/tests/shell.test.ts, reception/tests/layout.test.ts, reception/tests/app.test.ts, reception/tests/offline.test.ts, reception/tests/poll.test.ts, reception/tests/alert.test.ts, reception/tests/dom.test.ts
- TDD: required
- 시안 `docs/mockups/reception-arrange/Arrange.html`의 글·순서·모양 그대로(목업 띠·가짜 환자 빼고). 누르기는 `view.on…` 부르기만 시험한다(보내기는 TASK-11). `CHOICES`가 C# `ArrangeChoices`와 같은지는 C# 파일 글을 읽어 견준다(TASK-4 뒤에 GREEN). 머리 탭을 더해 깨지는 지금 화면 시험은 탭 글만 더해 맞춘다

## TASK-10: 기록부 화면 (`charts.js` · `paperCard` 나눠 쓰기)
- Step: Phase 2 (TASK-9 뒤: style.css를 함께 고친다)
- AC: AC-3309.1, AC-3309.2, AC-3309.5
- REQ: REQ-3309
- Files: reception/www/charts.js, reception/www/detail.js, reception/www/style.css, reception/tests/charts.test.ts, reception/tests/detail.test.ts, reception/tests/fixtures.ts
- Tests: reception/tests/charts.test.ts, reception/tests/detail.test.ts
- TDD: required
- 오늘 종이는 지금 `paperCard` 그대로(detail.test.ts 그대로 GREEN), 직전 종이는 사람 칸·특이사항 없이 같은 부분과 회색 테두리

## TASK-11: 잇기 (`app.js` · `api.js` · `alert.js`)
- Step: Phase 2 (TASK-9·10 뒤)
- AC: AC-3308.9, AC-3308.11, AC-3309.3, AC-3309.4, AC-3310.1, AC-3310.2, AC-3310.3, AC-3312.2
- REQ: REQ-3308, REQ-3309, REQ-3310, REQ-3312
- Files: reception/www/app.js, reception/www/api.js, reception/www/alert.js, reception/tests/app.test.ts, reception/tests/api.test.ts, reception/tests/alert.test.ts, reception/tests/arrange-app.test.ts, reception/tests/fixtures.ts, reception/tests/offline.test.ts, reception/tests/poll.test.ts
- Tests: reception/tests/arrange-app.test.ts, reception/tests/app.test.ts, reception/tests/api.test.ts, reception/tests/alert.test.ts, reception/tests/offline.test.ts, reception/tests/poll.test.ts
- TDD: required
- 가짜 `fetch`·가짜 시계(지금 app 시험의 것)로: 탭·해시 길, 낙관적 그리기와 실패 되그리기, 되돌리기 띠 5초, 처방 나옴 알림(탭이 보일 때만·첫 읽기 아님), 숨김·끊김 지우기. `api.js`의 `setArrange`·`getPrev`·`isBoard`(arrange 모양) 시험은 api.test.ts에

## TASK-12: 확인 결과로 지도 채우기
- Step: Phase 3 (의원 PC 확인 보고서가 온 뒤, TASK-1~11 뒤)
- AC: AC-3311.1, AC-3311.2, AC-3311.3
- REQ: REQ-3311
- Files: helper/src/Precheck.Core/Reception/ArrangeMap.cs, helper/src/Precheck.Core/Reception/ReceptionSql.cs, helper/src/Precheck.Core/Reception/BoardReader.cs, docs/reception/check-result.md, helper/tests/Precheck.Core.Tests/Reception/ArrangeMap.test.cs, helper/tests/Precheck.Core.Tests/Reception/ArrangeFill.test.cs, helper/tests/reception-arrange-map.dotnet.test.ts, helper/tests/reception-arrange-fill.dotnet.test.ts
- Tests: helper/tests/reception-arrange-fill.dotnet.test.ts, helper/tests/reception-arrange-map.dotnet.test.ts
- TDD: required
- 보고서의 코드 표에서 근거가 있는 규칙만 채운다(AC-3311.1). `PartColumn`을 채울 근거가 있으면 `ReceptionSql.TodayOrderParts`·`BoardReader`의 그 한 문장을 더하고, 없으면 두 파일은 고치지 않는다. AC-3311.3은 [의원 PC]

## TASK-13: 기다린 시간 보이기 (어레인지 표 접수 칸 · 기록부 머리)
- Step: Phase 4 (2026-11-09 사용자 요청, TASK-9·10 뒤)
- AC: AC-3308.14, AC-3309.6
- REQ: REQ-3308, REQ-3309
- Files: reception/www/arrange.js, reception/www/charts.js, reception/www/style.css, reception/tests/arrange.test.ts, reception/tests/charts.test.ts, reception/tests/fixtures.ts, docs/mockups/reception-arrange/Arrange.html
- Tests: reception/tests/arrange.test.ts, reception/tests/charts.test.ts
- TDD: required
- 서버(C#)는 고치지 않는다. 목록 줄의 `waited`·`long`을 그대로 쓴다(design.md 10-1). 새 색 없음

## TASK-14: 수납완료 줄 저절로 빼기 (서버)
- Step: Phase 4 (2026-11-10 사용자 고침 "수납 완료되면 자동으로 그 목록에서 없애 주고 싶은데", TASK-13 뒤)
- AC: AC-3304.5, AC-3305.2, AC-3305.9, AC-3305.10, AC-3306.7
- REQ: REQ-3304, REQ-3305, REQ-3306
- Files: helper/src/Precheck.Core/Reception/ArrangeMarks.cs, helper/src/Precheck.Core/Reception/ArrangeBuilder.cs, helper/src/Precheck.Core/Reception/ArrangeWrite.cs, helper/src/Precheck.Core/Reception/BoardBuilder.cs, helper/src/Precheck.Core/Reception/BoardModel.cs, helper/src/Precheck.Core/Reception/Http/ReceptionRouter.cs, helper/tests/Precheck.Core.Tests/Reception/ArrangeAutoEnd.test.cs, helper/tests/Precheck.Core.Tests/Reception/ArrangeBuilder.test.cs, helper/tests/Precheck.Core.Tests/Reception/Http/ArrangeRoute.test.cs, helper/tests/reception-arrange-autoend.dotnet.test.ts, helper/tests/reception-arrange-board.dotnet.test.ts
- Tests: helper/tests/reception-arrange-autoend.dotnet.test.ts, helper/tests/reception-arrange-board.dotnet.test.ts
- TDD: required
- design.md 10-2. 새 시험은 `ArrangeAutoEnd` 이름 공간 한 파일(가짜 상태 표·가짜 내원·임시 폴더 저장소·`ArrangeRig`에 상태 표를 넘기는 선택 인자). 지금 시험 가운데 바뀐 AC의 것(AC-3305.2 끝남 칸 줄, AC-3305.9 모양)만 고친다

## TASK-15: 수납완료로 빠진 줄 보이기 (화면)
- Step: Phase 4 (TASK-14 뒤)
- AC: AC-3308.15
- REQ: REQ-3308
- Files: reception/www/api.js, reception/www/arrange.js, reception/tests/api.test.ts, reception/tests/arrange.test.ts, reception/tests/fixtures.ts, docs/mockups/reception-arrange/Arrange.html
- Tests: reception/tests/arrange.test.ts, reception/tests/api.test.ts
- TDD: required
- design.md 10-2. 새 색·새 단추 없음. [치료 종료] 바로 그리기 시험(AC-3308.8)의 끝난 줄 모양에 `paid: false`가 더해진다

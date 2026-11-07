# 작업 분할: 접수 현황 상세를 종이 진료기록부 모양으로 + 특이사항

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> Phase 1의 TASK-1·2·3은 파일이 겹치지 않아 나란히 한다(사용자 지시 2026-11-07). Phase 2(TASK-4)는 1·2 뒤. 검토는 다 합친 뒤 한 번.

## TASK-1: RTF → 보통 글 (`RtfText`)
- Step: Phase 1 · 병렬
- AC: AC-1501.3, AC-1501.5(Tidy)
- REQ: REQ-1501
- Files: helper/src/Precheck.Core/Reception/RtfText.cs, helper/src/Precheck.Core/Precheck.Core.csproj, helper/tests/Precheck.Core.Tests/Reception/RtfText.test.cs, helper/tests/reception-paper-rtf.dotnet.test.ts
- Tests: helper/tests/reception-paper-rtf.dotnet.test.ts
- TDD: required
- C# 시험 이름 공간 `Precheck.Core.Tests.Reception.PaperRtf`. 시험 글은 지어낸 RTF(한글 `\'hh` cp949·`\uN`·`\par`·글꼴표·색표·`{\*…}`·빈 줄 여럿)

## TASK-2: 종이 자료 문장 (`ReceptionSql`)
- Step: Phase 1 · 병렬
- AC: AC-1501.8
- REQ: REQ-1501
- Files: helper/src/Precheck.Core/Reception/ReceptionSql.cs, helper/tests/Precheck.Core.Tests/Reception/ReceptionSql.test.cs, helper/tests/Precheck.Core.Tests/Reception/PaperSql.test.cs, helper/tests/reception-sql.dotnet.test.ts, helper/tests/reception-paper-sql.dotnet.test.ts
- Tests: helper/tests/reception-paper-sql.dotnet.test.ts, helper/tests/reception-sql.dotnet.test.ts
- TDD: required
- C# 시험 이름 공간 `Precheck.Core.Tests.Reception.PaperSql`. 문장 글은 design.md 3절. 기존 ReceptionSql 시험이 문장·칸 목록을 고정해 두었으면 새 다섯 문장을 그 목록에 더한다

## TASK-3: 종이 카드 화면 (`detail.js`·`app.js`·`api.js`)
- Step: Phase 1 · 병렬
- AC: AC-1502.1, AC-1502.2, AC-1502.3, AC-1502.4, AC-1502.5
- REQ: REQ-1502
- Files: reception/www/detail.js, reception/www/app.js, reception/www/api.js, reception/www/style.css, reception/www/theme.css, reception/tests/detail.test.ts, reception/tests/app.test.ts, reception/tests/api.test.ts, reception/tests/layout.test.ts, reception/tests/fixtures.ts
- Tests: reception/tests/detail.test.ts, reception/tests/app.test.ts, reception/tests/api.test.ts, reception/tests/layout.test.ts
- TDD: required
- 답 모양은 design.md 2절(가짜 자료로 시험). 목업 `docs/mockups/reception-phone/Paper.html`의 글·순서·모양 그대로. 오늘 카드(AC-1404.4·1404.7) 시험은 이 명세대로 바꾼다

## TASK-4: 종이 자료 읽기와 답 (`PaperReader`·`HistoryReader`·`HistoryBuilder`)
- Step: Phase 2 (TASK-1·2 뒤)
- AC: AC-1501.1, AC-1501.2, AC-1501.4, AC-1501.5, AC-1501.6, AC-1501.7, AC-1501.9
- REQ: REQ-1501
- Files: helper/src/Precheck.Core/Reception/PaperReader.cs, helper/src/Precheck.Core/Reception/HistoryReader.cs, helper/src/Precheck.Core/Reception/HistoryBuilder.cs, helper/tests/Precheck.Core.Tests/Reception/PaperReader.test.cs, helper/tests/Precheck.Core.Tests/Reception/HistoryReader.test.cs, helper/tests/Precheck.Core.Tests/Reception/HistoryBuilder.test.cs, helper/tests/reception-paper.dotnet.test.ts
- Tests: helper/tests/reception-paper.dotnet.test.ts, helper/tests/reception-history.dotnet.test.ts
- TDD: required
- C# 시험 이름 공간 `Precheck.Core.Tests.Reception.Paper`. 가짜 IBitDb(기존 HistoryReader 시험의 것)로 문장마다 줄을 준다

## TASK-5: 메모 크게 · 신환 표시 (`board.js`·`detail.js` 머리)
- Step: Phase 2 (TASK-3 뒤, TASK-4와 나란히)
- AC: AC-1503.1, AC-1503.2
- REQ: REQ-1503
- Files: reception/www/board.js, reception/www/detail.js, reception/www/style.css, reception/www/theme.css, reception/tests/board.test.ts, reception/tests/detail.test.ts, reception/tests/layout.test.ts, reception/tests/shell.test.ts, reception/tests/fixtures.ts
- Tests: reception/tests/board.test.ts, reception/tests/detail.test.ts, reception/tests/layout.test.ts, reception/tests/shell.test.ts
- TDD: required
- 목업 Paper.html의 `.memo`·`.memo .lab`·`.new-badge` 모양 그대로(파랑 #1D4ED8 · 흰 글). 도우미(C#)의 info 글은 바꾸지 않고 화면이 나눈다

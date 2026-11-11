# 작업 분할: 접수 현황 수정 묶음 — 보류 노랑·어레인지 메모·지난 진료기록부·충격파 타수

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> Phase 1은 일꾼 둘이 나란히: **A** = TASK-2 → 3 → 7(지난 진료기록부, C# → 화면), **B** = TASK-1 → 5 → 4 → 6 → 8(충격파·보류·메모·울타리).
> style.css는 A가 상세 칸 근처, B가 어레인지·머리 칸 근처에 더한다. Phase 2: 합치기 → 전체 시험·lint·build → 전체 검토 한 번 → 접수 현황 새 판.

## TASK-1: 충격파 고르기 목록 (C#)
- Step: Phase 1 (B)
- AC: AC-3402.1
- REQ: REQ-3402
- Files: helper/src/Precheck.Core/Reception/ArrangeMarks.cs, helper/tests/Precheck.Core.Tests/Reception/EswtChoices.test.cs, helper/tests/Precheck.Core.Tests/Reception/ArrangeMarks.test.cs, helper/tests/Precheck.Core.Tests/Reception/ArrangeWrite.test.cs, helper/tests/reception-eswt-hits.dotnet.test.ts
- Tests: helper/tests/reception-eswt-hits.dotnet.test.ts, helper/tests/reception-arrange-marks.dotnet.test.ts, helper/tests/reception-arrange-write.dotnet.test.ts
- TDD: required
- 새 C# 시험 이름 공간 `Precheck.Core.Tests.Reception.EswtHits`

## TASK-2: 지난 종이 문장 넷 (C#)
- Step: Phase 1 (A)
- AC: AC-3404.2
- REQ: REQ-3404
- Files: helper/src/Precheck.Core/Reception/ReceptionSql.cs, helper/tests/Precheck.Core.Tests/Reception/PastPaperSql.test.cs, helper/tests/Precheck.Core.Tests/Reception/ReceptionSql.test.cs, helper/tests/reception-past-papers.dotnet.test.ts
- Tests: helper/tests/reception-past-papers.dotnet.test.ts, helper/tests/reception-sql.dotnet.test.ts
- TDD: required
- 새 C# 시험 이름 공간 `Precheck.Core.Tests.Reception.PastPaper`(TASK-3과 같은 감싸개)

## TASK-3: 지난 종이 읽기·길 `GET /api/visit/{k}/papers?from=N` (C#)
- Step: Phase 1 (A, TASK-2 뒤)
- AC: AC-3404.1
- REQ: REQ-3404
- Files: helper/src/Precheck.Core/Reception/PastPaperReader.cs, helper/src/Precheck.Core/Reception/PrevPaperReader.cs, helper/src/Precheck.Core/Reception/Http/ReceptionRouter.cs, helper/tests/Precheck.Core.Tests/Reception/PastPaperReader.test.cs, helper/tests/Precheck.Core.Tests/Reception/Http/PastPaperRoute.test.cs, helper/tests/Precheck.Core.Tests/Reception/Http/ReceptionRouter.test.cs, helper/tests/reception-past-papers.dotnet.test.ts
- Tests: helper/tests/reception-past-papers.dotnet.test.ts, helper/tests/reception-arrange-prev.dotnet.test.ts, helper/tests/reception-server.dotnet.test.ts
- TDD: required

## TASK-4: 진료보류 진한 노랑 (화면)
- Step: Phase 1 (B)
- AC: AC-3401.1
- REQ: REQ-3401
- Files: reception/www/theme.css, reception/tests/shell.test.ts
- Tests: reception/tests/shell.test.ts
- TDD: required

## TASK-5: 충격파 두 줄 고르기·칸 그리기 (화면)
- Step: Phase 1 (B, TASK-1 뒤)
- AC: AC-3402.1, AC-3402.2, AC-3402.3
- REQ: REQ-3402
- Files: reception/www/arrange.js, reception/www/style.css, reception/tests/arrange.test.ts, reception/tests/arrange-app.test.ts, reception/tests/fixtures.ts
- Tests: reception/tests/arrange.test.ts, reception/tests/arrange-app.test.ts
- TDD: required

## TASK-6: 어레인지 메모 (화면)
- Step: Phase 1 (B)
- AC: AC-3403.1, AC-3403.2, AC-3403.3, AC-3403.4, AC-3403.5, AC-3403.6, AC-3405.2
- REQ: REQ-3403, REQ-3405
- Files: reception/www/memo.js, reception/www/board.js, reception/www/app.js, reception/www/style.css, reception/www/theme.css, reception/tests/memo.test.ts, reception/tests/board.test.ts, reception/tests/shell.test.ts, reception/tests/app.test.ts
- Tests: reception/tests/memo.test.ts, reception/tests/board.test.ts, reception/tests/shell.test.ts
- TDD: required

## TASK-7: 상세의 지난 진료기록부 여러 장 (화면)
- Step: Phase 1 (A, TASK-3 뒤)
- AC: AC-3404.3, AC-3404.4, AC-3404.5
- REQ: REQ-3404
- Files: reception/www/api.js, reception/www/detail.js, reception/www/charts.js, reception/www/app.js, reception/www/style.css, reception/tests/api.test.ts, reception/tests/detail.test.ts, reception/tests/charts.test.ts, reception/tests/app.test.ts, reception/tests/layout.test.ts, reception/tests/fixtures.ts
- Tests: reception/tests/detail.test.ts, reception/tests/api.test.ts, reception/tests/app.test.ts, reception/tests/layout.test.ts
- TDD: required

## TASK-8: 울타리 — memo.js의 localStorage만 예외
- Step: Phase 1 (B, TASK-6 뒤)
- AC: AC-3405.1
- REQ: REQ-3405
- Files: eslint.config.mjs, src/guardrails.test.ts
- Tests: src/guardrails.test.ts
- TDD: required

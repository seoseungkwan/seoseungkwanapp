# 작업 분할: 주사 차수 → 비트 접수메모(당일) 채우기

> Phase 1: TASK-1·2 병렬 → Phase 2: TASK-3 → Phase 3: TASK-4(doc-print와 한 zip, 마지막 검토 한 번). 같은 Phase 파일 겹침 없음. C#은 `PATH="$HOME/.dotnet:$PATH"`, dotnet 시험은 잠금으로 차례대로.

## TASK-1: Core 규칙·읽기·설정
- Phase: 1 · 병렬
- AC: AC-7501.1, AC-7501.2, AC-7501.3, AC-7501.4, AC-7501.5, AC-7502.1, AC-7503.1, AC-7503.3, AC-7504.1
- REQ: REQ-7501, REQ-7502, REQ-7503, REQ-7504
- Files: helper/src/Precheck.Core/InjectionMemo/**, helper/src/Precheck.Core/Bit/Sql.cs, helper/tests/Precheck.Core.Tests/InjectionMemo/**, helper/tests/injection-memo.dotnet.test.ts
- Tests: helper/tests/injection-memo.dotnet.test.ts
- TDD: required — design.md 이름표 그대로, 조사 초안 규칙을 옮김. 시험은 지어낸 글만(notes 모양 그대로), DB는 가짜 `IBitDb`

## TASK-2: 접수 화면 바탕
- Phase: 1 · 병렬
- AC: AC-7503.2
- REQ: REQ-7503
- Files: helper/src/Precheck.PtSlip/ReceptionWindows.cs, helper/src/Precheck.PtSlip/MemoTyper.cs, helper/src/Precheck.PtSlip/HotKeys.cs, helper/src/Precheck.PtSlip/MemoSettingsFile.cs
- Tests: (없음)
- TDD: exempt — Win32·UI Automation 얇은 층, Core InjectionMemo 타입을 쓰지 않는다. 이 PC 비트 접수 화면에서 칸 찾기·**테스트 환자로 저장 없이** 글 넣고 지우기로 확인. Release 빌드 경고 0

## TASK-3: 단추·알림·설정·잇기
- Phase: 2
- AC: AC-7503.2, AC-7503.3, AC-7504.1
- REQ: REQ-7503, REQ-7504
- Files: helper/src/Precheck.PtSlip/MemoButtonForm.cs, helper/src/Precheck.PtSlip/NoticeForm.cs, helper/src/Precheck.PtSlip/SettingsForm.cs, helper/src/Precheck.PtSlip/Program.cs
- Tests: (없음)
- TDD: exempt — WinForms·잇기, 판단은 Core. 시안 글자 그대로. 가짜 DB 사진 + 이 PC 접수 화면(테스트 환자, 저장 없음)으로 확인

## TASK-4: 빌드·zip·검토
- Phase: 3
- AC: AC-7503.2
- REQ: REQ-7503
- Files: helper/install/ptslip/**, specs/injection-memo/notes/**
- Tests: helper/tests/injection-memo.dotnet.test.ts
- TDD: exempt — doc-print와 한 Release x86 zip(읽어주세요.txt에 주사 차수 단추·F8 안내 더함). 마지막 검토 한 번

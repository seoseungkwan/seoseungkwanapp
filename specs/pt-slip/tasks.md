# 작업 분할: PT 후 진료 종이 뽑기

> Phase 1: TASK-1·2 병렬 → Phase 2: TASK-3 → Phase 3: TASK-4(빌드·zip·마지막 검토 한 번). 파일 겹침 없음. C#은 `PATH="$HOME/.dotnet:$PATH"`, dotnet 시험은 동시에 안 돌림.

## TASK-1: Core 규칙
- Phase: 1 · 병렬
- AC: AC-6401.1, AC-6401.2, AC-6401.3, AC-6402.1, AC-6402.2, AC-6402.3, AC-6402.4, AC-6403.1, AC-6403.2, AC-6403.3
- REQ: REQ-6401, REQ-6402, REQ-6403
- Files: helper/src/Precheck.Core/PtSlip/**, helper/src/Precheck.Core/Bit/Sql.cs, helper/tests/Precheck.Core.Tests/PtSlip/**, helper/tests/pt-slip.dotnet.test.ts
- Tests: helper/tests/pt-slip.dotnet.test.ts
- TDD: required — design.md 이름표 그대로. DB는 가짜 `IBitDb`. AC-6403.3은 `SlipButton`만

## TASK-2: 윈도우 바탕
- Phase: 1 · 병렬
- AC: AC-6403.4, AC-6403.5
- REQ: REQ-6403
- Files: helper/src/Precheck.PtSlip/Precheck.PtSlip.csproj, helper/src/Precheck.PtSlip/Program.cs, helper/src/Precheck.PtSlip/BitWindows.cs, helper/src/Precheck.PtSlip/SlipPrintJob.cs, helper/src/Precheck.PtSlip/Printers.cs, helper/src/Precheck.PtSlip/SettingsFile.cs, helper/Precheck.sln, helper/install/ptslip/**
- Tests: (없음)
- TDD: exempt — Win32·인쇄·파일을 감싸는 얇은 층(판단은 TASK-1). Core 타입을 쓰지 않는다. Release 빌드 경고 0 + `Microsoft Print to PDF`로 1장 만들어 봄

## TASK-3: 버튼·창·그리기
- Phase: 2
- AC: AC-6403.3, AC-6403.4
- REQ: REQ-6403
- Files: helper/src/Precheck.PtSlip/ButtonForm.cs, helper/src/Precheck.PtSlip/PickForm.cs, helper/src/Precheck.PtSlip/SettingsForm.cs, helper/src/Precheck.PtSlip/SlipDrawer.cs, helper/src/Precheck.PtSlip/NameSource.cs, helper/src/Precheck.PtSlip/Program.cs
- Tests: (없음)
- TDD: exempt — WinForms 화면·잇기, 판단은 Core. 시안 글자 그대로. 창 사진과 PDF 종이 1장(가짜 값)으로 확인

## TASK-4: 빌드·zip·검토
- Phase: 3
- AC: AC-6403.4, AC-6403.5
- REQ: REQ-6403
- Files: helper/install/ptslip/**
- Tests: helper/tests/pt-slip.dotnet.test.ts
- TDD: exempt — Release x86 빌드를 `PT후진료종이-설치-<날짜>.zip`으로 묶어 바탕화면 `서승관웹앱\설치파일`에(저장소에 안 넣음). 마지막 검토 한 번

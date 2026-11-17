# 작업 분할: PT 후 진료 종이 뽑기

> 형식: `## TASK-n: 제목` 아래에 `- Phase:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 고친다. TASK마다 일꾼 하나. MVP 최소안, 검토는 맨 마지막 한 번.
>
> | Phase | TASK | 하는 일 | 병렬 |
> |---|---|---|---|
> | 1 바탕 | TASK-1 | Core 규칙(설정·목록·고르기·이름 찾기·종이 배치·버튼 자리) + 시험 | 병렬 |
> | | TASK-2 | 윈도우 바탕(새 프로젝트·창 찾기·인쇄 보내기·설정 파일·설치 틀) | 병렬 |
> | 2 화면 | TASK-3 | 버튼·고르는 창·설정 창·그리기, 잇기 | 혼자 |
> | 3 마무리 | TASK-4 | Release 빌드·PDF 인쇄 확인·설치 zip·마지막 검토 | 혼자(메인) |
>
> - 파일 겹침: 없다. TASK-1은 `Precheck.Core`·`helper/tests`만, TASK-2는 `Precheck.PtSlip`(폼 빼고)·`Precheck.sln`·`helper/install/ptslip`만, TASK-3은 `Precheck.PtSlip`의 폼·그리기 파일만
> - C# 빌드·시험은 `PATH="$HOME/.dotnet:$PATH"`. dotnet 시험은 다른 일꾼과 동시에 돌리지 않는다(precheck-dotnet.lock)
> - 사용자 단계: zip을 접수 PC에 풀고 `설치.cmd` → [시험 1장]으로 종이 길이·버튼 자리 맞추기

## Phase 1 — 바탕 (둘 병렬)

## TASK-1: Core 규칙
- Phase: 1 · 병렬
- AC: AC-6401.1, AC-6401.2, AC-6401.3, AC-6401.4, AC-6402.1, AC-6402.2, AC-6402.3, AC-6402.4, AC-6402.5, AC-6403.1, AC-6403.2, AC-6403.3, AC-6404.1, AC-6404.2, AC-6404.3, AC-6405.1
- REQ: REQ-6401, REQ-6402, REQ-6403, REQ-6404, REQ-6405
- Files: helper/src/Precheck.Core/PtSlip/**, helper/src/Precheck.Core/Bit/Sql.cs, helper/tests/Precheck.Core.Tests/PtSlip/**, helper/tests/pt-slip.dotnet.test.ts
- Tests: helper/tests/pt-slip.dotnet.test.ts
- TDD: required — design.md 'Core'의 이름·모양 그대로 만든다(TASK-3이 그대로 쓴다). DB는 기존 시험의 가짜 `IBitDb`로 매개변수·문장·결과를 본다. AC-6405.1은 `SlipButton.IsBitProcess`·`Place`만 본다. `Sql.cs`에는 `SlipNames.Sql` 허용 줄만 더한다

## TASK-2: 윈도우 바탕
- Phase: 1 · 병렬
- AC: AC-6405.3, AC-6405.5
- REQ: REQ-6405
- Files: helper/src/Precheck.PtSlip/Precheck.PtSlip.csproj, helper/src/Precheck.PtSlip/Program.cs, helper/src/Precheck.PtSlip/BitWindows.cs, helper/src/Precheck.PtSlip/SlipPrintJob.cs, helper/src/Precheck.PtSlip/Printers.cs, helper/src/Precheck.PtSlip/SettingsFile.cs, helper/Precheck.sln, helper/install/ptslip/**
- Tests: (없음)
- TDD: exempt — Win32·인쇄 드라이버·파일 경로를 감싸는 얇은 층이라 단위 시험할 판단이 없다(판단은 TASK-1 Core). `dotnet build -c Release`가 경고 없이 되고, 이 PC에서 `SlipPrintJob.Send("Microsoft Print to PDF", 100, 60, 선 하나 그리기)`가 PDF를 만드는지 일꾼이 한 번 돌려 본다(그 시험 코드는 저장소에 넣지 않음). Core 타입을 쓰지 않는다(TASK-1과 동시라서): `BitWindows`는 `Func<string,bool>`, `SettingsFile`은 글만 읽고 쓴다

## Phase 2 — 화면 (Phase 1 합친 뒤)

## TASK-3: 버튼·고르는 창·설정 창·그리기
- Phase: 2 · 혼자
- AC: AC-6405.1, AC-6405.2, AC-6405.3, AC-6405.4
- REQ: REQ-6405
- Files: helper/src/Precheck.PtSlip/ButtonForm.cs, helper/src/Precheck.PtSlip/PickForm.cs, helper/src/Precheck.PtSlip/SettingsForm.cs, helper/src/Precheck.PtSlip/SlipDrawer.cs, helper/src/Precheck.PtSlip/NameSource.cs, helper/src/Precheck.PtSlip/Program.cs
- Tests: (없음)
- TDD: exempt — WinForms 화면과 잇기. 판단은 모두 TASK-1 Core를 부른다. 시안 글자 그대로. 확인은 Release 빌드 + 이 PC에서 실행해 창 사진(PNG, 가짜 값으로 띄운 상태)과 `Microsoft Print to PDF` 종이 1장(가짜 차트번호·이름 — 실제 환자 값 금지)

## Phase 3 — 마무리

## TASK-4: 빌드·zip·마지막 검토
- Phase: 3 · 혼자(메인 세션)
- AC: AC-6405.3, AC-6405.4, AC-6405.5
- REQ: REQ-6405
- Files: helper/install/ptslip/**
- Tests: helper/tests/pt-slip.dotnet.test.ts
- TDD: exempt — 묶기·검토 단계. Release x86 빌드 결과 + `helper/install/ptslip`을 scratchpad에서 zip(`PT후진료종이-설치-<날짜>.zip`, 저장소에 안 넣음)으로 묶어 바탕화면 `서승관웹앱\설치파일`에 둔다. 마지막 독립 검토 한 번

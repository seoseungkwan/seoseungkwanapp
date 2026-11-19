# 작업 분할: 환자 서류 한 번에 인쇄

> Phase 1: TASK-1·2 병렬 → Phase 2: TASK-3·4·5·6·7 병렬(TASK-4~7은 견본 PDF가 있어야 시작) → Phase 3: TASK-8(잇기 확인·실제 대조·빌드·zip·마지막 검토 한 번). 같은 Phase 안 파일 겹침 없음. C#은 `PATH="$HOME/.dotnet:$PATH"`, dotnet 시험은 잠금으로 차례대로.

## TASK-1: Core 바탕(설정·기록·찾기·기간·날짜·고르기·쪽 계획)
- Phase: 1 · 병렬
- AC: AC-7401.1, AC-7401.2, AC-7401.3, AC-7402.1, AC-7402.2, AC-7403.1, AC-7403.2, AC-7404.1, AC-7404.2, AC-7405.1
- REQ: REQ-7401, REQ-7402, REQ-7403, REQ-7404, REQ-7405
- Files: helper/src/Precheck.Core/DocPrint/**, helper/src/Precheck.Core/Bit/Sql.cs, helper/tests/Precheck.Core.Tests/DocPrint/*.cs, helper/tests/doc-print.dotnet.test.ts
- Tests: helper/tests/doc-print.dotnet.test.ts
- TDD: required — design.md 이름표 그대로, DB는 가짜 `IBitDb`. 서류 4종은 `IDocSource { DocKind Kind; IReadOnlyList<DocPage> Pages(IBitDb, DocContext) }` 빈 껍데기(`Docs/Receipt|Detail|RxCopy|Chart/<이름>Source.cs`·`<이름>Sql.cs` 빈 허용 목록)와 `DocSources.All`만 만들고, `DocContext`(차트번호·환자·고른 날짜·병원 정보·직인 그림·글자 폭 함수)와 병원 정보 읽기(AC-7405.1의 `HspMst`·직인)는 여기서. `DocSql`이 네 `<이름>Sql`을 모은다

## TASK-2: 윈도우 바탕
- Phase: 1 · 병렬
- AC: AC-7406.2, AC-7406.3
- REQ: REQ-7406
- Files: helper/src/Precheck.PtSlip/ButtonForm.cs, helper/src/Precheck.PtSlip/BitWindows.cs, helper/src/Precheck.PtSlip/SettingsForm.cs, helper/src/Precheck.PtSlip/DocPrintJob.cs, helper/src/Precheck.PtSlip/DocFiles.cs
- Tests: (없음)
- TDD: exempt — Win32·인쇄·파일 얇은 층, Core DocPrint 타입을 쓰지 않는다. [서류] 단추(누르면 사건만), `BitWindows.ReadChartTitle()`(`차트번호 :` 든 창 제목 글 하나, 저장 안 함), 설정 탭 셋(기존 칸 옮기기, `서류` 탭은 빈 판), `DocPrintJob.Send(printer, pageCount, Action<Graphics,int>)` A4 한 작업, `DocFiles`(doc-settings.json·doc-log.tsv 읽기/쓰기). Release 빌드 경고 0 + `Microsoft Print to PDF`로 3쪽 만들어 봄

## TASK-3: 서류 창·잇기
- Phase: 2 · 병렬
- AC: AC-7402.1, AC-7402.2, AC-7403.1, AC-7404.2, AC-7406.2, AC-7406.3
- REQ: REQ-7402, REQ-7403, REQ-7404, REQ-7406
- Files: helper/src/Precheck.PtSlip/DocForm.cs, helper/src/Precheck.PtSlip/PatientPickForm.cs, helper/src/Precheck.PtSlip/DocLogForm.cs, helper/src/Precheck.PtSlip/DocDrawer.cs, helper/src/Precheck.PtSlip/DocLoader.cs, helper/src/Precheck.PtSlip/SettingsForm.cs, helper/src/Precheck.PtSlip/ButtonForm.cs, helper/src/Precheck.PtSlip/Program.cs
- Tests: (없음)
- TDD: exempt — WinForms 화면·잇기, 판단은 Core. 시안 글자 그대로. `DocSources.All`로 쪽을 받아 `DocDrawer`(DocOp → Graphics)로 그림. 창 사진(가짜 DB)과 PDF로 확인

## TASK-4: 진료비 영수증
- Phase: 2 · 병렬
- AC: AC-7405.1, AC-7406.1
- REQ: REQ-7405, REQ-7406
- Files: helper/src/Precheck.Core/DocPrint/Docs/Receipt/**, helper/tests/Precheck.Core.Tests/DocPrint/Receipt/**, helper/tests/doc-print-receipt.dotnet.test.ts
- Tests: helper/tests/doc-print-receipt.dotnet.test.ts
- TDD: required — 견본 PDF의 영수증을 보고 날짜마다 한 장. `OrpInf`·`OdlInf`·`OrcInf`·`IncMst` 저장 값 그대로. 시험은 가짜 값으로 칸·글자 자리

## TASK-5: 진료비 세부내역서
- Phase: 2 · 병렬
- AC: AC-7405.1, AC-7406.1
- REQ: REQ-7405, REQ-7406
- Files: helper/src/Precheck.Core/DocPrint/Docs/Detail/**, helper/tests/Precheck.Core.Tests/DocPrint/Detail/**, helper/tests/doc-print-detail.dotnet.test.ts
- Tests: helper/tests/doc-print-detail.dotnet.test.ts
- TDD: required — 견본 PDF의 세부내역서(비트 기간 출력 모양). `OdrInf`(원외약 빼고) 저장 값 그대로

## TASK-6: 처방전 사본
- Phase: 2 · 병렬
- AC: AC-7405.1, AC-7406.1
- REQ: REQ-7405, REQ-7406
- Files: helper/src/Precheck.Core/DocPrint/Docs/RxCopy/**, helper/tests/Precheck.Core.Tests/DocPrint/RxCopy/**, helper/tests/doc-print-rx.dotnet.test.ts
- Tests: helper/tests/doc-print-rx.dotnet.test.ts
- TDD: required — 견본 PDF의 처방전 사본, 처방 있는 날만. `OutInf`·원외약 `OdrInf`

## TASK-7: 진료기록부
- Phase: 2 · 병렬
- AC: AC-7405.1, AC-7406.1
- REQ: REQ-7405, REQ-7406
- Files: helper/src/Precheck.Core/DocPrint/Docs/Chart/**, helper/tests/Precheck.Core.Tests/DocPrint/Chart/**, helper/tests/doc-print-chart.dotnet.test.ts
- Tests: helper/tests/doc-print-chart.dotnet.test.ts
- TDD: required — 견본 PDF의 진료기록부(내원내역·원외처방·수납내역, 날인 안내 글, 도장 그림 없음). `EmrInf`·`OicInf`·`OdrInf`·`OrpInf`

## TASK-8: 실제 대조·빌드·zip·검토
- Phase: 3
- AC: AC-7406.1, AC-7406.2
- REQ: REQ-7406
- Files: helper/install/ptslip/**, specs/doc-print/notes/**
- Tests: helper/tests/doc-print.dotnet.test.ts
- TDD: exempt — 이 PC에서 견본과 같은 환자·날짜를 PDF로 뽑아 금액·글자 대조(자료는 scratchpad, 저장소에 안 넣음, 결과 요약만 notes에). Release x86 빌드를 `PT후진료종이-설치-<날짜>-서류.zip`으로 `바탕화면\서승관웹앱\설치파일`에. 마지막 검토 한 번

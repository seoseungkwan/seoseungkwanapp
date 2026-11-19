# 설계: 환자 서류 한 번에 인쇄

## 개요
- 판단·자료·쪽 그리기 계획은 `Precheck.Core/DocPrint`(netstandard2.0, xUnit, 가짜 `IBitDb`). 윈도우 층은 `Precheck.PtSlip` 안에 얇게(창·단추·인쇄·파일)
- 비트 DB: PT 종이와 같은 길(`InstallationLocator` → `SqlBitConnector.Open` → `ReadOnlyGuard.Query`). 새 문장은 모두 `DocPrint/DocSql.cs` 한 곳, `Bit/Sql.cs`는 `IsAllowed`·`ParametersOf`에 `DocPrint.DocSql` 한 줄씩만 잇는다
- 설정은 PT 종이 `settings.json`과 따로 `%LOCALAPPDATA%\PtSlip\doc-settings.json`, 기록은 `doc-log.tsv`

## Core 이름표 (`Precheck.Core.DocPrint`, TASK-1이 만들고 뒤 TASK가 그대로 씀)
```csharp
enum DocKind { Receipt, Detail, RxCopy, Chart }                 // 인쇄 차례도 이 순서
DocNames.Of(DocKind) → "진료비 영수증"|"진료비 세부내역서"|"처방전 사본"|"진료기록부"
DocSettings(printerName, bundles) { static Defaults; }  DocBundle(name, kinds)
DocSettingsRules { BundleCheck Check(IReadOnlyList<DocBundle>); string ToJson(DocSettings); DocSettings FromJson(string?) }
DocLogLine(at, chart, name, kinds, from, to, pages) { string ToTsv(); static DocLogLine? Parse(string) }
DocLog { IReadOnlyList<DocLogLine> Recent(IEnumerable<string> lines, string? filter) }
CurrentChart.FromTitle(string?) → string?                        // "차트번호 :" 뒤 숫자, 앞 0 빼고 1~14자리
SearchInput.Parse(string?) → { SearchKind Kind(Empty/Chart/Name/Invalid); string Value }
PatientFinder.Find(IBitDb, SearchInput) → PatientResult { Kind(Found/Many/None/Failed); IReadOnlyList<PatientHit> Hits }
PatientHit(chart, name, birth8, sex, lastVisit8)
QuickRange.Of(QuickKind, DateTime today, DateTime? firstVisit) → (DateTime From, DateTime To)
VisitDays.Read(IBitDb, chart, from, to) → IReadOnlyList<VisitDay>   VisitDay(date, unpaid, hasRx, visitNums)
DocPicks { Apply(DocBundle); Toggle(DocKind); IsOn(DocKind); Kinds }
DocData.Read(IBitDb, chart, IReadOnlyList<VisitDay>) → DocBundleData   // 병원·환자·날짜별 Receipt/Detail/Rx/Chart 값, 직인 byte[]
DocPage { IReadOnlyList<DocOp> Ops }  DocOp = Text(xMm,yMm,wMm,hMm,text,pt,bold,align) | Line(x1,y1,x2,y2,widthMm) | Box(x,y,w,h,widthMm) | Image(x,y,w,h,key)
IDocLayout { DocKind Kind; IReadOnlyList<DocPage> Pages(DocBundleData data) }   // A4 210×297mm
DocPlan.Build(IReadOnlyList<IDocLayout>, DocBundleData, IReadOnlyCollection<DocKind>) → { Pages(서류 차례·날짜순), CountOf(DocKind), Total }
```
- `DocData`의 값 묶음 칸은 `notes/bit-docs.md` §1~6 칸 이름을 따른다. 금액은 저장된 값 그대로 `long`
- 레이아웃 4개(`Layouts/ReceiptLayout.cs` 등)는 TASK-3~6이 견본 PDF를 보고 만든다. 글자 폭 재기는 `Func<string,float,float> widthMm`를 받아 Core에서 줄 나눔(PT 종이 `SlipFitter`처럼)

## 윈도우 (`Precheck.PtSlip`)
- TASK-2: `ButtonForm`에 [서류] 단추(왼쪽, 같이 움직임), `BitWindows.ReadChartTitle()`(맨 앞 비트 창과 자식 창 제목 중 `차트번호 :` 든 글 → `CurrentChart`, 제목 저장 안 함), `DocForm`(시안 ②~⑤), `PatientPickForm`(동명이인), `SettingsForm` 탭 셋(기존 PT 종이 칸은 `PT 종이`·`단추 자리` 탭으로 옮기기만), `DocLogForm`, `DocSettingsFile`, `DocPrintJob.Send(printer, pages, Action<Graphics, DocPage>)`(A4 여러 쪽 한 작업, StandardPrintController), `DocDrawer`(DocOp → Graphics, 맑은 고딕, 직인 그림 key로)
- 자료 읽기는 백그라운드(0.3초 뒤), 실패 글은 시안 그대로

## 위험
- 금액 나눔이 8~10% 내원에서 항목 합과 다름 → 다시 셈하지 않고 비트 저장 값을 쓰고, 65세 정액·관리급여 도수·장애인기금 든 날 견본으로 대조
- '지금 환자'는 비트를 켜고 확인해야 함 → 못 읽으면 찾기 칸으로(기능은 그대로)
- 비트 양식은 코드로 그려 견본 PDF가 유일한 기준 → 견본 없이는 TASK-3~6을 시작하지 않는다

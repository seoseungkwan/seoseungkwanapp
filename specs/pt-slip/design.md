# 설계: PT 후 진료 종이 뽑기

## 개요
- 새 프로젝트 `helper/src/Precheck.PtSlip`(net48 WinExe **x86**, 어셈블리 `PtSlip`). 판단은 `Precheck.Core/PtSlip`(순수, xUnit), 윈도우는 얇게
- 비트 DB: 기존 `InstallationLocator` → `SqlBitConnector.Open` → `ReadOnlyGuard.Query`(새 문장은 `Sql.cs` 허용 목록에 `@cht` 문자 1~14로 더함)

## Core 이름표 (`Precheck.Core.PtSlip`, TASK-1이 만들고 TASK-3이 그대로 씀)
```csharp
SlipSettings(items, parts, printerName, paperLengthMm, buttonOffsetPx) { static Defaults }
SlipSettingsRules { SlipListParse ParseList(string text, SlipListKind kind); string ListText(list);
  bool IsPaperLength(int); bool IsButtonOffset(int); string ToJson(SlipSettings); SlipSettings FromJson(string?) }
SlipListParse { bool Ok; IReadOnlyList<string> Names; string Error }   // 오류 글: "{n}번째 줄은 1~10글자로 써 주세요" 등
ChartInput.Parse(string?) → { ChartKind Kind(Empty/Invalid/Ok); string Number }
SlipPicks { static Sides; ToggleItem; IsItemOn; PendingSide; ToggleSide; AddPart; RemovePart; Items; Parts; ItemsText; PartsText }
SlipNames { const Sql; NameResult Find(IBitDb, ChartInput); string Message(NameResult); bool CanPrint(NameResult) }
NameResult { NameKind Kind(Empty/Found/NotFound/Failed); string Name }
SlipLayout.Of(widthMm, lengthMm) → { SlipBox Table, Head; SlipBox[] Labels, Values }   // mm, 0 부위·1 항목·2 특이사항
SlipText.Of(chart, name, picks) / SlipText.Blank → { Head, Parts, Items, Note; static LabelTexts }
SlipFitter.Fit(text, boxW, boxH, maxPt, minPt, Func<string,float,float> widthMm) → { SizePt; Lines }   // 0.5pt씩, 줄 높이 = pt×1.2×0.3528mm
SlipButton { bool IsBitProcess(string?); (int X,int Y) Place(windowRight, windowTop, buttonWidth, offset) }
```
JSON: `{"items":[],"parts":[],"printer":"","paperMm":60,"buttonOffset":0}`

## 윈도우
- TASK-2: csproj·sln, `Program`(Mutex 하나만), `BitWindows`(맨 앞 창의 핸들·프로세스 이름·사각형·최소화, 판단은 `Func<string,bool>`), `SlipPrintJob.Send(printer, widthMm, lengthMm, Action<Graphics>)`(StandardPrintController, 이 문서 PaperSize만), `Printers`, `SettingsFile`(글 읽기/쓰기), `helper/install/ptslip/`(설치.cmd → `%LOCALAPPDATA%\PtSlip\app` 복사·시작프로그램 바로가기 `PT 후 진료 종이`·실행, 지우기.cmd, 읽어주세요.txt)
- TASK-3: `ButtonForm`(테두리 없는 맨 위 작은 창, 0.25초마다 자리 갱신), `PickForm`·`SettingsForm`(시안 ②~⑦), `SlipDrawer`(미리보기·인쇄 같은 함수, 맑은 고딕, 머리 16pt·값 14~8pt·이름표 11pt, 선 0.3mm), `NameSource`(0.3초 뒤 백그라운드로 이름 찾기)

## 위험
접수 PC 비트 창 모양·빅솔론 롤 길이는 의원 PC에서만 확인 → 설정의 버튼 자리·종이 길이·[시험 1장]으로 맞춤. 이 PC는 `Microsoft Print to PDF`로 확인

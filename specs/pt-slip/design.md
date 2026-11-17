# 설계: PT 후 진료 종이 뽑기

## 개요
- 새 PC 프로그램 `helper/src/Precheck.PtSlip`(net48, WinForms, **x86** — 비트 DLL이 32비트). 어셈블리 이름 `PtSlip`, 창 글은 한국어. 도우미 버전(Directory.Build.props)은 바꾸지 않는다
- 판단은 모두 `Precheck.Core/PtSlip`(netstandard2.0, 순수)에 두고 xUnit로 시험한다. 윈도우 부분(창 찾기·인쇄·폼)은 얇게 두고 빌드와 이 PC 실행으로 본다
- 비트 DB는 기존 `InstallationLocator` → `SqlBitConnector.Open` → `ReadOnlyGuard.Query`로 읽기만 한다(새 문장은 허용 목록에 더한다)

## 구성 요소 / 인터페이스

### Core (`helper/src/Precheck.Core/PtSlip/`, 네임스페이스 `Precheck.Core.PtSlip`) — TASK-1
```csharp
public sealed class SlipSettings {            // 바뀌지 않는 값
  public SlipSettings(IReadOnlyList<string> items, IReadOnlyList<string> parts, string printerName, int paperLengthMm, int buttonOffsetPx);
  public IReadOnlyList<string> Items { get; } public IReadOnlyList<string> Parts { get; }
  public string PrinterName { get; } public int PaperLengthMm { get; } public int ButtonOffsetPx { get; }
  public static SlipSettings Defaults { get; }  // AC-6401.1
}
public enum SlipListKind { Items, Parts }
public sealed class SlipListParse { public bool Ok; public IReadOnlyList<string> Names; public string Error; } // Error는 Ok면 ""
public static class SlipSettingsRules {
  public static SlipListParse ParseList(string text, SlipListKind kind);   // AC-6401.2
  public static string ListText(IReadOnlyList<string> names);             // 한 줄에 하나(\r\n)
  public static bool IsPaperLength(int mm); public static bool IsButtonOffset(int px);  // AC-6401.3
  public static string ToJson(SlipSettings s); public static SlipSettings FromJson(string? json); // AC-6401.4
}
public enum ChartKind { Empty, Invalid, Ok }
public sealed class ChartInput { public ChartKind Kind; public string Number; public static ChartInput Parse(string? text); } // AC-6402.1
public sealed class SlipPicks {                                            // AC-6402.2~4
  public static IReadOnlyList<string> Sides { get; }                       // 오른, 왼, 양
  public void ToggleItem(string name); public bool IsItemOn(string name);
  public string? PendingSide { get; } public void ToggleSide(string side);
  public void AddPart(string part); public void RemovePart(string label);
  public IReadOnlyList<string> Items { get; } public IReadOnlyList<string> Parts { get; }   // 들어간 차례
  public string ItemsText { get; } public string PartsText { get; }        // ", "로 잇기
}
public enum NameKind { Empty, Found, NotFound, Failed }
public sealed class NameResult { public NameKind Kind; public string Name; }
public static class SlipNames {                                            // AC-6402.5, AC-6403.*
  public const string Sql = "SELECT TOP 1 RTRIM(PbsPatNam) FROM dbo.PbsInf WHERE LTRIM(RTRIM(PbsChtNum))=@cht";
  public static NameResult Find(IBitDb db, ChartInput chart);              // Empty·Invalid는 DB에 안 감(Invalid → NotFound)
  public static string Message(NameResult r);  public static bool CanPrint(NameResult r);
}
public sealed class SlipBox { public float X, Y, W, H; }                  // mm
public sealed class SlipLayout {                                           // AC-6404.1
  public static SlipLayout Of(float widthMm, float lengthMm);
  public SlipBox Table, Head; public SlipBox[] Labels; public SlipBox[] Values;   // 0 치료부위 · 1 치료항목 · 2 특이사항
}
public sealed class SlipText {                                             // AC-6404.2
  public string Head, Parts, Items, Note;  public static readonly string[] LabelTexts = { "치료부위", "치료항목", "특이사항" };
  public static SlipText Of(string chart, string name, SlipPicks picks); public static SlipText Blank { get; }
}
public sealed class SlipFit { public float SizePt; public IReadOnlyList<string> Lines; }
public static class SlipFitter {                                           // AC-6404.3
  // widthMm(text, sizePt) = 그 글을 그 크기로 그린 폭(mm). 크기는 maxPt에서 0.5pt씩 줄인다. 줄 높이 = 크기 × 1.2 × 0.3528mm
  public static SlipFit Fit(string text, float boxWMm, float boxHMm, float maxPt, float minPt, Func<string, float, float> widthMm);
}
public static class SlipButton {                                           // AC-6405.1의 순수 부분
  public static bool IsBitProcess(string? processName);
  public static (int X, int Y) Place(int windowRight, int windowTop, int buttonWidth, int offsetPx); // x = right-150-buttonWidth-offset, y = top+4
}
```
- 목록 오류 글(AC-6401.2): `{n}번째 줄은 1~10글자로 써 주세요` · `{n}번째 줄에 쉼표(,)는 쓸 수 없어요` · `{n}번째 줄: 오른·왼·양은 부위 이름으로 쓸 수 없어요` · `1~16개까지 넣을 수 있어요`. 화면에서는 앞에 `치료 항목: `/`치료 부위: `를 붙인다
- 글자 수는 `string.Length`(UTF-16)로 센다. 이름 비교는 정확히 같은 글(대소문자 구분)
- JSON: `{"items":[…],"parts":[…],"printer":"","paperMm":60,"buttonOffset":0}`. 모르는 열쇠는 무시, 하나라도 규칙에 어긋나면 통째로 기본값
- `SlipNames.Sql`은 `Sql.cs` 허용 목록에 `@cht`(문자 1~14) 매개변수로 더한다. 시간 한도 5초

### 윈도우 (`helper/src/Precheck.PtSlip/`) — TASK-2(바탕), TASK-3(폼)
- TASK-2: `Precheck.PtSlip.csproj`(net48 WinExe x86, `UseWindowsForms` 대신 `System.Windows.Forms`·`System.Drawing` 참조, Core·Windows 참조, `Precheck.sln`에 더함), `Program.cs`(이름 있는 Mutex로 하나만, 폼은 TASK-3이 띄움 — TASK-2는 빈 `ApplicationContext` 자리만), `BitWindows.cs`(맨 앞 창 핸들·프로세스 이름·창 사각형·최소화 여부를 Win32로 읽기, 판단은 넘겨받은 `Func<string,bool>`), `SlipPrintJob.cs`(`Send(string printerName, int widthMm, int lengthMm, Action<Graphics> draw)`: `PrintDocument` + `StandardPrintController`, 이 문서의 `PaperSize`·여백 0만 정함, 못 보내면 예외), `Printers.cs`(설치된 프린터 이름 목록, 빈칸이면 `BIXOLON` 든 첫 이름), `SettingsFile.cs`(`%LOCALAPPDATA%\PtSlip\settings.json` 글 읽기/쓰기, 임시 파일에 쓴 뒤 바꾸기), `install/`(아래)
- TASK-3: `ButtonForm.cs`(테두리 없는 작은 맨 위 창, 작업 표시줄에 안 나옴, 0.25초마다 `BitWindows`로 자리·보임 갱신, 오른쪽 클릭 메뉴 `설정`·`끝내기`), `PickForm.cs`(시안 ②~⑤), `SettingsForm.cs`(시안 ⑦), `SlipDrawer.cs`(`SlipLayout`·`SlipText`·`SlipFitter`로 그리기 — 미리보기와 인쇄가 같은 함수, 선 0.3mm, 글꼴 맑은 고딕, 머리 최대 16pt·값 최대 14pt·최소 8pt·이름표 11pt), 이름 찾기는 칠 때 0.3초 뒤 백그라운드에서
- 설치 묶음(TASK-2가 틀, TASK-4가 zip): `helper/install/ptslip/설치.cmd`(빌드 결과를 `%LOCALAPPDATA%\PtSlip\app`에 복사, 시작프로그램에 바로가기 `PT 후 진료 종이`, 바로 실행), `지우기.cmd`, `읽어주세요.txt`(설치·설정·종이 길이 맞추기 쉬운 말)

## 데이터 흐름
[PT 먼저] → PickForm → 차트번호 → `ChartInput.Parse` → (0.3초 뒤) `SlipNames.Find`(비트 DB 읽기만) → 이름 → 항목·부위 → `SlipText.Of` → `SlipDrawer`(미리보기) → [뽑기] → `SlipPrintJob.Send`(같은 `SlipDrawer`) → 닫기. 설정만 PC 파일에 남는다. 환자 값은 어디에도 저장·로그하지 않는다

## 결정과 트레이드오프
- 새 프로그램 따로(사용자). 도우미와 같은 Core·Windows DLL을 같이 싣지만 버전·설치는 따로다
- 버튼 위치는 창 사각형 기준 고정 셈(비트 제목줄 모양을 모름) + 설정의 버튼 자리로 맞춘다
- 비트 창 판단은 프로세스 이름(기존 `LooksLikeDrBitProcess`와 같은 규칙)과 가로 600px 이상. 접수 화면 이름은 의원 PC에서 처음 확인한다
- 인쇄는 윈도우 드라이버(GDI). 빅솔론 SDK·ESC 명령을 쓰지 않는다(드라이버가 이미 깔려 쓰는 중)

## 위험 / 미해결 질문
- 접수 PC의 비트 창 이름·제목줄 높이, 빅솔론 드라이버의 이어진 롤 길이 처리는 의원 PC에서만 확인된다 → 설정의 버튼 자리·종이 길이와 [시험 1장]으로 맞춘다
- 이 개발 PC에는 빅솔론이 없다 → 인쇄 모양은 `Microsoft Print to PDF`로 확인한다

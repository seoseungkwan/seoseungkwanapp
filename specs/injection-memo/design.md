# 설계: 주사 차수 → 비트 접수메모(당일) 채우기

## 개요
- 판단은 `Precheck.Core/InjectionMemo`(netstandard2.0, xUnit, 가짜 `IBitDb`), 윈도우 층은 `Precheck.PtSlip` 안에 얇게. 규칙은 조사 초안(scratchpad `injmemo-eval/Rule.cs`, 여유 3일 반영)을 TDD로 옮긴다
- 비트 DB: PT 종이와 같은 길(`ReadOnlyGuard.Query`). 새 문장은 `InjectionMemo/InjectionSql.cs`, `Bit/Sql.cs`는 `IsAllowed`·`ParametersOf`에 한 줄씩 잇는다
- 화면 칸: 접수 화면(비트 접수 프로그램)의 차트번호 칸·'접수메모(당일)' 칸을 AutomationId(WinForms Name)로 찾는다(`notes/reception-fields.md`). 글 넣기는 청구 메모 도우미 `UChartAutomation`처럼 `EM_REPLACESEL`(칸 끝에 커서를 두고), 안 되면 ValuePattern

## Core 이름표 (`Precheck.Core.InjectionMemo`)
```csharp
enum MemoResultKind { Insert, NoRecord, Finished, TooEarly, AlreadyHas, NoPatient, Failed }
MemoResult { Kind; string Text /*넣을 글*/; string Append /*칸 끝에 칠 글('/' 포함)*/; DateTime? PlannedDate; int? UntilNumber }
MemoNotices.TypeFailed(string text) → string   // '넣지 못함' 알림(시안 글)
VisitNote(DateTime date, IReadOnlyList<string> symptomLines, string receptionMemo)
InjectionRule.Decide(IReadOnlyList<VisitNote> last30Days /*날짜순*/, DateTime today, int graceDays = 3) → MemoResult
MemoMerge.Merge(string current, string add) → (string Text, bool Skipped)   // '/'로 뒤에, 이미 주사 N차면 Skipped
InjectionReader.Read(IBitDb, string chart, DateTime today) → IReadOnlyList<VisitNote>   // 오늘 앞 30일, 오늘 내원 뺌
InjectionMemoService.Compute(IBitDb, string chart, string currentMemo, DateTime today) → MemoResult
MemoNotices.Of(MemoResult) → string   // 시안 글
MemoSettings(hotKey, buttonOffsetPx) { Defaults; IsAllowedKey; ToJson; FromJson }
```

## 윈도우 (`Precheck.PtSlip`)
- TASK-2: `ReceptionWindows`(맨 앞 창이 비트 접수 화면인지, 차트번호 칸 글·메모 칸 핸들·글·사각형 읽기, 칸 글은 저장·로그 안 함), `MemoTyper.Append(handle, text)`(끝으로 커서 → EM_REPLACESEL), `HotKeys`(RegisterHotKey/UnregisterHotKey, 접수 화면이 맨 앞일 때만 잡음), `MemoSettingsFile`
- TASK-2 결과(954cb686): 칸은 라벨 글로 찾음(AutomationId는 창 핸들 숫자라 못 씀). `MemoTyper.Append` → `Typed`·`NotEditable`·`TooLong`(50자 넘음)·`Blocked`(권한 다름, 오류 5)·`Failed` — Typed 밖은 모두 '넣지 못함' 알림
- 권한: 이 PC 비트(접수·BitAuth)는 관리자 권한 → 일반 권한 PtSlip의 넣기·단축키가 막힘. TASK-4 설치가 `schtasks /create /sc onlogon /rl highest`로 PtSlip을 높은 권한으로 켜는 예약 작업을 등록(설치 때 '예' 한 번), 옛 시작프로그램 바로가기는 지움. 지우기는 예약 작업도 지움
- TASK-3: `MemoButtonForm`(테두리 없는 작은 [주사 차수] 단추, 메모 칸 오른쪽에 0.25초마다 붙음), `NoticeForm`(2~3초 알림, 칸 옆), `SettingsForm` '단추 자리' 탭에 단축키·단추 자리 칸, `Program.cs` 잇기(백그라운드로 읽고 결과는 창 스레드로)

## 위험
- 접수 화면 칸 이름은 이 PC 비트 로그인 뒤 확인(접수 PC도 같은 판인지 의원에서 확인)
- 실제 비트에서 글 넣기 시험은 **테스트 환자로만, 저장하지 않고** 칸을 지운다
- 규칙 일치는 지난 30일 기준 번호 81%·글자 39% → 직원이 넣은 뒤 눈으로 보고 고친다(저장은 직원)

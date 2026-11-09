# 설계: 접수 현황 어레인지 탭

## 1. 개요
- 접수 현황(`PrecheckReception.exe`, 문 47200, reception-phone · reception-paper) 위에 쌓는다. 갈래 `feat-reception-arrange`는 `feat-reception-paper`(4288fa4, 다른 창의 작업, 아직 push 전)에서 갈라졌다. 그 갈래가 더 나아가면 합친다.
- 새 길은 셋뿐이다: `/api/board` 답에 `arrange`를 더하고, `POST /api/arrange`(표시 쓰기), `GET /api/visit/{k}/prev`(직전 기록부)를 더한다. 비트는 지금처럼 읽기 전용(`HospitalGate` → 읽기 전용 접속 → 되돌리는 트랜잭션 → 허용 목록 SELECT)이다. 쓰는 곳은 총괄 PC의 암호화 파일 둘(`reception-marks.dat` 그대로, 새 `reception-arrange.dat`)뿐이다.
- 칸 글·순서·단계 계산은 C#(`Precheck.Core`, netstandard2.0)에 두어 이 서버에서 `dotnet test`로 시험한다. 화면(`reception/www/`, 빌드 없는 JS 모듈)은 그리기·누르기·되돌리기 띠·알림만 한다.
- 모르는 값(X-RAY 코드, SONO·C-ARM 부위 칸)은 확인 명령에 단계 하나를 더해 받고(Phase 1), 그동안 나머지를 가짜 지도로 끝까지 만든다(Phase 2). 답이 오면 `ArrangeMap` 한 곳만 채운다(Phase 3).

## 2. 처방 → 칸 지도 (`Precheck.Core/Reception/ArrangeMap.cs`)
```csharp
public enum ArrangeCol { Xray, Sono, Carm, Pt, Ds, Eswt, Trac }        // JSON 이름 xray·sono·carm·pt·ds·eswt·trac
public sealed class ArrangeRule {                                      // 코드·이름 맞춤 하나 → 처방 칸(xray·sono·carm)
    public static ArrangeRule Code(string code, ArrangeCol col);       // 코드가 똑같음
    public static ArrangeRule CodeContains(string part, ArrangeCol col);
    public static ArrangeRule CodePattern(string regex, ArrangeCol col); // 예: ^G\d{4}$ (확인 뒤에만)
    public static ArrangeRule NameContains(string part, ArrangeCol col); // 코드 사전 이름
}
public static class ArrangeMap {
    public static IReadOnlyList<ArrangeRule> Rules { get; }            // 차례대로 처음 맞는 규칙 하나
    public static IReadOnlyCollection<ArrangeCol> ManualOnly { get; }  // Pt·Ds·Eswt·Trac: 처방을 보지 않는 직접 칸(사용자 결정)
    public static IReadOnlyCollection<ArrangeCol> Unconfirmed { get; } // 지금: Xray
    public static string? PartColumn { get; }                          // 지금 null
    public static ArrangeCol? Match(string code, string? name);
    public static IReadOnlyList<string> Validate(IReadOnlyList<ArrangeRule> rules, IReadOnlyCollection<ArrangeCol> unconfirmed);
}
```
- 확인 전 규칙(통계 도구 `StatsSql.TreatmentsSql`이 원본 도구에서 이미 쓰는 코드만): `Code("SONO1", Sono)`, `Code("CARM1", Carm)`. X-RAY 규칙은 확인 뒤에 채운다. PT·도수·충격파·견인은 사용자 결정으로 처방을 보지 않는 직접 칸이라 규칙이 없다(고르기 목록은 4절).
- 단계 이름(사용자 결정 2026-11-09): 안의 값 `todo`·`ready`·`done`은 화면 글 "준비"·"준비완료"·"✓ 완료(HH:MM)"다. 이 문서의 '끝남'은 `done`(완료)을 뜻한다.
- `Unconfirmed`는 규칙이 아직 없는 처방 칸(Xray)을 보고서·시험에 알리는 목록이다. `Validate`는 AC-3301.4.
- 같은 칸 모으기(AC-3301.3)는 `ArrangeBuilder`가 한다(지도는 줄 하나만 본다).
- `BoardBuilder`·`ArrangeBuilder`·확인 단계는 지도(규칙 목록)를 인자로 받는다. 시험은 가짜 지도(X-ray `^G\d{4}$`)로 Phase 2를 끝까지 증명한다.

## 3. 의원 PC 확인 한 단계 (`Reception/Check/`, Phase 1)
- `CheckRunner`: `Step("arrangeCodes", "10/11 어레인지 처방 코드를 세고 있어요.", ArrangeCodes)`를 빠르기 앞에 더하고 단계 글을 1/11~11/11로 바꾼다. `CheckRound` 4 → 5. 단계 시간 제한 30초(지금 단계들과 같은 `Timed`).
- `CheckSql.ArrangeCodes`(@from Char(12)·@to Char(12)·@hospital): 지난 30일 이 병원 외래 접수(`OcmPatTyp='O'`, `InHospital`)의 처방 줄(`RxRow`)을 코드(대문자)마다 `COUNT(DISTINCT o.OdrOcmNum) Visits, COUNT_BIG(*) Rows`, `ORDER BY Visits DESC`, `TOP 200`. 이름은 같은 실행에서 `ReceptionSql.RxNames`(코드 사전, 이미 허용됨)로 붙인다.
- `ProbeSql.OrderTextCount(schema, column)`: `SELECT COUNT_BIG(CASE WHEN LTRIM(RTRIM(o.[col]))<>'' THEN 1 END), COUNT(DISTINCT NULLIF(LTRIM(RTRIM(o.[col])),'')) FROM dbo.OdrInf o JOIN … WHERE 30일 · 병원 범위 · RxRow · UPPER(RTRIM(o.OdrCod)) IN ('SONO1','CARM1')`. 칸 이름은 같은 실행의 `TableColumns` 답(`OdrInf`의 char·varchar·nchar·nvarchar·text 칸)에 있고 `^[A-Za-z][A-Za-z0-9_]{0,63}$`일 때만 넣는다. `IsProbe`가 이 틀도 다시 풀어 확인한다. 확인 세션(`CheckBitDb`)만 이 틀을 받는다(도우미 `Sql.IsAllowed`는 받지 않음, AC-1401.9 그대로).
- 보고서 칸: `CheckField.RxCode(key, value)`(`^[0-9A-Za-z가-힣_]{1,16}$`, 아니면 `?`), `CheckField.RxName(key, value)`(`^[0-9A-Za-z가-힣 ()\[\]/.,·+\-%]{1,40}$`, 아니면 `?`). 칸 이름은 `ArrangeMap.Match`로 정한 JSON 이름(`xray`…) 또는 `-`. 줄 모양: `arrangeCode code=… name=… visits=… rows=… col=…`, `arrangePart column=OdrInf.X filled=… distinct=…`.

## 4. 고르기 목록 (화면·쓰기 검사가 같은 글을 쓴다)
| 칸 | 직접 넣기 `add`의 `v` | 칸 글 |
|---|---|---|
| xray | `X-ray 찍기` | "" |
| sono·carm | 부위 목록 + `부위는 나중에` | "" (부위는 `part`) |
| pt | `ICE`·`HP` | 그 글 |
| ds | `30분`·`50분` | 그 글 |
| eswt | `1부위`·`2부위`·`3부위`·`4부위` | 그 글 |
| trac | `목`·`허리` | 그 글 |
- 부위 목록(시안 그대로): 목·등·허리·오른 어깨·왼 어깨·양 어깨·팔꿈치·손목·고관절·오른 무릎·왼 무릎·양 무릎·발목·발바닥·기타.
- C#은 `ArrangeChoices`(같은 파일 `ArrangeMarks.cs` 안 정적 표), 화면은 `arrange.js`의 같은 표다. 시험이 두 표가 같은지 본다(화면 시험이 C# 파일 글을 읽어 견준다).

## 5. 비트 읽기 (`ReceptionSql.cs`, `BoardInput.cs`, `BoardReader.cs`)
| 상수 | 매개변수 | 칸 | 뜻 |
|---|---|---|---|
| `TodayOrderTimes` | `@from`·`@to`·`@hospital` | VisitId, RxCode, FirstAt(원값) | `TodayCte` 접수의 처방 줄(`RxRow`)을 내원·코드마다 `MIN(o.OdrDtm)` |
| `PrevPaperVisit` | `@chart VarChar(14)`·`@visit`·`@hospital` | Day, Room, Ins | 그 지난 내원의 날(yyyyMMdd)·진료실(`DepKorNam`)·보험(`InsCodNam`, `PaperVisit`과 같은 OUTER APPLY) |
| `PrevPaperSymptoms` | 같음 | Line | 그 내원의 EmrInf 'S' 줄 전부, `ORDER BY e.EmrShtSeq`(`PaperSymptoms`와 같음) |
| `PrevPaperDx` | 같음 | Code, Name, Pri | `PaperDx`와 같음 |
| `PrevPaperOrders` | 같음 | Code, Name, Qty, Tms, Day, OutCod | `PaperOrders`와 같음 |
- "그 내원" 조건: `c.OcmNum=@visit AND c.OcmChtNum=@chart AND c.OcmPatTyp='O' AND c.OcmRsuYon<>'O' AND c.OcmComStt IN (HistoryVisitsCte의 완료 코드) AND InHospital`. `@visit`의 형은 `OcmNum` 칸 형(`TableColumns` 확인 결과, `VisitSymptoms`가 쓰는 것과 같게)이다.
- 매개변수 표 `ReceptionSql.Parameters`에 더해 `Sql.IsAllowed`·`Sql.ParametersOf`가 받는다(지금 길).
- `OrderItem { Code, At("HH:MM", OdrDtm 앞 12글자의 시분), Part(string?) }`. `VisitRow`에 `Orders`(기본 빈 목록)를 생성자 끝 선택 인자로 더해 지금 시험·호출이 그대로 돈다.
- `BoardReader.Read`는 `TodayRx` 뒤에 `TodayOrderTimes`를 돌려 내원마다 묶는다. `ArrangeMap.PartColumn`이 null이면 부위 문장은 없다(AC-3303.2). 채우는 날(Phase 3)에 그 칸 하나의 상수 `TodayOrderParts`를 더한다.

## 6. 어레인지 표시 (`Precheck.Core/Reception/ArrangeMarks.cs`)
```csharp
public enum ArrangeStep { Todo, Ready, Done, Gone }
public sealed class CellMark { ArrangeStep St; bool Manual; string Det; string? Part; string? ReadyAt; string? DoneAt; string? AddedAt; }
public sealed class PtFirst { string St; /* "up"|"down" */ string At; }   // PT 먼저
public sealed class VisitMark { IReadOnlyDictionary<ArrangeCol, CellMark> Cells; string? Away; PtFirst? Ptf; string? EndedAt; bool Kept; /* 수납완료 줄을 다시 넣음(10-2) */ }
public sealed class ArrangeMarks {
    public ArrangeMarks(IStoreFolder folder, IProtector protector, Func<DateTime> now, Action<string>? report = null);
    public IReadOnlyDictionary<string, VisitMark> Today();             // 내원번호 → 표시
    public void Update(string visitId, Func<VisitMark?, VisitMark?> change); // 잠금 안에서 읽고 바꾸고 쓴다(null = 지움)
}
```
- 파일 `data\reception-arrange.dat`, 머리 `PRECHECK-STORE-1\n` + `IProtector`(윈도우 DPAPI CurrentUser). 임시 파일 → `File.Replace`, 잠금 하나, 1MB 한도, 날 바뀌면 비움, 모양 틀리면 빈 표시 + 오류 번호(`XrayMarks`와 같은 규칙. 두 파일은 따로 둔다: X-ray 표시는 지금 화면도 쓰고, 날짜·모양 규칙이 같아도 서로 깨뜨리지 않게).
- 글 칸은 4절 표의 글과 "HH:MM" 시각만 받는다(AC-3304.4). JSON 칸 이름: `cells`(칸 이름 → `{st, manual, det, part, readyAt, doneAt, addedAt}`), `away`, `endedAt`, 그리고 `kept`(참일 때만 `true`로 쓴다. 없으면 거짓 — 이 고침 전 판이 쓴 오늘 파일도 그대로 읽힌다, AC-3304.5).

## 7. 어레인지 자료 (`ArrangeBuilder.cs`, `BoardModel.cs`)
```csharp
public static class ArrangeBuilder {
    public static Arrange Build(BoardInput input, IReadOnlyDictionary<string, Lane> statuses, ISet<string> hiddenRsu,
                                IReadOnlyList<ArrangeRule> map, IReadOnlyDictionary<string, VisitMark> marks,
                                IReadOnlyDictionary<string, string> xray, VisitKeys keys); }
```
`/api/board` 답에 더하는 칸:
```json
"arrange": {
  "rows": [ { "k": "…16", "away": "10:50" | null, "ptf": { "st": "up|down", "at": "10:40" } | null, "last": "지난번 증상 글" | "",
              "cells": { "xray": Cell | null, "sono": Cell | null, "carm": …, "pt": …, "ds": …, "eswt": …, "trac": … },
              "allDone": false } ],
  "ended": [ { "k": "…16", "endedAt": "10:40", "paid": false },          // [치료 종료]
             { "k": "…17", "endedAt": "10:52" | null, "paid": true } ] }  // 수납완료로 저절로(10-2)
Cell = { "st": "todo|ready|done", "det": "HP", "part": "오른 어깨" | null, "at": "10:30", "ord": 1 | null, "manual": false }
```
- 칸 하나 만들기: ① 오늘 처방(`VisitRow.Orders`)을 `ArrangeMap.Match`로 처방 칸(xray·sono·carm)마다 모은다(가장 이른 시각, 첫 부위). 직접 칸(pt·ds·eswt·trac)은 처방을 보지 않는다 ② 표시가 `Gone`이면 칸 없음 ③ 표시가 있으면 단계·시각·부위·글을 덮는다(직접 넣은 칸은 표시만으로 생긴다: `at` = `AddedAt`) ④ X-RAY는 `xray`(XrayMarks)에 그 내원이 있으면 `done`·`at` = 그 시각(처방·표시가 없어도 칸이 생김, AC-3305.6). `at`은 단계에 따라 처방(넣은) 시각·`ReadyAt`·`DoneAt`.
- 순서(AC-3305.5): `rows`의 SONO·C-ARM 칸 가운데 todo·ready를 (처방 또는 넣은 시각, 접수 순)으로 줄 세워 1부터.
- `Board.ToJson(Arrange? arrange)`가 `"arrange"`를 쓴다(없으면 지금과 같음). 라우터만 `arrange`를 넘긴다.

## 8. 쓰기 길 (`Http/ReceptionRouter.cs`, `ArrangeWrite.cs`)
```csharp
public static class ArrangeWrite {
    public static bool TryParse(byte[] body, out ArrangeOp op);                      // AC-3306.1 모양
    public static WriteResult Apply(ArrangeOp op, VisitMark? current, ArrangeRowView row, string hhmm); // 새 표시 또는 400/404
}
```
- 라우터: `POST /api/arrange` → `ClientGuard.WriteOk`(403) → `TryParse`(400) → 그날 열쇠 + 오늘 판의 네 칸 줄(404) → 지금 판 자료로 그 줄의 칸 상태(`ArrangeBuilder`와 같은 계산) → `ArrangeWrite.Apply` → X-RAY 끝남·되돌리기는 `XrayMarks.Set`(AC-3306.4), 나머지는 `ArrangeMarks.Update` → 204. 화면은 204 뒤 바로 `/api/board`를 다시 읽는다(지금 X-ray와 같음).
- `op` 표: `step`(todo→ready(SONO·C-ARM)/done, ready→done) · `set` v=todo|ready|done(앞으로·뒤로 모두, 뒤로 가면 뒤 단계 시각을 지우고 ready로 갈 때 `ReadyAt`은 남김) · `add` v=4절 목록(빈 칸만, 아니면 400) · `remove`(직접 넣은 칸만 `Gone`이 아니라 표시 지움; 처방 칸은 400) · `part` v=부위 목록(SONO·C-ARM만) · `away` v=on|off · `ptf` v=up|down|off(PT 먼저: 시각은 서버, off는 지움) · `end` v=on|off(off는 수납완료 줄이면 `kept`도 남김, 10-2).
- 몸 256바이트 한도는 지금 `HttpRequestReader` 그대로(가장 긴 몸 `{"k":"…16","op":"part","col":"carm","v":"오른 무릎"}`도 안에 든다).
- 라우터 생성자에 `ArrangeMarks? arrangeMarks = null`, `IReadOnlyList<ArrangeRule>? arrangeMap = null`을 끝 선택 인자로 더한다(없으면 `/api/arrange`는 404, `arrange` 칸 없음 → 지금 라우터 시험 그대로). `Precheck.Reception/ReceptionServices.cs`가 진짜 저장소(`data\`)·DPAPI·`ArrangeMap.Rules`로 만든다.

## 9. 직전 기록부 (`PrevPaperReader.cs`, 라우터 `GET /api/visit/{k}/prev`)
- `PrevPaperReader.Read(IBitDb db, string hospitalScope, VisitRow visit, DateTime now, DateTime deadline) → PrevPaper?`: `visit.LastVisitId`가 없으면 null(비트 읽지 않음). 있으면 2절 문장 넷을 남은 시간 안에서 돌린다. 글 정리는 `RtfText.Tidy`·`PaperReader`와 같은 규칙.
- 답 `{"prev": null}` 또는 `{"prev": {"date":"2026-11-02","ago":"7일 전","room":"…","ins":"…","sym":"…","dx":[{code,name,main}],"rx":[{code,name,qty,tms,day}],"out":[…]}}`. `ago`는 `HistoryBuilder`의 "N일 전" 규칙.
- 라우터는 `TryHistoryKey`와 같은 모양으로 `/api/visit/{k}/prev`를 나누고, 질의 글이 있거나 열쇠가 틀리면 비트를 읽지 않고 404, 실패는 503(AC-3307.3). 등록 확인·연결은 `HistoryReader`와 같은 `BitServices` 길.

## 10. 화면 (`reception/www/`)
| 파일 | 바뀌는 것 |
|---|---|
| `theme.css` | `--sono-head:#F3DC8A; --sono-col:#FBF4D6; --carm-head:#9FDCC6; --carm-col:#E2F5EE; --ptup-bg:#F1EAFB; --ptup-fg:#6B21A8`(시안. PT 올라감 보라는 자리비움 주황·신환 파랑과 다르게) |
| `style.css` | 탭 단추, 어레인지 표·칸·고르기 창·되돌리기 띠·기록부 두 칸 모양(시안 `Arrange.html`, `var()`만) |
| `board.js` | 머리를 `topOf(board, view)`로 내보내 두 탭이 함께 쓴다. 제목 줄 아래 탭 단추 [접수 현황]·[어레인지 N명](`view.tab`, `view.onTab`) |
| `arrange.js` (새) | `renderArrange(host, board, view)`: 표·칸·고르기 창(`view.sheet`)·[오늘 치료 종료]·되돌리기 띠. 누르기는 `view.onCell(k, col)`·`onAdd`·`onPart`·`onAway`·`onEnd`·`onRestore`·`onChart`·`onUndo`로만 알린다. `CHOICES` 표(4절) |
| `charts.js` (새) | `renderCharts(host, row, today, prev, view)`: 기록부 화면 머리 + 오늘(`detail.js`의 `paperCard`) + 직전 카드(사람 칸 없음, 회색). 읽는 중·실패 한 줄 |
| `detail.js` | `paperCard`를 내보내고 직전 카드가 같은 부분(내원내역·증상·상병·처방·원외처방)을 쓰게 나눈다(모양 그대로) |
| `api.js` | `setArrange(k, op, col, v)`(POST, 204만 성공), `getPrev(k)`(모양 검사), `isBoard`가 `arrange` 모양(없으면 빈 것으로 받음)을 본다 |
| `alert.js` | `checkRx(board, info, on)`: 앞 읽기와 견주어 줄마다 `manual:false` 칸 수가 늘었는지(AC-3310.1~3). 알릴 줄 열쇠 목록을 돌려준다. 떨기·소리는 지금 `ring` |
| `app.js` | 해시 길 `#/a`·`#/a/v/{k}`, 탭 전환, 쓰기 보내기(낙관적 그리기 → 204면 `poll.readNow()`, 실패면 판 값으로 되그리기 + 띠, 칸마다 하나씩), 되돌리기 띠 5초, '처방 나옴' 기억(60초·누르면 지움), 기록부 열기(오늘 `history?from=0` + `prev` 한 번)·오늘 종이 다시 읽기(AC-1404.8 조건), 숨김·끊김 때 모두 지우기 |
- 상태(고른 탭, 옆으로 민 위치, 세로 위치, 열린 창, 띠, '처방 나옴' 열쇠와 시각, 기록부 자료)는 메모리에만 둔다. 숨김·끊김은 지금 `wipe`가 `#app`을 비울 때 이 상태도 함께 비운다.
- 칸 눌러 바로 그리기(낙관적): 화면이 다음 단계를 먼저 그리고, 답이 204가 아니면 마지막 판 값으로 되그린다(AC-3308.9). 같은 칸에 나가 있는 쓰기가 있으면 누름을 버린다(`xray.js`의 `pressing`과 같은 방식).
- 되돌리기: 띠의 [되돌리기]는 서버에 '앞 단계로 set'(칸), `away`/`end`의 반대(on↔off), `add`의 반대 `remove`, `part`의 반대(앞 부위로 `part`, 앞 부위가 없었으면 보내지 않고 띠에 되돌리기를 그리지 않음)를 보낸다.

### 10-1. 기다린 시간 (2026-11-09 사용자 요청, AC-3308.14·AC-3309.6)

- 서버는 고치지 않는다. 목록 줄(`/api/board`의 `lists`)에 이미 있는 `waited`(BoardBuilder `WaitedOf`의 글)와 `long`(진료대기·진료보류 60분 이상)을 같은 `k`로 찾아 그대로 쓴다. 그래서 목록 화면과 글·주황 기준이 늘 같다.
- 진료보류 줄은 목록 글 "보류 {시간}째"를 "{시간}째 대기"로 바꿔 쓴다(`waitText(list)` 하나, 시간 글은 목록 그대로라 숫자가 늘 같다). 이 모양이 아니면 목록 글 그대로 쓴다.
- `arrange.js` `awayOf`: 접수 시각 `span.t-time` 아래 `span.wt`(long이면 `wt is-long`). 자리비움 표시는 그 아래.
- `charts.js` 머리: "HH:MM 접수" 뒤 `·`와 `span.wt`(같은 규칙). 판이 새로 오면 머리를 다시 그린다(지금 `redrawChart` 그대로).
- 색은 새로 만들지 않는다: `.wt`는 `--ink-2`, `.wt.is-long`은 `--warn`(AC-3308.12의 새 색 여섯 그대로).
- 시안 `docs/mockups/reception-arrange/Arrange.html`에 같은 모양을 더했다(사용자 승인 받을 것).

### 10-2. 수납완료 줄 저절로 빼기 (2026-11-10 사용자 고침, AC-3304.5·AC-3305.10·AC-3306.7·AC-3308.15)

- 서버(`ArrangeBuilder.Build`): 줄마다 칸(`ReceptionMap.LaneOf`)을 본다. ① `EndedAt`이 있으면 지금처럼 `ended`(`paid: false`) ② 아니고 끝남 칸(수납완료)이며 `Kept`가 아니면 `ended`에 `{ endedAt: BoardBuilder.ClockOf(visit.PaidAt), paid: true }`(목록 줄 "HH:MM 수납"과 같은 계산, `ClockOf`를 internal로) ③ 나머지는 `rows`. `ended`는 `endedAt ?? ""`로 늦은 순(null은 맨 뒤). `ArrangeEnded(key, string? endedAt, bool paid)` — null은 `paid`일 때만.
- 쓰기(`ReceptionRouter` 어레인지 쓰기): 그 줄 칸 계산에 쓰는 표시를 `(mark ?? 빈 표시).WithEnded(null).WithKept(true)`로 열어 둔다(저절로 빠진 줄도 칸이 만들어져 다른 쓰기가 표에 있는 줄과 같게 돈다). `ArrangeWrite.Apply(…, bool paid)`에 그 접수가 지금 끝남 칸인지 넘기고, `end` off는 `paid`면 `WithEnded(null).WithKept(true)`, 아니면 `WithEnded(null)`. `end` on은 `WithEnded(hhmm)`만.
- 저장(`ArrangeMarks`): 내원 칸 넷 + `kept`(참일 때만). 읽을 때 칸 넷이거나(거짓) 다섯이고 `kept`가 JSON `true`여야 한다. `IsEmpty`는 `!Kept`도 본다(`kept`만 있는 표시를 지우지 않게).
- 화면: `api.js`의 `ended` 줄 검사에 `paid`(참·거짓·없음)와 null `endedAt`(`paid`일 때만)을 더한다. `arrange.js` `endedOf`의 시각 글: `paid`면 "HH:MM 수납"·"수납완료", 아니면 "HH:MM 종료". [치료 종료]의 바로 그리기 줄은 `paid: false`. 새 색·새 단추 없음.
- 시안 `Arrange.html`: 끝난 줄 하나를 수납완료로 빠진 줄("10:52 수납")로 바꾼다(사용자 승인 받을 것).

## 11. 데이터 흐름
```
[태블릿] 5초마다 GET /api/board ─→ Router → BoardCache(비트 SELECT: TodayVisits·TodayRx·TodayOrderTimes·…)
                                      └→ BoardBuilder(lists) + ArrangeBuilder(ArrangeMap·ArrangeMarks·XrayMarks) → JSON
[태블릿] 칸 누름 → POST /api/arrange {k,op,col,v} → ArrangeWrite → ArrangeMarks(data\reception-arrange.dat, DPAPI)
                                                          └ X-RAY 끝남 → XrayMarks(data\reception-marks.dat) → 204 → 다시 GET /api/board
[태블릿] 성함 누름 → GET /api/visit/{k}/history?from=0 (오늘 종이) + GET /api/visit/{k}/prev (직전 종이)
웹사이트·Supabase·Claude API: 아무것도 가지 않는다
```

## 12. 결정과 트레이드오프
- **`/api/board`에 더한다(새 읽기 길 없음).** 태블릿은 이미 5초마다 판을 읽고, 이름·메모·상태는 판 줄에 있다. 어레인지 줄은 열쇠로 그 줄을 가리키고 칸만 더한다. 답이 조금 커지지만(하루 수십 줄) 비트 읽기는 문장 하나(`TodayOrderTimes`)만 는다.
- **표시는 서버에, 단계 계산은 C#에.** 여러 기기가 같은 표를 보므로 표시는 총괄 PC 한 곳에 둔다. 처방과 표시를 합치는 규칙(순서·끝남·X-ray 함께 쓰기)은 C# 시험으로 증명한다.
- **X-RAY 끝남 = 지금 'X-ray 완료'.** 한 환자의 엑스레이가 두 군데에서 다르게 보이지 않게 같은 파일을 쓴다. 지금 진료보류 줄의 [X-ray 완료]·[표시 취소]도 그대로 돈다.
- **되돌리기는 반대 쓰기.** 서버에 '되돌리기 기록'을 두지 않고 화면이 앞 값을 알고 반대 `op`를 보낸다. 5초 안에 다른 기기가 같은 칸을 바꿨으면 마지막 쓰기가 이긴다(한 사람이 쓰는 표라 드물다).
- **'처방 나옴'은 화면이 판을 견주어 정한다.** 서버는 칸만 주고, 화면이 앞 읽기와 견준다(새 접수 알림과 같은 길). 그래서 처음 열 때·끊김 뒤에는 알리지 않는다.
- **수납완료 줄은 저절로 빠진다(2026-11-10 고침).** 처음엔 "자동으로 빼지 않음"이었으나 사용자가 바꿨다("수납 완료되면 자동으로 그 목록에서 없애 주고 싶은데", 남은 칸이 있어도 바로 — "남은 치료 없을 때만"을 권했으나 사용자가 "수납완료면 바로"를 골랐다). 수납 먼저 하고 치료받는 환자는 [오늘 치료 종료]에서 [다시 넣기]로 되살리고, 그러면 그날은 다시 빠지지 않는다. 수납 전 줄은 지금처럼 끝난 칸이 모두 끝나면 [치료 종료] 단추만 노랗게 해 알려 준다.
- **직전 기록부는 따로 길.** 오늘 종이(`history?from=0`)는 30초마다 다시 읽히므로, 바뀌지 않는 직전 종이를 거기 넣으면 비트 읽기가 쓸데없이 는다. 기록부를 열 때 한 번만 읽는다.
- **확인 전에는 아는 코드만.** X-ray를 `G`로 시작하는 코드로 두는 것은 그럴듯하지만 이 의원 비트에서 본 적이 없다. 보고서 한 번으로 정하고 그 전에는 비워 둔다(그동안 X-RAY 칸은 직접 넣는다).
- **PT·도수·충격파·견인은 직접 칸.** 사용자 결정(2026-11-09). 처방 코드·30/50분·부위 수를 비트에서 찾지 않아도 되어 확인 단계와 지도가 작아진다.
- **부위는 처음엔 직접 고르기.** 비트에 부위 칸이 있는지 모른다. 보고서의 부위 칸 숫자가 근거를 주면 `PartColumn`을 채운다(명세 변경 없이 Phase 3 TASK 안에서, 근거가 없으면 비워 둠).

## 13. 의원 PC에서만 확인하는 것
- AC-3302.6 확인 명령의 새 단계가 진짜 비트에서 돌고 보고서가 나온다
- AC-3311.3 하루 써 보고 종이 어레인지 표와 같다
- 태블릿에서 표가 한눈에 보이는지·누르는 곳 크기(사진으로 사용자에게 보인다), 처방 나옴 떨림·소리(AC-1408.5와 같은 기기)

## 14. 위험 / 미해결 질문
- 비트가 처방을 언제 `OdrInf`에 쓰는지(진료 중 저장 전에는 없음) → '처방 나옴'이 진료 끝보다 늦을 수 있다. 확인 보고서 2회차의 '처방 있는 접수 수'(상태별)로 보면 진료보류·수납대기에서 처방이 있었다.
- `feat-reception-paper`가 더 바뀌면 합칠 때 `board.js`·`detail.js`·`app.js`·`style.css`가 부딪힐 수 있다. 이 갈래는 그 파일의 지금 모양을 바꾸지 않고 더하기만 한다(머리 탭, `paperCard` 내보내기).
- 접수 현황 새 판(zip)을 의원 PC에 까는 때·판 번호는 부모 세션이 사용자 OK 뒤 정한다(도우미 릴리스와 따로, TASK-35 zip 길).

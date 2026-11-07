# 설계: 접수 현황 상세를 종이 진료기록부 모양으로 + 특이사항

## 1. 개요
- 상세 읽기(`HistoryReader.Get`, from=0)에서 종이 자료 문장 다섯 개를 더 돌려 `VisitHistory`에 `Paper`를 붙이고, JSON `paper`로 보낸다. 화면(`detail.js`)은 오늘 카드 자리에 종이 카드를 그린다.
- 비트 칸은 2026-11-07 의원 PC에서 확인했다(값은 보지 않고 칸·형·개수만, 시험 환자 하나로 순서 대조): 특이사항은 `PbsCmtInf.PbsSpcCmt`(text, 환자마다 한 줄, 모두 RTF), 주소는 `PbsDtlAdr`(본 주소) + `PbsAdrSta`(동·호 같은 뒷부분), 주민번호 `PbsResNum` 앞 6자리는 생년월일과 같고 뒤는 숫자가 아니다, 원외처방은 `OdrOutCod='XX'`(교부번호 있음), 주상병은 `OicIcdPri='1'`, 증상은 EmrInf 'S' 줄마다 한 줄(빈 줄 있음, RTF 아님, EmrShtSeq 순).

## 2. 답 모양 (`GET /api/visit/{k}/history?from=0`에 더함)
```
"paper": {
  "res": "730101-*******" | "",   "addr": string, "tel": string, "cel": string,
  "special": string,               // RTF → 보통 글, 줄 바꿈 "\n"
  "room": string, "ins": string,   // "1진료실", "국민건강보험"
  "sym": string,                   // "\n"으로 이은 증상
  "dx":  [ { "code": string, "name": string, "main": boolean } ],
  "rx":  [ { "code": string, "name": string, "qty": string, "tms": string, "day": string } ],
  "out": [ 같은 모양 ]
}
```
- 차트번호·이름·나이·성별·신환/재진·상태는 화면이 가진 목록 줄을 쓴다(답에 다시 넣지 않는다). from>0 답에는 `paper`가 없다.

## 3. 구성 요소
- `Precheck.Core/Reception/RtfText.cs` — `public static string RtfText.ToPlain(string? text)`(AC-1501.3)와 `public static string RtfText.Tidy(string? text)`(줄 정리만: CRLF→LF, 줄 끝 공백, 빈 줄 묶기, 앞뒤 빈 줄; AC-1501.5도 씀). cp949는 `System.Text.Encoding.CodePages`의 `CodePagesEncodingProvider`를 한 번 등록해 얻는다(net48에서도 같은 길).
- `Precheck.Core/Reception/ReceptionSql.cs` — 새 상수 다섯(매개변수 표 포함):
  - `PaperPerson`(@chart): PbsInf p LEFT JOIN PbsCmtInf s ON s.PbsChtNum=p.PbsChtNum WHERE p.PbsChtNum=@chart → `LEFT(p.PbsResNum,6) ResFront, RTRIM(p.PbsDtlAdr), RTRIM(p.PbsAdrSta), RTRIM(p.PbsPhnNum), RTRIM(p.PbsCelPhn), CAST(s.PbsSpcCmt AS varchar(max))`
  - `PaperVisit`(@chart,@before,@hospital): 그 접수 c의 DepKorNam(접수 날 유효한 DepMst 줄, 병원 범위)과 OUTER APPLY TOP 1 InsCodNam(InsAdpDte ≤ 접수 날, 늦은 순)
  - `PaperSymptoms`(@chart,@before,@hospital): 그 접수의 EmrInf 'S' 줄 전부(빈 줄 포함) `ORDER BY e.EmrShtSeq`
  - `PaperDx`(@chart,@before,@hospital): OicInf `ORDER BY x.OicSeq` → OicElcCod, OicIcdNam, OicIcdPri
  - `PaperOrders`(@chart,@before,@hospital): OdrInf o(RxRow) `ORDER BY o.OdrSeq` → OdrCod, OdrCodNam, OdrQty, OdrTms, OdrDay, OdrOutCod
  - "그 접수"는 `VisitSymptoms`의 오늘 쪽과 같은 조건(c.OcmChtNum=@chart AND c.OcmAcpDtm=@before AND c.OcmPatTyp='O' AND InHospital).
- `Precheck.Core/Reception/PaperReader.cs` — `PaperRecord`(2절 칸) · `PaperReader.Read(IBitDb db, string hospitalScope, VisitRow visit, BoardInput board, Func<DateTime> clock, DateTime deadline) → PaperRecord`(다섯 문장, 남은 시간 안에서, 칸 모자라면 읽기 실패) · `PaperRecord.WriteJson(Utf8JsonWriter)`.
- `HistoryReader` — from==0일 때만 `PaperReader.Read`를 같은 deadline으로 부르고 `HistoryInput`/`VisitHistory`에 `Paper`(nullable)를 싣는다. `VisitHistory.ToJson`은 Paper가 있으면 `"paper"`를 쓴다.
- 화면 `reception/www/detail.js` — `paperCard(row, paper, options)`(목업 Paper.html 그대로, `el()`만), `renderDetail`·`detailPane`이 오늘 카드 대신 그린다. `updatePaper(host, k, paper)`가 `updateTodaySym`을 대신한다(펼침 상태 지킴). `app.js`는 AC-1404.8 다시 읽기 답을 `updatePaper`로 넘긴다. `api.js` `isHistory`는 from=0 답의 `paper` 모양을 본다. 모양은 `style.css`(색은 theme.css 토큰만).

## 4. 결정과 트레이드오프
- 주민번호는 SQL에서 `LEFT(…,6)`만 읽는다(뒤 글자는 도우미 메모리에도 오지 않는다).
- 특이사항 RTF는 Windows RichTextBox 대신 Core에서 직접 푼다(Core는 netstandard2.0, 서버 시험이 돌게). 2026-11-07 의원 PC의 RichTextBox 결과와 몇 줄 견주어 본다(값은 보지 않고 같은지만).
- 처방 이름은 그날 비트가 처방 줄에 적은 OdrCodNam을 쓴다(종이와 같다). 용법 칸은 비어 있어 뺀다(목업).
- 비트 종이 인쇄는 용량 칸이 한 줄 밀려 찍힌다(시험 환자로 확인). 화면은 DB 값을 쓴다.

## 5. 위험 / 미해결 질문
- 상세 읽기 문장이 셋에서 여덟로 는다. 한 환자·한 접수만 읽고 색인 칸(차트번호·내원번호)으로 견주므로 8초 안이라고 본다. 의원 PC에서 확인한다.

# 설계: 비트 읽기 속도: 첫 내원 연결 조건 한 가지 바꾸기

## 개요
- `FirstVisits`의 연결 조건 `NULLIF(RTRIM(c.OcmChtNum),'')=p.PatientId`를 `c.OcmChtNum=p.PatientId`로 바꾼다. 다른 글자는 그대로다
- 옛 글은 칸에 함수를 씌워 색인 `ocminf_chtpatcomacp(OcmChtNum,OcmPatTyp,OcmComStt,OcmAcpDtm)`을 찾기에 쓸 수 없다. 새 글은 쓸 수 있다

## 구성 요소 / 인터페이스
- `helper/src/Precheck.Core/Stats/StatsSql.cs`: 공용 `Visits` 글과 `PatientsSql`의 연결 조건 두 곳. `Visits`를 쓰는 `VisitRowsSql`·`PatientDaysSql`·`VisitSummarySql`·`VisitDaysSql`이 함께 바뀐다
- `helper/src/Precheck.Core/Revenue/RevenueSql.cs`: `Patients`의 연결 조건 한 곳. `StatsSql.PatientsSql`과 글자까지 같아야 하므로 함께 바꾼다
- 두 파일 머리의 설명 주석: "공백만 다르다"가 거짓이 되지 않게 이 한 가지 예외를 적는다. 문장은 아니다
- 공개 시그니처, 매개변수 표, 시간 제한은 바뀌지 않는다

## 숫자가 같아야 하는 이유
- `p.PatientId`는 그 자리에서 NULL도 빈 글도 아니다. `Patients`가 `WHERE PatientId IS NOT NULL`로 NULL을 거르고, `NULLIF(RTRIM(c.OcmChtNum),'')`가 빈 글을 NULL로 바꿨다
- SQL Server는 char·varchar의 `=`에서 끝 공백을 무시한다. 칸은 `char(14)`이고 콜레이션은 어디서나 같다. 그래서 `c.OcmChtNum=p.PatientId`와 `RTRIM(c.OcmChtNum)=p.PatientId`는 같은 줄에서 참이다
- 빈 차트번호 줄은 옛 글에서 NULL이라 연결되지 않았고, 새 글에서는 빈 글이 아닌 `p.PatientId`와 같지 않아 연결되지 않는다. 차트번호가 NULL인 줄은 양쪽 다 연결되지 않는다

## 확인한 것과 아직 확인하지 못한 것
- 확인함(실측): `FirstVisits` 조각 하나를 실제 의원 DB에서 한 번 돌려 시간이 374,641 ms → 1,392 ms, 논리 읽기가 1,010만 → 19.1만이 되었고, 줄 수가 1,967로 같았다
- 그 비교는 **실행 한 번의 줄 수만** 본 것이다. 줄마다 값이 같은지는 보지 않았다. 다른 다섯 문장의 새 시간은 재지 않았다
- 진짜 비교는 **아직 남은 의원 숫자 대조**다. 이 변경이 맞다는 최종 근거는 그 대조이고, 이 저장소의 시험은 글자만 증명한다
- 이 서버에는 SQL Server와 윈도우 net48이 없다. 시험은 net10.0에서 글과 매개변수 표만 본다

## 시험
- `helper/tests/Precheck.Core.Tests/BitReadSpeed/BitReadSpeedSql.test.cs`
  - `FirstVisitJoin`: 옛 글·새 글 상수와 `ApplyTo(file, original)`. 다섯 사본은 옛 글이 정확히 한 번, 그 밖의 사본은 없음을 확인한 뒤 그 글만 바꾼다
  - `BitReadSpeedSqlTests`: AC-1001.1·2·4
- `StatsSql.test.cs`·`RevenueSql.test.cs`의 사본 대조는 지우거나 느슨하게 하지 않고, 기대값만 `FirstVisitJoin.ApplyTo`를 지난 사본으로 바꾼다(AC-1001.3). 이름의 앞쪽 AC ID는 두어 기존 감싸개가 그대로 찾는다
- `helper/tests/bit-read-speed.dotnet.test.ts`: `runDotnet('SqlTests')` 한 번으로 세 시험 묶음을 돌린다. AC마다 그 AC ID가 붙은 시험이 돌았고 실패가 없는지 본다
- `stats-rows.dotnet.test.ts`·`stats-report.dotnet.test.ts`·`revenue-read.dotnet.test.ts`: "공백만 다르다"는 시험 제목에 이 예외와 `AC-1001.3`을 덧붙인다. 하는 일은 바뀌지 않는다

## 결정과 트레이드오프
- 왜 연결 조건만: 근거가 있는 곳이 이것뿐이다. `RTRIM`을 없애는 일도 인덱스를 더하는 일도 하지 않는다
- 왜 사본을 안 고치나: 사본은 원본의 증거다. 고치면 원본 대조의 뜻이 없어진다. 바꿈 한 가지를 시험 코드에 이름 붙여 둔다
- 지난 명세의 "공백만 다르다"는 고치지 않는다. 승인 기록이 무효가 되므로 이 명세가 좁은 예외임을 적어 둔다

## 위험
- 숫자가 어긋나면: 커밋 하나만 되돌리면 옛 글로 돌아간다. 저장된 자료나 DB는 바뀌지 않는다(읽기 전용 SELECT뿐)
- `StatsSql.PatientsSql`과 `RevenueSql.Patients`가 어긋나면 `Sql.ParametersOf`가 다른 표를 답하게 된다. AC-1001.4와 기존 시험이 막는다

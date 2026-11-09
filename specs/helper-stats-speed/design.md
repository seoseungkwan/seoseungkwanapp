# 설계: 도우미 통계 읽기 속도 — 첫 내원 잇기 한 번만 계산 (도우미 0.5.1)

## 개요
- `helper/src/Precheck.Core/Stats/StatsSql.cs`의 세 문장 `PatientDaysSql`·`VisitSummarySql`·`VisitDaysSql`에서 `LEFT JOIN FirstVisits`를 `LEFT HASH JOIN FirstVisits`로 바꾼다. 다른 글자는 그대로다
- 공용 `Visits` 글(`PeriodVisits`·`Patients`·`FirstVisits`)은 고치지 않는다. 그래서 `VisitRowsSql`·`VisitLinesSql`·`PeopleSql`은 그대로다
- 도우미 판 0.5.0 → 0.5.1, 웹 `LATEST_HELPER`도 같은 커밋에서 0.5.1(`handshake.test.ts`가 맞춰 봄). `MIN_HELPER` 0.3.0·`LIST_HELPER` 0.5.0 그대로

## 왜 느렸나 (실측으로 본 모양)
- 비트 DB는 SQL Server 2008 R2 Express(호환 수준 90). 세 문장에서 최적화기가 `FirstVisits`를 기간 접수 줄마다 다시 계산하는 차례를 고른 것으로 보인다(`FirstVisits`가 다시 `Patients` = 기간 접수 전체의 DISTINCT를 읽음). 그래서 시간이 접수 수의 제곱으로 는다: 69일 21초, 161일 111초, 253일 269초
- 같은 `FirstVisits`를 잇는 `VisitRowsSql`은 처방 표를 먼저 이어 다른 차례를 골라 2년 5초다

## 왜 해시 잇기인가
- `HASH` 잇기 힌트는 `FirstVisits`를 한 번 만들어 표로 들고 잇게 한다. 결과의 뜻(어느 줄이 나오는가)은 SQL 정의상 바뀌지 않는다. 힌트는 차례만 정한다
- 힌트가 붙으면 그 문장 안 잇기 차례가 글 순서로 고정된다. 세 문장은 글 순서가 `PeriodVisits`(또는 `Patients`) → `FirstVisits`이고, `FirstVisits` 안은 `Patients` → `OcmInf`(색인 `ocminf_chtpatcomacp` 찾기)라 그 차례가 원래 원하는 차례다. 2년 실측으로 확인했다
- 다른 후보: `OPTION (HASH JOIN)`은 `FirstVisits` 안의 색인 찾기까지 해시로 바꿔 비트 접수 표 전체를 훑을 수 있다. `OUTER APPLY`로 다시 쓰기는 글을 많이 바꿔 원본 대조가 어렵다. `OPTION (RECOMPILE)`은 차례를 보장하지 않는다. 그래서 낱말 하나 바꾸기를 고른다
- 문장은 여전히 매개변수를 받는 SELECT 하나다. `HASH`는 쓰기·실행 낱말이 아니라 관문(`ReadOnlyGuard`)·허용 목록 규칙은 그대로 지난다

## 실측 (2026-11-09, 이 PC에서 의원 비트 DB에 읽기 전용, 거래는 되돌림, 값은 출력하지 않고 줄 수·결과 지문(SHA-256 앞 12자)·시간만)
| 문장 | 2026-10-01~31 옛 글 | 같은 범위 새 글 | 지문 | 2024-12-01~2026-11-08 새 글 |
|---|---|---|---|---|
| PatientDays | 5.1초, 2,068줄 | 0.2초, 2,068줄 | 같음 | 1.7초, 46,781줄 |
| VisitSummary | 6.5초, 1줄 | 0.3초, 1줄 | 같음 | 1.7초 |
| VisitDays | 4.9초, 26줄 | 0.2초, 26줄 | 같음 | 1.2초, 580줄 |
- 실측 도구: 세션 작업 폴더의 `sql-try`(저장소 밖). 2년 옛 글은 다시 돌리지 않았다(진료 시간 DB 부하, 지난 진단에서 실패 확인)
- 구현 뒤 확인: 새 `Precheck.Core.dll`로 지난 진단 도구(`BitReadDiag full real`)를 2년 범위에 한 번 돌려 `stats.rows` 전체가 오류 없이 끝나는지·걸린 시간을 본다(이 서버 시험이 아니라 손 확인, 결과는 보고에 적는다)

## 구성 요소 / 인터페이스
- `StatsSql.cs`: 세 문장의 잇기 낱말, 머리 설명 주석(원본 대조 예외에 이 바꿈을 적음)
- 공개 시그니처·매개변수 표·시간 제한·응답 모양은 바뀌지 않는다. 웹 Worker·화면은 그대로다

## 시험
- 새 `helper/tests/Precheck.Core.Tests/HelperStatsSpeed/HelperStatsSpeedSql.test.cs`(`HelperStatsSpeedSqlTests`): AC-3401.1·2·4. 사본 바꿈 도우미 `FirstVisitHash.ApplyTo(file, text)`(두 사본만 `LEFT JOIN FirstVisits` 정확히 한 번, 그 글만 바꿈)
- `StatsSql.test.cs`: 사본 대조는 지우거나 느슨하게 하지 않는다. 두 사본의 기대값만 `FirstVisitJoin.ApplyTo` 뒤 `FirstVisitHash.ApplyTo`를 지난 글로, 접수 줄 SELECT 상수만 `LEFT HASH JOIN`으로 바꾸고, 시험 이름에 `AC-3401.3`을 덧붙인다
- `src/components/dashboard/live/visitBasis.test.ts` AC-602.3 SQL 글 시험: 기대 글만 `LEFT HASH JOIN`으로(하는 일은 같음)
- 감싸개 `helper/tests/helper-stats-speed.dotnet.test.ts`: `runDotnet('SqlTests')` 한 번, AC마다 그 ID가 붙은 시험이 돌았고 실패가 없는지 본다
- 판: `handshake.test.ts`(지금 판 0.5.1, AC-2802.5는 `LIST_HELPER ≤ LATEST_HELPER`로), `client.test.ts` hello 판, `input-wiring.dotnet.test.ts` AC-035.7

## 결정과 트레이드오프
- AC-2802.5 시험 `LATEST_HELPER = LIST_HELPER`는 0.5.0을 내보낼 때의 조건이었다. 뜻("최신 도우미를 깔면 두 도구가 열린다")은 `LIST ≤ LATEST`로 그대로 지키고 같다는 조건만 푼다(좁은 예외)
- `PatientsSql`·`RevenueSql.Patients`도 같은 모양 잇기가 있지만 하루·한 달만 읽고 둘이 글자까지 같아야 해서 이번엔 두지 않는다

## 위험
- 숫자가 어긋나면: 커밋 하나 되돌리면 옛 글. 저장된 자료·DB는 바뀌지 않는다(읽기 전용 SELECT뿐)
- 해시 잇기는 `FirstVisits`(기간 환자 수만큼, 2년 약 1만 명대)를 메모리에 든다. 2년 실측 1~2초라 문제없다
- 옆 갈래 `feat-reception-arrange`도 도우미를 바꾼다(그 갈래는 0.4.0 바탕). 둘이 운영에 합쳐질 때 판 번호는 더 높은 쪽으로 다시 맞춘다

# 요구사항: 비트 읽기 속도: 첫 내원 연결 조건 한 가지 바꾸기

> 기능 ID: `bit-read-speed` · 형식: 요구사항은 `### REQ-001: 제목`, 수용 기준은 `- AC-001.1: Given/When/Then`.
> 각 AC 는 테스트 하나 이상으로 검증되어야 하며, 테스트 이름에 AC ID 를 넣는다.

## 배경 / 목표
- 의원 PC의 비트 DB(SQL Server 2008 R2 Express, 호환 수준 90)에서 100일 범위로 실측했다
- `FirstVisits` 원문: 374,641 ms, 논리 읽기 1,010만, CPU를 쓰는 시간이고 잠금 대기는 없다
- 같은 조각의 연결 조건만 `c.OcmChtNum=p.PatientId`로 바꾸면: 1,392 ms, 논리 읽기 19.1만, 줄 수는 같은 1,967이다. 이 줄 수 비교는 실제 실행 한 번에서만 했다
- 느린 문장은 모두 이 연결 조건을 갖고 있다: `VisitRowsSql` 374초, `PatientDaysSql` 309초, `VisitSummarySql` 164초, `VisitDaysSql` 311초, `PatientsSql` 하루 약 4.3초. 나머지는 모두 5초 아래다
- 목표: 도우미의 문장에서 그 연결 조건 글 하나만 바꾼다. 숫자가 같아야 하는 이유와 아직 확인하지 못한 것은 `design.md`에 적는다
- 이 변경은 stats AC-503.2·AC-504.4·AC-503.5와 revenue AC-003.1의 "원본 사본과 공백만 다르다"의 좁은 예외다. 그 밖의 원본 대조는 그대로다

## 요구사항

### REQ-1001: 첫 내원을 찾는 연결 조건을 색인을 쓸 수 있는 글로 바꾼다
- AC-1001.1: Given 도우미가 허용하는 모든 문장(`Sql.All`, `StatsSql.All`, `RevenueSql.Parameters`의 문장), When 공백을 뺀 글을 대소문자 구분 없이 보면, Then `NULLIF(RTRIM(c.OcmChtNum),'')`가 `=`의 어느 쪽에도 없고, 옛 연결 조건을 넣은 글은 `Sql.IsAllowed`가 거절한다
- AC-1001.2: Given 여섯 문장(`StatsSql`의 `VisitRowsSql`·`PatientDaysSql`·`VisitSummarySql`·`VisitDaysSql`·`PatientsSql`, `RevenueSql.Patients`), When 공백을 한 칸으로 줄인 글을 보면, Then `JOIN dbo.OcmInf c ON c.OcmChtNum=p.PatientId`가 정확히 한 번 있고, `PatientId`를 계산하는 `NULLIF(RTRIM(c.OcmChtNum),'') PatientId`와 `SELECT DISTINCT PatientId FROM PeriodVisits WHERE PatientId IS NOT NULL`도 정확히 한 번씩 그대로 있다
- AC-1001.3: Given 원본 사본(`original-sql/*.sql`, 고치지 않음)에서 옛 연결 조건이 있는 다섯 사본(`rx-visit-split-summary.sql`, `rx-visit-split-days.sql`, `rx-visit-split-visits-rows.sql`, `report-patients.sql`, `patients.sql`)은 옛 글이 정확히 한 번, 다른 사본은 한 번도 없을 때, When 그 글 하나만 새 글로 바꾼 사본과 상수를 견주면, Then 상수는 지금까지 허용한 차이(공백, 끝 `;`, `--` 줄, 진료 줄의 처방 코드 한 덩어리, 접수 줄의 새 SELECT)만 다르다
- AC-1001.4: Given 여섯 문장, When 매개변수 표를 보면, Then 세 표(`StatsSql`의 진료 네 문장, `StatsSql.PatientsSql`, `RevenueSql.Patients`) 모두 `@from:Char(12) @to:Char(12) @hospital:VarChar(32)`이고 `Sql.ParametersOf`도 같으며, 이 값으로 `ReadOnlyGuard`를 지나고, `StatsSql.PatientsSql`과 `RevenueSql.Patients`는 글자까지 같다

## 범위 밖
- 여섯 문장의 다른 글: `PatientId` 계산의 `NULLIF(RTRIM(...))`, `FirstVisits`의 다른 거르기 조건, 칸 순서
- 시간 제한, 화면 문구, 버전 번호, 색인 추가, 다른 문장의 속도
- 원본 사본(`original-sql/*.sql`)과 지난 명세 문서 고치기
- 실제 SQL Server에서 돌려 보는 일, 의원 숫자 대조, 깃허브 올리기·합치기·배포 (이 서버에서 할 수 없거나 부모 세션이 사용자 말에 따라 한다)

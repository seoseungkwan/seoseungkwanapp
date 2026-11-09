# 요구사항: 도우미 통계 읽기 속도 — 첫 내원 잇기 한 번만 계산 (도우미 0.5.1)

> 기능 ID: `helper-stats-speed` · 형식: 요구사항은 `### REQ-001: 제목`, 수용 기준은 `- AC-001.1: Given/When/Then`.
> 각 AC 는 테스트 하나 이상으로 검증되어야 하며, 테스트 이름에 AC ID 를 넣는다.

## 배경 / 목표
- 2026-11-09 의원 PC에서 통계 [비트에서 불러오기] '최근 2년'(2024-12-01~)이 첫 요청에서 바로 `E-BIT-READ-FAILED`. 1년·전체 기간도 같고, '지금 보는 기간'(두 달 남짓)은 된다. 이번 '불러올 기간' 기능 전부터 있던 '최근 12개월'도 같은 이유로 실패했을 것이다
- 원인(이 PC의 비트 DB에 읽기 전용으로 붙어 잼, 값은 보지 않음): 도우미 SQL 시간 제한(150초) 초과. 값 모양 문제 아님. `StatsSql`의 `PatientDaysSql`·`VisitSummarySql`·`VisitDaysSql` 세 문장이 `LEFT JOIN FirstVisits`에서 기간 접수 수의 제곱으로 느려진다: 69일 21초, 161일 111초, 253일 269초 → 약 185일을 넘으면 실패. 같은 `FirstVisits`를 잇는 `VisitRowsSql`은 2년 5초
- 같은 길(`stats.rows`)을 쓰는 대시보드도 긴 기간에서 자체 한도(180초)를 넘을 수 있다
- 고칠 방법 실측(이 PC, 같은 DB): 세 문장의 잇기만 `LEFT HASH JOIN`으로 바꾸면 2026-10 한 달 결과가 옛 글과 줄마다 같고(결과 지문 동일) 0.2~0.3초(옛 글 4.9~6.5초), 2024-12-01~2026-11-08은 1.7초·1.7초·1.2초
- 목표: 세 문장의 잇기 낱말 하나만 바꾸고, 도우미 판을 0.5.1로 올린다

## 요구사항

### REQ-3401: 세 문장은 첫 내원 표를 해시 잇기로 한 번만 만든다
- AC-3401.1: Given `StatsSql`의 `PatientDaysSql`·`VisitSummarySql`·`VisitDaysSql`, When 공백을 한 칸으로 줄인 글을 보면, Then `LEFT HASH JOIN FirstVisits f ON f.PatientId=`가 정확히 한 번 있고, 힌트 없는 `LEFT JOIN FirstVisits`는 없으며, `OPTION`·`;`·`--`는 없다
- AC-3401.2: Given 그 밖의 비트 문장(`VisitRowsSql`·`PatientsSql`·`VisitLinesSql`·`PeopleSql`, `RevenueSql.Patients`, 청구 `Sql.All`), When 글을 보면, Then `HASH` 낱말이 없다(이번에 바꾸지 않는다)
- AC-3401.3: Given 원본 사본 `rx-visit-split-summary.sql`·`rx-visit-split-days.sql`(고치지 않음), When AC-1001.3의 바꿈 뒤에 `LEFT JOIN FirstVisits`(사본마다 정확히 한 번) 하나만 `LEFT HASH JOIN FirstVisits`로 바꾼 글과 상수를 견주면, Then 공백만 다르다. 접수 줄 SQL(`PatientDaysSql`)은 그 바꾼 Visits 부분 뒤에 잇기만 `LEFT HASH JOIN`인 정해 둔 SELECT를 이은 글이다
- AC-3401.4: Given 세 문장, When 매개변수 표와 관문을 보면, Then 셋 다 `@from:Char(12) @to:Char(12) @hospital:VarChar(32)`이고 `StatsSql.IsAllowed`·`ReadOnlyGuard.Require`를 지나며, 청구 `Sql.All`에는 없다

### REQ-3402: 도우미 판 0.5.1
- AC-3402.1: Given `helper/Directory.Build.props`와 `src/lib/bridge/versions.ts`, When 판을 보면, Then 도우미 Version = `LATEST_HELPER` = `0.5.1`이고, `MIN_HELPER`는 `0.3.0`, `LIST_HELPER`는 `0.5.0` 그대로이며 `LIST_HELPER ≤ LATEST_HELPER`다(최신 도우미를 깔면 명단 두 도구가 열린다)
- AC-3402.2: Given 판을 글자로 박아 둔 지금 시험(`client.test.ts` hello = 최신이라 알림 없음, `input-wiring.dotnet.test.ts` AC-035.7), When 돌리면, Then 0.5.1로 통과한다

## 범위 밖
- 시간 제한(150초·180초·웹 20분), 나눠 읽기 조각 크기(`loadPlan.ts`), 화면·문구
- `PatientsSql`·`RevenueSql.Patients`(하루·한 달만 읽음, 둘은 글자까지 같아야 함)와 다른 문장의 속도
- 색인 추가, 원본 사본·지난 명세 고치기
- 깃허브 올리기·태그(판 만들기)·합치기·웹 배포·의원 PC 설치: 사용자가 말할 때만

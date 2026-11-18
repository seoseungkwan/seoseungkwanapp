# 설계: 신환은 비트 접수 표시로 세기 (new-mark)

## 한 줄
신환 판단을 '첫 내원일 = 그날'에서 '그날 센 접수에 내원 구분 `'1'`(신환)이 있음'으로 바꾼다. 첫 내원일(FirstVisits)은 지우지 않는다 —
자료 검사(첫 내원 못 찾음·진료 줄과 접수 줄 대조)는 지금 그대로 첫 내원일로 한다. 바뀌는 것은 "신환이냐"를 정하는 자리뿐이다.

## 도우미 (helper/src/Precheck.Core)

### Stats (TASK-1)
- `StatsSql.PatientDaysSql`: 다섯째 칸 뒤에 `,SUM(CASE WHEN o.OcmDgsNfs='1' THEN 1 ELSE 0 END) NewMark` 한 칸. 나머지 글자 그대로(원본 사본과 견주지 않는 새 문장).
- `StatsPatientDay`에 `long NewMark`, `StatsRows.Read`가 `Cell(row, 5)`를 읽는다.
- `StatsPayload.Version = 5`, patientDays 줄은 여섯 칸 `[chart, day, receptions, first, first90, newMark]`.
- `StatsSql.PatientsSql`(보고) 둘째 칸(신환)만 바꾼다:
  `(SELECT COUNT_BIG(*) FROM FirstVisits WHERE FirstDtm>=@from)` →
  `(SELECT COUNT_BIG(DISTINCT v.PatientId) FROM PeriodVisits v JOIN dbo.OcmInf o ON o.OcmNum=v.VisitId WHERE v.PatientId IS NOT NULL AND o.OcmDgsNfs='1')`.
  매출 `RevenueSql.Patients`와 글자가 같아야 한다(지금 시험 `sharedWithRevenue`) → 같은 바꾸기를 TASK-2가 매출 쪽에 한다.
  원본 사본(`original-sql/report-patients.sql`)은 고치지 않고, 견주는 시험이 이 한 군데 바꾸기를 알려진 예외로 사본에 적용한 뒤 견준다(첫 내원 연결 조건 예외와 같은 방식).

### Revenue · Sunap (TASK-2)
- `RevenueSql.Patients` 둘째 칸: 위와 같은 글자. 원본 사본 `Revenue/original-sql/patients.sql` 견주기도 같은 예외. `RevenueDays`는 그대로(칸 모양 같음).
- `SunapSql.PatientsSql` 끝에 `,SUM(CASE WHEN c.OcmDgsNfs='1' THEN 1 ELSE 0 END) NewMark` 한 칸(일곱째). `SunapTargets`는 일곱 칸을 읽고
  `kind = NewMark > 0 ? "new" : First90 > 0 ? "d90" : "re"`. 넷째 칸(첫 내원일)은 읽기만 하고 종류에 쓰지 않는다.

## 웹 (src/workers/stats, TASK-3)
- `helperData.ts`
  - `v`: 2 | 3 | 4 | 5. v5 열쇠 목록은 v3·v4와 같다. `checkPatientDays`: v4는 다섯 칸, v5는 여섯 칸이고 여섯째는 0 이상 그 줄 접수 수 이하 정수(아니면 `bad()`).
  - 타입 `patientDays` 줄에 `newMark?: number`.
  - `toPatientDays`: v5면 `firstVisit = newMark > 0`, 아니면 지금처럼 `first === day`.
  - `toConsumptionRows`: v5면 그 (차트, 날)이 신환 날인지(접수 줄에서 만든 모음)로 `firstVisit`. 아니면 지금 그대로.
  - `toVisitRows`: v5면 `f = 신환 날 ? d : ''`(rxVisitSplit은 `f === d`만 본다), 아니면 지금 그대로.
  - `toFirstVisits`: v5면 환자 → 가장 이른 신환 날(없으면 넣지 않음), 아니면 지금 그대로. doctorStats·patientMix는 `first.get(p) === d`라 그대로 맞는다.
  - 신환 날 모음은 한 곳(`newDays(data)`: v5일 때만 Set<`chart|day`>, 아니면 null)에서 만들어 위 넷이 같이 쓴다.
- `jobs.ts`: `memory.days`의 `newPatients`는 v5면 그날 신환 날인 접수 줄 수로 바꿔 넣는다(VisitDaysSql 값 대신). v2~v4는 지금 그대로.
- aggregate·dashboard·화면은 고치지 않는다(이미 `firstVisit`·`first90`만 본다).

## 순서와 배포
1. 도우미 새 판(0.11.0)과 웹을 같이 낸다. 옛 웹은 v5를 받지 못하므로 **웹 배포 → 도우미 릴리스·설치 파일 올리기** 순서다.
   새 웹은 옛 도우미(v4)도 받으므로 두 병원이 새 도우미를 깔기 전에도 지금처럼 돈다.
2. 우리 의원·다른 병원 모두 새 도우미를 깔고 [비트에서 다시 읽기]·통계 다시 불러오기를 하면 새 셈이 된다.

## 결정과 트레이드오프
- 첫 내원일 칸을 남겨 둔 까닭: 자료 검사(첫 내원 못 찾음·대조)를 건드리지 않으려고. 신환 판단만 옮긴다.
- 한 환자가 기간 안 두 날 신환 표시면 두 날 다 신환이다(비트 화면과 같다). `toFirstVisits`만 가장 이른 날 하나를 쓴다(원장님별·환자 구성은 한 환자 한 번).
- 직원이 내원 구분을 잘못 고르면 웹 숫자도 따라간다 — 비트 화면과 같게 하는 것이 목적이다.

## 위험
- 우리 의원 2026-11-18 확인: 그날 센 접수 33건에서 '첫 내원일 = 그날' 2명과 '1' 표시 2명이 같은 사람이었다. 지난 날에 다를 수는 있다(직원 선택).
- 원본 사본 견주기 시험 두 개에 예외가 하나씩 는다. 예외 글은 시험 안 상수 한 곳에 둔다.

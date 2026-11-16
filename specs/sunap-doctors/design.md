# 설계: 수납일지·통계 원장님별 표

## 흐름
- 수납일지 하루: 도우미(0.9.0) 답 `v:2` → 수납일지 Worker가 장부 줄에 `doctor`를 싣고 `ledgerDoctors`로 셈 → `ledger` 메시지의 `doctors` → `SunapScreen`이 `DoctorTable`을 그림
- 통계: 통계 Worker가 이미 가진 접수 줄(`extra.visits`, 진료의 `doc`)·이름(`extra.doctors`)과 `patientDays`·`consumption`으로 `sunapDoctors` → 답 `sunapDoctors` → `SunapSection`이 `DoctorTable`을 그림. **도우미를 바꾸지 않아도 된다**
- 서버(Supabase)에는 아무것도 더하지 않는다. 원장님 이름·수는 화면에서만 보인다(환자 정보 아님)

## 시안과 다른 곳
- 시안 hint '처방한 원장님 기준' → '접수할 때 정한 진료의 기준'. 기존 통계 '원장님별'(환자 수 = 접수 진료의 `OcmDtrCod`)과 같은 기준이고, 통계 쪽은 도우미를 안 바꿔도 된다
- 시안 통계 제목 '원장님별 · 11월 1일 ~ 16일' → '원장님별'(기간은 통계 화면 위에 이미 있음)
- 시안 이름 '김○○ 원장' → 비트 이름 그대로('원장'을 붙이지 않음)

## 타입 (`src/types/sunap.ts`)
```ts
export type SunapReplyRowV2 = [...SunapReplyRow, doctor: string | null]
export type SunapReplyDoctor = [code: string, name: string | null]
export type SunapReply =
  | { v: 1; day: string; unsure: boolean; rows: SunapReplyRow[]; paid: SunapReplyPaid[] }
  | { v: 2; day: string; unsure: boolean; rows: SunapReplyRowV2[]; paid: SunapReplyPaid[]; doctors: SunapReplyDoctor[] }
// LedgerRow에 doctor: string | null, Ledger에 doctors: SunapReplyDoctor[] (v:1이면 null·[])
export type DoctorRates = { code: string | null; label: string; rates: SunapRates }
export type DoctorBreakdown = { rows: DoctorRates[]; total: SunapRates }
```
- 통계 `BitSectionsView` ready에 `sunapDoctors?: DoctorBreakdown | null`(`src/types/stats.ts`)

## 셈 (환자 자료 구역)
- `src/lib/analytics/sunapRates.ts`: 한 줄을 아홉 칸에 더하는 작은 함수(`addVisit(rates, kind, block, pt)`)와 빈 값 `emptyRates()`를 내보내고 `sunapRates`·`sunapDoctors`가 같이 쓴다. `sunapDoctors`는 `visits`(`VisitLine` `p`·`d`·`doc`)에서 (환자, 날) → 가장 작은 코드 표를 만든다. 접수 줄이 없는 (환자, 날)은 null(미지정)
- `src/lib/sunap/ledger.ts`: `ledgerDoctors(ledger)` — 장부 줄(`kind`·`block`·`pt`·`doctor`)로 같은 `addVisit`. 이름은 `ledger.doctors`
- 이름·차례 규칙은 `doctorStats`(`NO_DOCTOR = '진료의 미지정'`)와 같다: 이름 → 코드 → 미지정, 내원 많은 차례·같으면 이름 차례
- 두 분 이상 = null 아닌 코드가 둘 이상

## 도우미 (0.9.0)
- `Sunap/SunapSql.cs` `PatientsSql` SELECT에 `MIN(NULLIF(RTRIM(c.OcmDtrCod),'')) DoctorId` 한 칸(같은 `GROUP BY v.PatientId`)
- `Sunap/SunapTargets.cs`: `Version = 2`, 줄 끝 칸 doctor, 맨 위 `doctors` = 줄에 나온 코드의 이름. 이름은 `StatsRows.DoctorNames`(지금 private)를 `internal`로만 바꿔 그대로 부른다(새 SQL 없음, `StatsSql.DoctorNamesSql`은 이미 허용 목록에 있음). 코드 40자 넘으면 기존처럼 `E-BIT-READ-FAILED`
- `helper/Directory.Build.props` 0.9.0, `src/lib/bridge/versions.ts` `LATEST_HELPER = '0.9.0'`(번호 박힌 시험은 숫자만)

## 수납일지 Worker·화면
- `src/workers/sunap/read.ts`: `v` 1·2 받기. 2면 줄 11칸·`doctors` 검사(코드 글자 1~40자, 이름 null 또는 1~40자, 줄 코드가 목록에 있음)
- `src/workers/sunap/handler.ts`: `ledger` 메시지에 `doctors: DoctorBreakdown | null`
- `src/components/sunap/DoctorTable.tsx`: props `{ data: DoctorBreakdown; hint: string }`. 모양은 시안 `.dr` 표(가로 스크롤 안, 최소 너비 860px), 수 옆 작은 비율(`sunapPct`), 끝 줄 합계. 앱 토큰·`classes.ts`
- `SunapScreen.tsx`: 장부 칸 아래·지출 위에 `doctors !== null`일 때만

## 통계
- `src/workers/stats/jobs.ts`: `sunap`이 있을 때 `sunapDoctors`도 함께(`bit.extra === null`이면 null)
- `src/components/stats/sections/SunapSection.tsx`: `BlockBody` 세 칸 아래 `state.sunapDoctors`가 있을 때만 `DoctorTable`

## 위험
- 우리 비트는 원장님 한 분이라 실제 화면에서 표를 볼 수 없다 → 합성 자료(시험·화면 하네스)로만 본다. 원장님 여럿인 병원에서 처음 쓸 때 엑셀과 한 번 견준다
- 같은 환자가 하루에 두 원장님께 접수하면 코드가 작은 원장님 한 분에만 센다(합계가 장부·통계와 같게)

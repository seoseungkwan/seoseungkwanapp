# 설계: 통계 탭 비트 전용 세 칸 — 환자 구성 · 시간대별 접수 · 원장님별

## 화면 시안 (승인 요청용. 이름·숫자는 지어낸 값)
눌러 보는 시안: `docs/mockups/stats-bit-sections/index.html` — 폭 [PC][휴대폰], 상태 [불러온 뒤][비트 자료 없음][이 기간 아직 안 불러옴][도우미 업데이트 필요][원장님 한 분]. 글은 시안이 이긴다.
```
통계   [최근 7일][최근 30일][최근 90일][최근 12개월]  10월 9일 ~ 11월 7일
(지금 있는 여덟 칸 그대로)
── 환자 구성  어떤 분들이 오시는지 · 최근 30일 ─────────────────────────────
[전체][신환]  명 = 서로 다른 환자 · 건 = 접수 건수 · 전체 1,248명
연령대                     │ 보험                         │ 동네              [구·시][동]
10세 미만 ▍     18명 22건·1% │ 건강보험 ████ 1,071명 …86%   │ 영통구 ████ 412명 790건·33%
…  생년월일 없음             │ … 차상위 1종  8명 12건·1% 미만 │ … 그 밖 23곳 · 주소 없음
명은 기간 안 마지막 내원 때의 나이·보험·주소로 한 번만 세요. …                 [표 복사]
── 시간대별 접수  요일·시간마다 하루 평균 접수 · 최근 30일 ────────── 자세히 ˅
가장 붐비는 때는 월요일 오전 9시예요 · 하루 평균 14.3건
      8시  9시  10시 … 18시
월    6.5 14.3 12.8 …  3.0      (칸 색 다섯 단계)
…  일   –    –    –  … –      (월~일 · 8시~20시 고정)
적음 ■■■■■ 많음 · 접수 시각 기준이에요. …
── 원장님별  원장님마다 환자·신환·매출 · 최근 30일 ───────────────────────────
원장님  실환자  신환   내원     매출            비중
김원장   702명 104명 1,268건 48,320,500원  ▬ 54.8%
이원장   591명  82명 1,042건 39,871,200원  ▬ 45.2%
합계   1,248명 186명 2,310건 88,191,700원    100%
환자 수는 접수할 때 정한 진료의, 매출은 수납할 때 적힌 진료의로 나눠요. …   [표 복사]
```

## 데이터 흐름
```
[비트에서 불러오기] → stats.rows {from,to} (명령·확장 그대로)
  도우미: v2 자료 + visits·people·doctors·doctorDays → v3 JSON → chunk … end
  → 확장 → lib/bridge → stats Worker (helperData.ts가 v2·v3 검사)
  Worker 메모리: 지금 진료 줄 + 접수 줄(VisitLine[]) · 사람 표 · 원장님 표 · 날·원장님 금액 (화면으로 안 감)
화면 기간 바뀜 → requestSections {from,to} → Worker sectionsJob → { kind:'ready', mix, hours, doctors } (이름·숫자만)
  → PatientMixSection · VisitHoursSection · DoctorsSection
서버·Supabase·AI 경로: 바뀌지 않음 (저장 줄은 지금 그대로)
```
- 명령 이름·인자(`stats.rows {from,to}`, 800일)는 그대로라 **크롬 확장은 다시 올리지 않는다**. 도우미만 새 버전이다
- 처방별 신환·재진처럼 비트 PC에서 불러온 화면에서만 보인다. 휴대폰·다른 PC는 저장된 숫자만 있어 세 칸이 `비트 PC에서 불러오면 보여요`다

## 구성 요소

### 도우미 (helper/, C#)
- `Stats/StatsSql.cs`에 문장 넷(모두 매개변수 SELECT, `IsAllowed`·`ParametersOf` 목록에 더함):
  - `VisitLinesSql` = 지금 `Visits` 글(원본 그대로) + `SELECT v.PatientId, v.VisitDay, SUBSTRING(c.OcmAcpDtm,9,4), RTRIM(i.InsCodNam), NULLIF(RTRIM(c.OcmDtrCod),'') FROM PeriodVisits v JOIN dbo.OcmInf c ON c.OcmNum=v.VisitId OUTER APPLY (SELECT TOP 1 m.InsCodNam FROM dbo.InsMst m WHERE m.InsCod=c.OcmInsCod AND m.InsAdpDte<=v.VisitDay ORDER BY m.InsAdpDte DESC, m.InsCodNam) i ORDER BY v.PatientId, v.VisitDay, 3`
  - `PeopleSql` = `Visits` 글 + `SELECT p.PatientId, b.PbsBirDte, b.PbsDtlAdr FROM Patients p LEFT JOIN dbo.PbsInf b ON NULLIF(RTRIM(b.PbsChtNum),'')=p.PatientId ORDER BY p.PatientId`(원래 도구 PatientMix의 연결 그대로, 성별 칸만 뺌)
  - `DoctorNamesSql` = `SELECT RTRIM(u.UidCod), RTRIM(u.UidNam), u.UidExpDte FROM dbo.UidMst u WHERE RTRIM(u.UidCod) IN (@d0 … @d49) ORDER BY 1, u.UidExpDte`(코드는 매개변수, 빈 자리는 NULL. 50개 넘으면 나눠 부름)
  - `DoctorMoneyNormalSql`·`DoctorMoneyReceivableSql` = 지금 `FinanceNormalSql`·`FinanceReceivableSql` 글에 원래 도구 `BusinessStats.ByDoctor`와 같은 두 곳만 바꾼 것: NativeRows SELECT에 `RTRIM(p.OrpDtrCod) DoctorId`·`LEFT(p.OrpAccDte,8) PaidDay`를 더하고, 끝 SELECT를 `SELECT PaidDay, DoctorId, SUM(OrpTotAmt) FROM NativeRows GROUP BY PaidDay, DoctorId`로. 바꾼 글 전체를 시험이 글자로 못 박는다
- `Stats/StatsRows.cs`: 읽기 셋을 더한다 — `VisitLines`(줄 한도는 지금 `MaxRows`와 같은 검사), `People`(생년월일 8자리 날짜 검사 · 주소 앞부분 `AddressHead(string?) → string?`: 빈칸으로 나눈 낱말 다섯 개까지, 숫자로 시작하는 낱말 앞에서 멈춤, 80자), `DoctorMoney`(불러온 기간을 달로 나눠 `@day`·`@nextDay`로 두 문장을 돌리고 같은 (날, 진료의)는 더함, 0원 줄 버림, 금액은 long)
- `Stats/StatsPayload.cs`: `Version = 3`. v2 열쇠를 지금 차례로 쓴 뒤 `visits`·`people`·`doctors`·`doctorDays`를 이 차례로 쓴다. 차트번호·이름 글은 지금처럼 `WriteText`
- `Stats/StatsCommands.cs`: 위 읽기를 같은 `HospitalGate` 세션 안에서 부르고 Build에 넘긴다
- 원래 도구와 다른 점: 진료의 이름은 원래 도구처럼 UidExpDte가 가장 늦은 줄 · 시간대는 원래 도구(09~20시 고정)와 달리 병원 접수 시간 8~20시 고정 · 월~일 고정(사용자 결정) · 신환 시간대·성별은 뺌

### Worker (환자 자료 구역)
- `src/workers/stats/helperData.ts`: `v === 2 || v === 3`. v3면 새 열쇠 넷을 검사해 `StatsRowsData.extra`(없으면 v2)에 담는다:
  ```ts
  type VisitLine = { p: number /* PatientIds 번호, 차트 없으면 -1 */; d: string /* YYYY-MM-DD */; h: number | null /* 0~23 */; ins: string | null; doc: string | null }
  type Person = { birth: string | null /* YYYY-MM-DD */; area: string | null }
  type StatsExtra = { visits: VisitLine[]; people: Map<number, Person>; doctors: Map<string, string | null>; doctorDays: { d: string; doc: string; amount: number }[] }
  ```
  차트번호는 지금처럼 이 파일 안에서 메모리 번호로만 바뀐다
- `src/workers/stats/jobs.ts`: 메모리에 `extra: StatsExtra | null`(v2면 null)과 첫 내원일 표를 둔다. `sectionsJob(memory, {from,to}): BitSectionsView` — 메모리 없음·범위 밖 `{kind:'none'}`, v2 `{kind:'old-helper'}`, 그 밖 아래 세 계산
- `createStatsHost`에 `sections(request)` 하나 더(지금 `split`과 같은 차례·streamId 규칙)
- `src/lib/analytics/patientMix.ts`: `patientMix(input: MixInput, who: 'all' | 'new'): PatientMix` — `MixInput = { from, to, visits, people, first: Map<number,string> }`. 연령 `ageBand(birth, day)`, 동네 `areaKeys(region) → { city: {key,label} | null; town: {key,label} | null }`(`toRegion` 결과에서), 1위 시·같은 이름 동 괄호 처리. 결과는 `{ total: {people, visits}, age: MixRow[], insurance: MixRow[], city: MixRow[], town: MixRow[] }`, `MixRow = { label: string; people: number; visits: number; share: number /* 0~1 */; kind: 'row' | 'rest' | 'noTown' | 'none' }`. Worker가 `all`·`new` 둘을 다 만들어 보낸다(단추를 눌러도 Worker에 다시 묻지 않음)
- `src/lib/analytics/visitHours.ts`: `visitHours(visits, from, to): VisitHours = { rows: { weekday: 1..7; openDays: number; cells: (number|null)[] /* 합계 */ }[]; hours: number[]; unknown: number; peak: { weekday, hour, average } | null }`. 평균·단계는 화면 쪽 순수 함수 `cellAverage`·`cellLevel`(같은 파일, 시험)
- `src/lib/analytics/doctorStats.ts`: `doctorStats(input): DoctorRow[] + total` — `DoctorRow = { label; patients; newPatients; visits; amount; share: number | null }`, 한 분 이하면 `{ kind: 'single' }`
- `src/types/stats.ts`: `BitSectionsView = { kind: 'none' } | { kind: 'old-helper' } | { kind: 'ready'; mix: { all: PatientMix; new: PatientMix }; hours: VisitHours; doctors: DoctorsView }`, `StatsSectionsRequest = { type: 'sections'; streamId; from; to }`, 답 `{ type: 'sections-result'; streamId; view: BitSectionsView }`
- `src/workers/statsClient.ts`: `requestSections(worker, {from,to})` (지금 `requestSplit`과 같은 모양, 따로 둔다 — 지금 시험의 split 답 모양을 바꾸지 않으려고)

### 화면
- `src/components/stats/useStatsWorker.ts`: `sections({from,to})` 하나 더
- `src/components/stats/StatsScreen.tsx`: split과 같은 때(불러오기 횟수·기간이 바뀔 때) sections도 묻고 `StatsSections`에 넘긴다. 이 기기에서 불러오지 않았으면 null
- `src/components/stats/sections/StatsSections.tsx`: 여덟 칸 뒤에 세 칸(모두 `col-span-12`)
- `src/components/stats/sections/PatientMixSection.tsx` · `VisitHoursSection.tsx` · `DoctorsSection.tsx`: 시안 그대로. 막대는 지금 `RankedBars`를 쓰지 않고 줄 안 작은 막대(`span` 폭 %) — 줄 칸(이름·막대·명·건·%)이 시안처럼 맞아야 해서. 표는 `ds.table`. 복사는 지금 `sections/CopyButton`
- 복사 글: `formatPatientMix(hospital, rangeLabel, who, unit, mix)`·`formatDoctors(hospital, rangeLabel, view)` — `src/lib/analytics/patientMix.ts`·`doctorStats.ts`에 둔다(병원 이름은 화면이 넣는다. Worker에는 가지 않는다, 처방별 신환·재진과 같음)

## 결정과 트레이드오프
- **비트 PC에서만**: 세 칸을 서버에 저장하면 휴대폰에서도 보이지만 표·권한·시험이 늘어난다. 처방별 신환·재진과 같은 길로 시작한다(범위 밖에 적음)
- **v3는 v2 위에 열쇠만 더함**: 옛 웹이 새 도우미를 만나도(배포 사이) v2 열쇠가 그대로라 지금 칸은 맞게 그려진다. 새 웹이 옛 도우미를 만나면 `old-helper`로 세 칸만 안내한다
- **접수 줄을 Worker로 보냄**(도우미가 칸을 다 세서 보내지 않음): 고른 기간·[전체][신환]·[구·시][동]을 다시 묻지 않고 바꾸려면 줄이 필요하다. 줄은 의원 PC 안(도우미 → 확장 → Worker)에서만 다닌다
- **명은 '기간 안 마지막 내원' 기준**(사람마다 한 번): 묶음마다 명 합이 실환자와 같아 표가 맞는다. 나이는 기간 마지막 날의 만 나이(원래 도구와 같음)
- **매출은 원래 도구 경영 통계 규칙을 날로 나눔**: 원래 도구는 달마다 돌렸다. 고른 기간(7일·30일)을 맞추려고 같은 문장을 달마다 돌리되 수납일로 묶는다. 환불·변경 수납은 원래 도구처럼 숫자를 그대로 보이고 따로 표시하지 않는다(범위 밖)
- **환자 수 진료의(OcmDtrCod)와 매출 진료의(OrpDtrCod)가 다름**: 원래 도구와 같다. 화면 아래 글로 알린다

## 위험
- 접수 시각: 예약하고 온 분의 접수 시각이 예약 시각으로 남는지 비트가 바꾸는지 모른다. 시간대 표가 예약 시각 쪽으로 몰릴 수 있다 → 첫 실행 때 비트 접수 화면과 몇 줄 견준다
- 매출 문장 길이: FinanceNormal을 24달까지 달마다 돌리면 오래 걸릴 수 있다(원래 도구는 같은 일을 했다). 불러오기 시간 한도(20분)는 그대로다
- InsMst 보험 이름이 같은 코드에 여러 줄(진료과·병원 종류별)이라도 이름은 같다고 본다(reception-paper가 의원 PC에서 확인한 조건)
- 주소가 '수원시영통구'처럼 붙어 있으면 `toRegion`이 못 나눠 `주소 없음`이 많아질 수 있다 → 첫 실행 때 `주소 없음` 비율을 본다

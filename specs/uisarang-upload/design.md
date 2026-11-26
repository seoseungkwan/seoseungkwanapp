# 설계: 의사랑 엑셀 올리기

> 기능 ID: `uisarang-upload` · 요구사항은 `requirements.md`(REQ-8801~8815), 작업은 `tasks.md`. 화면 글자는 requirements.md '화면 글자'가 기준이고 시안 `docs/mockups/uisarang-upload/`와 한 글자도 다르지 않다.
> PC 화면만(사용자 규칙 2026-11-21). 새 화면 코드에 폰 폭 클래스(`max-md:` 등)를 쓰지 않는다.

## 1. 조사로 안 것

### 1-1. 의사랑 FStat 엑셀 모양 (ERP 조사 메모에서 **파일 모양만** 옮김 — PC 이름·폴더 경로는 옮기지 않았다)
| 보고서 | 위쪽 라벨 | 머리 줄(빈칸 = 이름 없는 칸) | 줄 | 메모 |
|---|---|---|---|---|
| 수입통계 › 일일수입통계 | `[외/입 구분] 전체` · `[조 회 일] YYYY-MM-DD`(하루뿐) | 보험구분 · 총진료비 · 급여총액 · 청구액 · 진료수납액 · 본인부담금 · 비급여 · 초진수 · 재진수 · 인원계 · 방문당진료비 · (빈칸) · 방문당청구액 · 현금수납액 · 카드수납액 · 현금영수증수납액 | 보험구분마다 한 줄 + 마지막 `합계` | 총진료비 값은 합친 칸이라 한 줄 아래에 있을 수 있다. 총진료비 = 급여총액 + 비급여, 진료수납액 = 현금 + 카드(계좌는 현금에 들어 있음), 인원계 = 초진수 + 재진수. 현금영수증수납액은 현금의 한 부분(더하지 않음). 내원 없이 낸 미수·환불은 들어가지 않는다 |
| 진료통계 › 기간별처방통계(위쪽 표) | `[외/입 구분] 전체` · `[조 회 일] 시작~끝` | 코드 · 청구코드 · 처방명칭 · (빈칸) · (빈칸) · 총투여량 · 총액 | 코드마다 한 줄 + 마지막 `합계`. 머리 줄이 약 40줄마다 되풀이 | 코드는 의원이 정한 글자(빈칸·`/` 들어감, 예 `carm` · `CRYO 대관절` · `ESWT 1부위` · `mm010 100/100`). 총투여량은 양이고 소수가 될 수 있다 |
| 인원통계 › 내원일별환자현황 위쪽 표 | `[조 회 일] 시작~끝` | 내원일 · (빈칸) · (빈칸) · 인원수 · 신규환자 | 날마다 한 줄 + `합계` | 신규환자 = 병원 첫 내원 |
| 같은 화면 아래쪽 표 | (확인 필요 — §13) | 차트번호 · 수진자명 · 보험구분 · 진료실 · 주민등록번호 · 전화번호 · 주소 · (빈칸) · (빈칸) · 휴대전화 · 신규환자 | 그날 환자 한 줄씩. 머리 줄이 약 20줄마다 되풀이 | 위쪽 표 날 줄을 눌러야 그날이 나온다. 줄 수 = 그날 인원수, 신규환자 칸 `신규` = 신환 |
| 예약환자통계 아래쪽 표 | | 예약일 · 차트번호 · 수진자명 · 보험구분 · 진료실 · 주민등록번호 · 전화번호 · 주소 · (빈칸) · 방문여부 | | 웹앱은 쓰지 않는다 |

주민번호 일곱째 자리: 1·2·5·6 → 1900년대, 3·4·7·8 → 2000년대, 9·0 → 1800년대. 만 나이는 그날 기준.

### 1-2. 지금 코드에서 쓰는 것 (고치지 않거나 조금만 넓힌다)
- `src/lib/parsers/common.ts` `readGrid(bytes)`: xlsx·xls(BIFF8)·html·csv를 같은 칸 배열로, 빈 줄 빼고(`blankrows:false`), 50MB(`MAX_BYTES`)·줄 수 한도. 결과 `{ok, value} | {ok:false, code}`.
- `src/lib/analytics/dates.ts`: `isYmd`·`addDays`·`diffDays`·`compareYmd`·`weekdayOf`·`weekStartOf`·`monthOf`·`monthRange`·`weekRange`·`eachDay`·`todayInKorea`·`excelSerialToYmd`·`parseDateCell`. 날짜 셈은 여기만 쓴다.
- `src/lib/analytics/patientMix.ts` `AGE_BANDS`(아홉) · `NO_BIRTH = '생년월일 없음'` — 의사랑 나이대 열 줄도 같은 차례·이름(비트 `MonthSections.mix.age` 열 줄과 같은 모양).
- `src/lib/payload/validate.ts` `validateDayPayload`(정확한 열쇠, `revisit` 셋 + 선택 둘) — 의사랑 날 줄은 이 검사를 **그대로** 지나는 모양으로 만든다(검사는 고치지 않음).
- `src/lib/storage/stats.ts` `saveStats({months, days, covered, source, sections?})` · `readDays`·`readCoverage` · `StatsSource = 'bit' | 'file'`(→ `'uisarang'` 더함) · `isSource`가 모르는 출처 줄을 빼는 곳.
- `src/lib/storage/revenue.ts` `createRevenueStore(client).saveRange(range, {days, codes, dayCodes?})` → `save_revenue_range`(날 줄 수 = 날 수, dayCodes 없음 → 그 범위 날 단위 처방 줄 지우고 `day_codes` 거짓). `sales_days` 금액 제약: unconfirmed면 아홉 칸 null, splitUnconfirmed면 나눔 넷만 null, 아니면 아홉 칸 모두 숫자.
- `src/workers/runAnalysis.ts`·`analyze.worker.ts`: 파일 크기 → 바이트 → Worker(transferable), 30초 한도, Worker 예외는 `E-ANALYZE-FAILED`. 파일 이름은 Worker에 보내지 않는다 — 의사랑 길도 같게 한다.
- 통계 탭: `StatsScreen.tsx`(`SOURCE_NAME`·자료 줄·빈 글·`<WriteOnly><SourcePicker/></WriteOnly>`), `sections/StatsSections.tsx`(카드 차례·`useClinicProfile` 한 번), `sections/parts.tsx` `EmptyNote({title, children})`, `RxSection.tsx` 탭, `TreatmentGroupEditor`(찾기 목록 `lines`·건수 `counts`), `useRxCatalog.ts`.
- 대시보드: `live/BitDashboard.tsx`(`emr`·비트 읽기 효과·`firstDay`·`DashboardHome`에 넘김), `briefing/DashboardHome.tsx`(연결 뒤 · `emr !== 'bit'`면 `EmrWaitSentence` · 비트 연결 전), `live/ReadStatus.tsx` `StatusHeader`, `summary/DailySection.tsx`(90일초진·물리치료 칸), `summary/FlowSection.tsx`, `summary/ReportBlock.tsx`(`NO_TODAY`·`NO_PAST_DAY`), `summary/LiveDashboard.tsx`(`readDays` 한 곳).
- 관리자 비교: `lib/storage/adminRows.ts`(`ADMIN_ROW_KINDS` 열여덟, `FUNCTION = 'admin_rows'`), `lib/admin/compare/{load,rank,sales}.ts`, `components/admin/compare/{RankTable,CompareCells,statsInput,useCompareData}`. `admin_rows`는 `20261124000000_admin_view.sql`에만 있다(이 기능은 고치지 않고 새 함수를 둔다).
- 보는 중: `useReadOnly()`·`WriteOnly`(`components/shell/viewing`). 데스크는 대시보드·통계 탭에 못 온다(`DESK_TABS`).
- 병원 EMR: `useClinicProfile()` → `clinic.state === 'ready' ? clinic.profile.emr : 'bit'`.

## 2. 흐름

```
[원장 PC 브라우저 — 환자 글자는 여기 밖으로 안 나감]
 파일 놓기/고르기 → components/uisarang/UisUpload (파일 이름은 이 화면 상태에만)
   → workers/runUisarang(files, {today})         · 100개 넘음 → E-UIS-TOO-MANY(읽지 않음)
       파일마다 크기 검사(50MB 넘음 → 그 파일 E-UIS-TOO-BIG) → 바이트만 postMessage(transfer)
       → workers/uisarang.worker.ts → workers/readUisFiles(buffers, today)
           → lib/parsers/uisarang/readFile: readGrid → 종류(§3-1) → 라벨·조회일·조건(§3-2·3-3) → 종류별 읽기(§4)
           → lib/parsers/uisarang/batch: 같은 날 두 번(§5)
       ← UisFileResult[] (파일 차례 그대로 · 숫자·종류·기간·처방 코드·처방명칭·칸 이름만)
   → lib/payload/uisarang.planUisSave(results) → UisPlan(§6)
   → lib/storage/uisarang.saveUisPlan(plan) → Supabase
        stats_days·stats_coverage(출처 'uisarang') · sales_days(save_revenue_range) · uis_periods
   → lib/storage/uisarang.readUisHave(이번 날 범위) → lib/analytics/uisarang.missingFiles → 결과 화면
   → onSaved() → 대시보드 저장 숫자 새로고침 / 통계 탭 다시 읽기

[통계 탭]  readDays·readCoverage(지금 그대로, 'uisarang' 줄 포함) + readUisPeriods('rx'|'age', 기간)
           → lib/analytics/uisarang(tileRx · sumRxCodes · sumRxGroups · sumAges) → 의사랑 칸
[대시보드] LiveDashboard.readDays(지금 그대로) → BitDashboard: 의사랑이면 비트를 읽지 않고 저장 숫자로만
[관리자 비교] readAdminRows(지금 종류) + readAdminRows('uis_periods'·'clinic_emr') → admin_uis_rows
```

## 3. 알아보기 규칙 (`lib/parsers/uisarang/`, 환자 자료 구역)

### 3-1. 종류 표 (머리 줄로 정함 · 파일 이름은 보지 않는다)
| 종류 | 꼭 있는 칸 | 없어야 하는 칸 |
|---|---|---|
| `income` 일일수입통계 | 보험구분 · 진료수납액 | |
| `rx` 기간별처방통계 | 코드 · 처방명칭 · 총액 | |
| `visits` 내원일별 위쪽 표 | 내원일 · 인원수 · 신규환자 | 차트번호 |
| `visitPatients` 내원일별 아래쪽 표 | 차트번호 · 신규환자 | 예약일 |
| `rsv` 예약환자통계 위쪽 표 | 예약일 · 예약건수 | 차트번호 |
| `rsvPatients` 예약환자통계 아래쪽 표 | 예약일 · 차트번호 · 방문여부 | |

- 머리 줄 = 위 30줄 안에서, 칸 글자(빈칸을 모두 뺀 것)가 어느 종류의 꼭 있는 칸을 모두 갖고 없어야 하는 칸은 없는 **첫 줄**. 한 줄이 두 종류에 맞거나, 서로 다른 줄에서 두 종류가 맞으면 E-UIS-KIND(모름). 아무 종류도 없으면 E-UIS-KIND.
- 머리 줄 아래에서 머리 줄과 칸 글자가 같은 줄(쪽마다 되풀이)과 모든 칸이 빈 줄은 건너뛴다.
- 종류마다 읽는 칸(§4 표)의 이름이 머리 줄에 없거나 둘이면 E-UIS-COLUMN + 빠진·겹친 칸 이름 목록(머리 칸 이름만, 환자 글자 아님).
- `rsv`·`rsvPatients`는 종류를 안 뒤 줄을 읽지 않고 `{status:'skipped', why:'rsv'}`로 끝낸다(조회일도 읽지 않음).

### 3-2. 라벨
- 머리 줄 위의 칸 가운데 `[`로 시작하고 `]`가 든 칸이 라벨이다. 이름 = 괄호 안 글자에서 빈칸을 모두 뺀 것(`[조 회 일]` → `조회일`, `[외/입 구분]` → `외/입구분`). 값 = `]` 뒤 글자(앞뒤 빈칸 뗌), 비었으면 같은 줄 오른쪽 첫 글자 칸.
- 조회일 값: `YYYY-MM-DD` 또는 `YYYY-MM-DD ~ YYYY-MM-DD`(구분 글자 `-`·`.`·`/`, `~` 앞뒤 빈칸 됨, 한 자리 달·날 됨). 날짜 칸이 엑셀 날짜 숫자면 `excelSerialToYmd`. 시작 > 끝이면 못 읽음.
- 조회일이 아닌 라벨의 값이 빈칸·`전체`·날짜 모양이 아니면 E-UIS-FILTER(예 `[외/입 구분] 외래`).

### 3-3. 조회일 → 기간
| 조건 | 기간 | `unit` |
|---|---|---|
| 시작 = 끝 | 하루 | `day` |
| 시작이 월요일이고 끝 = 시작 + 6 (`weekRange`) | 한 주 | `week` |
| 시작이 1일이고 끝 = 그달 말일 (`monthRange`) | 한 달 | `month` |
| 그 밖 | — | — |

- `rx`·`visits`: 셋 모두 받는다. 그 밖이면 E-UIS-PERIOD(결과에 `span {from, to}`를 실어 화면이 `조회일 {M}월 {D}일 ~ {M}월 {D}일`을 보임).
- `income`·`visitPatients`: 하루만. 아니면 E-UIS-ONE-DAY.
- 조회일 라벨이 없거나 못 읽거나 시작이 2020-01-01 앞: E-UIS-DATE. 끝 > 오늘(`today`, 한국 날짜): E-UIS-FUTURE. 차례: 종류 → 열 → 조회일(DATE → PERIOD/ONE-DAY → FUTURE) → 조건(FILTER) → 줄.

### 3-4. 숫자 글자
- 칸 값이 숫자면 그대로, 글자면 쉼표·빈칸을 떼고 숫자로(`-` 앞 음수 됨). 빈칸·`null` = **없음**(0 아님). 숫자로 못 바꾸는 글자 = 그 줄 E-UIS-ROW(줄 번호 = 엑셀 줄 차례 1부터).
- 금액은 원 미만을 줄마다 버린다(`Math.trunc`). 인원 칸은 0 이상 정수여야 한다.

## 4. 종류마다 읽기

### 4-1. 일일수입통계 → 매출 한 줄 (`RevenueDayRow`)
합계 줄 = 보험구분 칸(빈칸 뺌)이 `합계`인 첫 줄. 없으면 E-UIS-TOTAL. 보험구분 줄들은 쓰지 않는다.

| `RevenueDayRow` 칸 | 값 |
|---|---|
| `date` | 조회일(하루) |
| `visits` | 인원계(없으면 null) |
| `newPatients` | **null** — 초진수는 신환이 아니다(아래) |
| `returnVisits` | **null** |
| `total` | 총진료비(합계 줄 칸이 비면 한 줄 아래 같은 칸) |
| `insurer` | 청구액 |
| `copay` | 본인부담금 |
| `noncovered` | 비급여 |
| `otherTotal` | `total − insurer − copay − noncovered` |
| `cash` | 현금수납액(계좌이체 포함 · 현금영수증수납액은 이 안이라 더하지 않음) |
| `card` | 카드수납액 |
| `transfer` | **0** (계좌는 현금에 들어 있어 따로 없음) |
| `receivableIn` | **0** (엑셀에 미수 입금이 없음) |
| `roughTotal` | 열쇠 없음 |

- `unconfirmed` 참(아홉 칸 모두 null): 총진료비·현금수납액·카드수납액 가운데 없음·음수가 있거나, 진료수납액이 있고 ≠ 현금수납액 + 카드수납액.
- `splitUnconfirmed` 참(나눔 넷 null, 남는 다섯 숫자): unconfirmed가 아니고, 청구액·본인부담금·비급여·급여총액 가운데 없음·음수가 있거나 청구액 + 본인부담금 ≠ 급여총액이거나 `otherTotal < 0`.
- 둘 다 거짓이면 아홉 칸 모두 숫자(DB 제약 그대로 지남).
- **초진수 ≠ 신규환자**: 의사랑 '초진수'는 진찰료를 초진으로 낸 접수 수라, 처음 온 환자에 더해 예전에 왔던 환자가 새 병으로·오래 지나 다시 와 초진으로 잡힌 날도 든다. 웹앱 '신환'은 병원 첫 내원(specs/revenue design '신환')이라 내원일별 위쪽 표 `신규환자`로만 센다. 그래서 매출 줄의 신환·재진은 null이고(매출 탭·비교가 그 칸 대신 `stats_days`를 본다), 인원계(= 초진수 + 재진수, 진찰료를 낸 접수 수)는 '방문당' 나눔에 쓰는 `visits`로만 둔다. 인원계는 내원일별 인원수와 다를 수 있다(진찰료 없이 물리치료만 받은 날 등).

### 4-2. 기간별처방통계 → 처방 줄
- 읽는 칸: 코드 · 처방명칭 · 총투여량 · 총액(청구코드·빈칸은 읽지 않음).
- 코드 줄 = 코드 칸이 비지 않고(앞뒤 빈칸 뗀 값) `합계`가 아니며 머리 줄이 아닌 줄. 코드 칸이 빈 줄은 건너뛴다.
- 합계 줄 = 코드 또는 처방명칭(빈칸 뺌)이 `합계`인 줄. 없으면 E-UIS-TOTAL. `total` = 합계 줄 총액(비면 null).
- 줄마다 `qty` = 총투여량(없으면 0), `amount` = 총액(없으면 0, 원 미만 버림). 같은 코드 둘 이상 = 하나로 더함(이름은 첫 줄).
- `qty`는 더한 뒤 소수 셋째 자리에서 반올림(`Math.round(x * 1000) / 1000`). 음수 그대로.
- 검사: 코드·처방명칭 1~100자, 제어 글자(`validate.ts` CONTROL) 없음, 전화·주민번호·메일 모양 없음(`validate.ts` `isCode`와 같은 규칙), 코드 3,000개 이하 — 어기면 E-UIS-ROW. `total`이 숫자이고 `|Σamount − total| > 코드 줄 수`면 E-UIS-TOTAL(줄마다 버림 차이는 줄 수까지 봐 준다 · 소계 줄을 두 번 센 경우를 잡음).
- 결과 `UisRxPayload {v:1, rows:[{code, name, qty, amount}] (code 차례), total}`.

### 4-3. 내원일별 위쪽 표 → 날 숫자
- 날 줄 = 내원일 칸이 날짜(`parseDateCell`)인 줄 → `{day, patients: 인원수, newPatients: 신규환자}`. 인원 칸이 없음이면 0이 아니라 E-UIS-ROW.
- 검사: 날이 조회일 안 · 같은 날 한 번 · `0 ≤ newPatients ≤ patients` · 정수. 어기면 E-UIS-ROW.
- 합계 줄 = 내원일이 `합계`. 없거나 날 줄 인원수·신규환자 합과 다르면 E-UIS-TOTAL.
- 조회일 안 줄 없는 날 = 휴진(진료 없음). 줄을 만들지 않는다(덮은 기간이 알려 준다 — 0명 줄을 쓰면 '진료한 날 평균'이 바뀐다).

### 4-4. 내원일별 아래쪽 표 → 나이대 수
- 환자 줄 = 차트번호 칸이 1~12자리 숫자인 줄. 신환 = 신규환자 칸(빈칸 뺌)이 `신규`.
- 나이: 주민등록번호 칸에서 빈칸·`-`를 떼고 앞 일곱 자가 숫자면 생일 = (세기)YYMMDD. 없는 날·그날 뒤 생일이면 null. 만 나이 = `floor((그날 YYYYMMDD − 생일 YYYYMMDD) / 10000)`. 띠 = `AGE_BANDS[min(floor(나이/10), 8)]`, null이면 열째 `생년월일 없음`.
- 그 밖 칸(수진자명·보험구분·진료실·전화·주소·휴대전화)은 읽지 않는다. 차트번호는 '환자 줄인가'만 보고 버린다. 주민번호 모양이 있어도 받는다(비트 길 E-PARSE-RRN과 다름).
- 환자 줄 0개 → E-UIS-ROW. 결과 `UisAgePayload {v:1, patients, newPatients, bands[10], newBands[10]}`(Σbands = patients, Σnew = newPatients, newBands[i] ≤ bands[i]).

## 5. 한 번에 넣은 파일 묶음 (`lib/parsers/uisarang/batch.ts`, Worker 안)
- 파일마다 §3·§4 결과를 낸 뒤 묶음을 본다. 받은(read) 결과만 견준다.
- 일일수입통계·아래쪽 표: 같은 날 둘 이상 → 숫자가 모두 같으면 첫 파일만 read, 나머지 `skipped/same`. 하나라도 다르면 그 날 파일 모두 E-UIS-TWICE.
- 기간별처방통계: 조회일이 똑같은 것끼리 위와 같다. 기간이 다르면(하루 줄과 그 날이 든 달 줄 등) 둘 다 받는다(§8 `tileRx`가 겹치지 않게 고른다).
- 위쪽 표: 두 파일이 같은 날을 덮고 그 날 숫자(줄 있음/없음 포함)가 하나라도 다르면 겹친 파일 모두 E-UIS-TWICE. 모두 같으면 모두 받는다(같은 줄이 두 번 저장되어도 같은 값).
- 결과 모양(`src/types/uisarang.ts`):

```ts
export type UisKind = 'income' | 'rx' | 'visits' | 'visitPatients' | 'rsv' | 'rsvPatients'
export type UisUnit = 'day' | 'week' | 'month'
export type UisSpan = { from: string; to: string; unit: UisUnit }
export type UisRxRow = { code: string; name: string; qty: number; amount: number }
export type UisRxPayload = { v: 1; rows: UisRxRow[]; total: number | null }
export type UisAgePayload = { v: 1; patients: number; newPatients: number; bands: number[]; newBands: number[] } // 열 칸씩
export type UisVisitDay = { day: string; patients: number; newPatients: number }
export type UisRead =
  | { kind: 'income'; span: UisSpan; row: RevenueDayRow }
  | { kind: 'rx'; span: UisSpan; payload: UisRxPayload }
  | { kind: 'visits'; span: UisSpan; days: UisVisitDay[] }
  | { kind: 'visitPatients'; span: UisSpan; payload: UisAgePayload }
export type UisRefuseCode = 'E-UIS-KIND' | 'E-UIS-PERIOD' | 'E-UIS-ONE-DAY' | 'E-UIS-DATE' | 'E-UIS-FUTURE' | 'E-UIS-FILTER'
  | 'E-UIS-COLUMN' | 'E-UIS-ROW' | 'E-UIS-TOTAL' | 'E-UIS-TWICE' | 'E-UIS-TOO-BIG' | 'E-UIS-UNREADABLE'
export type UisFileResult =
  | { status: 'read'; read: UisRead }
  | { status: 'skipped'; why: 'rsv' | 'same'; kind: UisKind; span: UisSpan | null }
  | { status: 'refused'; code: UisRefuseCode; kind: UisKind | null; span: { from: string; to: string } | null; columns?: string[]; row?: number }
```
- `UisRefuseCode`는 `ErrorCode`의 부분 집합이다(`types/errors.ts`가 같은 글자를 갖고, 시험이 `satisfies`로 본다).

## 6. 저장 모양 (`lib/payload/uisarang.ts`, 순수)
- `validateUisRxPayload(v)`: 열쇠 정확히 `v`·`rows`·`total`, `v === 1`, `rows` 배열 0~3,000줄, 줄 열쇠 정확히 `code`·`name`·`qty`·`amount`, code·name 1~100자 · 제어 글자 없음 · `isCode` 규칙, code 차례로 겹치지 않음, `qty` 유한수 |x| ≤ 10^9 · 소수 셋째 자리까지, `amount` 정수 |x| ≤ 10^12, `total` null 또는 정수 |x| ≤ 10^12. 아니면 null.
- `validateUisAgePayload(v)`: 열쇠 정확히 `v`·`patients`·`newPatients`·`bands`·`newBands`, 길이 10, 모두 0 이상 정수, 합 조건(§4-4). 아니면 null.
- `toUisDayPayload(d: UisVisitDay): DayPayload` = `{schemaVersion: 2, quality: 'valid', day, partial: false, totals: {patients, newPatients, returning: patients − newPatients, unknown: 0}, rx: [], groups: [], revisit: {cohort: 0, within7: null, within14: null}}` — `validateDayPayload`를 지난다(시험으로 증명). **오늘 파일도 `partial` 거짓**: 원장이 마감 뒤 올린 것을 그날 숫자로 본다(뒤에 환자가 더 오면 다시 올려 바꾼다).
- `planUisSave(results: UisFileResult[]): UisPlan`

```ts
export type UisPlan = {
  stats: Array<{ files: number[]; covered: DateRange; days: DayPayload[] }> // 위쪽 표 파일마다(covered = 조회일)
  revenue: Array<{ files: number[]; row: RevenueDayRow }>                   // 일일수입통계 파일마다
  periods: Array<{ files: number[]; kind: 'rx' | 'age'; from: string; to: string; payload: UisRxPayload | UisAgePayload }>
}
```
  `files` = 그 줄을 낸 파일 차례 번호(같은 엑셀로 건너뛴 파일 번호도 넣어 저장 결과를 같이 받는다). 검사를 못 지난 모양은 계획에 넣지 않고 그 파일을 E-UIS-ROW로 돌린다(일어나면 안 되는 길).

## 7. SQL (`supabase/migrations/20261127000000_uisarang_upload.sql`, 사용자가 SQL Editor에 붙여 넣음 · 두 번 실행 안전)
머리 주석: 무엇·왜, 실행 방법, 먼저 들어가 있어야 하는 것(`20261101000200_stats.sql`·`20261101000400_revenue.sql`·`20261119300000_clinic_emr.sql`·`20261119400000_hospital_emr.sql`·`20261124000000_admin_view.sql`), 두 번 안전, 웹 올리기 전에 붙임(안 붙이면 의사랑 저장이 실패 카드), `REQ-8801`·`ADR-056`. 줄 끝 LF.

```sql
-- ① 표: 처방(하루·한 주·한 달)과 나이대(하루) 숫자. 환자 칸 없음
create table if not exists public.uis_periods (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  kind text not null check (kind in ('rx', 'age')),
  from_day date not null check (from_day >= date '2020-01-01'),
  to_day date not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (hospital_id, kind, from_day, to_day));
alter table public.uis_periods drop constraint if exists uis_periods_span_ok;
alter table public.uis_periods add constraint uis_periods_span_ok check (
  from_day = to_day
  or (kind = 'rx' and extract(isodow from from_day) = 1 and to_day = from_day + 6)
  or (kind = 'rx' and extract(day from from_day) = 1
      and to_day = (date_trunc('month', from_day) + interval '1 month' - interval '1 day')::date));
alter table public.uis_periods drop constraint if exists uis_periods_payload_ok;
alter table public.uis_periods add constraint uis_periods_payload_ok check (
  jsonb_typeof(payload) = 'object' and payload ->> 'v' = '1' and octet_length(payload::text) <= 262144);
-- 고칠 때도 지금 시각(지금 공용 함수 touch_updated_at를 부르기만 한다)
drop trigger if exists uis_periods_touch on public.uis_periods;
create trigger uis_periods_touch before update on public.uis_periods
  for each row execute function public.touch_updated_at();

alter table public.uis_periods enable row level security;
revoke all on table public.uis_periods from anon, authenticated;
grant select on table public.uis_periods to authenticated;
grant insert (kind, from_day, to_day, payload), update (kind, from_day, to_day, payload) on table public.uis_periods to authenticated;
-- 지우기 권한 없음(같은 기간은 upsert로 바꾼다)

drop policy if exists "내 병원 의사랑 숫자 읽기" on public.uis_periods;
create policy "내 병원 의사랑 숫자 읽기" on public.uis_periods for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 의사랑 숫자 넣기" on public.uis_periods;
create policy "내 병원 의사랑 숫자 넣기" on public.uis_periods for insert to authenticated
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 의사랑 숫자 고치기" on public.uis_periods;
create policy "내 병원 의사랑 숫자 고치기" on public.uis_periods for update to authenticated
  using (hospital_id = (select public.my_hospital_id())) with check (hospital_id = (select public.my_hospital_id()));
-- 보는 중 정책 둘(admin_view.sql ⑤와 같은 글자 · 이 표만)
drop policy if exists "관리자 보는 의원 읽기" on public.uis_periods;
create policy "관리자 보는 의원 읽기" on public.uis_periods for select to authenticated
  using (hospital_id = (select public.admin_view_hospital_id()));
drop policy if exists "보는 중에는 그 의원만 · 쓰기 없음" on public.uis_periods;
create policy "보는 중에는 그 의원만 · 쓰기 없음" on public.uis_periods as restrictive for all to authenticated
  using ((select public.admin_view_hospital_id()) is null or hospital_id = (select public.admin_view_hospital_id()))
  with check ((select public.admin_view_hospital_id()) is null);

-- ② 통계 출처에 'uisarang'(stats_months는 그대로 — 의사랑은 달 줄을 쓰지 않는다)
alter table public.stats_days drop constraint if exists stats_days_source_check;
alter table public.stats_days add constraint stats_days_source_check check (source in ('bit', 'file', 'uisarang'));
alter table public.stats_coverage drop constraint if exists stats_coverage_source_check;
alter table public.stats_coverage add constraint stats_coverage_source_check check (source in ('bit', 'file', 'uisarang'));

-- ③ 관리자 비교 읽기(admin_rows와 같은 관문 · 새 두 종류만)
create or replace function public.admin_uis_rows(p_kind text, p_hospital_ids uuid[], p_from date, p_to date)
returns table (hospital_id uuid, "row" jsonb) language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('uis_periods', 'clinic_emr') or p_hospital_ids is null or p_from is null or p_to is null
     or coalesce(cardinality(p_hospital_ids), 0) not between 1 and 30
     or p_from > p_to or p_to - p_from >= 400 then
    raise exception 'rows not allowed' using errcode = '22023';
  end if;
  select coalesce(array_agg(h.id), '{}') into v_ids
    from public.hospitals h where h.id = any (p_hospital_ids) and h.status = 'approved';
  if p_kind = 'uis_periods' then
    return query
      select u.hospital_id, jsonb_build_object('kind', u.kind, 'from_day', u.from_day, 'to_day', u.to_day, 'payload', u.payload)
        from public.uis_periods u
       where u.hospital_id = any (v_ids) and u.from_day <= p_to and u.to_day >= p_from
       order by u.hospital_id, u.kind, u.from_day, u.to_day;
  else
    return query
      select h.id, jsonb_build_object('emr', coalesce(p.emr, h.emr))
        from public.hospitals h left join public.clinic_profiles p on p.hospital_id = h.id
       where h.id = any (v_ids)
       order by h.id;
  end if;
end;
$$;
revoke all on function public.admin_uis_rows(text, uuid[], date, date) from public, anon;
grant execute on function public.admin_uis_rows(text, uuid[], date, date) to authenticated;
```
- 제약 이름 `stats_days_source_check`·`stats_coverage_source_check`는 `20261101000200_stats.sql`의 칸 안 check가 Postgres에서 받는 자동 이름이다. TASK-1 시험이 진짜 사슬을 돌린 뒤 `pg_constraint`에서 이 이름이 있는지 먼저 보고(없으면 시험이 실패해 이름을 고친다), 바꾼 뒤 옛 check가 남지 않았는지(`'uisarang'`이 들어감) 본다.
- `clinic_profiles.hospital_id`가 기본 키다(`20261119000000_clinic_profile.sql`). 병원 정보 줄이 있으면 그 `emr`(not null, 기본 `bit`), 줄이 없으면 가입 때 `hospitals.emr`.
- 데스크(`my_hospital_id()` = null)·승인 대기 병원은 아무 줄도 못 본다. service role은 쓰지 않는다.

## 8. 의사랑 숫자 셈 (`lib/analytics/uisarang.ts`, 순수 · 환자 자료 구역 규칙 안)
- `tileRx(range: DateRange, rows: UisPeriodRow<UisRxPayload>[], known: {covered: DateRange[]; worked: Set<string>}, today: string)` → `{ok: true, used: UisPeriodRow[], counts: {month, week, day}} | {ok: false, gap: string[]}`
  1. 기간과 `from`·`to`가 똑같은 줄이 있으면 그것 하나.
  2. 아니면 기간 안에 통째로 드는 한 달 줄(빠른 달부터) → 남은 날에 통째로 드는 한 주 줄(이미 고른 날과 겹치지 않는 것) → 남은 날의 하루 줄.
  3. 남은 날 가운데 `휴진`(덮은 기간 안이고 진료한 날 아님)·오늘·오늘 뒤를 뺀 날이 있으면 `gap`(날 차례). 없으면 ok.
  4. 같은 기간 줄이 둘이면(일어나면 안 됨) `updated_at`이 늦은 것.
- `sumRxCodes(used)` → 코드마다 `{code, name(가장 늦은 줄), qty(셋째 자리 반올림), amount}` · 총액 큰 차례(같으면 code 차례).
- `sumRxGroups(codes, groups: RxGroupDef[])` → 묶음마다 `{id, qty, amount}`(넣는 처방 code와 앞뒤 빈칸 떼고 대소문자 무시로 맞춤) · `other {amount}`(어느 묶음에도 없는 코드) · `total {amount}` · `ignored: boolean`(빼는 처방·조건이 있는 묶음이 하나라도).
- `sumAges(rows: UisPeriodRow<UisAgePayload>[], range, worked)` → `{bands[10], newBands[10], days, missingDays}`(missingDays = 기간 안 진료한 날인데 나이대 줄이 없는 날 수).
- `missingFiles(days: string[], have: UisHave, today)` → `Array<{kind: 'income' | 'rx' | 'visits' | 'visitPatients'; days: string[]}>`(아직 없는 날이 있는 종류만, 차례 고정). `days` = 이번에 저장한 파일들이 덮는 날(합집합, 오늘 뒤 뺌). 날마다 휴진(덮었고 진료 없음)이면 건너뛴다. income = `have.income`에 없음, rx = 그날을 덮는 처방 줄 없음, visits = `have.covered` 밖, visitPatients = `have.age`에 없음.
- `formatQty(x)`: 셋째 자리에서 반올림한 뒤 둘째 자리까지, 끝 0과 `.` 뗌, 천 단위 쉼표, 음수는 `-` 앞(`1234.5 → '1,234.5'`, `12 → '12'`, `0.245 → '0.25'`).
- `dayListText(days, today)`: 이어진 날을 묶어 `{M}월 {D}일` · `{M}월 {D}일~{D}일` · 달이 바뀌면 `{M}월 {D}일~{M}월 {D}일`, 올해가 아니면 덩어리 앞에 `{YYYY}년 `, `, `로 잇고 열 덩어리 넘으면 열 개 뒤 ` 외 {n}일`(n = 남은 날 수).
- 반올림은 `Math.round(x * 1000) / 1000`·`Math.round(x * 100) / 100` 뒤 `toLocaleString`이 아니라 직접 쉼표(시험 PC 지역 설정과 상관없게).

## 9. 저장 · 읽기 함수 (`lib/storage/uisarang.ts`)
- `lib/parsers`·`workers`를 부르지 않는다(시험이 소스 글자로 본다). 부르는 것: `lib/payload/uisarang`·`lib/storage/stats`(`saveStats`·`readDays`·`readCoverage`)·`lib/storage/revenue`(`createRevenueStore`)·`lib/supabase/browser`.
- `saveUisPlan(plan, deps?) → Promise<{ failed: number[] }>`
  - 날 숫자: `plan.stats` 줄마다 `saveStats({ months: [], days, covered, source: 'uisarang' })`.
  - 매출: `plan.revenue` 줄마다 `createRevenueStore(client).saveRange({ from: row.date, to: row.date }, { days: [row], codes: [] })`.
  - 처방·나이대: `uis_periods` `upsert(rows, { onConflict: 'hospital_id,kind,from_day,to_day' })`, 줄은 `{kind, from_day, to_day, payload}`만, 50줄씩.
  - 줄 하나가 실패해도 나머지는 계속하고, 실패한 줄의 `files`를 모아 돌려준다(같은 번호 한 번). 오류 글·Supabase 답은 밖으로 내지 않는다.
- `readUisPeriods<K extends 'rx' | 'age'>(kind, range, deps?)` → 기간과 겹치는(`from_day ≤ to` · `to_day ≥ from`) 줄을 1,000줄씩 모두 읽어 검사(§6)를 지난 것만 `{kind, from, to, payload, updatedAt}`로. 실패 = `StorageError('E-UIS-READ-FAILED')`.
- `readUisHave(range, deps?)` → `UisHave = { covered: DateRange[]; worked: string[]; income: string[]; rx: DateRange[]; age: string[] }`(`readCoverage` · `readDays`의 환자 1명 이상 날 · `createRevenueStore(client).loadDays` 날 · `readUisPeriods('rx'|'age')` 기간). 실패 = E-UIS-READ-FAILED(화면은 결과 줄은 두고 아직 없는 파일 상자만 오류 카드).
- `lib/storage/stats.ts`: `StatsSource = 'bit' | 'file' | 'uisarang'`, `isSource` 같이, `fromFile`은 `'file'`만. `saveStats`가 `source: 'uisarang'`인데 `months`가 비지 않았거나 `sections`가 있으면 보내지 않고 `E-STATS-SAVE-FAILED`. `types/db.ts` `StatsSourceColumn`도 셋.

## 10. 화면

### 10-1. 올리기 칸 (`src/components/uisarang/`)
- `UisUpload({ look: 'open' | 'folded', upload })` — 그리기. `useUisUpload({ onSaved })` — 상태(`idle → reading → saving → done | saveFailed`)·결과·[다시 저장]. 상태는 놓는 쪽이 한 번 들고(대시보드는 `BitDashboard`) 두 모양에 같은 값을 넘긴다 — 시작 칸에서 저장해 숫자 화면으로 바뀌어도 결과가 접은 칸 안에 남는다(AC-8810.10). `UisResult` — 결과 줄·아직 없는 파일 상자. `texts.ts` — '화면 글자' 글을 한 곳에(시험이 시안 글자와 견줌).
- 놓기: 칸 전체(`dragover`·`drop`), 고르기: `<input type="file" multiple accept=".xls,.xlsx,.csv">`(숨김, [파일 고르기]가 엶). 읽는 동안 [파일 고르기] 잠김, 놓기 무시.
- 흐름: `runUisarang(files, { today: todayInKorea() })` → `planUisSave` → `saveUisPlan` → (저장된 파일이 하나라도 있으면) `readUisHave({from: 이번 날 처음, to: 끝})` → `missingFiles` → `onSaved()`.
- 결과 줄의 파일 이름 = 놓은 `File.name`(이 화면 상태에만 · 저장소·요청·Worker에 없음). 줄 차례 = 놓은 차례. 칩: read → 저장함(저장 실패한 번호면 저장 못 함), skipped → 건너뜀, refused → 받지 않음.
- 기간 글은 `components/uisarang/spanText.ts`(`{M}월 {D}일` 등, `lib/analytics/dates`만 씀).
- 보이는 곳: 원장 · 보는 중 아님(`WriteOnly` 안) · `emr === 'uisarang'`. 접은 모양 [도움말 보기] 상태는 화면 안에만(저장 안 함).
- 모양: 지금 `SourcePicker`의 상자(`rounded-control bg-canvas`) · 점선 놓는 자리(`border-dashed border-line-strong`) · ERP 줄 `bg-warning-soft text-warning`(알림 그림) · 칩 `ds.chip.positive/negative/neutral` · 오류 카드 `ErrorCard`(detail = `빠진 칸: …`·`{n}번째 줄`) · 아직 없는 파일 `bg-warning-soft` · 다 있음 `text-positive`. 폰 폭 클래스 없음.

### 10-2. 대시보드 (`components/dashboard/`)
- `BitDashboard`: `isUis = clinic.state === 'ready' && emr === 'uisarang'`이면 비트 읽기 효과를 돌리지 않는다. 처음 날 = `status.days`에서 오늘 이하 가장 늦은 날(없으면 오늘). `report` 머리 줄은 `StatusHeader` 의사랑 모양(`variant: 'uisarang'`, `savedAt`·`lastDay`), 그 아래 `uisUploadSlot('folded')`.
- `DashboardHome`: `emr === 'uisarang'`이고 `report === null`이면 `EmrWaitSentence` 대신 `UisStart`(날짜 줄 → h1 → 안내 → `uisUpload` 자리 → [쓰는 EMR 바꾸기]). 보는 중이면 '보는 중 · 숫자 없음' 글.
- `uisUploadSlot(look)`은 TASK-6에서 `null`을 돌려주는 자리이고 TASK-7이 `<UisUpload look={look} onSaved={savedRefresh?.onRefresh} />`로 채운다(같은 Phase에서 서로 부르지 않게).
- `DailySection`: `uis` 참이면 90일초진·물리치료 칸 = `{value: null, emptyText: '의사랑 엑셀로는 셀 수 없어요'}`. `FlowSection`: `uis` 참이면 신환 재방문율·처방 상위 자리 = `EmptyNote`(까닭 표). `ReportBlock`: `uis` 참이면 그날 줄 없음 글 둘(requirements '시안에 없어…').
- 비트·이지스·그 밖은 지금 그대로(시험으로 고정).

### 10-3. 통계 탭 (`components/stats/`)
- `StatsScreen`: `SOURCE_NAME.uisarang = '의사랑 엑셀'`. 의사랑이면 `SourcePicker` 대신 `uisUploadSlot(look)`(숫자 있으면 접음, TASK-7이 채움), 빈 글 둘(requirements). 비트 '불러오기' 길은 그리지 않는다.
- `StatsSections`: 이미 부르는 `useClinicProfile`의 emr로 `uis`를 정해 칸마다 넘긴다. 의사랑이면:
  - 기간 요약 `90일초진` = `–` + 작은 글, 도우미 안내 줄 없음.
  - 환자 카드: `RevisitSection` 자리 = 안내, `PatientMixSection` 자리 = `UisAgeSection`(§화면 글자).
  - 예약·전환 카드: `Block 전환` 칸 = 안내(신환 예약률·90일 예약률은 그대로).
  - 처방 카드: `UisRxSection` 탭 넷(`묶음별 처방량`·`처방 코드별`·`처방별 신환·재진` 안내·`몇 번까지 받나` 안내). [묶음 고치기]는 지금 `TreatmentGroupEditor`를 `lines` = 의사랑 코드 목록, `counts` = 빈 Map으로 연다.
  - 진료 운영 카드: `시간대별 접수`·`원장님별` = 안내(요일별·휴일은 그대로).
  - 매출 카드: `치료별 매출` 탭 = 안내(나머지 탭 그대로). `noDayCodes`(날 단위 처방 줄 없음)로 뜨는 옛 도우미 안내는 의사랑이면 그리지 않는다(의사랑 날은 늘 `day_codes` 거짓이다).
  - 처방 카드 옆 글은 `RX_DESC` 대신 의사랑 글, 보고 카드 옆 글은 `REPORT_DESC` 대신 의사랑 글(requirements '화면 글자').
  - 보고 카드: 비트 보고 자리 = 안내, [고른 기간 보고]는 그대로(처방 줄 없이 날 숫자로).
- `useUisPeriods(range)`(`components/stats/uisarang/`): 지금 기간의 `readUisPeriods('rx')`·`('age')`를 읽는다(보는 중에도 읽음 — RLS가 보는 의원 줄을 줌). 실패 = 그 자리 E-UIS-READ-FAILED 카드.
- `useRxCatalog`: 의사랑이면 날 줄 rx 대신 넓은 범위 `readUisPeriods('rx')`의 코드·이름으로 `RxLine`을 만든다(type 빈 글자).
- 덮음 줄 이름 `{기간 이름}`은 지금 `PERIOD_NAME`/고른 기간 이름 그대로.

### 10-4. 관리자 의원 비교
- `adminRows.ts`: `ADMIN_ROW_KINDS`에 `'uis_periods'`·`'clinic_emr'`(스물), 이 둘은 `FUNCTION_OF[kind] = 'admin_uis_rows'`, 나머지 `'admin_rows'`. 쪽 읽기·오류는 같다.
- `load.ts`: `COMPARE_KINDS`에 둘 더함(그 달 범위). `rank.ts`·`statsInput.ts`의 출처 거르기에 `'uisarang'`.
- 의사랑 의원(`clinic_emr` = `uisarang`): `sales.ts` `salesRow`에 날 숫자(stats_days totals)를 넘겨 `visits`·`newPatients`·`returnVisits`·`visitDays`(환자 1명 이상 날)·`dayAvg`를 그것으로, `total`은 sales_days로. 대표 숫자 `가장 많은 나이대` = `sumAges` 그 달. `비급여 비율`·`신환 예약률`·`예약 수`·`목표 달성률`은 지금 그대로, `신환 재방문율 30일`·`Block 전환율`·`3번 이상 받은 비율` = `–`(지금 FOOT가 설명).
- `RankTable` `NameCell`: `내 의원` 칩 다음 `ds.chip.neutral` `의사랑`. 표 아래 의사랑 줄(requirements). `CompareCells`: 의사랑 의원 칸은 requirements 표대로(`묶음별 처방량` 위 셋 = 그 달 `tileRx`가 ok일 때 `sumRxGroups` 처방량 큰 차례, 값 `formatQty`).

## 11. 오류
- `lib/errors.ts`에 requirements '오류 번호' 표 열다섯 줄을 글자 그대로, `types/errors.ts` 합집합에 같은 번호. 끝 마침표 없음(지금 E-PARSE- 글과 같게).
- Worker 안에서는 번호만 다룬다(글은 화면이 `errorInfo`로). `ErrorCard detail`: E-UIS-COLUMN `빠진 칸: {이름}, {이름}`, E-UIS-ROW `{n}번째 줄`.

## 12. ADR-056 (`docs/ADR.md` 끝에 더할 글)
> ### ADR-056: 의사랑 의원은 원장이 의사랑 통계 엑셀을 브라우저에 직접 올린다 — Worker가 읽고 서버에는 날 숫자·처방 코드별 처방량·나이대 수만 (환자 자료 구역 그대로 · 표 `uis_periods` · 출처 `uisarang` · 함수 `admin_uis_rows`)
> - 맥락: 의사랑은 비트처럼 도우미로 읽을 길이 없다(specs/emr-choice). 의사랑 통계 화면(FStat)은 엑셀로 저장된다. 같은 엑셀을 ERP 마감일지 도우미(별개 제품)가 읽고 지운다.
> - 결정: 원장이 엑셀 넷(일일수입통계·기간별처방통계·내원일별 위·아래 표)을 끌어다 놓으면 Web Worker가 `readGrid`로 읽어 종류·조회일(하루·한 주·한 달)을 머리 줄과 라벨로 정한다. 저장은 지금 표를 그대로 쓴다 — 날 숫자는 `stats_days`(출처 `uisarang`)·`stats_coverage`, 매출은 `sales_days`(`save_revenue_range`) — 그리고 날 숫자로 못 나누는 것(기간 합인 처방량, 아래쪽 표 나이대)만 새 표 `uis_periods`(RLS 내 병원 · 보는 중 정책 둘 · 지우기 없음)에 둔다. 아래쪽 표의 차트번호·이름·주민번호·전화·주소는 Worker 안에서 나이 띠로만 바뀌고 밖으로 나가지 않는다. 파일 이름도 Worker·서버로 가지 않는다. 관리자 비교는 `admin_rows`를 고치지 않고 같은 관문의 정의자 함수 `admin_uis_rows`(종류 둘)를 둔다.
> - 대안: (가) 의사랑 DB를 도우미로 바로 읽기 — 계약·역공학 위험(비트 법적 위험 메모와 같은 문제), 의사랑 PC 조사 필요 → 미룸. (나) 처방량을 날 줄 `rx`에 넣기 — `rx`는 환자 수 칸이라 뜻이 섞인다 → 버림. (다) 달 줄 `stats_months` — 의사랑은 달 합을 다른 방식으로 못 나눔 → 쓰지 않음.
> - 결과: 의사랑 의원 화면은 셀 수 없는 칸을 자리째 두고 안내한다. 같은 날 다시 올리면 바꿔 저장한다. 실제 엑셀 모양은 의사랑 PC에서 확인한다(명세 '실제 PC에서 볼 것').

`docs/ARCHITECTURE.md`: DB 표 목록에 `uis_periods` 한 줄 · 통계 출처 셋 · 환자 자료 구역 목록에 `lib/parsers/uisarang`·`workers/uisarang.worker.ts` 한 줄.

## 13. 실제 PC에서 볼 것 (다 만든 뒤 의사랑 의원 PC에서 · 예/아니오)
1. 일일수입통계 엑셀 위쪽에 `[조 회 일] YYYY-MM-DD` 줄이 있나요?
2. 기간별처방통계 엑셀 위쪽에 `[조 회 일] 시작 ~ 끝` 줄이 있나요?
3. 내원일별환자현황 **아래쪽 표** 엑셀에도 `[조 회 일]` 줄이 있고, 그 날짜가 고른 그 하루인가요?
4. 내원일별환자현황을 엑셀로 저장하면 위쪽 표와 아래쪽 표가 서로 다른 파일로 나오나요?
5. 저장한 엑셀을 웹앱에 놓으면 '받는 파일' 넷이 모두 `저장함`이 되나요?
6. 일일수입통계 합계 줄에서 급여총액 = 청구액 + 본인부담금인가요?
7. 진료수납액 = 현금수납액 + 카드수납액인가요(계좌이체가 현금에 들어 있나요)?
8. 돈·사람 수가 0인 칸이 빈칸이 아니라 `0`으로 나오나요?
9. 기간별처방통계 합계 줄 총액 = 코드 줄 총액을 다 더한 값인가요(중간 소계 줄이 없나요)?
10. 내원일별 위쪽 표에서 환자가 없는 날(휴진)은 줄이 없나요?
11. 위쪽 표 합계 줄 인원수 = 날 줄 인원수를 다 더한 값인가요?
12. 아래쪽 표 환자 줄 수 = 위쪽 표 그날 인원수인가요?
13. 아래쪽 표 주민등록번호가 가려지지(`*`) 않고 앞 일곱 자리가 보이나요?
14. 웹앱에 올린 뒤에도 ERP 마감일지 도우미가 같은 엑셀을 그대로 읽나요(웹앱은 파일을 바꾸거나 지우지 않음)?
15. 대시보드 그날 환자 수·신환이 의사랑 화면 숫자와 같나요?
16. 통계 탭 매출 총진료비가 일일수입통계 합계 총진료비와 같나요?
17. 통계 탭 `처방 코드별` 처방량·총액이 기간별처방통계와 같나요?

'아니오'가 나오면 그 줄의 규칙(§3·§4)만 고치는 작은 명세 변경으로 다룬다.

## 14. 시험 계획
- 가짜 파일: `src/lib/parsers/uisarang/testBooks.ts`(시험 전용, SheetJS `XLSX.write`로 xls(BIFF8)·xlsx·html 바이트를 만듦). 라벨 줄·머리 줄·되풀이 머리·합친 칸·합계 줄·쪽 줄을 흉내 낸다. 환자 글자는 지어낸 것(`홍길동`·`9001011234567`·`010-0000-0000`·`서울시 가짜동`)이고 실제 파일은 쓰지 않는다. 시험은 그 글자가 결과 JSON·저장 요청에 없음을 본다.
- SQL: `supabase/uisarangUpload.rls.test.ts` — PGlite에 진짜 migration 사슬을 차례로 돌리고(`library.rls.test.ts`·`adminView.rls.test.ts`처럼) 원장 둘·데스크·승인 대기·관리자·로그인 안 함으로 AC-8801.1~7. 두 번 실행.
- 순수: `lib/parsers/uisarang/*.test.ts`(종류·라벨·기간·종류별·묶음), `lib/payload/uisarang.test.ts`(검사·`toUisDayPayload`가 `validateDayPayload` 통과·`planUisSave`), `lib/analytics/uisarang.test.ts`(tileRx 표 시험: 똑같은 줄·달+주+날·휴진·오늘·모자람, 합·묶음·나이·아직 없는 파일·글자).
- Worker: `workers/readUisFiles.test.ts`(파일 여러 개 → 결과 차례, 예외 한 파일만), `workers/runUisarang.test.ts`(가짜 Worker: 보낸 메시지에 이름 없음 · transfer · 100개 · 크기 · 한도 · 실패).
- 저장: `lib/storage/uisarang.test.ts`(가짜 client: 부른 표·칸·onConflict·rpc 인자 그대로, 실패 번호, 요청 본문에 환자·파일 이름 글자 없음, 소스에 parsers·workers import 없음), `lib/storage/stats.test.ts`(출처 셋).
- 화면: `components/uisarang/*.test.tsx`(글자·흐름·결과·다시 저장·보는 중 없음·저장소 안 씀), `components/stats/uisarang/*.test.tsx`(안내 글자 자리마다·나이대 표·처방 탭·모자람), `components/dashboard/live/uisDashboard.test.tsx`(시작 칸·머리 줄·처음 날·안내·비트 안 읽음·비트 의원 그대로), 관리자 비교 시험(칩·줄·칸·읽기 길).
- 글자 견줌: 화면 시험의 기대 글자는 requirements '화면 글자'에서 옮긴다(시안과 같음).
- 끝에 한 번: `npm test`·`npm run lint`·`npm run build`·tsc, 화면 확인(PC 폭 1440·1024만).

## 15. 위험
- 의사랑 엑셀 모양이 조사 메모와 다를 수 있다(라벨 글자·합친 칸·소계 줄) → 머리 줄·라벨 규칙을 넉넉히 두고 합계 맞춤으로 잘못 읽기를 막으며, 실제 PC 확인(§13)에서 고친다.
- 아래쪽 표에 날짜 라벨이 없으면 그날을 알 수 없다(§13-3) → '아니오'면 사용자가 날을 고르게 하는 작은 명세 변경.
- 오늘 파일을 낮에 올리면 그 뒤 환자는 다시 올릴 때까지 빠진다(`partial` 거짓으로 둠) → 안내 글 없이 '같은 날 다시 올리면 바꿔 저장'으로 해결.
- 다시 올린 위쪽 표에서 사라진 날 줄은 남는다(지우기 없음) — 같은 날 숫자가 바뀌는 것만 덮어씀. 드문 일이라 받아들인다.
- 처방량은 처방마다 단위(정·cc·회)가 달라 묶음 합은 같은 단위끼리만 뜻이 있다 → `그 밖 처방`·`합계`의 처방량은 `–`, 안내 글에 '환자 수가 아니라 총투여량의 합'.
- 계좌이체·미수 입금을 0으로 둔다(DB 제약이 null을 못 받음) — 통계 탭·비교는 이 둘을 쓰지 않는다. 업무일지는 범위 밖.
- ERP 마감일지 도우미가 먼저 읽어 지우면 웹앱에 못 올린다 → ERP 줄을 접어도 늘 보이게.
- 다른 갈래와 겹칠 수 있는 파일: `docs/ADR.md`(번호 056) · `src/lib/errors.ts`·`src/types/errors.ts` · `src/lib/storage/adminRows.ts` · `src/components/stats/StatsScreen.tsx` · `BitDashboard.tsx`. 합칠 때 앞 갈래를 먼저 받고 번호만 맞춘다.

## 16. 배포 순서
1. 사용자가 시안을 보고 승인 → `/sdd approve uisarang-upload`.
2. TASK를 Phase 차례로 만들고 합친 뒤 마무리 검사.
3. **배포 전** 사용자가 `supabase/migrations/20261127000000_uisarang_upload.sql`을 Supabase SQL Editor에 붙여 넣는다(ssk-supabase-sql로 들어갔는지 확인). 안 붙이면 의사랑 저장만 실패 카드이고 비트 의원은 그대로다.
4. 배포·운영 갈래 합치기는 **사용자가 말할 때만**.
5. 의사랑 의원 PC에서 §13을 본다.

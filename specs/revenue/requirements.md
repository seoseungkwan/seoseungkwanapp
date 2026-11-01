# 요구사항: 매출 탭

> **시안 승인: 2026-11-01** 사용자 "이대로 만들기" — `docs/mockups/revenue/index.html`(만든 코드 `gen.py`, 숫자는 모두 예시). 같은 날 사용자 결정: 1인당 평균 = 환자 한 명마다, 치료 묶음·환불 날은 추천대로(아래 '배경').
> 기능 ID: `revenue` · 형식: 요구사항은 `### REQ-001: 제목`, 수용 기준은 `- AC-001.1: Given/When/Then`.
> 각 AC는 시험 하나 이상으로 검증하고, 시험 이름에 AC ID를 넣는다(TASK-1은 문서라 시험 대신 의원 PC 확인표로 확인한다). REQ 번호 = TASK 번호다. Phase·Step은 `tasks.md` 머리말.

## 배경 / 목표
- 탭 틀 계획(`docs/tab-frame/plan.md` §1·§2)이 정한 매출 탭을 채운다. 넣을 것(사용자 결정): **매출 추이(지난달·작년 같은 때 대비)**, **급여·비급여 나눠 보기**, **치료별 매출**, **환자 1인당 평균 진료비**. 금액은 비트 PC 연결(도우미)로 가져온다. 통계처럼 도구 단추 줄 없이 그래프가 이어지는 한 쪽이다
- 2026-11-01 사용자 결정(다시 묻지 않는다)
  - 시안을 이대로 만든다
  - **환자 1인당 평균 진료비 = 매출 ÷ 그 기간에 다녀간 서로 다른 환자 수**(같은 환자가 여러 번 와도 한 명). 환자 수는 도우미가 비트 DB 안에서 세고 숫자만 돌려준다(차트번호는 PC 밖으로 나가지 않는다)
  - 치료 묶음은 원본 일일 보고의 다섯 가지 + 그 밖 처방. 환불·예치금이 있는 날은 그날 금액을 합계에서 빼고 날짜만 알린다
  - 업무일지 탭이 하루 숫자를 비트에서 채울 수 있게, 같은 읽기(`revenue.days`)가 날마다 수납 나눔(현금·카드·계좌이체·미수입금)과 신환·재진 수도 돌려준다. 두 번째 읽기 명령을 만들지 않는다(계약은 design.md 5절)
- 서버에는 집계 숫자만 간다: 날짜별 합계 금액·건수와 달별 처방 코드 합계뿐이다. 환자 줄(이름·차트번호·접수 번호)은 비트 DB 밖으로 나오지 않는다. 도우미가 비트 DB 안에서 더하고 센 숫자만 돌려준다
- 금액을 읽는 방법은 원본 양지바른 사전점검이 이미 의원에서 쓰는 SQL을 그대로 옮긴다(`vendor/drbit_export/OperationalReportSql.cs`, 비트 '외래환자경영통계' 조건: 회계일 기준 정상수납 + 미수입금, 환불·변경수납·예치금이 있는 날은 금액 '확인 필요'). 치료별 금액은 원본 `TrendDataSource.cs`의 처방 금액 식(소모량 × 단가)을 코드별로 묶는다. 자세한 것은 design.md 2절
- 코드로 확인하지 못한 것(총진료비에 비급여가 들어 있는지, 미수발생·지역화폐를 읽는 곳, 치료 코드가 이 의원 코드와 같은지, 읽는 시간, '확인 필요' 날이 얼마나 많은지)은 TASK-1의 의원 PC 확인표로 확인한다
- 화면 AC는 내용(보이는 것·단추·상태)만 정한다. 배치·문구는 승인된 시안을, 모양은 `docs/UI_GUIDE.md`를 따른다

## 요구사항

### REQ-001: 의원 PC 확인표 (Phase 1 · Step 0 · pc-check)
- AC-001.1: Given `docs/revenue/pc-check.md`, When 총괄이 코드 작업 전에 읽으면, Then '먼저 할 것'(앱 없이 비트 화면만 보는 일)에 칸이 셋 있다: ① 비트 '외래환자경영통계' 어제 하루의 총진료비·조합청구액(공단부담금)·본인부담금·비급여를 옮겨 적고 "총진료비 = 공단부담금 + 본인부담금 + 비급여"가 맞는지 '예/아니오'(이 답이 AC-005.1의 급여 계산을 정한다) ② 이 의원 비트의 도수치료·체외충격파·C-arm 주사·초음파·냉동치료 처방 코드(`도수`·`CARM1`·`SONO1`·`CRYO`·`ESWT`가 든 코드와 같은가) ③ '미수발생'·'지역화폐' 금액이 보이는 비트 화면 이름·칸 이름
- AC-001.2: Given 같은 문서, When Phase 3이 끝나 의원 PC의 매출 탭에서 숫자가 보인 뒤, Then '매출 탭에서 볼 것' 칸이 넷 있다: ① 지난달 매출·공단부담·비급여(매출 탭) = 외래환자경영통계 지난달 ② 지난달 환자 수(매출 탭 '환자 1인당 평균 진료비'의 환자 수) = 비트 통계의 실인원 ③ 처음 가져오기에 걸린 시간 ④ 최근 3달 '확인 필요한 날' 수(매출 탭). 결과는 총괄이 화면을 보고 적는다. 수납 나눔(현금·카드·계좌이체·미수입금)·신환·재진 맞추기는 이 표가 아니라 업무일지 4단계 확인표가 한다고 한 줄로 알린다
- AC-001.3: Given 같은 문서, Then 환자 이름·차트번호를 적는 칸이 없고 "날짜와 금액 숫자만 적어요" 안내가 있다

### REQ-002: 명령 표 `revenue.days` (Phase 1 · Step 1 · bridge-contract)
- AC-002.1: Given `src/lib/bridge/commands.json`, When 읽으면, Then `revenue.days`가 `patient: false`, `maxDays: 31`, `args {from: date, to: date}`로 있다. 웹의 `SMALL_COMMANDS`와 도우미 명령 표 시험이 이 명령을 숫자 명령으로 안다(명령 수를 고정 숫자로 시험하지 않는다)
- AC-002.2: Given 도우미 답 `data`, When `checkResult('revenue.days', data)`, Then 칸이 정확히 `days`·`codes` 둘일 때만 통과한다. `days` 줄은 칸이 정확히 `date`·`visits`·`newPatients`·`returnVisits`·`patientsToDate`·`total`·`insurer`·`noncovered`·`cash`·`card`·`transfer`·`receivableIn`·`unconfirmed`(design.md 5절 표)이고, 날짜는 오름차순·하루도 빠짐없이 이어지고·31개 이하, 숫자 칸은 0 이상 안전한 정수 또는 `null`, `unconfirmed`가 `true`면 금액 일곱 칸(`total`~`receivableIn`)이 모두 `null`이고 `false`면 모두 숫자다. `codes` 줄은 칸이 정확히 `code`·`count`·`amount`이고, `code`는 `^[0-9A-Za-z가-힣_.\-]{1,30}$`, `count`는 0 이상 정수, `amount`는 0 이상 안전한 정수 또는 `null`, 1,000개 이하·코드 중복 없음이다. 어긋나면 `E-BRIDGE-BAD-REPLY`
- AC-002.3: Given 줄에 정해 둔 칸 밖의 칸(예: `chart`·`name`)이 하나라도 있거나 숫자 칸이 글자·소수·음수면, When 검사하면, Then 통과하지 않는다(환자 칸이 화면에 닿지 않는다)
- AC-002.4: Given 화면 통로 `connectScreenBridge({runtime})`(Worker 없음), When `call('revenue.days', {from, to})`, Then 확장에 봉투 하나를 보내고 검사한 답을 돌려준다. 조각(chunk)을 받지 않는다

### REQ-003: 도우미 매출 읽기 (Phase 1 · Step 2 · helper-revenue-read)
- AC-003.1: Given 등록된 병원, When `revenue.days {from, to}`, Then 처리기 맨 처음에 등록 확인 관문(`HospitalGate.Open`)을 지나고, 원본 `HistoryGuard`를 한 번, `from`부터 `to`까지 날마다(빠진 날 없이) 원본 `UnsupportedFinance`·`FinanceMultiplicity`·`ReceivableMultiplicity`·`FinanceNormal`·`FinanceReceivable`·`Patients`와 새 문장 `DistinctPatients`를 돌린다. 원본 문장은 원본 사본과 공백·끝 `;`·`--` 주석 줄만 다르다(사본 비교 시험)
- AC-003.2: Given 하루, When 앞의 세 검사(`UnsupportedFinance`·`FinanceMultiplicity`·`ReceivableMultiplicity`) 가운데 하나라도 0이 아니면, Then 그날 금액 일곱 칸은 `null`이고 `unconfirmed: true`다(원본 `SetFinanceUnconfirmed`). 아니면 `total`·`insurer`·`noncovered` = `FinanceNormal`과 `FinanceReceivable` 답의 첫째·둘째·셋째 칸 합, `cash`·`card`·`transfer` = `FinanceNormal`의 넷째·다섯째·여섯째 칸, `receivableIn` = `FinanceReceivable`의 넷째+다섯째+여섯째 칸이다(원 미만 버림 정수, DB `NULL`은 0). 일곱 칸 가운데 음수가 있으면 그날도 `unconfirmed: true`다
- AC-003.3: Given 하루의 `Patients` 답, When 셋째·넷째·다섯째 칸(차트번호 없음·중복·첫 내원 못 찾음)이 모두 0이면, Then `visits`는 첫째 칸, `newPatients`는 둘째 칸, `returnVisits`는 `visits − newPatients`다. 하나라도 0이 아니면 그날 셋 다 `null`이다. `HistoryGuard`가 0이 아니면(옛 자료가 따로 있어 신환을 정할 수 없음) 모든 날의 `newPatients`·`returnVisits`가 `null`이다(`visits`는 그대로)
- AC-003.4: Given 하루, When `DistinctPatients`를 `@from` = `from` 0시, `@to` = 그다음 날 0시로 돌리면, Then `patientsToDate`는 `from`부터 그날까지 다녀간 서로 다른 환자 수(비트 DB 안의 `COUNT(DISTINCT …)`)다. 차트번호 없는 내원이 하나라도 있으면 `null`이다. 차트번호는 도우미 밖으로 나가지 않는다
- AC-003.5: Given 기간, When 코드별 금액을 읽으면, Then 새 문장 `CodeAmounts` 하나로 처방 코드마다 유효 처방 줄 수(`count`)와 금액(`amount`, 원본 `TrendDataSource`의 `일수 × 수량 × 단가` 식, 원 미만 버림)을 낸다. 값이 빠진 줄이 있는 코드는 `amount: null`이다. 앞뒤 공백을 뺀 뒤 같은 코드가 된 줄은 하나로 합친다(건수·금액을 더하고, 하나라도 `null`이면 `null`). AC-002.2 글자 모양이 아닌 코드와, 금액 순으로 999번째 뒤의 코드는 이름 없는 한 줄 `_REST`로 합친다(그래서 코드 때문에 한 달 전체가 실패하지 않는다)
- AC-003.6: Given 읽기 실패·시간 초과·등록 확인 실패, When 처리하면, Then 일부만 보내지 않고 오류 하나만 보낸다(`E-BIT-READ-FAILED` 또는 관문의 오류 번호)
- AC-003.7: Given 답과 진단 기록, Then 차트번호·이름·접수 번호가 없다(시험: 가짜 DB가 준 가짜 차트번호 글자가 답·기록 어디에도 없음). 답의 칸은 AC-002.2와 같다
- AC-003.8: Given 허용 목록, When 매출 문장을 더하면, Then `ReadOnlyGuard`는 매출 문장 아홉 개(원본 7 + `DistinctPatients` + `CodeAmounts`)를 정해 둔 매개변수(`@day`·`@nextDay` Char 8, `@from`·`@to` Char 12, `@hospital` VarChar 32, 문장마다 쓰는 것만)와 함께만 통과시키고, 이 문장들은 읽기 문장 하나다(`SELECT` 또는 `WITH`로 시작, `;`·주석·쓰기 낱말 없음). 기존 `Sql` 상수와 기존 시험은 바뀌지 않는다

### REQ-004: 매출 표 (Phase 2 · Step 0 · revenue-tables)
- AC-004.1: Given migration `supabase/migrations/20261101000400_revenue.sql`, When PGlite에서 auth migration 뒤에 실행하면, Then 표 `sales_days`(`hospital_id`·`day`·`visits`·`new_patients`·`return_visits`·`patients_to_date`·`total`·`insurer`·`noncovered`·`cash`·`card`·`transfer`·`receivable_in`·`unconfirmed`·`fetched_at`, 기본 키 `hospital_id`+`day`)와 `sales_codes`(`hospital_id`·`month`·`code`·`count`·`amount`·`fetched_at`, 기본 키 `hospital_id`+`month`+`code`)가 생기고 두 표 모두 RLS가 켜져 있다. 칸 목록은 정확히 이것뿐이다(환자 칸 없음)
- AC-004.2: Given 표, When anon이 읽거나 쓰면 거부된다. authenticated는 승인(`approved`)된 자기 병원 줄만 다룬다: `sales_days`는 읽기·넣기·고치기·지우기, `sales_codes`는 읽기·넣기·지우기. 남의 병원 줄은 안 보이고 지워지지 않으며, `hospital_id`를 직접 넣거나 바꾸면 거부된다. 승인 대기·거절 사용자는 아무 줄도 못 읽고 못 쓴다
- AC-004.3: Given 줄, When DB 제약을 어기면 거부된다: 숫자 칸은 0 이상 정수, `unconfirmed`가 참이면 금액 일곱 칸이 모두 `null`이고 거짓이면 모두 있음, `day`는 2000-01-01 이후, `month`는 1일, `code`는 AC-002.2 모양
- AC-004.4: Given `hospital_id`를 빼고 넣으면, Then DB가 `public.my_hospital_id()`(승인된 내 병원)로 채우고, 줄을 고치면 `fetched_at`이 DB 시각으로 바뀐다. 다른 갈래가 같은 글자의 `my_hospital_id()`를 먼저 만든 DB에서도 이 migration이 오류 없이 된다

### REQ-005: 금액 나눔·기간 합·비교 (Phase 2 · Step 1 · revenue-summary)
- AC-005.1: Given 하루 줄, When `splitDay(row)`, Then 급여 = `total − noncovered`, 공단부담 = `insurer`, 본인부담 = 급여 − `insurer`, 비급여 = `noncovered`다(TASK-1 확인 답 '예' 기준. '아니오'면 이 AC를 고치는 명세 변경을 먼저 한다). 급여나 본인부담이 음수면 그날은 '확인 필요'로 본다
- AC-005.2: Given 기간과 날 줄, When `sumPeriod(rows, range)`, Then 확인된 날(금액이 있는 날)의 총액·급여·공단부담·본인부담·비급여 합(원 정수, 날 금액의 합, 반올림 없음), 확인 필요한 날 목록, 내원 합, 환자 수(기간이 그 달 1일에 시작하면 기간 마지막 날 줄의 `patientsToDate`, 아니면 `null`)를 낸다. 기간 안 줄이 없거나 모든 날의 금액·내원이 0이고 확인 필요한 날도 없으면 `null`('자료 없음')이다
- AC-005.3: Given 고른 달과 오늘(한국 날짜), When `periodsFor(month, today)`, Then 고른 기간 = 그 달 1일 ~ (그 달 말일과 어제 가운데 이른 날), 지난달 같은 기간 = 지난달 1일 ~ 같은 날짜(지난달이 짧으면 말일), 작년 같은 때 = 작년 같은 달 1일 ~ 같은 날짜(2월 29일은 28일)다. 처음 고르는 달은 어제가 속한 달이다. 날짜는 `lib/analytics/dates.ts`로만 계산한다
- AC-005.4: Given 두 기간 합, When `compare(now, before)`, Then 늘고 준 비율을 소수 첫째 자리 버림으로 낸다(방향 `up`·`down`·`same`). `before`가 `null`이거나 0이면 "비교할 수 없음"이다
- AC-005.5: Given 날 줄과 마지막 달, When `monthSeries(rows, lastMonth, today)`, Then 마지막 달부터 거꾸로 13달마다 총액·급여·비급여·내원 합·환자 수와 1인당 평균을 낸다. 자료 없는 달은 `null`(0이 아님), 아직 끝나지 않은 달은 `partial: true`
- AC-005.6: Given 기간 합, When `perPatient(sum)`, Then 환자 1인당 평균 = 확인된 날의 총액 합 ÷ 기간 환자 수(원 미만 버림)다. 환자 수가 `null`이거나 0이면 `null`이다. 기간에 확인 필요한 날이 있으면 `lowered: true`(그날 매출이 빠져 실제보다 낮을 수 있음)

### REQ-006: 치료 묶음 (Phase 2 · Step 2 · treatment-groups)
- AC-006.1: Given 코드 줄, When `groupTreatments(codes)`, Then 원본 일일 보고(`OperationalReportSql.Treatments`)의 규칙으로 묶는다: 앞뒤 공백을 뺀 코드가 `도수`면 도수치료, 대문자로 바꿔 `CARM1`이면 C-arm 주사, `SONO1`이면 초음파, `CRYO`면 냉동치료, `ESWT`를 품으면 체외충격파다. 나머지는 '그 밖 처방'이다
- AC-006.2: Given 묶음, Then 묶음마다 금액 합·건수 합을 내고 금액 큰 순(같으면 위 규칙 순서), '그 밖 처방'은 맨 뒤다. 금액이 `null`인 코드는 금액 합에서 빼고 그 묶음에 `missing: true`를 단다. 코드가 없으면 빈 목록이다
- AC-006.3: Given 묶음 규칙, Then 이름·규칙은 `src/lib/revenue/treatments.ts`의 표 하나에만 있다(시험이 표 순서를 확인)

### REQ-007: 저장·가져오기 (Phase 2 · Step 3 · revenue-sync)
- AC-007.1: Given 오늘과 저장된 날 목록, When `planFetch(today, savedDays)`, Then 어제가 속한 달부터 거꾸로 13달 가운데 '와야 할 날'(1일 ~ 말일과 어제 가운데 이른 날)이 하나라도 저장돼 있지 않은 달을 **최근 달부터** 돌려준다. 달마다 기간은 그 달 1일 ~ 와야 할 마지막 날이다(31일 이하). 다 저장된 달은 넣지 않는다
- AC-007.2: Given 검사를 지난 답, When `saveMonth(month, result)`, Then 답의 첫 날이 그 달 1일인지 확인하고(아니면 저장하지 않고 `E-REVENUE-SAVE-FAILED`, `patientsToDate`가 1일부터 센 값이어야 해서), 그 달 코드 줄을 지우고 새로 넣은 **뒤에** 날 줄을 `hospital_id`+`day`로 upsert한다(코드 저장이 실패하면 날 줄이 없어 그 달을 다시 가져온다). 보내는 줄의 칸은 `sales_days` 열세 칸(`day`~`unconfirmed`)·`sales_codes` 네 칸(`month`·`code`·`count`·`amount`)뿐이다(시험: 보내는 객체의 칸 이름 비교). 저장이 실패하면 `E-REVENUE-SAVE-FAILED`
- AC-007.3: Given `syncRevenue({call, store, today, months?, onProgress})`, When 부르면, Then 가져올 달마다 차례로 `revenue.days` → 저장을 하고 달마다 `onProgress({done, total, month})`를 알린다. 한 달의 읽기·검사·저장 오류(`E-BIT-READ-FAILED`·`E-BRIDGE-BAD-REPLY`·`E-REVENUE-SAVE-FAILED`)는 그 달만 `failed`에 넣고 다음 달을 계속한다. 통로·도우미·등록 오류(그 밖의 번호)는 거기서 멈춘다. `months`를 주면([다시 가져오기]) 그 달만 다시 읽는다. 도우미가 `E-HELPER-UNKNOWN-COMMAND`를 주면 `helperOld`, 확장이 `E-BRIDGE-REJECTED`를 주면(옛 확장은 모르는 명령을 막는다) `extensionOld`를 돌려준다
- AC-007.4: Given `loadRevenue(fromMonth, toMonth)`, When 읽으면, Then 그 달들의 날 줄·코드 줄과 가장 늦은 `fetched_at`을 돌려준다(RLS가 내 병원 줄만 준다)
- AC-007.5: Given 오류 번호 `E-REVENUE-SAVE-FAILED`, When 오류 카드를 그리면, Then `lib/errors.ts`의 '무엇이 · 어떻게 고치나' 문구가 있다

### REQ-008: 화면 보기 모양 (Phase 3 · Step 0 · revenue-view)
- AC-008.1: Given 저장된 줄·고른 달·오늘, When `buildRevenueView(input)`, Then 승인된 시안의 네 덩어리(매출 추이 · 급여·비급여 · 치료별 매출 · 환자 1인당 평균 진료비(환자 한 명 기준))의 글자와 막대 높이·폭(0~100 %, 소수 둘째 자리)을 낸다. 큰 금액은 만 원 아래를 버린 "1억 6,248만 원" 모양이고, 화면 읽기 표는 원 단위 그대로다
- AC-008.2: Given 상태 입력, Then 보기 상태는 `connect-needed`(연결 안 됨·저장된 줄 없음) · `fetching`(done/total) · `ready`(가져오지 못한 달이 있으면 그 달 목록도) · `empty`(고른 달 자료 없음) · `helper-old` · `extension-old` · `saved-only`(연결 안 됨·저장된 줄 있음, 마지막 가져온 시각) · `error`(오류 번호) 가운데 하나다
- AC-008.3: Given 고른 기간에 확인 필요한 날이 있으면, Then "확인 필요한 날 n일"과 날짜를 보이고, 그날 금액이 합계에 들어가지 않았고 1인당 평균이 낮게 보일 수 있다고 알린다. 없으면 "없음"이다
- AC-008.4: Given 몫·증감, Then 소수 첫째 자리 버림이고 빼기는 U+2212다. 자료 없는 칸은 "–"와 "자료 없음"이고 지어낸 숫자·빈 그래프 틀이 없다
- AC-008.5: Given 막대 눈금, Then `components/charts/scale.ts`의 `niceScale` 규칙을 쓴다

### REQ-009: 매출 화면 (Phase 3 · Step 1 · revenue-screen)
- AC-009.1: Given `/revenue`, When 그리면, Then 승인된 시안처럼 한 쪽에 위에서부터 제목 줄(가져온 시각, PC 연결 때 [다시 가져오기]) → 달 고르기(‹ 달 ›) → 네 덩어리다. 도구 단추 줄이 없다
- AC-009.2: Given 비트 PC(통로 `ready`), When 화면을 열면, Then `planFetch`대로 저절로 가져오며 진행("13달 가운데 n달")을 보이고, 끝나면 저장된 숫자로 다시 그린다. [다시 가져오기]는 고른 달만 다시 읽는다
- AC-009.3: Given 확장이 없는 PC·폰, When 열면, Then 저장된 숫자만 보이고 [다시 가져오기]가 없으며 "의원 PC에서 …에 가져온 숫자예요"를 보인다. 저장된 줄도 없으면 '비트 PC 연결 필요'([비트 PC 연결] → `/claim/setup`)다
- AC-009.4: Given 상태 `empty`·`helper-old`·`extension-old`·`error`, Then 시안처럼 그린다(`extension-old`는 `helper-old`와 같은 모양에 "확장 프로그램을 새 버전으로" 문구, 시안에 더함). 저장 실패(`E-REVENUE-SAVE-FAILED`)면 오류 카드와 [다시 저장]이 있고, 가져오지 못한 달이 있으면 "n달을 가져오지 못했어요"와 [다시 가져오기]가 있다
- AC-009.5: Given 화면 소스, Then 토큰·`ds`만 쓰고(16진수·대괄호 값·`font-bold` 없음), 그래프는 HTML 막대 + `aria-hidden` + 화면 읽기 표다. 폰(768px 미만)의 단추·달 고르기 누름 영역은 44px 이상이고 768px부터 PC 배치다(시험: AC ID를 단 클래스 시험). 390·768·1440에서 가로 스크롤이 없다(AC-011.1)

### REQ-010: 준비 중에서 빼기 (Phase 3 · Step 2 · tab-ready)
- AC-010.1: Given 탭 자료, Then `notReadyFeatures.ts`에 `/revenue` 항목이 없고, `shell/menu.ts`의 매출이 `ready: true`, 대시보드 기능 목차의 매출이 청구와 같은 `'connect-first'`("연결 먼저")이며, [전체 메뉴]의 "준비 중" 수가 하나 준다. 탭 맞춤 시험(`(app)/tabFrame.test.tsx`·`notReadyPages.test.tsx`)이 이를 확인하고, 탭 수를 고정 숫자로 적지 않는다
- AC-010.2: Given `/revenue`, Then 브라우저 탭 이름은 "매출 · 의원 이름"이다
- AC-010.3: Given 문서, Then `plan.md` §2-4와 `docs/ARCHITECTURE.md`의 매출 줄이 '폴더 연결·파일'이 아니라 '비트 PC 도우미 읽기(`revenue.days`) → `sales_days`·`sales_codes`'를 말한다(바뀐 날짜 표시)
- AC-010.4: Given 백업 목록 `src/lib/backup/tables.ts`(청구 사전점검이 만든다), When 그 파일이 이 갈래에 있으면, Then `sales_days`·`sales_codes`가 그 목록에 들어 있다(그 파일의 시험이 확인). 없으면 `docs/ARCHITECTURE.md` DB 표 절에 "백업 목록에 `sales_days`·`sales_codes`를 넣는다" 줄이 있다

### REQ-011: E2E (Phase 3 · Step 3 · revenue-e2e)
- AC-011.1: Given 승인된 시험 계정·확장 없는 브라우저, When `/revenue`를 390·768·1440으로 열면, Then 저장된 줄이 없을 때 '비트 PC 연결 필요'가 보이고 가로 스크롤이 없다(AC-009.5도 이 시험 이름에 단다). 시험은 시작 전에 시험 계정의 매출 줄을 지우고 시작한다(다시 돌려도 같다)
- AC-011.2: Given 시험 코드가 넣은 가짜 확장(가짜 숫자 답), When `/revenue`를 열면, Then 가져온 숫자가 화면에 보이고, 가로챈 나간 요청은 `sales_days`·`sales_codes`뿐이며 본문 칸이 정해 둔 칸뿐이고 차트번호·이름·전화번호·주민번호·파일 이름 모양이 없다
- AC-011.3: Given 같은 계정으로 폰 폭(390)에서 다시 열면, Then 저장된 숫자와 "의원 PC에서 …에 가져온 숫자예요"가 보이고 [다시 가져오기]가 없다
- AC-011.4: Given 저장이 끝난 뒤, When 시험이 같은 계정으로 `sales_days`·`sales_codes` 줄을 다시 읽으면, Then 칸 이름이 정해 둔 것뿐이고 값에 차트번호·이름·전화번호·주민번호·파일 이름 모양이 없다. 시험이 끝나면 시험 계정의 매출 줄을 지운다

### REQ-012: 버전 올리기 (Phase 1 · Step 3 · version-bump)
- AC-012.1: Given 도우미 판, When 이 TASK가 끝나면, Then `helper/Directory.Build.props`의 `Version`과 `src/lib/bridge/versions.ts`의 `LATEST_HELPER`가 같은 다음 판(0.1.0 다음, 예: 0.2.0)이고 같은 커밋에서 바뀐다(`handshake.test.ts`). `MIN_HELPER`·`MIN_EXTENSION`은 그대로다(옛 도우미·확장으로도 청구는 계속 쓰고, 매출 탭만 '새 버전' 상태를 보인다)
- AC-012.2: Given `extension/manifest.json`, Then `version`이 다음 판으로 오르고 manifest 모양 시험이 그대로 통과한다. 도우미 릴리스 태그·웹스토어 올리기는 이 TASK가 하지 않는다(사용자가 그때 말할 때만)

## 범위 밖
- 매출 탭에 현금·카드·계좌이체·미수입금·신환·재진을 보이는 것(읽고 저장은 하지만 그리는 것은 업무일지 탭이 한다)
- 미수발생·지역화폐 금액: 원본 코드에 읽는 곳이 없다. 확인표 '먼저 할 것' ③으로 비트 화면의 칸을 찾은 뒤 명세 변경으로 계약에 더한다(그때까지 업무일지는 직접 입력)
- 확인 필요한 날의 금액 직접 입력
- 내원 1번당 평균(건당 진료비)·신환·재진별 매출
- 직원·인센티브와 이어 붙이기(인건비율), AI 분석에 매출 보내기, 월간 PDF
- 비트 파일 끌어다 놓기로 매출 채우기(plan.md §2-4의 폴더 연결은 이 명세가 도우미 읽기로 대신한다)
- 입원 매출, 다른 지점 합치기, 목표 매출
- 치료 묶음 고치는 화면(묶음은 코드 표 하나로 고정)

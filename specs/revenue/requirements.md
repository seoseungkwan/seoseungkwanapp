# 요구사항: 매출 탭

> **시안 승인: 2026-11-01** 사용자 "이대로 만들기" — `docs/mockups/revenue/index.html`(만든 코드 `gen.py`, 숫자는 모두 예시). 같은 날 사용자 결정: 1인당 평균 = 환자 한 명마다, 환불 날은 추천대로, 치료 묶음은 총괄이 직접 만든다(아래 '배경').
> **'치료 묶음 고치기' 화면(시안 3절)과 묶음 50개 한도도 2026-11-01 사용자 승인**("묶음 화면 좋아요", "적당해 50개면"). TASK-14를 막는 것이 없다.
> **승인 뒤 바뀐 곳은 OK 전**: 명세 변경으로 시안 1절의 '급여·비급여·기타' 덩어리와 '확인 필요한 날' 글자를 다시 그렸다. TASK-8·TASK-9는 이 부분의 사용자 OK 뒤에만 한다. 승인과 OK는 `docs/mockups/revenue/README.md`에 적고, 화면 TASK는 거기서 확인한다.
> **명세 변경 2026-11-01(사용자, 다시 승인받은 뒤 만든다)**: 매출 = 총진료비. 급여·비급여 보기는 급여·비급여·기타 셋. 비트 외래환자경영통계 화면(사용자 캡처)으로 확인한 식: 총진료비 = 요양비용총액 + 비급여 + 100/100미만총액 + 전액본인부담, 요양비용총액 = 조합청구액(공단) + 급여본인부담금. 확인표 '먼저 할 것' ① = 아니오. 바뀐 곳: AC-001.1·001.2·001.3·002.2·003.1·003.2·003.8·004.1·004.3·005.1·005.2·005.5·006.3·007.1·007.2·008.1·008.3·014.1(번호는 그대로).
> 기능 ID: `revenue` · 형식: 요구사항은 `### REQ-001: 제목`, 수용 기준은 `- AC-001.1: Given/When/Then`.
> 각 AC는 시험 하나 이상으로 검증하고, 시험 이름에 AC ID를 넣는다(TASK-1은 문서라 시험 대신 의원 PC 확인표로 확인한다). REQ 번호 = TASK 번호다. Phase·Step은 `tasks.md` 머리말.

## 배경 / 목표
- 탭 틀 계획(`docs/tab-frame/plan.md` §1·§2)이 정한 매출 탭을 채운다. 넣을 것(사용자 결정): **매출 추이(지난달·작년 같은 때 대비)**, **급여·비급여 나눠 보기**(2026-11-01부터 급여·비급여·기타 셋), **치료별 매출**, **환자 1인당 평균 진료비**. 금액은 비트 PC 연결(도우미)로 가져온다. 통계처럼 도구 단추 줄 없이 그래프가 이어지는 한 쪽이다
- 2026-11-01 사용자 결정(다시 묻지 않는다)
  - 시안을 이대로 만든다
  - **환자 1인당 평균 진료비 = 매출 ÷ 그 기간에 다녀간 서로 다른 환자 수**(같은 환자가 여러 번 와도 한 명). 환자 수는 도우미가 비트 DB 안에서 세고 숫자만 돌려준다(차트번호는 PC 밖으로 나가지 않는다)
  - **치료 묶음은 총괄이 직접 만든다**("처방묶는건 내가 골라서 묶게해"): 묶음 이름 짓기, 비트에서 나온 처방(코드와 이름) 가운데 넣을 것 고르기, 이름 바꾸기·지우기, 처방을 다른 묶음으로 옮기기. 어느 묶음에도 없는 처방은 '그 밖 처방'. 묶음은 서버 표 `rx_groups`(묶음 이름·처방 코드 목록뿐, 환자 자료 없음)에 두고, 나중에 통계 탭도 같은 표를 쓸 수 있다. 처음에는 원본 일일 보고의 다섯 가지(도수치료·체외충격파·C-arm 주사·초음파·냉동치료)를 고칠 수 있는 제안으로 채운다
  - 환불·예치금이 있는 날은 그날 금액을 합계에서 빼고 날짜만 알린다(금액 맞춤 검사에 걸린 날도 같다)
  - **매출 = 총진료비**(2026-11-01). **급여·비급여 보기는 셋으로 나눈다**: 급여(요양비용총액 = 공단부담 + 급여 본인부담) · 비급여 · 기타(100/100미만총액 + 전액본인부담). 셋을 더하면 총진료비다
  - 업무일지 탭이 하루 숫자를 비트에서 채울 수 있게, 같은 읽기(`revenue.days`)가 날마다 수납 나눔(현금·카드·계좌이체·미수입금)과 신환·재진 수도 돌려준다. 두 번째 읽기 명령을 만들지 않는다(계약은 design.md 5절)
- 서버에는 집계 숫자만 간다: 날짜별 합계 금액·건수와 달별 처방 코드 합계뿐이다. 환자 줄(이름·차트번호·접수 번호)은 비트 DB 밖으로 나오지 않는다. 도우미가 비트 DB 안에서 더하고 센 숫자만 돌려준다
- 금액을 읽는 방법은 원본 양지바른 사전점검이 이미 의원에서 쓰는 SQL을 그대로 옮긴다(`vendor/drbit_export/OperationalReportSql.cs`, 비트 '외래환자경영통계' 조건: 회계일 기준 정상수납 + 미수입금, 환불·변경수납·예치금이 있는 날은 금액 '확인 필요'). 치료별 금액은 원본 `TrendDataSource.cs`의 처방 금액 식(소모량 × 단가)을 코드별로 묶는다. 자세한 것은 design.md 2절
- 총진료비의 짜임은 답을 받았다(확인표 '먼저 할 것' ① = 아니오, 2026-11-01, design.md 2절 1). 아직 코드로 확인하지 못한 것(요양비용총액·급여 본인부담을 읽는 칸의 뜻, 미수발생·지역화폐를 읽는 곳, 치료 코드가 이 의원 코드와 같은지, 읽는 시간, '확인 필요' 날이 얼마나 많은지)은 TASK-1의 의원 PC 확인표로 확인한다. '먼저 할 것' ②·③은 만드는 일을 막지 않는다(design.md 14절)
- 화면 AC는 내용(보이는 것·단추·상태)만 정한다. 배치·문구는 승인된 시안을, 모양은 `docs/UI_GUIDE.md`를 따른다

## 요구사항

### REQ-001: 의원 PC 확인표 (Phase 1 · Step 0 · pc-check)
- AC-001.1: Given `docs/revenue/pc-check.md`, When 총괄이 읽으면, Then '먼저 할 것'(앱 없이 비트 화면만 보는 일)에 칸이 셋 있다: ① 비트 '외래환자경영통계' 어제 하루 화면에서 "총진료비 = 조합청구액(공단부담금) + 본인부담금 + 비급여"가 맞는지 '예/아니오'(금액은 적지 않는다). **답은 '아니오'로 받았고**(2026-11-01) 문서에 적혀 있으며, 급여 계산은 이 답에 맞춰 정했다 ② 이 의원 비트의 도수치료·체외충격파·C-arm 주사·초음파·냉동치료 처방 코드가 `도수`·`CARM1`·`SONO1`·`CRYO`·`ESWT`(이 글자가 든 코드)와 '같음/다름'(다르면 그 코드 글자만) ③ '미수발생'·'지역화폐' 금액이 보이는 비트 화면 이름·칸 이름(금액은 적지 않는다). ②·③은 총괄이 의원 PC에서 적고, 칸이 비어 있어도 어떤 TASK도 막지 않는다(②는 처음 보이는 제안 묶음에만 쓰이고 편집 화면에서 고칠 수 있다. ③은 나중에 업무일지 자동 채우기에만 쓰인다)
- AC-001.2: Given 같은 문서, When Phase 3이 끝나 의원 PC의 매출 탭에서 숫자가 보인 뒤, Then '매출 탭에서 볼 것' 칸이 다섯 있다: ① 본 달(아래)의 매출·공단부담·비급여(매출 탭)와 외래환자경영통계가 '같음/다름' ② 지난달 환자 수(매출 탭 '환자 1인당 평균 진료비'의 환자 수)와 비트 통계의 실인원이 '같음/다름' ③ 처음 가져오기에 걸린 시간(분) ④ 최근 3달 '확인 필요한 날' 수(날 수, 금액 아님) ⑤ 두 줄: 본 달의 급여·비급여·기타(매출 탭)가 외래환자경영통계의 요양비용총액·비급여·(100/100미만총액 + 전액본인부담)과 '같음/다름'(기타를 읽는 칸이 원본 SQL에 없어 새로 맞춘 것이라 확인한다), 그리고 본 달 외래환자경영통계의 건강생활유지비가 0원이 아닌가 '예/아니오'. ①·⑤를 보는 달: 매출 탭 합계에는 확인 필요한 날의 금액이 빠지므로, 최근 13달 가운데 이미 끝났고 숫자가 있으며 확인 필요한 날이 없는 달을 '본 달'로 골라 비트도 그 달 1일~말일로 연다. 그런 달이 없으면 끝났고 숫자가 있는 달 가운데 확인 필요한 날이 가장 적은 달을 고르고, 그 날들을 뺀 나머지 기간을 비트에서 하나씩 열어 계산기로 더해 매출 탭과 견준다(더한 금액도 적지 않는다). 그 달도 확인 필요한 날이 5일을 넘거나 끝났고 숫자가 있는 달이 하나도 없으면, 더하지 말고 ①·⑤를 '다름'으로, 본 달을 '없음'으로 적고 ⑤ 둘째 줄은 비운 채 알린다(design.md 5-2). ①·⑤의 '같음'은 만 원 자리까지 같다는 뜻이다(매출 탭이 만 원 아래를 버려 보이므로 비트 금액도 만 원 아래를 버리고 견준다). 금액은 어느 칸에도 적지 않는다. 수납 나눔(현금·카드·계좌이체·미수입금)·신환·재진 맞추기는 이 표가 아니라 업무일지 4단계 확인표가 한다고 한 줄로 알린다
- AC-001.3: Given 같은 문서, Then 금액·환자 이름·차트번호를 적는 칸이 없고 "예/아니오·같음/다름, 다를 때의 처방 코드 글자(②), 비트 화면·칸 이름(③), 본 달, 걸린 시간·날 수만 적어요. 금액과 환자 정보는 적지 않아요" 안내가 있다

### REQ-002: 명령 표 `revenue.days` (Phase 1 · Step 1 · bridge-contract)
- AC-002.1: Given `src/lib/bridge/commands.json`, When 읽으면, Then `revenue.days`가 `patient: false`, `maxDays: 31`, `args {from: date, to: date}`로 있다. 웹의 `SMALL_COMMANDS`와 도우미 명령 표 시험이 이 명령을 숫자 명령으로 안다(명령 수를 고정 숫자로 시험하지 않는다)
- AC-002.2: Given 도우미 답 `data`, When `checkResult('revenue.days', data)`, Then 칸이 정확히 `days`·`codes` 둘일 때만 통과한다. `days` 줄은 칸이 정확히 `date`·`visits`·`newPatients`·`returnVisits`·`patientsToDate`·`total`·`insurer`·`noncovered`·`copay`·`otherTotal`·`cash`·`card`·`transfer`·`receivableIn`·`unconfirmed`(design.md 5절 표, `copay`·`otherTotal`은 2026-11-01 더함)이고, 날짜는 오름차순·하루도 빠짐없이 이어지고·31개 이하, 숫자 칸은 0 이상 안전한 정수 또는 `null`, `unconfirmed`가 `true`면 금액 아홉 칸(`total`~`receivableIn`)이 모두 `null`이고 `false`면 모두 숫자다. `codes` 줄은 칸이 정확히 `code`·`name`·`count`·`amount`이고, `code`는 `^[0-9A-Za-z가-힣_.\-]{1,30}$`, `name`은 1~100자 글자(줄바꿈·제어 문자 없음) 또는 `null`, `count`는 0 이상 정수, `amount`는 0 이상 안전한 정수 또는 `null`, 1,000개 이하·코드 중복 없음이다. 어긋나면 `E-BRIDGE-BAD-REPLY`
- AC-002.3: Given 줄에 정해 둔 칸 밖의 칸(예: `chart`·`name`)이 하나라도 있거나 숫자 칸이 글자·소수·음수면, When 검사하면, Then 통과하지 않는다(환자 칸이 화면에 닿지 않는다)
- AC-002.4: Given 화면 통로 `connectScreenBridge({runtime})`(Worker 없음), When `call('revenue.days', {from, to})`, Then 확장에 봉투 하나를 보내고 검사한 답을 돌려준다. 조각(chunk)을 받지 않는다

### REQ-003: 도우미 매출 읽기 (Phase 1 · Step 2 · helper-revenue-read)
- AC-003.1: Given 등록된 병원, When `revenue.days {from, to}`, Then 처리기 맨 처음에 등록 확인 관문(`HospitalGate.Open`)을 지나고, 원본 `HistoryGuard`를 한 번, `from`부터 `to`까지 날마다(빠진 날 없이) 원본 `UnsupportedFinance`·`Patients`와 새 문장 `DistinctPatients`를 돌린다. 원본 `OperationalReportData`처럼 앞 검사가 0일 때만 다음 검사(`FinanceMultiplicity` → `ReceivableMultiplicity`)로 가고, 세 검사를 모두 지난 날에만 원본 `FinanceNormal`·`FinanceReceivable`과 새 문장 `FinanceNormalExtra`·`FinanceReceivableExtra`를 돌린다(세 검사를 지난 날은 문장 9개, 걸린 날은 3~5개). 원본 문장은 원본 사본과 공백·끝 `;`·`--` 주석 줄만 다르다(사본 비교 시험). 두 Extra 문장은 원본 `FinanceNormal`·`FinanceReceivable`과 마지막 `SELECT` 줄(과 `FinanceReceivableExtra`의 `NativeRows` 칸 목록에 `p.OrpInsAmt,p.OrpInsOwn`을 더한 것)만 다르다(시험이 다른 줄을 확인)
- AC-003.2: Given 하루, When 앞의 세 검사(`UnsupportedFinance`·`FinanceMultiplicity`·`ReceivableMultiplicity`) 가운데 하나라도 0이 아니면, Then 그날 금액 아홉 칸은 `null`이고 `unconfirmed: true`다(원본 `SetFinanceUnconfirmed`). 아니면 `total`·`insurer`·`noncovered` = `FinanceNormal`과 `FinanceReceivable` 답의 첫째·둘째·셋째 칸 합, `cash`·`card`·`transfer` = `FinanceNormal`의 넷째·다섯째·여섯째 칸, `receivableIn` = `FinanceReceivable`의 넷째+다섯째+여섯째 칸이다(원 미만 버림 정수, DB `NULL`은 0). 같은 수납 줄에서 새 문장 `FinanceNormalExtra`·`FinanceReceivableExtra`로 요양비용총액(`OrpInsAmt` 합)과 급여 본인부담금(`OrpInsOwn` 합)을 더해 읽고, `copay` = 급여 본인부담금 합, `otherTotal` = `total` − (`insurer` + `copay`) − `noncovered`(모두 원 미만을 버린 정수, 기타 = 100/100미만총액 + 전액본인부담. 그래서 급여 + 비급여 + 기타가 `total`과 정수로 맞는다)로 낸다. 원 미만을 버리기 **전** 값으로 비교해 `insurer + copay ≠ 요양비용총액`이거나(시험: 1000.5 + 499.5와 1500은 같으므로 '확인 필요'가 아니다) 아홉 칸 가운데 음수가 있으면 그날도 `unconfirmed: true`이고 `cash`·`card`·`transfer`·`receivableIn`을 포함한 금액 아홉 칸이 `null`이다(맞춰 고치지 않는다)
- AC-003.3: Given 하루의 `Patients` 답, When 셋째·넷째·다섯째 칸(차트번호 없음·중복·첫 내원 못 찾음)이 모두 0이면, Then `visits`는 첫째 칸, `newPatients`는 둘째 칸, `returnVisits`는 `visits − newPatients`다. 하나라도 0이 아니면 그날 셋 다 `null`이다. `HistoryGuard`가 0이 아니면(옛 자료가 따로 있어 신환을 정할 수 없음) 모든 날의 `newPatients`·`returnVisits`가 `null`이다(`visits`는 그대로)
- AC-003.4: Given 하루, When `DistinctPatients`를 `@from` = `from` 0시, `@to` = 그다음 날 0시로 돌리면, Then `patientsToDate`는 `from`부터 그날까지 다녀간 서로 다른 환자 수(비트 DB 안의 `COUNT(DISTINCT …)`)다. 차트번호 없는 내원이 하나라도 있으면 `null`이다. 차트번호는 도우미 밖으로 나가지 않는다
- AC-003.5: Given 기간, When 코드별 금액을 읽으면, Then 새 문장 `CodeAmounts` 하나로 처방 코드마다 유효 처방 줄 수(`count`), 금액(`amount`, 원본 `TrendDataSource`의 `일수 × 수량 × 단가` 식, 원 미만 버림), 처방 이름(`name`, 비트 처방 목록 `SeeMst`에서 적용일이 가장 늦은 `SeeKorNam`, 앞뒤 공백 뺌, 100자 넘으면 100자까지, 없거나 비면 `null`)을 낸다. 값이 빠진 줄이 있는 코드는 `amount: null`이다. 앞뒤 공백을 뺀 뒤 같은 코드가 된 줄은 하나로 합친다(건수·금액을 더하고, 하나라도 `null`이면 `null`). AC-002.2 글자 모양이 아닌 코드와, 금액 순으로 999번째 뒤의 코드는 이름 없는 한 줄 `_REST`(`name: null`)로 합친다(그래서 코드 때문에 한 달 전체가 실패하지 않는다)
- AC-003.6: Given 읽기 실패·시간 초과·등록 확인 실패, When 처리하면, Then 일부만 보내지 않고 오류 하나만 보낸다(`E-BIT-READ-FAILED` 또는 관문의 오류 번호)
- AC-003.7: Given 답과 진단 기록, Then 차트번호·이름·접수 번호가 없다(시험: 가짜 DB가 준 가짜 차트번호 글자가 답·기록 어디에도 없음). 답의 칸은 AC-002.2와 같다
- AC-003.8: Given 허용 목록, When 매출 문장을 더하면, Then `ReadOnlyGuard`는 매출 문장 열한 개(원본 7 + `DistinctPatients` + `CodeAmounts` + `FinanceNormalExtra` + `FinanceReceivableExtra`)를 정해 둔 매개변수(`@day`·`@nextDay` Char 8, `@from`·`@to` Char 12, `@hospital` VarChar 32, 문장마다 쓰는 것만)와 함께만 통과시키고, 이 문장들은 읽기 문장 하나다(`SELECT` 또는 `WITH`로 시작, `;`·주석·쓰기 낱말 없음). 기존 `Sql` 상수와 기존 시험은 바뀌지 않는다

### REQ-004: 매출 표 (Phase 2 · Step 0 · revenue-tables)
- AC-004.1: Given migration `supabase/migrations/20261101000400_revenue.sql`, When PGlite에서 auth migration 뒤에 실행하면, Then 표 `sales_days`(`hospital_id`·`day`·`visits`·`new_patients`·`return_visits`·`patients_to_date`·`total`·`insurer`·`noncovered`·`copay`·`other_total`·`cash`·`card`·`transfer`·`receivable_in`·`unconfirmed`·`fetched_at`, 기본 키 `hospital_id`+`day`), `sales_codes`(`hospital_id`·`month`·`code`·`name`·`count`·`amount`·`fetched_at`, 기본 키 `hospital_id`+`month`+`code`), `rx_groups`(`id`·`hospital_id`·`name`·`codes`·`sort_order`·`updated_at`, 기본 키 `id`, 병원마다 `name` 하나)가 생기고 세 표 모두 RLS가 켜져 있다. 칸 목록은 정확히 이것뿐이다(환자 칸 없음)
- AC-004.2: Given 표, When anon이 읽거나 쓰면 거부된다. authenticated는 승인(`approved`)된 자기 병원 줄만 다룬다: `sales_days`는 읽기·넣기·고치기·지우기, `sales_codes`는 읽기·넣기·지우기. 남의 병원 줄은 안 보이고 지워지지 않으며, `hospital_id`를 직접 넣거나 바꾸면 거부된다. 승인 대기·거절 사용자는 아무 줄도 못 읽고 못 쓴다
- AC-004.3: Given 줄, When DB 제약을 어기면 거부된다: 숫자 칸은 0 이상 정수, `unconfirmed`가 참이면 금액 아홉 칸이 모두 `null`이고 거짓이면 모두 있음, `day`는 2000-01-01 이후, `month`는 1일, `code`는 AC-002.2 모양, `sales_codes.name`은 1~100자 또는 `null`, `rx_groups.name`은 앞뒤 공백 없는 1~30자이고 제어 문자가 없고 숫자가 6개 이상 이어지지 않으며(주민번호·전화번호·차트번호 모양을 막는 가벼운 울타리) 병원 안에서 겹치지 않음, `rx_groups.codes`는 1,000개 이하이고 하나하나가 `null`이 아닌 AC-002.2 모양이며 `_REST`가 없음, `sort_order`는 0~999
- AC-004.4: Given `hospital_id`를 빼고 넣으면, Then DB가 `public.my_hospital_id()`(승인된 내 병원)로 채우고, 줄을 고치면 `fetched_at`이 DB 시각으로 바뀐다. 다른 갈래가 같은 글자의 `my_hospital_id()`를 먼저 만든 DB에서도 이 migration이 오류 없이 된다
- AC-004.5: Given `rx_groups`, When 사용자가 다루면, Then 승인된 자기 병원 줄만 읽기·넣기·고치기·지우기가 되고(남의 병원 줄은 안 보이고 안 바뀜), `id`·`hospital_id`·`updated_at`은 DB가 채운다(칸 권한 없음). 고치면 `updated_at`이 DB 시각으로 바뀐다(`public.touch_updated_at()`, 갈래 규칙 C1 글자 그대로, 이미 있어도 된다)
- AC-004.6: Given DB 함수 `public.save_rx_groups(groups jsonb)`(호출한 사람 권한, RLS 그대로), When 묶음 목록 전체를 넘기면, Then 한 트랜잭션 안에서 `id`가 있는 내 묶음은 고치고, `id`가 없는 묶음은 넣기만 하며(이름이 같다고 다른 줄을 고치지 않는다, 줄은 `id`로만 고른다), 목록에 없는 내 묶음은 지운 뒤 저장된 목록을 돌려준다. 하나라도 실패하면 아무것도 바뀌지 않는다(시험: 다섯 개 가운데 하나가 제약에 걸리면 표가 그대로). 이름 맞바꾸기(A↔B)와 '묶음 A를 지우고 새 묶음 A 넣기'는 순서와 상관없이 된다(이름 겹침 검사는 트랜잭션 끝에). 목록에 남긴 묶음과 같은 이름의 새 묶음은 오류이고 아무것도 바뀌지 않는다. 남의 병원 `id`를 넘기면 그 줄은 바뀌지 않고 오류다. `groups`가 `null`이거나 배열이 아니거나 50개를 넘으면 거부한다

### REQ-005: 금액 나눔·기간 합·비교 (Phase 2 · Step 1 · revenue-summary)
- AC-005.1: Given 하루 줄, When `splitDay(row)`, Then 급여 = `insurer + copay`(요양비용총액), 공단부담 = `insurer`, 본인부담 = `copay`(= 급여 − 공단부담), 비급여 = `noncovered`, 기타 = `otherTotal`(100/100미만총액 + 전액본인부담)이다(비트 외래환자경영통계의 식, 2026-11-01 사용자 화면으로 확인). 급여 + 비급여 + 기타 ≠ `total`이거나 어느 칸이든 음수면 그날은 '확인 필요'(`null`)로 보고 고쳐 맞추지 않는다. 도우미가 만든 줄은 `otherTotal`이 나머지라 이 합 검사에 걸리지 않는다. 기타에 섞인 다른 금액은 이 검사로 잡히지 않고 의원 PC 확인표 ⑤만 본다(design.md 2절 2)
- AC-005.2: Given 기간과 날 줄, When `sumPeriod(rows, range)`, Then 확인된 날(금액이 있는 날)의 총액(= 매출, 총진료비)·급여·공단부담·본인부담·비급여·기타 합(원 정수, 날 금액의 합, 반올림 없음, 급여 + 비급여 + 기타 = 총액), 확인 필요한 날 목록, 내원 합, 환자 수(기간이 그 달 1일에 시작하면 기간 마지막 날 줄의 `patientsToDate`, 아니면 `null`)를 낸다. 기간 안 줄이 없거나 모든 날의 금액·내원이 0이고 확인 필요한 날도 없으면 `null`('자료 없음')이다
- AC-005.3: Given 고른 달과 오늘(한국 날짜), When `periodsFor(month, today)`, Then 고른 기간 = 그 달 1일 ~ (그 달 말일과 어제 가운데 이른 날), 지난달 같은 기간 = 지난달 1일 ~ 같은 날짜(지난달이 짧으면 말일), 작년 같은 때 = 작년 같은 달 1일 ~ 같은 날짜(2월 29일은 28일)다. 처음 고르는 달은 어제가 속한 달이다. 날짜는 `lib/analytics/dates.ts`로만 계산한다
- AC-005.4: Given 두 기간 합, When `compare(now, before)`, Then 늘고 준 비율을 소수 첫째 자리 버림으로 낸다(방향 `up`·`down`·`same`). `before`가 `null`이거나 0이면 "비교할 수 없음"이다
- AC-005.5: Given 날 줄과 마지막 달, When `monthSeries(rows, lastMonth, today)`, Then 마지막 달부터 거꾸로 13달마다 총액·급여·비급여·기타·내원 합·환자 수와 1인당 평균을 낸다. 자료 없는 달은 `null`(0이 아님), 아직 끝나지 않은 달은 `partial: true`
- AC-005.6: Given 기간 합, When `perPatient(sum)`, Then 환자 1인당 평균 = 확인된 날의 총액 합 ÷ 기간 환자 수(원 미만 버림)다. 환자 수가 `null`이거나 0이면 `null`이다. 기간에 확인 필요한 날이 있으면 `lowered: true`(그날 매출이 빠져 실제보다 낮을 수 있음)

### REQ-006: 치료 묶음 계산·고치기 (Phase 2 · Step 2 · treatment-groups)
- AC-006.1: Given 코드 줄과 묶음 목록(`RxGroup[]`: 이름·코드 목록·순서), When `groupTreatments(codes, groups)`, Then 코드마다 그 코드를 품은 첫 묶음(`sortOrder` 순)에 넣는다(코드 하나는 한 번만 센다). 어느 묶음에도 없는 코드와 `_REST`는 '그 밖 처방'이다
- AC-006.2: Given 묶음, Then 묶음마다 금액 합·건수 합을 내고 금액 큰 순(같으면 `sortOrder` 순), '그 밖 처방'은 맨 뒤다. 금액이 `null`인 코드는 금액 합에서 빼고 그 묶음에 `missing: true`를 단다. 금액·건수가 모두 0인 묶음은 빼고, 코드가 없으면 빈 목록이다
- AC-006.3: Given 아는 처방 코드 목록, When `suggestGroups(codes)`(저장된 묶음이 하나도 없을 때만 쓴다), Then 원본 일일 보고(`OperationalReportSql.Treatments`) 규칙으로 고칠 수 있는 제안 묶음 다섯 개를 만든다: 도수치료(앞뒤 공백 뺀 코드가 `도수`), 체외충격파(대문자로 `ESWT`를 품음), C-arm 주사(`CARM1`), 초음파(`SONO1`), 냉동치료(`CRYO`). 제안은 저장되지 않은 표시(`suggested: true`)를 단다. 이 규칙은 `src/lib/revenue/treatments.ts`의 제안 표 하나에만 있다. 이 의원 코드가 규칙에 맞지 않아도(확인표 ② = 다름) 제안 다섯 개는 그대로 나오고, 맞는 코드가 없는 묶음은 처방 0개이며 그 코드는 '그 밖 처방'이다. 총괄이 편집 화면에서 고치므로 ② 답을 기다리지 않는다
- AC-006.4: Given 묶음 목록, When 고치기 함수 `addGroup(groups, name)`·`renameGroup(groups, index, name)`·`deleteGroup(groups, index)`·`moveCode(groups, code, toIndex | null)`를 부르면, Then 새 목록을 돌려준다(받은 목록은 그대로). 이름은 앞뒤 공백을 빼고 1~30자이고 겹치지 않으며 제어 문자가 없고 숫자가 6개 이상 이어지지 않아야 한다(아니면 오류 이유 `empty`·`tooLong`·`duplicate`·`badChars`·`digits`). 묶음을 지우면 그 코드는 어느 묶음에도 없게 된다. `moveCode`는 코드를 다른 모든 묶음에서 빼고 고른 묶음(목록 안 자리)에 넣는다(`null`이면 그 밖). 묶음 50개(`tooMany`)·묶음당 코드 1,000개를 넘지 않는다

### REQ-007: 저장·가져오기 (Phase 2 · Step 3 · revenue-sync)
- AC-007.1: Given 오늘과 저장된 날 목록, When `planFetch(today, savedDays)`, Then 어제가 속한 달부터 거꾸로 13달 가운데 '와야 할 날'(1일 ~ 말일과 어제 가운데 이른 날)이 하나라도 저장돼 있지 않은 달을 **최근 달부터** 돌려준다. 달마다 기간은 그 달 1일 ~ 와야 할 마지막 날이다(31일 이하). 다 저장된 달은 넣지 않는다. 알림: 확인표 ⑤가 '다름'으로 나와 도우미를 고쳐도, 이미 저장된 날은 `planFetch`가 다시 읽지 않고 [다시 가져오기]는 고른 달만 읽는다. 그래서 그때의 명세 변경에는 13달 모두 다시 읽기를 넣어야 한다
- AC-007.2: Given 검사를 지난 답, When `saveMonth(month, result)`, Then 답의 첫 날이 그 달 1일인지 확인하고(아니면 저장하지 않고 `E-REVENUE-SAVE-FAILED`, `patientsToDate`가 1일부터 센 값이어야 해서), 그 달 코드 줄을 지우고 새로 넣은 **뒤에** 날 줄을 `hospital_id`+`day`로 upsert한다(코드 저장이 실패하면 날 줄이 없어 그 달을 다시 가져온다). 보내는 줄의 칸은 `sales_days` 열다섯 칸(`day`~`unconfirmed`)·`sales_codes` 다섯 칸(`month`·`code`·`name`·`count`·`amount`)뿐이다(시험: 보내는 객체의 칸 이름 비교). 저장이 실패하면 `E-REVENUE-SAVE-FAILED`
- AC-007.3: Given `syncRevenue({call, store, today, months?, onProgress})`, When 부르면, Then 가져올 달마다 차례로 `revenue.days` → 저장을 하고 달마다 `onProgress({done, total, month})`를 알린다. 한 달의 읽기·검사·저장 오류(`E-BIT-READ-FAILED`·`E-BRIDGE-BAD-REPLY`·`E-REVENUE-SAVE-FAILED`)는 그 달만 `failed`에 넣고 다음 달을 계속한다. 통로·도우미·등록 오류(그 밖의 번호)는 거기서 멈춘다. `months`를 주면([다시 가져오기]) 그 달만 다시 읽는다. 도우미가 `E-HELPER-UNKNOWN-COMMAND`를 주면 `helperOld`, 확장이 `E-BRIDGE-REJECTED`를 주면(옛 확장은 모르는 명령을 막는다) `extensionOld`를 돌려준다
- AC-007.4: Given `loadRevenue(fromMonth, toMonth)`, When 읽으면, Then 그 달들의 날 줄·코드 줄(이름 포함)과 가장 늦은 `fetched_at`을 돌려준다(RLS가 내 병원 줄만 준다)
- AC-007.5: Given 오류 번호 `E-REVENUE-SAVE-FAILED`, When 오류 카드를 그리면, Then `lib/errors.ts`의 '무엇이 · 어떻게 고치나' 문구가 있다

### REQ-008: 화면 보기 모양 (Phase 3 · Step 0 · revenue-view)
- AC-008.1: Given 저장된 줄·묶음(저장된 것, 없으면 제안)·고른 달·오늘, When `buildRevenueView(input)`, Then 승인된 시안의 네 덩어리(매출 추이(매출 = 총진료비) · 급여·비급여·기타(셋으로) · 치료별 매출(묶음별, 제안이면 "제안 묶음" 표시) · 환자 1인당 평균 진료비(환자 한 명 기준))의 글자와 막대 높이·폭(0~100 %, 소수 둘째 자리)을 낸다. 큰 금액은 만 원 아래를 버린 "1억 6,248만 원" 모양이고, 화면 읽기 표는 원 단위 그대로다
- AC-008.2: Given 상태 입력, Then 보기 상태는 `connect-needed`(연결 안 됨·저장된 줄 없음) · `fetching`(done/total) · `ready`(가져오지 못한 달이 있으면 그 달 목록도) · `empty`(고른 달 자료 없음) · `helper-old` · `extension-old` · `saved-only`(연결 안 됨·저장된 줄 있음, 마지막 가져온 시각) · `error`(오류 번호) 가운데 하나다
- AC-008.3: Given 고른 기간에 확인 필요한 날이 있으면, Then "확인 필요한 날 n일"과 날짜를 보이고, 그날 금액이 합계에 들어가지 않았고 1인당 평균이 낮게 보일 수 있다고 알린다. 까닭(환불 등)은 말하지 않는다(계약에 까닭 칸이 없고, 금액 맞춤 검사에 걸린 날은 환불이 아니다). 없으면 "없음"이다
- AC-008.4: Given 몫·증감, Then 소수 첫째 자리 버림이고 빼기는 U+2212다. 자료 없는 칸은 "–"와 "자료 없음"이고 지어낸 숫자·빈 그래프 틀이 없다
- AC-008.5: Given 막대 눈금, Then `components/charts/scale.ts`의 `niceScale` 규칙을 쓴다

### REQ-009: 매출 화면 (Phase 3 · Step 1 · revenue-screen)
- AC-009.1: Given `/revenue`, When 그리면, Then 승인된 시안처럼 한 쪽에 위에서부터 제목 줄(가져온 시각, PC 연결 때 [다시 가져오기]) → 달 고르기(‹ 달 ›) → 네 덩어리다. 도구 단추 줄이 없다
- AC-009.2: Given 비트 PC(통로 `ready`), When 화면을 열면, Then `planFetch`대로 저절로 가져오며 진행("13달 가운데 n달")을 보이고, 끝나면 저장된 숫자로 다시 그린다. 제목 줄의 [다시 가져오기]는 고른 달만 다시 읽는다
- AC-009.3: Given 확장이 없는 PC·폰, When 열면, Then 저장된 숫자만 보이고 [다시 가져오기]가 없으며 "의원 PC에서 …에 가져온 숫자예요"를 보인다. 저장된 줄도 없으면 '비트 PC 연결 필요'([비트 PC 연결] → `/claim/setup`)다
- AC-009.4: Given 상태 `empty`·`helper-old`·`extension-old`·`error`, Then 시안처럼 그린다(`extension-old`는 `helper-old`와 같은 모양에 "확장 프로그램을 새 버전으로" 문구, 시안에 더함). 저장 실패(`E-REVENUE-SAVE-FAILED`)면 오류 카드와 [다시 저장]이 있고, 가져오지 못한 달이 있으면 알림 줄 "n달을 가져오지 못했어요"와 그 줄의 [다시 가져오기](가져오지 못한 달들만 다시 읽음)가 있다
- AC-009.5: Given 화면 소스, Then 토큰·`ds`만 쓰고(16진수·대괄호 값·`font-bold` 없음), 그래프는 HTML 막대 + `aria-hidden` + 화면 읽기 표다. 폰(768px 미만)의 단추·달 고르기 누름 영역은 44px 이상이고 768px부터 PC 배치다(시험: AC ID를 단 클래스 시험). 390·768·1440에서 가로 스크롤이 없다(AC-011.1)

### REQ-010: 준비 중에서 빼기 (Phase 3 · Step 2 · tab-ready)
- AC-010.1: Given 탭 자료, Then `notReadyFeatures.ts`에 `/revenue` 항목이 없고, `shell/menu.ts`의 매출이 `ready: true`, 대시보드 기능 목차의 매출이 청구와 같은 `'connect-first'`("연결 먼저")이며, [전체 메뉴]의 "준비 중" 수가 하나 준다. 탭 맞춤 시험(`(app)/tabFrame.test.tsx`·`notReadyPages.test.tsx`)이 이를 확인하고, 탭 수를 고정 숫자로 적지 않는다
- AC-010.2: Given `/revenue`, Then 브라우저 탭 이름은 "매출 · 의원 이름"이다
- AC-010.3: Given 문서, Then `plan.md` §2-4와 `docs/ARCHITECTURE.md`의 매출 줄이 '폴더 연결·파일'이 아니라 '비트 PC 도우미 읽기(`revenue.days`) → `sales_days`·`sales_codes`'를 말한다(바뀐 날짜 표시)
- AC-010.4: Given 백업 목록 `src/lib/backup/tables.ts`(청구 사전점검이 만든다), When 그 파일이 이 갈래에 있으면, Then `sales_days`·`sales_codes`·`rx_groups`가 그 목록에 들어 있다(그 파일의 시험이 확인). 없으면 `docs/ARCHITECTURE.md` DB 표 절에 "백업 목록에 `sales_days`·`sales_codes`·`rx_groups`를 넣는다(`rx_groups`는 총괄이 손으로 만든 유일한 자료)" 줄이 있다

### REQ-011: E2E (Phase 3 · Step 3 · revenue-e2e)
- AC-011.1: Given 승인된 시험 계정·확장 없는 브라우저, When `/revenue`를 390·768·1440으로 열면, Then 저장된 줄이 없을 때 '비트 PC 연결 필요'가 보이고 가로 스크롤이 없다(AC-009.5도 이 시험 이름에 단다). 시험은 시작 전에 시험 계정의 매출 줄을 지우고 시작한다(다시 돌려도 같다)
- AC-011.2: Given 시험 코드가 넣은 가짜 확장, When `/revenue`를 열고 [묶음 고치기]에서 묶음 하나를 고쳐 저장하면, Then 가져온 숫자와 고친 묶음이 화면에 보이고, 가로챈 나간 요청은 `sales_days`·`sales_codes`·`rx_groups`(와 `save_rx_groups` 호출)뿐이며 본문의 칸 이름이 표마다 정해 둔 칸뿐이다(`sales_codes.name`·`rx_groups.name`은 허용 칸). 가짜 확장은 한 달의 답에 일부러 심은 가짜 환자 자료(정해 둔 칸 밖의 `chart`·`patientName` 칸에 가짜 차트번호 `900001`과 가짜 이름 `가상환자01`)를 섞어 보내고, 그 달은 검사에서 거부된다. 어느 요청 본문에도 심은 값(`900001`·`가상환자01`)과 전화번호(`010-…-…`)·주민번호(6자리-7자리)·파일 이름(`.xls`·`.xlsx`·`.csv`) 모양이 없다. 가로챌 때 머리글·쿠키·apikey 값은 모으지 않고 본문만 보며, 실패하면 걸린 종류 이름만 알린다(`expect(hits).toEqual([])`, hits에는 값이 아니라 종류 이름)
- AC-011.3: Given 같은 계정으로 폰 폭(390)에서 다시 열면, Then 저장된 숫자와 "의원 PC에서 …에 가져온 숫자예요"가 보이고 [다시 가져오기]가 없다
- AC-011.4: Given 저장이 끝난 뒤, When 시험이 같은 계정으로 `sales_days`·`sales_codes`·`rx_groups` 줄을 다시 읽으면, Then 칸 이름이 표마다 정해 둔 것뿐이고 값에 심은 값(`900001`·`가상환자01`)과 전화번호·주민번호·파일 이름 모양이 없다. 시험이 끝나면 시험 계정의 매출 줄과 묶음 줄을 지운다

### REQ-012: 버전 올리기 (Phase 1 · Step 3 · version-bump)
- AC-012.1: Given 도우미 판, When 이 TASK가 끝나면, Then `helper/Directory.Build.props`의 `Version`과 `src/lib/bridge/versions.ts`의 `LATEST_HELPER`가 같은 다음 판(0.1.0 다음, 예: 0.2.0)이고 같은 커밋에서 바뀐다(`handshake.test.ts`). `MIN_HELPER`·`MIN_EXTENSION`은 그대로다(옛 도우미·확장으로도 청구는 계속 쓰고, 매출 탭만 '새 버전' 상태를 보인다)
- AC-012.2: Given `extension/manifest.json`, Then `version`이 다음 판으로 오르고 manifest 모양 시험이 그대로 통과한다. 도우미 릴리스 태그·웹스토어 올리기는 이 TASK가 하지 않는다(사용자가 그때 말할 때만)

### REQ-013: 묶음 저장 (Phase 2 · Step 4 · rx-group-store)
- AC-013.1: Given `createRxGroupStore(client)`, When `listGroups()`, Then 내 병원의 `rx_groups` 줄을 `sortOrder` 순 `RxGroup[]`(`id`·`name`·`codes`·`sortOrder`)로 돌려준다(RLS가 내 병원 줄만 준다). 줄이 없으면 빈 목록이다. 읽기에 실패하면 빈 목록이 아니라 `E-REVENUE-GROUP-LOAD-FAILED`를 던진다(화면이 제안 묶음으로 바꿔 보이지 않게)
- AC-013.2: Given 고친 목록, When `saveGroups(after)`, Then `save_rx_groups` 함수(004.6)를 한 번 불러 한꺼번에 저장하고 저장된 목록을 돌려준다. 보내는 묶음의 칸은 `id`·`name`·`codes`·`sortOrder`(→ `sort_order`)뿐이다(시험: 보내는 객체의 칸 이름 비교). 제안 묶음(id 없음)을 처음 저장하면 다섯 개 모두 들어간다. 저장 도중 실패하면 표는 그대로라, 같은 목록으로 [다시 저장]하면 처음 저장과 같은 결과가 된다(시험: 첫 호출 실패 → 같은 목록 다시 → 다섯 개 모두)
- AC-013.3: Given 저장 실패(이름 겹침 포함), When 저장하면, Then `E-REVENUE-GROUP-SAVE-FAILED`(무엇이 "치료 묶음을 저장하지 못했어요" · 어떻게 "인터넷 연결과 이름이 겹치지 않는지 보고 [다시 저장]을 눌러 주세요")를 던지고, 고친 목록은 화면에 그대로 남는다. 읽기 실패는 `E-REVENUE-GROUP-LOAD-FAILED`(무엇이 "치료 묶음을 불러오지 못했어요" · 어떻게 "[다시 불러오기]를 눌러 주세요")

### REQ-014: 묶음 고치기 화면 (Phase 3 · Step 2 · group-editor)
- AC-014.1: Given 치료별 매출, When 머리의 [묶음 고치기]를 누르면, Then 매출 탭 안에서 '치료 묶음 고치기' 화면이 열린다(시안 3절, 2026-11-01 승인). [취소]는 고친 것을 버리고 매출 화면으로 돌아간다
- AC-014.2: Given 편집 화면, Then 묶음마다 이름 칸·처방 수·[묶음 지우기]와 그 묶음의 처방 줄(코드·이름·옮길 묶음 고르기, PC는 고른 달 금액도. 폰은 금액을 숨긴다)이 있고, 오른쪽(폰은 아래)에 '그 밖 처방' 목록(찾기 칸 포함)이 있다. [새 묶음]이 있다. 처방 목록은 저장된 `sales_codes`의 최근 13달 코드와 가장 늦은 이름이고 `_REST`는 나오지 않는다
- AC-014.3: Given 묶음 읽기가 성공했고 저장된 묶음이 없으면, Then 편집 화면은 제안 묶음 다섯 개로 채워지고 "제안 묶음 · 아직 저장 안 함" 칩이 보인다. 치료별 매출도 제안 묶음으로 세고 같은 뜻의 표시를 한다. 묶음 읽기가 실패하면 제안으로 바꾸지 않고 치료별 매출 자리에 "치료 묶음을 불러오지 못했어요"와 [다시 불러오기]를 보이며 [묶음 고치기]는 누를 수 없다
- AC-014.4: Given 이름이 비거나 30자를 넘거나 겹치거나 제어 문자·6개 이상 이어진 숫자가 있으면, Then [저장] 전에 그 칸 아래 이유 글(시안: "같은 이름의 묶음이 있어요" 등)을 보이고 저장하지 않는다. 묶음을 지울 때는 확인 창(시안: "이 묶음의 처방 n개는 '그 밖 처방'으로 가요", [지우기]·[취소])을 거친다
- AC-014.5: Given [저장], When 저장이 되면, Then 매출 화면으로 돌아가 치료별 매출을 저장한 묶음으로 다시 그린다. 실패하면 오류 카드와 [다시 저장]을 보이고 고친 것은 그대로 둔다
- AC-014.6: Given 폰(768px 미만)·연결 안 된 PC, Then 편집은 그대로 된다(서버 표만 쓴다). 폰은 한 줄 배치, 이름 칸·고르기·단추의 누름 영역 44px 이상, 입력 글자 16px다. 화면 규칙(토큰·`ds`·상자 안 상자 없음)을 따른다

## 범위 밖
- 매출 탭에 현금·카드·계좌이체·미수입금·신환·재진을 보이는 것(읽고 저장은 하지만 그리는 것은 업무일지 탭이 한다)
- 미수발생·지역화폐 금액: 원본 코드에 읽는 곳이 없다. 확인표 '먼저 할 것' ③으로 비트 화면의 칸을 찾은 뒤 명세 변경으로 계약에 더한다(그때까지 업무일지는 직접 입력)
- 확인 필요한 날의 금액 직접 입력
- 내원 1번당 평균(건당 진료비)·신환·재진별 매출
- 직원·인센티브와 이어 붙이기(인건비율), AI 분석에 매출 보내기, 월간 PDF
- 비트 파일 끌어다 놓기로 매출 채우기(plan.md §2-4의 폴더 연결은 이 명세가 도우미 읽기로 대신한다)
- 입원 매출, 다른 지점 합치기, 목표 매출
- 묶음 즐겨찾기·한 처방을 여러 묶음에 넣기(통계 탭이 나중에 `rx_groups`를 쓸 때 정한다. plan.md §7은 한 코드가 여러 그룹에 들어갈 수 있다고 했지만, 매출은 두 번 세지 않게 한 묶음만 쓴다)

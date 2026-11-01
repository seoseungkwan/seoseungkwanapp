# 요구사항: 통계 탭 (비트 PC 자료 읽기 · 저장 · 통계 화면)

> 기능 ID: `stats` · 형식: 요구사항은 `### REQ-501: 제목`, 수용 기준은 `- AC-501.1: Given/When/Then`.
> 각 AC는 시험 하나 이상으로 검증하고 시험 이름에 AC ID를 넣는다. REQ 번호 = 500 + TASK 번호다(REQ-501 = TASK-1). 번호를 500부터 쓰는 것은 다른 명세(stats-core REQ-001~, precheck REQ-001~)의 AC ID와 시험 이름이 겹치지 않게 하려는 것이다.
> 청구 사전점검 명세에서 옮겨 온 요구사항은 REQ 제목 아래 "옮겨 옴: precheck REQ-0xx" 줄로 출처를 남긴다(2026-11-01 사용자 결정: 통계 몫은 통계 명세에서 만든다).

## 배경 / 목표
- 탭 틀(`specs/tab-frame`, `docs/tab-frame/plan.md` §2)이 정한 통계 탭을 채운다. 지금 `/stats`는 '준비 중' 화면(`NotReadyScreen`)이다
- 사용자가 정한 탭 내용(2026-10-31·11-01): 환자 수 추이(신환·재진), 신환 재방문율(7·14·30일과 첫 재방문까지 날수), 처방 추세·처방별 신환/재진, 원장님 보고 문장(복사), 요일별 환자 수. 처음 기간은 최근 30일이고 바꿀 수 있다. 그래프가 이어지는 한 쪽이다(도구 단추 줄 없음). 그래프를 누르면 자세히 볼 수 있다. 자료가 없으면 지어낸 숫자 없이 "자료 없음"
- 자료는 비트 PC 연결(도우미)이 먼저이고, 없으면 파일 올리기(이미 main에 있는 `specs/stats-core` 엔진)로 채운다. 서버에는 숫자만 간다(`plan.md` §2-2: 월 숫자 + 일 숫자, 폰에서 보기용)
- 파일 엔진(`stats-core`: 파서·세기·요약·저장 모양 v2·Worker)은 다시 명세하지 않고 그대로 쓴다. 이 명세는 30일 재방문만 더한다
- 청구 사전점검의 통계 몫(precheck REQ-027~031, TASK-27~31, `phases/precheck-6-stats/`)을 여기로 옮긴다. 그 단계들이 기대던 사전점검 2~4단계(비트 통계 화면 표 읽기 `VendorGridExport`, 조각 모으기 `workers/precheck/*`, 공용 복사 단추)는 main에 없다. 이 명세는 main에 있는 것(도우미 1단계: 메시지 틀·비트 읽기 전용 접속·등록 확인·조각 나눠 보내기, 웹 통로 `lib/bridge`, `stats.rows` 명령 표)만 딛는다
- 로그인 뒤 첫 화면은 지금처럼 대시보드다(`specs/tab-frame` REQ-301, `docs/tab-frame/plan.md` §1의 지금 결정). 통계는 둘째 탭이다. 대시보드는 이 명세가 저장한 숫자를 읽는다(tab-frame design.md '다음 명세가 탭을 채울 때')

## 요구사항

### REQ-501: 신환 30일 재방문 세기 (aggregate · compare)
- 옮겨 옴: precheck REQ-029 (precheck 029.1)
- AC-501.1: Given 신환 줄, When `aggregate`로 세면, Then 칸(일·주·월)마다 `revisit.within30` = 첫 신환일 다음 날부터 30일째까지(양 끝 포함) 외래 줄(어떤 처방이든)이 있는 집단 환자 수다. 집단·첫 신환일·입원 줄·같은 날 다른 처방·다시 신환으로 찍힌 날의 규칙은 지금 7·14일(stats-core 006.4·006.5)과 같고, `within7 ≤ within14 ≤ within30 ≤ cohort`다
- AC-501.2: Given 31일째에만 다시 온 신환과 30일째에 다시 온 신환, When 세면, Then 30일째는 30일 재방문이고 31일째는 아니다
- AC-501.3: Given 칸 하나, When `buildSummary`로 요약하면, Then `RevisitView.within30`·`rate30`·`after30`은 '칸 첫날 ~ 칸 끝날 + 30일'이 모두 덮였고 끝났을 때만 숫자이고, 아니면 null('집계 중')이다. 집단이 0명이면 `rate30`은 null이다. 30일이 숫자면 7·14일도 숫자다
- AC-501.4: Given 지금 7·14일 시험(`aggregate.test.ts`·`compare.test.ts`·`analyzeFiles.test.ts`), When 돌리면, Then 기대값에 `within30`·`after30`(·`rate30`) 칸만 더하고 나머지는 한 글자도 바꾸지 않은 채 통과한다
- AC-501.5: Given 30일 안에는 다시 오지 않고 31일째 이후에 처음 다시 온 신환, When 세면, Then `revisit.after30`에 센다(불러온 자료 끝날까지 본 수 — 원본 `CohortMonthResult.ReturnAfter30Days`와 같은 뜻). 한 환자는 within30과 after30 가운데 하나에만 들고 `within30 + after30 ≤ cohort`다

### REQ-502: 저장 모양에 30일 재방문 더하기 (payload)
- AC-502.1: Given 집계 품질이 정상인 결과, When `toMonthPayload`·`toDayPayloads`로 바꾸면, Then `revisit`이 `{ cohort, within7, within14, within30, after30 }`이고 `within30`·`after30`은 요약의 '집계 중' 판정 그대로다(null 가능). `schemaVersion`은 2 그대로다(저장 표가 아직 없어 저장된 v2 줄이 어디에도 없다)
- AC-502.2: Given 저장 전·읽은 뒤의 값, When `validateMonthPayload`·`validateDayPayload`로 검사하면, Then `revisit` 열쇠는 `cohort`·`within7`·`within14`와, 있어도 되고 없어도 되는 `within30`·`after30`이다(없으면 null로 읽어 돌려준다 — 이 칸 전에 만든 가짜 자료와 다른 브랜치(`feat-ai-report`)의 가짜 달 자료가 그대로 통과하게). 그 밖 열쇠가 있으면 null이다. `within7 ≤ within14 ≤ within30 ≤ cohort ≤ 그 칸 신환`, `within30 + after30 ≤ cohort`이고 앞이 null이면 뒤도 null(7일 null → 14·30일 null, 14일 null → 30일 null, 30일 null → after30 null)일 때만 새 객체를 돌려준다
- AC-502.3: Given `DayPayload`·`MonthPayload` 가짜 자료를 쓰는 payload 밖의 지금 시험(history · 대시보드 summary · 대시보드 page), When 돌리면, Then 가짜 자료를 한 글자도 고치지 않고 통과한다(타입에서 두 칸은 선택이다)

### REQ-503: 도우미 통계 줄 읽기 (`stats.rows`)
- 옮겨 옴: precheck REQ-027 (precheck 027.1·027.3·027.4)
- AC-503.1: Given 등록한 병원과 기간 `{from, to}`(함께 세어 800일 이하, 명령 표 그대로), When 도우미가 `stats.rows`를 처리하면, Then 먼저 등록 확인(Core `HospitalGate.Open` — 도우미 `RequireHospital`이 감싸는 같은 관문)을 하고, 원본 `RxVisitSplit`의 외래 내원 조건으로 읽은 진료 줄 `[차트번호, 진료일, 처방코드, 첫 내원일]`(처방 코드 거르기 없음), 기간 합계(내원·실환자·신환·차트번호 없는 내원·중복 내원·첫 내원을 못 찾은 환자, 원본 `SummarySql`), 날짜별 합계(내원·실환자·신환, 원본 `DaysSql`), 진료 줄에 나온 처방코드의 이름(원본 `TrendDataSource` 처방 목록 SQL)을 JSON 하나로 만든 뒤 `chunk … end`로 보낸다. 이름·전화·주민번호·주소 칸은 읽지도 보내지도 않는다
- AC-503.2: Given `StatsSql`의 SQL 상수, When 원본 사본(`helper/tests/Precheck.Core.Tests/Stats/original-sql/*.sql`)과 견주면, Then 공백만 다르다. 진료 줄 SQL 하나만 원본 `RowsSql`에서 처방 코드 거르기 한 덩어리(`AND (UPPER(RTRIM(o.OdrCod)) IN (@c0, …, @c99) OR (@eswt=1 AND …))`)를 뺀 것이고, 시험은 사본에서 그 덩어리를 뺀 글과 견준다. 모두 매개변수를 받는 SELECT이고 `ReadOnlyGuard`를 지난다. 지금 `Sql.All`(청구 SQL 목록)은 그대로다
- AC-503.3: Given 과거 이관 자료가 따로 있음(원본 `HistoryGuard`가 1), 진료 줄이 700,000줄을 넘음, SQL 하나라도 실패, When `stats.rows`를 처리하면, Then 반쪽 자료를 보내지 않고 각각 `error` `E-STATS-HISTORY` · `E-STATS-TOO-BIG` · `E-BIT-READ-FAILED`만 보낸다. 등록 확인에 걸리면 지금 번호(`E-BIT-NOT-REGISTERED`·`E-BIT-HOSPITAL-MISMATCH`)다
- AC-503.4: Given 도우미 진단 기록, When `stats.rows`를 처리하면, Then 시각·명령 이름·오류 번호만 남고 차트번호·처방코드·숫자는 남지 않는다

### REQ-504: 도우미 보고 숫자 읽기 (일일·월말 운영 숫자)
- 옮겨 옴: precheck REQ-027 (precheck 027.1의 일 운영 숫자) · precheck REQ-030 (precheck 030.2의 '확인 필요' 판정)
- AC-504.1: Given `stats.rows`의 `to`, When 처리하면, Then 같은 JSON의 `report`에 원본 `OperationalReportData.Load` 순서대로 원본 `OperationalReportSql`(`HistoryGuard`·`UnsupportedFinance`·`Patients`·`Treatments`·`LaCodes`·`FinanceNormal`·`FinanceReceivable`·`FinanceMultiplicity`·`ReceivableMultiplicity`)을 돌린 숫자 네 벌이 있다: 일일 `to`·`to − 1일`, 월말 `to`가 든 달(1일 ~ `to`)·그 앞 달. 한 벌의 칸은 기간·총환·신환·재진·총진료비·조합청구액·비급여·현금·카드·계좌이체·치료 다섯(도수·충격파·씨암블락·쏘노·크라이오)·LA 코드 건수·금액 확인 필요 여부와 사유·원본 안내 글뿐이다
- AC-504.2: Given 환불·변경수납·예치금 자료가 있는 기간(원본 `UnsupportedFinance` > 0)이나 금액 연결 중복, When 그 벌을 만들면, Then 원본 `SetFinanceUnconfirmed`처럼 '금액 확인 필요'(사유 포함)이고 총환·신환·치료·LA 숫자는 그대로다
- AC-504.3: Given 원본 `Load`가 '보고를 확정할 수 없음'으로 멈추는 값(내원 누락·중복, 치료 연결 못 함, 재진이 음수), When 그 벌을 만들면, Then 그 벌만 `{ ok: false, reason }`(원본 이유 이름 그대로)이고 다른 벌과 진료 줄은 그대로 보낸다. SQL 실행 실패는 REQ-503(반쪽 자료 없음)대로 전체 `error`다
- AC-504.4: Given 보고 SQL 상수, When 원본 사본과 견주면, Then 공백만 다르다. `@daily`는 원본 `Bit` 대신 `Char(1)` '1'·'0'으로 넘긴다(관문·`SqlBitDb`를 고치지 않으려고). 금액은 원 단위 정수로 보낸다(원 미만은 0 쪽으로 버린다. 음수도 같다: -129,629.535 → -129,629). 음수 금액은 원본처럼 그대로 보낸다

### REQ-505: 통계 Worker (도우미 자료 → 저장 모양)
- 옮겨 옴: precheck REQ-027 (precheck 027.2)
- AC-505.1: Given 통로가 Worker 포트로 넘긴 `chunk`들과 `end {count, bytes, sha256}`, When 모으면, Then `seq`가 0부터 빠짐없이 이어지고 조각 수·UTF-8 바이트 수·SHA-256이 모두 맞을 때만 JSON 하나로 푼다. 하나라도 다르면 버리고 `E-BRIDGE-BAD-REPLY`, `abort`면 버리고 받은 번호다
- AC-505.2: Given 푼 JSON, When 검사하면, Then 정해 둔 열쇠·모양(진료 줄 = 4칸 배열 — 앞 셋은 글자, 넷째 첫 내원일은 글자 또는 null(null이면 그 환자는 신환이 아니고 기간 합계의 `noFirst`에 든다), 날짜 `YYYYMMDD`, 첫 내원일 ≤ 진료일, 한 환자의 첫 내원일은 하나, 처방코드 1~40자, 줄 수 700,000 이하, 기간이 요청과 같음, 보고 벌의 건수(총환·신환·재진·치료 다섯·LA 건수)는 0 이상 정수, 금액 6칸(`totalAmount`·`insurerAmount`·`noncoveredAmount`·`cashAmount`·`cardAmount`·`transferAmount`)은 정수이고 절댓값이 10^14 이하(음수 가능, 원본 `medicore/reports.py` `_amount`))일 때만 받는다. 아니면 `E-BRIDGE-BAD-REPLY`다. 시험: 음수 금액이 든 벌은 받아들이고 진료 줄과 다른 벌은 그대로다. 시험: 음수 건수는 거부한다. 시험: 절댓값이 10^14를 넘는 금액은 거부한다
- AC-505.3: Given 같은 가짜 자료를 파일 길(`fixtures/fake-bit/` → `parseBit`)과 도우미 JSON 길로 넣음, When 도우미 길이 진료 줄을 `ConsumptionRow`(첫 내원일 = 진료일이면 신환, 외래, 동네 없음, 차트번호는 메모리 번호 `PatientIds`)로 바꿔 지금 `aggregate`에 넣으면, Then 동네(지역)를 뺀 결과가 파일 길과 깊은 비교로 같다. 파일 올리기 길(`parseBit`·`aggregate`·`analyzeFiles`·`runAnalysis`·`analyze.worker.ts`)은 고치지 않는다
- AC-505.4: Given 검사한 도우미 자료, When `load` 일을 하면, Then Worker가 `buildSummary`(덮은 기간 = `[from, min(to, 오늘)]`) → `toMonthPayload`·`toDayPayloads`를 만들어 화면에는 달·일 저장 모양, 저장할 덮은 기간, 기간 합계의 확인 건수(차트번호 없는 내원·중복 내원·첫 내원 못 찾은 환자), 보고 숫자 네 벌만 보낸다. 저장할 덮은 기간은 `[from, min(to, 끝난 마지막 날)]`이고 끝난 마지막 날은 "오늘 진료 끝"을 켰으면 오늘, 아니면 어제다(끝나지 않은 오늘을 덮은 날로 저장하면 다음 날 그날이 휴진 0으로 읽힌다). 그 범위가 비면(`from` > 끝난 마지막 날) 덮은 기간은 null이고 덮은 기간 줄을 저장하지 않는다. 시험: 오늘 아침 진료 전에 불러옴(오늘 줄 없음, 오늘 진료 끝 꺼짐) → 저장할 덮은 기간 끝 = 어제. 확인 건수가 하나라도 0이 아니면 품질 incomplete이고 저장 모양은 null이다. 저장 모양의 동네는 비운다(`regions: []`)
- AC-505.5: Given 화면에 보내는 모든 메시지, When 열쇠와 값을 훑으면, Then 차트번호·환자 번호·진료 줄이 없다(숫자·처방코드·처방 이름·날짜만). 진료 줄은 Worker 메모리에만 남고(처방별 신환·재진 계산용), 새로 불러오면 바뀐다
- AC-505.6: Given "오늘 진료 끝" 표시를 켜고 불러옴, When 요약하면, Then 오늘을 끝난 날로 본다(요약에 넘기는 오늘 = 내일) → 오늘 일 숫자가 `partial: false`다. 끄면 지금처럼 오늘은 `partial: true`다
- AC-505.7: Given 화면 쪽 입구(`src/workers/statsClient.ts`), When 일을 시키면, Then Worker에는 기간·오늘·"오늘 진료 끝" 표시·통로 요청 id만 가고, 정해 둔 시간(120초)이 넘으면 `E-ANALYZE-TIMEOUT`, Worker 오류는 `E-ANALYZE-FAILED`이며 예외 내용을 옮기지 않는다

### REQ-506: 통계 숫자 저장 표 (`stats_months` · `stats_days` · `stats_coverage`)
- AC-506.1: Given 마이그레이션 `supabase/migrations/20261101000200_stats.sql`을 PGlite에서 인증 마이그레이션 뒤에 돌림, When 표를 보면, Then `public.stats_months`(`hospital_id`·`month`·`partial`·`source`·`payload`·`updated_at`, 기본 키 `hospital_id + month`), `public.stats_days`(같은 칸, `month` 대신 `day date`), `public.stats_coverage`(`hospital_id`·`from_day`·`to_day`·`source`·`created_at`, 불러온 기간 한 줄씩)가 있고 RLS가 켜져 있으며 `anon` 권한이 하나도 없다. `public.my_hospital_id()`는 여러 브랜치가 같이 쓰는 글자 그대로(`create or replace`, security definer, `search_path = ''`)이고, 다른 브랜치 마이그레이션이 같은 함수를 먼저 만들어 두었어도 이 마이그레이션이 오류 없이 돈다
- AC-506.2: Given 승인된 병원 A의 사용자, When 읽고 넣고 고치면, Then 자기 병원 줄만 보이고, 넣을 때 `hospital_id`는 DB가 정한다(사용자는 그 칸을 보낼 수 없다). 지우기는 안 되고, `stats_coverage`는 고치기도 안 된다(넣기만). 승인 대기·거절된 병원의 사용자와 다른 병원 B의 사용자는 A 줄을 읽지도 넣지도 고치지도 못한다
- AC-506.3: Given `payload`, When 넣거나 고치면, Then jsonb 객체이고 `schemaVersion`이 2이며 `payload.month`(또는 `day`)·`partial`이 칸 값과 같고, 글자 크기가 65,536바이트 이하이고, `source`가 'bit'·'file' 가운데 하나일 때만 들어간다. 열쇠가 빠진 payload(`{}`, `schemaVersion`·`month`·`day`·`partial` 가운데 하나 없음)는 거부한다(제약이 NULL로 통과하지 않는다). `stats_coverage`는 `from_day ≤ to_day`이고 800일 이하일 때만 들어간다
- AC-506.4: Given 완전한 줄(`partial` false), When 같은 병원·같은 달(날)을 덜 덮인 줄(`partial` true)로 고치면, Then 옛 줄이 그대로 남는다(트리거). 완전 → 완전, 덜 → 완전, 덜 → 덜은 바뀌고 `updated_at`이 새 시각이다. PostgREST upsert 꼴(`insert … on conflict (hospital_id, day) do update set …`)이 사용자 역할로 돈다
- AC-506.5: Given 세 표의 칸, When 보면, Then 환자 번호·차트번호·이름 칸이 없다. 실제 Supabase에 이 SQL을 붙이는 일은 그때 사용자가 허락한 뒤 사용자가 SQL 편집기에서 한다(시험은 PGlite)

### REQ-507: 통계 숫자 저장·읽기 (`lib/storage/stats.ts`)
- AC-507.1: Given 저장 모양(달·일)·덮은 기간·출처(`'bit'|'file'`), When `saveStats`, Then 모든 값이 `validateMonthPayload`·`validateDayPayload`를 지날 때만 `stats_months`·`stats_days`에 upsert(충돌 열쇠 `hospital_id + month|day`)하고, 그 뒤 덮은 기간이 null이 아닐 때만 `stats_coverage`에 한 줄을 넣는다(null이면 덮은 기간 줄을 쓰지 않는다 — 시험이 본다). 하나라도 걸리면 아무것도 보내지 않고 `E-STATS-SAVE-FAILED`다. 보내는 줄의 칸은 `month|day`·`partial`·`source`·`payload`(덮은 기간 줄은 `from_day`·`to_day`·`source`)뿐이다. 보내기가 실패해도 `E-STATS-SAVE-FAILED`다
- AC-507.2: Given 기간, When `readDays({from, to})`·`readMonths({from, to})`·`readCoverage({from, to})`, Then 그 기간 줄만 읽어 검사를 지난 것만 날짜(달) 순으로 돌려주고, 검사에 걸려 뺀 줄 수와 가장 최근 `updated_at`·`source`를 같이 준다. `readCoverage`는 그 기간과 겹치는 덮은 기간을 합쳐(`mergeRanges`) 돌려준다. 읽기 실패는 `E-STATS-READ-FAILED`다
- AC-507.3: Given `src/lib/storage/stats.ts`(통계 파일만 — 다른 브랜치의 `lib/storage` 파일에 규칙을 씌우지 않는다), When ESLint를 돌리면, Then `lib/parsers`·`lib/bridge`·`workers`를 import할 수 없고 `lib/analytics`는 `dates`·`coverage`만 된다. 환자 자료 구역은 지금처럼 `lib/storage`를 import할 수 없다. `console`·브라우저 저장소를 쓰지 않는다. 시험: `src/guardrails.test.ts`

### REQ-508: 처방 추세 (`lib/analytics/rxTrend.ts`)
- 옮겨 옴: precheck REQ-028
- AC-508.1: Given 일 저장 모양(`DayPayload[]`)·덮은 기간(`readCoverage`, 합친 범위 목록)과 `{from, to, bucket: 'day'|'week'|'month', codes}`, When `buildTrend`, Then 원본 `TrendMath.Build`처럼 처방마다 칸 점(시작·끝·이름·일부 기간 여부)과 건수(그 칸 날들의 그 처방 `patients` 합)를 낸다. 주는 월요일 ~ 일요일이고 기간 끝에 걸린 칸은 일부 기간이다. 덮은 기간 안의 날은 일 숫자가 없어도(휴진·일요일 — `toDayPayloads`는 진료가 있는 날만 만든다) 0인 날이고 그 칸을 일부 기간으로 만들지 않는다. 덮은 기간 밖의 날이 칸에 들어 있으면 그 칸은 일부 기간이고 그 날은 더하지 않는다(지어낸 0 없음). 시험: 덮은 기간 끝이 어제이고 오늘 줄이 없음 → 오늘은 0이 아니라 덮은 기간 밖(그 칸 일부 기간)이다. 아직 끝나지 않은 날(오늘 `partial` 줄)이 든 칸도 일부 기간이다. 원본 `TrendTests.cs`의 칸·경계 사례(부분 주와 월요일 경계, 서로 다른 달 칸 수, 빠진 날짜, 코드 나눔)를 옮겨 통과한다
- AC-508.2: Given 비교(`PreviousEqualDays`·`PreviousMonth`·`PreviousYear`), When `comparisonRange`·`comparisonLabel`, Then 원본과 같은 기간·이름이다(원본 사례: 10월 1~7일 → 9월 24~30일, 윤년 2월 29일 사례와 '윤년' 안내)
- AC-508.3: Given 신환·재진 나눔, When 추세를 나누면, Then 칸마다 신환 건수 = 그 처방 `newPatients` 합, 재진 건수 = `returning` 합이고(원본 '일별 외래 재진은 나머지' 사례), 신환 + 재진 ≤ 건수다
- AC-508.4: Given 지금 자료(파일·저장 모양), When 추세를 만들면, Then 소모량·금액은 늘 null('자료 없음')이다. 원본 `TrendTests.cs`의 소모량·금액·단위 사례는 시험 파일 머리 `knownDiffs`에 이유("금액·소모량은 저장 모양에 없다 — 매출 탭 몫")와 함께 적는다
- AC-508.5: Given 현재·비교 기간 합계, When 증감을 내면, Then 지금 앱의 `compareNumbers` 규칙을 쓰고, 원본 `TrendChange` 사례(이전 0 → 비율 없음·신규, 이전 음수 → 비율 없음, 100 → 75는 −25%)가 그 규칙으로 통과한다. 원본 `RateLabel` 글자 대신 앱의 증감 글자를 쓰는 것은 `knownDiffs`에 적는다

### REQ-509: 처방별 신환·재진 (`lib/analytics/rxVisitSplit.ts`)
- 옮겨 옴: precheck REQ-029 (precheck 029.3·029.4)
- AC-509.1: Given Worker 메모리의 진료 줄(환자 번호·진료일·처방코드·첫 내원일)·기간 합계와 기간·코드 목록, When `rxVisitSplit`, Then 원본 `medicore/rx_visit_split.py`의 `summarize`처럼 처방마다 신환(첫 내원일 ≥ 기간 첫날)·재진 환자 수·합계와 기간 합계(내원·환자·신환·재진)를 낸다. 골든: 원본을 `python3 -I`로 같은 가짜 줄에 돌린 `fixtures/stats/golden/rx-visit-split-*.json`과 순서까지 같다
- AC-509.2: Given 같은 입력과 날짜별 합계, When `rxVisitSplitDays`, Then `summarize_days`처럼 날마다 처방별 신환(첫 내원일 = 그날)·재진 수가 골든과 같다
- AC-509.3: Given 결과와 병원 이름, When `formatRxVisitSplit`·`formatRxVisitSplitDays`·`rxVisitHeadline`, Then 원본 `format_text`·`format_days_text`·`headline`과 같은 글이다(골든)
- AC-509.4: Given Worker의 `split` 일, When 화면이 기간을 주면, Then Worker는 메모리의 진료 줄로 그 기간의 처방별 결과(처방마다 수와 이름만, 합계가 큰 차례, 같으면 코드 순)와 글을 보낸다. 환자 번호가 없다. 불러온 자료가 없거나 기간이 불러온 범위 밖이면 `{ kind: 'none' }`이다

### REQ-510: 원장님 보고 문장 (`lib/clinicReport/reportText.ts`)
- 옮겨 옴: precheck REQ-030
- AC-510.1: Given 보고 숫자 한 벌(일일·월말)과 병원 이름, When `formatClinicReport`, Then 원본 `medicore/reports.py`의 `format_report`·`report_notes`와 같은 글·안내다(골든 `fixtures/stats/golden/report-*.json`, 원본을 `python3 -I`로 돌림). 일부러 다르게 한 곳은 골든의 `knownDiffs`에 이유와 함께 적는다: 금액과 건당진료비는 원 미만을 버린다(원본은 반올림, CLAUDE.md 금액 규칙). 적지 않은 차이는 실패다. 음수 금액은 원본이 찍는 그대로 찍는다("-1,000원"). 골든에 음수 금액이 든 사례가 있고, 건당진료비까지 정확한 글은 그 골든이 정한다
- AC-510.2: Given 금액 확인 필요 벌, When 만들면, Then 원본처럼 금액 줄은 "확인 필요"이고 다른 숫자는 그대로이며, 돌려주는 `unconfirmedLines`에 그 줄 번호들이 있다
- AC-510.3: Given 오늘보다 뒤 날짜·달, When 만들려 하면, Then 글을 만들지 않고 `{ error: 'future-date' }`다. `{ ok: false }` 벌이면 `{ error: 'unconfirmed', reason }`이다
- AC-510.4: Given `src/types/clinicReport.ts`의 입력 모양(`ClinicReportNumbers`), When 열쇠를 보면, Then 집계 숫자·기간·병원 이름뿐이다(`chart`·`name`·`rows`·`patient` 칸 없음). 시험이 열쇠 목록을 못 박는다

### REQ-511: 통계 화면 숫자 (`components/stats/view.ts`)
- 옮겨 옴: precheck REQ-029 (precheck 029.2 첫 재방문까지 날수)
- AC-511.1: Given 오늘과 기간(`'7d' | '30d' | '90d' | '12m'`, 처음 `'30d'`), When `statsRange`, Then 일 기간은 어제까지 N일(대시보드 `periodRange` 그대로), `'12m'`은 이번 달을 넣은 12달이다. 비교 기간은 일 기간이면 바로 앞 같은 일수(`PreviousEqualDays`), `'12m'`이면 작년 같은 12달(`PreviousYear`)이다. 불러올 범위는 비교 기간 첫날이 든 달의 1일 ~ 오늘이고 800일 이하다. `finishedCohort`도 같이 준다: `'30d'`는 오늘 − 60 ~ 오늘 − 31(`'30d'`의 비교 기간과 같은 범위라 불러올 범위와 읽기는 그대로다), 다른 기간은 null이다
- AC-511.2: Given 저장 모양과 기간, When 기간 요약을 만들면, Then 네 칸이다: 평균 환자 수(일 기간은 자료 있는 끝난 날 평균, `'12m'`은 자료 있는 **끝난 달**(`partial: false`) 평균, 소수점 아래는 버림), 신환(합), 재진(합), 비교 기간보다(평균의 `compareNumbers` 증감). 덜 끝난 칸(이번 달 같은 `partial: true` 달·날)은 평균과 증감에서 빼고, 비교 기간에서도 그 칸과 짝인 칸(작년 같은 달)을 뺀다 — 엔진이 '집계 중' 칸을 견주지 않는 것(stats-core 007.1 '완전한 칸끼리만 증감')과 같은 규칙이다. 신환·재진 합에는 덜 끝난 칸도 넣고 '일부 기간' 표시를 붙인다. 자료 없는 날·달은 0으로 치지 않고, 비교 기간 자료가 없으면 넷째 칸은 "비교할 자료가 없어요"다. `'12m'`에 덜 끝난 달만 자료가 있고 끝난 달이 없으면 평균 칸은 "자료 없음", 넷째 칸은 "비교할 자료가 없어요"이고, 신환·재진 합은 그대로 '일부 기간' 표시와 함께 보인다. 일 기간에 끝난 날이 없을 때도 같다. 시험: 11월 15일의 12개월 보기 — 덜 끝난 11월과 작년 11월을 빼고 견주어 그 달 때문에 ▼가 나오지 않는다. 시험: 덜 끝난 달만 자료가 있는 12개월 보기 — 평균 칸 "자료 없음", 넷째 칸 "비교할 자료가 없어요", 신환·재진 합은 '일부 기간'과 함께 보인다. 시험: 끝난 날이 없는 일 기간 — 평균 칸 "자료 없음"
- AC-511.3: Given 저장 모양(과 덮은 기간), When 환자 수 추이를 만들면, Then 일 기간은 자료 있는 날마다 신환·재진 칸(대시보드 `trendBuckets` 그대로), `'12m'`은 달 숫자(`MonthPayload.totals`)마다 칸이고, 덜 끝난 칸은 '일부 기간'이다
- AC-511.4: Given 저장 모양, When 재방문율을 만들면, Then 7·14·30일 = 그 값이 null이 아닌 칸들의 재방문 합 ÷ 그 칸들의 집단 합이다. 모두 null이면 '집계 중', 분모가 0이면 '자료 없음'이다. 비율 칸은 비율과 함께 `within`(다시 온 신환 합)·`cohort`(센 신환 합)·`excluded`(값이 null이라 뺀 칸이 있는지)를 싣는다. 첫 재방문까지 날수는 30일 값이 숫자인 칸들로 원본 `CohortMonthResult`의 네 칸 "7일 안"(within7) · "8~14일"(within14 − within7) · "15~30일"(within30 − within14) · "30일 넘어 다시 옴"(after30)과, 그 밖 "아직 다시 안 옴"(cohort − within30 − after30, 원본 `SingleVisitNewPatients`)이고 다섯의 합 = 그 칸들의 집단 합이다. "30일 넘어 다시 옴"은 불러온 자료 끝날까지 본 수라고 안내 글이 붙는다. 원본 `CohortTests.cs`의 사례(신환율·기존환자율·신환 재방문율의 분모 구별, 분모 0이면 미산출, 재방문 칸 합, 덜 끝난 달)를 옮겨 통과한다. `'30d'`에서만(최근 30일의 날은 모두 온 지 30일이 안 되어 늘 '집계 중'이므로) 30일 줄과 첫 재방문까지 날수는 `finishedCohort`(온 뒤 30일이 지난 가장 최근 신환)의 날들로 센다. 세는 규칙은 위와 같고(값이 null이 아닌 날들의 합 ÷ 그 날들의 집단 합, 모두 null이면 '집계 중', 분모가 0이거나 줄이 없으면 '자료 없음'), 보여 주는 날짜는 그 범위에서 30일 값이 숫자인 첫날과 끝날이다(마지막 불러오기가 며칠 전이면 가장 새로운 날들이 아직 null이라, 범위 끝을 그대로 적으면 실제보다 넓어 보인다). `'30d'`의 7·14일 줄은 고른 기간 그대로다. `'7d'`·`'90d'`·`'12m'`은 바뀌지 않는다. 시험: 오늘이 11월 13일인 `'30d'` — 30일 줄이 9월 14일 ~ 10월 13일을 세고 그 날짜를 보인다. 시험: 가장 새로운 날들이 null — 날짜가 숫자인 날까지로 줄어든다. 시험: 7·14일 줄은 여전히 고른 기간을 쓴다. 시험: 비율 칸 — 7·14·30일 모두 `within`·`cohort`가 비율을 낸 두 합과 같고, null인 칸을 뺐으면 `excluded`가 참이다
- AC-511.5: Given 저장 모양, When 요일별 환자 수를 만들면, Then 대시보드 `weekdayBuckets` 규칙 그대로다(`'12m'`도 기간 안 일 숫자로)
- AC-511.6: Given 저장 모양, When 처방 목록을 만들면, Then 기간 건수가 큰 5개(같으면 코드 순)이고 처방마다 이름(가장 최근 날의 이름)·기간 건수·비교 기간 건수·증감·신환 건수·재진 건수가 있다. `'12m'`의 증감은 끝난 달끼리만 견준다(AC-511.2와 같은 규칙, stats-core 007.1): 이번 기간의 달과 그 짝(작년 같은 달) 가운데 어느 한쪽이라도 `buildTrend` 달 점에서 `partial`이면 그 달을 양쪽에서 뺀다. 기간 건수(`count`)·신환 건수(`newCount`)·재진 건수(`returningCount`)는 덜 끝난 달을 넣고 '일부 기간' 표시를 붙인다(AC-511.2의 신환·재진 합과 같다). `comparable: { current, previous }`가 끝난 달끼리의 합이고, 증감 = `compareNumbers(comparable.current, comparable.previous)`, 비교 기간 건수 = `comparable.previous`다. 끝난 달이 하나도 남지 않으면 `comparable`은 null이고 증감은 `{ kind: 'unavailable' }`("비교할 수 없음")이다. 순위는 그대로 `count`로 정한다. `'7d'`·`'30d'`·`'90d'`는 같은 규칙을 날 단위로 쓴다(AC-511.8의 표시 칸과 상관없이 늘 날마다): 이번 기간의 날과 비교 기간의 같은 차례 날(`PreviousEqualDays`)을 짝 짓고, 어느 한쪽이라도 `buildTrend` 날 점에서 `partial`이면(덮은 기간 밖의 날은 이미 그렇다) 그 짝을 양쪽에서 뺀다. 덮은 기간 안의 휴진일은 0으로 남는다. `comparable`은 남은 짝의 합이고, 남은 짝이 없을 때만 null이며 증감은 `{ kind: 'unavailable' }`("비교할 수 없음")이다. `count`·`newCount`·`returningCount`는 그대로 기간 합이고 `partial` 표시는 `'12m'`에서만 붙는다(일 기간에는 '일부 기간'이 없다). 시험: 11월 15일의 12개월 보기 — 11월과 작년 11월을 둘 다 빼서 가짜 ▼가 없다. 시험: 덜 끝난 달만 자료가 있음 — "비교할 수 없음". 시험: 일 기간에서 비교 기간이 덮은 기간 밖 — 모든 줄이 "새로 생김"이 아니라 "비교할 수 없음"이다. 시험: 비교 기간이 반만 덮임 — 덮인 짝만 견준다. 시험: 이번 기간 끝이 덮은 기간 밖(어제가 안 덮임) — 그 날과 짝을 빼고 나머지로 보통 증감이다. 시험: 두 기간이 모두 온전히 덮임 — 보통 증감이다
- AC-511.7: Given `components/stats/view.ts` 소스, When 보면, Then 순수 함수(React·Supabase·`fetch`·브라우저 저장소 없음)이고 날짜는 `lib/analytics/dates.ts`, 증감은 `compareNumbers`, 대시보드 `components/dashboard/summary/view.ts`의 함수는 불러 쓰기만 한다
- AC-511.8: Given 처방 하나, When `rxDetail`로 그 처방의 칸별 건수를 만들면, Then 칸은 기간에 따라 정해진다: 최근 7일·30일 = 일, 최근 90일 = 주(월~일), 최근 12개월 = 달. `buildTrend`(덮은 기간 포함)의 점을 그대로 쓰고 비교 기간 점도 같은 칸으로 준다. 점마다 `covered`를 더한다(그 칸의 날이 하나라도 덮은 기간 안에 있으면 true, 하나도 없으면 false). 시험: 비교 기간이 덮은 기간 밖인 칸 — `covered: false`. 시험: 칸의 일부 날만 덮임 — `covered: true`

### REQ-512: 통계 화면 목업 (문서)
- AC-512.1: Given 클릭 목업 `docs/mockups/stats/index.html`·`notes.md`(CLAUDE.md: 화면은 클릭 목업 승인 뒤), When 열어 누르면, Then 기간 단추·[자세히]·보고 고르기·[복사]·[비트에서 불러오기]·화면 상태 고르기가 실제로 눌려 화면이 바뀌고, 화면 1 PC 불러온 뒤 · 화면 2 PC 처음(저장된 숫자 없음) · 화면 3 휴대폰(저장된 숫자만) · 화면 4 그래프 자세히 열림 · 화면 5 불러오는 중·저장 실패·확인 필요가 있고, REQ-513·REQ-514의 섹션·문구·기간 단추·증감 ▲▼가 보인다. 숫자는 모두 예시이고 화면 위에 "예시 숫자" 표시가 있다. 모양은 `docs/UI_GUIDE.md`와 ui-90 시안(`docs/mockups/ui-90/app/`)의 토큰·글자 단계를 따른다
- AC-512.2: Given 사용자 승인, When 기록하면, Then `notes.md` 맨 위에 승인 날짜·온라인 링크가 있다. 승인 전에는 TASK-13~16을 시작하지 않는다(CLAUDE.md: 화면은 목업 승인 뒤)

### REQ-513: 통계 그래프 섹션 (`components/stats/sections/*`)
- 옮겨 옴: precheck REQ-031 (precheck 031.3·031.4·031.5)
- AC-513.1: Given 보기 모양(REQ-511·509·510), When 섹션을 그리면, Then 한 쪽에 이어서(도구 단추 줄 없음) 기간 요약 → 환자 수 추이 → 신환 재방문율(첫 재방문까지 날수 포함) → 처방 추세 → 처방별 신환·재진 → 원장님 보고 문장 → 요일별 환자 수 차례이고 섹션마다 h2다. 차례·문구·배치가 목업 승인본과 다르면 목업이 이긴다(그때 이 AC의 차례만 고친다). 예외: 최근 30일 보기의 30일 줄과 첫 재방문까지 날수(S6), 12개월 처방 증감(S7)은 2026-11-01 사용자 결정으로 목업이 아니라 이 명세를 따른다
- AC-513.2: Given 그래프, When 그리면, Then `components/charts`의 부품(`StackedBarChart`·`RankedBars`·`KpiStat`·`InlineBar`·`ChartLegend`)만 쓴다(새 패키지 없음, 움직임 없음). 증감은 색만 쓰지 않고 ▲▼와 글자(`formatDelta`)를 같이 쓴다(UI_GUIDE). `StackedBarChart`에는 칸마다 줄 수 있는 선택 값 `comparison?: number | null` 하나만 `BarBucket`에 더한다: 쌓은 막대 왼쪽에 가는 `faint` 막대로 그리고, 값을 줄 때만 눈금 계산에 넣는다. 어느 칸에도 값이 없으면 그림·표·지금 시험은 지금 그대로다. `null`은 막대를 그리지 않는다(예: 덮이지 않은 비교 칸, AC-511.8). 움직임 규칙과 `rules.test.ts`는 그대로 지킨다. 시험: `comparison`을 주면 가는 막대가 보이고 눈금이 그 값을 넣어 정해진다. 시험: 주지 않으면 지금과 결과가 같다(지금 시험을 고치지 않고 통과)
- AC-513.3: Given 그래프마다 있는 [자세히] 단추(`aria-expanded`, `aria-controls`), When 누르면, Then 그 그래프 바로 아래에 숫자 표(머리 줄 + 날짜·달마다 값)가 열리고 다시 누르면 닫힌다. 주소(URL)는 바뀌지 않는다. 처방 추세에서 처방 줄을 누르면 그 처방의 칸별 건수·신환·재진 막대가 열린다
- AC-513.4: Given 자료 없는 섹션, When 그리면, Then 그래프·빈 틀 없이 "자료 없음" + 한 줄 안내(목업 문구)다. 숫자를 지어내지 않는다
- AC-513.5: Given 처방 추세, When 그리면, Then 금액·소모량 자리에 "금액·소모량은 매출 탭에서 볼 수 있어요"(목업 문구)를 보인다
- AC-513.6: Given 원장님 보고 문장, When 그리면, Then 일일(오늘·어제)·월말(이번 달·지난달) 고르기 단추 묶음, 보고 글(글자로만, 줄바꿈 그대로), [복사], '확인 필요' 줄 표시(색과 함께 "확인 필요" 글자)가 있다. [복사]는 대시보드 [복사]와 같은 동작이다(`navigator.clipboard.writeText`, 2초 "복사했어요", 실패하면 직접 복사 안내, 폭 흔들림 없음). `ok: false` 벌은 "이 기간은 보고를 확정할 수 없어요" + 비트 원본 통계에서 확인하라는 안내다
- AC-513.7: Given 처방별 신환·재진, When 그리면, Then 머리 글(`rxVisitHeadline`), 처방마다 신환·재진·합계 표(합계가 큰 차례 10개, [모두 보기]로 나머지), [표 복사](`formatRxVisitSplit` 글)가 있다
- AC-513.8: Given 비트 PC에서 불러온 자료가 없음, When 처방별 신환·재진·원장님 보고 문장을 그리면, Then "비트 PC에서 불러오면 보여요" + 한 줄 이유(진료 줄·금액은 서버에 저장하지 않는다)다
- AC-513.9: Given `components/stats/sections/**`와 `components/stats/view.ts`(시험 밖) 소스(화면 조립 파일 `StatsScreen.tsx`·`useStatsData.ts`·`useStatsWorker.ts`·`SourcePicker.tsx`는 저장·Worker·통로를 불러야 하므로 이 AC 밖이고 REQ-514의 화면 상태 규칙을 따른다), When 보면, Then Supabase·`fetch`·브라우저 저장소·`lib/bridge`·`workers`를 쓰지 않고(섹션은 props만 받는다) `ds` 공통 모양과 토큰만 쓰며, 상자 안 상자가 없고 앱 화면 규칙 시험(`components/ui/classes.test.ts` 검사 목록에 `src/components/stats`를 더함)을 통과한다
- AC-513.10: Given `'30d'` 보기 모양(REQ-511 `revisitRates`)에서 30일 줄이 비율임, When `RevisitSection`을 그리면, Then 30일 줄은 "집계 중" 대신 비율을 값으로 보이고 caption은 "{시작} – {끝}에 온 신환 {N}명 가운데 {K}명 · 온 뒤 30일이 지난 가장 최근 신환이에요"다({N}·{K}는 그 칸의 `cohort`·`within`). 첫 재방문까지 날수의 기준 줄은 목업 문구 "{시작} – {끝}에 온 신환 N명 기준 (온 뒤 30일이 지난 날만)"에 같은 날짜를 쓴다. 7·14일 줄은 고른 기간 그대로다. `'7d'`는 승인 목업 그대로(셋 다 집계 중, 지금 안내 글)이고 `'90d'`·`'12m'`은 바뀌지 않는다
- AC-513.11: Given 처방 추세 줄(REQ-511 `rxList`·`rxDetail`), When `RxTrendSection`을 그리면, Then 줄의 막대와 비교 눈금은 `comparable`로 그린다(막대 = `comparable.current`, 눈금 = `comparable.previous`). 글자 건수는 `count`이고 `partial`인 줄은 그 옆에 '일부 기간'을 보인다. `comparable`이 null이면 막대는 `count`로 그리고(목업의 비교 없는 줄과 같다) 비교 눈금은 없으며 증감은 "비교할 수 없음"이다(`formatDelta` 글자. 목업의 "비교할 자료 없음"보다 이 글자가 이긴다). [자세히] 표의 비교 기간 칸은 그 칸의 `rxDetail` 점이 `covered: false`이면 "0건"이 아니라 "–"다(목업과 같다). 시험: `covered: false`인 비교 칸 — 표에 "–"이고 "0건"이 없다

### REQ-514: 통계 화면 (자료 고르기 · 기간 · 저장 · 휴대폰)
- 옮겨 옴: precheck REQ-031 (precheck 031.1·031.2)
- AC-514.1: Given `/stats`를 엶, When 그리면, Then 고른 기간과 비교 기간의 저장된 숫자를 `readDays`·`readMonths`·`readCoverage`로 읽어 섹션을 그린다. 읽는 동안 섹션 자리는 "불러오는 중"이고, 저장된 숫자가 하나도 없으면 맨 위에 "아직 저장된 통계가 없어요" + 자료 고르기 안내다. 읽기 실패는 오류 카드(`E-STATS-READ-FAILED`) + [다시 읽기]다
- AC-514.2: Given 기간 단추 묶음(`role="group"`, 이름 "기간": 최근 7일 · 최근 30일 · 최근 90일 · 최근 12개월, 처음 30일만 `aria-pressed="true"`), When 다른 단추를 누르면, Then 그 단추만 눌림이 되고 기간 글자와 섹션이 그 기간으로 바뀐다. 처방별 신환·재진은 Worker에 그 기간을 다시 계산시킨다(다시 불러오지 않는다)
- AC-514.3: Given 비트 PC(`useBridge({ worker })` 상태 `ready`), When [비트에서 불러오기]를 누르면, Then 불러올 범위(REQ-511 `statsRange`의 `load`)로 `stream('stats.rows', {from, to})` → Worker `load` → 저장 모양과 Worker가 준 저장할 덮은 기간(REQ-505 Worker가 정함, 끝은 오늘 진료 끝이면 오늘·아니면 어제)을 `saveStats(source 'bit')` → 새 숫자로 다시 그린다. 그동안 단추는 막히고 "불러오는 중"이다. 끝나면 처방별 신환·재진과 원장님 보고 문장이 생긴다. 화면은 조각·진료 줄을 받지 않는다(Worker만 통로에 넘긴다)
- AC-514.4: Given 파일, When 끌어다 놓거나 [파일 고르기]로 넣으면, Then 지금 `runAnalysis` 길 그대로 분석해 `toMonthPayload`·`toDayPayloads`와 파일이 덮은 기간 하나(성공한 파일들의 기간 줄·받아들인 줄 범위를 `mergeRanges`로 합친 것 가운데 가장 최근 이어진 구간, 끝은 어제 이하 — 파일 길에는 "오늘 진료 끝"이 없다)를 `saveStats(source 'file')`로 저장하고 다시 그린다. 파일마다 실패는 오류 카드(번호)로 보인다. 파일 이름은 화면에만 보이고 어디로도 보내지 않는다
- AC-514.5: Given 확장이 없는 브라우저·휴대폰(상태 `no-extension`), When 그리면, Then [비트에서 불러오기] 대신 "비트 PC의 크롬에서 불러올 수 있어요"와 파일 길이 보인다. 상태가 `no-helper`·`update-helper`·`update-extension`이면 그 안내와 [설치·연결 확인](`/claim/setup`) 링크다
- AC-514.6: Given 저장 실패, When 그리면, Then 새 숫자는 화면에 그대로 두고 오류 카드 `E-STATS-SAVE-FAILED` + [다시 저장]이며, 누르면 같은 값을 다시 보낸다. 품질 incomplete면 저장하지 않고 "일부 기록을 확인하지 못해 저장하지 않았어요"와 확인 건수(차트번호 없는 내원 N건 등)를 보인다
- AC-514.7: Given 저장된 숫자, When 그리면, Then 기간 머리에 출처 줄 "자료: 비트 PC · {월}월 {일}일 {시}:{분} 저장" 또는 "자료: 파일 · …"이 있다(가장 최근 `updated_at`·`source`)
- AC-514.8: Given 비트 PC, When 그리면, Then [비트에서 불러오기] 옆에 체크 상자 "오늘 진료 끝"(처음 꺼짐)이 있고, 켜고 불러오면 REQ-505(오늘 진료 끝)대로 오늘 숫자를 끝난 날로 저장한다
- AC-514.9: Given 화면 상태, When 보면, Then 숫자·처방 이름·보고 글은 React 상태와 Worker 메모리에만 있고 브라우저 저장소·주소(쿼리)·`history.state`에 넣지 않는다. 주소는 `/stats` 그대로다
- AC-514.10: Given 390·768·1440px, When 그리면, Then 섹션이 겹치거나 잘리지 않고 가로로 밀리지 않으며, 768px 미만에서는 섹션이 세로로 쌓이고 기간 단추는 44px이다(목업 승인본 배치)

### REQ-515: 통계 탭을 진짜 화면으로 (탭 · 목차 · 준비 중 목록)
- AC-515.1: Given `MENU`, When 통계 항목을 읽으면, Then `href`가 `/stats`이고 `ready: true`다. 지금 탭 판단(`currentMenuLabel`)과 다른 12개 항목은 그대로다
- AC-515.2: Given `DASHBOARD_FEATURES`, When 통계 항목을 읽으면, Then `status: 'connect-first'`이고(연결 전 "연결 먼저", 연결 뒤 "사용 가능") 기능 목차 옆 글의 개수는 그 목록에서 센 값과 같다(시험은 개수를 글자로 못 박지 않고 목록에서 센다 — 다른 탭 명세도 같은 줄을 바꾼다)
- AC-515.3: Given `NOT_READY_FEATURES`·`NotReadyPath`, When 읽으면, Then `/stats`가 빠졌고 다른 항목은 그대로다. 시험은 개수를 숫자로 못 박지 않고 탭 목록(`MENU`)에서 준비 중인 것과 견준다
- AC-515.4: Given `/stats` 페이지, When 그리면, Then `NotReadyScreen`이 아니라 `StatsScreen`(병원 이름은 `currentMe()`가 준 내 병원 이름)이고 브라우저 탭 이름은 "통계"다. 탭 틀 통합 시험(`src/app/(app)/tabFrame.test.tsx`)이 세 곳(menu · features · notReady)과 페이지가 맞는지 보고 통과한다
- AC-515.5: Given 로그인, When 콜백·문지기를 지나면, Then 첫 화면은 지금처럼 `/dashboard`다(tab-frame 301.1·301.2 시험 그대로 통과)

### REQ-516: 대시보드가 저장된 통계 숫자를 읽음
- AC-516.1: Given `/dashboard`, When 그리면, Then 브라우저에서 저장된 일 숫자(오늘 − 97일 ~ 오늘)를 `readDays`로 읽어 `{ kind: 'data', days }`를 만든다. 읽기 전·줄 없음은 지금 연결 전 모양이고, 읽기 실패는 연결 전 모양 + 오류 카드 한 줄(`E-STATS-READ-FAILED`)이다. 서버 코드(`*.server.ts`·페이지)는 통계 표를 읽지 않는다
- AC-516.2: Given 연결 뒤 가짜 자료, When 신환 재방문율을 그리면, Then 30일 줄도 7·14일과 같은 규칙(값이 null이 아닌 날들의 합 ÷ 집단 합, 모두 null이면 "집계 중", 분모 0이면 "자료 없음")이고 "30일 기록은 아직 모으지 않아요"가 없다. 대시보드의 30일 기간에서는 30일 줄이 오늘 − 60 ~ 오늘 − 31을 AC-511.4와 같은 규칙으로 세어(S6, 2026-11-01 사용자 결정 — 같은 이름의 줄이 통계 탭과 다르게 움직이지 않게. 모두 null이면 "집계 중", 분모가 0이거나 줄이 없으면 "자료 없음") 비율을 보이고 caption은 "{시작} – {끝}에 온 신환 {N}명 가운데 {K}명 · 온 뒤 30일이 지난 가장 최근 신환이에요"다. 날짜는 그 범위에서 30일 값이 숫자인 첫날과 끝날이다. 7·14일 줄은 고른 기간 그대로이고, 7일·90일 기간은 바뀌지 않는다. 시험: 오늘이 11월 13일인 30일 기간 — 30일 줄이 9월 14일 ~ 10월 13일을 세고 그 날짜를 보인다. 시험: 가장 새로운 날들이 null — 날짜가 숫자인 날까지로 줄어든다. 시험: 7일 기간 — 30일 줄이 "집계 중"이다
- AC-516.3: Given 대시보드 브리핑 파일(`components/dashboard/briefing/*`), When 보면, Then 고치지 않았고 `'use client'`는 지금처럼 폰 아래 단추 파일 하나뿐이다. 읽기와 연결 전·뒤 고르기는 `components/dashboard/summary/`의 새 클라이언트 파일 하나가 한다
- AC-516.4: Given 지금 대시보드 시험(브리핑·분석·보고 문장·페이지), When 돌리면, Then 30일 줄 기대값과 페이지가 읽기 자리를 부르는 방식만 고치고 나머지는 그대로 통과한다

### REQ-517: 개인정보 E2E (실제 Supabase, 사용자가 SQL을 붙인 뒤)
- AC-517.1: Given 시험 계정(승인됨)으로 연 `/stats`와 가짜 비트 파일(`fixtures/fake-bit/`), When 파일을 넣어 저장하면, Then 브라우저가 보낸 모든 요청(주소·본문, 그리고 `authorization`·`apikey`·`cookie`를 뺀 머리)에 그 파일의 차트번호·이름 칸 값·전화·주민번호 모양·파일 이름이 없다. 시험은 인증 머리·쿠키·apikey 값을 모으지 않고, 걸리면 어떤 종류가 어디에서 걸렸는지(`{ kind, where }`, 값 없음)만 보인다(`expect(hits).toEqual([])`)
- AC-517.2: Given 같은 시험 뒤, When 시험 계정으로 `stats_months`·`stats_days`·`stats_coverage`를 다시 읽으면, Then 저장된 값에도 AC-517.1의 값이 하나도 없고 줄 모양이 `validateMonthPayload`·`validateDayPayload`를 지난다
- AC-517.3: Given `/dashboard`, When 그 계정으로 열면, Then 방금 저장한 숫자가 보이고(연결 뒤 짜임) 요청에 같은 금지 값이 없다. 시험은 `npm run e2e`에서만 돌고(`npm test` 밖), 시험 계정 병원의 통계 줄만 쓴다

## 범위 밖
- 처방코드 그룹·즐겨찾기 화면과 `rx_groups` 표(plan.md §2-2에 있지만 사용자가 정한 통계 탭 내용에 없다. 저장 모양의 그룹 칸은 빈 목록으로 둔다)
- 처방 추세의 금액·소모량, 치료별 매출(매출 탭 몫). 원본 `TrendDataSource.VisitFactsSql` 같은 금액 사실 읽기
- 동네(지역) 보기 화면. 도우미 자료에는 주소가 없어 동네를 비운다
- 주(week) 숫자 저장, 신환율·재진율·재방문율의 기록 비교(stats-core 범위 밖 그대로)
- 보고 숫자(금액)와 진료 줄의 서버 저장. 휴대폰에서 보고 문장 복사
- 대시보드 브리핑 짜임 바꾸기, 로그인 첫 화면 바꾸기
- 원본의 ESWT 묶음 줄(`@eswt`), 원본 보고서 파일 저장(`save_report`), 엑셀·HTML 보고서
- 사전점검 명세(`specs/precheck/`)와 `phases/precheck-*` 고치기 — 그 명세가 다음에 고칠 때 REQ-027~031·Phase 6을 뺀다(design.md '사전점검 명세가 할 일')

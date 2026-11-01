# 요구사항: 환자 탭 (F/U 명단 · 정기 주사 문자 명단 · 문자 문구)

> 기능 ID: `patients` · 형식: 요구사항은 `### REQ-601: 제목`, 수용 기준은 `- AC-601.1: Given/When/Then`.
> 각 AC 는 테스트 하나 이상으로 검증되어야 하며, 테스트 이름에 AC ID 를 넣는다.
> 번호는 601부터다. 다른 명세가 쓴 번호(auth·auth-live·landing·stats-core·precheck의 001~034, landing-v2의 101~114, b2b-redesign의 201~222, tab-frame의 301~317, ui-90의 401~423)와 시험 이름이 겹치지 않게 한다.
> "옮겨 옴: precheck REQ-0xx"가 붙은 요구사항은 청구 사전점검 명세(`specs/precheck`)의 Phase 5(환자 연락)에서 옮겨 온 것이다(2026-11-01 사용자 결정: 환자 탭에서 만든다). 주소는 `/contact` → `/patients`, 화면 폴더는 `components/contact` → `components/patients`로 바뀐다.

## 배경 / 목표
- 탭 줄의 [환자](`/patients`)는 지금 '준비 중' 화면이다(tab-frame). 사용자가 정한 탭 내용(2026-10-31·11-01): **F/U 명단**, **정기 주사 문자 명단**, **문자 문구**(고치고 복사만 한다. 앱은 문자를 보내지 않는다).
- 도구가 여러 개인 탭이라 맨 위에 그 탭의 도구 단추 줄을 둔다(`docs/tab-frame/plan.md` §1).
- 환자 이름·전화번호·차트번호·증상 글은 비트 PC 밖으로 나가지 않는다. 도우미 → 확장 → 통로(`lib/bridge`) → Worker → 화면 메모리로만 오고, 서버·브라우저 저장소·주소·로그에 남지 않는다. 연락 표시와 정기 주사 기록은 도우미가 그 PC에 암호화해 둔다(ADR-020과 이 명세가 더하는 ADR-020 보충). 서버에는 남은 건수 정수 둘과 문자 문구(환자 정보 아님)만 간다(ADR-021).
- 휴대폰·확장 없는 브라우저에서는 명단 대신 남은 건수만 보인다. 문자 문구는 환자 정보가 없어 어디서나 고칠 수 있다.
- 계산은 원본 양지바른(`seoseungkwan/shared@2a1069b`, `YangjiBareun_사전점검/`)과 같아야 한다. 같은 가짜 자료를 넣어 결과를 견주는 골든 시험으로 증명한다.
- 자료가 없으면 지어낸 숫자 없이 "자료 없음"을 보인다.

## 요구사항

### REQ-601: 환자 자료 울타리
- 옮겨 옴: precheck REQ-026 (수용 기준 026.5의 울타리 부분)
- AC-601.1: Given `src/lib/patients/**`(시험 파일 포함), When ESLint를 돌리면, Then 기존 환자 자료 구역과 같은 규칙(네트워크·console·브라우저 저장소·React/Next/supabase/`lib/auth`/`lib/storage` import·JSX 금지)이 걸리고, `src/guardrails.test.ts`가 규칙마다 막힘을 보인다
- AC-601.2: Given `src/components/patients/rows/**`, When ESLint를 돌리면, Then JSX는 되고 네트워크·console·브라우저 저장소·supabase·`lib/storage`·`lib/auth` import는 막힌다
- AC-601.3: Given `src/components/patients/**`·`src/app/(app)/patients/**`, When 오류 보고 패키지(`@sentry/*`·`@vercel/analytics`·`@vercel/speed-insights`)를 import하면, Then 막힌다
- AC-601.4: Given 기존 구역(lib/parsers·analytics·payload·precheck·bridge·workers·extension), When 같은 울타리 시험을 돌리면, Then 모두 그대로 통과한다(규칙을 풀지 않는다)

### REQ-602: F/U 명단 계산
- 옮겨 옴: precheck REQ-024 (수용 기준 024.1~024.3)
- AC-602.1: Given 가짜 증상 글, When `parseFU(visitDate, lines)`, Then 원본처럼 '1주/N주 뒤·내일·모레·다음주+요일·N월 초/중/말'과 적어 둔 날짜(10.17·10/19·10월 17일, 진료일부터 120일 안)를 읽어 `{dateStr, sortDate, kind(예정·조건부), evidence}`를 만든다. 'VAS 7/10'·'L4.5'는 날짜로 보지 않는다(골든)
- AC-602.2: Given 'N차' 기록, When `aragan`, Then 원본처럼 N < 3이면 다음 날짜를 +7일로 둔다(골든)
- AC-602.3: Given 비트 83 표 줄(첫 줄 = 칸 이름), When `prepareSchedule(rows)`, Then 원본처럼 내원번호·차트번호로 묶고 증상 줄을 이어 날짜 → 내원번호 순서로 내원 목록과 차트번호별 마지막 내원을 만든다. 환자명·차트번호·기록날짜를 못 읽은 줄, 같은 내원번호에 다른 환자, 필수 칸 없음·중복은 원본이 멈추는 곳에서 오류 번호 `E-PATIENTS-SOURCE`로 멈춘다(골든: 결과와 멈추는 사례)
- AC-602.4: Given 비트 47 표 줄, When `preparePhones(rows)`, Then 원본처럼 전화 칸(휴대폰·휴대전화·핸드폰·연락처·전화번호, 보호자, 1·2. 팩스 제외)을 찾아 번호를 나누고, 번호가 하나인 차트만 `map`에 넣고, 같은 차트에 다른 번호면 `E-PATIENTS-SOURCE`로 멈춘다(골든)
- AC-602.5: Given 내원 목록과 기준 날짜, When `scheduleRows`·`undecidedRows`·`visitKind`·`pasteRows`, Then 원본과 같은 내원 예정 명단(조건부·지난 예정 포함 여부), 날짜 미정 명단, 주사·F/U 구분, 붙여넣기 4칸 명단(이름·전화·이름·부위 또는 fu, 날짜가 바뀌면 빈 줄, 날짜 머리 줄 선택)을 만든다(골든, 기준 날짜 고정)

### REQ-603: 정기 주사 명단 계산
- 옮겨 옴: precheck REQ-024 (수용 기준 024.4)
- AC-603.1: Given 원본 `DEFAULTS`(연골주사 `A49` 3차 뒤 6개월, 비타민D `A32` 맞을 때마다 3개월), When `RECALL_DEFAULTS`·`roundTest`·`addMonthsToDay`, Then 원본과 같다: '3차'는 13차·23차와 구분하고, 달을 더할 때 말일에 맞춘다(1/31 + 1개월 → 2/28, 날짜 계산은 `lib/analytics/dates.ts`)(골든)
- AC-603.2: Given 쌓인 기록과 새로 읽은 한 달(83·47 줄), When `ingestRecall(history, piece, codes, today)`, Then 원본 `ingest`처럼 설정 코드가 처방된 내원만 `{chart, name, date, codes, text, phone}`으로 쌓고, 그 기간의 예전 기록은 새것으로 바꾸고, 36개월 지난 기록은 지우고, 50,000건을 넘으면 최근 것만 남기고, `from`을 갱신한다(골든)
- AC-603.3: Given 기록과 규칙, When `recallCompute`·`recallSelect(from, to, overdue)`·`recallStatus`, Then 원본처럼 환자·규칙마다 마지막 주사만 보고 조건에 맞을 때만 다음 예정일을 내며, 기간·지난 예정 포함으로 고르고, "지남 N일"·"오늘"·"N일 남음"을 돌려준다(골든)
- AC-603.4: Given 쌓인 기록, When `recallCoverage(history, rules, today)`, Then 원본 `coverageNote`와 같은 판정(기록 건수·시작 날짜·기록이 간격보다 짧은 규칙 목록)을 돌려준다. 문구는 화면이 우리 말로 만든다(골든은 판정만)
- AC-603.5: Given 고른 명단, When `recallCopyLines`·`recallPhones`, Then 원본 [명단 복사](이름·전화·이름·종류 4칸)·[번호 복사](숫자만, 같은 번호는 한 번, 번호 없는 사람 수)와 같은 글을 만든다(골든)

### REQ-604: Worker — 조각 모으기 · 보기 모양 · 연락 표시
- 옮겨 옴: precheck REQ-026 (수용 기준 026.2·026.4의 계산 부분)
- AC-604.1: Given 통로 포트로 온 `chunk`…`end`, When 모으면, Then 조각 수·바이트 수·SHA-256이 모두 맞을 때만 JSON으로 푼다. 하나라도 다르면 `E-BRIDGE-BAD-REPLY`, `abort`면 받은 오류 번호로 그 요청을 끝내고 반쪽 자료를 쓰지 않는다
- AC-604.2: Given 오늘과 쌓인 기록, When `readPlan`, Then F/U는 최근 120일을 31일 이하 조각(오래된 것부터)으로, 정기 주사는 마지막으로 읽은 달의 1일부터 오늘까지(처음이면 켠 규칙 중 가장 긴 간격 + 1개월 전 달의 1일부터) 달 조각으로 나눈다
- AC-604.3: Given `contact.targets` 답과 `store.load` 답, When 보기 모양을 만들면, Then 종류마다 따로 만든다: F/U 조각이 모두 오면 `FollowupView`(이름·전화·마지막 진료·다음 날짜·구분·근거·연락함), 정기 주사 조각이 모두 오고 `store.load`가 됐으면 `RecallView`(종류·이름·전화·마지막 주사·다음 예정일·상태·근거·연락함, 쌓인 기록 안내)를 화면에 보낸다. 한 종류의 조각 하나라도 실패·시간 초과면 그 종류만 보기 모양 없이(`null`) 그 종류의 오류 번호를 보내고, 다른 종류는 그대로 보낸다(F/U가 실패해도 정기 주사는 보이고, 그 반대도 같다)
- AC-604.4: Given 줄 하나의 [연락함], When 화면이 Worker에 표시를 시키면, Then Worker가 `store.save {contact}` 글자를 만들어 통로 포트로 보내고, 됨이면 그 줄을 연락함으로 바꾼 보기 모양과 건수를, 실패면 바꾸지 않고 오류 번호만 화면에 보낸다. 화면으로 가는 메시지에는 보낼 글자가 없다
- AC-604.8: Given `store.load`가 아직 안 끝났거나 실패함(다시 불러오는 중 실패해 옛 줄이 화면에 남아 있는 경우 포함), When [연락함]을 누르거나 정기 주사 기록을 합치면, Then Worker는 `store.save`를 보내지 않고(PC의 저장을 덮어쓰지 않는다) 오류 번호만 화면에 보낸다. 이때 F/U 보기 모양은 연락 표시 없이(`marksLoaded: false`) 보이고 건수는 내지 않으며(`null`), 정기 주사 보기 모양은 `null`이다
- AC-604.5: Given 두 보기 모양, When `contactCounts(view, today)`, Then `{followup_left, injection_left}` 0 이상 정수 둘을 낸다: F/U는 '예정'(조건부 아님)이고 다음 내원일이 내일인 사람 중 연락함이 아닌 수, 정기 주사는 다음 예정일이 오늘까지 온(지난 것 포함) 사람 중 연락함이 아닌 수. 화면에서 고른 기간·도구와 상관없이 센다 두 보기 모양 중 하나라도 없거나 연락 표시를 불러오지 못했으면 건수를 내지 않는다(`null`)
- AC-604.6: Given 쌓인 기록·연락 표시, When 저장 글자를 만들면, Then `{v: 1, marks, recall}` 모양이다. 연락 표시는 보기 모양이 있는 종류마다 그 보기 모양에 열쇠가 있는 것만 남기고(날짜는 보지 않는다), 보기 모양이 없는 종류의 표시는 그대로 둔다. 예: 정기 주사 기록을 합쳐 저장해도 내일 오실 F/U 줄의 연락함 표시는 남는다. 글자가 30MB(도우미 한도 32MB 아래)를 넘으면 증상 글을 자르지 않고 가장 오래된 정기 주사 기록부터 빼서 맞추고 기록 시작 날짜(`from`)를 그만큼 늦춘다(쌓인 기록 안내에 보인다)
- AC-604.7: Given 연락함으로 표시한 뒤 다시 오지 않은 정기 주사 환자(예정일이 1년 넘게 지남), When 다음에 탭을 열어 보기 모양과 건수를 만들면, Then 그 줄은 여전히 연락함이고 `injection_left`에 다시 들어가지 않는다

### REQ-605: 도우미 — F/U · 정기 주사 대상 읽기 (`contact.targets`)
- 옮겨 옴: precheck REQ-023 (수용 기준 023.1~023.3)
- AC-605.1: Given `{kind, from, to}`(31일 이하, 오늘 이하), When `contact.targets`, Then 등록 병원을 다시 확인하고 비트 83 표(내원번호·차트번호·환자명·증상·기록날짜)와 47 표(F/U는 차트번호 + 전화 칸, 정기 주사는 처방코드·차트번호·처방일자 + 전화 칸. 같은 줄은 한 번)만 남겨 `{v: 1, kind, from, to, chart, rx}`(표마다 첫 줄 = 칸 이름인 글자 2차 배열)를 `chunk`…`end`로 보낸다. 전화 칸은 원본 `phoneColumn` 규칙과 같은 칸 이름만이다
- AC-605.2: Given 31일을 넘거나 `from` > `to`이거나 오늘 뒤인 기간, When `contact.targets`, Then 명령 표의 1,100일 안이어도 `E-HELPER-BAD-MESSAGE`로 거절한다
- AC-605.3: Given 읽은 표, When 한 표가 300,000줄을 넘으면 자르지 않고 `E-BIT-READ-FAILED`, 꼭 있어야 하는 칸이 없으면 `E-BIT-EXPORT-FAILED`, 읽기 실패·시간 초과면 `E-BIT-READ-FAILED`로, Then `end` 없이 `error`만 보낸다(일부만 보내지 않는다)
- AC-605.4: Given 어떤 실패, When 도우미가 기록을 남기면, Then 진단 기록·예외 메시지에는 시각·명령 이름·오류 번호만 있고 이름·전화·차트번호·증상 글이 없다

### REQ-606: 도우미 — 연락 표시 · 정기 주사 기록 저장 (`contact.dat`)
- 옮겨 옴: precheck REQ-026 (수용 기준 026.2의 저장 부분) · precheck design.md 9-3
- AC-606.1: Given `store.save {payload: {contact}}`, When 처리하면, Then 등록 병원을 확인하고 `contact`를 DPAPI로 암호화해 `contact.dat`(머리 `PRECHECK-STORE-1`, 임시 파일 → 바꿔치기, `.bak` 하나)에 등록 프로필 ID와 함께 쓰고 `{saved: true}`를 돌려준다
- AC-606.2: Given `store.load {contact: true}`, When 처리하면, Then `contact.dat`의 `contact`를 `chunk`…`end`로 보낸다. 파일이 없거나 다른 등록 프로필의 파일이면 `{}`를 보낸다
- AC-606.3: Given 깨진 `contact.dat`, When 읽으면, Then `.bak`이 맞으면 그것을 쓰고, 아니면 `E-STORE-BROKEN`이다(깨진 파일은 이름만 바꿔 남긴다). 쓰기 실패는 `E-STORE-FAILED`다
- AC-606.4: Given `contact` 밖의 칸(명령 표의 `store.save` payload `month`·`drafts`·`done`·`journal`·`settings`, `store.load`의 `months`·`settings` — 청구 작업 저장, precheck TASK-15 몫), When `store.load`·`store.save`에 오면, Then `contact` 밖의 칸은 무엇이든 `E-HELPER-BAD-MESSAGE`로 거절한다. `contact`가 32MB를 넘어도 거절한다
- AC-606.5: Given 다른 도우미 프로세스가 작업 뮤텍스(`Local\SeoseungkwanPrecheckHelper.Work`)를 쥐고 있음, When `store.save`, Then 5초 기다려도 못 잡으면 `E-BRIDGE-BUSY`다

### REQ-607: 서버 표 — 문자 문구 · 연락 남은 건수
- 옮겨 옴: precheck design.md 8-1(`message_templates`) · 8-2(`contact_counts`)
- AC-607.1: Given migration 파일, When PGlite에 auth migration 다음으로 실행하면, Then `message_templates`(kind `injection`·`followup`, 이름 1~30자, 내용 1~2000자, `sort_order` 0~99)와 `contact_counts`(병원마다 한 줄, `followup_left`·`injection_left` 0~100000 정수, 바뀐 시각. 글자·jsonb 칸 없음)가 생기고 `hospital_id`는 DB 기본값(`my_hospital_id()`)으로만 들어간다
- AC-607.2: Given RLS, When anon·다른 병원·승인 안 된 병원·`hospital_id`를 직접 넣는 요청·범위 밖 값이 오면, Then 모두 거부된다. 승인된 내 병원은 내 줄만 읽고 쓴다(`message_templates`는 지우기도)
- AC-607.3: Given 권한, When migration을 보면, Then 표마다 기본 권한을 먼저 회수하고 `authenticated`에 칸 단위 `insert`·`update`(`id`·`hospital_id`·`updated_at` 제외)와 `select`(`message_templates`는 `delete`도)만 준다. `my_hospital_id()`는 `security definer`·`search_path = ''`이고 `public`·`anon`에서 실행 권한을 회수한다(cross-branch 규칙 C1 글 그대로). `touch_updated_at()`는 definer 없이 `search_path = ''`다
- AC-607.4: Given 같은 migration, When 두 번 실행하거나 다른 브랜치 migration이 같은 함수(`my_hospital_id`·`touch_updated_at`, C1 글)를 먼저 만든 뒤 실행하면, Then 깨지지 않고 함수 몸통이 같다(업무일지·통계·매출·precheck 설정 표 파일과 함수를 함께 쓴다)

### REQ-608: 문자 문구 채우기 · 기본 문구
- 옮겨 옴: precheck REQ-025 (수용 기준 025.1)
- AC-608.1: Given 문구와 날짜, When `fillTemplate(body, date)`, Then 원본 `withDate`처럼 `<<DATE>>`가 있는 줄과 이미 날짜 줄('* M월 D일 X요일 *')인 줄을 "* M월 D일 X요일 *"로 바꾸고 `[*1*]`·`[*2*]`와 다른 줄은 그대로 둔다(날짜는 `dates.ts`, 골든 여러 날짜)
- AC-608.2: Given 처음(저장한 문구 없음), When `DEFAULT_TEMPLATES`, Then 원본 `TPLS`의 `jusa` → `injection` '주사 안내', `jinryo` → `followup` '진료 안내'의 이름·글이 원본과 같다(골든)
- AC-608.3: Given 오늘, When `defaultSendDate(today)`, Then 원본처럼 내일이다(전날 보내는 안내)

### REQ-609: 문자 문구 · 남은 건수 저장 (브라우저 → Supabase)
- 옮겨 옴: precheck REQ-025 (수용 기준 025.2의 저장·025.4) · precheck REQ-026 (수용 기준 026.4의 올리기)
- AC-609.1: Given 내 병원, When `readTemplates(sb)`, Then `sort_order` 순서의 문구 줄을 돌려주고, 줄이 없으면 `[]`를 돌려준다. 읽기가 실패하면(표 없음·권한·네트워크) `[]`로 바꾸지 않고 `E-PATIENTS-TEMPLATES-READ`를 던진다
- AC-609.2: Given 전과 후 목록, When `saveTemplates(sb, before, after)`, Then 더한 줄은 insert, 바뀐 줄은 update, 빠진 줄은 delete, 순서는 `sort_order`로 보낸다. 보내는 몸통에 `hospital_id`·`updated_at`(insert에는 `id`도)이 없다. 하나라도 실패하면 `E-PATIENTS-TEMPLATES-SAVE`를 던진다
- AC-609.3: Given 건수, When `checkContactCount(row)`·`upsertContactCount(sb, row)`, Then 0~100000 정수 두 칸(`followup_left`·`injection_left`)만 통과하고(다른 칸·글자·음수·소수는 거절), 보내는 몸통은 그 두 칸뿐이다. 실패면 `E-PATIENTS-COUNTS-SAVE`를 던진다
- AC-609.4: Given 내 병원, When `readContactCount(sb)`, Then `{followup_left, injection_left, updated_at}` 또는 줄이 없으면 `null`을 돌려준다. 읽기가 실패하면 `null`로 바꾸지 않고 `E-PATIENTS-COUNTS-READ`를 던진다
- AC-609.5: Given `lib/errors.ts`, When 오류 번호를 찾으면, Then `E-PATIENTS-TEMPLATES-READ`·`E-PATIENTS-TEMPLATES-SAVE`·`E-PATIENTS-COUNTS-READ`·`E-PATIENTS-COUNTS-SAVE`·`E-PATIENTS-SOURCE`의 '무엇이 · 어떻게 고치나' 문구가 있다. 다른 브랜치 몫 번호(`E-SETTINGS-FAILED`·`E-COUNTS-FAILED`·`E-BIT-EXPORT-FAILED` 등)는 더하지 않는다(규칙 C3)

### REQ-610: 환자 탭 입구 · 도구 단추 줄 · 휴대폰은 건수만
- 옮겨 옴: precheck REQ-026 (수용 기준 026.5의 탭 부분 · 026.6)
- AC-610.1: Given `/patients`, When 열면, Then 준비 중 화면 대신 환자 탭이 열린다. 탭 줄 [환자]는 화면이 있는 탭(`href: '/patients'`, `ready: true`)이고, 준비 중 목록(`NOT_READY_FEATURES`)과 대시보드 기능 목차의 '준비 중'에서 빠진다(목차 상태는 청구처럼 `connect-first`). 브라우저 탭 이름은 "환자"다
- AC-610.2: Given 환자 탭, When 그리면, Then 맨 위 도구 단추 줄에 [F/U 명단] · [정기 주사 문자 명단] · [문자 문구]가 있고 고른 도구에 `aria-current`가 붙는다. 고른 도구는 주소 `?tool=followup|recall|messages`로 남고, 없거나 모르는 값이면 F/U 명단이다
- AC-610.3: Given 확장이 없는 브라우저나 휴대폰, When F/U·정기 주사 도구를 열면, Then 명단 대신 연락 남은 건수(`contact_counts`의 두 수와 마지막 바뀐 시각)만 보인다. 줄이 없으면 숫자 없이 "자료 없음"과 "비트 PC에서 환자 탭을 열면 건수가 생겨요"를 보인다. 건수를 읽지 못하면(`E-PATIENTS-COUNTS-READ`) '자료 없음'이 아니라 오류 카드와 [다시 불러오기]를 보인다. 문자 문구 도구는 그대로 쓸 수 있다
- AC-610.4: Given 확장은 있는데 도우미 없음·업데이트 필요·끊김, When 명단 도구를 열면, Then 명단 대신 비트 PC 연결 안내와 [비트 PC 연결](`/claim/setup`)을 보인다. 다른 창에서 작업 중(`busy`)이면 그 안내와 [건수만 보기]를 보인다
- AC-610.5: Given 명단을 보이는 동안, When 주소·화면 제목·브라우저 탭 이름을 보면, Then 이름·전화·차트번호가 없다(주소에는 도구 이름만)

### REQ-611: F/U 명단 화면
- 옮겨 옴: precheck REQ-026 (수용 기준 026.1~026.3의 F/U 부분)
- AC-611.1: Given 연결된 비트 PC, When F/U 명단 도구를 열면, Then `contact.targets(followup)` 조각을 차례로 불러(진행 "n/전체") 목업 승인본처럼 F/U 명단을 보인다: 이름·전화·마지막 진료·다음 날짜(요일)·구분(주사·F/U)·근거 문구·연락함. 기간(처음 '내일', 이번 주·다음 주·직접), 조건부 포함, 지난 예정 포함, 구분을 고를 수 있고 날짜 미정 명단은 따로 보인다
- AC-611.2: Given 대상 없음·불러오는 중·실패, When 그리면, Then 빈 상태 문구 · 불러오는 중 · 오류 번호와 [다시 불러오기]를 보인다(지어낸 줄 없음)
- AC-611.3: Given 줄 하나, When [연락함]을 누르면, Then REQ-604 흐름으로 저장하고 됨이면 그 줄이 '연락함'으로, 실패면 그대로 두고 오류 번호 줄을 보인다. 브라우저 저장소는 쓰지 않는다
- AC-611.4: Given 고른 명단, When [명단 복사](날짜 머리 줄 선택)·[문구 복사](주사 안내·진료 안내)를 누르면, Then `pasteRows` 글이나 고른 날짜로 채운 문구를 클립보드에 넣고 "복사했어요"를 보인다. 문구를 읽지 못했으면(`E-PATIENTS-TEMPLATES-READ`) [문구 복사] 자리에 오류 번호와 [다시 불러오기]를 보이고 기본 문구로 대신하지 않는다. 문자를 보내지 않는다
- AC-611.5: Given 환자 줄, When 그리면, Then `components/patients/rows`의 부품이 props로만 그린다

### REQ-612: 정기 주사 문자 명단 화면
- 옮겨 옴: precheck REQ-026 (수용 기준 026.1~026.3의 정기 주사 부분)
- AC-612.1: Given 연결된 비트 PC, When 정기 주사 도구를 열면, Then `store.load`로 쌓인 기록을 받고, `readPlan`의 달만 `contact.targets(injection)`로 읽어 합친 뒤 `store.save`로 저장하고, 목업 승인본처럼 명단을 보인다: 종류·이름·전화·마지막 주사(요일)·다음 예정일(요일)·상태·근거 문구·연락함. 기간(처음 오늘 ~ 30일 뒤)과 지난 예정 포함(처음 켬)을 고를 수 있다
- AC-612.2: Given 쌓인 기록 판정(REQ-603의 `recallCoverage`), When 그리면, Then 기록 건수·시작 날짜를 보이고, 기록이 간격보다 짧은 규칙이 있으면 "그보다 오래전에 맞은 분은 아직 명단에 없어요"를 보인다. 처음 읽을 때는 달 진행("n/전체 달")을 보인다
- AC-612.3: Given 고른 명단, When [연락함]·[명단 복사]·[번호 복사]·[문구 복사](주사 안내)를 누르면, Then REQ-611의 [연락함]·복사와 같이 하되 복사 글은 `recallCopyLines`·`recallPhones`이고 번호 없는 사람 수를 함께 알린다
- AC-612.4: Given 대상 없음·불러오는 중·실패(기록 저장 실패 포함), When 그리면, Then 빈 상태 · 불러오는 중 · 오류 번호와 [다시 불러오기]를 보인다

### REQ-613: 문자 문구 화면
- 옮겨 옴: precheck REQ-025 (수용 기준 025.2~025.4)
- AC-613.1: Given 문자 문구 도구, When 열면, Then 주사 안내·진료 안내 문구 목록(읽기가 됐고 저장한 줄이 없을 때만 `DEFAULT_TEMPLATES`), 내원 날짜 고르기(처음 내일), 채운 글 미리 보기를 보인다
- AC-613.6: Given 문구 읽기 실패(`E-PATIENTS-TEMPLATES-READ`), When 그리면, Then 오류 카드와 [다시 불러오기]만 보이고 목록·고치기·[저장]·[문구 복사]는 읽기가 될 때까지 없다(기본 문구를 `before = []`로 저장해 서버 줄이 겹치는 일을 막는다)
- AC-613.2: Given 문구, When 더하기·고치기·지우기·순서 바꾸기(위·아래) 뒤 [저장]을 누르면, Then `saveTemplates`로 저장한다. 이름 1~30자·내용 1~2000자는 저장 전에 화면에서도 검사한다
- AC-613.3: Given [문구 복사], When 누르면, Then 고른 날짜로 채운 글을 클립보드에 넣고 "복사했어요"를 보인다. 복사가 막히면 글을 골라 둔 채 "복사하지 못했어요"와 안내를 보인다. 문자 보내기 기능은 없다
- AC-613.4: Given 저장 실패, When 생기면, Then 고친 값을 그대로 두고 `E-PATIENTS-TEMPLATES-SAVE` 오류 카드와 [다시 저장]을 보인다
- AC-613.5: Given 휴대폰·확장 없는 브라우저, When 문자 문구 도구를 열면, Then PC와 같은 화면이 열린다(환자 정보가 없다)

### REQ-614: 연락 남은 건수 올리기
- 옮겨 옴: precheck REQ-026 (수용 기준 026.4)
- AC-614.1: Given 연결된 비트 PC의 환자 탭, When 두 명단(F/U·정기 주사)을 모두 불러오면, Then 그때 `contactCounts`를 `upsertContactCount`로 올린다. 한 명단만 불러왔거나 한 종류가 실패했거나 연락 표시를 불러오지 못했으면(건수 `null`) 올리지 않는다(다른 칸을 0으로 덮거나 연락한 분을 다시 세지 않게)
- AC-614.2: Given 연락 표시가 바뀌어 건수가 바뀜, When 저장되면, Then 다시 올린다. 지난번에 올린 값과 같으면 보내지 않는다
- AC-614.3: Given 올리는 요청, When 몸통을 보면, Then 정수 두 칸뿐이고 이름·전화·차트번호·날짜 글자가 없다(시험이 가짜 Supabase 요청 몸통을 본다)
- AC-614.4: Given 올리기 실패, When 생기면, Then 명단은 그대로 쓰고 `E-PATIENTS-COUNTS-SAVE` 작은 오류 줄과 [다시 올리기]를 보인다

### REQ-615: 개인정보 E2E (실제 Supabase, 사용자가 SQL을 붙인 뒤)
- 새로 (cross-branch 규칙 C7)
- AC-615.1: Given 시험 계정으로 로그인하고 가짜 확장·도우미(시험 코드가 `chrome.runtime`을 흉내 내 가짜 명단 조각을 줌)를 넣은 브라우저, When `/patients`에서 두 명단을 불러오고 [연락함]을 누르고 문자 문구를 저장하면, Then 브라우저에서 나간 모든 요청(주소·쿼리·몸통)에 가짜 차트번호·이름·전화·주민번호 모양·파일 이름이 없다
- AC-615.2: Given 같은 시험 뒤, When `message_templates`·`contact_counts`의 내 줄을 다시 읽으면, Then 저장된 값에 가짜 차트번호·이름·전화·주민번호 모양·파일 이름이 없고 `contact_counts`는 정수 둘과 시각뿐이다
- AC-615.3: Given 시험 산출물, When 끝나면, Then trace·스크린샷·네트워크 기록에 쿠키·토큰이 없다(`trace: 'off'`)

## 범위 밖
- 문자 자동 발송·문자 프로그램 연결(복사만 한다)
- 명단 엑셀로 저장(원본 [엑셀로 저장]). 필요하면 다음 명세
- 정기 주사 약제코드·간격 설정 화면(원본 [약제코드·간격 설정]). 이번에는 원본 기본값으로 고정한다(design.md '사용자에게 물을 것')
- 비트 파일을 끌어다 놓아 명단을 만드는 길(원본 수동 가져오기). 도우미 길만 만든다
- 가입 질문으로 문자 문구 기본값 채우기(`docs/precheck/clinic-memo-plan.md` §2 '문자 문구' 줄) — precheck 병원 맞춤 계획이 만든다. 이 명세는 표·고치기·복사만
- 백업 내려받기에 `message_templates` 넣기(precheck REQ-032) — precheck Phase 7이 한다
- 비트 표 읽기 부품 자체(`VendorGridExport`·`GridReader`·`GridRows`, precheck TASK-8)와 청구 작업 저장(`work-*.dat`·`settings.dat`, precheck TASK-15)
- 다른 PC에서 보는 건수 모음 화면(청구 건수와 함께 보는 화면, precheck TASK-19)

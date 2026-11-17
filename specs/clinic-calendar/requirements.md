# 요구사항: 예약 탭 (구글 캘린더 대신)

> 기능 ID: `clinic-calendar` · 형식: `### REQ-5901: 제목` 아래 `- AC-5901.1: Given/When/Then`. 시험 이름에 AC ID를 넣는다.
> 번호: REQ-5901~5908(57xx·58xx는 다른 명세가 쓴다).
> **MVP 모드**(사용자 규칙: 최소안·검토는 마지막 한 번). 새 서버 표 넷(SQL 하나) · 도우미 0.10.0 · 확장 새 판 없음.

## 배경 / 목표
- 의원 공용 구글 캘린더를 웹앱 새 탭 '예약'으로 바꾼다. 구글과 잇지 않고 옮겨 오지도 않는다. 정한 날부터 웹앱에 새로 적는다.
- 의원 구글 계정 하나(지금 로그인 그대로)로 접수·치료실·진료실 PC와 폰(총괄·원장님)에서 쓴다.
- 승인 시안: `docs/mockups/clinic-calendar/index.html`·`notes.md`(2026-11-17 사용자 "이대로 만들기", 기본값 1~23 모두 그대로, 월 보기는 수만). 취소·변경 통계 상태(`?s=summary`·`?s=stats`)는 이 명세와 함께 승인받는다. 시안과 다른 곳은 design.md '시안과 다른 곳'.

## 이미 정한 것 (사용자, 다시 묻지 않는다)
1. 환자 이름·차트번호는 서버(Supabase)에 그대로 두고 로그인한 의원 계정만 본다(RLS). 전화번호는 어디에도 없다 → ADR-030
2. 지난 예약은 1년 뒤 저절로 지운다. 다른 PC에는 몇 초 안에 보인다
3. 칸: 날짜·시작(10분 칸)·길이(5분씩 5~240)·이름(필수)·차트번호(선택)·시행자(필수)·종류(필수)·메모·도착(자동/왔음/안 옴, 손으로 고르면 이김)·취소
4. 설정(병원마다): 종류(이름 10자·기본 길이·색 또는 '시행자 색 따름', 기본 도수30·자보도수30·충격파15·주사10·진료10) · 시행자(이름·한 글자 표시(겹침 없음)·색) · 보이는 시간 · 일요일 보기
5. 종일 줄: 메모(20자) 또는 시행자 휴무. 경고만 하고 저장은 됨: 같은 시행자 겹침 · 그날 휴무인 시행자. [다음 주에도] = 7일 뒤 같은 시간에 복사
6. 비트 PC만(도우미 → 확장 → `lib/bridge` → Worker, 서버에 안 둠): 이름·차트번호로 비트 찾기(같은 이름 목록에 성별·나이·마지막 내원), 도착 자동(그날 같은 차트번호 비트 접수 → 왔음, 끝 시각이 지나도 없음 → 안 옴, 비트 PC가 서버에 적어 폰도 봄), 비트 자체 예약(RsvInf)을 흐린 보기 전용 칸으로. 폰은 이름·차트번호를 손으로 적는다
7. 일정 변경 기록: [고치기]로 날짜나 시작이 바뀌면 칸에 '변경' 표시, 자세히 판에 처음 자리(`원래 11/18 (수) 15:00`, 여러 번 옮겨도 처음 것만), 월 보기 `변경 N`. 길이·시행자·종류·메모만 바꾸면 변경이 아니다. 취소([예약 취소] 흐린 칸·가운데 줄, [취소 되돌리기])·지우기(한 번 더 물음)는 시안 그대로
8. 취소·변경·안 옴 통계: 예약 탭에 보이는 기간 요약 줄과 시행자별·종류별 표, 통계 탭 새 '예약' 칸(최근 12달)
9. 메뉴: '예약'은 주요 탭 맨 끝(수납일지 다음). `feat-nav-worklog`(업무일지를 수납일지 바로 앞으로)가 합쳐진 뒤를 기준으로 쓴다
10. 같은 도우미 판에서: 수납일지 건강생활유지비(QCV)로 낸 줄은 'FREE · 0원' 대신 `건강생활 · {금액}원`이고 FREE 수에 안 든다. `MIN_HELPER`는 그대로

## 요구사항

### REQ-5901: 서버 표 (새 migration 하나)
- AC-5901.1: Given `supabase/migrations/20261117010000_calendar.sql`, When 실행하면, Then 표 `calendar_settings`·`calendar_appts`·`calendar_allday`·`calendar_rev`가 design.md 'DB' 모양이고 RLS가 켜져 있고 anon 권한이 없다. 두 번 실행해도 오류가 없다
- AC-5901.2: Given 승인된 병원 사용자, When 자기 병원 줄을 design.md 권한대로 읽고·넣고·고치고·지우면, Then 된다. 다른 병원·승인 대기·거절·anon은 거부되거나 0줄이다. `calendar_rev`는 읽기만 되고 `hospital_id`·`id`·처음 자리 칸은 직접 쓸 수 없다
- AC-5901.3: Given 값 제약, When 시작 345·1440, 길이 0·7·245, 이름 ''·21자, 차트번호 'a1'·11자리, 상태 'x', 도착 'cancel', 메모 101자, 종일 메모 21자·휴무에 시행자 없음, 보이는 시간 4·25를 넣으면, Then 거부(23514)된다
- AC-5901.4: Given 한국 날짜 오늘 T, When 예약 줄을 하나 넣으면, Then 같은 병원의 날짜가 T−1년보다 이른 예약·종일 줄은 지워지고 T−1년 날 줄과 다른 병원 줄은 남는다
- AC-5901.5: Given 예약·종일·설정 줄, When 넣거나 고치거나 지우면, Then 그 병원 `calendar_rev.rev`가 늘고 다른 병원 값은 그대로다
- AC-5901.6: Given `src/lib/storage/calendar.ts`, When design.md '저장 함수'를 부르면, Then 정해 둔 칸만 보내고(전화·성별·나이·생일·마지막 내원 칸 없음) 실패는 `CalendarStorageError('offline'|'failed')`다. 이름·메모가 `privacyProblem`이면 보내지 않고 `'blocked'`, 설정이 `checkCalendarSettings`를 못 지나면 `'invalid'`다. 설정 줄이 없거나 모양이 틀리면 기본값이다. 1,000줄 넘는 기간은 나눠 읽어 모두 돌려준다

### REQ-5902: 예약표 셈 규칙 (`src/lib/calendar/`, 환자 자료 구역 순수 함수)
- AC-5902.1: Given `layoutDay(blocks)`, When 시간이 겹치는 칸들을 주면, Then 겹치는 묶음마다 칸의 `col`·`cols`·`span`이 design.md '예'대로다(시작 이른 차례, 같으면 긴 칸 먼저, 오른쪽이 비면 넓힘). 아무와도 겹치지 않는 칸은 `cols` 1이다
- AC-5902.2: Given `warnings(draft, appts, allday)`, When 같은 날 같은 시행자의 취소 아닌 다른 예약과 [시작, 끝)이 겹치면 `overlap`(겹친 예약 id 목록), 그날 그 시행자 휴무 줄이 있으면 `off`다. 끝이 다음 시작과 같으면 겹침이 아니고, 고치는 예약 자신과는 견주지 않는다
- AC-5902.3: Given `arrivalOf(appt, cameCharts, now)`, When 상태가 `auto`가 아니면 null, 차트번호가 그날 비트 접수 차트번호 안에 있으면 `came`, 없고 한국 시각 now가 그날 시작+길이보다 뒤면 `noshow`, 아니면 null이다. 차트번호가 빈 예약은 늘 null이다
- AC-5902.4: Given `shownStatus(appt)`, When 상태가 `cancel`·`came`·`noshow`면 그 값, `auto`면 도착 칸 값(null이면 `none`)이다
- AC-5902.5: Given `monthCells(appts, allday, from, to, today)`, When design.md '예'의 월 보기 자료를 주면, Then 날마다 예약 수·종류별 수(취소 뺌)·`안 옴`(오늘 전 날만)·`변경`(그날로 옮겨 온 것, 취소 뺌)·종일 항목이 맞다
- AC-5902.6: Given `nextWeek(appt)`, When 부르면, Then 날짜만 7일 뒤이고 시작·길이·이름·차트번호·시행자·종류·메모가 같으며 상태는 `auto`, 도착·처음 자리 칸은 없다
- AC-5902.7: Given `visibleGhosts(ghosts, appts)`, When 같은 날 같은 차트번호의 취소 아닌 예약이 있으면, Then 그 비트 예약은 빠진다. 차트번호 없는 비트 예약은 남는다. `ageOn(birth, today)`는 만 나이(생일 전이면 한 살 적게), 날짜가 아니면 null이다
- AC-5902.8: Given `src/lib/calendar/**`, When eslint로 네트워크·브라우저 저장소·console·React·supabase·`lib/storage` import를 넣어 보면, Then 오류다(환자 자료 구역 울타리, guardrails 시험)

### REQ-5903: 도우미 0.10.0 — 비트 찾기·접수·비트 예약
- AC-5903.1: Given `contact.targets {kind: 'calfind', from: T, to: T, q}`(T = 오늘), When q가 숫자 1~10자리면 차트번호가 같은 환자, 아니면 앞뒤 빈칸을 뺀 q(두 글자 이상, `%`·`_`·`[` 없음)로 이름이 시작하는 환자를 찾으면, Then design.md '도우미 답' calfind 모양으로 마지막 내원이 늦은 차례 20명까지 보내고 더 있으면 `more`가 참이다. 이 병원 접수가 한 번도 없는 환자는 없다. 전화·주소·주민번호·메모는 읽지 않는다
- AC-5903.2: Given calfind, When from·to가 오늘이 아니거나 q가 없거나 21자 이상이거나 숫자와 다른 글자가 섞였으면, Then `E-HELPER-BAD-MESSAGE`다. calfind 밖의 kind에 q가 오면 `E-HELPER-BAD-MESSAGE`다
- AC-5903.3: Given `contact.targets {kind: 'calday', from, to}`, When 42일 안이고 오늘−62일 ≤ from, to ≤ 오늘+92일이면, Then `came`(그 기간 센 접수(통계 Visits 조건)가 있는 [날, 차트번호], 중복 없음)과 `rsv`(수납일지 다음 예약과 같은 조건의 비트 예약 [차트번호|null, 이름|null, 시각])를 보낸다. 범위 밖은 `E-HELPER-BAD-MESSAGE`다. 전화·메모는 읽지 않는다
- AC-5903.4: Given 명령 표 `commands.json`, When 보면, Then `contact.targets`의 kind 값에 `calfind`·`calday`, args에 선택 칸 `q`(글자 1~20)만 더해졌고 명령 이름 목록은 그대로다(확장 새 판 없음). 새 SQL은 읽기 전용 SELECT이고 허용 목록(`Bit/Sql.cs` 사슬)에 든다
- AC-5903.5: Given 판, When 보면, Then 도우미 `<Version>`·`LATEST_HELPER`·새 `CAL_HELPER`는 0.10.0이고 `MIN_HELPER`·`SUNAP_HELPER`·`LIST_HELPER`는 그대로다

### REQ-5904: 예약 Worker (`src/workers/calendar.worker.ts`)
- AC-5904.1: Given 화면이 `{type: 'find', targets}`를 보내면, When calfind 조각을 받으면, Then `found {rows: [{chart, name, sex: '남'|'여'|'', age: number|null, last: 'YYYY-MM-DD'|null}], more}`를 보낸다. 나이는 답의 오늘 기준 `ageOn`이고 생일 글자는 화면으로 가지 않는다
- AC-5904.2: Given `{type: 'days', targets, now, appts: [{id, day, start, len, chart, status, auto}]}`, When calday 조각을 받으면, Then `days {auto: [[id, 'came'|'noshow'|null]], ghosts: [{key, day, start, chart, name}]}`를 보낸다. auto는 상태 `auto`이고 날짜가 오늘 이하인 예약 중 `arrivalOf` 값이 서버 값과 다른 것만 싣는다. ghosts는 `visibleGhosts` 결과다
- AC-5904.3: Given 모양이 틀린 답·도우미 오류, When 받으면, Then 오류 번호만 보낸다(`E-BRIDGE-BAD-REPLY` 등). 비트 접수 차트번호 목록·생일은 Worker 밖으로 나가지 않는다

### REQ-5905: 예약 화면 (`/calendar`)
- AC-5905.1: Given 예약 탭, When 열면, Then 시안 `?s=week`처럼 주 보기(월~토, 설정이 켜면 일요일까지)가 기본이고 [일·주·월]·[오늘]·◀▶·[+ 예약 더하기]·[설정]·안내 줄이 있다. 10분 = 20px, 오늘 칸·지금 선, 겹친 칸은 `layoutDay`대로 나란히, 칸 글은 `차트번호 이름 종류 (표시)` + 길이, 색은 종류 색 또는 시행자 색이다. 일 보기는 `?s=day`, 월 보기는 `?s=month`(수만, `monthCells`)이고 날을 누르면 그날 일 보기다. 1024px 이상에서 넓은 화면(`data-wide-page`)이다
- AC-5905.2: Given 빈 칸 누름·[+ 예약 더하기], When 판에서 칸을 채워 저장하면, Then `addAppt`로 저장되고 칸이 바로 보인다. 이름·시행자·종류가 비면 저장할 수 없고, 종류를 고르면 길이가 그 종류 기본이 된다. `warnings`가 있으면 경고 글과 [그래도 저장](`?s=overlap-warn`·`?s=off-warn`)이고 눌러야 저장된다
- AC-5905.3: Given 예약 칸 누름, When 자세히 판(`?s=detail`)에서 도착(자동 (비트 따라)·왔음·안 옴)·[다음 주에도]·[고치기]·[예약 취소]/[취소 되돌리기]·[지우기](한 번 더 물음)를 누르면, Then 각각 서버에 저장되고 칸이 바뀐다. [다음 주에도]는 다음 주 자리에 경고가 있어도 넣고 알림으로 알리며 '넣었어요 ✓'로 바뀐다
- AC-5905.4: Given 종일 줄 누름, When 메모(20자) 또는 시행자 휴무를 넣거나 그날 항목을 지우면, Then 서버에 저장되고 휴무 칩은 그 시행자 색이다
- AC-5905.5: Given [설정], When 종류(▲▼·이름·기본 길이·색 또는 시행자 색 따름·지우기, 하나 이상)·시행자(이름·한 글자·색, 한 글자 겹침 막음)·보이는 시간(1시간 단위)·일요일 보기를 고쳐 [저장]하면, Then `saveCalendarSettings`로 저장되고 바로 반영된다. 알아 둘 글 세 줄(시안 그대로)이 있다. 목록에서 지운 종류·시행자의 예약은 저장된 이름 그대로 회색으로 보인다
- AC-5905.6: Given 도우미 0.10.0 이상인 PC, When 더하기 판에 이름이나 차트번호를 적고 400ms 멈추면, Then Worker `find`로 찾아 한 명이면 나머지 칸을 채우고(옅은 초록), 여럿이면 고르기 목록(성별·나이·마지막 내원, `?s=new`), 없으면 '비트에 없어요. 신환이면 차트번호는 비워 두세요.'다. 고르면 이름·차트번호 두 칸만 판에 들어간다
- AC-5905.7: Given 같은 PC, When 일·주·월 보기를 그리거나 기간을 바꿀 때와 오늘이 든 기간을 보는 동안 60초마다, Then Worker `days`를 불러 받은 auto를 `setApptAuto`로 서버에 적고, 일·주 보기에는 비트 예약 칸(흐린 회색 빗금, 20분, 누르면 '비트에 있는 예약이에요. 여기서는 보기만 하고, 고치려면 비트에서 해요.')을 그린다. 도착 표시는 시안 기본값 10번 모양이다
- AC-5905.8: Given 도우미 없는 기기·폰·0.10.0 미만, When 열면, Then 비트 찾기·비트 예약 칸·도착 셈이 없고 더하기 판에 '비트 PC에서는 자동으로 채워져요'(`?s=phone-new`), 안내 줄에 `비트 없는 기기`가 보인다. 도착은 서버 값 그대로다. 768px 미만 주 보기는 날짜별 목록(`?s=phone-week`)이다
- AC-5905.9: Given 두 화면, When 한쪽이 저장하면, Then 다른 쪽은 보이는 동안 5초마다 `loadCalendarRev`를 읽어 값이 바뀌었을 때만 보이는 기간을 다시 읽는다. 숨은 탭은 읽지 않고 다시 보이면 바로 읽는다. 저장이 실패하면 값을 판에 둔 채 오류 글을 보인다. CSP(`src/lib/csp.ts`)는 그대로다
- AC-5905.10: Given 메뉴, When 보면, Then '예약'(`/calendar`)이 수납일지 다음 주요 탭(맨 끝)이고 메뉴 목록을 고정한 시험들이 design.md '메뉴' 목록으로 맞다. `/calendar` 화면 제목은 '예약'이다
- AC-5905.11: Given `src/components/calendar/rows/**`(시간 표·비트 예약 칸·고르기 목록·폰 목록), When 소스를 보면, Then 네트워크·브라우저 저장소·console·supabase·`lib/storage`·`lib/bridge`·workers를 쓰지 않는다(eslint 울타리 + guardrails 시험)

### REQ-5906: 일정 변경 기록
- AC-5906.1: Given 예약 줄, When 날짜나 시작을 바꿔 고치면, Then DB(트리거)가 처음 한 번만 `orig_day`·`orig_start`에 바꾸기 전 자리를 적고 도착 칸(`auto`)을 비운다. 다시 옮겨도 처음 자리는 그대로이고, 처음 자리로 되돌리면 두 칸이 비워진다. 길이·시행자·종류·메모·이름·차트번호·상태만 바꾸면 두 칸은 그대로다
- AC-5906.2: Given `orig_day`가 있는 예약, When 그리면, Then 칸에 작은 '변경' 표시가 있고 자세히 판에 `원래 11/18 (수) 15:00`이 있다. 새로 넣은 예약·[다음 주에도]로 만든 예약에는 없다
- AC-5906.3: Given 월 보기, When 그날로 옮겨 온 취소 아닌 예약이 있으면, Then 그날 칸에 `변경 N`이 있다

### REQ-5907: 취소·변경·안 옴 통계
- AC-5907.1: Given `rateSummary(appts)`, When 기간의 예약(취소 포함, 지운 것은 없음)을 주면, Then 예약 N·취소 N·변경 N(처음 자리 칸이 있는 것)·안 옴 N(`shownStatus`가 `noshow`)과 시행자별·종류별 같은 네 수가 나오고, 비율은 수 / 예약 N을 소수 첫째 자리로(`sunapPct`와 같은 반올림, 예약 0이면 '–') 보인다
- AC-5907.2: Given 예약 탭, When 일·주·월 보기를 보면, Then 도구 줄 아래에 `예약 N · 취소 N (x.x%) · 변경 N (x.x%) · 안 옴 N (x.x%)`이 그 기간 숫자로 있고, 누르면 시행자별·종류별 표(예약·취소·취소율·변경·변경율·안 옴·안 옴율, `?s=summary`)가 열린다
- AC-5907.3: Given 통계 탭, When 열면, Then '예약·전환' 다음에 '예약'(`stats-calendar`) 칸이 있고 이번 달을 넣은 최근 12달의 달마다 예약 수와 세 비율이 그림과 표로, 고른 달의 시행자별·종류별 표가 있다(`?s=stats`). 숫자는 브라우저가 `listCalendarCounts`(이름·차트번호·메모 칸 없이)로 읽은 예약을 `rateSummary`로 센 것이다. 예약이 없으면 '예약 탭에 적은 예약이 없어요'다

### REQ-5908: 수납일지 건강생활유지비 표시 (도우미 0.10.0)
- AC-5908.1: Given `contact.targets {kind: 'sunap'}`, When 부르면, Then 답의 `v`는 3이고 `rows` 줄마다 끝에 건강생활유지비 한 칸(지금 미수에서 빼는 `Health`와 같은 값, 원 미만 버린 0 이상 정수)이 더해져 12칸이다. 미수 셈과 다른 칸은 그대로다
- AC-5908.2: Given 수납일지 Worker, When 답이 v1·v2면 줄마다 건강생활 0, v3면 그 값으로 장부를 만든다. v3 줄이 12칸이 아니거나 건강생활이 0 이상 정수가 아니면 `E-BRIDGE-BAD-REPLY`다
- AC-5908.3: Given 장부 줄, When 현금·카드·계좌·미수가 모두 0이고 건강생활이 0보다 크면, Then `free`는 거짓이고 금액 칸 자리에 칩 `건강생활 · 1,500원`이 보인다. 범례에 '건강생활 = 건강생활유지비로 낸 돈'이 있다. 네 칸과 건강생활이 모두 0일 때만 'FREE · 0원'이다
- AC-5908.4: Given `dayTotals`, When 건강생활 줄이 있으면, Then 그 줄은 `free_n`에 들지 않고, `SunapCards`의 FREE 건수는 그 `free_n`이다

## 범위 밖
- 끌어서 옮기기·길이 늘리기, 구글 캘린더 가져오기·잇기, 알림(문자·알림톡), 전화번호
- 비트에 예약 적기·비트 예약 고치기, 비트 예약 길이 읽기(20분으로 그림), 여러 병원 설정, 예약 고친 사람·바뀐 기록 전체(처음 자리 하나만), 인쇄

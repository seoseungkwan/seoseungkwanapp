# 설계: 환자 탭 비트 명단 두 도구 — 예약 문자 명단 · 장기 미방문 명단

## 화면 시안 (승인 요청용. 이름·전화·숫자는 지어낸 값)
눌러 보는 시안: `docs/mockups/patients-bit-lists/index.html` — 폭 [PC][휴대폰], 도구 다섯, 상태 [불러온 뒤][읽는 중][예약 없음][도우미 업데이트 필요]. 글은 시안이 이긴다(명세 글과 다르면 명세 AC가 정한 글을 시안에 맞춰 고친 뒤 재승인).
```
환자  [F/U 명단][예약 문자 명단][정기 주사 문자 명단][장기 미방문 명단][문자 문구]
예약 문자 명단                                   9명 · 11월 6일 오후 6:20에 읽음  다시 불러오기
비트 예약 대기에 올라간 분이에요. 오시기 전날 문자로 알려 드려요.
날짜 [내일][모레][직접]  11월 7일 (토)
[명단 복사] ☑ 날짜 제목 줄 넣기   [문구 복사] 문구 날짜 11월 7일 (토)
명단 넷째 칸은 예약 시각이에요(문구의 [*2*] 자리). 번호 없는 분은 복사에서 빠져요.
예약 시각   이름     전화
오전 9:00   김가상   010-0000-1200   …
── 지난 예약 · 안 오신 분 ─  기간 [지난 7일][지난 30일]  10월 30일 ~ 11월 5일
예약 52건 중 안 오신 분 7건 · 13%   [명단 복사]
예약한 때               이름   전화           비트 표시     그 뒤
11월 5일 (목) 오후 5:00  이나래 010-0000-1321  [예약 취소]   아직 안 오심

장기 미방문 명단                                128명 · 11월 6일 오후 6:20에 읽음  다시 불러오기
마지막 내원 [1~3달][3~6달][6~12달][1~2년]  8월 7일 ~ 10월 6일에 마지막으로 오신 분
1~3달 128명 · 3~6달 96명 · 6~12달 141명 · 1~2년 203명
[명단 복사]
이름  전화  마지막 내원(10월 5일 (월) · 32일 전)  내원 횟수(8번)  비고([예약 있음])
```

## 데이터 흐름
```
도구를 처음 엶 → (도우미 버전 확인) → bridge.stream('contact.targets', {kind, from, to})
  도우미: kind가 lapsed·reservation이면 SQL로 읽어 JSON → chunk … end (followup·injection은 지금 그대로 83·47 표)
  → 확장(명령 이름만 보고 넘김) → lib/bridge 포트 → 환자 Worker (handler: 'list' 메시지)
  Worker: 줄 검사 → 메모리(차트번호 포함) → 화면에 보기 모양(고른 묶음 줄·복사 글·건수)
화면 고르기 바뀜 → {type:'filter', tool:'reservations'|'lapsed', filters} → Worker → 'filtered'
서버: 문자 문구 표(message_templates)의 kind 값만 하나 더. 그 밖에 새로 가는 것 없음
```
- 명령 이름 `contact.targets`를 그대로 쓰고 `kind` 값만 더한다. 확장(`extension/src/relay.ts`)은 명령 이름만 보므로 **크롬 확장은 다시 올리지 않는다**. 도우미만 새 버전이다
- 새 도구는 들어올 때 읽지 않고 처음 열 때 읽는다: F/U 명단이 늦어지지 않게, 그리고 저녁에 예약 대기를 채운 뒤 [다시 불러오기]로 다시 읽는 일이 많아서

## 구성 요소

### 도우미 (helper/, C#)
- `Contact/ContactCommands.cs` `RegisterTargets`: kind로 나눈다 — `followup`·`injection` → 지금 `ContactTargets.Build`, `reservation` → `ReservationTargets.Build(services, from, to)`, `lapsed` → `LapsedTargets.Build(services, from, to)`
- `Contact/ListSql.cs`(새): 문장 둘, `Bit/Sql.cs`의 `IsAllowed`·`ParametersOf`에 더한다
  - `ReservationsSql(@from,@to,@today,@hospital)`: 예약 줄 = OcmInf c(외래, OcmAcpDtm 기간, 이 병원 진료실) LEFT JOIN RsvInf r ON r.RsvOcmNum=c.OcmNum, 조건 `(r.RsvOcmNum IS NOT NULL AND ISNULL(r.RsvDivTyp,'R') IN ('R','')) OR c.OcmComStt IN ('WR','NR','CR')`. 칸: 차트번호, PbsPatNam, PbsCelPhn, PbsPhnNum, OcmAcpDtm, OcmComStt, RsvSts, 그날 옴(EXISTS 센 접수 같은 차트·같은 날), 그 뒤 처음 온 날(MIN 센 접수 날, 예약 날 < 날 < @today+1)
  - `LapsedSql(@from,@to,@today,@hospital)`: 원래 도구 LapsedPatients의 `AllVisits`(오늘 전까지 센 접수) → 환자마다 `MAX(VisitDay)`·`COUNT(DISTINCT VisitDay)` → `Days>=2 AND LastDay BETWEEN @from AND @to` → PbsInf 이름·전화, 예약 있음(EXISTS 같은 차트 WR·NR, OcmAcpDtm ≥ @today)
- `Contact/ReservationTargets.cs`·`Contact/LapsedTargets.cs`(새): 인자 검사(AC-2801.1·2801.3, 비트를 건드리기 전) → `HospitalGate.Open` → SQL → 전화 고르기(휴대전화 → 집 전화) → `ClaimMonthPayload.Write`로 JSON(글은 `ClaimText.Safe`). 줄 한도 300,000(넘으면 `E-BIT-READ-FAILED`)
- `src/lib/bridge/commands.json`: `contact.targets.kind.values`에 `lapsed`·`reservation`(도우미 `CommandTable`이 같은 파일을 묻어 쓴다)

### Worker (환자 자료 구역)
- `src/lib/patients/reservations.ts`(새): `readReservations(json): ReservationData`(모양 검사, 틀리면 `E-BRIDGE-BAD-REPLY`), `upcoming(data, day): ReservationRow[]`, `missed(data, from, to): { total; missed: MissedRow[] }`, `timeLabel(yyyyMMddHHmm)`, `reservationPaste(rows, withDate, day)`, `missedPaste(rows)`
- `src/lib/patients/lapsed.ts`(새): `readLapsed(json): LapsedData`, `monthsBack(today, k)`(`addMonthsToDay` 쓰기), `bucketOf(last, today)`, `lapsedView(data, bucket, today): { counts; range; rows: LapsedRow[] }`, `lapsedPaste(rows)`
- 줄 열쇠는 `차트번호|예약 시각`(예약)·`차트번호`(장기 미방문). 화면 줄 모양 `ReservationRow = { key; time: string; name; phone }`, `MissedRow = { key; at: string; name; phone; mark: '예약 취소' | '예약 그대로'; after: string | null }`, `LapsedRow = { key; name; phone; last: string; daysAgo: number; visits: number; reserved: boolean }`
- `src/workers/patients/handler.ts`: 메시지 둘 더 — 화면 → `{ type: 'list'; tool: 'reservations'|'lapsed'; id?: string; code?: string }`(스트림 id, 지금 'piece'처럼 포트에서 조각을 받음) · `{ type: 'filter'; tool: 'reservations'; filters: { day; missedDays: 7|30; withDate } }` · `{ type: 'filter'; tool: 'lapsed'; filters: { bucket } }`. Worker → `{ type: 'list-view'; tool; ok; code?; readAt; total }` · `{ type: 'filtered'; tool: 'reservations'; rows; missed; summary; copy }` · `{ type: 'filtered'; tool: 'lapsed'; rows; counts; range; copy }`. F/U·정기 주사 메시지는 바꾸지 않는다
- `src/types/patients.ts`: 위 모양, `PatientsTool`에 `reservations`·`lapsed`

### 화면
- `src/components/patients/tools.ts`: 도구 다섯(차례 AC-2802.1), 아이콘 cal·person(없으면 지금 아이콘 중 고름)
- `src/components/patients/useBitList.ts`(새): 도구마다 '처음 열 때 한 번' 읽기·[다시 불러오기]·읽은 시각, 도우미 버전 확인(`src/lib/bridge/versions.ts`의 `LIST_HELPER`, hello의 `helperVersion`)
- `src/components/patients/ReservationTool.tsx`·`LapsedTool.tsx`(새): 시안 그대로. 고르기·복사·알림은 `FollowupTool`과 같은 부품·글 규칙(`CopyButton`·`CopyNoticeLine`·`Segments` 모양). 문구는 `readTemplates` → `kind === 'reservation'` 첫 문구, 없으면 기본 예약 안내
- `src/components/patients/rows/ReservationRows.tsx`·`LapsedRows.tsx`(새): 표·휴대폰 줄. props로만 받는다(울타리 구역)
- `src/components/patients/PatientsScreen.tsx`·`PatientsEntry.tsx`: 새 도구 자리, 읽는 중·오류·업데이트 안내
- 문자 문구: `src/lib/patientMessages/defaults.ts`(종류 셋, 기본 문구 셋) · `src/components/patients/useTemplates.ts`(종류 이름) · `MessagesTool.tsx`(새 문구 종류 셋, 도움말) · `src/lib/storage/messageTemplates.ts`·`src/types/db.ts`(kind 값) · `FollowupTool.tsx`는 고르기 둘 그대로
- DB: `supabase/migrations/2026110x_message_templates_reservation.sql` — `message_templates_kind_check`를 지우고 `kind in ('injection','followup','reservation')`로 다시 둔다. 권한·RLS는 건드리지 않는다. `supabase/patients.rls.test.ts`에 예약 안내 넣기 됨·모르는 kind 막힘 시험

## 결정과 트레이드오프
- **contact.targets에 kind 더하기**(새 명령 이름 대신): 새 명령 이름이면 크롬 확장을 웹스토어에 다시 올려야 한다(검토 기다림). kind는 도우미가 검사하므로 도우미만 새로 깔면 된다
- **예약 = WR·NR·CR 상태 또는 RsvInf 줄**: 온 예약은 상태가 WN 등으로 바뀌므로 RsvInf 줄로만 알 수 있다. 오지 않은 예약은 CR로 바뀐다(의원 PC 30일 내력). 미리 취소와 구별하지 못해 '안 오신 분'에 함께 세고 화면에 그렇게 알린다
- **안 오심 = 그날 같은 차트로 센 접수가 없음**: 예약 줄 상태 대신 실제 접수로 본다 — 예약 줄이 그대로인데 따로 접수하고 온 분을 '안 옴'으로 세지 않으려고
- **장기 미방문 1~3달 묶음 더함**: 사용자가 "한 달 넘게"를 골랐다. 원래 도구의 3·6·12달 경계는 그대로이고 2년 넘은 분은 뺀다(명단이 너무 길어짐)
- **연락함 표시 없음**: F/U처럼 저장하려면 도우미 저장 칸과 시험이 는다. 첫판은 명단·복사까지(범위 밖)
- **기본 예약 안내 문구**: 사용자가 양식을 주기로 했다. 받으면 `defaults.ts` 한 곳만 바꾸고(명세 AC-2805.3 글 고침 → 재승인), 이미 문구를 저장한 의원은 문자 문구 도구에서 직접 더한다

## 위험
- RsvInf 칸(RsvDivTyp·RsvSts)이 이 의원 비트에 정말 있는지, NR이 무엇인지는 절차 글에서만 봤다 → 첫 실행 때 비트 예약 화면의 내일 예약 수·지난 주 예약 수와 견준다. 다르면 SQL 조건만 고친다
- 차트번호 없는 예약(처음 오는 분을 이름만으로 예약)은 이름·전화를 PbsInf에서 못 찾는다 → `이름 없음`·`번호 없음`으로 보인다. RsvInf에 이름 칸이 있는지 첫 실행 때 본다
- 장기 미방문 SQL은 모든 내원 내력을 훑는다(원래 도구와 같음). 오래 걸리면 읽는 중 안내가 길어진다(한도 150초)
- 도우미 새 버전 번호: 옆 창(접수 현황 reception-phone·reception-paper)도 도우미를 바꾸고 있다. 릴리스 때 한 버전으로 합친다

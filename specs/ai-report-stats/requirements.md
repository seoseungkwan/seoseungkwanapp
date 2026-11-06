# 요구사항: AI 리포트에 통계 숫자 잇기

> 기능 ID: `ai-report-stats` · 형식: 요구사항은 `### REQ-2001: 제목`, 수용 기준은 `- AC-2001.1: Given/When/Then`.
> 각 AC 는 테스트 하나 이상으로 검증되어야 하며, 테스트 이름에 AC ID 를 넣는다.
> 번호는 2001부터다. 다른 명세가 쓴 번호(가장 큰 것이 REQ-1708, 2026-11-06 모든 원격 갈래 기준)와 시험 이름이 겹치지 않게 한다.

## 배경 / 목표
- AI 리포트 탭은 운영에 올라가 있지만, 서버의 숫자 읽는 자리(`src/app/api/ai/store.ts` `loadReportMonths`)가 늘 세 달 모두 "없음"을 돌려준다. 그래서 어느 달을 골라도 "이 달 통계가 아직 없어요"만 나온다. 진짜 리포트가 나오려면 이 자리를 통계 탭이 저장한 숫자(`stats_months`)와 처방별 추세 묶음 이름(`stats_rx_groups`)을 읽는 코드로 바꿔야 한다(나중에 고칠 것 목록 `as.md` 1번).
- 사용자 결정(2026-11-06): 이 연결은 AI 쪽 새 명세로 한다("ㅇㅇ", 통계 숫자 연결 명세 쓰기에 동의).
- 지금 AI에게 주는 `total.patients`의 이름이 '전체 환자'이고 근거 줄이 '명'으로 끝난다. 그런데 이 숫자는 **접수 건수**다(한 달에 두 번 온 분은 2). 재진(`total.returning` = 접수 건수 − 신환)도 같다. 2026-11-06 노트북에서 가짜 숫자로 뽑아 본 리포트가 실제로 "전체 환자 … 2,615명"이라고 썼다(`as.md` 2번).
- 사용자 결정(2026-11-06): 이 숫자의 이름은 **'접수 건수'**이고 단위는 '건'이다. 재진도 '건'이다. 신환과 처방·묶음·동네는 사람 수라 지금처럼 '명'이다.
- 사용자 결정(2026-11-06): 리포트를 고를 수 있는 첫 달(`REPORT_FIRST_MONTH = '2026-01'`)은 그대로 둔다.
- 진짜 리포트가 나오면 로그인 전 첫 화면 AI 칸의 "준비 중" 칩은 틀린 안내가 된다(`as.md` 3번). 사용자 결정(2026-11-06): 이번에 뺀다("빼기").
- 진짜 숫자로는 지난 달 줄이 달이 끝난 뒤에도 `partial`(덜 불러옴)로 남을 수 있다. 그런데 지금 리포트 화면은 그런 리포트에 "N월이 끝나기 전에 만들었어요 … [다시 분석]을 누르면 다 찬 숫자로 써요"라고 한다. 통계 탭에서 그 달을 다시 불러오기 전에는 다시 분석해도 같은 숫자다. 사용자 결정(2026-11-06): 이 안내 글을 바꾼다("바꾸기", 글은 REQ-2008). 이 두 화면 변경은 사용자가 직접 `/sdd approve`로 승인한다(자동 승인으로 시작하지 않는다)
- 지키는 규칙: AI 경로는 브라우저가 보낸 숫자를 쓰지 않고, 서버가 사용자 세션으로 DB에서 읽어 `validate.ts`로 검사한 집계만 보낸다(CLAUDE.md, ADR-024). 처방 코드 목록·환자 정보는 Claude로 가지 않는다. 숫자를 지어내지 않는다.

## 요구사항

### REQ-2001: 서버가 저장된 통계 세 달을 읽는다
- AC-2001.1: Given 사용자 세션 클라이언트와 달 `M`, When `loadReportMonths(client, M)`을 부르면, Then `stats_months`에서 `month`가 `M`·`M`의 한 달 전·`M`의 12달 전인 줄을 읽기 한 번으로(`select('month, payload')` + `in('month', [세 달])`) 읽고, 그 줄의 `payload`를 그대로 `selected`·`prev`·`lastYear`에 넣는다. 줄이 없는 달은 `null`이다
- AC-2001.2: Given 같은 부름, When 읽기 부름을 보면, Then 병원을 고르는 조건(`hospital_id` 등)·쓰기·`rpc`·두 표(`stats_months`·`stats_rx_groups`) 밖의 표가 없다(RLS가 내 병원 줄만 보여 준다)
- AC-2001.3: Given 받은 줄의 `month`가 세 달 밖이거나 글자가 아님, When 읽으면, Then 그 줄은 버린다(다른 달 칸에 넣지 않는다)
- AC-2001.4: Given `stats_months` 읽기가 `error`를 돌려주거나 던짐, When 읽으면, Then `loadReportMonths`는 던진다. 그래서 리포트 만들기는 `E-AI-FAILED`이고 숫자 바뀜 비교는 '안 바뀜'이다. '자료 없음'(`E-AI-NO-DATA`)으로 바꾸지 않는다
- AC-2001.5: Given 같은 달로 두 번 부름, When 첫 값의 `groupNames`를 고치면, Then 둘째 값에 번지지 않는다(부를 때마다 새 값)

### REQ-2002: 묶음 이름은 통계 탭 처방별 추세 묶음에서 온다
- AC-2002.1: Given `stats_rx_groups` 줄들(`name`·`codes`·`sort_order`), When `loadReportMonths`가 읽으면, Then `groupNames`는 처방이 하나 이상 든 묶음마다 `groupKey(codes)` → `name`이다. 처방이 빈 묶음은 빠진다. 열쇠는 통계 탭·대시보드가 쓰는 `groupKey`(`src/components/stats/treatmentView.ts`) 그대로다(규칙을 두 벌 두지 않는다)
- AC-2002.2: Given 처방 모음이 같아 열쇠가 같은 묶음이 둘, When 읽으면, Then `sort_order`가 작은 묶음의 이름을 쓴다. `sort_order`가 같으면 이름의 글자 코드 차례로 앞선 것을 쓴다
- AC-2002.3: Given `stats_rx_groups` 읽기가 `error`를 돌려주거나 던지거나, 줄 모양이 다름(`name`이 글자가 아님, `codes`가 글자 배열이 아님, 배열이 아닌 답), When 읽으면, Then `loadReportMonths`는 던진다(이름 없이 리포트를 만들지 않는다)
- AC-2002.4: Given 읽은 묶음, When 돌려주는 값을 보면, Then `groupNames`에는 열쇠와 이름만 있고 처방 코드 목록은 없다
- AC-2002.5: Given 묶음 이름이 연락처·식별 번호 모양(예: `010-1234-5678`, 메일 주소)이라 처방명·동네 이름과 같은 글자 검사(`validate.ts`의 `isText`)를 못 넘음, When 읽으면, Then 그 묶음은 `groupNames`에 넣지 않는다(그 이름은 Claude로 가지 않는다). 다른 묶음과 리포트는 그대로다

### REQ-2003: 지금 묶음만, 그 묶음으로 세지 않은 달은 '자료 없음'
- AC-2003.1: Given 달 줄의 `groups`에 `groupNames`에 없는 열쇠(묶음 처방을 바꾸기 전 열쇠·지운 묶음), When `buildReportInput`을 부르면, Then 그 열쇠의 지표는 만들지 않는다('이름 없는 그룹' 지표가 없다)
- AC-2003.2: Given `groupNames`에 있는 열쇠가 세 달 가운데 어떤 달 줄의 `groups`에는 없음(그 달은 그 묶음으로 세지 않았거나 그 달 환자가 없음), When 지표를 만들면, Then 그 달 값은 `0`이 아니라 `null`이고, 근거 줄은 그 달을 '자료 없음'으로 쓴다
- AC-2003.3: Given `groupNames`에 있는 열쇠가 세 달 어디에도 없음, When 지표를 만들면, Then 그 묶음의 지표는 없다
- AC-2003.4: Given 처방(`rx`)·동네(`regions`), When 지표를 만들면, Then 지금 규칙 그대로다(자료가 있는 달에 그 항목이 없으면 `0`, 달이 없으면 `null`)

### REQ-2004: 접수 건수와 재진은 '건'으로 쓴다
- AC-2004.1: Given 달 숫자, When `buildReportInput`을 부르면, Then `total.patients` 지표의 이름은 '접수 건수', `total.returning`은 '재진'이고 둘 다 `kind: 'visits'`다. `total.newPatients`는 '신환'·`kind: 'count'` 그대로다. 묶음·처방·동네·재방문율 지표의 이름과 `kind`, 모든 지표의 `id`와 차례는 그대로다
- AC-2004.2: Given `kind: 'visits'` 지표, When `basisLine`을 부르면, Then 값은 통계 화면과 같은 `formatCount`에 '건'을 붙인 글(예: "근거 · 접수 건수 9월 2,480건 → 10월 2,615건 · 작년 10월 2,310건")이고, 값이 `null`이면 '자료 없음'이다. `count`는 '명', `rate`는 지금 그대로다
- AC-2004.3: Given 지시문, When `systemPrompt()`를 보면, Then `kind` 설명에 `visits`(접수 건수: 같은 분이 여러 번 오면 여러 건)·`count`(사람 수)·`rate`(0~1 비율)가 있고, `visits` 지표를 사람 수로 쓰지 않는다(예: '환자 ○명', '환자가 늘었다' 대신 '접수 건수가 늘었다')는 줄이 있다. `PROMPT_VERSION`은 `'ai-report-3'`이다. 지시문에 날짜·병원 이름·숫자 값을 넣지 않는다는 지금 시험은 그대로 통과한다

### REQ-2005: 덜 불러온 달과 견주지 않는다
- AC-2005.1: Given 지난달 또는 작년 같은 달 줄이 검사는 통과했지만 `partial: true`, When 리포트 만들기·숫자 바뀜 비교가 입력을 만들면, Then 그 달은 없는 달로 본다(`hasPrev` 또는 `hasLastYear`가 `false`, 그 달 값은 모두 `null`)
- AC-2005.2: Given 고른 달 줄이 `partial: true`, When 리포트를 만들면, Then 지금처럼 리포트를 만들고 입력의 `partial`이 `true`다. 지시문의 `partial` 설명은 "그 달 숫자가 그 달 전부가 아님(아직 끝나지 않았거나 일부 날짜만 불러옴)"이고, 요약 첫 문장에 "아직 진행 중이거나 일부 날짜만 불러온 달"이라 숫자가 적게 보일 수 있다는 것을 밝히게 한다

### REQ-2006: 로그인 전 첫 화면의 "준비 중" 칩을 뺀다
- AC-2006.1: Given 로그인 전 첫 화면의 AI 칸(`#ai`), When 그리면, Then 머리 줄(`p.kick`)에 "준비 중" 칩이 없고 "AI 리포트 탭" 글은 그대로다. '예시' 칩이 있고 '방금 생성'·채팅 칸이 없다는 지금 시험은 그대로 통과한다

### REQ-2008: 지난 달의 덜 찬 리포트 안내는 통계 탭 다시 불러오기를 말한다
- AC-2008.1: Given `partial: true`인 리포트이고 그 달이 이번 달보다 앞, When `partialNotice(report, today)`를 부르면, Then `{ chip: '덜 찬 숫자', title: '이 리포트는 10월 숫자가 다 차기 전에 만들었어요', body: '숫자가 적게 잡혀 있을 수 있어요. 통계 탭에서 그 달을 다시 불러온 뒤 [다시 분석]을 눌러 주세요.' }`이다(달 이름은 지금처럼 `shortMonth`). 해가 바뀌는 달(12월 리포트를 다음 해 1월에 봄)도 같다
- AC-2008.2: Given `partial: true`이고 그 달이 이번 달, 또는 `partial: false`, When `partialNotice`를 부르면, Then 지금 그대로다(진행 중 안내·`null`)
- AC-2008.3: Given 지난 달의 덜 찬 리포트, When 리포트 화면(`ReportBody`·`AiReportScreen`)을 그리면, Then 칩 "덜 찬 숫자"(지금과 같은 `warning` 칩)와 AC-2008.1의 제목·글이 보이고 "끝나기 전에 만들었어요"·"달 끝나기 전"은 없다

### REQ-2007: 지금 흐름은 그대로다
- AC-2007.1: Given 고른 달의 `stats_months` 줄이 없음, When 리포트를 만들면, Then 지금처럼 Claude를 부르지 않고 `E-AI-NO-DATA`("이 달 통계가 아직 없어요")다
- AC-2007.2: Given 세 달 줄과 묶음이 있는 가짜 클라이언트, When `generateReport`에 `loadReportMonths`를 이어 부르면, Then Claude 입력의 지표가 저장된 숫자에서 나오고(`total.patients`의 고른 달 값 = 고른 달 줄의 `totals.patients`), 입력 JSON에 처방 코드 목록 열쇠(`codes`)가 없다

## 범위 밖
- 리포트를 고를 수 있는 첫 달 바꾸기(2026-11-06 사용자 결정으로 그대로)
- 새 지표(30일 재방문율, 같은 처방 재방문 등)·채팅·매달 자동 리포트
- DB 표·권한·migration 바꾸기. `stats_months`·`stats_rx_groups`에는 이미 승인 사용자의 내 병원 읽기 정책이 있다
- 통계 탭·대시보드 화면, 저장 모양(`MonthPayload`)·`validate.ts` 검사 규칙
- 비교 달을 일 줄(`stats_days`)로 다시 세어 '0건'과 '세지 않음'을 가르기
- 옛 명세 문서(`specs/ai-report`·`specs/ai-report-screen`·`specs/ui-90` 등) 고치기. 이 명세가 바꾸는 옛 기준은 `design.md` '기존 명세·시험과의 관계'에 적는다
- `as.md` '작은 것' 목록, 윈도우에서만 실패하는 시험 고치기
- Vercel에 열쇠 넣기·배포·운영 확인(사용자 단계, `design.md` '사용자가 할 일')

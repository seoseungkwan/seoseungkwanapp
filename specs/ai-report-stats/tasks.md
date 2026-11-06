# 작업 분할: AI 리포트에 통계 숫자 잇기

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- AC:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
>
> **할 순서**: TASK-1 → 2 → 3 → 4 → 5 → 6 → 7. 한 세션이 차례로 한다. `docs/UI_GUIDE.md`는 TASK-6(첫 화면 `#ai` 줄)과 TASK-7(AI 리포트 본문 상태 줄)이 서로 다른 줄만 고친다. TASK-2가 TASK-1의 `kind: 'visits'`를 쓰고, TASK-5의 이어 부르기 시험(AC-2007.2)이 TASK-2·4의 결과를 쓴다.
>
> - 승인된 시험의 기대를 바꾸는 곳은 design.md '기존 명세·시험과의 관계'에 적은 줄뿐이다. 그 밖의 기대가 바뀌어야 하면 멈추고 보고한다
> - 실제 Supabase·Claude에 붙지 않는다. DB는 가짜 클라이언트, Claude는 가짜 `callClaude`다
> - **끝(TASK가 아님, 메인 세션)**: ① 고친 시험 파일과 `src/app/api/ai/report/route.test.ts`·`scripts/aiTry.test.ts`·`fixtures/fake-ai/fakeAi.test.ts`·`src/components/ai-report/*.test.tsx`를 `npx vitest run <파일들>`로 다시 돌린다 ② `npm run lint`·`npx tsc --noEmit` ③ 전체 `npm test`는 운영 갈래(bef3181)에서 먼저 돌려 둔 실패 목록과 견주어 새 실패가 없는지 본다(윈도우 환경 탓 실패, design.md '위험') ④ 사용자 허락을 받고 `npm run ai:try`를 한 번 돌려(가짜 숫자, 약 0.05달러) 근거 줄이 '접수 건수 … 건'인지 보여 준다

## TASK-1: 지표 종류 `visits`와 근거 줄 '건'
- REQ: REQ-2004
- AC: AC-2004.2
- Files: src/types/aiReport.ts, src/lib/ai/basis.ts, src/lib/ai/basis.test.ts
- Tests: src/lib/ai/basis.test.ts
- TDD: required — 먼저 `basis.test.ts`에 시험을 더해 RED를 본다: `visits` 2615 → '2,615건', 천 이상 쉼표, `null` → '자료 없음'(비교 달 자료 없음·고른 달 null 둘 다), 지난해 12월 비교 이름은 지금 규칙 그대로, `count`는 '명'·`rate`는 지금 그대로. `MetricKind`에 `'visits'`를 더하고 주석을 고친다. 지금 basis 시험은 고치지 않은 채 통과해야 한다

## TASK-2: 입력의 접수 건수 이름과 지금 묶음만
- REQ: REQ-2003, REQ-2004
- AC: AC-2003.1, AC-2003.2, AC-2003.3, AC-2003.4, AC-2004.1
- Files: src/lib/ai/input.ts, src/lib/ai/input.test.ts
- Tests: src/lib/ai/input.test.ts
- TDD: required — 순수 함수. 먼저 design.md '기존 명세·시험과의 관계'의 `input.test.ts` 줄을 고치고 새 시험을 더해 RED를 본다: '접수 건수'·'재진'은 `visits`, '신환'은 `count`, `groupNames`에 없는 열쇠(바뀌기 전 열쇠·`constructor` 같은 기본 열쇠 이름·빈 이름)는 지표 없음, 지금 열쇠가 어떤 달 줄에 없으면 그 달 `null`(고른 달·지난달·작년 각각), 세 달 어디에도 없으면 지표 없음, 처방·동네의 `0` 규칙 그대로, 지표 `id`·차례·지문 열쇠 차례 그대로. `UNNAMED_GROUP`·`groupName`을 지운다. 고칠 지금 기대는 design.md 목록의 `:7`·`:137`·`:152`~`:160`·`:171`·`:178`·`:223`~`:225`·`:272`·`:374`·`:383`뿐이다(`:272`는 지우지 않고 `groupNames`에 `G-a`·`g-b` 이름을 넣어 글자 코드 차례 시험의 뜻을 남긴다)

## TASK-3: 지시문에 `visits`와 덜 불러온 달
- REQ: REQ-2004, REQ-2005
- AC: AC-2004.3, AC-2005.2
- Files: src/lib/ai/prompt.ts, src/lib/ai/prompt.test.ts
- Tests: src/lib/ai/prompt.test.ts
- TDD: required — 먼저 `prompt.test.ts:164`의 판 기대를 `'ai-report-3'`로 고치고(시험 이름에 AC-2004.3) 새 시험을 더해 RED를 본다: `kind` 설명 줄에 visits·count·rate 셋, visits를 사람 수로 쓰지 않는 줄이 `[숫자 규칙]` 안에 있음, `partial` 설명 줄(`[입력]` 안)에 "그 달 전부가 아닙니다"와 "일부 날짜만 불러온", 요약 첫 문장 줄(AC-508.1 시험이 찾는 'partial'·'요약'이 든 줄)에 "진행 중"과 "일부 날짜만 불러온"이 있음. AC-508.1 시험은 고치지 않는다. 글은 design.md '지시문'의 글자 그대로. 지시문에 숫자 값·날짜·병원 이름이 없다는 지금 시험은 고치지 않은 채 통과해야 한다

## TASK-4: 덜 불러온 비교 달은 없는 달
- REQ: REQ-2005, REQ-2007
- AC: AC-2005.1, AC-2007.1
- Files: src/app/api/ai/generate.ts, src/app/api/ai/generate.test.ts
- Tests: src/app/api/ai/generate.test.ts
- TDD: required — 가짜 `loadMonths`·`callClaude`. 먼저 시험을 더해 RED를 본다: 지난달 `partial: true` → Claude 입력의 `hasPrev` 거짓·지난달 값 모두 `null`, 작년 같은 달도 같음, 둘 다 `partial: false`면 지금처럼 쓰임, 고른 달 `partial: true`는 지금처럼 만들고 입력 `partial` 참, 숫자 바뀜 비교(`isReportStale`)도 같은 규칙(지난달이 `partial: true`에서 `false`로 바뀌면 지문이 달라짐), 고른 달 줄 없음 → `E-AI-NO-DATA`·Claude 안 부름. 지금 시험은 design.md에 적은 경우 말고는 고치지 않는다

## TASK-5: 서버가 저장된 세 달과 묶음 이름을 읽음
- REQ: REQ-2001, REQ-2002, REQ-2007
- AC: AC-2001.1, AC-2001.2, AC-2001.3, AC-2001.4, AC-2001.5, AC-2002.1, AC-2002.2, AC-2002.3, AC-2002.4, AC-2002.5, AC-2007.2
- Files: src/app/api/ai/store.ts, src/app/api/ai/store.test.ts, src/lib/payload/validate.ts, docs/ARCHITECTURE.md, docs/ADR.md
- Tests: src/app/api/ai/store.test.ts
- TDD: required — 먼저 design.md '기존 명세·시험과의 관계'의 `store.test.ts` 세 곳(AC-511.6 묶음, AC-511.2 소스 시험의 `.from(` 개수·표 이름, AC-704.3 소스 시험의 정규식)을 고치고 새 시험을 더해 RED를 본다. `validate.ts`는 `function isText` 앞에 `export`만 붙인다(다른 줄·검사 규칙은 그대로, `src/lib/payload/validate.test.ts`와 울타리 시험 `src/guardrails.test.ts`는 고치지 않은 채 통과해야 한다). 시험의 함정은 design.md '위험' 마지막 줄(`Array.from(`·주석 속 `hospital_id`·`then`을 받는 가짜 사슬)을 본다. 가짜 읽기 클라이언트는 `from → select → in`(달)과 `from → select`(묶음) 사슬만 있고 표 이름·`select` 글자·`in` 인자를 남긴다. 그 밖의 이름(`eq`·`match`·`filter`·`rpc`·`insert` …)을 꺼내면 남기고 부르면 던진다(병원 조건·쓰기가 끼면 실패). 시험: 세 달 줄 → 세 칸, 없는 달 `null`, 세 달 밖·글자가 아닌 `month` 줄은 버림, 해가 바뀌는 달(2026-01 → 지난달 2025-12·작년 2025-01), 달 읽기·묶음 읽기 각각 `error`·던짐 → 던짐(오류 글에 받은 오류 내용이 없음), 묶음 줄 모양이 다르면 던짐, 빈 처방 묶음은 빠짐, 같은 열쇠 둘은 `sort_order` 작은 쪽·같으면 이름 글자 코드 앞쪽, 열쇠는 `groupKey(codes)`와 같음(코드 대소문자·차례가 달라도 같은 열쇠), 돌려준 값에 `codes` 없음, 부를 때마다 새 값. AC-2007.2는 같은 파일에서 `generateReport(달, { loadMonths: (m) => loadReportMonths(가짜, m), callClaude: 가짜, … })`로 Claude 입력의 `total.patients` 고른 달 값이 줄의 `totals.patients`와 같고 `JSON.stringify(입력)`에 `"codes"`가 없음을 본다(가짜 달 줄은 `fixtures/fake-ai/months/*.json`을 읽어 쓰지 않고 시험 안에서 만든다. AC-511.2 소스 시험의 "fixtures·fake-ai 글자 없음"은 `store.ts`만 본다). `docs/ARCHITECTURE.md`는 `:14`의 `api/ai/` 줄에서 "(예정) "만 지우고, `:67` [AI] 줄의 "DB 집계 읽기"를 "DB 집계 읽기(stats_months 세 달 + stats_rx_groups 묶음 이름, specs/ai-report-stats)"로 바꾼다. `docs/ADR.md:185`의 ADR-024 '숫자 읽는 자리' 줄은 "`loadReportMonths`는 사용자 세션으로 `stats_months`(고른 달·지난달·작년 같은 달)와 `stats_rx_groups`(묶음 이름)를 읽는다(specs/ai-report-stats, 2026-11-06). 앱 경로에는 지어낸 숫자가 없다. 가짜 숫자는 `fixtures/fake-ai/`·시험·`npm run ai:try`에만 있다"로 바꾼다. 묶음 이름 검사 시험(AC-2002.5): `010-1234-5678`·메일 주소 이름 묶음은 빠지고 다른 묶음은 남는다

## TASK-6: 첫 화면 AI 칸의 "준비 중" 칩 빼기
- REQ: REQ-2006
- AC: AC-2006.1
- Files: src/components/landing/AiSection.tsx, src/components/landing/AiSection.module.css, src/components/landing/middle.test.tsx, docs/UI_GUIDE.md
- Tests: src/components/landing/middle.test.tsx
- TDD: required — 먼저 `middle.test.tsx`의 짜임 정규식 `AI_SHAPE`(`:153`~`:154`)에서 머리 줄 첫 `<span>` 묶음을 빼고, `:177` 구조 분해에서 `soon, soonIn`을 빼고, `:194`의 AC-421.4 머리 줄 시험을 AC-2006.1로 고쳐(머리 줄에 칩이 없고 "AI 리포트 탭" `.tSmall .tab`만, 글자 "준비 중"이 AI 칸 어디에도 없음) RED를 본다. 같은 describe의 다른 시험과 그 밖의 첫 화면 시험(예시 칩·채팅 칸 없음·차례)은 기대를 고치지 않은 채 통과해야 한다. `AiSection.module.css:16`은 주석 글만 `머리 줄: 어느 탭인지`로 고친다. `docs/UI_GUIDE.md:441` `#ai` 줄의 `머리 neutral 칩 "준비 중" + "AI 리포트 탭"` 부분을 `머리 "AI 리포트 탭"`으로만 바꾼다. 다른 칸은 고치지 않는다

## TASK-7: 지난 달의 덜 찬 리포트 안내 글
- REQ: REQ-2008
- AC: AC-2008.1, AC-2008.2, AC-2008.3
- Files: src/lib/ai/reportScreen.ts, src/lib/ai/reportScreen.test.ts, src/components/ai-report/ReportBody.test.tsx, src/components/ai-report/AiReportScreen.test.tsx, docs/UI_GUIDE.md
- Tests: src/lib/ai/reportScreen.test.ts, src/components/ai-report/ReportBody.test.tsx, src/components/ai-report/AiReportScreen.test.tsx
- TDD: required — 사용자가 고른 글(design.md '지난 달의 덜 찬 리포트 안내', 글자 그대로). 먼저 design.md 목록의 세 시험(`reportScreen.test.ts:283`~`:303`, `ReportBody.test.tsx:150`~`:162`, `AiReportScreen.test.tsx:342`~`:347`)을 새 칩·제목·글로 고치고(시험 이름에 AC-2008.1·AC-2008.3) 해가 바뀌는 달 시험을 더해 RED를 본다. 진행 중 안내·`null`·칩 색(`warning`) 기대는 고치지 않은 채 통과해야 한다(AC-2008.2). 화면 파일(`ReportBody.tsx`)은 글을 `partialNotice`에서 받으므로 고치지 않는다. 고쳐야 하면 멈추고 보고한다. `docs/UI_GUIDE.md:383`의 "리포트 있음(달 끝나기 전·숫자 바뀜 안내 상자)"는 "리포트 있음(덜 찬 숫자·진행 중·숫자 바뀜 안내 상자)"로만 바꾼다

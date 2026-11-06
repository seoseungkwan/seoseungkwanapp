# 설계: AI 리포트에 통계 숫자 잇기

## 개요
- 서버의 숫자 읽는 자리 `loadReportMonths` 하나만 진짜 DB 읽기로 바꾼다. 읽기는 둘이다. ① `stats_months`에서 고른 달·지난달·작년 같은 달 줄을 한 번에 읽는다. ② `stats_rx_groups`에서 처방별 추세 묶음을 읽어 `groupKey(codes)` → 이름 표를 만든다. 읽은 값은 지금처럼 `unknown`으로 넘기고, 검사(`validateMonthPayload`)·입력 만들기·지문·Claude·답 검사·저장은 지금 흐름(`generate.ts`) 그대로다
- 입력의 이름과 단위를 바로잡는다. `total.patients`는 '접수 건수', `total.returning`은 '재진'이고 둘 다 새 `kind: 'visits'`(근거 줄 '건')다. 지시문에 `visits`의 뜻을 적는다
- 묶음은 **지금 묶음만** 쓴다. 바뀌기 전 열쇠는 지표가 아니고, 지금 열쇠가 없는 달은 `0`이 아니라 `null`('자료 없음')이다. 덜 불러온 비교 달(`partial: true`)은 견주지 않는다. 틀린 숫자를 말하는 것보다 말하지 않는 쪽을 고른다
- 로그인 전 첫 화면 AI 칸의 "준비 중" 칩을 뺀다. 지난 달의 덜 찬 리포트 안내 글을 "통계 탭에서 다시 불러온 뒤 [다시 분석]"으로 바꾼다(둘 다 2026-11-06 사용자 결정)
- DB·권한·저장 모양·화면 흐름은 바꾸지 않는다

## 코드로 확인한 것 (2026-11-06, 운영 갈래 `origin/feat-dashboard-saved` bef3181 기준)
| # | 사실 | 확인 결과 | 근거 |
|---|---|---|---|
| 1 | 숫자 읽는 자리가 늘 없음 | 맞음. 인자를 받지도 않고 세 달 `null`·`groupNames: {}` | `src/app/api/ai/store.ts:23` |
| 2 | 경로가 그 자리를 두 곳에서 부른다 | 맞음. 저장된 리포트 GET의 숫자 바뀜 비교, POST 만들기. 둘 다 사용자 세션 클라이언트를 넘긴다 | `src/app/api/ai/report/route.ts:88`·`:115` |
| 3 | 받은 달 자료는 검사하고 달을 맞춘다 | 맞음. `validateMonthPayload` 통과 + `payload.month`가 그 달일 때만 쓴다. 고른 달이 없으면 `E-AI-NO-DATA` | `src/app/api/ai/generate.ts` `currentInput` |
| 4 | 저장 표와 읽기 권한이 있다 | 맞음. `stats_months`(`month`·`partial`·`source`·`payload`), 정책 "내 병원 달 숫자 읽기". `stats_rx_groups`(`name`·`codes`·`sort_order`), 정책 "내 병원 통계 묶음 읽기". 둘 다 승인 병원만(`my_hospital_id()`) | `supabase/migrations/20261101000200_stats.sql:19`·`:75`, `20261105000100_stats_rx_groups.sql:27`·`:94` |
| 5 | 달 줄의 묶음 `id`는 처방 모음의 지문 | 맞음. `groupKey(codes)` = `t` + 16진수 16자리. 통계 탭·대시보드가 같은 함수를 쓴다 | `src/components/stats/treatmentView.ts:29`, `src/components/dashboard/live/rxGroups.ts` |
| 6 | 달 줄에는 '0건' 묶음 줄이 없다 | 맞음. 0줄 채우기(`fillGroupCounts`)는 일 줄에만 한다. 달 줄은 그 달 환자가 없는 묶음을 뺀다. 그래서 달 줄만으로는 '0명'과 '그 묶음으로 세지 않음'을 가를 수 없다 | `src/components/stats/SourcePicker.tsx:57`, `src/workers/stats/jobs.ts:75`, treatment-trend design 사실 5 |
| 7 | 달의 `totals.patients`는 접수 건수 | 맞음. 접수 기준이라 달 칸은 일 칸의 합이다(한 달에 다섯 번 온 분은 5). 재진은 접수 − 신환 | `src/lib/analytics/aggregate.ts:20`, `src/workers/stats/jobs.ts:94` |
| 8 | 처방·묶음·동네는 사람 수 | 맞음. 칸 안의 서로 다른 환자 수 | `src/lib/analytics/aggregate.ts:19` |
| 9 | 근거 줄은 늘 '명' | 맞음. `count`면 `formatCount(value)` + '명' | `src/lib/ai/basis.ts:20` |
| 10 | 지시문이 `count`를 사람 수라고 한다 | 맞음. `partial`도 "진행 중인 달"로만 말한다 | `src/lib/ai/prompt.ts:16`·`:17`·`:37` |
| 11 | 이름 없는 묶음도 지표가 된다 | 맞음. 세 달의 묶음 `id` 합집합 전부, 이름이 없으면 '이름 없는 그룹', 자료 있는 달에 없으면 `0` | `src/lib/ai/input.ts:52`·`:78`·`:82` |
| 12 | 첫 화면 AI 칸에 "준비 중" 칩 | 맞음 | `src/components/landing/AiSection.tsx:36`, `docs/UI_GUIDE.md:441` |
| 13 | 운영 DB에 `ai_reports` 줄이 있을 수 없다 | 맞음. 지금까지 늘 `E-AI-NO-DATA`라 저장까지 간 적이 없다. 그래서 지문 모양이 바뀌어도 "숫자가 바뀌었어요"가 잘못 뜨는 옛 리포트는 없다 | 1·3 |

## 구성 요소 / 인터페이스

### 서버 읽기 (`src/app/api/ai/store.ts`, TASK-5)
```ts
export const loadReportMonths: (supabase: SupabaseClient, month: string) => Promise<ReportMonths>  // 모양은 그대로
```
- 세 달 = `[month, addMonths(month, -1), addMonths(month, -12)]`(`@/lib/analytics/dates`)
- 두 읽기는 `Promise.all`로 함께 보낸다
  - `supabase.from('stats_months').select('month, payload').in('month', 세 달)`
  - `supabase.from('stats_rx_groups').select('name, codes, sort_order')`
- 달 줄: 답이 배열이 아니면 던진다. 줄마다 `month`가 세 달 가운데 하나인 글자일 때만 그 달 칸에 `payload`를 넣는다(검사는 하지 않는다. `generate.ts`가 한다). 같은 달 줄이 둘이면 앞 줄을 쓴다(기본 키라 생기지 않는다)
- 묶음 줄 → `groupNames`(순수 함수 `groupNamesOf(rows: unknown): Record<string, string>`, 파일 안):
  - 배열이 아니거나, 줄의 `name`이 글자가 아니거나, `codes`가 글자만 든 배열이 아니면 던진다. `sort_order`가 정수가 아니면 던진다
  - `sort_order` 작은 차례, 같으면 `name` 글자 코드 차례(`a < b`, `localeCompare`를 쓰지 않는다)로 줄을 세운다
  - `codes`가 빈 줄은 건너뛴다. 이름이 `isText(name, true)`를 못 넘으면(연락처·식별 번호 모양·길이) 건너뛴다(AC-2002.5). 아니면 `key = groupKey(codes)`이고, 그 열쇠가 아직 없으면 `groupNames[key] = name`
  - `groupKey`는 `@/components/stats/treatmentView`에서 가져온다(대시보드 `rxGroups.ts`와 같다). 이 파일의 값 import 사슬(`charts/format`·`dashboard/summary/view`·`stats/view`·`lib/analytics/*`)에는 `'use client'`·React·브라우저 API가 없다(검토에서 확인)
  - `isText`는 `src/lib/payload/validate.ts`에서 이름 앞에 `export`만 붙여 가져온다(검사 규칙은 그대로, 처방명·동네 이름과 같은 검사)
  - 날짜는 `addMonths`만 쓴다. 오늘 날짜(`Date`·`todayInKorea`·`monthOf`)는 쓰지 않는다(AC-704.3의 뜻)
- `error`가 있거나 부름이 던지면 그대로 던진다(오류 내용은 담지 않는다: `throw new Error('stats read failed')`처럼 고정 글). `generateReport`는 던짐을 `E-AI-FAILED`로, `isReportStale`은 `false`로 바꾼다(지금 코드)
- 병원 조건을 넣지 않는다. 쓰기·`rpc`·service role·새 클라이언트·`console`이 없다
- 돌려주는 값은 부를 때마다 새 객체다. 처방 코드는 담지 않는다

### 입력 (`src/lib/ai/input.ts`, TASK-2)
```ts
const TOTALS = [
  ['patients', '접수 건수', 'visits'],
  ['newPatients', '신환', 'count'],
  ['returning', '재진', 'visits'],
] as const
```
- 묶음: 세 달 `groups[].id`의 합집합 가운데 `groupNames`에 자기 열쇠(`Object.hasOwn`)로 있고 값이 빈 글자가 아닌 것만, `id` 글자 코드 차례(지금 차례 규칙 그대로)
- 묶음 지표의 달 값 = 그 달 줄의 그 열쇠 줄 값, 그 달이 없거나 그 열쇠 줄이 없으면 `null`(지금은 `?? 0`)
- `UNNAMED_GROUP`·`groupName`은 쓸 곳이 없어 지운다
- 처방·동네·재방문율·지표 `id`·`ReportInput` 열쇠 차례는 그대로다

### 타입·근거 줄 (`src/types/aiReport.ts`·`src/lib/ai/basis.ts`, TASK-1)
```ts
export type MetricKind = 'count' | 'visits' | 'rate' // count = 명(사람 수), visits = 건(접수 건수), rate = 0~1 비율
```
- `valueText`: `rate`는 그대로, `visits`는 `${formatCount(value)}건`, `count`는 `${formatCount(value)}명`. `null`은 지금처럼(`visits`도 '자료 없음')

### 지시문 (`src/lib/ai/prompt.ts`, TASK-3)
- `PROMPT_VERSION = 'ai-report-3'`
- `:16`의 끝 문장 → "kind가 visits면 접수 건수(같은 분이 한 달에 여러 번 오면 여러 건), count면 사람 수, rate면 0~1 사이 비율입니다."
- `[숫자 규칙]`에 한 줄: "- kind가 visits인 지표(접수 건수·재진)는 사람 수가 아닙니다. '환자가 늘었다'·'환자 ○명'처럼 쓰지 않고 '접수 건수가 늘었다'·'재진 건수가 줄었다'처럼 씁니다."
- `:17` → "- partial이 true면 고른 달 숫자가 그 달 전부가 아닙니다(아직 끝나지 않았거나 일부 날짜만 불러온 달)."
- `:37` → "- partial이 true면 요약 첫 문장에 아직 진행 중이거나 일부 날짜만 불러온 달이라 숫자가 적게 보일 수 있다고 밝힙니다. 값이 적다는 것만으로 줄었다고 단정하지 않습니다." ('진행 중'을 남겨 AC-508.1 시험이 그대로 통과한다)
- 다른 줄은 바꾸지 않는다

### 비교 달 (`src/app/api/ai/generate.ts`, TASK-4)
- `currentInput`에서 `prev`·`lastYear`는 지금 검사(`checked`)를 통과하고 `partial === false`일 때만 쓴다. 아니면 `null`. 고른 달은 지금 그대로(`partial` 허용)
- 만들기와 숫자 바뀜 비교가 같은 함수를 쓰므로 둘 다 같은 규칙이다

### 첫 화면 (`src/components/landing/AiSection.tsx`, TASK-6)
- 머리 줄(`p.kick`)에서 `<span …chipNeutral>준비 중</span>`만 지운다. "AI 리포트 탭"(`.tSmall .tab`)과 그 밖의 칸·차례·클래스는 그대로. `:26`의 주석은 "AI 리포트 탭을 소개한다. 앱에 없는 채팅 칸은 없다." 쯤으로, `AiSection.module.css:16`의 주석 `머리 줄: "준비 중" 칩 + 어느 탭인지`는 `머리 줄: 어느 탭인지`로 고친다(CSS 규칙은 그대로)
- 사용자 결정(2026-11-06 "빼기"). 칩 하나를 지우는 일이라 새 시안을 만들지 않는다. 이 명세는 사용자가 `/sdd approve`를 직접 입력해 승인한다

### 지난 달의 덜 찬 리포트 안내 (`src/lib/ai/reportScreen.ts` `partialNotice`, TASK-7)
- 그 달이 이번 달보다 앞일 때(`report.month < monthOf(today)`)만 바꾼다:
  - `chip: '덜 찬 숫자'`
  - `` title: `이 리포트는 ${name} 숫자가 다 차기 전에 만들었어요` ``
  - `body: '숫자가 적게 잡혀 있을 수 있어요. 통계 탭에서 그 달을 다시 불러온 뒤 [다시 분석]을 눌러 주세요.'`
- 이번 달(진행 중) 안내와 `partial: false`의 `null`은 그대로다. 칩 색(`warning`)과 화면 자리(`ReportBody`)도 그대로다
- 사용자 결정(2026-11-06 "바꾸기", 위 글을 미리 보고 고름)

## 데이터 흐름
```
[AI 분석] → POST /api/ai/report (달만 받음) → 승인 확인(지금)
  → loadReportMonths(사용자 세션, 달)
      ├ stats_months: 세 달 month·payload (RLS: 내 병원)
      └ stats_rx_groups: name·codes·sort_order → groupKey(codes) → 이름 (codes는 여기서 버림)
  → generate.ts: validateMonthPayload + 달 맞춤, 비교 달 partial이면 없음
  → buildReportInput(접수 건수·재진 = visits, 지금 묶음만, 없는 달 null) → 지문
  → Claude(지시문 ai-report-3) → 답 검사 → 근거 줄(건·명) → ai_reports 저장 → ai_usage 기록 → 화면
GET(저장된 리포트) → 같은 읽기·입력·지문으로 "숫자가 바뀌었어요" 판단
```
- Claude로 가는 것: 지표 이름(묶음·처방·동네 이름 포함)과 숫자뿐이다. 처방 코드 목록·환자 정보·병원 이름은 없다(처방 지표 이름이 비면 코드를 쓰는 지금 규칙 AC-505.6은 그대로)

## 결정과 트레이드오프
| 결정 | 까닭 | 버린 것 |
|---|---|---|
| 이름 '접수 건수', 단위 '건'(재진도), 신환·처방·묶음·동네 '명' | 사용자 결정(2026-11-06). 매출 탭의 '접수 건수'와 같은 말 | '내원 건수'·'총환'(사용자가 고르지 않음) |
| 새 `kind: 'visits'` | 단위가 지표마다 정해지고, Claude도 `kind`로 뜻을 안다. `id`는 그대로라 답 검사·카드 차례가 안 바뀐다 | 지표마다 `unit` 칸 더하기(입력 모양·지문 열쇠 차례가 바뀌고 고칠 곳이 많다) |
| 묶음은 지금 열쇠만, 없는 달은 `null` | 달 줄만으로 '0명'과 '세지 않음'을 못 가른다(사실 6). '0명으로 크게 줄었다' 같은 틀린 말을 막는다. 처방별 추세의 "다시 불러오면 보여요"와 같은 뜻 | 일 줄(`stats_days`)까지 읽어 날마다 열쇠 확인(세 달 × 하루 64KB까지라 무겁고, 서버 읽기가 커진다) |
| 덜 불러온 비교 달은 견주지 않음 | 일부 날짜만 불러온 지난달과 견주면 "늘었다"가 틀린다 | 지시문에 비교 달 `partial`을 알려 Claude가 조심하게(입력 모양이 바뀌고 Claude 판단에 맡김) |
| `groupKey`를 `treatmentView.ts`에서 가져옴 | 열쇠 규칙을 두 벌 두지 않는다(대시보드와 같다). 그 파일은 순수 함수 모음이고 React·브라우저 API가 없다 | `lib`로 옮기기(통계·대시보드 파일과 시험을 함께 고쳐야 한다) |
| 묶음 읽기 실패는 리포트 실패 | 이름 없이 만들면 묶음 지표가 통째로 빠진 리포트가 저장되고, 다음에 읽히면 "숫자가 바뀌었어요"가 뜬다 | 묶음 없이 만들기 |
| 첫 달 2026-01 그대로 | 사용자 결정(2026-11-06) | 2025-01부터 |
| 묶음 이름도 `isText` 검사 | 처방명·동네 이름은 `validate.ts`를 거치는데 묶음 이름만 DB 제약(6자리 이상 숫자·제어 문자)뿐이라 `010-1234-5678` 같은 글이 Claude로 갈 수 있다. 같은 검사로 한 겹 더 막는다. 못 넘는 묶음만 빠진다 | 리포트 전체 실패(이름 하나 때문에 리포트를 못 만든다) |
| 지난 달 덜 찬 리포트 안내 글 바꿈 | 사용자 결정(2026-11-06). 진짜 숫자에서는 달이 지나도 덜 찬 채로 남을 수 있어 "다시 분석"만으로는 안 바뀐다 | 그대로 두고 위험에만 적기 |

## 기존 명세·시험과의 관계
이 명세가 바꾸는 옛 기준(옛 명세 파일은 고치지 않는다):
- `specs/ai-report` AC-511.6(숫자 읽는 자리는 늘 없음) → REQ-2001·2002
- `specs/ai-report` AC-505.5(이름 없는 묶음은 '이름 없는 그룹') → AC-2003.1
- `specs/ai-report` AC-505.1의 "작년 같은 달에 없는 … 그룹은 0" → 묶음만 `null`(AC-2003.2). 처방·동네는 그대로
- `specs/ai-report` AC-505.1의 지표 이름 '전체 환자' → '접수 건수'(AC-2004.1)
- `specs/ai-report` AC-508.1의 partial 문장, AC-508.4의 판 `'ai-report-2'` → AC-2005.2·AC-2004.3
- `specs/ui-90` AC-421.4의 "준비 중" 칩 → AC-2006.1
- `specs/ai-report-screen` AC-703.8·AC-709.4의 지난 달 partial 안내("달 끝나기 전"·"끝나기 전에 만들었어요") → REQ-2008
- `docs/ADR.md:185` ADR-024의 "숫자 읽는 자리 … 늘 '자료 없음'" 줄 → 이 명세로 고친다(TASK-5)

기대를 고치는 지금 시험(이 줄들 말고 지금 시험은 고치지 않은 채 통과해야 한다. 다른 기대가 바뀌어야 하면 멈추고 보고한다):
- `src/app/api/ai/store.test.ts:102`~`:120` `describe('loadReportMonths (AC-511.6)')` 두 시험 → REQ-2001·2002 시험으로 바꾼다
- `src/app/api/ai/store.test.ts:159` AC-511.2 소스 시험의 `.from(` 개수 2 → 4, 표 이름 목록에 `stats_months`·`stats_rx_groups`를 더한다(나머지 줄은 그대로)
- `src/app/api/ai/store.test.ts:339`~`:341` AC-704.3 소스 시험의 정규식 `/\bDate\b|analytics\/dates/` → `/\bDate\b|todayInKorea|monthOf/`(뜻 "store.ts에서 오늘 날짜를 구하지 않는다"는 그대로, `addMonths` 가져오기만 허용)
- `src/lib/ai/input.test.ts:7`(`UNNAMED_GROUP` 가져오기), `:137` 시험의 `'전체 환자'`·`total.patients`·`total.returning`의 `kind`, `:158`~`:160`(이름 없는 `g-gamma` 지표 → 없음), 묶음 지표의 `0` 기대(`:152`~`:157`, `:171`·`:178` 시험의 묶음 칸) → `null`, `:210` AC-505.2 지표 차례 시험의 `group:g-gamma.*` 세 줄(`:223`~`:225`) → 뺌, `:263` 글자 코드 차례 시험의 `groupNames: {}`(`:272`) → `G-a`·`g-b` 이름을 넣어 같은 차례 기대를 남김, `:374`·`:383`의 AC-505.5 두 시험 → AC-2003.1 시험으로
- `src/lib/ai/prompt.test.ts:164` 판 `'ai-report-2'` → `'ai-report-3'`(시험 이름에 AC-2004.3을 더한다). AC-508.1 시험(`:74`)은 고치지 않는다(새 `:37` 줄에 '진행 중'이 남는다)
- `src/components/landing/middle.test.tsx`: 짜임 정규식 `AI_SHAPE`(`:153`~`:154`)에서 머리 줄 첫 `<span>` 묶음 하나, `:177` 구조 분해의 `soon, soonIn`, `:194` AC-421.4 머리 줄 시험 → "준비 중" 칩 없음(AC-2006.1). 같은 describe의 나머지 시험(`:183` 짜임·`:202` h2·`:209` 약속·`:219` 리포트·`:230` 항목)은 기대를 고치지 않고 정규식만 따라 통과한다
- `src/lib/ai/reportScreen.test.ts:283`~`:303`(AC-703.8 지난 달 partial), `src/components/ai-report/ReportBody.test.tsx:150`~`:162`(AC-709.4), `src/components/ai-report/AiReportScreen.test.tsx:342`~`:347`(AC-709.4)의 칩·제목·글 → REQ-2008 글. 진행 중 안내 기대(`reportScreen.test.ts:279`·`ReportBody.test.tsx:147`·`AiReportScreen.test.tsx:252`)는 그대로
- `src/lib/ai/basis.test.ts`·`src/app/api/ai/generate.test.ts`·`src/app/api/ai/report/route.test.ts`·`scripts/aiTry.test.ts`·`fixtures/fake-ai/fakeAi.test.ts`는 시험을 더하기만 하고(앞 둘) 지금 기대는 고치지 않는다. `generate.test.ts`에 비교 달이 `partial: true`인데 `hasPrev: true`를 기대하는 시험이 있으면 그 기대만 AC-2005.1로 고치고 보고한다

## 사용자가 할 일
1. **사이트 서버에 열쇠 넣기**: Anthropic 콘솔에서 사이트용 열쇠를 새로 받는다(노트북 시험용과 따로). Vercel 웹 화면 → 이 프로젝트 → Settings → Environment Variables에 `ANTHROPIC_API_KEY`(Production)로 넣는다. 열쇠는 채팅에 붙이지 않는다. 월 사용 한도를 건다
2. 사이트에 올리는 것은 사용자 말("배포해")로만 한다. 이 갈래는 운영 갈래 `origin/feat-dashboard-saved`(bef3181)에서 시작했다. DB SQL은 없다
3. 올린 뒤 손 확인: ① 통계 탭에서 지난달이 저장돼 있는지 본다(없으면 [비트에서 불러오기]) ② AI 리포트 탭 → 지난달 → [AI 분석] → 리포트가 나오고 근거 줄이 '접수 건수 … 건'·'신환 … 명'이다 ③ 근거 숫자가 통계 탭의 그 달 숫자와 같다 ④ 묶음 카드의 이름이 통계 탭 처방별 추세 묶음 이름이다 ⑤ 사용량 칸에 1회가 더해진다. 1회 약 0.05달러 ⑥ 로그인 전 첫 화면 AI 칸에 "준비 중"이 없다

## 위험 / 미해결 질문
- 그 달 환자가 정말 0명인 묶음도 '자료 없음'으로 나온다(달 줄에 0줄이 없어서, 사실 6). 틀린 숫자는 아니고 말하지 않을 뿐이다
- 묶음 처방을 바꾼 뒤 지난 달을 다시 불러오지 않으면 그 묶음은 지난달·작년 비교가 '자료 없음'이다. 통계 탭의 "다시 불러오면 보여요"와 같다
- 묶음 이름을 바꾸면 지표 이름이 바뀌어 저장된 리포트에 "숫자가 바뀌었어요"가 뜬다(숫자는 같아도). 다시 분석하면 된다
- 달 줄은 하나에 1MiB까지라 한 번 읽기가 3MiB까지 될 수 있다. 보통 달은 훨씬 작다
- 고른 달이 일부 날짜만 불러온 지난 달이어도 리포트를 만든다. 지시문이 "그 달 전부가 아님"을 밝히게 하고, 화면은 "통계 탭에서 그 달을 다시 불러온 뒤 [다시 분석]"을 안내한다(REQ-2008)
- 시험의 함정(TASK-5): `store.test.ts:164`의 `/\.from\s*\(/`는 `Array.from(`도 센다(`store.ts`에서 `Array.from`을 쓰지 않는다). `:256`은 주석 안의 `hospital_id` 글자도 실패로 본다(주석에 그 글자를 쓰지 않는다). 고친 AC-704.3 정규식도 주석까지 읽으므로 `store.ts` 주석에 `Date`·`todayInKorea`·`monthOf` 글자를 쓰지 않는다. 묶음 읽기는 `select()` 결과를 바로 `await`하므로 가짜 클라이언트의 사슬 끝이 `then`을 받아야 한다
- 이 노트북(윈도우)에서는 전체 시험에 환경 탓 실패가 이미 있다(`as.md` '시험이 환경 탓으로 실패하는 것'). 전체 확인은 갈래를 만들기 전 운영 갈래에서 같은 명령의 실패 목록을 먼저 재고, 이 기능 뒤에 새 실패가 없는지로 본다

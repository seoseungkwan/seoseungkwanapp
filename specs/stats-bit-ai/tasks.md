# 작업 분할: 통계 비트 세 칸을 AI 리포트에

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> 차례: TASK-1·TASK-2 → TASK-3 → TASK-4 → TASK-5 → TASK-6. 다 끝나면 `npx tsc --noEmit`·`npm run lint`·관련 시험 묶음을 돌린다.

## TASK-1: DB에 sections 칸
- REQ: REQ-2902
- AC: AC-2902.1, AC-2902.4, AC-2902.5
- Files: supabase/migrations/20261109000000_stats_month_sections.sql, supabase/statsSections.rls.test.ts
- Tests: supabase/statsSections.rls.test.ts
- TDD: required — 진짜 Postgres(PGlite)에 auth·stats·새 마이그레이션을 차례로 돌린다(지금 `stats-rls.test.ts`와 같은 틀). 칸 있음·빈 값 받음·제약(v·month·partial·크기·객체) 거부·내 병원 넣기/고치기·다른 병원 못 읽음·anon 못 씀·완전한 줄 위 덜 덮인 줄이면 sections도 옛 값. 지금 `stats-rls.test.ts`는 고치지 않는다

## TASK-2: 저장 모양과 검사
- REQ: REQ-2902, REQ-2903
- AC: AC-2902.2, AC-2903.2
- Files: src/types/payload.ts, src/lib/payload/validate.ts, src/lib/payload/validate.test.ts
- Tests: src/lib/payload/validate.test.ts
- TDD: required — `validateMonthSections`: 맞는 값은 새 객체로 돌려줌, 모르는 열쇠·v≠1·달 글자 틀림·배열 길이(age 10·openDays/weekdays 7·hours 13)·한도 넘는 줄 수·음수/소수/안전 정수 밖 수·`isText`를 못 넘는 이름·빈 이름이면 null

## TASK-3: 달마다 세 칸 합계 만들기 (Worker)
- REQ: REQ-2901, REQ-2906
- AC: AC-2901.1, AC-2901.2, AC-2901.3, AC-2901.4, AC-2901.5, AC-2901.6, AC-2901.7, AC-2906.1
- Files: src/lib/payload/toMonthSections.ts, src/lib/payload/toMonthSections.test.ts, src/workers/stats/jobs.ts, src/workers/stats/jobs.test.ts, src/types/stats.ts
- Tests: src/lib/payload/toMonthSections.test.ts, src/workers/stats/jobs.test.ts
- TDD: required — 두 달에 걸친 불러오기에서 달마다 셈 기간(첫 달 앞부분·끝 달 오늘까지)·partial이 달 줄과 같음, 연령대 열 줄(0명 포함), 보험·동네 5명 경계(4명 빠짐·5명 들어감)·보통 줄만, 요일·시간 합과 문 연 날, 8시 전·21시 뒤 접어 넣기, 원장님 줄·single이면 []·매출 정수, 이름 검사에 걸린 줄 빠짐, v2 답·파일이면 null, JSON에 차트번호·생년월일·주소 앞부분이 없음, 결과가 `validateMonthSections`를 넘음, 새 파일이 lint 울타리 안(지금 AC-2708.2 시험처럼)

## TASK-4: 저장에 sections 싣기
- REQ: REQ-2902
- AC: AC-2902.2, AC-2902.3
- Files: src/lib/storage/stats.ts, src/lib/storage/stats.test.ts, src/components/stats/StatsScreen.tsx, src/components/stats/StatsScreen.test.tsx
- Tests: src/lib/storage/stats.test.ts, src/components/stats/StatsScreen.test.tsx
- TDD: required — 비트 저장의 달 줄마다 같은 달 sections, 그 달 sections 없음·검사에 걸림·크기 넘음이면 `sections: null`이고 달·일 저장은 그대로 됨, 파일 저장은 늘 `sections: null`, 덜 덮인 파일 달 줄은 지금처럼 안 보냄, 통계 화면 비트 저장이 `view.sections`를 넘김. 줄 모양을 글자 그대로 보는 지금 저장 시험은 `sections`를 더한 값으로만 고친다(AC-2906.3)

## TASK-5: AI 지표·근거 줄·지시문
- REQ: REQ-2904, REQ-2905
- AC: AC-2904.1, AC-2904.2, AC-2904.3, AC-2904.4, AC-2904.5, AC-2905.1, AC-2905.2, AC-2905.3
- Files: src/types/aiReport.ts, src/lib/ai/input.ts, src/lib/ai/input.test.ts, src/lib/ai/basis.ts, src/lib/ai/basis.test.ts, src/lib/ai/prompt.ts, src/lib/ai/prompt.test.ts, src/lib/ai/output.test.ts
- Tests: src/lib/ai/input.test.ts, src/lib/ai/basis.test.ts, src/lib/ai/prompt.test.ts, src/lib/ai/output.test.ts
- TDD: required — sections 없는 고른 달은 지금 입력·지문과 글자 그대로 같음, 지표 차례·ID·이름·kind, 보험 상위 10·동네 모두, 비교 달 값(sections 없음 null·보험/동네 줄 없음 null·원장님 줄 없음 0), 평균 나누기와 둘째 자리 반올림·나누는 수 0이면 null, 근거 줄 `12,345,000원`·`14.3건`·`0건`·`자료 없음`, 지시문 새 규칙 글, 새 지표 ID를 쓴 카드는 받고 없는 ID는 버림

## TASK-6: AI 서버가 sections 읽기
- REQ: REQ-2903, REQ-2906
- AC: AC-2903.1, AC-2903.2, AC-2903.3, AC-2906.2, AC-2906.3
- Files: src/app/api/ai/store.ts, src/app/api/ai/store.test.ts, src/app/api/ai/generate.ts, src/app/api/ai/generate.test.ts
- Tests: src/app/api/ai/store.test.ts, src/app/api/ai/generate.test.ts
- TDD: required — 읽기 한 번 `select('month, payload, sections')`·세 달 sections 그대로, 검사 못 넘음·달 다름이면 그 달 sections만 없음·리포트는 만듦, 비교 달은 다 불러온 달일 때만, sections 없는 달이면 지문이 지금과 같음(숫자 바뀜 비교 포함), Claude 요청 몸 JSON에 원장님 이름·묶음 이름·수만 있고 차트번호·생년월일·주소 앞부분이 없음. select 글을 보는 지금 시험은 새 글로만 고친다(AC-2906.3)

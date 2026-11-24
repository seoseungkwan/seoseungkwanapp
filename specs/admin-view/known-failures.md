# admin-view — 이 PC(윈도우)에서 원래 나는 실패

전체 시험(2026-11-24, feat-admin-view 2fe66dff, `npx vitest run --no-file-parallelism`): 834 파일 · 42,527개 중 7개 실패. 모두 이 기능과 상관없다.

| 시험 | 기준(운영 3cbb68fb)에서 | 까닭 |
|---|---|---|
| `e2e/lib/envFile.test.ts` AC-005.2 둘(권한 600) | 같이 실패 | 윈도우는 파일 권한 600·644가 없다 |
| `e2e/lib/session.test.ts`(파일 통째) | 같이 실패 | e2e 권한(위와 같은 까닭) |
| `src/components/landing/rules.test.ts` AC-212.4·AC-420.3 | 같이 실패 | 윈도우 `\` 경로 |
| `src/lib/analytics/aggregate.test.ts` '10만 줄 1초' 셋 | 조용할 때 통과 | PC가 바쁠 때 시간 초과. `aggregate.ts`·그 import(`dates.ts`)·시험 파일이 기준과 한 글자도 다르지 않다(`git diff 3cbb68fb -- src/lib/analytics/aggregate.ts src/lib/analytics/dates.ts src/lib/analytics/aggregate.test.ts` 빈 결과) |

tsc 0 오류 · lint 0 오류(경고 둘은 기준부터 있던 `docs/mockups/stats/app.js`·`supabase/revenue.rls.test.ts`) · build 통과.

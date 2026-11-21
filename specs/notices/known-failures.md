# 이 PC(윈도우)에서 원래 나는 시험 실패 — notices 마지막 전체 검사(2026-11-21)

전체 vitest(86570732): 563파일 중 4파일·6시험 실패, 33,271 통과. 모두 이 기능과 상관없는 이 PC의 원래 실패다(calendar-colors·clinic-calendar known-failures.md와 같은 것 + 속도 시험).

- e2e/lib/envFile.test.ts — AC-005.2 파일 권한 600(윈도우 권한 모델)
- e2e/lib/session.test.ts — 파일 단위 실패(윈도우 권한)
- src/components/landing/rules.test.ts — AC-212.4·AC-420.3 경로 구분자 `\`
- src/lib/analytics/aggregate.test.ts — "10만 줄 1초" 둘(PC가 바쁠 때 1.09~1.18초)

첫 전체 검사(cfa46d7e)에서 새로 깨졌던 셋(dashboard/page.test.tsx AC-307.6, DashboardAnalysis.test.tsx AC-311.8, ui/classes.test.ts NoticeBadge)은 tfb(e287d25e)에서 고쳐 이번에는 통과했다.
tsc·build 통과, lint 경고 2(docs/mockups/stats/app.js·supabase/revenue.rls.test.ts, 기존). 도우미·확장은 바꾸지 않아 dotnet·확장 빌드는 돌리지 않았다.

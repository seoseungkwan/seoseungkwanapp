# 이 PC에서 나는 실패 (재고 기능과 무관)

2026-11-21 전체 시험(`npx vitest run --no-file-parallelism`, 5c105b37): 32,777개 중 14개 실패. 재고 작업은 아래 시험의 대상 폴더(src/components/stats·ui·landing, src/lib/ai·analytics, e2e)를 고치지 않았다(`git diff --stat b2ab27e5..HEAD`가 빈 것으로 확인).

| 시험 | 까닭 |
|---|---|
| e2e/lib/envFile.test.ts AC-005.2 ×2, e2e/lib/session.test.ts | 윈도우 파일 권한(600) — 이 PC에서 원래 실패 |
| src/components/landing/rules.test.ts AC-212.4·AC-420.3 | `\` 경로 — 이 PC에서 원래 실패 |
| src/lib/analytics/aggregate.test.ts "10만 줄 1초" ×3 | PC가 바쁠 때 시간 초과 — 원래 실패 |
| src/components/ui/classes.test.ts ×3, src/lib/ai/boundary.test.ts ×3 | 5초 시간 초과. 따로(`--testTimeout=60000`) 돌리면 모두 통과(재고 고침 뒤 HEAD에서 710개 통과) |
| src/components/stats/StatsScreen.test.tsx AC-4003.6 | 많이 돌릴 때 초점 시험이 늦음. 따로 돌리면 통과 |

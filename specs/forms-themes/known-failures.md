# 이 PC(윈도우)에서 원래 나는 실패 — forms-themes 마지막 검사 (2026-11-15)

전체 실행(`npx vitest run --no-file-parallelism`, HEAD ee2d004): 424파일 중 6파일·7개 실패, 26,517개 통과. 모두 이 기능이 건드리지 않은 파일이다(`git diff 94a05c4 HEAD -- fixtures src/lib/analytics` 비어 있음). 아래 넷은 forms-guide 마지막 검사(`specs/forms-guide/known-failures.md`)에서 기준 커밋 `94a05c4`에서도 똑같이 실패한 것이다.

| 시험 | 까닭 |
|---|---|
| `e2e/lib/envFile.test.ts` AC-005.2 두 개 | 윈도우에서 파일 권한 600이 안 됨 |
| `e2e/lib/session.test.ts` (파일 전체) | 경로가 `C:\C:\`로 겹침 |
| `extension/src/manifest.test.ts` AC-003.8 | `spawnSync npm ENOENT` |
| `src/components/landing/rules.test.ts` AC-212.4·AC-420.3 | `\` 경로 |

- PC가 바빠(화면 사진 하네스·빌드가 함께 돌던 때) 시간을 넘긴 것: `src/lib/analytics/aggregate.test.ts` 속도 시험 3개(1초), `fixtures/make-fake-fixtures.test.ts` AC-005.2 beforeAll(10초) → 따로 돌리면 두 파일 223개 모두 통과
- tsc 통과, `npm run lint` 오류 0(경고 2개는 이 기능 밖 `docs/mockups/stats/app.js`·`supabase/revenue.rls.test.ts`), `npm run build` 성공

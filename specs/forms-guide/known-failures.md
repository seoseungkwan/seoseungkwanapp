# 이 PC(윈도우)에서 원래 나는 실패 — forms-guide 마지막 검사 (2026-11-15)

기준 커밋 `94a05c4`(운영 갈래와 갈라진 곳 = origin/feat-dashboard-saved)와 이 갈래 HEAD에서 같은 파일을 돌려 견줌. 두 쪽 모두 같은 4개 시험 + 1개 파일이 실패 → 이 기능 탓이 아님.

| 시험 | 까닭 |
|---|---|
| `e2e/lib/envFile.test.ts` AC-005.2 두 개 | 윈도우에서 파일 권한 600이 안 됨 |
| `e2e/lib/session.test.ts` (파일 전체) | 경로가 `C:\C:\`로 겹침 |
| `extension/src/manifest.test.ts` AC-003.8 | `spawnSync npm ENOENT` |
| `src/components/landing/rules.test.ts` AC-212.4·AC-420.3 | `\` 경로 |

- 전체 실행 때 `src/lib/analytics/aggregate.test.ts` 속도 시험 3개는 PC가 바빠 1초를 넘김 → 따로 돌리면 187개 모두 통과
- `helper/tests/*.dotnet.test.ts` 16개는 .NET 8을 잡아 실패 → `PATH="$HOME/.dotnet:$PATH"`로 199개 모두 통과

# 이 PC에서 원래 나는 실패 (reception-other-clinic, 2026-11-17)

전체 `npx vitest run --no-file-parallelism` (HEAD 62706b02): 388개 파일 중 7개 실패, 21642개 시험 중 33개 실패.
같은 7개 파일을 기준 커밋 2550eb1(이 기능이 갈라져 나온 곳)에서 돌려도 33개가 똑같이 실패한다 → 이 기능 탓이 아니다.
이 기능은 `src/`·`e2e/`·`extension/`을 고치지 않았다(`git diff --stat 2550eb1 HEAD -- src e2e extension` 빔).

| 파일 | 까닭(이 윈도우 PC) |
|---|---|
| `src/app/(app)/tabFrame.test.tsx` | `\` 경로 |
| `src/components/landing/rules.test.ts` | `\` 경로 |
| `src/components/charts/rules.test.ts` | `\` 경로 |
| `src/components/ui/classes.test.ts` | `\` 경로 |
| `e2e/lib/envFile.test.ts` | 윈도우 파일 권한(600) |
| `e2e/lib/session.test.ts` | e2e 환경 |
| `extension/src/manifest.test.ts` | npm ENOENT |

그 밖: tsc 통과, lint 오류 0(경고 2), build 통과, C# net10 4059개 모두 통과.

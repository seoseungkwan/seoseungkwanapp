# 이 PC(윈도우)에서 원래 나는 실패 — sunap-ilji 마지막 검사(2026-11-17)

기준 커밋 56d86a5(운영 판, 이 기능이 갈라져 나온 곳)에서도 똑같이 실패해서 이 기능 탓이 아니다.

| 시험 | 까닭 |
|---|---|
| `src/components/landing/rules.test.ts` | 윈도우 `\` 경로 |
| `extension/src/manifest.test.ts` AC-003.8 | `spawnSync npm ENOENT`(윈도우에서 npm을 못 띄움) |
| `e2e/lib/envFile.test.ts`·`e2e/lib/session.test.ts` | e2e 권한(전체 `npm test`에서만) |

- 도우미 감싸개 시험(`helper/tests/*.dotnet.test.ts`)은 `PATH="$HOME/.dotnet:$PATH"`로 돌려야 한다. 없으면 SDK 8로 돌아 거짓 실패 → 다시 돌려 392개 모두 통과.
- 마지막 `npx vitest run src supabase`: 27,083 통과, 실패 2(위 표 첫 두 줄).

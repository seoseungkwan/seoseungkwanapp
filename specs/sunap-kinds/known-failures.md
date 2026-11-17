# 이 PC(윈도우)에서 원래 나는 실패 — sunap-sort·sunap-health·sunap-kinds·sunap-new-label 합친 판 마지막 검사(2026-11-17)

합친 판 30e609dd 뒤(검토 고침 전) 전체 `PATH="$HOME/.dotnet:$PATH" npx vitest run --no-file-parallelism`: 28,009 통과, 실패 15(5파일). tsc 0 · lint 0 · build 성공.

| 시험 | 까닭 |
|---|---|
| `src/components/landing/rules.test.ts`(AC-212.4·AC-420.3) | 윈도우 `\` 경로(sunap-doctors·sunap-ilji known-failures와 같음) |
| `extension/src/manifest.test.ts` AC-003.8 | `spawnSync npm ENOENT` |
| `e2e/lib/envFile.test.ts`·`e2e/lib/session.test.ts` | e2e 권한 |
| `helper/tests/input.dotnet.test.ts`(C# AC-017.10 이름 있는 뮤텍스 abandoned) | 전체 실행 중 흔들림. 따로 다시 돌리면 C# 1,978개·감싸개 21개 모두 통과. 이 일들은 Input을 건드리지 않았다 |

검토 고침(2747e6e3) 뒤: 수납일지·통계·sunap 규칙·Worker·저장·guardrails 66파일 3,708개 통과, tsc·eslint 깨끗.

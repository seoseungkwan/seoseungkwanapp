# stats-pc-ux — 이 PC(윈도우)에서 원래 나는 시험 실패

2026-11-14 전체 시험(`npx vitest run --no-file-parallelism`, 기능 갈래 c965319): 394개 파일 중 22개 실패, 시험 126개 실패. 아래는 모두 이 기능이 고치지 않은 파일이다(`git diff b666fcc...HEAD -- e2e/lib extension src/components/landing src/components/common helper`가 비어 있음).

| 파일 | 까닭 |
|---|---|
| `helper/tests/*.dotnet.test.ts` 17개 | 전체 시험을 `PATH="$HOME/.dotnet:$PATH"` 없이 돌림 → SDK 8로 돌아 실패. 도우미 코드는 이 기능에서 바뀌지 않음 |
| `e2e/lib/envFile.test.ts`, `e2e/lib/session.test.ts` | 파일 권한 600 확인 — 윈도우는 chmod가 그대로 남지 않음 |
| `extension/src/manifest.test.ts` AC-003.8 | npm ENOENT(이 PC에서 원래 나는 실패) |
| `src/components/landing/rules.test.ts` | `\` 경로(이 PC에서 원래 나는 실패) |
| `src/components/common/adminContact.test.ts` AC-409.3 | 합칠 때 작업 사본의 `docs/UI_GUIDE.md`가 CRLF로 써져 `'문구\n'`을 못 찾음. 저장소(커밋) 안은 LF이고, LF로 다시 꺼낸 뒤 21개 모두 통과 |

통계 화면 시험(`src/components/stats`·`src/components/ui`)은 실패 0. 마지막 독립 검토 VERDICT: PASS.

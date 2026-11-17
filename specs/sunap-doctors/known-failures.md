# 이 PC(윈도우)에서 원래 나는 실패 — sunap-doctors 마지막 검사(2026-11-17)

전체 `PATH="$HOME/.dotnet:$PATH" npx vitest run --no-file-parallelism`: 27,559 통과, 실패 4. 넷 다 기준 커밋 0ad17a0(운영 판)에서도 실패한다(specs/sunap-ilji/known-failures.md와 같음).

| 시험 | 까닭 |
|---|---|
| `src/components/landing/rules.test.ts` | 윈도우 `\` 경로 |
| `extension/src/manifest.test.ts` AC-003.8 | `spawnSync npm ENOENT` |
| `e2e/lib/envFile.test.ts`·`e2e/lib/session.test.ts` | e2e 권한 |

- `npm run build` 성공(`/sunap` 16.7 kB, `/stats` 75 kB). tsc 통과, lint 오류 0(경고 2는 전부터 있던 것).

## 합친 판(feat-helper-download 합침 57238aa) 다시 검사 — 2026-11-17
- tsc 0·lint 오류 0·build 성공. 전체 27,757 통과, 실패 16(6파일): 위 넷 + `helper/tests/stats-report.dotnet.test.ts`·`helper/tests/store.dotnet.test.ts`.
- 두 dotnet 감싸개는 따로 다시 돌리면 17개 모두 통과 → 전체 실행 중 dotnet 동시 실행 탓(이 PC에서 원래 나는 lock·WorkLock 흔들림). 합침은 helper를 건드리지 않았다.

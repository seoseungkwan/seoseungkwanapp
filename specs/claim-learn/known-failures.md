# claim-learn 끝 검사에서 이 PC 탓으로 본 실패 (2026-11-28, 6df24ab1)

전체 `vitest run --no-file-parallelism`: 47,148개 중 21개 실패. 모두 이 기능과 상관없는 이 PC 탓이다.

| 시험 파일 | 수 | 까닭 |
|---|---|---|
| `src/components/landing/rules.test.ts` | 2 | 윈도우 `\` 경로(알려진 것, 기준 판에서도 실패) |
| `e2e/lib/envFile.test.ts`·`e2e/lib/session.test.ts` | 3 | e2e 권한(알려진 것) |
| `helper/tests/input-replace.dotnet.test.ts` | 17 | 빌드·다른 시험과 동시에 dotnet을 돌려 생긴 것. 혼자 다시 돌리면 24/24 통과 |

그 밖: tsc 0 · lint 오류 0(경고 18은 원래) · `npm run build` 통과 · 도우미 net10 2431·net48 2431·Windows 87 통과.

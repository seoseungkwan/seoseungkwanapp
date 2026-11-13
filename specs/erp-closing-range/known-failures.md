# 이 PC(윈도우)에서 원래 나는 실패 — erp-closing-range 마지막 검사 (2026-11-13, HEAD c953526)

전체 `npx vitest run --no-file-parallelism`: 시험 23,954개 가운데 4개 실패, 6개 건너뜀(파일 392개 가운데 4개 실패). 모두 이 기능이 고치지 않은 곳이고(`git diff 2244371...HEAD`는 `extension-erp/`·`helper-erp/`·`specs/`·`docs/mockups/`만 바꿈), ssk-finish-check에 적힌 '이 PC에서 원래 나는 실패'와 같다.

| 시험 | 까닭 |
|---|---|
| `e2e/lib/envFile.test.ts` AC-005.2 두 개 | 윈도우는 파일 권한 600/644를 쓰지 않음 (e2e 권한) |
| `e2e/lib/session.test.ts` (파일 불러오기) | e2e 환경 값 없음 (e2e 권한) |
| `extension/src/manifest.test.ts` AC-003.8 | 시험 안에서 `npm` 실행 ENOENT |
| `src/components/landing/rules.test.ts` AC-212.4·AC-420.3 | 경로 구분자 `\` |

같은 검사에서 통과: `tsc --noEmit -p .`·`-p extension-erp`, `npm run lint`(오류 0, 경고 2는 이 기능 밖), `npm run build`, Precheck.Core net10.0 1853/1853, Erp.Core net48 396/396, `npm run ext-erp:build`, `extension-erp`·`helper-erp` vitest 913/913.

# google-link — 이 PC(윈도우)에서 원래 나는 실패

전체 시험(2026-11-26, feat-google-link 254afbf2, `npx vitest run --no-file-parallelism`): 895 파일 · 45,294개 중 5개 실패. 넷은 이 기능과 상관없고, 하나(`tabFrame.test.tsx`)는 옛 목록 시험이라 TASK-23 (자)에서 고쳤다.

| 시험 | 기준(운영 a1b088de)에서 | 까닭 |
|---|---|---|
| `e2e/lib/envFile.test.ts` AC-005.2 둘(권한 600) | 같이 실패(admin-view 기록과 같음) | 윈도우는 파일 권한 600·644가 없다 |
| `e2e/lib/session.test.ts`(파일 통째) | 같이 실패(admin-view 기록과 같음) | e2e 경로·권한 — 한글 폴더 경로가 `%EC…`로 바뀌어 `C:\C:\…`가 된다 |
| `src/components/landing/rules.test.ts` AC-212.4·AC-420.3 | 같이 실패(admin-view 기록과 같음) | 윈도우 `\` 경로 |

tsc 0 오류 · lint 0 오류(경고 17, 모두 시험 파일의 쓰지 않는 `_` 이름·기준부터 있던 `docs/mockups/stats/app.js`·`supabase/revenue.rls.test.ts`) · build 통과 · 도우미 시험 net10 2,384 · net48 2,384 모두 통과 · 확장 빌드 통과.

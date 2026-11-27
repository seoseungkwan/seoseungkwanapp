# google-link — 이 PC(윈도우)에서 원래 나는 실패

전체 시험(2026-11-26, feat-google-link 254afbf2, `npx vitest run --no-file-parallelism`): 895 파일 · 45,294개 중 5개 실패. 넷은 이 기능과 상관없고, 하나(`tabFrame.test.tsx`)는 옛 목록 시험이라 TASK-23 (자)에서 고쳤다.

| 시험 | 기준(운영 a1b088de)에서 | 까닭 |
|---|---|---|
| `e2e/lib/envFile.test.ts` AC-005.2 둘(권한 600) | 같이 실패(admin-view 기록과 같음) | 윈도우는 파일 권한 600·644가 없다 |
| `e2e/lib/session.test.ts`(파일 통째) | 같이 실패(admin-view 기록과 같음) | e2e 경로·권한 — 한글 폴더 경로가 `%EC…`로 바뀌어 `C:\C:\…`가 된다 |
| `src/components/landing/rules.test.ts` AC-212.4·AC-420.3 | 같이 실패(admin-view 기록과 같음) | 윈도우 `\` 경로 |

tsc 0 오류 · lint 0 오류(경고 17, 모두 시험 파일의 쓰지 않는 `_` 이름·기준부터 있던 `docs/mockups/stats/app.js`·`supabase/revenue.rls.test.ts`) · build 통과 · 도우미 시험 net10 2,384 · net48 2,384 모두 통과 · 확장 빌드 통과.

## 2차 고침 (2026-11-26 밤, google-link-fix2 29954cf7)

전체 시험 `npx vitest run --no-file-parallelism`: 899 파일 · 45,605개 중 5개 실패. 넷은 위 표와 같다(envFile 둘·session·landing rules 둘).
남은 하나 `src/components/patients/PatientsEntry.test.tsx` AC-610.6은 이 기능이 건드리지 않은 파일(`git diff f3c61781 -- src/components/patients src/lib/bridge src/workers` 빔)이고 혼자 돌리면 69개 모두 통과 — PC가 바쁠 때 늦는 시험.
tsc 0 · lint 0 오류(경고 18, 시험 파일의 쓰지 않는 `_` 이름) · build 통과. 도우미·확장은 안 바뀜.

## 3차 고침 전체 시험 (2026-11-27 아침, REQ-8554 합친 뒤)
- tsc·lint·build 통과. vitest 900파일 가운데 3파일·4시험 실패 = 2차 기록과 같은 이 PC 원래 실패(e2e/lib/envFile 권한 600 둘, e2e/lib/session 파일, landing rules.test 둘). 이번 고침 파일과 관계없음. 45,708 통과.

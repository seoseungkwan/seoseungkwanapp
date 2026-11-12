# 이 PC(윈도우)에서 실패하는 시험 기록 — group-exclude·rx-split-new 변경과 상관없음 (2026-11-12)

- 전체 실행(`npx vitest run --no-file-parallelism`, 28c1361): 390개 파일 중 23개 실패, 시험 41개 실패.
- 기준 c212fdd(운영 = origin/feat-dashboard-saved)의 임시 작업 폴더에서 실패한 22개 파일만 다시 돌렸다. 결과는 22개 파일 실패, 시험 40개 실패였다. 실패한 시험 이름을 하나씩 견주니 같았다.
- 이번 판에만 있던 실패는 1개다. 새 파일 `supabase/statsRxGroupsExclude.rls.test.ts`의 AC-3701.7이다. 원인은 CRLF 작업 사본에서 `split('\n')`을 쓴 것이고, 5460a5f에서 고쳤다(그 뒤 114/114).
- 나머지 원인은 이전 기록(`specs/dashboard-ux/known-failures.md`, `specs/reception-pick-lists/known-failures.md`)과 같다.
  - CRLF 줄 끝: `*.rls.test.ts`의 lineAfter 등과 골든 파일
  - 윈도우 경로 `\`: landing `rules.test`
  - 파일 권한 600
  - `npm` ENOENT: `extension/src/manifest.test.ts`
  - e2e 도구 시험

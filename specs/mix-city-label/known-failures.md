# 이 PC(윈도우)에서 실패하는 시험 기록 — mix-city-label 변경과 상관없음 (2026-11-13)

- 전체 실행(`npx vitest run --no-file-parallelism`): 파일 390개 중 22개 실패, 시험 40개 실패.
- 실패한 시험 이름을 group-exclude 끝 실행(28c1361, `specs/group-exclude/known-failures.md`)의 목록과 하나씩 견줬다.
  - 새로 생긴 실패는 없다.
  - 그때 있던 AC-3701.7 하나는 5460a5f에서 이미 고쳐서 이번 목록에 없다.
- `patientMix` 시험은 실패 목록에 없다(73개 통과).
- `tsc`, `npm run build`는 통과했다. `npm run lint`는 오류 0, 경고 2이고, 경고는 손대지 않은 파일(`docs/mockups/stats/app.js`, `supabase/revenue.rls.test.ts`)에 있다.

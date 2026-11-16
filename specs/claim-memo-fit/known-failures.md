# 이 PC(윈도우)에서 원래 나는 실패 — claim-memo-fit 마지막 검사 (2026-11-16)

전체 `npx vitest run --no-file-parallelism`: 9개 실패 가운데 5개는 이 기능 것(간격 단계 2 · 시험 중 파일 고침 3)이라 고친 뒤 다시 돌려 통과(28 파일 1886 통과).
나머지 4 파일은 기준 커밋 5e10b98에서도 똑같이 실패한다(이 기능과 무관):

- e2e/lib/envFile.test.ts AC-005.2 두 개 — 윈도우 파일 권한 600
- e2e/lib/session.test.ts — 파일째 실패(e2e 환경)
- extension/src/manifest.test.ts AC-003.8 — npm ENOENT
- src/components/landing/rules.test.ts AC-212.4·AC-420.3 — `\` 경로

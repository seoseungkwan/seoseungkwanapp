# 이 PC(윈도우)에서 원래 나는 시험 실패 — calendar-colors 마지막 전체 검사(2026-11-17)

전체 vitest: 477파일 중 4파일·4시험 실패, 28,977 통과(6 건너뜀). 기준 dbfd17bc(운영 판, clinic-calendar known-failures.md)와 같은 네 파일·네 시험이라 이 기능 탓이 아니다.

- e2e/lib/envFile.test.ts — AC-005.2 파일 권한 600(윈도우 권한 모델)
- e2e/lib/session.test.ts — 파일 단위 실패(윈도우 권한)
- extension/src/manifest.test.ts — AC-003.8 npm을 셸 없이 부름(spawnSync npm ENOENT)
- src/components/landing/rules.test.ts — AC-212.4·AC-420.3 경로 구분자 `\`

tsc·lint(경고 2, 기존)·build는 통과. 도우미(helper/)는 바꾸지 않아 dotnet은 돌리지 않았다.

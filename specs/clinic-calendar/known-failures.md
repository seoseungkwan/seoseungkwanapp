# 이 PC(윈도우)에서 원래 나는 시험 실패 — clinic-calendar 마지막 전체 검사(2026-11-17)

전체 vitest: 477파일 중 4파일·4시험 실패, 28,916 통과. 모두 기준(63fa0e8c 운영 판, 그 앞 nav-worklog 전체 검사)에서도 같은 실패라 이 기능 탓이 아니다.

- e2e/lib/envFile.test.ts — AC-005.2 파일 권한 600(윈도우 권한 모델)
- e2e/lib/session.test.ts — 파일 단위 실패(윈도우 권한)
- extension/src/manifest.test.ts — AC-003.8 npm을 셸 없이 부름(spawnSync npm ENOENT)
- src/components/landing/rules.test.ts — AC-212.4·AC-420.3 경로 구분자 `\`

tsc·lint(경고 2, 기존)·build·dotnet net10.0 2,044개는 모두 통과.

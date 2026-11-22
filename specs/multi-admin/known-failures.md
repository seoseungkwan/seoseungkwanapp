# 이 PC(윈도우)에서 원래 나는 시험 실패 — multi-admin 마지막 전체 검사(2026-11-22, TASK-7)

전체 vitest(2341a597, `--no-file-parallelism`, 43분): 677파일 중 4파일·21시험 실패, 37,336 통과.

## 기준(1b373174 = `git merge-base HEAD origin/feat-dashboard-saved` = 합친 운영 판)에서도 같은 실패 — 이 기능 탓이 아니다
기준에서 이 네 파일만 다시 돌려 같은 21개가 똑같이 실패했다.
- e2e/lib/envFile.test.ts — AC-005.2 파일 권한 600 두 시험(윈도우 권한 모델)
- e2e/lib/session.test.ts — 파일 단위 실패(윈도우 권한)
- src/components/landing/rules.test.ts — AC-212.4·AC-420.3 경로 구분자 `\`
- helper/tests/input-replace.dotnet.test.ts — C# `Precheck.Core.Tests.Input` 714개 중 하나가 실패해(꼬리 60줄에 이름이 안 나옴) 감싸개 열일곱(AC-037.1~8·AC-017.12·AC-035.2·5·8·9·AC-6611.2~5)이 함께 실패. 가끔 나는 실패다: 바로 뒤에 이 파일만 다시 돌리면 24개 모두 통과했고, `dotnet test --filter Precheck.Core.Tests.Input`도 714개 모두 통과했다. 도우미는 이 기능에서 바꾸지 않았다.

tsc·lint(경고 2, 기존 docs/mockups/stats/app.js·supabase/revenue.rls.test.ts)·build 모두 통과. `dotnet test helper/tests/Precheck.Core.Tests -f net10.0` 2,169개 모두 통과. 도우미·확장은 고치지 않아 net48·확장 빌드는 돌리지 않았다.
`sdd status multi-admin`: AC 29개 모두 시험과 이어졌고 최근 결과 GREEN.

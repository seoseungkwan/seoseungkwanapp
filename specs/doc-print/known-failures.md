# 이 PC(윈도우)에서 원래 나는 시험 실패 — doc-print 마지막 검사(2026-11-20)

기준 e0f39a62(feat-pt-slip, 서류 작업 전)에서도 똑같이 실패하는 것만 적는다.

| 시험 파일 | 까닭 |
|---|---|
| e2e/lib/envFile.test.ts | 윈도우 파일 권한(600) |
| e2e/lib/session.test.ts | e2e 환경 |
| extension/src/manifest.test.ts | AC-003.8 npm ENOENT |
| src/components/landing/rules.test.ts | `\` 경로 |

- helper/tests/contact-store.dotnet.test.ts는 전체 돌리기에서 한 번 실패, 혼자 두 번 돌리면 통과(net10 WorkLock 가끔)
- C# 2302개 net10·net48 모두 통과, PtSlip Release 경고 0

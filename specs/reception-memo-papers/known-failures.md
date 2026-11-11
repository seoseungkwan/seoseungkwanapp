# 이 PC에서 원래 나는 실패 (2026-11-11, d5ff6d5)

전체 시험(`npx vitest run --no-file-parallelism`): 21311 통과 · 60 실패(24 파일). 기준 f9d83a5에서 같은 파일을 돌리면 23 파일이 똑같이 실패한다(이 기능과 상관없음: 웹사이트·로그인·RLS·랜딩 규칙 시험의 윈도우 경로·줄 끝·권한 문제).

- 기준과 다른 하나: `helper/tests/stats-rows.dotnet.test.ts` — `EPERM mkdir precheck-dotnet.lock.takeover`(검토 일꾼이 dotnet을 동시에 돌려 잠금 다툼). 기준에서는 통과. 이 기능은 통계 코드를 고치지 않았다
- 이 기능이 고친 접수 현황·도우미·울타리 시험은 모두 통과

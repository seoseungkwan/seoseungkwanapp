# 작업 분할: 데스크 계정 비트 PC 연결 (desk-setup)

> 형식: `## TASK-n: 제목` 아래에 `- Phase:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위 — 바뀌는 옛 시험 파일 포함), `- Tests:`, `- TDD: required|exempt`.
> 기준 갈래 `feat-desk-setup`(운영 `dd367e1c`에서). 같은 Phase의 TASK는 파일이 겹치지 않는다. 검토는 마지막 한 번.
> 일꾼 셋: ① TASK-2 ② TASK-3 → TASK-4(같은 일꾼이 차례로 — `shell.test.tsx`를 둘 다 고친다) ③ TASK-5 → TASK-6(같은 일꾼이 차례로).
>
> | Phase | TASK (동시에) |
> |---|---|
> | 0 | TASK-1 시안(끝남, 승인 2026-11-19) |
> | 1 | TASK-2 설치 파일 규칙·ADR · TASK-3 문지기·연결 화면 · TASK-5 수납일지 안내 칸 |
> | 2 | TASK-4 계정 메뉴(TASK-3 다음) · TASK-6 업무일지 안내(TASK-5 다음) |

## TASK-1: 시안과 결정 기록
- Phase: 0
- AC: AC-7002.1, AC-7003.1, AC-7004.1, AC-7004.2
- REQ: REQ-7002, REQ-7003, REQ-7004
- Files: docs/mockups/desk-setup/index.html, docs/mockups/desk-setup/notes.md
- Tests: 없음
- TDD: exempt — 클릭 시안(지어낸 이름)과 사용자 결정 기록 문서다. 2026-11-19 "이대로 만들기"로 승인됐다. 시안에 없던 두 장면(연결 끝 줄·busy 카드, 업무일지 링크)은 2026-11-19 사용자 "네, 둘 다"로 requirements에 적었다.

## TASK-2: 설치 파일 읽기 규칙에 데스크 더하기 (SQL) · 결정 기록
- Phase: 1
- AC: AC-7005.1, AC-7005.2, AC-7005.3, AC-7005.4, AC-7007.1
- REQ: REQ-7005, REQ-7007
- Files: supabase/migrations/20261119200000_desk_install_files.sql, supabase/deskInstallFiles.rls.test.ts, docs/ADR.md, src/lib/storage/installFiles.ts, src/components/install/DownloadButton.tsx
- Tests: supabase/deskInstallFiles.rls.test.ts
- TDD: required — design.md 6·6-2·7절. 새 시험 파일이 PGlite에 auth와 desk_accounts.sql 머리 주석의 앞 migration들, install_files.sql, desk_accounts.sql, 이 파일을 차례로 돌린다(storage 흉내는 installFiles.rls.test.ts, 앞 migration 목록은 desk.rls.test.ts를 따라 쓴다). 파일이 없으면 시험마다 실패(RED). AC-7007.1은 같은 시험 파일에서 `docs/ADR.md` ADR-031 글을 읽어 확인한다. installFiles.ts·DownloadButton.tsx는 머리 주석만 고친다. 옛 installFiles.rls.test.ts·desk.rls.test.ts는 고치지 않고 통과해야 한다.

## TASK-3: 문지기·연결 화면 (데스크도 /claim/setup)
- Phase: 1
- AC: AC-7001.1, AC-7001.2, AC-7001.3, AC-7002.1, AC-7002.2
- REQ: REQ-7001, REQ-7002
- Files: src/components/shell/menu.ts, src/components/shell/DeskGate.test.tsx, src/components/shell/shell.test.tsx, src/app/(app)/claim/setup/page.tsx, src/app/(app)/claim/setup/page.test.tsx, src/components/claim/setup/SetupScreen.tsx, src/components/claim/setup/SetupScreen.test.tsx
- Tests: src/components/shell/DeskGate.test.tsx, src/components/shell/shell.test.tsx, src/app/(app)/claim/setup/page.test.tsx, src/components/claim/setup/SetupScreen.test.tsx
- TDD: required — design.md 1~3절. 바뀌는 옛 시험: DeskGate.test.tsx 막힌 주소 목록(`/claim/setup` 뺌), shell.test.tsx 데스크 주소 거짓 목록(`/claim/setup`을 참 쪽으로 — 이 TASK는 shell.test.tsx의 isDeskPath 부분만 고친다), page.test.tsx 옛 AC-6305.4 '데스크면 아무것도 그리지 않는다'(→ AC-7001.3, returnTo 없음). SetupScreen 데스크 시험은 RoleProvider desk로 감싼다(제목·안쪽 메뉴 없음·준비됨 줄 글과 [수납일지로 가기]·busy 카드 [건수만 보기] 없음, 원장 그대로). first-run page 시험은 고치지 않고 통과해야 한다.

## TASK-4: 데스크 계정 메뉴 [비트 PC 연결]
- Phase: 2
- AC: AC-7003.1, AC-7003.2
- REQ: REQ-7003
- Files: src/components/shell/AccountMenu.tsx, src/components/shell/shell.test.tsx
- Tests: src/components/shell/shell.test.tsx
- TDD: required — design.md 4절. TASK-3 다음(같은 일꾼). 바뀌는 옛 시험: shell.test.tsx 데스크 메뉴 시험(항목 [로그아웃] 하나·링크 없음 → [비트 PC 연결]·[로그아웃], 링크 하나 `/claim/setup`). 누르면 닫힘, 원장·관리자 메뉴에는 없음.

## TASK-5: 수납일지 안내 칸 단추
- Phase: 1
- AC: AC-7004.1, AC-7004.2, AC-7004.3
- REQ: REQ-7004
- Files: src/components/sunap/RemoteView.tsx, src/components/sunap/RemoteView.test.tsx
- Tests: src/components/sunap/RemoteView.test.tsx
- TDD: required — design.md 5절. 까닭 셋(device·old-helper·old-day)마다 한 줄·단추 있음/없음, 링크 주소 `/claim/setup`. SunapScreen.test.tsx는 고치지 않고 통과해야 한다.

## TASK-6: 업무일지 비트 안내 [연결하러 가기] 데스크에게도
- Phase: 2
- AC: AC-7006.1
- REQ: REQ-7006
- Files: src/components/worklog/BitNotice.tsx, src/components/worklog/BitNotice.test.tsx
- Tests: src/components/worklog/BitNotice.test.tsx
- TDD: required — design.md 5-2절. TASK-5 다음(같은 일꾼). 바뀌는 옛 시험: BitNotice.test.tsx 옛 AC-6306.4 '데스크면 링크가 없다'(→ AC-7006.1 데스크도 링크 `/claim/setup`). WorklogScreen.test.tsx는 고치지 않고 통과해야 한다.

# 작업 분할: 데스크 계정 비트 PC 연결 (desk-setup)

> 형식: `## TASK-n: 제목` 아래에 `- Phase:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위 — 바뀌는 옛 시험 파일 포함), `- Tests:`, `- TDD: required|exempt`.
> 기준 갈래 `feat-desk-setup`(운영 `dd367e1c`에서). Phase 1의 TASK는 파일이 겹치지 않는다(일꾼 셋: TASK-2 / TASK-3 / TASK-4·TASK-5 차례로). 검토는 마지막 한 번.

## TASK-1: 시안과 결정 기록
- Phase: 0
- AC: AC-7002.1, AC-7003.1, AC-7004.1, AC-7004.2
- REQ: REQ-7002, REQ-7003, REQ-7004
- Files: docs/mockups/desk-setup/index.html, docs/mockups/desk-setup/notes.md
- Tests: 없음
- TDD: exempt — 클릭 시안(지어낸 이름)과 사용자 결정 기록 문서다. 2026-11-19 "이대로 만들기"로 승인됐다.

## TASK-2: 설치 파일 읽기 규칙에 데스크 더하기 (SQL)
- Phase: 1
- AC: AC-7005.1, AC-7005.2, AC-7005.3, AC-7005.4
- REQ: REQ-7005
- Files: supabase/migrations/20261119200000_desk_install_files.sql, supabase/deskInstallFiles.rls.test.ts
- Tests: supabase/deskInstallFiles.rls.test.ts
- TDD: required — design.md 6·7절. 새 시험 파일이 PGlite에 auth와 desk_accounts.sql 머리 주석의 앞 migration들, install_files.sql, desk_accounts.sql, 이 파일을 차례로 돌린다(storage 흉내는 installFiles.rls.test.ts, 앞 migration 목록은 desk.rls.test.ts를 따라 쓴다). 파일이 없으면 시험마다 실패(RED). 옛 installFiles.rls.test.ts·desk.rls.test.ts는 고치지 않고 통과해야 한다.

## TASK-3: 문지기·연결 화면 (데스크도 /claim/setup)
- Phase: 1
- AC: AC-7001.1, AC-7001.2, AC-7001.3, AC-7002.1, AC-7002.2
- REQ: REQ-7001, REQ-7002
- Files: src/components/shell/menu.ts, src/components/shell/DeskGate.test.tsx, src/app/(app)/claim/setup/page.tsx, src/app/(app)/claim/setup/page.test.tsx, src/components/claim/setup/SetupScreen.tsx, src/components/claim/setup/SetupScreen.test.tsx
- Tests: src/components/shell/DeskGate.test.tsx, src/app/(app)/claim/setup/page.test.tsx, src/components/claim/setup/SetupScreen.test.tsx
- TDD: required — design.md 1~3절. page.test.tsx의 옛 AC-6305.4 '데스크면 아무것도 그리지 않는다' 시험을 AC-7001.3(데스크 병원 이름으로 SetupScreen)으로 바꾼다. SetupScreen 데스크 시험은 RoleProvider desk로 감싼다. shell.test.tsx·first-run page 시험의 isDeskPath·DESK_MENU 기대는 고치지 않고 통과해야 한다.

## TASK-4: 데스크 계정 메뉴 [비트 PC 연결]
- Phase: 1
- AC: AC-7003.1, AC-7003.2
- REQ: REQ-7003
- Files: src/components/shell/AccountMenu.tsx, src/components/shell/shell.test.tsx
- Tests: src/components/shell/shell.test.tsx
- TDD: required — design.md 4절. 데스크 메뉴 항목 차례([비트 PC 연결] → [로그아웃]), 누르면 닫힘, 원장·관리자 메뉴에는 없음.

## TASK-5: 수납일지 안내 칸 단추
- Phase: 1
- AC: AC-7004.1, AC-7004.2, AC-7004.3
- REQ: REQ-7004
- Files: src/components/sunap/RemoteView.tsx, src/components/sunap/RemoteView.test.tsx
- Tests: src/components/sunap/RemoteView.test.tsx
- TDD: required — design.md 5절. 까닭 셋(device·old-helper·old-day)마다 한 줄·단추 있음/없음, 링크 주소 `/claim/setup`. SunapScreen.test.tsx는 고치지 않고 통과해야 한다.

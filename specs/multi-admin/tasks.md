# 작업 분할: 관리자 여럿 · 주 관리자 · 관리자만 보는 탭 (multi-admin)

> 형식: `## TASK-n: 제목` 아래에 `- Phase:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 고친다. TASK마다 일꾼 하나(각자 git worktree). **같은 Phase는 병렬이고 같은 Phase의 TASK끼리 파일이 겹치지 않는다.** Phase 1은 명세 승인 뒤, 다음 Phase는 앞 Phase를 합친 뒤 시작한다.
> MVP 모드: 중간 검토 없이 Phase 끝마다 그 Phase 시험 파일만 돌리고, 마지막에 전체 검사 → 독립 검토 한 번(재검토는 사용자에게 묻고).
> 화면 글자·자리·모양은 승인된 시안(`docs/mockups/multi-admin/index.html`·`settings.html`·`notes.md`, 2026-11-22 "이대로 만들기", 커밋 e9c87ca3)과 requirements.md '화면 글자' 그대로다. **폰 전용 모양은 만들지 않는다**(사용자 규칙 2026-11-21, requirements.md 이미 정한 것 6).
>
> | Phase | TASK | 하는 일 |
> |---|---|---|
> | 1 | TASK-1 | DB: 관리자 함수 둘 · 주 관리자 · `tab_access` 표와 `set_tab_access` (SQL 하나) + RLS 시험 + ADR-041·042 · ARCHITECTURE · plan.md · CLAUDE.md 한 줄 |
> | 1 | TASK-2 | 관리자 브라우저 함수 둘(`lib/auth/admin.ts`, 주 관리자 표시 포함) + 오류 번호 `E-ADMIN-ROLE` |
> | 1 | TASK-3 | 탭 목록 함수: `menu.ts` 순수 함수 · 서버 읽기(`tabAccess.server.ts`) · 브라우저 읽기·저장(`lib/storage/tabAccess.ts`) |
> | 2 | TASK-4 | 가입 승인 화면 '승인' 탭: 관리자·주 관리자 표·줄 단추·확인 창 둘·끝 알림·실패 카드 + UI_GUIDE |
> | 2 | TASK-5 | 앱 틀: 레이아웃이 숨긴 탭을 읽어 넘김 · 탭 띠·[더보기]에서 빼기 · `TabGate` 돌려보내기 · `DeskGate` 첫 화면 |
> | 2 | TASK-6 | 설정 맨 아래 '관리자만 보는 탭' 칸(주 관리자만) |
> | 3 | TASK-7 | 전체 검사 · 화면 확인 → 독립 검토 한 번 |
>
> - 같은 Phase 파일 겹침 확인(2026-11-22):
>   - Phase 1 — TASK-1은 `supabase/`·`docs/ADR.md`·`docs/ARCHITECTURE.md`·`plan.md`·`CLAUDE.md`, TASK-2는 `src/lib/auth/admin*`·`src/types/errors.ts`·`src/lib/errors*`, TASK-3은 `src/components/shell/menu.ts`·`src/components/shell/tabAccess.test.ts`·`src/lib/auth/tabAccess.server*`·`src/lib/storage/tabAccess*` → 겹침 없음. 셋 다 서로를 쓰지 않는다(코드 시험은 Supabase를 흉내 낸다).
>   - Phase 2 — TASK-4는 `src/components/admin/`·`src/components/ui/classes.test.ts`·`docs/UI_GUIDE.md`, TASK-5는 `src/app/(app)/layout*`·`src/components/shell/`의 정해 둔 파일(menu.ts 빼고), TASK-6은 `src/components/settings/`의 정해 둔 파일·`src/app/(app)/settings/page.test.tsx` → 겹침 없음. TASK-4는 TASK-2 것, TASK-5·TASK-6은 TASK-3 것을 쓰고 고치지 않는다. `classes.test.ts`는 TASK-4만 고친다 — TASK-5·TASK-6은 그 시험을 돌려 보기만 한다(새 파일이 AC-204.6 규칙 검사에 저절로 든다).
> - 고치지 않는 것: `src/app/(app)/admin/page.tsx`·`page.test.tsx`, `src/app/(app)/settings/page.tsx`, `src/app/(app)/currentMe.server.ts`, `src/lib/auth/gate.ts`·`guard.server.ts`·`hospital.server.ts`, `src/middleware.ts`, `src/components/shell/AccountMenu.tsx`·`role.tsx`·`NoticeBadge.tsx`, 다른 설정 칸 파일(`DeskAccounts.tsx` 등), 대시보드·브리핑 파일, `supabase/first-admin.sql`, 앞 migration 파일들, `src/components/admin/InstallFilesAdmin*`.
> - 다른 갈래와 겹칠 수 있는 파일: `CLAUDE.md`·`docs/ADR.md`(번호 040은 다른 갈래, 이 일은 041·042)·`docs/ARCHITECTURE.md`·`plan.md`, `src/types/errors.ts`·`src/lib/errors.ts`·`src/lib/errors.test.ts`, `docs/UI_GUIDE.md`, `src/components/ui/classes.test.ts`, `src/components/shell/menu.ts`·`AppShell.tsx`·`TabBar.tsx`·`MoreMenu.tsx`, `src/app/(app)/layout.tsx`, `src/components/settings/SettingsPage.tsx`. 합칠 때 앞 갈래를 먼저 받고 번호·목록만 맞춘다.
> - **사용자 단계**: (1) `/sdd approve multi-admin` — `CLAUDE.md` 인증 예외 한 줄을 바꾸는 것(design.md '문서 줄')도 이 승인에 든다. (2) 모두 합친 뒤 배포 전 `supabase/migrations/20261122000000_multi_admin.sql`을 Supabase SQL Editor에 붙여 넣기(SQL 먼저, 웹 다음 — design.md '배포 순서'). 멈추면 그 글을 Claude에게 알린다. Claude는 실제 Supabase에 붙지 않는다. **배포·합치기(운영 갈래)는 사용자가 말할 때만** 한다. 도우미·확장 새 판은 없다.

## TASK-1: DB — 관리자 함수 · 주 관리자 · 관리자만 보는 탭 표 · 문서
- Phase: 1
- AC: AC-7701.1, AC-7701.2, AC-7701.3, AC-7701.4, AC-7701.5, AC-7705.1, AC-7705.2, AC-7705.3, AC-7705.4
- REQ: REQ-7701, REQ-7705
- Files: supabase/migrations/20261122000000_multi_admin.sql, supabase/multiAdmin.rls.test.ts, docs/ADR.md, docs/ARCHITECTURE.md, plan.md, CLAUDE.md
- Tests: supabase/multiAdmin.rls.test.ts
- TDD: required — design.md 'DB'·'시험 계획'. SQL은 Write 도구로 쓴다(머리 주석 모양은 `20261119400000_hospital_emr.sql`, 차례 ①~⑦과 오류 글은 design.md 그대로, 두 번 실행 안전, `hospitals` 표·정책과 `admins` 정책·표 권한은 건드리지 않음, `admins`에 정책을 더하지 않음 — 무한 되부름). 시험은 `setup-sql.test.ts`의 Supabase 흉내(`auth.users`에 `email`·`raw_app_meta_data`)를 옮겨 PGlite에서 `20261028000000_auth.sql` → 사용자·병원·`admins`(주 관리자 후보 하나) → 이 파일 → 이 파일 차례로 돌린다(파일이 없으면 시험마다 실패 = RED, `desk.rls.test.ts`의 `existsSync` 방식). 후보 0개·2개 시험은 새 PGlite에서 돌려 칸·표·함수가 생기지 않았는지 본다. 옛 RLS 시험(`rls.test.ts`·`setup-sql.test.ts`·`installFiles.rls.test.ts`·`notices.rls.test.ts` 등)은 고치지 않고 지나야 한다. 메일·병원 이름은 모두 지어낸 것. 문서는 `docs/ADR.md` 끝에 design.md 'ADR-041'·'ADR-042' 글, `docs/ARCHITECTURE.md`·`plan.md`·`CLAUDE.md`는 design.md '문서 줄'의 줄만(`CLAUDE.md`는 그 한 줄 말고 고치지 않는다 — `b2b-merge.test.ts`·`inventoryDocs.test.ts`의 문서 시험도 지나야 한다). **실제 Supabase에 붙여 넣지 않는다**

## TASK-2: 관리자 브라우저 함수·오류 번호
- Phase: 1
- AC: AC-7702.1, AC-7702.2, AC-7702.3
- REQ: REQ-7702
- Files: src/lib/auth/admin.ts, src/lib/auth/admin.test.ts, src/types/errors.ts, src/lib/errors.ts, src/lib/errors.test.ts
- Tests: src/lib/auth/admin.test.ts, src/lib/errors.test.ts
- TDD: required — design.md '관리자 브라우저 함수'·'오류 번호'. 본보기는 같은 파일의 `setHospitalStatus`(가짜 `supabaseBrowser`로 `rpc` 이름·인자·횟수를 그대로 견준다). `AdminMark`는 `{ hospitalId, mine, owner }`. `listApplications`·`setHospitalStatus`·`Application`·`AdminError`는 고치지 않는다. `E-ADMIN-ROLE` 글은 design.md 표 글자 그대로(시안 `notes.md`). `errors.test.ts`는 `ALL_CODES`·`AUTH_CODES`에 한 줄씩과 글 시험 하나만 더한다. 화면 파일은 고치지 않는다(TASK-4)

## TASK-3: 탭 목록 함수 — 순수 함수 · 서버 읽기 · 브라우저 읽기·저장
- Phase: 1
- AC: AC-7706.1, AC-7706.2, AC-7707.1
- REQ: REQ-7706, REQ-7707
- Files: src/components/shell/menu.ts, src/components/shell/tabAccess.test.ts, src/lib/auth/tabAccess.server.ts, src/lib/auth/tabAccess.server.test.ts, src/lib/storage/tabAccess.ts, src/lib/storage/tabAccess.test.ts
- Tests: src/components/shell/tabAccess.test.ts, src/lib/auth/tabAccess.server.test.ts, src/lib/storage/tabAccess.test.ts
- TDD: required — design.md '탭 목록 함수'. `menu.ts`에는 더하기만 한다(`MENU` 항목 모양·`PRIMARY_MENU`·`MORE_MENU`·`DESK_MENU`·`DESK_HOME`·`currentMenuLabel`·`isDeskPath` 그대로 — 지금 `shell.test.tsx`·`tabFrame.test.tsx`·`DeskGate.test.tsx`를 고치지 않고 돌려 지나야 한다). `isHiddenPath`는 `currentMenuLabel`과 같은 '가장 길게 맞는 자리' 규칙. 서버 읽기는 `hospital.server.ts`와 같은 모양(첫 줄 `import 'server-only'`, 가짜 `supabaseServer`로 시험 — `hospital.server.test.ts` 본보기), 쓰지 않는다. 브라우저 함수는 `lib/storage/desk.ts`·`lib/auth/admin.ts` 본보기(가짜 `supabaseBrowser`). 이 TASK는 앱 틀·화면을 고치지 않는다(레이아웃 연결은 TASK-5, 설정 칸은 TASK-6)

## TASK-4: '승인' 탭 화면 — 관리자·주 관리자 표·줄 단추·확인 창·끝 알림·실패
- Phase: 2
- AC: AC-7703.1, AC-7703.2, AC-7703.3, AC-7703.4, AC-7704.1, AC-7704.2, AC-7704.3, AC-7704.4
- REQ: REQ-7703, REQ-7704
- Files: src/components/admin/AdminApplications.tsx, src/components/admin/AdminApplications.test.tsx, src/components/admin/applications.ts, src/components/admin/applications.test.ts, src/components/admin/ConfirmDialog.tsx, src/components/ui/classes.test.ts, docs/UI_GUIDE.md
- Tests: src/components/admin/AdminApplications.test.tsx, src/components/admin/applications.test.ts, src/components/ui/classes.test.ts
- TDD: required — design.md의 '승인' 탭 화면 절·'시험 계획'(지금 시험에서 바뀌는 곳), 시안 `index.html`(상태 list·other·add·remove·done·removed·error)과 `notes.md` '모양 결정'·'칸 폭'을 열어 견준다. Phase 1을 합친 뒤 시작한다(`listAdminHospitals`·`setAdmin`·`AdminMark`·`E-ADMIN-ROLE`은 TASK-2 것을 쓰고 고치지 않음). 확인 창은 지금 `RejectDialog`를 넓힌 부품 하나로(같은 파일에 두거나 `ConfirmDialog.tsx`로 옮김 — 옮기지 않으면 그 파일은 만들지 않는다). 시험: INTRO 글자, 두 목록을 한 번씩 읽고 둘 다 온 뒤 그림·하나라도 실패면 던짐, 주 관리자가 볼 때(내 줄 `주 관리자` 표 + `내 계정`·다른 관리자 [관리자 빼기]·나머지 [관리자로 정하기])와 다른 관리자가 볼 때(주 관리자 줄 `주 관리자` 표 + 빈칸·내 줄 `관리자` 표 + `내 계정`), 표는 `ds.chip.accent`·이름만 말줄임, '승인됨' 칩 없음, 대기·거절 줄 그대로, 두 창의 글·처음 초점 [취소]·Esc·Tab 돌기·빈 곳 누름, [취소] 뒤 초점, 확인 뒤 `set_admin` 한 번·보내는 동안 단추 막힘·줄 표시 바뀜·끝 알림 둘·초점 지금 탭·다시 읽지 않음, 실패 카드 `E-ADMIN-ROLE`(원래 글 없음)·초점 누른 단추·다시 해서 됨, 탭 바꾸면 지움, 새 요소에 새 `max-md:` 없음·세 창 클래스가 같음, 동작 칸 768~1023px 150px. 지금 시험 가운데 이 명세 때문에 깨지는 곳만 고친다(design.md 목록). `classes.test.ts`는 관리자 화면 시험의 `rpc` 흉내 한 곳만. `docs/UI_GUIDE.md`는 design.md의 '관리자'·칩 표 줄만. `page.tsx`·`page.test.tsx`·`InstallFilesAdmin*`은 고치지 않는다

## TASK-5: 앱 틀 — 숨긴 탭 읽어 넘기기 · 메뉴에서 빼기 · 주소 돌려보내기
- Phase: 2
- AC: AC-7706.2, AC-7706.3, AC-7706.4
- REQ: REQ-7706
- Files: src/app/(app)/layout.tsx, src/app/(app)/layout.test.tsx, src/components/shell/AppShell.tsx, src/components/shell/TabBar.tsx, src/components/shell/MoreMenu.tsx, src/components/shell/DeskGate.tsx, src/components/shell/DeskGate.test.tsx, src/components/shell/TabGate.tsx, src/components/shell/TabGate.test.tsx, src/components/shell/hiddenTabs.test.tsx, src/components/shell/shell.test.tsx
- Tests: src/app/(app)/layout.test.tsx, src/components/shell/TabGate.test.tsx, src/components/shell/DeskGate.test.tsx, src/components/shell/hiddenTabs.test.tsx, src/components/shell/shell.test.tsx
- TDD: required — design.md '앱 틀'·'시험 계획'·기본값 18~23. Phase 1을 합친 뒤 시작한다(`TAB_ACCESS_MENU`·`adminOnlyTabs`·`isHiddenPath`·`deskHomeOf`·`readTabAccessRows`는 TASK-3 것을 쓰고 `menu.ts`·`tabAccess.server.ts`는 고치지 않음). 새 prop(`hiddenTabs`·`hidden`)은 모두 선택이고 없으면 지금과 같다 — 숨긴 탭이 없으면 `TabGate`를 그리지 않는다(`tabFrame.test.tsx`·`notReadyPages.test.tsx`·`staff.integration.test.tsx`·`classes.test.ts`가 `useRouter` 흉내 없이 `AppShell`을 그린다, 고치지 않고 지나야 한다). `layout.test.tsx`는 `@/lib/auth/tabAccess.server` 흉내를 더한다(기본값 = 씨앗 12줄 '모두에게' — 지금 시험이 그대로 지나게). `generateMetadata`는 목록을 읽지 않는다(`notFound.test.tsx`). 데스크 첫 화면은 `deskHomeOf`, 숨김이 없으면 `DeskGate`의 지금 시험은 그대로 지나야 한다. `shell.test.tsx`는 깨질 때만 고친다(새 시험은 `hiddenTabs.test.tsx`에). 돌려보내기는 글·알림 없이(requirements.md '화면 글자' 끝 줄)

## TASK-6: 설정 '관리자만 보는 탭' 칸
- Phase: 2
- AC: AC-7707.2, AC-7707.3, AC-7707.4, AC-7707.5
- REQ: REQ-7707
- Files: src/components/settings/TabAccessSettings.tsx, src/components/settings/TabAccessSettings.test.tsx, src/components/settings/SettingsPage.tsx, src/app/(app)/settings/page.test.tsx, src/components/settings/InstallFilesCard.test.tsx
- Tests: src/components/settings/TabAccessSettings.test.tsx, src/app/(app)/settings/page.test.tsx, src/components/settings/InstallFilesCard.test.tsx
- TDD: required — design.md '설정 칸'·'시험 계획'·기본값 24·25, 시안 `settings.html`(상태 owner·saved·error)과 `notes.md` '설정 새 칸'을 열어 견준다. Phase 1을 합친 뒤 시작한다(`readTabOwner`·`readTabAccess`·`saveTabAccess`·`TabAccessError`·`TAB_ACCESS_MENU`·`adminOnlyTabs`는 TASK-3 것을 쓰고 고치지 않음). 저장·알림·실패는 `DxLinks`와 같은 방식, 실패 번호는 지금 `E-SETTINGS-FAILED`(새 번호를 만들지 않는다). 칸은 `SettingsPage`의 `<DeskAccounts />` 바로 다음 줄. `settings/page.test.tsx`는 주 관리자 차림 시험 하나를 더하고 지금 시험(맨 아래 '데스크 계정' 등)은 주 관리자가 아닐 때로 그대로 지나야 한다. `InstallFilesCard.test.tsx`(칸 차례 시험)·`DeskAccounts.test.tsx`·`CashFloatSetting.test.tsx`는 고치지 않고 지나야 한다 — `InstallFilesCard.test.tsx`는 깨질 때만 새 칸 흉내 한 줄(다른 칸처럼)을 더한다. `classes.test.ts`는 돌려 보기만 한다(TASK-4 몫). 다른 설정 칸 파일은 고치지 않는다

## TASK-7: 마무리 — 전체 검사·화면 확인·독립 검토
- Phase: 3
- AC: AC-7703.3, AC-7703.4, AC-7704.1, AC-7706.3, AC-7706.4, AC-7707.3, AC-7707.5
- REQ: REQ-7703, REQ-7704, REQ-7706, REQ-7707
- Files: src/components/admin/AdminApplications.tsx, src/components/admin/AdminApplications.test.tsx, src/components/admin/applications.ts, src/components/admin/applications.test.ts, src/components/admin/ConfirmDialog.tsx, src/components/shell/TabGate.tsx, src/components/shell/TabGate.test.tsx, src/components/shell/TabBar.tsx, src/components/shell/MoreMenu.tsx, src/components/shell/hiddenTabs.test.tsx, src/components/settings/TabAccessSettings.tsx, src/components/settings/TabAccessSettings.test.tsx, specs/multi-admin/known-failures.md
- Tests: src/components/admin/AdminApplications.test.tsx, src/components/admin/applications.test.ts, src/components/shell/TabGate.test.tsx, src/components/shell/hiddenTabs.test.tsx, src/components/settings/TabAccessSettings.test.tsx
- TDD: exempt — 검사·확인·검토 단계다. 전체 검사(`npm test`·`npm run lint`·`npm run build`·`npx tsc --noEmit -p .`, ssk-finish-check — 이 PC에서 원래 나는 실패는 `specs/notices/known-failures.md`와 견주고, 이번 결과는 `specs/multi-admin/known-failures.md`에 적는다)와 화면 확인(ssk-screen-check: 로그인 없는 하네스, 가짜 병원 자료, PC 1440·1024만, 시안 `index.html`·`settings.html`의 같은 상태와 견줌, 숨긴 탭이 있는 원장 탭 띠·[더보기]도 찍음. 폰 폭 사진은 찍지 않는다). 그다음 독립 검토 한 번(코드를 주고 결론은 주지 않음). 고칠 것이 나오면 Files의 화면 파일만 고치고(고칠 때는 시험 먼저), 그 밖이면 명세를 고친 뒤 한다

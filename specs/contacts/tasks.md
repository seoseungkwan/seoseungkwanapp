# 작업 분할: 주소록

> 형식: `## TASK-n: 제목` 아래에 `- Phase:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 고친다. TASK마다 일꾼 하나(각자 git worktree). **같은 Phase는 병렬이고 같은 Phase의 TASK끼리 파일이 겹치지 않는다.** Phase 1은 명세 승인 뒤, 다음 Phase는 앞 Phase를 합친 뒤 시작한다.
> MVP 모드: 중간 검토 없이 Phase 끝마다 그 Phase 시험 파일만 돌리고, 마지막에 전체 검사 → 독립 검토 한 번(재검토는 사용자에게 묻고).
> 화면 글자·자리·모양은 승인된 시안(`docs/mockups/contacts/`, 2026-11-21)과 requirements.md '화면 글자' 그대로다. **폰 전용 모양은 만들지 않는다**(사용자 규칙 2026-11-21, requirements.md 이미 정한 것 18).
>
> | Phase | TASK | 하는 일 |
> |---|---|---|
> | 1 | TASK-1 | DB: 표 넷·넣기 함수 SQL + RLS 시험 + ADR-034·plan.md·ARCHITECTURE |
> | 1 | TASK-2 | 모양(`types/contacts.ts`)·순수 함수(`lib/contacts` — 칸 검사·글자 도움·머리글·넣을 계획·남은 날·찾기)·오류 번호 여덟 |
> | 2 | TASK-3 | 저장 함수 `lib/storage/contacts.ts` |
> | 2 | TASK-4 | 화면 부품 `components/contacts/parts`(목록·자세히·번호·가림·칸·판·확인 창·빈 주소록) |
> | 2 | TASK-5 | 엑셀 읽기 `workbook.ts` · 올리기 부품 `components/contacts/import` · 양식 파일과 되살리기 줄 |
> | 3 | TASK-6 | 대시보드 무상 수리 알림(읽기 훅·알림 줄·DashboardHome 자리) |
> | 3 | TASK-7 | 주소록 화면 잇기 · `/contacts` 페이지(`?c=`) · 메뉴 ready · 준비 중 빼기 |
> | 4 | TASK-8 | 전체 검사 · 화면 확인 → 독립 검토 한 번 |
>
> - 같은 Phase 파일 겹침 확인(2026-11-21): Phase 1 — TASK-1은 `supabase/`·`docs/ADR.md`·`docs/ARCHITECTURE.md`·`plan.md`, TASK-2는 `src/types/`·`src/lib/contacts/`(workbook·template 빼고)·`src/lib/errors*` → 겹침 없음. Phase 2 — TASK-3 `src/lib/storage/contacts*`, TASK-4 `src/components/contacts/parts/**`, TASK-5 `src/lib/contacts/workbook*`·`template.test.ts`·`src/components/contacts/import/**`·`public/contacts/`·`.gitignore`·`.vercelignore`·`src/vercel-config.test.ts`·`fixtures/make-fake-fixtures.test.ts` → 겹침 없음. Phase 3 — TASK-6 `src/components/dashboard/warranty/**`·`summary/LiveDashboard*`·`live/BitDashboard*`·`briefing/DashboardHome*`·`src/app/(app)/dashboard/page.test.tsx`, TASK-7 `src/components/contacts/` 맨 위 파일·`src/app/(app)/contacts/`·메뉴·준비 중·`briefing/features*`·고정 시험들·`docs/UI_GUIDE.md` → 겹침 없음(`DashboardHome.test.tsx`는 기능 수를 목록에서 세므로 TASK-7이 고치지 않는다).
> - Phase가 다를 때만 같은 폴더: `src/lib/contacts/`는 TASK-2(Phase 1)가 만들고 TASK-5(Phase 2)는 `workbook.ts`·`workbook.test.ts`·`template.test.ts`만 더한다. `src/components/contacts/`는 TASK-4 `parts/`·TASK-5 `import/`·TASK-7 맨 위 파일, TASK-8은 마무리 고침만.
> - TASK-6의 읽기 훅은 supabase를 다르게 흉내 내는 TASK-7 쪽 시험(`tabFrame.test.tsx`·`titles.test.tsx`)을 고치지 않고 지나야 한다(design.md '대시보드 알림'). Phase 3를 합친 뒤 그 둘이 깨지면 TASK-6의 훅을 고친다.
> - 다른 갈래와 겹칠 수 있는 파일: `docs/ADR.md`(번호 034), `src/lib/errors.ts`·`src/types/errors.ts`, 메뉴 고정 시험들, 대시보드 부품. 합칠 때 앞 갈래를 먼저 받고 번호·수만 맞춘다.
> - **사용자 단계**: (1) `/sdd approve contacts` (2) 모두 합친 뒤 배포 전 `supabase/migrations/20261121000000_contacts.sql`을 Supabase SQL Editor에 붙여 넣기(SQL 먼저, 웹 다음 — design.md '배포 순서'). Claude는 실제 Supabase에 붙지 않는다. **배포·합치기(운영 갈래)는 사용자가 말할 때만** 한다. 도우미·확장 새 판은 없다.

## TASK-1: DB — 표 넷·넣기 함수·ADR-034
- Phase: 1
- AC: AC-6501.1, AC-6501.2, AC-6501.3, AC-6501.4, AC-6501.5, AC-6501.6
- REQ: REQ-6501
- Files: supabase/migrations/20261121000000_contacts.sql, supabase/contacts.rls.test.ts, docs/ADR.md, docs/ARCHITECTURE.md, plan.md
- Tests: supabase/contacts.rls.test.ts
- TDD: required — design.md 'DB'(칸·제약·권한 표·넣기 함수). SQL은 Write 도구로 쓴다(두 번 실행 안전, 표마다 RLS → revoke → 필요한 권한만, `my_hospital_id()` 다시 만들지 않음, 데스크 정책 없음, 장비 겹침 제약 없음, 업체는 `on conflict` 없이 update → 없으면 insert, 장비는 `id`로 고침). 시험은 `supabase/calendar.rls.test.ts`·`desk.rls.test.ts`처럼 PGlite에서 진짜 migration 사슬을 차례로 돌린다(데스크 경우를 보려고 `20261118100000_desk_accounts.sql`까지). 업체·담당자 이름은 모두 지어낸 것. `docs/ADR.md` 끝에 design.md 'ADR-034' 글, `plan.md`는 §4 '서버로 가는 것'에 한 마디와 §5 DB 표 `clinic_profiles` 줄 다음에 `contacts_*` 한 줄, `docs/ARCHITECTURE.md`는 DB 표 한 줄만. **실제 Supabase에 붙여 넣지 않는다**

## TASK-2: 모양·순수 함수·오류 번호
- Phase: 1
- AC: AC-6503.1, AC-6503.2, AC-6503.3, AC-6503.4, AC-6503.5, AC-6503.6, AC-6503.7, AC-6503.8, AC-6503.9, AC-6503.10, AC-6503.11
- REQ: REQ-6503
- Files: src/types/contacts.ts, src/lib/contacts/categories.ts, src/lib/contacts/categories.test.ts, src/lib/contacts/fields.ts, src/lib/contacts/fields.test.ts, src/lib/contacts/korean.ts, src/lib/contacts/korean.test.ts, src/lib/contacts/sheet.ts, src/lib/contacts/sheet.test.ts, src/lib/contacts/plan.ts, src/lib/contacts/plan.test.ts, src/lib/contacts/warranty.ts, src/lib/contacts/warranty.test.ts, src/lib/contacts/search.ts, src/lib/contacts/search.test.ts, src/lib/contacts/source.test.ts, src/types/errors.ts, src/lib/errors.ts, src/lib/errors.test.ts
- Tests: src/lib/contacts/categories.test.ts, src/lib/contacts/fields.test.ts, src/lib/contacts/korean.test.ts, src/lib/contacts/sheet.test.ts, src/lib/contacts/plan.test.ts, src/lib/contacts/warranty.test.ts, src/lib/contacts/search.test.ts, src/lib/contacts/source.test.ts, src/lib/errors.test.ts
- TDD: required — design.md '모양'·'순수 함수'(검사 차례·장비 맞추기 포함)·'예'·'오류 번호'. 순수 함수만(시계를 읽지 않고 오늘을 받는다). 날짜는 `lib/analytics/dates.ts`(`parseDateCell`·`diffDays`·`addDays`)만, `lib/parsers`는 부르지 않는다. eslint 구역 목록은 고치지 않는다(`source.test.ts`가 구역 밖·순수함을 소스 글자로 본다). 머리글 상수는 requirements.md 이미 정한 것 10번 글자 그대로. 오류 여덟의 what·fix는 design.md '오류 번호' 표 글자 그대로

## TASK-3: 저장 함수
- Phase: 2
- AC: AC-6502.1, AC-6502.2, AC-6502.3, AC-6502.4
- REQ: REQ-6502
- Files: src/lib/storage/contacts.ts, src/lib/storage/contacts.test.ts
- Tests: src/lib/storage/contacts.test.ts
- TDD: required — design.md '저장 함수'. 본보기 `src/lib/storage/calendar.ts`(가짜 client로 보낸 표·칸·몸통을 그대로 견준다). 칸 검사는 TASK-2의 `…Problems`·`cleanText`를 쓴다(고치지 않음). `'duplicate'`는 업체·담당자만. 오류에 Supabase 문구·입력값(비밀번호·계좌 포함)이 들지 않는지 본다

## TASK-4: 화면 부품
- Phase: 2
- AC: AC-6505.1, AC-6505.2, AC-6505.3, AC-6505.4, AC-6505.5, AC-6505.6, AC-6505.7, AC-6505.8
- REQ: REQ-6505
- Files: src/components/contacts/parts/**
- Tests: src/components/contacts/parts/
- TDD: required — design.md '화면'의 공통·`parts/`, requirements.md '화면 글자'·시안 기본값 글자·모양 그대로(시안 `index.html`을 열어 견준다). props·콜백만(읽기·저장·Supabase·`lib/storage` 없음, 콜백은 `SaveResult`). 찾기·남은 날·칸 검사·글자 모양은 `lib/contacts`를 쓴다. 시험: 목록 묶음·차례·칩 수·찾은 글자·찾은 곳 줄·결과 없음, 자세히 차례·빈 줄 감춤·빈 칸 글, 번호(마우스 = 복사·1.6초 `복사했어요` / 터치 = `tel:`, `matchMedia` 흉내 — 폭은 보지 않음), 가림·[보기]/[가리기]·다른 업체에서 다시 가림·가린 채 [복사], 홈페이지 링크(`https://` 붙임, `rel="noopener noreferrer"`), 무상 수리 칩 셋, 업체 판(분류 기본·가린 두 칸·빈 이름·겹침·실패 카드·값 그대로), 그 자리 칸(필수 글·담당자 겹침·비용 쉼표·날짜 기본 오늘), 지우기 확인(업체·장비 수 글·받침)·담당자/수리 기록은 묻지 않음, 빈 주소록. 폰 전용 모양(`max-md:` 등)을 쓰지 않는다

## TASK-5: 엑셀 읽기·올리기 부품·양식 파일
- Phase: 2
- AC: AC-6504.1, AC-6504.2, AC-6504.3, AC-6504.4, AC-6506.1, AC-6506.2, AC-6506.3
- REQ: REQ-6504, REQ-6506
- Files: src/lib/contacts/workbook.ts, src/lib/contacts/workbook.test.ts, src/lib/contacts/template.test.ts, src/components/contacts/import/**, public/contacts/contacts-template.xlsx, .gitignore, .vercelignore, src/vercel-config.test.ts, fixtures/make-fake-fixtures.test.ts
- Tests: src/lib/contacts/workbook.test.ts, src/lib/contacts/template.test.ts, src/components/contacts/import/, src/vercel-config.test.ts, fixtures/make-fake-fixtures.test.ts
- TDD: required — design.md '엑셀 읽기'·'양식 파일'·'화면'의 `import/`, requirements.md '화면 글자' 엑셀 미리 보기·오류 문구 6~9·파일 큼. 시험 파일은 시험 안에서 `xlsx`로 만든다(가짜 업체만, 저장소에 엑셀을 더 넣지 않음). 시트는 이름 `연락처`·`장비`로만 찾는다(`쓰는 법`의 같은 머리글 예시 표를 읽지 않는지 시험). 양식 파일은 바탕화면 양식을 만든 스크립트로 빈 양식을 새로 만들어 넣고(바탕화면 파일은 복사하지 않음, 앱이 만들지 않음, 스크립트는 저장소에 넣지 않음), `.gitignore`·`.vercelignore`는 엑셀 줄 뒤에 `!public/contacts/contacts-template.xlsx` 한 줄씩, 되살리기를 고정한 두 시험은 그 한 줄(허용 자리는 그 파일 하나)만큼 맞춘다. 미리 보기·창은 plan·결과를 props로 받고, 미리 보기까지 네트워크가 없음을 fetch·Supabase 흉내로 본다. 칸 값(비밀번호·계좌 포함)이 미리 보기에 안 보이는지 본다. [양식 받기]는 `download="주소록-양식.xlsx"` 링크 + 알림

## TASK-6: 대시보드 무상 수리 알림
- Phase: 3
- AC: AC-6507.1, AC-6507.2
- REQ: REQ-6507
- Files: src/components/dashboard/warranty/**, src/components/dashboard/summary/LiveDashboard.tsx, src/components/dashboard/summary/LiveDashboard.test.tsx, src/components/dashboard/live/BitDashboard.tsx, src/components/dashboard/live/BitDashboard.test.tsx, src/components/dashboard/briefing/DashboardHome.tsx, src/components/dashboard/briefing/DashboardHome.test.tsx, src/app/(app)/dashboard/page.test.tsx
- Tests: src/components/dashboard/warranty/, src/components/dashboard/summary/LiveDashboard.test.tsx, src/components/dashboard/live/BitDashboard.test.tsx, src/components/dashboard/briefing/DashboardHome.test.tsx, src/app/(app)/dashboard/page.test.tsx
- TDD: required — design.md '대시보드 알림'(`useWarrantySoon`·`WarrantyNotice`·잇기), requirements.md '화면 글자' 대시보드 알림. `listWarrantySoon`·시계를 흉내 낸다. 자리 넷(숫자 뒤: 머리 줄·오류 상자 다음 / 읽는 중·실패 블록 다음 / 연결 전 비트: 날짜 줄 다음·큰 문장 앞 / 비트 아닌 EMR: 날짜 줄 다음), 셋까지 + 넷째 줄, 링크 `/contacts?c=`·`/contacts`, [닫기] 없음, 10초 한도·실패·0줄·supabase 없음이면 아무것도 안 그리고 오류 카드도 없음, BitDashboard가 다시 놓여도 한 번만 읽음, 저장 숫자·비트 읽기가 기다리지 않음. `dashboard/page.tsx`는 고치지 않는다. `components/dashboard/imports.test.ts` 울타리를 지킨다

## TASK-7: 주소록 화면 잇기·탭 열기
- Phase: 3
- AC: AC-6505.1, AC-6505.2, AC-6505.4, AC-6505.5, AC-6505.7, AC-6505.9, AC-6506.4, AC-6508.1, AC-6508.2, AC-6508.3
- REQ: REQ-6505, REQ-6506, REQ-6508
- Files: src/components/contacts/ContactsScreen.tsx, src/components/contacts/ContactsScreen.test.tsx, src/components/contacts/useContacts.ts, src/components/contacts/useContacts.test.ts, src/app/(app)/contacts/page.tsx, src/app/(app)/contacts/page.test.tsx, src/components/shell/menu.ts, src/components/shell/shell.test.tsx, src/components/common/notReadyFeatures.ts, src/components/common/notReadyFeatures.test.ts, src/app/(app)/notReadyPages.test.tsx, src/app/titles.test.tsx, src/app/notFound.test.tsx, src/app/(app)/tabFrame.test.tsx, src/components/dashboard/briefing/features.ts, src/components/dashboard/briefing/features.test.ts, docs/UI_GUIDE.md
- Tests: src/components/contacts/ContactsScreen.test.tsx, src/components/contacts/useContacts.test.ts, src/app/(app)/contacts/page.test.tsx, src/components/shell/shell.test.tsx, src/components/common/notReadyFeatures.test.ts, src/app/(app)/notReadyPages.test.tsx, src/app/titles.test.tsx, src/app/notFound.test.tsx, src/app/(app)/tabFrame.test.tsx, src/components/dashboard/briefing/features.test.ts
- TDD: required — design.md '화면'(`ContactsScreen`·`useContacts`·페이지)·'메뉴·준비 중'. 저장 함수·`supabaseBrowser`를 흉내 내 읽는 중(h1만)·읽기 실패 카드와 [다시 읽기]·저장 실패(값 그대로)·겹침 → `duplicate`·지운 뒤 딸린 줄 빠짐·`?c=` 고름(없는 id 무시)·미리 보기 동안 목록 대신·[넣기] 뒤 다시 읽기와 초록 줄([닫기]까지 남음)·[넣기] 실패 카드를 본다. 두 칸 틀 최소 폭 720px + 감싼 칸 `overflow-x: auto`(폰 전용 모양 없음). Phase 2 부품은 고치지 않고 잇기만 한다. 메뉴·준비 중 수를 고정한 시험은 수와 주소록 줄만 맞춘다(본보기 specs/forms TASK-13). 데스크는 탭 없음·막힌 화면을 `shell.test.tsx`에 하나 더한다(`DESK_MENU`·`isDeskPath` 코드는 그대로). `src/lib/csp.ts`·`next.config.ts`·`middleware.ts`는 고치지 않는다

## TASK-8: 마무리 — 전체 검사·화면 확인·독립 검토
- Phase: 4
- AC: AC-6505.1, AC-6506.3, AC-6507.1
- REQ: REQ-6505, REQ-6506, REQ-6507
- Files: src/components/contacts/**, src/components/dashboard/warranty/**, src/components/dashboard/summary/DashboardAnalysis.test.tsx
- Tests: src/components/contacts/, src/components/dashboard/warranty/
- TDD: exempt — 전체 검사(`npm test`·`npm run lint`·`npm run build`·tsc, ssk-finish-check — 이 PC에서 원래 나는 실패는 specs/clinic-calendar/known-failures.md와 견줌)와 화면 확인(ssk-screen-check: 로그인 없는 하네스, 1440·1024, 가짜 업체 자료, 시안 `shots/*-1440.png`·`list-1024.png`·`detail-1024.png`와 견줌. 폰 폭 사진은 찍지 않는다). 그다음 독립 검토 한 번(코드를 주고 결론은 주지 않음). 고칠 것이 나오면 Files의 화면 파일만 고치고, 그 밖이면 명세를 고친 뒤 한다

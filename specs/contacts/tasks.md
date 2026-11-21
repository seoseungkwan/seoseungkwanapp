# 작업 분할: 주소록

> 형식: `## TASK-n: 제목` 아래에 `- Phase:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 고친다. TASK마다 일꾼 하나(각자 git worktree). **같은 Phase는 병렬이고 같은 Phase의 TASK끼리 파일이 겹치지 않는다.** 앞 Phase를 합친 뒤 다음 Phase.
> MVP 모드: 중간 검토 없이 Phase 끝마다 그 Phase 시험 파일만 돌리고, 마지막에 전체 검사 → 독립 검토 한 번(재검토는 사용자에게 묻고).
>
> | Phase | TASK | 하는 일 | 시작 조건 |
> |---|---|---|---|
> | 1 | TASK-1 | DB: 표 넷·넣기 함수 SQL + RLS 시험 + ADR-034·plan.md·ARCHITECTURE | 명세 승인 |
> | 1 | TASK-2 | 모양(`types/contacts.ts`)·순수 함수(`lib/contacts` — 칸 검사·머리글·넣을 계획·남은 날·찾기)·오류 번호 | 명세 + 시안 승인(오류 문구) |
> | 2 | TASK-3 | 저장 함수 `lib/storage/contacts.ts` | Phase 1 합침 |
> | 2 | TASK-4 | 화면 부품 `components/contacts/parts`(목록·자세히·전화·가림·판·확인) | Phase 1 합침 + 시안 승인 |
> | 2 | TASK-5 | 엑셀 읽기 `workbook.ts` · 올리기 판 · 양식 파일과 되살리기 줄 | Phase 1 합침 + 시안 승인 |
> | 3 | TASK-6 | 대시보드 무상 수리 알림 | Phase 2 합침 |
> | 3 | TASK-7 | 주소록 화면 잇기 · `/contacts` 페이지 · 메뉴 ready · 준비 중 빼기 | Phase 2 합침 |
> | 4 | TASK-8 | 전체 검사 · 화면 확인 → 독립 검토 한 번 | Phase 3 합침 |
>
> - 겹치는 파일은 Phase가 다를 때만: `src/lib/contacts/`는 TASK-2(Phase 1)가 만들고 TASK-5(Phase 2)는 `workbook.ts`·`template.test.ts`만 더한다. `src/components/contacts/`는 TASK-4 `parts/`·TASK-5 `import/`·TASK-7 맨 위 파일로 나눈다. `src/components/dashboard/briefing/features.ts`·`DashboardHome.test.tsx`는 TASK-7, `src/app/(app)/dashboard/page.tsx`는 TASK-6.
> - 화면 글자는 requirements.md '정해 둔 글자'와 시안(`docs/mockups/contacts/`) 승인 글자뿐이다. 시안이 아직이면 TASK-2(오류 문구)·Phase 2의 화면 TASK를 시작하지 않는다(`CLAUDE.md` 화면 규칙). 시안이 대시보드 알림을 `LiveDashboard` 밖 다른 부품 안에 두면 TASK-6 Files를 먼저 고친다(명세 고침).
> - 다른 갈래와 겹칠 수 있는 파일: `docs/ADR.md`(번호 034), `src/lib/errors.ts`·`src/types/errors.ts`, 메뉴 고정 시험들. 합칠 때 앞 갈래를 먼저 받고 번호·수만 맞춘다.
> - **사용자 단계**: (1) 시안 승인 (2) `/sdd approve contacts` (3) 모두 합친 뒤 배포 전 `supabase/migrations/20261121000000_contacts.sql`을 Supabase SQL Editor에 붙여 넣기(SQL 먼저, 웹 다음 — design.md '배포 순서'). Claude는 실제 Supabase에 붙지 않는다. **배포·합치기(운영 갈래)는 사용자가 말할 때만** 한다. 도우미·확장 새 판은 없다.

## TASK-1: DB — 표 넷·넣기 함수·ADR-034
- Phase: 1
- AC: AC-6501.1, AC-6501.2, AC-6501.3, AC-6501.4, AC-6501.5, AC-6501.6
- REQ: REQ-6501
- Files: supabase/migrations/20261121000000_contacts.sql, supabase/contacts.rls.test.ts, docs/ADR.md, docs/ARCHITECTURE.md, plan.md
- Tests: supabase/contacts.rls.test.ts
- TDD: required — design.md 'DB'(칸·제약·권한 표·넣기 함수·장비 맞추기). SQL은 Write 도구로 쓴다(두 번 실행 안전, 표마다 RLS → revoke → 필요한 권한만, `my_hospital_id()` 다시 만들지 않음, 데스크 정책 없음). 시험은 `supabase/calendar.rls.test.ts`·`desk.rls.test.ts`처럼 PGlite에서 진짜 migration 사슬을 차례로 돌린다(데스크 경우를 보려고 `20261118100000_desk_accounts.sql`까지). 업체·담당자 이름은 모두 지어낸 것. `docs/ADR.md` 끝에 design.md 'ADR-034' 글, `plan.md`는 §4 '서버로 가는 것'에 한 마디와 §5 DB 표 `clinic_profiles` 줄 다음에 `contacts_*` 한 줄, `docs/ARCHITECTURE.md`는 DB 표 한 줄만. **실제 Supabase에 붙여 넣지 않는다**

## TASK-2: 모양·순수 함수·오류 번호
- Phase: 1
- AC: AC-6503.1, AC-6503.2, AC-6503.3, AC-6503.4, AC-6503.5, AC-6503.6, AC-6503.7, AC-6503.8, AC-6503.9
- REQ: REQ-6503
- Files: src/types/contacts.ts, src/lib/contacts/categories.ts, src/lib/contacts/categories.test.ts, src/lib/contacts/fields.ts, src/lib/contacts/fields.test.ts, src/lib/contacts/sheet.ts, src/lib/contacts/plan.ts, src/lib/contacts/plan.test.ts, src/lib/contacts/warranty.ts, src/lib/contacts/warranty.test.ts, src/lib/contacts/search.ts, src/lib/contacts/search.test.ts, src/lib/contacts/source.test.ts, src/types/errors.ts, src/lib/errors.ts, src/lib/errors.test.ts
- Tests: src/lib/contacts/categories.test.ts, src/lib/contacts/fields.test.ts, src/lib/contacts/plan.test.ts, src/lib/contacts/warranty.test.ts, src/lib/contacts/search.test.ts, src/lib/contacts/source.test.ts, src/lib/errors.test.ts
- TDD: required — design.md '모양'·'순수 함수'·'예'·'오류 번호'. 순수 함수만(시계를 읽지 않고 오늘을 받는다). 날짜는 `lib/analytics/dates.ts`(`parseDateCell`·`diffDays`·`addDays`)만, `lib/parsers`는 부르지 않는다. eslint 구역 목록은 고치지 않는다(`source.test.ts`가 구역 밖·순수함을 소스 글자로 본다). 머리글 상수는 requirements.md 10번 글자 그대로. 오류 아홉의 글은 시안 승인 글자(시안에 없는 것은 시안 승인 때 함께 정한 글자)

## TASK-3: 저장 함수
- Phase: 2
- AC: AC-6502.1, AC-6502.2, AC-6502.3, AC-6502.4
- REQ: REQ-6502
- Files: src/lib/storage/contacts.ts, src/lib/storage/contacts.test.ts
- Tests: src/lib/storage/contacts.test.ts
- TDD: required — design.md '저장 함수'. 본보기 `src/lib/storage/calendar.ts`(가짜 client로 보낸 표·칸·몸통을 그대로 견준다). 칸 검사는 TASK-2의 `…Problems`·`cleanText`를 쓴다(고치지 않음). 오류에 Supabase 문구·입력값(비밀번호·계좌 포함)이 들지 않는지 본다

## TASK-4: 화면 부품
- Phase: 2
- AC: AC-6505.2, AC-6505.3, AC-6505.4, AC-6505.5, AC-6505.6, AC-6505.7
- REQ: REQ-6505
- Files: src/components/contacts/parts/**
- Tests: src/components/contacts/parts/
- TDD: required — design.md '화면'의 `parts/`, 시안 글자·모양 그대로. props·콜백만(읽기·저장·Supabase·`lib/storage` 없음). 찾기·남은 날·칸 검사는 `lib/contacts`를 쓴다. 전화(768px 미만 `tel:` / 이상 복사), 비밀번호·계좌 가림과 [보기], 홈페이지 링크(`http(s)://`만, `rel="noopener noreferrer"`), 업체·장비 지우기 확인을 시험한다

## TASK-5: 엑셀 읽기·올리기 판·양식 파일
- Phase: 2
- AC: AC-6504.1, AC-6504.2, AC-6504.3, AC-6504.4, AC-6506.1, AC-6506.2, AC-6506.3, AC-6506.4
- REQ: REQ-6504, REQ-6506
- Files: src/lib/contacts/workbook.ts, src/lib/contacts/workbook.test.ts, src/lib/contacts/template.test.ts, src/components/contacts/import/**, public/contacts/contacts-template.xlsx, .gitignore, .vercelignore, src/vercel-config.test.ts, fixtures/make-fake-fixtures.test.ts
- Tests: src/lib/contacts/workbook.test.ts, src/lib/contacts/template.test.ts, src/components/contacts/import/ImportPanel.test.tsx, src/components/contacts/import/ImportPreview.test.tsx, src/vercel-config.test.ts, fixtures/make-fake-fixtures.test.ts
- TDD: required — design.md '엑셀 읽기'·'양식 파일'. 시험 파일은 시험 안에서 `xlsx`로 만든다(가짜 업체만, 저장소에 엑셀을 더 넣지 않음). 시트는 이름 `연락처`·`장비`로만 찾는다(`쓰는 법`의 같은 머리글 예시 표를 읽지 않는지 시험). 양식 파일은 바탕화면 `C:\Users\tjtmd\Desktop\주소록-양식.xlsx`를 **바이트 그대로 복사**하고(앱이 만들지 않음, 스크립트는 저장소에 넣지 않음), `.gitignore`·`.vercelignore`는 엑셀 줄 뒤에 `!public/contacts/contacts-template.xlsx` 한 줄씩, 되살리기를 고정한 두 시험은 그 한 줄(허용 자리는 그 파일 하나)만큼 맞춘다. 올리기 판은 `book`·`onImport`를 props로 받고, 미리 보기까지 네트워크가 없음을 fetch·Supabase 흉내로 본다. [양식 받기]는 `download="주소록-양식.xlsx"` 링크

## TASK-6: 대시보드 무상 수리 알림
- Phase: 3
- AC: AC-6507.1, AC-6507.2
- REQ: REQ-6507
- Files: src/components/dashboard/warranty/WarrantyNotice.tsx, src/components/dashboard/warranty/WarrantyNotice.test.tsx, src/app/(app)/dashboard/page.tsx, src/app/(app)/dashboard/page.test.tsx
- Tests: src/components/dashboard/warranty/WarrantyNotice.test.tsx, src/app/(app)/dashboard/page.test.tsx
- TDD: required — design.md '대시보드 알림'. `listWarrantySoon`·시계를 흉내 낸다. 10초 한도·실패·0줄이면 아무것도 그리지 않고 오류 카드도 없다. `LiveDashboard`·`BitDashboard`는 고치지 않는다(따로 돌아 기다리지 않음). 글자·자리·링크는 시안. `components/dashboard/imports.test.ts` 울타리를 지킨다

## TASK-7: 주소록 화면 잇기·탭 열기
- Phase: 3
- AC: AC-6505.1, AC-6505.4, AC-6505.5, AC-6505.7, AC-6506.3, AC-6508.1, AC-6508.2, AC-6508.3
- REQ: REQ-6505, REQ-6506, REQ-6508
- Files: src/components/contacts/ContactsScreen.tsx, src/components/contacts/ContactsScreen.test.tsx, src/components/contacts/useContacts.ts, src/components/contacts/useContacts.test.ts, src/app/(app)/contacts/page.tsx, src/app/(app)/contacts/page.test.tsx, src/components/shell/menu.ts, src/components/shell/shell.test.tsx, src/components/common/notReadyFeatures.ts, src/components/common/notReadyFeatures.test.ts, src/app/(app)/notReadyPages.test.tsx, src/app/titles.test.tsx, src/app/notFound.test.tsx, src/app/(app)/tabFrame.test.tsx, src/components/dashboard/briefing/features.ts, src/components/dashboard/briefing/features.test.ts, src/components/dashboard/briefing/DashboardHome.test.tsx, docs/UI_GUIDE.md
- Tests: src/components/contacts/ContactsScreen.test.tsx, src/components/contacts/useContacts.test.ts, src/app/(app)/contacts/page.test.tsx, src/components/shell/shell.test.tsx, src/components/common/notReadyFeatures.test.ts, src/app/(app)/notReadyPages.test.tsx, src/app/titles.test.tsx, src/app/(app)/tabFrame.test.tsx, src/components/dashboard/briefing/features.test.ts
- TDD: required — design.md '화면'(`ContactsScreen`·`useContacts`)·'메뉴·준비 중'. 저장 함수·`supabaseBrowser`를 흉내 내 읽기 실패·저장 실패(값 그대로)·겹침 오류 번호·[넣기] 뒤 다시 읽기를 본다. Phase 2 부품은 고치지 않고 잇기만 한다. 메뉴·준비 중 수를 고정한 시험은 수와 주소록 줄만 맞춘다(본보기 specs/forms TASK-13). 데스크는 탭 없음·막힌 화면을 `shell.test.tsx`에 하나 더한다(`DESK_MENU`·`isDeskPath` 코드는 그대로). `src/lib/csp.ts`·`next.config.ts`·`middleware.ts`는 고치지 않는다

## TASK-8: 마무리 — 전체 검사·화면 확인·독립 검토
- Phase: 4
- AC: AC-6505.1, AC-6505.7, AC-6506.2, AC-6507.1
- REQ: REQ-6505, REQ-6506, REQ-6507
- Files: src/components/contacts/**, src/components/dashboard/warranty/**
- Tests: src/components/contacts/, src/components/dashboard/warranty/
- TDD: exempt — 전체 검사(`npm test`·`npm run lint`·`npm run build`·tsc, ssk-finish-check — 이 PC에서 원래 나는 실패는 specs/clinic-calendar/known-failures.md와 견줌)와 화면 확인(ssk-screen-check: 로그인 없는 하네스, 1440·390, 가짜 업체 자료, 시안과 견줌). 그다음 독립 검토 한 번(코드를 주고 결론은 주지 않음). 고칠 것이 나오면 Files의 화면 파일만 고치고, 그 밖이면 명세를 고친 뒤 한다

## 사용자 확인 대상 (Claude 판단, design.md '시안과 맞출 곳 · 이 명세가 정한 것')
- 하는 일·품목을 한 칸으로 둠 · 새 업체에 분류가 없으면 `기타` · 같은 업체 안 같은 담당자 이름을 막음
- 엑셀에 일련번호가 새로 적히면 같은 이름·일련번호 빈 장비 하나에 채움 · 같은 이름에 일련번호 빈 장비가 여럿이면 엑셀로 고치지 않음(넣지 않는 줄)
- 담당자 이름 없이 휴대폰·맡은 일만 있는 줄은 넣지 않음 · 장비 지우기도 한 번 더 물음
- 파일 한도 5MB·연락처 2,000줄·장비 1,000줄 · `장비` 시트 없는 파일도 받음
- 양식 파일은 `public/contacts/`에 두고 `.gitignore`·`.vercelignore`에 그 파일 하나만 되살림 · 만든 스크립트는 저장소에 넣지 않음
- 대시보드 알림은 읽기 실패 때 조용히 비움

# 작업 분할: 환자 탭 (F/U 명단 · 정기 주사 문자 명단 · 문자 문구)

> 형식: `## TASK-n: 제목` 아래에 `- Step:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다. 값과 동작은 requirements.md · design.md.
>
> **순서**: Phase 1 `patients-1-lists`(명단 계산, 웹) → Phase 2 `patients-2-messages`(문자 문구·서버 표) → Phase 3 `patients-3-helper`(도우미) → Phase 4 `patients-4-screen`(화면). 도우미 Phase를 셋째로 둔 까닭: 비트 표 읽기 부품(precheck TASK-8)이 main에 합쳐져야 TASK-9을 시작할 수 있다(design.md '결정과 트레이드오프'). Phase 3 안에서는 선행 작업이 없는 저장(TASK-8)을 먼저 한다.
>
> **시작 조건**
> - 명세 승인(`/sdd approve patients` 또는 자동 승인).
> - TASK-9는 main에 precheck TASK-8의 `helper/src/Precheck.Core/Bit/GridReader.cs`·`GridRows.cs`와 비트 통계 화면 읽기(`helper/src/Precheck.Windows/VendorGridExport.cs`)가 있어야 시작한다. 없으면 그 step은 `blocked`(사유: precheck TASK-8 필요)로 멈춘다.
> - 화면 TASK(10~15)는 이 탭의 클릭 목업(`docs/mockups/patients/`, PC·휴대폰·도구 셋·상태)을 사용자가 승인한 뒤에만 시작한다(CLAUDE.md). 없으면 `blocked`(사유: 승인 목업 없음).
> - TASK-5의 migration을 실제 Supabase에 붙이는 일은 그때 사용자 OK를 받는다(시험은 PGlite). TASK-15(E2E)는 사용자가 SQL을 붙이고 시험 계정(`.env.local`)이 있을 때만 돈다.
> - 병렬 브랜치 규칙(C1~C9, design.md '다른 작업과 겹치는 파일'): C1 함수 글 그대로, migration 이름 `20261101000300_patients.sql`, 새 오류 번호는 `E-PATIENTS-*`만, 고정 탭 수 금지, 새 파일은 기능 이름으로.
>
> **모든 TASK 공통**
> - 시험을 먼저 쓰고 `python3 ~/.claude/harness/bin/tdd-run TASK-n --expect red`로 RED를 본 뒤 구현하고 `--expect green`. 시험 이름에 이 명세의 AC ID(AC-601.1 등)를 넣는다.
> - 가짜 자료만 쓴다: 이름 '가상환자NN', 차트번호 `9`로 시작하는 6자리, 전화 `010-0000-NNNN`, 내원번호 `V`+숫자. 실제 비트 내보내기·환자 파일을 커밋하지 않는다.
> - 원본(양지바른 `seoseungkwan/shared@2a1069b`, 폴더 `YangjiBareun_사전점검/`)은 저장소 밖에 두고 `YANGJI_SRC`로만 받는다. 원본 파일을 저장소에 복사하지 않는다. 커밋하는 것은 옮긴 코드와 골든 결과뿐이다.
> - `specs/precheck/`·`phases/precheck-*`·`src/lib/bridge/*`·`commands.json`·`src/workers/precheck/*`·`src/types/precheck.ts`를 고치지 않는다.
> - Phase가 끝나면 메인 세션이 `verify` → (화면 Phase는) 화면 캡처 → 쉬운 말 보고. 합치기·운영 배포·도우미 릴리스 태그(`helper-v*`)는 사용자가 그때 지시할 때만 한다.

## TASK-1: 환자 자료 울타리 (ESLint)
- Step: Phase 1 · Step 0 · `patients-fence`
- AC: AC-601.1~AC-601.4
- REQ: REQ-601
- Files: eslint.config.mjs, src/guardrails.test.ts, docs/ARCHITECTURE.md
- Tests: src/guardrails.test.ts
- TDD: required
- `src/lib/patients/**`를 환자 자료 구역 `files`에 더하고 안내 문구(`PATIENT_ZONE_MESSAGE`)에 `lib/patients`를 넣는다. `src/components/patients/rows/**` 울타리(JSX 허용), `src/components/patients/**`·`src/app/(app)/patients/**` 오류 보고 패키지 금지. 기존 규칙은 그대로 둔다. `docs/ARCHITECTURE.md`의 환자 구역 줄에 `lib/patients`·`components/patients/rows`를 더한다(`components/contact/rows` → `components/patients/rows`)

## TASK-2: F/U 명단 계산 (골든)
- Step: Phase 1 · Step 1 · `followup-logic`
- AC: AC-602.1~AC-602.5
- REQ: REQ-602
- Files: src/lib/patients/followup.ts, src/lib/patients/followup.test.ts, src/lib/patients/goldenFollowup.test.ts, src/lib/patients/sourceError.ts, src/types/patients.ts, scripts/patients/golden/*, fixtures/patients/golden/followup-*.json, fixtures/patients/golden/phone-columns.json, fixtures/patients/fake/*, fixtures/patients/make-fake-patients.ts, fixtures/patients/make-fake-patients.test.ts
- Tests: src/lib/patients/followup.test.ts, src/lib/patients/goldenFollowup.test.ts, fixtures/patients/make-fake-patients.test.ts
- TDD: required
- 원본: `assets/revisit_schedule.html`(적어 둔 날짜 `writtenDate`가 이미 끼워져 있다 — `tools/revisit_source_parts.py`는 그 조각을 끼우는 도구라 따로 돌리지 않는다). 골든 결과는 `node:vm`으로 원본 스크립트를 돌려 만든다(원본 시험 `tests/test_revisit_import_html.py`의 스크립트 꺼내기 방식)

## TASK-3: 정기 주사 명단 계산 (골든)
- Step: Phase 1 · Step 2 · `recall-logic`
- AC: AC-603.1~AC-603.5
- REQ: REQ-603
- Files: src/lib/patients/recall.ts, src/lib/patients/recall.test.ts, src/lib/patients/goldenRecall.test.ts, src/lib/analytics/dates.ts, src/lib/analytics/dates.test.ts, src/types/patients.ts, scripts/patients/golden/*, fixtures/patients/golden/recall-*.json, fixtures/patients/fake/*, fixtures/patients/make-fake-patients.ts, fixtures/patients/make-fake-patients.test.ts
- Tests: src/lib/patients/recall.test.ts, src/lib/patients/goldenRecall.test.ts, src/lib/analytics/dates.test.ts
- TDD: required
- `dates.ts`에는 `addMonthsToDay(ymd, n)`(말일 맞춤) 하나만 더한다. 기존 함수는 바꾸지 않는다

## TASK-4: Worker — 조각 모으기 · 읽을 조각 · 보기 모양 · 연락 표시 · 건수
- Step: Phase 1 · Step 3 · `patients-worker`
- AC: AC-604.1~AC-604.8
- REQ: REQ-604
- Files: src/workers/patients.worker.ts, src/workers/patients/assemble.ts, src/workers/patients/assemble.test.ts, src/workers/patients/plan.ts, src/workers/patients/plan.test.ts, src/workers/patients/jobs.ts, src/workers/patients/jobs.test.ts, src/workers/patients/handler.ts, src/workers/patients/handler.test.ts, src/types/patients.ts, fixtures/patients/fake/*, fixtures/patients/make-fake-patients.ts, fixtures/patients/make-fake-patients.test.ts
- Tests: src/workers/patients/assemble.test.ts, src/workers/patients/plan.test.ts, src/workers/patients/jobs.test.ts, src/workers/patients/handler.test.ts, fixtures/patients/make-fake-patients.test.ts
- TDD: required
- 메시지 약속은 design.md 'Worker 메시지 약속'. `patients.worker.ts`는 `handler.ts`를 잇기만 한다(시험은 handler를 바로 부른다)

## TASK-5: 서버 표 — message_templates · contact_counts
- Step: Phase 2 · Step 0 · `patients-db`
- AC: AC-607.1~AC-607.4
- REQ: REQ-607
- Files: supabase/migrations/20261101000300_patients.sql, supabase/patients.rls.test.ts
- Tests: supabase/patients.rls.test.ts
- TDD: required
- 실제 Supabase에 붙이는 일은 이 TASK에서 하지 않는다. Phase 끝 보고에 "사용자 OK 뒤 SQL 편집기에 붙일 파일"로 적는다

## TASK-6: 문자 문구 채우기 · 기본 문구 (골든)
- Step: Phase 2 · Step 1 · `message-fill`
- AC: AC-608.1~AC-608.3
- REQ: REQ-608
- Files: src/lib/patientMessages/fill.ts, src/lib/patientMessages/fill.test.ts, src/lib/patientMessages/defaults.ts, src/lib/patientMessages/defaults.test.ts, scripts/patients/golden/*, fixtures/patients/golden/messages-*.json
- Tests: src/lib/patientMessages/fill.test.ts, src/lib/patientMessages/defaults.test.ts
- TDD: required
- 원본: `assets/message_templates.html`(`TPLS`·`dateLine`·`withDate`·`DATE_LINE`)

## TASK-7: 문자 문구 · 남은 건수 저장 (브라우저 → Supabase) · 오류 번호
- Step: Phase 2 · Step 2 · `patients-storage`
- AC: AC-609.1~AC-609.5
- REQ: REQ-609
- Files: src/lib/storage/messageTemplates.ts, src/lib/storage/messageTemplates.test.ts, src/lib/storage/contactCounts.ts, src/lib/storage/contactCounts.test.ts, src/lib/errors.ts, src/lib/errors.test.ts, src/types/errors.ts, src/types/patients.ts
- Tests: src/lib/storage/messageTemplates.test.ts, src/lib/storage/contactCounts.test.ts, src/lib/errors.test.ts
- TDD: required

## TASK-8: 도우미 — 연락 표시 · 정기 주사 기록 저장 (contact.dat)
- Step: Phase 3 · Step 0 · `contact-store`
- AC: AC-606.1~AC-606.5
- REQ: REQ-606
- Files: docs/ADR.md, helper/src/Precheck.Core/Contact/ContactStore.cs, helper/src/Precheck.Core/Contact/IWorkLock.cs, helper/src/Precheck.Core/Contact/NamedWorkLock.cs, helper/src/Precheck.Core/Contact/ContactCommands.cs, helper/src/Precheck.Helper/Commands/ContactHelperServices.cs, helper/src/Precheck.Helper/Program.cs, helper/tests/Precheck.Core.Tests/Contact/*
- Tests: helper/tests/contact-store.dotnet.test.ts
- TDD: required
- `docs/ADR.md`: ADR-020에 '보충 (환자 탭, 2026-11)'을 단다 — `contact.dat`에 담는 것(연락 표시 + 정기 주사 기록: 차트번호·이름·날짜·처방코드·증상 한 줄·전화), DPAPI CurrentUser, 36개월·50,000건 한도, 다른 등록 프로필의 파일은 읽지 않음, `.bak`·깨진 파일은 지우지 않고 남김. 새 ADR 번호는 쓰지 않는다. CLAUDE.md는 고치지 않는다
- 선행 작업이 없어 TASK-9보다 먼저 한다

## TASK-9: 도우미 — contact.targets (비트 83·47 표 칸 고르기)
- Step: Phase 3 · Step 1 · `contact-read`
- AC: AC-605.1~AC-605.4
- REQ: REQ-605
- Files: helper/src/Precheck.Core/Contact/ContactColumns.cs, helper/src/Precheck.Core/Contact/ContactTargets.cs, helper/src/Precheck.Core/Contact/IContactGrids.cs, helper/src/Precheck.Core/Contact/ContactCommands.cs, helper/src/Precheck.Windows/ContactGrids.cs, helper/src/Precheck.Helper/Commands/ContactHelperServices.cs, helper/src/Precheck.Helper/Program.cs, helper/tests/Precheck.Core.Tests/Contact/*, helper/tests/Precheck.Windows.Tests/Contact/*
- Tests: helper/tests/contact-read.dotnet.test.ts
- TDD: required
- 시작 조건: precheck TASK-8(`GridReader`·`GridRows`·`VendorGridExport`)이 main에 있다. 그 파일들은 읽기만 하고 고치지 않는다
- 의원 PC 시험(Phase 3 끝): 이번 주 F/U 명단과 정기 주사 명단을 양지바른과 나란히 비교, 31일 한 조각 읽기 시간을 잰다

## TASK-10: 환자 탭 입구 · 도구 단추 줄 · 휴대폰은 건수만 · 준비 중에서 빼기
- Step: Phase 4 · Step 0 · `tab-entry`
- AC: AC-610.1~AC-610.5
- REQ: REQ-610
- Files: src/app/(app)/patients/page.tsx, src/app/(app)/patients/page.test.tsx, src/components/patients/PatientsEntry.tsx, src/components/patients/PatientsEntry.test.tsx, src/components/patients/PatientsScreen.tsx, src/components/patients/PatientsScreen.test.tsx, src/components/patients/usePatientsWorker.ts, src/components/patients/usePatientsWorker.test.ts, src/components/patients/CountsOnly.tsx, src/components/patients/CountsOnly.test.tsx, src/components/patients/tools.ts, src/components/patients/tools.test.ts, src/components/patients/ToolRow.tsx, src/components/patients/ToolRow.test.tsx, src/components/common/notReadyFeatures.ts, src/components/common/notReadyFeatures.test.ts, src/components/shell/menu.ts, src/components/shell/shell.test.tsx, src/components/dashboard/briefing/features.ts, src/components/dashboard/briefing/features.test.ts, src/app/(app)/notReadyPages.test.tsx, src/app/(app)/tabFrame.test.tsx, src/app/titles.test.tsx, src/app/notFound.test.tsx, docs/UI_GUIDE.md
- Tests: src/app/(app)/patients/page.test.tsx, src/components/patients/PatientsEntry.test.tsx, src/components/patients/PatientsScreen.test.tsx, src/components/patients/usePatientsWorker.test.ts, src/components/patients/CountsOnly.test.tsx, src/components/patients/tools.test.ts, src/components/patients/ToolRow.test.tsx, src/components/common/notReadyFeatures.test.ts, src/components/shell/shell.test.tsx, src/components/dashboard/briefing/features.test.ts, src/app/(app)/notReadyPages.test.tsx, src/app/(app)/tabFrame.test.tsx, src/app/titles.test.tsx, src/app/notFound.test.tsx
- TDD: required
- `PatientsScreen`은 이 TASK에서 불러오기(진행·오류·다시 불러오기)와 도구 자리만 그린다. 도구 몸통은 TASK-11~13이 그 자리에 넣는다. 시험의 고정 수("준비 중 10개")는 목록 길이로 바꾼다(다른 탭 명세와 합치기 쉽게)

## TASK-11: F/U 명단 화면
- Step: Phase 4 · Step 1 · `followup-screen`
- AC: AC-611.1~AC-611.5
- REQ: REQ-611
- Files: src/components/patients/FollowupTool.tsx, src/components/patients/FollowupTool.test.tsx, src/components/patients/rows/FollowupRows.tsx, src/components/patients/rows/FollowupRows.test.tsx, src/components/patients/periods.ts, src/components/patients/periods.test.ts, src/components/patients/PatientsScreen.tsx, src/components/patients/PatientsScreen.test.tsx, src/components/patients/CopyButton.tsx, src/components/patients/CopyButton.test.tsx
- Tests: src/components/patients/FollowupTool.test.tsx, src/components/patients/rows/FollowupRows.test.tsx, src/components/patients/periods.test.ts, src/components/patients/PatientsScreen.test.tsx, src/components/patients/CopyButton.test.tsx
- TDD: required

## TASK-12: 정기 주사 문자 명단 화면
- Step: Phase 4 · Step 2 · `recall-screen`
- AC: AC-612.1~AC-612.4
- REQ: REQ-612
- Files: src/components/patients/RecallTool.tsx, src/components/patients/RecallTool.test.tsx, src/components/patients/rows/RecallRows.tsx, src/components/patients/rows/RecallRows.test.tsx, src/components/patients/PatientsScreen.tsx, src/components/patients/PatientsScreen.test.tsx
- Tests: src/components/patients/RecallTool.test.tsx, src/components/patients/rows/RecallRows.test.tsx, src/components/patients/PatientsScreen.test.tsx
- TDD: required

## TASK-13: 문자 문구 화면
- Step: Phase 4 · Step 3 · `messages-screen`
- AC: AC-613.1~AC-613.6
- REQ: REQ-613
- Files: src/components/patients/MessagesTool.tsx, src/components/patients/MessagesTool.test.tsx, src/components/patients/useTemplates.ts, src/components/patients/useTemplates.test.ts, src/components/patients/PatientsScreen.tsx, src/components/patients/PatientsScreen.test.tsx, src/components/patients/PatientsEntry.tsx, src/components/patients/PatientsEntry.test.tsx
- Tests: src/components/patients/MessagesTool.test.tsx, src/components/patients/useTemplates.test.ts, src/components/patients/PatientsScreen.test.tsx, src/components/patients/PatientsEntry.test.tsx
- TDD: required

## TASK-14: 연락 남은 건수 올리기
- Step: Phase 4 · Step 4 · `counts-upload`
- AC: AC-614.1~AC-614.4
- REQ: REQ-614
- Files: src/components/patients/useCountsUpload.ts, src/components/patients/useCountsUpload.test.ts, src/components/patients/PatientsScreen.tsx, src/components/patients/PatientsScreen.test.tsx
- Tests: src/components/patients/useCountsUpload.test.ts, src/components/patients/PatientsScreen.test.tsx
- TDD: required
- Phase 4 끝: 메인 세션이 `verify` → 화면 캡처(PC·휴대폰, 도구 셋, 상태) → 쉬운 말 보고 → 의원 PC 시험 목록(연락함 표시가 다시 열어도 남는지, 휴대폰 건수가 바뀌는지)

## TASK-15: 개인정보 E2E (실제 Supabase · 가짜 확장)
- Step: Phase 4 · Step 5 · `privacy-e2e`
- AC: AC-615.1~AC-615.3
- REQ: REQ-615
- Files: e2e/patients-privacy.spec.ts, e2e/patients/fakeExtension.ts, e2e/patients/forbidden.ts
- TDD: exempt — Playwright E2E(`npm run e2e`)는 실제 Supabase와 시험 계정이 있어야 돌고 vitest 하네스(`tdd-run`)로 RED/GREEN을 남길 수 없다(ADR-017). 사용자가 TASK-5 SQL을 붙인 뒤 `npm run e2e -- e2e/patients-privacy.spec.ts`로 확인한다
- 가짜 확장: 시험 코드(`page.addInitScript`)가 `chrome.runtime.connect`를 흉내 내 `hello`·`store.load`·`contact.targets`·`store.save`에 `fixtures/patients/fake/`의 가짜 조각으로 답한다. 앱 코드에 시험용 길을 만들지 않는다(CLAUDE.md)
- 지켜볼 것: `page.on('request')`로 나간 요청의 주소·쿼리·몸통, 끝난 뒤 시험 계정으로 `message_templates`·`contact_counts` 내 줄을 다시 읽기. 금지 글(가짜 차트번호·이름·전화·주민번호 모양·파일 이름)은 `forbidden.ts` 한 곳이고 `findForbidden`은 맞은 **종류 이름만** 돌려준다. 모으는 것은 `{종류, 요청 경로}`뿐이고 `expect(hits).toEqual([])`. 요청 머리·쿠키는 모으지 않고 `/auth/v1/` 몸통과 `apikey`·`access_token` 쿼리 값은 건너뛰며 실패해도 모은 글을 출력하지 않는다(규칙 C11). 주소는 경로를 `decodeURIComponent`로 풀고 쿼리 값은 `URLSearchParams`로 하나씩 꺼내(`apikey`·`access_token` 뺀 뒤) 맞춘다(퍼센트 인코딩된 한글 가짜 이름도 잡게, `encodeURIComponent('가상환자01')`이 든 주소 사례를 spec 첫 시험으로 확인). `trace: 'off'`, 산출물에 쿠키·토큰 없음
- 시험이 바꾼 `message_templates`는 시험 전 줄을 기억해 되돌린다. `contact_counts`에는 delete 권한이 없다(AC-607.3) — 시험 계정의 건수 줄(가짜 자료의 정수 둘)은 그대로 남는다. 이 시험을 위해 delete 권한을 더하지 않는다

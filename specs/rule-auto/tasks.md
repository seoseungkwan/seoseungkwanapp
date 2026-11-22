# 작업 분할: 점검 규칙 저절로 바꾸기

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 수정할 수 있다. 같은 Phase 안 TASK끼리는 Files가 겹치지 않는다.
> 값과 동작: requirements.md · design.md. 화면 글자: requirements(시안 `docs/mockups/rule-auto/notes.md` 그대로 + '기본값').
>
> **시작 조건**: 사용자의 명세·시안 승인. 갈래 `feat-rule-auto`(이 명세 커밋 위). `node_modules`가 없으면 처음에 `npm ci`.
>
> **모든 TASK 공통**
> - 시험부터 쓰고 RED를 본다. 새 시험 이름에 AC ID를 넣는다. notices 시험 가운데 바뀐 동작을 보던 것(requirements '대체하는 notices AC')은 새 동작으로 고치고 새 AC ID를 단다. notices 명세 파일(`specs/notices/**`)은 고치지 않는다.
> - 진짜 Claude·진짜 Supabase를 부르지 않는다. Claude·DB는 시험이 넣는 가짜, DB 권한은 PGlite(`supabase/*.rls.test.ts`와 같은 틀)다.
> - 규칙표 파일은 `loadTables()`로만 읽는다(시험 포함, AC-007.4). 환자 자료 구역 파일을 고칠 때도 네트워크·console·저장소·React를 쓰지 않는다(울타리 그대로, `eslint.config.mjs`는 고치지 않음).
> - 화면은 PC 배치 하나다. 폰 전용 배치·폭 시험을 만들지 않는다. AI·DB가 준 글은 글자 노드로만 그린다.
> - 줄바꿈: `src`는 LF다. `sed -i`로 고치지 않는다.
> - 끝 조건: `npm run lint`(경고 0)·`npx tsc --noEmit` 통과, 고친 시험 파일 모두 통과.
>
> **할 순서**: Phase 하나 = 단계 하나. 같은 Phase의 TASK는 병렬 작업자(ssk-parallel-workers)가 따로 한다. 단계마다 합친 뒤 다음 단계. 검토는 모든 단계가 끝난 뒤 ssk-finish-check와 독립 검토 한 번.
> 1. Phase 1: TASK-1 (모두가 쓰는 타입·오류 번호·글자 도구)
> 2. Phase 2: TASK-2~6 병렬 (DB · 구역 검사와 합치기 · AI 요청 · 모으기 DB 쪽 · 화면 저장 쪽 — TASK-1의 타입만 쓴다)
> 3. Phase 3: TASK-7~12 병렬 (Worker · 고친 규칙 정하기 · 화면 넷 — Phase 2 결과를 쓴다)
> 4. Phase 4: TASK-13·14 병렬 (모으기 흐름 · 청구 화면 — 모든 부품을 잇는다)
> 5. Phase 5: TASK-15 (문서)
>
> **배포 전**(구현 뒤, 사용자와 함께): design 13절 — SQL 먼저, 배포, 모으기 한 번 돌리기.

## TASK-1: 공용 타입 · 오류 번호 · 화면 글자 도구
- Phase: 1
- AC: AC-7801.1, AC-7801.2, AC-7801.3
- REQ: REQ-7801
- Files: src/types/precheck.ts, src/types/ruleAuto.ts, src/types/notices.ts, src/types/errors.ts, src/lib/errors.ts, src/lib/errors.test.ts, src/lib/notices/ruleView.ts, src/lib/notices/ruleView.test.ts
- Tests: src/lib/errors.test.ts, src/lib/notices/ruleView.test.ts
- TDD: required
- 할 것: design 3절 타입(`RuleUpdate`·`RuleChangeCheck`·`CheckSettings.ruleUpdates?` · `types/ruleAuto.ts` 전부 · `NoticeView.ruleTally?`), `E-RULE-AUTO-SAVE`, design 11절 `ruleView.ts`(띠 글·칩 고르기·날짜 글).

## TASK-2: DB 표 · 권한 · 함수
- Phase: 2
- AC: AC-7805.1, AC-7805.2, AC-7805.3, AC-7805.4, AC-7805.5, AC-7806.1, AC-7806.2, AC-7806.3, AC-7806.4, AC-7806.5
- REQ: REQ-7805, REQ-7806
- Files: supabase/migrations/20261122000000_rule_auto.sql, supabase/ruleAuto.rls.test.ts
- Tests: supabase/ruleAuto.rls.test.ts
- TDD: required
- 할 것: design 7절. 표 셋은 먼저 모두 revoke 뒤 정한 권한만. 시험은 RLS(원장 A·B·데스크·승인 대기·관리자·모으기·anon), 두 번 실행, `notice_rule_alerts()`가 human 줄만 세는 것(AC-7806.4 — notices AC-7403.6 대체)을 증명한다. `notices.rls.test.ts`는 고치지 않는다(그 시험은 notices 두 파일만 돌리므로 그대로 통과).

## TASK-3: 구역 — 바꾼 규칙 검사와 판 합치기
- Phase: 2
- AC: AC-7802.1, AC-7802.2, AC-7802.3, AC-7802.4, AC-7802.5, AC-7802.6, AC-7803.1, AC-7803.2, AC-7803.3, AC-7803.4, AC-7807.1
- REQ: REQ-7802, REQ-7803, REQ-7807
- Files: src/lib/precheck/ruleUpdates.ts, src/lib/precheck/ruleUpdates.test.ts, src/lib/precheck/tables.ts, src/lib/precheck/tables.test.ts, src/lib/precheck/rules/status.ts, src/lib/precheck/rules/status.test.ts, src/guardrails.test.ts
- Tests: src/lib/precheck/ruleUpdates.test.ts, src/lib/precheck/tables.test.ts, src/lib/precheck/rules/status.test.ts, src/guardrails.test.ts
- TDD: required
- 할 것: design 4·5절. `tables.ts`는 `checkRuleShape` 하나만 더 내보낸다(`checkTables` 동작 그대로 — 있는 시험 통과). `status.ts`는 `ruleStatusIn` 하나만 더 내보낸다. 실제 규칙표로 도는 시험(모든 규칙 자기 검사 'ok', 이름 칸 하나씩 없는 이름 → 'names', `NAME_KEYS`가 이름 칸을 다 덮음, 진료일 전날·당일 `runRules`)을 넣는다. `guardrails.test.ts`에는 `src/lib/precheck/ruleUpdates.ts` 길로 금지 import·fetch·console이 막히는 시험과 실제 파일 import 목록 시험(AC-7802.6)만 더한다.

## TASK-4: AI 요청 · 답 검사 · 규칙 종류 설명
- Phase: 2
- AC: AC-7808.1, AC-7808.2, AC-7808.3, AC-7808.4
- REQ: REQ-7808
- Files: src/app/api/ai/claude.ts, src/app/api/ai/claude.test.ts, src/app/api/ai/notices/ruleAuto/typeGuide.ts, src/app/api/ai/notices/ruleAuto/typeGuide.test.ts, src/app/api/ai/notices/ruleAuto/prompt.ts, src/app/api/ai/notices/ruleAuto/prompt.test.ts
- Tests: src/app/api/ai/claude.test.ts, src/app/api/ai/notices/ruleAuto/typeGuide.test.ts, src/app/api/ai/notices/ruleAuto/prompt.test.ts
- TDD: required
- 할 것: design 8절. `claude.ts`는 `effort` 타입에 `'high'`만 더한다. 새 파일 첫 줄 `import 'server-only'`. `TYPE_GUIDE`는 `src/lib/precheck/rules/*.ts` 처리기를 읽고 쓴다(구역 파일은 읽기만). 요청 시험은 블록 셋·`cache_control` 둘·`escapeTags`·schema·effort high·병원·사용자 값이 없음을 본다.

## TASK-5: 모으기 DB 쪽 더함
- Phase: 2
- AC: AC-7811.1, AC-7811.2
- REQ: REQ-7811
- Files: src/app/api/ai/notices/collectStore.ts, src/app/api/ai/notices/collectStore.test.ts
- Tests: src/app/api/ai/notices/collectStore.test.ts
- TDD: required
- 할 것: design 10절의 `RuleReviewStore` 여섯 함수(가짜 Supabase로 표·칸·함수 이름과 오류 처리를 본다). `collectorStore()`의 돌려주는 타입에 `RuleReviewStore`를 더한다. `batchNotices`의 `postedOn`은 TASK-13이 한다.

## TASK-6: 화면 읽기·쓰기 (RLS)
- Phase: 2
- AC: AC-7812.1, AC-7812.2, AC-7812.3, AC-7812.4, AC-7812.5
- REQ: REQ-7812
- Files: src/lib/storage/ruleChanges.ts, src/lib/storage/ruleChanges.test.ts, src/lib/storage/notices.ts, src/lib/storage/notices.test.ts
- Tests: src/lib/storage/ruleChanges.test.ts, src/lib/storage/notices.test.ts
- TDD: required
- 할 것: design 11절 `lib/storage/ruleChanges.ts`. `listNotices`·`openNotice`는 `ruleTallies`로 `ruleTally`를 채우고 그 읽기 실패는 null(목록은 그대로). `hospital_id`는 보내지 않는다.

## TASK-7: Worker가 바뀐 판으로 점검
- Phase: 3
- AC: AC-7804.1, AC-7804.2, AC-7804.3, AC-7804.4
- REQ: REQ-7804
- Files: src/workers/precheck/jobs.ts, src/workers/precheck/jobs.test.ts, src/lib/precheck/settingsChanged.ts, src/lib/precheck/settingsChanged.test.ts
- Tests: src/workers/precheck/jobs.test.ts, src/lib/precheck/settingsChanged.test.ts
- TDD: required
- 할 것: design 6절. `claimView`만 합친 표를 쓰고 `enabledRules`·`ruleList`는 원래 표. 사본 저장·사본 점검에 `ruleUpdates`가 같이 가는 시험.

## TASK-8: 고친 규칙 정하기
- Phase: 3
- AC: AC-7809.1, AC-7809.2, AC-7809.3, AC-7809.4
- REQ: REQ-7809
- Files: src/app/api/ai/notices/ruleAuto/decide.ts, src/app/api/ai/notices/ruleAuto/decide.test.ts
- Tests: src/app/api/ai/notices/ruleAuto/decide.test.ts
- TDD: required
- 할 것: design 9절. 첫 줄 `import 'server-only'`. 시험은 실제 규칙표의 규칙 하나(예: 횟수 규칙)로 숫자만 바꾼 답 → change, 코드를 뺀 답 → human·removed, 시행일 창 밖 → human·date, 저절로 못 바꾸는 규칙 → human·no-auto, 같은 답 → same, `basis`에 한 줄이 더해짐을 본다.

## TASK-9: 글 화면 규칙 상자
- Phase: 3
- AC: AC-7814.1, AC-7814.2, AC-7814.3, AC-7814.4, AC-7814.5, AC-7814.6, AC-7814.7, AC-7814.8
- REQ: REQ-7814
- Files: src/components/notices/detail/RuleBox.tsx, src/components/notices/detail/RuleChangeCard.tsx, src/components/notices/detail/RuleBox.test.tsx, src/components/notices/detail/NoticeDetail.test.tsx
- Tests: src/components/notices/detail/RuleBox.test.tsx, src/components/notices/detail/NoticeDetail.test.tsx
- TDD: required
- 할 것: 시안 `?v=detail` 그대로(상자 넷·카드·되돌린 모양·저장 실패). RuleBox의 props는 그대로(`NoticeDetail.tsx`는 고치지 않음). `NoticeDetail.test.tsx`의 규칙 상자 시험(notices AC-7420.2)을 새 글로 고치고 `lib/storage/ruleChanges` 가짜를 더한다.

## TASK-10: 글 목록 · 대시보드 칸 칩
- Phase: 3
- AC: AC-7815.1, AC-7815.2
- REQ: REQ-7815
- Files: src/components/notices/list/NoticeRow.tsx, src/components/notices/list/NoticesScreen.test.tsx, src/components/dashboard/notices/NoticesCard.tsx, src/components/dashboard/notices/NoticesCard.test.tsx
- Tests: src/components/notices/list/NoticesScreen.test.tsx, src/components/dashboard/notices/NoticesCard.test.tsx
- TDD: required
- 할 것: `ruleChips`(TASK-1)로 칩을 그린다. notices AC-7419.2·AC-7422.2를 보던 시험을 새 조건(`ruleTally`)으로 고친다.

## TASK-11: 대시보드 맨 위 띠 둘
- Phase: 3
- AC: AC-7816.1, AC-7816.2, AC-7816.3
- REQ: REQ-7816
- Files: src/components/dashboard/notices/RuleAlert.tsx, src/components/dashboard/notices/RuleAlert.test.tsx, src/components/dashboard/summary/LiveDashboard.test.tsx
- Tests: src/components/dashboard/notices/RuleAlert.test.tsx, src/components/dashboard/summary/LiveDashboard.test.tsx
- TDD: required
- 할 것: 시안 `?v=dashboard` 그대로. `LiveDashboard.tsx`는 고치지 않는다(`RuleAlert` 한 자리 그대로). `LiveDashboard.test.tsx`의 경고 글 시험(notices AC-7422.1)만 새 글로 고친다.

## TASK-12: 설정 → 점검 규칙 칩
- Phase: 3
- AC: AC-7817.1, AC-7817.2
- REQ: REQ-7817
- Files: src/components/settings/RuleSettings.tsx, src/components/settings/RuleSettings.test.tsx
- Tests: src/components/settings/RuleSettings.test.tsx
- TDD: required
- 할 것: 시안 `?v=settings` 그대로. 켜기·등급·저장 시험은 그대로 통과해야 한다.

## TASK-13: 모으기 흐름 — 규칙표 날짜와 규칙 살피기
- Phase: 4
- AC: AC-7807.2, AC-7807.3, AC-7810.1, AC-7810.2, AC-7810.3, AC-7810.4, AC-7810.5, AC-7810.6
- REQ: REQ-7807, REQ-7810
- Files: src/app/api/ai/notices/collector.ts, src/app/api/ai/notices/collector.test.ts, src/app/api/ai/notices/collect/route.ts, src/app/api/ai/notices/collect/route.test.ts, src/app/api/ai/notices/collectStore.ts, src/app/api/ai/notices/collectStore.test.ts
- Tests: src/app/api/ai/notices/collector.test.ts, src/app/api/ai/notices/collect/route.test.ts, src/app/api/ai/notices/collectStore.test.ts
- TDD: required
- 할 것: design 10절. `CollectorDeps.rules`(route가 `loadTables()`로 채움), 요약 저장 두 곳의 cutoff(notices AC-7414.5·AC-7414.6 시험을 새 AC로 고침), `batchNotices`의 `postedOn`, ② `reviewRules` 단계(차례·동시 2·4번·60초·실패 수·`E-AI-LIMIT`·로그 번호·`counts.rules`). 가짜 시계·가짜 Claude로 본다.

## TASK-14: 청구 화면이 바뀐 판을 넘김
- Phase: 4
- AC: AC-7813.1, AC-7813.2
- REQ: REQ-7813
- Files: src/components/claim/ClaimScreen.tsx, src/components/claim/ClaimScreen.test.tsx, src/components/claim/memo/MemoPanel.test.tsx
- Tests: src/components/claim/ClaimScreen.test.tsx, src/components/claim/memo/MemoPanel.test.tsx
- TDD: required
- 할 것: design 6절 `readServerSettings`·`bundle`. 읽기 하나라도 실패면 사본 점검(지금 동작) 시험, 되돌림으로 판이 바뀌면 '설정이 바뀌었어요' 띠 시험.
- 더함(2026-11-22 전체 검사): `MemoPanel.test.tsx`가 진짜 `ClaimScreen`을 그려 가짜 supabase가 `rule_changes`·`rule_change_marks`를 모른다 → 그 시험 파일의 가짜에 `eq`·`order`·`limit`과 두 표의 빈 답(`{ data: [], error: null }`)만 더한다(시험 뜻은 그대로).

## TASK-15: 문서
- Phase: 5
- AC: AC-7818.1, AC-7818.2, AC-7818.3
- REQ: REQ-7818
- Files: docs/ADR.md, CLAUDE.md, plan.md, docs/ARCHITECTURE.md, src/lib/notices/ruleAutoDocs.test.ts, src/components/staff/pay/PaySlip.test.tsx, supabase/staff.rls.test.ts
- Tests: src/lib/notices/ruleAutoDocs.test.ts, src/components/staff/pay/PaySlip.test.tsx, supabase/staff.rls.test.ts
- 더함(2026-11-22 전체 검사): 직원 시험 둘(`PaySlip.test.tsx` AC-7615.10, `supabase/staff.rls.test.ts` AC-7601.1)이 'ADR-039가 문서 맨 끝'을 본다 → ADR-039 글을 다음 `### ADR-` 앞에서 잘라 보게만 고친다(시험 뜻은 그대로).
- TDD: required
- 할 것: design 12절 ADR-040을 `docs/ADR.md`에 옮기고 ADR-038 '점검 규칙 연결' 줄 끝에 `(ADR-040이 바꿈)`, `CLAUDE.md`에 예외 한 줄, `plan.md`·`docs/ARCHITECTURE.md`에 design 12절 '다른 문서' 줄만. 시험은 `src/lib/inventory/inventoryDocs.test.ts`와 같은 틀(글자로 읽기).

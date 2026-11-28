# 작업 분할: 청구 메모 학습·청구 탭 흐름 다듬기 (claim-learn)

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- AC:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`, `- 차례:`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다.
>
> **할 순서**(사용자 2026-11-28 "Task별로 에이전트들 불러서 병렬로 할 수 있는 건 병렬로 해"): TASK마다 일꾼 하나, 기다릴 것이 없는 TASK는 한꺼번에.
> - Phase 1 (일꾼 넷): TASK-1 ∥ TASK-2 ∥ TASK-3 ∥ TASK-4 — 학습 순수 함수 / 도우미 0.15.0 / 엔진 건초·출처 / 날짜·연결·오류 흐름. 서로의 결과를 쓰지 않는다.
>   같이 고치는 파일은 셋뿐이고 고치는 자리가 다르다: `types.ts`·`phrases.ts`(TASK-1 = `learned`·`learnKinds`, TASK-3 = `TPL.tsWords`), `errors.ts`(TASK-1 = E-LEARN-*, TASK-4 = E-HELPER-STOPPED), `memo/index.ts`(내보내기 줄). 합칠 때 둘 다 남긴다.
> - Phase 2 (일꾼 셋): TASK-5 ∥ TASK-7 ∥ TASK-8 — Worker·저장·자료 모양 / 설정 학습 탭 / 모든 주사 부위 (Phase 1을 합친 뒤: 학습 함수·건초·출처 표를 쓴다. TASK-8은 TASK-3만 기다리므로 TASK-3을 합치면 바로 시작해도 된다)
> - Phase 3 (일꾼 하나): TASK-6 — 메모 단계 화면(학습 창·처음 학습·왜 이렇게·빈칸·하루 두 번·기본 문구). TASK-5의 Worker 메시지·저장 함수, TASK-7의 `LearnEditor`, TASK-8의 `siteChoices`를 쓰므로 마지막이다.
> - 배포 전: design.md 9-1절 '정확도 맞춰 보기'(저장소 밖, 숫자만).
> - 검토는 끝에 한 번(ssk-finish-check: 전체 시험·lint·build·도우미 net10·net48, 하네스 화면 사진 1440·1024). 중간 검토는 없다.
> - `extension/`·`supabase/migrations/`는 고치지 않는다. 도우미는 TASK-2만 고친다.

## 먼저 할 일 (코드 작업 아님)
1. 시안 `docs/mockups/claim-learn/index.html`(?s=memo·learn·why·first·list·dates·default·connect·errors)과 `notes.md` '화면 글'을 이 명세 승인과 함께 승인받는다(사용자 "승인도 명세와 함께 한 번에").
2. 사용자가 `/sdd approve claim-learn`를 입력한다.

## TASK-1: 학습 순수 함수 — 모양·검사·줄 틀·덧씌우기·줄 차이·모양 고침·개인정보·오류 번호
- REQ: REQ-9301, REQ-9302, REQ-9303, REQ-9304, REQ-9316
- AC: AC-9301.4, AC-9301.5, AC-9302.1, AC-9302.2, AC-9302.3, AC-9302.4, AC-9302.7, AC-9303.1, AC-9304.3, AC-9316.2
- Files: src/lib/precheck/memo/learn.ts, src/lib/precheck/memo/learn.test.ts, src/lib/precheck/memo/types.ts, src/lib/precheck/memo/phrases.ts, src/lib/precheck/memo/phrases.test.ts, src/lib/precheck/memo/index.ts, src/lib/precheck/settingsChanged.ts, src/lib/precheck/settingsChanged.test.ts, src/lib/errors.ts, src/lib/errors.test.ts
- Tests: src/lib/precheck/memo/learn.test.ts, src/lib/precheck/memo/phrases.test.ts, src/lib/precheck/settingsChanged.test.ts, src/lib/errors.test.ts
- TDD: required — design.md 2~5절 그대로(`LearnRule`·`validatePhrases`가 `learned`·`learnKinds` 받기·`toPattern`/`matchPattern`/`fillTemplate`/`literalSlots`·`applyLearned` 고르기 차례·`diffLines`·`styleChange` 넷·`personalHit`·한도). `settingsChanged` 보기에서 `learned[].left`·`learnKinds`만 뺀다. `errors.ts`에는 `E-LEARN-PERSONAL`·`E-LEARN-SAVE`만 더한다(글은 notes 그대로). `TPL.tsWords`는 TASK-3 몫이다.
- 차례: Phase 1 (TASK-2·3·4와 동시)

## TASK-2: 도우미 0.15.0 — claim.month 진료의·다시 등록 때 전 병원 저장 파일 보관·판 번호
- REQ: REQ-9317, REQ-9316
- AC: AC-9317.1, AC-9317.3, AC-9317.4, AC-9317.5, AC-9316.3
- Files: helper/src/Precheck.Core/Claim/ClaimMonthPayload.cs, helper/src/Precheck.Core/Store/WorkStore.cs, helper/src/Precheck.Core/Registration/RegisterFlow.cs, helper/src/Precheck.Core/Registration/RegisterPrompt.cs, helper/src/Precheck.Core/Registration/HospitalPick.cs, helper/src/Precheck.Windows/HospitalPickWindow.cs, helper/tests/Precheck.Core.Tests/Claim/ClaimMonth.test.cs, helper/tests/Precheck.Core.Tests/Store/WorkStore.test.cs, helper/tests/Precheck.Core.Tests/Registration/RegisterFlow.test.cs, helper/tests/Precheck.Core.Tests/Registration/RegisterPrompt.test.cs, helper/tests/Precheck.Core.Tests/Registration/HospitalPick.test.cs, helper/tests/Precheck.Windows.Tests/Connect/HospitalPickWindow.test.cs, helper/Directory.Build.props, src/lib/bridge/versions.ts, src/lib/bridge/handshake.test.ts, helper/tests/build.test.ts, helper/tests/input-wiring.dotnet.test.ts, helper/tests/Precheck.Core.Tests/Calendar/CalendarTargets.test.cs, helper/tests/Precheck.Core.Tests/Revenue/RevenueCommands.test.cs, helper/tests/Precheck.Core.Tests/Sheet/SheetCommands.test.cs, helper/tests/Precheck.Core.Tests/Stats/StatsExtra.test.cs, helper/tests/Precheck.Core.Tests/Stats/StatsReport.test.cs, helper/tests/Precheck.Core.Tests/Sunap/SunapTargets.test.cs
- Tests: helper/tests/Precheck.Core.Tests/Claim/ClaimMonth.test.cs, helper/tests/Precheck.Core.Tests/Store/WorkStore.test.cs, helper/tests/Precheck.Core.Tests/Registration/RegisterFlow.test.cs, helper/tests/Precheck.Core.Tests/Registration/RegisterPrompt.test.cs, helper/tests/Precheck.Core.Tests/Registration/HospitalPick.test.cs, helper/tests/Precheck.Windows.Tests/Connect/HospitalPickWindow.test.cs, src/lib/bridge/handshake.test.ts, helper/tests/build.test.ts
- TDD: required — design.md 13절. 진료의는 `StatsSql.VisitLinesSql`·`DoctorNamesSql`을 그대로 부른다(새 SQL 없음, SQL 관문·색인 시험 그대로). 보관은 등록 [확인] 저장 **뒤**, 다른 프로필 파일만 `old-{yyyyMMdd-HHmmss}`로 옮긴다(지우지 않음). 확인 창 한 줄은 notes '전 병원 파일 보관' 그대로. 판 번호 0.14.1 → 0.15.0이 박힌 시험(왼쪽 Files 목록)은 번호만 바꾼다. `MIN_HELPER`·`commands.json` 그대로.
- 차례: Phase 1 (TASK-1·3·4와 동시)

## TASK-3: 엔진 — 건초내주사 부위는 수량만큼 + 메모 줄 출처
- REQ: REQ-9308, REQ-9306, REQ-9316
- AC: AC-9308.1, AC-9308.2, AC-9308.3, AC-9308.4, AC-9306.1, AC-9306.3, AC-9316.1
- Files: src/lib/precheck/memo/engine.ts, src/lib/precheck/memo/types.ts, src/lib/precheck/memo/phrases.ts, src/lib/precheck/memo/phrases.test.ts, src/lib/precheck/memo/tsSites.test.ts, src/lib/precheck/memo/why.ts, src/lib/precheck/memo/why.test.ts, src/lib/precheck/memo/golden.test.ts, src/lib/precheck/memo/fullText.test.ts, src/lib/precheck/memo/buildMemo.test.ts, src/lib/precheck/memo/index.ts
- Tests: src/lib/precheck/memo/tsSites.test.ts, src/lib/precheck/memo/why.test.ts, src/lib/precheck/memo/golden.test.ts, src/lib/precheck/memo/fullText.test.ts, src/lib/precheck/memo/phrases.test.ts
- TDD: required — design.md 8·9절. `TPL.tsWords` 타입과 검사(500자까지)는 이 TASK가 더한다. `why.ts`의 학습 입력은 `{ id; name; line }[]`로 받아 TASK-1을 기다리지 않는다. KK062 줄 밖 엔진은 고치지 않는다. 골든·fullText·buildMemo 시험의 기대값은 바꾸지 않는다. 예외: 건초내주사 수량보다 부위가 많이 나오던 기대(KK062 한 줄에 부위가 둘 이상)만 AC-9308.1~.3으로 바꾸고, 바꾼 시험 이름을 tdd 기록에 적는다. `why.ts`의 `FIELD_PLACE`는 설정 화면 칸 이름과 같게(TASK-7이 견주는 시험을 더한다).
- 차례: Phase 1 (TASK-1·2·4와 동시)

## TASK-4: 흐름 — 날짜([이 날만]·목록 밖·오늘 포함)·연결 길·다른 창 이름·도우미 멈춤·저장 파일 깨짐·입력 결과 [날짜 목록으로]
- REQ: REQ-9311, REQ-9313, REQ-9314, REQ-9315
- AC: AC-9311.1, AC-9311.2, AC-9311.3, AC-9313.1, AC-9313.2, AC-9313.3, AC-9313.4, AC-9313.5, AC-9314.2, AC-9315.1, AC-9315.2
- Files: src/lib/errors.ts, src/lib/errors.test.ts, src/components/claim/dateList.ts, src/components/claim/dateList.test.ts, src/components/claim/DateStep.tsx, src/components/claim/DateStep.test.tsx, src/components/claim/ClaimScreen.tsx, src/components/claim/ClaimScreen.test.tsx, src/components/claim/ClaimError.tsx, src/components/claim/claimLoad.ts, src/components/claim/claimLoad.test.ts, src/components/claim/setup/ClaimEntry.tsx, src/components/claim/setup/ClaimEntry.test.tsx, src/components/claim/setup/SetupScreen.tsx, src/components/claim/setup/SetupScreen.test.tsx, src/components/claim/setup/StepGuide.tsx, src/components/claim/setup/SetupAlert.tsx, src/components/claim/setup/SetupAlert.test.tsx, src/components/claim/memo/StoreBlockedCard.tsx, src/components/claim/memo/StoreBlockedCard.test.tsx, src/components/claim/memo/InputResults.tsx, src/components/claim/memo/InputResults.test.tsx, src/components/claim/memo/MemoPanel.tsx, src/components/claim/memo/MemoPanel.test.tsx, src/components/shell/openTabs.ts, src/components/shell/openTabs.test.ts, src/components/shell/OtherTabsLine.tsx, src/components/shell/OtherTabsLine.test.tsx, src/components/shell/AppShell.tsx, src/components/shell/shell.test.tsx
- Tests: src/lib/errors.test.ts, src/components/claim/dateList.test.ts, src/components/claim/DateStep.test.tsx, src/components/claim/ClaimScreen.test.tsx, src/components/claim/claimLoad.test.ts, src/components/claim/setup/ClaimEntry.test.tsx, src/components/claim/setup/SetupScreen.test.tsx, src/components/claim/setup/SetupAlert.test.tsx, src/components/claim/memo/StoreBlockedCard.test.tsx, src/components/claim/memo/InputResults.test.tsx, src/components/claim/memo/MemoPanel.test.tsx, src/components/shell/openTabs.test.ts, src/components/shell/OtherTabsLine.test.tsx, src/components/shell/shell.test.tsx
- TDD: required — design.md 11절 표 그대로. `errors.ts`에는 `E-HELPER-STOPPED`만 더한다(글은 notes 그대로). 주소의 `from`·`why`는 정해진 값만 받는다. `BroadcastChannel`은 `src/components/shell/openTabs.ts`에서만(`src/lib/bridge`·확장은 그대로). `ClaimEntry`의 연결 화면 옮기기 시험 가운데 '일하는 중 E-HELPER-MISSING이면 옮김'을 기대하던 것이 있으면 AC-9315.1로 바꾸고 이름을 tdd 기록에 적는다.
- 차례: Phase 1 (TASK-1·2·3과 동시)

## TASK-5: Worker·저장·자료 모양 — 학습 덧씌우기·저절로 학습·학습 초안·처음 학습 종류·빈칸 후보·하루 두 번·기본 문구·복사 뒤 건수·손 간 정도·진료의
- REQ: REQ-9301, REQ-9302, REQ-9303, REQ-9305, REQ-9307, REQ-9309, REQ-9310, REQ-9312, REQ-9316, REQ-9317, REQ-9318
- AC: AC-9301.1, AC-9301.2, AC-9301.5, AC-9301.6, AC-9302.5, AC-9302.6, AC-9303.1, AC-9305.1, AC-9305.3, AC-9309.1, AC-9310.1, AC-9310.2, AC-9310.3, AC-9312.1, AC-9316.2, AC-9317.2, AC-9318.1, AC-9318.2
- Files: src/lib/precheck/memo/learn.ts, src/lib/precheck/memo/learn.test.ts, src/workers/precheck/jobs.ts, src/workers/precheck/jobs.test.ts, src/workers/precheck/learnJobs.ts, src/workers/precheck/learnJobs.test.ts, src/types/precheck.ts, src/lib/precheck/shape.ts, src/lib/precheck/shape.test.ts, src/lib/storage/claimSettings.ts, src/lib/storage/claimSettings.test.ts, src/guardrails.test.ts
- Tests: src/workers/precheck/jobs.test.ts, src/workers/precheck/learnJobs.test.ts, src/lib/precheck/shape.test.ts, src/lib/storage/claimSettings.test.ts, src/guardrails.test.ts
- TDD: required — design.md 4·5·5-1·5-2·6·7·10절, 13절의 `shape.ts`. `learn.ts`에는 `applyLearned`의 `origins`·`autoTemplate`·`autoLearn`만 더한다(TASK-1 함수의 지금 동작·시험은 그대로). 새 메시지 `learnDraft`·`learnAuto`·`firstLearn`·`learnUsed`와 `VisitMemo.learned`·`holes`·`sameDay`·`defaultPhrases`, 메모 보기의 `handStats`. 저장 함수 `saveLearned({add, update, remove})`·`revertLearned`·`tickLearned`·`addLearnKinds`(서버 값을 다시 읽어 그 칸만 바꿈, 설정 줄 없으면 `neutralPhrases()`+학습으로 시작). 예외: `jobs.test.ts`에서 '설정 줄 없음 → E-MEMO-NO-SETTINGS'를 기대하던 시험만 AC-9310.1로 바꾸고 이름을 tdd 기록에 적는다(검사 실패는 그대로 E-MEMO-NO-SETTINGS). `guardrails.test.ts`는 학습 저장 요청에 환자 값이 없는지 보는 시험만 더한다.
- 차례: Phase 2 (TASK-7과 동시, Phase 1을 합친 뒤)

## TASK-6: 메모 단계 화면 — 저절로 학습 띠·학습 창·확인 필요·처음 학습·왜 이렇게·빈칸 맨 위와 후보 단추·하루 두 번·기본 문구 띠·손 간 정도·설정 바뀜 때 복사 막기
- REQ: REQ-9301, REQ-9302, REQ-9303, REQ-9305, REQ-9306, REQ-9307, REQ-9309, REQ-9310, REQ-9314, REQ-9318, REQ-9319
- AC: AC-9301.1, AC-9301.2, AC-9301.3, AC-9301.4, AC-9301.5, AC-9301.6, AC-9302.6, AC-9303.1, AC-9303.2, AC-9303.3, AC-9305.1, AC-9305.2, AC-9305.4, AC-9306.1, AC-9307.1, AC-9307.2, AC-9307.3, AC-9309.1, AC-9310.1, AC-9314.1, AC-9318.1, AC-9319.3
- Files: src/workers/precheck/jobs.ts, src/workers/precheck/jobs.test.ts, src/components/claim/rows/LearnDialog.tsx, src/components/claim/rows/LearnDialog.test.tsx, src/components/claim/rows/FirstLearn.tsx, src/components/claim/rows/FirstLearn.test.tsx, src/components/claim/rows/WhyTable.tsx, src/components/claim/rows/WhyTable.test.tsx, src/components/claim/rows/MemoDetail.tsx, src/components/claim/rows/MemoDetail.test.tsx, src/components/claim/rows/MemoList.tsx, src/components/claim/rows/MemoList.test.tsx, src/components/claim/rows/leftGroups.ts, src/components/claim/memo/memoSplit.ts, src/components/claim/memo/memoSplit.test.ts, src/components/claim/memo/MemoPanel.tsx, src/components/claim/memo/MemoPanel.test.tsx, src/components/claim/memo/useLearned.ts, src/components/claim/memo/useLearned.test.ts, src/components/claim/ClaimScreen.tsx, src/components/claim/ClaimScreen.test.tsx
- Tests: src/workers/precheck/jobs.test.ts, src/components/claim/rows/LearnDialog.test.tsx, src/components/claim/rows/FirstLearn.test.tsx, src/components/claim/rows/WhyTable.test.tsx, src/components/claim/rows/MemoDetail.test.tsx, src/components/claim/rows/MemoList.test.tsx, src/components/claim/memo/memoSplit.test.ts, src/components/claim/memo/MemoPanel.test.tsx, src/components/claim/memo/useLearned.test.ts, src/components/claim/ClaimScreen.test.tsx
- TDD: required — 시안 ?s=memo·learn·why·first·default·errors 그대로, 글자는 notes '화면 글' 그대로. `jobs.ts`에서는 빈칸 후보(`[부위 확인]` → 엔진 `siteChoices`, design.md 10절)를 `holes`에 싣는 일만 한다. 따로 누르는 [학습하기] 단추는 없고, 고쳐 저장하면 `learnAuto`를 받아 '저절로 학습' 띠([이번만 고친 거예요]·[조건 바꾸기]·모양 고침 물음·개인정보·저장 실패 [다시 저장])를 그린다. `rows/`는 네트워크·저장소 없이 그리고 저장은 `memo/useLearned.ts`가 TASK-5 저장 함수를 부른다. 학습 창의 칸은 TASK-7 `LearnEditor`를 쓴다. 목록 차례 시험 가운데 'mark(확인 필요)가 입력할 사람 다음'을 기대하던 것은 AC-9307.1(빈칸 있는 사람이 맨 위)로 바꾸고 이름을 tdd 기록에 적는다.
- 차례: Phase 3 (Phase 2를 합친 뒤)

## TASK-7: 설정 — 학습 탭·학습 칸 고치기(LearnEditor)·건초 말 칸·주소로 탭과 칸 열기
- REQ: REQ-9304, REQ-9306, REQ-9308
- AC: AC-9304.1, AC-9304.2, AC-9304.3, AC-9306.2, AC-9308.4
- Files: src/components/settings/HospitalPhrases.tsx, src/components/settings/HospitalPhrases.test.tsx, src/components/settings/SettingsPage.tsx, src/app/(app)/settings/page.tsx, src/app/(app)/settings/page.test.tsx, src/components/settings/phrases/LearnTab.tsx, src/components/settings/phrases/LearnTab.test.tsx, src/components/settings/phrases/LearnEditor.tsx, src/components/settings/phrases/LearnEditor.test.tsx, src/components/settings/phrases/ProcTab.tsx, src/components/settings/phrases/ProcTab.test.tsx, src/components/settings/phrases/SaveDiff.tsx, src/components/settings/phrases/saveDiffRows.ts, src/components/settings/phrases/saveDiffRows.test.ts, src/components/settings/phrases/fieldPlace.test.ts
- Tests: src/components/settings/HospitalPhrases.test.tsx, src/app/(app)/settings/page.test.tsx, src/components/settings/phrases/LearnTab.test.tsx, src/components/settings/phrases/LearnEditor.test.tsx, src/components/settings/phrases/ProcTab.test.tsx, src/components/settings/phrases/saveDiffRows.test.ts, src/components/settings/phrases/fieldPlace.test.ts
- TDD: required — 시안 ?s=list 그대로, design.md 12절. `LearnEditor`는 환자 자료 없이 이름·조건·문장·바뀌는 칸 단추·노란 안내만 그린다(TASK-6이 다시 쓴다). 저장은 지금 [저장] → SaveDiff 흐름. `fieldPlace.test.ts`는 TASK-3 `why.ts`의 `FIELD_PLACE`와 설정 칸 이름이 같은지 본다. 주소 `ptab`·`field`·`learn`은 정해진 키만.
- 차례: Phase 2 (TASK-5와 동시, Phase 1을 합친 뒤)

## TASK-8: 엔진 — 모든 주사·시술 부위는 확실할 때만(수량 넘지 않음·빈칸 후보)
- REQ: REQ-9319, REQ-9308, REQ-9316
- AC: AC-9319.1, AC-9319.2, AC-9319.3, AC-9319.4, AC-9319.5, AC-9308.2, AC-9316.1
- Files: src/lib/precheck/memo/engine.ts, src/lib/precheck/memo/siteRules.test.ts, src/lib/precheck/memo/tsSites.test.ts, src/lib/precheck/memo/golden.test.ts, src/lib/precheck/memo/fullText.test.ts, src/lib/precheck/memo/buildMemo.test.ts, src/lib/precheck/memo/clinicMemo.test.ts, src/lib/precheck/memo/drugs.test.ts, src/lib/precheck/memo/memoSettings.test.ts, src/lib/precheck/memo/ourClinic.test.ts, src/lib/precheck/memo/index.ts
- Tests: src/lib/precheck/memo/siteRules.test.ts, src/lib/precheck/memo/tsSites.test.ts, src/lib/precheck/memo/golden.test.ts, src/lib/precheck/memo/fullText.test.ts
- TDD: required — design.md 9-1절. TASK-3의 KK062 `tsSites`를 `pickSites`로 넓혀 IA 줄 둘·`{부위}` noteLines 줄에도 쓴다. `siteChoices(visit)`를 엔진이 돌려주는 것에 더한다(`tsHoleChoices`는 남김). 좌우·IA 좌우·연골주사·KLG 줄 규칙은 그대로다. 골든 등 지금 시험은 부위가 하나인 사례는 그대로 두고, 두 부위 이상을 잇던 기대만 AC-9319로 바꾼다. 바꾼 시험 이름은 tdd 기록에 적는다.
- 차례: Phase 2 (TASK-3을 합친 뒤 바로, TASK-5·7과 동시)

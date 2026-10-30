# 작업 분할: 청구 사전점검 (양지바른 사전점검 가져오기)

> 형식: `## TASK-n: 제목` 아래에 `- Step:`(plan.md §6), `- AC:`, `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 수정할 수 있다. TASK 번호 = REQ 번호 = `docs/precheck/plan.md` §6 Phase 1~7의 Step 순서다. 이 순서대로 한다.
> 승인은 이 명세 하나로 한 번만 받는다(사용자: "단계마다 sdd 승인받는거 빼줘"). Phase가 끝날 때마다 `verify`·화면 캡처·쉬운 말 보고·의원 PC 시험 목록(plan.md §6).
> 화면 TASK(6·12·13·18·19·22·25·26·31·32)는 Phase 0 목업(승인본)이 있어야 시작한다(CLAUDE.md: 화면은 목업 승인 뒤).
> 도우미 C# 시험 파일 이름은 `*.test.cs`다(하네스가 시험 파일로 알아보게). 하네스 TDD 기록은 `helper/tests/*.dotnet.test.ts` 감싸개로 남긴다(design.md 11절).
> 원본 경로는 `YANGJI_SRC`(저장소 밖, `seoseungkwan/shared@2a1069b`)로만 받는다. 원본 파일은 커밋하지 않는다.

## TASK-1: 도우미 뼈대 · 메시지 틀
- Step: Phase 1 · Step 0 · `helper-skeleton`
- AC: AC-001.1~AC-001.6
- REQ: REQ-001
- Files: helper/Precheck.sln, helper/Directory.Build.props, helper/.editorconfig, helper/src/Precheck.Core/Precheck.Core.csproj, helper/src/Precheck.Core/Protocol/*, helper/src/Precheck.Helper/Precheck.Helper.csproj, helper/src/Precheck.Helper/Program.cs, helper/src/Precheck.Helper/DiagnosticLog.cs, helper/tests/Precheck.Core.Tests/Precheck.Core.Tests.csproj, helper/tests/Precheck.Core.Tests/Protocol/*, helper/tests/runDotnet.ts, src/lib/bridge/commands.json, vitest.config.ts, tsconfig.json, .gitignore
- Tests: helper/tests/protocol.dotnet.test.ts
- TDD: required
- 먼저: 이 서버에 .NET 10 SDK를 `~/.dotnet`에 설치한다(dotnet-install.sh, 관리자 권한 없음). NuGet: `System.Text.Json`·`Microsoft.NETFramework.ReferenceAssemblies`·`xunit`·`xunit.runner.visualstudio`·`Microsoft.NET.Test.Sdk`를 정확한 버전으로 고정한다(design.md 14절). vitest `include`에 `helper/tests/*.test.ts`·`extension/**/*.test.ts`를 더하고, 루트 tsconfig `exclude`에 `extension`·`helper`를 더한다. `.gitignore`에 `helper/**/bin/`·`helper/**/obj/`

## TASK-2: 도우미 윈도우 빌드 · 설치 파일
- Step: Phase 1 · Step 1 · `helper-build`
- AC: AC-002.1~AC-002.5
- REQ: REQ-002
- Files: .github/workflows/helper.yml, helper/install/install.cmd, helper/install/install.ps1, helper/install/uninstall.ps1, helper/install/host-manifest.json, helper/install/README.md
- Tests: helper/tests/build.test.ts
- TDD: required
- 끝 조건: Actions 윈도우에서 한 번 돌아 zip이 artifact로 올라간다(`gh run`으로 확인). 실패 원인이 net48·FlaUI 빌드면 사용자에게 알린다(design.md 16절)

## TASK-3: 크롬 확장
- Step: Phase 1 · Step 2 · `extension`
- AC: AC-003.1~AC-003.8
- REQ: REQ-003
- Files: extension/manifest.json, extension/tsconfig.json, extension/src/background.ts, extension/src/relay.ts, extension/src/chromeLike.ts, extension/src/*.test.ts, package.json, package-lock.json, vitest.config.ts, tsconfig.json, eslint.config.mjs, src/guardrails.test.ts, .gitignore, .github/workflows/helper.yml
- Tests: extension/src/manifest.test.ts, extension/src/relay.test.ts, extension/src/background.test.ts, src/guardrails.test.ts
- TDD: required
- 새 패키지: `@types/chrome`(dev, 정확한 버전). 스크립트 `ext:build`(`tsc -p extension/tsconfig.json` + manifest 복사). ESLint `ignores`에 `extension/dist/`. workflow에 `extension` 일을 더한다

## TASK-4: 웹 통로 코드 · 울타리
- Step: Phase 1 · Step 3 · `bridge-client`
- AC: AC-004.1~AC-004.8
- REQ: REQ-004
- Files: src/lib/bridge/protocol.ts, src/lib/bridge/versions.ts, src/lib/bridge/extensionId.ts, src/lib/bridge/handshake.ts, src/lib/bridge/client.ts, src/lib/bridge/*.test.ts, src/types/bridge.ts, eslint.config.mjs, src/guardrails.test.ts, src/lib/csp.test.ts, src/lib/errors.ts, src/types/errors.ts, src/lib/errors.test.ts
- Tests: src/lib/bridge/protocol.test.ts, src/lib/bridge/handshake.test.ts, src/lib/bridge/client.test.ts, src/guardrails.test.ts, src/lib/csp.test.ts, src/lib/errors.test.ts
- TDD: required

## TASK-5: 비트 찾기 · 읽기 전용 접속 · 기관기호
- Step: Phase 1 · Step 4 · `bit-connect`
- AC: AC-005.1~AC-005.7
- REQ: REQ-005
- Files: helper/src/Precheck.Core/Bit/*, helper/src/Precheck.Core/Registration/*, helper/src/Precheck.Core/Store/IProtector.cs, helper/src/Precheck.Windows/Precheck.Windows.csproj, helper/src/Precheck.Windows/InstallationLocator.cs, helper/src/Precheck.Windows/NativeEnvironmentGuard.cs, helper/src/Precheck.Windows/ReadOnlyConnection.cs, helper/src/Precheck.Windows/VendorLogin.cs, helper/src/Precheck.Windows/SqlBitDb.cs, helper/src/Precheck.Windows/DpapiProtector.cs, helper/src/Precheck.Windows/ConfirmWindow.cs, helper/src/Precheck.Helper/Commands/*, helper/src/Precheck.Helper/Program.cs, helper/Precheck.sln, helper/tests/Precheck.Core.Tests/Bit/*, helper/tests/Precheck.Core.Tests/Registration/*, helper/tests/Precheck.Windows.Tests/Precheck.Windows.Tests.csproj, helper/tests/Precheck.Windows.Tests/Connect/*
- Tests: helper/tests/bit-connect.dotnet.test.ts
- TDD: required
- 윈도우 전용 시험(`Precheck.Windows.Tests/Connect`)은 Actions에서 돈다. 의원 PC 시험: 설치 → 연결 확인 → 비트 읽기 → 기관기호 확인

## TASK-6: 설치·연결 확인 화면
- Step: Phase 1 · Step 5 · `setup-screen`
- AC: AC-006.1~AC-006.6
- REQ: REQ-006
- Files: src/app/(app)/claim/setup/page.tsx, src/app/(app)/claim/setup/page.test.tsx, src/app/(app)/claim/page.tsx, src/app/(app)/claim/page.test.tsx, src/components/claim/setup/*, src/components/claim/useBridge.ts, src/components/claim/useBridge.test.ts, src/components/claim/maskInstitution.ts, src/components/claim/maskInstitution.test.ts, src/components/shell/menu.ts, src/components/shell/TabBar.tsx, src/components/shell/shell.test.tsx, src/lib/errors.ts, src/types/errors.ts, src/lib/errors.test.ts
- Tests: src/app/(app)/claim/setup/page.test.tsx, src/app/(app)/claim/page.test.tsx, src/components/claim/setup/SetupScreen.test.tsx, src/components/claim/useBridge.test.ts, src/components/claim/maskInstitution.test.ts, src/components/shell/shell.test.tsx, src/lib/errors.test.ts
- TDD: required

## TASK-7: 규칙표 · 약 · 상병 표
- Step: Phase 2 · Step 0 · `rule-data`
- AC: AC-007.1~AC-007.5
- REQ: REQ-007
- Files: scripts/precheck/import-tables.mjs, src/lib/precheck/data/*, src/lib/precheck/tables.ts, src/lib/precheck/tables.test.ts, src/workers/precheck/tables.ts, src/workers/precheck/tables.test.ts, src/types/precheck.ts, fixtures/precheck/fake-source/*, fixtures/precheck/import-tables.test.ts, src/lib/errors.ts, src/types/errors.ts, src/lib/errors.test.ts
- Tests: src/lib/precheck/tables.test.ts, src/workers/precheck/tables.test.ts, fixtures/precheck/import-tables.test.ts, src/lib/errors.test.ts
- TDD: required
- 규칙 ID 제약(design.md 8-1)은 원본 262개로 확인했다. 옮긴 표가 이 모양을 벗어나면 시험이 실패한다

## TASK-8: 한 달 자료 · 12개월 이력 읽기 (도우미)
- Step: Phase 2 · Step 1 · `bit-claim-read`
- AC: AC-008.1~AC-008.5
- REQ: REQ-008
- Files: helper/src/Precheck.Core/Bit/*, helper/src/Precheck.Core/Claim/*, helper/src/Precheck.Windows/VendorGridExport.cs, helper/src/Precheck.Windows/SqlBitDb.cs, helper/src/Precheck.Helper/Commands/*, helper/tests/Precheck.Core.Tests/Bit/*, helper/tests/Precheck.Core.Tests/Claim/*, helper/tests/Precheck.Windows.Tests/Claim/*
- Tests: helper/tests/claim-read.dotnet.test.ts
- TDD: required

## TASK-9: 점검용 모양 · 조각 모으기 (Worker)
- Step: Phase 2 · Step 2 · `claim-shape`
- AC: AC-009.1~AC-009.5
- REQ: REQ-009
- Files: src/workers/precheck/assemble.ts, src/workers/precheck/assemble.test.ts, src/workers/precheck/jobs.ts, src/workers/precheck/jobs.test.ts, src/workers/precheck.worker.ts, src/lib/precheck/shape.ts, src/lib/precheck/shape.test.ts, src/types/precheck.ts, fixtures/precheck/fake/*, fixtures/precheck/make-fake-claims.ts, fixtures/precheck/make-fake-claims.test.ts, src/lib/errors.ts, src/types/errors.ts, src/lib/errors.test.ts
- Tests: src/workers/precheck/assemble.test.ts, src/workers/precheck/jobs.test.ts, src/lib/precheck/shape.test.ts, fixtures/precheck/make-fake-claims.test.ts, src/lib/errors.test.ts
- TDD: required

## TASK-10: 점검 규칙 엔진 (골든)
- Step: Phase 2 · Step 3 · `rule-engine`
- AC: AC-010.1~AC-010.6
- REQ: REQ-010
- Files: src/lib/precheck/rules/*, scripts/precheck/golden/*, fixtures/precheck/golden/rules-*.json, fixtures/precheck/golden/rules-coverage.json, fixtures/precheck/fake/*, fixtures/precheck/make-fake-claims.ts, src/workers/precheck/jobs.ts, src/workers/precheck/jobs.test.ts, src/types/precheck.ts
- Tests: src/lib/precheck/rules/engine.test.ts, src/lib/precheck/rules/golden.test.ts, src/lib/precheck/rules/coverage.test.ts, src/workers/precheck/jobs.test.ts
- TDD: required

## TASK-11: 추천 상병 · 상병 확인 (골든)
- Step: Phase 2 · Step 4 · `dx-check`
- AC: AC-011.1~AC-011.4
- REQ: REQ-011
- Files: src/lib/precheck/dx/*, scripts/precheck/golden/*, fixtures/precheck/golden/dx-*.json, fixtures/precheck/fake/*, fixtures/precheck/make-fake-claims.ts, src/workers/precheck/jobs.ts, src/workers/precheck/jobs.test.ts, src/types/precheck.ts
- Tests: src/lib/precheck/dx/recommend.test.ts, src/lib/precheck/dx/golden.test.ts, src/workers/precheck/jobs.test.ts
- TDD: required

## TASK-12: 규칙 설정 (DB · 저장 · 설정 화면 규칙 칸)
- Step: Phase 2 · Step 5 · `rule-settings`
- AC: AC-012.1~AC-012.7
- REQ: REQ-012
- Files: supabase/migrations/20261030000000_precheck_settings.sql, supabase/precheck.rls.test.ts, src/lib/storage/claimSettings.ts, src/lib/storage/claimSettings.test.ts, src/lib/precheck/settingsChanged.ts, src/lib/precheck/settingsChanged.test.ts, src/types/db.ts, src/types/precheck.ts, src/components/settings/RuleSettings.tsx, src/components/settings/RuleSettings.test.tsx, src/components/settings/SettingsPage.tsx, src/app/(app)/settings/page.tsx, src/app/(app)/settings/page.test.tsx, src/components/shell/menu.ts, src/components/shell/shell.test.tsx, src/lib/errors.ts, src/types/errors.ts, src/lib/errors.test.ts
- Tests: supabase/precheck.rls.test.ts, src/lib/storage/claimSettings.test.ts, src/lib/precheck/settingsChanged.test.ts, src/components/settings/RuleSettings.test.tsx, src/app/(app)/settings/page.test.tsx, src/components/shell/shell.test.tsx, src/lib/errors.test.ts
- TDD: required
- 사용자 할 일(Phase 2 의원 PC 시험 전): 이 마이그레이션을 Supabase SQL 편집기에 붙여 넣는다

## TASK-13: 청구 화면 · 날짜 목록 · 점검
- Step: Phase 2 · Step 6 · `precheck-screen`
- AC: AC-013.1~AC-013.9
- REQ: REQ-013
- Files: src/app/(app)/claim/page.tsx, src/app/(app)/claim/page.test.tsx, src/components/claim/*, src/components/claim/rows/*, src/lib/precheck/excel.ts, src/lib/precheck/excel.test.ts, src/workers/precheck/jobs.ts, src/workers/precheck/jobs.test.ts, src/workers/precheck.worker.ts, src/lib/storage/claimCounts.ts, src/lib/storage/claimCounts.test.ts, src/types/db.ts, eslint.config.mjs, src/guardrails.test.ts, src/lib/errors.ts, src/types/errors.ts, src/lib/errors.test.ts
- Tests: src/lib/storage/claimCounts.test.ts, src/components/claim/dateList.test.ts, src/components/claim/ClaimScreen.test.tsx, src/components/claim/SettingsChangedBanner.test.tsx, src/components/claim/rows/FindingRows.test.tsx, src/lib/precheck/excel.test.ts, src/workers/precheck/jobs.test.ts, src/app/(app)/claim/page.test.tsx, src/guardrails.test.ts
- TDD: required
- `claimCounts.ts`는 이 TASK에서 읽기(`claim_day_counts` select)만 만든다. 표가 없으면(마이그레이션 전) 빈 목록으로 본다. 쓰기는 TASK-19
- 의원 PC 시험: 실제 한 달 자료로 점검하고 같은 달을 양지바른 결과와 나란히 비교

## TASK-14: 청구메모 문장 (골든)
- Step: Phase 3 · Step 0 · `memo-text`
- AC: AC-014.1~AC-014.4
- REQ: REQ-014
- Files: src/lib/precheck/memo/*, scripts/precheck/golden/*, fixtures/precheck/golden/memo-*.json, fixtures/precheck/golden/phrases-*.json, fixtures/precheck/fake/*, fixtures/precheck/make-fake-claims.ts, src/workers/precheck/jobs.ts, src/workers/precheck/jobs.test.ts, src/types/precheck.ts
- Tests: src/lib/precheck/memo/buildMemo.test.ts, src/lib/precheck/memo/phrases.test.ts, src/lib/precheck/memo/golden.test.ts, src/workers/precheck/jobs.test.ts
- TDD: required

## TASK-15: 도우미 작업 저장 (DPAPI)
- Step: Phase 3 · Step 1 · `helper-store`
- AC: AC-015.1~AC-015.7
- REQ: REQ-015
- Files: helper/src/Precheck.Core/Store/*, helper/src/Precheck.Windows/DpapiProtector.cs, helper/src/Precheck.Helper/Commands/*, helper/tests/Precheck.Core.Tests/Store/*, helper/tests/Precheck.Windows.Tests/Store/*
- Tests: helper/tests/store.dotnet.test.ts
- TDD: required

## TASK-16: 비트 메모 비교 (두 번 입력 막기)
- Step: Phase 3 · Step 2 · `bit-memo-compare`
- AC: AC-016.1~AC-016.4
- REQ: REQ-016
- Files: helper/src/Precheck.Core/Bit/Sql.cs, helper/src/Precheck.Core/Claim/*, helper/src/Precheck.Helper/Commands/*, helper/tests/Precheck.Core.Tests/Bit/*, helper/tests/Precheck.Core.Tests/Claim/*, src/lib/precheck/memoCompare.ts, src/lib/precheck/memoCompare.test.ts, src/workers/precheck/jobs.ts, src/workers/precheck/jobs.test.ts, src/types/precheck.ts
- Tests: helper/tests/memo-compare.dotnet.test.ts, src/lib/precheck/memoCompare.test.ts, src/workers/precheck/jobs.test.ts
- TDD: required

## TASK-17: 비트 자동 입력 (FlaUI · PC 확인 창)
- Step: Phase 3 · Step 3 · `bit-input`
- AC: AC-017.1~AC-017.8
- REQ: REQ-017
- Files: helper/src/Precheck.Core/Input/*, helper/src/Precheck.Core/Store/*, helper/src/Precheck.Windows/Precheck.Windows.csproj, helper/src/Precheck.Windows/NativeTarget.cs, helper/src/Precheck.Windows/UChartAutomation.cs, helper/src/Precheck.Windows/ConfirmWindow.cs, helper/src/Precheck.Windows/ProgressWindow.cs, helper/src/Precheck.Helper/Commands/*, helper/tests/Precheck.Core.Tests/Input/*, helper/tests/Precheck.Windows.Tests/Input/*
- Tests: helper/tests/input.dotnet.test.ts
- TDD: required
- NuGet `FlaUI.Core`·`FlaUI.UIA3` 4.0.0(정확한 버전). 의원 PC 시험: 시험용 환자 한 명 → 실제 하루치

## TASK-18: 메모 화면 · 입력 결과 · 병원 문구 칸
- Step: Phase 3 · Step 4 · `memo-screen`
- AC: AC-018.1~AC-018.7
- REQ: REQ-018
- Files: src/components/claim/*, src/components/claim/memo/*, src/components/claim/rows/*, src/components/settings/HospitalPhrases.tsx, src/components/settings/HospitalPhrases.test.tsx, src/components/settings/DxLinks.tsx, src/components/settings/DxLinks.test.tsx, src/components/settings/SettingsPage.tsx, src/app/(app)/claim/page.tsx, src/app/(app)/claim/page.test.tsx, src/workers/precheck/jobs.ts, src/workers/precheck/jobs.test.ts, src/workers/precheck.worker.ts, src/lib/errors.ts, src/types/errors.ts, src/lib/errors.test.ts
- Tests: src/components/claim/memo/MemoPanel.test.tsx, src/components/claim/memo/InputResults.test.tsx, src/components/claim/memo/useMemoDrafts.test.ts, src/components/claim/rows/MemoRows.test.tsx, src/components/settings/HospitalPhrases.test.tsx, src/components/settings/DxLinks.test.tsx, src/workers/precheck/jobs.test.ts, src/lib/errors.test.ts
- TDD: required

## TASK-19: 입력 현황 건수 · 밖에서 보기
- Step: Phase 3 · Step 5 · `claim-counts`
- AC: AC-019.1~AC-019.6
- REQ: REQ-019
- Files: supabase/migrations/20261030000100_precheck_counts.sql, supabase/precheck.rls.test.ts, src/lib/storage/claimCounts.ts, src/lib/storage/claimCounts.test.ts, src/lib/precheck/counts.ts, src/lib/precheck/counts.test.ts, src/types/db.ts, src/components/claim/OutsideCounts.tsx, src/components/claim/OutsideCounts.test.tsx, src/components/claim/useCountsUpload.ts, src/components/claim/useCountsUpload.test.ts, src/components/claim/ClaimScreen.tsx, src/app/(app)/claim/page.tsx, src/app/(app)/claim/page.test.tsx, src/workers/precheck/jobs.ts, src/workers/precheck/jobs.test.ts, src/lib/errors.ts, src/types/errors.ts, src/lib/errors.test.ts
- Tests: supabase/precheck.rls.test.ts, src/lib/storage/claimCounts.test.ts, src/lib/precheck/counts.test.ts, src/components/claim/OutsideCounts.test.tsx, src/components/claim/useCountsUpload.test.ts, src/app/(app)/claim/page.test.tsx, src/workers/precheck/jobs.test.ts, src/lib/errors.test.ts
- TDD: required
- 사용자 할 일(Phase 3 의원 PC 시험 전): 이 마이그레이션을 SQL 편집기에 붙여 넣는다

## TASK-20: 심평원 청구 파일 읽기 (도우미)
- Step: Phase 4 · Step 0 · `sam-read`
- AC: AC-020.1~AC-020.4
- REQ: REQ-020
- Files: helper/src/Precheck.Core/Sam/*, helper/src/Precheck.Helper/Commands/*, helper/tests/Precheck.Core.Tests/Sam/*, .gitignore
- Tests: helper/tests/sam.dotnet.test.ts
- TDD: required
- `.gitignore`에 실제 청구 파일(`*.GHP`·`*.CAR`, 대소문자 무시)을 막는 줄을 더한다. 시험은 임시 폴더에 가짜 파일을 만든다

## TASK-21: SAM 대조 (골든)
- Step: Phase 4 · Step 1 · `sam-match`
- AC: AC-021.1~AC-021.3
- REQ: REQ-021
- Files: src/lib/precheck/sam/*, scripts/precheck/golden/*, fixtures/precheck/golden/sam-*.json, fixtures/precheck/make-fake-sam.ts, fixtures/precheck/make-fake-sam.test.ts, src/workers/precheck/jobs.ts, src/workers/precheck/jobs.test.ts, src/types/precheck.ts
- Tests: src/lib/precheck/sam/parseSam.test.ts, src/lib/precheck/sam/samCheck.test.ts, src/lib/precheck/sam/monthClose.test.ts, src/lib/precheck/sam/golden.test.ts, fixtures/precheck/make-fake-sam.test.ts, src/workers/precheck/jobs.test.ts
- TDD: required

## TASK-22: 월말 마감 화면
- Step: Phase 4 · Step 2 · `month-close-screen`
- AC: AC-022.1~AC-022.5
- REQ: REQ-022
- Files: src/app/(app)/claim/close/page.tsx, src/app/(app)/claim/close/page.test.tsx, src/components/claim/close/*, src/components/claim/rows/*, src/components/claim/OutsideCounts.tsx, src/components/claim/OutsideCounts.test.tsx, src/lib/storage/claimCounts.ts, src/lib/storage/claimCounts.test.ts, src/lib/precheck/counts.ts, src/lib/precheck/counts.test.ts, src/workers/precheck/jobs.ts, src/workers/precheck/jobs.test.ts, src/workers/precheck.worker.ts, src/lib/errors.ts, src/types/errors.ts, src/lib/errors.test.ts
- Tests: src/components/claim/close/MonthClose.test.tsx, src/components/claim/rows/CloseRows.test.tsx, src/components/claim/OutsideCounts.test.tsx, src/lib/storage/claimCounts.test.ts, src/lib/precheck/counts.test.ts, src/app/(app)/claim/close/page.test.tsx, src/workers/precheck/jobs.test.ts, src/lib/errors.test.ts
- TDD: required
- 의원 PC 시험: 지난달 청구 파일로 대조

## TASK-23: F/U · 정기 주사 대상 읽기 (도우미)
- Step: Phase 5 · Step 0 · `followup-read`
- AC: AC-023.1~AC-023.3
- REQ: REQ-023
- Files: helper/src/Precheck.Core/Contact/*, helper/src/Precheck.Core/Bit/*, helper/src/Precheck.Windows/VendorGridExport.cs, helper/src/Precheck.Windows/SqlBitDb.cs, helper/src/Precheck.Helper/Commands/*, helper/tests/Precheck.Core.Tests/Contact/*
- Tests: helper/tests/contact-read.dotnet.test.ts
- TDD: required
- 전화번호를 읽는 자리는 시작할 때 원본 `revisit_source_boot.js`·`revisit_source_parts.py`로 확인한다. 원본이 비트 DB에서 따로 읽으면 그 SQL을 그대로 옮긴다

## TASK-24: F/U · 정기 주사 목록 계산 (골든)
- Step: Phase 5 · Step 1 · `followup-logic`
- AC: AC-024.1~AC-024.4
- REQ: REQ-024
- Files: src/lib/precheck/followup/*, scripts/precheck/golden/*, fixtures/precheck/golden/followup-*.json, fixtures/precheck/fake/*, fixtures/precheck/make-fake-claims.ts, src/workers/precheck/jobs.ts, src/workers/precheck/jobs.test.ts, src/types/precheck.ts
- Tests: src/lib/precheck/followup/parseFU.test.ts, src/lib/precheck/followup/recall.test.ts, src/lib/precheck/followup/golden.test.ts, src/workers/precheck/jobs.test.ts
- TDD: required

## TASK-25: 문자 문구 (설정 칸 · 복사)
- Step: Phase 5 · Step 2 · `message-templates`
- AC: AC-025.1~AC-025.4
- REQ: REQ-025
- Files: src/lib/messages/fill.ts, src/lib/messages/fill.test.ts, src/lib/messages/defaults.ts, scripts/precheck/golden/*, fixtures/precheck/golden/messages-*.json, src/components/settings/MessageTemplates.tsx, src/components/settings/MessageTemplates.test.tsx, src/components/settings/SettingsPage.tsx, src/components/common/CopyButton.tsx, src/components/common/CopyButton.test.tsx, src/lib/storage/claimSettings.ts, src/lib/storage/claimSettings.test.ts
- Tests: src/lib/messages/fill.test.ts, src/components/settings/MessageTemplates.test.tsx, src/components/common/CopyButton.test.tsx, src/lib/storage/claimSettings.test.ts
- TDD: required

## TASK-26: 환자 연락 화면
- Step: Phase 5 · Step 3 · `contact-screen`
- AC: AC-026.1~AC-026.6
- REQ: REQ-026
- Files: src/app/(app)/contact/page.tsx, src/app/(app)/contact/page.test.tsx, src/components/contact/*, src/components/contact/rows/*, src/components/claim/OutsideCounts.tsx, src/components/claim/OutsideCounts.test.tsx, src/components/claim/useBridge.ts, src/lib/storage/claimCounts.ts, src/lib/storage/claimCounts.test.ts, src/lib/precheck/counts.ts, src/lib/precheck/counts.test.ts, src/workers/precheck/jobs.ts, src/workers/precheck/jobs.test.ts, src/workers/precheck.worker.ts, src/components/shell/menu.ts, src/components/shell/shell.test.tsx, eslint.config.mjs, src/guardrails.test.ts
- Tests: src/components/contact/ContactScreen.test.tsx, src/components/contact/rows/ContactRows.test.tsx, src/components/claim/OutsideCounts.test.tsx, src/lib/storage/claimCounts.test.ts, src/lib/precheck/counts.test.ts, src/app/(app)/contact/page.test.tsx, src/workers/precheck/jobs.test.ts, src/components/shell/shell.test.tsx, src/guardrails.test.ts
- TDD: required
- 의원 PC 시험: 이번 주 F/U 명단을 양지바른과 비교

## TASK-27: 통계 자료 읽기 (도우미 · Worker 연결)
- Step: Phase 6 · Step 0 · `helper-stats-read`
- AC: AC-027.1~AC-027.4
- REQ: REQ-027
- Files: helper/src/Precheck.Core/Stats/*, helper/src/Precheck.Core/Bit/*, helper/src/Precheck.Windows/VendorGridExport.cs, helper/src/Precheck.Windows/SqlBitDb.cs, helper/src/Precheck.Helper/Commands/*, helper/tests/Precheck.Core.Tests/Stats/*, src/workers/precheck/statsRows.ts, src/workers/precheck/statsRows.test.ts, src/workers/precheck/jobs.ts, src/workers/precheck/jobs.test.ts, src/types/precheck.ts
- Tests: helper/tests/stats-read.dotnet.test.ts, src/workers/precheck/statsRows.test.ts, src/workers/precheck/jobs.test.ts
- TDD: required

## TASK-28: 처방 추세
- Step: Phase 6 · Step 1 · `rx-trend`
- AC: AC-028.1~AC-028.4
- REQ: REQ-028
- Files: src/lib/analytics/rxTrend.ts, src/lib/analytics/rxTrend.test.ts, src/types/analysis.ts
- Tests: src/lib/analytics/rxTrend.test.ts
- TDD: required

## TASK-29: 신환 30일 재방문 · 처방별 신환·재진
- Step: Phase 6 · Step 2 · `revisit-30`
- AC: AC-029.1~AC-029.4
- REQ: REQ-029
- Files: src/lib/analytics/revisit30.ts, src/lib/analytics/revisit30.test.ts, src/lib/analytics/rxVisitSplit.ts, src/lib/analytics/rxVisitSplit.test.ts, scripts/precheck/golden/*, fixtures/precheck/golden/rx-visit-split-*.json, src/types/analysis.ts
- Tests: src/lib/analytics/revisit30.test.ts, src/lib/analytics/rxVisitSplit.test.ts
- TDD: required

## TASK-30: 일일 · 월말 보고 문장
- Step: Phase 6 · Step 3 · `report-text`
- AC: AC-030.1~AC-030.4
- REQ: REQ-030
- Files: src/lib/report/reportText.ts, src/lib/report/reportText.test.ts, scripts/precheck/golden/*, fixtures/precheck/golden/report-*.json, src/types/report.ts
- Tests: src/lib/report/reportText.test.ts
- TDD: required

## TASK-31: 통계 화면 추가분
- Step: Phase 6 · Step 4 · `stats-screen`
- AC: AC-031.1~AC-031.5
- REQ: REQ-031
- Files: src/app/(app)/stats/page.tsx, src/app/(app)/stats/page.test.tsx, src/components/stats/*, src/components/common/CopyButton.tsx, src/workers/precheck/jobs.ts, src/workers/precheck/jobs.test.ts, src/workers/precheck.worker.ts, src/components/shell/menu.ts, src/components/shell/shell.test.tsx
- Tests: src/components/stats/StatsExtras.test.tsx, src/components/stats/TrendChart.test.tsx, src/components/stats/ReportText.test.tsx, src/app/(app)/stats/page.test.tsx, src/workers/precheck/jobs.test.ts, src/components/shell/shell.test.tsx
- TDD: required
- 통계 기본 화면이 아직 없으면 이 TASK는 추가분과 자료 고르기만 둔다(design.md 17절 질문 1)
- 의원 PC 시험: 지난달 숫자를 양지바른·비트 통계와 비교

## TASK-32: 백업에 설정 넣기
- Step: Phase 7 · Step 0 · `backup-settings`
- AC: AC-032.1~AC-032.4
- REQ: REQ-032
- Files: src/lib/backup/tables.ts, src/lib/backup/backup.ts, src/lib/backup/backup.test.ts, src/lib/backup/restoreSql.ts, src/lib/backup/restoreSql.test.ts, supabase/backup.test.ts, src/components/settings/BackupButton.tsx, src/components/settings/BackupButton.test.tsx, src/components/settings/SettingsPage.tsx, src/lib/errors.ts, src/types/errors.ts, src/lib/errors.test.ts
- Tests: src/lib/backup/backup.test.ts, src/lib/backup/restoreSql.test.ts, supabase/backup.test.ts, src/components/settings/BackupButton.test.tsx, src/lib/errors.test.ts
- TDD: required

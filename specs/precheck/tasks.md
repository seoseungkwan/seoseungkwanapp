# 작업 분할: 청구 사전점검 (양지바른 사전점검 가져오기)

> 형식: `## TASK-n: 제목` 아래에 `- Step:`(plan.md §6), `- AC:`, `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 수정할 수 있다. TASK 번호 = REQ 번호 = `docs/precheck/plan.md` §6 Phase 1~7의 Step 순서다. 이 순서대로 한다. 예외 둘: ① TASK-33(REQ-005 후속, TASK-5를 만들며 찾은 빈틈)은 Phase 1 Step 5 `helper-fixups`로 TASK-5 뒤·TASK-6 앞에 한다. 그래서 TASK-6은 Phase 1 Step 6이다(plan.md §6에는 아직 Step 5로 적혀 있다). ② TASK-34(REQ-034, b2b 개편 합치기 맞춤)는 plan.md §6 밖이고 Phase 1 끝·Phase 2(TASK-7) 앞에 한다. TASK-34는 여러 층을 함께 고친다(합치기 한 번에 함께 풀어야 하는 파일들이라 나누지 않는다). REQ-033은 없다.
> 승인은 이 명세 하나로 한 번만 받는다(사용자: "단계마다 sdd 승인받는거 빼줘"). Phase가 끝날 때마다 `verify`·화면 캡처·쉬운 말 보고·의원 PC 시험 목록(plan.md §6).
> Phase가 끝나면 Phase PR을 만든다. 합치기(merge)·운영 배포·도우미 릴리스 태그(`helper-v*`)는 사용자가 그때마다 지시할 때만 한다. Claude가 자동으로 하지 않는다. 의원 PC 시험은 그 뒤에 한다(확장과 `commands.json`에는 운영 주소 하나만 있어, 새 화면이 운영에 배포돼야 의원 PC에서 시험할 수 있다. design.md 12절).
> 화면 TASK(6·12·13·18·19·22·25·26·31·32)는 Phase 0 목업(승인본)이 있어야 시작한다(CLAUDE.md: 화면은 목업 승인 뒤). TASK-34 뒤의 화면 TASK는 b2b 공통 모양 `ds`와 토큰만 쓴다(옛 `ui`·옛 Tailwind 별칭·`font-bold` 없음, design.md 18-3).
> **새 목업 승인(2026-11-01·2026-11-02)**: TASK-18은 Phase 0 목업에 없는 것을 그린다. '병원 문구'·'시술별 약' 칸과 입력 쪽(입력 방식 고르기·코드 단추·목록·다른 메모 나란히 보기·비트 메모 카드·TASK-37의 PC 확인 창 체크 '이제부터 묻지 않기')은 목업이 승인됐다(TASK-18의 링크 줄). 쓰다 멈춘 사람·기관기호 안내·처음 질문·설정 변경 띠는 2026-11-02 승인한 목업을 따른다(TASK-18의 링크 줄). TASK-13은 승인본 `499cp2Sodph7jYJ4gX4exj` 그대로 시작한다.
> **2026-11-01 명세 변경**: TASK-35~39를 더했다(plan.md §6 밖). step 파일이 없고 이 파일과 design.md 19절이 그 일을 정한다. 번호가 곧 차례는 아니다. **남은 차례**: ① TASK-10·11·12(먼저 시작함) → ② 나란히: TASK-14 · TASK-35 · TASK-38 → ③ TASK-16 웹 쪽(TASK-14 뒤) · TASK-36(TASK-35 뒤) → ④ TASK-13(TASK-10·11·12·14·16 뒤) → ⑤ TASK-37(TASK-36 뒤. 입력 쪽 목업은 승인됨) → ⑥ TASK-18(TASK-13·14·16·35·36·37 뒤) → ⑦ TASK-19 → 그 뒤 Phase 4부터 그대로. TASK-35·36·37은 `Core/Input`을 함께 고쳐 나란히 하지 않는다. TASK-14 → 16 → 13은 `jobs.ts`·`jobs.test.ts`·`types/precheck.ts`를 함께 고치고 앞 TASK의 결과를 쓰므로 차례대로 한다: TASK-16의 비교는 TASK-14의 메모 글을 쓰고, TASK-14는 고친 메모를 인자로만 받으며 `store.load`를 거기에 잇는 것은 TASK-16이다. TASK-39는 언제든 한다. 도우미 판(`Version`·`LATEST_HELPER`·`MIN_HELPER`)은 릴리스 때 올리고, 릴리스는 사용자가 지시할 때만 한다(design.md 19-5).
> **2026-11-02 명세 변경**: TASK-40을 더했다(plan.md §6 밖, `phases/precheck-3-memo/step6.md`). 비트의 다른 메모를 사람마다 묻지 않고 기본으로 바꾼다(사용자 결정, design.md 19-6). 차례는 TASK-19 뒤, Phase 3 끝 점검 앞이다. 사이트만 고치고 도우미는 그대로다. TASK-40은 끝난 TASK-16·18·19의 AC 일부를 바꾸므로 앞 TASK의 시험 가운데 뒤집히는 것은 이 TASK가 고친다.
> 도우미 C# 시험 파일 이름은 `*.test.cs`다(하네스가 시험 파일로 알아보게). 하네스 TDD 기록은 `helper/tests/*.dotnet.test.ts` 감싸개로 남긴다(design.md 11절).
> 원본 경로는 `YANGJI_SRC`(저장소 밖, `seoseungkwan/shared@2a1069b`)로만 받는다. 원본 파일은 커밋하지 않는다.

## TASK-1: 도우미 뼈대 · 메시지 틀
- Step: Phase 1 · Step 0 · `helper-skeleton`
- AC: AC-001.1~AC-001.6
- REQ: REQ-001
- Files: helper/Precheck.sln, helper/Directory.Build.props, helper/.editorconfig, helper/src/Precheck.Core/Precheck.Core.csproj, helper/src/Precheck.Core/Protocol/*, helper/src/Precheck.Helper/Precheck.Helper.csproj, helper/src/Precheck.Helper/Program.cs, helper/src/Precheck.Helper/DiagnosticLog.cs, helper/tests/Precheck.Core.Tests/Precheck.Core.Tests.csproj, helper/tests/Precheck.Core.Tests/Protocol/*, helper/tests/runDotnet.ts, src/lib/bridge/commands.json, vitest.config.ts, tsconfig.json, .gitignore
- Tests: helper/tests/protocol.dotnet.test.ts
- TDD: required
- 먼저: 이 서버에 .NET 10 SDK를 `~/.dotnet`에 설치한다(dotnet-install.sh, 관리자 권한 없음). NuGet: `System.Text.Json`·`Microsoft.NETFramework.ReferenceAssemblies`·`xunit`·`xunit.runner.visualstudio`·`Microsoft.NET.Test.Sdk`를 정확한 버전으로 고정한다(design.md 14절). vitest `include`에 `helper/tests/*.test.ts`·`extension/**/*.test.ts`를 더하고, 루트 tsconfig `exclude`에 `extension`·`helper`를 더한다. `.gitignore`에 `helper/**/bin/`·`helper/**/obj/`·`*.pem`(확장 개인키가 실수로 들어가지 않게)

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
- AC: AC-003.1~AC-003.9
- REQ: REQ-003
- Files: extension/manifest.json, extension/tsconfig.json, extension/src/background.ts, extension/src/relay.ts, extension/src/chromeLike.ts, extension/src/*.test.ts, package.json, package-lock.json, vitest.config.ts, tsconfig.json, eslint.config.mjs, src/guardrails.test.ts, .gitignore, .github/workflows/helper.yml
- Tests: extension/src/manifest.test.ts, extension/src/relay.test.ts, extension/src/background.test.ts, src/guardrails.test.ts
- TDD: required
- 새 패키지: `@types/chrome`(dev, 정확한 버전). 스크립트 `ext:build`(`tsc -p extension/tsconfig.json` + manifest 복사). ESLint `ignores`에 `extension/dist/`. workflow에 `extension` 일을 더한다

## TASK-4: 웹 통로 코드 · 울타리
- Step: Phase 1 · Step 3 · `bridge-client`
- AC: AC-004.1~AC-004.11
- REQ: REQ-004
- Files: src/lib/bridge/protocol.ts, src/lib/bridge/versions.ts, src/lib/bridge/extensionId.ts, src/lib/bridge/handshake.ts, src/lib/bridge/client.ts, src/lib/bridge/workerSink.ts, src/lib/bridge/*.test.ts, src/types/bridge.ts, eslint.config.mjs, src/guardrails.test.ts, src/lib/csp.test.ts, src/lib/errors.ts, src/types/errors.ts, src/lib/errors.test.ts
- Tests: src/lib/bridge/protocol.test.ts, src/lib/bridge/handshake.test.ts, src/lib/bridge/client.test.ts, src/lib/bridge/workerSink.test.ts, src/guardrails.test.ts, src/lib/csp.test.ts, src/lib/errors.test.ts
- TDD: required

## TASK-5: 비트 찾기 · 읽기 전용 접속 · 기관기호
- Step: Phase 1 · Step 4 · `bit-connect`
- AC: AC-005.1~AC-005.7
- REQ: REQ-005
- Files: helper/src/Precheck.Core/Bit/*, helper/src/Precheck.Core/Registration/*, helper/src/Precheck.Core/Store/IProtector.cs, helper/src/Precheck.Windows/Precheck.Windows.csproj, helper/src/Precheck.Windows/InstallationLocator.cs, helper/src/Precheck.Windows/NativeEnvironmentGuard.cs, helper/src/Precheck.Windows/ReadOnlyConnection.cs, helper/src/Precheck.Windows/VendorLogin.cs, helper/src/Precheck.Windows/SqlBitDb.cs, helper/src/Precheck.Windows/DpapiProtector.cs, helper/src/Precheck.Windows/ConfirmWindow.cs, helper/src/Precheck.Helper/Commands/*, helper/src/Precheck.Helper/Program.cs, helper/Precheck.sln, helper/tests/Precheck.Core.Tests/Bit/*, helper/tests/Precheck.Core.Tests/Registration/*, helper/tests/Precheck.Windows.Tests/Precheck.Windows.Tests.csproj, helper/tests/Precheck.Windows.Tests/Connect/*
- Tests: helper/tests/bit-connect.dotnet.test.ts
- TDD: required
- 윈도우 전용 시험(`Precheck.Windows.Tests/Connect`)은 Actions에서 돈다. 의원 PC 시험: 설치 → 연결 확인 → 비트 읽기 → 기관기호 확인

## TASK-33: 도우미 마무리 · 병원 이름 빼기 · 32비트 빌드 · 읽기 전용 확인
- Step: Phase 1 · Step 5 · `helper-fixups` (TASK-5 뒤·TASK-6 앞, 머리말의 예외)
- AC: AC-005.8~AC-005.12. 바뀐 AC-005.5·AC-005.7(병원 이름 뺌)과 AC-005.12(깨진 등록 파일)에 맞게 TASK-4·TASK-5 시험의 기대값도 고친다(줄 목록은 step 파일)
- REQ: REQ-005
- Files: helper/src/Precheck.Helper/Precheck.Helper.csproj, helper/src/Precheck.Core/Registration/*, helper/src/Precheck.Core/Bit/BitCheck.cs, helper/src/Precheck.Core/Bit/BitErrors.cs, helper/tests/Precheck.Core.Tests/Registration/*, helper/tests/Precheck.Core.Tests/Bit/*, helper/tests/Precheck.Windows.Tests/Connect/DpapiProtector.test.cs, helper/tests/runDotnet.ts, helper/tests/helper-fixups.dotnet.test.ts, helper/tests/bit-connect.dotnet.test.ts, src/types/bridge.ts, src/lib/bridge/protocol.ts, src/lib/bridge/client.test.ts
- Tests: helper/tests/helper-fixups.dotnet.test.ts, helper/tests/bit-connect.dotnet.test.ts, src/lib/bridge/client.test.ts
- TDD: required
- 병원 이름(사용자 결정 2026-10-30 "사이트 이름 쓰기"): 도우미는 병원 이름을 저장·반환하지 않는다. 지금 `RegisterFlow.cs`가 범위 값(`DepHspNum`)을 이름 자리에 넣는 것을 없앤다. 웹은 `bit.check`의 `hospitalName`을 받지 않는다. 화면의 병원 이름은 TASK-6이 사이트 값으로 보인다
- `helper/tests/runDotnet.ts`는 `dotnet build`도 같은 잠금으로 부르게 넓힐 때만 고친다(감싸개가 `dotnet test`와 같은 obj/를 쓰므로)
- 의원 PC 시험(Phase 1 목록에 더함): 도우미 exe가 32비트로 도는지(작업 관리자 '플랫폼'), 연결 확인의 DB 읽기 단계가 `E-BIT-DB-FAILED`면 비트 `BITDataBaseCommon`이 추상(abstract) 클래스라 리플렉션으로 만들지 못한 것인지 먼저 본다(design.md 16절), 확인 창에 병원 이름 없이 가린 기관기호·범위가 보이는지

## TASK-6: 설치·연결 확인 화면
- Step: Phase 1 · Step 6 · `setup-screen` (TASK-33이 Step 5로 들어가 하나 밀림)
- AC: AC-006.1~AC-006.6
- REQ: REQ-006
- Files: src/app/(app)/claim/setup/page.tsx, src/app/(app)/claim/setup/page.test.tsx, src/app/(app)/claim/page.tsx, src/app/(app)/claim/page.test.tsx, src/components/claim/setup/*, src/components/claim/useBridge.ts, src/components/claim/useBridge.test.ts, src/components/claim/maskInstitution.ts, src/components/claim/maskInstitution.test.ts, src/components/shell/menu.ts, src/components/shell/TabBar.tsx, src/components/shell/shell.test.tsx, src/lib/errors.ts, src/types/errors.ts, src/lib/errors.test.ts
- Tests: src/app/(app)/claim/setup/page.test.tsx, src/app/(app)/claim/page.test.tsx, src/components/claim/setup/SetupScreen.test.tsx, src/components/claim/useBridge.test.ts, src/components/claim/maskInstitution.test.ts, src/components/shell/shell.test.tsx, src/lib/errors.test.ts
- TDD: required

## TASK-34: b2b 합치기 맞춤
- Step: Phase 1 끝 · `b2b-merge` (plan.md §6 밖, 머리말의 예외 ②. TASK-6 뒤·TASK-7 앞)
- AC: AC-034.1~AC-034.5
- REQ: REQ-034
- Files: vitest.config.ts, package.json, package-lock.json, CLAUDE.md, docs/ADR.md, docs/ARCHITECTURE.md, docs/UI_GUIDE.md, plan.md, phases/precheck-*/*.md, eslint.config.mjs, src/lib/bridge/extensionId.ts, src/lib/csp.test.ts, src/components/shell/TabBar.tsx, src/components/shell/shell.test.tsx, src/components/claim/setup/SetupScreen.tsx, src/components/claim/setup/SetupAlert.tsx, src/components/claim/setup/StepGuide.tsx, src/components/claim/setup/ClaimEntry.tsx, src/components/claim/setup/SetupScreen.test.tsx, src/b2b-merge.test.ts
- Tests: src/components/shell/shell.test.tsx, src/components/claim/setup/SetupScreen.test.tsx, src/b2b-merge.test.ts, extension/src/manifest.test.ts
- TDD: required
- 하는 일: `git merge origin/main`(b2b 개편 `359a4a4` 포함, design.md 18절). 이것은 main을 이 브랜치로 들여오는 로컬 합치기이고 PR 합치기(머리말: 사용자 지시 때만)가 아니다. 충돌 다섯 파일(`vitest.config.ts`·`package.json`·`TabBar.tsx`·`CLAUDE.md`·`docs/ADR.md`)을 18-1대로 풀고, 청구 ADR 번호를 18-2대로 바꾸고, 청구 설치 화면 네 파일과 탭 줄의 클래스를 18-3 표대로 옮긴다. 문구·동작·배치는 그대로
- 순서(design.md 18-4, 한 번에 끝낸다): 합치기 → 시험 먼저(`b2b-merge.test.ts` 새로, `SetupScreen.test.tsx`에 AC-034.2, `shell.test.tsx` AC-006.4 기대값·이름에 AC-034.1) → TDD 예외 파일 `vitest.config.ts`·`package.json`(+ `npm install`)을 RED 없이 먼저 푼다 → **RED**(`tdd-run TASK-34 --expect red`: 설정이 읽혀 시험이 돌고 `b2b-merge`의 AC-034.3·`SetupScreen`이 제 이유로 실패. 설정을 못 읽어 0개가 돈 실행은 RED로 치지 않는다) → `TabBar.tsx`를 main 쪽 파일로 두고 shell의 AC-006.4·AC-034.1이 제 이유로 실패하는 것을 본 뒤 청구 판단을 얹는다 → 청구 설치 화면·ADR 번호·`UI_GUIDE.md` → **GREEN**(`tdd-run TASK-34 --expect green`) → **합치기 커밋** → **`verify`**. `verify`는 승인 범위 검사를 `git status`로 하므로 커밋 전에는 main이 가져온 파일이 범위 밖으로 보여 실패한다. 그래서 커밋 뒤에 돌린다. 실패하면 고침 커밋을 더한다
- b2b 가드 시험은 Tests에 넣지 않는다(넣으면 승인 범위에 들어가 고칠 수 있게 된다): `src/app/theme.test.ts`·`src/components/ui/classes.test.ts`·`src/app/fonts.test.ts`·`src/comments.test.ts`·`e2e/config.test.ts`는 고치지 않고, RED·GREEN 때 `npx vitest run <파일>`로 실패·통과를 보고, 마지막에 `verify`의 `npm test` 전체가 돌린다(AC-034.3·AC-034.5). `extension/src/manifest.test.ts`는 청구 것이지만 돌리기만 한다. `shell.test.tsx`는 청구 AC-006.4 `it`의 모양 기대값과 이름만, `csp.test.ts`는 주석의 ADR 번호만 고친다
- `.harness/active`는 main 값이 들어와도 그대로 둔다(브랜치 이름이 활성 기능을 정한다)
- 금지사항(검토 항목): main 쪽 시험은 고치지 않는다 — `src/app/theme.test.ts`·`src/components/ui/classes.test.ts`·`src/app/fonts.test.ts`·`src/comments.test.ts`·`e2e/config.test.ts`, 그리고 `src/components/shell/shell.test.tsx`에서 main 쪽이 갈라진 뒤(`git merge-base HEAD^1 HEAD^2`) 고치거나 더한 `it`. 리뷰가 합치기 커밋에서 `git diff HEAD^2 -- <그 파일들>`로 본다: 다섯 파일은 비어 있고, `shell.test.tsx`에는 청구 몫만 있다 — 청구 TASK-6이 이미 고친 것(AC-008.1 `it` 둘의 이름·본문에 청구를 더함, `LABELS`·`READY`·`NOT_READY`)과 청구 AC-006.4 `it`(모양 기대값·이름의 AC-034.1)
- 끝 조건: 합치기 커밋 뒤 `python3 ~/.claude/harness/bin/verify`(`npm test` 전체·`npm run lint` 경고 0·`npm run build`)가 통과한다(AC 시험이 아니다). 화면 사진(`dev-browser`, 390·1440)으로 `/claim/setup`의 탭 줄([설정] 지금 탭)·설정 안 메뉴·단계 칩을 b2b 관리자 화면과 견주어 보고에 붙인다. 의원 PC 시험은 없다(모양만 바뀜)
- PR #7 자동 코드 검토 1차 고침(위 합치기 RED·GREEN과 따로 한 번 더 돈다): #1 `phases/precheck-5-contact/step3.md`(연락 남은 건수는 기간·탭으로 거르기 전 두 명단 전체에서 센다) · #4 `phases/precheck-3-memo/step1.md` 162줄 메모를 승인된 AC-015.4에 맞춘다(병원이 다르면 읽지도 덮어쓰지도 않고 `E-BIT-HOSPITAL-MISMATCH`, 건너뛰지 않는다. requirements.md는 그대로) · #5 `phases/precheck-7-backup/step0.md`(백업 표를 정한 순서로 나눠 끝까지 읽고, 한도보다 많은 줄을 합치는 시험) · #7 `docs/precheck/plan.md` §6(저장소 시험은 `fixtures/` 가짜 자료만, 의원 PC 시험은 따로 하고 환자 자료를 남기거나 내보내지 않는다) · #3 `helper/tests/runDotnet.ts`(버려진 잠금 넘겨받기를 한 번에 한 쪽만). 순서: 문서 고침 → #3 시험을 `protocol.dotnet.test.ts`의 '잠금 폴더' 묶음에 먼저 더함 → **RED**(`tdd-run TASK-1 --expect red`. 잠금은 TASK-1 몫이다, design.md 86·393줄) → `runDotnet.ts` 고침 → **GREEN**(`tdd-run TASK-1 --expect green`) → `verify`. #3 시험: (가) 기대하는 RED는 '잠금 경로를 받는 넘겨받기 함수가 아직 없어 그 시험만 실패'다(지금은 `acquireLock`을 내보내지 않고 `LOCK`이 고정이며, RED 전에는 `runDotnet.ts`를 고칠 수 없다). (나) 그 묶음의 임시 `lockDir()`만 쓰고, 다른 감싸개가 `npm test` 동안 잡는 공용 `os.tmpdir()/precheck-dotnet.lock`은 건드리지 않는다. (다) 시간에 기대지 않는다(예: 다른 쪽이 넘겨받는 중이면 버려진 잠금도 지우지 않는다). 잠금 시험은 시험 도구 시험이라 기존 '잠금 폴더' 시험처럼 AC ID가 없다

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
- 이 TASK는 끝났다. 뒤에 더한 AC-008.6(47 표 필수 칸)은 TASK-36이 한다

## TASK-9: 점검용 모양 · 조각 모으기 (Worker)
- Step: Phase 2 · Step 2 · `claim-shape`
- AC: AC-009.1~AC-009.5
- REQ: REQ-009
- Files: src/workers/precheck/assemble.ts, src/workers/precheck/assemble.test.ts, src/workers/precheck/jobs.ts, src/workers/precheck/jobs.test.ts, src/workers/precheck.worker.ts, src/lib/precheck/shape.ts, src/lib/precheck/shape.test.ts, src/types/precheck.ts, fixtures/precheck/fake/*, fixtures/precheck/make-fake-claims.ts, fixtures/precheck/make-fake-claims.test.ts, src/lib/errors.ts, src/types/errors.ts, src/lib/errors.test.ts
- Tests: src/workers/precheck/assemble.test.ts, src/workers/precheck/jobs.test.ts, src/lib/precheck/shape.test.ts, fixtures/precheck/make-fake-claims.test.ts, src/lib/errors.test.ts
- TDD: required

## TASK-10: 점검 규칙 엔진 (골든)
- Step: Phase 2 · Step 3 · `rule-engine`
- AC: AC-010.1~AC-010.7
- REQ: REQ-010
- Files: src/lib/precheck/rules/*, scripts/precheck/golden/*, fixtures/precheck/golden/rules-*.json, fixtures/precheck/golden/rules-coverage.json, fixtures/precheck/fake/*, fixtures/precheck/make-fake-claims.ts, fixtures/precheck/make-fake-claims.test.ts, src/lib/precheck/shape.ts, src/lib/precheck/shape.test.ts, src/workers/precheck/jobs.ts, src/workers/precheck/jobs.test.ts, src/types/precheck.ts
- Tests: src/lib/precheck/rules/engine.test.ts, src/lib/precheck/rules/golden.test.ts, src/lib/precheck/rules/coverage.test.ts, src/workers/precheck/jobs.test.ts
- TDD: required
- 사용자 할 일(의원 PC에서 양지바른과 나란히 비교하기 전): 양지바른에 '병원 업데이트'를 적용했는지, 병원 문구 설정 → 처방코드 맨 위 '약 이름으로 분류' 칸이나 코드별 확인을 고쳤는지 확인한다. 적용하지 않았다면 점검 결과 전반이, 칸이나 코드별 확인을 고쳤다면 약 관련 결과(연골주사 약이 가장 눈에 띈다)가 우리와 다르게 나올 수 있다(AC-010.7). 이 값은 그 PC에만 있어 서버에서 볼 수 없다

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
- Files: supabase/migrations/20261030000000_precheck_settings.sql, supabase/precheck.rls.test.ts, src/lib/storage/claimSettings.ts, src/lib/storage/claimSettings.test.ts, src/lib/precheck/settingsChanged.ts, src/lib/precheck/settingsChanged.test.ts, src/types/db.ts, src/types/precheck.ts, src/components/settings/RuleSettings.tsx, src/components/settings/RuleSettings.test.tsx, src/components/settings/SettingsPage.tsx, src/app/(app)/settings/page.tsx, src/app/(app)/settings/page.test.tsx, src/components/shell/menu.ts, src/components/shell/shell.test.tsx, src/components/dashboard/briefing/features.ts, src/components/dashboard/briefing/features.test.ts, src/components/claim/setup/SetupScreen.tsx, src/components/claim/setup/SetupScreen.test.tsx, src/app/(app)/tabFrame.test.tsx, src/app/titles.test.tsx, src/app/notFound.test.tsx, src/lib/errors.ts, src/types/errors.ts, src/lib/errors.test.ts
- Tests: supabase/precheck.rls.test.ts, src/lib/storage/claimSettings.test.ts, src/lib/precheck/settingsChanged.test.ts, src/components/settings/RuleSettings.test.tsx, src/app/(app)/settings/page.test.tsx, src/components/shell/shell.test.tsx, src/components/dashboard/briefing/features.test.ts, src/components/claim/setup/SetupScreen.test.tsx, src/app/(app)/tabFrame.test.tsx, src/app/titles.test.tsx, src/app/notFound.test.tsx, src/lib/errors.test.ts
- TDD: required
- 설정 → `/settings`. `SetupScreen`의 '준비 중' 갈래는 없앤다. 시험은 [청구·연락]의 링크·기본 모양·칩 없음을 본다
- 사용자 할 일(Phase 2 의원 PC 시험 전): 이 마이그레이션을 Supabase SQL 편집기에 붙여 넣는다

## TASK-13: 청구 화면 · 날짜 목록 · 점검
- Step: Phase 2 · Step 6 · `precheck-screen`
- AC: AC-013.1~AC-013.14
- REQ: REQ-013
- Files: src/app/(app)/claim/page.tsx, src/app/(app)/claim/page.test.tsx, src/components/claim/*, src/components/claim/rows/*, src/components/claim/setup/ClaimEntry.tsx, src/lib/precheck/excel.ts, src/lib/precheck/excel.test.ts, src/workers/precheck/jobs.ts, src/workers/precheck/jobs.test.ts, src/workers/precheck.worker.ts, src/lib/storage/claimCounts.ts, src/lib/storage/claimCounts.test.ts, src/lib/analytics/dates.ts, src/lib/analytics/dates.test.ts, src/types/precheck.ts, src/types/db.ts, eslint.config.mjs, src/guardrails.test.ts, src/lib/errors.ts, src/types/errors.ts, src/lib/errors.test.ts
- Tests: src/lib/storage/claimCounts.test.ts, src/components/claim/dateList.test.ts, src/components/claim/claimLoad.test.ts, src/components/claim/ClaimScreen.test.tsx, src/components/claim/SettingsChangedBanner.test.tsx, src/components/claim/rows/FindingRows.test.tsx, src/lib/precheck/excel.test.ts, src/lib/analytics/dates.test.ts, src/workers/precheck/jobs.test.ts, src/app/(app)/claim/page.test.tsx, src/guardrails.test.ts
- TDD: required
- 먼저: TASK-10(`jobs.check`)·TASK-11(`dxViews`)·TASK-12(설정 읽기)·TASK-14(메모 결과, AC-014.13)·TASK-16(`loadPart`, AC-016.5)이 합쳐져 있어야 한다
- `claimCounts.ts`는 이 TASK에서 읽기(`claim_day_counts` select)만 만든다. 표가 없으면(마이그레이션 전) 빈 목록으로 본다. 쓰기는 TASK-19
- 불러오기 번호는 `components/claim/claimLoad.ts`에 Worker 하나에 하나로 둔다(AC-013.12). 약속은 `PrecheckFromScreen` 주석과 design.md 6-2다. `dates.ts`에 'E의 한 달 전 같은 날' 함수를 더한다(AC-013.13)
- `dxViews`를 잇는 것은 이 TASK다: 메모 결과를 넘겨 `jobs.check`의 답에 실어 화면 메시지로 보내고, 틀린 연결표로 던지는 `TypeError`를 잡아 `E-SETTINGS-FAILED`로 답한다(AC-013.14). Files의 `jobs.ts`·`types/precheck.ts`·`components/claim/*`로 충분하다. `TASK-14`가 합쳐진 뒤에 하므로 메모 결과가 있다
- 의원 PC 시험: 실제 한 달 자료로 점검하고 같은 달을 양지바른 결과와 나란히 비교. 하루만 골라 불러와도 내원 간격 문장이 한 달을 불러온 때와 같은지 본다
- 달 칸의 `store.load {months}`·`store.save {month,…}`는 `settings`·`contact`와 한 호출에 섞지 않는다 **(Claude 판단)**: 도우미는 파일 하나만 막혀도 호출 전체를 같은 번호로 거절해 어느 파일인지 알 수 없다. 시험: `claimLoad.test.ts`·`jobs.test.ts`(한 호출에 둘이 함께 없음).

## TASK-14: 청구메모 문장 (골든)
- Step: Phase 3 · Step 0 · `memo-text`
- AC: AC-014.1~AC-014.14
- REQ: REQ-014
- Files: src/lib/precheck/memo/*, scripts/precheck/golden/*, scripts/precheck/our-clinic-settings.mjs, fixtures/precheck/our-clinic-settings.test.ts, fixtures/precheck/golden/memo-*.json, fixtures/precheck/golden/phrases-*.json, fixtures/precheck/fake/*, fixtures/precheck/make-fake-claims.ts, src/workers/precheck/jobs.ts, src/workers/precheck/jobs.test.ts, src/types/precheck.ts, src/lib/errors.ts, src/types/errors.ts, src/lib/errors.test.ts
- Tests: src/lib/precheck/memo/buildMemo.test.ts, src/lib/precheck/memo/fullText.test.ts, src/lib/precheck/memo/drugs.test.ts, src/lib/precheck/memo/ourClinic.test.ts, src/lib/precheck/memo/phrases.test.ts, src/lib/precheck/memo/golden.test.ts, fixtures/precheck/our-clinic-settings.test.ts, src/workers/precheck/jobs.test.ts, src/lib/errors.test.ts
- TDD: required
- 비트에 들어가는 글은 `memoText`가 아니라 `fullText`다. 골든은 그 전체를 덮는다(design.md 19-2). 약은 design.md 19-4(국소마취제·연골주사약 포함), 일부러 다른 곳(시술 종류가 둘 이상인 날의 주사약·연골주사 줄)은 골든 `knownDiffs`에 적는다. 그 표가 `clinic-memo-plan.md`의 옛 글보다 앞선다. 고친 메모는 인자로 받는다(`store.load`를 잇는 것은 TASK-16)
- `dxContext`의 `hasMemo`를 잇는다(AC-014.13). 이 전까지 비급여 처방만 있고 상병이 없는 진료는 걸리지 않는다
- 사용자 할 일(Phase 3 의원 PC 시험 전): `scripts/precheck/our-clinic-settings.mjs`가 출력한 SQL을 SQL 편집기에 붙여 넣는다(우리 병원 설정, 환자 정보 없음). 그 전에는 우리 병원도 메모를 만들지 않는다

## TASK-15: 도우미 작업 저장 (DPAPI)
- Step: Phase 3 · Step 1 · `helper-store`
- AC: AC-015.1~AC-015.7
- REQ: REQ-015
- Files: helper/src/Precheck.Core/Store/*, helper/src/Precheck.Windows/DpapiProtector.cs, helper/src/Precheck.Helper/Commands/*, helper/tests/Precheck.Core.Tests/Store/*, helper/tests/Precheck.Windows.Tests/Store/*
- Tests: helper/tests/store.dotnet.test.ts
- TDD: required

## TASK-16: 비트 메모 비교 (두 번 입력 막기)
- Step: Phase 3 · Step 2 · `bit-memo-compare`
- 먼저: TASK-14(비교할 메모 글). 도우미 쪽(AC-016.1의 `claim.memos`, `MemoCompare`)은 끝났다. 남은 일은 웹 쪽: `store.load`의 고친 메모를 TASK-14의 메모 함수에 잇기, `compareMemo`·AC-016.3·AC-016.4·AC-016.5(`loadPart`: `claim.memos`와 `store.load` 둘 다 이 TASK가 더한다. TASK-13이 쓴다)·AC-016.6·AC-016.7·AC-016.8(비트 메모 다시 불러오기의 자료 쪽)
- AC: AC-016.1~AC-016.8
- REQ: REQ-016
- Files: helper/src/Precheck.Core/Bit/Sql.cs, helper/src/Precheck.Core/Claim/*, helper/src/Precheck.Helper/Commands/*, helper/tests/Precheck.Core.Tests/Bit/*, helper/tests/Precheck.Core.Tests/Claim/*, src/lib/precheck/memoCompare.ts, src/lib/precheck/memoCompare.test.ts, src/workers/precheck/jobs.ts, src/workers/precheck/jobs.test.ts, src/types/precheck.ts
- Tests: helper/tests/memo-compare.dotnet.test.ts, src/lib/precheck/memoCompare.test.ts, src/workers/precheck/jobs.test.ts
- TDD: required
- 비트 메모 다시 불러오기의 자료 쪽(`memoReloadStart`, `loadPart`의 `run`, 실패 때 전 결과 남기기, design.md 19-12)은 Files의 `jobs.ts`·`types/precheck.ts`, Tests의 `jobs.test.ts`로 충분하다. 단추·카드와 `run` 번호는 TASK-18이다

## TASK-17: 비트 자동 입력 (FlaUI · PC 확인 창)
- Step: Phase 3 · Step 3 · `bit-input`
- AC: AC-017.1~AC-017.10
- REQ: REQ-017
- Files: helper/src/Precheck.Core/Input/*, helper/src/Precheck.Core/Store/*, helper/src/Precheck.Windows/Precheck.Windows.csproj, helper/src/Precheck.Windows/NativeTarget.cs, helper/src/Precheck.Windows/UChartAutomation.cs, helper/src/Precheck.Windows/ConfirmWindow.cs, helper/src/Precheck.Windows/ProgressWindow.cs, helper/src/Precheck.Helper/Commands/*, helper/src/Precheck.Helper/Program.cs, helper/tests/Precheck.Core.Tests/Input/*, helper/tests/Precheck.Windows.Tests/Input/*
- Tests: helper/tests/input.dotnet.test.ts
- TDD: required
- NuGet `FlaUI.Core`·`FlaUI.UIA3` 4.0.0(정확한 버전). 의원 PC 시험: 시험용 환자 한 명 → 실제 하루치 → 입력 중 크롬 닫기(지금 사람까지 마치고 끝나는지)
- `Program.cs`에는 표준 입력을 따로 읽는 스레드와 닫힘 신호만 더한다(AC-017.9). 이름 있는 뮤텍스는 `Core/Input`에 두고 `store.save` 처리기도 같이 쓴다(AC-017.10)
- **이 TASK만으로는 입력이 돌지 않는다**: 코드는 합쳐졌지만(`be1ae11`) `bit.input`을 일부러 등록하지 않았다. AC-017은 읽기에 끝난 것 같아도 TASK-35 전까지 비트에 아무것도 쓰지 못한다. `phases/precheck-3-memo/index.json`의 이 step은 TASK-35가 끝날 때 completed로 한다
- 2026-11-01에 바뀐 AC-017.1·017.3·017.4·017.5·017.6·017.7·017.9는 이미 있는 코드를 글로 맞춘 것이다. 여기서 더 고칠 것은 없다. 새 칸(`code`·`replaces`·`checkedByHand`)은 TASK-35·36·37이 더한다

## TASK-35: `bit.input` 연결 (도우미)
- Step: Phase 3 · TASK-17 뒤 · `input-wiring` (plan.md §6 밖, step 파일 없음. design.md 19-5)
- AC: AC-035.1~AC-035.9
- REQ: REQ-035
- Files: helper/Directory.Build.props, helper/src/Precheck.Helper/Program.cs, helper/src/Precheck.Helper/Commands/*, helper/src/Precheck.Core/Input/*, helper/src/Precheck.Core/Store/*, helper/src/Precheck.Core/Bit/Sql.cs, helper/tests/Precheck.Core.Tests/Input/*, helper/tests/Precheck.Core.Tests/Store/*, helper/tests/Precheck.Core.Tests/Bit/*, helper/tests/input-wiring.dotnet.test.ts, helper/tests/input.dotnet.test.ts, helper/tests/store.dotnet.test.ts, src/lib/bridge/commands.json, src/lib/bridge/versions.ts, src/lib/bridge/*.test.ts
- Tests: helper/tests/input-wiring.dotnet.test.ts, helper/tests/input.dotnet.test.ts, helper/tests/store.dotnet.test.ts, src/lib/bridge/protocol.test.ts, src/lib/bridge/handshake.test.ts
- TDD: required
- 등록 조건 다섯(`InputParts.cs` 주석의 넷 + 잠금)을 다 채운 뒤에만 `Program.cs`에 등록한다: 내원 수(AC-035.1)·진짜 입력 기록(AC-035.2)·기록 지우는 길(AC-035.5)·쓰다 멈춘 사람을 뺀 묶음 잡기(AC-035.4·AC-035.9)·`store.save` 잠금(AC-035.6). 비교(AC-035.3)도 함께 잇는다
- '아직 붙이지 않았다'를 보던 시험 둘은 AC-035.7이 정한 대로 바꾼다(그 시험 이름에 "배선 작업 때 지운다"고 적혀 있다). 다른 시험은 지우지 않는다
- `Sql.cs`에 새 상수를 넣을 때 맨 끝의 정적 생성자 앞에 둔다(통계 쪽 창이 그 자리를 쓴다). 새 SQL은 `ReadOnlyGuard` 목록에 들어가고 이름·메모는 읽지 않는다(차트번호는 AC-035.1에 쓰고 답에 싣지 않는다). 도우미 `Version`은 이 TASK에서 올리지 않는다. 릴리스 때 통계 쪽과 겹치지 않게 먼저 내는 쪽이 0.2.0을 쓴다
- 의원 PC 시험: 시험용 환자 한 명 → 실제 하루치 → 입력 중 크롬 닫기. 같은 날 두 번 온 환자가 '직접 입력'으로 빠지는지, 내원 수가 내원내역 창과 같은지, 32비트(x86) 도우미가 `BITDoctorOrder.exe`를 찾는지

## TASK-36: 처방코드 입력 · 조회 모드 · 47 표 (도우미)
- Step: Phase 3 · TASK-35 뒤 · `input-code` (plan.md §6 밖, step 파일 없음. design.md 19-1·19-7·19-8)
- AC: AC-036.1~AC-036.7, AC-008.6
- REQ: REQ-036, REQ-008
- Files: helper/src/Precheck.Core/Input/*, helper/src/Precheck.Core/Bit/GridRows.cs, helper/src/Precheck.Windows/UChartAutomation.cs, helper/src/Precheck.Windows/ViewModeNotices.cs, helper/src/Precheck.Windows/ProgressWindow.cs, helper/tests/Precheck.Core.Tests/Input/*, helper/tests/Precheck.Core.Tests/Bit/*, helper/tests/Precheck.Core.Tests/Claim/*, helper/tests/Precheck.Windows.Tests/Input/*, helper/tests/input-code.dotnet.test.ts, helper/tests/claim-read.dotnet.test.ts, src/lib/bridge/commands.json, src/lib/bridge/*.test.ts
- Tests: helper/tests/input-code.dotnet.test.ts, helper/tests/claim-read.dotnet.test.ts, helper/tests/input.dotnet.test.ts
- TDD: required
- 의원 PC 시험: 제외 체크를 켜고 시작해 멈추는지(비트 체크 칸에서 `Patterns.Toggle`, 안 되면 `BM_GETCHECK`로 맞게 읽히는지), 처방코드 칸을 같은 코드·다른 코드·빈칸으로 두고 시작, 다른 자리에서 그 환자를 열어 둔 채 조회 모드 안내창이 눌리고 메모 칸이 어떤 상태가 되는지(입력을 받지 않으면 그 사람만 확인 필요), 실제 47 표의 칸 이름

## TASK-37: 다른 메모 바꾸기 · 묻지 않기 (도우미)
- Step: Phase 3 · TASK-36 뒤 · `input-replace` (plan.md §6 밖, step 파일 없음. design.md 19-6)
- AC: AC-037.1~AC-037.8, AC-035.2, AC-035.5, AC-035.8, AC-035.9
- REQ: REQ-037, REQ-035
- Files: helper/src/Precheck.Core/Input/*, helper/src/Precheck.Core/Store/*, helper/src/Precheck.Windows/ConfirmWindow.cs, helper/src/Precheck.Helper/Commands/*, helper/tests/Precheck.Core.Tests/Input/*, helper/tests/Precheck.Windows.Tests/Input/*, helper/tests/input-replace.dotnet.test.ts, src/lib/bridge/commands.json, src/lib/bridge/*.test.ts
- Tests: helper/tests/input-replace.dotnet.test.ts, helper/tests/input.dotnet.test.ts
- TDD: required
- **목업 승인됨**: PC 확인 창의 체크와 글은 입력 쪽 승인 목업(TASK-18 링크)대로다(AC-037.8)
- 입력 기록의 새 상태 `SkippedByHand`는 TASK-35가 더하고(AC-035.5) 이 TASK가 다음 묶음에서 읽는다(AC-037.6). Files의 `Core/Input/*`·`Core/Store/*` 안이고 새 명령·새 파일이 없다. AC-035.9의 '묻지 않기 켜짐' 시험 둘은 묻지 않기를 이 TASK가 만들므로 TASK-35에서 돌 수 없어 이 TASK의 `input-replace.dotnet.test.ts`에서 한다(AC-037.4)
- 원래 메모는 달 파일의 새 칸 `originals`(진료마다 글 목록. 덮어쓴 글을 모두 두고 보여 주는 화면은 없다, 2026-11-01 사용자 결정)에 `writing`보다 먼저 덧붙여 저장한다. 결과 줄에는 바꾼 사람에게만 `previousMemo`를 더한다(AC-037.1, design.md 19-6). `WorkStore`와 `IInputJournal`을 이 TASK가 고친다. Files의 `Core/Input/*`·`Core/Store/*` 안이고 새 명령·새 파일이 없다. `store.load` 답은 세 칸 그대로이고 값이 없으면 칸을 쓰지 않으므로 `Core.Tests/Store/*`는 고치지 않는다(이 TASK의 Files 밖). 시험은 `Core.Tests/Input/*`에 둔다
- **TASK-35 리뷰에서 온 일(2026-11-02)**: 아래 넷은 Files의 `Core/Input/*`·`Core/Store/*`·`ConfirmWindow.cs` 안이고 새 명령·새 파일이 없다. 시험은 `Core.Tests/Input/*`에 두고 진짜 `WorkStoreJournal`로 `SaveResults`를 지난 값을 본다
- **[확인] 뒤 미리 빠진 `checkedByHand` 사람 (Claude 판단: 더 안전한 쪽, AC-035.5·AC-035.8)**: 지금은 쓰다 멈추지 않았는데 빠지면 `skipped`라 다음 묻지 않기가 승인 없이 바꾼다. `InputRunner.RunConfirmed`에서 풀 사람 `Mark`와 같은 자리에 `Mark(item, SkippedByHand)`를 남긴다. `marked`에 들어 `SaveResults`가 건드리지 않으므로 AC-035.2('`Mark`한 진료의 기록을 바꾸지 않고 `skippedByHand`를 덮지 않는다')는 그대로다. `SaveResults`가 이 사람에게 `skipped`를 적는 것은 [확인] 없이 끝난 묶음(모두 빠져 창이 없음·지문 틀림)뿐이다. [확인] 뒤 `Mark`를 못 남기면 풀 사람처럼 아무도 열지 않고 `E-STORE-FAILED`이고, `Mark`를 남기지 못한 사람 모두는 줄만 더하고 `skipped`를 적지 않는다. 줄·이유·'빼는 환자 N명'은 그대로다. 시험: [확인] 뒤 `LastState`가 `SkippedByHand`이고 묻지 않기를 켠 다음 묶음에서 `replaces` 없이 `WriteMemo`가 불리지 않음, `Mark` 실패면 `skipped`가 적히지 않음, 창 없이 모두 빠지면 `Skipped`. `InputWiring.test.cs`의 `ExcludedHandNotStuck`이 보는 `Skipped`는 `SkippedByHand`로 바꾼다(`ExcludedHandNotStuckAlone`은 그대로). `applyInputResults`의 사본(AC-016.3)은 TASK-18이다
- **깨진 달 파일의 `reason` (Claude 판단, AC-035.9)**: `WorkStore`가 깨진 파일의 이름만 바꾸고 `E-STORE-BROKEN`을 던지면 `WorkStoreJournal`이 번호를 `E-STORE-FAILED` 하나로 바꾸기 전에 그것을 알아, `ReadEarlierWrites`의 `BatchStop`에 AC-035.9의 글을 싣는다. 번호와 답 모양은 그대로다. 시험은 AC-035.9
- **창 맨 위 글의 노란 바탕 (승인 목업, AC-035.9)**: `ConfirmWindow.cs`. 글은 그대로이고 이 글이 있을 때만이다
- 같은 바이트의 달 파일 둘(AC-035.9의 알려진 한계)은 코드를 고치지 않는다
- 의원 PC 시험: 시험용 환자로 다른 메모 바꾸기 → 저장·이전 메모 확인, 묻지 않기를 켠 뒤 둘째 묶음이 창 없이 돌고, 청구 창을 닫았다 열면 다시 묻는지

## TASK-38: 입력 전 크롬 창 내리기 (확장)
- Step: Phase 3 · `browser-minimize` (plan.md §6 밖, step 파일 없음. design.md 19-8)
- AC: AC-038.1~AC-038.3
- REQ: REQ-038
- Files: extension/manifest.json, extension/src/background.ts, extension/src/relay.ts, extension/src/chromeLike.ts, extension/src/*.test.ts
- Tests: extension/src/background.test.ts, extension/src/relay.test.ts, extension/src/manifest.test.ts
- TDD: required
- 사용자 할 일(지시받을 때): 새 판을 웹스토어에 올리고 의원 PC 확장을 업데이트한다. 그 전에는 크롬 창을 손으로 내리거나 옆으로 두면 된다. 옛 확장은 창을 내리지 않을 뿐이고 가려져 있으면 도우미가 멈추므로 `MIN_EXTENSION`은 올리지 않는다
- 의원 PC 시험: [확인] 뒤 크롬이 내려가고 끝나면 전 상태(최대화 포함)로 돌아오는지, 입력 중 진행 숫자가 그대로 오는지

## TASK-18: 메모 화면 · 입력 결과 · 병원 문구 칸
- Step: Phase 3 · Step 4 · `memo-screen`
- AC: AC-018.1~AC-018.27
- REQ: REQ-018
- Files: src/components/claim/*, src/components/claim/memo/*, src/components/claim/rows/*, src/components/claim/setup/ClaimEntry.tsx, src/components/settings/HospitalPhrases.tsx, src/components/settings/HospitalPhrases.test.tsx, src/components/settings/ProcedureDrugs.tsx, src/components/settings/ProcedureDrugs.test.tsx, src/components/settings/DxLinks.tsx, src/components/settings/DxLinks.test.tsx, src/components/settings/SettingsPage.tsx, src/app/(app)/claim/page.tsx, src/app/(app)/claim/page.test.tsx, src/lib/precheck/inputTargets.ts, src/lib/precheck/inputTargets.test.ts, src/lib/precheck/excel.ts, src/lib/precheck/excel.test.ts, src/workers/precheck/jobs.ts, src/workers/precheck/jobs.test.ts, src/workers/precheck.worker.ts, src/types/precheck.ts, src/lib/errors.ts, src/types/errors.ts, src/lib/errors.test.ts
- Tests: src/components/claim/memo/MemoPanel.test.tsx, src/components/claim/memo/InputMode.test.tsx, src/components/claim/memo/InputResults.test.tsx, src/components/claim/memo/useMemoDrafts.test.ts, src/components/claim/memo/BitMemoButton.test.tsx, src/components/claim/claimLoad.test.ts, src/components/claim/rows/MemoRows.test.tsx, src/components/claim/rows/BitMemoCard.test.tsx, src/components/settings/HospitalPhrases.test.tsx, src/components/settings/ProcedureDrugs.test.tsx, src/components/settings/DxLinks.test.tsx, src/lib/precheck/inputTargets.test.ts, src/lib/precheck/excel.test.ts, src/workers/precheck/jobs.test.ts, src/lib/errors.test.ts
- TDD: required
- **승인된 목업(입력 쪽)**: 입력 방식 두 가지(처방코드별이 먼저 골라짐)·코드 단추·안내 문구·입력할 사람과 빠지는 사람 목록·다른 메모 나란히 보기·비트 메모 카드와 [비트 메모 전체 불러오기]·확인 표시 알림·'직접 입력'·[엑셀로 저장]·묻지 않기 안내·PC 확인 창 글은 https://claude.ai/artifact/P7NFu7j9NRNmKHskgY4UYU (판 `1793539759-946b`)를 따른다. 2026-11-01 사용자가 그린 그대로 승인했고 끝의 바꿀 수 있는 것 17가지도 모두 받아들였다. 명세에서는 **(승인 목업)**으로 적었다. 목업과 다르게 둔 곳: 안전 규칙 때문인 것은 AC-018.3의 '지금: 날짜 이름' 줄, AC-018.11의 코드 모양 검사, AC-018.25의 글자 그대로 비교, AC-018.14·AC-018.22의 직접 확인 기록 예외다(손으로 확인하던 메모를 승인 없이 바꾸지 않는다). 안전 규칙 때문이 아닌 것은 AC-018.24의 입력 단추 막음 **(Claude 판단)**(도우미가 쓰기 바로 앞에 칸을 다시 읽으므로 안전과 상관없다, AC-016.8. 입력하는 동안 목록이 바뀌거나 카드의 '뒤에 입력' 안내가 틀리지 않게 하는 작은 더함이다), AC-018.4의 취소 줄(사이트는 취소 때 체크 상태를 모른다), AC-018.3의 확인 기다리는 중 수(도우미가 [확인] 전에 웹에 아무것도 보내지 않아 보낸 묶음의 수를 보인다)다. PC 확인 창 체크 글의 앞말은 굵게 하지 않았다(체크 하나로 그린다) **(Claude 판단)**
- **승인된 목업(설정의 두 칸)**: '병원 문구'·'시술별 약' 칸은 이미 승인된 https://claude.ai/artifact/QnXpDwjWGCDLjNuPBRDNxE (판 `1793534640-5640`)를 따른다. 2026-11-01 사용자가 병원 문구 창에서 승인했다고 그 창이 전했다. 그 목업의 '변경 기록'·'가입 보기 글'은 만들지 않는다(requirements '범위 밖'). 목업과 다르게 둔 곳: 보기 고르기와 가이드·끝맺음 글 칸은 만들지 않았다. 그 말은 시술 문구 칸에 글자로 넣는다 **(Claude 판단)**.
- **승인된 목업(빠진 화면)**: 쓰다 멈춘 사람(AC-018.16)·기관기호 안내(AC-018.17)·처음 질문(AC-018.18의 '처음 질문을 먼저 해 주세요')·설정 변경 띠(AC-018.3, design.md 6-5)는 https://claude.ai/artifact/JgKnA2UtZ7s8ADnw48dKFn (판 `1793589997-f908`)를 따른다. 2026-11-02 사용자가 '제가 정한 부분'까지 모두 승인했다. 명세에서는 **(승인 목업)**으로 적었다. 목업은 영어를 피하려고 'PC'를 '컴퓨터'로, '비트 PC 연결'을 '비트 연결'로 적고 오류 번호를 ○○○○로 가렸을 뿐이다: 실제 화면은 명세의 말('PC'·'비트 PC 연결')과 진짜 오류 번호를 쓴다 **(Claude 판단)**. 목업과 다르게 둔 곳: AC-018.17의 '이전 병원'과 다음 할 일, AC-018.18의 갈 곳(2026-11-02 사용자 결정), AC-018.21의 `E-INPUT-STOPPED` 줄(목업은 글이 없어 뺐다) **(Claude 판단)**. 목업에 없어 더한 것: AC-018.16의 35일 안에 다 들지 않는 때, AC-018.17의 `store.load`에서 받은 때와 `store.save` 멈춤·여섯 단추 막음·`settings.dat`·`contact.dat`의 같은 번호, AC-018.3의 옆 글이 겹칠 때 **(Claude 판단)**. 그 밖에 어느 목업에도 없는 부분은 Phase 0 목업 화면 4·5·6·10을 따르되, 화면 4의 사람마다 체크는 따르지 않는다(AC-018.26)
- 비트 메모 화면 쪽(AC-018.24·AC-018.25·AC-018.27, design.md 19-12): `memo/BitMemoButton.tsx`, `rows/BitMemoCard.tsx`, `claimLoad.ts`의 `run` 번호. 모두 Files의 `src/components/claim/*`·`memo/*`·`rows/*` 안이고 입력 쪽 승인 목업대로 만든다
- `errors.ts`·`types/errors.ts`: `E-INPUT-STOPPED`·`E-BIT-UNSAVED-RX`·`E-BIT-UI-CHANGED`의 번호와 글을 더하고(AC-018.21, 지금 없다) **(Claude 판단: 이 글)**, `E-MEMO-NO-SETTINGS`의 `fix`에 갈 곳을 더한다(AC-018.18). 시험은 `errors.test.ts`
- `types/precheck.ts`: `PrecheckFromScreen` 주석 8의 '다른 오류 번호면 멈춘다'를 AC-018.17에 맞게 고친다(`store.load`의 `E-BIT-HOSPITAL-MISMATCH`는 멈추지 않는다). Files 안이다
- **승인 화면의 어색한 곳(동작은 바꾸지 않는다. 청구 화면을 다시 디자인할 때 본다)**: 입력 기록을 확인할 수 없는 창의 [취소]는 아무것도 시작하지 않았는데 '중간에 멈췄어요'와 '넣은 0명'으로 보인다(AC-035.9·AC-018.21). 메모를 넣지 않는 창(풀 사람만 있는 창)에도 묻지 않기 체크가 있다(AC-035.5). 띠의 [이어서 입력]과 멈춘 뒤의 [이어서 하기]는 이름이 비슷한 다른 단추다(AC-018.16·AC-018.21)
- 대상 고르기는 순수 함수 `inputTargets.ts`(Worker에서 부름)에 둔다. 묶음 글자는 Worker가 만든다(화면은 쥐지 않는다, AC-004.11). 이 칸들은 기능만 맞추고 모양은 다듬지 않는다(청구 화면은 나중에 다시 디자인한다)
- 달 칸의 `store.load {months}`·`store.save {month,…}`는 `settings`·`contact`와 한 호출에 섞지 않는다 **(Claude 판단)**: 도우미는 파일 하나만 막혀도 호출 전체를 같은 번호로 거절해 어느 파일인지 알 수 없다. 시험: `claimLoad.test.ts`·`jobs.test.ts`(한 호출에 둘이 함께 없음).

## TASK-19: 입력 현황 건수 · 밖에서 보기
- Step: Phase 3 · Step 5 · `claim-counts`
- AC: AC-019.1~AC-019.6. 바뀐 AC-013.1(`visits` 견주기, `claim.dates` 다시 묻기)과 AC-013.2(불러오기 앞에 묻기, 기다리는 사이의 멈춤)도 이 작업이 만든다(TASK-13은 먼저 끝났다)
- REQ: REQ-019
- Files: supabase/migrations/20261030000100_precheck_counts.sql, supabase/precheck.rls.test.ts, src/lib/storage/claimCounts.ts, src/lib/storage/claimCounts.test.ts, src/lib/precheck/counts.ts, src/lib/precheck/counts.test.ts, src/types/db.ts, src/types/precheck.ts, src/components/claim/OutsideCounts.tsx, src/components/claim/OutsideCounts.test.tsx, src/components/claim/useCountsUpload.ts, src/components/claim/useCountsUpload.test.ts, src/components/claim/ClaimScreen.tsx, src/components/claim/ClaimScreen.test.tsx, src/components/claim/claimLoad.ts, src/components/claim/claimLoad.test.ts, src/components/claim/dateList.ts, src/components/claim/dateList.test.ts, src/components/claim/setup/ClaimEntry.tsx, src/app/(app)/claim/page.tsx, src/app/(app)/claim/page.test.tsx, src/workers/precheck.worker.ts, src/workers/precheck/jobs.ts, src/workers/precheck/jobs.test.ts, src/lib/errors.ts, src/types/errors.ts, src/lib/errors.test.ts
- Tests: supabase/precheck.rls.test.ts, src/lib/storage/claimCounts.test.ts, src/lib/precheck/counts.test.ts, src/components/claim/OutsideCounts.test.tsx, src/components/claim/useCountsUpload.test.ts, src/components/claim/dateList.test.ts, src/app/(app)/claim/page.test.tsx, src/workers/precheck/jobs.test.ts, src/lib/errors.test.ts
- TDD: required
- 화면 자리는 AC-019.5가 정한다: ui-90 화면을 두고 '준비 중' 칩 자리에 건수를 넣는다(목업 화면 11의 제목·전체 배치를 쓰지 않는다). '메모 입력 현황' 패널의 표 모양은 목업 화면 11을 따르되 끝난 날은 뺀다. 월말 마감·연락 칸은 그리지 않는다(TASK-22·TASK-26이 더한다)
- 사용자 할 일(Phase 3 의원 PC 시험 전): 이 마이그레이션을 SQL 편집기에 붙여 넣는다
- 의원 PC 시험(AC-013.1·AC-019.3): 며칠을 불러와 다 넣은 뒤 날짜 목록에서 그 날이 '완료'로 바뀌는지, 뒤에 환자를 더 받으면 다시 덜 끝난 날이 되는지 본다. 진료 완료 뒤에 증상을 적는 일이 잦은지 사용자에게 묻는다. 잦으면 그 내원이 끝난 날에 묻혀 메모를 놓치므로(AC-019.3의 알려진 한계) 명세 변경을 올린다

## TASK-40: 다른 메모 기본으로 바꾸기 · [바꾸지 않기]
- Step: Phase 3 · Step 6 · `memo-replace-default`
- AC: 바뀐 AC-016.3·AC-016.4·AC-016.6·AC-016.7·AC-016.8, AC-018.3·AC-018.4·AC-018.14·AC-018.16·AC-018.20·AC-018.21·AC-018.22·AC-018.26, AC-019.3(글만). 2026-11-02 사용자 결정으로 바뀐 곳만 만든다
- REQ: REQ-016, REQ-018, REQ-019
- Files: src/lib/precheck/memoCompare.ts, src/lib/precheck/memoCompare.test.ts, src/lib/precheck/inputTargets.ts, src/lib/precheck/inputTargets.test.ts, src/types/precheck.ts, src/workers/precheck/jobs.ts, src/workers/precheck/jobs.test.ts, src/components/claim/rows/MemoRows.tsx, src/components/claim/rows/MemoRows.test.tsx, src/components/claim/memo/MemoPanel.tsx, src/components/claim/memo/MemoPanel.test.tsx, src/components/claim/memo/InputResults.tsx, src/components/claim/memo/InputResults.test.tsx
- Tests: src/lib/precheck/memoCompare.test.ts, src/lib/precheck/inputTargets.test.ts, src/workers/precheck/jobs.test.ts, src/components/claim/rows/MemoRows.test.tsx, src/components/claim/memo/MemoPanel.test.tsx, src/components/claim/memo/InputResults.test.tsx
- TDD: required
- **왜 (2026-11-02 사용자 결정)**: "직접쓴건 없애 그리고 어떤거 없앴는지만 알려줄수있게해 어차피 내가 한번 다 확인하고 돌릴거여서 괜찮아". 사용자가 고른 말: "우리 메모로 바꾸기: 입력할 때 사람마다 승인받지 않고 직접 쓴 메모를 지운 뒤 우리 메모를 넣어요. 지운 메모는 그 PC 기록에 남고, 결과 화면에 누구 메모를 바꿨는지 이전 메모와 함께 보여요."
- **새 목업 없음 (Claude 판단)**: 새 화면과 새 배치가 없다. 승인 목업(TASK-18 링크)의 줄·단추 모양 그대로이고 글·칩·[바꾸지 않기]가 보이는 줄만 바뀐다. 바뀌는 글은 AC-018.3·AC-018.4·AC-018.22·AC-018.26이 정한다
- **도우미는 고치지 않는다**: `helper/`·`commands.json`·`MIN_HELPER`를 건드리지 않는다. AC-037.1·AC-037.2·AC-037.3이 이 길을 그대로 지킨다. PC 창의 낡은 주의 줄(AC-037.8)은 다음 도우미 릴리스 때 고친다. `counts.ts`·`excel.ts`도 그대로다: 건수는 입력을 마치면 `finished`로 입력됨이 되고, 엑셀은 이미 '기존 비트 청구메모'에 `previousMemo`를 싣는다(jobs.ts `existing`, `jobs.test.ts`의 AC-018.15 시험이 본다)
- `memoCompare.ts` **(Claude 판단: 모양)**: `MemoSource`에 `declined`, `VisitMemo`에 `declined`를 더한다(비교가 `다름`일 때만 칸이 있다). `inputPlan(visits)`에서 `noAsk` 인자를 뺀다: 결과가 달라지지 않아 쓰지 않는 인자가 된다(`TargetContext`·`MemoStateOptions`의 `noAsk`도). 보낼 `replaces`를 정하는 일은 `replacesOf(row)` 하나로 모아 `inputPlan`과 `jobs.ts`의 `itemOf`가 같은 답을 낸다: `다름`이고 `declined`가 아니고 `skippedByHand`이면 `approved`가 있을 때만 `row.inBit`다. `bitMemoOf`는 4,000자를 넘는 글을 `undefined`로 돌려준다(AC-016.6)
- `inputTargets.ts`: 칩은 `'새 메모' | '메모 바꿈'`(`types/precheck.ts`도)
- `jobs.ts` 남은 수: 결과의 남은 수·[이어서 하기]·[다시 하기]는 비교가 `다름`인 `declined`를 세지 않는다(이번 답에 쓰다 멈춘 줄이 있는 사람은 [이어서 하기] 묶음에 남는다. `left`는 지금처럼 그 줄을 세지 않는다). 0명이면 단추가 없다(AC-018.4·AC-018.21). 시험: `jobs.test.ts` `AC-018.21`(비교가 `다름`인 쓰다 멈춘 두 사람을 [직접 확인했어요]로 보낸 묶음이 `E-BIT-UNSAVED-RX`로 멈추면 남은 0명, [이어서 하기] 없음)
- `jobs.ts` **(Claude 판단: 모양)**: `declined` 모음을 더한다. `memoApprove`의 거짓은 `approved`에서 빼고 비교가 `다름`인 줄을 `declined`에 넣고, 참은 `declined`에서 빼고 사본이 `skippedByHand`이면 지금 글을 `approved`에 넣는다. 새 `loadStart`가 `declined`도 지운다. [직접 확인했어요]의 묶음을 만들 때 그 사람을 `declined`에 넣는다(AC-016.3). `plain`은 `declined`를 뺀다. `continueStuck`은 `replaces`를 싣지 않는다(AC-018.16). `resume`은 `replaces`를 `replacesOf`로 다시 정하고 `declined`를 빼되 쓰다 멈춘 사람은 `replaces` 없이 남긴다(AC-018.14). `diffAtSend`를 지우고 `firstNoAsk`를 AC-018.22의 N으로 센다. `PRE_LEFT_REASON.diff`의 글을 바꾼다(AC-018.4). `approved`를 푸는 곳(`runCheck`·`editMemo`·다시 불러오기)은 그대로 둔다: 이제 직접 확인 기록이 남은 사람의 승인에만 쓰인다
- 화면: `rows/MemoRows.tsx`(`LEFT_GROUPS.diff.why`, [바꾸지 않기]는 칩이 '메모 바꿈'인 줄 모두), `memo/MemoPanel.tsx`(단추 옆 글, 묻지 않기 띠 글), `memo/InputResults.tsx`(첫 묶음 글)
- 시험 이름에 AC ID를 넣는다. `memoCompare.test.ts`: `AC-016.3`(`다름`이면 지금 비트 글을 `replaces`로 듦, [바꾸지 않기]면 이미 있음, `skippedByHand`면 빠지고 승인하면 듦, 앞선 까닭이 먼저), `AC-016.4`(`already`는 `다름`인 수), `AC-016.6`(4,000자는 `replaces`로 듦, 4,001자는 그 진료만 `조회 못함`). `inputTargets.test.ts`: `AC-018.26`(칩 둘, 까닭 차례), `AC-018.14`(`declined`면 '다른 메모 있음', 목록과 묶음이 같음), `AC-018.22`(`skippedByHand`는 빠짐), `AC-018.20`(입력 직전 변경됨을 기억하지 않음). `jobs.test.ts`: `AC-016.3`(사본을 적지 못한 [직접 확인했어요] 사람이 다음 묶음에 없음), `AC-016.7`(`replaces`가 새 글), `AC-016.8`(실패 뒤 `declined`와 `replaces`가 그대로), `AC-018.4`(미리 뺀 사람의 이유 글), `AC-018.14`(AC 끝의 목록), `AC-018.16`([이어서 입력]에 `replaces` 없음), `AC-018.21`([이어서 하기]·[다시 하기]에서 `declined`를 뺌), `AC-018.22`(꺼짐과 켜짐의 묶음이 같음, 첫 묶음의 N), `AC-019.3`(바꿔 끝나면 `entered`, 아직이면 `skipped`, `declined`가 있는 날은 `entered`가 `need_memo`보다 적음). `rows/MemoRows.test.tsx`: `AC-018.14`, `AC-018.26`. `memo/MemoPanel.test.tsx`: `AC-018.3`(단추 옆 글), `AC-018.22`(띠 글, 켜져 있어도 [바꾸지 않기]가 눌림). `memo/InputResults.test.tsx`: `AC-018.4`(그중 메모 바꿈, 이전 메모와 넣은 메모), `AC-018.22`(첫 묶음 글)
- **뒤집히는 시험**: 옛 규칙을 본 시험은 지우지 않고 새 뜻으로 고친다: `memoCompare.test.ts`의 '묻지 않기가 꺼져 있으면 승인하지 않은 진료는 건너뜀' 등, `inputTargets.test.ts`의 칩과 'AC-016.3·AC-018.22 다른 메모와 묻지 않기', `jobs.test.ts`의 'AC-018.14 사람마다 승인'과 'AC-018.22 묻지 않기', `MemoRows.test.tsx`의 'AC-018.14 다른 메모'
- 의원 PC 시험(TASK-37의 것에 더함): 하루치로 먼저 한다. ① 직접 쓴 메모가 실제로 바뀌는가: `replaces`는 DB 글이고 칸 글과 견주므로(19-11) 다르면 모두 '입력 직전 변경됨'으로 건너뛴다 ② [바꾸지 않기]를 누른 사람이 묻지 않기를 켠 뒤에도 열리지 않는가 ③ 결과 화면과 엑셀에 지운 메모가 나오는가

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
- 알려진 한계 **(Claude 판단)**: 13개월 지우기는 `work-*`만 지워(AC-015.5) 새 프로필 ID로 다시 등록한 PC의 옛 `contact.dat`·`settings.dat`는 남는다. 개발자가 치우기 전까지 [연락함] 저장은 `E-BIT-HOSPITAL-MISMATCH`로 실패하고(실패 글은 TASK-26이 정한다) 마지막 설정 사본도 쓰지 못한다(AC-013.9).

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

## TASK-39: 단계 기록 파일
- Step: 어느 Phase에도 속하지 않는 기록 일 (plan.md §6 밖)
- AC: 없음(기능이 없다. 승인 범위에 `phases/precheck-*/index.json`을 넣기 위한 TASK다)
- REQ: REQ-035
- Files: phases/precheck-*/index.json
- Tests: 없음
- TDD: exempt
- 예외 이유: 끝난 step을 적는 기록 파일이라 시험할 동작이 없다. 이 줄이 없으면 훅이 Edit을 막아 끝난 step을 적지 못한다
- 할 일: 승인 뒤 `phases/precheck-2-rules/index.json` step 2(TASK-9)를 메모에 적힌 요약과 함께 completed로 하고, TASK-35~38 줄은 `index.json`에 더하지 않는다(`scripts/execute.py`는 step 파일이 없으면 멈춘다). 그 진행은 `sdd status`로 본다. 다른 칸은 건드리지 않는다

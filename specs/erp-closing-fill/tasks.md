# 작업 분할: ERP 마감일지 비트 값 채우기

> 형식: `## TASK-n: 제목` 아래 `- REQ:`, `- AC:`, `- Files:`(수정 범위), `- Tests:`, `- TDD:`, `- 차례:`. 승인되면 Files/Tests 경로만 고칠 수 있다.
> **할 순서**: Phase 0(TASK-1) → Phase 1(TASK-2 ‖ TASK-3 ‖ TASK-4 ‖ TASK-5) → Phase 2(TASK-6 ‖ TASK-7 ‖ TASK-9) — **여기까지 끝남**(2026-11-10). 방향이 바뀌어(ERP 전용 도우미) → Phase 4(TASK-11 ‖ TASK-13) → Phase 5(TASK-12 ‖ TASK-8) → Phase 6(TASK-10) → Phase 7(TASK-14, 2026-11-10 밤 묶음 금액 바꿈) → Phase 8(TASK-15, 씨암·SONO 매출 규칙 + 2026-11-10 22시 12·13번) → Phase 9(TASK-16 ‖ TASK-17) → Phase 10(TASK-18 ‖ TASK-19) → Phase 11(TASK-20, 사용자와 확인). 같은 Phase 안 TASK는 파일이 겹치지 않아 일꾼들이 각자 worktree에서 동시에 한다. 경계는 design.md 2·3·4절(명령 답 모양·ERP 도우미 틀·설정 모양·칸 표)로 고정한다.
> 각 TASK는 시험을 먼저 써서 RED를 본다. 검토는 끝에 한 번(전체 시험·lint·build·`ext-erp:build`·ERP 도우미 만들기·`git diff 1a721ef -- helper src`). 기존 `extension/`·`helper/`·웹 `src/`는 고치지 않는다. 깃허브 올리기·도우미 판 만들기는 사용자가 말할 때만.

## 먼저 할 일 (코드 작업 아님)
1. 설정 화면·[비트 값 채우기] 단추·결과 안내 클릭 목업을 `docs/mockups/erp-closing-fill/`에 만들어 사용자 승인을 받는다(화면 규칙. TASK-5·TASK-7은 그 뒤에)
2. 사용자가 `/sdd approve erp-closing-fill`을 입력한다
3. (TASK-15 전) 목업에 설정 화면 씨암·SONO '매출로 셀 코드' 줄과 결과 안내의 겹친 진료 묻기(design.md 4·5절 글)를 더해 사용자 승인을 받는다. 앞글자 안내는 'LA 뒤 숫자' 보기 글('LA → LA358·LA272는 세고 LAYLA는 안 세요')이고, 고른 코드 조각에 가운데 빈칸 코드('PROLO C')가 보이는 모습을 넣는다
4. (TASK-17·18 전, 3과 한 번에 해도 됨) 2026-11-10 22시 '2번빼고 고쳐' 화면을 목업에 더하거나 고쳐 사용자 승인을 받는다(글은 design.md 5-1~5-3, 그림은 화면 확인 도구로):
   - 결과 안내(ERP 화면): 이미 적힌 칸 묻기([바꾸기]·[빈 칸만]·[안내 닫기], 바뀌는 칸 이름) · 진료 0건 멈춤과 [그래도 채우기] · 오늘보다 뒤 날짜 멈춤 · 읽기 전용 화면 한 줄 · 채운 뒤 맨 위 '비트와 맞춰 볼 숫자' 3줄 · 까닭별 넣지 않은 칸(찾지 못함·치료사별 입력·읽기 전용·이름 빈 기타 줄·고르지 않음, 짧은 줄 이름) · [되돌리기]와 되돌린 뒤 글 · 단추 옆 [지난 결과] · 오류 글(번호마다 무엇이·어떻게: 도우미 없음·도중 멈춤·예전 판·새로고침(F5)·등록·병원 다름 등)
   - 설정 화면: '코드 목록을 받는 중이에요(30초쯤).' · 저장 때 '최근 1년에 처방이 없는 코드 N개 — 맞나요?' · [처음 값으로] 묻기 · '새 처음 코드가 있어요 [더하기]' · 겹침 막는 글 · 저장 실패 글 · 코드 목록 오류 글('도우미를 켠 뒤' 지움) · '치료별 건수 · 매출' 안내 새 글 · 닫을 때 묻기(크롬 기본 창이라 그림 없이 한 줄 적기)

## TASK-1: 새 확장 틀 — 이름표(ID)·권한·답 모양
- REQ: REQ-3601
- AC: AC-3601.1, AC-3601.5
- Files: extension-erp/manifest.json, extension-erp/tsconfig.json, extension-erp/src/types.ts, extension-erp/src/manifest.test.ts, vitest.config.ts, eslint.config.mjs, tsconfig.json, package.json, src/b2b-merge.test.ts, .gitignore
- Tests: extension-erp/src/manifest.test.ts
- TDD: required — RSA 2048 열쇠를 새로 만들어 공개키(DER base64)만 manifest `key`에 넣는다(개인키는 저장소에 넣지 않음). 시험: MV3·이름·permissions가 정확히 [nativeMessaging, storage]·content_scripts와 web_accessible_resources의 matches가 `https://erp.minesolution.com/*` 하나·host_permissions·externally_connectable 없음·key로 계산한 ID가 32자 a~p·`HOST_NAME`이 commands.json hostName과 같음·`GROUP_KEYS`가 design.md 2절 차례·`extension-erp/src/*.ts`(시험 제외)에 fetch·XMLHttpRequest·WebSocket·console·localStorage·sessionStorage 없음. vitest include에 `extension-erp/**/*.test.ts`, 루트 tsconfig exclude와 eslint(dist 무시, extension-erp/src에 네트워크·console·웹 저장소 금지)에 extension-erp, package.json에 `ext-erp:build`(tsc + manifest·options.html 복사)
- 차례: Phase 0

## TASK-2: 도우미 — 새 확장 허용과 부른 쪽마다 명령 나눔 (끝남 → TASK-11이 되돌림)
- REQ: REQ-3601
- AC: (그때의 AC-3601.1~3601.4. 지금 AC는 TASK-11이 맡는다)
- Files: src/lib/bridge/commands.json, helper/src/Precheck.Core/Protocol/CommandTable.cs, helper/src/Precheck.Core/Protocol/OriginGuard.cs, helper/src/Precheck.Core/Protocol/MessageLoop.cs, helper/src/Precheck.Core/Protocol/Dispatcher.cs, helper/install/host-manifest.json, helper/tests/build.test.ts, helper/tests/Precheck.Core.Tests/Protocol/CommandTable.test.cs, helper/tests/Precheck.Core.Tests/Protocol/OriginGuard.test.cs, helper/tests/Precheck.Core.Tests/Protocol/MessageLoop.test.cs, helper/tests/Precheck.Core.Tests/Protocol/Dispatcher.test.cs, helper/tests/protocol.dotnet.test.ts
- Tests: helper/tests/protocol.dotnet.test.ts, helper/tests/build.test.ts
- TDD: required — commands.json에 design.md 2절 `erp` 구역(ID·key는 TASK-1 manifest에서). 시험: erp 구역 읽기(모르는 열쇠·겹친 이름·틀린 ID는 표 틀림), `CallerOf` 세 경우, 새 확장 → closing.* 통과·hello·claim.month는 E-HELPER-UNKNOWN-COMMAND, 기존 확장 → closing.* 막힘·지금 명령 그대로, 모르는 origin은 지금처럼 끝남, allowed_origins 정확히 둘, `erp.extensionKey`가 extension-erp/manifest.json key와 같고 ID가 맞음. 웹 `protocol.test.ts`·기존 확장·지금 C# 시험은 기대값을 바꾸지 않는다(`Names`는 지금 목록 그대로)
- 차례: Phase 1

## TASK-3: 도우미 — 마감일지 숫자 읽기(문장·계산)
- REQ: REQ-3602, REQ-3603, REQ-3604, REQ-3605, REQ-3606
- AC: AC-3602.1, AC-3602.2, AC-3603.1, AC-3603.2, AC-3603.3, AC-3603.4, AC-3604.1, AC-3604.2, AC-3604.3, AC-3604.4, AC-3605.1, AC-3605.2, AC-3606.1, AC-3606.2
- Files: helper/src/Precheck.Core/Closing/ClosingSql.cs, helper/src/Precheck.Core/Closing/ClosingDay.cs, helper/src/Precheck.Core/Closing/ClosingCodes.cs, helper/src/Precheck.Core/Bit/Sql.cs, helper/tests/Precheck.Core.Tests/Closing/ClosingSql.test.cs, helper/tests/Precheck.Core.Tests/Closing/ClosingDay.test.cs, helper/tests/Precheck.Core.Tests/Closing/ClosingCodes.test.cs, helper/tests/Precheck.Core.Tests/Closing/ClosingFakes.test.cs, helper/tests/erp-closing.dotnet.test.ts
- Tests: helper/tests/erp-closing.dotnet.test.ts
- TDD: required — 가짜 IBitDb(문장마다 정해 둔 줄)로: 환자현황(진찰구분 1·3·0·4, 물리치료내원 코드 환자를 재진·산정안함에서 뺌, 두 번 온 사람 차례, ptVisit 없음 → null), 묶음 patients·3분류·total·unpaidVisits(수납 없는 진료 0으로), 같은 사람이 두 묶음, 코드 대소문자·앞뒤 공백, 연령 10줄(9·10·99·100세, 생년월일 없음 → unknownAge), 금액이 `RevenueDays` 하루 값과 같음·미수입금 나눔 더함·unconfirmed → 여덟 칸이 그대로 더한 값 + moneyUnconfirmed·split → 둘이 그대로 더한 값 + splitUnconfirmed, unpaidNew·discount·disabledFund·refund(음수면 부호 뗌), inpatientVisits, 예약 메모 번호마다 네 수·환자 수, 주사 셋(HistoryGuard ≠ 0 → firstTime null·noHistory), codes 차례·2,000개·이름 지우기. 새 문장은 모두 `Sql.IsAllowed`이고 매개변수 표와 맞음, 표 밖·틀린 매개변수는 E-BIT-READ-FAILED, 문장 글에 PbsPatNam·전화·주민·주소·메모 칸 이름이 없고 SELECT 칸에 차트번호·생년월일이 그대로 나오지 않음, 답 JSON 칸이 design.md 2절과 같음
- 차례: Phase 1

## TASK-4: 새 확장 — 칸 찾기·채우기
- REQ: REQ-3608
- AC: AC-3608.1, AC-3608.2, AC-3608.3, AC-3608.4, AC-3608.5
- Files: extension-erp/src/cells.ts, extension-erp/src/cells.test.ts, extension-erp/src/fill.ts, extension-erp/src/fill.test.ts, extension-erp/src/__tests__/erpPage.ts
- Tests: extension-erp/src/cells.test.ts, extension-erp/src/fill.test.ts
- TDD: required — `__tests__/erpPage.ts`는 조사 파일 3·4절 구조의 시험용 ERP 화면(업무일지 1·2 탭, '자동'·'업로드 시 생략 가능' 표시, 치료사별 입력 줄, 기타 이름 바꾼 줄, 기본단가·단추들 포함). jsdom으로: `planCells`가 design.md 4절 표 그대로(32·99칸, 총금액 = 치료별 매출 값, 예약 메모 합, 입원 0 조건, 기타 이름 줄, unpicked·unknown), 칸 찾기 세 방식·글자 정리·못 찾은 칸, 숫자칸 setter + input(bubbles), 금액칸 '' → 숫자 → blur 차례, 쉼표 없는 정수, null·unpicked 칸 안 건드림, select·textarea·기본단가 칸 그대로이고 탭 밖 단추 click이 한 번도 없음, 2 탭에서 1 탭 눌러 기다렸다 채우고 돌아옴, 숨은 2 칸도 채움, fieldset[disabled]면 바꾸지 않음
- 차례: Phase 1

## TASK-5: 새 확장 — 설정 화면
- REQ: REQ-3607
- AC: AC-3607.1, AC-3607.2, AC-3607.3, AC-3607.4, AC-3607.5
- Files: extension-erp/src/settings.ts, extension-erp/src/settings.test.ts, extension-erp/options.html, extension-erp/src/options.ts, extension-erp/src/options.test.ts
- Tests: extension-erp/src/settings.test.ts, extension-erp/src/options.test.ts
- TDD: required — 가짜 chrome.storage·sendMessage로: 처음 값(이미 정한 것 7), 저장 모양(design.md 4절)·[처음 값으로]는 화면만, `toGroups`(코드 있는 항목만 차례대로), `search`(코드·이름·대소문자 무시·visits 차례·30개), 더하기(20개·겹침 없음)·[×] 빼기, 기타 이름 1~20자, 예약 6줄 고르기, 도우미 실패 안내와 '(최근 1년 처방 없음)'. 글은 승인된 목업 그대로
- 차례: Phase 1 (목업 승인 뒤)

## TASK-6: 도우미 — 두 명령 잇기
- REQ: REQ-3603, REQ-3606, REQ-3601
- AC: AC-3603.1, AC-3606.2, AC-3606.3, AC-3601.3
- Files: helper/src/Precheck.Core/Closing/ClosingCommands.cs, helper/src/Precheck.Helper/Program.cs, helper/tests/Precheck.Core.Tests/Closing/ClosingCommands.test.cs, helper/tests/erp-closing.dotnet.test.ts
- Tests: helper/tests/erp-closing.dotnet.test.ts
- TDD: required — 실린 명령 표·Caller.Erp로 Dispatcher에: closing.codes·closing.day가 result 하나(chunk 아님), 같은 key 두 번·틀린 key·코드 21개 → E-HELPER-BAD-MESSAGE, 등록 안 된 PC → revenue.days와 같은 번호, 기록 줄은 명령 이름·오류 번호뿐, Caller.Web이면 closing.* 막힘
- 차례: Phase 2 (TASK-2·3 뒤)

## TASK-7: 새 확장 — 단추·도우미 통로·결과 안내
- REQ: REQ-3609
- AC: AC-3609.1, AC-3609.2, AC-3609.3, AC-3609.4, AC-3609.5, AC-3609.6
- Files: extension-erp/src/background.ts, extension-erp/src/background.test.ts, extension-erp/src/content.ts, extension-erp/src/main.ts, extension-erp/src/main.test.ts, extension-erp/src/panel.ts, extension-erp/src/panel.test.ts
- Tests: extension-erp/src/background.test.ts, extension-erp/src/main.test.ts, extension-erp/src/panel.test.ts
- TDD: required — 가짜 chrome(runtime·storage·connectNative)과 `__tests__/erpPage.ts`로: 단추가 `/h/closing`+마감 일자일 때만, 주소만 바뀌는 이동에 사라지고 다시 생김, 날짜 두 꼴 읽기, 날짜 없음·설정 없음(설정 화면 열기)·읽는 중 막힘, 답 온 뒤 날짜 바뀜 → 안 채움, 안내 글과 경고 줄(design.md 5절), 오류 셋(없음·거절 → 새 판 안내, 오류 번호, 120초) 때 칸 그대로, 서비스 워커는 같은 확장·두 명령만 받고 요청마다 연결 하나·끝나면 닫음. 글은 승인된 목업 그대로
- 차례: Phase 2 (TASK-4·5 뒤, 목업 승인 뒤)

## TASK-8: 설치 안내 (바뀜: 기존 도우미 판은 올리지 않음)
- REQ: REQ-3610, REQ-3611
- AC: AC-3610.1
- Files: helper-erp/install/README.md, extension-erp/README.md
- TDD: exempt — 글만. ERP 도우미 깔기(압축 풀기 → install.cmd → 비트 로그인 창·PC 확인 창으로 등록, 취소하면 다시 실행) → 새 확장 압축 풀어 '압축해제된 확장 프로그램 로드' → 처음 설정 화면 [저장]. 기존 도우미·청구 화면은 그대로라는 것, 지우기(uninstall.ps1). 초안: `~/.claude/state/handoff/erp-ext-readme-draft.md`(옛 방향이라 도우미 부분은 고쳐 씀)
- 차례: Phase 5 (TASK-11 뒤, TASK-12와 같이)

## TASK-9: 확인 — 2026-11-09 숫자 대조 (이 PC, 의원 비트 DB 읽기 전용)
- REQ: REQ-3610
- AC: AC-3610.2
- Files: specs/erp-closing-fill/notes/check-2026-11-09.md
- TDD: exempt — 시험이 아니라 확인 단계. TASK-3의 문장·계산을 저장소 밖 작업 폴더의 읽기 전용 도구로 돌려(거래는 되돌림, 환자 줄은 출력하지 않음) AC-3610.2 숫자와 견주고 숫자만 적는다. 다르면 고치기 전에 사용자에게 알린다
- 차례: Phase 2 (TASK-3 뒤)

## TASK-10: 확인 — ERP 화면에서 사용자와 함께
- REQ: REQ-3610, REQ-3608
- AC: AC-3610.3, AC-3608.2
- Files: specs/erp-closing-fill/notes/erp-screen-check.md, extension-erp/src/fill.ts, extension-erp/src/fill.test.ts
- Tests: extension-erp/src/fill.test.ts
- TDD: required — 크롬 도구가 없을 수 있어 사용자와 함께 한다: 이 PC에서 ERP 도우미 Release 만들기 → `install.ps1`(등록 창은 사용자) → `ext-erp:build` → 압축해제 로드 → 2026-11-09 마감일지에서 단추 → 칸·금액칸·다른 칸으로 옮겨도 남는지, 기존 청구 화면이 그대로 되는지 확인 → notes에 적음. 금액칸이 안 들어가면 그때만 fill.ts를 `execCommand('insertText')` 방식으로 고친다(시험 먼저). 저장은 사용자가 정한다
- 차례: Phase 6 (TASK-12·8 뒤, 사용자와 시간 맞춰)

## TASK-11: ERP 도우미 틀 — 옮기기와 되돌리기
- REQ: REQ-3601, REQ-3602, REQ-3603, REQ-3604, REQ-3605, REQ-3606, REQ-3611
- AC: AC-3601.1, AC-3601.2, AC-3601.3, AC-3601.4, AC-3601.6, AC-3606.1, AC-3606.3, AC-3611.1, (옮긴 시험의 AC-3602.*·3603.*·3604.*·3605.*·3606.2 그대로)
- Files: helper/**(1a721ef로 되돌림·이 기능이 더한 파일 지움), src/lib/bridge/commands.json(1a721ef로), helper-erp/commands.json, helper-erp/Directory.Build.props, helper-erp/ErpHelper.sln, helper-erp/src/Erp.Core/**, helper-erp/tests/Erp.Core.Tests/**, helper-erp/tests/runDotnet.ts, helper-erp/tests/erp-closing.dotnet.test.ts, helper-erp/tests/erp-core.dotnet.test.ts, extension-erp/src/types.ts, extension-erp/src/manifest.test.ts, extension-erp/src/background.ts, extension-erp/src/background.test.ts, vitest.config.ts, src/b2b-merge.test.ts, eslint.config.mjs, .gitignore
- Tests: helper-erp/tests/erp-core.dotnet.test.ts, helper-erp/tests/erp-closing.dotnet.test.ts, extension-erp/src/manifest.test.ts, extension-erp/src/background.test.ts
- TDD: required — 먼저 `Closing/*`와 그 시험을 `helper-erp`로 옮기고(namespace만 바꿈, 내용 그대로) helper/·commands.json을 1a721ef로 되돌린다. 새 시험(RED 먼저): ERP 명령 표 읽기(design.md 2절, 명령 둘뿐·`CommandTable.Parse` 통과·extensionKey가 manifest key와 같고 ID가 맞음·hostName `com.seoseungkwan.erp_helper`), `ErpReadGuard`(ClosingSql 문장·기존 허용 문장 통과, 표 밖·틀린 매개변수 E-BIT-READ-FAILED, Closing 읽기가 모두 ErpReadGuard), 기존 `OriginGuard`·`Dispatcher`에 ERP 표를 넣으면 새 확장만·두 명령만(hello·claim.month는 E-HELPER-UNKNOWN-COMMAND, 기존 확장 origin은 끝남), `HOST_NAME`·확장 시험이 `helper-erp/commands.json`을 봄, `git diff 1a721ef -- helper src`가 b2b-merge 시험 말고는 비어 있음. vitest include에 `helper-erp/tests/*.test.ts`, .gitignore에 `helper-erp/**/bin/`·`obj/`. 기존 C# 시험(helper/)은 1a721ef 그대로 통과
- 차례: Phase 4

## TASK-12: ERP 도우미 실행 프로그램·등록·설치·만들기
- REQ: REQ-3611, REQ-3601, REQ-3606
- AC: AC-3611.2, AC-3611.3, AC-3611.4, AC-3611.5, AC-3611.6, AC-3601.2, AC-3606.3
- Files: helper-erp/src/Erp.Helper/**, helper-erp/ErpHelper.sln, helper-erp/install/host-manifest.json, helper-erp/install/install.cmd, helper-erp/install/install.ps1, helper-erp/install/uninstall.ps1, .github/workflows/helper-erp.yml, helper-erp/tests/erp-helper.test.ts, helper-erp/tests/erp-helper-build.dotnet.test.ts
- Tests: helper-erp/tests/erp-helper.test.ts, helper-erp/tests/erp-helper-build.dotnet.test.ts
- TDD: required — design.md 3-4·3-5대로. 시험: Erp.Helper가 net48로 만들어짐(경고 없음), Program이 `--register`일 때만 RegisterFlow·종료 번호 0/1/2, 아니면 ERP 표·ClosingCommands·MessageLoop만(hello 없음), 저장 자리 `ErpHelper\data`·`logs`(PrecheckHelper 글자 없음), ErpBitDb가 ErpReadGuard 먼저·Rollback·Commit 없음·`ReadOnlyConnection.Create`, host-manifest(name·allowed_origins 하나), install.ps1(ERP 열쇠·app 폴더·`--register`·안내 셋, 기존 열쇠·폴더 글자 없음), uninstall은 ERP 것만, workflow가 `erp-helper-v*` 태그에서만 판·압축 이름. 기존 helper.yml 그대로
- 차례: Phase 5 (TASK-11 뒤)

## TASK-13: 새 확장 — 결과 안내 글 두 줄
- REQ: REQ-3609
- AC: AC-3609.5
- Files: extension-erp/src/panel.ts, extension-erp/src/panel.test.ts, extension-erp/src/main.ts, extension-erp/src/main.test.ts
- Tests: extension-erp/src/panel.test.ts, extension-erp/src/main.test.ts
- TDD: required — E-HELPER-MISSING → 'ERP 도우미를 설치해 주세요.', E-BIT-NOT-REGISTERED → '이 PC가 아직 등록되지 않았어요. ERP 도우미 설치 파일을 다시 실행해 주세요.', 그 밖 번호는 지금처럼. 칸은 그대로
- 차례: Phase 4 (TASK-11과 같이, 파일 안 겹침)

## TASK-14: 묶음 금액을 처방 코드 금액으로 · 씨암·SONO 매출 보류 · 처음 코드 더함 (2026-11-10 밤 사용자 결정)
- REQ: REQ-3604, REQ-3607, REQ-3608, REQ-3609
- AC: AC-3604.3, AC-3604.5, AC-3607.3, AC-3608.4, AC-3609.4
- Files: helper-erp/src/Erp.Core/Closing/ClosingSql.cs, helper-erp/src/Erp.Core/Closing/ClosingDay.cs, helper-erp/tests/Erp.Core.Tests/Closing/ClosingSql.test.cs, helper-erp/tests/Erp.Core.Tests/Closing/ClosingDay.test.cs, helper-erp/tests/Erp.Core.Tests/Closing/ClosingFakes.test.cs, helper-erp/tests/erp-closing.dotnet.test.ts, extension-erp/src/settings.ts, extension-erp/src/settings.test.ts, extension-erp/src/options.test.ts, extension-erp/src/cells.ts, extension-erp/src/cells.test.ts, extension-erp/src/fill.ts, extension-erp/src/fill.test.ts, extension-erp/src/panel.ts, extension-erp/src/panel.test.ts, extension-erp/src/main.test.ts, specs/erp-closing-fill/notes/check-2026-11-09.md
- Tests: helper-erp/tests/erp-closing.dotnet.test.ts, extension-erp/src/settings.test.ts, extension-erp/src/options.test.ts, extension-erp/src/cells.test.ts, extension-erp/src/fill.test.ts, extension-erp/src/panel.test.ts, extension-erp/src/main.test.ts
- TDD: required — design.md 3-2·3-3·4·5절대로. 시험(RED 먼저). 도우미(가짜 IBitDb): `DayCodesSql` 금액 칸(식이 `RevenueSql.CodeAmounts`와 같음·원내 줄만·매개변수 표 그대로), 묶음 total = 묶음 코드 줄 금액 합(진찰료·묶음 밖 코드 줄·진료 총진료비는 안 더함), 한 묶음의 코드 둘·두 묶음에 든 코드 하나, 묶음마다 원 미만 버림, 단가 0원 코드 → 0, 수납 줄 없는 진료도 금액 그대로·unpaidVisits는 지금처럼. 확장: 처음 값 물리치료 6개·크라이오 CRYO·CRYO3(이미 정한 것 7), `HELD_SALES`(carm·sono)의 치료별 매출 칸이 골랐으면 held·안 골랐으면 unpicked, held 칸은 안 바뀌고 못 찾은 칸·고르지 않은 칸에 안 셈, 같은 묶음의 건수 칸은 그대로 채움, `HELD_SALES`를 비우면 지금처럼 채움, 안내의 보류 줄과 미수납 경고 줄 새 글. 끝나면 AC-3604.5를 이 PC 비트 DB(읽기 전용, 집계만)로 확인해 notes 6절과 같은지 적는다. 답 모양(design.md 2절)은 그대로
- 차례: Phase 7 (TASK-10 뒤)

## TASK-15: 씨암·SONO 매출 규칙 — 진료 표시 코드 안의 LA 뒤 숫자 줄 + 더 셀 코드, 함께 있는 진료는 작성자가 고름 · 가운데 빈칸 코드 (12·13번)
- REQ: REQ-3603, REQ-3604, REQ-3607, REQ-3608, REQ-3609
- AC: AC-3603.1, AC-3603.5, AC-3604.6, AC-3604.7, AC-3604.8, AC-3607.6, AC-3607.7, AC-3608.4, AC-3609.7
- Files: helper-erp/commands.json, helper-erp/src/Erp.Core/Closing/ClosingDay.cs, helper-erp/src/Erp.Core/Closing/ClosingCommands.cs, helper-erp/tests/Erp.Core.Tests/Closing/ClosingDay.test.cs, helper-erp/tests/Erp.Core.Tests/Closing/ClosingCommands.test.cs, helper-erp/tests/Erp.Core.Tests/Closing/ClosingFakes.test.cs, helper-erp/tests/Erp.Core.Tests/ErpCommandTable.test.cs, helper-erp/tests/erp-closing.dotnet.test.ts, helper-erp/tests/erp-core.dotnet.test.ts, extension-erp/src/types.ts, extension-erp/src/manifest.test.ts, extension-erp/src/settings.ts, extension-erp/src/settings.test.ts, extension-erp/options.html, extension-erp/src/options.ts, extension-erp/src/options.test.ts, extension-erp/src/cells.ts, extension-erp/src/cells.test.ts, extension-erp/src/main.ts, extension-erp/src/main.test.ts, extension-erp/src/panel.ts, extension-erp/src/panel.test.ts, specs/erp-closing-fill/notes/carm-sono-amount.md
- Tests: helper-erp/tests/erp-closing.dotnet.test.ts, helper-erp/tests/erp-core.dotnet.test.ts, extension-erp/src/manifest.test.ts, extension-erp/src/settings.test.ts, extension-erp/src/options.test.ts, extension-erp/src/cells.test.ts, extension-erp/src/main.test.ts, extension-erp/src/panel.test.ts
- TDD: required — design.md 2절(args 두 칸·`overlap`)·3-3·4·5절대로. 시험(RED 먼저). 도우미(가짜 IBitDb): 규칙 두 칸 읽기(대문자로, 6개 앞글자·21개 코드·빈 글자 → E-HELPER-BAD-MESSAGE, 없으면 TASK-14 그대로), total = 표시 코드가 있는 진료의 앞글자(바로 뒤가 숫자일 때만: LA358 맞음, LAYLA·'LA' 하나·LAX1 안 맞음)·더 셀 코드 줄 금액(표시 코드 없는 진료의 LA 줄·규칙 밖 줄은 안 더함, 두 규칙에 맞는 줄 한 번), overlap = 함께 있는 진료 수·각 규칙 금액(한쪽만 규칙이면 null), 답 칸이 2절과 같음, SQL 문장·매개변수 표 그대로, 가운데 빈칸 코드('PROLO C')가 명령 표 pattern·`CheckGroups`를 지나고 빈칸 두 칸·탭·앞뒤 공백은 E-HELPER-BAD-MESSAGE, 주사 묶음의 빈칸 코드는 @c 매개변수 값으로만 감(문장 글 그대로). 확장: `amounts` 처음 값·없는 저장값 채우기·대문자·5/20개·겹침 없음, 가운데 빈칸 코드가 `normalize` 뒤에도 남음(이어진 빈칸 하나로, 21자 → 버림), `toGroups` 규칙 두 칸, 설정 화면 '매출로 셀 코드' 줄(두 줄 같은 모양, 'LA 뒤 숫자' 안내, 글은 승인된 목업), [저장]이 `overlap`을 지움 없이 둠, `HELD_SALES = []`, `planCells` 선택 셋, 묻기 → 누름 → 날짜 확인 → `saveOverlap` → 채움, '(지난번)'·포커스, 닫기면 안 바꿈, overlap 0·null이면 안 물음, 채운 뒤 줄. 끝나면 AC-3604.8을 이 PC 비트 DB(읽기 전용, 집계만)로 확인해 notes에 적는다
- 차례: Phase 8 (TASK-14 뒤, '먼저 할 일' 3 목업 승인 뒤)

## TASK-16: ERP 도우미 — 예약 메모 'Memo' 번호 합치기 · 오늘 뒤 날짜 막기 · 코드 목록 빠르게 · 판 0.2.0 (2026-11-10 22시 11·14·16번)
- REQ: REQ-3616, REQ-3612, REQ-3605, REQ-3602, REQ-3606, REQ-3610
- AC: AC-3616.1, AC-3616.2, AC-3616.3, AC-3616.4, AC-3612.1, AC-3605.1, AC-3602.1, AC-3606.1, AC-3606.2, AC-3610.4
- Files: helper-erp/Directory.Build.props, helper-erp/src/Erp.Core/Closing/ClosingSql.cs, helper-erp/src/Erp.Core/Closing/ClosingCodes.cs, helper-erp/src/Erp.Core/Closing/ClosingDay.cs, helper-erp/src/Erp.Core/Closing/ClosingCommands.cs, helper-erp/tests/Erp.Core.Tests/Closing/ClosingSql.test.cs, helper-erp/tests/Erp.Core.Tests/Closing/ClosingCodes.test.cs, helper-erp/tests/Erp.Core.Tests/Closing/ClosingDay.test.cs, helper-erp/tests/Erp.Core.Tests/Closing/ClosingCommands.test.cs, helper-erp/tests/Erp.Core.Tests/Closing/ClosingFakes.test.cs, helper-erp/tests/Erp.Core.Tests/ErpReadGuard.test.cs, helper-erp/tests/erp-closing.dotnet.test.ts, helper-erp/tests/erp-core.dotnet.test.ts, specs/erp-closing-fill/notes/check-2026-11-09.md
- Tests: helper-erp/tests/erp-closing.dotnet.test.ts, helper-erp/tests/erp-core.dotnet.test.ts
- TDD: required — design.md 2절(새 오류 번호)·3-1(판)·3-2(`CodeListSql` 글 그대로)·3-3(예약 메모·시간 제한)·3-4(오늘 뒤 날짜)대로. 시험(RED 먼저, 가짜 IBitDb): 예약 메모 'Memo1'·'memo1'·' 1 '·'1' 네 줄 → '1' 한 줄에 네 수 합, 'A1' 같은 다른 꼴은 그대로, 번호 글자 차례, `closing.codes` kinds와 같은 함수(`ClosingCodes.MemoKind`)를 씀 / date가 `services.Today()`보다 하루 뒤 → E-CLOSING-FUTURE-DATE이고 가짜 DB·등록 저장소에 한 번도 닿지 않음, 오늘·어제는 그대로 읽음, 기록 줄은 명령 이름·번호뿐 / `ClosingCodes.Read`가 `CodeListSql`·`MemoKindsSql`만 부름(`Sql.TrendTotalsSql`·`StatsSql.CodeNamesSql` 안 부름), 전 시험의 같은 코드 자료로 같은 답(대문자·공백 떼고 합침·이름 없으면 null·이름 지우기·진료 수 차례·2,000개), 시간 제한 50초·15초가 문장에 넘어감, `CodeListSql`이 `ClosingSql.Parameters`에 있고 `ErpReadGuard`를 지나며 매개변수(@from·@to Char 12, @first·@last Char 8, @hospital VarChar 32)가 맞음·SELECT 하나·환자 칸 이름(PbsPatNam·전화·주민·주소·메모) 없음·차트번호를 결과로 내지 않음 / `Directory.Build.props` Version 0.2.0(AC-3610.1 시험의 기대값만 바꿈). 끝나면 AC-3616.4를 이 PC 비트 DB(읽기 전용·진료 뒤·묶어 센 수만, `ssk-bit-db-probe`)로 확인해 notes 7절에 적는다. 확장 파일은 건드리지 않는다
- 차례: Phase 9 (TASK-15 뒤, TASK-17과 같이 — 파일 안 겹침)

## TASK-17: 새 확장 ERP 화면 — 채우기 전 묻기·되돌리기·지난 결과·맞춰 볼 숫자·까닭별 칸·오류 글 (1·3·4·7·8·9·14번)
- REQ: REQ-3612, REQ-3613, REQ-3614, REQ-3608, REQ-3609, REQ-3610, REQ-3601
- AC: AC-3612.1, AC-3612.2, AC-3612.3, AC-3612.4, AC-3612.5, AC-3613.1, AC-3613.2, AC-3613.3, AC-3614.1, AC-3614.2, AC-3614.3, AC-3608.1, AC-3608.5, AC-3609.4, AC-3609.5, AC-3610.4, AC-3601.1, AC-3601.5
- Files: extension-erp/manifest.json, extension-erp/src/manifest.test.ts, extension-erp/src/errors.ts, extension-erp/src/errors.test.ts, extension-erp/src/background.ts, extension-erp/src/background.test.ts, extension-erp/src/cells.ts, extension-erp/src/cells.test.ts, extension-erp/src/fill.ts, extension-erp/src/fill.test.ts, extension-erp/src/main.ts, extension-erp/src/main.test.ts, extension-erp/src/panel.ts, extension-erp/src/panel.test.ts, extension-erp/src/__tests__/erpPage.ts
- Tests: extension-erp/src/manifest.test.ts, extension-erp/src/errors.test.ts, extension-erp/src/background.test.ts, extension-erp/src/cells.test.ts, extension-erp/src/fill.test.ts, extension-erp/src/main.test.ts, extension-erp/src/panel.test.ts
- TDD: required — design.md 4절(채우기 흐름·`fill.ts`·`cells.ts`·`background.ts`·`panel.ts`·`errors.ts`)·5-1·5-2대로, 글은 승인된 목업('먼저 할 일' 4). 시험(RED 먼저, jsdom·가짜 chrome·가짜 시계, `__tests__/erpPage.ts`에 손으로 적은 칸·쉼표 금액칸·치료사별 입력 줄·읽기 전용 화면을 더함): 오늘 뒤 날짜 → 도우미를 안 부르고 future 글, 답 E-CLOSING-FUTURE-DATE도 같은 글, 오늘은 채움 / `patients.total` 0 → 멈추고 [그래도 채우기]·[안내 닫기]([안내 닫기] 먼저 포커스), [안내 닫기]면 칸 그대로, [그래도 채우기]면 날짜 다시 보고 겹친 진료·적힌 칸 묻기를 거쳐 채움 / `survey`: 숫자가 있는 칸만 적힌 칸('1,234'와 '1234'는 같은 값이라 안 셈, ''·'-'·'0'은 빈 칸이라 N에 안 셈, [빈 칸만]은 0인 칸도 채움) / 묻기 [바꾸기]·[빈 칸만]·[안내 닫기]마다 칸 결과와 kept 줄, 누를 때 날짜 바뀜 → 안 채움, 적힌 칸 0 → 안 물음, 겹친 진료 묻기 다음에 고른 값으로 묻기, [빈 칸만] 먼저 포커스 / [되돌리기] → 넣은 칸만 앞 글자(금액칸은 '' → 값 → blur), 날짜 바뀜 → 안 바꿈, 떨어진 칸 → gone 수, 되돌린 뒤·다음 채우기·화면 떠남 뒤 기억 없음, `chrome.storage` 쓰기 없음 / 읽기 전용 화면 → 한 줄·칸 그대로·목록 없음 / 맞춰 볼 숫자 3줄(null → '—') / 까닭별 묶음 차례·짧은 줄 이름(같은 줄 한 번·10줄 + 외 K줄), 이름 빈 기타 줄은 noName(unpicked 아님) / [지난 결과] 다시 열기·칸 안 바뀜·떠나면 없음, Esc 닫기(ERP 쪽 keydown은 그대로 받음) / `errors.ts` 표 번호 모두·그 밖·모양 틀린 번호 → E-BRIDGE-BAD-REPLY, BAD-MESSAGE·UNKNOWN-COMMAND → 예전 판 글, DISCONNECTED → F5 글 / 서비스 워커 lastError 'Specified native messaging host not found.'·'Access to the specified native messaging host is forbidden.' → MISSING, 'Native host has exited.'·글 없음 → STOPPED / manifest `web_accessible_resources`에 `errors.js`, 판 0.2.0, `src/*.ts`(errors.ts 포함) 금지 낱말 없음. 기존 TASK-4·7·13·14·15 시험은 바뀐 글·모양만 고친다
- 차례: Phase 9 (TASK-15 뒤, '먼저 할 일' 4 목업 승인 뒤, TASK-16과 같이)

## TASK-18: 새 확장 설정 화면 — 받는 중·닫을 때 묻기·저장 실패·처방 없는 코드 묻기·처음 값 묻기·새 처음 코드·겹침 막기 (3·5·6·15번)
- REQ: REQ-3615, REQ-3607, REQ-3614
- AC: AC-3615.1, AC-3615.2, AC-3615.3, AC-3615.4, AC-3615.5, AC-3615.6, AC-3615.7, AC-3615.8, AC-3607.3, AC-3607.4, AC-3614.1
- Files: extension-erp/src/types.ts, extension-erp/src/settings.ts, extension-erp/src/settings.test.ts, extension-erp/options.html, extension-erp/src/options.ts, extension-erp/src/options.test.ts
- Tests: extension-erp/src/settings.test.ts, extension-erp/src/options.test.ts
- TDD: required — design.md 4절(설정 모양 `defaultsSeen`·`settings.ts`·`options.ts`)·5-3대로, 글은 승인된 목업('먼저 할 일' 4). 시험(RED 먼저, 가짜 chrome.storage·sendMessage): 받는 동안 '받는 중' 줄 → 받은 줄·오류 줄 / dirty일 때만 beforeunload가 막음, 저장 뒤엔 안 막음 / storage.set 실패 → 저장 실패 글·dirty 그대로 / 처방 없는 코드: 새로 고른 코드만(저장값에 있던 AA222는 안 셈)·처음 저장이면 모두·더 셀 코드 포함·목록 못 받으면 안 물음, [그대로 저장]은 씀·[돌아가기]는 안 씀 / [처음 값으로] → 묻기 → [바꾸기]면 picks·amounts만 처음 값(etcNames·reservations·overlap 그대로)·[그만두기]면 그대로·저장은 안 함 / `defaultsSeen` 없음(1) + 저장값에 MM085가 없음 → '새 처음 코드' 줄·[더하기]로 화면에 더함·[저장]하면 2로 써서 다시 안 나옴, 처음 저장 전엔 안 나옴, 20개 넘으면 넘는 것 안 더함 / 겹침: 기타 이름 '도수'·'sono'(영문 대소문자 무시)·' 도수 '(앞뒤 빈칸) → 막음, '도수2'는 됨, 두 기타 같은 이름·같은 메모 번호 두 줄 → 쓰지 않고 막는 글, 겹침 검사가 처방 없는 코드 묻기보다 먼저 / 코드 목록 오류 줄이 `errors.ts` 글이고 '도우미를 켠 뒤'가 없음 / '치료별 건수 · 매출' 안내 새 글. `normalize`는 `defaultsSeen`을 1 이상 정수로
- 차례: Phase 10 (TASK-17 뒤 — `errors.ts`·`ETC_CLASH_ROWS`를 쓴다. TASK-19와 같이)

## TASK-19: 안내서 — 다른 의원 첫 설정 · 같이 바꾸기 · 오류 표 · 새 흐름 (3·4번)
- REQ: REQ-3617
- AC: AC-3617.1, AC-3617.2, AC-3617.3, AC-3617.4
- Files: extension-erp/README.md, helper-erp/install/README.md
- TDD: exempt — 글만. design.md 5절 글을 그대로 옮긴다(안내 글 표는 5-1·5-2 글 + 할 일). `extension-erp/README.md`: 처음 값 목록을 '만든 의원 기준'으로(물리치료 6개·크라이오 CRYO·CRYO3·씨암·SONO 매출 규칙 LA 뒤 숫자까지 지금 값으로), '다른 의원 첫 설정' 절(처방 코드·씨암/SONO 표시 코드와 앞글자·예약 메모 번호·기타 줄 이름·저장 때 묻기·겹침 막힘), '매일 쓰는 법'(맞춰 볼 숫자·묻기·[빈 칸만]·[되돌리기]·[지난 결과]·0건/오늘 뒤 멈춤·까닭별 칸), '새 판으로 바꾸기'에 '확장과 도우미는 꼭 같이 바꾸기', 오류 표(번호마다 할 일), 옛 글 지움. `helper-erp/install/README.md`: 맨 위 '이미 깔려 있는' → '깔려 있다면', '새 판으로 바꾸기'에 같이 바꾸기, '다시 등록하기'에 E-STORE-BROKEN·E-BIT-HOSPITAL-MISMATCH, '잘 안 될 때'에 E-HELPER-STOPPED. 환자 정보·이 의원 이름은 쓰지 않는다
- 차례: Phase 10 (TASK-16·17 뒤, TASK-18과 같이)

## TASK-20: 확인 — ERP 화면에서 사용자와 함께 (새 판 0.2.0)
- REQ: REQ-3612
- AC: AC-3612.6
- Files: specs/erp-closing-fill/notes/erp-screen-check.md
- TDD: exempt — 시험이 아니라 확인 단계(TASK-10과 같은 방법). 이 PC에서 ERP 도우미 Release 만들기 → `install.ps1`(등록 창은 사용자) → `ext-erp:build` → 확장 새로고침 → ERP 마감일지에서 손으로 몇 칸을 적고 단추: 묻는 수·[빈 칸만]·[바꾸기]·[되돌리기]·[지난 결과]·Esc·맞춰 볼 숫자, 금액칸 쉼표·다른 칸으로 옮겨도 남는지, 설정 화면 받는 중·처방 없는 코드 묻기를 본다. 결과는 숫자·칸 이름만 notes에 적는다. ERP가 빈 날 칸을 ''·'0' 말고 다른 글자로 보이는 등 고칠 것이 나오면 고치기 전에 사용자에게 알린다. 저장은 사용자가 정한다
- 차례: Phase 11 (TASK-18·19 뒤, 사용자와 시간 맞춰)

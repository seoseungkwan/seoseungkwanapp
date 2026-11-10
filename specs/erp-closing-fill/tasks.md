# 작업 분할: ERP 마감일지 비트 값 채우기

> 형식: `## TASK-n: 제목` 아래 `- REQ:`, `- AC:`, `- Files:`(수정 범위), `- Tests:`, `- TDD:`, `- 차례:`. 승인되면 Files/Tests 경로만 고칠 수 있다.
> **할 순서**: Phase 0(TASK-1) → Phase 1(TASK-2 ‖ TASK-3 ‖ TASK-4 ‖ TASK-5) → Phase 2(TASK-6 ‖ TASK-7 ‖ TASK-9) → Phase 3(TASK-8 → TASK-10). 같은 Phase 안 TASK는 파일이 겹치지 않아 일꾼들이 각자 worktree에서 동시에 한다. 경계는 design.md 2·3·4절(명령 답 모양·설정 모양·칸 표)로 고정한다.
> 각 TASK는 시험을 먼저 써서 RED를 본다. 검토는 끝에 한 번(전체 시험·lint·build·`ext-erp:build`). 기존 `extension/`·웹 화면은 고치지 않는다. 깃허브 올리기·도우미 판 만들기는 사용자가 말할 때만.

## 먼저 할 일 (코드 작업 아님)
1. 설정 화면·[비트 값 채우기] 단추·결과 안내 클릭 목업을 `docs/mockups/erp-closing-fill/`에 만들어 사용자 승인을 받는다(화면 규칙. TASK-5·TASK-7은 그 뒤에)
2. 사용자가 `/sdd approve erp-closing-fill`을 입력한다

## TASK-1: 새 확장 틀 — 이름표(ID)·권한·답 모양
- REQ: REQ-3601
- AC: AC-3601.1, AC-3601.5
- Files: extension-erp/manifest.json, extension-erp/tsconfig.json, extension-erp/src/types.ts, extension-erp/src/manifest.test.ts, vitest.config.ts, eslint.config.mjs, tsconfig.json, package.json, src/b2b-merge.test.ts, .gitignore
- Tests: extension-erp/src/manifest.test.ts
- TDD: required — RSA 2048 열쇠를 새로 만들어 공개키(DER base64)만 manifest `key`에 넣는다(개인키는 저장소에 넣지 않음). 시험: MV3·이름·permissions가 정확히 [nativeMessaging, storage]·content_scripts와 web_accessible_resources의 matches가 `https://erp.minesolution.com/*` 하나·host_permissions·externally_connectable 없음·key로 계산한 ID가 32자 a~p·`HOST_NAME`이 commands.json hostName과 같음·`GROUP_KEYS`가 design.md 2절 차례·`extension-erp/src/*.ts`(시험 제외)에 fetch·XMLHttpRequest·WebSocket·console·localStorage·sessionStorage 없음. vitest include에 `extension-erp/**/*.test.ts`, 루트 tsconfig exclude와 eslint(dist 무시, extension-erp/src에 네트워크·console·웹 저장소 금지)에 extension-erp, package.json에 `ext-erp:build`(tsc + manifest·options.html 복사)
- 차례: Phase 0

## TASK-2: 도우미 — 새 확장 허용과 부른 쪽마다 명령 나눔
- REQ: REQ-3601
- AC: AC-3601.1, AC-3601.2, AC-3601.3, AC-3601.4
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

## TASK-8: 도우미 판 올림
- REQ: REQ-3610
- AC: AC-3610.1
- Files: helper/Directory.Build.props, src/lib/bridge/versions.ts, src/lib/bridge/handshake.test.ts, src/lib/bridge/client.test.ts, helper/tests/input-wiring.dotnet.test.ts, helper/install/README.md, extension-erp/README.md
- Tests: src/lib/bridge/handshake.test.ts, src/lib/bridge/client.test.ts, helper/tests/input-wiring.dotnet.test.ts
- TDD: required — 번호는 사용자가 판을 만들 때 정한다(제안 0.6.0). Version = LATEST_HELPER, MIN_HELPER 그대로. 설치 안내(새 확장 압축 풀어 로드하기, 새 도우미 먼저 깔기)
- 차례: Phase 3

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
- TDD: required — 크롬 도구가 없을 수 있어 사용자와 함께 한다: 새 도우미 설치(사용자) → `ext-erp:build` 압축 → 압축해제 로드 → 2026-11-09 마감일지에서 단추 → 칸·금액칸·다른 칸으로 옮겨도 남는지 확인 → notes에 적음. 금액칸이 안 들어가면 그때만 fill.ts를 `execCommand('insertText')` 방식으로 고친다(시험 먼저). 저장은 사용자가 정한다
- 차례: Phase 3 (TASK-8 뒤, 사용자와 시간 맞춰)

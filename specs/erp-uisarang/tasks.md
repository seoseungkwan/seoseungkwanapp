# 작업 분할: ERP 마감일지 의사랑판

> 형식: `## TASK-n: 제목` 아래 `- REQ:`, `- AC:`, `- Files:`(수정 범위), `- Tests:`, `- TDD:`, `- 차례:`. 승인되면 Files/Tests 경로만 고칠 수 있다.
> **할 순서** (사용자 "Phase별로 step으로하고 병렬로 할수있는건 병렬로해 검토는 마지막에 한번만"). 같은 Step 안 TASK는 Files가 겹치지 않아 일꾼마다 각자 worktree에서 동시에 한다.
> - Phase 1 — Step 1: TASK-1(리드, 도우미 바탕·명령 표) ‖ TASK-2(확장 공용 타입·글) → Step 2: TASK-3 ‖ TASK-4 ‖ TASK-5 ‖ TASK-6
> - Phase 2 — TASK-7 ‖ TASK-8 ‖ TASK-9 ‖ TASK-10 ‖ TASK-11 ‖ TASK-12 (화면 TASK-11·12는 시안 승인 뒤에만)
> - Phase 3 — TASK-13 ‖ TASK-14
> - Phase 4 — TASK-15 ‖ TASK-17(명세 고침 반영, design.md 2-1. TASK-12·14 뒤, Files 안 겹침)
> - 마지막 — TASK-16(합치기·판·안내서·설치 묶음·전체 시험·실제 의사랑 PC 확인, TASK-15·17 뒤)
> - 검토는 TASK-16의 전체 시험 뒤 한 번.
> 각 TASK는 시험을 먼저 써서 RED를 본다. 지금 시험은 design.md 12-4 표에 적은 것만 기대값을 고친다(그 밖을 고쳐야 하면 그 TASK 보고에 까닭).
> C# 시험은 TASK마다 따로 감싸개·FILTER(design.md 12-3)를 쓴다. 가짜 엑셀은 TASK-1이 만든 `fixtures/fake-uisarang/`만 쓴다(실제 의원 파일·숫자 없음). 모자라면 그 TASK가 생성기에 더하지 않고 C# 시험 안에서 줄을 만들어 `UisReport.Read`에 넣는다(엑셀 바이트가 꼭 필요한 시험만 가짜 파일).

## 먼저 할 일 (코드 작업 아님)
1. 사용자가 시안 `docs/mockups/erp-uisarang/`(design.md 11절대로 고친 판)을 승인한다 — 화면 TASK(11·12·14) 전에
2. 사용자가 design.md '위험 / 미해결 질문'의 사용자 질문 1~3에 답한다(1은 TASK-4 전에)
3. 사용자가 `/sdd approve erp-uisarang`를 입력한다

## TASK-1: 도우미 바탕 — 패키지·.xls 읽기·가짜 엑셀·명령 표
- REQ: REQ-4203, REQ-4210
- AC: AC-4203.1, AC-4203.2, AC-4203.3, AC-4203.4, AC-4210.1
- Files: helper-erp/src/Erp.Core/Erp.Core.csproj, helper-erp/src/Erp.Core/Uisarang/UisTypes.cs, helper-erp/src/Erp.Core/Uisarang/XlsRows.cs, helper-erp/src/Erp.Core/Uisarang/UisFileException.cs, helper-erp/tests/Erp.Core.Tests/Erp.Core.Tests.csproj, helper-erp/tests/Erp.Core.Tests/Uisarang/Xls/XlsRows.test.cs, helper-erp/tests/Erp.Core.Tests/Uisarang/CodePagesSetup.cs, helper-erp/tests/uis-xls.dotnet.test.ts, helper-erp/tests/erp-core.dotnet.test.ts, helper-erp/commands.json, helper-erp/tests/Erp.Core.Tests/ErpCommandTable.test.cs, extension-erp/src/types.ts, extension-erp/src/background.ts, extension-erp/src/background.test.ts, fixtures/make-fake-uisarang.ts, fixtures/make-fake-uisarang.test.ts, fixtures/fake-uisarang/*.xls, .gitignore, package.json
- Tests: helper-erp/tests/uis-xls.dotnet.test.ts, helper-erp/tests/erp-core.dotnet.test.ts, extension-erp/src/background.test.ts, fixtures/make-fake-uisarang.test.ts
- TDD: required — design.md 3-1·4-1(공용 모양 `UisTypes.cs`: 열거형·`XlsCell`·`UisSheet`·`IUisFolder`·`UisFile`·`*Facts`·답 모델)·5-6·12-1·12-4 앞 다섯 줄. 가짜 엑셀 16개를 SheetJS biff8로 만들고 `.gitignore` 되살림 줄. `XlsRows`: 한글·숫자·소수·'1,234'·빈 칸·차례, 깨짐·xlsx·HTML·빈 파일·20,000줄 넘음 → `UisFileException`(글에 칸 값 없음). 패키지: Erp.Core에 ExcelDataReader 3.9.0, 시험 csproj에 CodePages 10.0.14(net10.0만, 시험 시작에서 등록) + 가짜 엑셀 출력 복사. 명령 표 다섯 명령·`sales` 받기/거절(키 enum 밖·코드 0개·21개·코드 꼴). 확장 `COMMANDS` 끝에 두 명령, `ClosingCommand`·`ClosingDayArgs.sales`
- 차례: Phase 1 Step 1 (리드, TASK-2와 함께)

## TASK-2: 확장 공용 타입·화면 글·의사랑 오류 글
- REQ: REQ-4212
- AC: AC-4212.6
- Files: extension-erp/src/uisTypes.ts, extension-erp/src/uisTypes.test.ts, extension-erp/src/uisText.ts, extension-erp/src/uisText.test.ts, extension-erp/src/errors.ts, extension-erp/src/errors.test.ts
- Tests: extension-erp/src/uisTypes.test.ts, extension-erp/src/uisText.test.ts, extension-erp/src/errors.test.ts
- TDD: required — design.md 8-1·8-2·10절 글 그대로(함수 글은 시안 예시 숫자로 한 줄씩: 47칸·6개·2026-11-23, 조사 받침 두 갈래). `UIS_KINDS` 차례·`UIS_REQUIRED`·`UIS_PATIENT`·두 키 목록이 `GROUP_KEYS` 안에 있음. `explainFor`: 의사랑 세 글·그 밖 번호는 의사랑 '그 밖' 글·나머지는 `ERRORS` 그대로, `explain`(비트)은 기대값 그대로
- 차례: Phase 1 Step 1 (TASK-1과 함께)

## TASK-3: 보고서 알아보기·라벨·칸 찾기
- REQ: REQ-4204
- AC: AC-4204.1, AC-4204.2, AC-4204.3, AC-4204.4
- Files: helper-erp/src/Erp.Core/Uisarang/UisReport.cs, helper-erp/tests/Erp.Core.Tests/Uisarang/Report/*.test.cs, helper-erp/tests/uis-report.dotnet.test.ts
- Tests: helper-erp/tests/uis-report.dotnet.test.ts
- TDD: required — design.md 5-1·5-2·5-3·5-4. 여섯 종류 + 종류 모름(두 종류에 맞음·머리글 없음·31번째 줄 머리글), 빈칸 든 머리글, 되풀이 머리글·빈 줄 건너뜀, 라벨 `[조 회 일]` 한 칸/옆 칸 값·물결 범위·`.`/`/` 구분·날짜 아님, 조건 '외래'·날짜 꼴 라벨은 조건 아님·라벨 없음, 칸 없음/둘 → `MissingColumns`, `GuessByName` 일곱 갈래. AC-4204.4는 '같은 종류 여럿' 고르기 규칙 가운데 시트 하나로 정할 수 있는 부분(날짜가 마감 일자 하루인가 = `IsOnDay`)
- 차례: Phase 1 Step 2 (TASK-1 뒤)

## TASK-4: 작은 규칙 — 의사랑 찾기·폴더 고르기·코드 꼴·만 나이·자료원 파일
- REQ: REQ-4201, REQ-4202, REQ-4207
- AC: AC-4201.1, AC-4201.3, AC-4202.1, AC-4207.2
- Files: helper-erp/src/Erp.Core/Uisarang/UisRules.cs, helper-erp/src/Erp.Core/Uisarang/UisAge.cs, helper-erp/src/Erp.Core/Uisarang/UisSource.cs, helper-erp/tests/Erp.Core.Tests/Uisarang/Rules/*.test.cs, helper-erp/tests/uis-rules.dotnet.test.ts
- Tests: helper-erp/tests/uis-rules.dotnet.test.ts
- TDD: required — design.md 4-1·4-3·6-4. `FindUisarang`(C: 없음 D: 있음, FStat.exe 없는 ysr2000, 대소문자), `ChooseFolder`(OneDrive 셋·빈 바탕화면·바탕화면이 OneDrive 밖 다른 폴더), `Code`, `Age`(세기 여섯 갈래·가린 뒷자리·2월 29일·마감 일자보다 뒤·글자 섞임·6자리), `Band`(9·10·99·100), `UisSource`(쓰기·읽기·모양 틀림·없음·지우기, 임시 폴더)
- 차례: Phase 1 Step 2 (TASK-1 뒤, 사용자 질문 1 답 뒤)

## TASK-5: 확장 의사랑 설정 모양·칸 계획·답 검사·멈춤 판정
- REQ: REQ-4208, REQ-4211, REQ-4212, REQ-4214
- AC: AC-4208.3, AC-4211.3, AC-4211.4, AC-4212.1, AC-4212.2, AC-4212.3, AC-4214.4
- Files: extension-erp/src/uisSettings.ts, extension-erp/src/uisSettings.test.ts, extension-erp/src/uisCells.ts, extension-erp/src/uisCells.test.ts
- Tests: extension-erp/src/uisSettings.test.ts, extension-erp/src/uisCells.test.ts
- TDD: required — design.md 6-1 표·8-3·8-4·9-2. `planUisCells` 칸 자리가 모두 `planCells(처음 값 설정)` 칸 자리 안, none 75칸·missing 칸은 계획에 없음, unpicked·unknown·noName, 도수·충격파 총금액 = 치료별 매출 값, 예약은 실예약환자수만. `readUisDay` 틀린 모양 열 가지(null 아닌 곳 null·음수·소수·reports 5개·source 없음 등). `stopOf` 차례(open → otherDate → notAll → twice → missing → some, 선택 2개만 없음 = 멈춤 없음, cached = 있음). `toUisArgs`(고른 묶음만·차례), `normalizeUis`, `searchUis`, `savedSources`(값은 읽지 않음)
- 차례: Phase 1 Step 2 (TASK-2 뒤)

## TASK-6: 엑셀 파일 쓰기 (zip·SpreadsheetML)
- REQ: REQ-4213
- AC: AC-4213.2
- Files: extension-erp/src/zip.ts, extension-erp/src/zip.test.ts, extension-erp/src/xlsxWrite.ts, extension-erp/src/xlsxWrite.test.ts
- Tests: extension-erp/src/zip.test.ts, extension-erp/src/xlsxWrite.test.ts
- TDD: required — design.md 7-2. `crc32` 알려진 값, `zipStore` 머리·중앙 목록·DOS 시각, `workbookBytes`를 저장소 `xlsx` 0.20.3으로 다시 읽어 칸 값·숫자 칸·inlineStr·빈 칸 없음·틀 고정·열 너비·XML 특수 글자·제어 글자. 이 두 파일은 다른 모듈을 import하지 않는다(합칠 때 erp-copy-list와 한 벌로)
- 차례: Phase 1 Step 2 (TASK-1 뒤)

## TASK-7: 합계 엑셀 셈 — 일일수입통계·기간별처방통계
- REQ: REQ-4205, REQ-4206
- AC: AC-4205.1, AC-4205.2, AC-4205.3, AC-4206.1, AC-4206.2, AC-4206.4
- Files: helper-erp/src/Erp.Core/Uisarang/UisIncome.cs, helper-erp/src/Erp.Core/Uisarang/UisRx.cs, helper-erp/tests/Erp.Core.Tests/Uisarang/Sums/*.test.cs, helper-erp/tests/uis-sums.dotnet.test.ts
- Tests: helper-erp/tests/uis-sums.dotnet.test.ts
- TDD: required — design.md 5-3·6-1·6-2. 가짜 `income*.xls`·`rx*.xls`로: 합계 줄 하나만·병합 총진료비·합계 줄 없음/둘, 맞춰 보기 셋, 코드 꼴 정리·같은 코드 여러 줄·쪽 머리 되풀이·소수·원 미만 버림·합계 줄 대조, `UisRx.List`(코드마다 한 줄·총액 차례·2,000개·21자 코드). 묶음 합·재진·산정안함 셈은 TASK-13(`UisDay`)에서 이 Facts로 한다 — 여기서는 Facts가 맞는지만
- 차례: Phase 2 (TASK-3 뒤)

## TASK-8: 내원·예약 셈 — 위쪽 표와 환자별 아래쪽 표
- REQ: REQ-4207, REQ-4208, REQ-4209
- AC: AC-4207.1, AC-4207.3, AC-4207.5, AC-4208.1, AC-4208.2, AC-4209.3
- Files: helper-erp/src/Erp.Core/Uisarang/UisVisits.cs, helper-erp/src/Erp.Core/Uisarang/UisPatients.cs, helper-erp/tests/Erp.Core.Tests/Uisarang/Patients/*.test.cs, helper-erp/tests/uis-patients.dotnet.test.ts
- Tests: helper-erp/tests/uis-patients.dotnet.test.ts
- TDD: required — design.md 5-3·6-1·6-2·6-4·12-2. 환자 줄(차트번호 숫자만)·신규·나이 구간·나이 못 셈·조회일 라벨 있음/없음, 서로 다른 차트번호·방문·예약일 다른 줄 → `AllOnDay` false, 위쪽 표 합계 줄/그날 줄. AC-4209.3은 Facts 모양(글자 칸 없음, 리플렉션)과 코드 글자(수진자명·전화번호·주소·휴대전화 글자가 `UisPatients.cs`에 없음)
- 차례: Phase 2 (TASK-3·TASK-4 뒤)

## TASK-9: 폴더 다루기와 모아 둔 값
- REQ: REQ-4202, REQ-4210
- AC: AC-4202.2, AC-4210.4
- Files: helper-erp/src/Erp.Core/Uisarang/UisDiskFolder.cs, helper-erp/src/Erp.Core/Uisarang/UisCache.cs, helper-erp/tests/Erp.Core.Tests/Uisarang/Folder/*.test.cs, helper-erp/tests/uis-folder.dotnet.test.ts
- Tests: helper-erp/tests/uis-folder.dotnet.test.ts
- TDD: required — design.md 4-1·4-4. 실제 임시 폴더: 없으면 만듦·`.XLS` 대문자·하위 폴더·다른 확장자·연결 파일(윈도우에서만, 만들 수 없으면 건너뜀)·연결 폴더 → `E-UIS-FOLDER`, `IsOpen`(다른 핸들이 FileShare.None으로 열고 있음), `Delete` 실패 → false. `UisCache`: 가짜 `IProtector`로 저장·읽기·다른 날·24시간 넘음·깨진 파일 → null·보고서별 덮어쓰기. AC-4210.4는 저장소 부분만(합치기 차례는 TASK-13)
- 차례: Phase 2 (TASK-1 뒤)

## TASK-10: [엑셀로 받기] 시트 모양
- REQ: REQ-4213
- AC: AC-4213.1
- Files: extension-erp/src/uisSheet.ts, extension-erp/src/uisSheet.test.ts
- Tests: extension-erp/src/uisSheet.test.ts
- TDD: required — design.md 7-1. 시안 예시 숫자 답으로: 1행 머리(요일), 머리 줄 차례, 숫자 줄 149줄, 값 = `planUisCells` 값, 까닭 다섯 글, noName은 값을 씀, direct 칸 18줄 위치(MOU 감액·지출·신환경로·상담-전환률), 파일 이름. 환자 정보가 없음(글자 칸은 칸 이름·까닭·머리 글뿐)
- 차례: Phase 2 (TASK-5 뒤)

## TASK-11: ERP 화면 의사랑 안내 그리기
- REQ: REQ-4212, REQ-4213
- AC: AC-4212.1, AC-4212.2, AC-4212.3, AC-4212.4, AC-4212.5, AC-4213.3
- Files: extension-erp/src/uisView.ts, extension-erp/src/uisView.test.ts, extension-erp/src/panel.ts, extension-erp/src/panel.test.ts
- Tests: extension-erp/src/uisView.test.ts, extension-erp/src/panel.test.ts
- TDD: required — design.md 8-6·8-9 panel·9-3·10-1~10-3·11절. 시안(고친 판) ①~⑭ 글·단추 차례 그대로, 숫자는 시안 예시. 단추 줄 셋·읽는 중 글이 누른 단추, `setLastUis`. 비트 상태 DOM은 지금 panel 시험 그대로. 모든 글은 textContent. AC-4213.3은 단추가 보이는 곳(③⑦10-3)과 멈춤 안내엔 없음까지
- 차례: Phase 2 (TASK-2·TASK-5 뒤, 시안 승인 뒤)

## TASK-12: 의사랑 설정 화면
- REQ: REQ-4206, REQ-4214
- AC: AC-4206.5, AC-4214.1, AC-4214.2, AC-4214.3, AC-4214.5
- Files: extension-erp/src/uisOptions.ts, extension-erp/src/uisOptions.test.ts, extension-erp/src/options.ts, extension-erp/src/options.test.ts
- Tests: extension-erp/src/uisOptions.test.ts, extension-erp/src/options.test.ts
- TDD: required — design.md 8-8·8-9 options·9-5·10-6·11절 1·10·18. 가짜 chrome으로: `erpClosingUis`만 있으면 `closing.codes`를 부르지 않음, `closing.codes` → `E-CLOSING-WRONG-SOURCE`면 의사랑 화면(오류 글 없음), 비트 화면 시험은 기대값 그대로. 줄 차례·두 이름표·찾기 30개·소수 주황·'(처방통계에 없음)'·21자 코드 못 고름, [코드 목록 읽기] 다섯 결과 글과 `erpClosingUisCodes` 곧바로 씀, [저장] 한 열쇠·나가기 확인, 예약 한 줄. AC-4206.5는 확장 쪽(답 모양 받기·글)만, 도우미 쪽은 TASK-13
- 차례: Phase 2 (TASK-2·TASK-5 뒤, 시안 승인 뒤)

## TASK-13: 도우미 의사랑 명령 — 한 번 읽기 차례·셈·코드 목록·처리기
- REQ: REQ-4202, REQ-4206, REQ-4207, REQ-4209, REQ-4210
- AC: AC-4202.3, AC-4202.4, AC-4206.3, AC-4206.5, AC-4207.4, AC-4209.1, AC-4209.2, AC-4209.4, AC-4210.2, AC-4210.3, AC-4210.4, AC-4210.5
- Files: helper-erp/src/Erp.Core/Uisarang/UisDay.cs, helper-erp/src/Erp.Core/Uisarang/UisCodes.cs, helper-erp/src/Erp.Core/Uisarang/UisCommands.cs, helper-erp/src/Erp.Core/Uisarang/UisServices.cs, helper-erp/tests/Erp.Core.Tests/Uisarang/Day/*.test.cs, helper-erp/tests/uis-day.dotnet.test.ts
- Tests: helper-erp/tests/uis-day.dotnet.test.ts
- TDD: required — design.md 3-2~3-5·4-2·4-4·5-5·6-1·6-2. 가짜 `IUisFolder`(부름 기록: List·IsOpen·Read·Delete 차례)와 가짜 엑셀로: 열림 → 아무것도 안 읽음, 환자별 Delete가 그 Read 바로 다음, 5-5 표 줄마다, 같은 종류 여럿 가운데 그날 것 하나, 모아 둔 값 합치기(cached·다른 날 버림·코드별 합으로 설정 바꿔 다시), 묶음 합·재진·산정안함·음수·소수, groups 차례, 오늘 뒤 날짜, 같은 key 둘, 처리기 두 갈래(비트 extras·의사랑)와 WRONG-SOURCE. AC-4209.1은 12-2 표시 글자가 답·기록·모아 둔 값·예외 글에 없음(성공·날짜 다름·종류 모름·깨짐·같은 종류 둘). AC-4210.5는 코드 글자(Uisarang 폴더에 `System.Net`·`SqlConnection`·`HospitalGate` 없음)
- 차례: Phase 3 (TASK-7·8·9 뒤)

## TASK-14: 확장 ERP 화면 흐름 잇기
- REQ: REQ-4211, REQ-4212, REQ-4213, REQ-4215
- AC: AC-4211.1, AC-4211.2, AC-4211.5, AC-4212.3, AC-4212.5, AC-4213.3, AC-4213.4, AC-4215.3
- Files: extension-erp/src/uisFlow.ts, extension-erp/src/uisFlow.test.ts, extension-erp/src/main.ts, extension-erp/src/main.test.ts, extension-erp/src/main.uis.test.ts, extension-erp/manifest.json, extension-erp/src/manifest.test.ts
- Tests: extension-erp/src/uisFlow.test.ts, extension-erp/src/main.uis.test.ts, extension-erp/src/main.test.ts, extension-erp/src/manifest.test.ts
- TDD: required — design.md 8-7·8-9 main·9-4. 가짜 chrome·시험용 ERP 화면(`__tests__/erpPage.ts`, 고치지 않음)으로: 단추 이름 정하기 네 갈래(비트만 저장 = 부름 없음 · 의사랑만 = 부름 없음 · 둘 다 없음/둘 다 = `closing.source` 한 번 · 5초 넘음/옛 도우미/없음 = 비트), 정해지기 전 누름, 흐름 차례 전부, 답에 source 없음 → WRONG-SOURCE 글, ⑦ [있는 엑셀로 채우기]·[엑셀로 받기]가 다시 읽지 않음, 단추 줄은 다시 읽음, 날짜 바뀌면 들고 있는 답 버림, 받기 = Blob·`a[download]`·1초 안 revoke·storage에 안 씀. AC-4215.3: 지금 main 시험 기대값 그대로 + 비트 자료원 새 시험(`main.uis.test.ts`). design.md 12-4의 모듈 목록 두 줄만 고침
- 차례: Phase 3 (TASK-10·11 뒤, 시안 승인 뒤)

## TASK-15: 도우미 입구 — 자료원 갈래·의사랑 등록·설치 글
- REQ: REQ-4201, REQ-4215
- AC: AC-4201.2, AC-4201.4, AC-4215.4
- Files: helper-erp/src/Erp.Helper/Program.cs, helper-erp/src/Erp.Helper/UisHelperServices.cs, helper-erp/src/Erp.Helper/ErpStage.cs, helper-erp/install/install.ps1, helper-erp/tests/erp-helper-uis.test.ts, helper-erp/tests/erp-helper.test.ts
- Tests: helper-erp/tests/erp-helper-uis.test.ts, helper-erp/tests/erp-helper.test.ts
- TDD: required — design.md 4-3·10-5. 코드 글자 시험(지금 erp-helper.test.ts 꼴): 비트 갈래 `ClosingCommands.Register(dispatcher, ErpServices.Create())` 줄 그대로 + `RegisterBitExtras` 한 줄, `E-BIT-NOT-FOUND`일 때만 의사랑, 출력 두 줄 ASCII, 비트 저장 뒤 `UisSource.Delete`, `ErpStage.Uis`. 자료원 파일 오류(design.md 4-3 고침 5): `UisSource.WriteUisarang`·비트 저장 뒤 `UisSource.Delete`의 `IOException`·`UnauthorizedAccessException`을 잡아 `E-STORE-FAILED`·`STEP-UIS`·2(예외로 끝나지 않음), 폴더 실패는 `UisDiskFolder.FolderFailed`. install.ps1: 앞 글·의사랑 두 글·`STEP-UIS` 단계 글·10-5 ★ 실패 글 둘(윈도우에서 가짜 exe로 출력 줄을 주어 확인). 지금 install.ps1 시험(AC-3806.3)의 비트 글 기대값은 그대로. erp-helper.test.ts AC-3801.4 '명령 표·확장 그대로'는 design.md 12-4대로 고침
- 차례: Phase 4 (TASK-13 뒤, TASK-17과 함께)

## TASK-16: 합치기·판 0.4.0·안내서·설치 묶음·전체 시험·실제 의사랑 PC 확인
- REQ: REQ-4215, REQ-4216
- AC: AC-4215.1, AC-4215.2, AC-4216.1, AC-4216.2, AC-4216.3, AC-4216.4
- Files: helper-erp/Directory.Build.props, extension-erp/manifest.json, extension-erp/README.md, helper-erp/install/README.md, extension-erp/src/readme.test.ts, extension-erp/src/manifest.test.ts, helper-erp/tests/erp-core.dotnet.test.ts, helper-erp/tests/erp-helper.test.ts, helper-erp/tests/erp-helper-build.dotnet.test.ts, helper-erp/tests/uis-whole.test.ts, specs/erp-uisarang/notes/uisarang-pc-check.md
- Tests: helper-erp/tests/uis-whole.test.ts, extension-erp/src/readme.test.ts, extension-erp/src/manifest.test.ts, helper-erp/tests/erp-core.dotnet.test.ts, helper-erp/tests/erp-helper-build.dotnet.test.ts
- TDD: required — design.md 12-4에서 TASK 칸에 16이 든 줄·13절. `uis-whole.test.ts`: AC-4215.1 `git diff efe60061 --` 목록이 빔, AC-4215.2 12-4 밖 기대값 바뀜 없음(지금 시험 파일 diff가 12-4 줄 안). 판 0.4.0·짝 문장·'의사랑 의원' 절. Release net48 빌드 출력에 ExcelDataReader.dll(과 요구 dll). 그다음 `npm test`·`npm run lint`·`npm run ext-erp:build`·도우미 시험(net48 포함) 전체 → 마지막 검토 한 번 → 사용자가 말하면 설치 파일. AC-4216.4는 시험이 아니라 사용자와 실제 PC에서 13절 목록(결과 노트엔 숫자 없이)
- 차례: 마지막 (TASK-15·TASK-17 뒤 = 모든 TASK 뒤)

## TASK-17: 명세 고침 반영 — 의사랑 글·설정 저장법·폴더 글·Send 한 곳·가짜 파일 되살리기 시험
- REQ: REQ-4203, REQ-4211, REQ-4212, REQ-4214
- AC: AC-4203.5, AC-4211.6, AC-4212.2, AC-4212.7, AC-4214.3, AC-4214.6
- Files: extension-erp/src/uisTypes.ts, extension-erp/src/uisTypes.test.ts, extension-erp/src/uisText.ts, extension-erp/src/uisText.test.ts, extension-erp/src/uisView.ts, extension-erp/src/uisView.test.ts, extension-erp/src/panel.ts, extension-erp/src/panel.test.ts, extension-erp/src/uisOptions.ts, extension-erp/src/uisOptions.test.ts, extension-erp/src/options.ts, extension-erp/src/uisFlow.ts, extension-erp/src/uisFlow.test.ts, fixtures/make-fake-fixtures.test.ts
- Tests: extension-erp/src/uisText.test.ts, extension-erp/src/uisView.test.ts, extension-erp/src/panel.test.ts, extension-erp/src/uisOptions.test.ts, extension-erp/src/uisFlow.test.ts, fixtures/make-fake-fixtures.test.ts
- TDD: required — design.md 2-1 고침 1·2·4②·7·9·10·12, 10-1·10-6. (1) `uisText.ts`: ⑩ `cond.leadLabel` 뺌(`cond.lead`만), ⑪ `dup.lead(report)` 수 없이 '{보고서} 엑셀이 여러 개 있어요.'·환자별 '모두 지웠어요', 설정 `codes.twice` 수 없이, 저장법 `reports.howTo[2]`를 10-6 ★ 셋째 줄로, `reports.suffix` 뺌, `UIS_OPTIONS_FOLDER = 'ERP마감 폴더'`와 맨 위 상자 자리 설명, 진료 0건·이미 적힌 칸 의사랑 첫 줄 두 글 더함. `uisView.ts`는 `dup.lead`에 수를 넘기지 않음. (2) `panel.ts` `askZero`·`askWritten`: 자료원이 의사랑이면 첫 줄만 의사랑 글, 비트는 `FLOW_TEXT` 그대로(지금 panel 시험 기대값 그대로 + 의사랑 새 시험). (3) `uisOptions.ts`: `FOLDER = UIS_FOLDER_TEXT.desktop` 대신 `UIS_OPTIONS_FOLDER`, 표 밑 '-환자별' 줄 뺌, `Send` 정의 뺌. (4) `Send`는 `uisTypes.ts`에서만 내보내고 `uisOptions.ts`·`uisFlow.ts`·`options.ts`가 가져다 씀(uisFlow에 따로 정한 것이 있으면 뺌. 시험은 소스 글자로 'type Send' 한 곳). (5) `fixtures/make-fake-fixtures.test.ts` AC-005.2: 되살림 기대값에 `UIS_FIXTURE_NAMES` → `!fixtures/fake-uisarang/{이름}` 더함(design.md 12-4, 글롭 없음은 그대로). 기능 TASK가 만든 시험(uisText·uisView·uisOptions·uisFlow)의 옛 글 기대값은 새 글로 고친다. 비트 글·비트 시험 기대값은 바꾸지 않는다. 끝에 `npm test -- extension-erp fixtures`·`npm run lint`
- 차례: Phase 4 (TASK-12·TASK-14 뒤, TASK-15와 함께 — Files 안 겹침)

## TASK-18: 실제 PC 고침 — 예약 아래쪽 표 예약일 날짜 찾기 넓힘·라벨로 대신 보기
- REQ: REQ-4208
- AC: AC-4208.1, AC-4208.4
- Files: helper-erp/src/Erp.Core/Uisarang/UisPatients.cs, helper-erp/src/Erp.Core/Uisarang/UisDay.cs, helper-erp/tests/Erp.Core.Tests/Uisarang/Patients/UisPatients.test.cs, helper-erp/tests/Erp.Core.Tests/Uisarang/Day/UisDayRead.test.cs, helper-erp/tests/uis-patients.dotnet.test.ts, helper-erp/tests/uis-day.dotnet.test.ts
- Tests: helper-erp/tests/uis-patients.dotnet.test.ts, helper-erp/tests/uis-day.dotnet.test.ts
- TDD: required — design.md 2-1 고침 15. `UisPatients`에 예약일 날짜 찾기 하나(공개, UisDay.RsvDays도 이것을 씀), `RsvPatientFacts`에 날짜를 찾은 줄이 있는지 표시. 지금 시험 RsvOtherDay의 빈 칸·'내일'·'11/23/2026'·'20261123'·숫자 칸 기대값은 고침 15대로 바뀜(빈 칸·'내일'은 판단에서 빠짐, 나머지는 그날). UisDay: 날짜를 찾은 줄이 없으면 조회일 라벨로 state·from·to. 환자 칸 값은 지금처럼 답·로그에 없음(AC-4209)
- 차례: TASK-16 뒤(실제 PC 확인 중 고침)

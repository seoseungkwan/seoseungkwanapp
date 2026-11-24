# 작업 분할: ERP 마감일지 입력 목록(복사·엑셀, 자동 입력 없음)

> 형식: `## TASK-n: 제목` 아래 `- REQ:`, `- AC:`, `- Files:`(수정 범위), `- Tests:`, `- TDD:`, `- 차례:`. 승인되면 Files/Tests 경로만 고칠 수 있다.
> **할 순서** (사용자 "Phase별로 step, 병렬로 할 수 있는 건 병렬, 검토는 마지막 한 번"):
> - Phase 1 — Step 1: TASK-1(틀·열쇠·글, 작음, 리드가 바로. 공개키를 정해야 TASK-4가 ID를 쓴다) → Step 2: TASK-2 ‖ TASK-3 ‖ TASK-4 ‖ TASK-6(파일이 겹치지 않아 일꾼 넷이 각자 worktree에서 동시에)
> - Phase 2 — TASK-5(일꾼 하나, TASK-2·3을 합친 뒤. 화면이 목록 모양·엑셀을 부른다)
> - 리드 마지막 검사: 시험 전체(`npm test`)·`npm run lint`·`npm run ext-erp-list:build`·`npm run ext-erp:build`·`git diff --name-only ec536578 -- helper src extension extension-erp`가 `src/b2b-merge.test.ts` 하나(더한 줄 하나)뿐·`helper-erp` Release net48 빌드·목록 화면 사진(PC 너비만, 가짜 chrome과 가짜 답으로) → 마지막 검토 한 번
> - Phase 3 — TASK-7(사용자와 함께, 실제 PC 크롬·ERP·엑셀)
> 각 TASK는 시험을 먼저 써서 RED를 본다. 지금 확장(`extension-erp/`) 시험은 기대값을 바꾸지 않는다. 기대값을 바꾸는 지금 시험은 TASK-1의 두 곳(`src/b2b-merge.test.ts` 한 줄, `erp-helper.test.ts` AC-3801.4 diff 경로)과 TASK-4에 적은 ERP 도우미 시험 세 곳뿐이다(까닭: 이 명세).

## 먼저 할 일 (코드 작업 아님)
1. 승인된 시안은 `docs/mockups/erp-copy-list/`에 있다(2026-11-24 사용자 승인)
2. 명세 승인(`/sdd approve erp-copy-list` 또는 자동 승인 기록)

## TASK-1: 새 확장의 틀 — manifest·고정 ID·서비스 워커·화면 글·설정 연결
- REQ: REQ-3901
- AC: AC-3901.1, AC-3901.2, AC-3901.3, AC-3901.4, AC-3901.5, AC-3901.6, AC-3901.7
- Files: extension-erp-list/manifest.json, extension-erp-list/tsconfig.json, extension-erp-list/src/background.ts, extension-erp-list/src/background.test.ts, extension-erp-list/src/listTypes.ts, extension-erp-list/src/listTypes.test.ts, extension-erp-list/src/manifest.test.ts, vitest.config.ts, tsconfig.json, eslint.config.mjs, .gitignore, src/b2b-merge.test.ts, helper-erp/tests/erp-helper.test.ts
- Tests: extension-erp-list/src/manifest.test.ts, extension-erp-list/src/background.test.ts, extension-erp-list/src/listTypes.test.ts, src/b2b-merge.test.ts, helper-erp/tests/erp-helper.test.ts
- TDD: required
  - 열쇠: 리드가 scratchpad에서 `node:crypto`로 RSA 2048 열쇠 쌍을 만들고 공개키(SPKI DER base64)만 manifest `key`에 넣는다. 개인키는 파일로 쓰지 않고, 화면·로그·채팅에 찍지 않고 그 자리에서 버린다(design.md 1절). 계산한 ID는 TASK-4에 넘긴다.
  - `manifest.test.ts`
    - AC-3901.1: 맨 위 칸 아홉 개·값·없는 칸 목록(design.md 1절 그대로)
    - AC-3901.2: key가 RSA 2048이고 다시 내보내도 같음, ID 32자 a~p, 지금 확장 ID(`helper-erp/commands.json`)·청구 확장 ID(`extension/manifest.json` key)와 다름, `extension-erp-list/` 아래 `.pem`·'PRIVATE KEY' 없음, `.gitignore`에 `*.pem`. ID 계산 함수는 이 파일에 작게 둔다(지금 시험 파일을 불러오지 않는다)
    - AC-3901.4: `extension-erp-list/src/*.ts`(시험 빼고) 글자에 금지 낱말·`chrome.storage`가 없다. 모든 import(정적 `import … from`·`import '…'`·`export … from`)의 경로가 `./<이름>.js` 또는 표의 `../../extension-erp/src/<이름>.js`뿐이다(패키지 이름·다른 경로 없음). 동적 `import(`가 없다. `../../extension-erp/src/…` import를 모두 읽어 design.md 2절 표 밖의 모듈·이름이 없다. ESLint(`new ESLint({ cwd: ROOT }).lintText`, 지금 AC-3601.5 시험 모양)가 `extension-erp-list/src/` 안 시험용 경로에서 `fetch`·`XMLHttpRequest`·`WebSocket`·`EventSource`·`importScripts`·`navigator.sendBeacon`·`console.log`·`localStorage`·`sessionStorage`·`indexedDB`를 막는다
    - AC-3901.5: 루트 설정 네 곳의 글자(vitest include·주석, tsconfig exclude, ESLint `isPathIgnored('extension-erp-list/dist/x.js')`, `.gitignore` 줄), `tsc -p extension-erp-list/tsconfig.json --noEmit`(`process.execPath` + `node_modules/typescript/bin/tsc`)이 0으로 끝남
    - AC-3901.6: `git diff --name-only ec536578 -- extension-erp extension helper src`(`node:child_process`)가 비었거나 `src/b2b-merge.test.ts` 하나, 그 파일 `git diff --numstat`이 더한 줄 1·뺀 줄 0이고, 더한 줄(`git diff -U0`의 `+` 줄, 앞뒤 공백을 떼고 견줌 — 그 줄은 8칸 들여 씀)이 `'extension-erp-list/**/*.test.ts',`
  - `src/b2b-merge.test.ts`: AC-034.5 vitest include 기대 목록에 `'extension-erp-list/**/*.test.ts',` 한 줄만 더한다(까닭: 이 명세 AC-3901.5, design.md 결정 15). 다른 줄은 고치지 않는다
  - `helper-erp/tests/erp-helper.test.ts`: AC-3801.4 첫 시험의 경로를 `['helper', 'src', 'extension', ':(exclude)src/b2b-merge.test.ts']`로, 시험 이름 끝에 '(src/b2b-merge.test.ts는 spec erp-copy-list AC-3901.6이 따로 봄)'을 더한다(까닭: 이 명세). 이 파일의 다른 곳은 TASK-4가 고친다(TASK-1을 합친 뒤라 겹치지 않음)
  - `background.test.ts` (AC-3901.3)
    - 첫 import 줄이 `import '../../extension-erp/src/background.js'`다.
    - 가짜 chrome으로 `startListBackground`: `action.onClicked`에 하나 걸고, 부르면 `tabs.create({ url: getURL('list.html') })` 한 번
    - `vi.stubGlobal('chrome', …)`(runtime.onMessage·connectNative·action·tabs 있음) 뒤 모듈을 불러오면 `runtime.onMessage.addListener`·`action.onClicked.addListener`가 한 번씩 불린다. chrome이 없으면 아무것도 걸지 않는다
  - `listTypes.test.ts` (AC-3901.7, design.md 4절·7절)
    - 시안 맞춤은 design.md 7절 끝 '시안 맞춤 시험' 그대로다. 고정 글은 시안 `index.html` 원문에 글자 그대로 있다. 함수 글은 시안을 jsdom(`runScripts: 'dangerously'`, 주소 `?s=ready`·`?s=copied`·`?s=error`·`?s=error&e=unregistered`, `#xlsx`·`#openSettings` 누름)으로 그린 글과 같다: '2026-11-01 ~ 2026-11-03 · 3일 · 날마다 131칸', '목록을 만든 때 …'(그린 시각을 뽑아 견줌), 'ERP마감일지_입력목록_2026-11-01_2026-11-03.xlsx', '11/2 · 치료현황 도수상담 · 4', '11/2 · 치료별 건수 씨암(주사) 신환 · 4'(단추 `data-l`·`data-v`), '목록을 만들지 못했어요. (번호 E-HELPER-MISSING)'. `notes.md`와는 견주지 않는다. `warn`·`xlsxZero`는 값으로만 본다
    - `LIST_TEXT` 값 가운데 지금 모듈 글(`TEXT`·`FLOW_TEXT`·`RANGE_TEXT`·`SKIP_TEXT`·`OVERLAP_TEXT`·`explain` 글)과 같은 글이 없다(다시 적지 않음). `WHY_TEXT.noName.help`는 `SKIP_TEXT.noName.help`, `WHY_TEXT.held.help`는 `TEXT.held(…)`다
    - `SCREEN_BOXES`의 네 이름이 `planCells(sampleDay(), settingsAll())`(`../../extension-erp/src/__tests__/erpPage`)의 업무일지 1 상자 이름 모두와 같다(빠지거나 남는 이름 없음)
    - `shortDay('2026-11-02')` = '11/2', `dayHead('2026-11-01')` = '11/1 (일)', `isSunday` 일요일만 참, `TZ`를 바꿔도 같은 값
- 차례: Phase 1 Step 1

## TASK-2: 답 + 설정 → 목록 모양 (rows.ts)
- REQ: REQ-3904
- AC: AC-3904.1, AC-3904.2, AC-3904.3, AC-3904.4, AC-3904.5, AC-3904.6
- Files: extension-erp-list/src/rows.ts, extension-erp-list/src/rows.test.ts
- Tests: extension-erp-list/src/rows.test.ts
- TDD: required
  - 가짜 답·설정은 지금 시험 도우미 `../../extension-erp/src/__tests__/erpPage`(`sampleDay`·`settingsAll`·`settingsFirst`)와 `defaults()`(settings.js)를 쓰고, 날짜·값만 바꾼 사흘(`2026-11-01`~`03`)을 만든다. 환자 정보는 없다
  - AC-3904.1: `lines` 차례가 '업무일지 1' → 진료 · 치료현황 → 외래 수입 → 입원수입 → 환자현황 → '업무일지 2' → 예약 → 치료별 건수 → 연령별 → '운영 지표' → 치료별 매출(sub '금액(원)'), 상자 안 줄 차례가 `planCells` 차례와 같다. `defaults()`로 `rowCount` 131(32 + 99). 줄 이름·열 이름 규칙(실예약환자수·치료별 매출은 col null, 기타 줄 이름, 빈 이름 → '기타N'), `section` 짧은 이름
  - AC-3904.2: 숫자 칸 값이 `planCells` 값 글자 그대로(예 '350000', 쉼표 없음). 날마다 칸 key 차례가 같다. 답이 비면 throw
  - AC-3904.3: 고르지 않은 묶음 줄은 `rowWhy` 'unpicked'. 어떤 날만 그 묶음이 답에 없거나 값이 null이면 그날 칸만 `{ why: 'unknown' }`이고 `rowWhy` null. noName 줄. `reasons`가 나온 것만 `WHY_ORDER` 차례
  - AC-3904.4: `patients.total` 0인 날 `zero` 참, 값은 그대로('0' 포함)
  - AC-3904.5: `warnings`가 날짜 차례 · 날 안에서 `warningLines` 차례이고 '{M/D}: {글}' 꼴. 경고 없는 사흘이면 빈 배열
  - AC-3904.6: `dayChoice`·`overlap`
    - 묻는 날 + `settings.overlap` 'carm' → 그날 SONO 매출이 `planCells(day, s, 'carm')` 값, 줄 = `RANGE_TEXT.confirm.overlapLast(OVERLAP_TEXT.into.carm)`
    - 묻는 날 + 고른 것 없음 → 값 = `planCells(day, s)`, 줄 = `OVERLAP_TEXT.done(K, 'both')`(K = 묻는 날 visits 합)
    - 묻지 않는 날은 `settings.overlap`이 있어도 고른 것 없음 값. 묻는 날이 없으면 `overlap` null
    - `saveOverlap`을 부르지 않는다(글자 검사)
- 차례: Phase 1 Step 2

## TASK-3: 엑셀 파일 쓰기 (zip.ts·xlsx.ts)
- REQ: REQ-3906
- AC: AC-3906.2, AC-3906.3, AC-3906.4
- Files: extension-erp-list/src/zip.ts, extension-erp-list/src/zip.test.ts, extension-erp-list/src/xlsx.ts, extension-erp-list/src/xlsx.test.ts
- Tests: extension-erp-list/src/zip.test.ts, extension-erp-list/src/xlsx.test.ts
- TDD: required
  - 시험 목록 모양(`ListModel`)은 손으로 만든다(`rows.ts`를 부르지 않는다): 사흘(시안처럼 첫날 11/1(일) 진료 0건), 업무일지·상자 머리, 치료별 매출 머리(sub), 숫자 줄, 모든 날 까닭 줄, 어떤 날만 까닭 줄, 까닭 둘 줄, 이름에 `&<>"'`와 제어 글자
  - `zip.test.ts` (AC-3906.3): `crc32('123456789')` = `0xCBF43926`, 빈 바이트 0. `zipStore` 결과의 파일 머리(서명 `PK\x03\x04`)·가운데 목록·끝 머리 수가 맞고, 이름·차례·크기·CRC가 넣은 것과 같다(압축 방식 0)
  - `xlsx.test.ts`
    - AC-3906.3: 저장소의 `xlsx` 0.20.3 `read(bytes, { type: 'array' })`로 다시 읽어 시트 이름 하나 'ERP 마감일지 입력 목록', 모든 칸 값·종류(n·s)·빈 칸이 `sheetRows(model)`과 같다. 숫자 칸 서식이 일반(쉼표 없음). `&<>"'`가 글자 그대로, 제어 글자는 빠짐
    - AC-3906.2: `sheetRows` 1행('항목' · '11/1 (일) 진료 0건' · '11/2 (월)' · '11/3 (화)' · '빈 칸 까닭'), 머리 줄 A칸만(치료별 매출 '치료별 매출 금액(원)'), 숫자 줄 A칸 이름 규칙, 숫자는 number, 까닭 칸 null, 끝 열 글(모든 날 = 꼬리표 글, 어떤 날만 = '{꼬리표 글} (11/2)', 둘 = ', '로 이음, 없으면 null). `sheet1.xml`에 틀 고정(`xSplit="1" ySplit="1"` `topLeftCell="B2"` `state="frozen"`)과 `cols`, `styles.xml`에 채움 두 개(`none`·`gray125`)·`cellStyleXfs`·`cellXfs`·`cellStyles`. 경고 줄·씨암·SONO 줄·만든 때 글이 파일에 없다
    - `fileName` = 'ERP마감일지_입력목록_2026-11-01_2026-11-03.xlsx'
    - AC-3906.4: 파일 안 글에 모양에 없는 글이 없다(파일의 모든 글 칸 ⊂ 줄 이름·머리·까닭 글)
- 차례: Phase 1 Step 2

## TASK-4: ERP 도우미가 목록 확장도 받기 (ErpCallers·Program·등록 틀)
- REQ: REQ-3902
- AC: AC-3902.1, AC-3902.2, AC-3902.3, AC-3902.4, AC-3902.5
- Files: helper-erp/src/Erp.Core/ErpCallers.cs, helper-erp/src/Erp.Helper/Program.cs, helper-erp/install/host-manifest.json, helper-erp/tests/Erp.Core.Tests/ErpCallers.test.cs, helper-erp/tests/Erp.Core.Tests/ErpProtocol.test.cs, helper-erp/tests/erp-core.dotnet.test.ts, helper-erp/tests/erp-helper.test.ts
- Tests: helper-erp/tests/erp-core.dotnet.test.ts, helper-erp/tests/erp-helper.test.ts
- TDD: required
  - `ListExtensionId`는 TASK-1이 정한 공개키로 계산한 ID다(TASK-1을 합친 뒤 시작)
  - C# 시험(namespace `Erp.Core.Tests`, 기존 필터 `Erp.Core.Tests.Erp`에 들어가는 이름, 표시 이름 `AC-3902.n …`), `erp-core.dotnet.test.ts`에 `expectAc('AC-3902.1')`·`expectAc('AC-3902.2')`·`expectAc('AC-3902.3')` 감싸개 `it`
    - `ErpCallers.test.cs`
      - AC-3902.1: 목록 origin(+ `--parent-window=0`) → 첫 인자만 명령 표 origin, 뒤 인자 그대로, 받은 배열 안 바뀜. 그대로 돌려주는 경우 여덟 가지(design.md 8절·requirements AC-3902.1 목록). null → `ArgumentNullException`
      - AC-3902.3: `ListExtensionId` = `extension-erp-list/manifest.json` key로 계산한 ID(`Repo.PathOf`, 계산 함수는 이 파일에 작게), 32자 a~p, 명령 표 `extensionId`·청구 확장 ID와 다름
    - `ErpProtocol.test.cs`에 사실(fact)만 더한다(지금 사실·도움 함수는 고치지 않는다)
      - AC-3902.2: 지금 `Ready()`·`Run()`·`Frame()`으로 args = `ErpCallers.ForMessageLoop([목록 origin, "--parent-window=0"], table)`: `closing.codes`·`closing.day` result, `hello`·`claim.month`·`revenue.days` E-HELPER-UNKNOWN-COMMAND, 입력 닫히면 0
      - AC-3902.2: 다른 origin 다섯 가지를 `ForMessageLoop`에 거쳐도 `ExitRejected`, 기록 하나(E-BRIDGE-REJECTED), 응답 없음, `rig.Connector.Opened` 비어 있음
  - `erp-core.dotnet.test.ts`: Erp.Core 파일 목록 기대값에 `'ErpCallers.cs', // spec erp-copy-list AC-3902.1`을 더한다(까닭: 이 명세)
  - `erp-helper.test.ts`
    - AC-3902.4: 지금 AC-3611.3 시험의 `'return MessageLoop.Run(args, input, output, table, dispatcher, log.Write);'` 기대값을 `ErpCallers.ForMessageLoop(args, table)` 줄로 바꾼다(까닭: 이 명세). 지금 AC-3601.2 시험의 `allowed_origins` 기대값을 `[지금 확장, 목록 확장]` 두 개로 바꾼다(까닭: 이 명세, 목록 확장 ID는 `extension-erp-list/manifest.json` key로 계산). 두 기대값 말고 Program·등록 틀 다른 줄은 그대로
    - AC-3902.4: `git diff --quiet ec536578 -- helper-erp/commands.json helper-erp/Directory.Build.props helper-erp/install/install.ps1 helper-erp/install/install.cmd helper-erp/install/uninstall.ps1 helper-erp/install/README.md`가 0으로 끝남. `allowed_origins`에 `*`가 없다
    - AC-3902.5: `Directory.Build.props` 판 0.3.0, `extension-erp/manifest.json` 판 0.3.0, `extension-erp-list/manifest.json` 판 0.1.0
- 차례: Phase 1 Step 2

## TASK-5: 목록 화면 — list.html·그리기·흐름·복사·받기·빌드
- REQ: REQ-3903, REQ-3904, REQ-3905, REQ-3906, REQ-3907
- AC: AC-3901.7, AC-3903.1, AC-3903.2, AC-3903.3, AC-3903.4, AC-3903.5, AC-3903.6, AC-3903.7, AC-3904.2, AC-3904.3, AC-3904.4, AC-3904.5, AC-3904.6, AC-3904.7, AC-3905.1, AC-3905.2, AC-3905.3, AC-3905.4, AC-3906.1, AC-3907.1, AC-3907.2, AC-3907.3
- Files: extension-erp-list/list.html, extension-erp-list/src/view.ts, extension-erp-list/src/view.test.ts, extension-erp-list/src/list.ts, extension-erp-list/src/list.test.ts, extension-erp-list/src/build.test.ts, scripts/build-erp-list.mjs, package.json
- Tests: extension-erp-list/src/view.test.ts, extension-erp-list/src/list.test.ts, extension-erp-list/src/build.test.ts
- TDD: required
  - DOM 시험은 `// @vitest-environment jsdom`, `list.html` 몸통을 읽어 넣고 가짜 chrome(`runtime.sendMessage`·`openOptionsPage`·`id`)과 `load` 대신 가짜 `chrome.storage.local`을 쓴다. 가짜 답은 TASK-2와 같은 시험 도우미
  - `view.test.ts`
    - AC-3903.1·3901.7: `list.html` 고정 글이 상수와 글자 그대로 같다(`<title>`·h1 = `LIST_TEXT.title`, [설정 열기] = `TEXT.openSettings`, 날짜 이름 = `RANGE_TEXT.pick.from`·`.to`, 단추 = `LIST_TEXT.make`·`.xlsx`, `#help` = `RANGE_TEXT.pick.future`, 맨 아래 = `LIST_TEXT.foot`). id·`[엑셀로 받기]` disabled, 시안 띠 없음, script 하나. `renderHint` 세 줄
    - AC-3904.7·3904.2·3904.4: `renderList` 요약 줄(굵은 기간·'3일'·'날마다 131칸')·도움 줄·만든 때, 머리 '항목'·'11/1 (일)'(`.sun`)·진료 0건 줄과 title, 숫자 칸 단추 글·title '누르면 복사돼요'·`.z`
    - AC-3904.3: rowWhy 줄 `.off` + 꼬리표(title 긴 글), 어떤 날만 빈 칸 `span.nt` 작은 글 + title, '빈 칸 까닭' 상자 차례·나온 것만
    - AC-3904.5·3904.6: 경고 상자 있음/없음, 씨암·SONO 줄 있음/없음, 까닭 없이 씨암·SONO 줄만일 때 제목 없음
    - AC-3904.7: `syncSlide`가 scrollWidth > clientWidth + 1일 때만 밀기 줄을 보인다
    - AC-3905.4·3905.1: 빈 칸·줄 이름·머리에 단추 없음, `copyTail`(시험 모양에 시안과 같은 줄·값을 넣어 '11/2 · 치료현황 도수상담 · 4', 열 있는 줄 '11/2 · 치료별 건수 씨암(주사) 신환 · 4', '실예약환자수'처럼 열을 안 붙이는 줄), `markCopied` now/done 바뀜
    - AC-3903.7: 기타 줄 이름 `<b>x</b>`가 글자로 보인다(innerHTML에 `<b>` 요소 없음)
    - AC-3903.6: `renderError('E-HELPER-MISSING')` 무엇이·어떻게(`explain`)·'목록을 만들지 못했어요. (번호 E-HELPER-MISSING)'
  - `list.test.ts`
    - AC-3903.1: 처음 날짜 칸 값·max = `localToday()`
    - AC-3903.2: 막는 글 세 가지(차례), 그때 `sendMessage` 안 불림, 400일 기간은 시작함
    - AC-3903.3: 설정 없음 → `openOptionsPage` 한 번 + 처음 한 번 두 줄, `sendMessage` 안 불림. 설정 읽기 던짐 → E-BRIDGE-DISCONNECTED 안내
    - AC-3903.4: 사흘을 차례로 하나씩(앞 답 전에는 다음 안 보냄), 보낸 모양 `{ cmd: 'closing.day', args: { date, groups: toGroups(s) } }`, 세는 중 '3일 중 1일'·막힘. 가짜 시계로 120초 → E-HELPER-TIMEOUT, 던짐 → E-BRIDGE-DISCONNECTED, `{ type: 'error', code: 'E-BIT-NOT-FOUND' }` → 그 번호, 다른 날짜 답·모양 틀림 → E-BRIDGE-BAD-REPLY
    - AC-3903.5: [그만두기] → 처음 안내, 막힘 풀림, 늦게 온 답이 화면을 바꾸지 않음, 다음 날 안 물음
    - AC-3903.6: 둘째 날 오류 → 셋째 날 안 물음, 표 없음, `[엑셀로 받기]` 막힘
    - AC-3903.7: 다 받으면 표 + `[엑셀로 받기]` 열림, `chrome.storage.local.set` 안 불림, 새로 만들면 복사 표시 지움
    - AC-3905.1·3905.2·3905.3: 숫자 칸 누름 → `navigator.clipboard.writeText(값)`, 쪽지 두 줄, 1.8초 뒤 숨김(가짜 시계), now/done. writeText 실패 → `execCommand('copy')`, 둘 다 실패 → 실패 쪽지(`.bad`)·표시 그대로
    - AC-3906.1: `[엑셀로 받기]` → `URL.createObjectURL`(Blob 종류 `XLSX_TYPE`)·`a.download` 이름·누름, `revokeObjectURL`은 누름 바로 뒤에는 안 불리고 가짜 시계로 한 박자 뒤 한 번, 쪽지. 날짜 칸을 바꾼 뒤 눌러도 표의 기간 이름
    - AC-3907.1: `[설정 열기]` → `openOptionsPage` + 쪽지 '설정 화면을 새 탭으로 열었어요.'
  - `build.test.ts` (AC-3907.2·3907.3)
    - `rewriteOptions`: 지금 `extension-erp/options.html`에서 script 줄 하나만 바뀌고 나머지 글자 같음. 줄이 없거나 둘이면 throw
    - `missingRefs`: 임시 폴더에서 빠진 파일을 찾음
    - 실제 빌드(`node scripts/build-erp-list.mjs`) 한 번: dist 파일 목록이 design.md 1절과 같고 `content.js`·시험·`.map` 없음, `missingRefs` 빈 목록, dist `options.html`은 `extension-erp/options.html`과 script 줄만 다름, `package.json` `ext-erp-list:build` 글자. 지금 `ext-erp:build` 글자는 그대로
- 차례: Phase 2

## TASK-6: 새 확장 안내서 (README)
- REQ: REQ-3908
- AC: AC-3908.1
- Files: extension-erp-list/README.md, extension-erp-list/src/readme.test.ts
- Tests: extension-erp-list/src/readme.test.ts
- TDD: required
  - AC-3908.1: 절 제목 1~8과 머리 글(하지 않는 일 세 가지·지금 확장과 같이 깔아도 됨), 두 안내서 링크가 실제 파일을 가리킴, '2026-11-24 이후 받은 ERP 도우미 설치 파일', 빈 칸 까닭 네 가지의 꼬리표 글·긴 글이 `WHY_TEXT`와 같음, 오류 글이 `explain` 글 그대로, 'ERP 도우미가 이 PC에 없어요.' 다시 설치 안내, 짝 판 문장 '입력 목록 확장 0.1.0 ↔ ERP 도우미 0.3.0', 빌드 명령 `npm run ext-erp-list:build`
  - 쉬운 한국어(코드 이름·파일 경로는 '만드는 사람에게' 절에만). 지금 `extension-erp/README.md`·`helper-erp/install/README.md`는 고치지 않는다(TASK-1·4의 git diff 시험)
- 차례: Phase 1 Step 2

## TASK-7: 실제 PC 확인 (사용자와 함께, 코드 작업 없음)
- REQ: REQ-3908
- AC: AC-3908.2
- Files: specs/erp-copy-list/notes/list-check.md
- Tests: (없음 — 사용자와 함께 보는 확인)
- TDD: exempt — 새 ERP 도우미(이번 Release 빌드 설치)와 새 dist를 이 PC 크롬에 붙이고 사용자가 고른 하루~사흘로: 숫자가 [비트 값 채우기]와 같음, 눌러 ERP 칸에 붙여 넣기(저장은 사용자가 정할 때만), 받은 엑셀이 엑셀 프로그램에서 열리고 숫자 칸, 지금 확장 [비트 값 채우기]도 새 도우미로 됨. 결과는 `notes/list-check.md`에 항목마다 '됨/안 됨'과 다른 점 글로만 적는다(의원의 실제 숫자·날짜별 값·화면 사진은 적지 않는다). 다르면 그 부분만 명세를 고쳐 다시 승인
- 차례: Phase 3

# 요구사항: ERP 마감일지 입력 목록(복사·엑셀, 자동 입력 없음)

> 기능 ID: `erp-copy-list` · 형식: 요구사항은 `### REQ-3901: 제목`, 수용 기준은 `- AC-3901.1: Given/When/Then`. 시험 이름에 AC ID를 넣는다.
> 승인된 시안: `docs/mockups/erp-copy-list/`(`index.html`·`notes.md`, 2026-11-24 사용자 "ㄴㄴ 승인해"). 화면 글은 시안 글자 그대로이고, 글이 어디서 오는지는 design.md 7절 표다.
> 예시의 오늘은 `2026-11-24`, 예시 기간은 시안과 같은 `2026-11-01`(일)~`2026-11-03`(화).

## 배경 / 목표
- 2026-11-24 사용자: 원장님은 병원마다 팀장이 ERP 마감일지 숫자를 ERP에 직접 넣기를 원한다. ERP에 저절로 넣는 일은 하지 않는다.
- 지금 확장 'ERP 마감일지 채우기'(`extension-erp/`, [비트 값 채우기]·[기간 채우기])는 우리 의원용으로 한 글자도 바꾸지 않는다.
- 만드는 것: 따로 된 새 크롬 확장 **'ERP 마감일지 입력 목록'**(`extension-erp-list/`). 화면은 'ERP 마감일지 입력 목록' 하나이고 확장 아이콘(또는 즐겨찾기)으로 연다.
  - ERP 사이트에 들어갈 길이 없다(내용 스크립트·사이트 권한 없음). ERP 화면을 건드리지 않는다.
  - 같은 ERP 도우미(`helper-erp/`, 네이티브 메시징)에 묻는다. 숫자는 지금 [비트 값 채우기]와 같은 셈이다(도우미 `closing.day` + 확장 `planCells` 그대로).
  - 흐름: 기간 → [목록 만들기] → 표(줄 = [비트 값 채우기]가 채우는 ERP 칸, ERP 화면 차례 / 열 = 날짜 하나씩) → 숫자 칸을 누르면 복사 → 팀장이 ERP 칸에 붙여 넣고 ERP에서 직접 저장. [엑셀로 받기]는 같은 표를 .xlsx로 받는다. [설정 열기]는 지금 설정 화면을 연다(병원마다 한 번 설정).
- 리드가 정함(2026-11-24, 시안 notes.md '정할 것'):
  - 업무일지 1 상자 차례는 ERP 화면 차례(진료 · 치료현황 → 외래 수입 → 입원수입 → 환자현황, `specs/erp-closing-fill/notes/erp-closing-fields.md` 2절). 업무일지 2는 지금 칸 계획 차례(둘이 같다).
  - 씨암·SONO 함께 있는 진료: 지금 확장과 같은 규칙·같은 저장 칸(설정 `overlap`). 고른 것이 없으면 지금 코드의 기본값(`planCells`에 고른 것 없음 = '둘 다 넣기'와 같은 값)이고 그것을 한 줄로 알린다.
  - 설정을 한 번도 저장하지 않았으면 지금 확장처럼 설정 화면을 열고 '처음 한 번' 글을 보인다.
  - 경고 줄은 지금 하루 채우기와 같은 줄(`warningLines`)을 표 위에 보인다.
  - 진료 0건인 날은 0으로 두고 흐리게 보이며 복사는 된다.
  - 기간 길이는 [기간 채우기]와 같다: 제한 없음(spec erp-closing-range design.md 12절, 사용자 "제한 없음").
  - 엑셀 모양은 Claude가 정함(design.md 5절): 화면 표와 같은 줄·열 + 끝 열 '빈 칸 까닭'.
- ERP 도우미 하나가 두 확장을 받는다. 지금 확장은 새 도우미로도 그대로 돈다.

## 요구사항

### REQ-3901: 새 확장의 틀 — ERP 사이트에 못 들어가는 권한, 고정 ID, 목록 화면 여는 길, 화면 글 한 곳
- AC-3901.1: Given `extension-erp-list/manifest.json`, Then 맨 위 칸은 정확히 `manifest_version`·`name`·`version`·`description`·`permissions`·`background`·`action`·`options_page`·`key` 아홉 개다.
  - `manifest_version` 3, `name` 'ERP 마감일지 입력 목록', `version` '0.1.0', `description`은 빈 글이 아니다.
  - `permissions`는 정확히 `["nativeMessaging", "storage"]`다.
  - `content_scripts`·`host_permissions`·`optional_permissions`·`optional_host_permissions`·`web_accessible_resources`·`externally_connectable`·`content_security_policy`가 없다. 그래서 ERP 사이트(어느 사이트든)에 스크립트를 넣거나 화면을 읽을 길이 없다.
  - `background` = `{ "service_worker": "extension-erp-list/src/background.js", "type": "module" }`, `options_page` = `"options.html"`, `action` = `{ "default_title": "ERP 마감일지 입력 목록" }`(`default_popup` 없음).
- AC-3901.2: Given manifest `key`, Then RSA 2048 공개키(SPKI DER, base64, 다시 내보내도 같은 글자)다.
  - 그 key로 계산한 확장 ID(크롬 규칙: SHA-256 앞 16바이트 → 0-f를 a-p로)는 32자 a~p다.
  - 지금 확장 ID(`helper-erp/commands.json` `extensionId`)·청구 확장 ID(`extension/manifest.json` key로 계산)와 다르다.
  - 개인키는 저장소에 없다: `extension-erp-list/` 아래에 `.pem` 파일과 'PRIVATE KEY' 글자가 없고, 루트 `.gitignore`의 `*.pem` 줄은 그대로다.
- AC-3901.3: Given 새 서비스 워커 `extension-erp-list/src/background.ts`, Then 아래와 같다.
  - 지금 확장의 도우미 통로 `extension-erp/src/background.ts`를 고치지 않고 불러(import) 그대로 켠다. 그래서 같은 확장이 보낸 `{ cmd: closing.codes | closing.day | closing.findCodes, args }`와 `{ open: 'options' }`만 받고, 답 모양·120초·오류 번호가 지금과 같다.
  - When 확장 아이콘을 누르면, Then `chrome.tabs.create({ url: chrome.runtime.getURL('list.html') })`로 목록 화면을 새 탭에 연다(`tabs` 권한 없이).
  - 목록 화면 주소 `chrome-extension://<ID>/list.html`은 ID가 고정이라 즐겨찾기로도 열린다.
- AC-3901.4: Given `extension-erp-list/src/*.ts`(시험 파일 빼고), Then 아래와 같다.
  - `fetch`·`XMLHttpRequest`·`WebSocket`·`EventSource`·`importScripts`·`sendBeacon`·`console`·`localStorage`·`sessionStorage`·`indexedDB`가 없다. ESLint의 ERP 확장 규칙(지금 `extension-erp/src/**`에 걸린 것)이 `extension-erp-list/src/**`에도 걸린다.
  - 새 코드에 `chrome.storage`가 없다(설정은 지금 `settings.js`의 `load`로만 읽는다).
  - import는 같은 폴더 `./<이름>.js`와 design.md 2절 표의 `../../extension-erp/src/<이름>.js`(표의 이름만)뿐이다. 패키지 이름 import(`'xlsx'` 등)·다른 경로·동적 `import()`가 없다.
  - `extension-erp/src`에서 불러오는 것은 design.md 2절 표의 모듈·이름뿐이다. ERP 화면을 다루는 부품(`fill.js`·`erpday.js`·`range.js`의 `scanRange`·`runRange`·`panel.js`의 `createDock`·`main.js`의 `startPage`)은 부르지 않는다.
- AC-3901.5: Given 설정 연결, Then 아래가 있다.
  - vitest `include`에 `extension-erp-list/**/*.test.ts`(주석 줄에도 같은 이름). 그 목록을 글자 그대로 묶어 둔 지금 시험 `src/b2b-merge.test.ts`(AC-034.5)는 기대 목록에 이 한 줄만 더한다(까닭: 이 명세, 앞선 예 spec erp-closing-fill cab85424)
  - 루트 `tsconfig.json` `exclude`에 `extension-erp-list`
  - ESLint `ignores`에 `extension-erp-list/dist/`, `.gitignore`에 `extension-erp-list/dist/`
  - `extension-erp-list/tsconfig.json`(design.md 1절)으로 `tsc -p extension-erp-list/tsconfig.json --noEmit`이 통과한다.
- AC-3901.6: Given 이 기능의 바뀐 곳, Then 지금 확장·청구 쪽·웹앱은 한 글자도 바뀌지 않는다(기준 = 이 갈래의 시안 커밋 `ec536578`).
  - `git diff --name-only ec536578 -- extension-erp extension helper src`가 `src/b2b-merge.test.ts` 하나뿐이고(또는 비어 있고), 그 파일의 차이는 더한 줄 `'extension-erp-list/**/*.test.ts',` 하나뿐이다(뺀 줄 없음). 웹앱 코드는 바뀌지 않는다.
  - 그래서 `src`도 갈래 시작 그대로인지 보는 지금 시험(spec erp-bit-anywhere AC-3801.4 `git diff --quiet 6754571c -- helper src extension`)은 그 한 파일만 빼고 본다(`':(exclude)src/b2b-merge.test.ts'`, 까닭: 이 명세). 나머지 `helper`·`src`·`extension`은 그대로 본다.
  - 지금 확장 시험(`extension-erp/src/*.test.ts`)은 기대값을 하나도 바꾸지 않고 통과한다.
- AC-3901.7: Given 화면 글, Then 새로 쓴 글은 `extension-erp-list/src/listTypes.ts`의 `LIST_TEXT`·`WHY_TEXT` 한 곳에 있고 승인 시안(`index.html`·`notes.md`) 글자와 똑같다. 지금 있는 글(오류 글·'비트에서 읽는 중…'·기간 막는 글 등, design.md 7절 표)은 그 모듈의 상수를 그대로 쓰고 글자를 다시 적지 않는다.
  - 예외: `list.html`의 고정 글(탭 제목·머리·[설정 열기]·'시작일'·'끝일'·[목록 만들기]·[엑셀로 받기]·'오늘 뒤 날짜는 고를 수 없어요.'·맨 아래 줄)은 스크립트가 돌기 전에도 보이도록 HTML에 복사해 둔다. 시험이 그 글이 상수(design.md 7절)와 글자 그대로 같은지 본다.
  - 시안과 같은지는 시안 `index.html`을 jsdom으로 그려 견준다(design.md 7절 끝 '시안 맞춤 시험'). `notes.md`의 `{…}` 꼴 글과는 견주지 않는다.

### REQ-3902: ERP 도우미 하나가 두 확장을 받는다
- 배경: 지금 ERP 도우미는 기존 `MessageLoop`·`OriginGuard`(`helper/`, 고치지 않음)로 명령 표(`helper-erp/commands.json`)의 확장 ID 하나만 받는다. 등록 틀(`helper-erp/install/host-manifest.json`)의 `allowed_origins`도 그 하나다. 명령 표는 기존 `CommandTable.Parse`가 맨 위 칸 여섯 개만 받으므로 ID를 더 넣을 수 없다.
- AC-3902.1: Given `ErpCallers.ForMessageLoop(args, table)`(`helper-erp/src/Erp.Core/ErpCallers.cs`), Then 아래와 같다.
  - 첫 인자가 목록 확장 origin(`chrome-extension://` + `ErpCallers.ListExtensionId` + `/`, 글자 그대로)이면 첫 인자만 명령 표 확장 origin(`chrome-extension://` + `table.ExtensionId` + `/`)으로 바꾼 새 배열을 돌려준다. 뒤 인자(`--parent-window=0` 등)는 그대로이고 받은 배열은 고치지 않는다.
  - 그 밖(명령 표 확장·청구 확장·모르는 ID·대문자로 바꾼 목록 origin·끝 `/` 없는 목록 origin·빈 글자·인자 없음·`--register`)은 받은 배열을 그대로 돌려준다.
- AC-3902.2: Given ERP 도우미처럼 ERP 명령 표 → `Dispatcher` → `ClosingCommands.Register` → `MessageLoop.Run(ErpCallers.ForMessageLoop(args, table), …)`, Then 아래와 같다.
  - 목록 확장이 켜면 지금 확장과 똑같이 답한다: `closing.codes`·`closing.day`는 result, `hello`·`claim.month`·`revenue.days`는 E-HELPER-UNKNOWN-COMMAND로 답하고 계속, 입력이 닫히면 0으로 끝난다.
  - 다른 origin(청구 확장·모르는 ID·대문자·끝 `/` 없음·인자 없음)은 지금처럼 입력을 하나도 읽지 않고 기록 하나(E-BRIDGE-REJECTED)만 남기고 `ExitRejected`로 끝나며 비트를 열지 않는다.
  - 지금 확장 origin의 기존 시험은 그대로 통과한다.
- AC-3902.3: Given `ErpCallers.ListExtensionId`, Then `extension-erp-list/manifest.json` key로 계산한 ID와 같고, 명령 표 `extensionId`·청구 확장 ID와 다르다.
- AC-3902.4: Given `helper-erp`, Then 아래와 같다.
  - `Program.cs`는 메시지 고리 줄만 `return MessageLoop.Run(ErpCallers.ForMessageLoop(args, table), input, output, table, dispatcher, log.Write);`로 바뀐다. 등록 모드(`--register`)·차례·기록은 그대로다.
  - `install/host-manifest.json`의 `allowed_origins`는 정확히 `["chrome-extension://<지금 확장 ID>/", "chrome-extension://<목록 확장 ID>/"]`이고 `*`가 없다. 다른 칸은 그대로다.
  - `commands.json`·`Directory.Build.props`·`install/install.ps1`·`install/install.cmd`·`install/uninstall.ps1`·`install/README.md`는 `ec536578` 그대로다(`install.ps1`은 틀을 복사해 `path`만 채우므로 고칠 것이 없다).
- AC-3902.5: Given 판 번호, Then ERP 도우미는 0.3.0 그대로, 지금 확장도 0.3.0 그대로(짝 문장 '확장 0.3.0 ↔ ERP 도우미 0.3.0'과 그 시험 그대로), 새 확장은 0.1.0이다.
  - 이 기능 전에 받은 ERP 도우미 설치 파일은 목록 확장을 허락하지 않는다. 그때 크롬이 '허락 안 됨'(forbidden)으로 끊어, 목록 화면에는 지금 통로 규칙대로 E-HELPER-MISSING 글이 나온다. 이번 설치 파일로 다시 설치하면 된다(안내서 REQ-3908).

### REQ-3903: 기간을 고르고 [목록 만들기]
- AC-3903.1: Given 목록 화면을 처음 열 때, Then 아래가 보인다(시안 ① 그대로).
  - 머리 'ERP 마감일지 입력 목록'과 오른쪽 [설정 열기]
  - 시작일·끝일 날짜 칸(처음 값 둘 다 오늘, `max` = 오늘), [목록 만들기], [엑셀로 받기](`disabled`)
  - 그 아래 줄 '오늘 뒤 날짜는 고를 수 없어요.', 파란 안내 세 줄, 맨 아래 작은 줄
  - 오늘은 이 PC 날짜다(지금 `localToday`).
- AC-3903.2: When [목록 만들기], Then 지금 기간 막는 규칙(`pickProblem`: 빈 칸 → '시작일과 끝일을 골라 주세요.' · 시작일 > 끝일 → '시작일이 끝일보다 뒤예요.' · 끝일 > 오늘 → '오늘 뒤 날짜는 고를 수 없어요.', 이 차례로 첫 하나)에 걸리면 날짜 칸 아래 줄이 그 글(빨강, `help why`)로 바뀌고 도우미에 묻지 않는다. 기간 길이는 막지 않는다(400일도 시작한다).
- AC-3903.3: Given 설정을 한 번도 저장하지 않았을 때(지금 `load()`가 null), When [목록 만들기], Then 설정 화면을 새 탭으로 열고(`chrome.runtime.openOptionsPage()`) 안내 '처음 한 번 설정 화면에서 코드를 확인하고 [저장]을 눌러 주세요.'와 '설정 화면을 새 탭으로 열었어요.'만 보이며 도우미에 묻지 않는다. 설정 읽기가 실패하면(던짐) E-BRIDGE-DISCONNECTED 오류 안내(AC-3903.6 모양)다.
- AC-3903.4: Given 맞는 기간과 저장한 설정, Then 기간 안 날(지금 `rangeDays`)을 옛날부터 하나씩, 앞 답을 받은 뒤에 다음 날을 서비스 워커에 묻는다: `chrome.runtime.sendMessage({ cmd: 'closing.day', args: { date, groups: toGroups(settings) } })`(지금 [비트 값 채우기]와 같은 모양).
  - 120초(지금 `READ_TIMEOUT_MS`) 안에 답이 없으면 E-HELPER-TIMEOUT, `sendMessage`가 던지면 E-BRIDGE-DISCONNECTED, `{ type: 'error', code }`면 그 번호(번호 모양이 아니면 E-BRIDGE-BAD-REPLY)다.
  - `{ type: 'result', data }`는 지금 `readDay(data, date)`로 검사하고, 부른 날짜의 답이 아니거나 모양이 틀리면 E-BRIDGE-BAD-REPLY다.
  - 도는 동안 시안 ② 안내('비트에서 읽는 중…' · '{N}일 중 {k}일' · 진행 막대 · [그만두기])가 보이고, 날짜 칸 둘·[목록 만들기]·[엑셀로 받기]는 `disabled`다. k는 답을 받은 날 수다.
- AC-3903.5: When [그만두기], Then 더 묻지 않고 처음 안내(시안 ①)로 돌아가며 막힌 칸·단추가 풀린다([엑셀로 받기]는 막힌 그대로). 그때 오던 답은 버린다(나중에 와도 화면이 바뀌지 않는다).
- AC-3903.6: Given 어느 날이든 오류가 나면, Then 다음 날로 가지 않고 멈춘다. 시안 ⑤ 안내만 보이고 표는 없다.
  - 굵은 빨강 줄 = 오류 '무엇이', 다음 줄 = '어떻게'(지금 `errors.ts`의 `explain`), 작은 줄 '목록을 만들지 못했어요. (번호 {번호})'
  - [엑셀로 받기]는 막히고, [목록 만들기]로 다시 할 수 있다.
- AC-3903.7: Given 모든 날을 받았을 때, Then 표(REQ-3904)를 그리고 [엑셀로 받기]가 열린다.
  - 도우미 답·표·복사 표시는 이 화면 기억에만 두고 어디에도 쓰지 않는다(`chrome.storage`에 쓰지 않음). 새로고침하면 처음 안내다.
  - 화면에는 숫자·날짜·칸 이름만 보이고 환자 정보는 없다. 글은 모두 textContent로 넣는다(기타 줄 이름에 `<b>`가 들어도 글자로 보인다).

### REQ-3904: 표 — 줄 차례·이름·숫자·빈 칸 까닭·진료 0건·경고 줄·씨암·SONO
- AC-3904.1: Given 날마다 받은 답, Then 날마다 칸 계획은 지금 `planCells(day, settings, choice)`(choice는 AC-3904.6)이고 숫자 줄은 그 칸 하나에 하나씩이다. 차례는 아래와 같다(시안 '줄' 절).
  - '업무일지 1' 아래 진료 · 치료현황(10) → 외래 수입(12) → 입원수입(4) → 환자현황(6). 상자 안 차례는 `planCells` 차례다.
  - '업무일지 2' 아래 예약(25) → 치료별 신환/90일초진/재진 건수(27) → 연령별 신환/90일초진/재진(30) → 운영 지표(7) → 치료별 매출(10, 머리 옆 작은 글 '금액(원)'). 안 차례는 `planCells` 차례다.
  - 업무일지·상자 머리 줄에는 숫자 칸이 없다.
  - 줄 이름은 `planCells` 칸의 줄 글자다(기타 줄은 설정의 ERP 줄 이름, 이름이 비면 '기타N'). 열이 여럿인 표(예약·치료별 건수·연령별)는 줄 이름 뒤에 열 이름(흐린 글)을 붙인다. 예약 '실예약환자수'와 치료별 매출 줄은 열 이름을 붙이지 않는다.
  - 처음 값 설정이면 날마다 131칸(업무일지 1 32 + 업무일지 2 99)이다.
- AC-3904.2: Then 열은 날짜 하나씩(옛날부터)이다.
  - 머리는 '{M/D} ({요일 한 글자})'(예: '11/2 (월)')이고 일요일은 요일 글이 주황이다.
  - 숫자 칸 글은 `planCells` 값 그대로다(쉼표 없음, 예: 350000).
- AC-3904.3: Given 값 없는 칸(`planCells`의 `why`), Then 칸은 비우고 까닭을 붙인다.
  - 그 줄이 모든 날 같은 까닭이면 줄 이름 오른쪽 꼬리표('코드를 고르지 않음' · '비트로 셀 수 없음' · '보류 중' · 'ERP 줄 이름 없음')이고 칸은 회색 빈 칸이다.
  - 어떤 날만 비면 그 칸 안에 작은 글(예: '셀 수 없음')이다.
  - 꼬리표·작은 글에 마우스를 올리면 긴 글(design.md 7절)이 보인다.
  - 표 아래 '빈 칸 까닭' 상자에 이 목록에 나온 까닭만 unpicked → unknown → held → noName 차례로 꼬리표 + 긴 글이 있다.
- AC-3904.4: Given 진료 0건인 날(`patients.total` = 0), Then 그 열도 있다.
  - 머리에 '진료 0건' 작은 줄이 있고, 머리에 마우스를 올리면 '{YYYY-MM-DD}에는 비트 진료가 한 건도 없어요.'
  - 숫자는 흐리게 보이고 누르면 복사된다(0도 그대로).
- AC-3904.5: Given 지금 경고 줄(`warningLines(day)`: 환불·변경수납 · 청구액·비급여 나눔 · 수납이 끝나지 않은 진료 · 환불 금액 · 생년월일 없는 환자 · 주사1회환자 예전 자료 · 입원 접수), Then 목록 위 줄과 표 사이의 경고 상자에 '{M/D}: {경고 글}'이 한 줄씩 있다.
  - 차례는 날짜 차례, 한 날 안에서는 `warningLines` 차례다.
  - 경고가 없으면 상자가 없다. 상자가 길면 상자 안에서 밀린다.
- AC-3904.6: Given 씨암·SONO 함께 있는 진료, Then 날마다 지금 조건 `overlapAsks(day.overlap, settings)`로 본다.
  - 묻는 날(그날 돈이 두 번 셈)이면 choice = 설정의 지난번 고른 것(`settings.overlap`)이고, 없으면 고른 것 없음(지금 `planCells` 기본값 = '둘 다 넣기'와 같은 값: 씨암 매출 = carm.total, SONO 매출 = sono.total)이다.
  - 묻지 않는 날은 고른 것 없음이다(지난번 고른 것을 쓰지 않는다, spec erp-closing-range REQ-3710·REQ-3711 그대로).
  - 묻는 날이 하루라도 있으면 '빈 칸 까닭' 상자 끝에 한 줄이 있다. 지난번 고른 것이 있으면 '씨암·SONO를 같이 받은 진료는 지난번 고른 대로 {씨암에|SONO에|씨암·SONO 둘 다에} 넣어요.', 없으면 '함께 있는 진료 {K}건은 씨암·SONO 둘 다에 넣었어요.'(K = 묻는 날들의 `overlap.visits` 합)다. 빈 칸 까닭이 없으면 상자에 제목·목록 없이 이 줄만 있다. 묻는 날이 없으면 이 줄이 없다.
  - 목록 화면은 묻지 않고, 고른 것을 저장하지 않는다(`saveOverlap`을 부르지 않는다).
- AC-3904.7: Then 표 위와 표 상자는 시안 ③ 그대로다.
  - '{시작일} ~ {끝일} · {N}일 · 날마다 {R}칸'(시작일 ~ 끝일은 굵게, R = 숫자 줄 수), 그 아래 작은 줄 '숫자 칸을 누르면 복사돼요. ERP 칸에 붙여 넣어 주세요. 빈 칸은 아래 까닭을 보고 직접 넣어 주세요.', 오른쪽 '목록을 만든 때 {YYYY-MM-DD HH:MM}'(이 PC 시각)
  - 표가 상자보다 넓을 때만 '표를 옆으로 밀면 다른 날짜가 보여요. 항목 칸은 왼쪽에 그대로 있어요.'
  - 표 상자는 화면 높이에 맞고 안에서 위아래·옆으로 밀리며 날짜 줄·항목 칸은 붙어 있다. PC 화면만 만든다(폰 모양 없음).

### REQ-3905: 숫자 칸을 누르면 복사
- AC-3905.1: When 숫자 칸을 누르면, Then 그 값 글자 그대로를 클립보드에 넣는다(`navigator.clipboard.writeText`, 실패하면 숨긴 글 칸 + `document.execCommand('copy')`).
  - 쪽지 '복사했어요' + '{M/D} · {묶음} {줄}[ {열}] · {값}'이 1.8초 보인다. 묶음은 짧은 이름(치료현황 · 외래 수입 · 입원수입 · 환자현황 · 예약 · 치료별 건수 · 연령별 · 운영 지표 · 치료별 매출)이다. 꼴은 시안 ④(복사한 뒤) 쪽지 '11/2 · 치료현황 도수상담 · 4'와 같고, 열이 있는 줄은 시안 칸 '11/2 · 치료별 건수 씨암(주사) 신환 · 4'와 같은 꼴이다. 값은 그날 비트 숫자다.
- AC-3905.2: Then 방금 누른 칸은 파란 테두리, 그 전에 복사한 칸은 초록 ✓다. 이 표시는 이 화면 기억에만 있고 목록을 다시 만들면 지운다.
- AC-3905.3: Given 두 방법이 다 실패하면, Then 쪽지 '복사하지 못했어요. 다시 눌러 주세요.'(! 표시)이고 칸 표시는 바뀌지 않는다.
- AC-3905.4: Then 빈 칸·줄 이름·머리는 누르는 단추가 아니다. 숫자 칸은 마우스를 올리면 '누르면 복사돼요'가 보인다.

### REQ-3906: [엑셀로 받기]
- AC-3906.1: Given 표가 보일 때만, Then [엑셀로 받기]가 열려 있다(처음·세는 중·오류·처음 한 번 안내 때는 막힘). When 누르면, Then 아래와 같다.
  - 지금 보이는 표를 .xlsx로 만든다(날짜 칸을 그 뒤에 바꿨어도 그 표의 기간).
  - Blob + `<a download>`로 받는다(크롬 기본 다운로드 폴더, `downloads` 권한 없음). 만든 주소는 `a.click()` 뒤 한 박자 미뤄(`setTimeout(…, 0)`) 지운다(`URL.revokeObjectURL`, 바로 지우면 받기가 끊길 수 있음).
  - 파일 이름은 'ERP마감일지_입력목록_{시작일}_{끝일}.xlsx'(예: `ERP마감일지_입력목록_2026-11-01_2026-11-03.xlsx`)이고 쪽지는 '엑셀 파일을 받았어요' + 그 이름이다.
- AC-3906.2: Given 받은 파일, Then 시트 하나('ERP 마감일지 입력 목록')에 화면 표와 같은 줄·열이 있다.
  - 1행: A '항목', 날짜마다 '{M/D} ({요일})'(진료 0건이면 뒤에 ' 진료 0건'), 끝 열 '빈 칸 까닭'
  - 업무일지·상자 머리 줄은 A칸만 있다(치료별 매출 머리는 '치료별 매출 금액(원)').
  - 숫자 줄: A = 줄 이름(+ ' ' + 열 이름, 화면과 같은 규칙), 날짜 칸 = 숫자 칸(글자 칸 아님, 천 단위 서식 없음), 값 없는 칸은 빈 칸, 끝 열 = 그 줄의 까닭(모든 날 같으면 꼬리표 글, 어떤 날만이면 '{꼬리표 글} ({M/D} · …)', 까닭이 둘 이상이면 ', '로 잇고, 없으면 빈 칸)
  - 1행·A열은 틀 고정이다.
  - 경고 줄·씨암·SONO 줄·만든 때는 넣지 않는다(화면에만 있다).
- AC-3906.3: Given 만든 바이트, Then 저장소의 `xlsx` 0.20.3으로 다시 읽으면 시트 이름·모든 칸의 값과 종류(숫자 n · 글 s)·빈 칸이 AC-3906.2와 같다.
  - 압축은 저장만 하는 zip이고 CRC-32가 맞다(`123456789` → `CBF43926`).
  - 줄 이름에 `&<>"'`가 들어도 파일이 깨지지 않고 글자 그대로 읽힌다.
- AC-3906.4: Then 파일에는 화면에 보인 날짜별 집계 숫자·칸 이름·까닭만 있고 환자를 가리키는 값은 없다. 만드는 동안 네트워크를 쓰지 않는다(AC-3901.4).

### REQ-3907: 설정 화면과 빌드
- AC-3907.1: When 머리 오른쪽 [설정 열기], Then `chrome.runtime.openOptionsPage()`로 설정 화면을 새 탭으로 열고 쪽지 '설정 화면을 새 탭으로 열었어요.'가 보인다.
  - 설정 화면은 지금 확장 설정 화면 그대로다(`extension-erp/options.html`·`options.ts`, 글·모양·코드 찾기 그대로).
  - 이 확장의 `chrome.storage.local` `erpClosing` 칸에 저장한다. 지금 확장 설정과 따로라 병원마다 이 확장에서 한 번 설정한다.
- AC-3907.2: Given `npm run ext-erp-list:build`(`node scripts/build-erp-list.mjs`), Then 아래 차례로 만든다.
  - `extension-erp-list/dist/`를 지운다 → `tsc -p extension-erp-list/tsconfig.json` → `manifest.json`·`list.html`을 dist로 복사한다.
  - `extension-erp/options.html`을 읽어 script 줄 `<script type="module" src="options.js"></script>`만 `src="extension-erp/src/options.js"`로 바꿔 dist `options.html`로 쓴다. 그 줄이 정확히 하나가 아니면 실패한다.
  - 끝에 manifest 서비스 워커·`list.html` script·`options.html` script가 가리키는 파일이 dist에 다 있는지 보고, 하나라도 없으면 실패한다.
- AC-3907.3: Given 만든 dist, Then `manifest.json`·`list.html`·`options.html`, `extension-erp-list/src/*.js`(시험 빼고), 새 코드와 설정 화면(`options.js`)이 부르는 `extension-erp/src/*.js`(design.md 1절 목록 14개)만 있다. `extension-erp/src/content.js`·시험 파일·`.map`은 없다. 지금 확장 빌드(`npm run ext-erp:build`)와 그 결과는 그대로다.

### REQ-3908: 안내서와 실제 확인
- AC-3908.1: Given `extension-erp-list/README.md`(쉬운 한국어), Then 아래 절이 있다.
  - 머리: 이 확장이 하는 일·하지 않는 일(ERP 사이트를 건드리지 않음, 저장은 ERP에서 직접, 환자 이름·차트번호는 이 PC 밖으로 나가지 않음), 지금 확장 'ERP 마감일지 채우기'와 같이 깔아도 됨
  - 1. ERP 도우미 설치: [ERP 도우미 설치 안내](../helper-erp/install/README.md)로 잇고, 2026-11-24 이후 받은 ERP 도우미 설치 파일이어야 한다(이미 깔았어도 다시 설치)
  - 2. 크롬에 붙이기: 압축 풀기 → `chrome://extensions` → 개발자 모드 → '압축해제된 확장 프로그램을 로드합니다'
  - 3. 목록 화면 여는 법: 퍼즐 모양 단추에서 고정 → 아이콘 누르기, 열린 주소를 즐겨찾기
  - 4. 처음 한 번 설정: [설정 열기] → 코드 확인 → [저장]. 자세한 것은 [ERP 마감일지 채우기 안내](../extension-erp/README.md) '4. 다른 의원 첫 설정'과 같다고 잇는다
  - 5. 날마다 쓰는 법: 기간 → [목록 만들기] → 숫자 누르기 → ERP 칸에 붙여 넣기(Ctrl+V) → ERP에서 저장. [엑셀로 받기] → 크롬 다운로드 폴더
  - 6. 빈 칸 까닭 네 가지(꼬리표 글·긴 글이 화면과 같다), 진료 0건인 날, 경고 줄, 씨암·SONO 줄
  - 7. 안내 글과 할 일: 오류 글 몇 개(`errors.ts` 글 그대로)와 '도우미를 깔았는데도 "ERP 도우미가 이 PC에 없어요."가 나오면 이번 ERP 도우미 설치 파일로 다시 설치'
  - 8. 새 판으로 바꾸기·지우기, 만드는 사람에게(빌드 명령·dist 모양·짝 판 '입력 목록 확장 0.1.0 ↔ ERP 도우미 0.3.0(2026-11-24 이후 설치 파일)')
- AC-3908.2: (사용자와 함께, 시험 아님) Given 새 ERP 도우미와 새 확장을 이 PC 크롬에 붙였을 때, When 사용자가 고른 하루~사흘로 목록을 만들면, Then 아래를 본다. 결과는 `specs/erp-copy-list/notes/list-check.md`에 항목마다 '됨/안 됨'과 다른 점 글로만 적는다(의원의 실제 숫자·날짜별 값·화면 사진은 적지 않는다).
  - 숫자가 같은 날 지금 [비트 값 채우기]가 채우는 값과 같다.
  - 숫자를 눌러 ERP 칸에 붙여 넣어진다(ERP에서 저장은 사용자가 정할 때만).
  - 받은 엑셀이 엑셀 프로그램에서 열리고 숫자가 숫자 칸이다.
  - 지금 확장 [비트 값 채우기]도 새 도우미로 그대로 된다.

## 범위 밖
- ERP 화면에 넣기·저장 누르기(지금 확장의 일이고 그대로 둔다)
- 지금 확장(`extension-erp/`)·청구 확장(`extension/`)·청구 도우미(`helper/`)·웹앱(`src/`) 고치기, 웹앱 배포
- 목록 화면에서 씨암·SONO 넣을 곳 묻기, 달 고르기 같은 다른 기간 고르기, 기간 길이 제한, 지난 목록 기억
- 폰 모양(PC 화면만, 사용자 규칙)
- 목록·엑셀을 서버·클라우드로 보내기
- 웹스토어 등록, 설치 파일(zip) 만들기와 다른 병원에 보내기(사용자가 말할 때)
- ERP 도우미 판 번호 올리기(design.md '결정과 트레이드오프' 8)

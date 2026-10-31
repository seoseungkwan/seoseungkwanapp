# 요구사항: 청구 사전점검 (양지바른 사전점검 가져오기)

> 기능 ID: `precheck` · 형식: 요구사항은 `### REQ-001: 제목`, 수용 기준은 `- AC-001.1: Given/When/Then`.
> 각 AC는 시험 하나 이상으로 검증하고, 시험 이름에 AC ID를 넣는다. REQ 번호 = TASK 번호 = `docs/precheck/plan.md` §6의 Phase 1~7 Step 순서다. 예외 둘: ① REQ-005의 후속 TASK-33은 Phase 1 Step 5 `helper-fixups`로 TASK-5 뒤·TASK-6 앞에 하고, 그래서 REQ-006은 Phase 1 Step 6이다(plan.md §6에는 아직 없다). ② REQ-034(TASK-34, b2b 개편 합치기 맞춤)는 plan.md §6의 Step이 아니고 Phase 1 끝·Phase 2 앞에 한다. REQ-033은 없다(TASK-33은 REQ-005 몫).

## 배경 / 목표
- 무엇을·왜: `docs/precheck/PRD.md`. 어떻게·순서: `docs/precheck/plan.md`. 결정 기록: ADR-016·ADR-020~022 (b2b 개편 합치기 뒤 번호. 청구의 옛 ADR-017·018·019가 ADR-020·021·022가 된다. b2b가 ADR-017~019를 먼저 썼다, REQ-034)
- 2026-10-31: 앱 전체 B2B 디자인 개편(`specs/b2b-redesign`)이 이 기능(PR #7)보다 먼저 main에 들어갔다(합치기 커밋 `359a4a4`, PR #11. main에는 auth-live PR #9·landing-v2 PR #10도 있다). 그래서 `origin/main`을 이 브랜치에 합치고 청구 화면·설정·문서를 b2b 규칙에 맞춘다(REQ-034). 기능·동작·자료 길은 바뀌지 않는다. 탭 순서·이름은 지금 그대로다(탭 다시 짜기는 따로 `tab-frame` 명세가 한다)
- 2026-10-30 사용자 결정(다시 묻지 않는다)
  - **혼자 돈다**: 우리 크롬 확장(웹스토어 비공개)과 크롬이 켜는 윈도우 도우미(C#/.NET). 열린 포트·로컬 네트워크 허용 창·토큰이 없다. 양지바른은 켜지도 설치하지도 않고 설정도 맞추지 않는다
  - **환자 자료는 PC에만**: 확장 → 통로 코드 → Worker, 화면은 메모리에만. 고치던 메모·완료 표시는 도우미가 그 PC에 암호화해 둔다. 두 번 입력은 비트에 이미 있는 메모와 비교해 막는다. 12개월 이력·F/U 명단은 그때그때 비트에서 계산한다
  - **서버에는 건수와 설정만**: 건수(날짜별 메모 입력 현황·월말 마감 남은 일·연락 남은 건수, 각각 마지막 바뀐 시각). DB는 건수 표에 숫자만 받는다. 설정(규칙 켜기·끄기와 등급·병원 문구·문자 문구)은 서버가 원본이다. **새 서버 경로 없음**. 표는 RLS + 권한 먼저 회수
  - **가져오는 것**: 삭감 예방 사전점검(규칙 262개), 청구메모 문장, 추천 상병·상병 확인, SAM 대조·월말 마감, 비트 자동 입력, 처방 추세, 30일 재방문, 처방별 신환·재진, 보고 문장 복사, F/U·정기 주사 문자 명단과 문자 문구(복사만), [백업 내려받기]에 설정
  - 총괄 한 사람이 쓴다. 청구메모는 며칠에 한 번 묶어서 하고, 화면은 아직 입력 안 된 날짜를 먼저 보인다. 규칙은 우리 앱에서만 고친다. 통계는 도우미가 자료를 주고 지금 파일 올리기는 예비로 남긴다
  - 입력은 묶음마다 PC 확인 창의 [확인]을 거친다. 비트 화면이 바뀐 것이 보이면 입력을 멈춘다
- Claude 판단으로 넣는 것: 통로 코드 울타리와 시험, CSP는 바꾸지 않고 확장 ID는 코드 상수 하나, 청구 화면에 오류 수집 도구 없음, 멈춘 뒤 다시 열면 비트와 비교해 이어서, 일부만 온 자료면 멈춤, 달을 넘기는 묶음 허용, 진료 없는 날 숨김, 창 하나만, "설정이 바뀌었어요" 띠, 웹·확장·도우미 버전 맞추기, 1MB씩 나눠 보내기, 규칙·약 표는 그때 불러오기, 골든 테스트, GitHub Actions 윈도우 빌드(서명 없음)
- 화면 AC는 내용(보이는 것·단추·상태)만 정한다. 배치·문구는 **Phase 0 목업(승인본)**을, 모양은 `docs/UI_GUIDE.md`(b2b 개편 뒤: '공통 모양'(`components/ui/classes.ts`의 `ds`)·'앱 틀'·'관리자')를 따른다
- 원본: GitHub `seoseungkwan/shared` main `YangjiBareun_사전점검/` 커밋 `2a1069b`. 옮기는 파일과 함수 이름은 design.md 2절

## 요구사항

### REQ-001: 도우미 메시지 틀 (Phase 1 · Step 0 · helper-skeleton)
- AC-001.1: Given 앞 4바이트(리틀 엔디언) 길이 + UTF-8 JSON 메시지, When 도우미가 표준 입력에서 읽으면, Then 봉투 `{v, id, cmd, args}`로 푼다. 길이가 0이거나 JSON·봉투 모양이 틀리면 `E-HELPER-BAD-MESSAGE`로 답하고 다음 메시지를 기다린다(끝나지 않는다). 길이가 64MiB를 넘으면 본문을 읽지 않고 바로 끝난다(크롬은 그런 길이를 보내지 않으므로 틀이 깨진 것이고, 다음 메시지 자리를 찾을 수 없다). 표준 입력이 닫히면 끝난다(`bit.input` 중이면 AC-017.9)
- AC-001.2: Given 명령 표 `src/lib/bridge/commands.json`, When 표에 없는 `cmd`이거나 `args`에 모르는 칸·틀린 종류·범위 밖 값이 있으면, Then 아무 일도 하지 않고 `E-HELPER-UNKNOWN-COMMAND`(명령) 또는 `E-HELPER-BAD-MESSAGE`(칸)로 답한다. 도우미의 명령 표는 그 JSON과 같다(시험이 비교). 웹이 환자 글자를 보내는 명령(`store.save`·`bit.input`)은 `args`가 `{payload: 글자}` 하나이고, 도우미는 `payload`를 JSON으로 푼 뒤 표에 적힌 안쪽 모양으로 같은 검사를 한다(풀지 못하거나 틀리면 `E-HELPER-BAD-MESSAGE`)
- AC-001.3: Given 크롬이 넘긴 호출 origin 인자, When `chrome-extension://<EXTENSION_ID>/`가 아니면, Then 메시지를 하나도 처리하지 않고 끝난다
- AC-001.4: Given `hello`, When 부르면, Then `result {helperVersion, protocol}`을 돌려준다. `helperVersion`은 `Directory.Build.props`의 `Version`, `protocol`은 `commands.json`의 `protocol`(처음 1)이다
- AC-001.5: Given 환자 자료 명령의 답(크기 상관없음), When 보내면, Then 메시지마다 머리 포함 1,000,000바이트 이하가 되게 `chunk`(`seq` 0부터)로 나누고 마지막에 `end {count, bytes, sha256}`를 보낸다. 조각을 이으면 원래 글자와 바이트까지 같다(한글·이모지·따옴표가 조각 경계에 와도)
- AC-001.6: Given 도우미 실행, When 어떤 명령을 처리하든, Then 표준 출력에는 메시지 틀만 쓰고, 진단 기록(파일)에는 시각·명령 이름·오류 번호만 남긴다. 환자 자료·메모·차트번호는 어디에도 쓰지 않는다(시험: 가짜 환자 글자가 기록에 없음)

### REQ-002: 도우미 빌드·설치 (Phase 1 · Step 1 · helper-build)
- AC-002.1: Given `.github/workflows/helper.yml`, When 읽으면, Then `helper/**`·`extension/**`·`src/lib/bridge/commands.json`·자기 파일이 바뀐 push, `workflow_dispatch`, 태그 `helper-v*`에 돌고, `windows-latest`에서 `dotnet test`(Core·Windows 시험 전부)를 먼저 돌린 뒤에만 빌드·zip을 만든다
- AC-002.2: Given 같은 workflow, When 읽으면, Then 기본 권한은 `contents: read`이고 `contents: write`는 태그 때 릴리스 일에만 있다. `secrets.`를 쓰지 않고, action은 버전이 고정돼 있다(`@main`·`@master` 없음)
- AC-002.3: Given `helper/install/host-manifest.json` 틀, When 읽으면, Then `name`(`com.seoseungkwan.precheck`)·`description`·`path`·`type: "stdio"`·`allowed_origins`만 있고, `allowed_origins`는 우리 확장 하나이며 와일드카드가 없다
- AC-002.4: Given `install.ps1`, When 읽으면, Then 관리자 권한 없이 `%LOCALAPPDATA%\Seoseungkwan\PrecheckHelper\`에 파일을 두고 `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.seoseungkwan.precheck`에 등록 파일 경로를 쓴다. 돌던 도우미를 먼저 끝내고 덮어쓴다. `data\` 폴더(작업 저장)는 지우지 않는다. `uninstall.ps1`은 등록과 프로그램 파일을 지우고 `data\`는 물어본 뒤에만 지운다
- AC-002.5: Given zip 이름, When 만들면, Then `precheck-helper-<Version>.zip`이고 `<Version>`은 `Directory.Build.props`와 같다

### REQ-003: 크롬 확장 (Phase 1 · Step 2 · extension)
- AC-003.1: Given `extension/manifest.json`, When 읽으면, Then `manifest_version` 3, `permissions`는 `["nativeMessaging"]` 하나, `host_permissions`·`content_scripts`·`web_accessible_resources`가 없고, `externally_connectable.matches`는 우리 사이트 origin 하나이며 와일드카드 도메인이 없다
- AC-003.2: Given 웹에서 온 연결(`onConnectExternal`), When `sender.origin`이 우리 origin이 아니면, Then 바로 끊고 도우미를 켜지 않는다
- AC-003.3: Given 우리 origin의 메시지, When 봉투가 `{v, id, cmd, args}` 모양이고 `cmd`가 명령 표에 있으면 도우미에 그대로 넘기고, 아니면 `E-BRIDGE-REJECTED`로 답하고 넘기지 않는다
- AC-003.4: Given 도우미 답, When 오면, Then 고치거나 쌓아 두지 않고 그 웹 연결에 그대로 넘긴다. `extension/src/**`는 `chrome.storage`·`localStorage`·`indexedDB`·console·`fetch`·`XMLHttpRequest`·`WebSocket`을 쓰지 않는다(ESLint가 막고 `src/guardrails.test.ts`가 증명)
- AC-003.5: Given 웹 연결이 이미 하나 있음, When 두 번째 연결이 오면, Then `E-BRIDGE-BUSY`로 답하고 끊는다. 첫 연결이 끊기면 다시 받는다(AC-003.9일 때는 빼고)
- AC-003.6: Given `hello`, When 웹이 부르면, Then 도우미 답에 확장 버전(`manifest.version`)과 확장 `protocol`을 붙여 돌려준다. 도우미를 켜지 못하면(`connectNative` 끊김·`lastError`) `E-HELPER-MISSING`
- AC-003.7: Given `bit.input`이 진행 중, When 웹 연결이 끊기면, Then 도우미 연결은 그 요청의 `end`·`error`가 오거나 30분이 지날 때까지 두었다가 닫는다. 그 밖의 명령 중에 끊기면 도우미 연결도 바로 닫는다
- AC-003.8: Given `npm run ext:build`, When 돌리면, Then `extension/tsconfig.json`으로 `extension/dist/`에 JS와 manifest를 만든다. 루트 `tsconfig.json`은 `extension/`·`helper/`를 빼서 `npm run build`가 그대로 통과한다
- AC-003.9: Given AC-003.7로 웹 연결 없이 도우미 연결을 붙잡고 있음(`bit.input` 진행 중), When 새 웹 연결이 오면, Then `E-BRIDGE-BUSY`로 답하고 끊는다. 새 도우미를 켜지 않고, 붙잡은 도우미 연결에도 넘기지 않는다. 그 연결을 닫은 뒤에는 다시 받는다

### REQ-004: 웹 통로 코드 (Phase 1 · Step 3 · bridge-client)
- AC-004.1: Given `src/lib/bridge/**`, When ESLint를 돌리면, Then 기존 환자 자료 구역 규칙(네트워크·console·브라우저 저장소·React/Next/supabase/auth/storage import·JSX 금지)이 모두 걸리고, 더해서 `window.postMessage`·`BroadcastChannel`·`parent`·`top`·`opener`가 막히며, `chrome.runtime.connect`·`chrome.runtime.sendMessage`는 첫 인자가 `EXTENSION_ID`가 아니면 막힌다. `src/guardrails.test.ts`가 규칙마다 증명한다
- AC-004.2: Given `src/lib/precheck/**`, When ESLint를 돌리면, Then 같은 환자 자료 구역 규칙이 걸린다(guardrails 시험)
- AC-004.3: Given `chrome.runtime`이 없음(확장 없음·휴대폰·다른 브라우저), When `connectBridge`, Then 상태가 `no-extension`이 되고 던지지 않는다. 연결이 곧바로 끊기면(`lastError`) `no-extension`, 확장이 `E-HELPER-MISSING`을 주면 `no-helper`, `E-BRIDGE-BUSY`면 `busy`
- AC-004.4: Given 버전 값, When `checkVersions({web, extension, helper})`, Then protocol이 모두 같고 도우미 ≥ `MIN_HELPER`, 확장 ≥ `MIN_EXTENSION`이면 `ok`(도우미 < `LATEST_HELPER`면 `helperUpdateAvailable: true`), 도우미가 낮거나 도우미 protocol이 다르면 `update-helper`, 확장이 낮거나 확장 protocol이 다르면 `update-extension`
- AC-004.5: Given 환자 자료 명령(명령 표의 `patient: true`), When 답 조각이 오면, Then 통로 코드는 `JSON.parse` 없이 `sink.chunk(id, seq, data)`·`sink.end(...)`로 Worker에 넘기고, 부른 쪽에는 `{id, count}`만 준다
- AC-004.6: Given 숫자·상태 명령, When `result`가 오면, Then 명령마다 정해 둔 모양(숫자·날짜·정해 둔 상태 글자)인지 검사해 돌려준다. 다르면 `E-BRIDGE-BAD-REPLY`. 환자 자료 명령에 `result`가 오거나 숫자 명령에 `chunk`가 오면 같은 오류다
- AC-004.7: Given 연결이 끊김, When 기다리던 요청이 있으면, Then 그 요청은 `E-BRIDGE-DISCONNECTED`로 끝나고 환자 자료 요청은 `sink.abort(id, code)`로 모으던 조각을 버리게 한다
- AC-004.8: Given `buildCsp`, When 운영·개발 값을 만들면, Then 이 기능 전과 글자까지 같다(`chrome-extension:`이나 확장 ID가 없다)
- AC-004.9: Given `send(cmd, payload)`(`store.save`·`bit.input`, `payload`는 Worker가 만든 JSON 글자), When 보내면, Then 통로 코드는 `payload`를 풀거나 고치지 않고 봉투 `{v: 1, id, cmd, args: {payload}}`(design.md 4-2)에 글자 그대로 넣어 확장에 넘긴다. 다른 명령이거나 `payload`가 글자가 아니면 보내지 않고 `E-BRIDGE-REJECTED`. 답은 `store.save`면 `result {saved: true}`인지 검사하고, `bit.input`이면 결과 조각을 sink로 넘기고 `{id, count}`로 끝난다(AC-004.5와 같음)
- AC-004.10: Given `bit.input` 요청에 온 `progress`, When 받으면, Then 칸이 `{v, id, type, done, total}`뿐이고 `done`·`total`이 `0 ≤ done ≤ total ≤ 500`인 정수일 때만 `onProgress({id, done, total})`로 알린다. 다른 칸·숫자 아닌 값·범위 밖이거나 `bit.input`이 아닌 요청에 오면 `E-BRIDGE-BAD-REPLY`로 그 요청을 끝내고 `sink.abort(id, code)`
- AC-004.11: Given 화면이 쓰는 입구 `connectScreenBridge({runtime, worker})`(`src/lib/bridge/workerSink.ts`), When 환자 자료 조각이 오거나 Worker가 보낼 글자를 넘기면, Then 조각·`end`·`abort`와 보낼 글자는 `workerSink`가 만든 전용 `MessageChannel` 포트로만 Worker와 오간다. 화면이 받는 것(`ScreenBridge`의 약속 값·`onState`·`onProgress`)은 상태·숫자·상태 명령의 검사한 답(AC-004.6)·진행 숫자·`{id, count}`·오류 번호뿐이고, `ScreenBridge`에는 `send`가 없다. `src/lib/bridge/client.ts`는 `src/lib/bridge/**` 밖에서 import할 수 없다(ESLint, guardrails 시험). 시험: 가짜 조각과 보낼 글자 속 '가상환자01'이 화면 쪽 콜백·약속 값 어디에도 없다

### REQ-005: 비트 연결·기관기호 (Phase 1 · Step 4 · bit-connect, 후속 Step 5 · helper-fixups)
- AC-005.1: Given 가짜 설치 후보(앱 폴더·레지스트리 값·기본 폴더)와 가짜 파일 모양, When 비트를 찾으면, Then 원본 `InstallationLocator`·`NativeEnvironmentGuard`와 같은 규칙으로 고른다: UNC·상대 경로 거절, `ini\BITSTATISTICS.Xml`·`EXE\BITDataBaseCommon.dll`·`EXE\BITStatistics.exe`가 모두 있는 곳, 환경 파일의 `Path`·`Bin`과 일치, 지원 위치 `C:\DrBIT50`. 못 찾으면 `E-BIT-NOT-FOUND`
- AC-005.2: Given DB 서버 이름, When 접속 전에 검사하면, Then 원본 `CheckPrivateServer`처럼 `.`·`(local)`·`localhost`·이 PC 이름·사설 IPv4(`tcp:` 앞붙임 허용)만 되고 그 밖은 `E-BIT-DB-FAILED`. 접속은 `ConnectTimeout=10`이다
- AC-005.3: Given 도우미가 돌리려는 SQL, When `ReadOnlyGuard`를 거치면, Then `Sql.cs`에 정해 둔 상수만 매개변수와 함께 돌고, 끝내지 않는(되돌리는) 트랜잭션 안에서 읽는다(원본 그대로). 정해 둔 것 밖의 SQL 글자는 돌리지 않는다
- AC-005.4: Given 병원 범위·기관기호 줄, When 원본 `ValidateScope`·`ValidateInstitutionNumbers`로 검사하면, Then 범위가 정확히 하나이고 모든 기관기호가 8자리 숫자이며 등록한 것과 같을 때만 통과한다(원본 시험 사례를 옮긴다)
- AC-005.5: Given 처음 등록(`bit.register`), When 비트 로그인을 마치고 PC 확인 창에서 [확인]을 누르면, Then 기관기호·범위·설치 위치·서버·DB 이름과 프로필 ID를 `registration.dat`(DPAPI)에 저장하고 `{registered: true}`. 병원 이름은 저장하지 않는다(비트에서 병원 이름을 읽는 원본 SQL이 없다. 화면은 사이트의 병원 이름을 쓴다). [취소]·창 닫기면 저장하지 않는다. 확인 창의 글은 도우미가 비트에서 읽은 값(기관기호는 뒤 4자리 가림)으로만 만든다. 이미 등록돼 있어도(`E-BIT-HOSPITAL-MISMATCH` 뒤 등) 같은 길로 다시 등록할 수 있다: 확인 창에 전 등록 값과 새 값을 함께 보이고 [확인]이면 바꿔 쓴다. 기관기호가 같으면 전 등록의 프로필 ID를 그대로 둔다(작업 저장을 이어 읽게, AC-015.4)
- AC-005.6: Given 등록된 도우미, When 읽기·입력 명령을 받으면, Then 먼저 원본 `VerifyCurrentInstitution`처럼 오늘 날짜로 기관기호·범위를 다시 확인하고, 등록이 없으면 `E-BIT-NOT-REGISTERED`, 다르면 `E-BIT-HOSPITAL-MISMATCH`로 그 명령을 하지 않는다
- AC-005.7: Given `bit.check`, When 부르면, Then 단계별 결과 `steps`(비트 찾기·DB 읽기·등록 확인)를 `{name, ok, code?}`로 돌려주고, 등록됐으면 기관기호를 함께 준다(병원 이름은 주지 않는다). 실패한 단계 뒤는 `ok: false`·`code: 'E-…'`로 채운다
- AC-005.8: Given `helper/src/Precheck.Helper/Precheck.Helper.csproj`, When 읽고 이 서버에서 `dotnet build helper/src/Precheck.Helper/Precheck.Helper.csproj -c Release`를 돌리면, Then csproj에 `<ProjectReference Include="../Precheck.Windows/Precheck.Windows.csproj" />`와 `<PlatformTarget>x86</PlatformTarget>`이 있고 `<Platform>`·`<Platforms>` 칸은 없다. 빌드가 통과해 `helper/src/Precheck.Helper/bin/Release/net48/`(helper.yml이 zip을 만들 때 읽는 자리 그대로)에 `PrecheckHelper.exe`·`Precheck.Windows.dll`·`Precheck.Core.dll`이 생기고, exe의 CLR 머리 Flags에 32비트 전용(`32BITREQUIRED`)이 켜져 있다. 까닭: 비트 DLL이 32비트다(원본 `tools/build_stats.ps1`의 `/platform:x86`). AnyCPU net48 exe는 64비트 윈도우에서 64비트로 돌아 그 DLL을 불러오지 못한다
- AC-005.9: Given 비트에서 읽은 등록 값, When 도우미가 `registration.dat`를 쓰거나 `bit.check` 답·PC 확인 창 글을 만들면, Then 병원 이름이 어디에도 없다: `registration.dat` JSON 칸은 `version`·`profileId`·`institutionCode`·`scope`·`installPath`·`server`·`database`뿐이고, `bit.check` result 칸은 `steps`·`registered`·`institutionCode`(`registered: true`일 때만)뿐이다. 확인 창 글은 비트에서 읽은 등록 값(기관기호 뒤 4자리 가림·비트 병원 범위·설치 위치·서버·DB 이름)으로만 만들고, 다시 등록이면 전 값과 새 값을 함께 보인다. 범위 값 등 다른 값을 병원 이름 자리에 넣지 않는다
- AC-005.10: Given 웹 통로가 받은 `bit.check` 답, When `hospitalName` 칸이 있으면(값이 무엇이든), Then 모르는 칸이므로 `E-BRIDGE-BAD-REPLY`다. `ResultOf<'bit.check'>` 타입은 `{steps, registered, institutionCode?}`이고 `hospitalName`이 없다. 설치 화면의 병원 이름은 사이트가 가진 로그인한 사용자의 병원 이름이다(REQ-006)
- AC-005.11: Given `helper/src/Precheck.Windows/SqlBitDb.cs` 글자, When 시험이 읽으면(이 서버에서, 윈도우 없이), Then `Commit` 부름이 없고, `new SqlCommand(`는 모두 그 세션의 트랜잭션을 인자로 받아 만든다. 예외는 트랜잭션을 열기 전에 격리 수준만 보는 `Sql.SnapshotStateSql` 한 곳(원본 그대로)이고, 그것도 `ReadOnlyGuard.Require`를 먼저 지난다
- AC-005.12: Given `registration.dat`, When 도우미가 등록을 읽으면(`bit.check`·`bit.register`·읽기·입력 명령 전 확인), Then design.md 9-3의 깨진 파일 규칙을 따른다: 파일이 없으면 등록 없음(`E-BIT-NOT-REGISTERED`)이다. 있는데 깨졌으면(머리 다름·크기 넘음·풀기 실패·JSON·칸 틀림) `.bak`이 같은 검사를 통과할 때는 깨진 파일을 지우지 않고 이름을 바꿔 두고 `.bak` 내용으로 `registration.dat`를 되살려 그 값을 쓴다(그 뒤 확인은 AC-005.6 그대로). `.bak`도 없거나 깨졌으면 `E-STORE-BROKEN`이다(파일은 그대로 둔다): `bit.check`는 `registered: false`이고 `registration` 단계가(앞 단계가 통과했으면) `ok: false`·`code: 'E-STORE-BROKEN'`, 읽기·입력 명령은 그 번호로 하지 않는다. 이때 `bit.register`는 처음 등록처럼(전 값 없이, 새 프로필 ID) 새로 등록할 수 있다. [확인]으로 저장할 때 깨진 `registration.dat`와 깨진 `.bak`은 먼저 지우지 않고 이름을 바꿔 둔 뒤 새 `registration.dat`를 쓴다(깨진 파일이 새 `.bak`이 되거나 덮여 사라지지 않게)

### REQ-006: 설치·연결 확인 화면 (Phase 1 · Step 6 · setup-screen)
- AC-006.1: Given `/claim/setup`, When 통로 상태가 `no-extension`·`no-helper`·`update-helper`·`update-extension`·`busy`이면, Then 목업 승인본의 상태별 안내를 보인다: 확장 설치 링크, 도우미 zip 받는 곳과 설치 순서(경고 창 넘기는 법 포함), "도우미를 업데이트하세요", "확장을 업데이트하세요", "다른 창에서 작업 중"
- AC-006.2: Given 상태 `ready`, When [연결 확인]을 누르면, Then `bit.check`를 부르고 단계마다 ✓/✗와 오류 번호를 보인다. 등록이 없으면(`registered: false`. 등록 파일이 깨져 `E-STORE-BROKEN`일 때도) [처음 등록]이, `E-BIT-HOSPITAL-MISMATCH`면 [다시 등록]이 보이고, 누르면 `bit.register`(PC 확인 창, AC-005.5)를 부른 뒤 다시 확인한다. 누른 동안 단추를 막는다
- AC-006.3: Given `helperUpdateAvailable`, When 화면을 그리면, Then "새 도우미가 있어요" 한 줄과 받는 곳 링크를 보이고 나머지는 그대로 쓸 수 있다
- AC-006.4: Given 탭 줄, When 승인된 사용자가 보면, Then 목업 승인본 위치에 [청구] 탭이 `/claim` 링크로 있다(`aria-current` 포함). 기관기호는 뒤 4자리를 가려 보이고, 그 옆 병원 이름은 도우미 답이 아니라 앱이 가진 로그인한 사용자의 병원 이름(사이트에 등록한 이름)이다
- AC-006.5: Given 휴대폰이나 확장 없는 브라우저, When `/claim/setup`을 열면, Then "비트 PC의 크롬에서 엽니다" 안내와 밖에서 보는 건수(`/claim`)로 가는 링크를 보인다
- AC-006.6: Given 새 오류 번호(design.md 4-5 중 연결·도우미·비트 접속 것과 `bit.check` 등록 단계가 줄 수 있는 `E-STORE-FAILED`·`E-STORE-BROKEN`), When `errorInfo(code)`, Then '무엇이·어떻게 고치나' 문구가 `lib/errors.ts`에서 나온다. 화면에는 원래 오류 내용이 보이지 않는다

### REQ-007: 규칙표·약·상병 표 (Phase 2 · Step 0 · rule-data)
- AC-007.1: Given `src/lib/precheck/data/rules.json`, When 읽으면, Then 원본 `tools/precheck_rules.json`(2a1069b)과 같은 `version`·`code_groups`(76)·`drug_classes`(27)·`regions`(16키)와 규칙 262개가 있다. 규칙마다 원본의 16칸(`id`·`domain`·`title`·`type`·`params`·`grade`·`message`·`basis`·`confidence`·`data_needed`·`automatable`·`stage`·`enabled_default`·`effective_from`·`effective_to`·`notes`)이 같고, `id`가 겹치지 않으며, `grade`는 `확인필요`·`알림`·`참고` 중 하나, `basis`마다 `doc`·`number`가 있다
- AC-007.2: Given `dxFlags.json`(원본 `assets/knowledge/dx_flags.json`의 I·N 목록)·`drugInfo.json`(edi → 분류·성분)·`codeMap.json`(원본 기본 CODEMAP), When 읽으면, Then 원본과 줄 수·값이 같다
- AC-007.3: Given 옮기기 스크립트 `scripts/precheck/import-tables.mjs`, When 같은 원본으로 두 번 돌리면, Then 같은 바이트의 파일이 나온다. 원본 경로는 인자로만 받고 저장소에 원본을 두지 않는다
- AC-007.4: Given `src/` 전체, When 표 파일(`lib/precheck/data/*.json`)을 부르는 곳을 찾으면, Then `src/workers/precheck/tables.ts`의 글자로 고정한 동적 `import()`뿐이고 정적 import가 없다(시험: 소스 검사). 다른 화면 번들에 표가 들어가지 않는다
- AC-007.5: Given `loadTables()`, When 부르면, Then 네 표를 한 번만 불러 기억하고, 실패하면 `E-RULES-LOAD-FAILED`를 돌려준다(점검을 시작하지 않는다)

### REQ-008: 한 달 자료·12개월 이력 읽기 (Phase 2 · Step 1 · bit-claim-read)
- AC-008.1: Given 기간(시작·끝 날을 함께 세어 35일 이하, 달을 넘겨도 됨), When `claim.month`, Then 증상(83)·상병(83D)·소모(47) 표 줄과 12개월 이력(기간 시작 365일 전부터 기간 끝까지. 400일 이하라 원본 `RxHistory.MaximumDays` 400일 안)·상병 추세·처방 목록을 하나의 JSON으로 만들어 조각으로 보낸다. 칸은 원본 `build`·`parseRx`·`claim_import.py`가 읽는 칸만 남긴다(나머지 칸은 버린다)
- AC-008.2: Given 이력·이미 있는 메모·상병 추세 SQL, When `Sql.cs`를 원본(`RxHistory.VisitSql`·`CodeSql`, `RxDiagnosisTrend`)과 비교하면, Then 공백만 다르다. 줄 모양은 원본처럼 이력 `{v, p, d, c[], m}`이다
- AC-008.3: Given 비트 통계 화면 표(가짜 표 값), When `GridRows`로 바꾸면, Then 원본 `NativeMappings`의 키(83·83D·47)별 칸 이름으로 줄을 만들고, 필요한 칸이 없으면 `E-BIT-EXPORT-FAILED`로 그 명령 전체를 멈춘다
- AC-008.4: Given 표 하나라도 읽기 실패·시간 초과(원본 값: 메타 15초, 자료 120~150초), When `claim.month`를 처리하면, Then `end` 없이 `error`(`E-BIT-READ-FAILED` 또는 `E-BIT-EXPORT-FAILED`)를 보낸다. 반쪽 자료를 보내지 않는다
- AC-008.5: Given 기간, When `claim.dates`, Then 날짜별 외래 진료 수와 비트 메모가 있는 진료 수를 `result {days: [{date, visits, memoInBit}]}`로 숫자만 돌려준다. 진료 0건인 날은 빼고, 세는 조건은 원본 방문 조건(`OcmPatTyp='O'`·`OcmRsuYon<>'O'`·병원 범위)과 같다

### REQ-009: 점검용 모양 만들기 (Phase 2 · Step 2 · claim-shape)
- AC-009.1: Given 한 요청의 조각들과 `end`, When Worker의 `assemble`이 모으면, Then 조각 수·바이트 수·SHA-256이 `end`와 같을 때만 JSON으로 풀고, 순서가 뒤바뀌어 와도 `seq`대로 잇는다
- AC-009.2: Given 빠진 조각·남는 조각·SHA-256 다름·`abort`·`error`, When 모으면, Then 그 요청의 조각을 모두 버리고 `E-CLAIM-PARTIAL`을 화면에 알린다. 점검을 돌리지 않는다
- AC-009.3: Given 풀린 한 달 자료, When `shapeClaimMonth`, Then design.md 6-3의 `ClaimMonth`로 바꾼다: 진료(`key`·`chart`·`date`·`name`·`lines`·`rx`·`dx`·`memosInBit`), 차트번호·날짜로 묶은 이력, 상병 추세, 처방 목록. 날짜는 `lib/analytics/dates.ts`로 `YYYY-MM-DD`
- AC-009.4: Given 증상·소모 중 하나가 비었거나 이력이 없거나 선언한 줄 수와 받은 줄 수가 다름, When 모양을 만들면, Then `E-CLAIM-PARTIAL`로 멈춘다. 상병(83D)은 원본처럼 없어도 된다
- AC-009.5: Given 달을 넘기는 기간(예: 10/30~11/2), When 모양을 만들면, Then 진료마다 진료 달(`YYYY-MM`)을 붙이고 한 번에 점검한다

### REQ-010: 점검 규칙 엔진 (Phase 2 · Step 3 · rule-engine)
- AC-010.1: Given 가짜 자료 `fixtures/precheck/fake/`, When `runRules(month, tables, settings)`, Then 결과(진료마다 `hits`·건너뛴 수·점검한 수와 원본 `collect` 모양의 묶음)가 원본 `evaluate`·`collect`로 만든 골든 `fixtures/precheck/golden/rules-*.json`과 순서까지 같다
- AC-010.2: Given 조건 종류 18가지(`count_window`·`claim_code`·`same_day_pair`·`documentation`·`required_dx`·`info_only`·`same_day_limit`·`interval`·`dur`·`multiplier_cap`·`drug_requirement`·`dx_site_match`·`dx_master`·`visit_fee`·`imaging_count`·`episode_period`·`forbidden_dx_combo`·`prerequisite`), When 골든을 보면, Then 종류마다 걸리는 사례와 안 걸리는 사례가 하나 이상 있다
- AC-010.3: Given 규칙 262개, When `rules-coverage.json`과 골든을 맞춰 보면, Then 모든 규칙이 골든에서 한 번 이상 걸리거나 걸리게 할 수 없는 이유가 적혀 있다. 둘 다 없는 규칙이 있으면 실패한다
- AC-010.4: Given 설정 `{off, on, grade}`(원본 저장 모양), When 점검하면, Then 끈 규칙은 결과가 없고, 켠 규칙은 `enabled_default`가 꺼져 있어도 돌고, 등급을 바꾼 규칙은 바뀐 등급으로 나오며 정렬도 바뀐 등급을 따른다. 시작·끝 날짜(`effective_from`·`effective_to`) 밖의 진료에는 돌지 않는다
- AC-010.5: Given 이력이 필요한 규칙(`stage`에 `history`), When 점검하면, Then 늘 함께 오는 12개월 이력(AC-008.1)으로 센다. 이력이 없으면 AC-009.4가 먼저 멈추므로, 원본의 '이력을 아직 안 받음' 길(`historyReady()`가 거짓 → '이력 없어 건너뜀')은 옮기지 않고 `historyReady()`를 늘 참으로 둔다. 골든은 원본에 이력을 넣고 만들며 이력 건너뜀 수는 0이다
- AC-010.6: Given 원본의 Python식 정규식(`(?i)` 등)과 `regions.*` 경로, When 규칙을 읽으면, Then 원본 JS와 같은 방법으로 바꿔 쓴다(골든으로 확인)

### REQ-011: 추천 상병·상병 확인 (Phase 2 · Step 4 · dx-check)
- AC-011.1: Given 가짜 자료와 상병 추세, When `recommendDx(code, name)`, Then 원본 `recommend`와 같은 `{visits, list[{dx, nm, src, ex, t}]}`를 돌려준다(원본 상수 `TOP=3`·`LIFT=150`·`EX_SHARE=700`, 골든)
- AC-011.2: Given 진료 하나, When `dxIssues(visit)`·`needsCheck`·`missingDx`, Then 원본과 같은 결과다(불완전 코드 I·주상병 불가 N 표 포함, 골든)
- AC-011.3: Given 병원 설정의 상병 연결표(원본 `snapshot.rules` 모양 `[rx, dx, nm, ex, src]`), When 추천하면, Then 연결표가 원본과 같은 우선순위로 섞인다(골든)
- AC-011.4: Given 상병 추세가 없음, When 추천하면, Then 고시·연결표만으로 추천하고 오류를 내지 않는다(원본과 같음)

### REQ-012: 규칙 설정 (Phase 2 · Step 5 · rule-settings)
- AC-012.1: Given 마이그레이션 `20261030000000_precheck_settings.sql`, When PGlite로 돌리면, Then `claim_rule_settings`·`claim_hospital_settings`·`message_templates`에 RLS가 켜져 있고 `anon`·`authenticated` 권한을 먼저 모두 회수한 뒤 design.md 8-3의 것만 준다. `my_hospital_id()`·`touch_updated_at()`는 `security definer`·`search_path = ''`이고 `authenticated`만 부를 수 있다
- AC-012.2: Given `anon`, When 세 표를 읽거나 쓰려 하면, Then 모두 거부된다. Given 승인 안 된 병원(`pending`·`rejected`)의 사용자, When 읽거나 쓰면, Then 아무 줄도 보이지 않고 넣기가 거부된다
- AC-012.3: Given 승인된 사용자, When 세 표를 쓰면, Then 자기 병원 줄만 보고 고친다. `hospital_id`·`updated_at`을 직접 넣거나 바꾸려 하면 거부되고, `hospital_id`는 DB 기본값으로만 들어간다. 남의 병원 줄은 보이지 않는다
- AC-012.4: Given 제약, When 틀린 값을 넣으면, Then 거부된다: 규칙 ID 모양이 아님, 등급이 `확인필요`·`알림`·`참고`가 아님, 문구 jsonb가 object가 아니거나 256KB 이상, 문자 문구 이름 1~30자·내용 1~2000자 밖, 종류가 `injection`·`followup`이 아님
- AC-012.5: Given `lib/storage/claimSettings.ts`, When 규칙 설정을 읽으면, Then 줄들을 원본 저장 모양 `{schema: 1, off, on, grade}`로 바꿔 주고, 쓰면 바뀐 줄만 upsert한다. 실패하면 값을 그대로 두고 `E-SETTINGS-FAILED`
- AC-012.6: Given 설정 화면 `/settings`의 '점검 규칙' 칸, When 그리면, Then 규칙마다 ID·제목·분야·기본 등급·근거(고시 번호)와 켜기·끄기·등급 고르기가 있고, [저장]은 바뀐 것만 보낸다. [기본값으로]는 그 규칙 줄을 지운다. 탭 줄의 [설정]이 `/settings` 링크가 된다
- AC-012.7: Given 점검에 쓴 설정 묶음과 다시 읽은 설정 묶음, When `settingsChanged(a, b)`, Then 규칙·병원 문구·상병 연결표·문자 문구 중 하나라도 다르면 `true`다(순서만 다른 것은 같다)

### REQ-013: 청구 화면 · 날짜 목록·점검 (Phase 2 · Step 6 · precheck-screen)
- AC-013.1: Given 도우미 `claim.dates`와 서버 `claim_day_counts`, When `buildDateList`, Then 진료 0건인 날을 빼고 ① 덜 끝난 날(메모 필요 > 입력, 또는 아직 불러오지 않은 날)을 오래된 날부터 ② 다 끝난 날을 최근 날부터 놓는다. 날마다 진료 수·남은 수·마지막으로 바뀐 시각이 있다
- AC-013.2: Given 날짜 목록, When 시작·끝 날을 고르면, Then 달을 넘겨도 되고 35일 이하만 된다(AC-008.1). [자료 불러오기]를 누르면 `claim.month`·`claim.memos`·`store.load`를 부르고, 모두 끝나야 점검한다. 누른 동안 단추를 막고 진행 상태를 보인다. Phase 3 전이라 도우미가 `claim.memos`·`store.load`에 `E-HELPER-UNKNOWN-COMMAND`로 답하면 메모 비교는 '조회 못함', 저장한 작업은 '없음'으로 보고 점검을 계속한다(다른 오류는 멈춤)
- AC-013.3: Given 점검 결과, When 화면을 그리면, Then 환자(진료)마다 등급 칩(확인 필요·알림·참고)과 규칙 제목·내용·고시 근거, 추천 상병, 상병 확인 경고가 목업 승인본처럼 보인다. 등급·규칙으로 거를 수 있다. 등급은 색만이 아니라 글자로도 구분한다
- AC-013.4: Given [엑셀 내려받기], When 누르면, Then Worker가 원본과 같은 두 시트(규칙별 `[규칙, 제목, 분야, 등급, 건수, 근거]`, 내원별 `[진료일, 차트번호, 이름, 등급, 규칙, 제목, 내용, 세부]`)의 xlsx를 만들고 그 PC에 내려받는다. 서버로 보내지 않는다
- AC-013.5: Given `E-CLAIM-PARTIAL`·`E-RULES-LOAD-FAILED`·읽기 오류, When 생기면, Then 점검 결과를 보이지 않고 오류 카드("다시 불러오세요")와 [다시 불러오기]를 보인다
- AC-013.6: Given 점검 뒤 설정이 바뀜(창 초점이 돌아올 때 다시 읽음), When `settingsChanged`가 `true`면, Then "설정이 바뀌었어요, 다시 점검하세요" 띠와 [다시 점검]을 보인다
- AC-013.7: Given `src/components/claim/rows/**`, When ESLint를 돌리면, Then 네트워크·console·브라우저 저장소·supabase·storage·auth import가 막힌다(JSX는 된다). Given `src/components/claim/**`·`src/app/(app)/claim/**`, When 오류 보고 패키지(`@sentry/*`·`@vercel/analytics`·`@vercel/speed-insights`)를 import하면, Then 막힌다. `package.json`에 그런 패키지가 없다(guardrails 시험)
- AC-013.8: Given 휴대폰이나 확장 없는 브라우저, When `/claim`을 열면, Then 점검 칸 대신 밖에서 보는 건수(REQ-019) 자리와, PC 크롬이면 설치·연결 확인으로 가는 링크를 보인다
- AC-013.9: Given 서버 설정 읽기 실패, When 점검하려 하면, Then 도우미에 둔 마지막 설정 사본(REQ-015)으로 점검하고 "서버에 닿지 않아 마지막으로 받은 설정을 씁니다"를 보인다. 사본도 없으면(도우미가 `store.*`에 `E-HELPER-UNKNOWN-COMMAND`로 답하는 Phase 3 전 포함) 점검하지 않고 `E-SETTINGS-FAILED`. 설정을 읽으면 사본을 새로 저장한다(Phase 3 전에는 건너뜀)

### REQ-014: 청구메모 문장 (Phase 3 · Step 0 · memo-text)
- AC-014.1: Given 가짜 자료와 원본 기본 병원 문구(`TPL_DEF`·`FIXED_PHRASES_DEF`·`SITE_NAMES_DEF`), When `buildMemo(visit, region, phrases)`·`memoText`, Then 원본 `buildMemo`·`compose`·`fill`과 같은 문장이 나온다(골든 `memo-*.json`)
- AC-014.2: Given 문구 틀의 말(`좌우`·`한글방향`·`영문방향`·`레벨`·`부위`·`시술`·`약제`·`KLG`·`검사`·`기간`·`진단`·`영상`), When 채우면, Then 원본 `fill`과 같고 모르는 말은 원본처럼 둔다(골든)
- AC-014.3: Given 병원 문구 값, When `validatePhrases`·`defaultPhrases`·`diffPhrases`, Then 원본 `claim_hospital_settings.js`의 `validate`·`defaults`·`diff`와 같은 결과다(원본 `sideRuleVersion` 1→2 바꿈 포함, 골든)
- AC-014.4: Given 사용자가 고친 메모, When 다시 점검하면, Then 고친 메모는 원본처럼 그대로 두고 빠진 문장만 경고한다(원본 `savedMemoMissing`, 골든)

### REQ-015: 도우미 작업 저장 (Phase 3 · Step 1 · helper-store)
- AC-015.1: Given `store.save {month, drafts, done, contact?}`, When 저장하면, Then `data\work-YYYY-MM.dat`(연락은 `contact.dat`)에 머리 `PRECHECK-STORE-1\n` + 암호화(DPAPI `CurrentUser`, 고정 entropy)로 쓴다. 임시 파일에 쓴 뒤 바꿔치기하고 `.bak` 하나를 둔다
- AC-015.2: Given `store.load {months}`, When 부르면, Then 그 달들의 저장 내용을 조각으로 돌려준다. 파일이 없으면 빈 내용이다
- AC-015.3: Given 깨진 파일(머리 다름·풀기 실패·JSON 깨짐), When 읽으면, Then `.bak`이 맞으면 그것을 쓰고, 아니면 `E-STORE-BROKEN`을 돌려준다. 깨진 파일은 지우지 않고 이름을 바꿔 둔다
- AC-015.4: Given 저장 내용의 병원(등록 프로필 ID), When 등록 병원과 다르면, Then 읽지도 덮어쓰지도 않고 `E-BIT-HOSPITAL-MISMATCH`
- AC-015.5: Given 13개월보다 오래된 `work-*.dat`, When 도우미가 `store.save`를 처리하면, Then 그 파일들을 지운다
- AC-015.6: Given 저장 형식(가짜 암호화 `IProtector`), When 저장 뒤 다시 읽으면, Then 같은 내용이다. 평문 파일이 디스크에 남지 않는다(임시 파일도 암호화한 뒤 쓴다)
- AC-015.7: Given `store.save {settings}`(서버에서 받은 설정 사본, 환자 정보 아님), When 저장하면, Then `settings.dat`에 같은 방식으로 두고 `store.load {settings: true}`로 돌려준다

### REQ-016: 비트 메모 비교 (Phase 3 · Step 2 · bit-memo-compare)
- AC-016.1: Given 기간, When `claim.memos`, Then 원본 `ClaimMemoHistory.RowsSql`(공백만 다름)로 비트 청구메모 `{v, p, d, m}`를 읽어 조각으로 보낸다. 줄 300,000·메모 4,000자를 넘으면 원본처럼 `truncated`를 알리고, 웹은 그 기간을 `E-CLAIM-PARTIAL`로 멈춘다
- AC-016.2: Given 우리 메모와 비트 메모, When `compareMemo(ours, inBit)`, Then 원본 `MemoApproval.Matches`처럼 줄바꿈(CRLF→LF)만 맞춰 글자 그대로 비교해 `같음`·`다름`·`비트에 없음`을 돌려준다. 읽지 못했으면 `조회 못함`이고, 이것을 빈칸으로 보지 않는다
- AC-016.3: Given 비트에 다른 메모가 있는 진료, When 입력 묶음을 만들면, Then 그 진료는 묶음에 넣지 않고 '건너뜀: 이미 있음'으로 둔다. `같음`이면 '완료(이미 입력됨)'다
- AC-016.4: Given 비교 결과, When 날짜별로 세면, Then 메모 필요 수·입력 수(같음)·이미 있음 수를 날짜마다 낸다(REQ-019 건수의 재료)

### REQ-017: 비트 자동 입력 (Phase 3 · Step 3 · bit-input)
- AC-017.1: Given `bit.input {items: [{visitKey, chart, name, date, memo}]}`, When 받으면, Then 등록 병원 확인 → 비트 화면 지문 확인 → 묶음 검사(500명 이하, 차트번호 `^[0-9]{1,20}$`, 이름 1~100자, 날짜 모양, 메모 1~32,000자, 같은 진료 두 번 없음)를 거친다. 하나라도 틀리면 아무것도 입력하지 않고 오류를 돌려준다
- AC-017.2: Given 검사를 통과한 묶음, When 입력 전에, Then 도우미가 묶음에서 직접 만든 글("10/27~10/29, 32명 입력할까요?"와 등록한 기관기호, 뒤 4자리 가림)의 PC 확인 창을 띄운다. [확인]을 눌러야 시작하고, [취소]·창 닫기·5분 지남이면 하나도 입력하지 않고 `cancelled`로 끝난다
- AC-017.3: Given 사람 하나, When 입력하면, Then 원본 `UChartAutomation`·`autoOne` 순서를 따른다: 내원내역에서 차트번호로 열기 → 이름·차트번호·내원일 검사 → 바로 앞에서 비트 메모 다시 읽기(같으면 완료, 다르면 건너뜀 '이미 있음', 덮어쓰지 않음) → 쓰기 → 다시 읽어 같은지 → 저장 → 다시 읽어 같은지
- AC-017.4: Given 비트 화면 지문(`BITDoctorOrder.exe` 프로세스 규칙, '외래진료실' 창의 `txtChtNum`·`lbPatName`·`txtBilCmt`·`btnBilCmtModify`, '내원내역' 창의 `cbSch`·`txtSch`·`btnSch`·`ctgMain`이 정확히 하나씩), When 하나라도 없거나 여럿이면, Then 입력을 시작하지 않거나 그 사람에서 멈추고 `E-BIT-UI-CHANGED`와 칸 ID 목록을 돌려준다. 짐작해서 누르지 않는다
- AC-017.5: Given 저장 안 한 처방 창(원본 '저장되지않은처방')·원본 fatal 문구·3번 잇따른 실패·진행 창 [멈추기], When 생기면, Then 그 자리에서 멈추고(멈추기는 지금 사람까지) 남은 사람을 '확인 필요: 미처리'로 둔다. 저장 안 한 처방 창은 누르지 않는다(`E-BIT-UNSAVED-RX`)
- AC-017.6: Given 사람마다 결과, When 끝나면, Then 결과는 완료(입력·이미 입력됨)·확인 필요(다시 읽은 값 다름·저장 확인 못함·미처리)·건너뜀(이유: 이미 있음·내원일 없음·환자 불일치·검색 결과 여러 줄 등 원본 문구) 셋 중 하나다. 진행은 `progress {done, total}` 숫자만, 결과는 조각으로 보낸다
- AC-017.7: Given 입력 기록(`Journal`, 작업 저장 안), When 쓰기 전·확인 뒤, Then `writing`·`done`·`skipped`·`check`를 남긴다. Given 도중에 멈춘 묶음, When 다시 열어 같은 진료를 입력하면, Then 비트 메모와 비교해 우리 글과 같으면 완료, 비었으면 입력, 다르면 건너뜀(이미 있음)으로 한다
- AC-017.8: Given 원본 `SecurityTests`의 입력 보호 사례(승인한 메모 줄바꿈·공백 그대로, 쓰기 직전 바뀐 메모 거절, 환자 바뀜 거절, 거절이면 절대 안 씀, 가짜 화면에만 씀), When 가짜 `IChartUi`로 돌리면, Then 원본과 같은 결과다
- AC-017.9: Given `bit.input` 진행 중, When 표준 입력이 닫히면(웹 창이 닫혀 확장이 30분 뒤 도우미 연결을 닫음·로그아웃 뒤·크롬 종료 등), Then 도우미는 지금 사람을 안전한 자리까지만 한다: 쓰기를 아직 시작하지 않았으면 시작하지 않고, 시작했으면 쓰기 → 다시 읽기 → 저장 → 다시 읽기까지 마친다. 그 뒤 남은 사람을 '확인 필요: 미처리'로 두어 입력 기록(`Journal`)과 결과를 작업 저장에 남기고 끝난다. 확인 창이 떠 있던 중이면 [취소]와 같다(하나도 입력하지 않음). 반쯤 쓴 메모를 남기지 않는다
- AC-017.10: Given 이름 있는 뮤텍스 `Local\SeoseungkwanPrecheckHelper.Work`(여러 도우미 프로세스가 함께 봄), When `bit.input`(확인 창부터 결과 기록까지)·`store.save`를 하면, Then 그동안 이 뮤텍스를 잡는다. 다른 프로세스가 잡고 있으면 `bit.input`은 바로, `store.save`는 5초 기다린 뒤 `E-BRIDGE-BUSY`로 답하고 아무것도 쓰거나 입력하지 않는다. 잡은 프로세스가 놓지 않고 끝났으면(abandoned) 잡은 것으로 보고 이어서 하기(AC-017.7)를 따른다

### REQ-018: 메모 화면 · 입력 결과 (Phase 3 · Step 4 · memo-screen)
- AC-018.1: Given 점검한 기간, When 메모 칸을 보면, Then 진료마다 메모 초안(고친 것은 고친 것), 비트 메모와의 비교(같음·다름·비트에 없음·조회 못함), 입력 상태가 목업 승인본처럼 보이고, 아직 입력 안 된 것만 거를 수 있다
- AC-018.2: Given 메모를 고침, When 고친 뒤 1초 동안 더 고치지 않으면, Then `store.save`로 PC에 저장한다. 저장 실패면 값을 그대로 두고 `E-STORE-FAILED`와 [다시 저장]을 보인다. 브라우저 저장소는 쓰지 않는다
- AC-018.3: Given [비트에 입력], When 누르면, Then 아직 안 된 진료(이미 있음·완료 제외)로 묶음을 만들어 `bit.input`을 부르고, "PC 화면의 확인 창에서 [확인]을 눌러 주세요" 안내와 진행 숫자(`done/total`)를 보인다. 설정이 바뀐 띠가 있으면 [다시 점검] 전까지 막는다
- AC-018.4: Given 입력 결과, When 끝나면, Then 완료·확인 필요·건너뜀(이유)으로 나눠 보이고, [다시 하기]는 건너뜀 가운데 '이미 있음'이 아닌 것만 다시 묶어 입력한다. 취소였으면 "입력하지 않았어요"
- AC-018.5: Given 다시 연 청구 화면, When 같은 기간을 불러오면, Then 저장해 둔 고친 메모·결과가 이어서 보인다(도우미 저장 + 비트 비교)
- AC-018.6: Given 다른 창에서 이미 청구 화면이 연결됨(`E-BRIDGE-BUSY`), When 이 창을 열면, Then "다른 창에서 작업 중" 안내만 보이고 불러오기·입력 단추가 없다
- AC-018.7: Given 설정 화면의 '병원 문구'·'상병 연결표' 칸, When 그리면, Then 원본 설정 엔진의 분류(기본·시술별·보조·부위별 문구, 표기 규칙)로 고칠 수 있고, [저장] 전에 `validatePhrases`로 검사해 틀린 칸을 보인다. [메모 시험해 보기]는 가짜 진료 한 건으로 문장을 보여 준다

### REQ-019: 입력 현황 건수 · 밖에서 보기 (Phase 3 · Step 5 · claim-counts)
- AC-019.1: Given 마이그레이션 `20261030000100_precheck_counts.sql`, When PGlite로 돌리면, Then `claim_day_counts`·`claim_month_counts`·`contact_counts`의 칸 종류는 `uuid`(병원)·`date`·`integer`·`timestamp with time zone`뿐이고(글자·jsonb 칸 없음), RLS·권한 회수·내 병원만·`hospital_id` 기본값만 규칙이 REQ-012와 같다
- AC-019.2: Given 건수 제약, When 음수·100,000 넘는 수·입력 수 > 메모 필요 수·달 첫날이 아닌 `claim_month`를 넣으면, Then 거부된다
- AC-019.3: Given Worker의 점검·입력 결과, When `dayCounts(view)`, Then 날짜마다 `{visit_date, need_memo, entered, needs_check, skipped}` 정수만 만든다. `lib/storage/claimCounts.ts`는 이 모양 밖의 칸이 있으면 보내지 않는다(검사)
- AC-019.4: Given 불러오기·입력이 끝남, When 건수가 바뀌었으면, Then 그 날짜 줄을 upsert한다. 실패하면 메모리에 두고 다음에 바뀔 때·창 초점이 올 때 다시 올리며 `E-COUNTS-FAILED`를 작은 줄로 보인다
- AC-019.5: Given 밖에서 보는 건수(`/claim`, 확장 없는 곳·휴대폰), When 그리면, Then 날짜별 남은 메모 수(남은 날만)를 그 줄의 마지막 바뀐 시각과 함께 보인다. 환자 정보·경고 내용은 없다. 아직 올린 건수가 없으면 빈 안내 한 줄
- AC-019.6: Given 서버에 보낸 요청, When 시험이 요청 몸통을 보면, Then 정해 둔 칸과 정수·날짜만 있고 이름·차트번호·메모 글이 없다

### REQ-020: 심평원 청구 파일 읽기 (Phase 4 · Step 0 · sam-read)
- AC-020.1: Given 가짜 폴더 `<청구월>\<전송폴더>\<청구번호>.GHP|.CAR`, When `sam.latest`, Then 원본 `latest_sam_files`처럼 머리 80바이트 `(\d{10})([HC]\d{3})(\d{8})`로 청구번호·서식·기관기호를 읽고 종류(H010 건강보험·H011 의료급여·CAR 자동차보험)마다 수정 시각이 가장 늦은 파일을 고른다. 32MB를 넘는 파일은 뺀다
- AC-020.2: Given 머리의 기관기호, When 등록 기관기호와 다르면, Then 그 파일은 읽지 않는다. 기관기호가 등록돼 있지 않으면 하나도 읽지 않는다(`E-BIT-NOT-REGISTERED`)
- AC-020.3: Given 고른 파일, When 보내면, Then `{version: 1, files: [{kind, name, month, modified, size, data(base64)}]}`를 조각으로 보낸다. 파일이 없으면 `E-SAM-NOT-FOUND`
- AC-020.4: Given 폴더 밖을 가리키는 이름(`..`·링크), When 찾으면, Then 따라가지 않는다

### REQ-021: SAM 대조 (Phase 4 · Step 1 · sam-match)
- AC-021.1: Given 가짜 SAM 파일(생성기 `fixtures/precheck/make-fake-sam.ts`, EUC-KR 고정 폭), When `parseSam(bytes, name)`, Then 원본 `parseSam`과 같은 `{file, key, name, date, codes, memo, dx, dxs, items[{hang, gb, code, price, qty, cnt, days, amt}]}` 줄을 만든다(골든)
- AC-021.2: Given 가짜 SAM 줄과 메모·진료, When `samCheck`·`samNameCheck`, Then 원본처럼 필요한 말이 있는지(`samRules`의 `CODE = 말|말`, `LA*`, `{이름}`)로 `bad`·`part`·`ok`·`none`을 정하고, 이름+날짜로 맞추며 동명이인은 '확인 필요'로 둔다(골든)
- AC-021.3: Given 한 청구 달, When `collectMonthClose`, Then 원본 월말 마감 `collect`처럼 미완료·빠진 것·확인 표시 남은 것을 모은다(골든). 달을 넘긴 묶음이어도 진료 달로 나눈다

### REQ-022: 월말 마감 화면 (Phase 4 · Step 2 · month-close-screen)
- AC-022.1: Given `/claim/close`, When 달을 고르고 [청구 파일 불러오기]를 누르면, Then `sam.latest`로 파일을 받아 대조하고, 미완료·빠진 것·확인 표시 남은 것을 목업 승인본처럼 나눠 보이며 파일 이름·받은 시각을 보인다
- AC-022.2: Given 줄 하나, When 누르면, Then 그 진료가 있는 청구 화면으로 간다. 주소(URL)에는 날짜만 넣고(`/claim?from=YYYY-MM-DD&to=YYYY-MM-DD`) 차트번호·이름·`visitKey`는 넣지 않는다. 어느 진료인지는 같은 탭 메모리로 넘긴다(시험: 주소·쿼리에 날짜 말고 다른 값이 없다)
- AC-022.3: Given 대조 결과, When 끝나면, Then `claim_month_counts`에 `{claim_month, incomplete, missing, flagged}` 정수만 upsert한다(실패 처리는 REQ-019 건수 올리기와 같음)
- AC-022.4: Given 밖에서 보는 건수, When 그리면, Then 월말 마감 남은 일(미완료·빠진 것·확인 표시)을 달마다 마지막 바뀐 시각과 함께 보인다
- AC-022.5: Given `E-SAM-NOT-FOUND`, When 생기면, Then "청구 파일이 없어요"와 찾는 폴더(`C:\HIRA\DDMD\sam\in\backup`)를 보인다

### REQ-023: F/U·정기 주사 대상 읽기 (Phase 5 · Step 0 · followup-read)
- AC-023.1: Given 기간(F/U는 최근 120일, 정기 주사는 36개월 이하), When `contact.targets`, Then 원본 F/U·정기 주사 계산이 읽는 칸(증상 83 표의 내원일·차트번호·이름·증상 글·처방 코드, 전화번호)만 읽어 조각으로 보낸다. 전화번호를 읽는 곳은 원본 `revisit_source_boot.js`·`revisit_source_parts.py`가 쓰는 자리와 같다
- AC-023.2: Given 줄 수, When 원본 한도(50,000줄)를 넘으면, Then 원본처럼 자르지 않고 `E-BIT-READ-FAILED`로 멈춘다(일부만 보내지 않는다)
- AC-023.3: Given 읽기 실패·시간 초과, When 생기면, Then `end` 없이 `error`를 보낸다

### REQ-024: F/U·정기 주사 목록 계산 (Phase 5 · Step 1 · followup-logic)
- AC-024.1: Given 가짜 증상 글, When `parseFU(visitDate, lines)`, Then 원본처럼 '1주/N주 뒤·내일·모레·다음주+요일·N월 초/중/말'과 적어 둔 날짜(10.17·10/19·10월 17일, 120일 안)를 읽어 `{dateStr, sortDate, kind(예정·조건부), evidence}`를 만든다(골든, JS·Python 원본)
- AC-024.2: Given 'N차' 기록, When `aragan`, Then 원본처럼 N < 3이면 다음 날짜를 +7일로 둔다(골든)
- AC-024.3: Given 진료 기록, When `scheduleRows`·`undecidedRows`·`visitKind`, Then 원본과 같은 내원 예정 명단·추후 재내원(미정)과 주사·F/U 구분을 만든다(골든)
- AC-024.4: Given 정기 주사 기본값(원본 `DEFAULTS`: 연골 `A49` 3차 6개월, 비타민 D `A32` 3개월)과 기록, When `recallCompute`·`recallSelect(from, to, overdue)`·`recallStatus`, Then 원본처럼 마지막 기록에서 달을 더해(말일 맞춤) 날짜를 내고 "지남 N일"·"오늘"·"N일 남음"을 돌려준다(골든)

### REQ-025: 문자 문구 (Phase 5 · Step 2 · message-templates)
- AC-025.1: Given 문자 문구, When `fillTemplate(body, date)`, Then 원본처럼 `<<DATE>>`를 "* M월 D일 X요일 *"로 바꾸고 `[*1*]`·`[*2*]`는 그대로 둔다(날짜는 `dates.ts`, 골든)
- AC-025.2: Given 설정 화면의 '문자 문구' 칸, When 그리면, Then 정기 주사·F/U 문구를 더하고·고치고·지우고·순서를 바꿀 수 있고 `message_templates`에 저장한다. 처음(줄이 없을 때)은 원본 `TPLS`(`jusa`·`jinryo`) 내용을 기본으로 보인다
- AC-025.3: Given [문구 복사], When 누르면, Then 채운 글을 클립보드에 복사하고 "복사했어요"를 보인다. 문자를 보내지 않는다(자동 발송 없음)
- AC-025.4: Given 문구 저장 실패, When 생기면, Then 값을 그대로 두고 `E-SETTINGS-FAILED`와 [다시 저장]을 보인다

### REQ-026: 환자 연락 화면 (Phase 5 · Step 3 · contact-screen)
- AC-026.1: Given `/contact`, When 열면, Then `contact.targets`를 불러 F/U 명단과 정기 주사 명단을 목업 승인본처럼 보인다: 이름·전화·다음 날짜·지남/남은 날·내용·근거 문구. 기간을 고를 수 있다
- AC-026.2: Given 줄 하나, When [연락함]을 누르면, Then 연락 표시를 `store.save`로 PC(`contact.dat`)에 저장하고 그 줄을 '연락함'으로 바꾼다. 브라우저 저장소는 쓰지 않는다
- AC-026.3: Given 명단, When [문구 복사]를 누르면, Then 그 명단 종류의 문자 문구를 채워 복사한다(REQ-025)
- AC-026.4: Given 연락 표시가 바뀜, When 저장되면, Then 남은 건수(오늘까지 날짜가 온 것 중 연락함이 아닌 것)를 `contact_counts {followup_left, injection_left}` 정수로 upsert하고, 밖에서 보는 건수에 마지막 바뀐 시각과 함께 보인다
- AC-026.5: Given `src/components/contact/rows/**`·`src/components/contact/**`·`src/app/(app)/contact/**`, When ESLint를 돌리면, Then 청구 화면과 같은 울타리(REQ-013의 화면 줄 울타리·오류 보고 패키지 금지)가 걸린다. 탭 줄에 목업 승인본 위치의 [환자 연락] 탭이 생긴다
- AC-026.6: Given 휴대폰이나 확장 없는 브라우저, When `/contact`를 열면, Then 명단 대신 연락 남은 건수만 보인다

### REQ-027: 통계 자료 읽기 (Phase 6 · Step 0 · helper-stats-read)
- AC-027.1: Given 기간, When `stats.rows`, Then 비트 '환자별 소모 통계'(47) 표 줄을 지금 파일 파서가 읽는 칸(처방코드·처방명칭·유형·처방일자·차트번호·초재진구분·외래/입원·주소)만으로, 처방 추세 사실(원본 `TrendDataSource`: 코드·날짜·차트번호·건수·소모량·금액·신환 여부)과 일 운영 숫자(원본 `OperationalReportData`: 날짜별 집계와 환불·변경수납·예치금 여부)를 조각으로 보낸다
- AC-027.2: Given 같은 가짜 자료를 파일과 도우미 줄 두 길로 넣음, When Worker가 `ConsumptionRow`로 바꿔 지금 `aggregate`에 넣으면, Then 두 결과가 같다(파일 올리기는 그대로 둔다)
- AC-027.3: Given 추세·운영 SQL, When `Sql.cs`를 원본과 비교하면, Then 공백만 다르다
- AC-027.4: Given 표·SQL 하나라도 실패, When `stats.rows`를 처리하면, Then 반쪽 자료를 보내지 않고 `error`를 보낸다

### REQ-028: 처방 추세 (Phase 6 · Step 1 · rx-trend)
- AC-028.1: Given 추세 사실, When `buildTrend({from, to, bucket, comparison, scope, codes})`, Then 원본 `TrendMath.Build`처럼 일·주·월 칸마다 건수·소모량·금액을 낸다. 원본 `TrendTests.cs`의 사례·기대값을 그대로 옮겨 통과한다
- AC-028.2: Given 비교 기간(원본 `TrendComparison`), When `comparisonRange`·`comparisonLabel`, Then 원본과 같은 기간·이름이다(원본 시험 사례)
- AC-028.3: Given 신환·재진 나눔(원본 `SplitByFirstVisit`), When 추세를 나누면, Then 원본과 같다. 금액은 원 단위 정수로 더하고 반올림하지 않는다
- AC-028.4: Given 파일 올리기 자료(금액·소모량 없음), When 추세를 만들면, Then 건수만 내고 금액·소모량은 `null`('자료 없음')이다

### REQ-029: 신환 30일 재방문 · 처방별 신환·재진 (Phase 6 · Step 2 · revisit-30)
- AC-029.1: Given `ConsumptionRow`, When `revisit30`, Then 신환 중 30일 안에 다른 날 다시 온 수·비율을 지금 7·14일과 같은 규칙(신환일과 다른 날, 첫 신환일만, 30일을 다 못 덮으면 '집계 중')으로 낸다
- AC-029.2: Given 신환, When 첫 재방문까지 날수를 세면, Then 원본 `CohortContracts`의 칸(7일 안·8~14일·15~30일·30일 넘음)으로 나눠 센다. 원본 `CohortTests.cs`의 사례·기대값을 옮겨 통과한다
- AC-029.3: Given 처방 코드 목록과 기간, When `rxVisitSplit`, Then 원본 `RxVisitSplit`·`rx_visit_split.py`의 `summarize`·`summarize_days`처럼 처방별 진료·환자·신환 수를 낸다(골든: Python 원본)
- AC-029.4: Given `rxVisitSplit` 결과, When `formatRxVisitSplit`·`headline`, Then 원본 Python과 같은 글이다(골든)

### REQ-030: 일일·월말 보고 문장 (Phase 6 · Step 3 · report-text)
- AC-030.1: Given 일 운영 숫자, When `formatReport(day | month)`, Then 원본 `reports.py`의 `format_report`·`report_notes`와 같은 글이다(골든)
- AC-030.2: Given 환불·변경수납·예치금이 있는 날, When 문장을 만들면, Then 원본처럼 그 날 금액만 '확인 필요'로 두고 나머지 숫자는 그대로 둔다
- AC-030.3: Given 오늘보다 뒤 날짜, When 만들려 하면, Then 원본처럼 만들지 않는다
- AC-030.4: Given `lib/report/reportText.ts`, When 입력 모양을 보면, Then 집계 숫자만 받는다(환자 줄·차트번호 칸이 없다)

### REQ-031: 통계 화면 추가분 (Phase 6 · Step 4 · stats-screen)
- AC-031.1: Given `/stats`, When 그리면, Then 목업 승인본처럼 처방 추세 그래프(일·주·월, 기간 비교, 건수·금액·소모량), 신환 30일 재방문과 첫 재방문 날수, 처방별 신환·재진, 보고 문장을 보인다. 탭 줄의 [통계]가 `/stats` 링크가 된다
- AC-031.2: Given 자료 고르기, When 비트 PC에서 [도우미에서 불러오기]를 누르면 `stats.rows`를, 파일을 끌어다 놓으면 지금 파일 길을 쓴다. 휴대폰·확장 없는 곳에서는 파일 길만 보인다
- AC-031.3: Given 보고 문장, When [문장 복사]를 누르면, Then 그 글을 복사한다. '확인 필요' 금액이 있으면 그 줄을 표시해 보인다
- AC-031.4: Given 파일 자료, When 추세를 그리면, Then 금액·소모량 자리에 "파일에는 금액·소모량이 없어요"를 보인다
- AC-031.5: Given 그래프, When 좋고 나쁨을 보이면, Then 색만 쓰지 않고 ▲▼나 글자를 같이 쓴다(UI_GUIDE)

### REQ-032: 백업에 설정 넣기 (Phase 7 · Step 0 · backup-settings)
- AC-032.1: Given [백업 내려받기], When 누르면, Then 내 병원의 `claim_rule_settings`·`claim_hospital_settings`·`message_templates` 줄을 브라우저에서 읽어 `{version, made_at, tables: {…}}` JSON 파일 하나로 내려받는다. 표 목록은 `lib/backup/tables.ts` 한 곳에 있고 다른 표는 나중에 더한다. 건수 표는 넣지 않는다(다시 계산됨)
- AC-032.2: Given 백업 JSON, When `restoreSql(backup)`로 만든 SQL을 빈 DB(PGlite, 같은 마이그레이션)에 운영자처럼 돌리면, Then 같은 줄이 되살아난다(되돌려 넣기 시험). 값에 `'`·`$$`·`;`·`\`·줄바꿈·`--`가 들어 있어도 글자 칸은 바이트까지 같게, jsonb 칸은 같은 값으로 되살아나고 그 값이 SQL로 돌지 않는다(시험: `'); drop table public.hospitals; --`가 든 문구를 되살려도 다른 표가 그대로이고 값이 글자로 들어간다). 값 감싸기는 design.md 8-4의 한 가지 방법만 쓴다
- AC-032.3: Given 백업 파일, When 내용을 보면, Then 설정 표 칸만 있고 환자 정보·건수·기관기호가 없다
- AC-032.4: Given 읽기 실패, When 누르면, Then 파일을 만들지 않고 `E-BACKUP-FAILED`를 보인다

### REQ-034: b2b 개편 합치기 맞춤 (Phase 1 끝 · b2b-merge, plan.md §6 밖)
- AC-034.1: Given `origin/main`(b2b 개편 포함)을 합친 뒤의 `TabBar`, When 어느 화면에서 그리면, Then 탭 모양은 b2b AC-218.2와 같고(44px·좌우 12px·body, 기본 ink-2 500 → 올림 ink, 준비 중 faint, 지금 탭 ink 600 + 아래 2px accent 밑줄 `after:inset-x-3 after:h-0.5`, 툴팁 `rounded-float`·`shadow-float`) 지금 탭 판단은 청구 그대로다(`menu.ts`의 `currentMenuLabel`: `/claim`·`/claim/close`는 [청구], `/claim/setup`은 [설정] 자리, [관리자]는 `isUnder`). 지금 화면이 속한 준비 중 탭(`/claim/setup`의 [설정])은 누를 수 없는 단추(`aria-disabled`·'준비 중' 툴팁) 그대로이면서 `aria-current="page"`와 지금 탭 모양(`text-ink font-semibold after:bg-accent`)을 갖고, `text-faint`·`text-ink-2`·`font-medium`이 없다. 탭 순서·이름은 지금 청구 그대로다(청구는 매출 뒤). `TabBar.tsx`에 "teal" 글자가 없다(b2b `src/comments.test.ts`). 시험: `shell.test.tsx`의 청구 AC-006.4 `it`들은 모양 기대값을 b2b 지금 탭 클래스로 고치고 이름에 AC-034.1을 더한다(그 밖의 본문은 그대로). main 쪽이 갈라진 뒤 고치거나 더한 `it`은 고치지 않고 통과한다(TASK-34 금지사항)
- AC-034.2: Given `/claim/setup`의 설정 안 메뉴(nav "설정 안 메뉴"), When 그리면, Then b2b 관리자 화면 안 탭(AC-220.1, `AdminApplications`)과 같은 모양이다: 줄 아래 1px line, 항목 40px(768px 미만 44px)·좌우 12px·body·`rounded-control`, 첫 항목은 왼쪽으로 12px 당김(`first:-ml-3`), 기본 ink-2 500(올림 ink), 지금 [비트 연결](`aria-current="page"`)은 ink 600 + 아래 2px accent 밑줄(`after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-accent`), 키보드 초점은 안쪽 2px accent 고리. 설정 화면이 아직 없으면 [청구·연락]은 링크가 아니고(`aria-disabled`) 기본 모양(올림 변화 없음)에 `ds.chip.neutral` "준비 중"이 붙는다. `font-bold`·`text-accent`·3px 밑줄(`after:h-0.75`)이 없다. 시험: `SetupScreen.test.tsx`
- AC-034.3: Given 시험 파일 밖 `src/components/claim/**`(설치 화면 `SetupScreen`·`SetupAlert`·`StepGuide`·`ClaimEntry`), When 읽으면, Then b2b 옛 이름 규칙(AC-221.1)과 굵기 규칙(AC-203.3)을 지킨다: `components/ui/classes`에서 `ds`만 불러오고 `ui.`가 없다. 옛 Tailwind 이름(`rounded-card`·`rounded-chip`·`text-table`·`text-tab`·`text-panel`·`text-title-sm`·`*-danger`·`*-danger-soft`·`*-ok`·`*-ok-soft`·`*-warn`)이 없고 굵기는 400·500·600뿐이다(`font-bold`·`font-extrabold`·`font-black`·`font-light` 등 없음). 옮기는 짝은 design.md 18-3 표 하나다. 문구·동작은 그대로다. 시험: `src/b2b-merge.test.ts`(청구 폴더만 본다). 같은 규칙을 `src/` 전체에서 보는 b2b `src/app/theme.test.ts`·`src/components/ui/classes.test.ts`·`src/app/fonts.test.ts`도 한 글자도 고치지 않고 통과한다(대시보드 두 폴더 예외도 그대로)
- AC-034.4: Given 합친 뒤 `docs/ADR.md`, When 제목 줄(`### ADR-NNN:`)을 읽으면, Then 번호가 한 번씩이고 오름차순이다. ADR-016은 청구(크롬 확장 + 도우미), ADR-017~019는 main이 가져온 b2b 쪽 것(E2E·랜딩 개편·디자인 토큰) 그대로, 청구의 옛 ADR-017·018·019는 ADR-020·021·022다(제목·본문 그대로, 본문 안 번호 인용만 새 번호). `docs/ADR.md` 맨 위 안내 줄의 청구 범위는 "ADR-016·020~022는 2026-10-30 청구 사전점검"이고, '철학'의 §10 줄("사용자가 다시 꺼낸 것만 넣는다")은 ADR-022를 가리킨다(ADR-019가 아니다). 청구만 쓰는 파일(`eslint.config.mjs`·`src/lib/bridge/extensionId.ts`·`src/lib/csp.test.ts`·`phases/precheck-*/*.md`)에는 ADR-017·018·019 인용이 없다. 섞인 문서(`CLAUDE.md`·`docs/ARCHITECTURE.md`·`plan.md`)에서 ADR-017·018·019를 가리키는 줄에는 청구 낱말(청구·도우미·비트·`lib/bridge`)이 없다(그 줄은 b2b 쪽 인용이다). 범위·나열 글(`ADR-016~019`·`ADR-017·018`)은 펼쳐서 본다. 시험: `src/b2b-merge.test.ts`
- AC-034.5: Given 합친 뒤 설정 파일, When 읽고 돌리면, Then 두 쪽이 다 산다: `package.json` scripts에 main 쪽 `e2e`·`e2e:env`와 청구 `ext:build`가 값 그대로 있고(패키지·버전은 두 쪽 그대로, 새 패키지 없음), `vitest.config.ts`의 `include`는 두 쪽 합(`src/**/*.test.{ts,tsx}`·`fixtures/**/*.test.ts`·`supabase/**/*.test.ts`·`e2e/**/*.test.ts`·`helper/tests/*.test.ts`·`extension/**/*.test.ts`)이며 `e2e/**/*.spec.ts`는 잡지 않는다. `CLAUDE.md` 기술 줄에 b2b 스타일링 줄(토큰은 `globals.css` `:root` 한 곳·Pretendard, ADR-019)과 청구 줄(ADR-016)이 둘 다 있다. 시험: `src/b2b-merge.test.ts`, 그리고 main 쪽 `e2e/config.test.ts`와 청구 `extension/src/manifest.test.ts`(AC-003.8 `npm run ext:build`)가 고치지 않고 통과한다

## 범위 밖
- 팀장 도구(아침 브리핑·법정 점검·교육·재고·유효기간·근무·연차·일일 마감·목표·치료 회차), 구매·운영, 지식·안내(고시 검색·원무 안내·정책 소식), 원장님 잠금, 원격 PC 목록, 자리 비움 잠금 (PRD 5, 사용자)
- 비상용 화면·오프라인 길: 인터넷이나 서버가 멈추면 기다린다 (사용자)
- 비트에 이미 있는 다른 메모 덮어쓰기(원본의 개별 승인 덮어쓰기), 원본 필터 단추 편집, 원본 기간 묶음 입력 다리(`range_bridge`)의 저장 안 한 처방 창 자동 누르기
- 문자 자동 발송, 직원 계정·권한 나누기, 엣지 시험, 도우미 서명
- 통계 기본 화면(신환·재진 수, 7·14일 재방문 등의 화면)은 통계 명세가 따로 만든다. 이 명세는 추가분만
- 백업 되살리기 화면(SQL로만), 백업에 다른 기능 표 넣기
- Phase 0 Step 2·3(목업·Step 파일)은 이 명세 밖이다(문서 작업)
- 탭 순서·이름 다시 짜기(따로 `tab-frame` 명세). REQ-034는 b2b 모양만 입히고 순서·이름·링크는 그대로 둔다
- 청구 화면 폴더를 b2b 모양 규칙 시험(`classes.test.ts`의 AC-204.6 간격·모서리 검사 목록, AC-204.7 상자 안 상자)에 넣기: 청구 화면을 다시 디자인할 때 한다(사용자 2026-10-31 "청구 화면은 나중에 다시 디자인"). 옛 이름·`ds`만·굵기 검사(AC-221.1·AC-203.3)는 `src/` 전체를 보므로 지금도 걸린다
- TASK-34로 합친 뒤 main에 더 들어오는 것과의 충돌: 그때 따로 명세를 고친다

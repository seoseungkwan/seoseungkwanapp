# Step 1: helper-build

> **TASK-2** 도우미 윈도우 빌드 · 설치 파일 · **REQ-002** · AC-002.1 ~ AC-002.5
> Phase 1 `precheck-1-helper` · Step 1 — `docs/precheck/plan.md` §6
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-2 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-002에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-002.1**: `.github/workflows/helper.yml`은 `helper/**`·`extension/**`·`src/lib/bridge/commands.json`·자기 파일이 바뀐 push, `workflow_dispatch`, 태그 `helper-v*`에 돈다. `windows-latest`에서 `dotnet test`(Core·Windows 시험 전부)를 먼저 돌린 뒤에만 빌드·zip을 만든다
- **AC-002.2**: 기본 권한 `contents: read`. `contents: write`는 태그 때 릴리스 일에만. `secrets.`를 쓰지 않는다. action은 버전 고정(`@main`·`@master` 없음)
- **AC-002.3**: `helper/install/host-manifest.json` 틀은 `name`(`com.seoseungkwan.precheck`)·`description`·`path`·`type: "stdio"`·`allowed_origins`만 있고, `allowed_origins`는 우리 확장 하나, 와일드카드 없음
- **AC-002.4**: `install.ps1`은 관리자 권한 없이 `%LOCALAPPDATA%\Seoseungkwan\PrecheckHelper\`에 파일을 두고 `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.seoseungkwan.precheck`에 등록 파일 경로를 쓴다. 돌던 도우미를 먼저 끝내고 덮어쓴다. `data\`는 지우지 않는다. `uninstall.ps1`은 등록과 프로그램 파일을 지우고 `data\`는 물어본 뒤에만 지운다
- **AC-002.5**: zip 이름은 `precheck-helper-<Version>.zip`, `<Version>`은 `Directory.Build.props`와 같다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·017·018·019
- `/docs/precheck/plan.md` §6 (Phase·Step 순서)
- `/specs/precheck/requirements.md` — REQ-002
- `/specs/precheck/design.md` — 12절(GitHub Actions 윈도우 빌드), 9-3절(작업 저장 폴더 `data\`), 13절(운영·업데이트), 16절(위험: FlaUI net48)
- `/specs/precheck/tasks.md` — TASK-2 (수정 범위·메모)
- 이전 step에서 만든 파일:
  - `helper/Directory.Build.props`(Version), `helper/Precheck.sln`, `helper/src/*/*.csproj` (Step 0)
  - `src/lib/bridge/commands.json`(`hostName`·`extensionId`) (Step 0)
  - `helper/tests/runDotnet.ts` (Step 0)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 브랜치 `main`, 폴더 `YangjiBareun_사전점검/`, 커밋 `2a1069b` (README 1.24.5)
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 이 사본은 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다(GitHub 비교로 확인). 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`·`*Tests.cs`)은 모두 가짜 자료다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `tools/build_secure_bridge.ps1`·`build.ps1`: 원본이 net48 C#을 빌드·묶는 방식(참고만). 설치 방식(네이티브 메시징 등록)은 원본에 없어 새로 만든다

## 수정 범위 (tasks.md TASK-2)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `.github/workflows/helper.yml`
  - `helper/install/install.cmd`
  - `helper/install/install.ps1`
  - `helper/install/uninstall.ps1`
  - `helper/install/host-manifest.json`
  - `helper/install/README.md`
- Tests:
  - `helper/tests/build.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **비밀값**: 키·토큰 값을 코드·시험 이름·로그·출력에 남기지 않는다. `NEXT_PUBLIC_*`에 비밀값을 넣지 않는다. service role 키를 두지 않는다 (CLAUDE.md 보안 규칙)
- **C# 나누기**: 플랫폼과 상관없는 것은 `Precheck.Core`(netstandard2.0)에 두고 이 서버에서 `dotnet test -f net10.0`으로 시험한다. 윈도우 전용(비트 DLL·FlaUI·DPAPI·WinForms 창·레지스트리)은 `Precheck.Windows`(net48)에 얇게 두고 Actions 윈도우와 의원 PC에서 확인한다. NuGet 판은 정확한 버전으로 고정한다(범위·`*` 없음). 비트 DLL은 함께 싣지 않고 의원 PC의 `C:\DrBIT50\EXE`에서 불러온다 (ADR-016, design.md 14절)

## 작업

### 1. 시험 `helper/tests/build.test.ts` (먼저)
- workflow·설치 파일을 **글자로 읽어** 검사한다(YAML 해석 패키지를 새로 넣지 않는다. `package.json`은 이 TASK 수정 범위 밖이다). 줄 단위 정규식이나 들여쓰기 기준으로 `on:`·`permissions:`·`jobs:` 아래를 본다
- 검사: 트리거 경로 4개·`workflow_dispatch`·태그 `helper-v*` (AC-002.1), `helper` 일 `runs-on: windows-latest`에서 `dotnet test` 단계가 빌드·zip 단계보다 앞 (AC-002.1), 최상위 `permissions: contents: read`, `contents: write`는 태그 조건이 붙은 릴리스 일에만, `secrets.` 글자 없음, 모든 `uses:`가 `@v<숫자>` 또는 40자 커밋 해시 (AC-002.2), `host-manifest.json` 칸 5개뿐·`name`·`type`·`allowed_origins == ["chrome-extension://<commands.json extensionId>/"]` (AC-002.3), `install.ps1`에 `LOCALAPPDATA`·`HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.seoseungkwan.precheck`·도우미 프로세스 끝내기·`data` 폴더 보존, 관리자 권한 요구(`#Requires -RunAsAdministrator`·`HKLM`) 없음, `uninstall.ps1`이 `data` 지우기 전에 묻기 (AC-002.4), zip 이름 `precheck-helper-` + `Directory.Build.props`의 Version (AC-002.5)

### 2. `.github/workflows/helper.yml`
- `on`: `push`(paths: `helper/**`, `extension/**`, `src/lib/bridge/commands.json`, `.github/workflows/helper.yml`) · `workflow_dispatch` · `push.tags: ['helper-v*']`
- 최상위 `permissions: contents: read`
- `helper` 일(`windows-latest`): `actions/checkout@v4` → `actions/setup-dotnet@v4`(`10.x`) → `dotnet test helper/Precheck.sln -c Release`(지금은 Core 시험뿐, TASK-5부터 Windows 시험이 더해진다) → `dotnet build helper/Precheck.sln -c Release` → `Directory.Build.props`에서 Version을 읽어(PowerShell `[xml]`) `precheck-helper-<Version>.zip`(exe·DLL·`helper/install/*`) → `actions/upload-artifact@v4`
- `release` 일: `if: startsWith(github.ref, 'refs/tags/helper-v')`, `needs: helper`, 이 일에만 `permissions: contents: write`. zip을 받아 GitHub 릴리스를 만든다(`gh release create`는 `GITHUB_TOKEN` 기본값으로. `secrets.`를 글로 쓰지 않는다 — `env: GH_TOKEN: ${{ github.token }}`)
- `extension` 일은 TASK-3이 더한다(지금 만들지 않는다)

### 3. 설치 파일 `helper/install/`
- `host-manifest.json`(틀): `{"name":"com.seoseungkwan.precheck","description":"청구 사전점검 도우미","path":"__HELPER_EXE__","type":"stdio","allowed_origins":["chrome-extension://<extensionId>/"]}`. `path`는 설치 때 채운다
- `install.cmd`: `powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"` 한 줄
- `install.ps1`: (1) 돌던 `Precheck.Helper.exe`를 끝낸다 (2) `%LOCALAPPDATA%\Seoseungkwan\PrecheckHelper\`에 프로그램 파일을 덮어쓴다(`data\`는 그대로) (3) 틀의 `path`를 실제 exe 경로로 채운 등록 파일을 그 폴더에 쓴다 (4) `HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.seoseungkwan.precheck` 기본값에 등록 파일 경로를 쓴다. 관리자 권한을 요구하지 않는다
- `uninstall.ps1`: 등록 키와 프로그램 파일을 지우고, `data\`는 "고치던 메모·완료 표시가 지워집니다. 지울까요?"를 물어 '예'일 때만 지운다
- `README.md`: 쉬운 말 설치 순서. 서명하지 않은 프로그램이라 처음 실행 때 SmartScreen 경고가 뜬다 → "추가 정보 → 실행". 크롬을 다시 켤 필요가 있는지도 적는다

### 4. Actions 실제 실행 확인 (step 세션 밖)
- tasks.md 끝 조건은 "Actions 윈도우에서 한 번 돌아 zip이 artifact로 올라간다"다. 이것은 push가 있어야 돈다. step 세션은 push하지 않는다
- 이 step은 로컬 AC(위 시험)까지 하고, summary 끝에 `[Actions 확인 남음]`을 적는다. 메인 세션이 feature 브랜치를 push한 뒤 `gh run list --workflow helper.yml --branch feat-precheck`·`gh run watch`로 확인한다
- 실패 원인이 net48·FlaUI 빌드(design.md 16절)면 메인 세션이 사용자에게 알린다(런타임을 바꾸는 큰 결정)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.3 chrome.runtime이 없으면 no-extension', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-2 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-2 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run helper/tests/build.test.ts                    # AC-002.1~AC-002.5
python3 -m json.tool helper/install/host-manifest.json > /dev/null
grep -n "secrets\." .github/workflows/helper.yml && exit 1 || true   # 비밀값 안 씀
python3 ~/.claude/harness/bin/tdd-run TASK-2 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
# push 뒤(메인 세션): gh run list --workflow helper.yml --branch feat-precheck --limit 1
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-002.1 ~ AC-002.5이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/precheck-1-helper/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- workflow에 `secrets.`·개인 토큰·서명 인증서를 넣지 마라. 이유: AC-002.2. 서명하지 않기로 했고(ADR-016), 비밀값이 로그에 남을 길을 만들지 않는다
- `uses: …@main`·`@master`처럼 움직이는 판을 쓰지 마라. 이유: 남이 바꾼 action 코드가 우리 빌드에서 돌 수 있다(AC-002.2)
- `install.ps1`이 `HKLM`이나 관리자 권한을 쓰게 하지 마라. 이유: 의원 PC 사용자는 관리자가 아닐 수 있다. 사용자 범위(`HKCU`)만으로 크롬이 도우미를 찾는다(AC-002.4)
- 설치·업데이트 때 `data\` 폴더를 지우거나 덮어쓰지 마라. 이유: 고치던 메모·완료 표시·등록 정보가 그 안에 있다(design.md 9-3)
- YAML 해석 패키지를 새로 넣지 마라. 이유: `package.json`은 이 TASK 수정 범위 밖이다. 글자 검사로 충분하다
- 기존 테스트를 깨뜨리지 마라. 이유: 새 workflow 파일만 더하는 step이다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다

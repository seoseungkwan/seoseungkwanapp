# Step 0: helper-skeleton

> **TASK-1** 도우미 뼈대 · 메시지 틀 · **REQ-001** · AC-001.1 ~ AC-001.6
> Phase 1 `precheck-1-helper` · Step 0 — `docs/precheck/plan.md` §6
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-1 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-001에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-001.1**: 앞 4바이트(리틀 엔디언) 길이 + UTF-8 JSON을 표준 입력에서 읽어 봉투 `{v, id, cmd, args}`로 푼다. 길이 0·64MiB 넘음·JSON이나 봉투 모양이 틀리면 `E-HELPER-BAD-MESSAGE`로 답하고 다음 메시지를 기다린다(끝나지 않는다). 표준 입력이 닫히면 끝난다
- **AC-001.2**: 명령 표 `src/lib/bridge/commands.json`에 없는 `cmd`면 `E-HELPER-UNKNOWN-COMMAND`, `args`에 모르는 칸·틀린 종류·범위 밖 값이 있으면 `E-HELPER-BAD-MESSAGE`. 둘 다 아무 일도 하지 않는다. 도우미가 쓰는 명령 표는 그 JSON과 같다(시험이 비교)
- **AC-001.3**: 크롬이 넘긴 호출 origin 인자가 `chrome-extension://<EXTENSION_ID>/`가 아니면 메시지를 하나도 처리하지 않고 끝난다
- **AC-001.4**: `hello` → `result {helperVersion, protocol}`. `helperVersion`은 `Directory.Build.props`의 `Version`, `protocol`은 `commands.json`의 `protocol`(처음 1)
- **AC-001.5**: 환자 자료 명령의 답은 크기와 상관없이 메시지마다 머리 포함 1,000,000바이트 이하가 되게 `chunk`(`seq` 0부터)로 나누고 마지막에 `end {count, bytes, sha256}`. 조각을 이으면 원래 글자와 바이트까지 같다(한글·이모지·따옴표가 경계에 와도)
- **AC-001.6**: 표준 출력에는 메시지 틀만, 진단 기록(파일)에는 시각·명령 이름·오류 번호만. 환자 자료·메모·차트번호는 어디에도 쓰지 않는다(시험: 가짜 환자 글자가 기록에 없음)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·017·018·019
- `/docs/precheck/plan.md` §6 (Phase·Step 순서)
- `/specs/precheck/requirements.md` — REQ-001
- `/specs/precheck/design.md` — 3절(`helper/` 폴더), 4절(메시지 약속 4-1~4-5), 11절(시험 방법), 14절(새 패키지·도구)
- `/specs/precheck/tasks.md` — TASK-1 (수정 범위·메모)
- `/vitest.config.ts`, `/tsconfig.json`, `/.gitignore` (이 step에서 고친다)
- 이전 step에서 만든 파일:
  - (이 Phase의 첫 step이다. 이전 step이 만든 파일은 없다)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 브랜치 `main`, 폴더 `YangjiBareun_사전점검/`, 커밋 `2a1069b` (README 1.24.5)
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 이 사본은 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다(GitHub 비교로 확인). 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`·`*Tests.cs`)은 모두 가짜 자료다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - 원본에는 네이티브 메시징 코드가 없다(원본은 열린 포트 다리였다). 메시지 틀은 새로 만든다
  - `vendor/secure_bridge/SecureBridge.csproj`: net48 프로젝트와 NuGet 고정 방식을 볼 때만 참고

## 수정 범위 (tasks.md TASK-1)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `helper/Precheck.sln`
  - `helper/Directory.Build.props`
  - `helper/.editorconfig`
  - `helper/src/Precheck.Core/Precheck.Core.csproj`
  - `helper/src/Precheck.Core/Protocol/*`
  - `helper/src/Precheck.Helper/Precheck.Helper.csproj`
  - `helper/src/Precheck.Helper/Program.cs`
  - `helper/src/Precheck.Helper/DiagnosticLog.cs`
  - `helper/tests/Precheck.Core.Tests/Precheck.Core.Tests.csproj`
  - `helper/tests/Precheck.Core.Tests/Protocol/*`
  - `helper/tests/runDotnet.ts`
  - `src/lib/bridge/commands.json`
  - `vitest.config.ts`
  - `tsconfig.json`
  - `.gitignore`
- Tests:
  - `helper/tests/protocol.dotnet.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **1MB 나눠 보내기**: 도우미 → 크롬 메시지 하나는 앞 4바이트 길이를 포함해 1,000,000바이트 이하다(크롬 한도 1MB). 환자 자료 명령(명령 표 `patient: true`)의 답은 작아도 늘 `chunk`(`seq` 0부터) … `end {count, bytes, sha256}`로 보낸다. 자료를 다 만든 뒤에 나눈다. 도중에 실패하면 `end` 대신 `error`를 보내고 반쪽 자료를 보내지 않는다 (design.md 4절, AC-001.5)
- **도우미 기록**: 표준 출력에는 메시지 틀만 쓴다. 진단 기록에는 시각·명령 이름·오류 번호만 남긴다. 환자 자료·메모·차트번호·이름·전화를 어디에도(기록·예외 메시지·창 제목) 쓰지 않는다 (AC-001.6)
- **C# 나누기**: 플랫폼과 상관없는 것은 `Precheck.Core`(netstandard2.0)에 두고 이 서버에서 `dotnet test -f net10.0`으로 시험한다. 윈도우 전용(비트 DLL·FlaUI·DPAPI·WinForms 창·레지스트리)은 `Precheck.Windows`(net48)에 얇게 두고 Actions 윈도우와 의원 PC에서 확인한다. NuGet 판은 정확한 버전으로 고정한다(범위·`*` 없음). 비트 DLL은 함께 싣지 않고 의원 PC의 `C:\DrBIT50\EXE`에서 불러온다 (ADR-016, design.md 14절)
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험은 `fixtures/`의 가짜 자료만 쓴다(이름 '가상환자NN', 차트번호 `9`로 시작하는 6자리, 전화 `010-0000-NNNN`). 실제 비트 내보내기·청구 파일(`*.GHP`·`*.CAR`)을 커밋하지 않는다 (CLAUDE.md, design.md 10절)

## 작업

### 0. 준비: .NET 10 SDK (관리자 권한 없이)
- `dotnet`이 없으면 `~/.dotnet`에 설치한다: 임시 폴더(`mktemp -d`)에 `https://dot.net/v1/dotnet-install.sh`를 받아 `bash <그 파일> --channel 10.0 --install-dir "$HOME/.dotnet"`. 그 뒤 `export PATH="$HOME/.dotnet:$PATH"; dotnet --version`
- 설치할 수 없으면(네트워크·권한) `blocked`(사유: 이 서버에 .NET 10 SDK 설치 필요)로 멈춘다

### 1. 설정 파일 (RED 전에 고쳐도 되는 파일)
- `vitest.config.ts`: `test.include`에 `'helper/tests/*.test.ts'`, `'extension/**/*.test.ts'`를 더한다(TASK-3이 쓸 자리도 지금 연다)
- `tsconfig.json`: `exclude`에 `"extension"`, `"helper"`를 더한다(확장은 자기 tsconfig로, 도우미는 C#)
- `.gitignore`: `helper/**/bin/`, `helper/**/obj/`

### 2. 명령 표 `src/lib/bridge/commands.json` (이 TASK에서만 고칠 수 있다)
- 다른 TASK의 수정 범위에 이 파일이 없다. 그래서 **12개 명령 모두의 `args` 모양을 지금 정한다**. 확장(TASK-3)·도우미·웹 통로(TASK-4)가 같은 파일을 읽는다
- 모양:
```json
{
  "protocol": 1,
  "hostName": "com.seoseungkwan.precheck",
  "origin": "https://seoseungkwanapp.vercel.app",
  "extensionId": "<32자, a~p>",
  "extensionKey": "<manifest key로 쓸 공개키 base64>",
  "commands": {
    "hello": { "patient": false, "args": {} },
    "claim.month": { "patient": true, "args": { "from": { "type": "date" }, "to": { "type": "date" } }, "maxDays": 400 }
  }
}
```
- 명령 12개(design.md 4-3)와 `args`(칸 이름·종류·범위). 모르는 칸은 거절한다
  - `hello`·`bit.check`·`bit.register`: `{}` (`patient: false`)
  - `claim.dates`: `{from, to}` 날짜, 400일 이하 (`patient: false`, 숫자만 답)
  - `claim.month`·`claim.memos`: `{from, to}` 날짜, 400일 이하, 달을 넘겨도 됨 (`patient: true`)
  - `store.load`: `{months?: "YYYY-MM"[] (1~24개), settings?: boolean, contact?: boolean}` (`patient: true`)
  - `store.save`: `{month?: "YYYY-MM", drafts?: object, done?: object, journal?: object, contact?: object, settings?: object}` (`patient: true`, 보내는 쪽). 칸 안쪽 모양은 TASK-15가 검사한다
  - `bit.input`: `{items: [{visitKey: string(1~64), chart: /^[0-9]{1,20}$/, name: string(1~100), date: 날짜, memo: string(1~32000)}] (1~500개)}` (`patient: true`, 확인 창)
  - `sam.latest`: `{}` (원본 `latest_sam_files(root, institution_code)`도 달 인자가 없다) (`patient: true`)
  - `contact.targets`: `{kind: "followup" | "injection", from, to}` 날짜. 표의 최대 기간은 1,100일(정기 주사 36개월)이고, F/U 120일은 TASK-23 처리기가 한 번 더 막는다 (`patient: true`)
  - `stats.rows`: `{from, to}` 날짜, 800일 이하(추세 비교 기간까지 한 번에 읽게, Claude 판단) (`patient: true`)
- 칸 종류는 작게 정한다: `date`(`YYYY-MM-DD`, 실제 있는 날), `month`(`YYYY-MM`), `int{min,max}`, `string{min,max,pattern}`, `bool`, `enum`, `array{items,min,max}`, `object{fields}`, `json`(안쪽은 처리기가 검사). 기간 명령은 `from ≤ to`와 `maxDays`를 검사한다
- `origin`은 운영 주소 `https://seoseungkwanapp.vercel.app` 하나다(2026-10-29 배포). 개발용 localhost는 넣지 않는다(AC-003.1: origin 하나)
- `extensionId`·`extensionKey`: 개발용 키 쌍을 임시 폴더에서 만든다(`openssl genrsa 2048` → 공개키 DER → base64가 `extensionKey`, DER의 SHA-256 앞 32 hex 글자를 `0-9a-f` → `a-p`로 바꾼 것이 `extensionId`). **개인키는 저장소에 두지 말고 지운다**(크롬 웹스토어가 서명하므로 필요 없다). 공개키는 비밀이 아니다. TASK-3이 manifest `key`에 같은 값을 넣는다. 웹스토어 등록 뒤 대시보드의 공개키로 바꿀 때는 두 칸을 같은 커밋에서 같이 바꾼다
  - `extensionKey`는 design.md 4-3에 있는 칸이다. TASK-3이 이 파일을 고칠 수 없어서 TASK-1에서 미리 채운다

### 3. C# 뼈대 (`helper/`)
- `Directory.Build.props`: `<Version>0.1.0</Version>`(버전은 이 한 곳), `LangVersion`, `Nullable`, `Deterministic`
- `Precheck.Core.csproj`: `netstandard2.0`. `System.Text.Json` 정확한 버전. `../../../src/lib/bridge/commands.json`을 `EmbeddedResource`(`LogicalName="commands.json"`)로 싣는다
- `Precheck.Helper.csproj`: `net48` exe. `Microsoft.NETFramework.ReferenceAssemblies`(빌드용, `PrivateAssets=all`). Core를 참조
- `Precheck.Core.Tests.csproj`: `TargetFrameworks` `net10.0;net48`. `xunit`·`xunit.runner.visualstudio`·`Microsoft.NET.Test.Sdk`·참조 어셈블리 — 모두 정확한 버전. 이 서버에서는 `-f net10.0`만 돈다
- `Precheck.sln`: 세 프로젝트

### 4. `Precheck.Core/Protocol/` (시그니처, 안쪽은 재량)
```csharp
namespace Precheck.Core.Protocol {
  public static class Framing {
    public const int MaxIncoming = 64 * 1024 * 1024;   // 크롬 → 도우미
    public const int MaxOutgoing = 1_000_000;          // 도우미 → 크롬, 머리 4바이트 포함
    public static byte[]? ReadMessage(Stream input);   // null = 표준 입력 닫힘. 길이 0·초과는 ProtocolException("E-HELPER-BAD-MESSAGE")
    public static void WriteMessage(Stream output, byte[] utf8Json); // MaxOutgoing을 넘으면 던진다(쓰지 않는다)
  }
  public sealed class Request { public int V; public string Id; public string Cmd; public JsonElement Args; }
  public static class Envelope {
    public static Request Parse(byte[] utf8Json);                       // 틀리면 ProtocolException
    public static byte[] Result(string id, object data);
    public static byte[] Error(string id, string code);                 // code는 'E-…'만
    public static byte[] Progress(string id, int done, int total);
  }
  public sealed class CommandTable {
    public static CommandTable LoadEmbedded();
    public int Protocol { get; } public string ExtensionId { get; } public string Origin { get; }
    public bool Has(string cmd); public bool IsPatient(string cmd);
    public void Validate(Request r);   // E-HELPER-UNKNOWN-COMMAND / E-HELPER-BAD-MESSAGE
  }
  public static class Chunker { public static IEnumerable<byte[]> Split(string id, string json); } // chunk… 다음 end
  public static class OriginGuard { public static bool IsAllowed(string[] args, CommandTable table); }
  public interface IReplySink { void Send(byte[] utf8Json); }
  public sealed class Dispatcher {
    public void Register(string cmd, Action<Request, IReplySink> handler);
    public void Handle(byte[] message, IReplySink sink);   // 표에 있지만 처리기가 아직 없으면 E-HELPER-UNKNOWN-COMMAND
  }
  public static class HelperVersion { public static string Value { get; } } // 어셈블리 버전(= Directory.Build.props)
  public static class LogLine { public static string Format(DateTimeOffset at, string? cmd, string? code); }
}
```
- **크기는 직렬화한 뒤 바이트로 잰다.** 조각 글자는 JSON 안에서 이스케이프된다(`"`·`\`·제어 문자, 그리고 System.Text.Json 기본 인코더는 한글을 `\uXXXX`로 바꿔 6배가 된다). 그래서 봉투까지 만든 뒤 4바이트 머리 + 본문이 1,000,000 이하인지 확인하고, 넘으면 조각을 더 작게 자른다. 자르는 자리는 UTF-16 대리쌍·UTF-8 글자 중간이 아니어야 한다
- `end.bytes` = 원래 JSON 글자의 UTF-8 바이트 수, `end.sha256` = 그 바이트의 SHA-256 **소문자 hex 64자**(TASK-9 Worker가 같은 방식으로 맞춘다)
- `LogLine`: 명령 이름은 표에 있는 이름만 쓰고, 표에 없으면 `"unknown"`으로 쓴다(모르는 `cmd` 글자에 환자 글자가 섞여 올 수 있다). 요청 `id`·`args`는 쓰지 않는다

### 5. `Precheck.Helper` (net48 exe, 얇게)
- `Program.Main(string[] args)`: `OriginGuard`가 아니면 바로 끝 → 표준 입력 고리(`Framing.ReadMessage` → `Dispatcher.Handle`) → 표준 입력이 닫히면 끝. 표준 출력은 `Framing.WriteMessage`만 쓴다(`Console.WriteLine` 금지)
- `DiagnosticLog`: `%LOCALAPPDATA%\Seoseungkwan\PrecheckHelper\logs\`에 `LogLine.Format` 한 줄씩. 예외 메시지를 그대로 쓰지 않는다
- `hello` 처리기만 둔다(다른 명령은 뒤 TASK가 `Commands/`에 더한다)

### 6. `helper/tests/runDotnet.ts`
```ts
export function runDotnet(filter: string, opts?: { timeoutMs?: number }): { code: number; output: string }
```
- `dotnet`을 `PATH`와 `$HOME/.dotnet/dotnet`에서 찾고, 없으면 `E-NO-DOTNET` 오류를 던진다
- `dotnet test helper/tests/Precheck.Core.Tests -f net10.0 --filter "FullyQualifiedName~<filter>"`를 부른다
- 잠금 폴더(예: `os.tmpdir()/precheck-dotnet.lock`, `mkdir`으로 잡고 끝나면 지움)로 한 번에 하나만 돈다. vitest가 감싸개 파일을 나란히 돌려도 `dotnet build`가 부딪히지 않게

### 7. 시험 (먼저 쓴다)
- `helper/tests/Precheck.Core.Tests/Protocol/*.test.cs`: 틀 읽기·쓰기(길이 0, 64MiB+1, 깨진 JSON, 봉투 칸 빠짐, 끝난 입력), 명령 표 검사(모르는 cmd, 모르는 칸, 틀린 종류, 400일 넘는 기간, 500개 넘는 묶음), 도우미 표 = `src/lib/bridge/commands.json`(파일을 읽어 비교), origin 거절, `hello` 버전, 나누기(한글·이모지·따옴표·역슬래시가 경계에 오는 글, 3MB 글, 빈 글 → 메시지마다 ≤1,000,000, 이으면 같음, `end` 값 맞음), 기록 줄에 가짜 환자 글자('가상환자01'·`900001`)가 없음
- `helper/tests/protocol.dotnet.test.ts`: AC마다 `it('AC-001.x …', () => expect(runDotnet('Precheck.Core.Tests.Protocol').code).toBe(0))`처럼 AC ID를 이름에 넣는다

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.3 chrome.runtime이 없으면 no-extension', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-1 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-1 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

- C# 시험 파일 이름은 `*.test.cs`다(예: `helper/tests/Precheck.Core.Tests/Protocol/Framing.test.cs`, 하네스가 시험 파일로 알아본다). xUnit 이름에 AC ID를 넣는다: `[Fact(DisplayName = "AC-001.1 길이 0이면 E-HELPER-BAD-MESSAGE")]`
- 하네스 TDD 기록은 vitest 감싸개 `helper/tests/protocol.dotnet.test.ts`로 남긴다. 감싸개는 `helper/tests/runDotnet.ts`의 `runDotnet('<시험 클래스나 이름공간>')`을 부르고, `it` 이름에도 AC ID를 넣는다. 감싸개 시험 시간 제한은 넉넉히(예: 300초) 준다
- RED를 기록하기 전에 `export PATH="$HOME/.dotnet:$PATH" && dotnet --version` 이 되는지 먼저 본다. dotnet이 없어서 실패한 것(`E-NO-DOTNET`)은 RED가 아니다
- 이 step을 execute.py로 돌리면 허용 도구에 dotnet이 있어야 한다: `HARNESS_ALLOWED_TOOLS="Read,Edit,Write,Bash(npm:*),Bash(npx:*),Bash(node:*),Bash(python3:*),Bash(git add:*),Bash(git diff:*),Bash(dotnet:*)"`

## Acceptance Criteria

```bash
export PATH="$HOME/.dotnet:$PATH"
dotnet --version                                              # .NET 10 SDK
dotnet build helper/Precheck.sln                              # 경고·에러 없음 (net48은 참조 어셈블리로)
dotnet test helper/tests/Precheck.Core.Tests -f net10.0 --filter "FullyQualifiedName~Precheck.Core.Tests.Protocol"
npx vitest run helper/tests/protocol.dotnet.test.ts           # 감싸개(AC-001.1~AC-001.6)
python3 -m json.tool src/lib/bridge/commands.json > /dev/null # 명령 표 JSON 모양
python3 ~/.claude/harness/bin/tdd-run TASK-1 --expect green
npm run lint && npm test && npm run build                     # 기존 시험·빌드가 그대로 (tsconfig exclude 확인)
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-001.1 ~ AC-001.6이 이 TASK의 시험과 이어져 보여야 한다

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

- 개인키(`.pem`)를 저장소·로그·summary에 남기지 마라. 이유: 확장 ID를 흉내 낼 수 있는 값이다. 공개키와 ID만 남긴다
- `Console.WriteLine`·`Console.Error`로 무엇이든 쓰지 마라. 이유: 표준 출력은 크롬과의 메시지 통로다. 다른 글이 섞이면 크롬이 연결을 끊는다. 진단은 `DiagnosticLog`에만
- 조각 크기를 글자 수나 원래 바이트 수로만 재지 마라. 이유: 이스케이프 뒤 실제 메시지가 1MB를 넘으면 크롬이 연결을 끊는다. 직렬화한 뒤 바이트로 잰다
- `commands.json`에 `*`·와일드카드 origin이나 두 번째 origin을 넣지 마라. 이유: AC-003.1·AC-002.3: 우리 사이트 하나만 확장·도우미에 말할 수 있어야 한다
- NuGet 판을 범위(`1.*`, `[1,2)`)로 적지 마라. 이유: Actions 윈도우 빌드와 이 서버 빌드가 다른 판을 받으면 결과가 달라진다(design.md 14절)
- 기존 테스트를 깨뜨리지 마라. 이유: `tsconfig.json`·`vitest.config.ts`를 고치므로 `npm test`·`npm run build`를 꼭 다시 돌린다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다

## 참고

- 사용자 할 일 (Phase 1 시작 때, 메인 세션이 안내): 구글 개발자 등록(크롬 웹스토어, 5달러)과 확장 비공개(unlisted) 등록 신청. 심사에 며칠 걸린다(docs/precheck/plan.md §7)

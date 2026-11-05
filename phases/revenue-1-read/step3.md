# Step 3: version-bump

> **TASK-12** 버전 올리기 · **REQ-012** · AC-012.1 ~ AC-012.2
> Phase 1 `revenue-1-read` · Step 3 — `specs/revenue/tasks.md`
> 명세 `specs/revenue/`가 승인된 뒤에만 한다(`python3 ~/.claude/harness/bin/sdd status revenue`로 확인. 승인 전이면 `blocked`). 이 step은 TASK-12 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/revenue/requirements.md`의 REQ-012에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-012.1**: `helper/Directory.Build.props`의 `Version`과 `src/lib/bridge/versions.ts`의 `LATEST_HELPER`를 같은 다음 판(0.1.0 다음, 예: 0.2.0)으로 같은 커밋에서 올린다(`handshake.test.ts`). `MIN_HELPER`·`MIN_EXTENSION`은 그대로
- **AC-012.2**: `extension/manifest.json`의 `version`을 다음 판으로. manifest 모양 시험 그대로 통과. 릴리스 태그·웹스토어 올리기는 하지 않는다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·016·020·021
- `/specs/revenue/requirements.md` — 맨 위 승인 줄(시안 승인·사용자 결정 2026-11-01)과 이 step의 REQ
- `/specs/revenue/design.md` — 이 step이 가리키는 절
- `/specs/revenue/tasks.md` — 머리말과 이 step의 TASK
- `/specs/revenue/design.md` — 5-1절(옛 확장·옛 도우미), 11절(판 올리기는 합칠 곳), 13절
- `/src/lib/bridge/versions.ts`, `/src/lib/bridge/handshake.test.ts`(LATEST_HELPER = Version 시험), `/helper/Directory.Build.props`, `/extension/manifest.json`, `/extension/src/manifest.test.ts`, `/helper/tests/build.test.ts`(zip 이름에 판이 들어가는지)
- `/specs/precheck/design.md` — 4-4·13절(버전 맞추기)
- 이전 step에서 만든 파일:
  - `src/lib/bridge/commands.json`의 `revenue.days` (Phase 1 Step 1)
  - `helper/src/Precheck.Core/Revenue/*` (Phase 1 Step 2)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-12)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `helper/Directory.Build.props`
  - `src/lib/bridge/versions.ts`
  - `src/lib/bridge/handshake.test.ts`
  - `src/lib/bridge/client.test.ts`
  - `extension/manifest.json`
- Tests:
  - `src/lib/bridge/handshake.test.ts`
  - `src/lib/bridge/client.test.ts`
  - `extension/src/manifest.test.ts`
  - `helper/tests/protocol.dotnet.test.ts`
  - `helper/tests/build.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **같은 커밋 규칙**: 도우미 `Version`을 올릴 때 `LATEST_HELPER`도 같은 커밋에서 올린다(`versions.ts` 머리 주석, `handshake.test.ts`)
- **막지 않는다**: `MIN_HELPER`·`MIN_EXTENSION`을 올리지 않는다. 옛 도우미·확장으로도 청구는 계속 쓰고, 매출 탭만 '새 버전' 상태를 보인다(design.md 5-1·13절)
- **사용자 일은 하지 않는다**: `helper-v*` 태그·릴리스·웹스토어 올리기·push는 사용자가 그때 말할 때만 (tasks.md 머리말)
- **합칠 곳**: 다른 갈래(stats·patients·precheck)도 판을 올릴 수 있다. 합칠 때 가장 높은 판 하나로 맞춘다(design.md 11절)

## 작업

### 1. 시험 먼저
- `handshake.test.ts`: `LATEST_HELPER`의 기대값(지금 `'0.1.0'`)을 새 판으로 바꾸고 AC-012.1을 이름에 넣는다. "LATEST_HELPER는 Directory.Build.props와 같다" 시험은 그대로 둔다 → RED(아직 판이 그대로라 실패)

### 2. 판 올리기
- `helper/Directory.Build.props` `<Version>` → 새 판
- `src/lib/bridge/versions.ts` `LATEST_HELPER` → 같은 새 판(`MIN_*`은 그대로)
- `extension/manifest.json` `"version"` → 새 판(확장과 도우미가 같은 판일 필요는 없지만 이번에는 같게 둔다)

- `src/lib/bridge/client.test.ts`: 진짜 `WEB_VERSIONS`를 쓰는 hello 시험(`HELLO_DATA`, 'hello가 맞으면 ready이고 버전을 돌려준다')은 도우미 `'0.1.0'`이 `helperUpdateAvailable: false`라고 기대한다(`client.ts`가 `LATEST_HELPER`와 견준다). `HELLO_DATA`의 `helperVersion`과 기대값의 `helperVersion`을 새 판으로 올리고, 고친 시험 이름에 AC-012.1을 붙인다. 이 줄이 RED의 한 부분이다(판을 올리기 전에는 기대값과 실제가 어긋남)
- 그 밖의 시험이 판 때문에 깨지면(진짜 `LATEST_HELPER`를 쓰면서 `'0.1.0'`을 기대하는 것) 고치지 말고 `blocked`(사유: 어느 파일·어느 시험)로 멈춘다(수정 범위 밖)

### 3. 확인
- `extension/src/manifest.test.ts`(모양)·`helper/tests/build.test.ts`(zip 이름)·`helper/tests/protocol.dotnet.test.ts`(hello의 `helperVersion` = `Version`)가 그대로 통과

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-012.1 LATEST_HELPER는 새 판이다 …', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-12 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-12 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

- C# 시험 파일 이름은 `*.test.cs`다(하네스가 시험 파일로 알아본다). xUnit 이름에 AC ID를 넣는다: `[Fact(DisplayName = "AC-003.2 환불이 있는 날은 금액 null, unconfirmed")]`
- 하네스 TDD 기록은 vitest 감싸개(`helper/tests/*.dotnet.test.ts`)로 남긴다. 감싸개는 `helper/tests/runDotnet.ts`의 `runDotnet('<시험 이름공간>')`을 부르고 `it` 이름에도 AC ID를 넣는다. 시간 제한은 넉넉히(예: 300초)
- RED를 기록하기 전에 `export PATH="$HOME/.dotnet:$PATH" && dotnet --version` 이 되는지 먼저 본다. dotnet이 없어서 실패한 것은 RED가 아니다
- execute.py로 돌리면 허용 도구에 dotnet이 있어야 한다: `HARNESS_ALLOWED_TOOLS="Read,Edit,Write,Bash(npm:*),Bash(npx:*),Bash(node:*),Bash(python3:*),Bash(git add:*),Bash(git diff:*),Bash(dotnet:*)"`

## Acceptance Criteria

```bash
npx vitest run src/lib/bridge/handshake.test.ts extension/src/manifest.test.ts helper/tests/build.test.ts   # AC-012.1·AC-012.2
export PATH="$HOME/.dotnet:$PATH" && npx vitest run helper/tests/protocol.dotnet.test.ts
python3 ~/.claude/harness/bin/tdd-run TASK-12 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가(새 npm·NuGet 패키지 없음)?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/revenue-1-read/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (사용자 확인·외부 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- `MIN_HELPER`·`MIN_EXTENSION`을 올리지 마라. 이유: 옛 도우미·확장을 쓰는 PC에서 청구까지 막힌다(design.md 13절)
- `git tag`·릴리스·웹스토어 올리기를 하지 마라. 이유: 외부에 나가는 일이라 사용자가 그때 말할 때만 한다
- 판을 `0.1.1`처럼 다른 갈래와 겹치기 쉬운 값으로 고르지 말고 다음 작은 판(0.2.0)을 쓴다. 이유: 합칠 때 가장 높은 판 하나로 맞추기 쉽다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 기존 테스트를 깨뜨리지 마라. 이유: 앞 TASK와 다른 기능(청구 사전점검 등)의 시험이 계속 통과해야 한다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`를 고치지 마라. 이유: 규칙 문서는 사용자 승인으로만 바뀐다

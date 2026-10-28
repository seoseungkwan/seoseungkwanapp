# Claude Code 전역 하네스

[jha0313/harness_framework](https://github.com/jha0313/harness_framework) (커밋 `da676bc`)를 `~/.claude/` 전역용으로 옮기고, 보안을 보강하고, SDD + TDD + 독립 코드 리뷰를 통합한 버전.

## 구성

| 경로 | 역할 |
|---|---|
| `~/.claude/commands/harness.md` | `/harness` — SDD → 승인 → TDD → 자동 검증 → 독립 리뷰 → PR. step 설계/execute.py 방식도 유지 |
| `~/.claude/commands/review.md` | `/review` — 아키텍처·ADR·테스트·CRITICAL 규칙 체크리스트 리뷰 (원본 그대로) |
| `~/.claude/skills/sdd/` | `/sdd` — 요구사항(REQ/AC) → 설계 → 작업 분할(TASK, 수정 범위). 승인 전 구현 금지 |
| `~/.claude/skills/tdd/` | `/tdd` — RED → GREEN → REFACTOR. 실패 테스트 확인 후 구현, 테스트 이름에 AC ID |
| `~/.claude/agents/harness-reviewer.md` | 독립 리뷰어. 읽기 전용, `VERDICT: PASS/FIX`, 명세 추적 확인 |
| `~/.claude/harness/bin/sdd` | `init` / `check` / `status`(REQ·AC → TASK → 테스트 → 최근 결과 추적표) / `use` |
| `~/.claude/harness/bin/tdd-run` | TASK 테스트 실행, `--expect red|green`, `tdd-log.jsonl`에 기록 |
| `~/.claude/harness/bin/verify` | Stop 훅과 같은 검증(SDD 사후 점검 + lint → build → test). 통과하면 PR 생성 게이트용 기록을 남긴다 |
| `~/.claude/harness/bin/cr-review` | CodeRabbit CLI 로 커밋된 변경을 리뷰. 통과하면 CodeRabbit PR 게이트용 기록, 막히면 라운드를 센다 (아래 "CodeRabbit 리뷰 게이트") |
| `~/.claude/harness/lib/crlib.py` | CodeRabbit 정책·출력 판정·기록·PR/merge 게이트 |
| `~/.claude/harness/coderabbit.json` | CodeRabbit 정책 (대상 저장소, 막는 심각도, 최대 횟수). 사용자만 고친다 |
| `~/.claude/harness/scripts/execute.py` | step 순차 실행기 (리뷰 게이트, 재시도 5회, feat/chore 2단계 커밋, step 세션이 띄운 프로세스 정리, 시간 초과 기록). step 세션은 커밋하지 못하고, 리뷰 PASS 뒤에만 실행기가 커밋한다. 5회 끝내 실패하면 커밋하지 않는다 (2026-10-28 CodeRabbit 지적으로 수정) |
| `~/.claude/harness/templates/` | 프로젝트용 CLAUDE.md(보안 규칙 기본값 포함), docs/*.md, gitignore, vercelignore 템플릿 |

## 훅

| 이벤트 | 파일 | 하는 일 |
|---|---|---|
| UserPromptSubmit | `sdd-approve.py` | 사용자가 입력한 `/sdd approve <id>`(또는 `SDD-APPROVE <id>`)만 승인으로 기록한다. 명세 형식 검사, 명세 해시와 수정 범위를 저장한다. `/sdd revoke <id>`로 철회한다 |
| UserPromptSubmit | `user-grant.py` | 사용자가 입력한 지시를 저장소별로 기록한다. merge 지시("merge해", "2번 머지해줘", `MERGE-APPROVE <번호>`), commit·push 지시("commit and push해", "커밋하고 푸시해", `PUSH-APPROVE`), `PR-ALLOW`가 대상이다. 만료 없이 세션이 바뀌어도 유효하고 `GRANT-REVOKE`로 모두 취소한다. 질문("merge하려면 어떻게 해?")은 지시로 보지 않는다 |
| PreToolUse(Bash) | `guard-bash.py` | 위험 명령 차단(force push, `--mirror`/`--all` 포함), 승인·TDD 기록·설정·`harness/state`를 Bash로 쓰는 것 차단. main 직접 commit·push 와 `gh pr merge`는 사용자 지시가 있을 때만 허용하고 `--admin`은 항상 차단한다. `gh pr create`는 지금 코드가 검증을 통과했을 때만 허용한다(PR 생성 게이트). 로컬 `git merge`는 허용한다 |
| PreToolUse(Edit\|Write\|MultiEdit\|NotebookEdit) | `sdd-guard.py` | 훅 전용 기록 보호, 문서는 항상 허용, 승인 여부·명세 변경·수정 범위·RED 기록 검사 (`permissionDecision: deny`) |
| PostToolUse(Edit\|Write\|MultiEdit\|NotebookEdit) | `tdd-post.py` | 관련 테스트를 실행해 RED/GREEN을 기록하고 결과를 `additionalContext`로 전달한다. 테스트를 못 찾거나 시간이 넘으면 Stop으로 예약한다 |
| Stop | `stop-verify.py` | SDD/TDD 사후 점검(Bash 우회 탐지)과 lint → build → test. 실패하면 계속 수정하게 하고, 연속 3회를 넘으면 멈춘다. 문서만 바뀌었거나 산출물만 바뀌었으면 건너뛴다. 통과하면 코드 해시를 PR 생성 게이트용으로 기록한다 |

### PR 생성 게이트와 merge

- 게이트 대상은 검증 명령이 있는 프로젝트다. 기준은 `.harness/config.json`이 있거나 `package.json`에 lint/build/test 스크립트가 있는 경우다.
- 이런 프로젝트에서 Claude 의 `gh pr create`는 지금 코드 내용 해시가 마지막 검증 통과 기록과 같을 때만 허용된다.
  - 해시에서 제외하는 것: 문서, 훅 기록, 산출물
  - 커밋해도 내용이 같으면 해시는 그대로다.
  - 검증 통과 기록은 Stop 훅이나 `bin/verify`가 남긴다.
- 검증할 명령이 없는 프로젝트는 게이트를 적용하지 않는다.
- 사용자가 `PR-ALLOW`를 입력하면 그 저장소에서는 게이트를 건너뛴다 (`GRANT-REVOKE`로 취소).
- 주의: 지시는 만료되지 않는다. 한 번 지시한 저장소에서는 이후 Claude 가 별도 지시 없이 merge·main push 를 할 수 있다.
- `gh api .../pulls -X POST`로 게이트를 우회하는 것은 차단한다.
- merge 지시 기록은 `~/.claude/harness/state/grant-*.json`에 남는다.
  - 이 기록은 훅만 쓴다. Edit/Write와 Bash 쓰기는 차단한다.
  - Claude 는 사용자 프롬프트를 만들 수 없으므로, 기록의 출처는 사용자 입력뿐이다.
- 사용자가 직접 merge 할 때는 이 훅들이 관여하지 않는다 (GitHub 웹, 일반 터미널).

## CodeRabbit 리뷰 게이트 (2026-10-28)

흐름: 코드 작성 → 테스트(`verify`) → `harness-reviewer` PASS → 커밋 → `cr-review` → 수정 → 재테스트 → 재리뷰 → PR.

- **대상**: `coderabbit.json`의 `repos`에 있는 GitHub 저장소(origin 기준). 처음 대상은 `seoseungkwan/seoseungkwanapp`, `seoseungkwan/claude-harness`. 다른 저장소는 기존과 같다.
  - 정책 파일이 없거나 깨졌으면 모든 GitHub 저장소를 대상으로 본다 (조용히 꺼지지 않게).
- **`cr-review`**: `coderabbit review --agent --gate major --committed --base <base> [-c CLAUDE.md]`를 실행한다.
  - CLI 는 정책의 절대 경로(`cli`, 기본 `~/.local/bin/coderabbit`)만 쓰고 PATH 로 찾지 않는다. 버전이 `cli_version`(0.9.1)과 다르면 결과를 믿지 않는다.
  - 자동 업데이트를 끄고, 접속 대상·인증서·프록시를 바꾸는 환경 변수는 넘기지 않는다 (`CODERABBIT_*`, `CR_CLI_*`, `NODE_*`, `*_PROXY` 등).
  - 실행 전 확인: 커밋 안 된 변경 없음, 지금 코드가 `verify` 통과.
  - 종료 코드: 0 통과, 2 critical/major 있음(라운드 +1), 1 결과 확인 불가(횟수에 안 셈), 3 라운드 소진.
- **테스트 필수**: CodeRabbit 저장소는 테스트 명령이 꼭 있어야 한다. `sddlib.verify_commands`가 package.json·`.harness/config.json`이 없는 CodeRabbit 저장소에 아래 명령을 쓴다. 그래서 Stop 검증·`verify`·PR 게이트가 모두 이 명령을 쓴다.
  - 정책 `tests["owner/repo"]`가 있으면 그것을 쓴다. `"none"`이면 테스트 없음을 허용한다.
  - 없으면 git 이 추적하는 `test_*.py`/`*_test.py`가 있는 폴더들에 `<정책 python> -m pytest -q <폴더...>`를 쓴다. `.claude/` 같은 점 폴더도 포함된다.
  - 검증 명령에 test 가 없으면(예: package.json 에 lint/build 만 있음) `cr-review`와 PR 게이트가 거부한다. 정책에서 `"none"`으로 허용한 저장소만 예외다.
  - 정책 python 이 없으면 테스트 명령은 "직접 만들지 말고 사용자에게 요청하라"는 메시지를 내고 실패한다 (Stop 검증에서도 같은 메시지).
- **통과 판정** (하나라도 어긋나면 "확인 불가", 통과로 보지 않음):
  - 종료 코드 0/2, error·action_required 이벤트 없음, 출력 형식 정상·잘림 없음
  - complete 이벤트가 정확히 1개이고, 그 `findings`(정수)가 실제 지적 수와 같음
  - 모든 지적의 severity 가 critical/major/minor/trivial/info/none 중 하나 (대소문자·다른 값·없음은 확인 불가)
  - `status: review_completed`(건너뜀·"No fresh detailed file review" 아님)
  - `outcome`이 없거나 completed/success/succeeded. `completed_with_warnings`는 `unreviewedFileCount: 0`이 명시될 때만 통과
  - `unreviewedFileCount`가 정수 0 (없으면 0으로 본다)
  - 리뷰 전후로 HEAD·트리·브랜치가 같고 작업 트리가 깨끗함
  - 판정 규칙은 CodeRabbit 공식 플러그인(`coderabbitai/skills` `mods/coderabbit/hooks/review.js`)을 따르고 위 조건을 더했다.
- **최대 3회**: 막힌 리뷰가 저장소 단위로 `max_rounds`(3)회가 되면 `cr-review`는 CLI 를 부르지 않고 종료 코드 3을 낸다. 브랜치를 바꿔도 횟수는 그대로다. 사용자가 `CR-RESET`을 입력해야 다시 돈다. 통과하면 횟수는 지워진다. 직접 `coderabbit review`는 막아서 횟수 밖에서 리뷰를 돌릴 수 없다.
- **PR 게이트**: `gh pr create`/`gh pr new`는 기존 검증 게이트에 더해 다음을 모두 만족할 때만 허용한다.
  - 작업 트리가 깨끗하고, HEAD 트리(문서 포함 전체)가 마지막 `cr-review` 통과 기록과 같다.
  - `origin/<브랜치>`가 HEAD 와 같다 (push 됨).
  - `--base <브랜치>`(또는 `-B <브랜치>`, `--base=<브랜치>`)가 정확히 한 번 있고, 리뷰한 base 와 같다.
  - `-H/--head`, 다른 저장소 `-R/--repo/GH_REPO`, 붙여 쓴 짧은 옵션(`-Bdev`, `-dB` 등)이 없다.
  - `PR-ALLOW`는 이 게이트를 건너뛰지 않는다. `gh pr edit --base`도 막는다.
  - 명령 앞의 `VAR=값`·`env`·`command`·`exec`·`nohup`·`time`·`timeout`을 걷어 낸다.
  - 서브셸·묶음의 괄호(`(cd x`, `{ gh`)를 걷어 내고, 명령 치환(`$(...)`, 백틱) 안쪽 명령도 따로 본다.
  - 단일 `&`도 명령 구분으로 본다 (`2>&1`, `&>`는 제외).
  - 같은 명령 안의 `cd`/`pushd`/`env -C`를 따라 저장소를 정한다. 이동이 서브셸 안이었을 수 있으므로, 원래 저장소도 함께 보고 한 곳이라도 걸리면 막는다 (PR 생성·base 변경, 기존 main 보호). 그래서 기존보다 약해지는 경우는 없다.
  - 훅이 저장소를 찾지 못하면(저장소 밖, `-R` 없음) 막는다.
  - `gh api graphql`의 createPullRequest·mergePullRequest·enablePullRequestAutoMerge 는 모든 저장소에서 막는다.
- **merge**: CodeRabbit 저장소에서는 사용자가 번호로 지시한 PR(`3번 머지해`, `MERGE-APPROVE 3`)만 한 번씩 허용한다.
  - 번호 없는 "merge해"는 기록하지 않고, 예전의 번호 없는 기록도 효력이 없다.
  - `--auto`, 다른 저장소의 PR 주소·`-R`·`GH_REPO`는 막는다.
- **CodeRabbit 명령 허용 목록** (guard-bash): `auth status`, `doctor`, `usage`, `stats`, `pullrequest`, `review findings`(`--clear` 제외), `config` 조회(`apply` 제외), `--version`/`--help`.
  - 그 밖은 모두 막는다: 리뷰, `update`, `auth login/logout`, `code ...`, `skills` 등.
  - `--use-credits`, `--api-key`는 어디에 붙어도 막는다.
- **보호**: `coderabbit.json`은 Edit/Write(sdd-guard)와 Bash 쓰기(guard-bash)를 막는다. Bash 쓰기는 파일 이름으로도 막으므로 `cd` 뒤 상대 경로로 써도 막힌다. `cr-reviewed-*`/`cr-rounds-*`/`cr-last-*` 기록도 이름으로 막는다. 정책을 바꾸려면 사용자가 직접 편집한다.
- **기록**: `state/cr-reviewed-*.json`(통과: HEAD·트리·브랜치·base), `state/cr-last-*.json`(마지막 결과 요약, 비밀값 가림), `state/cr-rounds-*.json`(저장소별 횟수). 권한 0600.
- **남은 한계**:
  - PR 을 만든 뒤 같은 브랜치에 push 하는 것은 게이트가 없다. GitHub 앱이 다시 리뷰하고, merge 는 사용자만 한다.
  - Bash 로 훅 파일 자체를 고치는 것처럼 작정한 우회까지 막지는 못한다. 이 하네스는 흔한 실수·우회를 막는 장치다.
    - 예: `bash -c '…'`, `eval`, `xargs`, `sudo`, `nice`, `exec -a`, `gh alias set`
    - 예: 앞 명령에서 `export GH_REPO=…`, `gh api …/pulls/N -X PATCH -f base=…`, 파일로 넘긴 graphql 쿼리
  - 안전한 쪽으로 더 막는 경우가 있다. CodeRabbit 저장소에서 `cd <다른 저장소> && gh pr create`는 원래 저장소 기준으로도 보므로 막힌다. 저장소 밖에서 `gh pr create -R <대상 아닌 저장소>`도 막힌다. 그 저장소 폴더로 옮긴 뒤 따로 실행하면 된다.
  - 대상 저장소인지는 `origin`으로만 판단한다. fork 의 `upstream`이 대상 저장소이거나 remote 이름을 바꾼 경우는 보지 않는다.
  - `-c CLAUDE.md`·`.coderabbit.yaml`·`.gitattributes`처럼 저장소 안 파일로 CodeRabbit 판단에 영향을 줄 수 있다. 이런 변경은 PR diff 에 드러난다. `cr-review`는 `GIT_*` 환경 변수를 지우고 실행한다.
  - `bin/cr-review`는 `python3 -I`로 도는 실행 파일이다. `python3 ~/.claude/harness/bin/cr-review`처럼 부르면 `-I`가 빠진다.
- **CLI**: 0.9.1, `~/.local/bin/coderabbit`.
  - 2026-10-28 설치 때 내려받은 스크립트를 읽어 본 뒤 사용자가 직접 실행했다. Linux 릴리스 서명 검증이 들어 있다.
  - 로그인도 사용자가 직접 브라우저로 했다.
  - Claude 는 `coderabbit auth status --agent`로 상태만 확인한다.
- **GitHub 앱**: PR 이 생기면 CodeRabbit 앱도 리뷰한다. Claude 는 결과를 읽어 알리기만 하고, 그 결과로 merge 하지 않는다.

SDD/TDD 훅은 `.harness/config.json`이 있는 프로젝트에만 적용된다. 다른 프로젝트에서는 기존과 같이 `guard-bash`와 `package.json` 기반 Stop 검증만 동작한다.

## 프로젝트 파일

```
.harness/config.json        commands(test, test_file, lint, build), tdd.mode(strict|warn), tdd.exempt, test_patterns
.harness/active             활성 기능 ID (브랜치 feat-<id>가 우선)
specs/<id>/requirements.md  ### REQ-001 / - AC-001.1
specs/<id>/design.md
specs/<id>/tasks.md         ## TASK-1 / - REQ: / - Files: / - Tests: / - TDD: required|exempt
specs/<id>/approval.json    sdd-approve 훅만 기록 (spec_sha256, scope)
specs/<id>/tdd-log.jsonl    tdd-run / PostToolUse / Stop 이 기록하는 RED/GREEN
```

## 강제할 수 있는 것과 없는 것

- **강제됨 (훅)**:
  - 승인 전 Edit/Write로 코드 수정
  - 승인 범위 밖 수정
  - RED 기록 없는 구현 수정(strict)
  - 승인과 기록 파일 위조 (Edit/Write 전부, Bash의 쓰기 패턴)
  - main 보호
- **강제되지 않음 → 사후 점검과 기록으로 보완**:
  - Bash로 소스 파일을 직접 고치는 경우. 예: `python -c`, 리다이렉트
  - 위의 경우는 Stop 훅이 git 변경을 점검해 승인·범위·RED 위반을 찾고, 멈추지 못하게 한다.
  - 테스트의 품질(AC를 실제로 검증하는지)은 `/tdd` 규칙, `sdd status`의 AC 언급 추적, `harness-reviewer`가 확인한다.
- 사용자가 입력창에서 `!`로 실행하는 명령에 훅이 적용되는지는 공식 문서에 나와 있지 않다.

## 원본 대비 변경점

1. **execute.py**
   - 프로젝트 루트를 현재 디렉토리의 git 루트로 잡는다.
   - `--dangerously-skip-permissions` 대신 `acceptEdits`와 허용 도구 목록을 쓴다 (`HARNESS_ALLOWED_TOOLS`로 바꿀 수 있음).
   - 커밋 전에 비밀정보 파일을 스테이징에서 뺀다.
   - step 완료 후 읽기 전용 리뷰 게이트를 거친다.
   - step 세션을 새 프로세스 그룹에서 돌리고 `HARNESS_STEP_SESSION` 표시를 물려준다. 세션이 끝나거나 시간이 넘으면 그룹과 표시가 붙은 프로세스(새 세션으로 떨어져 나간 것 포함)를 모두 끈다.
   - 시간 제한(`HARNESS_STEP_TIMEOUT`, 기본 1800초)을 넘으면 step을 `error`(`[시간 초과]`)로 기록하고 커밋 없이 멈춘다. 출력은 임시 파일로 받아, 남은 자식이 파이프를 쥐고 있어도 멈추지 않는다.
2. **PreToolUse 훅**
   - 원본은 존재하지 않는 `$CLAUDE_TOOL_INPUT`과 `exit 1`을 써서 실제로는 아무것도 막지 못했다. stdin JSON과 공식 차단 방식으로 다시 작성했다.
   - 원본의 차단 대상은 유지한다. `--force-with-lease`는 허용한다.
   - 추가로 막는 것: 사용자 지시 없는 main/master push·commit 과 `gh pr merge`, `curl | sh`.
3. **Stop 훅**
   - `stop-check.py`를 `stop-verify.py`로 확장했다. 기존 `package.json` 동작은 유지한다.
   - `HARNESS_STOP_CHECK=0`으로 끌 수 있다.

## 보안 보강 (2026-10-27, 파일럿 프로젝트 회고에서)

| 겪은 일 | 바꾼 곳 |
|---|---|
| step 세션이 시간 초과로 끊긴 뒤 진단용 서버가 공개 포트를 연 채 남음 | execute.py 프로세스 정리 + 시간 초과 기록, harness.md 보안 운영 규칙 4 |
| `vercel link`가 `.env.local`에 토큰을, `.gitignore`에 줄을 덧붙임 | harness.md 보안 운영 규칙 2 |
| 비밀값 이름 확인 패턴이 숫자 든 이름(`E2E_*`)을 놓침 | harness.md 보안 운영 규칙 1 |
| 공인 IP 임시 서버에서 OAuth 콜백이 `0.0.0.0`으로 감, 임시 주소가 외부 설정에 남음 | harness.md 보안 운영 규칙 3 |
| 앞선 지시를 근거로 운영 배포·merge를 하려 함 | harness.md 보안 운영 규칙 5 |
| 로그인한 E2E의 trace·네트워크 로그에 세션 쿠키가 남음 | harness.md 보안 운영 규칙 6, 템플릿 CLAUDE.md·gitignore |
| RLS·기본 권한 회수·열린 리디렉트·CSP·시험용 뒷문 | 템플릿 CLAUDE.md 보안 규칙, harness-reviewer 보안 확인 항목 |

## 테스트

```bash
python3 -m pytest ~/.claude/harness/hooks/ ~/.claude/harness/scripts/test_execute.py
```

시스템 python3 에는 pytest 가 없으므로 `~/.venvs/harness`(pytest 9.1.1, 2026-10-28 사용자 승인으로 생성)로 실행한다: `~/.venvs/harness/bin/python -m pytest ...`. 이 서버에는 `python3-venv`(ensurepip)가 없어 `python3 -m venv --without-pip`로 만든 뒤 다른 가상환경의 pip 로 `pip --python ~/.venvs/harness/bin/python install pytest==9.1.1`을 했다. CodeRabbit 저장소의 테스트 게이트도 이 인터프리터(정책 `python`)를 쓴다. `test_coderabbit.py`는 가짜 `coderabbit`을 써서 진짜 CLI 를 부르지 않는다.

## 제거

CodeRabbit 게이트만 되돌리려면 `~/.claude/backups/harness-20261028-pre-coderabbit/`의 `harness.tar`, `commands/harness.md`를 복원하고 `bin/cr-review`, `lib/crlib.py`, `coderabbit.json`, `hooks/test_coderabbit.py`, `state/cr-*.json`을 지운다 (settings.json 은 바뀌지 않았다). CLI 는 `~/.local/bin/coderabbit`, `~/.local/bin/cr`, `~/.coderabbit/`.

`~/.claude/backups/harness-*/settings.json`을 `~/.claude/settings.json`으로 되돌린 뒤 다음을 삭제한다.

- `~/.claude/commands/harness.md`
- `~/.claude/commands/review.md`
- `~/.claude/agents/harness-reviewer.md`
- `~/.claude/skills/sdd/`
- `~/.claude/skills/tdd/`
- `~/.claude/harness/`

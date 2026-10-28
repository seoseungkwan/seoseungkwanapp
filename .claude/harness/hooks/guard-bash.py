#!/usr/bin/python3 -I
"""PreToolUse(Bash) 가드 — 위험한 명령을 차단한다 (exit 2 = 차단, 사유는 stderr로 Claude에게 전달).

원본 harness_framework 훅의 차단 대상(rm -rf, git push --force, git reset --hard, DROP TABLE)을 유지하고,
main/master 보호(push, commit)를 추가했다. 로컬 `git merge`는 허용한다.
- main/master 직접 commit·push: 사용자가 "commit and push해"처럼 지시했을 때만(user-grant 훅 기록, GRANT-REVOKE 전까지 계속 유효) 허용.
  force push, --mirror/--all 은 지시가 있어도 차단.
- `gh pr merge`: 사용자가 입력창에 merge 를 지시했을 때만(user-grant 훅 기록, GRANT-REVOKE 전까지 계속 유효) 허용. `--admin` 은 항상 차단.
- `gh pr create`: 검증 명령이 있는 프로젝트에서는 지금 코드가 Stop 검증 또는 bin/verify 를 통과했을 때만 허용
  (사용자가 `PR-ALLOW`를 입력하면 예외). gh api 로 PR 을 만드는 우회는 차단.
- CodeRabbit 저장소(~/.claude/harness/coderabbit.json 의 repos): `gh pr create`/`gh pr new`는 지금 트리가
  bin/cr-review 를 통과했고, 작업 트리가 깨끗하고, origin 에 push 됐고, `--base`가 리뷰한 base 와 같을 때만 허용
  (`PR-ALLOW`로도 건너뛰지 않음, `-H`·다른 저장소 `-R`·붙여 쓴 옵션은 차단). `gh pr edit --base` 차단.
  `gh pr merge`는 사용자가 번호로 지시한 PR 만 한 번씩 허용하고 `--auto`는 차단.
- CodeRabbit CLI: 허용 목록(auth status, doctor, usage, stats, pullrequest, review findings, config 조회)만 허용.
  리뷰는 bin/cr-review 로만 (직접 `coderabbit review`는 횟수 제한을 피하므로 차단).
- 명령 앞의 VAR=값·env·command·exec·nohup·time·timeout 을 걷어 내고, 같은 명령 안의 cd/pushd 를 따라 저장소를 정한다.
  gh api graphql 로 PR 생성·merge·자동 merge 하는 우회도 차단.
원본은 존재하지 않는 $CLAUDE_TOOL_INPUT 를 읽고 exit 1 을 써서 실제로는 아무것도 막지 못했다.
"""
import json
import os
import re
import shlex
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
import crlib as CR  # noqa: E402
import sddlib as L  # noqa: E402

PROTECTED = {"main", "master"}

# 원본 훅 패턴 (force-with-lease 는 허용)
DANGEROUS = [
    (re.compile(r"\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r|-r\s+-f|-f\s+-r)\b"), "rm -rf"),
    (re.compile(r"\bgit\s+push\b[^;&|]*\s(--force(?!-with-lease)\b|-f\b)"), "git push --force (--force-with-lease 를 사용하세요)"),
    (re.compile(r"\bgit\s+reset\s+[^;&|]*--hard\b"), "git reset --hard"),
    (re.compile(r"\bDROP\s+TABLE\b", re.IGNORECASE), "DROP TABLE"),
    (re.compile(r"\b(curl|wget)\b[^;&]*\|\s*(sudo\s+)?(ba|z)?sh\b"), "원격 스크립트 파이프 실행 (curl | sh)"),
    (re.compile(r"\bgh\s+api\b[^;&|]*/merge\b"), "gh api .../merge (merge 는 사용자 지시 후 `gh pr merge <번호>`로)"),
    (re.compile(r"\bgh\s+api\s+graphql\b[^;&|]*(createPullRequest|mergePullRequest|enablePullRequestAutoMerge)"),
     "gh api graphql 로 PR 생성·merge (`gh pr create`/`gh pr merge <번호>`를 쓰세요)"),
]
# PR 생성을 gh api 로 우회하는 경우 (POST /repos/o/r/pulls)
GH_API_PR_CREATE = re.compile(r"\bgh\s+api\b(?=[^;&|]*/pulls\b(?!/))(?=[^;&|]*(-X\s*POST|--method\s+POST|\s-[fF]\s|--field|--raw-field|--input))")

SEPARATORS = re.compile(r"&&|\|\||;|\||(?<![<>&|])&(?![&>])|\n")  # 단일 & (백그라운드) 포함, 2>&1·&> 제외
WRAPPERS = {"env", "command", "exec", "nohup", "time", "builtin"}
# gh pr create 에서 값을 받는 옵션 (값 속의 -B 등을 옵션으로 오해하지 않게)
PR_VALUE_FLAGS = {"-t", "--title", "-b", "--body", "-F", "--body-file", "-a", "--assignee", "-l", "--label",
                  "-m", "--milestone", "-p", "--project", "-r", "--reviewer", "-T", "--template"}
CR_SAFE = {"doctor", "usage", "stats", "pullrequest", "help", "completion"}

# SDD/TDD 기록은 훅만 쓴다: Bash 로 쓰기·삭제·이동하려는 명령을 막는다 (읽기, git add/commit 은 허용)
PROTECTED_RECORD = re.compile(r"approval\.json|tdd-log\.jsonl|\.harness/config\.json|harness/state\b"
                              r"|coderabbit\.json|\bcr-(?:reviewed|rounds|last)-")
WRITE_HINT = re.compile(r">>?\s*['\"]?[^\s;&|'\"]*(approval\.json|tdd-log\.jsonl|\.harness/config\.json|harness/state"
                        r"|coderabbit\.json|cr-(?:reviewed|rounds|last)-)"
                        r"|\btee\b|\bsed\b[^;&|]*\s-i|\b(mv|cp|rm|truncate|dd|install|ln|touch|chmod)\b"
                        r"|\b(python3?|node|perl|ruby|bash|sh|zsh)\b")


def current_branch(cwd):
    try:
        r = subprocess.run(["git", "-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"],
                           capture_output=True, text=True, timeout=5)
        return r.stdout.strip() if r.returncode == 0 else None
    except Exception:
        return None


def has_commits(cwd):
    try:
        return subprocess.run(["git", "-C", cwd, "rev-parse", "--verify", "-q", "HEAD"],
                              capture_output=True, timeout=5).returncode == 0
    except Exception:
        return True


def git_args(tokens):
    """['git', '-C', 'x', 'push', ...] -> ('push', [...], '-C dir or None')."""
    if not tokens or os.path.basename(tokens[0]) != "git":
        return None, [], None
    i, cdir = 1, None
    while i < len(tokens) and tokens[i].startswith("-"):
        if tokens[i] in ("-C", "-c") and i + 1 < len(tokens):
            if tokens[i] == "-C":
                cdir = tokens[i + 1]
            i += 2
        else:
            i += 1
    if i >= len(tokens):
        return None, [], cdir
    return tokens[i], tokens[i + 1:], cdir


def refspec_targets(ref):
    ref = ref.lstrip("+")
    dst = ref.split(":", 1)[1] if ":" in ref else ref
    return dst.removeprefix("refs/heads/")


def pr_number(args):
    """gh pr merge 인자에서 PR 번호 (번호·URL). 없거나 브랜치명이면 None."""
    for a in args:
        if a.startswith("-"):
            continue
        m = re.fullmatch(r"#?(\d+)|https://github\.com/[^/]+/[^/]+/pull/(\d+)/?", a)
        return int(m.group(1) or m.group(2)) if m else None
    return None


def split_tokens(seg):
    """한 명령 조각의 토큰. 서브셸·묶음·명령 치환의 괄호는 걷어 낸다: `(cd x`, `{ gh`, `$(gh`, `` `gh ``."""
    try:
        tokens = shlex.split(seg)
    except ValueError:
        tokens = seg.split()
    while tokens and tokens[0] in ("(", "{", "!", "$(", "`"):
        tokens = tokens[1:]
    if tokens:
        tokens[0] = tokens[0].removeprefix("$(").lstrip("({`")
        if tokens[-1] in (")", "}", "`"):
            tokens = tokens[:-1]
        elif tokens[-1].endswith((")", "`")):
            tokens[-1] = tokens[-1].rstrip(")`")
    return [t for t in tokens if t]


def normalize(tokens):
    """명령 앞의 VAR=값 · env/command/exec/nohup/time/timeout 을 걷어 낸다. (tokens, {VAR: 값}, env -C 디렉터리)."""
    env, chdir = {}, None
    while tokens:
        head = os.path.basename(tokens[0])
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*=.*", tokens[0]):
            k, v = tokens[0].split("=", 1)
            env[k] = v
            tokens = tokens[1:]
        elif head in WRAPPERS or head == "timeout":
            tokens = tokens[1:]
            while tokens and tokens[0].startswith("-"):
                opt, tokens = tokens[0], tokens[1:]
                if opt.startswith("--chdir="):
                    chdir = opt.split("=", 1)[1]
                elif opt in ("-u", "--unset", "-C", "--chdir", "-s", "--signal", "-k", "--kill-after") and tokens:
                    if opt in ("-C", "--chdir"):
                        chdir = tokens[0]
                    tokens = tokens[1:]
            if head == "timeout" and tokens:
                tokens = tokens[1:]  # 시간 값
        else:
            break
    return tokens, env, chdir


def segments(command):
    """명령 조각들. 명령 치환($(...)·`...`) 안쪽 명령도 따로 꺼낸다 (바깥 조각도 그대로 둔다)."""
    out = []
    for seg in SEPARATORS.split(command):
        out.append(seg)
        out += [seg[m.end():] for m in re.finditer(r"\$\(|`", seg)]
    return out


def candidate_dirs(here_dir, cwd):
    """명령이 실행될 수 있는 위치: 따라간 위치, 그리고(이동이 서브셸 안이었을 수 있으니) 원래 저장소."""
    origin = L.git_root(cwd)
    return [here_dir] + ([cwd] if origin is not None and origin != L.git_root(here_dir) else [])


def moved_by(cur, chdir):
    return os.path.normpath(os.path.join(cur, os.path.expandvars(os.path.expanduser(chdir)))) if chdir else cur


def next_dir(cur, tokens):
    """cd/pushd 면 옮겨 간 디렉터리, 아니면 None."""
    if not tokens or tokens[0] not in ("cd", "pushd"):
        return None
    args = [a for a in tokens[1:] if a not in ("-L", "-P", "--")]
    target = os.path.expandvars(os.path.expanduser(args[0] if args else "~"))
    return os.path.normpath(os.path.join(cur, target))


def pr_flags(args, envs):
    """gh pr create/edit 인자 → (bases, repos, head 사용 여부, 해석 못 한 옵션)."""
    bases, repos, head, odd = [], [], False, []
    if "GH_REPO" in envs:
        repos.append(envs["GH_REPO"])
    i = 0
    while i < len(args):
        a = args[i]
        m = re.fullmatch(r"--(base|repo|head)=(.*)", a)
        if a in ("--base", "-B", "--repo", "-R", "--head", "-H"):
            kind = {"-B": "base", "-R": "repo", "-H": "head"}.get(a, a[2:])
            if i + 1 >= len(args):
                odd.append(a)
            elif kind == "base":
                bases.append(args[i + 1])
            elif kind == "repo":
                repos.append(args[i + 1])
            head = head or kind == "head"
            i += 2
            continue
        if m:
            kind, val = m.groups()
            if kind == "base":
                bases.append(val)
            elif kind == "repo":
                repos.append(val)
            head = head or kind == "head"
        elif a in PR_VALUE_FLAGS:
            i += 2
            continue
        elif re.match(r"-[A-Za-z]", a) and len(a) > 2 and re.search(r"[BRH]", a[1:]):
            odd.append(a)  # -Bdev, -dB, -B=dev 처럼 붙여 쓴 짧은 옵션
        i += 1
    return bases, repos, head, odd


def check_merge(args, cwd, session_id, envs=None):
    """사용자가 직접 지시한(user-grant 훅이 기록한) merge 만 허용한다."""
    if "--admin" in args:
        return "gh pr merge --admin 은 브랜치 보호를 무시하므로 차단합니다. 사용자가 직접 하세요."
    root = L.git_root(cwd)
    grant = L.read_grant(root, "merge", session_id) if root else None
    if not grant:
        return ("PR merge 는 사용자의 지시가 있어야 합니다. 사용자가 입력창에 `merge해`, `2번 머지해줘` 또는 "
                "`MERGE-APPROVE <번호>`를 직접 입력하면 이후 계속 허용됩니다.")
    n = pr_number(args)
    if CR.enabled(root):
        _, repos, _, _ = pr_flags(args, envs or {})
        url = next((a for a in args if a.startswith("https://")), None)
        other = [CR.slug_of(r) for r in repos] + ([CR.slug_of(re.sub(r"/pull/\d+/?$", "", url))] if url else [])
        url_slug = next((s or "?" for s in other if s != CR.repo_slug(root)), None)
        auto = any(a == "--auto" or a.startswith("--auto=") for a in args)
        return CR.merge_gate(root, grant, n, url_slug, auto)
    if grant.get("prs") and n not in grant["prs"]:
        allowed = ", ".join(f"#{x}" for x in grant["prs"])
        return f"사용자가 허용한 PR 은 {allowed} 입니다. `gh pr merge <번호>`로 번호를 명시하세요."
    return None


def check_pr_create(args, cwd, session_id, envs):
    root = L.git_root(cwd)
    reason = L.pr_gate(root, session_id) if root else None
    return reason or CR.pr_gate(root, *pr_flags(args, envs))


def check_pr_edit(args, cwd, envs):
    root = L.git_root(cwd)
    bases, _, _, odd = pr_flags(args, envs)
    if root and CR.enabled(root) and (bases or odd):
        return "CodeRabbit 저장소에서는 PR base 를 바꿀 수 없습니다 (리뷰한 base 와 달라짐). 필요하면 사용자가 직접 하세요."
    return None


def check_coderabbit(tokens):
    """허용 목록 밖의 CodeRabbit CLI 명령을 막는다 (비용·외부 변경·사용자 몫·횟수 제한 우회)."""
    if not tokens or os.path.basename(tokens[0]) not in ("coderabbit", "cr"):
        return None
    args = tokens[1:]
    words = [a for a in args if not a.startswith("-")]
    if any(a.startswith("--use-credits") for a in args):
        return "CodeRabbit 유료 크레딧 사용(--use-credits)은 사용자가 직접 결정합니다. 제안 내용을 사용자에게 보고하세요."
    if any(a.startswith("--api-key") for a in args):
        return "API 키를 명령줄에 쓰지 마세요 (기록에 남습니다). 로그인은 사용자가 터미널에서 직접 합니다."
    if not words and args and all(a in ("-v", "--version", "-h", "--help") for a in args):
        return None
    if (words[:1] and words[0] in CR_SAFE) or words[:2] == ["auth", "status"] \
            or (words[:2] == ["review", "findings"] and "--clear" not in args) \
            or (words[:1] == ["config"] and "apply" not in words):
        return None
    if not words or words[0] == "review":
        return ("CodeRabbit 리뷰는 `~/.claude/harness/bin/cr-review`로만 실행하세요 (최대 횟수·판정·PR 게이트 기록). "
                "`coderabbit review`·`coderabbit --agent`를 직접 실행하는 것은 차단합니다.")
    if words[0] == "code":
        return "CodeRabbit 클라우드 코딩 에이전트(`coderabbit code`)는 코드를 고치거나 push 하므로 이 하네스에서 쓰지 않습니다."
    if words[0] == "update":
        return "CodeRabbit CLI 업데이트는 사용자가 직접 합니다 (판정 형식이 바뀔 수 있어 버전을 고정)."
    if words[0] == "auth":
        return "CodeRabbit 로그인·로그아웃은 사용자가 터미널에서 직접 합니다 (`coderabbit auth status --agent`로 확인만)."
    return (f"`coderabbit {words[0]}`는 이 하네스에서 허용하지 않습니다 (허용: auth status, doctor, usage, stats, "
            f"pullrequest, review findings, config 조회, --version).")


def user_allows_push(gdir, session_id):
    """사용자가 "commit and push해"처럼 직접 지시했으면(user-grant 훅 기록) 보호 브랜치 commit·push 허용."""
    root = L.git_root(gdir)
    return bool(root and L.read_grant(root, "push", session_id))


def check(command, cwd, session_id=""):
    for pat, label in DANGEROUS:
        if pat.search(command):
            return f"위험한 명령어가 감지되었습니다: {label}"

    if any(PROTECTED_RECORD.search(seg) and WRITE_HINT.search(seg) for seg in SEPARATORS.split(command)):
        return ("SDD 승인(approval.json), TDD 기록(tdd-log.jsonl), 하네스 설정(.harness/config.json), "
                "하네스 상태(~/.claude/harness/state)는 훅만 기록하고, CodeRabbit 정책(~/.claude/harness/coderabbit.json)은 "
                "사용자만 바꿉니다. "
                "승인은 사용자가 `/sdd approve <기능ID>`를 직접 입력해야 합니다.")

    if GH_API_PR_CREATE.search(command):
        return "gh api 로 PR 을 만들 수 없습니다. `gh pr create`를 쓰세요 (검증 게이트 적용)."
    cur = cwd
    for seg in segments(command):
        tokens = split_tokens(seg)
        moved = next_dir(cur, tokens)
        if moved:
            cur = moved
            continue
        tokens, envs, chdir = normalize(tokens)
        here_dir = moved_by(cur, chdir)
        reason = check_coderabbit(tokens)
        if reason:
            return reason
        if len(tokens) >= 3 and os.path.basename(tokens[0]) == "gh" and tokens[1] == "pr":
            if tokens[2] == "merge":  # 허용 기록을 쓰므로 따라간 위치 한 곳에서만 본다
                reason = check_merge(tokens[3:], here_dir, session_id, envs)
            elif tokens[2] in ("create", "new"):
                reason = next(filter(None, (check_pr_create(tokens[3:], d, session_id, envs)
                                            for d in candidate_dirs(here_dir, cwd))), None)
            elif tokens[2] == "edit":
                reason = next(filter(None, (check_pr_edit(tokens[3:], d, envs) for d in candidate_dirs(here_dir, cwd))),
                              None)
            if reason:
                return reason

    cur = cwd
    branch = branch0 = current_branch(cwd)  # 따라간 위치의 브랜치 / 원래 위치의 브랜치
    for seg in segments(command):
        tokens = split_tokens(seg)
        moved = next_dir(cur, tokens)
        if moved:
            cur, branch = moved, current_branch(moved)
            continue
        tokens, _, chdir = normalize(tokens)
        sub, args, cdir = git_args(tokens)
        if sub is None:
            continue
        if sub == "push" and ("--mirror" in args or "--all" in args):
            return "git push --mirror/--all 은 보호 브랜치를 덮어쓸 수 있어 차단합니다."
        if sub in ("checkout", "switch"):
            # 같은 명령 안에서 브랜치를 바꾼 뒤 merge/commit/push 하는 경우를 추적한다
            names = [a for a in args if not a.startswith("-")]
            create = next((i for i, a in enumerate(args) if a in ("-b", "-B", "-c", "-C")), None)
            if create is not None and create + 1 < len(args):
                branch = branch0 = args[create + 1]
            elif "--" not in args and len(names) == 1:
                branch = branch0 = names[0]
            continue
        base_dir = moved_by(cur, chdir)
        places = [(base_dir, None if chdir else branch)]
        if base_dir != cwd:
            places.append((cwd, branch0))  # 이동이 서브셸 안이었다면 원래 위치에서 실행된다 — 둘 다 본다
        for d, br in places:
            gdir = d if cdir is None else os.path.join(d, cdir)
            reason = protected_reason(sub, args, gdir, br if cdir is None and br is not None else current_branch(gdir),
                                      session_id)
            if reason:
                return reason
    return None


def protected_reason(sub, args, gdir, here, session_id):
    """main/master 직접 commit·push 차단 사유 (사용자 지시가 있으면 None)."""
    if sub in ("push", "commit") and user_allows_push(gdir, session_id):
        return None  # 사용자가 commit·push 를 직접 지시함 (force push 는 DANGEROUS 에서 계속 차단)
    if sub == "push":
        positional = [a for a in args if not a.startswith("-")]
        refs = positional[1:]
        for ref in refs:
            dst = here if ref == "HEAD" else refspec_targets(ref)
            if dst in PROTECTED or (ref.startswith(":") and ref[1:] in PROTECTED):
                return (f"'{dst}' 브랜치로 직접 push 는 사용자의 지시가 있어야 합니다. feature 브랜치에 push 후 PR 을 "
                        f"만들거나, 사용자가 입력창에 `commit and push해`/`푸시해`를 직접 입력하면 이후 계속 허용됩니다.")
        if not refs and here in PROTECTED:
            return (f"현재 브랜치가 '{here}' 입니다. 보호 브랜치로 직접 push 는 사용자의 지시가 있어야 합니다 "
                    f"(사용자가 `commit and push해`/`푸시해` 입력 시 이후 계속 허용).")
    elif sub == "commit" and here in PROTECTED and has_commits(gdir):
        return (f"'{here}' 브랜치에 직접 commit 은 사용자의 지시가 있어야 합니다. feature 브랜치를 만들거나 "
                f"(git switch -c feat-<name>), 사용자가 `commit and push해`/`커밋해`를 직접 입력하면 이후 계속 허용됩니다.")
    return None


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        return 0
    command = (data.get("tool_input") or {}).get("command") or ""
    cwd = data.get("cwd") or os.getcwd()
    reason = check(command, cwd, data.get("session_id", ""))
    if reason:
        print(f"BLOCKED: {reason}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())

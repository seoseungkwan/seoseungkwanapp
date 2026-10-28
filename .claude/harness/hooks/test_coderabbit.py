"""CodeRabbit 리뷰 게이트 테스트. 실행: python3 -m pytest ~/.claude/harness/hooks/test_coderabbit.py

진짜 CodeRabbit CLI 는 부르지 않는다. 정책(coderabbit.json)의 cli 를 가짜 `coderabbit` 경로로 두고
(~/.local/bin 은 PATH 에서 뺀다), HOME 을 임시 폴더로 바꿔 정책과 state 기록을 격리한다.
"""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

HOOKS = Path(__file__).resolve().parent
HARNESS = HOOKS.parent
sys.path.insert(0, str(HOOKS))
sys.path.insert(0, str(HARNESS / "lib"))
UG = __import__("importlib").import_module("user-grant")
import crlib as CR  # noqa: E402

FAKE_CR = r'''#!/usr/bin/env python3
import json, os, sys, time
with open(os.environ["FAKE_CR_LOG"], "a") as f:
    f.write(" ".join(sys.argv[1:]) + "\n")
with open(os.environ["FAKE_CR_LOG"] + ".env", "w") as f:
    json.dump({k: v for k, v in os.environ.items()
               if k.startswith(("CODERABBIT", "CR_CLI", "NODE_", "HTTPS_PROXY", "GIT_"))}, f)
if sys.argv[1:2] == ["--version"]:
    print(os.environ.get("FAKE_CR_VERSION", "0.9.1"))
    sys.exit(0)
if os.environ.get("FAKE_CR_SLEEP"):
    time.sleep(float(os.environ["FAKE_CR_SLEEP"]))
if os.environ.get("FAKE_CR_TOUCH"):
    with open(os.environ["FAKE_CR_TOUCH"], "a") as f:
        f.write("# changed during review\n")
sys.stdout.write(open(os.environ["FAKE_CR_OUT"]).read())
sys.exit(int(os.environ.get("FAKE_CR_EXIT", "0")))
'''

PKG = {"name": "t", "scripts": {"test": "node -e \"process.exit(require('fs').existsSync('FAIL')?1:0)\""}}
PR = "gh pr create --draft --base main --title t --body b"


def ev(**k):
    return json.dumps(k)


def complete(n, **k):
    return ev(type="complete", status="review_completed", findings=n, message="Review completed", **k)


def finding(sev, name="src/a.py", **k):
    return ev(type="finding", severity=sev, fileName=name, title=f"{sev} issue", comment=f"{sev} 설명",
              codegenInstructions="고치는 방법", startLine=3, **k)


CLEAN = [ev(type="status", status="reviewing"), ev(type="heartbeat"), finding("minor"), complete(1)]
BLOCKED = [finding("major"), finding("critical", "src/b.py"), finding("trivial"), complete(3)]


def git(cwd, *args):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True)


@pytest.fixture
def fake(tmp_path):
    d = tmp_path / "fakebin"
    d.mkdir()
    p = d / "coderabbit"
    p.write_text(FAKE_CR)
    p.chmod(0o755)
    return {"bin": d, "cli": p, "log": tmp_path / "cr.log", "out": tmp_path / "cr.out"}


def set_policy(home, fake=None, **kw):
    pol = {"repos": ["o/r"], "timeout": 30, "tests": {"o/r": "none"}, "python": sys.executable}
    if fake:
        pol["cli"] = str(fake["cli"])
    pol.update(kw)
    (home / ".claude" / "harness" / "coderabbit.json").write_text(json.dumps(pol))


@pytest.fixture
def home(tmp_path, fake):
    h = tmp_path / "home"
    (h / ".claude" / "harness").mkdir(parents=True)
    set_policy(h, fake)
    return h


def make_repo(path, remote="https://github.com/o/r.git"):
    path.mkdir()
    git(path, "init", "-q", "-b", "main")
    git(path, "config", "user.email", "t@t")
    git(path, "config", "user.name", "t")
    if remote:
        git(path, "remote", "add", "origin", remote)
    git(path, "commit", "-q", "--allow-empty", "-m", "init")
    git(path, "switch", "-q", "-c", "feat-x")
    (path / "src").mkdir()
    (path / "src" / "a.py").write_text("x = 1\n")
    git(path, "add", ".")
    git(path, "commit", "-q", "-m", "feat")
    return path


def commit_all(repo, msg="change"):
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", msg)


def pushed(repo):
    """git push 를 흉내 낸다: origin/<브랜치>를 지금 커밋으로."""
    branch = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=repo, capture_output=True,
                            text=True).stdout.strip()
    git(repo, "update-ref", f"refs/remotes/origin/{branch}", "HEAD")


@pytest.fixture
def repo(tmp_path):
    return make_repo(tmp_path / "repo")


@pytest.fixture
def npm_repo(tmp_path):
    p = make_repo(tmp_path / "npm")
    (p / "package.json").write_text(json.dumps(PKG))
    commit_all(p, "pkg")
    return p


@pytest.fixture
def outside(tmp_path):
    d = tmp_path / "outside"
    d.mkdir()
    return d


def env(home, fake=None, **extra):
    node = shutil.which("node")
    path = [str(fake["bin"])] if fake else []
    if node:
        path.append(str(Path(node).parent))
    path += ["/usr/bin", "/bin"]
    e = {"HOME": str(home), "PATH": ":".join(path)}
    if fake:
        e.update(FAKE_CR_LOG=str(fake["log"]), FAKE_CR_OUT=str(fake["out"]))
    e.update(extra)
    return e


def cr_review(cwd, home, fake, lines=CLEAN, code=0, args=(), **extra):
    fake["out"].write_text("\n".join(lines) + "\n")
    extra.setdefault("FAKE_CR_EXIT", str(code))
    return subprocess.run([sys.executable, str(HARNESS / "bin" / "cr-review"), *args], cwd=cwd,
                          capture_output=True, text=True, env=env(home, fake, **extra))


def calls(fake):
    return [l for l in fake["log"].read_text().splitlines() if l != "--version"] if fake["log"].exists() else []


def guard(cmd, cwd, home):
    payload = {"tool_name": "Bash", "tool_input": {"command": cmd}, "cwd": str(cwd), "session_id": "s1"}
    r = subprocess.run([sys.executable, str(HOOKS / "guard-bash.py")], input=json.dumps(payload),
                       capture_output=True, text=True, env=env(home))
    return r.returncode, r.stderr


def prompt(text, cwd, home):
    payload = {"prompt": text, "cwd": str(cwd), "session_id": "s1"}
    r = subprocess.run([sys.executable, str(HOOKS / "user-grant.py")], input=json.dumps(payload),
                       capture_output=True, text=True, env=env(home))
    return json.loads(r.stdout) if r.stdout.strip() else {}


def verify(cwd, home):
    return subprocess.run([sys.executable, str(HARNESS / "bin" / "verify")], cwd=cwd,
                          capture_output=True, text=True, env=env(home))


def passed(repo, home, fake, **kw):
    """리뷰 통과 + push 까지 마친 상태."""
    r = cr_review(repo, home, fake, **kw)
    assert r.returncode == 0, r.stdout + r.stderr
    pushed(repo)


# --- 출력 판정 (공식 플러그인의 판정 규칙 + 더 엄격한 조건) ----------------------------------

def parse(lines, code=0, gate="major", truncated=False):
    return CR.parse_review("\n".join(lines) + "\n", code, gate, truncated)


def test_parse_pass_with_minor_findings_only():
    r = parse(CLEAN)
    assert r["state"] == "pass"
    assert r["counts"] == {"minor": 1}


def test_parse_blocked_on_major_or_critical():
    r = parse(BLOCKED, code=2)
    assert r["state"] == "blocked"
    assert sorted(f["severity"] for f in r["blockers"]) == ["critical", "major"]
    assert r["blockers"][0]["location"] in ("src/a.py:3", "src/b.py:3")


def test_parse_blocks_even_if_exit_code_says_clean():
    assert parse([finding("critical"), complete(1)], code=0)["state"] == "blocked"


def test_parse_gate_level_is_configurable():
    assert parse([finding("minor"), complete(1)], code=2, gate="minor")["state"] == "blocked"


def test_parse_accepts_completed_with_warnings_only_when_all_files_reviewed():
    assert parse([complete(0, outcome="completed_with_warnings", unreviewedFileCount=0)])["state"] == "pass"
    assert parse([complete(0, outcome="completed_with_warnings")])["state"] == "unconfirmed"


@pytest.mark.parametrize("lines,code,why", [
    (CLEAN, 1, "종료 코드"),
    (CLEAN, None, "시간"),
    (CLEAN, 3, "종료 코드"),
    ([finding("minor")], 0, "complete"),
    (CLEAN + [complete(1)], 0, "형식"),
    ([finding("minor"), complete(2)], 0, "개수"),
    ([finding("minor"), ev(type="complete", status="review_completed")], 0, "개수"),
    ([finding("minor"), ev(type="complete", status="review_completed", findings=True)], 0, "개수"),
    ([ev(type="complete", status="review_skipped", findings=0, message="No changes detected")], 0, "건너뜀"),
    ([ev(type="complete", status="review_completed", findings=0,
         message="No fresh detailed file review was performed in this run.")], 0, "건너뜀"),
    ([complete(0, outcome="failed")], 0, "outcome"),
    ([complete(0, outcome="partial")], 0, "outcome"),
    ([complete(0, outcome="incomplete")], 0, "outcome"),
    ([complete(0, unreviewedFileCount=2)], 0, "리뷰하지 못한 파일"),
    ([complete(0, unreviewedFileCount=False)], 0, "리뷰하지 못한 파일"),
    ([complete(0, unreviewedFileCount="0")], 0, "리뷰하지 못한 파일"),
    ([finding("Major"), complete(1)], 0, "심각도"),
    ([finding("high"), complete(1)], 0, "심각도"),
    ([ev(type="finding", fileName="a.py", title="t"), complete(1)], 0, "심각도"),
    ([ev(type="error", errorType="rate_limit", message="limit", metadata={"waitTime": "5m"}), complete(0)], 0,
     "사용량 제한"),
    ([ev(type="error", phase="auth", message="nope")], 1, "로그인"),
    (["not json", complete(0)], 0, "형식"),
    (["[1, 2]", complete(0)], 0, "형식"),
    ([ev(type="action_required", status="awaiting_confirmation"), complete(0)], 0, "크레딧"),
    ([finding("minor"), complete(1)], 2, "일치하지"),
    ([ev(type="complete", status="weird", findings=0)], 0, "알 수 없는"),
])
def test_parse_unconfirmed_is_never_pass(lines, code, why):
    r = parse(lines, code)
    assert r["state"] == "unconfirmed", r
    assert why in r["reason"], r["reason"]


def test_parse_truncated_output_is_unconfirmed():
    assert parse(CLEAN, truncated=True)["state"] == "unconfirmed"


@pytest.mark.parametrize("secret", [  # 가짜 값. 비밀값 검사기가 오해하지 않게 접두어를 나눠 적는다
    "gh" "p_abcdefghijklmnopqrstuvwxyz0123", "sk" "-ant-abcdefghijklmnop", "cr" "-1234567890abcdefABCDEF12",
    "Authorization: Bearer abcdefghijklmnop12345", "gl" "pat-abcdefghij1234567890", "np" "m_abcdefghijklmnop1234",
    "sb" "_secret_abcdefghijklmnop", "postgres://user:hunter2pass@db.example.com/x", "X_API_KEY=abcdefghijklmnop1234",
])
def test_redact_masks_secrets(secret):
    out = CR.redact(f"see {secret} here")
    assert "***" in out
    for part in ("abcdefghij", "1234567890ab", "hunter2pass"):
        assert part not in out


def test_redact_keeps_ordinary_paths():
    assert CR.redact("src/cr-review-utils.ts:3 token = getToken()") == "src/cr-review-utils.ts:3 token = getToken()"


# --- 정책 --------------------------------------------------------------------------------

@pytest.mark.parametrize("content", ["{bad json", '{"repos": "o/r"}', None])
def test_broken_or_missing_policy_gates_every_github_repo(tmp_path, home, content):
    other = make_repo(tmp_path / "other", remote="git@github.com:o/other.git")
    policy = home / ".claude" / "harness" / "coderabbit.json"
    assert guard(PR, other, home)[0] == 0
    if content is None:
        policy.unlink()
    else:
        policy.write_text(content)
    code, err = guard(PR, other, home)
    assert code == 2 and "CodeRabbit" in err


def test_repo_slug_formats(tmp_path):
    for i, url in enumerate(("https://github.com/O/R.git", "git@github.com:o/r.git", "https://x-token@github.com/o/r",
                             "ssh://git@github.com/o/r.git")):
        p = tmp_path / f"r{i}"
        p.mkdir()
        git(p, "init", "-q")
        git(p, "remote", "add", "origin", url)
        assert CR.repo_slug(p) == "o/r", url
    assert CR.slug_of("o/r") == "o/r" and CR.slug_of("github.com/O/R") == "o/r"
    assert CR.slug_of("gitlab.com/o/r") is None


# --- cr-review 실행 -------------------------------------------------------------------

def test_cr_review_pass_records_and_allows_pr(repo, home, fake):
    (repo / "CLAUDE.md").write_text("rules\n")
    commit_all(repo, "docs")
    pushed(repo)
    assert guard(PR, repo, home)[0] == 2
    r = cr_review(repo, home, fake)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "통과" in r.stdout and "minor" in r.stdout
    argv = calls(fake)[-1].split()
    assert argv[:2] == ["review", "--agent"] and "--committed" in argv
    assert argv[argv.index("--gate") + 1] == "major"
    assert argv[argv.index("--base") + 1] == "main"
    assert argv[argv.index("-c") + 1] == "CLAUDE.md"
    assert guard(PR, repo, home)[0] == 0


def test_pr_blocked_without_cr_record(repo, home):
    pushed(repo)
    code, err = guard(PR, repo, home)
    assert code == 2 and "CodeRabbit" in err and "cr-review" in err


def test_cr_gate_only_for_listed_repos(tmp_path, home):
    other = make_repo(tmp_path / "other", remote="git@github.com:o/other.git")
    assert guard(PR.replace(" --base main", ""), other, home)[0] == 0
    unlisted = make_repo(tmp_path / "noremote", remote=None)
    assert guard(PR.replace(" --base main", ""), unlisted, home)[0] == 0


def test_pr_allow_does_not_skip_cr_gate(repo, home):
    pushed(repo)
    prompt("PR-ALLOW", repo, home)
    assert guard(PR, repo, home)[0] == 2


def test_pr_blocked_after_change_since_review(repo, home, fake):
    passed(repo, home, fake)
    (repo / "src" / "a.py").write_text("x = 2\n")
    code, err = guard(PR, repo, home)
    assert code == 2 and "커밋" in err
    commit_all(repo)
    pushed(repo)
    code, err = guard(PR, repo, home)
    assert code == 2 and "바뀌었" in err


def test_doc_change_after_review_needs_new_review(repo, home, fake):
    """claude-harness 처럼 .md 가 실제 동작(명령·에이전트 정의)인 저장소가 있어 문서도 리뷰 대상이다."""
    passed(repo, home, fake)
    (repo / "AGENT.md").write_text("new instructions\n")
    commit_all(repo)
    pushed(repo)
    assert guard(PR, repo, home)[0] == 2


def test_pr_requires_pushed_branch(repo, home, fake):
    assert cr_review(repo, home, fake).returncode == 0
    code, err = guard(PR, repo, home)
    assert code == 2 and "push" in err
    pushed(repo)
    assert guard(PR, repo, home)[0] == 0


def test_pr_base_must_be_explicit_and_match_review(repo, home, fake):
    passed(repo, home, fake)
    assert guard(PR, repo, home)[0] == 0
    assert guard("gh pr create -B main -t t -b b", repo, home)[0] == 0
    for cmd in ("gh pr create -t t -b b",                      # base 없음
                "gh pr create --base feat-y -t t -b b",        # 리뷰한 base 와 다름
                "gh pr create -Bfeat-y -t t -b b",             # 붙여 쓴 옵션
                "gh pr create -B=feat-y -t t -b b",
                "gh pr create -dBfeat-y -t t -b b",
                "gh pr create --base main --base feat-y -t t -b b"):
        assert guard(cmd, repo, home)[0] == 2, cmd
    git(repo, "branch", "feat-y", "main")
    assert cr_review(repo, home, fake, args=("--base", "feat-y")).returncode == 0
    assert guard("gh pr create --base=feat-y -t t -b b", repo, home)[0] == 0


def test_pr_title_with_dash_b_is_not_a_flag(repo, home, fake):
    passed(repo, home, fake)
    assert guard("gh pr create --base main -t '-Bold title' -b '-H body'", repo, home)[0] == 0


@pytest.mark.parametrize("cmd", [
    "gh pr new --draft --base main -t t -b b",
    "GH_DEBUG=1 gh pr create --base main -t t -b b",
    "env gh pr create --base main -t t -b b",
    "env -u FOO gh pr create --base main -t t -b b",
    "command gh pr create --base main -t t -b b",
    "timeout 60 gh pr create --base main -t t -b b",
    "nohup gh pr create --base main -t t -b b",
])
def test_pr_create_variants_are_gated(cmd, repo, home):
    pushed(repo)
    code, err = guard(cmd, repo, home)
    assert code == 2 and "CodeRabbit" in err, cmd


@pytest.mark.parametrize("form", [
    "cd {repo} && gh pr create --base main -t t -b b",
    "cd {repo}; gh pr new --base main -t t -b b",
    "(cd {repo} && gh pr create --base main -t t -b b)",
    "( cd {repo} && gh pr create --base main -t t -b b )",
    "{{ cd {repo}; gh pr create --base main -t t -b b; }}",
    "env -C {repo} gh pr create --base main -t t -b b",
    "env --chdir={repo} gh pr create --base main -t t -b b",
    "x=$(cd {repo} && gh pr create --base main -t t -b b)",
])
def test_pr_create_moving_into_cr_repo_is_gated(form, repo, home, outside, tmp_path):
    """대상 아닌 저장소 안(이동을 놓치면 허용됨)과 저장소 밖(못 찾으면 차단) 두 곳에서 확인한다."""
    pushed(repo)
    other = make_repo(tmp_path / "other", remote="git@github.com:o/other.git")
    cmd = form.format(repo=repo)
    assert guard(cmd, other, home)[0] == 2, cmd
    assert guard(cmd, outside, home)[0] == 2, cmd


def test_move_inside_subshell_still_checks_original_repo(repo, home, tmp_path):
    """서브셸 안에서만 다른 곳으로 옮긴 뒤 밖에서 실행하는 명령은 원래 저장소 기준으로도 본다."""
    pushed(repo)
    other = make_repo(tmp_path / "other", remote="git@github.com:o/other.git")
    assert guard(f"x=$(cd {other}); gh pr create --base main -t t -b b", repo, home)[0] == 2
    assert guard(f"(cd {other}); gh pr create --base main -t t -b b", repo, home)[0] == 2
    git(repo, "switch", "-q", "main")
    assert guard(f"(cd {other}); git push", repo, home)[0] == 2
    assert guard(f"(cd {other}) && git commit -m x", repo, home)[0] == 2


def test_pr_create_outside_any_repo_is_gated(home, outside):
    code, err = guard("gh pr create --base main -t t -b b", outside, home)
    assert code == 2 and "저장소" in err


def test_background_ampersand_is_a_separator(repo, home, fake):
    pushed(repo)
    assert guard("true & gh pr create --base main -t t -b b", repo, home)[0] == 2
    passed(repo, home, fake)
    assert guard("gh pr create --base main -t t -b b 2>&1", repo, home)[0] == 0
    assert guard("gh pr create --base main -t t -b b &> /tmp/out", repo, home)[0] == 0
    git(repo, "switch", "-q", "main")
    assert guard("git push origin main 2>&1", repo, home)[0] == 2
    assert guard("true & git push origin main", repo, home)[0] == 2


def test_non_cr_repo_unaffected_by_odd_flags(tmp_path, home):
    other = make_repo(tmp_path / "other", remote="git@github.com:o/other.git")
    assert guard("gh pr create -Bdev -t t -b b", other, home)[0] == 0
    assert guard("gh pr create -dB dev -t t -b b", other, home)[0] == 0
    assert guard("gh pr create -dRo/r -t t -b b", other, home)[0] == 2  # 숨은 -R 은 대상 저장소일 수 있다


@pytest.mark.parametrize("cmd", [
    "gh pr create -R o/r -H feat-x -B main -t t -b b",
    "gh pr create --repo github.com/o/r -B main -t t -b b",
    "GH_REPO=o/r gh pr create -B main -t t -b b",
    "gh pr create -Ro/r -B main -t t -b b",
])
def test_pr_create_with_repo_flag_from_outside_is_gated(cmd, home, outside):
    assert guard(cmd, outside, home)[0] == 2, cmd


def test_pr_head_and_other_repo_blocked_even_after_pass(repo, home, fake):
    passed(repo, home, fake)
    assert guard(PR + " -H feat-x", repo, home)[0] == 2
    assert guard(PR + " --head=feat-old", repo, home)[0] == 2
    assert guard(PR + " -R o/other", repo, home)[0] == 2
    assert guard(PR + " -R o/r", repo, home)[0] == 0  # 같은 저장소면 괜찮다
    assert guard("gh pr new --base main -t t -b b", repo, home)[0] == 0


def test_graphql_pr_mutations_blocked(repo, home):
    q = 'gh api graphql -f query="mutation { %s(input:{}) { clientMutationId } }"'
    for m in ("createPullRequest", "mergePullRequest", "enablePullRequestAutoMerge"):
        assert guard(q % m, repo, home)[0] == 2, m
    assert guard('gh api graphql -f query="{ viewer { login } }"', repo, home)[0] == 0


def test_pr_edit_base_blocked_in_cr_repo(repo, home, tmp_path):
    assert guard("gh pr edit 3 --base develop", repo, home)[0] == 2
    assert guard("gh pr edit 3 --add-label x", repo, home)[0] == 0
    other = make_repo(tmp_path / "other", remote="git@github.com:o/other.git")
    assert guard("gh pr edit 3 --base develop", other, home)[0] == 0


def test_blocked_review_counts_rounds_per_repo_and_stops_at_max(repo, home, fake):
    for i in (1, 2, 3):
        r = cr_review(repo, home, fake, BLOCKED, code=2)
        assert r.returncode == 2, r.stdout + r.stderr
        assert f"{i}/3" in r.stdout and "src/b.py:3" in r.stdout and "critical" in r.stdout
    assert "멈" in r.stdout and "CR-RESET" in r.stdout
    n = len(calls(fake))
    r = cr_review(repo, home, fake, CLEAN)
    assert r.returncode == 3 and "CR-RESET" in r.stdout
    git(repo, "switch", "-q", "-c", "feat-x-2")  # 브랜치를 바꿔도 횟수는 그대로
    assert cr_review(repo, home, fake, CLEAN).returncode == 3
    assert len(calls(fake)) == n  # 4번째부터는 CodeRabbit 을 부르지도 않는다
    pushed(repo)
    assert guard(PR, repo, home)[0] == 2
    out = prompt("CR-RESET", repo, home)
    assert "초기화" in out["systemMessage"]
    assert cr_review(repo, home, fake, CLEAN).returncode == 0
    assert guard(PR, repo, home)[0] == 0


def test_pass_resets_rounds(repo, home, fake):
    assert cr_review(repo, home, fake, BLOCKED, code=2).returncode == 2
    assert cr_review(repo, home, fake, CLEAN).returncode == 0
    for _ in range(3):
        assert cr_review(repo, home, fake, BLOCKED, code=2).returncode == 2


def test_unconfirmed_does_not_count_round_or_record(repo, home, fake):
    for _ in range(4):
        r = cr_review(repo, home, fake, CLEAN, code=1)
        assert r.returncode == 1 and "통과로 보지 않" in r.stdout
    pushed(repo)
    assert guard(PR, repo, home)[0] == 2
    assert "1/3" in cr_review(repo, home, fake, BLOCKED, code=2).stdout


def test_requires_clean_tree(repo, home, fake):
    (repo / "src" / "a.py").write_text("x = 3\n")
    r = cr_review(repo, home, fake)
    assert r.returncode == 1 and "커밋" in r.stdout
    assert calls(fake) == []


def test_requires_passing_tests_first(npm_repo, home, fake):
    r = cr_review(npm_repo, home, fake)
    assert r.returncode == 1 and "verify" in r.stdout
    assert calls(fake) == []
    assert verify(npm_repo, home).returncode == 0
    assert cr_review(npm_repo, home, fake).returncode == 0
    pushed(npm_repo)
    assert guard(PR, npm_repo, home)[0] == 0


def test_failing_tests_keep_pr_blocked(npm_repo, home, fake):
    assert verify(npm_repo, home).returncode == 0
    assert cr_review(npm_repo, home, fake).returncode == 0
    (npm_repo / "FAIL").write_text("1")
    assert verify(npm_repo, home).returncode == 1
    commit_all(npm_repo, "fail")
    pushed(npm_repo)
    assert guard(PR, npm_repo, home)[0] == 2


def test_cr_repo_without_test_command_is_refused(repo, home, fake):
    set_policy(home, fake, tests={})
    r = cr_review(repo, home, fake)
    assert r.returncode == 1 and "테스트 명령" in r.stdout
    assert calls(fake) == []


def test_python_tests_detected_and_required(repo, home, fake):
    set_policy(home, fake, tests={})
    (repo / "pkg").mkdir()
    (repo / "pkg" / "test_ok.py").write_text("def test_ok():\n    assert True\n")
    commit_all(repo, "tests")
    r = cr_review(repo, home, fake)
    assert r.returncode == 1 and "verify" in r.stdout
    v = verify(repo, home)
    assert v.returncode == 0, v.stdout
    assert "-m pytest -q 'pkg'" in v.stdout
    assert cr_review(repo, home, fake).returncode == 0
    pushed(repo)
    assert guard(PR, repo, home)[0] == 0
    (repo / "pkg" / "test_ok.py").write_text("def test_ok():\n    assert False\n")
    commit_all(repo, "break")
    assert verify(repo, home).returncode == 1
    pushed(repo)
    assert guard(PR, repo, home)[0] == 2


def test_cli_found_only_at_policy_path_not_path(repo, home, fake, tmp_path):
    set_policy(home, fake, cli=str(tmp_path / "nowhere" / "coderabbit"))
    r = cr_review(repo, home, fake)  # PATH 앞에 가짜 coderabbit 이 있어도 쓰지 않는다
    assert r.returncode == 1 and "설치" in r.stdout
    assert calls(fake) == []
    pushed(repo)
    assert guard(PR, repo, home)[0] == 2


def test_cli_version_must_match_policy(repo, home, fake):
    r = cr_review(repo, home, fake, FAKE_CR_VERSION="0.9.2")
    assert r.returncode == 1 and "버전" in r.stdout
    assert calls(fake) == []


def test_cli_runs_with_sanitized_env(repo, home, fake, tmp_path):
    other = make_repo(tmp_path / "other")
    r = cr_review(repo, home, fake, CODERABBIT_HOST_URL="http://localhost:1", CR_CLI_ALLOW_UNTRUSTED_HOST_URL="true",
                  NODE_EXTRA_CA_CERTS="/tmp/ca.pem", HTTPS_PROXY="http://localhost:2",
                  GIT_DIR=str(other / ".git"), GIT_CONFIG_COUNT="1", GIT_CONFIG_KEY_0="core.attributesFile",
                  GIT_CONFIG_VALUE_0="/tmp/attrs")
    assert r.returncode == 0, r.stdout
    seen = json.loads(Path(str(fake["log"]) + ".env").read_text())
    assert seen == {"CODERABBIT_CLI_DISABLE_AUTO_UPDATE": "true"}
    rec = json.loads(next((home / ".claude" / "harness" / "state").glob("cr-reviewed-*.json")).read_text())
    assert rec["root"] == str(repo)  # GIT_DIR 로 다른 저장소를 가리켜도 무시된다


def test_same_named_test_files_in_different_dirs(repo, home, fake):
    set_policy(home, fake, tests={})
    for d in ("scripts", ".claude/harness/scripts"):
        (repo / d).mkdir(parents=True)
        (repo / d / "test_execute.py").write_text(f"def test_{d.count('/')}():\n    assert True\n")
    commit_all(repo, "tests")
    v = verify(repo, home)
    assert v.returncode == 0, v.stdout
    assert "'.claude/harness/scripts'" in v.stdout and "'scripts'" in v.stdout


def test_uncommitted_new_test_files_are_run(repo, home, fake):
    set_policy(home, fake, tests={})
    (repo / "test_old.py").write_text("def test_old():\n    assert True\n")
    commit_all(repo, "old test")
    (repo / "new").mkdir()
    (repo / "new" / "test_new.py").write_text("def test_new():\n    assert False\n")  # 아직 git add 안 함
    v = verify(repo, home)
    assert v.returncode == 1 and "'new'" in v.stdout, v.stdout
    commit_all(repo, "new test")
    assert verify(repo, home).returncode == 1
    pushed(repo)
    assert guard(PR, repo, home)[0] == 2


def test_missing_test_interpreter_fails_with_clear_message(repo, home, fake, tmp_path):
    set_policy(home, fake, tests={}, python=str(tmp_path / "no-python"))
    (repo / "test_x.py").write_text("def test_x():\n    pass\n")
    commit_all(repo)
    v = verify(repo, home)
    assert v.returncode == 1 and "사용자에게 요청" in v.stdout


def test_cr_npm_repo_without_test_script_is_refused(repo, home, fake):
    set_policy(home, fake, tests={})
    (repo / "package.json").write_text(json.dumps({"name": "t", "scripts": {"lint": "true", "build": "true"}}))
    commit_all(repo)
    assert verify(repo, home).returncode == 0
    r = cr_review(repo, home, fake)
    assert r.returncode == 1 and "테스트 명령" in r.stdout
    assert calls(fake) == []
    pushed(repo)
    code, err = guard(PR, repo, home)
    assert code == 2 and "테스트 명령" in err


def test_unconfirmed_result_does_not_store_findings(repo, home, fake):
    r = cr_review(repo, home, fake, [finding("major"), complete(1)], code=1)
    assert r.returncode == 1 and "major issue" not in r.stdout
    last = json.loads(next((home / ".claude" / "harness" / "state").glob("cr-last-*.json")).read_text())
    assert last["state"] == "unconfirmed" and last["findings"] == []


def test_rounds_shared_across_worktrees(repo, home, fake, tmp_path):
    for _ in range(3):
        assert cr_review(repo, home, fake, BLOCKED, code=2).returncode == 2
    wt = tmp_path / "wt"
    git(repo, "worktree", "add", "-q", str(wt), "-b", "feat-wt")
    assert cr_review(wt, home, fake, CLEAN).returncode == 3


def test_code_changed_during_review_is_unconfirmed(repo, home, fake):
    r = cr_review(repo, home, fake, FAKE_CR_TOUCH=str(repo / "src" / "a.py"))
    assert r.returncode == 1 and "바뀌" in r.stdout


def test_timeout_is_unconfirmed(repo, home, fake):
    set_policy(home, fake, timeout=1)
    r = cr_review(repo, home, fake, FAKE_CR_SLEEP="5")
    assert r.returncode == 1 and "시간" in r.stdout


# --- merge: CodeRabbit 저장소에서는 PR 번호마다 1회용 ---------------------------------------

def test_merge_without_number_not_granted_in_cr_repo(repo, home):
    out = prompt("merge해", repo, home)
    assert "번호" in out["systemMessage"]
    assert guard("gh pr merge 3 --merge", repo, home)[0] == 2


def test_merge_grant_is_single_use_per_pr_in_cr_repo(repo, home):
    out = prompt("3번 머지해", repo, home)
    assert "#3" in out["systemMessage"] and "1회" in out["systemMessage"]
    assert guard("gh pr merge 4 --merge", repo, home)[0] == 2
    assert guard("gh pr merge --merge", repo, home)[0] == 2
    assert guard("gh pr merge 3 --merge", repo, home)[0] == 0
    assert guard("gh pr merge 3 --merge", repo, home)[0] == 2  # 다시는 안 됨
    prompt("MERGE-APPROVE 5", repo, home)
    prompt("6번 머지해", repo, home)  # 앞선 #5 는 남는다
    assert guard("gh pr merge 5", repo, home)[0] == 0
    assert guard("gh pr merge 6", repo, home)[0] == 0
    assert guard("gh pr merge 5", repo, home)[0] == 2


def test_merge_auto_and_other_repo_blocked_in_cr_repo(repo, home):
    prompt("MERGE-APPROVE 3", repo, home)
    assert guard("gh pr merge 3 --auto --squash", repo, home)[0] == 2
    assert guard("gh pr merge https://github.com/o/other/pull/3", repo, home)[0] == 2
    assert guard("gh pr merge 3 -R o/other", repo, home)[0] == 2
    assert guard("GH_REPO=o/other gh pr merge 3", repo, home)[0] == 2
    assert guard("gh pr merge https://github.com/o/r/pull/3 --squash", repo, home)[0] == 0


def test_old_unnumbered_grant_ignored_in_cr_repo(repo, home):
    sys_home = os.environ.get("HOME")
    try:
        os.environ["HOME"] = str(home)
        CR.L.write_grant(repo, "merge", "old", None)
    finally:
        os.environ["HOME"] = sys_home
    code, err = guard("gh pr merge 2", repo, home)
    assert code == 2 and "번호" in err


def test_parse_cr_reset():
    assert UG.parse("CR-RESET") == ("cr-reset", None)
    assert UG.parse("cr-reset 해줘?") is None


# --- CodeRabbit 명령 허용 목록 · 정책/기록 보호 ------------------------------------------------

@pytest.mark.parametrize("cmd", [
    "coderabbit review --agent --gate major --committed --base main",
    "cr review --plain",
    "coderabbit --agent",
    "coderabbit",
    "coderabbit review --agent --use-credits",
    "coderabbit review --use-credits=true",
    "coderabbit review findings --clear",
    "coderabbit code push 12",
    "coderabbit code autofix on",
    "coderabbit update",
    "env coderabbit update",
    "coderabbit --dir x update",
    "coderabbit skills",
    "coderabbit auth login",
    "coderabbit auth logout",
    "coderabbit auth login --api-key abc123",
    "coderabbit usage --api-key=abc123",
    "coderabbit config apply x.yaml --base none --yes",
    "CODERABBIT_X=1 ~/.local/bin/coderabbit update",
    "cd x && coderabbit code new 'fix it'",
])
def test_guard_blocks_coderabbit_commands_outside_allowlist(cmd, repo, home):
    assert guard(cmd, repo, home)[0] == 2, cmd


@pytest.mark.parametrize("cmd", [
    "coderabbit auth status --agent",
    "coderabbit doctor",
    "coderabbit usage",
    "coderabbit usage --agent",
    "coderabbit stats",
    "coderabbit --version",
    "coderabbit -v",
    "coderabbit --help",
    "coderabbit pullrequest 3 --show-prompts --agent",
    "coderabbit review findings",
    "coderabbit config --agent",
    "~/.claude/harness/bin/cr-review",
    "python3 ~/.claude/harness/bin/cr-review --base main",
    "cat ~/.claude/harness/coderabbit.json",
    "ls ~/.claude/harness/state",
])
def test_guard_allows_safe_coderabbit_commands(cmd, repo, home):
    assert guard(cmd, repo, home)[0] == 0, cmd


def test_policy_and_records_protected(repo, home):
    policy = home / ".claude" / "harness" / "coderabbit.json"
    for cmd in (f"echo '{{}}' > {policy}",
                "sed -i 's/major/info/' ~/.claude/harness/coderabbit.json",
                f"cd {home}/.claude/harness && sed -i 's/major/info/' coderabbit.json",
                f"cd {home}/.claude/harness && python3 -c 'open(\"coderabbit.json\",\"w\")'",
                f"cd {home}/.claude/harness/state && rm cr-rounds-abc.json",
                f"cd {home}/.claude/harness/state && echo '{{}}' > cr-reviewed-abc.json",
                "cp /tmp/x.json cr-last-abc.json"):
        assert guard(cmd, repo, home)[0] == 2, cmd
    for tool in ("Write", "Edit"):
        payload = {"tool_name": tool, "cwd": str(repo), "tool_input": {"file_path": str(policy), "content": "{}"}}
        r = subprocess.run([sys.executable, str(HOOKS / "sdd-guard.py")], input=json.dumps(payload),
                           capture_output=True, text=True, env=env(home))
        assert json.loads(r.stdout)["hookSpecificOutput"]["permissionDecision"] == "deny"

"""PR 생성 게이트 · 사용자 지시 merge 테스트. 실행: python3 -m pytest ~/.claude/harness/hooks/test_pr_merge.py

실제 git 저장소에서 훅을 subprocess 로 실행한다. HOME 을 임시 폴더로 바꿔 state 기록을 격리한다.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

HOOKS = Path(__file__).resolve().parent
HARNESS = HOOKS.parent
sys.path.insert(0, str(HOOKS))
UG = __import__("importlib").import_module("user-grant")

PKG = {"name": "t", "scripts": {"test": "node -e \"process.exit(require('fs').existsSync('FAIL')?1:0)\""}}


def git(cwd, *args):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True)


def env(home):
    return {"HOME": str(home), "PATH": os.environ["PATH"]}


def guard(cmd, cwd, home, sid="s1"):
    payload = {"tool_name": "Bash", "tool_input": {"command": cmd}, "cwd": str(cwd), "session_id": sid}
    r = subprocess.run([sys.executable, str(HOOKS / "guard-bash.py")], input=json.dumps(payload),
                       capture_output=True, text=True, env=env(home))
    return r.returncode, r.stderr


def prompt(text, cwd, home, sid="s1"):
    payload = {"prompt": text, "cwd": str(cwd), "session_id": sid}
    r = subprocess.run([sys.executable, str(HOOKS / "user-grant.py")], input=json.dumps(payload),
                       capture_output=True, text=True, env=env(home))
    return json.loads(r.stdout) if r.stdout.strip() else {}


def stop(cwd, home, sid="s1"):
    payload = {"cwd": str(cwd), "session_id": sid}
    return subprocess.run([sys.executable, str(HOOKS / "stop-verify.py")], input=json.dumps(payload),
                          capture_output=True, text=True, env=env(home))


def verify(cwd, home):
    return subprocess.run([sys.executable, str(HARNESS / "bin" / "verify")], cwd=cwd,
                          capture_output=True, text=True, env=env(home))


@pytest.fixture
def home(tmp_path):
    h = tmp_path / "home"
    h.mkdir()
    return h


@pytest.fixture
def repo(tmp_path):
    p = tmp_path / "repo"
    p.mkdir()
    git(p, "init", "-q", "-b", "main")
    git(p, "config", "user.email", "t@t")
    git(p, "config", "user.name", "t")
    git(p, "commit", "-q", "--allow-empty", "-m", "init")
    git(p, "switch", "-q", "-c", "feat-x")
    return p


@pytest.fixture
def npm_repo(repo):
    (repo / "package.json").write_text(json.dumps(PKG))
    (repo / "index.js").write_text("module.exports = 1\n")
    return repo


# --- 사용자 지시 해석 ---------------------------------------------------------------

@pytest.mark.parametrize("text,expected", [
    ("이제 merge해", ("merge", None)),
    ("merge 해줘", ("merge", None)),
    ("2번 머지해줘", ("merge", [2])),
    ("PR #3 멀지해", ("merge", [3])),
    ("#2 #3 merge 진행해", ("merge", [2, 3])),
    ("MERGE-APPROVE 2, 3", ("merge", [2, 3])),
    ("MERGE-APPROVE", ("merge", None)),
    ("PR-ALLOW", ("pr", None)),
    ("commit and push해", ("push", None)),
    ("커밋하고 푸시해", ("push", None)),
    ("push해줘", ("push", None)),
    ("commit and push", ("push", None)),
    ("PUSH-APPROVE", ("push", None)),
    ("GRANT-REVOKE", ("revoke", None)),
])
def test_parse_grants(text, expected):
    assert UG.parse(text) == expected


@pytest.mark.parametrize("text", [
    "merge하려면 어떻게해야해", "merge 해?", "Pr차단 넣고 내가 멀지하려면 어떻게해야해",
    "Git merge 차단 풀어", "merge 충돌 났어", "", "직접 push차단은 무슨말이지",
    "그냥 내가 commit and push하면 할 수 있게해", "push 하려면?",
])
def test_parse_ignores_questions_and_other_text(text):
    assert UG.parse(text) is None


# --- merge ---------------------------------------------------------------------------

def test_merge_blocked_without_user_instruction(repo, home):
    code, err = guard("gh pr merge 2 --merge", repo, home)
    assert code == 2 and "사용자의 지시" in err


def test_merge_allowed_after_user_instruction(repo, home):
    out = prompt("이제 merge해", repo, home)
    assert "merge 허용" in out["systemMessage"]
    assert guard("gh pr merge 2 --merge", repo, home)[0] == 0
    assert guard("gh pr merge 3 --squash", repo, home)[0] == 0


def test_merge_grant_limited_to_named_prs(repo, home):
    prompt("2번 머지해줘", repo, home)
    assert guard("gh pr merge 2 --merge", repo, home)[0] == 0
    assert guard("gh pr merge https://github.com/o/r/pull/2", repo, home)[0] == 0
    assert guard("gh pr merge 3 --merge", repo, home)[0] == 2
    assert guard("gh pr merge --merge", repo, home)[0] == 2  # 번호 없음


def test_merge_grant_persists_across_sessions(repo, home):
    prompt("merge해", repo, home, sid="s1")
    assert guard("gh pr merge 2", repo, home, sid="later-session")[0] == 0


def test_grant_revoke(repo, home):
    prompt("merge해", repo, home)
    prompt("commit and push해", repo, home)
    out = prompt("GRANT-REVOKE", repo, home)
    assert "merge" in out["systemMessage"] and "push" in out["systemMessage"]
    assert guard("gh pr merge 2", repo, home)[0] == 2
    git(repo, "switch", "-q", "main")
    assert guard("git push origin main", repo, home)[0] == 2


def test_grant_is_per_repo(repo, home, tmp_path):
    other = tmp_path / "other"
    other.mkdir()
    git(other, "init", "-q", "-b", "main")
    prompt("merge해", repo, home)
    assert guard("gh pr merge 2", other, home)[0] == 2


def test_merge_admin_always_blocked(repo, home):
    prompt("merge해", repo, home)
    assert guard("gh pr merge 2 --admin --merge", repo, home)[0] == 2


def test_api_merge_and_main_push_still_blocked(repo, home):
    prompt("merge해", repo, home)
    assert guard("gh api repos/o/r/pulls/1/merge -X PUT", repo, home)[0] == 2
    assert guard("git push origin main", repo, home)[0] == 2  # merge 지시는 push 허용이 아님


def test_main_commit_push_after_user_instruction(repo, home):
    git(repo, "switch", "-q", "main")
    assert guard("git commit -m x", repo, home)[0] == 2
    assert guard("git push origin main", repo, home)[0] == 2
    out = prompt("커밋하고 푸시해", repo, home)
    assert "commit·push 허용" in out["systemMessage"]
    for cmd in ("git commit -m x", "git push", "git push origin main", "git add . && git commit -m x && git push"):
        assert guard(cmd, repo, home, sid="any")[0] == 0, cmd
    for cmd in ("git push --force origin main", "git push -f", "git push --mirror origin", "git push --all"):
        assert guard(cmd, repo, home)[0] == 2, cmd


def test_git_merge_on_main_allowed(repo, home):
    git(repo, "switch", "-q", "main")
    assert guard("git merge feat-x", repo, home)[0] == 0
    assert guard("git commit -m x", repo, home)[0] == 2  # main 직접 commit 은 계속 차단


def test_grant_files_protected(repo, home):
    state = home / ".claude" / "harness" / "state"
    assert guard(f"echo '{{}}' > {state}/grant-merge-x.json", repo, home)[0] == 2
    assert guard("python3 -c 'open(\"/h/.claude/harness/state/grant-merge-x.json\",\"w\")'", repo, home)[0] == 2
    payload = {"tool_name": "Write", "cwd": str(repo),
               "tool_input": {"file_path": str(state / "grant-merge-x.json"), "content": "{}"}}
    r = subprocess.run([sys.executable, str(HOOKS / "sdd-guard.py")], input=json.dumps(payload),
                       capture_output=True, text=True, env=env(home))
    assert json.loads(r.stdout)["hookSpecificOutput"]["permissionDecision"] == "deny"


# --- PR 생성 게이트 ------------------------------------------------------------------------

def test_pr_create_allowed_without_checks(repo, home):
    assert guard("gh pr create --draft --title t --body b", repo, home)[0] == 0


def test_pr_create_blocked_until_verified(npm_repo, home):
    code, err = guard("gh pr create --draft --title t --body b", npm_repo, home)
    assert code == 2 and "검증" in err
    r = verify(npm_repo, home)
    assert r.returncode == 0, r.stdout
    assert guard("gh pr create --draft --title t --body b", npm_repo, home)[0] == 0


def test_pr_create_blocked_after_code_change(npm_repo, home):
    assert verify(npm_repo, home).returncode == 0
    (npm_repo / "index.js").write_text("module.exports = 2\n")
    code, err = guard("gh pr create --title t --body b", npm_repo, home)
    assert code == 2 and "바뀌었" in err


def test_pr_create_survives_commit_and_doc_change(npm_repo, home):
    assert verify(npm_repo, home).returncode == 0
    (npm_repo / "README.md").write_text("docs\n")
    git(npm_repo, "add", ".")
    git(npm_repo, "commit", "-q", "-m", "feat")
    assert guard("gh pr create --title t --body b", npm_repo, home)[0] == 0


def test_failed_verify_keeps_pr_blocked(npm_repo, home):
    (npm_repo / "FAIL").write_text("1")
    assert verify(npm_repo, home).returncode == 1
    assert guard("gh pr create --title t --body b", npm_repo, home)[0] == 2


def test_stop_verify_pass_records_verification(npm_repo, home):
    r = stop(npm_repo, home)
    assert r.returncode == 0, r.stderr
    assert guard("gh pr create --title t --body b", npm_repo, home)[0] == 0


def test_pr_allow_overrides_gate(npm_repo, home):
    (npm_repo / "FAIL").write_text("1")
    prompt("PR-ALLOW", npm_repo, home)
    assert guard("gh pr create --title t --body b", npm_repo, home)[0] == 0


def test_gh_api_pr_create_blocked(npm_repo, home):
    assert guard("gh api repos/o/r/pulls -X POST -f title=t -f head=feat-x -f base=main", npm_repo, home)[0] == 2
    assert guard("gh api repos/o/r/pulls", npm_repo, home)[0] == 0  # 조회는 허용

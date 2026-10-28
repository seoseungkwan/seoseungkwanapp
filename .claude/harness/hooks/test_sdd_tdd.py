"""SDD/TDD 훅·도구 테스트. 실행: python3 -m pytest ~/.claude/harness/hooks/test_sdd_tdd.py

실제 git 저장소와 python unittest 프로젝트를 만들어 훅을 subprocess 로 실행한다 (훅이 실제로 받는 stdin JSON 형식).
"""
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

HOOKS = Path(__file__).resolve().parent
HARNESS = HOOKS.parent
sys.path.insert(0, str(HARNESS / "lib"))
import sddlib as L  # noqa: E402

REQS = """# 요구사항
### REQ-001: 인사
- AC-001.1: Given 이름, When greet, Then "Hello, 이름!"
- AC-001.2: Given 빈 이름, When greet, Then ValueError
"""
DESIGN = "# 설계\n- greet(name) -> str\n"
TASKS = """# 작업
## TASK-1: greet 구현
- REQ: REQ-001
- Files: greet.py, test_greet.py
- Tests: test_greet.py
- TDD: required
"""
TEST_FAIL = """import unittest
from greet import greet

class T(unittest.TestCase):
    def test_ac_001_1_hello(self):
        self.assertEqual(greet("a"), "Hello, a!")

    def test_ac_001_2_empty(self):
        with self.assertRaises(ValueError):
            greet("")
"""
IMPL = """def greet(name):
    if not name:
        raise ValueError("empty")
    return f"Hello, {name}!"
"""


def git(cwd, *args):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True)


def run_hook(name, payload, home, extra_env=None):
    env = {"HOME": str(home), "PATH": os.environ["PATH"], **(extra_env or {})}
    return subprocess.run([sys.executable, str(HOOKS / name)], input=json.dumps(payload),
                          capture_output=True, text=True, env=env)


def out_json(r):
    return json.loads(r.stdout) if r.stdout.strip() else {}


@pytest.fixture
def home(tmp_path):
    h = tmp_path / "home"
    h.mkdir()
    return h


@pytest.fixture
def proj(tmp_path):
    """SDD 설정된 python 프로젝트, feat-greet 브랜치, 명세 작성됨(미승인)."""
    p = tmp_path / "proj"
    p.mkdir()
    git(p, "init", "-q", "-b", "main")
    git(p, "config", "user.email", "t@t")
    git(p, "config", "user.name", "t")
    (p / "README.md").write_text("x")
    git(p, "add", ".")
    git(p, "commit", "-q", "-m", "init")
    git(p, "switch", "-q", "-c", "feat-greet")
    (p / ".harness").mkdir()
    (p / ".harness/config.json").write_text(json.dumps({"commands": {
        "test": "python3 -m unittest discover -v", "test_file": "python3 -m unittest -v {modules}"}}))
    d = p / "specs/greet"
    d.mkdir(parents=True)
    (d / "requirements.md").write_text(REQS)
    (d / "design.md").write_text(DESIGN)
    (d / "tasks.md").write_text(TASKS)
    return p


def approve(proj, home, fid="greet", prompt=None):
    return run_hook("sdd-approve.py", {"prompt": prompt or f"/sdd approve {fid}", "cwd": str(proj),
                                       "session_id": "s1", "hook_event_name": "UserPromptSubmit"}, home)


def guard(proj, home, rel_path, tool="Write"):
    r = run_hook("sdd-guard.py", {"tool_name": tool, "tool_input": {"file_path": str(proj / rel_path)},
                                  "cwd": str(proj), "hook_event_name": "PreToolUse"}, home)
    assert r.returncode == 0, r.stderr
    return (out_json(r).get("hookSpecificOutput") or {})


def denied(h):
    return h.get("permissionDecision") == "deny"


# --- 라이브러리 ------------------------------------------------------------------

def test_parse_tasks_and_requirements():
    t = L.parse_tasks(TASKS)
    assert t == [{"id": "TASK-1", "title": "greet 구현", "reqs": ["REQ-001"], "files": ["greet.py", "test_greet.py"],
                  "tests": ["test_greet.py"], "tdd": "required"}]
    assert L.parse_requirements(REQS) == {"REQ-001": ["AC-001.1", "AC-001.2"]}


def test_validate_spec_reports_problems(proj):
    assert L.validate_spec(proj, "greet") == []
    (proj / "specs/greet/tasks.md").write_text("## TASK-1: x\n- REQ: REQ-009\n")
    probs = L.validate_spec(proj, "greet")
    assert any("Files" in p for p in probs) and any("REQ-009" in p for p in probs)
    assert any("REQ-001 를 구현하는 TASK" in p for p in probs)


def test_match_any_globs():
    assert L.match_any(".harness/config.json", [".harness/config.json"])
    assert L.match_any("sub/.gitignore", [".gitignore"])
    assert L.match_any("src/a/b.ts", ["src/**"])
    assert L.match_any("src/a/b.test.ts", ["*.test.*"])
    assert not L.match_any("lib/x.ts", ["src/**"])


def test_spec_hash_changes_with_spec(proj):
    h1 = L.spec_hash(proj, "greet")
    (proj / "specs/greet/design.md").write_text(DESIGN + "change\n")
    assert L.spec_hash(proj, "greet") != h1


# --- sdd-guard (PreToolUse) ------------------------------------------------------

def test_guard_ignores_projects_without_config(tmp_path, home):
    p = tmp_path / "plain"
    p.mkdir()
    git(p, "init", "-q")
    assert guard(p, home, "app.py") == {}


def test_guard_ignores_files_outside_git(tmp_path, home):
    r = run_hook("sdd-guard.py", {"tool_name": "Write", "tool_input": {"file_path": str(tmp_path / "x.py")},
                                  "cwd": str(tmp_path)}, home)
    assert r.returncode == 0 and r.stdout.strip() == ""


def test_guard_blocks_code_before_approval_but_allows_docs(proj, home):
    assert denied(guard(proj, home, "greet.py"))
    assert "승인 전" in guard(proj, home, "greet.py")["permissionDecisionReason"]
    assert not denied(guard(proj, home, "specs/greet/design.md", "Edit"))
    assert not denied(guard(proj, home, "docs/notes.md"))


@pytest.mark.parametrize("path", ["specs/greet/approval.json", "specs/greet/tdd-log.jsonl", ".harness/config.json"])
def test_guard_protects_hook_records(proj, home, path):
    approve(proj, home)
    assert denied(guard(proj, home, path))


def test_guard_no_active_feature(proj, home):
    git(proj, "switch", "-q", "-c", "other")
    h = guard(proj, home, "greet.py")
    assert denied(h) and "활성 SDD 기능" in h["permissionDecisionReason"]


def test_guard_active_file_fallback(proj, home):
    git(proj, "switch", "-q", "-c", "other")
    (proj / ".harness/active").write_text("greet\n")
    assert "승인 전" in guard(proj, home, "greet.py")["permissionDecisionReason"]


def test_guard_scope_and_tdd_order(proj, home):
    approve(proj, home)
    assert not denied(guard(proj, home, "test_greet.py"))          # 테스트 먼저: 허용
    h = guard(proj, home, "greet.py")                               # RED 없음: 구현 차단
    assert denied(h) and "RED" in h["permissionDecisionReason"]
    h = guard(proj, home, "other.py")                               # 범위 밖
    assert denied(h) and "범위 밖" in h["permissionDecisionReason"]
    L.append_log(proj, "greet", {"task": "TASK-1", "phase": "RED", "exit": 1})
    assert not denied(guard(proj, home, "greet.py"))                # RED 후 허용


def test_guard_red_before_approval_does_not_count(proj, home):
    L.append_log(proj, "greet", {"task": "TASK-1", "phase": "RED", "exit": 1, "ts": "2000-01-01T00:00:00Z"})
    lines = (proj / "specs/greet/tdd-log.jsonl").read_text().splitlines()
    rec = json.loads(lines[-1]); rec["ts"] = "2000-01-01T00:00:00Z"
    (proj / "specs/greet/tdd-log.jsonl").write_text(json.dumps(rec) + "\n")
    approve(proj, home)
    assert denied(guard(proj, home, "greet.py"))


def test_guard_stale_approval(proj, home):
    approve(proj, home)
    (proj / "specs/greet/tasks.md").write_text(TASKS.replace("greet.py, test_greet.py", "greet.py, test_greet.py, x.py"))
    h = guard(proj, home, "test_greet.py")
    assert denied(h) and "변경" in h["permissionDecisionReason"]


def test_guard_warn_mode(proj, home):
    cfg = json.loads((proj / ".harness/config.json").read_text())
    cfg["tdd"] = {"mode": "warn"}
    (proj / ".harness/config.json").write_text(json.dumps(cfg))
    approve(proj, home)
    h = guard(proj, home, "greet.py")
    assert not denied(h) and "TDD 경고" in h["additionalContext"]


def test_guard_tdd_exempt_task(proj, home):
    (proj / "specs/greet/tasks.md").write_text(TASKS + "\n## TASK-2: 설정\n- REQ: REQ-001\n- Files: setup.cfg\n- TDD: exempt\n")
    approve(proj, home)
    assert not denied(guard(proj, home, "setup.cfg"))


def test_guard_notebook_path(proj, home):
    r = run_hook("sdd-guard.py", {"tool_name": "NotebookEdit", "tool_input": {"notebook_path": str(proj / "nb.ipynb")},
                                  "cwd": str(proj)}, home)
    assert denied(out_json(r)["hookSpecificOutput"])


# --- sdd-approve (UserPromptSubmit) -----------------------------------------------

def test_approve_records_hash_and_scope(proj, home):
    r = approve(proj, home)
    o = out_json(r)
    assert "✅" in o["systemMessage"]
    a = json.loads((proj / "specs/greet/approval.json").read_text())
    assert a["status"] == "approved" and a["spec_sha256"] == L.spec_hash(proj, "greet")
    assert a["scope"] == ["greet.py", "test_greet.py"] and a["approved_via"] == "user-prompt"


def test_approve_keyword_form(proj, home):
    approve(proj, home, prompt="SDD-APPROVE greet")
    assert L.approval_state(proj, "greet")[0] == "approved"


@pytest.mark.parametrize("prompt", ["승인해줘", "please /sdd approve greet now", "/sdd approve", "/sdd approve ../x"])
def test_approve_ignores_other_prompts(proj, home, prompt):
    r = approve(proj, home, prompt=prompt)
    assert r.stdout.strip() == "" or "❌" in out_json(r).get("systemMessage", "")
    assert not (proj / "specs/greet/approval.json").exists()


def test_approve_rejects_invalid_spec(proj, home):
    (proj / "specs/greet/requirements.md").write_text("# 요구사항\n### REQ-001: 인사\n")
    o = out_json(approve(proj, home))
    assert "❌" in o["systemMessage"] and "AC" in o["hookSpecificOutput"]["additionalContext"]
    assert not (proj / "specs/greet/approval.json").exists()


def test_revoke(proj, home):
    approve(proj, home)
    approve(proj, home, prompt="/sdd revoke greet")
    assert L.approval_state(proj, "greet")[0] == "none"


# --- tdd-post (PostToolUse) --------------------------------------------------------

def post(proj, home, rel_path):
    r = run_hook("tdd-post.py", {"tool_name": "Write", "tool_input": {"file_path": str(proj / rel_path)},
                                 "tool_response": {}, "cwd": str(proj)}, home)
    assert r.returncode == 0, r.stderr
    return (out_json(r).get("hookSpecificOutput") or {}).get("additionalContext", "")


def test_post_runs_related_tests_and_logs_red_then_green(proj, home):
    approve(proj, home)
    (proj / "test_greet.py").write_text(TEST_FAIL)
    ctx = post(proj, home, "test_greet.py")
    assert "RED" in ctx
    (proj / "greet.py").write_text(IMPL)
    ctx = post(proj, home, "greet.py")
    assert "GREEN" in ctx
    phases = [(e["task"], e["phase"], e["source"]) for e in L.read_log(proj, "greet")]
    assert phases == [("TASK-1", "RED", "post-hook"), ("TASK-1", "GREEN", "post-hook")]


def test_post_skips_docs(proj, home):
    assert post(proj, home, "specs/greet/design.md") == ""


def test_post_schedules_without_test_file_command(proj, home):
    (proj / ".harness/config.json").write_text(json.dumps({"commands": {"test": "python3 -m unittest discover"}}))
    (proj / "test_greet.py").write_text(TEST_FAIL)
    assert "예약" in post(proj, home, "test_greet.py")
    assert list((home / ".claude/harness/state").glob("pending-*.json"))


# --- stop-verify (Stop) ------------------------------------------------------------

def stop(proj, home, session="s1"):
    return run_hook("stop-verify.py", {"session_id": session, "cwd": str(proj), "hook_event_name": "Stop",
                                       "stop_hook_active": False}, home)


def test_stop_skips_doc_only_changes(proj, home):
    (proj / "specs/greet/design.md").write_text(DESIGN + "more\n")
    (proj / ".harness/config.json").write_text(json.dumps({"commands": {"test": "exit 1"}}))
    assert stop(proj, home).returncode == 0


def test_stop_audit_blocks_unapproved_code_change(proj, home):
    (proj / "greet.py").write_text(IMPL)  # Bash 등으로 PreToolUse 를 우회한 경우
    r = stop(proj, home)
    assert r.returncode == 2 and "규칙 위반" in r.stderr and "미승인" in r.stderr


def test_stop_audit_flags_missing_red_and_out_of_scope(proj, home):
    approve(proj, home)
    (proj / "greet.py").write_text(IMPL)
    (proj / "other.py").write_text("x = 1\n")
    r = stop(proj, home)
    assert r.returncode == 2 and "RED 기록 없이" in r.stderr and "범위 밖" in r.stderr


def test_stop_runs_tests_and_logs(proj, home):
    approve(proj, home)
    L.append_log(proj, "greet", {"task": "TASK-1", "phase": "RED", "exit": 1})
    (proj / "test_greet.py").write_text(TEST_FAIL)
    (proj / "greet.py").write_text(IMPL)
    r = stop(proj, home)
    assert r.returncode == 0, r.stderr
    assert L.read_log(proj, "greet")[-1]["source"] == "stop" and L.read_log(proj, "greet")[-1]["phase"] == "GREEN"


def test_stop_failure_retries_then_gives_up(proj, home):
    approve(proj, home)
    L.append_log(proj, "greet", {"task": "TASK-1", "phase": "RED", "exit": 1})
    (proj / "test_greet.py").write_text(TEST_FAIL)
    (proj / "greet.py").write_text("def greet(name):\n    return 'nope'\n")
    for i in range(1, 4):
        r = stop(proj, home)
        assert r.returncode == 2 and f"{i}/3" in r.stderr
    r = stop(proj, home)
    assert r.returncode == 0 and "멈췄습니다" in out_json(r)["systemMessage"]
    assert stop(proj, home).returncode == 2  # 카운터 초기화 후 다시 검증


def test_stop_ignores_generated_artifacts(proj, home):
    approve(proj, home)
    (proj / "__pycache__").mkdir()
    (proj / "__pycache__/greet.cpython-312.pyc").write_bytes(b"x")
    (proj / "node_modules/pkg").mkdir(parents=True)
    (proj / "node_modules/pkg/index.js").write_text("x")
    (proj / ".harness/config.json").write_text(json.dumps({"commands": {"test": "exit 1"}}))
    assert stop(proj, home).returncode == 0   # 산출물만 바뀜 → 검증할 코드 변경 없음


def test_run_shell_does_not_write_bytecode(proj):
    (proj / "m.py").write_text("X = 1\n")
    code, _ = L.run_shell("python3 -c 'import m'", proj, 30)
    assert code == 0 and not (proj / "__pycache__").exists()


def test_stop_disabled_by_env(proj, home):
    (proj / "greet.py").write_text(IMPL)
    r = run_hook("stop-verify.py", {"session_id": "s", "cwd": str(proj)}, home, {"HARNESS_STOP_CHECK": "0"})
    assert r.returncode == 0


# --- guard-bash: 기록 위조 차단 ------------------------------------------------------

def bash_guard(cmd, cwd, home):
    r = run_hook("guard-bash.py", {"tool_name": "Bash", "tool_input": {"command": cmd}, "cwd": str(cwd)}, home)
    return r.returncode


@pytest.mark.parametrize("cmd", [
    "echo '{}' > specs/greet/approval.json",
    "python3 -c \"open('specs/greet/approval.json','w')\"",
    "rm specs/greet/tdd-log.jsonl",
    "sed -i 's/strict/warn/' .harness/config.json",
    "cp /tmp/a.json specs/greet/approval.json",
    "cat x.json | tee specs/greet/approval.json",
    "ls && echo '{}' > .harness/config.json",
])
def test_bash_cannot_forge_records(proj, home, cmd):
    assert bash_guard(cmd, proj, home) == 2


@pytest.mark.parametrize("cmd", [
    "cat specs/greet/approval.json",
    "git add specs/greet/approval.json specs/greet/tdd-log.jsonl",
    "python3 ~/.claude/harness/bin/tdd-run TASK-1 --expect red",
    "printf x > README.md && cat .harness/config.json",
    "cat .harness/config.json 2>/dev/null",
    "cat specs/greet/approval.json > /tmp/copy.json",
])
def test_bash_allows_reading_and_committing_records(proj, home, cmd):
    assert bash_guard(cmd, proj, home) == 0


# --- CLI: sdd / tdd-run -----------------------------------------------------------------

def cli(name, args, cwd, home):
    env = {"HOME": str(home), "PATH": os.environ["PATH"]}
    return subprocess.run([sys.executable, str(HARNESS / "bin" / name), *args], cwd=cwd,
                          capture_output=True, text=True, env=env)


def test_sdd_init_check_status(tmp_path, home):
    p = tmp_path / "new"
    p.mkdir()
    git(p, "init", "-q", "-b", "main")
    r = cli("sdd", ["init", "login", "--title", "로그인"], p, home)
    assert r.returncode == 0, r.stderr
    assert (p / "specs/login/requirements.md").exists() and (p / ".harness/config.json").exists()
    assert (p / ".harness/active").read_text().strip() == "login"
    assert cli("sdd", ["init", "login"], p, home).returncode != 0          # 덮어쓰지 않음
    r = cli("sdd", ["check"], p, home)
    assert r.returncode == 1 and "TODO" in r.stdout                      # 템플릿 그대로면 승인 불가
    assert "approve" in cli("sdd", ["approve", "login"], p, home).stderr  # CLI 로 승인 불가


def test_sdd_init_command_options(tmp_path, home):
    p = tmp_path / "opt"
    p.mkdir()
    git(p, "init", "-q", "-b", "main")
    r = cli("sdd", ["init", "x", "--test", "python3 -m unittest -v", "--test-file", "python3 -m unittest -v {modules}"],
            p, home)
    assert r.returncode == 0, r.stderr
    cmds = json.loads((p / ".harness/config.json").read_text())["commands"]
    assert cmds["test"] == "python3 -m unittest -v" and cmds["test_file"].endswith("{modules}")
    cli("sdd", ["init", "y", "--test", "other"], p, home)                    # 이미 있으면 설정은 그대로
    assert json.loads((p / ".harness/config.json").read_text())["commands"]["test"] == "python3 -m unittest -v"


def test_sdd_status_traceability(proj, home):
    approve(proj, home)
    (proj / "test_greet.py").write_text(TEST_FAIL.replace("test_ac_001_1_hello", "test_hello_AC-001.1".replace("-", "_"))
                                        + "\n# AC-001.1\n")
    r = cli("sdd", ["status"], proj, home)
    assert "✅ 승인됨" in r.stdout and "| REQ-001 | AC-001.1 | TASK-1 | test_greet.py |" in r.stdout
    assert "AC-001.2" in r.stdout and "테스트에서 언급되지 않은 수용 기준: AC-001.2" in r.stdout


def test_tdd_run_expect_red_and_green(proj, home):
    approve(proj, home)
    (proj / "test_greet.py").write_text(TEST_FAIL)
    assert cli("tdd-run", ["TASK-1", "--expect", "red"], proj, home).returncode == 0
    assert cli("tdd-run", ["TASK-1", "--expect", "green"], proj, home).returncode == 1
    (proj / "greet.py").write_text(IMPL)
    assert cli("tdd-run", ["TASK-1", "--expect", "red"], proj, home).returncode == 1   # 통과하면 RED 아님
    assert cli("tdd-run", ["TASK-1", "--expect", "green"], proj, home).returncode == 0
    log = L.read_log(proj, "greet")
    assert [e["phase"] for e in log] == ["RED", "RED", "GREEN", "GREEN"]
    assert log[0]["reqs"] == ["REQ-001"] and log[0]["source"] == "tdd-run"


def test_tdd_run_timeout_is_not_red_and_does_not_unlock(proj, home):
    """시간 초과는 실패 테스트(RED)가 아니다 — `--timeout 1`로 RED 를 만들어 구현 차단을 풀 수 없어야 한다."""
    approve(proj, home)
    (proj / "test_greet.py").write_text("import time\ntime.sleep(5)\n" + TEST_FAIL)
    r = cli("tdd-run", ["TASK-1", "--expect", "red", "--timeout", "1"], proj, home)
    assert r.returncode == 1 and "시간 초과" in r.stdout
    assert [e["phase"] for e in L.read_log(proj, "greet")] == ["TIMEOUT"]
    assert denied(guard(proj, home, "greet.py"))


def test_has_red_ignores_entries_without_failing_exit(proj, home):
    approve(proj, home)
    L.append_log(proj, "greet", {"task": "TASK-1", "phase": "RED", "exit": None})  # 예전 버전이 남긴 시간 초과 기록
    assert not L.has_red(proj, "greet", ["TASK-1"])
    assert denied(guard(proj, home, "greet.py"))
    L.append_log(proj, "greet", {"task": "TASK-1", "phase": "RED", "exit": 1})
    assert L.has_red(proj, "greet", ["TASK-1"])


def test_test_phase():
    assert (L.test_phase(0), L.test_phase(1), L.test_phase(None)) == ("GREEN", "RED", "TIMEOUT")
    # 테스트가 실패한 것이 아니라 실행되지 않은 경우: 명령 없음/실행 불가, pytest 사용법 오류·테스트 없음, 시그널 종료
    assert [L.test_phase(c) for c in (127, 126, 5, 4, -9)] == ["ERROR"] * 5
    assert L.test_phase(2) == "RED"


@pytest.mark.parametrize("test_file", [
    "",                                   # 비어 있는 테스트 파일: unittest 가 NO TESTS RAN (exit 5)
    "import unittest\n",                  # 테스트가 하나도 없음
])
def test_tdd_run_tests_not_run_is_not_red(proj, home, test_file):
    approve(proj, home)
    (proj / "test_greet.py").write_text(test_file)
    r = cli("tdd-run", ["TASK-1", "--expect", "red"], proj, home)
    assert r.returncode == 1 and "실행되지" in r.stdout, r.stdout
    assert [e["phase"] for e in L.read_log(proj, "greet")] == ["ERROR"]
    assert denied(guard(proj, home, "greet.py"))


def test_tdd_run_missing_runner_is_not_red(proj, home):
    approve(proj, home)
    (proj / "test_greet.py").write_text(TEST_FAIL)
    cfg = json.loads((proj / ".harness/config.json").read_text())
    cfg["commands"]["test_file"] = "no-such-test-runner {files}"
    (proj / ".harness/config.json").write_text(json.dumps(cfg))
    r = cli("tdd-run", ["TASK-1", "--expect", "red"], proj, home)
    assert r.returncode == 1 and [e["phase"] for e in L.read_log(proj, "greet")] == ["ERROR"]
    assert denied(guard(proj, home, "greet.py"))


@pytest.mark.parametrize("exit_code", [127, 126, 5, 4, -9])
def test_has_red_ignores_legacy_red_for_tests_not_run(proj, home, exit_code):
    approve(proj, home)
    L.append_log(proj, "greet", {"task": "TASK-1", "phase": "RED", "exit": exit_code})  # 예전 버전이 남긴 기록
    assert not L.has_red(proj, "greet", ["TASK-1"])

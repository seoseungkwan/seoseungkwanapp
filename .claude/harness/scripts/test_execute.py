"""
execute.py 리팩터링 안전망 테스트.
리팩터링 전후 동작이 동일한지 검증한다.
"""

import json
import os
import subprocess
import sys
import textwrap
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import execute as ex


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def tmp_project(tmp_path):
    """phases/, CLAUDE.md, docs/ 를 갖춘 임시 프로젝트 구조."""
    phases_dir = tmp_path / "phases"
    phases_dir.mkdir()

    claude_md = tmp_path / "CLAUDE.md"
    claude_md.write_text("# Rules\n- rule one\n- rule two")

    docs_dir = tmp_path / "docs"
    docs_dir.mkdir()
    (docs_dir / "arch.md").write_text("# Architecture\nSome content")
    (docs_dir / "guide.md").write_text("# Guide\nAnother doc")

    return tmp_path


@pytest.fixture
def phase_dir(tmp_project):
    """step 3개를 가진 phase 디렉토리."""
    d = tmp_project / "phases" / "0-mvp"
    d.mkdir()

    index = {
        "project": "TestProject",
        "phase": "mvp",
        "steps": [
            {"step": 0, "name": "setup", "status": "completed", "summary": "프로젝트 초기화 완료"},
            {"step": 1, "name": "core", "status": "completed", "summary": "핵심 로직 구현"},
            {"step": 2, "name": "ui", "status": "pending"},
        ],
    }
    (d / "index.json").write_text(json.dumps(index, indent=2, ensure_ascii=False))
    (d / "step2.md").write_text("# Step 2: UI\n\nUI를 구현하세요.")

    return d


@pytest.fixture
def top_index(tmp_project):
    """phases/index.json (top-level)."""
    top = {
        "phases": [
            {"dir": "0-mvp", "status": "pending"},
            {"dir": "1-polish", "status": "pending"},
        ]
    }
    p = tmp_project / "phases" / "index.json"
    p.write_text(json.dumps(top, indent=2))
    return p


@pytest.fixture
def executor(tmp_project, phase_dir):
    """테스트용 StepExecutor 인스턴스. git 호출은 별도 mock 필요."""
    with patch.object(ex, "ROOT", tmp_project):
        inst = ex.StepExecutor("0-mvp")
    # 내부 경로를 tmp_project 기준으로 재설정
    inst._root = str(tmp_project)
    inst._phases_dir = tmp_project / "phases"
    inst._phase_dir = phase_dir
    inst._phase_dir_name = "0-mvp"
    inst._index_file = phase_dir / "index.json"
    inst._top_index_file = tmp_project / "phases" / "index.json"
    return inst


# ---------------------------------------------------------------------------
# _stamp (= 이전 now_iso)
# ---------------------------------------------------------------------------

class TestStamp:
    def test_returns_kst_timestamp(self, executor):
        result = executor._stamp()
        assert "+0900" in result

    def test_format_is_iso(self, executor):
        result = executor._stamp()
        dt = datetime.strptime(result, "%Y-%m-%dT%H:%M:%S%z")
        assert dt.tzinfo is not None

    def test_is_current_time(self, executor):
        before = datetime.now(ex.StepExecutor.TZ).replace(microsecond=0)
        result = executor._stamp()
        after = datetime.now(ex.StepExecutor.TZ).replace(microsecond=0) + timedelta(seconds=1)
        parsed = datetime.strptime(result, "%Y-%m-%dT%H:%M:%S%z")
        assert before <= parsed <= after


# ---------------------------------------------------------------------------
# _read_json / _write_json
# ---------------------------------------------------------------------------

class TestJsonHelpers:
    def test_roundtrip(self, tmp_path):
        data = {"key": "값", "nested": [1, 2, 3]}
        p = tmp_path / "test.json"
        ex.StepExecutor._write_json(p, data)
        loaded = ex.StepExecutor._read_json(p)
        assert loaded == data

    def test_save_ensures_ascii_false(self, tmp_path):
        p = tmp_path / "test.json"
        ex.StepExecutor._write_json(p, {"한글": "테스트"})
        raw = p.read_text()
        assert "한글" in raw
        assert "\\u" not in raw

    def test_save_indented(self, tmp_path):
        p = tmp_path / "test.json"
        ex.StepExecutor._write_json(p, {"a": 1})
        raw = p.read_text()
        assert "\n" in raw

    def test_load_nonexistent_raises(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            ex.StepExecutor._read_json(tmp_path / "nope.json")


# ---------------------------------------------------------------------------
# _load_guardrails
# ---------------------------------------------------------------------------

class TestLoadGuardrails:
    def test_loads_claude_md_and_docs(self, executor, tmp_project):
        with patch.object(ex, "ROOT", tmp_project):
            result = executor._load_guardrails()
        assert "# Rules" in result
        assert "rule one" in result
        assert "# Architecture" in result
        assert "# Guide" in result

    def test_sections_separated_by_divider(self, executor, tmp_project):
        with patch.object(ex, "ROOT", tmp_project):
            result = executor._load_guardrails()
        assert "---" in result

    def test_docs_sorted_alphabetically(self, executor, tmp_project):
        with patch.object(ex, "ROOT", tmp_project):
            result = executor._load_guardrails()
        arch_pos = result.index("arch")
        guide_pos = result.index("guide")
        assert arch_pos < guide_pos

    def test_no_claude_md(self, executor, tmp_project):
        (tmp_project / "CLAUDE.md").unlink()
        with patch.object(ex, "ROOT", tmp_project):
            result = executor._load_guardrails()
        assert "CLAUDE.md" not in result
        assert "Architecture" in result

    def test_no_docs_dir(self, executor, tmp_project):
        import shutil
        shutil.rmtree(tmp_project / "docs")
        with patch.object(ex, "ROOT", tmp_project):
            result = executor._load_guardrails()
        assert "Rules" in result
        assert "Architecture" not in result

    def test_empty_project(self, tmp_path):
        with patch.object(ex, "ROOT", tmp_path):
            # executor가 필요 없는 static-like 동작이므로 임시 인스턴스
            phases_dir = tmp_path / "phases" / "dummy"
            phases_dir.mkdir(parents=True)
            idx = {"project": "T", "phase": "t", "steps": []}
            (phases_dir / "index.json").write_text(json.dumps(idx))
            inst = ex.StepExecutor.__new__(ex.StepExecutor)
            result = inst._load_guardrails()
        assert result == ""


# ---------------------------------------------------------------------------
# _build_step_context
# ---------------------------------------------------------------------------

class TestBuildStepContext:
    def test_includes_completed_with_summary(self, phase_dir):
        index = json.loads((phase_dir / "index.json").read_text())
        result = ex.StepExecutor._build_step_context(index)
        assert "Step 0 (setup): 프로젝트 초기화 완료" in result
        assert "Step 1 (core): 핵심 로직 구현" in result

    def test_excludes_pending(self, phase_dir):
        index = json.loads((phase_dir / "index.json").read_text())
        result = ex.StepExecutor._build_step_context(index)
        assert "ui" not in result

    def test_excludes_completed_without_summary(self, phase_dir):
        index = json.loads((phase_dir / "index.json").read_text())
        del index["steps"][0]["summary"]
        result = ex.StepExecutor._build_step_context(index)
        assert "setup" not in result
        assert "core" in result

    def test_empty_when_no_completed(self):
        index = {"steps": [{"step": 0, "name": "a", "status": "pending"}]}
        result = ex.StepExecutor._build_step_context(index)
        assert result == ""

    def test_has_header(self, phase_dir):
        index = json.loads((phase_dir / "index.json").read_text())
        result = ex.StepExecutor._build_step_context(index)
        assert result.startswith("## 이전 Step 산출물")


# ---------------------------------------------------------------------------
# _build_preamble
# ---------------------------------------------------------------------------

class TestBuildPreamble:
    def test_includes_project_name(self, executor):
        result = executor._build_preamble("", "")
        assert "TestProject" in result

    def test_includes_guardrails(self, executor):
        result = executor._build_preamble("GUARD_CONTENT", "")
        assert "GUARD_CONTENT" in result

    def test_includes_step_context(self, executor):
        ctx = "## 이전 Step 산출물\n\n- Step 0: done"
        result = executor._build_preamble("", ctx)
        assert "이전 Step 산출물" in result

    def test_includes_commit_example(self, executor):
        result = executor._build_preamble("", "")
        assert "feat(mvp):" in result

    def test_includes_rules(self, executor):
        result = executor._build_preamble("", "")
        assert "작업 규칙" in result
        assert "AC" in result

    def test_no_retry_section_by_default(self, executor):
        result = executor._build_preamble("", "")
        assert "이전 시도 실패" not in result

    def test_retry_section_with_prev_error(self, executor):
        result = executor._build_preamble("", "", prev_error="타입 에러 발생")
        assert "이전 시도 실패" in result
        assert "타입 에러 발생" in result

    def test_includes_max_retries(self, executor):
        result = executor._build_preamble("", "")
        assert str(ex.StepExecutor.MAX_RETRIES) in result

    def test_includes_index_path(self, executor):
        result = executor._build_preamble("", "")
        assert "/phases/0-mvp/index.json" in result


# ---------------------------------------------------------------------------
# _update_top_index
# ---------------------------------------------------------------------------

class TestUpdateTopIndex:
    def test_completed(self, executor, top_index):
        executor._top_index_file = top_index
        executor._update_top_index("completed")
        data = json.loads(top_index.read_text())
        mvp = next(p for p in data["phases"] if p["dir"] == "0-mvp")
        assert mvp["status"] == "completed"
        assert "completed_at" in mvp

    def test_error(self, executor, top_index):
        executor._top_index_file = top_index
        executor._update_top_index("error")
        data = json.loads(top_index.read_text())
        mvp = next(p for p in data["phases"] if p["dir"] == "0-mvp")
        assert mvp["status"] == "error"
        assert "failed_at" in mvp

    def test_blocked(self, executor, top_index):
        executor._top_index_file = top_index
        executor._update_top_index("blocked")
        data = json.loads(top_index.read_text())
        mvp = next(p for p in data["phases"] if p["dir"] == "0-mvp")
        assert mvp["status"] == "blocked"
        assert "blocked_at" in mvp

    def test_other_phases_unchanged(self, executor, top_index):
        executor._top_index_file = top_index
        executor._update_top_index("completed")
        data = json.loads(top_index.read_text())
        polish = next(p for p in data["phases"] if p["dir"] == "1-polish")
        assert polish["status"] == "pending"

    def test_nonexistent_dir_is_noop(self, executor, top_index):
        executor._top_index_file = top_index
        executor._phase_dir_name = "no-such-dir"
        original = json.loads(top_index.read_text())
        executor._update_top_index("completed")
        after = json.loads(top_index.read_text())
        for p_before, p_after in zip(original["phases"], after["phases"]):
            assert p_before["status"] == p_after["status"]

    def test_no_top_index_file(self, executor, tmp_path):
        executor._top_index_file = tmp_path / "nonexistent.json"
        executor._update_top_index("completed")  # should not raise


# ---------------------------------------------------------------------------
# _checkout_branch (mocked)
# ---------------------------------------------------------------------------

class TestCheckoutBranch:
    def _mock_git(self, executor, responses):
        call_idx = {"i": 0}
        def fake_git(*args):
            idx = call_idx["i"]
            call_idx["i"] += 1
            if idx < len(responses):
                return responses[idx]
            return MagicMock(returncode=0, stdout="", stderr="")
        executor._run_git = fake_git

    def test_already_on_branch(self, executor):
        self._mock_git(executor, [
            MagicMock(returncode=0, stdout="feat-mvp\n", stderr=""),
        ])
        executor._checkout_branch()  # should return without checkout

    def test_branch_exists_checkout(self, executor):
        self._mock_git(executor, [
            MagicMock(returncode=0, stdout="main\n", stderr=""),
            MagicMock(returncode=0, stdout="", stderr=""),
            MagicMock(returncode=0, stdout="", stderr=""),
        ])
        executor._checkout_branch()

    def test_branch_not_exists_create(self, executor):
        self._mock_git(executor, [
            MagicMock(returncode=0, stdout="main\n", stderr=""),
            MagicMock(returncode=1, stdout="", stderr="not found"),
            MagicMock(returncode=0, stdout="", stderr=""),
        ])
        executor._checkout_branch()

    def test_checkout_fails_exits(self, executor):
        self._mock_git(executor, [
            MagicMock(returncode=0, stdout="main\n", stderr=""),
            MagicMock(returncode=1, stdout="", stderr=""),
            MagicMock(returncode=1, stdout="", stderr="dirty tree"),
        ])
        with pytest.raises(SystemExit) as exc_info:
            executor._checkout_branch()
        assert exc_info.value.code == 1

    def test_no_git_exits(self, executor):
        self._mock_git(executor, [
            MagicMock(returncode=1, stdout="", stderr="not a git repo"),
        ])
        with pytest.raises(SystemExit) as exc_info:
            executor._checkout_branch()
        assert exc_info.value.code == 1


# ---------------------------------------------------------------------------
# _commit_step (mocked)
# ---------------------------------------------------------------------------

class TestCommitStep:
    def test_two_phase_commit(self, executor):
        calls = []
        def fake_git(*args):
            calls.append(args)
            if args[:2] == ("diff", "--cached"):
                return MagicMock(returncode=1)
            return MagicMock(returncode=0, stdout="", stderr="")
        executor._run_git = fake_git

        executor._commit_step(2, "ui")

        commit_calls = [c for c in calls if c[0] == "commit"]
        assert len(commit_calls) == 2
        assert "feat(mvp):" in commit_calls[0][2]
        assert "chore(mvp):" in commit_calls[1][2]

    def test_no_code_changes_skips_feat_commit(self, executor):
        call_count = {"diff": 0}
        calls = []
        def fake_git(*args):
            calls.append(args)
            if args[:2] == ("diff", "--cached"):
                call_count["diff"] += 1
                if call_count["diff"] == 1:
                    return MagicMock(returncode=0)
                return MagicMock(returncode=1)
            return MagicMock(returncode=0, stdout="", stderr="")
        executor._run_git = fake_git

        executor._commit_step(2, "ui")

        commit_msgs = [c[2] for c in calls if c[0] == "commit"]
        assert len(commit_msgs) == 1
        assert "chore" in commit_msgs[0]


class TestUnstageSecrets:
    def test_secrets_unstaged_examples_kept(self, executor):
        calls = []
        staged = ".env\nsrc/a.ts\nconfig/.env.local\n.env.example\ncerts/server.key\n"
        def fake_git(*args):
            calls.append(args)
            if args[:3] == ("diff", "--name-only", "--cached"):
                return MagicMock(returncode=0, stdout=staged, stderr="")
            return MagicMock(returncode=0, stdout="", stderr="")
        executor._run_git = fake_git
        executor._unstage_secrets()
        reset = [c[-1] for c in calls if c[:1] == ("reset",)]
        assert reset == [".env", "config/.env.local", "certs/server.key"]


# ---------------------------------------------------------------------------
# _invoke_claude (mocked)
# ---------------------------------------------------------------------------

class TestInvokeClaude:
    def test_invokes_claude_with_correct_args(self, executor):
        mock_result = MagicMock(returncode=0, stdout='{"result": "ok"}', stderr="")
        step = {"step": 2, "name": "ui"}
        preamble = "PREAMBLE\n"

        with patch.object(ex, "run_step_session", return_value=mock_result) as mock_run:
            output = executor._invoke_claude(step, preamble)

        cmd = mock_run.call_args[0][0]
        assert cmd[0] == "claude"
        assert "-p" in cmd
        assert "--dangerously-skip-permissions" not in cmd
        assert cmd[cmd.index("--permission-mode") + 1] == "acceptEdits"
        assert "--allowedTools" in cmd
        assert "--output-format" in cmd
        prompt = mock_run.call_args[1]["input"]
        assert "PREAMBLE" in prompt
        assert "UI를 구현하세요" in prompt

    def test_allowed_tools_env_override(self, executor, monkeypatch):
        monkeypatch.setenv("HARNESS_ALLOWED_TOOLS", "Read, Bash(make:*)")
        mock_result = MagicMock(returncode=0, stdout="{}", stderr="")
        with patch.object(ex, "run_step_session", return_value=mock_result) as mock_run:
            executor._invoke_claude({"step": 2, "name": "ui"}, "p")
        cmd = mock_run.call_args[0][0]
        assert cmd[cmd.index("--allowedTools") + 1:] == ["Read", "Bash(make:*)"]

    def test_saves_output_json(self, executor):
        mock_result = MagicMock(returncode=0, stdout='{"ok": true}', stderr="")
        step = {"step": 2, "name": "ui"}

        with patch.object(ex, "run_step_session", return_value=mock_result):
            executor._invoke_claude(step, "preamble")

        output_file = executor._phase_dir / "step2-output.json"
        assert output_file.exists()
        data = json.loads(output_file.read_text())
        assert data["step"] == 2
        assert data["name"] == "ui"
        assert data["exitCode"] == 0

    def test_nonexistent_step_file_exits(self, executor):
        step = {"step": 99, "name": "nonexistent"}
        with pytest.raises(SystemExit) as exc_info:
            executor._invoke_claude(step, "preamble")
        assert exc_info.value.code == 1

    def test_timeout_is_1800(self, executor, monkeypatch):
        monkeypatch.delenv("HARNESS_STEP_TIMEOUT", raising=False)
        mock_result = MagicMock(returncode=0, stdout="{}", stderr="")
        step = {"step": 2, "name": "ui"}

        with patch.object(ex, "run_step_session", return_value=mock_result) as mock_run:
            executor._invoke_claude(step, "preamble")

        assert mock_run.call_args[1]["timeout"] == 1800

    @pytest.mark.parametrize("value, expected", [("3600", 3600), ("abc", 1800), ("0", 1800), ("-5", 1800)])
    def test_timeout_env_override(self, executor, monkeypatch, value, expected):
        monkeypatch.setenv("HARNESS_STEP_TIMEOUT", value)
        mock_result = MagicMock(returncode=0, stdout="{}", stderr="")
        with patch.object(ex, "run_step_session", return_value=mock_result) as mock_run:
            executor._invoke_claude({"step": 2, "name": "ui"}, "p")
        assert mock_run.call_args[1]["timeout"] == expected

    def test_timeout_saves_output_and_reraises(self, executor):
        with patch.object(ex, "run_step_session", side_effect=ex.StepTimeout(1800, "partial", "err")):
            with pytest.raises(ex.StepTimeout):
                executor._invoke_claude({"step": 2, "name": "ui"}, "p")
        data = json.loads((executor._phase_dir / "step2-output.json").read_text())
        assert data["timedOut"] is True and data["stdout"] == "partial"


# ---------------------------------------------------------------------------
# run_step_session — step 세션이 띄운 프로세스(서버·감시 스크립트)를 끝나면 같이 끈다
# ---------------------------------------------------------------------------

def _alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    # 좀비(끝났지만 아직 거둬지지 않음)는 죽은 것으로 본다
    try:
        return Path(f"/proc/{pid}/stat").read_text().split()[2] != "Z"
    except OSError:
        return False


def _wait_dead(pid: int, seconds: float = 5.0) -> bool:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if not _alive(pid):
            return True
        time.sleep(0.05)
    return not _alive(pid)


@pytest.mark.skipif(os.name != "posix", reason="프로세스 그룹은 POSIX만")
class TestRunStepSession:
    def test_returns_output_and_exit_code(self, tmp_path):
        r = ex.run_step_session(["bash", "-c", "cat; echo done; exit 3"], input="hi\n", cwd=str(tmp_path), timeout=30)
        assert r.returncode == 3
        assert r.stdout == "hi\ndone\n"

    def test_kills_leftover_background_process_after_exit(self, tmp_path):
        r = ex.run_step_session(["bash", "-c", "sleep 300 & echo $!"], input="", cwd=str(tmp_path), timeout=30)
        pid = int(r.stdout.strip())
        assert _wait_dead(pid), "step 세션이 남긴 프로세스가 아직 살아 있다"

    def test_kills_detached_descendant_by_marker(self, tmp_path):
        # Claude Code의 Bash 도구는 명령마다 새 세션(setsid)으로 돌려 그룹 정리로는 못 끈다 → 물려받은 표시로 찾아 끈다
        # 떨어져 나간 뒤에(세션 번호 = 자기 번호) 리더가 끝나게 기다린다 — 그 전에 끝나면 그룹 정리에 우연히 걸린다
        script = ("setsid sleep 300 >/dev/null 2>&1 < /dev/null & p=$!; "
                  "until [ \"$(ps -o sid= -p $p | tr -d ' ')\" = \"$p\" ]; do sleep 0.01; done; echo $p")
        r = ex.run_step_session(["bash", "-c", script], input="", cwd=str(tmp_path), timeout=30)
        pid = int(r.stdout.strip())
        assert _wait_dead(pid), "새 세션으로 떨어져 나간 프로세스가 남았다"

    def test_marker_is_unique_per_session(self, tmp_path):
        a = ex.run_step_session(["bash", "-c", "echo $HARNESS_STEP_SESSION"], input="", cwd=str(tmp_path), timeout=30)
        b = ex.run_step_session(["bash", "-c", "echo $HARNESS_STEP_SESSION"], input="", cwd=str(tmp_path), timeout=30)
        assert a.stdout.strip() and b.stdout.strip() and a.stdout != b.stdout

    def test_timeout_raises_and_kills_whole_group(self, tmp_path):
        started = time.monotonic()
        with pytest.raises(ex.StepTimeout) as e:
            ex.run_step_session(["bash", "-c", "sleep 300 & echo $!; sleep 300"], input="", cwd=str(tmp_path), timeout=1)
        assert time.monotonic() - started < 20
        assert e.value.timeout == 1
        pid = int(e.value.stdout.strip())
        assert _wait_dead(pid), "시간 초과 뒤에도 프로세스가 남았다"


# ---------------------------------------------------------------------------
# progress_indicator (= 이전 Spinner)
# ---------------------------------------------------------------------------

class TestProgressIndicator:
    def test_context_manager(self):
        import time
        with ex.progress_indicator("test") as pi:
            time.sleep(0.15)
        assert pi.elapsed >= 0.1

    def test_elapsed_increases(self):
        import time
        with ex.progress_indicator("test") as pi:
            time.sleep(0.2)
        assert pi.elapsed > 0


# ---------------------------------------------------------------------------
# main() CLI 파싱 (mocked)
# ---------------------------------------------------------------------------

class TestMainCli:
    def test_no_args_exits(self):
        with patch("sys.argv", ["execute.py"]):
            with pytest.raises(SystemExit) as exc_info:
                ex.main()
            assert exc_info.value.code == 2  # argparse exits with 2

    def test_invalid_phase_dir_exits(self):
        with patch("sys.argv", ["execute.py", "nonexistent"]):
            with patch.object(ex, "ROOT", Path("/tmp/fake_nonexistent")):
                with pytest.raises(SystemExit) as exc_info:
                    ex.main()
                assert exc_info.value.code == 1

    def test_missing_index_exits(self, tmp_project):
        (tmp_project / "phases" / "empty").mkdir()
        with patch("sys.argv", ["execute.py", "empty"]):
            with patch.object(ex, "ROOT", tmp_project):
                with pytest.raises(SystemExit) as exc_info:
                    ex.main()
                assert exc_info.value.code == 1


# ---------------------------------------------------------------------------
# _check_blockers (= 이전 main() error/blocked 체크)
# ---------------------------------------------------------------------------

class TestCheckBlockers:
    def _make_executor_with_steps(self, tmp_project, steps):
        d = tmp_project / "phases" / "test-phase"
        d.mkdir(exist_ok=True)
        index = {"project": "T", "phase": "test", "steps": steps}
        (d / "index.json").write_text(json.dumps(index))

        with patch.object(ex, "ROOT", tmp_project):
            inst = ex.StepExecutor.__new__(ex.StepExecutor)
        inst._root = str(tmp_project)
        inst._phases_dir = tmp_project / "phases"
        inst._phase_dir = d
        inst._phase_dir_name = "test-phase"
        inst._index_file = d / "index.json"
        inst._top_index_file = tmp_project / "phases" / "index.json"
        inst._phase_name = "test"
        inst._total = len(steps)
        return inst

    def test_error_step_exits_1(self, tmp_project):
        steps = [
            {"step": 0, "name": "ok", "status": "completed"},
            {"step": 1, "name": "bad", "status": "error", "error_message": "fail"},
        ]
        inst = self._make_executor_with_steps(tmp_project, steps)
        with pytest.raises(SystemExit) as exc_info:
            inst._check_blockers()
        assert exc_info.value.code == 1

    def test_blocked_step_exits_2(self, tmp_project):
        steps = [
            {"step": 0, "name": "ok", "status": "completed"},
            {"step": 1, "name": "stuck", "status": "blocked", "blocked_reason": "API key"},
        ]
        inst = self._make_executor_with_steps(tmp_project, steps)
        with pytest.raises(SystemExit) as exc_info:
            inst._check_blockers()
        assert exc_info.value.code == 2


# ---------------------------------------------------------------------------
# 리뷰 게이트
# ---------------------------------------------------------------------------

class TestReviewGate:
    """step 완료 → 리뷰 PASS 면 커밋, FIX 면 지적 사항을 들고 재시도."""

    def _setup(self, executor, verdicts):
        commits, prompts, reviews = [], [], list(verdicts)

        def fake_invoke(step, preamble):
            prompts.append(preamble)
            index = executor._read_json(executor._index_file)
            for s in index["steps"]:
                if s["step"] == step["step"]:
                    s["status"] = "completed"
                    s["summary"] = "done"
            executor._write_json(executor._index_file, index)

        def fake_review(step, base):
            v = reviews.pop(0)
            if isinstance(v, Exception):
                raise v
            return v == "PASS", f"리뷰 본문 {v}\nVERDICT: {v}"

        executor._invoke_claude = fake_invoke
        executor._review_step = fake_review
        executor._commit_step = lambda n, name: commits.append(n)
        executor._head_sha = lambda: "abc123"
        executor._update_top_index = lambda status: None
        return commits, prompts

    def _status(self, executor):
        return next(s for s in executor._read_json(executor._index_file)["steps"] if s["step"] == 2)

    def test_pass_commits_and_moves_on(self, executor):
        commits, prompts = self._setup(executor, ["PASS"])
        assert executor._execute_single_step({"step": 2, "name": "ui"}, "") is True
        assert commits == [2] and len(prompts) == 1
        assert self._status(executor)["status"] == "completed"

    def test_fix_retries_with_review_feedback(self, executor):
        commits, prompts = self._setup(executor, ["FIX", "PASS"])
        assert executor._execute_single_step({"step": 2, "name": "ui"}, "") is True
        assert len(prompts) == 2 and commits == [2]
        assert "리뷰 본문 FIX" in prompts[1] and "harness-reviewer" in prompts[1]
        assert "error_message" not in self._status(executor)

    def test_fix_every_time_errors_after_max_retries(self, executor):
        assert ex.StepExecutor.MAX_RETRIES == 5
        commits, prompts = self._setup(executor, ["FIX"] * 5)
        with pytest.raises(SystemExit) as e:
            executor._execute_single_step({"step": 2, "name": "ui"}, "")
        assert e.value.code == 1 and len(prompts) == 5
        st = self._status(executor)
        assert st["status"] == "error" and "리뷰 본문 FIX" in st["error_message"]

    def test_review_unavailable_stops_without_commit(self, executor):
        commits, prompts = self._setup(executor, [ex.ReviewUnavailable("boom")])
        with pytest.raises(SystemExit) as e:
            executor._execute_single_step({"step": 2, "name": "ui"}, "")
        assert e.value.code == 1 and commits == [] and len(prompts) == 1
        assert "[리뷰 실패] boom" in self._status(executor)["error_message"]

    def test_no_review_skips_reviewer(self, executor):
        commits, prompts = self._setup(executor, [])
        executor._review = False
        assert executor._execute_single_step({"step": 2, "name": "ui"}, "") is True
        assert commits == [2]

    def test_step_timeout_records_error_and_stops_without_commit(self, executor):
        commits, prompts = self._setup(executor, [])

        def timed_out(step, preamble):
            prompts.append(preamble)
            raise ex.StepTimeout(1800, "", "")

        executor._invoke_claude = timed_out
        with pytest.raises(SystemExit) as e:
            executor._execute_single_step({"step": 2, "name": "ui"}, "")
        assert e.value.code == 1 and commits == [] and len(prompts) == 1
        st = self._status(executor)
        assert st["status"] == "error" and "failed_at" in st
        assert "[시간 초과]" in st["error_message"] and "1800" in st["error_message"]

    def test_env_disables_review(self, tmp_project, phase_dir, monkeypatch):
        monkeypatch.setenv("HARNESS_REVIEW", "0")
        with patch.object(ex, "ROOT", tmp_project):
            assert ex.StepExecutor("0-mvp")._review is False


class TestReviewStep:
    def _run(self, executor, stdout, returncode=0):
        mock = MagicMock(returncode=returncode, stdout=stdout, stderr="")
        with patch("subprocess.run", return_value=mock) as run:
            result = executor._review_step({"step": 2, "name": "ui"}, "abc123")
        return result, run

    def test_read_only_session(self, executor):
        (passed, text), run = self._run(executor, json.dumps({"result": "ok\nVERDICT: PASS"}))
        assert passed is True
        cmd = run.call_args[0][0]
        allowed = cmd[cmd.index("--allowedTools") + 1:]
        denied = cmd[cmd.index("--disallowedTools") + 1:cmd.index("--allowedTools")]
        assert not {"Edit", "Write"} & set(allowed)
        assert {"Edit", "Write", "MultiEdit"} <= set(denied)
        assert "--dangerously-skip-permissions" not in cmd
        kw = run.call_args[1]
        assert "git diff abc123" in kw["input"] and "step2.md" in kw["input"]
        assert kw["env"]["HARNESS_STOP_CHECK"] == "0"
        assert (executor._phase_dir / "step2-review-output.json").exists()

    def test_fix_verdict(self, executor):
        (passed, text), _ = self._run(executor, json.dumps({"result": "`a.ts:3` 버그\nVERDICT: FIX"}))
        assert passed is False and "a.ts:3" in text

    def test_last_verdict_wins(self, executor):
        (passed, _), _ = self._run(executor, json.dumps({"result": "예시: VERDICT: PASS\nVERDICT: FIX\n"}))
        assert passed is False

    def test_missing_verdict_is_unavailable(self, executor):
        with pytest.raises(ex.ReviewUnavailable):
            self._run(executor, json.dumps({"result": "판정 없음"}))

    def test_nonzero_exit_is_unavailable(self, executor):
        with pytest.raises(ex.ReviewUnavailable):
            self._run(executor, json.dumps({"result": "VERDICT: PASS"}), returncode=1)

    def test_timeout_is_unavailable(self, executor):
        with patch("subprocess.run", side_effect=subprocess.TimeoutExpired("claude", 900)):
            with pytest.raises(ex.ReviewUnavailable):
                executor._review_step({"step": 2, "name": "ui"}, None)

#!/usr/bin/env python3
"""
Harness Step Executor — phase 내 step을 순차 실행하고 자가 교정한다.

Usage (프로젝트 루트 또는 하위 폴더에서):
    python3 ~/.claude/harness/scripts/execute.py <phase-dir> [--push]

전역 설치판 변경점 (원본: github.com/jha0313/harness_framework):
- ROOT는 스크립트 위치가 아니라 현재 디렉토리의 git 루트다.
- 하위 claude 세션은 --dangerously-skip-permissions 대신 acceptEdits + 허용 도구 목록으로 실행한다.
  허용 목록은 HARNESS_ALLOWED_TOOLS(쉼표 구분)로 덮어쓸 수 있다.
- 커밋 전 .env/키 파일 등 비밀정보로 보이는 파일은 스테이징에서 제외한다.
- 리뷰 게이트: step 완료 후 읽기 전용 리뷰 세션(harness-reviewer)이 PASS 해야 커밋하고 다음 step 으로 간다.
  FIX 면 리뷰 내용을 다음 시도에 전달해 재시도한다. 끄려면 --no-review.
- step 세션은 자기 프로세스 그룹에서 돌고, 끝나거나 시간이 넘으면 그 그룹을 통째로 끈다.
  Claude Code의 Bash 도구는 명령마다 새 세션으로 띄우므로, 세션마다 고유한 HARNESS_STEP_SESSION 표시를 환경 변수로
  물려주고 그 표시를 가진 프로세스도 찾아 끈다(/proc). 세션이 띄운 서버·감시 스크립트가 공개 포트를 연 채 남지 않게 한다.
- 시간 제한(기본 1800초, HARNESS_STEP_TIMEOUT으로 바꿈)을 넘으면 step을 error로 기록하고 커밋 없이 멈춘다.
"""

import argparse
import contextlib
import json
import os
import re
import signal
import subprocess
import sys
import tempfile
import threading
import time
import types
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

def _project_root() -> Path:
    """현재 디렉토리의 git 루트. git repo가 아니면 현재 디렉토리."""
    r = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True)
    top = r.stdout.strip()
    return Path(top) if r.returncode == 0 and top else Path.cwd()


ROOT = _project_root()

DEFAULT_ALLOWED_TOOLS = [
    "Read", "Glob", "Grep", "Edit", "Write", "MultiEdit", "TodoWrite",
    "Bash(npm:*)", "Bash(npx:*)", "Bash(node:*)", "Bash(pnpm:*)", "Bash(yarn:*)",
    "Bash(python3:*)", "Bash(pytest:*)",
    "Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)", "Bash(git add:*)", "Bash(git commit:*)",
    "Bash(ls:*)", "Bash(mkdir:*)", "Bash(cat:*)",
]

# 커밋에서 제외할 비밀정보 파일 (basename 기준)
SECRET_PATTERNS = (
    re.compile(r"^\.env(\..+)?$"),
    re.compile(r".*\.(pem|key|p12|pfx)$"),
    re.compile(r"^id_(rsa|ecdsa|ed25519)(\.pub)?$"),
)
SECRET_ALLOW = re.compile(r"^\.env\.(example|sample|template)$")


REVIEW_TOOLS = [
    "Read", "Glob", "Grep",
    "Bash(git diff:*)", "Bash(git log:*)", "Bash(git show:*)", "Bash(git status:*)", "Bash(git ls-files:*)",
]
REVIEW_DENIED = ["Edit", "Write", "MultiEdit", "NotebookEdit"]
REVIEW_TIMEOUT = 900
REVIEWER_FILE = Path.home() / ".claude" / "agents" / "harness-reviewer.md"
VERDICT_RE = re.compile(r"^\s*VERDICT:\s*(PASS|FIX)\s*$", re.MULTILINE)


class ReviewUnavailable(Exception):
    """리뷰 세션이 판정을 내지 못함 (실행 실패, 타임아웃, VERDICT 누락)."""


STEP_TIMEOUT_DEFAULT = 1800
_POSIX = os.name == "posix"


class StepTimeout(Exception):
    """step 세션이 시간 제한 안에 끝나지 않음. 세션의 프로세스 그룹은 이미 정리했다."""

    def __init__(self, timeout: int, stdout: str, stderr: str):
        super().__init__(f"step 세션이 {timeout}초 안에 끝나지 않았다")
        self.timeout, self.stdout, self.stderr = timeout, stdout, stderr


def _step_timeout() -> int:
    raw = os.environ.get("HARNESS_STEP_TIMEOUT", "").strip()
    try:
        value = int(raw)
    except ValueError:
        return STEP_TIMEOUT_DEFAULT
    return value if value > 0 else STEP_TIMEOUT_DEFAULT


def _kill_group(proc: subprocess.Popen) -> None:
    """세션과 세션이 띄운 프로세스(같은 그룹)를 모두 끈다. TERM 뒤 남은 것은 KILL."""
    if not _POSIX:
        if proc.poll() is None:
            proc.kill()
            proc.wait()
        return
    for sig in (signal.SIGTERM, signal.SIGKILL):
        try:
            os.killpg(proc.pid, sig)
        except (ProcessLookupError, PermissionError):
            break
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            if proc.poll() is None:
                time.sleep(0.05)
                continue
            try:
                os.killpg(proc.pid, 0)
            except (ProcessLookupError, PermissionError):
                return
            time.sleep(0.05)
    if proc.poll() is None:
        proc.kill()
    proc.wait()


def _marked_pids(token: str) -> list:
    """환경 변수에 HARNESS_STEP_SESSION=<token>이 있는 프로세스(같은 사용자). /proc이 없으면 빈 목록."""
    needle = f"HARNESS_STEP_SESSION={token}".encode()
    found = []
    for entry in Path("/proc").glob("[0-9]*"):
        pid = int(entry.name)
        if pid == os.getpid():
            continue
        try:
            env = (entry / "environ").read_bytes()
        except OSError:
            continue
        if needle in env.split(b"\0"):
            found.append(pid)
    return found


def _kill_marked(token: str) -> None:
    """새 세션으로 떨어져 나가 그룹 정리에 안 걸리는 자손을 표시로 찾아 끈다. TERM 뒤 남은 것은 KILL."""
    for sig in (signal.SIGTERM, signal.SIGKILL):
        pids = _marked_pids(token)
        if not pids:
            return
        for pid in pids:
            try:
                os.kill(pid, sig)
            except (ProcessLookupError, PermissionError):
                pass
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline and _marked_pids(token):
            time.sleep(0.05)


def run_step_session(cmd: list, *, input: str, cwd: str, timeout: int) -> subprocess.CompletedProcess:
    """cmd를 새 프로세스 그룹에서 돌리고, 끝나거나 시간이 넘으면 그룹을 통째로 끈다.
    출력은 파이프 대신 임시 파일로 받는다 — 남은 자식이 파이프를 쥐고 있어도 기다리다 멈추지 않는다."""
    token = uuid.uuid4().hex
    env = {**os.environ, "HARNESS_STEP_SESSION": token}
    with tempfile.TemporaryFile("w+", encoding="utf-8") as fin, \
            tempfile.TemporaryFile("w+", encoding="utf-8", errors="replace") as fout, \
            tempfile.TemporaryFile("w+", encoding="utf-8", errors="replace") as ferr:
        fin.write(input)
        fin.flush()
        fin.seek(0)
        proc = subprocess.Popen(cmd, cwd=cwd, env=env, stdin=fin, stdout=fout, stderr=ferr, start_new_session=_POSIX)
        timed_out = False
        try:
            proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
        finally:
            _kill_group(proc)
            if _POSIX:
                _kill_marked(token)
        fout.seek(0)
        ferr.seek(0)
        stdout, stderr = fout.read(), ferr.read()
    if timed_out:
        raise StepTimeout(timeout, stdout, stderr)
    return subprocess.CompletedProcess(cmd, proc.returncode, stdout, stderr)


def _allowed_tools() -> list:
    env = os.environ.get("HARNESS_ALLOWED_TOOLS", "").strip()
    return [t.strip() for t in env.split(",") if t.strip()] if env else list(DEFAULT_ALLOWED_TOOLS)


@contextlib.contextmanager
def progress_indicator(label: str):
    """터미널 진행 표시기. with 문으로 사용하며 .elapsed 로 경과 시간을 읽는다."""
    frames = "◐◓◑◒"
    stop = threading.Event()
    t0 = time.monotonic()

    def _animate():
        idx = 0
        while not stop.wait(0.12):
            sec = int(time.monotonic() - t0)
            sys.stderr.write(f"\r{frames[idx % len(frames)]} {label} [{sec}s]")
            sys.stderr.flush()
            idx += 1
        sys.stderr.write("\r" + " " * (len(label) + 20) + "\r")
        sys.stderr.flush()

    th = threading.Thread(target=_animate, daemon=True)
    th.start()
    info = types.SimpleNamespace(elapsed=0.0)
    try:
        yield info
    finally:
        stop.set()
        th.join()
        info.elapsed = time.monotonic() - t0


class StepExecutor:
    """Phase 디렉토리 안의 step들을 순차 실행하는 하네스."""

    MAX_RETRIES = 5
    FEAT_MSG = "feat({phase}): step {num} — {name}"
    CHORE_MSG = "chore({phase}): step {num} output"
    TZ = timezone(timedelta(hours=9))

    def __init__(self, phase_dir_name: str, *, auto_push: bool = False, review: bool = True):
        self._root = str(ROOT)
        self._phases_dir = ROOT / "phases"
        self._phase_dir = self._phases_dir / phase_dir_name
        self._phase_dir_name = phase_dir_name
        self._top_index_file = self._phases_dir / "index.json"
        self._auto_push = auto_push
        self._review = review and os.environ.get("HARNESS_REVIEW") != "0"

        if not self._phase_dir.is_dir():
            print(f"ERROR: {self._phase_dir} not found")
            sys.exit(1)

        self._index_file = self._phase_dir / "index.json"
        if not self._index_file.exists():
            print(f"ERROR: {self._index_file} not found")
            sys.exit(1)

        idx = self._read_json(self._index_file)
        self._project = idx.get("project", "project")
        self._phase_name = idx.get("phase", phase_dir_name)
        self._total = len(idx["steps"])

    def run(self):
        self._print_header()
        self._check_blockers()
        self._checkout_branch()
        guardrails = self._load_guardrails()
        self._ensure_created_at()
        self._execute_all_steps(guardrails)
        self._finalize()

    # --- timestamps ---

    def _stamp(self) -> str:
        return datetime.now(self.TZ).strftime("%Y-%m-%dT%H:%M:%S%z")

    # --- JSON I/O ---

    @staticmethod
    def _read_json(p: Path) -> dict:
        return json.loads(p.read_text(encoding="utf-8"))

    @staticmethod
    def _write_json(p: Path, data: dict):
        p.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    # --- git ---

    def _run_git(self, *args) -> subprocess.CompletedProcess:
        cmd = ["git"] + list(args)
        return subprocess.run(cmd, cwd=self._root, capture_output=True, text=True)

    def _checkout_branch(self):
        branch = f"feat-{self._phase_name}"

        r = self._run_git("rev-parse", "--abbrev-ref", "HEAD")
        if r.returncode != 0:
            print(f"  ERROR: git을 사용할 수 없거나 git repo가 아닙니다.")
            print(f"  {r.stderr.strip()}")
            sys.exit(1)

        if r.stdout.strip() == branch:
            return

        r = self._run_git("rev-parse", "--verify", branch)
        r = self._run_git("checkout", branch) if r.returncode == 0 else self._run_git("checkout", "-b", branch)

        if r.returncode != 0:
            print(f"  ERROR: 브랜치 '{branch}' checkout 실패.")
            print(f"  {r.stderr.strip()}")
            print(f"  Hint: 변경사항을 stash하거나 commit한 후 다시 시도하세요.")
            sys.exit(1)

        print(f"  Branch: {branch}")

    def _commit_step(self, step_num: int, step_name: str):
        output_rel = f"phases/{self._phase_dir_name}/step{step_num}-output.json"
        index_rel = f"phases/{self._phase_dir_name}/index.json"
        review_rel = f"phases/{self._phase_dir_name}/step{step_num}-review-output.json"

        self._run_git("add", "-A")
        self._unstage_secrets()
        self._run_git("reset", "HEAD", "--", output_rel)
        self._run_git("reset", "HEAD", "--", review_rel)
        self._run_git("reset", "HEAD", "--", index_rel)

        if self._run_git("diff", "--cached", "--quiet").returncode != 0:
            msg = self.FEAT_MSG.format(phase=self._phase_name, num=step_num, name=step_name)
            r = self._run_git("commit", "-m", msg)
            if r.returncode == 0:
                print(f"  Commit: {msg}")
            else:
                print(f"  WARN: 코드 커밋 실패: {r.stderr.strip()}")

        self._run_git("add", "-A")
        self._unstage_secrets()
        if self._run_git("diff", "--cached", "--quiet").returncode != 0:
            msg = self.CHORE_MSG.format(phase=self._phase_name, num=step_num)
            r = self._run_git("commit", "-m", msg)
            if r.returncode != 0:
                print(f"  WARN: housekeeping 커밋 실패: {r.stderr.strip()}")

    def _unstage_secrets(self):
        r = self._run_git("diff", "--name-only", "--cached")
        names = r.stdout.splitlines() if isinstance(getattr(r, "stdout", None), str) else []
        for name in names:
            base = os.path.basename(name)
            if SECRET_ALLOW.match(base) or not any(p.match(base) for p in SECRET_PATTERNS):
                continue
            self._run_git("reset", "HEAD", "--", name)
            print(f"  WARN: 비밀정보로 보이는 파일을 커밋에서 제외: {name}")

    # --- top-level index ---

    def _update_top_index(self, status: str):
        if not self._top_index_file.exists():
            return
        top = self._read_json(self._top_index_file)
        ts = self._stamp()
        for phase in top.get("phases", []):
            if phase.get("dir") == self._phase_dir_name:
                phase["status"] = status
                ts_key = {"completed": "completed_at", "error": "failed_at", "blocked": "blocked_at"}.get(status)
                if ts_key:
                    phase[ts_key] = ts
                break
        self._write_json(self._top_index_file, top)

    # --- guardrails & context ---

    def _load_guardrails(self) -> str:
        sections = []
        claude_md = ROOT / "CLAUDE.md"
        if claude_md.exists():
            sections.append(f"## 프로젝트 규칙 (CLAUDE.md)\n\n{claude_md.read_text()}")
        docs_dir = ROOT / "docs"
        if docs_dir.is_dir():
            for doc in sorted(docs_dir.glob("*.md")):
                sections.append(f"## {doc.stem}\n\n{doc.read_text()}")
        return "\n\n---\n\n".join(sections) if sections else ""

    @staticmethod
    def _build_step_context(index: dict) -> str:
        lines = [
            f"- Step {s['step']} ({s['name']}): {s['summary']}"
            for s in index["steps"]
            if s["status"] == "completed" and s.get("summary")
        ]
        if not lines:
            return ""
        return "## 이전 Step 산출물\n\n" + "\n".join(lines) + "\n\n"

    def _build_preamble(self, guardrails: str, step_context: str,
                        prev_error: Optional[str] = None) -> str:
        commit_example = self.FEAT_MSG.format(
            phase=self._phase_name, num="N", name="<step-name>"
        )
        retry_section = ""
        if prev_error:
            retry_section = (
                f"\n## ⚠ 이전 시도 실패 — 아래 에러를 반드시 참고하여 수정하라\n\n"
                f"{prev_error}\n\n---\n\n"
            )
        return (
            f"당신은 {self._project} 프로젝트의 개발자입니다. 아래 step을 수행하세요.\n\n"
            f"{guardrails}\n\n---\n\n"
            f"{step_context}{retry_section}"
            f"## 작업 규칙\n\n"
            f"1. 이전 step에서 작성된 코드를 확인하고 일관성을 유지하라.\n"
            f"2. 이 step에 명시된 작업만 수행하라. 추가 기능이나 파일을 만들지 마라.\n"
            f"3. 기존 테스트를 깨뜨리지 마라.\n"
            f"4. AC(Acceptance Criteria) 검증을 직접 실행하라.\n"
            f"5. /phases/{self._phase_dir_name}/index.json의 해당 step status를 업데이트하라:\n"
            f"   - AC 통과 → \"completed\" + \"summary\" 필드에 이 step의 산출물을 한 줄로 요약\n"
            f"   - {self.MAX_RETRIES}회 수정 시도 후에도 실패 → \"error\" + \"error_message\" 기록\n"
            f"   - 사용자 개입이 필요한 경우 (API 키, 인증, 수동 설정 등) → \"blocked\" + \"blocked_reason\" 기록 후 즉시 중단\n"
            f"6. 모든 변경사항을 커밋하라:\n"
            f"   {commit_example}\n\n---\n\n"
        )

    # --- Claude 호출 ---

    def _invoke_claude(self, step: dict, preamble: str) -> dict:
        step_num, step_name = step["step"], step["name"]
        step_file = self._phase_dir / f"step{step_num}.md"

        if not step_file.exists():
            print(f"  ERROR: {step_file} not found")
            sys.exit(1)

        prompt = preamble + step_file.read_text()
        out_path = self._phase_dir / f"step{step_num}-output.json"
        # 프롬프트는 stdin으로 전달한다 (--allowedTools는 가변 인자라 뒤의 위치 인자를 삼킨다)
        try:
            result = run_step_session(
                ["claude", "-p", "--permission-mode", "acceptEdits", "--output-format", "json",
                 "--allowedTools", *_allowed_tools()],
                input=prompt, cwd=self._root, timeout=_step_timeout(),
            )
        except StepTimeout as e:
            with open(out_path, "w") as f:
                json.dump({"step": step_num, "name": step_name, "timedOut": True, "timeout": e.timeout,
                           "stdout": e.stdout, "stderr": e.stderr}, f, indent=2, ensure_ascii=False)
            raise

        if result.returncode != 0:
            print(f"\n  WARN: Claude가 비정상 종료됨 (code {result.returncode})")
            if result.stderr:
                print(f"  stderr: {result.stderr[:500]}")

        output = {
            "step": step_num, "name": step_name,
            "exitCode": result.returncode,
            "stdout": result.stdout, "stderr": result.stderr,
        }
        with open(out_path, "w") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)

        return output

    # --- 헤더 & 검증 ---

    def _print_header(self):
        print(f"\n{'='*60}")
        print(f"  Harness Step Executor")
        print(f"  Phase: {self._phase_name} | Steps: {self._total}")
        if self._auto_push:
            print(f"  Auto-push: enabled")
        print(f"  Review: {'harness-reviewer (끄기: --no-review)' if self._review else 'off'}")
        print(f"{'='*60}")

    def _check_blockers(self):
        index = self._read_json(self._index_file)
        for s in reversed(index["steps"]):
            if s["status"] == "error":
                print(f"\n  ✗ Step {s['step']} ({s['name']}) failed.")
                print(f"  Error: {s.get('error_message', 'unknown')}")
                print(f"  Fix and reset status to 'pending' to retry.")
                sys.exit(1)
            if s["status"] == "blocked":
                print(f"\n  ⏸ Step {s['step']} ({s['name']}) blocked.")
                print(f"  Reason: {s.get('blocked_reason', 'unknown')}")
                print(f"  Resolve and reset status to 'pending' to retry.")
                sys.exit(2)
            if s["status"] != "pending":
                break

    def _ensure_created_at(self):
        index = self._read_json(self._index_file)
        if "created_at" not in index:
            index["created_at"] = self._stamp()
            self._write_json(self._index_file, index)

    # --- 리뷰 게이트 ---

    def _reviewer_instructions(self) -> str:
        if REVIEWER_FILE.exists():
            text = REVIEWER_FILE.read_text(encoding="utf-8")
            if text.startswith("---"):
                text = text.split("---", 2)[2]
            return text.strip()
        return ("너는 독립적인 코드 리뷰어다. 코드를 수정하지 말고 정확성, 보안, CLAUDE.md 규칙, 테스트를 확인해 "
                "`파일:줄`과 근거로 보고하라. 마지막 줄은 `VERDICT: PASS` 또는 `VERDICT: FIX`.")

    def _review_step(self, step: dict, base_sha: Optional[str]) -> tuple:
        """읽기 전용 리뷰 세션을 실행한다. (passed, review_text) 반환. 판정을 못 내면 ReviewUnavailable."""
        step_num, step_name = step["step"], step["name"]
        scope = (f"`git diff {base_sha}` (이 step 동안의 커밋과 미커밋 변경 모두)" if base_sha
                 else "`git status --porcelain`과 `git diff` (저장소에 아직 커밋이 없다)")
        prompt = (
            f"{self._reviewer_instructions()}\n\n---\n\n"
            f"## 이번 리뷰 대상\n\n"
            f"- 요구사항: `phases/{self._phase_dir_name}/step{step_num}.md` (Step {step_num}: {step_name})\n"
            f"- 변경 범위: {scope}. 새로 추가된 미추적 파일은 `git status --porcelain`으로 찾아 직접 읽어라.\n"
            f"- `phases/` 아래 index.json·output 파일은 하네스 메타데이터이므로 리뷰 대상이 아니다.\n"
        )
        env = dict(os.environ, HARNESS_STOP_CHECK="0")
        try:
            result = subprocess.run(
                ["claude", "-p", "--output-format", "json",
                 "--disallowedTools", *REVIEW_DENIED, "--allowedTools", *REVIEW_TOOLS],
                input=prompt, cwd=self._root, capture_output=True, text=True,
                timeout=REVIEW_TIMEOUT, env=env,
            )
        except subprocess.TimeoutExpired:
            raise ReviewUnavailable(f"리뷰가 {REVIEW_TIMEOUT}초 안에 끝나지 않았습니다.")

        out_path = self._phase_dir / f"step{step_num}-review-output.json"
        with open(out_path, "w") as f:
            json.dump({"step": step_num, "name": step_name, "exitCode": result.returncode,
                       "stdout": result.stdout, "stderr": result.stderr}, f, indent=2, ensure_ascii=False)

        text = result.stdout
        try:
            text = json.loads(result.stdout).get("result") or ""
        except (ValueError, AttributeError):
            pass
        verdicts = VERDICT_RE.findall(text or "")
        if result.returncode != 0 or not verdicts:
            raise ReviewUnavailable(
                f"리뷰 세션이 판정을 내지 못했습니다 (exit {result.returncode}). {out_path.name}를 확인하세요.")
        return verdicts[-1] == "PASS", text.strip()

    def _head_sha(self) -> Optional[str]:
        r = self._run_git("rev-parse", "--verify", "-q", "HEAD")
        sha = (r.stdout or "").strip() if isinstance(getattr(r, "stdout", None), str) else ""
        return sha if r.returncode == 0 and sha else None

    # --- 실행 루프 ---

    def _execute_single_step(self, step: dict, guardrails: str) -> bool:
        """단일 step 실행 (재시도 포함). 완료되면 True, 실패/차단이면 False."""
        step_num, step_name = step["step"], step["name"]
        done = sum(1 for s in self._read_json(self._index_file)["steps"] if s["status"] == "completed")
        prev_error = None

        for attempt in range(1, self.MAX_RETRIES + 1):
            index = self._read_json(self._index_file)
            step_context = self._build_step_context(index)
            preamble = self._build_preamble(guardrails, step_context, prev_error)

            tag = f"Step {step_num}/{self._total - 1} ({done} done): {step_name}"
            if attempt > 1:
                tag += f" [retry {attempt}/{self.MAX_RETRIES}]"

            base_sha = self._head_sha()
            try:
                with progress_indicator(tag) as pi:
                    self._invoke_claude(step, preamble)
                    elapsed = int(pi.elapsed)
            except StepTimeout as e:
                index = self._read_json(self._index_file)
                for s in index["steps"]:
                    if s["step"] == step_num:
                        s["status"] = "error"
                        s["error_message"] = (
                            f"[시간 초과] step 세션이 {e.timeout}초 안에 끝나지 않아 멈췄다. 세션이 띄운 프로세스는 정리했고 "
                            "미완성 변경은 커밋하지 않았다. 작업 폴더를 확인해 이어서 하거나 step을 더 잘게 나눈다"
                            "(시간은 HARNESS_STEP_TIMEOUT으로 늘릴 수 있다)"
                        )
                        s["failed_at"] = self._stamp()
                self._write_json(self._index_file, index)
                print(f"  ✗ Step {step_num}: {step_name} — {e.timeout}초 시간 초과. 커밋하지 않고 멈춥니다.")
                self._update_top_index("error")
                sys.exit(1)

            index = self._read_json(self._index_file)
            status = next((s.get("status", "pending") for s in index["steps"] if s["step"] == step_num), "pending")
            ts = self._stamp()

            if status == "completed" and self._review:
                try:
                    with progress_indicator(f"Review step {step_num}: {step_name}"):
                        passed, review = self._review_step(step, base_sha)
                except ReviewUnavailable as e:
                    for s in index["steps"]:
                        if s["step"] == step_num:
                            s["status"] = "error"
                            s["error_message"] = f"[리뷰 실패] {e}"
                            s["failed_at"] = ts
                    self._write_json(self._index_file, index)
                    print(f"  ✗ Step {step_num}: {step_name} — 리뷰를 실행하지 못해 커밋하지 않고 멈춥니다.")
                    print(f"    {e}")
                    self._update_top_index("error")
                    sys.exit(1)
                if passed:
                    print(f"  🔍 Review step {step_num}: PASS")
                else:
                    print(f"  🔍 Review step {step_num}: FIX — 리뷰 지적 사항을 반영해 다시 시도합니다.")
                    status = "review_fix"
                    for s in index["steps"]:
                        if s["step"] == step_num:
                            s["status"] = "error"
                            s["error_message"] = f"코드 리뷰(harness-reviewer)에서 수정을 요청했다. 아래 지적을 모두 해결하라.\n\n{review}"
                    self._write_json(self._index_file, index)

            if status == "completed":
                for s in index["steps"]:
                    if s["step"] == step_num:
                        s["completed_at"] = ts
                self._write_json(self._index_file, index)
                self._commit_step(step_num, step_name)
                print(f"  ✓ Step {step_num}: {step_name} [{elapsed}s]")
                return True

            if status == "blocked":
                for s in index["steps"]:
                    if s["step"] == step_num:
                        s["blocked_at"] = ts
                self._write_json(self._index_file, index)
                reason = next((s.get("blocked_reason", "") for s in index["steps"] if s["step"] == step_num), "")
                print(f"  ⏸ Step {step_num}: {step_name} blocked [{elapsed}s]")
                print(f"    Reason: {reason}")
                self._update_top_index("blocked")
                sys.exit(2)

            err_msg = next(
                (s.get("error_message", "Step did not update status") for s in index["steps"] if s["step"] == step_num),
                "Step did not update status",
            )

            if attempt < self.MAX_RETRIES:
                for s in index["steps"]:
                    if s["step"] == step_num:
                        s["status"] = "pending"
                        s.pop("error_message", None)
                self._write_json(self._index_file, index)
                prev_error = err_msg
                print(f"  ↻ Step {step_num}: retry {attempt}/{self.MAX_RETRIES} — {err_msg}")
            else:
                for s in index["steps"]:
                    if s["step"] == step_num:
                        s["status"] = "error"
                        s["error_message"] = f"[{self.MAX_RETRIES}회 시도 후 실패] {err_msg}"
                        s["failed_at"] = ts
                self._write_json(self._index_file, index)
                self._commit_step(step_num, step_name)
                print(f"  ✗ Step {step_num}: {step_name} failed after {self.MAX_RETRIES} attempts [{elapsed}s]")
                print(f"    Error: {err_msg}")
                self._update_top_index("error")
                sys.exit(1)

        return False  # unreachable

    def _execute_all_steps(self, guardrails: str):
        while True:
            index = self._read_json(self._index_file)
            pending = next((s for s in index["steps"] if s["status"] == "pending"), None)
            if pending is None:
                print("\n  All steps completed!")
                return

            step_num = pending["step"]
            for s in index["steps"]:
                if s["step"] == step_num and "started_at" not in s:
                    s["started_at"] = self._stamp()
                    self._write_json(self._index_file, index)
                    break

            self._execute_single_step(pending, guardrails)

    def _finalize(self):
        index = self._read_json(self._index_file)
        index["completed_at"] = self._stamp()
        self._write_json(self._index_file, index)
        self._update_top_index("completed")

        self._run_git("add", "-A")
        self._unstage_secrets()
        if self._run_git("diff", "--cached", "--quiet").returncode != 0:
            msg = f"chore({self._phase_name}): mark phase completed"
            r = self._run_git("commit", "-m", msg)
            if r.returncode == 0:
                print(f"  ✓ {msg}")

        if self._auto_push:
            branch = f"feat-{self._phase_name}"
            r = self._run_git("push", "-u", "origin", branch)
            if r.returncode != 0:
                print(f"\n  ERROR: git push 실패: {r.stderr.strip()}")
                sys.exit(1)
            print(f"  ✓ Pushed to origin/{branch}")

        print(f"\n{'='*60}")
        print(f"  Phase '{self._phase_name}' completed!")
        print(f"{'='*60}")


def main():
    parser = argparse.ArgumentParser(description="Harness Step Executor")
    parser.add_argument("phase_dir", help="Phase directory name (e.g. 0-mvp)")
    parser.add_argument("--push", action="store_true", help="Push branch after completion")
    parser.add_argument("--no-review", action="store_true", help="step 완료 후 리뷰 게이트를 끈다")
    args = parser.parse_args()

    StepExecutor(args.phase_dir, auto_push=args.push, review=not args.no_review).run()


if __name__ == "__main__":
    main()

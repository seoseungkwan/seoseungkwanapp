#!/usr/bin/python3 -I
"""PostToolUse(Edit|Write|MultiEdit|NotebookEdit) — 수정한 파일의 관련 테스트를 실행하거나 Stop 으로 예약한다.

`.harness/config.json`이 있는 프로젝트에만 적용한다. PostToolUse 는 이미 실행된 도구를 되돌릴 수 없으므로
차단하지 않고, 결과를 additionalContext 로 Claude 에게 알리고 tdd-log.jsonl 에 RED/GREEN 으로 기록한다.

- 문서 파일 → 건너뜀
- 관련 테스트: 수정 파일이 테스트면 그 파일, 아니면 tasks.md 에서 그 파일을 가진 TASK 의 Tests
- commands.test_file 이 있으면 post_edit.timeout(기본 60초) 안에 실행, 없거나 시간 초과면 Stop 으로 예약
"""
import hashlib
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
import sddlib as L  # noqa: E402

STATE_DIR = Path.home() / ".claude" / "harness" / "state"


def pending_path(root: Path) -> Path:
    return STATE_DIR / f"pending-{hashlib.sha256(str(root).encode()).hexdigest()[:16]}.json"


def schedule(root: Path, files, reason: str):
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    p = pending_path(root)
    try:
        cur = json.loads(p.read_text()) if p.exists() else {"files": []}
    except Exception:
        cur = {"files": []}
    cur["files"] = sorted(set(cur["files"]) | set(files))
    cur["reason"] = reason
    p.write_text(json.dumps(cur, ensure_ascii=False))


def handle(file_path: str, cwd: str) -> str | None:
    if not file_path:
        return None
    p = Path(file_path)
    if not p.is_absolute():
        p = Path(cwd) / p
    root = L.git_root(p)
    if root is None:
        return None
    cfg = L.load_config(root)
    if cfg is None:
        return None
    relpath = L.rel(root, p)
    if L.is_doc(relpath) or L.is_protected(relpath):
        return None

    fid = L.active_feature(root)
    tasks = L.tasks_for_file(L.load_tasks(root, fid), relpath) if fid else []
    if L.is_test(relpath, cfg):
        tests = [relpath]
    else:
        tests = sorted({t for task in tasks for t in task["tests"] if (root / t).exists()})
    if not tests:
        schedule(root, [relpath], "관련 테스트를 찾지 못함")
        return f"[harness TDD] `{relpath}`의 관련 테스트를 찾지 못해 전체 테스트를 Stop 검증으로 예약했다."

    cmd = L.build_test_command(cfg, tests) if (cfg.get("commands") or {}).get("test_file") else None
    if not cmd:
        schedule(root, tests, "commands.test_file 미설정")
        return f"[harness TDD] 관련 테스트 {', '.join(tests)} 실행을 Stop 검증으로 예약했다 (commands.test_file 미설정)."

    timeout = int((cfg.get("post_edit") or {}).get("timeout", 60))
    code, tail = L.run_shell(cmd, root, timeout)
    if code is None:
        schedule(root, tests, "시간 초과")
        return f"[harness TDD] 관련 테스트가 {timeout}초를 넘어 Stop 검증으로 예약했다: {', '.join(tests)}"

    phase = L.test_phase(code)
    if fid:
        task_ids = [t["id"] for t in tasks] or [None]
        for tid in task_ids:
            L.append_log(root, fid, {"task": tid, "phase": phase, "exit": code, "cmd": cmd,
                                     "tests": tests, "trigger": relpath, "source": "post-hook"})
    hint = {"RED": "실패 테스트가 확인됐다. 테스트를 막 작성했다면 정상적인 RED 이다. 구현 중이었다면 원인을 고쳐라.",
            "GREEN": "통과했다.",
            "ERROR": "테스트가 실행되지 않았다 (명령 없음·테스트 없음·강제 종료 등). RED 로 인정되지 않는다. 원인을 고쳐라."
            }.get(phase, "")
    return f"[harness TDD] `{relpath}` 수정 후 관련 테스트 {phase} (exit {code}). {hint}\n{tail[-1500:]}"


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        return 0
    ti = data.get("tool_input") or {}
    try:
        ctx = handle(ti.get("file_path") or ti.get("notebook_path") or "", data.get("cwd") or os.getcwd())
    except Exception as e:
        print(json.dumps({"systemMessage": f"[harness] tdd-post 오류: {e}"}, ensure_ascii=False))
        return 0
    if ctx:
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": ctx}},
                         ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/python3 -I
"""PreToolUse(Edit|Write|MultiEdit|NotebookEdit) — SDD 승인 상태와 수정 범위, TDD 순서를 검사한다.

`.harness/config.json`이 있는 프로젝트에만 적용한다. 차단은 공식 규격대로
hookSpecificOutput.permissionDecision = "deny" 로 한다 (사유는 Claude 에게 전달).

허용 순서:
  0. ~/.claude/harness/state/ (검증·승인 기록), ~/.claude/harness/coderabbit.json (CodeRabbit 정책) → 항상 차단
  1. 프로젝트 밖 / config 없음 → 관여하지 않음
  2. 훅 전용 기록(approval.json, tdd-log.jsonl, .harness/config.json) → 항상 차단
  3. 문서(*.md, specs/, docs/) → 항상 허용 (문서 작업 예외)
  4. 활성 기능 없음 / 승인 없음 / 승인 후 명세 변경 → 차단
  5. 승인된 tasks.md 의 Files/Tests 범위 밖 → 차단
  6. 구현 파일인데 해당 TASK 의 RED 기록 없음 (tdd.mode=strict) → 차단, warn 이면 경고만
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
import crlib as CR  # noqa: E402
import sddlib as L  # noqa: E402


def decide(file_path: str, cwd: str):
    """(decision, reason) — decision: None(관여 안 함) | 'allow' | 'deny' | 'warn'."""
    if not file_path:
        return None, ""
    p = Path(file_path)
    if not p.is_absolute():
        p = Path(cwd) / p
    try:
        p.resolve().relative_to(L.state_dir().resolve())
        return "deny", "`~/.claude/harness/state/`는 하네스 훅만 기록합니다 (검증 기록, merge·PR 허용 기록)."
    except ValueError:
        pass
    if p.resolve() == CR.policy_path().resolve():
        return "deny", ("`~/.claude/harness/coderabbit.json`(CodeRabbit 정책)은 사용자만 바꿉니다. "
                        "바꿀 내용을 사용자에게 제안하세요.")
    root = L.git_root(p)
    if root is None:
        return None, ""
    cfg = L.load_config(root)
    if cfg is None or not (cfg.get("sdd") or {}).get("enforce", True):
        return None, ""
    relpath = L.rel(root, p)
    if relpath.startswith("../") or relpath.startswith("/"):
        return None, ""

    if L.is_protected(relpath):
        return "deny", (f"`{relpath}`는 하네스 훅만 기록하는 파일입니다. 승인은 사용자가 `/sdd approve <기능ID>`를 직접 "
                        f"입력해야 하고, TDD 기록은 tdd-run/훅이 남깁니다. 설정 변경은 사용자에게 요청하세요.")
    if L.is_doc(relpath):
        return "allow", ""

    fid = L.active_feature(root)
    if not fid:
        return "deny", ("활성 SDD 기능이 없습니다. `/sdd`로 명세(specs/<id>/)를 만들고 `feat-<id>` 브랜치에서 작업하세요. "
                        "문서(*.md, specs/, docs/)는 승인 없이 수정할 수 있습니다.")
    state, approval = L.approval_state(root, fid)
    if state == "none":
        return "deny", (f"명세 승인 전에는 구현할 수 없습니다 (기능 `{fid}`). 명세를 사용자에게 보여주고, "
                        f"사용자가 직접 `/sdd approve {fid}`를 입력해 승인하도록 요청하세요.")
    if state == "stale":
        return "deny", (f"`{fid}` 명세(requirements/design/tasks)가 승인 이후 변경되었습니다. 변경 내용을 사용자에게 "
                        f"보여주고 `/sdd approve {fid}`로 다시 승인받으세요.")

    scope = approval.get("scope") or []
    if not L.match_any(relpath, scope):
        return "deny", (f"`{relpath}`는 승인된 수정 범위 밖입니다. 승인 범위: {', '.join(scope) or '(없음)'}. "
                        f"범위를 넓히려면 tasks.md 의 `- Files:`를 고치고 다시 승인받으세요.")

    if L.is_test(relpath, cfg) or L.is_tdd_exempt(relpath, cfg):
        return "allow", ""
    tasks = [t for t in L.tasks_for_file(L.load_tasks(root, fid), relpath) if t["tdd"] == "required"]
    if not tasks:
        return "allow", ""
    ids = [t["id"] for t in tasks]
    if L.has_red(root, fid, ids, since=approval.get("approved_at")):
        return "allow", ""
    msg = (f"TDD: `{relpath}`({', '.join(ids)})의 실패 테스트(RED) 기록이 없습니다. 먼저 테스트를 작성하고 "
           f"`python3 ~/.claude/harness/bin/tdd-run {ids[0]} --expect red`로 실패를 확인한 뒤 구현하세요.")
    mode = (cfg.get("tdd") or {}).get("mode", "strict")
    return ("warn" if mode == "warn" else "deny"), msg


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        return 0
    ti = data.get("tool_input") or {}
    file_path = ti.get("file_path") or ti.get("notebook_path") or ti.get("path") or ""
    try:
        decision, reason = decide(file_path, data.get("cwd") or os.getcwd())
    except Exception as e:  # 훅 오류로 작업이 멈추지 않도록 하되, 사용자에게는 알린다
        print(json.dumps({"systemMessage": f"[harness] sdd-guard 오류: {e}"}, ensure_ascii=False))
        return 0
    if decision == "deny":
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": "PreToolUse", "permissionDecision": "deny",
            "permissionDecisionReason": f"[harness SDD/TDD] {reason}"}}, ensure_ascii=False))
    elif decision == "warn":
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": "PreToolUse", "additionalContext": f"[harness TDD 경고] {reason}"}},
            ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())

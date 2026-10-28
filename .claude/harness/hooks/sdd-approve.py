#!/usr/bin/python3 -I
"""UserPromptSubmit — 사용자가 직접 입력한 승인/철회만 기록한다.

Claude 는 사용자 프롬프트를 만들어 낼 수 없으므로, 승인 기록의 출처는 사용자 입력뿐이다.
  /sdd approve <기능ID>   (또는 SDD-APPROVE <기능ID>)  → specs/<id>/approval.json 에 명세 해시와 함께 기록
  /sdd revoke <기능ID>    (또는 SDD-REVOKE <기능ID>)   → 승인 철회
명세 형식 검사에 실패하면 승인하지 않고 이유를 알린다. 프롬프트 자체는 막지 않는다.
"""
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
import sddlib as L  # noqa: E402

CMD_RE = re.compile(r"^\s*(?:/sdd\s+(approve|revoke)|SDD-(APPROVE|REVOKE))\s+([A-Za-z0-9][A-Za-z0-9._-]{0,63})\s*$",
                    re.IGNORECASE)


def handle(prompt: str, cwd: str, session_id: str = ""):
    """(user_message, claude_context) 또는 None."""
    m = CMD_RE.match(prompt or "")
    if not m:
        return None
    action = (m.group(1) or m.group(2)).lower()
    fid = m.group(3)
    root = L.git_root(cwd)
    if root is None or L.load_config(root) is None:
        msg = "SDD 승인 실패: 현재 폴더가 SDD가 설정된 프로젝트(.harness/config.json)가 아닙니다."
        return f"❌ {msg}", f"[harness] {msg}"
    if not L.spec_dir(root, fid).is_dir():
        msg = f"SDD 승인 실패: specs/{fid}/ 가 없습니다."
        return f"❌ {msg}", f"[harness] {msg}"

    if action == "revoke":
        L.revoke_approval(root, fid, session_id)
        return (f"⏸ SDD 승인 철회: {fid}",
                f"[harness] 사용자가 `{fid}` 승인을 철회했다. 구현 파일 수정은 다시 승인될 때까지 차단된다.")

    problems = L.validate_spec(root, fid)
    if problems:
        lst = "\n".join(f"- {p}" for p in problems)
        return (f"❌ SDD 승인 실패: {fid} 명세 형식 문제 {len(problems)}건",
                f"[harness] `{fid}` 승인이 기록되지 않았다. 명세를 고친 뒤 사용자에게 다시 승인을 요청하라:\n{lst}")
    a = L.write_approval(root, fid, session_id)
    return (f"✅ SDD 승인 기록: {fid} (spec {a['spec_sha256'][:12]})",
            f"[harness] 사용자가 `{fid}` 명세를 승인했다 (spec_sha256={a['spec_sha256'][:12]}, "
            f"수정 범위: {', '.join(a['scope'])}). 이제 /tdd 로 TASK 순서대로 RED→GREEN→REFACTOR 를 진행하라. "
            f"명세를 바꾸면 승인이 무효가 된다.")


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        return 0
    try:
        res = handle(data.get("prompt", ""), data.get("cwd") or os.getcwd(), data.get("session_id", ""))
    except Exception as e:
        print(json.dumps({"systemMessage": f"[harness] sdd-approve 오류: {e}"}, ensure_ascii=False))
        return 0
    if res:
        user_msg, context = res
        print(json.dumps({"systemMessage": user_msg, "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit", "additionalContext": context}}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/python3 -I
"""UserPromptSubmit — 사용자가 직접 입력한 merge · commit/push · PR 허용 지시를 기록한다.

Claude 는 사용자 프롬프트를 만들어 낼 수 없으므로, 승인 기록의 출처는 사용자 입력뿐이다.
승인은 그 저장소에서 만료 없이 계속 유효하다 (세션과 무관). 사용자가 `GRANT-REVOKE`를 입력하면 모두 취소된다.
guard-bash 훅이 이 기록을 확인한다.
  "merge해", "2번 머지해줘", "PR 3 merge 진행해" / MERGE-APPROVE [번호...]  → PR merge 허용 (번호가 있으면 그 PR만)
  "commit and push해", "커밋하고 푸시해", "push해줘" / PUSH-APPROVE         → main/master 직접 commit·push 허용
  PR-ALLOW                                                               → 검증 기록 없이 PR 생성 허용
  GRANT-REVOKE                                                           → 이 저장소의 허용 기록 모두 취소
  CR-RESET                                                               → CodeRabbit 리뷰 횟수 초기화
질문("merge하려면 어떻게 해?")이나 다른 말 속의 merge/push 는 승인으로 보지 않는다.
CodeRabbit 저장소(crlib.enabled)의 merge 는 번호가 있어야 기록하고, 각 번호는 한 번 merge 하면 사라진다.
"""
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
import crlib as CR  # noqa: E402
import sddlib as L  # noqa: E402

IMPERATIVE = r"\s*(해|해줘|해주세요|해라|하자|진행(해|해줘|해주세요)?|ㄱ+|go)\s*[.!~]*\s*$"
MERGE_TOKEN_RE = re.compile(r"^\s*MERGE-APPROVE((?:[\s,]+#?\d+)*)\s*$", re.IGNORECASE)
MERGE_NL_RE = re.compile(r"(merge|머지|멀지|병합)" + IMPERATIVE, re.IGNORECASE)
PUSH_TOKEN_RE = re.compile(r"^\s*PUSH-APPROVE\s*$", re.IGNORECASE)
PUSH_NL_RE = re.compile(r"(commit|커밋|push|푸시|푸쉬)" + IMPERATIVE +
                        r"|^\s*(commit\s*(and|&|,|\+)\s*)?push\s*[.!]*\s*$|^\s*commit\s*[.!]*\s*$", re.IGNORECASE)
PR_ALLOW_RE = re.compile(r"^\s*PR-ALLOW\s*$", re.IGNORECASE)
REVOKE_RE = re.compile(r"^\s*GRANT-REVOKE\s*$", re.IGNORECASE)
CR_RESET_RE = re.compile(r"^\s*CR-RESET\s*$", re.IGNORECASE)
PR_NUM_RE = re.compile(r"#(\d+)|(\d+)\s*번|\bPR\s*#?(\d+)", re.IGNORECASE)


def short_instruction(prompt: str) -> bool:
    return len(prompt) <= 80 and "?" not in prompt


def parse(prompt: str):
    """('merge', [번호] | None) / ('push', None) / ('pr', None) / ('revoke', None) / ('cr-reset', None) / None."""
    prompt = (prompt or "").strip()
    if REVOKE_RE.match(prompt):
        return "revoke", None
    if CR_RESET_RE.match(prompt):
        return "cr-reset", None
    if PR_ALLOW_RE.match(prompt):
        return "pr", None
    if PUSH_TOKEN_RE.match(prompt) or (short_instruction(prompt) and PUSH_NL_RE.search(prompt)):
        return "push", None
    m = MERGE_TOKEN_RE.match(prompt)
    if m:
        return "merge", sorted({int(n) for n in re.findall(r"\d+", m.group(1))}) or None
    if short_instruction(prompt) and MERGE_NL_RE.search(prompt):
        nums = {int(next(g for g in mm.groups() if g)) for mm in PR_NUM_RE.finditer(prompt)}
        return "merge", sorted(nums) or None
    return None


def handle(prompt: str, cwd: str, session_id: str = ""):
    res = parse(prompt)
    if not res:
        return None
    kind, prs = res
    root = L.git_root(cwd)
    if root is None:
        return None
    if kind == "revoke":
        gone = L.revoke_grants(root)
        return (f"⏹ 허용 취소: {', '.join(gone) or '(기록 없음)'}",
                "[harness] 사용자가 이 저장소의 merge·commit/push·PR 허용을 모두 취소했다. 다시 지시받기 전에는 "
                "main 직접 commit·push, PR merge, 검증 없는 PR 생성이 차단된다.")
    if kind == "cr-reset":
        CR.reset_rounds(root)
        n = CR.load_policy()["max_rounds"]
        return (f"🔄 CodeRabbit 리뷰 횟수 초기화 (다시 최대 {n}회)",
                f"[harness] 사용자가 CodeRabbit 리뷰 횟수를 초기화했다. 이 저장소에서 `cr-review`를 다시 최대 {n}회 "
                f"돌릴 수 있다.")
    cr_merge = kind == "merge" and CR.enabled(root)
    if cr_merge and not prs:
        return ("⚠️ merge 허용 안 됨: 이 저장소는 PR 번호가 필요합니다 (예: `3번 머지해`, `MERGE-APPROVE 3`)",
                "[harness] 이 저장소는 CodeRabbit 게이트 대상이라 PR 번호로 지시받은 merge 만 허용된다. 번호 없는 merge "
                "지시는 기록하지 않았다. merge 하지 말고, 필요하면 사용자에게 PR 번호를 물어라.")
    if cr_merge:  # 아직 merge 하지 않은 앞선 번호도 유지
        prs = sorted(set(prs) | set((L.read_grant(root, "merge") or {}).get("prs") or []))
    L.write_grant(root, kind, session_id, prs)
    keep = ("1회용 — merge 하면 사라짐" if cr_merge else "이 저장소에서 계속 유효, `GRANT-REVOKE`로 취소")
    if kind == "push":
        return (f"✅ commit·push 허용 (main 포함, {keep})",
                f"[harness] 사용자가 commit·push 를 지시했다. 이 저장소에서는 이제 main/master 를 포함해 "
                f"`git commit`, `git push` 가 허용된다. 커밋 전에 `git status`/`git diff --staged`로 비밀정보"
                f"(.env, 키, 인증 파일)가 없는지 확인하라. force push, --mirror/--all 은 여전히 금지다.")
    if kind == "pr":
        return (f"✅ 검증 없는 PR 생성 허용 ({keep})",
                "[harness] 사용자가 검증 기록 없이도 이 저장소에서 PR 생성(`gh pr create`)을 허용했다. "
                "PR 본문에 검증하지 않았거나 실패한 항목을 숨기지 말고 적어라.")
    target = ", ".join(f"#{n}" for n in prs) if prs else "이 저장소의 모든 PR"
    return (f"✅ merge 허용: {target} ({keep})",
            f"[harness] 사용자가 merge를 지시했다 (대상: {target}, `gh pr merge <번호>` 허용). "
            f"merge 전에 `gh pr view`로 대상 PR 의 base·draft·충돌·체크 상태를 확인하라. 다른 PR 위에 쌓인 PR 이면 "
            f"아래 PR 부터 merge 하고 base 를 main 으로 바꾼다. 대상이 모호하면 merge 하지 말고 사용자에게 물어라. "
            f"`--admin` 은 여전히 금지다.")


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        return 0
    try:
        res = handle(data.get("prompt", ""), data.get("cwd") or os.getcwd(), data.get("session_id", ""))
    except Exception as e:
        print(json.dumps({"systemMessage": f"[harness] user-grant 오류: {e}"}, ensure_ascii=False))
        return 0
    if res:
        user_msg, context = res
        print(json.dumps({"systemMessage": user_msg, "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit", "additionalContext": context}}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())

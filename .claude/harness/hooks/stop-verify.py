#!/usr/bin/python3 -I
"""Stop — 응답 종료 전에 SDD/TDD 사후 점검과 lint → build → test 검증을 한다 (stop-check.py 대체).

- git 저장소이고 미커밋 변경이 있을 때만 실행한다. 변경이 문서뿐이면 건너뛴다 (문서 작업 예외).
- `.harness/config.json` 프로젝트: config 의 commands 와 SDD 사후 점검(승인·범위·RED 기록)을 쓴다.
  Bash 로 파일을 고쳐 PreToolUse 를 우회한 경우를 여기서 잡는다.
- 그 외 프로젝트: 기존 stop-check 와 같이 package.json 의 lint/build/test 를 쓴다.
- 실패하면 exit 2 로 Claude 가 계속 수정하게 한다. 세션·프로젝트별 연속 실패가 max_attempts(기본 3)를
  넘으면 더 막지 않고 사용자에게 알린다 (무한 루프 방지). HARNESS_STOP_CHECK=0 이면 건너뛴다.
- 통과하면 코드 해시를 state/verified-*.json 에 기록한다. guard-bash 의 PR 생성 게이트가 이 기록을 본다.
"""
import hashlib
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
import sddlib as L  # noqa: E402

STATE_DIR = Path.home() / ".claude" / "harness" / "state"
STEP_TIMEOUT = 280


def _key(*parts) -> str:
    return hashlib.sha256(":".join(map(str, parts)).encode()).hexdigest()[:16]


def main():
    if os.environ.get("HARNESS_STOP_CHECK") == "0":
        return 0
    try:
        data = json.load(sys.stdin)
    except Exception:
        return 0
    root = L.git_root(data.get("cwd") or os.getcwd())
    if root is None:
        return 0
    changed = L.changed_files(root)
    if not changed:
        return 0
    code_changes = [f for f in changed if not L.is_doc(f) and not L.is_protected(f)]
    if not code_changes:
        return 0  # 문서만 바뀜

    cfg = L.load_config(root)
    max_attempts = int(((cfg or {}).get("stop") or {}).get("max_attempts", 3))
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    sp = STATE_DIR / f"stop-{_key(data.get('session_id', ''), root)}.json"
    try:
        attempts = json.loads(sp.read_text()).get("attempts", 0) if sp.exists() else 0
    except Exception:
        attempts = 0

    failure, ran = L.run_checks(root, cfg, STEP_TIMEOUT, "stop")

    if failure is None:
        L.record_verified(root, ran)  # PR 생성 게이트(guard-bash)가 이 기록을 본다
        sp.unlink(missing_ok=True)
        (STATE_DIR / f"pending-{hashlib.sha256(str(root).encode()).hexdigest()[:16]}.json").unlink(missing_ok=True)
        return 0

    attempts += 1
    if attempts > max_attempts:
        sp.unlink(missing_ok=True)
        print(json.dumps({"systemMessage": f"[harness] {failure[0]} — {max_attempts}회 수정 후에도 해결되지 않아 "
                                           f"자동 재시도를 멈췄습니다. 직접 확인이 필요합니다."}, ensure_ascii=False))
        return 0
    sp.write_text(json.dumps({"attempts": attempts}))
    print(f"[harness] {failure[0]} (자동 수정 {attempts}/{max_attempts}).\n"
          f"원인을 분석해 수정한 뒤 다시 검증하라. 테스트를 삭제하거나 약화시켜 통과시키지 마라.\n\n"
          f"{failure[1][-3000:]}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())

"""SDD/TDD 하네스 공용 라이브러리 — 훅(hooks/*.py)과 CLI(bin/*)가 함께 쓴다.

프로젝트 레이아웃 (`.harness/config.json`이 있는 프로젝트에만 SDD/TDD 강제):

    .harness/config.json            commands, tdd 모드, 예외 경로
    .harness/active                 활성 기능 ID (브랜치 feat-<id> 가 우선)
    specs/<id>/requirements.md      REQ-001 / AC-001.1 ...
    specs/<id>/design.md
    specs/<id>/tasks.md             ## TASK-1: ... / - REQ: / - Files: / - Tests: / - TDD:
    specs/<id>/approval.json        UserPromptSubmit 훅(사용자 입력)만 기록
    specs/<id>/tdd-log.jsonl        RED/GREEN 기록 (tdd-run, PostToolUse, Stop)
"""
import fnmatch
import hashlib
import json
import os
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

CONFIG_REL = ".harness/config.json"
ACTIVE_REL = ".harness/active"
SPEC_FILES = ("requirements.md", "design.md", "tasks.md")
FEATURE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
REQ_RE = re.compile(r"\bREQ-\d{3,}\b")
AC_RE = re.compile(r"\bAC-\d{3,}\.\d+\b")
TASK_HEAD_RE = re.compile(r"^##\s+(TASK-\d+)\s*[:：]?\s*(.*)$")
FIELD_RE = re.compile(r"^\s*[-*]\s*(REQ|Files|Tests|TDD)\s*[:：]\s*(.*)$", re.IGNORECASE)

# 문서 작업 예외: SDD 승인·TDD 순서와 무관하게 항상 수정 가능 (단, PROTECTED 는 제외)
DOC_PATTERNS = ("*.md", "*.mdx", "specs/*", "docs/*", ".harness/active")
# 도구가 만드는 산출물 — 사후 점검·검증 대상이 아니다 (.gitignore 가 없는 프로젝트 대비)
GENERATED_PATTERNS = ("__pycache__/*", "*.pyc", ".pytest_cache/*", "node_modules/*", "coverage/*",
                      ".nyc_output/*", "*.tsbuildinfo", ".next/*", ".turbo/*")
# 훅만 쓰는 기록 — Claude 의 Edit/Write/Bash 쓰기를 막는다
PROTECTED_PATTERNS = ("specs/*/approval.json", "specs/*/tdd-log.jsonl", CONFIG_REL)

DEFAULT_CONFIG = {
    "sdd": {"enforce": True},
    "tdd": {
        "mode": "strict",  # strict: RED 기록 없는 구현 수정 차단 / warn: 경고만
        "exempt": [
            "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock",
            "pyproject.toml", "requirements*.txt", "*.config.*", "tsconfig*.json",
            ".gitignore", ".env.example", "*.css", "*.scss",
        ],
    },
    "test_patterns": [
        "*.test.*", "*.spec.*", "test_*.py", "*_test.py", "*_test.go",
        "tests/*", "test/*", "__tests__/*",
    ],
    "commands": {"test": None, "test_file": None, "lint": None, "build": None},
    "post_edit": {"timeout": 60},
    "stop": {"max_attempts": 3},
}


# --- 경로/프로젝트 ---------------------------------------------------------------

def git_root(start) -> Path | None:
    start = Path(start)
    d = start if start.is_dir() else start.parent
    while not d.exists() and d != d.parent:
        d = d.parent
    try:
        r = subprocess.run(["git", "-C", str(d), "rev-parse", "--show-toplevel"],
                           capture_output=True, text=True, timeout=5)
    except Exception:
        return None
    top = r.stdout.strip()
    return Path(top) if r.returncode == 0 and top else None


def current_branch(root: Path) -> str | None:
    try:
        r = subprocess.run(["git", "-C", str(root), "rev-parse", "--abbrev-ref", "HEAD"],
                           capture_output=True, text=True, timeout=5)
        return r.stdout.strip() if r.returncode == 0 else None
    except Exception:
        return None


def rel(root: Path, path) -> str:
    p = Path(path)
    if not p.is_absolute():
        p = root / p
    try:
        return p.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return p.as_posix()


def match_any(relpath: str, patterns) -> bool:
    base = relpath.rsplit("/", 1)[-1]
    for pat in patterns or ():
        pat = pat.strip().removeprefix("./")
        if not pat:
            continue
        pat = pat.replace("**/", "*").replace("/**", "/*").replace("**", "*")
        if fnmatch.fnmatch(relpath, pat) or ("/" not in pat and fnmatch.fnmatch(base, pat)):
            return True
    return False


# --- 설정 ------------------------------------------------------------------------

def _merge(base: dict, over: dict) -> dict:
    out = dict(base)
    for k, v in (over or {}).items():
        out[k] = _merge(base[k], v) if isinstance(v, dict) and isinstance(base.get(k), dict) else v
    return out


def load_config(root: Path) -> dict | None:
    p = root / CONFIG_REL
    if not p.is_file():
        return None
    try:
        return _merge(DEFAULT_CONFIG, json.loads(p.read_text(encoding="utf-8")))
    except Exception:
        return _merge(DEFAULT_CONFIG, {})  # 깨진 설정이라도 강제는 유지한다


def detect_commands(root: Path) -> dict:
    """프로젝트 파일을 보고 test/lint/build 명령을 추정한다."""
    cmds = {"test": None, "test_file": None, "lint": None, "build": None}
    pkg = root / "package.json"
    if pkg.is_file():
        try:
            data = json.loads(pkg.read_text(encoding="utf-8"))
        except Exception:
            data = {}
        scripts = data.get("scripts") or {}
        deps = {**(data.get("dependencies") or {}), **(data.get("devDependencies") or {})}
        if "test" in scripts and "no test specified" not in scripts["test"]:
            cmds["test"] = "npm test --silent"
        if "lint" in scripts:
            cmds["lint"] = "npm run lint --silent"
        if "build" in scripts:
            cmds["build"] = "npm run build --silent"
        if "vitest" in deps:
            cmds["test_file"] = "npx --no-install vitest run {files}"
        elif "jest" in deps:
            cmds["test_file"] = "npx --no-install jest {files}"
        return cmds
    if (root / "pyproject.toml").is_file() or any(root.glob("**/test_*.py")):
        try:
            has_pytest = subprocess.run(["python3", "-c", "import pytest"], capture_output=True,
                                        timeout=10).returncode == 0
        except Exception:
            has_pytest = False
        if has_pytest:
            cmds["test"], cmds["test_file"] = "python3 -m pytest -q", "python3 -m pytest -q {files}"
        else:
            cmds["test"] = "python3 -m unittest discover -v"
            cmds["test_file"] = "python3 -m unittest -v {modules}"
    return cmds


# --- 기능(feature) / 명세 -----------------------------------------------------------

def active_feature(root: Path) -> str | None:
    br = current_branch(root) or ""
    if br.startswith("feat-"):
        fid = br[len("feat-"):]
        if (root / "specs" / fid).is_dir():
            return fid
    p = root / ACTIVE_REL
    if p.is_file():
        fid = p.read_text(encoding="utf-8").strip()
        if FEATURE_ID_RE.match(fid) and (root / "specs" / fid).is_dir():
            return fid
    return None


def spec_dir(root: Path, fid: str) -> Path:
    return root / "specs" / fid


def spec_hash(root: Path, fid: str) -> str | None:
    d = spec_dir(root, fid)
    h = hashlib.sha256()
    for name in SPEC_FILES:
        p = d / name
        if not p.is_file():
            return None
        h.update(name.encode() + b"\0" + p.read_bytes().replace(b"\r\n", b"\n") + b"\0")
    return h.hexdigest()


def parse_tasks(text: str) -> list:
    tasks, cur = [], None
    for line in text.splitlines():
        m = TASK_HEAD_RE.match(line)
        if m:
            cur = {"id": m.group(1), "title": m.group(2).strip(), "reqs": [], "files": [],
                   "tests": [], "tdd": "required"}
            tasks.append(cur)
            continue
        if line.startswith("## "):
            cur = None
            continue
        if cur is None:
            continue
        f = FIELD_RE.match(line)
        if not f:
            continue
        key, val = f.group(1).lower(), f.group(2)
        items = [x.strip().strip("`") for x in re.split(r"[,\s]+", val) if x.strip().strip("`")]
        if key == "req":
            cur["reqs"] = REQ_RE.findall(val)
        elif key == "files":
            cur["files"] = items
        elif key == "tests":
            cur["tests"] = items
        elif key == "tdd":
            cur["tdd"] = "exempt" if "exempt" in val.lower() else "required"
    return tasks


def load_tasks(root: Path, fid: str) -> list:
    p = spec_dir(root, fid) / "tasks.md"
    return parse_tasks(p.read_text(encoding="utf-8")) if p.is_file() else []


def parse_requirements(text: str) -> dict:
    """{REQ-001: [AC-001.1, ...]} — AC 는 바로 앞 REQ 에 묶는다."""
    reqs, cur = {}, None
    for line in text.splitlines():
        r = REQ_RE.search(line)
        if r and re.match(r"^\s*#+\s", line):
            cur = r.group(0)
            reqs.setdefault(cur, [])
            continue
        for ac in AC_RE.findall(line):
            if cur and ac not in reqs[cur]:
                reqs[cur].append(ac)
    return reqs


def validate_spec(root: Path, fid: str) -> list:
    """승인 전 형식 검사. 문제 목록(빈 리스트면 통과)."""
    d = spec_dir(root, fid)
    problems = [f"{name} 없음" for name in SPEC_FILES if not (d / name).is_file()]
    if problems:
        return problems
    for name in SPEC_FILES:
        if re.search(r"\bTODO\b", (d / name).read_text(encoding="utf-8")):
            problems.append(f"{name} 에 채우지 않은 TODO 가 남아 있음")
    reqs = parse_requirements((d / "requirements.md").read_text(encoding="utf-8"))
    if not reqs:
        problems.append("requirements.md 에 `### REQ-001: ...` 형식의 요구사항이 없음")
    for rid, acs in reqs.items():
        if not acs:
            problems.append(f"{rid} 에 수용 기준(AC-xxx.n)이 없음")
    tasks = load_tasks(root, fid)
    if not tasks:
        problems.append("tasks.md 에 `## TASK-1: ...` 형식의 작업이 없음")
    covered = set()
    for t in tasks:
        if not t["reqs"]:
            problems.append(f"{t['id']} 에 `- REQ:` 가 없음")
        if not t["files"]:
            problems.append(f"{t['id']} 에 `- Files:` (수정 범위)가 없음")
        if t["tdd"] == "required" and not t["tests"]:
            problems.append(f"{t['id']} 에 `- Tests:` 가 없음 (TDD 예외면 `- TDD: exempt`)")
        for r in t["reqs"]:
            if r not in reqs:
                problems.append(f"{t['id']} 가 없는 요구사항 {r} 를 참조")
            covered.add(r)
    for rid in reqs:
        if rid not in covered:
            problems.append(f"{rid} 를 구현하는 TASK 가 없음")
    return problems


# --- 승인 ------------------------------------------------------------------------

def approval_path(root: Path, fid: str) -> Path:
    return spec_dir(root, fid) / "approval.json"


def read_approval(root: Path, fid: str) -> dict | None:
    p = approval_path(root, fid)
    try:
        return json.loads(p.read_text(encoding="utf-8")) if p.is_file() else None
    except Exception:
        return None


def approval_state(root: Path, fid: str) -> tuple:
    """('approved'|'none'|'stale', approval_dict)."""
    a = read_approval(root, fid)
    if not a or a.get("status") != "approved":
        return "none", a
    return ("approved" if a.get("spec_sha256") == spec_hash(root, fid) else "stale"), a


def write_approval(root: Path, fid: str, session_id: str = "") -> dict:
    tasks = load_tasks(root, fid)
    data = {
        "status": "approved",
        "feature": fid,
        "approved_at": now(),
        "approved_via": "user-prompt",
        "session_id": session_id,
        "spec_sha256": spec_hash(root, fid),
        "scope": sorted({f for t in tasks for f in t["files"]} | {f for t in tasks for f in t["tests"]}),
    }
    approval_path(root, fid).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return data


def revoke_approval(root: Path, fid: str, session_id: str = "") -> None:
    p = approval_path(root, fid)
    data = {"status": "revoked", "feature": fid, "revoked_at": now(), "session_id": session_id}
    p.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


# --- 분류 ------------------------------------------------------------------------

def is_doc(relpath: str) -> bool:
    return match_any(relpath, DOC_PATTERNS) and not is_protected(relpath)


def is_protected(relpath: str) -> bool:
    return match_any(relpath, PROTECTED_PATTERNS)


def is_test(relpath: str, cfg: dict) -> bool:
    return match_any(relpath, cfg.get("test_patterns"))


def is_tdd_exempt(relpath: str, cfg: dict) -> bool:
    return match_any(relpath, (cfg.get("tdd") or {}).get("exempt"))


def tasks_for_file(tasks: list, relpath: str) -> list:
    return [t for t in tasks if match_any(relpath, t["files"]) or match_any(relpath, t["tests"])]


# --- TDD 기록 ---------------------------------------------------------------------

def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def log_path(root: Path, fid: str) -> Path:
    return spec_dir(root, fid) / "tdd-log.jsonl"


def append_log(root: Path, fid: str, entry: dict) -> dict:
    entry = {"ts": now(), **entry}
    with open(log_path(root, fid), "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    return entry


def read_log(root: Path, fid: str) -> list:
    p = log_path(root, fid)
    if not p.is_file():
        return []
    out = []
    for line in p.read_text(encoding="utf-8").splitlines():
        try:
            out.append(json.loads(line))
        except Exception:
            continue
    return out


def has_red(root: Path, fid: str, task_ids, since: str | None = None) -> bool:
    for e in read_log(root, fid):
        if e.get("phase") == "RED" and e.get("task") in task_ids and (not since or e.get("ts", "") >= since):
            return True
    return False


def last_result(root: Path, fid: str, task_id: str) -> dict | None:
    res = [e for e in read_log(root, fid) if e.get("task") == task_id]
    return res[-1] if res else None


# --- 테스트 실행 -------------------------------------------------------------------

def _modules(files) -> str:
    return " ".join(f[:-3].replace("/", ".") if f.endswith(".py") else f for f in files)


def build_test_command(cfg: dict, files=None) -> str | None:
    cmds = cfg.get("commands") or {}
    if files and cmds.get("test_file"):
        quoted = " ".join(_shq(f) for f in files)
        return cmds["test_file"].replace("{files}", quoted).replace("{modules}", _modules(files))
    return cmds.get("test")


def _shq(s: str) -> str:
    return "'" + s.replace("'", "'\\''") + "'"


def run_shell(cmd: str, root: Path, timeout: int) -> tuple:
    """(exit_code|None(timeout), tail_output)."""
    env = dict(os.environ, HARNESS_STOP_CHECK="0", CI="1", PYTHONDONTWRITEBYTECODE="1")
    try:
        r = subprocess.run(["bash", "-c", cmd], cwd=root, capture_output=True, text=True,
                           timeout=timeout, env=env)
    except subprocess.TimeoutExpired:
        return None, f"{timeout}초 안에 끝나지 않음"
    out = (r.stdout + r.stderr).strip().splitlines()
    return r.returncode, "\n".join(out[-40:])


def changed_files(root: Path) -> list:
    try:
        r = subprocess.run(["git", "-C", str(root), "status", "--porcelain", "-uall"],
                           capture_output=True, text=True, timeout=10)
    except Exception:
        return []
    files = []
    for line in r.stdout.splitlines():
        path = line[3:]
        if " -> " in path:
            path = path.split(" -> ", 1)[1]
        path = path.strip('"')
        if not match_any(path, GENERATED_PATTERNS):
            files.append(path)
    return files


# --- 검증 / PR 게이트 / 사용자 승인 -------------------------------------------------------

def state_dir() -> Path:
    return Path.home() / ".claude" / "harness" / "state"


def root_key(root: Path) -> str:
    return hashlib.sha256(str(root).encode()).hexdigest()[:16]


def verify_commands(root: Path, cfg: dict | None) -> list:
    """[(name, shell_cmd)] — lint, build, test 순서."""
    if cfg is not None:
        cmds = dict(cfg.get("commands") or {})
        if not any(cmds.get(k) for k in ("lint", "build", "test")):
            cmds = detect_commands(root)
        return [(k, cmds[k]) for k in ("lint", "build", "test") if cmds.get(k)]
    pkg = root / "package.json"
    if not pkg.is_file():
        import crlib  # CodeRabbit 저장소는 정책 tests 나 Python 테스트 파일로 테스트 명령을 정한다 (테스트 없이 PR 금지)
        cmd = crlib.test_command(root)
        return [("test", cmd)] if cmd else []
    try:
        scripts = json.loads(pkg.read_text(encoding="utf-8")).get("scripts") or {}
    except Exception:
        return []
    return [(s, f"npm run {s} --silent") for s in ("lint", "build", "test")
            if s in scripts and "no test specified" not in scripts[s]]


def audit_changes(root: Path, cfg: dict, code_changes: list) -> list:
    """SDD/TDD 사후 점검. 위반 메시지 목록."""
    if not (cfg.get("sdd") or {}).get("enforce", True) or not code_changes:
        return []
    fid = active_feature(root)
    if not fid:
        return [f"활성 SDD 기능 없이 코드가 변경됨: {', '.join(code_changes[:10])}"]
    state, approval = approval_state(root, fid)
    if state != "approved":
        why = "승인 이후 명세가 변경됨" if state == "stale" else "명세 미승인"
        return [f"`{fid}` {why} 상태에서 코드가 변경됨: {', '.join(code_changes[:10])}"]
    out = []
    scope = approval.get("scope") or []
    outside = [f for f in code_changes if not match_any(f, scope)]
    if outside:
        out.append(f"승인 범위 밖 변경: {', '.join(outside[:10])}")
    if (cfg.get("tdd") or {}).get("mode", "strict") == "strict":
        tasks = load_tasks(root, fid)
        for f in code_changes:
            if f in outside or is_test(f, cfg) or is_tdd_exempt(f, cfg):
                continue
            ids = [t["id"] for t in tasks_for_file(tasks, f) if t["tdd"] == "required"]
            if ids and not has_red(root, fid, ids, since=approval.get("approved_at")):
                out.append(f"RED 기록 없이 구현됨: {f} ({', '.join(ids)})")
    return out


def run_checks(root: Path, cfg: dict | None, timeout: int, source: str) -> tuple:
    """SDD 사후 점검 + lint → build → test. (failure(title, detail) | None, 실행한 명령 목록)."""
    code_changes = [f for f in changed_files(root) if not is_doc(f) and not is_protected(f)]
    if cfg is not None:
        violations = audit_changes(root, cfg, code_changes)
        if violations:
            return ("SDD/TDD 규칙 위반", "\n".join(f"- {v}" for v in violations) +
                    "\n규칙 밖 변경을 되돌리거나, 명세를 고쳐 사용자에게 `/sdd approve`로 재승인을 요청하라."), []
    ran = []
    for name, cmd in verify_commands(root, cfg):
        code, tail = run_shell(cmd, root, timeout)
        ran.append(cmd)
        fid = active_feature(root) if cfg is not None and name == "test" else None
        if fid:
            append_log(root, fid, {"task": None, "phase": "GREEN" if code == 0 else "RED", "exit": code,
                                   "cmd": cmd, "source": source})
        if code != 0:
            return ((f"`{cmd}` 실패" if code is not None else f"`{cmd}` 시간 초과"), tail), ran
    return None, ran


def code_hash(root: Path) -> str | None:
    """작업 트리의 코드 내용 해시 (문서·훅 기록·산출물 제외, .gitignore 존중). 커밋해도 내용이 같으면 같다."""
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        env = dict(os.environ, GIT_INDEX_FILE=os.path.join(td, "index"))
        try:
            subprocess.run(["git", "-C", str(root), "read-tree", "HEAD"], env=env, capture_output=True, timeout=10)
            if subprocess.run(["git", "-C", str(root), "add", "-A"], env=env, capture_output=True,
                              timeout=40).returncode != 0:
                return None
            r = subprocess.run(["git", "-C", str(root), "ls-files", "-s"], env=env, capture_output=True,
                               text=True, timeout=10)
        except Exception:
            return None
    h = hashlib.sha256()
    for line in r.stdout.splitlines():
        path = line.split("\t", 1)[-1]
        if is_doc(path) or is_protected(path) or match_any(path, GENERATED_PATTERNS):
            continue
        h.update(line.encode() + b"\n")
    return h.hexdigest()[:16]


def verified_path(root: Path) -> Path:
    return state_dir() / f"verified-{root_key(root)}.json"


def record_verified(root: Path, commands: list) -> None:
    state_dir().mkdir(parents=True, exist_ok=True)
    verified_path(root).write_text(json.dumps({"root": str(root), "code_hash": code_hash(root), "at": now(),
                                               "commands": commands}, ensure_ascii=False))


GRANT_KINDS = ("merge", "push", "pr")


def grant_path(root: Path, kind: str) -> Path:
    return state_dir() / f"grant-{kind}-{root_key(root)}.json"


def write_grant(root: Path, kind: str, session_id: str, prs=None) -> dict:
    """사용자 승인 기록. 만료 없이 이 저장소에서 계속 유효하다 (사용자가 GRANT-REVOKE 로 취소)."""
    state_dir().mkdir(parents=True, exist_ok=True)
    g = {"kind": kind, "root": str(root), "granted_at": now(), "session_id": session_id, "prs": prs or None}
    grant_path(root, kind).write_text(json.dumps(g))
    return g


def read_grant(root: Path, kind: str, session_id: str = "") -> dict | None:
    """이 저장소의 사용자 승인 (세션과 무관)."""
    try:
        return json.loads(grant_path(root, kind).read_text())
    except Exception:
        return None


def revoke_grants(root: Path) -> list:
    out = []
    for kind in GRANT_KINDS:
        p = grant_path(root, kind)
        if p.exists():
            p.unlink()
            out.append(kind)
    return out


def pr_gate(root: Path, session_id: str = "") -> str | None:
    """Claude 의 PR 생성 차단 사유. None 이면 허용."""
    cfg = load_config(root)
    if cfg is None and not verify_commands(root, None):
        return None  # 검증할 명령이 없는 프로젝트
    if read_grant(root, "pr", session_id):
        return None
    hint = ("`python3 ~/.claude/harness/bin/verify`로 검증을 통과시킨 뒤 다시 시도하세요. "
            "검증 없이 PR 을 만들려면 사용자가 입력창에 `PR-ALLOW`를 직접 입력해야 합니다.")
    try:
        rec = json.loads(verified_path(root).read_text())
    except Exception:
        return f"PR 생성 차단: 이 프로젝트의 검증(lint/build/test) 통과 기록이 없습니다. {hint}"
    cur = code_hash(root)
    if not cur or rec.get("code_hash") != cur:
        return f"PR 생성 차단: 마지막 검증 통과({rec.get('at')}) 이후 코드가 바뀌었습니다. {hint}"
    return None

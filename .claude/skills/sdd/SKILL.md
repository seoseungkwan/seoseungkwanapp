---
name: sdd
description: 명세 주도 개발(SDD). 요구사항(REQ/AC) → 설계 → 작업 분할(TASK)을 specs/<기능ID>/에 작성하고 사용자 승인을 받는다. 승인 전에는 구현하지 않는다. 새 기능·변경을 시작할 때, 또는 /harness 워크플로의 첫 단계로 사용한다.
argument-hint: "[기능ID | 기능 설명 | approve <기능ID> | status]"
---

# /sdd — 명세 주도 개발

인자: `$ARGUMENTS`

도구 경로: `SDD=~/.claude/harness/bin/sdd` (항상 `python3 ~/.claude/harness/bin/sdd ...` 형태로 실행)

## 인자별 동작

- `approve <id>` 또는 `revoke <id>`: 사용자가 직접 입력한 것이다. **승인·철회 기록은 UserPromptSubmit 훅이 이미 처리했다.** 훅 메시지(성공/실패와 이유)를 사용자에게 전하고 `python3 ~/.claude/harness/bin/sdd status <id>`로 상태를 보여준다. 승인 성공이면 `/tdd`로 TASK-1부터 진행할지 묻는다. 그 외의 일은 하지 않는다.
- `status` 또는 `status <id>`: `sdd status`의 추적표를 보여준다.
- 그 외(기능 설명이나 ID): 아래 절차를 따른다.

## 절대 규칙

1. **명세 승인 전에는 구현 코드를 쓰지 않는다.** 문서(`*.md`, `specs/`, `docs/`)만 작성한다. 하네스 PreToolUse 훅도 이를 차단한다.
2. **승인은 사용자만 한다.** 사용자가 프롬프트에 `/sdd approve <기능ID>`를 직접 입력해야 훅이 명세 해시와 함께 기록한다. 너는 `approval.json`, `tdd-log.jsonl`, `.harness/config.json`을 쓰거나 고치거나 지우지 않는다. 우회를 시도하지 않는다.
3. 승인 후 명세(requirements/design/tasks)를 고치면 승인이 무효가 된다. 바꿔야 하면 변경점을 보여주고 재승인을 요청한다.

## 절차

### 0. 준비
- git 저장소인지 확인한다. 기능 ID는 kebab-case로 정한다 (예: `user-login`).
- `main`/`master`면 `git switch -c feat-<기능ID>`로 브랜치를 만든다. 브랜치명 `feat-<id>`가 활성 기능을 정한다.
- 프로젝트에 `.harness/config.json`이 아직 없으면, 먼저 사용자에게 test/lint/build 명령을 확인한다 (예: `npm test`, 파일 단위 테스트 `npx vitest run {files}`, python이면 `python3 -m unittest -v {modules}`).
- `python3 ~/.claude/harness/bin/sdd init <id> --title "<제목>" [--test "…" --test-file "…" --lint "…" --build "…"]` — 템플릿과 `.harness/config.json`(없을 때만)을 만든다. 명령 옵션은 설정 파일이 처음 만들어질 때만 적용된다. 이후 설정 변경은 사용자가 직접 `.harness/config.json`을 고쳐야 한다.

### 1. 요구사항 (`specs/<id>/requirements.md`)
- 모호한 점은 추측하지 말고 사용자에게 질문한다 (한 번에 몇 개씩).
- 형식: `### REQ-001: 제목` 아래 `- AC-001.1: Given …, When …, Then …`. 모든 REQ에 AC가 하나 이상 있어야 한다.
- AC는 테스트로 검증 가능한 문장으로 쓴다. 범위 밖 항목도 적는다.

### 2. 설계 (`specs/<id>/design.md`)
- 구성 요소, 인터페이스(시그니처 수준), 데이터 흐름, 결정과 트레이드오프, 위험을 적는다.
- 프로젝트 `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/ADR.md`가 있으면 따른다.

### 3. 작업 분할 (`specs/<id>/tasks.md`)
- `## TASK-n: 제목` + `- REQ:` / `- Files:` / `- Tests:` / `- TDD: required|exempt`.
- `Files`는 **승인 후 수정 가능한 범위**다. 필요한 파일(설정 파일 포함)을 빠짐없이, 그러나 넓지 않게 적는다.
- 작업 하나는 한 모듈·한 레이어만. 모든 REQ가 어떤 TASK에 연결되어야 한다.
- `TDD: exempt`는 순수 설정·스캐폴딩 작업에만 쓰고 이유를 적는다.

### 4. 검사와 승인 요청
- `python3 ~/.claude/harness/bin/sdd check <id>`가 통과할 때까지 고친다.
- 사용자에게 요구사항·AC·TASK·수정 범위를 요약해 보여주고 이렇게 안내한다:
  > 검토 후 승인하시려면 입력창에 `/sdd approve <id>`를 직접 입력해 주세요.
- 승인 전에는 구현을 시작하지 않고 기다린다. 명세 문서는 커밋해도 된다 (feature 브랜치).

---
name: tdd
description: 승인된 SDD 명세의 TASK를 RED → GREEN → REFACTOR로 구현한다. 실패 테스트를 실행해 확인한 뒤에만 구현하고, 테스트 결과를 요구사항(REQ/AC)과 연결해 기록한다. /sdd 승인 후 또는 /harness 구현 단계에서 사용한다.
argument-hint: "[TASK-n | all]"
---

# /tdd — 테스트 주도 개발

인자: `$ARGUMENTS` (비어 있으면 tasks.md에서 아직 GREEN이 아닌 첫 TASK)

도구: `python3 ~/.claude/harness/bin/tdd-run`, `python3 ~/.claude/harness/bin/sdd status`

## 시작 조건
- `python3 ~/.claude/harness/bin/sdd status`로 활성 기능이 **✅ 승인됨**인지 확인한다. 아니면 멈추고 `/sdd`로 돌아간다.
- `specs/<id>/requirements.md`, `design.md`, `tasks.md`와 프로젝트 `CLAUDE.md`를 읽는다.
- 수정은 해당 TASK의 `Files`/`Tests` 범위 안에서만 한다. 범위 밖이 필요하면 멈추고 명세 변경과 재승인을 요청한다.

## 사이클 (TASK마다 반복)

### 1. RED — 실패하는 테스트 먼저
- TASK의 각 AC에 대해 테스트를 작성한다. **테스트 이름이나 설명에 AC ID를 넣는다** (예: `it("AC-001.1: 빈 이름이면 에러", ...)`, `def test_ac_001_1_empty_name`). 이것이 테스트 결과와 명세를 잇는 연결고리다.
- 실행해 실패를 확인한다:
  `python3 ~/.claude/harness/bin/tdd-run TASK-n --expect red`
- 실패 이유가 **기대한 동작이 없어서**인지 확인한다. 문법 오류·import 오류로 인한 실패라면 고쳐서 다시 RED를 확인한다.
- `--expect red`가 통과(✓ RED 확인)하기 전에는 구현 파일을 수정하지 않는다. 하네스 훅도 RED 기록이 없으면 구현 파일 수정을 차단한다.

### 2. GREEN — 최소 구현
- 테스트를 통과시키는 가장 단순한 구현을 쓴다. 테스트를 고쳐서 통과시키지 않는다.
- `python3 ~/.claude/harness/bin/tdd-run TASK-n --expect green`

### 3. REFACTOR — 정리
- 중복 제거, 이름 정리 등 동작을 바꾸지 않는 개선만. 매 변경 후 `--expect green`으로 확인한다.

### 4. 기록 확인
- `python3 ~/.claude/harness/bin/sdd status`로 해당 REQ/AC 행에 테스트와 GREEN이 연결됐는지 확인한다. "❌ 없음"인 AC가 있으면 테스트를 추가한다.
- 커밋은 /harness 규칙대로 `harness-reviewer`의 PASS 후에 한다.

## 자동 검증 (훅)
- 파일 수정 후 PostToolUse 훅이 관련 테스트를 실행하거나 Stop 검증으로 예약한다. 결과는 RED/GREEN으로 기록된다.
- 응답을 마칠 때 Stop 훅이 SDD/TDD 사후 점검과 lint → build → test를 실행한다. 실패하면 계속 고치게 되며, 3회를 넘으면 멈추고 사용자에게 알린다.

## 금지
- 테스트 삭제·skip·약화로 통과시키기
- 승인 범위 밖 파일 수정, `approval.json`·`tdd-log.jsonl`·`.harness/config.json` 수정
- RED 확인 없이 구현부터 작성

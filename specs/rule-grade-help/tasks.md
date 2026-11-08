# 작업 분할: 점검 규칙 표 등급 칸 '기본:' 글자 겹침 고치기

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.

## TASK-1: 등급 칸 '기본:' 글을 상자 아래 줄로
- REQ: REQ-3201
- AC: AC-3201.1, AC-3201.2
- Files: src/components/settings/RuleSettings.tsx, src/components/settings/RuleSettings.test.tsx
- Tests: src/components/settings/RuleSettings.test.tsx
- TDD: required — '기본: …' 글 요소가 블록(`block`)이고 `mt-1`이 있으며 고르는 상자 뒤에 온다. AC-3201.2는 저장소 밖 재현 사진으로 확인

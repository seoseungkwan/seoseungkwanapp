# 작업 분할: 메모 확인 한눈에 보기

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- AC:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`, `- 차례:`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다.
>
> **할 순서**: TASK-1 → TASK-2 → TASK-3. 작아서 일꾼 없이 차례로 한다. 검토는 끝에 한 번(전체 시험·lint·build·하네스 화면 사진 1440·1280·1024·390).
> 도우미·확장·Worker·저장소·SQL은 고치지 않는다.

## 먼저 할 일 (코드 작업 아님)
1. 시안 `docs/mockups/claim-memo-fit/index.html`(?s=new)은 사용자가 2026-11-16 "승인해"로 승인했다. 이 명세 승인을 그 시안 그대로 만든다는 뜻으로 본다
2. 사용자가 `/sdd approve claim-memo-fit`를 입력한다

## TASK-1: 앱 틀 — 메모 칸이 있을 때 넓히기
- REQ: REQ-4801
- AC: AC-4801.2, AC-4801.3
- Files: src/components/shell/AppShell.tsx, src/components/shell/TabBar.tsx, src/components/shell/shell.test.tsx
- Tests: src/components/shell/shell.test.tsx
- TDD: required — 뿌리 `group/app`(이름 없는 `group` 없음), `max-w-7xl` 감싸개 넷에 `lg:group-has-[[data-wide-page]]/app:max-w-none`
- 차례: Phase 1

## TASK-2: 메모 칸 — 넓힘 표시·목록 272px·표시 왼쪽·상세 칸 세로 flex
- REQ: REQ-4801, REQ-4802, REQ-4803, REQ-4806
- AC: AC-4801.1, AC-4802.1~AC-4802.3, AC-4803.7, AC-4806.1
- Files: src/components/claim/memo/MemoPanel.tsx, src/components/claim/memo/MemoPanel.test.tsx, src/components/claim/rows/MemoList.tsx, src/components/claim/rows/MemoList.test.tsx
- Tests: src/components/claim/memo/MemoPanel.test.tsx, src/components/claim/rows/MemoList.test.tsx
- TDD: required — `data-wide-page`, `SPLIT` 272px(AC-3101.1 시험의 360px 기대값은 AC-4802.1로 바꿈), 목록 줄 class, 보기 단추 `lg:px-2`, 상세 칸 `lg:flex lg:flex-col`
- 차례: Phase 2 (TASK-1 뒤)

## TASK-3: 오른쪽 상세 — 머리 한 줄·세 칸·안내 글 없앰·처방명 자르기·짧은 이름 한 번
- REQ: REQ-4803, REQ-4804, REQ-4805, REQ-4806
- AC: AC-4803.1~AC-4803.6, AC-4804.1, AC-4804.2, AC-4805.1, AC-4806.1, AC-4806.2
- Files: src/components/claim/rows/MemoDetail.tsx, src/components/claim/rows/MemoDetail.test.tsx, src/components/claim/rows/BitMemoCard.tsx, src/components/claim/rows/BitMemoCard.test.tsx, src/components/claim/memo/MemoPanel.test.tsx
- Tests: src/components/claim/rows/MemoDetail.test.tsx, src/components/claim/rows/BitMemoCard.test.tsx, src/components/claim/memo/MemoPanel.test.tsx
- TDD: required — design.md 3절 그대로. `ready` 글을 기대하던 시험(MemoDetail AC-3103.7, MemoPanel 상태 줄 셋)은 AC-4804.1로 바꾼다(상태 줄 없음). 표 묶음 class 기대값(AC-3105)은 lg 미만 class가 그대로라 유지하고 lg class를 더 본다
- 차례: Phase 3 (TASK-2 뒤)

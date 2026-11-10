# 작업 분할: 휴진 안내문 아래 병원 로고 (forms-logo)

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
>
> **시작 조건**: 이 명세와 시안(`docs/mockups/forms/logo.html`, 로고 `docs/mockups/forms/logo.png`, 사용자 선택 ①)이 함께 승인된 뒤.
> **할 순서**: TASK-1·TASK-2 → TASK-3 → TASK-4. 작아서 한 사람이 차례로 한다. 끝에 전체 검사(`npm test`·`npm run lint`·`npm run build`)와 화면 확인(테마 몇 개 미리보기·인쇄·PNG에 로고) 한 번.

## TASK-1: 로고 파일 옮기기
- AC: AC-3601.1, AC-3601.2
- REQ: REQ-3601
- Files: public/poster/logo.png, src/lib/forms/assets.test.ts
- Tests: src/lib/forms/assets.test.ts
- TDD: required

## TASK-2: 로고 자리 상수
- AC: AC-3602.2
- REQ: REQ-3602
- Files: src/lib/forms/layout.ts, src/lib/forms/layout.test.ts
- Tests: src/lib/forms/layout.test.ts
- TDD: required

## TASK-3: 안내문 SVG에 로고
- AC: AC-3602.1, AC-3602.3, AC-3603.3
- REQ: REQ-3602, REQ-3603
- Files: src/components/forms/Poster.tsx, src/components/forms/Poster.test.tsx, src/components/forms/FormsScreen.test.tsx
- Tests: src/components/forms/Poster.test.tsx, src/components/forms/FormsScreen.test.tsx
- TDD: required

## TASK-4: 그림 파일(PNG)에 로고
- AC: AC-3603.1, AC-3603.2
- REQ: REQ-3603
- Files: src/lib/forms/png.ts, src/lib/forms/png.test.ts
- Tests: src/lib/forms/png.test.ts
- TDD: required

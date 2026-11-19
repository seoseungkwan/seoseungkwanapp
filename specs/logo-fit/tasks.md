# 작업 분할: 서식 로고 흰 배경 지우기·여백 자르기·세로 로고 크게

> 형식: `## TASK-n: 제목` 아래에 `- Phase:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`.
> 같은 Phase의 TASK끼리 파일이 겹치지 않는다. Phase 0(TASK-1 시안)이 사용자 승인 줄을 얻은 뒤 Phase 1(TASK-2·3), 합친 뒤 Phase 2(TASK-4). 검토는 마지막 한 번.
> 기준 갈래 `feat-logo-fit`(운영 `d12087b2`에서). 화면(그림) 코드(TASK-3·4)는 `docs/mockups/logo-fit/notes.md`에 사용자 승인 줄이 생긴 뒤에만 시작한다.

## TASK-1: 시안 — 로고 자리 지금/바뀐 뒤
- Phase: 0
- AC: AC-6701.1, AC-6701.5, AC-6703.1, AC-6703.2, AC-6703.4
- REQ: REQ-6701, REQ-6703
- Files: docs/mockups/logo-fit/index.html, docs/mockups/logo-fit/notes.md
- Tests: 없음
- TDD: exempt — 시안 문서(design.md 7절). 페이지 안 JS가 2·4절 규칙을 그대로 돌려 휴진 안내(AI 배경·테마)·환자 안내문·가로형 투명 로고를 지금/바뀐 뒤로 그린다. 사용자에게 사진(1440·390)과 html을 보내고, 승인되면 notes.md에 '승인: 날짜, 사용자 말'.

## TASK-2: 순수 함수 — 흰 배경 지우기·여백 자르기
- Phase: 1
- AC: AC-6701.1, AC-6701.2, AC-6701.3, AC-6701.5, AC-6702.1
- REQ: REQ-6701, REQ-6702
- Files: src/lib/forms/logoFit.ts, src/lib/forms/logoFit.test.ts
- Tests: src/lib/forms/logoFit.test.ts
- TDD: required — design.md 2절. 손으로 만든 작은 RGBA 배열(예: 6×5 흰 둘레 + 가운데 검은 점 + 검은 테두리 안 흰 칸, 밝은 회색 #F5F5F5 둘레, 투명 둘레, 색 둘레, 둘레 89%/90% 경계, 오른쪽 1·2·3점 검은 세로줄 + 흰 배경(떼고 지움), 4점 두께 줄(안 뗌), 색 배경 바깥 줄(안 뗌), 위·왼쪽 동시 선(차례·길이), 남는 폭 3 미만(안 뗌), 1×1, 모두 흰 그림)로 지운 점·남은 점·반투명 값(식 그대로)·자른 크기·입력 배열이 안 바뀜·null을 본다.

## TASK-3: 로고 자리 크게 그리기(휴진 안내·환자 안내문)
- Phase: 1
- AC: AC-6703.1, AC-6703.2, AC-6703.3, AC-6703.4, AC-6703.5
- REQ: REQ-6703
- Files: src/lib/forms/layout.ts, src/lib/forms/layout.test.ts, src/lib/forms/guideLayout.ts, src/lib/forms/guideLayout.test.ts, src/components/forms/Poster.tsx, src/components/forms/Poster.test.tsx, src/components/forms/PosterBackground.test.tsx, src/components/forms/GuidePoster.tsx, src/components/forms/GuidePoster.test.tsx, src/components/forms/GuideWorkspace.test.tsx, src/lib/forms/guideDrawing.test.ts
- Tests: src/lib/forms/layout.test.ts, src/lib/forms/guideLayout.test.ts, src/components/forms/Poster.test.tsx, src/components/forms/PosterBackground.test.tsx, src/components/forms/GuidePoster.test.tsx
- TDD: required — design.md 4·5절. `logoRect`(가로형 1033×175 → 227,1011.2 · 340×57.6, 세로형 1080×501 → 휴진 안내 폭·높이·가운데, 정사각 → 높이에 묶임, 소수 첫째 자리), 크기 있는/없는 그림·글자·옛 길의 image·text 속성, AI 배경에 로고 뒤 흰 빛 타원이 없음(글자 뒤 흰 판은 그대로), 환자 안내문 자리. 옛 시험(크기 없는 값)은 그대로 통과해야 한다 — 단, 흰 빛 타원을 단언하던 `PosterBackground.test.tsx`의 AC-4603.2 시험 세 곳(design.md 5절)은 타원 없는 형으로 고친다. GuideWorkspace·guideDrawing 시험은 바뀐 형 때문에 깨질 때만 고친다.

## TASK-4: 서식 화면이 로고를 준비해 넘기기
- Phase: 2
- AC: AC-6701.4, AC-6702.2
- REQ: REQ-6701, REQ-6702
- Files: src/lib/forms/png.ts, src/lib/forms/png.test.ts, src/components/forms/FormsScreen.tsx, src/components/forms/FormsScreen.test.tsx, src/components/forms/GuideWorkspace.test.tsx
- Tests: src/lib/forms/png.test.ts, src/components/forms/FormsScreen.test.tsx, src/components/forms/GuideWorkspace.test.tsx
- TDD: required — design.md 3·6절. `readLogoBitmap`(PNG data:만, 긴 변 1200 안, 실패 null), `bitmapToPngUrl`(실패 null)은 가짜 Image·canvas로. FormsScreen은 `readLogoBitmap`·`bitmapToPngUrl`·`readLogoPixels`를 흉내 내어: 준비 성공 → 휴진 안내·환자 안내문 로고 image가 준비 주소와 `logoRect` 자리, 로고 색은 준비 주소로 읽음 / 표본은 읽히는데 큰 그림 읽기 실패·남는 점 없음·PNG 실패 → 원래 주소를 원래 상자에(AC-6702.2) / 표본도 실패 → 이름 글자(AC-6604.2 그대로) / 저장·서버 호출 없음(supabase 저장 함수 안 불림, AC-6701.4). FormsScreen을 통째로 그리는 GuideWorkspace.test도 새 함수(`readLogoBitmap`·`bitmapToPngUrl`)를 흉내 내어 jsdom에서 로고가 '읽는 중'에 머물지 않게 한다.

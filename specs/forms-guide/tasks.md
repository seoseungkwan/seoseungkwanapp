# 작업 분할: 서식 탭 — 환자 안내문 (forms-guide)

> 형식: `## TASK-n: 제목` 아래에 `- Phase:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
>
> **시작 조건**: 이 명세와 시안(`docs/mockups/forms-guide/index.html` 안내문 6장·그림 16개·서식 화면)이 함께 승인된 뒤.
> **할 순서**: Phase 1 → 6. 같은 Phase 안은 일꾼 둘까지 병렬(수정 파일이 겹치지 않는다). Phase 3은 일꾼 A가 TASK-5 → TASK-13 → TASK-6, 일꾼 B가 TASK-7.
> **AI 그림 추가(2026-11-15 첫 승인 뒤 사용자 결정)**: TASK-12·13·14를 더했다. TASK-1·2는 그 전에 끝났고, TASK-12·14가 그 파일을 이어 고친다(design.md 13절)
>
> | Phase | TASK | 하는 일 |
> |---|---|---|
> | 1 밑바탕 | TASK-1 | 타입·배치(글자 폭·자리·넘침 까닭) |
> | | TASK-2 | 저장 표(migration)와 RLS 시험 |
> | | TASK-12 | AI 그림 타입·도형 검사·그림 AI 질문과 답 검사(순수) |
> | | TASK-14 | 저장 표 크기 한도 16,000바이트 |
> | 2 규칙 | TASK-3 | 칸 검사·저장 값 검사·제목·파일 이름 |
> | | TASK-4 | AI 질문·답 검사·숫자 검사(순수) |
> | 3 조각 | TASK-5 | AI 서버 경로 |
> | | TASK-13 | AI 그림 서버 경로 |
> | | TASK-6 | 브라우저 저장 |
> | | TASK-7 | 안내문 SVG·그림 16개·그림 파일 |
> | 4 상태·문서 | TASK-8 | 화면 상태(reducer) |
> | | TASK-9 | 문서(ADR-028 덧붙임 등)와 문서 시험 |
> | 5 화면 | TASK-10 | 도구 단추·환자 안내문 화면 |
> | 6 마무리 | TASK-11 | 화면 확인·전체 검사 |
>
> - **Phase 끝(메인 세션)**: 그 Phase에서 고친 시험 파일과 design.md 13절 "고치지 않은 채 통과" 파일을 `npx vitest run <파일들>`로 돌린다. 전체 검사는 TASK-11에서 한 번
> - **사용자 단계(사이트에 올리기 전)**: `20261115010000_form_guides.sql`을 운영 Supabase SQL Editor에 붙여 넣기(사용자가 직접). Claude는 실제 Supabase에 붙지 않는다
> - 승인된 시험의 기대를 바꾸는 곳은 design.md 13절 "바꾸는 기존 기대"뿐이다. 그 밖이 바뀌어야 하면 멈추고 보고한다

## TASK-1: 타입·배치
- Phase: 1
- AC: AC-4503.1, AC-4503.2, AC-4503.3, AC-4503.4, AC-4503.5, AC-4503.6, AC-4503.7
- REQ: REQ-4503
- Files: src/types/formGuide.ts, src/lib/forms/guideLayout.ts, src/lib/forms/guideLayout.test.ts
- Tests: src/lib/forms/guideLayout.test.ts
- TDD: required — design.md 2·4절. 시안 `layout()`·`emOf()`의 값과 같아야 한다. 시험: 예시 6장(design.md 10절) 까닭 없음·두 열/한 열/번호/윗줄 작게, 4번 + 줄 둘 → `band`, 9자 큰 문구가 72px로도 안 들면 `big1`, 그림 있을 때 상자 최대 폭 499, 모든 사각형이 794×1123 안·상자와 그림 안 겹침·띠 글 666~938, 'MRI'·'43,850원'의 어림 폭이 표 값과 같음

## TASK-2: 저장 표와 권한
- Phase: 1
- AC: AC-4508.1, AC-4508.2, AC-4508.3
- REQ: REQ-4508
- Files: supabase/migrations/20261115010000_form_guides.sql, supabase/formGuides.rls.test.ts
- Tests: supabase/formGuides.rls.test.ts
- TDD: required — design.md 7절. `formNotices.rls.test.ts`와 같은 PGlite 흉내. 시험: anon 아무것도 못 함, 승인 안 된 병원 못 함, 내 병원 줄만 읽기·넣기·고치기·지우기, hospital_id·created_at·updated_at 칸 넣기·고치기 거부, 다른 병원 줄 안 보임·안 고쳐짐, 제약(배열·글자·4,000바이트 넘음 거부), 고치면 updated_at이 바뀜

## TASK-3: 칸 검사
- Phase: 2
- AC: AC-4502.1, AC-4502.2, AC-4502.3, AC-4502.4, AC-4502.5, AC-4502.6
- REQ: REQ-4502
- Files: src/lib/forms/guide.ts, src/lib/forms/guide.test.ts
- Tests: src/lib/forms/guide.test.ts
- TDD: required — design.md 3절. 시험: 칸마다 빈 글·한도·한도+1, 윗줄만, 강조가 줄에 없음, 개인정보 모양(010-1234-5678·메일), 줄 0개·5개·빈 줄, `checkGuideValue`의 열쇠 하나 더/덜·잘못된 그림·mark·배치 넘침 → null, `custom`이고 그림 있음 → 통과·`custom`인데 drawing null이나 잘못된 도형 → null·16개 그림인데 drawing 있음 → null, `savableGuide`가 custom 아닐 때 drawing을 비움, 앞뒤 공백 뗌, 파일 이름에서 `/:*?` 뺌

## TASK-4: AI 질문·답 검사
- Phase: 2
- AC: AC-4505.3, AC-4505.4, AC-4505.5
- REQ: REQ-4505
- Files: src/lib/forms/guideAi.ts, src/lib/forms/guideAi.test.ts
- Tests: src/lib/forms/guideAi.test.ts
- TDD: required — design.md 8절. 시험: 시스템 글에 규칙 글귀(숫자·병원 정보·memo 지시)와 그림 이름 16개(`types/formGuide.ts`의 `PICTURES`), 스키마 열쇠 12개·enum(`custom` 없음), 답의 guide는 열쇠 13개이고 drawing null, 답 JSON 아님/열쇠 더함/61자 글 → 실패, 줄 5개 → 앞 4개·truncated, 강조가 줄에 없으면 '', 'none' → null, 숫자: '43,850'↔'43850' 통과, '09'↔'9' 통과, 메모에 없는 '15' → 실패, 전각 '２' → '2'

## TASK-5: AI 서버 경로
- Phase: 3
- AC: AC-4505.1, AC-4505.2, AC-4505.3, AC-4505.6
- REQ: REQ-4505
- Files: src/app/api/ai/forms/guide/route.ts, src/app/api/ai/forms/guide/route.test.ts
- Tests: src/app/api/ai/forms/guide/route.test.ts
- TDD: required — `app/api/ai/forms/route.test.ts`와 같은 흉내(readMe·callClaude·addUsage). 시험: 400·401·403(몸통 없음), 개인정보 422·Claude 안 부름, 부를 때 model·effort low·schema·system·user(`<memo>`), 숫자 어긋남 502 E-AI-FAILED, 성공 200 `{ guide, truncated }`, 사용량 더함(실패해도 답 그대로), BUSY 503·LIMIT 402, 로그는 `[api/ai/forms/guide]`와 번호뿐

## TASK-6: 브라우저 저장
- Phase: 3
- AC: AC-4507.1, AC-4507.2, AC-4507.5
- REQ: REQ-4507
- Files: src/lib/storage/formGuides.ts, src/lib/storage/formGuides.test.ts
- Tests: src/lib/storage/formGuides.test.ts
- TDD: required — design.md 7절. `formNotices` 저장 시험과 같은 흉내. 시험: 목록 차례·100개·못 넘는 줄 뺌·오류 'failed', 넣기·고치기 몸통은 `{ content }` 하나(열쇠 13개, 앞뒤 공백 뗌, 메모 없음, custom이 아니면 drawing null·custom이면 그림 그대로), 검사를 못 넘으면 보내지 않음, 지우기 true/false

## TASK-7: 안내문 SVG·그림 16개·그림 파일
- Phase: 3
- AC: AC-4504.1, AC-4504.2, AC-4504.3, AC-4504.4, AC-4504.5, AC-4504.6, AC-4509.2, AC-4509.3, AC-4510.2
- REQ: REQ-4504, REQ-4509, REQ-4510
- Files: src/components/forms/guideColors.ts, src/components/forms/guidePictures.tsx, src/components/forms/GuidePoster.tsx, src/components/forms/GuidePoster.test.tsx, src/lib/forms/png.ts, src/lib/forms/png.test.ts, src/app/theme.test.ts
- Tests: src/components/forms/GuidePoster.test.tsx, src/lib/forms/png.test.ts, src/app/theme.test.ts
- TDD: required — design.md 5·6절, 그림은 시안 `ICONS`를 그대로 옮긴다. 시험: 예시 1·5·6을 그려 요소·자리·색 다섯 값만·노란 글자는 진회색 위만·굵기 900/700·강조 tspan·로고 image 하나·aria-label, 그림 16개 모두 받침 원·`<text>`/`<image>` 없음·null이면 없음, AI 그림(design.md 5절): kind마다 요소·속성 이름과 값·색 이름 → 로고색·clipPath 하나·잘못된 도형이면 받침만·`custom`인데 drawing null이면 그림 없음, 테마 없는 `svgForImage`가 글꼴·로고를 data:로 바꾸고 `/poster/`가 안 남음, `downloadGuidePng`가 글꼴 둘·로고만 읽고 실패하면 false, theme.test 허용 파일에 guideColors.ts(design.md 13절)

## TASK-8: 화면 상태
- Phase: 4
- AC: AC-4501.3, AC-4506.2, AC-4506.3, AC-4506.4, AC-4507.1, AC-4507.3, AC-4507.4, AC-4513.2, AC-4513.3
- REQ: REQ-4501, REQ-4506, REQ-4507, REQ-4513
- Files: src/components/forms/guideState.ts, src/components/forms/guideState.test.ts
- Tests: src/components/forms/guideState.test.ts
- TDD: required — design.md 9절, `formsState.ts`와 같은 모양. 시험: 동작마다 상태, 정리 답이 칸 12개를 바꿈(그림이 custom이면 그림·drawing 그대로)·truncated, drawDone이 custom으로 바꿈·다른 그림을 골라도 drawing 남음·readyGuide는 savableGuide 값·new는 drawing 비움, drawingAnswerOf(200 바른 그림·잘못된 그림 E-AI-FAILED·422/503/402 번호), 줄 더하기 4개까지·빼기 1개 남김, 연 뒤 바뀌면 dirty·같은 값이면 아님, 저장 뒤 목록 맨 위, 지운 뒤 새 안내문, 서버 답 읽기(모르는 답은 E-AI-FAILED, 한도 넘는 칸도 받음), 새 빈 안내문은 필수 칸 까닭을 숨김

## TASK-9: 문서
- Phase: 4
- AC: AC-4510.1, AC-4510.3
- REQ: REQ-4510
- Files: docs/ADR.md, CLAUDE.md, docs/ARCHITECTURE.md, src/lib/forms/guideDocs.test.ts
- Tests: src/lib/forms/guideDocs.test.ts
- TDD: required — 시험(ADR-028 안 환자 안내문 덧붙임 글귀: 2026-11-15·로고색·그림 16개·`app/api/ai/forms/guide`·숫자·AI 그림은 도형·색 이름·숫자로만·`app/api/ai/forms/guide/picture`, CLAUDE.md ADR-028 줄이 하나이고 `guideColors.ts`, ARCHITECTURE에 `api/ai/forms/guide`·`api/ai/forms/guide/picture`·`form_guides`)을 먼저 쓰고 문서를 고친다. `src/lib/forms/rules.test.ts`(AC-3511.1 등)는 고치지 않고 통과해야 한다

## TASK-10: 도구 단추·환자 안내문 화면
- Phase: 5
- AC: AC-4501.1, AC-4501.2, AC-4501.3, AC-4501.4, AC-4502.3, AC-4506.1, AC-4506.2, AC-4506.3, AC-4506.4, AC-4507.1, AC-4507.2, AC-4507.3, AC-4507.4, AC-4509.1, AC-4513.1, AC-4513.2, AC-4513.3
- REQ: REQ-4501, REQ-4502, REQ-4506, REQ-4507, REQ-4509, REQ-4513
- Files: src/components/forms/GuideEditor.tsx, src/components/forms/GuideWorkspace.tsx, src/components/forms/GuideWorkspace.test.tsx, src/components/forms/NoticeList.tsx, src/components/forms/PreviewPanel.tsx, src/components/forms/FormsScreen.tsx, src/components/forms/FormsScreen.test.tsx
- Tests: src/components/forms/GuideWorkspace.test.tsx, src/components/forms/FormsScreen.test.tsx
- TDD: required — design.md 9절, 시안 `?s=screen`의 칸·글자 그대로. 시험: 도구 두 단추·누르면 바뀜·목록은 처음 누를 때 한 번 읽음·오가도 값 유지·인쇄 사본 하나, 정리하기(fetch 흉내: 성공·개인정보 안 보냄·기다림·오류), 칸 까닭 보임·뽑기 막힘, 저장·목록·확인·지우기·실패 문구, 그림 파일 이름, AI 그림(빈 글이면 막힘·fetch 흉내 성공이면 고르기에 'AI로 그린 그림: …'·미리보기에 그림·개인정보 안 보냄·'그리는 중…'·오류 문구·다른 그림 골랐다 다시 고르기). FormsScreen.test는 AC-3501.3 기대 한 곳만 바꾸고(design.md 13절) 나머지는 그대로 통과

## TASK-11: 화면 확인·전체 검사
- Phase: 6
- AC: AC-4503.6, AC-4504.1, AC-4504.4, AC-4504.6, AC-4509.1, AC-4509.2
- REQ: REQ-4503, REQ-4504, REQ-4509
- Files: src/components/forms/GuideEditor.tsx, src/components/forms/GuideWorkspace.tsx, src/components/forms/GuidePoster.tsx, src/components/forms/guidePictures.tsx
- Tests: src/components/forms/GuidePoster.test.tsx
- TDD: exempt — 화면 확인(저장소 밖 하네스에서 진짜 부품을 합성 값으로: 1440·390 폭, 예시 6장 미리보기를 시안과 나란히, 그림 16개, AI 그림 예(시안 `go=draw`의 도형), 한도 꽉 찬 글·띠 넘침, 인쇄 미리보기, 내려받은 PNG 열어 보기)과 전체 검사(`npm test`·`npm run lint`·`npm run build`). 고칠 것이 나오면 Files의 화면 파일만 고친다. 실제 AI 부르기와 E2E는 사용자가 SQL을 붙이고 `.env.local`이 있을 때만 하고, 못 하면 그렇다고 보고한다

## TASK-12: AI 그림 타입·도형 검사·그림 AI 질문과 답 검사
- Phase: 1
- AC: AC-4511.1, AC-4511.2, AC-4511.3, AC-4511.4
- REQ: REQ-4511
- Files: src/types/formGuide.ts, src/lib/forms/guideDrawing.ts, src/lib/forms/guideDrawing.test.ts, src/lib/forms/guideLayout.test.ts
- Tests: src/lib/forms/guideDrawing.test.ts, src/lib/forms/guideLayout.test.ts
- TDD: required — design.md 2절(타입·`PICTURES`·`DRAW_*`·`GuideContent.drawing`·`picture`에 `'custom'`)·8-1절. TASK-1이 끝난 뒤 그 타입을 넓힌다. guideLayout.test.ts는 예시 값에 `drawing: null`을 더하고 `custom` 상자 폭 시험 하나만 더한다(design.md 13절, 기대는 그대로). 시험: kind마다 nums 개수 맞음/모자람/넘침·170 넘는 수·NaN·음수 → null, 소수 한 자리 반올림, path `d`(M 시작·허용 글자·301자·`<`·`url(`·`javascript` → null, path 아닌데 d 있음 → null), 색 이름 밖('red'·'#fff') → null, width 13 → null, 열쇠 하나 더 → null, subject 0자·21자·줄바꿈·전화 모양 → null, 도형 0개·41개 → null, 8,000바이트 넘음 → null, 답 검사(JSON 아님·열쇠 다름 → 실패, 못 넘는 도형만 버림, 41개 → 앞 40개, 남는 게 없음 → 실패), 시스템 글 글귀(170·85·70·도형 다섯·색 네 가지·글자 금지·memo 지시·40), 스키마 모양(enum·required·additionalProperties false)

## TASK-13: AI 그림 서버 경로
- Phase: 3
- AC: AC-4512.1, AC-4512.2, AC-4512.3
- REQ: REQ-4512
- Files: src/app/api/ai/forms/guide/picture/route.ts, src/app/api/ai/forms/guide/picture/route.test.ts
- Tests: src/app/api/ai/forms/guide/picture/route.test.ts
- TDD: required — design.md 8-1절, TASK-5 경로 시험과 같은 흉내. 시험: 400(몸통 없음·열쇠 더함·빈 글·21자)·401·403(몸통 없음), 제어 문자·개인정보 422·Claude 안 부름, 부를 때 model·effort medium·DRAWING_SCHEMA·drawingSystem·user(`<memo>`), 답 검사 실패 502 E-AI-FAILED, 성공 200 `{ drawing }`(subject는 앞뒤 공백 뗀 글), 사용량 더함(실패해도 답 그대로), BUSY 503·LIMIT 402, 로그는 `[api/ai/forms/guide/picture]`와 번호뿐

## TASK-14: 저장 표 크기 한도
- Phase: 1
- AC: AC-4508.3
- REQ: REQ-4508
- Files: supabase/migrations/20261115010000_form_guides.sql, supabase/formGuides.rls.test.ts
- Tests: supabase/formGuides.rls.test.ts
- TDD: required — design.md 7절. TASK-2가 만든 migration의 4,000을 16,000으로 바꾼다(운영 DB에 붙이기 전이라 같은 파일). 시험의 크기 기대를 16,000 들어감·16,001 거부로 바꾸고 나머지는 그대로


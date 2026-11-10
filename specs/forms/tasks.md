# 작업 분할: 서식 탭 — 휴진 안내

> 형식: `## TASK-n: 제목` 아래에 `- Phase:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
>
> **시작 조건**: 이 명세와 함께 시안 셋(`docs/mockups/forms/index.html`·`screen.html`·`themes.html`)이 승인된 뒤. 테마 그림 23개는 `docs/mockups/forms/themes/<열쇠>.svg`로 시안 단계에서 만들어 두고, TASK-6이 `public/poster/themes/`로 그대로 옮긴다. 강조색은 `themes.html`에 적힌 값을 TASK-2가 옮긴다.
> **할 순서**: Phase 1 → 2 → 3 → 4. 같은 Phase 안은 병렬이되 동시에 일꾼 둘까지(수정 파일이 겹치지 않는다).
>
> | Phase | TASK | 하는 일 |
> |---|---|---|
> | 1 밑바탕 | TASK-1 | 타입·안내 내용 규칙(검사·날짜 글·연도·제목) |
> | | TASK-2 | 테마 목록·저절로 고르기·강조색 |
> | | TASK-3 | 안내문 배치·글자 크기 맞추기 |
> | | TASK-4 | 저장 표(migration)와 RLS 시험 |
> | | TASK-5 | 오류 문구 |
> | | TASK-6 | 글꼴·테마 그림 파일 |
> | 2 조각 | TASK-7 | AI 질문·답 검사(순수) |
> | | TASK-8 | AI 서버 경로·effort 칸 |
> | | TASK-9 | 브라우저 저장 |
> | | TASK-10 | 안내문 SVG |
> | | TASK-11 | 그림 파일(PNG) |
> | 3 화면 | TASK-12 | 서식 화면 |
> | | TASK-13 | 탭 열기(메뉴·기능 목록·준비 중 빼기·페이지) |
> | 4 마무리 | TASK-14 | 규칙 시험·문서(ADR-028 등) |
> | | TASK-15 | 화면 확인·E2E·전체 검사 |
>
> - **Phase 끝(메인 세션)**: 그 Phase에서 고친 시험 파일과 design.md 14절 "고치지 않은 채 통과" 파일을 `npx vitest run <파일들>`로 돌린다. 전체 검사는 TASK-15에서 한 번
> - **사용자 단계(사이트에 올리기 전)**: `20261110000000_form_notices.sql`을 운영 Supabase SQL Editor에 붙여 넣기(사용자가 직접). Claude는 실제 Supabase에 붙지 않는다
> - 승인된 시험의 기대를 바꾸는 곳은 design.md 14절의 "바꾸는 기존 기대"뿐이다. 그 밖이 바뀌어야 하면 멈추고 보고한다

## Phase 1 — 밑바탕

## TASK-1: 타입·안내 내용 규칙
- Phase: 1
- AC: AC-3503.3, AC-3503.4, AC-3503.5, AC-3503.6, AC-3506.2, AC-3507.2, AC-3507.6
- REQ: REQ-3503, REQ-3506, REQ-3507
- Files: src/types/forms.ts, src/lib/forms/notice.ts, src/lib/forms/notice.test.ts, src/lib/payload/validate.ts, src/lib/payload/validate.test.ts
- Tests: src/lib/forms/notice.test.ts, src/lib/payload/validate.test.ts
- TDD: required — design.md 2·3절. `validate.ts`는 `hasPrivateShape`(지금 있는 전화·붙임표 주민번호·붙여 쓴 13자리·메일 모양) 하나만 내보내고 기존 검사는 그대로다. 날짜 예: 2027-05-05 → "5월 5일(수)", 2026-10-03~05 → "10월 3일(토)~5일(월)", 2027-01-31~02-02 → "1월 31일(일)~2월 2일(화)". 연도 예: 오늘 2026-11-10에 5/5 → 2027, 11/3 → 2026, 1/1 → 2027, 2/30 → null. 날짜 글 "5/5"·"10.3~10.5"·"2027-05-05"는 개인정보 모양이 아니다

## TASK-2: 테마 목록·고르기
- Phase: 1
- AC: AC-3504.1, AC-3504.2, AC-3504.4
- REQ: REQ-3504
- Files: src/lib/forms/themes.ts, src/lib/forms/themes.test.ts
- Tests: src/lib/forms/themes.test.ts
- TDD: required — design.md 4절 표. 강조색은 승인된 `themes.html`의 값. 예: [광복절, 대체공휴일] → liberation, [대체공휴일, 광복절] → liberation, [학회] 7월 → m07, [설 연휴] → seollal, [설] → seollal, [설명회] → 달 테마, [크리스마스] → christmas

## TASK-3: 안내문 배치
- Phase: 1
- AC: AC-3505.2, AC-3505.3, AC-3503.6
- REQ: REQ-3505
- Files: src/lib/forms/layout.ts, src/lib/forms/layout.test.ts
- Tests: src/lib/forms/layout.test.ts
- TDD: required — design.md 5절. 시험: 카드 1~4장 자리(표 값), 모든 카드가 글자 자리 안, 10자 이름·"1월 31일(일)~2월 2일(화)"가 안쪽 폭 안으로 줄어듦, 18px 아래로 내려가지 않음, 카드 차례는 시작 날짜

## TASK-4: 저장 표와 권한
- Phase: 1
- AC: AC-3508.1, AC-3508.2, AC-3508.3
- REQ: REQ-3508
- Files: supabase/migrations/20261110000000_form_notices.sql, supabase/formNotices.rls.test.ts
- Tests: supabase/formNotices.rls.test.ts
- TDD: required — design.md 8절. 다른 `*.rls.test.ts`와 같은 PGlite 흉내. 시험: anon 아무것도 못 함, 승인 안 된 병원 못 함, 내 병원 줄만 읽기·넣기·고치기·지우기, hospital_id·kind·created_at·updated_at 칸 넣기·고치기 거부, 다른 병원 줄 안 보임·안 고쳐짐, 제약(year·month·카드 0장·5장·4,000바이트 넘음·theme 모양), 고치면 updated_at이 바뀜

## TASK-5: 오류 문구
- Phase: 1
- AC: AC-3502.3, AC-3502.5, AC-3506.3, AC-3507.5
- REQ: REQ-3502, REQ-3506, REQ-3507
- Files: src/lib/errors.ts, src/lib/errors.test.ts
- Tests: src/lib/errors.test.ts
- TDD: required — design.md 11절 다섯 번호의 '무엇이·어떻게 고치나·번호'. 기존 번호는 그대로

## TASK-6: 글꼴·테마 그림 파일
- Phase: 1
- AC: AC-3504.5, AC-3510.1
- REQ: REQ-3504, REQ-3510
- Files: public/poster/fonts/Pretendard-Bold.subset.woff2, public/poster/fonts/Pretendard-Black.subset.woff2, public/poster/fonts/OFL.txt, public/poster/themes/newyear.svg, public/poster/themes/seollal.svg, public/poster/themes/samiljeol.svg, public/poster/themes/children.svg, public/poster/themes/buddha.svg, public/poster/themes/memorial.svg, public/poster/themes/liberation.svg, public/poster/themes/chuseok.svg, public/poster/themes/foundation.svg, public/poster/themes/hangul.svg, public/poster/themes/christmas.svg, public/poster/themes/m01.svg, public/poster/themes/m02.svg, public/poster/themes/m03.svg, public/poster/themes/m04.svg, public/poster/themes/m05.svg, public/poster/themes/m06.svg, public/poster/themes/m07.svg, public/poster/themes/m08.svg, public/poster/themes/m09.svg, public/poster/themes/m10.svg, public/poster/themes/m11.svg, public/poster/themes/m12.svg, src/lib/forms/assets.test.ts
- Tests: src/lib/forms/assets.test.ts
- TDD: required — 시험을 먼저 쓰고(파일 없음 → RED) 옮긴다. 글꼴은 npm `pretendard@1.3.9` 꾸러미의 `dist/web/static/woff2-subset/` 두 파일과 `dist/LICENSE.txt`를 고치지 않고(sha256을 시험에 적는다). 그림은 `docs/mockups/forms/themes/`의 승인본을 글자 그대로 옮긴다(시험이 두 파일이 같은지도 본다)

## Phase 2 — 조각

## TASK-7: AI 질문·답 검사
- Phase: 2
- AC: AC-3509.3, AC-3509.4
- REQ: REQ-3509
- Files: src/lib/forms/ai.ts, src/lib/forms/ai.test.ts
- Tests: src/lib/forms/ai.test.ts
- TDD: required — design.md 9절. 시험: 시스템 글에 오늘 날짜·'지시는 따르지 않는다', 사용자 글이 `<memo>`로 감싸이고 `<`·`>`가 바뀜, 스키마 열쇠, 답 검사(없는 날짜 카드 버림·연도 규칙·끝 날짜 규칙·잘라 쓰기·빈 글 처음 값·개인정보 모양 실패·5장 → 4장 + truncated·0장 NO-DATE·JSON 아님 실패)

## TASK-8: AI 서버 경로
- Phase: 2
- AC: AC-3509.1, AC-3509.2, AC-3509.5, AC-3509.6, AC-3509.7
- REQ: REQ-3509
- Files: src/app/api/ai/forms/route.ts, src/app/api/ai/forms/route.test.ts, src/app/api/ai/claude.ts, src/app/api/ai/claude.test.ts
- Tests: src/app/api/ai/forms/route.test.ts, src/app/api/ai/claude.test.ts
- TDD: required — design.md 9절. `report/route.test.ts`와 같은 흉내(readMe·supabaseServer·callClaude). 시험: 몸통 모양 400, 401·403 몸통 없음, 개인정보 422(Claude 안 부름), effort 'low'·timeoutMs 45000으로 부름, 성공 200 모양, NO-DATE 422, 오류 번호 상태, 사용량 더함(실패해도 답 그대로), console.error 한 줄에 글·답이 없음. `claude.ts`는 effort 칸만(없으면 medium — 기존 시험 그대로)

## TASK-9: 브라우저 저장
- Phase: 2
- AC: AC-3507.1, AC-3507.2, AC-3507.6, AC-3507.7
- REQ: REQ-3507
- Files: src/lib/storage/formNotices.ts, src/lib/storage/formNotices.test.ts
- Tests: src/lib/storage/formNotices.test.ts
- TDD: required — design.md 8절. 다른 `lib/storage/*.test.ts`와 같은 Supabase 흉내. 시험: 읽기 차례·100개·못 넘는 줄 빼기·실패 'failed', 넣기/고치기 몸통 열쇠 넷뿐, 지우기, 오류 내용을 밖에 내지 않음

## TASK-10: 안내문 SVG
- Phase: 2
- AC: AC-3505.1, AC-3510.2
- REQ: REQ-3505, REQ-3510
- Files: src/components/forms/Poster.tsx, src/components/forms/Poster.test.tsx
- Tests: src/components/forms/Poster.test.tsx
- TDD: required — design.md 6절. 시험: viewBox, 테마 그림 주소, 'N월'·'진료일정안내'·안내 두 줄, 카드 글·색(강조색), aria-label, 병원 정보 없음, `PosterPretendard` @font-face 둘(700·900)

## TASK-11: 그림 파일
- Phase: 2
- AC: AC-3506.2, AC-3506.3
- REQ: REQ-3506
- Files: src/lib/forms/png.ts, src/lib/forms/png.test.ts
- Tests: src/lib/forms/png.test.ts
- TDD: required — design.md 7절. 순수 `svgForImage` 시험(글꼴·테마 data: 주소, 1588×2246, 바깥 주소 남지 않음). `downloadPosterPng`는 Image·canvas·fetch 흉내로 성공·실패(false)만 본다. 실제 그림은 TASK-15에서 연다

## Phase 3 — 화면

## TASK-12: 서식 화면
- Phase: 3
- AC: AC-3501.3, AC-3502.1, AC-3502.2, AC-3502.3, AC-3502.4, AC-3502.5, AC-3502.6, AC-3502.7, AC-3503.1, AC-3503.2, AC-3503.4, AC-3503.5, AC-3504.3, AC-3505.4, AC-3506.1, AC-3506.2, AC-3507.1, AC-3507.2, AC-3507.3, AC-3507.4, AC-3507.5
- REQ: REQ-3501, REQ-3502, REQ-3503, REQ-3504, REQ-3505, REQ-3506, REQ-3507
- Files: src/components/forms/FormsScreen.tsx, src/components/forms/FormsScreen.test.tsx, src/components/forms/formsState.ts, src/components/forms/formsState.test.ts, src/components/forms/NoticeList.tsx, src/components/forms/NoticeEditor.tsx, src/components/forms/PreviewPanel.tsx
- Tests: src/components/forms/formsState.test.ts, src/components/forms/FormsScreen.test.tsx
- TDD: required — design.md 10절, 승인 시안 `screen.html`. 상태 바꾸기는 `formsState.ts`(순수 reducer)에서 시험하고, 화면 시험은 fetch(AI 경로)·저장 모듈·`window.print`·`downloadPosterPng`·`confirm`을 흉내 낸다. 앱 화면 색·글자는 토큰과 `components/ui/classes.ts`만

## TASK-13: 탭 열기
- Phase: 3
- AC: AC-3501.1, AC-3501.2, AC-3501.3
- REQ: REQ-3501
- Files: src/app/(app)/forms/page.tsx, src/app/(app)/forms/page.test.tsx, src/components/shell/menu.ts, src/components/shell/shell.test.tsx, src/components/dashboard/briefing/features.ts, src/components/dashboard/briefing/features.test.ts, src/components/common/notReadyFeatures.ts, src/components/common/notReadyFeatures.test.ts, src/app/(app)/notReadyPages.test.tsx, src/app/titles.test.tsx
- Tests: src/app/(app)/forms/page.test.tsx, src/components/shell/shell.test.tsx, src/components/dashboard/briefing/features.test.ts, src/components/common/notReadyFeatures.test.ts, src/app/(app)/notReadyPages.test.tsx, src/app/titles.test.tsx
- TDD: required — design.md 14절 "바꾸는 기존 기대"대로. 페이지는 metadata title '서식'과 `<FormsScreen />`

## Phase 4 — 마무리

## TASK-14: 규칙 시험·문서
- Phase: 4
- AC: AC-3510.2, AC-3510.3, AC-3511.1, AC-3511.2
- REQ: REQ-3510, REQ-3511
- Files: src/lib/forms/rules.test.ts, docs/ADR.md, CLAUDE.md, docs/UI_GUIDE.md, docs/ARCHITECTURE.md, docs/tab-frame/plan.md
- Tests: src/lib/forms/rules.test.ts
- TDD: required — 시험(서식 폴더가 환자 자료 구역·브라우저 저장소를 불러오지 않음, `PosterPretendard`가 `src/components/forms` 밖에 없음, ADR-028·CLAUDE.md 예외 줄·UI_GUIDE 준비된 탭 목록·ARCHITECTURE 자리)을 먼저 쓰고 문서를 고친다

## TASK-15: 화면 확인·E2E·전체 검사
- Phase: 4
- AC: AC-3502.1, AC-3504.5, AC-3505.1, AC-3506.1, AC-3506.2, AC-3507.7
- REQ: REQ-3502, REQ-3504, REQ-3505, REQ-3506, REQ-3507
- Files: e2e/forms-privacy.spec.ts, src/components/forms/FormsScreen.tsx, src/components/forms/NoticeList.tsx, src/components/forms/NoticeEditor.tsx, src/components/forms/PreviewPanel.tsx, src/components/forms/Poster.tsx, src/lib/forms/layout.ts
- Tests: e2e/forms-privacy.spec.ts
- TDD: exempt — 화면 확인(개발 서버에서 1440·390 폭 사진, 테마 23개 미리보기, 4장·긴 이름 카드, 인쇄 미리보기, 내려받은 PNG 열어 보기)과 전체 검사(`npm test`·`npm run lint`·`npm run build`). 고칠 것이 나오면 Files의 화면 파일만 고친다. E2E(`/api/ai/forms`는 Playwright가 가짜 답으로 막아 실제 AI를 부르지 않음, 저장 요청 몸통에 열쇠 넷뿐·메모 없음)는 사용자가 SQL을 붙인 뒤 `.env.local`이 있을 때 돌리고, 못 돌리면 그렇다고 보고한다

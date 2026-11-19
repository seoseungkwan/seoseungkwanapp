# 작업 분할: 서식 글씨·로고 크기·색 조절

> 형식: `## TASK-n: 제목` 아래에 `- Phase:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`.
> 같은 Phase의 TASK끼리 파일이 겹치지 않는다. Phase 0(시안, 승인 줄 있음) → Phase 1(TASK-2·3) → 합친 뒤 Phase 2(TASK-4·5) → 합친 뒤 Phase 3(TASK-6). 검토는 마지막 한 번.
> 기준 갈래 `feat-form-style`(logo-fit을 다 합친 `feat-logo-fit`에서). 화면 코드는 `docs/mockups/form-style/notes.md` 승인 줄(2026-11-19)을 따른다.

## TASK-1: 시안 — 글씨·로고 칸과 미리보기
- Phase: 0
- AC: AC-6801.1, AC-6801.3, AC-6803.1
- REQ: REQ-6801, REQ-6803
- Files: docs/mockups/form-style/index.html, docs/mockups/form-style/notes.md
- Tests: 없음
- TDD: exempt — 시안 문서. 두 서식 탭, 밀대·색 칩(로고 색·기본 색 16·직접), [자동] = 로고 색 미리보기. 승인 줄은 notes.md(2026-11-19).

## TASK-2: SQL — 휴진 안내 글씨·로고 여섯 칸
- Phase: 1
- AC: AC-6806.1
- REQ: REQ-6806
- Files: supabase/migrations/20261119100000_form_notices_style.sql, supabase/formNoticesStyle.rls.test.ts
- Tests: supabase/formNoticesStyle.rls.test.ts
- TDD: required — design.md 7-1절. formNoticesAccent.rls.test.ts와 같은 PGlite 방법: 문장 글자 그대로, 두 번 실행, 맞는 값·null 저장, 범위 밖(75·135·83·55·155)·색 모양('red'·'#ABCDEF') 거절, anon 거절, 다른 칸 권한 그대로.

## TASK-3: 순수 값 — style·로고 색 칩·onWhite·자동 색·기본 색
- Phase: 1
- AC: AC-6802.1, AC-6802.2, AC-6803.1, AC-6803.2, AC-6803.3, AC-6805.3, AC-6806.3
- REQ: REQ-6802, REQ-6803, REQ-6805, REQ-6806
- Files: src/lib/forms/style.ts, src/lib/forms/style.test.ts, src/lib/forms/logoColors.ts, src/lib/forms/logoColors.test.ts, src/types/forms.ts, src/lib/forms/notice.ts, src/lib/forms/notice.test.ts, src/lib/forms/guide.ts, src/lib/forms/guide.test.ts, src/components/forms/noticeColors.ts, src/components/forms/noticeColors.test.ts, src/components/forms/colorChoices.ts, src/components/forms/colorChoices.test.ts, src/app/theme.test.ts
- Tests: src/lib/forms/style.test.ts, src/lib/forms/logoColors.test.ts, src/lib/forms/notice.test.ts, src/lib/forms/guide.test.ts, src/components/forms/noticeColors.test.ts, src/components/forms/colorChoices.test.ts
- TDD: required — design.md 2·3·4절. checkStyle(여섯 열쇠 정확히, 경계 80·130·60·150·79·131·82, 색 대문자 거절), isDefaultStyle, scaled 반올림. logoSwatches(손으로 만든 점: 옅은 점·투명 점 뺌, 묶음 차례·같은 수 키 차례, 거리 60 미만 건너뜀, 4개 한도, 빈 목록). onWhite(이미 대비 3 이상 그대로, 노랑 → 어둡게, 흰색 → 3 이상 회색, 같은 색상). checkNotice·checkGuideValue의 style 열쇠(없음·처음대로는 열쇠 없이·틀린 값 null·열쇠 하나 더/덜 null), 옛 값 그대로 통과. noticeAutoColors(로고 있음/없음·배경 있음/없음). logoTintable(투명 점 10% 경계·모두 불투명·모두 투명). BASIC_COLORS 16개 이름·값·차례. theme.test.ts HEX_FILES(와 AC-4510.2 목록)에 noticeColors.ts·colorChoices.ts를 더한다.

## TASK-4: 크기·색대로 그리기
- Phase: 2
- AC: AC-6803.1, AC-6803.2, AC-6803.4, AC-6804.1, AC-6804.2, AC-6804.3, AC-6804.4, AC-6804.5, AC-6804.6, AC-6804.7, AC-6805.1, AC-6805.2, AC-6805.3
- REQ: REQ-6803, REQ-6804, REQ-6805
- Files: src/lib/forms/layout.ts, src/lib/forms/layout.test.ts, src/lib/forms/guideLayout.ts, src/lib/forms/guideLayout.test.ts, src/lib/forms/guide.ts, src/lib/forms/guide.test.ts, src/components/forms/Poster.tsx, src/components/forms/Poster.test.tsx, src/components/forms/PosterAccent.test.tsx, src/components/forms/PosterBackground.test.tsx, src/components/forms/GuidePoster.tsx, src/components/forms/GuidePoster.test.tsx, src/lib/forms/guideDrawing.test.ts
- Tests: src/lib/forms/layout.test.ts, src/lib/forms/guideLayout.test.ts, src/lib/forms/guide.test.ts, src/components/forms/Poster.test.tsx, src/components/forms/PosterAccent.test.tsx, src/components/forms/GuidePoster.test.tsx
- TDD: required — design.md 5·6절. 제목·본문 크기 식(80·100·130%, 카드 1~4장 세로 한도, 폭 맞추기), 안내문 큰 문구(보통·윗줄 작게, 한도 120·88·165), 줄 글(체크·번호, 줄 높이 한도), scaleLogoRect(60·100·150%, 최대 600×130·692×140, 크기 모름), logoTextWidth·logoTextFit(돌려주는 모양 그대로, 100%면 지금 크기·squeeze 그대로, 150%·60%, 넘치면 W로 눌러 그림), 제목·본문·로고 색(필터 이름이 둘 그려도 다름, tintable 아닌 그림은 칠하지 않음, em·표시 색 그대로), guideProblems·checkGuideValue가 style 든 배치로 줄 넘침을 봄(AC-6804.7), 자동 제목·강조 색이 logoColors를 따름, 처음대로면 지금 시험 그대로. PosterBackground·guideDrawing 시험은 바뀐 형 때문에 깨질 때만 고친다.

## TASK-5: 저장과 서식 상태
- Phase: 2
- AC: AC-6806.2, AC-6806.3, AC-6806.4, AC-6806.5
- REQ: REQ-6806
- Files: src/lib/storage/formNotices.ts, src/lib/storage/formNotices.test.ts, src/lib/storage/formGuides.ts, src/lib/storage/formGuides.test.ts, src/components/forms/formsState.ts, src/components/forms/formsState.test.ts, src/components/forms/guideState.ts, src/components/forms/guideState.test.ts, e2e/forms-privacy.spec.ts
- Tests: src/lib/storage/formNotices.test.ts, src/lib/storage/formGuides.test.ts, src/components/forms/formsState.test.ts, src/components/forms/guideState.test.ts
- TDD: required — design.md 7-2·7-3·7-4·8절. 휴진 안내 몸통 열쇠(다섯 + 여섯, 100 → null), 읽기(null → 100·없음, 틀린 줄 버림), 안내문 content.style 보냄/안 보냄, formsState·guideState의 style 동작과 '바뀐 내용'(snapshotOf: 처음대로면 지금 글자 그대로, BLANK_SNAPSHOT 그대로), 불러온 안내문의 style, guideState tidyDone이 style을 되살림. e2e는 열쇠 목록·select만 고치고 이 PC에서 돌리지 않는다.

## TASK-6: 글씨·로고 칸 화면과 연결
- Phase: 3
- AC: AC-6801.1, AC-6801.2, AC-6801.3, AC-6801.4, AC-6801.5, AC-6801.6, AC-6801.7, AC-6801.8, AC-6802.2, AC-6802.3, AC-6803.2, AC-6805.3, AC-6805.4
- REQ: REQ-6801, REQ-6802, REQ-6803, REQ-6805
- Files: src/components/forms/ColorChips.tsx, src/components/forms/ColorChips.test.tsx, src/components/forms/StyleControls.tsx, src/components/forms/StyleControls.test.tsx, src/components/forms/AccentPicker.tsx, src/components/forms/AccentPicker.test.tsx, src/components/forms/NoticeEditor.tsx, src/components/forms/GuideEditor.tsx, src/components/forms/FormsScreen.tsx, src/components/forms/FormsScreen.test.tsx, src/components/forms/GuideWorkspace.tsx, src/components/forms/GuideWorkspace.test.tsx
- Tests: src/components/forms/ColorChips.test.tsx, src/components/forms/StyleControls.test.tsx, src/components/forms/AccentPicker.test.tsx, src/components/forms/FormsScreen.test.tsx, src/components/forms/GuideWorkspace.test.tsx
- TDD: required — design.md 8절, 시안 승인판. 칩·첫 단추·직접 고르기(묶음 이름, 눌린 상태, data-own, 소문자 값, null, 시작 색), 로고 색 없음이면 '로고 색' 글 없음, 밀대 범위·5씩·`N%`, 줄 차례(안내문은 강조 색 없음), 도움말 글자 그대로, [처음대로](style 처음대로 + accent null), 배경 칸 아래 '글자 색' 칸 없음·강조 색 줄 글자, 로고 색 표본(준비 성공이면 준비한 그림)에서 칩이 두 서식에 감·readLogoPixels 부르는 수 그대로, 준비한 그림의 tintable과 배경 있는 로고면 로고 색 고르기가 막히고 AC-6801.8 글, 자동 강조 색 글자가 로고 색, 미리보기와 그림 파일·인쇄 사본이 같은 style을 그림. 저장소 화면 규칙(ds·토큰, 사용자 색은 style 속성으로만).

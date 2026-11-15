# 작업 분할: 휴진 안내 테마 다시 그리기·AI 배경 (forms-themes)

> 형식: `## TASK-n: 제목` 아래에 `- Phase:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
>
> **시작 조건**: 이 명세와 화면 시안(`docs/mockups/forms-themes/screen.html`, `notes-screen.md` 승인 줄)이 함께 승인된 뒤. 그림 46장·AI 배경 합성 시안은 2026-11-15에 이미 승인됐다.
> **Phase 5 시작 조건**: forms-guide TASK-10(서식 화면의 도구 단추·`PreviewPanel` 넓히기)이 `feat-forms-guide`에 합쳐지고, 그 갈래를 이 갈래(`feat-forms-themes`)에 먼저 합친다(메인 세션). TASK-14는 그 판 위에서 `FormsScreen.tsx`·`NoticeEditor.tsx`만 고치고 `PreviewPanel.tsx`·`NoticeList.tsx`는 열지 않는다.
> **할 순서**: Phase 1 → 6. 같은 Phase 안은 일꾼 둘까지 병렬(수정 파일이 겹치지 않는다).
>
> | Phase | 일꾼 A | 일꾼 B | 하는 일 |
> |---|---|---|---|
> | 1 밑바탕 | TASK-1 → TASK-3 | TASK-2 | 그림 46장 · 고른 그림 값 · 저장 표와 권한(SQL) |
> | 2 규칙 | TASK-4 → TASK-6 | TASK-5 | 강조색 · 오류 번호와 그림 값 · 적은 말·프롬프트·줄 검사 |
> | 3 조각 | TASK-7 → TASK-8 | TASK-9 → TASK-10 | OpenAI 부르기·하루 한도 · AI 배경 경로 · 브라우저 저장 · 안내문 그림·그림 파일 |
> | 4 상태·문서 | TASK-11 → TASK-13 | TASK-12 | 그림 읽기(브라우저) · 문서 · 화면 상태 |
> | 5 화면 | TASK-14 | — | '배경' 칸·서식 화면 잇기 |
> | 6 마무리 | TASK-15 | — | 화면 확인·전체 검사 |
>
> - **Phase 끝(메인 세션)**: 그 Phase에서 고친 시험 파일과 design.md 15절 "고치지 않은 채 통과" 파일을 `npx vitest run <파일들>`로 돌린다. 전체 검사는 TASK-15에서 한 번
> - 승인된 시험의 기대를 바꾸는 곳은 design.md 15절 "바꾸는 기존 기대"(`assets.test.ts`·`errors.test.ts`)뿐이다. 그 밖이 바뀌어야 하면 멈추고 보고한다
> - 적은 말·프롬프트·그림·열쇠는 시험 출력·로그에도 남기지 않는다. 시험은 가짜 fetch와 가짜 열쇠 글('test-key')만 쓰고 `.env.local`을 읽지 않는다
>
> **사용자 단계(사이트에 올리기 전, 사용자가 직접)** — Claude는 실제 Supabase·OpenAI에 붙지 않는다:
> 1. Supabase 관리 화면 → SQL Editor에 `supabase/migrations/20261115020000_form_backgrounds.sql` 전체를 붙여 한 번 실행한다(먼저 `20261110000000_form_notices.sql`이 들어가 있어야 한다). 이 파일이 표 둘·함수 하나·그림 저장소(버킷)와 그 규칙까지 만든다
> 2. 실행 뒤 Storage 화면에 `form-backgrounds`가 보이고 'Private'(공개 아님)인지 본다
> 3. `OPENAI_API_KEY`는 Vercel과 `.env.local`에 이미 있다(다시 넣지 않는다). OpenAI 관리 화면(Billing → Limits)에서 달 사용 한도를 정해 두기를 권한다
> 4. SQL을 붙이기 전에 올리면: 테마 그림 1·2는 그대로 되고, AI 배경 만들기는 E-FORMS-BG-FAILED, 내 배경 저장·목록은 E-FORMS-BG-STORE-FAILED가 보인다

## TASK-1: 테마 그림 46장
- Phase: 1
- AC: AC-4601.1, AC-4601.2, AC-4601.3
- REQ: REQ-4601
- Files: public/poster/themes/*.svg, src/lib/forms/assets.test.ts
- Tests: src/lib/forms/assets.test.ts
- TDD: required — design.md 3절. 먼저 `assets.test.ts`의 테마 묶음을 46장·새 시안 폴더(`docs/mockups/forms-themes/themes`)·`<image>`·`<style>` 없음으로 바꿔 RED(지금 23장·옛 그림)를 본 뒤, 시안 46장을 바이트 그대로(LF) `public/poster/themes/`에 옮긴다. 60,000바이트 한도는 그대로 두고, 옮긴 뒤 가장 큰 파일을 다시 재서 넘으면 멈추고 보고한다. 글꼴·로고 묶음은 고치지 않는다

## TASK-2: 내 배경 표·하루 한도·그림 저장소 (SQL)
- Phase: 1
- AC: AC-4607.1, AC-4607.2, AC-4608.1, AC-4608.2, AC-4608.3, AC-4608.4, AC-4608.5
- REQ: REQ-4607, REQ-4608
- Files: supabase/migrations/20261115020000_form_backgrounds.sql, supabase/formBackgrounds.rls.test.ts
- Tests: supabase/formBackgrounds.rls.test.ts
- TDD: required — design.md 8-1절. `formGuides.rls.test.ts`와 같은 PGlite 흉내에 `storage` 스키마(버킷·objects 표·RLS·권한·`storage.foldername`)를 더하고, auth·form_notices migration 다음에 새 파일을 돌린다. 맨 위 my_hospital_id()는 C1 글자 그대로. 시험: anon은 표·함수·그림 모두 못 함, 승인 안 된 병원 못 함(`take_ai_image` 42501), 내 병원 줄만 읽기·넣기·지우기·고치기 권한 없음, hospital_id·id·path·created_at 넣기 거부, path가 `<병원 id>/<id>.jpg`, 제약(words 0자·31자·줄바꿈, accent 대문자·7자리, thumb `/9j/` 아님·16,001자) 거부, `ai_image_days` 직접 읽기·쓰기 거부, 하루 20번째까지 true·21번째 false·다른 날 줄은 따로·병원끼리 따로, 버킷 공개 아님·3,000,000·image/jpeg, objects 정책(내 폴더 + 내 줄 path만 올리기, 줄 없는 이름·다른 병원 폴더·다른 버킷 거부, 다른 병원 그림 안 보임·안 지워짐, 고치기 안 됨), `form_notices.theme`에 `bg-<uuid>` 39자 들어감·41자 거부·지금 값(null·`m05`) 그대로, 그 밖의 form_notices 권한 그대로

## TASK-3: 고른 그림 값
- Phase: 1
- AC: AC-4602.1, AC-4602.2, AC-4602.3, AC-4602.4
- REQ: REQ-4602
- Files: src/types/forms.ts, src/lib/forms/themes.ts, src/lib/forms/themes.test.ts, src/lib/forms/notice.ts, src/lib/forms/notice.test.ts, src/components/forms/formsState.ts
- Tests: src/lib/forms/themes.test.ts, src/lib/forms/notice.test.ts
- TDD: required — design.md 2절. `isThemePick`·`lookOfPick`·`withArt`·`withTheme`·`backgroundPick`·`themeHref`·`contrastRatio`·`BACKGROUND_FALLBACK_ACCENT`를 `themes.ts`에 더하고, `themeInUse`를 내 배경이면 저절로 테마로, `checkNotice`를 `isThemePick`으로 바꾼다. `formsState.ts`는 `ThemeId | null` 세 곳의 타입만 `ThemePick | null`로 넓힌다(동작·시험 그대로, `formsState.test.ts` 고치지 않음). 시험: 참 46+1+uuid·거짓 `auto`·`m05-3`·`bg-xyz`·대문자 uuid·빈 글·숫자, 다섯 모양 풀기, 그림 번호·테마 바꾸기 표(design.md 2절), 내 배경에서 테마 고르면 그림 1, 명암비(흰색·검정 21, 같은 색 1), 대신 강조색이 흰색과 4.5 이상, 지금 저장 값(null·열쇠 23개) 통과, `bg-` 대문자 거부. 지금 기대는 고치지 않는다

## TASK-4: 강조색 뽑기
- Phase: 2
- AC: AC-4605.1, AC-4605.2, AC-4605.3, AC-4605.4
- REQ: REQ-4605
- Files: src/lib/forms/accent.ts, src/lib/forms/accent.test.ts
- Tests: src/lib/forms/accent.test.ts
- TDD: required — design.md 5-1절. 순수 함수, 16진수 색 글자를 이 두 파일에 쓰지 않는다(`src/app/theme.test.ts`가 고치지 않은 채 통과 — 시험의 기대 색은 `contrastRatio`·색상 각도로 본다). 시험 그림은 시험 안에서 RGBA 배열로 만든다: 분홍 장식·흰 가운데(색상 330°±15°·흰색 4.5 이상), 파랑 장식·검은 가운데(판 색과 3 이상), 회색뿐(대신 색 계열), 장식이 1%뿐(대신 색), 투명 점만, 가운데만 색(가운데는 세지 않음), 같은 입력 같은 결과, 늘 `#`+소문자 6자리, 밝기 0.10 바닥에서도 두 조건 넘음

## TASK-5: 적은 말·프롬프트·내 배경 줄 검사
- Phase: 2
- AC: AC-4606.2, AC-4606.4, AC-4607.3, AC-4609.1
- REQ: REQ-4606, REQ-4607, REQ-4609
- Files: src/types/formBackground.ts, src/lib/forms/background.ts, src/lib/forms/background.test.ts
- Tests: src/lib/forms/background.test.ts
- TDD: required — design.md 4-1·4-2·8-5절. 서버·브라우저 공용 순수 파일(React·supabase·console 없음). 시험: `backgroundPrompt('봄 벚꽃')`이 design.md 4-1절 글과 한 글자도 다르지 않음(시험에 글을 그대로 적는다), 앞뒤 공백 뗌, `wordsOf` 0자·30자·31자(그림 문자 포함 글자 수)·글자 아님, `wordsProblem` 줄바꿈·탭·제어 문자·010-1234-5678·메일·주민번호 모양 참, '봄 벚꽃' 거짓, `isJpegBase64` `/9j/` 아님·길이 %4·한도 넘음·`=` 셋, `checkBackgroundRow` 열쇠 하나 더/덜·대문자 uuid·path 모양·accent 모양 → null, `BG_PER_DAY`가 migration 파일의 `d.images < 20`·`between 0 and 20`과 같음(파일을 글자로 읽어 견준다)

## TASK-6: 오류 번호와 그림 값
- Phase: 2
- AC: AC-4613.4, AC-4607.4
- REQ: REQ-4613, REQ-4607
- Files: src/types/errors.ts, src/lib/errors.ts, src/lib/errors.test.ts, src/lib/ai/cost.ts, src/lib/ai/cost.test.ts
- Tests: src/lib/errors.test.ts, src/lib/ai/cost.test.ts
- TDD: required — design.md 9·12절. 오류 넷의 문구는 design.md 12절 표 그대로(시험에 그대로 적는다). `errors.test.ts`는 `ALL_CODES`에 넷만 더한다(바꾸는 기존 기대). `cost.ts`는 `IMAGE_PRICE`·`IMAGE_COST_GUESS`·`imageCostMicroUsd`만 더하고 `PRICES`·`costMicroUsd`는 그대로(지금 시험 고치지 않음). 시험: 1,868·200 → 57,040, 0·0 → 0, null → 60,000, 정수

## TASK-7: OpenAI 그림 부르기·하루 한도 부르기
- Phase: 3
- AC: AC-4606.4, AC-4606.5, AC-4607.2
- REQ: REQ-4606, REQ-4607
- Files: src/app/api/ai/openaiImage.ts, src/app/api/ai/openaiImage.test.ts, src/app/api/ai/store.ts, src/app/api/ai/store.test.ts
- Tests: src/app/api/ai/openaiImage.test.ts, src/app/api/ai/store.test.ts
- TDD: required — design.md 4-3·4-5절. `import 'server-only'`(시험은 `claude.test.ts`와 같은 방법), fetch만(꾸러미 더하지 않음), console 없음. 시험(가짜 fetch): 주소·방법·머리 둘·몸통 열쇠 일곱 개와 값(병원·사용자 칸 없음), 열쇠 없으면 부르지 않고 FAILED, 던짐·시간 넘김(짧은 timeoutMs) → BUSY, 429 `insufficient_quota`·400 `billing_hard_limit_reached` → QUOTA, 그 밖 429·500·503 → BUSY, 400 `moderation_blocked`·401 → FAILED, JSON 아님·`data` 없음·PNG base64·3,000,001바이트 → FAILED, 정상 → base64 글 그대로와 사용량(사용량 칸 없거나 음수면 null), 결과에 오류 글이 없음. `takeAiImage`: true·false·오류·던짐·불리언 아님 → 'failed', `rpc('take_ai_image')`를 인자 없이 부름. 지금 store 시험은 고치지 않는다

## TASK-8: AI 배경 경로
- Phase: 3
- AC: AC-4606.1, AC-4606.2, AC-4606.3, AC-4606.4, AC-4606.5, AC-4606.6, AC-4606.7
- REQ: REQ-4606
- Files: src/app/api/ai/forms/background/route.ts, src/app/api/ai/forms/background/route.test.ts
- Tests: src/app/api/ai/forms/background/route.test.ts
- TDD: required — design.md 4-4절. `forms/guide/picture/route.ts`와 같은 모양(`runtime = 'nodejs'`·`maxDuration = 60`, Next 이름만 export). 시험(readMe·supabaseServer·takeAiImage·callImage·addUsage 가짜): 몸통 없음·JSON 아님·열쇠 더함·빈 글·31자 → 400 몸통 없음, 401·403, 개인정보·줄바꿈 → 422 PRIVATE이고 한도·OpenAI를 부르지 않음, 한도 false → 429·'failed' → 502이고 OpenAI 안 부름, OpenAI 번호마다 상태(503·402·502), 성공 → 200 `{ image }`·`Cache-Control: no-store`·사용량 한 번(토큰과 값, 사용량 null이면 0·0·60,000)·사용량 실패해도 200, 실패면 사용량 안 더함, `console.error`가 경로·번호 둘만 받고 적은 말·프롬프트·그림 글이 어떤 로그에도 없음

## TASK-9: 내 배경 브라우저 저장
- Phase: 3
- AC: AC-4609.1, AC-4609.2, AC-4609.3, AC-4609.4
- REQ: REQ-4609
- Files: src/lib/storage/formBackgrounds.ts, src/lib/storage/formBackgrounds.test.ts
- Tests: src/lib/storage/formBackgrounds.test.ts
- TDD: required — design.md 8-3절. `formNotices.ts`와 같은 모양(가짜 supabase 클라이언트, 표와 storage 둘 다 흉내). 시험: 목록 차례·30개·`checkBackgroundRow` 못 넘는 줄 뺌·오류 → 'failed', 저장 몸통 셋뿐·검사 못 넘으면 아무것도 안 보냄·받은 path로 올림(`image/jpeg`·`upsert: false`)·올리기 실패면 그 id 줄 지우고 'failed', 내려받기 JPEG 아님·오류 → null, 지우기 차례(그림 → 줄)·어느 하나 오류면 false, 오류 내용이 결과에 없음

## TASK-10: 안내문 그림(그림 2·AI 배경)·그림 파일
- Phase: 3
- AC: AC-4603.1, AC-4603.2, AC-4603.3, AC-4603.4, AC-4604.1, AC-4604.2, AC-4604.3
- REQ: REQ-4603, REQ-4604
- Files: src/components/forms/Poster.tsx, src/components/forms/PosterBackground.test.tsx, src/lib/forms/png.ts, src/lib/forms/pngBackground.test.ts
- Tests: src/components/forms/PosterBackground.test.tsx, src/lib/forms/pngBackground.test.ts
- TDD: required — design.md 6·7절. 새 시험 파일에만 쓴다(`Poster.test.tsx`·`png.test.ts`는 열지 않고 그대로 통과). 흰색은 `Poster.tsx`의 `WHITE`, 테마 주소는 `themeHref`. 시험: art 2 → `-2.svg`, art 없음·1 → 지금 주소, 배경 → 첫 image 주소·크기·`xMidYMid slice`, 판·빛 값과 흐림 필터 하나·두 도형이 그 필터를 씀, 강조색이 'N월'·띠·카드 아래 글에, image 둘뿐(배경·로고), 잘못된 주소(`https:`·`data:image/png`)·대문자 강조색 → 테마로, 테마일 때 판·빛·필터 없음. png: `THEME_PATH`가 `-2`를 받고 `-3`은 안 받음, 그림 2 SVG에서 `/poster/` 안 남음, JPEG data: 첫 image → 테마를 읽지 않고(fetch가 글꼴 둘·로고만) 그 주소가 남은 SVG로 그림, 그 밖의 첫 image → false, `base64` export

## TASK-11: 배경 그림 읽기(브라우저)
- Phase: 4
- AC: AC-4605.5
- REQ: REQ-4605
- Files: src/lib/forms/backgroundImage.ts, src/lib/forms/backgroundImage.test.ts
- Tests: src/lib/forms/backgroundImage.test.ts
- TDD: required — design.md 5-2절. 16진수 색 글자 없음, console 없음. 시험(`createImageBitmap`·canvas를 가짜로 둔다 — 그리면 정한 점을 돌려주고, `toBlob`은 품질에 따라 정한 크기의 JPEG 바이트): FF D8 FF 아님 → null(그림을 풀지 않음), 정상 → `data:image/jpeg;base64,` 주소·`pickAccent` 결과·작은 그림 120×170, 0.7이 16,000자 넘으면 0.5로 한 번 더, 0.5도 넘으면 null, 풀기 던짐 → null, `close()` 부름, `base64ToBytes`·`jpegDataUrl` 왕복

## TASK-12: '배경' 칸 상태
- Phase: 4
- AC: AC-4611.3, AC-4611.4, AC-4611.5, AC-4611.6, AC-4612.2, AC-4612.3, AC-4612.5
- REQ: REQ-4611, REQ-4612
- Files: src/components/forms/backgroundState.ts, src/components/forms/backgroundState.test.ts
- Tests: src/components/forms/backgroundState.test.ts
- TDD: required — design.md 10-1절. 순수 함수(React·fetch·supabase 없음, 16진수 색 글자 없음). 시험: 동작마다 다음 상태, `shownMode`(내 배경 값이면 늘 mine), `bgAnswerOf`(200 정상·200 모양 틀림·번호 다섯·400·401·403·504·JSON 아님), `posterLook` 표 여덟 줄 전부(만든 배경은 mine일 때만·blocked·note), `saved`가 목록 맨 위·trial 비움, `deleted`가 목록과 그림에서 뺌, `canSaveTrial`·`isFull`(29장·30장·목록 실패), 만들기 실패해도 words·trial 그대로

## TASK-13: 문서(ADR-029·CLAUDE.md 한 줄·구조)
- Phase: 4
- AC: AC-4613.1, AC-4613.2, AC-4613.3, AC-4613.5
- REQ: REQ-4613
- Files: docs/ADR.md, CLAUDE.md, docs/ARCHITECTURE.md, src/lib/forms/backgroundDocs.test.ts
- Tests: src/lib/forms/backgroundDocs.test.ts
- TDD: required — design.md 1·8·11절. ADR-029 '휴진 안내 AI 배경은 적은 말을 OpenAI 그림 AI로 보낸다'(맥락·결정·보내는 것과 안 보내는 것·값과 한도·저장·열쇠·로그·CSP·대안과 트레이드오프). CLAUDE.md 아키텍처 규칙의 ADR-028 줄 바로 밑에 한 줄: "- 예외 (ADR-029): 휴진 안내 AI 배경(`app/api/ai/forms/background`)만 사용자가 적은 짧은 말(30자까지, 개인정보 모양 거부)을 OpenAI 그림 AI로 보낸다. 열쇠 `OPENAI_API_KEY`는 서버 환경 변수에만, 하루 20장, 저장은 고른 그림만(`form_backgrounds`·Storage `form-backgrounds`)" — 'ADR-028' 글자를 넣지 않는다. 보안 규칙의 비밀값 줄은 고치지 않는다. ARCHITECTURE: 디렉토리 구조·표 목록·Storage 버킷. 시험: AC-4613.1~4613.3 글자 검사, `buildCsp`(개발·운영)에 'openai'가 없고 `img-src`·`connect-src`가 지금 그대로. `rules.test.ts`·`guideDocs.test.ts`는 고치지 않은 채 통과

## TASK-14: '배경' 칸과 서식 화면 잇기
- Phase: 5
- AC: AC-4610.1, AC-4610.2, AC-4610.3, AC-4611.1, AC-4611.2, AC-4611.3, AC-4611.4, AC-4611.5, AC-4611.6, AC-4612.1, AC-4612.2, AC-4612.3, AC-4612.4, AC-4612.5
- REQ: REQ-4610, REQ-4611, REQ-4612
- Files: src/components/forms/ThemePicker.tsx, src/components/forms/useBackgrounds.ts, src/components/forms/NoticeEditor.tsx, src/components/forms/FormsScreen.tsx, src/components/forms/ThemePicker.test.tsx
- Tests: src/components/forms/ThemePicker.test.tsx
- TDD: required — design.md 10절, 시안 `screen.html`. 시작 조건: 위 'Phase 5 시작 조건'. 글귀는 requirements.md·시안과 한 글자도 다르지 않게, 토큰과 `ds`만(색 글자 없음). `FormsScreen.tsx`는 design.md 10-4절 몇 줄만 고친다(hook·`look`·두 `Poster`·`ready`). 시험은 새 파일 하나에 둔다(jsdom, `FormsScreen`을 그리고 fetch·`lib/storage/formNotices`·`lib/storage/formBackgrounds`·`readBackground`를 가짜로): 묶음 단추 둘·테마 24개·그림 단추·도움말, [그림 2] → 미리보기·인쇄 사본 `-2.svg`·저장 몸통 `m05-2`/`auto-2`·테마 바꿔도 눌린 채, [내 배경] → 만들기 칸·안내 글·목록 한 번만 읽음, 빈 글 막힘, 개인정보면 fetch 없음·PRIVATE, 만드는 중 글·막힘·두 번 눌러도 한 번, 만든 배경이 미리보기에·세 뽑기 단추 막힘, 저장 → 목록 맨 위·`bg-<id>`·만든 칸 사라짐, 저장 실패 → STORE-FAILED·만든 배경 그대로, 30장이면 막힘과 글, [다시 만들기]·[안 쓰기], 오류 카드 넷과 끊김·모르는 답, 목록 없음·읽는 중·실패와 [다시 읽기], 고르기 → 내려받는 중 막힘·실패 [다시 읽기], [테마 그림] → null, 저장한 `bg-` 안내문 열면 [내 배경] 눌림, 지우기 확인·취소·실패, 지운 배경 알림·뽑기 안 막힘, 늦게 온 답 버림. `FormsScreen.test.tsx`는 열지 않고 그대로 통과해야 한다(AC-4610.3)

## TASK-15: 화면 확인·전체 검사
- Phase: 6
- AC: AC-4603.2, AC-4605.2, AC-4610.1, AC-4611.1, AC-4611.3, AC-4612.1
- REQ: REQ-4603, REQ-4605, REQ-4610, REQ-4611, REQ-4612
- Files: src/components/forms/ThemePicker.tsx, src/components/forms/Poster.tsx
- Tests: src/components/forms/ThemePicker.test.tsx
- TDD: exempt — 화면 확인(저장소 밖 하네스에서 진짜 부품을 합성 값으로: 1440·390 폭, 시안 `screen.html`의 여섯 상태와 나란히, 그림 1·2 몇 장, `ai-samples` 세 장을 배경으로 얹은 미리보기와 강조색 대비, 인쇄 미리보기, 내려받은 PNG 열어 보기)과 전체 검사(`npm test`·`npm run lint`·`npm run build`). 고칠 것이 나오면 Files의 화면 파일만 고친다. 실제 AI 부르기(짧은 한국어 말 셋 — 예 '봄 벚꽃'·'추석 보름달'·'겨울 눈')와 내 배경 저장은 사용자가 SQL을 붙인 뒤에만 하고, 못 하면 그렇다고 보고한다. 만든 그림은 커밋하지 않는다

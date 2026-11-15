# 요구사항: 휴진 안내 테마 다시 그리기·AI 배경 (forms-themes)

> 기능 ID: `forms-themes` · 형식: 요구사항은 `### REQ-4601: 제목`, 수용 기준은 `- AC-4601.1: Given/When/Then`.
> 각 AC는 시험 하나 이상으로 검증하고, 시험 이름에 AC ID를 넣는다. 그림 모양·화면 모양은 화면 확인 TASK가 사진으로 본다(tasks.md).
> 번호: REQ-4601~4613(다른 명세와 겹치지 않음: 35xx forms, 36xx forms-logo, 44xx first90, 45xx forms-guide).

## 배경 / 목표
- 서식 탭 휴진 안내(`specs/forms`, `specs/forms-logo`)는 테마 23개(공휴일 11 + 달 12)에 그림이 한 장씩이다. 사용자가 더 정교한 그림과 고를 거리를 원했다
- 2026-11-15 사용자 요청 "진료일정 배경디자인도 생성할 수 있게 해": 짧은 말을 적으면 AI가 생생한 배경 그림을 만들고, 마음에 드는 것은 다시 쓰고 싶다
- 승인 시안: `docs/mockups/forms-themes/months.html`·`holidays.html`(그림 46장 `themes/<열쇠>.svg`·`<열쇠>-2.svg`), `ai-backgrounds.html`(AI 배경 시험 3장 합성, `ai-samples/*.jpg`), `notes-months.md`·`notes-holidays.md`·`notes-ai.md`(승인 줄). 화면 시안은 `screen.html`(`?s=pick|ai|making|made|mine|error`)과 `notes-screen.md`
- 지금 구조를 그대로 쓴다: 휴진 안내 화면 흐름(목록·만들기·미리보기·저장), `form_notices` 표, 안내문 SVG(`Poster`), 인쇄 사본, 그림 파일(`lib/forms/png.ts`), 사용량 기록(`ai_usage`·`add_ai_usage`)

## 이미 정한 것 (사용자 결정 2026-11-15, 다시 묻지 않는다)
1. 테마 23개의 그림을 시안 `themes/<열쇠>.svg`로 **바꿔 끼우고**, 테마마다 **그림 2(`<열쇠>-2.svg`)를 더해** 고를 수 있게 한다(46장 승인). 고르는 칸은 최소로 — 테마 아래 '그림 1 · 그림 2'. 지금 저장된 휴진 안내는 그림 1로 보인다
2. **AI 배경 만들기**: 사용자가 짧은 말(예 '봄 벚꽃')을 적으면 서버가 **OpenAI 그림 AI**로 배경 그림을 만든다(도형이 아니라 생생한 그림, Google 아님). 열쇠 `OPENAI_API_KEY`는 Vercel과 `.env.local`에 이미 있다
3. 시험 결과대로: 모델 `gpt-image-2.6-flare`, 크기 1584×2240(A4 비율), 품질 medium, JPEG 압축 88. 한 장 약 7초·약 80원. 프롬프트는 가장자리만 장식·가운데 비움·아래 가운데 로고 자리 비움·글자/숫자/로고/사람 얼굴 금지(시안 `notes-ai.md`)
4. 색은 **AI가 만든 그림에서 앱이 강조색을 뽑고 글자 대비를 검사**해 맞춘다(흰 글자 날짜 띠·'N월' 글자 둘 다 읽히게)
5. 글자 뒤에는 **반투명 흰 판**을 앱이 깔아 어떤 그림이 나와도 읽히게 한다(시안 `ai-backgrounds.html`의 값)
6. 마음에 드는 배경은 **'내 배경'으로 저장해 다시 쓴다**: Supabase Storage(병원별 폴더, RLS) + 새 표 `form_backgrounds`(RLS). 휴진 안내는 테마 대신 내 배경을 고를 수 있다
7. 진행: 최소안, 검토는 마지막 한 번

이 명세에서 Claude가 정한 것(`design.md` 13절 '정한 것과 까닭'):
8. 고른 그림은 지금 `form_notices.theme` 칸 하나에 담는다: null(저절로·그림 1) · `auto-2`(저절로·그림 2) · `<열쇠>` · `<열쇠>-2` · `bg-<내 배경 id>`. 새 칸을 더하지 않는다(그래서 지금 저장된 안내문·시험이 그대로 맞다). 칸 제약만 40자로 넓힌다
9. 적은 말은 30자까지. 개인정보 모양 검사는 휴진 안내 AI 정리의 `memoProblem`을 다시 쓰고, 줄바꿈·탭도 막는다
10. 하루 한도는 병원마다 하루(한국 날짜) **20장**이고, 보내기 전에 센다(OpenAI가 실패해도 한 장으로 센다). DB 함수 `take_ai_image()`가 센다
11. 값은 지금 사용량 표(`ai_usage`)에 `add_ai_usage`로 더한다: 토큰 단가 입력 5·출력 30(백만분의 1달러). 시험 그림(출력 1,868토큰)이 약 $0.057이 되는 값이다. 답에 사용량이 없으면 한 장 60,000(백만분의 1달러)으로 센다
12. 강조색 대비: 흰 글자와 4.5 이상(지금 테마의 3보다 엄격하게), 'N월' 뒤 판 색과 3 이상
13. 내 배경은 30장까지, 목록에는 작은 그림(120×170 JPEG)을 표에 함께 둔다(목록을 한 번에 읽으려고). 큰 그림은 Storage에만 둔다
14. 만든 배경(아직 저장 안 함)이 미리보기에 있는 동안은 [저장]·[인쇄·PDF]·[그림 파일]을 막는다. 저장해야 그 안내문에 쓸 수 있다
15. CSP는 바꾸지 않는다: 브라우저는 OpenAI와 말하지 않고, 그림은 우리 서버 답과 Supabase(이미 `connect-src`에 있음)로 받아 `data:` 주소(이미 `img-src`에 있음)로 그린다

## 요구사항

### REQ-4601: 테마 그림 46장
- AC-4601.1: Given `public/poster/themes/`, When 파일을 보면, Then 테마 열쇠 23개마다 `<열쇠>.svg`(그림 1)와 `<열쇠>-2.svg`(그림 2)가 하나씩, 모두 46개만 있다
- AC-4601.2: Given 46장, When 승인 시안 `docs/mockups/forms-themes/themes/`의 같은 이름 파일과 견주면(줄바꿈을 LF로 되돌려), Then 바이트가 같다(sha256). 옛 시안 `docs/mockups/forms/themes/`와 견주던 시험은 새 시안과 견준다
- AC-4601.3: Given 46장, When 검사하면, Then 맨 바깥 `<svg>`는 `viewBox="0 0 794 1123"`이고, `<text>`·`<script>`·`<foreignObject>`·`<image>`·`<style>`·`on…=` 속성이 없고, href·xlink:href·url()은 모두 `#`로 시작하며, 한 장은 60,000바이트 이하다(2026-11-15 잰 가장 큰 파일 m12.svg 50,860바이트)

### REQ-4602: 고른 그림 값
- AC-4602.1: Given 안내문의 `theme` 값, When `isThemePick`로 보면, Then 테마 열쇠 23개, `<열쇠>-2` 23개, `auto-2`, `bg-<소문자 uuid>`만 참이고 그 밖(`auto`·`m05-3`·`bg-xyz`·대문자 uuid·빈 글·글자가 아닌 값)은 거짓이다
- AC-4602.2: Given `theme` 값과 안내 내용, When `lookOfPick(notice)`로 풀면, Then null → 저절로 테마·그림 1, `auto-2` → 저절로 테마·그림 2, `<열쇠>` → 그 테마·그림 1, `<열쇠>-2` → 그 테마·그림 2, `bg-<id>` → 내 배경 id다. `themeInUse`는 내 배경이면 저절로 테마를, 아니면 그 테마 열쇠를 돌려준다(지금 시험 그대로)
- AC-4602.3: Given 고른 값, When 그림 번호를 바꾸면(`withArt`), Then 테마는 그대로 그림만 바뀌고(null ↔ `auto-2`, `m05` ↔ `m05-2`), 테마 고르기를 바꾸면(`withTheme`) 그림 번호는 그대로 테마만 바뀐다(`m05-2`에서 6월 → `m06-2`, 저절로 → `auto-2`). 내 배경 값에서 테마를 고르면 그림 1이다
- AC-4602.4: Given 저장한 줄·저장 직전 값, When `checkNotice`로 보면, Then theme은 null이거나 `isThemePick`이 참인 값만 받는다. 지금 저장된 값(null·테마 열쇠 23개)은 그대로 통과하고 그림 1로 보인다

### REQ-4603: 안내문 그림 — 그림 2와 AI 배경
- AC-4603.1: Given 테마와 그림 번호, When `<Poster theme art>`를 그리면, Then 첫 `<image>`의 href는 그림 2면 `/poster/themes/<열쇠>-2.svg`, 그림 1이거나 art가 없으면 지금처럼 `/poster/themes/<열쇠>.svg`이고 글자·카드·로고는 그대로다
- AC-4603.2: Given 배경(그림 주소 `data:image/jpeg;base64,…`와 강조색), When `<Poster background>`를 그리면, Then 첫 image는 그 주소(x 0·y 0·794×1123, `preserveAspectRatio="xMidYMid slice"`)이고, 바로 뒤에 반투명 흰 판 `<rect x="64" y="70" width="666" height="770" rx="40" fill="#fff" fill-opacity=".55">`과 로고 뒤 흰 빛 `<ellipse cx="397" cy="1040" rx="210" ry="46" fill="#fff" fill-opacity=".7">`가 흐림 필터(`feGaussianBlur stdDeviation="18"`) 하나를 함께 쓴다. 'N월'·날짜 띠·카드 아래 글은 그 강조색이고, 안내문 안 image는 배경과 로고 둘뿐이다
- AC-4603.3: Given 배경 그림 주소가 `data:image/jpeg;base64,`로 시작하지 않거나 강조색이 `#`와 소문자 16진수 6자리가 아니면, When 그리면, Then 배경을 쓰지 않고 테마 그림(그 테마·그림 번호)으로 그린다
- AC-4603.4: Given 테마로 그린 안내문, When 보면, Then 흰 판·흰 빛·흐림 필터가 없다. 지금 안내문 그림 시험(`Poster.test.tsx`)은 고치지 않은 채 통과한다

### REQ-4604: 그림 파일(PNG)
- AC-4604.1: Given 그림 2를 쓴 안내문 SVG, When `svgForImage`·`downloadPosterPng`로 만들면, Then `/poster/themes/<열쇠>-2.svg`를 읽어 data: 주소로 넣고 바깥 주소(`/poster/`)가 남지 않는다
- AC-4604.2: Given 첫 image가 `data:image/jpeg;base64,` 주소인 안내문 SVG(내 배경), When `downloadPosterPng`로 만들면, Then 테마 그림은 읽지 않고(글꼴 둘·로고만 읽는다) 그 주소를 그대로 둔 PNG를 내려받는다. 첫 image가 테마 주소도 그 모양도 아니면 false다
- AC-4604.3: Given 지금 그림 파일 시험(`png.test.ts`), When 돌리면, Then 고치지 않은 채 통과한다

### REQ-4605: 강조색 뽑기와 작은 그림
- AC-4605.1: Given 작게 줄인 그림 점(RGBA, `ACCENT_SAMPLE` 40×57), When `pickAccent(pixels, w, h)`, Then 가장자리 장식 구역(가운데 x 10~90%·y 10~80% 밖)에서 채도 0.25 이상·밝기 0.12~0.88인 점을 색상 15°마다 칸으로 모아 채도 합이 가장 큰 칸의 평균색에서 시작하고, 결과는 `#`와 소문자 16진수 6자리다
- AC-4605.2: Given 시작 색, When 대비를 맞추면, Then HSL 밝기를 0.02씩 내려 흰색과 명암비 4.5 이상이고 판 색(그림의 'N월' 자리 x 30~70%·y 10~19% 평균색에 흰색을 55% 섞은 색, `panelColor`)과 명암비 3 이상이 될 때까지 어둡게 한다. 밝기 0.10에서 멈춘다(그때는 늘 두 조건을 넘는다)
- AC-4605.3: Given 색 있는 점이 장식 구역 점의 2% 밑이면(흑백에 가까운 그림), When 뽑으면, Then `BACKGROUND_FALLBACK_ACCENT`(`lib/forms/themes.ts`)에서 시작해 같은 대비 맞추기를 한다
- AC-4605.4: Given 예(분홍 장식·흰 가운데 / 파랑 장식·검은 가운데 / 회색뿐), When 뽑으면, Then 분홍은 색상 330°±15° 안·흰색 4.5 이상, 검은 가운데는 판 색과 3 이상, 회색은 대신 색 계열이다. 같은 점이면 늘 같은 색이다
- AC-4605.5: Given JPEG 바이트, When `readBackground(bytes)`, Then 첫 세 바이트가 FF D8 FF가 아니면 null이고, 맞으면 그림을 40×57로 줄여 `pickAccent`로 강조색을, 120×170 JPEG(품질 0.7, base64가 16,000자를 넘으면 0.5)로 작은 그림 base64를 만들어 `{ image: 'data:image/jpeg;base64,…', accent, thumb }`를 돌려준다. 그림을 못 풀거나 0.5로도 16,000자를 넘으면 null이다

### REQ-4606: AI 배경 경로(서버)
- AC-4606.1: Given `POST /api/ai/forms/background`, When 몸통이 `{ text }` 하나(앞뒤 공백을 뗀 1~30자 글)가 아니면 400, 로그인 안 했으면 401, 승인되지 않은 병원이면 403이고 몸통이 없다
- AC-4606.2: Given 적은 말에 제어 문자(줄바꿈·탭 포함)나 전화·주민번호·메일 모양이 있으면, When 받으면, Then OpenAI를 부르지 않고 하루 한도도 세지 않고 422 `{ code: 'E-FORMS-PRIVATE' }`다
- AC-4606.3: Given 통과한 말, When 하루 한도를 넘었으면(`take_ai_image()`가 false), Then OpenAI를 부르지 않고 429 `E-FORMS-BG-LIMIT`이고, 한도 함수가 오류면 502 `E-FORMS-BG-FAILED`다
- AC-4606.4: Given 한도 안, When OpenAI를 부르면, Then `POST https://api.openai.com/v1/images/generations`에 머리 `Authorization: Bearer <OPENAI_API_KEY>`·`Content-Type: application/json`을 넣고, 몸통 열쇠는 `model`(`gpt-image-2.6-flare`)·`prompt`(design.md 4절 글에 앞뒤 공백을 뗀 말을 넣은 것)·`size`(`1584x2240`)·`quality`(`medium`)·`n`(1)·`output_format`(`jpeg`)·`output_compression`(88) 일곱 개뿐이다. 병원·사용자 정보는 보내지 않는다
- AC-4606.5: Given OpenAI 답, When 읽으면, Then 200이고 `data[0].b64_json`이 JPEG(FF D8 FF로 시작)·3,000,000바이트 이하면 200 `{ image }`(받은 base64 글 그대로, `Cache-Control: no-store`)다. 429 `insufficient_quota`·400 `billing_hard_limit_reached`는 402 `E-FORMS-BG-QUOTA`, 그 밖의 429·5xx·연결 끊김·50초 넘김은 503 `E-AI-BUSY`, 그 밖(거절·모양 틀림·열쇠 없음)은 502 `E-FORMS-BG-FAILED`다
- AC-4606.6: Given 그림을 받았으면, When 사용량을 더하면, Then `add_ai_usage`로 한 번 더하고(토큰은 답의 `usage.input_tokens`·`output_tokens`, 값은 `imageCostMicroUsd`), 더하기에 실패해도 답은 그대로다. 그림을 못 받았으면 더하지 않는다
- AC-4606.7: Given 어떤 경우든, When 로그를 보면, Then `{ code }`로 답할 때 `console.error('[api/ai/forms/background]', code)` 한 줄뿐이고, 적은 말·프롬프트·그림·열쇠·OpenAI 오류 글은 남기지 않는다

### REQ-4607: 하루 한도와 값
- AC-4607.1: Given migration, When 적용하면, Then `ai_image_days`(병원·한국 날짜·장 수 0~20)는 RLS가 켜지고 anon·authenticated의 표 권한이 하나도 없다(세기는 함수로만)
- AC-4607.2: Given 승인된 병원 사용자, When `take_ai_image()`를 부르면, Then 오늘(한국 날짜) 장 수가 20 밑이면 하나 올리고 true, 20이면 그대로 두고 false다. 다른 날 줄은 오늘 수에 들지 않는다. 승인되지 않은 사용자는 오류 42501이고, anon은 부를 권한이 없다
- AC-4607.3: Given 화면·문서의 하루 한도(`BG_PER_DAY`), When migration의 한도 숫자와 견주면, Then 둘 다 20이다
- AC-4607.4: Given 그림 사용량, When `imageCostMicroUsd`로 세면, Then 입력 토큰 × 5 + 출력 토큰 × 30(백만분의 1달러 정수)이고, 사용량이 없으면(null) 60,000이다. 출력 1,868·입력 200이면 57,040이다. Claude 가격표(`PRICES`)와 `costMicroUsd`는 그대로다

### REQ-4608: 내 배경 표와 그림 저장소(DB)
- AC-4608.1: Given migration `form_backgrounds`, When 적용하면, Then RLS가 켜지고 anon·authenticated의 기본 권한을 모두 거둔 뒤 authenticated에 select·delete와 insert(`words`·`accent`·`thumb` 칸만)만 준다(고치기 없음). `hospital_id`는 DB가 정하고(`my_hospital_id()`), `path`는 DB가 `<병원 id>/<id>.jpg`로 만든다
- AC-4608.2: Given 승인된 병원 사용자, When 읽기·넣기·지우기를 하면, Then 자기 병원 줄만 되고, 다른 병원 줄은 보이지도 지워지지도 않는다. `hospital_id`·`id`·`path`·`created_at`은 넣을 수 없다. 승인되지 않은 사용자와 anon은 아무것도 못 한다
- AC-4608.3: Given 표 제약, When 값을 넣으면, Then `words`는 1~30자이고 제어 문자가 없으며, `accent`는 `#`와 소문자 16진수 6자리, `thumb`는 `/9j/`로 시작하는 base64 글로 16,000자 이하만 들어간다
- AC-4608.4: Given Storage 버킷 `form-backgrounds`, When migration을 적용하면, Then 공개가 아니고(public false) 한 파일 3,000,000바이트·`image/jpeg`만이다. `storage.objects` 정책은 이 버킷에서 첫 폴더가 내 병원 id인 것만 읽기·지우기를 허락하고, 올리기는 거기에 더해 이름이 내 `form_backgrounds` 줄의 `path`와 같을 때만 허락한다(고치기 정책 없음). 다른 병원 폴더·다른 버킷·승인되지 않은 사용자·anon은 못 한다
- AC-4608.5: Given `form_notices.theme` 제약, When migration을 적용하면, Then `bg-<uuid>`(39자)가 들어가게 `^[a-z0-9-]{1,40}$`로 넓어지고 그 밖의 칸·권한·정책은 그대로다

### REQ-4609: 내 배경 읽기·저장·지우기(브라우저 저장)
- AC-4609.1: Given 저장한 내 배경, When `listBackgrounds()`, Then `form_backgrounds`에서 만든 차례 거꾸로 30개까지 `{ id, words, accent, thumb, path, createdAt }`로 읽고, `checkBackgroundRow`를 못 넘는 줄은 빼며, 오류면 'failed'다
- AC-4609.2: Given 만든 배경, When `saveBackground({ words, accent, thumb, image })`, Then 먼저 줄을 넣고(몸통은 `{ words, accent, thumb }` 셋뿐, 검사를 못 넘으면 보내지 않고 'failed') 받은 `path`로 그림을 올린다(`image/jpeg`, 덮어쓰기 안 함). 올리기가 실패하면 넣은 줄을 지우고 'failed'다. 성공이면 그 내 배경이다
- AC-4609.3: Given 내 배경, When `readBackgroundImage(item)`, Then 그 `path`의 그림을 내려받아 JPEG(FF D8 FF로 시작)면 바이트, 아니거나 오류면 null이다
- AC-4609.4: Given 내 배경, When `deleteBackground(item)`, Then 그림을 먼저 지우고 줄을 지운다. 어느 하나라도 오류면 false다. 오류 내용은 버린다

### REQ-4610: 화면 — 테마 그림 1·2
- AC-4610.1: Given 휴진 안내 만들기, When 보면, Then 맨 아래 '배경' 칸 제목 옆에 묶음 '배경 종류'의 [테마 그림](눌림)·[내 배경] 두 단추가 있고, 그 아래에 지금처럼 '테마' 고르기(옵션 24개), '그림' 묶음의 [그림 1]·[그림 2], 도움말 "카드 이름에 공휴일 이름이 있으면 그 공휴일, 없으면 안내 달의 그림이 저절로 골라져요"가 있다. 새 안내문과 지금 저장된 안내문은 [그림 1]이 눌려 있다
- AC-4610.2: Given 테마 그림, When [그림 2]를 누르면, Then 미리보기와 인쇄 사본의 테마 그림이 `<열쇠>-2.svg`로 바뀌고, 저장하면 `theme`이 `<열쇠>-2`(저절로면 `auto-2`)다. 그 뒤 테마 고르기를 바꿔도 [그림 2]가 눌린 채다
- AC-4610.3: Given 지금 서식 화면 시험(`FormsScreen.test.tsx`의 테마 고르기·저장·인쇄·그림 파일), When 돌리면, Then 기대를 고치지 않은 채 통과한다

### REQ-4611: 화면 — AI 배경 만들기
- AC-4611.1: Given '배경' 칸, When [내 배경]을 누르면, Then 테마 고르기·그림 단추 대신 'AI 배경 만들기' 글 칸(30자까지, 자리 글 "예) 봄 벚꽃", 'n/30')·[AI로 배경 만들기]·늘 보이는 안내 "적은 말만 OpenAI 그림 AI로 보내요. 전화번호·주민번호·메일 주소는 적지 마세요. 한 장에 10초쯤 걸리고 약 80원이 들어요(하루 20장까지)"와 '내 배경' 목록이 보인다. 글이 비었으면 단추가 막힌다. 내 배경 목록은 처음 [내 배경]을 누를 때(또는 내 배경을 쓰는 안내문을 열 때) 한 번 읽는다
- AC-4611.2: Given 적은 말, When [AI로 배경 만들기]를 누르면, Then 개인정보 모양·제어 문자가 있으면 아무것도 보내지 않고 E-FORMS-PRIVATE가 보이며, 아니면 `/api/ai/forms/background`에 `{ text }`를 보내고 기다리는 동안 단추가 '만드는 중…'으로 막히고 "그림을 만드는 중이에요. 10초쯤 걸려요"가 보인다
- AC-4611.3: Given 그림 답, When 앱이 읽으면(`readBackground`), Then 미리보기와 인쇄 사본이 만든 배경과 뽑은 강조색으로 바뀌고, '만든 배경: <말>' 칸에 "미리보기에 얹어 보았어요. 저장해야 이 안내문에 쓰고 뽑을 수 있어요"와 [내 배경으로 저장]·[다시 만들기]·[안 쓰기]가 보이며, 이 동안 [저장]·[인쇄·PDF]·[그림 파일]이 막힌다. 그림을 못 읽으면 E-FORMS-BG-FAILED다
- AC-4611.4: Given 만든 배경, When [내 배경으로 저장]을 누르면, Then 저장하는 동안 '저장하는 중…'으로 막히고, 끝나면 내 배경 목록 맨 위에 생겨 골라지고(안내문 `theme` = `bg-<id>`) 만든 배경 칸은 사라진다. 실패면 E-FORMS-BG-STORE-FAILED가 보이고 만든 배경은 그대로다. 내 배경이 30장이면 단추가 막히고 "내 배경은 30장까지예요. 안 쓰는 배경을 지워 주세요"가 보인다
- AC-4611.5: Given 만든 배경, When [다시 만들기]를 누르면, Then 그 배경의 말로 다시 만들고(앞 그림은 버린다), [안 쓰기]를 누르면 만든 배경을 버리고 미리보기가 고른 테마·배경으로 돌아간다
- AC-4611.6: Given 오류 답(E-FORMS-BG-LIMIT·E-FORMS-BG-QUOTA·E-FORMS-BG-FAILED·E-AI-BUSY, 연결 끊김은 E-AI-BUSY, 모르는 답은 E-FORMS-BG-FAILED), When 받으면, Then 그 오류 카드가 보이고 적은 말·고른 그림·만든 배경(있으면)은 그대로다

### REQ-4612: 화면 — 내 배경 고르기·지우기
- AC-4612.1: Given 내 배경 목록, When 보면, Then 제목 '내 배경' 옆에 'n/30장'이 있고, 최근 것부터 작은 그림과 적은 말이 단추로 보이며(읽는 이름 '<말> 배경', 고른 것은 눌림), 없으면 "아직 저장한 배경이 없어요", 읽는 중이면 "내 배경을 읽는 중…", 실패면 E-FORMS-BG-STORE-FAILED와 [다시 읽기]가 보인다
- AC-4612.2: Given 내 배경 하나, When 누르면, Then 안내문 `theme`이 `bg-<id>`가 되고, 그 그림을 처음 쓸 때 한 번 내려받아 미리보기·인쇄 사본·그림 파일이 그 배경과 저장한 강조색으로 그려진다. 내려받는 동안 "내 배경을 불러오는 중…"이 보이고 [저장]·[인쇄·PDF]·[그림 파일]이 막히며, 못 내려받으면 E-FORMS-BG-STORE-FAILED와 [다시 읽기]가 보이고 그대로 막힌다
- AC-4612.3: Given 내 배경을 쓰는 안내문, When [테마 그림]을 누르면, Then `theme`이 null(저절로·그림 1)이 되고 테마 고르기와 그림 단추가 보인다. 내 배경을 쓰는 저장한 안내문을 열면 [내 배경]이 눌린 채 열린다
- AC-4612.4: Given 고른 내 배경, When 보면, Then "고른 배경: <말>"과 [이 배경 지우기]가 있고, 누르면 "이 배경을 지울까요? 이 배경을 쓴 다른 안내문은 저절로 고른 테마로 보여요"를 묻고 [확인]이면 지운 뒤 목록에서 빠지고 `theme`이 null이 된다. [취소]면 그대로고, 실패면 E-FORMS-BG-STORE-FAILED가 보인다
- AC-4612.5: Given 저장한 안내문의 `bg-<id>`가 읽은 목록에 없으면(지운 배경), When 열면, Then 미리보기는 저절로 고른 테마(그림 1)로 그리고 "고른 내 배경이 지워져 저절로 고른 테마로 보여요"가 보이며 뽑기는 막지 않는다

### REQ-4613: 규칙과 문서
- AC-4613.1: Given `docs/ADR.md`, When 보면, Then 'OpenAI'가 든 제목의 ADR-029가 한 번 있고, 본문에 2026-11-15 사용자 결정·`gpt-image-2.6-flare`·보내는 것(고정 프롬프트와 적은 말 30자까지, 개인정보 모양 거부)·보내지 않는 것(병원·환자·안내문 카드·사용자 정보)·`app/api/ai/forms/background`·`OPENAI_API_KEY`·하루 20장·약 80원·`ai_usage`·`form_backgrounds`·`form-backgrounds`·로그(오류 번호·경로만)·CSP를 바꾸지 않는 까닭이 있다
- AC-4613.2: Given `CLAUDE.md` 아키텍처 규칙, When 보면, Then ADR-029를 가리키는 줄이 하나(`- `로 시작, 'OpenAI'·`app/api/ai/forms/background`·'30자'·`OPENAI_API_KEY`가 듦)이고, ADR-028 줄은 여전히 하나다(`rules.test.ts`가 고치지 않은 채 통과)
- AC-4613.3: Given `docs/ARCHITECTURE.md`, When 보면, Then 디렉토리 구조에 `api/ai/forms/background`·`formBackgrounds.ts`가, 표 목록에 `form_backgrounds`·`ai_image_days`가, 그리고 Storage 버킷 `form-backgrounds`가 적혀 있다
- AC-4613.4: Given 오류 번호, When 보면, Then E-FORMS-BG-LIMIT·E-FORMS-BG-QUOTA·E-FORMS-BG-FAILED·E-FORMS-BG-STORE-FAILED 넷이 `ErrorCode`(`types/errors.ts`)와 `lib/errors.ts`에 있고 문구는 design.md 12절 표 그대로다
- AC-4613.5: Given `buildCsp`, When 보면, Then `img-src`는 `'self' data: blob:`, `connect-src`는 `'self'`와 Supabase origin(개발이면 `ws:`)뿐이고 `openai.com`은 어디에도 없다(`csp.test.ts`가 고치지 않은 채 통과)

## 범위 밖
- 테마 그림 3장 이상, 그림 1·2를 작은 그림으로 보여 주는 고르기, 테마 그림 직접 올리기·사진 올리기
- AI 배경을 환자 안내문(`form_guides`)에 쓰기, AI 배경 고쳐 그리기(일부 지우기·늘리기), 여러 장 한 번에 만들기
- 강조색을 사람이 직접 고르기, 반투명 판의 진하기 고르기
- 내 배경 이름 바꾸기, 다른 병원과 나누기, 30장 넘게 두기
- 오늘 남은 장 수 보여 주기(한도에 닿으면 알리기만 한다)
- 휴진 안내 문구 'E-FORMS-PRIVATE'·'E-AI-BUSY'의 단추 이름([정리하기]·[다시 분석])을 이 칸에 맞게 바꾸기 — 환자 안내문 그림 칸도 같은 문구라 따로 다룬다

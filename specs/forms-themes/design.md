# 설계: 휴진 안내 테마 다시 그리기·AI 배경 (forms-themes)

> 따르는 문서: `plan.md`, `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/ADR.md`(ADR-004·007·020·024·028, 새 ADR-029), `specs/forms`·`specs/forms-logo`(지금 휴진 안내), `specs/forms-guide`(같은 갈래 밑, 화면 틀).
> 승인 시안: `docs/mockups/forms-themes/`(그림 46장 `themes/`, AI 배경 합성 `ai-backgrounds.html`·`ai-samples/`, 화면 `screen.html`). 시험 프로그램은 2026-11-15 메인 세션 scratchpad의 `ai-bg/gen.mjs`(프롬프트 원문 — 4-1절에 그대로 옮김).

## 1. 바뀌는 곳 한눈에

| 자리 | 하는 일 | 층 |
|---|---|---|
| `public/poster/themes/*.svg` | 23장 바꿔 끼우고 `-2` 23장 더함(시안 바이트 그대로) | 자산 |
| `src/types/forms.ts` | `ThemeArt`·`ThemePick`, `ClosureNotice.theme`을 `ThemePick \| null`로 넓힘 | 타입 |
| `src/types/formBackground.ts` (새) | 내 배경 타입·한도 숫자 | 타입 |
| `src/lib/forms/themes.ts` | 고른 그림 값 풀기·바꾸기, 테마 그림 주소, 명암비, 대신 강조색 | 순수 함수 |
| `src/lib/forms/notice.ts` | `checkNotice`가 `isThemePick`으로 theme을 본다 | 순수 함수 |
| `src/components/forms/formsState.ts` | `theme` 상태·동작의 타입만 `ThemePick \| null`로(저장한 안내문을 불러올 때 타입이 맞게) | 순수 함수(타입만) |
| `src/lib/forms/accent.ts` (새) | 그림 점에서 강조색 뽑기·대비 맞추기 | 순수 함수 |
| `src/lib/forms/background.ts` (새) | 적은 말 검사, 프롬프트 글, JPEG base64 검사, 저장 줄 검사 | 순수 함수(서버·브라우저 공용) |
| `src/lib/forms/backgroundImage.ts` (새) | JPEG 바이트 → data: 주소·강조색·작은 그림 | 브라우저 |
| `src/lib/forms/png.ts` | 테마 주소에 `-2`, 첫 image가 JPEG data: 주소면 그대로, `base64` 내보냄 | 순수 + 브라우저 |
| `src/components/forms/Poster.tsx` | `art`·`background` 받기, 배경이면 흰 판·흰 빛 | 화면(그림 안) |
| `src/lib/ai/cost.ts` | 그림 값 `imageCostMicroUsd` | 순수 함수 |
| `src/lib/errors.ts`·`src/types/errors.ts` | 오류 번호 넷 | 공용 |
| `src/app/api/ai/openaiImage.ts` (새) | OpenAI 그림 부르기(fetch, SDK 없음) | 서버 |
| `src/app/api/ai/store.ts` | 하루 한도 `takeAiImage` | 서버 |
| `src/app/api/ai/forms/background/route.ts` (새) | `POST /api/ai/forms/background` | 서버(유일한 서버 폴더 안) |
| `supabase/migrations/20261115020000_form_backgrounds.sql` (새) | `form_backgrounds`·`ai_image_days`·`take_ai_image()`·Storage 버킷과 정책·`form_notices.theme` 제약 | DB |
| `src/lib/storage/formBackgrounds.ts` (새) | 내 배경 읽기·저장·지우기(표 + Storage) | 저장 |
| `src/components/forms/backgroundState.ts` (새) | '배경' 칸 상태(reducer)·끌어내는 값 | 순수 함수 |
| `src/components/forms/useBackgrounds.ts` (새) | 그 상태의 부르기·저장·내려받기(hook) | 화면 |
| `src/components/forms/ThemePicker.tsx` (새) | '배경' 칸(테마 그림 1·2 / 내 배경·AI 배경 만들기) | 화면 |
| `src/components/forms/NoticeEditor.tsx` | 테마 칸 자리에 `ThemePicker` | 화면 |
| `src/components/forms/FormsScreen.tsx` | hook 하나 부르고, 미리보기·인쇄 사본 `Poster`에 그림을 넘기고, 막힘을 뽑기 단추에 더함 | 화면 |
| `docs/ADR.md`·`CLAUDE.md`·`docs/ARCHITECTURE.md` | ADR-029, 예외 한 줄, 자리 | 문서 |

고치지 않는 것: `NoticeList.tsx`·`PreviewPanel.tsx`(forms-guide TASK-10이 `PreviewPanel`을 `poster: ReactNode`로 넓힌 뒤에 화면 TASK를 한다 — tasks.md 시작 조건), `lib/storage/formNotices.ts`(theme을 그대로 넘긴다), `layout.ts`, `lib/forms/ai.ts`, 환자 안내문 파일(`guide*`·`Guide*`), `lib/csp.ts`.

## 2. 고른 그림 값 (`form_notices.theme` 한 칸)

```ts
// src/types/forms.ts (더함·넓힘)
export type ThemeArt = 1 | 2
// null = 저절로·그림 1 · 'auto-2' = 저절로·그림 2 · '<열쇠>' · '<열쇠>-2' · 'bg-<내 배경 id(소문자 uuid)>'
export type ThemePick = ThemeId | `${ThemeId}-2` | 'auto-2' | `bg-${string}`
export type ClosureNotice = { year: number; month: number; cards: NoticeCard[]; theme: ThemePick | null }
```

`lib/forms/themes.ts`에 더하는 것:
```ts
export const BACKGROUND_FALLBACK_ACCENT = '#2f4a7a' // 흑백 그림의 대신 강조색(현충일 남색, 흰색 8.8:1)
export type Look = { kind: 'theme'; theme: ThemeId; art: ThemeArt } | { kind: 'background'; id: string }
export function isThemePick(value: unknown): value is ThemePick           // AC-4602.1, 내 배경은 /^bg-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export function lookOfPick(notice: Pickable & Pick<ClosureNotice, 'theme'>): Look // AC-4602.2
export function withArt(pick: ThemePick | null, art: ThemeArt): ThemePick | null  // 내 배경 값은 그대로
export function withTheme(pick: ThemePick | null, theme: ThemeId | null): ThemePick | null // 지금 그림 번호를 지킨다. 내 배경에서 오면 그림 1
export const backgroundPick = (id: string): ThemePick => `bg-${id}`
export function themeHref(theme: ThemeId, art: ThemeArt = 1): string        // '/poster/themes/m05.svg' · '/poster/themes/m05-2.svg'
export function contrastRatio(a: string, b: string): number                 // WCAG 명암비(contrastWithWhite와 같은 밝기 식)
```
- `themeInUse(notice)`는 `lookOfPick`이 테마면 그 열쇠, 내 배경이면 `autoTheme(notice)`(지금 시험 그대로)
- `checkNotice`(`notice.ts`)는 `isThemeId(theme)` 대신 `isThemePick(theme)`(AC-4602.4). 열쇠 넷은 그대로라 `formNotices.ts` 저장 몸통·읽기는 바뀌지 않는다
- `formsState.ts`의 `theme` 상태·`{ type: 'theme' }` 동작·`snapshotOf`는 타입만 `ThemePick | null`로 넓힌다(세 곳, 동작 그대로 — 저장한 안내문 `notice.theme`을 넣는 곳이 타입 오류가 나지 않게). 그림 번호·테마·내 배경 고르기는 모두 화면이 새 값을 계산해 이 동작 하나로 보낸다
- DB 제약은 `^[a-z0-9-]{1,32}$` → `^[a-z0-9-]{1,40}$`(`bg-` + uuid 36자 = 39자, 8-4절)

## 3. 테마 그림 46장

- 시안 `docs/mockups/forms-themes/themes/`의 46장을 `public/poster/themes/`에 그대로 옮긴다(23장은 같은 이름으로 덮어쓰고 `-2` 23장을 더한다). 다시 그리지 않는다
- 2026-11-15 잰 크기(LF): 가장 큰 m12.svg 50,860바이트 → 한도 60,000은 그대로 둔다. 시안 메모의 규칙 검사(46장 모두 `<text>`·`<script>`·`<foreignObject>`·`<image>`·`<style>`·`on…=` 없음, href·url() `#`만)도 다시 돌려 통과했다
- 강조색은 바뀌지 않는다(두 시안 `months.html`·`holidays.html`의 accent가 `themes.ts` 23개와 같다). `themes.test.ts` AC-3504.1(옛 `docs/mockups/forms/themes.html`과 견줌)은 그대로 통과한다
- `assets.test.ts`(AC-3504.5 묶음)를 46장으로 바꾼다: 폴더 목록 = 열쇠 23개 × (`.svg`, `-2.svg`), 견줄 시안 폴더 `docs/mockups/forms-themes/themes`, `<image>`·`<style>` 없음 검사를 더한다(AC-4601.1~4601.3)
- `Poster.tsx`의 테마 주소는 `themeHref(theme, art)`를 쓴다(그림 1은 지금과 같은 주소)

## 4. AI 배경 (서버)

### 4-1. 프롬프트 (`lib/forms/background.ts` `backgroundPrompt(words)`)
시험 프로그램의 글 그대로이고, `Theme:` 줄에 앞뒤 공백을 뗀 적은 말(한국어 그대로)을 넣는다. 줄은 `\n`으로 잇는다:

```text
Vertical background illustration for a Korean orthopedic clinic's monthly closed-days notice poster.
Theme: ${words}.
Style: bright, soft, professional editorial illustration with fine detail and gentle gradients; warm and friendly for elderly patients; high print quality.
Layout rules (very important):
- Decorations only along the top corners, the left and right edges, and the bottom edge.
- Keep a large, clean, very light and plain area in the center (about 70% of the width, from 12% to 85% of the height). Text will be placed there.
- Keep the bottom-center strip plain and light for a logo.
- Absolutely no text, letters, numbers, signs, logos, watermarks, frames with writing, or human faces.
```
- 시험은 영어 설명을 넣었지만(예 'Spring cherry blossoms: …') 화면에서는 사람이 적은 짧은 한국어 말이 들어간다. 줄바꿈·제어 문자는 경로가 먼저 막으므로 말이 새 줄을 만들 수 없다

### 4-2. 적은 말 (`lib/forms/background.ts`)
```ts
export function wordsOf(value: unknown): string | null   // 문자열이고 앞뒤 공백을 뗀 1~30자(Array.from 글자 수)면 뗀 글
export function wordsProblem(text: string): boolean      // memoProblem(text)(lib/forms/ai) || /[\t\n\r]/.test(text)
export function isJpegBase64(value: unknown, maxBytes = BG_IMAGE_MAX_BYTES): value is string
// /^\/9j\/[A-Za-z0-9+/]*={0,2}$/ · 길이 % 4 === 0 · 풀면 maxBytes 이하(⌊길이 × 3 / 4⌋ − '=' 수)
export function checkBackgroundRow(row: unknown): SavedBackground | null // 8-5절
```

### 4-3. OpenAI 부르기 (`app/api/ai/openaiImage.ts`, `import 'server-only'`)
```ts
export const IMAGE_MODEL = 'gpt-image-2.6-flare'
export const IMAGE_URL = 'https://api.openai.com/v1/images/generations'
export const IMAGE_TIMEOUT_MS = 50_000 // maxDuration 60초에서 로그인 확인·한도·사용량 몫을 남긴다
export type ImageCode = 'E-AI-BUSY' | 'E-FORMS-BG-QUOTA' | 'E-FORMS-BG-FAILED'
export type ImageResult =
  | { ok: true; jpeg: string; usage: { inputTokens: number; outputTokens: number } | null } // jpeg = base64 글
  | { ok: false; code: ImageCode }
export async function callImage(prompt: string, deps?: { fetchImpl?: typeof fetch; apiKey?: string; timeoutMs?: number }): Promise<ImageResult>
```
- 열쇠는 `deps.apiKey ?? process.env.OPENAI_API_KEY`. 없으면 부르지 않고 `E-FORMS-BG-FAILED`
- 몸통(정확히 일곱 열쇠): `{ model: IMAGE_MODEL, prompt, size: '1584x2240', quality: 'medium', n: 1, output_format: 'jpeg', output_compression: 88 }`. `user` 같은 식별 칸은 넣지 않는다. 머리는 `Authorization: Bearer …`·`Content-Type: application/json`, `signal: AbortSignal.timeout(timeoutMs)`
- 오류 나누기(위에서부터 처음 맞는 것):

| 답 | 번호 |
|---|---|
| fetch가 던짐(연결 끊김·시간 넘김) | `E-AI-BUSY` |
| 429이고 `error.code === 'insufficient_quota'` · 400이고 `error.code === 'billing_hard_limit_reached'` | `E-FORMS-BG-QUOTA` |
| 그 밖의 429 · 500~599 | `E-AI-BUSY` |
| 그 밖의 2xx 아닌 답(거절 `moderation_blocked` 등 400, 401 열쇠 틀림) | `E-FORMS-BG-FAILED` |
| 200인데 JSON이 아니거나 `data[0].b64_json`이 `isJpegBase64`를 못 넘음 | `E-FORMS-BG-FAILED` |

- 사용량: `usage.input_tokens`·`output_tokens`가 0 이상 정수면 그 값, 아니면 null
- 오류 내용·답 글자·열쇠는 결과·로그에 담지 않는다(이 파일은 console을 쓰지 않는다)

### 4-4. 경로 (`app/api/ai/forms/background/route.ts`)
흐름은 `forms/guide/picture/route.ts`와 같다(`runtime = 'nodejs'`, `maxDuration = 60`, Next 이름만 export):
1. 몸통 `{ text }` 하나, `wordsOf(text)`가 null이면 400(몸통 없음)
2. `readMe()` → 로그인 안 함 401, 승인 안 됨 403(몸통 없음), 그 밖의 던짐 `E-FORMS-BG-FAILED`
3. `wordsProblem(text)` → 422 `E-FORMS-PRIVATE`(한도를 세지 않는다)
4. `const supabase = await supabaseServer()` · `takeAiImage(supabase)` → `false`면 429 `E-FORMS-BG-LIMIT`, `'failed'`면 502 `E-FORMS-BG-FAILED`
5. `callImage(backgroundPrompt(words))` → 실패면 그 번호(`E-AI-BUSY` 503 · `E-FORMS-BG-QUOTA` 402 · `E-FORMS-BG-FAILED` 502)
6. 성공이면 `addUsage(supabase, { model: IMAGE_MODEL, inputTokens, outputTokens, costMicroUsd: imageCostMicroUsd(usage) })`(사용량이 null이면 토큰 0·값 60,000, 실패는 삼킨다)
7. 200 `{ image: jpeg }`, `Cache-Control: no-store`

`{ code }`로 답하는 곳은 모두 `console.error('[api/ai/forms/background]', code)` 한 줄(AC-4606.7). 답 크기는 그림 약 0.2~0.5MB의 base64(약 0.3~0.7MB)로 Vercel 답 한도(4.5MB) 안이다.

### 4-5. 하루 한도 부르기 (`app/api/ai/store.ts`)
```ts
// take_ai_image(): 오늘 한 장을 센다. true = 셌음, false = 한도, 'failed' = 오류·던짐·답이 불리언이 아님
export async function takeAiImage(supabase: SupabaseClient): Promise<boolean | 'failed'>
```

## 5. 강조색과 작은 그림

### 5-1. `lib/forms/accent.ts` (순수, 16진수 색 글자를 쓰지 않는다 — 대신 색은 `themes.ts`)
```ts
export const ACCENT_SAMPLE = { width: 40, height: 57 } as const
export function panelColor(pixels: Uint8ClampedArray, width: number, height: number): string // 'N월' 자리(x 30~70%·y 10~19%) 평균 RGB × 0.45 + 흰색 × 0.55
export function pickAccent(pixels: Uint8ClampedArray, width: number, height: number): string
```
1. 장식 구역 = 가운데 사각형(x 10~90%·y 10~80%) 밖의 점(알파 0인 점은 뺀다)
2. 점마다 HSL. 채도 ≥ 0.25이고 밝기 0.12~0.88이면 색 있는 점. 색상 15°마다 24칸에 채도를 더하고 RGB를 모은다
3. 색 있는 점이 장식 구역 점의 2% 이상이면 채도 합이 가장 큰 칸(같으면 색상이 작은 칸)의 평균 RGB, 아니면 `BACKGROUND_FALLBACK_ACCENT`
4. 그 색의 HSL 밝기를 0.02씩 내리며 `contrastRatio(색, '#ffffff' 대신 흰색) ≥ 4.5`이고 `contrastRatio(색, panelColor) ≥ 3`이면 멈춘다. 밝기 0.10이 바닥이다(그 밝기면 판 색이 가장 어두울 때(흰 55% + 검정)도 3.8 이상, 흰색과 14 이상)
5. 결과는 `#` + 소문자 6자리(반올림). 같은 입력이면 같은 결과

흰색 문자열이 필요하면 `themes.ts`가 내보내는 값(`contrastWithWhite`)을 쓴다 — `accent.ts`에는 색 글자를 두지 않는다(`src/app/theme.test.ts` AC-202.3이 그대로 통과).

판 색을 쓰는 까닭: 'N월'(132px)은 흰 판 위에 그려진다. 판은 흰색 55%라 그림 가운데가 어두우면 판도 어두워진다. 강조색을 그 판과 견주면 어떤 그림에서도 'N월'이 읽힌다. 날짜 띠의 흰 글자(28~33px 700)는 4.5로 본다.

### 5-2. `lib/forms/backgroundImage.ts` (브라우저)
```ts
export function base64ToBytes(text: string): Uint8Array
export function jpegDataUrl(bytes: Uint8Array): string // 'data:image/jpeg;base64,' + base64(bytes) — base64는 png.ts가 내보낸다
export async function readBackground(bytes: Uint8Array): Promise<{ image: string; accent: string; thumb: string } | null>
```
- FF D8 FF가 아니면 null. `createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }))`로 푼다(Blob이라 canvas가 더럽혀지지 않는다)
- canvas 40×57에 그려 `getImageData` → `pickAccent`
- canvas 120×170(`BG_THUMB_SIZE`)에 그려 `toBlob('image/jpeg', 0.7)` → base64가 16,000자(`BG_THUMB_MAX`)를 넘으면 0.5로 한 번 더, 그래도 넘으면 null
- 무엇이든 던지면 null(로그 없음). `bitmap.close()`

## 6. 안내문 그림 (`components/forms/Poster.tsx`)

```tsx
<Poster notice={notice} theme={theme} art={art} background={background} />
// art?: ThemeArt (기본 1) · background?: { image: string; accent: string } | null (기본 null)
```
- 배경을 쓰는 조건: `background.image.startsWith('data:image/jpeg;base64,')`이고 `background.accent`가 `/^#[0-9a-f]{6}$/`. 아니면 배경이 없는 것처럼 테마로 그린다(AC-4603.3)
- 테마: 첫 image href = `themeHref(theme, art)`. 그 밖은 지금 그대로(흰 판·필터 더하지 않음, AC-4603.4)
- 배경: 차례 style → defs(그림자 필터 + 흐림 필터 `poster-soft-<useId>`: `x="-10%" y="-10%" width="120%" height="120%"`, `<feGaussianBlur stdDeviation="18">`) → `<image href={image} x="0" y="0" width="794" height="1123" preserveAspectRatio="xMidYMid slice">` → 흰 판 `<rect x="64" y="70" width="666" height="770" rx="40" fill="#fff" fill-opacity=".55" filter="url(#soft)">` → 로고 뒤 흰 빛 `<ellipse cx="397" cy="1040" rx="210" ry="46" fill="#fff" fill-opacity=".7" filter="url(#soft)">` → 글자·카드(강조색 = `background.accent`) → 로고. 값은 시안 `ai-backgrounds.html` 그대로(로고 가운데 y = 1011 + 58/2 = 1040)
- 흰색은 이 파일의 `WHITE`를 쓴다(새 색 없음, `rgb(`도 늘지 않는다)

## 7. 그림 파일 (`lib/forms/png.ts`)
- `THEME_PATH = /^\/poster\/themes\/([a-z0-9]+(?:-2)?)\.svg$/`, `THEME_HREF`도 `[a-z0-9]+(?:-2)?`(AC-4604.1)
- `downloadPng`(휴진 안내 쪽): 첫 image href가 `THEME_PATH`면 지금처럼 읽고, `data:image/jpeg;base64,`로 시작하면 테마를 읽지 않는다(`theme` 없이 `svgForImage`), 둘 다 아니면 false(AC-4604.2). 바뀐 글에 `/poster/`가 남으면 false는 그대로
- `base64(bytes)`를 export한다(`backgroundImage.ts`가 쓴다). 나머지 흐름·크기(1588×2246)는 그대로

## 8. 저장

### 8-1. migration (`supabase/migrations/20261115020000_form_backgrounds.sql`)
먼저 `20261028000000_auth.sql`·`20261110000000_form_notices.sql`이 들어가 있어야 한다. 사용자가 SQL Editor에 한 번 붙인다(Storage 버킷까지 이 파일이 만든다).
```sql
-- my_hospital_id(): 다른 migration과 글자까지 같은 C1 정의를 맨 위에 둔다

-- (1) 고른 그림 값 'bg-<uuid>'(39자)가 들어가게 (AC-4608.5)
alter table public.form_notices drop constraint form_notices_theme_check;
alter table public.form_notices add constraint form_notices_theme_check check (theme ~ '^[a-z0-9-]{1,40}$');

-- (2) 내 배경 (AC-4608.1~4608.3)
create table public.form_backgrounds (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  words text not null check (char_length(words) between 1 and 30 and words !~ '[[:cntrl:]]'),
  accent text not null check (accent ~ '^#[0-9a-f]{6}$'),
  thumb text not null check (char_length(thumb) <= 16000 and thumb ~ '^/9j/[A-Za-z0-9+/]*={0,2}$'),
  path text generated always as (hospital_id::text || '/' || id::text || '.jpg') stored,
  created_at timestamptz not null default now()
);
alter table public.form_backgrounds enable row level security;
revoke all on table public.form_backgrounds from public, anon, authenticated;
grant select, delete on table public.form_backgrounds to authenticated;
grant insert (words, accent, thumb) on table public.form_backgrounds to authenticated;
-- 정책 셋(select·insert·delete): hospital_id = (select public.my_hospital_id()). 고치기 정책·권한 없음

-- (3) 하루 한도 (AC-4607.1·4607.2)
create table public.ai_image_days (
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  day date not null,
  images integer not null default 0 check (images between 0 and 20),
  primary key (hospital_id, day)
);
alter table public.ai_image_days enable row level security;
revoke all on table public.ai_image_days from public, anon, authenticated; -- 정책도 권한도 주지 않는다

create function public.take_ai_image() returns boolean language plpgsql security definer set search_path = '' as $$
declare v_hospital uuid; v_images integer;
begin
  select h.id into v_hospital from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved';
  if v_hospital is null then raise exception 'hospital not approved' using errcode = '42501'; end if;
  insert into public.ai_image_days as d (hospital_id, day, images)
    values (v_hospital, (now() at time zone 'Asia/Seoul')::date, 1)
    on conflict (hospital_id, day) do update set images = d.images + 1 where d.images < 20
    returning d.images into v_images;
  return v_images is not null;
end $$;
revoke all on function public.take_ai_image() from public, anon, authenticated;
grant execute on function public.take_ai_image() to authenticated;

-- (4) 그림 저장소 (AC-4608.4)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('form-backgrounds', 'form-backgrounds', false, 3000000, array['image/jpeg'])
  on conflict (id) do update set public = false, file_size_limit = 3000000, allowed_mime_types = array['image/jpeg'];
create policy "내 병원 배경 그림 읽기" on storage.objects for select to authenticated
  using (bucket_id = 'form-backgrounds' and (storage.foldername(name))[1] = (select public.my_hospital_id())::text);
create policy "내 병원 배경 그림 올리기" on storage.objects for insert to authenticated
  with check (bucket_id = 'form-backgrounds' and (storage.foldername(name))[1] = (select public.my_hospital_id())::text
              and exists (select 1 from public.form_backgrounds b where b.path = name));
create policy "내 병원 배경 그림 지우기" on storage.objects for delete to authenticated
  using (bucket_id = 'form-backgrounds' and (storage.foldername(name))[1] = (select public.my_hospital_id())::text);
```
- `storage.objects`의 RLS·권한은 Supabase가 이미 갖춘 것이라 이 파일은 정책만 더한다(`alter table storage.objects`를 쓰지 않는다 — SQL Editor 역할은 그 표의 주인이 아니다)
- 올리기 정책의 `exists`는 `form_backgrounds` RLS 안에서 돈다 → 내 병원 줄의 path만 맞는다. 그래서 순서는 '줄 넣기 → 그 path로 올리기'다
- 시험: `supabase/formBackgrounds.rls.test.ts` — `formGuides.rls.test.ts`와 같은 PGlite 방법. Supabase가 갖춘 것 흉내에 `storage` 스키마를 더한다: `storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[])`, `storage.objects(id uuid default gen_random_uuid() primary key, bucket_id text references storage.buckets, name text not null, owner uuid default auth.uid(), created_at timestamptz default now())` + RLS 켬 + anon·authenticated에 select·insert·update·delete, `storage.foldername(name text) returns text[]`(마지막 조각을 뺀 '/' 조각들, Supabase 정의와 같은 뜻). auth·form_notices migration을 먼저 돌린다

### 8-2. 표에 두는 것과 두지 않는 것
- 둔다: 적은 말(`words`, 목록 이름 — 화면이 보내기 전과 저장 전에 개인정보 모양을 거른다), 강조색, 작은 그림(120×170 JPEG base64, 약 6~12KB)
- 두지 않는다: 큰 그림(Storage에만), 프롬프트 글, OpenAI 답의 다른 칸, 사용량(`ai_usage`에만)

### 8-3. 브라우저 저장 (`lib/storage/formBackgrounds.ts`)
```ts
const TABLE = 'form_backgrounds'; const BUCKET = 'form-backgrounds'
const COLUMNS = 'id, words, accent, thumb, path, created_at'
export async function listBackgrounds(): Promise<SavedBackground[] | 'failed'> // order created_at desc, limit MAX_BACKGROUNDS
export async function saveBackground(b: { words: string; accent: string; thumb: string; image: Uint8Array }): Promise<SavedBackground | 'failed'>
export async function readBackgroundImage(b: SavedBackground): Promise<Uint8Array | null>
export async function deleteBackground(b: SavedBackground): Promise<boolean>
```
- 저장: `wordsOf`·`!wordsProblem`·강조색 모양·`isJpegBase64(thumb, …)`·그림 FF D8 FF를 먼저 본다(못 넘으면 보내지 않고 'failed') → `insert({ words, accent, thumb }).select(COLUMNS).single()` → `checkBackgroundRow` → `storage.from(BUCKET).upload(path, new Blob([image], { type: 'image/jpeg' }), { contentType: 'image/jpeg', upsert: false })` → 오류면 `delete().eq('id', id)` 하고 'failed'
- 읽기: `storage.from(BUCKET).download(path)` → `arrayBuffer` → FF D8 FF면 바이트
- 지우기: `storage.from(BUCKET).remove([path])` 오류면 false → `from(TABLE).delete().eq('id', id)` 오류면 false. 없는 그림을 지워도 오류가 없으면 줄을 지운다(다시 눌러 마저 지울 수 있다)
- 오류 내용은 버린다(`formNotices.ts`와 같다)

### 8-4. `form_notices` 칸 넓히기
`theme` 제약만 40자로 넓힌다. 칸 권한(`insert/update (year, month, cards, theme)`)·정책·트리거는 그대로다. 지금 저장된 줄(null·테마 열쇠)은 새 제약도 넘는다.

### 8-5. 타입 (`src/types/formBackground.ts`)
```ts
export const MAX_BG_WORDS = 30
export const BG_PER_DAY = 20          // migration take_ai_image의 20과 같다(AC-4607.3 시험이 둘을 견준다)
export const MAX_BACKGROUNDS = 30
export const BG_IMAGE_MAX_BYTES = 3_000_000
export const BG_THUMB_MAX = 16_000     // 작은 그림 base64 글자 수
export const BG_THUMB_SIZE = { width: 120, height: 170 } as const
export type SavedBackground = { id: string; words: string; accent: string; thumb: string; path: string; createdAt: string }
export type BackgroundLook = { image: string; accent: string } // image = 'data:image/jpeg;base64,…'
```
`checkBackgroundRow(row)`: 열쇠 `id`(소문자 uuid)·`words`(`wordsOf`가 같은 글을 돌려주고 `wordsProblem` 거짓)·`accent`(`/^#[0-9a-f]{6}$/`)·`thumb`(`isJpegBase64`, 16,000자 이하)·`path`(`<uuid>/<id>.jpg`)·`created_at`(빈 글 아님) → `SavedBackground`, 하나라도 어긋나면 null.

## 9. 사용량·값·한도
- 값(`lib/ai/cost.ts`): `export const IMAGE_PRICE: Price = { input: 5, output: 30 }`, `export const IMAGE_COST_GUESS = 60_000`, `export function imageCostMicroUsd(u: { inputTokens: number; outputTokens: number } | null): number`. 2026-11-15 시험(출력 1,868토큰·$0.057)과 OpenAI 표(출력 $30/백만)에서 맞춘 값이다. `PRICES`에 넣지 않는다 — 넣으면 '모르는 모델은 가장 비싼 단가' 규칙(AC-509.2)이 Claude 값까지 바꾼다
- 기록: 지금 `ai_usage` 달 합계에 `add_ai_usage`로 더한다(부름 수 +1, 토큰, 값). AI 리포트 화면의 사용량에 함께 보인다
- 한도: 병원마다 하루 20장(`take_ai_image`, 보내기 전에 센다). OpenAI 계정의 달 한도는 OpenAI 관리 화면에서 사용자가 정한다(넘으면 `E-FORMS-BG-QUOTA`)
- 한 달 가장 많이 써도 20장 × 30일 × 약 80원 = 약 48,000원

## 10. 화면 (`components/forms`, 시안 `screen.html`)

### 10-1. 상태 (`backgroundState.ts`, 순수)
```ts
export type BgCode = 'E-FORMS-PRIVATE' | 'E-FORMS-BG-LIMIT' | 'E-FORMS-BG-QUOTA' | 'E-FORMS-BG-FAILED' | 'E-AI-BUSY'
export type Trial = { words: string; bytes: Uint8Array; image: string; accent: string; thumb: string } // 만든 배경(저장 전)
export type BgList = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ok'; items: SavedBackground[] } | { kind: 'failed' }
export type BgImage = { kind: 'loading' } | { kind: 'ok'; image: string } | { kind: 'failed' }
export type BgState = {
  mode: 'theme' | 'mine'; words: string; making: boolean; makeError: BgCode | null; trial: Trial | null
  saving: boolean; deleting: boolean; storeError: boolean; list: BgList; images: Readonly<Record<string, BgImage>>
}
// 동작: mode · words · makeStart · makeDone(trial) · makeFailed(code) · discard · saveStart · saved(item, image) · storeFailed ·
//       listLoading · listLoaded(result) · imageLoading(id) · imageLoaded(id, image | null) · deleteStart · deleted(id)
export function initialBgState(): BgState
export function bgReducer(state: BgState, action: BgAction): BgState
export function shownMode(state: BgState, pick: ThemePick | null): 'theme' | 'mine' // 내 배경 값이면 늘 'mine'
export function bgAnswerOf(status: number, body: unknown): { kind: 'ok'; jpeg: string } | { kind: 'error'; code: BgCode }
// 200이고 { image }가 isJpegBase64 → ok. 200 밖이고 { code }가 BgCode 다섯 중 하나 → 그 번호. 그 밖(400·401·403·504·모양 틀림)은 E-FORMS-BG-FAILED
export type PosterLook = {
  theme: ThemeId; art: ThemeArt; background: BackgroundLook | null
  blocked: boolean // [저장]·[인쇄·PDF]·[그림 파일]을 막는다
  note: 'trial' | 'loading' | 'failed' | 'missing' | null
}
export function posterLook(notice: ClosureNotice, state: BgState): PosterLook
export function canSaveTrial(state: BgState): boolean // 만든 배경이 있고, 저장 중이 아니고, 목록이 ok이며 MAX_BACKGROUNDS 밑
export function isFull(state: BgState): boolean       // 목록이 ok이고 MAX_BACKGROUNDS 장
```
`posterLook` 표(위에서부터):

| 조건 | 그림 | blocked | note |
|---|---|---|---|
| 보이는 칸이 'mine'이고 만든 배경이 있음 | 만든 배경·뽑은 강조색 | 참 | trial |
| 값이 테마(`lookOfPick`) | 그 테마·그림 번호 | 거짓 | null |
| 내 배경인데 목록이 아직(idle·loading) | 저절로 테마·그림 1 | 참 | loading |
| 내 배경인데 목록 실패 | 저절로 테마 | 참 | failed |
| 내 배경인데 목록에 없음 | 저절로 테마·그림 1 | 거짓 | missing |
| 그림 내려받는 중·아직 | 저절로 테마 | 참 | loading |
| 그림 내려받기 실패 | 저절로 테마 | 참 | failed |
| 그림 있음 | 그 그림·저장한 강조색 | 거짓 | null |

- 만든 배경은 안내문과 따로다: 저장하거나 [안 쓰기]를 누를 때까지 남는다(다른 안내문을 열어도). '테마 그림' 칸이 보이는 동안에는 미리보기에 얹지 않는다
- `saved(item, image)`: 목록 맨 위에 넣고(목록이 ok일 때만), `images[item.id] = ok`, `trial = null`, `mode = 'mine'`
- `deleted(id)`: 목록에서 빼고 `images`에서 지운다

### 10-2. hook (`useBackgrounds.ts`)
```ts
export function useBackgrounds(pick: ThemePick | null, onPick: (pick: ThemePick | null) => void): Backgrounds
export type Backgrounds = {
  state: BgState; mode: 'theme' | 'mine'; look: (notice: ClosureNotice) => PosterLook
  setMode(mode: 'theme' | 'mine'): void      // 'theme'이고 지금 값이 내 배경이면 onPick(null)
  setWords(text: string): void               // 30자까지 자른다
  make(): Promise<void>                      // 4-2 검사(못 넘으면 보내지 않고 E-FORMS-PRIVATE) → fetch → bgAnswerOf → base64ToBytes → readBackground(null이면 E-FORMS-BG-FAILED) → makeDone
  remake(): Promise<void>                    // trial.words로 make
  saveTrial(): Promise<void>                 // saveBackground → saved → onPick(backgroundPick(id))
  discard(): void
  retry(): void                              // 목록 실패면 다시 읽기, 그림 실패면 다시 내려받기
  remove(item: SavedBackground): Promise<void> // 확인 → deleteBackground → deleted → 지금 값이 그것이면 onPick(null)
}
```
- 부르기는 휴진 안내 `askTidy`와 같은 모양: `POST /api/ai/forms/background`, 몸통 `{ text }`, `redirect: 'manual'`, `cache: 'no-store'`, 던지면 E-AI-BUSY, JSON이 아니면 null로 읽어 `bgAnswerOf`가 가른다. 사라진 뒤 온 답은 버린다(번호 세기, 휴진 안내와 같은 방법). 같은 틀 안에서 두 번 눌러도 한 번만 보낸다
- 목록은 보이는 칸이 'mine'이 될 때 `list.kind === 'idle'`이면 한 번 읽는다(서식 화면을 열 때는 읽지 않는다 — 작은 그림 30장 몫을 아낀다)
- 값이 내 배경이고 목록에 그 줄이 있고 `images[id]`가 없으면 한 번 내려받는다(`readBackgroundImage` → `jpegDataUrl`)
- 확인 창 글: "이 배경을 지울까요? 이 배경을 쓴 다른 안내문은 저절로 고른 테마로 보여요"

### 10-3. `ThemePicker.tsx`
```tsx
<ThemePicker pick={state.theme} autoName={autoName} bg={bg} onPick={onTheme} />
```
- 앱 화면 색·글자는 토큰과 `ds`만 쓴다(작은 그림은 `<img src="data:image/jpeg;base64,…" alt="">`). 묶음 단추는 `ds.segment`(`aria-pressed`)
- '테마' 고르기의 값: 테마 열쇠 또는 'auto'. 바꾸면 `onPick(withTheme(pick, value === 'auto' ? null : value))`. [그림 n]은 `onPick(withArt(pick, n))`
- 내 배경 단추는 `aria-pressed`(고른 것), 읽는 이름 '<말> 배경'

글귀(시안과 requirements.md 그대로):

| 자리 | 글 |
|---|---|
| 칸 제목 / 묶음 | '배경' / '배경 종류': [테마 그림] [내 배경] |
| 테마 그림 칸 | '테마'(고르기, 지금 그대로) · '그림'(묶음 이름도 '그림'): [그림 1] [그림 2] · 도움말 "카드 이름에 공휴일 이름이 있으면 그 공휴일, 없으면 안내 달의 그림이 저절로 골라져요" |
| 만들기 | 'AI 배경 만들기' · 자리 글 "예) 봄 벚꽃" · 'n/30' · [AI로 배경 만들기](기다리는 동안 '만드는 중…') |
| 늘 보이는 안내 | "적은 말만 OpenAI 그림 AI로 보내요. 전화번호·주민번호·메일 주소는 적지 마세요. 한 장에 10초쯤 걸리고 약 80원이 들어요(하루 20장까지)" |
| 만드는 중 | "그림을 만드는 중이에요. 10초쯤 걸려요" |
| 만든 배경 | '만든 배경: <말>' · "미리보기에 얹어 보았어요. 저장해야 이 안내문에 쓰고 뽑을 수 있어요" · [내 배경으로 저장](저장하는 동안 '저장하는 중…') [다시 만들기] [안 쓰기] |
| 가득 참 | "내 배경은 30장까지예요. 안 쓰는 배경을 지워 주세요" |
| 목록 | '내 배경' · 'n/30장' · "아직 저장한 배경이 없어요" · "내 배경을 읽는 중…" · [다시 읽기] |
| 고른 배경 | "고른 배경: <말>" · [이 배경 지우기] |
| 그림 상태 | "내 배경을 불러오는 중…" · "고른 내 배경이 지워져 저절로 고른 테마로 보여요" |

### 10-4. `NoticeEditor.tsx`·`FormsScreen.tsx`
- `NoticeEditor`: 테마 `<div className={ds.field}>…</div>` 묶음을 `<ThemePicker …/>`로 바꾸고, 받는 값에 `bg: Backgrounds`를 더한다. 테마 고르기 칸의 id·이름('테마')·옵션 24개·도움말은 그대로 옮긴다(AC-4610.3)
- `FormsScreen`(forms-guide TASK-10이 합쳐진 판 위에서):
  - `const bg = useBackgrounds(state.theme, (pick) => dispatch({ type: 'theme', theme: pick }))`
  - `const look = bg.look(preview)` → 미리보기와 인쇄 사본 둘 다 `<Poster notice={preview} theme={look.theme} art={look.art} background={look.background} />`
  - 뽑기·저장 단추의 `ready`는 `readyNotice(state) !== null && !look.blocked`. 저장·인쇄·그림 파일 함수 안의 검사도 같은 값을 쓴다
  - `NoticeEditor`에 `bg`를 넘긴다
  - 그 밖(목록·저장·지우기·인쇄 쪽 크기·도구 단추)은 그대로

## 11. CSP (바꾸지 않는다, AC-4613.5)
| 무엇을 | 어디서 | 지금 CSP |
|---|---|---|
| AI 그림 | 우리 서버 답 JSON(`fetch('/api/ai/forms/background')`) | `connect-src 'self'` |
| 내 배경 그림 올리기·내려받기 | supabase-js → `https://<프로젝트>.supabase.co/storage/v1/…` | `connect-src`의 Supabase origin(이미 있음) |
| 그림 보이기 | `data:image/jpeg;base64,…`(안내문 `<image>`·작은 그림 `<img>`) | `img-src 'self' data: blob:` |
| 그림 파일(PNG) | SVG 글 → blob: → canvas | `img-src blob:` |

OpenAI는 서버만 부른다. 그래서 브라우저 CSP에 `api.openai.com`을 더하지 않는다. Storage를 서명 주소(https)로 `<img>`에 바로 걸면 `img-src`에 Supabase origin을 더해야 하고 PNG 만들기에서 다시 읽어야 해서, 내려받아 data: 주소로 그리는 쪽을 골랐다.

## 12. 오류 번호 (`lib/errors.ts`, AC-4613.4)
| 번호 | 무엇이 | 어떻게 고치나 | 답 |
|---|---|---|---|
| `E-FORMS-BG-LIMIT` | 오늘 만들 수 있는 AI 배경을 다 만들었어요 | 하루 20장까지예요. 저장한 내 배경을 고르거나 내일 다시 만들어 주세요 | 429 |
| `E-FORMS-BG-QUOTA` | OpenAI 그림 사용 한도에 닿았어요 | OpenAI 관리 화면에서 결제 한도를 늘리거나 다음 달에 다시 해 주세요 | 402 |
| `E-FORMS-BG-FAILED` | AI 배경을 만들지 못했어요 | 적은 말을 바꾸거나 다시 눌러 주세요. 계속되면 오류 번호와 함께 문의해 주세요 | 502 |
| `E-FORMS-BG-STORE-FAILED` | 내 배경을 저장하거나 읽지 못했어요 | 인터넷 연결을 확인하고 다시 눌러 주세요. 만든 배경은 그대로 남아 있어요 | (화면만) |

`E-FORMS-PRIVATE`(422)와 `E-AI-BUSY`(503)는 지금 문구를 그대로 쓴다.

## 13. 정한 것과 까닭
- **고른 그림을 `theme` 한 칸에**: 새 칸(`art`·`background_id`)을 두면 `ClosureNotice` 열쇠가 늘어 `checkNotice`·저장 몸통·승인된 시험 수십 곳의 기대가 바뀐다. 한 칸의 글 모양으로 두면 지금 값(null·열쇠 23개)이 그대로 뜻이 맞고(그림 1), 저장 코드는 바뀌지 않는다. 대신 내 배경을 지워도 DB가 알려 주지 않는다(외래 키 없음) → 화면이 '지워져 저절로 테마로 보여요'로 알리고 그 테마로 뽑는다
- **저절로 + 그림 2 = `auto-2`**: 저절로를 고른 채 그림 2만 바꾸고 싶을 때, 테마를 고정하지 않고(카드가 바뀌면 테마가 따라가게) 그림 번호만 남긴다
- **테마를 바꿔도 그림 번호 유지**: "그림 2가 좋다"는 고르기를 테마마다 다시 누르지 않게
- **배경은 브라우저가 저장**: 서버가 만든 그림을 바로 Storage에 두면 마음에 안 든 그림까지 쌓인다. 사용자가 [내 배경으로 저장]을 누른 것만 브라우저 Supabase(RLS)로 올린다(서버는 service role 키가 없다, CLAUDE.md)
- **올리기 정책이 표 줄을 요구**: 내 병원 폴더 안이라도 표에 없는 파일은 올리지 못한다 → 목록에 안 보이는 파일이 쌓이지 않는다
- **작은 그림을 표에**: 목록 30장마다 큰 그림(0.2~0.5MB)을 내려받으면 몇 MB다. 작은 그림 base64(약 10KB)를 표에 두면 목록은 한 번 읽기로 끝난다
- **강조색은 앱이**: AI에게 색을 말로 받으면 그림과 어긋날 수 있다. 그림 가장자리에서 가장 많이 쓰인 색을 뽑고 대비를 맞추면 어떤 그림이 와도 글자가 읽힌다. 흰 글자 4.5(지금 테마의 3보다 엄격)는 어르신 눈을 위해서다
- **반투명 판**: 시안 값 그대로(흰 55% 흐림). 그림 가운데를 조금 흐리게 하지만, 프롬프트가 가운데를 비우라고 하므로 대부분 그림이 거의 그대로 보인다
- **하루 20장은 보내기 전에 셈**: 보내고 나서 세면 동시에 누를 때 넘친다. OpenAI가 실패해도 한 장으로 세는 손해는 작다(하루 20장)
- **SDK 없이 fetch**: 부르는 곳이 하나이고 답 모양이 단순하다. 꾸러미를 더하지 않는다
- **값은 토큰으로**: OpenAI는 이 모델의 장당 값을 밝히지 않았다. 시험 사용량이 토큰 단가(입력 5·출력 30)로 $0.057과 맞는다. 답에 사용량이 없을 때만 한 장 60,000(약 $0.06, 조금 넉넉히)으로 센다
- **만든 배경이 보이는 동안 뽑기를 막음**: 미리보기는 만든 배경인데 [저장]은 고른 값을 저장하면 서로 다르다. PreviewPanel의 단추는 `ready` 하나로 함께 막히므로, '저장해야 쓴다'로 한 길을 둔다
- **목록은 [내 배경]을 누를 때 읽음**: 서식 화면을 열 때마다 작은 그림을 읽지 않는다. 지금 서식 화면 시험도 그대로 맞는다
- **오류 번호 넷만 새로**: 개인정보·바쁨은 지금 번호를 쓰고, OpenAI 한도(Anthropic 콘솔을 말하는 E-AI-LIMIT와 다름)·하루 한도·배경 저장만 새로 둔다

## 14. 위험
- **AI 그림에 글자·숫자 비슷한 무늬가 섞일 수 있다**: 프롬프트가 막지만 완전하지 않다 → 사람이 미리보기로 보고 [다시 만들기]. 인쇄 전 미리보기가 늘 보인다
- **값**: 한 장 약 80원, 하루 20장이면 1,600원. 지나친 시험 누르기는 하루 한도가 막는다. OpenAI 관리 화면에서 달 한도를 정해 두기를 사용자 단계에 적는다
- **느림(7초 넘게)**: 기다리는 동안 '만드는 중…'과 안내 글을 보인다. 50초가 넘으면 서버가 끊고 E-AI-BUSY(maxDuration 60초 안)
- **사용자 경로 시간 넘김**: Vercel이 60초에 끊으면(504) 몸통이 JSON이 아니라 E-FORMS-BG-FAILED로 보인다. 하루 한도는 한 장 세어졌다
- **짧은 한국어 말**: 시험은 자세한 영어 설명이었다. '봄'처럼 짧으면 그림이 단순할 수 있다 → 화면 확인 TASK에서 실제 말 3개로 다시 시험한다(사용자가 SQL을 붙인 뒤)
- **적은 말이 병원 밖으로 간다**: OpenAI 서버로 간다(ADR-029). 30자·개인정보 모양 거부·늘 보이는 안내로 줄인다. 환자 이름 모양은 못 거른다
- **적은 말 안의 지시**: '글자를 크게 넣어'처럼 적으면 프롬프트 규칙과 부딪힌다. 결과는 그 병원 안내문뿐이고, 사람이 보고 다시 만든다
- **강조색이 그림과 안 어울릴 때**: 장식 색이 여러 가지면 가장 많은 색 하나만 쓴다. 범위 밖(사람이 고르기)으로 둔다
- **지운 배경을 쓴 안내문**: 외래 키가 없어 DB에 `bg-<id>`가 남는다 → 열면 저절로 테마로 보이고 알린다
- **Storage와 표가 어긋남**: 올리기 실패면 줄을 지운다. 그 지우기도 실패하면 그림 없는 줄이 남는다 → 목록에서 고르면 내려받기 실패(E-FORMS-BG-STORE-FAILED)로 보이고 [이 배경 지우기]로 치울 수 있다
- **base64 안에 '/poster/'**: 그림 파일 검사(`/poster/`가 남으면 false)가 우연히 걸릴 수 있으나 8글자가 맞을 확률은 무시할 만큼 작다
- **forms-guide 화면과 합치기**: `FormsScreen`·`NoticeEditor`를 고친다. forms-guide TASK-10을 먼저 합친 뒤 화면 TASK를 해 충돌을 피한다(tasks.md)

## 15. 기존 명세·시험과의 관계
바꾸는 기존 기대:
- `src/lib/forms/assets.test.ts` AC-3504.5 묶음: 폴더 목록 23 → 46(`-2` 더함), 견줄 시안 폴더 `docs/mockups/forms/themes` → `docs/mockups/forms-themes/themes`, `<image>`·`<style>` 없음 검사 더함. 60,000바이트 한도는 그대로
- `src/lib/errors.test.ts`: `ALL_CODES`에 네 번호를 더한다. AC-3507.5('이 명세가 더하는 E-FORMS- 번호는 표의 다섯뿐이다')의 거르는 조건에 `&& !code.startsWith('E-FORMS-BG-')`를 더한다(네 번호를 넣으면 반드시 깨지는 줄이다. 같은 파일의 `E-PATIENTS-` 검사와 같은 꼴, 뜻은 그대로)

기대는 그대로 두고 시험만 더하는 것: `src/lib/forms/themes.test.ts`, `src/lib/forms/notice.test.ts`, `src/lib/ai/cost.test.ts`, `src/app/api/ai/store.test.ts`

새 시험 파일에 두는 것(AC가 '고치지 않은 채'라고 한 파일은 열지 않는다): 안내문 그림 `src/components/forms/PosterBackground.test.tsx`, 그림 파일 `src/lib/forms/pngBackground.test.ts`, 서식 화면 `src/components/forms/ThemePicker.test.tsx`(`FormsScreen`을 그려 본다)

고치지 않은 채 통과해야 하는 것: `src/lib/forms/rules.test.ts`(새 파일 포함), `src/app/theme.test.ts`(16진수 색은 `themes.ts`·`Poster.tsx`에만), `src/components/forms/Poster.test.tsx`, `src/lib/forms/png.test.ts`, `src/components/forms/FormsScreen.test.tsx`, `src/lib/csp.test.ts`, `src/components/forms/formsState.test.ts`, `src/lib/storage/formNotices.test.ts`, `supabase/formNotices.rls.test.ts`, `supabase/formGuides.rls.test.ts`, `src/lib/forms/layout.test.ts`, `src/lib/forms/ai.test.ts`, `src/app/api/ai/forms/route.test.ts`, `src/guardrails.test.ts`, `src/app/fonts.test.ts`, `src/lib/forms/guideDocs.test.ts`, 환자 안내문 시험 전부

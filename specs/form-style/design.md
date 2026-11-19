# 설계: 서식 글씨·로고 크기·색 조절 (form-style)

## 1. 흐름
```
FormsScreen.useFormLogo ── 색 표본(logo-fit 1절: 준비 성공이면 준비한 그림 표본, 아니면 원래 표본)
                              ├─ logoPalette → logoColors {main, dark}
                              └─ logoSwatches → string[] (최대 4)   ※ readLogoPixels를 더 부르지 않는다
                         └─ 준비한 그림(LogoBitmap) → logoTintable → PosterLogo.tintable
진료일정 안내: formsState.style·accent ─ NoticeEditor ─ StyleControls(+AccentPicker 줄) ─ dispatch
              preview(ClosureNotice.style) ─ Poster(logoColors) ─ layoutPoster(style) · noticeAutoColors
환자 안내문:   guideState content.style ─ GuideEditor ─ StyleControls ─ dispatch
              GuidePoster(content.style, logoColors) ─ layoutGuide(style)
저장: formNotices.ts ↔ form_notices 여섯 칸 / formGuides.ts ↔ form_guides.content.style
```
그림 파일·인쇄는 이미 미리보기와 같은 `Poster`·`GuidePoster`를 그리므로(AC-6805.4) 따로 고치지 않는다.

## 2. 값 `src/lib/forms/style.ts` (새 파일, 순수, 16진수 색 글자 없음)
```ts
export type FormStyle = {
  titleScale: number   // 80~130, 5씩. 100 = 지금 크기
  bodyScale: number    // 80~130, 5씩
  logoScale: number    // 60~150, 5씩
  titleColor: string | null  // '#rrggbb' 소문자, null = 자동
  bodyColor: string | null   // null = 자동
  logoColor: string | null   // null = 원래 색
}
export const TEXT_SCALE = { min: 80, max: 130, step: 5 } as const
export const LOGO_SCALE = { min: 60, max: 150, step: 5 } as const
export const STYLE_KEYS = ['titleScale', 'bodyScale', 'logoScale', 'titleColor', 'bodyColor', 'logoColor'] as const
export const DEFAULT_STYLE: FormStyle  // 100·100·100·null·null·null (얼려 둔다)
export function checkStyle(value: unknown): FormStyle | null   // 정확히 여섯 열쇠·범위·5의 배수·색 모양(isAccentHex와 같은 식). 아니면 null
export function isDefaultStyle(s: FormStyle): boolean
export function scaled(size: number, pct: number): number      // Math.round(size * pct / 100)
```
- `export function logoTintable(px: LogoBitmap): boolean` — 불투명도 16 미만 점 수 ≥ 전체 점 × 0.1이면 true(AC-6805.3). 상수 TINT_CLEAR_ALPHA 16, TINT_CLEAR_SHARE 0.1.
- `ClosureNotice`(`src/types/forms.ts`)에 `style?: FormStyle` — `import type`만 쓴다(이 파일은 서버 경로 `app/api/ai/forms`도 불러오므로 값 import로 style.ts를 서버 묶음에 끌어들이지 않는다). `checkNotice`는 `style` 열쇠를 accent처럼 '있어도 되고 없어도 되는' 열쇠로 받고, `checkStyle` 실패면 null, 처음대로면 열쇠를 빼고 돌려준다(AC-6806.3).
- `GuideValue`(guide.ts) = `GuideContent & { colors?: …; style?: FormStyle }`. `checkGuideValue`는 colors와 같은 방법으로 `style` 열쇠를 받는다. `savableGuide`는 그대로 퍼 담는다.

## 3. 로고 색 `src/lib/forms/logoColors.ts` (더하기)
```ts
export function logoSwatches(rgba: Uint8ClampedArray, width: number, height: number): string[]  // AC-6802.1
export function onWhite(hex: string, ratio = 3): string                                       // AC-6803.3
```
- `logoSwatches`: 점마다 `a < 128` 또는 `min(r,g,b) >= 200`이면 건너뜀 → 키 `(r>>4)<<8 | (g>>4)<<4 | (b>>4)`로 [합r, 합g, 합b, 수] → 수 내림차순(같으면 키 오름차순) → 평균 반올림 → 고른 것들과 거리 ≥ 60인 것만 → 4개까지. 상수는 파일 안 이름 있는 상수(SWATCH_MAX 4, SWATCH_DISTANCE 60, SWATCH_LIGHT 200).
- `onWhite`: 이미 파일에 있는 hslOf·fromHsl·상대 밝기 식을 쓴다. 밝기 0.02씩(이미 있는 STEP).

## 4. 진료일정 안내 자동 색 `src/components/forms/noticeColors.ts` (새 파일, 순수)
```ts
export const NOTICE_INK = '#262626'   // '진료일정안내'·카드 이름(Poster의 INK를 여기로 옮긴다)
export const NOTICE_LEAD = '#3a3a3a'  // 안내 두 줄(Poster의 LEAD를 여기로)
export function noticeAutoColors(a: { logoColors: GuideColors | null; backgroundAccent: string | null; themeAccent: string }): { title: string; accent: string }
//  logoColors 있으면 { title: dark, accent: onWhite(main) }, 없으면 { title: NOTICE_INK, accent: backgroundAccent ?? themeAccent }
```
- 서식 그림 색 글자는 `components/forms` 안에만 둔다는 저장소 규칙을 따른다(lib/forms에는 색 글자를 두지 않는다). 두 새 파일(`noticeColors.ts`·`colorChoices.ts`)은 `src/app/theme.test.ts`의 색 글자 허용 목록 `HEX_FILES`(AC-4510.2가 글자 그대로 비교하는 목록 포함)에 더한다.
- 기본 색 16가지는 `src/components/forms/colorChoices.ts`의 `BASIC_COLORS: readonly { name: string; hex: string }[]`(requirements 낱말 차례).

## 5. 크기 배치
### 5-1 `src/lib/forms/layout.ts`
- `PosterLayout`에 `title: FittedText`('진료일정안내'), `lead: [FittedText, FittedText]`를 더한다(`leadLines`는 그대로 둔다 — 옛 시험).
- `layoutPoster(notice)`는 `notice.style ?? DEFAULT_STYLE`의 titleScale·bodyScale로 AC-6804.1·.2 식을 쓴다. 상수 `TITLE_SIZE 120`, `LEAD_SIZE 27`, `TEXT_ROOM 746`, `DATE_SHARE 0.6`, `BODY_SHARE 0.37`.
- 로고: `export const LOGO_MAX = { width: 600, height: 130 }`, `export function scaleLogoRect(rect: LogoBox, pct: number, max: { width: number; height: number }): LogoBox`(AC-6804.5, 소수 첫째 자리). 맞출 폭은 새 함수 `logoTextWidth(box, pct = 100, max = box): number` = `min(max.width, box.width × pct / 100)`. 이미 있는 `logoTextFit(text, box)`는 돌려주는 모양 `{ size, squeeze }`를 그대로 두고 `logoTextFit(text, box, pct = 100, max = box)`로 넓힌다 — 글자 크기·squeeze는 AC-6804.5(W = logoTextWidth). 100%면 지금 값 그대로라 layout.test.ts의 `toEqual({ size, squeeze })` 시험이 고치지 않고 통과한다.
- `PosterLogo`의 image에 `tintable?: boolean`(AC-6805.3, 서식 화면이 준비한 그림에만 넣는다).
### 5-2 `src/lib/forms/guideLayout.ts`
- `layoutGuide(c: GuideContent & { style?: FormStyle })`가 `c.style ?? DEFAULT_STYLE`로 AC-6804.3·.4 식을 쓴다.
- `guide.ts`의 `guideProblems(c: GuideContent & { style?: FormStyle })`는 그대로 layoutGuide에 넘기고, `checkGuideValue`는 검사한 style을 넣은 값으로 guideProblems를 부른다(AC-6804.7). 편집 칸 까닭(guideState `visibleProblems`)은 이미 style이 든 content를 쓴다. 상수 `BIG_MAX 120`, `SMALL_TOP_MAX 88`, `SMALL_BOTTOM_MAX 165`.
- `export const GUIDE_LOGO_MAX = { width: 692, height: 140 }`.

## 6. 그리기
- `Poster.tsx`: 새 prop `logoColors?: GuideColors | null`(기본 null). `const style = notice.style ?? DEFAULT_STYLE`, `const auto = noticeAutoColors(…)`, 강조색 = `isAccentHex(notice.accent) ? notice.accent : auto.accent`, 제목 fill = `style.titleColor ?? auto.title`, 안내 두 줄 fill = `style.bodyColor ?? NOTICE_LEAD`, 카드 이름 fill = `style.bodyColor ?? NOTICE_INK`. 글자 크기는 `layout.title`·`layout.lead`.
- `LogoSlot({ logo, area, box, fill, scale = 100, max, color = null })`: 크기 아는 그림은 `scaleLogoRect(logoRect(area, size), scale, max)`, 모르는 그림은 `scaleLogoRect(box, scale, max)`, 이름 글자는 `logoTextFit(text, box, scale, max)`(가운데 x는 그대로, squeeze면 textLength = `logoTextWidth(box, scale, max)`)와 fill = `color ?? fill`. `color`가 있고 `logo.tintable === true`인 그림이면 `useId().replace(/[^\w-]/g, '')`로 만든 필터 `<filter id><feFlood floodColor={color} /><feComposite in2="SourceAlpha" operator="in" /></filter>`를 image에 건다(AC-6805.3). tintable 아닌 그림은 color를 무시한다. 100%·color null이면 지금과 같은 속성만 낸다(AC-6804.6).
- `GuidePoster.tsx`: `style = content.style ?? DEFAULT_STYLE`. 큰 문구 fill = `style.titleColor ?? D`, 줄 글(em 아닌 부분) fill = `style.bodyColor ?? W`, em·표시는 그대로. LogoSlot에 scale·GUIDE_LOGO_MAX·logoColor.

## 7. 저장
### 7-1 SQL `supabase/migrations/20261119100000_form_notices_style.sql` (글자 그대로, 문장마다)
```sql
alter table public.form_notices add column if not exists title_scale smallint;
alter table public.form_notices add column if not exists body_scale smallint;
alter table public.form_notices add column if not exists logo_scale smallint;
alter table public.form_notices add column if not exists title_color text;
alter table public.form_notices add column if not exists body_color text;
alter table public.form_notices add column if not exists logo_color text;
alter table public.form_notices drop constraint if exists form_notices_style_check;
alter table public.form_notices add constraint form_notices_style_check check ((title_scale is null or (title_scale between 80 and 130 and title_scale % 5 = 0)) and (body_scale is null or (body_scale between 80 and 130 and body_scale % 5 = 0)) and (logo_scale is null or (logo_scale between 60 and 150 and logo_scale % 5 = 0)) and (title_color is null or title_color ~ '^#[0-9a-f]{6}$') and (body_color is null or body_color ~ '^#[0-9a-f]{6}$') and (logo_color is null or logo_color ~ '^#[0-9a-f]{6}$'));
grant insert (title_scale, body_scale, logo_scale, title_color, body_color, logo_color), update (title_scale, body_scale, logo_scale, title_color, body_color, logo_color) on table public.form_notices to authenticated;
```
- 시험 `supabase/formNoticesStyle.rls.test.ts`: formNoticesAccent.rls.test.ts와 같은 PGlite 방법. 앞 마이그레이션(인증 → 휴진 안내 → 내 배경 → 글자 색) 뒤에 이 파일. 문장이 위와 같다, 두 번 돌려도 된다, 맞는 값·null 저장, 범위 밖(75·135·83·55·155)·색 모양 틀림('red', '#ABCDEF') 거절, anon 거절, 다른 칸 권한이 늘지 않음.
### 7-2 `src/lib/storage/formNotices.ts`
- `COLUMNS`에 여섯 칸. 읽기: 칸 → `style`(null 크기 100, null 색 null) → `checkNotice({ …, accent, style })`. 쓰기 몸통: 다섯 + 여섯 칸(크기 100 → null).
### 7-3 `src/lib/storage/formGuides.ts`
- 골라 담기(`picked`)에 `style`이 있고 처음대로가 아니면 넣는다.
### 7-4 E2E `e2e/forms-privacy.spec.ts`
- 몸통 열쇠 목록에 여섯 칸을 더하고 select·Row에 넣는다(이 PC에서는 돌리지 않는다 — 실제 Supabase 시험 계정, SQL 실행 뒤 사용자 환경).

## 8. 상태와 화면
- `formsState.ts`: 상태에 `style: FormStyle`(새 안내문·불러오기 때 `notice.style ?? DEFAULT_STYLE`), 동작 `{ type: 'style'; style: FormStyle }`. 바뀐 내용 비교 글자(`snapshotOf`)는 style이 처음대로가 아닐 때만 배열 끝에 style 여섯 값을 더한다(처음대로면 지금 글자 그대로). 미리보기·저장 값은 처음대로면 style 열쇠 없이.
- `guideState.ts`: 동작 `{ type: 'style'; style: FormStyle }` → `withStyle(content, style)`(처음대로면 열쇠 삭제). `snapshotOf`도 style이 처음대로가 아닐 때만 끝에 더한다(`BLANK_SNAPSHOT` 그대로, AC-6806.4). `tidyDone`은 colors처럼 style도 되살린다(AC-6806.5).
- `ColorChips.tsx`(새): props `{ label: string; first: '자동' | '원래 색'; value: string | null; start: string; logoSwatches: readonly string[]; disabled?: boolean; onChange(v: string | null) }`. AC-6801.3·.4 모양. 겉은 `role="group" aria-label={label}`, 색 칸 value = `value ?? start`, 값이 null이 아니고 어느 칩과도 다르면 색 칸에 `data-own="true"`. disabled면 단추·칩·색 칸 모두 disabled. 첫 단추는 `ds.segment`, 칩은 지름 28px 둥근 단추(배경색은 칩 색 — 사용자가 고르는 색 값이라 style 속성으로만, 앱 색은 토큰), 색 칸은 AccentPicker의 COLOR_INPUT과 같은 모양.
- `StyleControls.tsx`(새): props `{ tool: 'notice' | 'guide'; style: FormStyle; logoSwatches: readonly string[]; starts: { title: string; body: string; logo: string }; logoTintable: boolean; onStyle(s: FormStyle); onReset(); accentRow?: ReactNode }`. logoTintable false면 로고 ColorChips disabled + AC-6801.8 글. 묶음 `<fieldset>` + `<legend>글씨·로고</legend>`, 줄 차례 AC-6801.1, 밀대 `<input type="range">`(aria-label AC-6801.2), 도움말 AC-6801.6, [처음대로] → onReset.
- `AccentPicker.tsx`: 줄 제목 '강조 색', 고르기는 `ColorChips`(label '강조 색', first '자동'), 지금 색 글자·도움말·옅은 색 경고는 AC-6801.5. props에 `logoSwatches`. 자리는 StyleControls의 accentRow.
- `NoticeEditor.tsx`: 배경 칸 아래 AccentPicker를 빼고, 맨 아래에 `<StyleControls tool="notice" … accentRow={<AccentPicker …/>} />`. 새 props `style`, `logoSwatches`, `starts`, `logoTintable`, `onStyle`, `onReset`.
- `GuideEditor.tsx`: '색' 칸 다음에 `<StyleControls tool="guide" …/>`. 새 props `logoSwatches`, `starts`, `logoTintable`(onStyle은 dispatch style, onReset은 dispatch style 처음대로).
- `FormsScreen.tsx`: `useFormLogo`가 `logoSwatches`(logoPalette와 같은 표본, AC-6802.3)도 내고, 준비에 성공한 그림에는 `tintable: logoTintable(준비한 점)`을 넣는다. `logoTintable`(화면 값) = 로고가 이름 글자이거나 `tintable === true`인 그림이거나 아직 읽는 중. 시작 색(AC-6801.3): 진료일정 안내 `{ title: 자동 제목 색, body: NOTICE_LEAD, logo: logoSwatches[0] ?? 검정 }`, 환자 안내문은 GuideWorkspace가 `{ title: guidePalette(colors, logoColors).dark, body: 흰색, logo: 같은 규칙 }`(검정·흰색은 BASIC_COLORS에서 이름으로 찾는다). `autoAccent = noticeAutoColors({ logoColors, backgroundAccent: look.background?.accent ?? null, themeAccent: themeOf(look.theme).accent }).accent`. Poster에 `logoColors`. NoticeEditor에 style·logoSwatches·starts·logoTintable·onStyle·onReset(style 처음대로 + accent null). GuideWorkspace에 logoSwatches·logoTintable.
- `GuideWorkspace.tsx`: `logoSwatches`·`logoTintable` prop을 받아 시작 색과 함께 GuideEditor로.

## 9. 결정과 맞바꿈
- 휴진 안내는 jsonb 한 칸 대신 여섯 칸 — DB 검사 제약으로 범위를 막는다(같은 효과면 DB 제약, CLAUDE.md). 환자 안내문은 이미 content jsonb라 SQL 없이 열쇠 하나.
- 크기 100·색 null을 처음대로로 보고 저장하지 않는다 — 옛 안내문·옛 시험과 글자 그대로 같다(AC-6804.6).
- 로고 색은 SVG 필터로 칠한다 — 준비한 PNG를 서식마다 다시 만들지 않아도 되고, 미리보기·그림 파일·인쇄가 모두 같은 SVG를 쓴다(이미 그림자·흐림 필터가 내보내기에서 쓰인다).
- [자동] 강조 색에 로고 색이 배경 그림 강조색보다 앞선다(사용자 "로고 열면 자동으로 로고 색"). 그래서 로고가 있는 병원은 AI 배경을 바꿔도 자동 강조 색이 로고 색이다.

## 10. 위험
- 로고가 있으면 지금 저장된 휴진 안내의 자동 강조 색·제목 색이 바뀌어 보인다(사용자가 고른 동작). 노란 로고면 강조 색이 `onWhite`로 어두운 겨자색이 된다.
- 'N월'과 '진료일정안내'는 이미 폭이 거의 꽉 차서 제목 크기를 올려도 조금(약 124까지)만 커진다 — 도움말 '자리보다 크게는 커지지 않아요'.
- SQL을 넣기 전에 배포하면 휴진 안내 읽기가 실패한다 → 배포 전에 SQL 먼저(ssk-deploy 1번).
- 로고 색 칠하기는 그림의 불투명한 모양을 칠하므로, 배경이 남은 로고(logo-fit이 지우지 않은 색 배경·준비 실패)는 네모 전체가 한 색이 된다 → tintable(투명 점 10% 이상)인 준비한 그림에만 칠하고, 아니면 고르기를 막고 까닭을 보인다(AC-6801.8). 10%는 가로·세로 로고의 글자 사이 빈칸이면 넉넉히 넘는 값이다.

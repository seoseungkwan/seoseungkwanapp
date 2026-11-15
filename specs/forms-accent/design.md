# 설계: 휴진 안내 글자 색 직접 고르기 (forms-accent)

## 1. 결정 (2026-11-15 사용자)
- 고르는 것: 강조색 전체('N월'·날짜 띠·카드 아래 글) 하나. 안내문마다 저장
- 고르는 법: 색상판(`<input type="color">`, 아무 색). 옅으면 경고만, 막지 않음
- 기본: [자동] = 지금 그대로(배경이면 배경 강조색, 아니면 테마 강조색)
- "'휴진' 글만 늘 빨강"은 하지 않는다(직접 고르기와 부딪힘)
- 화면은 승인 시안 `docs/mockups/forms-accent/screen.html` 그대로

## 2. 자료
- `types/forms.ts`: `ClosureNotice`에 `accent?: string | null`을 더한다(없음·null = 자동). 선택 칸으로 두어 지금 안내문 값·시험이 그대로 맞는다
- 모양: `#` + 소문자 16진수 6자리. `lib/forms/themes.ts`에 둔다:
  - `isAccentHex(value: unknown): value is string` — `/^#[0-9a-f]{6}$/`
  - `isLightAccent(hex: string): boolean` — `contrastRatio(hex, '#ffffff') < 4.5`
  - 16진수 색 글자는 `themes.ts`·`Poster.tsx`에만 둔다(`src/app/theme.test.ts` 규칙). 화면 파일은 이 함수만 부른다
- DB: `form_notices.accent text` (null 또는 `^#[0-9a-f]{6}$`)

## 3. 검사 `lib/forms/notice.ts`
- `checkNotice`: 열쇠는 지금 넷(`year·month·cards·theme`) 그대로이거나 거기에 `accent` 하나를 더한 다섯. `accent`가 있으면 null 또는 `isAccentHex`여야 하고 아니면 null을 돌려준다
- 돌려주는 값: `accent`가 문자열이면 `{ …, accent }`, null이거나 없으면 `accent` 열쇠를 넣지 않는다(지금 `toEqual` 기대가 그대로 맞는다)

## 4. 저장 `lib/storage/formNotices.ts`
- `COLUMNS`에 `accent`를 더한다: `'id, year, month, cards, theme, accent, updated_at'`
- `savedOf`: `checkNotice({ year, month, cards, theme, accent })` — 표의 null은 자동, 틀린 모양이면 그 줄을 버린다(AC-4703.3)
- `bodyOf`: 보내는 몸통은 `year·month·cards·theme·accent` 다섯(`accent: n.accent ?? null`, 칸이 빠지지 않는다 — 자동으로 되돌린 값을 DB에 null로 쓰려고). 검사는 `checkNotice`로, 보내는 객체는 다섯 열쇠를 골라 새로 만든다

## 5. 상태 `components/forms/formsState.ts`
- `FormsState.accent: string | null` (처음 null)
- 동작 `{ type: 'accent'; accent: string | null }`: 소문자로 바꿔 `isAccentHex`면 넣고, null이면 null. 그 밖의 값은 무시
- `new` → null, `open` → `notice.accent ?? null`, `saved` → 저장된 값 그대로
- `snapshotOf`(dirty 비교)에 `accent`를 넣는다. `readyNotice`(저장·뽑기)와 `previewNotice`(미리보기·인쇄 사본)는 `accent`가 있으면 `{ …, accent }`를 더하고, null이면 열쇠를 넣지 않는다(지금 `toEqual` 기대가 그대로 맞는다)
- AI 정리(tidy) 답은 글자 색을 바꾸지 않는다

## 6. 그림 `components/forms/Poster.tsx`
- `const accent = isAccentHex(notice.accent) ? notice.accent : bg ? bg.accent : themeOf(theme).accent`
- 'N월'·날짜 띠·카드 아래 글은 지금처럼 이 `accent` 하나를 쓴다. 그 밖은 그대로
- 그림 파일(`downloadPosterPng`)은 그려진 SVG를 쓰므로 따로 고치지 않는다

## 7. 화면
### 7-1. `components/forms/AccentPicker.tsx` (새)
```ts
type Props = { month: number; accent: string | null; autoAccent: string; onAccent: (accent: string | null) => void }
```
- 시안 그대로: `<div className={ds.field}>` 안에 제목(`<span id>` '글자 색'), `ds.segment` 묶음(`role="group"`, `aria-labelledby` 제목) [자동]·[직접 고르기](`aria-pressed`), `<label>` 안에 `<input type="color" aria-label="글자 색 고르기">`와 지금 색 글, 도움말(`ds.help`), 경고(`text-warning`, 조건부)
- 색 칸 값: `accent ?? autoAccent`. [자동]일 때 색 칸 묶음에 `opacity-50`(누를 수 있음)
- 지금 색 글: 직접이면 `accent`, 자동이면 `자동 ${autoAccent}`(tabular)
- 색 칸 `onChange`·`onInput` → `onAccent(value.toLowerCase())`
- [직접 고르기]: 자동일 때만 `onAccent(autoAccent)` 후 색 칸 `showPicker?.()`(없거나 던지면 무시, jsdom 포함). 이미 직접이면 아무것도 안 함
- [자동] → `onAccent(null)`
- 경고: `accent !== null && isLightAccent(accent)`일 때 "옅은 색이라 흰 글자·흰 카드 위 글이 잘 안 보일 수 있어요"
- 앱 화면 색은 토큰·`ds`만(16진수 글자 없음). 사용자가 고른 색 값은 색 칸 `value`로만 쓴다

### 7-2. `NoticeEditor.tsx`·`FormsScreen.tsx`
- `NoticeEditor`: 받는 값에 `autoAccent: string`, `onAccent`를 더하고 `ThemePicker` 바로 아래(같은 '배경' 칸 끝)에 `<AccentPicker month={state.month} accent={state.accent} autoAccent={autoAccent} onAccent={onAccent} />`
- `FormsScreen`: `const autoAccent = look.background?.accent ?? themeOf(look.theme).accent`(`look`은 지금 `bg.look(preview)`), `onAccent={(accent) => dispatch({ type: 'accent', accent })}`를 `NoticeEditor`에 넘긴다. 미리보기·인쇄 사본의 `Poster`는 `notice={preview}`(= `previewNotice(state)`, 5절)를 그대로 받으므로 따로 넘기지 않는다

## 8. SQL `supabase/migrations/20261115030000_form_notices_accent.sql`
```sql
alter table public.form_notices add column if not exists accent text;
alter table public.form_notices drop constraint if exists form_notices_accent_check;
alter table public.form_notices add constraint form_notices_accent_check check (accent ~ '^#[0-9a-f]{6}$');
grant insert (accent), update (accent) on table public.form_notices to authenticated;
```
- 두 번 실행해도 된다. 지금 줄은 null이라 제약을 넘는다. 표 RLS·다른 칸 권한은 건드리지 않는다
- 사이트에 올리기 전에 사용자가 붙인다(붙이기 전 새 코드는 저장이 실패한다)

## 9. 기존 명세·시험과의 관계
바꾸는 기존 기대:
- `src/lib/storage/formNotices.test.ts`: 읽는 칸 목록(`COLUMNS`)에 `accent`, 넣기·고치기 몸통 열쇠에 `accent`(AC-3507.1·AC-3507.7 묶음의 칸 목록·몸통 기대만)
- `src/lib/forms/notice.test.ts`: 열쇠가 하나 더 있으면 null이라는 기대가 `accent` 하나를 더한 경우를 쓰고 있으면 다른 열쇠 이름으로 바꾼다(뜻은 그대로)

기대는 그대로 두고 시험만 더하는 것: `src/lib/forms/themes.test.ts`, `src/lib/forms/notice.test.ts`, `src/components/forms/formsState.test.ts`

새 시험 파일: `supabase/formNoticesAccent.rls.test.ts`, `src/components/forms/PosterAccent.test.tsx`, `src/components/forms/AccentPicker.test.tsx`(`FormsScreen`을 그려 본다)

고치지 않은 채 통과해야 하는 것: `src/components/forms/Poster.test.tsx`, `src/components/forms/PosterBackground.test.tsx`, `src/components/forms/FormsScreen.test.tsx`, `src/components/forms/ThemePicker.test.tsx`, `src/lib/forms/png.test.ts`, `src/app/theme.test.ts`, `src/lib/forms/rules.test.ts`, `supabase/formNotices.rls.test.ts`, `supabase/formBackgrounds.rls.test.ts`, `src/guardrails.test.ts`

## 10. 위험
- **옅은 색**: 흰 날짜 글·흰 카드 위 글이 안 보일 수 있다 → 경고만(사용자 결정). 미리보기가 늘 보인다
- **SQL 전에 배포**: 저장할 때 `accent` 칸이 없어 실패한다 → SQL 먼저(ssk-deploy 1번)
- **폰의 색상판**: 안드로이드 크롬·PC는 `<input type="color">`가 열린다. 화면 확인에서 본다
- **`showPicker` 없는 브라우저**: [직접 고르기]가 색만 바꾸고 창은 안 열 수 있다 → 색 칸을 눌러 고를 수 있다

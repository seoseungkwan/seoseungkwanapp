# 작업 분할: 휴진 안내 글자 색 직접 고르기 (forms-accent)

> 형식: `## TASK-n: 제목` 아래에 `- Phase:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 수정할 수 있다.
>
> **시작 조건**: 이 명세와 화면 시안(`docs/mockups/forms-accent/screen.html`, `notes.md` 승인 줄)이 함께 승인된 뒤.
>
> | Phase | 일꾼 A | 일꾼 B | 하는 일 |
> |---|---|---|---|
> | 1 밑바탕 | TASK-1 | TASK-2 | SQL·RLS 시험 · 값 모양·검사·저장 |
> | 2 그림·상태 | TASK-3 | TASK-4 | Poster 글자 색 · 서식 상태 |
> | 3 화면 | TASK-5 | | '글자 색' 칸과 잇기 |
> | 4 확인 | TASK-6(메인) | | 화면 사진·전체 검사 |

## TASK-1: DB 칸 (SQL)
- Phase: 1
- AC: AC-4704.1, AC-4704.2
- REQ: REQ-4704
- Files: supabase/migrations/20261115030000_form_notices_accent.sql, supabase/formNoticesAccent.rls.test.ts
- Tests: supabase/formNoticesAccent.rls.test.ts
- TDD: required — design.md 8절. 시험은 `supabase/formNotices.rls.test.ts`·`formBackgrounds.rls.test.ts`의 PGlite 흉내 설정을 본떠 새 파일에 둔다(앞 마이그레이션 auth·form_notices·form_backgrounds를 먼저 돌림): 두 번 실행, 칸이 있음·null 허용, 모양 틀린 값(대문자·`red`·`#abc`·8자리) 거부, 내 줄에 넣기·고치기 됨, anon 읽기·쓰기 막힘, 다른 병원 줄 고치기 0줄, 승인 안 된 병원 막힘, 그 밖의 칸 권한(`hospital_id` 등) 그대로

## TASK-2: 값 모양·검사·저장
- Phase: 1
- AC: AC-4702.3, AC-4703.1, AC-4703.3
- REQ: REQ-4702, REQ-4703
- Files: src/types/forms.ts, src/lib/forms/themes.ts, src/lib/forms/themes.test.ts, src/lib/forms/notice.ts, src/lib/forms/notice.test.ts, src/lib/storage/formNotices.ts, src/lib/storage/formNotices.test.ts
- Tests: src/lib/forms/themes.test.ts, src/lib/forms/notice.test.ts, src/lib/storage/formNotices.test.ts
- TDD: required — design.md 2·3·4절. `isAccentHex`(소문자 6자리만)·`isLightAccent`(흰색 대비 4.5 미만), `checkNotice`의 `accent` 열쇠(없음·null·모양·틀리면 null, 돌려줄 때 null은 열쇠 없음), 읽는 칸 `accent`, 몸통 다섯 열쇠(`accent: null` 포함)·펼치지 않고 골라 만듦, 표의 틀린 모양 줄은 버림. 9절 '바꾸는 기존 기대'만 고친다

## TASK-3: 안내문 그림 글자 색
- Phase: 2
- AC: AC-4702.1, AC-4702.2, AC-4702.3
- REQ: REQ-4702
- Files: src/components/forms/Poster.tsx, src/components/forms/PosterAccent.test.tsx
- Tests: src/components/forms/PosterAccent.test.tsx
- TDD: required — design.md 6절. 테마 그림·그림 2·배경(`background`) 각각에서 `notice.accent`가 'N월'·띠·아래 글에 들어가고 나머지는 같음, 없거나 null이면 지금 그림과 글자 하나까지 같음, 틀린 모양이면 자동 색. `Poster.test.tsx`·`PosterBackground.test.tsx`는 열지 않고 그대로 통과

## TASK-4: 서식 상태
- Phase: 2
- AC: AC-4703.2
- REQ: REQ-4703
- Files: src/components/forms/formsState.ts, src/components/forms/formsState.test.ts
- Tests: src/components/forms/formsState.test.ts
- TDD: required — design.md 5절. 동작 `accent`(소문자로, 틀린 값 무시, null), new → null, open → 저장 값, dirty(바꾸면 참·되돌리면 거짓), `readyNotice`·`previewNotice`에 `accent`(null이면 열쇠 없음), tidy가 바꾸지 않음. 지금 기대는 고치지 않는다

## TASK-5: '글자 색' 칸과 서식 화면 잇기
- Phase: 3
- AC: AC-4701.1, AC-4701.2, AC-4701.3, AC-4701.4, AC-4702.1, AC-4703.1, AC-4703.2
- REQ: REQ-4701, REQ-4702, REQ-4703
- Files: src/components/forms/AccentPicker.tsx, src/components/forms/NoticeEditor.tsx, src/components/forms/FormsScreen.tsx, src/components/forms/AccentPicker.test.tsx, docs/ARCHITECTURE.md
- Tests: src/components/forms/AccentPicker.test.tsx
- TDD: required — design.md 7절, 시안 `docs/mockups/forms-accent/screen.html`. 글귀는 requirements.md와 한 글자도 다르지 않게, 토큰과 `ds`만(색 글자 없음). 시험은 새 파일 하나(jsdom, `FormsScreen`을 그리고 `lib/storage/formNotices`·`formBackgrounds`·fetch를 가짜로 — `ThemePicker.test.tsx` 본뜸): 칸 글귀·묶음·읽는 이름, 처음 [자동]·자동 색·'자동 #…', 색 고르면 [직접 고르기]·미리보기·인쇄 사본의 'N월'·띠·아래 글 색, [직접 고르기]는 자동 색으로 시작, [자동]으로 되돌림, 옅은 색 경고와 뽑기 안 막힘, [저장] 몸통의 `accent`(직접·null), 저장 안내문 열면 그 색, 바꾸면 '저장하지 않은 내용이 있어요', [새로 만들기] → 자동, 내 배경·만든 배경 위에서도 고른 색. `docs/ARCHITECTURE.md`의 forms 줄에 `AccentPicker`를 더한다. `FormsScreen.test.tsx`·`ThemePicker.test.tsx`는 열지 않고 그대로 통과

## TASK-6: 화면 확인·전체 검사
- Phase: 4
- AC: AC-4701.1, AC-4701.4, AC-4702.1
- REQ: REQ-4701, REQ-4702
- Files: src/components/forms/AccentPicker.tsx
- Tests: src/components/forms/AccentPicker.test.tsx
- TDD: exempt — 화면 확인(저장소 밖 하네스 `~/.claude/state/handoff/themes-harness/` 본뜸, 1440·390 폭, 시안 `?s=color|light`와 나란히, AI 배경·테마 그림 위 고른 색, 내려받은 PNG)과 전체 검사(`npm test`·`npm run lint`·`npm run build`). 고칠 것이 나오면 Files의 화면 파일만 고친다

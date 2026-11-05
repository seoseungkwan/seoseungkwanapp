# 작업 분할: 업무일지 업무사항 글씨 크기

> 형식: `## TASK-n: 제목` 아래에 `- Phase:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다. TASK마다 일꾼(subagent) 하나다.
>
> **할 순서**: Phase 1 → 2 → 3 → 4. 같은 Phase의 TASK는 **병렬**이다(수정 파일이 겹치지 않고 앞 Phase의 결과만 쓴다).
>
> | Phase | TASK | 하는 일 | 병렬 |
> |---|---|---|---|
> | 1 밑바탕 | TASK-1 | 크기 목록·기본값·한 칸 옮기기 규칙 | 혼자 |
> | 2 조각 | TASK-2 | DB 칸 `memo_font_pt`(새 migration)와 RLS 시험 | 병렬 |
> | | TASK-3 | 하루 읽기·저장에 크기 | 병렬 |
> | | TASK-4 | 자동 저장이 크기를 나름 | 병렬 |
> | | TASK-5 | 양식 업무사항 글씨·잘림 재기 | 병렬 |
> | | TASK-6 | 날짜 줄 글씨 단추·잘림 안내·`alert` 아이콘 | 병렬 |
> | 3 잇기 | TASK-7 | 화면·날짜별 값·자동 저장 한 벌에 잇기 | 혼자 |
> | 4 확인 | TASK-8 | 화면 확인(1440·700·390·인쇄)과 전체 검사 | 혼자 |
>
> - 파일이 겹치는 곳: 없다. `docs/ARCHITECTURE.md`는 TASK-2만, `docs/UI_GUIDE.md`는 TASK-6만 고친다. TASK-8은 화면 확인에서 고칠 것이 나올 때만 TASK-5·6·7의 화면 파일을 고친다
> - **Phase 끝(TASK가 아님, 메인 세션)**: 그 Phase에서 고친 시험 파일과 design.md '기존 명세·시험과의 관계'에 적은 기존 시험을 `npx vitest run <파일들>`로 다시 돌린다(가벼움). 실제 화면 사진은 화면이 이어진 Phase 3 뒤에만 찍을 수 있어 TASK-8이 찍는다(캡처용 임시 페이지를 만들지 않는다, worklog TASK-10과 같은 규칙). Phase 2 끝에는 시험이 그린 마크업으로 쉬운 말 그림을 보인다. 전체 검사(`verify`)는 TASK-8에서 서버에 다른 일이 없을 때 한 번 돌린다
> - **사용자 단계(사이트에 올리기 전)**: TASK-2의 SQL 파일을 운영 Supabase SQL 편집기에 붙여 한 번 실행(사용자가 직접). 붙이기 전에는 이 기능을 사이트에 올리지 않는다(design.md '사용자가 할 일'). Claude는 실제 Supabase에 붙지 않는다
> - 승인된 시험의 기대를 바꾸는 곳은 design.md '기존 명세·시험과의 관계'에 적은 줄뿐이다. 그 밖의 기대가 바뀌어야 하면 멈추고 보고한다

## Phase 1 — 밑바탕

## TASK-1: 크기 목록·기본값·한 칸 옮기기 규칙
- Phase: 1 · 혼자
- AC: AC-1501.1, AC-1501.2, AC-1501.3, AC-1501.4
- REQ: REQ-1501
- Files: src/types/worklog.ts, src/lib/worklog/memoFont.ts, src/lib/worklog/memoFont.test.ts
- Tests: src/lib/worklog/memoFont.test.ts
- TDD: required — 순수 함수만(design.md '규칙'). `types/worklog.ts`에는 `MEMO_FONT_PTS`·`MemoFontPt`·`MEMO_FONT_DEFAULT`를 더하고 `WorklogSavedDay`에 선택 칸 `memoFontPt?`만 더한다. 다른 열쇠·`WORKLOG_CELL_KEYS`·`WORKLOG_COLUMNS`는 그대로이고 그것을 시험이 확인한다(AC-1501.1). AC-1501.4는 `memoFont.ts` 소스 글자에 React·supabase·`@/lib/storage`·`localStorage`·`console`·`fetch`가 없는지로 본다

## Phase 2 — 조각 (다섯 병렬, Phase 1 뒤)

## TASK-2: DB 칸 `memo_font_pt`
- Phase: 2 · 병렬
- AC: AC-1502.1, AC-1502.2, AC-1502.3, AC-1502.4, AC-1502.5
- REQ: REQ-1502
- Files: supabase/migrations/20261105000200_worklog_memo_font.sql, supabase/worklog.rls.test.ts, docs/ARCHITECTURE.md
- Tests: supabase/worklog.rls.test.ts
- TDD: required — 새 migration 하나(design.md 'DB', 글자 그대로). 먼저 `worklog.rls.test.ts` 끝에 새 `describe` 묶음(0110 묶음과 같은 방식, `SLOW`)을 더해 파일이 없어 실패(RED)하는 것을 본다. DB 차례: Supabase 흉내 → auth → 0100 → 0110 → 시험 줄(`addDay`) → 실행 전 모양 → 0200 → 실행 뒤 모양. `schemaSnapshot`은 거를 칸 이름을 인자로 받게만 바꾸고(기본값은 지금처럼 `bit_fields`) 0100·0110 묶음의 기대는 고치지 않는다. 크기 목록은 `@/types/worklog`의 `MEMO_FONT_PTS`를 읽는다(AC-1502.3). anon·다른 병원·승인 대기·거절은 0110 묶음의 AC-015.2 시험과 같은 모양으로 본다. `docs/ARCHITECTURE.md`는 DB 표 목록의 `worklog_days` 줄 끝에 `· 업무사항 글씨 크기 \`memo_font_pt\`(8·9·10·11·12·14·16pt, 기본 11, specs/worklog-memo-font)`만 더한다(백슬래시는 넣지 않는다). **실제 Supabase에 붙여 넣지 않는다**(사용자 단계)

## TASK-3: 하루 읽기·저장에 크기
- Phase: 2 · 병렬
- AC: AC-1503.1, AC-1503.2, AC-1503.3
- REQ: REQ-1503
- Files: src/lib/storage/worklogDays.ts, src/lib/storage/worklogDays.test.ts
- Tests: src/lib/storage/worklogDays.test.ts
- TDD: required — 먼저 시험을 바꿔 RED를 본다: design.md '기존 명세·시험과의 관계'의 `SELECT` 상수(:26)에 `memo_font_pt`, 칸 차례 기대(:164)에 `'memo_font_pt'`, 읽은 모양 기대(:173·:195·:201·:571·:577)에 `memoFontPt: 11`을 더하고, 새 시험(서버 값 14 → 14, 목록 밖 13·null·글자 '14'·칸 없음 → 11, 다섯째 인자 14 → 본문에 `memo_font_pt: 14`(숫자), 셋째 `undefined` + 다섯째만 → `bit_fields` 없이 `work_date`·`memo_font_pt`만, 다섯째 없음 → `memo_font_pt` 없음, 목록 밖 값 → 보내지 않음·그것뿐이면 네트워크 없음)을 더한다. 읽기는 `toMemoFontPt`를 쓴다. 다른 기대는 그대로 통과해야 한다

## TASK-4: 자동 저장이 크기를 나름
- Phase: 2 · 병렬
- AC: AC-1504.1, AC-1504.2, AC-1504.3, AC-1504.4
- REQ: REQ-1504
- Files: src/lib/worklog/autosave.ts, src/lib/worklog/autosave.test.ts
- Tests: src/lib/worklog/autosave.test.ts
- TDD: required — `vi.useFakeTimers()`와 가짜 `save`로 시험한다(design.md '자동 저장'). 새 시험을 먼저 더해 RED를 본다: `changeMemoFont` → 800ms 뒤 `save(ymd, {}, undefined, 12)` 한 번·상태 saving → saved, 연달아 바꾸면 마지막 크기만, 되돌려 같아지면 보내지 않음, 칸·크기 함께 바뀌면 한 번에, 크기와 목록 함께면 `save(ymd, changes, bits, pt)`, 실패 뒤 다시 하기·끊김·`retry`·`flush`·`hasUnsaved`, 저장 중 또 바꾸면 끝난 뒤 남은 크기만, `serverDay` 다섯째 인자(저장 안 된·보내는 중 크기는 그대로, 아니면 반영, 없으면 그대로), `pendingDay`·돌려주는 하루의 `memoFontPt`, `dispose` 뒤 크기 없음, `change`만 부른 저장은 인자 둘·셋 그대로(AC-1504.2). **지금 시험은 하나도 고치지 않은 채 통과해야 한다**(특히 :991·:1001의 인자 수). React·supabase를 쓰지 않는다

## TASK-5: 양식 업무사항 글씨·잘림 재기
- Phase: 2 · 병렬
- AC: AC-1505.1, AC-1505.2, AC-1505.3, AC-1505.4
- REQ: REQ-1505
- Files: src/components/worklog/WorklogSheet.tsx, src/components/worklog/WorklogSheet.test.tsx, src/components/worklog/sheet.module.css, src/components/worklog/sheet.print.test.ts, src/components/worklog/sheet.style.test.ts
- Tests: src/components/worklog/WorklogSheet.test.tsx, src/components/worklog/sheet.print.test.ts, src/components/worklog/sheet.style.test.ts
- TDD: required — 시안 승인됨(`docs/mockups/worklog/memo-font.html`). 먼저 시험을 바꿔 RED를 본다: `sheet.print.test.ts:106`의 기대를 `calc(var(--c11) * var(--memo-pt, 11) / 11)`로 바꾸고(인쇄 `--c11`이 11pt 그대로인지·업무사항 `overflow: hidden`·줄 높이 합 634.5pt 기존 시험 유지), `sheet.style.test.ts:25` `SIZE_VARS`에 `--memo-pt`를 더하는 시험, `WorklogSheet.test.tsx`에 `memoFontPt` 14 → 업무사항 `td`의 `style.getPropertyValue('--memo-pt')`가 `14`·없으면 `11`, `onMemoOverflow`(시험이 textarea `scrollHeight`·`clientHeight`를 `Object.defineProperty`로 정함: 넘음 → `true` 한 번, 같은 값으로 다시 그려도 다시 안 부름, 들어감 → `false`, `memoFontPt`가 바뀌면 다시 잼, window `resize`에 다시 잼, 내려가면 `resize` 듣기를 뗌, `document.fonts`가 없어도 던지지 않음)을 더한다. 지금 양식 시험은 고치지 않은 채 통과해야 한다(AC-1505.4). 폰·인쇄 블록의 `--c11` 값은 바꾸지 않는다

## TASK-6: 날짜 줄 글씨 단추·잘림 안내·`alert` 아이콘
- Phase: 2 · 병렬
- AC: AC-1506.1, AC-1506.2, AC-1506.3, AC-1506.4, AC-1507.1, AC-1507.2, AC-1507.3
- REQ: REQ-1506, REQ-1507
- Files: src/components/worklog/WorklogToolbar.tsx, src/components/worklog/WorklogToolbar.test.tsx, src/components/common/Icon.tsx, src/components/common/Icon.test.tsx, docs/UI_GUIDE.md
- Tests: src/components/worklog/WorklogToolbar.test.tsx, src/components/common/Icon.test.tsx
- TDD: required — 시안 승인됨. 자리는 design.md '시안과 다른 곳' 첫 줄(날짜 줄 바로 아래 줄 오른쪽 끝). 먼저 시험을 더해 RED를 본다: 묶음 이름·차례·단추 이름·숫자 `output`, 누르면 `onStep(-1|1)`, 8·16 끝 `disabled`, `disabled`면 둘 다 막힘, `memoFont` 없음·`null`이면 묶음·안내 없음, 보조 단추·`max-md:h-11`·`max-md:w-11`, 잘림 안내 글(글자 그대로)·`alert` 아이콘·`role="alert"` 아님, `overflow` 거짓·`disabled` 참이면 안내 없음, 첫 줄 단추·글이 그대로. `WorklogToolbar.test.tsx:265`(단추 수)를 포함한 지금 시험은 고치지 않은 채 통과해야 한다(`memoFont`를 주지 않는 `setup`). `Icon.test.tsx`는 이름 목록·개수 시험을 22개·`alert`로 고치고(시험 이름에 AC-1507.3) `alert` 그림 시험을 더한다. 다른 Icon 시험과 `src/components/ui/classes.test.ts`는 고치지 않은 채 통과한다. `docs/UI_GUIDE.md`는 '아이콘·로고' 줄에 `alert`와 개수(22개)·쓰는 곳(업무일지 잘림 안내) 한 마디, '업무일지 양식' 크기 표의 업무사항 줄 아래에 "업무사항은 그날 고른 크기(8·9·10·11·12·14·16pt, 기본 11)이고 위 값 × 크기/11이다. 날짜 줄 아래 [가−]·[가+]로 고르고 그날 일지에 저장한다(specs/worklog-memo-font). 휴대폰은 보기만, 인쇄도 같은 크기" 한 줄만 더한다

## Phase 3 — 잇기 (혼자, Phase 2 뒤)

## TASK-7: 화면·날짜별 값·자동 저장 한 벌에 잇기
- Phase: 3 · 혼자
- AC: AC-1508.1, AC-1508.2, AC-1508.3, AC-1508.4, AC-1508.5, AC-1508.6, AC-1508.7, AC-1508.8, AC-1508.9
- REQ: REQ-1508
- Files: src/components/worklog/useWorklogDay.ts, src/components/worklog/useWorklogDay.test.tsx, src/components/worklog/WorklogScreen.tsx, src/components/worklog/WorklogScreen.test.tsx, src/components/worklog/worklogSession.ts, src/components/worklog/worklogSession.test.ts
- Tests: src/components/worklog/useWorklogDay.test.tsx, src/components/worklog/WorklogScreen.test.tsx, src/components/worklog/worklogSession.test.ts
- TDD: required — `lib/storage/worklogDays`·`lib/supabase/browser`·`useBridge`는 지금 시험처럼 `vi.mock`, 시간은 가짜 타이머, 터치 기기는 시험이 `matchMedia`를 만든다(design.md '화면 잇기'). 먼저 `useWorklogDay.test.tsx:388`·`:580`·`:594`·`:608`의 `serverDay` 기대에 다섯째 인자 `11`을 더하고 새 시험을 더해 RED를 본다: 저장된 14가 양식·툴바에 보임, 줄 없는 날·`memoFontPt` 없는 응답은 11, 전날 14여도 새 날 11, [가+] → 화면 12·`changeMemoFont` 한 번·`saveWorklogDay(client, 날짜, {}, undefined, 12)`·상태 글, 불러오는 중·실패·끝 크기에서 누름은 아무 일 없음, 날짜 옮겼다 돌아옴·앱 안 이동 뒤 저장 안 된 크기가 보임, 다시 읽기가 다른 PC 크기를 반영(저장 안 된 크기는 그대로·저장 안 부름), **비트 채우기·[비트 숫자로 바꾸기]·[지금 불러오기]·칸 고치기 뒤 크기 그대로이고 그 저장에 다섯째 인자가 없음**(`setCell`·`editBit`·`slotOf`가 크기를 이어 가는지), 터치 기기는 14로 보이고 단추·안내 없음·저장 없음, 양식이 `onMemoOverflow(true)`를 알리면 안내 보임·`false`면 사라짐·불러오는 중엔 없음(양식은 진짜 `WorklogSheet`를 쓰고 textarea 크기만 시험이 정함), `worklogSession`의 `save`가 크기 있으면 다섯 인자·없으면 지금처럼(`worklogSession.test.ts:77` 그대로), 로그아웃 뒤 크기 11. 위 한 줄 말고 지금 시험은 고치지 않은 채 통과해야 한다

## Phase 4 — 확인 (혼자, Phase 3 뒤)

## TASK-8: 화면 확인(1440·700·390·인쇄)과 전체 검사
- Phase: 4 · 혼자
- AC: AC-1509.1, AC-1509.2
- REQ: REQ-1509
- Files: src/components/worklog/WorklogSheet.tsx, src/components/worklog/WorklogSheet.test.tsx, src/components/worklog/sheet.module.css, src/components/worklog/WorklogToolbar.tsx, src/components/worklog/WorklogToolbar.test.tsx, src/components/worklog/WorklogScreen.tsx, src/components/worklog/WorklogScreen.test.tsx
- Tests: src/components/worklog/WorklogSheet.test.tsx, src/components/worklog/WorklogToolbar.test.tsx, src/components/worklog/WorklogScreen.test.tsx
- TDD: required — 찍는 법은 specs/auth design.md '화면 확인 방법'과 같다: scratchpad의 Node 가짜 Supabase(가짜 사용자·승인 병원, 지어낸 `worklog_days` 줄: 긴 업무사항·크기 11인 날, 크기 8·16인 날, 크기 14인 날, `bit_fields` 있는 날. 저장 upsert는 받아서 그 줄을 바꿈), 명령 환경 변수(`.env*` 파일 아님)로 그 서버를 보는 `npm run dev`, 세션은 찍기 스크립트가 쿠키로 넣는다(앱 코드에 우회 길 없음, 토큰 값을 남기지 않음). `dev-browser`로 1440×900(크기 11 잘림 안내 있음 → [가−]로 줄여 안내 사라짐, 8·16 끝 단추 막힘), 700×900 마우스(셋째 줄·44px), 390×844 터치 흉내(`hasTouch`·`isMobile`, 크기 14·단추 없음), 인쇄(`page.pdf` A4, 쪽 수 1·단추·안내 없음·고른 크기)를 찍고 `scrollWidth ≤ clientWidth`를 잰 뒤 시안 `docs/mockups/worklog/memo-font.html`과 나란히 본다. 다른 점을 고칠 때는 그 모양을 보는 시험을 먼저 고쳐 RED를 본 뒤 고친다. 의도한 차이는 design.md '시안과 다른 곳'뿐이다. 고칠 것이 없으면 파일을 바꾸지 않는다. 끝에 `python3 ~/.claude/harness/bin/verify`를 돌리고(다른 일이 없을 때) 사진을 사용자에게 쉬운 말로 보인다. 사진·스크립트·가짜 서버는 저장소에 넣지 않는다. 끝나면 서버·브라우저를 멈춘다

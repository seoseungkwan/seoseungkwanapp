# 요구사항: 업무일지 업무사항 글씨 크기

> 기능 ID: `worklog-memo-font` · 형식: 요구사항은 `### REQ-1501: 제목`, 수용 기준은 `- AC-1501.1: Given/When/Then`.
> 각 AC는 시험 하나 이상으로 검증하고, 시험 이름에 AC ID를 넣는다. 화면 확인 TASK(TASK-8)는 사진과 전체 검사로 본다(tasks.md).
> 번호: REQ-1501~1509(다른 명세와 겹치지 않음: 1101 claim-guard, 1201 treatment-trend, 1301 fu-rate, 1401 reception-phone).

## 배경 / 목표
- 업무일지 탭의 '업무사항' 칸(엑셀 G4, 칸 셋을 합친 큰 칸)은 글씨 크기가 하나(엑셀 11pt)라 글이 길면 칸 아래가 잘린다. 사용자가 그날 글 양에 맞게 **업무사항 칸 글씨만** 키우거나 줄이고 싶어 한다
- 승인 시안: `docs/mockups/worklog/memo-font.html`(2026-11-05 사용자 승인). 시안의 글은 지어낸 예시다. 시안의 '제가 정한 부분'을 그대로 지킨다. 앱 화면 때문에 다르게 정한 곳은 `design.md` '시안과 다른 곳'에 있다
- 기존 업무일지 명세 `specs/worklog`(승인됨)는 고치지 않는다. 이 명세가 덧붙이는 것과 바뀌는 시험 기대는 `design.md` '기존 명세·시험과의 관계'에 있다

## 이미 정한 것 (다시 묻지 않는다)
사용자 결정(2026-11-05):
1. 크기는 **그날 일지에 저장**한다. 그래서 그 날짜 일지는 다른 PC·휴대폰·인쇄에서 같은 크기로 보인다

시안 '제가 정한 부분'(사용자가 시안과 함께 승인):
2. 크기는 엑셀처럼 pt 숫자로 고른다: **8 · 9 · 10 · 11 · 12 · 14 · 16**. 처음은 **11**(지금 크기)이다
3. 날짜 줄에 **업무사항 글씨 [가−] 11 [가+]**. 누를 때마다 한 칸씩 바뀌고, 끝에서는 그쪽 단추가 눌리지 않는다. 다른 칸처럼 누르면 저장되고 저장 상태 글도 다른 칸과 같다
4. 그날 일지에만 저장된다. 다른 날은 따로이고, 새 날짜 일지는 11로 시작한다(전날 크기를 이어받지 않는다)
5. 글이 칸보다 길면 날짜 줄 아래에 한 줄 "업무사항 글이 칸보다 길어서 인쇄하면 아랫부분이 잘려요. 글씨를 줄이면 다 들어갈 수 있어요."가 나온다. 다 들어가면 사라진다. 고칠 수 있는 화면(PC)에만 나온다
6. 휴대폰은 지금처럼 보기만 한다. 단추·안내가 없고 저장된 크기로 보인다
7. 인쇄도 같은 크기로 찍힌다. 단추와 안내는 인쇄되지 않는다
8. 비트에서 숫자를 불러와도 글씨 크기는 그대로다

이 명세에서 Claude가 정한 것(시안이 말하지 않음, `design.md` '시안이 말하지 않아 정한 것'):
9. 화면 크기 = 지금 업무사항 크기 × 고른 pt / 11. 그래서 PC(15px)·768px 미만(10px)·인쇄(11pt) 비율이 저절로 따라간다
10. 불러오는 중·불러오기 실패인 날은 두 단추가 눌리지 않고 잘림 안내도 없다
11. 저장된 크기가 없거나(새 칸을 넣기 전 줄) 목록 밖 값이면 11로 본다

## 요구사항

### REQ-1501: 글씨 크기 규칙
- AC-1501.1: Given `src/types/worklog.ts`, When 보면, Then `MEMO_FONT_PTS`는 정확히 `[8, 9, 10, 11, 12, 14, 16]`(작은 것부터)이고 `MEMO_FONT_DEFAULT`는 11이며 `MemoFontPt`는 이 일곱 숫자의 타입이다. `WorklogSavedDay`에는 선택 칸 `memoFontPt?: MemoFontPt`가 더해지고(없으면 11로 본다) 다른 칸 열쇠·`WORKLOG_CELL_KEYS`(32칸)·`WORKLOG_COLUMNS`는 그대로다
- AC-1501.2: Given `toMemoFontPt(value)`, When 일곱 숫자 가운데 하나를 주면, Then 그 값이다. When 그 밖(`null`·`undefined`·글자 `'14'`·7·13·15·17·0·-11·14.5·`NaN`·배열·객체)을 주면, Then 11이다
- AC-1501.3: Given `stepMemoFont(pt, step)`, When 한 칸 옆으로 가면, Then 목록 차례로 바뀐다(11→10, 11→12, 12→14, 14→16, 9→8, 16→14). When 끝에서 더 가면(8에서 -1, 16에서 +1), Then 그대로다. `canStepMemoFont(pt, step)`은 8의 -1과 16의 +1에서만 거짓이다
- AC-1501.4: Given `src/lib/worklog/memoFont.ts`, When 소스를 읽어 보면, Then React·supabase·`lib/storage`·브라우저 저장소·`console`·네트워크를 쓰지 않는 순수 함수다

### REQ-1502: 저장 칸 `memo_font_pt` (새 migration)
- AC-1502.1: Given 새 migration `supabase/migrations/20261105000200_worklog_memo_font.sql`을 auth → `20261101000100_worklog.sql` → `20261101000110_worklog_bit_fields.sql` 다음에 실행(운영과 같은 차례), When 표를 보면, Then `worklog_days` 맨 끝에 `memo_font_pt smallint not null default 11` 한 칸이 더해지고, 다른 칸(값 32칸·`bit_fields`)·RLS·정책 셋·공용 함수·다른 제약·방아쇠(없음)·표 권한·다른 칸 권한은 실행 전과 같다. 파일에는 함수·정책을 만들거나 고치거나 지우는 글과 `drop`·`revoke`·`truncate`·`delete`가 없다
- AC-1502.2: Given 실행 전에 있던 줄, When 실행 뒤 보면, Then 그 줄의 `memo_font_pt`는 11이고 다른 값·`bit_fields`는 그대로다. When 같은 파일을 한 번 더 실행하면, Then 오류 없이 그대로다
- AC-1502.3: Given 값 제약, When `MEMO_FONT_PTS`(REQ-1501의 목록, 시험이 `@/types/worklog`에서 읽음)의 일곱 값을 넣으면, Then 넣기·고치기 모두 된다. When 7·13·15·17·0·-11·100을 넣거나 고치면, Then 23514로 거부되고, null이면 23502로 거부된다. 이 칸 없이 넣은 줄은 11이다
- AC-1502.4: Given 승인된 병원 사용자, When `work_date` + `memo_font_pt`만 보낸 upsert(`insert … on conflict (hospital_id, work_date) do update`)를 하면, Then `hospital_id` 없이 내 줄이 만들어지거나 고쳐진다. 줄이 없던 날은 값 칸이 null이고 `bit_fields`는 `{}`이며, 있던 날은 다른 칸이 그대로다. When `memo_font_pt` 없이 다른 칸만 보낸 upsert를 하면, Then 저장된 `memo_font_pt`는 바뀌지 않는다. `authenticated`의 넣기·고치기 칸 권한은 `work_date`·`WORKLOG_COLUMNS` 32칸·`bit_fields`·`memo_font_pt`와 정확히 같다
- AC-1502.5: Given 로그인 안 한 사용자(anon)·다른 병원·승인 대기·거절 병원 사용자, When `memo_font_pt`를 읽거나 넣거나 고치려 하면, Then worklog REQ-004 규칙 그대로 거부(42501)되거나 0줄이고 줄은 그대로다. anon에게는 새 칸 권한이 하나도 없다

### REQ-1503: 하루 읽기·저장에 크기
- AC-1503.1: Given 하루 읽기(`loadWorklogDay`), When 부르면, Then 읽는 칸은 값 32칸·`bit_fields`·`memo_font_pt`이고(`hospital_id`는 없다) 돌려주는 값에 `memoFontPt`가 있다. 서버 값이 목록 밖이거나 null이거나 칸이 없으면 11이다. 줄이 없으면 지금처럼 null이다
- AC-1503.2: Given 저장(`saveWorklogDay`)에 다섯째 인자 `memoFontPt`(목록 안)를 줌, When 저장하면, Then upsert 한 번에 `memo_font_pt` 칸이 숫자로 함께 간다. 바뀐 칸과 `bitFields`가 없어도 `work_date` + `memo_font_pt`만 보낸다
- AC-1503.3: Given `memoFontPt`를 주지 않은 저장, When 보내면, Then `memo_font_pt` 칸을 보내지 않는다(기본값 11로 덮어 다른 PC가 고른 크기를 지우지 않는다). 지금 규칙(보내는 칸 = `work_date` + 받은 칸, `bitFields`를 주면 `bit_fields`도)은 그대로다. 목록 밖 값을 주면 그 칸은 보내지 않는다(서버로 가는 마지막 문)

### REQ-1504: 자동 저장이 크기를 나름
- AC-1504.1: Given 자동 저장 제어(`createAutosave`), When `changeMemoFont(ymd, pt)`를 부르면, Then 다른 칸처럼 800ms 묶은 뒤 `save(ymd, 바뀐 칸, 비트 칸 목록 또는 undefined, pt)`로 한 번 보낸다(바뀐 칸이 없으면 `{}`). 그 사이 크기를 또 바꾸면 마지막 크기만 간다. 상태는 저장하는 중 → 저장했어요(시각)이고, 실패 뒤 다시 하기·끊김·`retry()`·`flush()`·`hasUnsaved()`는 다른 칸과 같다
- AC-1504.2: Given 최신 크기가 서버에 있다고 아는 크기와 같음(바꿨다가 되돌림 포함)이거나 크기를 모름, When 저장하면, Then 크기를 넘기지 않아 `save`는 지금처럼 인자 둘(목록 없음) 또는 셋(목록 있음)으로만 불린다. 칸 고치기·비트 채우기만 있은 저장도 같다
- AC-1504.3: Given `serverDay(ymd, 서버 값, 초점 칸, 목록, memoFontPt)`(다섯째 인자 선택), When 다시 읽은 크기가 오면, Then 보내는 중이거나 저장 안 된 크기가 있으면 그대로 두고, 아니면 아는 크기·최신 크기가 서버 크기가 된다. 다섯째 인자가 없으면 크기를 바꾸지 않는다. 돌려주는 하루와 `pendingDay`에는 아는 크기가 `memoFontPt`로 있고, 크기를 모르면 그 칸이 없다(지금 시험의 `{ day }`·`{ day, bitFields }` 모양 그대로)
- AC-1504.4: Given 크기 저장, When 성공하면, Then 보낸 크기가 아는 크기가 된다. When 실패하면, Then 아는 크기는 그대로라 다음 시도에 다시 보낸다. 저장 중에 또 바뀌면 끝난 뒤 남은 크기만 바로 보낸다. `dispose()`(로그아웃)는 크기도 지운다

### REQ-1505: 양식의 업무사항 글씨와 잘림 재기
- AC-1505.1: Given `WorklogSheet`의 새 prop `memoFontPt`(없으면 11), When 그리면, Then 업무사항 칸(`td`)의 인라인 CSS 변수 `--memo-pt`가 그 숫자이고, `sheet.module.css`의 `.sheet .memo` 글씨는 `calc(var(--c11) * var(--memo-pt, 11) / 11)`다. 그래서 11일 때 PC 15px·768px 미만 10px·인쇄 11pt로 지금과 같고, 다른 크기는 그 비율이다(예: 16 → PC 약 21.8px·인쇄 16pt). 칸 높이·폭·줄 간격 비율(1.35)·다른 칸 글씨는 그대로다
- AC-1505.2: Given 인쇄 CSS, When 읽어 보면, Then 인쇄 `.sheet`의 `--c11`은 11pt 그대로이고 업무사항 글씨는 화면과 같은 규칙(위 calc)이라 고른 크기로 찍힌다. 업무사항 칸은 지금처럼 `overflow: hidden`이고 줄 높이 합은 634.5pt 그대로다. `--memo-pt`는 양식 CSS의 허용 변수 목록(`sheet.style.test.ts`)에 든다
- AC-1505.3: Given 업무사항 칸, When 글이 칸을 넘는지(`scrollHeight > clientHeight + 1`)가 바뀌면, Then 새 prop `onMemoOverflow(넘음)`을 바뀔 때만 한 번 부른다. 다시 재는 때는 업무사항 글이 바뀔 때·크기가 바뀔 때·창 크기가 바뀔 때·글꼴을 다 읽었을 때(`document.fonts.ready`, 없으면 건너뜀)다. 화면이 내려가면 듣기를 뗀다
- AC-1505.4: Given 새 prop 둘을 주지 않은 지금의 그리기, When 그리면, Then 칸·글자·`aria-label`·합친 칸·읽기 전용·빨간 칸·비트 표시가 지금과 같다(worklog REQ-008 시험이 그대로 통과한다)

### REQ-1506: 날짜 줄 글씨 단추
- AC-1506.1: Given `WorklogToolbar`의 새 prop `memoFont`(`{ pt, disabled, overflow, onStep }`), When 그리면, Then 지금 날짜 줄(전날·날짜 고르기·다음 날·오늘로·상태 글·[인쇄]) 바로 아래 줄 오른쪽 끝에 묶음(`role="group"`, 이름 "업무사항 글씨 크기")이 있고, 차례대로 글자 "업무사항 글씨", [가−](이름 "업무사항 글씨 작게"), 지금 크기 숫자(`output`, `aria-live="polite"`), [가+](이름 "업무사항 글씨 크게")다. 첫 줄의 글·단추·차례는 그대로다
- AC-1506.2: Given 단추, When [가−]를 누르면 `onStep(-1)`, [가+]를 누르면 `onStep(1)`을 한 번 부른다. 크기가 8이면 [가−], 16이면 [가+]가 눌리지 않는다(`disabled`). `disabled`가 참이면(불러오는 중·불러오기 실패) 둘 다 눌리지 않는다
- AC-1506.3: Given `memoFont`가 없음(`undefined`·`null`, 터치 기기), When 그리면, Then 글씨 묶음과 잘림 안내가 없고 단추 수는 지금과 같다(worklog 명세의 단추 수 시험 그대로). 툴바 전체가 인쇄에서 숨으므로(`print:hidden`, 지금 그대로) 단추·안내는 찍히지 않는다
- AC-1506.4: Given 단추 모양, When 그리면, Then 두 단추는 보조 단추(`ds.button.secondary`) 정사각형이고 768px 미만에서 단추·숫자 칸 높이가 44px 이상이다(worklog 날짜 줄 규칙과 같게). 양식 CSS Module을 쓰지 않는다(앱 규칙, worklog 엑셀 서식 예외 규칙)

### REQ-1507: 잘림 안내
- AC-1507.1: Given `memoFont.overflow`가 참이고 `memoFont.disabled`가 거짓, When 그리면, Then 글씨 줄 바로 아래 한 줄에 경고 그림(공용 아이콘 `alert`, `text-negative`)과 글 "업무사항 글이 칸보다 길어서 인쇄하면 아랫부분이 잘려요. 글씨를 줄이면 다 들어갈 수 있어요."가 있다. 오류 카드가 아니다(`ErrorCard`·`role="alert"`를 쓰지 않는다)
- AC-1507.2: Given `overflow`가 거짓이거나 `disabled`가 참이거나 `memoFont`가 없음, When 그리면, Then 안내 줄이 없다
- AC-1507.3: Given 공용 아이콘(`src/components/common/Icon.tsx`), When 보면, Then `ICON_NAMES` 끝(`reload` 뒤)에 `alert`가 더해져 22개이고, 그림은 `info`와 같은 원(반지름 6) 안에 세로 줄과 점이 위아래가 바뀐 모양(시안 `ICON_WARN`)이다. 다른 아이콘 그림은 그대로다

### REQ-1508: 업무일지 화면에 잇기
- AC-1508.1: Given 서버에 크기 14가 저장된 날, When PC에서 그 날을 열면, Then 읽기가 끝난 뒤 업무사항 칸의 `--memo-pt`가 14이고 날짜 줄 숫자가 14다. 줄이 없는 날과 `memoFontPt`가 없는 응답은 11이다. 전날이 14여도 처음 여는 다음 날은 11이다(이어받지 않는다)
- AC-1508.2: Given 읽기가 끝난 날(PC), When [가+]를 누르면, Then 화면 크기가 바로 한 칸 커지고(11 → 12) 자동 저장의 `changeMemoFont(그날, 12)`가 한 번 불리며, 나가는 저장은 `saveWorklogDay(클라이언트, 그날, 바뀐 칸, 목록 또는 undefined, 12)`이고 상태 글은 다른 칸과 같다(저장하는 중이에요 → 저장했어요 · 시각). 끝 크기에서 누름·불러오는 중·불러오기 실패인 날은 아무 일도 없다
- AC-1508.3: Given 크기를 바꾼 날, When 다른 날로 옮겼다가 돌아오거나 앱 안 다른 탭에 갔다 오면, Then 저장 안 된 크기까지 그대로 보이고(자동 저장의 `pendingDay`), 옮겨 간 날은 그날 크기다
- AC-1508.4: Given 다른 PC가 같은 날 크기를 바꿈, When 다시 읽기(60초마다·다시 보일 때·그 날로 돌아올 때)가 오면, Then 이 화면에 저장 안 된 크기가 없으면 새 크기로 바뀌고 있으면 그대로다. 다시 읽기만으로는 저장을 부르지 않는다. 읽은 크기는 `serverDay`의 다섯째 인자로 넘긴다(줄이 없으면 11)
- AC-1508.5: Given 크기 14인 날, When 비트 숫자가 저절로 채워지거나 [비트 숫자로 바꾸기]·[지금 불러오기]를 하거나 다른 칸을 고치면, Then 화면 크기는 14 그대로이고 그 저장들에는 크기가 없다(`saveWorklogDay`가 다섯째 인자 없이 불린다)
- AC-1508.6: Given 터치 기기(`(hover: none) and (pointer: coarse)`), When 크기 14인 날을 열면, Then 업무사항이 14로 보이고 글씨 묶음·잘림 안내가 없으며 저장을 부르지 않는다. 상태 글은 지금처럼 "휴대폰에서는 보기만 할 수 있어요"다
- AC-1508.7: Given PC에서 업무사항 글이 칸을 넘음(양식이 `onMemoOverflow(true)`를 알림), When 그리면, Then 잘림 안내가 보이고, 양식이 `false`를 알리면(글씨를 줄임·글을 지움) 사라진다. 불러오는 중·불러오기 실패인 날에는 보이지 않는다
- AC-1508.8: Given 자동 저장 한 벌(`worklogSession.ts`), When 자동 저장이 크기를 넘기면, Then `saveWorklogDay`를 다섯 인자(클라이언트, 날짜, 바뀐 칸, 목록 또는 undefined, 크기)로 부른다. 크기를 넘기지 않으면 지금처럼 인자 셋(목록 없음) 또는 넷(목록 있음)이다
- AC-1508.9: Given 로그아웃(30분 자동 로그아웃 포함), When 화면 값을 지우면, Then 크기도 지워져 그 뒤 처음 그림의 크기는 11이다

### REQ-1509: 화면 확인과 전체 검사
- AC-1509.1: Given 가짜 Supabase(지어낸 업무일지 줄)와 개발 서버, When 업무일지 화면을 1440×900(크기 11·8·16, 잘림 안내가 있음·없음), 700×900 좁은 PC 창(마우스), 390×844 터치 기기 흉내(크기 14가 저장된 날), 인쇄(PDF)로 찍으면, Then 가로 스크롤이 없고, 글씨 묶음·안내의 글과 차례가 시안과 같으며, 인쇄는 A4 한 장에 고른 크기로 찍히고 단추·안내가 없다. 다른 점은 `design.md` '시안과 다른 곳'에 있는 것뿐이다. 사진·찍기 스크립트·가짜 서버는 scratchpad에 두고 저장소에 넣지 않는다
- AC-1509.2: Given 모든 TASK가 끝남, When `python3 ~/.claude/harness/bin/verify`(`npm test`·`npm run lint`·`npm run build`)를 돌리면, Then 통과한다(서버에 다른 일이 없을 때 돌린다)

## 범위 밖
- 업무사항 말고 다른 칸(숫자·비고·항목 이름·제목)의 글씨 크기, 글꼴·굵기·색 바꾸기
- 칸 높이 늘리기·인쇄 두 장으로 나누기·글이 길면 저절로 줄이기(사용자가 크기를 고른다)
- 크기를 다음 날로 이어 가기, 병원·계정 기본 크기 설정(그날만)
- 휴대폰에서 크기 바꾸기(보기만)
- 키보드 단축키·Ctrl+휠로 크기 바꾸기
- 실제 Supabase로 도는 자동 E2E(사용자가 올린 뒤 손으로 확인, `design.md` '사용자가 할 일')
- 운영 Supabase에 SQL을 붙여 넣는 일과 사이트에 올리는 일(사용자 단계)

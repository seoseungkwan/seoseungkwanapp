# 요구사항: 접수 현황 수정 묶음 — 보류 노랑·어레인지 메모·지난 진료기록부·충격파 타수

> 기능 ID: `reception-memo-papers` · 번호는 3401부터. 시안 `docs/mockups/reception-memo-papers/Mock.html`(사용자 승인 2026-11-11 "진한노랑 · 고를수있게 · ㅇㅇ좋아 · 그냥지우고 되돌리기 만들어"). 그 밖은 reception-phone·reception-paper·reception-arrange 명세 그대로다.

## 요구사항

### REQ-3401: 진료보류 이름표 진한 노랑
- AC-3401.1: Given `theme.css`, When 살피면, Then `--status-hold-bg` #FFD43B · `--status-hold-fg` var(--ink) · `--status-hold-line` #C9A100이고, 접수 현황 목록·태블릿·어레인지·기록부의 진료보류 이름표가 모두 이 값을 쓴다. 두 노랑은 로고 노랑(`--accent`)·SONO 노랑·다른 상태 색과 다르다(AC-1407.7 시험의 색 목록에 더함)

### REQ-3402: 충격파 타수·부위 수 따로 고르기
- AC-3402.1: Given 충격파 고르기 목록(C# `ArrangeChoices`와 화면 `CHOICES`가 같은 글), When 살피면, Then "1부위"~"4부위" 넷과 "{타수} {N부위}" 열여섯(타수 2000타·3000타·4000타·6000타)이다. 다른 글은 쓰기에서 400이다
- AC-3402.2: Given 빈 충격파 칸, When 누르면, Then 창 "충격파 직접 넣기"에 [타수] 넷·[부위 수] 넷 두 줄과 [닫기]·[넣기]가 있다. 부위 수를 고르기 전에는 [넣기]가 꺼져 있고, 타수는 안 골라도 된다(사용자 결정 2026-11-11). 고른 단추를 다시 누르면 풀린다. [넣기 · 3000타 2부위]는 `add` v="3000타 2부위"(타수 없으면 "2부위")를 보낸다
- AC-3402.3: Given 충격파 칸, When 그리면, Then 타수가 있으면 타수가 위·부위 수가 아래다(준비: "준비 / 3000타 / 2부위", 완료: "✓ HH:MM / 4000타 / 3부위"). 열 머리 작은 글은 "타수·부위 수"다

### REQ-3403: 어레인지 메모 (이 기기에만)
- AC-3403.1: Given 어레인지 탭 머리, When 그리면, Then 로고 옆에 메모 칸이 있다(접수 현황 탭·기록부 화면에는 없음). 메모가 없으면 점선 "메모 쓰기 · 펜이나 글자로", 있으면 빨간 테두리·오른쪽 위 빨간 점·[메모] 이름표·글 첫 줄(글이 없으면 "손글씨 메모")·손글씨 작은 그림·[✕]다. 태블릿 모양이 아니면 로고 줄 아래 한 줄이다
- AC-3403.2: Given 메모 칸, When 누르면, Then 큰 창에 "이 기기에만 저장돼요" 안내·글자 칸·펜 도구 [검정]·[빨강]·[지우개]·[펜 글씨 모두 지우기]·그리기 판(펜 압력으로 굵기, 손가락도)·[메모 지우기]·[닫기]가 있다. [닫기]나 창 바깥을 누르면 저장하고 닫는다
- AC-3403.3: Given 저장, When 쓰면, Then 이 기기 `localStorage` 열쇠 `reception-memo` 하나에 `{ v: 1, text, ink: PNG data URL | null }`만 담고, 글도 그림도 없으면 열쇠를 지운다. 다시 그리기·새로 고침·끊김 뒤에도 남는다. 서버로 보내지 않는다
- AC-3403.4: Given [✕]·[메모 지우기], When 누르면, Then 바로 지우고 띠 "메모를 지웠어요" [되돌리기]가 5초 보인다. [되돌리기]는 앞 메모를 다시 저장한다
- AC-3403.5: Given 저장소를 못 씀(막힘·꽉 참)·읽은 값 모양이 틀림, When 읽고 쓰면, Then 빈 메모로 보이고, 저장 실패면 띠 "메모를 이 기기에 저장하지 못했어요"가 보인다. 화면은 멈추지 않는다
- AC-3403.6: Given 메모 색, When 살피면, Then 새 색(`--memo-red` #E03131·`--memo-red-soft` #FFF1F1·`--memo-ink` #222222)은 `theme.css` `:root`에만 있고 펜 색도 그 값을 읽어 쓴다(AC-1407.7)

### REQ-3404: 지난 진료기록부 여러 장
- AC-3404.1: Given `GET /api/visit/{k}/papers?from=N`, When 받으면, Then from=0이면 최근 순 1~2번째, from>0이면 from+1~from+3번째 지난 완료 내원의 종이 `{ papers: [{ date, ago, room, ins, sym, dx, rx, out }], total, next }`를 200으로 준다(`total` 지난 내원 수, `next` 더 있으면 다음 from·없으면 null, 칸 모양은 `/prev`와 같음). 틀린 열쇠·from·그날 판에 없는 내원은 비트를 읽지 않고 404, 읽기 실패·8초 넘음은 503이다
- AC-3404.2: Given 새 문장 `PastPaperVisits`·`PastPaperSymptoms`·`PastPaperDx`·`PastPaperOrders`, When 살피면, Then `@chart`·`@before`·`@hospital`·`@first`·`@last`를 받는 SELECT 상수이고 `Sql.IsAllowed`가 받으며, 상세 `HistoryCount`·`HistoryPage`와 같은 지난 내원(그 접수보다 앞선 완료 내원·병원 범위)의 Seq 범위 줄만 내원번호와 함께 준다. 사람 칸(주민번호·주소·전화·특이사항)은 읽지 않는다. 증상·처방 글은 `/prev`와 같은 규칙이다
- AC-3404.3: Given 상세(폰 `#/v/{k}`·태블릿 오른쪽 칸), When 그리면, Then "지난번 증상" 자리가 "지난 진료기록부"다: `papers?from=0`을 읽어 장마다 머리(첫 장만 [지난번] · "M월 D일" · "N일 전")와 종이 카드(`.paper.past`, 직전 기록부와 같은 모양)다. 지난 내원이 없으면 "첫 방문이라 지난 진료가 없어요."
- AC-3404.4: Given `next`가 있음, When 그리면, Then [이전 진료기록부 더 보기 ▾]와 "N번 더 있어요 · 누를 때마다 3장씩"이 있고, 누르면 `papers?from=next`를 읽어 아래에 붙인다. 읽는 중에는 다시 보내지 않고, 실패하면 "지금 기록부를 읽지 못했어요"와 함께 다시 누를 수 있다
- AC-3404.5: Given 상세가 열려 있음, When 목록·오늘 종이를 저절로 다시 읽으면, Then 지난 종이는 다시 읽지 않고 펼친 장·세로 위치를 지킨다. 첫 읽기가 실패하면 그 자리에 "지금 기록부를 읽지 못했어요" 한 줄이다. 숨김·끊김이면 지운다(AC-1407.4)

### REQ-3405: 울타리
- AC-3405.1: Given ESLint 울타리, When 살피면, Then 브라우저 저장소 예외는 `reception/www/memo.js`의 `localStorage` 하나뿐이다. memo.js도 `sessionStorage`·`indexedDB`·`caches`·`cookie`·console·바깥 fetch는 막히고, 다른 화면 파일의 `localStorage`는 그대로 막힌다(`src/guardrails.test.ts`가 증명)
- AC-3405.2: Given memo.js, When 살피면, Then `fetch`·`api.js`·판 자료를 쓰지 않는다(메모에 서버 자료가 들어가지 않는다)

## 범위 밖
- 메모를 다른 기기와 나누기·서버 저장·여러 장·날짜별 메모
- 어레인지 기록부 화면(`#/a/v/{k}`)의 직전 기록부 여러 장(지금 한 장 그대로)
- 충격파 칸을 넣은 뒤 타수만 바꾸기(빼고 다시 넣기)
- 7층 와이파이, helper.yml 빌드 조건, WorkLock 시험 흔들림

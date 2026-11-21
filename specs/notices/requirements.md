# 요구사항: 고시·공지 탭

> 기능 ID: `notices` · 형식: `### REQ-7401: 제목`, 수용 기준 `- AC-7401.1: Given/When/Then`.
> AC마다 시험 하나 이상, 시험 이름에 AC ID. 번호는 7401부터다(다른 명세는 7304까지).

## 배경 / 목표
- 2026-11-21 사용자 인터뷰(메모 `notices-interview.md`)로 정했다. 여러 사이트의 새 글을 한곳에서 훑는다.
- 승인 시안: `docs/mockups/notices/index.html`·`notes.md`(커밋 563aaf0b). 승인: 2026-11-21, 사용자 "이대로 좋아요". 화면 글자는 `notes.md` '화면 글자'를 글자 그대로 옮긴다. 시안에 없거나 바꾼 글자·동작은 아래 '기본값'에 모았다.
- **출처 셋**: 심평원 공지 · 심평원 심사기준(보험인정기준의 고시·행정해석·심사지침·공개사례 탭) · 보건복지부(훈령/고시 RSS). 의사협회는 Vercel 서울 서버에서 접속이 막혀 뺐다(2026-11-21, 사용자 결정). 건보공단(robots 금지)·회원 전용 사이트도 뺀다. 사이트 규칙(robots)을 지킨다: 복지부는 RSS 글만 읽는다.
- 같은 고시가 여러 곳에 오면 고시 번호로 한 줄로 묶는다. 요약은 묶음마다 한 번이고 승인된 모든 병원이 같은 목록을 본다(판단 기준은 정형외과 의원). 데스크 계정은 못 본다.
- 매일 아침 07시대(Vercel 무료판 Cron)에 새 글을 확인한다. 2026-01-01부터의 지난 글은 같은 날 두 시간마다 더 도는 실행이 채워 하루쯤에 끝낸다(design 4절).
- AI는 모두 `claude-opus-5-5`(사용자). 어림 비용(사용자에게 알림): 처음 채우기 8~17만 원, 매달 약 1.5만 원. 첫 주 실제 비용은 실행 기록으로 재서 알린다.
- **내 낱말(꼭 볼 글, REQ-7424)**: 2026-11-21 승인 뒤 사용자 추가 요청("그 내가 꼭 봐야하는 키워드는 내가 선택할수 있게해"). 병원마다 고른 낱말이 든 글을 '꼭 볼 글'로 표시하고 관련 글만·탭 숫자·대시보드에 넣는다. 시안 `notes.md` '더한 것: 내 낱말'(승인 기다림). 이미 있는 AC는 바꾸지 않고 REQ-7424로만 더한다.

## 기본값 (시안에 없거나 시안과 다른 글자·동작)
1. **오늘·어제**: `{출처} 오늘 {시각} 확인`·`{출처}: 어제부터 못 가져왔어요`·`새 관련 글이 없어요 · 오늘 {시각} 확인`의 '오늘'·'어제'는 실제 날짜에 따라 `오늘`·`어제`·`11월 18일 (수)`로 바꾼다(시안 글은 그 한 예).
2. **못 가져옴 띠 글**: 가져온 적이 없으면 '마지막으로 … 가져왔어요.' 문장을 뺀다. 다른 곳이 모두 오늘 성공하지 못했으면 '다른 곳 글은 오늘 아침에도 잘 가져왔어요.' 문장을 뺀다.
3. **처음 채우기 띠**: `{전체}`는 지금까지 목록에서 찾은 글 수라 채우는 동안 늘 수 있다. `{채운}`은 요약이 끝난(실패 포함) 글 수, 퍼센트는 버림이다.
4. **본문만 요약한 이유**: 붙임이 있는데 읽지 못한 글(옛 HWP 등)은 `붙임 파일을 읽지 못해 본문만 보고 요약했어요. 붙임 파일은 원문에서 확인해 주세요.` 시안 글(`보건복지부는 붙임 파일 가져가기를 막아 두어 …`)은 붙임이 없고 보건복지부 글이 든 묶음에만 쓴다. 붙임 없는 심평원 글만의 묶음은 이유 줄이 없다.
5. **붙임 없음 글** `붙임 파일은 원문에서 받아 주세요.`는 붙임이 없고 보건복지부 글이 든 묶음에만 보인다. 붙임 없는 심평원 글만의 묶음은 붙임 칸이 없다.
6. **요약 실패**(3번 실패한 글): 칩 없이 `요약을 만들지 못했어요. 원문에서 확인해 주세요.` 관련 여부를 몰라 [관련 글만]에도 보인다.
7. **글 번호 자리**: 복지부 고시 번호가 있으면 `보건복지부 고시 제2026-218호`, 없으면 심사기준 종류 `행정해석`·`심사지침`·`공개 심사사례`(시안은 마지막 것), 그 밖은 비운다.
8. **대시보드 맨 위 경고**: 확인할 글이 둘 이상이면 `새 고시 {k}개가 점검 규칙 {n}개의 근거를 바꿨어요. 규칙은 저절로 바뀌지 않아요.`이고 [글 보기]는 목록으로 간다. 하나인데 고시 번호가 없으면 `새 글이 점검 규칙 {n}개의 근거를 바꿨어요. 규칙은 저절로 바뀌지 않아요.`
9. **대시보드 칸 읽기 실패**: `고시·공지를 불러오지 못했어요`(그 칸만).
10. **탭 숫자**: 100 이상이면 `99+`(화면 읽기 글은 실제 수).
11. **안 읽음**: 올라온 지 14일(한국 날짜, 오늘 포함) 안의 글만 안 읽음으로 친다(굵은 제목·파란 점·건수·탭 숫자·대시보드). 처음 채운 지난 글이 모두 안 읽음으로 보이지 않게.
12. **오류 상자**: 목록·글 읽기 실패 `E-NOTICE-READ` — '고시·공지를 읽지 못했어요' · '인터넷 연결을 확인하고 [다시 읽기]를 눌러 주세요'. 별표·메모·규칙 확인 저장 실패 `E-NOTICE-SAVE` — '저장하지 못했어요' · '잠시 뒤 다시 눌러 주세요. 적은 메모는 그대로 있어요'.
13. **메모 막힘**: `환자 정보로 보이는 글자가 있어 저장하지 않았어요` · `{종류}로 보이는 글자를 지우고 다시 눌러 주세요.`
14. **묻기 실패 글**(`답을 받지 못했어요. …`)은 막힘·다 씀 밖의 모든 실패(AI 바쁨·한도·망 끊김·글 없음)에 쓴다.
15. **주간 모음**: 관련 글이 0개인 주는 '이번 주 꼭 알 것 3가지' 칸을 그리지 않고 `글별 요약` 옆은 `정형외과 의원 관련 0건`이다. 병원 이름이 없으면 ` · {병원 이름}`을 뺀다.
16. **찾기**: 앞뒤 공백을 뗀 1~50자, 빈칸으로 나눈 낱말 5개까지(넘는 낱말은 버림), 낱말이 모두 든 글만.
17. **링크 곳**: [점검 규칙 보기]는 `/settings#rule-settings-title`(설정의 '점검 규칙' 칸). [글 보기]·대시보드 줄은 `/notices?id=<글 id>`.
18. **대시보드 기능 목차 설명**은 쪽 안내 글 `심평원·보건복지부 새 글을 매일 아침 모아 AI가 요약해요.`를 그대로 쓴다.
19. **내 낱말 한도**: 병원마다 0~30개, 낱말마다 다듬은 뒤(이어진 빈칸은 하나로, 앞뒤 공백 뗌) 1~20자. 띄어쓰기·영문 대소문자만 다른 낱말은 같은 낱말이라 하나만 둔다. 처음엔 0개이고 추천 낱말 12개 `도수치료`·`체외충격파`·`물리치료`·`관절강내 주사`·`신경차단술`·`증식치료`·`MRI`·`초음파`·`골다공증`·`비급여`·`본인부담`·`비대면 진료`(이 차례)를 눌러 넣거나 직접 적는다. 환자 정보 모양(AC-7413.1)이면 기본값 13 글로 막는다. 누르면 바로 저장한다. 승인된 원장 계정만 보고 고친다(데스크는 탭을 못 본다).
20. **낱말 저장 실패** `E-NOTICE-WORDS` — '낱말을 저장하지 못했어요' · '잠시 뒤 다시 눌러 주세요. 고른 낱말은 그대로 있어요'. 낱말 읽기 실패는 `E-NOTICE-READ`.
21. **꼭 볼 글**: 제목·본문·붙임 글자·AI 요약 네 칸(`what`·`when`·`who`·`forUs`)을 칸마다 따로 본다(칸 끝과 다음 칸 처음을 잇지 않음). 꼭 볼 글은 [관련 글만]·탭 숫자·대시보드 칸 수와 줄에 든다(안 읽음은 기본값 11 그대로). 칩은 목록 줄에서 낱말 2개까지 + ` 외 {n}개`, 글 화면에서 모두다. 대시보드 칸 줄 모양은 그대로다(칩 없음).

## 요구사항

### REQ-7401: 공용 모양 · 오류 번호 · 글자 도구
- AC-7401.1: Given `errorInfo`, When `E-NOTICE-READ`·`E-NOTICE-SAVE`를 찾으면, Then 기본값 12의 무엇이·어떻게 글이다.
- AC-7401.2: Given `htmlToText`, When 태그·`<script>`·`<style>`·실체(`&nbsp;` `&amp;` `&middot;` `&#12345;` 등)가 섞인 HTML을 주면, Then 스크립트·스타일 글은 빼고 실체를 풀고 `<br>`·`</p>`·`</li>`·`</tr>`·`</div>`는 줄바꿈, 줄마다 빈칸을 하나로 줄인 글자다. `escapeTags`는 `<`·`>`를 `‹`·`›`로, `cutText(s, n)`은 앞 n자만 남긴다.

### REQ-7402: DB 표와 권한
- AC-7402.1: Given migration `20261121000000_notices.sql`, When 두 번 실행하면, Then 두 번째도 오류가 없고 표 아홉(`notices`·`notice_posts`·`notice_sources`·`notice_weeks`·`notice_runs`·`notice_collectors`·`notice_marks`·`notice_ask_days`·`notice_ask_holds`)이 RLS가 켜진 채 있고 anon은 어느 표도 읽고 쓰지 못한다.
- AC-7402.2: Given 승인된 원장, When 공용 표 넷(`notices`·`notice_posts`·`notice_sources`·`notice_weeks`)을 읽으면, Then 모든 줄이 보이고 넣기·고치기·지우기는 거부된다. Given 승인 대기·거절 원장·데스크 계정·병원 없는 계정, Then 0줄이다.
- AC-7402.3: Given `notice_collectors`에 있는 계정(모으기 계정), When 공용 표 넷에 넣고 고치면, Then 되고 지우기는 거부된다. 목록에 없는 계정(관리자 포함)은 넣기·고치기가 거부되고, 누구도 `notice_collectors`를 넣고 고치지 못한다(SQL 편집기만).
- AC-7402.4: Given 줄 제약, When 넣으면, Then `notice_posts.url`과 `attachments` 안 주소가 `https://www.hira.or.kr/`·`https://www.mohw.go.kr/`로 시작하지 않거나, `source`·`kind`·`state`·`read_mode`가 정한 값 밖이거나, 제목이 1~300자가 아니거나, `body`·`attach_text`가 20,000자, `attachments`가 10개, `rule_hits`가 50개를 넘으면 거부된다. `notice_weeks.week_start`는 월요일만 된다.
- AC-7402.5: Given 승인된 원장, When `notice_marks`를 다루면, Then 내 병원 줄만 읽고 넣고 고친다(지우기 없음). `hospital_id`는 DB 기본값으로만 들어가고 `memo`는 500자까지다. 데스크·다른 병원·모으기 계정은 읽지도 쓰지도 못한다.
- AC-7402.6: Given `notice_runs`·`notice_ask_days`·`notice_ask_holds`, When 읽으면, Then `notice_runs`는 관리자와 모으기 계정만 보이고 나머지 둘은 누구도 직접 읽고 쓰지 못한다.

### REQ-7403: DB 함수
- AC-7403.1: Given `notice_start_run()`, When 모으기 계정이 부르면, Then 끝나지 않은 실행이 6분 안에 시작됐으면 null, 아니면 새 줄 id다. 다른 계정은 42501이다. `notice_add_run_usage`·`notice_finish_run`도 모으기 계정만이다.
- AC-7403.2: Given `take_notice_ask()`, When 승인된 원장이 한국 날짜 하루에 부르면, Then 20번째까지 표(uuid), 21번째부터 null이고 다음 날 다시 표다. 병원마다 따로 세고, 승인 안 됨·데스크는 42501이다.
- AC-7403.3: Given 받은 표, When `end_notice_ask(표, false)`, Then 그 표를 지우고 그날 수를 1 되돌린다. `end_notice_ask(표, true)`는 표만 지운다. 없는 표·다른 병원 표·이미 쓴 표는 아무것도 바꾸지 않는다. `notice_ask_left()`는 20 − 오늘 수다.
- AC-7403.4: Given `notice_search(p_q)`, When 승인된 원장이 부르면, Then 빈칸으로 나눈 낱말(5개까지)이 모두 제목·본문·붙임 글자·요약 글(`what`·`when`·`who`·`forUs`) 안에 든 글 id를 최근 글부터 200개까지 돌려준다. `%`·`_`·`\`는 글자 그대로 찾고, 앞뒤 공백을 뗀 1~50자가 아니면 빈 목록, 데스크는 빈 목록이다.
- AC-7403.5: Given `notice_list(p_related, p_sources, p_starred, p_ids, p_unread_only, p_limit, p_offset)`, When 부르면, Then `{ total, unread, rows }`다. rows는 최근 글부터 `p_limit`(1~50)개이고 줄마다 글 칸·출처 글들(출처·제목·주소·날짜·붙임)·내 표시(읽음·별표·메모·메모 시각·규칙 확인 시각)·`unread`다. `p_related` 참이면 관련 글과 요약 전·실패 글만, `p_sources`는 그 출처 글이 하나라도 든 묶음, `p_starred`는 내 별표, `p_ids`는 그 id만, `p_unread_only`는 안 읽음만이다. `unread`는 올라온 지 14일(한국 날짜) 안이고 내 읽음 표시가 없는 것이다.
- AC-7403.6: Given `notice_unread_count()`, When 부르면, Then 관련 글 가운데 `unread`인 수다. `notice_rule_alerts()`는 규칙 연결이 있고 내 규칙 확인이 없는 글의 id·고시 번호·제목·규칙 수(최근 글부터)다. 데스크는 0·빈 목록이다.

### REQ-7404: 사이트 읽기 규칙
- AC-7404.1: Given 주소, When `fetchSite`가 부르기 전에 보면, Then 정해 둔 길(심평원 공지 목록·글, `bbs/bbsCDownLoad.do`, 보험인정기준 `InsuAdtCrtrList.do`·`InsuAdtCrtrPopup.do`, 복지부 `rss/board.es`)만 부르고 그 밖(예: 심평원 `/co/`, 복지부 `board.es?…act=view`, `http:`, 다른 host)은 부르지 않고 `'blocked-url'`이다.
- AC-7404.2: Given 부르기, When 보내면, Then 정해 둔 브라우저 모양 User-Agent이고 쿠키·인증 머리가 없으며, 돌려보내기(3xx)를 따라가지 않고 `'http'`로 끝낸다.
- AC-7404.3: Given 답, When 받으면, Then 글은 3,000,000바이트·붙임은 15,000,000바이트를 넘으면 그만 받고 `'too-big'`, 200이 아니면 `'http'`, 시간이 넘으면(글 15초·붙임 30초) `'timeout'`이다. 결과에 오류 글·주소를 담지 않는다.
- AC-7404.4: Given 같은 host로 여러 번, When 부르면, Then 한 host에 동시에 2개까지이고 같은 host 부름을 시작하는 사이가 300ms 이상이다.

### REQ-7405: 심평원 공지 읽기
- AC-7405.1: Given 목록 견본, When `parseHiraNoticeList`, Then 10줄이고 줄마다 key = `brdBltNo`, 제목('새글' 표시 뺌), 날짜 `YYYY-MM-DD`, 주소 `https://www.hira.or.kr/bbsDummy.do?pgmid=HIRAA020002000100&brdScnBltNo=4&brdBltNo=<key>`, 종류는 제목에 고시 번호가 있으면 `gosi` 아니면 `notice`다.
- AC-7405.2: Given 글 견본, When `parseHiraNoticeView`, Then 본문 글자(태그·스타일 없음)와 붙임 3개(이름·주소 `https://www.hira.or.kr/bbs/bbsCDownLoad.do?apndNo=1&apndBrdBltNo=12353&apndBrdTyNo=2&apndBltNo=157` 꼴)다.
- AC-7405.3: Given 표가 없는 쪽, When 목록을 읽으면, Then 빈 목록이다. 제목·날짜·key가 빠진 줄은 버린다.

### REQ-7406: 심평원 심사기준 읽기
- AC-7406.1: Given 탭 `01` 목록 견본, When `parseHiraCrtrList(html, '01')`, Then 10줄이고 key = `<mtgHmeDd>-<sno>-<mtgMtrRegSno>`, 제목, 관련근거 글, 날짜, 종류 `gosi`, 주소 `https://www.hira.or.kr/rc/insu/insuadtcrtr/InsuAdtCrtrPopup.do?mtgHmeDd=…&sno=…&mtgMtrRegSno=…`다. 탭 `02`·`09`·`10` 견본은 종류 `interp`·`guide`·`case`다.
- AC-7406.2: Given 팝업 견본, When `parseHiraCrtrPopup`, Then 본문은 '고시 신설/개정 전체내용'부터 '변경 전 고시' 글까지 담고 붙임은 빈 목록이다.
- AC-7406.3: Given 탭과 쪽, When `crtrListBody`, Then `tabGbn=<탭>&pageIndex=<쪽>`이다. Given 표가 없는 쪽, Then 빈 목록이다.

### REQ-7407: 보건복지부 RSS 읽기
- AC-7407.1: Given RSS 견본, When `parseMohwRss`, Then 30줄이고 key = `list_no`, 제목(CDATA 안), 날짜는 `pubDate`의 한국 날짜, 본문은 `description` 글자(실체 풂), 주소는 `link` 그대로, 종류는 고시 번호가 있으면 `gosi` 아니면 `notice`다. `author`는 담지 않는다.
- AC-7407.2: Given `item`이 없거나 XML이 아닌 글, Then 빈 목록이다.

### REQ-7408: 붙임 글자 꺼내기
- AC-7408.1: Given 바이트, When `sniffFile`, Then `%PDF`로 시작하면 `pdf`, zip(`PK`)이고 `Contents/section0.xml`이 있으면 `hwpx`, OLE 머리(`D0 CF 11 E0`)면 `hwp`, 그 밖은 `other`다.
- AC-7408.2: Given 시험이 만든 HWPX, When `hwpxText`, Then section 차례대로 `<hp:t>` 글자를 문단마다 줄을 바꿔 돌려준다. 풀린 크기 합이 30,000,000바이트를 넘거나 항목이 500개를 넘으면 null이다.
- AC-7408.3: Given 시험 PDF, When `pdfText`, Then `{ text, pages }`이고 깨진 PDF는 null이다.
- AC-7408.4: Given 한 묶음의 받은 붙임들, When `planReading`, Then PDF 먼저·그다음 HWPX로 3개까지 고르고 HWP·other는 건너뛴다. 고른 PDF가 합 18,000,000바이트·30쪽 이하이면 `full`(PDF는 파일째), 넘으면 `text`(뽑은 글자 합 60,000자까지), 읽을 붙임이 없으면 `body`다. 찾기용 `attachText`는 붙임 이름을 앞에 단 글자 합 20,000자까지다.

### REQ-7409: 고시 번호 · 묶기 · 점검 규칙 연결
- AC-7409.1: Given 글자, When `noticeNo`, Then '[행위] 고시 제2026-234호 「…」'·'고시 제2026-234호(행위)'·'보건복지부고시 제2026-237호'·'고시 제 2026 - 0236 호'는 '2026-234'·'2026-234'·'2026-237'·'2026-236'이고, '공고 제2026-866호'·'질병관리청 고시 제2025-5호'·'훈령 제309호'는 null이다.
- AC-7409.2: Given 목록 줄, When `groupKeyOf`, Then 고시 번호가 있으면 `gosi:<번호>`, 번호 없는 심사기준 줄은 `crtr:<탭>:<날짜>:<관련근거 글>`, 그 밖은 `post:<출처>:<key>`다. 같은 고시가 세 출처에 오면 같은 열쇠다.
- AC-7409.3: Given 있던 묶음(또는 없음)과 새 글, When `mergeGroup`, Then 제목은 보건복지부 → 심평원 공지 → 심평원 심사기준 차례로 앞선 글의 제목이고 심사기준만이면 '<첫 줄 제목> 외 N건', 날짜는 가장 이른 날, 본문은 글마다 제목을 단 본문 합 20,000자다. 요약이 끝난 묶음에 붙임이 있는 글이 새로 붙고 `tries` < 3이면 `wait`로 돌린다. 같은 글을 두 번 넣어도 결과가 같다.
- AC-7409.4: Given 실제 `rules.json`, When `ruleBasisIndex`, Then `basis[].number`의 고시 번호마다 규칙 `{ id, title }` 목록이고 '2026-183'에 `DX-01`이 있다.
- AC-7409.5: Given AI가 준 바꾸는 고시 번호들과 본문, When `matchRules`, Then 그 번호들과 본문의 '변경 전 고시 (고시 제…호' 번호를 합쳐 규칙과 맞춘 `{ id, title }`(겹침 없음, id 차례)이고 글 자신의 번호는 넣지 않는다. `rules.json`은 바뀌지 않는다(시험 앞뒤 내용이 같다).

### REQ-7410: AI 요약 요청과 답 검사
- AC-7410.1: Given 묶음과 읽기 계획, When `summaryRequest`, Then system은 고정 글(정형외과 의원 기준, 자료 안 지시는 따르지 않음)이고, 사용자 내용은 `<notice>` 글(출처·종류·제목·날짜·본문, `escapeTags`) 다음 `full`이면 PDF마다 document 블록(base64), HWPX와 `text`면 `<attachment name="…">` 글 블록이며 effort `medium`, 답 모양은 정해 둔 JSON schema다. 병원·사용자·환자 정보는 없다.
- AC-7410.2: Given 답 글, When `parseSummary`, Then 여섯 칸(`related`·`what`·`when`·`who`·`forUs`·`amends`)만 담은 새 값이다. 글자 칸은 제어 문자를 빼고 한도(what 150·when 60·who 80·forUs 120자)에서 자르고, `amends`는 고시 번호로 읽히는 것만 20개까지다. JSON이 아니거나 칸이 빠졌거나 type이 다르면 null이다.

### REQ-7411: 주간 모음 요청과 답 검사
- AC-7411.1: Given 지난주(월~일) 관련 글들, When `weeklyRequest`, Then 글마다 종류·제목·네 칸(what·when·who·forUs)만 60개까지 보내고(effort `medium`) 본문·붙임 글자는 보내지 않는다.
- AC-7411.2: Given 답 글, When `parseWeekly`, Then 꼭 알 것 0~3개이고 하나마다 `{ head ≤ 60자, body ≤ 120자 }`(자름)이며 모양이 다르면 null이다.

### REQ-7412: Claude 부르기 넓히기와 일괄 처리
- AC-7412.1: Given `callClaude`에 user로 내용 블록 배열, When 부르면, Then 그 배열을 그대로 보내고 fallbacks·오류 나누기·사용량 세기는 글자 user와 같다. 지금 부르는 곳(글자 user)은 그대로다.
- AC-7412.2: Given 요청들, When `submitBatch`, Then `messages.batches.create`에 `custom_id` = 글 id, params는 `model`·`max_tokens`·`output_config`·`system`·`messages`만이고 `stream`·`fallbacks`·`betas`는 없다. 몸통 합 50,000,000바이트·200개를 넘지 않게 앞에서부터 담고 못 담은 것은 돌려준다.
- AC-7412.3: Given 일괄 id, When `readBatch`, Then 끝나지 않았으면 `'processing'`, 끝났으면 `custom_id`마다 `{ ok: true, text, usage }` 또는 `{ ok: false }`(errored·expired·canceled·refusal·max_tokens)다. 일괄 비용은 `costMicroUsd`의 절반(버림)이다.

### REQ-7413: 환자 정보 모양 검사 (`lib/notices/askCheck.ts`)
- AC-7413.1: Given 글, When `privateKinds`, Then 든 모양을 `rrn`(주민번호 6-7자리·붙인 13자리)·`tel`(0으로 시작 2~3자리-3~4자리-4자리, 010 등 붙인 10~11자리, 나눔은 붙임표·점·빈칸 어느 것이든, 구역번호 괄호 '(02)'·'+82'도)·`chart`('차트·챠트·등록번호·환자번호' 뒤 2자리 이상 숫자) 차례로 돌려주고, 셋 다 없을 때만 고시 번호('제2026-218호' 꼴)를 뺀 뒤 6자리 이상 이어진 숫자가 있으면 `digits`다. 전각 숫자·전각 붙임표·긴 줄표로 적어도 같은 모양으로 본다(업무일지 `privacyProblem`처럼 맞춘 글자는 검사에만 쓴다). '010-1234-5678'·'010 1234 5678'·'010.1234.5678'·'０１０－１２３４－５６７８'·'차트 1234 확인'·'1234567 환자'는 걸리고 '43,850원'·'제2026-218호'·'2026년 12월 1일'·'MM301'은 통과다.
- AC-7413.2: Given 질문, When `checkQuestion`, Then 앞뒤 공백을 뗀 1~300자가 아니면 `'empty'`·`'too-long'`, 줄바꿈·탭 밖 제어 문자면 `'control'`, 모양이 있으면 `{ private: kinds }`, 아니면 `'ok'`다. `checkMemo`는 0~500자이고 나머지는 같다.
- AC-7413.3: Given kinds, When `kindsText`, Then `주민번호`·`전화번호`·`차트번호`·`긴 숫자`를 `·`로 잇는다.

### REQ-7414: 모으기 흐름
- AC-7414.1: Given `startRun`이 null(다른 실행이 돎), When `runCollector`, Then 사이트·Claude를 부르지 않고 `'busy'`다.
- AC-7414.2: Given 실행, When 돌면, Then 일괄 결과 거두기 → 새 글 확인 → 지난주 모음 → 요약 → 지난 글 채우기 → 실행 마감 차례다. 시작부터 170초가 넘으면 새 바로 요약을 시작하지 않고, 230초가 넘으면 일괄 준비를, 250초가 넘으면 지난 글 채우기를 멈춘다.
- AC-7414.3: Given 출처, When 새 글을 확인하면, Then 오늘(한국 날짜) 이미 확인한 출처는 건너뛴다. 확인할 출처는 1쪽(심사기준은 탭 넷 각 1쪽)부터 쪽의 줄이 모두 새것이면 다음 쪽(5쪽까지)이다. 2026-01-01보다 앞 글과 이미 있는 key는 넣지 않고, 심평원 두 곳은 글·팝업을 읽어 본문과 붙임 목록을 함께 저장한다. 확인 시각을 저장한다.
- AC-7414.4: Given 한 출처의 목록 읽기가 실패하거나 200인데 0줄, When 돌면, Then 그 출처만 `stopped`(`timeout`·`blocked-url` → `blocked`, `http`·`too-big` → `http`, 0줄 → `shape`)이고 처음 멈춘 시각을 남기며 다른 출처는 계속한다. 다음에 성공하면 `ok`·성공 시각이고 멈춘 시각은 지운다.
- AC-7414.5: Given 요약 전 묶음들, When 요약하면, Then 최근 글부터, 올라온 지 3일(한국 날짜) 안이거나 `tries` ≥ 1이면 바로(동시에 3개), 아니면 일괄로 모은다. 붙임은 이때 받아 글자를 뽑아 `attach_text`·`read_mode`를 저장하고 파일은 두지 않는다. 성공이면 요약과 `matchRules` 결과를 저장하고 `done`, 실패면 `tries`+1이고 3이 되면 `failed`다.
- AC-7414.6: Given 모은 일괄 요청, When 실행이 끝나기 전, Then `submitBatch`로 보내고 그 묶음을 `batch`와 일괄 id로 적는다. 다음 실행의 거두기에서 성공은 `done`, 실패·거절은 `wait`와 `tries`+1, 24시간이 지나도 끝나지 않으면 실패로 본다.
- AC-7414.7: Given 지난 글이 남은 출처, When 채우면, Then 저장한 쪽 표시(cursor) 다음 쪽부터 읽어 넣고, 쪽의 마지막 줄이 2026-01-01보다 앞이면 그 출처(탭)를 채움 끝으로 적는다. 복지부는 채울 것이 없다(처음부터 끝).
- AC-7414.8: Given 지난주(한국 날짜, 지난 월~일) 모음이 없음, When 돌면, Then 하나 만든다(관련 글이 0개면 AI 없이 빈 모음). 있으면 만들지 않는다.
- AC-7414.9: Given Claude 부름, When 끝나면, Then 실행 줄에 입력·출력 토큰과 비용(일괄은 절반)을 더한다. 실행 줄에는 출처별 상태·건수만 숫자로 남고 글 내용은 없다. console에는 오류 번호 한 줄씩만 남긴다.

### REQ-7415: 모으기 DB 쪽
- AC-7415.1: Given 환경 변수 `NOTICES_COLLECTOR_EMAIL`·`NOTICES_COLLECTOR_PASSWORD`, When `collectorClient`, Then 공개(anon) 열쇠 클라이언트로 비밀번호 로그인(세션 저장·자동 갱신 끔)한 클라이언트다. 값이 없거나 로그인이 실패하면 null이고 오류 글은 버린다. service role 키는 읽지 않는다.
- AC-7415.2: Given 모으기 클라이언트, When `CollectorStore` 함수를 부르면, Then design 3절의 표·칸만 읽고 쓰고 병원 조건은 넣지 않는다.
- AC-7415.3: Given DB 오류나 던짐, When store 함수를 부르면, Then 쓰기는 false, 읽기는 고정 글로 던지고 받은 오류 글은 밖에 내지 않는다.

### REQ-7416: 자동 실행 경로 `GET /api/ai/notices/collect`
- AC-7416.1: Given `Authorization`이 `Bearer <CRON_SECRET>`와 다르거나 없거나 `CRON_SECRET`이 비어 있음, When `GET`, Then 401(몸통 없음)이고 사이트·DB·Claude를 부르지 않는다. 비교는 같은 시간 비교다.
- AC-7416.2: Given 맞는 머리, When `GET`, Then `collectorClient`로 `runCollector`를 돌려 200 `{ ok: true, … }`(숫자와 출처 이름만)이고, 로그인 실패면 500 `{ code: 'E-NOTICE-LOGIN' }`이다. 로그는 `console.error('[api/ai/notices/collect]', code)` 한 줄뿐이고 `runtime` `nodejs`·`maxDuration` 300·`dynamic` `force-dynamic`이다.
- AC-7416.3: Given 로그인 안 한 요청, When 문지기가 `/api/ai/notices/collect`를 보면, Then `/login`으로 보내지 않는다. 다른 경로는 지금과 같다.
- AC-7416.4: Given `vercel.json`, When 읽으면, Then `crons`가 이 경로 아홉 개(아침 `0 22 * * *`와 채우기 `0 0`·`0 2`·`0 4`·`0 6`·`0 8`·`0 10`·`0 12`·`0 14` `* * *`)이고 framework·regions·git 설정은 그대로다.

### REQ-7417: AI에게 묻기 경로 `POST /api/ai/notices/ask`
- AC-7417.1: Given 몸통이 정확히 `{ noticeId(uuid), question(글자) }`가 아님, When `POST`, Then 400이다. 로그인 안 함 401, 승인된 원장이 아님(데스크 포함) 403이다.
- AC-7417.2: Given `checkQuestion`이 `{ private }`, When `POST`, Then 400 `{ code: 'E-NOTICE-PRIVATE', kinds }`이고 그 밖의 검사 실패는 400(몸통 없음)이다. 두 경우 모두 표를 받지 않고 Claude를 부르지 않는다.
- AC-7417.3: Given `take_notice_ask()`가 null, When `POST`, Then 429 `{ code: 'E-NOTICE-ASK-LIMIT' }`이다. 표를 받은 뒤 글을 읽지 못하거나(404) Claude가 실패하면(`E-AI-BUSY` 503·`E-AI-LIMIT` 402·`E-AI-FAILED` 502) `end_notice_ask(표, false)`로 되돌린다.
- AC-7417.4: Given 통과, When `POST`, Then DB에서 읽은 그 글의 제목·요약·본문·붙임 글자와 질문을 `<notice>`·`<question>`으로 감싸 보내고(effort `medium`), `end_notice_ask(표, true)` 뒤 200 `{ answer, left }`(답은 제어 문자 뺌·1,000자에서 자름)와 `Cache-Control: no-store`다. 사용량은 `add_ai_usage`로 더한다.
- AC-7417.5: Given `{ code }`로 답하는 모든 경우, Then `console.error('[api/ai/notices/ask]', code)` 한 줄만 남기고 질문·답·글 id는 로그·DB 어디에도 남지 않는다.

### REQ-7418: 화면 자료 읽고 쓰기 (`lib/storage/notices.ts`)
- AC-7418.1: Given 거르기 `{ related, sources, starred, q, offset }`, When `listNotices`, Then `q`가 있으면 `notice_search` id로, 없으면 그대로 `notice_list`를 50개씩 불러 `NoticeView` 목록과 `total`·`unread`를 돌려준다. `openNotice(id)`는 그 글 하나(없으면 null)다.
- AC-7418.2: Given 글 id, When `markRead`·`setStar`·`saveMemo`·`checkRules`, Then 내 `notice_marks` 줄의 그 칸(메모는 메모 시각도)만 넣거나 고친다. `saveMemo`는 `checkMemo`가 `'ok'`일 때만 보내고 아니면 그 결과를 돌려준다. 읽음을 적은 뒤 창에 `notices:changed`를 알린다.
- AC-7418.3: Given 화면, When `unreadCount`·`ruleAlerts`·`sourceStates`·`fillProgress`(전체·요약 끝 수)·`askLeft`·`readWeek(weekStart | 'latest')`를 부르면, Then 정한 모양으로 돌려준다.
- AC-7418.4: Given 읽기 오류, Then `'failed'`, 쓰기 오류, Then false이고 오류 글은 밖에 내지 않는다.

### REQ-7419: 글 목록 화면 `/notices`
- AC-7419.1: Given 화면, When 그리면, Then 제목 `고시·공지`, 안내 `심평원·보건복지부 새 글을 매일 아침 모아 AI가 요약해요.`, 작은 탭 `글 목록`·`주간 모음`이고, 고르기 줄은 `관련 글만`(처음 골라짐)·`전체`·`별표만`, 찾기 칸(화면 읽기 `글 찾기`, 칸 안 글 `제목·본문·붙임 파일 글자로 찾기`, 단추 `찾기`), `출처` 칩 `심평원 공지`·`심평원 심사기준`·`보건복지부`(처음 모두 켜짐, 여러 개 고르기, 마지막 하나는 끌 수 없음)다. 고르기는 함께 걸린다.
- AC-7419.2: Given 목록, When 그리면, Then 건수 `관련 글 **{n}건** · 안 읽은 글 **{u}건**`(전체면 `전체 **{n}건** · 안 읽은 글 **{u}건**`, 찾는 중 `찾은 글 **{n}건**`)과 옆 글(관련 글만 `관련 여부는 AI가 정해요. 빠진 글이 걱정되면 [전체]로 보세요.`, 전체 `정형외과 의원과 관련 적은 글도 함께 보여요.`)이고, 달마다 머리 줄(`11월`) 아래 줄마다 날짜·출처(` · `로 이음)·글 번호 자리(기본값 7)·칩(`요약 만드는 중`·`정형외과 의원 관련`·`점검 규칙 확인 필요`·`점검 규칙 확인함`·`붙임 파일 {n}개`)·제목·'무엇이 바뀌나' 한 줄(요약 전이면 `요약을 만드는 중이에요.`, 실패면 기본값 6)·별 단추(화면 읽기 `별표 하기`/`별표 빼기`)다.
- AC-7419.3: Given 안 읽은 글(기본값 11), When 그리면, Then 제목이 굵고 파란 점과 화면 읽기 `안 읽음`이 있다. 줄을 누르면 `/notices?id=<id>`로 글을 연다.
- AC-7419.4: Given 50개 넘는 목록, When 아래 `지난 글 더 보기`를 누르면, Then 다음 50개를 잇는다. 맨 아래 `2026년 1월 1일부터 모은 글이에요.`가 있다.
- AC-7419.5: Given 찾기(기본값 16), When `찾기`나 Enter, Then 지금 고르기 안에서 찾고, 없으면 `‘{찾은 말}’와 맞는 글이 없어요` · `제목·본문·붙임 파일 글자에서 찾았어요. 낱말을 더 짧게 하거나 띄어쓰기를 바꿔 보세요.`(관련 글만이면 뒤에 ` 지금은 관련 글만 보고 있어요.`와 `전체에서 찾기` 단추) · `찾기 지우기`다. 별표만인데 없으면 `별표한 글이 없어요` · `글 오른쪽 별을 누르면 여기에 모여요.`다.
- AC-7419.6: Given 출처 상태, When 그리면, Then 확인 줄 `매일 아침 확인해요`와 출처마다 `{출처} 오늘 {시각} 확인` 또는 `{출처}: 어제부터 못 가져왔어요`(기본값 1)이고, 멈춘 출처마다 띠(제목 `{출처}: 어제부터 못 가져왔어요`, 글 `{출처} 게시판 모양이 바뀌었거나 잠시 막힌 것 같아요. 마지막으로 {날짜 시각}에 가져왔어요. 다른 곳 글은 오늘 아침에도 잘 가져왔어요. 고쳐질 때까지 {출처} 새 글은 직접 확인해 주세요.`(기본값 2), 링크 `{출처} 게시판 열기` 새 창)다.
- AC-7419.7: Given 지난 글 채우기가 남음(출처 하나라도 채움 끝이 아니거나 일괄 중인 글이 있음), When 그리면, Then 띠 `올해 1월부터 지난 글을 채우는 중이에요` · 진행 막대와 `지난 글 {전체}건 중 {채운}건 채웠어요 ({퍼센트}%)` · `요약을 한꺼번에 만들고 있어 하루쯤 걸려요. 채운 글은 바로 볼 수 있어요. 요약이 아직 없는 글은 관련 여부를 몰라 관련 글만 보기에도 함께 보여요.`다(기본값 3).
- AC-7419.8: Given 목록 읽기 실패, When 그리면, Then `E-NOTICE-READ` 오류 상자와 [다시 읽기]다.

### REQ-7420: 글 화면 `/notices?id=`
- AC-7420.1: Given 글, When 열면, Then `글 목록으로` · 출처 · `{날짜} 올라옴` · 제목 · 글 번호 자리 · `정형외과 의원 관련` 칩 · 별 단추 `별표`/`별표함`이고 읽음으로 저장한다. 왼쪽 칸은 규칙 상자 → 요약 → AI에게 묻기, 오른쪽 칸은 메모 · 올라온 곳이다(PC 배치 하나).
- AC-7420.2: Given 규칙 연결이 있고 내 확인이 없는 글, When 그리면, Then `이 글이 점검 규칙 {n}개의 근거를 바꿔요 — 확인 필요` · `점검 규칙은 저절로 바뀌지 않아요. 아래 규칙이 새 기준과 맞는지 설정 → 점검 규칙에서 확인해 주세요.` · 규칙 제목 목록 · `점검 규칙 보기`(기본값 17) · `확인했어요`다. 누르면 저장 뒤 `점검 규칙 {n}개 확인함` · `{날짜 시각}에 확인했어요.`이고 규칙은 바꾸지 않는다.
- AC-7420.3: Given 요약, When 그리면, Then `AI 세 줄 요약` · 칩(`full`·`text`는 `붙임 파일까지 읽고 요약`, `body`는 `본문만 보고 요약`과 기본값 4의 이유 줄) · `무엇이 바뀌나`·`언제부터`·`누구 대상` · `우리 의원에는` · `AI가 만든 요약이라 틀릴 수 있어요. 중요한 내용은 원문에서 꼭 확인해 주세요.` · `원문 보기`(제목을 준 글 주소) · `원래 게시판에서 새 창으로 열려요. 파일은 이 앱에 저장하지 않아요.` · `붙임 파일` 이름 링크들(없을 때 기본값 5)이다. 요약 전이면 `요약을 만드는 중이에요.`다. 링크는 두 사이트 주소일 때만 새 창(`noopener noreferrer`)이다.
- AC-7420.4: Given 메모, When 그리면, Then `우리 병원 메모` · 칸(칸 안 글 `예: 12월 회의 때 원장님들께 알리기`, 500자) · `우리 병원 계정만 봐요. 환자 정보는 쓰지 마세요.` · `메모 저장` · 저장한 적 있으면 `{날짜 시각} 저장됨`이다. 누르면 저장하고, 막히면 기본값 13, 실패면 `E-NOTICE-SAVE`이고 적은 값은 그대로다.
- AC-7420.5: Given 올라온 곳, When 그리면, Then `올라온 곳`과 출처마다 이름·날짜이고, 출처가 둘 이상이면 `같은 고시 번호라 한 글로 묶었어요.`다.
- AC-7420.6: Given AI에게 묻기(처음 접힘), When `AI에게 묻기`를 누르면, Then `AI에게 묻기` · `이 글과 붙임 파일 내용을 바탕으로 답해요.`(`body`면 `이 글 본문을 바탕으로 답해요.`) · `환자 이름·주민번호·전화번호·차트번호는 쓰지 마세요.` · 칸(화면 읽기 `물어볼 것`, 칸 안 글 `예: 어깨 관절 주사도 횟수가 줄어드나요?`, 300자) · `묻기` · `닫기` · `오늘 **{n}번** 남음 (하루 20번)` · `우리 병원 계정이 함께 하루 20번까지 쓸 수 있어요.`다.
- AC-7420.7: Given 환자 정보 모양이 든 질문, When `묻기`, Then 보내지 않고 칸이 빨간 테두리(`aria-invalid`)이며 `환자 정보로 보이는 글자가 있어 보내지 않았어요` · `{종류}로 보이는 글자를 지우고 다시 눌러 주세요. 남은 횟수는 줄지 않았어요.`(종류는 `kindsText`)다. 서버가 `E-NOTICE-PRIVATE`로 답해도 같다.
- AC-7420.8: Given 보낸 질문, When 기다리면, Then `AI가 답을 쓰는 중이에요`이고, 답이 오면 `물어본 것` · `AI 답`(글자로만) · `AI 답이라 틀릴 수 있어요. 원문에서 꼭 확인해 주세요.` · `메모에 옮기기` · `답은 저장되지 않아요. 남기려면 메모에 옮겨 두세요.`와 줄어든 남은 수다. `메모에 옮기기`는 메모 칸 끝에 줄을 바꿔 답을 붙이고(500자에서 자름) 저장은 하지 않는다. 새로 고침하면 답은 사라진다.
- AC-7420.9: Given 실패(기본값 14), Then `답을 받지 못했어요. 잠시 뒤 다시 눌러 주세요. 남은 횟수는 줄지 않았어요.`이고, 429거나 남은 수가 0이면 `오늘 물어볼 수 있는 20번을 다 썼어요. 내일 다시 쓸 수 있어요.`와 칸·`묻기`가 막힌다.
- AC-7420.10: Given 제목·요약·답·메모에 `<b>x</b>` 같은 글, When 그리면, Then HTML로 해석하지 않고 글자 그대로 보인다. 글이 없거나 읽기 실패면 `E-NOTICE-READ` 상자다.

### REQ-7421: 주간 모음 화면 `/notices/week`
- AC-7421.1: Given 모음이 있는 주(기본은 가장 최근, `?w=<월요일>`), When 그리면, Then `고시·공지 주간 모음` · `{기간} · 새 글 {n}건 · 정형외과 의원 관련 {r}건`(기간 `11월 9일 (월) ~ 11월 15일 (일)`) · `{날짜} 아침에 AI가 정리했어요 · {병원 이름}` · `이번 주 꼭 알 것 3가지` · `글별 요약`과 `정형외과 의원 관련 {n}건`(글마다 제목·출처·세 줄·우리 의원에는) · `그 밖의 글 {n}건`(제목) · `AI가 만든 정리라 틀릴 수 있어요. 중요한 내용은 원문에서 꼭 확인해 주세요.`다(기본값 15).
- AC-7421.2: Given 모음이 없는 주·아직 없음, When 그리면, Then `이번 주 모음은 월요일 아침에 나와요.`다.
- AC-7421.3: Given 화면, When `지난주`·`다음 주`·`인쇄`를 누르면, Then 주를 옮기고(가장 최근 주에서 `다음 주`는 막힘) `인쇄`는 `window.print()`이며 인쇄 때 앱 틀·단추는 숨긴다.

### REQ-7422: 대시보드 맨 위 경고와 '고시·공지' 칸
- AC-7422.1: Given 내가 확인하지 않은 규칙 연결 글이 하나, When 대시보드를 그리면, Then 맨 위에 `점검 규칙 확인 필요` · `새 고시({보건복지부 고시 제…호})가 점검 규칙 {n}개의 근거를 바꿨어요. 규칙은 저절로 바뀌지 않아요.`와 `글 보기`(그 글)다. 둘 이상·번호 없음은 기본값 8, 0개·읽기 실패면 없다.
- AC-7422.2: Given 대시보드, When 그리면, Then '일별 현황' 바로 아래 칸 `고시·공지` · `새 관련 글 {n}건` · `고시·공지 열기`와 안 읽은 관련 글 최대 3줄(날짜·제목·출처, 확인 안 한 규칙 연결이면 `점검 규칙 확인 필요` 칩, 누르면 그 글), 넘치면 `그 밖에 {n}건`, 0건이면 `새 관련 글이 없어요 · 오늘 {시각} 확인`이다. 읽기 실패면 그 칸만 기본값 9이고 다른 칸은 그대로다.

### REQ-7423: 탭 켜기와 탭 숫자
- AC-7423.1: Given 메뉴, When 읽으면, Then '고시·공지'는 `href: '/notices'`·`ready: true`·`primary: true`(MENU 차례 청구와 환자 사이)이고, `notReadyFeatures`에 `/notices`가 없으며, 대시보드 기능 목차 '고시·공지'는 `status: 'ready'`·설명 기본값 18이다.
- AC-7423.2: Given `/notices`, When 그리면, Then `NotReadyScreen`이 아닌 글 목록(`?id=`면 글 화면)이고 탭 이름은 `고시·공지`다. 데스크가 열면 지금처럼 막힌 화면이다.
- AC-7423.3: Given 원장 계정 탭 띠, When 그리면, Then '고시·공지' 옆에 안 읽은 관련 글 수(파란 동그라미, 기본값 10)와 화면 읽기 `안 읽은 관련 글 {n}건`이고 0·실패면 없다. 열 때와 `notices:changed`·창이 다시 보일 때 다시 읽는다. 데스크 계정은 읽지도 그리지도 않는다.

### REQ-7424: 내 낱말 (꼭 볼 글)
- AC-7424.1: Given `lib/notices/keywords.ts`, When `normKeyword(s)`, Then 빈칸·탭·줄바꿈(`\n`·`\r`)·U+00A0·U+3000을 모두 빼고 영문 A~Z만 소문자로 바꾼다('관절강내 주사'와 '관절강내주사', 'MRI'와 'mri'가 같다). `cleanKeyword(s)`는 그 빈칸 글자가 이어지면 빈칸 하나로 줄이고 그 밖 제어 문자는 빼고 앞뒤 공백을 뗀다. `RECOMMENDED_KEYWORDS`는 기본값 19의 12개(차례 그대로)다.
- AC-7424.2: Given 고른 낱말 목록, When `checkKeyword(s, words)`, Then `cleanKeyword` 뒤 빈 글자면 `'empty'`, 20자 넘으면 `'too-long'`, 이미 30개면 `'full'`, `privateKinds`(AC-7413.1)가 있으면 `{ private: kinds }`, `normKeyword`가 같은 낱말이 있으면 `'dup'`, 아니면 `{ ok: 다듬은 낱말 }`이다. `mustSeeText(words, max)`는 `꼭 볼 글 · ` 뒤에 앞 `max`개를 `·`로 잇고 남으면 ` 외 {n}개`를 붙인다(빈 목록은 빈 글자). `errorInfo('E-NOTICE-WORDS')`는 기본값 20 글이다.
- AC-7424.3: Given migration `20261121000001_notice_keywords.sql`(`20261121000000_notices.sql` 뒤), When 두 번 실행하면, Then 오류 없이 `notice_keywords`·`notice_keyword_hits`가 RLS가 켜진 채 있고 anon은 읽고 쓰지 못한다. 승인된 원장은 `notice_keywords`에서 내 병원 줄만 읽고 넣고(`word`만, `hospital_id`는 DB 기본값) 지운다(고치기 없음). `notice_keyword_hits`는 내 병원 줄 읽기만 되고 누구도 직접 넣고 고치고 지우지 못한다. 데스크·승인 대기·다른 병원·모으기 계정은 두 표 모두 0줄이고 넣기는 거부된다.
- AC-7424.4: Given 줄 제약, When 넣으면, Then `word`가 앞뒤 공백이 있거나 1~20자가 아니거나 제어 문자가 있거나 정규화하면 빈 글자면 거부되고, 정규화(`notice_norm`, `normKeyword`와 같은 규칙)가 같은 낱말은 한 병원에 하나만(23505)이며, 한 병원의 31번째 낱말은 거부된다. 다른 병원은 같은 낱말을 따로 가진다.
- AC-7424.5: Given 글과 낱말, When 원장이 낱말을 넣거나 지우거나 모으기 계정이 글을 넣거나 제목·본문·붙임 글자·요약을 고치면, Then 같은 문장 안에서 `notice_keyword_hits`의 (병원, 글) 줄이 맞은 낱말(넣은 차례)로 맞춰지고 맞은 낱말이 없으면 줄이 없다. 맞음은 제목·본문·붙임 글자·요약 `what`·`when`·`who`·`forUs` 가운데 한 칸이라도 정규화한 글 안에 정규화한 낱말이 드는 것이다('관절강 내주사'가 든 글은 '관절강내 주사'와 맞고, 제목 끝과 본문 처음을 이어서는 맞추지 않는다). 다른 병원 낱말은 섞이지 않는다.
- AC-7424.6: Given 이 migration이 다시 만든 `notice_list`·`notice_unread_count`, When 부르면, Then 줄마다 `keywords`(내 병원 맞은 낱말, 없으면 `[]`)가 더해지고, `p_related`가 참이면 AC-7403.5의 글에 더해 `keywords`가 있는 글(AI가 관련 아님으로 본 글 포함)도 든다. `notice_unread_count()`는 관련 글이거나 `keywords`가 있는 글 가운데 `unread`인 수다. 그 밖 인자·모양·권한은 AC-7403.5·AC-7403.6 그대로다.
- AC-7424.7: Given `lib/storage/notices.ts`, When `readKeywords()`, Then 내 병원 낱말을 넣은 차례로 돌려주고 실패면 `'failed'`다. `addKeyword(word)`·`removeKeyword(word)`는 `notice_keywords`에 `word` 하나를 넣거나 그 `word` 줄을 지우고 true/false(오류 글 안 냄)이며 성공하면 `notices:changed`를 알린다. `listNotices`·`openNotice`의 `NoticeView.keywords`는 `notice_list` 줄의 `keywords`다.
- AC-7424.8: Given `KeywordsControl`(`components/notices/keywords/`), When 그리면, Then 단추 `내 낱말 {n}개`(0개면 `내 낱말 고르기`, `aria-expanded`)이고, 누르면 칸이 펼쳐져 `내 낱말` · `닫기` · `고른 낱말이 제목·본문·붙임 파일·AI 요약에 들어 있으면 ‘꼭 볼 글’로 표시해요. 꼭 볼 글은 관련 글만 보기에 늘 나오고, 탭 옆 숫자와 대시보드에도 들어가요.` · `고른 낱말 {n}개`와 `30개까지` · 낱말마다 칩과 빼기 단추(화면 읽기 `{낱말} 빼기`) 또는 없을 때 `아직 고른 낱말이 없어요` · `추천 낱말을 누르거나 직접 적어 더해 주세요.` · 칸(화면 읽기 `더할 낱말`, 칸 안 글 `예: 실손보험`, 20자까지 받음) · `더하기` · `띄어쓰기와 영문 대소문자는 가리지 않아요. ‘관절강내 주사’로 적어도 ‘관절강내주사’가 든 글을 찾아요. 낱말마다 20자까지예요.` · `추천 낱말`과 `눌러서 더해요` · 아직 안 고른 추천 낱말 칩(차례 그대로, 화면 읽기 `{낱말} 더하기`, 남은 것이 없으면 이 칸 없음)이다. `닫기`나 단추를 다시 누르면 접힌다.
- AC-7424.9: Given 펼친 칸, When `더하기`·Enter·추천 칩을 누르면, Then `checkKeyword`가 ok일 때만 `addKeyword`를 부르고 성공하면 칸을 비우고 낱말을 더한다. `'dup'`이면 `이미 고른 낱말이에요`와 칸 `aria-invalid`, `{ private }`면 기본값 13의 두 글(종류는 `kindsText`), `'empty'`면 아무것도 하지 않고, 30개면 `낱말은 30개까지 고를 수 있어요. 하나를 빼고 더해 주세요.`와 칸·`더하기`·추천 칩이 막힌다. 빼기 단추는 `removeKeyword`다. 저장 실패면 `E-NOTICE-WORDS` 오류 상자이고 낱말 목록과 적은 글은 그대로다. 낱말을 못 읽으면 `E-NOTICE-READ` 상자다.
- AC-7424.10: Given 글 목록(`NoticesScreen`), When 그리면, Then 고르기 줄 `별표만` 바로 뒤에 `keywords` 자리(쪽 파일이 넣는 부품)를 두고, 줄에 `keywords`가 있으면 `mustSeeText(keywords, 2)` 칩(`꼭 볼 글 · {낱말}`, 진한 파랑)을 다른 칩 맨 앞에 그린다. 저장소가 준 줄을 `related`로 다시 거르지 않아 AI가 관련 아님으로 본 꼭 볼 글도 관련 글만 보기에 보인다. `notices:changed`가 오면 목록을 다시 읽는다.
- AC-7424.11: Given `keywords`가 있는 글, When 글 화면을 열면, Then 글 번호 자리 뒤 `정형외과 의원 관련` 칩 앞에 `mustSeeText(keywords, Infinity)` 칩(모든 낱말)이 있다.
- AC-7424.12: Given 저장소가 `related`가 false이고 `keywords`가 있는 안 읽은 글을 줌, When 대시보드 '고시·공지' 칸을 그리면, Then 그 글이 `새 관련 글 {n}건`의 수와 줄에 든다(화면이 `related`로 다시 거르지 않음). 칸 모양은 AC-7422.2 그대로다.
- AC-7424.13: Given `/notices` 글 목록, When 쪽 파일이 그리면, Then `NoticesScreen`의 `keywords` 자리에 `KeywordsControl`을 넣는다. `?id=` 글 화면에는 없고, 데스크는 지금처럼 막힌 화면이다.

## 범위 밖
- 의사협회·건보공단·정형외과의사회·대개협, 복지부 공지사항 RSS, 복지부 글 본문·붙임 쪽(robots 금지)
- 이메일·문자 알림, 점검 규칙 자동 수정, 붙임 파일 저장, 질문·답 저장(채팅 기록)
- 2026-01-01보다 앞 글, 정형외과 밖 진료과 기준의 관련 판단

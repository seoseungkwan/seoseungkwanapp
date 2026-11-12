# 요구사항: 처방별 추세 묶음에 제외할 처방

> 기능 ID: `rx-group-exclude` · 형식: 요구사항은 `### REQ-2701: 제목`, 수용 기준은 `- AC-2701.1: Given/When/Then`.
> 각 AC 는 테스트 하나 이상으로 검증되어야 하며, 테스트 이름에 AC ID 를 넣는다.
> 번호는 2701부터다(memo-chart-lines가 2601~2603을 썼다). 시험 자료의 이름·숫자는 모두 지어낸 값이다.

## 배경 / 목표
- 2026-11-12 사용자: "세 가지 처방을 동시에 보고 싶은데 특정 처방 뺀 거를 보고 싶어" · "mm010 들어간 환자를 보고 싶은데 그 mm010 있는 환자들 중에 eswt7처럼 특정 코드가 들어가 있는 사람은 제외하고 보고 싶어"
- 지금 통계 탭 **처방별 추세**의 묶음(specs/treatment-trend)은 "묶음 처방 중 하나라도 받은 환자"만 센다. 빼는 조건이 없다
- 묶음마다 **제외할 처방**을 더한다. 그날 묶음 처방을 받았어도 같은 날 제외할 처방을 받았으면 그 묶음에서 세지 않는다. 예: 묶음 `표층열만` = 넣은 처방 `MM010`, 제외할 처방 `ESWT7`
- 묶음 숫자는 불러올 때(비트 PC·파일) 환자 줄로 센다(treatment-trend와 같음). 저장된 일 숫자에는 환자가 누구인지가 없어서 제외 셈도 그때만 할 수 있다
- 2026-11-12 사용자 승인(대화): 시안 링크와 '제가 정한 부분'을 보여 드린 뒤 사용자가 `/sdd approve rx-group-exclude`를 입력했다. 이 클라우드 컨테이너에는 승인 기록 훅이 없어 `approval.json`이 생기지 않았고, 사용자가 "입력한 걸 승인으로 보고 진행"을 골랐다. 승인 기록은 하네스가 있는 PC에서 사용자가 `/sdd approve rx-group-exclude`를 입력해 남긴다
- 승인 시안: `docs/mockups/rx-group-exclude/index.html`(claude.ai artifact `4dbP9rVyDWe4E519nSdB4W`와 같은 파일, 2026-11-12 위 승인). 시안의 숫자·처방 이름은 지어낸 것이다. 시안 끝 '정하신 내용'과 '제가 정한 부분'을 모두 지킨다

## 이미 정한 것 (다시 묻지 않는다)
사용자 결정(2026-11-12 질문):
1. 빼는 범위는 **같은 날**이다. 그날 묶음 처방을 받고 같은 날 제외할 처방은 받지 않은 환자만 그날 1건으로 센다. 다른 날 제외할 처방을 받은 것은 상관없다
2. 넣는 처방이 여럿이면 **하나라도 받은 환자**를 넣는다(지금 묶음 규칙 그대로)
3. **숫자만** 본다. 환자 명단은 없다. 서버에는 지금처럼 숫자(묶음 열쇠·건수·신환·재진)와 묶음 설정(이름·코드)만 간다

Claude가 정한 것(시안과 함께 승인받는다):
4. 새 칸을 만들지 않고 처방별 추세 묶음에 '제외할 처방' 목록을 더한다. 줄·그래프·증감·신환·재진 규칙은 그대로다
5. 제외할 처방을 넣거나 빼면 처방을 바꾼 것과 같다: 그 기간을 다시 불러올 때까지 `다시 불러오면 보여요`. 제외할 처방이 없는 묶음은 지금 저장된 숫자가 그대로 보인다(다시 불러오지 않아도 된다)
6. 한 코드는 한 묶음 안에서 넣은 처방과 제외할 처방에 같이 들 수 없다. 다른 묶음에 든 처방도 제외할 처방으로 고를 수 있고, 그 묶음은 그대로다(옮기지 않는다)
7. 넣은 처방 하나는 한 묶음에만 드는 규칙은 그대로다. 그래서 `MM010` 전체 건수는 처방 골라 보기에서 보고, 묶음에서는 `MM010` 중 제외한 건수를 본다
8. 대시보드 '처방 상위'(통계 탭 묶음을 그대로 씀, bit-dashboard REQ-606)도 같은 열쇠·정의를 써서 제외 규칙이 같이 든다

## 요구사항

### REQ-2701: 저장 표에 제외할 처방 칸 (새 migration)
- AC-2701.1: Given 새 파일 `supabase/migrations/20261112000100_stats_rx_groups_exclude.sql`, When 인증·`20261105000100_stats_rx_groups.sql` 뒤에 돌리면, Then `stats_rx_groups`에 칸 `exclude_codes`(`text[]`, null 아님, 기본 빈 배열)가 생기고 이미 있던 줄은 빈 배열이다. 다른 칸·RLS 정책·이름 고유·"넣은 처방은 한 묶음에만" 검사는 그대로다. 파일 머리 주석에 운영자가 붙여 넣는 방법과 "사이트에 올리기 전에" 붙인다는 말이 있다
- AC-2701.2: Given 칸 제약, When `exclude_codes`가 1001개 이상이거나 칸이 빈 글자·101자 이상·제어 문자·null이면, Then 거부된다(`codes`와 같은 규칙, `stats_rx_group_codes_ok`). 같은 줄의 `codes`와 대소문자 무시로 겹치는 코드가 있거나(`MM010`·`mm010`) `exclude_codes` 안에서 대소문자 무시로 두 번 나오면 거부된다. 시험: 100자 코드, 빈칸·괄호가 든 코드, 다른 묶음의 `codes`에 든 코드는 들어간다
- AC-2701.3: Given 칸 권한, When authenticated가 `exclude_codes`를 넣거나 고치면 되고, anon은 읽기·넣기·고치기 모두 권한 없음이다. `hospital_id`·`id`·`updated_at`은 그대로 직접 넣거나 고칠 수 없다
- AC-2701.4: Given `save_stats_rx_groups(groups jsonb)`(새 파일이 바꿔 만듦), When 묶음에 `exclude_codes` 배열이 있으면, Then 넣기·고치기에 그 값을 쓰고 돌려주는 줄에 `exclude_codes`가 있다. 열쇠가 없으면 새 묶음은 빈 배열, 이미 있는 묶음은 그 줄의 값을 그대로 둔다. 배열이 아니면(문자열·숫자·null 값) 거부한다. 다른 규칙(51개 이상 거부, 남의 병원 id 거부, 목록에 없는 줄 지움, 도중 실패면 아무것도 안 바뀜)은 그대로다. 권한도 그대로다(anon 못 부름)
- AC-2701.5: Given 시험의 Supabase 흉내, When 새 함수를 만들면, Then 흉내가 기본 권한을 진짜로 주고 migration이 거둔 것이 시험으로 보인다(새 검사 함수 `stats_rx_group_exclude_ok`)

### REQ-2702: 묶음 읽기·저장 코드
- AC-2702.1: Given `listStatsRxGroups()`, When 부르면, Then `id,name,codes,exclude_codes,sort_order`를 읽어 줄마다 `{ id, name, codes, exclude, sortOrder }`(`StatsRxGroup`)로 돌려준다. `exclude_codes`가 배열이 아닌 줄(없음 포함)은 `exclude: []`다
- AC-2702.2: Given `saveStatsRxGroups(after)`, When 부르면, Then RPC 본문의 묶음마다 열쇠가 `id`·`name`·`codes`·`exclude_codes`·`sort_order` 다섯뿐이고 `exclude_codes`는 늘 배열이다(`exclude`가 없으면 `[]`). 오류 번호·글은 그대로다(`E-STATS-GROUP-READ-FAILED`·`E-STATS-GROUP-SAVE-FAILED`)

### REQ-2703: 불러올 때 제외하고 세기 (환자 자료 구역)
- AC-2703.1: Given 묶음 `{ id, codes: ['MM010'], exclude: ['ESWT7'] }`와 환자 줄(1번 환자 1일 `MM010`+`ESWT7`, 2번 환자 1일 `MM010`, 1번 환자 2일 `MM010`, 3번 환자 1일 `ESWT7`), When `aggregate`가 세면, Then 그 묶음은 1일 1건(2번), 2일 1건(1번)이다. 1일 칸의 신환·재진은 2번 환자의 것만 든다
- AC-2703.2: Given 같은 환자·같은 날의 줄, When 제외할 처방 줄이 묶음 처방 줄보다 앞에 오든 뒤에 오든, Then 결과가 같다
- AC-2703.3: Given 제외할 처방과 줄 코드의 대소문자가 다름(`eswt7`·`ESWT7`), When 세면, Then 같은 코드로 보고 뺀다. 입원 줄(`outpatient === false`)의 제외할 처방은 보지 않는다(묶음 처방과 같은 규칙)
- AC-2703.4: Given 두 묶음(가: `MM010` 제외 `ESWT7`, 나: `ESWT7`), When 1번 환자가 같은 날 두 코드를 받으면, Then 나에는 들고 가에는 들지 않는다. 가의 제외가 다른 묶음 셈을 바꾸지 않는다
- AC-2703.5: Given 제외할 처방 때문에 그날 그 묶음에 남은 환자가 없음, When 일 칸을 만들면, Then 그 칸의 `groups`에 그 묶음 줄이 없다(지금 규칙 그대로). 저장 직전 `fillGroupCounts`가 0줄을 채운다. 달 칸의 F/U(`followup`)는 제외하지 않은 날만 센다
- AC-2703.6: Given 제외할 처방이 없거나(`exclude` 없음·빈 배열) 묶음을 주지 않음, When 세면, Then 결과가 지금과 같다(지금 `aggregate.test.ts` 기대값을 바꾸지 않는다). 10만 줄 1초 시험은 제외할 처방이 있는 묶음을 줘도 통과한다

### REQ-2704: 불러오기 길에 제외할 처방 싣기
- AC-2704.1: Given 제외할 처방이 있는 묶음 정의, When 비트 길(`requestLoad`)·파일 길(`readFiles` → `runAnalysis`)·대시보드 비트 바로 읽기(`readBitDays`)가 정의를 옮겨 실으면, Then 그 정의에 `exclude`가 그대로 있다(시험: Worker로 가는 메시지·`runAnalysis`가 받은 값). 제외할 처방이 없는 정의는 지금처럼 `{ id, codes }`만이다(`exclude` 열쇠 없음). 묶음 이름은 어느 길에도 없다
- AC-2704.2: Given 비트 길 Worker 입구(`createStatsHost(...).load`), When `exclude`가 있는 묶음으로 불러오면, Then `loaded` 답의 일 줄 `groups`에 그 열쇠 줄이 있고 같은 날 제외할 처방을 받은 환자는 빠진 숫자다

### REQ-2705: 묶음 열쇠와 다시 불러오기 판단
- AC-2705.1: Given `groupKey(codes, exclude)`, When 제외할 처방이 없으면(`exclude` 안 줌·빈 배열), Then 지금 값과 같다(treatment-trend AC-1206.1의 고정 값: `['ESWT1','ESWT7']` → `t2538e307d10103cb`, `['도수']` → `t0c99afbb8431612f`). 그래서 이미 저장된 숫자가 그대로 보인다
- AC-2705.2: Given 제외할 처방이 있음, When `groupKey`를 부르면, Then 넣은 처방 글(지금 규칙) 뒤에 글자 U+001F와 제외할 처방 글(같은 규칙: 대문자·겹침 뺌·글자 차례·`\n`로 이음)을 붙인 글의 지문이다. 고정 값: `(['MM010'], ['ESWT7'])` → `t7bdb9b20a17a64d3`, `(['mm010'], ['eswt7','ESWT7'])` → `t7bdb9b20a17a64d3`, `(['MM010'], ['ESWT7','ESWT1'])` → `t0058156be546398f`, `(['MM010'])` → `tf5a35bf567c9d2cc`. 제외할 처방을 하나 더하거나 빼거나 바꾸면 다른 글자다
- AC-2705.3: Given 처방 든 묶음, When `groupDefs`가 정의를 만들면, Then `{ id: groupKey(codes, exclude), codes }`이고 제외할 처방이 있으면 `exclude`도 있다. 넣은 처방이 없는 묶음은 제외할 처방이 있어도 넘기지 않는다
- AC-2705.4: Given 숫자가 보이던 묶음, When 제외할 처방을 넣거나 빼서 저장하면, Then 그 기간을 다시 불러올 때까지 `다시 불러오면 보여요`이고 일부 묶음 안내(treatment-trend AC-1208.2)에 그 이름이 든다. 예전 제외 모음으로 되돌리면 그 모음으로 센 줄이 남은 기간은 바로 숫자가 나온다(treatment-trend AC-1206.4와 같은 규칙)
- AC-2705.5: Given 대시보드 '처방 상위'의 묶음 줄(`toDashboardGroups`), When 만들면, Then 줄 열쇠가 `groupKey(codes, exclude)`이고 정의가 `groupDefs`와 같다
- AC-2705.6: Given AI 리포트가 읽는 묶음 이름(`app/api/ai/store.ts` `loadReportMonths`), When `stats_rx_groups`를 읽으면, Then `name, codes, exclude_codes, sort_order`를 읽고 이름 짝의 열쇠는 `groupKey(codes, exclude_codes)`다(제외할 처방이 있는 묶음도 이름이 맞게 붙는다). `exclude_codes`가 없으면 빈 배열로 보고, 글자 배열이 아니면 지금 모양 오류(`GROUPS_SHAPE_FAILED`)와 같다. 처방 코드는 지금처럼 이름 짝을 만든 뒤 버린다

### REQ-2706: 묶음 고치기 규칙 (순수 함수)
- AC-2706.1: Given 묶음, When `pickExclude(groups, index, code)`를 부르면, Then 그 묶음의 제외할 처방 끝에 더한다. 이 묶음의 넣은 처방에 있거나(대소문자 무시) 이미 제외할 처방에 있으면 그대로다. 다른 묶음은 바꾸지 않는다
- AC-2706.2: Given `removeExclude(groups, index, code)`, When 부르면, Then 그 묶음의 제외할 처방에서 그 코드만 뺀다
- AC-2706.3: Given 이 묶음의 제외할 처방에 있는 코드, When `pickCode`로 이 묶음에 넣으려 하면, Then 그대로다(넣지 않는다). 다른 묶음의 제외할 처방에 있는 코드는 지금처럼 넣는다
- AC-2706.4: Given `forSave`, When 부르면, Then 묶음마다 `exclude`가 늘 배열로 실린다(없으면 `[]`)
- AC-2706.5: Given `savedNote(before, after)`, When 넣은 처방이 있는 묶음의 제외할 처방 모음(대소문자 무시 집합)이 바뀌었으면, Then 글은 `저장했어요.`다. 넣은 처방이 없는 묶음의 제외할 처방만 바뀌었으면 `저장했어요. 이름과 순서만 바뀌어서 바로 반영했어요.`다
- AC-2706.6: Given 저장된 줄이 없어 나오는 제안 다섯 묶음(`useStatsRxGroups`), When 만들면, Then 묶음마다 `exclude: []`다

### REQ-2707: 묶음 고치기 화면
- AC-2707.1: Given 묶음 고치기의 묶음 하나, When 그리면, Then [+ 처방 넣기] 아래에 제외할 처방 자리가 있다. 제외할 처방이 있으면 머리 글 `제외할 처방 · 같은 날 이 처방을 받은 환자는 이 묶음에서 세지 않아요`와 줄마다 처방 이름·코드·`<기간 이름> n건`·[빼기](`aria-label` `<이름> 제외에서 빼기`)가 있고, 없으면 머리 글·줄이 없다. 그 아래에 [+ 제외할 처방 넣기] 글자 단추가 있다
- AC-2707.2: Given [+ 제외할 처방 넣기], When 누르면, Then 그 자리에 찾기 칸(`aria-label` `제외할 처방 찾기`, 안내 글 `처방 이름이나 코드로 찾기`)과 목록(`aria-label` `찾은 처방`)이 열리고 초점이 찾기 칸에 간다. 찾기 목록은 [+ 처방 넣기]와 한 번에 하나만 열린다(다른 묶음 포함). 줄은 [+ 처방 넣기] 목록과 같은 차례·찾기 규칙이다
- AC-2707.3: Given 제외할 처방 찾기 목록, When 줄을 그리면, Then 이 묶음의 넣은 처방은 `이 묶음에 넣은 처방`, 이미 제외한 처방은 `제외에 있음`이고 둘 다 누를 수 없다. 다른 묶음에 든 처방도 누를 수 있고 옮긴다는 글이 없다. 누르면 제외할 처방 끝에 들고 목록은 열린 채이며 초점은 찾기 칸에 있다
- AC-2707.4: Given [+ 처방 넣기] 찾기 목록, When 이 묶음의 제외할 처방 줄을 그리면, Then `제외에 있음`이고 누를 수 없다
- AC-2707.5: Given 열린 제외할 처방 목록, When [닫기]나 Esc를 누르면, Then 닫히고 초점은 그 묶음의 [+ 제외할 처방 넣기]로 간다. 제외할 처방 줄의 [빼기]를 누르면 그 줄이 빠지고 초점은 다음 줄의 [빼기], 없으면 앞 줄의 [빼기], 없으면 [+ 제외할 처방 넣기]로 간다
- AC-2707.6: Given 고치는 화면 아래 경고 글, When 그리면, Then `처방이나 제외할 처방을 바꾼 묶음과 새로 만든 묶음은, 다시 불러온 뒤부터 숫자가 나와요. 이름과 순서만 바꾸면 바로 바뀌어요.`다
- AC-2707.7: Given 768px 미만, When 그리면, Then 제외할 처방의 [빼기]·[+ 제외할 처방 넣기]·[닫기]는 44px 이상이고 찾기 칸은 폭 전체·44px·16px 글자다(treatment-trend AC-1212.2와 같은 규칙)

### REQ-2708: 보는 화면
- AC-2708.1: Given 제외할 처방이 있는 묶음 줄(준비됨·다시 불러와야 함·처방 없음 모두), When 이름 옆 코드 줄을 그리면, Then 넣은 처방 글(지금처럼 ` · `로 이음) 뒤에 ` · 제외 ` + 제외할 처방 코드를 `, `로 이은 글이 붙는다. 예: `MM010 · 제외 ESWT7`. 넣은 처방이 없으면 `제외 ESWT7`이다. 제외할 처방이 없으면 지금 글 그대로다
- AC-2708.2: Given 처방 든 묶음 중 제외할 처방이 있는 것이 하나라도 있음, When 줄 아래 안내를 그리면, Then 세 안내 글 바로 위에 `제외할 처방이 있는 묶음은, 같은 날 그 처방을 받은 환자를 세지 않아요.`(small muted)가 있다. 없으면 이 글이 없다
- AC-2708.3: Given 열린 그래프·숫자 표·휴대폰 쌓인 줄·다시 불러오기 안내, When 제외할 처방이 있는 묶음을 그리면, Then 글·숫자 규칙이 제외할 처방이 없는 묶음과 같다(제목은 묶음 이름)

### REQ-2709: 개인정보와 문서
- AC-2709.1: Given 이 기능이 고친 환자 자료 구역 코드(`lib/analytics/aggregate.ts`), When `npm run lint`와 `src/guardrails.test.ts`를 돌리면, Then 지금 규칙을 그대로 지난다. 규칙 파일을 고치지 않는다. 화면·훅 파일은 treatment-trend AC-1213.1의 소스 검사를 그대로 지난다
- AC-2709.2: Given `e2e/treatment-trend-privacy.spec.ts`, When 고치면, Then `save_stats_rx_groups` 본문의 묶음 열쇠는 `id`·`name`·`codes`·`exclude_codes`·`sort_order`뿐이고, 시험이 만든 묶음 하나에 제외할 처방 하나가 있으며, 저장된 일 줄의 묶음 열쇠가 `groupKey(codes, exclude)`와 같다. 다른 검사(요청에 차트번호·이름·전화·주민번호 모양·파일 이름 없음)는 그대로다
- AC-2709.3: Given `plan.md` §2-2의 처방별 추세 묶음 줄, When 이 기능이 끝나면, Then 그 바로 아래에 `- 묶음마다 **제외할 처방**을 둘 수 있다. 그날 묶음 처방을 받았어도 같은 날 제외할 처방을 받은 환자는 그 묶음에서 세지 않는다 **(사용자, 2026-11-12)**. 제외할 처방을 바꾸면 그 기간을 다시 불러와야 숫자가 나온다`가 있다. `docs/ARCHITECTURE.md`의 `stats_rx_groups` 줄 칸 목록에 `exclude_codes`가 더해진다

### REQ-2710: 전체 검사
- AC-2710.1: Given 모든 TASK가 끝남, When `npm run lint`·`npm run build`·`npm test`를 돌리면, Then 통과한다

## 범위 밖
- 환자 명단(이름·차트번호) 보기(사용자 결정 3)
- 기간 전체 기준 제외(그 기간 아무 날이라도 제외할 처방을 받은 환자를 통째로 빼기). 저장된 일 숫자로 셀 수 없다(사용자 결정 1)
- "모두 받은 환자"(그리고) 조건(사용자 결정 2)
- 처방 골라 보기·처방별 신환·재진·매출 탭 묶음(`rx_groups`)에 제외 조건 넣기
- 이미 저장된 옛 일 줄을 서버에서 다시 세기(환자 줄이 없다). 다시 불러와야 한다
- 도우미·확장·`MIN_HELPER`·윈도우 빌드(Worker에서만 센다)
- 넣은 처방 하나를 여러 묶음에 넣기(결정 7)

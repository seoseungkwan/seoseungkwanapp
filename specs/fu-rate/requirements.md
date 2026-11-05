# 요구사항: 통계 같은 처방 재방문(F/U률)

> 기능 ID: `fu-rate` · 형식: 요구사항은 `### REQ-001: 제목`, 수용 기준은 `- AC-001.1: Given/When/Then`.
> 각 AC 는 테스트 하나 이상으로 검증되어야 하며, 테스트 이름에 AC ID 를 넣는다.
> 번호는 REQ-1301부터다(다른 명세·브랜치가 쓰지 않은 범위, 2026-11-05 모든 브랜치·작업 폴더에서 찾음).

## 배경 / 목표
- 사용자 요청: 통계 탭에서 처방의 F/U률을 보고 싶다. "ESWT7을 시작한 환자 중 7일·14일·30일 안에 같은 처방을 또 받은 사람이 몇 %인지, 평균 몇 번 더 받았는지"
- 통계 탭 **처방 골라 보기** 안, 건수 표 바로 아래에 새 묶음 **같은 처방 재방문**을 더한다. 위에서 고른 처방을 그대로 쓴다
- 환자를 날 사이로 이어 보는 셈은 의원 PC 안(파일은 Web Worker, 비트는 통계 Worker)의 `aggregate`에서만 한다. 서버에는 날마다 처방별 **몇 명인지**만 저장한다(지금 신환 재방문 `within7/14/30`과 같은 방식). 그래서 휴대폰에서도 본다
- 승인 시안: `docs/mockups/fu-rate/index.html`(claude.ai artifact `TfagwwesRQXxQfh22fhSe6`와 같은 파일, 2026-11-05 사용자 승인). 시안의 숫자·처방 이름은 지어낸 것이다. 시안 끝 '제가 정한 부분' 14개도 모두 지킨다. 앱 규칙 때문에 다르게 정한 곳은 `design.md` '시안과 다른 곳'에 있다

## 이미 정한 것 (사용자 결정, 다시 묻지 않는다)
1. **다시 받음** = 같은 처방(처방 코드가 같음)을 또 받음. 도수치료20 다음 도수치료30은 다시 받은 것이 아니다. 같은 날 두 번 받아도 1번이다
2. **누구를 세나** = 기간 안에 그 처방을 **새로 시작한** 환자. 새로 시작한 날 = 앞 30일 동안 같은 처방을 받지 않은 날. 두 달 쉬었다가 다시 시작하면 한 번 더 센다
3. **지켜보는 날** = 시작한 다음 날부터 7일(14일·30일)째까지. 그 안에 한 번이라도 또 받으면 다시 받은 환자다. 지켜볼 날이 다 지나지 않은 시작일은 뺀다
4. **두 숫자** = 다시 받은 환자 비율(%)과 평균 몇 번 더. 평균 = 더 받은 날 수의 합 ÷ **시작한 환자 모두**(다시 오지 않은 0번 환자도 나눈다)
5. 7일·14일·30일 단추, 처음은 7일, 고른 날 수는 다음에 열어도 남는다
6. 최근 7일, 그리고 최근 30일 + 30일처럼 셀 수 있는 날이 없으면 지켜볼 날이 다 지난 가장 최근 같은 길이 기간으로 옮긴다(위쪽 신환 재방문율이 최근 30일에서 하는 방식)
7. 시작한 환자 10명 미만은 숫자를 흐리게 + `10명 미만`, 0명은 `–`. 합계 줄·지난 기간 견주기는 없다. 비율·평균은 소수 첫째 자리까지 버린다. 휴대폰은 처방 하나를 네 줄로 쌓는다
8. 정직하게 적는 한계: 자료 끝 무렵의 날, 따로 넣은 파일 사이의 재방문, 자료 첫 30일(새로 시작인지 모름), 달마다 따로 넣으면 30일 창이 거의 안 셈, 비트는 비교 기간 첫 달 1일 ~ 오늘만 불러옴

## 요구사항

### REQ-1301: PC 안에서 같은 처방 재방문을 센다 (`aggregate`)
- AC-1301.1: Given 한 환자가 처방 X를 d0·d0+3·d0+6·d0+8·d0+70에 받은 외래 줄, When `aggregate`를 부르면, Then d0 일 칸과 d0+70 일 칸에 X의 `starts`가 1씩 있고 d0+3·d0+6·d0+8 일 칸에는 X 시작이 없다(앞 30일 안에 X가 있음). 시험: d0+31에 처음 다시 받으면 그날도 시작이다(d0는 앞 31일째라 30일 밖)
- AC-1301.2: Given AC-1301.1의 d0 시작, When 창을 세면, Then X의 `back`은 `[1, 1, 1]`, `more`는 `[2, 3, 3]`이다(7일 안 d0+3·d0+6, 14일 안 + d0+8, 30일 안 같음). 창은 다음 날(d0+1)부터 N일째(d0+N)까지 양 끝 포함이고 시작한 날은 들지 않는다. 시험: d0+7에 받으면 7일 안, d0+8은 14일 안부터
- AC-1301.3: Given 같은 환자·같은 날·같은 처방 줄이 둘, When 세면, Then 그날은 하루다(시작 1, 창 안이면 `more`에 1). 다른 환자 둘이 같은 날 시작하면 `starts` 2다
- AC-1301.4: Given 처방 A를 받은 뒤 다음 날 처방 B(다른 코드)를 받음, When 세면, Then A의 `back`·`more`는 0이고 B는 그날이 시작이다. 코드는 글자 그대로 견준다(대소문자를 합치는 일은 화면이 한다, AC-1307.3)
- AC-1301.5: Given 입원 줄(`outpatient` false)과 `outpatient` null 줄, When 세면, Then 입원 줄은 시작·창 어디에도 들지 않고 null 줄은 외래로 든다(지금 `aggregate`가 처방 칸을 세는 규칙과 같다)
- AC-1301.6: Given 결과, When 일 칸(`aggregates.day`)을 보면, Then 칸마다 `again`(그날 시작이 있는 처방만, 코드 글자 순, `{ code, starts, back: [7, 14, 30], more: [7, 14, 30] }`)이 있고 시작이 없는 날은 빈 목록이다. 주·달 칸에는 `again` 열쇠가 없다. 환자 번호·날짜 목록은 결과에 없다. `again` 밖의 칸(합계·처방·그룹·동네·재방문)은 이 기능 전과 같은 값이다
- AC-1301.7: Given 도우미 길(`patientDays` 접수 줄이 있음), When 세면, Then 같은 처방 재방문은 진료 줄(`ConsumptionRow`)만 보고 접수 줄은 보지 않는다(접수 줄에는 처방이 없다)
- AC-1301.8: Given 자료 끝 무렵에 시작한 환자, When 세면, Then 창 안의 있는 줄만 센 수 그대로다('아직 셀 수 없음'은 저장 모양을 만들 때 정한다, AC-1302.1). 자료 첫 날 앞의 기록은 모르므로 첫 30일 안 날도 그 앞 줄이 없으면 시작이다

### REQ-1302: 날 숫자에 담는다 (`toDayPayloads`)
- AC-1302.1: Given 집계 품질이 정상인 결과, When `toDayPayloads`를 부르면, Then 날 줄마다 `again: { ready, rx }`가 있다. `ready[k]`는 `bucketState({ from: 그날, to: 그날 + N일 }, summary.covered, summary.today)`가 `'complete'`인가이고(N = 7·14·30, 신환 재방문 `within7/14/30`이 숫자가 되는 규칙과 같다) 앞에서 뒤로 번진다. 시험: 세 창 모두 덮이고 끝남 → `[true, true, true]`, 그날 + 14일까지만 덮임 → `[true, false, false]`, 오늘 → `[false, false, false]`. `partial`인 날은 `ready`가 모두 false다(검사 AC-1303.2와 어긋나지 않게)
- AC-1302.2: Given `again.rx`, When 만들면, Then 칸의 `again` 줄마다 `{ code, starts, back, more }`이고 `ready[k]`가 false인 자리의 `back[k]`·`more[k]`는 null이다. 코드 글자 순이다. 모든 층의 열쇠가 정해진 것뿐이다: 날 줄은 `again`·`day`·`groups`·`partial`·`quality`·`revisit`·`rx`·`schemaVersion`·`totals`, `again`은 `ready`·`rx`, 그 줄은 `back`·`code`·`more`·`starts`(stats-core AC-008.2 시험의 열쇠 목록에 `again` 하나를 이 AC가 더한다. 그 AC의 'F/U 없음'은 그대로다: `again`은 1회·2회 나눔이 아니다)
- AC-1302.3: Given 가짜 비트 파일 하나(9월 1일 ~ 9월 30일 기간 줄), When `analyzeFiles` → `toDayPayloads`로 만들면, Then 9월 20일 시작의 `ready`는 `[true, false, false]`이고 9월 25일 시작은 `[false, false, false]`다(따로 넣은 파일 끝 무렵). 같은 환자 줄을 9월·10월 두 파일로 나눠 한 번에 같이 넣으면 9월 25일 시작의 7일 창이 숫자이고 10월 줄이 든다
- AC-1302.4: Given 가짜 도우미 JSON(`stats.rows` v2), When `loadJob`을 부르면, Then `view.days`의 날마다 `again`이 있고 `validateDayPayload`를 지난다. 오늘 진료 끝(`closeToday` true)이면 오늘 − 7일 시작의 7일 창이 숫자이고, 아니면 null이다
- AC-1302.5: Given 집계 품질 incomplete, When 부르면, Then 지금처럼 null이다

### REQ-1303: 저장 모양 검사 (`validate.ts`, `types/payload.ts`)
- AC-1303.1: Given `DayPayload`, When `again`이 없으면(이 기능 전에 저장한 줄), Then `validateDayPayload`는 지금과 같이 통과시키고 돌려주는 객체에 `again` 열쇠가 없다. 있으면 검사한 새 객체로 담는다(넣은 배열·객체를 그대로 넘기지 않는다). 시험: 돌려준 `again.rx[0].back`을 고쳐도 넣은 값이 그대로다
- AC-1303.2: Given `again`, When 모양이 틀리면, Then 날 줄 전체가 null이다: 열쇠가 `ready`·`rx` 밖에 더 있거나 빠짐, `ready`가 참·거짓 셋이 아님, 뒤가 true인데 앞이 false(`[false, true, false]`), `partial` true인 날에 `ready`가 하나라도 true
- AC-1303.3: Given `again.rx`의 줄, When 검사하면, Then `code`·`starts`·`back`·`more` 네 열쇠만 있고, 코드는 처방 코드 검사(`isCode`: 빈 글자·101자·전화·붙임표 주민번호·메일 모양 거부)를 지나며, `starts`는 1 이상 정수, `back`·`more`는 길이 3 배열이고 `ready[k]`가 true면 0 이상 정수, false면 null이어야 한다. 줄이 5,000개를 넘으면 거부한다
- AC-1303.4: Given 숫자 관계, When 검사하면, Then 창마다 `back[k] ≤ starts`, `back[k] ≤ more[k] ≤ N × starts`(N = 7·14·30)이고 숫자인 창끼리 `back`·`more`가 7 ≤ 14 ≤ 30으로 줄지 않아야 통과한다. 시험: 하나씩 어긴 줄은 모두 거부
- AC-1303.5: Given `again.rx`의 코드, When 그날 `rx`와 견주면, Then 같은 코드 줄이 그날 `rx`에 있고 `starts ≤` 그 줄의 `patients`여야 하며 같은 코드가 `again.rx`에 두 번 있으면 거부한다
- AC-1303.6: Given `types/payload.ts`, When 보면, Then `AGAIN_WINDOWS = [7, 14, 30]`(읽기 전용)과 `AgainWindow`, `DayAgainPayload`가 있고 `DayPayload.again`은 있어도 되고 없어도 되는 칸이다. `MonthPayload`·`validateMonthPayload`는 바뀌지 않는다

### REQ-1304: 하루 줄 크기 (`lib/storage/stats.ts`)
- AC-1304.1: Given `again`을 넣으면 하루 줄이 표 크기(65,536바이트, `jsonbText` 잼)를 넘고 빼면 들어가는 날, When `saveStats`를 부르면, Then 그날은 `again` 없이 보내고(화면에서 그날은 '아직 셀 수 없는 날'이 된다) 다른 날은 그대로 보낸다. 저장은 실패하지 않는다
- AC-1304.2: Given `again`을 빼도 크기를 넘는 날, When 부르면, Then 지금처럼 아무것도 보내지 않고 `StorageError('E-STATS-SAVE-FAILED')`다. 크기 안의 날은 `again`을 그대로 보낸다

### REQ-1305: 고른 날 수 저장 표 (운영 SQL 필요)
- AC-1305.1: Given 새 마이그레이션 `supabase/migrations/20261105000300_stats_prefs.sql`, When PGlite에서 인증 → 이 파일 차례로 돌리면, Then 표 `public.stats_prefs`(칸 `hospital_id` 기본 키·`again_window`, 환자 칸 없음)가 생기고 RLS가 켜져 있다. 머리 주석에 `운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다`가 있다. 통계·처방 골라 보기 마이그레이션 없이도 돌고, 먼저 있어도 돈다(`my_hospital_id()`는 cross-branch C1 글자 그대로)
- AC-1305.2: Given 로그인 안 함(`anon`), When 읽기·넣기·고치기, Then 모두 권한 없음이다
- AC-1305.3: Given 승인된 병원 A, When `insert … (again_window) values (14) on conflict (hospital_id) do update set again_window = excluded.again_window`를 두 번(14 → 30) 하면, Then A의 줄은 하나이고 값은 30이며 `hospital_id`는 A다. B는 A의 줄을 못 보고 고쳐도 0줄이다
- AC-1305.4: Given 승인 대기·거절 병원, When 읽고 넣으면, Then 0줄이고 넣기는 거부된다
- AC-1305.5: Given 칸 권한, When `hospital_id`를 직접 넣거나 고치면, Then 권한 없음이다. 넣기·고치기 칸은 `again_window`뿐이고 지우기 권한은 아무에게도 없다
- AC-1305.6: Given 제약, When `again_window`에 7·14·30 밖(0·10·31·null)을 넣으면, Then 거부된다
- AC-1305.7: Given 이 파일, When 글자를 보면, Then 다른 표(`stats_days`·`stats_rx_picks`·`hospitals` 등)를 고치지 않고 `revoke all … from anon, authenticated` 뒤에 필요한 권한만 준다

### REQ-1306: 고른 날 수 저장 코드 (`lib/storage/statsPrefs.ts`)
- AC-1306.1: Given `readAgainWindow()`, When 읽으면, Then 줄이 없으면 null, 7·14·30이면 그 값, 그 밖의 값이면 null이다. 어떤 실패든 `StatsPrefsError('E-STATS-AGAIN-READ-FAILED')`이고 서버 답을 옮기지 않는다
- AC-1306.2: Given `saveAgainWindow(win)`, When 보내면, Then 본문은 `{ again_window: win }` 하나뿐이고(`hospital_id` 없음) `upsert(…, { onConflict: 'hospital_id' })`다. 7·14·30이 아니면 보내지 않고 거부한다. 실패는 `StatsPrefsError('E-STATS-AGAIN-SAVE-FAILED')`다
- AC-1306.3: Given `lib/errors.ts`, When 두 번호를 보면, Then `E-STATS-AGAIN-READ-FAILED`는 what `고른 날 수를 읽지 못했어요`·fix `[다시 읽기]를 눌러 주세요. 그동안은 7일로 보여요. 계속되면 오류 번호를 관리자에게 알려 주세요.`, `E-STATS-AGAIN-SAVE-FAILED`는 what `고른 날 수를 저장하지 못했어요`·fix `[다시 저장]을 눌러 주세요. 계속되면 오류 번호를 관리자에게 알려 주세요.`다
- AC-1306.4: Given `lib/storage/statsPrefs.ts` 소스, When 보면, Then `localStorage`·`sessionStorage`·`indexedDB`·`console`을 쓰지 않고 `lib/parsers`·`lib/bridge`·`workers`·`lib/analytics`를 불러오지 않는다

### REQ-1307: 화면 숫자 (순수 함수 `components/stats/againView.ts`)
- AC-1307.1: Given 기간과 고른 날 수 w, When `againSpan(range, w)`를 부르면, Then 기간 끝 E = min(기간 끝, 오늘 − 1)이고, E − w가 기간 첫날보다 앞이 아니면 센 시작일은 [첫날, E − w]이며, 앞이면 옮겨서 [E − w − 길이 + 1, E − w]다(길이 = 첫날 ~ E 날 수). 시험(오늘 2026-11-05): 최근 7일은 세 창 모두 옮김(7일 → 10-22 ~ 10-28, 14일 → 10-15 ~ 10-21, 30일 → 09-29 ~ 10-05), 최근 30일 + 30일 → 09-06 ~ 10-05(`statsRange`의 `finishedCohort`와 같다), 최근 30일 + 14일 → 10-06 ~ 10-21, 최근 90일 + 30일 → 08-07 ~ 10-05, 최근 12개월 + 7일 → 2025-12-01 ~ 2026-10-28
- AC-1307.2: Given 띠 범위(옮겼으면 옮긴 첫날, 아니면 기간 첫날 ~ E)의 날, When 날마다 가르면, Then 옮겼을 때 옮긴 끝 다음 날 ~ 기간 첫날 앞은 `out`(기간 밖), 센 범위 뒤의 날(옮기지 않은 기간의 끝 w일, 옮긴 기간이면 기간 전체)은 `no`, 센 범위 안은 그날 줄에 `again`이 있고 `ready[k]`가 true면 `ok`, 줄이 없고 그날이 덮은 기간 안(휴진)이면 `ok`, 그 밖(`again` 없는 옛 줄·`ready[k]` false·덮이지 않은 날)은 `no`다. 같은 날 줄이 둘이면 뒤의 것이다(`rowsIn`과 같다)
- AC-1307.3: Given 고른 처방 목록, When `againView(input, w, picks)`를 부르면, Then 줄은 고른 차례 그대로이고 처방마다 `starts`·`back`·`more` = `ok` 날의 합, `wait` = `no` 날 중 `again`이 있는 줄의 `starts` 합이다(`out` 날은 넣지 않는다). 코드는 `codeKey`로 견주고 대소문자만 다른 줄은 더한다. 시험: 시안 예시(시작 3일째·6일째·8일째, 7일) → 시작 1·다시 1·더 2
- AC-1307.4: Given 줄, When 글자를 내면, Then 비율은 `rateText(back, starts)`(소수 첫째 자리까지 버림 + `%`, 시험: 1/3 → `33.3%`, 2/3 → `66.6%`), 평균은 `평균 x번 더`(x = ⌊10 × more ÷ starts⌋ ÷ 10을 소수 한 자리로, 시험: 7/3 → `평균 2.3번 더`, 4/2 → `평균 2.0번 더`, 0/5 → `평균 0.0번 더`)다. `starts` 0이면 둘 다 `–`다. `isFewStarts(row)`는 1 ≤ starts ≤ 9일 때 참이다
- AC-1307.5: Given 띠 범위, When 보면, Then `hasRows`는 그 범위에 날 줄이 하나라도 있음, `hasAgain`은 그중 `again`이 있는 줄이 하나라도 있음이다. `gapDays`는 센 범위 안의 `no` 날 수다
- AC-1307.6: Given 기간, When `againExtraSpan(range)`를 부르면, Then 최근 7일만 [E − 36, 비교 기간 첫날 − 1](오늘 2026-11-05 → 09-29 ~ 10-21)이고 나머지 기간은 null이다. `needsExtra(range, w)`는 최근 7일이면서 14일·30일일 때만 참이다
- AC-1307.7: Given `againBaseText(view, range, periodName)`(기간 이름은 화면이 `PERIOD_NAME`에서 넘긴다), When 부르면, Then 앞·굵게·뒤 세 조각이다. 옮기지 않음: 굵게 `{첫날} – {E − w}`, 뒤 `에 시작한 환자로 셌어요. 시작하고 {w}일이 안 지난 {E − w + 1} – {E}은 아직 셀 수 없어요.` 옮김: 앞 `{기간 이름}({첫날} – {E})에 시작한 환자는 아직 {w}일이 다 지나지 않았어요. 그래서 {w}일이 다 지난 가장 최근 {길이}일, `, 굵게 `{옮긴 첫날} – {옮긴 끝}`, 뒤 `에 시작한 환자로 봤어요.` `gapDays` > 0이면 뒤에 ` 그 안에서도 {n}일은 셀 수 없어요(따로 넣은 파일의 끝 무렵, 이 칸이 생기기 전에 저장한 날 등).`가 붙는다. 날짜는 `{월}월 {일}일`이고 오늘과 해가 다르면 앞에 `{해}년 `이 붙는다(시험: `2025년 12월 1일`)
- AC-1307.8: Given 띠, When `strip`을 보면, Then 이어진 같은 종류 날을 묶은 조각(차례대로, `kind`·날 수)과 `ok`·`no`·`out` 날 수, 띠 첫날·끝날이다
- AC-1307.9: Given 이 파일, When 소스를 보면, Then 날짜 계산은 `lib/analytics/dates.ts`(`addDays`·`diffDays`·`compareYmd`·`eachDay`)와 `coverage.ts`의 `isCovered`만 쓰고 `Date`를 직접 만들지 않는다

### REQ-1308: 훅 (`useAgainWindow`·`useAgainDays`)
- AC-1308.1: Given `useAgainWindow()`, When 처음 그려지면, Then `state` `reading`이고 `readAgainWindow`를 한 번 부른다. null이면 `win` 7·`ready`, 값이면 그 값·`ready`, 실패면 `win` 7·`read-failed`이고 `reread()`가 다시 읽는다
- AC-1308.2: Given `choose(w)`, When 누르면, Then `win`이 바로 바뀌고 `saveAgainWindow`가 한 번에 하나씩 나간다. 앞 요청이 끝나기 전에 또 누르면 앞이 끝난 뒤 마지막 값 하나만 보낸다(시험: 답을 잡아 둔 채 14 → 30 → 7을 누르면 요청은 14, 7 두 번이고 30은 나가지 않는다). 실패하면 `saveFailed` true이고 화면 값은 그대로이며 `retrySave()`나 다음 `choose`가 지금 값을 다시 보낸다. 마지막 값이 저장되면 `saveFailed` false다
- AC-1308.3: Given 보내지 못한 요청이 남은 채 내려감, When 이어지면, Then 남은 요청을 끝까지 보내되 상태를 건드리지 않고 실패하면 조용히 멈춘다(잡히지 않은 거절 없음). `reading` 중에는 `choose`가 아무것도 하지 않는다
- AC-1308.4: Given `useAgainDays(input, w, revision, enabled)`, When `needsExtra`가 거짓이거나 `enabled`가 거짓이면, Then 읽지 않고 `input` 그대로·`ready`다. 참이면 `againExtraSpan`의 `readDays`·`readCoverage`를 한 번씩 부르고(그동안 `reading`) 받은 줄을 앞에, `input.days`를 뒤에 두고 덮은 기간은 `mergeRanges`로 합친 `input`을 낸다. 14일 ↔ 30일을 오가도 다시 읽지 않는다. `revision`·오늘이 바뀌면 다음에 필요할 때 다시 읽고, 늦게 온 앞 답은 버린다. 실패하면 `failed`이고 `retry()`가 다시 읽는다
- AC-1308.5: Given `useAgainWindow.ts`·`useAgainDays.ts`·`againView.ts` 소스, When 보면, Then 브라우저 저장소·주소(`history.`·`location.`·`useSearchParams`)·`lib/bridge/client`·`fetch(`를 쓰지 않는다(rx-picker AC-812.6과 같은 낱말 목록)

### REQ-1309: 같은 처방 재방문 묶음 화면 (`sections/RxPickAgain.tsx`)
- AC-1309.1: Given 묶음, When 그리면, Then 위 1px `line-strong` 선과 함께 h3 `같은 처방 재방문`, 옆 설명 `고른 처방을 시작한 환자가 같은 처방을 다시 받으러 왔는지 봐요`가 있다. 시안에서만 쓰는 것(`새 칸` 칩, `시안에서만 보이는 줄`, `제가 정한 부분`, `예시` 표시, `건수 · 지금 있는 표예요` 줄)은 없다
- AC-1309.2: Given 고른 처방이 없음, When 그리면, Then 머리 아래 `처방을 고르면 7일·14일·30일 안에 같은 처방을 다시 받은 환자가 여기 보여요.` 한 줄만 있고 단추·표가 없다
- AC-1309.3: Given 고른 처방이 있음, When 그리면, Then `시작하고` 이름표와 단추 묶음(`role="group"`, 이름표를 `aria-labelledby`로 가리킴) `7일 안`·`14일 안`·`30일 안`이 있고 고른 것이 `aria-pressed` true다. 모양은 기간 단추와 같다. 누르면 `onWin(w)`. 날 수를 읽는 중이면 단추가 막혀 있다(`aria-disabled`, 눌러도 부르지 않음)
- AC-1309.4: Given 단추 아래, When 그리면, Then 굵은 `어떻게 세나요` 뒤에 `기간 안에 그 처방을 새로 시작한 환자를 모아, 다음 날부터 {w}일 안에 같은 처방을 또 받았는지 봐요. 새로 시작한 날은 앞 30일 동안 그 처방을 받지 않은 날이에요.`가 있다
- AC-1309.5: Given 예시(`<details>`), When 처음 그리면, Then 열려 있고 요약 `한 환자로 예를 들면 (7일 안)`, 9칸 목록(`aria-label="한 환자의 9일"`, `시작`·`1일째` ~ `8일째`, 받은 칸은 시작·3일째·6일째·8일째, 칸마다 `role="img"` `ESWT7 받음`·`안 옴`), 7일 칸 아래 `지켜보는 7일` 띠(`aria-hidden`), 글 `ESWT7을 시작하고 3일째와 6일째에 또 받았어요. 7일 안에 2번 더 받았으니 다시 받은 환자 1명, 더 받은 횟수 2번으로 들어가요. 8일째에 받은 것은 7일이 지난 뒤라 7일 안에는 넣지 않아요.`가 있다. 8일째 칸은 흐리고(muted) 받은 표시가 점선 네모다. 고른 날 수와 상관없이 7일 예시다. 닫으면 이 화면 안에서는 닫힌 채다
- AC-1309.6: Given 숫자가 있음, When 그리면, Then `againBaseText` 세 조각(가운데 굵게), 띠(높이 12px, 조각 사이 1px, `ok` `bg-accent`·`no` 주황 빗금 `text-warning` svg path·`out` `bg-line`, 날 수만큼 폭, `aria-hidden`), 띠 양 끝 날짜(`aria-hidden`), 범례 `센 날 {n}일`·`아직 셀 수 없는 날 {n}일`·`기간 밖 {n}일`(`out`이 있을 때만)이 차례대로 있다
- AC-1309.7: Given 1024px 이상, When 표를 그리면, Then 칸 머리(`aria-hidden`) `처방`·`{w}일 안 재방문율`·`시작한 환자 중`·`더 받은 횟수`·`아직 셀 수 없음`이 있고, 줄마다 이름(600)·코드(caption muted), 비율(16px 600, 오른쪽)과 6px 막대(`bg-accent`, 폭 = 비율), `{시작}명 중 {다시}명`, `평균 x번 더`(600), `{wait}명`이다. 화면 읽기는 넓은 화면에서도 칸 이름(`{w}일 안 재방문율`·`시작한 환자`·`아직 셀 수 없음`)을 읽는다. 이름이 빈 글자이거나 코드와 같으면 코드 하나만 보인다
- AC-1309.8: Given 시작한 환자 1 ~ 9명, When 줄을 그리면, Then 이름 옆에 `10명 미만` 칩(`ds.chip.neutral`), 비율·평균 글자 muted, 막대는 파란 빗금(svg path `text-accent`)이다. 0명이면 비율 `–`·`시작한 환자 0명`·평균 `–`(muted)이고 막대는 빈 막대다
- AC-1309.9: Given 표 아래, When 안내를 그리면, Then 글 폭 `max-w-160`에 차례대로 굵은 이름 + 글: `아직 셀 수 없는 날` `시작하고 {w}일이 다 지나야 셀 수 있어요. 날이 지나고 새 자료를 넣으면 채워져요.` · `파일을 따로 넣을 때` `앞 파일 끝 무렵에 시작한 환자가 뒤 파일에서 다시 받은 것은 이어서 세지 못해요. 두 파일을 한 번에 같이 넣으면 이어서 세요. 비트 PC에서 불러오면 불러온 기간 안에서 이어서 세요.` · `자료 첫 30일` `그 전 기록이 없어서, 전부터 받던 환자도 새로 시작한 것처럼 잡힐 수 있어요.` · (10명 미만 줄이 하나라도 있을 때만) `10명 미만` `시작한 환자가 적으면 한두 명에 비율이 크게 바뀌어요. 참고만 해 주세요.` · `신환 재방문율과 달라요` `위쪽 신환 재방문율은 처음 온 환자가 아무 진료로나 다시 온 비율이에요. 이 칸은 신환·재진 모두, 고른 처방을 다시 받았는지만 봐요.` · `환자 번호` `의원 PC 밖으로 나가지 않아요. 자료를 넣을 때 그 PC 안에서 세고, 날마다 몇 명인지만 저장해요.` 합계 줄·지난 기간 칸은 없다
- AC-1309.10: Given 시안에 없는 상태, When 그리면, Then 날 수 읽는 중은 `고른 날 수를 읽는 중이에요`(`role="status"`)이고 그 아래 숫자가 없다. 날 수 읽기 실패는 `ErrorCard`(`E-STATS-AGAIN-READ-FAILED`) + [다시 읽기]이고 7일 숫자는 그 아래 그대로 나온다. 날 수 저장 실패는 `ErrorCard`(`E-STATS-AGAIN-SAVE-FAILED`) + [다시 저장] + `고른 날 수는 이 화면에 그대로 있어요.`다. 날 줄을 더 읽는 중은 `같은 처방 재방문 숫자를 더 읽는 중이에요`(`role="status"`), 실패는 `ErrorCard`(`E-STATS-READ-FAILED`) + [다시 읽기]이고 숫자가 없다. 띠 범위에 날 줄이 없으면 `불러온 숫자에 이 기간 자료가 없어요.`, 줄은 있는데 `again`이 하나도 없으면 `이 기간 숫자는 같은 처방 재방문을 세기 전에 저장했어요. 비트에서 다시 불러오거나 파일을 다시 넣으면 보여요.`(둘 다 띠·표·안내 없이)다
- AC-1309.11: Given 1024px 미만(`max-lg`), When 그리면, Then 칸 머리가 없고 처방 하나가 네 줄로 쌓인다: ① 이름·코드·칩 ② 왼쪽 큰 비율(`text-heading-m` 600) + `다시 받음`(muted), 오른쪽 `평균 x번 더`(16px 600) ③ 전체 폭 6px 막대 ④ 왼쪽 `{시작}명 중 {다시}명`, 오른쪽 `아직 셀 수 없음 {n}명`. 표를 옆으로 밀지 않는다(`overflow-x` 없음). 768px 미만(`max-md`)이면 날 수 단추는 셋이 같은 폭으로 전체 폭·44px이고 예시 요약·오류 카드 단추는 44px 이상이다
- AC-1309.12: Given 묶음, When `nestedBoxes`로 보면, Then 상자 안 상자가 없고 초점 고리는 `ds.focusRing`이며 `classes.test.ts`의 간격·글자·폭 규칙을 지킨다(그라데이션 없음)

### REQ-1310: 처방 골라 보기에 잇기 (`RxPickerSection.tsx`)
- AC-1310.1: Given 처방 골라 보기, When 그리면, Then 옆 설명이 `고른 처방만 건수와 신환율·재진율, 같은 처방 재방문을 봐요`다(rx-picker AC-801.1의 설명 글을 이 AC가 대신한다). 칸 차례·자리(`col-span-12`)는 그대로다
- AC-1310.2: Given 고른 처방을 다 읽음(`ready`), When 그리면, Then 건수 표(또는 `불러온 숫자에 이 기간 자료가 없어요.`) 바로 아래에 같은 처방 재방문 묶음이 있고 줄은 건수 표와 같은 차례·이름이다. 고른 처방이 없으면 빈 안내(`아직 고른 처방이 없어요`) 아래에 AC-1309.2 한 줄이 있다. 고른 처방을 읽는 중·읽기 실패·저장된 숫자 없음(`saved` false)이면 묶음이 없다
- AC-1310.3: Given 기간을 바꿈, When 다시 그리면, Then 고른 날 수가 그대로이고 새 기간 숫자로 그려진다. 칸을 내렸다가 다시 그리면(같은 가짜 저장) 고른 날 수가 남아 있다
- AC-1310.4: Given 최근 7일에서 30일을 누름, When 그리면, Then 넓은 날 줄 읽기가 한 번 나가고(`readDays` 09-29 ~ 10-21) 그동안 `같은 처방 재방문 숫자를 더 읽는 중이에요`, 답이 오면 09-29 ~ 10-05로 센 숫자다. 최근 7일 + 7일·다른 기간에서는 `readDays`가 페이지 읽기 그대로다(rx-picker AC-802.5의 셈이 바뀌지 않는다)
- AC-1310.5: Given 이 기능의 화면 파일(`RxPickAgain.tsx`는 `RxPick*.tsx`라 rx-picker AC-812.6 시험이 이미 본다), When 그 시험을 돌리면, Then 새 파일도 통과한다. 지금 있는 통계 화면 시험(`StatsScreen.test.tsx`·`RxPickerSection.test.tsx`·`PeriodSummary.test.tsx`)은 고른 날 수 저장 가짜만 더하고 설명 글 한 곳만 바꿔 그대로 통과한다

### REQ-1311: 개인정보 E2E (실제 Supabase, 사용자가 SQL을 붙인 뒤)
- AC-1311.1: Given 시험 계정(승인됨)으로 연 `/stats`와 가짜 비트 파일, When 파일을 넣어 저장하고 처방을 골라 `14일 안`을 누르면, Then 브라우저가 보낸 모든 요청(주소·본문, `authorization`·`apikey`·`cookie`를 뺀 머리)에 그 파일의 차트번호·이름 칸 값·전화·주민번호 모양·파일 이름이 없다. `stats_days` 본문의 `again` 열쇠는 `ready`·`rx`, 그 줄은 `code`·`starts`·`back`·`more`뿐이고 `stats_prefs` 본문은 `{ again_window: 14 }` 하나다. 값은 모으지 않고 걸린 종류와 자리만 보인다
- AC-1311.2: Given 같은 시험 뒤, When 새 페이지로 다시 열면, Then `14일 안`이 눌려 있고 시험 계정의 `stats_days` 줄은 `validateDayPayload`를 지난다. 시험은 `npm run e2e`에서만 돌고 시험 계정의 줄만 쓰며 끝나면 고른 처방을 지우고 고른 날 수를 시험 전 값(없었으면 7)으로 돌린다

### REQ-1312: 계획 문서에 뜻과 표를 적는다
- AC-1312.1: Given `plan.md` §2-2의 '처방 골라 보기 칸의 신환율·재진율' 줄, When 이 TASK가 끝나면, Then 그 바로 아래에 `- **같은 처방 재방문(F/U률)** = 처방 골라 보기에서 고른 처방을 기간 안에 새로 시작한 환자(앞 30일 동안 그 처방을 받지 않은 날) 중, 다음 날부터 7일·14일·30일 안에 같은 처방 코드를 또 받은 환자 비율과 평균 몇 번 더 받았는지. 평균은 다시 오지 않은 환자까지 시작한 환자 모두로 나눈다. 같은 날 두 번은 한 번이다. 셈은 의원 PC 안에서 하고 날마다 처방별 몇 명인지만 저장한다. specs/fu-rate **(사용자, 2026-11-05)**`이 있다
- AC-1312.2: Given `docs/PRD.md` 핵심 기능 1의 '처방 골라 보기 칸의 신환율·재진율' 줄, When 이 TASK가 끝나면, Then 그 바로 아래에 같은 문장(앞 들여쓰기만 그 목록에 맞춤)이 있다
- AC-1312.3: Given `plan.md`의 'DB 표' 목록, When 이 TASK가 끝나면, Then `stats_rx_picks` 줄 아래에 `| \`stats_prefs\` | 통계 탭에서 고른 보기 설정(같은 처방 재방문 7·14·30일). 병원마다 한 줄. specs/fu-rate **(Claude 판단, 2026-11-05)** |`가 있고(plan.md에 넣는 줄에는 백슬래시를 넣지 않는다) 다른 줄은 그대로다

## 범위 밖
- 합계 줄, 지난 기간과 견주기(늘었나 줄었나), 처방 묶음(도수치료20·30을 한 처방으로 보기), 신환·재진으로 나눠 보기, 그래프·자세히·[표 복사]
- 첫 30일·따로 넣은 파일 사이를 고쳐 세기(앞 파일 기록을 서버에 두지 않는다. 환자 번호는 PC 밖으로 나가지 않는다)
- 비트 불러오기 범위 바꾸기(`statsRange`의 `load`), 도우미·확장·`MIN_HELPER`·윈도우 빌드·`helperData.ts`·`columnMap.ts`
- 달 숫자(`MonthPayload`)·AI 리포트·대시보드에 넣기. 옛 날 줄을 서버에서 고치거나 다시 계산하기(파일을 다시 넣거나 비트에서 다시 불러와야 채워진다)
- 직원별 설정(직원 계정이 아직 없다, plan.md §10)

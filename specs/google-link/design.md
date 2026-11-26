# 설계: 웹앱 ↔ 병원 구글 시트·캘린더 잇기 (google-link)

> 요구사항 `requirements.md`(REQ-8501~8542). 화면 글의 원본은 승인 시안 notes 두 개의 '화면 글' 절이다(아래 '화면 글 출처').
> 쉬운 말 풀이: **구글 코드** = 병원 구글 계정 안에 붙여 두는 작은 프로그램(Apps Script 웹 앱). **도우미** = 비트 PC의 청구 도우미(helper/). **비밀 글자** = 웹앱(또는 도우미)과 구글 코드만 아는 암호. **맞춤** = 웹앱과 구글을 서로 같게 만드는 일.

## 1. 개요

두 길이 있다. 둘 다 새 서버 코드는 없다(ADR-004 그대로).

```
수납일지(시트)
  비트 DB ──읽기만──> 도우미 0.14.0 ──HTTPS(주소 HMAC 확인)──> 수납 구글 코드 ──> 그 달 '일일 수납일지' 파일
                         │ 숫자만(넣은 줄 수·결과)
  웹앱 브라우저 <──확장──┘   ──> Supabase gsheet_runs(숫자)·gsheet_months(파일 id)·gsheet_settings(설정)
  웹앱 수납일지 탭 = <iframe src="https://docs.google.com/spreadsheets/d/{id}/edit?rm=minimal#gid={gid}">

예약(캘린더)
  웹앱 브라우저 (lib/gcal) <──fetch(text/plain, 비밀 글자)──> 예약 구글 코드 ──> 고른 캘린더 하나
        │ 로그인한 사용자 권한(RLS)
        └──> Supabase calendar_appts(+g_* 칸)·calendar_allday·gcal_*(연결·상태·고쳐야 할 것·지움 줄·off 날)
  직원 탭 휴가 → DB 트리거 → calendar_allday 'off' → DB 트리거 → gcal_off_days.wait → 브라우저가 off 줄 보냄
```

- 수납: 비트시트(`bitsheet/`) 규칙을 **그대로** 도우미로 옮긴다(C# Core + Code.gs 7판 → 8판). 환자 줄은 도우미 → 구글로만 간다. 브라우저에는 숫자만 온다(ADR-020 길 그대로).
- 예약: 예약 줄은 이미 서버에 있다(ADR-030). 브라우저가 구글 코드와 직접 맞춘다. 받기·보내기 판단은 순수 셈(`lib/calendar/g*.ts`), 부르기·적기는 `lib/gcal`.
- 맞춤은 웹앱이 열려 있는 동안만 돈다(앱 틀의 보이지 않는 부품 둘: `GoogleSheetAuto`·`GcalSync`).

## 2. 시안과 다른 곳

시안 글을 바꾸거나 시안에 없는 글을 더한 곳은 이 표뿐이다. 나머지 화면 글은 시안 그대로다.

| # | 시안 | 명세 | 까닭 |
|---|---|---|---|
| 1 | `connect` 따라 하기 4줄 | 2번 뒤에 한 줄을 더해 5줄: `3. 왼쪽 [서비스] 옆 [+]를 눌러 'Google Calendar API'를 고르고 [추가]를 눌러요.` (옛 3·4는 4·5) | 예약 구글 코드가 캘린더 고급 서비스를 쓴다(바뀐 것만·지운 것까지 받기, 일정 id 정하기 — ADR-054) |
| 2 | 수납 `nobit`은 '도우미 없음'만 그림 | 도우미가 0.14.0보다 낮은 비트 PC는 `nobit` 띠 아래에 `이 PC의 도우미가 옛 판이라 넣지 못해요. 비트 PC 연결 화면에서 새 도우미를 받아 설치해 주세요.`, 크롬 확장이 0.5.0보다 낮으면 `이 PC의 크롬 확장이 옛 판이라 넣지 못해요. 비트 PC 연결 화면에서 새 확장을 받아 바꾼 뒤 웹앱을 새로 고쳐 주세요.`(오류 번호 `E-GSHEET-EXT`, 둘 다 낮으면 두 줄) + [비트 PC 연결] 링크(`/claim/setup`) | 옛 도우미에는 수납 명령이 없고, 옛 확장은 묶어 둔 명령표 밖의 `sheet.*`를 `E-BRIDGE-REJECTED`로 거절한다 |
| 3 | 예약 오류 번호 넷(REACH·KEY·GONE·LIMIT) | 다섯을 더함(아래 '예약 오류 번호' LOGIN·OLD·SERVICE·URL·NOKEY) | 시안 메모 '그 밖의 오류 번호(명세에서 정할 것)' |
| 4 | [지금 맞추기] 알림은 '바뀐 것 없음'만 | 바뀐 것이 있으면 `구글과 맞췄어요 · 바뀐 것 {n}개 ({HH:mm})` | 같은 꼴 |
| 5 | 덮인 쪽 줄 예는 '구글에서 … 웹앱 내용으로 덮었어요' 하나 | 반대 방향 `웹앱에서 {HH:mm}에 고친 내용을 구글 내용으로 덮었어요`, 알아보지 못한 제목 `구글 제목을 알아보지 못해 이름·종류·시행자는 그대로 뒀어요` | 규칙 7('덮인 쪽 내용은 한 줄')의 나머지 경우 |
| 6 | '다 채우면 예약 탭에 알려요'(글 없음) | 알림 `지난 예약 도착을 다 채웠어요.` | 시안에 글이 없다 |
| 7 | 바뀌는 낱말 뒤 조사를 시안 예 낱말에 맞춰 적음 | `{ }` 낱말 끝에 맞춰 이/가·을/를·은/는·와/과·로/으로를 고른다(`lib/calendar/josa.ts`, TASK-7). 끝 글자가 한글이면 받침으로(로/으로는 받침 없음·ㄹ 받침 → 로), 숫자면 읽는 소리로(0·1·3·6·7·8 받침, 1·7·8은 ㄹ), 그 밖 글자는 받침 없음으로. 이 규칙을 따르는 틀 글: `'{표시}'{은/는} 시행자 표시에 없어요` · `'{글}'{을/를} 종류로 알아보지 못했어요 (고르면 '{글}'{은/는} 메모로 남아요)` · `'{이름}'{을/를} 원장님·직원 목록에서 찾지 못했어요` · `{시행자}{과/와} {시행자}{이/가} 같은 색({색})이에요.` · `구글에서 이 색 일정은 모두 '{취소|변경}'{으로/로} 알아봐요.`(시안 `'{취소}'으로`는 '취소'에서 `'취소'로`) · `'{캘린더}'{으로/로} 잇고 다음 →` · `{캘린더}{을/를} 골랐어요 · 아직 가져오지 않았어요` · `구글 캘린더 {캘린더}{와/과} 이어짐 · …`(예약 탭 띠·맞춤 방법 띠) · `{종류}{으로/로} 봐요` · `(예약 시행자 ({표시}) {이름}{과/와} 이어져 있어요)` · `… 구글 제목이 {제목}{으로/로} 다시 적혀요.` | 바뀌는 낱말이라 시안 예 낱말의 조사가 다른 낱말에서는 틀린다 |
| 8 | `err-frame`은 '알아챘을 때' | 틀이 20초 안에 열리지(load) 않으면 `err-frame` | 바깥 틀 안을 웹앱이 들여다볼 수 없다 |
| 9 | 시안은 잇는 병원만 그림 | 잇지 않은 병원: 예약 탭 구글 띠 없음, 직원 탭 휴가 글 그대로, 시행자·종류 화면은 처음 잇기 차례 없이 [저장]만, 캘린더 기본 색 = `#4285F4` | 지금 쓰는 병원을 바꾸지 않게 |
| 10 | 지운 시행자·종류 예약은 (지금) 회색 | 캘린더 기본 색 | 11색에 회색이 없고 흑연은 변경 색이다 |
| 11 | 시안에 없음 | 처음 가져오기 때 웹앱에만 있던 오늘 뒤 예약도 구글에 새로 적는다(화면 글 없음) | 가져온 뒤 양쪽이 같아야 한다 |
| 12 | 시안에 없음 | 데스크도 `/settings/google-calendar`를 연다(보기만, 시안의 '데스크 계정은 보기만 해요') | 지금 데스크는 설정 주소가 막혀 있다 |
| 13 | 시안에 없음 | 시행자 없이 가져온 지난 예약의 [고치기] 판에만 시행자 고르기 맨 앞 `없음` | 그 예약을 고칠 때 시행자를 억지로 고르지 않게 |
| 14 | 미리 보기 표 '… 아래로 {n}개 더 있어요' | 없음(시안 전용 글). 보이는 줄만 그리는 긴 표 | 4,000줄을 다 그리면 화면이 멈춘다 |
| 15 | 수납 [구글에 붙일 코드 복사] | 글·단추 그대로, 복사는 도우미가 윈도 클립보드에 한다 | 비밀 글자가 브라우저를 거치지 않게(ADR-052) |
| 16 | 시안에 없음(지금 예약 추가 판 글 `10분 단위로 적어 주세요 (예: 14:30)`·`1430처럼 쳐도 돼요 · 10분 단위`) | `5분 단위로 적어 주세요 (예: 14:30)`·`1430처럼 쳐도 돼요 · 5분 단위`, 시작 고르기 목록도 5분 칸(TASK-3) | 시작이 5분 단위가 된다(시안 기본값 '시작 5분 · 칸 그리기 10분') |
| 17 | `settings` '구글 연결 › 2. 구글에서 받은 주소'·'시트 › 함께 쓸 직원 메일'은 [저장]으로 서버에 저장 | 두 칸은 넣는 PC 도우미에만 둔다(서버에 안 감). 칸 값은 도우미 `sheet.status`에서 읽어 채우고, 바뀐 채로 [연결 시험]·[저장]을 누르면 도우미가 그 PC에 윈도 확인 창을 띄운다. 기다리는 동안 칸 아래 `이 PC 화면에 뜬 확인 창에서 [바꾸기]를 눌러 주세요.`, [취소]·2분 지남이면 오류 카드 `E-GSHEET-DECLINED`. 이 PC에 도우미가 없거나 비밀 글자가 없으면 두 칸은 비운 채 잠근다(넣는 PC에서 고침 — '넣는 PC' 줄 글 그대로, 새 글 없음). 확인 창(도우미): 제목 `수납일지 구글 코드 주소 바꾸기`, 글 `오늘 수납 환자 줄(이름·차트번호·금액)을 아래 구글 코드로 보내고, 새 달 파일을 아래 메일과 함께 써요. 병원 구글 계정에서 받은 주소가 맞으면 [바꾸기]를 눌러 주세요.` + `주소: {주소}` + `함께 쓸 직원 메일: {메일, 메일 | 없음}`, 단추 [바꾸기][취소] | 웹앱이나 서버를 손에 넣은 사람이 원격으로 환자 줄 받는 곳을 바꾸지 못하게(ADR-052). 넣는 PC = 비밀 글자가 있는 PC이므로 설정 화면도 그 PC에서만 열린다(시안 그대로) |

## 3. 내가 정한 구조에서 바꾼 것 (보고용)
1. **구글 코드 두 벌**(수납 `google-code/sheet`, 예약 `google-code/calendar`): 비밀 글자를 쥔 곳이 다르다 — 수납은 넣는 PC 도우미만(시안 '이 PC만 아는 비밀 글자'), 예약은 서버(모든 PC·데스크가 맞춤). 한 벌이면 한쪽에서 복사할 때 다른 쪽 비밀 글자를 알아야 한다. 시안도 두 화면에 복사 단추·주소 칸이 따로 있다.
2. **예약 코드는 캘린더 고급 서비스**: CalendarApp만으로는 '바뀐 것만'·'지운 일정'을 받을 수 없어 2분마다 1년 치를 다 읽어야 하고, 일정 id를 정할 수 없어 두 PC가 함께 보내면 일정이 둘 생긴다. 대신 붙일 때 한 단계(서비스 켜기)가 는다(시안과 다른 곳 1).
3. **수납 구글 코드 주소·함께 쓸 직원 메일은 넣는 PC 도우미에만(DPAPI), 바꿀 때는 그 PC의 윈도 확인 창 + 원본·폴더 소유 확인**: 처음 설계는 주소를 서버 설정에 두었는데, 그러면 웹앱 계정이 털리거나 화면에 나쁜 글(XSS)이 끼었을 때 주소·메일을 원격으로 바꿔 환자 수납 줄을 빼 갈 수 있다. 그래서 두 값은 서버에 두지 않고 도우미 `sheet.dat`에만 두며, 바꾸기(`sheet.link`)는 그 비트 PC 화면에 도우미가 띄운 확인 창에서 사람이 [바꾸기]를 눌러야 된다(`confirm: true` — 지금 `bit.register`와 같은 길). `hello`(HMAC)는 '이 주소의 코드가 이 PC의 비밀 글자를 아는지'만 본다(맞지 않으면 비밀 글자·환자 줄을 보내지 않음). 처음 시안대로 설정 화면은 넣는 PC(비밀 글자가 있는 PC)에서만 열리므로 확인 창도 같은 PC에 뜬다(시안과 다른 곳 17).
8. **크롬 확장 0.5.0**: 확장이 명령표를 묶어 넣고 목록 밖 명령을 거절하므로(`extension/src/relay.ts` `checkRequest`), 확장 코드는 그대로 두고 판 글자만 올려 새 명령표로 다시 묶는다. `helper.yml`이 도우미 zip과 확장 zip을 함께 만든다.
9. **1년 지우기와 구글**: 지난 줄 지우기(`calendar_appts_prune`)가 새 지움 트리거를 돌려 구글 일정까지 지우지 않게, 트리거는 한국 오늘 − 1년보다 이른 날의 줄을 적지 않고 보내기도 이은 날보다 이른 줄은 버린다.
10. **'나중 고친 쪽'은 `g_wait_at`(DB가 사용자 고침 때만 정함)으로 견준다**: `updated_at`은 도착·맞춤 표시 적기에도 바뀐다.
4. **비트 통로 빌리기(`bitLane`)**: 확장은 웹 연결을 한 번에 하나만 받는다. 비트 PC에 예약 탭이 하루 종일 열려 있으면 그 화면이 통로를 쥐어 5분 넣기가 한 번도 못 돈다. 같은 쪽 화면이 쥔 통로로 숫자 명령(`sheet.*`)만 빌려 부른다.
5. **이어지지 않은 직원의 휴무 줄('m-' id)과 `calendar_off_names()`**: 시안 off 줄에 데스크 직원(예약 시행자 아님)도 있다. 지금 휴가 트리거는 이어진 사람만 휴무 줄을 만든다.
6. **지난 예약 도착 채우기**는 같은 도우미 0.14.0에서 `calday` 한도를 오늘 − 62일 → 400일로 넓혀 예약 탭 비트 PC가 한 주씩 한다.
7. Phase를 넷으로 나눴다(공통 → 도우미·맞춤 엔진 → 화면 → 잇기). 같은 Phase 안에서 서로의 새 파일을 부르지 않게.

## 4. 화면 글 출처
- 수납: `docs/mockups/google-link/notes-sunap.md` '## 화면 글' 아래 상태별 절. 예약·직원: `notes-calendar.md` '## 화면 글'. `{ }`는 바뀌는 값, `[ ]`는 단추.
- 화면 글은 각 화면 폴더의 `labels.ts` 한 곳에 상수로 두고, 시험은 그 상수가 아니라 **notes의 글자를 그대로** 적어 견준다(복사 실수를 잡으려고).
- '시안 · 가상 자료' 띠·시안 상태 고르기 띠·시안 전용 글은 만들지 않는다.
- 폰 전용 모양은 만들지 않는다(사용자 규칙). 넓은 표는 표 칸 안에서만 옆으로 밀린다.

## 5. 비밀 글자 — 어디에 두고 누가 읽나

| 비밀 글자 | 만드는 곳 | 두는 곳 | 읽는 쪽 | 절대 안 가는 곳 |
|---|---|---|---|---|
| 수납 `TOKEN`(+ 코드 주소·함께 쓸 메일) | 넣는 PC 도우미 `sheet.code`(무작위 32바이트 → base64url 43자). 주소·메일은 그 PC에서 확인 창 [바꾸기]로만(`sheet.link`) 또는 [그대로 가져오기] | 그 PC `%LOCALAPPDATA%\Seoseungkwan\PrecheckHelper\data\sheet.dat`(지금 도우미 저장 파일과 같은 자리·같은 DPAPI CurrentUser + 도우미 저장 entropy, `DpapiProtector.StoreEntropy`), 비밀 글자는 구글 코드 첫 줄에도 | 도우미(비밀 글자·주소·메일), 그 병원 구글 코드(비밀 글자) | 비밀 글자: 브라우저·Worker·서버·기록 파일·답 어디에도. 주소·메일: 서버에 두지 않음(브라우저에는 설정 칸 보이기로만 `sheet.status` 답에 옴). 서버에는 `secret_tag` = SHA-256(비밀 글자) 16진수 앞 16자만 |
| 예약 `KEY` | 브라우저 `crypto.getRandomValues`(32바이트 → base64url) | 서버 `gcal_links.secret`(RLS: 그 병원 원장 읽기·쓰기, 데스크 읽기, 보는 관리자 못 읽음), 구글 코드 첫 줄 | `lib/gcal/client.ts`(요청 본문 `key`), 그 병원 구글 코드 | 화면 그리기(저장한 뒤 다시 안 그림)·console·기록·주소줄(GET 쿼리)·브라우저 저장소 |

- 두 코드 모두 비밀 글자 자리(`__TOKEN__`·`__KEY__`)는 파일에 한 번만 나온다(시험). 비교는 길이·글자를 끝까지 보는 같은 시간 비교.
- 비트시트 [그대로 가져오기]는 `%APPDATA%\BitSheet\settings.json`의 `TokenProtected`(DPAPI, entropy `BitSheet.token.v1`)를 도우미가 풀어 `sheet.dat`로 옮긴다. 브라우저에는 `secretTag`만 간다.
- 시험·가짜 자료의 비밀 글자는 지어낸 글자만 쓴다. 커밋·로그·출력·채팅에 진짜 비밀 글자를 내지 않는다.

## 6. 보안 머리 (CSP)
- `src/lib/csp.ts` `buildCsp(isDev, supabaseUrl, opts)`에 `opts.sheetFrame?: boolean`을 더한다.
  - 모든 경로: `connect-src`에 `https://script.google.com`·`https://script.googleusercontent.com`(구글 웹 앱은 302로 googleusercontent `/macros/echo`에서 답한다). 와일드카드 없음.
  - `sheetFrame: true`(next.config `/sunap`·`/sunap/:path*` 머리만): `frame-src https://docs.google.com` 한 줄을 더한다. 다른 경로는 `frame-src`가 없어 `default-src 'self'`를 따른다(바깥 틀 금지).
  - `/location`은 `{ kakao: true }` 그대로 + 위 connect 두 개(모든 경로라).
- 도우미가 구글에 붙는 것은 CSP와 상관없다(PC 프로그램).
- 틀: `<iframe title="구글 시트" src=… referrerPolicy="no-referrer" allow="clipboard-read; clipboard-write">`(sandbox 없음 — 구글 자기 origin이라). 파일 id는 `^[A-Za-z0-9_-]{20,100}$`, gid는 0 이상 정수일 때만 주소에 넣는다.

## 7. DB — `supabase/migrations/20261126000000_google_link.sql`

앞에 있어야 하는 것: `20261117010000_calendar.sql`·`20261118100000_desk_accounts.sql`·`20261119000000_clinic_profile.sql`·`20261121000000_staff.sql`·`20261124000000_admin_view.sql`. 두 번 붙여 넣어도 그대로(표·칸·색인은 없을 때만, 함수·트리거 바꿔 쓰기, 권한 거두고 다시 주기, 정책 지우고 다시 만들기, 색 옮기기는 새 이름을 새 이름으로 둠). 실행은 사용자가 SQL Editor에서(`ssk-supabase-sql`). 관문: SQL 먼저, 사이트는 그다음.

### 7-1. `calendar_appts` 바뀜
- 시작: 이름 붙은 제약 `calendar_appts_start_min_check`를 지우고 `start_min between 0 and 1435 and start_min % 5 = 0`으로 다시. 처음 자리 `calendar_appts_orig_start_check`도 지우고 `orig_start between 0 and 1435 and orig_start % 5 = 0`으로 다시(5분 시작을 옮길 때 처음 자리가 막히지 않게).
- 시행자: `staff_id`·`staff_name`·`staff_mark`의 not null을 풀고 제약 `calendar_appts_staff_all`: 세 칸이 모두 null이거나 모두 not null(그 밖 칸 길이 제약은 그대로).
- 새 칸(`g_wait_at` 밖은 모두 사용자 넣기·고치기 칸 권한을 준다. `g_wait_at`은 읽기만, 트리거만 적는다):

| 칸 | 모양 | 뜻 |
|---|---|---|
| `g_event_id` | text, `^[A-Za-z0-9_]{5,300}$` | 구글 일정 id. 웹앱이 만든 일정은 `ssk` + 32자 16진수 |
| `g_updated` | timestamptz | 마지막으로 본·쓴 구글 `updated` |
| `g_title` | text ≤ 200 | 마지막으로 본·쓴 구글 제목(개인정보 모양 조각은 `…`) |
| `g_color` | text in '1'~'11', null = 캘린더 기본 색 | 일정 자기 색(취소·변경 색 전 색) |
| `color_from` | text not null default 'app', in ('app','google') | google = 구글에서 온 색 그대로 칠함 |
| `g_keep_title` | boolean not null default false | 참 = 구글 제목을 웹앱 꼴로 다시 쓰지 않음(가져온 뒤 칸을 고치기 전) |
| `g_moved` | boolean not null default false | 구글에서 변경 색이 됨(처음 시간 모름) |
| `g_gone` | boolean not null default false | 구글에서 지워짐(되돌리면 되살림) |
| `g_wait` | text in ('new','edit','move','cancel','uncancel','color'), null = 구글과 같음 | 아직 못 보낸 바뀜 |
| `g_wait_at` | timestamptz | 사용자가 고친 때(보내는 차례·'나중 고친 쪽' 견주기). 트리거 `calendar_appts_gwait`만 적는다 |
| `g_note` | text ≤ 100 | 덮인 쪽 한 줄 |
| `g_from` | text in ('import','pull','web') | 들어온 길 |
| `g_how` | jsonb object ≤ 600바이트 | 알아본 출처 `{staff:'title'|'color'|'picked'|'none', kind:'title'|'color'|'setting'|'picked', memo:boolean, gStart, gEnd}` |

- 유일 제약 `calendar_appts_g_event_one unique (hospital_id, g_event_id)`(null은 여럿 됨 — 부분 색인이 아니라 제약이라 `on conflict`가 쓴다).
- 트리거 `calendar_appts_gdel`(after delete for each row, security definer): `old.g_event_id`가 있으면 `gcal_deletes`에 (old.hospital_id, old.g_event_id, old.day, 'appt', old.g_title) on conflict do nothing.
  - 단 `old.day`가 한국 오늘 − 1년보다 이르면 적지 않는다(1년 지우기 `calendar_appts_prune`이 지운 줄 — 구글 일정은 그대로 둠, AC-8502.10).
- 트리거 `calendar_appts_gwait`(before insert or update for each row, invoker): `new.g_wait`가 null이면 `new.g_wait_at := null`. 아니면 넣을 때, 또는 `old.g_wait`가 null이었거나 `new.g_wait`가 바뀌었거나 사용자 칸(`day`·`start_min`·`len_min`·`name`·`chart`·`staff_id`·`staff_name`·`staff_mark`·`kind_id`·`kind_name`·`memo`·`status`) 하나라도 바뀌었으면 `new.g_wait_at := clock_timestamp()`, 그 밖(도착 `auto`·`g_note`·`g_updated`·`g_title` 등만 바뀜)은 `new.g_wait_at := old.g_wait_at`. 보낸 뒤 비우기는 `update … set g_wait = null where id = … and g_wait_at = <보낼 때 읽은 값>`(그 사이 또 고쳤으면 0줄 → 다음에 또 보냄).
- `calendar_appts_move`는 그대로(옮기면 처음 자리·도착 비움).

### 7-2. `calendar_allday` 바뀜
- 새 칸 `g_event_id`(같은 모양)·`g_updated` timestamptz·`g_wait` boolean not null default false·`g_wait_at` timestamptz(트리거 `calendar_allday_gwait`만 — 예약과 같은 규칙, 사용자 칸은 `day`·`memo`, `g_wait`가 거짓이면 null). 웹앱이 만든 종일 메모는 넣는 같은 쓰기에 `g_event_id = 'ssk' + 32자 16진수`를 적는다. 제약 `calendar_allday_g_memo`: `type = 'memo' or g_event_id is null`. 유일 `calendar_allday_g_event_day unique (hospital_id, g_event_id, day)`.
- 칸 권한: 넣기 (g_event_id, g_updated, g_wait) 더함, 고치기 (day, memo, g_event_id, g_updated, g_wait)를 새로 줌(`g_wait_at`은 읽기만, type·staff·part·leave_id는 고치기 없음). 고치기 정책 둘(원장 `my_hospital_id()`·데스크 `my_desk_hospital_id()`, using·with check 내 병원)을 새로 두고, 보는 관리자 restrictive는 지금 그대로라 쓰기 없음.
- 트리거 `calendar_allday_guard`(before update, invoker): `old.type`이 'memo'가 아니면 `day`·`memo`가 바뀌는 고치기를 거절(`P0001`) — off 줄은 지금처럼 넣기·지우기로만(휴가 트리거와 짝이 맞게). 메모 글 길이 제약은 그대로.
- 트리거 `calendar_allday_gdel`(after delete, definer): 메모 줄에 `g_event_id`가 있으면 `gcal_deletes`에 (…, old.day, 'memo', old.memo). `old.day`가 한국 오늘 − 1년보다 이르면 적지 않는다.
- 트리거 `calendar_allday_offwait`(after insert or delete for each row, definer): `type = 'off' and part is null`이면 `gcal_off_days`에 (hospital_id, day) upsert `wait = true, wait_at = now()`. 그날이 한국 오늘 − 1년보다 이르면 아무것도 안 한다(1년 지우기).

### 7-3. 새 표

| 표 | 칸 | 뜻 |
|---|---|---|
| `gcal_links` | `hospital_id` pk default `my_hospital_id()`, `script_url` text(`^https://script\.google\.com/(a/macros/[A-Za-z0-9.-]{1,253}|macros)/s/[A-Za-z0-9_-]{10,200}/exec$` — 회사 계정 꼴도), `secret` text(`^[A-Za-z0-9_-]{32,128}$`), `calendar_id` ≤300, `calendar_name` ≤100, `default_hex`(`^#[0-9A-Fa-f]{6}$`), `linked_on` date(이은 날 = 맞춤 시작 0시), `rules` jsonb object ≤2000, `look` jsonb object ≤4000, `updated_at` | 병원 하나에 한 줄. rules·look 안 모양은 앱이 `checkGcalRules`·`checkGcalLook`으로 본다 |
| `gcal_state` | `hospital_id` pk default `my_clinic_hospital_id()`, `pulled_until` timestamptz, `last_ok_at`, `fail_since`, `fail_code`(`^E-[A-Z0-9-]{1,30}$`), `arrival_until` date, `arrival_done` boolean default false, `updated_at` | 맞춤 상태. before update 트리거가 `pulled_until := greatest(old, new)`(뒤로 안 감) |
| `gcal_fixes` | `id` uuid pk, `hospital_id` default `my_clinic_hospital_id()`, `g_event_id` not null, `day` date, `start_min` 0~1435, `len_min` 1~1440, `all_day` boolean, `g_color` '1'~'11'|null, `g_title` ≤200 not null, `reason` in ('no-staff','no-staff-color','bad-mark','bad-kind','not-appt','too-long','off-name'), `guess` jsonb object ≤2000(알아본 칸: 차트번호·이름·종류·시행자·메모·고를 거리), `state` in ('open','skip') default 'open', `g_updated` not null, `created_at`; 유일 (hospital_id, g_event_id, day) | 고쳐야 할 구글 예약. 넣을 때 그 병원 한국 오늘 − 1년보다 이른 줄을 지운다 |
| `gcal_deletes` | `hospital_id`, `g_event_id`, `day`, `kind` in ('appt','memo'), `label` ≤200, `created_at`; pk (hospital_id, g_event_id, day) | 구글에서 지울 것. 트리거만 넣는다 |
| `gcal_off_days` | `hospital_id` default `my_clinic_hospital_id()`, `day`, `g_event_id`, `g_title` ≤200, `g_updated`, `wait` boolean default false, `wait_at`; pk (hospital_id, day) | 그날 구글 off 줄 짝(사람 이름만, 환자 없음) |
| `gsheet_settings` | `hospital_id` pk default `my_clinic_hospital_id()`, `conf` jsonb object ≤16000(확인 제약: 열쇠 `scriptUrl`·`url`·`shareWith`가 없음 — 그 둘은 도우미에만), `secret_tag`(`^[0-9a-f]{16}$`), `updated_at` | 수납 시트 설정 한 벌. 안 모양은 `checkGsheetSettings` |
| `gsheet_months` | `hospital_id` default `my_clinic_hospital_id()`, `ym`(`^[0-9]{4}-(0[1-9]|1[0-2])$`), `file_id`(`^[A-Za-z0-9_-]{20,100}$`), `gids` jsonb object ≤2000(`"1"`~`"31"` → 정수), `seen_at`; pk (hospital_id, ym) | 달 파일 id·날짜 시트 gid |
| `gsheet_runs` | `id` uuid pk, `hospital_id` default `my_clinic_hospital_id()`, `at` default now(), `day` date, `via` in ('auto','hand','evening','past'), `mode` in ('fillEmpty','overwrite'), `outcome` in ('ok','warn','same','fail'), `code`(`^E-[A-Z0-9-]{1,30}$`)|null, `rows` int ≥ 0, `counts` jsonb(값이 모두 숫자·참거짓, ≤4000), `cells` text[](20개까지, 하나하나 `^[^!]{1,31}![A-Z]{1,3}[0-9]{1,4}$`) | 넣은 기록. 넣을 때 그 병원의 14일보다 오래된 줄을 지운다 |

- 검사 함수 `gsheet_counts_ok(jsonb)`·`gsheet_cells_ok(text[])`(immutable, sql) — 확인 제약 안에서 부른다.
- 함수 `calendar_off_names()`(security definer, stable): `my_clinic_hospital_id()` 병원의 `clinic_profiles.staff` 사람마다 `{id, name}` + `calendar_staff_id`가 없고 퇴사일이 없거나 오늘 뒤인 `staff_members`마다 `{id: 'm-' || replace(id::text,'-',''), name}`을 jsonb 배열로. 원장·데스크만 부를 수 있다(execute를 authenticated에 주고 함수 안에서 병원 없으면 빈 배열).
- 휴가 트리거 두 함수(`staff_leave_link`·`staff_member_relink`)를 지금 글 그대로 다시 만들고 한 갈래만 더한다: `calendar_staff_id`가 null이고 `new.part`가 null이면 `('m-' || replace(m.id::text,'-',''), left(m.name,10))`로 'off' 줄(같은 on conflict). relink는 새 id가 null이 되면 'm-' 줄로 다시 넣는다. migration 끝에 한국 오늘 − 1년 뒤 휴가 가운데 'm-' 줄이 없는 하루 종일 휴가를 한 번 채운다.
- `gcal_fixes` 1년 지우기·`gsheet_runs` 14일 지우기는 `calendar_appts_prune`과 같은 모양(넣는 사람 권한, 지울 줄이 있을 때만 지우는 문장).

### 7-4. 색 옮기기 (AC-8502.4)
- 함수 `gcal_color_name(text)`(immutable, 이 파일 안에서만 쓰고 권한 거둠): 아래 표. 이미 새 이름이면 그대로, 모르는 값은 'graphite'.

| 옛 이름 | 새 이름 | | 옛 이름 | 새 이름 |
|---|---|---|---|---|
| blue · navy | blueberry | | pink · coral | flamingo |
| teal · green · forest | basil | | lime · mint | sage |
| purple · magenta | grape | | sky | peacock |
| orange · brown | tangerine | | red · wine | tomato |
| yellow | banana | | lavender | lavender |
| black · gray | graphite | | | |

- `calendar_settings.kinds`: 종류마다 `color`가 null이 아니고 'default'도 아니면 새 이름으로, `words`가 없으면 기본 단어(id dosu `["도수"]`, jabo `["자보도수","자보"]`, shock `["충격파","타"]`, inj `["주사"]`, visit `["진료"]`, 그 밖 `[name]`).
- `clinic_profiles.staff`: 사람마다 `color` 새 이름.
- `calendar_settings.staff`(병원 정보가 없는 의원이 쓰는 옛 시행자 목록): 사람마다 `color` 새 이름(그 목록을 지우거나 줄이지 않는다).
- `calendar_settings.kinds` 기본값: `[{"id":"dosu","name":"도수","len":30,"color":null,"words":["도수"]},{"id":"jabo","name":"자보도수","len":30,"color":null,"words":["자보도수","자보"]},{"id":"shock","name":"충격파","len":15,"color":"sage","words":["충격파","타"]},{"id":"inj","name":"주사","len":10,"color":null,"words":["주사"]},{"id":"visit","name":"진료","len":10,"color":null,"words":["진료"]}]`.

### 7-5. 권한 표 (AC-8502.2)
기본 권한을 모두 거둔 뒤(`revoke all … from public, anon, authenticated`) 아래만 준다. 원장 = `my_hospital_id()`, 데스크 = `my_desk_hospital_id()`, 보기 = ADR-046 보는 중 관리자.

| 표·칸 | 원장 | 데스크 | 보는 관리자 | 다른 병원·대기·anon |
|---|---|---|---|---|
| `calendar_appts` 새 칸 | 읽기·넣기·고치기(`g_wait_at`은 읽기만) | 같음(지금 데스크 정책) | × (지금 restrictive 그대로) | × |
| `calendar_allday` 새 칸 | 읽기·넣기·고치기(g 칸만) | 같음 | 읽기만(지금 정책 그대로 — `admin_view.sql` 읽기 목록에 든 표이고 칸 권한은 정책마다 나눌 수 없다. 새 칸에 환자 자료 없음) | × |
| `gcal_links` | 읽기·넣기·고치기(지우기 없음) | 읽기만 | ×(restrictive만, permissive 읽기 없음) | × |
| `gcal_state` | 읽기·넣기·고치기 | 같음 | × | × |
| `gcal_fixes` | 읽기·넣기·고치기·지우기 | 같음 | × | × |
| `gcal_deletes` | 읽기·지우기(넣기는 트리거) | 같음 | × | × |
| `gcal_off_days` | 읽기·넣기·고치기·지우기 | 같음 | × | × |
| `gsheet_settings` | 읽기·넣기·고치기 | 같음 | 읽기만(permissive + restrictive) | × |
| `gsheet_months` | 읽기·넣기·고치기 | 같음 | 읽기만 | × |
| `gsheet_runs` | 읽기·넣기 | 같음 | 읽기만 | × |
| `calendar_off_names()` | 부름 | 부름 | 빈 목록 | 빈 목록·거부 |

- 보는 관리자 정책은 `20261124000000_admin_view.sql`과 같은 이름·꼴('관리자 보는 의원 읽기' permissive, '보는 중에는 그 의원만 · 쓰기 없음' restrictive). `supabase/adminView.rls.test.ts` AC-8002.8 목록에 새 표를 '보기 ○'(gsheet 셋)·'보기 ×'(gcal 다섯)로 더한다.
- `hospital_id`·`id`·`created_at`·`updated_at`은 칸 권한이 없다(기본값·트리거만).

## 8. 구글 코드 약속

### 8-1. 수납 `google-code/sheet/Code.gs` (판 '8')
- 비트시트 `apps-script/Code.gs`(작업 트리 파일, 7판)를 그대로 옮기고 아래만 바꾼다. `doGet`의 글은 `Seoseungkwan sheet ok`.
- `BITSHEET_VERSION = '8'`. `route_`의 action에 `hello`·`months`를 더한다(그 밖 글은 그대로).
- `hello {action, nonce}`(token 없이 받는다): nonce는 16~64자 `[A-Za-z0-9_-]`. 답 `{ok:true, version:'8', mac: base64url(HMAC-SHA256(TOKEN, nonce))}`. TOKEN이 자리 글자 그대로면 7판과 같은 `token_not_set`(틀린 token은 `bad_token` — 두 코드 모두 이 두 이름만 쓴다). 쓰임은 '이 주소의 코드가 이 PC의 비밀 글자를 아는가'뿐이다(주소가 맞는지는 사람이 확인 창에서 본다, 9-2). `ScriptApp.getService().getUrl()`에는 기대지 않는다(새 편집기에서 다른 배포 주소를 줄 수 있음).
- `months {token, action, month:{templateId, folderId}, names:[{ym, fileName}] (13개까지)}`: 달마다 7판 `findOrCreateMonthFile_`의 1·2단계(스크립트 속성 `file:<이름>` → 폴더 안 같은 이름)만 하고 만들지 않는다. 답 `{ok, version, months:[{ym, fileId|null, gids:{'1':gid…}}]}`(날짜 시트 이름 '1'~'31'인 것만).
- 소유 확인: `openTemplate_`·`openFolder_`가 `file.getOwner()`(폴더도)의 메일이 `Session.getEffectiveUser().getEmail()`과 다르면(소유자가 없으면 = 공유 드라이브) `template`·`folder` 오류(7판 오류 글 그대로).
- `write` 답에 `sheetGid`(쓴 날짜 시트 `getSheetId()`)를 더한다. 그 밖 넣기 규칙·답 칸은 7판 그대로.
- 시험: `google-code/test/fakeGoogle.ts`(비트시트 `fake-google.js`를 TS로 옮기고 `Utilities.computeHmacSha256Signature`·`base64EncodeWebSafe`·`getOwner`·`getSheetId`·`Session`을 더함) + `sheet.test.ts`(7판 시험 전부, 기대값 그대로) + `sheetMonths.test.ts`(새 셋). vm으로 `Code.gs`를 불러 돈다.

### 8-2. 예약 `google-code/calendar/Code.gs` (판 '1')
- 첫 줄 근처 `const KEY = '__KEY__';`, `CAL_VERSION = '1'`. 주소 확인(HMAC)은 없다 — 예약 주소·비밀 글자는 원장만 쓰는 `gcal_links`에 있고, 그 계정을 쥔 사람은 이미 예약 줄을 읽을 수 있어 주소를 바꿔도 더 빼 갈 것이 없다. `doGet` 글 `Seoseungkwan calendar ok`. `doPost`는 JSON `{key, action, …}`, 답은 JSON(ContentService). 오류 글에 제목·이름을 넣지 않는다.
- 고급 서비스 `Calendar`(v3)가 없으면(`typeof Calendar === 'undefined'`) `{ok:false, error:'no_service'}`.
- 일정 모양(답): `{id, status:'confirmed'|'cancelled', summary, description(500자까지), allDay, start, end, colorId:'1'~'11'|null, updated, recurring}` — 시각은 `Asia/Seoul` `YYYY-MM-DDTHH:mm`, 하루 종일은 `YYYY-MM-DD`(end는 다음 날, 구글과 같음).

| action | 받는 것 | 하는 일 | 답 |
|---|---|---|---|
| `ping` | — | `CalendarList.list` | `{ok, version, now, calendars:[{id, name, access, hex, past, future}]}` — access in owner·writer·reader·freeBusyReader, past/future는 owner·writer만(각 10,000에서 멈춤) |
| `list` | `calendarId, from, to, pageToken?` | `Events.list(singleEvents, showDeleted:false, timeMin/Max, maxResults 2500)` | `{ok, version, now, events, next}` |
| `changes` | `calendarId, since(RFC3339), from(날짜), pageToken?` | `Events.list(updatedMin: since, showDeleted:true, singleEvents, timeMin: from 0시)`. 구글이 410(`updatedMin`이 너무 오래됨)이면 `too_old` | 같음 |
| `put` | `calendarId, id, fields{summary?, description?, start?, end?, allDay?, colorId?}` | Lock → `get(id)`: 있으면(지운 것이면 `status:'confirmed'`도) `patch(fields)`, 404면 `insert({id, …fields})` | `{ok, version, event}` |
| `remove` | `calendarId, id` | Lock → `remove`, 404·410은 성공 | `{ok, version}` |
| `dropDay` | `calendarId, id, day` | Lock → 여러 날 종일 일정에서 그날을 뗌(앞쪽은 그 일정을 줄이고, 뒤쪽이 남으면 같은 제목·색으로 새 일정 하나) | `{ok, version, events}` |
| `off` | `calendarId, day, id?, newId, offWord, title, colorId` | Lock → 고칠 일정 찾기: ① `id` 일정(있고 지워지지 않음) ② 그날 하루 종일 일정 가운데 제목이 `offWord`이거나 ` {offWord}`로 끝나는 것(만든 차례 첫째) ③ `newId` 일정(지운 것이면 되살림). 찾으면 title이 비면 지우고, 하루짜리면 patch, 여러 날이면 dropDay 뒤 `newId`로 하루 일정. 못 찾으면 title이 있을 때만 `newId`로 insert. `newId` = `sskoff` + 병원 id 32자(빼기 없음) + `YYYYMMDD`(모두 base32hex 글자) — 두 PC가 같은 날을 함께 보내도 하나 | `{ok, version, event|null}` |

- 오류: `token_not_set`(자리 글자 그대로)·`bad_token`·`too_old`(changes만)·`no_service`·`gone`(캘린더 없음·권한 없음·403 writer 아님)·`limit`(구글 rate·quota 오류)·`busy`(Lock 30초)·`bad_request`·`failed`.
- 시험: `google-code/test/fakeCalendar.ts`(메모리 가짜 `Calendar.Events`·`CalendarList`·`LockService`·`ContentService`·`Utilities`) + `calendar.test.ts`.
- `scripts/google-code.mjs`가 `Code.gs`를 읽어 `src/lib/gcal/calendarCode.ts`(`export const CALENDAR_CODE = …; export const CALENDAR_CODE_VERSION = '1'; export function buildCalendarCode(secret: string): string`)를 만든다. `package.json` `"google-code": "node scripts/google-code.mjs"`. 시험은 만든 파일과 `Code.gs`가 같은지 본다.

## 9. 도우미 0.14.0

### 9-1. 옮기는 것 (Core, netstandard2.0, `helper/src/Precheck.Core/Sheet/`)
- 비트시트 `app/src/Core/`(작업 트리 파일): `DayData`·`RowBuilder`·`SheetPayload`·`Catalog`·`HospitalPick`·`Settings`(웹 설정 JSON에서 만듦)·`WebAppClient`의 요청·답 읽기 부분, `app/src/Bit/BitSql`·`BitSource`의 SQL(도우미 `IBitDb`·읽기 전용 연결로). SQL은 SELECT만·READ UNCOMMITTED·늘 되돌림(도우미 규칙 그대로).
- 시험: 비트시트 `app/tests/Tests.cs`·`Fix7Tests.cs`를 `helper/tests/Precheck.Core.Tests/Sheet/`로 옮김(기대값 그대로). 감싸개 `helper/tests/sheet-core.dotnet.test.ts`(FILTER 'Sheet').
- 새로: `SheetSettingsJson`(웹 `GsheetSettings` JSON ↔ `Settings`), `BitSheetImport`(settings.json 판 2 읽기 → 웹 설정 + `IProtector`로 푼 비밀 글자), `SheetCode`(실린 `Code.gs`의 `__TOKEN__` 바꾸기, 한 번만 나오는지 검사), `RowsPrint`(줄 지문 SHA-256 + 줄 수), `SheetReply`(구글 답 → 결과 숫자, 오류 → 번호).

### 9-2. 명령 (`src/lib/bridge/commands.json`, 모두 `patient: false`)

| 명령 | args | 답(숫자·표시만) |
|---|---|---|
| `sheet.status` | {} | `{v:1, secretTag: string|null, bitsheet: boolean, codeVersion:'8', url: string|null, shareWith: string[], verified: boolean}`(주소·메일은 설정 칸 보이기용, 비밀 글자 없음) |
| `sheet.code` | {} | `{v:1, secretTag, codeVersion}` — 클립보드에 코드(주소·메일은 그대로, `verified`는 거짓으로) |
| `sheet.link` | `{url, shareWith: string[] (10개까지)}` — `confirm: true`(표시, 창은 처리기가 띄움 — `bit.register`가 `RegisterFlow`에서 띄우는 것과 같은 꼴) | 확인 창(2절 표 17, 새 약속 `ISheetConfirm` — `Precheck.Core/Sheet/`, 윈도 쪽 `SheetConfirmWindow` 새 파일, 지금 `IConfirmWindow`·`ConfirmWindow.cs`는 그대로) [바꾸기] → 새 주소로 `hello`(HMAC)를 먼저 맞춰 보고, 맞을 때만 `sheet.dat`에 주소·메일을 적고 `verified` 참 → `{v:1, ok:true}`. 맞지 않으면 전 값을 그대로 두고 `E-GSHEET-KEY`(넣기는 전에 쓰던 주소로 계속). [취소]·2분 지남 → `E-GSHEET-DECLINED`. 같은 값이면 창 없이 `{v:1, ok:true, same:true}`. 이 PC에 비밀 글자가 없으면 창 없이 `E-GSHEET-SECRET` |
| `sheet.import` | {} | `{v:1, secretTag, settings: GsheetSettings}`(비트시트 설정에서 주소·메일·비밀 글자를 뺀 것). 주소·메일·비밀 글자는 확인 창 없이 `sheet.dat`로 옮긴다(그 PC 자기 파일이라) |
| `sheet.ping` | `{settings}` | `{v:1, ok, templateTitle?, version?, code?}`(주소는 `sheet.dat` 것) |
| `sheet.catalog` | `{hospital?: string}` | `{v:1, hospitals:[{code,name,recent}], depts:[{code,name,n90,today}], rx:[{code,name,cls,n90}], hospitalName}` |
| `sheet.months` | `{settings, months: ym[] (13개까지)}` | `{v:1, version, months:[{ym, fileId|null, gids}]}` |
| `sheet.fill` | `{day, mode: 'fillEmpty'|'overwrite', auto: boolean, settings}` | `{v:1, unchanged?:true, rows, patients, added, filled, overwritten, skipped, full, cancelCleared, cancelKept, freeFixed, inserted, cleaned, shareFailed, created, ratioFixed, ratioSkipped: string[], ratioSkippedCount, ratioFailed, split, free, paidOnly, notes, notPut:{noName, unlinked, negative, noChart}, fileId, sheetGid, version, oldCode}` |

- `sheet.link`의 `url`은 `https://script.google.com/macros/s/{id}/exec` 또는 회사(Workspace) 계정 꼴 `https://script.google.com/a/macros/{도메인}/s/{id}/exec`(정규식 `^https://script\.google\.com/(a/macros/[A-Za-z0-9.-]{1,253}|macros)/s/[A-Za-z0-9_-]{10,200}/exec$`)만. `shareWith`는 메일 모양 10개까지. `settings`는 `{"type":"json","of":"object"}` 16KB까지(주소·메일 열쇠가 있으면 거절). `day`는 date, `sheet.fill`의 day는 한국 오늘 − 62일 ~ 오늘. `sheet.ping`·`sheet.months`·`sheet.fill`은 늘 `sheet.dat`의 주소·메일만 쓴다(웹이 주는 주소를 받지 않는다).
- 비밀 글자 맞는지 확인(AC-8511.3): `verified`가 거짓이면(주소를 바꿨거나 비밀 글자를 새로 만듦) 먼저 `hello`(nonce 무작위 24바이트)를 보내 `mac`이 `HMAC-SHA256(비밀 글자, nonce)`와 맞을 때만(같은 시간 비교) `verified`를 참으로 한다. 틀림 → `E-GSHEET-KEY`, `hello`를 모름(7판) → `E-GSHEET-OLD`. 확인 전에는 token·환자 줄을 보내지 않는다. HTTP는 `HttpWebRequest`(TLS 1.2, 60초, 넘겨받기는 손으로 따라가 `script.googleusercontent.com`만).
- `sheet.code`: 새 비밀 글자 → `sheet.dat`(주소·메일은 그대로, `verified` 거짓) → 코드 → STA 스레드에서 `Clipboard.SetText`. `sheet.import`: 비트시트 주소·메일·비밀 글자를 `sheet.dat`로, `verified`는 참(7판 코드는 `hello`를 몰라서 — 그 PC 파일이라 믿음).
- 지문: `sheet.dat`에 날짜·지문·줄 수 하나(날이 바뀌면 바꿈). `auto: true`이고 같으면 구글에 보내지 않고 `{unchanged:true, rows}`. 손 넣기·저녁·지난 날은 무시.
- 옛 7판 구글 코드(비트시트에서 가져온 그대로): `write`는 그대로 되고 답에 `oldCode: true`(done-warn의 '옛 판' 글). `months`·`hello`는 모르므로 달 파일은 `write` 답 `fileId`로만 적고(gid 없음 → 틀은 파일 첫 시트로 열림), 확인 창으로 주소를 바꾸면 `hello`를 못 해 `E-GSHEET-OLD`다.
- 시간 제한: 도우미는 한 연결에서 한 번에 한 메시지만 처리한다(`Protocol/MessageLoop.cs`). 그래서 `sheet.fill`은 비트 읽기 20초 + 구글 보내기 45초 안에 끝나고, 넘으면 `E-GSHEET-TIMEOUT`으로 멈춘다(전체 60초를 넘지 않음). 화면의 통로를 빌린 넣기(11절)는 그 화면에 보내는 중인 요청·스트림이 하나도 없을 때만 빌리므로, 청구 입력 스트림과 겹치지 않고 그사이 화면이 새로 부른 명령은 길어야 그 넣기만큼(60초) 기다린다. 뒤에서 따로 붙은 넣기는 자기 도우미 프로세스라 화면에 영향이 없다. `sheet.link` 확인 창이 떠 있는 동안(최대 2분)도 같다 — 그 화면의 다른 비트 명령은 기다리고 저절로 넣기는 통로가 바빠 그 차례를 건너뛴다(`bit.register` 확인 창과 같음).
- `contact.targets` kind `calday`: `CalendarTargets.BackDays` 62 → 400.
- 기록 파일(`DiagnosticLog`): 명령·결과 번호·숫자만.
- `helper/Directory.Build.props` 0.14.0, `versions.ts`: `LATEST_HELPER = '0.14.0'`, 새 `SHEET_HELPER = '0.14.0'`·`CAL_PAST_HELPER = '0.14.0'`·`SHEET_EXTENSION = '0.5.0'`, `MIN_HELPER`·`MIN_EXTENSION` 그대로.
- 크롬 확장 0.5.0: 확장은 `commands.json`을 빌드 때 묶어 넣고(`extension/src/relay.ts`) 목록 밖 명령을 `E-BRIDGE-REJECTED`로 거절한다(`checkRequest`·`background.ts` `fromWeb`). 확장 코드는 고치지 않고 `extension/manifest.json` version만 `0.5.0`으로 올려 새 명령표로 다시 빌드한다(`extension/src/manifest.test.ts` 판 시험). `helper.yml`이 도우미 zip(`precheck-helper-0.14.0.zip`)과 확장 zip(`precheck-extension-0.5.0.zip`)을 함께 만든다. 웹은 hello의 `extensionVersion`이 `SHEET_EXTENSION`보다 낮으면 `sheet.*`를 부르지 않고 `E-GSHEET-EXT` 안내(2절 표 2)를 보인다.
- `Precheck.Core.csproj`에 `<EmbeddedResource Include="../../../google-code/sheet/Code.gs" LogicalName="SheetCode.gs" />`.

### 9-3. 수납 오류 번호 → 까닭 글 (notes-sunap `err-google` 글 그대로)
- 통로는 `lib/errors.ts`에 있는 번호의 오류 답만 받는다(`isErrorCode`). 그래서 아래 번호를 모두 `src/types/errors.ts`·`src/lib/errors.ts`에 둔다(TASK-4): `what` = `구글 시트에 넣지 못했어요`, `fix` = 아래 까닭 글. 띠·알림은 `fix`만 그린다.

| 번호 | 까닭 글 |
|---|---|
| E-GSHEET-NET | 구글 연결 안 됨: 인터넷 연결을 확인해 주세요. |
| E-GSHEET-TIMEOUT | 구글이 제때 답하지 않았어요. 잠시 뒤 다시 해 보세요. |
| E-GSHEET-CUT | 구글과 연결이 중간에 끊겼어요. 잠시 뒤 다시 해 보세요. |
| E-GSHEET-DENIED | 구글 웹 앱에 들어갈 수 없어요. 배포할 때 '액세스 권한: 모든 사용자'로 했는지 확인해 주세요. |
| E-GSHEET-URL | 구글에서 받은 주소가 맞지 않아요. 주소를 다시 붙여 넣어 주세요. |
| E-GSHEET-SERVER | 구글 쪽에서 잠시 문제가 생겼어요. 조금 뒤 다시 해 보세요. |
| E-GSHEET-LOGIN | 구글이 웹 앱 대신 로그인·안내 화면을 보냈어요. 안내문대로 '액세스 권한: 모든 사용자'로 배포하고 권한 허용까지 했는지, 주소가 /exec 로 끝나는지 확인해 주세요. |
| E-GSHEET-NOKEY | 구글 코드에 비밀 글자가 아직 들어가지 않았어요. [구글에 붙일 코드 복사]로 다시 붙이고 새 버전으로 배포해 주세요. |
| E-GSHEET-KEY | 비밀 글자가 맞지 않아요. [구글에 붙일 코드 복사]로 다시 붙이고 새 버전으로 배포해 주세요. |
| E-GSHEET-BUSY | 구글이 다른 넣기를 하는 중이에요. 잠시 뒤 다시 해 보세요. |
| E-GSHEET-TEMPLATE | 원본 시트를 열 수 없어요. 설정의 원본 시트 주소를 확인해 주세요. |
| E-GSHEET-FOLDER | 넣을 폴더를 열 수 없어요. 설정의 폴더 주소를 확인해 주세요. |
| E-GSHEET-DAY | 그날 시트를 찾지 못했어요. 원본에 1~31 시트가 있는지 확인해 주세요. |
| E-GSHEET-LAYOUT | 시트 칸 설정이 맞지 않아요. 설정 › 시트를 확인해 주세요. |
| E-GSHEET-SHAPE | 보낸 내용 모양이 맞지 않아요. 웹앱과 구글 코드가 같은 판인지 확인해 주세요. |
| E-GSHEET-EXT | 이 PC의 크롬 확장이 옛 판이라 넣지 못해요. 비트 PC 연결 화면에서 새 확장을 받아 바꾼 뒤 웹앱을 새로 고쳐 주세요. (웹이 정하는 번호, 도우미는 내지 않음) |
| E-GSHEET-DECLINED | 이 PC의 확인 창에서 주소를 바꾸지 않았어요. 넣기는 전에 쓰던 주소로 해요. |
| E-GSHEET-SECRET | 이 PC에서 비밀 글자를 읽지 못했어요. 설정 › 구글 연결 › [구글에 붙일 코드 복사]로 비밀 글자를 새로 만들어 구글에 다시 붙여 주세요. |
| E-GSHEET-NOURL | 설정 › 구글 연결에서 '구글에서 받은 주소'를 넣어 주세요. |
| E-GSHEET-NOTEMPLATE | 설정 › 시트에서 '원본 시트 주소'를 넣어 주세요. |
| E-GSHEET-OLD | 구글 코드가 옛 판이에요 — [설정] › 구글 연결에서 코드를 새로 붙여 주세요 |
| E-GSHEET-FAILED | 구글 쪽에서 일을 마치지 못했어요. |
| 비트·통로 번호(E-BIT-*·E-BRIDGE-*·E-HELPER-*) | 굵은 글 **비트를 읽지 못했어요** + `비트 도우미 연결을 확인해 주세요.` |
| 그 밖 | 뜻밖의 오류가 났어요({번호}). |

## 10. 웹 모듈과 모양

### 10-1. 타입 (`src/types/calendar.ts` — TASK-3)
```ts
export const CAL_COLORS = ['lavender','sage','grape','flamingo','banana','tangerine','peacock','graphite','blueberry','basil','tomato'] as const // 구글 colorId 1~11 차례
export type CalColor = (typeof CAL_COLORS)[number]
export const CAL_COLOR_ID: Record<CalColor, string> // lavender '1' … tomato '11'
export type KindColor = CalColor | 'default' | null // null = 시행자 색 따름, 'default' = 캘린더 기본 색
export type CalKind = { id: string; name: string; len: number; color: KindColor; words: string[] }
export type GWait = 'new' | 'edit' | 'move' | 'cancel' | 'uncancel' | 'color'
export type GHow = { staff: 'title'|'color'|'picked'|'none'; kind: 'title'|'color'|'setting'|'picked'; memo: boolean; gStart: string; gEnd: string }
// CalAppt: staffId·staffName·staffMark → string | null, 더함: gEventId, gUpdated, gTitle, gColor: CalColor | null, colorFrom: 'app'|'google',
//   gKeepTitle, gMoved, gGone, gWait: GWait | null, gWaitAt, gNote, gFrom: 'import'|'pull'|'web'|null, gHow: GHow | null, createdAt
// CalAllDay: 더함 gEventId?, gUpdated?, gWait?   CalCountRow: gMoved 더함
```
- 색 표(`globals.css :root --cal-<이름>`, 글자색): lavender `#7986CB` 검정 · sage `#33B679` 검정 · grape `#8E24AA` 흰 · flamingo `#E67C73` 검정 · banana `#F6BF26` 검정 · tangerine `#F4511E` 검정 · peacock `#039BE5` 검정 · graphite `#616161` 흰 · blueberry `#3F51B5` 흰 · basil `#0B8043` 흰 · tomato `#D50000` 흰. 캘린더 기본 색은 `--cal-default`(예약 탭 뿌리에 style로 그 병원 `default_hex`, 없으면 `#4285F4`, 글자 검정). 검정 = 지금 토큰 `--ink`, 흰 = `#FFFFFF`(시안 `.ev.dk`와 같음). 색마다 글자색 토큰 `--cal-<이름>-on`을 둔다(TASK-3이 칸을 꽉 채우는 모양으로 바꾸고, 취소·변경·구글 색 차례는 TASK-20).
- 색 이름 글: 라벤더·세이지·포도·플라밍고·바나나·귤·공작·흑연·블루베리·바질·토마토, '캘린더 기본 색', '시행자 색 따름'.
- `lib/calendar/shapes.ts`도 같은 칸을 맞춘다(TASK-3, 같은 TASK라 두 모양이 함께 바뀜). 옛 20색 `--cal-*`·`--cal-*-soft` 토큰은 지운다(칸은 꽉 채움).
- 직원 탭 휴가 칩·근무표 점은 지금 옛 예약 색 토큰을 빌려 쓴다(`staff/labels.ts`·`staff/schedule/WeekTable.tsx`). 그 화면이 바뀌지 않게 TASK-3이 같은 hex의 직원 전용 토큰 `--leave-annual`·`--leave-half`·`--leave-family`·`--leave-sick`·`--leave-maternity`·`--leave-unpaid`(+ 각 `-soft`)·`--staff-dot`을 `:root`에 두고 두 파일이 그것을 쓴다(값은 옛 blue·teal·purple·pink·forest·gray·orange 그대로). 입지 지도 둘레 다른 과 점(`components/location/map/KakaoMap.tsx`, 옛 `cal-lavender`·`cal-purple` 빌림)도 같은 까닭으로 `--map-other`(#A78BFA)·`--map-other-ring`(#7C3AED)으로 옮긴다. `docs/UI_GUIDE.md` '예약 색판' 절의 '빌림 예외' 두 줄은 지우고 '직원·지도 전용 토큰' 줄로 바꾼다(그 줄을 보는 시험 `LocationScreen.test.tsx`·`KakaoMap.test.tsx`도 새 토큰 이름으로).
- 5분 시작: `lib/calendar/rules.ts` `parseStart`는 5분 단위(0~1435)를 받고 그 밖은 'step', 추가·고치기 판 글과 고르기 목록은 2절 표 16. 시행자 없는 예약: `rules.ts` 다음 주 예약 초안·`rebook.ts` 다시 예약 셈은 시행자 null을 `시행자 없음` 한 묶음으로 센다. 모두 TASK-3.
- 시행자가 없는 예약은 `staffId`·`staffName`·`staffMark`가 모두 null이다. 통계·요약·비교에서 시행자별 줄은 이름 `시행자 없음`으로 묶는다.

### 10-2. 구글 연결 타입 (`src/types/gcal.ts`·`src/types/gsheet.ts` — TASK-4)
- 같은 Phase의 TASK-3 `CalColor`를 import하지 않고 `types/gcal.ts`가 11색 이름 `GColor`를 스스로 둔다(아래 `CalColor` 자리는 `GColor`). 둘이 같은지는 TASK-23 시험이 본다.
```ts
export type GcalRules = { pullMin: 1 | 2 | 5; onGoogleDelete: 'cancel' | 'delete'; arrival: 'off' | 'title'; offAllStaff: boolean }
export type GcalLook = { cancel: CalColor; change: CalColor; offWord: string; offColor: CalColor; noKind: string | 'fix';
  staffByColor: boolean; noStaffKinds: string[]; titleLen: boolean; titleMemo: boolean }
export type GcalLink = { scriptUrl: string; secret: string; calendarId: string | null; calendarName: string | null; defaultHex: string;
  linkedOn: string | null; rules: GcalRules; look: GcalLook }
export type GcalView = Omit<GcalLink, 'secret'> & { hasSecret: boolean }
export type GcalState = { pulledUntil: string | null; lastOkAt: string | null; failSince: string | null; failCode: string | null; arrivalUntil: string | null; arrivalDone: boolean }
export type GcalFix = { id: string; gEventId: string; day: string; start: number; len: number; allDay: boolean; gColor: CalColor | null; gTitle: string;
  reason: FixReason; guess: FixGuess; state: 'open' | 'skip'; gUpdated: string }
export type GsheetSettings = { templateUrl: string; namePattern: string; hospitalLabel: string; folderUrl: string; // 코드 주소·함께 쓸 메일은 없다(도우미에만, GsheetPinned)
  firstRow: number; lastRow: number; cols: { key; name; sign; amount; room; first; day90; block; therapy; note: string }; markValue: string;
  signs: { cash; card; recvCash; recvCard; transfer; recvTransfer; free: number }; shiftCols: string; staffCols: string[];
  bitHospital: string; deptRooms: Record<string, number>; deptRoomsHospital: string; firstKinds: string[]; day90Kinds: string[];
  blockCodes: string[]; therapyCodes: string[]; free: 'discount' | 'paid-zero' | 'nhis-zero' | 'own-zero' | 'total-zero' | 'none';
  freeInsurance: number[]; carInsurance: number[]; aidInsurance: number[]; noteCar: boolean; noteAid: boolean;
  autoOn: boolean; everyMin: number; from: string; to: string; eveningOn: boolean; evening: string }
export type GsheetPinned = { url: string | null; shareWith: string[] } // sheet.status 답에서만 온다. 서버·브라우저 저장소에 두지 않는다
export type GsheetMonth = { ym: string; fileId: string; gids: Record<string, number> }
export type GsheetRun = { at: string; day: string; via: 'auto'|'hand'|'evening'|'past'; mode: 'fillEmpty'|'overwrite'; outcome: 'ok'|'warn'|'same'|'fail';
  code: string | null; rows: number; counts: Record<string, number | boolean>; cells: string[] }
```
- 기본값(비트시트 7판): 이름 꼴 `{병원} 일일수납일지 {yyyy}년 {m}월`, 17~302줄, 칸 B·C·D·F·I·J·K·L·M·비고 G, 표시 값 '0', 기호 1·2·3·4·5·(미수 계좌 5)·6, 밀어 내릴 칸 `A:P`, 직원 칸 G·O, 초진 ['1'], 90일 ['3'], 처방 고른 것 없음, FREE 'discount', freeInsurance [31], car [21,22], aid [51,52], 비고 둘 다 켬, 5분 · 08:00~20:00 · 저녁 켬 19:30, 진료실 맞춤 비어 있음.
- 예약 기본값: look `{cancel:'tomato', change:'graphite', offWord:'off', offColor:'grape', noKind:'dosu', staffByColor:true, noStaffKinds:['shock'], titleLen:true, titleMemo:true}`, rules `{pullMin:2, onGoogleDelete:'cancel', arrival:'off', offAllStaff:true}`.

### 10-3. 저장 함수
- `src/lib/storage/calendar.ts`(TASK-3) 더함: 새 칸 읽기·쓰기(`listAppts` 고른 칸에 g 칸), `addAppt`·`updateAppt`가 g 칸을 받음, `listWaitingAppts(client, fromDay)`, `findApptsByEvents(client, ids)`, `applyGoogleAppt(client, id, patch, gUpdated, expectWaitAt)`(`g_updated`가 null이거나 더 이르고 `g_wait_at`이 읽을 때 값 그대로일 때만 고침 — 조건 고치기), `markApptSent(client, id, sent, expectWaitAt)`(`g_wait_at`이 그대로일 때만 `g_wait`를 비움 — 그 사이 다시 고쳤으면 0줄), `insertGoogleAppts(client, rows)`(500줄씩, `on conflict (hospital_id, g_event_id) do nothing`), 종일 줄 g 칸(웹앱이 넣는 메모는 `g_event_id = 'ssk' + 32자`를 넣는 쓰기에 함께), `listWaitingMemos`, `markMemoSent(client, id, expectWaitAt)`. `g_title`에 `privacyProblem` 모양이 남아 있으면 그 칸은 보내지 않는다(null) — 가리기는 부르는 쪽(`lib/gcal`)이 `maskPrivate`로 먼저 한다.
- `src/lib/storage/gcal.ts`(TASK-4): `loadGcalLink`(비밀 글자 포함 — `lib/gcal`만 부름)·`loadGcalView`·`saveGcalConnection({scriptUrl, secret})`·`saveGcalCalendar({calendarId, calendarName, defaultHex})`·`saveGcalLook`·`saveGcalRules`·`setLinkedOn`·`unlinkGcal`, `loadGcalState`·`advancePulled`·`markGcalFail(code)`·`markGcalOk(at)`·`setArrivalProgress`, `listGcalFixes`·`upsertGcalFixes`·`setFixState`·`deleteGcalFix`, `listGcalDeletes`·`dropGcalDelete`, `listOffDays(from,to)`·`listWaitingOffDays`·`saveOffDay`, `loadOffNames`(rpc). 구글에서 온 글(고쳐야 할 것 제목·guess·off 줄 제목)은 `maskPrivate`를 거쳐 보낸다.
- `src/lib/storage/maskPrivate.ts`(TASK-4 — 만드는 곳): `maskPrivate(text) → string` — `lib/worklog/notes`의 `privacyProblem`이 보는 모양(전화·주민번호·메일) 조각마다 `…`로 바꾼다. `lib/storage/gcal`(TASK-4)과 `lib/gcal`(TASK-12, 예약 `g_title`·메모를 적기 전)이 부른다. 같은 Phase의 TASK-3 `storage/calendar`는 부르지 않는다(위처럼 남은 모양이면 보내지 않음).
- `src/lib/storage/gsheet.ts`(TASK-4): `loadGsheetSettings`(없으면 기본값)·`saveGsheetSettings`(`'invalid'`)·`setSecretTag`·`listGsheetMonths`·`upsertGsheetMonths`·`addGsheetRun`·`listGsheetRuns(fromIso)`·`lastGsheetRun`.

### 10-4. 순수 셈
- `src/lib/calendar/`(환자 자료 구역, TASK-7): `gshapes.ts`(입력 모양 — `types/calendar.ts`를 import하지 않음, 색 이름·colorId 표 포함), `gtitle.ts`(`parseGoogleEvent(ev, ctx) → GParsed`, `formatGoogleTitle(appt, look, kinds, staff) → string`), `goff.ts`(`composeOffTitle(names, current, word, people)` — 새로 든 사람 앞에, 남은 사람은 지금 차례, 목록(`people`)에 없는 이름은 지우지 않고 지금 자리에 남김(AC-8522.3), 목록 사람만 더하거나 뺌 / `parseOffTitle(title, word, people)` / `offEventId(hospitalId, day)` = `sskoff` + 32자 + `YYYYMMDD`), `gsync.ts`(`decideEvent(ev, mapped, ctx) → GDecision`, `colorChangeTargets(...)`), `gpaint.ts`(`apptPaint(appt, ctx) → { key: CalColor | 'default'; colorId: string | null; why: 'cancel'|'change'|'google'|'setting' }`, `colorWarnings(...)`, `josa.ts`(`josa(word, '이/가'|'을/를'|'은/는'|'와/과'|'로/으로')` — 2절 표 7 규칙, 까닭·경고·띠 글이 같이 씀), 예약표 부품이 받는 prop 모양 `RowsGoogle = { ctx: PaintCtx; fixes: FixCell[]; waiting: ReadonlySet<string> }` — Phase 3의 TASK-20(받음)과 TASK-21(넘김)이 이 이름 그대로 쓴다).
- `src/lib/gsheet/`(환자 자료 없음, TASK-8): `plan.ts`(`planFills(now, settings, runs) → FillJob[]`), `result.ts`(`resultLines(reply, ctx) → {head, extra, notPut, warn}`), `check.ts`(`checkGsheetSettings(s, pinned: GsheetPinned) → string[]` — 코드 주소·메일 막는 글은 `pinned`(설정 칸 값, `sheet.link` 전에 봄)로, 나머지는 `s`로), `status.ts`(`fillStatus` 듣기·알리기), `shapes.ts`.
- `lib/gsheet/runner.ts`·`reply.ts`(TASK-13·Phase 2): `runFill(deps, job) → FillOutcome` — `deps = { call(cmd, args): Promise<unknown>, store: {addRun, upsertMonths, ...}, now }`. 답은 `reply.ts`가 모양을 검사(숫자·칸 주소만 남김). `types/bridge.ts`를 import하지 않고 자기 모양을 쓴다(같은 Phase의 TASK-10이 고침).

### 10-5. 구글 부르기·맞춤 (`src/lib/gcal/`, TASK-12)
- `client.ts`: `gcalCall(link, action, body)` — 주소 검사(`https://script.google.com/macros/s/{id}/exec` 또는 회사(Workspace) 계정 꼴 `https://script.google.com/a/macros/{도메인}/s/{id}/exec`(정규식 `^https://script\.google\.com/(a/macros/[A-Za-z0-9.-]{1,253}|macros)/s/[A-Za-z0-9_-]{10,200}/exec$`)) → `fetch(url, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify({key, action, ...body}), credentials:'omit', redirect:'follow', signal: 30초})` → `text()`가 `<`로 시작하면 `E-GCAL-LOGIN` → JSON → `version` < '1'이면 `E-GCAL-OLD` → `ok:false`면 번호로. 이 폴더에서 `fetch`는 이 파일 하나만 쓴다(ESLint).
- `pull.ts` `pullOnce(deps)`: 연결·상태 읽기 → `changes(since = pulled_until − 60초 또는 이은 날 0시, from = 이은 날)` 쪽마다 → `decideEvent` → 저장 함수로 적기 → `advancePulled(답 now)` → `markGcalOk`.
- `push.ts`: `pushAppt(deps, appt)`·`pushWaiting(deps)`(예약 `g_wait` → 지움 줄 → off 날 → 메모, `g_wait_at` 차례)·`pushOffDay(deps, day)`.
- `importRead.ts`: `readImport(deps) → ImportPreview`(지난 1년 + 오늘부터 2년, `list` 쪽마다), `applyImport(deps, preview, picks)`.
- `loop.ts`: 받기 간격·1분 다시 보내기·보이게 됨·`navigator.locks.request('ssk-gcal', {ifAvailable:true})`.
- `status.ts`: 띠가 듣는 상태(마지막 맞춤·실패 시작·보낼 것 수·고쳐야 할 것 수).
- `calendarCode.ts`: TASK-11이 만든다(생성 파일, TASK-12는 고치지 않는다).
- 부품 `src/components/gcal/GcalSync.tsx`(아무것도 그리지 않음, TASK-14) · 띠·탭 줄은 `lib/gcal/status.ts`를 바로 듣는다.

## 11. 수납 넣기 흐름
1. 비트 PC 어느 탭이든 `GoogleSheetAuto`가 30초마다 깬다 → 보는 중이면 끝.
2. 통로: `borrowScreenCall()`(같은 쪽 화면이 쥔 통로) 또는 `enterBackground` + `connectScreenBridge`. 못 잡거나 `E-BRIDGE-BUSY` → 다음 차례(기록 안 함).
3. `sheet.status` → `secretTag`가 서버 `secret_tag`와 같을 때만 넣는 PC. 아니면 놓고 쉰다(띠는 `nobit`).
4. `planFills(now, settings, 최근 7일 기록)` → 할 일이 있으면 `navigator.locks.request('ssk-gsheet', {ifAvailable:true})` 안에서 `runFill` → `sheet.fill` → `gsheet_runs` 한 줄(숫자만) → `fillStatus` 알림. 새 달 파일이면 `sheet.months`로 달 목록을 다시 받아 `gsheet_months`에.
5. 하루 한 번(그날 첫 넣기 전) `sheet.months`로 최근 13달 파일 목록을 새로 받는다.
6. 손 넣기([지금 넣기]·[덮어쓰기…])는 같은 `runFill`(via 'hand', 지문 무시).
- 비트 통로 빌리기: `bitLane.ts`에 `lendScreenCall({call, busy}) → 거두기`, `borrowScreenCall()`(빌려준 화면이 없거나 `busy()`가 참이면 null — 화면이 보내는 중인 요청·스트림이 하나라도 있으면 빌리지 않음). `useBridge`가 ready일 때 빌려주고(기다리는 요청 수로 busy) 닫을 때 거둔다. 빌린 통로로는 `sheet.*`만 부른다(스트림은 빌리지 않음). 도우미가 한 메시지씩 처리하므로 그사이 화면 명령은 넣기가 끝날 때까지(길어야 60초, 9-2) 기다린다. `runFill`은 90초가 넘으면 실패로 적는다.

## 12. 예약 맞춤 흐름

### 12-1. 받기 (`decideEvent`)
1. `day < linkedOn` → 아무것도 안 함.
2. 짝(같은 `g_event_id`) 있음:
   - `ev.updated <= mapped.gUpdated` → 건너뜀.
   - 지움(`status = 'cancelled'`) → 규칙 cancel: `status='cancel', gGone=true` / delete: 지우기.
   - 짝에 `g_wait`가 있고 `mapped.gWaitAt > ev.updated` → 웹앱 이김: `g_note`(구글 → 웹앱 덮음), 보내기는 그대로. (`updated_at`이 아니라 `g_wait_at` — 도착·맞춤 표시 적기로는 안 바뀌는 사용자 고친 때, 7-1)
   - 그 밖 구글 이김: 제목이 `g_title`과 같으면 시간·색만, 다르면 다시 알아봄(못 알아보면 칸 그대로 + note). 색: 취소 색 → cancel, 변경 색 → gMoved, 그 밖 → `g_color` 바꿈 + 취소였으면 'auto'·gMoved 풂. 날짜·시작이 바뀌면 고친 뒤 `g_wait='color'`(변경 색). `g_wait`가 있었으면 비우고 note(웹앱 → 구글 덮음).
3. 짝 없음: 하루 종일이면 off 줄·메모(아래), 아니면 알아봄 → 넣기(`g_from='pull'`, `color_from='google'`, `g_keep_title=true`) / 고쳐야 할 것(이미 'skip'이고 제목이 같으면 그대로).
- 종일 메모: 짝(같은 `g_event_id`) 줄이 있으면 **고치기로 적는다**(`memo`·`day`를 바꿈, 지우고 다시 넣지 않음 — 지움 트리거가 구글 remove를 적지 않게). 여러 날 메모는 날마다 한 줄: 구글 날짜 범위가 바뀌면 남는 날은 고치기, 새 날은 넣기, 빠진 날만 지우기(그 지움 줄은 받기가 바로 `dropGcalDelete` — 먼저 보내져도 범위 밖 `dropDay`·없는 일정 `remove`는 성공이라 해가 없다). 구글에서 지운 메모는 받기가 줄을 지우고 그 지움 줄도 바로 지운다.
- 적기는 조건 고치기(`g_updated`·`g_wait_at` 비교)와 유일 제약으로 두 PC가 겹쳐도 같다. `g_wait_at` 조건은 **DB가 준 시각 글자 그대로**(PostgREST 답의 마이크로초까지) 되돌려 보낸다 — JS `Date`로 바꾸면 밀리초로 잘려 같은 값이 다르게 된다. 나중 쪽 견주기(구글 `updated`와)만 시각으로 읽는다.
- 너무 오래됨(`too_old`, 구글 `updatedMin` 410 — PC가 오래 꺼져 있었을 때): 읽는 범위 = [이은 날 0시, 한국 오늘 + 2년 0시)(처음 가져오기 앞쪽과 같은 끝). 그 범위를 `list`(지운 것 빼고)로 처음부터 다 읽어 위 규칙대로 판단하고, 웹앱 줄 가운데 **날짜가 그 범위 안이고 `g_event_id`가 있고 보낼 것이 남지 않은 것(예약 `g_wait` null·메모 `g_wait` 거짓)**만 목록과 견줘, 목록에 없으면 '구글에서 지움'(규칙대로 취소 또는 지움)으로 본다. 보낼 것이 남은 줄(웹앱이 id를 미리 정해 아직 못 보낸 새 예약·메모 포함)과 범위 밖 줄은 건드리지 않는다. 끝나면 `advancePulled(읽기를 시작할 때의 now)`. 오류 띠는 띄우지 않는다. (`syncToken`은 쓰지 않는다.)

### 12-2. 보내기
- 저장: 화면이 `addAppt`·`updateAppt`에 `g_wait`(+ 새 예약은 `g_event_id = 'ssk' + uuid 16진수`, `g_from='web'`)를 함께 보내고, 끝나면 `pushAppt`. 웹앱에서 넣는 종일 메모도 같은 꼴의 id를 넣을 때 정해 `put`(두 PC가 함께 보내도 하나).
- `pushAppt`가 보내는 칸: 제목(`g_keep_title`이면 안 보냄, 칸을 고치면 화면이 `g_keep_title=false`), 설명 = 메모, 시작·끝(한국 시각), colorId = `apptPaint`. 취소·되돌리기는 colorId만. 되돌리기에 `g_gone`이면 `put`이 되살린다.
- 지우기: 트리거가 `gcal_deletes` → `remove`(메모는 같은 일정의 다른 날 줄이 남아 있으면 `dropDay`). 날짜가 이은 날보다 이른 지움 줄은 구글에 보내지 않고 지운다(AC-8526.7).
- off 날: `gcal_off_days.wait` → 그날 'off' 줄(part 없음, `offAllStaff`가 거짓이면 'm-'·예약에 안 보이는 사람 뺌)로 `composeOffTitle`(목록 밖 이름은 남김) → 같으면 wait만 풂, 다르면 `off`(id = 짝 `g_event_id`, `newId` = `offEventId`, `offWord`). 날짜가 이은 날보다 이르면 보내지 않고 `wait`만 푼다(AC-8526.7).
- 실패: `g_wait` 그대로, `markGcalFail(code)`, 띠 `err`, 1분마다 `pushWaiting`.
- 색 바꿈 저장: `colorChangeTargets`가 고른 예약에 `g_wait='color'`.

### 12-3. 처음 가져오기
- 읽기: `list`(오늘 − 1년 0시 ~ 오늘 + 2년) 쪽마다 → `parseGoogleEvent`(지난/앞으로) → 미리 보기(카드·거르기·줄). 이미 짝이 있는 일정은 '알아봄'으로 세되 넣지 않는다.
- 적기: 예약 500줄씩 → 종일 메모 → off 줄(사람마다 'off' 줄 + `gcal_off_days` 짝) → 고쳐야 할 것 → 웹앱에만 있는 오늘 뒤 예약 `g_wait='new'` → `setLinkedOn(오늘)` → `advancePulled(읽은 now)`.

### 12-4. 지난 예약 도착
- 예약 탭이 비트 PC(도우미 `CAL_PAST_HELPER` 이상)에서 열려 있고 이은 병원이면, 60초마다 `arrival_until`(없으면 어제)부터 7일 전까지를 `calday`로 읽어 지금 도착 셈으로 `setApptAuto` → `setArrivalProgress`. 오늘 − 1년에 닿으면 `arrival_done = true` + 알림 한 번.

## 13. 구글 제목 알아보기 규칙 (notes-calendar 기본값 14 + 더한 것)
차례: ① 맨 앞 숫자(10자리까지) = 차트번호(이름과 붙어도) ② 끝 괄호 한 글자 = 시행자 표시(시행자 목록 `mark`) ②-1 **시행자 표시 뒤 글 = 메모** ③ 그 밖 괄호 안 글(닫는 괄호 없어도) = 메모 ④ `숫자+분` 버림 ⑤ 종류 글(종류 `words`, 긴 것부터, '타'는 숫자 바로 뒤만, 괄호 안도 봄) ⑥ 차트번호 뒤 첫 한글 낱말 = 이름(차트번호 없으면 첫 한글 낱말) ⑦ 괄호 밖에 남은 모르는 글 → bad-kind(고르면 그 글은 메모) ⑧ 시행자 글 없음 → `noStaffKinds` 종류면 색으로 짐작 안 함, 아니면 `staffByColor`이고 색이 한 시행자 색이면 그 사람(how 'color'), 아니면 지난 = 없음 / 앞으로 = no-staff 또는 no-staff-color ⑨ 종류 글 없음 → 색이 한 종류 고정 색이면 그 종류(how 'color'), 아니면 `noKind`(how 'setting', 'fix'면 bad-kind) ⑩ 차트번호·시행자·종류가 다 없고 색도 모름 → not-appt ⑪ 취소 색 = cancel, 변경 색 = gMoved(⑧·⑨의 색 짐작 안 함). 모르는 한 글자 표시: 지난 = 없음 + 그 글은 메모 / 앞으로 = bad-mark. 도착 규칙이 'title'이면 맨 앞 '왔음 '·'안 옴 '을 먼저 뗀다. 이름 21자 이상·차트번호 11자리 이상은 not-appt.

알아보기 예(AC-8520.1, 시안 설정: 시행자 (호)정호연 라벤더·(원)박지원 바나나·(현)이수현 플라밍고·(장)원장님 블루베리, 충격파 세이지 고정·`noStaffKinds:['shock']`, noKind 도수):

| 제목 | 색 | 때 | 차트 | 이름 | 종류 | 시행자 | 메모 | 결과 |
|---|---|---|---|---|---|---|---|---|
| `1234 홍길동 도수 30분 (호)` | 없음 | 앞으로 | 1234 | 홍길동 | 도수(제목) | 정호연(제목) | | 알아봄 |
| `5521 최시안 (4000타)` | 세이지 | 앞으로 | 5521 | 최시안 | 충격파(제목) | — | 4000타 | no-staff |
| `5521 최시안 (4000타)` | 세이지 | 지난 | 5521 | 최시안 | 충격파 | 없음 | 4000타 | 알아봄 |
| `6230 정샘플` | 플라밍고 | 앞으로 | 6230 | 정샘플 | 도수(설정) | 이수현(색) | | 알아봄 |
| `8456 윤모의 도수 30분` | 없음 | 앞으로 | 8456 | 윤모의 | 도수 | — | | no-staff-color |
| `7345 한예제(1부위만 해 주세요` | 바나나 | 앞으로 | 7345 | 한예제 | 도수(설정) | 박지원(색) | 1부위만 해 주세요 | 알아봄 |
| `1185 곽모의 체외충격 (현)` | 없음 | 앞으로 | 1185 | 곽모의 | — | 이수현 | | bad-kind('체외충격') |
| `홍길순 도수 30분 (현)` | 없음 | 앞으로 | 없음 | 홍길순 | 도수 | 이수현 | | 알아봄 |
| `6603 권샘플 도수 30분 (호)` | 토마토 | 앞으로 | 6603 | 권샘플 | 도수 | 정호연 | | 알아봄 + 취소 |
| `7781 노예시 자보도수 30분 (원)` | 흑연 | 앞으로 | 7781 | 노예시 | 자보도수 | 박지원 | | 알아봄 + 변경(gMoved) |
| `5521 최시안 충격파 15분 (현) 4000타` | 세이지 | 앞으로 | 5521 | 최시안 | 충격파 | 이수현 | 4000타 | 알아봄(웹앱 꼴 다시 읽기) |
| `4411 서예제 도수 (윤)` | 없음 | 지난 | 4411 | 서예제 | 도수 | 없음 | (윤) | 알아봄 |
| `원장님 회의` | 없음 | 앞으로 | | | | | | not-appt |

고쳐야 할 까닭 글(notes-calendar 그대로, 조사는 받침으로): no-staff `시행자 글이 없어요. {종류}는 그때그때 하는 사람이 달라 색으로는 몰라요` · no-staff-color `시행자 글이 없고, 색도 캘린더 기본 색이에요` · bad-mark `'{표시}'{은/는} 시행자 표시에 없어요` · bad-kind `'{글}'{을/를} 종류로 알아보지 못했어요 (고르면 '{글}'{은/는} 메모로 남아요)` · not-appt `차트번호·시행자·종류 글이 없어 예약 같지 않아요` · too-long `구글 시간이 {HH:mm}–{HH:mm} ({n}시간)이에요. 예약 칸은 4시간까지예요` · off-name `'{이름}'{을/를} 원장님·직원 목록에서 찾지 못했어요`.

## 14. 예약 오류 번호 (`src/lib/errors.ts`, '무엇이 · 어떻게 고치나' — TASK-4가 두고 TASK-12가 쓴다)

| 번호 | 무엇이 | 어떻게 고치나 |
|---|---|---|
| E-GCAL-REACH | 구글 캘린더에 닿지 못했어요. | 인터넷이 되는지 확인해 주세요. 계속되면 설정 › 구글 캘린더에서 [연결 시험]을 눌러 보세요. |
| E-GCAL-KEY | 비밀 글자가 맞지 않아요. | 설정에서 코드를 다시 복사해 붙여 주세요. |
| E-GCAL-GONE | 고른 캘린더를 찾을 수 없거나 고칠 권한이 없어요. | 설정 › 구글 캘린더에서 캘린더를 다시 골라 주세요. |
| E-GCAL-LIMIT | 구글이 오늘 부를 수 있는 횟수를 넘었어요. | 내일 저절로 다시 맞춰요(받아 오는 간격을 5분으로 늘려 주세요). |
| E-GCAL-LOGIN | 구글이 코드 대신 로그인 화면을 보냈어요. | 배포할 때 액세스 권한을 [모든 사용자]로 했는지, 주소가 /exec로 끝나는지 확인해 주세요. |
| E-GCAL-OLD | 구글 코드가 옛 판이에요. | 설정 › 구글 캘린더 › 잇기에서 [구글 코드 복사]로 새로 붙이고 새 버전으로 배포해 주세요. |
| E-GCAL-SERVICE | 구글 코드에서 캘린더 서비스가 켜져 있지 않아요. | 구글 코드 편집기 왼쪽 [서비스] 옆 [+]에서 'Google Calendar API'를 추가하고 새 버전으로 배포해 주세요. |
| E-GCAL-URL | 코드 주소 모양이 맞지 않아요. | 구글이 준 '웹 앱 주소'(https://script.google.com/macros/s/…/exec)를 붙여 넣어 주세요. |
| E-GCAL-NOKEY | 구글 코드에 비밀 글자가 들어가지 않았어요. | [구글 코드 복사]로 다시 복사해 붙여 주세요. |

- 구글 코드 답 → 번호: `token_not_set` → NOKEY, `bad_token` → KEY, `gone` → GONE, `limit` → LIMIT, `no_service` → SERVICE, `busy`·`failed`·네트워크 → REACH, `too_old` → 번호 없음(처음부터 다시 받기, 12-1). 수납 코드도 같은 이름 `token_not_set` → E-GSHEET-NOKEY, `bad_token` → E-GSHEET-KEY.

## 15. 화면 부품 (자리)
- 수납: `src/components/gsheet/view/`(틀·띠·달 고르기·덮어쓰기 창·결과 줄·알림·none·nobit·err-frame, TASK-15), `settings/`(네 칸·고르기 창·가져오기 알림·안내문 `SheetGuide`, TASK-16), `auto/`(`GoogleSheetAuto`, TASK-14), `SunapTab.tsx`(탭 머리·보기 바꾸기, TASK-23). 페이지 `src/app/(app)/sunap/page.tsx`는 `SunapTab`을 그린다.
- 예약 설정: `src/components/gcalSettings/connect/`·`rules/`(TASK-17), `colors/`(TASK-18), `import/`·`import/rows/`(TASK-19), `GcalSettingsScreen.tsx`·페이지 `src/app/(app)/settings/google-calendar/page.tsx`(TASK-23). 설정 안 메뉴는 `SettingsPage.tsx`와 `claim/setup/SetupScreen.tsx`의 안 메뉴 둘 다.
- 예약 탭: `components/calendar/rows/**`(칠하기·종일 칩·고쳐야 함 빗금·주황 시계·5분 자리 + `lib/calendar/layout.ts`, TASK-20), `components/calendar/*`(띠 `GcalBand`·고쳐야 할 판 `FixPanel`·자세히 구역·저장 잇기·톱니·지난 도착, TASK-21 — `rows/` 밖 파일만).
- 직원: `components/staff/leave/**`(TASK-22).

## 16. ADR 글 (TASK-1이 `docs/ADR.md` 끝에 그대로)

### ADR-052: 수납일지 구글 시트 — 도우미가 비트 수납 줄을 그 병원 구글 시트로 바로 보낸다 (환자 개인정보 예외 · ADR-016·020을 넓힘)
**맥락**: 2026-11-26 사용자: 비트시트(따로 된 윈도 프로그램)가 하던 비트 → 구글 '일일 수납일지' 채우기를 웹앱 수납일지 탭으로 옮긴다. 이름·차트번호·기호·금액·진료실·초진 표시가 그 병원 구글 계정 시트로 간다(사용자 "구글서버는 괜찮아"). 비트시트는 쓰지 않는다.
**결정** (`specs/google-link`):
- 보내는 것은 비트 PC 청구 도우미(0.14.0)다. 비트를 읽기만 해 줄을 만들고 그 병원 수납 구글 코드로 HTTPS를 보낸다. 브라우저·Worker·서버에는 환자 줄이 오지 않고 숫자(넣은 줄 수·결과)만 온다. 명령은 모두 `patient: false`
- 도우미가 바깥에 붙는 곳은 `script.google.com`(+ 넘겨받는 `script.googleusercontent.com`) 하나다. 수납 구글 코드 주소와 '함께 쓸 직원 메일'은 그 PC 도우미에만(DPAPI `sheet.dat`) 두고 서버에 두지 않는다. 처음 넣거나 바꿀 때는 그 비트 PC 화면에 도우미가 확인 창을 띄워 사람이 [바꾸기]를 눌러야 된다(웹앱·서버를 손에 넣어도 원격으로 받는 곳을 못 바꿈). 바꾼 주소는 `hello`로 그 코드가 비밀 글자를 아는지 본 뒤에만 비밀 글자·환자 줄을 보낸다. 원본·폴더는 구글 코드가 그 계정 소유일 때만 쓴다
- 비밀 글자는 그 PC 도우미만 안다(DPAPI `sheet.dat`). 서버에는 SHA-256 앞 16자(넣는 PC 표시)만. 코드 복사는 도우미가 윈도 클립보드에
- 서버에 두는 것: 설정(원본·폴더·칸·진료실 맞춤·처방 코드·시간 — 코드 주소·함께 쓸 메일은 빼고)·달 파일 id와 시트 gid·넣은 기록(시각·숫자·오류 번호·비율 식 칸 주소). 이름·차트번호·금액은 없다
- 시트는 `/sunap` 틀로만 띄운다(CSP `frame-src https://docs.google.com`, ADR-054)
**이유**: 환자 줄이 웹앱 브라우저·서버를 지나지 않아 ADR-004·020을 그대로 지키고, 비트시트 규칙·구글 코드를 그대로 쓴다
**대안**: (1) Worker가 줄을 만들어 브라우저가 구글로 — 환자 줄이 네트워크 코드를 지난다. (2) 서버 경로가 대신 — 서버에 환자 줄. (3) 비트시트 그대로 — 사용자가 웹앱 하나를 원함
**트레이드오프**: 의원 밖(그 병원 구글)에 수납 줄이 남는다(구글 계정 보안에 달림). 웹앱이 열려 있을 때만 넣는다. 주소·메일을 바꿀 때는 넣는 PC 앞에 사람이 있어야 한다. 확인 창에서 사람이 남의 주소를 보고도 [바꾸기]를 누르면 막지 못한다. 도우미가 처음으로 바깥에 붙는다(윈도 프록시·방화벽에 막힐 수 있음). 확장은 명령표를 묶어 넣으므로 확장 0.5.0도 함께 설치해야 한다

### ADR-053: 예약 탭 ↔ 병원 구글 캘린더 양쪽 맞춤 (ADR-030 '구글 캘린더 대신'을 '구글 캘린더와 함께'로 넓힘)
**맥락**: 2026-11-26 사용자: 의원은 아직 구글 캘린더만 쓴다. 웹앱 예약 탭을 병원 구글 캘린더 하나('2026 양지바른정형외과')와 양쪽으로 잇고, 지난 1년 + 앞으로를 처음에 가져온다(11-17 '잇지 않음'을 바꿈). 환자 이름·차트번호는 그대로 구글 제목에 간다
**결정**:
- 예약 줄(이름·차트번호·종류·시행자 표시·길이·메모)을 고른 캘린더 하나와 브라우저(`lib/gcal`)가 예약 구글 코드로 맞춘다. 새 서버 경로 없음. 받기도 로그인한 사용자 권한으로 Supabase에 쓴다(RLS 그대로)
- 겹침 막기: (병원, 일정 id) 유일 제약, `g_updated`·`g_wait_at` 조건 고치기, 웹앱이 만든 일정·종일 메모 id는 웹앱이 정함(`ssk` + 32자), off 줄 id는 병원·날짜로 정함(`sskoff` + 병원 32자 + 날짜), `pulled_until`은 앞으로만. '나중 고친 쪽'은 DB가 사용자 고침 때만 적는 `g_wait_at`으로 견준다
- 1년 지우기(`calendar_appts_prune`)로 지워진 지난 줄은 구글 일정을 지우지 않는다(지움 트리거가 1년 지난 날은 적지 않고, 보내기는 이은 날 전 줄을 버림)
- 비밀 글자는 서버 `gcal_links.secret`(그 병원 원장·데스크만 읽음, 원장만 씀, 보는 관리자 못 읽음, 화면에 다시 안 그림)
- 서버에 더 두는 것: 일정 id·구글 제목(개인정보 모양 조각은 …)·색·맞춤 표시·고쳐야 할 것·지울 것·off 날. 지난 1년 구글 예약도 `calendar_appts`에(1년 지우기 그대로)
- 도착(비트 PC가 정한 값)은 구글에 보내지 않는다(맞춤 방법에서 제목 앞에 붙이기를 고를 때만)
- 직원 탭 휴가 → 그날 하루 종일 off 줄에 이름(반차 안 넣음). 예약 시행자가 아닌 직원도('m-' 휴무 줄)
**이유**: 구글을 쓰는 직원·폰과 웹앱이 같은 예약을 보아야 한다(사용자)
**대안**: (1) 한 번만 옮기고 끊기 — 의원이 아직 구글을 씀. (2) 서버가 2분마다 끌어오기 — 서버 경로·서버에 비밀 글자 쓰는 코드. (3) 구글 알림(push) — 받을 서버 주소가 필요
**트레이드오프**: 구글 계정이 털리면 1년 예약이 보인다. 웹앱 계정이 털리면 비밀 글자로 그 구글 계정 캘린더를 읽을 수 있다. 웹앱이 열린 PC가 없으면 맞추지 않는다(다음에 열 때 한꺼번에). 2분 받기로 구글 코드 부르기가 는다(PC 넷 × 10시간 ≈ 하루 1,200번)

### ADR-054: 구글 코드 두 벌 · 비밀 글자 자리 · 캘린더 고급 서비스 · CSP
**결정**:
- 저장소 `google-code/sheet/Code.gs`(비트시트 7판 → 8판: hello·months·소유 확인·sheetGid)와 `google-code/calendar/Code.gs`(1판). Node 가짜 구글(vm)로 vitest 시험
- 두 벌인 까닭: 비밀 글자를 쥔 곳이 다르다(수납 = 넣는 PC 도우미만, 예약 = 서버 → 모든 PC). 수납 코드는 도우미에 실리고(EmbeddedResource), 예약 코드는 웹에 실린다(`npm run google-code`가 만드는 `src/lib/gcal/calendarCode.ts`)
- 예약 코드는 캘린더 고급 서비스(Calendar API v3)를 쓴다: 바뀐 것만·지운 것까지 받기(updatedMin·showDeleted), 일정 id 정해 만들기, 지운 일정 되살리기. 붙이는 사람이 편집기 [서비스 +]를 한 번 더 누른다
- CSP: 모든 앱 경로 `connect-src`에 `https://script.google.com`·`https://script.googleusercontent.com`, `/sunap`만 `frame-src https://docs.google.com`. 와일드카드 없음
**대안**: 한 벌 — 한쪽 화면에서 복사할 때 다른 쪽 비밀 글자를 알아야 함. CalendarApp만 — 2분마다 1년 치를 다 읽고 일정이 둘 생길 수 있음
**트레이드오프**: 병원마다 두 번 붙인다(각 20분쯤, 원격으로 같이 할 수 있음). 구글이 웹 앱 넘김 주소를 바꾸면 CSP를 고쳐야 한다. 구글 시트가 틀 안에서 안 열리는 브라우저(구글 로그인 안 됨·바깥 쿠키 막음)는 [새 창으로 열기]

### ADR-055: 예약 색 = 구글 일정 11색 + 캘린더 기본 색 · 칸 꽉 채움 · 시작 5분 · 시행자 없는 지난 예약 (calendar-colors 20색을 대체)
**결정**: 색판은 구글 일정 색 11가지(colorId 1~11)와 그 캘린더 기본 색뿐이다. 저장된 20색은 한 번 옮긴다(`specs/google-link/design.md` 7-4). 예약 칸은 색으로 꽉 채우고 글자는 밝기에 따라 검정/흰색. 칠하기 차례: 취소 색 → 변경 색 → 구글에서 온 일정 색 → 종류 고정 색/시행자 색. 지운 시행자·종류는 캘린더 기본 색. 시작은 5분 단위(칸 그리기는 10분), 가져온 지난 예약은 시행자 없이도 된다(세 칸 함께 비움)
**이유**: 구글과 웹앱이 같은 색으로 서로 알아본다(사용자 2026-11-26). 구글은 15분 단위 예약이 많다
**트레이드오프**: 색 수가 20 → 11로 준다. 다른 병원의 옛 색은 가까운 색으로 바뀐다. 시행자 없는 예약은 통계 시행자별 숫자에 '시행자 없음'으로 든다

## 17. CLAUDE.md 두 줄 (TASK-1, 아키텍처 규칙 '예외 (ADR-046·047)' 줄 다음)
- 예외 (ADR-052): 수납일지 구글 시트(`specs/google-link`)만 — 비트 PC 청구 도우미가 비트를 읽어 그 병원 구글 계정 '일일 수납일지' 구글 코드로 이름·차트번호·기호·금액을 바로 보낸다(`script.google.com`만). 그 구글 코드 주소·함께 쓸 직원 메일·비밀 글자는 그 PC 도우미에만(DPAPI) 두고, 주소·메일은 그 PC에 뜬 도우미 확인 창에서 사람이 [바꾸기]를 눌러야 바뀐다. 브라우저·Worker·서버에는 숫자(넣은 줄 수·기록)만 온다. 시트는 `/sunap` 틀로만 띄운다(`frame-src https://docs.google.com`)
- 예외 (ADR-053): 예약 구글 캘린더(`specs/google-link`)만 — 예약 줄(이름·차트번호·종류·시행자·메모)을 그 병원 구글 계정의 고른 캘린더 하나와 브라우저가 구글 코드로 양쪽 맞춘다(`lib/gcal/client.ts`만 `fetch`, connect-src `script.google.com`·`script.googleusercontent.com`). 지난 1년 구글 예약을 `calendar_appts`로 가져온다(1년 지우기 그대로). 비밀 글자는 `gcal_links`(그 병원 원장·데스크만 읽음). 도착은 구글에 보내지 않는다

## 18. 문서 줄 (TASK-1)
- `plan.md` §4 '서버로 가는 것' 다음 줄: `- 병원 구글 계정으로 가는 것(ADR-052·053, specs/google-link): 수납일지 시트(도우미가 이름·차트번호·기호·금액을 바로 넣음, 서버에는 숫자·설정만) · 예약 캘린더(예약 줄 이름·차트번호·종류·시행자·메모, 브라우저가 맞춤, 비밀 글자는 gcal_links)`
- `plan.md` §5 DB 표에 한 줄: `| gcal_links · gcal_state · gcal_fixes · gcal_deletes · gcal_off_days · gsheet_settings · gsheet_months · gsheet_runs | 구글 캘린더·시트 잇기(ADR-052~054) |`
- `docs/ARCHITECTURE.md`: 폴더 `google-code/`(구글 코드 두 벌·시험)·`src/lib/gcal`(예약 맞춤, fetch는 client.ts만)·`src/lib/gsheet`(수납 넣기 계획·돌리기, 환자 자료 없음), 흐름 두 줄(1절 그림의 두 줄), DB 표 줄(위와 같음)

## 19. 결정과 트레이드오프 (요약)
- 새 서버 코드 없음 → 맞춤은 웹앱이 열려 있을 때만. 받기 2분·보내기 바로·실패 1분.
- 판단은 순수 셈(시험 쉬움), 적기는 조건 고치기·유일 제약(DB가 겹침을 막음).
- 수납은 비트시트 코드·시험을 그대로 옮겨 규칙을 새로 짜지 않는다.
- 구글 제목 원문은 서버에 두지만 개인정보 모양 조각은 `…`.

## 20. 위험 / 확인할 것
- 구글 시트가 틀 안에서 열리는지(구글 로그인·바깥 쿠키). 안 되면 [새 창으로 열기]로 쓴다 → AC-8542.1에서 사용자와 함께 본다.
- 구글 색 한국어 이름(플라밍고 ↔ 홍학 등)과 지금 구글에서 토마토를 다른 뜻으로 쓰는지 → AC-8542.2(쓰면 처음 잇는 날 ② 화면에서 취소 색을 바꾼다).
- 의원 PC 프록시·방화벽이 도우미의 `script.google.com` 연결을 막을 수 있다 → 의원 PC에서 [연결 시험].
- 구글 웹 앱 하루 한도: 예약 받기(PC 넷 2분) + 수납 5분은 소비자 계정 한도 안으로 본다. `E-GCAL-LIMIT`가 보이면 간격을 5분으로.
- 수납 코드 주소·함께 쓸 메일은 넣는 PC 앞 사람이 확인 창에서 바꾼다 — 원격으로는 못 바꾸지만, 사람이 남의 주소를 보고도 [바꾸기]를 누르면 막지 못한다(창 글에 '병원 구글 계정에서 받은 주소가 맞으면').
- 확장이 연결을 하나만 받아 다른 탭이 통로를 쥐면 그 차례 넣기를 건너뛴다(다음 차례에 함).
- 의원 PC 확장이 0.4.x면 수납 넣기가 안 된다(`E-GSHEET-EXT` 안내) → 도우미 0.14.0과 확장 0.5.0을 한 묶음으로 설치(AC-8542.3).
- 빌린 통로로 넣는 동안(길어야 60초) 그 화면의 새 비트 명령이 기다린다(9-2) — 보내는 중인 요청이 있으면 빌리지 않아 청구 입력과는 겹치지 않는다.
- 그날 구글 off 일정이 둘 이상이면(사람이 구글에서 만듦) 첫째만 짝으로 고치고 나머지는 그대로 둔다(그 일정의 이름은 웹앱 휴무에 더해 읽지만 웹앱이 고치지 않음).

## 21. 2차 고침 (2026-11-26 저녁 — REQ-8543~8552, tasks.md Phase 5·6)

> 운영(f3c61781) 뒤 사용자가 써 보고 정한 것(`~/.claude/state/handoff/glink-round2.md` 결정 1~7) + 결정 8(휴무 줄 색) + 승인 시안 2차(notes-calendar '2차 고침' 칸, 2차-1~10, '확인할 것' 3, 사용자 "고치고 만들어"). **DB는 표·칸·정책 그대로**(새 migration은 휴무 줄 색 고치기 정의자 함수 하나 — 21-5). 화면 글은 notes '화면 글 › 2차 고침' 그대로. 예는 모두 지어낸 것(환자 이름·차트번호를 옮기지 않음).
> 쉬운 말: **종류 낱말** = 종류 이름에서 길이·시행자 표시·숫자를 뗀 낱말(`도수 30분(호)` → `도수`). **다시 알아보기** = 이미 웹앱에 들어온 구글 예약의 저장된 구글 제목을 지금 설정으로 한 번 더 읽어 종류·시행자를 맞추는 것(구글은 부르지 않음).

### 21-1. 종류 고르기 (REQ-8543, `lib/calendar/gtitle.ts` readTitle·parseTimed — TASK-25)
- **종류 낱말 늘리기**: 종류마다 알아볼 글(`words`)·이름 각각에 더해 그 **바탕 낱말**(그 글에서 `\d+\s*[분타천]?`·`\([^\s()]\)`·빈칸을 모두 뺀 것, 두 글자 이상일 때만)을 낱말로 둔다. `도수 30분(호)` → `도수`, `체외충격파 2000` → `체외충격파`. 지금 기본 종류는 바탕 낱말 = 이름이라 낱말이 늘지 않는다(기본 종류 결과 그대로 — AC-8543.2).
- ⑤ 찾기는 지금처럼 긴 낱말부터(한 글자 낱말은 숫자 바로 뒤만, 괄호 밖 먼저). 처음 맞은 **그 낱말 글**을 가진 종류가 모두 **후보**다. 후보가 하나면 그 종류(지금과 같음).
- 후보가 여럿이면:
  - ⓪ 제목(① 차트번호를 뗀 원문, 빈칸을 모두 뺌)에 후보 이름(빈칸을 모두 뺌)이 그대로 있으면 그 종류(여럿이면 긴 이름, 같으면 차례가 앞). 웹앱이 2차 꼴로 적은 제목(`도수 30분 (원)`)과 2차 전 꼴(`도수 30분(호) 30분 (원)`)이 제 종류로 돌아오게 한다.
  - 아니면 **점수** = 후보 이름에 맞는 것의 수(0~3): ㉠ 표시 — ② 제목 표시, 없으면 색 짐작 표시(⑪ `canGuess`이고 `look.staffByColor`이고 일정 색을 쓰는 시행자가 꼭 한 명일 때 그 사람 표시. 점수에만 쓰고 시행자 정하기는 ⑧ 그대로)가 이름에 `({표시})`로 있음 ㉡ 길이 — 제목의 첫 `{N}분`(④가 버리기 전 원문에서), 없으면 구글 일정 길이(`eventTimes().len`)가 이름에 `(?<!\d){N}\s*분`으로 있음 ㉢ 타수 — 아래 타수가 이름에 `(?<!\d){S}(?!\d)`로 있음. 가장 높은 것, 같으면 종류 차례가 앞인 것.
- **타수 S**(① 차트번호를 뗀 원문에서 한 번, 이 차례로 처음 맞는 것): `(?<!\d)(\d+)타` → 그 수 · `(?<!\d)(\d+)천(?![\p{L}\p{N}])` → 수×1000(`3천5백`·`3천원`은 아님) · 맨 숫자 `(?<![\p{L}\p{N}])(\d+)(?![\p{L}\p{N}])`는 **충격파 종류**(이름이나 알아볼 글에 '충격파', 또는 알아볼 글에 '타'가 든 종류)의 이름에 든 수와 같을 때만.
- ⑤-1 종류 낱말이 없고 S가 있으면 후보 = 충격파 종류(점수 셈 같음, 출처 `title`) — ⑦ 남은 글 판단보다 먼저. 충격파 종류가 없으면 ⑨ 그대로.
- **메모**: S로 읽은 글 조각(괄호 안·밖·표시 뒤 어디든)은 메모에서 `{S}타`로 바꾸고, 고른 종류 이름에 S가 있으면 메모에서 뺀다(조각 안 다른 글은 그대로). 기본 종류 `(3천` → 메모 `3000타`(시안 r04), '이 병원 꼴' `(3천` → 메모 없음.
- **③ 바뀜**: 괄호 안이 아는 시행자 표시 한 글자뿐이면(② 끝 표시 앞의 `(호)`) 메모로 두지 않는다.
- 종류 목록·알아볼 글 저장 값은 바꾸지 않는다. 순수 함수 그대로.
- 시험 차림 '이 병원 꼴'(requirements 2차 머리): `look` = 지금 시험 LOOK에서 `noKind: 'fix'`·`noStaffKinds: []`·`staffByColor: true`·취소 토마토·변경 흑연·`offColor` 포도·`titleLen`·`titleMemo` 참.

### 21-2. 다시 알아보기 셈·저장 (REQ-8544, 새 `lib/gcal/reread.ts` · `lib/storage/calendar.ts` · `lib/gcal/deps.ts` — TASK-26)
```ts
// lib/gcal/reread.ts
export type RereadPatch = Partial<Pick<CalAppt, 'kindId' | 'kindName' | 'staffId' | 'staffName' | 'staffMark' | 'gHow'>>
export type RereadExpect = { gTitle: string; gUpdated: string | null }
export type RereadWrite = { id: string; expect: RereadExpect; patch: RereadPatch; kindChanged: boolean }
export type RereadPlan = { read: number; unread: number; writes: RereadWrite[] }
export function planReread(rows: readonly CalAppt[], ctx: ParseCtx): RereadPlan
export type RereadResult =
  | { ok: true; read: number; kindChanged: number; changed: number; unread: number; missed: number }
  | { ok: false; why: 'not-linked' | 'failed' }
export function runReread(deps: { store: Pick<GcalStore, 'loadLink' | 'loadParts' | 'listAppts' | 'rereadAppt'>; now: () => Date }): Promise<RereadResult>
```
- **대상**: `gFrom`이 `'import'`·`'pull'`, `gEventId`·`gTitle` 있음, `gKeepTitle` 참, `gWait` null. 웹앱에서 고친 예약은 `gKeepTitle`이 거짓이라 빠진다([고치기] 포함).
- **다시 만든 일정**: `{ id: gEventId, status: 'confirmed', summary: gTitle, description: '', allDay: false, start: localStamp(day, start), end: localStamp(day, start + len), colorId: gColor ? G_COLOR_ID[gColor] : null, updated: gUpdated ?? '', recurring: false }` → `parseGoogleEvent(ev, ctx)`. ctx는 받기와 같다(`loadParts()`의 staff·kinds·people, `link.look`, `link.rules.arrival`, `link.linkedOn`). 저장된 `gColor`가 취소·변경 색이면 ⑪대로 색 짐작을 하지 않는다.
- **결과 읽기**: `appt` → 그 종류·시행자·출처, `fix` → `guess`의 종류(`kindId`가 있을 때)·시행자(`staffId`가 있을 때), 그 밖(종일 꼴·예약 같지 않음) → 종류 없음.
- **종류**: `gHow?.kind !== 'picked'`인데 새 종류가 없으면 그 줄은 unread — 종류·시행자 모두 쓰지 않는다(시행자 포함 전 값 그대로). `picked`가 아니고 새 종류가 지금 `kindId`와 다르면 `kindId`·`kindName`(+ `gHow`가 있으면 `kind` = 새 출처).
- **시행자**: unread가 아닌 줄에서만 — `gHow?.staff !== 'picked'`이고 새 시행자(출처 `title`·`color`)가 있고 지금 `staffId`와 다르면 세 칸(+ `gHow.staff`). 비우지 않는다.
- `gHow`가 null인 줄은 `gHow`를 새로 만들지 않는다. 메모·날·시각·구글 칸은 쓰지 않는다(사용자 결정 '종류·시행자').
- **runReread**: `loadLink()`가 없거나 `linkedOn`이 없으면 not-linked. 오늘 = `todayInKorea(now())`, `listAppts(yearsAhead(오늘, -1), yearsAhead(오늘, 3))`(받기 끝과 같음) → `planReread` → 쓰기는 10줄씩 동시에 `rereadAppt` — 참이면 changed(+ kindChanged), 거짓·던짐이면 missed. 읽기 셋 가운데 하나라도 던지면 `{ ok: false, why: 'failed' }`. 구글(`call`)은 부르지 않는다.
- **`rereadAppt(client, id, patch, expect): Promise<boolean>`**(`lib/storage/calendar.ts`): 열쇠는 위 여섯만(다른 열쇠·빈 patch → failed, 보내지 않음), 칸 검사는 지금 `updateAppt` 몸 만들기와 같은 검사(종류·시행자 글 길이·`cleanHow`). `update(body).eq('id', id).is('g_wait', null).eq('g_title', expect.gTitle)` + (`expect.gUpdated === null` ? `.is('g_updated', null)` : `.eq('g_updated', expect.gUpdated)`) + `.select('id')` → 1줄이면 참, 0줄이면 거짓. `g_updated`는 읽은 DB 글자 그대로 견준다(JS `Date`를 거치지 않음 — AC-8502.11과 같은 까닭). `g_wait`를 쓰지 않으니 트리거가 `g_wait_at`을 적지 않고, 날·시작을 안 고치니 `orig_*`도 그대로. 원장·데스크 고치기 권한 안(지금 RLS, DB 그대로).
- **`GcalStore`에 둘 더함**: `rereadAppt(id, patch, expect): Promise<boolean>`, `setOffColor(color: GColor): Promise<boolean>`(21-5). `makeGcalDeps`는 저장 함수(`rereadAppt`·`setGcalOffColor`)로, `createMemoryStore`는 메모리 줄로(`rereadAppt`는 `g_wait`·`g_title`·`g_updated`가 다르면 거짓 — 같은 조건 흉내, `setOffColor`는 메모리 연결의 `look.offColor`만 바꿔 뒤의 `loadLink`가 새 색을 줌).
- 시험은 TASK-25와 따로 돈다: 기본 종류로 '저장된 종류 도수 + 구글 제목 `9567 장연습 자보 30분 (원)`' → 자보도수처럼 지금 알아보기로도 결과가 정해지는 꼴만 쓴다.
- 고쳐야 할 것 줄(`gcal_fixes`)은 다시 알아보지 않는다 — 판을 열 때마다 `fixParsed`가 지금 설정으로 다시 읽는다(지금 그대로).

### 21-3. 이은 병원 '변경' = `g_moved` (REQ-8545 — TASK-27)
- `lib/calendar/gpaint.ts` apptPaint ②: `appt.gMoved`만 본다(`origDay`·`origStart`는 보지 않음). apptPaint는 이은 병원만 쓴다(잇지 않은 병원은 `apptColor` 그대로).
- `lib/calendar/gsync.ts` decideMapped: 취소가 아니면 `gMoved = isChange || (movedTime && !backToOrig)`(backToOrig = 받은 날·시작이 그 줄 `origDay`·`origStart`와 같음). `gWait 'color'` 조건은 지금 그대로(`movedTime && !isCancel && !isChange`) — 되돌림이면 push가 원래 색으로 칠한다.
- `components/calendar/useCalendarData.ts` googlePatch: link가 있고 patch가 날·시작을 옮기면 모든 갈래(구글 짝 있음 · 이은 날 뒤 새 짝 · 이은 날 앞이나 짝 없음 → 지금 `{}`인 곳)에 `gMoved = !(새 날 === before.origDay && 새 시작 === before.origStart)`. `GoogleWrite`에 `'gMoved'`.
- 화면: `rows/parts.tsx` `isMoved(appt, linked) = linked ? appt.gMoved : appt.origDay !== null`, `linkedApptLabel`의 변경 글은 `gMoved`일 때만(원래 자리가 있으면 ` · 변경 (원래 …)`, 없으면 ` · 변경`). `DetailPanel` — google이 있으면 '변경' 줄은 `gMoved`일 때만(원래 자리가 있으면 `원래 …`), 없으면 지금 그대로. `gcal/GcalBand` 못 보낸 줄의 '원래 … · 구글에서 {변경 색} 색으로'는 `gMoved`이고 `origStart`가 있을 때만. `lib/calendar/counts.ts` `monthCells(…, linked = false)`·`rateSummary(rows, linked = false)` — linked면 `gMoved === true`만 변경. `MonthGrid`·`SummaryLine`에 `linked?: boolean`, `CalendarScreen`이 `linked={g !== null}`. `gcalSettings/colors/StaffKinds.tsx` 미리 보기의 변경 예는 `gMoved: change`.
- 바뀌지 않는 것: 통계 탭(`CalendarSection`·`calendarCounts`)·월간 보고·의원 비교(`rateSummary(rows)` 기본값), 잇지 않은 병원, DB.
- 시험 차림만 고칠 곳(이은 병원 '변경' 예에 `gMoved: true` 더함): `rows/TimeGrid.test.tsx`의 이은 시험이 쓰는 옮긴 예약, `DetailPanel.test.tsx` 이은 변경 예, `gcal/GcalBand.test.tsx` 못 보낸 옮김 예, `gpaint.test.ts` 변경 예, `lib/gcal/push.test.ts` 옮김 보내기 예(변경 색 `'8'` 기대 그대로). 기대가 바뀌는 곳: `useCalendarData.test.ts` 옮김 기대에 `gMoved: true`, `gsync.test.ts` 구글 시각 옮김 기대에 `gMoved: true`. 고친 줄마다 `google-link AC-8545.x` 주석.

### 21-4. 수납 달 목록 (REQ-8546, `lib/gsheet/runner.ts` — TASK-28)
- 모듈 값은 지금처럼 `monthsDay`(그날 잠금) 하나. 달 목록 답에 이번 달 `today.slice(0, 7)`의 파일 id가 있을 때만 적는다. `E-GSHEET-OLD`(옛 코드)·읽지 못한 답(null)·다른 오류는 아무것도 적지 않는다 → 넣기 전마다 다시 묻는다(옛 코드는 묻자마자 `E-GSHEET-OLD`라 오래 걸리지 않음).
- `afterFill`은 지금 그대로: 옛 코드 답(`oldCode` 참)은 파일 id만 적고, `reply.created`면 `monthsDay = null` 뒤 다시 묻는다. 넣기 답이 '바뀐 것 없음'이어도 따로 하는 일 없음(다음 넣기 때 다시 묻는다). `resetRunner()`가 `monthsDay`를 비운다(지금 그대로).
- 지금 '새 달 파일' 시험은 차림만 고친다: 새 달 파일을 만든 뒤 받는 두 번째 달 목록 답에 그 달을 넣는다(파일을 만들었으니 실제로 있음). 지금 옛 코드 시험(AC-8513.5 '그날은 다시 묻지 않고')은 기대만 '두 번째 넣기 전에도 묻는다'로 바꾼다(2차 결정이 1차 기대를 바꿈).

### 21-5. 휴무 줄 색 따라가기 (REQ-8547, `lib/gcal/pull.ts`·`importRead.ts`·`deps.ts` · `lib/storage/gcal.ts` · 새 migration — TASK-26)
- 받기는 원장 PC·데스크 PC 어디서나 돈다. 데스크는 `gcal_links`를 고칠 권한이 없어(원장만 쓰기, 7-5) `saveGcalLook`으로는 못 맞춘다 → 좁은 DB 함수 하나로 `offColor`만 바꾼다.
- **새 migration `supabase/migrations/20261127000000_google_link_offcolor.sql`**(앞 migration 파일은 고치지 않음, `20261126000000_google_link.sql`과 같은 머리 주석 꼴 — 무엇·실행·먼저·두 번·관문·명세 번호, LF, 두 번 붙여 넣어도 그대로):
```sql
create or replace function public.gcal_set_off_color(p_color text) returns boolean
  language plpgsql security definer set search_path = ''
as $$
begin
  if public.admin_view_hospital_id() is not null then return false; end if; -- 관리자 '다른 의원 보기' 중이면 아무것도 안 함
  if p_color is null or p_color not in ('lavender', 'sage', 'grape', 'flamingo', 'banana', 'tangerine', 'peacock', 'graphite', 'blueberry', 'basil', 'tomato') then
    raise exception 'gcal_set_off_color: 구글 11색이 아님' using errcode = '22023';
  end if;
  update public.gcal_links
     set look = jsonb_set(look, '{offColor}', to_jsonb(p_color))
   where hospital_id = public.my_clinic_hospital_id() and jsonb_typeof(look) = 'object';
  return found;
end $$;
revoke all on function public.gcal_set_off_color(text) from public, anon, authenticated;
grant execute on function public.gcal_set_off_color(text) to authenticated;
```
  `my_clinic_hospital_id()`는 원장·데스크 모두 자기 병원 하나를 준다(승인 전·다른 사람은 null → 0줄). 11색 이름은 `CAL_COLORS`와 같다(시험이 견줌). `updated_at`은 지금 트리거(`gcal_links_touch`)가 적는다. 표·칸·정책은 그대로다.
- 시험: 새 `supabase/googleLinkOffColor.rls.test.ts` — `googleLink.rls.test.ts`와 같은 PGlite + Supabase 흉내·계정, 사슬 = 이 파일보다 앞 migration 모두(파일 이름 차례, `20261126000000_google_link.sql` 포함) → 이 파일 → 이 파일(파일이 없으면 시험마다 실패, `existsSync`). 원장·데스크 성공(그 병원 `look.offColor`만 바뀌고 다른 `look` 칸·`rules`·`secret` 그대로), 다른 병원 사용자가 불러도 이 병원 줄 그대로, anon은 실행 권한 없음, 보는 관리자(요청 머리)면 false·그대로, 11색 밖·null 거절, 정의자·`search_path` 빈 값·권한 표(public·anon 없음, authenticated 실행), 머리 주석·LF. `googleLink.rls.test.ts`는 고치지 않는다(사슬이 그 파일까지라 새 파일과 안 엮임).
- `lib/storage/gcal.ts` `setGcalOffColor(client, color: GColor): Promise<boolean>`: `isColor`가 아니면 failed(보내지 않음), `client.rpc('gcal_set_off_color', { p_color: color })` → `data === true`.
- 받기: `PullRun`의 하루 종일 갈래가 off로 알아본 일정마다 `{ updated: ev.updated, color: colorFromId(ev.colorId) }`를 견줘 `updated`가 가장 나중인 것을 들고 있다가, 받기가 끝난 뒤(성공 갈래, 결과를 만들기 전) 그 색이 null이 아니고 그 받기가 읽은 `link.look.offColor`와 다르면 `store.setOffColor(color)`. 실패(던짐·false)는 삼킨다(받기 결과 그대로 — 다음에 off 일정이 바뀌면 또 맞춤).
- 처음 가져오기: `applyImport`도 off 목록(`offs`)으로 같은 셈을 하되 **off 줄을 적은 뒤, `pushWaiting` 전에** `setOffColor`를 부른다. `pushWaiting`은 연결을 다시 읽으므로(`loadLink`) 웹앱에만 있는 사람이 든 off 날(`wait: true`)을 보낼 때 새 색 `G_COLOR_ID[새 색]`으로 칠한다.
- `GcalLook.offColor`는 구글 11색만(`checkGcalLook`의 `isColor`, 색판 '나머지는 11색', DB 함수도 11색만) → 색 없는 off 일정(캘린더 기본 색)은 바꾸지 않는다. `'default'`를 받게 하려면 저장 검사·색판·칠하기를 함께 바꿔야 해서 이번에는 하지 않는다.
- 보내기(`push.ts`)는 그대로 `G_COLOR_ID[look.offColor]`. 예약 탭은 다음에 구글 연결을 읽을 때(탭을 다시 열 때) 새 색으로 그린다.
- 이미 이은 병원은 구글 off 일정이 다음에 바뀔 때 맞춰진다. 바로 맞추려면 설정 › 시행자·종류 '휴무 줄 색'에서 한 번 고른다(사용자 안내 — tasks.md 사용자 단계).
- 이 SQL을 붙이기 전에 새 사이트가 돌면 함수가 없어 `setOffColor`가 실패할 뿐 삼키므로 다른 일은 그대로다(그래도 SQL 먼저, 웹 다음).

### 21-6. 겹쳐 적지 않기 (REQ-8548 — 제목 TASK-25, 칸 글 TASK-27)
- `formatGoogleTitle`: `kind` = 지금 목록 이름(없으면 예약의 `kindName`). `mark`가 있고 `kind`가 `({한 글자})`로 끝나며 그 글자가 시행자 목록의 표시면 그 괄호(앞 빈칸 포함)를 뗀다 — 그 표시가 예약 시행자와 달라도 뗀다(끝에 실제 시행자 표시를 적으므로, 시안 '확인할 것' 3). 길이 조각은 `look.titleLen`이고 `kind`에 `(?<!\d){len}\s*분`이 없을 때만. 그다음 지금처럼 ` ({mark})` + 메모 + 도착 글.
- 칸 글(`rows/ApptBlock.tsx` 종류 조각, `rows/parts.tsx` `apptLabel`·`linkedApptLabel` 머리, `rows/PhoneWeekList.tsx` 종류 줄): `kindName`이 `({staffMark})`로 끝나면 ` ({staffMark})`를 빼고, `kindName`에 `(?<!\d){len}\s*분`이 있으면 끝 `{len}분`을 뺀다. 종류 이름은 그대로 보인다(칸 글은 구글 제목처럼 괄호를 떼지 않음). 같은 Phase라 rows는 gtitle의 새 함수를 부르지 않고 `rows/parts.tsx`에 작은 함수를 따로 둔다.
- 기본 종류는 이름에 길이·표시가 없어 그대로(AC-8548.3).

### 21-7. 취소 칸 (REQ-8549 — TASK-27)
- `rows/ApptBlock.tsx` 이은 병원 취소 칸: `${tone.fill} ${tone.on}`(`opacity-55`를 뺌), 글 조각은 지금처럼 가운데 줄. `rows/parts.tsx` `StatusMark` 취소 표시에 꽉 채운 칸 갈래: 흰 바탕(`bg-surface`) + `text-negative`(시안 `#B71C1C`는 앱 토큰이 아니라 가장 가까운 빨강 토큰). 잇지 않은 병원은 지금 그대로.
- 글 넷: `DetailPanel` 도착 줄 취소 `why` — google이 있을 때만 `칸은 취소 색으로 남아요` · `gcal/labels.ts` `colorNote` — `…으로 바뀌고, 웹앱에도 그 색 칸으로 남아요. …` · `gcalSettings/rules/labels.ts` `gDeleteCancelSub` — `취소 색 칸으로 남아 …` · `CalendarScreen` 취소 알림 — `g`가 있을 때만 `예약을 취소했어요. 칸은 취소 색으로 남아요.`.
- 안내 줄 취소 점(`CalendarLegend` Swatch)·자세히 색 막대는 지금도 흐림 없는 진한 색 — 고치지 않고 시험으로 확인만.

### 21-8. 고쳐야 할 판 기간·한꺼번에 (REQ-8550·8551 — TASK-29, Phase 6)
```ts
// components/calendar/gcal/fixRange.ts (순수 + 브라우저 저장소 두 함수)
export const FIX_RANGE_KEY = 'ssk-gcal-fix-range'
export type FixRange = { from: string; to: string } // '' = 비움
export function readFixRange(today: string): FixRange // 저장 값이 { from, to } 날짜 꼴('' 허용)이 아니거나 읽기가 던지면 { from: today, to: '' }
export function writeFixRange(range: FixRange): void // try/catch, 실패해도 조용히
export function rangeProblem(range: FixRange): 'no-from' | 'end-before' | null
export function fixDay(fix: GcalFix, all: readonly GcalFix[]): string // 하루 종일 여러 날(같은 gEventId의 allDay 줄들)은 가장 이른 날
export function inFixRange(fix: GcalFix, all: readonly GcalFix[], range: FixRange): boolean // 두 날 포함, to '' = 끝 없음
export function dayWithYear(day: string, today: string): string // 올해가 아니면 'YYYY. ' + shortDay
```
- `FixPanel` 새 prop `onSkipAll(fixes: GcalFix[]): Promise<boolean>`. 상태: 기간(처음 `readFixRange(today)`, 바꿀 때마다 `writeFixRange`) · 초록 줄 수(기간을 바꾸면 없음) · 확인 창 열림.
  - N = 받은 `fixes` 가운데 이 판에서 넣거나 빼지 않은 것, n = 그 가운데 기간에 드는 것. 판 제목 `fixTitle(n)` + 작은 글 `fixTotal(N)`(n ≠ N일 때). 작은 글은 `Drawer`(`components/calendar/AddPanel.tsx`)의 새 prop — 제목 옆 작은 글 `titleNote?: ReactNode`(안 주면 지금 그대로) — 로 그린다.
  - 목록 = `shown` 가운데 기간에 드는 줄(하나씩 한 줄은 지금처럼 남음, 한꺼번에 뺀 줄은 `shown`에서 뺌). 판에 보이는 줄이 하나도 없으면(시안 그대로) 목록 자리에 빈 글 + (다른 기간에 남은 것이 있으면) 그 수. 기간 오류면 목록·빈 글·단추 없이 빨간 오류 글.
  - 때 글·들어온 때 글·확인 창 기간 글의 날짜는 모두 `dayWithYear`(올해가 아니면 해를 붙임, 시안 `ymdw`).
  - 확인 창: `role="alertdialog"`·`aria-modal`, 첫 초점 [취소], Esc는 창만 닫는다(판 `Drawer`의 Esc 닫기가 함께 돌지 않게 막음). 모양은 `gcalSettings/rules/Rules.tsx` 잇기 끊기 확인 창을 따른다. [가져오지 않기] → `onSkipAll(기간에 남은 줄)`(도는 동안 단추 막음), 참이면 초록 줄 수 = n, 그 줄들을 `shown`에서 뺀다.
- `CalendarScreen` `skipAllFixes(list)`: `skipGcalFixes(client, ids)` → 알림 `bulkSkipDone(n)` → `gcal.reloadFixes()` → 참. 실패 → 알림 `PUT_FAILED` → 거짓. 띠 노란 단추·예약표 노란 칸은 지금처럼 `gcal.fixes`(전체)를 쓴다.
- `lib/storage/gcal.ts` `skipGcalFixes(client, ids: readonly string[]): Promise<void>`: 모두 `requireId`(하나라도 틀리면 failed, 보내지 않음), 빈 목록은 보내지 않음, 100개씩 `update({ state: 'skip' }).in('id', chunk).eq('state', 'open')`.
- 글(`gcal/labels.ts`, notes 그대로): `FIX_FROM` `시작` · `FIX_TO` `끝` · `FIX_TO_HINT` `비우면 앞으로 전부` · `FIX_RANGE_MEMO` `고른 기간은 이 PC에서 기억해요.` · `FIX_SKIP_ALL` `이 기간 모두 가져오지 않기` · `FIX_NO_FROM` `시작 날짜를 골라 주세요.` · `FIX_END_BEFORE` `끝 날짜는 시작 날짜보다 앞일 수 없어요.` · `fixTotal(n)` `· 전체 {n}개` · `FIX_EMPTY` `이 기간에는 고쳐야 할 구글 예약이 없어요.` · `fixElsewhere(n)` `다른 기간에 {n}개 남아 있어요.` · `skipAllAsk(n)` `{n}개를 가져오지 않을까요?` · `SKIP_ALL_KEEP` `구글 일정은 그대로예요.` · `skipAllRange(from, to)` `기간 {from} – {to}`(to가 비면 `기간 {from} – 앞으로 전부`) · `SKIP_ALL_CANCEL` `취소` · `SKIP_ALL_GO` `가져오지 않기` · `bulkSkipDone(n)` `{n}개를 가져오지 않기로 했어요. 구글에만 남아요.`. 두 날짜 칸 사이 `~`. 시안 전용 `… 아래로 {n}개 더 있어요`는 넣지 않는다.
- 지금 `FixPanel.test.tsx`·`CalendarScreen.test.tsx` 차림의 고쳐야 할 것 날이 기본 기간(오늘부터) 밖이면, 그 시험은 저장소에 기간을 넣거나 기간을 골라 지나게 하고 그 줄에 `google-link AC-8550.1` 주석.

### 21-9. 시행자·종류 화면 (REQ-8552 — TASK-30, Phase 6)
- `colors/labels.ts`: `KIND.lead2`(설명 둘째 줄) · `KIND_EX.eventLen(n)` `구글 일정 {n}분` · `KIND_EX.noLen` `제목에 길이가 없으면 구글 일정 길이로 봐요` · `REREAD.title` `이미 들어온 예약` · `REREAD.owner` `원장 계정만 할 수 있어요` · `REREAD.lead` `구글 제목을 지금 설정으로 다시 읽어 종류·시행자를 맞춰요. 구글 일정은 바꾸지 않아요.` · `REREAD.hint` `저장한 설정으로 읽어요. 가져올 때 고르거나 [고치기]로 바꾼 종류·시행자는 그대로 둬요.` · `REREAD.button` `이미 들어온 예약 다시 알아보기` · `REREAD.busy` `다시 알아보는 중…` · `REREAD.done(read, kinds, unread)` `예약 {read}개를 다시 알아봤어요 · 종류가 바뀐 것 {kinds}개 · 못 알아본 것 {unread}개`(수는 세 자리마다 쉼표) · `REREAD.at(hm)` `({hm})` · `REREAD.kept` `못 알아본 예약은 전 종류·시행자 그대로 두었어요.`. 실패 글은 notes에 없어 `SAVE_TEXT.failed`·`SAVE_TEXT.offline`을 빌린다(이 파일 머리 주석의 '옛 글 빌림'과 같은 까닭).
- 새 `colors/kindExamples.ts`(순수): `kindExamples(kinds, staff, look, today): KindExample[]`(최대 셋, 없으면 빈 목록 → 상자 없음). 첫째 줄은 차례만으로 정해져 보기가 되지 않으므로 '둘째'를 쓴다:
  1. 이름에 `{N}분`과 끝 `({표시})`(시행자 목록 표시)가 함께 있는 종류 가운데 둘째(하나뿐이면 그것) K1 → 제목 `1234 홍길동 {N}분 {바탕 낱말} ({표시})`, 일정 길이 N분.
  2. 같은 꼴이고 N이 K1과 다른 첫 종류 K2 → 제목 `1234 홍길동 {바탕 낱말} ({표시})`, 일정 길이 N2분, 꼬리 `구글 일정 {N2}분` + 작은 글 `제목에 길이가 없으면 구글 일정 길이로 봐요`.
  3. 충격파 종류 가운데 이름에 1000의 배수가 든 것의 둘째(하나면 그것) K3 → 제목 `1234 홍길동({S/1000}천`.
  결과 = `parseGoogleEvent`(오늘 10:00, 색 없음, 이은 날 = 오늘이라 '앞으로')가 고른 종류 이름(appt·fix guess의 종류). 종류를 못 고르면 그 줄을 뺀다. 차트번호·이름은 시안의 지어낸 값.
- `StaffKinds.tsx`: 종류 칸 설명 둘째 줄(모든 모양), 보기 상자(`kindExamples(화면 종류, 화면 시행자, 화면 look, today)`), 맨 아래 '이미 들어온 예약' 칸(`mode === 'linked' && !readOnly`일 때만 — 데스크·보는 중·처음 잇기·잇지 않음은 없음). 단추 → `deps.reread()`(도는 동안 막음) → `ok`면 결과 줄(끝난 한국 시각 `HH:mm`) + 작은 글, 아니면 저장 알림과 같은 자리·모양으로 빌린 글(인터넷이 끊겼으면 offline — 저장 알림이 고르는 방법 그대로). 결과는 이 부품 상태(떠나면 사라짐).
- `save.ts` `StaffKindsDeps`에 `reread(): Promise<RereadResult>`(타입은 `lib/gcal/reread`), `colorsDeps`가 `reread`를 받아 묶는다. `GcalSettingsScreen`은 이미 만드는 `makeGcalDeps` 묶음(`gcalDeps`)으로 `() => runReread(gcalDeps)`를 넘긴다.
- '웹앱 → 구글 제목 꼴' 미리 보기는 코드 그대로(`formatGoogleTitle`이 21-6을 따름). 미리 보기 예를 고르는 차례(`SAMPLES`)는 지금 그대로라 시안의 '이 병원' 여섯 줄과 다른 줄이 나올 수 있다 — 겹쳐 적지 않는 것만 같다(시안과 다른 곳).
- '종류 글이 없는 예약' 조사(`도수 30분(호)로 봐요`·`체외충격파 2000으로 봐요`)는 지금 `josa`로 이미 맞다 — 고치지 않고 시험으로 확인만.

### 21-10. 앞 절과 달라지는 곳
- 7절 DB: 표·칸·정책은 그대로, 정의자 함수 `gcal_set_off_color` 하나를 새 migration으로 더한다(데스크 PC 받기도 휴무 줄 색을 맞춤) → 21-5.
- 13절 알아보는 차례: ③(아는 표시 한 글자 괄호는 메모 아님)·⑤(바탕 낱말·후보 고르기·타수 ⑤-1)·메모의 타수 글 → 21-1.
- 2절 표·12-1 받기·12-2 보내기의 '변경': 이은 병원은 `g_moved`만(웹앱 옮김·구글 옮김 모두 `g_moved`를 적음) → 21-3.
- 10-4 제목 꼴 `{차트번호} {이름} {종류} {길이}분 ({표시})`: 종류 이름 끝 표시는 떼고 든 길이는 다시 적지 않음, 칸 글도 겹침 뺌 → 21-6.
- TASK-20 '취소 = 취소 색 + 흐림': 이은 병원은 흐림 없음, 바뀐 글 넷 → 21-7.
- 11절 수납 달 목록 '그날 한 번': 이번 달 파일이 있는 답을 받은 날만 → 21-4.
- 고쳐야 할 판: 기간·한꺼번에 가져오지 않기 → 21-8. 시행자·종류: 설명 줄·보기·다시 알아보기 → 21-9. 휴무 줄 색: 구글을 따라 저절로 → 21-5.

### 21-11. 위험 / 확인할 것 (2차)
- 2차 전에 이은 병원에서 웹앱으로 옮긴 예약(`orig_day` 있음·`g_moved` 거짓)은 웹앱 '변경'이 빠진다(구글은 흑연 그대로). 다음에 그 예약을 옮기거나 구글에서 고치면 맞춰진다. 처음 가져오기의 흑연 일정은 `g_moved` 참이라 그대로. 표·칸을 바꾸지 않기로 해서(이번 migration은 휴무 줄 색 함수 하나) 한꺼번에 되살리지 않는다.
- 이미 이은 병원의 휴무 줄 색은 구글 off 일정이 바뀌어야 따라간다(21-5) → 설정에서 한 번 고르기 안내.
- 다시 알아보기는 수천 줄을 브라우저가 적어 몇 분 걸릴 수 있고, 그사이 다른 PC가 고친 줄은 쓰지 않는다(missed — 화면에 수는 안 보임, 다시 누르면 됨).
- 종류 이름의 표시와 다른 시행자를 고른 예약은 구글 제목 끝이 실제 시행자 표시라, 다음 받기·다시 알아보기 때 그 표시의 종류로 바뀔 수 있다(시안 '확인할 것' 3 — 시안대로).
- 기본 종류 병원도 `{숫자}천` 제목은 이제 충격파 + 메모 `{수}타`로 읽는다(사용자 결정 2) — 지금 기대가 바뀌는 시험은 없음(확인함).

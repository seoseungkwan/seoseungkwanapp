# 요구사항: 수납일지 장부 다른 기기에서 보기(계정마다)

> 기능 ID: `sunap-phone` · 형식: `### REQ-6501: 제목` 아래 `- AC-6501.1: Given/When/Then`. 시험 이름에 AC ID를 넣는다.
> 번호: REQ-6501~6508 (다른 명세의 가장 큰 번호 REQ-6403과 겹치지 않음).
> **시안 없음**: 사용자 2026-11-18 "시안만들지말고 바로 해". 화면 글자는 design.md '화면 글자'가 정한다(따옴표 안 글자 그대로, `{ }`는 바뀌는 값). 모양은 지금 부품(설정 '데스크 계정' 목록 모양·다른 기기 화면 `RemoteView`·장부 표 `LedgerRows`·미수 입금 `PaidRows`)을 그대로 쓴다. `CLAUDE.md` '클릭 목업 승인 뒤 화면 구현' 규칙의 이 기능만의 예외다(사용자 지시).
> 결정 기록은 ADR-033(TASK-8). 예약 탭(ADR-030)과 같은 모양의 "환자 개인정보는 의원 PC 밖으로 나가지 않는다" 예외다.

## 배경 / 목표
- 지금 수납일지 환자 장부는 도우미(0.8.0 이상)와 비트가 있는 PC(보통 접수 PC)에서만 열린다. 다른 기기(폰·집 PC·태블릿·옛 도우미 PC)는 마감한 날 합계·지출만 보고 '환자 장부는 접수 PC에서만 보여요' 카드가 뜬다.
- 사용자(2026-11-18): 기기가 아니라 **계정**으로 정한다. 원장이 수납일지 [설정]에서 계정마다 '장부 보기'를 켜면, 그 계정은 장부가 열리지 않는 기기에서도 그날 장부를 **보기만** 한다.

## 사용자 결정 (2026-11-18, 다시 묻지 않는다)
1. 수납일지 [설정]에 원장만 보는 계정 목록: 원장 자기 계정 + 데스크 계정마다 '장부 보기' 스위치(기본 꺼짐). 원장만 보고 바꾼다. 데스크는 목록을 못 본다.
2. 처음 하나를 켤 때 확인(이름·차트번호가 서버로 가서 31일 보관, 켠 계정만 봄). 마지막 하나를 끌 때 확인하고, 끄면 서버 사본을 바로 지운다.
3. 하나라도 켜져 있으면 장부가 열리는 PC(도우미 있음, 보통 접수)가 그날 장부를 서버에 보낸다: 그 PC 장부와 같은 내용(이름·차트번호 포함)이되 장부 칸만, 전화·주민번호·주소는 절대 없다. 불러오기·고치기·마감 뒤 다시 보낸다. 작은 상태 줄 '다른 기기로 보냄 · HH:MM', 실패면 [다시 보내기].
4. 켠 계정은 장부가 안 열리는 기기(지금의 `screenMode` 'device'·'old-helper')에서 그날 장부를 읽기 전용으로 본다: 접수 장부와 같은 칸(390px에서 화면이 옆으로 밀리지 않음), '접수 PC에서 HH:MM에 보냄'과 마감 상태, 고치기·마감 없음.
5. 아직 안 보낸 날은 분명한 글, 31일(한국 날짜) 지난 날은 '31일이 지난 장부는 볼 수 없어요', 끈 계정은 지금 카드 + 힌트(원장: [설정]에서 켤 수 있음 / 데스크: 원장님께 켜 달라고 하기).
6. 서버는 31일 지난 사본을 지운다: 예약 탭처럼 쓸 때 도는 트리거 + 31일 지난 줄을 주지 않는 RLS. pg_cron 없음.
7. 접수 PC는 누구에게나 지금과 똑같다(고치기·마감 그대로).
8. 시안 없이 바로 만든다.

## 이 명세가 정한 것 (Claude 판단, 사용자 확인 대상)
- '31일' = 한국 날짜 오늘을 넣어 31일, 곧 오늘 − 30일 ~ 오늘. 그보다 이른 날은 보내지도 보이지도 않는다(접수 PC는 지금처럼 62일까지 장부가 열리지만 31일 밖의 날은 보내지 않는다).
- 보내는 것: 환자 장부 줄(장부 표 칸 열다섯), 미수 입금 줄(접수·차트·이름·현금·카드 — 접수 PC 장부 아래 표), 다음 예약 종류 목록(id·이름·예약률 셈 여부, 칩 글자와 합계 줄용). 원장님별 표·진료의 코드·처방코드·비트 예약 메모 글·'확인 필요한 날' 표시는 보내지 않는다.
- 비고가 전화·주민번호·메일 모양이면 그 줄 비고만 '접수 PC에서만 보여요'로 바꿔 보낸다.
- 보내기는 마지막 장부 변화 뒤 5초 기다려 한 번(마감은 기다리지 않음). 쓰기는 DB 함수 하나만 하고, 켠 계정이 없으면 DB가 저장하지 않는다.
- 원장 계정은 다른 기기에서도 수납일지 [설정]이 열린다(스위치를 켜려면 필요하다). 데스크는 다른 기기에 지금처럼 [설정]이 없다.
- 다른 기기는 열 때·날을 바꿀 때·화면이 다시 보일 때·[새로 읽기]를 누를 때 사본을 읽는다(실시간 아님).
- 설정 탭에서 데스크 계정을 [빼기]하면 그 계정 스위치도 함께 없어지고, 그것이 마지막 켠 스위치면 사본도 DB가 바로 지운다(따로 묻지 않는다. 데스크 계정 칸은 고치지 않는다).

## 요구사항

### REQ-6501: 서버 표·함수 (`supabase/migrations/20261118200000_sunap_share.sql`)
- AC-6501.1: Given 앞 migration(auth·precheck_settings·업무일지 넷·stats_rx_groups 둘·sunap·calendar·desk_accounts) 다음, When 이 SQL을 실행하면, Then 표 `sunap_share_viewers`(id·hospital_id·member_id·created_at)와 `sunap_ledger_copies`(hospital_id·work_date·ledger_rows·paid_rows·rsv_kinds·sent_at, 기본 키 (hospital_id, work_date))가 생기고 둘 다 RLS가 켜진다. `sunap_share_viewers`는 anon·authenticated 표·칸 권한과 정책이 하나도 없다. `sunap_ledger_copies`는 authenticated에 select만 있고(넣기·고치기·지우기 권한 없음) anon 권한은 없다. 새 함수는 모두 public·anon에서 실행 권한을 거두고, 사용자가 부르는 다섯(`sunap_share_accounts`·`set_sunap_share`·`sunap_share_status`·`save_sunap_copy`·`sunap_share_view_hospital`)만 authenticated에 준다(모양 검사·트리거 함수는 아무에게도 주지 않는다). `my_hospital_id()`·`my_desk_hospital_id()`·`my_clinic_hospital_id()`·`hospital_members`는 다시 만들지 않고 글자도 바꾸지 않는다.
- AC-6501.2: Given 승인된 병원 A의 원장, When `sunap_share_accounts()`를 부르면, Then 첫 줄은 원장(member_id null, email = 로그인 메일 소문자, viewing = 원장 스위치가 켜짐)이고 다음은 A의 데스크 줄들(더한 차례, member_id = 데스크 줄 id)이다. 원장이 아닌 사용자(데스크·승인 대기·거절·병원 없음)는 빈 목록이다. When 원장이 `set_sunap_share(null, 참/거짓)`·`set_sunap_share(데스크 id, 참/거짓)`을 부르면, Then 원장 자기·그 데스크 스위치가 켜지고 꺼진다(이미 그 상태면 그대로, 두 번 켜도 줄은 하나). 다른 병원 데스크 id·없는 id면 아무것도 바뀌지 않는다. 원장이 아닌 사용자(데스크 포함)가 부르면 권한 오류(42501)이고 아무것도 바뀌지 않는다 — 데스크는 자기 스위치도 못 바꾼다.
- AC-6501.3: Given 사용자, When `sunap_share_status()`를 부르면, Then 한 줄 (sharing, can_view)다: sharing = 그 사용자의 병원(`my_clinic_hospital_id()`)에 켠 스위치가 하나라도 있음, can_view = 그 사용자 자기 스위치가 켜짐(원장은 원장 스위치, 데스크는 로그인 메일로 맞춘 자기 데스크 줄의 스위치). 승인 대기·거절·병원 없는 사용자는 (거짓, 거짓)이다. 원장이 데스크 줄을 지우면 그 데스크는 바로 다음 문장부터 (거짓, 거짓)이다.
- AC-6501.4: Given 병원 A의 원장 또는 데스크, When `save_sunap_copy(날, 장부 줄, 미수 입금 줄, 종류)`를 부르면, Then A에 켠 스위치가 하나도 없으면 아무것도 저장하지 않고 null이고, 있으면 (A, 날) 줄을 넣거나 덮어쓰고 DB 시각 sent_at을 돌려준다(병원은 늘 A, 보낸 값으로 정할 수 없음). 날이 한국 날짜 오늘 − 30일보다 이르거나 오늘보다 늦으면 거부(22023)된다. 승인 대기·거절·병원 없는 사용자는 거부(42501)된다. 다른 병원 B의 줄은 바뀌지 않는다. 원장·데스크 모두 표를 바로 넣기·고치기·지우기하면 권한 없음(42501)이다.
- AC-6501.5: Given 저장할 값, When 장부 줄이 배열이 아니거나 401줄 이상이거나, 미수 입금 줄이 101줄 이상이거나, 종류가 11개 이상이거나, 줄에 정해 둔 열쇠 밖의 열쇠(예: phone·rrn·address·birth·doctor·codes·memo)가 있거나, rsv 안에 kind·source·at 밖의 열쇠가 있거나, 미수 입금 줄에 chart·name·time·cash·card 밖의 열쇠가, 종류에 id·label·counts 밖의 열쇠가 있거나, name이 1~40자 글자가 아니거나, chart가 1~20자 글자가 아니거나, note가 글자가 아니거나 100자를 넘거나, 장부 줄 글자 크기가 400,000바이트 이상이면, Then 거부(23514)되고 줄이 생기지 않는다. 정해 둔 열쇠만 있는 400줄·비고 100자는 들어간다.
- AC-6501.6: Given A의 사본 줄들(오늘·오늘 − 30일·오늘 − 31일), When 읽으면, Then 스위치를 켠 계정(원장 스위치가 켜진 원장·자기 스위치가 켜진 데스크)만 A의 줄을 보고, 그 가운데서도 work_date ≥ 한국 날짜 오늘 − 30일인 줄만 보인다. 스위치를 끈 원장·데스크, B의 원장·데스크, 승인 대기·거절·병원 없음·anon은 한 줄도 못 본다. 원장이 그 데스크 줄을 지우면 그 데스크는 바로 다음 문장부터 못 본다.
- AC-6501.7: Given 사본이 있는 A·B, When 누가 사본을 저장하면, Then 모든 병원의 work_date < 한국 날짜 오늘 − 30일 줄을 트리거가 지우고(오늘 − 30일 줄은 남는다), When A의 마지막 켠 스위치를 끄거나(`set_sunap_share` 거짓) 마지막 켠 스위치의 데스크 줄이 지워지면(`remove_desk_member`), Then A의 사본이 모두 바로 지워지고 B의 사본은 그대로다. 켠 스위치가 하나라도 남으면 사본은 그대로다.
- AC-6501.8: Given 이 파일, When 글자를 보면, Then 줄 끝이 LF이고 머리 주석에 SQL Editor에 붙여 넣는 방법·앞 migration(desk_accounts 포함)·ADR-033·'두 번 붙여 넣어도 그대로'·예약 작업(pg_cron)을 쓰지 않는다는 말이 있다. 두 번 돌려도 되는 문장만 쓴다(표·색인 `if not exists`, 함수 `create or replace`, 트리거 `create or replace trigger`, 정책 `drop policy if exists` 뒤 `create policy`). When 같은 DB에 두 번 돌리면, Then 표·함수·권한 모양과 이미 있던 줄이 그대로다.

### REQ-6502: 보낼 칸 고르기·읽은 값 검사 (순수 함수 `src/lib/sunap/share.ts`)
- AC-6502.1: Given 장부 줄(진료의 칸 포함)·미수 입금 줄·다음 예약 종류 목록, When `toSharedLedger({rows, paid}, kinds)`를 부르면, Then 줄마다 열쇠는 정확히 chart·name·time·kind·cash·card·transfer·unpaid·health·free·block·pt·rsv·note·edited 열다섯이고, rsv는 kind·source·at 셋, 미수 입금 줄은 chart·name·time·cash·card 다섯, 종류는 id·label·counts 셋이다. 받은 줄에 다른 열쇠(phone·rrn·address·birth·memo·codes·doctor 같은 것)가 붙어 와도 결과와 그 JSON 글자에 그 열쇠·값이 없다. 받은 객체·배열을 그대로 쓰지 않고 새로 만든다(edited 배열도 새것).
- AC-6502.2: Given 비고가 전화·주민번호·메일 모양(`privacyProblem`)인 줄, When 고르면, Then 그 줄 비고만 '접수 PC에서만 보여요'이고 다른 칸은 그대로다. 모양이 아닌 비고는 그대로 간다.
- AC-6502.3: Given 틀린 값, When 고르면, Then null이다(보내지 않음): 장부 줄 400줄 넘음·미수 입금 100줄 넘음·종류 10개 넘음, chart가 1~20자가 아님, name이 1~40자가 아님, 시각이 빈 글자나 HH:mm이 아님, 구분이 new·d90·re 밖, 금액·건강생활이 0~99,999,999 정수가 아님, free·block·pt가 참거짓이 아님, rsv.kind가 none·unknown·종류 id 모양 밖, rsv.source가 hand·bit 밖, rsv.at이 null도 12자리 숫자도 아님, 비고가 100자 넘음, edited에 정해 둔 칸 이름 밖의 글자, 종류 id·이름(1~10자)·counts가 틀림.
- AC-6502.4: Given 서버에서 읽은 값 {rows, paid, kinds}, When `readSharedLedger`를 부르면, Then 같은 규칙으로 정해 둔 열쇠만 골라 새로 만들고, 값이 하나라도 틀리면 null이다(반쪽 장부를 그리지 않는다). Given 고른 값, When `sharedToLedger(날, 값)`·`sharedKinds(값)`를 부르면, Then 장부(진료의 null·closedAt null·late 거짓·unsure 거짓·doctors 빈 목록)와 종류 목록(words 빈 목록)이고, `dayTotals(sharedToLedger(…), sharedKinds(…))`가 원래 장부·종류의 `dayTotals`와 같다.
- AC-6502.5: Given 한국 날짜 오늘, When `shareOldest(오늘)`·`inShareWindow(날, 오늘)`을 부르면, Then 앞은 오늘 − 30일이고, 뒤는 오늘 − 30일 ≤ 날 ≤ 오늘일 때만 참이다(`SHARE_DAYS` = 31, 날짜 셈은 `lib/analytics/dates.ts`).

### REQ-6503: 저장 함수 (`src/lib/storage/sunapShare.ts`)
- AC-6503.1: Given 저장 함수, When `listShareAccounts`·`setShareView`·`loadShareStatus`를 부르면, Then 각각 `sunap_share_accounts`·`set_sunap_share`({p_member, p_on})·`sunap_share_status`만 부른다. 읽은 계정 줄은 모양을 확인해 `{memberId(원장은 null), email, viewing}`로 새로 만들고 틀린 줄은 뺀다. 목록이 배열이 아니면 failed다. 상태는 첫 줄 `{sharing, canView}`이고 줄이 없거나 참거짓이 아니면 failed다. `setShareView`는 memberId가 null도 빈 글자 아닌 글자도 아니거나 on이 참거짓이 아니면 보내지 않고 failed다.
- AC-6503.2: Given 장부 보기·종류 목록, When `saveSunapCopy(client, 날, 장부, 종류)`를 부르면, Then `toSharedLedger`로 고른 값만 `save_sunap_copy`({p_day, p_rows, p_paid, p_kinds}) 하나로 보낸다(몸통 열쇠는 넷뿐, 줄 안 열쇠도 정해 둔 것뿐, 진료의·전화 같은 값이 요청 글자에 없다). 날짜 모양이 아니거나 고른 값이 null이면 보내지 않고 failed다. 답이 시각 글자면 그 글자, null이면 null(켠 계정이 없어 저장 안 함), 그 밖이면 failed다.
- AC-6503.3: Given 날, When `loadSunapCopy(client, 날)`을 부르면, Then `sunap_ledger_copies`에서 그날 한 줄(work_date·ledger_rows·paid_rows·rsv_kinds·sent_at)만 읽는다. 줄이 없으면 null, 있으면 `{day, sentAt, ledger}`(ledger = `readSharedLedger`)이고, 모양이 틀리면 null이 아니라 failed다(안 보낸 날로 보이지 않게).
- AC-6503.4: Given 연결 끊김·Supabase 오류·던짐, When 어느 함수든 부르면, Then `SunapShareError`(종류 offline·failed)이고 오류 글·JSON에 Supabase 문구·이름·차트번호가 없다.

### REQ-6504: 수납일지 [설정] '다른 기기에서 장부 보기'
- AC-6504.1: Given 원장(`useDesk()` 거짓), When `ShareAccounts`를 그리면, Then 제목 '다른 기기에서 장부 보기'·설명·계정 목록·맨 아래 글이 design.md '화면 글자' 그대로 보인다. 목록은 설정 탭 데스크 계정 목록 모양이고, 원장 줄은 메일 + 칩 '원장(나)', 데스크 줄은 메일 + 칩 '데스크'이며, 줄마다 스위치(role switch, 이름 '{메일} 장부 보기', aria-checked = 켬)가 있다. 데스크 줄이 없으면 데스크 안내 한 줄이 있다. 읽는 동안은 읽는 중 글, 읽기 실패면 E-SUNAP-SHARE-LIST-FAILED 카드와 [다시 불러오기]다.
- AC-6504.2: Given 데스크(`useDesk()` 참), When `ShareAccounts`를 그리면, Then 아무것도 그리지 않고 `listShareAccounts`를 부르지 않는다.
- AC-6504.3: Given 켠 스위치가 하나도 없음, When 스위치 하나를 누르면, Then 바로 보내지 않고 확인 상자(제목 '장부를 서버에 보낼까요?'·글·[취소]·[켜기], 초점은 [취소])를 보인다. [켜기]면 `setShareView(그 계정, 참)` 뒤 목록을 다시 읽고, [취소]나 Esc면 아무것도 보내지 않는다(Esc는 확인 상자만 닫고 설정 판은 그대로).
- AC-6504.4: Given 켠 스위치가 그 하나뿐, When 그 스위치를 끄면, Then 확인 상자(제목 '서버에 둔 장부를 지울까요?'·글·[취소]·[끄고 지우기])를 보이고, [끄고 지우기]면 `setShareView(그 계정, 거짓)` → 목록 다시 읽기 → '서버에 둔 장부를 지웠어요.' 한 줄이다.
- AC-6504.5: Given 그 밖의 켜기·끄기, When 스위치를 누르면, Then 묻지 않고 바로 보내고 목록을 다시 읽는다. 보내는 동안 모든 스위치가 눌리지 않고 누른 스위치는 aria-busy다. 실패면 E-SUNAP-SHARE-SAVE-FAILED 카드이고 스위치는 앞 값 그대로다. 바뀌면(성공) 받은 `onChange`를 한 번 부른다.
- AC-6504.6: Given `SunapSettings`, When 선택 칸 `share`(화면 조각)를 주면, Then 판 맨 위(Block 고르기 앞)에 그 조각을 그리고, 주지 않으면 지금과 같다. 판의 [저장]·[취소]는 스위치와 상관없다.

### REQ-6505: 접수 PC — 보내기·상태 줄
- AC-6505.1: Given 접수 PC 장부 화면(장부가 열린 날), When Worker가 그날 새 장부 보기를 줄 때마다(불러오기·고치기·마감·마감 풀기), Then 마지막 보기 뒤 5초(`SHARE_WAIT_MS`) 동안 새 보기가 없으면 한 번 `loadShareStatus` → sharing이 참이면 `saveSunapCopy(그날, 그 보기, 설정의 종류)`를 부른다. sharing이 거짓이면 `saveSunapCopy`를 부르지 않는다. 5초 안에 새 보기가 오면 앞 것은 버리고 마지막 것만 보낸다.
- AC-6505.2: Given [마감하기]가 서버 마감 저장까지 성공, When 끝나면, Then 5초를 기다리지 않고 바로 보낸다. 다른 날로 옮기면 기다리던 앞 날 보내기는 바로 보내고(그 답은 상태 줄에 쓰지 않는다), 화면을 떠나면 기다리던 보내기는 버린다.
- AC-6505.3: Given 그날이 한국 날짜 오늘 − 30일보다 이름, When 새 보기가 와도, Then 상태 읽기·보내기를 부르지 않고 상태 줄도 없다.
- AC-6505.4: Given 화면을 열거나 날을 바꿈, When 상태를 한 번 읽어 sharing이 참이면, Then 잠금 줄 글이 design.md '화면 글자'의 보내는 글이고 날짜 줄에 상태 줄('다른 기기로 보내는 중…' 또는 '다른 기기로 보냄 · {HH:MM}', 시각 = 답 sent_at의 한국 시각)이 보인다. sharing이 거짓·모름이면 잠금 줄은 지금 글 그대로이고 상태 줄이 없다.
- AC-6505.5: Given 보내기가 던지거나, sharing이 참으로 알려진 뒤 상태 읽기가 던짐, When 실패하면, Then 잠금 줄 아래 E-SUNAP-SHARE-SEND-FAILED 카드와 [다시 보내기]가 보이고, 누르면 지금 보기로 바로 다시 보낸다(상태부터). 다음에 성공하면 카드가 사라진다. sharing이 거짓·모름일 때 상태 읽기가 던지면 아무것도 보이지 않는다(다음 보기 때 다시 읽는다). 장부 고치기·마감은 막지 않는다.
- AC-6505.6: Given 접수 PC 장부 화면, When 보내기와 상관없이 쓰면, Then [비트에서 다시 불러오기]·[설정]·[마감하기]·[마감 풀기]·장부 고치기·지출·마감 알림 글은 지금과 같다(지금 시험이 그대로 통과한다).

### REQ-6506: 다른 기기 — 읽기 전용 장부
- AC-6506.1: Given `LedgerRows`에 `readOnly` 참, When 그리면, Then 칸 단추·번호표·고치기 판이 없고(editable 값과 상관없이), 칸 머리 글이 '접수 PC가 보낸 장부예요 · 보기만 할 수 있어요'이고, 범례 첫 칸이 '직원이 고친 칸(비트 값과 다름)'이다. 거르기·찾기·줄 세우기는 된다. `readOnly`를 주지 않으면 지금과 같다.
- AC-6506.2: Given 사본·서버 마감 줄, When `SharedLedgerPanel`을 그리면, Then 맨 위 한 줄 '접수 PC에서 {시각}에 보냄 · {마감 상태}'(시각 = sent_at 한국 날짜가 장부 날과 같으면 'HH:MM', 다르면 'M월 D일 HH:MM' · 마감 상태 = 서버 마감 줄의 상태 칩 글, 서버를 아직 못 읽었으면 ' · {마감 상태}' 없이)과 [새로 읽기], `LedgerRows`(`readOnly`, 줄 = 사본 줄, 합계 = 사본으로 센 `dayTotals`, 종류 = 사본 종류), 그 아래 두 칸 [미수 입금(`PaidRows`) | 받은 조각(`aside`)]이 있다. 장부·미수 입금 표는 자기 상자 안에서만 옆으로 밀린다(바깥 상자 min-w-0, 표 감싸개 overflow-x-auto).
- AC-6506.3: Given 다른 기기(모드 device·old-helper)이고 can_view 참이고 그날이 31일 안, When 그 날을 보면, Then 날짜 줄·보기 전용 잠금 줄·합계(마감한 날) 또는 '아직 마감 전이에요'·`SharedLedgerPanel`(aside = 지출 목록)이 보이고, '환자 장부는 접수 PC에서만 보여요' 카드·고치기·마감 단추는 없다.
- AC-6506.4: Given can_view 참이고 그날 사본이 없음, When 보면, Then 사본 자리에 '이 날 장부는 아직 접수 PC에서 보내지 않았어요'와 '접수 PC에서 이 날 수납일지를 열면 자동으로 보내요.'가 보인다.
- AC-6506.5: Given can_view 참이고 그날이 한국 날짜 오늘 − 30일보다 이름, When 보면, Then '31일이 지난 장부는 볼 수 없어요'와 '다른 기기에서는 오늘부터 30일 전까지의 장부만 볼 수 있어요.'가 보이고 `loadSunapCopy`를 부르지 않는다.
- AC-6506.6: Given can_view 거짓, When 보면, Then 지금 카드('환자 장부는 접수 PC에서만 보여요' 또는 옛 도우미 카드)가 그대로 있고 그 아래 힌트 한 줄이 있다(원장 힌트 / 데스크 힌트, design.md '화면 글자'). sharing이 참(다른 계정이 켬)이면 카드 몸 글의 '이름·차트번호가 든 줄은 서버로 올리지 않아요.'가 '장부 보기를 켠 계정만 다른 기기에서 장부를 볼 수 있어요.'로 바뀐다. `loadSunapCopy`를 부르지 않는다.
- AC-6506.7: Given 다른 기기, When 사본 읽기가 던지면(상태는 읽었고 켜짐), Then 사본 자리에 E-SUNAP-SHARE-READ-FAILED 카드와 [다시 불러오기](이름 '보낸 장부 다시 불러오기')가 보이고, When 상태 읽기부터 던지면, Then 지금 카드('환자 장부는 접수 PC에서만 보여요' 또는 옛 도우미 카드)가 그대로 있고 그 아래에 같은 오류 카드와 단추가 보인다. 누르면 상태부터 다시 읽는다. 읽는 동안은 '접수 PC가 보낸 장부를 불러오는 중이에요'다. 다른 날로 가면 새로 읽고 늦게 온 앞 날 답은 버린다. 화면이 다시 보이면(visibilitychange) 다시 읽고, [새로 읽기]를 누르면 다시 읽는다.
- AC-6506.8: Given 원장, When 다른 기기 수납일지를 보면, Then 날짜 줄에 [설정]이 있고 누르면 수납일지 설정 판이 열리며 판 맨 위에 `ShareAccounts`가 있다(설정 읽기 실패면 E-SETTINGS-FAILED). 데스크는 다른 기기에 [설정]이 없다(지금처럼). 접수 PC 장부 화면의 설정 판에도 맨 위에 `ShareAccounts`가 있다(원장에게만 보인다). 스위치가 바뀌면 다른 기기 화면은 상태·사본을 다시 읽고, 접수 PC는 상태를 다시 읽어 켜져 있으면 지금 보기를 바로 보낸다.
- AC-6506.9: Given 접수 PC의 62일 넘은 날(모드 old-day)과 연결 확인 중 화면, When 그리면, Then 지금과 같다(장부 보기 상태를 읽지 않는다).

### REQ-6507: 오류 번호
- AC-6507.1: Given `lib/errors.ts`, When 읽으면, Then E-SUNAP-SHARE-LIST-FAILED·E-SUNAP-SHARE-SAVE-FAILED·E-SUNAP-SHARE-SEND-FAILED·E-SUNAP-SHARE-READ-FAILED 넷이 design.md '오류 번호' 표 글자 그대로 있고, 번호 타입 `ErrorCode`(`src/types/errors.ts`)에도 있으며, E-SUNAP-SHARE- 번호는 이 넷뿐이다. 글에 '병원'·'@'·'니다.'가 없다.

### REQ-6508: 문서
- AC-6508.1: Given `docs/ADR.md`, When 읽으면, Then 끝에 ADR-033이 한 번 있고(번호는 오름차순·한 번씩) 글은 design.md 'ADR-033' 그대로다(맥락·결정·이유·대안·트레이드오프·바꾸는 것).
- AC-6508.2: Given `CLAUDE.md`, When 아키텍처 규칙을 보면, Then ADR-030 예외 줄 바로 아래에 design.md가 적은 ADR-033 예외 한 줄이 있고 다른 줄은 그대로다.
- AC-6508.3: Given `plan.md`·`docs/ARCHITECTURE.md`, When DB 표를 보면, Then `plan.md`는 `hospital_members` 줄 바로 아래, `docs/ARCHITECTURE.md`는 `sunap_settings` 줄 바로 아래에 `sunap_share_viewers`·`sunap_ledger_copies` 두 줄이 design.md 글 그대로 있고, `docs/ARCHITECTURE.md` 폴더 줄에 이 기능 한 줄이 더해진다. 다른 줄·차례는 그대로다(지금 문서 시험이 그대로 통과한다).

## 범위 밖
- 실시간 다시 읽기(몇 초마다·Realtime), 다른 기기에서 고치기·마감, 계정마다 다른 날짜 범위·칸 고르기, 여러 날 장부 보기·내려받기·인쇄.
- 원장님별 표·처방코드·'확인 필요한 날' 표시 보내기, 접수 PC 둘 이상 사이 장부 맞추기(나중에 보낸 PC가 이긴다).
- 설정 탭 '데스크 계정' 칸 바꾸기, 도우미·확장 새 판.
- 실제 Supabase에 붙는 E2E 시험(이 명세는 PGlite RLS 시험과 단위 시험으로 보낸 요청·저장 모양을 증명한다).

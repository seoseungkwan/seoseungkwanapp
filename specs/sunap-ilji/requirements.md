# 요구사항: 수납일지 탭

> 기능 ID: `sunap-ilji` · 형식: `### REQ-4901: 제목` 아래 `- AC-4901.1: Given/When/Then`. 시험 이름에 AC ID를 넣는다.
> 번호: REQ-4901~4907(앞 명세 최대 REQ-4806과 겹치지 않음).
> **MVP 모드**(사용자 2026-11-16 "가볍게 만들어"): 꼭 필요한 것만. 자동 다시 읽기·인쇄·지출 종류 이름 바꾸기·진료실별 표는 만들지 않는다.

## 배경 / 목표
- 의원이 쓰던 엑셀 '일일 수납일지'(v25.04)를 웹앱 새 탭으로 옮긴다. 손으로 적던 칸을 비트 읽기로 채우고 직원은 틀린 칸만 고친다.
- 승인 시안: `docs/mockups/sunap-ilji/index.html`·`notes.md`(2026-11-16 사용자 "승인"). 시안과 다른 곳은 design.md '시안과 다른 곳'.

## 이미 정한 것 (다시 묻지 않는다, notes.md)
1. 장부는 비트에서 자동 + 직원이 고침. 이름 줄·고친 칸·비고는 **그 PC 안(도우미 암호화 저장)**에만. 서버엔 마감 때 합계 숫자만
2. 새 탭 '수납일지'(주소 `/sunap`, 주요 탭 다섯째). 업무일지와 따로
3. 예약 종류는 비트 예약 메모 말로 자동(말은 설정에서 바꿈) + 직원이 직접 고름(직접이 이김, 비트에 없는 예약도). 예약률은 주사치료·진료(경과)만 셈
4. '예약하고 감'은 그날 처음 마감할 때 고정. 마감 풀기·지난 날 늦은 마감 허용(늦은 마감 표시)
5. Block·물리치료 = 통계 처방 묶음 중 하나씩 지정. 통계 탭 Block 전환은 비트에서 바로(장부에서 고친 체크는 안 들어감)
6. 재진+Block 비율 분모 = Block 전체(엑셀과 같음). 초진+Block = 초진, 90일+Block = 90일초진으로 나눔
7. 결제는 현금·카드·계좌·미수 칸, 넷 다 0원이면 FREE. 미수 입금(예전 미수를 그날 냄)은 따로, 내원 수에 안 넣음
8. 지출은 수납일지에만, 종류 넷(현금·카드·기타·현금(주차지원)), 서버 저장
9. 다른 기기(도우미 없는 PC·폰)는 마감한 날의 합계·지출만 봄
10. **진료실(원장님)별 비교는 뺀다**(2026-11-16 사용자: 비트 10월 내원 2,086건이 처방 의사 한 명으로만 남아 나눌 수 없음)
11. 메모에 정해진 말이 없는 예약은 '종류 모름'으로 보이고 예약률에서 뺀다(사용자 "나중에 정하자" — 지금은 이 기본값)

## 요구사항

### REQ-4901: 장부 규칙 (순수 함수)
- AC-4901.1: Given `classifyMemo(memo, words)`(words = `{inj, visit, etc}` 말 목록), When 메모에 inj 말이 있으면 `inj`, 없고 visit 말이 있으면 `visit`, 없고 etc 말이 있으면 `etc`, 아무것도 없으면 `unknown`이다(앞뒤 빈칸 무시, 영문 대소문자 무시, 빈 말은 무시)
- AC-4901.2: Given `groupMatches(def, codes)`(`RxGroupDef`, 처방코드 글자 목록), When 통계 `aggregate`의 셈 규칙과 같은 예(넣는 처방·빼는 처방·조건 처방)를 주면, Then 결과가 같다. def가 null이면 거짓이다
- AC-4901.3: Given `buildLedger(reply, local, settings)`, When 비트 줄에 고친 칸이 있으면, Then 그 칸은 고친 값이고 `edited`에 칸 이름이 들어간다. Block·물리치료는 고친 값이 없으면 `groupMatches`로 정한다
- AC-4901.4: Given 예약, When 직접 고른 값이 있으면 그 값(`hand`), 없고 그날 고정값(`fixed`)이 있으면 그 값(`bit`), 없으면 비트 예약이 없으면 `none`, 있으면 `classifyMemo`(`bit`)다. 직접 고르기는 `unknown`을 받지 않는다
- AC-4901.5: Given `dayTotals(ledger)`, When 시안 예(design.md '예')를 주면, Then 서버 숫자 24칸(design.md 'sunap_days')이 맞다: 초진 예약 = 초진 줄 중 예약이 `inj`·`visit`, 재진+Block = 재진 줄 중 Block, FREE = 네 칸 다 0, 미수 입금은 `paid` 줄에서 현금·카드 따로 센다
- AC-4901.6: Given `closeLocal(day, ledger, now)`, When 처음 마감이면, Then 직접 고른 줄을 뺀 줄의 지금 예약 종류가 `fixed`에 들어가고 `late` = (한국 날짜로 now > day)다. 이미 `fixed`가 있으면 그대로 둔다. `reopenLocal`은 `closedAt`만 지우고 `fixed`·`late`는 남긴다
- AC-4901.7: Given `parseWon(text)`, When `'12,000'`·`'12000원'`·`''`이면 12000·12000·0, `'-1'`·`'1억'`·`'100000000'`이면 `invalid`다(0~99,999,999)
- AC-4901.8: Given `src/lib/sunap/**`, When 소스를 보면, Then React·supabase·`lib/storage`·브라우저 저장소·`console`·네트워크가 없다(환자 자료 구역)

### REQ-4902: 도우미 — 하루 장부 읽기와 PC 저장 (도우미 0.8.0)
- AC-4902.1: Given `contact.targets {kind: 'sunap', from: D, to: D}`, When 부르면, Then design.md '도우미 답' 모양 하나를 조각으로 보낸다. D가 오늘−62일보다 이르거나 오늘보다 늦거나 from ≠ to면 `E-HELPER-BAD-MESSAGE`다
- AC-4902.2: Given 가짜 비트 자료, When 읽으면, Then `rows`는 그날 센 내원(통계와 같은 조건)의 환자마다 한 줄이고 시각 = 그날 첫 접수, 구분 = 첫 내원일이 D면 `new`, 아니고 그날 내원 종류 '3'이 있으면 `d90`, 아니면 `re`다. 금액은 그 환자 그날 내원들의 현금·카드·계좌·미수 합, 처방코드는 그날 처방의 합집합이다
- AC-4902.3: Given 같은 자료, When 그 환자에게 D 다음 날 0시 이후 예약(RsvInf 'R'·빈 값 줄이 있거나 상태 WR·NR·CR, 취소 CN 빼고)이 있으면, Then `rsv`는 가장 이른 예약의 [시각, 메모 앞 40자]이고 없으면 null이다
- AC-4902.4: Given 같은 자료, When D에 예전 미수를 낸 환자가 있으면, Then `paid`에 [차트, 이름, 시각, 현금, 카드] 줄이 있다. 매출 확인 필요 조건(revenue와 같음)이면 `unsure`가 참이다
- AC-4902.5: Given `store.save {month, sunap}`, When 저장하면, Then 그 달 파일의 `sunap`만 바뀌고 drafts·done·journal은 그대로다. `store.load {months}`의 달마다 `sunap`(없으면 `{}`)이 함께 온다. month 없이 sunap만 오면 `E-HELPER-BAD-MESSAGE`다
- AC-4902.6: Given 도우미 버전, When 보면, Then 0.8.0이고 웹 `LATEST_HELPER` 0.8.0·`SUNAP_HELPER` 0.8.0이다. 명령 이름 목록은 그대로다(확장 새 판 없음)

### REQ-4903: 서버 표 (새 migration 하나)
- AC-4903.1: Given `supabase/migrations/20261116000000_sunap.sql`, When 실행하면, Then 표 `sunap_days`·`sunap_spends`·`sunap_settings`가 design.md 'DB' 모양이고 RLS가 켜져 있고 anon 권한이 없다. 두 번 실행해도 오류가 없다
- AC-4903.2: Given 승인된 병원 사용자, When 자기 병원 줄을 읽고·넣고·고치고·지우면(settings는 지우기 없음), Then 된다. 다른 병원·승인 대기·anon은 거부되거나 0줄이다
- AC-4903.3: Given 값 제약, When 숫자 칸 −1, 지출 종류 `'x'`, 지출 내용 `''`·51자, 금액 100000001을 넣으면, Then 거부(23514)된다
- AC-4903.4: Given `src/lib/storage/sunap.ts`, When `closeSunapDay`·`reopenSunapDay`·`loadSunapDay`·`listSunapDays`·`listSpends`·`addSpend`·`updateSpend`·`deleteSpend`·`loadSunapSettings`·`saveSunapSettings`를 부르면, Then design.md '저장 함수'대로 보내고 받으며 실패는 `SunapStorageError('offline'|'failed')`다. 지출 내용이 `privacyProblem`이면 보내지 않고 `'blocked'`다. 설정 줄이 없으면 기본값이다

### REQ-4904: 장부 Worker
- AC-4904.1: Given `src/workers/sunap.worker.ts`, When 화면이 `{type:'load', day, settings, blockDef, ptDef}`를 보내면, Then `contact.targets`(sunap)와 `store.load {months:[그 달]}`을 받아 `buildLedger`로 만든 장부 보기(design.md 'Worker 메시지')를 돌려준다
- AC-4904.2: Given `{type:'edit', chart, patch}`, When 받으면, Then 그 달 `sunap`의 그 날 고친 칸을 바꿔 `store.save`로 저장하고 새 장부 보기를 돌려준다. 비트 값과 같아진 칸은 고친 칸에서 지운다
- AC-4904.3: Given `{type:'close'}`·`{type:'reopen'}`, When 받으면, Then `closeLocal`·`reopenLocal`을 저장하고 `close`면 `dayTotals`와 `late`를 돌려준다(화면이 서버에 올림)
- AC-4904.4: Given 도우미 오류, When 받으면, Then 오류 번호만 화면에 보낸다. 환자 줄은 화면으로 가는 장부 보기 말고는 Worker 밖으로 나가지 않는다

### REQ-4905: 수납일지 화면
- AC-4905.1: Given 도우미 0.8.0 이상이 연결된 PC, When 열면, Then 시안 `?s=open`처럼 날짜 이동·상태 칩·[비트에서 다시 불러오기]·[설정]·[마감하기], 잠금 한 줄, 요약 네 칸(수납·지출·내원·예약·Block 전환), 환자 장부, 미수 입금, 지출이 보인다(원장님별 표는 없다)
- AC-4905.2: Given 장부 칸, When 금액 칸을 고치거나 Block·물리치료를 누르거나 비고를 적으면, Then Worker `edit`로 저장되고 고친 칸 표시가 생긴다. 고친 칸에 [비트 값으로]가 있다
- AC-4905.3: Given 다음 예약 칸, When 누르면, Then 시안 `?s=pick` 판(비트 따라가기·예약 안 하고 가심·주사치료·진료(경과)·기타)이 뜨고 고르면 저장된다
- AC-4905.4: Given [마감하기], When 누르면, Then Worker `close` → `closeSunapDay` 순서로 저장하고 상태 칩이 '마감됨 · 시각'(늦으면 '늦은 마감 · 날짜 시각')이 되며 장부·지출은 고칠 수 없다. [마감 풀기]는 `reopenSunapDay` → Worker `reopen`이다. 서버 저장이 실패하면 오류 글을 보이고 상태를 바꾸지 않는다
- AC-4905.5: Given [설정], When 열면, Then Block·물리치료 처방 묶음 고르기(통계 처방 묶음 목록)와 예약 메모 말 세 줄(더하기·지우기)이 있고 [저장]은 `saveSunapSettings`다. 묶음을 아직 안 골랐으면 장부의 Block·물리치료는 모두 빈 칸이고 "설정에서 Block·물리치료 묶음을 골라 주세요" 한 줄이 보인다
- AC-4905.6: Given 지출 칸, When 줄을 더하거나 고치거나 지우면, Then 서버에 바로 저장된다. 개인정보 모양 내용은 저장하지 않고 이유를 보인다
- AC-4905.7: Given 도우미 없는 기기·폰·0.8.0 미만, When 열면, Then 시안 `?s=remote`처럼 그날 서버 합계와 지출만 보이고(고치기 없음) "환자 장부는 접수 PC에서만 보여요" 상자가 있다. 0.8.0 미만 PC는 "도우미 새 판(0.8.0)을 깔면 장부가 보여요"다. 마감 안 한 날은 "아직 마감 전이에요"다
- AC-4905.8: Given 장부 줄을 그리는 `src/components/sunap/rows/**`, When 소스를 보면, Then 네트워크·저장소·console·supabase·bridge를 쓰지 않는다(eslint 울타리 + guardrails 시험)
- AC-4905.9: Given 도우미 답의 `unsure`가 참인 날(매출 확인 필요 조건·음수 금액), When 장부를 보면, Then 장부 위에 "확인 필요한 날 — 환불·변경수납·예치금이 있거나 수납 연결이 겹쳐서 장부 금액이 비트와 다를 수 있어요. 마감 전에 비트 수납 화면과 맞춰 보세요." 한 줄이 보인다(마감은 막지 않는다). `unsure`가 거짓이면 없다 (11-17 사용자 결정)

### REQ-4906: 통계 탭 '예약·전환' 칸
- AC-4906.1: Given 통계 목차, When 보면, Then '매출' 다음에 '예약·전환'(`stats-sunap`)이 있다
- AC-4906.2: Given 기간, When 칸을 그리면, Then 초진·90일 예약률은 `listSunapDays`(그 기간 마감한 날)의 합으로 셈하고 '마감한 날 n일'·'늦은 마감 섞임 n일'을 함께 보인다. 마감한 날이 없으면 "수납일지를 마감한 날이 없어요"다
- AC-4906.3: Given 통계 Worker가 Block·물리치료 묶음 정의를 받으면, When 불러오면, Then `sunapRates`(그 기간 환자·날마다: 초진·90일초진·재진·Block·물리치료·초진+Block·90일+Block·재진+Block 수)를 함께 돌려주고 칸은 비율(재진+Block은 Block 중)을 보인다. 묶음 설정이 없으면 "수납일지 설정에서 Block·물리치료 묶음을 고르면 보여요"다
- AC-4906.4: Given `sunapRates`, When 가짜 환자·날 줄을 주면, Then 구분은 통계 환자 구성과 같고(신환이 90일초진보다 앞섬) 묶음 판단은 `groupMatches`와 같다

### REQ-4907: 탭·주소·울타리
- AC-4907.1: Given 메뉴, When 보면, Then '수납일지'(`/sunap`)가 환자 다음 주요 탭(다섯째)이고 주요 탭은 다섯, 전체 13이다. 메뉴 목록을 고정한 시험들이 새 목록으로 맞다
- AC-4907.2: Given `/sunap`, When 열면, Then 수납일지 화면이고 제목은 '수납일지'다
- AC-4907.3: Given `src/lib/sunap/**`·`src/components/sunap/rows/**`, When eslint로 금지 import를 넣어 보면, Then 오류다(guardrails 시험)

## 범위 밖
- 진료실(원장님)별 표, 인쇄·엑셀 내려받기, 지출 종류 이름 바꾸기, 자동 다시 읽기(10분), 여러 PC 사이 고친 칸 나누기, 접수 PC 지정, 비트 진료실 칸 읽기, '종류 모름' 예약 셈 방법 바꾸기(사용자 결정 뒤 따로)

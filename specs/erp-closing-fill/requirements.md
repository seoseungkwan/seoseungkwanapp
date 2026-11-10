# 요구사항: ERP 마감일지 비트 값 채우기 (새 크롬 확장 + 도우미 명령 2개)

> 기능 ID: `erp-closing-fill` · 형식: `### REQ-3601: 제목`, 수용 기준 `- AC-3601.1: Given/When/Then`. 시험 이름에 AC ID를 넣는다.
> 결정은 모두 사용자가 정했다(2026-11-10, 결정 기록 `~/.claude/state/handoff/erp-closing-extension.md`). 조사: ERP 칸 `notes/erp-closing-fields.md`(ERP 공개 화면 파일 기준, 로그인 화면은 못 봄) · 비트 코드·수납 `notes/bit-codes.md`(비트 DB 읽기 전용).
> 예시 날짜는 2026-11-09. 화면 글(설정 화면·단추·결과 안내)은 승인된 클릭 목업 `docs/mockups/erp-closing-fill/`이 이긴다.

## 배경 / 목표
- 마감일지(업무일지 1·2)를 매일 손으로 채운다. ERP의 파일 올리기는 빈 칸만, 일부 칸만 채운다
- 새 크롬 확장이 ERP 마감일지 화면(`https://erp.minesolution.com/h/closing`)에 [비트 값 채우기] 단추를 둔다. 누르면 화면의 '마감 일자'로 도우미에게 비트 숫자를 받아 비트로 셀 수 있는 칸을 모두 덮어쓴다. 저장은 사용자가 한다
- 기존 확장 '청구 사전점검 연결'(`extension/`)과 ERP는 고치지 않는다

## 이미 정한 것 (다시 묻지 않는다)
1. 단추를 눌렀을 때만 채운다. 날짜 = 화면 '마감 일자'. 적힌 칸도 덮어쓴다. 상태 선택·저장·기본단가·삭제·초기화는 건드리지 않는다
2. 건수 = 그날 고른 코드 가운데 하나라도 받은 서로 다른 환자 수. 치료별 매출 = 그 환자들의 그날 모든 외래 진료 총진료비 합(진료일 기준, 여러 묶음에 들면 묶음마다 더함)
3. 환자현황: 신환 = 비트 진찰구분 1 · 90일초진 = 3 · 진찰료 산정안함 = 0 · 물리치료내원 = 고른 코드(처음 값 AA222)를 받은 환자(신환·90일초진 아님) · 재진 = 나머지. 물리치료내원 환자는 재진·산정안함에서 뺀다. 합계 = 다섯 칸 합. 3분류 표(치료별·연령별)의 재진은 신환·90일초진이 아닌 모두
4. 연령 = 진료일 기준 만 나이, 10대미만 = 0~9세, 100세 이상은 90대
5. 진료수납액 = 그날 들어온 돈 전부(미수입금 포함) = 현금 + 카드 + 계좌이고 세 칸도 미수입금을 넣은 값. 감액 = 비트 할인 줄 합, 현불/환불 = 비트 환불(TPR), 장애인기금 = OrpRcvBil, 미수발생 = COO. 입원 칸 = 0. MOU 감액은 직접
6. 예약 표 = 비트 예약을 예약 메모 번호로 묶어 센다. 주사1회환자 = 그날 고른 주사를 맞았고 그 전 비트 기록에 고른 주사가 없는 환자 · 신환주사환자 = 신환 중 주사 맞은 환자 · 신환주사건수 = 그 신환들의 주사 처방 줄 수
7. 코드는 확장 설정 화면에서 항목마다 여러 개 고른다(도우미가 준 목록에서 찾기). 처음 값: 씨암 CARM1 · SONO SONO1 · 관절조영 HA280 · 도수 도수 · 충격파 ESWT7·ESWT10·ESWT12·ESWT17 · 물리치료 MM010·MM015·MM011 · 기타1 '크라이오' CRYO · 물리치료내원 AA222. 나머지는 비어 있다. 기타1~4는 ERP 줄 이름과 묶음 이름이 같은 줄에 넣는다
8. 직접 입력으로 남는 칸: 담당자·휴무자, 신환경로, 상담-전환률, 치료사별, 지출, 이벤트, 특이사항, MOU 감액, 상태
9. 미수납·환불·변경수납이 있는 날도 채울 수 있는 칸은 채우고 경고한다. 금액을 정할 수 없는 칸은 지어내지 않는다

## 승인 때 확인할 내 기본값
- (가) 코드를 고르지 않은 항목·비트에서 셀 수 없는 칸은 **건드리지 않는다**(지우지 않는다). 결과 안내에 그 칸 수가 나온다
- (나) 환불·변경수납·예치금이 있어 `revenue.days`가 금액을 확정하지 못하는 날(unconfirmed·splitUnconfirmed)도 사용자 결정 '채우고 경고'대로 외래 총매출·청구액·비급여·미수입금·진료수납액·카드·현금·계좌 여덟 칸을 비트 수납 줄을 확정 검사 없이 그대로 더한 값으로 채우고, 그 칸 이름을 적은 경고를 띄운다. 미수발생·감액·장애인기금·환불·치료별 매출은 늘 채운다
- (다) 처음 쓸 때 설정을 한 번도 저장하지 않았으면 채우지 않고 설정 화면을 연다. 예약 표 6줄의 메모 번호도 처음엔 비어 있다(충격파 = 1, 도수 = 14·20·22는 사용자가 고른다)

### REQ-3601: 새 확장과 도우미 연결
- AC-3601.1: Given `extension-erp/manifest.json`, Then MV3이고 이름 'ERP 마감일지 채우기', 권한은 `nativeMessaging`·`storage` 둘뿐, 내용 스크립트와 그것이 불러오는 모듈 파일(`web_accessible_resources`)은 `https://erp.minesolution.com/*` 하나에만, `host_permissions`·`externally_connectable`이 없고, `key`로 계산한 확장 ID가 `commands.json`의 `erp.extensionId`와 같다
- AC-3601.2: Given 도우미 등록 틀 `helper/install/host-manifest.json`, Then `allowed_origins`는 기존 확장과 새 확장 두 개뿐이다(`*` 없음)
- AC-3601.3: Given 도우미를 켠 origin이 새 확장일 때, Then `closing.codes`·`closing.day`만 처리하고 다른 명령(hello 포함)은 E-HELPER-UNKNOWN-COMMAND다. 기존 확장 origin이면 지금 명령은 그대로이고 `closing.*`는 E-HELPER-UNKNOWN-COMMAND다. 두 origin이 아니면 지금처럼 켜지자마자 끝난다
- AC-3601.4: Given `commands.json`, Then 새 명령 둘은 `erp.commands` 구역에만 있고 `patient: false`이며 args 모양은 design.md 2절 그대로다. 웹·기존 확장이 읽는 `commands` 구역은 바뀌지 않는다
- AC-3601.5: Given 새 확장 코드(`extension-erp/src/*.ts`, 시험 파일 제외), Then `fetch`·`XMLHttpRequest`·`WebSocket`·`console`·`localStorage`·`sessionStorage`가 없다. 저장하는 것은 설정(`chrome.storage.local`)뿐이고 도우미 답은 저장하지 않는다

### REQ-3602: 코드 목록 `closing.codes`
- AC-3602.1: Given 등록된 병원 PC, When `closing.codes {}`, Then 답은 `{ codes: [{ code, name, visits }], kinds: [{ kind, name }] }`다. codes = 어제까지 365일 동안 이 병원 외래 진료에 나온 처방 코드(앞뒤 공백 없이 대문자)·비트 코드표 이름(없으면 null)·나온 진료 수, 진료 수가 많은 차례로 2,000개까지. kinds = 비트 예약 메모 목록(번호·이름)
- AC-3602.2: Given 코드 이름·메모 이름에 줄바꿈·제어 문자·짝 없는 대리쌍이 있으면, Then 그 글자를 지운 이름이다(`revenue.days` 코드 이름 규칙)

### REQ-3603: `closing.day` — 환자 수
- AC-3603.1: Given args `{ date, groups: [{ key, codes }] }`(key는 design.md 2절 19개 가운데 하나, codes 1~20개), Then 답은 design.md 2절 모양이다. 같은 key가 두 번이면 E-HELPER-BAD-MESSAGE. 코드는 앞뒤 공백을 떼고 대문자로 견준다
- AC-3603.2: Given 가짜 비트 자료, Then `patients`는 이미 정한 것 3 그대로다(진찰구분 1·3·0·4, 물리치료내원 코드를 받은 재진·산정안함 환자, 한 사람이 그날 두 번 왔으면 1 → 3 → 재진 → 0 차례로 앞선 하나로 센다, `ptVisit` 묶음이 없으면 `ptVisit`은 null이고 빼지 않는다)
- AC-3603.3: Given 묶음마다, Then `groups[]`의 `patients`(서로 다른 환자 수)와 `new`·`first90`·`return`(3분류)이 맞다. 묶음 코드를 받은 환자가 없으면 모두 0이다
- AC-3603.4: Given 그날 환자들, Then `ages`는 '0'·'10'·…·'90' 10줄이고 줄마다 3분류 수다(만 나이, 100세 이상은 '90'). 생년월일이 없거나 틀린 환자는 넣지 않고 `warnings.unknownAge`에 센다

### REQ-3604: `closing.day` — 금액과 경고
- AC-3604.1: Given 그날, Then `money`의 total·insurer·noncovered·receivableIn은 `revenue.days` 그날 값과 같고, cash·card·transfer는 정상수납 + 미수입금의 현금·카드·계좌, received = 셋의 합이다. `revenue.days`가 unconfirmed인 날은 이 여덟 칸이 비트 수납 줄(정상수납·미수입금)을 확정 검사 없이 그대로 더한 값이고 `warnings.moneyUnconfirmed`가 true, splitUnconfirmed인 날은 insurer·noncovered가 같은 방식의 값이고 `warnings.splitUnconfirmed`가 true다
- AC-3604.2: Given 그날 수납 줄, Then `money.unpaidNew`(COO)·`discount`(할인 줄)·`disabledFund`(OrpRcvBil)·`refund`(TPR, 양수)는 수납일 기준 합이고 없으면 0이다
- AC-3604.3: Given 묶음 환자들의 그날 진료, Then `groups[].total`은 진료마다 마지막 수납 줄 총진료비의 합이다. 수납 줄이 없는 진료는 0으로 더하고 그 수를 `groups[].unpaidVisits`와 `warnings.unpaidVisits`(그날 전체)에 센다
- AC-3604.4: Given 그날, Then `inpatientVisits`는 외래가 아닌 접수 수다(이 의원은 늘 0)

### REQ-3605: `closing.day` — 예약·주사
- AC-3605.1: Given 그날 비트 예약, Then `reservations.kinds`는 예약 메모 번호마다 `total`(모두)·`visited`(살아 있고 이어진 접수가 진료 끝남)·`changed`(바꾼 기록 있음)·`canceled`(취소)이고 `reservations.patients`는 그날 예약이 있는 서로 다른 환자 수다
- AC-3605.2: Given `injection` 묶음이 있을 때, Then `injection`은 `{ firstTime, newPatients, newLines }`(이미 정한 것 6)다. 없으면 null. 옛 자료가 따로 있는 DB(`revenue.days`의 HistoryGuard ≠ 0)면 firstTime은 null이고 `warnings.noHistory`가 true다

### REQ-3606: 도우미가 지키는 것
- AC-3606.1: Given 새 문장, Then 모두 SELECT 하나이고 `ReadOnlyGuard`가 받는 표에 매개변수와 함께 있다. 표 밖 문장·틀린 매개변수는 DB에 닿기 전에 E-BIT-READ-FAILED다
- AC-3606.2: Given 새 문장, Then 이름·전화·주민번호·주소·메모 칸을 읽지 않고, 차트번호·생년월일을 결과 칸으로 내지 않는다(그날 안에서만 쓰는 번호·만 나이로 바꿔 낸다). 두 명령의 답에는 design.md 2절의 칸만 있다
- AC-3606.3: Given 두 명령이 성공·실패할 때, Then 진단 기록에는 시각·명령 이름·오류 번호만 남는다. 등록되지 않은 PC는 `revenue.days`와 같은 번호로 막힌다

### REQ-3607: 설정 화면
- AC-3607.1: Given 확장 설정 화면, Then design.md 3절 차례로 항목 줄(이름 · 고른 코드 조각과 [×] · 찾기 칸)이 있다. 찾기에 글자를 넣으면 코드나 이름에 그 글자가 든 코드(대소문자 무시)가 visits 차례로 30개까지 나오고, 누르면 더해진다(항목마다 20개까지, 같은 코드 두 번 없음)
- AC-3607.2: Given 기타1~4 줄, Then 이름 칸(1~20자)이 있다. 예약 6줄(주사·경과·도수·충격파·진료예약·기타)은 예약 메모 목록에서 여러 개 고른다
- AC-3607.3: Given 저장된 설정이 없을 때, Then 처음 값(이미 정한 것 7)이 들어 있다. [저장]은 `chrome.storage.local`의 `erpClosing` 한 열쇠에 design.md 3절 모양으로 쓴다. [처음 값으로]는 화면만 처음 값으로 바꾼다
- AC-3607.4: Given 도우미를 부르지 못했을 때, Then '도우미에서 코드 목록을 받지 못했어요 ({번호})'가 보이고 고른 코드는 그대로 보이며 저장할 수 있다. 목록에 없는 고른 코드 옆에는 '(최근 1년 처방 없음)'이 붙는다
- AC-3607.5: Given 저장된 설정, Then `closing.day`의 groups는 코드가 있는 항목만 design.md 2절 차례로 담는다

### REQ-3608: 칸 찾기·채우기
- AC-3608.1: Given ERP 화면 본보기(조사 파일 3·4절 구조의 시험용 HTML), Then 업무일지 1 칸은 구역 제목(`h4.closing-panel-title`) + 줄 첫 칸 글자 + 그 줄 `input`, 업무일지 2 표 칸은 묶음 제목(`h3.cdf-section-title`) + 줄 이름(`td.rowlabel`) + 열 머리(`thead th`) 순서, 낱칸은 `div.cdf-field > label` 글자로 찾는다. 글자는 앞뒤 공백과 '자동'·'업로드 시 생략 가능' 표시를 떼고 견준다. 못 찾은 칸은 그 칸만 건너뛰고 '못 찾은 칸'에 적는다(입력칸이 없는 '치료사별 입력' 줄 포함)
- AC-3608.2: Given 칸 하나, Then 숫자·글 칸은 기본 value 설정 함수로 쉼표 없는 정수 글자를 넣고 `input` 이벤트(bubbles)를 쏜다. 금액칸(`input.money-input`)은 '' 넣고 input → 숫자 넣고 input → `blur` 차례다
- AC-3608.3: Given 도우미 답과 설정, Then design.md 4절 칸 표 그대로 채운다(업무일지 1 최대 32칸, 업무일지 2 최대 99칸, 도수·충격파 총금액 = 치료별 매출 도수·충격파 값, 예약 줄 = 고른 메모 번호 합, 입원 4칸 = 0은 `inpatientVisits`가 0일 때만)
- AC-3608.4: Given 값이 null이거나 코드를 고르지 않은 항목이면, Then 그 칸을 건드리지 않는다. 이미 정한 것 8의 칸, `select`·`textarea`, 기본단가 칸과 탭 단추 밖의 모든 단추(저장·중간저장·이 항목만 저장·초기화·삭제·재계산·기본단가 저장·이벤트 추가)는 바꾸거나 누르지 않는다
- AC-3608.5: Given 업무일지 1 칸이 없을 때(2 탭), Then `#closing-tab-w1`을 눌러 칸이 생기길 2초까지 기다려 채우고 처음 탭으로 돌아간다. 업무일지 2 칸은 숨어 있어도 채운다. `fieldset[disabled]` 안 칸뿐이면 아무것도 바꾸지 않는다

### REQ-3609: 단추·도우미 통로·결과 안내
- AC-3609.1: Given ERP 화면, Then 주소가 `/h/closing`이고 '마감 일자'가 있을 때만 오른쪽 아래에 [비트 값 채우기]가 있다. 화면 안 이동(주소만 바뀜)으로 떠나면 사라지고 돌아오면 다시 생긴다
- AC-3609.2: When 단추를 누르면, Then 마감 일자(날짜 칸 yyyy-MM-dd 또는 'YYYY-MM-DD (오늘)' 글자)를 읽는다. 없으면 '마감 일자를 먼저 골라 주세요.', 설정을 저장한 적이 없으면 설정 화면을 열고 '처음 한 번 설정 화면에서 코드를 확인하고 [저장]을 눌러 주세요.', 아니면 '비트에서 읽는 중…'(단추 막힘)으로 `closing.day`를 부른다
- AC-3609.3: Given 답이 왔을 때 마감 일자가 누를 때와 다르면, Then 채우지 않고 '읽는 동안 마감 일자가 바뀌어 채우지 않았어요. 다시 눌러 주세요.'다
- AC-3609.4: Given 채운 뒤, Then 안내에 '{날짜} 비트 값으로 {N}칸을 채웠어요. 저장은 하지 않았어요.', 못 찾은 칸 목록, 고르지 않아 건너뛴 칸 수, design.md 5절 경고 줄, [설정 열기]가 있다
- AC-3609.5: Given 도우미가 없거나 옛 판이라 연결이 거절되면 '도우미를 새 판으로 설치해 주세요.', 도우미 오류 번호면 '비트에서 읽지 못했어요 ({번호})', 120초 안에 답이 없으면 '도우미가 답하지 않아요. 잠시 뒤 다시 눌러 주세요.'이고 어느 칸도 바꾸지 않는다
- AC-3609.6: Given 확장 서비스 워커, Then 같은 확장(내용 스크립트·설정 화면)이 보낸 `closing.codes`·`closing.day`만 받고, 요청마다 도우미 연결을 하나 열어 `{ v: 1, id, cmd, args }`를 보내고 result·error 하나를 받으면 닫는다

### REQ-3610: 도우미 판과 확인
- AC-3610.1: Given 도우미를 새로 내보낼 때, Then `helper/Directory.Build.props` Version과 `LATEST_HELPER`를 같은 커밋에서 사용자가 정한 번호로 올린다(지금 0.5.1, `MIN_HELPER`는 그대로)
- AC-3610.2: (확인, 시험 아님) Given 이 PC에서 의원 비트 DB를 읽기 전용으로, When 2026-11-09 `closing.day`(처음 값 설정)를 돌리면, Then money.total = 그날 `revenue.days` total(11,668,530원 근처), 신환 7, 90일초진 10, 씨암 25 · SONO 28 · 도수 6 · 충격파 2 · 관절조영 1 · 크라이오 7 · 물리치료 35명이고 묶음 total은 그날 total보다 크지 않다. 재진은 이번에 산정안함·물리치료내원을 빼므로 67보다 작을 수 있고 재진 + 물리치료내원 + 산정안함이 67 근처다. 다르면 까닭을 `notes/check-2026-11-09.md`에 숫자만 적고 사용자에게 알린다
- AC-3610.3: (사용자와 함께, 시험 아님) Given 새 도우미·새 확장을 깐 크롬, When ERP 2026-11-09 마감일지에서 단추를 누르면, Then 칸이 채워지고 금액칸이 쉼표와 함께 맞게 보이며 다른 칸으로 옮겨도 값이 남는다(React 값). 저장 여부는 사용자가 정한다

## 범위 밖
- 기존 확장 `extension/`, 웹 화면·`commands.json` `commands` 구역, ERP 서버, 비트 설정(신환경로 목록 등)은 바꾸지 않는다
- 확장 웹스토어 등록, 자동으로 매일 채우기, 저장 단추 누르기, 의사랑 자료가 있는 병원

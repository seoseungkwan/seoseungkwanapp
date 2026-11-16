# 요구사항: 수납일지·통계 원장님별 표

> 기능 ID: `sunap-doctors` · 형식: `### REQ-5001: 제목` 아래 `- AC-5001.1: Given/When/Then`. 시험 이름에 AC ID를 넣는다.
> 번호: REQ-5001~5004(앞 명세 최대 REQ-4907과 겹치지 않음).
> **MVP 모드**(사용자 규칙: 최소안·검토는 마지막 한 번). 서버 표·SQL 없음. 도우미 0.9.0.

## 배경 / 목표
- 엑셀 '월말통계'의 진료실 1~4별 숫자를 웹앱에 되살린다. 우리 의원은 비트에 원장님이 한 분이라 sunap-ilji에서 뺐지만, **원장님이 여럿인 다른 병원**이 쓰게 한다(사용자 2026-11-17 "다른 병원에서는 의사 많으니까 쓰게 하고 싶어").
- 승인 시안: `docs/mockups/sunap-ilji/index.html`의 `doctorPanel`(?s=open·closed·stats). 사용자 2026-11-17 "시안 그대로". 시안과 다른 곳은 design.md '시안과 다른 곳'.

## 이미 정한 것 (다시 묻지 않는다)
1. 칸 = 시안 그대로: 원장님 · 내원 · 초진 · 90일초진 · Block · 물리치료 · 초진+Block · 90일+Block · 재진+Block, 끝 줄 합계
2. 자리 = 수납일지 하루 화면(장부 아래) + 통계 '예약·전환' 칸(세 칸 아래)
3. **원장님(진료의 미지정 빼고)이 두 분 이상일 때만** 보인다. 한 분 이하면 표 자리가 아예 없다
4. 원장님별 예약률은 넣지 않는다(서버에 원장님별 숫자를 두지 않음 → SQL 없음)
5. 수납일지 하루 표는 장부 값(직원이 고친 Block·물리치료 포함), 통계 표는 비트에서 바로(sunap-ilji 결정 5와 같음)

## 요구사항

### REQ-5001: 원장님별 셈 규칙과 표 부품
- AC-5001.1: Given `ledgerDoctors(ledger, names)`, When 장부 줄마다 `doctor`가 있으면, Then 원장님마다 visits·first_n·d90_n·ret_n·block_n·pt_n·first_block·d90_block·ret_block을 장부 값(구분 `kind`, 고친 값이 든 `block`·`pt`)으로 세고, `total`은 줄들의 합이며 `dayTotals`의 같은 아홉 칸과 같다
- AC-5001.2: Given 같은 함수, When `doctor`가 null이 아닌 원장님이 한 분 이하면(모든 줄이 null인 옛 도우미 답 포함), Then null이다. 두 분 이상이면 null 원장님은 '진료의 미지정' 줄로 함께 나온다
- AC-5001.3: Given 줄 이름, When 원장님 이름이 있으면 그 이름, 없으면 코드, null이면 '진료의 미지정'이다. 줄 차례는 내원 많은 차례, 같으면 이름 글자 차례다
- AC-5001.4: Given `sunapDoctors({from, to, days, rows, block, pt, visits, doctors})`(통계 Worker 자료), When 환자·날마다, Then 그날 그 환자 접수 줄들의 진료의 코드 중 가장 작은 것(null 빼고, 없으면 null)이 그 원장님이고 셈은 `sunapRates`와 같은 규칙이다. `total`은 같은 입력의 `sunapRates`와 같고, 한 분 이하면 null이다
- AC-5001.5: Given `<DoctorTable data hint />`, When 그리면, Then 제목 '원장님별'과 hint, 머리 '원장님·내원·초진·90일초진·Block·물리치료·초진+Block·90일+Block·재진+Block', 줄마다 수와 비율, 끝 줄 '합계'가 있다. 비율 분모: 초진·90일초진·Block·물리치료 = 내원, 초진+Block = 초진, 90일+Block = 90일초진, 재진+Block = Block. 분모가 0이면 '–'(`sunapPct`와 같은 글자)
- AC-5001.6: Given `src/lib/sunap/**`·`src/lib/analytics/sunapRates.ts`, When 소스를 보면, Then 환자 자료 구역 울타리(eslint·guardrails)를 그대로 지난다

### REQ-5002: 도우미 0.9.0 — 장부 줄에 원장님
- AC-5002.1: Given `contact.targets {kind:'sunap'}`, When 부르면, Then 답의 `v`는 2이고 `rows` 줄마다 끝에 진료의 코드 한 칸(그날 센 그 환자 내원들의 `OcmDtrCod` 중 빈 값 뺀 가장 작은 것, 없으면 null)이 더해진다
- AC-5002.2: Given 같은 답, When `rows`에 코드가 있으면, Then 맨 위 `doctors`에 `[코드, 이름|null]`이 코드마다 한 번 있고 이름은 통계 원장님 이름과 같은 규칙(UidMst 가장 늦은 줄, 앞뒤 빈칸 빼고 40자까지, 없으면 null)이다
- AC-5002.3: Given 버전, When 보면, Then 도우미 `<Version>`과 `LATEST_HELPER`가 0.9.0이고 `MIN_HELPER`·`SUNAP_HELPER`는 그대로다

### REQ-5003: 수납일지 하루 화면
- AC-5003.1: Given 수납일지 Worker, When 도우미 답이 `v:1`이면 줄마다 `doctor` null·`doctors` 빈 목록으로, `v:2`면 그 값으로 장부를 만든다. `v:2`에서 코드가 `doctors`에 없거나 40자를 넘거나 `doctors` 모양이 틀리면 `E-BRIDGE-BAD-REPLY`다
- AC-5003.2: Given Worker의 `ledger` 메시지, When 장부를 보내면(처음·고침·마감·풀기), Then `doctors` = `ledgerDoctors(장부)`가 함께 간다. Block·물리치료를 고치면 원장님별 수도 바뀐다
- AC-5003.3: Given 수납일지 화면, When `doctors`가 null이 아니면, Then 장부 아래·지출/미수 입금 위에 `DoctorTable`(hint '엑셀 진료실 1~4 자리 · 접수할 때 정한 진료의 기준')이 보이고, null이면 없다. 도우미 없는 기기 화면(`RemoteView`)에는 없다

### REQ-5004: 통계 '예약·전환' 칸
- AC-5004.1: Given 통계 Worker, When 묶음(sunap)을 실어 물으면, Then 답에 `sunapDoctors` = `sunapDoctors(같은 기간·같은 접수 줄·처방 줄·묶음, 접수 줄 visits·진료의 이름)`가 함께 실린다(null이면 null). 묶음 없이 물으면 열쇠가 없다
- AC-5004.2: Given 통계 '예약·전환' 칸, When `sunapDoctors`가 null이 아니면, Then 세 칸 아래에 `DoctorTable`(hint '비트에서 바로 · 수납일지에서 고친 체크는 안 들어가요')이 보이고, null이거나 없으면 없다

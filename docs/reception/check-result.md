# 의원 PC 확인 결과 (접수 현황 폰 화면)

비트확인2.zip(빌드 0.3.0, 커밋 fef1464)을 총괄 PC에서 돌린 결과. 보고서 원문은 채팅으로 받았고, 여기에는 판단에 쓰는 줄만 옮긴다. 환자 이름·차트번호·메모 글은 보고서에 없다.

## 1회차 — 2026-11-06 07:19 KST (진료 전)

상황: 진료 전. 비트 화면에 예약 대기 7명, 진료 대기 1명(사용자가 넣은 시험 접수, 07:20, 메모 글 있음). 시험 접수는 2/7 단계가 지난 뒤에 들어가서 2/7 목록에는 없고, 뒤 단계(모양·처방 수)에만 잡혔다.

### 상태 코드 (OcmInf.OcmComStt)

| 코드 | 오늘 건수 | 비트 화면 | 칸 | 근거 |
|---|---|---|---|---|
| WR | 7 | 예약 대기 (09:00 11:00 15:00 16:30 17:00 18:00 18:30) | 숨김 | `statusPair status=WR rsu=? visits=7`, RsvInf rows=7, 비트 예약 대기 [7명] |
| WN | 1 | 진료 대기 (시험 접수 07:20) | 진료대기 | `shape OcmInf.OcmComStt values=WN,WR`, `rxByStatus status=WN visits=1 withRx=0` |

- 오늘 줄 8개 모두 OcmRsuYon 비어 있음(`rsu=?`, shape nonEmpty=0).
- 주의: WN은 기존 `KnownDoneCodes`(HN PN TN VN OE WN OB)와 통계·매출 조건에 들어 있다. 이 목록은 "끝난 진료"가 아니라 "센다고 보는 내원" 목록으로 읽어야 한다. 접수 현황에서 칸을 나눌 때는 이 목록을 쓰지 않는다(ReceptionMap 설명과 같음).
- 아직 모름: 진료보류, 수납대기, 수납완료, 접수 취소 코드. → 진료 시간 2회차에서 확인.

### 칸

| 쓰임 | 칸 | 근거 |
|---|---|---|
| 접수 메모 | OcmInf.OcmRefCmt | 5/7에 친 메모 글이 이 칸 한 줄에서만 찾아짐(`containing=1`), 다른 칸은 모두 0 |
| 이름 | PbsInf.PbsPatNam | 칸 목록·모양(8줄 모두 있음) |
| 생년월일 | PbsInf.PbsBirDte | yyyyMMdd, date8=100 |
| 성별 | PbsInf.PbsSexTyp | 값 F, M |
| 접수 시각 | OcmInf.OcmAcpDtm | char(12) yyyyMMddHHmm |
| 주민번호 | PbsInf.PbsResNum | 길이 13인데 숫자 13자리가 아님(digits13=0) → 일부가 가려져 저장된 것으로 보임. 나이는 생년월일로 계산 |
| 수납 시각 (후보) | OrcInf.OrcUpdDtm / OrcAccDte | 오늘 수납이 아직 없어 0줄. 2회차에서 확인 |
| 증상 (후보) | EmrInf.EmrCCVal(주 호소) / EmrPIVal | 오늘 진료가 없어 0줄. 화면 83 로그인 없이 SQL로 읽을 수 있는지 확인 필요 |

### 비트 로그인 (4/7)

- 사용자가 0으로 건너뜀. 사용자 말: 비트에는 원래 아이디·비밀번호가 없다(평소 자동 로그인).
- 앞선 실행에서 엔터를 누르면 왼쪽 위 화면 밖에 걸친 작은 창이 그대로 있었고, 검은 창이 1분 넘게 멈춰 있었다(가운데로 옮기기가 안 됨).
- 그래서 증상은 화면 83 대신 SQL 칸(위 후보)을 먼저 본다.

### 속도 (ms)

Gate 42 · TodayVisits 7 (8줄) · TodayRx 29 · PriorVisits 117 · PriorRx 76 · RxNames 1574 (546,073줄) · HistoryCount 14 · HistoryPage 56 · 전체 72초(사람이 답하는 시간 포함).
→ 오늘·지난 내원 읽기는 5초 간격에 충분히 빠르다. RxNames는 한 번만 읽어 두어야 한다.

## 2회차 — 2026-11-06 09:00 KST (진료 시간)

비트확인3.zip(빌드 0.3.0, 커밋 88443a6)을 총괄 PC에서 돌림. 전체 86초(사람이 답하는 시간 포함). 4/8 로그인·이름 단계는 건너뜀.

### 상태 코드 (OcmInf.OcmComStt)

| 코드 | 처음(2/8) | 끝(rxByStatus) | 사람 답 | 칸 | 근거 |
|---|---|---|---|---|---|
| WR | 6 | 6 | 6 모름 | 숨김 | 1회차에서 예약으로 확인 |
| WN | 2 | 2 | 1 진료대기 | 진료대기 | 1회차와 같음 |
| CN | 1 | 1 | 3 수납대기 | 수납대기 | 사람 답. KnownDoneCodes에 없음(진료는 끝났고 수납 전이라 통계에 아직 안 들어가는 것과 맞음) |
| TN | 1 | 0 | 3 수납대기 | 수납대기 | 사람 답 |
| PN | 없음 | 1 (withRx=1) | 묻지 못함 | 수납완료 (추정) | 실행 도중 TN 1건이 사라지고 PN 1건이 생김. 오늘 OrcInf(수납) 1줄. PN은 KnownDoneCodes에 있음 |

- 아직 모름: 진료보류, 접수 취소 코드(이번에도 그 상태 환자가 없었음). 모르는 코드는 명세(REQ-1410) 규칙대로 다룬다.
- OcmRsuYon은 오늘 10줄 모두 비어 있음 → 수납 표시로 쓸 수 없다. 수납완료는 상태 코드(PN)와 OrcInf로 본다.

### 칸

| 쓰임 | 칸 | 근거 |
|---|---|---|
| 접수 메모 | OcmInf.OcmRefCmt | 2회차에도 이 칸만 `containing=1` |
| 수납 시각 | OrcInf.OrcUpdDtm | char(12) yyyyMMddHHmm, 오늘 수납 1줄. 내원과는 OrcInf.OrcOcmNum으로 이어짐. OrcAccDte는 날짜(8자)뿐 |
| 증상 | EmrInf.EmrShtVal | 친 증상 글이 이 칸 한 줄에서만 찾아짐(`containing=1`, 지난 14일 8,652줄 중 5,891줄이 차 있음, 길이 2~72자). EmrCCVal·EmrPIVal은 14일 동안 모두 비어 있음. 다만 EmrShtVal에는 여러 기록지 값이 함께 들어가고(EmrShtTyp·EmrShtCod로 나뉨) 어느 코드가 증상인지는 아직 모름 |

### 속도 (ms)

Gate 47 · TodayVisits 8 (10줄) · TodayRx 29 · PriorVisits 54 · PriorRx 7 · RxNames 1544 (546,073줄) · HistoryCount 0 · HistoryPage 1.
→ 1회차와 같이 5초 간격에 충분하다.

## 3회차 — 2026-11-06 09:40 KST (진료 시간)

비트확인4.zip(build=0.3.0+check4, 커밋 ccf0a02). 전체 165초. 이번에는 2/10에서 WN 말고 모두 6(모름)으로 답했고, 6/10 증상 글은 건너뜀.

### 지난 30일 상태 내력 (`statusHistory`)

| 코드 | 30일 내원 | 수납 있음 | 처방 있음 | 읽은 뜻 → 칸 |
|---|---|---|---|---|
| PN | 2029 | 2029 | 2029 | 수납완료 → 끝남 (확정) |
| TN | 1 | 0 | 1 | 진료 끝, 수납 전 → 수납대기 (2회차에 TN→PN 바뀜과 맞음) |
| HN | 1 | 0 | 1 | 진료보류 → 진료보류 (오늘 처음 보임, KnownDoneCodes에 있음) |
| WN | 4 | 0 | 0 | 진료대기 → 진료대기 |
| CN | 54 | 0 | 0 | 접수 취소 → 숨김. 처방·수납이 한 번도 없음. 2회차의 CN 1건은 07:20 시험 접수를 취소한 것이었다. 2회차 "수납대기" 답은 잘못 고른 것으로 본다 |
| CR | 39 | 0 | 0 | 예약 취소 → 숨김 (WR이 예약이므로 R은 예약 쪽) |
| WR | 5 | 0 | 0 | 예약 → 숨김 |

→ 2회차 표(CN·TN=수납대기)를 고친다: TN만 수납대기, CN·CR은 숨김, HN은 진료보류.

### 증상

- `sheetCode typ=S cod=? rows=8701 nonEmpty=5925 minLength=2 maxLength=72` — 지난 14일 EmrInf 줄이 모두 기록지 종류 S 하나이고 코드 칸은 비어 있다. 내원 하나에 줄 약 9개(비어 있지 않은 줄 약 6개), 한 줄 2~72자 → 진료 기록 S(환자가 말한 증상) 부분의 줄들로 보인다.
- 그래서 증상 글 = 그 내원의 EmrInf에서 EmrShtTyp='S'이고 비어 있지 않은 EmrShtVal 줄들을 순서대로 이은 것. 2회차에서 친 증상 글도 이 칸에서 찾아졌다.

### 속도 (ms)

Gate 43 · TodayVisits 2 (21줄) · TodayRx 3 · PriorVisits 27 · PriorRx 9 · RxNames 1633 · HistoryCount 8 · HistoryPage 57. 오늘 수납 OrcInf 9줄.

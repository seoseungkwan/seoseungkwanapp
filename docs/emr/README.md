# 다른 EMR(의사랑·이지스) 붙이기 준비 — 조사 문서

> 2026-11-19 · 갈래 `feat-emr-choice` · 아직 만드는 문서가 아니라 **원격으로 의사랑·이지스 PC를 볼 때 무엇을 찾을지** 적은 준비물이다.
> 의사랑·이지스 속 구조는 아직 하나도 확인하지 않았다. 아래에서 그 둘에 대한 말은 모두 "확인할 것"이지 사실이 아니다.
> 환자 값(이름·차트번호·전화 등)은 이 문서와 확인 메모 어디에도 적지 않는다. 칸 **이름**과 표 **이름**만 적는다.

## 1. 한 줄 요약과 지금 비트 연결

**한 줄 요약:** 웹앱 화면·계산은 "정해 둔 모양"만 알기 때문에, 의사랑·이지스에서 같은 모양을 채워 주는 **읽기 부품 하나만** 새로 만들면 된다. 가장 쉬운 길은 그 EMR이 내보내는 파일(또는 PC 폴더 안 파일)을 브라우저가 읽는 것이고, 가장 많이 되는 길은 도우미가 그 EMR DB를 읽는 것이다.

지금 비트 자료가 오는 길은 두 가지다.

```
[도우미 길]  비트 DB(의원 PC, SQL Server) ─읽기만→ 도우미(helper/, C# .NET 4.8)
             → 크롬 확장(extension/, 권한은 nativeMessaging 하나, 명령 이름만 보고 넘김)
             → src/lib/bridge (정해 둔 확장 ID로만 말함, 받은 조각을 바로 Worker로)
             → Web Worker(src/workers/*) 안에서 계산 → 화면
[파일 길]    사용자가 고른 비트 내보내기 파일 → src/workers/runAnalysis.ts(바이트만, 파일 이름은 안 넘김)
             → analyze.worker.ts → src/lib/parsers/bit → 공통 모양 → 계산 → 화면
```

- **환자 자료는 의원 PC 밖으로 나가지 않는다**(CLAUDE.md CRITICAL). 서버·AI에는 집계 숫자만 간다. 새 EMR도 이 규칙 그대로다.
- 도우미의 지킴 장치(새 EMR에도 같은 수준이 필요):
  - 읽기만: `Bit/ReadOnlyGuard.cs`가 허용 목록의 SQL 글자와 정해 둔 매개변수만 통과시키고, `Precheck.Windows/SqlBitDb.cs`는 되돌리는 트랜잭션 안에서 읽는다(Commit 없음).
  - 이 PC나 사설 IP의 DB 서버만: `Bit/PrivateServer.cs`.
  - 우리 의원 것인지 매번 확인: `Registration/HospitalGate.cs` → `Bit/HospitalCheck.cs`(병원 범위 하나뿐 + 요양기관기호 8자리가 등록한 값과 같음).
  - DB 접속 정보는 우리가 갖지 않고 **비트 자신의 DLL**(`BITDataBaseCommon`)에서 받는다(`Precheck.Windows/ReadOnlyConnection.cs`). 설치 위치는 `C:\DrBIT50` 하나만 받는다(`Bit/BitInstallRules.cs`).

## 2. 탭별로 EMR에서 받는 자료

명령 목록과 칸 검사는 `src/lib/bridge/commands.json`, 웹 쪽 타입은 `src/types/bridge.ts`에 있다. "필요도"는 그 기능이 돌려면 꼭 있어야 하는지(필수) 없어도 줄여서 돌 수 있는지(있으면 좋음)다.

| 탭·기능 | 도우미 명령 / 파일 | 받는 자료(쉬운 말) | 비트에서 있는 표·칸 | 필요도 |
|---|---|---|---|---|
| 비트 PC 연결(준비) | `bit.check`, `bit.register` | 설치 위치, DB 접속, 로그인한 사용자의 병원 범위, 요양기관기호 | 설치 `C:\DrBIT50` + `DrBIT50Environment.ini`, `UidMst`, `DepMst.DepHspNum`, `HspMst.HspInsNum` | 필수 |
| 통계(파일 넣기) | 파일 '환자별 소모 통계'(`src/lib/parsers/bit`) | 처방코드·처방명칭·처방일자·차트번호·신환/재진 구분·주소(시·구·동까지), 유형·외래/입원 | 내보내기 파일의 칸 이름(`parsers/bit/columnMap.ts`의 `ALLOWED` 8칸) | 필수(유형·외래/입원은 있으면 좋음) |
| 통계(비트에서 불러오기)·대시보드 | `stats.rows` | 진료 줄(차트번호·진료일·처방코드·첫 내원일), 접수 줄(그날 접수 수·90일초진 수·신환 표시 수), 처방 이름 | `OcmInf`(`OcmChtNum`·`OcmAcpDtm`·`OcmPatTyp`·`OcmComStt`·`OcmRsuYon`·`OcmDgsNfs`), `OdrInf`(`OdrCod`·`OdrDelFlg`·`OdrCanYon`·`OdrOutCod`), `SeeMst`(`SeeOdrCod`·`SeeKorNam`) | 필수(90일초진·신환 표시는 있으면 좋음 — 없으면 첫 내원일로 신환을 정함) |
| 통계 보고 숫자(일일·월말) | `stats.rows`의 `report` | 총환·신환, 총진료비·공단·비급여·현금·카드·계좌, 치료 건수(도수·체외충격파 등), LA 코드 수 | `OrpInf`(`OrpTotAmt`·`OrpCorAmt`·`OrpNonAmt`), `OrcInf`(`OrcNewAmt`·`OrcCrdAmt`·`OrcChkAmt`·`OrcCod`), `IrcInf`, `InsMst`, `DtlMst` | 있으면 좋음 |
| 통계 더 보기(시간대·보험·원장님·나이·동네) | `stats.rows`의 `visits`·`people`·`doctors`·`doctorDays`·`pays` | 접수 시각, 보험 이름, 진료의, 생년월일, 주소 앞부분, 원장님 이름, 날·원장님별 금액, 환자·날 금액 | `OcmAcpDtm`(9~12번째 글자), `InsMst.InsCodNam`, `OcmDtrCod`, `PbsInf.PbsBirDte`·`PbsDtlAdr`, `UidMst.UidNam`, `OrpDtrCod`·`OrpAccDte` | 있으면 좋음 |
| 매출(통계 탭 안)·업무일지 자동 채우기 | `revenue.days`(숫자만, 환자 줄 없음) | 날마다 내원·신환·재진, 총진료비·공단·비급여·급여 본인부담·현금·카드·계좌·미수입금, 처방 코드별 건수·금액 | `OrpInf`(`OrpTotAmt`·`OrpCorAmt`·`OrpNonAmt`·`OrpInsAmt`·`OrpInsOwn`·`OrpAccDte`·`OrpRcpStt`), `OrcInf`, `IrcInf`, `OdrInf`(`OdrQty`·`OdrDtrQty`·`OdrPrc`·`OdrDay`·`OdrDtm`) | 필수(금액 나눔은 있으면 좋음) |
| 수납일지 | `contact.targets` kind `sunap` | 환자·이름·첫 접수 시각·구분(신환/90일초진/재진)·현금·카드·계좌·미수·처방코드·다음 예약(시각·메모 앞 40자)·진료의·건강생활유지비, 미수 입금한 사람 | `OcmInf`, `PbsInf.PbsPatNam`, `RsvInf`(`RsvRefCmt`·`RsvSts`·`RsvDivTyp`), `OrcInf`(`OrcCod`='QCV'), `OrpInf.OrpTotOwn` | 접수·금액 필수, 예약 메모·진료의·건강생활유지비는 있으면 좋음 |
| 예약 탭 | `contact.targets` kind `calfind`·`calday` | 찾기: 차트번호·이름·성별·생일·마지막 내원일 / 하루: 온 환자, EMR 예약(차트·이름·시각) | `PbsInf`(`PbsChtNum`·`PbsPatNam`·`PbsSexTyp`·`PbsBirDte`), `OcmInf`, `RsvInf` | 찾기 필수, EMR 예약은 있으면 좋음 |
| 환자 탭 예약 명단 | `contact.targets` kind `reservation` | 이름·휴대전화·집 전화·예약 시각·상태·그날 왔는지·그 뒤 처음 온 날 | `OcmInf`(`OcmComStt` WR·NR·CR·CN), `RsvInf`, `PbsInf`(`PbsCelPhn`·`PbsPhnNum`) | 필수 |
| 환자 탭 장기 미방문 | `contact.targets` kind `lapsed` | 마지막 내원일·진료 받은 날 수·예약 있음·마지막 처방(코드·이름)·이름·전화 | `OcmInf`, `OdrInf`, `SeeMst`, `PbsInf` | 필수 |
| 환자 탭 F/U·정기 주사 | `contact.targets` kind `followup`·`injection` | 진료 기록 글(F/U 날짜 찾기), 처방코드·처방일자·전화 | **SQL이 아님**: 비트 통계 화면 83(증상)·47(처방별 환자 목록)을 숨겨 열고 표를 읽음(`Bit/StatsScreens.cs`, `Contact/ContactColumns.cs`) | 필수 |
| 청구 사전점검 | `claim.dates`, `claim.month`, `claim.memos` | 날짜별 진료 수·메모 수 / 증상 글·상병(주·부·배제)·처방(수량·급여구분) / 12개월 처방·청구메모 이력 / 상병 추세 / 처방 목록·LA 코드 | 통계 화면 83·83D·47 + `OcmInf.OcmBilCmt`, `OdrInf`, `OicInf`(`OicElcCod`·`OicIcdPri`·`OicIcdNam`), `SeeMst`(`SeeCodTyp`·`SeeCodDiv`·`SeeItmCod`) | 필수 |
| 청구 메모를 비트에 넣기 | `bit.input`(**쓰기**) | 비트 차트 화면에 메모를 넣음 | 비트 차트 화면 자동 조작(`Input/*`, `Precheck.Windows/UChartAutomation.cs`) | 있으면 좋음(가장 어려움) |

참고: `sam.latest`는 명령 표에만 있고 도우미에는 아직 처리기가 없다.

## 3. 공통 모양 — 새 EMR 읽기가 채울 곳

새 EMR 읽기는 아래 모양을 **그대로** 채우기만 하면 된다. 그러면 계산·화면·확장은 고치지 않는다.

**가. 파일 길** (`src/lib/parsers/`)
- `src/lib/parsers/common.ts`의 `readGrid` — 바이트 → 칸 표(`Grid`, `src/types/parse.ts`). xlsx·xls·속이 HTML인 xls·CSV, UTF-8·CP949를 다 읽고 **EMR을 모른다**. 새 EMR도 이것을 그대로 쓴다.
- `src/lib/parsers/<emr>/` — EMR마다 칸 이름 찾기만 새로. 본보기는 `parsers/bit/`: `header.ts`(머리 줄·기간 줄 찾기), `columnMap.ts`(허용 칸만 아는 `ALLOWED`, 신환/재진 값 `readVisit`), `parseBit.ts`(합계 줄 거르기, 주민번호 모양이 보이면 `E-PARSE-RRN`으로 멈춤).
- 채울 모양: `src/types/consumption.ts`의 `ConsumptionRow`(처방코드·이름·유형·날짜·신환 여부·외래 여부·환자 번호·동네), `ParsedFile`, `ParseResult`. 차트번호는 `PatientIds`(`parsers/bit/patientIds.ts`)로 번호만 받고 버린다.
- 입구: `src/workers/analyzeFiles.ts`가 지금 `parseBitFile`을 바로 부른다 → EMR 고르기가 들어갈 자리.

**나. 도우미 길** — 명령마다 **답 JSON이 약속**이다. 새 EMR 도우미도 같은 명령 이름으로 같은 JSON을 내면 된다.

| 명령 | 웹이 검사하는 곳·모양 | 지금 JSON을 만드는 C# |
|---|---|---|
| `stats.rows` | `src/workers/stats/helperData.ts` `parseStatsRows` → `StatsRowsData`·`StatsRowsExtra`(v5) → `toConsumptionRows`·`toPatientDays`로 `ConsumptionRow` + `PatientDay`(`src/types/analysis.ts`) | `Stats/StatsPayload.cs`, `StatsRows.cs`, `StatsReport.cs` |
| `revenue.days` | `src/lib/bridge/revenueResult.ts` `isRevenueDays` → `RevenueDaysResult`·`RevenueDayRow`(`src/types/revenue.ts`) | `Revenue/RevenueDays.cs` |
| `sunap` | `src/workers/sunap/read.ts` `readReply` → `SunapReply`(`src/types/sunap.ts`, 줄 v3 열두 칸) | `Sunap/SunapTargets.cs` |
| `calfind`·`calday` | `src/workers/calendar/read.ts` `readFound`·`readDay` → `BitPerson`·`BitGhost` | `Calendar/CalendarTargets.cs` |
| `reservation`·`lapsed` | `src/lib/patients/reservations.ts` `readReservations`, `lapsed.ts` `readLapsed` → `ReservationData`·`LapsedData`(`src/types/patients.ts`) | `Contact/ReservationTargets.cs`, `LapsedTargets.cs` |
| `followup`·`injection` | `{v, kind, from, to, chart, rx}`, 표마다 첫 줄 = 칸 이름인 글자 표 → `src/lib/patients/followup.ts` | `Contact/ContactTargets.cs`, `ContactColumns.cs` |
| `claim.month` | `ClaimMonthJson`(`src/types/precheck.ts`): `s83`·`s83d`·`s47`은 **비트 화면 칸 이름**을 열쇠로 한 `GridRow`(내원번호·차트번호·증상·상병청구코드·처방코드·급여구분·수량 등) | `Claim/ClaimMonthPayload.cs`, `Bit/GridRows.cs` |

두 길이 만나는 곳: 통계는 파일이든 도우미든 결국 `ConsumptionRow`(+ 도우미는 `PatientDay`)가 된다. 그래서 통계 탭이 새 EMR의 첫 목표로 가장 쉽다.

## 4. 폴더에서 읽는 길 (의사랑·이지스 둘 다)

사용자 생각: 의사랑·이지스 모두 PC 안 자기 폴더에 자료를 둘 것 같다. DB 길과 나란히 **처음부터 같은 무게의 길**로 둔다. 폴더 경로를 알게 되면 바로 아래 중 하나로 시작한다.

| | (가) 브라우저가 폴더를 읽음 | (나) 도우미가 정해 둔 폴더를 읽음 |
|---|---|---|
| 어떻게 | 크롬 `showDirectoryPicker()`로 사용자가 폴더를 한 번 고름 → 폴더 안 파일을 `getFile()`로 꺼냄 | 도우미가 그 PC의 정해 둔 경로(예: 설치 폴더 아래)에서 파일을 열어 읽음 |
| 설치 | 없음(웹앱만 고침) | 도우미 새 판 + PC마다 설치 |
| 클릭 | 고를 때 한 번. 크롬이 권한을 잊으면 다시 눌러야 함 | 필요 없음. 10분마다 같은 자동 읽기도 됨 |
| 읽을 수 있는 파일 | 엑셀·CSV·글자 파일처럼 브라우저가 풀 수 있는 것 | DB 파일·전용 형식·업체 DLL이 있어야 풀리는 것까지 |
| EMR이 켜져 있어 잠긴 파일 | 못 읽을 수 있음(지금도 `E-PARSE-UNREADABLE`로 알림) | "같이 읽기"로 열어 볼 수 있음(된다고 확신하지 말고 시험) |
| 환자 자료 규칙 | 지금 파일 넣기와 같음: 바이트만 Worker로, 파일 이름은 안 넘김 | 지금 도우미와 같음: 읽기만, 정해 둔 칸만, 조각으로 bridge → Worker |
| 만드는 양 | 적음 | 많음(C# + 명령 + 시험 + 판 배포) |

**(가)가 지금 코드에 끼는 자리:** 지금 파일 넣기는 `src/components/stats/SourcePicker.tsx`의 `<input type="file" multiple accept=".xlsx,.xls,.csv">` → `runAnalysis(files)`(`src/workers/runAnalysis.ts`, 50MB 넘는 파일은 거름) → `analyze.worker.ts` → `analyzeFiles.ts` → parser다. 폴더 고르기는 **입구만** 바꾼다: 고른 폴더의 파일들을 `File`로 꺼내 같은 `runAnalysis(files)`에 넣으면 뒤는 그대로다. 미리 볼 것:
- 폴더 이름·파일 이름에 환자 이름이 들어 있을 수 있으니 서버·기록·화면 밖으로 보내지 않는다(지금도 이름은 안 넘김).
- 고른 폴더를 기억하려면 브라우저 저장소(IndexedDB)에 손잡이를 둬야 한다. 환자 자료 구역은 브라우저 저장소를 못 쓰므로(ADR-020) 화면 쪽에 둘지, 매번 고르게 할지 정해야 한다.
- 크롬은 일부 시스템 폴더(예: Windows·Program Files 같은 곳)를 고르지 못하게 막을 수 있다 → EMR 폴더가 그런 곳인지 확인.
- 크롬·엣지 PC판에서만 된다(터치 기기는 해당 없음).

**어느 쪽을 먼저:** 폴더에 무엇이 있는지 보고 정한다.

| 폴더에서 본 것 | 먼저 할 길 |
|---|---|
| `.csv`·`.xls`·`.xlsx`·`.txt`처럼 엑셀·메모장으로 열리는 내보내기 파일 | (가) 브라우저 폴더 읽기 |
| 위와 같은데 EMR이 켜져 있으면 잠김, 또는 클릭 없이 자동으로 읽어야 함 | (나) 도우미 폴더 읽기 |
| `.mdf`·`.ldf`(SQL Server), `.mdb`·`.accdb`(Access), `.db`·`.sqlite`, `.dbf`, `.fdb`·`.gdb`(Firebird) 같은 DB 파일 | (나) 또는 DB 길(파일을 직접 열기보다 DB로 붙는 쪽이 안전) |
| 열면 알아볼 수 없는 글자(암호화·전용 형식) | (나) + 업체 DLL·허락 필요, 안 되면 내보내기 메뉴로 돌아감 |

## 5. 의사랑·이지스 PC에서 확인할 체크리스트

원격으로 볼 때 이 표를 채운다. **보기만 하고 아무것도 고치지 않는다.** 환자 값이 보이는 화면은 사진·복사하지 않고 칸 이름만 적는다.

> 폴더 경로를 알면 먼저 폴더 조사 도구 `scripts/emr-survey/`(쓰는 법은 그 폴더 `README.md`)를 그 PC에서 돌린다. 폴더를 읽기만 하고 파일 이름·환자 값 없이 확장자·파일 종류·칸 이름·SQL Server 서비스를 보고서 하나로 적어 주어 '나. 폴더'·'다. DB'·'라. 자료 칸 찾기'를 채우기 쉽다.

**가. 설치·버전**

| 확인할 것 | 어떻게 보나 | 의사랑 | 이지스 |
|---|---|---|---|
| 프로그램 버전 | 프로그램의 도움말 → 정보 창 | | |
| 설치 위치 | 바탕화면 아이콘 오른쪽 클릭 → 파일 위치 열기 | | |
| 이 PC가 서버인지, 다른 PC(서버 PC)에 붙는지 | 다른 진료실 PC도 같은 자료를 보는지, 설치 폴더 설정 파일의 서버 이름 | | |
| 자동 업데이트가 구조를 바꾸는지 | 업체에 물어봄 | | |

**나. 폴더(4장 길)**

| 확인할 것 | 어떻게 보나 | 의사랑 | 이지스 |
|---|---|---|---|
| 자료가 든 폴더 경로 | 설치 폴더 아래 `Data`·`DB`·`Export` 같은 이름, 업체 안내 | | |
| 파일 종류·확장자 | 탐색기 '자세히' 보기의 종류 칸(4장 표와 견줌) | | |
| 내보내기 파일인지 DB 파일인지 | 엑셀·메모장으로 읽기 전용 열기가 되는지(저장하지 않음) | | |
| EMR이 켜져 있을 때 잠기는지 | 켠 채로 읽기 전용 열기 → "다른 프로세스가 사용 중"이면 잠김 | | |
| 암호화됐는지 | 열었을 때 알아볼 수 없는 글자면 암호화·전용 형식일 수 있음 | | |
| 얼마나 자주 바뀌는지(실시간·하루 한 번) | 진료 중 '수정한 날짜'가 바로 바뀌는지 | | |
| 파일 크기 | 자세히 보기의 크기(브라우저 길은 한 파일 50MB까지) | | |
| 이름·주민번호가 들어 있는지 | 머리 줄의 **칸 이름만** 적음. 우리는 허용한 칸만 읽고 나머지는 처음부터 모른다(CLAUDE.md) | | |
| Chrome이 그 폴더를 고를 수 있는지 | 시스템 폴더 아래인지 | | |
| 업체가 그 파일 읽기를 허락하는지 | 업체 문의·계약서 | | |

**다. DB(DB 길)**

| 확인할 것 | 어떻게 보나 | 의사랑 | 이지스 |
|---|---|---|---|
| DB 종류(SQL Server·그 밖) | 서비스 목록(services.msc)에 'SQL Server (이름)'이 있는지, 설치 프로그램 목록 | | |
| DB가 이 PC·사설 IP에 있는지 | 서버 이름이 이 PC 이름·`localhost`·`192.168.x.x` 등인지(`PrivateServer` 규칙에 맞나) | | |
| 접속 정보를 어디서 얻나 | 비트처럼 업체 DLL이 주는지, 설정 파일에 있는지(비밀번호는 우리가 따로 갖지 않는 쪽이 좋다) | | |
| 읽기 전용으로 붙을 수 있나 | 업체가 읽기 전용 계정을 주는지, 되돌리는 트랜잭션으로 읽어도 되는지 | | |
| 무거운 읽기를 견디나 | 비트 DB도 무거운 SQL로 메모리 부족이 났다 → 글자 나누기 같은 일은 PC 메모리에서 | | |
| 한 DB에 여러 병원 자료가 섞일 수 있나 | 병원 범위 같은 칸이 있는지 | | |

**라. 자료 칸 찾기** — 2장 표의 '받는 자료'마다 표·칸 이름(또는 내보내기 파일 칸 이름)을 적는다.

| 자료 | 비트에서는 | 의사랑 | 이지스 |
|---|---|---|---|
| 접수: 차트번호·접수 시각·외래/입원·접수 취소·진료 끝 상태 | `OcmInf` | | |
| 신환·90일초진 구분 | `OcmInf.OcmDgsNfs`('1'·'3') | | |
| 진료의·보험 종류 | `OcmDtrCod`·`OcmInsCod` → `UidMst`·`InsMst` | | |
| 처방: 코드·날짜·수량·단가·일수·삭제/취소 표시 | `OdrInf` | | |
| 처방 목록(코드 → 이름·종류) | `SeeMst` | | |
| 상병: 코드·주/부/배제·이름 | `OicInf` | | |
| 수납: 총진료비·공단·비급여·본인부담·현금·카드·계좌·미수·환불 | `OrpInf`·`OrcInf`·`IrcInf` | | |
| 환자: 이름·성별·생일·전화·주소(시·구·동) | `PbsInf` | | |
| 예약: 시각·메모·상태 | `RsvInf` + `OcmInf.OcmComStt` | | |
| 진료 기록 글(F/U 날짜) | 통계 화면 83 | | |
| 청구메모 | `OcmInf.OcmBilCmt` | | |
| 상태 값의 뜻(접수 취소·진료 끝·예약 대기 등) | `OcmComStt` 'WN'·'HN'·'TN'·'PN'·'WR'·'NR'·'CR'·'CN' 등 | | |

**마. 요양기관기호·내보내기·허락**

| 확인할 것 | 어떻게 보나 | 의사랑 | 이지스 |
|---|---|---|---|
| 요양기관기호(8자리)가 어디 보이나 | 병원 정보·환경 설정 화면 | | |
| 그 번호가 DB·파일 어디에 있나 | 비트는 `HspMst.HspInsNum` — 우리 의원 것인지 매번 견줄 값 | | |
| 통계·자료 **파일 내보내기 메뉴**가 있나 | 통계 메뉴에서 엑셀·CSV 저장 버튼(있으면 가장 쉬운 길) | | |
| 내보내기 파일의 칸 이름과 기간 줄 모양 | 머리 줄 칸 이름만 적음 | | |
| 업체 허락·계약 | DB·파일 읽기 허용, 금지 조항, 구조가 바뀔 때 알려 주는지 | | |

## 6. 만들 때 순서 제안

1. **파일 내보내기 읽기 먼저**(설치 없음). `src/lib/parsers/<emr>/`를 `parsers/bit/`처럼 만들고 `ConsumptionRow`를 채운다. 가짜 파일은 `fixtures/`에만(실제 환자 파일은 커밋하지 않음). `analyzeFiles.ts`에 EMR 고르기를 넣는다. → 통계 탭이 먼저 된다.
2. **브라우저 폴더 읽기**(4장 가). 같은 parser에 입구만 폴더로. 뒤는 하나도 안 바뀐다.
3. **도우미 읽기**(폴더 또는 DB). 같은 명령 이름·같은 답 JSON(3장 나)을 내고 속만 바꾼다. 확장은 명령 이름만 넘기므로 새 판이 필요 없다. 쉬운 차례: `revenue.days`(숫자만) → `stats.rows` → `sunap` → `calfind`·`calday`·`reservation`·`lapsed` → `followup`·`injection`·`claim.*`(비트 화면에 기댐, 마지막) → `bit.input`(쓰기, 보류).
4. 폴더 읽기도 같은 자리에 낀다: 브라우저가 읽으면 `parsers/<emr>/ → 공통 모양`, 도우미가 읽으면 `도우미 → bridge → Worker`로 같은 JSON. 어느 쪽이든 그 아래 계산·화면은 그대로다.

**도우미에서 나눌 것(간단히)**

| 그대로 같이 쓰는 것 | EMR마다 새로 만드는 것(지금은 비트 전용) |
|---|---|
| `Protocol/*`(통로·조각 나누기·명령 표), `Store/*`(PC 안 암호화 저장), `Contact/ContactStore.cs` | SQL 글 전부: `Bit/Sql.cs`, `Stats/StatsSql.cs`, `Revenue/RevenueSql.cs`, `Sunap/SunapSql.cs`, `Calendar/CalendarSql.cs`, `Contact/ListSql.cs` |
| `ReadOnlyGuard`의 방식(허용 목록 + 매개변수 검사), `PrivateServer` | 설치 찾기: `Bit/BitInstallRules.cs`, `NativeEnvironmentFile.cs`, `Precheck.Windows/InstallationLocator.cs`·`NativeEnvironmentGuard.cs` |
| 답 JSON 쓰기와 금액 규칙(`StatsPayload`, `SunapTargets`·`RevenueDays`의 모양·원 미만 버림) | DB 접속: `Precheck.Windows/ReadOnlyConnection.cs`(비트 DLL), `SqlBitDb.cs`, 로그인 창 `VendorLogin.cs` |
| `Registration/` 저장 부분(칸은 EMR마다 조금 다름) | 병원 확인: `Bit/HospitalCheck.cs`(`DepMst`·`HspMst`) |
| `IBitDb` 모양(`Query(sql, args, timeout)`) — 이름만 일반 이름으로 | 비트 화면 읽기·쓰기: `Bit/StatsScreens.cs`·`StatsMenu.cs`·`GridReader.cs`·`GridRows.cs`, `Input/*`, `VendorGridExport.cs`, `UChartAutomation.cs` |

나누는 자리 제안: 기능마다 "줄을 읽어 오는 부품"(예: 날 금액 줄, 접수 줄)을 EMR별로 두고, 그 줄로 JSON을 쓰는 일은 공통으로 둔다. `BitServices`는 EMR 종류를 아는 묶음으로 바꾼다.

## 7. 비트에 단단히 묶인 곳(미리 알아 둘 것)

- **청구 사전점검·F/U·정기 주사는 SQL이 아니라 비트 통계 화면(83·83D·47)을 숨겨 열어 표를 읽는다.** 비트 로그인 창도 띄운다. 다른 EMR에선 같은 화면이 없으니 DB·파일에서 같은 칸을 새로 찾아야 하고, `claim.month`의 칸 이름도 비트 화면 이름이 그대로 약속이다.
- **`bit.input`은 비트 차트 화면을 자동으로 눌러 메모를 쓴다.** 유일한 쓰기다. 다른 EMR은 가장 마지막·보류.
- **치료 건수 코드가 도우미 SQL 안에 박혀 있다:** `StatsSql.TreatmentsSql`의 '도수'·`CARM1`·`SONO1`·`CRYO`·`ESWT`는 우리 의원 처방코드다. 다른 병원·다른 EMR이면 설정으로 빼야 한다.
- **비트 코드 값의 뜻에 기댄다:** 접수 상태 `OcmComStt`(WN·HN·TN·PN·WR·NR·CR·CN 등), 신환 '1'·90일초진 '3', 수납 코드 RCV·TFC·COR·COD·QCV. EMR마다 "이 값 = 이 뜻" 대응표가 필요하다.
- **설치 위치 `C:\DrBIT50` 하나, 접속 정보는 비트 DLL**에서만 — 업체 DLL이 없는 EMR은 접속 정보를 얻는 방법부터 정해야 한다.
- 명령·오류 이름이 `bit.*`·`E-BIT-*`이고 화면 글에 '비트'가 많다. 파일 넣기 안내도 "비트에서 내보낸 파일"이다. 동작에는 문제없지만 다른 EMR 화면 글은 바꿔야 한다.

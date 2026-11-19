# 비트 DB 조사: 서류 6종 일괄 인쇄 (doc-print)

조사일 2026-11-20 08시대. 비트 DB는 **읽기만** 했다. 도구는 ssk-bit-db-probe의 `bit-readonly-query.cs`로, SELECT 한 문장만 받고 READ UNCOMMITTED로 읽은 뒤 되돌린다. 비트 프로그램 파일(`C:\DrBIT50\EXE\*.dll`, 모두 .NET)에서는 글자(UTF-16 문자열)만 뽑아 SQL과 표 이름을 봤다.
여기에는 칸 이름·코드·개수만 적었다. 환자 값(이름·주민번호·차트번호·생일·연락처·진료 글)은 어디에도 옮기지 않았다.
질문은 모두 한 번에 0.5~0.8초 걸렸다. 날짜는 한 달(2026-10)이나 사흘(11-17~11-20)로 좁혔다.

확신 정도 표시:
- **확실**: DB 값이나 비트 프로그램 안 SQL로 직접 본 것.
- **추정**: 칸 이름·분포를 보고 짐작한 것.
- **모름**: 아직 근거가 없는 것.

## 0. 비트가 서류마다 쓰는 프로그램 (확실, DLL 안 글자)

| 서류 | 비트 DLL | 읽는 표(SQL에 나온 것) | 양식 |
|---|---|---|---|
| 진료비 영수증(재출력) | `BITRePrint.dll` ("접수(영수증재출력)"), 양식 `BITReceiptForm.dll`, 계산 `BITReceiptCalc.dll` | OdlInf·OrpInf·OrcInf·OcmInf·IncMst·HspMst·DepMst·InsMst·PmdInf·CashInf | 코드로 그림("2012년 신 서식 영수증", "[ ]외래 [ ]입원 … 진료비 계산서", "영수증번호(연월-일련번호)") |
| 진료비 세부내역서 | `BITPaymentPrint.dll` ("접수(진료비내역서)") | OdrInf·OcmInf·SeeMst·FpmMst·OicInf·HspMst·DepMst·InsMst·PmdInf·EmrInf | 코드로 그림 |
| 통원확인서 | `BITInOutCertifyDocument.dll` ("입통원확인서") | DocInf·TIPWCERTIFYDOC·OicInf·IcdMst·UidMst·HspMst·DepMst | 엑셀 양식 `C:\DrBIT50\XLS\통원확인서.xls`(상병 없는 판 `상병없는통원확인서.xls`) |
| 진료확인서 | `BITDiagnosisCertifyDocument.dll`·`PatientDocument.dll`·`DocumentMain.exe` | DocInf·TDIAGNOSISDOC·OcmInf·UidMst·HspMst·DepMst | 엑셀 양식 `XLS\진료확인서(병명).xls`·`진료확인서(학교제출용).xls`·`진료확인서.xls` 외 변형 6개 |
| 처방전 사본 | `BITOutSlip.dll` ("원외처방전(환자보관용)/(약국제출용)/(병원보관용)", "<사본이므로 조제불가>") | OutInf·OdrInf·OcmInf·UidMst·HspMst·DepMst·InsMst·UsgMst·PbsInf | 코드로 그림 |
| 진료기록부 | `BITPrintChart.dll` ("접수(진료기록부)", "외래진료기록부 ( Page - ", 칸 `<내원내역>`·`<원외처방>`·`<수납내역>`), 롤 프린터판 `BITPrintChartOcs.dll` | OcmInf·EmrInf·OicInf·OdrInf·OrpInf·UidMst·DepMst·InsMst·PbsInf | 코드로 그림. 아래 글 있음: "* 담당자 날인 없는 것은 사본으로 인정되지 않습니다." |

- 비트는 인쇄 때 JPG를 남기는 길이 있다(`C:\DrBIT50\JPGImage\영수증-차트번호…`). 이 PC에는 그 폴더가 없다. 꺼져 있는 것으로 **추정**한다.
- 엑셀 양식(`XLS\*.xls`)은 칸 자리를 맞출 때 그대로 참고할 수 있다. 우리 쪽에서 읽기만 한다.

## 1. 진료비 영수증 (날짜별) — 읽을 수 있음

- **항목별 금액은 `OdlInf`에 있다** (확실). 내원·영수증 번호마다 항목(`OdlIncCod`) 한 줄씩이다.
  - 2026-10 기준: 항목마다 줄 수 = 내원 수.
  - 내원·영수증과 잇는 칸: `OdlOcmNum`(=OcmNum), `OdlRcpNum`(=OrpRcpNum).
  - 비트가 쓰는 칸: `OdlInsOwn`(급여 본인부담), `OdlInsCor`(공단부담), `OdlHunAmt`(전액본인부담), `OdlNonAmt+OdlNinAct+OdlNinMat+OdlNinNat`(비급여), `OdlSpcAmt`(선택진료, 추정), `OdlInsAmt`, `OdlTotAmt`. 비트 SQL에 이 식이 그대로 있다(BITRePrint).
  - 항목 이름은 `IncMst`(IncCod→IncCodNam, 48개)에 있다. 이 의원이 10월에 쓴 항목: 1 진찰료, 4 주사료(행위), 5 마취료, 6 이학요법료, 8 처치및수술료, 9 검사료, 15 치료재료대, 16 초음파진단료, 25 기타, 28 투약료(약품비), 29 주사료(약품비), 30 영상진단료, 31 65세이상정액.
  - 본인부담 비율별 칸(`OdlH50Amt`·`OdlH80Amt`·`OdlH30Amt`·`OdlH90Amt`·`OdlH95Amt`)이 따로 있다. 비트는 "선별급여"로 줄여 셈한다(floor(…)/10*10).
- **합계는 `OrpInf`에 있다** (확실). 칸: `OrpTotAmt` 총진료비, `OrpCorAmt` 공단, `OrpTotOwn` 본인부담 총액, `OrpInsAmt`, `OrpNonAmt` 비급여, `OrpRcvBil` 장애인기금, `OrpSupBil`, `OrpDifAmt`.
  - 내원마다 `MAX(OrpRcpSeq)`이면서 `OrpRcpStt<>'C'`인 줄이 그 영수증이다. 비트·도우미 둘 다 이 조건을 쓴다. `'C'`는 미수입금 줄이다.
  - 맞춰 본 결과(10월 2,083건): 총 = 공단+본인이 94%, 총 = OdlInf 합이 92%였다. 안 맞는 쪽은 장애인기금·관리급여 도수 때문으로 보인다(erp-closing-fill 메모). **견본 PDF와 꼭 맞춰 볼 것.**
- **받은 돈과 수납 방법은 `OrcInf`에 있다** (확실). `OrcCod='RCV'`의 `OrcNewAmt`(현금)·`OrcCrdAmt`(카드)·`OrcChkAmt`(계좌)를 쓴다. 10월 쓰인 코드: RCV·QCV 건강생활유지비·COO 미수발생·COR 미수입금·TFC. 현금영수증은 `CashInf`(10월 154줄 전체, 승인번호 `CashAuthNum`)에 있다.
- **영수증 번호**: `OrpRcpNum`(char10, 왼쪽이 빈칸이고 숫자 5자리, 10월 2,131건 중 2,129개 다름) (확실). 비트 양식은 "영수증번호(연월-일련번호)"라고 적혀 있다. 그래서 연월에 이 번호를 붙여 찍는 것으로 **추정**한다. 견본에서 확인할 것.
- **수납 전인지**: `OcmInf.OcmComStt`로 안다. PN = Payment Complete이고, 끝난 내원은 모두 PN이었다(11-17~19). WN/WR = 대기, HN/TN = 진료 중·끝, CN/CR = 취소다(DtlMst `COMSTT`). 수납 전 내원에는 `OrpInf`·`OdlInf` 줄이 없다(확실, 11-17~20 사흘). → **'수납 전' = OcmComStt≠'PN' 또는 OrpInf 없음.**
  - `OrpRcpYon='N'`이 10월에 50건 있었는데, 모두 RCV가 있었다. 뜻은 **모름**(재수납 뒤 옛 줄로 추정).

## 2. 진료비 세부내역서 — 읽을 수 있음

- **`OdrInf`** 줄 하나가 처방 한 줄이다. 조건: `OdrDelFlg='N' AND OdrCanYon='N'`.
  - 칸: `OdrElcCod` 청구 코드, `OdrCodNam` 이름, `OdrPrc` 단가, `OdrQty` 1회량, `OdrTms` 횟수, `OdrDay` 일수, `OdrAmt` 금액, `OdrIncCod` 영수증 항목(IncMst와 같은 코드), `OdrInsYon` 급여 구분, `OdrDtm` 처방 시각.
  - 10월 비원외 줄 전부가 `OdrAmt = OdrPrc×OdrQty×OdrTms×OdrDay`였다(±1원, 확실). 원외처방(`OdrOutCod='XX'`) 줄은 금액이 0이라 세부내역에서 빼야 한다(추정, 비트 화면과 맞출 것).
- **`OdrInsYon` 뜻**(DtlMst `INSTBL`, 확실): 0 급여 / 1 보험적용100 / 2 비급여 / 3 본인부담 100/100 / 4 본인X·청구X / 8·9·A·B·F 본인부담 50·80·30·90·95/100.
  - 10월 분포: 0 11,175줄, 2 2,688줄(그중 1,425줄만 금액이 0이 아님), 3 161줄, F 86줄, 9 22줄, 1 10줄, 4 5줄.
- 단가표: `SeeMst`(병원 코드), `FpmMst`(정액 단가). 비트 세부내역 SQL이 이 둘을 읽는다.
- 위험: 내원마다 OdrAmt 합과 OdlTotAmt 합이 10원 안에서 맞은 것이 90%(2,086건 중 1,878건)였다. 비트 세부내역서의 본인부담·공단부담 칸 나눔은 `BITReceiptCalc`가 셈한다. 줄마다 본인/공단을 나누려면 비트 규칙을 따라 해야 한다 → **견본 대조 필수.**

## 3. 통원확인서·진료확인서 — 읽을 수 있음

- 내원 날짜는 `OcmInf`(`OcmAcpDtm` 앞 8자리, `OcmPatTyp='O'`, `OcmComStt='PN'`, `OcmRsuYon<>'O'`)에서 읽는다.
- 상병은 `OicInf`에 있다(확실). `OicElcCod` 코드, `OicIcdNam` 이름(10월 전부 채움), `OicIcdPri` 1 주상병 / 2 부상병 / 3 배제된 상병(DtlMst `ICDPRI`). 10월에 내원마다 주상병은 정확히 1개였다(2,086건). 한국어 이름표는 `IcdMst.IcdKorNam`이다.
- 의사는 `OcmInf.OcmDtrCod` → `UidMst`(`UidNam`, `UidLicNum` 면허번호, 의사 3명 모두 채움, `UidDtrYon='Y'`)에서 읽는다. 10월 진료의는 1명이었다.
- 비트가 쓰는 확인서 종류(DocInf `DocWrtTyp`, 최근 12개월 발급 수, 확실):
  - `DIAGNOSISDOC2` 진료확인서(병명) 279
  - `DIAGNOSCHOOL` 진료확인서(학교제출용) 236
  - `IPWCERTIFYDOC2` 통원확인서 152
  - `DIAGNOSISDOC` 진료확인서 1
  - 그 밖에 일반진단서 510·진료의뢰서 230·소견서 75 등(이번 범위 밖)

  → 사용자가 말한 '진료확인서'는 **진료확인서(병명)** 으로 **추정**한다. 학교제출용은 따로 양식이 있다.
- 비트는 확인서를 쓸 때마다 내용을 저장한다(확실).
  - 진료확인서 → `TDIAGNOSISDOC`(1,979건): 상병 칸 `DD_ICDCOD1~20`·`DD_ICDNAME`, 기간 `DD_STRDTE`·`DD_ENDDTE`, 내원일 `DD_TXTVISITDAYS`·`DD_TXTVISITCNT`, 용도로 보이는 `DD_METINFO`.
  - 통원확인서 → `TIPWCERTIFYDOC`(683건): `PD_ICDCOD1~12`·`PD_ICDNAME*`, `PD_WPDATE` 통원일, `PD_MEMINFO`.
  - 발급 대장 → `DocInf`: 작성일·의사·인쇄 수 `DocPrtNum`·`DocYerNum` 연번호.
  - **우리 프로그램은 쓰지 않으니, 우리가 뽑은 것은 비트 발급 대장에 남지 않는다.** 사용자에게 알릴 것.
- 용도 칸(값은 옮기지 않고 모양만 셈):
  - 통원확인서 `PD_MEMINFO`: 채운 645건 중 599건에 '보험', 614건에 '회사'가 들어 있다(서로 다른 값 39개). 기본값 '보험회사 제출용'이 맞다고 **추정**한다.
  - 진료확인서 `DD_METINFO`: 값이 2가지뿐이다(5자 '학교제출용' 계열 1,098건, 9자짜리 다른 값 842건). 이것이 용도인지는 **모름**.

## 4. 처방전 사본 — 읽을 수 있음

- 처방전 한 장의 머리는 `OutInf`에 있다.
  - 교부번호 = `OutSlpDte`(8) + `OutSlpNum`(5자리)이다. 처방 줄의 `OdrInf.OdrSlpNum`(13자리)과 10월 3,614줄 모두 맞았다(확실).
  - 10월에는 내원 2,086건 중 930건에 처방전이 있었고, 내원마다 정확히 1장이었다. → **OutInf 줄이 없는 날 = 처방 없는 날.**
  - `OutOdrStt`(E 200·P 730) 뜻은 **모름**. 둘 다 정상 발행으로 추정한다.
- 약 줄: `OdrInf`에서 `OdrOutCod='XX'`(원외약품, DtlMst `OUTTBL`), 같은 `OdrSlpNum`인 것. 쓰는 칸은 `OdrElcCod`·`OdrCodNam`·`OdrQty`(1회량)·`OdrTms`(횟수)·`OdrDay`(일수)·`OdrUntCod`(단위: 정·캡슐·g/개·mL 등)이고 모두 채워져 있다.
- **용법 글은 없다** (확실). `OdrUsgCod`·`OdrMntUsg`·`OdrSplCmt`가 10월 원외 줄에서 모두 비었고, 용법표 `UsgMst`는 1줄, `UsgMstNew`는 0줄이다. 비트 처방전도 용법 칸이 비어 나올 것으로 **추정**한다. 견본에서 볼 것.
- 처방전에 찍히는 의료기관 칸 이름은 DtlMst `OUTPNT`(의료기관명칭·전화·팩스·이메일, 처방의료인 성명·면허종별·면허번호)에 있다.
- 사본 표시: 비트에 "<사본이므로 조제불가>" 글이 있다. 우리도 이 글을 넣는 것으로 추정한다.

## 5. 진료기록부 — 칸은 앎, 모양은 견본 필요

- 기록 글은 `EmrInf`에 있다.
  - 10월에는 `EmrShtTyp='S'`, `EmrShtCod='C.C'` 한 종류뿐이었다. 19,953줄, 내원 2,042건, 내원마다 평균 약 10줄, 줄 평균 9자(최대 72자).
  - 칸: `EmrShtVal` 글(varchar1000), `EmrShtSeq` 순서, `EmrOcmNum` 내원, `EmrOcmDte` 날짜, `EmrDtrCod` 의사. `EmrCCVal`·`EmrPIVal`은 10월에 모두 비었다.
  - 글 내용은 옮기지 않았다.
- 비트 진료기록부는 `<내원내역>`(날짜·의사·C.C·상병 `OicInf`·처방 `OdrInf`), `<원외처방>`, `<수납내역>`(날짜·총진료비·영수액·수납액·할인액, `OrpInf`)을 찍는다(BITPrintChart 글자, 확실).
- 비트 글: "* 담당자 날인 없는 것은 사본으로 인정되지 않습니다." → 직원 도장을 손으로 찍는 것으로 **추정**한다. 사용자에게 물을 것.

## 6. 병원 정보 — 읽을 수 있음

- `HspMst`(1줄, 2000-01-01~9999-12-31) (확실). 채워진 칸:
  - `HspNam` 이름
  - `HspInsNum` 요양기관기호
  - `HspHspAdr` 주소
  - `HspRgnNum`(10자리) — 사업자등록번호로 **추정**
  - `HspOwnNam` 대표자
  - `HspRcpNam`(영수증에 찍는 이름, 추정)
  - `HspTelNum`·`HspFaxNum`
  - `HspWrkNum`은 비어 있다.
- 과 이름은 `DepMst`(`DepKorNam`, 날짜 범위 `DepAdpDte~DepExpDte`)에서 읽는다.

## 7. 직인·원장 도장 그림 — DB 안에 있음

- **병원 직인: `HspMst.HspSignImg`**(image, 1줄, 2,474바이트) + `HspSignPath`(채움) (확실).
- **의사 도장: `UidMst.UidSignImg`**(image, 의사 3명 모두, 최대 2,955바이트) + `UidSignPath` (확실).
- 비트 확인서 DLL이 `SELECT UidSignImg FROM UidMst WHERE UidCod=…`로 읽는다(BITInOutCertifyDocument 글자). 그림은 열어 보지 않았다.
- `C:\DrBIT50\SignIMG`에는 `BGImg.jpg`(배경)뿐이다. `DOCIMAGE.DOCSHOW`='N'은 설정 값으로 보인다.
- image 칸을 읽는 SELECT도 ReadOnlyGuard 허용 목록에 넣어야 한다.

## 8. 지금 보고 있는 환자 자동 잡기 — 가능성 있음, 확인은 아직

- 비트 DB에는 '지금 열린 환자'를 남기는 표가 없다(**모름**에 가까움). `PbsInf.PbsChkInterface`는 PACS 연동 표시이고, 지금 환자를 뜻하지 않는다.
- 비트 접수 화면(`BITRegistrations.exe`) 안 글자:
  - 창 제목으로 보이는 `"접수  (  환자정보 - 차트번호 : "`
  - 차트번호 입력칸 이름 `txtChtNum`(WinForms)

  → 두 길이 있다(**추정**).
  - (가) 창 제목에서 '차트번호 :' 뒤 숫자를 읽는다.
  - (나) UI Automation으로 AutomationId `txtChtNum` 칸 값을 읽는다.
- 지금 이 PC에서 비트가 꺼져 있어(BitAuth.exe만 돎) 실제 제목·칸은 못 봤다. **비트를 켜고 환자를 연 상태에서 확인해야 한다.** 이때도 값은 내지 말고 "제목에 숫자 n자리" 정도만 볼 것.
- PT 종이 `BitWindows.cs`는 일부러 창 제목을 읽지 않는다(이름이 들 수 있음). 제목을 읽는다면 숫자만 뽑고 저장·로그는 하지 말 것.
- 진료실 화면(`BITDoctorOrder.exe`) 쪽은 보지 않았다.

## 9. 이름 찾기 — 읽을 수 있음

- `PbsInf`(11,959명) (확실). 쓰는 칸:
  - `PbsPatNam` 이름
  - `PbsBirDte` 생년월일(8자리, 1명 빼고 다 채움)
  - `PbsSexTyp`(M/F, 모두 채움)
  - `PbsChtNum`(char14, 오른쪽 맞춤 → `LTRIM(RTRIM())`)
  - `PbsResNum`
- 동명이인이 많다: 이름 하나에 2명인 이름 890개, 3명 282개, 4명 107개 … 최대 14명. → 목록에 생년월일·성별·마지막 내원일을 함께 보여야 한다(추정).

## 10. 큰 위험
1. **금액 나눔**: 영수증 항목 칸(OdlInf)과 세부내역 줄(OdrInf)의 합이 8~10% 내원에서 안 맞는다. 비트 계산 규칙(BITReceiptCalc)을 다 따라 하지 않으면 금액이 틀릴 수 있다. 견본 여러 장으로 대조해야 한다. 정액(65세이상 IncCod 31)·관리급여 도수·장애인기금·선별급여 비율 칸이 있는 날이 특히 위험하다.
2. **발급 대장**: 비트는 확인서를 낼 때마다 DocInf·TDIAGNOSISDOC·TIPWCERTIFYDOC에 기록하고 연번호를 매긴다. 우리는 쓰지 않으므로 비트 대장·연번호가 비게 된다. 확인서에 '발급번호' 칸이 있다면 매길 수 없다.
3. **양식 변형**: 진료확인서가 9가지 변형으로 있고, 이 의원은 (병명)·(학교제출용)을 쓴다. 견본이 어느 것인지 확인할 것.
4. **진료기록부 날인**: 비트 글에 담당자 날인이 없으면 사본으로 인정되지 않는다고 적혀 있다.
5. **지금 환자 자동 잡기**: 비트가 켜진 상태에서 확인하지 않았다.

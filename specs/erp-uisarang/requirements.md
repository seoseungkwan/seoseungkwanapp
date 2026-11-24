# 요구사항: ERP 마감일지 의사랑판 (의사랑 통계 엑셀 → ERP 칸 · 엑셀로 받기)

> 기능 ID: `erp-uisarang` · 형식: `### REQ-4201: 제목`, 수용 기준 `- AC-4201.1: Given/When/Then`. 시험 이름에 AC ID를 넣는다.
> REQ 번호: 39xx는 다른 갈래(feat-erp-copy-list)가 쓴다. 42xx는 어느 갈래·일꾼 폴더의 명세에도 없어 이것을 쓴다(2026-11-24 확인).
> 근거: 의사랑 PC 조사 노트(2026-11-24, 사용자 결정 포함. PC 이름·내부 주소가 있어 저장소에 옮기지 않음 — 필요한 파일 모양만 design.md 5절에 옮김), 화면 시안 `docs/mockups/erp-uisarang/`(6f3de65e, 승인 전), 조정자 결정 2026-11-24(design.md 2절 표), 승인 뒤 일꾼 지적으로 고친 곳(design.md 2-1). 화면 글은 시안이 이기고, 시안과 다른 곳은 design.md 11절에 모았다.
> 예시 마감 일자는 2026-11-23. 숫자는 모두 지은 값이다.

## 배경 / 목표
- 의사랑을 쓰는 의원은 비트 DB가 없어 지금 확장·ERP 도우미로 마감일지를 채울 수 없다. DB 계정은 받을 수 없고(유비케어 관리), 통계 화면 자동 조작은 시험해 보니 불안정해 접었다(사용자 결정).
- 직원은 의사랑 통계(FStat)에서 보고서를 [검색]하고 [엑셀 저장]만 누른다. ERP 도우미가 그 PC 안에서 엑셀을 읽어 숫자만 확장에 넘기고, 확장이 ERP 칸을 채우거나(지금 하루 채우기와 같은 차례) 숫자를 엑셀 한 파일로 내려 준다.
- 비트 의원에서는 지금과 똑같이 돈다.

## 이미 정한 것 (다시 묻지 않는다)
1. DB·화면 자동 조작 없음. 엑셀만 읽는다. 처리는 그 PC 안에서만, 확장으로는 합계 숫자만 간다.
2. 엑셀 폴더는 바탕화면 `ERP마감`(도우미가 없으면 만든다). 도우미는 이 폴더 바로 아래 `.xls`만 읽는다.
3. 환자 정보가 든 엑셀(내원일별환자현황 아래쪽 표·예약환자통계 아래쪽 표)은 날짜가 달라도·읽다 실패해도 늘 읽자마자 지운다. 합계 엑셀은 읽은 뒤 지우되, 조회일이 마감 일자와 다르면 지우지 않고 둔다(조정자 결정 4).
4. 꼭 있어야 하는 엑셀 4개: 일일수입통계 · 기간별처방통계 · 내원일별환자현황 아래쪽 표 · 예약환자통계 아래쪽 표. 있으면 더 좋은 엑셀 2개: 내원일별환자현황 위쪽 표 · 예약환자통계 위쪽 표(아래쪽 표와 맞춰 보기만, 조정자 결정 1).
5. 엑셀 종류는 파일 이름이 아니라 표 머리글 글자로 알아본다(위·아래 표 기본 이름이 겹칠 수 있음).
6. 칸은 머리글 글자로 찾는다(차례 아님). 일일수입통계는 '합계' 줄만 쓴다. 못 읽은 칸은 0이 아니라 빈 칸이다.
7. 의사랑은 하루씩만 채운다. [기간 채우기] 단추는 그대로 두고 의사랑이면 '하루씩만' 안내를 보인다(조정자 결정 3).
8. 처방 코드는 의원마다 다르다. 처음 값은 비어 있고, 설정 화면에서 기간별처방통계의 `코드`·`처방명칭` 목록으로 줄마다 '건수로 셀 코드'와 '매출로 셀 코드'를 따로 고른다.
9. 예약: ERP 예약 종류별 줄(주사·경과·도수·충격파·진료예약·기타)과 총갯수 줄에는 넣지 않고 실예약환자수만 채운다(조정자 결정 5. 총갯수 줄은 ERP가 더하는 칸 — design.md 6-3).
10. 꼭 있어야 할 엑셀이 일부 없으면 멈추고 [있는 엑셀로 채우기]를 고르게 한다(조정자 결정 2).
11. [엑셀로 받기]: 읽은 결과로 ERP 칸을 건드리지 않고 `.xlsx` 한 파일(줄 = ERP 칸, 값 열 하나, 끝 열 '빈 칸 까닭')을 받을 수 있다(사용자 2026-11-24 "엑셀 파일로도 내가 입력해야 할 거 받을 수 있게").
12. 의사랑 `closing.day` 답은 비트 답과 같은 칸 이름·모양이고, 의사랑이 모르는 숫자는 `null`이다(다른 갈래 확장도 나중에 의사랑에서 돌게, 조정자).
13. 90일초진·미수입금·미수발생·감액·장애인기금·계좌이체액·현불/환불·입원수입·치료별 신환/90일초진/재진 건수·주사1회환자·신환주사환자·신환주사건수·예약 종류별 줄은 직접 입력이다(조사 노트 4·4-2절).

### REQ-4201: 자료원 판별과 의사랑 PC 등록
- AC-4201.1: Given 가짜 드라이브 뿌리 목록·파일 있음 함수, When `UisRules.FindUisarang(roots, fileExists)`, Then `<뿌리>\ysr2000\Exe\FStat.exe`가 있는 첫 뿌리의 `<뿌리>\ysr2000`이고 없으면 null이다. 넘겨받은 뿌리만 보고(도우미는 로컬 고정 드라이브만 넘긴다), 경로 대소문자는 가리지 않는다.
- AC-4201.2: Given 등록 모드(`--register`), When 비트를 찾으면, Then 지금 비트 등록 흐름 그대로이고 저장(0)이면 자료원 파일 `data\source.json`이 있을 때 지운다. When 비트를 못 찾았고(`E-BIT-NOT-FOUND`) 의사랑이 있으면, Then 비트 로그인 창·PC 확인 창 없이 엑셀 폴더(REQ-4202)를 만들고 `data\source.json`(`{ "v": 1, "source": "uisarang", "folder": "desktop" | "profile" }`)을 쓴 뒤 표준 출력에 `SOURCE-UISARANG`과 `FOLDER-DESKTOP` 또는 `FOLDER-PROFILE`을 한 줄씩(ASCII) 쓰고 0으로 끝난다. 폴더를 못 만들면 `E-UIS-FOLDER`·`STEP-UIS`로 2다. 자료원 파일을 쓰거나(의사랑) 지우지(비트 저장 뒤) 못하면(`IOException`·`UnauthorizedAccessException`) 예외로 끝나지 않고 `E-STORE-FAILED`·`STEP-UIS`로 2다(design.md 4-3). 둘 다 없으면 지금처럼 `E-BIT-NOT-FOUND`·`STEP-FIND`로 2다.
- AC-4201.3: Given 자료원 파일, When `UisSource.Read(dataDir)`, Then 모양이 맞으면 의사랑(폴더 종류 포함), 없거나 틀리면 null(= 비트)이다. 도우미는 켤 때 한 번 읽어 자료원을 정한다(비트 PC는 이 파일이 없어 지금 그대로).
- AC-4201.4: Given `install.ps1`, When 등록 끝 번호 0이고 출력에 `SOURCE-UISARANG`이 있으면, Then design.md 10-5의 의사랑 등록 글(폴더 두 갈래)을 보이고, 없으면 지금 글 그대로다. 등록 앞 글은 design.md 10-5 글이다. 멈춘 단계 `UIS`는 '의사랑 등록(엑셀 폴더·자료원 파일)'로 보이고, `E-UIS-FOLDER`와 단계 `UIS`의 `E-STORE-FAILED`는 design.md 10-5 ★ 실패 글이다. 그 밖 번호의 글은 지금 그대로다.

### REQ-4202: 엑셀 폴더와 지우기·남기기
- AC-4202.1: Given 가짜 경로 값, When `UisRules.ChooseFolder(desktop, profile, cloudRoots)`, Then 바탕화면이 클라우드 폴더(`OneDrive`·`OneDriveCommercial`·`OneDriveConsumer` 환경 값) 가운데 하나의 안이면 Profile(`<사용자 폴더>\ERP마감`), 아니면 Desktop(`<바탕화면>\ERP마감`)이다. 바탕화면 값이 비었으면 Profile이다.
- AC-4202.2: Given `UisDiskFolder`(실제 임시 폴더로 시험), Then 폴더가 없으면 만들고, 바로 아래 확장자 `.xls`(대소문자 무시)인 보통 파일만 이름 차례로 낸다. 하위 폴더·다른 확장자·연결(reparse) 파일은 내지 않는다. 폴더가 연결이거나 만들 수 없으면 `E-UIS-FOLDER`다. `IsOpen`은 다른 프로그램이 공유 없이 열고 있으면 true, `Delete`는 못 지우면 false(예외 없음)다.
- AC-4202.3: Given 폴더에 열려 있는 `.xls`가 하나라도 있을 때, When `closing.day`·`closing.uisCodes`, Then 어느 파일도 읽거나 지우지 않고, 답의 `uis.open`(`closing.uisCodes`는 state `open`)에 열린 파일의 보고서(파일 이름으로 짐작, design.md 5-4, 모르면 'unknown')를 담는다.
- AC-4202.4: Given 읽은 파일들, Then design.md 5-5 표대로 고르고 지우거나 남긴다: 환자별 엑셀은 알아본 바로 뒤(셈하기 전·다음 파일을 읽기 전) 지운다. 깨진 파일·종류 모름·20MB 넘는 파일도 지운다. 합계 엑셀은 다 읽은 뒤 지우되 날짜 다름(otherDate)·같은 날 같은 종류 둘 이상(twice)이면 남긴다. 같은 종류 합계 엑셀이 여럿이어도 조회일이 마감 일자 하루인 것이 꼭 하나면 그것을 읽어 지우고 나머지는 날짜 다름으로 남긴다. 조건이 '전체'가 아닌(notAll) 엑셀은 지운다. `uis.deleted`·`kept`·`deleteFailed`·`unknownFiles`에 센다.

### REQ-4203: .xls 읽기 부품과 가짜 엑셀
- AC-4203.1: Given `fixtures/fake-uisarang/`의 가짜 BIFF8 `.xls`, When `XlsRows.Read(bytes)`, Then 첫 시트의 줄·칸을 시트 차례대로 읽는다: 한글 글자 칸, 숫자 칸(소수 포함), 빈 칸(글자·숫자 모두 없음). 쉼표가 든 숫자 글자('1,234')는 글자 칸으로 읽고 숫자로 바꾸는 것은 보고서 셈(design.md 5-3)이 한다.
- AC-4203.2: Given 깨진 바이트·`.xlsx`(zip)를 `.xls` 이름으로·HTML을 `.xls` 이름으로·빈 파일, When `XlsRows.Read`, Then `UisFileException` 하나이고 그 글에는 파일의 칸 글자가 없다. 20,000줄 또는 64칸을 넘는 시트도 같다.
- AC-4203.3: Given csproj, Then `Erp.Core.csproj`는 `ExcelDataReader` 3.9.0을, `Erp.Core.Tests.csproj`는 net10.0에서만 `System.Text.Encoding.CodePages` 10.0.14를 정확한 판으로 참조한다(ADR-050). AC-3611.1 판 시험은 '기존 도우미에 있는 패키지는 같은 판, 없는 패키지는 ADR-050 목록의 판'으로 본다. 다른 새 패키지는 없다.
- AC-4203.4: Given `fixtures/make-fake-uisarang.ts`(저장소의 SheetJS `xlsx` 0.20.3, `bookType: 'biff8'`), When 다시 만들면, Then 커밋된 가짜 파일과 바이트가 같고 `.gitignore`에 만드는 파일마다 되살리는 줄이 있다. 가짜 파일의 이름·전화·주소·주민번호·차트번호는 design.md 12-2의 표시 글자만 쓴다(실제 의원 파일·숫자 없음).
- AC-4203.5: Given 지금 시험 `fixtures/make-fake-fixtures.test.ts`의 '.gitignore 되살리기' 시험(AC-005.2), Then 되살리는 줄은 두 생성기가 만드는 파일 이름 그대로뿐이고(`make-fake-fixtures`의 `FILES` → `fixtures/fake-bit/`, `make-fake-uisarang`의 `UIS_FIXTURE_NAMES` → `fixtures/fake-uisarang/`, 글롭 없음) 시험이 통과한다(design.md 12-4).

### REQ-4204: 보고서 알아보기·날짜·조건·칸 찾기
- AC-4204.1: Given 시트 줄, When `UisReport.Read(rows)`, Then 위에서 30줄 안의 머리글 줄을 design.md 5-1 표(있어야 하는 칸·없어야 하는 칸)로 찾아 여섯 종류 가운데 하나로 정한다. 머리글 글자는 빈칸을 모두 빼고 견준다. 맞는 종류가 없거나 둘이면 종류 모름이다.
- AC-4204.2: Given 머리글 줄 위의 `[…]` 라벨, Then design.md 5-2대로 `조회일` 값을 from·to로 읽는다. 합계 엑셀은 조회일이 없거나 from = to = 마감 일자가 아니면 otherDate다. 조회일이 아닌 라벨 가운데 값이 날짜 꼴도 '전체'도 아니면 notAll이고 그 값을 `value`에 담는다. 그런 라벨이 없으면 조건은 보지 않는다.
- AC-4204.3: Given 보고서마다 찾는 칸(design.md 5-3), Then 머리글에서 이름으로 찾는다. 없거나 같은 이름이 둘이면 그 칸 이름을 `columns`에 담고 그 칸에 기대는 값만 null이다(파일 전체를 멈추지 않는다). 머리글과 같은 줄(쪽 나눔으로 되풀이)과 빈 줄은 건너뛴다.
- AC-4204.4: Given 같은 종류 엑셀이 둘 이상, Then 합계 엑셀은 조회일이 마감 일자 하루인 것이 꼭 하나면 그것을 쓰고, 아니면 twice다. 환자별 엑셀이 둘 이상이면 twice다. twice인 보고서 값은 쓰지 않는다.

### REQ-4205: 일일수입통계
- AC-4205.1: Given 가짜 일일수입통계(보험구분 줄 여러 개 + '합계' 줄), Then 보험구분이 '합계'인 줄 하나만 읽는다(보험구분 줄을 더하지 않는다). '합계' 줄이 없거나 둘이면 모든 값이 null이고 `columns`에 '합계'가 있다.
- AC-4205.2: Given '합계' 줄 총진료비 칸이 비고 바로 아래 줄 같은 칸이 숫자일 때(병합 칸), Then 그 아래 값이 총진료비다. '합계' 줄 칸이 숫자면 그 값, 둘 다 아니면 null이다.
- AC-4205.3: Given 읽은 값, Then 총진료비 ≠ 급여총액 + 비급여 · 진료수납액 ≠ 현금수납액 + 카드수납액 · 인원계 ≠ 초진수 + 재진수이면 `uis.checks`의 `totalFee`·`received`·`headcount`에 [왼쪽, 오른쪽]을 담는다(채우기는 막지 않는다). 하나라도 null이면 그 칸은 null이다.

### REQ-4206: 기간별처방통계 (건수·매출·물리치료내원·코드 목록)
- AC-4206.1: Given 가짜 처방통계(쪽마다 머리글 되풀이 + 합계 줄)와 `closing.day` 묶음, Then 묶음마다 건수 = `groups`에서 고른 코드 줄의 총투여량 합, 매출 = `sales`에서 고른 코드 줄의 총액 합(원 미만은 줄마다 버림)이다. 코드는 앞뒤 빈칸을 떼고 가운데 이어진 빈칸을 하나로 줄여 대문자로 견준다. 같은 코드 줄이 여럿이면 모두 더하고, 한 코드가 두 묶음에 들면 묶음마다 더한다. 그날 처방이 없는 코드는 0이다.
- AC-4206.2: Given 건수로 고른 코드 줄의 총투여량 합에 소수가 있으면, Then 그 묶음 건수는 null이고 `uis.fractional`에 그 묶음 key가 있다.
- AC-4206.3: Given `ptVisit` 묶음, Then 물리치료내원 = 그 코드 총투여량 합, 재진 = 일일수입통계 재진수 − 물리치료내원이다. `ptVisit` 묶음이 없으면 물리치료내원은 null이고 재진 = 재진수다. 재진이 0보다 작으면 null이고 `uis.negative`에 'return'이 있다.
- AC-4206.4: Given 코드 줄 총액 합과 합계 줄 총액이 다르면, Then `uis.checks.rxTotal`에 [합계 줄, 코드 줄 합]을 담는다(채우기는 막지 않는다).
- AC-4206.5: Given `closing.uisCodes {}`, When 폴더에 처방통계가 하나 있으면(기간 상관없이), Then design.md 3-3 모양 `{ state: 'ok', from, to, codes }`(코드마다 한 줄, 총액 큰 차례, 2,000개까지)이고 그 처방통계를 지운다. 조건이 '전체'가 아니면 notAll(지움), 없으면 missing, 둘이면 twice(남김)다. 환자별 엑셀·종류 모름은 REQ-4202대로 지우고, 다른 합계 엑셀은 건드리지 않는다. 확장은 ok일 때만 목록을 받는다.

### REQ-4207: 내원일별환자현황 (아래쪽 표 꼭, 위쪽 표 선택)
- AC-4207.1: Given 가짜 아래쪽 표(머리글 약 20줄마다 되풀이), Then 환자 줄(차트번호 칸이 숫자 1~12자리인 줄) 수 = rows, 그 가운데 '신규환자' 칸이 '신규'인 줄 수 = newRows이고, 연령별은 줄마다 주민등록번호로 마감 일자 기준 만 나이를 셈해 10살 구간(0~9 '0' … 90 이상 '90')에 신환(신규) 또는 재진(그 밖)으로 센다. 만 나이를 셀 수 없는 줄은 `warnings.unknownAge`에 센다.
- AC-4207.2: Given 주민번호 꼴, When `UisAge.Age(rrn, day)`, Then 빈칸·'-'를 뺀 앞 7글자가 모두 숫자일 때만 셈한다. 7번째 숫자 1·2·5·6 = 1900년대, 3·4·7·8 = 2000년대, 9·0 = 1800년대. 생년월일이 달력에 없거나 마감 일자보다 뒤면 null이다. 만 나이 = (마감 일자 yyyymmdd − 생년월일 yyyymmdd) / 10000(정수). 8번째부터 '*'로 가려져도 된다.
- AC-4207.3: Given 위쪽 표가 ok일 때, Then 신환 = 그 합계(또는 그날) 줄 신규환자, 환자 합계 = 인원수이고, rows ≠ 인원수·newRows ≠ 신규환자면 `uis.checks.visitRows`·`visitNew`에 담는다(경고만). 위쪽 표가 없으면 신환 = newRows, 환자 합계 = rows다.
- AC-4207.4: Given 진찰료 산정안함, Then 환자 합계 − (초진수 + 재진수)이고 0보다 작으면 null이며 `uis.negative`에 'noExamFee'가 있다.
- AC-4207.5: Given 아래쪽 표에 조회일 라벨이 있으면 AC-4204.2 규칙으로 날짜를 보고, 없으면 날짜는 보지 않고 `uis.checks.noDate`가 true다(경고만).

### REQ-4208: 예약환자통계 (아래쪽 표 꼭, 위쪽 표 선택)
- AC-4208.1: Given 가짜 아래쪽 표, Then 환자 줄(차트번호 숫자 1~12자리) 가운데 서로 다른 차트번호 수 = 실예약환자수, 줄 수 = rows, 방문여부가 '방문'인 줄 수 = visited다. 예약일 칸 값(앞 10글자, `.`·`/`는 `-`로)이 하나라도 마감 일자가 아니면 그 보고서는 otherDate다.
- AC-4208.2: Given 위쪽 표가 ok일 때, Then 합계(또는 그날) 줄 예약건수 ≠ rows·이행건수 ≠ visited면 `uis.checks.rsvRows`·`rsvVisited`에 담는다(경고만). `uis.reservations`는 위쪽 표가 ok면 { 예약건수, 이행건수 }, 아니면 아래쪽 표 { rows, visited }, 둘 다 없으면 null이다.
- AC-4208.3: Given 의사랑 칸 계획, Then 업무일지 2 예약 표의 종류별 6줄 × 총갯수·내원·변경·취소에는 값을 넣지 않고(의사랑에 없음), 실예약환자수만 넣는다.

### REQ-4209: 환자별 엑셀 지키기
- AC-4209.1: Given 글자 칸에 design.md 12-2 표시 글자만 든 가짜 환자별 엑셀, When `closing.day`·`closing.uisCodes`를 가짜 폴더로 끝까지 돌리면(성공·날짜 다름·종류 모름·깨진 파일·같은 종류 둘), Then 답 JSON, 진단 기록 줄, 모아 둔 값(복호 뒤), 던진 예외 글 어디에도 그 표시 글자가 없다.
- AC-4209.2: Given 같은 경우들, Then 환자별 엑셀은 가짜 폴더의 `Delete`가 그 파일 `Read` 바로 다음에(다음 파일 `Read` 전에) 불린다. 실제 임시 폴더(`UisDiskFolder`)로 돌려도 끝난 뒤 그 파일이 없다.
- AC-4209.3: Given 환자별 줄 셈(`UisPatients`), Then 결과(`VisitPatientFacts`·`RsvPatientFacts`)에 글자 칸이 없다(숫자·참거짓·칸 이름뿐). 주민번호는 만 나이 셈에만, 차트번호는 줄 가리기·서로 다른 수 세기에만 쓰고, 수진자명·전화번호·주소·휴대전화 칸은 찾지 않는다(코드 글자 시험).
- AC-4209.4: Given 도우미 진단 기록, Then 의사랑 명령도 지금처럼 시각·명령 이름·오류 번호만 남는다(파일 이름·보고서 종류·숫자·폴더 경로 없음).

### REQ-4210: 도우미 명령과 답 모양
- AC-4210.1: Given `helper-erp/commands.json`, Then 명령은 `closing.codes`·`closing.day`·`closing.findCodes`·`closing.source`·`closing.uisCodes` 다섯이고 모두 `patient: false`다. `closing.day` args에 선택 칸 `sales`(design.md 3-1: 0~10개, 항목 `{ key: 매출 묶음 10개 가운데, codes: 코드 꼴 1~20개 }`)가 더해지고 나머지 칸은 그대로다. `closing.source`·`closing.uisCodes` args는 `{}`다.
- AC-4210.2: Given 비트 자료원 도우미, Then `closing.source`는 `{ source: 'bit' }`, `closing.uisCodes`는 `E-CLOSING-WRONG-SOURCE`이고 다른 세 명령은 지금 처리기 그대로다(`sales`는 읽지 않는다). Given 의사랑 자료원 도우미, Then `closing.source`는 `{ source: 'uisarang' }`, `closing.codes`·`closing.findCodes`는 `E-CLOSING-WRONG-SOURCE`, `closing.day`(`sales`가 있든 없든)·`closing.uisCodes`는 의사랑 처리기다. 의사랑 처리기는 등록 확인(`HospitalGate`)·비트에 닿지 않는다.
- AC-4210.3: Given 의사랑 `closing.day { date, groups, sales? }`, Then 날짜가 도우미 PC 오늘보다 뒤면 폴더에 닿기 전에 `E-CLOSING-FUTURE-DATE`, `groups`나 `sales` 안에 같은 key가 둘이면 `E-HELPER-BAD-MESSAGE`다. 답은 design.md 3-2 모양이다: 비트 답과 같은 칸 이름·차례에 `source: 'uisarang'`과 `uis`를 더하고, 의사랑이 모르는 숫자는 null이다. `groups`는 args `groups` 차례(건수 = patients, 같은 key의 매출 = total)에 `sales`에만 있는 key를 `sales` 차례로 이어 붙인다. 묶음의 `amountPrefixes`·`amountCodes`·`exclude`는 읽지 않는다.
- AC-4210.4: Given 같은 마감 일자로 두 번 읽을 때, When 두 번째에 앞서 ok였던 보고서 파일이 없으면, Then 모아 둔 값(design.md 4-4)을 쓰고 그 보고서 `cached`가 true다. 새로 읽은 ok 보고서는 모아 둔 값을 바꾼다. 다른 날짜를 읽으면 앞 날짜 값은 버리고, 24시간이 지났거나 풀 수 없는 값은 쓰지 않는다. 처방통계 값은 코드별 합으로 모아 두어 설정 코드를 바꿔도 맞게 다시 센다. 모아 둔 값 파일은 숫자·칸 이름·처방 코드뿐이고 등록 파일과 같은 보호(`IProtector`, 도우미는 DPAPI)로 쓴다.
- AC-4210.5: Given 의사랑 처리기, Then 엑셀 폴더·자료원 파일·모아 둔 값 파일 밖에는 닿지 않는다: `helper-erp/src/Erp.Core/Uisarang/`에 네트워크·SQL·`HospitalGate`·비트 부품 글자가 없다(코드 글자 시험) + 가짜 폴더 시험.

### REQ-4211: 확장 — 자료원 정하기·의사랑 채우기 흐름·칸 계획
- AC-4211.1: Given ERP `/h/closing` 화면, When 단추 줄이 붙으면, Then 단추 이름을 이렇게 정한다: 비트 설정(`erpClosing`)만 저장돼 있으면 비트(도우미 부름 없음, 지금 그대로), 의사랑 설정(`erpClosingUis`)만 저장돼 있으면 의사랑(부름 없음), 둘 다 없으면 비트(부름 없음 — 비트 흐름이 '비트 설정 없음'에 닿을 때 자료원을 다시 정한다, design 2-1 고침 13), 둘 다 있으면 `closing.source`를 한 번 물어(5초) `{ source: 'uisarang' }`일 때만 의사랑, 그 밖(비트 답·옛 도우미 `E-HELPER-UNKNOWN-COMMAND`·도우미 없음·5초 넘음·틀린 답)은 비트다. 의사랑이면 단추 줄이 design.md 9-3 [기간 채우기] [엑셀로 받기] [의사랑 값 채우기]로 바뀐다. 정해지기 전에 누르면 정해진 뒤 그 흐름으로 간다.
- AC-4211.2: Given 의사랑 단추 줄, When [의사랑 값 채우기], Then design.md 9-4 차례다: 마감 일자 없음·오늘 뒤 → 지금 글 · 의사랑 설정을 저장한 적 없음 → 설정 화면을 열고 시안 ⑭ 글 · 누른 단추 '의사랑 엑셀 읽는 중…'(세 단추 막힘) → `closing.day`(`toUisArgs`) → 도우미 오류 → 의사랑 오류 글(AC-4212.6) · 답에 `source`가 없음(비트 도우미) → `E-CLOSING-WRONG-SOURCE` 글 · 틀린 답 → `E-BRIDGE-BAD-REPLY` · 읽는 동안 날짜 바뀜 → 지금 글 · 멈춤(AC-4212.1~4212.3) · 환자 합계 0 → 지금 '진료 0건' 묻기 · 이미 적힌 칸 묻기 · 채움 → 결과 안내(AC-4212.4). 되돌리기·[지난 결과]·읽기 전용은 지금 그대로다.
- AC-4211.3: Given 의사랑 답과 설정, When `uisCells`·`planUisCells`, Then design.md 6-1 표 그대로다. 계획(`Planned[]`, 지금 `fillAll`이 받는 모양)에는 값 칸·unpicked·unknown·noName만 있고 의사랑에 없는 칸(none 75칸)과 엑셀이 없어 빈 칸(missing)은 없다. 계획의 칸 자리는 모두 지금 `planCells`(비트, 처음 값 설정)가 내는 칸 자리 가운데 하나다.
- AC-4211.4: Given 의사랑 답, When `readUisDay(data, date)`, Then design.md 3-2 모양(숫자 칸은 0 이상 정수 또는 정해진 null, `source` = 'uisarang', `uis.reports` 6개가 `UIS_KINDS` 차례, `ages` 10개)일 때만 받고 아니면 null(= E-BRIDGE-BAD-REPLY)이다. 비트 `readDay`는 바뀌지 않는다.
- AC-4211.5: Given 의사랑 흐름, Then 같은 화면·같은 마감 일자 동안 마지막 답을 화면 기억에만 들고 있어(저장하지 않음) 안내 안의 [있는 엑셀로 채우기]·[엑셀로 받기]·[의사랑 값 채우기]는 다시 읽지 않고 그 답을 쓴다. 단추 줄의 [의사랑 값 채우기]·[엑셀로 받기]는 늘 다시 읽는다(새로 저장한 엑셀을 읽고 지우려고. 지운 엑셀 값은 도우미가 모아 둔다, AC-4210.4). 마감 일자가 바뀌거나 화면을 떠나면 버린다.
- AC-4211.6: Given 확장 코드, Then 도우미 부르기 타입 `Send`는 `uisTypes.ts` 한 곳에서만 내보내고 `uisOptions.ts`·`uisFlow.ts`는 그것을 가져다 쓴다(같은 뜻의 타입을 따로 정하지 않음, design.md 8-1).

### REQ-4212: 확장 — 의사랑 안내
- AC-4212.1: Given 답의 `uis.open`이 비지 않으면, Then 다른 판정보다 먼저 시안 ⑫ 안내(design.md 10-1)이고 아무 칸도 바꾸지 않는다.
- AC-4212.2: Given 보고서 가운데 otherDate·notAll·twice가 있으면(이 차례로 첫 갈래), Then 시안 ⑨·⑩·⑪ 안내(design.md 10-1, 11절 4·15)이고 아무 칸도 바꾸지 않는다.
- AC-4212.3: Given 쓸 수 있는 보고서(ok, cached 포함)가 하나도 없으면 시안 ⑥, 꼭 있어야 할 4개 가운데 없는 것이 있으면 시안 ⑦ + [안내 닫기] [엑셀로 받기] [있는 엑셀로 채우기]다. [있는 엑셀로 채우기]는 들고 있는 답으로 '진료 0건' 묻기부터 이어 간다. 선택 2개만 없으면 묻지 않는다.
- AC-4212.4: Given 채운 뒤, Then 결과 안내는 design.md 10-2의 1~10 차례다(맞춰 볼 숫자 · 채움 줄 · 지움·모아 둔 값·남김·못 지움 줄 · 엑셀이 없어 비워 둔 칸 · 의사랑에서 읽지 못한 칸과 까닭 · 건너뛴 칸 · 의사랑에 없어 비워 둔 칸 · 맞춰 보기 경고 · 예약 참고 줄 · 끝 줄과 [되돌리기] [엑셀로 받기] [설정 열기]). 해당하는 것만 보인다.
- AC-4212.5: Given 의사랑 단추 줄, When [기간 채우기], Then 시안 ⑬ 안내(머리 '기간 채우기', 하루씩만, [닫기])만 보이고 기간 고르기·도우미 부름은 없다.
- AC-4212.6: Given 의사랑 자료원의 오류, Then `errors.ts`의 `explainFor(code, 'uisarang')`가 `E-UIS-FOLDER`·`E-CLOSING-WRONG-SOURCE`·표에 없는 번호를 design.md 10-4 글로, 나머지는 지금 `ERRORS` 글로 준다. `explain(code)`(비트)는 지금 그대로다. 모든 의사랑 안내는 숫자·날짜·칸 이름·보고서 이름만 textContent로 넣는다.
- AC-4212.7: Given 의사랑 자료원, When '진료 0건' 묻기·이미 적힌 칸 묻기를 보이면, Then 첫 줄은 design.md 10-1 ★ 의사랑 글('{날짜}에는 의사랑 진료가 한 건도 없어요.' · '이미 적힌 칸 {N}개가 의사랑 값으로 바뀌어요.')이고 뒤 줄·단추는 지금 그대로다. 비트 자료원의 두 묻기는 지금 글 그대로다. ⑩·⑪ 안내는 답에 없는 라벨 이름·파일 수를 말하지 않는다(⑪ '{보고서} 엑셀이 여러 개 있어요.', design.md 10-1).

### REQ-4213: 확장 — [엑셀로 받기]
- AC-4213.1: Given 의사랑 답과 설정, When `uisSheetRows(day, settings)`, Then design.md 7-1 모양이다: 1행 ['항목', '{M/D} ({요일})', '빈 칸 까닭'], 머리 줄과 숫자 줄 149줄(ERP 화면 차례, `UIS_SHEET_FIELDS`), 값은 숫자 칸 또는 빈 칸, 빈 칸이면 끝 열에 까닭 하나('직접 입력' · '의사랑에 없음' · '코드 안 고름' · '못 읽음' · '못 읽음 ({보고서} 없음)'). 값이 있는 칸은 `uisCells` 값과 같다(기타 이름이 빈 줄도 값을 쓴다). 환자 정보는 없다.
- AC-4213.2: Given `workbookBytes(rows, { sheetName, widths }, when)`, Then 저장만 하는 zip 안 가장 작은 SpreadsheetML(design.md 7-2)이고, 저장소의 SheetJS `xlsx` 0.20.3으로 다시 읽으면 같은 칸 값·숫자 칸·틀 고정(A열·1행)·열 너비다. 확장 묶음(`extension-erp/dist`)에는 SheetJS가 없다.
- AC-4213.3: Given [엑셀로 받기](단추 줄·결과 안내·⑦·받았어요 안내 밖), When 누르면, Then 답(단추 줄은 새로 읽은 답, 안내 안은 들고 있는 답)으로 `ERP마감-의사랑-{YYYY-MM-DD}.xlsx`를 내려받게 하고 design.md 10-3 안내를 보인다. ERP 칸은 하나도 바꾸지 않는다. 단추 줄에서 누르면 ⑥·⑨~⑫에서는 멈추고 ⑦은 묻지 않고 받는다. 멈춤 안내(⑥·⑨~⑫)에는 이 단추가 없다.
- AC-4213.4: Given 엑셀로 받기, Then 내용 스크립트의 Blob 주소 + `a[download]`로 받고(새 권한 없음), Blob 주소는 누른 뒤 1초 안에 되돌린다(`URL.revokeObjectURL`). 파일·답을 `chrome.storage`에 쓰지 않는다.

### REQ-4214: 확장 — 의사랑 설정 화면
- AC-4214.1: Given 설정 화면, When 열 때, Then 의사랑 설정(`erpClosingUis`)만 저장돼 있으면 `closing.codes`를 부르지 않고 의사랑 화면이다. 그 밖은 지금처럼 `closing.codes`를 부르고, 답이 `E-CLOSING-WRONG-SOURCE`면 오류 글 없이 의사랑 화면이다. 비트 화면은 부름 수·차례·글이 지금 그대로다.
- AC-4214.2: Given 의사랑 설정 화면, Then 줄은 design.md 9-5 차례(건수와 매출 · 매출만 · 건수만)이고, 줄마다 '건수로 셀 코드'·'매출로 셀 코드'를 따로 20개까지 고른다. 찾기는 코드 목록에서 코드나 처방명칭에 그 글자가 든 것(대소문자 무시)을 30개까지 보이고 꼬리에 '총투여량 N'(건수)·'총액 N원'(매출)을 붙인다. 소수 총투여량은 주황 숫자 + 안내 한 줄이다. 목록에 없는 고른 코드 옆에는 '(처방통계에 없음)'. 21자 넘는 코드는 목록에 보이되 고를 수 없다. 코드 목록이 없으면 찾기 칸이 막히고 '코드 목록이 없어 찾을 수 없어요'다.
- AC-4214.3: Given [코드 목록 읽기]·[코드 목록 다시 읽기], When 누르면, Then `closing.uisCodes`를 부르고 ok면 목록을 `chrome.storage.local` `erpClosingUisCodes`에 곧바로 쓰고(설정 [저장]과 따로) design.md 10-6 ok 글을 보인다. missing·notAll·twice·open·오류는 design.md 10-6 글이고 목록은 그대로다.
- AC-4214.4: Given [저장], Then `erpClosingUis` 한 열쇠에 design.md 9-2 모양으로 쓴다(코드 꼴 정리·겹침 뺌·20개까지, 기타 이름 1~20자 정리). 비트 설정 `erpClosing`은 읽지도 쓰지도 않는다. 저장하지 않은 바꿈이 있으면 지금처럼 나가기 확인 창이 뜬다.
- AC-4214.5: Given 예약 묶음, Then 의사랑 설정에 '예약 합계를 넣을 줄'이 없고 design.md 10-6 예약 안내 한 줄만 있다.
- AC-4214.6: Given 의사랑 설정 화면, Then 폴더를 가리키는 글은 모두 'ERP마감 폴더'이고(코드 목록 답에 폴더 자리가 없어서) 맨 위 상자에 design.md 10-6 ★ 폴더 글(자리 설명)이 있다. '매일 저장할 엑셀 6개'의 저장법 셋째 줄은 design.md 10-6 ★ 글(실제 지우기 규칙)이고, '-환자별' 안내는 저장법 둘째 줄 한 번뿐이다. [코드 목록 읽기] twice 글은 수를 말하지 않는다.

### REQ-4215: 비트판 그대로
- AC-4215.1: Given 이 기능의 바뀐 곳, Then `git diff efe60061 -- helper src extension helper-erp/src/Erp.Core/Closing extension-erp/src/cells.ts extension-erp/src/fill.ts extension-erp/src/settings.ts extension-erp/src/range.ts extension-erp/src/rangeView.ts extension-erp/src/rangeTypes.ts extension-erp/src/erpday.ts extension-erp/src/__tests__`가 비어 있다.
- AC-4215.2: Given 지금 ERP 도우미·확장 시험, Then design.md 12-4 표의 기대값만 고치고 나머지는 기대값을 바꾸지 않고 통과한다.
- AC-4215.3: Given 비트 자료원(가짜 chrome: 비트 설정만 저장 · 둘 다 없고 `closing.source`가 bit·옛 도우미·없음), When ERP 화면 단추·하루 채우기·기간 채우기·설정 화면을 쓰면, Then 단추 글자·DOM·보내는 `closing.day` args·안내 글이 이 기능 전과 같고, 비트 설정만 저장된 화면은 도우미를 더 부르지 않는다(지금 main·panel·options 시험 그대로 + 새 시험 `main.uis.test.ts`).
- AC-4215.4: Given 비트 자료원 도우미, Then `closing.day`·`closing.codes`·`closing.findCodes`·`--register`는 이 기능 전과 같은 처리기·같은 답이다(`Program`의 비트 갈래 코드 글자 시험 + 지금 C# 시험 그대로).

### REQ-4216: 판·설치 묶음·안내서·실제 PC 확인
- AC-4216.1: Given 새 판, Then ERP 도우미 0.4.0(`helper-erp/Directory.Build.props`)·확장 0.4.0(`extension-erp/manifest.json`)이고, 안내서 두 곳 짝 문장이 '확장 0.4.0 ↔ ERP 도우미 0.4.0'이다. 판 만들기·태그는 사용자가 말할 때만 한다.
- AC-4216.2: Given `extension-erp/README.md`·`helper-erp/install/README.md`, Then '의사랑 의원' 절이 있다: 설치(비트 로그인 창 없음, 폴더 자리 두 갈래), 매일 저장할 엑셀(꼭 4개·있으면 좋은 2개, 아래쪽 표 이름 끝 '-환자별', 한셀 창 닫기, 이 폴더는 의사랑 엑셀 전용), [의사랑 값 채우기]·[엑셀로 받기], 하루씩만, 지우는 규칙, 직접 넣는 칸. 그 절 밖 글자는 그대로다.
- AC-4216.3: Given Release 빌드(net48) 출력, Then `ExcelDataReader.dll`(과 그 판이 요구하는 dll)이 `SeoseungkwanErpHelper.exe` 옆에 있다(설치 묶음은 지금 workflow가 `*.dll`을 모두 싣고 install.ps1이 모두 옮긴다). `System.Text.Encoding.CodePages.dll`은 도우미에 필요 없다.
- AC-4216.4: (사용자와 함께, 시험 아님) Given 의사랑 PC에 새 판 설치, When 직원이 엑셀 6개를 저장하고 [의사랑 값 채우기]·[엑셀로 받기]를 누르면, Then design.md 13절 확인 목록이 맞다. 다르면 그 부분만 명세를 고쳐 다시 승인한다. 결과는 `specs/erp-uisarang/notes/uisarang-pc-check.md`에 숫자·이름 없이 맞음/다름만 적는다.

## 범위 밖
- 의사랑 DB 읽기(읽기 전용 계정을 받으면 다시 본다), 통계 화면 자동 조작
- 치료별 신환/90일초진/재진 건수·주사1회환자·신환주사(기간별처방통계 아래쪽 표, 확인 대기)·90일초진(초진수 − 신규환자로 셀 수 있을지는 이번에 보지 않음)
- 의사랑 기간 채우기(여러 날), 의사랑 예약 종류 나누기, 입원 칸
- 비트와 의사랑이 둘 다 깔린 PC를 의사랑으로 등록하기(지금은 비트가 먼저)
- `helper/`·`src/`(웹앱) 고치기, 웹앱 배포. 다른 갈래 `extension-erp-list/`(erp-copy-list) 고치기
- 지운 파일을 디스크에서 덮어써 없애기(보통 지우기만, 휴지통에 넣지 않음)

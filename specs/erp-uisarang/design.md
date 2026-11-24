# 설계: ERP 마감일지 의사랑판 (의사랑 통계 엑셀 → ERP 칸 · 엑셀로 받기)

## 개요
- 의사랑 PC에서는 ERP 도우미가 DB 대신 **직원이 저장한 의사랑 통계 엑셀(.xls, BIFF8)** 을 읽는다. 엑셀 폴더는 바탕화면 `ERP마감`(4-3). 도우미는 그 PC 안에서 표를 읽어 **숫자만** 확장에 넘기고, 환자 정보가 든 엑셀은 알아본 바로 뒤 지운다(5-5).
- 도우미 답은 지금 비트 `closing.day` 답과 **같은 칸 이름·모양**이고, 의사랑이 모르는 숫자는 `null`이다. 의사랑만의 것은 `source: 'uisarang'`과 `uis` 칸에 더한다(3-2).
- 확장은 지금 하루 채우기 차례(진료 0건 묻기 → 이미 적힌 칸 묻기 → `fillAll` → 결과 → 되돌리기)를 그대로 쓰고, 칸 계획만 의사랑용(`planUisCells`)으로 바꾼다. 같은 읽기 결과로 ERP 칸을 건드리지 않고 `.xlsx` 한 파일을 받을 수도 있다([엑셀로 받기], 7절).
- 비트 쪽 코드(`helper-erp/src/Erp.Core/Closing/*`, 확장 `cells.ts`·`fill.ts`·`settings.ts`·`range*.ts`·`erpday.ts`)는 한 글자도 바꾸지 않는다. 지금 파일은 더하기만 한다(1절 표).
- 엑셀 읽기는 새 NuGet 패키지 `ExcelDataReader` 3.9.0 하나(ADR-050). 엑셀 쓰기(확장)는 새 패키지 없이 저장만 하는 zip + 가장 작은 SpreadsheetML을 직접 쓴다(다른 갈래 erp-copy-list와 같은 길, 결정 3).

## 구성 요소 / 인터페이스

### 1. 바뀌는 곳 한눈에
| 곳 | 파일 | 바꿈 |
|---|---|---|
| 명령 표 | `helper-erp/commands.json` | 명령 둘(`closing.source`·`closing.uisCodes`) + `closing.day` 선택 칸 `sales` 더함 (3-1) |
| 도우미 순수 부품 | `helper-erp/src/Erp.Core/Uisarang/*.cs` (새 폴더) | 엑셀 읽기·알아보기·셈·지우기 차례·모아 둔 값·명령 처리기 (4-1) |
| 도우미 입구 | `helper-erp/src/Erp.Helper/Program.cs`·`UisHelperServices.cs`(새)·`ErpStage.cs` | 자료원 갈래·의사랑 등록 (4-3) |
| 설치 | `helper-erp/install/install.ps1`·`README.md` | 의사랑 등록 글 (10-5) |
| 패키지 | `Erp.Core.csproj`(ExcelDataReader) · `Erp.Core.Tests.csproj`(CodePages, net10.0만 · 가짜 엑셀 복사) | ADR-050 |
| 가짜 엑셀 | `fixtures/make-fake-uisarang.ts`·`fixtures/fake-uisarang/*.xls`·`.gitignore` | 12-1 |
| 확장 새 모듈 | `extension-erp/src/uisTypes.ts`·`uisText.ts`·`uisSettings.ts`·`uisCells.ts`·`uisSheet.ts`·`zip.ts`·`xlsxWrite.ts`·`uisView.ts`·`uisFlow.ts`·`uisOptions.ts` | 8절 |
| 확장 지금 모듈(더하기만) | `types.ts`·`background.ts`·`errors.ts`·`panel.ts`·`main.ts`·`options.ts`·`manifest.json`·`README.md` | 8-9 |
| 고치지 않음 | `helper/`·`src/`·`extension/`·`helper-erp/src/Erp.Core/Closing/`·확장 `cells.ts`·`fill.ts`·`settings.ts`·`range.ts`·`rangeView.ts`·`rangeTypes.ts`·`erpday.ts` | AC-4215.1 |

### 2. 정한 것과 근거 (조사 노트와 다른 곳 표시)
| # | 정한 것 | 근거 | 조사 노트와 |
|---|---|---|---|
| 1 | 꼭 4개(일일수입통계·기간별처방통계·두 아래쪽 표) + 선택 2개(두 위쪽 표, 맞춰 보기만) | 조정자 결정 1 | 다름(노트는 6개 모두) |
| 2 | 꼭 있어야 할 엑셀이 없으면 멈추고 [있는 엑셀로 채우기]를 고르게 | 조정자 결정 2 | 같음 |
| 3 | [기간 채우기]는 두고 '하루씩만' 안내 | 조정자 결정 3 | 같음 |
| 4 | 환자별 엑셀은 늘 지움, 날짜 다른 합계 엑셀은 남김 | 조정자 결정 4 | 다름(노트는 다 읽은 뒤 모두 지움) |
| 5 | 예약은 실예약환자수만. 종류별 줄·총갯수 줄 안 채움 | 조정자 결정 5 + 6-3 확인 | 다름(노트는 예약건수 → 총갯수·이행건수 → 내원) |
| 6 | [엑셀로 받기] | 사용자 2026-11-24 | 새것 |
| 7 | 답 모양 = 비트 답 칸 이름 + null + `source`·`uis` | 조정자 | 노트 6절 '모르는 칸 null'과 같음 |
| 8 | 바탕화면이 OneDrive 안이면 엑셀 폴더를 사용자 폴더 `ERP마감`으로 | Claude 판단(환자 엑셀이 클라우드로 올라가지 않게, CLAUDE.md '환자 개인정보는 PC 밖으로 나가지 않는다') | 다름 — 사용자 확인 질문 1 |
| 9 | 같은 종류 합계 엑셀이 여럿이어도 마감 일자와 조회일이 같은 것이 꼭 하나면 그것을 쓴다(나머지는 날짜 다름으로 남김) | Claude 판단(남겨 둔 엑셀 때문에 다음에 '2개 있어요'로 막히지 않게) | 새것 |
| 10 | 도우미가 그날 읽은 보고서 숫자를 모아 둠(DPAPI, 24시간) | Claude 판단(읽자마자 지우므로, 빠진 엑셀만 다시 저장해 눌렀을 때 앞서 읽은 값을 쓰려면 필요) | 새것 |
| 11 | 폴더 다루기(`UisDiskFolder`)를 Erp.Core(netstandard2.0, System.IO)에 둠 | 실제 임시 폴더로 지우기 차례를 시험하려고. Erp.Helper는 경로만 정한다 | 지시('플랫폼은 Helper')와 다름 |
| 12 | 조건이 '전체'가 아닌 합계 엑셀은 지움 | Claude 판단(남기면 다시 저장한 엑셀과 '2개'가 됨) | 새것 |
| 13 | 환자 줄 = 차트번호 칸이 숫자(1~12자리)인 줄 | Claude 판단(표 끝 합계·쪽 머리 줄을 환자로 세지 않게) | 새것 — 실제 PC 확인 |
| 14 | CodePages 패키지는 시험(net10.0)에만 | ADR-050(.NET Framework 4.8은 코드 페이지가 기본으로 있음) | 새것 |

#### 2-1. 명세 고침 (2026-11-24, 승인 뒤 일꾼 지적 반영 — 본문의 '고침 N')
| 고침 | 무엇 | 고친 곳 | 코드 고침 |
|---|---|---|---|
| 1 | 답에 라벨 이름 칸·파일 수 칸이 없다. ⑩은 '외/입 구분' 글 하나, ⑪과 설정 twice는 수 없이 '여러 개' | 5-2 · 10-1 · 10-6 · 11절 15·24 | TASK-17 |
| 2 | 설정 저장법 셋째 줄을 실제 지우기 규칙(5-5, 2절 4)대로 | 10-6 · 11절 20 | TASK-17 |
| 3 | 6-3 예약 참고 줄은 결과 안내에만, 받기 시트에는 없음(7-1과 같게) | 6-3 | 없음(TASK-10이 이미 그렇게 함) |
| 4 | 지금 실패하는 시험 두 개를 12-4에 넣음: erp-helper.test.ts AC-3801.4(TASK-15), make-fake-fixtures.test.ts AC-005.2(TASK-17) | 12-4 | TASK-15 · TASK-17 |
| 5 | 의사랑 등록 때 자료원 파일 쓰기·지우기 실패 → `E-STORE-FAILED` · `STEP-UIS` · 2, 설치 글 | 4-3 · 10-5 | TASK-15 |
| 6 | `josa.js`도 manifest 목록·모듈 목록에 | 8-9 · 12-4 | TASK-14 |
| 7 | 진료 0건 묻기·이미 적힌 칸 묻기 첫 줄을 의사랑이면 '의사랑' | 10-1 · 11절 22 | TASK-17 |
| 8 | 일꾼이 정한 것 가운데 뜻이 바뀌는 것 기록: `E-UIS-FOLDER` 상수는 `UisDiskFolder.FolderFailed` · `UisCache.Save`는 bool · 모아 둔 값 최대 약 48시간 · 날짜·조건 둘 다 틀린 파일은 notAll · 차트번호 수로 견줌 · `fractional` 타입 · `sales` 명령 표 꼴 · 확장 크기 실측 · E-UIS-FOLDER 글 | 3-1 · 3-2 · 4-1 · 4-4 · 5-2 · 5-3 · 7-2 · 10-4 | 없음(이미 그렇게 됨) |
| 9 | '-환자별' 안내는 저장법 둘째 줄 하나만(표 밑 줄 뺌) | 10-6 | TASK-17 |
| 10 | 설정 화면 폴더 글은 늘 'ERP마감 폴더' + 맨 위 상자에 자리 설명(코드 목록 답에 폴더 칸을 더하지 않음) | 10-6 · 11절 21 | TASK-17 |
| 11 | TASK-12가 정한 것 기록: 기간 없는 코드 목록 ok 글 · 기타 이름 빈 채 저장 | 10-6 · 11절 23 | 없음(이미 그렇게 됨) |
| 12 | `Send` 타입은 `uisTypes.ts` 한 곳(uisOptions.ts·uisFlow.ts가 가져다 씀) | 8-1 | TASK-17 |
| 13 | 설정이 둘 다 없으면 도우미에 묻지 않고 비트로 둔다 — 지금 시험(main AC-3609.2, main.range AC-3701.3 둘 '설정 저장 전 도우미 안 부름')과 AC-4215.2를 지키려고. 비트 흐름이 '비트 설정 없음'에 닿으면 자료원을 다시 정해, 새 의사랑 PC는 첫 누름에 설정 화면이 열리고 의사랑 설정 저장 뒤 새로고침 없이 의사랑 흐름. 그 PC 첫 사용 때 단추 이름은 [비트 값 채우기](13절 확인 목록) | AC-4211.1 · 11절 19 · 13절 | 없음(TASK-14가 이미 그렇게 함) |
| 14 | 새 파일·새 단계·새 출력 줄 때문에 `erp-helper.test.ts` 기대값 셋을 12-4에 더함(AC-3611.2 · AC-3806.1 · AC-3806.2) | 12-4 | 없음(TASK-15가 이미 그렇게 함) |

### 3. 도우미 명령과 답 모양

#### 3-1. `helper-erp/commands.json` (더하는 것만)
```jsonc
"closing.source":   { "patient": false, "args": {} },
"closing.uisCodes": { "patient": false, "args": {} },
// closing.day args에 더함(나머지 칸·groups 꼴은 그대로)
"sales": { "type": "array", "optional": true, "min": 0, "max": 10,
           "items": { "type": "object", "fields": {
             "key":   { "type": "enum", "values": ["carm","sono","arthro","manual","eswt","pt","etc1","etc2","etc3","etc4"] },
             "codes": { "type": "array", "min": 1, "max": 20, "items": { "type": "string", "min": 1, "max": 20, "pattern": "^\\S(?: ?\\S)*$" } } } } }
```
- 명령 차례: `closing.codes`·`closing.day`·`closing.findCodes`·`closing.source`·`closing.uisCodes`. 비트 처리기는 `sales`를 읽지 않는다(지금 `Groups(request)`는 `groups`만 본다).
- 의사랑에서 `groups`는 '건수로 셀 코드'(묶음 key 13개 가운데 코드를 고른 것만, 3-2), `sales`는 '매출로 셀 코드'(10개 가운데 고른 것만). 코드를 하나도 고르지 않은 묶음은 보내지 않는다(그래서 `codes` 최소 1은 그대로).

#### 3-2. 의사랑 `closing.day` 답 (`data`)
비트 답(`extension-erp/src/types.ts` `ClosingDay`)과 칸 이름·차례가 같다. `N` = 0 이상 정수 또는 null.
```ts
{
  date: 'YYYY-MM-DD',
  patients: { new: N, first90: null, return: N, ptVisit: N, noExamFee: N, total: N },
  groups: { key, patients: N, total: N, unpaidVisits: null, new: null, first90: null, return: null }[],
  ages: { band: '0'|'10'|…|'90', new: N, first90: null, return: N }[],   // 늘 10개, band 차례
  money: { total: N, insurer: N, receivableIn: null, unpaidNew: null, noncovered: N, discount: null,
           disabledFund: null, received: N, card: N, cash: N, transfer: null, refund: null },
  inpatientVisits: null,
  reservations: { kinds: [], patients: N },
  injection: null,
  overlap: null,
  warnings: { moneyUnconfirmed: false, splitUnconfirmed: false, unpaidVisits: 0, unknownAge: number, noHistory: false },
  source: 'uisarang',
  uis: {
    folder: 'desktop' | 'profile',
    reports: { kind, state, cached, from, to, value, columns }[],  // 늘 6개, UIS_KINDS 차례(5-1)
    open: (kind | 'unknown')[],     // 한셀 등에 열려 읽지 못한 파일의 보고서(파일 이름으로 짐작, 5-4)
    deleted: number,                // 이번에 지운 파일 수(종류 모름 포함)
    kept: number,                   // 남겨 둔 파일 수(날짜 다름·같은 날 둘)
    deleteFailed: number,
    unknownFiles: number,           // 종류 모름·깨짐·20MB 넘음으로 지운 파일 수
    checks: { totalFee, received, headcount, rxTotal, visitRows, visitNew, rsvRows, rsvVisited: [number, number] | null, noDate: boolean },
    fractional: UisCountKey[],      // 소수 총투여량 때문에 null로 둔 건수 묶음 key
    negative: ('return' | 'noExamFee')[],
    reservations: { total: number, visited: number } | null   // 예약 참고 숫자(6-1)
  }
}
```
- `reports[].state`: `ok` · `missing`(파일 없음, 모아 둔 값도 없음) · `otherDate` · `notAll` · `twice`. `cached` = 이번엔 파일이 없어 모아 둔 값(4-4)을 씀(state는 ok). `from`·`to` = 조회일(없으면 null, 예약 아래쪽 표는 예약일). `value` = notAll일 때 '전체'가 아닌 라벨 값(없으면 null). `columns` = 못 찾은 칸 이름(5-3).
- `groups` 차례: args `groups` 차례대로 { patients = 건수, total = 같은 key의 `sales` 합 또는 null }, 이어서 `sales`에만 있는 key를 `sales` 차례로 { patients: null, total }. 같은 key가 `groups`에 두 번이면 지금처럼 `E-HELPER-BAD-MESSAGE`(비트 `CheckGroups`와 같은 규칙, 의사랑 쪽 새 검사), `sales`도 같다.
- 보고서가 ok·cached가 아니면 그 보고서에 기대는 값은 모두 null(6-1 표 '보고서' 열).

#### 3-3. `closing.uisCodes` 답
```ts
{ state: 'ok' | 'missing' | 'notAll' | 'twice' | 'open', from: string | null, to: string | null, value: string | null,
  codes: { code: string, name: string | null, qty: number, amount: number }[] }   // qty = 읽은 총투여량 합(소수 가능), amount = 원 정수
```
- 폴더의 처방통계를 머리글로 찾는다(기간·조회일은 보지 않음, 최근 석 달 권함). 코드마다 한 줄(코드 꼴 정리 4-1 `UisRules.Code` 기준으로 합침, name = 처음 나온 처방명칭), 총액 큰 차례, 같으면 코드 글자 차례, 2,000개까지. 21자 넘는 코드도 목록에는 넣는다(확장이 고를 수 없게 함).
- 처방통계는 읽은 뒤 지운다(state ok·notAll). twice면 지우지 않는다. 환자별 엑셀·종류 모름은 5-5대로 지우고, 다른 합계 엑셀은 건드리지 않는다. 열린 파일이 있으면 아무것도 읽지 않고 `open`.

#### 3-4. `closing.source`
- 비트 자료원 `{ source: 'bit' }`, 의사랑 자료원 `{ source: 'uisarang' }`. 등록 확인·비트·폴더에 닿지 않는다.

#### 3-5. 오류 번호(새것)
| 번호 | 언제 |
|---|---|
| `E-UIS-FOLDER` | 엑셀 폴더를 만들 수 없음·폴더가 연결(reparse)·목록을 못 읽음 |
| `E-CLOSING-WRONG-SOURCE` | 비트 자료원에 `closing.uisCodes`, 의사랑 자료원에 `closing.codes`·`closing.findCodes` |
- 의사랑 `closing.day`의 오늘 뒤 날짜는 지금 `E-CLOSING-FUTURE-DATE`. 엑셀이 깨졌거나 못 지운 것은 오류가 아니라 답 칸(`unknownFiles`·`deleteFailed`)이다. 모아 둔 값 파일을 못 읽거나 못 쓰면 오류 없이 모아 둔 값 없이 간다(기록엔 번호만).

### 4. 도우미 구조

#### 4-1. `helper-erp/src/Erp.Core/Uisarang/` (namespace `Erp.Core.Uisarang`, netstandard2.0)
```csharp
// UisTypes.cs (TASK-1) — 공용 모양(아래 열거형·구조 + UisFolderKind{Desktop,Profile}·UisSourceFile·UisArgs·UisCodeRow·UisFactsSet·UisDayResult·UisCodesResult 답 모델)
public enum UisKind { Income, Rx, Visits, VisitPatients, Rsv, RsvPatients }   // JSON 이름 income·rx·visits·visitPatients·rsv·rsvPatients
public enum UisState { Ok, Missing, OtherDate, NotAll, Twice }
public readonly struct XlsCell { public string? Text { get; } public double? Number { get; } }   // 둘 다 null = 빈 칸
public sealed class UisSheet { UisKind? Kind; IReadOnlyDictionary<string,string> Labels; int HeaderRow;
                               IReadOnlyDictionary<string,int> Columns; IReadOnlyList<string> MissingColumns; IReadOnlyList<IReadOnlyList<XlsCell>> Rows; }
public interface IUisFolder {                     // 실제 = UisDiskFolder, 시험 = 가짜
  IReadOnlyList<UisFile> List();                   // 바로 아래 *.xls 보통 파일만(이름 차례)
  bool IsOpen(UisFile file);                       // 독점 열기 실패 = true
  byte[] Read(UisFile file);
  bool Delete(UisFile file);                       // 못 지우면 false(예외 없음)
}
public sealed class UisFile { string Name; long Length; }
// 보고서마다 '숫자만' 남긴 것(모아 둔 값 4-4로도 쓰는 모양). 글자 칸 없음(AC-4209.3)
public sealed class IncomeFacts { long? TotalFee, Covered, Insurer, Received, Noncovered, First, Return, Headcount, Cash, Card; string[] Columns; }
public sealed class RxFacts { IReadOnlyDictionary<string, RxCode> Codes; long? TotalAmount; string[] Columns; }   // RxCode { double Qty; long Amount; }
public sealed class VisitsFacts { long? People, New; string[] Columns; }
public sealed class VisitPatientFacts { int Rows, NewRows, UnknownAge; int[] AgeNew, AgeReturn /* 10칸 */; bool HasDate; string[] Columns; }
public sealed class RsvFacts { long? Total, Visited; string[] Columns; }
public sealed class RsvPatientFacts { int Rows, Visited, DistinctCharts; bool AllOnDay; string[] Columns; }

// XlsRows.cs (TASK-1)
public static class XlsRows { public static IReadOnlyList<IReadOnlyList<XlsCell>> Read(byte[] bytes); }  // 첫 시트, 20,000줄·64칸 넘으면 UisFileException
public sealed class UisFileException : Exception { }                     // 글에 칸 값 없음

// UisReport.cs (TASK-3) — 5-1·5-2·5-3
public static class UisReport { public static UisSheet Read(IReadOnlyList<IReadOnlyList<XlsCell>> rows); public static UisKind? GuessByName(string fileName); }

// UisRules.cs·UisAge.cs·UisSource.cs (TASK-4)
public static class UisRules {
  public static string? FindUisarang(IEnumerable<string> fixedDriveRoots, Func<string,bool> fileExists);   // 'C:\ysr2000' 또는 null
  public static UisFolderKind ChooseFolder(string? desktop, string profile, IEnumerable<string?> cloudRoots); // Desktop | Profile
  public static string Code(string text);                                    // 앞뒤 빈칸 뗌·가운데 빈칸 하나로·대문자
}
public static class UisAge { public static int? Age(string? rrn, DateTime day); public static int Band(int age); }  // Band: 0·10·…·90(90 이상)
public static class UisSource { public static UisSourceFile? Read(string dataDir); public static void WriteUisarang(string dataDir, UisFolderKind folder); public static void Delete(string dataDir); }
// data\source.json = { "v": 1, "source": "uisarang", "folder": "desktop" | "profile" }(글자 그대로, 보호 없음 — 환자·병원 정보 없음)

// UisIncome.cs·UisRx.cs (TASK-7), UisPatients.cs·UisVisits.cs (TASK-8)
public static class UisIncome { public static IncomeFacts Read(UisSheet s); }
public static class UisRx { public static RxFacts Read(UisSheet s); public static IReadOnlyList<UisCodeRow> List(UisSheet s); }
public static class UisVisits { public static VisitsFacts Read(UisSheet s, DateTime day); public static RsvFacts ReadRsv(UisSheet s, DateTime day); }
public static class UisPatients { public static VisitPatientFacts ReadVisits(UisSheet s, DateTime day); public static RsvPatientFacts ReadRsv(UisSheet s, DateTime day); }

// UisDiskFolder.cs·UisCache.cs (TASK-9)
public sealed class UisDiskFolder : IUisFolder { public const string FolderFailed = "E-UIS-FOLDER"; public UisDiskFolder(string path); }   // 없으면 만듦, 연결 폴더면 FolderFailed. Read 실패는 UisFileException(고정 글)
public sealed class UisCache { public UisCache(string dataDir, IProtector protector, Func<DateTime> now);
  public UisFactsSet? Load(DateTime day); public bool Save(DateTime day, UisFactsSet facts); }   // 파일 data\uis-cache.bin, 못 쓰면 false(예외 없음)

// UisDay.cs·UisCodes.cs·UisCommands.cs (TASK-13)
public static class UisDay { public static UisDayResult Read(IUisFolder folder, UisCache cache, DateTime day, UisArgs args, UisFolderKind folderKind); }
public static class UisCodes { public static UisCodesResult Read(IUisFolder folder); }
public static class UisCommands {
  public const string SourceName = "closing.source", CodesName = "closing.uisCodes";
  public const string WrongSource = "E-CLOSING-WRONG-SOURCE";   // E-UIS-FOLDER는 UisDiskFolder.FolderFailed
  public static void RegisterUisarang(Dispatcher d, UisServices s);   // closing.source·closing.day·closing.uisCodes + codes·findCodes = WrongSource
  public static void RegisterBitExtras(Dispatcher d);                 // closing.source(bit)·closing.uisCodes = WrongSource
}
public sealed class UisServices { Func<IUisFolder> Folder; UisFolderKind FolderKind; UisCache Cache; Func<DateTime> Today; }
```
- `Erp.Core`는 `IProtector`(Precheck.Core)만 안다. DPAPI(`DpapiProtector`)는 Erp.Helper가 넣는다.

#### 4-2. 의사랑 `closing.day` 한 번 읽기 차례 (`UisDay.Read`)
1. 날짜가 `Today()`보다 뒤면 `E-CLOSING-FUTURE-DATE`(폴더에 닿기 전). args 묶음 key 겹침 검사(3-2).
2. `folder.List()`(폴더 만들기·연결 검사는 `UisDiskFolder` 생성 때 → `E-UIS-FOLDER`).
3. **첫째 돌기(열림 보기)**: 모든 파일 `IsOpen`. 하나라도 열려 있으면 어느 파일도 읽거나 지우지 않고, 열린 파일마다 `GuessByName`(모르면 'unknown')을 `uis.open`에 담고, 보고서는 모아 둔 값만으로 채운 답을 낸다(확장은 ⑫에서 멈춤).
4. **둘째 돌기(파일마다, 이름 차례)**: 20MB 넘음 → 지움·`unknownFiles`. 아니면 `bytes = Read` → `XlsRows.Read` → `UisReport.Read`.
   - 깨짐(`UisFileException`)·종류 모름 → 곧바로 지움·`unknownFiles`.
   - 환자별 종류(`VisitPatients`·`RsvPatients`) → **곧바로 지움**(셈하기 전, 다음 파일을 읽기 전) → `UisPatients.Read…`로 숫자만 남김 → `bytes`는 `Array.Clear`.
   - 합계 종류 → 시트를 들고 있다가 6에서 정함.
5. 종류마다 고르기(5-5 '고르기'): 0개 → missing, 1개 → 그 파일, 여럿 → 합계는 조회일이 마감 일자 하루인 것이 꼭 하나면 그것(나머지는 otherDate로 남김), 아니면 twice. 환자별이 여럿이면 twice.
6. 고른 합계 파일을 읽어(`UisIncome`·`UisRx`·`UisVisits`) state를 정하고, 5-5대로 지우거나 남긴다(지우기는 모두 이 단계 끝에 한 번에).
7. 모아 둔 값: 이번 ok 보고서 숫자를 그날 값에 덮어 쓰고 저장. 이번에 missing인 보고서는 그날 모아 둔 값이 있으면 그것(cached). 다른 날 값은 버린다.
8. 셈(6절) → 답.
- 어느 단계에서 예외가 나도 환자별 파일은 이미 지워졌거나(4) 읽지 않았다(3). 예외 글에는 칸 값을 넣지 않는다.

#### 4-3. 자료원과 등록 (`Erp.Helper`)
- `--register`(지금 `Register`): `ErpStage.Set(Find)` 뒤 지금처럼 `RegisterFlow.Run(ErpServices.Create())`. 그 안에서 `E-BIT-NOT-FOUND`가 나면 그때만 `UisRules.FindUisarang(로컬 고정 드라이브 뿌리, File.Exists)`:
  - 있으면 `ErpStage.Set(Uis)` → `ChooseFolder(바탕화면, %USERPROFILE%, [%OneDrive%, %OneDriveCommercial%, %OneDriveConsumer%])` → 폴더 만들기 → `UisSource.WriteUisarang` → 표준 출력 `SOURCE-UISARANG`·`FOLDER-DESKTOP|FOLDER-PROFILE`(ASCII 두 줄) → 0. 폴더를 못 만들면 `E-UIS-FOLDER`·`STEP-UIS` → 2.
  - 없으면 지금 그대로(`E-BIT-NOT-FOUND`·`STEP-FIND` → 2).
  - 비트 저장(0)이면 `UisSource.Delete`(있을 때만).
  - **파일 오류**(고침 5): `UisSource.WriteUisarang`·`UisSource.Delete`가 던지는 `IOException`·`UnauthorizedAccessException`은 등록 흐름에서 잡아 `E-STORE-FAILED`(지금 '등록 파일을 읽거나 쓰지 못함' 번호)·`STEP-UIS`로 2다. 비트 저장 뒤 `Delete`가 실패해도 2다(의사랑 표시 파일이 남으면 다음에 도우미가 의사랑으로 켜지므로 '등록함'으로 끝내지 않는다. 비트 등록 파일은 이미 저장돼 있어 다시 실행하면 된다). 폴더 만들기 실패는 `E-UIS-FOLDER`·`STEP-UIS`로 2. 기록엔 지금처럼 register와 번호만. 설치 글은 10-5
- 크롬이 켤 때: `UisSource.Read(DataDirectory())`가 맞으면 `UisCommands.RegisterUisarang(dispatcher, UisHelperServices.Create(sourceFile))`, 아니면 지금 줄 `ClosingCommands.Register(dispatcher, ErpServices.Create())` 뒤에 `UisCommands.RegisterBitExtras(dispatcher)`. 비트 갈래는 지금 줄을 그대로 두고 한 줄만 더한다(AC-4215.4).
- `UisHelperServices.Create`(Erp.Helper, Erp.Core `UisServices`를 만든다): 폴더 경로 = 그때 다시 `ChooseFolder`로 셈(등록 뒤 OneDrive가 켜졌으면 사용자 폴더로 옮겨 감 — 안전 쪽), `UisCache(DataDirectory(), new DpapiProtector(), () => DateTime.Now)`, `Today = DateTime.Today`.
- `ErpStage.Uis = "UIS"`. install.ps1 멈춘 단계 글 '의사랑 등록(엑셀 폴더·자료원 파일)'.

#### 4-4. 모아 둔 값 (`UisCache`)
- 파일 `data\uis-cache.bin` = `IProtector.Protect(UTF-8 JSON { v: 1, day: 'YYYY-MM-DD', savedAt: 'ISO', reports: { kind: facts } })`. facts는 4-1 `*Facts`(숫자·칸 이름·코드별 합만).
- `Load(day)`: 날짜가 다르거나 `savedAt`이 24시간 넘었거나 풀 수 없으면 null. `Save`는 그날 값에 보고서별로 덮어 쓴다(다른 날이면 새로). `savedAt`은 마지막 저장 시각(이 PC 시각)이라, 같은 날을 이어 읽으면 앞서 읽은 보고서 값이 24시간보다 오래(최대 약 48시간) 남을 수 있다 — 그날 값만 쓰므로 틀린 날 값은 섞이지 않는다(TASK-9).
- 처방통계 값은 묶음 합이 아니라 **코드별 합**으로 둔다(설정에서 코드를 바꾼 뒤 다시 눌러도 맞게).

#### 4-5. 진단 기록
- 지금 `ErpLog.Write(code)`만 쓴다: 시각·명령 이름·오류 번호. 파일 이름·보고서 종류·숫자·폴더 경로는 쓰지 않는다(AC-4209.4).

### 5. 의사랑 엑셀 모양과 읽기 규칙
(조사 노트 3·4·4-2절에서 파일 모양만 옮김. 실제 파일·숫자는 저장소에 없다)

#### 5-1. 알아보기 (`UIS_KINDS` 차례 = 번호)
| 번호 | kind | 의사랑 메뉴 › 보고서 · 표 | 알아보는 머리글 칸(모두 있어야) | 없어야 하는 칸 | 꼭/선택 | 환자 정보 |
|---|---|---|---|---|---|---|
| 1 | income | 수입통계 › 일일수입통계 | 보험구분 · 진료수납액 | — | 꼭 | 없음 |
| 2 | rx | 진료통계 › 기간별처방통계 위쪽 표 | 코드 · 처방명칭 · 총액 | — | 꼭 | 없음 |
| 3 | visits | 인원통계 › 내원일별환자현황 위쪽 표 | 내원일 · 인원수 · 신규환자 | 차트번호 | 선택 | 없음 |
| 4 | visitPatients | 내원일별환자현황 아래쪽 표 | 차트번호 · 신규환자 | 예약일 | 꼭 | **있음** |
| 5 | rsv | 인원통계 › 예약환자통계 위쪽 표 | 예약일 · 예약건수 | 차트번호 | 선택 | 없음 |
| 6 | rsvPatients | 예약환자통계 아래쪽 표 | 예약일 · 차트번호 · 방문여부 | — | 꼭 | **있음** |
- 머리글 줄 = 위에서 30줄 안에서 칸 글자(빈칸 모두 뺌)가 한 종류의 '모두 있어야' 칸을 품고 '없어야' 칸이 없는 첫 줄. 두 종류에 맞으면 종류 모름.
- 그 아래 줄 가운데 머리글 줄과 칸 글자가 같은 줄(쪽 나눔 되풀이)·모든 칸이 빈 줄은 건너뛴다.

#### 5-2. 라벨 줄 (머리글 줄 위)
- 칸 글자가 `[`로 시작하고 `]`가 있는 칸이 라벨. 이름 = 괄호 안 빈칸 뺀 글자(`[조 회 일]` → `조회일`, `[외/입 구분]` → `외/입구분`). 값 = 같은 칸 `]` 뒤 글자(앞뒤 빈칸 뗌), 비었으면 같은 줄 오른쪽 첫 글자 칸.
- 조회일 값: `YYYY-MM-DD` 또는 `YYYY-MM-DD ~ YYYY-MM-DD`(구분 `-`·`.`·`/`, 물결 앞뒤 빈칸 상관없음) → from·to. 아니면 from·to = null.
- 합계 엑셀(1·2·3·5): 조회일이 없거나 from = to = 마감 일자가 아니면 otherDate(`closing.uisCodes`는 기간을 보지 않음). 환자별 엑셀(4): 조회일 라벨이 있으면 같은 규칙, 없으면 날짜를 보지 않고 `checks.noDate = true`. 환자별 엑셀(6): 예약일 칸으로 본다(AC-4208.1).
- 조건: 조회일이 아닌 라벨 가운데 값이 날짜 꼴이 아니고 '전체'도 아니면 notAll(`value` = 그 값, 여럿이면 첫 것). 값이 빈 라벨은 조건이 아니다. 라벨이 없으면 조건은 보지 않는다(실제 PC 확인 13절 2).
- 한 파일이 날짜도 다르고 조건도 '전체'가 아니면 notAll(지우는 쪽, TASK-3).
- 답에는 라벨 이름 칸이 없다(`reports[].value`만). 그래서 ⑩ 글은 늘 '외/입 구분' 글 하나다(10-1).

#### 5-3. 보고서마다 찾는 칸 (머리글 글자, 빈칸 뺌)
| kind | 찾는 칸 | 줄 |
|---|---|---|
| income | 보험구분 · 총진료비 · 급여총액 · 청구액 · 진료수납액 · 비급여 · 초진수 · 재진수 · 인원계 · 현금수납액 · 카드수납액 | 보험구분 = '합계'인 줄 하나 |
| rx | 코드 · 처방명칭 · 총투여량 · 총액 | 코드 칸이 비지 않고 '합계'가 아닌 줄 = 코드 줄, 코드·처방명칭 칸이 '합계'인 줄 = 합계 줄 |
| visits | 내원일 · 인원수 · 신규환자 | 내원일 = '합계'인 줄, 없으면 내원일 = 마감 일자인 줄 하나 |
| visitPatients | 차트번호 · 주민등록번호 · 신규환자 | 차트번호가 숫자 1~12자리인 줄 |
| rsv | 예약일 · 예약건수 · 이행건수 | 예약일 = '합계'인 줄, 없으면 예약일 = 마감 일자인 줄 하나 |
| rsvPatients | 예약일 · 차트번호 · 방문여부 | 차트번호가 숫자 1~12자리인 줄 |
- 환자별 표의 수진자명·전화번호·주소·휴대전화·보험구분·진료실 칸은 찾지 않는다(rsvPatients는 주민등록번호도 찾지 않는다).
- 칸이 없거나 같은 이름이 둘이면 그 칸 이름을 `columns`에 담고, 그 칸에 기대는 값만 null이다. 숫자 칸 값: 숫자 칸은 그 값, 글자 칸은 쉼표·빈칸을 떼고 숫자 꼴이면 그 값, 빈 칸은 0이 아니라 '없음'(합계 줄의 빈 칸은 null).
- income 총진료비: 합계 줄 칸이 숫자면 그것, 비었으면 바로 아래 줄 같은 칸(병합 칸), 둘 다 아니면 null.
- rx 총투여량: 소수 그대로 더한다. 총액: 줄마다 원 미만 버림(`Math.Truncate`) 뒤 더한다.
- 차트번호는 수로 견준다('09000001' = 9000001, 메모리에도 수로만, TASK-8).

#### 5-4. 파일 이름 짐작 (열림 안내에만)
- 의사랑 기본 저장 이름 `통계-{보고서}.xls`. 이름(빈칸 뺌)에 '일일수입' → income, '처방' → rx, '내원일별' + ('환자별' 또는 '아래') → visitPatients, '내원일별' → visits, '예약' + ('환자별' 또는 '아래') → rsvPatients, '예약' → rsv, 그 밖 'unknown'. 파일 이름은 답·기록에 넣지 않는다.

#### 5-5. 고르기·지우기·남기기
| 경우 | 합계 엑셀(1·2·3·5) | 환자별 엑셀(4·6) |
|---|---|---|
| 읽음(ok) | 다 읽은 뒤 지움 | 알아본 바로 뒤 지움 |
| 조건이 '전체' 아님(notAll) | 지움 | 지움 |
| 조회일 다름(otherDate) | **남김** | 지움 |
| 같은 날 같은 종류 둘 이상(twice) | **남김** | 지움 |
| 같은 종류 여럿 가운데 마감 일자 것이 꼭 하나 | 그것을 읽고 지움, 나머지는 otherDate로 남김 | (해당 없음 — 여럿이면 twice) |
| 깨짐 · 종류 모름 · 20MB 넘음 | 지움 | 지움 |
| 어느 파일이든 열려 있음 | 모두 그대로(읽지 않음) | 모두 그대로(읽지 않음) |
- 남김·지움은 그 보고서 state와 상관없이 위 표대로다(예: 일일수입통계가 ok여도 다른 보고서 때문에 멈추면 일일수입통계는 지우고 값은 모아 둔다).

#### 5-6. .xls 읽기 (ADR-050)
- `ExcelReaderFactory.CreateBinaryReader(new MemoryStream(bytes))`로 BIFF8만 연다(zip·HTML·CSV를 저절로 고르는 `CreateReader`를 쓰지 않음 → `.xlsx`·HTML은 `UisFileException`). 첫 시트만, `reader.Read()`로 줄마다 `GetValue(i)`: `double`·`int` → Number, `string` → Text, `DateTime` → Text `yyyy-MM-dd`, 그 밖 → Text `ToString(InvariantCulture)`.
- .NET Framework 4.8(도우미)은 코드 페이지가 기본으로 있어 등록하지 않는다. 시험(net10.0)은 시험 시작에서 `Encoding.RegisterProvider(CodePagesEncodingProvider.Instance)`.

### 6. 셈과 ERP 칸

#### 6-1. ERP 칸 ← 값 (`uisCells` 차례 = 지금 `planCells` 차례)
| 업무일지 › 구역 | ERP 칸 | 값 | 보고서(없으면 missing) | 비면 |
|---|---|---|---|---|
| 1 › 환자현황 | 신환 | 위쪽 표 신규환자(합계 줄) / 없으면 아래쪽 표 신규 줄 수 | visits 또는 visitPatients | unknown |
| | 90일초진 | — | — | none |
| | 재진 | 재진수 − 물리치료내원(물리치료내원 코드를 안 골랐으면 재진수) | income (+ rx) | unknown |
| | 물리치료내원 | `ptVisit` 코드 총투여량 합 | rx | 안 골랐으면 unpicked |
| | 진찰료 산정안함 | 환자 합계 − (초진수 + 재진수) | income + (visits 또는 visitPatients) | unknown |
| | 합계 | 위쪽 표 인원수 / 없으면 아래쪽 표 환자 줄 수 | visits 또는 visitPatients | unknown |
| 1 › 진료 · 치료현황 | 씨암 … 수술(10줄) | 그 묶음 '건수로 셀 코드' 총투여량 합 | rx | unpicked |
| 1 › 외래 수입 | 외래 총매출 · 청구액(-) · 비급여 · 진료수납액 · 카드수납액(-) · 현금수납액(-) | 총진료비 · 청구액 · 비급여 · 진료수납액 · 카드수납액 · 현금수납액 | income | unknown |
| | 미수입금(+) · 미수발생(-) · 감액 · 장애인기금(-) · 계좌이체액(-) · 현불/환불(-) | — | — | none |
| 1 › 입원수입 | 4칸 | — | — | none |
| 2 › 예약 | 종류 6줄 × 총갯수·내원·변경·취소 | — | — | none |
| | 실예약환자수(총갯수 열) | 아래쪽 표 서로 다른 차트번호 수 | rsvPatients | unknown |
| 2 › 치료별 신환/90일초진/재진 건수 | 9줄 × 3 | — | — | none |
| 2 › 연령별 신환/90일초진/재진 | 10줄 × 신환·재진 | 아래쪽 표 만 나이 구간별 신규 / 그 밖 | visitPatients | unknown |
| | 10줄 × 90일초진 | — | — | none |
| 2 › 운영 지표 낱칸 | 도수 총금액 · 충격파 총금액 | 도수·충격파 '매출로 셀 코드' 총액 합(치료별 매출과 같은 값) | rx | unpicked |
| | ESWT Standard · ESWT Radial | 그 묶음 '건수로 셀 코드' 총투여량 합 | rx | unpicked |
| | 주사1회환자 · 신환주사환자 · 신환주사건수 | — | — | none |
| 2 › 치료별 매출 | 씨암 · SONO · 관절조영 · 도수 · 충격파 · 물리치료 · 기타1~4 | 그 묶음 '매출로 셀 코드' 총액 합 | rx | unpicked(기타: 이름이 비면 noName) |
- 'none' 칸은 75칸(업무일지 1: 1 + 6 + 4 = 11칸, 업무일지 2: 24 + 27 + 10 + 3 = 64칸). 계획(`planUisCells`)에는 넣지 않아 `fillAll`이 건드리지 않는다. 'missing' 칸(그 보고서가 missing)도 계획에 넣지 않고 따로 센다.
- 진료 · 치료현황·치료별 매출 줄 이름과 낱칸 이름은 지금 `cells.ts` 상수 그대로(같은 ERP 자리). 기타 줄 이름 = 의사랑 설정의 기타 이름.
- `uis.reservations`: 위쪽 표가 ok면 { 예약건수, 이행건수 }, 아니면 아래쪽 표 { 줄 수, 방문 줄 수 }, 둘 다 없으면 null.

#### 6-2. 맞춰 보기 (`uis.checks`, 경고만)
| 칸 | 왼쪽 ≠ 오른쪽 |
|---|---|
| totalFee | 총진료비 ≠ 급여총액 + 비급여 |
| received | 진료수납액 ≠ 현금수납액 + 카드수납액 |
| headcount | 인원계 ≠ 초진수 + 재진수 |
| rxTotal | 처방통계 합계 줄 총액 ≠ 코드 줄 총액 합 |
| visitRows · visitNew | 아래쪽 표 환자 줄 수 ≠ 위쪽 표 인원수 · 아래쪽 신규 줄 수 ≠ 위쪽 신규환자 |
| rsvRows · rsvVisited | 아래쪽 예약 줄 수 ≠ 위쪽 예약건수 · 아래쪽 방문 줄 수 ≠ 위쪽 이행건수 |
- 두 값 가운데 하나라도 null이면 그 칸은 null(견주지 않음). `noDate` = 아래쪽 내원 표에 조회일 라벨이 없음.

#### 6-3. 예약 총갯수 줄 확인 (조정자 결정 5)
- `specs/erp-closing-fill/notes/erp-closing-fields.md` 4-1절: "굵은 '총갯수' 줄 = 자동 합계·칸 없음". 지금 `cells.ts` `RSV_COLS`도 종류 6줄 × 4열과 실예약환자수만 계획하고 합계 줄은 없다. → ERP가 더하는 칸이라 넣을 자리가 없다. 그래서 실예약환자수만 채우고, 시안의 '예약 합계를 넣을 줄' 설정을 뺀다(11절). 예약건수·이행건수는 결과 안내의 참고 줄(10-2의 9)로만 보인다. [엑셀로 받기] 시트에는 넣지 않는다(7-1 숫자 줄 149줄 그대로, 고침 3).

#### 6-4. 만 나이 (`UisAge`)
- 주민번호 글자에서 빈칸·'-'를 빼고 앞 7글자가 모두 숫자일 때만. 7번째 1·2·5·6 → 1900, 3·4·7·8 → 2000, 9·0 → 1800. 생년월일이 달력에 없거나 마감 일자보다 뒤면 null. 만 나이 = (마감 일자 yyyymmdd − 생년월일 yyyymmdd) / 10000(정수). 구간 = min(나이 / 10 × 10, 90).

### 7. [엑셀로 받기]

#### 7-1. 시트 모양 (`uisSheetRows`, erp-copy-list design.md 5절과 같은 꼴, 날 하나)
- 1행 `['항목', '{M/D} ({요일})', '빈 칸 까닭']`. 그다음 `['업무일지 1']` → 구역마다 `['{구역}']` → 칸 줄 `[이름, 값 또는 null, 까닭 또는 null]` … `['업무일지 2']` → …
- 값: 숫자 칸(`Number`), 빈 칸은 null. 까닭 글(`UIS_TEXT.why`): direct '직접 입력' · none '의사랑에 없음' · unpicked '코드 안 고름' · unknown '못 읽음' · missing `'못 읽음 ({보고서} 없음)'`. noName(기타 이름 빔) 칸은 값을 그대로 쓰고 까닭은 null(엑셀에서는 줄 이름이 필요 없어서).
- 칸 이름: 업무일지 1 = 줄 이름. 업무일지 2 표 = `'{줄} {열}'`(치료별 매출·실예약환자수는 줄 이름만). 낱칸 = 칸 이름.
- `UIS_SHEET_FIELDS`(ERP 화면 차례, `erp-closing-fields.md` 2절 배치):
  - 업무일지 1: 진료 · 치료현황(10) → 외래 수입(외래 총매출 · 청구액(-) · 미수입금(+) · 미수발생(-) · 비급여 · 감액 · **MOU 감액**(direct) · 장애인기금(-) · 진료수납액 · 카드수납액(-) · 현금수납액(-) · 계좌이체액(-) · 현불/환불(-)) → 입원수입(4) → **지출**(현금 · 카드 · FREE, direct) → 환자현황(6) → **신환경로**(지인소개 · 간판 · 인터넷 · 홍보물 · 기타, direct)
  - 업무일지 2: 예약(종류 6줄 × 4열 → 실예약환자수) → 치료별 신환/90일초진/재진 건수(9줄 × 3) → **상담-전환률**(도수치료 · 체외충격파 · 기타 × 상담건수 · 예약건수 · 실행건수, direct) → 연령별(10 × 3) → 운영 지표(낱칸 7, 머리 '운영 지표') → 치료별 매출(머리 '치료별 매출 금액(원)', 10줄)
  - 넣지 않는 것: 담당자 · 휴무자(이름 고르기), 특이사항 · 상태(글·고르기), 괄호 칸(총매출(입원 수납액 포함) · 요양급여총액 · 건당진료비 = ERP가 셈), 치료사별 줄 · 이벤트 줄(병원마다 줄 수가 다름), 기본단가(따로 저장하는 병원 고정값).
  - 숫자 줄 149줄(업무일지 1: 41, 업무일지 2: 108).
- 시트 이름 `'ERP 마감일지 의사랑'`. 파일 이름 `` `ERP마감-의사랑-${date}.xlsx` ``. 열 너비 A 34 · B 11 · C 44, 틀 고정 A열·1행.

#### 7-2. 파일 쓰기 (`zip.ts`·`xlsxWrite.ts`)
```ts
// zip.ts — erp-copy-list zip.ts와 같은 이름·모양(합칠 때 한 벌로)
export function crc32(bytes: Uint8Array): number
export function zipStore(entries: readonly { name: string; data: Uint8Array }[], when: Date): Uint8Array   // 압축 없음, 이름 ASCII
// xlsxWrite.ts
export type SheetValue = string | number | null
export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
export function workbookBytes(rows: readonly SheetValue[][], opts: { sheetName: string; widths: readonly number[] }, when: Date): Uint8Array
```
- 파일 안·XML 꼴은 erp-copy-list design.md 5절 그대로(`[Content_Types].xml`·`_rels/.rels`·`xl/workbook.xml`·`xl/_rels/workbook.xml.rels`·가장 작은 `xl/styles.xml`·`xl/worksheets/sheet1.xml`, 글 칸 `inlineStr`, 빈 칸은 안 씀, XML 특수 글자 바꿈·제어 글자 뗌).
- **확장 묶음 크기**: 지금 `extension-erp/dist` 213,301바이트(17파일, 2026-11-24 `npm run ext-erp:build`). 직접 쓰는 zip·xlsx 두 파일은 컴파일 뒤 약 8KB, 의사랑 모듈 전체는 약 70KB로 어림 → 약 285KB(TASK-6 뒤 실제 252,930바이트, 그 가운데 두 파일 11,005바이트). SheetJS를 싣는다면 `xlsx.mini.min.js` 279,523바이트(+131%, ES 모듈이 아니라 내용 스크립트 목록에 따로 실어야 함) · `xlsx.mjs` 1,008,308바이트 · `xlsx.full.min.js` 951,904바이트가 더해진다(결정 3).

### 8. 확장 구조

#### 8-1. `uisTypes.ts` (TASK-2)
```ts
export const UIS_SETTINGS_KEY = 'erpClosingUis'
export const UIS_CODES_KEY = 'erpClosingUisCodes'
export const UIS_KINDS = ['income', 'rx', 'visits', 'visitPatients', 'rsv', 'rsvPatients'] as const
export type UisKind = (typeof UIS_KINDS)[number]
export const UIS_REQUIRED: readonly UisKind[]   // income · rx · visitPatients · rsvPatients
export const UIS_PATIENT: readonly UisKind[]    // visitPatients · rsvPatients
export const UIS_COUNT_KEYS = ['carm','sono','arthro','manual','eswt','manualConsult','lipus','nail','ct','surgery','eswtStd','eswtRadial','ptVisit'] as const
export const UIS_SALES_KEYS = ['carm','sono','arthro','manual','eswt','pt','etc1','etc2','etc3','etc4'] as const
export type UisCountKey = (typeof UIS_COUNT_KEYS)[number]; export type UisSalesKey = (typeof UIS_SALES_KEYS)[number]
export type UisState = 'ok' | 'missing' | 'otherDate' | 'notAll' | 'twice'
export type UisReport = { kind: UisKind; state: UisState; cached: boolean; from: string | null; to: string | null; value: string | null; columns: string[] }
export type UisDay = /* 3-2 모양 그대로 */
export type UisDayArgs = { date: string; groups: { key: UisCountKey; codes: string[] }[]; sales: { key: UisSalesKey; codes: string[] }[] }
export type UisSettings = { v: 1; counts: Partial<Record<UisCountKey, string[]>>; sales: Partial<Record<UisSalesKey, string[]>>; etcNames: Record<EtcKey, string> }
export type UisCodeRow = { code: string; name: string | null; qty: number; amount: number }
export type UisCodes = { v: 1; from: string; to: string; codes: UisCodeRow[] }
export type UisCodesAnswer = { state: 'ok' | 'missing' | 'notAll' | 'twice' | 'open'; from: string | null; to: string | null; value: string | null; codes: UisCodeRow[] }
export type Source = 'bit' | 'uisarang'
/** 도우미 부르기(서비스 워커 통로). 이 한 곳에서 내보내고 uisOptions.ts·uisFlow.ts가 같이 쓴다(TASK-17이 하나로 맞춤, 고침 12) */
export type Send = (cmd: ClosingCommand, args: Record<string, unknown>) => Promise<unknown>
export const UIS_OPEN_CODE = 'E-UIS-FILE-OPEN'   // ⑫ 안내 끝 번호(오류가 아니라 보일 번호)
```
- `types.ts`(더하기만): `ClosingCommand`에 `'closing.source' | 'closing.uisCodes'`, `ClosingDayArgs`에 `sales?: { key: GroupKey; codes: string[] }[]`.

#### 8-2. `uisText.ts` (TASK-2) — 의사랑 화면 글 한 곳(10절 글 그대로)
- `UIS_REPORT_NAMES: Record<UisKind, string>` = 일일수입통계 · 기간별처방통계 · 내원일별환자현황 위쪽 표 · 내원일별환자현황 아래쪽 표 · 예약환자통계 위쪽 표 · 예약환자통계 아래쪽 표.
- `UIS_TEXT`(안내·단추·까닭·경고 글, 함수 글은 숫자·날짜·이름만 받음), `UIS_OPTIONS_TEXT`(설정 화면), `UIS_FOLDER_TEXT = { desktop: '바탕화면 › ERP마감 폴더', profile: '사용자 폴더 › ERP마감 폴더' }`(ERP 화면 안내, 답 `uis.folder`로 고름), ★`UIS_OPTIONS_FOLDER = 'ERP마감 폴더'`(설정 화면, 10-6 ★ 폴더 글, 고침 10). 진료 0건·이미 적힌 칸 묻기 첫 줄(10-1 ★, 고침 7)도 여기.
- 조사(을/를·이/가·으로/로·와/과·은/는)는 지금 `josa.ts`로 붙인다.

#### 8-3. `uisSettings.ts` (TASK-5)
```ts
export function uisEmpty(): UisSettings                         // 모두 빈 목록, 기타 이름 ''
export function normalizeUis(raw: unknown): UisSettings | null  // 모양이 틀리면 null. 코드 = settings.ts cleanCode, 20개까지, 겹침 뺌
export async function loadUis(): Promise<UisSettings | null>
export async function saveUis(s: UisSettings): Promise<UisSettings>
export function normalizeCodes(raw: unknown): UisCodes | null
export async function loadUisCodes(): Promise<UisCodes | null>
export async function saveUisCodes(c: UisCodes): Promise<void>
export function toUisArgs(date: string, s: UisSettings): UisDayArgs   // 코드를 고른 묶음만, UIS_*_KEYS 차례
export function searchUis(codes: readonly UisCodeRow[], text: string): UisCodeRow[]   // 코드·처방명칭에 든 것(대소문자 무시) 30개
export async function savedSources(): Promise<{ bit: boolean; uis: boolean }>          // erpClosing·erpClosingUis 저장 여부(값은 읽지 않음)
```

#### 8-4. `uisCells.ts` (TASK-5)
```ts
export type UisWhy = 'unpicked' | 'unknown' | 'missing' | 'none' | 'noName'
export type UisCell = { where: Where; value: string | null; why?: UisWhy; report?: UisKind }   // noName이어도 value를 둔다(엑셀용)
export function uisCells(day: UisDay, s: UisSettings): UisCell[]                 // 6-1 표, planCells와 같은 차례
export function planUisCells(day: UisDay, s: UisSettings): Planned[]             // none·missing 뺌, noName은 value null
export function readUisDay(data: unknown, date: string): UisDay | null           // AC-4211.4
export type UisStop =
  | { kind: 'open'; kinds: (UisKind | 'unknown')[] }
  | { kind: 'otherDate'; reports: UisReport[]; patientDeleted: boolean }
  | { kind: 'notAll'; report: UisReport } | { kind: 'twice'; report: UisReport }
  | { kind: 'missing' } | { kind: 'some'; missing: UisKind[] }
export function stopOf(day: UisDay): UisStop | null                            // AC-4212.1~4212.3 차례
export function unreadLines(day: UisDay, cells: readonly UisCell[]): string[]   // '의사랑에서 읽지 못한 칸' 까닭(10-2)
export function checkLines(day: UisDay): string[]                               // 맞춰 보기 경고(10-2)
```

#### 8-5. `uisSheet.ts` (TASK-10)
```ts
export const UIS_SHEET_NAME = 'ERP 마감일지 의사랑'
export const UIS_SHEET_FIELDS: readonly ({ section: string } | { cell: Where } | { direct: string; section: string })[]  // 7-1
export function uisSheetRows(day: UisDay, s: UisSettings): SheetValue[][]
export function uisFileName(date: string): string
```

#### 8-6. `uisView.ts` (TASK-11) — 안내 안쪽 그리기(DOM, textContent만)
```ts
export type UisView =
  | { kind: 'stop'; stop: UisStop; day: UisDay; action: 'fill' | 'export' }     // ⑥⑦⑨⑩⑪⑫
  | { kind: 'done'; day: UisDay; cells: readonly UisCell[]; result: FillResult; canUndo: boolean }   // ③④⑤⑧
  | { kind: 'exported'; day: UisDay; fileName: string }                       // 10-3
  | { kind: 'range' } | { kind: 'first' } | { kind: 'err'; code: string }
export type UisAction = 'close' | 'fillAnyway' | 'export' | 'fill' | 'undo' | 'settings'
export function renderUis(doc: Document, view: UisView, act: (a: UisAction) => void): { head: string; body: HTMLElement; buttons: HTMLButtonElement[] }
```

#### 8-7. `uisFlow.ts` (TASK-14)
```ts
export const SOURCE_TIMEOUT_MS = 5_000
export async function decideSource(send: Send): Promise<Source>   // AC-4211.1 차례(저장 여부 → 필요할 때만 closing.source)
export function createUisFlow(deps: { doc: Document; dock: Dock; send: Send; openSettings(): void; today(): string }):
  { fill(): Promise<void>; exportXlsx(): Promise<void>; range(): void; act(a: UisAction): void; reset(): void }
export function downloadBytes(doc: Document, bytes: Uint8Array, name: string): void   // Blob + a[download] 누름 + 1초 안 revokeObjectURL
```
- 들고 있는 답(`held`): `{ date, day }` 하나. 마감 일자가 바뀌거나(지금 날짜 보기와 같음) 화면을 떠나면 버린다. 저장하지 않는다.

#### 8-8. `uisOptions.ts` (TASK-12)
```ts
export async function startUisOptions(doc: Document, deps: { send: Send }): Promise<void>   // 9-5·10-6
```

#### 8-9. 지금 모듈에 더하는 것
- `background.ts`: `COMMANDS`에 두 명령(배열 끝). 나머지 그대로.
- `errors.ts`: `export function explainFor(code: unknown, source: Source)` — 'uisarang'이면 `UIS_ERRORS`(10-4)에 있으면 그 글, 표에 없는 번호는 의사랑 '그 밖' 글, 나머지는 지금 `ERRORS`. `explain`은 그대로.
- `panel.ts`(Dock에 더함): `setSource('uisarang')`(큰 단추 글 '의사랑 값 채우기', [엑셀로 받기] 끼움) · `setUisReading(which: 'fill' | 'export' | null)` · `showUis(view: UisView)` · `setLastUis(view: UisView | null)` · handlers `onExport?()`·`onUisAction?(a)`. 비트 상태에서는 그리는 DOM이 지금과 같다.
- `main.ts`: `startPage`에서 Dock을 붙인 뒤 `decideSource` → 'uisarang'이면 `dock.setSource` + 단추 셋을 `createUisFlow`로 잇는다. 정해지기 전 누름은 정해질 때까지 기다린다. 비트면 지금 줄 그대로.
- `options.ts`: `startOptions` 맨 앞 — `erpClosingUis`만 저장돼 있으면 `startUisOptions` 하고 끝. 그 밖은 지금 그대로이고, `closing.codes`가 `E-CLOSING-WRONG-SOURCE`면 `startUisOptions`(오류 글 없이).
- `manifest.json`: `web_accessible_resources`에 내용 스크립트가 부르는 새 모듈 아홉(`uisTypes`·`uisText`·`uisSettings`·`uisCells`·`uisSheet`·`zip`·`xlsxWrite`·`uisView`·`uisFlow`)과 `josa`(지금은 설정 화면만 불러 목록에 없었고, panel → uisView → uisText가 부르게 됨, 고침 6) 모두 열·판 0.4.0. 권한은 그대로(`nativeMessaging`·`storage`).

### 9. 화면

#### 9-1. 어디에
- 지금 확장이 ERP 화면 오른쪽 아래에 붙이는 단추 줄·안내 상자(440px)를 그대로 쓴다. 새 화면·폰 모양 없음. 설정 화면은 지금 `options.html` 한 쪽에 의사랑 모양을 그린다.

#### 9-2. 저장 모양 (`chrome.storage.local`)
- `erpClosingUis` = `UisSettings`(8-1). 처음 값 = `uisEmpty()`(의원마다 코드가 달라 비어 있음).
- `erpClosingUisCodes` = `UisCodes`(코드·처방명칭·총투여량·총액, 환자 정보 없음). 설정 [저장]과 따로 [코드 목록 읽기] 때 곧바로 쓴다.
- 비트 `erpClosing`은 읽지도 쓰지도 않는다(`savedSources`는 있는지만 본다).

#### 9-3. 단추 줄
- 비트: 지금 그대로 [기간 채우기] [비트 값 채우기].
- 의사랑: [기간 채우기] [엑셀로 받기] [의사랑 값 채우기] — 가운데 [엑셀로 받기]는 [기간 채우기]와 같은 버금 단추 모양, 오른쪽 끝 큰 단추가 [의사랑 값 채우기].
- 읽는 중: 누른 단추 글이 '의사랑 엑셀 읽는 중…', 세 단추와 [지난 결과] 막힘.

#### 9-4. 흐름 차례
- [의사랑 값 채우기]: 마감 일자 없음 → 지금 글 · 오늘 뒤 → 지금 글 · `erpClosingUis` 없음 → 설정 화면 열고 ⑭ · 읽는 중 → `closing.day`(`toUisArgs`) → 오류 → `explainFor` 글 · 답에 `source`가 없음(비트 도우미) → `E-CLOSING-WRONG-SOURCE` 글 · 읽는 동안 날짜 바뀜 → 지금 글 · `stopOf` 멈춤 → ⑥⑦⑨⑩⑪⑫ · 환자 합계 0 → 지금 '진료 0건' 묻기 · 이미 적힌 칸 묻기(`survey(planUisCells)`) · `fillAll` → 결과(10-2).
- ⑦ [있는 엑셀로 채우기]: 들고 있는 답으로 '진료 0건' 묻기부터. [엑셀로 받기]: 들고 있는 답으로 받기.
- [엑셀로 받기](단추 줄): 앞 다섯 단계 같음 → `stopOf`가 ⑥⑨⑩⑪⑫면 멈춤(⑦은 묻지 않고 받음) → 받기 → 10-3.
- [기간 채우기]: ⑬만.

#### 9-5. 설정 화면 줄 차례 (시안 ⑯~⑱)
1. 치료별 건수 · 매출: 씨암 · SONO · 관절조영 · 도수 · 충격파(줄마다 '건수로 셀 코드' + '매출로 셀 코드') → 물리치료 · 기타1~4('매출로 셀 코드'만, 기타는 이름 칸)
2. 진료 · 치료현황만: 도수상담 · 리푸스 · 손발톱케어 · CT · 수술('건수로 셀 코드'만)
3. 운영 지표: ESWT Standard · ESWT Radial('건수로 셀 코드'만)
4. 환자현황: 물리치료내원('건수로 셀 코드'만)
5. 예약: 안내 한 줄(10-6)
- 그 아래 '매일 저장할 엑셀 6개' 표와 저장법, 맨 아래 개인정보 줄, 저장 줄(지금 그대로).

### 10. 화면 글
시안 notes.md '화면 글'이 기준이다. 아래는 그 글 그대로이거나, 조정자 결정으로 바뀐 글(★, 11절에도 적음)이다.

#### 10-1. 멈춤 안내 (머리: 채우기면 '의사랑 값 채우기', 받기면 '엑셀로 받기')
- ⑥ 엑셀 없음: '의사랑 통계에서 아래 보고서 6개를 엑셀로 저장해 주세요.' · 목록 머리 '저장할 엑셀' · 줄마다 '{번호}. {보고서}' + '있음'/'없음' · ★ '3 · 5번(위쪽 표)은 없어도 채울 수 있어요. 있으면 아래쪽 표와 숫자를 한 번 더 맞춰 봐요.' · "조회일은 {날짜} 하루, 외/입 구분은 '전체'로 두고 [검색]한 뒤 표 오른쪽 위 초록 엑셀 단추로 저장해 주세요." · '저장할 곳: {폴더}' · '4 · 6번은 환자별 표예요. ERP 도우미가 이 PC 안에서만 읽고 바로 지워요.' · '아무 칸도 바꾸지 않았어요.' · [설정 열기]
- ⑦ 일부 없음(꼭 4개 가운데): 하나면 '의사랑 통계에서 {보고서}{을/를} 엑셀로 저장해 주세요.', 여럿이면 '의사랑 통계에서 아래 보고서 {N}개를 엑셀로 저장해 주세요.' · 목록(있음 · ★ '있음 (앞서 읽음)' · 없음) · 저장할 곳 · '저장한 뒤 [의사랑 값 채우기]를 다시 눌러 주세요. [있는 엑셀로 채우기]를 누르면 없는 엑셀의 칸만 비우고 채워요.' · [안내 닫기] ★[엑셀로 받기] [있는 엑셀로 채우기]
- ⑨ 날짜 다름: '엑셀 날짜가 마감 일자와 달라요.' · 목록 머리 '마감 일자 {날짜}' / '엑셀 조회일' · 줄 '{보고서}' + '{from}' 또는 '{from} ~ {to}'(다르면 빨강, 없으면 ★'찾지 못함') · '날짜가 다른 엑셀 {N}개를 조회일 {날짜}{으로/로} 다시 [검색]해 저장한 뒤 다시 눌러 주세요.' · ★ '아무 칸도 바꾸지 않았어요. 날짜가 다른 합계 엑셀은 지우지 않고 그대로 두었어요.' · ★(환자별 엑셀이 날짜 다름일 때) '환자별 엑셀(4 · 6번)은 날짜가 달라도 읽은 뒤 바로 지웠어요.'
- ⑩ 조건: "{보고서} 엑셀의 외/입 구분이 '{값}'예요." · "의사랑 통계에서 외/입 구분을 '전체'로 바꿔 [검색]한 뒤 다시 엑셀로 저장해 주세요." · '아무 칸도 바꾸지 않았어요.' (답에 라벨 이름 칸이 없어 늘 이 글, 5-2. 고침 1)
- ⑪ 같은 엑셀 여럿: ★'{보고서} 엑셀이 여러 개 있어요.'(답에 파일 수 칸이 없어 수를 말하지 않음, 고침 1) · '{폴더}에서 하나만 남기고 지운 뒤 다시 눌러 주세요.' · '어느 것이 맞는지 몰라 아무 칸도 바꾸지 않았어요.' · ★(환자별이면) '환자별 엑셀은 모두 지웠어요. 하나만 다시 저장해 주세요.'
- ⑫ 한셀에 열림(빨강): '한셀에 열려 있는 엑셀이 있어 읽지 못했어요.' · '{보고서}{이/가} 한셀에 열려 있어요. 한셀 창을 닫은 뒤 다시 눌러 주세요.'(보고서를 모르면 ★'ERP마감 폴더의 엑셀이 한셀에 열려 있어요. …') · '환자별 엑셀은 읽은 뒤 바로 지워야 해서, 열려 있으면 읽지 않아요.' · '아무 칸도 바꾸지 않았어요. (번호 E-UIS-FILE-OPEN)'
- 멈춤 안내에도 지우지 못한 파일이 있으면 10-2의 빨강 줄을 더한다.
- ★ 채우기 전 묻기(고침 7): 의사랑 자료원이면 '진료 0건' 묻기 첫 줄 '{날짜}에는 의사랑 진료가 한 건도 없어요.', 이미 적힌 칸 묻기 첫 줄 '이미 적힌 칸 {N}개가 의사랑 값으로 바뀌어요.'. 뒤 줄·단추는 지금 그대로이고, 비트 자료원 글(`FLOW_TEXT.zero`·`ask`)도 그대로다. 글은 `uisText.ts`, 고르는 곳은 `panel.ts` `askZero`·`askWritten`(자료원으로).

#### 10-2. 결과 안내 (③④⑤⑧, 이 차례)
1. '의사랑과 맞춰 볼 숫자' · '외래 총매출 {N}원' · '진료수납액 {N}원' · '환자 합계 {N}명'(null인 줄은 뺌) · '의사랑 일일수입통계 화면의 같은 숫자와 먼저 견주어 보세요.'
2. '{날짜} 의사랑 값으로 {N}칸을 채웠어요. 저장은 하지 않았어요.'
3. '읽은 엑셀 {N}개는 이 PC에서 지웠어요.'(N = 지운 의사랑 엑셀) · ★ '앞서 읽어 둔 엑셀 {N}개 값도 함께 썼어요.' · ★ '의사랑 통계 엑셀이 아닌 엑셀 {N}개도 지웠어요.' · ★ '날짜가 다른 엑셀 {N}개는 지우지 않고 두었어요.' · ★(빨강) '지우지 못한 엑셀이 {N}개 있어요. {폴더}에서 직접 지워 주세요.'
4. '엑셀이 없어 비워 둔 칸 {N}칸' · 보고서마다 '{보고서}{이/가} 없어 비워 두었어요. 직접 넣어 주세요.'
5. '의사랑에서 읽지 못한 칸 {N}칸' · 칸 이름(지금 `placeLine`) · 까닭 줄: "{보고서}에 '{칸}' 칸이 없어요." · ★"{묶음} 건수: 고른 코드의 총투여량에 소수가 있어요." · ★'재진: 재진수에서 물리치료내원을 빼니 0보다 작아요.' · ★'진찰료 산정안함: 환자 합계가 초진수 + 재진수보다 작아요.' · '의사랑 통계 표의 칸 설정이 바뀌었을 수 있어요. 비워 둔 칸은 직접 넣거나, 그 칸이 보이게 한 뒤 엑셀을 다시 저장하고 다시 눌러 주세요.'
6. 건너뛴 칸(지금 `SKIP_TEXT`·고르지 않은 칸 글 그대로: unpicked · noName · notFound · therapist · locked)
7. '의사랑에 없어 비워 둔 칸 {N}칸' · '업무일지 1 환자현황 90일초진 · 외래 수입 미수입금(+) · 미수발생(-) · 감액 · 장애인기금(-) · 계좌이체액(-) · 현불/환불(-) · 입원수입' · '업무일지 2 예약 나머지 칸 · 치료별 건수 · 연령별 90일초진 · 주사1회환자 · 신환주사환자 · 신환주사건수' · '의사랑 통계 합계로는 셀 수 없는 칸이라 비워 두었어요. 직접 넣어 주세요. 계좌이체는 현금수납액에 들어 있고, 내원하지 않은 환자의 미수 · 환불은 일일수입통계에 빠져요.'
8. 맞춰 보기 경고(주황, 6-2 차례): '총진료비({N}원)가 급여총액 + 비급여({N}원)와 달라요.' · '진료수납액({N}원)이 현금 + 카드({N}원)와 달라요.' · '인원계({N}명)가 초진 + 재진({N}명)과 달라요.' · ★'기간별처방통계 코드 줄 총액 합({N}원)이 합계 줄({N}원)과 달라요.' · '내원일별환자현황 아래쪽 표 환자 수({N}명)가 인원수({N}명)와 달라요. 연령별 표가 {차}명 모자랄 수 있어요.'(★아래쪽이 많으면 '…{차}명 많을 수 있어요.') · ★'내원일별환자현황 아래쪽 표 신규({N}명)가 위쪽 표 신규환자({N}명)와 달라요.' · ★'예약환자통계 아래쪽 표 예약({N}건)이 위쪽 표 예약건수({N}건)와 달라요.' · ★'예약환자통계 아래쪽 표 방문({N}건)이 위쪽 표 이행건수({N}건)와 달라요.' · ★'내원일별환자현황 아래쪽 표에서 조회일을 찾지 못했어요. 그날 줄을 누르고 저장했는지 확인해 주세요.' · ★'주민번호로 나이를 셀 수 없는 환자 {N}명은 연령별 표에 넣지 않았어요.' · 뒤 줄 '채우기는 했어요. 의사랑 화면과 견주어 확인해 주세요.'
9. ★ 예약 참고: '예약환자통계: 예약 {N}건 · 내원 {N}건. ERP 예약 줄은 종류별로 직접 넣어 주세요.'
10. 끝 줄(지금 그대로) · [되돌리기] ★[엑셀로 받기] [설정 열기]

#### 10-3. ★ 받았어요 안내 (머리 '엑셀로 받기')
- '{날짜} 의사랑 값을 엑셀 파일로 받았어요. ERP 칸은 바꾸지 않았어요.' · '파일 이름: {파일 이름}(크롬 다운로드 폴더)' · 10-2의 3번 줄들 · '빈 칸은 끝 열 '빈 칸 까닭'을 보고 직접 넣어 주세요.' · [닫기] [의사랑 값 채우기](들고 있는 답으로 채우기 차례)

#### 10-4. ★ 의사랑 오류 글 (`UIS_ERRORS`, '무엇이 · 어떻게 · 번호')
| 번호 | 무엇이 | 어떻게 |
|---|---|---|
| E-UIS-FOLDER | 'ERP마감 폴더를 만들거나 열지 못했어요.' | 'ERP 도우미 설치 파일(install.cmd)을 다시 실행해 주세요. 계속되면 이 번호를 알려 주세요.' |
| E-CLOSING-WRONG-SOURCE | '이 PC의 ERP 도우미가 다른 차트 프로그램으로 등록되어 있어요.' | '이 PC가 쓰는 차트 프로그램(비트·의사랑)이 맞는지 확인하고 ERP 도우미 설치 파일을 다시 실행해 주세요.' |
| 그 밖 | '의사랑 엑셀을 읽지 못했어요.' | '잠시 뒤 다시 해 주세요. 계속되면 이 번호를 알려 주세요.' |
- E-UIS-FOLDER 글은 오류 답에 폴더 자리가 없어 늘 위 글이다(고침 8, TASK-2).

#### 10-5. ★ 설치 글 (`install.ps1`)
- 등록 앞 글: '이 PC를 등록합니다. 비트 PC면 비트 로그인 창이 뜨니 로그인하고, 병원을 확인한 뒤 [확인]을 누르세요. 의사랑 PC면 창 없이 끝나요.'
- 0 + `SOURCE-UISARANG` + `FOLDER-DESKTOP`: '의사랑 PC로 등록했어요. 의사랑 통계 엑셀은 바탕화면 › ERP마감 폴더에 저장해 주세요.'
- 0 + `SOURCE-UISARANG` + `FOLDER-PROFILE`: '의사랑 PC로 등록했어요. 바탕화면이 OneDrive와 이어져 있어, 환자 엑셀이 인터넷으로 올라가지 않게 엑셀 폴더를 {실제 경로}에 만들었어요. 의사랑 통계 엑셀은 이 폴더에 저장해 주세요.'
- 멈춘 단계 `UIS` → '의사랑 등록(엑셀 폴더·자료원 파일)'.
- ★ 실패 글(고침 5, 지금 '등록하지 못했어요.' 다음 줄 자리, 그 밖 번호는 지금 글 그대로이고 뒤에 멈춘 단계·오류 번호·사진 줄): `E-UIS-FOLDER` → 'ERP마감 엑셀 폴더를 만들지 못했어요. 같은 이름의 파일이 있거나 폴더 만들기가 막혔는지 확인하세요.' · `E-STORE-FAILED`이고 단계가 `UIS` → '도우미 설정 파일(의사랑 표시)을 쓰거나 지우지 못했어요. 크롬을 모두 닫고, 백신이 막지 않는지 확인한 뒤 install.cmd를 다시 실행하세요.'

#### 10-6. 설정 화면 글
- 시안 notes.md '설정 화면' 글 그대로. 다만 ★ 예약 묶음은 '의사랑 예약에는 종류가 없어 실예약환자수만 채워요. 종류별 줄과 변경 · 취소는 직접 넣어 주세요. 예약건수 · 내원 수는 채운 뒤 안내에 보여요.' 한 줄만(줄 고르기 없음).
- ★ '매일 저장할 엑셀 6개' 표에 열 '꼭'(1 · 2 · 4 · 6번 '꼭', 3 · 5번 '있으면 좋음')을 더한다. '-환자별' 안내는 저장법 둘째 줄(시안 글) 하나만 둔다(표 밑 줄은 두지 않음 — 같은 말 두 번, 고침 9).
- ★ 저장법 셋째 줄(고침 2, 시안 '이 폴더에는 마감 엑셀만 두세요. 다 읽은 뒤 폴더 안 엑셀을 모두 지워요.'를 실제 동작 5-5대로): '이 폴더에는 마감 엑셀만 두세요. 읽은 엑셀은 지워요. 환자 정보가 든 4 · 6번은 날짜가 달라도 늘 바로 지우고, 의사랑 통계 엑셀이 아닌 엑셀도 지워요. 날짜가 다르거나 같은 보고서가 여럿인 합계 엑셀은 그대로 둬요.'
- ★ 폴더 글(고침 10): 코드 목록 답에는 폴더 자리가 없어 설정 화면은 바탕화면·사용자 폴더를 가리지 못한다(답에 칸을 더하지 않음). 그래서 설정 화면의 `{폴더}`는 늘 'ERP마감 폴더'(`UIS_OPTIONS_FOLDER`)이고, 맨 위 상자 뒤 글은 '이 PC의 ERP 도우미는 ERP마감 폴더에 저장한 의사랑 통계 엑셀을 읽어 ERP 칸을 채워요. ERP마감 폴더는 보통 바탕화면에 있고, 바탕화면이 OneDrive와 이어진 PC에서는 사용자 폴더에 있어요(설치할 때 알려 준 자리 · ERP 화면 안내의 '저장할 곳').'다. 3단계 · missing · 표 앞 글의 폴더도 'ERP마감 폴더'. ERP 화면 안내(10-1·10-2)는 지금처럼 답 `uis.folder`로 고른다.
- [코드 목록 읽기] 결과: ok '의사랑 기간별처방통계({기간})에서 처방 코드 {N}개를 읽었어요. 목록만 기억하고 엑셀은 지웠어요.'(기간을 못 읽어 from·to가 null이면 괄호 없이 '의사랑 기간별처방통계에서 처방 코드 {N}개를 …', TASK-12) · ★missing 'ERP마감 폴더에 기간별처방통계 엑셀이 없어요.' + 3단계 · ★notAll "기간별처방통계 엑셀의 외/입 구분이 '{값}'예요. '전체'로 다시 저장해 주세요." · ★twice '기간별처방통계 엑셀이 여러 개 있어요. 하나만 남겨 주세요.' · ★open '기간별처방통계 엑셀이 한셀에 열려 있어요. 한셀 창을 닫은 뒤 다시 눌러 주세요.' · 오류는 `explainFor` 글.
- 기타 줄 이름(TASK-12가 정한 대로): 매출 코드를 골랐는데 이름이 비어도 [저장]은 되고 막는 글은 없다(그 줄은 ERP 화면에서 noName으로 건너뛰고, [엑셀로 받기]에는 값이 나옴). 이름 칸 자리 글은 지금 설정 화면 글 '업무일지 2 줄 이름과 똑같이'.

### 11. 시안과 다른 곳 (시안 6f3de65e를 고칠 것)
| # | 시안 | 명세 | 까닭 |
|---|---|---|---|
| 1 | '매일 저장할 엑셀 6개' 모두 같은 무게, ⑥ '아래 보고서 6개' | 6개 그대로 보이되 3 · 5번에 '있으면 좋음'(설정 표 '꼭' 열) · ⑥에 '3 · 5번(위쪽 표)은 없어도 채울 수 있어요. …' 한 줄 | 조정자 결정 1 |
| 2 | ⑦ 6개 가운데 하나라도 없으면 멈춤 | 꼭 4개 가운데 없을 때만 멈춤. 앞서 읽은 보고서는 '있음 (앞서 읽음)' | 조정자 결정 1 · 모아 둔 값 |
| 3 | ⑦ 단추 [안내 닫기] [있는 엑셀로 채우기] | [안내 닫기] [엑셀로 받기] [있는 엑셀로 채우기] | 사용자 2026-11-24 |
| 4 | ⑨ 끝 줄 '엑셀은 지우지 않고 그대로 두었어요.' | '날짜가 다른 합계 엑셀은 지우지 않고 그대로 두었어요.' + (환자별이 날짜 다르면) '환자별 엑셀(4 · 6번)은 날짜가 달라도 읽은 뒤 바로 지웠어요.' · 조회일 없음은 '찾지 못함' | 조정자 결정 4 |
| 5 | ③ 맞춰 볼 숫자·채움·지움 줄 | 지움 줄 뒤에 '앞서 읽어 둔 엑셀 {N}개 값도 함께 썼어요.' · '의사랑 통계 엑셀이 아닌 엑셀 {N}개도 지웠어요.' · '날짜가 다른 엑셀 {N}개는 지우지 않고 두었어요.' · 빨강 '지우지 못한 엑셀이 {N}개 있어요. …'(있을 때만) | 4-4 · 5-5 |
| 6 | ③ 단추 [되돌리기] [설정 열기] | [되돌리기] [엑셀로 받기] [설정 열기] | 사용자 2026-11-24 |
| 7 | ① 단추 [기간 채우기] [의사랑 값 채우기] | [기간 채우기] [엑셀로 받기] [의사랑 값 채우기] — 새 단추는 가운데, [기간 채우기]와 같은 버금 단추 모양, 글 '엑셀로 받기' | 사용자 2026-11-24 |
| 8 | ② 큰 단추만 '의사랑 엑셀 읽는 중…' | 누른 단추 글이 바뀜(엑셀로 받기를 눌렀으면 그 단추) · 세 단추 막힘 | [엑셀로 받기] 더함 |
| 9 | (없음) | 받았어요 안내 10-3(머리 '엑셀로 받기', [닫기] [의사랑 값 채우기]) | 사용자 2026-11-24 |
| 10 | 설정 예약 '예약 합계를 넣을 줄' 고르기 6줄 + '넣지 않음', 처음 값 진료예약 | 뺌. 안내 한 줄 '의사랑 예약에는 종류가 없어 실예약환자수만 채워요. …'(10-6) | 조정자 결정 5 · 6-3 |
| 11 | ③ '의사랑에 없어 비워 둔 칸 64칸' | 75칸(예약 합계 줄을 채우지 않아 예약 24칸 모두) | 조정자 결정 5 |
| 12 | ⑤ 경고 셋 | 6-2 경고 아홉 + 조회일 없음 · 나이 못 셈 줄, 아래쪽이 많으면 '많을 수 있어요' | 맞춰 보기 넓힘 |
| 13 | ④ 까닭 줄 "{보고서}에 '{칸}' 칸이 없어요."만 | + 소수 총투여량 · 재진 음수 · 산정안함 음수 까닭 줄 | 6-1 |
| 14 | (없음) | 결과 끝에 예약 참고 줄 '예약환자통계: 예약 {N}건 · 내원 {N}건. …' | 조정자 결정 5 |
| 15 | ⑪ '{보고서} 엑셀이 2개 있어요.' | '{보고서} 엑셀이 여러 개 있어요.' + 환자별이면 '환자별 엑셀은 모두 지웠어요. 하나만 다시 저장해 주세요.' | 답에 파일 수 칸 없음(고침 1) · 5-5 |
| 16 | ⑫ 번호 'E-UIS-FILE-OPEN'(자리 표시) | 그 번호로 정함(오류가 아니라 보일 번호), 보고서 모르면 'ERP마감 폴더의 엑셀이 …' | 5-4 |
| 17 | '저장할 곳: 바탕화면 › ERP마감 폴더' 고정 | ERP 화면은 도우미 답 `uis.folder`로 '바탕화면 › ERP마감 폴더' / '사용자 폴더 › ERP마감 폴더'. 설정 화면은 21 | 2절 8 |
| 18 | 설정 [코드 목록 읽기] 실패 글 없음 | missing · notAll · twice · open 글(10-6) | 3-3 |
| 19 | 단추 이름은 도우미가 알려 준 곳으로 | 저장된 설정으로 먼저 정하고, 둘 다 있을 때만 도우미에 묻는다(5초, 실패는 비트). 둘 다 없으면 비트로 두고, 비트 흐름이 '비트 설정 없음'에 닿을 때 자료원을 다시 정한다(고침 13) | 비트 PC에 새 부름을 만들지 않으려고(AC-4215.3) |
| 20 | 설정 저장법 셋째 줄 '…다 읽은 뒤 폴더 안 엑셀을 모두 지워요.' | 10-6 ★ 저장법 셋째 줄(실제 지우기 규칙) | 고침 2 · 2절 4 |
| 21 | 설정 화면 폴더 글 '바탕화면 › ERP마감 폴더' | 'ERP마감 폴더' + 맨 위 상자에 자리 설명(10-6 ★ 폴더 글) | 코드 목록 답에 폴더 자리 없음(고침 10) |
| 22 | 진료 0건 묻기 · 이미 적힌 칸 묻기는 '지금 그대로'(비트 글) | 의사랑이면 첫 줄만 '의사랑' 글(10-1 ★) | 고침 7 |
| 23 | 설정 [코드 목록 읽기] ok '…({기간})에서…' | 기간을 못 읽으면 괄호 없이 | 고침 11(TASK-12) |
| 24 | 설정 [코드 목록 읽기] twice(없음) | '기간별처방통계 엑셀이 여러 개 있어요. 하나만 남겨 주세요.' | 답에 파일 수 칸 없음(고침 1) |

### 12. 시험

#### 12-1. 가짜 엑셀 (`fixtures/make-fake-uisarang.ts`, TASK-1)
- 저장소의 SheetJS `xlsx` 0.20.3으로 `XLSX.write(wb, { bookType: 'biff8', type: 'buffer' })`. 파일 시각·작성자 칸은 고정(다시 만들어도 바이트가 같게). `npm run fixtures:uis`(package.json 한 줄 더함, `tsx`).
- 만드는 파일(`fixtures/fake-uisarang/`): `income.xls`(보험구분 줄 넷 + 합계, 총진료비 병합 칸 모양) · `income-no-sum.xls` · `income-outpatient.xls`(외/입 '외래') · `income-other-date.xls` · `rx.xls`(쪽마다 머리글 되풀이, 소수 코드 하나, 합계 줄) · `rx-3months.xls`(기간 석 달) · `visits.xls` · `visit-patients.xls`(머리글 20줄마다 되풀이, 차트번호 꼴 아닌 끝 줄, 가린 주민번호, 1800·1900·2000년대, 틀린 주민번호) · `visit-patients-no-date.xls` · `rsv.xls` · `rsv-patients.xls`(같은 차트번호 두 줄, 방문·미방문) · `rsv-patients-other-day.xls` · `other-report.xls`(모르는 표) · `broken.xls`(바이트 자름) · `real-xlsx.xls`(xlsx를 .xls 이름으로) · `html.xls`.
- 숫자는 시안 예시 관계(notes.md '예시 숫자 관계')를 쓴다: 총진료비 5,182,300 = 3,976,300 + 1,206,000 · 진료수납액 1,741,100 = 352,500 + 1,388,600 · 초진 9 + 재진 88 = 인원계 97 = 인원수 97 · 신규 7 · AA222 31.
- `.gitignore`: 파일마다 `!fixtures/fake-uisarang/<이름>.xls` 줄. `fixtures/make-fake-uisarang.test.ts`가 다시 만든 바이트 = 커밋된 바이트, 되살리는 줄 = 만드는 파일 목록.
- C# 시험은 `Erp.Core.Tests.csproj`의 `<None Include="../../../fixtures/fake-uisarang/*.xls" Link="uisarang/%(Filename)%(Extension)" CopyToOutputDirectory="PreserveNewest" />`로 읽는다.

#### 12-2. 환자 정보 표시 글자 (AC-4209.1)
- 가짜 환자별 엑셀의 글자 칸은 모두 표시 글자만: 이름 `가짜환자01`~ · 주민번호 `800101-1******` 꼴(앞 7자리만 숫자, 생년월일은 지은 값) · 전화 `010-0000-00xx` · 주소 `가짜시 가짜구 1` · 차트번호 `9000001`~. 시험은 답 JSON·기록 줄·모아 둔 값(복호 뒤)·예외 글에 `가짜환자`·`800101`·`010-0000`·`가짜시`·`9000001` 가운데 아무것도 없음을 본다.

#### 12-3. 시험 감싸개 (TASK마다 따로, 같이 돌아도 안 겹침)
| 감싸개 | FILTER(C# 이름 공간) | TASK |
|---|---|---|
| `helper-erp/tests/uis-xls.dotnet.test.ts` | `Erp.Core.Tests.Uisarang.Xls` | 1 |
| `helper-erp/tests/uis-report.dotnet.test.ts` | `Erp.Core.Tests.Uisarang.Report` | 3 |
| `helper-erp/tests/uis-rules.dotnet.test.ts` | `Erp.Core.Tests.Uisarang.Rules` | 4 |
| `helper-erp/tests/uis-sums.dotnet.test.ts` | `Erp.Core.Tests.Uisarang.Sums` | 7 |
| `helper-erp/tests/uis-patients.dotnet.test.ts` | `Erp.Core.Tests.Uisarang.Patients` | 8 |
| `helper-erp/tests/uis-folder.dotnet.test.ts` | `Erp.Core.Tests.Uisarang.Folder` | 9 |
| `helper-erp/tests/uis-day.dotnet.test.ts` | `Erp.Core.Tests.Uisarang.Day` | 13 |
- 지금 `runDotnet(FILTER)`·`expectAc(ac)` 꼴 그대로(`Passed AC-…` 줄).

#### 12-4. 기대값을 고치는 지금 시험 (이것만)
| 시험 | 고침 | TASK |
|---|---|---|
| `helper-erp/tests/erp-core.dotnet.test.ts` AC-3611.1 NuGet 판 | 기존 도우미에 없는 패키지는 ADR-050 목록(ExcelDataReader 3.9.0 · System.Text.Encoding.CodePages 10.0.14)의 판이어야 함 | 1 |
| 같은 파일 AC-3611.1 Erp.Core 파일 목록 | `Uisarang/` 밖은 지금 목록 그대로, `Uisarang/*.cs`는 namespace `Erp.Core.Uisarang` | 1 |
| 같은 파일 AC-3601.4 명령 표 | 명령 다섯 · `expectedTable`에 3-1 더함 | 1 |
| `helper-erp/tests/Erp.Core.Tests/ErpCommandTable.test.cs` AC-3601.4 | 명령 다섯, `sales` 받기·거절 시험 더함 | 1 |
| `extension-erp/src/background.test.ts` | (기대값은 그대로 — 표와 `COMMANDS`가 같은지 보는 시험) | 1 |
| `extension-erp/src/main.test.ts` AC-3609.1 모듈 목록 | 새 모듈 아홉 + `josa.js` 더함(8-9) | 14 |
| `extension-erp/src/manifest.test.ts` AC-3601.1·AC-3706.1 `web_accessible_resources` | 새 모듈 아홉 + `josa.js` 더함 | 14 |
| `extension-erp/src/manifest.test.ts`·`readme.test.ts` 판 0.3.0 | 0.4.0, 짝 문장 | 16 |
| `helper-erp/tests/erp-core.dotnet.test.ts` AC-3610.1 판 | 0.4.0 | 16 |
| `helper-erp/tests/erp-helper.test.ts` AC-3802.3 `README.md` 그대로 | `helper-erp/install/README.md`는 '의사랑 의원' 절만 더해짐(그 절 밖 글자는 6754571c 그대로) · install.ps1 글 | 15·16 |
| `helper-erp/tests/erp-helper.test.ts` AC-3801.4 'ERP 명령 표·확장도 6754571c 그대로' | `commands.json`은 6754571c와 견주어 3-1에서 더한 것만 다름(JSON으로 견줌), `extension-erp/`는 AC-4215.1 목록(비트 파일)만 6754571c 그대로 | 15 |
| 같은 파일 AC-3801.4 'ERP 도우미 판 0.3.0' | 0.4.0 | 16 |
| 같은 파일 AC-3611.2 도우미 파일 목록 | `UisHelperServices.cs` 더함 | 15 |
| 같은 파일 AC-3806.1 단계 목록 | `Uis` 단계와 `UisHelperServices.cs`의 `Set` 두 곳 더함 | 15 |
| 같은 파일 AC-3806.2 표준 출력 여는 곳 수 | 2 → 3(`WriteRegisterSource`, 비트 `WriteRegisterError`는 글자 그대로) | 15 |
| `fixtures/make-fake-fixtures.test.ts` AC-005.2 '.gitignore 되살림은 생성기 파일 이름 그대로뿐' | 두 생성기 이름뿐(`make-fake-fixtures`의 `FILES` + `make-fake-uisarang`의 `UIS_FIXTURE_NAMES`, 글롭 없음은 그대로) | 17 |

### 13. 실제 의사랑 PC 확인 목록 (AC-4216.4, 사용자와 함께)
1. 두 아래쪽 표 머리글 글자(5-1·5-3)와 기본 저장 이름(5-4), 환자 줄 차트번호 꼴(숫자 1~12자리)
2. 보고서마다 라벨 줄 모양(`[조 회 일]`·`[외/입 구분]`·그 밖 라벨 이름과 값), 아래쪽 표에 조회일 라벨이 있는지
3. 예약 아래쪽 표 예약일 칸 꼴(날짜만인지, 시각이 붙는지)
4. 저장하면 한셀이 저절로 열리는지, 열려 있으면 파일이 잠기는지(4-2 첫째 돌기)
5. ERP 마감일지 업무일지 1 '재진' 줄 이름이 '재진'인지 '재진(원본 합계)'인지(`erp-closing-fields.md` 58줄). 다르면 칸을 못 찾아 '화면에서 찾지 못한 칸'으로 보인다
6. 진찰료 산정안함이 있는 날 하루로 '인원수 − (초진수 + 재진수)'를 의사랑 화면과 대조
7. 세 날(평일·토요일·진료 적은 날) [의사랑 값 채우기] 값 = 의사랑 화면 숫자, [엑셀로 받기] 파일이 엑셀·한셀에서 열리고 값이 같음
8. 읽은 뒤 ERP마감 폴더에 환자별 엑셀이 남지 않음, 바탕화면이 OneDrive 안인지
9. 저장소에 숫자·이름을 옮기지 않는다(결과 노트엔 맞음/다름만)
10. 새로 깐 의사랑 PC 첫 사용(고침 13): 단추가 [비트 값 채우기]로 보이고, 누르면 의사랑 설정 화면이 열리며, 설정 저장 뒤 새로고침 없이 [의사랑 값 채우기]로 바뀜. 실제 `--register`로 의사랑 등록(비트 로그인 창 안 뜸)

## 데이터 흐름
1. 직원이 의사랑 통계에서 보고서 6개(꼭 4개)를 [검색]해 `ERP마감` 폴더에 [엑셀 저장].
2. ERP 마감일지 화면 → 확장 단추 [의사랑 값 채우기] 또는 [엑셀로 받기] → 서비스 워커 → 네이티브 메시징 → ERP 도우미 `closing.day { date, groups, sales }`.
3. 도우미(그 PC 안): 폴더 → 열림 보기 → 파일마다 읽기·알아보기 → 환자별은 곧바로 지움·숫자만 → 합계 고르기·읽기·지우기/남기기 → 모아 둔 값과 합침 → 셈 → 숫자 답(3-2). 환자 이름·주민번호·차트번호·전화·주소는 도우미 메모리 밖으로 나가지 않는다.
4. 확장: 답 검사(`readUisDay`) → 멈춤 판정 → 칸 계획 → ERP 칸 채우기(저장은 직원이 ERP에서) 또는 `.xlsx` 만들기 → 크롬 다운로드 폴더.
5. 설정: [코드 목록 읽기] → `closing.uisCodes` → 코드 목록(코드·처방명칭·합계 숫자)을 `chrome.storage.local`에 → 줄마다 코드 고르기 → [저장].

## 결정과 트레이드오프
1. **ExcelDataReader 3.9.0(ADR-050).** 다른 길: (가) NPOI — 의존 패키지가 많고(SharpZipLib·BouncyCastle 등) 설치 묶음이 커진다. (나) BIFF8·OLE2를 직접 읽기 — 병합 칸·공유 글 표·이어진 레코드 같은 경우가 많아 틀릴 위험이 크다. (다) 의사랑에서 CSV로 저장 — FStat 엑셀 단추는 .xls만 낸다(조사 노트). 고른 길은 MIT, netstandard2.0은 의존 없음, BIFF8 전용 입구(`CreateBinaryReader`)가 있다. 값: 설치 묶음 dll 하나(약 200KB)와 그 판이 요구하는 dll.
2. **답을 비트 칸 이름 그대로 + null.** 확장 칸 자리·`fillAll`·다른 갈래(erp-copy-list)가 같은 이름을 쓴다. 비트 `readDay`는 null을 받지 않으므로 의사랑 답은 `readUisDay`로 따로 검사한다(다른 갈래가 의사랑을 받으려면 합칠 때 그 검사를 고른다).
3. **엑셀 쓰기는 직접(zip 저장 + 가장 작은 SpreadsheetML), SheetJS는 시험에서만.** 조정자는 저장소에 있는 라이브러리(`xlsx`)를 권했다. 그러나 (가) 확장은 tsc만 쓰는 빌드라 묶개가 없고, ES 모듈인 `xlsx.mjs`는 1,008,308바이트, 가장 작은 `xlsx.mini.min.js`도 279,523바이트(지금 dist의 1.3배)이며 ES 모듈이 아니라 내용 스크립트 목록에 따로 실어 ERP 화면마다 읽힌다. (나) 그 안의 파일·네트워크 함수 때문에 AC-3601.5 울타리(fetch·XMLHttpRequest 없음)를 풀거나 예외를 둬야 한다. (다) 다른 갈래 erp-copy-list가 같은 까닭으로 직접 쓰기를 골랐고, `zip.ts`를 같은 이름·모양으로 두면 합칠 때 한 벌로 줄일 수 있다. 저장소의 `xlsx`는 시험에서 만든 파일을 다시 읽어 맞는지 보는 데 쓴다(dist에 안 실림).
4. **환자별 엑셀은 알아본 바로 뒤 지움, 합계 엑셀은 다 읽은 뒤.** 환자별이 디스크에 남는 시간을 가장 짧게. 합계는 '같은 날 둘'·'날짜 다름'을 다 본 뒤라야 남길지 정할 수 있다.
5. **모아 둔 값(24시간, DPAPI).** 다른 길: 확장 화면 기억에만 — ERP 탭을 새로고침하거나 닫으면 사라지고, 확장이 보고서별 숫자를 합쳐야 해 셈이 두 곳이 된다. 값: 숫자만이라도 PC에 하루 남는다(등록 파일과 같은 보호, 환자 정보 없음).
6. **단추 이름은 저장된 설정으로 먼저 정함.** 다른 길: 화면마다 `closing.source`를 묻기 — 비트 PC에서도 화면을 열 때마다 도우미가 한 번 켜지고, 지금 시험('도우미를 부르지 않는다')을 고쳐야 한다. 값: 의사랑 PC를 처음 쓸 때만 한 번 묻는다.
7. **설정 화면은 `closing.codes`가 `E-CLOSING-WRONG-SOURCE`면 의사랑 화면.** 비트 설정 화면의 부름 차례·수가 그대로다.
8. **의사랑 등록은 비트를 못 찾았을 때만.** 비트와 의사랑이 둘 다 깔린 PC는 비트로 등록된다(지금 그대로). 바꾸려면 등록 인자를 더해야 해 이번엔 하지 않는다.
9. **판 0.4.0(도우미·확장).** 새 명령을 쓰므로 짝이 바뀐다. 다른 갈래 erp-copy-list는 0.3.0을 지키므로 합칠 때 이 갈래 판을 쓴다.
10. **ADR 번호 050.** 이 갈래 `docs/ADR.md`는 026까지지만 운영 갈래가 049까지 썼다. 합칠 때 겹치면 다음 빈 번호로 옮기고 이 명세·csproj 주석을 같이 고친다.

## 위험 / 미해결 질문
- (정함 1, 2026-11-24 Claude — 사용자 "기술 선택은 알아서, 돌아가기만") 바탕화면이 OneDrive 안이면 엑셀 폴더를 사용자 폴더 `ERP마감`으로 바꾼다(2절 8). 환자별 엑셀이 클라우드로 올라가지 않게 하는 쪽이 안전하다.
- (정함 2, 같음) ERP '재진' 줄은 '재진' 이름만 찾고 못 찾으면 비운다(13절 5). '재진(원본 합계)'로 보이는 의원이 나오면 그때 실제 화면을 보고 고친다.
- (정함 3, 같음) '진찰료 산정안함 = 인원수 − (초진수 + 재진수)'를 쓰고, 0보다 작으면 비우고 까닭 줄을 보인다(AC-4207.4). 산정안함이 있는 날로 실제 대조하는 일은 TASK-16 의사랑 PC 확인(13절 6)에서 한다.
- 의사랑 FStat 칸 위치는 직원이 바꿀 수 있다(FStat_C.ini). 머리글로 찾으므로 차례는 상관없지만, 칸을 숨기면 그 값은 빈 칸이 된다(④).
- 라벨 이름·값이 노트와 다르면 notAll을 잘못 낼 수 있다(5-2, 13절 2). 처음 판 뒤 실제 PC에서 확인하고 고친다.
- 한셀이 파일을 잠그지 않으면 '열림'을 알 수 없고 그대로 읽어 지운다(문제는 없음, 13절 4).
- ERP 화면이 의사랑 원본 패널이 있는 의원이면 연령별 표가 접힌 `details` 안에 있다(`erp-closing-fields.md` 144줄). 칸은 DOM에 있어 채워지지만 직원 눈에 안 보일 수 있다.
- 비트 PC에서 의사랑으로 옮긴 PC에 비트 설정이 남아 있으면 비트 흐름이 의사랑 답을 받아 `E-BRIDGE-BAD-REPLY`가 된다(드묾, 설정 화면을 열면 의사랑 화면으로 감).
- 직원이 ERP마감 폴더에 다른 `.xls`를 두면 종류 모름으로 지워진다(안내서에 '이 폴더는 의사랑 엑셀 전용'을 적음).
- 지운 파일은 휴지통에 가지 않지만 디스크에서 덮어써 없애지는 않는다(범위 밖).

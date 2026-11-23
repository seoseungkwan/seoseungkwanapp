# 설계: 청구 사전점검 (양지바른 사전점검 가져오기)

> 근거: `requirements.md`, `docs/precheck/PRD.md`(무엇을·왜), `docs/precheck/plan.md`(어떻게·순서), 루트 `plan.md` §0·§4·§5·§10, ADR-003·004·005·016·020·021·022(b2b 개편 합치기 뒤 번호, 옛 017·018·019. 18-2).
> 옮기는 원본: GitHub `seoseungkwan/shared` main `YangjiBareun_사전점검/` 커밋 `2a1069b`(README 1.24.5). 아래에서 "원본"이라 부른다. 원본에 실제 환자 정보는 없다.
> 화면 문구·배치는 Phase 0 목업(승인본, Phase 0 Step 2 `mockups`). 모양 규칙은 `docs/UI_GUIDE.md`(b2b 개편 뒤 '공통 모양'·'앱 틀'·'관리자', 18절). 이 문서는 화면의 내용(무엇이 보이고 어떤 단추가 있나)만 정한다.
> 표시: **(사용자)** 사용자가 정함 / **(Claude 판단)** 고쳐도 됨 / **(Claude 제안)** 사용자가 아직 안 봄

## 1. 한눈에

```
[웹 화면 (React)]                         [서버 (Supabase)]
  │  ▲ 보기 모양만                          ▲ 건수(숫자만)·설정 (RLS)
  │  │                                     │
  ▼  │                                     │
[Worker: workers/precheck.worker.ts] ◀── lib/storage/claim*.ts (설정 읽기·건수 올리기)
  ▲  │  조각(풀지 않은 글자)
  │  ▼
[lib/bridge (통로)] ──chrome.runtime.connect(EXTENSION_ID)──▶ [크롬 확장 extension/]
                                                              │ connectNative
                                                              ▼
                                           [도우미 helper/ (C#/.NET 10, 윈도우)]
                                             ├─ 비트 DB 읽기(읽기 전용)
                                             ├─ 비트 화면 자동 입력(FlaUI) + PC 확인 창
                                             ├─ 작업 저장(DPAPI 암호화, 그 PC 폴더)
                                             └─ 심평원 청구 파일 읽기(C:\HIRA\DDMD\sam\in\backup)
```

- 환자 자료는 도우미 → 확장 → 통로 → Worker로만 다닌다. 화면에는 Worker가 만든 보기 모양만 간다. 서버에는 건수와 설정만 간다 (ADR-020·021)
- 서버 경로는 늘리지 않는다. 설정·건수는 브라우저가 Supabase(RLS)에 바로 읽고 쓴다 (ADR-004·021)
- 비트 PC가 아닌 곳(집·휴대폰·확장 없는 브라우저)에서는 청구 탭이 "밖에서 보는 건수"만 보인다

## 2. 원본에서 옮기는 것 (조사 결과)

| 우리 부품 | 원본 | 언어 |
|---|---|---|
| 비트 설치 찾기·읽기 전용 접속·기관기호 | `vendor/drbit_export/InstallationLocator.cs`·`NativeEnvironmentGuard.cs`·`ReadOnlyConnection.cs`·`HospitalSecurity.cs`(`CheckPrivateServer`·`ValidateScope`·`VerifyInstitutionNumber`·`ValidateInstitutionNumbers`) | C# (.NET Framework, SQL Server) |
| 한 달 자료(증상 83 · 상병 83D · 소모 47) | `drbit_export/NativeReportAdapter.cs`·`NativeMappings.cs`·`Handoff.cs`: 비트 통계 화면 DLL(`BITSSElectricData.dll`·`BITSDepOdrPatList.dll`)을 불러 날짜를 넣고 표를 읽는다. 원본에 이 자료의 SQL은 없다 | C# |
| 12개월 이력 | `drbit_export/RxHistory.cs` `VisitSql`·`CodeSql` (줄 모양 `{v, p, d, c[], m}`) | C# SQL |
| 비트에 이미 있는 청구메모 | `drbit_export/ClaimMemoHistory.cs` `RowsSql` (`OcmInf.OcmBilCmt`, 줄 `{v, p, d, m}`) | C# SQL |
| 상병 추세(추천 상병 근거) | `drbit_export/RxDiagnosisTrend.cs` | C# SQL |
| 병원 처방 목록 | `drbit_export/PrescriptionCatalog.cs`·`LaCatalog.cs` | C# SQL |
| 자동 입력 | `vendor/range_bridge/LegacyAutomation/UChartAutomation.cs`·`RangeAutomation.cs`·`NativeTarget.cs`·`MemoApproval.cs` (FlaUI 4.0. 기간 입력 다리, 하루 입력도 이 길로 된다) + 묶음 고리는 `mx999_v22.html`의 `autoOne`·`runAutoRange` | C# + JS |
| 입력 방식 고르기 | `mx999_v22.html` `<script id="new-medicore-range-input">` (13108~13222줄, `nmAutoMode`·`hasCode`·`runAutoRange`), `nmAutoHeld`·`nmAutoPrecheck`·`nmBatchWorkbook` | JS |
| 조회 모드 안내창 | `medicore/bit_dialogs.py` (`is_view_mode_notice`·`is_confirm_button`·`confirm_view_mode_notices`·`ViewModeNoticeWatcher`) | Python |
| 비트에 들어가는 메모 전체 글 | `mx999_v22.html` `fullText`·`fullTextBody`(3986~4010줄), `rxLines`·`iaLines`·`noteLines`·`patientLines`·`lineKey`·`styleSides`·`gapify`·`oneLineMemo`, `applyRx`, 덮어쓴 판 `computeIntervals`(7788줄), `NEW_MEDICORE_DICTIONARY`(7466줄), `NEW_MEDICORE_CLAIM_REVIEW_SAFETY`의 `formatLevels`·`sentenceMemo`·`unresolved` | JS |
| 점검 규칙 262개 | `tools/precheck_rules.json` + `tools/claim_precheck.py`가 만든 `<script id="new-medicore-precheck">`(`evaluate`·`collect`·`statusOf`, 조건 종류 18가지) | JSON + JS |
| 추천 상병·상병 확인 | `<script id="new-medicore-dx-recommend">`(`recommend`·`issues`·`needsCheck`·`missingDx`). 이 함수들은 `dx_flags.json`을 읽지 않는다(그 표는 규칙 DX-01·DX-02 몫, AC-011.2) | JS |
| 청구메모 문장·병원 문구 | `mx999_v22.html` 본 스크립트 `buildMemo`·`compose`·`fill`·`memoText`, 문구 틀 `TPL_DEF`·`FIXED_PHRASES_DEF`·`SITE_NAMES_DEF`, 설정 엔진 `tools/claim_hospital_settings.js`(`defaults`·`validate`·`diff`) | JS |
| SAM 읽기 | `medicore/sam_files.py` `latest_sam_files` (`<청구월>\<전송폴더>\<청구번호>.GHP|.CAR`, 머리 80바이트에서 기관기호) | Python |
| SAM 대조·월말 마감 | `mx999_v22.html` `parseSam`(EUC-KR 고정 폭)·`samRules`·`samCheck`·`samNameCheck` + `<script id="new-medicore-month-close">` | JS |
| F/U 목록 | `assets/revisit_schedule.html` `parseFU`·`aragan`·`visitKind`·`scheduleRows`·`undecidedRows` + `tools/revisit_source_parts.py`(적어 둔 날짜) | JS + Python |
| 정기 주사 명단 | `tools/revisit_source_boot.js` `NEW_MEDICORE_RECALL`(`DEFAULTS`·`compute`·`select`·`status`) | JS |
| 문자 문구 | `assets/message_templates.html` `TPLS`(`jusa`·`jinryo`), `<<DATE>>` → `dateLine()` | JS |
| 처방 추세 | `drbit_export/TrendMath.cs`·`TrendDataSource.cs`·`TrendTests.cs` | C# |
| 30일 재방문·첫 재방문 날수 | `drbit_export/CohortContracts.cs`·`CohortDataSource.cs`·`CohortTests.cs` | C# SQL |
| 처방별 신환·재진 | `drbit_export/RxVisitSplit.cs` + `medicore/rx_visit_split.py`(`summarize`·`format_text`·`headline`) | C# SQL + Python |
| 일일·월말 보고 문장 | `drbit_export/OperationalReportData.cs`(`SetFinanceUnconfirmed`) + `medicore/reports.py`(`format_report`·`report_notes`) | C# SQL + Python |

- 원본의 열린 포트·토큰(`--medicore-secure`, Kestrel), 파이썬 중계(`medicore/claim_import.py`), 양지바른 설정 맞추기는 옮기지 않는다. 덮어쓰기 승인(`confirmOverwrite`)은 2026-11-01 사용자 결정으로 옮겼고, 2026-11-02 사용자 결정으로 사이트가 사람마다 묻지 않고 기본으로 바꾼다(19-6)
- 원본 시험(`tests/test_claim_precheck.py` 등, 모두 가짜 자료)의 사례는 골든 테스트의 씨앗으로 쓴다(10절)

## 3. 폴더

```
extension/                          # 크롬 확장 (TASK-3)
├── manifest.json                   # MV3. permissions: ["nativeMessaging"]. externally_connectable.matches: 우리 origin 하나. key: 고정 ID용 공개키
├── tsconfig.json                   # 확장만의 설정. tsc → extension/dist/
└── src/
    ├── background.ts               # 서비스 워커: 웹 연결 받기 → 검사 → connectNative → 그대로 넘기기
    ├── relay.ts                    # 검사·넘기기 순수 함수(시험 대상). commands.json을 import
    └── *.test.ts
helper/                             # 도우미 (TASK-1·2·5·8·15·16·17·20·23·27)
├── Precheck.sln · Directory.Build.props   # 버전(Version)은 여기 한 곳
├── src/Precheck.Core/              # netstandard2.0. 플랫폼과 상관없는 것. 리눅스에서도 시험
│   ├── Protocol/                   # Framing(4바이트 길이+JSON) · Envelope · CommandTable · Chunker · Dispatcher · Version
│   ├── Bit/                        # Sql(원본 SQL 상수) · ReadOnlyGuard · HospitalCheck · GridRows(83·83D·47 표 → 줄) · IBitDb
│   ├── Claim/                      # ClaimDates · ClaimMonthPayload · MemoCompare
│   ├── Store/                      # WorkStore(저장 형식·이어서 하기 기록) · IProtector
│   ├── Input/                      # InputRunner(묶음 고리, 원본 autoOne) · MemoApproval(원본) · IChartUi · UiFingerprint · Journal
│   ├── Sam/                        # SamFiles(원본 sam_files.py)
│   ├── Contact/ · Stats/           # 연락 대상·통계 자료 모양
├── src/Precheck.Windows/           # net48. 윈도우에서만 돈다
│   │                               # InstallationLocator · NativeEnvironmentGuard · ReadOnlyConnection · VendorLogin(비트 로그인 창)
│   │                               # VendorGridExport(원본 NativeReportAdapter·NativeMappings) · SqlBitDb · DpapiProtector
│   │                               # NativeTarget · UChartAutomation(FlaUI) · ViewModeNotices(조회 모드 안내창, 19-7) · ConfirmWindow · ProgressWindow (WinForms)
├── src/Precheck.Helper/            # net48 exe. Program.Main: 표준 입출력 고리 + 명령 처리기 연결
├── tests/Precheck.Core.Tests/      # xUnit. net10.0(리눅스) + net48(윈도우). 파일 이름은 *.test.cs
├── tests/Precheck.Windows.Tests/   # xUnit net48. Actions 윈도우에서만
├── tests/runDotnet.ts              # vitest 감싸개 공용: dotnet test --filter 를 한 번에 하나씩(잠금 폴더) 부른다
├── tests/*.dotnet.test.ts          # TASK마다 감싸개 하나 (하네스 TDD 기록용)
└── install/                        # install.cmd · install.ps1 · uninstall.ps1 · host-manifest.json(틀)
.github/workflows/helper.yml        # 윈도우 빌드·시험 + 확장 zip (TASK-2·3)
src/
├── lib/bridge/                     # [환자 구역·통로] (TASK-4)
│   ├── commands.json               # 명령 표 원본 하나. 확장(import)·도우미(EmbeddedResource)·웹이 같이 쓴다
│   ├── protocol.ts                 # 봉투 타입·PROTOCOL·명령 표 읽기
│   ├── versions.ts                 # MIN_HELPER·LATEST_HELPER·MIN_EXTENSION
│   ├── extensionId.ts              # EXTENSION_ID 상수 하나
│   ├── handshake.ts                # checkVersions
│   ├── client.ts                   # connectBridge({ runtime, sink }) — lib/bridge 안에서만 import
│   └── workerSink.ts               # connectScreenBridge({ runtime, worker }) — 화면이 쓰는 입구. 조각·보낼 글자는 전용 포트로 Worker와만
├── lib/precheck/                   # [환자 구역] 계산 (TASK-7·9·10·11·14·16·21·24)
│   ├── data/                       # rules.json(262개)·dxFlags.json·drugInfo.json·codeMap.json — Worker가 import()로 그때 불러옴
│   ├── tables.ts · shape.ts · rules/ · dx/ · memo/ · memoCompare.ts · inputTargets.ts · excel.ts · counts.ts · sam/ · followup/
├── lib/analytics/                  # [환자 구역, 기존] rxTrend.ts · revisit30.ts · rxVisitSplit.ts (TASK-28·29)
├── lib/report/reportText.ts        # 보고 문장(집계 숫자만 받음) (TASK-30)
├── lib/storage/                    # claimSettings.ts(설정 3가지) · claimCounts.ts(건수 3가지) (TASK-12·19)
├── lib/backup/                     # 백업 JSON·되돌려 넣기 SQL (TASK-32)
├── lib/messages/fill.ts            # 문자 문구 채우기(<<DATE>>) (TASK-25)
├── workers/precheck.worker.ts      # [환자 구역] Worker 입구
├── workers/precheck/               # assemble(조각 모으기) · jobs(시험이 바로 부르는 순수 함수)
├── components/claim/               # 청구 화면 (TASK-6·13·18·19·22). claimLoad.ts = 불러오기 번호(6-2). memo/ = 메모 칸. rows/ = [울타리] 환자 줄
├── components/contact/             # 환자 연락 (TASK-26). rows/ = [울타리]
├── components/settings/            # 설정 칸들 (TASK-12·18·25·32)
├── components/stats/               # 통계 추가분 (TASK-31)
└── app/(app)/{claim, claim/setup, claim/close, contact, stats, settings}/page.tsx
supabase/migrations/20261030000000_precheck_settings.sql · 20261030000100_precheck_counts.sql
fixtures/precheck/                  # 가짜 자료·생성기·골든 결과 (10절)
scripts/precheck/                   # 원본에서 표 옮기기·골든 만들기(원본 경로를 인자로 받음, ESLint 밖)
```
- 경로(`/claim` 등)는 Claude 판단이다. 탭 이름·위치는 목업 승인본을 따른다
- `tsconfig.json`은 `extension/`·`helper/`를 빼고(`exclude`), 확장은 자기 tsconfig로 빌드한다. vitest `include`에 `extension/**/*.test.ts`·`helper/tests/*.dotnet.test.ts`를 더한다

## 4. 메시지 약속 (네이티브 메시징)

### 4-1. 틀과 크기
- 크롬 ↔ 도우미: 메시지마다 앞 4바이트(리틀 엔디언) 길이 + UTF-8 JSON (크롬 규칙)
- 크기 한도(크롬 규칙): 도우미 → 크롬 메시지 하나는 **1MB**까지, 크롬 → 도우미는 64MiB까지. 도우미는 한 메시지를 1,000,000바이트(머리 포함) 이하로 만든다
- 크롬 → 도우미 메시지의 길이 머리가 64MiB를 넘으면 틀이 깨진 것으로 보고 도우미는 본문을 읽지 않고 끝난다(다음 메시지 자리를 찾을 수 없다, AC-001.1)
- 웹 ↔ 확장: `chrome.runtime.connect(EXTENSION_ID)`의 Port 메시지(JSON). 확장은 봉투를 검사만 하고 그대로 넘긴다

### 4-2. 봉투
```ts
// 웹 → 확장 → 도우미
type Request = { v: 1; id: string /* 요청마다 새 UUID */; cmd: CommandName; args: Record<string, unknown> }
//   보내는 명령(store.save·bit.input)은 args가 { payload: string } 하나다. payload = Worker가 만든 JSON 글자 그대로(통로·확장은 풀지 않는다)
type SendRequest = { v: 1; id: string; cmd: 'store.save' | 'bit.input'; args: { payload: string } }
// 도우미 → 확장 → 웹 (메시지 하나 ≤ 1MB)
type Reply =
  | { v: 1; id: string; type: 'result'; data: unknown }                   // 숫자·상태 명령의 답(작음)
  | { v: 1; id: string; type: 'chunk'; seq: number; data: string }        // 환자 자료: JSON 글자를 UTF-8 경계에서 자른 조각
  | { v: 1; id: string; type: 'end'; count: number; bytes: number; sha256: string } // 조각 수·바이트 수·전체 SHA-256
  | { v: 1; id: string; type: 'progress'; done: number; total: number }  // 입력 진행(숫자만. 통로가 0 ≤ done ≤ total ≤ 500 정수인지 검사, AC-004.10). 첫 progress는 확인을 지나 입력을 시작하기 직전이다(확장이 창을 내리는 신호, 19-8)
  | { v: 1; id: string; type: 'error'; code: string /* 'E-…' */ }
```
- 웹 → 도우미로 가는 큰 자료(작업 저장·입력 묶음)는 메시지 하나(64MiB 이하)로 보낸다. 웹 쪽은 나누지 않는다
- 그 봉투는 `SendRequest`(`args: {payload}`) 모양이다. 통로는 `payload` 글자를 그대로 넣고(AC-004.9), 도우미가 `payload`를 풀어 명령 표의 안쪽 모양으로 검사한 뒤 처리기에 넘긴다(AC-001.2)

### 4-3. 명령 표 (`src/lib/bridge/commands.json`)
| cmd | 하는 일 | 답 | 환자 자료 | PC 확인 창 |
|---|---|---|---|---|
| `hello` | 버전 | result `{ helperVersion, protocol }` | 아니오 | — |
| `bit.check` | 비트 찾기 → DB 읽기 → 등록한 병원인지 | result `{ steps: [{ name, ok, code? }], registered, institutionCode? }` (병원 이름 없음, 9-1) | 아니오 | — |
| `bit.register` | 처음 등록: 비트 로그인 창 → 범위·기관기호 확인 → 저장 | result `{ registered }` | 아니오 | 예 |
| `claim.dates` | 기간의 날짜별 외래 진료 수·비트 메모 있는 수 | result `{ days: [{ date, visits, memoInBit }] }` | 아니오(숫자) | — |
| `claim.month` | 기간의 증상·상병·소모 표 + 12개월 이력 + 상병 추세 + 처방 목록 | chunk … end | 예 | — |
| `claim.memos` | 기간의 비트 청구메모 | chunk … end | 예 | — |
| `store.load` | 저장해 둔 작업(월 단위) | chunk … end | 예 | — |
| `store.save` | 작업 저장 | result `{ saved: true }` | 예(보내는 쪽) | — |
| `bit.input` | 메모 묶음 입력. payload `{code?, items: [{visitKey, chart, name, date, memo, replaces?, checkedByHand?}]}` | progress … chunk(사람마다 결과) … end | 예 | 예(묶음마다. '이제부터 묻지 않기'를 켠 뒤에는 생략, 19-6) |
| `sam.latest` | 최신 심평원 청구 파일(우리 기관만) | chunk … end | 예 | — |
| `contact.targets` | F/U·정기 주사 대상 기록 | chunk … end | 예 | — |
| `stats.rows` | 통계 자료(소모 47 표 줄·추세 사실·일 운영 숫자) | chunk … end | 예 | — |
- `commands.json`에는 `protocol`·`extensionId`·`hostName`(`com.seoseungkwan.precheck`)·`origin`(우리 사이트)·`extensionKey`(확장 manifest `key`에 넣는 공개키, 비밀 아님)와 명령 표(이름·`patient`·`args` 모양)를 둔다. `extensionId.ts`는 이 값을 `EXTENSION_ID` 상수로 내보내고, 도우미는 같은 파일을 EmbeddedResource로 읽어 호출 origin을 검사한다
- 명령마다 `args`의 칸 이름·종류·범위를 정해 둔다(예: 날짜는 `YYYY-MM-DD`. 기간은 시작·끝 날을 함께 세어 `claim.month` 35일 이하 — 12개월 이력까지 원본 한도 400일 안에 들게, `claim.dates`·`claim.memos` 400일 이하). 모르는 칸이 있으면 거절한다. 확장·도우미·웹이 같은 표를 읽는다
- 보내는 명령(`store.save`·`bit.input`)은 표에 `payload` 안쪽 모양을 적는다. 이 문서와 AC에서 `store.save {…}`·`bit.input {items}`라고 쓴 것은 `payload` 안의 모양이다
- '환자 자료' 명령의 답은 늘 chunk … end로 온다(작아도). 통로 코드는 이 답을 풀지 않는다

### 4-4. 버전 맞추기
- `protocol`: 메시지 약속 번호(정수, 처음 1). 웹·확장·도우미가 같아야 한다
- 웹 `versions.ts`: `MIN_HELPER`(이보다 낮으면 막음), `LATEST_HELPER`(이보다 낮으면 안내만), `MIN_EXTENSION`
- `checkVersions` 결과: `ok` · `ok + helperUpdateAvailable` · `update-helper` · `update-extension` · `no-extension` · `no-helper`

### 4-5. 오류 번호 (`lib/errors.ts`에 문구)
`E-EXT-MISSING`(확장 없음) · `E-HELPER-MISSING`(도우미 없음) · `E-HELPER-OLD` · `E-EXT-OLD` · `E-BRIDGE-BUSY`(다른 창에서 작업 중) · `E-BRIDGE-DISCONNECTED` · `E-BRIDGE-REJECTED` · `E-BRIDGE-BAD-REPLY` · `E-HELPER-BAD-MESSAGE` · `E-HELPER-UNKNOWN-COMMAND` · `E-BIT-NOT-FOUND` · `E-BIT-DB-FAILED` · `E-BIT-NOT-REGISTERED` · `E-BIT-HOSPITAL-MISMATCH` · `E-BIT-READ-FAILED` · `E-BIT-EXPORT-FAILED` · `E-CLAIM-PARTIAL` · `E-RULES-LOAD-FAILED` · `E-SETTINGS-FAILED` · `E-STORE-FAILED` · `E-STORE-BROKEN` · `E-BIT-UI-CHANGED` · `E-BIT-UNSAVED-RX` · `E-INPUT-STOPPED` · `E-MEMO-NO-SETTINGS`(병원 설정이 없어 메모를 만들지 않음, 19-3) · `E-SAM-NOT-FOUND` · `E-COUNTS-FAILED` · `E-BACKUP-FAILED` · `E-BIT-REG-NONE` · `E-BIT-REG-MANY` · `E-BIT-REG-CODE` · `E-BIT-REG-PLACE`(처음 등록이 막힌 곳, 9-1·아래 표)

처음 등록이 막힌 곳 번호의 글(AC-005.14, TASK-43 — 화면 글은 이 표 그대로):

| 번호 | 무엇이 | 어떻게 고치나 |
|---|---|---|
| `E-BIT-REG-NONE` | 이 비트에서 의원 정보를 찾지 못했어요 | 비트에 병원 정보가 들어 있는지 비트 업체에 물어봐 주세요. 고친 뒤 [처음 등록]을 다시 눌러 주세요. |
| `E-BIT-REG-MANY` | 이 비트에 의원이 둘 이상 들어 있어요 | 다른 의원 자료가 섞이지 않게 여기서 멈췄어요. 오류 번호와 함께 문의해 주세요. |
| `E-BIT-REG-CODE` | 비트에서 오늘 쓰는 요양기관번호를 하나로 찾지 못했어요 | 비트의 병원 정보에 오늘 쓰는 요양기관번호가 하나만 들어 있는지 비트 업체에 물어봐 주세요. 고친 뒤 [처음 등록]을 다시 눌러 주세요. |
| `E-BIT-REG-PLACE` | 비트 설치 위치나 자료 연결 정보를 알아보지 못했어요 | 비트를 켜서 로그인되는지 확인한 뒤 [처음 등록]을 다시 눌러 주세요. 계속되면 오류 번호와 함께 문의해 주세요. |

## 5. 환자 자료 길과 울타리

```
도우미(비트 DB·화면) ─chunk─▶ 확장(검사만) ─chunk─▶ lib/bridge(풀지 않음) ─전용 포트─▶ Worker
  ▲                                                                                   │
  └──── store.save · bit.input (Worker가 만든 글자 → 전용 포트 → 통로가 그대로 넘김) ◀────┤
                                                                                      ▼
                                                     화면: 보기 모양만 (components/claim/rows · contact/rows)
                                                     서버: 건수(정수)만 · 엑셀: 그 PC 파일
```
- **통로 코드 `lib/bridge`**: 환자 자료 구역 규칙 전부(네트워크·console·브라우저 저장소·React/Next/supabase/auth/storage import 금지)에 더해 `window.postMessage`·`BroadcastChannel`·`parent`·`top`·`opener`를 막는다. `chrome.runtime.connect`·`sendMessage`는 첫 인자가 `EXTENSION_ID`일 때만 된다(ESLint `no-restricted-syntax`). 환자 자료 답 조각은 `JSON.parse` 없이 `sink.chunk(id, seq, data)`로 Worker에 넘긴다
- **화면은 Worker만 넘긴다**: 화면(`components/claim/useBridge`)은 `lib/bridge/workerSink.ts`의 `connectScreenBridge({ runtime, worker })`에 Worker 객체만 넘긴다. `workerSink`가 `MessageChannel` 하나를 만들어 한쪽 포트를 Worker에 주고, 조각·`end`·`abort`와 Worker가 만든 보낼 글자(`store.save`·`bit.input`)는 이 포트로만 오간다. 화면 코드는 조각·보낼 글자를 받지 않는다. 화면이 받는 것은 상태·숫자·상태 명령의 검사한 답(AC-004.6)·진행 숫자·`{id, count}`·오류 번호와 Worker가 만든 보기 모양뿐이다. `lib/bridge/client.ts`는 `lib/bridge` 밖에서 import할 수 없다(AC-004.11)
- **계산 `lib/precheck`**: 기존 구역 규칙 그대로. 규칙표 등 큰 표는 Worker가 글자로 고정한 경로의 `import()`로 불러온다(구역 안 `fetch` 금지를 지킨다)
- **화면 줄 `components/claim/rows`·`components/contact/rows`**: JSX는 되고, 네트워크·console·브라우저 저장소·supabase·storage·auth import는 막는다. 줄은 props로만 받는다
- **오류 수집 없음**: `components/claim`·`components/contact`·`app/(app)/claim`·`app/(app)/contact`는 오류 보고 패키지(`@sentry/*`·`@vercel/analytics`·`@vercel/speed-insights` 등)를 import할 수 없다. 오류 카드는 번호만 보인다
- **CSP**: 바꾸지 않는다. 확장 ID는 코드 상수(`extensionId.ts`)와 확장 manifest에만 있다
- **브라우저 저장소**: 쓰지 않는다. 고치던 메모·완료 표시·입력 기록·연락 표시는 도우미 저장(9-3)
- **주소(URL)에는 날짜만**: 화면 사이 이동은 주소·쿼리에 날짜(`from`·`to`)만 넣는다. 차트번호·이름·`visitKey`·메모·전화는 주소·쿼리·화면 제목에 넣지 않고 같은 탭 메모리로 넘긴다. 주소는 서버 기록과 브라우저 방문 기록에 남기 때문이다(AC-022.2)
- 화면에 보이는 환자 칸: 청구는 진료일·차트번호·이름·경고·메모, 연락은 이름·전화·다음 날짜·내용. 모두 그 PC 화면에만 보인다 **(사용자 결정에서 나옴: 환자마다 경고·메모를 보고, 명단을 보고 문자를 보낸다)**

## 6. 웹 안

### 6-1. 통로 코드 `lib/bridge/client.ts` · `workerSink.ts`
```ts
export type BridgeState = 'connecting' | 'ready' | 'no-extension' | 'no-helper' | 'busy' | 'update-helper' | 'update-extension' | 'disconnected'
export type ChunkSink = { chunk(id: string, seq: number, data: string): void; end(id: string, count: number, bytes: number, sha256: string): void; abort(id: string, code: string): void }
export function connectBridge(deps: { runtime: ChromeRuntimeLike | undefined; sink: ChunkSink; newId?: () => string }): Bridge   // lib/bridge 안(workerSink)에서만 import
export type Bridge = {
  state(): BridgeState; onState(fn: (s: BridgeState) => void): () => void
  onProgress(fn: (p: { id: string; done: number; total: number }) => void): () => void   // bit.input 진행(숫자만, AC-004.10)
  hello(): Promise<HelloResult>                                    // 버전 맞추기까지
  call<C extends SmallCommand>(cmd: C, args: ArgsOf<C>): Promise<ResultOf<C>>   // 숫자·상태 명령(모양 검사)
  stream<C extends PatientCommand>(cmd: C, args: ArgsOf<C>): Promise<{ id: string; count: number }>  // 환자 자료 명령: 조각은 sink로
  send<C extends PatientSendCommand>(cmd: C, payload: string /* Worker가 만든 JSON 글자 */): Promise<SendResult<C>>
    // 봉투 { v: 1, id, cmd, args: { payload } }에 글자 그대로. store.save → { saved: true }, bit.input → 조각은 sink, { id, count } (AC-004.9)
  close(): void
}

// lib/bridge/workerSink.ts — 화면이 쓰는 입구 [환자 구역·통로]
export type WorkerLike = { postMessage(message: unknown, transfer: Transferable[]): void }
export type ScreenBridge = Omit<Bridge, 'send'>        // 화면은 보낼 글자를 쥐지 않는다
export function connectScreenBridge(deps: { runtime: ChromeRuntimeLike | undefined; worker?: WorkerLike; newId?: () => string }): ScreenBridge
```
- `connectScreenBridge`는 `MessageChannel`을 만들어 `port2`를 Worker에 한 번 넘긴다(`{type: 'bridge-port'}`). 통로 → Worker: `{type: 'chunk', id, seq, data}`·`{type: 'end', id, count, bytes, sha256}`·`{type: 'abort', id, code}`. Worker → 통로: `{type: 'send', ticket, cmd, payload}` → `send` → Worker에 `{type: 'sent', ticket, ok: true, id?, count?}` 또는 `{type: 'sent', ticket, ok: false, code}`. `send`의 `cmd`가 `store.save`·`bit.input`이 아니면 보내지 않고 `E-BRIDGE-REJECTED`
- 화면은 Worker에 '저장해 줘'·'입력해 줘'처럼 일만 시키고, 결과는 Worker가 만든 보기 모양과 `onProgress` 숫자로 받는다. `worker`가 없으면(설치 화면) 조각은 울타리 안에서 버리고 보낼 글자는 없다

### 6-2. Worker `workers/precheck.worker.ts`
- 받는 일: 통로 포트(`bridge-port`로 받은 `MessagePort`)에서 `chunk`·`end`·`abort`·`sent`, 화면에서 `loadStart`·`month`·`loadPart`·`memoReloadStart`(불러오기, 아래), `ruleList`, `check`(점검. 고른 기간 `visible`을 함께 받는다, 19-9), `editMemo`, `buildInputBatch`, `applyInputResults`, `excel`, `samMatch`, `followup`, `stats`
- 보내는 것: 화면에는 보기 모양(`ClaimView`·`MonthCloseView`·`ContactView`·`StatsExtrasView`)·서버에 올릴 건수·엑셀 바이트·보내기 결과(됨·오류 번호). 통로 포트에는 도우미에 보낼 글자(`store.save`·`bit.input` payload) — 메모 저장·입력 묶음·연락 표시·설정 사본은 Worker가 글자를 만들어 포트로 바로 보낸다(화면을 지나지 않는다)
- `jobs.ts`의 순수 함수를 부르기만 한다(시험은 jobs를 바로 부른다, `analyzeFiles`와 같은 방식)
- **불러오기 약속**(약속 전문은 `src/types/precheck.ts`의 `PrecheckFromScreen` 주석. 달라지면 그 주석을 먼저 고친다):
  - 화면 → Worker: `{type: 'loadStart', load, keepEdits?}`(불러올 때마다 새 번호, `stream('claim.month')` 바로 앞. 답 없음. 전에 불러온 달을 버린다) · `{type: 'month', id, load}`(stream이 끝나면 새 불러오기를 시작했어도 보낸다. 모아 둔 글자를 찾아 가 버리게) · `{type: 'loadPart', part: 'memos' | 'store', id, load}`(`claim.memos`·`store.load`의 끝난 `id`마다) · 비트 메모 다시 불러오기: `{type: 'memoReloadStart', run}`과 `{type: 'loadPart', part: 'memos', id, load, run}`(19-12)
  - Worker → 화면: `{type: 'month', id, load, ok: true, visits, months}` 또는 `{…, ok: false, code}` · `{type: 'loadPart', part, id, load, ok: true}` 또는 `{…, ok: false, code}`(`run`을 받았으면 `run`도 되돌린다) · `{type: 'partial', id, code: 'E-CLAIM-PARTIAL'}`(알림일 뿐. 성패 판단에 쓰지 않는다)
  - 점검해도 되는 때: 마지막 번호의 `month`와 `loadPart`가 모두 `ok: true`로 답했을 때뿐이다. stream이 끝난 것만으로는 안 된다(SHA-256이 달라도 stream은 끝난다). 어느 불러오기의 답인지는 `load`로 견준다. `id`로 견주지 않는다(새 요청의 `id`는 stream이 끝나기 전에는 화면에 없다). 번호가 다른 답은 `ok`와 상관없이 버린다
  - stream 거절: `claim.month`는 그 불러오기의 실패다(`month`를 보내지 않고 번호만 안 맞으면 버림). `claim.memos`·`store.load`는 `E-HELPER-UNKNOWN-COMMAND`면 그 자료 없이 계속하고 다른 번호면 멈춘다(TASK-18부터 `store.load`의 `E-BIT-HOSPITAL-MISMATCH`는 AC-018.17)
  - **번호는 Worker 하나에 하나**: `components/claim/claimLoad.ts`에 Worker와 함께 둔다. 컴포넌트 state에 두면 다시 그릴 때 번호가 되풀이되고, Worker는 같은지만 보므로 옛 답이 통과한다(AC-013.12)
  - **떠났다 돌아올 때 (AC-013.6, Claude 판단)**: 결과를 낼 때 사람과 기관기호를 안 점검 결과가 있으면 떠날 때 `loadStart`를 보내지 않는다. 결과(`ClaimView`)·기간·단계·띠는 `ClaimChannel`의 메모리에만 맡긴다(저장소·주소 금지). Worker의 달·결과는 그대로이고 통로 포트가 새것으로 바뀌어도 같다. 돌아오면 로그인한 사람(계정당 병원 하나)과 `bit.check`의 기관기호를 결과를 낼 때와 견주고 `bit.check`의 모든 단계가 `ok`일 때만 그린다. 다르거나 모르면 결과를 지우고 `loadStart`만 보내 달을 버린다. 그 밖에 떠날 때(결과 없음·불러오는 중·사람이나 기관기호를 몰랐던 결과)와 [멈추기]도 stream 없이 `loadStart`만 보낸다. 떠나기 전의 [다시 점검]은 떠나 있는 동안 답이 오면 맡긴 결과에 반영하고, 실패면 맡긴 결과와 달을 버린다. 돌아와 확인이 끝날 때까지 답이 없으면 번호를 하나 건너뛰어 옛 답을 버리고 다시 묻는다. 설정을 읽는 사이에 떠났으면 번호를 받지 않고 그만둔다. 로그아웃은 전체 페이지 이동이라 맡긴 것도 사라진다. 입력하는 동안 떠나면 맡긴 결과를 버리고 `loadStart`만 보낸다 **(Claude 판단)**: 끝 답이 이 화면에 오지 않고 결과는 [자료 불러오기]로 읽는다(AC-018.5·AC-017.9). [자료 불러오기]·[멈추기]의 `loadStart`에는 `keepEdits`를 싣는다. 떠날 때와 사람이나 기관기호가 다를 때는 싣지 않는다
  - `loadPart`는 TASK-16이 더한다(TASK-13 앞). `month`와 같은 `assemble.take`를 쓴다. 답이 작아 `precheck.worker.ts`는 그대로다(`jobs.fromScreen`으로 간다)

### 6-3. 계산 모양 (TASK-9, `types/precheck.ts`)
```ts
type Visit = { key: string /* 원본 v.id */; chart: string; date: string /* YYYY-MM-DD */; month: string /* 진료 달, AC-009.5 */; name: string; lines: string[] /* 증상 글 */; hints: (LineHint | null)[] /* lines와 같은 길이 */; rx: RxLine[]; dx: DxLine[]; memosInBit: string[] /* 500자에서 잘림. 비교는 claim.memos로, AC-016.6 */ }
type RxLine = { code: string; name: string; qty: number | null /* 못 읽으면 null */; benefit: boolean /* 급여구분에 '비급여'가 없음 */; pay: string }
type DxLine = { c: string; n: string; m: true | false | 'x' | null /* 주·부·제외·주상병 칸 없음 */; s: string /* 산정특례 */; d: string /* 과목 */; t: string /* 진단일 */ }
type History = Map<string /* chart */, Map<string /* date */, { codes: string[]; memo: string }>>
type RxByDay = Map<string /* chart */, Map<string /* date */, RxLine[]>>   // 원본 RXDATA. 증상이 없어 진료가 안 된 날의 처방도 남는다
type ClaimMonth = { period: { from: string; to: string }; visits: Visit[]; history: History; historyRange: { from: string; to: string }; rxByDay: RxByDay; rxDayOrder: RxLine[][] /* 원본 RXDATA의 (차트, 날짜) 첫 등장 차례 */; dxTrend: DxTrend; catalog: HospitalCatalog; hasDx: boolean /* 상병(83D) 줄이 있었나 */ }
type Finding = { visitKey: string; ruleId: string; grade: '확인필요' | '알림' | '참고'; message: string; detail: string; basis: Basis[] }
```
- 위 모양은 TASK-9가 만든 실제 타입에 맞췄다. 칸의 뜻은 `src/types/precheck.ts` 주석이 정한다
- **TASK-11이 step 스케치와 달라진 것**(`src/lib/precheck/dx/recommend.ts`): 추천 줄의 `src`는 배열, `ex`는 참·거짓, `t`는 객체다. `dxIssues`·`needsCheck`·`missingDx`는 `DxContext`(`dxContext({trend, links, visits, hasDx, hasMemo})`)를 받고 `missingDx`는 참·거짓을 돌려준다. 상병 이름은 83D 표 전체가 아니라 `month.visits`에서 찾는다. I·N 표 경고는 규칙 DX-01·DX-02(TASK-10)로만 나오고 진료 보기(`visitDxView`)에는 싣지 않는다(두 번 보이지 않게). `hasMemo`는 TASK-14가 `dxViews`에 넘겨 잇고(AC-014.13) `dxViews`를 화면까지 잇는 것은 TASK-13이다(AC-013.14). `dxViews`는 틀린 연결표에 `TypeError`를 던지므로 부르는 쪽이 잡는다(AC-013.14). 인자의 뜻은 그 파일 주석이 정한다
- 원본의 전역 값(`VISITS`·`RXDATA`·`NEW_MEDICORE_DIAGNOSES`·`CODEMAP`·`DRUGINFO`·`HIST.byChart`)을 위 모양 하나로 묶어 함수에 넘긴다. 함수 안 계산은 원본 줄 그대로 옮긴다

### 6-4. 날짜 목록 (TASK-13)
- 재료: 도우미 `claim.dates`(최근 60일, 날짜별 외래 진료 수·비트 메모 수) + 서버 `claim_day_counts`(불러와 점검한 날의 메모 필요 수·입력 수)
- 진료 0건인 날은 뺀다. 순서: ① 덜 끝난 날(메모 필요 > 입력, 또는 아직 불러오지 않은 날, 또는 서버 줄의 진료 수가 `claim.dates`와 다른 날. AC-013.1)을 오래된 날부터 ② 다 끝난 날을 최근 날부터
- 기간은 달을 넘겨 고를 수 있다(예: 10/30~11/2). 한 번에 35일까지다(12개월 이력까지 원본 한도 400일 안, AC-008.1). 월말 마감은 달마다 따로 한다
- 고른 기간이 짧아도 `claim.month`는 한 달을 읽는다. 고른 기간만 보인다(19-9, AC-013.13)

### 6-5. 설정이 바뀌었을 때
- 청구 화면은 점검에 쓴 설정을 기억한다. 창에 초점이 돌아올 때, 다른 탭에 갔다가 청구 화면으로 돌아와 결과를 되살릴 때(앱 안 이동에는 초점 사건이 없다), [비트에 입력] 직전에 서버 설정을 다시 읽어 다르면 "설정이 바뀌었어요, 다시 점검하세요" 띠를 띄우고, [다시 점검]을 누르기 전까지 [비트에 입력]을 막는다 **(Claude 판단)**. 읽지 못하면 띠는 그대로 두고, 떠날 때 떠 있던 띠도 함께 남는다 **(Claude 판단)**. 띠는 화면 맨 위 노란 띠이고 [다시 점검]은 그 안에 있으며, 막힌 [비트에 입력] 옆 글은 "[다시 점검]을 누른 뒤에 눌러 주세요."다 **(승인 목업)**(AC-018.3, tasks.md TASK-18)

## 7. 화면 (내용만, 배치는 목업 승인본)
| 화면 | 보이는 것 | 단추 | 상태 |
|---|---|---|---|
| 설치·연결 확인 `/claim/setup` | 확장·도우미·비트·기관기호 단계별 ✓/✗와 오류 번호 · '이 PC'(병원 이름은 사이트의 로그인한 병원 이름, 기관기호는 가림) | [연결 확인] · [처음 등록] · [다시 등록](병원이 다를 때) · 확장 설치 링크 · 도우미 내려받기 안내 | 확장 없음 · 도우미 없음 · 업데이트 필요 · 새 도우미 있음 · 연결됨 · 다른 창에서 작업 중 |
| 청구 `/claim` | 날짜 목록(6-4) · 기간 · 환자별 경고(확인 필요·알림·참고)와 고시 근거 · 추천 상병 · 메모 초안 · 비트에 저장된 청구메모 카드(19-12) · 입력 방식(처방코드별·날짜별, 코드 칸·코드 단추) · 다른 메모 나란히 보기 · '직접 입력' · 쓰다 멈춘 사람 | [자료 불러오기] · [비트 메모 전체 불러오기] · [엑셀 내려받기](규칙별·환자별) · [비트에 입력] · [다시 하기] · [다시 점검] · [바꾸지 않기] · [이 메모로 바꾸기] · [빼고 N명 입력] · [먼저 고치기] · [이어서 입력] · [직접 확인했어요] · [엑셀로 저장](입력 결과) | 불러오는 중 · 지난 점검 결과 확인 중 · 일부만 옴(멈춤) · 설정 바뀜 · 입력 중(진행 숫자) · 결과(완료·확인 필요·건너뜀+이유) · 병원 설정 없음 · 기관기호가 바뀌어 저장 막힘 |
| 월말 마감 `/claim/close` | 달 고르기 · 미완료 · 빠진 것 · 확인 표시 남은 것 · SAM 파일 이름·받은 시각 | [청구 파일 불러오기] · 줄마다 청구 화면으로 가기 | 파일 없음 · 대조 끝 |
| 환자 연락 `/contact` | F/U 명단 · 정기 주사 명단(이름·전화·다음 날짜·내용·지남/남은 날) · 연락 표시 | [문구 복사] · [연락함] 표시 · 기간 고르기 | 대상 없음 · 불러오는 중 |
| 통계 추가분 `/stats` | 처방 추세 그래프(일·주·월, 기간 비교, 건수·금액·소모량) · 신환 30일 재방문·첫 재방문 날수 · 처방별 신환·재진 · 보고 문장 | [문장 복사] · 자료 고르기(도우미·파일 올리기) | 파일에는 금액·소모량이 없음 안내 · 확인 필요 금액 |
| 설정 `/settings` | 점검 규칙(켜기·끄기·등급·근거) · 병원 문구(메모 모양 · 시술별 문구와 약 · 사유 문장, 19-3) · 상병 연결표 · 문자 문구 | [저장] · [기본값으로] · [백업 내려받기] | 저장 실패(값 유지 + [다시 저장]) |
| 밖에서 보는 건수 (`/claim`, 확장 없는 곳) | 날짜별 메모 남은 수 · 월말 마감 남은 일 · 연락 남은 건수, 각각 마지막으로 바뀐 시각 | 없음(보기만) | 아직 올린 건수 없음 |

- 모양은 b2b 개편 규칙(`ds`·토큰·앱 틀)을 따른다. 탭 줄·설정 안 메뉴·칩을 옮기는 법은 18-3

## 8. DB 표 · RLS · 제약

### 8-1. 설정 (`20261030000000_precheck_settings.sql`, TASK-12)
```sql
create or replace function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
  as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
create or replace function public.touch_updated_at() returns trigger ...   -- update 때 updated_at = now(). 다른 기능의 마이그레이션 뒤에 붙여 넣어도 실패하지 않게 or replace

create table public.claim_rule_settings (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  rule_id text not null check (rule_id ~ '^[A-Z]{2}-[0-9]{2,3}[a-z]?$'),
  enabled boolean not null,
  grade text check (grade in ('확인필요', '알림', '참고')),          -- null = 규칙표 기본 등급
  updated_at timestamptz not null default now(),
  primary key (hospital_id, rule_id));
create table public.claim_hospital_settings (                         -- 병원 문구 + 상병 연결표 (원본 설정 모양)
  hospital_id uuid primary key default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  phrases jsonb not null check (jsonb_typeof(phrases) = 'object' and pg_column_size(phrases) < 262144),
  dx_links jsonb not null default '[]' check (jsonb_typeof(dx_links) = 'array' and pg_column_size(dx_links) < 262144),
  updated_at timestamptz not null default now());
create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  kind text not null check (kind in ('injection', 'followup')),
  name text not null check (char_length(name) between 1 and 30),
  body text not null check (char_length(body) between 1 and 2000),
  sort_order int not null default 0 check (sort_order between 0 and 99),
  updated_at timestamptz not null default now());
```
- `rule_id`: 원본 262개가 모두 `XX-NN`(예: `LA-01`) 모양이고 겹치지 않는다(2026-10-30 확인). 새 규칙을 위해 세 자리·끝 소문자까지 받는다

### 8-2. 건수 (`20261030000100_precheck_counts.sql`, TASK-19)
```sql
create table public.claim_day_counts (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  visit_date date not null,
  visits int not null check (visits between 0 and 100000),
  need_memo int not null check (need_memo between 0 and 100000),
  entered int not null check (entered between 0 and need_memo),
  needs_check int not null check (needs_check between 0 and 100000),
  skipped int not null check (skipped between 0 and 100000),
  updated_at timestamptz not null default now(),
  primary key (hospital_id, visit_date));
create table public.claim_month_counts (
  hospital_id … , claim_month date not null check (extract(day from claim_month) = 1),
  incomplete int not null check (incomplete between 0 and 100000), missing int … , flagged int … ,
  updated_at timestamptz not null default now(), primary key (hospital_id, claim_month));
create table public.contact_counts (
  hospital_id uuid primary key default public.my_hospital_id() …,
  followup_left int not null check (followup_left between 0 and 100000), injection_left int … ,
  updated_at timestamptz not null default now());
```
- 건수 표의 칸은 `uuid`(병원)·`date`·`integer`·`timestamptz`뿐이다. 글자·jsonb 칸이 없다(시험으로 증명)

### 8-3. 권한 (두 파일 같음)
- `alter table … enable row level security` → `revoke all … from anon, authenticated` → 필요한 것만 `grant`
- `authenticated`: `select` · `insert`(칸 단위, `hospital_id`·`updated_at`·`id` 제외) · `update`(칸 단위, 같은 제외) · `delete`(`message_templates`와, [기본값으로]용 `claim_rule_settings`의 내 병원 줄만. AC-012.6)
- 정책: `using (hospital_id = (select public.my_hospital_id()))`, `with check`도 같음. 승인 안 된 병원은 아무 줄도 못 본다
- `my_hospital_id()`·`touch_updated_at()`: `security definer`·`search_path = ''`, `public`·`anon`에서 회수하고 `authenticated`만 실행
- 시험: `supabase/precheck.rls.test.ts`(PGlite, `rls.test.ts`와 같은 흉내) — anon 거부, 남의 병원 줄 못 봄·못 씀, `hospital_id`를 직접 넣으면 거부, 건수 음수·글자 거부, 승인 안 된 병원 거부
- 운영자가 SQL 편집기에 붙여 넣는다(auth와 같은 방식). Phase 2·3 의원 PC 시험 전에 사용자 할 일로 안내한다

### 8-4. 백업 되돌려 넣기 SQL (`lib/backup/restoreSql.ts`, TASK-32)
- 운영자가 SQL 편집기(모든 권한)에서 돌린다. 그래서 값이 SQL로 도는 일이 없게 감싸는 방법을 한 가지로 정한다 **(Claude 판단)**
- 표·칸 이름은 `lib/backup/tables.ts`의 고정 목록에서만 가져온다(백업 파일의 키를 SQL에 넣지 않는다). 목록에 없는 표·칸이 있으면 SQL을 만들지 않고 던진다
- 값 감싸기: 글자·jsonb·uuid·시각은 모두 작은따옴표로 감싸고 안의 `'`만 `''`로 두 번 쓴다. `\`·`$$`·`;`·`--`·줄바꿈 등 다른 글자는 바꾸지 않는다. 파일 첫 줄에 `set standard_conforming_strings = on;`을 두어 `\`가 글자 그대로 읽히게 한다. `E'…'`·`$태그$` 따옴표는 쓰지 않는다. 뒤에 칸 종류를 붙인다(`'…'::jsonb`·`'…'::uuid`·`'…'::timestamptz`, jsonb는 `JSON.stringify` 결과를 감싼다). 정수는 `Number.isSafeInteger`를 통과한 것만 숫자로, 참·거짓은 `true`·`false`, 비어 있음은 `null`
- 글자에 NUL(`\u0000`)이 있으면 Postgres가 받지 못하므로 SQL을 만들지 않고 던진다
- 전체를 `begin; … commit;`으로 감싸고 표마다 `insert … on conflict (기본 키) do update`
- 시험(AC-032.2): `'`·`$$`·`;`·`\`·줄바꿈·`'); drop table public.hospitals; --`가 든 값을 되살려 글자 칸은 바이트까지, jsonb는 같은 값인지, 다른 표가 그대로인지 본다

## 9. 도우미 안

### 9-1. 처음 등록과 매번 확인 (TASK-5)
- 비트 찾기: 원본 `InstallationLocator.FindCandidates`·`NormalizeAndValidate`·`NativeEnvironmentGuard.Validate`(지원 위치는 원본처럼 `C:\DrBIT50`)
- 접속: 원본 `ReadOnlyConnection`처럼 비트 DLL(`BITDataBaseCommon`)의 접속 정보를 쓰고, `ConnectTimeout=10`, 서버 이름은 `CheckPrivateServer`(내 PC·사설 IP만). 읽기는 정해 둔 매개변수 SELECT만, 끝내지 않는 트랜잭션 안에서(원본 그대로)
- 처음 등록(`bit.register`): 비트 로그인 창(원본 `BITUserLogIn` `bitDisplayDialog`) → 그 사용자의 병원 범위(`ValidateScope`) → 기관기호(`VerifyInstitutionNumber`, 8자리) → **PC 확인 창** "이 병원으로 등록할까요? 기관기호 1234**** · 비트 병원 범위·설치 위치·DB" → [확인]이면 등록 파일(DPAPI)에 저장(기관기호·범위·설치 위치·서버·DB 이름·프로필 ID)
- 다시 등록: 이미 등록돼 있어도 같은 길로 다시 등록할 수 있다(설치 화면의 [다시 등록], `E-BIT-HOSPITAL-MISMATCH`일 때). 확인 창에 전 등록 값과 새 값을 함께 보인다. 기관기호가 같으면 프로필 ID를 그대로 두어 작업 저장을 이어 읽고, 다르면 새 ID라 전 병원의 작업 파일은 읽지 않는다(9-3, AC-005.5)
- 어느 의원인지 찾기(TASK-43, AC-005.13 — 원본과 다름, 사용자 2026-11-23 '다른 곳에서도 다 열려야 해 · 사람이 확인하면 열리게'): 비트 로그인은 그대로 하되(취소면 등록 없음) 계정의 범위·작업일로 고르지 않는다. 빈 값을 뺀 DB 안 범위가 하나면 그것(없음 `E-BIT-REG-NONE`, 둘 이상 `E-BIT-REG-MANY` — 다른 의원 자료가 섞이는 단 하나의 막음), 그 범위의 오늘 기관기호 줄 가운데 8자리 숫자만 보아 서로 다른 값이 하나면 그것(아니면 `E-BIT-REG-CODE` — 사이트 청구 화면·메모 문구가 기관기호를 꼭 쓴다), 저장 값 모양이 틀리면 `E-BIT-REG-PLACE`. 맞는지는 사람이 PC 확인 창에서 본다. 까닭: 다른 의원 PC에서 [처음 등록]이 `E-BIT-HOSPITAL-MISMATCH`('등록한 의원과 달라요 · [다시 등록]')로만 막혔고, DB에 의원이 하나면 계정의 범위는 그 의원 말고 될 수 없어 계정 확인이 더 지켜 주는 것이 없다
- 매번: 모든 읽기·입력 명령 전에 등록 파일과 비트 DB의 기관기호·범위·설치 위치·서버·DB 이름을 비교한다(원본 `VerifyCurrentInstitution`). 다르면 `E-BIT-HOSPITAL-MISMATCH`로 멈춘다. TASK-43부터 처음 등록과 같은 기준이다: DB 안 범위는 빈 값을 빼고 등록 범위 하나뿐, 오늘 기관기호는 8자리 숫자 줄만 보아 등록 번호 하나뿐. 통계 화면 확인(`StatsAccess`)은 계정 범위를 하나로 읽었는데 등록 범위와 다를 때만 막는다
- 기관기호는 서버에 올리지 않는다(2026-10-28 사용자: 요양기관번호는 받지 않는다). 화면에는 뒤 4자리를 가려 보인다 **(Claude 판단)**
- **병원 이름은 도우미가 갖지 않는다** (사용자 결정 2026-10-30 "사이트 이름 쓰기"): 원본 비트 읽기에는 병원 이름을 읽는 SQL이 없고, 양지바른은 자기 프로필 파일에서 가져왔다. 그래서 도우미는 병원 이름을 저장하지도 돌려주지도 않는다(`bit.check`에 `hospitalName` 없음). 확인 창은 비트에서 읽은 값(가린 기관기호·범위 등)만 보인다. 설치 화면은 앱이 이미 가진 로그인한 사용자의 병원 이름(`(app)/layout.tsx`가 앱 틀에 넘기는 `me.hospital.name`과 같은 값)을 가린 기관기호 옆에 보인다 (TASK-33·TASK-6)

### 9-2. 읽기 (TASK-8·16·20·23·27)
- 한 달 자료: `VendorGridExport`가 원본 `NativeReportAdapter`처럼 비트 통계 화면(83 증상·83D 상병·47 소모)을 숨겨서 열고 날짜를 넣어 표를 읽는다. 표 칸 이름은 비트 화면의 것을 그대로 쓰고, `GridRows`가 원본 `medicore/claim_import.py`·`mx999 build/parseRx`가 읽는 칸만 남긴다. 47 표는 처방코드·처방명칭·차트번호·처방일자·급여구분이 필수다(원본 `selectWorkbook`, AC-008.6, TASK-36). 지금 코드는 처방명칭·급여구분을 선택 칸으로 두어, 칸이 없으면 모든 처방이 급여로 읽힌다(`shape.ts` `benefit`). 도우미에서 멈추고 새 도우미와 함께 `MIN_HELPER`를 올리므로 `shape.ts`는 고치지 않는다
- 12개월 이력: `RxHistory.VisitSql`·`CodeSql` 그대로(원본 한도 `MaximumDays` 400일). 기간 시작 365일 전부터 기간 끝까지(원본 `loadHistory`). `claim.month` 기간을 35일 이하로 막아 이 범위가 늘 400일 안에 든다. 나눠 읽지 않는다
- 이미 있는 메모: `ClaimMemoHistory.RowsSql` 그대로(최대 300,000줄, 메모 4,000자)
- 날짜별 수(`claim.dates`): 원본 방문 조건(`OcmPatTyp='O'`, `OcmRsuYon<>'O'`, 범위)을 그대로 쓴 세기 SQL. 숫자만 돌려준다
- 시간 제한은 원본 값(메타 15초, 자료 120~150초). 넘으면 `E-BIT-READ-FAILED`
- **일부만 오면 멈춘다**: 표 하나라도 실패하면 그 명령 전체가 `error`다. 조각을 보내다 실패하면 `end` 대신 `error`를 보낸다

### 9-3. 작업 저장 (TASK-15)
- 위치: `%LOCALAPPDATA%\Seoseungkwan\PrecheckHelper\data\` (프로그램 폴더와 따로, 업데이트해도 남음)
- 파일: `registration.dat`(등록 병원) · `work-YYYY-MM.dat`(그 진료 달의 고친 메모·완료 표시·입력 기록·쓰다 멈춘 사람의 날짜를 알려 주는 `journalDates`(도우미만 쓰고 `store.load` 답에 없음, 옛 파일에는 없어도 됨, AC-035.4)·바꾼 사람의 원래 메모 목록 `originals`, 19-6) · `contact.dat`(연락 표시) · `settings.dat`(서버 설정 사본. 서버가 잠깐 안 될 때 '마지막으로 받은 설정'으로 쓴다, PRD 8) · `input-acks.dat`(직원이 확인한 '확인할 수 없는 기록'의 해시, 환자 자료 없음, AC-035.9)
- 암호화: DPAPI `CurrentUser` + 고정 entropy, 머리 `PRECHECK-STORE-1\n`. 쓰기는 임시 파일 → 바꿔치기(`File.Replace`, `.bak` 하나 둠)
- 깨진 파일: `E-STORE-BROKEN`. `.bak`이 있으면 그것으로, 없으면 "새로 시작" 안내(비트 비교가 두 번 입력을 막는다)
- `registration.dat`도 같은 규칙이다(TASK-33): 파일이 없을 때만 '등록 없음'(`E-BIT-NOT-REGISTERED`). 깨졌으면 깨진 파일은 이름을 바꿔 두고 `.bak`이 맞으면 그것으로 `registration.dat`를 되살려 쓴다. `.bak`도 없거나 깨졌으면 `E-STORE-BROKEN`이고, 설치 화면의 [처음 등록]으로 새로 시작한다(새 프로필 ID). 그때 저장 전에 깨진 `registration.dat`·`.bak`은 이름을 바꿔 둔다(지우지 않음)
- 13개월 지난 `work-*.dat`는 지운다 **(Claude 판단, 필요한 것만 남김)**
- 저장 파일의 병원이 등록 병원과 다르면 읽지 않는다

### 9-4. 자동 입력 (TASK-17, 연결은 TASK-35, 더한 것은 19절)
- 길: 원본 기간 입력 다리(`range_bridge`)다. 하루 입력도 이 길로 된다. **내원내역 날짜는 바꾸지 않는다**: 사람이 묶음 기간이 다 들어가게 띄워 두고, 도우미는 [확인] 뒤 `dtpFrom`·`dtpTo`를 읽어 검사한 뒤 차트번호로 찾아(`txtSch`+`btnSch`) 줄을 위에서부터 열어 `dtpWorkDate`가 내원일과 같을 때 받아들인다. 쓰기 앞뒤로 다시 확인한다
- 순서(묶음 하나):
  1. 묶음 검사(받은 그대로. 500명 이하, 날짜·차트번호 모양, 같은 진료·같은 차트번호+내원일 두 번 없음, 원본 `validate_request` 규칙) → 잠금 → 등록 병원 확인(9-1) + 내원 수 읽기(19-5) → 쓰다 멈춘 사람 검사(19-5) → 빼기(내원 수·확인 표시·공백뿐인 메모. 남는 사람도 풀 사람도 없으면 창 없이 끝남, AC-035.8) → 비트 화면 지문 확인(`UiFingerprint`)
  2. **PC 확인 창**: 도우미가 묶음에서 직접 만든 글 "10/27~10/29, 32명 입력할까요? · 기관기호 1234****"(등록한 기관기호, 뒤 4자리 가림. 병원 이름 없음, 9-1)와 빼는 환자 수, 바꾸는 환자 수, 처방코드(모양을 검사한 값, AC-036.1) + [확인]·[취소]. 5분 안에 답이 없으면 취소. 웹이 보낸 그 밖의 글은 보이지 않는다
  3. 사람마다(원본 `autoOne` + `UChartAutomation`): 내원내역에서 차트번호로 열기 → 이름·차트번호·날짜 검사 → **비트에 이미 메모가 있으면** 같으면 '완료(이미 입력됨)', 다르면 `replaces`가 없는 사람은 '건너뜀: 이미 있음', `replaces`가 있는 사람(2026-11-02부터 사이트가 기본으로 싣는다, 19-6)과 묻지 않기가 켜진 때는 바꾸기(`checkedByHand`로 온 사람은 건너뜀, 19-6) → 쓰기(`EM_REPLACESEL`, 안 되면 `ValuePattern`) → 다시 읽어 같은지 → 저장 단추 → 다시 읽어 같은지
  4. 사람마다 기록(`Journal`): 쓰기 전 `writing`(다른 메모를 바꾸는 사람은 그 앞에 원래 메모를 `originals` 목록에 먼저 덧붙여 저장, 19-6), 확인 뒤 `done`/`skipped`/`skippedByHand`(19-6)/`check`, 쓰기를 시작하고 저장을 확인하지 못하면 `writeUnconfirmed`. 진행은 숫자만 웹에 보낸다
- 멈춤: 비트 화면 지문이 다름(칸 ID가 없거나 정해지지 않음, `E-BIT-UI-CHANGED` + 칸 ID 목록) · 눌러도 남는 저장 안 한 처방 창(`E-BIT-UNSAVED-RX`, AC-017.12) · 원본 fatal 문구(창을 찾지 못·최소화·가려져 등, 더해서 키보드 초점을 잃음·비트가 환자 열기를 막음) · 3번 잇따라 실패(`E-INPUT-STOPPED`) · 진행 창의 [멈추기](지금 사람까지 하고 멈춤) · 내원내역 기간·처방코드 칸 문제 · 입력 기록을 남기거나 읽지 못함(`E-STORE-FAILED`) · 메모 칸을 읽지 못함 · 쓴 뒤 저장을 확인하지 못함
- 결과 세 가지: **완료**(입력·이미 입력됨·바꿈) · **확인 필요**(쓴 뒤 다시 읽은 값이 다름·저장 확인 못함·멈춰서 미처리·메모 칸이 입력을 받지 않음) · **건너뜀**(이유: 이미 있음·내원일 없음·환자 불일치·검색 결과 여러 줄·직접 입력·확인 표시 등 원본 문구)
- **쓰기를 시작하고 저장을 확인하지 못하면 묶음을 멈춘다**: 우리 글이 저장 안 된 채 칸에 남았을 수 있다. 여기서 목록을 눌러 넘어가면 비트가 그 글을 다른 환자에게 저장할 수 있다
- **이어서 하기**: 마지막 기록이 `writing`·`writeUnconfirmed`인 사람은 묶음 맨 앞에서 한다. 칸이 우리 글과 같아도 저장을 눌러 다시 읽어야 완료이고, 비었으면 입력, 다르면 멈춘다(건너뛰지 않는다). 그 밖의 사람은 비트 메모와 비교한다: 같으면 완료, 비었으면 입력, 다르면 `replaces`가 없는 사람은 건너뜀(이미 있음), `replaces`가 있는 사람은 AC-037.1, 묻지 않기가 켜져 있으면 AC-037.6(19-6)
- 지문: `BITDoctorOrder.exe` 프로세스(원본 `NativeTarget` 규칙), '외래진료실' 창 하나와 칸 `txtChtNum`·`lbPatName`·`txtBilCmt`·`btnBilCmtModify`·`dtpWorkDate`, '내원내역' 창 하나와 칸 `cbSch`·`txtSch`·`btnSch`·`ctgMain`. 칸마다 원본 Pick 규칙으로 하나를 정한다(하나뿐이면 그것, 여럿이면 보이는 것이 정확히 하나일 때 그것)
- 웹 창이 닫혀도 확장은 입력이 끝날 때까지(최대 30분) 도우미 연결을 둔다. 결과는 작업 저장에 남아 다시 열면 보인다. 그동안 새 웹 연결은 `E-BRIDGE-BUSY`(AC-003.9)
- **입력 중 표준 입력이 닫힘**(확장이 30분 뒤 닫음·크롬 종료 등): 도우미는 표준 입력을 따로 읽는 스레드(`Program.cs`)에서 닫힘을 알아채고 [멈추기]처럼 다룬다. 지금 사람은 쓰기 전이면 시작하지 않고, 쓰기를 시작했으면 쓰기 → 다시 읽기 → 저장 → 다시 읽기까지 마친다. 남은 사람은 '확인 필요: 미처리'로 입력 기록·결과를 작업 저장에 남기고 끝난다. 확인 창이 떠 있었으면 [취소]와 같다(AC-017.9)
- **한 번에 하나**: 이름 있는 뮤텍스 `Local\SeoseungkwanPrecheckHelper.Work`를 잡은 동안에만 `bit.input`(확인 창부터 결과 기록까지)·`store.save`를 한다. 다른 도우미 프로세스가 잡고 있으면 `bit.input`은 바로, `store.save`는 5초 기다린 뒤 `E-BRIDGE-BUSY`. 잡은 채 끝난 프로세스의 뮤텍스(abandoned)는 잡은 것으로 보고 이어서 하기를 따른다(AC-017.10)

### 9-5. SAM (TASK-20)
- 원본 `latest_sam_files` 그대로: `C:\HIRA\DDMD\sam\in\backup\<청구월>\<전송폴더>\<청구번호>.GHP|.CAR`, 머리 80바이트 `(\d{10})([HC]\d{3})(\d{8})`. 종류마다 수정 시각이 가장 늦은 파일, 32MB 이하
- 원본과 다른 점: 기관기호가 없으면 거르지 않던 것을 **늘 등록 기관기호로 거른다**. 다른 기관 파일은 읽지 않는다

## 10. 골든 테스트

- **뜻**: 같은 가짜 자료를 넣으면 원본과 우리 코드의 결과가 같다
- **원본 결과 만들기** (`scripts/precheck/golden/`, 한 번 만들어 커밋):
  - 원본은 저장소 밖에 둔다: `git clone`한 `seoseungkwan/shared`를 `2a1069b`로 맞추고 경로를 `YANGJI_SRC`로 준다. 원본 파일은 커밋하지 않는다
  - JS 원본(`mx999_v22.html`의 스크립트 묶음, `revisit_schedule.html`, `revisit_source_boot.js`, `message_templates.html`)은 원본 시험(`tests/test_claim_html.py`의 스크립트 꺼내기)과 같은 방식으로 `node:vm`에서 돌린다. 전역 값(`VISITS`·`RXDATA`·`CODEMAP`·`DRUGINFO`·`HIST`)은 가짜 자료로 채운다
  - Python 원본(`revisit_source_parts.py`·`rx_visit_split.py`·`reports.py`)은 `python3 -I`로 돌린다
  - C# 원본만 있는 계산(`TrendMath`·`Cohort`)은 원본 시험(`TrendTests.cs`·`CohortTests.cs`)의 사례와 기대값을 그대로 옮긴다
  - 결과 파일 `fixtures/precheck/golden/<이름>.json` 머리에 `{ source: "seoseungkwan/shared@2a1069b", file, entry }`를 적는다
- **가짜 자료** `fixtures/precheck/fake/`: 생성기 `fixtures/precheck/make-fake-claims.ts`(씨앗 고정, 같은 결과). 이름은 "가상환자NN", 차트번호는 `9`로 시작하는 6자리, 전화는 `010-0000-NNNN`. 원본 시험의 가짜 사례(`test_claim_precheck.py`의 v1~v18 등)를 옮기고, 규칙 종류 18가지마다 걸리는 사례·안 걸리는 사례를 더한다
- **사전 찾기**: 처방 목록이 있으면 원본 병원 모드의 `cm`(`importedRow`·`namedDrugRoles`, 기본 약 이름 목록)을 그대로 돌려 골든을 만든다. 병원별 `TPL.drugNames`는 아직 없으므로 기본 목록만 쓴다(AC-010.7)
- **비교**: 우리 함수 결과를 골든과 깊은 비교(순서까지). 일부러 다르게 한 것은 골든 파일의 `knownDiffs`에 이유와 함께 적는다(예: 약 규칙, 19-4). 적지 않은 차이는 실패다
- **규칙 덮기**: 262개 규칙마다 골든에서 한 번 이상 걸리거나, 걸리게 할 수 없는 이유(예: `info_only`, 원본이 `manual`로 둠)를 `fixtures/precheck/golden/rules-coverage.json`에 적는다. 둘 다 없으면 시험이 실패한다
- **SQL**: 도우미 `Sql.cs`의 원본 SQL 상수는 원본과 공백만 다르다(시험: 원본 SQL을 옮겨 둔 `helper/tests/Precheck.Core.Tests/Bit/original-sql/*.sql`과 비교)
- **의원 PC 시험**: 골든이 못 덮는 것(실제 비트 자료·화면)은 Phase마다 양지바른 결과와 나란히 비교한다(`docs/precheck/plan.md` §6)

## 11. 시험 방법
- 웹: Vitest(node·jsdom). 환자 구역·화면 줄 울타리는 `src/guardrails.test.ts`. DB는 PGlite
- 확장: Vitest로 `relay.ts`·`background.ts`(가짜 `chrome`)
- 도우미 Core: xUnit(`*.test.cs`), 이 서버에서 `dotnet test -f net10.0`. 하네스 TDD 기록은 감싸개 `helper/tests/<이름>.dotnet.test.ts`가 `runDotnet('<시험 클래스>')`로 부른다. 감싸개 시험 이름에도 AC ID를 넣는다
- 도우미 Windows: xUnit net48, Actions 윈도우에서만. 실제 비트가 필요한 것은 가짜 창·가짜 DB로 할 수 있는 만큼 하고 나머지는 의원 PC 시험
- `dotnet`이 없으면 감싸개는 `E-NO-DOTNET`으로 실패한다. RED를 기록하기 전에 `dotnet --version`을 먼저 확인한다(실행 못 함을 RED로 남기지 않으려고)
- 감싸개는 한 번에 하나만 돈다(`runDotnet.ts`의 잠금 폴더). vitest가 파일을 나란히 돌려도 `dotnet build`가 부딪히지 않는다

## 12. GitHub Actions 윈도우 빌드 (`.github/workflows/helper.yml`)
- 언제: `helper/**`·`extension/**`·`src/lib/bridge/commands.json`·이 파일이 바뀐 push, 손으로 실행(`workflow_dispatch`), 태그 `helper-v*`
- 권한: 기본 `contents: read`. 태그 때 릴리스 일만 `contents: write`. 비밀값을 쓰지 않는다
- `helper` 일(windows-latest): checkout → setup-dotnet(10.x, net48 참조 어셈블리 포함) → `dotnet test helper/Precheck.sln`(Core net48·net10.0 + Windows) → `dotnet build -c Release` → `precheck-helper-<버전>.zip`(exe·DLL·`install/*`) → artifact
- 도우미 exe(`Precheck.Helper.csproj`)는 `Precheck.Windows`를 참조하고 `<PlatformTarget>x86</PlatformTarget>`(32비트)로 빌드한다. 비트 DLL이 32비트다(원본 `tools/build_stats.ps1` `/platform:x86`). AnyCPU net48 exe는 64비트 윈도우에서 64비트로 돌아 그 DLL을 불러오지 못한다. `Platform`이 아니라 `PlatformTarget`을 써서 출력은 `bin/Release/net48` 그대로다(위 zip 단계가 읽는 자리) (TASK-33)
- `extension` 일(ubuntu-latest): `npm ci` → `npm run ext:build` → `precheck-extension-<버전>.zip` → artifact
- `release` 일(태그 때만): 두 zip으로 GitHub 릴리스를 만든다. 업데이트 안내 링크가 이 릴리스 쪽을 가리킨다
- action은 버전을 고정한다(`actions/checkout@v4` 등). 서명하지 않는다 → 처음 실행 때 SmartScreen 경고가 뜬다(설치 안내에 "추가 정보 → 실행" 그림)
- 설치: zip을 풀고 `install.cmd`(→ `powershell -ExecutionPolicy Bypass -File install.ps1`)를 누른다. 관리자 권한이 필요 없다(`HKCU`). 돌던 도우미를 먼저 끝내고 덮어쓴다
- **Phase 끝 흐름 (사용자 규칙)**: Phase가 끝나면 Phase PR을 만든다. 합치기(merge)·운영 배포·도우미 릴리스 태그(`helper-v*`)는 사용자가 그때마다 지시할 때만 한다. Claude가 자동으로 하지 않는다. 의원 PC 시험은 그 뒤에 한다
  - 까닭: 확장 `externally_connectable`과 `commands.json` `origin`에는 운영 주소 하나만 있다(AC-003.1). 새 화면은 운영 사이트에 배포돼야 의원 PC에서 확장과 말할 수 있고, 새 도우미 zip은 `helper-v*` 태그의 릴리스로 받는다. 개발용 두 번째 주소는 넣지 않는다

## 13. 운영 (Claude 제안, 사용자가 운영·비용을 아직 안 봄)
- **버전 맞추기**: 청구 화면을 열 때마다 `hello`로 웹·확장·도우미 `protocol`과 버전을 맞춘다. 맞지 않으면 그 자리에서 막고 무엇을 업데이트할지 보인다
- **업데이트 안내**: 확장은 웹스토어가 알아서 바꾼다. 도우미는 `LATEST_HELPER`보다 낮으면 설치·연결 화면과 청구 화면 위에 "새 도우미가 있어요" 한 줄과 릴리스 링크를 보인다. `MIN_HELPER`보다 낮으면 막는다. 도우미를 바꿀 때는 웹 `versions.ts`도 같이 올린다(같은 커밋)
- **비트가 바뀌면**:
  - 화면이 바뀜 → 입력 전 지문 확인에서 멈추고 어떤 칸이 없는지 보인다(`E-BIT-UI-CHANGED`). 입력 중이면 그 사람에서 멈춘다
  - DB가 바뀜(칸 이름 등) → 읽기가 `E-BIT-READ-FAILED`로 멈춘다. 반쪽 자료로 점검하지 않는다
  - 통계 화면 DLL이 바뀜 → `E-BIT-EXPORT-FAILED`
  - 사용자가 오류 번호를 알려 주면 Claude가 도우미를 고쳐 PR을 만든다. 합치기·릴리스 태그는 사용자가 지시할 때 한다(12절). 그동안 비트 입력은 손으로 한다
- **비용**: 구글 개발자 등록 5달러(한 번). GitHub Actions 윈도우 시간은 저장소 무료 한도 안에서 쓴다(빌드 한 번 몇 분)
- **계정**: GitHub·Vercel·크롬 웹스토어 계정 2단계 로그인(사용자)

## 14. 새 패키지·도구
| 무엇 | 어디 | 왜 | TASK |
|---|---|---|---|
| `@types/chrome`(dev, 정확한 버전 고정) | package.json | 확장·통로 코드의 `chrome.runtime` 타입 | TASK-3 |
| .NET 10 SDK | 이 서버 `~/.dotnet`(dotnet-install.sh, 관리자 권한 없음), Actions | 도우미 빌드·시험 | TASK-1 |
| `Microsoft.NETFramework.ReferenceAssemblies`(빌드용) | helper | 리눅스·Actions에서 net48 빌드 | TASK-1 |
| `System.Text.Json` | helper (net48·netstandard2.0) | 메시지 JSON | TASK-1 |
| `xunit`·`xunit.runner.visualstudio`·`Microsoft.NET.Test.Sdk` | helper/tests | 도우미 시험 | TASK-1 |
| `FlaUI.Core`·`FlaUI.UIA3` 4.0.0 | helper Windows | 비트 화면 자동 입력(원본과 같은 판) | TASK-17 |
- NuGet 판은 모두 정확한 버전으로 고정한다. 비트 DLL(`BITDataBaseCommon` 등)은 함께 싣지 않고, 의원 PC의 비트 설치 폴더(`C:\DrBIT50\EXE`)에서 불러온다
- 웹 쪽 새 패키지는 `@types/chrome` 하나다. 엑셀은 이미 있는 `xlsx`를 Worker에서 쓴다

## 15. 결정과 트레이드오프 (Claude 판단)
- **도우미 런타임 .NET Framework 4.8**: 비트 DLL을 원본처럼 불러 쓰고, PC에 런타임을 깔지 않아도 된다. 대신 플랫폼과 상관없는 부분을 netstandard2.0으로 떼어야 리눅스에서 시험할 수 있다 (ADR-016)
- **묶음 고리를 도우미로 옮김**: 원본은 웹(JS `autoOne`)이 한 사람씩 다리를 불렀다. 우리는 묶음마다 PC 확인 창을 띄워야 하므로 도우미가 묶음을 받아 끝까지 돈다
- **다른 메모는 원래 메모를 남기고 바꿈 (2026-11-02 사용자 결정)**: 비트에 다른 메모가 있으면 사람마다 묻지 않고 바꾼다. 쓰기 바로 앞에 칸 글이 불러온 글과 같은지 보고 원래 메모를 그 PC 기록에 먼저 남긴다. [바꾸지 않기]를 누른 사람과 직접 확인 기록이 남은 사람은 바꾸지 않는다(19-6). 처음 정한 '덮어쓰기 없음'(PRD 7)은 2026-11-01·2026-11-02 사용자 결정으로 바뀌었다(19-6)
- **창 하나**: 확장이 웹 연결을 하나만 받는다. 두 번째 창은 `E-BRIDGE-BUSY`
- **환자 자료 답은 늘 조각으로**: 통로 코드가 환자 자료를 풀 일이 아예 없게 한다
- **규칙표 등은 Worker의 `import()`**: 청구 화면을 열 때만 받고, 구역 안 `fetch` 금지를 지킨다
- **설정 표 모양**: 규칙은 줄마다(등급을 DB 제약으로), 병원 문구·상병 연결표는 원본 설정 모양 그대로 jsonb 하나(원본 `validate`로 검사 + 크기 제한), 문자 문구는 줄마다
- **상병 연결표**: 원본 추천 상병의 직원 연결표(`snapshot.rules`)를 병원 설정에 함께 둔다. 사용자가 말한 설정 셋(규칙·병원 문구·문자 문구)에 붙여 둔 것이다
- **원본 필터 단추 편집(`claim_code_chips`)은 옮기지 않는다**. 필터는 목업에 있는 것만
- **설정 바뀜**: 초점이 돌아올 때·다른 탭에 갔다가 돌아와 결과를 되살릴 때·입력 직전에 다시 읽어 비교. 실시간 구독은 쓰지 않는다
- **설정 사본**: 브라우저 저장소를 쓰지 않으므로 마지막으로 받은 설정은 도우미 저장(`settings.dat`)에 둔다. 사본이 없으면 점검하지 않는다
- **건수 올리기 실패**: 값을 메모리에 두고 다음에 바뀔 때·창에 초점이 올 때 다시 올린다. 화면에 "마지막으로 올린 시각"
- **날짜 목록 기간**: 도우미에서 최근 60일 + 서버 건수에 남은 일이 있는 더 옛날
- **입력 묶음 한도**: 500명. 확인 창은 5분 뒤 취소
- **한 번에 불러오는 기간 35일**: 12개월 이력(시작 365일 전부터)까지 원본 이력 SQL 한도 400일 안에 들게. 달을 넘기는 묶음(예: 10/30~11/2)은 그대로 된다
- **화면은 Worker만 넘김**: 조각과 보낼 글자가 울타리 밖 화면 코드를 지나지 않게 `workerSink`의 전용 포트로만 다닌다
- **작업 파일 보관**: 13개월
- **기관기호 표시**: 화면에는 뒤 4자리 가림
- **통계 금액·소모량**: 도우미 자료에만 있다. 파일 올리기(예비)로는 건수만 그린다
- **엑셀**: Worker에서 기존 `xlsx`로 만든다. 그 PC에 파일로 남는다(원본도 같음)
- **이름은 화면에 그대로**: 청구·연락 화면의 이름·전화는 가리지 않는다. 비트 화면과 같은 PC이고, 연락은 전화가 있어야 한다

## 16. 위험
- **비트 통계 화면 DLL 불러 쓰기**: 원본 방식이 비트 업데이트에 약하다. Phase 1 `bit-connect`에서 의원 PC로 먼저 확인한다
- **비트 접속 DLL을 리플렉션으로 만들기**: 원본은 `BITDataBaseCommon`을 물려받아 썼고, 도우미는 비트 DLL 없이 빌드하려고 실행할 때 리플렉션으로 만든다. 그 클래스가 추상(abstract)이면 만들 수 없어 `bit.check` DB 읽기 단계가 `E-BIT-DB-FAILED`가 된다. Phase 1 의원 PC 연결 확인에서 이 번호가 나오면 이 경우인지 먼저 본다(TASK-33 의원 PC 시험 목록)
- **FlaUI net48**: FlaUI 4.0.0을 net48로 쓰는 빌드를 Phase 1 첫 Actions 빌드에서 확인한다. 안 되면 사용자에게 알린다(런타임을 바꾸는 큰 결정)
- **자동 입력**: 가장 큰 작업이다. Phase 3 전에 시험용 환자 한 명으로 짧게 해 본다(plan.md §7)
- **웹스토어 심사**: 며칠 걸린다. Phase 1 시작 때 사용자가 신청한다. 그 전에는 '압축 풀린 확장 불러오기'로 시험한다(manifest `key`로 같은 ID)
- **리눅스에서 못 돌리는 코드**: Windows 부분은 Actions와 의원 PC 시험에 기댄다. Phase마다 의원 PC 시험 목록을 드린다
- **골든 범위**: 원본이 화면 전역 값에 기대 있어, `vm`으로 꺼내 돌리는 데 손이 간다. 꺼내지 못한 함수가 생기면 그 함수의 원본 시험 사례로 대신하고 `knownDiffs`에 적는다
- **통계 화면 순서**: 통계 탭의 기본 화면(통계 명세)이 Phase 6 전에 없으면, 통계 탭은 이 기능의 추가분과 자료 고르기만 먼저 보인다(사용자 확인 필요, 17절)
- **정기 주사 36개월 읽기**: 원본은 36개월 기록을 쓴다. 비트 통계 화면으로 36개월을 읽으면 오래 걸릴 수 있다. Phase 5 Step 0에서 시간을 재고, 너무 길면 달마다 나눠 읽는다(조각마다 실패하면 전체를 멈추는 규칙은 같다)
- **30분 자동 로그아웃**: 청구 작업 중 로그아웃되면 메모리 자료가 사라진다. 고친 메모는 도우미에 있어 다시 불러오면 이어진다(PRD 8)
- **입력 중 도우미가 끝남**: 크롬이 연결을 닫은 뒤 도우미 프로세스를 강제로 끝낼 수도 있다(윈도우). 그래도 쓰기 전 `writing` 기록과 이어서 하기(비트 메모와 비교, AC-017.7)가 두 번 입력·덮어쓰기를 막는다. Phase 3 의원 PC 시험에서 입력 중 크롬을 닫아 도우미가 지금 사람까지 마치고 끝나는지 본다
- **b2b 합치기 중 사후 점검**: 합치기 커밋 전에는 main이 가져온 파일이 모두 '바뀐 파일'로 보여, 하네스 사후 점검(`verify`·Stop의 승인 범위 검사)이 범위 밖 변경이라 한다. 그래서 TASK-34는 합치기 → 시험 먼저 → RED → 충돌 풀기 → GREEN(`tdd-run`) → 합치기 커밋 → `verify` 순서로 한 번에 끝낸다(18-4)

## 17. 사용자에게 물은 것 (답 받음)
1. **통계 탭 순서**: Phase 6(통계 추가분)을 할 때 통계 기본 화면이 아직 없으면, 통계 탭을 추가분만으로 먼저 열어도 되나요? 아니면 통계 화면 명세를 먼저 할까요? (Claude 기본: 추가분만 먼저) → **Claude 판단으로 추가분만 먼저 연다**
2. **화면의 환자 이름·전화**: 청구·연락 화면에 이름·전화번호를 그대로 보여도 되나요? (그 PC 화면에만 보이고 서버에는 안 갑니다. Claude 기본: 그대로) → **사용자 결정(2026-10-30): 그대로 보인다**. 화면 목업도 같은 날 승인

## 18. b2b 개편 합치기 맞춤 (TASK-34, REQ-034)
- **왜**: 앱 전체 B2B 디자인 개편(`specs/b2b-redesign`)이 이 기능(PR #7)보다 먼저 main에 들어갔다(합치기 커밋 `359a4a4`, PR #11). 개편은 토큰(`globals.css` `:root` 한 곳)·글꼴(Pretendard, 400·500·600)·공통 모양(`components/ui/classes.ts`의 `ds`)·앱 틀을 바꾸고, 옛 이름(`ui` 대부분, 옛 Tailwind 별칭, 700 굵기)을 지워 가드 시험으로 막는다. 그래서 이 브랜치에 `origin/main`을 합치고 청구 쪽을 맞춘다 **(Claude 판단)**. 기능·동작·자료 길·문구·배치(목업 승인본)는 바뀌지 않는다. 바뀌는 것은 클래스·ADR 번호·설정 파일 합치기뿐이다
- **합칠 것**: `origin/main`(합칠 때의 끝. b2b 개편 `359a4a4`와 auth-live PR #9·landing-v2 PR #10이 들어 있다). 합친 뒤 main에 더 들어오는 것은 이 TASK 밖이다
- **때**: Phase 1 끝·Phase 2(TASK-7) 앞. 뒤의 화면 TASK(12·13·18·19·22·25·26·31·32)는 처음부터 `ds`와 b2b 토큰만 쓴다

### 18-1. 충돌 풀기
`git merge-tree --write-tree origin/main feat-precheck`(2026-10-31, main `359a4a4`)로 미리 본 충돌은 다섯 파일이다.

| 파일 | 푸는 법 |
|---|---|
| `vitest.config.ts` | TDD 예외 파일(하네스 `*.config.*`)이라 RED 없이 맨 먼저 푼다(충돌 표시가 남으면 시험이 설정을 못 읽어 하나도 돌지 않는다). `include`는 두 쪽 합(AC-034.5), 위 주석도 두 쪽 것을 합친다(e2e `*.spec.ts`는 잡지 않는다는 줄 포함) |
| `package.json` | TDD 예외 파일. scripts에 main 쪽 `e2e`·`e2e:env`와 청구 `ext:build`를 둘 다 둔다. 나머지는 자동 합침 그대로. 그 뒤 `npm install`로 `package-lock.json`을 맞추고(새 패키지 없음) `npm ci`가 되는지 본다 |
| `src/components/shell/TabBar.tsx` | RED 뒤에 푼다. main 쪽(b2b) 파일을 바탕으로 청구 판단만 얹는다: `menu.ts`의 `currentMenuLabel`·`isUnder`, `TabLink`는 `current`를 받는다, `NotReadyTab`은 `current`이면 `tabCurrent` + `aria-current="page"`(단추·`aria-disabled`·툴팁 그대로). b2b의 파일 안 `isCurrent`는 지운다. 주석에 "teal"을 쓰지 않는다 |
| `CLAUDE.md` | 문서. 기술 줄은 b2b 스타일링 줄 + 청구 줄(ADR-016). CRITICAL 두 줄의 청구 ADR 인용은 새 번호(ADR-021·ADR-020) |
| `docs/ADR.md` | 문서. 번호 순서: …015 · 016(청구) · 017~019(b2b 쪽) · 020~022(청구, 옛 017~019). ADR-015의 '상태' 줄은 main 쪽 것을 쓴다 |

- 자동으로 합쳐지는 `shell.test.tsx`·`docs/ARCHITECTURE.md`·`plan.md`·`.gitignore`·`package-lock.json`도 열어 본다. `.harness/active`는 main 값이 들어오지만 활성 기능은 브랜치 이름(`feat-precheck`)이 정하므로 그대로 둔다

### 18-2. ADR 번호
- 옛 → 새: ADR-017 → **ADR-020**(통로 코드도 환자 자료 구역) · ADR-018 → **ADR-021**(서버 자료는 건수·설정 표뿐) · ADR-019 → **ADR-022**(plan.md §10 다시 꺼냄). ADR-016은 그대로
- 고치는 곳:
  - `docs/ADR.md`: 제목과 본문 안 인용, 그리고 청구가 더한 두 줄 — 맨 위 안내 "(ADR-016~019는 2026-10-30 청구 사전점검)" → "(ADR-016·020~022는 …)", '철학'의 §10 줄 "(ADR-019)" → "(ADR-022)"
  - `CLAUDE.md`·`docs/ARCHITECTURE.md`·`plan.md`: 청구 줄만
  - `eslint.config.mjs`·`src/lib/bridge/extensionId.ts`·`src/lib/csp.test.ts`: 주석
  - `phases/precheck-*/*.md`, 이 명세(이미 고침)
  - 범위 글도 고친다: `ADR-016~019` → `ADR-016·020~022`, `ADR-016~018` → `ADR-016·020·021`, `ADR-017·018` → `ADR-020·021`
- b2b 쪽 인용(ADR-017 E2E · ADR-018 랜딩·로고 · ADR-019 토큰·글꼴, ADR-015 '상태' 줄 포함)은 그대로 둔다

### 18-3. 화면 모양 옮기기 (클래스만)
- **탭 줄**: b2b AC-218.2 클래스 그대로. 지금 탭 판단만 청구 것(18-1). 지금 화면이 속한 준비 중 탭(`/claim/setup`의 [설정])은 지금 탭 모양(ink 600 + 2px accent 밑줄)이고 faint가 아니다
- **설정 안 메뉴**(`SetupScreen.tsx`의 `SettingsSubnav`): 관리자 화면 안 탭(`AdminApplications.tsx`)의 클래스를 쓴다. 기본 `relative inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control px-3 text-body first:-ml-3` + 초점 고리(`focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent`) + `max-md:h-11`, 기본 `font-medium text-ink-2 hover:text-ink`, 지금 `font-semibold text-ink after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-accent`. 관리자 쪽의 `cursor-pointer`는 그 탭이 `<button>`이라 있는 것이다. 설정 안 메뉴의 [비트 연결]·[청구·연락] 링크는 `<a>`라 손 모양이 기본이어서 넣지 않고(앱 탭 줄 링크와 같다), 준비 중 [청구·연락](`<span>`)은 누를 수 없어 넣지 않는다. 페이지 이동 링크라 `tablist`가 아니고 `aria-current`를 쓴다. 준비 중 [청구·연락]은 기본 모양(올림 없음) + `ds.chip.neutral` "준비 중"(TASK-12 전 모양. TASK-12가 이 갈래를 없앤다)
- **`ui` → `ds`** (한 표, AC-034.3):

| 옛 | 새 |
|---|---|
| `ui.button.primary`·`primarySmall`·`secondary`·`secondarySmall` | `ds.button.`의 같은 이름 |
| `ui.textButton` · `ui.help` · `ui.count` | `ds.textButton` · `ds.help` · `ds.count` |
| `ui.chip.done`(완료·준비됨) | `ds.chip.positive` |
| `ui.chip.progress`(확인 중) | `ds.chip.accent` |
| `ui.chip.waiting`(대기·준비 중) | `ds.chip.neutral` |
| `ui.chip.rejected`(실패·업데이트 필요) | `ds.chip.negative` |
| `ui.panel` + `ui.panelHead` + `ui.panelTitle` | `ds.panel` + `ds.panelHead` + `ds.panelTitle`, 몸은 `ds.panelBody`(옛 panel의 안쪽 여백·세로 사이를 머리·몸이 맡는다) |
| `ui.card`(안내 상자) | `ds.panel` + 안쪽 `p-6`(768px 미만 `p-4`) |

- **옛 Tailwind 이름**: `rounded-card`·`rounded-chip` → `rounded-control` · `text-table` → `text-small` · `text-tab` → `text-body` · `text-panel` → `text-subtitle` · `text-title-sm` → `text-title`(b2b에서 같은 크기) · `text-danger`·`bg-danger-soft`·`border-danger` → `text-negative`·`bg-negative-soft`·`border-negative` · `font-bold` → `font-semibold`
- `docs/UI_GUIDE.md`(main 판)에 청구 몫만 더한다: 앱 틀 탭 순서에 [청구](통계 뒤, tab-frame AC-302.1), 탭 상태 표에 "지금 화면이 속한 준비 중 탭 = 지금 모양", 칩 표 '쓰는 곳'에 설치·연결 확인 단계 칩, 패널 묶음 줄에 "청구 설치 화면이 쓴다"
- 청구 화면 폴더는 b2b 모양 규칙 시험(AC-204.6 간격·모서리 검사 목록, AC-204.7 상자 안 상자)에 넣지 않는다. 청구 화면은 나중에 다시 디자인한다(사용자 2026-10-31). 그때 넣는다. 그래서 `classes.test.ts`는 고치지 않는다

### 18-4. 시험과 순서
- **`src/b2b-merge.test.ts`**(새, 청구 몫. 파일을 글자로 읽는다):
  - AC-034.3: `src/components/claim/**`(시험 밖 `.ts`·`.tsx`)에서 `ui.` 참조·`ui` 불러오기가 없고 classes에서 `ds`만 불러온다. 옛 Tailwind 이름(b2b `theme.test.ts`의 옛 이름 정규식과 같은 목록)·400·500·600 밖 굵기 클래스가 없다. 빈 검사가 아니다(네 파일이 목록에 있다)
  - AC-034.4: `docs/ADR.md` 제목 번호가 한 번씩·오름차순이고 016·017~019·020~022의 제목 짝이 맞다. 맨 위 안내 줄과 '철학' §10 줄(18-2). 청구만 쓰는 파일과 섞인 문서 검사(범위 글 펼침)
  - AC-034.5: `package.json` scripts 세 개, `vitest.config.ts` `include` 집합과 `e2e/**/*.spec.ts` 안 잡힘, `CLAUDE.md` 두 줄
- **`SetupScreen.test.tsx`**: AC-034.2 시험을 더한다. **`shell.test.tsx`**: 청구 AC-006.4 `it`의 모양 기대값을 `text-accent font-bold` → `text-ink font-semibold after:bg-accent`로(지금 준비 중 탭에 `text-faint`·`text-ink-2`·`font-medium` 없음), 이름에 AC-034.1을 더한다. **`src/lib/csp.test.ts`**: 주석의 ADR 번호만
- **고치지 않는 시험**(TASK-34 금지사항, 리뷰가 `git diff HEAD^2 -- <파일>`로 본다): main 쪽 b2b 가드 시험과 `shell.test.tsx`에서 main 쪽이 고치거나 더한 `it`. 자세한 것은 tasks.md TASK-34
- **b2b 가드 시험은 TASK-34의 Tests에 넣지 않는다**(Tests에 넣으면 승인 범위에 들어가 고칠 수 있게 된다): `src/app/theme.test.ts`·`src/components/ui/classes.test.ts`·`src/app/fonts.test.ts`·`src/comments.test.ts`·`e2e/config.test.ts`는 `npx vitest run <파일>`로 실패·통과를 보고, 끝에 `verify`의 `npm test` 전체가 돌린다
- **순서**(한 번에 끝낸다, 16절 위험):
  1. `git merge origin/main` → 충돌 다섯 파일
  2. 시험 먼저: `src/b2b-merge.test.ts`를 만들고, `SetupScreen.test.tsx`에 AC-034.2 시험을, `shell.test.tsx`의 AC-006.4 기대값·이름을 고친다(시험 파일은 RED 없이 고칠 수 있다)
  3. TDD 예외 파일 `vitest.config.ts`·`package.json`(+ `npm install`)을 푼다. 문서 `CLAUDE.md`·`docs/ADR.md`의 충돌도 이때 풀어도 된다(ADR 번호 바꾸기는 5단계)
  4. **RED**: `tdd-run TASK-34 --expect red`. 설정이 읽혀 시험이 실제로 돌아야 한다(설정을 못 읽어 0개가 돈 실행은 RED가 아니다). 뜻 있는 RED는 `b2b-merge.test.ts`다: AC-034.3(청구 폴더에 옛 `ui`·옛 이름·`font-bold`가 남음)과 AC-034.4(ADR 번호를 아직 안 바꿈)가 기대값에서 실패한다. `SetupScreen.test.tsx`는 이때 옛 `ui.chip`이 없어 그리기부터 깨진다. 이것은 RED 근거로 치지 않고 같은 실행의 참고일 뿐이다(옛 `ui`를 되살리려면 TASK-34 범위 밖인 `classes.ts`를 고쳐야 해서 그 길은 쓰지 않는다). AC-034.2가 기대값에서 실패하는 것은 5단계에서 본다. `shell.test.tsx`도 이때 `TabBar.tsx`의 충돌 표시로 깨지므로 RED 뒤 `TabBar.tsx`를 main 쪽 파일로 먼저 두고 다시 돌려 AC-006.4·AC-034.1이 기대값(`/claim/setup`에서 [설정]이 지금 탭이 아님)에서 실패하는 것을 본 뒤 청구 판단을 얹는다. b2b 가드 시험(theme·classes·fonts)도 `npx vitest run`으로 제 이유로 실패하는 것을 본다
  5. 구현: `TabBar.tsx`, 청구 설치 화면 네 파일(18-3 표), ADR 번호(18-2), `UI_GUIDE.md`. `SetupScreen.tsx`는 `ui` → `ds`를 먼저 바꾸되 설정 안 메뉴 클래스는 옛 것(`font-bold text-accent`·3px 밑줄)으로 남긴 채 `SetupScreen.test.tsx`를 돌려 AC-034.2가 기대값에서 실패하는 것을 본 뒤 설정 안 메뉴를 바꾼다
  6. **GREEN**: `tdd-run TASK-34 --expect green`, b2b 가드 시험 `npx vitest run`
  7. **합치기 커밋**(conventional commits, `chore(precheck): b2b 개편 합치기 맞춤`)
  8. **`verify`**(`npm test` 전체·lint 경고 0·build). 커밋 뒤라 main이 가져온 파일이 바뀐 파일로 보이지 않는다. 실패하면 고침 커밋을 더한다(합치기 커밋을 고쳐 쓰지 않는다). `verify` 통과가 TASK-34의 끝 조건이다(AC 시험이 아니다)

## 19. 2026-11-01 명세 변경 (입력 방식 · 원본 비교 · 질문 결정)
근거: 사용자 요청("처방코드별로도 … 날짜별로도 입력할 수 있게"), 원본과 비교한 결과, 질문으로 정한 10가지. **(Claude 판단)** 표시는 사용자 결정도 원본 그대로도 아닌 동작에 붙인다. 이 절 전체를 그렇게 가려 적지는 못했다: 표시가 없는 줄 가운데 구현 방법과 안전 장치(19-5의 입력 기록·잠금, 19-7의 조회 모드 처리, 19-8의 첫 `progress` 신호 등)는 Claude가 정한 것이다.

### 19-1. 입력 방식 두 가지 (TASK-36·TASK-18)
- 원본의 고르기(`nmAutoMode`, 날짜별·기간별)를 옮긴다. 우리 이름은 **처방코드별**(원본 기간별: 기간 + 코드 하나)과 **날짜별**이다. **처음 골라진 것은 처방코드별**이다. 원본이 기간별에 `checked`를 두었기 때문이다
- 두 방식 다 지금 검색 길(`txtSch`+`btnSch`)을 쓴다. 원본 날짜별의 좌표 두 번 누르기 다리는 옮기지 않는다. 그래서 우리 날짜별은 하루뿐 아니라 시작~끝도 된다
- 대상 고르기는 Worker에서 부르는 순수 함수 `lib/precheck/inputTargets.ts`다. 코드 비교는 원본 `hasCode` 그대로(앞뒤 공백을 떼고 대문자로 글자까지 같음). 차례는 날짜, 같은 날은 목록 차례. 두 방식 다 원본처럼 메모가 없는 진료(`v.memos`가 빔)와 지난번 건너뛴 뒤 메모가 그대로인 사람(`nmAutoHeld`, AC-018.20)을 뺀다. 고른 기간(`visible`) 안만 본다(`claim.memos`가 그 기간만 읽는다, 19-9) **(Claude 판단)**. 비교가 `조회 못함`인 진료를 뺀다 **(승인 목업)**: '비트 메모를 읽지 못함' 묶음이다(AC-018.26). 비교가 `다름`인 진료는 묻지 않기와 상관없이 지금 비트 글을 `replaces`로 싣는다(19-6)
- 코드 단추 **(승인 목업)**: 불러온 기간의 아직 안 된 진료에 있는 코드를 건수가 많은 차례로 보인다(AC-018.10). 원본은 상세 필터의 시술 단추를 썼고 우리는 그 필터 편집을 옮기지 않았다. 시술 코드(`CODEMAP.k='proc'`)로 좁히는 것은 **(Claude 판단)**이다: 약 코드까지 보이면 너무 많다. '아직 안 된'은 고른 범위에서 완료와 메모 없음만 뺀 수다(AC-018.10). 건수를 이 뜻으로 두고 칸에 적은 코드를 먼저 쓰는 것도 승인 목업의 선택이다
- **누르기 전 목록 (승인 목업, 사용자 2026-11-01)**: 처방코드별이 왼쪽이다. `inputTargets`는 고른 조건마다 입력할 사람과 빠지는 사람(까닭 하나씩)을 돌려주고 화면은 고를 때마다 그것을 그린다(AC-018.26). 잘못 고른 안내도 고르는 즉시 나온다. [비트에 입력]의 묶음은 이 결과 그대로다. 사람마다 넣고 빼는 체크는 없다: 고른 조건에 맞으면 모두 든다(Phase 0 화면 4의 체크를 따르지 않는다). 확인 표시 알림(AC-018.12)은 목록에 이미 보여도 누를 때 한 번 더 뜬다. PC 창의 수는 화면 수보다 적을 수 있다: 화면에서 미리 뺀 사람은 창이 모르고 창은 PC가 스스로 찾은 사람만 '빼는 환자'로 센다(AC-018.3)
- 내원내역 창 칸 검사(`ChartRules.ListProblem`, 원본 13215~13218줄):

| 고른 코드 | 처방코드 칸(`txtOdrCod`) | 결과 |
|---|---|---|
| 없음 | 빈칸 | 지나감 |
| 없음 | 글자 있음 | 멈춤: 칸을 비워 주세요 |
| 있음 | 빈칸 | 지나감 |
| 있음 | 같음(대소문자 무시) | 지나감 |
| 있음 | 다름 | 멈춤: 같은 코드로 맞추거나 비워 주세요 |
| 상관없음 | 제외 체크 켜짐 | 멈춤: 제외 체크를 풀어 주세요 |
| 상관없음 | 칸에 글자가 있고 제외 체크를 읽지 못함 | 멈춤: 제외 체크를 풀어 주세요 |

- **제외 체크 읽는 법**: `UChartAutomation.ReadListFilter`가 이미 내원내역 창에서 `chkOdrExcept`를 찾아 `ListFilter.CodeExcept`에 담는다. 읽는 차례 **(Claude 판단)**: UIA `Patterns.Toggle`이 되는 칸이면 그 값(꺼짐이면 false, 켜짐이나 반쯤 켜짐(`Indeterminate`)이면 true)을 먼저 쓰고, 안 되거나 읽다 실패하면 `BM_GETCHECK`로 읽는다(0이면 꺼짐, 그 밖은 켜짐). 칸을 못 찾거나 둘 다 못 읽으면 null이고, 꺼짐으로 보지 않는다(AC-036.2). 원본 `RangeAutomation.cs`는 `BM_GETCHECK`만 쓰는데, 기본 모양의 WinForms 체크 칸은 직접 그리는 칸(`BS_OWNERDRAW`)이라 이 메시지가 늘 0을 돌려주어 켜진 칸을 꺼짐으로 읽을 수 있다. 그러면 제외 멈춤이 일어나지 않고 사람들이 건너뛰어진다(다른 환자에게 잘못 쓰이지는 않는다). 지금은 아무도 이 값을 보지 않으니 `ListProblem`이 보게 한다. 비트 체크 칸에서 어느 쪽이 맞게 답하는지는 코드로 알 수 없어 **의원 PC에서 확인한다**(TASK-36 시험 목록)
- 원본과 다른 점 **(Claude 판단)**: 원본은 칸에 글자가 있을 때만 제외를 봤고 읽지 못하면 지나갔다. 우리는 칸이 비어도 제외가 켜져 있으면 멈추고, 칸에 글자가 있는데 제외를 읽지 못해도 멈춘다. 체크를 푸는 데 한 번이면 되고, 코드로 거른 목록이 뒤집혀 있으면 찾는 환자가 없어 보인다
- `code`는 화면이 거른 뒤 도우미가 내원내역 칸과 맞추는 데만 쓴다. 도우미가 진료를 코드로 다시 거르지 않는다. `BatchCheck`의 `code` 검사는 `ChartShape`처럼 끝을 `\z`로 맞춘다: C# `$`는 끝 줄바꿈을 지나게 한다(AC-036.1)

### 19-2. 비트에 들어가는 글 (TASK-14)
- 전에는 `buildMemo`·`memoText`만 적혀 있었다. 원본이 입력하는 글은 `payloadOf`의 `edits[…] ?? fullText(v)`이므로 `fullText`까지 옮긴다. 그 안의 부품(`rxLines`·`iaLines`·`noteLines`·`patientLines`·`lineKey`·`formatLevels`·`sentenceMemo`·`styleSides`·`gapify`·`oneLineMemo`)과 재료(`applyRx`·`computeIntervals`·`NEW_MEDICORE_DICTIONARY`)가 다 골든 대상이다. `computeIntervals`·`iaLines`·`noteLines`·`rxLines`는 원본 뒤쪽 스크립트가 덮어쓴 판(7728줄 뒤)이 실제로 돈다. 골든은 스크립트를 끝까지 돌린 뒤의 함수로 만든다
- `clinic-memo-plan.md` §9는 `styleSides`·`oneLineMemo` 같은 '글을 다시 고치는 방식'을 가져오지 않겠다고 적었다. 이번에는 옮긴다 **(Claude 판단)**: 지금 약속은 원본 메모와 같은 결과이고(골든), 그 계획은 가입 질문과 함께 만드는 새 조립 방식 이야기다. 가입 질문 명세 때 다시 본다

### 19-3. 병원 설정과 우리 병원 값 (TASK-14·TASK-18)
- `Phrases` = 원본 `claim_hospital_settings` 모양 + `procedureDrugs`. 원본 `validate`·`defaults`·`diff` 골든은 원본 칸만 보고, 새 칸은 따로 검사한다(`knownDiffs`)
- 설정 줄이 없거나(`readHospitalSettings`가 `null`, TASK-12 그대로) 문구 칸이 `validatePhrases`를 지나지 못하면(빈 `{}`·`procedureDrugs` 없음 포함) 메모를 만들지 않는다(`E-MEMO-NO-SETTINGS`). 기본값으로 대신 만들지 않고, 설정 화면에서 그 병원이 새로 저장하지도 못한다. 상병 연결표도 저장하지 못한다 **(Claude 판단)**: `writeHospitalSettings`의 upsert가 NOT NULL `phrases`를 함께 쓰므로, 줄이 없으면 실패하거나 빈 문구 줄이 생겨 막음이 풀린다. 그런 병원은 연결표 없이 추천한다(AC-011.4)
- 우리 병원 값은 코드의 `ourClinicPhrases()`이고 서버 줄로 넣는 길은 `scripts/precheck/our-clinic-settings.mjs <병원 ID>`가 출력한 SQL을 운영자가 붙여 넣는 것이다 **(Claude 판단)**: 앱 코드에 특정 병원 ID를 두지 않고, TASK-12 마이그레이션을 고치지 않으며, 마이그레이션 붙여 넣기와 같은 방식이다. 값 감싸기는 8-4 한 가지. 환자 정보가 없다
- 설정 화면의 묶음은 설정 쪽 승인 목업(tasks.md TASK-18)을 따른다: 메모 모양 · 시술별 문구와 약 · 사유 문장. 원본 `claim_hospital_ui`의 묶음(기본·시술별·보조·부위별)은 쓰지 않는다. 저장하는 값의 모양과 `validate`·`defaults`·`diff` 골든은 그대로다 **(Claude 판단)**: 묶음은 화면 배치라서다. 그 목업의 '변경 기록'·'가입 보기 글'은 범위 밖이다
- `ourClinicPhrases()`의 약: 원본 `TPL`에 `{약제}`가 있는 시술의 주사약은 '넣기'(자리 `afterProc`), `{약제}`가 없는 시술은 '빼기'. 원본 기본값이 신경차단술 줄에 약을 쓰지 않기 때문이다. 국소마취제는 코드 표의 모든 `k='proc'` 시술에 '빼기'로 적는다(원본 `TPL.drugLocal` 꺼짐과 같음. 약은 적힌 값만 보므로 빠뜨리면 `[약 확인]`이 붙는다), 연골주사약은 원본 `cartilageLine`을 쓰는 시술(`iaKind`가 `ara`)에서 '넣기'이고 그 줄과 같은 글이 나오게 한다. 나머지 시술은 '빼기'. 그래야 시술 종류가 하나인 진료는 원본과 같다. 값은 골든이 정한다: 원본 결과가 나오지 않으면 값을 고친다. `ourClinic.test.ts`는 코드 표의 약 5개(`k='drug'`) × 시술 15개(`k='proc'`) 칸마다 값이 있는지 본다(리도카인만이 아니다)

### 19-4. 약 규칙 (TASK-14)
| 그 진료의 시술 종류 | 그 약의 설정 | 메모 |
|---|---|---|
| 하나 | 넣기 | 고른 자리에 넣음 |
| 하나 | 빼기 | 뺌 |
| 하나 | 아직 안 정함·처음 보는 약 | `[약 확인: 약 이름]` |
| 둘 이상 | 한 시술이라도 넣기이거나 아직 안 정함 | `[약 확인: 약 이름]`(자동으로 넣지 않음) |
| 둘 이상 | 모든 시술에서 빼기 | 뺌 |
| 0 (부위 메모는 있음) | 정할 시술이 없음 | 원본과 같이 약 글도 표시도 없다(사용자 결정 2026-11-01, AC-014.14) |

- 2026-11-01 사용자 결정: '넣기가 하나뿐이면 그 시술에 넣는다'는 옛 규칙은 없앴다. `clinic-memo-plan.md` §9의 옛 글보다 이 표가 앞선다. 시술 종류는 원본 `procKeys`로 센다
- 대상은 그날 처방의 `CODEMAP.k='drug'` 약 전부다. 국소마취제(`localAnesthetic`)·연골주사약(`cartilage`)도 같은 표를 따른다(사용자 결정). 기본값은 국소마취제 '빼기', 연골주사약은 병원이 고른 메모 예시를 따른다(가입 질문이 채운다. 그 전에는 우리 병원 값만 있다, 19-3)
- 기본값을 쓰는 법 **(Claude 판단)**: 기본값은 설정을 채울 때 쓴다. 메모를 만들 때는 설정에 적힌 값만 보고, 적히지 않은 약은 마취제도 아직 안 정한 약이다. 마취제를 알아볼 길은 있다: 원본 `TPL.lidoCodes`(병원 설정, 기본 `A15`, `mx999` 2238·3482줄)다. 그래도 쓰지 않는다. 원본에서 그 값은 '리도카인 없음' 표시·경고와 규칙의 약 역할에 쓰이고 메모 글을 정하지 않는다. 그리고 약을 시술별로 고르기로 했으므로(사용자), 안 정한 칸을 메모 때 '빼기'로 채우면 병원이 고른 적 없는 값이 표시 없이 메모를 바꾼다. 이름 일부 맞추기도 시술별 약 고르기로 대신하기로 했다. 병원이 새 시술 코드를 쓰면 `[약 확인: 리도카인]`이 나오고 설정에서 한 번 정하면 풀린다
- `[약 확인: …]`은 확인 표시다(`unresolved`에 걸림). 자동 입력에서 빠지고, 설정에서 정하면 다음 메모부터 풀린다. 원본과 다른 결과(원본 `ambiguousDrug`는 주사약을 비우고 검토로 돌림, 원본 `cartilageLine`은 시술 종류가 둘 이상인 날에도 연골주사 줄을 씀)는 골든 `knownDiffs`에 이유와 함께 적는다. 그래서 그런 날의 메모는 사람이 고치기 전에는 입력되지 않는다
- 위험: 병원 설정과 실제로 쓴 시술이 다른 날에는 메모가 틀린다. 설정 칸에 이 점을 적는다(AC-018.19)
- 설정을 바꾸면 다음에 만드는 메모부터다. 손대지 않은 자동 메모는 저장하지 않으므로 새 설정으로 다시 만들고, 고쳤거나 완료한 메모는 그대로다(원본 `protectWork`)

### 19-5. `bit.input` 연결 (TASK-35)
- TASK-17 코드는 합쳐졌지만 `bit.input`은 일부러 등록하지 않았다(지금 `E-HELPER-UNKNOWN-COMMAND`). 등록하기 전에 다섯이 있어야 한다(`InputParts.cs` 주석):
  1. **내원 수**: 같은 날 진료 A·B가 있는 사람의 B만 묶음에 있으면 첫 줄 A가 열리고 화면 검사를 다 지나 B의 메모가 A에 저장된다. 화면으로는 가릴 수 없어 DB에서 센다. 묶음 기간의 차트번호·내원일별 수를 읽는 SELECT 상수 `Sql.InputVisitCountSql` 하나를 더한다. 조건은 기간뿐이고 `OcmInf` 줄을 모두 센다 **(Claude 판단)**: `ClaimDatesSql`의 조건 밖 줄(취소된 접수 등)도 내원내역에서 열리고 `VisitOpener.OpenRows`는 날짜가 맞는 첫 줄을 연다. 차트번호는 도우미 안에서 견주는 데만 쓰고 답에 싣지 않으며, 이름·메모는 읽지 않는다. 처리기의 `HospitalGate` 세션 안에서 읽고, 세션은 입력 전에 닫는다
  2. **진짜 입력 기록**: `WorkStoreJournal : IInputJournal`. `Mark`는 돌아오기 전에 디스크에 남는다. `item.Date`의 달 파일로 간다. 웹이 보낸 `journal`은 모양만 검사하고 저장하지 않는다는 TASK-15 규칙은 그대로다. **`SaveResults` (Claude 판단)**: 이번 묶음에서 `Mark`한 진료의 기록을 바꾸지 않고, `writing`·`writeUnconfirmed`·`skippedByHand`를 덮지 않는다. 결과 줄은 상태를 모른다. `InputCommands`는 사람마다 `MarkFinal`을 마친 뒤 `SaveResults`를 부르므로, 건너뜀을 `skipped`로, 확인 필요를 `check`로 `journal`에 적으면 `WorkStore`가 앞선 값을 덮는다: `SkippedByHand`로 남은 사람이 `check`가 되어 다음 묶음의 묻지 않기가 승인 없이 그 칸을 바꾸고, 쓰다 멈춘 기록도 사라진다. 시험은 `InputCommands`를 진짜 `WorkStoreJournal`로 끝까지 돌린 뒤 다시 열어 본다(가짜 기록은 `Saved.Add`만 해서 잡지 못한다, AC-035.2)
  3. **기록을 푸는 길**: `checkedByHand`가 붙은 진료(19-6 표). 새 명령을 만들지 않는다 **(Claude 판단)**: `send`는 `store.save`·`bit.input`만 받고(AC-004.9), `bit.input`이어야 PC 확인 창을 지난다
  4. **쓰다 멈춘 사람을 뺀 묶음 잡기 (Claude 판단)**: 남아 있는 `work-*.dat` 가운데 읽을 수 있는 이 병원 파일 전부에서 찾는다(읽을 수 없는 파일은 아래 '확인할 수 없는 기록'). 찾으면 확인 창도 띄우지 않고 `unconfirmed: [{visitKey, date}]`를 답한다. 그래서 화면은 쓰다 멈춘 사람을 먼저 풀게 한다(AC-018.16)
  5. **잠금**: `store.save`와 `store.load`의 `.bak` 되살리기도 `WorkLock`을 잡는다
- **확인할 수 없는 기록 (Claude 판단: 2026-11-02 사용자 결정 '직접 확인하면 풀기'와 같은 원칙, AC-035.9)**: 검사가 못 보는 파일에 쓰다 멈춘 사람이 있을 수 있다. 깨진 본 파일은 `.bak`이 없으면 이름이 바뀌어 다음 검사에서 사라지고, 더 오래된 `.bak`이 있으면 `writing` 없는 사본으로 되살아난다. 등록 파일이 깨져 다시 등록하면 같은 의원도 새 프로필 ID라(AC-005.12) 옛 파일을 다른 병원으로 본다. 그래서 검사는 고치지 않고, 아직 확인하지 않은 파일이 있으면 이 묶음의 창 하나에 글을 더해 묻는다. 확인은 바이트 해시로 `input-acks.dat`에 둔다. 차례: 쓰다 멈춘 사람 검사(파일 가르기 + AC-035.4) → 빼기 → 남는 사람도 풀 사람도 없으면 창 없이 끝 → 지문 → 창 → [확인] → 해시 저장 → 입력 기록 읽기 → 풀 사람 `Mark` → 내원내역 칸 확인 → 사람마다. 풀 사람의 줄은 그 사람의 `Mark` 뒤에만 넣는다. 버린 길: 창을 따로 띄우기(두 번 누르게 된다), 파일 머리에 프로필 ID를 평문으로 넣어 풀지 않고 가리기(파일 형식이 바뀌고 옛 파일을 옮겨야 한다), 13개월 지우기에 해시를 맞추기(`.broken-*`는 지우지 않으므로 다시 묻는다)
- 비교는 `Core/Claim/MemoCompare`로 잇는다. 공백뿐인 칸은 `Absent`다 **(Claude 판단)**. 차례: `ReadItems`(명령 표 + 묶음 검사, 받은 그대로) → `WorkLock` → `HospitalGate`(등록 확인 + 내원 수) → 입력 기록 열기 → 쓰다 멈춘 사람 검사 → 빼기 → 남는 사람도 풀 사람도 없으면 창 없이 `finished` + 건너뜀 결과(AC-035.8) → `RunBatch`. `BatchCheck`는 빈 묶음을 거절하므로 뺀 뒤의 묶음에 이 검사를 먼저 하면 건너뜀 이유를 잃는다. `InputRunner.Run` 안의 검사는 남은 사람이 있을 때만 닿으므로 그대로 둔다
- 등록 파일: `Program.cs` 한 줄. `MIN_HELPER`·`LATEST_HELPER`·`Version`은 TASK-35에서 올리지 않고 릴리스 때 같은 커밋에서 올린다(13절). 릴리스는 사용자가 지시할 때만 한다(tasks.md 머리말). 먼저 올리면 새 도우미가 나오기 전까지 의원 PC에서 TASK-13을 시험할 수 없다. 판을 올리든 말든 `helper-v0.1.1`의 도우미에는 `claim.dates`·`claim.month`가 없으므로, TASK-13의 의원 PC 시험에는 어차피 새 도우미 릴리스가 필요하다. 그 릴리스도 사용자가 지시할 때만 한다. TASK-37 전에 릴리스를 지시받으면 그 판은 웹이 보내는 `code`·`replaces`를 모르는 칸으로 거절한다고(AC-001.2) 먼저 알린다
- 끝 답: `{status, code, reason, fields, results}`에 `unconfirmed`·`noAsk`를 더한다. `results`의 줄에는 바꾼 사람에게만 `previousMemo`가 있다(19-6). 화면이 읽는 법은 AC-018.21·AC-018.22

### 19-6. 다른 메모 바꾸기 · 묻지 않기 (TASK-37·TASK-18·TASK-40)
- **기본으로 바꾼다 (2026-11-02 사용자 결정)**: 사용자 말 "직접쓴건 없애 그리고 어떤거 없앴는지만 알려줄수있게해 어차피 내가 한번 다 확인하고 돌릴거여서 괜찮아". 전에는 원본처럼 사람마다 승인했다. 이제 사이트가 스스로 승인한다: `inputPlan`이 비교 `다름`인 진료를 묶음에 넣고 지금 쥔 비트 메모(`claim.memos` 값)를 `replaces`에 담는다. 완료·메모 없음·직접 입력·확인 표시·조회 못함이 AC-018.26 차례대로 먼저 빠지고 쓰다 멈춘 사람은 AC-018.16의 길이다. 묻지 않기는 PC 창만 생략한다. 바뀌는 것은 사이트뿐이다: 도우미는 지금처럼 쓰기 바로 앞에 칸 글이 `replaces`와 같을 때만 바꾸고(`MemoWriter`가 이미 `approvedExisting`을 받는다), 원래 메모를 먼저 저장하고, 결과에 `previousMemo`를 주고, PC 확인 창에 바꾸는 수를 세어 보인다(AC-037.1·AC-037.2·AC-037.3). 그새 바뀌었으면 쓰지 않는다. 이 결정으로 도우미 동작은 바뀌지 않는다(글 한 줄은 아래 '고친 글'). 버린 길: 도우미를 고쳐 `replaces` 없이 바꾸게 하기(릴리스가 늘고, 칸 글이 불러온 글과 같은지 보는 보호를 잃는다), 화면에 '모두 바꾸기' 단추 더하기(누를 것만 늘고 사용자는 어차피 돌리기 전에 목록을 본다)
- **[바꾸지 않기] (2026-11-02 사용자 결정)**: 사람을 빼는 유일한 길이다. Worker 메모리의 `declined`(내원번호 모음)에 둔다: `memoApprove {approved: false}`가 넣고 `{approved: true}`가 빼고 새 `loadStart`가 모두 지운다. 화면 메시지 모양은 그대로다. 어느 묶음에도 넣지 않는다: `replaces` 없이 보내면 켜진 도우미가 바꾸므로(AC-037.6) 보내지 않는 것만 안전하다. 쓰다 멈춘 사람만 `replaces` 없이 보낸다 **(Claude 판단)**: 빼면 도우미가 아무도 열지 않고 멈추고(AC-035.4), 칸이 다르면 쓰지 않고 멈춘다(AC-017.7). 그 사람이 있는 날은 끝나지 않은 날로 남는다: 받아들인다. **글이 달라져도 풀지 않는다 (Claude 판단)**: 규칙이 하나라 설명이 쉽고, 틀려도 바꾸지 않는 쪽으로 틀린다. 전에 승인을 풀던 규칙은 기본 길에 쓰지 않는다: 사용자가 돌리기 전에 목록을 보고 `replaces`는 늘 지금 쥔 글이다
- **직접 확인 기록과 사본 (Claude 판단)**: `skippedByHand`가 남은 사람은 '다른 메모 있음'에 남고 [이 메모로 바꾸기]를 누를 때만 `replaces`로 든다. 사람이 손으로 확인한 메모이기 때문이다. 이 사람의 승인(`approved`)은 전 규칙 그대로다(AC-018.14). **사본이 곧 보호다**: 도우미는 이 기록이 있어도 `replaces`가 오면 새 승인으로 본다(AC-037.6). 전에는 사이트가 사람이 눌렀을 때만 실어 사본이 어긋나도 도우미가 막았지만, 이제 기본으로 실으므로 사본이 어긋나면 손으로 확인한 메모가 바뀐다. 그래서 [직접 확인했어요]로 보낸 사람은 보낼 때 `declined`에도 넣는다: `E-STORE-FAILED`·`unconfirmed`가 있는 답이라 사본을 적지 못해도(아래 '사본에 적지 않는 답') 새 [자료 불러오기]로 진짜 기록을 읽기 전까지 보내지 않는다. [이 메모로 바꾸기]를 누르면 `declined`에서 빠지고, 사본이 `skippedByHand`이면 `approved`에도 든다
- **`replaces` 한도 (Claude 판단)**: 1~4,000자를 벗어나면 묶음 전체가 `E-HELPER-BAD-MESSAGE`다(`BatchCheck.ValidReplaces`, `commands.json`). 사이트가 쥔 글은 이 안에 든다: `MemoRowsRead.Read`는 4,000자를 넘으면 잘라 답 전체에 `truncated`를 세우고 `readBitMemos`가 그 답을 통째로 버린다(AC-016.6). `bitMemoOf`에 4,000자를 넘으면 읽지 못한 것으로 치는 줄을 더해, 도우미와 어긋나도 그 사람만 `조회 못함`이고 묶음은 산다. 글자 수는 두 쪽 다 UTF-16 단위이고 줄바꿈을 맞춘 뒤의 글이다. 알려진 한계: 긴 메모 하나가 그 기간 전체의 [자료 불러오기]를 막는다(지금과 같음). 사람마다 가르려면 도우미가 줄마다 잘림을 알려야 하므로 다음 도우미 릴리스 때 본다
- **무엇을 지웠는지 (2026-11-02 사용자 결정)**: 새 화면이 없다. 결과 화면의 '그중 메모 바꿈 N명'과 바꾼 사람 줄의 이전 메모·넣은 메모(AC-018.4), [엑셀로 저장]의 '기존 비트 청구메모'(AC-018.15)다. 코드 확인(2026-11-02): `jobs.ts`가 엑셀 줄을 `existing: line.previousMemo ?? rowOf.get(line.key)?.inBit ?? ''`로 만들고 `excel.ts`가 그 칸을 쓴다. 더 고칠 것이 없다. [엑셀 내려받기](AC-013.4)는 점검 결과 파일이라 메모가 없고 여기에 쓰지 않는다
- **알려진 위험 (2026-11-02 사용자 결정으로 받아들임)**: 지난 날짜로 처음 돌리면 직접 쓴 메모가 한꺼번에 많이 바뀐다. 목록의 '메모 바꿈' 줄과 단추 옆 글, PC 창의 '다른 메모를 바꾸는 환자 N명'이 수를 보인다. 원래 메모는 그 PC 달 파일(`originals`)에 남고 13개월 뒤 지워지며 보여 주는 화면이 없다(AC-037.8). 결과 화면은 마지막 묶음만 보이고 엑셀은 눌렀을 때만 만들므로 묶음마다 눌러야 남는다. 입력 중에 창을 닫아 결과를 받지 못하면 그 묶음의 지운 메모는 화면에 나오지 않는다
- **고친 글 (Claude 판단, TASK-41)**: PC 확인 창의 주의 줄 "비트에 다른 메모가 있으면 승인한 사람만 바꾸고 나머지는 건너뜁니다. 아래 체크를 켜면 승인하지 않은 다른 메모도 바꿉니다."(AC-037.8)는 사이트가 `다름`인 사람을 모두 `replaces`로 보낸 뒤로 맞지 않았다. 이번 도우미 릴리스에서 "비트에 다른 메모가 있으면 우리 메모로 바꿉니다. 원래 메모는 기록에 남깁니다. 다만 불러온 뒤 달라진 메모, 우리 메모에 확인 표시가 남은 환자, [직접 확인했어요]를 누른 환자는 건너뜁니다."로 고친다. 앞 두 문장은 아래 표의 `칸 다름, replaces와 같음` 줄이고, '건너뜁니다'는 `replaces`와 다름·`replaces` 없음·확인 표시·`checkedByHand` 줄이다. 글이 조금 길어져도 창은 폭 560에서 줄을 바꾸고 글에 맞춰 커지므로(`ConfirmWindow`) 잘리지 않는다. 글만 바뀌고 동작과 창의 수는 그대로다
- 원래 메모는 도우미가 쓰기 전에 칸에서 읽은 글이다. 결과 줄에 함께 주고(원본 '이전 메모') 달 파일에도 남긴다. **쓰는 차례(AC-037.1)**: 칸 글을 읽음 → 달 파일(`work-YYYY-MM.dat`)의 `originals` 목록에 덧붙여 저장 → `writing` → 칸에 쓰기 → 다시 읽기 → 저장 → 다시 읽기 → `done`. 저장하지 못하면 칸에 쓰지 않고 `E-STORE-FAILED`로 멈춘다. 묶음 끝의 `SaveResults`로 미루면 쓴 직후 전기가 나갈 때 칸은 바뀌었는데 원래 메모가 어디에도 없다. 묻지 않기에서는 아무도 보지 못한 메모다
- **`originals` (Claude 판단. 글 목록과 저장만 하는 것은 2026-11-01 사용자 결정)**: `visitKey` → 글 목록. `IInputJournal.Mark(item, state)`에는 글 칸이 없고 `journal` 값은 상태 글자라(`LastState`는 모르는 값이면 `E-STORE-FAILED`) 거기에 넣지 않는다. `done`·`drafts`는 `store.save`가 칸 전체를 바꾸므로 쓰지 않는다. 그래서 `drafts`·`done`·`journal`과 같은 층의 칸이다. `IInputJournal`에 원래 메모를 남기는 일을 하나 더하고, `WorkStore.SaveMonth`는 이 칸을 그대로 옮겨 쓴다(안 그러면 1초마다 오는 `store.save`가 지운다). 웹은 보낼 수 없고(명령 표에 칸이 없음) `store.load` 답에도 없다. 값이 없으면 파일에 칸을 쓰지 않는다. 덮어쓸 때마다 덮어쓰는 글을 `writing`보다 먼저 목록 뒤에 덧붙이고, 목록의 마지막 글과 같으면 덧붙이지 않는다 **(2026-11-01 사용자 결정)**. 칸이 빈 입력은 건드리지 않는다. 쓰기 뒤 도우미가 죽으면 다음 묶음에서 저장을 확인할 때(AC-017.7) 목록의 마지막 글을 결과에 준다. 새 명령·새 파일이 없고 TASK-37의 Files(`Core/Input/*`·`Core/Store/*`, 시험은 `Core.Tests/Input/*`·`input-replace.dotnet.test.ts`) 안이다. **이번에는 저장만 한다 (2026-11-01 사용자 결정)**: 이 칸을 보여 주는 화면은 만들지 않는다. 원래 메모는 결과 화면에서 본다. 입력 중에 창을 닫아 결과를 받지 못하면 글은 그 PC에 저장된 채로 남고, 꺼내려면 개발자가 필요하다. 정말 필요해지면 화면을 나중에 더한다
- **결과 줄의 `previousMemo` (Claude 판단: 이름)**: `{visitKey, result, reason, previousMemo?}`. 바꾼 사람의 줄에만 있고 다른 줄에는 칸 자체가 없다(`InputOutcome.ToJson`의 `WriteOptional`처럼 `null`을 쓰지 않는다). 결과 조각으로만 간다: `progress`는 숫자만이다(AC-004.10·AC-017.6). 조각은 환자 자료 길(5절)이라 통로가 풀지 않고 Worker로 간다. 화면은 AC-018.4대로 보인다
- **묻지 않기**: PC 확인 창의 체크다. 값은 도우미 프로세스 메모리에만 있고 저장하지 않는다. 확장은 웹 연결이 끊기면 도우미 연결을 닫고(AC-003.7) 도우미는 표준 입력이 닫히면 끝나므로(AC-001.1), 청구 창을 닫거나 새로 고치면 꺼진다. 명령 표에 칸이 없어 사이트는 켤 수 없다
- **켜면 `replaces`가 없는 다른 메모도 바뀐다**(2026-11-01 사용자 결정, 원본 자동 동의 `mx999` 4282~4288줄): 체크 글이 이것을 그대로 말한다(AC-037.8). 그대로인 것: 확인 표시가 남은 메모는 입력하지 않고, 칸을 못 읽으면 멈추고, 원래 메모를 남긴다. 도우미 동작이라 그대로이고, 사이트는 `다름`으로 아는 사람에게 늘 `replaces`를 실으므로 이 길은 사이트가 `비트에 없음`으로 본 사람(불러온 뒤에 메모가 생김)에게만 남는다. 그 사람은 목록에 '새 메모'로 보이고 결과에 바꿈과 이전 메모가 나온다(알려진 한계) **(2026-11-02 사용자 결정에 따름)**
- **켜져 있어도 바꾸지 않는 셋 (Claude 판단, ③은 승인 목업)**: ① [직접 확인했어요]로 온 사람: 직원이 그 메모를 손으로 다루던 중이다(AC-035.5). 완료로 끝나지도 쓰기를 시작하지도 않으면(칸 다름·다른 건너뜀·미처리·묶음이 그 사람에서나 차례 전에 멈춤·[확인] 뒤 미리 빠짐. [확인] 없이 끝난 묶음은 `skipped`다, AC-035.5) 입력 기록에 새 상태 `SkippedByHand`(`JournalState`, 파일 글자 `skippedByHand`)로 남아 다음 묶음에서도 `replaces` 없이는 건너뜀이다(AC-037.6). 쓰기를 시작했어도 칸에 글이 남지 않은 사람(`MemoWrite.NotWritten`, 쓴 뒤 다시 읽어 쓰기 전과 같음)도 같다(AC-035.5). 차례 전에 멈춘 사람을 `Check`로 두면 쓰다 멈춘 기록도 직접 확인 기록도 없어 다음 묶음의 묻지 않기가 그 칸을 승인 없이 바꾼다. 메모리가 아니라 기록에 두는 까닭: 창을 새로 고치면(묻지 않기를 끄는 보통 길, AC-037.4) Worker 메모리는 사라지고, 결과 조각이 깨져도(AC-018.21) 잊고, 다시 켠 묻지 않기가 그 메모를 승인 없이 바꾸면 창의 "직접 확인한 환자는 바꾸지 않고 건너뜁니다"가 거짓이 된다. 새 명령·새 파일이 없다: 도우미는 `LastState`로, Worker는 `store.load`의 `journal`로 본다. ② `replaces`로 보낸 메모가 불러온 뒤에 바뀐 사람: 사용자가 목록에서 본 글이 아니다(AC-037.2). 다시 불러오면 새 글로 든다(AC-016.7). ③ 체크를 켠 그 묶음의 `replaces`가 없는 다른 메모: 체크는 다음 묶음부터 친다(AC-037.6, 끝난 뒤 안내 AC-018.22)
- **사이트가 상태를 아는 법 (Claude 판단)**: 도우미가 끝 답 JSON에 `noAsk`를 싣고 Worker가 메모리에 둔다. Worker는 화면을 다시 그려도 살아 있으므로(AC-013.12) 새 `bridge-port`를 받으면 거짓으로 되돌린다: 새 통로의 도우미는 새 프로세스라 꺼져 있다. 새 명령이 없고 사이트에서 도우미로 가는 칸도 없다. 2026-11-02부터 묶음은 이 값과 상관없다(AC-016.3): 화면의 띠와 '확인 기다리는 중'을 정할 뿐이다. 상태가 어긋나도 안전하다: 창이 한 번 더 뜨거나 덜 뜰 뿐이고 바뀌는 사람은 같다. [직접 확인했어요]로 건너뛴 사람은 `store.load`의 `journal`에서 `skippedByHand`를 읽어 [이 메모로 바꾸기] 전에는 넣지 않는다(AC-016.3). 이번 묶음의 결과로 그렇게 끝난 사람(`checkedByHand`로 보냈고 결과가 건너뜀이거나 '미처리')은 `applyInputResults`(TASK-18)가 Worker가 받아 둔 `journal` 사본에도 같은 값을 적는다(답의 줄이 모두 뒤 글 없는 빠지는 까닭이면 [확인]이 없던 묶음이라 `skipped`로 적고 `skippedByHand`는 덮지 않는다, AC-016.3). 안 적으면 다시 불러오기 전까지 그 사람은 누르지 않았는데 '메모 바꿈' 칩으로 입력할 사람에 남아 `replaces`와 함께 나가고, 도우미는 그것을 새 승인으로 봐 바꾼다(AC-037.6). **사본에서 쓰다 멈춤이 풀리는 때 (Claude 판단)**: 결과가 완료인 사람은 사본을 `done`으로 적는다. 도우미가 저장을 확인해 `done`을 남긴 사람이라(AC-017.7) 안 적으면 다 끝난 사람이 다시 불러오기 전까지 AC-018.16에 막힌다. 쓰다 멈춘 결과는 도우미 기록도 풀리지 않았으므로 사본을 그대로 둔다. `unconfirmed`는 마지막 답의 값만 본다. **사본에 적지 않는 답 (Claude 판단)**: `E-STORE-FAILED`이거나 `unconfirmed`가 있는 답은 위 둘 다 적지 않는다. 도우미 기록이 그대로일 수 있어서다. 다시 불러오면 맞춰진다. 그동안은 위의 `declined`가 그 사람을 막는다
- **첫 묶음 (2026-11-02 사용자 결정에 맞춰 다시 씀, N은 Claude 판단)**: 전에는 체크를 켠 그 묶음에 승인하지 않은 다른 메모가 없어 끝난 뒤 '다른 메모 있음' 수를 알렸다. 이제 그 사람들은 이미 `replaces`로 그 묶음에 들어 바뀐다. 남은 '다른 메모 있음'은 [바꾸지 않기]와 직접 확인 기록뿐이라 다시 눌러도 바뀌지 않으므로 세지 않는다. 다시 누르면 바뀌는 사람은 사이트가 `비트에 없음`으로 보고 `replaces` 없이 보냈는데 칸에 메모가 있던 사람뿐이다: 불러온 뒤에 메모가 생겼다. 그 묶음에서는 건너뜀(이미 있음)이고(AC-037.6) 다음 묶음은 켜진 도우미가 바꾼다. N은 이 사람들이고 `diffAtSend`는 지운다(AC-018.22)
- 직접 확인 기록이 남은 사람의 승인을 Worker 메모리에만 두고 [바꾸지 않기]·[직접 확인했어요] 말고는 우리 메모 글이 달라지거나 자료가 실제로 바뀔 때만 푸는 것은 **(Claude 판단)**이다: 실패했거나 옛 번호로 버려진 다시 불러오기는 승인을 그대로 둔다(AC-016.8·AC-018.14). [직접 확인했어요] 단추도 **(Claude 판단)**이다(19-5의 3)
- 승인 목업에서 받아들인 것: 끄는 단추 없음(화면 위 띠와 단추 옆 글로 알림). 2026-11-02 사용자 결정으로 달라진 것: [바꾸지 않기]는 '메모 바꿈' 줄 모두에 있고(전에는 [이 메모로 바꾸기]를 잘못 눌렀을 때 되돌리는 단추), [이 메모로 바꾸기]는 '다른 메모 있음' 줄에만 있으며 묻지 않기가 켜져 있어도 숨기지 않는다(AC-018.14)
- **직접 확인하면 풀기 (2026-11-02 사용자 결정)**: 쓰다 멈춘 사람이 빠질 자리(내원 수 AC-035.1, 확인 표시 AC-037.7)이면 묶음이 창 앞에서 멈춰 기록을 풀 길이 없었고, 입력 전체가 개발자를 기다렸다. 이제 직원이 비트에서 그 칸을 보고 [직접 확인했어요]와 PC 창 [확인]을 누르면 줄을 열지도 쓰지도 않고 기록을 `SkippedByHand`로 남기고 건너뜀으로 끝낸다(AC-035.8). 그 뒤는 아래 표의 `SkippedByHand` 줄과 같다. `checkedByHand`가 없으면 전처럼 멈춘다. 차례: 빼기 → 지문 → 창 → [확인] → 해시 저장(AC-035.9) → 입력 기록 읽기 → 풀 사람 `Mark` → 열 사람이 있으면 내원내역 칸 확인 → 사람마다. 풀 사람의 줄은 그 사람의 `Mark` 뒤에만 넣는다 **(Claude 판단)**: `Mark`가 먼저면 입력 기록을 읽지 못한 묶음도 풀려 AC-035.5의 '그대로'에 어긋난다. `SaveResults`는 `writing`을 덮지 않으므로(AC-035.2) `Mark`로 남기고, 열 사람보다 먼저 남겨 뒤 사람에서 멈춰도 풀린다. `InputRunner.Run`의 묶음 검사는 빈 묶음을 거절하므로 열 사람이 없으면 그 검사와 사람마다 고리에 들어가지 않는다
  - **지문을 그대로 본다 (Claude 판단)**: 열 줄이 없어도 지문 뒤에 창을 띄운다. 알아보지 못하는 비트 화면에서 안전 기록을 풀지 않는 쪽이 더 안전하고, 지문이 틀리면 어차피 아무도 입력할 수 없어 이 때문에 새로 막히는 일이 없다
  - **창의 수 (Claude 판단)**: 풀 사람은 '직접 확인한 환자 N명'에만 세고 '빼는 환자 N명'에는 세지 않는다. 글은 AC-035.5
  - **사이트 길 (Claude 판단)**: 두 단추의 묶음은 Worker의 거르기를 지나지 않아 확인 표시 메모도 도우미까지 간다. 메모가 없으면 한 칸 공백, 그 진료가 자료에 없으면 자리 채움 값을 보내 AC-017.1을 그대로 지난다(AC-018.16). 도우미는 메모가 공백뿐이면 `checkedByHand`와 상관없이 열지 않으므로(AC-035.8) 이 값은 비트에 닿지 않는다. [이어서 입력]은 빠질 사람임을 화면이 아는 동안 흐리고, 같은 날 진료를 도우미만 알면 눌려서 아래 표의 `stopped`로 끝난다(AC-018.16). 버린 길: 묶음 검사와 `commands.json`을 고쳐 빈 메모를 받기(명령 표와 시험까지 바뀌고, 도우미가 그 값을 열지 않는 규칙은 어차피 필요하다), 새 칸이나 새 명령(19-5의 3)

| 진료 상태 | 묻지 않기 꺼짐(체크를 켠 그 묶음 포함) | 묻지 않기 켜짐(묶음 시작 때) |
|---|---|---|
| 칸 빔 | 입력 | 입력 |
| 칸 같음 | 완료(이미 입력됨) | 완료(이미 입력됨) |
| 칸 다름, `replaces` 없음 | 건너뜀(이미 있음) | 바꿈 + 원래 메모 남김 |
| 칸 다름, `replaces`와 같음 | 바꿈 + 원래 메모 남김 | 바꿈 + 원래 메모 남김 |
| 칸 다름, `replaces`와 다름 | 건너뜀(입력 직전 변경됨) | 건너뜀(입력 직전 변경됨) **(Claude 판단)**: 불러온 뒤에 누가 고쳤다 |
| 칸을 못 읽음 | 멈춤 | 멈춤 |
| 쓰다 멈춘 사람 | AC-017.7 | AC-017.7 |
| `checkedByHand`(위 `칸 다름` 줄보다 앞선다) | 확인 창 뒤, 쓰다 멈춘 사람으로 보지 않음. 칸 다름이면 건너뜀(이미 있음), `replaces`가 있어도 바꾸지 않음. 완료도 쓰기 시작도 아니면 기록은 `SkippedByHand`(미처리·멈춤, 칸에 글이 남지 않은 쓰기 포함, AC-035.5) | 확인 창을 띄움 **(Claude 판단)**. 칸 다름이면 여기서도 건너뜀(이미 있음), 바꾸지 않음 **(Claude 판단)**: 직원이 그 메모를 손으로 다루던 중이다. 기록은 왼쪽과 같다 |
| 마지막 기록이 `SkippedByHand`이고 칸 다름(`checkedByHand` 없이 온 다음 묶음. 위 `칸 다름` 줄보다 앞선다) | `replaces` 없으면 건너뜀(이미 있음), `replaces`와 같으면 바꿈 | 같음 **(Claude 판단)**: 사람이 새로 승인했을 때만 바꾼다 |
| 쓰다 멈춘 사람이 빠질 자리(내원 수·확인 표시·메모가 공백뿐), `checkedByHand` 없음 | 아무도 열지 않고 `stopped`, 기록 그대로(AC-035.8) | 같음 |
| 쓰다 멈춘 사람이 빠질 자리(내원 수·확인 표시·메모가 공백뿐), `checkedByHand` 있음(위 `checkedByHand` 줄보다 앞선다) | 지문 → 확인 창. [확인] 뒤 열지도 쓰지도 않음, 기록은 `SkippedByHand`, 결과는 건너뜀(이유 AC-035.8). [취소]·창 닫기·5분 지남이면 기록 그대로 **(2026-11-02 사용자 결정)** | 확인 창을 띄움 **(Claude 판단)**. 나머지는 왼쪽과 같다 |
| 확인 표시가 남은 메모·공백뿐인 메모(쓰다 멈춘 사람은 위 두 줄) | 빼고 건너뜀 | 빼고 건너뜀 |
| 위 줄 가운데 쓰다 멈추지 않은 `checkedByHand` | 건너뜀, '빼는 환자'에 셈. [확인]을 받은 묶음이면 기록은 `SkippedByHand`, 모두 빠져 창이 없거나 지문이 틀린 묶음이면 `skipped` **(Claude 판단)** | 같음 |

- 이 표는 도우미 동작이고 그대로다. 2026-11-02부터 사이트가 `다름`으로 아는 사람은 `칸 다름, replaces와 같음` 줄로 오고, `replaces` 없음 줄은 사이트가 `비트에 없음`으로 본 사람에게만 남는다. `SkippedByHand` 줄의 `replaces`는 사람이 [이 메모로 바꾸기]를 눌렀을 때만 실린다(AC-016.3)
- 확인 표시 검사는 Worker(AC-018.12)와 도우미(AC-037.7) 둘 다 한다 **(Claude 판단)**: 묻지 않기를 켜면 PC에서 볼 기회가 없어서다

### 19-7. 조회 모드 안내창 (TASK-36)
- 원본 `medicore/bit_dialogs.py`를 옮긴다. 판단(`IsViewModeNotice`·`IsConfirmButton`)은 Core, 창 찾기·누르기(`ViewModeNotices.cs`)는 Windows다. 환자를 여는 동안만(`OpenPatient` 안) 0.25초마다 보고 5번까지 누른다. 등록한 `BITDoctorOrder.exe` 프로세스의 보이는 `#32770` 창만 보고 저장 안 한 처방 창은 글이 달라 걸리지 않는다
- 조회 모드에서 메모 칸이 어떤 상태인지는 코드로 알 수 없다(의원 PC 확인). 편집 불가이거나 쓴 뒤 다시 읽어 전과 같으면 **아무것도 쓰이지 않은 것**이므로 그 사람만 확인 필요로 두고 다음 사람으로 간다. 다른 글이 들어갔거나 다시 읽지 못한 것(`WrittenDifferent`)은 묶음을 멈춘다. 쓰다 멈춘 사람은 편집 불가이거나 글을 받지 않아도 다음 사람으로 가지 않고 묶음을 멈춘다: 칸에 저장 안 된 글이 남아 있을 수 있다. 칸이 우리 글과 같아 저장만 남았어도 편집 불가이면 저장을 누르지 않는다. 안내창이 없는 다시 실행과 보통 모드도 같다(AC-017.7·AC-036.5). `UChartAutomation.cs` 머리 주석의 '옮기지 않았다'를 함께 고친다

### 19-8. 크롬 창 내리기 (TASK-38, TASK-36의 기다리기)
- 원본은 입력 전에 자기 창을 내린다(13198줄). 우리는 내원내역 목록이 가려지면 멈추므로(`VisitOpener`) 크롬이 목록을 가리면 시작하자마자 멈춘다
- **권한을 늘리지 않고 된다**: `chrome.windows`는 manifest 권한이 필요 없고(`tabs`는 탭의 주소·제목에만 필요), 웹 연결의 `port.sender.tab.windowId`로 그 창만 고를 수 있다. 그래서 `permissions`는 `["nativeMessaging"]` 그대로다(공식 문서로 확인, 실제 크롬에서는 의원 PC 시험으로 확인)
- 신호는 새 메시지를 만들지 않고 `bit.input`의 첫 `progress`를 쓴다. 이 숫자는 확인을 지난 뒤에만 온다. 확장은 답을 읽기만 하고 고치지 않는다. 끝(`end`·`error`·연결 끊김)에 전 상태로 되돌린다
- 도우미는 첫 사람 앞에서 목록이 보일 때까지 3초까지 기다린다 **(Claude 판단)**. 확장이 옛 판이거나 실패해도 안전하다: 가려져 있으면 지금처럼 멈춘다
- 버린 길: 도우미가 크롬 창을 직접 내리기. 크롬이 넘기는 `--parent-window`는 서비스 워커에서 0이라 어느 창인지 알 수 없다. 이름으로 찾으면 다른 크롬 창까지 내려간다. **확장이 창을 내리는 것은 2026-11-01 사용자 결정이다**
- 비용: 확장을 웹스토어에 다시 올려야 한다

### 19-9. 내원 간격 문장 (TASK-13·TASK-14)
- 원본 `computeIntervals`는 불러온 처방만 본다. 원본은 늘 한 달을 받고, 우리는 하루도 불러올 수 있어(AC-013.2) 앞 내원을 못 보고 간격 문장이 빠질 수 있다
- 가장 작은 고침 **(Claude 판단)**: `claim.month`는 'E의 한 달 전 같은 날'(그달에 없으면 말일)과 고른 시작 가운데 빠른 날부터 E까지 읽는다. 원본 '청구메모용 1개월 받기'와 같은 범위다. 한 달 전까지는 많아야 32일이고 고른 기간은 35일 이하라 늘 35일 안이다(AC-008.1). 12개월 이력으로 계산하지 않는다: 원본이 못 보는 더 옛날 내원까지 보여 결과가 달라지고, 이력에는 급여 여부가 없다
- Worker의 `check`가 받는 `visible`(고른 기간)로 보기 모양을 자른다. 그래서 화면·엑셀·`dayCounts(view)`는 고른 기간만 보고, 앞쪽 날은 '아직 불러오지 않은 날' 그대로다. 비용: 하루만 골라도 한 달 치를 읽어 불러오기가 그만큼 걸린다(원본과 같음)

### 19-10. 일부러 원본과 다르게 둔 것
- 저장 안 한 처방 창: 원본처럼 [확인]을 누른다(AC-017.12, 2026-11-03 사용자 결정). 3번까지인 것은 원본과 같다. 다른 점: 원본은 열기를 기다릴 때만 눌렀고 우리는 사람 시작·쓰기 직전에도 누르며, 쓰기 직전에 눌렀으면 환자와 칸 글을 다시 확인하고, 쓰다 멈춘 사람은 누르지 않고 멈춘다
- 다른 메모는 사람마다 묻지 않고 바꾼다(원본은 사람마다 승인했다, 2026-11-02 사용자 결정). 바꾸기는 19-6의 표뿐이다
- 입력 길은 `range_bridge` 하나다
- 결과 엑셀은 자동으로 만들지 않는다(원본은 자동 저장, 사용자 결정)
- 약은 19-4

### 19-11. 의원 PC에서만 볼 수 있는 것 (Phase 3 시험 목록에 더함)
- 제외 체크를 `Patterns.Toggle`(안 되면 `BM_GETCHECK`)로 맞게 읽는가, 조회 모드의 메모 칸 상태, 내원 수와 내원내역 창의 줄이 맞는가, 크롬 창 내리기·되돌리기, 실제 47 표의 칸 이름, 묻지 않기가 청구 창을 닫으면 꺼지는가, 실제 처방 목록의 코드가 모두 `code` 허용 모양(AC-036.1)인가, `replaces`가 화면 칸 글과 같게 읽히는가(`replaces`는 DB 값이고 화면 칸과 견준다. 원본은 화면 값을 썼다. 다르면 '입력 직전 변경됨'으로 건너뛴다. 2026-11-02부터 이것이 기본 길이라 가장 먼저 본다: 다르면 아무도 바뀌지 않는다), 32비트(x86) 도우미가 `BITDoctorOrder.exe`를 찾는가(TASK-17 첫 판부터 남은 확인)

### 19-12. 비트 메모 전체 불러오기 (TASK-16·TASK-18)
- 2026-11-01 사용자 결정: 원본처럼 비트에 저장된 메모를 모든 진료의 우리 메모 옆에 보여 준다(`mx999` 7153~7285줄). 입력 방식 칸의 '불러온 기간' 글 바로 아래 단추가 `claim.memos`만 고른 기간으로 다시 읽는다(승인 목업. 원본은 위쪽 자료 연결 줄이다). 읽기만 하고 비트 로그인 창이 없다. 달 자료와 점검 결과는 그대로이고 비교·입력 대상·날짜별 수만 새로 만든다
- **승인 목업에서 받아들인 것**: 두 메모는 사람 줄을 눌러야 열리고 여러 사람을 함께 열어 둘 수 있다. 다만 `다름`인 줄은 비트에 있는 메모와 우리 메모가 누르지 않아도 늘 나란히 보인다: 빠지는 사람의 '다른 메모 있음'과 입력할 사람의 '메모 바꿈'이다(AC-018.14, 칩 둘을 하나로 한 것은 2026-11-02 사용자 결정). 곧 덮어쓸 비트 메모를 누르지 않고 본다. 아직 안 불러온 채 줄을 처음 열면 저절로 읽는다(원본과 같음, 실패하면 다시 읽지 않는다). 실패하면 [불러오지 못함] 옆에 지난번 비교를 함께 보인다. 불러온 내용은 그 시각의 내용이다: 입력을 마친 사람은 다시 불러오기 전까지 카드가 그대로이고 카드 안의 글로 알린다. 입력이 끝나도 저절로 다시 읽지 않는다. 읽는 동안 [비트 메모 전체 불러오기]와 [이 메모로 바꾸기]는 누를 수 없다. '비트 메모를 읽지 못함' 묶음의 사람은 다시 불러오기가 성공해도 [불러오지 못함]으로 남고 새 [자료 불러오기]로만 다시 본다(AC-016.7)
- **[자료 불러오기]와의 관계 (Claude 판단)**: 목업은 [자료 불러오기]를 그리지 않았지만 비교가 있는 처음 화면을 '아직 불러오지 않음'으로 그렸다. 명세에서 비교는 [자료 불러오기]의 `claim.memos`로 만든다(AC-013.2). 그래서 그 읽기는 비교와 '다른 메모 있음' 줄에 쓰고, 카드의 '받음'은 이 단추나 줄 열기로 읽었을 때부터 친다(AC-018.24). 첫 읽기가 실패하면 [자료 불러오기] 때 받은 내용을 보인다. 읽기가 한 번 더 들지만 목업의 흐름 그대로다
- **입력을 시작하는 단추 (Claude 판단)**: 읽는 동안 [비트에 입력]·[빼고 N명 입력]·[다시 하기]·[이어서 하기]·[이어서 입력]·[직접 확인했어요]를 모두 막는다(AC-018.24). 안전 규칙은 아니다: 도우미가 쓰기 바로 앞에 칸을 다시 읽는다(AC-016.8). 입력하는 동안 목록이 바뀌거나 카드의 '뒤에 입력' 안내가 틀리지 않게 하는 작은 더함이다. 목업은 [이 메모로 바꾸기]만 막았다
- **번호 (Claude 판단, 가장 작은 길)**: `load` 약속(6-2, AC-013.10·AC-013.11·AC-016.5)은 그대로 둔다. `loadStart`는 전에 불러온 달을 버리므로 쓸 수 없고, 같은 `load`로 `loadPart`를 두 번 보내면 늦게 온 옛 답이 새 답을 덮는다. 그래서 `claimLoad.ts`에서 `run`을 받아 `{type: 'memoReloadStart', run}`을 먼저 보내고, stream이 끝나면 `loadPart`에 `run`을 실어 보낸다(`loadStart`·`month` 짝과 같은 모양). Worker는 `assemble.take`가 끝난 뒤에 `load`와 `run`을 보고(`jobs.ts`의 `month`와 같음) 둘 다 마지막 번호일 때만 자료를 바꾼다. 옛 stream도 끝나면 보내 모아 둔 글자를 찾아 버린다. 새 [자료 불러오기]는 `load`가 바뀌어 진행 중인 것을 저절로 버린다(AC-016.7)
- **늦게 온 `run` 없는 조각 (Claude 판단)**: 그 `load`에서 `memoReloadStart`를 받은 뒤에 온 `run` 없는 `part: 'memos'`는 조각을 찾아 버리고 자료를 받지 않으며 `ok: false`다. `part: 'store'`는 그대로다. 새 `loadStart`가 이 표시를 지운다(AC-016.7)
- 읽는 동안 단추를 막는 것은 승인 목업과 원본대로 한다(AC-018.24). 버린 길: 원본처럼 그 막음만으로 끝내고 번호를 두지 않기. 화면을 다시 그리면(AC-013.12) 막음이 풀리는데 stream은 살아 있어 옛 답이 들어온다
- **실패 때 전 결과를 남긴다 (Claude 판단: 까닭)**: 원본처럼 "아래는 HH:MM에 불러온 내용"을 적는다. 읽은 적이 아예 없으면 보일 내용이 없어 오류 문구만 적는다(AC-018.25). 상태 줄도 같다: 그때는 "불러오지 못했어요. {오류 문구}"까지만이다(AC-018.24). 남긴 결과는 화면과 묶음 고르기에만 쓰이고 쓰기를 정하지 않아 안전하다. 도우미가 쓰기 바로 앞에 칸을 다시 읽기 때문이다(AC-017.3). 옛 `비트에 없음`에 메모가 생겼으면 건너뜀(묻지 않기가 켜져 있으면 사이트 자료와 상관없이 19-6 표), `replaces`로 보낸 글이 바뀌었으면 건너뜀, 옛 `같음`은 묶음에 없어 쓰지 않는다. 일부만 온 답은 섞지 않고 [바꾸지 않기]와 승인도 그대로 둔다(AC-016.8·AC-018.14)
- **원본과 다른 점 (Claude 판단)**: 카드의 같음·다름은 AC-016.2의 글자 그대로 비교다. 원본 카드는 글자·숫자만 견주어(`norm`) 쓰기 직전 비교와 어긋난다. 목업 안의 코드도 원본처럼 견주지만 보이는 예시로는 차이가 없고, `같음`이면 입력하지 않으므로 글자 그대로를 지킨다. 차트번호가 다른 줄은 원본의 '비트에 없음'이 아니라 `조회 못함`이다(AC-016.6)
- 나눔: 자료(Worker의 `run`·실패 처리)는 TASK-16의 웹 쪽, 단추·카드·`claimLoad.ts`의 `run`은 TASK-18이고 입력 쪽 승인 목업(TASK-18 링크)대로 만든다

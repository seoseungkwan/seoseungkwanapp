# 설계: 청구 사전점검 (양지바른 사전점검 가져오기)

> 근거: `requirements.md`, `docs/precheck/PRD.md`(무엇을·왜), `docs/precheck/plan.md`(어떻게·순서), 루트 `plan.md` §0·§4·§5·§10, ADR-003·004·005·016·017·018·019.
> 옮기는 원본: GitHub `seoseungkwan/shared` main `YangjiBareun_사전점검/` 커밋 `2a1069b`(README 1.24.5). 아래에서 "원본"이라 부른다. 원본에 실제 환자 정보는 없다.
> 화면 문구·배치는 Phase 0 목업(승인본, Phase 0 Step 2 `mockups`). 모양 규칙은 `docs/UI_GUIDE.md` '앱 화면'. 이 문서는 화면의 내용(무엇이 보이고 어떤 단추가 있나)만 정한다.
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

- 환자 자료는 도우미 → 확장 → 통로 → Worker로만 다닌다. 화면에는 Worker가 만든 보기 모양만 간다. 서버에는 건수와 설정만 간다 (ADR-017·018)
- 서버 경로는 늘리지 않는다. 설정·건수는 브라우저가 Supabase(RLS)에 바로 읽고 쓴다 (ADR-004·018)
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
| 자동 입력 | `vendor/secure_bridge/LegacyAutomation/UChartAutomation.cs`·`NativeTarget.cs`·`MemoApproval.cs` (FlaUI 4.0) + 묶음 고리는 `mx999_v22.html`의 `autoOne` | C# + JS |
| 점검 규칙 262개 | `tools/precheck_rules.json` + `tools/claim_precheck.py`가 만든 `<script id="new-medicore-precheck">`(`evaluate`·`collect`·`statusOf`, 조건 종류 18가지) | JSON + JS |
| 추천 상병·상병 확인 | `<script id="new-medicore-dx-recommend">`(`recommend`·`issues`·`needsCheck`·`missingDx`) + `assets/knowledge/dx_flags.json` | JS |
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

- 원본의 열린 포트·토큰(`--medicore-secure`, Kestrel), 파이썬 중계(`medicore/claim_import.py`), 양지바른 설정 맞추기, 덮어쓰기 승인(`confirmOverwrite`)은 옮기지 않는다
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
│   │                               # NativeTarget · UChartAutomation(FlaUI) · ConfirmWindow · ProgressWindow (WinForms)
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
│   ├── tables.ts · shape.ts · rules/ · dx/ · memo/ · memoCompare.ts · excel.ts · counts.ts · sam/ · followup/
├── lib/analytics/                  # [환자 구역, 기존] rxTrend.ts · revisit30.ts · rxVisitSplit.ts (TASK-28·29)
├── lib/report/reportText.ts        # 보고 문장(집계 숫자만 받음) (TASK-30)
├── lib/storage/                    # claimSettings.ts(설정 3가지) · claimCounts.ts(건수 3가지) (TASK-12·19)
├── lib/backup/                     # 백업 JSON·되돌려 넣기 SQL (TASK-32)
├── lib/messages/fill.ts            # 문자 문구 채우기(<<DATE>>) (TASK-25)
├── workers/precheck.worker.ts      # [환자 구역] Worker 입구
├── workers/precheck/               # assemble(조각 모으기) · jobs(시험이 바로 부르는 순수 함수)
├── components/claim/               # 청구 화면 (TASK-6·13·18·19·22). rows/ = [울타리] 환자 줄
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
  | { v: 1; id: string; type: 'progress'; done: number; total: number }  // 입력 진행(숫자만. 통로가 0 ≤ done ≤ total ≤ 500 정수인지 검사, AC-004.10)
  | { v: 1; id: string; type: 'error'; code: string /* 'E-…' */ }
```
- 웹 → 도우미로 가는 큰 자료(작업 저장·입력 묶음)는 메시지 하나(64MiB 이하)로 보낸다. 웹 쪽은 나누지 않는다
- 그 봉투는 `SendRequest`(`args: {payload}`) 모양이다. 통로는 `payload` 글자를 그대로 넣고(AC-004.9), 도우미가 `payload`를 풀어 명령 표의 안쪽 모양으로 검사한 뒤 처리기에 넘긴다(AC-001.2)

### 4-3. 명령 표 (`src/lib/bridge/commands.json`)
| cmd | 하는 일 | 답 | 환자 자료 | PC 확인 창 |
|---|---|---|---|---|
| `hello` | 버전 | result `{ helperVersion, protocol }` | 아니오 | — |
| `bit.check` | 비트 찾기 → DB 읽기 → 등록한 병원인지 | result `{ steps: [{ name, ok, code? }], registered, hospitalName?, institutionCode? }` | 아니오 | — |
| `bit.register` | 처음 등록: 비트 로그인 창 → 범위·기관기호 확인 → 저장 | result `{ registered }` | 아니오 | 예 |
| `claim.dates` | 기간의 날짜별 외래 진료 수·비트 메모 있는 수 | result `{ days: [{ date, visits, memoInBit }] }` | 아니오(숫자) | — |
| `claim.month` | 기간의 증상·상병·소모 표 + 12개월 이력 + 상병 추세 + 처방 목록 | chunk … end | 예 | — |
| `claim.memos` | 기간의 비트 청구메모 | chunk … end | 예 | — |
| `store.load` | 저장해 둔 작업(월 단위) | chunk … end | 예 | — |
| `store.save` | 작업 저장 | result `{ saved: true }` | 예(보내는 쪽) | — |
| `bit.input` | 메모 묶음 입력 | progress … chunk(사람마다 결과) … end | 예 | 예(묶음마다) |
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
`E-EXT-MISSING`(확장 없음) · `E-HELPER-MISSING`(도우미 없음) · `E-HELPER-OLD` · `E-EXT-OLD` · `E-BRIDGE-BUSY`(다른 창에서 작업 중) · `E-BRIDGE-DISCONNECTED` · `E-BRIDGE-REJECTED` · `E-BRIDGE-BAD-REPLY` · `E-HELPER-BAD-MESSAGE` · `E-HELPER-UNKNOWN-COMMAND` · `E-BIT-NOT-FOUND` · `E-BIT-DB-FAILED` · `E-BIT-NOT-REGISTERED` · `E-BIT-HOSPITAL-MISMATCH` · `E-BIT-READ-FAILED` · `E-BIT-EXPORT-FAILED` · `E-CLAIM-PARTIAL` · `E-RULES-LOAD-FAILED` · `E-SETTINGS-FAILED` · `E-STORE-FAILED` · `E-STORE-BROKEN` · `E-BIT-UI-CHANGED` · `E-BIT-UNSAVED-RX` · `E-INPUT-STOPPED` · `E-SAM-NOT-FOUND` · `E-COUNTS-FAILED` · `E-BACKUP-FAILED`

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
- 받는 일: 통로 포트(`bridge-port`로 받은 `MessagePort`)에서 `chunk`·`end`·`abort`·`sent`, 화면에서 `load`(기간·설정·표 불러오기), `check`(점검), `editMemo`, `buildInputBatch`, `applyInputResults`, `excel`, `samMatch`, `followup`, `stats`
- 보내는 것: 화면에는 보기 모양(`ClaimView`·`MonthCloseView`·`ContactView`·`StatsExtrasView`)·서버에 올릴 건수·엑셀 바이트·보내기 결과(됨·오류 번호). 통로 포트에는 도우미에 보낼 글자(`store.save`·`bit.input` payload) — 메모 저장·입력 묶음·연락 표시·설정 사본은 Worker가 글자를 만들어 포트로 바로 보낸다(화면을 지나지 않는다)
- `jobs.ts`의 순수 함수를 부르기만 한다(시험은 jobs를 바로 부른다, `analyzeFiles`와 같은 방식)

### 6-3. 계산 모양 (TASK-9, `types/precheck.ts`)
```ts
type Visit = { key: string /* 원본 v.id */; chart: string; date: string /* YYYY-MM-DD */; name: string; lines: string[] /* 증상 글 */; rx: RxLine[]; dx: DxLine[]; memosInBit: string[] }
type RxLine = { code: string; name: string; qty: number; benefit: string; pay: string }
type DxLine = { c: string; n: string; m: true | false | 'x' }   // 주·부·제외 (원본 그대로)
type History = Map<string /* chart */, Map<string /* date */, { codes: string[]; memo: string }>>
type ClaimMonth = { period: { from: string; to: string }; visits: Visit[]; history: History; historyRange: { from: string; to: string }; dxTrend: DxTrend; catalog: CodeMap }
type Finding = { visitKey: string; ruleId: string; grade: '확인필요' | '알림' | '참고'; message: string; detail: string; basis: Basis[] }
```
- 원본의 전역 값(`VISITS`·`RXDATA`·`NEW_MEDICORE_DIAGNOSES`·`CODEMAP`·`DRUGINFO`·`HIST.byChart`)을 위 모양 하나로 묶어 함수에 넘긴다. 함수 안 계산은 원본 줄 그대로 옮긴다

### 6-4. 날짜 목록 (TASK-13)
- 재료: 도우미 `claim.dates`(최근 60일, 날짜별 외래 진료 수·비트 메모 수) + 서버 `claim_day_counts`(불러와 점검한 날의 메모 필요 수·입력 수)
- 진료 0건인 날은 뺀다. 순서: ① 덜 끝난 날(메모 필요 > 입력, 또는 아직 불러오지 않은 날)을 오래된 날부터 ② 다 끝난 날을 최근 날부터
- 기간은 달을 넘겨 고를 수 있다(예: 10/30~11/2). 한 번에 35일까지다(12개월 이력까지 원본 한도 400일 안, AC-008.1). 월말 마감은 달마다 따로 한다

### 6-5. 설정이 바뀌었을 때
- 청구 화면은 점검에 쓴 설정을 기억한다. 창에 초점이 돌아올 때와 [비트에 입력] 직전에 서버 설정을 다시 읽어 다르면 "설정이 바뀌었어요, 다시 점검하세요" 띠를 띄우고, [다시 점검]을 누르기 전까지 [비트에 입력]을 막는다 **(Claude 판단)**

## 7. 화면 (내용만, 배치는 목업 승인본)
| 화면 | 보이는 것 | 단추 | 상태 |
|---|---|---|---|
| 설치·연결 확인 `/claim/setup` | 확장·도우미·비트·기관기호 단계별 ✓/✗와 오류 번호 | [연결 확인] · [처음 등록] · [다시 등록](병원이 다를 때) · 확장 설치 링크 · 도우미 내려받기 안내 | 확장 없음 · 도우미 없음 · 업데이트 필요 · 새 도우미 있음 · 연결됨 · 다른 창에서 작업 중 |
| 청구 `/claim` | 날짜 목록(6-4) · 기간 · 환자별 경고(확인 필요·알림·참고)와 고시 근거 · 추천 상병 · 메모 초안 | [자료 불러오기] · [엑셀 내려받기](규칙별·환자별) · [비트에 입력] · [다시 하기] · [다시 점검] | 불러오는 중 · 일부만 옴(멈춤) · 설정 바뀜 · 입력 중(진행 숫자) · 결과(완료·확인 필요·건너뜀+이유) |
| 월말 마감 `/claim/close` | 달 고르기 · 미완료 · 빠진 것 · 확인 표시 남은 것 · SAM 파일 이름·받은 시각 | [청구 파일 불러오기] · 줄마다 청구 화면으로 가기 | 파일 없음 · 대조 끝 |
| 환자 연락 `/contact` | F/U 명단 · 정기 주사 명단(이름·전화·다음 날짜·내용·지남/남은 날) · 연락 표시 | [문구 복사] · [연락함] 표시 · 기간 고르기 | 대상 없음 · 불러오는 중 |
| 통계 추가분 `/stats` | 처방 추세 그래프(일·주·월, 기간 비교, 건수·금액·소모량) · 신환 30일 재방문·첫 재방문 날수 · 처방별 신환·재진 · 보고 문장 | [문장 복사] · 자료 고르기(도우미·파일 올리기) | 파일에는 금액·소모량이 없음 안내 · 확인 필요 금액 |
| 설정 `/settings` | 점검 규칙(켜기·끄기·등급·근거) · 병원 문구 · 상병 연결표 · 문자 문구 | [저장] · [기본값으로] · [백업 내려받기] | 저장 실패(값 유지 + [다시 저장]) |
| 밖에서 보는 건수 (`/claim`, 확장 없는 곳) | 날짜별 메모 남은 수 · 월말 마감 남은 일 · 연락 남은 건수, 각각 마지막으로 바뀐 시각 | 없음(보기만) | 아직 올린 건수 없음 |

## 8. DB 표 · RLS · 제약

### 8-1. 설정 (`20261030000000_precheck_settings.sql`, TASK-12)
```sql
create function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
  as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
create function public.touch_updated_at() returns trigger ...   -- update 때 updated_at = now()

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
- 처음 등록(`bit.register`): 비트 로그인 창(원본 `BITUserLogIn` `bitDisplayDialog`) → 그 사용자의 병원 범위(`ValidateScope`) → 기관기호(`VerifyInstitutionNumber`, 8자리) → **PC 확인 창** "이 병원으로 등록할까요? ○○의원 · 기관기호 1234****" → [확인]이면 등록 파일(DPAPI)에 저장
- 다시 등록: 이미 등록돼 있어도 같은 길로 다시 등록할 수 있다(설치 화면의 [다시 등록], `E-BIT-HOSPITAL-MISMATCH`일 때). 확인 창에 전 등록 값과 새 값을 함께 보인다. 기관기호가 같으면 프로필 ID를 그대로 두어 작업 저장을 이어 읽고, 다르면 새 ID라 전 병원의 작업 파일은 읽지 않는다(9-3, AC-005.5)
- 매번: 모든 읽기·입력 명령 전에 등록 파일과 비트 DB의 기관기호·범위·설치 위치·서버·DB 이름을 비교한다(원본 `VerifyCurrentInstitution`). 다르면 `E-BIT-HOSPITAL-MISMATCH`로 멈춘다
- 기관기호는 서버에 올리지 않는다(2026-10-28 사용자: 요양기관번호는 받지 않는다). 화면에는 뒤 4자리를 가려 보인다 **(Claude 판단)**

### 9-2. 읽기 (TASK-8·16·20·23·27)
- 한 달 자료: `VendorGridExport`가 원본 `NativeReportAdapter`처럼 비트 통계 화면(83 증상·83D 상병·47 소모)을 숨겨서 열고 날짜를 넣어 표를 읽는다. 표 칸 이름은 비트 화면의 것을 그대로 쓰고, `GridRows`가 원본 `medicore/claim_import.py`·`mx999 build/parseRx`가 읽는 칸만 남긴다
- 12개월 이력: `RxHistory.VisitSql`·`CodeSql` 그대로(원본 한도 `MaximumDays` 400일). 기간 시작 365일 전부터 기간 끝까지(원본 `loadHistory`). `claim.month` 기간을 35일 이하로 막아 이 범위가 늘 400일 안에 든다. 나눠 읽지 않는다
- 이미 있는 메모: `ClaimMemoHistory.RowsSql` 그대로(최대 300,000줄, 메모 4,000자)
- 날짜별 수(`claim.dates`): 원본 방문 조건(`OcmPatTyp='O'`, `OcmRsuYon<>'O'`, 범위)을 그대로 쓴 세기 SQL. 숫자만 돌려준다
- 시간 제한은 원본 값(메타 15초, 자료 120~150초). 넘으면 `E-BIT-READ-FAILED`
- **일부만 오면 멈춘다**: 표 하나라도 실패하면 그 명령 전체가 `error`다. 조각을 보내다 실패하면 `end` 대신 `error`를 보낸다

### 9-3. 작업 저장 (TASK-15)
- 위치: `%LOCALAPPDATA%\Seoseungkwan\PrecheckHelper\data\` (프로그램 폴더와 따로, 업데이트해도 남음)
- 파일: `registration.dat`(등록 병원) · `work-YYYY-MM.dat`(그 진료 달의 고친 메모·완료 표시·입력 기록) · `contact.dat`(연락 표시) · `settings.dat`(서버 설정 사본. 서버가 잠깐 안 될 때 '마지막으로 받은 설정'으로 쓴다, PRD 8)
- 암호화: DPAPI `CurrentUser` + 고정 entropy, 머리 `PRECHECK-STORE-1\n`. 쓰기는 임시 파일 → 바꿔치기(`File.Replace`, `.bak` 하나 둠)
- 깨진 파일: `E-STORE-BROKEN`. `.bak`이 있으면 그것으로, 없으면 "새로 시작" 안내(비트 비교가 두 번 입력을 막는다)
- 13개월 지난 `work-*.dat`는 지운다 **(Claude 판단, 필요한 것만 남김)**
- 저장 파일의 병원이 등록 병원과 다르면 읽지 않는다

### 9-4. 자동 입력 (TASK-17)
- 순서(묶음 하나):
  1. 등록 병원 확인(9-1) → 비트 화면 지문 확인(`UiFingerprint`) → 묶음 검사(500명 이하, 날짜·차트번호 모양, 원본 `validate_request` 규칙)
  2. **PC 확인 창**: 도우미가 묶음에서 직접 만든 글 "10/27~10/29, 32명 입력할까요? ○○의원" + [확인]·[취소]. 5분 안에 답이 없으면 취소. 웹이 보낸 글은 보이지 않는다
  3. 사람마다(원본 `autoOne` + `UChartAutomation`): 내원내역에서 차트번호로 열기 → 이름·차트번호·날짜 검사 → **비트에 이미 메모가 있으면** 같으면 '완료(이미 입력됨)', 다르면 '건너뜀: 이미 있음'(덮어쓰지 않는다) → 쓰기(`EM_REPLACESEL`, 안 되면 `ValuePattern`) → 다시 읽어 같은지 → 저장 단추 → 다시 읽어 같은지
  4. 사람마다 기록(`Journal`): 쓰기 전 `writing`, 확인 뒤 `done`/`skipped`/`check`. 진행은 숫자만 웹에 보낸다
- 멈춤: 비트 화면 지문이 다름(칸 ID가 없거나 여러 개, `E-BIT-UI-CHANGED` + 칸 ID 목록) · 저장 안 한 처방 창(`E-BIT-UNSAVED-RX`, 누르지 않는다) · 원본 fatal 문구(창을 찾지 못·최소화·가려져 등) · 3번 잇따라 실패(`E-INPUT-STOPPED`) · 진행 창의 [멈추기](지금 사람까지 하고 멈춤)
- 결과 세 가지: **완료**(입력·이미 입력됨) · **확인 필요**(쓴 뒤 다시 읽은 값이 다름·저장 확인 못함·멈춰서 미처리) · **건너뜀**(이유: 이미 있음·내원일 없음·환자 불일치·검색 결과 여러 줄 등 원본 문구)
- **이어서 하기**: 다시 열면 `writing`·미처리 줄을 비트와 비교한다. 비트 메모가 우리 글과 같으면 완료, 비었으면 다시 할 수 있음, 다르면 건너뜀(이미 있음)
- 지문: `BITDoctorOrder.exe` 프로세스(원본 `NativeTarget` 규칙), '외래진료실' 창 하나와 칸 `txtChtNum`·`lbPatName`·`txtBilCmt`·`btnBilCmtModify`, '내원내역' 창 하나와 칸 `cbSch`·`txtSch`·`btnSch`·`ctgMain`. 모두 정확히 하나씩
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
- **비교**: 우리 함수 결과를 골든과 깊은 비교(순서까지). 일부러 다르게 한 것은 골든 파일의 `knownDiffs`에 이유와 함께 적는다(예: 덮어쓰기 없음). 적지 않은 차이는 실패다
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
- **덮어쓰기 없음**: 비트에 다른 메모가 있으면 늘 '건너뜀: 이미 있음'. 고치려면 비트에서 손으로 한다 (PRD 7)
- **창 하나**: 확장이 웹 연결을 하나만 받는다. 두 번째 창은 `E-BRIDGE-BUSY`
- **환자 자료 답은 늘 조각으로**: 통로 코드가 환자 자료를 풀 일이 아예 없게 한다
- **규칙표 등은 Worker의 `import()`**: 청구 화면을 열 때만 받고, 구역 안 `fetch` 금지를 지킨다
- **설정 표 모양**: 규칙은 줄마다(등급을 DB 제약으로), 병원 문구·상병 연결표는 원본 설정 모양 그대로 jsonb 하나(원본 `validate`로 검사 + 크기 제한), 문자 문구는 줄마다
- **상병 연결표**: 원본 추천 상병의 직원 연결표(`snapshot.rules`)를 병원 설정에 함께 둔다. 사용자가 말한 설정 셋(규칙·병원 문구·문자 문구)에 붙여 둔 것이다
- **원본 필터 단추 편집(`claim_code_chips`)은 옮기지 않는다**. 필터는 목업에 있는 것만
- **설정 바뀜**: 초점이 돌아올 때·입력 직전에 다시 읽어 비교. 실시간 구독은 쓰지 않는다
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
- **FlaUI net48**: FlaUI 4.0.0을 net48로 쓰는 빌드를 Phase 1 첫 Actions 빌드에서 확인한다. 안 되면 사용자에게 알린다(런타임을 바꾸는 큰 결정)
- **자동 입력**: 가장 큰 작업이다. Phase 3 전에 시험용 환자 한 명으로 짧게 해 본다(plan.md §7)
- **웹스토어 심사**: 며칠 걸린다. Phase 1 시작 때 사용자가 신청한다. 그 전에는 '압축 풀린 확장 불러오기'로 시험한다(manifest `key`로 같은 ID)
- **리눅스에서 못 돌리는 코드**: Windows 부분은 Actions와 의원 PC 시험에 기댄다. Phase마다 의원 PC 시험 목록을 드린다
- **골든 범위**: 원본이 화면 전역 값에 기대 있어, `vm`으로 꺼내 돌리는 데 손이 간다. 꺼내지 못한 함수가 생기면 그 함수의 원본 시험 사례로 대신하고 `knownDiffs`에 적는다
- **통계 화면 순서**: 통계 탭의 기본 화면(통계 명세)이 Phase 6 전에 없으면, 통계 탭은 이 기능의 추가분과 자료 고르기만 먼저 보인다(사용자 확인 필요, 17절)
- **정기 주사 36개월 읽기**: 원본은 36개월 기록을 쓴다. 비트 통계 화면으로 36개월을 읽으면 오래 걸릴 수 있다. Phase 5 Step 0에서 시간을 재고, 너무 길면 달마다 나눠 읽는다(조각마다 실패하면 전체를 멈추는 규칙은 같다)
- **30분 자동 로그아웃**: 청구 작업 중 로그아웃되면 메모리 자료가 사라진다. 고친 메모는 도우미에 있어 다시 불러오면 이어진다(PRD 8)
- **입력 중 도우미가 끝남**: 크롬이 연결을 닫은 뒤 도우미 프로세스를 강제로 끝낼 수도 있다(윈도우). 그래도 쓰기 전 `writing` 기록과 이어서 하기(비트 메모와 비교, AC-017.7)가 두 번 입력·덮어쓰기를 막는다. Phase 3 의원 PC 시험에서 입력 중 크롬을 닫아 도우미가 지금 사람까지 마치고 끝나는지 본다

## 17. 사용자에게 물은 것 (답 받음)
1. **통계 탭 순서**: Phase 6(통계 추가분)을 할 때 통계 기본 화면이 아직 없으면, 통계 탭을 추가분만으로 먼저 열어도 되나요? 아니면 통계 화면 명세를 먼저 할까요? (Claude 기본: 추가분만 먼저) → **Claude 판단으로 추가분만 먼저 연다**
2. **화면의 환자 이름·전화**: 청구·연락 화면에 이름·전화번호를 그대로 보여도 되나요? (그 PC 화면에만 보이고 서버에는 안 갑니다. Claude 기본: 그대로) → **사용자 결정(2026-10-30): 그대로 보인다**. 화면 목업도 같은 날 승인

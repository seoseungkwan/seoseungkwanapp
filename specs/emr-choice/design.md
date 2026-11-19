# 설계: EMR 고르기와 의사랑·이지스 폴더 준비 (emr-choice)

기준 갈래 `feat-emr-choice`(운영 `887ad320`에서). 시안 `docs/mockups/emr-choice/` 승인(2026-11-19).
지키는 것: ADR-033(병원 정보 한 곳, 고치기는 원장만·데스크는 읽기만), ADR-004(서버 코드 없음), ADR-020(환자 자료 구역 — 이번에 손대지 않음), guard는 병원 정보 이름만 읽는다(CLAUDE.md) → EMR은 화면 쪽 `useClinicProfile`로 읽는다.

## 1. 자료 모양 — `src/types/clinicProfile.ts`, `src/lib/clinic/emrText.ts`(새)
- `types/clinicProfile.ts`: `EMR_KINDS = ['bit', 'uisarang', 'egis', 'other'] as const`, `type EmrKind`, `DEFAULT_EMR: EmrKind = 'bit'`, `ClinicProfile`에 `emr: EmrKind`(꼭 있음).
- `lib/clinic/emrText.ts`(순수 글자, React 없음): `EMR_LABEL: Record<EmrKind, string>`('비트'·'의사랑'·'이지스'·'그 밖의 EMR'), `isEmrKind(value: unknown): value is EmrKind`, `emrWaitTitle(emr: Exclude<EmrKind, 'bit'>): string`(AC-7102.3), `EMR_WITH_RO: Record<Exclude<EmrKind, 'bit'>, string>`('의사랑으로'·'이지스로'·'그 밖의 EMR로').
- `ClinicProfile` 글자 그대로 만드는 시험 파일들(`logoPath:`가 있는 곳)은 `emr: 'bit'`를 더해 타입 검사를 지나게 한다(TASK-3).

## 2. 읽기·저장 — `src/lib/storage/clinicProfile.ts`
- `COLUMNS`에 `emr`. 읽기: `emr: isEmrKind(row.emr) ? row.emr : DEFAULT_EMR`. `defaultProfile().emr = DEFAULT_EMR`. 저장 `body`·`clean`에 `emr`. `checkProfile`에 AC-7102.1 문구.
- SQL을 넣기 전에 웹이 나가면 `select`가 칸 없음으로 실패해 병원 정보 전체가 'failed'(기본값)가 된다 → 운영 순서는 SQL 먼저(6절).

## 3. 병원 정보 칸 — `src/components/settings/ClinicProfileCard.tsx`
- '호칭' `Field` 바로 아래 `Field title="쓰는 EMR" help="진료 자료를 읽어 오는 연결은 지금 비트만 돼요. 의사랑·이지스는 준비하고 있어요."`, 호칭과 같은 `ds.segment` 단추 넷(`EMR_KINDS` 차례, 글은 `EMR_LABEL`, `aria-pressed`), 폰은 `max-md:grid-cols-2`. 누르면 `edit((d) => ({ ...d, emr }))`. 저장은 지금 흐름 그대로.

## 4. 대시보드 — `src/components/dashboard/briefing/DashboardHome.tsx`, `src/components/dashboard/live/BitDashboard.tsx`
- `DashboardHome` props에 `emr?: EmrKind`(없으면 'bit'). 연결 전(`report == null`)이고 `emr !== 'bit'`이면: 날짜 줄 → `EmrWaitSentence`(h1 `emrWaitTitle(emr)` — BigSentence와 같은 글 모양, p AC-7103.1 글, `Link href="/settings"` `ds.button.secondary` '쓰는 EMR 바꾸기'). `ConnectSteps`·`StickyConnect`·BigSentence의 안심 줄은 그리지 않는다. 그 아래 `ReadyNowRow`([비트 PC 연결부터] 포함)·`analysis`·`FeatureIndex`('연결 먼저' 포함)는 다른 탭 단추처럼 그대로(시안 ④ '가장 적게 바꾸는 길', AC-7103.1). 연결 뒤 화면은 emr과 상관없이 그대로.
- `BitDashboard`: 이미 부르는 `useClinicProfile()` 결과를 한 번 받아 `emr={clinic.state === 'ready' ? clinic.profile.emr : 'bit'}`를 넘긴다(호칭 쓰임은 그대로).

## 5. 비트 PC 연결 화면 — `src/components/claim/setup/SetupScreen.tsx`
- 다른 훅 뒤에 `const clinic = useClinicProfile()`, `const emr = clinic.state === 'ready' ? clinic.profile.emr : 'bit'`. 모든 훅을 부른 뒤, busy 갈래보다 먼저 `if (emr !== 'bit') return (<div className="flex flex-col gap-4 max-md:gap-3"><Head desk={desk} /><EmrWaitBox emr={emr} desk={desk} /></div>)`.
- `EmrWaitBox`(같은 파일): `ds.panel` 안쪽 여백, 제목 `emrWaitTitle(emr)`(h2), 글 둘(AC-7104.1, `EMR_WITH_RO`), 원장 `Link href="/settings"` '쓰는 EMR 바꾸기', 데스크 '원장님 계정에서 바꿀 수 있어요.'. 도우미 연결(useBridge)은 그대로 돌지만 화면에 쓰지 않는다.
- page.tsx·guard는 바꾸지 않는다.

## 6. SQL — `supabase/migrations/20261119300000_clinic_emr.sql`
```sql
alter table public.clinic_profiles
  add column if not exists emr text not null default 'bit'
  check (emr in ('bit', 'uisarang', 'egis', 'other'));
grant insert (emr), update (emr) on table public.clinic_profiles to authenticated;
```
- 읽기는 표 전체 select 권한·정책(내 병원·데스크 병원) 그대로. 고치기 정책(내 병원)도 그대로라 데스크는 못 고친다. 머리 주석: 무엇을 왜, 먼저 `20261119000000_clinic_profile.sql`, 두 번 붙여도 그대로, 웹 배포 전에 붙인다, 앞 파일을 다시 붙이면(그 파일의 revoke all이 emr 권한을 지움) 이 파일도 다시 붙인다(앞 파일 14줄과 같은 방식).
- 시험 `supabase/clinicEmr.rls.test.ts`(새): `supabase/clinicProfile.rls.test.ts`의 PGlite 준비(앞 migration 목록·원장·데스크 흉내)를 따라 쓰고 이 파일을 더해 AC-7101.1·7101.2. 앞 파일 → 이 파일 → 앞 파일 → 이 파일 차례 뒤에도 원장 upsert(emr 포함)가 되는지.

## 7. 폴더 조사 도구 — `scripts/emr-survey/`
- `emr-survey.ps1`: 윈도우 PowerShell 5.1만(설치 없이 의원 PC에서). `param([Parameter(Mandatory)][string]$Path, [string]$Out)`. 읽기만:
  - 시작 검사: `$Path`가 없으면 '폴더를 찾지 못했어요'. 보고서 자리(`-Out` 또는 바탕화면 기본 파일)의 전체 경로(`$ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath`로 만든다 — 상대 경로도 지금 자리 기준)가 `$Path` 안이면(대소문자 무시, 끝 `\` 맞춤) '보고서를 조사하는 폴더 안에 쓸 수 없어요. -Out으로 다른 곳을 주세요'. 둘 다 아무것도 쓰지 않고 끝(종료 코드 1).
  - 걷기: `Get-ChildItem -LiteralPath $Path -Recurse -Depth 8 -File -Force -ErrorAction SilentlyContinue`, 20만 개까지.
  - 파일 열기는 `[IO.File]::Open(p, 'Open', 'Read', 'ReadWrite, Delete')`, 앞 64KB만(SQLite는 2MB까지, XLSX는 20MB 이하만 통째로 스트림). 폴더 안에 쓰지 않는다.
  - 종류 알아보기(앞 바이트): `SQLite format 3\0`, Jet/ACE(`Standard Jet DB`·`Standard ACE DB` 4바이트 뒤), ZIP `PK\x03\x04`, OLE2 `D0 CF 11 E0`, DBF(첫 바이트 0x02·0x03·0x30·0x31·0x43·0x63·0x83·0x8B·0xCB·0xF5 + 머리 길이 맞음), SQL Server 데이터(.mdf/.ndf/.ldf 확장자), 글자(앞 4KB에 0 바이트 없음), 모름.
  - 모양 바꾸기 `Get-Shape`: 숫자→'9', 한글 음절→'가', 영문→'a', 빈칸·`.`·`_`·`-`·괄호는 그대로, 그 밖→'x'. 확장자 `Get-Ext`: 마지막 `.` 뒤가 `^(?=.*[A-Za-z])[A-Za-z0-9]{1,5}$`일 때만 소문자 확장자, 아니면 '(확장자 없음·이상)'(확장자별 묶음에도 이 이름으로). 파일 이름 모양은 확장자가 있으면 그 앞을, 없으면 이름 전체를 바꾼다. 실제 이름은 쓰지 않는다.
  - 칸 이름 규칙 `Get-SafeName`(AC-7105.4): (가) `^[A-Za-z][A-Za-z0-9_]{0,29}$`이고 `^[A-Za-z]{0,3}[0-9]{3,}$`가 아님 → 그대로. (나) 한글: 낱말 목록(두 글자 이상)과 꼬리말(명·일·액·수·자·호)로 왼쪽부터 남김없이 나눠지고 낱말이 하나 이상, 숫자·빈칸 없음, 12자 이하 → 그대로. 그 밖 → `Get-Shape`. CSV·XLSX 첫 줄 판정: 숫자 3자 이상 이어진 칸이 있거나 한글이 든 칸이 (나)를 못 지나면 '첫 줄이 값처럼 보여요' + 칸 수 + 칸마다 모양.
  - 글자 풀기: `New-Object Text.UTF8Encoding($false, $true)`로 엄격히 풀고, 예외면 CP949(`[Text.Encoding]::GetEncoding(949)`).
  - 칸 이름(종류마다 가장 최근 5개): DBF 머리 칸(이름 11바이트, 종류 1글자, 길이), CSV·TXT 첫 줄(구분자 넷 중 많은 것), XLSX(`System.IO.Compression.ZipArchive` 읽기 → `xl/workbook.xml` 시트 이름, 첫 시트 1행 셀 — 공유 문자열 참조 풀기), SQLite(쪽 크기(머리 16~17바이트)로 나눈 쪽마다 `CREATE TABLE` 뒤 괄호가 그 쪽 안에서 맞는 것만, 표 이름과 칸마다 첫 낱말만 뽑아 `Get-SafeName`, 글 자체는 적지 않음, 없으면 '못 읽음'), Access(200MB 이하, `%TEMP%`가 `$Path` 안이 아닐 때만 `%TEMP%`에 복사 → OleDb `Microsoft.ACE.OLEDB.12.0`→`Microsoft.Jet.OLEDB.4.0` 차례로 `Mode=Read`, GetSchema Tables·Columns → `Get-SafeName`, `try/finally`로 복사본을 지움. 못 하면 '드라이버 없음'·'큼 — 건너뜀'·'임시 폴더가 조사 폴더 안 — 건너뜀'). 시트·표 이름도 `Get-SafeName`.
  - SQL Server: `Get-Service -Name 'MSSQL*','SQLAgent*' -ErrorAction SilentlyContinue` 이름·상태.
  - 보고서: 위 순서의 글 표, UTF-8 BOM, `Write-Host`로도.
- `README.md`: AC-7105.6.
- 시험 `emrSurvey.test.ts`(vitest, 윈도우가 아니면 건너뜀, 시험마다 시간 60초): 임시 폴더에 가짜 파일(머리 있는 CSV, 첫 줄부터 값인 CSV — '홍길동'·'이수정'·'신재진'·'HONG_GILDONG'·'A00123'·'900101-1234567'·'010-1234-5678'·'예약 변경 010-1234-5678', DBF 바이트, SheetJS로 만든 XLSX, SQLite 머리 + CREATE TABLE 글 + 닫히지 않은 CREATE TABLE + 가짜 값, 이름에 가짜 이름이 든 jpg 한글·영문 둘, 확장자 자리에 이름이 든 '검사결과.홍길동'·'Dr.Kim')을 만들고 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File … -Path … -Out …`로 돌려 AC-7105.1~.5를 본다(칸 이름은 있고 가짜 값·실제 파일 이름은 없음, 돌린 앞뒤로 폴더 목록·크기·고친 시각이 같음, 없는 폴더·폴더 안 -Out은 문구와 보고서 없음). README·docs 글은 같은 시험 파일이 읽어 AC-7105.6·AC-7106.1을 본다.
- `docs/emr/README.md`(2026-11-19 조사 문서)에 폴더 조사 도구를 가리키는 줄을 더한다.

## 8. 위험
- SQL 전 웹 배포 → 병원 정보 읽기 실패(2절). 배포는 사용자가 SQL을 실행한 뒤.
- 의원 PC 보안 프로그램이 PowerShell 스크립트를 막을 수 있다 → README에 `-ExecutionPolicy Bypass`와 막히면 할 일(관리자 문의)을 적는다.
- Access 복사·OleDb는 32/64비트 드라이버에 따라 실패할 수 있다 → '드라이버 없음'으로 넘어가고 나머지 보고는 그대로.

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
- `DashboardHome` props에 `emr?: EmrKind`(없으면 'bit'). 연결 전(`report == null`)이고 `emr !== 'bit'`이면: 날짜 줄 → `EmrWaitSentence`(h1 `emrWaitTitle(emr)` — BigSentence와 같은 글 모양, p AC-7103.1 글, `Link href="/settings"` `ds.button.secondary` '쓰는 EMR 바꾸기'). `ConnectSteps`·`StickyConnect`·BigSentence의 안심 줄은 그리지 않는다. 그 아래 `ReadyNowRow`·`analysis`·`FeatureIndex`는 그대로. 연결 뒤 화면은 emr과 상관없이 그대로.
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
- 읽기는 표 전체 select 권한·정책(내 병원·데스크 병원) 그대로. 고치기 정책(내 병원)도 그대로라 데스크는 못 고친다. 머리 주석: 무엇을 왜, 먼저 `20261119000000_clinic_profile.sql`, 두 번 붙여도 그대로, 웹 배포 전에 붙인다.
- 시험 `supabase/clinicEmr.rls.test.ts`(새): `supabase/clinicProfile.rls.test.ts`의 PGlite 준비(앞 migration 목록·원장·데스크 흉내)를 따라 쓰고 이 파일을 더해 AC-7101.1·7101.2.

## 7. 폴더 조사 도구 — `scripts/emr-survey/`
- `emr-survey.ps1`: 윈도우 PowerShell 5.1만(설치 없이 의원 PC에서). `param([Parameter(Mandatory)][string]$Path, [string]$Out)`. 읽기만:
  - 걷기: `Get-ChildItem -LiteralPath $Path -Recurse -Depth 8 -File -Force -ErrorAction SilentlyContinue`, 20만 개까지.
  - 파일 열기는 `[IO.File]::Open(p, 'Open', 'Read', 'ReadWrite, Delete')`, 앞 64KB만(SQLite는 2MB까지). 폴더 안에 쓰지 않는다.
  - 종류 알아보기(앞 바이트): `SQLite format 3\0`, Jet/ACE(`Standard Jet DB`·`Standard ACE DB` 4바이트 뒤), ZIP `PK\x03\x04`, OLE2 `D0 CF 11 E0`, DBF(첫 바이트 0x02·0x03·0x30·0x31·0x43·0x63·0x83·0x8B·0xCB·0xF5 + 머리 길이 맞음), SQL Server 데이터(.mdf/.ndf/.ldf 확장자), 글자(앞 4KB에 0 바이트 없음), 모름.
  - 이름 모양: 숫자→'9', 한글 음절→'가', 그 밖 그대로(확장자 포함). 실제 이름은 쓰지 않는다.
  - 칸 이름(종류마다 가장 최근 5개): DBF 머리 칸(이름 11바이트 CP949, 종류 1글자, 길이), CSV·TXT 첫 줄(UTF-8 BOM이면 UTF-8, 아니면 CP949로 풀어 구분자 넷 중 많은 것), XLSX(`System.IO.Compression`으로 스트림 열기 → `xl/workbook.xml` 시트 이름, 첫 시트 1행 셀 — 공유 문자열 참조 풀기), SQLite(앞 2MB를 글자로 보고 `CREATE TABLE … )` 찾기, 파일마다 2000자까지), Access(200MB 이하만 `%TEMP%`에 복사해 OleDb `Microsoft.ACE.OLEDB.12.0`→`Microsoft.Jet.OLEDB.4.0` 차례로 `Mode=Read`, GetSchema Tables·Columns, 끝나면 복사본을 지운다. 드라이버가 없으면 '드라이버 없음', 크면 '큼 — 건너뜀').
  - 칸 이름 규칙(AC-7105.4): `^[A-Za-z_][A-Za-z0-9_]*$`는 그대로, 한글 칸은 낱말 목록(환자·성명·이름·차트·주민·생년·성별·나이·전화·휴대·주소·접수·진료·처방·코드·금액·수납·현금·카드·계좌·미수·날짜·일자·시간·시각·의사·보험·구분·내원·상병·진단·청구·본인·부담·총액·예약·메모·번호·명칭·수량·단가·종류·상태·등록·수정·여부·기관·요양·초진·재진·신환)을 품으면 그대로, 그 밖은 모양(숫자 '9', 한글 '가', 영문 'a', 나머지 그대로). XLSX 시트 이름도 같은 규칙.
  - SQL Server: `Get-Service -Name 'MSSQL*','SQLAgent*' -ErrorAction SilentlyContinue` 이름·상태.
  - 보고서: 위 순서의 글 표, `-Out` 또는 바탕화면 `emr-survey-YYYYMMDD-HHmm.txt`(UTF-8 BOM), `Write-Host`로도.
- `README.md`: AC-7105.6.
- 시험 `emrSurvey.test.ts`(vitest, 윈도우가 아니면 건너뜀): 임시 폴더에 가짜 파일(머리 있는 CSV, 첫 줄부터 값인 CSV, DBF 바이트, SheetJS로 만든 XLSX, SQLite 머리 + CREATE TABLE 글 + 가짜 값, 이름에 가짜 이름·날짜가 든 jpg)을 만들고 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File … -Path … -Out …`로 돌려 AC-7105.1~.5를 본다(보고서에 칸 이름은 있고 '홍길동'·'900101-1234567'·'010-1234-5678'·실제 파일 이름은 없음, 돌린 앞뒤로 폴더 목록·크기·고친 시각이 같음, 없는 폴더는 문구와 보고서 없음). README·docs 글은 같은 시험 파일이 읽어 AC-7105.6·AC-7106.1을 본다.
- `docs/emr/README.md`(2026-11-19 조사 문서)에 폴더 조사 도구를 가리키는 줄을 더한다.

## 8. 위험
- SQL 전 웹 배포 → 병원 정보 읽기 실패(2절). 배포는 사용자가 SQL을 실행한 뒤.
- 의원 PC 보안 프로그램이 PowerShell 스크립트를 막을 수 있다 → README에 `-ExecutionPolicy Bypass`와 막히면 할 일(관리자 문의)을 적는다.
- Access 복사·OleDb는 32/64비트 드라이버에 따라 실패할 수 있다 → '드라이버 없음'으로 넘어가고 나머지 보고는 그대로.

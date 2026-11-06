# 작업 분할: 접수 현황 폰 화면

> 형식: `## TASK-n: 제목` 아래에 `- Step:`, `- 병렬:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다. 값과 동작은 requirements.md · design.md.
>
> **순서 (Phase마다 끝나면 메인 세션이 점검 → 화면 Phase는 화면 캡처 → 쉬운 말 보고)**
> - Phase 1 `reception-1-check` — 의원 PC 확인 명령 (TASK-1~6). **병렬 묶음 A**: TASK-1·2·3·4를 함께 → TASK-5 → TASK-6
> - Phase 2 `reception-2-core` — 도우미 안쪽: 줄 만들기·읽기·상세·X-ray 완료 표시·웹 서버 (TASK-7~14). **병렬 묶음 B**: TASK-7·8·9·10·12를 함께 → **묶음 C**: TASK-11·13을 함께 → TASK-14
> - Phase 3 `reception-3-page` — 폰·태블릿 화면 (TASK-15~23). TASK-15 → TASK-16 → **묶음 E**: TASK-17·18·19·20·21·22를 함께 → TASK-23
> - Phase 4 `reception-4-host` — 늘 켜 두기·주소 보내기·설치 (TASK-24~27). TASK-24 → TASK-26 → TASK-25·TASK-27·TASK-31을 함께
> - Phase 5 `reception-5-fill` — 확인 결과 채우기 (TASK-28~30, 차례대로). 확인 보고서가 오면 Phase 3·4와 겹쳐 돌려도 된다(만지는 파일이 다르다)
>
> **시작 조건**
> - 명세 승인(`/sdd approve reception-phone` 또는 자동 승인).
> - Phase 3(화면): 의원 상표로 다시 그린 시안 v12(`docs/mockups/reception-phone/` Main·Detail·Offline·Tablet)는 사용자가 승인했다(2026-11-05 "굿", CLAUDE.md 조건 충족).
> - TASK-25(주소 보내기 화면, QR 없음 — 사용자 결정 2026-11-05: 처음 열기는 카카오톡 링크로만): 따로 시안 없이 design.md 8절의 글과 상표 모양으로 만든다(사용자가 사소한 결정을 맡김, 2026-11-05). Phase 4 끝에 화면 캡처를 사용자에게 보인다.
> - Phase 5는 의원 PC 확인 보고서가 `docs/reception/check-result.md`에 있어야 시작한다(메인 창이 사용자가 붙여 넣은 보고서로 만든다). 없으면 `blocked`(사유: 확인 보고서 없음).
>
> **사용자 할 일 (쉬운 말, Phase 사이에 메인 창이 안내)**
> 1. Phase 1 뒤: 메인 창이 사용자 OK를 받아 이 브랜치를 깃허브에 올리면 자동으로 zip이 만들어진다. 의원 PC에서 zip을 모두 풀고 `reception-check.cmd`를 두 번 누른다. 진료 시간에(환자가 여러 상태에 있을 때) 비트 접수 화면을 옆에 띄우고 물음에 번호로 답한다. 끝나면 열리는 메모장 글을 채팅에 붙인다(환자 정보 없음).
> 2. 설치 전: 공유기 관리 화면에서 총괄 PC 주소를 고정한다(‘DHCP 예약’ 또는 ‘고정 IP 할당’). 모르면 메인 창이 그 공유기 이름으로 순서를 알려 준다.
> 3. 설치 뒤 처음 켤 때: "Windows 보안 경고" 창에서 "개인 네트워크"에 체크하고 [허용]을 누른다.
> 4. 직원 휴대폰마다: 총괄 PC 바탕 화면 "접수 현황 주소"를 눌러 [주소 복사] → 직원 단톡방에 붙여 넣어 보낸다. 직원은 병원 와이파이에서 주소를 누르고, 카톡 안에서 열리면 오른쪽 위 메뉴 → '다른 브라우저로 열기' → 홈 화면에 추가한다. 열 때마다 화면을 한 번 누른다(아이폰 소리).
> 5. 설치 뒤 진료 시간에: 휴대폰 두 대 이상을 접수 현황에 열어 두고 30분쯤 비트가 느려지지 않는지 본다(지금 5초. 괜찮으면 3초로 낮춰 한 번 더). 느려지면 메인 창에 알린다(AC-1403.10).
>
> **모든 TASK 공통**
> - 시험을 먼저 쓰고 `python3 ~/.claude/harness/bin/tdd-run TASK-n --expect red`로 RED를 본 뒤 구현하고 `--expect green`. 시험 이름에 이 명세의 AC ID(AC-1401.1 등)를 넣는다.
> - C# 시험 파일 이름은 `*.test.cs`, 하네스 TDD 기록은 `helper/tests/*.dotnet.test.ts` 감싸개(`runDotnet`·`buildDotnet`)로 남긴다(precheck·revenue·bit-read-speed와 같음). 이 서버는 CPU 2개·스왑 없음이라 `npm test` 전체를 돌리지 않고 그 TASK의 시험 파일만 돌린다.
> - 가짜 자료만 쓴다: 이름 '가상환자NN', 차트번호 `9`로 시작하는 6자리, 내원번호 `V`+숫자, 처방 코드는 시안의 것(ESWT7 등). 실제 비트 자료·보고서를 커밋하지 않는다.
> - 고치지 않는 것: `src/lib/bridge/**`(통로·`commands.json`·`versions.ts`), `helper/Directory.Build.props`(버전), `extension/**`, 웹사이트 화면·CSP(`next.config.ts`), `specs/` 다른 명세.
> - 합치기·운영 배포·도우미 릴리스 태그(`helper-v*`)는 하지 않는다. 릴리스는 `bit-read-speed`가 main에 들어간 뒤 사용자 말로 부모 세션이 한다(design.md '릴리스 조건').

## TASK-1: 이 기능의 비트 문장 (아는 칸만) + 허용 목록
- Step: Phase 1 · Step 0 · `reception-sql`
- 병렬: 묶음 A (TASK-2·3·4와 함께)
- AC: AC-1403.1, AC-1403.7, AC-1404.6
- REQ: REQ-1403, REQ-1404
- Files: helper/src/Precheck.Core/Reception/ReceptionSql.cs, helper/src/Precheck.Core/Bit/Sql.cs, helper/tests/Precheck.Core.Tests/Reception/ReceptionSql.test.cs, helper/tests/reception-sql.dotnet.test.ts
- Tests: helper/tests/reception-sql.dotnet.test.ts
- TDD: required
- design.md 3절 표의 `TodayVisits`·`TodayRx`·`PriorVisits`·`PriorRx`·`RxNames`·`HistoryCount`·`HistoryPage`와 `ReceptionSql.Parameters`. `Sql.IsAllowed`·`Sql.ParametersOf`가 `ReceptionSql.Parameters`도 묻게 한 줄씩 더한다(Revenue와 같은 모양). 시험: 모두 SELECT 하나, 병원 범위 조건, `OFFSET`·`FETCH` 없음, `OcmChtNum`에 함수 없음, 매개변수 표로 `ReadOnlyGuard` 통과, 쓰는 칸이 이 저장소에 이미 있는 칸뿐(목록 대조)

## TASK-2: 확인 문장·찍기 틀
- Step: Phase 1 · Step 1 · `check-sql`
- 병렬: 묶음 A
- AC: AC-1401.2, AC-1401.3, AC-1401.8, AC-1401.9
- REQ: REQ-1401
- Files: helper/src/Precheck.Core/Reception/Check/CheckSql.cs, helper/src/Precheck.Core/Reception/Check/ProbeSql.cs, helper/tests/Precheck.Core.Tests/Reception/Check/CheckSql.test.cs, helper/tests/reception-check-sql.dotnet.test.ts
- Tests: helper/tests/reception-check-sql.dotnet.test.ts
- TDD: required
- 상수: 오늘 상태 짝(건수·시각), `INFORMATION_SCHEMA.COLUMNS`(네 표), 이름이 `OcmNum`으로 끝나는 칸을 가진 `dbo` 표, 상태별 처방 있는 접수 수. 틀 세 가지(`VisitLinked`·`ChartLinked`·`Sample`)와 `IsProbe`(만든 글을 다시 풀어 틀·이름 모양 확인). `Sql.IsAllowed`는 틀을 받지 않음을 시험한다(`Sql.cs`는 고치지 않는다)

## TASK-3: 견주기·모양 (순수 계산)
- Step: Phase 1 · Step 2 · `check-probe`
- 병렬: 묶음 A
- AC: AC-1401.4, AC-1401.5, AC-1401.6, AC-1401.7
- REQ: REQ-1401
- Files: helper/src/Precheck.Core/Reception/Check/ProbeMatch.cs, helper/src/Precheck.Core/Reception/Check/ColumnShape.cs, helper/tests/Precheck.Core.Tests/Reception/Check/ProbeMatch.test.cs, helper/tests/Precheck.Core.Tests/Reception/Check/ColumnShape.test.cs, helper/tests/reception-check-probe.dotnet.test.ts
- Tests: helper/tests/reception-check-probe.dotnet.test.ts
- TDD: required
- 공백·줄바꿈 맞추기, 똑같음·품음(4글자 이상)·여러 줄 이어 견주기, 숫자 결과만. 모양: 빈 값 아님 %·길이 범위·날짜 모양·13자리 숫자 모양·작은 값 목록 조건

## TASK-4: 확인 보고서 (거르기·바로 쓰기·자리)
- Step: Phase 1 · Step 3 · `check-report`
- 병렬: 묶음 A
- AC: AC-1401.10, AC-1401.11
- REQ: REQ-1401
- Files: helper/src/Precheck.Core/Reception/Check/CheckReport.cs, helper/src/Precheck.Core/Reception/Check/CheckReportPath.cs, helper/tests/Precheck.Core.Tests/Reception/Check/CheckReport.test.cs, helper/tests/reception-check-report.dotnet.test.ts
- Tests: helper/tests/reception-check-report.dotnet.test.ts
- TDD: required
- 칸마다 거르기(이름 모양·숫자 형·상태 코드 모양, 나머지 `?`), 오류는 형 이름·번호만, 줄마다 `Flush`, 파일 이름·자리(푼 폴더 → 임시 폴더)

## TASK-5: 확인 차례 (가짜 콘솔·DB·화면 83으로 끝까지)
- Step: Phase 1 · Step 4 · `check-runner`
- 병렬: 아니오 (TASK-1~4 뒤)
- AC: AC-1401.2, AC-1401.4, AC-1401.5, AC-1401.6, AC-1401.8, AC-1401.10, AC-1401.11
- REQ: REQ-1401
- Files: helper/src/Precheck.Core/Reception/Check/CheckRunner.cs, helper/src/Precheck.Core/Reception/Check/ICheckConsole.cs, helper/src/Precheck.Core/Reception/Check/ICheckSession.cs, helper/tests/Precheck.Core.Tests/Reception/Check/CheckRunner.test.cs, helper/tests/Precheck.Core.Tests/Reception/Check/CheckFakes.test.cs, helper/tests/reception-check-runner.dotnet.test.ts
- Tests: helper/tests/reception-check-runner.dotnet.test.ts
- TDD: required
- 단계 순서·건너뜀(로그인 취소)·시간 제한(문장 30초, 전체 15분, 주입한 시계)·센티널 시험(DB·화면 83·친 메모 글). 친 메모 글은 견주기 뒤 바로 버린다

## TASK-6: 확인 명령 입구 (인자 분기·윈도우 세션·시작 파일)
- Step: Phase 1 · Step 5 · `check-start`
- 병렬: 아니오 (TASK-5 뒤)
- AC: AC-1401.1, AC-1401.9, AC-1401.11, AC-1401.12, AC-1401.13
- REQ: REQ-1401
- Files: helper/src/Precheck.Core/Reception/Check/CheckMode.cs, helper/src/Precheck.Helper/Program.cs, helper/src/Precheck.Windows/CheckBitDb.cs, helper/src/Precheck.Windows/ReceptionCheckEntry.cs, helper/install/reception-check.cmd, helper/install/reception-check.ps1, helper/tests/Precheck.Core.Tests/Reception/Check/CheckStart.test.cs, helper/tests/reception-check-start.dotnet.test.ts
- Tests: helper/tests/reception-check-start.dotnet.test.ts
- TDD: required
- `CheckMode.IsRequested` 시험(크롬 모양·대소문자·둘째 인자·입력 파이프는 거짓). `Program.cs`는 `Console.SetOut` 앞 분기 한 곳만(글자 시험). `CheckBitDb`: `Commit` 없음·실행 전 검사·닫을 때 되돌림(글자 시험). 시작 파일: ASCII cmd·UTF-8 BOM ps1·설치 폴더·레지스트리 명령 없음(글자 시험). 감싸개가 `buildDotnet`으로 도우미가 net48로 컴파일됨을 본다. 실제 실행은 AC-1401.13(의원 PC)

## TASK-7: `ReceptionMap` 틀 (한 곳)
- Step: Phase 2 · Step 0 · `reception-map`
- 병렬: 묶음 B (TASK-8·9·10·12와 함께)
- AC: AC-1410.1, AC-1410.2, AC-1402.1
- REQ: REQ-1410, REQ-1402
- Files: helper/src/Precheck.Core/Reception/ReceptionMap.cs, helper/tests/Precheck.Core.Tests/Reception/ReceptionMap.test.cs, helper/tests/reception-map.dotnet.test.ts
- Tests: helper/tests/reception-map.dotnet.test.ts
- TDD: required
- `Lane`, 빈 `Statuses`·`HiddenRsu`, `Columns = null`, `Validate`(한 코드 두 칸 금지·네 칸 모두 코드 있음·아는 완료 코드는 숨김 아님). 값 채우기는 TASK-28

## TASK-8: 화면용 열쇠 (`VisitKeys`)
- Step: Phase 2 · Step 1 · `visit-keys`
- 병렬: 묶음 B
- AC: AC-1402.9, AC-1403.6
- REQ: REQ-1402, REQ-1403
- Files: helper/src/Precheck.Core/Reception/VisitKeys.cs, helper/tests/Precheck.Core.Tests/Reception/VisitKeys.test.cs, helper/tests/reception-keys.dotnet.test.ts
- Tests: helper/tests/reception-keys.dotnet.test.ts
- TDD: required

## TASK-9: 엑스레이 'X-ray 완료' 표시 저장 (`XrayMarks`)
- Step: Phase 2 · Step 2 · `xray-marks`
- 병렬: 묶음 B
- AC: AC-1405.1, AC-1405.2, AC-1405.3, AC-1405.4, AC-1405.6
- REQ: REQ-1405
- Files: helper/src/Precheck.Core/Reception/XrayMarks.cs, helper/tests/Precheck.Core.Tests/Reception/XrayMarks.test.cs, helper/tests/reception-xray.dotnet.test.ts
- Tests: helper/tests/reception-xray.dotnet.test.ts
- TDD: required
- 가짜 `IProtector`·임시 폴더. 날 바뀜·임시 파일 → 바꾸기·동시 쓰기 차례·깨진 파일은 빈 표시로 시작(기록에 번호)

## TASK-10: HTTP 읽기·쓰기와 문 지키기
- Step: Phase 2 · Step 3 · `reception-http`
- 병렬: 묶음 B
- AC: AC-1406.1, AC-1406.2, AC-1406.3, AC-1406.4, AC-1406.6
- REQ: REQ-1406
- Files: helper/src/Precheck.Core/Reception/Http/HttpRequest.cs, helper/src/Precheck.Core/Reception/Http/HttpRequestReader.cs, helper/src/Precheck.Core/Reception/Http/HttpResponse.cs, helper/src/Precheck.Core/Reception/Http/ClientGuard.cs, helper/tests/Precheck.Core.Tests/Reception/Http/HttpRequestReader.test.cs, helper/tests/Precheck.Core.Tests/Reception/Http/ClientGuard.test.cs, helper/tests/reception-http.dotnet.test.ts
- Tests: helper/tests/reception-http.dotnet.test.ts
- TDD: required
- 메모리 스트림으로 길이·시간 제한·머리 읽기, 사설 주소 표(경계값 172.15/172.32·169.254·IPv4 섞인 IPv6), `Host`·`Origin`·`X-Reception`·`Content-Type` 규칙, 보안 머리

## TASK-11: 줄 만들기 (`BoardBuilder`)
- Step: Phase 2 · Step 4 · `board-builder`
- 병렬: 묶음 C (TASK-13과 함께, TASK-7·8·12 뒤. `BoardInput`·`VisitRow`는 TASK-12가 만든다)
- AC: AC-1402.1, AC-1402.2, AC-1402.3, AC-1402.4, AC-1402.5, AC-1402.6, AC-1402.7, AC-1402.8, AC-1402.9
- REQ: REQ-1402
- Files: helper/src/Precheck.Core/Reception/BoardBuilder.cs, helper/src/Precheck.Core/Reception/BoardModel.cs, helper/tests/Precheck.Core.Tests/Reception/BoardBuilder.test.cs, helper/tests/reception-board.dotnet.test.ts
- Tests: helper/tests/reception-board.dotnet.test.ts
- TDD: required
- 가짜 지도·가짜 줄로 칸 나누기·순서·기다린 글(59/60분, 0분 → 1분, 시간 넘김)·만 나이(생일 전날·당일)·처방 이름표 세 가지·빈 칸·엑스레이 칸·JSON 모양(design.md 4절)

## TASK-12: 비트 읽기 묶음·캐시 (`BoardReader`·`BoardCache`)
- Step: Phase 2 · Step 5 · `board-cache`
- 병렬: 묶음 B (TASK-1이 끝나 있어야 한다)
- AC: AC-1403.2, AC-1403.3, AC-1403.4, AC-1403.5, AC-1403.6, AC-1403.7, AC-1403.8
- REQ: REQ-1403
- Files: helper/src/Precheck.Core/Reception/BoardReader.cs, helper/src/Precheck.Core/Reception/BoardInput.cs, helper/src/Precheck.Core/Reception/BoardCache.cs, helper/tests/Precheck.Core.Tests/Reception/BoardReader.test.cs, helper/tests/Precheck.Core.Tests/Reception/BoardCache.test.cs, helper/tests/reception-cache.dotnet.test.ts
- Tests: helper/tests/reception-cache.dotnet.test.ts
- TDD: required
- 캐시는 날 줄(`BoardInput`)만 들고, 화면 JSON은 요청마다 TASK-11이 만든다(X-ray 완료 표시가 바로 보이게). 가짜 `IBitDb`·주입한 시계·동시 요청(작업 여러 개)으로 한 번만 읽음, 8초(TASK-31에서 `CacheSeconds` 4초로), 3배 미룸(60초 끝), 실패 뒤 10초, 등록 없음·병원 다름 → `unavailable`, 날 바뀜, 이름표 하루 한 번, `fresh`(8초 건너뜀·읽는 중 함께 기다림·2초 안 같은 결과·3배 쉼과 실패 뒤 10초는 그대로). `VisitRow`는 `Name`·`BirthDate`·`Sex`·`Memo`·`PaidAt`을 빈 값 허용으로 처음부터 갖는다(design.md 3절)

## TASK-13: 상세 (`HistoryReader`·`HistoryBuilder`)
- Step: Phase 2 · Step 6 · `visit-history`
- 병렬: 묶음 C (TASK-11과 함께, TASK-8 뒤)
- AC: AC-1404.1, AC-1404.2, AC-1404.3, AC-1404.4, AC-1404.5
- REQ: REQ-1404
- Files: helper/src/Precheck.Core/Reception/HistoryReader.cs, helper/src/Precheck.Core/Reception/HistoryBuilder.cs, helper/tests/Precheck.Core.Tests/Reception/HistoryBuilder.test.cs, helper/tests/Precheck.Core.Tests/Reception/HistoryReader.test.cs, helper/tests/reception-history.dotnet.test.ts
- Tests: helper/tests/reception-history.dotnet.test.ts
- TDD: required
- 5 → 20 쪽수, `more`·`next`, 처음 온 날·모두 N번(오늘 포함), 날짜 글(올해·다른 해)·N일 전·같은 날 "오늘", 증상 없음, 오늘 이름표 네 가지, 틀린 열쇠·시작 위치는 비트를 안 읽음

## TASK-14: 길 나누기·서버·화면 파일·기록
- Step: Phase 2 · Step 7 · `reception-server`
- 병렬: 아니오 (TASK-9~13 뒤)
- AC: AC-1406.4, AC-1406.5, AC-1403.8, AC-1406.7, AC-1406.8, AC-1404.5, AC-1405.5, AC-1413.1
- REQ: REQ-1406, REQ-1404, REQ-1405, REQ-1413, REQ-1403
- Files: helper/src/Precheck.Core/Reception/Http/ReceptionRouter.cs, helper/src/Precheck.Core/Reception/Http/ReceptionServer.cs, helper/src/Precheck.Core/Reception/Http/StaticFiles.cs, helper/src/Precheck.Core/Reception/Http/IStaticSource.cs, helper/src/Precheck.Core/Reception/ReceptionLog.cs, helper/src/Precheck.Core/Reception/ReceptionPorts.cs, helper/tests/Precheck.Core.Tests/Reception/Http/ReceptionRouter.test.cs, helper/tests/Precheck.Core.Tests/Reception/Http/ReceptionServer.test.cs, helper/tests/Precheck.Core.Tests/Reception/ReceptionText.test.cs, helper/tests/reception-server.dotnet.test.ts
- Tests: helper/tests/reception-server.dotnet.test.ts
- TDD: required
- 루프백 빈 문에 진짜 소켓: 길 목록(`/api/board?fresh=1`은 `fresh`로, 다른 질의 글은 404)·404·405·503·32개 넘는 연결·느린 연결. `ReceptionText.test.cs`는 `Reception/**`·`Precheck.Reception/**` 글자에서 바깥 연결 API가 없음을 본다(AC-1413.1, `Precheck.Reception`이 생기면 함께 본다). 화면 파일은 가짜 `IStaticSource`

## TASK-15: 화면 울타리 (ESLint·시험 범위·문서)
- Step: Phase 3 · Step 0 · `page-fence`
- 병렬: 아니오 (Phase 3 처음. TASK-16이 `reception/tests`를 시험으로 잡으려면 이 TASK의 `vitest.config.ts` 줄이 먼저 있어야 한다)
- AC: AC-1407.6
- REQ: REQ-1407
- Files: eslint.config.mjs, src/guardrails.test.ts, vitest.config.ts, tsconfig.json, docs/ARCHITECTURE.md, src/b2b-merge.test.ts
- Tests: src/guardrails.test.ts, src/b2b-merge.test.ts
- TDD: required
- `reception/www/**`에 AC-1407.6의 막기(`no-restricted-globals`·`no-restricted-properties`·`no-restricted-syntax`: `fetch` 첫 인자가 `/`로 시작하지 않거나 `//`로 시작하는 글이면 막기). 기존 규칙은 그대로. `vitest.config.ts`에 `reception/**/*.test.ts`(시험 범위를 못 박은 `src/b2b-merge.test.ts` AC-034.5 목록에도 한 줄), 루트 `tsconfig.json` exclude에 `reception`. `ARCHITECTURE.md`에 `reception/`·`Precheck.Reception`과 예외 한 줄(ADR-027)

## TASK-16: 화면 뼈대·의원 상표 (색·글꼴 한 곳, 로고, 품기)
- Step: Phase 3 · Step 1 · `page-shell`
- 병렬: 아니오 (TASK-15 뒤)
- AC: AC-1407.7, AC-1407.8, AC-1407.9, AC-1407.10
- REQ: REQ-1407
- Files: reception/www/index.html, reception/www/theme.css, reception/www/style.css, reception/www/dom.js, reception/www/manifest.webmanifest, reception/www/logo-mark.png, reception/www/logo-wordmark.png, reception/www/fonts/*, reception/fonts/make-title-font.py, reception/tests/shell.test.ts, reception/tests/dom.test.ts, helper/src/Precheck.Core/Precheck.Core.csproj, helper/tests/Precheck.Core.Tests/Reception/StaticEmbed.test.cs, helper/tests/reception-embed.dotnet.test.ts
- Tests: reception/tests/shell.test.ts, reception/tests/dom.test.ts, helper/tests/reception-embed.dotnet.test.ts
- TDD: required
- 승인된 상표 시안의 값으로 `theme.css` 토큰, `style.css`는 시안의 모든 모양(폰 + 태블릿 두 칸)을 `var()`로. 시험: 다른 파일에 색 글자 없음, 바깥 주소 없음(`http`·`//`), 상태 색 ≠ 강조색, 매니페스트 칸, 제목 글꼴(Black Han Sans 완성형 2,350자 + 영문·숫자) 600KB 이하 + OFL.txt(시안 글꼴이 OFL이 아니면 글꼴 파일 없이 기기 글꼴 800), Core가 `reception/` 이름으로 파일을 모두 품음, [새로 고침] 단추 모양(`min-width`·`min-height` 44px 이상, design.md 10절), `index.html`의 `<title>접수 현황</title>`

## TASK-17: 목록 그리기 (`board.js`)
- Step: Phase 3 · Step 2 · `page-board`
- 병렬: 묶음 E (TASK-18~22와 함께, TASK-16 뒤)
- AC: AC-1407.1, AC-1407.2, AC-1407.10
- REQ: REQ-1407
- Files: reception/www/board.js, reception/tests/board.test.ts, reception/tests/fixtures.ts
- Tests: reception/tests/board.test.ts
- TDD: required
- jsdom. 시안 글·칸 순서·`aria-pressed`·진료 순서에만 번호·이름표, 메모 있을 때만, 주황, 환자 글에 `<b>`를 넣어도 글자로만 보임, 머리의 [새로 고침] 단추(`type="button"`, 연결됨 표시 옆, `reading`이면 "읽는 중…"·`disabled`)

## TASK-18: 읽기 고리·연결 끊김 (`api.js`·`poll.js`·`offline.js`)
- Step: Phase 3 · Step 3 · `page-poll`
- 병렬: 묶음 E
- AC: AC-1407.3, AC-1407.4, AC-1407.10, AC-1407.11, AC-1413.2
- REQ: REQ-1407, REQ-1413
- Files: reception/www/api.js, reception/www/poll.js, reception/www/offline.js, reception/tests/api.test.ts, reception/tests/poll.test.ts, reception/tests/offline.test.ts
- Tests: reception/tests/api.test.ts, reception/tests/poll.test.ts, reception/tests/offline.test.ts
- TDD: required
- 가짜 `fetch`·가짜 시계: 10초 고리(TASK-31에서 답의 `every`초로), 5초 끊음, 200 아님·모양 틀림, 첫 실패에 DOM·상태의 환자 값이 모두 사라짐(이름·차트번호 글자 검색), "마지막 연결 HH:MM", 다시 성공하면 목록. 모든 요청 주소가 `/`로 시작. `getBoard({ fresh: true })` → `/api/board?fresh=1`. `refreshNow()`: 요청 하나(두 번 불러도), 도는 읽기 뒤 `fresh` 한 번, 끝나면 10초 다시 예약. `pause()`: 지우기 + 고리 멈춤(읽는 중 `pause()` → 답이 와도 DOM·상태에 환자 글 없음, 예약 없음, 기다리던 `fresh` 없음), `resume()`: 바로 한 번 읽기. 기준 시각은 답의 `at`(같은 `at`이면 그대로)

## TASK-19: 상세 그리기 (`detail.js`)
- Step: Phase 3 · Step 4 · `page-detail`
- 병렬: 묶음 E
- AC: AC-1407.5, AC-1404.2, AC-1404.3, AC-1404.4
- REQ: REQ-1407, REQ-1404
- Files: reception/www/detail.js, reception/tests/detail.test.ts
- Tests: reception/tests/detail.test.ts
- TDD: required
- 시안 글(오늘 카드·증상 줄·처방 목록·더 보기 글·끝 줄), 더 보기를 누르면 이어 붙임(앞 것 유지), 증상 없으면 칸 없음

## TASK-20: X-ray 완료 단추 (`xray.js`)
- Step: Phase 3 · Step 5 · `page-xray`
- 병렬: 묶음 E
- AC: AC-1405.1, AC-1405.2
- REQ: REQ-1405
- Files: reception/www/xray.js, reception/tests/xray.test.ts
- Tests: reception/tests/xray.test.ts
- TDD: required
- 진료보류 줄의 두 모양("X-ray 전" + [X-ray 완료] / "X-ray 완료 HH:MM" + [표시 취소]), 누르면 `setXray` 한 번 후 다시 읽기, 누르는 동안 두 번 못 누름, 줄 자리 그대로

## TASK-21: 새 접수 알림 (`alert.js`)
- Step: Phase 3 · Step 6 · `page-alert`
- 병렬: 묶음 E
- AC: AC-1408.1, AC-1408.2, AC-1408.3, AC-1408.4, AC-1408.5
- REQ: REQ-1408
- Files: reception/www/alert.js, reception/tests/alert.test.ts
- Tests: reception/tests/alert.test.ts
- TDD: required
- 가짜 `navigator.vibrate`·가짜 `AudioContext`: 새 열쇠 한 번 알림, 첫 읽기·끊김 뒤 첫 읽기는 알리지 않음, 떨기 무늬, 삐 두 번, 첫 누름 전에는 소리 없음. 실제 기기는 AC-1408.5(의원 PC)

## TASK-22: 태블릿 두 칸 (`layout.js`)
- Step: Phase 3 · Step 7 · `page-tablet`
- 병렬: 묶음 E
- AC: AC-1409.1, AC-1409.2, AC-1409.3, AC-1409.4, AC-1409.5
- REQ: REQ-1409
- Files: reception/www/layout.js, reception/tests/layout.test.ts
- Tests: reception/tests/layout.test.ts
- TDD: required
- 가짜 `matchMedia`(바뀜 알림 포함): 판정·고르기·고른 줄 표시·처음엔 고른 칸의 첫 줄·다시 읽어도 유지·사라지면 첫 줄(없으면 빈 오른쪽)·끊기면 둘 다 지움·돌려도 고른 환자 유지

## TASK-23: 잇기 (`app.js`) + 가짜 서버로 끝까지
- Step: Phase 3 · Step 8 · `page-app`
- 병렬: 아니오 (TASK-17~22 뒤)
- AC: AC-1407.1, AC-1407.3, AC-1407.4, AC-1407.5, AC-1407.10, AC-1407.11, AC-1408.1, AC-1409.2, AC-1413.2
- REQ: REQ-1407, REQ-1408, REQ-1409, REQ-1413
- Files: reception/www/app.js, reception/www/index.html, reception/tests/app.test.ts, reception/tests/fixtures.ts
- Tests: reception/tests/app.test.ts
- TDD: required
- jsdom에 `index.html`을 넣고 가짜 `fetch`로 열기 → 칸 고르기 → 줄 누르기(폰: 해시 길, 태블릿: 오른쪽) → 더 보기 → X-ray 완료 → 새 접수 알림 → [새로 고침](요청 `?fresh=1` 하나, "읽는 중…" 뒤 기준 시각 바뀜) → 숨김(`visibilitychange`, 환자 글 사라짐, 읽는 중에 숨겨도 늦은 답을 그리지 않음) → 다시 보임(`visible`·`pageshow`, 불러오는 중 → 목록, 알림 없음) → 끊김 → 돌아옴. `document.title`은 늘 "접수 현황". 요청 주소 모두 같은 곳 `/…`. 메인 세션은 Phase 끝에 도우미 없이 `reception/www`를 가짜 자료로 띄워 화면 캡처를 사용자에게 보인다

## TASK-24: 이 PC 주소 (`LanAddresses`·`LanAddressWatch`)
- Step: Phase 4 · Step 0 · `lan-address`
- 병렬: 아니오 (Phase 4 처음. QR이 빠져 `Precheck.Core.csproj`는 고치지 않으므로 Phase 3과 겹쳐 돌려도 된다. TASK-25가 TASK-16의 화면 파일을 쓴다)
- AC: AC-1411.4, AC-1406.2
- REQ: REQ-1411, REQ-1406
- Files: helper/src/Precheck.Core/Reception/LanAddresses.cs, helper/tests/Precheck.Core.Tests/Reception/LanAddresses.test.cs, helper/tests/reception-lan.dotnet.test.ts
- Tests: helper/tests/reception-lan.dotnet.test.ts
- TDD: required
- 어댑터 걸러내기(켜짐·게이트웨이·사설 IPv4·순서). `LanAddressWatch` 30초마다 다시 봄(주입한 시계, 30초 안에는 `read`를 다시 부르지 않음). 휴대폰 주소 글 `LanAddresses.PhoneUrl(ip)` = `http://{주소}:47200`. QR 그림·`QRCoder`는 만들지 않는다(사용자 결정)

## TASK-25: 주소 보내기 화면 (`/link`, 이 PC만, QR 없음)
- Step: Phase 4 · Step 1 · `link-page`
- 병렬: TASK-27과 함께 (TASK-14·24 뒤)
- AC: AC-1411.4, AC-1406.8
- REQ: REQ-1411, REQ-1406
- Files: helper/src/Precheck.Core/Reception/LinkPage.cs, helper/src/Precheck.Core/Reception/Http/ReceptionRouter.cs, helper/src/Precheck.Reception/ReceptionServices.cs, reception/www/link.css, reception/www/link.js, helper/tests/Precheck.Core.Tests/Reception/LinkPage.test.cs, helper/tests/Precheck.Core.Tests/Reception/Http/ReceptionRouter.test.cs, helper/tests/reception-server.dotnet.test.ts, helper/tests/reception-link-page.dotnet.test.ts, reception/tests/link.test.ts
- Tests: helper/tests/reception-link-page.dotnet.test.ts, reception/tests/link.test.ts
- TDD: required
- design.md 8절의 글·`/theme.css`·`/link.css` 링크와 `/link.js` 하나(HTML에 `<style>`·`style=`·인라인 스크립트·`on…=` 없음, `link.css`에 색 글자 없음)·주소마다 큰 전체 주소 링크 + [주소 복사]·순서 넷·와이파이 안내·사설 주소 없음 안내. 라우터의 `/qr` 자리(TASK-14의 `qrPage` 매개변수)를 `/link`·`linkPage`로 바꾸고 `/qr`은 404. 라우터 생성자가 바뀌면 `ReceptionServices.cs`도 맞춘다. 루프백이 아니면 404. 글은 HTML 이스케이프. `link.test.ts`(jsdom): 가짜 `navigator.clipboard`로 복사·"복사했어요" 2초, 거부·없음이면 글 고르기 + 안내 글

## TASK-26: 늘 켜 두는 프로그램 `PrecheckReception.exe`
- Step: Phase 4 · Step 2 · `reception-host`
- 병렬: 아니오 (TASK-24 뒤. `ReceptionServices`가 `LanAddressWatch`를 라우터·`ClientGuard`에 넘긴다)
- AC: AC-1411.1, AC-1411.2, AC-1411.3, AC-1411.5, AC-1411.7, AC-1412.5, AC-1413.1
- REQ: REQ-1411, REQ-1412, REQ-1413
- Files: helper/src/Precheck.Reception/Precheck.Reception.csproj, helper/src/Precheck.Reception/Program.cs, helper/src/Precheck.Reception/ReceptionServices.cs, helper/src/Precheck.Reception/SingleInstance.cs, helper/Precheck.sln, helper/src/Precheck.Core/Reception/ReceptionStart.cs, helper/tests/Precheck.Core.Tests/Reception/ReceptionStart.test.cs, helper/tests/reception-host.dotnet.test.ts
- Tests: helper/tests/reception-host.dotnet.test.ts
- TDD: required
- 켜는 차례는 Core `ReceptionStart`(뮤텍스·문·`--link`·브라우저 열기를 주입)로 시험하고, exe는 잇기만 한다. 감싸개가 `buildDotnet`으로 `PrecheckReception`이 net48·x86·WinExe로 컴파일되고 `.exe.config`에 옛 런타임 정책이 있음을 본다. 실제 로그인 시작·방화벽은 의원 PC

## TASK-27: 설치·내보내기·안내
- Step: Phase 4 · Step 3 · `reception-install`
- 병렬: TASK-25와 함께 (TASK-26 뒤)
- AC: AC-1412.1, AC-1412.2, AC-1412.3, AC-1412.4, AC-1411.2, AC-1411.3, AC-1411.6, AC-1413.3
- REQ: REQ-1412, REQ-1411, REQ-1413
- Files: helper/install/install.ps1, helper/install/uninstall.ps1, helper/install/README.md, .github/workflows/helper.yml, helper/tests/reception-install.test.ts
- Tests: helper/tests/reception-install.test.ts
- TDD: required
- 글자 시험: 관리자 권한 명령 없음, 두 프로그램 끄기, `HKCU\…\Run` 값, 바탕 화면 "접수 현황 주소" 바로 가기 `--link`, 지우기 짝, zip에 exe·config·확인 시작 파일, README의 쉬운 안내 여섯 가지. 바뀌지 않음 시험: 이 브랜치와 `origin/main`의 갈림점(`git merge-base`)에서 `helper/Directory.Build.props`·`src/lib/bridge/**`·`next.config.ts`·`src/app/api/**`가 그대로다(AC-1412.3·AC-1413.3)

## TASK-28: 상태 표 채우기 (확인 보고서대로)
- Step: Phase 5 · Step 0 · `fill-status`
- 병렬: 아니오 (Phase 5는 차례대로)
- AC: AC-1410.2, AC-1402.1
- REQ: REQ-1410, REQ-1402
- Files: helper/src/Precheck.Core/Reception/ReceptionMap.cs, helper/tests/Precheck.Core.Tests/Reception/ReceptionMap.test.cs, helper/tests/reception-map.dotnet.test.ts
- Tests: helper/tests/reception-map.dotnet.test.ts
- TDD: required
- `docs/reception/check-result.md` 3회차 답 그대로(2회차 표를 고침): WR·CR·CN 숨김(예약·예약 취소·접수 취소), WN 진료대기, HN 진료보류, TN 수납대기, PN 끝남. `Unconfirmed`는 비어 있다. 답이 없는 코드는 표에 넣지 않는다. `Validate(Statuses, Unconfirmed)`가 문제 없음. 시험은 채운 표가 보고서 표와 같은지 본다

## TASK-29: 사람·접수 메모·수납 시각 칸 읽기
- Step: Phase 5 · Step 1 · `fill-columns`
- 병렬: 아니오 (TASK-28 뒤)
- AC: AC-1410.3, AC-1402.5, AC-1402.7, AC-1410.5
- REQ: REQ-1410, REQ-1402
- Files: helper/src/Precheck.Core/Reception/ReceptionMap.cs, helper/src/Precheck.Core/Reception/ReceptionSql.cs, helper/src/Precheck.Core/Reception/BoardReader.cs, helper/src/Precheck.Core/Reception/BoardInput.cs, helper/tests/Precheck.Core.Tests/Reception/ReceptionSql.test.cs, helper/tests/Precheck.Core.Tests/Reception/BoardReader.test.cs, helper/tests/reception-fill.dotnet.test.ts
- Tests: helper/tests/reception-fill.dotnet.test.ts
- TDD: required
- 보고서에서 찾은 칸으로 `TodayPeople`·`TodayMemos`·`TodayPaid` 상수(허용 목록), 주민번호 모양이면 `LEFT(…,7)`만. 찾지 못한 칸은 상수를 만들지 않고 그 값은 빈 채로 둔다(AC-1402.7). 실제 값 대조는 AC-1410.5(의원 PC)

## TASK-30: 증상 칸 읽기 (SQL 원천)
- Step: Phase 5 · Step 2 · `fill-symptoms`
- 병렬: 아니오 (TASK-29 뒤)
- AC: AC-1410.4, AC-1404.2, AC-1404.4
- REQ: REQ-1410, REQ-1404
- Files: helper/src/Precheck.Core/Reception/ReceptionMap.cs, helper/src/Precheck.Core/Reception/ReceptionSql.cs, helper/src/Precheck.Core/Reception/HistoryReader.cs, helper/tests/Precheck.Core.Tests/Reception/ReceptionSql.test.cs, helper/tests/Precheck.Core.Tests/Reception/HistoryReader.test.cs, helper/tests/reception-symptoms.dotnet.test.ts
- Tests: helper/tests/reception-symptoms.dotnet.test.ts
- TDD: required
- 원천은 AC-1410.4(3회차): `VisitSymptoms`(내원번호로 EmrInf의 EmrShtTyp='S'·빈 글 아닌 EmrShtVal 줄, 순서 칸 차례), 이음은 도우미가 공백 하나로. 내원번호·순서 칸 이름이 확인 보고서에 없으면 `blocked`(사유: EmrInf 칸 이름 없음)

## TASK-31: 읽기 간격 한 곳 (`ReceptionTiming`, 5초)
- Step: Phase 4 · Step 4 · `poll-timing`
- 병렬: TASK-25·TASK-27과 함께 (TASK-23 뒤. 만지는 파일이 다르다)
- AC: AC-1403.2, AC-1403.8, AC-1403.9, AC-1403.10, AC-1407.1, AC-1407.3, AC-1407.4, AC-1407.10
- REQ: REQ-1403, REQ-1407
- Files: helper/src/Precheck.Core/Reception/ReceptionTiming.cs, helper/src/Precheck.Core/Reception/BoardCache.cs, helper/src/Precheck.Core/Reception/BoardBuilder.cs, helper/src/Precheck.Core/Reception/BoardModel.cs, helper/tests/Precheck.Core.Tests/Reception/ReceptionTiming.test.cs, helper/tests/Precheck.Core.Tests/Reception/BoardCache.test.cs, helper/tests/Precheck.Core.Tests/Reception/BoardBuilder.test.cs, helper/tests/reception-timing.dotnet.test.ts, helper/tests/reception-cache.dotnet.test.ts, helper/tests/reception-board.dotnet.test.ts, reception/www/poll.js, reception/www/board.js, reception/www/offline.js, reception/www/api.js, reception/tests/poll.test.ts, reception/tests/board.test.ts, reception/tests/offline.test.ts, reception/tests/api.test.ts, reception/tests/app.test.ts, reception/tests/fixtures.ts, reception/tests/alert.test.ts, reception/www/app.js, reception/www/xray.js, reception/www/detail.js
- Tests: helper/tests/reception-timing.dotnet.test.ts, reception/tests/poll.test.ts, reception/tests/board.test.ts, reception/tests/offline.test.ts, reception/tests/app.test.ts, reception/tests/alert.test.ts
- TDD: required
- 사용자 결정(2026-11-05): 화면 저절로 읽기 10초 → 5초. `ReceptionTiming.PollSeconds = 5`·`CacheSeconds = 4` 한 곳(`CacheSeconds < PollSeconds` 시험). `BoardCache` 묶음은 `CacheSeconds`, 3배 쉼·실패 뒤 10초·`fresh` 2초는 그대로. `/api/board` 답에 `every`(= `PollSeconds`). 화면: 다음 저절로 읽기·머리 글 "N초마다 저절로 바뀌어요"·끊김 글 "N초마다 다시 확인하는 중"을 `every`로(처음 연결 전에는 `poll.js`의 기본값 5 하나). `every`가 없거나 2~60 밖이면 모양 틀림(AC-1407.4). 화면 파일에 다른 간격 숫자 없음(글자 시험). 실제 비트 부담은 AC-1403.10(의원 PC)

## TASK-32: 확인 로그인 창 고침 (묻기·가운데·맨 앞·60초)
- Step: Phase 1 · Step 6 · `check-login-window`
- 병렬: 아니오 (TASK-6 뒤, 의원 PC 1회차 결과)
- AC: AC-1401.14, AC-1401.15, AC-1401.16
- REQ: REQ-1401
- Files: helper/src/Precheck.Core/Reception/Check/CheckRunner.cs, helper/src/Precheck.Core/Reception/Check/LoginWait.cs, helper/src/Precheck.Windows/ReceptionCheckEntry.cs, helper/src/Precheck.Windows/CheckLoginWindow.cs, helper/tests/Precheck.Core.Tests/Reception/Check/CheckRunner.test.cs, helper/tests/Precheck.Core.Tests/Reception/Check/LoginWait.test.cs, helper/tests/Precheck.Core.Tests/Reception/Check/CheckStart.test.cs, helper/tests/reception-check-login.dotnet.test.ts
- Tests: helper/tests/reception-check-login.dotnet.test.ts
- TDD: required
- 의원 PC 1회차(2026-11-05): 4/7에서 비트 log4net 오류 글만 나오고 로그인 창이 보이지 않았다. 묻기(엔터 = 띄우기, 0 = 건너뛰기)·건너뜀 줄·60초/5분 기다림은 가짜 콘솔·가짜 시계로 시험. 창 찾기·가운데·맨 위(`EnumWindows`·`SetWindowPos`)와 표준 오류 버리기는 윈도우 부분이라 글자 시험 + net48 빌드(`buildDotnet`)만, 실제는 의원 PC(AC-1401.13). 도우미의 등록·통계 로그인 길은 고치지 않는다

## TASK-33: 확인 고침 2 (로그인 기본 건너뛰기·증상 글 SQL 찾기)
- Step: Phase 1 · Step 7 · `check-symptom-search`
- 병렬: 아니오 (TASK-32 뒤, 의원 PC 1회차 결과)
- AC: AC-1401.14, AC-1401.17, AC-1401.9, AC-1401.11
- REQ: REQ-1401
- Files: helper/src/Precheck.Core/Reception/Check/CheckRunner.cs, helper/src/Precheck.Core/Reception/Check/ProbeSql.cs, helper/src/Precheck.Windows/CheckBitDb.cs, helper/tests/Precheck.Core.Tests/Reception/Check/CheckFakes.test.cs, helper/tests/Precheck.Core.Tests/Reception/Check/CheckRunner.test.cs, helper/tests/Precheck.Core.Tests/Reception/Check/CheckSymptom.test.cs, helper/tests/Precheck.Core.Tests/Reception/Check/CheckStart.test.cs, helper/tests/reception-check-symptom.dotnet.test.ts
- Tests: helper/tests/reception-check-symptom.dotnet.test.ts
- TDD: required
- 의원 PC 1회차(2026-11-06 07:19 KST): 비트에 아이디·비밀번호가 없고(늘 자동 로그인) 4/7 로그인 창이 쓸 수 없게 떴고 한 번은 엔터 뒤 콘솔이 1분 넘게 멈췄다. 그래서 4/8 로그인은 `1`일 때만, 기본은 건너뛰기. 증상 칸(지난 진료)은 SQL로: 6/8에서 친 증상 글 조각으로 후보 칸마다 지난 14일 줄을 DB 안에서 센다(가짜 콘솔·가짜 DB로 시험, 틀은 IsTextCount 글자 시험). 단계 표시 1/8~8/8. 접수 현황 화면·PrecheckReception.exe·설치된 도우미·레지스트리는 고치지 않는다. 실제 칸은 의원 PC 2회차(AC-1401.13)

## TASK-34: 확인 고침 3 (증상 기록지 코드·상태 내력)
- Step: Phase 1 · Step 8 · `check-sheet-status`
- 병렬: 아니오 (TASK-33 뒤, 의원 PC 2회차 결과)
- AC: AC-1401.18, AC-1401.19, AC-1401.9, AC-1401.10
- REQ: REQ-1401
- Files: helper/src/Precheck.Core/Reception/Check/CheckRunner.cs, helper/src/Precheck.Core/Reception/Check/CheckSql.cs, helper/src/Precheck.Core/Reception/Check/ProbeSql.cs, helper/src/Precheck.Core/Reception/Check/CheckReport.cs, helper/src/Precheck.Windows/CheckBitDb.cs, helper/tests/Precheck.Core.Tests/Reception/Check/CheckFakes.test.cs, helper/tests/Precheck.Core.Tests/Reception/Check/CheckRunner.test.cs, helper/tests/Precheck.Core.Tests/Reception/Check/CheckSymptom.test.cs, helper/tests/Precheck.Core.Tests/Reception/Check/CheckStart.test.cs, helper/tests/Precheck.Core.Tests/Reception/Check/CheckSql.test.cs, helper/tests/Precheck.Core.Tests/Reception/Check/CheckCodes.test.cs, helper/tests/reception-check-codes.dotnet.test.ts
- Tests: helper/tests/reception-check-codes.dotnet.test.ts
- TDD: required
- 의원 PC 2회차(2026-11-06 09:00 KST): 진료보류·접수 취소 코드와 증상 기록지 코드를 아직 모른다. 가짜 콘솔·가짜 DB로 시험하고 net48 빌드(`buildDotnet`). 끝나면 zip 3과 같은 방법으로 `비트확인4.zip`(저장소에 넣지 않음). 접수 현황 화면·PrecheckReception.exe는 고치지 않는다

## TASK-35: 접수 현황 따로 설치 zip
- Step: Phase 4 · Step 5 · `reception-own-zip`
- 병렬: 아니오 (TASK-27 뒤, 사용자 결정 2026-11-06)
- AC: AC-1411.2, AC-1411.3, AC-1411.6, AC-1412.1, AC-1412.3, AC-1413.3
- REQ: REQ-1411, REQ-1412, REQ-1413
- Files: helper/install/install-reception.cmd, helper/install/install-reception.ps1, helper/install/uninstall-reception.cmd, helper/install/uninstall-reception.ps1, .github/workflows/helper.yml, helper/tests/reception-own-zip.test.ts, helper/tests/reception-install.test.ts
- Tests: helper/tests/reception-own-zip.test.ts, helper/tests/reception-install.test.ts
- TDD: required
- design.md 11절 '따로 설치'. 글자 시험: 네 파일(.cmd ASCII 한 줄·.ps1 UTF-8 BOM), 관리자 권한 명령 없음, 자기 폴더 `PrecheckReception\`만 덮어쓰고 지움, 도우미 없으면 멈춤, `PrecheckHelper` 끄기·덮어쓰기·크롬 등록 없음, 시작 항목·바로 가기 `--link` 짝, zip 단계의 `precheck-reception-<Version>.zip`과 artifact. `reception-install.test.ts`는 helper.yml 비교가 새 artifact 단계를 받아들이게만 고친다. 실제 설치는 의원 PC에서 본다

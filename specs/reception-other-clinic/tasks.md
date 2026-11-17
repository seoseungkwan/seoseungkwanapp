# 작업 분할: 다른 병원용 접수 현황 — 설정 화면·혼자 설치

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> 같은 Phase의 TASK는 서로 같은 파일을 고치지 않아 일꾼이 나란히 한다. 앞 Phase를 합친 뒤 다음 Phase를 시작한다.
> **Phase 1** — 일꾼 셋: TASK-1 설정 파일(C#) · TASK-4 혼자 설치(C#·설치 파일) · TASK-5 화면 머리·로고·읽고 쓰기
> **Phase 2** — 일꾼 셋: TASK-2 칸 일반화(C#) · TASK-3 새 길 부품(C#) · TASK-6 어레인지 표·넣기 창(화면)
> **Phase 3** — 일꾼 둘: TASK-7 설정 쪽(화면) · TASK-8 잇기·끝까지 시험(C#)
> 끝: 합치기 → 전체 시험·lint → 화면 확인(가짜 판) → 전체 검토 한 번 → 접수 현황 새 설치 zip → [의원 PC] 확인
> 화면 TASK는 가짜 판·설정·코드 목록을 `reception/tests/fixtures.ts`로 쓴다(서버 없이). C# TASK의 새 인자는 끝 선택 인자라 `Precheck.Reception/ReceptionServices.cs`는 TASK-8 전까지 그대로 컴파일된다.

## TASK-1: 설정 문서·저장·옮기기·로고 저장 (C#)
- Step: Phase 1 (A)
- AC: AC-5701.1, AC-5701.2, AC-5701.3, AC-5701.4, AC-5701.5, AC-5701.6, AC-5701.7, AC-5701.8, AC-5706.1
- REQ: REQ-5701, REQ-5706
- Files: helper/src/Precheck.Core/Reception/Settings/*.cs, helper/src/Precheck.Core/Reception/PickLists.cs, helper/tests/Precheck.Core.Tests/Reception/Settings/*.test.cs, helper/tests/Precheck.Core.Tests/Reception/PickLists.test.cs, helper/tests/reception-settings.dotnet.test.ts
- Tests: helper/tests/reception-settings.dotnet.test.ts, helper/tests/reception-pick-lists.dotnet.test.ts
- TDD: required
- 새 파일: `ReceptionSettings.cs`(모양·검사·Ours·Fresh·ChangeProblem)·`SettingsStore.cs`·`LogoStore.cs`·`LogoImage.cs`(서명·크기만 읽기). `PickLists`에는 `Extra`만 더하고 옛 파일 읽기 규칙은 그대로. 우리 의원 처음 값의 코드(SONO1·SONO·EB422·EB466·HA280 / CARM1·G0400)는 여기 글로 적는다(ArrangeMap과 같은지는 TASK-2가 본다). 시험 이름 공간 `Precheck.Core.Tests.Reception.Settings`. 품은 wordmark는 대리자로 받아 시험은 가짜 바이트를 쓴다

## TASK-2: 칸 일반화 — 열쇠 글·여러 칸 맞춤·단계·판 cfg (C#)
- Step: Phase 2 (A)
- AC: AC-5702.1, AC-5702.2, AC-5702.3, AC-5703.1, AC-5703.2, AC-5703.3, AC-5703.4, AC-5703.5, AC-5703.6
- REQ: REQ-5702, REQ-5703
- Files: helper/src/Precheck.Core/Reception/ArrangeLayout.cs, helper/src/Precheck.Core/Reception/ArrangeMap.cs, helper/src/Precheck.Core/Reception/ArrangeMarks.cs, helper/src/Precheck.Core/Reception/ArrangeWrite.cs, helper/src/Precheck.Core/Reception/ArrangeBuilder.cs, helper/src/Precheck.Core/Reception/BoardModel.cs, helper/src/Precheck.Core/Reception/BoardBuilder.cs, helper/src/Precheck.Core/Reception/Check/CheckReport.cs, helper/src/Precheck.Core/Reception/Http/ReceptionRouter.cs, helper/tests/Precheck.Core.Tests/Reception/ArrangeColumns.test.cs, helper/tests/Precheck.Core.Tests/Reception/Arrange*.test.cs, helper/tests/Precheck.Core.Tests/Reception/EswtChoices.test.cs, helper/tests/Precheck.Core.Tests/Reception/PickWrite.test.cs, helper/tests/Precheck.Core.Tests/Reception/BoardBuilder.test.cs, helper/tests/Precheck.Core.Tests/Reception/Check/CheckArrange.test.cs, helper/tests/Precheck.Core.Tests/Reception/Check/CheckReport.test.cs, helper/tests/Precheck.Core.Tests/Reception/Http/ArrangeRoute.test.cs, helper/tests/Precheck.Core.Tests/Reception/Http/ListsRoute.test.cs, helper/tests/Precheck.Core.Tests/Reception/Http/ReceptionRouter.test.cs, helper/tests/reception-columns.dotnet.test.ts
- Tests: helper/tests/reception-columns.dotnet.test.ts, helper/tests/reception-arrange-map.dotnet.test.ts, helper/tests/reception-arrange-marks.dotnet.test.ts, helper/tests/reception-arrange-write.dotnet.test.ts, helper/tests/reception-arrange-board.dotnet.test.ts, helper/tests/reception-arrange-tune.dotnet.test.ts, helper/tests/reception-arrange-fill.dotnet.test.ts, helper/tests/reception-arrange-autoend.dotnet.test.ts, helper/tests/reception-pick-lists.dotnet.test.ts, helper/tests/reception-eswt-hits.dotnet.test.ts, helper/tests/reception-board.dotnet.test.ts, helper/tests/reception-check-arrange.dotnet.test.ts, helper/tests/reception-check-report.dotnet.test.ts, helper/tests/reception-server.dotnet.test.ts
- TDD: required
- `ArrangeCol` 열거형을 열쇠 글(`ArrangeKeys`)로 바꾼다. 옛 시험은 `ArrangeLayout.Ours`로 부르게만 고치고 **기대값은 바꾸지 않는다**(우리 화면이 같다는 증거). 라우터는 끝 선택 인자 `Func<ReceptionSettings>?`(없으면 우리 의원 처음 값)로 판 cfg·칸·쓰기 검사를 만든다. 새 길은 만들지 않는다(TASK-3·8). 새 C# 시험 이름 공간 `Precheck.Core.Tests.Reception.Columns`

## TASK-3: 새 길 부품 — 설정·코드 목록·로고·길별 몸 한도 (C#)
- Step: Phase 2 (B)
- AC: AC-5704.1, AC-5704.2, AC-5705.1, AC-5705.2, AC-5705.3, AC-5705.4, AC-5706.1, AC-5706.2, AC-5706.3, AC-5714.2
- REQ: REQ-5704, REQ-5705, REQ-5706, REQ-5714
- Files: helper/src/Precheck.Core/Reception/Http/SettingsRoutes.cs, helper/src/Precheck.Core/Reception/Http/BodyLimits.cs, helper/src/Precheck.Core/Reception/Http/HttpRequestReader.cs, helper/src/Precheck.Core/Reception/Http/ClientGuard.cs, helper/src/Precheck.Core/Reception/Http/ReceptionServer.cs, helper/src/Precheck.Core/Reception/CodesReader.cs, helper/src/Precheck.Core/Reception/ReceptionSql.cs, helper/src/Precheck.Core/Bit/Sql.cs, helper/tests/Precheck.Core.Tests/Reception/Http/SettingsRoutes.test.cs, helper/tests/Precheck.Core.Tests/Reception/Http/BodyLimits.test.cs, helper/tests/Precheck.Core.Tests/Reception/CodesReader.test.cs, helper/tests/Precheck.Core.Tests/Reception/Http/HttpRequestReader.test.cs, helper/tests/Precheck.Core.Tests/Reception/Http/ClientGuard.test.cs, helper/tests/Precheck.Core.Tests/Reception/Http/ReceptionServer.test.cs, helper/tests/Precheck.Core.Tests/Reception/ReceptionSql.test.cs, helper/tests/reception-settings-routes.dotnet.test.ts, helper/tests/reception-http.dotnet.test.ts
- Tests: helper/tests/reception-settings-routes.dotnet.test.ts, helper/tests/reception-http.dotnet.test.ts, helper/tests/reception-server.dotnet.test.ts, helper/tests/reception-sql.dotnet.test.ts, helper/tests/reception-arrange-sql.dotnet.test.ts, helper/tests/reception-check-sql.dotnet.test.ts
- TDD: required
- `SettingsRoutes`는 `HttpRequest → HttpResponse` 부품 다섯(GET·POST settings, GET codes, GET code/{c}, POST·GET logo)이고 라우터에 잇는 것은 TASK-8이다(TASK-2와 같은 파일을 고치지 않게). 코드 목록 읽기는 가짜 `IBitDb`로 본다. 몸 한도 표(8192 기본·settings 32768·logo 2097152)는 `BodyLimits` 한 곳이고, 8192를 박아 둔 옛 시험은 그대로 통과해야 한다. 새 C# 시험 이름 공간 `Precheck.Core.Tests.Reception.SettingsRoutes`

## TASK-4: 혼자 설치 — `--register`·설치·지우기 (C#·설치 파일)
- Step: Phase 1 (B)
- AC: AC-5707.1, AC-5707.2, AC-5707.3, AC-5707.4, AC-5707.5
- REQ: REQ-5707
- Files: helper/src/Precheck.Core/Reception/ReceptionStart.cs, helper/src/Precheck.Reception/Program.cs, helper/src/Precheck.Reception/RegisterEntry.cs, helper/install/install-reception.ps1, helper/install/uninstall-reception.ps1, helper/tests/Precheck.Core.Tests/Reception/ReceptionStart.test.cs, helper/tests/reception-host.dotnet.test.ts, helper/tests/reception-install.test.ts, helper/tests/reception-own-zip.test.ts
- Tests: helper/tests/reception-host.dotnet.test.ts, helper/tests/reception-install.test.ts, helper/tests/reception-own-zip.test.ts
- TDD: required
- `ReceptionStart`의 `--register` 갈래(끝 번호 0·3·1, 뮤텍스·서버 없음)는 C# 시험으로, 설치·지우기 글과 차례(막힘 풀기 → 등록 → 끄기 → 덮어쓰기 …)는 지금처럼 글자 시험으로 본다. 진짜 비트 로그인·확인 창은 [의원 PC](AC-5707.6). `RegisterEntry.cs`는 `ReceptionServices.cs`를 고치지 않고 같은 부품으로 `BitServices`를 만든다(합치기는 TASK-8). zip 구성(helper.yml)은 그대로라 고치지 않는다

## TASK-5: 화면 읽고 쓰기·머리·로고·탭 끄기·아이콘 (화면)
- Step: Phase 1 (C)
- AC: AC-5708.1, AC-5708.2, AC-5708.3, AC-5709.1, AC-5709.2, AC-5709.3, AC-5709.4, AC-5714.1
- REQ: REQ-5708, REQ-5709, REQ-5714
- Files: reception/www/api.js, reception/www/board.js, reception/www/detail.js, reception/www/charts.js, reception/www/offline.js, reception/www/index.html, reception/www/manifest.webmanifest, reception/www/icon.png, reception/www/app.js, reception/www/style.css, reception/tools/make-icon.py, reception/tests/fixtures.ts, reception/tests/api.test.ts, reception/tests/board.test.ts, reception/tests/detail.test.ts, reception/tests/charts.test.ts, reception/tests/offline.test.ts, reception/tests/shell.test.ts, reception/tests/app.test.ts
- Tests: reception/tests/api.test.ts, reception/tests/board.test.ts, reception/tests/detail.test.ts, reception/tests/charts.test.ts, reception/tests/offline.test.ts, reception/tests/shell.test.ts, reception/tests/app.test.ts
- TDD: required
- fixtures.ts에 판 `cfg`(우리 의원 처음 값·새 병원 처음 값 둘)·설정 문서·코드 목록 가짜 값을 더한다(TASK-6·7이 쓴다). [⚙ 설정]은 `#/s`로 가는 것까지(설정 쪽 그리기는 TASK-7, 그 전에는 빈 쪽). `logo-mark.png`·`logo-wordmark.png` 파일은 지우지 않는다. shell.test.ts의 로고 기대값은 `icon.png`로 고친다

## TASK-6: 어레인지 표 — 설정 칸·여러 개 글·안내 줄·넣기 창 두 모드 (화면)
- Step: Phase 2 (C)
- AC: AC-5710.1, AC-5710.2, AC-5710.3, AC-5710.4, AC-5710.5, AC-5711.1, AC-5711.2, AC-5711.3, AC-5711.4, AC-5711.5
- REQ: REQ-5710, REQ-5711
- Files: reception/www/arrange.js, reception/www/style.css, reception/tests/fixtures.ts, reception/tests/arrange.test.ts, reception/tests/arrange-app.test.ts, reception/tests/layout.test.ts
- Tests: reception/tests/arrange.test.ts, reception/tests/arrange-app.test.ts, reception/tests/layout.test.ts
- TDD: required
- 지금 어레인지 시험은 우리 의원 처음 값 cfg로 그대로 통과해야 한다(쓰는 법 글은 AC-5710.2 글로 고침). 넣기 창 [☰ 목록 고치기]는 `view.onEditCol(col, 'list', { back })`를 부르는 데까지(창 열기·돌아오기는 TASK-7). 안내 줄 [설정에서 고르기]는 TASK-5의 `view.onSettings`

## TASK-7: 설정 쪽·처음 설정 안내·칸 고치기·칸 더하기·로고 줄이기 (화면)
- Step: Phase 3 (A)
- AC: AC-5711.4, AC-5712.1, AC-5712.2, AC-5712.3, AC-5712.4, AC-5712.5, AC-5712.6, AC-5712.7, AC-5712.8, AC-5713.1, AC-5713.2, AC-5713.3, AC-5713.4, AC-5713.5, AC-5713.6, AC-5713.7, AC-5713.8, AC-5713.9, AC-5713.10, AC-5714.1
- REQ: REQ-5711, REQ-5712, REQ-5713, REQ-5714
- Files: reception/www/settings.js, reception/www/picks.js, reception/www/app.js, reception/www/style.css, reception/tests/fixtures.ts, reception/tests/settings.test.ts, reception/tests/settings-app.test.ts, reception/tests/picks.test.ts, reception/tests/arrange-app.test.ts, reception/tests/app.test.ts, reception/tests/shell.test.ts
- Tests: reception/tests/settings.test.ts, reception/tests/settings-app.test.ts, reception/tests/picks.test.ts, reception/tests/arrange-app.test.ts, reception/tests/app.test.ts, reception/tests/shell.test.ts
- TDD: required
- 화면 글은 시안 notes.md 목록 그대로. 로고 줄이기(`shrinkLogo`)는 canvas를 가짜로 바꿔 크기 계산·형식(PNG 그대로·그 밖 JPEG)·20MB 막기만 시험하고, 진짜 사진은 [의원 PC](AC-5706.4). 옛 목록 고치기 창(`POST /api/lists`)은 없애고 칸 고치기 [고르기 목록] 탭이 설정 문서로 저장한다. 바로 저장·[되돌리기]·409는 가짜 fetch로 본다

## TASK-8: 잇기 — 라우터에 새 길·옛 목록 길 닫기·서버 부품·끝까지 시험 (C#)
- Step: Phase 3 (B)
- AC: AC-5704.3, AC-5704.4, AC-5705.5, AC-5706.2, AC-5706.4, AC-5707.6, AC-5707.7
- REQ: REQ-5704, REQ-5705, REQ-5706, REQ-5707
- Files: helper/src/Precheck.Core/Reception/Http/ReceptionRouter.cs, helper/src/Precheck.Reception/ReceptionServices.cs, helper/src/Precheck.Reception/RegisterEntry.cs, helper/tests/Precheck.Core.Tests/Reception/Http/OtherClinic.test.cs, helper/tests/Precheck.Core.Tests/Reception/Http/ListsRoute.test.cs, helper/tests/Precheck.Core.Tests/Reception/Http/ReceptionRouter.test.cs, helper/tests/Precheck.Core.Tests/Reception/StaticEmbed.test.cs, helper/tests/reception-other-clinic.dotnet.test.ts, helper/tests/reception-own-zip.test.ts
- Tests: helper/tests/reception-other-clinic.dotnet.test.ts, helper/tests/reception-http.dotnet.test.ts, helper/tests/reception-server.dotnet.test.ts, helper/tests/reception-embed.dotnet.test.ts, helper/tests/reception-own-zip.test.ts
- TDD: required
- 끝까지 시험(가짜 비트·임시 data 폴더): 새 병원 처음 켜기 → 판 cfg(로고 없이·SONO·C-ARM empty) → 설정 저장(SONO 코드) → 다음 판에서 그 처방이 SONO 칸에 듦 → 로고 올리기 → 판 logo.ver +1 → `GET /api/logo` 그림, 그리고 옛 표시 파일이 있는 data 폴더면 우리 의원 처음 값. `POST /api/lists` 404. `ReceptionServices`가 시작할 때 `SettingsStore.Current()`를 한 번 부르고, `RegisterEntry`와 부품 만들기를 하나로 모은다. 새 화면 파일(settings.js·icon.png)이 품기에 드는지 본다. [의원 PC] AC 넷은 합친 뒤 새 zip으로 사람이 본다(이 TASK의 시험은 그 길이 이어졌는지만). 새 C# 시험 이름 공간 `Precheck.Core.Tests.Reception.OtherClinic`

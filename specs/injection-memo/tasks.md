# 작업 분할: 주사 차수 → 비트 접수메모(당일) 채우기

> Phase 1: TASK-1·2 병렬 → Phase 2: TASK-3 → Phase 3: TASK-4(PT 종이 zip, 마지막 검토 한 번). 서류 인쇄(doc-print)는 2026-11-20 사용자 결정으로 뺌 — 갈래는 PT 종이(feat-pt-slip e0f39a62) 위에 다시 쌓음. 같은 Phase 파일 겹침 없음. C#은 `PATH="$HOME/.dotnet:$PATH"`, dotnet 시험은 잠금으로 차례대로.

## TASK-1: Core 규칙·읽기·설정
- Phase: 1 · 병렬
- AC: AC-7501.1, AC-7501.2, AC-7501.3, AC-7501.4, AC-7501.5, AC-7502.1, AC-7503.1, AC-7503.3, AC-7504.1
- REQ: REQ-7501, REQ-7502, REQ-7503, REQ-7504
- Files: helper/src/Precheck.Core/InjectionMemo/**, helper/src/Precheck.Core/Bit/Sql.cs, helper/tests/Precheck.Core.Tests/InjectionMemo/**, helper/tests/injection-memo.dotnet.test.ts
- Tests: helper/tests/injection-memo.dotnet.test.ts
- TDD: required — design.md 이름표 그대로, 조사 초안 규칙을 옮김. 시험은 지어낸 글만(notes 모양 그대로), DB는 가짜 `IBitDb`

## TASK-2: 접수 화면 바탕
- Phase: 1 · 병렬
- AC: AC-7503.2
- REQ: REQ-7503
- Files: helper/src/Precheck.PtSlip/ReceptionWindows.cs, helper/src/Precheck.PtSlip/MemoTyper.cs, helper/src/Precheck.PtSlip/HotKeys.cs, helper/src/Precheck.PtSlip/MemoSettingsFile.cs
- Tests: (없음)
- TDD: exempt — Win32·UI Automation 얇은 층, Core InjectionMemo 타입을 쓰지 않는다. 이 PC 비트 접수 화면에서 칸 찾기·**테스트 환자로 저장 없이** 글 넣고 지우기로 확인. Release 빌드 경고 0

## TASK-3: 단추·알림·설정·잇기
- Phase: 2
- AC: AC-7503.2, AC-7503.3, AC-7504.1
- REQ: REQ-7503, REQ-7504
- Files: helper/src/Precheck.PtSlip/MemoButtonForm.cs, helper/src/Precheck.PtSlip/NoticeForm.cs, helper/src/Precheck.PtSlip/SettingsForm.cs, helper/src/Precheck.PtSlip/Program.cs, helper/src/Precheck.Core/InjectionMemo/MemoNotices.cs, helper/tests/Precheck.Core.Tests/InjectionMemo/**
- Tests: helper/tests/injection-memo.dotnet.test.ts
- TDD: required — '넣지 못함' 알림 글(MemoNotices.TypeFailed, AC-7503.3)은 시험 먼저. 시험에 남은 서류 인쇄 확인 한 줄(DocSql)은 뺀다. WinForms·잇기는 판단 없이 Core를 부르기만, 시안 글자 그대로, 가짜 DB 사진으로 확인

## TASK-4: 설치(높은 권한)·빌드·zip·검토
- Phase: 3
- AC: AC-7503.2, AC-7504.2
- REQ: REQ-7503, REQ-7504
- Files: helper/install/ptslip/**, specs/injection-memo/notes/**
- Tests: helper/tests/injection-memo.dotnet.test.ts
- TDD: exempt — 설치.cmd·지우기.cmd를 로그온 예약 작업(높은 권한)으로, 읽어주세요.txt에 주사 차수 단추·F8·'예' 한 번 안내. PT 종이 Release x86 zip(`PT후진료종이-설치-<날짜>-주사차수.zip`). 이 PC에서 높은 권한 PtSlip으로 테스트 환자로만 메모 칸 넣기 확인(저장 없이 지움). 마지막 검토 한 번

## TASK-5: 엑스레이 경과 Core (2026-11-20 더함)
- Phase: 4
- AC: AC-7505.1, AC-7505.2, AC-7505.3, AC-7506.1
- REQ: REQ-7505, REQ-7506
- Files: helper/src/Precheck.Core/InjectionMemo/**, helper/src/Precheck.Core/Bit/Sql.cs, helper/tests/Precheck.Core.Tests/InjectionMemo/**, helper/tests/injection-memo.dotnet.test.ts
- Tests: helper/tests/injection-memo.dotnet.test.ts
- TDD: required — design.md 이름표 그대로, 부위·코드 표는 notes/xray-parts.md 그대로. 시험은 지어낸 글·날짜만, DB는 가짜 `IBitDb`

## TASK-6: 두 알림·zip (2026-11-20 더함)
- Phase: 5
- AC: AC-7505.4
- REQ: REQ-7505
- Files: helper/src/Precheck.PtSlip/MemoButtonForm.cs, helper/src/Precheck.PtSlip/NoticeForm.cs, helper/src/Precheck.Core/InjectionMemo/MemoNotices.cs, helper/tests/Precheck.Core.Tests/InjectionMemo/**, helper/tests/injection-memo.dotnet.test.ts, helper/install/ptslip/**, specs/injection-memo/notes/**
- Tests: helper/tests/injection-memo.dotnet.test.ts
- TDD: exempt — WinForms 알림 둘 쌓기만(판단은 Core Reason). 읽어주세요.txt에 엑스레이 경과 한 줄. 가짜 화면 사진 확인, Release x86 zip 다시

## TASK-7: [엑스레이] 따로·고른 엑스레이·두 부위 주사 Core (2026-11-20 오후)
- Phase: 6
- AC: AC-7501.6, AC-7505.1, AC-7505.3, AC-7505.5, AC-7506.1
- REQ: REQ-7501, REQ-7505, REQ-7506
- Files: helper/src/Precheck.Core/InjectionMemo/**, helper/tests/Precheck.Core.Tests/InjectionMemo/**, helper/tests/injection-memo.dotnet.test.ts
- Tests: helper/tests/injection-memo.dotnet.test.ts
- TDD: required — Compute는 주사 차수만, ComputeXray·ComposeXray·MemoSettings.XrayParts, 두 부위 '오)어깨,목 N차'. 시험은 지어낸 글·가짜 IBitDb

## TASK-8: [엑스레이] 단추·설정 칸·zip (2026-11-20 오후)
- Phase: 7
- AC: AC-7505.4, AC-7505.5
- REQ: REQ-7505
- Files: helper/src/Precheck.PtSlip/MemoButtonForm.cs, helper/src/Precheck.PtSlip/NoticeForm.cs, helper/src/Precheck.PtSlip/SettingsForm.cs, helper/src/Precheck.PtSlip/MemoSettingsFile.cs, helper/src/Precheck.PtSlip/Program.cs, helper/src/Precheck.Core/InjectionMemo/MemoNotices.cs, helper/tests/Precheck.Core.Tests/InjectionMemo/**, helper/tests/injection-memo.dotnet.test.ts, helper/install/ptslip/**, specs/injection-memo/notes/**
- Tests: helper/tests/injection-memo.dotnet.test.ts
- TDD: exempt — WinForms 단추·체크 칸(판단은 Core). 가짜 화면 사진 확인, 읽어주세요 고침, Release x86 zip 다시

## TASK-9: 골절 fx Core (2026-11-20 오후)
- Phase: 8
- AC: AC-7507.1, AC-7507.2, AC-7507.3, AC-7507.4
- REQ: REQ-7507
- Files: helper/src/Precheck.Core/InjectionMemo/**, helper/tests/Precheck.Core.Tests/InjectionMemo/**, helper/tests/injection-memo.dotnet.test.ts
- Tests: helper/tests/injection-memo.dotnet.test.ts
- TDD: required — design.md 이름표 그대로, 부위 표는 notes/fracture.md 그대로. 시험은 지어낸 코드·글·가짜 IBitDb

## TASK-11: 족지·수지 번호 (2026-11-20 오후)
- Phase: 9
- AC: AC-7507.5
- REQ: REQ-7507
- Files: helper/src/Precheck.Core/InjectionMemo/**, helper/tests/Precheck.Core.Tests/InjectionMemo/**, helper/tests/injection-memo.dotnet.test.ts
- Tests: helper/tests/injection-memo.dotnet.test.ts
- TDD: required — FractureRule.Text에 번호, 시험은 지어낸 코드·글

## TASK-10: 읽어주세요·zip (2026-11-20 오후)
- Phase: 10
- AC: AC-7507.3, AC-7507.5
- REQ: REQ-7507
- Files: helper/install/ptslip/**, specs/injection-memo/notes/**
- Tests: helper/tests/injection-memo.dotnet.test.ts
- TDD: exempt — 읽어주세요.txt에 골절 fx 한 줄(화면·알림은 그대로). 90일 대조 다시, Release x86 zip 다시

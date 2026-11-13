# 작업 분할: ERP 마감일지 기간 채우기

> 형식: `## TASK-n: 제목` 아래 `- REQ:`, `- AC:`, `- Files:`(수정 범위), `- Tests:`, `- TDD:`, `- 차례:`. 승인되면 Files/Tests 경로만 고칠 수 있다.
> **할 순서** (사용자 "Phase별로 step으로하고 병렬로 할수있는건 병렬로해 검토는 마지막에 한번만"):
> - Phase 1 — Step 1: TASK-1(공용 타입, 작음, 리드가 바로) → Step 2: TASK-2 ‖ TASK-3(파일이 겹치지 않아 일꾼 둘이 각자 worktree에서 동시에)
> - Phase 2 — TASK-4 ‖ TASK-5(일꾼 둘)
> - 마지막 검토 한 번(확장 시험 전체·lint·`npm run ext-erp:build`·`git diff c745fdc -- helper helper-erp src`에 코드 변경 없음(문서 `helper-erp/install/README.md`의 판 문장만)·화면 사진)
> - Phase 2b(마지막 검토·오류/드문 경우 점검에서 나온 것, 사용자 "4가지 모두 고치기"·"92일까지"·"고친 부분 시험만 확인") — Step 1: 리드가 `rangeTypes.ts` 새 Block·`MAX_DAYS` → Step 2: TASK-7 ‖ TASK-8(일꾼 둘) → 합친 뒤 확장 시험 전체 → 설치 파일
> - Phase 2c(2026-11-13 사용자 "그냥 저거 없애고 코드 추가만 할 수 있게 해줘"·"비트에 등록된 코드 전부") — Step 1: TASK-9 ‖ TASK-10(파일 안 겹침, 일꾼 둘) → Step 2: TASK-11 ‖ TASK-14(읽지 않을 처방이 규칙으로 바뀜, 사용자 "LA357만 빼기", 일꾼 둘) → TASK-13 → TASK-12 → 확장 시험 전체·도우미 시험(net48 포함)·빌드 → 설치 파일 다시(확장 + 도우미)
> - Phase 2d(2026-11-13 사용자 "이거 헷갈리게되어있는거같은데" → "평소엔 안 묻기") — TASK-15 하나(일꾼 또는 리드) → 확장 시험 전체·빌드 → 확장 설치 파일만 다시(도우미 그대로) → 고친 부분 검토
> - Phase 2e(2026-11-13 사용자가 다른 PC에서 새 판을 깔고도 질문이 나옴 → 질문 답 "2번으로하자" = 그날 실제로 두 번 센 돈이 있을 때만 묻기, 사용자 "phase별로 step으로 병렬로 할수 있는건 병렬로하고 검토는 마지막 한번만해") — Step 1: 리드가 명세(REQ-3711) → 사용자 `/sdd approve` → Step 2: TASK-16 ‖ TASK-17(파일 안 겹침, 일꾼 둘) → 합친 뒤 확장 시험 전체·도우미 시험(net48 포함)·빌드 → 설치 파일 다시(확장 + 도우미) → 마지막 검토 한 번
> - Phase 3 — TASK-6(사용자와 실제 ERP 화면)
> 각 TASK는 시험을 먼저 써서 RED를 본다. 지금 확장 시험은 기대값을 바꾸지 않는다(바꿔야 하면 그 TASK 보고에 까닭).

## 먼저 할 일 (코드 작업 아님)
1. 승인된 시안은 `docs/mockups/erp-closing-range/`에 있다
2. 사용자가 `/sdd approve erp-closing-range`를 입력한다

## TASK-1: 공용 타입과 시간 상수
- REQ: REQ-3703
- AC: AC-3703.3, AC-3703.4
- Files: extension-erp/src/rangeTypes.ts, extension-erp/src/rangeTypes.test.ts
- Tests: extension-erp/src/rangeTypes.test.ts
- TDD: required — design.md 5절 그대로. 시험은 시간 상수 값(30초·30초·400ms·1초)과 `Block`·`RangeView` 모양을 쓰는 작은 예(타입 검사가 통하는지)
- 차례: Phase 1 Step 1

## TASK-2: ERP 화면 다루기와 가짜 ERP 화면 넓히기
- REQ: REQ-3702, REQ-3703, REQ-3705
- AC: AC-3702.1, AC-3703.1, AC-3703.2, AC-3703.3, AC-3703.4, AC-3705.2
- Files: extension-erp/src/erpday.ts, extension-erp/src/erpday.test.ts, extension-erp/src/__tests__/erpPage.ts, extension-erp/src/main.ts
- Tests: extension-erp/src/erpday.test.ts
- TDD: required — design.md 2절·7절. 가짜 화면으로: 날짜 칸 value + input으로 날이 바뀜·focus 안 줌, 안 바뀌면 1초 뒤 replaceState+popstate, `waitLoaded` ok(400ms 이어짐)·'불러오는 중입니다.'·`.load-state-error` → error·안 그려짐 → timeout, 2 탭이면 1 탭을 누름, `blocker` 네 가지와 차례, `draftNotice`, `readJournal`(없음·작성중·확정), `save` w1·w2 ok·error·timeout·missing(막힌 단추는 안 누름)·누르기 전 쪽지는 안 셈·'저장 중...' 동안은 ok 아님, 누른 단추가 탭·두 저장뿐. `main.ts`는 `readDate`(와 `dateLabels`)를 `erpday.ts`로 옮겨 다시 export하는 것만(동작 그대로, 지금 main 시험 그대로 통과). 가짜 화면을 넓혀도 지금 시험은 그대로 통과
- 차례: Phase 1 Step 2 (TASK-1 뒤, TASK-3과 함께)

## TASK-3: 기간 안내 그리기와 [기간 채우기] 단추
- REQ: REQ-3701, REQ-3702, REQ-3704, REQ-3705
- AC: AC-3701.1, AC-3701.2, AC-3701.3, AC-3701.4, AC-3702.2, AC-3702.3, AC-3702.4, AC-3704.1, AC-3704.2, AC-3705.1, AC-3705.2, AC-3705.3
- Files: extension-erp/src/rangeView.ts, extension-erp/src/rangeView.test.ts, extension-erp/src/panel.ts, extension-erp/src/panel.test.ts
- Tests: extension-erp/src/rangeView.test.ts, extension-erp/src/panel.test.ts
- TDD: required — design.md 4절 글 그대로(시안 ①~⑤ 예시 숫자로: 10월 1일~31일 중 26일, 새로 18 · 이미 8(작성중 5 · 확정 3) · 건너뛸 5, 26일 중 11일, 25일 저장 · 건너뜀 5 · 못 함 1). `periodLabel` 네 모양, `dayList` 확정 표시·10개 넘음, pick 막는 줄 셋과 `disabled`·`max`, todayOnly, scanning 진행, confirm(S = 0·확정 없음이면 둘째 문장 없음·함께 있는 진료 지난번 / 묻기 → 고를 때까지 막힘·`aria-pressed`), running(×·Esc 없음, [멈추기] 뒤 '멈추는 중…'), stopped·blocked 다섯 까닭(+[이어서 하기] 셋만)·end(0인 줄 없음, n = 0), 결과 줄 까닭 다섯 글, 누른 단추마다 `act` 동작, 글은 textContent. `panel.ts`: [기간 채우기]가 [비트 값 채우기] 왼쪽, `onRange`, `showRange`, `setRangeBusy`면 두 단추·[지난 결과] 막힘, Esc·×는 design.md 4절 안내에서만 close. 지금 panel 시험 그대로 통과
- 차례: Phase 1 Step 2 (TASK-1 뒤, TASK-2와 함께)

## TASK-4: 기간 흐름과 화면 잇기
- REQ: REQ-3701, REQ-3702, REQ-3703, REQ-3704, REQ-3705
- AC: AC-3701.3, AC-3701.4, AC-3702.1, AC-3702.3, AC-3702.5, AC-3703.1, AC-3703.2, AC-3703.3, AC-3703.4, AC-3703.5, AC-3703.6, AC-3704.2, AC-3704.3, AC-3705.1, AC-3705.2
- Files: extension-erp/src/range.ts, extension-erp/src/range.test.ts, extension-erp/src/main.ts, extension-erp/src/main.range.test.ts, extension-erp/src/main.test.ts
- Tests: extension-erp/src/range.test.ts, extension-erp/src/main.range.test.ts, extension-erp/src/main.test.ts
- 덧붙임(Phase 1 합친 뒤): `main.test.ts`는 AC-3609.1 모듈 목록 시험 하나만 고친다 — 이름 규칙을 `/^\.\/[a-zA-Z]+\.js$/`로, 기대 목록에 `erpday.js`·`range.js`·`rangeTypes.js`·`rangeView.js`를 더함(새 파일 이름에 대문자가 있고 main이 새 모듈을 부르게 되어서). TASK-5의 manifest와 합쳐야 통과한다
- TDD: required — design.md 3절·6절. `range.test.ts`(가짜 deps): `rangeDays`(양 끝·달 넘김·하루), 살펴보기 분류(새로·작성중·확정·진료 0건·못 불러온 날·함께 있는 진료 합)·멈춤·그만두기, 채우기 차례(setDate → waitLoaded → blocker → draft → askDay → 0건 → fill → w1 → w2 → waitLoaded)·w1 실패면 w2 안 부름·다섯 실패 까닭·되살린 입력 건너뜀·멈춤(그날 남김)·[멈추기]는 날짜 바꾸기 전에 봄·이어서 하기 합침·`gone`이면 조용히 끝. `main.range.test.ts`(가짜 화면 + 가짜 chrome.runtime): 원무 화면·설정 없음, 사흘(새로·작성중·진료 0건) 살펴보기 → 승인 → 두 날만 저장(`saves`에 w1 → w2 차례, 그때 state가 비트 값, 상태 select 안 바뀜), 함께 있는 진료 묻기 → `saveOverlap`, [멈추기]·[이어서 하기], 새 판 창이 뜨면 멈춤, 화면을 떠나면 끝, [비트 값 채우기]는 여전히 저장 단추를 누르지 않음(AC-3703.6). chrome.storage에 새로 쓰는 것이 없음(AC-3703.5)
- 차례: Phase 2 (TASK-2·3 뒤, TASK-5와 함께)

## TASK-5: 새 판 번호·모듈 목록·안내서
- REQ: REQ-3706
- AC: AC-3706.1
- Files: extension-erp/manifest.json, extension-erp/src/manifest.test.ts, extension-erp/README.md, extension-erp/src/readme.test.ts, helper-erp/install/README.md
- Tests: extension-erp/src/manifest.test.ts, extension-erp/src/readme.test.ts
- TDD: required — `version` 0.3.0, `web_accessible_resources`에 `erpday.js`·`range.js`·`rangeView.js`·`rangeTypes.js`가 더해짐(다른 칸 그대로). README '기간 채우기' 절(쓰는 법 ①~⑤ 글이 design.md 4절과 같음·누르는 단추 둘·멈추는 경우 다섯·원무 계정 안 됨·도는 동안 창 닫지 않기)과 '확장이 건드리지 않는 것' 새 문장, 옛 문장 없음. 지금 README 시험(panel.test.ts 안 것)은 그대로 통과해야 하며, 바뀌는 절 글이 그 시험과 부딪히면 보고
- 차례: Phase 2 (TASK-4와 함께)

## TASK-7: 멈추는 경우 더하기 — 화면 다루기·안내 글·안내서
- REQ: REQ-3701, REQ-3705, REQ-3706
- AC: AC-3701.2, AC-3705.2, AC-3706.1
- Files: extension-erp/src/erpday.ts, extension-erp/src/erpday.test.ts, extension-erp/src/__tests__/erpPage.ts, extension-erp/src/rangeView.ts, extension-erp/src/rangeView.test.ts, extension-erp/README.md, extension-erp/src/readme.test.ts
- Tests: extension-erp/src/erpday.test.ts, extension-erp/src/rangeView.test.ts, extension-erp/src/readme.test.ts
- TDD: required — design.md 2절·4절. `erpday`: `todayOnly(doc)` export(안내 창이 떠 있어도 true), `blocker` 차례 끝에 `noSaveButton`(전체 저장 0개·2개, 일일 상세 저장 0개·2개), 둘째 길은 `/h/closing`일 때만. `rangeView`: pick 넷째 막는 줄(92일 = 통과·93일 = 막힘), `periodLabel` 올해 아닌 해 '{Y}년 ' 세 모양, blocked 새 다섯 까닭 글과 [이어서 하기](dateChanged만 더함), helper 줄 끝 ' (번호 {code})'. README '멈추는 경우' 표·기간 고르기에 92일, readme 시험이 화면 글과 같은지. 가짜 화면은 저장 단추 0개·2개를 만들 옵션이 필요하면 넓힌다(지금 시험 그대로 통과)
- 차례: Phase 2b Step 2 (TASK-8과 함께)

## TASK-8: 멈추는 경우 더하기 — 기간 흐름·잇기
- REQ: REQ-3701, REQ-3703, REQ-3705
- AC: AC-3701.1, AC-3701.3, AC-3703.1, AC-3705.2
- Files: extension-erp/src/range.ts, extension-erp/src/range.test.ts, extension-erp/src/main.ts, extension-erp/src/main.range.test.ts
- Tests: extension-erp/src/range.test.ts, extension-erp/src/main.range.test.ts
- TDD: required — design.md 3절·6절. `range.test.ts`(가짜 deps): 새 차례(overlapUnpicked → dateIs → missingCells → fill → dateIs → w1 → dateIs → w2), 멈춤마다 그날이 `remaining` 맨 앞·`fill`/`save`를 부르지 않음(⑦⑧⑨는 칸을 안 바꿈), dateChanged 뒤 이어서 하기는 그날부터. `main.range.test.ts`(가짜 화면): 원무 + 안내 창이면 바로 todayOnly 안내, 마감 일자가 오늘 뒤 달이면 처음 값 오늘 달 1일~오늘, 92일 넘는 scan은 막힘, 채우는 중 마감 일자를 바꾸면 멈추고 다른 날에 저장하지 않음, 칸 하나를 화면에서 지우면 cellsMissing으로 멈추고 칸·저장 없음, 설정·승인 모두 고른 것이 없는데 그날 함께 있는 진료가 있으면 멈춤, 부품이 throw하면 unexpected 안내가 보이고 [닫기]로 단추가 풀림. 가짜 화면(`erpPage.ts`)은 TASK-7 몫이라 고치지 않고, 필요한 모양은 시험 안에서 DOM을 직접 바꿔 만든다
- 차례: Phase 2b Step 2 (TASK-7과 함께)

## TASK-6: 실제 ERP 화면 확인 (사용자와 함께, 코드 작업 없음)
- REQ: REQ-3706
- AC: AC-3706.2
- Files: specs/erp-closing-range/notes/erp-range-check.md
- Tests: (없음 — 사용자와 함께 보는 확인)
- TDD: n/a — 새 판 확장(0.3.0)을 이 PC 크롬에 붙이고 사용자가 고른 하루 이틀로: 날짜 바뀜·달력 창 안 열림·불러옴 신호·두 저장 쪽지·숨은 2 탭 저장·확정 유지·끝 안내·캘린더 반영, `notes/erp-screen-1113.md` '실제 화면에서 볼 것' 여섯 줄. 다르면 그 부분만 명세를 고쳐 다시 승인
- 차례: Phase 3 (마지막 검토·설치 파일 뒤)

## TASK-9: 설정 '매출로 셀 코드'는 코드만 더하기
- REQ: REQ-3707
- AC: AC-3707.1, AC-3707.2, AC-3707.3
- Files: extension-erp/src/options.ts, extension-erp/src/options.test.ts, extension-erp/src/settings.ts, extension-erp/src/settings.test.ts, extension-erp/README.md, extension-erp/src/readme.test.ts, extension-erp/src/main.test.ts
- Tests: extension-erp/src/options.test.ts, extension-erp/src/settings.test.ts, extension-erp/src/readme.test.ts, extension-erp/src/main.test.ts
- 덧붙임(TASK-9 합친 뒤, 리드): `main.test.ts` AC-3609.2 시험 하나가 처음 값 씨암 · SONO에 `amountPrefixes: ['LA']`를 기대해 실패 → 기대값을 `[{ key: 'carm', codes: ['CARM1'] }, { key: 'sono', codes: ['SONO1'] }]`(셀 코드 없으면 규칙 칸 없음, AC-3707.2)로 바꾸고 주석도 고친다
- TDD: required — design.md 9절. `options.test.ts`: 씨암·SONO 줄에 '이 글자 뒤에 숫자'·글자 칸·[더하기]가 없음, 안내 글 한 문장, 코드 줄 이름 '셀 코드', 앞글자 조각이 어디에도 없음(저장값에 LA가 있어도), [저장]하면 앞글자 없이 저장, 셀 코드가 비면 '비어 있으면…' 줄, 도우미 목록을 못 받으면 코드 찾기만 막힘. 지금 AC-3607.6 앞글자 더하기 시험(글자 칸·5개 제한)은 이 TASK에서 지우거나 AC-3707로 바꾼다(앞글자 더하기가 없어져서). `settings.test.ts`: 처음 값 규칙은 빈 것, 저장값의 앞글자(LA)는 버려짐, toGroups는 셀 코드가 있을 때만 `amountPrefixes: []`·`amountCodes`, 앞글자만 있던 저장값이면 규칙 칸을 붙이지 않음. `addPrefix`·`cleanPrefix` 시험과 처음 값 LA를 기대하던 AC-3607.6 시험은 AC-3707.2로 바꾼다. `readme.test.ts`: README '매출로 셀 코드' 설명이 화면 글과 같고 '이 글자 뒤에 숫자'가 없음
- 차례: Phase 2c (TASK-6 전)

## TASK-10: 도우미 새 명령 closing.findCodes
- REQ: REQ-3708, REQ-3709
- AC: AC-3708.1, AC-3709.2
- Files: helper-erp/commands.json, helper-erp/src/Erp.Core/Closing/ClosingSql.cs, helper-erp/src/Erp.Core/Closing/ClosingCommands.cs, helper-erp/src/Erp.Core/Closing/ClosingCodes.cs, helper-erp/src/Erp.Core/Closing/ClosingDay.cs, helper-erp/tests/Erp.Core.Tests/Closing/ClosingDay.test.cs, helper-erp/src/Erp.Core/ErpCommandTable.cs, helper-erp/src/Erp.Core/ErpReadGuard.cs, helper-erp/tests/Erp.Core.Tests/Closing/ClosingCommands.test.cs, helper-erp/tests/Erp.Core.Tests/Closing/ClosingCodes.test.cs, helper-erp/tests/Erp.Core.Tests/ErpCommandTable.test.cs, helper-erp/tests/Erp.Core.Tests/ErpReadGuard.test.cs, helper-erp/tests/erp-core.dotnet.test.ts
- Tests: helper-erp/tests/Erp.Core.Tests/Closing/ClosingCommands.test.cs, helper-erp/tests/Erp.Core.Tests/Closing/ClosingDay.test.cs, helper-erp/tests/Erp.Core.Tests/ErpCommandTable.test.cs, helper-erp/tests/erp-core.dotnet.test.ts
- TDD: required — design.md 10절. 가짜 DB로: 글자 앞부분·이름 가운데 맞는 코드, 오늘 쓸 수 없는 줄 빠짐, 코드마다 한 줄·대문자·30개까지·코드 차례, `%`·`_`·`[` 글자 바꿈, 1자·21자·빈 글자 거절, 문장이 관문 표에 있고 매개변수 셋(@day·@starts·@contains), 환자 표를 읽지 않음. design.md 11절 exclude: exclude 코드가 있는 진료는 그 묶음 사람 수·total·규칙 금액·overlap에서 빠짐, 다른 묶음은 그대로, 빈 exclude는 지금 답과 같음, 21개·코드 꼴 아님 거절. Files 가운데 손댈 필요 없는 파일은 안 고친다. dotnet 시험은 `PATH="$HOME/.dotnet:$PATH"`
- 덧붙임(2026-11-13): TASK-10은 처음 명세(exclude = 코드 배열, 그 코드가 있는 진료를 통째로 뺌)로 만들었다. 같은 날 REQ-3709가 규칙(`{ code, with }`, 그 처방만 뺌)으로 바뀌어 exclude 모양·셈은 TASK-14가 바꾼다
- 차례: Phase 2c Step 1 (TASK-9와 함께)

## TASK-11: 설정 '셀 코드' 찾기를 도우미에 묻기 · 읽지 않을 처방 규칙
- REQ: REQ-3708, REQ-3709
- AC: AC-3708.2, AC-3708.3, AC-3709.1, AC-3709.3, AC-3709.4
- Files: extension-erp/src/options.ts, extension-erp/src/options.test.ts, extension-erp/options.html, extension-erp/src/types.ts, extension-erp/src/background.ts, extension-erp/src/background.test.ts, extension-erp/src/settings.ts, extension-erp/src/settings.test.ts, extension-erp/README.md, extension-erp/src/readme.test.ts
- Tests: extension-erp/src/options.test.ts, extension-erp/src/background.test.ts, extension-erp/src/settings.test.ts, extension-erp/src/readme.test.ts
- TDD: required — design.md 10절. 가짜 chrome.runtime으로: 2자 미만이면 안 물음, 0.4초 늦춤(가짜 시계), '찾는 중…', 받은 목록 누르면 더함, 늦게 온 앞 답 버림, 이미 더한 코드 '더함', 0개 글, E-HELPER-UNKNOWN-COMMAND면 1년 목록 + 안내 줄, 다른 오류면 오류 글 + 1년 목록, 묶음 코드 찾기는 그대로. background는 새 명령을 통과시킴. design.md 11절(승인 시안 `docs/mockups/erp-closing-range/exclude.html`): 건수 세는 17줄마다 '읽지 않을 처방' 줄(세 절 모두, 주사1회환자·물리치료내원 줄 없음)·안내 글·'이 처방' 고르기 목록(그 줄 코드 + 씨암·SONO 셀 코드)·같이 있을 처방 찾기('이 처방'·'담음' 안 눌림)·'빼는 때' 둘(처음 '하나라도 있으면', 더한 뒤 돌아감)·[규칙 더하기] 네 까닭 글과 막힘·규칙 조각 글({때} 세 모양)·[×]로 지움·코드를 빼면 그 규칙도 빠짐·[저장] 뒤 저장값·[처음 값으로]면 비움, settings normalize(모르는 key·injection·ptVisit·그 줄에 없는 code·with 꼴·겹침·code와 같은 with·with 0개·똑같은 규칙·20개·5개), 저장값 all 꼴 아님 → false, toGroups는 규칙 있는 묶음에만 `exclude: [{ code, with, all }]`(진료·치료현황·ESWT 묶음 포함). `options.html`에는 시안의 `.rule`·`.tray` 등 모양만 더하고, 쓰지 않게 된 `.padd` 모양은 지운다. README에 '읽지 않을 처방' 설명(화면 글과 같음, readme 시험)
- 차례: Phase 2c Step 2 (TASK-9·10 뒤, TASK-14와 함께)

## TASK-12: 도우미 판 0.3.0·안내서 짝 문장
- REQ: REQ-3708
- AC: AC-3708.4
- Files: helper-erp/Directory.Build.props, helper-erp/install/README.md, extension-erp/README.md, extension-erp/src/readme.test.ts, helper-erp/tests/erp-core.dotnet.test.ts, extension-erp/src/manifest.test.ts
- Tests: extension-erp/src/readme.test.ts, helper-erp/tests/erp-core.dotnet.test.ts
- TDD: required — 판 0.3.0, 판 번호가 박힌 시험 함께 고침, README 두 곳 짝 문장('확장 0.3.0 ↔ ERP 도우미 0.3.0')·도우미 다시 설치해야 등록 코드 전부 찾기가 됨
- 차례: Phase 2c Step 2 (TASK-11 뒤)

## TASK-13: 기간 길이 제한 없애기
- REQ: REQ-3701, REQ-3706
- AC: AC-3701.2, AC-3706.1
- Files: extension-erp/src/rangeTypes.ts, extension-erp/src/rangeTypes.test.ts, extension-erp/src/rangeView.ts, extension-erp/src/rangeView.test.ts, extension-erp/src/main.ts, extension-erp/src/main.range.test.ts, extension-erp/README.md, extension-erp/src/readme.test.ts
- Tests: extension-erp/src/rangeTypes.test.ts, extension-erp/src/rangeView.test.ts, extension-erp/src/main.range.test.ts, extension-erp/src/readme.test.ts
- TDD: required — design.md 12절. 93일·400일·731일도 [살펴보기]가 열리고 막는 줄 없음(빈 칸·시작일 > 끝일·오늘 뒤는 그대로 막음), main scan이 400일을 받아 살펴보기를 시작함, MAX_DAYS·'한 번에 92일까지' 글이 코드·README에 없음. 92일 시험(AC-3701.2)은 이 TASK에서 바꾼다
- 차례: Phase 2c Step 2 (TASK-11 뒤, 리드)

## TASK-14: 도우미 읽지 않을 처방을 규칙으로
- REQ: REQ-3709
- AC: AC-3709.2
- Files: helper-erp/commands.json, helper-erp/src/Erp.Core/Closing/ClosingDay.cs, helper-erp/src/Erp.Core/Closing/ClosingCommands.cs, helper-erp/tests/Erp.Core.Tests/Closing/ClosingDay.test.cs, helper-erp/tests/Erp.Core.Tests/Closing/ClosingCommands.test.cs, helper-erp/tests/Erp.Core.Tests/ErpCommandTable.test.cs, helper-erp/tests/erp-core.dotnet.test.ts
- Tests: helper-erp/tests/Erp.Core.Tests/Closing/ClosingDay.test.cs, helper-erp/tests/Erp.Core.Tests/ErpCommandTable.test.cs
- TDD: required — design.md 11절. TASK-10이 만든 exclude(코드 배열·진료 통째로)를 규칙 `{ code, with, all? }`로 바꾼다. `all` 참이면 with 모두 있을 때만(하나만 있으면 안 뺌), 없거나 거짓이면 하나라도, 같은 code 규칙이 여럿이면 하나라도 맞으면 뺌, 진료·치료현황 묶음(예: manualConsult)·ESWT 묶음에도 규칙이 먹음, `all`이 참/거짓 아니면 거절. 가짜 DB로: 시안 예(진료 CARM1·LA358·LA357·LA248, 씨암 셀 코드 LA358·LA357, 규칙 LA357 ← LA248) → 씨암 건수 1·금액 LA358만, LA357·LA248만 있는 진료(씨암 묶음 코드가 LA357일 때) → 씨암 건수 0, with가 없는 진료는 그대로, 규칙 code가 묶음 코드면 진료 통째로 빠짐(CARM1 ← LA274), with는 원래 처방으로 봄, 다른 묶음(SONO)은 그대로, overlap은 묶음마다 자기 쓸 처방으로, 매출 규칙 없는 묶음(관절조영 등) 금액도 그 처방만 빠짐, injection·ptVisit 묶음 exclude는 안 씀, 규칙 없는·빈 exclude는 0.2.0 답과 같음, 꼴 거절(규칙 21개·with 0개·6개·code 꼴 아님·모르는 칸). TASK-10의 exclude 시험은 이 모양으로 바꾼다. Files 가운데 손댈 필요 없는 파일은 안 고친다. dotnet 시험은 `PATH="$HOME/.dotnet:$PATH"`
- 차례: Phase 2c Step 2 (TASK-10 합친 뒤, TASK-11과 함께)

## TASK-15: 함께 있는 진료는 돈이 두 번 셀 때만 묻기
- REQ: REQ-3710
- AC: AC-3710.1, AC-3710.2, AC-3710.3
- Files: extension-erp/src/settings.ts, extension-erp/src/settings.test.ts, extension-erp/src/main.ts, extension-erp/src/main.test.ts, extension-erp/src/main.range.test.ts, extension-erp/src/range.ts, extension-erp/src/range.test.ts, extension-erp/src/rangeView.ts, extension-erp/src/rangeView.test.ts, extension-erp/README.md, extension-erp/src/readme.test.ts
- Tests: extension-erp/src/settings.test.ts, extension-erp/src/main.test.ts, extension-erp/src/main.range.test.ts, extension-erp/src/readme.test.ts
- TDD: required — design.md 13절. `overlapNeedsAsk`: 셀 코드 다름(LA358 / LA247) → false, 같은 코드 하나(LA247 양쪽) → true, 셀 코드 없으면 고른 코드로 봄(CARM1 / SONO1 → false), 대문자·공백. main(하루): false면 askOverlap 안 부르고 씨암 = carm.total · SONO = sono.total, 끝 안내에 함께 있는 진료 줄 없음, 지난번 고른 것이 'carm'이어도 무시, saveOverlap 안 부름 / true면 지금 시험 그대로. main(기간): false면 승인 안내에 함께 있는 진료 줄·단추 없고 [덮어쓰고 저장 시작]이 열리며 채우기가 'overlapUnpicked'로 멈추지 않음 / true면 지금 그대로. README 문장(AC-3710.3). 지금 함께 있는 진료 시험은 설정을 같은 코드가 있게 바꿔 그대로 살린다(기대값 바꾸면 보고에 까닭). Files 가운데 손댈 필요 없는 파일은 안 고친다
- 차례: Phase 2d

## TASK-16: 도우미 overlap에 그날 두 번 센 돈(shared) 더하기
- REQ: REQ-3711
- AC: AC-3711.1
- Files: helper-erp/src/Erp.Core/Closing/ClosingDay.cs, helper-erp/tests/Erp.Core.Tests/Closing/ClosingDay.test.cs, helper-erp/tests/erp-core.dotnet.test.ts
- Tests: helper-erp/tests/Erp.Core.Tests/Closing/ClosingDay.test.cs, helper-erp/tests/erp-core.dotnet.test.ts
- TDD: required — design.md 14절. 가짜 DB로(시험 이름 'AC-3711.1 …'): 씨암 셀 코드 LA358·LA272 / SONO 셀 코드 LA247·LA272, 함께 있는 진료 CARM1·SONO1·LA358·LA247 → shared 0(visits·carm·sono는 지금 셈과 같음), 같은 진료에 LA272 있으면 shared = LA272 금액(원 미만은 다 더한 뒤 버림), 함께 있는 진료 둘의 겹친 금액은 더함, 함께 있지 않은 진료(씨암만)의 LA272는 안 듦, 읽지 않을 처방 규칙으로 SONO 쪽에서 LA272가 빠지면(예: LA272 ← LA358) 안 듦, 앞글자 규칙끼리 겹쳐도(La 양쪽) 그 코드 금액이 듦, overlap이 null인 조건은 그대로. 지금 AC-3604.7 `OverlapShape` 시험의 칸 목록은 visits·carm·sono·shared 넷으로 바꾼다(기대값 바뀜 까닭: REQ-3711). `erp-core.dotnet.test.ts`에 `AC-3711.1 (C# Closing 시험)` 감싸개 하나(`expectAc('AC-3711.1', closingRun)`). dotnet 시험은 `PATH="$HOME/.dotnet:$PATH"`, net48 빌드도 확인
- 차례: Phase 2e Step 2 (TASK-17과 함께, 파일 안 겹침)

## TASK-17: 확장은 그날 두 번 센 돈이 있을 때만 묻기
- REQ: REQ-3711
- AC: AC-3711.2, AC-3711.3, AC-3711.4
- Files: extension-erp/src/types.ts, extension-erp/src/settings.ts, extension-erp/src/settings.test.ts, extension-erp/src/main.ts, extension-erp/src/main.test.ts, extension-erp/src/main.range.test.ts, extension-erp/src/range.ts, extension-erp/src/range.test.ts, extension-erp/src/rangeView.ts, extension-erp/src/rangeView.test.ts, extension-erp/README.md, extension-erp/src/readme.test.ts
- Tests: extension-erp/src/settings.test.ts, extension-erp/src/main.test.ts, extension-erp/src/main.range.test.ts, extension-erp/src/readme.test.ts
- TDD: required — design.md 14절. `overlapAsks`: shared 0 → false(돈 코드가 같아도), shared > 0 → true(돈 코드가 달라도), shared 없음 → `overlapNeedsAsk` 그대로, visits 0·overlap null → false. readDay: shared 없는 답·숫자 shared 답은 받고, 음수·소수·글자 shared는 null. main(하루): LA272 양쪽 설정 + shared 0 → askOverlap 안 부르고 둘 다 넣은 값·끝 안내 overlap 줄 없음·saveOverlap 안 부름, shared > 0 → 지금처럼 물음, shared 없는 옛 답 → TASK-15 시험 그대로. main(기간): 날마다 shared 0이면 승인 안내에 함께 있는 진료 줄 없고 시작이 열리고 멈추지 않음, 어떤 날만 shared > 0이면 그날 visits만 건수에 들고 고른 것은 그날만 씀(shared 0인 날은 둘 다 넣은 값), 살펴볼 때 없었는데 채울 때 생기면 'overlapUnpicked'로 멈춤. README 문장 둘(AC-3711.4), AC-3710.3 문장 시험은 바꾼다. range.ts·rangeView.ts는 손댈 필요 없으면 안 고친다
- 차례: Phase 2e Step 2 (TASK-16과 함께, 파일 안 겹침)

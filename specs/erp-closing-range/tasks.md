# 작업 분할: ERP 마감일지 기간 채우기

> 형식: `## TASK-n: 제목` 아래 `- REQ:`, `- AC:`, `- Files:`(수정 범위), `- Tests:`, `- TDD:`, `- 차례:`. 승인되면 Files/Tests 경로만 고칠 수 있다.
> **할 순서** (사용자 "Phase별로 step으로하고 병렬로 할수있는건 병렬로해 검토는 마지막에 한번만"):
> - Phase 1 — Step 1: TASK-1(공용 타입, 작음, 리드가 바로) → Step 2: TASK-2 ‖ TASK-3(파일이 겹치지 않아 일꾼 둘이 각자 worktree에서 동시에)
> - Phase 2 — TASK-4 ‖ TASK-5(일꾼 둘)
> - 마지막 검토 한 번(확장 시험 전체·lint·`npm run ext-erp:build`·`git diff c745fdc -- helper helper-erp src`에 코드 변경 없음(문서 `helper-erp/install/README.md`의 판 문장만)·화면 사진)
> - Phase 2b(마지막 검토·오류/드문 경우 점검에서 나온 것, 사용자 "4가지 모두 고치기"·"92일까지"·"고친 부분 시험만 확인") — Step 1: 리드가 `rangeTypes.ts` 새 Block·`MAX_DAYS` → Step 2: TASK-7 ‖ TASK-8(일꾼 둘) → 합친 뒤 확장 시험 전체 → 설치 파일
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

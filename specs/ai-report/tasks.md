# 작업 분할: 월간보고 PPT (AI 요약, 내 양식 고정)

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> TASK 번호 = 실행 순서. 시험 `describe` 이름 앞에 AC ID를 붙인다(예: `describe('AC-002.2 countChange', …)`).
> 1단계만 다룬다(로그인·화면·서버 없음). 2단계는 requirements.md '범위 밖'.

## TASK-1: 오류 번호 (보고서·AI 자료·AI 답·색 벌)
- REQ: REQ-009
- Files: src/types/errors.ts, src/lib/errors.ts, src/lib/errors.test.ts
- Tests: src/lib/errors.test.ts
- TDD: required

시험: AC-009.1(ALL_CODES 목록에 새 번호 넷 추가, 빠짐없이), AC-009.2(문구 그대로). 기존 AC-003.4 시험은 고치지 않는다.

## TASK-2: 한국 날짜·시각 글자
- REQ: REQ-008
- Files: src/lib/analytics/dates.ts, src/lib/analytics/dates.test.ts
- Tests: src/lib/analytics/dates.test.ts
- TDD: required

시험: AC-008.1(`koreaDateTime`, 시간대를 바꿔도 같은 글자), AC-008.2(`koreanMonth`·`axisMonth`·`monthSpan`). 환자 자료 구역 파일이라 구역 규칙(네트워크·console 금지) 그대로 지킨다.

## TASK-3: 양식 정의 (색 벌 5개 포함)
- REQ: REQ-001
- Files: src/types/report.ts, src/lib/report/template.ts, src/lib/report/template.test.ts
- Tests: src/lib/report/template.test.ts
- TDD: required

시험: AC-001.1~AC-001.10. 벌마다 모든 역할 색이 6자리 16진수인지, 대비(WCAG 식)를 시험 안에서 잰다. `src/types/report.ts`는 이 TASK에서 만들고 뒤 TASK가 자기 타입을 더한다.

## TASK-4: 숫자·늘고 준 폭 글자
- REQ: REQ-002
- Files: src/types/report.ts, src/lib/report/format.ts, src/lib/report/format.test.ts
- Tests: src/lib/report/format.test.ts
- TDD: required

시험: AC-002.1~AC-002.7(반올림 경계·정수 계산·부호와 화살표).

## TASK-5: 월간 숫자 계산 (카드·작은 선·그래프·결론 줄·요약 표·계산 기준)
- REQ: REQ-003
- Files: src/types/report.ts, src/lib/report/numbers.ts, src/lib/report/numbers.test.ts
- Tests: src/lib/report/numbers.test.ts
- TDD: required

시험: AC-003.1~AC-003.10. 시험용 달 숫자는 시험 파일 안에서 만들고 `validateMonthPayload`를 통과하는지 먼저 확인한다.

## TASK-6: 개인정보 모양 찾기
- REQ: REQ-004
- Files: src/lib/report/sensitive.ts, src/lib/report/sensitive.test.ts
- Tests: src/lib/report/sensitive.test.ts
- TDD: required

시험: AC-004.1. 주민번호·전화 모양은 파일럿 시험처럼 조각을 이어 만든다(소스에 통째로 쓰지 않는다). `lib/payload/validate.test.ts`의 같은 사례를 넣는다.

## TASK-7: AI 요청 만들기
- REQ: REQ-004
- Files: src/types/report.ts, src/lib/report/aiInput.ts, src/lib/report/aiInput.test.ts
- Tests: src/lib/report/aiInput.test.ts
- TDD: required

시험: AC-004.2~AC-004.6. 실제 API는 부르지 않는다.

## TASK-8: AI 답 검사
- REQ: REQ-005
- Files: src/types/report.ts, src/lib/report/aiAnswer.ts, src/lib/report/aiAnswer.test.ts
- Tests: src/lib/report/aiAnswer.test.ts
- TDD: required

시험: AC-005.1~AC-005.8.

## TASK-9: 그래프 XML 손보기 (줄 모양·옅어지는 채움·마지막 점·막대 테두리)
- REQ: REQ-012
- Files: src/lib/report/chartXml.ts, src/lib/report/chartXml.test.ts
- Tests: src/lib/report/chartXml.test.ts
- TDD: required

시험: AC-012.6(정한 곳만 바뀜), AC-012.1~AC-012.4의 XML 조각(점선·굵기·`a:gradFill` 22%→0%·`c:dPt` 점·마지막 막대 테두리·점선 상자). 시험 XML은 pptxgenjs가 만드는 모양을 줄인 글자로 시험 파일 안에 둔다(패키지 없이 돈다).

## TASK-10: 움직임 XML (쪽 전환·나타나기·그래프 지어지기·영상 재생)
- REQ: REQ-010
- Files: src/lib/report/animate.ts, src/lib/report/animate.test.ts
- Tests: src/lib/report/animate.test.ts
- TDD: required

시험: AC-010.6(이름으로 찾기·없는 이름 빼기·자리·두 번 넣어도 하나), AC-010.1~AC-010.5의 XML 노드(`p:transition`·`p:fade spd="fast"`·`p:timing`·`p:bldP`·`p:bldGraphic`/`a:bldChart bld="seriesEl"`·`a:chart … bldStep="ptInSeries"`·`presetID` 10·22·53·`nodeType`·시간 합 ≤ 3초). 표지 영상 재생 노드(`p:video`·`repeatCount="indefinite"`·`mute`)도 여기서 만든다. 시험 XML은 시험 파일 안 쪽 XML 조각.

## TASK-11: 표지 자산 (영상·정지 그림 넣기와 검사)
- REQ: REQ-011
- Files: src/types/report.ts, src/lib/report/coverMedia.ts, src/lib/report/coverMedia.test.ts, public/report/cover-loop.mp4, public/report/cover-still.png
- Tests: src/lib/report/coverMedia.test.ts
- TDD: required

시험: AC-011.1(저장소 자산을 `node:fs`로 읽어 MP4·H.264(`avc1`)·8MB 이하, PNG·1920×1080·500KB 이하), AC-011.2(`pickCoverMedia` 내려가기, 경로 상수). 할 일: RED 확인 뒤 `/tmp/claude-1000/-home-developer/c846313c-65d3-4865-af09-ac6a567ca034/scratchpad/hf-cover/cover-loop-h264.mp4`를 `public/report/cover-loop.mp4`로 복사하고, 같은 폴더 `cover-still.png`(2688×1520, 3.0MB)를 ffmpeg로 가운데 맞춰 1920×1080으로 줄이고 자른 뒤 압축해(256색 팔레트, 필요하면 디더링) 500KB 이하로 `public/report/cover-still.png`에 넣는다. 영상이 8MB를 넘거나 avc1이 아니면 `-c:v libx264 -pix_fmt yuv420p -movflags +faststart -an`으로 다시 묶는다.

## TASK-12: PPT 만들기 (pptxgenjs 넣기, 쪽 배치, 손보기 적용)
- REQ: REQ-006, REQ-010, REQ-011, REQ-012
- Files: package.json, package-lock.json, src/lib/report/deck.ts, src/lib/report/deck.test.ts, src/lib/report/pptxTestUtil.ts
- Tests: src/lib/report/deck.test.ts
- TDD: required

시험: AC-006.1~AC-006.10, 만든 .pptx를 풀어 본 AC-010.1~AC-010.5, AC-011.3~AC-011.6, AC-012.1~AC-012.5. RED 전에 `npm install pptxgenjs@4.0.1 jszip@3.10.2 --save-exact`(MIT, ADR-016)만 하고, 시험이 "deck.ts가 없어서" 실패하는 것을 확인한 뒤 구현한다. 시험은 바이트를 `pptxTestUtil.ts`(jszip)로 풀어 XML을 본다. 표지 자산은 시험이 `public/report/`에서 `node:fs`로 읽어 넘긴다.

## TASK-13: 예시 PPT와 만들기 명령 (색 벌 고르기)
- REQ: REQ-007
- Files: package.json, src/lib/report/sample.ts, src/lib/report/sample.test.ts, scripts/make-sample-deck.ts
- Tests: src/lib/report/sample.test.ts
- TDD: required

시험: AC-007.1~AC-007.4(다섯 벌 모두 만들어지고 그 벌 색이 XML에 있음). `scripts/make-sample-deck.ts`는 인자 읽기 + 자산 읽기 + `buildSampleDecks()` 결과를 `out/report/`에 쓰는 몇 줄뿐이라 따로 시험하지 않는다(계산·PPT·모르는 벌 거부는 sample.test.ts가 본다). 끝 조건: `npm run report:sample`과 `npm run report:sample -- teal`로 세 파일씩 생기고, `npm run report:sample -- red`는 안내를 찍고 종료 코드 1.

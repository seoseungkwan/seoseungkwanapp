# Step 1: stats-screen

> **TASK-14** 통계 화면 (자료 고르기 · 기간 · 저장 · 휴대폰) · **REQ-514** · AC-514.1 ~ AC-514.10
> Phase 4 · 화면 `stats-4-screen` · Step 1 — `specs/stats/tasks.md`
> 명세 `specs/stats/`가 승인된 뒤에만 시작한다(`python3 ~/.claude/harness/bin/sdd status stats`). 이 step은 TASK-14 하나만 한다. 다른 TASK의 일은 하지 않는다.
> 옮겨 옴: precheck REQ-031 (precheck 031.1·031.2) — 사전점검 명세의 같은 몫은 그 명세가 다음에 뺀다. 이 step은 `specs/stats`만 따른다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/stats/requirements.md`의 REQ-514(통계 화면 (자료 고르기 · 기간 · 저장 · 휴대폰))에 있다. 아래는 같은 글이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-514.1**: Given `/stats`를 엶, When 그리면, Then 고른 기간과 비교 기간의 저장된 숫자를 `readDays`·`readCoverage`로 읽어 섹션을 그린다(달 칸은 일 숫자의 합이라 `readMonths`를 쓰지 않는다). 읽는 동안 섹션 자리는 "불러오는 중"이고, 저장된 숫자가 하나도 없으면 맨 위에 "아직 저장된 통계가 없어요" + 자료 고르기 안내다. 읽기 실패는 오류 카드(`E-STATS-READ-FAILED`) + [다시 읽기]다
- **AC-514.2**: Given 기간 단추 묶음(`role="group"`, 이름 "기간": 최근 7일 · 최근 30일 · 최근 90일 · 최근 12개월, 처음 30일만 `aria-pressed="true"`), When 다른 단추를 누르면, Then 그 단추만 눌림이 되고 기간 글자와 섹션이 그 기간으로 바뀐다. 처방별 신환·재진은 Worker에 그 기간을 다시 계산시킨다(다시 불러오지 않는다)
- **AC-514.3**: Given 비트 PC(`useBridge({ worker })` 상태 `ready`), When [비트에서 불러오기]를 누르면, Then 불러올 범위(REQ-511 `statsRange`의 `load`)로 `stream('stats.rows', {from, to})` → Worker `load` → 저장 모양과 Worker가 준 저장할 덮은 기간(REQ-505 Worker가 정함, 끝은 오늘 진료 끝이면 오늘·아니면 어제)을 `saveStats(source 'bit')`에 넣는다. `saveStats(source 'bit')`에 성공하면 표에서 다시 읽어 그린다. 방금 만든 숫자를 합쳐 보이는 것은 저장 실패 때만이다. 그동안 단추는 막히고 "불러오는 중"이다. 끝나면 처방별 신환·재진과 원장님 보고 문장이 생긴다. 화면은 조각·진료 줄을 받지 않는다(Worker만 통로에 넘긴다). 시험: 안내가 보이던 기간에서 비트 저장 성공 → 다시 읽은 `fromFile` false → 안내가 사라진다
- **AC-514.4**: Given 파일, When 끌어다 놓거나 [파일 고르기]로 넣으면, Then 지금 `runAnalysis` 길 그대로 분석해 `toMonthPayload`·`toDayPayloads`와 파일이 덮은 기간 하나(성공한 파일들의 기간 줄·받아들인 줄 범위를 `mergeRanges`로 합친 것 가운데 가장 최근 이어진 구간, 끝은 어제 이하 — 파일 길에는 "오늘 진료 끝"이 없다)를 `saveStats(source 'file')`로 저장하고, 저장에 성공하면 표에서 다시 읽어 그린다(트리거(AC-506.4)가 옛 줄을 남겼을 수 있으니 방금 만든 파일 숫자를 저장된 줄 위에 합치지 않는다). 시험: 저장에 성공하면 `readDays`를 다시 부르고 그 답으로 그린다. 파일마다 실패는 오류 카드(번호)로 보인다. 파일 이름은 화면에만 보이고 어디로도 보내지 않는다
- **AC-514.5**: Given 확장이 없는 브라우저·휴대폰(상태 `no-extension`), When 그리면, Then [비트에서 불러오기] 대신 "비트 PC의 크롬에서 불러올 수 있어요"와 파일 길이 보인다. 상태가 `no-helper`·`update-helper`·`update-extension`이면 그 안내와 [설치·연결 확인](`/claim/setup`) 링크다
- **AC-514.6**: Given 저장 실패, When 그리면, Then 새 숫자는 화면에 그대로 두고 오류 카드 `E-STATS-SAVE-FAILED` + [다시 저장]이며, 누르면 같은 값을 다시 보낸다. 품질 incomplete면 저장하지 않고 "일부 기록을 확인하지 못해 저장하지 않았어요"와 확인 건수(차트번호 없는 내원 N건 등)를 보인다
- **AC-514.7**: Given 저장된 숫자, When 그리면, Then 기간 머리에 출처 줄 "자료: 비트 PC · {월}월 {일}일 {시}:{분} 저장" 또는 "자료: 파일 · …"이 있다(가장 최근 `updated_at`·`source`). 그 기간을 그리려고 읽은 줄(고른 기간과 비교 기간)에 파일 줄이 하나라도 있으면(`readDays`의 `fromFile`) 또는 저장하지 못한 방금 만든 파일 숫자를 보이는 동안이면(AC-514.6), 출처 줄 옆에 이 문장을 글자 그대로 보인다: "파일 자료는 처방이 없는 접수와 같은 날 다시 접수한 건이 빠져 비트 PC 숫자보다 적을 수 있어요." 사용자가 승인한 문장이고(2026-11-01) AC-513.1 '목업이 이긴다'의 예외다. 목업(`index.html`)에 없고 목업을 다시 돌리지 않는다. 시험: `latest.source`가 'bit'이어도 `fromFile`이 true이면 보인다. 시험: 읽은 줄이 모두 비트이면(`fromFile` false) 보이지 않는다
- **AC-514.8**: Given 비트 PC, When 그리면, Then [비트에서 불러오기] 옆에 체크 상자 "오늘 진료 끝"(처음 꺼짐)이 있고, 켜고 불러오면 REQ-505(오늘 진료 끝)대로 오늘 숫자를 끝난 날로 저장한다
- **AC-514.9**: Given 화면 상태, When 보면, Then 숫자·처방 이름·보고 글은 React 상태와 Worker 메모리에만 있고 브라우저 저장소·주소(쿼리)·`history.state`에 넣지 않는다. 주소는 `/stats` 그대로다
- **AC-514.10**: Given 390·768·1440px, When 그리면, Then 섹션이 겹치거나 잘리지 않고 가로로 밀리지 않으며, 768px 미만에서는 섹션이 세로로 쌓이고 기간 단추는 44px이다(목업 승인본 배치)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/specs/stats/requirements.md` — REQ-514
- `/specs/stats/design.md` — '구성 요소 / 인터페이스' TASK-14, '데이터 흐름'
- `/specs/stats/tasks.md` — TASK-14 (수정 범위·메모)
- `/docs/mockups/stats/notes.md` (승인본)
- `/src/components/claim/useBridge.ts` (불러 쓰기만), `/src/lib/bridge/workerSink.ts`, `/src/types/bridge.ts`
- `/src/workers/statsClient.ts`·`/src/types/stats.ts` (TASK-5·9), `/src/workers/runAnalysis.ts` (파일 길)
- `/src/lib/storage/stats.ts` (TASK-7), `/src/lib/payload/toMonthPayload.ts`·`toDayPayloads.ts`
- `/src/components/stats/view.ts`·`sections/*` (TASK-11·13), `/src/lib/clinicReport/reportText.ts` (TASK-10)
- `/src/components/common/ErrorCard.tsx`, `/src/components/claim/setup/ClaimEntry.tsx` (연결 상태별 안내 본보기)
- 이전 step에서 만든 파일: TASK-13 (섹션), TASK-7 (저장·읽기), TASK-5·9 (Worker)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 승인된 목업 (화면 step)

- `docs/mockups/stats/index.html`·`notes.md` 승인본(TASK-12). `notes.md` 맨 위에 '승인:' 줄이 없으면 시작하지 말고 `blocked`(사유: 목업 승인 전)로 멈춘다
- 명세의 화면 AC는 내용과 동작을 정하고, 배치·문구는 목업이 정한다

## 수정 범위 (tasks.md TASK-14)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/components/stats/StatsScreen.tsx`
  - `src/components/stats/StatsScreen.test.tsx`
  - `src/components/stats/SourcePicker.tsx`
  - `src/components/stats/SourcePicker.test.tsx`
  - `src/components/stats/useStatsData.ts`
  - `src/components/stats/useStatsData.test.ts`
  - `src/components/stats/useStatsWorker.ts`
  - `src/components/stats/useStatsWorker.test.ts`
- Tests:
  - `src/components/stats/StatsScreen.test.tsx`
  - `src/components/stats/SourcePicker.test.tsx`
  - `src/components/stats/useStatsData.test.ts`
  - `src/components/stats/useStatsWorker.test.ts`
- TDD: required
- 메모: 시험은 jsdom, 가짜 Worker·가짜 통로(`chrome.runtime`)·가짜 저장(`lib/storage/stats` mock — `readCoverage` 포함). `useBridge`(`components/claim/useBridge.ts`)는 불러 쓰기만 한다

## 꼭 지킬 규칙 (CRITICAL)

- **화면은 승인된 목업대로**: 배치·문구·상태는 `docs/mockups/stats/` 승인본(`notes.md` 맨 위 승인 기록)을 따른다. 모양은 `components/ui/classes.ts`의 `ds`와 `globals.css` 토큰만(옛 `ui.`·옛 Tailwind 이름·`font-bold` 없음, 굵기 400·500·600). 좋고 나쁨은 색만 쓰지 않고 ▲▼·글자를 같이 쓴다. 그래프는 움직이지 않는다. 상자 안 상자 금지 (CLAUDE.md, docs/UI_GUIDE.md)
- **브라우저 저장소·주소 안 씀**: 숫자·처방 이름·보고 글을 `localStorage`·`sessionStorage`·`indexedDB`·주소(URL·쿼리)·`history.state`에 넣지 않는다. 화면 상태와 Worker 메모리에만 둔다
- **서버에는 숫자만**: 서버로 가는 값은 검사한 저장 모양(`validateMonthPayload`·`validateDayPayload`), 덮은 기간(날짜 둘), 출처('bit'|'file')뿐이다. 차트번호·환자 번호·진료 줄·파일 이름·보고 금액·보고 글은 보내지 않는다 (CLAUDE.md, plan.md §2-2·§4)
- **새 서버 경로 없음**: `app/api/*`·Route Handler·Server Action을 만들지 않는다. 서버 코드는 `app/api/ai/` 하나다. 통계 숫자는 브라우저가 Supabase(RLS)에 바로 읽고 쓴다. 페이지·`*.server.ts`는 통계 표를 읽지 않는다 (CLAUDE.md, ADR-004)
- **환자 자료 구역 울타리**: `src/lib/parsers`·`src/lib/analytics`·`src/lib/payload`·`src/lib/precheck`·`src/lib/bridge`·`src/workers`에서는 네트워크(`fetch`·`XMLHttpRequest`·`WebSocket`·`EventSource`·`sendBeacon`), `console`, 브라우저 저장소(`localStorage`·`sessionStorage`·`indexedDB`), React·Next·supabase·`lib/auth`·`lib/storage` import, JSX를 쓰지 않는다. 동적 `import()`는 글자로 고정한 경로만. `eslint.config.mjs`가 막고 `src/guardrails.test.ts`가 증명한다. 이 울타리를 풀거나 `eslint-disable`로 피하지 않는다 (CLAUDE.md, ADR-020)

## 작업

### 1. 화면 (`src/components/stats/StatsScreen.tsx`, `'use client'`)
```ts
export function StatsScreen(props: { hospitalName: string; today: string }): JSX.Element
```
- AC-514.1~514.10을 승인본대로: 저장된 숫자 읽기(기간 + 비교 기간) → 섹션, 기간 단추, 출처 줄, 저장 실패·incomplete 안내, 폭별 배치

### 2. 자료 고르기 (`SourcePicker.tsx`)
- 연결 상태(`useBridge`)별: `ready` → [비트에서 불러오기] + "오늘 진료 끝" 체크(AC-514.3·514.8), `no-extension` → "비트 PC의 크롬에서 불러올 수 있어요"(AC-514.5), `no-helper`·`update-*` → 안내 + [설치·연결 확인](`/claim/setup`). 언제나 파일 끌어다 놓기·[파일 고르기](AC-514.4) → `runAnalysis` → `toMonthPayload`·`toDayPayloads` + 덮은 기간(성공한 파일의 기간 줄·받아들인 줄 범위를 `mergeRanges`로 합친 것 가운데 가장 최근 이어진 구간, 끝은 어제 이하 — 파일 길에는 "오늘 진료 끝"이 없다) → `saveStats({ …, source: 'file' })`

### 3. 훅 (`useStatsData.ts`, `useStatsWorker.ts`)
- `useStatsData(period)`: `readDays`·`readCoverage`(`readMonths`는 쓰지 않는다. `fromFile`은 `readDays`에서), 기간 바꿈마다 그 기간 + 비교 기간만, `saveStats`에 성공하면(비트·파일 모두) 표에서 다시 읽어 그린다. 방금 만든 숫자를 합쳐 보이는 것은 저장 실패 때만이다. `saveStats`와 [다시 저장](같은 값)
- `useStatsWorker()`: `createStatsWorker()` 하나(화면을 떠나면 `terminate`), `useBridge({ worker })`, 불러오기 = `stream('stats.rows', range.load)` → `requestLoad({ streamId: id, … })` → `saveStats({ …, covered: view.covered /* 끝 = 오늘 진료 끝 ? 오늘 : 어제, Worker가 정함 */, source: 'bit' })`, 기간 바꿈 → `requestSplit`. 보고 문장은 `formatClinicReport(…, today)`로 화면에서 만든다

### 4. 시험 (jsdom, 가짜 Worker·가짜 `chrome.runtime`·`vi.mock('@/lib/storage/stats')`)
- AC마다: 첫 그림(읽는 중 → 섹션 / 없음 안내 / 읽기 실패 + [다시 읽기]), 기간 바꿈(눌림·다시 읽기·`requestSplit`), 비트 불러오기(막힘 → 저장 → 다시 그림, 화면이 받은 값에 가짜 차트번호 글자 없음), 파일 길(`runAnalysis` 가짜), 연결 상태별 안내, 저장 실패 + [다시 저장](같은 값), incomplete 안내, 출처 줄, "오늘 진료 끝"이 `closeToday`로 감, 저장소·주소에 아무것도 안 넣음(`localStorage`·`location.search` 그대로)

## TASK-8에서 넘어온 규칙 (2026-11-01 리뷰)

- `buildTrend`가 던지는 `RangeError`의 `.message`를 화면에 그대로 보이지 않는다. 화면 오류 글은 `lib/errors.ts` 한 곳이다

## TASK-7에서 넘어온 규칙 (2026-11-01 리뷰)

- `saveStats`는 덮은 기간이 양 끝을 합쳐 800일을 넘으면 아무것도 보내지 않고 `E-STATS-SAVE-FAILED`다(`stats_coverage` 제약). 비트 길은 800일 이하라 걸리지 않는다. **파일 길**(AC-514.4)은 가장 최근 이어진 구간을 고른 뒤 `from = max(from, addDays(to, -799))`로 줄여 넘긴다. 일 숫자는 전부 저장한다(달 숫자는 AC-507.1을 따른다). 잘린 옛날 날은 0이 아니라 '덮이지 않음'이 되고, 화면이 읽는 범위는 731일 이하라 보이는 숫자는 줄지 않는다. 그대로 두면 이런 파일은 [다시 저장]을 눌러도 끝없이 실패한다. 시험: 801일 파일이 저장되고 덮은 기간이 800일이다. 이 줄임은 step의 `summary`에도 적는다
- `latest === null`은 '줄 없음'이 아니다(`updated_at`을 못 읽는 브라우저에서도 줄은 남는다). AC-514.1의 없음 안내는 `rows` 길이로 보고, `latest`가 null이면 출처 줄만 숨긴다

## 2026-11-01 접수 기준 변경 (뒤따라 고치기)

> 사용자 결정(`specs/stats/requirements.md` 배경 '환자 수의 뜻'·'파일 길'). 이 step은 아직 시작 전이라 처음부터 이 규칙으로 만든다. 이 절이 이 파일의 다른 곳과 다르면 이 절이 먼저다.

### 바뀐 AC
- **AC-514.1**: Given `/stats`를 엶, When 그리면, Then 고른 기간과 비교 기간의 저장된 숫자를 `readDays`·`readCoverage`로 읽어 섹션을 그린다(달 칸은 일 숫자의 합이라 `readMonths`를 쓰지 않는다). 읽는 동안 섹션 자리는 "불러오는 중"이고, 저장된 숫자가 하나도 없으면 맨 위에 "아직 저장된 통계가 없어요" + 자료 고르기 안내다. 읽기 실패는 오류 카드(`E-STATS-READ-FAILED`) + [다시 읽기]다
- **AC-514.3**: Given 비트 PC(`useBridge({ worker })` 상태 `ready`), When [비트에서 불러오기]를 누르면, Then 불러올 범위(REQ-511 `statsRange`의 `load`)로 `stream('stats.rows', {from, to})` → Worker `load` → 저장 모양과 Worker가 준 저장할 덮은 기간(REQ-505 Worker가 정함, 끝은 오늘 진료 끝이면 오늘·아니면 어제)을 `saveStats(source 'bit')`에 넣는다. `saveStats(source 'bit')`에 성공하면 표에서 다시 읽어 그린다. 방금 만든 숫자를 합쳐 보이는 것은 저장 실패 때만이다. 그동안 단추는 막히고 "불러오는 중"이다. 끝나면 처방별 신환·재진과 원장님 보고 문장이 생긴다. 화면은 조각·진료 줄을 받지 않는다(Worker만 통로에 넘긴다). 시험: 안내가 보이던 기간에서 비트 저장 성공 → 다시 읽은 `fromFile` false → 안내가 사라진다
- **AC-514.4**: Given 파일, When 끌어다 놓거나 [파일 고르기]로 넣으면, Then 지금 `runAnalysis` 길 그대로 분석해 `toMonthPayload`·`toDayPayloads`와 파일이 덮은 기간 하나(성공한 파일들의 기간 줄·받아들인 줄 범위를 `mergeRanges`로 합친 것 가운데 가장 최근 이어진 구간, 끝은 어제 이하 — 파일 길에는 "오늘 진료 끝"이 없다)를 `saveStats(source 'file')`로 저장하고, 저장에 성공하면 표에서 다시 읽어 그린다(트리거(AC-506.4)가 옛 줄을 남겼을 수 있으니 방금 만든 파일 숫자를 저장된 줄 위에 합치지 않는다). 시험: 저장에 성공하면 `readDays`를 다시 부르고 그 답으로 그린다. 파일마다 실패는 오류 카드(번호)로 보인다. 파일 이름은 화면에만 보이고 어디로도 보내지 않는다
- **AC-514.7**: Given 저장된 숫자, When 그리면, Then 기간 머리에 출처 줄 "자료: 비트 PC · {월}월 {일}일 {시}:{분} 저장" 또는 "자료: 파일 · …"이 있다(가장 최근 `updated_at`·`source`). 그 기간을 그리려고 읽은 줄(고른 기간과 비교 기간)에 파일 줄이 하나라도 있으면(`readDays`의 `fromFile`) 또는 저장하지 못한 방금 만든 파일 숫자를 보이는 동안이면(AC-514.6), 출처 줄 옆에 이 문장을 글자 그대로 보인다: "파일 자료는 처방이 없는 접수와 같은 날 다시 접수한 건이 빠져 비트 PC 숫자보다 적을 수 있어요." 사용자가 승인한 문장이고(2026-11-01) AC-513.1 '목업이 이긴다'의 예외다. 목업(`index.html`)에 없고 목업을 다시 돌리지 않는다. 시험: `latest.source`가 'bit'이어도 `fromFile`이 true이면 보인다. 시험: 읽은 줄이 모두 비트이면(`fromFile` false) 보이지 않는다

### 만들 것
- 안내 문장(글자 그대로): "파일 자료는 처방이 없는 접수와 같은 날 다시 접수한 건이 빠져 비트 PC 숫자보다 적을 수 있어요."
- 사용자가 승인한 문장이고 AC-513.1 '목업이 이긴다'의 예외다. `docs/mockups/stats/index.html`에 없고 목업을 다시 돌리지 않는다. 금지사항의 '승인본과 다른 배치·문구로 새로 짓지 마라'의 예외는 이 문장 하나다
- 자리: 출처 줄(AC-514.7) 옆. 좁은 폭에서는 아래로 줄바꿈되어도 되고 가로로 밀리지 않는다(AC-514.10). `ds`와 토큰만 쓴다
- 언제: `useStatsData`가 그 기간을 그리려고 읽은 결과(고른 기간과 비교 기간, `readDays`)의 `fromFile`이 하나라도 참이거나, 저장하지 못한 방금 만든 파일 숫자를 보이는 동안(AC-514.6). `latest.source`로 판단하지 않는다. `latest`가 null이라 출처 줄을 숨겨도(TASK-7에서 넘어온 규칙) `fromFile`이 참이면 문장은 보인다
- 다시 읽기(AC-514.3·514.4): 비트든 파일이든 저장에 성공하면 표에서 다시 읽어 그린다. 트리거(AC-506.4)가 옛 줄을 남겼을 수 있고, 다시 읽어야 `fromFile`이 새로 정해져 파일 안내가 "자료: 비트 PC" 옆에 남지 않는다. 방금 만든 숫자를 합쳐 보이는 것은 저장 실패 때만이다(AC-514.6)
- 왜 안내가 필요한가: 가장 최근 불러오기가 덮어쓰므로 오후 파일이 오전 비트 숫자를 낮출 수 있다
- 대시보드에는 출처 줄이 없어 이 문장을 붙이지 않는다(TASK-16은 고칠 것 없음)

### 시험
- `StatsScreen.test.tsx`: `latest.source`가 'bit'이고 `fromFile`이 true → 문장이 글자 그대로 보인다. 모두 비트(`fromFile` false) → 보이지 않는다. 비교 기간 읽기만 `fromFile` true → 보인다. 파일 저장 실패로 방금 만든 숫자를 보이는 동안 → 보인다
- `useStatsData.test.ts`: 파일 저장 성공 → `readDays`를 다시 부르고 그 답으로 그린다. `readMonths`를 부르지 않는다. 안내가 보이던 기간에서 비트 저장 성공 → 다시 읽은 `fromFile` false → 안내가 사라진다. 저장 실패 → 다시 읽지 않고 방금 만든 숫자를 합쳐 보인다

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-501.2 31일째에만 다시 오면 30일 재방문이 아니다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-14 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-14 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/components/stats
npx vitest run src/components/claim src/lib/bridge src/workers   # 통로·Worker 그대로
python3 ~/.claude/harness/bin/tdd-run TASK-14 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status stats`에서 AC-514.1 ~ AC-514.10이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가(새 패키지 없음)?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/stats-4-screen/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (원본 접근, 목업 승인, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 화면이 조각·진료 줄·보낼 글자를 받게 하지 마라(`lib/bridge/client`를 부르지 마라). 이유: 화면은 Worker만 통로에 넘긴다(청구 design.md 5절, precheck 004.11)
- `useBridge.ts`·`lib/bridge/*`·`workers/*`를 고치지 마라. 이유: 이 step 범위 밖이다(불러 쓰기만)
- 파일 이름을 저장·전송·Worker 메시지에 넣지 마라. 이유: 환자 이름이 들어 있을 수 있다(stats-core 010.1)
- 숫자를 브라우저 저장소·주소에 두지 마라. 이유: AC-514.9
- 승인본과 다른 배치·문구로 새로 짓지 마라. 이유: 화면은 승인된 목업대로(CLAUDE.md)
- 기존 테스트를 깨뜨리지 마라. 이유: 지금 통계 엔진·청구·탭 틀 시험이 계속 통과해야 한다(이 TASK의 Files에 있는 시험만, 정한 칸만 고친다)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- `specs/precheck/`·`phases/precheck-*`를 고치지 마라. 이유: 청구 브랜치가 그 파일을 가진다. 그쪽이 할 일은 `specs/stats/design.md` '사전점검 명세가 할 일'에 적혀 있다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 새 npm·NuGet 패키지를 넣지 마라. 이유: `package.json`·csproj가 수정 범위 밖이고 ADR 기술 스택 밖이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`plan.md`를 고치지 마라 · `docs/*`. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다

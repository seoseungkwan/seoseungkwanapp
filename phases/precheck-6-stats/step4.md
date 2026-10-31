# Step 4: stats-screen

> **TASK-31** 통계 화면 추가분 · **REQ-031** · AC-031.1 ~ AC-031.5
> Phase 6 `precheck-6-stats` · Step 4 — `docs/precheck/plan.md` §6
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-31 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-031에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-031.1**: `/stats`에서 목업 승인본처럼 처방 추세 그래프(일·주·월, 기간 비교, 건수·금액·소모량), 신환 30일 재방문과 첫 재방문 날수, 처방별 신환·재진, 보고 문장. 탭 줄의 [통계]가 `/stats` 링크
- **AC-031.2**: 자료 고르기: 비트 PC에서 [도우미에서 불러오기]는 `stats.rows`, 파일을 끌어다 놓으면 지금 파일 길. 휴대폰·확장 없는 곳에서는 파일 길만
- **AC-031.3**: [문장 복사]는 보고 글을 복사한다. '확인 필요' 금액이 있으면 그 줄을 표시해 보인다
- **AC-031.4**: 파일 자료로 추세를 그리면 금액·소모량 자리에 "파일에는 금액·소모량이 없어요"
- **AC-031.5**: 그래프에서 좋고 나쁨은 색만 쓰지 않고 ▲▼나 글자를 같이 쓴다(UI_GUIDE)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·020·021·022
- `/docs/precheck/plan.md` §6 (Phase·Step 순서)
- `/specs/precheck/requirements.md` — REQ-031
- `/specs/precheck/design.md` — 7절 표 '통계 추가분', 15절(통계 금액·소모량), 17절 질문 1(통계 기본 화면이 없으면 추가분만 먼저 — Claude 기본)
- `/specs/precheck/tasks.md` — TASK-31 (수정 범위·메모)
- `/docs/UI_GUIDE.md` '앱 화면'(색·▲▼·폰), `/src/components/ui/classes.ts`
- `/src/workers/analyze.worker.ts`, `/src/workers/analyzeFiles.ts`, `/src/workers/runAnalysis.ts` (지금 파일 길)
- `/src/components/shell/menu.ts`, `/src/components/shell/shell.test.tsx`
- 이전 step에서 만든 파일:
  - `src/workers/precheck/statsRows.ts`, `jobs.ts`의 `stats` (Step 0)
  - `src/lib/analytics/rxTrend.ts` (Step 1)
  - `src/lib/analytics/revisit30.ts`, `src/lib/analytics/rxVisitSplit.ts` (Step 2)
  - `src/lib/report/reportText.ts` (Step 3)
  - `src/components/common/CopyButton.tsx` (Phase 5 Step 2)
  - `src/components/claim/useBridge.ts` (Phase 1)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 승인된 목업 (화면 step)

- 화면 9 '통계 추가분'(`id="v-stats"` 부분)

- 화면은 승인된 목업 https://claude.ai/artifact/499cp2Sodph7jYJ4gX4exj (위 화면 번호)과 같게 만든다(배치·문구·상태). 명세의 화면 AC는 내용만 정하고 배치·문구는 목업이 정한다
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/48cae04e-0cd2-4603-a1ad-b361628f7242/scratchpad/mockup/index.html` — 화면마다 `<section class="screen" id="v-…">` 한 덩어리다. 사본이 없으면 artifact 읽기 도구(`read_artifact`, slug `499cp2Sodph7jYJ4gX4exj`)로 읽는다. 둘 다 안 되면 `blocked`(사유: 승인 목업을 읽을 수 없음)
- 목업 안의 환자 이름·차트번호·숫자·고시 번호·오류 번호(`E-PC-101` 같은 것)는 지어낸 예시다. 오류 번호는 design.md 4-5의 것을 쓴다
- 모양 규칙은 `docs/UI_GUIDE.md` '앱 화면'(Tailwind 토큰은 `src/app/globals.css` `@theme`, 반복 모양은 `src/components/ui/classes.ts`). 목업의 inline 값을 새 색·새 크기로 만들지 않는다
- 화면 확인은 jsdom 시험으로 한다. 실제 화면 캡처는 Phase 끝에 메인 세션이 한다

## 수정 범위 (tasks.md TASK-31)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/app/(app)/stats/page.tsx`
  - `src/app/(app)/stats/page.test.tsx`
  - `src/components/stats/*`
  - `src/components/common/CopyButton.tsx`
  - `src/workers/precheck/jobs.ts`
  - `src/workers/precheck/jobs.test.ts`
  - `src/workers/precheck.worker.ts`
  - `src/components/shell/menu.ts`
  - `src/components/shell/shell.test.tsx`
- Tests:
  - `src/components/stats/StatsExtras.test.tsx`
  - `src/components/stats/TrendChart.test.tsx`
  - `src/components/stats/ReportText.test.tsx`
  - `src/app/(app)/stats/page.test.tsx`
  - `src/workers/precheck/jobs.test.ts`
  - `src/components/shell/shell.test.tsx`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **환자 자료 구역 울타리**: `src/lib/bridge`·`src/lib/precheck`·`src/workers`(그리고 기존 `lib/parsers`·`lib/analytics`·`lib/payload`)에서는 네트워크(`fetch`·`XMLHttpRequest`·`WebSocket`·`EventSource`·`sendBeacon`), `console`, 브라우저 저장소(`localStorage`·`sessionStorage`·`indexedDB`), React·Next·supabase·`lib/auth`·`lib/storage` import, JSX를 쓰지 않는다. 동적 `import()`는 글자로 고정한 경로만 쓴다. `eslint.config.mjs`가 막고 `src/guardrails.test.ts`가 증명한다. 이 울타리를 풀거나 `eslint-disable`로 피하지 않는다 (CLAUDE.md, ADR-020)
- **새 서버 경로 없음**: `app/api/*`·Route Handler·Server Action을 새로 만들지 않는다. 서버 코드는 `app/api/ai/` 하나다. 설정·건수는 브라우저가 Supabase(RLS)에 바로 읽고 쓴다 (ADR-004·021)
- **브라우저 저장소 안 씀**: 고친 메모·완료 표시·입력 기록·연락 표시·설정 사본은 도우미 작업 저장(`store.save`)에만 둔다. `localStorage`·`sessionStorage`·`indexedDB`에 두지 않는다 (ADR-020)
- **금액**: 원 단위 정수. 반올림하지 않고 원 미만은 항목마다 버린다. 합계는 항목 금액의 합 (CLAUDE.md, ADR-008)
- **주소에 환자 값 없음**: 차트번호·이름·메모·전화를 주소(URL)·쿼리·화면 제목·`history.state` 밖 어디에도 넣지 않는다. 주소는 서버 로그와 브라우저 기록에 남는다. 화면 사이에는 날짜와 메모리 안 key만 넘긴다

## 작업

### 1. 통계 기본 화면 확인 (design.md 17절 질문 1)
- 지금 저장소에는 `/stats` 화면이 없다(탭 [통계] `href: null`). Claude 기본값대로 이 step은 **추가분과 자료 고르기만** 둔 `/stats`를 만든다. 통계 기본 화면(신환·재진 수, 7·14일 재방문 화면)은 통계 명세가 따로 만든다. summary에 적는다

### 2. 화면 (목업 화면 9 '통계 추가분')
- `/stats` → `src/components/stats/StatsExtras.tsx`: '처방 추세'(일·주·월, 기간 비교, 건수·금액·소모량 고르기), '신환 재방문'(30일 재방문·첫 재방문 날수 칸), '처방별 신환·재진', '보고 문장'([문장 복사])
- `TrendChart.tsx`: SVG로 직접 그린다(새 그래프 패키지를 넣지 않는다 — `package.json`은 수정 범위 밖). 증감은 색과 함께 ▲▼·글자(AC-031.5). 파일 자료면 금액·소모량 자리에 "파일에는 금액·소모량이 없어요"(AC-031.4)
- `ReportText.tsx`: 보고 글, '확인 필요' 줄 표시, `CopyButton`(AC-031.3)

### 3. 자료 고르기 (AC-031.2)
- 비트 PC(`useBridge({ worker })` 상태 `ready`, 화면은 Worker만 넘긴다): [도우미에서 불러오기] → `stream('stats.rows', {from, to})`(비교 기간까지 합친 범위, 800일 이하) → `precheck.worker.ts` `stats`
- 파일: 끌어다 놓기 → 지금 `analyze` Worker 길 그대로(추세는 건수만)
- 휴대폰·확장 없는 곳: 파일 길만 보인다
- 계산은 모두 Worker 안. 화면에는 보기 모양(숫자·칸 키)만 온다. 차트번호는 오지 않는다

### 4. 탭
- `menu.ts`: [통계] `href: '/stats'`

### 5. 시험 (jsdom, 가짜 Worker·가짜 통로)
- `StatsExtras.test.tsx`(AC-031.1·031.2), `TrendChart.test.tsx`(▲▼ 글자·파일 자료 안내: AC-031.4·031.5), `ReportText.test.tsx`(복사·확인 필요 표시: AC-031.3), `page.test.tsx`, `jobs.test.ts`(`stats` job이 보기 모양만 돌려줌), `shell.test.tsx`(통계 링크)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.3 chrome.runtime이 없으면 no-extension', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-31 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-31 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/components/stats/StatsExtras.test.tsx src/components/stats/TrendChart.test.tsx src/components/stats/ReportText.test.tsx "src/app/(app)/stats/page.test.tsx" src/workers/precheck/jobs.test.ts src/components/shell/shell.test.tsx
python3 ~/.claude/harness/bin/tdd-run TASK-31 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-031.1 ~ AC-031.5이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/precheck-6-stats/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 그래프 패키지(recharts·chart.js 등)를 새로 넣지 마라. 이유: `package.json`이 수정 범위 밖이고, 새 패키지는 design.md 14절 목록에 없다. SVG로 그린다
- 좋고 나쁨을 색으로만 보이지 마라. 이유: 색을 구분하기 어려운 사람도 읽어야 한다(AC-031.5, UI_GUIDE)
- 도우미 통계 자료(줄·차트번호)를 화면 상태·서버로 보내지 마라. 이유: 계산은 Worker 안에서, 화면에는 보기 모양만(ADR-003·020)
- 지금 파일 길(`analyze` Worker)을 고치지 마라. 이유: 파일 올리기는 예비로 그대로 둔다(사용자)
- 화면을 목업과 다른 배치·문구로 새로 짓지 마라. 이유: 화면은 승인된 목업대로(CLAUDE.md CRITICAL)
- 기존 테스트를 깨뜨리지 마라. 이유: 탭 시험과 지금 통계 Worker 시험이 계속 통과해야 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다

## 참고

- Phase 6 마지막 step이다. 메인 세션이 Phase 끝에 할 일: `verify` → 화면 캡처(PC·휴대폰) → 쉬운 말 보고 → 의원 PC 시험 목록(지난달 숫자를 양지바른·비트 통계와 비교). 새 도우미 zip(`stats.rows` 포함) 설치 안내
- Phase가 끝나면 Phase PR을 만든다. 합치기(merge)·운영 배포·도우미 릴리스 태그(`helper-v*`)는 사용자가 그때마다 지시할 때만 한다. Claude가 자동으로 하지 않는다. 의원 PC 시험은 그 뒤에 한다(확장·`commands.json`에는 운영 주소 하나만 있어 새 화면이 운영에 배포돼야 시험할 수 있다. tasks.md 머리말, design.md 12절)

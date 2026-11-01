# Step 1: revenue-screen

> **TASK-9** 매출 화면 부품 · **REQ-009** · AC-009.1 ~ AC-009.5
> Phase 3 `revenue-3-screen` · Step 1 — `specs/revenue/tasks.md`
> 명세 `specs/revenue/`가 승인된 뒤에만 한다(`python3 ~/.claude/harness/bin/sdd status revenue`로 확인. 승인 전이면 `blocked`). 이 step은 TASK-9 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/revenue/requirements.md`의 REQ-009에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-009.1**: 한 쪽: 제목 줄(가져온 시각, 연결 때 [다시 가져오기]) → 달 고르기(‹ 달 ›) → 네 덩어리. 도구 단추 줄 없음
- **AC-009.2**: 통로 `ready`면 열 때 `planFetch`대로 저절로 가져오며 진행("13달 가운데 n달"), 끝나면 다시 그림. [다시 가져오기]는 고른 달만
- **AC-009.3**: 확장 없는 PC·폰은 저장된 숫자만, [다시 가져오기] 없음, "의원 PC에서 …에 가져온 숫자예요". 저장된 줄도 없으면 '비트 PC 연결 필요'([비트 PC 연결] → `/claim/setup`)
- **AC-009.4**: `empty`·`helper-old`·`extension-old`·`error` 시안대로(`extension-old`는 `helper-old` 모양에 "확장 프로그램을 새 버전으로" 문구). 저장 실패면 오류 카드 + [다시 저장], 가져오지 못한 달이 있으면 "n달을 가져오지 못했어요" + [다시 가져오기]
- **AC-009.5**: 토큰·`ds`만, HTML 막대 + `aria-hidden` + 화면 읽기 표. 폰(768px 미만) 단추·달 고르기 누름 44px 이상, 768px부터 PC 배치(AC ID를 단 클래스 시험). 390·768·1440 가로 스크롤 없음은 E2E(AC-011.1)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·016·020·021
- `/specs/revenue/requirements.md` — 맨 위 승인 줄(시안 승인·사용자 결정 2026-11-01)과 이 step의 REQ
- `/specs/revenue/design.md` — 이 step이 가리키는 절
- `/specs/revenue/tasks.md` — 머리말과 이 step의 TASK
- `/specs/revenue/design.md` — 9절
- `/docs/UI_GUIDE.md` 전부(특히 '차트'·'빈 상태'·'앱 틀'·'휴대폰'·'오류 카드')
- `/src/components/claim/useBridge.ts`(Worker 없이 쓰는 법), `/src/components/claim/*`(오류 카드·연결 먼저 화면 예)
- `/src/components/charts/*`(불러 쓸 부품), `/src/components/ui/classes.ts`(`ds`), `/src/components/ui/classes.test.ts`·`/src/components/charts/rules.test.ts`(화면 규칙 시험이 새 파일도 본다)
- 이전 step에서 만든 파일:
  - `src/components/revenue/view.ts`·`money.ts` (Phase 3 Step 0)
  - `src/lib/revenue/*`, `src/lib/storage/revenue.ts` (Phase 2)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 승인된 시안 (화면 step)

- `docs/mockups/revenue/index.html` — 만든 코드 `docs/mockups/revenue/gen.py`(문구의 원천). 숫자는 모두 예시라 화면에 옮기지 않는다
- 시안의 앱 틀(위쪽 띠·탭 줄)은 이미 있는 `components/shell`이 그린다. 이 step은 본문만 만든다
- 시안과 명세가 다르면 명세가 이긴다. 다른 점은 summary에 적는다


## 수정 범위 (tasks.md TASK-9)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/components/revenue/*.tsx`
  - `src/components/revenue/RevenueScreen.test.tsx`
  - `src/components/revenue/parts.test.tsx`
- Tests:
  - `src/components/revenue/RevenueScreen.test.tsx`
  - `src/components/revenue/parts.test.tsx`
  - `src/components/ui/classes.test.ts`
  - `src/components/charts/rules.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **시안 승인본**: 배치·문구는 `docs/mockups/revenue/index.html`(만든 코드 `gen.py`, 2026-11-01 사용자 승인 "이대로 만들기")의 글자 그대로다 (CLAUDE.md: 화면은 목업 승인 뒤)
- **모양 규칙**: `docs/UI_GUIDE.md` — 토큰 클래스와 `ds`(`components/ui/classes.ts`)만, 16진수·대괄호 임의 값·`font-bold`·`animate-*`·그라데이션·그림자 카드·상자 안 상자 없음. 말끝은 "~요". 숫자는 지어내지 않는다(자료 없으면 "–"와 "자료 없음")
- **그래프**: HTML 막대(% 높이·폭 inline style만), 가로 눈금선만, 그림은 `aria-hidden`, 숫자는 화면 읽기 표(`sr-only`)로도. 증감은 화살표와 글자("늘어남"·"줄어듦")를 같이. `components/charts/*`는 고치지 않고 불러 쓰기만
- **환자 자료는 PC 밖으로 안 나간다**: 서버(Supabase)에는 날짜별 합계 금액·건수(내원·신환·재진·환자 수)·확인 필요 여부와 달별 처방 코드·건수·금액만 간다. 환자 수는 도우미가 비트 DB 안에서 센다. 이름·차트번호·접수 번호·주민번호는 어디에도(답·저장·기록·시험 자료) 없다. 가짜 자료만 쓴다 (CLAUDE.md, design.md 1·3절)
- **통로는 `useBridge`로만**: `lib/bridge/client.ts`를 import하지 않는다(ESLint가 막는다). Worker를 만들지 않는다(`useBridge()` 인자 없이). `revenue.days` 답은 `sync.ts`·`storage/revenue.ts`로만 넘긴다
- **움직임**: 진행 줄은 정적인 막대(폭 %)다. `animate-*`·`@keyframes`·`transition-all` 없음

## 작업

### 1. 부품 (`src/components/revenue/`)
- `RevenueScreen.tsx`(`'use client'`): `useBridge()` → 상태 `ready`면 처음 한 번 `syncRevenue`(call = `bridge.call('revenue.days', …)`, store = `createRevenueStore(browser client)`) → `loadRevenue(13달)` → `buildRevenueView` → 그리기. 고른 달은 `firstMonth(today)`에서 시작, 최근 13달 안에서만 ‹ ›
- 덩어리: `RevenueTrend.tsx`·`RevenueSplit.tsx`·`RevenueTreatments.tsx`·`RevenuePerPatient.tsx`. 그림: `MonthBars.tsx`(13달 막대·쌓은 막대, 고른 달 `accent`·작년 같은 달 `bg-faint`·다른 달 `chart-2`, 급여 `chart-3`·비급여 `accent`), `TreatmentBars.tsx`. 상태: `RevenueStates.tsx`(연결 필요·가져오는 중·자료 없음·도우미 옛것·확장 옛것·저장 실패·가져오지 못한 달). 이름은 바꿔도 되지만 폴더 밖으로 나가지 않는다
- 그림 부품은 훅·`'use client'`가 없는 순수 부품이다(UI_GUIDE '차트')
- 폰(768 미만): KPI 2×2, 막대 날짜 글자 하나 걸러, 순위 막대는 이름·값 한 줄 + 막대 아래 줄, 급여 표의 '지난달보다' 칸 숨김(시안)

### 2. 시험
- `parts.test.tsx`: 보기 모양을 넣어 그린 마크업에 시안 글자·막대 % style·`aria-hidden`·`sr-only` 표·화살표와 "늘어남" 글자가 있다(AC-009.1·009.5)
- `RevenueScreen.test.tsx`: 가짜 `useBridge`·가짜 store로 — 연결 `ready` → 가져오기 → 진행 글자 → 숫자(AC-009.2), 확장 없음 + 줄 있음 → [다시 가져오기] 없음·"의원 PC에서" 글자(AC-009.3), 줄 없음 → '비트 PC 연결 필요'와 `/claim/setup` 링크(AC-009.3), 옛 도우미·옛 확장(`E-BRIDGE-REJECTED`) → 각 '새 버전' 상태(일반 오류 카드·[다시 확인]이 아님), 저장 실패 [다시 저장], 가져오지 못한 달 글자(AC-009.4)
- 기존 화면 규칙 시험(`classes.test.ts`·`rules.test.ts`·상자 겹침)이 새 파일을 자동으로 보고 통과해야 한다(AC-009.5)
- `AC-009.5` 이름을 단 시험: 폰 단추·달 고르기 단추에 44px 누름 클래스(`h-11`·`min-h-11` 또는 `ds`의 폰 크기), 배치가 `md:`(768)에서 바뀌는 클래스, `sm:`·`xl:` 없음. 390·768·1440 가로 스크롤은 E2E(AC-011.1)와 Phase 끝 화면 캡처(메인 세션)에서 본다

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-009.3 확장이 없으면 다시 가져오기 단추가 없다 …', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-9 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-9 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/components/revenue   # AC-009.1~AC-009.5
npx vitest run src/components/ui/classes.test.ts src/components/charts/rules.test.ts src/guardrails.test.ts
python3 ~/.claude/harness/bin/tdd-run TASK-9 --expect green
npm run lint && npm run build && npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가(새 npm·NuGet 패키지 없음)?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/revenue-3-screen/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (사용자 확인·외부 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- `src/app/(app)/revenue/page.tsx`를 고치지 마라. 이유: 준비 중 목록과 함께 TASK-10이 바꾼다. 여기서 바꾸면 준비 중 시험이 깨진다
- 차트 라이브러리·새 npm 패키지를 넣지 마라. 이유: 그래프는 HTML 막대다(UI_GUIDE '차트')
- 빈 그래프 틀이나 0으로 채운 막대를 그리지 마라. 이유: 자료가 없으면 조용한 빈 상태다(UI_GUIDE '빈 상태')
- `components/claim/*`·`components/charts/*`를 고치지 마라. 이유: 다른 기능의 파일이다. 불러 쓰기만
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 기존 테스트를 깨뜨리지 마라. 이유: 앞 TASK와 다른 기능(청구 사전점검 등)의 시험이 계속 통과해야 한다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`를 고치지 마라. 이유: 규칙 문서는 사용자 승인으로만 바뀐다

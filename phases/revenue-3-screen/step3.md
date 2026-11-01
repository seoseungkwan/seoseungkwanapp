# Step 3: tab-ready

> **TASK-10** 준비 중에서 빼기 · **REQ-010** · AC-010.1 ~ AC-010.4
> Phase 3 `revenue-3-screen` · Step 3 — `specs/revenue/tasks.md`
> 명세 `specs/revenue/`가 승인된 뒤에만 한다(`python3 ~/.claude/harness/bin/sdd status revenue`로 확인. 승인 전이면 `blocked`). 이 step은 TASK-10 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/revenue/requirements.md`의 REQ-010에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-010.1**: `notReadyFeatures.ts`에 `/revenue` 없음, `menu.ts` 매출 `ready: true`, 대시보드 기능 목차의 매출이 청구와 같은 `connect-first`("연결 먼저"), [전체 메뉴] "준비 중" 수 하나 줄어듦. 탭 맞춤 시험이 확인하고 탭 수를 고정 숫자로 적지 않음
- **AC-010.2**: `/revenue` 브라우저 탭 이름 "매출 · 의원 이름"
- **AC-010.3**: `plan.md` §2-4·`docs/ARCHITECTURE.md`의 매출 줄이 '폴더 연결·파일'이 아니라 '비트 PC 도우미 읽기(`revenue.days`) → `sales_days`·`sales_codes`'(바뀐 날짜 표시)
- **AC-010.4**: `src/lib/backup/tables.ts`가 이 갈래에 있으면 `sales_days`·`sales_codes`·`rx_groups`가 그 목록에(그 파일 시험), 없으면 ARCHITECTURE.md DB 표 절에 "백업 목록에 `sales_days`·`sales_codes`·`rx_groups`를 넣는다" 줄(`rx_groups`는 총괄이 손으로 만든 유일한 자료)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·016·020·021
- `/specs/revenue/requirements.md` — 맨 위 승인 줄(시안 승인·사용자 결정 2026-11-01)과 이 step의 REQ
- `/specs/revenue/design.md` — 이 step이 가리키는 절
- `/specs/revenue/tasks.md` — 머리말과 이 step의 TASK
- `/specs/revenue/design.md` — 9절, 11절(겹치는 파일)
- `/docs/ARCHITECTURE.md` — '(app)/<기능 주소>/page.tsx' 줄(진짜 화면으로 바꿀 때 같이 고칠 파일)
- `/src/components/common/notReadyFeatures.ts`, `/src/components/shell/menu.ts`, `/src/components/dashboard/briefing/features.ts`와 각 시험, `/src/app/(app)/tabFrame.test.tsx`, `/src/app/(app)/notReadyPages.test.tsx`, `/src/app/titles.test.tsx`
- `/docs/UI_GUIDE.md` — '앱 틀'(준비 중 목록), '빈 상태'
- 이전 step에서 만든 파일:
  - `src/components/revenue/RevenueScreen.tsx`·`groups/*` (Phase 3 Step 1·2)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 승인된 시안 (화면 step)

- `docs/mockups/revenue/index.html` — 만든 코드 `docs/mockups/revenue/gen.py`(문구의 원천). 숫자는 모두 예시라 화면에 옮기지 않는다
- 시안의 앱 틀(위쪽 띠·탭 줄)은 이미 있는 `components/shell`이 그린다. 이 step은 본문만 만든다
- 시안과 명세가 다르면 명세가 이긴다. 다른 점은 summary에 적는다


## 수정 범위 (tasks.md TASK-10)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/app/(app)/revenue/page.tsx`
  - `src/app/(app)/revenue/page.test.tsx`
  - `src/components/common/notReadyFeatures.ts`
  - `src/components/common/notReadyFeatures.test.ts`
  - `src/components/shell/menu.ts`
  - `src/components/shell/shell.test.tsx`
  - `src/components/dashboard/briefing/features.ts`
  - `src/components/dashboard/briefing/features.test.ts`
  - `src/app/(app)/notReadyPages.test.tsx`
  - `src/app/(app)/tabFrame.test.tsx`
  - `src/app/titles.test.tsx`
  - `src/app/notFound.test.tsx`
  - `docs/UI_GUIDE.md`
  - `docs/ARCHITECTURE.md`
- Tests:
  - `src/app/(app)/revenue/page.test.tsx`
  - `src/components/common/notReadyFeatures.test.ts`
  - `src/components/shell/shell.test.tsx`
  - `src/components/dashboard/briefing/features.test.ts`
  - `src/app/(app)/notReadyPages.test.tsx`
  - `src/app/(app)/tabFrame.test.tsx`
  - `src/app/titles.test.tsx`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **시안 승인본**: 배치·문구는 `docs/mockups/revenue/index.html`(만든 코드 `gen.py`, 2026-11-01 사용자 승인 "이대로 만들기")의 글자 그대로다 (CLAUDE.md: 화면은 목업 승인 뒤)
- **모양 규칙**: `docs/UI_GUIDE.md` — 토큰 클래스와 `ds`(`components/ui/classes.ts`)만, 16진수·대괄호 임의 값·`font-bold`·`animate-*`·그라데이션·그림자 카드·상자 안 상자 없음. 말끝은 "~요". 숫자는 지어내지 않는다(자료 없으면 "–"와 "자료 없음")
- **그래프**: HTML 막대(% 높이·폭 inline style만), 가로 눈금선만, 그림은 `aria-hidden`, 숫자는 화면 읽기 표(`sr-only`)로도. 증감은 화살표와 글자("늘어남"·"줄어듦")를 같이. `components/charts/*`는 고치지 않고 불러 쓰기만
- **줄만 고친다**: 다른 탭 명세도 같은 파일의 자기 줄을 고친다. 매출 줄과 "준비 중 n개" 숫자만 바꾸고 다른 탭 줄은 건드리지 않는다(design.md 11절)

## 작업

### 1. 페이지
- `src/app/(app)/revenue/page.tsx`: 준비 중 화면 → `<RevenueScreen />`. `metadata`의 `title`은 "매출"(레이아웃이 "매출 · 의원 이름"으로 만든다)
- `page.test.tsx`: 준비 중 화면이 아니고 매출 화면 뿌리가 있다, 탭 이름(AC-010.2)

### 2. 탭 자료
- `notReadyFeatures.ts`: `NotReadyPath`에서 `'/revenue'`, 목록에서 매출 항목을 뺀다
- `menu.ts`: 매출 `ready: true`(그리고 `href`를 다른 준비된 탭과 같은 방식으로)
- `features.ts`: 매출 `status`를 청구와 같은 `'connect-first'`로
- 시험의 기대값을 목록에 맞춘다. 탭 수·준비 중 수를 고정 숫자로 적지 않고 `MENU`·`NOT_READY_FEATURES`에서 센다(갈래 규칙 C5, 다른 갈래도 같은 시험의 자기 줄을 고친다). 고친 기대값마다 AC-010.1을 이름에 넣는다

### 3. 문서
- `plan.md` §2-4: "의원 PC 비트 폴더의 파일을 읽는다 …" 줄들 뒤에 `(2026-11-01 바뀜: 매출은 비트 PC 도우미의 `revenue.days`로 읽어 `sales_days`·`sales_codes`에 집계만 저장한다. 폴더 연결·파일 끌어다 놓기는 하지 않는다 — specs/revenue)` 한 줄(AC-010.3). §5 DB 표의 `sales_days` 줄도 "칸은 specs/revenue design.md 6절"로
- 백업 목록(AC-010.4): `src/lib/backup/tables.ts`가 있으면(청구 사전점검이 먼저 합쳐진 경우) 표 이름 셋(`sales_days`·`sales_codes`·`rx_groups`)을 목록에 더하고 그 시험(`tables.test.ts`)에 AC-010.4 줄을 더한다. 없으면 이 파일들을 만들지 말고 `docs/ARCHITECTURE.md` DB 표 절에 "백업 목록(`lib/backup/tables.ts`)에 `sales_days`·`sales_codes`·`rx_groups`를 넣는다(`rx_groups`는 총괄이 손으로 만든 유일한 자료)" 줄만 쓴다
- 문서 시험(`src/app/(app)/revenue/page.test.tsx`에, `src/b2b-merge.test.ts`처럼 `node:fs`로 파일을 읽는다): `it('AC-010.3 plan.md §2-4와 ARCHITECTURE.md의 매출 줄이 도우미 읽기(revenue.days)를 말한다')` — `plan.md`에 `revenue.days`·`sales_days`가 있고 §2-4에 바뀐 날짜 줄이 있는지, `docs/ARCHITECTURE.md`의 '[매출]' 데이터 흐름 줄에 '폴더 연결'이 없고 `revenue.days`가 있는지. `it('AC-010.4 백업 목록에 매출 표 둘과 묶음 표')` — `src/lib/backup/tables.ts`가 있으면 그 글자에 `sales_days`·`sales_codes`·`rx_groups`가 있고, 없으면 `docs/ARCHITECTURE.md`에 "백업 목록(`lib/backup/tables.ts`)에 `sales_days`·`sales_codes`·`rx_groups`를 넣는다" 줄이 있는지
- `docs/UI_GUIDE.md` '앱 틀'·'빈 상태'의 준비 중 목록에서 매출만 빼고("10개" 같은 숫자는 새로 적지 않는다, C5), `docs/ARCHITECTURE.md`의 준비 중 탭 줄에서 매출을 빼고 `components/revenue/`·`lib/revenue/`·`lib/storage/` 줄, DB 표의 `sales_days`(칸이 정해짐)·`sales_codes` 줄과 `rx_groups` 줄(칸: 이름·코드 목록·순서, 즐겨찾기는 아직 없음, 매출 탭이 만들고 통계가 나중에 함께 씀), 데이터 흐름 '[매출]' 줄(폴더 연결 → 도우미 읽기)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-010.1 매출은 준비 중 목록에 없다 …', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-10 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-10 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run "src/app/(app)" src/components/common src/components/shell src/components/dashboard src/app/titles.test.tsx src/app/notFound.test.tsx   # AC-010.1~AC-010.4 (lib/backup이 있으면: npx vitest run src/lib/backup)
python3 ~/.claude/harness/bin/tdd-run TASK-10 --expect green
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

- 다른 탭(고시·공지·업무일지 등)의 준비 중 줄을 바꾸지 마라. 이유: 다른 명세의 일이고 합칠 때 겹친다
- 준비 중 화면 부품(`NotReadyScreen.tsx`)을 고치지 마라. 이유: 남은 준비 중 탭이 그대로 쓴다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 기존 테스트를 깨뜨리지 마라. 이유: 앞 TASK와 다른 기능(청구 사전점검 등)의 시험이 계속 통과해야 한다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`를 고치지 마라. 이유: 규칙 문서는 사용자 승인으로만 바뀐다

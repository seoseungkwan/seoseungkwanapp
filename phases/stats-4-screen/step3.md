# Step 3: dashboard-source

> **TASK-16** 대시보드가 저장된 통계 숫자를 읽음 · **REQ-516** · AC-516.1 ~ AC-516.4
> Phase 4 · 화면 `stats-4-screen` · Step 3 — `specs/stats/tasks.md`
> 명세 `specs/stats/`가 승인된 뒤에만 시작한다(`python3 ~/.claude/harness/bin/sdd status stats`). 이 step은 TASK-16 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/stats/requirements.md`의 REQ-516(대시보드가 저장된 통계 숫자를 읽음)에 있다. 아래는 같은 글이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-516.1**: Given `/dashboard`, When 그리면, Then 브라우저에서 저장된 일 숫자(오늘 − 97일 ~ 오늘)를 `readDays`로 읽어 `{ kind: 'data', days }`를 만든다. 읽기 전·줄 없음은 지금 연결 전 모양이고, 읽기 실패는 연결 전 모양 + 오류 카드 한 줄(`E-STATS-READ-FAILED`)이다. 서버 코드(`*.server.ts`·페이지)는 통계 표를 읽지 않는다
- **AC-516.2**: Given 연결 뒤 가짜 자료, When 신환 재방문율을 그리면, Then 30일 줄도 7·14일과 같은 규칙(값이 null이 아닌 날들의 합 ÷ 집단 합, 모두 null이면 "집계 중", 분모 0이면 "자료 없음")이고 "30일 기록은 아직 모으지 않아요"가 없다
- **AC-516.3**: Given 대시보드 브리핑 파일(`components/dashboard/briefing/*`), When 보면, Then 고치지 않았고 `'use client'`는 지금처럼 폰 아래 단추 파일 하나뿐이다. 읽기와 연결 전·뒤 고르기는 `components/dashboard/summary/`의 새 클라이언트 파일 하나가 한다
- **AC-516.4**: Given 지금 대시보드 시험(브리핑·분석·보고 문장·페이지), When 돌리면, Then 30일 줄 기대값과 페이지가 읽기 자리를 부르는 방식만 고치고 나머지는 그대로 통과한다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/specs/stats/requirements.md` — REQ-516
- `/specs/stats/design.md` — '구성 요소 / 인터페이스' TASK-16, '위험'(대시보드 첫 그림)
- `/specs/stats/tasks.md` — TASK-16 (수정 범위·메모)
- `/specs/tab-frame/requirements.md` — REQ-307·311·312·317 (대시보드 분석·자료 읽는 자리)
- `/specs/tab-frame/design.md` '다음 명세가 탭을 채울 때'
- `/src/app/(app)/dashboard/page.tsx`·`page.test.tsx`
- `/src/components/dashboard/summary/*` (`source.ts`·`view.ts`·`DashboardAnalysis.tsx`·`ReportBlock.tsx`)
- `/src/components/dashboard/briefing/DashboardHome.tsx` (고치지 않음 — 받는 props만 본다)
- `/src/lib/storage/stats.ts` (TASK-7)
- 이전 step에서 만든 파일: TASK-7 (`readDays`), TASK-2 (`within30`)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 승인된 목업 (화면 step)

- `docs/mockups/stats/index.html`·`notes.md` 승인본(TASK-12). `notes.md` 맨 위에 '승인:' 줄이 없으면 시작하지 말고 `blocked`(사유: 목업 승인 전)로 멈춘다
- 명세의 화면 AC는 내용과 동작을 정하고, 배치·문구는 목업이 정한다

## 수정 범위 (tasks.md TASK-16)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/components/dashboard/summary/LiveDashboard.tsx`
  - `src/components/dashboard/summary/LiveDashboard.test.tsx`
  - `src/components/dashboard/summary/source.ts`
  - `src/components/dashboard/summary/source.test.ts`
  - `src/components/dashboard/summary/view.ts`
  - `src/components/dashboard/summary/view.test.ts`
  - `src/components/dashboard/summary/DashboardAnalysis.tsx`
  - `src/components/dashboard/summary/DashboardAnalysis.test.tsx`
  - `src/app/(app)/dashboard/page.tsx`
  - `src/app/(app)/dashboard/page.test.tsx`
  - `src/app/(app)/tabFrame.test.tsx`
- Tests:
  - `src/components/dashboard/summary/LiveDashboard.test.tsx`
  - `src/components/dashboard/summary/source.test.ts`
  - `src/components/dashboard/summary/view.test.ts`
  - `src/components/dashboard/summary/DashboardAnalysis.test.tsx`
  - `src/app/(app)/dashboard/page.test.tsx`
  - `src/app/(app)/tabFrame.test.tsx`
- TDD: required
- 메모: `components/dashboard/briefing/*`는 고치지 않는다(AC-516.3)

## 꼭 지킬 규칙 (CRITICAL)

- **화면은 승인된 목업대로**: 배치·문구·상태는 `docs/mockups/stats/` 승인본(`notes.md` 맨 위 승인 기록)을 따른다. 모양은 `components/ui/classes.ts`의 `ds`와 `globals.css` 토큰만(옛 `ui.`·옛 Tailwind 이름·`font-bold` 없음, 굵기 400·500·600). 좋고 나쁨은 색만 쓰지 않고 ▲▼·글자를 같이 쓴다. 그래프는 움직이지 않는다. 상자 안 상자 금지 (CLAUDE.md, docs/UI_GUIDE.md)
- **새 서버 경로 없음**: `app/api/*`·Route Handler·Server Action을 만들지 않는다. 서버 코드는 `app/api/ai/` 하나다. 통계 숫자는 브라우저가 Supabase(RLS)에 바로 읽고 쓴다. 페이지·`*.server.ts`는 통계 표를 읽지 않는다 (CLAUDE.md, ADR-004)
- **브라우저 저장소·주소 안 씀**: 숫자·처방 이름·보고 글을 `localStorage`·`sessionStorage`·`indexedDB`·주소(URL·쿼리)·`history.state`에 넣지 않는다. 화면 상태와 Worker 메모리에만 둔다

## 작업

### 1. 읽기 자리
- `source.ts`: `dashboardSummarySource()` 대신 `toSummarySource(result: Awaited<ReturnType<typeof readDays>> | null): SummarySource`(순수, 줄 없음·null → none). `isConnected`는 그대로
- `LiveDashboard.tsx`(`'use client'`, 새 파일): `readDays({ from: addDays(today, −97), to: today })` → `toSummarySource` → `DashboardHome`(지금 props: `today`·`report`·`analysis`)을 그린다. 읽는 동안 분석 자리는 "불러오는 중", 실패는 연결 전 모양 + 오류 카드 한 줄(`E-STATS-READ-FAILED`)(AC-516.1)
- `dashboard/page.tsx`: `LiveDashboard today={todayInKorea()}` 하나를 놓는다. 서버는 통계 표를 읽지 않는다

### 2. 30일 줄 (`view.ts`·`DashboardAnalysis.tsx`)
- `revisitView`에 `d30`(7·14일과 같은 규칙), `DashboardAnalysis`의 30일 줄이 그 값을 그린다. "30일 기록은 아직 모으지 않아요"를 없앤다(AC-516.2)

### 3. 시험
- `LiveDashboard.test.tsx`(가짜 `readDays`: 읽는 중·줄 없음·자료·실패), `source.test.ts`, `view.test.ts`·`DashboardAnalysis.test.tsx`(30일 줄 기대값만), `page.test.tsx`·`tabFrame.test.tsx`(페이지가 `LiveDashboard`를 놓음, 연결 전 모양 그대로)
- AC-516.3: 브리핑 폴더의 `'use client'`가 하나뿐임(지금 `DashboardHome.test.tsx` 시험이 그대로 통과)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-501.2 31일째에만 다시 오면 30일 재방문이 아니다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-16 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-16 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/components/dashboard "src/app/(app)/dashboard" "src/app/(app)/tabFrame.test.tsx"
npx vitest run src/components/stats src/lib/storage
python3 ~/.claude/harness/bin/tdd-run TASK-16 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status stats`에서 AC-516.1 ~ AC-516.4이 이 TASK의 시험과 이어져 보여야 한다

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

- `components/dashboard/briefing/*`를 고치지 마라. 이유: AC-516.3, 브리핑은 서버에서 그리는 부품이다
- 페이지·`*.server.ts`에서 통계 표를 읽지 마라. 이유: 서버 코드는 세션과 내 병원 줄만(CLAUDE.md, ADR-004)
- 읽기 전·실패에 지어낸 숫자나 빈 그래프 틀을 보이지 마라. 이유: 연결 전 모양 그대로(UI_GUIDE '빈 상태')
- 대시보드의 다른 문구·배치를 바꾸지 마라. 이유: 탭 틀·ui-90 시안이 정한 것이다
- 기존 테스트를 깨뜨리지 마라. 이유: 지금 통계 엔진·청구·탭 틀 시험이 계속 통과해야 한다(이 TASK의 Files에 있는 시험만, 정한 칸만 고친다)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- `specs/precheck/`·`phases/precheck-*`를 고치지 마라. 이유: 청구 브랜치가 그 파일을 가진다. 그쪽이 할 일은 `specs/stats/design.md` '사전점검 명세가 할 일'에 적혀 있다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 새 npm·NuGet 패키지를 넣지 마라. 이유: `package.json`·csproj가 수정 범위 밖이고 ADR 기술 스택 밖이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`plan.md`를 고치지 마라 · `docs/*`. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다

# Step 2: stats-tab

> **TASK-15** 통계 탭을 진짜 화면으로 · **REQ-515** · AC-515.1 ~ AC-515.5
> Phase 4 · 화면 `stats-4-screen` · Step 2 — `specs/stats/tasks.md`
> 명세 `specs/stats/`가 승인된 뒤에만 시작한다(`python3 ~/.claude/harness/bin/sdd status stats`). 이 step은 TASK-15 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/stats/requirements.md`의 REQ-515(통계 탭을 진짜 화면으로 (탭 · 목차 · 준비 중 목록))에 있다. 아래는 같은 글이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-515.1**: Given `MENU`, When 통계 항목을 읽으면, Then `href`가 `/stats`이고 `ready: true`다. 지금 탭 판단(`currentMenuLabel`)과 다른 12개 항목은 그대로다
- **AC-515.2**: Given `DASHBOARD_FEATURES`, When 통계 항목을 읽으면, Then `status: 'connect-first'`이고(연결 전 "연결 먼저", 연결 뒤 "사용 가능") 기능 목차 옆 글의 개수는 그 목록에서 센 값과 같다(시험은 개수를 글자로 못 박지 않고 목록에서 센다 — 다른 탭 명세도 같은 줄을 바꾼다)
- **AC-515.3**: Given `NOT_READY_FEATURES`·`NotReadyPath`, When 읽으면, Then `/stats`가 빠졌고 다른 항목은 그대로다. 시험은 개수를 숫자로 못 박지 않고 탭 목록(`MENU`)에서 준비 중인 것과 견준다
- **AC-515.4**: Given `/stats` 페이지, When 그리면, Then `NotReadyScreen`이 아니라 `StatsScreen`(병원 이름은 `currentMe()`가 준 내 병원 이름)이고 브라우저 탭 이름은 "통계"다. 탭 틀 통합 시험(`src/app/(app)/tabFrame.test.tsx`)이 세 곳(menu · features · notReady)과 페이지가 맞는지 보고 통과한다
- **AC-515.5**: Given 로그인, When 콜백·문지기를 지나면, Then 첫 화면은 지금처럼 `/dashboard`다(tab-frame AC-301.1·301.2 시험 그대로 통과)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/specs/stats/requirements.md` — REQ-515
- `/specs/stats/design.md` — '구성 요소 / 인터페이스' TASK-15, '다른 작업과 겹치는 파일'
- `/specs/stats/tasks.md` — TASK-15 (수정 범위·메모)
- `/specs/tab-frame/design.md` '다음 명세가 탭을 채울 때'
- `/src/components/shell/menu.ts`·`shell.test.tsx`
- `/src/components/dashboard/briefing/features.ts`·`features.test.ts`·`FeatureIndex.tsx`·`DashboardHome.test.tsx`
- `/src/components/common/notReadyFeatures.ts`·`notReadyFeatures.test.ts`, `/src/app/(app)/notReadyPages.test.tsx`, `/src/app/(app)/tabFrame.test.tsx`, `/src/app/titles.test.tsx`
- `/src/app/(app)/stats/page.tsx`(지금 준비 중), `/src/app/(app)/currentMe.server.ts`, `/src/app/(app)/claim/page.tsx`(본보기)
- `/src/components/stats/StatsScreen.tsx` (TASK-14)
- 이전 step에서 만든 파일: TASK-14 (`StatsScreen`)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 승인된 목업 (화면 step)

- `docs/mockups/stats/index.html`·`notes.md` 승인본(TASK-12). `notes.md` 맨 위에 '승인:' 줄이 없으면 시작하지 말고 `blocked`(사유: 목업 승인 전)로 멈춘다
- 명세의 화면 AC는 내용과 동작을 정하고, 배치·문구는 목업이 정한다

## 수정 범위 (tasks.md TASK-15)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/app/(app)/stats/page.tsx`
  - `src/app/(app)/stats/page.test.tsx`
  - `src/components/shell/menu.ts`
  - `src/components/shell/shell.test.tsx`
  - `src/components/dashboard/briefing/features.ts`
  - `src/components/dashboard/briefing/features.test.ts`
  - `src/components/dashboard/briefing/DashboardHome.test.tsx`
  - `src/components/common/notReadyFeatures.ts`
  - `src/components/common/notReadyFeatures.test.ts`
  - `src/app/(app)/notReadyPages.test.tsx`
  - `src/app/(app)/tabFrame.test.tsx`
  - `src/app/titles.test.tsx`
- Tests:
  - `src/app/(app)/stats/page.test.tsx`
  - `src/components/shell/shell.test.tsx`
  - `src/components/dashboard/briefing/features.test.ts`
  - `src/components/dashboard/briefing/DashboardHome.test.tsx`
  - `src/components/common/notReadyFeatures.test.ts`
  - `src/app/(app)/notReadyPages.test.tsx`
  - `src/app/(app)/tabFrame.test.tsx`
- TDD: required
- 메모: 옛 시험은 통계 줄(href·ready·status·준비 중 목록·목차 옆 글)만 고친다. 개수는 숫자로 못 박지 않고 목록에서 센다(cross-branch C5). `titles.test.tsx`는 `/stats` 탭 이름 시험이 준비 중 자료를 가정할 때만 고친다

## 꼭 지킬 규칙 (CRITICAL)

- **화면은 승인된 목업대로**: 배치·문구·상태는 `docs/mockups/stats/` 승인본(`notes.md` 맨 위 승인 기록)을 따른다. 모양은 `components/ui/classes.ts`의 `ds`와 `globals.css` 토큰만(옛 `ui.`·옛 Tailwind 이름·`font-bold` 없음, 굵기 400·500·600). 좋고 나쁨은 색만 쓰지 않고 ▲▼·글자를 같이 쓴다. 그래프는 움직이지 않는다. 상자 안 상자 금지 (CLAUDE.md, docs/UI_GUIDE.md)
- **새 서버 경로 없음**: `app/api/*`·Route Handler·Server Action을 만들지 않는다. 서버 코드는 `app/api/ai/` 하나다. 통계 숫자는 브라우저가 Supabase(RLS)에 바로 읽고 쓴다. 페이지·`*.server.ts`는 통계 표를 읽지 않는다 (CLAUDE.md, ADR-004)

## 작업

### 1. 페이지 (`src/app/(app)/stats/page.tsx`)
```tsx
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: '통계' }
export default async function StatsPage() { const me = await currentMe(); return <StatsScreen hospitalName={…내 병원 이름} today={todayInKorea()} /> }
```
- `currentMe()`가 주는 병원 이름을 쓴다(문지기가 이미 읽은 내 병원 줄 — 새로 읽지 않는다). 모양이 다르면 그 모양에 맞춰 이름만 꺼낸다

### 2. 세 곳 맞춤
- `menu.ts`: 통계 `href: '/stats'`, `ready: true`(AC-515.1)
- `briefing/features.ts`: 통계 `status: 'connect-first'`(AC-515.2) — 목차 옆 글은 개수로 저절로 바뀐다
- `notReadyFeatures.ts`: `/stats` 항목과 `NotReadyPath`의 `'/stats'` 빼기(AC-515.3)

### 3. 옛 시험 고치기 (통계 줄만)
- `shell.test.tsx`(통계 href·ready), `features.test.ts`(통계 status), `DashboardHome.test.tsx`(목차 옆 글과 '연결 먼저'·'사용 가능' 개수 — 숫자를 글자로 못 박지 말고 `DASHBOARD_FEATURES`에서 센 값으로 기대한다, cross-branch C5), `notReadyFeatures.test.ts`·`notReadyPages.test.tsx`(`/stats`가 빠짐 — 개수는 `MENU`의 준비 중 항목에서 센다), `tabFrame.test.tsx`(세 곳 맞춤 — `/stats` 페이지가 `StatsScreen`), `titles.test.tsx`(필요할 때만)
- 새 시험 `src/app/(app)/stats/page.test.tsx`(AC-515.4: `StatsScreen`에 병원 이름·오늘, 탭 이름 "통계", `NotReadyScreen` 아님), AC-515.5는 `tabFrame.test.tsx`의 로그인 시험이 그대로 통과

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-501.2 31일째에만 다시 오면 30일 재방문이 아니다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-15 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-15 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run "src/app/(app)" src/components/shell src/components/dashboard/briefing src/components/common src/app/titles.test.tsx
npx vitest run src/app/auth src/middleware.test.ts   # 로그인 첫 화면 그대로
python3 ~/.claude/harness/bin/tdd-run TASK-15 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status stats`에서 AC-515.1 ~ AC-515.5이 이 TASK의 시험과 이어져 보여야 한다

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

- 로그인 콜백·문지기(`/dashboard`로 보내기)를 바꾸지 마라. 이유: 첫 화면은 대시보드다(AC-515.5, tab-frame REQ-301)
- 다른 탭 항목(이름·주소·순서·상태)을 바꾸지 마라. 이유: 다른 명세 몫이다
- 페이지에서 통계 표를 읽지 마라(서버에서 Supabase 읽기). 이유: 서버 코드는 세션과 내 병원 줄만(CLAUDE.md, ADR-004)
- 옛 시험의 통계 밖 기대값을 바꾸지 마라. 이유: 탭 틀 규칙은 그대로다
- 탭·목차 개수를 시험·AC에 숫자로 새로 못 박지 마라. 이유: 다른 탭 명세도 같은 줄을 바꿔 합칠 때마다 깨진다(cross-branch C5)
- 기존 테스트를 깨뜨리지 마라. 이유: 지금 통계 엔진·청구·탭 틀 시험이 계속 통과해야 한다(이 TASK의 Files에 있는 시험만, 정한 칸만 고친다)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- `specs/precheck/`·`phases/precheck-*`를 고치지 마라. 이유: 청구 브랜치가 그 파일을 가진다. 그쪽이 할 일은 `specs/stats/design.md` '사전점검 명세가 할 일'에 적혀 있다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 새 npm·NuGet 패키지를 넣지 마라. 이유: `package.json`·csproj가 수정 범위 밖이고 ADR 기술 스택 밖이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`plan.md`를 고치지 마라 · `docs/*`. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다

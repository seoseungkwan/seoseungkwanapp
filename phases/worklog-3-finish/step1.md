# Step 1: tab-hookup

> **TASK-12** 탭 연결 · **REQ-012** · AC-012.1 ~ AC-012.5
> Phase 3 `worklog-3-finish` · Step 1 — `specs/worklog/tasks.md`
> 명세 `specs/worklog/`는 승인됐다. 이 step은 TASK-12 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/worklog/requirements.md`의 REQ-012에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-012.1**: `/worklog` = 업무일지 화면(준비 중 아님). 오늘 = 요청 때 한국 날짜. metadata 제목 "업무일지"
- **AC-012.2**: 탭 목록 업무일지 `href: '/worklog'`·`ready: true`, [전체 메뉴] 판에 "준비 중" 칩 없음
- **AC-012.3**: 대시보드 기능 목차 업무일지 `ready`
- **AC-012.4**: 준비 중 목록에 `/worklog` 없음, 탭 틀 통합 시험·준비 중 페이지 시험·탭 이름 시험이 바뀐 목록으로 통과
- **AC-012.5**: 대시보드 기능 목차 옆 글·준비 중 개수·사용 가능 개수의 기대 숫자는 목록(`DASHBOARD_FEATURES`·`NOT_READY_FEATURES`)에서 센다(손 숫자 없음, cross-branch C5)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·019와 끝의 업무일지 ADR(Phase 1 Step 0이 더함)
- `/specs/worklog/requirements.md` — REQ-012
- `/specs/worklog/design.md` — 14절(탭 연결), 18절(겹치는 파일)
- `/specs/worklog/tasks.md` — 이 TASK의 수정 범위·메모
- 승인된 시안 `/docs/mockups/worklog/index.html` (화면 step이면 꼭)
- `/specs/tab-frame/design.md` — '다음 명세가 탭을 채울 때'
- `/src/app/(app)/layout.tsx`·`currentMe.server.ts`·`dashboard/page.tsx`(서버 페이지가 날짜·문지기 값을 넘기는 법)
- `/src/components/shell/menu.ts`·`/src/components/dashboard/briefing/features.ts`·`/src/components/common/notReadyFeatures.ts`와 그 시험들
- `/src/app/(app)/tabFrame.test.tsx`·`notReadyPages.test.tsx`·`/src/app/titles.test.tsx`
- `/src/components/worklog/WorklogScreen.tsx` (Phase 2)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-12)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/app/(app)/worklog/page.tsx`
  - `src/app/(app)/worklog/page.test.tsx`
  - `src/components/shell/menu.ts`
  - `src/components/shell/shell.test.tsx`
  - `src/components/dashboard/briefing/features.ts`
  - `src/components/dashboard/briefing/features.test.ts`
  - `src/components/common/notReadyFeatures.ts`
  - `src/components/common/notReadyFeatures.test.ts`
  - `src/app/(app)/notReadyPages.test.tsx`
  - `src/app/(app)/tabFrame.test.tsx`
  - `src/app/titles.test.tsx`
  - `src/components/dashboard/briefing/DashboardHome.test.tsx`
  - `src/app/(app)/dashboard/page.test.tsx`
  - `src/components/dashboard/briefing/FeatureIndex.tsx` (윗주석만)
  - `docs/ARCHITECTURE.md`·`docs/UI_GUIDE.md` (design.md 14절의 줄만)
  - `phases/worklog-2-screen/index.json`·`phases/worklog-3-finish/index.json`
- Tests:
  - `src/app/(app)/worklog/page.test.tsx`
  - `src/components/shell/shell.test.tsx`
  - `src/components/dashboard/briefing/features.test.ts`
  - `src/components/common/notReadyFeatures.test.ts`
  - `src/app/(app)/notReadyPages.test.tsx`
  - `src/app/(app)/tabFrame.test.tsx`
  - `src/app/titles.test.tsx`
  - `src/components/dashboard/briefing/DashboardHome.test.tsx`
  - `src/app/(app)/dashboard/page.test.tsx`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- 네 곳(`menu.ts`·`features.ts`·`notReadyFeatures.ts`·`page.tsx`)을 **같은 step에서** 바꾼다. 한쪽만 바꾸면 `tabFrame.test.tsx`가 깨진다(tab-frame 규칙)
- 이 네 파일과 시험은 통계·매출·환자 갈래도 자기 한 줄씩 바꾼다: **업무일지 줄만** 고친다. 다른 탭의 줄·순서는 그대로
- 페이지는 서버 컴포넌트다. 병원 id를 넘기지 않는다(저장은 RLS·DB 기본값이 내 병원으로 한다). 승인 확인은 `(app)/layout`이 한다

## 작업

### 1. `src/app/(app)/worklog/page.tsx`
```tsx
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: '업무일지' }
export default function WorklogPage() {
  return <WorklogScreen initialToday={todayInKorea()} />
}
```

### 2. 목록 셋
- `menu.ts`: `MenuHref`에 `'/worklog'`, 업무일지 `href: '/worklog', ready: true`
- `features.ts`: 업무일지 `status: 'ready'`
- `notReadyFeatures.ts`: `NotReadyPath`와 `NOT_READY_FEATURES`에서 `/worklog` 빼기

### 3. 시험
- `page.test.tsx`(새, jsdom): 그린 결과가 `WorklogScreen`(mock)에 `initialToday: todayInKorea()`를 넘김, `hospitalId`를 넘기지 않음, metadata `'업무일지'`, 준비 중 글자("준비 중이에요") 없음
- 기존 시험은 업무일지 기대만 바꾼다: `notReadyPages.test.tsx`(업무일지 줄 빼기), `titles.test.tsx`(준비 중 목록에서 빼고 `{ path: '/worklog', title: '업무일지', load }` 한 줄), `notReadyFeatures.test.ts`(목록 개수·업무일지 줄), `features.test.ts`(업무일지 `ready`), `shell.test.tsx`(업무일지 `ready`·칩 기대가 있으면), `tabFrame.test.tsx`(ready/soon 나눔이 업무일지를 셈하면), `DashboardHome.test.tsx`(`INDEX_SIDE` "12개 가운데 1개는 지금 …"·준비 중 10개·사용 가능 2개 기대 — `FeatureIndex.tsx`가 목록에서 세므로 코드는 그대로이고, 시험의 손 숫자를 `DASHBOARD_FEATURES.filter(…).length`로 바꾼다. 다른 갈래가 탭을 채워도 그대로 통과해야 한다). 이 TASK가 고치는 시험에서는 개수를 늘 목록에서 센다(`toHaveLength(10)` 같은 손 숫자를 새로 쓰지 않는다). `shell.test.tsx`의 "준비 중 주소 /worklog" 탭 띠 밀기 시험은 경로만 쓰므로 그대로 둔다(겹침 줄이기, design.md 14절)

### 4. 끝나고 화면 확인 (Phase 3 화면 캡처)
- `npm run dev` → dev-browser로 `/worklog` 1440·390 캡처. 실제 Supabase에 표가 아직 없으면(사용자 OK 전) 불러오기 실패 카드가 보이는 것이 맞다. 캡처에 쿠키·토큰·이메일이 보이지 않게 한다

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-002.2: 수납액은 현금·카드·계좌·지역화폐만 더한다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-12 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-12 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run 'src/app/(app)/worklog/page.test.tsx' src/components/shell/shell.test.tsx src/components/dashboard/briefing/features.test.ts src/components/common/notReadyFeatures.test.ts 'src/app/(app)/notReadyPages.test.tsx' 'src/app/(app)/tabFrame.test.tsx' src/app/titles.test.tsx src/app/notFound.test.tsx src/components/dashboard/briefing/DashboardHome.test.tsx   # AC-012.1~AC-012.5
python3 ~/.claude/harness/bin/tdd-run TASK-12 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status worklog`에서 AC-012.1 ~ AC-012.5가 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (환자 개인정보는 서버로 가지 않는다 — 업무사항은 사용자 결정으로 서버에 두되 AI로 보내지 않고, 막는 모양은 저장하지 않는다. RLS, 비밀값)
3. 결과에 따라 `phases/worklog-3-finish/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 실제 Supabase에 SQL 붙여 넣기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 다른 탭(통계·매출·환자 등)의 `ready`·`href`·준비 중 항목을 바꾸지 마라. 이유: 그 갈래의 일이고 합칠 때 겹친다
- `menu.ts`의 설정 `href: null` 규칙을 건드리지 마라. 이유: 비트 PC 연결 화면이 그 값으로 [청구·연락] 링크를 정한다(tab-frame design.md)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 실제 Supabase에 SQL을 실행하거나 붙여 넣지 마라(대시보드·CLI·REST 모두). 이유: DB 바꾸기는 사용자 OK가 필요하다(design.md 8절)
- 시험·고정 자료에 실제 의원 숫자(엑셀 10월 값)·환자 이름·차트번호·전화번호를 쓰지 마라. 이유: 가짜 자료만 쓴다(CLAUDE.md). 둥근 가짜 숫자(예: 100000)와 "가상" 글자를 쓴다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`를 고치지 마라. `docs/*`는 위 '수정 범위'의 두 문서에서 design.md 14절이 적은 줄만 고친다. 이유: 이 step의 범위가 아니고, 규칙 문서는 Phase 1 Step 0과 사용자 승인으로만 바뀐다

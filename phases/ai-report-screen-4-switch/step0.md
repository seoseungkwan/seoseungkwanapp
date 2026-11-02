# Step 0: switch

> **TASK-10** 탭 켜기 · **REQ-714**
> Phase 4 `ai-report-screen-4-switch` · Step 0(하나뿐). 앞 단계에서 만든 화면을 탭에 붙인다.
> 작업 폴더: `C:\Users\tjtmd\Desktop\dasdas\seoseungkwanapp\.claude\worktrees\feat-ai-report-screen`

## 읽어야 할 파일
- `/CLAUDE.md`, `/specs/ai-report-screen/requirements.md`(REQ-714), `/specs/ai-report-screen/tasks.md`(머리말, TASK-10의 '근거'와 '할 일'), `/specs/ai-report-screen/design.md`(위 1~10번 줄의 구조, '화면 상태', '위험' 6번)
- `src/components/ai-report/AiReportScreen.tsx`(앞 단계 결과. 고치지 않는다. `today: string`을 받는다)
- `src/app/(app)/dashboard/page.tsx`(`force-dynamic`·`todayInKorea()`를 쓰는 본보기)
- 시안 `docs/mockups/ai-report/index.html`은 1.1MB다. **통째로 읽지 마라.** UI_GUIDE 절을 쓰는 데에는 design '화면 상태'로 충분하다.

## 수정 범위 (승인된 Files, 이 14개뿐)
코드: `src/app/(app)/ai-report/page.tsx`, `src/components/shell/menu.ts`, `src/components/common/notReadyFeatures.ts`, `src/components/dashboard/briefing/features.ts`
시험: `src/components/shell/shell.test.tsx`, `src/components/common/notReadyFeatures.test.ts`, `src/components/dashboard/briefing/features.test.ts`, `src/components/dashboard/briefing/DashboardHome.test.tsx`, `src/app/(app)/notReadyPages.test.tsx`, `src/app/(app)/tabFrame.test.tsx`, `src/app/(app)/dashboard/page.test.tsx`, `src/app/titles.test.tsx`
문서: `docs/UI_GUIDE.md`, `docs/ARCHITECTURE.md`

## 작업

### 페이지 (AC-714.3)
`src/app/(app)/ai-report/page.tsx`를 진짜 화면으로 바꾼다. `NotReadyScreen`·`notReadyFeature`를 쓰지 않는다. `export const dynamic = 'force-dynamic'`, `metadata = { title: 'AI 리포트' }`, `<AiReportScreen today={todayInKorea()} />`. 페이지 안에서 여백 틀을 더 씌우지 않는다. `AppShell.tsx:61`이 이미 시안(`.wa`·`.main`)과 같은 여백을 준다.

### 메뉴·목록 (AC-714.1·2·4)
- `menu.ts`: 'AI 리포트'를 `href: '/ai-report'`, `ready: true`로.
- `notReadyFeatures.ts`: `/ai-report` 항목과 `NotReadyPath`의 `'/ai-report'`를 뺀다. 그 뒤 `tsc`가 알려 주는 곳을 Files 안에서 고친다.
- `features.ts`: 'AI 리포트'의 `desc`는 "지난달·작년 같은 달과 견준 월간 AI 보고", `status`는 `'ready'`. 기능 목차 옆 글(`FeatureIndex.tsx:47`)은 계산으로 나오므로 그 파일은 고치지 않는다.

### 시험 (먼저 고친다)
- tasks.md TASK-10 '할 일'을 그대로 따른다. 옛 AC ID는 시험 이름에 두고 수만 고친다("준비 중 10개" → "준비 중 9개"). 지우지 말고 새 값으로 고친다.
- `titles.test.tsx`: `/ai-report`를 `notReadyFeature`를 쓰는 목록에서 빼고 `{ path: '/ai-report', title: 'AI 리포트', load: () => import('./(app)/ai-report/page') }`처럼 직접 적는다.
- `notReadyPages.test.tsx`: `AiReportPage` import와 표의 줄을 빼고 9개로. 같은 파일에 **AC-714.3 시험을 더한다**(페이지 시험 파일을 따로 만들 수 없다, Files 밖이다).
  - `@/components/ai-report/AiReportScreen`을 가짜로 바꿔 받은 `today`를 본다. 가짜 시계 `2026-11-01T15:30:00Z`에서 `today`가 `2026-11-02`인지 본다(한국 날짜라는 증거. UTC면 11-01이 된다).
  - `dynamic`이 `'force-dynamic'`인지, 그린 결과에 준비 중 화면이 없는지, 소스에 `NotReadyScreen`·`notReadyFeature`가 없는지 본다.
- AC-714.1: 탭 줄과 [전체 메뉴]에서 `/ai-report` 링크가 있고 칩이 없는지 `shell.test.tsx`에서 본다. 머리는 `['모든 탭 13개', '준비 중 9개']`.
- AC-714.2: 9개이고 `/ai-report`가 없는지 `notReadyFeatures.test.ts`에서 본다.
- AC-714.4: `features.test.ts`·`DashboardHome.test.tsx`·`dashboard/page.test.tsx`에서 `status`·설명·"사용 가능" 표시·"준비 중" 9개·"12개 가운데 2개는 지금, 1개는 연결하면 쓸 수 있어요"를 본다.
- 새 AC는 시험 이름에 `AC-714.x`를 적는다. AC-714.5는 문서 조건이라 시험을 만들지 않고 아래 grep으로 본다(다음 탭을 켤 때 함정이 되는 영구 시험을 늘리지 않는다).

### 문서 (AC-714.5)
- `docs/UI_GUIDE.md`
  - 285번 줄 근처 "주소 10개" → 9개.
  - 306번 줄 근처 "화면이 아직 없는 10개(…)" 목록에서 AI 리포트를 빼고 9개로. "대시보드·청구·설정만 `true`"에 AI 리포트를 더한다.
  - 310번 줄 근처 "준비 중 10개" → 9개.
  - 335~337번 줄 근처 기능 목차 표시 목록에 AI 리포트(`ready`, "사용 가능")를 더하고 "나머지 9개".
  - `## 대시보드` 절 다음, `## 인증 화면` 앞에 `## AI 리포트 (`/ai-report`)` 절을 더한다. 내용: 부품 위치(`components/ai-report/`), 승인 시안 경로, 머리·본문·옆 칸 짜임, design '화면 상태' 표의 상태들, 달을 옮겨도 저장하지 않는다는 것. 코드에 없는 것을 지어내지 말고 design·코드에서 옮긴다. 짧게.
- `docs/ARCHITECTURE.md`
  - 11번 줄 "탭 10개" → 9개.
  - 22~23번 줄 근처 폴더 나무에 `ai-report/` 한 줄(다른 줄과 같은 모양).
- 옛 명세(`specs/ui-90`·`specs/tab-frame`)는 고치지 않는다. 랜딩 `AiSection.tsx`의 "준비 중" 칩과 `NotReadyScreen.tsx` 주석의 "10개"는 Files 밖이다. 고치지 말고 답에 그대로 적어라.

## TDD 순서 (이 Phase의 함정이 있다)
1. 시험을 먼저 고친다. 코드 4개 파일은 그대로 둔다.
2. `npx vitest run <시험 8개 파일>`을 돌려 **어떤 시험이 새로 실패하는지 이름을 적어 둔다.**
3. `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-10 --expect red`로 RED를 기록한다.
4. 코드를 고친다. 문서를 고친다.
5. `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-10`으로 결과를 기록한다.

**함정:** `src/app/(app)/tabFrame.test.tsx`의 다음 2개는 이 PC(윈도우)에서 **시작 전부터 실패한다.** 경로 구분자가 `\`라서 `endsWith('briefing/DashboardHome.tsx')`가 거짓이 되는 것이고, 리눅스에서는 통과한다.
- `AC-301.3: 대시보드 페이지와 components/dashboard/**(시험 밖) 소스에 다른 주소로 보내는 코드가 없다`
- `AC-404.2: 시험 파일 밖 src/components/**·src/app/** 소스에 data-page-surface가 없다`

그래서:
- 3번의 `--expect red`는 이 2개만으로도 성공한다. **기록만 믿지 말고 2번에서 적은 이름으로 진짜 RED를 증명하라.** 위 2개 말고 새로 실패한 시험이 AC-714.1~4마다 있어야 한다.
- 5번은 종료 코드 1이 정상이고 기록도 RED로 남는다. `--expect green`은 쓰지 않는다. 합격 조건은 **실패가 정확히 위 2개뿐인 것**이다.
- 이 2개를 고치지 마라(윈도우 시험 고치기는 별도 명세로 하기로 했다). 다른 이유로 실패가 생겼다면 그것은 고쳐야 한다.

## 이 PC(윈도우)에서
- 파일은 Edit·Write 도구로만 고친다. 스크립트·`sed`로 고치지 않는다(읽기만 `sed`).
- **줄바꿈을 유지한다.** 고칠 파일은 모두 LF다(`git ls-files --eol`로 확인. 처음 이 지시서는 CRLF라고 잘못 적었다, Git Bash의 `grep -c $'\r'`은 믿지 않는다). 끝난 뒤 `git diff --stat`에서 파일 전체가 바뀐 것처럼 보이면 안 된다.
- `npx`·`python`은 이 작업 폴더에서 돌린다.

## Acceptance Criteria
```bash
npx vitest run src/components/shell/shell.test.tsx src/components/common/notReadyFeatures.test.ts src/components/dashboard/briefing/features.test.ts src/components/dashboard/briefing/DashboardHome.test.tsx "src/app/(app)/notReadyPages.test.tsx" "src/app/(app)/tabFrame.test.tsx" "src/app/(app)/dashboard/page.test.tsx" src/app/titles.test.tsx
# 실패는 위 함정의 2개뿐이어야 한다
npx vitest run src/components/ui/classes.test.ts src/components/landing/rules.test.ts src/app/theme.test.ts src/b2b-merge.test.ts src/components/common/adminContact.test.ts
# UI_GUIDE를 읽는 시험이다. 실패가 classes 22·landing/rules 2(이 PC 기존 실패)보다 늘면 안 된다
npx eslint "src/app/(app)/ai-report" src/components/shell src/components/common src/components/dashboard/briefing "src/app/(app)/notReadyPages.test.tsx" "src/app/(app)/tabFrame.test.tsx" "src/app/(app)/dashboard/page.test.tsx" src/app/titles.test.tsx --max-warnings=0
npx tsc --noEmit
grep -n "AI 리포트" docs/UI_GUIDE.md docs/ARCHITECTURE.md
grep -n "10개" docs/UI_GUIDE.md docs/ARCHITECTURE.md
# 두 grep의 결과를 답에 붙인다. 준비 중 수를 말하는 "10개"가 남아 있으면 안 된다
```
`npm run build`와 전체 `npm test`는 돌리지 않는다. 단계 끝에 메인이 돌린다.

## 금지사항
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 리뷰 PASS 뒤 메인이 한다.
- `phases/**/index.json`을 만들거나 고치지 마라. 이유: 승인 범위 밖이라 안전장치가 막는다. 스크립트로 우회하지도 마라.
- 수정 범위 밖 파일을 고치지 마라. `components/ai-report/**`, `FeatureIndex.tsx`, `NotReadyScreen.tsx`, `AiSection.tsx`도 그렇다. 고칠 일이 생기면 고치지 말고 답에 적어라.
- `specs/`·`.harness/*`·`CLAUDE.md`와 위 2개 밖의 `docs/*`를 고치지 마라. 이유: 승인이 풀린다. 명세와 다른 점을 찾으면 답에 적어라.
- 기존 시험을 지우거나 약하게 바꾸거나 `eslint-disable`을 쓰지 마라. 시험 파일도 Edit로만 고친다. `rm -rf`가 든 스크립트를 쓰지 마라.
- 보조 에이전트를 부르지 마라. 진짜 Claude를 부르지 않는다. 열쇠를 찾거나 만들지 않는다.

## 답에 적을 것
바꾼 파일, RED 때 새로 실패한 시험 이름(AC-714.1~4별), 마지막 시험 결과(실패 이름 전부), 두 grep 결과, 명세와 달라진 곳과 그 까닭, 시험으로 못 본 것, 마지막에 한 줄 요약.

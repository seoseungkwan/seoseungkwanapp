# Step 0: report-parts

> **TASK-8** 화면 부품 그리기 · **REQ-709·REQ-712**(그리는 부분), REQ-708·710·711의 그리는 부분은 AC ID를 시험 이름에 함께 적는다
> Phase 3 `ai-report-screen-3-screen` · Step 0. 차례로 돈다(이 step이 끝나야 Step 1 TASK-9).
> 작업 폴더: `C:\Users\tjtmd\Desktop\dasdas\seoseungkwanapp\.claude\worktrees\feat-ai-report-screen`

## 읽어야 할 파일
- `/CLAUDE.md`, `/specs/ai-report-screen/requirements.md`(REQ-703·708~712), `/specs/ai-report-screen/design.md`('구성 요소'의 브라우저, '화면 상태'), `/specs/ai-report-screen/tasks.md`(머리말, TASK-8)
- 시안 `docs/mockups/ai-report/index.html`은 **1.1MB다. 통째로 읽지 마라.** 7~9번 줄이 글꼴이라 줄마다 35만 자다. 아래처럼만 읽는다.
  - 모양: `sed -n 10,193p docs/mockups/ai-report/index.html | cut -c1-300`
  - 글자·구조: `sed -n 205,468p docs/mockups/ai-report/index.html | cut -c1-1200`의 `reportView`·`main` 함수
- `src/lib/ai/reportScreen.ts`(이미 있음, 글자는 여기서 가져온다), `src/types/aiReport.ts`, `src/components/ui/classes.ts`(`ds`), `src/components/common/ErrorCard.tsx`, `src/components/common/Icon.tsx`, `src/components/admin/AdminApplications.tsx`(확인 창, 131번 줄 근처와 키 처리), `src/components/claim/setup/ClaimEntry.tsx`(링크 모양 단추), `docs/UI_GUIDE.md`('단추' 기다림, '오류 카드·확인 창')

## 수정 범위 (승인된 Files, 이 6개뿐)
`src/components/ai-report/ReportBody.tsx`, `ReportBody.test.tsx`, `UsageAside.tsx`, `UsageAside.test.tsx`, `RedoDialog.tsx`, `RedoDialog.test.tsx`

## 부품의 모양 (TASK-9가 그대로 쓰니 이름을 바꾸지 마라)
props만 받아 그린다. 부르기·타이머·`useEffect`로 값을 읽는 일이 없다(RedoDialog의 키·초점 처리만 예외).

```ts
// ReportBody.tsx
export type ReportBodyState =
  | { kind: 'loading' }
  | { kind: 'readError' }
  | { kind: 'busyEmpty'; seconds: number }
  | { kind: 'noData' }
  | { kind: 'empty'; error: Exclude<AiErrorCode, 'E-AI-NO-DATA'> | null }
  | {
      kind: 'report'
      report: ShownReport
      stale: boolean
      error: AiErrorCode | null
      busySeconds: number | null // 숫자면 다시 분석 중
      copied: boolean
    }

export function ReportBody(props: {
  state: ReportBodyState
  month: string
  today: string // YYYY-MM-DD (partialNotice에 넘김)
  now: Date     // madeAtText에 넘김. 부품 안에서 new Date()를 부르지 않는다
  onAnalyze: () => void
  onRetryRead: () => void
  onCopy: () => void
}): JSX.Element

// UsageAside.tsx
export function UsageAside(props: { usage: AiUsageView | null }): JSX.Element // null이면 세 값 모두 "—"

// RedoDialog.tsx
export function RedoDialog(props: { month: string; onCancel: () => void; onConfirm: () => void }): JSX.Element
```

머리(제목·견주는 글·달 고르기·[다시 분석])와 두 칸 배치(`.p-head`·`.grid`·`.col-m`·`.col-s`의 칸 나누기)는 TASK-9의 `AiReportScreen`이 그린다. `UsageAside`는 `<aside aria-label="AI 사용량과 보내는 자료">`와 그 안쪽만 그리고, 왼쪽 선과 칸 위치는 `className` 없이 TASK-9가 감싸서 맡는다.

## 상태별로 그릴 것 (글자는 AC와 시안이 기준, 한 글자도 바꾸지 마라)
| `kind` | 그릴 것 | AC |
|---|---|---|
| `loading` | `role="status"`의 "`shortMonth(month)` 리포트를 읽고 있어요". 움직임 없음 | 708.4 |
| `readError` | `<ErrorCard code="E-AI-READ" />` + 보조 단추 [다시 읽기](`onRetryRead`) | 708.5 |
| `busyEmpty` | 제목 2단계 "`M월` 숫자를 읽고 있어요", `role="status"`의 "1분쯤 걸려요. 이 화면을 그대로 두고 기다려 주세요.", 큰 주 단추 "분석 중"(`aria-busy="true"`, `disabled` 아님, 누름 처리 없음), "지금까지 N초" | 710.2·710.3 |
| `noData` | 제목 2단계 "이 달 통계가 아직 없어요", 설명, `/stats`로 가는 링크(`next/link`, `ds.button.secondary`, `no-underline`, 오른쪽에 `arrow` 아이콘) "통계 탭으로", "오류 번호 E-AI-NO-DATA" | 710.5 |
| `empty` | (오류가 있으면 먼저 `ErrorCard`) 제목 2단계 "`M월` 리포트를 아직 만들지 않았어요", 설명(`compareMonths`가 든 시안 글), 큰 주 단추 [AI 분석](`onAnalyze`) | 710.1·710.6 |
| `report` | 안내 묶음(아래) + 리포트 본문 | 709.1~709.5·710.6·711.3·711.4 |

**안내 묶음의 차례**: ① `busySeconds`가 숫자면 accent 안내 "새 리포트를 만들고 있어요" ② `error`가 있으면 `ErrorCard` ③ `partialNotice`가 있으면 warning 안내 ④ `stale`이면 warning 안내 "이 리포트를 만든 뒤 숫자가 바뀌었어요" + "[다시 분석]을 누르면 새 숫자로 다시 써요."(**시안과 달리 달 이름이 없다. AC-709.5와 '시안에 없어 정한 것' 5번이 기준이다**).
- 다시 분석 안내는 `role="status"`로 두되 "지금까지 N초" 글자 span에 `aria-live="off"`를 준다(1초마다 화면 낭독기가 읽지 않게).
- 묶음이 비면 묶음 상자 자체를 그리지 않는다.

**리포트 본문**(시안 `reportView`): "`longMonth` 보고" + `partialNotice`의 칩(warning) + `madeAtText(createdAt, now)` · `modelName(model)` / [복사] 작은 보조 단추(`copied`면 `check` 아이콘 + "복사했어요", 아니면 `copy` 아이콘 + "복사", 폭이 흔들리지 않게 시안의 min-width) / 요약 `<h2>` / `<ol>` 카드 목록.
- `madeAtText`가 문장 전체를 돌려준다. "에 만들었어요"를 또 붙이지 마라. 시안의 ` · 모델` 형식은 지킨다.
- 카드 칩 표(AC-709.2): `up` "늘었어요" `ds.chip.positive` + `arrowDown` 아이콘 12에 `rotate-180` / `down` "줄었어요" `ds.chip.negative` + `arrowDown` 12 / `watch` "살펴볼 것" `ds.chip.warning` / `guess` "추정" `ds.chip.neutral`.
- 글자는 JSX 글자로만 그린다(`dangerouslySetInnerHTML` 금지).

**UsageAside**(시안 `<aside>`): `usageText(usage)` 값. 두 절 "이번 달 AI 사용량"(`<dl>` + "정확한 청구 금액은 Anthropic 콘솔에서 봐요.")과 "AI에게 보내는 것"(`shield` 아이콘 + 글, AC-712.2). 값이 `null`이어도 두 절은 그대로 있다.

**RedoDialog**: `AdminApplications`의 확인 창과 같은 틀(`fixed inset-0 z-30 … bg-ink/36 p-4`, `ds.layer`, `max-w-100`, `aria-labelledby`·`aria-describedby`, Tab 가두기). 글은 AC-711.1. 뒤 가림막을 직접 눌렀을 때만 `onCancel`(창 안을 누르면 닫히지 않는다). Esc → `onCancel`. **창이 열리면 초점은 창의 [다시 분석]**(AdminApplications는 취소에 주지만 여기는 AC-711.1이 기준이다). 단추: [취소] 보조, [다시 분석] 주 단추(시안 그대로. 위험 모양을 쓰지 않는다). 휴대폰 폭 처리는 UI_GUIDE '확인 창'을 따른다. 초점을 머리 단추로 돌려주는 일은 TASK-9가 한다.

## 모양 규칙
- 색은 토큰만(`bg-warning-soft`·`text-warning`·`bg-accent-soft`·`text-accent-strong`·`text-ink-2`·`text-muted`·`border-line`·`border-line-strong` 등). `[#…]`·`rgb(`·`white` 같은 값 금지. 시안의 크기는 `globals.css`의 `--text-*`(`caption`·`small`·`body`·`lead`·`subtitle`·`title`·`heading-m` …)에서 같은 것을 찾아 쓴다. 맞는 토큰이 없어 임의 값을 썼다면 답에 적어라.
- `animate-*`·`transition`·`@keyframes`를 이 폴더 글자로 쓰지 않는다(`ds`가 품은 단추 반응은 괜찮다). **주의: `src/components/ui/classes.test.ts`의 검사 폴더 목록에 `ai-report`가 없어 이 규칙을 그 시험이 안 봐 준다. 스스로 지켜라.** TASK-9의 `boundary.test.ts`가 잡는다.
- `console.`·`localStorage`·`sessionStorage`·`dangerouslySetInnerHTML`·`@/lib/supabase`·`@/app/api`·`server-only`·`@anthropic-ai/sdk`를 시험 아닌 파일에 **주석으로도** 쓰지 않는다(AC-715.1 검사가 글자로 본다).
- `ds`의 키를 새로 만들지 않는다(`classes.ts`는 수정 범위 밖이고 키 목록이 시험에 못 박혀 있다).

## 시험에 꼭 넣을 것
각 파일 맨 위 `// @vitest-environment jsdom`, `afterEach(cleanup)`. 지어낸 숫자는 시험 파일 안에만 둔다.
- `ReportBody.test.tsx`
  - AC-709.1: "2026년 10월 보고", 만든 때 + "Claude Opus 5.5", 요약이 `heading` level 2, `list`가 `OL`, 카드 순서가 저장 순서, 카드마다 칩·문장·근거.
  - AC-709.2: 꼬리표 넷의 글자·`ds.chip` 클래스·아이콘 유무(`svg` 있음·없음, `up`만 `rotate-180`).
  - AC-709.3: 요약·문장·근거에 `<b>x</b>`·`<script>alert(1)</script>`를 넣으면 글자 그대로이고 `b`·`script` 요소가 생기지 않는다.
  - AC-709.4: partial + 이번 달 → 칩 "진행 중"과 안내, partial + 지난 달 → 칩 "달 끝나기 전"과 안내, partial false → 없음.
  - AC-709.5(안내 부분): stale 참이면 두 글, 어디에도 달 이름이 없다(안내 상자 글자에 "월"이 없음). stale 거짓이면 없음.
  - AC-709.6(그리는 부분): `copied`에 따라 글자가 바뀌고 누르면 `onCopy`가 한 번.
  - AC-708.4·708.5·710.1·710.2·710.5·710.6: 상태표 그대로. `readError`·`empty`+오류·`report`+오류의 `role="alert"`에 무엇·어떻게·"오류 번호 <번호>". `noData`의 링크 `href`가 `/stats`이고 [AI 분석]이 없다. `busyEmpty`의 단추가 `aria-busy="true"`이고 `disabled`가 아니며 초 글자가 받은 값이다.
  - AC-711.3·711.4: `busySeconds`가 숫자면 옛 리포트와 안내가 함께, 오류면 오류 상자가 리포트 위(문서 순서 비교), `E-AI-NO-DATA`여도 빈 화면이 아니다.
  - 차례: 다시 분석 안내 → 오류 → 진행 중 → 숫자 바뀜이 함께 있으면 그 순서다.
- `UsageAside.test.tsx`: AC-712.1(값·안내 글), AC-712.2, AC-708.4·708.5(`null`이면 "—" 셋이고 두 절이 그대로), `aside` 역할(`complementary`)과 이름.
- `RedoDialog.test.tsx`: AC-711.1(`dialog`·`aria-modal`·제목·본문·두 단추·열리면 초점이 [다시 분석]·`aria-labelledby`가 제목을 가리킴). AC-711.2(취소·Esc·가림막에서 `onCancel`만, 창 안 글자를 눌러도 안 불림, `onConfirm` 안 불림, 언마운트 뒤 Esc는 부르지 않음). Tab·Shift+Tab이 창 밖으로 나가지 않는다. `onConfirm`은 [다시 분석]에서 한 번.

## TDD 순서
1. 시험 3개를 먼저 쓴다. 이름에 AC ID를 넣는다.
2. `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-8 --expect red`로 RED를 기록한다. 그 전에는 부품 파일을 만들지 않는다.
3. 구현 뒤 `... tdd-run TASK-8 --expect green`. 정리한 뒤 다시 green을 본다.

## 이 PC(윈도우)에서
- 파일은 Edit·Write 도구로만 고친다. 스크립트·`sed`로 고치지 않는다(읽기만 `sed`). `src`는 LF다.

## Acceptance Criteria
```bash
npx vitest run src/components/ai-report/ReportBody.test.tsx src/components/ai-report/UsageAside.test.tsx src/components/ai-report/RedoDialog.test.tsx
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-8 --expect green
npx eslint src/components/ai-report --max-warnings=0
npx tsc --noEmit
```
`npm run build`와 전체 `npm test`는 돌리지 않는다. 단계 끝에 메인이 돌린다.

## 금지사항
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 리뷰 PASS 뒤 메인이 한다.
- `phases/**/index.json`을 만들거나 고치지 마라. 이유: 승인 범위 밖이라 안전장치가 막는다. 스크립트로 우회하지도 마라.
- 수정 범위 밖 파일을 고치지 마라. `reportScreen.ts`·`reportClient.ts`·`ErrorCard.tsx`·`Icon.tsx`·`classes.ts`·`errors.ts`도 그렇다. 고칠 일이 생기면 고치지 말고 답에 적어라.
- `specs/`·`.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 승인이 풀린다. 명세와 다른 점을 찾으면 답에 적어라.
- 기존 시험을 지우거나 약하게 바꾸거나 `eslint-disable`을 쓰지 마라. `rm -rf`가 든 스크립트를 쓰지 마라.

## 답에 적을 것
만든 파일, 시험 수, RED·GREEN 결과, 임의 값을 쓴 곳, 명세·시안과 달라진 곳과 그 까닭, 마지막에 한 줄 요약.

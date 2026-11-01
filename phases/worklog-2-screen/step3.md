# Step 3: toolbar

> **TASK-9** 날짜 줄·저장 상태 · **REQ-009** · AC-009.1 ~ AC-009.4
> Phase 2 `worklog-2-screen` · Step 3 — `specs/worklog/tasks.md`
> 명세 `specs/worklog/`는 승인됐다. 이 step은 TASK-9 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/worklog/requirements.md`의 REQ-009에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-009.1**: [전날]·날짜 고르기(최대 = 오늘)·[다음 날], 오늘이 아닐 때만 [오늘로]. 오늘이면 [다음 날] 못 누름. 미래·날짜 아닌 고르기 무시
- **AC-009.2**: 상태 글 — "불러오는 중이에요" · "적으면 바로 저장돼요" · "저장하는 중이에요" · "저장했어요 · 14:05" · "인터넷이 끊겼어요. 다시 연결되면 저장해요", `role="status"`
- **AC-009.3**: 오류 카드 넷 — `E-WORKLOG-SAVE-FAILED` + [다시 저장] · `E-WORKLOG-NOTE-PRIVATE` · `E-WORKLOG-MEMO-FAILED` · `E-WORKLOG-LOAD-FAILED` + [다시 불러오기]. 문구는 `lib/errors.ts`
- **AC-009.4**: [인쇄](보조 단추), [저장] 없음, 폰 44px 이상

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·019와 끝의 업무일지 ADR(Phase 1 Step 0이 더함)
- `/specs/worklog/requirements.md` — REQ-009
- `/specs/worklog/design.md` — 11-2절(WorklogToolbar·오류 문구 표), 3절(목업과 다른 점)
- `/specs/worklog/tasks.md` — 이 TASK의 수정 범위·메모
- 승인된 시안 `/docs/mockups/worklog/index.html` (화면 step이면 꼭)
- `/docs/UI_GUIDE.md` — '업무일지 양식(엑셀 예외)'(Phase 1 Step 0), '공통 모양'(`ds`)·'오류 카드'·'휴대폰'·'문구'(말끝 "~요")
- `/src/components/ui/classes.ts` — `ds.button.secondary`·`ds.input`
- `/src/components/common/ErrorCard.tsx`·`Icon.tsx`
- `/src/lib/errors.ts`·`/src/types/errors.ts`·`/src/lib/errors.test.ts` — 번호 더하는 법(AC-003.4 "모든 번호" 시험)
- `/src/lib/worklog/days.ts` — `previousDay`·`nextDay`·`clampToToday`·`savedTimeText`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-9)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/components/worklog/WorklogToolbar.tsx`
  - `src/components/worklog/WorklogToolbar.test.tsx`
  - `src/lib/errors.ts`
  - `src/types/errors.ts`
  - `src/lib/errors.test.ts`
- Tests:
  - `src/components/worklog/WorklogToolbar.test.tsx`
  - `src/lib/errors.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- 오류 문구는 `lib/errors.ts` 한 곳(CLAUDE.md). 카드는 `ErrorCard`만 쓰고 원래 오류 내용을 그리지 않는다
- `lib/errors.ts`·`types/errors.ts`는 사전점검 갈래와 겹친다: **파일 끝에 더하기만** 한다(주석 한 줄 `// 업무일지(specs/worklog)` + 넷)
- 문구 말끝은 "~요"(UI_GUIDE '문구'). design.md 11-2절 표 글자 그대로
- 날짜 줄 밖은 앱 규칙(`ds`·토큰·Pretendard)이다. 엑셀 서식을 쓰지 않는다

## 작업

```tsx
export type ToolbarStatus = 'loading' | 'empty' | 'saving' | 'saved' | 'offline' | 'failed' | 'blocked' | 'memo-failed' | 'load-failed'
export function WorklogToolbar(props: {
  ymd: string; today: string; status: ToolbarStatus; savedAt: Date | null
  onDate(ymd: string): void; onRetrySave(): void; onReload(): void; onPrint(): void
}): JSX.Element
```
- PC 한 줄(왼쪽 날짜 묶음 / 오른쪽 상태 글 · [인쇄]), 768px 미만 두 줄(design.md 11-2절). 폭은 양식과 같은 737px 가운데(`max-w`는 토큰·간격 단계로. 대괄호 값 금지 → 양식과 같은 폭 감싸개는 TASK-10이 정한다. 여기서는 `w-full`)
- [전날]·[다음 날]은 화살표 아이콘(`Icon chev` 돌림) + 글자, `aria-label`은 "전날"·"다음 날"
- 날짜 칸 `<input type="date" aria-label="날짜 고르기" max={today} value={ymd}>`. 바뀌면 `clampToToday`가 같은 날이면 `onDate`, 다르면(미래·빈 값) 무시
- 오류 카드: 상태가 실패 넷이면 줄 아래 전체 폭에 `ErrorCard` + 그 밑에 단추(`ds.button.secondary`)
- `errors.ts`·`types/errors.ts` 끝에 `E-WORKLOG-SAVE-FAILED`·`E-WORKLOG-LOAD-FAILED`·`E-WORKLOG-MEMO-FAILED`·`E-WORKLOG-NOTE-PRIVATE`. `errors.test.ts`에 `AC-009.3` 시험 하나(넷의 문구가 design.md 표 그대로, "~요"로 끝남)
- 시험: 각 상태 글, [오늘로] 있고 없음, [다음 날] `disabled`, 날짜 칸 `max`, 미래 고르기 무시, 실패 넷의 카드 번호와 단추, [저장] 단추 없음(`queryByRole('button', { name: /저장$/ })`는 [다시 저장]만), 단추·입력의 `ds` 클래스(44px `h-11`)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-002.2: 수납액은 현금·카드·계좌·지역화폐만 더한다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-9 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-9 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/components/worklog/WorklogToolbar.test.tsx src/lib/errors.test.ts   # AC-009.1~AC-009.4
npx vitest run src/components/ui/classes.test.ts   # 앱 화면 클래스 규칙
python3 ~/.claude/harness/bin/tdd-run TASK-9 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status worklog`에서 AC-009.1 ~ AC-009.4가 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (환자 개인정보·업무사항은 서버로 가지 않는다, RLS, 비밀값)
3. 결과에 따라 `phases/worklog-2-screen/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 실제 Supabase에 SQL 붙여 넣기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 기존 오류 번호의 문구·순서를 바꾸지 마라. 이유: 다른 화면과 사전점검 갈래가 그대로 쓴다
- [저장] 단추를 만들지 마라(숨김 포함). 이유: 사용자 결정 — 자동 저장만
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 실제 Supabase에 SQL을 실행하거나 붙여 넣지 마라(대시보드·CLI·REST 모두). 이유: DB 바꾸기는 사용자 OK가 필요하다(design.md 8절)
- 시험·고정 자료에 실제 의원 숫자(엑셀 10월 값)·환자 이름·차트번호·전화번호를 쓰지 마라. 이유: 가짜 자료만 쓴다(CLAUDE.md). 둥근 가짜 숫자(예: 100000)와 "가상" 글자를 쓴다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 Phase 1 Step 0과 사용자 승인으로만 바뀐다

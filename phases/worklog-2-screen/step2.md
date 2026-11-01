# Step 2: sheet

> **TASK-8** 엑셀 양식 칸 · **REQ-008** · AC-008.1 ~ AC-008.8
> Phase 2 `worklog-2-screen` · Step 2 — `specs/worklog/tasks.md`
> 명세 `specs/worklog/`는 승인됐다. 이 step은 TASK-8 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/worklog/requirements.md`의 REQ-008에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-008.1**: 엑셀 A1:I23과 같은 표(9칸 너비, 23줄, 합친 칸 46개 자리, 칸 글자 그대로, 지출 넷째 줄 "free")
- **AC-008.2**: 연보라(날짜·결재 띠, 환자 합계 이름·값, 수납액 이름·값, 맨 아래 합계 값)·회색(총진료비·조합청구액·총지불액 줄)·바깥 굵은 선
- **AC-008.3**: 숫자 칸 14(`inputMode="numeric"`)·비고 5(100자)·업무사항(2,000자), 업무사항·비고 `spellCheck={false}`, 시안과 같은 `aria-label`. 결재·외래 빈칸·자동 칸은 입력 아님. [저장]·날짜 시트 탭 없음
- **AC-008.4**: 날짜 칸 "2026/10/28 수", 자동 칸 넷은 받은 값으로 계산
- **AC-008.5**: 숫자 칸에 치면 읽은 값을 알림, 초점 나가면 엑셀 모양 글자
- **AC-008.6**: 보기만 → 모든 칸 읽기 전용, 업무사항 칸에 안내 글
- **AC-008.7**: 빈 업무사항 칸 흐린 안내 "이 PC에만 저장돼요"
- **AC-008.8**: 막힌 비고 칸 `aria-invalid`

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·019와 끝의 업무일지 ADR(Phase 1 Step 0이 더함)
- `/specs/worklog/requirements.md` — REQ-008
- `/specs/worklog/design.md` — 2절(합친 칸 46개 표·줄 높이), 3절(목업과 다른 점), 5절(칸 표·`aria-label`), 11-1절(WorklogSheet props)
- `/specs/worklog/tasks.md` — 이 TASK의 수정 범위·메모
- 승인된 시안 `/docs/mockups/worklog/index.html` (화면 step이면 꼭)
- `/docs/UI_GUIDE.md` — '업무일지 양식(엑셀 예외)'(Phase 1 Step 0), '공통 모양'(`ds`)·'오류 카드'·'휴대폰'·'문구'(말끝 "~요")
- 시안 `/docs/mockups/worklog/index.html` — `<table class="sheet">` 전체(칸·글자·`&nbsp;` 간격·`colgroup`)와 입력 처리 스크립트(`shown`·`input` 처리)
- `/src/components/worklog/sheet.module.css` (Step 1)
- `/src/lib/worklog/calc.ts`·`days.ts` (Phase 1)
- `/src/components/landing/middle.test.tsx` 180~190줄 — CSS Module 클래스 이름을 시험에서 견주는 법

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-8)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/components/worklog/WorklogSheet.tsx`
  - `src/components/worklog/WorklogSheet.test.tsx`
  - `src/components/worklog/sheet.module.css`
- Tests:
  - `src/components/worklog/WorklogSheet.test.tsx`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- 화면은 승인된 시안대로만 만든다(CLAUDE.md). 칸·글자·합친 칸은 시안·엑셀 그대로이고, 다른 점은 design.md 3절 표뿐이다
- 그리기만 한다: 값은 props, 바뀜은 콜백. 저장·supabase·localStorage를 부르지 않는다
- 업무사항 칸 값은 `memo` prop으로만 받고 `onMemo`로만 알린다(서버 값 `day`와 섞지 않는다)
- 양식 안에 `ds` 단추·칩·Pretendard 글자 모양을 넣지 않는다(엑셀 모양만). 클래스는 `sheet.module.css`의 이름만

## 작업

```tsx
'use client'
export function WorklogSheet(props: {
  ymd: string; day: WorklogDay; memo: string; readOnly: boolean
  memoNotice?: string; invalidNote?: WorklogNoteKey | null
  onNumber(key: WorklogNumberKey, value: number | null): void
  onNote(key: WorklogNoteKey, value: string): void
  onMemo(value: string): void
}): JSX.Element
```
- `<div className={s.paper}><table className={s.sheet} aria-label="업무일지">…</table></div>`. 23줄 `<tr>`(17·18행은 시안처럼 둘째 줄이 빈 `<tr className={s.r20} />`)
- 숫자 칸: 칸 안 작은 부품(`NumberCell`)이 초점 여부만 들고 있다. 보이는 글자 = 초점이면 `wonInputText(v, true)`, 아니면 `wonInputText(v, false)`(인원 입력 칸은 초점과 상관없이 `countText`: 값이 없거나 0이면 빈 칸). `onChange`에서 `parseWon`/`parseCount` → `onNumber`. 시안의 "치는 동안 쉼표 다시 넣기"도 같다
- 환자 합계 칸(D6)은 입력 칸이 아니다. `visitsText(worklogTotals(day).visits)`로 그린다(0이면 "0"). `countText`를 쓰면 0이 빈 칸이 된다
- 비고: `maxLength={NOTE_MAX}`, 업무사항 `textarea maxLength={MEMO_MAX} placeholder="이 PC에만 저장돼요"`. 업무사항·비고는 `spellCheck={false}`(AC-008.3, 브라우저 맞춤법 검사가 글을 밖으로 보낼 수 있다)
- `readOnly`: 모든 `input`·`textarea`에 `readOnly`. `memoNotice`가 있으면 textarea 대신 그 글을 칸에 보인다(흐린 글)
- 시험(jsdom + Testing Library): 줄 23개, 각 줄의 칸 수와 `colSpan`·`rowSpan`을 design.md 2절 표로 만든 기대 목록과 견준다(합친 칸 46), 칸 글자, 연보라·회색 클래스 자리(`s.lav`·`s.gray`), 입력 칸 20개와 이름, 자동 칸 글자(가짜 값 예: 현금 100,000 + 카드 200,000 + 총진료비 900,000 → 수납액 "300,000원"), 인원 0 → 빈 칸, 환자 합계 0 → "0", 초점 들어감·나감 글자, `readOnly`·`memoNotice`, `aria-invalid`, 업무사항·비고의 `spellcheck="false"`, `role="button"`·"저장"·시트 탭 글자가 없음

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-002.2: 수납액은 현금·카드·계좌·지역화폐만 더한다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-8 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-8 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/components/worklog/WorklogSheet.test.tsx   # AC-008.1~AC-008.8
npx vitest run src/components/ui/classes.test.ts src/components/worklog/sheet.style.test.ts   # 예외 한 파일 import 그대로
python3 ~/.claude/harness/bin/tdd-run TASK-8 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status worklog`에서 AC-008.1 ~ AC-008.8가 이 TASK의 시험과 이어져 보여야 한다

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

- 날짜 시트 탭 줄·달 고르기·[저장] 단추를 양식 아래·위에 만들지 마라. 이유: 사용자가 뺐다(2026-11-01)
- 합계 칸을 입력 칸으로 만들지 마라. 이유: 엑셀 계산식 칸이다(AC-008.3)
- `sheet.module.css`의 인쇄 부분을 이 step에서 쓰지 마라. 이유: TASK-11 범위다(화면 규칙의 클래스만 더할 수 있다)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 실제 Supabase에 SQL을 실행하거나 붙여 넣지 마라(대시보드·CLI·REST 모두). 이유: DB 바꾸기는 사용자 OK가 필요하다(design.md 8절)
- 시험·고정 자료에 실제 의원 숫자(엑셀 10월 값)·환자 이름·차트번호·전화번호를 쓰지 마라. 이유: 가짜 자료만 쓴다(CLAUDE.md). 둥근 가짜 숫자(예: 100000)와 "가상" 글자를 쓴다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 Phase 1 Step 0과 사용자 승인으로만 바뀐다

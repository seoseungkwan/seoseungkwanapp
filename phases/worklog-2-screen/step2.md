# Step 2: sheet

> **TASK-8** 엑셀 양식 칸 · **REQ-008** · AC-008.1 ~ AC-008.11
> Phase 2 `worklog-2-screen` · Step 2 — `specs/worklog/tasks.md`
> 명세 `specs/worklog/`는 승인됐다. 이 step은 TASK-8 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 시안 승인됨

사용자가 2026-11-01 시안을 승인했다("좋아", claude.ai artifact `Q2qMenScT5hojDRoqsLcjw`, 파일 `docs/mockups/worklog/text-cells.html`). 기다리지 않고 시작한다.
- 담긴 상태: 숫자 칸의 글자('12,000 별도'·'2건 12,000'·'별도 보고'), 항목 이름 고치기, "합계에서 빠졌어요" 표시, 빨간 막힌 칸, 흐린 안내 글 "환자 이름·차트번호는 적지 않아요"
- 사용자 지시: **글씨는 원본과 똑같이**. 양식 칸의 글꼴·굵기·크기는 시안 v2(`docs/mockups/worklog/index.html`)와 엑셀 그대로다(굴림 13pt 굵게, 제목 맑은 고딕 32pt)
- 모양은 design.md 3절 '시안 승인됨' 줄을 따른다

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/worklog/requirements.md`의 REQ-008에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-008.1**: 엑셀 A1:I23과 같은 표(9칸 너비, 23줄, 합친 칸 46개 자리, 칸 글자 그대로, 지출 넷째 줄 "free"). 새 칸 없음, 안 고친 항목 이름은 기본 글자
- **AC-008.2**: 연보라(날짜·결재 띠, 환자 합계 이름·값, 수납액 이름·값, 맨 아래 합계 값)·회색(총진료비·조합청구액·총지불액 줄)·바깥 굵은 선
- **AC-008.3**: 숫자 칸 14(`inputMode="numeric"` 안 씀, 50자)·비고 5(100자)·업무사항(2,000자)·항목 이름 12(20자), 입력 칸 모두 `spellCheck={false}`, 숫자·비고·업무사항은 시안과 같은 `aria-label`(이름을 고쳐도 그대로). 결재·외래 빈칸·자동 칸·수납액·총 지 불 액 이름은 입력 아님. [저장]·날짜 시트 탭 없음
- **AC-008.4**: 날짜 칸 "2026/10/28 수", 자동 칸 넷은 받은 값을 읽어 계산
- **AC-008.5**: 숫자 칸에 치면 친 글자를 그대로 알림, 치는 동안 칸 글자를 바꾸지 않음, 초점 나가면 화면 글자
- **AC-008.6**: 보기만 → 항목 이름 포함 모든 칸 읽기 전용, 값(업무사항 포함)은 보임
- **AC-008.7**: 고칠 수 있는 빈 업무사항 칸 흐린 안내 "환자 이름·차트번호는 적지 않아요"
- **AC-008.8**: 막힌 칸(숫자·비고·업무사항·항목 이름) `aria-invalid` + 빨강
- **AC-008.9**: 항목 이름 고치면 친 글자 알림, 비우고 나가면 기본 이름, 그날 값이 있으면 그 이름
- **AC-008.10**: 합계 제외 칸에 "합계에서 빠졌어요"(`aria-describedby`로 이음). 좁은 신환·재진 칸은 눈에 "빠졌어요"만 보이고 온전한 글자는 설명·마우스 올리기에 남는다. 총진료비·조합청구액·미수발생·미수입금·업무사항·비고에는 없음
- **AC-008.11**: 초점 있는 숫자 칸·항목 이름 칸에 아직 안 침 → 값이 바뀌면 초점 글자도 새 값으로. 친 뒤에는 친 글자 그대로

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
- `/src/lib/worklog/calc.ts`·`cellText.ts`·`days.ts` (Phase 1)
- `docs/mockups/worklog/text-cells.html` (사용자 OK 받은 시안)
- `/src/components/landing/middle.test.tsx` 180~190줄 — CSS Module 클래스 이름을 시험에서 견주는 법

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-8)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/components/worklog/WorklogSheet.tsx`
  - `src/components/worklog/WorklogSheet.test.tsx`
  - `src/components/worklog/sheet.module.css`
  - `docs/mockups/worklog/text-cells.html` (시안, 메인 창이 만든다)
- Tests:
  - `src/components/worklog/WorklogSheet.test.tsx`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- 화면은 승인된 시안대로만 만든다(CLAUDE.md). 칸·글자·합친 칸은 시안·엑셀 그대로이고, 다른 점은 design.md 3절 표뿐이다. 새 모양은 맨 앞에 적은 승인 시안 OK 뒤에만 만든다
- 그리기만 한다: 값은 props, 바뀜은 콜백. 저장·supabase·브라우저 저장소를 부르지 않는다
- 모든 입력 칸은 `day[key]`로 받고 `onCell(key, 친 글자)`로만 알린다. 읽기·합계·표시는 `cellText`·`calc`를 부른다(이 파일에 규칙을 다시 쓰지 않는다)
- 양식 안에 `ds` 단추·칩·Pretendard 글자 모양을 넣지 않는다(엑셀 모양만). 클래스는 `sheet.module.css`의 이름만

## 작업

```tsx
'use client'
export function WorklogSheet(props: {
  ymd: string; day: WorklogDay; readOnly: boolean
  blockedCells: readonly WorklogCellKey[]
  onCell(key: WorklogCellKey, value: string): void
  onFocusCell(key: WorklogCellKey | null): void
}): JSX.Element
```
- `<div className={s.paper}><table className={s.sheet} aria-label="업무일지">…</table></div>`. 23줄 `<tr>`(17·18행은 시안처럼 둘째 줄이 빈 `<tr className={s.r20} />`)
- 숫자 칸: 칸 안 작은 부품(`NumberCell`)이 초점 중 글자만 들고 있다. 초점이 들어오면 `cellShownText(kind, 값, true)`로 시작하고, 치면 친 글자 그대로 보이며 바뀔 때마다 `onCell(key, 친 글자)`. 초점이 나가면 `cellShownText(kind, 값, false)`. 치지 않고 초점만 오가면 `onCell`을 부르지 않는다. **치기 전이면 값 prop이 바뀔 때 초점 글자도 새 값으로 맞춘다**(읽는 동안 잠긴 칸을 눌러 두면 초점 글자가 빈 채 남아, 풀린 뒤 치면 안 보이던 서버 값을 덮는다). 친 뒤에는 친 글자를 그대로 둔다. `maxLength={CELL_MAX}`, `inputMode`를 두지 않는다. 시안의 "치는 동안 쉼표 다시 넣기"는 하지 않는다(design.md 3절)
- 항목 이름 칸: 금액 칸 12개마다 `WORKLOG_NAME_OF`의 칸. 값이 비었으면 `WORKLOG_DEFAULT_NAMES`를 보인다. `maxLength={NAME_MAX}`, `aria-label`은 `WORKLOG_LABELS`(예: "현금수납 항목 이름"). 칸 모양은 시안의 이름 칸과 같다(가운데 맞춤·굵게, 테두리 없는 입력). 초점 글자를 따로 들므로 치기 전 값이 바뀌면 숫자 칸처럼 맞춘다
- 환자 합계 칸(D6)은 입력 칸이 아니다. `visitsText(worklogTotals(readDayNumbers(day)).visits)`로 그린다(0이면 "0"). `countText`를 쓰면 0이 빈 칸이 된다
- 비고: `maxLength={NOTE_MAX}`, 업무사항 `textarea maxLength={MEMO_MAX} placeholder="환자 이름·차트번호는 적지 않아요"`(고칠 수 있을 때만). 입력 칸은 모두 `spellCheck={false}`(AC-008.3, 브라우저 맞춤법 검사가 글을 밖으로 보낼 수 있다)
- `readOnly`: 모든 `input`·`textarea`에 `readOnly`
- `blockedCells`의 칸: `aria-invalid` + `s.blocked`(`--negative` 테두리·`--negative-soft` 바탕)
- `excludedSumKeys(day)`의 칸: 칸 안 `<span id=… className={s.flag}><span className={s.flagHead}>합계에서</span> 빠졌어요</span>` + 입력 `aria-describedby`(읽어 주기에는 온전한 글자). 신환·재진 칸은 `s.flagHead`를 눈에서만 숨기고 `title`로 온전한 글자를 둔다(시안 `text-cells.html`). 칸 높이를 늘리지 않게 겹쳐 둔다(시안대로)
- `onFocusCell`: 입력 칸 초점이 들어오고 나갈 때 알린다
- 시험(jsdom + Testing Library): 줄 23개, 각 줄의 칸 수와 `colSpan`·`rowSpan`을 design.md 2절 표로 만든 기대 목록과 견준다(합친 칸 46), 칸 글자, 연보라·회색 클래스 자리(`s.lav`·`s.gray`), 입력 칸 32개와 이름, 자동 칸 글자(가짜 값 예: 현금 '100,000' + 카드 '가상 200,000 별도' + 총진료비 '900,000' → 수납액 "300,000원"), 인원 0 → 빈 칸, 환자 합계 0 → "0", 초점 들어감·나감 글자, 치는 동안 글자 안 바뀜, **`readOnly` 칸에 초점을 둔 채 값·`readOnly`가 바뀜 → 칸에 새 값이 보이고, 그 뒤 치면 새 값에서 이어짐(숫자 칸·항목 이름 칸 각각), 친 뒤 값이 바뀌어도 친 글자 그대로**, 숫자 칸에 inputmode numeric 없음, 항목 이름(기본·고친 이름·비우고 나감·`onCell`), `readOnly`, `aria-invalid`(칸 종류마다), "합계에서 빠졌어요"(열 칸 각각 있음, 넷 없음), 흐린 안내 글자, 입력 칸의 `spellcheck="false"`, `role="button"`·"저장"·시트 탭 글자가 없음

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-002.2: 수납액은 현금·카드·계좌·지역화폐만 더한다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-8 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-8 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/components/worklog/WorklogSheet.test.tsx   # AC-008.1~AC-008.11
npx vitest run src/components/ui/classes.test.ts src/components/worklog/sheet.style.test.ts   # 예외 한 파일 import 그대로
python3 ~/.claude/harness/bin/tdd-run TASK-8 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status worklog`에서 AC-008.1 ~ AC-008.11이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (환자 개인정보는 서버로 가지 않는다 — 업무사항은 사용자 결정으로 서버에 두되 AI로 보내지 않고, 막는 모양은 저장하지 않는다. RLS, 비밀값)
3. 결과에 따라 `phases/worklog-2-screen/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 실제 Supabase에 SQL 붙여 넣기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 날짜 시트 탭 줄·달 고르기·[저장] 단추를 양식 아래·위에 만들지 마라. 이유: 사용자가 뺐다(2026-11-01)
- 합계 칸을 입력 칸으로 만들지 마라. 이유: 엑셀 계산식 칸이다(AC-008.3)
- 양식에 새 칸·새 줄을 더하지 마라. 이유: 사용자 결정 3(양식은 엑셀 그대로)
- `sheet.module.css`의 인쇄 부분을 이 step에서 쓰지 마라. 이유: TASK-11 범위다(화면 규칙의 클래스만 더할 수 있다)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 실제 Supabase에 SQL을 실행하거나 붙여 넣지 마라(대시보드·CLI·REST 모두). 이유: DB 바꾸기는 사용자 OK가 필요하다(design.md 8절)
- 시험·고정 자료에 실제 의원 숫자(엑셀 10월 값)·환자 이름·차트번호·전화번호를 쓰지 마라. 이유: 가짜 자료만 쓴다(CLAUDE.md). 둥근 가짜 숫자(예: 100000)와 "가상" 글자를 쓴다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 Phase 1 Step 0과 사용자 승인으로만 바뀐다

# Step 1: sheet-style

> **TASK-7** 엑셀 서식 예외 규칙 · **REQ-007** · AC-007.1 ~ AC-007.4
> Phase 2 `worklog-2-screen` · Step 1 — `specs/worklog/tasks.md`
> 명세 `specs/worklog/`는 승인됐다. 이 step은 TASK-7 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/worklog/requirements.md`의 REQ-007에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-007.1**: `globals.css` `:root`에 `--xl-ink: #000000`·`--xl-lav: #CCCCFF`·`--xl-gray: #D9D9D9`·`--xl-focus: #107C41` 한 번씩, 토큰 시험 표에 있음, `@theme inline`은 안 가리킴
- **AC-007.2**: `font-weight: 700`은 `src/components/worklog/sheet.module.css`에서만 통과, 다른 파일은 그대로 잡힘
- **AC-007.3**: `src/components/worklog`가 앱 화면 검사 폴더에 듦. 앱 화면 폴더의 `*.module.css`는 `sheet.module.css` 하나, 불러오는 파일은 `WorklogSheet.tsx` 하나뿐
- **AC-007.4**: `sheet.module.css`에 16진수·`rgb(`·`url(`·`@font-face` 없음, 색은 `var(--xl-*)`·`var(--surface)`·`var(--muted)`만, 글꼴은 시스템 이름만

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·019와 끝의 업무일지 ADR(Phase 1 Step 0이 더함)
- `/specs/worklog/requirements.md` — REQ-007
- `/specs/worklog/design.md` — 12절(엑셀 서식 예외), 2절(칸 크기), 3절(목업과 다른 점)
- `/specs/worklog/tasks.md` — 이 TASK의 수정 범위·메모
- 승인된 시안 `/docs/mockups/worklog/index.html` (화면 step이면 꼭)
- `/docs/UI_GUIDE.md` — '업무일지 양식(엑셀 예외)'(Phase 1 Step 0), '공통 모양'(`ds`)·'오류 카드'·'휴대폰'·'문구'(말끝 "~요")
- `/src/app/globals.css` — `:root` 토큰 블록
- `/src/app/theme.test.ts` — AC-202.1(토큰 표 `TOKENS`·`LANDING_ALIASES`)·AC-202.2(`@theme inline`)·AC-202.3(16진수 자리)
- `/src/app/fonts.test.ts` — AC-203.3 `badWeightsIn`
- `/src/components/ui/classes.test.ts` — `APP_DIRS`·AC-013.2(CSS Module 금지)·AC-204.6(클래스 규칙)
- 시안 `/docs/mockups/worklog/index.html` — `.paper`·`.sheet` CSS(화면 부분)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-7)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/app/globals.css`
  - `src/app/theme.test.ts`
  - `src/app/fonts.test.ts`
  - `src/components/ui/classes.test.ts`
  - `src/components/worklog/sheet.module.css`
  - `src/components/worklog/sheet.style.test.ts`
- Tests:
  - `src/app/theme.test.ts`
  - `src/app/fonts.test.ts`
  - `src/components/ui/classes.test.ts`
  - `src/components/worklog/sheet.style.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- 규칙은 **예외 한 파일**만 연다. 예외 목록은 상수 하나(파일 경로)로 두고, 같은 규칙이 다른 파일에서 그대로 잡히는지 시험으로 함께 본다(불러오기 줄 `LoadBar.tsx` 예외와 같은 방식)
- 16진수 색은 `globals.css` `:root` 토큰 블록에만 둔다(AC-202.3). `sheet.module.css`는 `var()`만
- 시안의 구글 글꼴(`Nanum Gothic`·`IBM Plex`)·`<link>`를 옮기지 않는다(CSP·UI_GUIDE)
- 기존 시험의 다른 기대값을 바꾸지 않는다. 더하기만 한다(다른 갈래와 겹치는 파일, design.md 18절)

## 작업

### 1. 먼저 시험(RED)
- `theme.test.ts`: `WORKLOG_SHEET_TOKENS = { '--xl-ink': '#000000', '--xl-lav': '#CCCCFF', '--xl-gray': '#D9D9D9', '--xl-focus': '#107C41' }`를 AC-202.1 기대(`{ ...TOKENS, ...LANDING_ALIASES }`)에 더하고, AC-202.2(`@theme inline`) 쪽은 이 넷을 가리키지 않는다는 시험 하나(`AC-007.1`)
- `fonts.test.ts`: 굵기 예외 상수 `SHEET_WEIGHT_EXCEPTION = 'src/components/worklog/sheet.module.css'`. 그 파일의 700만 빼고, 같은 글자가 다른 경로에 있으면 잡히는지 보는 시험(`AC-007.2`). 300·900은 그 파일에서도 잡힌다
- `classes.test.ts`: `APP_DIRS`에 `'src/components/worklog', // worklog TASK-7 (AC-007.3)`. AC-013.2 두 시험에 예외 상수(`WORKLOG_SHEET_CSS`·`WORKLOG_SHEET_IMPORTER = 'src/components/worklog/WorklogSheet.tsx'`): 앱 화면 폴더의 module.css 목록 = `[WORKLOG_SHEET_CSS]`, module.css를 불러오는 소스 ⊆ `[WORKLOG_SHEET_IMPORTER]`
- `sheet.style.test.ts`(새, node): AC-007.4 — 파일 글자 검사(주석 뺀 CSS): 16진수·`rgb(`·`hsl(`·`url(`·`@font-face`·`@import` 없음, `var(--xl-lav)`·`var(--xl-gray)`·`var(--xl-ink)` 있음, `font-family` 값의 글꼴 이름 ⊆ `{Gulim, 굴림, Malgun Gothic, 맑은 고딕, Apple SD Gothic Neo, sans-serif}`

### 2. 구현(GREEN)
- `globals.css` `:root` **끝**에 넷(주석 한 줄: "업무일지 양식 칸 전용 — UI_GUIDE '업무일지 양식'")
- `sheet.module.css`: 시안 `.paper`·`.sheet`·`.sheet td`… 화면 규칙과 `@container`(폰 크기 변수) 부분을 옮긴다. 클래스 이름: `paper`·`sheet`·`title`·`lav`·`gray`·`date`·`small`·`memo`·`in`·`L`·`R`·`B`·`r1`·`r2`·`r3`·`r28`·`r20`. 색 `--xl-paper` 대신 `var(--surface)`, 흐린 안내 글 `#8A8A8A` 대신 `var(--muted)`, 초점 `#107C41` 대신 `var(--xl-focus)`. 폰 크기는 `@container` 대신 `@media (max-width: 767px)`(앱 틀에는 컨테이너가 없다). 시안 `.sheets`(날짜 시트 탭 줄)·`.month`·`.btn`·`.pv`(미리보기)·`.toast`는 옮기지 않는다. 인쇄(`@media print`)는 TASK-11

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-002.2: 수납액은 현금·카드·계좌·지역화폐만 더한다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-7 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-7 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/app/theme.test.ts src/app/fonts.test.ts src/components/ui/classes.test.ts src/components/worklog/sheet.style.test.ts   # AC-007.1~AC-007.4
python3 ~/.claude/harness/bin/tdd-run TASK-7 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status worklog`에서 AC-007.1 ~ AC-007.4가 이 TASK의 시험과 이어져 보여야 한다

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

- 규칙 시험의 검사를 통째로 끄거나 폴더 전체를 빼지 마라. 이유: 다른 화면의 금지(700·16진수·CSS Module)는 그대로 지켜져야 한다
- 토큰을 `@theme inline`에 넣어 `bg-xl-lav` 같은 Tailwind 클래스를 만들지 마라. 이유: 엑셀 색이 다른 화면으로 번진다(design.md 12절)
- `WorklogSheet.tsx`를 이 step에서 만들지 마라. 이유: TASK-8 범위다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 실제 Supabase에 SQL을 실행하거나 붙여 넣지 마라(대시보드·CLI·REST 모두). 이유: DB 바꾸기는 사용자 OK가 필요하다(design.md 8절)
- 시험·고정 자료에 실제 의원 숫자(엑셀 10월 값)·환자 이름·차트번호·전화번호를 쓰지 마라. 이유: 가짜 자료만 쓴다(CLAUDE.md). 둥근 가짜 숫자(예: 100000)와 "가상" 글자를 쓴다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 Phase 1 Step 0과 사용자 승인으로만 바뀐다

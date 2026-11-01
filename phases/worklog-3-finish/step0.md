# Step 0: print

> **TASK-11** 인쇄 · **REQ-011** · AC-011.1 ~ AC-011.3
> Phase 3 `worklog-3-finish` · Step 0 — `specs/worklog/tasks.md`
> 명세 `specs/worklog/`는 승인됐다. 이 step은 TASK-11 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/worklog/requirements.md`의 REQ-011에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-011.1**: 인쇄 CSS — A4 세로·여백 12mm, 양식 폭 100% + 엑셀 pt(제목 32·칸 13·날짜 14·업무사항 11·지출 비고 10pt, 줄 높이 39.75·18·33.75·21·30·15pt), `print-color-adjust: exact`, 흐린 안내 글 안 찍힘
- **AC-011.2**: 줄 높이 23줄 합(634.5pt) ≤ A4 인쇄 높이(297mm − 24mm ≈ 773.9pt) → 한 장
- **AC-011.3**: 양식(결재 칸 포함)만 찍힘 — 앱 위쪽 묶음·건너뛰기 링크·날짜 줄·저장 상태·[인쇄] 숨김, 본문 여백 없음. 업무사항·고친 항목 이름은 찍히고, "합계에서 빠졌어요"·막힌 칸 빨강은 안 찍힘

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·019와 끝의 업무일지 ADR(Phase 1 Step 0이 더함)
- `/specs/worklog/requirements.md` — REQ-011
- `/specs/worklog/design.md` — 13절(인쇄), 2절(줄 높이 pt)
- `/specs/worklog/tasks.md` — 이 TASK의 수정 범위·메모
- 승인된 시안 `/docs/mockups/worklog/index.html` (화면 step이면 꼭)
- `/docs/UI_GUIDE.md` — '업무일지 양식(엑셀 예외)'·'앱 틀'·'휴대폰'
- 시안 `/docs/mockups/worklog/index.html` — `@media print` 블록(그대로 옮길 값)
- `/src/components/worklog/sheet.module.css`·`WorklogSheet.tsx`·`WorklogToolbar.tsx`·`WorklogScreen.tsx` (Phase 2)
- `/src/components/shell/AppShell.tsx`·`shell.test.tsx`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-11)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/components/worklog/sheet.module.css`
  - `src/components/worklog/sheet.print.test.ts`
  - `src/components/worklog/WorklogToolbar.tsx`
  - `src/components/worklog/WorklogToolbar.test.tsx`
  - `src/components/shell/AppShell.tsx`
  - `src/components/shell/shell.test.tsx`
  - `src/app/globals.css`
- Tests:
  - `src/components/worklog/sheet.print.test.ts`
  - `src/components/worklog/WorklogToolbar.test.tsx`
  - `src/components/shell/shell.test.tsx`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- 인쇄도 엑셀 모양 그대로다(사용자: A4 한 장, 결재 칸 포함). 시안의 인쇄 값(사용자에게 보낸 견본 PDF가 한 장으로 확인된 값)을 바꾸지 않는다
- `AppShell.tsx`는 다른 갈래와 겹친다: `print:` 클래스 세 곳만 더한다. 다른 클래스·구조는 바꾸지 않는다
- `globals.css`는 Next가 CSS Module 안 `@page`를 거부할 때만 끝에 `@media print { @page { size: A4 portrait; margin: 12mm; } }` 한 블록을 더한다(그때 summary에 적는다)

## 작업

### 1. `sheet.module.css` `@media print`
- 시안 블록을 옮긴다: `@page { size: A4 portrait; margin: 12mm; }`, `.paper { padding: 0; border: 0; }`, `.sheet { width: 100%; --c: 13pt; --c11: 11pt; --c10: 10pt; --c14: 14pt; --t: 32pt; --h1: 39.75pt; --h2: 18pt; --h3: 33.75pt; --h28: 21pt; --h40: 30pt; --h20: 15pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }`, `.memo textarea::placeholder { color: transparent; }`, `.flag { display: none; }`, `.blocked`의 빨강 지우기(인쇄는 엑셀 모양만)
- 줄 높이는 변수로만 둔다(시험이 변수 값을 읽어 더한다)

### 2. 숨기기
- `AppShell.tsx`: 건너뛰기 링크 `print:hidden`, 위쪽 묶음 `sticky` div `print:hidden`, 본문 안쪽 감싸개 `print:p-0`(+ 필요하면 `print:max-w-none`)
- `WorklogToolbar.tsx`: 맨 바깥 `print:hidden`(오류 카드 포함)

### 3. 시험
- `sheet.print.test.ts`(node): CSS 글자에서 `@media print` 블록을 찾아 `@page` A4·12mm(또는 globals.css의 블록), pt 변수 값, `print-color-adjust: exact`, placeholder 투명을 보고(AC-011.1), `.flag` 숨김·`.blocked` 빨강 지움을 본다(AC-011.3). 줄 높이 23줄(1:h1, 2:h2, 3:h3, 4~6:h28, 7~16:h40, 17~18:h20, 19~23:h40)의 pt 합 = 634.5 ≤ (297 − 24) × 72 / 25.4(AC-011.2)
- `shell.test.tsx`: `AC-011.3` 시험 하나 — 건너뛰기 링크·위쪽 묶음에 `print:hidden`, 본문 감싸개에 `print:p-0`
- `WorklogToolbar.test.tsx`: 맨 바깥에 `print:hidden`

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-002.2: 수납액은 현금·카드·계좌·지역화폐만 더한다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-11 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-11 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/components/worklog/sheet.print.test.ts src/components/worklog/WorklogToolbar.test.tsx src/components/shell/shell.test.tsx   # AC-011.1~AC-011.3
npx vitest run src/components/ui/classes.test.ts src/app/theme.test.ts src/app/fonts.test.ts   # 규칙 시험 그대로
python3 ~/.claude/harness/bin/tdd-run TASK-11 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status worklog`에서 AC-011.1 ~ AC-011.3가 이 TASK의 시험과 이어져 보여야 한다

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

- 인쇄 미리보기 창(시안의 `.pv`)을 만들지 마라. 이유: 브라우저 인쇄 창이 미리보기를 한다(design.md 3절)
- `AppShell.tsx`의 기존 클래스 문자열·구조를 바꾸지 마라. 이유: 앱 틀 시험과 다른 갈래가 기대한다. `print:`만 더한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 실제 Supabase에 SQL을 실행하거나 붙여 넣지 마라(대시보드·CLI·REST 모두). 이유: DB 바꾸기는 사용자 OK가 필요하다(design.md 8절)
- 시험·고정 자료에 실제 의원 숫자(엑셀 10월 값)·환자 이름·차트번호·전화번호를 쓰지 마라. 이유: 가짜 자료만 쓴다(CLAUDE.md). 둥근 가짜 숫자(예: 100000)와 "가상" 글자를 쓴다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 Phase 1 Step 0과 사용자 승인으로만 바뀐다

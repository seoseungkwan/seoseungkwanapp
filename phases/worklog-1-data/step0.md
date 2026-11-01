# Step 0: docs

> **TASK-1** 결정과 규칙 문서 · **REQ-001** · AC-001.1 ~ AC-001.3
> Phase 1 `worklog-1-data` · Step 0 — `specs/worklog/tasks.md`
> 명세 `specs/worklog/`는 승인됐다. 이 step은 TASK-1 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/worklog/requirements.md`의 REQ-001에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-001.1**: `docs/ADR.md` 끝에 업무일지 ADR 하나 — 2026-11-01 사용자 결정 셋(① 업무사항은 그 PC localStorage에만, 서버·백업·AI로 안 감 ② 서버 칸 자동 저장, 저장 단추 없음, 임시 저장이 아니라 바로 DB 저장 ③ 양식 칸 엑셀 서식 예외)과 이유·트레이드오프
- **AC-001.2**: `docs/ARCHITECTURE.md` — 디렉토리 줄(`components/worklog/`·`lib/worklog/`·`lib/storage/worklogDays.ts`), DB 표 `daily_reports`(미정) → `worklog_days`, 데이터 흐름 [업무일지] 한 줄, 상태 관리 예외 한 줄
- **AC-001.3**: `docs/UI_GUIDE.md` — '업무일지 양식(엑셀 예외)' 절, '하지 마라' 세 줄 꼬리표, '상자 안 상자' 예외 한 줄

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·019와 끝의 업무일지 ADR(Phase 1 Step 0이 더함)
- `/specs/worklog/requirements.md` — REQ-001
- `/specs/worklog/design.md` — 1·3·7·10·12·13·16·18절 전체
- `/specs/worklog/tasks.md` — 이 TASK의 수정 범위·메모
- 승인된 시안 `/docs/mockups/worklog/index.html` (화면 step이면 꼭)
- `/docs/UI_GUIDE.md` — '하지 마라'·'상자 안 상자 금지'·'휴대폰' 절
- `/plan.md` §1(폰은 보기만)·§5·§8·§10

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-1)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `docs/ADR.md`
  - `docs/ARCHITECTURE.md`
  - `docs/UI_GUIDE.md`
  - `plan.md`
- Tests:
  - `없음(문서)`
- TDD: exempt — 문서만 고친다

## 꼭 지킬 규칙 (CRITICAL)

- 문서는 사실만 적는다. 명세(design.md)에 없는 새 결정을 만들지 않는다
- 사용자 결정은 **(사용자)**, Claude 판단은 **(Claude 판단)**으로 표시한다(문서의 기존 표시 방식)
- 다른 갈래(통계·매출·환자·사전점검)가 같은 문서를 고친다. **더하기만** 하고 기존 문장은 '하지 마라' 표의 세 줄 꼬리표 말고는 바꾸지 않는다(design.md 18절)

## 작업

### 1. `docs/ADR.md`
- 맨 끝에 `### ADR-0NN: 업무일지 — 업무사항은 이 PC에만, 자동 저장, 엑셀 양식 예외` 하나. 번호는 파일의 마지막 번호 + 1
- **결정** 셋(design.md 7·10·12절 요약), **이유**(사용자: 업무사항에 환자 이름·차트번호를 적는다 → 서버로 보내지 않는다 / 저장 단추 없이 / "엑셀이랑 완전 똑같이"), **트레이드오프**(업무사항은 다른 PC·폰에서 안 보이고 크롬 데이터 삭제 때 사라짐, 암호화 없음 / 동시 수정은 마지막 저장이 이김 / 양식 칸은 Pretendard·400~600·토큰 규칙의 예외 — 색 토큰 넷과 CSS Module 한 파일로 가둠)
- ARCHITECTURE '브라우저 저장소에는 폴더 핸들만 둔다'와 `plan.md` §10 '입력값 임시 저장'과의 관계를 한 줄씩(업무사항은 사용자 결정 예외, 서버 칸은 임시 저장이 아니라 바로 저장)

### 2. `docs/ARCHITECTURE.md`
- 디렉토리 구조: `components/worklog/`(업무일지 화면, 엑셀 양식 `sheet.module.css`는 앱 화면의 유일한 CSS Module), `lib/worklog/`(합계·칸 글자·날짜·비고 검사·자동 저장·업무사항 이 PC 저장소), `lib/storage/worklogDays.ts`
- DB 표: `daily_reports` 줄을 `worklog_days`(하루 한 줄: 인원 2·수입 8·지출 4·비고 5칸, 업무사항 칸 없음)로
- 데이터 흐름: `[업무일지] 칸 입력 → 자동 저장(800ms) → worklog_days(RLS) · 업무사항 → 이 PC localStorage만`
- 상태 관리: "브라우저 저장소에는 폴더 핸들만 둔다" 아래에 "예외: 업무일지 업무사항(사용자 결정 2026-11-01, ADR-0NN)"

### 3. `plan.md`
- §5 '`lib/folder/`: 폴더 연결 정보(폴더 핸들)만 브라우저 저장소에 둔다' 줄 끝에 "(예외: 업무일지 업무사항은 그 PC 브라우저에만, 사용자 결정 2026-11-01 · ADR-0NN)" 꼬리표 한 줄만. 다른 문장은 그대로(plan.md가 이기는 문서라 예외를 거기에도 적는다)

### 4. `docs/UI_GUIDE.md`
- 새 절 `## 업무일지 양식 (엑셀 예외)`: 예외 범위는 `WorklogSheet` 표 안만(날짜 줄·상태·오류 카드는 일반 규칙), 토큰 `--xl-ink`·`--xl-lav`·`--xl-gray`·`--xl-focus`, 글꼴 굴림·맑은 고딕(시스템 글꼴, 파일 없음), 굵기 700, 화면 px·인쇄 pt 값(design.md 2·13절), 인쇄 A4 한 장, 휴대폰은 같은 양식 보기만
- '하지 마라' 표의 '두 번째 글꼴'·'700 굵기'·'토큰 밖의 색과 값' 줄 이유 칸 끝에 "(업무일지 양식 칸은 예외 — 아래 '업무일지 양식')"
- '상자 안 상자 금지' 끝에 "업무일지 종이(`.paper`) 안 엑셀 표의 칸 선은 상자가 아니다(엑셀 칸 선)" 한 줄


## Acceptance Criteria

```bash
git diff --stat -- docs/ plan.md   # 네 파일만 바뀌었다
npm test                   # 문서만 바꿨으니 그대로 통과
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status worklog`에서 AC-001.1 ~ AC-001.3가 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (환자 개인정보·업무사항은 서버로 가지 않는다, RLS, 비밀값)
3. 결과에 따라 `phases/worklog-1-data/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 실제 Supabase에 SQL 붙여 넣기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- ADR 번호를 미리 정해 다른 문서에 박지 마라. 이유: 다른 갈래와 번호가 겹칠 수 있어 합칠 때 다시 매긴다(design.md 18절)
- 기존 ADR·규칙 문장을 지우거나 고쳐 쓰지 마라(꼬리표 세 줄 빼고). 이유: 다른 갈래와 합칠 때 겹침이 커지고, 규칙은 그대로 다른 화면에 적용된다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 실제 Supabase에 SQL을 실행하거나 붙여 넣지 마라(대시보드·CLI·REST 모두). 이유: DB 바꾸기는 사용자 OK가 필요하다(design.md 8절)
- 시험·고정 자료에 실제 의원 숫자(엑셀 10월 값)·환자 이름·차트번호·전화번호를 쓰지 마라. 이유: 가짜 자료만 쓴다(CLAUDE.md). 둥근 가짜 숫자(예: 100000)와 "가상" 글자를 쓴다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`를 고치지 마라. 이유: 이 step의 범위가 아니다

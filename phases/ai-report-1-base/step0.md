# Step 0: docs-config

> **TASK-1** 문서·설정 — ADR-023, 구조 문서, 계획, 열쇠 양식, 무시 목록 · **REQ-501** · AC-501.1 ~ AC-501.2
> Phase 1 `ai-report-1-base` · Step 0 — `specs/ai-report/tasks.md` 머리말 '할 순서'
> 명세 `specs/ai-report/`는 사용자가 승인한 뒤에만 이 step을 돌린다. 이 step은 TASK-1 하나만 한다. 다른 TASK의 일은 하지 않는다.
> 이 phase는 차례로 돈다(Step 0 → 1 → 2).

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/ai-report/requirements.md`의 REQ-501에 있다. 아래는 요약이다. 이 TASK는 TDD 예외(문서·설정 글자만)라 시험 파일이 없고, 아래 'Acceptance Criteria'의 찾기 명령으로 본다.

- **AC-501.1**: `docs/ADR.md`에 ADR-023이 있고 리포트 달마다 저장·덮어쓰기, 지문, 근거 숫자는 앱이 채움, 모델 `claude-opus-5-5`, 숫자 읽는 자리는 통계 명세 전까지 "자료 없음"을 적는다
- **AC-501.2**: `.env.example`에 `ANTHROPIC_API_KEY=` 줄(빈 값)과 "서버 전용, `NEXT_PUBLIC_` 금지" 설명이 있다. `.gitignore`에 `.ai-try/`가 있다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md` — 'AI' 흐름 줄(`[AI] [AI 분석] → app/api/ai …`), DB 표(`ai_usage` 줄), '상태 관리'("채팅 기록·월간 보고서는 저장하지 않는다")
- `/docs/ADR.md` — ADR-004·007·008, 그리고 마지막 ADR-022(제목·**결정**·**이유**·**트레이드오프** 모양을 그대로 따른다)
- `/plan.md` §2-3(AI 분석), §5 'DB 표', §8(오류 처리·로그)
- `/specs/ai-report/requirements.md` — 배경 1~12(특히 1·5·6·8), REQ-501
- `/specs/ai-report/design.md` — '흐름', 'DB', '결정과 트레이드오프', '위험'
- `/specs/ai-report/tasks.md` — 머리말 '모든 TASK 공통', TASK-1(할 일 목록)
- `/.env.example`, `/.gitignore` (지금 모양·주석 말투)

이 step은 Phase의 첫 step이라 앞 step에서 만든 파일이 없다.

## 수정 범위 (tasks.md TASK-1)

이 목록에 있는 경로만 만들고 고칠 수 있다. 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `docs/ADR.md`
  - `docs/ARCHITECTURE.md`
  - `plan.md`
  - `.env.example`
  - `.gitignore`
- Tests: 없음
- TDD: exempt — 문서와 설정 글자만 고친다. 앱 코드가 없다

## 꼭 지킬 규칙 (CRITICAL)

- **비밀값**: `.env.example`에는 이름과 빈 값(`ANTHROPIC_API_KEY=`)만 쓴다. 진짜 열쇠·열쇠처럼 보이는 글자(`sk-ant-…`)를 어떤 문서에도 쓰지 않는다. `NEXT_PUBLIC_`를 붙이지 않는다(브라우저로 나간다) (CLAUDE.md 보안 규칙)
- **옛 결정은 지우지 않고 바꾼 것을 적는다**: ADR-007 본문은 그대로 두고 끝에 한 줄만 더한다. ARCHITECTURE '상태 관리'는 줄을 바꾸되 채팅·월간 PDF는 저장하지 않는다는 뜻은 남긴다 (requirements 배경 마지막 줄)
- **사용자 결정 표시**: plan.md에서 사용자가 정한 것은 **(사용자)**, 날짜가 필요하면 **(사용자, 2026-11-01)**로 표시한다(plan.md 기존 표기)

## 작업

tasks.md TASK-1 '할 일'을 그대로 한다.

### 1. `docs/ADR.md`
- 맨 끝에 `### ADR-023: …`을 더한다. 제목 예: `### ADR-023: AI 월간 리포트는 달마다 저장하고, 근거 숫자는 앱이 채운다 (모델 Claude Opus 5.5)`
- **결정**에 들어갈 것(requirements 배경 1·5·6·8):
  - 리포트는 병원·달마다 하나 저장한다(`ai_reports`). 다시 분석하면 그 달 리포트를 덮어쓴다(옛 판은 남기지 않는다)
  - 만들 때 쓴 숫자의 지문(SHA-256, 소문자 16진수 64자)을 함께 저장해 숫자가 바뀌었는지 화면이 알 수 있게 한다
  - 근거 숫자는 앱이 채운다. AI는 카드마다 지표 ID만 고르고, 문장에는 숫자를 쓰지 않는다
  - 모델은 Claude Opus 5.5(`claude-opus-5-5`). 거절되면 서버가 다른 모델로 다시 돌린다(`fallbacks: "default"`)
  - 숫자 읽는 자리(`loadReportMonths`)는 통계 명세 전까지 늘 "자료 없음"(앱 경로에 지어낸 숫자가 없다). 가짜 숫자는 `fixtures/fake-ai/`·시험·`npm run ai:try`에만
  - 쓰기는 DB 함수 둘(`save_ai_report`·`add_ai_usage`)로만, service role 키 없음
- **이유**·**트레이드오프**: design.md '결정과 트레이드오프'를 짧게(숫자 오기 없음 ↔ 문장에 숫자 못 씀, 저장으로 다시 볼 때 비용 없음 ↔ 옛 판 없음, 사용자 세션으로 쓰므로 자기 병원 자료는 꾸밀 수 있음 — 실제 비용 한도는 Anthropic 콘솔)
- **바꾸는 것**: ARCHITECTURE '상태 관리'의 "월간 보고서는 저장하지 않는다"(AI 리포트만 바뀜, 월간 PDF는 그대로), ADR-007의 "모델은 미정"
- ADR-007 끝에 한 줄: `모델·저장: ADR-023`

### 2. `docs/ARCHITECTURE.md`
- DB 표에 `ai_reports` 줄(달별 AI 리포트·지문)
- AI 흐름 줄에 저장 단계(`… → Claude API → 답 검사 → ai_reports 저장 → ai_usage 기록 → 화면(글자로만)`처럼)
- '상태 관리'의 월간 보고서 줄 → "AI 리포트는 달마다 저장(ADR-023), 채팅·월간 PDF는 저장하지 않는다"

### 3. `plan.md`
- §2-3 "모델은 구현할 때 비용을 보고 정한다" → "모델: Claude Opus 5.5 **(사용자, 2026-11-01)**"
- §2-3에 리포트 달마다 저장(다시 분석하면 덮어씀) **(사용자)** 줄
- §5 DB 표에 `ai_reports`

### 4. `.env.example`
- 맨 아래에 빈 줄 하나 뒤:
  ```
  # AI 리포트(서버 전용). NEXT_PUBLIC_ 금지. 값은 npm run ai:key로 넣는다
  ANTHROPIC_API_KEY=
  ```

### 5. `.gitignore`
- 맨 아래에 빈 줄 하나 뒤:
  ```
  # npm run ai:try 결과(가짜 숫자 리포트)
  .ai-try/
  ```

## TDD 순서

이 TASK는 `TDD: exempt`다. 시험 파일이 없으므로 `tdd-run`을 부르지 않는다(부르면 "테스트 파일이 아직 없습니다"로 끝난다). 아래 'Acceptance Criteria'의 찾기 명령이 확인이다.

### 이 PC(윈도우)에서
- 하네스 도구는 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/<도구>`로 부른다(`python3 ~/.claude/...` 대신). 다른 TASK의 RED는 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-n --expect red`, GREEN은 같은 명령에 `--expect green`이다
- `execute.py`는 이 PC에서 쓰지 않는다(리눅스 전용 신호를 쓴다). 오케스트레이터(메인 세션)가 step마다 새 세션을 열어 이 파일을 준다. 이 세션은 이 step 하나만 하고 끝낸다
- 파일을 읽어 줄로 나눌 때는 늘 `split(/\r?\n/)`를 쓴다(이 PC의 git은 파일을 CRLF로 꺼낼 수 있다). 아래 확인 명령도 그렇게 한다
- `npm test` 기준선: 이 PC는 .NET 10이 없어 46개가 이미 실패한다(2026-11-01). 이 step은 문서만 고치므로 실패 수가 그대로여야 한다

## Acceptance Criteria

```bash
grep -n "### ADR-023" docs/ADR.md
grep -n "모델·저장: ADR-023" docs/ADR.md
node -e "const t=require('fs').readFileSync('docs/ADR.md','utf8');const s=t.slice(t.indexOf('### ADR-023'));process.exit(t.includes('### ADR-023')&&['claude-opus-5-5','지문','덮어','자료 없음','앱이'].every(w=>s.includes(w))?0:1)"
grep -n "ai_reports" docs/ARCHITECTURE.md plan.md
grep -n "AI 리포트는 달마다 저장" docs/ARCHITECTURE.md
grep -n "Claude Opus 5.5" plan.md
node -e "const l=require('fs').readFileSync('.env.example','utf8').split(/\r?\n/);process.exit(l.includes('ANTHROPIC_API_KEY=')&&l.some(x=>x.startsWith('#')&&x.includes('서버 전용')&&x.includes('NEXT_PUBLIC_'))?0:1)"
node -e "const l=require('fs').readFileSync('.gitignore','utf8').split(/\r?\n/);process.exit(l.includes('.ai-try/')?0:1)"
git status --short   # 바뀐 파일이 위 '수정 범위' 다섯 개뿐인지 본다(phases/ 상태 기록 제외)
npm run lint -- --max-warnings=0
```

- 위 커맨드가 모두 에러 없이(종료 코드 0) 끝나야 한다
- `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/verify`는 기준선 실패(46개) 때문에 test 단계에서 멈출 수 있다. 그때는 실패 수가 46개 그대로인지 보고 summary에 적는다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (서버 코드는 `app/api/ai/` 하나 — ADR-004 그대로)
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (열쇠 값 없음, `NEXT_PUBLIC_` 없음)
3. 결과에 따라 `phases/ai-report-1-base/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python -X utf8`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막는다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 오케스트레이터가 다음 step 프롬프트에 그대로 전달한다. 고친 파일, ADR 번호·제목, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- `.env.example`·문서에 열쇠 값이나 `sk-ant-`로 시작하는 글자를 쓰지 마라. 이유: 비밀값은 `.env.local`과 서버 환경 변수에만 둔다(CLAUDE.md 보안 규칙)
- `ANTHROPIC_API_KEY`에 `NEXT_PUBLIC_`를 붙이거나 그런 이름을 안내하지 마라. 이유: `NEXT_PUBLIC_*`는 브라우저 묶음에 들어가 밖으로 나간다
- ADR-007·ARCHITECTURE의 옛 문장을 통째로 지우지 마라. 이유: 무엇이 언제 바뀌었는지 남아야 한다. 바뀐 것은 ADR-023이 적고 옛 자리는 가리킨다
- 앱 코드(`src/**`)·`package.json`·`supabase/**`를 고치지 마라. 이유: 이 TASK는 문서·설정 글자만 다룬다. 코드는 뒤 TASK가 한다
- 기존 테스트를 깨뜨리지 마라. 이유: 문서 글자를 보는 시험이 있을 수 있다(`npm test` 실패 수가 기준선 46개 그대로여야 한다)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라(`CLAUDE.md`·`.harness/*`·`docs/` 안 다른 파일 포함). 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 오케스트레이터(메인 세션)가 한다

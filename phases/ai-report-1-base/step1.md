# Step 1: error-codes

> **TASK-2** AI 오류 번호 넷 · **REQ-502** · AC-502.1 ~ AC-502.2
> Phase 1 `ai-report-1-base` · Step 1 — `specs/ai-report/tasks.md` 머리말 '할 순서'
> 명세 `specs/ai-report/`는 사용자가 승인한 뒤에만 이 step을 돌린다. 이 step은 TASK-2 하나만 한다. 다른 TASK의 일은 하지 않는다.
> 이 phase는 차례로 돈다(Step 0 → 1 → 2). 다음 step(TASK-5)의 `AiErrorCode`가 이 step의 네 번호에 맞춘다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/ai-report/requirements.md`의 REQ-502에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-502.1**: `errorInfo`로 `E-AI-BUSY`·`E-AI-LIMIT`·`E-AI-FAILED`·`E-AI-NO-DATA`를 찾으면 넷 다 빈 글자가 아닌 what·fix가 있다. 네 문구에 "병원"이 없고 "니다."로 끝나는 문장이 없다(ui-90 문구 규칙)
- **AC-502.2**: BUSY는 잠시 뒤 다시, LIMIT는 이번 달 AI 한도, FAILED는 [다시 분석], NO-DATA는 그 달 통계를 먼저 넣으라는 뜻이다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` ("오류 문구는 `lib/errors.ts` 한 곳('무엇이 · 어떻게 고치나 · 번호')")
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — ADR-007, ADR-023(Step 0이 더함)
- `/plan.md` §8(오류 처리)
- `/specs/ai-report/requirements.md` — REQ-502
- `/specs/ai-report/design.md` — '오류 문구' 표
- `/specs/ai-report/tasks.md` — 머리말 '모든 TASK 공통', TASK-2
- `/src/types/errors.ts` (`ErrorCode`·`ErrorInfo`)
- `/src/lib/errors.ts` (`ERRORS`·`errorInfo`·`isErrorCode`)
- `/src/lib/errors.test.ts` (`ALL_CODES` 목록과 `expectTypeOf` 타입 검사, 기존 문구 규칙 시험)
- 이전 step에서 만든 파일:
  - `docs/ADR.md` ADR-023, `docs/ARCHITECTURE.md`, `plan.md`, `.env.example`, `.gitignore` (Step 0, 문서·설정만)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-2)

이 목록에 있는 경로만 만들고 고칠 수 있다. 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/types/errors.ts`
  - `src/lib/errors.ts`
  - `src/lib/errors.test.ts`
- Tests:
  - `src/lib/errors.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **문구는 한 곳**: 오류 안내 글자는 `src/lib/errors.ts`에만 둔다. 뒤 TASK(서버 경로·`ai:try`)는 번호만 주고 문구는 `errorInfo`로 꺼낸다 (CLAUDE.md)
- **문구는 design.md 표 그대로**: 글자 하나 바꾸지 않는다. 다르게 쓰고 싶으면 고치지 말고 summary에 적는다
- **문구 규칙(ui-90)**: "병원"을 쓰지 않는다. 문장을 "니다."로 끝내지 않는다(해요체)

## 작업

### 1. `src/types/errors.ts`
- `ErrorCode` 끝에 주석 한 줄 + 네 번호를 더한다:
  ```ts
  // AI 리포트(spec ai-report design.md '오류 문구')
  | 'E-AI-BUSY' | 'E-AI-LIMIT' | 'E-AI-FAILED' | 'E-AI-NO-DATA'
  ```

### 2. `src/lib/errors.ts`
- `ERRORS` 끝에 네 항목. 문구는 design.md '오류 문구' 표 그대로다:

| 번호 | what | fix |
|---|---|---|
| `E-AI-BUSY` | AI가 지금 바빠서 답하지 못했어요 | 1~2분 뒤 [다시 분석]을 눌러 주세요. |
| `E-AI-LIMIT` | 이번 달 AI 사용 한도에 닿았어요 | Anthropic 콘솔에서 한 달 한도를 늘리거나 다음 달에 다시 해 주세요. |
| `E-AI-FAILED` | AI 리포트를 만들지 못했어요 | [다시 분석]을 눌러 주세요. 계속되면 오류 번호와 함께 문의해 주세요. |
| `E-AI-NO-DATA` | 이 달 통계가 아직 없어요 | 통계 탭에서 그 달 비트 자료를 먼저 넣어 주세요. |

- `errorInfo`·`isErrorCode`는 고치지 않는다(새 번호도 그대로 찾힌다)

### 3. 시험 (`src/lib/errors.test.ts`)
- `ALL_CODES`에 네 번호를 더한다(이미 있는 `expectTypeOf<…>().toEqualTypeOf<ErrorCode>()`가 타입을 맞춰 본다)
- `AI_CODES = ['E-AI-BUSY', 'E-AI-LIMIT', 'E-AI-FAILED', 'E-AI-NO-DATA'] as const`
- `it('AC-502.1 …')`: 넷 다 `errorInfo(code).what`·`.fix`가 빈 글자가 아니다. 여덟 글자 모두 "병원"이 없고, 문장 끝(`/니다\.(\s|$)/`)이 없다
- `it('AC-502.2 …')`: BUSY fix에 "뒤"와 "[다시 분석]", LIMIT what에 "이번 달"과 "한도", FAILED fix에 "[다시 분석]", NO-DATA fix에 "통계"와 "먼저"가 있다
- 기존 시험(다른 번호의 문구 시험)은 그대로 둔다

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-502.1 AI 오류 넷은 what·fix가 있고 "병원"·"니다."가 없다', …)`
2. `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-2 --expect red` 로 실패(RED)를 확인하고 기록한다(번호가 아직 없어 `errorInfo`가 `undefined`를 돌려준다). RED 기록 전에는 구현 파일(`src/types/errors.ts`·`src/lib/errors.ts`)을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-2 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

### 이 PC(윈도우)에서
- 하네스 도구는 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/<도구>`로 부른다(`python3 ~/.claude/...` 대신)
- `execute.py`는 이 PC에서 쓰지 않는다(리눅스 전용 신호를 쓴다). 오케스트레이터(메인 세션)가 step마다 새 세션을 열어 이 파일을 준다. 이 세션은 이 step 하나만 하고 끝낸다
- 시험에서 파일을 읽어 줄로 나눌 때는 늘 `split(/\r?\n/)`를 쓴다(이 PC의 git은 파일을 CRLF로 꺼낼 수 있다)
- `npm test` 기준선: 이 PC는 .NET 10이 없어 46개가 이미 실패한다(2026-11-01). 새 실패가 없어야 한다(실패 수가 46개를 넘지 않고, 이 step의 시험은 모두 통과)

## Acceptance Criteria

```bash
npx vitest run src/lib/errors.test.ts
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-2 --expect green
npm run lint -- --max-warnings=0
npm run build
npm test   # 실패는 기준선 46개뿐
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/sdd status ai-report
```

- 위 커맨드가 모두 에러 없이 끝나야 한다(`npm test`는 기준선 실패만 남아야 한다)
- `sdd status ai-report`에서 AC-502.1 ~ AC-502.2가 이 TASK의 시험과 이어져 보여야 한다
- `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/verify`는 기준선 실패 때문에 test 단계에서 멈출 수 있다. 그때는 실패 목록이 기준선 그대로인지 보고 summary에 적는다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (문구는 `lib/errors.ts` 한 곳)
3. 결과에 따라 `phases/ai-report-1-base/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python -X utf8`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막는다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 오케스트레이터가 다음 step 프롬프트에 그대로 전달한다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 문구를 design.md 표와 다르게 쓰지 마라. 이유: 화면 명세·`ai:try`가 같은 글자를 기대한다. 다르게 하고 싶으면 summary에 적는다
- 기존 번호의 문구·순서를 고치지 마라. 이유: 다른 화면과 시험이 그 글자를 쓴다. 이 TASK는 네 번호를 더하기만 한다
- 화면 코드(`src/app/(app)/**`·`src/components/**`)를 만들거나 고치지 마라. 이유: 화면은 목업 승인 뒤 화면 명세가 한다(CLAUDE.md, requirements '범위 밖')
- 기존 테스트를 깨뜨리지 마라. 이유: `errors.test.ts`의 기존 시험과 기준선 밖 시험이 계속 통과해야 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `eslint-disable`로 규칙을 피하지 마라. 이유: 린트 경고 0이 끝 조건이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 오케스트레이터(메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다

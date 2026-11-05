# Step 1: message-fill

> **TASK-6** 문자 문구 채우기 · 기본 문구 (골든) · **REQ-608** · AC-608.1 ~ AC-608.3
> Phase 2 `patients-2-messages`(문자 문구 · 서버 표) · Step 1 — 명세 `specs/patients/`
> 명세 `specs/patients/`는 승인됐다. 이 step은 TASK-6 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/patients/requirements.md`의 REQ-608에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-608.1**: `fillTemplate(body, date)`: `<<DATE>>` 줄과 이미 날짜 줄인 줄 → "* M월 D일 X요일 *", `[*1*]`·`[*2*]`·다른 줄 그대로(골든 여러 날짜)
- **AC-608.2**: `DEFAULT_TEMPLATES`: 원본 `TPLS` jusa → injection '주사 안내', jinryo → followup '진료 안내'의 이름·글 그대로(골든)
- **AC-608.3**: `defaultSendDate(today)` = 내일

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·020·021
- `/specs/patients/requirements.md` — REQ-608
- `/specs/patients/design.md` — '결정과 트레이드오프'의 문자 문구 종류
- `/specs/patients/tasks.md` — TASK-6
- `/src/lib/analytics/dates.ts`(`addDays`·`weekdayOf`)
- 이전 step에서 만든 파일: `scripts/patients/golden/revisit.mjs`(원본 스크립트 꺼내기 방식)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 브랜치 `main`, 폴더 `YangjiBareun_사전점검/`, 커밋 `2a1069b` (README 1.24.5)
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다(precheck에서 GitHub 비교로 확인). 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`)의 자료는 모두 가짜다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `assets/message_templates.html` 541~600줄 근처: `TPLS`(jusa·jinryo의 `id`·`name`·`note`·`text`), `WD`, `DATE_LINE`, `ymd`·`parse`·`dateLine`·`withDate`, 안내 글(`[*1*]` → 받는 분 이름, `[*2*]` → 부위, 날짜 기본값 내일)

## 수정 범위 (tasks.md TASK-6)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/patientMessages/fill.ts`
  - `src/lib/patientMessages/fill.test.ts`
  - `src/lib/patientMessages/defaults.ts`
  - `src/lib/patientMessages/defaults.test.ts`
  - `scripts/patients/golden/*`
  - `fixtures/patients/golden/messages-*.json`
- Tests:
  - `src/lib/patientMessages/fill.test.ts`
  - `src/lib/patientMessages/defaults.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **골든 시험**: 같은 가짜 자료를 원본(`2a1069b`)과 우리 함수에 넣어 결과가 순서까지 같은지 깊은 비교한다. 원본 결과는 `scripts/patients/golden/`의 스크립트로 한 번 만들어 `fixtures/patients/golden/<이름>.json`에 커밋한다. JS 원본은 `node:vm`으로(원본 시험 `tests/test_revisit_import_html.py`가 `<script>`를 꺼내 `vm.runInContext`로 돌리는 방식과 같게) 돌린다. 골든 파일 머리에 `{ "source": "seoseungkwan/shared@2a1069b", "file": …, "entry": … }`를 적는다. 일부러 다르게 한 것만 `knownDiffs`에 이유와 함께 적고, 적지 않은 차이는 실패다. 골든 시험은 원본 없이 커밋한 골든 파일과 비교해서 돈다(골든을 다시 만들 때만 `YANGJI_SRC`가 필요). 원본의 `Date` 값은 골든 파일에 `YYYY-MM-DD` 글자로 적는다
- **원본은 저장소 밖**: 원본 경로는 `YANGJI_SRC` 환경 변수나 스크립트 인자로만 받는다. 원본 파일 자체(`revisit_schedule.html`·`message_templates.html` 등)를 저장소에 복사·커밋하지 않는다. 커밋하는 것은 옮긴 코드와 골든 결과뿐이다
- **날짜는 한 곳**: 날짜 계산은 `src/lib/analytics/dates.ts`(한국 날짜, `YYYY-MM-DD`). '오늘'은 함수 인자로 받는다(`new Date()`를 계산 안에서 부르지 않는다). 시험은 `TZ=Asia/Seoul`에서 돈다 (CLAUDE.md)

## 작업

### 1. 골든 (`scripts/patients/golden/messages.mjs`)
- `message_templates.html`의 본 스크립트에서 `TPLS`·`dateLine`·`withDate`를 꺼내 `vm`에서 돌린다(화면 묶기 부분은 가짜 `document`로 막는다)
- 날짜: 평일·토·일, 월말(1/31·2/28·윤년 2/29), 연말(12/31), 한 자리 달·날 → `fixtures/patients/golden/messages-fill.json`(문구 × 날짜 → 결과), `messages-defaults.json`(`TPLS` 그대로)
- 사례 문구: 원본 두 문구, `<<DATE>>`가 줄 가운데 있는 줄, 날짜 줄이 이미 있는 줄(다시 채우기), `[*1*]`·`[*2*]`만 있는 줄, 빈 줄

### 2. 코드
```ts
// src/lib/patientMessages/fill.ts — 환자 정보 없음(구역 밖). 날짜는 dates.ts
export const DATE_LINE: RegExp                                       // 원본 그대로
export function dateLine(date: string /* YYYY-MM-DD */): string     // "* M월 D일 X요일 *"
export function fillTemplate(body: string, date: string): string   // 원본 withDate: 줄마다 <<DATE>>가 있거나 DATE_LINE이면 그 줄 전체를 dateLine으로
export function defaultSendDate(today: string): string             // 내일
// src/lib/patientMessages/defaults.ts
export type TemplateKind = 'injection' | 'followup'
export const DEFAULT_TEMPLATES: readonly { kind: TemplateKind; name: string; body: string; sort_order: number }[]   // jusa → injection(0), jinryo → followup(1)
```
- 원본 `note`("사용 전 병원명·연락처·진료시간을 수정하세요")는 표에 칸이 없다 → 화면 안내 글로 쓰도록 `DEFAULT_TEMPLATE_NOTE`로 내보내고, 골든 `knownDiffs`에 적는다

### 3. 시험
- `fill.test.ts`(AC-608.1·608.3): 골든과 깊은 비교 + 사례. `defaults.test.ts`(AC-608.2): 골든 `TPLS`와 이름·글이 같다, 이름 30자·글 2000자 안이다(표 제약)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-602.1 내일은 진료일 다음 날', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-6 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 시험 파일과 설정 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-6 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/lib/patientMessages/fill.test.ts src/lib/patientMessages/defaults.test.ts   # AC-608.1~AC-608.3
python3 ~/.claude/harness/bin/tdd-run TASK-6 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status patients`에서 AC-608.1 ~ AC-608.3가 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/patients-2-messages/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (원본 저장소·승인 목업·선행 작업 없음 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- `{이름}`·`{병원}` 같은 새 자리 표시를 만들지 마라. 이유: 문자 발송 프로그램이 원본의 `[*1*]`·`[*2*]`만 채운다
- 문구를 보내는(문자 발송) 코드를 만들지 마라. 이유: 복사만 한다(범위 밖)
- 날짜 계산을 `Date`로 직접 하지 마라. 이유: 날짜는 `dates.ts` 한 곳(CLAUDE.md)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- `specs/precheck/`·`phases/precheck-*`·`src/lib/bridge/*`·`src/lib/bridge/commands.json`·`src/workers/precheck/*`·`src/types/precheck.ts`를 고치지 마라. 이유: 청구 사전점검 브랜치가 쓰는 파일이다(design.md '다른 작업과 겹치는 파일')
- 기존 테스트를 깨뜨리지 마라. 이유: 다른 기능의 시험이 계속 통과해야 한다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`(수정 범위에 적힌 것 빼고)를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다

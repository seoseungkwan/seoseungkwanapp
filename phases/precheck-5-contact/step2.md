# Step 2: message-templates

> **TASK-25** 문자 문구 (설정 칸 · 복사) · **REQ-025** · AC-025.1 ~ AC-025.4
> Phase 5 `precheck-5-contact` · Step 2 — `docs/precheck/plan.md` §6
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-25 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-025에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-025.1**: `fillTemplate(body, date)`가 원본처럼 `<<DATE>>`를 "* M월 D일 X요일 *"로 바꾸고 `[*1*]`·`[*2*]`는 그대로 둔다(날짜는 `dates.ts`, 골든)
- **AC-025.2**: 설정 화면의 '문자 문구' 칸에서 정기 주사·F/U 문구를 더하고·고치고·지우고·순서를 바꿀 수 있고 `message_templates`에 저장. 처음(줄이 없을 때)은 원본 `TPLS`(`jusa`·`jinryo`) 내용을 기본으로 보인다
- **AC-025.3**: [문구 복사]는 채운 글을 클립보드에 복사하고 "복사했어요". 문자를 보내지 않는다(자동 발송 없음)
- **AC-025.4**: 문구 저장 실패면 값을 그대로 두고 `E-SETTINGS-FAILED`와 [다시 저장]

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·017·018·019
- `/docs/precheck/plan.md` §6 (Phase·Step 순서)
- `/specs/precheck/requirements.md` — REQ-025
- `/specs/precheck/design.md` — 2절 표(문자 문구 원본), 8-1절(`message_templates` 표), 7절 표 '설정'
- `/specs/precheck/tasks.md` — TASK-25 (수정 범위·메모)
- `/docs/UI_GUIDE.md` '앱 화면'(입력·단추·저장 실패)
- `/src/lib/analytics/dates.ts`
- 이전 step에서 만든 파일:
  - `supabase/migrations/20261030000000_precheck_settings.sql`(`message_templates`, 제약: 이름 1~30자·내용 1~2000자·`kind` `injection`/`followup`·`sort_order` 0~99), `src/lib/storage/claimSettings.ts`, `src/components/settings/SettingsPage.tsx` (Phase 2 Step 5)
  - `src/lib/precheck/settingsChanged.ts`(`templates` 포함) (Phase 2 Step 5)
  - `scripts/precheck/golden/*` (원본 스크립트 꺼내기 방식)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 브랜치 `main`, 폴더 `YangjiBareun_사전점검/`, 커밋 `2a1069b` (README 1.24.5)
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 이 사본은 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다(GitHub 비교로 확인). 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`·`*Tests.cs`)은 모두 가짜 자료다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `assets/message_templates.html` (`TPLS`의 `jusa`·`jinryo`, `<<DATE>>` → `dateLine()`)

## 승인된 목업 (화면 step)

- 화면 10 '설정'(`id="v-config"` 부분)
- 화면 8 '환자 연락'(`id="v-contact"` 부분)

- 화면은 승인된 목업 https://claude.ai/artifact/499cp2Sodph7jYJ4gX4exj (위 화면 번호)과 같게 만든다(배치·문구·상태). 명세의 화면 AC는 내용만 정하고 배치·문구는 목업이 정한다
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/48cae04e-0cd2-4603-a1ad-b361628f7242/scratchpad/mockup/index.html` — 화면마다 `<section class="screen" id="v-…">` 한 덩어리다. 사본이 없으면 artifact 읽기 도구(`read_artifact`, slug `499cp2Sodph7jYJ4gX4exj`)로 읽는다. 둘 다 안 되면 `blocked`(사유: 승인 목업을 읽을 수 없음)
- 목업 안의 환자 이름·차트번호·숫자·고시 번호·오류 번호(`E-PC-101` 같은 것)는 지어낸 예시다. 오류 번호는 design.md 4-5의 것을 쓴다
- 모양 규칙은 `docs/UI_GUIDE.md` '앱 화면'(Tailwind 토큰은 `src/app/globals.css` `@theme`, 반복 모양은 `src/components/ui/classes.ts`). 목업의 inline 값을 새 색·새 크기로 만들지 않는다
- 화면 확인은 jsdom 시험으로 한다. 실제 화면 캡처는 Phase 끝에 메인 세션이 한다

## 수정 범위 (tasks.md TASK-25)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/messages/fill.ts`
  - `src/lib/messages/fill.test.ts`
  - `src/lib/messages/defaults.ts`
  - `scripts/precheck/golden/*`
  - `fixtures/precheck/golden/messages-*.json`
  - `src/components/settings/MessageTemplates.tsx`
  - `src/components/settings/MessageTemplates.test.tsx`
  - `src/components/settings/SettingsPage.tsx`
  - `src/components/common/CopyButton.tsx`
  - `src/components/common/CopyButton.test.tsx`
  - `src/lib/storage/claimSettings.ts`
  - `src/lib/storage/claimSettings.test.ts`
- Tests:
  - `src/lib/messages/fill.test.ts`
  - `src/components/settings/MessageTemplates.test.tsx`
  - `src/components/common/CopyButton.test.tsx`
  - `src/lib/storage/claimSettings.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **골든 테스트**: 같은 가짜 자료를 원본(양지바른 `2a1069b`)과 우리 함수에 넣어 결과가 순서까지 같은지 깊은 비교한다. 원본 결과는 `scripts/precheck/golden/`의 스크립트로 한 번 만들어 `fixtures/precheck/golden/<이름>.json`에 커밋한다. JS 원본은 `node:vm`으로(원본 시험 `tests/test_claim_html.py`가 스크립트를 꺼내는 방식과 같게), Python 원본은 `python3 -I`로 돌린다. 골든 파일 머리에 `{ "source": "seoseungkwan/shared@2a1069b", "file": …, "entry": … }`를 적는다. 일부러 다르게 한 것만 `knownDiffs`에 이유와 함께 적고, 적지 않은 차이는 실패다. 골든 시험은 원본 없이 커밋한 골든 파일과 비교해서 돈다(골든을 다시 만들 때만 `YANGJI_SRC`가 필요) (design.md 10절)
- **새 서버 경로 없음**: `app/api/*`·Route Handler·Server Action을 새로 만들지 않는다. 서버 코드는 `app/api/ai/` 하나다. 설정·건수는 브라우저가 Supabase(RLS)에 바로 읽고 쓴다 (ADR-004·018)
- **RLS와 권한**: 새 표는 RLS를 켜고, `anon`·`authenticated` 권한을 먼저 모두 회수(`revoke all`)한 뒤 design.md 8-3의 것만 준다. `hospital_id`는 DB 기본값(`public.my_hospital_id()`)으로만 들어가고 사용자가 넣거나 바꿀 수 없다. 승인 안 된 병원은 아무 줄도 못 본다. PGlite 시험으로 증명한다 (CLAUDE.md 보안 규칙, design.md 8절)
- **오류 문구 한 곳**: 오류 안내는 `src/lib/errors.ts`('무엇이 · 어떻게 고치나 · 번호'), 번호 타입은 `src/types/errors.ts`. 새 번호는 design.md 4-5 목록에서 고른다. 화면에 원래 오류 내용(예외 메시지·스택·도우미가 준 글)을 보이지 않는다 (CLAUDE.md)
- **날짜는 한 곳**: 날짜 계산은 `src/lib/analytics/dates.ts`(한국 날짜, `YYYY-MM-DD`). 시험은 `TZ=Asia/Seoul`에서 돈다 (CLAUDE.md)
- **원본은 저장소 밖**: 원본 경로는 `YANGJI_SRC` 환경 변수나 스크립트 인자로만 받는다. 원본 파일 자체(예: `mx999_v22.html`)를 저장소에 복사·커밋하지 않는다. 커밋하는 것은 옮긴 코드, 옮긴 표, 골든 결과, design.md 10절이 정한 원본 SQL 사본뿐이다 (tasks.md 머리말)

## 작업

### 1. 채우기·기본값
```ts
// src/lib/messages/fill.ts
export function fillTemplate(body: string, date: string /* YYYY-MM-DD */): string   // <<DATE>> → "* M월 D일 X요일 *", [*1*]·[*2*] 그대로
// src/lib/messages/defaults.ts
export const DEFAULT_TEMPLATES: { kind: 'injection' | 'followup'; name: string; body: string; sort_order: number }[]   // 원본 TPLS jusa → injection, jinryo → followup
```
- 요일·날짜는 `dates.ts`로. 골든: `scripts/precheck/golden/messages.mjs`가 `message_templates.html`의 `dateLine`·채우기를 `node:vm`에서 고정 날짜 몇 개로 돌려 `fixtures/precheck/golden/messages-*.json`에
- 목업의 `{이름}`·`{병원}` 같은 자리 표시는 예시다. 채우기 규칙은 AC-025.1(원본 `<<DATE>>`·`[*1*]`·`[*2*]`)을 따른다

### 2. 저장 (`src/lib/storage/claimSettings.ts`에 더함)
```ts
export async function readTemplates(sb): Promise<Template[]>          // 줄이 없으면 [] (화면이 DEFAULT_TEMPLATES를 보인다)
export async function saveTemplates(sb, before: Template[], after: Template[]): Promise<void>   // 더하기·고치기·지우기·순서. 실패 → E-SETTINGS-FAILED
```
- `hospital_id`·`id`·`updated_at`은 보내지 않는다(DB 기본값). 지우기는 `message_templates`에 delete 권한이 있다

### 3. 화면 (목업 화면 10 '문자 문구' 칸)
- `MessageTemplates.tsx`: 정기 주사·F/U 문구 목록, [문구 더하기], 고치기, 지우기, 순서 바꾸기(위·아래), [저장]. 저장 실패면 값 유지 + 오류 카드 + [다시 저장]. 이름 1~30자·내용 1~2000자를 저장 전에 화면에서도 검사
- `SettingsPage.tsx`: '병원 문구'·'상병 연결표' 다음 자리에 끼운다
- `CopyButton.tsx`(공용): `navigator.clipboard.writeText` → "복사했어요". 실패하면 글을 골라 둔 상태로 안내. 문자 발송 기능은 없다. TASK-26(환자 연락)·TASK-31(보고 문장)이 같이 쓴다

### 4. 시험
- `fill.test.ts`(AC-025.1, 골든 비교 포함), `MessageTemplates.test.tsx`(jsdom: 기본값 보임·더하기·지우기·순서·저장 실패: AC-025.2·025.4), `CopyButton.test.tsx`(가짜 clipboard: AC-025.3), `claimSettings.test.ts`(문구 읽기·저장·`hospital_id` 안 보냄)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.3 chrome.runtime이 없으면 no-extension', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-25 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-25 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/lib/messages/fill.test.ts src/components/settings/MessageTemplates.test.tsx src/components/common/CopyButton.test.tsx src/lib/storage/claimSettings.test.ts
npx vitest run supabase/precheck.rls.test.ts                 # message_templates 제약·권한 그대로
python3 ~/.claude/harness/bin/tdd-run TASK-25 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-025.1 ~ AC-025.4이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/precheck-5-contact/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 문자 보내기(SMS API·외부 서비스·`sms:` 링크 자동 열기)를 만들지 마라. 이유: 자동 발송은 범위 밖이다. 복사만 한다(AC-025.3, requirements '범위 밖')
- 문구에 환자 이름·전화를 채워 서버에 저장하지 마라. 이유: `message_templates`에는 병원 문구 틀만 간다. 환자 값은 그 PC 화면에서만
- 문구를 브라우저 저장소에 임시로 두지 마라. 이유: 저장 실패면 화면에 값을 두고 [다시 저장]을 보인다(ARCHITECTURE '상태 관리')
- 화면을 목업과 다른 배치·문구로 새로 짓지 마라. 이유: 화면은 승인된 목업대로(CLAUDE.md CRITICAL)
- 기존 테스트를 깨뜨리지 마라. 이유: 규칙 설정·병원 문구 칸 시험이 계속 통과해야 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다

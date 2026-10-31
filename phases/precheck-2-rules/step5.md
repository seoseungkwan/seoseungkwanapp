# Step 5: rule-settings

> **TASK-12** 규칙 설정 (DB · 저장 · 설정 화면 규칙 칸) · **REQ-012** · AC-012.1 ~ AC-012.7
> Phase 2 `precheck-2-rules` · Step 5 — `docs/precheck/plan.md` §6
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-12 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-012에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-012.1**: 마이그레이션 `20261030000000_precheck_settings.sql`을 PGlite로 돌리면 `claim_rule_settings`·`claim_hospital_settings`·`message_templates`에 RLS가 켜져 있고 `anon`·`authenticated` 권한을 먼저 모두 회수한 뒤 design.md 8-3의 것만 준다. `my_hospital_id()`·`touch_updated_at()`는 `security definer`·`search_path = ''`이고 `authenticated`만 부를 수 있다
- **AC-012.2**: `anon`은 세 표 읽기·쓰기가 모두 거부. 승인 안 된 병원(`pending`·`rejected`)의 사용자는 아무 줄도 안 보이고 넣기가 거부
- **AC-012.3**: 승인된 사용자는 자기 병원 줄만 보고 고친다. `hospital_id`·`updated_at`을 직접 넣거나 바꾸면 거부, `hospital_id`는 DB 기본값으로만. 남의 병원 줄은 안 보인다
- **AC-012.4**: 제약: 규칙 ID 모양이 아님, 등급이 `확인필요`·`알림`·`참고`가 아님, 문구 jsonb가 object가 아니거나 256KB 이상, 문자 문구 이름 1~30자·내용 1~2000자 밖, 종류가 `injection`·`followup`이 아님 → 거부
- **AC-012.5**: `lib/storage/claimSettings.ts`가 규칙 설정 줄들을 원본 저장 모양 `{schema: 1, off, on, grade}`로 바꿔 주고, 쓰면 바뀐 줄만 upsert. 실패하면 값을 그대로 두고 `E-SETTINGS-FAILED`
- **AC-012.6**: 설정 화면 `/settings`의 '점검 규칙' 칸: 규칙마다 ID·제목·분야·기본 등급·근거(고시 번호)와 켜기·끄기·등급 고르기, [저장]은 바뀐 것만, [기본값으로]는 그 규칙 줄을 지운다. 탭 줄의 [설정]이 `/settings` 링크
- **AC-012.7**: `settingsChanged(a, b)`: 규칙·병원 문구·상병 연결표·문자 문구 중 하나라도 다르면 `true`(순서만 다른 것은 같다)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·020·021·022
- `/docs/precheck/plan.md` §6 (Phase·Step 순서)
- `/specs/precheck/requirements.md` — REQ-012
- `/specs/precheck/design.md` — 8-1절(설정 표 SQL), 8-3절(권한), 6-5절(설정이 바뀌었을 때), 7절 표 '설정', 15절(설정 표 모양·상병 연결표)
- `/specs/precheck/tasks.md` — TASK-12 (수정 범위·메모)
- `/supabase/migrations/20261028000000_auth.sql` (`hospitals` 표, 승인 상태)
- `/supabase/rls.test.ts` (PGlite로 Supabase 흉내 내는 방식 — 그대로 따른다)
- `/src/lib/supabase/browser.ts`, `/src/types/db.ts`
- `/docs/UI_GUIDE.md` '앱 화면'(표·칩·단추·저장 실패)
- `/src/components/shell/menu.ts`, `/src/components/shell/shell.test.tsx`
- 이전 step에서 만든 파일:
  - `src/workers/precheck.worker.ts`의 `ruleList` 메시지 (Step 2: 규칙 목록을 Worker로 받는다)
  - `src/lib/precheck/rules/*`(`RuleSettings` 모양) (Step 3)
  - `src/lib/precheck/dx/*`(`DxLink`) (Step 4)
  - `src/app/(app)/claim/setup/page.tsx`, `src/components/claim/setup/*` (Phase 1 Step 6: 안쪽 탭 '비트 연결')

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 브랜치 `main`, 폴더 `YangjiBareun_사전점검/`, 커밋 `2a1069b` (README 1.24.5)
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 이 사본은 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다(GitHub 비교로 확인). 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`·`*Tests.cs`)은 모두 가짜 자료다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `assets/mx999_v22.html`의 규칙 설정 저장 모양(`off`·`on`·`grade`, `schema`)
  - `tools/claim_hospital_settings.js` (병원 설정 모양 — `claim_hospital_settings.phrases`가 이 모양 그대로)

## 승인된 목업 (화면 step)

- 화면 10 '설정'(`id="v-config"` 부분)
- 화면 1 '설치·연결 확인'(`id="v-setup"` 부분)

- 화면은 승인된 목업 https://claude.ai/artifact/499cp2Sodph7jYJ4gX4exj (위 화면 번호)과 같게 만든다(배치·문구·상태). 명세의 화면 AC는 내용만 정하고 배치·문구는 목업이 정한다
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/48cae04e-0cd2-4603-a1ad-b361628f7242/scratchpad/mockup/index.html` — 화면마다 `<section class="screen" id="v-…">` 한 덩어리다. 사본이 없으면 artifact 읽기 도구(`read_artifact`, slug `499cp2Sodph7jYJ4gX4exj`)로 읽는다. 둘 다 안 되면 `blocked`(사유: 승인 목업을 읽을 수 없음)
- 목업 안의 환자 이름·차트번호·숫자·고시 번호·오류 번호(`E-PC-101` 같은 것)는 지어낸 예시다. 오류 번호는 design.md 4-5의 것을 쓴다
- 모양 규칙은 `docs/UI_GUIDE.md` '앱 화면'(Tailwind 토큰은 `src/app/globals.css` `@theme`, 반복 모양은 `src/components/ui/classes.ts`). 목업의 inline 값을 새 색·새 크기로 만들지 않는다
- 화면 확인은 jsdom 시험으로 한다. 실제 화면 캡처는 Phase 끝에 메인 세션이 한다

## 수정 범위 (tasks.md TASK-12)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `supabase/migrations/20261030000000_precheck_settings.sql`
  - `supabase/precheck.rls.test.ts`
  - `src/lib/storage/claimSettings.ts`
  - `src/lib/storage/claimSettings.test.ts`
  - `src/lib/precheck/settingsChanged.ts`
  - `src/lib/precheck/settingsChanged.test.ts`
  - `src/types/db.ts`
  - `src/types/precheck.ts`
  - `src/components/settings/RuleSettings.tsx`
  - `src/components/settings/RuleSettings.test.tsx`
  - `src/components/settings/SettingsPage.tsx`
  - `src/app/(app)/settings/page.tsx`
  - `src/app/(app)/settings/page.test.tsx`
  - `src/components/shell/menu.ts`
  - `src/components/shell/shell.test.tsx`
  - `src/lib/errors.ts`
  - `src/types/errors.ts`
  - `src/lib/errors.test.ts`
- Tests:
  - `supabase/precheck.rls.test.ts`
  - `src/lib/storage/claimSettings.test.ts`
  - `src/lib/precheck/settingsChanged.test.ts`
  - `src/components/settings/RuleSettings.test.tsx`
  - `src/app/(app)/settings/page.test.tsx`
  - `src/components/shell/shell.test.tsx`
  - `src/lib/errors.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **RLS와 권한**: 새 표는 RLS를 켜고, `anon`·`authenticated` 권한을 먼저 모두 회수(`revoke all`)한 뒤 design.md 8-3의 것만 준다. `hospital_id`는 DB 기본값(`public.my_hospital_id()`)으로만 들어가고 사용자가 넣거나 바꿀 수 없다. 승인 안 된 병원은 아무 줄도 못 본다. PGlite 시험으로 증명한다 (CLAUDE.md 보안 규칙, design.md 8절)
- **새 서버 경로 없음**: `app/api/*`·Route Handler·Server Action을 새로 만들지 않는다. 서버 코드는 `app/api/ai/` 하나다. 설정·건수는 브라우저가 Supabase(RLS)에 바로 읽고 쓴다 (ADR-004·021)
- **비밀값**: 키·토큰 값을 코드·시험 이름·로그·출력에 남기지 않는다. `NEXT_PUBLIC_*`에 비밀값을 넣지 않는다. service role 키를 두지 않는다 (CLAUDE.md 보안 규칙)
- **오류 문구 한 곳**: 오류 안내는 `src/lib/errors.ts`('무엇이 · 어떻게 고치나 · 번호'), 번호 타입은 `src/types/errors.ts`. 새 번호는 design.md 4-5 목록에서 고른다. 화면에 원래 오류 내용(예외 메시지·스택·도우미가 준 글)을 보이지 않는다 (CLAUDE.md)
- **환자 자료 구역 울타리**: `src/lib/bridge`·`src/lib/precheck`·`src/workers`(그리고 기존 `lib/parsers`·`lib/analytics`·`lib/payload`)에서는 네트워크(`fetch`·`XMLHttpRequest`·`WebSocket`·`EventSource`·`sendBeacon`), `console`, 브라우저 저장소(`localStorage`·`sessionStorage`·`indexedDB`), React·Next·supabase·`lib/auth`·`lib/storage` import, JSX를 쓰지 않는다. 동적 `import()`는 글자로 고정한 경로만 쓴다. `eslint.config.mjs`가 막고 `src/guardrails.test.ts`가 증명한다. 이 울타리를 풀거나 `eslint-disable`로 피하지 않는다 (CLAUDE.md, ADR-020)

## 작업

### 1. 마이그레이션 (`supabase/migrations/20261030000000_precheck_settings.sql`)
- design.md 8-1 SQL을 그대로 쓴다: `my_hospital_id()`·`touch_updated_at()`(둘 다 `security definer`, `set search_path = ''`, `public`·`anon`에서 실행 권한 회수, `authenticated`만), 세 표, `updated_at` 트리거
- 표마다: `enable row level security` → `revoke all … from anon, authenticated` → `grant select` + 칸 단위 `insert`·`update`(`hospital_id`·`updated_at`·`id` 제외) → 정책 `using (hospital_id = (select public.my_hospital_id()))`, `with check` 같음
- **delete 권한**: design.md 8-3대로 `claim_rule_settings`는 내 병원 줄만 `delete`를 준다([기본값으로], AC-012.6). 다른 병원 줄은 지울 수 없음을 시험으로 증명한다
- 운영자가 SQL 편집기에 붙여 넣는다(auth와 같은 방식). 사용자 할 일로 남긴다(아래 참고)

### 2. RLS 시험 (`supabase/precheck.rls.test.ts`)
- `supabase/rls.test.ts`의 Supabase 흉내(역할·`auth.uid()`·기본 권한)를 그대로 쓰고, auth 마이그레이션 → 이 마이그레이션 순서로 돌린다
- AC-012.1(RLS·권한 목록·함수 속성), AC-012.2(anon 거부, pending·rejected 병원은 0줄·넣기 거부), AC-012.3(남의 병원 못 봄·못 씀, `hospital_id`·`updated_at` 직접 넣기 거부, 기본값으로 들어감), AC-012.4(제약마다 거부 사례)

### 3. 저장 (`src/lib/storage/claimSettings.ts`, 환자 자료 구역 밖)
```ts
export async function readRuleSettings(sb: SupabaseClient): Promise<RuleSettings>                 // {schema:1, off, on, grade}
export async function writeRuleSettings(sb: SupabaseClient, before: RuleSettings, after: RuleSettings): Promise<void>  // 바뀐 줄만 upsert, [기본값으로]는 delete
export async function readHospitalSettings(sb): Promise<{ phrases: object; dxLinks: DxLink[] } | null>
export async function writeHospitalSettings(sb, v: { phrases: object; dxLinks: DxLink[] }): Promise<void>
```
- 실패하면 던지는 값은 `E-SETTINGS-FAILED` 하나(원래 오류 글을 밖으로 내지 않는다)
- **병원 문구·상병 연결표 읽기·쓰기도 이 step에서 만든다.** TASK-18(병원 문구 화면) 수정 범위에 이 파일이 없다. 문자 문구(`message_templates`)는 TASK-25가 이 파일에 더한다
- `src/types/db.ts`: 세 표 줄 타입

### 4. 설정 바뀜 (`src/lib/precheck/settingsChanged.ts`)
```ts
export type SettingsBundle = { rules: RuleSettings; phrases: object | null; dxLinks: DxLink[]; templates: { kind: string; name: string; body: string; sort_order: number }[] }
export function settingsChanged(a: SettingsBundle, b: SettingsBundle): boolean   // 순서만 다른 배열은 같다
```

### 5. 화면 (목업 화면 10 '설정')
- `/settings`(`src/app/(app)/settings/page.tsx`) → `SettingsPage.tsx`: 제목 '설정', 안쪽 탭 `청구·연락 | 비트 연결`. '비트 연결'은 `/claim/setup` 링크(목업 화면 1의 자리). '청구·연락'에 패널을 차례로 둔다: 이 step은 '점검 규칙'만. 병원 문구·상병 연결표(TASK-18), 문자 문구(TASK-25), 백업(TASK-32)이 뒤에 더해진다 — 끼울 자리를 비워 둔다
- `RuleSettings.tsx`: 규칙 목록은 `precheck.worker.ts`에 `ruleList`를 보내 받는다(표 JSON을 직접 import하지 않는다 — AC-007.4). 목업처럼 묶음·등급 거르기, 줄마다 켜기·ID·제목·분야·등급 고르기·근거·바꾼 날, [저장](바뀐 것만)·[기본값으로]·[되돌리기]. 저장 실패면 값을 그대로 두고 오류 카드 + [다시 저장]. 등급은 색만이 아니라 글자로도
- `menu.ts`: [설정] `href: '/settings'`. 이렇게 하면 Phase 1의 `/claim/setup` 안쪽 탭 '청구·연락'이 저절로 링크가 된다(그 화면은 `menu.ts`의 설정 `href`를 읽는다)
- 오류 번호 `E-SETTINGS-FAILED`

### 6. 시험
- `claimSettings.test.ts`: 가짜 supabase 클라이언트로 줄 ↔ 원본 모양, 바뀐 줄만 upsert, [기본값으로] delete, 실패 → `E-SETTINGS-FAILED`(AC-012.5)
- `settingsChanged.test.ts`(AC-012.7), `RuleSettings.test.tsx`·`page.test.tsx`(jsdom, 가짜 Worker: AC-012.6), `shell.test.tsx`(설정 링크)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.3 chrome.runtime이 없으면 no-extension', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-12 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-12 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run supabase/precheck.rls.test.ts supabase/rls.test.ts                 # 새 RLS + 기존 auth RLS
npx vitest run src/lib/storage/claimSettings.test.ts src/lib/precheck/settingsChanged.test.ts src/components/settings/RuleSettings.test.tsx "src/app/(app)/settings/page.test.tsx" src/components/shell/shell.test.tsx src/lib/errors.test.ts
python3 ~/.claude/harness/bin/tdd-run TASK-12 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-012.1 ~ AC-012.7이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/precheck-2-rules/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- `hospital_id`를 화면·저장 코드에서 보내지 마라. 이유: `hospital_id`는 DB 기본값으로만 들어간다. 보내면 거부되고, 남의 병원으로 쓸 길을 여는 것이다(AC-012.3)
- 권한 회수(`revoke all`) 전에 `grant`하거나, `grant all`을 쓰지 마라. 이유: Supabase는 새 표에 모든 권한을 기본으로 준다. 먼저 회수하지 않으면 칸 단위 제한이 무의미하다(CLAUDE.md)
- service role 키나 서버 경로로 설정을 쓰지 마라. 이유: 브라우저 + RLS만 쓴다. 새 서버 경로 없음(ADR-004·021)
- 규칙 목록을 얻으려고 `rules.json`을 화면에서 import하지 마라. 이유: 표는 Worker의 `tables.ts`만 부른다(AC-007.4). `ruleList` 메시지를 쓴다
- `supabase/migrations/20261028000000_auth.sql`(기존)을 고치지 마라. 이유: 이미 운영 DB에 붙여 넣은 파일이다. 새 파일로만 더한다
- 기존 테스트를 깨뜨리지 마라. 이유: `supabase/rls.test.ts`·`shell.test.tsx`가 계속 통과해야 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다

## 참고

- 사용자 할 일(Phase 2 의원 PC 시험 전, 메인 세션이 안내): 이 마이그레이션을 Supabase SQL 편집기에 붙여 넣는다. 콘솔 클릭 순서는 채팅에 바로 적어 드린다

# Step 0: backup-settings

> **TASK-32** 백업에 설정 넣기 · **REQ-032** · AC-032.1 ~ AC-032.4
> Phase 7 `precheck-7-backup` · Step 0 — `docs/precheck/plan.md` §6
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-32 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-032에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-032.1**: [백업 내려받기]는 내 병원의 `claim_rule_settings`·`claim_hospital_settings`·`message_templates` 줄을 브라우저에서 읽어 `{version, made_at, tables: {…}}` JSON 파일 하나로 내려받는다. 표 목록은 `lib/backup/tables.ts` 한 곳(다른 표는 나중에 더함). 건수 표는 넣지 않는다(다시 계산됨)
- **AC-032.2**: 백업 JSON으로 `restoreSql(backup)`이 만든 SQL을 빈 DB(PGlite, 같은 마이그레이션)에 운영자처럼 돌리면 같은 줄이 되살아난다(되돌려 넣기 시험)
- **AC-032.3**: 백업 파일에는 설정 표 칸만 있고 환자 정보·건수·기관기호가 없다
- **AC-032.4**: 읽기 실패면 파일을 만들지 않고 `E-BACKUP-FAILED`

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·017·018·019
- `/docs/precheck/plan.md` §6 (Phase·Step 순서)
- `/specs/precheck/requirements.md` — REQ-032
- `/specs/precheck/design.md` — 7절 표 '설정'([백업 내려받기]), 8-1·8-3절(설정 표·권한)
- `/specs/precheck/tasks.md` — TASK-32 (수정 범위·메모)
- `/docs/ADR.md` ADR-005(백업은 브라우저에서 JSON 하나, 되살리기는 SQL)
- `/supabase/rls.test.ts`, `/supabase/precheck.rls.test.ts` (PGlite 흉내 방식)
- `/docs/UI_GUIDE.md` '앱 화면'
- 이전 step에서 만든 파일:
  - `supabase/migrations/20261030000000_precheck_settings.sql`, `supabase/migrations/20261030000100_precheck_counts.sql` (Phase 2·3)
  - `src/lib/storage/claimSettings.ts`, `src/components/settings/SettingsPage.tsx`(점검 규칙·병원 문구·상병 연결표·문자 문구 칸) (Phase 2·3·5)
  - `src/types/db.ts`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 승인된 목업 (화면 step)

- 화면 10 '설정'(`id="v-config"` 부분)

- 화면은 승인된 목업 https://claude.ai/artifact/499cp2Sodph7jYJ4gX4exj (위 화면 번호)과 같게 만든다(배치·문구·상태). 명세의 화면 AC는 내용만 정하고 배치·문구는 목업이 정한다
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/48cae04e-0cd2-4603-a1ad-b361628f7242/scratchpad/mockup/index.html` — 화면마다 `<section class="screen" id="v-…">` 한 덩어리다. 사본이 없으면 artifact 읽기 도구(`read_artifact`, slug `499cp2Sodph7jYJ4gX4exj`)로 읽는다. 둘 다 안 되면 `blocked`(사유: 승인 목업을 읽을 수 없음)
- 목업 안의 환자 이름·차트번호·숫자·고시 번호·오류 번호(`E-PC-101` 같은 것)는 지어낸 예시다. 오류 번호는 design.md 4-5의 것을 쓴다
- 모양 규칙은 `docs/UI_GUIDE.md` '앱 화면'(Tailwind 토큰은 `src/app/globals.css` `@theme`, 반복 모양은 `src/components/ui/classes.ts`). 목업의 inline 값을 새 색·새 크기로 만들지 않는다
- 화면 확인은 jsdom 시험으로 한다. 실제 화면 캡처는 Phase 끝에 메인 세션이 한다

## 수정 범위 (tasks.md TASK-32)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/backup/tables.ts`
  - `src/lib/backup/backup.ts`
  - `src/lib/backup/backup.test.ts`
  - `src/lib/backup/restoreSql.ts`
  - `src/lib/backup/restoreSql.test.ts`
  - `supabase/backup.test.ts`
  - `src/components/settings/BackupButton.tsx`
  - `src/components/settings/BackupButton.test.tsx`
  - `src/components/settings/SettingsPage.tsx`
  - `src/lib/errors.ts`
  - `src/types/errors.ts`
  - `src/lib/errors.test.ts`
- Tests:
  - `src/lib/backup/backup.test.ts`
  - `src/lib/backup/restoreSql.test.ts`
  - `supabase/backup.test.ts`
  - `src/components/settings/BackupButton.test.tsx`
  - `src/lib/errors.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **새 서버 경로 없음**: `app/api/*`·Route Handler·Server Action을 새로 만들지 않는다. 서버 코드는 `app/api/ai/` 하나다. 설정·건수는 브라우저가 Supabase(RLS)에 바로 읽고 쓴다 (ADR-004·018)
- **RLS와 권한**: 새 표는 RLS를 켜고, `anon`·`authenticated` 권한을 먼저 모두 회수(`revoke all`)한 뒤 design.md 8-3의 것만 준다. `hospital_id`는 DB 기본값(`public.my_hospital_id()`)으로만 들어가고 사용자가 넣거나 바꿀 수 없다. 승인 안 된 병원은 아무 줄도 못 본다. PGlite 시험으로 증명한다 (CLAUDE.md 보안 규칙, design.md 8절)
- **비밀값**: 키·토큰 값을 코드·시험 이름·로그·출력에 남기지 않는다. `NEXT_PUBLIC_*`에 비밀값을 넣지 않는다. service role 키를 두지 않는다 (CLAUDE.md 보안 규칙)
- **오류 문구 한 곳**: 오류 안내는 `src/lib/errors.ts`('무엇이 · 어떻게 고치나 · 번호'), 번호 타입은 `src/types/errors.ts`. 새 번호는 design.md 4-5 목록에서 고른다. 화면에 원래 오류 내용(예외 메시지·스택·도우미가 준 글)을 보이지 않는다 (CLAUDE.md)

## 작업

### 1. 표 목록 (`src/lib/backup/tables.ts`)
```ts
export const BACKUP_TABLES = [
  { name: 'claim_rule_settings', columns: ['hospital_id', 'rule_id', 'enabled', 'grade', 'updated_at'] },
  { name: 'claim_hospital_settings', columns: ['hospital_id', 'phrases', 'dx_links', 'updated_at'] },
  { name: 'message_templates', columns: ['id', 'hospital_id', 'kind', 'name', 'body', 'sort_order', 'updated_at'] },
] as const   // 건수 표(claim_day_counts 등)는 넣지 않는다. 다른 기능 표는 나중에 여기 더한다
```

### 2. 백업 (`src/lib/backup/backup.ts`)
```ts
export async function makeBackup(sb: SupabaseClient, now: () => string): Promise<{ version: 1; made_at: string; tables: Record<string, unknown[]> }>  // 실패 → E-BACKUP-FAILED
```
- 표마다 `select(정해 둔 칸)`만(`*` 금지). RLS가 내 병원 줄만 준다. 하나라도 실패하면 파일을 만들지 않는다(AC-032.4)

### 3. 되돌려 넣기 SQL (`src/lib/backup/restoreSql.ts`)
```ts
export function restoreSql(backup: unknown): string   // 모양 검사 → 표마다 insert … on conflict do update
```
- 운영자가 SQL 편집기(관리 권한)에서 돌린다(되살리기 화면은 범위 밖). 값은 SQL 글자로 안전하게 감싼다(작은따옴표 두 번·`$tag$` 따옴표 등). `jsonb`는 `'…'::jsonb`
- 모르는 표·칸이 있으면 SQL을 만들지 않고 던진다

### 4. 화면 (목업 화면 10 '백업' 칸)
- `BackupButton.tsx`: [백업 내려받기] → `makeBackup` → `Blob` → `a[download]`(파일 이름 예: `backup-2026-10-30.json`, 기관기호·병원 이름 넣지 않음). 실패면 오류 카드 `E-BACKUP-FAILED`. 안내 글은 목업대로("…환자 정보는 들어가지 않아요")
- `SettingsPage.tsx`: '청구·연락' 마지막 자리에 '백업' 칸
- 오류 번호 `E-BACKUP-FAILED`

### 5. 시험
- `backup.test.ts`(가짜 supabase: 칸·표 목록·건수 표 없음·실패 → 파일 없음: AC-032.1·032.4), `restoreSql.test.ts`(따옴표·jsonb·모르는 칸 거절)
- `supabase/backup.test.ts`(AC-032.2): PGlite에 auth + 설정 + 건수 마이그레이션 → 가짜 병원 줄 넣기 → 백업 모양 만들기 → 새 빈 PGlite에 같은 마이그레이션 → `restoreSql` 실행(운영자 역할) → 줄이 같다
- AC-032.3: 백업 JSON에 정해 둔 칸 밖 키·건수 표·기관기호 모양(8자리 숫자 칸)이 없다
- `BackupButton.test.tsx`(jsdom)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.3 chrome.runtime이 없으면 no-extension', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-32 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-32 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/lib/backup/backup.test.ts src/lib/backup/restoreSql.test.ts supabase/backup.test.ts src/components/settings/BackupButton.test.tsx src/lib/errors.test.ts
npx vitest run supabase/precheck.rls.test.ts supabase/rls.test.ts
python3 ~/.claude/harness/bin/tdd-run TASK-32 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-032.1 ~ AC-032.4이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/precheck-7-backup/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 백업에 건수 표·환자 자료·기관기호를 넣지 마라. 이유: 백업 파일은 PC 밖으로 옮겨질 수 있다. 설정 표만(AC-032.1·032.3)
- `select('*')`로 표를 읽지 마라. 이유: 나중에 칸이 늘면 모르는 값이 백업에 섞인다. 정해 둔 칸만
- 되살리기 화면이나 서버 경로를 만들지 마라. 이유: 되살리기는 SQL로만(ADR-005), 새 서버 경로 없음(ADR-004)
- 값을 이스케이프 없이 SQL에 이어 붙이지 마라. 이유: 병원 문구에 따옴표가 있으면 SQL이 깨지거나 다른 문장이 돈다
- 기존 테스트를 깨뜨리지 마라. 이유: 설정 화면 시험과 RLS 시험이 계속 통과해야 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다

## 참고

- Phase 7(마지막 Phase)의 마지막 step이다. 메인 세션이 할 일: `verify` → 화면 캡처 → 쉬운 말 보고 → `sdd status precheck`로 빠진 AC가 없는지 → PR 흐름(harness.md 7번, CodeRabbit 리뷰 포함)은 사용자 지시에 따라

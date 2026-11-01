# Step 4: screen

> **TASK-10** 업무일지 화면 · **REQ-010** · AC-010.1 ~ AC-010.16
> Phase 2 `worklog-2-screen` · Step 4 — `specs/worklog/tasks.md`
> 명세 `specs/worklog/`는 승인됐다. 이 step은 TASK-10 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/worklog/requirements.md`의 REQ-010에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-010.1**: 받은 오늘의 양식으로 열림, 다 읽기 전 칸 읽기 전용 + "불러오는 중이에요"
- **AC-010.2**: 서버 줄 없는 날(일요일·휴일 포함) → 빈 양식, 적기 전에는 저장 안 부름
- **AC-010.3**: 모든 입력 칸 → 자동 칸 바로 다시 계산, 막힌 칸 바로 빨강, 자동 저장에 그날 값(서버로는 바뀐 칸만)
- **AC-010.4**: 날짜 옮김 → 기다리던 저장 바로 시작, 처음 여는 날은 읽는 동안 잠금, 이미 연 날은 화면 값을 바로 보이고 잠그지 않은 채 다시 읽기. 다시 보일 때·보이는 동안 60초마다도 다시 읽기(실시간 연결 없음), 늦은 옛 응답 버림
- **AC-010.5**: 자정 넘김(30초마다·다시 보일 때) — 옛 오늘을 보고 있었으면 새 날 양식(양식에 초점 있으면 나간 뒤), 지난 날이면 그대로 + 최대만 바뀜
- **AC-010.6**: 저장 안 된 값 → `beforeunload` 확인, `visibilitychange` hidden → 바로 저장, `online` → 바로 저장
- **AC-010.7**: 터치 기기(`(hover: none) and (pointer: coarse)`) → 보기만(저장 없음), 업무사항·고친 항목 이름 보임, 다시 읽기도 함. 폭은 배치만
- **AC-010.8**: 불러오기 실패 → 읽기 전용 + [다시 불러오기]
- **AC-010.9**: [인쇄] → 기다리던 저장 시작 + `window.print()`
- **AC-010.10**: 좁은 PC 창(768px 미만, 마우스) → 그대로 고칠 수 있음
- **AC-010.11**: 앱 안 이동(화면이 내려감) → 바로 저장 시작, 자동 저장 제어는 모듈에 남아 저장·다시 하기를 이어 감, 돌아오면 저장 안 된 값·상태 그대로 — "앱 안 이동 = 바로 저장"
- **AC-010.12**: 로그아웃(`SIGNED_OUT`, 30분 자동 로그아웃 포함) → 떠나기 확인 안 걸림, 화면 값 지움, 자동 저장 제어 멈춤, 그 뒤 온 읽기 응답 버림
- **AC-010.13**: 다시 읽은 값 → 저장 안 된 칸·초점 칸 빼고 반영, 자동 칸 다시 계산, 반영만으로는 저장 안 부름, 빠진 칸은 다음 때 반영
- **AC-010.14**: 다시 읽기 실패 → 오류 카드 없이 조용히 넘기고 값 유지, 다음 때 다시. 읽기 시작 뒤 그 날 저장이 오갔으면 응답 버림
- **AC-010.15**: 지난 날도 오늘과 똑같이 고침(잠금 없음), 고친 사람·시각 안 보임
- **AC-010.16**: 첫 읽기 중 그 날 저장이 오감 → 응답 반영 안 함, 칸 잠근 채 다시 읽음

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·019와 끝의 업무일지 ADR(Phase 1 Step 0이 더함)
- `/specs/worklog/requirements.md` — REQ-010
- `/specs/worklog/design.md` — 11-3절(WorklogScreen·useWorklogDay·다시 읽기), 10절(자동 저장·`serverDay`), 9절(읽기·저장), 17절(위험 — 자정 넘김 중 입력)
- `/specs/worklog/tasks.md` — 이 TASK의 수정 범위·메모
- 승인된 시안 `/docs/mockups/worklog/index.html` (화면 step이면 꼭)
- `/docs/UI_GUIDE.md` — '업무일지 양식(엑셀 예외)'(Phase 1 Step 0), '공통 모양'(`ds`)·'오류 카드'·'휴대폰'·'문구'(말끝 "~요")
- `/src/components/worklog/WorklogSheet.tsx`·`WorklogToolbar.tsx` (Step 2·3)
- `/src/lib/worklog/autosave.ts`·`cellText.ts`·`notes.ts`·`days.ts`, `/src/lib/storage/worklogDays.ts` (앞 step들)
- `/src/lib/supabase/browser.ts`
- `/src/lib/analytics/dates.ts` — `todayInKorea`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-10)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/components/worklog/WorklogScreen.tsx`
  - `src/components/worklog/WorklogScreen.test.tsx`
  - `src/components/worklog/useWorklogDay.ts`
  - `src/components/worklog/useWorklogDay.test.tsx`
  - `src/components/worklog/worklogSession.ts`
  - `src/components/worklog/worklogSession.test.ts`
- Tests:
  - `src/components/worklog/WorklogScreen.test.tsx`
  - `src/components/worklog/useWorklogDay.test.tsx`
  - `src/components/worklog/worklogSession.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **업무사항도 같은 길이다**: 모든 칸을 `autosave.change`로 넘긴다. 브라우저 저장소를 쓰지 않는다. 서버로 가는 칸을 고르는 일은 자동 저장·저장소가 한다(바뀐 칸만, 막는 모양 뺌)
- **다시 읽기가 치던 글을 빼앗지 않는다**: 초점 칸·저장 안 된 칸은 건드리지 않고, 반영은 저장을 부르지 않는다
- **저장 안 된 값을 잃지 않는다**: 화면 값은 React 상태에 남고, 실패는 상태 글·오류 카드로 보이며, 떠날 때 확인을 묻는다
- 불러오기 전·실패 때 칸을 열지 않는다(빈 양식이 서버 값을 덮어쓰지 않게)
- 휴대폰은 보기만: **터치 기기**(`(hover: none) and (pointer: coarse)`)에서는 `autosave.change`를 부르지 않는다. 화면 폭으로 보기만을 정하지 않는다(반쪽 창·확대한 의원 PC를 막는다)
- 앱 안 이동에서 값을 잃지 않는다: 화면이 내려갈 때 `dispose()`하지 않고 `flush()`만. 자동 저장 제어는 모듈 한 벌이다
- 로그아웃이면 공용 PC 화면에 일지를 남기지 않는다: 떠나기 확인을 떼고 화면 값을 지운다(`IdleLogout`의 `/login` 이동이 막히지 않게)
- 오늘은 `todayInKorea()`(한국 날짜)로만 구한다

## 작업

```tsx
'use client'
export function WorklogScreen({ initialToday }: { initialToday: string }): JSX.Element
// worklogSession.ts — 모듈 한 벌(화면이 내려가도 남는다)
export function worklogAutosave(): ReturnType<typeof createAutosave>   // 처음 부를 때 만든다. save = (ymd, changes) => saveWorklogDay(supabaseBrowser(), ymd, changes)
export function startWorklogSession(): () => void                       // beforeunload·online·SIGNED_OUT 듣기를 한 번만 건다. 돌려준 함수는 시험 정리용
export function onWorklogSignedOut(listener: () => void): () => void    // 화면이 값 지우기를 걸어 둔다
// useWorklogDay.ts — 날짜별 화면 값·읽기 상태(요청 번호로 늦은 응답 버리기). pendingDay가 있으면 먼저 그것
export function useWorklogDay(ymd: string, load: (ymd: string) => Promise<WorklogDay | null>, focusKey: () => WorklogCellKey | null): {
  status: 'loading' | 'ready' | 'error'; day: WorklogDay
  setCell(k: WorklogCellKey, v: string): WorklogDay
  refresh(): void; reload(): void; clear(): void
}
```
- 조립: 감싸개 안에 `WorklogToolbar` → `WorklogSheet`(사이 12px `gap-3`). 감싸개 폭은 시안 `.work`의 737px(양식 689 + 종이 안쪽 24 × 2) 가운데 → `mx-auto w-full max-w-184.25`(Tailwind 4px 단위, 대괄호 값 금지 규칙 때문). 이 파일은 `sheet.module.css`를 불러오지 않는다(예외는 `WorklogSheet.tsx` 하나). 상태 글은 `autosave.snapshot()`·읽기 상태로 정한다(저장·불러오기 실패 > 끊김 > 저장 중 > 불러오는 중 > 막힌 칸 > 저장됨 > 아직 안 적음. 이 화면에서 아직 저장한 적이 없으면 '아직 안 적음' = "적으면 바로 저장돼요"). `blockedYmd`는 `snapshot().blocked?.ymd`, `blockedCells`는 `blockedCellKeys(day)`
- 자동 저장: 화면은 `worklogAutosave()`를 `subscribe`해 그리고, 내려갈 때(언마운트) **`flush()`만** 부르고 구독만 뗀다. `dispose()`는 로그아웃 때만(`worklogSession`)
- 처음 읽기: 읽기 전 `autosave.revision(ymd)`를 기억한다. 응답 때 같으면 `autosave.serverDay(ymd, 서버 값, null)`에 넘겨 받은 하루로 화면 값을 정한다(`known`이 여기서 정해진다). **달라졌으면 그 응답을 넘기지 않고 `loading`을 유지한 채 바로 다시 읽는다**(앱 안 이동 뒤 돌아와 읽는 중 저장·재시도가 끝난 경우. 옛 응답을 넘기면 방금 저장한 칸과 `known`이 되돌아가고, 그냥 버리면 `loading`에 갇힌다)
- **다시 읽기**(`refresh`): 이미 연 날로 돌아올 때, `visibilitychange`(보임), 보이는 동안 `setInterval(60_000)`. `ready`인 날만. 칸을 잠그지 않는다. 읽기 전 `autosave.revision(ymd)`를 기억해 응답 때 달라졌으면 버리고, 요청 번호로 늦은 응답을 버린다. 받은 값은 `autosave.serverDay(ymd, 서버 값, focusKey())`의 결과로 화면 값을 바꾼다(`change`를 부르지 않는다). 실패(`WorklogStorageError` 모두)는 잡아서 아무것도 하지 않는다
- 초점 칸: `WorklogSheet`의 `onFocusCell`을 `useRef`에 둔다
- 자정: `setInterval(30_000)` + `visibilitychange`(보임) → `todayInKorea()`가 바뀌면 `dayAfterRollover`. 양식 안에 초점이 있으면 `focusout` 뒤에 옮긴다
- 보기만: `matchMedia('(hover: none) and (pointer: coarse)')` 구독. 참이면 `readOnly`. 폭(768px 미만)은 CSS 배치만. 다시 읽기는 그대로 한다
- 이벤트(`worklogSession`이 한 번 건다): `beforeunload`(hasUnsaved면 `preventDefault()` + `returnValue = ''`), `online` → `online()`, `supabaseBrowser().auth.onAuthStateChange`의 `SIGNED_OUT` → `beforeunload` 떼기 → `dispose()` → 걸어 둔 화면 지우기(`clear()`, 요청 번호를 올려 그 뒤 응답을 버린다). 화면의 `visibilitychange` hidden → `flush()`
- 시험(jsdom, `vi.mock('@/lib/storage/worklogDays')`·`vi.mock('@/lib/supabase/browser')`(가짜 `onAuthStateChange`), `vi.useFakeTimers()`, 가짜 `matchMedia`): 열 때 읽기 한 번과 잠김, 빈 날(저장 호출 0), 숫자 칸 치면 자동 칸 + 800ms 뒤 저장 호출의 인자가 **그 칸만**, 업무사항·항목 이름 치면 저장 호출에 그 칸만, 막는 모양 치면 바로 `aria-invalid`이고 저장 호출에 그 칸이 없음, 날짜 옮김 + 늦은 응답 버림, 돌아오면 칸 안 잠긴 채 다시 읽기, 60초마다 다시 읽기·안 보일 때는 안 읽음·다시 보이면 읽기, **다른 PC 값 반영(저장 안 된 칸·초점 칸은 그대로, 저장 호출 0)**, **다시 읽기 실패(오류 카드 없음, 값 유지, 다음에 다시)**, 읽기 중 저장이 오가면 응답 버림, **첫 읽기 중 저장이 끝남(치고 `unmount` → 다시 그림 → 읽기 대기 중 저장 성공 → 옛 응답 도착) → 칸은 잠긴 채 읽기가 한 번 더 불리고, 새 응답 뒤 방금 저장한 값이 칸에 있고 다음 `change`가 그 칸을 보내지 않음**, 자정 넘김 두 경우, `beforeunload` 기본 동작 막힘, 터치 기기 보기만(업무사항 보임, 다시 읽기 함), **좁은 창 + 마우스(폭 600·`hover: hover`)는 고칠 수 있음**, 지난 날 고칠 수 있음, 불러오기 실패 + 다시, [인쇄]가 `window.print` 부름, **"AC-010.11: 앱 안 이동 = 바로 저장"**(치고 300ms 뒤 `unmount()` → 저장 호출이 바로 1번, 그 저장이 `failed`여도 2초 뒤 다시 → 다시 그리면 저장 안 된 값이 칸에 있음), **"AC-010.12: 로그아웃"**(`SIGNED_OUT` 흉내 → `beforeunload`가 기본 동작을 막지 않음, 칸·업무사항 칸이 비고, 그 뒤 온 읽기 응답이 칸을 채우지 않음)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-002.2: 수납액은 현금·카드·계좌·지역화폐만 더한다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-10 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-10 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/components/worklog/WorklogScreen.test.tsx src/components/worklog/useWorklogDay.test.tsx src/components/worklog/worklogSession.test.ts   # AC-010.1~AC-010.16
npx vitest run src/components/worklog   # 이 폴더 시험 모두
python3 ~/.claude/harness/bin/tdd-run TASK-10 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status worklog`에서 AC-010.1 ~ AC-010.16이 이 TASK의 시험과 이어져 보여야 한다

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

- `src/app/(app)/worklog/page.tsx`를 고치지 마라. 이유: 탭 연결은 TASK-12에서 준비 중 목록과 함께 바꾼다(한쪽만 바꾸면 탭 틀 시험이 깨진다)
- 저장 안 된 값을 브라우저 저장소에 임시로 두지 마라. 이유: `plan.md` §10(입력값 임시 저장은 2차), design.md 10절
- 실시간 연결(Realtime)을 쓰지 마라. 이유: 범위 밖이다(requirements.md). 60초 다시 읽기로 충분하다
- 화면 캡처용 임시 페이지·주소를 만들지 마라. 이유: 수정 범위 밖이다. 실제 화면 캡처는 TASK-12 뒤에 한다
- 언마운트 때 자동 저장 제어를 `dispose()`하지 마라. 이유: 앱 안 이동에서 800ms 안에 친 값·끊김·실패 값이 조용히 사라진다(AC-010.11)
- `IdleLogout.tsx`·`AccountMenu.tsx`를 고치지 마라. 이유: 수정 범위 밖이고 다른 화면과 겹친다. 로그아웃은 Supabase `SIGNED_OUT`을 들어 처리한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 실제 Supabase에 SQL을 실행하거나 붙여 넣지 마라(대시보드·CLI·REST 모두). 이유: DB 바꾸기는 사용자 OK가 필요하다(design.md 8절)
- 시험·고정 자료에 실제 의원 숫자(엑셀 10월 값)·환자 이름·차트번호·전화번호를 쓰지 마라. 이유: 가짜 자료만 쓴다(CLAUDE.md). 둥근 가짜 숫자(예: 100000)와 "가상" 글자를 쓴다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 Phase 1 Step 0과 사용자 승인으로만 바뀐다

# 설계: 청구 메모 학습·청구 탭 흐름 다듬기 (claim-learn)

> 요구사항: `requirements.md` (REQ-9301~9318). 시안·화면 글: `docs/mockups/claim-learn/` (`notes.md` '화면 글').
> 바탕: 운영 판 3d761090 + 도우미 0.14.1 갈래 e263e9ba(병원 고르기 창)를 합친 `feat-claim-learn`. 도우미 0.15.0, 확장 0.5.0 그대로, 새 서버 표 없음.

## 1. 큰 그림

| 묶음 | 자리 | 한 일 |
|---|---|---|
| 학습 (순수) | `src/lib/precheck/memo/learn.ts` (새) | 학습 모양·검사, 줄 틀 만들기·맞추기, 엔진 글 위 덧씌우기, 줄 차이(diff), 모양 고침 알아보기, 개인정보 거르기 |
| 출처 (순수) | `src/lib/precheck/memo/why.ts` (새) | 메모 줄마다 출처 찾기 |
| 건초 부위 | `src/lib/precheck/memo/engine.ts` (KK062 줄만) | 처방 수량만큼 부위, 알아볼 말 설정 |
| 설정 모양 | `src/lib/precheck/memo/phrases.ts`·`types.ts` | `learned`·`learnKinds`·`TPL.tsWords` 받기 |
| 설정 바뀜 | `src/lib/precheck/settingsChanged.ts` | `learned[].left`·`learnKinds`는 견주지 않음 |
| Worker | `src/workers/precheck/jobs.ts`(+ 타입 `src/types/precheck.ts`) | 학습 덧씌우기·쓰인 학습 알림·diff 만들기·처음 학습 종류·하루 두 번·기본 문구·복사 뒤 건수 |
| 저장 | `src/lib/storage/claimSettings.ts` | 학습 더하기·고치기·지우기·확인 수 바꾸기·확인한 종류 더하기 |
| 화면(환자 줄) | `src/components/claim/rows/` | 학습 창 보기 부분, 처음 학습 카드, 왜 이렇게 표, 빈칸 단추 |
| 화면(메모 단계) | `src/components/claim/memo/` | 학습 창 열고 저장, 확인 필요·꼬리표, 하루 두 번, 기본 문구 띠, 설정 바뀜 때 복사 막기 |
| 화면(흐름) | `src/components/claim/`·`src/components/setup/`·`src/components/settings/` | 날짜·연결·오류 고치기, 학습 탭, 건초 말 칸, 설정 주소로 탭·칸 열기 |
| 도우미 | `helper/` | `claim.month` 진료의, 등록 때 전 병원 저장 파일 보관, 판 0.15.0 |

학습은 **엔진 글 위에 덧씌운다**. 엔진(`createMemoEngine().fullText`)은 KK062 줄 말고 바꾸지 않는다. 그래서 학습이 없으면 메모 글은 지금과 한 글자도 같다(AC-9306.3·AC-9316.1). 까닭: 엔진 안 줄 꼬리표(`lineTags`)는 줄 순서·레벨·좌우 표기·문장 모드를 거친 마지막 줄과 맞지 않는다(조사 2026-11-28). 마지막 글 줄에 줄 틀로 맞추면 문장 모드에서도 같은 방식으로 된다.

## 2. 학습 모양 (서버 `claim_hospital_settings.phrases` 안)

```ts
// src/lib/precheck/memo/types.ts 에 더함
export type LearnKind = 'replace' | 'add' | 'remove'
export type LearnWhen = {
  codes: string[]      // 처방 코드(대문자). 비면 조건 끔
  regions: string[]    // 부위 키(REGION 키: lumbar·knee…). 비면 끔
  chartWords: string[] // 사람이 쓴 말, 1~5개, 말마다 1~20자
  withCodes: string[]  // 함께 한 다른 처방 코드
  doctors: string[]    // 진료의 코드
}
export type LearnRule = {
  id: string          // 'l' + 소문자 16진수 8자
  name: string        // 1~40자, 처음 값 = 조건으로 만든 이름(예 'LA358 · 허리')
  kind: LearnKind
  from: string        // replace·remove: 줄 틀(1~300자). add: ''
  to: string          // replace·add: 새 문장 틀(1~300자). remove: ''
  after: string       // add만: 앞 줄 틀(0~300자, 없으면 '')
  when: LearnWhen
  on: boolean
  left: number        // 남은 확인 0~3
  made: string        // YYYY-MM-DD (한국 날짜)
}
// Phrases 에 더함
learned?: LearnRule[]   // 300개까지
learnKinds?: string[]   // 처음 학습 확인한 종류 열쇠, 2000개까지, 열쇠마다 120자까지
// TPL 에 더함
tsWords?: string        // 건초내주사로 알아볼 차트 말, 쉼표로, 500자까지
```

- 학습 모양: 위 칸뿐이다. 환자 이름·차트번호·진료 날짜·차트 원문은 없다. `from`은 엔진 줄에서 그 진료 값을 바뀌는 칸으로 바꾼 것이고, `chartWords`는 사람이 칸에 쓴 말이다.
- `validatePhrases`(`phrases.ts:401`)가 `learned`·`learnKinds`를 맨 위 칸으로, `tsWords`를 TPL 칸으로 받는다. 모양이 틀리면 지금처럼 거절한다(칸마다 위 한도, `id` 겹침 거절, `left` 0~3 정수, `kind`별 빈 칸 규칙).
- 개인정보 거르기 `personalHit(text, forbidden: string[]): boolean`: 전화(`0\d{1,2}-?\d{3,4}-?\d{4}`)·주민번호(`\d{6}-?[1-4]\d{6}`)·메일 모양, 또는 `forbidden`(그 진료의 환자 이름·차트번호, 2자 이상) 글자가 들어 있으면 참. 저장 전 화면(rows)이 `to`·`from`·`after`·`chartWords`·`name`에 부른다 → `E-LEARN-PERSONAL`.
- 서버 저장은 `writeHospitalSettings` 길: 서버 값을 다시 읽어 `learned`만 바꿔 쓴다(설정 화면 저장과 부딪히지 않게, `merge.ts` `withPhraseChanges`와 같은 생각). 설정 줄이 없으면 `startHospitalSettings(neutralPhrases() + learned)`(AC-9310.3).
- 크기: phrases 전체가 지금 한도(`pg_column_size < 262144`, 원본 200만 자)를 넘으면 저장 전에 막는다 → notes '한도'(AC-9304.3).

## 3. 줄 틀과 바뀌는 칸 (`learn.ts`)

```ts
export type Slots = { 좌우?: string; 레벨?: string; 부위?: string }
export function slotWords(phrases: Phrases): { side: string[]; site: string[] } // 좌우 글자(Rt·Lt·both·우측·좌측·양측·Right·Left·Both + sideStyle 표기), 부위 글자(siteNames 값·RG_EN 값·REGION 한글)
export function toPattern(line: string, words): string     // 줄에서 좌우·레벨·부위 글자를 {좌우}·{레벨}·{부위}로 (레벨 = chart.ts의 레벨 모양: [CTLS]?\d+([,\-~/]\s*[CTLS]?\d+)*)
export function matchPattern(pattern: string, line: string, words): Slots | null  // 줄 전체가 맞으면 잡은 값
export function fillTemplate(to: string, slots: Slots): string // 없는 칸은 [좌우 확인]·[레벨 확인]·[부위 확인]
export function literalSlots(to: string, words): { word: string; slot: '좌우' | '레벨' | '부위' }[] // '글자 그대로' 안내용
```

- 맞추기: 틀의 글자는 그대로(정규식 특수 글자 escape), 빈칸 한 개 이상은 `\s+`, 바뀌는 칸은 그 종류 글자 묶음 하나(좌우·부위는 단어 목록, 레벨은 레벨 모양). 앞뒤 빈칸·`◈` 같은 줄 앞 표시(`TPL.mark`)는 견주기 전에 떼고, 바꾼 줄에 다시 붙인다.
- 한 줄에 같은 칸이 두 번 나오면 첫 값을 쓴다.

## 4. 덧씌우기 (`learn.ts`)

```ts
export type LearnContext = { codes: Set<string>; regions: Set<string>; chartText: string; doctors: string[]; words }
export function applyLearned(text: string, rules: LearnRule[], ctx: LearnContext, lineJoin: string | undefined): { text: string; used: string[] }
```

1. `on`이고 조건이 모두 맞는 학습만 고른다(AC-9302.3). `chartWords`는 대소문자·빈칸을 무시하고 `chartText`(그날 차트 줄을 이은 글)에서 찾는다.
2. 글을 줄로 나눈다(`lineJoin === 'oneLine'`이면 글 전체가 한 줄이고 replace만 쓴다).
3. 줄마다 맞는 replace·remove 가운데 켠 조건 수가 많은 것, 같으면 `made`가 늦은 것, 또 같으면 배열 뒤의 것 하나(AC-9302.4). replace는 `fillTemplate(to, 잡은 값)`, remove는 줄을 뺀다.
4. add는 `after` 틀과 맞는 첫 줄 바로 뒤, 없으면 끝에 더한다. 같은 글 줄이 이미 있으면 더하지 않는다.
5. `used`는 쓰인 학습 id(차례대로, 겹침 없음).

Worker: 진료마다 `fullText` 뒤에 부른다. 그 진료가 완료(`finishedKeys`)이거나 비트 메모가 이미 있으면(`memosInBit`에 글이 있음) 부르지 않는다(AC-9302.5). 화면에 가는 메모 보기(`VisitMemo`)에 `learned: { id, name, left }[]`를 더한다.

## 5. 줄 차이와 학습 창

```ts
export type LineDiff = { kind: LearnKind; old: string; new: string; before: string }
export function diffLines(auto: string, edited: string): LineDiff[] // 앞뒤 빈칸 무시, 빈 줄 무시, LCS. 붙어 있는 뺌+더함은 하나씩 짝지어 replace
export function styleChange(old: string, next: string, phrases: Phrases): StyleChange | null
export type StyleChange = { field: 'sideStyle' | 'siteNames' | 'fixedPhrases' | 'levelSep'; label: string; from: string; to: string; patch: Partial<Phrases> }
```

- Worker 메시지(화면 → Worker) `{ type: 'learnDraft'; visitKey }` → Worker가 보이던 글(엔진 + 학습)과 지금 고친 글로 `diffLines`(줄마다 바탕 엔진 줄은 5-1절 `origins`), 그 진료의 시술 코드·다른 코드·부위·진료의·`forbidden`·`slotWords`를 담아 `{ type: 'learnDraft'; visitKey; diffs; codes; withCodes; regions; doctor; forbidden; words }`로 답한다. 환자 자료 구역 안 일이라 Worker가 한다.
- 학습 창은 '저절로 학습' 띠의 [조건 바꾸기]로 연다(5-1절). 학습 창 보기 부분(`components/claim/rows/LearnDialog.tsx`)은 네트워크 없이 그리고, [저장] 때 `LearnRule[]`(줄마다 하나, 조건은 같이)를 위(`components/claim/memo/MemoPanel.tsx`)로 올린다. 위가 `saveLearned`를 부른다.
- 줄 틀: replace·remove의 `from` = `toPattern(old)`, add의 `after` = `toPattern(before)`(앞 줄 없으면 '').
- 모양 고침(AC-9303): `styleChange`가 알아보는 것은 넷뿐이다 — 좌우 표기(`sideStyle`: Rt/Lt/both ↔ 우측/좌측/양측 ↔ Right/Left/Both 바꿈만 다름), 부위 영어 표기(`siteNames` 값 하나만 다름), 고정 문구(`fixedPhrases` 글 하나만 다름), 레벨 사이 글자(`levelSep`: 레벨 사이 `,`·`-`·`/`만 다름). [모든 메모에] → `patch`만 설정에 얹어 저장(설정 화면 저장과 같은 merge 길), 그 줄은 학습에서 뺀다.
- 저장 성공이면 Worker에 `{ type: 'settings', … }`(지금 설정 갱신 길)로 새 phrases를 주고 메모를 다시 만든다.

### 5-1. 저절로 학습 (REQ-9301, 사용자 저녁 목표)

```ts
// src/lib/precheck/memo/learn.ts 에 더함 (TASK-5)
export type LineOrigin = { line: string; engine: string | null; rule: string | null } // 보이는 줄 하나: 바탕 엔진 줄(더한 줄이면 null)·쓴 학습 id
export function applyLearned(...): { text: string; used: string[]; origins: LineOrigin[] } // origins를 더함, text·used는 그대로
export function autoTemplate(next: string, slots: Slots, words): string // 새 문장에서 그 진료 값(slots)과 같은 좌우·레벨·부위 글자를 {좌우}·{레벨}·{부위}로
export function autoLearn(input: { shown: string; edited: string; origins: LineOrigin[]; when: LearnWhen; slotsOf(engineLine: string): Slots; words; phrases: Phrases; rules: LearnRule[]; forbidden: string[] }):
  { add: Omit<LearnRule, 'id' | 'made'>[]; update: { id: string; to: string }[]; style: StyleChange[]; personal: number }
```

- Worker: `editMemo`를 받아 고친 글을 저장한 **뒤**, 보이던 글(엔진 + 학습)과 고친 글로 `autoLearn`을 부르고 결과가 비어 있지 않으면 `{ type: 'learnAuto'; visitKey; add; update; style; personal }`를 화면에 보낸다. 보이던 글은 그 진료의 마지막 `fullText` + `applyLearned` 결과다.
- `autoLearn` 규칙:
  - `diffLines(shown, edited)`의 줄마다 `origins`로 바탕 엔진 줄을 찾는다.
  - replace·remove의 `from` = `toPattern(엔진 줄)`.
  - add의 `after` = `toPattern(앞 줄의 엔진 줄 또는 앞 줄)`.
  - 문장 `to` = `autoTemplate(새 줄, slotsOf(엔진 줄))`. add는 앞 줄의 값을 쓴다.
  - 옛 줄(보이던 줄)에 `\[[^\]]*확인\]`이 있으면 그 줄은 건너뛴다.
  - `styleChange`가 잡히는 줄은 학습하지 않고 `style`에 넣는다.
  - `personalHit(to·from·after, forbidden)`이면 건너뛰고 `personal`을 센다.
  - 바탕 줄이 학습이 쓴 줄(`origins.rule`)이고 그 학습의 `from`·`when`이 새 것과 같으면 `update`(그 학습 `to` 바꿈, 남은 확인 3)로, 아니면 `add`로 한다.
  - `when` = 처방 코드(그 진료 시술 코드) + 부위(그 진료 부위)이고 나머지 칸은 비운다. `on: true`, `left: 3`, `name` = 조건 이름.
- 화면(`memo/useLearned.ts`): `learnAuto`를 받으면 id·만든 날을 붙여 `saveLearned`(더하기·바꾸기 한 번에)를 부르고, 바꾸기 전 학습을 기억해 두었다가 [이번만 고친 거예요]에서 되돌린다(`revertLearned`: 더한 것은 지우고 바꾼 것은 옛 문장·남은 확인으로). 띠는 상세가 그 진료일 때만 보이고 다른 사람을 고르면 사라진다(학습은 남음).
- [조건 바꾸기]는 5절 학습 창을 그 학습들로 연다. [저장]은 그 학습들을 창에서 고른 것으로 바꾼다(`saveLearned` 바꾸기).
- 저장 함수: `saveLearned(sb, { add, update, remove })` 하나로 서버 값을 다시 읽어 `learned`만 바꿔 쓴다. 설정 줄이 없으면 `startHospitalSettings(neutralPhrases() + learned)`.

### 5-2. 손 간 정도 (REQ-9318)

- Worker가 메모 보기를 보낼 때 `handStats: { need: number; learned: number; edited: number }`를 함께 보낸다. need = 메모 필요 진료 수, learned = `used`가 하나 이상인 진료 수, edited = 고친 글(`work.saved`)이 있는 진료 수. 불러온 기간 기준이다.
- 메모 단계 도구 줄이 notes '손 간 정도' 글로 그린다(need 0이면 없음).

## 6. 확인 필요·남은 확인

- 화면은 `learned`에 `left > 0`이 하나라도 있으면 '확인 필요'·노란 줄, 꼬리표는 첫 학습 이름(AC-9302.6).
- Worker가 완료를 둘 때(`memoCopied`) 또는 입력 성공 줄을 받을 때 그 진료의 `used`를 `{ type: 'learnUsed'; ids; how: 'done' }`로, 고친 글을 받을 때(`editMemo`) `{ type: 'learnUsed'; ids; how: 'edited' }`로 보낸다. 화면이 `tickLearned(sb, ids, how)` — done이면 `left = max(0, left-1)`, edited면 3. 실패해도 메모 일은 막지 않는다(다음에 다시).
- `settingsChanged.ts` 견주기 보기에서 `learned[].left`와 `learnKinds`를 뺀다(AC-9302.7). 다른 칸(학습 문장·조건·켜짐)이 바뀌면 지금처럼 띠가 뜬다.

## 7. 처음 학습

- 화면 → Worker `{ type: 'firstLearn' }` → Worker가 불러온 진료를 종류 열쇠 `codes.sort().join('+') + '|' + regions.sort().join(',')`(시술 코드·부위만, 120자로 자름)로 묶어 진료 수 많은 차례, `learnKinds`에 있는 종류는 '확인함'으로 세어 `{ type: 'firstLearn'; total; kinds: { key; name; count; done; example: { visitKey; chart: string[]; rx: { code; name; qty }[]; memo } }[] }`. 이름 = 코드 이름(CODEMAP `n`)과 부위 한글을 ' + '·', '로.
- `components/claim/rows/FirstLearn.tsx`가 확인 안 한 종류부터 하나씩 그린다. 덮은 비율 = 확인한 종류 진료 수 합 ÷ total, 내림 정수 %.
- [맞아요]·학습 저장 → `addLearnKinds(sb, [key])`. [고치기] → 그 예시 진료를 메모 단계 상세로 열고 고치기 칸을 연다(저장하면 학습 창).
- 불러온 기간이 7일 미만이거나 진료가 없으면 '한 달 불러오기' 띠, [지난 30일 불러오기] = 기간을 오늘−29일~오늘로 두고 지금 [자료 불러오기]를 부른다(35일 한도 안).

## 8. 출처 찾기 (`why.ts`)

```ts
export type WhySource = { kind: 'learn'; id: string; name: string } | { kind: 'field'; tab: PhraseTab; field: string; label: string } | { kind: 'none' }
export type WhyLine = { line: string; source: WhySource; codes: string[]; chart: string | null }
export function explainLines(text: string, used: { id; name; line }[], visit: { rx; lines }, phrases: Phrases): WhyLine[]
```

- 학습이 쓴 줄 → 학습. 그 밖은 TPL의 글 칸마다 틀(`{…}` = `.+?`, 나머지 escape)을 만들어 줄 전체가 맞는 칸 가운데 고정 글자가 가장 긴 칸, 같으면 TPL 칸 차례 첫 칸. 칸 → 탭·이름은 설정 화면 칸 표(`components/settings/phrases/*Tab.tsx`의 label)를 `why.ts`의 표 `FIELD_PLACE`로 옮겨 적는다(시험이 두 곳이 같은지 본다).
- `codes` = 그 진료 처방 가운데 CODEMAP 이름(`n`)이나 줄임(`k`)이 줄에 든 코드. `chart` = 그날 차트 줄 가운데 그 코드의 줄임·이름이나 부위 글자가 든 첫 줄(없으면 null).
- 설정으로 가는 주소: `/settings?ptab={탭 키}&field={칸 키}`(학습은 `ptab=learn&learn={id}`). 설정 화면이 이 값을 읽어 병원 문구 칸을 열고 그 탭·칸으로 내려가 2초 강조한다. 환자 값은 싣지 않는다.

## 9. 건초내주사 부위 (`engine.ts` KK062 줄)

- `siteOf(v, TS_RE, null, true)` 대신 `tsSites(v, qty)`:
  - 말 = `TPL.tsWords`(없으면 지금 말 `건초, tendon sheath, trigger finger, 방아쇠, quervain, tenosyn, TS, STI`), 말마다 escape·단어 경계(영문)로 정규식.
  - 차례: (1) 말이 든 차트 줄(`v.items`)의 부위 (2) 건초염 진단 = 그 진료 상병 `dx[].c`가 `M65`로 시작하는 줄의 이름에서 읽은 부위(`regionOf`) (3) 그 밖 부위(지금 `siteOf` 차례).
  - `qty` = KK062 처방 수량(`rxAdd` qty → `rxQty['건초내주사']`), 없거나 0이면 1, 정수 내림.
  - 앞 차례부터 qty만큼 채운다. 한 차례에서 남은 수보다 부위가 많으면 그 자리 = `[부위 확인]`, 화면 후보 = 그 차례 부위들(Worker가 `holes`에 실음).
  - 좌우·손가락 글은 지금 `siteOf` 규칙 그대로 부위마다 붙인다.
- `MemoVisit`가 `dx`를 들고 있게 `prepareVisit`에서 넘긴다(없으면 더함). 지금 골든 시험 가운데 건초 한 부위 사례는 그대로, 바뀌는 사례는 tasks.md에 적는다.

### 9-1. 모든 주사·시술 부위 (REQ-9319)

- 9절 건초내주사 규칙을 부위가 들어가는 주사·시술 줄 모두로 넓힌다. `siteOf`를 부르는 자리(IA 줄 둘, `{부위}`를 쓰는 noteLines 줄, KK062 줄)는 `pickSites(v, rule, qty)`를 부른다.

```ts
type SiteRule = { code: string; words: RegExp | null; dx: RegExp | null; only: string[] | null; finger: boolean }
function pickSites(v: MemoVisit, rule: SiteRule, qty: number): { text: string; choices: string[] } // text = 메모에 쓸 부위 글(모자라면 [부위 확인] 섞임), choices = 빈칸 후보
// 엔진이 돌려주는 것에 더함: siteChoices(visit): { code: string; choices: string[] }[]  — 마지막 fullText에서 빈칸이 난 줄의 후보. TASK-3의 tsHoleChoices는 이것의 KK062 몫으로 남긴다
```

| 시술 | words (1) | dx (2) | only |
|---|---|---|---|
| KK062 건초내주사 | `TPL.tsWords`(9절) | `^M65` | `IA_REGIONS`와 같음(상지·경추·요추·흉곽 말은 부위 아님, AC-9319.8), 손가락 켬(손) |
| KK090 관절강 주사 | 지금 `IA_WORD` | 없음 | 지금 `IA_REGIONS` |
| C8140010 천자 | 지금 천자 말(`aspir·asp·천자·흡인·tapping`) | 없음 | 없음 |
| 그 밖 `{부위}` 시술 줄 | 없음 | 없음 | 없음 |

- 차례: (1) words가 든 차트 줄 (2) 그날 상병 `dx[].c`가 dx와 맞는 줄의 이름에서 읽은 부위 (3) 그날 차트 진단·시술 줄(`k`가 dx·proc) (4) 그날 차트 모든 줄. 부위가 하나라도 나온 **첫 차례만** 쓴다.
- 부위 하나 = (좌우, 부위). both는 둘, 좌우 모름은 하나로 센다. qty 한도 = 그 코드 처방 수량(`rxQty`·`rxAdd`), 없거나 1보다 작으면 1, 소수는 올림(0.5→1·1.5→2·2.5→3·3→3). 수량 뜻이 처방마다 달라(부위마다 1 / 추가 부위 50%, 사용자 2026-11-28 "그게 처방마다 다를거야") 어느 뜻이든 확실한 수까지만 쓰고, 넘으면 빈칸이다.
- 부위 수 ≤ qty면 모두 쓴다(좌우·손가락 글은 지금 `siteOf` 규칙). 부위 수 > qty면 남은 자리는 `[부위 확인]`, choices = 그 차례 부위들. 어느 차례에도 없으면 `[부위 확인]`, choices = [].
- 연골주사 줄·KLG 줄은 바꾸지 않는다. IA 좌우(`iaSide`) 칸의 뜻(켜면 차트 좌우를 떼지 않음)은 그대로이고 우리 의원은 배포 뒤 이 칸을 켠다(AC-9319.6, 사용자 '차트 좌우 쓰기'). 고른 부위가 둘 이상이면 `renderQuantityProcedure`가 수량 양측(both)을 붙이지 않는다(AC-9319.7).
- 골든 시험: 부위가 하나인 사례는 그대로(AC-9319.5). 두 부위 이상을 잇던 기대만 바꾸고, 바꾼 시험 이름을 tdd 기록에 적는다.
- **정확도 맞춰 보기**(사용자 문답, 배포 전 한 번, 저장소 밖):
  - 이 PC 비트 자료에서 **2026년 10월 한 달**(사용자 "10월걸로 맞춰봐야해") 진료 가운데 KK062·KK090·`{부위}` 시술이 있고 비트 메모가 있는 진료를 읽는다. 청구 탭이 한 달을 불러오는 것과 같은 자료(`claim.month` 10/1~10/31)다.
  - 바꾸기 전·후 엔진 부위를 비트 메모의 부위 글과 견주어 '같음·다름·빈칸' 건수와 %만 낸다.
  - 진료 이름·차트번호·날짜·글은 화면이나 파일에 내지 않는다. 읽기는 `ssk-bit-db-probe` 규칙(무거운 SQL 금지)을 따른다.
  - '다름'이 많은 종류는 사용자에게 알리고, 규칙을 고칠지 묻는다.
  - 1차 결과(2026-11-28, `ourClinicPhrases()`·iaSide 꺼짐): 대상 133쌍. 같음 — 연골주사 날 IA 98.9%·그 밖 IA 51.7%·건초 42.9%·천자 100%, 전·후 판 같음 수 같음. 다름은 거의 좌우(12건), 수량 2인데 서로 다른 두 부위에 both(3건), 건초 'upper'(2건). 수량은 1·2뿐이고 부위마다 1과 맞음. → AC-9319.6~.8, 한도 올림(TASK-9).
  - 2차: TASK-9 뒤 iaSide 켬으로 같은 방법(숫자만)으로 다시 한다.

## 10. 빈칸·하루 두 번·기본 문구 (Worker·메모 화면)

- 빈칸: 메모 글의 `\[[^\]]*확인\]` 개수 = `holes`. 줄 앞 후보: `[좌우 확인]` → 병원 좌우 표기 셋, `[부위 확인]` → 엔진 `siteChoices`(9-1절)의 그 줄 후보, 없으면 그 진료 부위. 후보 싣기는 TASK-6이 `jobs.ts`에서 한다. 목록 순서: `memoSplit.ts` `allGroups`에서 빈칸 있는 사람(지금 'mark' 묶음)을 맨 앞으로(AC-9307.1). 후보 단추 → 그 자리만 바꾼 글을 지금 `editMemo` 길로 보낸다.
- 하루 두 번: Worker가 같은 차트·같은 날 진료 수를 `sameDay`로 싣는다. 2 이상이면 표시만(AC-9309.1).
- 기본 문구: `jobs.ts:172` 설정 없음(줄 없음)일 때 `E-MEMO-NO-SETTINGS` 대신 `neutralPhrases()`로 엔진을 만들고 `defaultPhrases: true`를 싣는다. 설정이 **있는데 검사 실패**면 지금처럼 `E-MEMO-NO-SETTINGS`. 띠는 메모 단계 위.
- 복사 뒤 건수: `memoCopied`로 완료가 바뀌면 `saveMonth` 뒤 `postDayCounts()`(AC-9312.1).

## 11. 흐름·연결·오류

| AC | 자리 | 바꿈 |
|---|---|---|
| 9311.1 | `DateStep.tsx` `DayRow` | 줄 끝 [이 날만] → `onPeriod({from: date, to: date})` |
| 9311.2 | `dateList.ts` `periodSummary` | 기간 날이 목록에 하나도 없으면 `outside: true` → 요약 자리 '목록 밖' |
| 9311.3 | `DateStep.tsx` `CloseBar` | `dates.includes(todayInKorea())`면 '오늘 포함' |
| 9313.1 | `ClaimEntry.tsx` → `/claim/setup?from=claim&why={no-helper|update-helper|update-extension|disconnected}` | `SetupScreen`이 `from=claim`이고 `why`가 넷 가운데 하나일 때만 띠(정해진 글만, 주소 글을 그대로 쓰지 않음) |
| 9313.2 | `ClaimEntry.tsx` 기다림 | '연결 확인 중' 글 |
| 9313.3 | `StepGuide.tsx` 확장 단계 | '새로 고침' 글 + [이 화면 새로 고침](`location.reload()`) |
| 9313.4 | `StoreBlockedCard.tsx` | '다시 등록' 글 + [이 PC 다시 등록] → `/claim/setup?from=store`. `SetupScreen`은 `from=store`면 등록이 되어 있어도 [처음 등록]을 보인다 |
| 9313.5 | `src/components/shell/openTabs.ts`(새, 통로 밖)·`AppShell.tsx`·`OtherTabsLine.tsx`(새) | 열린 창마다 `BroadcastChannel('ssk-open-tabs')`에 `{type:'who', id}`가 오면 `currentMenuLabel(pathname)`(메뉴 목록 안 이름만)으로 `{type:'here', id, label}`을 답한다. `OtherTabsLine`이 묻고 300ms 안 답을 모아(같은 이름 한 번) '어느 창' 줄을 그린다. 받은 이름이 메뉴 목록에 없으면 버린다. `lib/bridge`·확장은 창 사이 통신을 쓰지 않는다(지금 울타리 그대로). |
| 9314.1 | `MemoPanel.tsx`(486 근처) | `settingsStale`이면 [복사(완료)]도 막음 |
| 9314.2 | `InputResults.tsx` | [날짜 목록으로] → 날짜 단계(목록 다시 읽기) |
| 9315.1 | `ClaimScreen.tsx`·`ClaimEntry.tsx` | 일하는 중(불러오기·비트 메모 읽기·입력)에 `E-HELPER-MISSING`이 오면 `E-HELPER-STOPPED`로 바꿔 그 자리 오류 카드, `ClaimEntry`는 그 동안 연결 화면으로 옮기지 않는다(청구 화면이 '일하는 중'을 위로 알림). 입력 결과는 남김 |
| 9315.2 | `claimLoad.ts`·`ClaimScreen.tsx` | 불러오기가 `E-STORE-BROKEN`으로 실패한 달을 기억 → 다음 불러오기가 성공하면 그 달마다 '저장 파일 깨짐' 띠(그 불러오기 동안) |

## 12. 학습 탭·건초 말 칸 (설정)

- `HospitalPhrases.tsx` TABS에 `{ key: 'learn', label: '학습' }`(메모 시험 뒤). `phrases/LearnTab.tsx`(새): 표·켜고 끄기·[고치기](학습 창과 같은 칸 — 보기 부분은 `components/settings/phrases/LearnEditor.tsx`, 환자 자료 없음)·[지우기](확인). draft만 고치고 저장은 지금 아래 [저장] → SaveDiff 흐름(바뀐 학습 줄을 비교 표에 '학습: {이름}'으로).
- `ProcTab.tsx`에 '건초내주사로 알아볼 차트 말' TextField(`TPL.tsWords`).
- 주소 `ptab`·`field`·`learn`를 읽어 탭을 열고 칸으로 내려간다(정해진 키만).

## 13. 도우미 0.15.0 (`helper/`)

- `claim.month`(`Claim/ClaimMonthPayload.cs`): 처방 목록 뒤에 통계가 쓰는 `StatsSql.VisitLinesSql`(차트·진료일·접수 시각·보험·진료의 코드)과 `StatsSql.DoctorNamesSql`을 **그대로** 불러 답 맨 위에 `visitDoctors: [[차트번호, 진료일, 진료의 코드|null]]`·`doctors: [[코드, 이름|null]]`(그 기간 진료의만)를 더한다. 새 SQL 없음(관문·색인 시험 그대로). 실패하면 지금처럼 BitException 하나.
- 웹 `src/lib/precheck/shape.ts`: `visitDoctors`로 (차트, 날짜) → 코드 모음을 만들어 `Visit.doctors: string[]`, `doctors`로 이름표. 두 칸이 없으면(옛 도우미) 빈 배열·빈 표.
- 등록 때 저장 파일 보관(`Registration/RegisterFlow.cs`·0.14.1 고르기 길·`Store/WorkStore.cs`): [확인]으로 등록을 저장한 **뒤** `WorkStore.ArchiveOtherProfiles(profileId)`가 저장 폴더의 작업 파일 가운데 프로필이 다른 것(지금 `FileState.OtherHospital` 판단과 같은 규칙)을 `old-{yyyyMMdd-HHmmss}` 폴더로 옮긴다(이름 겹치면 `-2`…). 지우지 않는다. 옮길 파일이 있으면 확인 창 글(`RegisterPrompt.cs` 다시 등록 글의 '기관기호가 달라 전 병원의 작업은 읽지 않습니다.' 다음 줄, 고르기 창도 같은 글)에 '전 병원 파일 보관' 한 줄을 더한다. 파일 수는 등록 전에 `WorkStore.CountOtherProfiles(profileId)`로 센다. 옮기다 실패하면 등록은 그대로 두고 `E-STORE-FAILED`(지금 번호)로 알린다.
- 판: `helper/Directory.Build.props` 0.15.0, `src/lib/bridge/versions.ts` `LATEST_HELPER` 0.15.0(번호 박힌 시험 함께). `MIN_HELPER`·`commands.json`·`extension/` 그대로.

## 14. 오류 번호 (`src/lib/errors.ts`)

- `E-LEARN-PERSONAL`, `E-LEARN-SAVE`, `E-HELPER-STOPPED` — 글은 notes '화면 글' 그대로.

## 15. 결정과 위험

- 줄 틀 맞추기는 글자 그대로라, 병원 문구를 고치면(예 '시행' → '실시') 그 전에 만든 replace·remove 학습이 더 맞지 않는다. 학습 탭에서 남은 학습을 볼 수 있고, 다시 고쳐 학습하면 된다(받아들임).
- '확인 필요' 수는 병원 전체 수다(PC마다 아님). 두 PC가 같은 학습을 동시에 세면 하나 덜 줄 수 있다(받아들임).
- 출처 찾기는 틀 맞추기라 드물게 틀린 칸을 가리킬 수 있다 → 못 찾으면 '출처 모름'.
- 진료의 칸은 통계와 같은 표를 읽어 SQL 무게가 거의 같다. 옛 도우미면 원장님 조건이 없다.
- 도우미 0.15.0을 낸 **뒤** 웹을 배포한다(ssk-clinic-pc-files·ssk-deploy). 다른 창의 `merge-main-20261127`(ERP 의사랑판)과 합칠 때 `LATEST_HELPER`·`Directory.Build.props`가 부딪힌다 → 0.15.0을 남긴다.

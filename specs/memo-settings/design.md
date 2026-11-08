# 설계: 청구메모 설정 확장

## 1. 값 모양 (types.ts · phrases.ts)
```ts
export type MemoRules = {
  singleOwnerDrug?: boolean      // 없으면 true (REQ-3002)
  iaSide?: boolean               // 없으면 false (AC-3003.1)
  kneeSetIaWithDrug?: boolean    // 없으면 false (AC-3003.2)
  order?: Record<string, number> // 코드(대문자) → 1~999 (REQ-3005)
}
export type Phrases = { TPL; CODEMAP; CODEMAP_DEL; procedureDrugs; memoRules?: MemoRules }
```
- `validatePhrases`: `procedureDrugs`처럼 `memoRules`를 떼어 `validateMemoRules`로 따로 본다. 원본 칸 검사(`validateOriginal`)는 손대지 않는다.
- `diffPhrases`: 이름표에 `memoRules.*`, `CODEMAP.<코드>.n|k|rg|memo`(→ `<코드> · 메모 이름` 등), `memoRules.order.<코드>`(→ `<코드> · 줄 순서`)를 더한다.
- 저장 모양은 지금 그대로 `claim_hospital_settings.phrases`(jsonb, 256KB 아래). 마이그레이션 없음.

## 2. 엔진 (engine.ts)
- **IA 부위**: `iaLinesOf`의 `siteOf(..., ['shoulder','knee'])` → 관절 부위 `IA_REGIONS = ['shoulder','knee','ankle','elbow','wrist','hip','hand','foot']`.
- **아라간 날 일반 약**: 연골주사 날(`iaKind==='ara'`)에 `afterProc`의 연골주사 아닌 약이 있으면, 차트에서 IA 말이 있고 아라간이 없는 줄로 `siteOf`를 불러 `TPL.iaEtc` 줄을 하나 더 쓴다. 그런 줄이 없으면 그 약을 `checks`로 돌린다. `fullText`의 둘째 쓰기 조건은 그대로.
- **약 주인(owner)**: `DrugItem`에 `owner?: string`(시술 키). `drugPlan`에서 시술 2개 이상 + `singleOwnerDrug !== false` + 넣기 시술이 딱 하나·나머지 모두 빼기면 `{use:'include', place, owner}`. 시술 하나인 날은 owner 없이 지금과 같다.
- **줄 꼬리표**: `procOut`를 `Map<줄, Set<코드>>`로 바꾼다. compose 줄은 `procedureCodeVars(p, rxQty).코드`, rxLines는 `a.code`의 기본 코드, IA 줄은 `KK090`, noteLines는 그 코드.
- **owner 약 놓기**: owner가 KK090이면 IA 줄 `{약제}`, KK062면 건초내주사 줄 `{약제}`(지금 `drugTxt` 자리, 단 그 owner 약만). 그 밖의 owner는 꼬리표가 맞는 첫 줄에: afterProc·afterEnding은 그 줄 끝에 `formatDrugs`, ownLine은 그 줄 바로 아래 `◈약: …`. owner 약은 다른 시술 줄의 `{약제}`·첫 줄 자리(`withDrugSlot`)에 들어가지 않는다. 놓을 줄이 없으면 `checks`에 `[약 확인: 이름]`.
- **무릎 세트**: `kneeSetSkipIa`로 생략할 때 `kneeSetIaWithDrug`가 참이고 IA 줄에 놓을 약(owner KK090 또는 시술 하나인 날의 afterProc)이 있으면 생략하지 않는다.
- **IA·TS 좌우**: `iaSide`가 참이면 IA 줄·건초내주사 줄의 `{부위}`에서 좌우를 떼지 않는다(`renderQuantityProcedure`에 좌우 지키기 표시를 넘긴다).
- **`[코드 확인]`**: `fullTextBody`에서 `v.memos.length>0`이고 본문에 시술 줄이 있을 때, `v.rx` 중 `benefit!==false`이고 `cm(code)`가 없고 CODEMAP_DEL에도 없는 코드를 코드별 한 번 `[코드 확인: 이름]`(이름은 줄바꿈·`]` 없이 한 줄)으로 `plan.checks` 뒤에 둔다.
- **줄 순서**: 본문을 만든 뒤(`placeDrugs` 다음, `formatLevels` 앞) `order`가 있고 꼬리표 코드의 번호가 있는 줄이 하나라도 있으면, 본문 줄(빈 줄 빼고)을 안정 정렬: 번호 있는 줄(꼬리표 코드 중 가장 작은 번호) 먼저, 나머지는 원래 차례. 그 줄 바로 아래 붙은 `◈약:` 줄은 함께 움직인다. 정렬하면 빈 줄 구분은 없앤다.
- 골든: 새 규칙 때문에 달라지는 사례는 `fixtures/precheck/golden/*.json`의 `knownDiffCases`에 `where`(`singleOwnerDrug`·`codeCheck`·`iaRegion`·`araEtcIa`)와 함께 적고 `golden.test.ts`의 `allowed`를 넓힌다. 원본 결과(`original`)는 그대로 둔다. 기존 AC-014.10 시험은 `singleOwnerDrug:false`로 옮긴다.

## 3. 처방코드 목록 (components/settings/codeCatalog.ts)
```ts
export type CodeRow = { code: string; bitName: string; type: string; lastDay: string | null; isNew: boolean; row: MemoCode | null }
export function buildCodeRows(days: readonly DayPayload[], phrases: Pick<Phrases,'CODEMAP'|'CODEMAP_DEL'>, today: string, scope: 'recent' | 'all'): CodeRow[]
```
- 순수 함수. `recent`는 `today` 포함 92일(`lib/analytics/dates.ts`로 계산). 사전 코드는 늘 들어간다. 정렬: 새 코드 → 코드 순.
- 읽기: `readDays({from, to: today})` — 범위는 `statsRange(today,'12m')`의 가장 넓은 범위(useRxCatalog와 같은 길). 통계 자료는 집계뿐이라 환자 자료가 아니다.

## 4. 화면 (components/settings)
- `HospitalPhrases.tsx`: 묶음 단추(역할 tablist) + 아래 저장 줄. 상태(draft·opened·저장·비교)는 여기 하나에 둔다. `withPhraseChanges`는 CODEMAP(코드마다)·CODEMAP_DEL(더하고 뺀 코드)·memoRules(칸마다, order는 코드마다)도 얹는다.
- 새 파일: `phrases/BasicTab.tsx`(메모 모양), `phrases/ProcTab.tsx`(시술 문구·byProc·byRegion·fixedPhrases + ProcedureDrugs), `phrases/CodesTab.tsx`(처방코드), `phrases/RulesTab.tsx`(표기 규칙), `phrases/ReasonTab.tsx`(사유), `phrases/TryTab.tsx`(메모 시험), `phrases/SaveDiff.tsx`(전·후 표). 각 탭은 `draft`와 `onChange(next: Phrases)`만 받는다.
- 메모 시험 처방 글 읽기 `parseRxText('LA358 2\nA21')`는 `phrases/tryVisit.ts`(순수)에. 만든 가짜 진료는 화면 상태에만 둔다.
- `ProcedureDrugs.tsx`: 아래 안내 글을 새 규칙으로 바꾸고 `singleOwnerDrug` 켜기 칸(props로 값·onChange)을 더한다.
- `phrases/TemplateField.tsx`(REQ-3008): 틀 글 칸 하나 = 글 칸 + '자동 채움 넣기' 단추(`allowedTokens(path, draft)`, 커서 자리에 `setRangeText`) + 조각 줄(`/(\{[^{}]*\}|\s+)/`로 나눈 낱말·{항목}, {항목}에 ◀ ▶ ×) + 보기 한 줄(`createMemoEngine(draft,{}).fill(글, 보기 값)`). 조각 옮기기는 순수 함수 `phrases/tokenPieces.ts`(`pieces(text)`, `moveToken(text, index, -1|1)`, `removeToken(text, index)`)로 둔다. 모든 틀 칸(지금 11개·byProc·byRegion·사유·코드별 memo)이 이 칸을 쓴다.
- `phrases.ts`에 `allowedTokens(path: string, phrases: Phrases): string[]`을 내보낸다(지금 안쪽 `tokens()`를 그대로 쓴다).

## 5. 위험
- 실제 메모가 첫날 `[코드 확인]`으로 많이 걸릴 수 있다 → 처방코드 묶음 맨 위에 새 코드 수와 '새 코드 모두 제외'.
- 엔진 줄 꼬리표는 원본 흐름을 건드린다 → 골든 전체가 통과해야 하고 달라진 사례는 `knownDiffCases`에 이유와 함께 적는다.

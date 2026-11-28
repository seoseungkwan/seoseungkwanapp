import type { DxLink, RuleUpdate, SavedRuleSettings } from '@/types/precheck'

// 점검에 쓴 설정 묶음과 다시 읽은 묶음이 다른지(precheck AC-012.7, design.md 6-5). 청구 화면이 "설정이 바뀌었어요, 다시 점검하세요" 띠에 쓴다.
// 틀린 경보는 [다시 점검] 한 번이면 되지만, 놓치면 옛 설정의 점검 결과로 입력하게 된다 → 순서가 뜻을 가질 수 있는 곳은 순서까지 본다.
// - 규칙의 off·on·grade, 문자 문구 줄: 집합이다. 순서만 다르면 같다(문자 문구의 차례는 줄의 sort_order 값으로 본다)
// - 상병 연결표: 순서까지 본다. 추천 상병은 넣은 차례로 앞 3개를 고르므로(lib/precheck/dx/recommend.ts) 순서만 바뀌어도 결과가 달라질 수 있다.
//   jsonb 배열이라 넣은 순서 그대로 읽혀(supabase/precheck.rls.test.ts) 순서가 저절로 바뀌어 틀린 경보가 나지는 않는다
// - 병원 문구: 칸 이름 순서는 보지 않고 안의 배열은 순서까지 본다. 병원별 메모 계획에 줄 순서 설정이 있다(docs/precheck/clinic-memo-plan.md '메모 모양')
// - 고시로 바뀐 규칙 판(specs/rule-auto AC-7804.4): (changeId, from) 정렬 목록이다. 칸이 없으면 빈 목록. 판 줄은 넣은 뒤 내용이 바뀌지 않으므로
//   (되돌리기·다시 적용·새 판만 모음을 바꾼다) 규칙 내용은 견주지 않는다
// 환자 자료 구역 안 파일이지만 받는 것은 설정뿐이다

export type SettingsBundle = {
  rules: SavedRuleSettings
  phrases: object | null
  dxLinks: DxLink[]
  templates: { kind: string; name: string; body: string; sort_order: number }[]
  /** 고시로 바뀐 규칙 판(내 병원이 되돌린 것은 뺌). 없으면 빈 목록으로 본다 */
  ruleUpdates?: RuleUpdate[]
}

/** 칸 이름 순서를 없앤 값(깊은 칸까지). 배열 순서는 그대로 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (typeof value !== 'object' || value === null) return value
  const record = value as Record<string, unknown>
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, canonical(record[key])]),
  )
}

const text = (value: unknown) => JSON.stringify(canonical(value))

/** 순서를 뺀 목록 */
const setOf = (list: readonly unknown[]) => list.map(text).sort()

/** 바뀐 규칙 판의 (changeId, from) 정렬 목록. 칸이 없으면 빈 목록 */
const updatesOf = (list: readonly RuleUpdate[] | undefined) => (Array.isArray(list) ? list : []).map((u) => `${u?.changeId}|${u?.from}`).sort()

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * 견주는 병원 문구: 학습의 남은 확인(learned[].left)과 처음 학습 종류(learnKinds)는 뺀다(specs/claim-learn AC-9302.7).
 * 확인 수가 줄거나 처음 학습 종류가 늘 때마다 띠가 뜨지 않게. 학습 문장·조건·켜짐 같은 다른 칸은 그대로 견준다. 받은 값은 고치지 않는다
 */
function phrasesView(phrases: object | null): unknown {
  if (!isRecord(phrases)) return phrases
  const copy: Record<string, unknown> = { ...phrases }
  delete copy.learnKinds
  if (Array.isArray(copy.learned)) {
    copy.learned = copy.learned.map((row: unknown) => {
      if (!isRecord(row)) return row
      const rest: Record<string, unknown> = { ...row }
      delete rest.left
      return rest
    })
  }
  return copy
}

const view = (bundle: SettingsBundle) =>
  JSON.stringify([
    setOf(bundle.rules.off),
    setOf(bundle.rules.on),
    setOf(bundle.rules.grade),
    text(phrasesView(bundle.phrases)),
    text(bundle.dxLinks),
    setOf(bundle.templates),
    updatesOf(bundle.ruleUpdates),
  ])

export function settingsChanged(a: SettingsBundle, b: SettingsBundle): boolean {
  return view(a) !== view(b)
}

import type { MemoRules, Phrases, PhraseTemplates } from '@/lib/precheck/memo'

// 저장할 때 내가 고친 칸만 그때 읽은 값에 얹는다(AC-018.7, memo-settings AC-3007.6, 규칙 설정의 withRulesFrom과 같은 생각). 순수 함수다

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** 표 하나에서 before와 after가 다른 칸만 base에 얹는다. 지운 칸은 지운다 */
function withChanges<T>(base: Readonly<Record<string, T>>, before: Readonly<Record<string, T>>, after: Readonly<Record<string, T>>): Record<string, T> {
  const merged = { ...base }
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (same(before[key], after[key])) continue
    if (Object.hasOwn(after, key)) merged[key] = after[key]
    else delete merged[key]
  }
  return merged
}

/** 지운 코드 목록: 내가 더한 코드는 더하고 뺀 코드는 뺀다 */
function withListChanges(base: readonly string[], before: readonly string[], after: readonly string[]): string[] {
  const removed = new Set(before.filter((code) => !after.includes(code)))
  const added = after.filter((code) => !before.includes(code))
  const kept = base.filter((code) => !removed.has(code))
  return [...kept, ...added.filter((code) => !kept.includes(code))]
}

/** 메모 규칙: 켜기 칸은 칸마다, 줄 순서는 코드마다. 고친 것이 없으면 그때 읽은 값 그대로다(칸이 없으면 없는 채로) */
function withRuleChanges(now: MemoRules | undefined, before: MemoRules | undefined, after: MemoRules | undefined): MemoRules | undefined {
  if (same(before ?? {}, after ?? {})) return now
  const { order: nowOrder, ...nowFlags } = now ?? {}
  const { order: beforeOrder, ...beforeFlags } = before ?? {}
  const { order: afterOrder, ...afterFlags } = after ?? {}
  const merged: MemoRules = withChanges<unknown>(nowFlags, beforeFlags, afterFlags)
  const order = same(beforeOrder ?? {}, afterOrder ?? {}) ? nowOrder : withChanges(nowOrder ?? {}, beforeOrder ?? {}, afterOrder ?? {})
  if (order !== undefined) merged.order = order
  return merged
}

/**
 * before → after로 고친 칸만 now에 얹는다: 문구(TPL, 칸마다)·시술별 약(시술마다)·코드 사전(코드마다)·지운 코드(더하고 뺀 코드)·메모 규칙(칸마다, 줄 순서는 코드마다).
 * 고치지 않은 칸은 그때 읽은 값 그대로라 그동안 다른 PC가 고친 값을 덮지 않는다
 */
export function withPhraseChanges(now: Phrases, before: Phrases, after: Phrases): Phrases {
  const merged: Phrases = {
    ...now,
    TPL: withChanges<unknown>(now.TPL, before.TPL, after.TPL) as PhraseTemplates,
    CODEMAP: withChanges(now.CODEMAP, before.CODEMAP, after.CODEMAP),
    CODEMAP_DEL: withListChanges(now.CODEMAP_DEL, before.CODEMAP_DEL, after.CODEMAP_DEL),
    procedureDrugs: withChanges(now.procedureDrugs, before.procedureDrugs, after.procedureDrugs),
  }
  const memoRules = withRuleChanges(now.memoRules, before.memoRules, after.memoRules)
  if (memoRules === undefined) delete merged.memoRules
  else merged.memoRules = memoRules
  return merged
}

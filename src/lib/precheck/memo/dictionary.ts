import type { MemoDictionary } from './types'

// 문구 사전(원본 new-medicore-shared-dictionary). 줄임말을 글자 그대로만 바꾼다. 긴 말부터 한 번에 바꾸고 A→B, B→C를 잇지 않는다

/** 원본 defaults: 빈 사전 */
export const defaultDictionary = (): MemoDictionary => ({ aliases: [], omissions: { dropRootEpi: false, dropShoulderAnbWithCervicalMbb: false } })

/** 원본 normalizeWith. kind가 null이면 모든 종류를 바꾼다 */
export function normalizeDictionary(text: unknown, kind: string | null, config: MemoDictionary): string {
  const aliases = config.aliases.filter((a) => !kind || a.kind === kind).slice().sort((a, b) => b.term.length - a.term.length)
  const source = String(text ?? '')
  if (!aliases.length) return source
  const lower = source.toLocaleLowerCase()
  let out = ''
  let i = 0
  while (i < source.length) {
    const at = i
    const a = aliases.find(
      (row) =>
        lower.startsWith(row.term.toLocaleLowerCase(), at) &&
        (!/^[a-z0-9]/i.test(row.term) || at === 0 || !/[a-z0-9_]/i.test(source[at - 1])) &&
        (!/[a-z0-9]$/i.test(row.term) || !/[a-z0-9_]/i.test(source[at + row.term.length] || '')),
    )
    if (a) {
      out += a.target
      i += a.term.length
    } else out += source[i++]
  }
  return out
}

/** 원본 terms: 그 종류의 원문 표기·해석 표기를 겹치지 않게 */
export function dictionaryTerms(kind: string, config: MemoDictionary): string[] {
  return [...new Set(config.aliases.filter((a) => a.kind === kind).flatMap((a) => [a.term, a.target]))]
}

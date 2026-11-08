import { describe, expect, it } from 'vitest'
import { ourClinicPhrases, type Phrases } from '@/lib/precheck/memo'
import { withPhraseChanges } from './merge'

// 저장할 때 내가 고친 칸만 그때 읽은 값에 얹는다(memo-settings AC-3007.6, AC-018.7과 같은 생각)

const our = ourClinicPhrases
const edit = (base: Phrases, change: (p: Phrases) => void) => {
  const value = structuredClone(base)
  change(value)
  return value
}

describe('AC-3007.6 고친 칸만 얹기', () => {
  /** 그사이 다른 PC가 저장한 값 */
  const otherPc = () =>
    edit(our(), (p) => {
      p.TPL.drugUnit = '다른 PC 단위'
      p.CODEMAP.LZ999 = { n: '다른 PC 시술', k: 'proc', rg: null }
      p.CODEMAP.KK090 = { ...p.CODEMAP.KK090, memo: '다른 PC 메모' }
      p.CODEMAP_DEL = ['ZZ100']
      p.memoRules = { kneeSetIaWithDrug: true, order: { LA358: 2 } }
    })

  it('AC-3007.6: 코드는 내가 고친 코드만 얹고 다른 PC가 더하거나 고친 코드는 남는다', () => {
    const before = our()
    const after = edit(before, (p) => {
      p.CODEMAP.A21 = { ...p.CODEMAP.A21, n: '트리암주' }
      p.CODEMAP.AA254 = { n: '재진', k: 'skip', rg: null }
    })
    const merged = withPhraseChanges(otherPc(), before, after)
    expect(merged.CODEMAP.A21.n).toBe('트리암주')
    expect(merged.CODEMAP.AA254).toEqual({ n: '재진', k: 'skip', rg: null })
    expect(merged.CODEMAP.LZ999).toEqual({ n: '다른 PC 시술', k: 'proc', rg: null })
    expect(merged.CODEMAP.KK090.memo).toBe('다른 PC 메모')
    expect(merged.TPL.drugUnit).toBe('다른 PC 단위')
  })

  it('AC-3007.6: 내가 지운 코드는 사전에서 빠진다', () => {
    const before = our()
    const after = edit(before, (p) => delete p.CODEMAP.A21)
    expect(withPhraseChanges(otherPc(), before, after).CODEMAP.A21).toBeUndefined()
  })

  it('AC-3007.6: 지운 코드 목록은 내가 더하고 뺀 코드만 바꾼다', () => {
    const before = edit(our(), (p) => (p.CODEMAP_DEL = ['LA100']))
    const after = edit(before, (p) => (p.CODEMAP_DEL = ['LA200']))
    const now = edit(otherPc(), (p) => (p.CODEMAP_DEL = ['LA100', 'ZZ100']))
    expect(withPhraseChanges(now, before, after).CODEMAP_DEL).toEqual(['ZZ100', 'LA200'])
  })

  it('AC-3007.6: memoRules는 칸마다, 줄 순서는 코드마다 얹는다', () => {
    const before = our()
    const after = edit(before, (p) => (p.memoRules = { iaSide: true, order: { KK090: 1 } }))
    expect(withPhraseChanges(otherPc(), before, after).memoRules).toEqual({ kneeSetIaWithDrug: true, iaSide: true, order: { LA358: 2, KK090: 1 } })
  })

  it('AC-3007.6: 내가 지운 줄 순서는 빠지고, 고치지 않은 memoRules는 그때 읽은 값 그대로다', () => {
    const before = edit(our(), (p) => (p.memoRules = { order: { LA358: 2, KK090: 1 } }))
    const after = edit(before, (p) => (p.memoRules = { order: { LA358: 2 } }))
    expect(withPhraseChanges(otherPc(), before, after).memoRules).toEqual({ kneeSetIaWithDrug: true, order: { LA358: 2 } })
    expect(withPhraseChanges(our(), our(), our()).memoRules).toBeUndefined()
    expect(withPhraseChanges(otherPc(), our(), our()).memoRules).toEqual(otherPc().memoRules)
  })

  it('AC-3007.6: 문구와 시술별 약은 지금처럼 고친 칸·시술만 얹는다', () => {
    const before = our()
    const after = edit(before, (p) => {
      p.TPL.mark = '★'
      p.procedureDrugs.LA247 = { ...p.procedureDrugs.LA247, 덱사: { use: 'include', place: 'afterProc' } }
    })
    const now = edit(otherPc(), (p) => (p.procedureDrugs.LA251 = { ...p.procedureDrugs.LA251, 리도카인: { use: 'include', place: 'ownLine' } }))
    const merged = withPhraseChanges(now, before, after)
    expect(merged.TPL.mark).toBe('★')
    expect(merged.TPL.drugUnit).toBe('다른 PC 단위')
    expect(merged.procedureDrugs.LA247.덱사.use).toBe('include')
    expect(merged.procedureDrugs.LA251.리도카인).toEqual({ use: 'include', place: 'ownLine' })
  })
})

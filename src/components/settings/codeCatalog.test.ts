import { describe, expect, it } from 'vitest'
import type { MemoCode } from '@/lib/precheck/memo'
import type { DayPayload } from '@/types/payload'
import { buildCodeRows } from './codeCatalog'

// 처방코드 목록(memo-settings AC-3004.2): 통계에 저장된 날별 처방(DayPayload.rx)과 코드 사전으로 만든다. 코드·이름은 가짜다

const TODAY = '2026-11-08'

/** 가짜 날 줄: 처방 줄만 본다 */
function day(date: string, rx: [code: string, name: string, type: string][]): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: date,
    partial: false,
    totals: {} as DayPayload['totals'],
    rx: rx.map(([code, name, type]) => ({ code, name, type, patients: 1, newPatients: 0, returning: 1 })),
    groups: [],
    revisit: { cohort: 0, within7: null, within14: null },
  }
}

const KK090: MemoCode = { n: 'IA', k: 'proc', rg: null }
const A21: MemoCode = { n: '트리암', k: 'drug', rg: null, bitName: '트리암주(사전)' }
const phrases = { CODEMAP: { KK090, A21 }, CODEMAP_DEL: ['ZZ001'] }

describe('AC-3004.2 처방코드 목록', () => {
  it('AC-3004.2: 최근 3개월(오늘 포함 92일)에 처방된 코드와 사전 코드만 보이고, 전체 보기면 읽은 전체 기간의 코드가 나온다', () => {
    const days = [day('2026-08-09', [['AA100', '92일째 진찰', '행위']]), day('2026-08-08', [['AA200', '93일째 진찰', '행위']]), day(TODAY, [['LA358', '척추후관절 신경차단', '행위']])]
    expect(buildCodeRows(days, phrases, TODAY, 'recent').map((r) => r.code)).toEqual(['AA100', 'LA358', 'A21', 'KK090'])
    expect(buildCodeRows(days, phrases, TODAY, 'all').map((r) => r.code)).toEqual(['AA100', 'AA200', 'LA358', 'A21', 'KK090'])
  })

  it('AC-3004.2: 사전 코드는 처방이 없어도 늘 들어가고 사전 줄을 함께 준다', () => {
    const rows = buildCodeRows([], phrases, TODAY, 'recent')
    expect(rows).toEqual([
      { code: 'A21', bitName: '트리암주(사전)', type: '', lastDay: null, isNew: false, row: A21 },
      { code: 'KK090', bitName: '', type: '', lastDay: null, isNew: false, row: KK090 },
    ])
  })

  it('AC-3004.2: 줄마다 비트 이름·종류·마지막 처방일이 있고, 이름·종류는 마지막 처방 날 것이다(오래전 처방한 사전 코드도 마지막 날을 보인다)', () => {
    const days = [day('2026-11-07', [['LA358', '새 이름', '행위']]), day('2026-10-01', [['LA358', '옛 이름', '처치']]), day('2026-01-02', [['KK090', '관절강내주사', '행위']])]
    const rows = buildCodeRows(days, phrases, TODAY, 'recent')
    expect(rows.find((r) => r.code === 'LA358')).toEqual({ code: 'LA358', bitName: '새 이름', type: '행위', lastDay: '2026-11-07', isNew: true, row: null })
    expect(rows.find((r) => r.code === 'KK090')).toEqual({ code: 'KK090', bitName: '관절강내주사', type: '행위', lastDay: '2026-01-02', isNew: false, row: KK090 })
  })

  it("AC-3004.2: '새 코드'는 사전에도 지운 목록에도 없는 코드이고, 새 코드가 먼저, 다음은 코드 순이다", () => {
    const days = [day(TODAY, [['ZZ001', '지운 코드', '행위'], ['B10', '새 약', '약품'], ['KK090', '관절강내주사', '행위'], ['A30', '새 진찰', '행위']])]
    const rows = buildCodeRows(days, phrases, TODAY, 'recent')
    expect(rows.map((r) => [r.code, r.isNew])).toEqual([
      ['A30', true],
      ['B10', true],
      ['A21', false],
      ['KK090', false],
      ['ZZ001', false],
    ])
    expect(rows.find((r) => r.code === 'ZZ001')?.row).toBeNull()
  })

  it('AC-3004.2: 사전 코드와 대소문자만 다른 처방 코드는 사전 줄 하나로 본다', () => {
    const rows = buildCodeRows([day(TODAY, [['kk090', '관절강내주사', '행위']])], phrases, TODAY, 'recent')
    expect(rows.map((r) => [r.code, r.isNew, r.lastDay])).toEqual([
      ['A21', false, null],
      ['KK090', false, TODAY],
    ])
  })
})

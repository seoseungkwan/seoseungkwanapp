import { describe, expect, it } from 'vitest'
import { ourClinicPhrases } from '@/lib/precheck/memo'
import { parseChartText, parseRxText, tryVisit, TRY_CHART, TRY_RX } from './tryVisit'

// 메모 시험의 가짜 진료(memo-settings AC-3007.4, design.md §4 tryVisit.ts). 환자 자료가 아니다

describe('AC-3007.4 메모 시험 글 읽기', () => {
  it('AC-3007.4: 처방은 한 줄에 "코드 수량"이고 수량이 없거나 틀리면 1이다. 빈 줄은 건너뛴다', () => {
    expect(parseRxText('LA358 2\nA21\n\n  KK090   1.5  \nB10 x\nC20 0')).toEqual([
      { code: 'LA358', qty: 2 },
      { code: 'A21', qty: 1 },
      { code: 'KK090', qty: 1.5 },
      { code: 'B10', qty: 1 },
      { code: 'C20', qty: 1 },
    ])
    expect(parseRxText('')).toEqual([])
  })

  it('AC-3007.4: 차트 글은 한 줄에 하나이고 앞뒤 빈칸과 빈 줄은 뺀다', () => {
    expect(parseChartText(' MBB L4,5 both \n\nRt knee IA triam\r\n')).toEqual(['MBB L4,5 both', 'Rt knee IA triam'])
  })

  it('AC-3007.4: 처음 글은 지금의 가짜 진료(LBP / MBB L4,5 both, LA358 2)다', () => {
    expect(TRY_CHART).toBe('LBP\nMBB L4,5 both')
    expect(TRY_RX).toBe('LA358 2')
  })

  it('AC-3007.4: 가짜 진료는 차트 줄과 급여 처방(이름은 코드 사전의 메모 이름)으로 만든다', () => {
    const visit = tryVisit('MBB L4,5 both\nRt knee IA triam', 'LA358 2\nKK090\nZZ1 3', ourClinicPhrases())
    expect(visit.lines).toEqual(['MBB L4,5 both', 'Rt knee IA triam'])
    expect(visit.hints).toEqual([null, null])
    expect(visit.rx).toEqual([
      { code: 'LA358', name: 'MBB', qty: 2, benefit: true, pay: '급여' },
      { code: 'KK090', name: 'IA', qty: 1, benefit: true, pay: '급여' },
      { code: 'ZZ1', name: 'ZZ1', qty: 3, benefit: true, pay: '급여' },
    ])
    expect(visit.name).toBe('가짜 진료')
    expect(visit.dx).toEqual([])
    expect(visit.memosInBit).toEqual([])
  })
})

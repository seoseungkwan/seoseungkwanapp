// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { DoctorBreakdown, SunapRates } from '@/types/sunap'
import { DoctorTable } from './DoctorTable'

// 원장님별 표(spec sunap-doctors AC-5001.5, 시안 docs/mockups/sunap-ilji/index.html doctorPanel). 숫자는 시안 DOCS의 지어낸 값이다

afterEach(cleanup)

// [내원, 신환, 90일초진, Block, 물리치료, 신환+Block, 90일+Block, 재진+Block] — 재진은 내원 − 신환 − 90일초진
const rates = (visits: number, first: number, d90: number, block: number, pt: number, firstBlock: number, d90Block: number, retBlock: number): SunapRates => ({
  visits,
  first_n: first,
  d90_n: d90,
  ret_n: visits - first - d90,
  block_n: block,
  pt_n: pt,
  first_block: firstBlock,
  d90_block: d90Block,
  ret_block: retBlock,
})
const DATA: DoctorBreakdown = {
  rows: [
    { code: 'D01', label: '김○○', rates: rates(52, 5, 3, 12, 30, 2, 1, 9) },
    { code: 'D02', label: '이○○', rates: rates(38, 3, 2, 8, 22, 2, 1, 5) },
    // 90일초진·Block이 0명 → 90일+Block·재진+Block 비율은 '–'
    { code: null, label: '진료의 미지정', rates: rates(14, 1, 0, 0, 9, 0, 0, 0) },
  ],
  total: rates(104, 9, 5, 20, 61, 4, 2, 14),
}
const HINT = '엑셀 진료실 1~4 자리 · 접수할 때 정한 진료의 기준'

// 칸 안 글: 수와 작은 비율은 따로 있다 → '수|비율'
const cellsOf = (row: HTMLElement) =>
  within(row)
    .getAllByRole('cell')
    .map((cell) => [...cell.childNodes].map((node) => node.textContent).join('|'))

function show(data: DoctorBreakdown = DATA) {
  render(<DoctorTable data={data} hint={HINT} />)
  return within(screen.getByRole('region', { name: '원장님별' }))
}

describe('AC-5001.5 DoctorTable — 제목·hint·머리·줄마다 수와 비율·합계', () => {
  it('AC-5001.5: 제목 "원장님별"과 hint가 보인다', () => {
    const panel = show()
    expect(panel.getByRole('heading', { name: '원장님별' })).toBeTruthy()
    expect(panel.getByText(HINT)).toBeTruthy()
  })

  it('AC-5001.5: 머리는 원장님·내원·신환·90일초진·Block·물리치료·신환+Block·90일+Block·재진+Block이다', () => {
    const panel = show()
    expect(panel.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      '원장님',
      '내원',
      '신환',
      '90일초진',
      'Block',
      '물리치료',
      '신환+Block',
      '90일+Block',
      '재진+Block',
    ])
  })

  it('AC-5001.5: 줄마다 수와 비율 — 신환·90일초진·Block·물리치료는 내원 중, 신환+Block은 신환 중, 90일+Block은 90일초진 중, 재진+Block은 Block 중', () => {
    const panel = show()
    const rows = panel.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(4)
    expect(cellsOf(rows[0])).toEqual(['김○○', '52명', '5|9.6%', '3|5.8%', '12|23.1%', '30|57.7%', '2|40.0%', '1|33.3%', '9|75.0%'])
    expect(cellsOf(rows[1])).toEqual(['이○○', '38명', '3|7.9%', '2|5.3%', '8|21.1%', '22|57.9%', '2|66.7%', '1|50.0%', '5|62.5%'])
  })

  it('AC-5001.5: 분모가 0이면 비율은 "–"(sunapPct와 같은 글자)다', () => {
    const rows = show().getAllByRole('row')
    expect(cellsOf(rows[3])).toEqual(['진료의 미지정', '14명', '1|7.1%', '0|0.0%', '0|0.0%', '9|64.3%', '0|0.0%', '0|–', '0|–'])
  })

  it('AC-5001.5: 끝 줄은 "합계"이고 같은 규칙으로 비율을 단다', () => {
    const rows = show().getAllByRole('row')
    expect(cellsOf(rows[rows.length - 1])).toEqual(['합계', '104명', '9|8.7%', '5|4.8%', '20|19.2%', '61|58.7%', '4|44.4%', '2|40.0%', '14|70.0%'])
  })

  it('AC-5001.5: 줄 차례는 받은 그대로이고, 큰 수는 천 단위 쉼표다', () => {
    const data: DoctorBreakdown = {
      rows: [
        { code: 'D02', label: '이○○', rates: rates(1234, 0, 0, 0, 0, 0, 0, 0) },
        { code: 'D01', label: '김○○', rates: rates(5, 0, 0, 0, 0, 0, 0, 0) },
      ],
      total: rates(1239, 0, 0, 0, 0, 0, 0, 0),
    }
    const rows = show(data).getAllByRole('row')
    expect(rows.slice(1).map((row) => cellsOf(row).slice(0, 3))).toEqual([
      ['이○○', '1,234명', '0|0.0%'],
      ['김○○', '5명', '0|0.0%'],
      ['합계', '1,239명', '0|0.0%'],
    ])
  })
})

// ── '초진' 글을 '신환'으로(spec sunap-new-label REQ-5601). '90일초진'은 그대로 ─────────
describe("AC-5601.2 원장님별 표의 '초진'은 '신환'", () => {
  it('AC-5601.2: 머리는 원장님·내원·신환·90일초진·Block·물리치료·신환+Block·90일+Block·재진+Block이다', () => {
    const panel = show()
    expect(panel.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      '원장님',
      '내원',
      '신환',
      '90일초진',
      'Block',
      '물리치료',
      '신환+Block',
      '90일+Block',
      '재진+Block',
    ])
  })

  it('AC-5601.2: 아래 글은 신환으로 쓰고 90일초진이 아닌 초진 글자가 없다', () => {
    show()
    const text = document.body.textContent ?? ''
    expect(text).toContain('신환·90일초진·Block·물리치료 % = 그 원장님 내원 중')
    expect(text).toContain('신환+Block % = 신환 중 · 90일+Block % = 90일초진 중 · 재진+Block % = Block 받은 사람 중(엑셀과 같음)')
    expect(text).not.toMatch(/(?<!90일)초진/)
  })
})

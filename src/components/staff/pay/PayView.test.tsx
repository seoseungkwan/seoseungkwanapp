// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaxSheet } from '@/lib/staff/taxExcel'
import { payDb, renderPay } from './payTestKit'

// 급여 화면 틀 (staff REQ-7615 AC-7615.1·AC-7615.7, 시안 docs/mockups/staff/pay.html ①·⑤). 가짜 저장 층(payTestKit)으로 그린다.
// 오늘 2026-11-21. 엑셀 내려받기는 가짜로 바꿔 만든 줄만 본다

const sheets = vi.hoisted(() => ({ list: [] as TaxSheet[], fail: false }))
vi.mock('@/lib/staff/taxExcel', async (load) => {
  const real = await load<typeof import('@/lib/staff/taxExcel')>()
  return {
    ...real,
    downloadTaxExcel: (sheet: TaxSheet) => {
      if (sheets.fail) throw new Error('xlsx')
      sheets.list.push(sheet)
    },
  }
})

beforeEach(() => {
  sheets.list = []
  sheets.fail = false
  window.history.replaceState(null, '', '/staff/pay')
})
afterEach(cleanup)

const menu = () => screen.getByRole('group', { name: '급여 안 메뉴' })
const pressed = () => within(menu()).getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent)

describe('AC-7615.1: 급여 작은 메뉴와 함께 쓰는 달 고르기', () => {
  it('AC-7615.1: 작은 메뉴 다섯이 차례대로 있고 처음은 이달 급여, 달 고르기는 이번 달(◀ 10월 · 2026년 11월 · 12월 ▶)이다', async () => {
    renderPay()
    expect(within(menu()).getAllByRole('button').map((b) => b.textContent)).toEqual(['이달 급여', '인센티브', '세무사 파일', '인건비', '명세서'])
    expect(pressed()).toEqual(['이달 급여'])
    expect(screen.getByRole('button', { name: '◀ 10월' })).toBeTruthy()
    expect(screen.getByText('2026년 11월')).toBeTruthy()
    expect(screen.getByRole('button', { name: '12월 ▶' })).toBeTruthy()
    expect(await screen.findByRole('table', { name: '이달 급여 표' })).toBeTruthy()
  })

  it('AC-7615.1: 달을 옮기면 글자가 바뀌고 그달 줄을 읽는다. 다른 칸으로 가도 달은 그대로다', async () => {
    const { callsOf } = renderPay()
    await screen.findByRole('table', { name: '이달 급여 표' })
    fireEvent.click(screen.getByRole('button', { name: '◀ 10월' }))
    expect(screen.getByText('2026년 10월')).toBeTruthy()
    expect(screen.getByRole('button', { name: '◀ 9월' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '11월 ▶' })).toBeTruthy()
    await waitFor(() => expect(callsOf('listPayLines')).toContainEqual(['2026-05', '2026-10']))
    fireEvent.click(within(menu()).getByRole('button', { name: '인건비' }))
    expect(screen.getByText('2026년 10월')).toBeTruthy()
    fireEvent.click(within(menu()).getByRole('button', { name: '인센티브' }))
    expect(screen.getByText('2026년 10월 실적')).toBeTruthy()
  })

  it('AC-7615.1: 해가 넘어가는 달 고르기는 ◀ 12월 · 2027년 1월 · 2월 ▶이다', () => {
    renderPay({ today: '2027-01-05' })
    expect(screen.getByRole('button', { name: '◀ 12월' })).toBeTruthy()
    expect(screen.getByText('2027년 1월')).toBeTruthy()
    expect(screen.getByRole('button', { name: '2월 ▶' })).toBeTruthy()
  })

  it('AC-7615.1: 고른 칸은 주소 ?part= 하나로 기억하고, 주소의 칸으로 연다', async () => {
    renderPay()
    fireEvent.click(within(menu()).getByRole('button', { name: '명세서' }))
    expect(window.location.search).toBe('?part=slip')
    expect(pressed()).toEqual(['명세서'])
    cleanup()
    renderPay({ part: 'cost' })
    expect(pressed()).toEqual(['인건비'])
    cleanup()
    renderPay({ part: 'nope' })
    expect(pressed()).toEqual(['이달 급여'])
  })

  it('AC-7615.1: 자료를 못 읽으면 E-STAFF-READ-FAILED와 [다시 불러오기]가 보이고, 누르면 다시 읽는다', async () => {
    const db = payDb()
    db.failing.add('listPayLines')
    const { callsOf } = renderPay({ db })
    expect(await screen.findByText('오류 번호 E-STAFF-READ-FAILED')).toBeTruthy()
    const before = callsOf('listPayLines').length
    db.failing.delete('listPayLines')
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))
    expect(await screen.findByRole('table', { name: '이달 급여 표' })).toBeTruthy()
    expect(callsOf('listPayLines').length).toBeGreaterThan(before)
  })
})

describe('AC-7615.7: [엑셀 받기]는 그달 세무사 엑셀(REQ-7609)을 내려받는다', () => {
  it('AC-7615.7: 파일 이름·시트·합계 줄이 그달 값이고, 최민준 메모에 휴진일 근무, 이도윤 남은 연차는 9다', async () => {
    renderPay()
    await screen.findByRole('table', { name: '이달 급여 표' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '엑셀 받기' }))
    })
    expect(sheets.list).toHaveLength(1)
    const sheet = sheets.list[0]
    expect(sheet.fileName).toBe('2026-11 급여자료 (○○정형외과).xlsx')
    expect(sheet.sheetName).toBe('11월 급여')
    const head = sheet.rows[1] as string[]
    const col = (name: string) => head.indexOf(name)
    expect(head.slice(5, 11)).toEqual(['기본급', '연장수당', '식대', '인센티브', '상여', '직책수당'])
    const total = sheet.rows[sheet.rows.length - 1]
    expect(total[0]).toBe('합계')
    expect(total.slice(5, 13)).toEqual([16_000_000, 350_000, 1_120_000, 995_000, 0, 150_000, 0, 18_615_000])
    expect([total[col('연장 (시간)')], total[col('야간 (시간)')], total[col('휴일 (시간)')]]).toEqual([6.5, 1, 4])
    expect([total[col('연차 (일)')], total[col('병가 (일)')], total[col('무급 (일)')]]).toEqual([2.5, 1, 0])
    // 사람 줄은 그달 재직자만, 명단 차례(오세린 퇴사자는 없다)
    expect(sheet.rows.slice(2, -1).map((row) => row[0])).toEqual(['최민준', '김하늘', '이도윤', '정유나', '박서연', '한지우'])
    const rowOf = (name: string) => sheet.rows.find((row) => row[0] === name)!
    expect(String(rowOf('최민준')[col('메모')])).toContain('11-15(일) 휴진일 근무')
    expect(rowOf('이도윤')[col('남은 연차 (일)')]).toBe(9)
    // 계좌는 이달 입사자만(11월은 없음)
    expect(rowOf('한지우')[col('계좌 (이달 입사자만)')]).toBeNull()
  })

  it('AC-7615.7: 그달 입사자 줄에는 계좌가 들어간다(2월 파일의 한지우)', async () => {
    renderPay()
    await screen.findByRole('table', { name: '이달 급여 표' })
    for (let i = 0; i < 9; i += 1) fireEvent.click(screen.getByRole('button', { name: /^◀ \d+월$/ }))
    expect(screen.getByText('2026년 2월')).toBeTruthy()
    await screen.findByRole('table', { name: '이달 급여 표' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '엑셀 받기' }))
    })
    const sheet = sheets.list[0]
    const head = sheet.rows[1] as string[]
    const han = sheet.rows.find((row) => row[0] === '한지우')!
    expect(han[head.indexOf('계좌 (이달 입사자만)')]).toBe('○○은행 000-0000-0000')
  })

  it('AC-7615.7: 파일을 못 만들면 E-STAFF-EXCEL-FAILED가 보인다(E-STAFF-FILE-FAILED 아님). 다시 되면 안내가 사라진다', async () => {
    renderPay()
    await screen.findByRole('table', { name: '이달 급여 표' })
    sheets.fail = true
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '엑셀 받기' }))
    })
    expect(screen.getByText('오류 번호 E-STAFF-EXCEL-FAILED')).toBeTruthy()
    expect(screen.queryByText('오류 번호 E-STAFF-FILE-FAILED')).toBeNull()
    expect(screen.getByText('엑셀 파일을 읽거나 만들지 못했어요')).toBeTruthy()
    sheets.fail = false
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '엑셀 받기' }))
    })
    expect(sheets.list).toHaveLength(1)
    expect(screen.queryByText('오류 번호 E-STAFF-EXCEL-FAILED')).toBeNull()
  })

  it('AC-7615.11: 줄을 아직 저장하지 않은 재직자도 이달 급여와 같은 새 줄(고정 수당 포함)로 들어가 합계 줄 = 이달 급여 합계다', async () => {
    // 12월: 저장된 줄이 하나도 없다 → 새 줄. 김하늘만 고정 수당 100,000원
    renderPay({ today: '2026-12-03' })
    const pay = await screen.findByRole('table', { name: '이달 급여 표' })
    expect([...pay.querySelectorAll('tfoot td')].map((td) => td.textContent).at(-1)).toBe('100,000')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '엑셀 받기' }))
    })
    const sheet = sheets.list[0]
    const head = sheet.rows[1] as string[]
    const total = sheet.rows[sheet.rows.length - 1]
    expect(total[head.indexOf('지급 합계')]).toBe(100_000)
    expect(total[head.indexOf('인센티브')]).toBe(100_000)
    expect(sheet.rows.find((row) => row[0] === '김하늘')![head.indexOf('지급 합계')]).toBe(100_000)
    // 명세서 합계도 같은 줄이다
    fireEvent.click(within(menu()).getByRole('button', { name: '명세서' }))
    fireEvent.click(within(await screen.findByRole('group', { name: '사람 고르기' })).getByRole('button', { name: /^김하늘/ }))
    const slip = [...screen.getByRole('img', { name: '김하늘 2026년 12월 급여 명세' }).querySelectorAll('text')].map((t) => t.textContent)
    expect(slip).toContain('100,000원')
    expect(slip).toContain('고정 수당 100,000원')
  })
})

describe('PayScreen: 페이지가 그리는 틀', () => {
  it('AC-7615.1: /staff/pay 페이지는 오늘(한국 날짜)과 주소의 칸을 PayScreen에 넘긴다', async () => {
    const { default: Page } = await import('@/app/(app)/staff/pay/page')
    const element = await Page({ searchParams: Promise.resolve({ part: 'cost' }) })
    expect(element.props.initialPart).toBe('cost')
    expect(element.props.today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const { metadata, dynamic } = await import('@/app/(app)/staff/pay/page')
    expect(metadata).toEqual({ title: '직원' })
    expect(dynamic).toBe('force-dynamic')
    void render
  })
})

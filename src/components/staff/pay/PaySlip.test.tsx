// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { payDb, renderPay } from './payTestKit'

// '명세서' 칸 — 원장용 간단 명세서 (staff AC-7615.10, 시안 pay.html ⑧). 가짜 저장 층 · 2026년 11월.
// 그림 파일 만들기(lib/staff/slipPng)는 가짜로 바꿔 넘긴 값만 본다

const png = vi.hoisted(() => ({ calls: [] as [SVGSVGElement, string][], ok: true }))
vi.mock('@/lib/staff/slipPng', async (load) => {
  const real = await load<typeof import('@/lib/staff/slipPng')>()
  return {
    ...real,
    downloadSlipPng: async (svg: SVGSVGElement, name: string) => {
      png.calls.push([svg, name])
      return png.ok
    },
  }
})

beforeEach(() => {
  png.calls = []
  png.ok = true
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const picker = () => screen.getByRole('group', { name: '사람 고르기' })
const slip = (name: string) => screen.getByRole('img', { name: `${name} 2026년 11월 급여 명세` })
const texts = (svg: Element) => [...svg.querySelectorAll('text')].map((t) => t.textContent ?? '')
const choose = (name: string) => fireEvent.click(within(picker()).getByRole('button', { name: new RegExp(`^${name}`) }))

describe('AC-7615.10: 간단 명세서', () => {
  it('AC-7615.10: 사람 고르기 목록에 그달 재직자 이름·합계가 명단 차례로 있고, 처음은 첫 사람이다', async () => {
    renderPay({ part: 'slip' })
    await waitFor(() => expect(within(picker()).getAllByRole('button')).toHaveLength(6))
    expect(within(picker()).getByText('사람 고르기')).toBeTruthy()
    expect(within(picker()).getAllByRole('button').map((b) => b.textContent)).toEqual([
      '최민준3,810,000',
      '김하늘3,200,000',
      '이도윤4,000,000',
      '정유나1,570,000',
      '박서연3,385,000',
      '한지우2,650,000',
    ])
    expect(within(picker()).getAllByRole('button')[0].getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '인쇄·PDF' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '그림 파일' })).toBeTruthy()
  })

  it('AC-7615.10: 이도윤 명세서 한 장 — 병원·제목·사람·금액 있는 항목·인센티브 내역·합계·근무 요약·안내', async () => {
    renderPay({ part: 'slip' })
    await waitFor(() => expect(within(picker()).getAllByRole('button')).toHaveLength(6))
    choose('이도윤')
    const svg = slip('이도윤')
    expect(svg.getAttribute('viewBox')).toBe('0 0 794 1123')
    const t = texts(svg)
    for (const want of [
      '○○정형외과',
      '2026년 11월 급여 명세',
      '이도윤',
      '물리치료사',
      '정규직',
      '입사 2023-07-17',
      '지급 항목 · 실수령 기준',
      '기본급',
      '3,100,000원',
      '연장수당',
      '120,000원',
      '식대',
      '200,000원',
      '인센티브',
      '580,000원',
      '도수치료 급여 32건 × 5,000원 = 160,000원',
      '도수치료 비급여 매출 4,200,000원 × 10% = 420,000원',
      '합계 (실수령)',
      '4,000,000원',
      '이달 근무 요약',
      '더 일한 시간',
      '연장 4시간 · 야간 없음 · 휴일 없음',
      '쓴 휴가',
      '연차 1일 (11월 28일)',
      '남은 연차',
      '9일',
      '세금·4대보험 내역은 세무사 명세서로 따로 드려요.',
    ])
      expect(t, want).toContain(want)
    // 금액 없는 항목(상여·직책수당)과 조정은 나오지 않는다
    for (const absent of ['상여', '직책수당']) expect(t).not.toContain(absent)
    expect(t.some((x) => x.startsWith('조정'))).toBe(false)
  })

  it('AC-7615.10: 고정 수당 내역·야간 시간·반차·조정(까닭)이 그 사람 값으로 나온다', async () => {
    const db = payDb()
    db.lines = db.lines.map((l) => (l.id === 'n-park' ? { ...l, adjust: -100_000, adjustReason: 'deduct', adjustMemo: '무급 1일 공제' } : l))
    renderPay({ db, part: 'slip' })
    await waitFor(() => expect(within(picker()).getAllByRole('button')).toHaveLength(6))
    choose('김하늘')
    const kim = texts(slip('김하늘'))
    expect(kim).toContain('고정 수당 100,000원')
    expect(kim).toContain('연장 없음 · 야간 1시간 · 휴일 없음')
    expect(kim).toContain('연차 1일 (11월 7일)')
    choose('박서연')
    const park = texts(slip('박서연'))
    expect(park).toContain('조정 (공제 무급 1일 공제)')
    expect(park).toContain('−100,000원')
    expect(park).toContain('3,285,000원')
    expect(park).toContain('반차 0.5일 (11월 13일)')
    expect(park).toContain('연장 2시간 30분 · 야간 없음 · 휴일 없음')
    choose('최민준')
    expect(texts(slip('최민준'))).toContain('쓴 휴가')
    expect(texts(slip('최민준'))).toContain('없음')
    expect(texts(slip('최민준'))).toContain('직책수당')
  })

  it('AC-7615.10: 명세서 글꼴은 서식 글꼴 파일을 쓰되 이름은 서식 안내문 글꼴 이름이 아니다', async () => {
    renderPay({ part: 'slip' })
    await waitFor(() => expect(within(picker()).getAllByRole('button')).toHaveLength(6))
    const style = slip('최민준').querySelector('style')?.textContent ?? ''
    expect(style).toContain('url(/poster/fonts/Pretendard-Bold.subset.woff2)')
    expect(style).toContain('url(/poster/fonts/Pretendard-Black.subset.woff2)')
    // 서식 안내문 글꼴 이름(이 낱말은 서식 폴더 밖 글에 쓰지 않는다 — AC-3510.2라 조각을 이어 만든다)
    expect(style).not.toMatch(new RegExp(['Poster', 'Pretendard'].join(''), 'i'))
    expect(style).toContain('font-family: SlipPretendard')
  })

  it('AC-7615.10: [인쇄·PDF]는 인쇄 창을 열고, 인쇄 면에는 명세서 한 장만 나온다', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    const { container } = renderPay({ part: 'slip' })
    await waitFor(() => expect(within(picker()).getAllByRole('button')).toHaveLength(6))
    fireEvent.click(screen.getByRole('button', { name: '인쇄·PDF' }))
    expect(print).toHaveBeenCalledTimes(1)
    const copy = container.querySelector('[data-print-copy]') as HTMLElement
    expect(copy.className).toContain('print:block')
    expect(copy.className).toContain('hidden')
    expect(copy.querySelectorAll('svg')).toHaveLength(1)
    const css = [...container.querySelectorAll('style')].map((s) => s.textContent).join('\n')
    expect(css).toContain('@media print')
  })

  it('AC-7615.10: 화면 미리 보기도 A4 종이 모양 그대로다 — 인쇄 면·그림 파일과 같은 794×1123 SVG이고 내용 높이로 줄이지 않는다', async () => {
    const { container } = renderPay({ part: 'slip' })
    await waitFor(() => expect(within(picker()).getAllByRole('button')).toHaveLength(6))
    choose('정유나')
    const preview = slip('정유나')
    const print = container.querySelector('[data-print-copy] svg') as SVGSVGElement
    for (const svg of [preview, print]) {
      expect(svg.getAttribute('viewBox')).toBe('0 0 794 1123')
      // 비율을 바꾸는 값이 없다(preserveAspectRatio="none" 없음), 높이는 폭을 따른다(h-auto)
      expect(svg.getAttribute('preserveAspectRatio')).toBeNull()
      const classes = (svg.getAttribute('class') ?? '').split(/\s+/)
      expect(classes).toEqual(expect.arrayContaining(['h-auto', 'w-full']))
      expect(classes.filter((c) => /^(?:max-|min-)?h-/.test(c) && c !== 'h-auto')).toEqual([])
      expect(classes.filter((c) => c.startsWith('aspect-'))).toEqual([])
      // 종이 바탕은 A4 전체다(줄이 적어도 아래 빈칸이 남는다)
      const paper = svg.querySelector('rect')!
      expect([paper.getAttribute('width'), paper.getAttribute('height')]).toEqual(['794', '1123'])
    }
    // 그림 파일은 화면 미리 보기 그 SVG로 만든다
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '그림 파일' }))
    })
    expect(png.calls[0][0]).toBe(preview)
  })

  it('AC-7615.10: 명세서 그림 굵기 700·900 예외가 docs/ADR.md ADR-039 넷째 줄과 docs/UI_GUIDE.md 굵기 규칙·ADR-028 예외 옆에 적혀 있다', () => {
    const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
    const adr = read('docs/ADR.md')
    const title = '### ADR-039: 직원 자료(연락처·주소·생일·계좌·근무·휴가·급여·서류 파일)를 Supabase에 원장만 보게 둔다. 주민번호는 두지 않는다'
    const from = adr.slice(adr.indexOf(title)).split(/\r?\n/)
    expect(from[0]).toBe(title)
    // ADR-039 칸 = 머리부터 다음 '### ' 머리 앞까지(뒤에 ADR-040~047 같은 다른 결정이 붙어도 그 칸만 본다).
    // 첫 세 줄 뒤 넷째 줄이 명세서 그림 예외다(design.md 2절 글 그대로)
    const end = from.findIndex((line, i) => i > 0 && line.startsWith('### '))
    const body = end === -1 ? from : from.slice(0, end)
    expect(body.slice(1).some((line) => line.startsWith('### '))).toBe(false)
    expect(body[1]).toMatch(/^- plan\.md 4절 /)
    expect(body[2]).toMatch(/^- 휴가 → 예약 '휴무'는 /)
    expect(body[3]).toMatch(/^- \[급여 확정\] 잠금은 /)
    expect(body[4]).toBe(
      '- 급여 명세서 그림(`components/staff/pay/PaySlip.tsx`의 SVG)은 그림 파일·인쇄로 내보내는 종이라 그림 안에서만 글꼴 `SlipPretendard`(서식 안내문과 같은 `public/poster/fonts/` 파일) 700·900을 쓴다. 급여 화면의 칸·단추·표는 400·500·600 그대로다. (2026-11-21 검토 뒤 더함)',
    )
    const guide = read('docs/UI_GUIDE.md').split(/\r?\n/)
    const weightRow = guide.find((line) => line.startsWith('| 700 굵기'))!
    expect(weightRow).toContain('급여 명세서 그림')
    expect(weightRow).toContain('ADR-039')
    const besideAdr028 = guide.findIndex((line) => line.startsWith('- 예외(ADR-028)'))
    expect(besideAdr028).toBeGreaterThan(0)
    const next = guide[besideAdr028 + 1]
    expect(next).toMatch(/^- 예외\(ADR-039\): 급여 명세서 그림/)
    for (const word of ['components/staff/pay/PaySlip.tsx', 'SlipPretendard', '700·900']) expect(next).toContain(word)
  })

  it('AC-7615.10: [그림 파일]은 급여명세-{이름}-{YYYY}-{MM}.png로 받고, 실패하면 E-STAFF-IMAGE-FAILED다', async () => {
    renderPay({ part: 'slip' })
    await waitFor(() => expect(within(picker()).getAllByRole('button')).toHaveLength(6))
    choose('이도윤')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '그림 파일' }))
    })
    expect(png.calls).toHaveLength(1)
    expect(png.calls[0][1]).toBe('급여명세-이도윤-2026-11.png')
    expect(png.calls[0][0].getAttribute('viewBox')).toBe('0 0 794 1123')
    png.ok = false
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '그림 파일' }))
    })
    expect(await screen.findByText('오류 번호 E-STAFF-IMAGE-FAILED')).toBeTruthy()
  })
})

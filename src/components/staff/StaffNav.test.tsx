// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPLOYMENT_LABEL, INCENTIVE_METHOD_LABEL, LEAVE_CHIP, LEAVE_KIND_LABEL, OVERTIME_KIND_LABEL, jobLabel, leaveLabel } from './labels'
import { StaffNav } from './StaffNav'
import { TableScroll } from './TableScroll'

// 직원 탭 틀 공용 부품 (staff REQ-7611, design.md 6절 '공용', 시안 docs/mockups/staff/*.html .subnav).
// 작은 메뉴(StaffNav)는 지금 주소(usePathname)로 지금 칸을 고른다. 넓은 표 칸(TableScroll)·글자와 휴가 색(labels)도 여기서 본다.
// jsdom은 CSS를 계산하지 않는다 → 동작·역할은 Testing Library로, 모양은 정해 둔 클래스가 있는지로 본다

const { pathname } = vi.hoisted(() => ({ pathname: vi.fn(() => '/staff') }))
vi.mock('next/navigation', () => ({ usePathname: pathname }))

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)

// 작은 메뉴 네 칸: 시안 글자 그대로 '명단 · 근무표 · 휴가 · 급여'와 주소(design.md 6절)
const ITEMS: Array<[string, string]> = [
  ['명단', '/staff'],
  ['근무표', '/staff/schedule'],
  ['휴가', '/staff/leave'],
  ['급여', '/staff/pay'],
]

const nav = () => screen.getByRole('navigation', { name: '직원 안 메뉴' })
const links = () => within(nav()).getAllByRole('link')

beforeEach(() => {
  pathname.mockReturnValue('/staff')
})

afterEach(() => {
  cleanup()
})

describe('AC-7611.2: StaffNav — 작은 메뉴 명단 · 근무표 · 휴가 · 급여', () => {
  it('AC-7611.2: nav "직원 안 메뉴" 안에 링크 넷이 명단·근무표·휴가·급여 차례이고 주소는 /staff·/staff/schedule·/staff/leave·/staff/pay다', () => {
    render(<StaffNav />)
    expect(links().map((a) => [a.textContent, a.getAttribute('href')])).toEqual(ITEMS)
  })

  it.each(ITEMS)('AC-7611.2: 주소가 %s 칸(%s)이면 그 칸 하나만 aria-current="page"다', (label, href) => {
    pathname.mockReturnValue(href)
    render(<StaffNav />)
    const current = links().filter((a) => a.getAttribute('aria-current') === 'page')
    expect(current.map((a) => a.textContent)).toEqual([label])
  })

  it.each([
    ['/staff/schedule/2026-11', '근무표'],
    ['/staff/leave/x', '휴가'],
    ['/staff/pay/x/y', '급여'],
  ])('AC-7611.2: 그 칸 아래 주소(%s)도 그 칸(%s)이 지금 칸이다', (path, label) => {
    pathname.mockReturnValue(path)
    render(<StaffNav />)
    expect(links().filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent)).toEqual([label])
  })

  it.each(['/staffx', '/stats', '/dashboard'])('AC-7611.2: 직원 탭 밖 주소(%s)면 지금 칸이 없다', (path) => {
    pathname.mockReturnValue(path)
    render(<StaffNav />)
    expect(links().filter((a) => a.hasAttribute('aria-current'))).toEqual([])
  })

  it('AC-7611.2: 지금 칸은 ink 600 + 아래 2px accent 밑줄, 나머지는 ink-2 500(설정 안 메뉴와 같은 모양)이고 줄 아래 1px 선이 있다', () => {
    pathname.mockReturnValue('/staff/leave')
    render(<StaffNav />)
    expect(classesOf(nav())).toEqual(expect.arrayContaining(['flex', 'border-b', 'border-line']))
    for (const a of links()) {
      const on = a.getAttribute('aria-current') === 'page'
      const look = on ? ['font-semibold', 'text-ink', 'after:bg-accent', 'after:h-0.5'] : ['font-medium', 'text-ink-2']
      expect(classesOf(a), a.textContent ?? '').toEqual(expect.arrayContaining(look))
      expect(classesOf(a), a.textContent ?? '').toEqual(expect.arrayContaining(['no-underline', 'whitespace-nowrap']))
      if (!on) expect(classesOf(a), a.textContent ?? '').not.toContain('after:bg-accent')
    }
  })
})

describe('AC-7611.4: 폰 전용 모양이 없다 — 넓은 표만 그 칸이 옆으로 밀린다', () => {
  it('AC-7611.4: TableScroll은 이름 있는 영역(region)이고 키보드 초점을 받으며(tabIndex 0) 그 칸만 옆으로 밀린다(overflow-x-auto·min-w-0·max-w-full)', () => {
    render(
      <TableScroll label="직원 명단 표">
        <table>
          <tbody>
            <tr>
              <td>김하늘</td>
            </tr>
          </tbody>
        </table>
      </TableScroll>,
    )
    const region = screen.getByRole('region', { name: '직원 명단 표' })
    expect(region.getAttribute('tabindex')).toBe('0')
    expect(classesOf(region)).toEqual(expect.arrayContaining(['overflow-x-auto', 'min-w-0', 'max-w-full']))
    expect(within(region).getByRole('table')).toBeTruthy()
    expect(within(region).getByText('김하늘')).toBeTruthy()
  })

  it.each(['src/components/staff/StaffNav.tsx', 'src/components/staff/TableScroll.tsx', 'src/app/(app)/staff/layout.tsx'])(
    'AC-7611.4: %s에 화면 폭 접두사(sm·md·lg·xl, max-·min- 포함)가 없다 — 폰에서도 PC 모양 그대로',
    (file) => {
      expect(read(file)).not.toMatch(/\b(?:max-|min-)?(?:sm|md|lg|\d*xl|\[[^\]]+\]):[a-z-]/)
    },
  )
})

// 글자는 요구사항·시안 글자 그대로: 근무 형태 AC-7612.3, 휴가 종류 AC-7614.2·AC-7614.3, 인센티브 방식 AC-7615.5, 더 일한 시간 AC-7613.4
describe('labels — 직원 탭 글자와 휴가 색', () => {
  it('AC-7612.3: 근무 형태 글자는 정규직·계약직·파트타임이다', () => {
    expect(EMPLOYMENT_LABEL).toEqual({ regular: '정규직', contract: '계약직', part: '파트타임' })
  })

  it('AC-7612.1·AC-7608.3: 직종 글자 — 목록 직종은 그대로, 기타는 직접 적은 직종(없으면 "기타")', () => {
    expect(jobLabel({ job: '물리치료사', jobOther: null })).toBe('물리치료사')
    expect(jobLabel({ job: '간호조무사', jobOther: '무시' })).toBe('간호조무사')
    expect(jobLabel({ job: '기타', jobOther: '영양사' })).toBe('영양사')
    expect(jobLabel({ job: '기타', jobOther: null })).toBe('기타')
    expect(jobLabel({ job: '기타', jobOther: '' })).toBe('기타')
  })

  it('AC-7614.2·AC-7614.3: 휴가 종류 글자는 연차·반차·경조사·병가·출산·육아휴직·무급(결근) 여섯이고, 반차는 오전 반차·오후 반차다', () => {
    expect(LEAVE_KIND_LABEL).toEqual({
      annual: '연차',
      half: '반차',
      family: '경조사',
      sick: '병가',
      maternity: '출산·육아휴직',
      unpaid: '무급(결근)',
    })
    expect(leaveLabel('half', 'am')).toBe('오전 반차')
    expect(leaveLabel('half', 'pm')).toBe('오후 반차')
    expect(leaveLabel('half', null)).toBe('반차')
    expect(leaveLabel('annual', null)).toBe('연차')
    expect(leaveLabel('unpaid', null)).toBe('무급(결근)')
  })

  it('AC-7615.5: 인센티브 방식 글자는 건당 정액·매출의 %·고정 수당이다', () => {
    expect(INCENTIVE_METHOD_LABEL).toEqual({ per_case: '건당 정액', percent: '매출의 %', fixed: '고정 수당' })
  })

  it('AC-7613.4: 더 일한 시간 종류 글자는 연장·야간·휴일이다', () => {
    expect(OVERTIME_KIND_LABEL).toEqual({ extended: '연장', night: '야간', holiday: '휴일' })
  })

  it('AC-7614.2: 휴가 색은 예약 달력 색 토큰을 빌린다 — 연차 파랑·반차 청록·경조사 보라·병가 분홍·출산·육아휴직 초록·무급(결근) 회색 점선', () => {
    const tone: Record<keyof typeof LEAVE_CHIP, string> = {
      annual: 'cal-blue',
      half: 'cal-teal',
      family: 'cal-purple',
      sick: 'cal-pink',
      maternity: 'cal-forest',
      unpaid: 'cal-gray',
    }
    expect(Object.keys(LEAVE_CHIP).sort()).toEqual(Object.keys(LEAVE_KIND_LABEL).sort())
    for (const [kind, color] of Object.entries(tone) as Array<[keyof typeof LEAVE_CHIP, string]>) {
      const classes = LEAVE_CHIP[kind].split(/\s+/)
      expect(classes, kind).toEqual(expect.arrayContaining([`bg-${color}-soft`, `text-${color}`, `border-${color}`, 'border-l-3', 'truncate', 'max-w-full']))
      // 다른 색 토큰이 섞이지 않는다
      expect(classes.filter((c) => /cal-/.test(c) && !c.includes(color)), kind).toEqual([])
      if (kind === 'unpaid') expect(classes, kind).toContain('border-dashed')
      else expect(classes, kind).not.toContain('border-dashed')
    }
  })
})

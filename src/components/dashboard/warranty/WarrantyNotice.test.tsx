// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { UnreadableNote } from '@/components/dashboard/live/ReadStatus'
import type { WarrantyItem } from '@/types/contacts'
import { WarrantyNotice } from './WarrantyNotice'

// 대시보드 무상 수리 알림 줄 (contacts REQ-6507, design.md '대시보드 알림', requirements.md '화면 글자' 대시보드 알림,
// 시안 docs/mockups/contacts/index.html ?s=dashboard·?s=dashboard-off의 .wnote). 읽기는 useWarrantySoon 몫이고 이 부품은 받은 줄만 그린다.
// 업체·장비는 모두 지어낸 값이다

const TODAY = '2026-11-21'
const item = (equipmentId: string, name: string, companyId: string, companyName: string, warrantyUntil: string): WarrantyItem => ({
  equipmentId,
  companyId,
  companyName,
  name,
  warrantyUntil,
})
// 시안 기본 두 줄: 오늘 끝나는 원내 서버 PC, 12일 남은 충격파 기계
const SERVER = item('e-server', '원내 서버 PC', 'c-pc', '예시전산', '2026-11-21')
const SHOCK = item('e-shock', '충격파 기계', 'c-medi', '예시메디칼', '2026-12-03')
const TRACTION = item('e-traction', '견인 치료기', 'c-medi', '예시메디칼', '2026-12-10')
const ULTRA = item('e-ultra', '초음파 진단기', 'c-sono', '예시소노', '2026-12-10')
const XRAY = item('e-xray', '엑스레이', 'c-ray', '예시방사선', '2026-12-21') // 30일 남음(끝)

const notice = () => screen.getByRole('status', { name: '무상 수리 알림' })
const links = () => within(notice()).getAllByRole('link')
const draw = (items: readonly WarrantyItem[], today = TODAY) => render(<WarrantyNotice items={items} today={today} />)
const tokens = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)

afterEach(() => {
  cleanup()
})

describe('WarrantyNotice: 줄 글자·차례·주소 (AC-6507.1)', () => {
  it('AC-6507.1: 줄은 적게 남은 것부터 "{장비 이름} 무상 수리 {n}일 남음 · {업체 이름}"(0일은 "오늘 끝나요") + 오른쪽 "주소록에서 보기"이고, 누르면 /contacts?c={업체 id}', () => {
    draw([SHOCK, SERVER])
    expect(links().map((a) => a.textContent)).toEqual([
      '원내 서버 PC 무상 수리 오늘 끝나요 · 예시전산주소록에서 보기',
      '충격파 기계 무상 수리 12일 남음 · 예시메디칼주소록에서 보기',
    ])
    expect(links().map((a) => a.getAttribute('href'))).toEqual(['/contacts?c=c-pc', '/contacts?c=c-medi'])
    for (const a of links()) expect(within(a).getByText('주소록에서 보기')).toBeTruthy()
  })

  it('AC-6507.1: 남은 날 글자만 주황(font-semibold text-warning)이고, 아이콘은 꾸밈(aria-hidden)이다', () => {
    draw([SHOCK, SERVER])
    for (const text of ['오늘 끝나요', '12일 남음']) {
      expect(tokens(screen.getByText(text))).toEqual(expect.arrayContaining(['font-semibold', 'text-warning']))
    }
    for (const svg of notice().querySelectorAll('svg')) expect(svg.getAttribute('aria-hidden')).toBe('true')
    // 업체 이름·장비 이름은 주황이 아니다
    expect(tokens(screen.getByText(/충격파 기계 무상 수리/))).not.toContain('text-warning')
  })

  it('AC-6507.1: 끝나는 날이 같으면 장비 이름 가나다 차례다', () => {
    draw([ULTRA, TRACTION])
    expect(links().map((a) => a.textContent)).toEqual([
      '견인 치료기 무상 수리 19일 남음 · 예시메디칼주소록에서 보기',
      '초음파 진단기 무상 수리 19일 남음 · 예시소노주소록에서 보기',
    ])
  })

  it('AC-6507.1: 셋까지는 넷째 줄이 없다', () => {
    draw([SHOCK, SERVER, TRACTION])
    expect(links()).toHaveLength(3)
    expect(screen.queryByText(/개 더 있어요/)).toBeNull()
  })

  it('AC-6507.1: 넷 이상이면 셋까지 보이고 넷째 줄 "무상 수리가 곧 끝나는 장비가 {n}개 더 있어요" + "주소록에서 보기"(누르면 /contacts)', () => {
    draw([XRAY, ULTRA, TRACTION, SHOCK, SERVER])
    const all = links()
    expect(all).toHaveLength(4)
    expect(all.slice(0, 3).map((a) => a.textContent)).toEqual([
      '원내 서버 PC 무상 수리 오늘 끝나요 · 예시전산주소록에서 보기',
      '충격파 기계 무상 수리 12일 남음 · 예시메디칼주소록에서 보기',
      '견인 치료기 무상 수리 19일 남음 · 예시메디칼주소록에서 보기',
    ])
    expect(all[3]!.textContent).toBe('무상 수리가 곧 끝나는 장비가 2개 더 있어요주소록에서 보기')
    expect(all[3]!.getAttribute('href')).toBe('/contacts')
    cleanup()
    draw([ULTRA, TRACTION, SHOCK, SERVER])
    expect(links()[3]!.textContent).toBe('무상 수리가 곧 끝나는 장비가 1개 더 있어요주소록에서 보기')
  })

  it('AC-6507.1: 업체 id는 주소 글자로 감싸 넣는다', () => {
    draw([item('e-1', '치료기', 'c 1&x=2', '예시상사', TODAY)])
    expect(links()[0]!.getAttribute('href')).toBe('/contacts?c=c%201%26x%3D2')
  })

  it('AC-6507.1: [닫기]가 없다 — 단추가 하나도 없다', () => {
    draw([XRAY, ULTRA, TRACTION, SHOCK, SERVER])
    expect(within(notice()).queryAllByRole('button')).toEqual([])
    expect(notice().textContent).not.toContain('닫기')
  })
})

describe('WarrantyNotice: 알릴 것이 없을 때 (AC-6507.2)', () => {
  it('AC-6507.2: 0줄이면 아무것도 그리지 않는다(빈 상자 없음)', () => {
    const { container } = draw([])
    expect(container.innerHTML).toBe('')
  })

  it('AC-6507.2: 오늘이 끝나는 날 다음 날이면 그 장비는 보이지 않고, 남은 날은 받은 오늘로 센다', () => {
    draw([SERVER, SHOCK], '2026-11-22')
    expect(links().map((a) => a.textContent)).toEqual(['충격파 기계 무상 수리 11일 남음 · 예시메디칼주소록에서 보기'])
  })

  it('AC-6507.2: 모두 끝났거나 30일보다 많이 남았으면 아무것도 그리지 않는다', () => {
    // 11월 22일 기준: 서버 PC는 어제 끝남, 온열기는 31일 남음
    const { container } = draw([SERVER, item('e-later', '온열기', 'c-heat', '예시온열', '2026-12-23')], '2026-11-22')
    expect(container.innerHTML).toBe('')
    cleanup()
    // 30일 남음(경계)은 보인다
    draw([item('e-edge', '온열기', 'c-heat', '예시온열', '2026-12-22')], '2026-11-22')
    expect(links().map((a) => a.textContent)).toEqual(['온열기 무상 수리 30일 남음 · 예시온열주소록에서 보기'])
  })
})

describe('WarrantyNotice: 모양 (AC-6507.1, 시안 .wnote)', () => {
  it("AC-6507.1: 묶음은 '이 PC에서 비트를 읽을 수 없어요' 안내(UnreadableNote)와 같은 옅은 회색 바탕·모서리·폭·위 간격이고 빨강이 아니다", () => {
    draw([SHOCK, SERVER])
    const shared = ['mt-3', 'max-w-130', 'rounded-control', 'bg-canvas']
    expect(tokens(notice())).toEqual(expect.arrayContaining(shared))
    expect(tokens(notice()).join(' ')).not.toMatch(/negative/)
    cleanup()
    render(<UnreadableNote />)
    expect(tokens(screen.getByRole('status'))).toEqual(expect.arrayContaining(shared))
  })

  it('AC-6507.1: 줄 사이는 1px 선(첫 줄 위는 없음)이고, 줄은 안쪽 여백 16·12, "주소록에서 보기"는 파란 글자 한 줄이다', () => {
    draw([SHOCK, SERVER, TRACTION])
    const [first, ...rest] = links()
    expect(tokens(first!)).toEqual(expect.arrayContaining(['px-4', 'py-3']))
    expect(tokens(first!)).not.toContain('border-t')
    for (const a of rest) expect(tokens(a)).toEqual(expect.arrayContaining(['border-t', 'border-line']))
    const go = within(first!).getByText('주소록에서 보기').parentElement!
    expect(tokens(go)).toEqual(expect.arrayContaining(['text-accent', 'whitespace-nowrap']))
  })

  it('AC-6507.1: 간격(여백·사이)은 앱 간격 단계만 쓴다(classes.test.ts AC-204.6) — 렌치는 본문 한 줄(22px) 높이 칸 가운데라 시안 위 3px와 같다', () => {
    draw([SHOCK, SERVER, TRACTION, ULTRA])
    const steps = new Set(['0', '0.5', '1', '1.5', '2', '3', '4', '5', '6', '8', '12', '16', '24', 'px', 'auto'])
    const spacing = /^-?(?:gap-x|gap-y|gap|space-x|space-y|px|py|pt|pr|pb|pl|ps|pe|p|mx|my|mt|mr|mb|ml|ms|me|m)-(.+)$/
    const bad = Array.from(notice().querySelectorAll('[class]'))
      .flatMap((el) => tokens(el))
      .filter((token) => {
        const m = token.split(':').at(-1)!.match(spacing)
        return m !== null && !steps.has(m[1]!)
      })
    expect(bad).toEqual([])
    for (const a of links()) {
      const wrench = a.firstElementChild!
      expect(tokens(wrench)).toEqual(expect.arrayContaining(['flex', 'h-5.5', 'items-center', 'text-warning']))
      expect(wrench.querySelector('svg')?.getAttribute('width')).toBe('16')
    }
  })

  it('AC-6507.1: 폰 전용 모양이 없다(max-md: 없음) — 받은 줄만 그리고 읽기·저장·Supabase를 쓰지 않는다', () => {
    const text = readFileSync(join(process.cwd(), 'src/components/dashboard/warranty/WarrantyNotice.tsx'), 'utf8')
    expect(text).not.toMatch(/max-md:|max-sm:/)
    expect(text).not.toMatch(/lib\/supabase|lib\/storage|\bfetch\(|localStorage|sessionStorage|indexedDB|console\.|'use client'/)
    expect(text).toMatch(/from '@\/lib\/contacts\/warranty'/)
  })
})

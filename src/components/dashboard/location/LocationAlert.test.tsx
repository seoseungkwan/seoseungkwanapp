// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LocationEvent } from '@/types/location'
import { LocationAlert } from './LocationAlert'

// 대시보드 새 경쟁 의원 알림 줄 (specs/location REQ-7915 AC-7915.2·AC-7915.3, design.md 12절,
// 시안 docs/mockups/location/index.html ?s=dashboard의 .wnote·.wnr·.wn·[닫기]). 읽기는 useLocationWatch 몫이고 이 부품은 받은 줄만 그린다.
// 의원·후보는 모두 지어낸 값이다.
// Next <Link>를 흉내 내 표시를 단다: 알림 줄이 <Link>를 쓰면 표시가 붙어 시험이 잡는다(입지 화면만 카카오 CSP라 새 문서로 불러와야 한다)
vi.mock('next/link', () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a data-next-link="" {...props} />,
}))

const CAND_A = '11111111-1111-4111-8111-111111111111'
const CAND_B = '22222222-2222-4222-8222-222222222222'
const event = (
  id: string,
  candidateId: string,
  kind: 'open' | 'close',
  clinicName: string,
  dept: string,
  eventOn: string,
  distM: number,
  createdAt = '2026-11-22T01:00:00.000Z',
): LocationEvent => ({ id, candidateId, kind, clinicName, dept, eventOn, distM, seenAt: null, createdAt })

// 시안 두 줄: 후보 A 둘레 새로 엶 / 후보 B 둘레 닫음
const OPENED = event('e0000000-0000-4000-8000-000000000001', CAND_A, 'open', '예시★★정형외과', '정형외과', '2026-11-10', 950)
const CLOSED = event('e0000000-0000-4000-8000-000000000002', CAND_B, 'close', '예시▼▼정형외과', '정형외과', '2026-11-05', 700)
const PAIN = event('e0000000-0000-4000-8000-000000000003', CAND_A, 'open', '예시◆◆통증의원', '마취통증의학과', '2026-11-03', 1450)
const REHAB = event('e0000000-0000-4000-8000-000000000004', CAND_B, 'close', '예시■■의원', '재활의학과', '2026-10-28', 2000)
const OLDEST = event('e0000000-0000-4000-8000-000000000005', CAND_A, 'open', '예시●●의원', '정형외과', '2026-10-25', 300)

const box = () => screen.getByRole('status', { name: '입지 알림' })
const links = () => within(box()).getAllByRole('link')
const closes = () => within(box()).queryAllByRole('button')
const draw = (events: readonly LocationEvent[], onClose: (id: string) => void = vi.fn()) => render(<LocationAlert events={events} onClose={onClose} />)
const tokens = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
const SOURCE = () => readFileSync(join(process.cwd(), 'src/components/dashboard/location/LocationAlert.tsx'), 'utf8')

afterEach(() => {
  cleanup()
})

describe('LocationAlert: 줄 글자·차례·주소 (AC-7915.2)', () => {
  it('AC-7915.2: 개업은 "저장한 후보 둘레에 {과목}가 새로 문을 열었어요", 폐업은 "…둘레에서 {과목}가 문을 닫았어요" + 아래 "{의원 이름} · {거리} · {M월 D일}" + 오른쪽 "입지 분석에서 보기"', () => {
    draw([CLOSED, OPENED])
    expect(links().map((a) => a.textContent)).toEqual([
      '저장한 후보 둘레에 정형외과가 새로 문을 열었어요예시★★정형외과 · 950m · 11월 10일입지 분석에서 보기',
      '저장한 후보 둘레에서 정형외과가 문을 닫았어요예시▼▼정형외과 · 700m · 11월 5일입지 분석에서 보기',
    ])
    for (const a of links()) expect(within(a).getByText('입지 분석에서 보기')).toBeTruthy()
  })

  it('AC-7915.2: 과목 글은 줄의 과목(없으면 이름)에 든 정형외과·마취통증의학과·재활의학과이고, 거리는 AC-7905.6 모양(1.4km·2km)이다', () => {
    draw([PAIN, REHAB, event('e0000000-0000-4000-8000-000000000009', CAND_A, 'open', '예시재활의학과의원', '', '2026-11-01', 0)])
    expect(links().map((a) => a.textContent)).toEqual([
      '저장한 후보 둘레에 마취통증의학과가 새로 문을 열었어요예시◆◆통증의원 · 1.4km · 11월 3일입지 분석에서 보기',
      '저장한 후보 둘레에 재활의학과가 새로 문을 열었어요예시재활의학과의원 · 0m · 11월 1일입지 분석에서 보기',
      '저장한 후보 둘레에서 재활의학과가 문을 닫았어요예시■■의원 · 2km · 10월 28일입지 분석에서 보기',
    ])
  })

  it('AC-7915.2: 과목·이름에서 과목을 찾지 못하면 "경쟁 의원이"라고 쓴다(그려지다 멈추지 않는다)', () => {
    draw([event('e0000000-0000-4000-8000-00000000000a', CAND_A, 'close', '예시의원', '', '2026-11-02', 120)])
    expect(links()[0]!.textContent).toBe('저장한 후보 둘레에서 경쟁 의원이 문을 닫았어요예시의원 · 120m · 11월 2일입지 분석에서 보기')
  })

  it('AC-7915.2: 개업·폐업 글자만 주황(font-semibold text-warning)이고, 핀 그림은 꾸밈(aria-hidden)이다', () => {
    draw([OPENED, CLOSED])
    for (const text of ['새로 문을 열었어요', '문을 닫았어요']) {
      expect(tokens(screen.getByText(text))).toEqual(expect.arrayContaining(['font-semibold', 'text-warning']))
    }
    expect(tokens(screen.getByText(/예시★★정형외과 ·/))).not.toContain('text-warning')
    for (const svg of box().querySelectorAll('svg')) expect(svg.getAttribute('aria-hidden')).toBe('true')
  })

  it('AC-7915.2: 누르면 /location?c=<후보 id>&tab=detail이다(후보 id는 주소 글자로 감싼다)', () => {
    draw([OPENED, CLOSED, event('e0000000-0000-4000-8000-00000000000b', 'c 1&x=2', 'open', '예시의원', '정형외과', '2026-11-01', 10)])
    expect(links().map((a) => a.getAttribute('href'))).toEqual([
      `/location?c=${CAND_A}&tab=detail`,
      `/location?c=${CAND_B}&tab=detail`,
      '/location?c=c%201%26x%3D2&tab=detail',
    ])
  })

  it('AC-7915.2: 최근 차례(일어난 날 → 넣은 시각이 늦은 것 먼저)다', () => {
    const sameDayLater = event('e0000000-0000-4000-8000-00000000000c', CAND_B, 'open', '예시나중정형외과', '정형외과', '2026-11-10', 400, '2026-11-22T02:00:00.000Z')
    draw([OLDEST, CLOSED, OPENED, sameDayLater])
    expect(links().map((a) => a.querySelector('small')?.textContent)).toEqual([
      '예시나중정형외과 · 400m · 11월 10일',
      '예시★★정형외과 · 950m · 11월 10일',
      '예시▼▼정형외과 · 700m · 11월 5일',
      undefined, // 넷째 줄은 나머지 수(아래 줄 없음)
    ])
  })

  it('AC-7915.2: 셋까지는 넷째 줄이 없다', () => {
    draw([OPENED, CLOSED, PAIN])
    expect(links()).toHaveLength(3)
    expect(screen.queryByText(/건 더/)).toBeNull()
  })

  it('AC-7915.2: 넷 이상이면 셋까지 보이고 넷째 줄 "… {n}건 더" + "입지 분석에서 보기"(누르면 /location)다', () => {
    draw([OLDEST, REHAB, PAIN, CLOSED, OPENED])
    const all = links()
    expect(all).toHaveLength(4)
    expect(all[3]!.textContent).toBe('… 2건 더입지 분석에서 보기')
    expect(all[3]!.getAttribute('href')).toBe('/location')
    cleanup()
    draw([REHAB, PAIN, CLOSED, OPENED])
    expect(links()[3]!.textContent).toBe('… 1건 더입지 분석에서 보기')
  })
})

describe('LocationAlert: [닫기] (AC-7915.2)', () => {
  it('AC-7915.2: 보이는 줄마다 오른쪽에 [닫기]가 있고(이름 "{의원 이름} 알림 닫기"), "… {n}건 더" 줄에는 없다', () => {
    draw([OLDEST, REHAB, PAIN, CLOSED, OPENED])
    expect(closes().map((b) => [b.textContent, b.getAttribute('aria-label')])).toEqual([
      ['닫기', '예시★★정형외과 알림 닫기'],
      ['닫기', '예시▼▼정형외과 알림 닫기'],
      ['닫기', '예시◆◆통증의원 알림 닫기'],
    ])
    for (const b of closes()) expect(b.getAttribute('type')).toBe('button')
    // [닫기]는 링크 밖(누르면 입지 화면으로 가지 않는다)
    for (const a of links()) expect(within(a).queryByRole('button')).toBeNull()
  })

  it('AC-7915.2: [닫기]를 누르면 그 줄의 id로 onClose를 한 번 부른다(그 줄을 본 것으로 적는 일은 부르는 쪽)', () => {
    const onClose = vi.fn()
    draw([OPENED, CLOSED], onClose)
    fireEvent.click(screen.getByRole('button', { name: '예시▼▼정형외과 알림 닫기' }))
    expect(onClose.mock.calls).toEqual([[CLOSED.id]])
  })
})

describe('LocationAlert: 평범한 링크 — 새 문서로 불러온다 (AC-7915.2, design.md 13절 CSP)', () => {
  it('AC-7915.2: 줄 링크는 Next <Link>가 아니라 평범한 <a href>다 — <Link> 표시가 없고, 눌러도 기본 이동을 막지 않는다(화면 안에서 넘어가지 않음)', () => {
    draw([OLDEST, REHAB, PAIN, CLOSED, OPENED])
    expect(links()).toHaveLength(4)
    for (const a of links()) {
      expect(a.tagName).toBe('A')
      expect(a.hasAttribute('data-next-link')).toBe(false)
      expect(a.getAttribute('target')).toBeNull() // 같은 창에서 새 문서
    }
    // 브라우저가 문서를 새로 불러오는지: 누른 뒤 기본 동작이 막히지 않았는지를 맨 끝(창)에서 보고, jsdom의 이동만 여기서 멈춘다
    const prevented: boolean[] = []
    const watch = (e: Event) => {
      prevented.push(e.defaultPrevented)
      e.preventDefault()
    }
    window.addEventListener('click', watch)
    try {
      for (const a of links()) fireEvent.click(a)
    } finally {
      window.removeEventListener('click', watch)
    }
    expect(prevented).toEqual([false, false, false, false])
  })

  it('AC-7915.2: 소스가 next/link·라우터를 쓰지 않는다', () => {
    const text = SOURCE()
    expect(text).not.toMatch(/next\/link|<Link\b|next\/navigation|useRouter/)
    expect(text).toMatch(/<a\b/)
  })
})

describe('LocationAlert: 알릴 것이 없을 때 (AC-7915.3)', () => {
  it('AC-7915.3: 0줄이면 아무것도 그리지 않는다(빈 상자·오류 글 없음)', () => {
    const { container } = draw([])
    expect(container.innerHTML).toBe('')
  })
})

describe('LocationAlert: 모양 (AC-7915.2, 시안 .wnote·.wnr)', () => {
  it('AC-7915.2: 묶음은 무상 수리 알림과 같은 옅은 회색 바탕·모서리·폭·위 간격이고, 바로 앞이 알림 묶음(role=status)이면 위 간격이 8px(시안 .wnote + .wnote)이다', () => {
    draw([OPENED])
    expect(tokens(box())).toEqual(expect.arrayContaining(['mt-3', 'max-w-130', 'rounded-control', 'bg-canvas', '[[role=status]+&]:mt-2']))
    expect(tokens(box()).join(' ')).not.toMatch(/negative/)
  })

  it('AC-7915.2: 줄 사이는 1px 선(첫 줄 위는 없음)이고, 줄은 안쪽 여백 왼쪽 16·위아래 12·[닫기] 쪽 8, "입지 분석에서 보기"는 파란 글자 한 줄이다', () => {
    draw([OLDEST, REHAB, PAIN, CLOSED, OPENED])
    const rows = Array.from(box().children)
    expect(rows).toHaveLength(4)
    expect(tokens(rows[0]!)).not.toContain('border-t')
    for (const row of rows.slice(1)) expect(tokens(row)).toEqual(expect.arrayContaining(['border-t', 'border-line']))
    const [first] = links()
    expect(tokens(first!)).toEqual(expect.arrayContaining(['pl-4', 'py-3', 'pr-2']))
    const go = within(first!).getByText('입지 분석에서 보기').parentElement!
    expect(tokens(go)).toEqual(expect.arrayContaining(['text-accent', 'whitespace-nowrap']))
    expect(tokens(closes()[0]!)).toEqual(expect.arrayContaining(['text-ink-2', 'text-small']))
  })

  it('AC-7915.2: 간격(여백·사이)은 앱 간격 단계만 쓴다 — 핀은 본문 한 줄(22px) 높이 칸 가운데, [닫기]는 첫 줄 높이에 맞춘다', () => {
    draw([OLDEST, REHAB, PAIN, CLOSED, OPENED])
    const steps = new Set(['0', '0.5', '1', '1.5', '2', '3', '4', '5', '6', '8', '12', '16', '24', 'px', 'auto'])
    const spacing = /^-?(?:gap-x|gap-y|gap|space-x|space-y|px|py|pt|pr|pb|pl|ps|pe|p|mx|my|mt|mr|mb|ml|ms|me|m)-(.+)$/
    const all = [box(), ...Array.from(box().querySelectorAll('[class]'))]
    const bad = all
      .flatMap((el) => tokens(el))
      .filter((token) => {
        const m = token.split(':').at(-1)!.match(spacing)
        return m !== null && !steps.has(m[1]!)
      })
    expect(bad).toEqual([])
    for (const a of links()) {
      const pin = a.firstElementChild!
      expect(tokens(pin)).toEqual(expect.arrayContaining(['flex', 'h-5.5', 'items-center', 'text-warning']))
      expect(pin.querySelector('svg')?.getAttribute('width')).toBe('16')
    }
    for (const b of closes()) expect(tokens(b)).toEqual(expect.arrayContaining(['mt-3', 'h-5.5']))
  })

  it('AC-7915.2: 폰 전용 모양이 없다(max-md: 없음) — 받은 줄만 그리고 읽기·저장·Supabase를 쓰지 않는다', () => {
    const text = SOURCE()
    expect(text).not.toMatch(/max-md:|max-sm:/)
    expect(text).not.toMatch(/lib\/supabase|lib\/storage|components\/location\/clients|\bfetch\(|localStorage|sessionStorage|indexedDB|console\./)
    expect(text).toMatch(/from '@\/lib\/location\/coords'/) // 거리 글은 distText 한 곳
  })
})

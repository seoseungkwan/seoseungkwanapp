// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SummaryCell, deltaLine } from './SummaryCell'

// 요약 칸 하나 (first90 REQ-4403·REQ-4408, design.md 5-0 '요약 칸 모양은 SummaryCell 하나를 두 줄이 같이 쓴다', 시안 docs/mockups/first90/redesign.html .s-kpi).
// 이름(+옆 글·꼬리표) → 큰 숫자 + 작은 단위 → 증감 줄 → 아래 글. 숫자는 지어낸 값이다

afterEach(cleanup)

const classes = (el: Element) => el.className.split(' ').filter(Boolean)

describe('AC-4403.1·AC-4408.2 SummaryCell 모양', () => {
  it('AC-4403.1 이름 · 옆 글 → 숫자 + 단위 → 증감 줄 차례이고, 글은 이어 읽힌다', () => {
    const { container } = render(<SummaryCell label="하루 평균 내원" hint="진료한 날 26일 평균" value="92" unit="건" lines={[{ dir: 'down', text: '3건 (−3.1%)', tail: '줄어듦' }]} />)
    expect(container.firstElementChild!.textContent).toBe('하루 평균 내원진료한 날 26일 평균92건▼ 3건 (−3.1%) 줄어듦')
    expect([...container.firstElementChild!.children].map((el) => el.tagName)).toEqual(['P', 'P', 'P'])
  })

  it('AC-4403.1 768px 미만은 이름 옆 글이 이름 아래로 내려간다(숫자와 겹치지 않음)', () => {
    render(<SummaryCell label="신환" hint="처음 온 환자" value="238" unit="명" />)
    const head = screen.getByText('신환').parentElement!
    expect(classes(head)).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'max-md:block']))
    expect(classes(screen.getByText('처음 온 환자'))).toEqual(expect.arrayContaining(['text-st-muted', 'max-md:block']))
    expect(classes(screen.getByText('신환'))).toEqual(expect.arrayContaining(['font-semibold', 'text-st-ink-2']))
  })

  it('AC-4403.1 숫자는 34px(xl은 40px) 600 고정폭, 단위는 16px 600 ink-2 작은 글자다', () => {
    render(
      <>
        <SummaryCell label="재진" value="1,877" unit="건" />
        <SummaryCell label="총매출" value="1억 3,261만" unit="원" size="xl" />
      </>,
    )
    const base = screen.getByText('1,877')
    expect(classes(base)).toEqual(expect.arrayContaining(['text-st-34', 'font-semibold', 'text-st-ink']))
    expect(classes(base.parentElement!)).toContain('tabular-nums')
    expect(classes(screen.getByText('1억 3,261만'))).toContain('text-st-40')
    const unit = within(screen.getByText('1,877').parentElement!).getByText('건')
    expect(classes(unit)).toEqual(expect.arrayContaining(['text-lead', 'font-semibold', 'text-st-ink-2']))
  })

  it('AC-4403.2 증감 줄: 꾸밈 ▲·▼(aria-hidden) + 글 + 옅은 꼬리 글, 늘면 초록·줄면 빨강이고 색만 쓰지 않는다', () => {
    render(
      <>
        <SummaryCell label="가" value="1" lines={[{ dir: 'up', text: '60만 원 (+0.4%)', tail: '지난 30일보다 늘어남' }]} />
        <SummaryCell label="나" value="2" lines={[{ dir: 'down', text: '13명 (−5.1%)', tail: '줄어듦' }]} />
      </>,
    )
    const up = screen.getByText('지난 30일보다 늘어남').parentElement!
    expect(classes(up)).toEqual(expect.arrayContaining(['text-small', 'font-semibold', 'text-positive']))
    expect(up.querySelector('[aria-hidden="true"]')!.textContent).toBe('▲ ')
    expect(classes(screen.getByText('지난 30일보다 늘어남'))).toEqual(expect.arrayContaining(['font-normal', 'text-st-muted']))
    expect(classes(screen.getByText('줄어듦').parentElement!)).toContain('text-negative')
  })

  it('AC-4403.2 neutral 칸(90일초진·재진·건당 진료비)의 증감 줄은 ink-2이고, 변화 없음·견줄 수 없음은 화살표가 없다', () => {
    render(
      <>
        <SummaryCell label="가" value="1" neutral lines={[{ dir: 'up', text: '+2.9%', tail: '' }]} />
        <SummaryCell label="나" value="2" lines={[{ dir: 'flat', text: '변화 없음', tail: '' }]} />
        <SummaryCell label="다" value="3" lines={[{ dir: 'none', text: '비교할 자료가 없어요', tail: '' }]} />
      </>,
    )
    expect(classes(screen.getByText('+2.9%', { exact: false }))).toContain('text-st-ink-2')
    for (const text of ['변화 없음', '비교할 자료가 없어요']) {
      const line = screen.getByText(text)
      expect(line.textContent).not.toMatch(/[▲▼]/)
      expect(line.querySelector('[aria-hidden="true"]')).toBeNull()
    }
  })

  it('AC-4403.2 둘째 줄은 앞말("{작년 이름}보다")을 붙인다', () => {
    const { container } = render(
      <SummaryCell
        label="하루 평균 내원"
        value="42"
        unit="건"
        lines={[
          { dir: 'up', text: '12건 (+40.0%)', tail: '늘어남' },
          { dir: 'down', text: '8건 (−16.0%)', tail: '줄어듦', lead: '작년 10월보다' },
        ]}
      />,
    )
    const lines = [...container.firstElementChild!.children].slice(2)
    expect(lines.map((el) => el.textContent)).toEqual(['▲ 12건 (+40.0%) 늘어남', '작년 10월보다 ▼ 8건 (−16.0%) 줄어듦'])
  })

  it('AC-4403.3 "확인 불가"는 22px warn 글자이고 단위·증감이 없으며 아래 글은 ink-2다', () => {
    const { container } = render(<SummaryCell label="90일초진" value="확인 불가" tone="na" unit="건" notes={['예전 도우미(0.6.0)는 90일초진을 따로 세지 못해요. 지금은 재진에 들어 있어요.']} />)
    expect(classes(screen.getByText('확인 불가'))).toEqual(expect.arrayContaining(['text-st-22', 'font-semibold', 'text-st-warn-ink']))
    expect(container.textContent).toBe('90일초진확인 불가예전 도우미(0.6.0)는 90일초진을 따로 세지 못해요. 지금은 재진에 들어 있어요.')
    expect(classes(screen.getByText(/예전 도우미/))).toContain('text-st-ink-2')
  })

  it('AC-4408.2 값이 없으면 "–"(muted)이고 단위를 붙이지 않는다. warn 값은 warn 글자다', () => {
    render(
      <>
        <SummaryCell label="총매출" value={null} unit="원" notes={['자료 없음']} />
        <SummaryCell label="확인 필요한 날" value="1" unit="일" tone="warn" notes={['10월 28일 · 금액이 확실하지 않아 뺐어요']} />
      </>,
    )
    expect(classes(screen.getByText('–'))).toContain('text-st-muted')
    expect(screen.getByText('–').parentElement!.textContent).toBe('–')
    expect(classes(screen.getByText('1'))).toContain('text-st-warn-ink')
    expect(classes(screen.getByText('10월 28일 · 금액이 확실하지 않아 뺐어요'))).toEqual(expect.arrayContaining(['text-small', 'text-st-muted']))
  })

  it('AC-4408.2·AC-4417.3 "참고 포함" 꼬리표는 이름 옆 둥근 옅은 노랑(warn 글자)이고 붙을 때 st-tag-in이다', () => {
    render(<SummaryCell label="건당 진료비" tag hint="매출 ÷ 접수 2,408건" value="57,139" unit="원" />)
    const tag = screen.getByText('참고 포함')
    expect(tag.parentElement).toBe(screen.getByText('건당 진료비').parentElement)
    expect(classes(tag)).toEqual(expect.arrayContaining(['st-tag-in', 'rounded-full', 'bg-warning-soft', 'text-st-warn-ink', 'text-caption', 'font-semibold']))
    expect(tag.previousElementSibling!.textContent).toBe('건당 진료비')
  })

  it('AC-4403.1 덜 끝난 칸이 든 합에는 "일부 기간" 칩이 이름 줄에 붙는다', () => {
    render(<SummaryCell label="신환" hint="처음 온 환자" value="15" unit="명" partial />)
    expect(screen.getByText('일부 기간').parentElement).toBe(screen.getByText('신환').parentElement)
  })

  it('AC-4417.3 className(st-flash 등)은 칸 바깥에 붙는다', () => {
    const { container } = render(<SummaryCell label="총매출" value="1" className="st-flash" />)
    expect(classes(container.firstElementChild!)).toEqual(expect.arrayContaining(['min-w-0', 'st-flash']))
  })
})

describe('AC-4403.2 deltaLine: 환자 증감 → 증감 줄', () => {
  it('AC-4403.2 formatDelta 글·방향 글이고, 견줄 수 없으면 "비교할 자료가 없어요"다', () => {
    expect(deltaLine({ kind: 'change', diff: -3, pct: -3.1 }, '건')).toEqual({ dir: 'down', text: '3건 (−3.1%)', tail: '줄어듦' })
    expect(deltaLine({ kind: 'change', diff: 12, pct: 4.2 }, '명')).toEqual({ dir: 'up', text: '12명 (+4.2%)', tail: '늘어남' })
    expect(deltaLine({ kind: 'change', diff: 0, pct: 0 }, '건')).toEqual({ dir: 'flat', text: '변화 없음', tail: '' })
    expect(deltaLine({ kind: 'unavailable' }, '건')).toEqual({ dir: 'none', text: '비교할 자료가 없어요', tail: '' })
    expect(deltaLine({ kind: 'change', diff: 5, pct: 10 }, '건', '작년 10월보다')).toEqual({ dir: 'up', text: '5건 (+10.0%)', tail: '늘어남', lead: '작년 10월보다' })
  })
})

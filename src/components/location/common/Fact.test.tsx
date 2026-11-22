// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { commaText } from '@/lib/location/money'
import type { Got, Why } from '@/types/location'
import { Fact, Facts } from './Fact'

afterEach(cleanup)

const people: Got<number> = { ok: true, v: 18420, src: 'pop-age', asOf: '2026-10-31' }
const count = (n: number) => commaText(n)

describe('AC-7906.2: 숫자 칸 Fact', () => {
  it('AC-7906.2: 이름 · 값(단위) · 곁글 · 아래 출처 줄 `{기관} {자료} · 기준 {날짜}`(근거와 출처 링크)', () => {
    render(<Fact label="사는 사람" got={people} value={count} unit="명" note="행정동 기준" />)
    expect(screen.getByText('사는 사람')).toBeTruthy()
    expect(screen.getByText('18,420')).toBeTruthy()
    expect(screen.getByText('명')).toBeTruthy()
    expect(screen.getByText('행정동 기준')).toBeTruthy()
    const link = screen.getByRole('link')
    expect(link.textContent).toBe('행정안전부 행정동별(통반단위) 성/연령별 주민등록 인구수 · 기준 2026년 10월 31일')
    expect(link.getAttribute('href')).toBe('/location?tab=sources#src-pop-age')
  })

  it('AC-7906.2: 곁글이 함수면 값으로 만든다', () => {
    render(<Fact label="60세 이상" got={people} value={count} unit="명" note={(v) => `사는 사람 ${commaText(v)}명 가운데`} />)
    expect(screen.getByText('사는 사람 18,420명 가운데')).toBeTruthy()
  })

  it('AC-7906.2: 출처 id가 SOURCES에 없으면 칸을 그리지 않는다(값도 만들지 않음)', () => {
    const value = vi.fn(count)
    const { container } = render(
      <Fact label="사는 사람" got={{ ok: true, v: 1, src: 'no-such-source', asOf: '2026-10-31' }} value={value} />,
    )
    expect(container.innerHTML).toBe('')
    expect(value).not.toHaveBeenCalled()
  })

  it('AC-7906.2: 출처 줄 여는 콜백을 주면 누를 때 그 출처 id로 부른다', () => {
    const onOpenSource = vi.fn()
    render(<Fact label="사는 사람" got={people} value={count} onOpenSource={onOpenSource} />)
    fireEvent.click(screen.getByRole('link'))
    expect(onOpenSource).toHaveBeenCalledWith('pop-age')
  })

  it('AC-7906.2: 한 칸에 출처가 둘 이상이면 덧붙임이 출처 줄 끝에 붙는다', () => {
    render(<Fact label="경쟁 의원" got={{ ok: true, v: 6, src: 'hosp-list', asOf: '2026-11-15' }} value={count} extra="의원·과목" />)
    expect(screen.getByRole('link').textContent).toBe('건강보험심사평가원 병원정보서비스 · 기준 2026년 11월 15일 · 의원·과목')
  })
})

describe('AC-7917.2: 자료가 없을 때 그 칸 자리', () => {
  it.each<[Why, string, string]>([
    ['no-key', 'hosp-list', '병원정보서비스: 열쇠를 넣으면 보여요.'],
    ['not-applied', 'hosp-list', "공공데이터포털에서 '병원정보서비스' 활용신청을 하면 보여요."],
    ['failed', 'hosp-list', '지금 받지 못했어요.'],
    ['none', 'hosp-list', '범위 안에서 찾은 의원이 없어요.'],
    ['outside', 'flow-volume', '이 지역은 자료 없음'],
  ])('AC-7917.2: %s → 값 자리에 design.md 15절 글이 보이고 다른 칸은 그대로다', (why, src, text) => {
    const value = vi.fn(count)
    render(
      <Facts>
        <Fact label="경쟁 의원" got={{ ok: false, why, src }} value={value} unit="곳" />
        <Fact label="사는 사람" got={people} value={count} unit="명" />
      </Facts>,
    )
    expect(screen.getByText(text)).toBeTruthy()
    expect(value).not.toHaveBeenCalled()
    expect(screen.queryByText('곳')).toBeNull()
    // 다른 칸은 그대로
    expect(screen.getByText('18,420')).toBeTruthy()
    expect(screen.getByText('명')).toBeTruthy()
  })

  it('AC-7917.2: 값이 없어도 출처 줄은 남고(기준 날짜 없이) 고정 곁글도 보인다, 함수 곁글은 값이 있을 때만', () => {
    render(
      <>
        <Fact label="사람 흐름" got={{ ok: false, why: 'outside', src: 'flow-volume' }} value={count} note="교통카드 찍은 사람 수예요(걷는 사람 수와 달라요)" />
        <Fact label="60세 이상" got={{ ok: false, why: 'none', src: 'pop-age' }} value={count} note={(v) => `값 ${v}`} />
      </>,
    )
    const [flow, old] = screen.getAllByRole('link')
    expect(flow!.textContent).toBe('국토교통부 정류장별 이용량')
    expect(old!.textContent).toBe('행정안전부 행정동별(통반단위) 성/연령별 주민등록 인구수')
    expect(screen.getByText('교통카드 찍은 사람 수예요(걷는 사람 수와 달라요)')).toBeTruthy()
    expect(screen.queryByText(/^값 /)).toBeNull()
  })

  it('AC-7917.2: failed는 [다시 받기]로 다시 받기 콜백을 부른다', () => {
    const onRetry = vi.fn()
    render(<Fact label="경쟁 의원" got={{ ok: false, why: 'failed', src: 'hosp-list' }} value={count} onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: '다시 받기' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('AC-7917.2: 옛 값이 있으면 지난 값을 보이고 `지난 값 · 기준 {날짜}`·출처 줄 기준 날짜는 옛 값의 날짜다', () => {
    const got: Got<number> = { ok: false, why: 'failed', src: 'hosp-list', prev: { v: 7, asOf: '2026-11-01' } }
    const onRetry = vi.fn()
    render(<Fact label="경쟁 의원" got={got} value={count} unit="곳" onRetry={onRetry} />)
    expect(screen.getByText('7')).toBeTruthy()
    expect(screen.getByText('곳')).toBeTruthy()
    expect(screen.getByText('지금 받지 못했어요.')).toBeTruthy()
    expect(screen.getByText('지난 값 · 기준 2026년 11월 1일')).toBeTruthy()
    expect(screen.getByRole('link').textContent).toBe('건강보험심사평가원 병원정보서비스 · 기준 2026년 11월 1일')
    fireEvent.click(screen.getByRole('button', { name: '다시 받기' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('AC-7917.2: 옛 값은 실패 까닭이 달라도(열쇠 없음) `지난 값`으로 적는다 — 지금 값으로 보이지 않게', () => {
    const got: Got<number> = { ok: false, why: 'no-key', src: 'hosp-list', prev: { v: 7, asOf: '2026-11-01' } }
    render(<Fact label="경쟁 의원" got={got} value={count} />)
    expect(screen.getByText('7')).toBeTruthy()
    expect(screen.getByText('병원정보서비스: 열쇠를 넣으면 보여요.')).toBeTruthy()
    expect(screen.getByText('지난 값 · 기준 2026년 11월 1일')).toBeTruthy()
  })

  it('AC-7917.2: 목록 한도에 걸린 값(capped)은 값 아래 `{n}곳 넘게 있어요. 가까운 {n}곳만 셌어요.`', () => {
    render(<Fact label="둘레 약국" got={{ ok: true, v: 45, src: 'kakao-local', asOf: '2026-11-22' }} value={count} unit="곳" capped={45} />)
    expect(screen.getByText('45')).toBeTruthy()
    expect(screen.getByText('45곳 넘게 있어요. 가까운 45곳만 셌어요.')).toBeTruthy()
  })

  it('AC-7917.2: 한도에 걸리지 않으면 capped 글이 없다', () => {
    render(<Fact label="둘레 약국" got={{ ok: true, v: 3, src: 'kakao-local', asOf: '2026-11-22' }} value={count} capped={null} />)
    expect(screen.queryByText(/곳만 셌어요/)).toBeNull()
  })
})

describe('AC-7906.2·AC-7917.2: 숫자 칸 줄 Facts', () => {
  it('AC-7906.2: 칸들을 한 줄 격자로 놓는다(3칸·4칸)', () => {
    render(
      <>
        <Facts cols={3}>
          <Fact label="가" got={people} value={count} />
        </Facts>
        <Facts>
          <Fact label="나" got={people} value={count} />
        </Facts>
      </>,
    )
    const three = screen.getByText('가').closest('.grid')!
    const four = screen.getByText('나').closest('.grid')!
    expect(three.className).toContain('grid-cols-3')
    expect(four.className).toContain('grid-cols-4')
    expect(within(three as HTMLElement).getByText('18,420')).toBeTruthy()
  })

  it('AC-7906.2·AC-7917.2: 공용 부품 소스는 props·콜백만 — 저장·부르기(supabase·fetch)·폰 전용 모양(max-md:)이 없다', () => {
    const dir = join(process.cwd(), 'src/components/location/common')
    const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    expect(files.length).toBeGreaterThanOrEqual(4)
    for (const f of files) {
      const src = readFileSync(join(dir, f), 'utf8')
      expect(src, f).not.toMatch(/supabase|fetch\(|localStorage|sessionStorage|console\./)
      expect(src, f).not.toContain('max-md:')
      expect(src, f).not.toMatch(/#[0-9A-Fa-f]{3,8}\b|rgb\(/)
    }
  })
})

// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Got } from '@/types/location'
import { SNAP } from './fixture.test.data'
import { FutureSection, IncomeSection, PeopleSection } from './index'

afterEach(cleanup)

const section = (id: string) => {
  const el = document.getElementById(`sec-${id}`)
  if (!el) throw new Error(`sec-${id} 없음`)
  return el
}
// dl 줄(dt 이름 → dd 글자)
const rowOf = (root: HTMLElement, label: string) => {
  const dt = within(root).getByText(label, { selector: 'dt' })
  const dd = dt.parentElement?.querySelector('dd')
  if (!dd) throw new Error(`${label} dd 없음`)
  return dd
}
const flat = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()

describe('AC-7909.2: 사는 사람 묶음', () => {
  it('AC-7909.2: 묶음 머리 `사는 사람` · `범위 {거리} 안`, 목차가 건너뛸 닻 sec-people', () => {
    render(<PeopleSection snapshot={SNAP} />)
    const s = section('people')
    expect(within(s).getByRole('heading', { level: 3 }).textContent).toBe('사는 사람')
    expect(within(s).getByText('범위 1km 안')).toBeTruthy()
  })

  it('AC-7909.2: 범위 인구 · 세대 수 · 60세 이상(사는 사람의 %) · 아파트 세대 — 칸 아래 행정동·법정동 기준 글', () => {
    render(<PeopleSection snapshot={SNAP} />)
    const s = section('people')
    expect(within(s).getByText('10,520')).toBeTruthy()
    expect(within(s).getByText('4,800')).toBeTruthy()
    expect(within(s).getByText('3,220')).toBeTruthy()
    expect(within(s).getByText('사는 사람의 30%')).toBeTruthy()
    expect(within(s).getByText('5,800')).toBeTruthy()
    expect(within(s).getByText('5개 단지 · 법정동 기준')).toBeTruthy()
    expect(within(s).getAllByText('행정동 기준')).toHaveLength(2)
  })

  it('AC-7909.2: 나이대 넷 — 이름과 `{%} · {명}명`', () => {
    render(<PeopleSection snapshot={SNAP} />)
    const s = section('people')
    for (const [label, text] of [
      ['0~19세', '16% · 1,700명'],
      ['20~39세', '23% · 2,500명'],
      ['40~59세', '29% · 3,100명'],
      ['60세 이상', '30% · 3,220명'],
    ]) {
      const row = within(s).getByText(text).parentElement!
      expect(row.firstElementChild?.textContent).toBe(label)
    }
  })

  it('AC-7909.2: 4년 추세 — `▲ +5.2%` · `(2022년 10월부터 · 해마다 10월)` · 해마다 막대(2022~2026)', () => {
    render(<PeopleSection snapshot={SNAP} />)
    const s = section('people')
    expect(within(s).getByText('4년 추세')).toBeTruthy()
    expect(within(s).getByText('▲ +5.2%')).toBeTruthy()
    expect(within(s).getByText('(2022년 10월부터 · 해마다 10월)')).toBeTruthy()
    for (const y of ['2022', '2023', '2024', '2025', '2026']) expect(within(s).getByText(y)).toBeTruthy()
  })

  it('AC-7909.2: 줄었으면 `▼ −{%}`', () => {
    const trend: Got<{ ym: string; total: number }[]> = {
      ok: true,
      v: [
        { ym: '2022-10', total: 10000 },
        { ym: '2026-10', total: 9763 },
      ],
      src: 'pop-age',
      asOf: '2026-10-31',
    }
    render(<PeopleSection snapshot={{ ...SNAP, trend }} />)
    expect(within(section('people')).getByText('▼ −2.3%')).toBeTruthy()
  })

  it('AC-7909.2: 홍보할 아파트 차례 — 머리 글 `가까움 · 세대 수 · 지은 해로 정해요`, 차례·단지·세대·지은 해·법정동·까닭', () => {
    render(<PeopleSection snapshot={SNAP} />)
    const s = section('people')
    expect(within(s).getByText('홍보할 아파트 차례')).toBeTruthy()
    expect(within(s).getByText('가까움 · 세대 수 · 지은 해로 정해요')).toBeTruthy()
    const table = within(s).getByRole('table')
    const heads = within(table)
      .getAllByRole('columnheader')
      .map((th) => th.textContent)
    expect(heads).toEqual(['차례', '단지', '세대', '지은 해', '법정동', '까닭'])
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((tr) => Array.from(tr.children).map(flat).join(' '))
    expect(rows).toEqual([
      '1 예시힐 1,820 1998년 가온동 가까워요 · 세대가 많아요',
      '2 예시숲 640 2004년 가온동 가까워요 · 오래돼 어르신이 오래 살아요',
      '3 예시마을 640 2012년 가온동 가까워요',
      '4 예시파크 2,400 2019년 나래동 세대가 많아요',
      '5 예시들 300 – 나래동 범위 안 단지',
    ])
  })

  it('AC-7909.2: 입주 예정 — `{연} 년 {월}월` · `{단지} · {세대}세대`', () => {
    render(<PeopleSection snapshot={SNAP} />)
    const s = section('people')
    expect(within(s).getByText('입주 예정')).toBeTruthy()
    expect(flat(rowOf(s, '2027년 3월'))).toBe('예시새빛 · 1,120세대')
    expect(flat(rowOf(s, '2028년 9월'))).toBe('예시하늘 2차 · 640세대')
  })

  it('AC-7909.2: 범위 안에 단지가 없으면 그 자리에 글', () => {
    render(
      <PeopleSection
        snapshot={{
          ...SNAP,
          apts: { ok: true, v: [], src: 'apt-list', asOf: '2026-11-15' },
          presale: { ok: true, v: [], src: 'presale', asOf: '2026-11-15' },
        }}
      />,
    )
    const s = section('people')
    expect(within(s).getByText('범위 안에 아파트 단지가 없어요.')).toBeTruthy()
    expect(within(s).getByText('범위 안에 입주 예정 단지가 없어요.')).toBeTruthy()
    expect(within(s).queryByRole('table')).toBeNull()
  })

  it('AC-7909.2: 숫자마다 출처 줄(근거와 출처로) — 누르면 출처 id로 콜백', () => {
    const onOpenSource = vi.fn()
    render(<PeopleSection snapshot={SNAP} onOpenSource={onOpenSource} />)
    const links = within(section('people')).getAllByRole('link')
    const hrefs = new Set(links.map((a) => a.getAttribute('href')))
    expect(hrefs).toEqual(
      new Set(['/location?tab=sources#src-pop-age', '/location?tab=sources#src-apt-list', '/location?tab=sources#src-apt-info', '/location?tab=sources#src-presale']),
    )
    fireEvent.click(links.find((a) => a.getAttribute('href')?.endsWith('presale'))!)
    expect(onOpenSource).toHaveBeenCalledWith('presale')
  })

  it('AC-7909.2: 못 이은 동이 있으면 빼고 셌다고 적는다', () => {
    const people = SNAP.people.ok ? { ...SNAP.people, v: { ...SNAP.people.v, unmatched: 2 } } : SNAP.people
    render(<PeopleSection snapshot={{ ...SNAP, people }} />)
    expect(within(section('people')).getByText('범위 안 동 2곳은 인구 자료와 잇지 못해 빼고 셌어요.')).toBeTruthy()
  })

  it('AC-7909.2: 사는 사람 자료를 못 받으면 그 칸만 자료 없음 글([다시 받기] 콜백), 아파트·입주 예정은 그대로', () => {
    const onRetry = vi.fn()
    render(<PeopleSection snapshot={{ ...SNAP, people: { ok: false, why: 'failed', src: 'pop-age' } }} onRetry={onRetry} />)
    const s = section('people')
    expect(within(s).getAllByText('지금 받지 못했어요.').length).toBeGreaterThan(0)
    expect(within(s).queryByText('0~19세')).toBeNull()
    expect(within(s).getByText('5,800')).toBeTruthy()
    expect(within(s).getByRole('table')).toBeTruthy()
    fireEvent.click(within(s).getAllByRole('button', { name: '다시 받기' })[0])
    expect(onRetry).toHaveBeenCalled()
  })

  it('AC-7909.2: 못 받았어도 지난 값이 있으면 그 값과 `지난 값 · 기준 {날짜}`', () => {
    render(
      <PeopleSection
        snapshot={{
          ...SNAP,
          apts: { ok: false, why: 'failed', src: 'apt-list', prev: { v: SNAP.apts.ok ? SNAP.apts.v : [], asOf: '2026-08-01' } },
        }}
      />,
    )
    const s = section('people')
    expect(within(s).getByRole('table')).toBeTruthy()
    expect(within(s).getAllByText('지난 값 · 기준 2026년 8월 1일').length).toBeGreaterThan(0)
  })
})

describe('AC-7909.7: 소득·쓸 힘 묶음', () => {
  it('AC-7909.7: 묶음 머리 `소득·쓸 힘`, 닻 sec-income', () => {
    render(<IncomeSection snapshot={SNAP} />)
    expect(within(section('income')).getByRole('heading', { level: 3 }).textContent).toBe('소득·쓸 힘')
  })

  it('AC-7909.7: 평균 근로소득(시군구) · 귀속 연도 · `동 단위 자료가 없어요. {시군구} 평균이에요(사는 곳 기준).`', () => {
    render(<IncomeSection snapshot={SNAP} />)
    const s = section('income')
    expect(flat(rowOf(s, '평균 근로소득(한 해)'))).toContain('4,512만 원 · 2024년 귀속')
    expect(within(s).getByText('동 단위 자료가 없어요. 가상구 평균이에요(사는 곳 기준).')).toBeTruthy()
  })

  it('AC-7909.7: 소득 자료가 없어도 `동 단위 자료가 없어요.`는 남는다', () => {
    render(<IncomeSection snapshot={{ ...SNAP, income: { ok: false, why: 'none', src: 'income' } }} />)
    const s = section('income')
    expect(within(s).getByText('이 시·군·구의 소득 자료가 없어요.')).toBeTruthy()
    expect(within(s).getByText('동 단위 자료가 없어요.')).toBeTruthy()
  })

  it('AC-7909.7: 아파트·상가 ㎡당 거래가 — 지난 6달 건수 · 법정동 기준', () => {
    render(<IncomeSection snapshot={SNAP} />)
    const s = section('income')
    expect(flat(rowOf(s, '아파트 거래가(㎡당)'))).toContain('8,123,456원 · 지난 6달 37건 · 법정동 기준')
    expect(flat(rowOf(s, '상가·업무용 거래가(㎡당)'))).toContain('500만 원 · 지난 6달 4건 · 법정동 기준')
  })

  it('AC-7909.7: 의료급여·차상위 머리 글 `시군구 기준 · 기초생활보장 의료급여 기준 · 겹칠 수 있어요` + 세 줄(수·비율) + 출처 줄', () => {
    render(<IncomeSection snapshot={SNAP} />)
    const s = section('income')
    expect(within(s).getByText('시군구 기준 · 기초생활보장 의료급여 기준 · 겹칠 수 있어요')).toBeTruthy()
    expect(flat(rowOf(s, '의료급여(기초) 수급권자'))).toBe('9,876명 (2.3%)')
    expect(flat(rowOf(s, '기초생활보장 수급권자 합계'))).toBe('14,321명 (3.4%)')
    expect(flat(rowOf(s, '차상위 3종 합계'))).toBe('5,432명 (1.3%)')
    const src = within(s)
      .getAllByRole('link')
      .find((a) => a.getAttribute('href') === '/location?tab=sources#src-welfare')
    expect(src?.textContent).toBe('한국사회보장정보원 복지사업 시군구별 수급권자 현황 · 기준 2025년 12월 31일 · 가상구')
  })

  it('AC-7909.7: 주민등록 인구가 없으면 비율 자리 `–`', () => {
    const welfare = SNAP.welfare.ok ? { ...SNAP.welfare, v: { ...SNAP.welfare.v, population: null } } : SNAP.welfare
    render(<IncomeSection snapshot={{ ...SNAP, welfare }} />)
    expect(flat(rowOf(section('income'), '차상위 3종 합계'))).toBe('5,432명 (–)')
  })

  it('AC-7909.7: 의료급여·차상위 자료가 없으면 그 칸만 design.md 15절 글이고 소득 줄은 그대로', () => {
    render(<IncomeSection snapshot={{ ...SNAP, welfare: { ok: false, why: 'not-applied', src: 'welfare' } }} />)
    const s = section('income')
    expect(within(s).getByText("공공데이터포털에서 '복지사업 시군구별 수급권자 현황' 활용신청을 하면 보여요.")).toBeTruthy()
    expect(within(s).getByText('시군구 기준 · 기초생활보장 의료급여 기준 · 겹칠 수 있어요')).toBeTruthy()
    expect(within(s).queryByText('차상위 3종 합계')).toBeNull()
    expect(flat(rowOf(s, '평균 근로소득(한 해)'))).toContain('4,512만 원')
  })
})

describe('AC-7909.2: 앞으로 바뀔 것', () => {
  it('AC-7909.2: 사는 사람 4년 추세 · 입주 예정 · 재개발·도로(토지이음) 줄', () => {
    render(<FutureSection snapshot={SNAP} />)
    const s = section('future')
    expect(within(s).getByRole('heading', { level: 3 }).textContent).toBe('앞으로 바뀔 것')
    expect(within(s).getByText('범위 1km 안')).toBeTruthy()
    const items = within(s)
      .getAllByRole('listitem')
      .map((li) => flat(li.firstElementChild!) + ' | ' + flat(li.children[1].firstElementChild!))
    expect(items).toEqual([
      '2022→2026 | 사는 사람 4년 사이 +5.2%',
      '2027년 3월 | 예시새빛 1,120세대 입주',
      '2028년 9월 | 예시하늘 2차 640세대 입주',
      '재개발·도로 | 토지이음에서 봐요',
    ])
  })

  it('AC-7909.2: 추세·입주 예정을 못 받으면 그 줄에 자료 없음 글', () => {
    render(
      <FutureSection
        snapshot={{ ...SNAP, trend: { ok: false, why: 'none', src: 'pop-age' }, presale: { ok: false, why: 'no-key', src: 'presale' } }}
      />,
    )
    const s = section('future')
    expect(within(s).getByText('이 범위의 나이대 인구 자료가 없어요.')).toBeTruthy()
    expect(within(s).getByText('청약홈 분양정보 조회 서비스: 열쇠를 넣으면 보여요.')).toBeTruthy()
    expect(within(s).getByText('토지이음에서 봐요')).toBeTruthy()
  })
})

describe('AC-7909.2 · AC-7909.7: 화면 글과 부품 규칙', () => {
  it('AC-7909.2: 화면 글에 영어 낱말이 없다(km·m 단위만)', () => {
    render(
      <>
        <PeopleSection snapshot={SNAP} />
        <IncomeSection snapshot={SNAP} />
        <FutureSection snapshot={SNAP} />
      </>,
    )
    const text = (document.body.textContent ?? '').replace(/\d(?:[\d.,]*)\s?(?:km|m)\b/g, '')
    expect(text).not.toMatch(/[A-Za-z]/)
  })

  it('AC-7909.7: 부품은 props·콜백만 — 부르기·저장·폰 전용 모양(max-md)·하루 예상 환자·토큰 밖 색 없음', () => {
    const dir = join(process.cwd(), 'src/components/location/detail/people')
    const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f))
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      const src = readFileSync(join(dir, f), 'utf8')
      expect(src, f).not.toMatch(/max-md:|fetch\(|@\/lib\/supabase|@\/lib\/storage|localStorage|sessionStorage|console\.|ds\.(textButton|card|panel)/)
      expect(src, f).not.toMatch(/예상 환자|하루 환자/)
      expect(src, f).not.toMatch(/#[0-9A-Fa-f]{3,8}\b|rgb\(/)
    }
  })
})

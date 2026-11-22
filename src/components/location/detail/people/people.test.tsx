// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { filledHow, type HowCtx, type HowId } from '@/lib/location/method'
import type { Got, SourceId } from '@/types/location'
import { SNAP } from './fixture.test.data'
import { FutureSection, IncomeSection, PeopleSection } from './index'

afterEach(cleanup)

// '이렇게 봤어요' 채울 값(method.ts HowCtx)은 부르는 쪽이 그 후보 그날 값으로 만들어 넘긴다 — 시험은 SNAP의 출처별 기준 날짜로 만든다
const SNAP_ASOF: Partial<Record<SourceId, string>> = {
  'pop-age': '2026-10-31',
  dongs: '2026-07-01',
  'apt-list': '2026-11-15',
  'apt-info': '2026-11-15',
  presale: '2026-11-15',
  income: '2024-12-31',
  'apt-trade': '2026-11-15',
  'biz-trade': '2026-11-15',
  welfare: '2025-12-31',
}
const ctxOf = (over: Partial<HowCtx> = {}): HowCtx => ({ asOf: (src) => SNAP_ASOF[src] ?? null, radiusM: 1000, sggName: '가상구', rivalShort: '', ...over })

// 펼침도 부르는 쪽이 쥔다(props) — 접힌 채로 그릴 때
const closed = { howCtx: ctxOf(), howOpen: false, onHow: () => {} }

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
    render(<PeopleSection {...closed} snapshot={SNAP} />)
    const s = section('people')
    expect(within(s).getByRole('heading', { level: 3 }).textContent).toBe('사는 사람')
    expect(within(s).getByText('범위 1km 안')).toBeTruthy()
  })

  it('AC-7909.2: 범위 인구 · 세대 수 · 60세 이상(사는 사람의 %) · 아파트 세대 — 칸 아래 행정동·법정동 기준 글', () => {
    render(<PeopleSection {...closed} snapshot={SNAP} />)
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
    render(<PeopleSection {...closed} snapshot={SNAP} />)
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
    render(<PeopleSection {...closed} snapshot={SNAP} />)
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
    render(<PeopleSection {...closed} snapshot={{ ...SNAP, trend }} />)
    expect(within(section('people')).getByText('▼ −2.3%')).toBeTruthy()
  })

  it('AC-7909.2: 홍보할 아파트 차례 — 머리 글 `가까움 · 세대 수 · 지은 해로 정해요`, 차례·단지·세대·지은 해·법정동·까닭', () => {
    render(<PeopleSection {...closed} snapshot={SNAP} />)
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
    render(<PeopleSection {...closed} snapshot={SNAP} />)
    const s = section('people')
    expect(within(s).getByText('입주 예정')).toBeTruthy()
    expect(flat(rowOf(s, '2027년 3월'))).toBe('예시새빛 · 1,120세대')
    expect(flat(rowOf(s, '2028년 9월'))).toBe('예시하늘 2차 · 640세대')
  })

  it('AC-7909.2: 범위 안에 단지가 없으면 그 자리에 글', () => {
    render(
      <PeopleSection
        {...closed}
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
    render(<PeopleSection {...closed} snapshot={SNAP} onOpenSource={onOpenSource} />)
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
    render(<PeopleSection {...closed} snapshot={{ ...SNAP, people }} />)
    expect(within(section('people')).getByText('범위 안 동 2곳은 인구 자료와 잇지 못해 빼고 셌어요.')).toBeTruthy()
  })

  it('AC-7909.2: 사는 사람 자료를 못 받으면 그 칸만 자료 없음 글([다시 받기] 콜백), 아파트·입주 예정은 그대로', () => {
    const onRetry = vi.fn()
    render(<PeopleSection {...closed} snapshot={{ ...SNAP, people: { ok: false, why: 'failed', src: 'pop-age' } }} onRetry={onRetry} />)
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
        {...closed}
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
    render(<IncomeSection {...closed} snapshot={SNAP} />)
    expect(within(section('income')).getByRole('heading', { level: 3 }).textContent).toBe('소득·쓸 힘')
  })

  it('AC-7909.7: 평균 근로소득(시군구) · 귀속 연도 · `동 단위 자료가 없어요. {시군구} 평균이에요(사는 곳 기준).`', () => {
    render(<IncomeSection {...closed} snapshot={SNAP} />)
    const s = section('income')
    expect(flat(rowOf(s, '평균 근로소득(한 해)'))).toContain('4,512만 원 · 2024년 귀속')
    expect(within(s).getByText('동 단위 자료가 없어요. 가상구 평균이에요(사는 곳 기준).')).toBeTruthy()
  })

  it('AC-7909.7: 소득 자료가 없어도 `동 단위 자료가 없어요.`는 남는다', () => {
    render(<IncomeSection {...closed} snapshot={{ ...SNAP, income: { ok: false, why: 'none', src: 'income' } }} />)
    const s = section('income')
    expect(within(s).getByText('이 시·군·구의 소득 자료가 없어요.')).toBeTruthy()
    expect(within(s).getByText('동 단위 자료가 없어요.')).toBeTruthy()
  })

  it('AC-7909.7: 아파트·상가 ㎡당 거래가 — 지난 6달 건수 · 법정동 기준', () => {
    render(<IncomeSection {...closed} snapshot={SNAP} />)
    const s = section('income')
    expect(flat(rowOf(s, '아파트 거래가(㎡당)'))).toContain('8,123,456원 · 지난 6달 37건 · 법정동 기준')
    expect(flat(rowOf(s, '상가·업무용 거래가(㎡당)'))).toContain('500만 원 · 지난 6달 4건 · 법정동 기준')
  })

  it('AC-7909.7: 의료급여·차상위 머리 글 `시군구 기준 · 기초생활보장 의료급여 기준 · 겹칠 수 있어요` + 세 줄(수·비율) + 출처 줄', () => {
    render(<IncomeSection {...closed} snapshot={SNAP} />)
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
    render(<IncomeSection {...closed} snapshot={{ ...SNAP, welfare }} />)
    expect(flat(rowOf(section('income'), '차상위 3종 합계'))).toBe('5,432명 (–)')
  })

  it('AC-7909.7: 의료급여·차상위 자료가 없으면 그 칸만 design.md 15절 글이고 소득 줄은 그대로', () => {
    render(<IncomeSection {...closed} snapshot={{ ...SNAP, welfare: { ok: false, why: 'not-applied', src: 'welfare' } }} />)
    const s = section('income')
    expect(within(s).getByText("공공데이터포털에서 '복지사업 시군구별 수급권자 현황' 활용신청을 하면 보여요.")).toBeTruthy()
    expect(within(s).getByText('시군구 기준 · 기초생활보장 의료급여 기준 · 겹칠 수 있어요')).toBeTruthy()
    expect(within(s).queryByText('차상위 3종 합계')).toBeNull()
    expect(flat(rowOf(s, '평균 근로소득(한 해)'))).toContain('4,512만 원')
  })
})

describe('AC-7909.2: 앞으로 바뀔 것', () => {
  it('AC-7909.2: 사는 사람 4년 추세 · 입주 예정 · 재개발·도로(토지이음) 줄', () => {
    render(<FutureSection {...closed} snapshot={SNAP} />)
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
        {...closed}
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
  it("AC-7909.2: 화면 글에 영어 낱말이 없다('이렇게 봤어요' 네 줄까지 펼쳐서, AC-7917.1 허용 목록 SGIS·km·m만)", () => {
    const open = { ...closed, howOpen: true }
    render(
      <>
        <PeopleSection {...open} snapshot={SNAP} />
        <IncomeSection {...open} snapshot={SNAP} />
        <FutureSection {...open} snapshot={SNAP} />
      </>,
    )
    expect(document.body.textContent).toContain('SGIS')
    const text = (document.body.textContent ?? '').replace(/\d(?:[\d.,]*)\s?(?:km²|km|m)(?![A-Za-z])/g, '').replace(/\b(?:SGIS|TASIS|KTX|MRI|CT|PDF|A4)\b/g, '')
    expect(text).not.toMatch(/[A-Za-z]/)
  })

  it('AC-7909.7: 부품은 props·콜백만 — 부르기·저장·폰 전용 모양(max-md)·하루 예상 환자·토큰 밖 색 없음', () => {
    const dir = join(process.cwd(), 'src/components/location/detail/people')
    const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f))
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      const src = readFileSync(join(dir, f), 'utf8')
      expect(src, f).not.toMatch(/max-md:|fetch\(|@\/lib\/supabase|@\/lib\/storage|localStorage|sessionStorage|console\.|ds\.(textButton|button|input|card|panel)\b/)
      expect(src, f).not.toMatch(/예상 환자|하루 환자/)
      expect(src, f).not.toMatch(/#[0-9A-Fa-f]{3,8}\b|rgb\(/)
    }
  })
})

// ── '이렇게 봤어요'(TASK-69) ──

const howOf = (root: HTMLElement) => {
  const box = within(root).getByText('이렇게 봤어요').closest('p')?.parentElement
  if (!box) throw new Error('이렇게 봤어요 없음')
  return box
}
// 한 줄 글(칩·[더 보기] 단추는 margin으로 띄워 글 사이 빈칸이 없다 — 따로 본다)
const howLine = (root: HTMLElement) => {
  const p = within(howOf(root)).getByText('이렇게 봤어요').closest('p')!.cloneNode(true) as HTMLElement
  p.querySelectorAll('[data-chip], button').forEach((el) => el.remove())
  return flat(p)
}
const howRows = (root: HTMLElement) => Array.from(howOf(root).querySelectorAll('dl > div')).map((d) => [flat(d.querySelector('dt')!), flat(d.querySelector('dd')!)])
const chipsOf = (root: HTMLElement) => Array.from(howOf(root).querySelectorAll('[data-chip]')).map((c) => c.textContent)
const expectedRows = (id: HowId, ctx: HowCtx) => {
  const f = filledHow(id, ctx)
  return [
    ['무엇을 봤나', f.more.what],
    ['어떻게 셌나', f.more.how],
    ['왜 중요한가', f.more.why],
    ['근거', f.more.basis],
  ]
}

describe("AC-7920.2: '이렇게 봤어요' — 사는 사람", () => {
  it('AC-7920.2: 묶음 제목 바로 아래(머리 다음, 몸 앞) 한 줄 — howCtx의 출처 기준 날짜로 채움 + 연구 근거 칩 + [더 보기]', () => {
    render(<PeopleSection {...closed} snapshot={SNAP} />)
    const s = section('people')
    const head = within(s).getByRole('heading', { level: 3 }).parentElement!
    expect(head.nextElementSibling).toBe(howOf(s))
    expect(howLine(s)).toBe(
      '이렇게 봤어요 행정안전부 주민등록 인구·세대(기준 2026년 10월 31일) · 아파트 단지·입주 예정 · 살필 범위에 걸친 동마다 겹친 넓이만큼 나눠 더한 어림이에요 · 정형외과 자리는 낮에 오가는 사람보다 사는 사람과 더 관련이 있었어요',
    )
    expect(chipsOf(s)).toEqual(['연구 근거'])
    const button = within(s).getByRole('button', { name: '더 보기' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(howOf(s).querySelector('dl')!.hidden).toBe(true)
  })

  it('AC-7920.2: [더 보기]를 누르면 onHow — 펼침은 부르는 쪽이 쥔 howOpen 그대로', () => {
    const onHow = vi.fn()
    render(<PeopleSection {...closed} onHow={onHow} snapshot={SNAP} />)
    fireEvent.click(within(section('people')).getByRole('button', { name: '더 보기' }))
    expect(onHow).toHaveBeenCalledTimes(1)
    expect(within(section('people')).getByRole('button', { name: '더 보기' })).toBeTruthy()
  })

  it('AC-7920.2: howOpen이면 네 줄(무엇을 봤나·어떻게 셌나·왜 중요한가·근거) — [[출처]]·{범위}를 howCtx로 채우고 [접기]', () => {
    const onHow = vi.fn()
    render(<PeopleSection {...closed} howOpen onHow={onHow} snapshot={SNAP} />)
    const s = section('people')
    expect(howOf(s).querySelector('dl')!.hidden).toBe(false)
    const rows = howRows(s)
    expect(rows).toEqual(expectedRows('people', ctxOf()))
    expect(rows[0][1]).toContain('국가데이터처 SGIS 동 경계(동 넓이, 기준 2026년 7월 1일)')
    expect(rows[0][1]).toContain('국토교통부 공동주택 기본 정보(법정동, 기준 2026년 11월 15일)')
    expect(rows[0][1]).toContain('한국부동산원 청약홈 분양정보(입주 예정, 기준 2026년 11월 15일)')
    expect(rows[1][1]).toContain('살필 범위(1km)에 걸친 행정동마다')
    fireEvent.click(within(s).getByRole('button', { name: '접기' }))
    expect(onHow).toHaveBeenCalledTimes(1)
  })

  it('AC-7920.2: 펼친 것은 범위를 바꿔 다시 그려도 그대로 — {범위}만 새 범위', () => {
    const { rerender } = render(<PeopleSection {...closed} howOpen snapshot={SNAP} />)
    rerender(<PeopleSection {...closed} howOpen howCtx={ctxOf({ radiusM: 500 })} snapshot={{ ...SNAP, radiusM: 500 }} />)
    const s = section('people')
    expect(within(s).getByRole('button', { name: '접기' })).toBeTruthy()
    expect(howOf(s).querySelector('dl')!.hidden).toBe(false)
    expect(howRows(s)[1][1]).toContain('살필 범위(500m)에 걸친 행정동마다')
    expect(within(s).getByText('범위 500m 안')).toBeTruthy()
  })

  it('AC-7920.2: 기준 날짜가 없는 출처는 그 조각을 빼고 빈 괄호를 남기지 않는다', () => {
    const asOf = (src: SourceId) => (src === 'dongs' || src === 'presale' ? null : (SNAP_ASOF[src] ?? null))
    render(<PeopleSection {...closed} howOpen howCtx={ctxOf({ asOf })} snapshot={SNAP} />)
    const what = howRows(section('people'))[0][1]
    expect(what).toContain('국가데이터처 SGIS 동 경계(동 넓이)')
    expect(what).toContain('한국부동산원 청약홈 분양정보(입주 예정)')
    expect(what).not.toContain('()')
  })
})

describe("AC-7920.2: '이렇게 봤어요' — 소득·쓸 힘", () => {
  it('AC-7920.2: 제목 바로 아래 한 줄 — 국세청·국토교통부 기준 날짜와 한국사회보장정보원 한 마디 + 흔히 보는 기준 칩', () => {
    render(<IncomeSection {...closed} snapshot={SNAP} />)
    const s = section('income')
    expect(within(s).getByRole('heading', { level: 3 }).parentElement!.nextElementSibling).toBe(howOf(s))
    expect(howLine(s)).toBe(
      '이렇게 봤어요 국세청 근로소득(기준 2024년 12월 31일) · 국토교통부 실거래가(기준 2026년 11월 15일) · 한국사회보장정보원 의료급여·차상위 · 소득은 동 단위가 없어 시·군·구 평균, 거래가는 범위 법정동의 지난 6달 ㎡당 평균이에요 · 건강보험이 안 되는 진료(비급여)를 받을 형편을 짐작해요',
    )
    expect(chipsOf(s)).toEqual(['흔히 보는 기준'])
  })

  it('AC-7920.2: 네 줄의 {시군구}는 howCtx의 후보 시·군·구', () => {
    render(<IncomeSection {...closed} howOpen howCtx={ctxOf({ sggName: '나래구' })} snapshot={SNAP} />)
    expect(howRows(section('income'))).toEqual(expectedRows('income', ctxOf({ sggName: '나래구' })))
    expect(howRows(section('income'))[1][1]).toContain('소득은 동 단위 공개 자료가 없어 나래구 평균을 그대로 보이고')
  })

  it('AC-7920.2: [더 보기]를 누르면 onHow', () => {
    const onHow = vi.fn()
    render(<IncomeSection {...closed} onHow={onHow} snapshot={SNAP} />)
    fireEvent.click(within(section('income')).getByRole('button', { name: '더 보기' }))
    expect(onHow).toHaveBeenCalledTimes(1)
  })
})

describe("AC-7920.2: '이렇게 봤어요' — 앞으로 바뀔 것", () => {
  it('AC-7920.2: 제목 바로 아래 한 줄 + 흔히 보는 기준 칩, 펼치면 [[pop:d]]는 날짜만', () => {
    const onHow = vi.fn()
    render(<FutureSection {...closed} howOpen onHow={onHow} snapshot={SNAP} />)
    const s = section('future')
    expect(within(s).getByRole('heading', { level: 3 }).parentElement!.nextElementSibling).toBe(howOf(s))
    expect(howLine(s)).toBe(
      '이렇게 봤어요 주민등록 인구 4년 추세 · 한국부동산원 청약홈 입주 예정(기준 2026년 11월 15일) · 2022년 10월과 올해 10월을 견주고, 범위 안 입주 예정 단지를 입주 때 차례로 놓았어요 · 여러 해 있을 자리라 앞으로 사람이 늘지 줄지가 중요해요',
    )
    expect(chipsOf(s)).toEqual(['흔히 보는 기준'])
    expect(howRows(s)).toEqual(expectedRows('future', ctxOf()))
    expect(howRows(s)[0][1]).toBe(
      '행정안전부 주민등록 인구(2022년 10월 ~ 2026년 10월 31일) · 한국부동산원 청약홈 분양정보(기준 2026년 11월 15일) · 재개발·도로는 토지이음 링크',
    )
    fireEvent.click(within(s).getByRole('button', { name: '접기' }))
    expect(onHow).toHaveBeenCalledTimes(1)
  })

  it('AC-7920.2: 범위를 바꿔 다시 그려도 접힘·펼침은 howOpen 그대로', () => {
    const { rerender } = render(<FutureSection {...closed} snapshot={SNAP} />)
    rerender(<FutureSection {...closed} howCtx={ctxOf({ radiusM: 2000 })} snapshot={{ ...SNAP, radiusM: 2000 }} />)
    const s = section('future')
    expect(within(s).getByRole('button', { name: '더 보기' })).toBeTruthy()
    expect(within(s).getByText('범위 2km 안')).toBeTruthy()
  })
})

describe("AC-7920.2: '이렇게 봤어요'를 더해도 닻 id는 묶음이 한 번씩", () => {
  it('AC-7920.2: 셋을 함께 그리면 sec-people·sec-income·sec-future가 하나씩이고 화면의 id는 겹치지 않는다', () => {
    render(
      <>
        <PeopleSection {...closed} howOpen snapshot={SNAP} />
        <IncomeSection {...closed} howOpen snapshot={SNAP} />
        <FutureSection {...closed} howOpen snapshot={SNAP} />
      </>,
    )
    for (const id of ['people', 'income', 'future']) {
      expect(document.querySelectorAll(`[id="sec-${id}"]`)).toHaveLength(1)
      expect(section(id).tagName).toBe('SECTION')
    }
    const ids = Array.from(document.querySelectorAll('[id]')).map((el) => el.id)
    expect(new Set(ids).size).toBe(ids.length)
    // [접기] 단추는 제 묶음의 네 줄만 가리킨다
    for (const id of ['people', 'income', 'future']) {
      const button = within(section(id)).getByRole('button', { name: '접기' })
      const list = document.getElementById(button.getAttribute('aria-controls')!)
      expect(list && section(id).contains(list)).toBe(true)
    }
  })
})

describe('AC-7909.7: 의료급여 — 옛 구 묶음 값', () => {
  const grouped = (basis: string | null, sggName: string): typeof SNAP.welfare =>
    SNAP.welfare.ok ? { ...SNAP.welfare, v: { ...SNAP.welfare.v, sggName, basis } } : SNAP.welfare

  it('AC-7909.7: 판에 옛 구로만 있는 새 시군구(basis)면 머리 끝 ` · 옛 {구} 기준`, 출처 줄 끝은 판에서 더한 구 이름', () => {
    render(<IncomeSection {...closed} snapshot={{ ...SNAP, welfare: grouped('옛 중구·동구', '중구·동구') }} />)
    const s = section('income')
    expect(within(s).getByText('시군구 기준 · 기초생활보장 의료급여 기준 · 겹칠 수 있어요 · 옛 중구·동구 기준')).toBeTruthy()
    expect(within(s).queryByText('시군구 기준 · 기초생활보장 의료급여 기준 · 겹칠 수 있어요')).toBeNull()
    const src = within(s)
      .getAllByRole('link')
      .find((a) => a.getAttribute('href') === '/location?tab=sources#src-welfare')
    expect(src?.textContent).toBe('한국사회보장정보원 복지사업 시군구별 수급권자 현황 · 기준 2025년 12월 31일 · 중구·동구')
    expect(flat(rowOf(s, '의료급여(기초) 수급권자'))).toBe('9,876명 (2.3%)')
  })

  it('AC-7909.7: 옛 서구·옛 화성시 묶음도 같은 모양', () => {
    const { unmount } = render(<IncomeSection {...closed} snapshot={{ ...SNAP, welfare: grouped('옛 서구', '서구') }} />)
    expect(within(section('income')).getByText('시군구 기준 · 기초생활보장 의료급여 기준 · 겹칠 수 있어요 · 옛 서구 기준')).toBeTruthy()
    unmount()
    render(<IncomeSection {...closed} snapshot={{ ...SNAP, welfare: grouped('옛 화성시', '화성시') }} />)
    expect(within(section('income')).getByText('시군구 기준 · 기초생활보장 의료급여 기준 · 겹칠 수 있어요 · 옛 화성시 기준')).toBeTruthy()
  })

  it('AC-7909.7: 못 받았어도 지난 값이 옛 구 묶음이면 머리 끝에 그 기준', () => {
    const last = grouped('옛 중구·동구', '중구·동구')
    const welfare: typeof SNAP.welfare = last.ok ? { ok: false, why: 'failed', src: 'welfare', prev: { v: last.v, asOf: '2024-12-31' } } : last
    render(<IncomeSection {...closed} snapshot={{ ...SNAP, welfare }} />)
    const s = section('income')
    expect(within(s).getByText('시군구 기준 · 기초생활보장 의료급여 기준 · 겹칠 수 있어요 · 옛 중구·동구 기준')).toBeTruthy()
    expect(within(s).getAllByText('지난 값 · 기준 2024년 12월 31일').length).toBeGreaterThan(0)
  })

  it('AC-7909.7: 옛 구 묶음이 아니면(basis 없음) 머리에 `옛`이 없다', () => {
    render(<IncomeSection {...closed} snapshot={SNAP} />)
    expect(within(section('income')).getByText('시군구 기준 · 기초생활보장 의료급여 기준 · 겹칠 수 있어요')).toBeTruthy()
    expect(section('income').textContent).not.toContain('옛 ')
  })
})

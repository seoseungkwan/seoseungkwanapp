// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KakaoMapProps } from '@/components/location/map/KakaoMap'
import { naverLandUrl } from '@/lib/location/links'
import { DEFAULT_SCORE_RULE, type ScoreRule } from '@/lib/location/score'
import { SAVE_DELAY_MS } from '@/components/location/weights/ScoreWeights'
import { ScanView, type ScanViewProps } from './ScanView'
import { CHAMI, DONGS, GARAM, HANEUL, INDEX, noTransit, SCAN_DONGS, scanData } from './scanData.test.data'

// 동네 훑기 화면(spec location REQ-7907 AC-7907.1~4, REQ-7919 AC-7919.3, design.md 8·14절, 시안 ?s=scan).
// 부품은 props·콜백만: 시도·시군구를 고르면 onPickSgg(부르기)만, 무게를 바꾸면 다시 부르지 않고 색·순위·점수가 바로 바뀐다.
// 카카오 지도는 흉내 부품으로 바꿔 넘긴 동(색 칸·글·고름)을 본다

vi.mock('@/components/location/map/KakaoMap', () => ({
  KakaoMap: (p: KakaoMapProps) => (
    <div data-testid="map" aria-label={p.label}>
      {(p.areas ?? []).map((a) => (
        <button
          key={a.id}
          type="button"
          data-area={a.id}
          data-tone={a.tone}
          data-selected={a.selected ? 'true' : 'false'}
          onClick={() => p.onArea?.(a.id)}
        >{`${a.name} ${a.text ?? ''}`}</button>
      ))}
      {(p.marks ?? []).map((m) => (
        <span key={m.id} data-mark={m.id} data-kind={m.kind}>
          {m.label}
        </span>
      ))}
    </div>
  ),
}))

const fresh = (): ScoreRule => structuredClone(DEFAULT_SCORE_RULE) as ScoreRule

function setup(over: Partial<ScanViewProps> = {}) {
  const onPickSgg = vi.fn<(code5: string) => void>()
  const onAdd = vi.fn()
  const onRuleChange = vi.fn<(rule: ScoreRule) => void>()
  const onRuleSave = vi.fn<(rule: ScoreRule) => void>()
  const onRetry = vi.fn()
  const props: ScanViewProps = {
    index: INDEX,
    sgg: '11999',
    dongs: DONGS,
    result: { ok: true, ...scanData() },
    rule: fresh(),
    onPickSgg,
    onAdd,
    onRuleChange,
    onRuleSave,
    onRetry,
    ...over,
  }
  const view = render(<ScanView {...props} />)
  return { onPickSgg, onAdd, onRuleChange, onRuleSave, onRetry, props, ...view }
}

const rankList = () => screen.getByRole('list', { name: '추천 동 순위' })
const rankOrder = () => within(rankList()).getAllByRole('button').map((b) => b.dataset.dong)
const rankItem = (code: string) => within(rankList()).getAllByRole('button').find((b) => b.dataset.dong === code)!
const area = (code: string) => screen.getByTestId('map').querySelector<HTMLElement>(`[data-area="${code}"]`)!
const picked = () => screen.getByRole('region', { name: '고른 동' })
const bar = (group: string) => picked().querySelector<HTMLElement>(`[data-group="${group}"]`)!
const move = (name: string, value: number) => fireEvent.change(screen.getByRole('slider', { name }), { target: { value: String(value) } })

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AC-7907.1: 시·도 → 시·군·구를 고르면 동마다 색·순위·까닭·받은 시각', () => {
  it('AC-7907.1: 시·도를 고르면 그 시·군·구가 나오고, 시·군·구를 고르면 부르기 콜백 하나', () => {
    const { onPickSgg } = setup({ sgg: null, dongs: null, result: null })
    expect(screen.getByText('시·도와 시·군·구를 고르면 행정동마다 점수 색을 칠해요.')).toBeTruthy()
    const sido = screen.getByRole('combobox', { name: '시·도' })
    expect(within(sido).getAllByRole('option').map((o) => o.textContent)).toEqual(['시·도 고르기', '서울특별시', '경기도'])
    fireEvent.change(sido, { target: { value: '11' } })
    const sgg = screen.getByRole('combobox', { name: '시·군·구' })
    expect(within(sgg).getAllByRole('option').map((o) => o.textContent)).toEqual(['시·군·구 고르기', '예시구', '예시2구'])
    expect(onPickSgg).not.toHaveBeenCalled()
    fireEvent.change(sgg, { target: { value: '11999' } })
    expect(onPickSgg).toHaveBeenCalledTimes(1)
    expect(onPickSgg).toHaveBeenCalledWith('11999')
  })

  it('AC-7907.1: 밖에서 다른 시·군·구가 오면(주소로 열기 등) 그 시·도·시·군·구로 칸이 바뀐다', () => {
    const view = setup({ sgg: null, dongs: null, result: null })
    fireEvent.change(screen.getByRole('combobox', { name: '시·도' }), { target: { value: '11' } })
    view.rerender(<ScanView {...view.props} sgg="41999" />)
    expect((screen.getByRole('combobox', { name: '시·도' }) as HTMLSelectElement).value).toBe('41')
    expect((screen.getByRole('combobox', { name: '시·군·구' }) as HTMLSelectElement).value).toBe('41999')
    expect(view.onPickSgg).not.toHaveBeenCalled()
  })

  it('AC-7907.1: 고른 시·군·구가 칸에 보이고, 받은 시각·점수 매기는 법 링크가 있다', () => {
    setup()
    expect((screen.getByRole('combobox', { name: '시·도' }) as HTMLSelectElement).value).toBe('11')
    expect((screen.getByRole('combobox', { name: '시·군·구' }) as HTMLSelectElement).value).toBe('11999')
    expect(screen.getByText('행정동 3곳 · 2026년 11월 22일 10:40에 받은 자료로 매겼어요')).toBeTruthy()
    const link = screen.getByRole('link', { name: '점수 매기는 법과 출처 보기' })
    expect(link.getAttribute('href')).toBe('/location?tab=sources#src-score')
  })

  it('AC-7907.1: 동마다 점수 색 칸으로 지도에 칠하고 이름 아래 점수를 적는다(처음 고른 동 = 1위)', () => {
    setup()
    expect(screen.getByTestId('map').getAttribute('aria-label')).toBe('예시구 행정동 점수 지도')
    expect([GARAM, HANEUL, CHAMI].map((c) => [area(c).dataset.tone, area(c).textContent])).toEqual([
      ['4', '가람동 89점'],
      ['0', '하늘동 23점'],
      ['1', '차미동 68점'],
    ])
    expect(area(GARAM).dataset.selected).toBe('true')
    const legend = screen.getByText('점수').parentElement!
    for (const label of ['59 아래', '60~69', '70~74', '75~79', '80 넘게']) expect(within(legend).getByText(label)).toBeTruthy()
  })

  it('AC-7907.1: 추천 동 순위는 점수 높은 차례이고 동마다 까닭 한 줄(못 이은 동은 그 글)', () => {
    setup()
    expect(screen.getByRole('heading', { name: '추천 동 순위' })).toBeTruthy()
    expect(screen.getByText('점수 높은 차례')).toBeTruthy()
    expect(rankOrder()).toEqual([GARAM, CHAMI, HANEUL])
    expect(rankItem(GARAM).getAttribute('aria-current')).toBe('true')
    expect(rankItem(GARAM).textContent).toContain('89점')
    expect(within(rankItem(GARAM)).getByText('40세 이상 인구가 1km²에 10,000명으로 많고 역까지 200m로 가까워요.')).toBeTruthy()
    expect(within(rankItem(HANEUL)).getByText('60세 이상이 25%로 많지만 역까지 1.4km로 멀어요.')).toBeTruthy()
    expect(within(rankItem(CHAMI)).getByText('이 동은 인구 자료와 잇지 못했어요')).toBeTruthy()
  })

  it('AC-7907.1: 여섯 곳까지 보이고 [모든 동 {n}곳 보기]·[여섯 곳만 보기]', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ ...SCAN_DONGS[0], code10: `11999${510 + i}00`, name: `예시${i + 1}동` }))
    setup({ result: { ok: true, ...scanData({ dongs: many }) } })
    expect(rankOrder()).toHaveLength(6)
    fireEvent.click(screen.getByRole('button', { name: '모든 동 8곳 보기' }))
    expect(rankOrder()).toHaveLength(8)
    fireEvent.click(screen.getByRole('button', { name: '여섯 곳만 보기' }))
    expect(rankOrder()).toHaveLength(6)
  })

  it('AC-7907.1: 저장한 후보는 지도 표시와 그 동의 `후보 {이름}` 칩', () => {
    setup({ candidates: [{ id: 'c1', label: 'A', at: { lat: 37.5025, lng: 127.0025 } }] })
    const mark = screen.getByTestId('map').querySelector<HTMLElement>('[data-mark="c1"]')!
    expect([mark.dataset.kind, mark.textContent]).toEqual(['candidate', 'A'])
    expect(within(rankItem(GARAM)).getByText('후보 A')).toBeTruthy()
    expect(within(rankItem(HANEUL)).queryByText('후보 A')).toBeNull()
    expect(within(picked()).getByText('후보 A')).toBeTruthy()
    expect(screen.getByText('파란 표시 = 저장한 후보')).toBeTruthy()
  })

  it('AC-7907.1: 받는 동안 `자료 {n}/{m}`, 못 받으면 E-LOC-SOURCE와 [다시 받기], 지역 밖이면 `이 지역은 자료 없음`', () => {
    const view = setup({ result: null, progress: { done: 3, total: 10 } })
    expect(screen.getByText(/자료 3\/10/)).toBeTruthy()
    expect(screen.queryByTestId('map')).toBeNull()
    view.rerender(<ScanView {...view.props} result={{ ok: false, why: 'failed' }} progress={null} />)
    expect(screen.getByRole('alert').textContent).toContain('E-LOC-SOURCE')
    fireEvent.click(screen.getByRole('button', { name: '다시 받기' }))
    expect(view.onRetry).toHaveBeenCalledTimes(1)
    view.rerender(<ScanView {...view.props} result={{ ok: false, why: 'outside' }} progress={null} />)
    expect(screen.getByText('이 지역은 자료 없음')).toBeTruthy()
    expect(view.onPickSgg).not.toHaveBeenCalled()
  })
})

describe('AC-7907.2: 무게를 움직이면 다시 부르지 않고 색·순위·점수가 바로 바뀐다', () => {
  it('AC-7907.2: 경쟁 무게 50 → 점수·색이 바로 바뀌고 부르기 콜백은 다시 불리지 않으며 설정은 저장 콜백으로', () => {
    vi.useFakeTimers()
    const { onPickSgg, onRuleChange, onRuleSave } = setup()
    expect(screen.getByRole('button', { name: '기본 무게로' })).toBeTruthy()
    move('경쟁', 50)
    expect(area(CHAMI).dataset.tone).toBe('3')
    expect(area(CHAMI).textContent).toBe('차미동 75점')
    expect(rankItem(GARAM).textContent).toContain('85점')
    expect(onRuleChange).toHaveBeenCalledTimes(1)
    expect(onRuleChange.mock.calls[0][0].weights.rivals).toBe(50)
    expect(onRuleSave).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(SAVE_DELAY_MS)
    })
    expect(onRuleSave).toHaveBeenCalledTimes(1)
    expect(onRuleSave.mock.calls[0][0].weights.rivals).toBe(50)
    expect(onPickSgg).not.toHaveBeenCalled()
  })

  it('AC-7907.2: 사는 사람·수요와 교통·흐름을 0으로 하면 순위가 바뀐다', () => {
    const { onPickSgg } = setup()
    move('사는 사람·수요', 0)
    move('교통·흐름', 0)
    expect(rankOrder()).toEqual([CHAMI, GARAM, HANEUL])
    expect(rankItem(CHAMI).textContent).toContain('99점')
    expect(area(CHAMI).dataset.tone).toBe('4')
    expect(onPickSgg).not.toHaveBeenCalled()
  })

  it('AC-7907.2: 밖에서 받은 설정(저장해 둔 값)이 바뀌면 그 값으로 다시 센다', () => {
    const view = setup()
    const rule = fresh()
    rule.weights.rivals = 50
    view.rerender(<ScanView {...view.props} rule={rule} />)
    expect(area(CHAMI).textContent).toBe('차미동 75점')
    expect(view.onPickSgg).not.toHaveBeenCalled()
  })
})

describe('AC-7919.3: 세부 무게·기준·나이대를 바꿔도 바깥 자료를 다시 부르지 않고 바로', () => {
  it('AC-7919.3: 셀 나이대를 모두 고르면 하늘동이 27점으로', () => {
    const { onPickSgg } = setup()
    fireEvent.click(screen.getByRole('button', { name: '사는 사람·수요 세부' }))
    for (const band of ['0~9세', '10~19세', '20~29세', '30~39세']) fireEvent.click(screen.getByRole('checkbox', { name: band }))
    expect(rankItem(HANEUL).textContent).toContain('27점')
    expect(onPickSgg).not.toHaveBeenCalled()
  })

  it('AC-7919.3: 400m 안 정류장 수 만점 기준을 바꾸면 가람동 교통·흐름 점수가 바로 바뀐다', () => {
    const { onPickSgg } = setup()
    fireEvent.click(screen.getByRole('button', { name: '교통·흐름 세부' }))
    fireEvent.change(screen.getByRole('textbox', { name: '400m 안 정류장 수 만점 기준' }), { target: { value: '20' } })
    // 정류장 10곳 → 50점: 교통·흐름 = 66 + 16 = 82 → 버림(82 × 20 ÷ 75) = 21
    expect(bar('transit').textContent).toContain('21/26')
    expect(onPickSgg).not.toHaveBeenCalled()
  })
})

describe('AC-7907.3: 동을 누르면 그 동 항목 점수와 [후보 더하기]·[네이버 부동산에서 매물 보기]', () => {
  it('AC-7907.3: 고른 동 판 — 이름·점수·사는 사람·항목 막대 `{점수}/{만점}`·몇 항목으로', () => {
    setup()
    const box = picked()
    expect(within(box).getByRole('heading', { level: 3, name: '가람동' })).toBeTruthy()
    expect(box.textContent).toContain('89점')
    expect(within(box).getByText('사는 사람 10,000명')).toBeTruthy()
    expect(within(box).getByRole('link', { name: /행정안전부.*기준 2026년 10월 31일/ })).toBeTruthy()
    expect(['people', 'rivals', 'transit'].map((g) => bar(g).textContent)).toEqual(['사는 사람·수요38/40', '경쟁25/33', '교통·흐름26/26'])
    expect(within(box).getByText('3개 항목으로 매겼어요')).toBeTruthy()
    expect(
      within(box).getByText(
        '동 점수는 동 전체 값으로 세 항목(사는 사람·수요, 경쟁, 교통·흐름)만 매겨요. 자리·비용은 동 단위 자료가 없어 후보를 정한 뒤에 매겨요. 후보를 저장하면 그 자리 둘레(살필 범위)로 다시 매겨요.',
      ),
    ).toBeTruthy()
  })

  it('AC-7907.3: 순위에서 누르면 그 동이 열리고, [{동}에서 후보 더하기]는 그 동 가운데 점으로 더하기 콜백', () => {
    const { onAdd, onPickSgg } = setup()
    fireEvent.click(rankItem(HANEUL))
    expect(within(picked()).getByRole('heading', { level: 3, name: '하늘동' })).toBeTruthy()
    expect(rankItem(HANEUL).getAttribute('aria-current')).toBe('true')
    expect(area(HANEUL).dataset.selected).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '하늘동에서 후보 더하기' }))
    expect(onAdd).toHaveBeenCalledWith({ code10: HANEUL, name: '하늘동', at: { lat: 37.5025, lng: 127.0075 } })
    expect(onPickSgg).not.toHaveBeenCalled()
  })

  it('AC-7907.3: 지도에서 누르면 그 동이 열리고, [네이버 부동산에서 {동} 매물 보기]는 새 창 링크', () => {
    setup()
    fireEvent.click(area(CHAMI))
    expect(within(picked()).getByRole('heading', { level: 3, name: '차미동' })).toBeTruthy()
    const link = screen.getByRole('link', { name: '네이버 부동산에서 차미동 매물 보기' })
    expect(link.getAttribute('href')).toBe(naverLandUrl({ lat: 37.5025, lng: 127.0125 }))
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('AC-7907.3: 못 이은 동은 판에도 그 글이 보인다', () => {
    setup()
    fireEvent.click(rankItem(CHAMI))
    expect(within(picked()).getAllByText('이 동은 인구 자료와 잇지 못했어요').length).toBeGreaterThan(0)
    expect(within(picked()).queryByText(/^사는 사람 /)).toBeNull()
  })
})

describe('AC-7907.4: 자료 하나가 실패·열쇠 없음이면 그 항목만 값 없음 · 남은 무게로 · 몇 항목으로', () => {
  it('AC-7907.4: 역·정류장을 못 받으면 교통·흐름은 `값 없음`, 남은 두 항목으로 86점, 그 자료 칸 글', () => {
    const { onRetry } = setup({ result: { ok: true, ...noTransit() } })
    expect(area(GARAM).textContent).toBe('가람동 86점')
    expect(['people', 'rivals', 'transit'].map((g) => bar(g).textContent)).toEqual(['사는 사람·수요52/54', '경쟁34/45', '교통·흐름값 없음'])
    expect(within(picked()).getByText('2개 항목으로 매겼어요')).toBeTruthy()
    const missing = screen.getByRole('list', { name: '받지 못한 자료' })
    expect(missing.textContent).toContain('지금 받지 못했어요.')
    expect(missing.textContent).toContain('이 지역은 자료 없음')
    fireEvent.click(within(missing).getByRole('button', { name: '다시 받기' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('AC-7907.4: 열쇠 없음·활용신청 안 됨은 자료 이름과 함께 그 글', () => {
    setup({
      result: {
        ok: true,
        ...scanData({
          parts: { ...scanData().parts, rivals: { ok: false, src: 'hosp-list', why: 'no-key' }, schools: { ok: false, src: 'school', why: 'not-applied' } },
        }),
      },
    })
    const missing = screen.getByRole('list', { name: '받지 못한 자료' })
    expect(missing.textContent).toContain('병원정보서비스: 열쇠를 넣으면 보여요.')
    expect(missing.textContent).toContain("공공데이터포털에서 '전국초중등학교위치표준데이터' 활용신청을 하면 보여요.")
  })

  it('AC-7907.4: 다 받았으면 받지 못한 자료 목록이 없다', () => {
    setup()
    expect(screen.queryByRole('list', { name: '받지 못한 자료' })).toBeNull()
  })
})

// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AGE_BANDS, DEFAULT_SCORE_RULE, RULE_TEXT, type ScoreRule } from '@/lib/location/score'
import { SAVE_DELAY_MS, ScoreWeights, type ScoreWeightsProps } from './ScoreWeights'

// 점수 무게 판 (spec location REQ-7919 AC-7919.1·AC-7919.4·AC-7919.6, REQ-7907 AC-7907.2, design.md 8절, 시안 ?s=weights 승인 2).
// 설정은 props(rule), 바뀐 설정은 onChange(바로), 저장은 onSave(마지막으로 고친 뒤 SAVE_DELAY_MS). 처음 값은 design.md 8절 표를 손으로 옮겨 적어 견준다

const fresh = (): ScoreRule => structuredClone(DEFAULT_SCORE_RULE) as ScoreRule

function setup(over: Partial<ScoreWeightsProps> = {}) {
  const onChange = vi.fn<(rule: ScoreRule) => void>()
  const onSave = vi.fn<(rule: ScoreRule) => void>()
  const props: ScoreWeightsProps = { rule: fresh(), onChange, onSave, ...over }
  const view = render(<ScoreWeights {...props} />)
  return { onChange, onSave, props, ...view }
}

const openGroup = (name: string) => fireEvent.click(screen.getByRole('button', { name: `${name} 세부` }))
const slider = (name: string) => screen.getByRole('slider', { name })
const row = (name: string) => screen.getByRole('group', { name })
const move = (name: string, value: number) => fireEvent.change(slider(name), { target: { value: String(value) } })
const type = (label: string, value: string) => fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value } })
const settle = () =>
  act(() => {
    vi.advanceTimersByTime(SAVE_DELAY_MS)
  })

/** 기준 줄 글: 칸은 [적힌 값]으로 바꿔 읽는다 */
function lineText(el: Element): string {
  const read = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
    if (node instanceof HTMLInputElement) return ` [${node.value}]`
    return Array.from(node.childNodes).map(read).join('')
  }
  return read(el).replace(/\s+/g, ' ').replace(/\[\s/g, '[').trim()
}
const ruleLine = (name: string) => lineText(within(row(name)).getByText(/100점/))

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// design.md 8절 표 — [항목, 세부 이름(화면 글 기본값), 처음 무게, 기준 줄]
const TABLE: readonly (readonly [string, string, number, string])[] = [
  ['사는 사람·수요', '고른 나이대 인구 밀도', 40, '1km²에 [10,000]명이면 100점'],
  ['사는 사람·수요', '60세 이상 비율', 15, '[25]%면 100점'],
  ['사는 사람·수요', '세대 수', 5, '[20,000]세대면 100점'],
  ['사는 사람·수요', '아파트 세대(입주 예정 포함)', 10, '[10,000]세대면 100점'],
  ['사는 사람·수요', '인구 추세(4년)', 10, '4년 사이 [5]% 늘면 100점'],
  ['사는 사람·수요', '교통사고 다발 지점', 5, '[3]곳이면 100점'],
  ['사는 사람·수요', '산업단지 고용 인원', 5, '[20,000]명이면 100점'],
  ['사는 사람·수요', '학교 수', 5, '[5]곳이면 100점'],
  ['사는 사람·수요', '경로당·체력단련장 수', 5, '[30]곳이면 100점'],
  ['사는 사람·수요', '의료급여·차상위 비율', 0, '[5]%면 100점'],
  ['경쟁', '경쟁 의원 수', 30, '[0]곳 이하면 100점 · [6]곳 이상이면 0점'],
  ['경쟁', '1곳당 사는 사람', 35, '[20,000]명이면 100점'],
  ['경쟁', '3년 새로 연 곳', 15, '[0]곳 이하면 100점 · [3]곳 이상이면 0점'],
  ['경쟁', '진료 시간 빈틈', 10, '[10]칸이면 100점'],
  ['경쟁', '진료비 차이(둘레 평균이 지금 의원보다)', 10, '둘레 평균이 [20]% 비싸면 100점'],
  ['교통·흐름', '역까지 거리', 40, '[200]m 이하면 100점 · [1,500]m 이상이면 0점'],
  ['교통·흐름', '400m 안 정류장 수', 20, '[10]곳이면 100점'],
  ['교통·흐름', '하루 승하차(사람 흐름)', 40, '[30,000]명이면 100점'],
  ['자리', '층', 25, '[1]층 이하면 100점 · [5]층 이상이면 0점'],
  ['자리', '엘리베이터', 20, '[1]대면 100점'],
  ['자리', '주차', 15, '[30]대면 100점'],
  ['자리', '지은 해(건물 나이)', 10, '[5]년 이하면 100점 · [30]년 이상이면 0점'],
  ['자리', '이웃 약국(30m 안)', 10, '[1]곳이면 100점'],
  ['자리', '간판 보임', 10, "고른 값이 '보여요'이면 100점"],
  ['자리', '위반 건축물', 10, "고른 값이 '없음'이면 100점"],
  ['비용', '평당 월세', 35, '[50,000]원 이하면 100점 · [200,000]원 이상이면 0점'],
  ['비용', '보증금', 15, '[3,000]만 원 이하면 100점 · [20,000]만 원 이상이면 0점'],
  ['비용', '권리금', 20, '[0]만 원 이하면 100점 · [10,000]만 원 이상이면 0점'],
  ['비용', '저장 매물 평균과의 차이(평당 월세)', 30, '[-20]% 이하면 100점 · [20]% 이상이면 0점'],
]
const GROUP_NAMES = ['사는 사람·수요', '경쟁', '교통·흐름', '자리', '비용']
// 동네 훑기에 안 쓰는 세부 항목(훑기 ✕) 가운데 훑기에 쓰는 항목(앞의 셋) 안의 것
const CANDIDATE_ONLY = ['아파트 세대(입주 예정 포함)', '의료급여·차상위 비율', '진료 시간 빈틈', '진료비 차이(둘레 평균이 지금 의원보다)', '하루 승하차(사람 흐름)']

describe('AC-7907.2: 바깥 무게 막대 다섯·합계·[기본 무게로]', () => {
  it('AC-7907.2: 제목·도움 글·항목 다섯 막대(0~50, 5씩, 처음 30·25·20·15·10)·합계 글이 화면 글 기본값 그대로다', () => {
    setup()
    expect(screen.getByRole('heading', { name: '점수 무게' })).toBeTruthy()
    expect(
      screen.getByText(
        '중요하게 볼 것을 무겁게 해요. 지도 색·순위·후보 점수가 바로 바뀌어요. 동네 훑기는 앞의 세 항목만 쓰고, 자리·비용 무게는 후보 점수에 써요. [세부]를 펼치면 항목 안의 세부 무게와 만점 기준을 직접 정해요.',
      ),
    ).toBeTruthy()
    const start = [30, 25, 20, 15, 10]
    GROUP_NAMES.forEach((name, i) => {
      const s = slider(name) as HTMLInputElement
      expect([s.min, s.max, s.step, s.value], name).toEqual(['0', '50', '5', String(start[i])])
    })
    expect(screen.getByRole('button', { name: '기본 무게로' })).toBeTruthy()
    expect(screen.getByText(/^무게 합계/).textContent).toBe('무게 합계 100 · 합이 100이 아니어도 비율로 계산해요')
  })

  it('AC-7907.2: 막대를 움직이면 바뀐 설정이 onChange로 바로 가고, 저장(onSave)은 멈춘 뒤 한 번만 간다', () => {
    const { onChange, onSave } = setup()
    move('경쟁', 35)
    move('경쟁', 40)
    expect(onChange).toHaveBeenCalledTimes(2)
    const last = onChange.mock.calls[1][0]
    expect(last).toEqual({ ...fresh(), weights: { ...fresh().weights, rivals: 40 } })
    expect(screen.getByText(/^무게 합계/).textContent).toBe('무게 합계 115 · 합이 100이 아니어도 비율로 계산해요')
    expect(onSave).not.toHaveBeenCalled()
    settle()
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith(last)
  })

  it('AC-7907.2: [기본 무게로]는 바깥 무게 다섯만 처음 값으로 되돌려 저장한다(세부 설정은 그대로)', () => {
    const rule = fresh()
    rule.weights = { people: 50, rivals: 0, transit: 5, site: 45, cost: 35 }
    rule.items['c-count'] = { w: 50, best: 1, worst: 9 }
    rule.bands = [6, 7]
    const { onSave } = setup({ rule })
    fireEvent.click(screen.getByRole('button', { name: '기본 무게로' }))
    expect((slider('비용') as HTMLInputElement).value).toBe('10')
    settle()
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0]).toEqual({ ...rule, weights: { ...DEFAULT_SCORE_RULE.weights } })
  })

  it('AC-7907.2: 설정은 props로 받는다 — 받은 무게로 그리고, 밖에서 다른 설정이 오면 그 값으로 다시 그린다', () => {
    const rule = fresh()
    rule.weights.transit = 45
    const { rerender, props } = setup({ rule })
    expect((slider('교통·흐름') as HTMLInputElement).value).toBe('45')
    const next = fresh()
    next.weights.transit = 5
    rerender(<ScoreWeights {...props} rule={next} />)
    expect((slider('교통·흐름') as HTMLInputElement).value).toBe('5')
  })

  it('AC-7907.2: 저장을 기다리는 중에 판이 닫히면(사라지면) 마지막 설정을 바로 저장한다', () => {
    const { onSave, unmount } = setup()
    move('자리', 20)
    unmount()
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0].weights.site).toBe(20)
  })
})

describe('AC-7919.1: 항목마다 [세부 ▾] — 세부 무게 막대·만점 기준 칸·나이대·후보에서만', () => {
  it('AC-7919.1: [세부 ▾]는 처음에 닫혀 있고, 누르면 그 항목 세부 판만 열린다(▴)', () => {
    setup()
    const btn = screen.getByRole('button', { name: '경쟁 세부' })
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    expect(btn.textContent).toBe('세부 ▾')
    expect(screen.queryByRole('slider', { name: '경쟁 의원 수' })).toBeNull()
    fireEvent.click(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    expect(btn.textContent).toBe('세부 ▴')
    const panel = document.getElementById(btn.getAttribute('aria-controls') ?? '')
    expect(panel).not.toBeNull()
    expect(within(panel as HTMLElement).getByRole('slider', { name: '경쟁 의원 수' })).toBeTruthy()
    expect(screen.queryByRole('slider', { name: '역까지 거리' })).toBeNull()
    fireEvent.click(btn)
    expect(screen.queryByRole('slider', { name: '경쟁 의원 수' })).toBeNull()
  })

  it.each(TABLE)('AC-7919.1: %s › %s — 막대 0~50·5씩·처음 무게 %i, 기준 줄 "%s"', (group, name, w, line) => {
    setup()
    openGroup(group)
    const s = slider(name) as HTMLInputElement
    expect([s.min, s.max, s.step, s.value]).toEqual(['0', '50', '5', String(w)])
    expect(ruleLine(name)).toBe(line)
  })

  it('AC-7919.1: 많을수록 좋음은 칸 하나, 적을수록 좋음은 칸 둘, 고르는 값(간판·위반 건축물)은 칸이 없다', () => {
    setup()
    for (const g of GROUP_NAMES) openGroup(g)
    for (const [, name, , line] of TABLE) {
      const boxes = within(row(name)).queryAllByRole('textbox')
      const want = line.includes('고른 값이') ? 0 : line.includes('이하면') ? 2 : 1
      expect(boxes.length, name).toBe(want)
    }
    expect(screen.getByRole('textbox', { name: '고른 나이대 인구 밀도 만점 기준' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: '역까지 거리 100점 기준' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: '역까지 거리 0점 기준' })).toBeTruthy()
  })

  it('AC-7919.1: 세부 판 머리 글과 세부 무게 합계(항목마다 100)·[기본값으로]가 있다. 자리·비용은 곁글 "후보 점수에만 써요"', () => {
    setup()
    for (const g of GROUP_NAMES) openGroup(g)
    expect(screen.getAllByText('세부 무게 · 만점 기준')).toHaveLength(5)
    expect(screen.getAllByText('후보 점수에만 써요')).toHaveLength(2)
    const sums = screen.getAllByText(/^세부 무게 합계/).map((el) => el.textContent)
    expect(sums).toEqual(Array(5).fill('세부 무게 합계 100 · 비율로 계산해요'))
    for (const g of GROUP_NAMES) expect(screen.getByRole('button', { name: `${g} 기본값으로` }).textContent).toBe('기본값으로')
  })

  it('AC-7919.1: 사는 사람·수요에는 10세 나이대 11칸 체크가 있고 처음엔 40세 이상이 골라져 있다', () => {
    setup()
    expect(screen.queryByRole('checkbox')).toBeNull()
    openGroup('사는 사람·수요')
    expect(screen.getByText('셀 나이대')).toBeTruthy()
    expect(screen.getByText("'고른 나이대 인구 밀도'에 셀 나이")).toBeTruthy()
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    const labels = ['0~9세', '10~19세', '20~29세', '30~39세', '40~49세', '50~59세', '60~69세', '70~79세', '80~89세', '90~99세', '100세 이상']
    expect(labels).toEqual(AGE_BANDS)
    expect(boxes.map((b) => screen.getByRole('checkbox', { name: labels[boxes.indexOf(b)] }) === b)).toEqual(Array(11).fill(true))
    expect(boxes.map((b) => b.checked)).toEqual([false, false, false, false, true, true, true, true, true, true, true])
    openGroup('경쟁')
    expect(screen.getAllByRole('checkbox')).toHaveLength(11)
  })

  it('AC-7919.1: 동네 훑기에서 안 쓰는 세부 항목(앞의 세 항목 안)에만 "후보에서만"이 붙는다', () => {
    setup()
    for (const g of GROUP_NAMES) openGroup(g)
    expect(screen.getAllByText('후보에서만')).toHaveLength(CANDIDATE_ONLY.length)
    for (const [group, name] of TABLE) {
      const has = within(row(name)).queryByText('후보에서만') !== null
      expect(has, name).toBe(CANDIDATE_ONLY.includes(name))
      if (group === '자리' || group === '비용') expect(has, name).toBe(false)
    }
  })

  it('AC-7919.1: 세부 무게 막대·나이대·기준 칸을 바꾸면 그 값만 바뀐 설정이 onChange·onSave로 간다', () => {
    const { onChange, onSave } = setup()
    openGroup('사는 사람·수요')
    move('세대 수', 25)
    fireEvent.click(screen.getByRole('checkbox', { name: '30~39세' }))
    type('고른 나이대 인구 밀도 만점 기준', '12,500')
    const want = fresh()
    want.items['p-households'] = { w: 25, full: 20000 }
    want.bands = [3, 4, 5, 6, 7, 8, 9, 10]
    want.items['p-density'] = { w: 40, full: 12500 }
    expect(onChange).toHaveBeenCalledTimes(3)
    expect(onChange.mock.calls[2][0]).toEqual(want)
    expect(screen.getByText(/^세부 무게 합계/).textContent).toBe('세부 무게 합계 120 · 비율로 계산해요')
    settle()
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith(want)
  })

  it('AC-7919.1: 보증금·권리금 칸은 만 원으로 적고 원으로 저장한다', () => {
    const { onSave } = setup()
    openGroup('비용')
    type('보증금 100점 기준', '5,000')
    type('권리금 0점 기준', '8000')
    settle()
    expect(onSave).toHaveBeenCalledTimes(1)
    const saved = onSave.mock.calls[0][0]
    expect(saved.items['k-deposit']).toEqual({ w: 15, best: 50_000_000, worst: 200_000_000 })
    expect(saved.items['k-premium']).toEqual({ w: 20, best: 0, worst: 80_000_000 })
  })

  it('AC-7919.1: 받은 설정의 세부 값으로 그린다(설정은 props)', () => {
    const rule = fresh()
    rule.items['t-station'] = { w: 50, best: 300, worst: 2000 }
    rule.items['k-rentPy'] = { w: 5, best: 70000, worst: 120000 }
    setup({ rule })
    openGroup('교통·흐름')
    openGroup('비용')
    expect((slider('역까지 거리') as HTMLInputElement).value).toBe('50')
    expect(ruleLine('역까지 거리')).toBe('[300]m 이하면 100점 · [2,000]m 이상이면 0점')
    expect(ruleLine('평당 월세')).toBe('[70,000]원 이하면 100점 · [120,000]원 이상이면 0점')
  })
})

describe('AC-7919.4: 칸 검사 — 틀리면 저장 콜백을 부르지 않고 그 칸 아래 안내 글', () => {
  it.each([
    ['기준 0', '고른 나이대 인구 밀도', '고른 나이대 인구 밀도 만점 기준', '0', RULE_TEXT.full],
    ['기준 빈칸', '하루 승하차(사람 흐름)', '하루 승하차(사람 흐름) 만점 기준', '', RULE_TEXT.full],
    ['숫자 아님', '주차', '주차 만점 기준', '삼십', RULE_TEXT.full],
    ['적을수록 기준 빈칸', '경쟁 의원 수', '경쟁 의원 수 0점 기준', '', RULE_TEXT.blank],
    ['100점 값 = 0점 값', '역까지 거리', '역까지 거리 100점 기준', '1500', RULE_TEXT.order],
    ['100점 값 > 0점 값', '평당 월세', '평당 월세 0점 기준', '40000', RULE_TEXT.order],
  ] as const)('AC-7919.4: %s(%s)이면 onChange·onSave를 부르지 않고 칸 아래 글이 보인다', (_why, name, label, value, text) => {
    const { onChange, onSave } = setup()
    for (const g of GROUP_NAMES) openGroup(g)
    type(label, value)
    settle()
    expect(onChange).not.toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
    expect(within(row(name)).getByText(text)).toBeTruthy()
    const box = screen.getByRole('textbox', { name: label })
    expect(box.getAttribute('aria-invalid')).toBe('true')
    expect(box.getAttribute('aria-describedby')).toBeTruthy()
    expect(document.getElementById(box.getAttribute('aria-describedby') ?? '')?.textContent).toBe(text)
  })

  it('AC-7919.4: 나이대를 하나도 안 고르면 저장하지 않고 "나이대를 하나 이상 골라 주세요."가 보인다', () => {
    const { onChange, onSave } = setup()
    openGroup('사는 사람·수요')
    for (const name of ['40~49세', '50~59세', '60~69세', '70~79세', '80~89세', '90~99세', '100세 이상']) {
      fireEvent.click(screen.getByRole('checkbox', { name }))
    }
    expect(onChange).toHaveBeenCalledTimes(6)
    settle()
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText(RULE_TEXT.bands)).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: '50~59세' }))
    expect(screen.queryByText(RULE_TEXT.bands)).toBeNull()
    settle()
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0].bands).toEqual([5])
  })

  it('AC-7919.4: 틀린 칸이 하나라도 있으면 다른 막대를 움직여도 저장하지 않고, 고치면 그때 저장한다', () => {
    const { onChange, onSave } = setup()
    openGroup('경쟁')
    type('경쟁 의원 수 100점 기준', '')
    move('비용', 30)
    settle()
    expect(onChange).not.toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
    expect(within(row('경쟁 의원 수')).getByText(RULE_TEXT.blank)).toBeTruthy()
    type('경쟁 의원 수 100점 기준', '2')
    expect(within(row('경쟁 의원 수')).queryByText(RULE_TEXT.blank)).toBeNull()
    settle()
    expect(onSave).toHaveBeenCalledTimes(1)
    const saved = onSave.mock.calls[0][0]
    expect(saved.weights.cost).toBe(30)
    expect(saved.items['c-count']).toEqual({ w: 30, best: 2, worst: 6 })
  })

  it('AC-7919.4: 저장을 기다리는 중에 칸이 틀어지면 기다리던 저장도 하지 않는다', () => {
    const { onSave, unmount } = setup()
    move('경쟁', 45)
    openGroup('교통·흐름')
    type('400m 안 정류장 수 만점 기준', '0')
    settle()
    unmount()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('AC-7919.4: 틀린 칸이 있는 세부 판은 [세부 ▴]를 눌러도 닫히지 않는다(안내 글이 숨지 않게)', () => {
    setup()
    openGroup('자리')
    type('주차 만점 기준', '')
    openGroup('자리')
    expect(screen.getByRole('textbox', { name: '주차 만점 기준' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '자리 세부' }).getAttribute('aria-expanded')).toBe('true')
  })

  it('AC-7919.4: 항목 [기본값으로]는 그 항목의 세부 무게·기준만(사는 사람·수요는 나이대도) 처음 값으로 되돌려 저장한다', () => {
    const rule = fresh()
    rule.weights.people = 45
    rule.bands = [2, 3]
    rule.items['p-density'] = { w: 10, full: 3000 }
    rule.items['p-welfare'] = { w: 20, best: 2, worst: 8 }
    rule.items['c-count'] = { w: 50, best: 1, worst: 9 }
    const { onSave } = setup({ rule })
    openGroup('사는 사람·수요')
    fireEvent.click(screen.getByRole('button', { name: '사는 사람·수요 기본값으로' }))
    expect((slider('고른 나이대 인구 밀도') as HTMLInputElement).value).toBe('40')
    expect(ruleLine('의료급여·차상위 비율')).toBe('[5]%면 100점')
    settle()
    expect(onSave).toHaveBeenCalledTimes(1)
    const want = structuredClone(rule)
    want.bands = [...DEFAULT_SCORE_RULE.bands]
    want.items['p-density'] = { ...DEFAULT_SCORE_RULE.items['p-density'] }
    want.items['p-welfare'] = { ...DEFAULT_SCORE_RULE.items['p-welfare'] }
    expect(onSave.mock.calls[0][0]).toEqual(want)
    expect(onSave.mock.calls[0][0].weights.people).toBe(45)
    expect(onSave.mock.calls[0][0].items['c-count']).toEqual({ w: 50, best: 1, worst: 9 })
  })

  it('AC-7919.4: [기본값으로]는 틀린 칸도 처음 값으로 되돌려 저장이 다시 된다', () => {
    const { onSave } = setup()
    openGroup('비용')
    type('보증금 0점 기준', '')
    fireEvent.click(screen.getByRole('button', { name: '비용 기본값으로' }))
    expect(screen.queryByText(RULE_TEXT.blank)).toBeNull()
    settle()
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0]).toEqual(fresh())
  })

  it('AC-7919.4: 밖에서 같은 설정을 다시 내려 줘도 고치던 칸(틀린 값)은 지우지 않는다', () => {
    const { rerender, props } = setup()
    openGroup('경쟁')
    type('진료 시간 빈틈 만점 기준', '')
    rerender(<ScoreWeights {...props} rule={fresh()} />)
    expect((screen.getByRole('textbox', { name: '진료 시간 빈틈 만점 기준' }) as HTMLInputElement).value).toBe('')
    expect(within(row('진료 시간 빈틈')).getByText(RULE_TEXT.full)).toBeTruthy()
  })

  it('AC-7919.4: 저장은 콜백뿐 — 판 파일에 바깥 부르기·저장소·supabase·폰 전용 모양(max-md:)이 없다', () => {
    const dir = join(process.cwd(), 'src/components/location/weights')
    const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      const text = readFileSync(join(dir, f), 'utf8')
      expect(text, f).not.toMatch(/\bfetch\s*\(|supabase|@\/lib\/storage|localStorage|sessionStorage|indexedDB|max-md:/)
    }
  })
})

describe('AC-7919.6: 의료급여·차상위 비율(p-welfare) 방향 고르기', () => {
  it('AC-7919.6: 처음엔 무게 0·[많을수록 좋음]·"5%면 100점"이다', () => {
    setup()
    openGroup('사는 사람·수요')
    expect((slider('의료급여·차상위 비율') as HTMLInputElement).value).toBe('0')
    const r = row('의료급여·차상위 비율')
    expect(within(r).getByRole('button', { name: '많을수록 좋음' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(r).getByRole('button', { name: '적을수록 좋음' }).getAttribute('aria-pressed')).toBe('false')
    expect(ruleLine('의료급여·차상위 비율')).toBe('[5]%면 100점')
  })

  it('AC-7919.6: 방향 고르기는 이 세부 항목에만 있다', () => {
    setup()
    for (const g of GROUP_NAMES) openGroup(g)
    expect(screen.getAllByRole('button', { name: '적을수록 좋음' })).toHaveLength(1)
  })

  it('AC-7919.6: [적을수록 좋음]을 고르면 기준 둘(처음 1% 이하면 100점 · 5% 이상이면 0점)로 바뀌어 저장된다', () => {
    const { onChange, onSave } = setup()
    openGroup('사는 사람·수요')
    fireEvent.click(within(row('의료급여·차상위 비율')).getByRole('button', { name: '적을수록 좋음' }))
    expect(ruleLine('의료급여·차상위 비율')).toBe('[1]% 이하면 100점 · [5]% 이상이면 0점')
    expect(within(row('의료급여·차상위 비율')).getByRole('button', { name: '적을수록 좋음' }).getAttribute('aria-pressed')).toBe('true')
    const want = fresh()
    want.items['p-welfare'] = { w: 0, best: 1, worst: 5 }
    expect(onChange).toHaveBeenLastCalledWith(want)
    settle()
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith(want)
    fireEvent.click(within(row('의료급여·차상위 비율')).getByRole('button', { name: '많을수록 좋음' }))
    expect(ruleLine('의료급여·차상위 비율')).toBe('[5]%면 100점')
    settle()
    expect(onSave).toHaveBeenLastCalledWith(fresh())
  })

  it('AC-7919.6: 적을수록 좋음으로 저장된 설정은 그 모양으로 그리고 칸 검사도 그 모양으로 한다', () => {
    const rule = fresh()
    rule.items['p-welfare'] = { w: 15, best: 2, worst: 6 }
    const { onSave } = setup({ rule })
    openGroup('사는 사람·수요')
    expect(within(row('의료급여·차상위 비율')).getByRole('button', { name: '적을수록 좋음' }).getAttribute('aria-pressed')).toBe('true')
    expect(ruleLine('의료급여·차상위 비율')).toBe('[2]% 이하면 100점 · [6]% 이상이면 0점')
    type('의료급여·차상위 비율 100점 기준', '7')
    settle()
    expect(onSave).not.toHaveBeenCalled()
    expect(within(row('의료급여·차상위 비율')).getByText(RULE_TEXT.order)).toBeTruthy()
  })

  it('AC-7919.6: 예전에 저장한 설정에 이 세부 항목이 없으면 처음 값(무게 0·5%면 100점)으로 채워 그린다', () => {
    const old = fresh() as unknown as { items: Record<string, unknown> }
    delete old.items['p-welfare']
    setup({ rule: old as unknown as ScoreRule })
    openGroup('사는 사람·수요')
    expect((slider('의료급여·차상위 비율') as HTMLInputElement).value).toBe('0')
    expect(ruleLine('의료급여·차상위 비율')).toBe('[5]%면 100점')
  })
})

// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_DEPT_RULE } from '@/lib/location/depts'
import { scoreFactsOf } from '@/lib/location/facts'
import { DEFAULT_SCORE_RULE, scoreItems, type ScoreRule } from '@/lib/location/score'
import type { Candidate, DeptRule, Listing } from '@/types/location'
import { CandidateFrame, RADIUS_DELAY_MS, SECTIONS, type CandidateFrameProps, type SectionId } from './CandidateFrame'
import { CAND_ID, OTHER_ID, OTHER_LISTING, RIVALS, TODAY, makeCandidate, makeListing, makeRival, makeSnapshot, ok } from './frame.test.data'

// 후보 자세히 틀(TASK-32 · TASK-68): 위험 신호 → 종합 점수(+ 점수 풀이) → 살필 범위 → 묶음 열셋(칸으로 받음) · 왼쪽 목차 · [오늘 값으로 다시 받기].
// 점수·위험 신호·경쟁 수는 lib/location/facts.ts가 받은 과목 고르기(deptRule)로 센다

const SECTION_ORDER: SectionId[] = [
  'people',
  'income',
  'demand',
  'rivals',
  'others',
  'price',
  'hours',
  'traffic',
  'photo',
  'building',
  'vacancy',
  'land',
  'future',
]
const SECTION_TITLES = [
  '사는 사람',
  '소득·쓸 힘',
  '정형외과 수요',
  '경쟁 의원',
  '둘레 다른 과 의원',
  '경쟁 의원 진료비',
  '진료 시간 빈틈',
  '교통·둘레 시설',
  '거리 사진',
  '건물 서류',
  '빈 칸 짐작',
  '땅 쓰임·계획',
  '앞으로 바뀔 것',
]
// 묶음이 그리는 닻 id(시안 그대로, design.md 19절 묶음 id): 칸 rivals → comp, building → bld, vacancy → vac
const ANCHORS = ['people', 'income', 'demand', 'comp', 'others', 'price', 'hours', 'traffic', 'photo', 'bld', 'vac', 'land', 'future']

const slots = (ids: readonly SectionId[] = SECTION_ORDER) =>
  Object.fromEntries(ids.map((id) => [id, <p key={id}>{`칸 ${id}`}</p>])) as CandidateFrameProps['sections']

const LISTINGS: Listing[] = [makeListing(), OTHER_LISTING]

function props(over: Partial<CandidateFrameProps> = {}): CandidateFrameProps {
  return {
    candidate: makeCandidate(),
    letter: 'A',
    listings: LISTINGS,
    rule: DEFAULT_SCORE_RULE,
    deptRule: DEFAULT_DEPT_RULE,
    homeEswt: 50000,
    today: TODAY,
    sections: slots(),
    onOpen: vi.fn(),
    onRefresh: vi.fn(),
    onRadius: vi.fn(),
    onGo: vi.fn(),
    ...over,
  }
}

const expectedScore = (candidate: Candidate, listings: readonly Listing[], rule: ScoreRule = DEFAULT_SCORE_RULE, deptRule: DeptRule = DEFAULT_DEPT_RULE) =>
  scoreItems(scoreFactsOf({ candidate, listings, homeEswt: 50000, today: TODAY, deptRule }), rule)

/** 본문 차례: 틀이 그린 위험 신호·종합 점수는 닻 id, 칸 감싸개는 받은 칸 글 */
const bodyOrder = (root: HTMLElement) => [...root.querySelector('#sec-score')!.parentElement!.children].map((el) => el.id || el.textContent)
/** 칸 글을 감싼 감싸개(목차가 건너뛸 자리) */
const slotOf = (id: SectionId) => screen.getByText(`칸 ${id}`).parentElement!
const tocLinks = () => within(screen.getByRole('navigation', { name: '묶음 목차' })).getAllByRole('link')
const flagItems = () => within(screen.getByRole('list', { name: '위험 신호 목록' })).getAllByRole('listitem')
const slider = () => screen.getByRole('slider', { name: '살필 범위' })
const refreshButton = () => screen.getByRole('button', { name: '오늘 값으로 다시 받기' })

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AC-7909.1: 후보 자세히 차례 · 왼쪽 목차', () => {
  it('AC-7909.1: 위험 신호 → 종합 점수 → 살필 범위 → 묶음 열셋 차례다', () => {
    const { container } = render(<CandidateFrame {...props()} />)
    expect(bodyOrder(container)).toEqual(['sec-flags', 'sec-score', ...SECTION_ORDER.map((id) => `칸 ${id}`)])
    const score = container.querySelector('#sec-score')!
    const big = within(score as HTMLElement).getByTestId('score-total')
    const range = slider()
    expect(score.contains(range)).toBe(true)
    expect(big.compareDocumentPosition(range) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(range.compareDocumentPosition(slotOf('people')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-7909.1: 묶음 열셋 — 둘레 다른 과 의원(others)은 경쟁 의원 바로 다음 칸이다', () => {
    expect(SECTIONS.map((s) => s.id)).toEqual(SECTION_ORDER)
    expect(SECTIONS.map((s) => s.title)).toEqual(SECTION_TITLES)
    expect(SECTIONS.map((s) => s.anchor)).toEqual(ANCHORS)
  })

  it('AC-7909.1: 묶음은 받은 칸을 그 자리에 그대로 놓는다(틀은 묶음 속을 그리지 않음)', () => {
    render(<CandidateFrame {...props()} />)
    SECTION_ORDER.forEach((id) => {
      expect(slotOf(id).textContent).toBe(`칸 ${id}`)
    })
  })

  it('AC-7909.1: 틀이 그린 칸 감싸개에는 sec- id가 없다 — 위험 신호·종합 점수 닻만 틀이 그린다', () => {
    const { container } = render(<CandidateFrame {...props()} />)
    expect([...container.querySelectorAll('[id^="sec-"]')].map((el) => el.id)).toEqual(['sec-flags', 'sec-score'])
    SECTION_ORDER.forEach((id) => expect(slotOf(id).id).toBe(''))
  })

  it('AC-7909.1: 묶음이 제 닻 id를 그리면 화면에 닻 id가 한 번씩만 있다', () => {
    const own = Object.fromEntries(
      SECTION_ORDER.map((id, i) => [id, <section key={id} id={`sec-${ANCHORS[i]}`}>{`칸 ${id}`}</section>]),
    ) as CandidateFrameProps['sections']
    const { container } = render(<CandidateFrame {...props({ sections: own })} />)
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id)
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([])
    expect(ids.filter((id) => id.startsWith('sec-'))).toEqual(['sec-flags', 'sec-score', ...ANCHORS.map((a) => `sec-${a}`)])
  })

  it('AC-7909.1: 왼쪽 목차는 위험 신호(수) · 종합 점수(점수) · 묶음 열셋(경쟁 의원 수 · 둘레 다른 과 의원 수) 차례로 그 닻을 가리킨다', () => {
    render(<CandidateFrame {...props()} />)
    const total = expectedScore(makeCandidate(), LISTINGS).total
    expect(tocLinks().map((a) => a.textContent)).toEqual([
      '위험 신호3',
      `종합 점수${total}`,
      '사는 사람',
      '소득·쓸 힘',
      '정형외과 수요',
      '경쟁 의원2',
      '둘레 다른 과 의원0', // 한의원은 둘레로 보기여도 경쟁 묶음의 따로 한 줄이라 세지 않는다
      ...SECTION_TITLES.slice(5),
    ])
    expect(tocLinks().map((a) => a.getAttribute('href'))).toEqual(['#sec-flags', '#sec-score', ...ANCHORS.map((a) => `#sec-${a}`)])
  })

  it('AC-7909.1: 목차를 누르면 주소를 바꾸지 않고 그 칸 감싸개로 건너뛰어 초점을 옮긴다', () => {
    render(<CandidateFrame {...props()} />)
    const scroll = vi.mocked(Element.prototype.scrollIntoView)
    const link = within(screen.getByRole('navigation', { name: '묶음 목차' })).getByRole('link', { name: '진료 시간 빈틈' })
    expect(fireEvent.click(link)).toBe(false) // 기본 동작(주소 바꾸기)을 막음
    expect(scroll).toHaveBeenCalledTimes(1)
    expect(scroll.mock.contexts[0]).toBe(slotOf('hours'))
    expect(scroll).toHaveBeenCalledWith({ block: 'start' })
    expect(document.activeElement).toBe(slotOf('hours'))
  })

  it('AC-7909.1: 받지 않은 칸은 본문과 목차에서 함께 빠진다', () => {
    const { container } = render(<CandidateFrame {...props({ sections: slots(['people', 'rivals', 'others', 'future']) })} />)
    expect(bodyOrder(container)).toEqual(['sec-flags', 'sec-score', '칸 people', '칸 rivals', '칸 others', '칸 future'])
    expect(tocLinks()).toHaveLength(6)
  })

  it('AC-7909.1: 머리 — 후보 표시·진행 상태·이름·주소·후보 매물 한 줄, 단추 셋은 그 화면으로 가는 콜백', () => {
    const onGo = vi.fn()
    render(<CandidateFrame {...props({ onGo })} />)
    expect(screen.getByRole('heading', { level: 2, name: '예시빌딩 3층' })).toBeTruthy()
    expect(screen.getByText('후보 A')).toBeTruthy()
    expect(screen.getByText('보는 중')).toBeTruthy()
    expect(screen.getByText('예시구 가람동 123-4 · 전용 52평 · 보증금 1억 원 / 월세 520만 원')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '한 장 보고서' }))
    fireEvent.click(screen.getByRole('button', { name: '개원 준비' }))
    fireEvent.click(screen.getByRole('button', { name: '매물 보기' }))
    expect(onGo.mock.calls).toEqual([['report'], ['prep'], ['listings']])
  })

  it('AC-7909.1: 머리의 매물 보증금·월세는 만 원 칸 금액 글(manText) — 100만 원 아래도 `78만 원`, 0은 `없음`', () => {
    render(<CandidateFrame {...props({ listings: [makeListing({ deposit: 0, rent: 780_000 })] })} />)
    expect(screen.getByText('예시구 가람동 123-4 · 전용 52평 · 보증금 없음 / 월세 78만 원')).toBeTruthy()
  })

  it('AC-7909.1: 내려놓은 후보는 진행 상태 자리에 `내려놓음`', () => {
    render(<CandidateFrame {...props({ candidate: makeCandidate({ status: 'dropped' }) })} />)
    expect(screen.getByText('내려놓음')).toBeTruthy()
  })

  it('AC-7909.1: 지도는 칸으로 받아 살필 범위 아래에 놓고 범례를 붙인다', () => {
    render(<CandidateFrame {...props({ map: <div data-testid="map-slot" /> })} />)
    const score = document.querySelector('#sec-score') as HTMLElement
    expect(within(score).getByTestId('map-slot')).toBeTruthy()
    expect(
      within(score).getByText('파란 표시 = 후보 · 주황 점 = 정형외과·통증·재활 · 회색 점 = 한의원 · 검은 네모 = 역 · 흐린 점 = 범위 밖'),
    ).toBeTruthy()
  })

  it('AC-7909.1: 범례 글을 받으면(고른 과목을 따르는 글) 그 글을 그린다', () => {
    const mapLegend = '파란 표시 = 후보 · 주황 점 = 경쟁 의원 · 연보라 작은 점 = 둘레 다른 과 의원 · 검은 네모 = 역 · 흐린 점 = 범위 밖'
    render(<CandidateFrame {...props({ map: <div data-testid="map-slot" />, mapLegend })} />)
    const score = document.querySelector('#sec-score') as HTMLElement
    expect(within(score).getByText(mapLegend)).toBeTruthy()
    expect(within(score).queryByText(/정형외과·통증·재활/)).toBeNull()
  })
})

describe('AC-7921.2: 경쟁 수·위험 신호·점수는 과목 고르기를 따른다', () => {
  const NEURO_SURGERY = makeRival({ name: '예시나래신경외과', depts: ['ns'], distM: 600, openedYear: 2024 })
  const INTERNAL = makeRival({ name: '예시새솔내과', depts: ['im'], distM: 300 })
  const withClinics = (...more: ReturnType<typeof makeRival>[]) =>
    makeCandidate({ snapshot: makeSnapshot({ rivals: ok([...RIVALS, ...more], 'hosp-list', '2026-11-15') }) })
  const rule = (rival: DeptRule['rival'], hide: DeptRule['hide'] = []): DeptRule => ({ v: 1, rival, hide })
  const tocText = (name: RegExp) => tocLinks().find((a) => name.test(a.textContent ?? ''))?.textContent
  const flagTitles = () => flagItems().map((li) => li.querySelector('b')?.textContent)

  it('AC-7921.2: 목차 경쟁 의원 수는 대표 과목이 경쟁 과목인 범위 안 의원(신경외과 포함), 둘레 다른 과 의원 수는 둘레로 보기 과목(한의원 뺌)', () => {
    render(<CandidateFrame {...props({ candidate: withClinics(NEURO_SURGERY, INTERNAL) })} />)
    expect(tocText(/^경쟁 의원/)).toBe('경쟁 의원3')
    expect(tocText(/^둘레 다른 과 의원/)).toBe('둘레 다른 과 의원1')
  })

  it('AC-7921.2: 과목 고르기를 바꾸면 다시 받지 않고 경쟁 수·위험 신호·점수를 바로 다시 센다', () => {
    const onRefresh = vi.fn()
    const candidate = withClinics(INTERNAL)
    const { rerender } = render(<CandidateFrame {...props({ candidate, onRefresh })} />)
    expect(flagTitles()).toContain('30m 안에 정형외과가 있어요')
    const korean = rule(['ortho', 'ns', 'pain', 'rehab', 'korean'])
    rerender(<CandidateFrame {...props({ candidate, onRefresh, deptRule: korean })} />)
    expect(tocText(/^경쟁 의원/)).toBe('경쟁 의원3')
    expect(tocText(/^둘레 다른 과 의원/)).toBe('둘레 다른 과 의원1')
    expect(flagTitles()).toContain('30m 안에 한의원이 있어요') // 가장 가까운 경쟁 의원(10m)
    expect(screen.getByTestId('score-total').textContent).toBe(String(expectedScore(candidate, LISTINGS, DEFAULT_SCORE_RULE, korean).total))
    const internal = rule(['im'], ['korean'])
    rerender(<CandidateFrame {...props({ candidate, onRefresh, deptRule: internal })} />)
    expect(tocText(/^경쟁 의원/)).toBe('경쟁 의원1')
    expect(tocText(/^둘레 다른 과 의원/)).toBe('둘레 다른 과 의원2') // 정형외과·통증이 둘레로 보기
    expect(flagTitles()).not.toContain('30m 안에 정형외과가 있어요')
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('AC-7921.2: 경쟁 과목을 하나도 안 고르면 목차에 경쟁 수가 없고, 점수의 경쟁은 `과목 없음`(남은 무게로 매김)', () => {
    const none = rule([])
    render(<CandidateFrame {...props({ deptRule: none })} />)
    expect(tocText(/^경쟁 의원/)).toBe('경쟁 의원')
    expect(flagTitles()).not.toContain('30m 안에 정형외과가 있어요')
    const rows = screen.getAllByTestId('score-row')
    expect(rows[1]!.querySelector('[data-part="points"]')?.textContent).toBe('과목 없음')
    expect(rows[0]!.querySelector('[data-part="points"]')?.textContent).toMatch(/ \/ 40$/) // 30 × 100 ÷ 75
    expect(screen.getByTestId('score-total').textContent).toBe(String(expectedScore(makeCandidate(), LISTINGS, DEFAULT_SCORE_RULE, none).total))
  })
})

describe('AC-7911.1·AC-7911.2: 종합 점수', () => {
  it('AC-7911.1: 종합 점수와 항목 다섯(받은 무게 그대로, 점수/만점)을 그린다', () => {
    render(<CandidateFrame {...props()} />)
    const result = expectedScore(makeCandidate(), LISTINGS)
    expect(screen.getByTestId('score-total').textContent).toBe(String(result.total))
    const rows = screen.getAllByTestId('score-row')
    expect(rows.map((r) => r.querySelector('[data-part="name"]')?.textContent)).toEqual(['사는 사람·수요', '경쟁', '교통·흐름', '자리', '비용'])
    const max = [30, 25, 20, 15, 10]
    rows.forEach((row, i) => {
      expect(row.querySelector('[data-part="points"]')?.textContent).toBe(`${result.groups[i]!.points} / ${max[i]}`)
    })
  })

  it('AC-7911.1: 무게(설정)가 바뀌면 다시 받지 않고 점수를 바로 다시 센다', () => {
    const onRefresh = vi.fn()
    const { rerender } = render(<CandidateFrame {...props({ onRefresh })} />)
    const rule: ScoreRule = { ...DEFAULT_SCORE_RULE, weights: { people: 100, rivals: 0, transit: 0, site: 0, cost: 0 } }
    rerender(<CandidateFrame {...props({ onRefresh, rule })} />)
    expect(screen.getByTestId('score-total').textContent).toBe(String(expectedScore(makeCandidate(), LISTINGS, rule).total))
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('AC-7911.2: 후보 매물이 없으면 비용 항목은 `매물 없음`이고 남은 무게로 만점을 다시 나눈다', () => {
    render(<CandidateFrame {...props({ listings: [OTHER_LISTING] })} />)
    const rows = screen.getAllByTestId('score-row')
    expect(rows[4]!.querySelector('[data-part="points"]')?.textContent).toBe('매물 없음')
    expect(rows[0]!.querySelector('[data-part="points"]')?.textContent).toMatch(/ \/ 33$/) // 30 × 100 ÷ 90
  })

  it('AC-7911.2: 값 있는 항목이 하나도 없으면 `점수 없음`, 항목마다 `값 없음`', () => {
    const candidate = makeCandidate({ snapshot: null, floorLabel: '', signVisible: null, violation: null })
    render(<CandidateFrame {...props({ candidate, listings: [] })} />)
    expect(screen.getByTestId('score-total').textContent).toBe('점수 없음')
    const points = screen.getAllByTestId('score-row').map((r) => r.querySelector('[data-part="points"]')?.textContent)
    expect(points).toEqual(['값 없음', '값 없음', '값 없음', '값 없음', '매물 없음'])
    expect(within(screen.getByRole('navigation', { name: '묶음 목차' })).getByRole('link', { name: '종합 점수' })).toBeTruthy()
  })

  it('AC-7911.1: 매기는 법은 근거와 출처의 점수 줄로 간다', () => {
    render(<CandidateFrame {...props()} />)
    expect(screen.getByRole('link', { name: '매기는 법' }).getAttribute('href')).toBe('/location?tab=sources#src-score')
  })
})

describe('AC-7911.3: 위험 신호 맨 위', () => {
  it('AC-7911.3: design.md 9절 차례대로 맞는 것만 — 위반 건축물을 안 골랐으면 `확인 필요`', () => {
    render(<CandidateFrame {...props()} />)
    expect(screen.getByRole('heading', { level: 3, name: '위험 신호 3' })).toBeTruthy()
    const items = flagItems()
    expect(items.map((li) => li.querySelector('b')?.textContent)).toEqual([
      '위반 건축물인지',
      '30m 안에 정형외과가 있어요',
      '이 자리(3층)에서 2025년 3월에 의원이 문을 닫았어요',
    ])
    expect(items.map((li) => li.dataset.level)).toEqual(['check', 'red', 'red'])
    expect(within(items[0]!).getByText('확인 필요')).toBeTruthy()
    expect(within(items[1]!).queryByText('확인 필요')).toBeNull()
    expect(
      within(items[0]!).getByText(
        '건축물대장을 떼어 확인하세요. 위반 건축물이면 의원 개설 신고가 막힐 수 있어요. 확인한 뒤 건물 서류에서 골라요(아직 안 고름).',
      ),
    ).toBeTruthy()
  })

  it("AC-7911.3: '있음'이면 빨간 깃발, '없음'이면 위반 건축물 신호가 없다", () => {
    const { rerender } = render(<CandidateFrame {...props({ candidate: makeCandidate({ violation: 'yes' }) })} />)
    const first = flagItems()[0]!
    expect(first.querySelector('b')?.textContent).toBe('위반 건축물이라고 골랐어요')
    expect(first.dataset.level).toBe('red')
    expect(within(first).queryByText('확인 필요')).toBeNull()
    rerender(<CandidateFrame {...props({ candidate: makeCandidate({ violation: 'no' }) })} />)
    expect(flagItems().map((li) => li.querySelector('b')?.textContent)).not.toContain('위반 건축물인지')
    expect(flagItems()).toHaveLength(2)
  })

  it('AC-7911.3: 맞는 신호가 없으면 `찾은 위험 신호가 없어요.`', () => {
    const snapshot = makeSnapshot({
      rivals: { ok: true, v: [], src: 'hosp-list', asOf: '2026-11-15' },
      history: { ok: true, v: [], src: 'clinic-license', asOf: '2026-11-13' },
    })
    render(<CandidateFrame {...props({ candidate: makeCandidate({ snapshot, violation: 'no' }) })} />)
    expect(screen.getByText('찾은 위험 신호가 없어요.')).toBeTruthy()
    expect(screen.queryByRole('list', { name: '위험 신호 목록' })).toBeNull()
    expect(within(screen.getByRole('navigation', { name: '묶음 목차' })).getByRole('link', { name: '위험 신호' })).toBeTruthy()
  })

  it('AC-7911.3: 근거 — 법 id면 [법 근거](근거와 출처의 법 줄), 출처 id면 출처 줄(그날 값 기준 날짜)', () => {
    render(<CandidateFrame {...props()} />)
    const [violation, same] = flagItems()
    expect(within(violation!).getByRole('link', { name: '법 근거' }).getAttribute('href')).toBe('/location?tab=sources#law-violation')
    const src = within(same!).getByRole('link')
    expect(src.textContent).toBe('건강보험심사평가원 병원정보서비스 · 기준 2026년 11월 15일')
    expect(src.getAttribute('href')).toBe('/location?tab=sources#src-hosp-list')
  })

  it('AC-7911.3: 출처 줄 여는 콜백을 주면 누를 때 그 출처 id로 부른다', () => {
    const onOpenSource = vi.fn()
    render(<CandidateFrame {...props({ onOpenSource })} />)
    fireEvent.click(within(flagItems()[1]!).getByRole('link'))
    expect(onOpenSource).toHaveBeenCalledWith('hosp-list')
  })
})

describe('AC-7908.3: 기준 날짜 · [오늘 값으로 다시 받기] · 살필 범위', () => {
  it('AC-7908.3: 굳혀 둔 날(한국 날짜)과 저장한 날인지 다시 받은 날인지 보인다', () => {
    const { rerender } = render(
      <CandidateFrame {...props({ candidate: makeCandidate({ createdAt: '2026-11-14T16:00:00.000Z' }) })} />, // 한국 11월 15일 01시
    )
    expect(screen.getByText('2026년 11월 15일에 받은 값으로 굳혀 두었어요(저장한 날)')).toBeTruthy()
    rerender(<CandidateFrame {...props({ candidate: makeCandidate({ snapshotAt: '2026-11-20T03:00:00.000Z' }) })} />)
    expect(screen.getByText('2026년 11월 20일에 받은 값으로 굳혀 두었어요(다시 받은 날)')).toBeTruthy()
    rerender(<CandidateFrame {...props({ candidate: makeCandidate({ snapshot: null }) })} />)
    expect(screen.getByText('아직 받은 값이 없어요.')).toBeTruthy()
  })

  it('AC-7908.3: [오늘 값으로 다시 받기]를 누르면 그 후보 id로 다시 받기 콜백을 부른다', () => {
    const onRefresh = vi.fn()
    render(<CandidateFrame {...props({ onRefresh })} />)
    fireEvent.click(refreshButton())
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(onRefresh).toHaveBeenCalledWith(CAND_ID)
  })

  it('AC-7908.3: 살필 범위는 일곱 값(300m~3km)이고 지금 범위에 놓여 있다', () => {
    render(<CandidateFrame {...props({ candidate: makeCandidate({ radiusM: 1500 }) })} />)
    const input = slider() as HTMLInputElement
    expect([input.min, input.max, input.step, input.value]).toEqual(['0', '6', '1', '4'])
    expect(input.getAttribute('aria-valuetext')).toBe('1.5km')
    const labels = ['0', '1', '2', '3', '4', '5', '6'].map((v) => {
      fireEvent.change(input, { target: { value: v } })
      return input.getAttribute('aria-valuetext')
    })
    expect(labels).toEqual(['300m', '500m', '700m', '1km', '1.5km', '2km', '3km'])
  })

  it('AC-7908.3: 범위를 바꾸면 글은 바로 바뀌고, 멈춘 뒤 한 번만 범위 콜백(후보 id · m)을 부른다', () => {
    vi.useFakeTimers()
    const onRadius = vi.fn()
    render(<CandidateFrame {...props({ onRadius })} />)
    fireEvent.change(slider(), { target: { value: '4' } })
    fireEvent.change(slider(), { target: { value: '5' } })
    expect(within(document.querySelector('#sec-score') as HTMLElement).getByText('2km')).toBeTruthy()
    act(() => vi.advanceTimersByTime(RADIUS_DELAY_MS - 1))
    expect(onRadius).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onRadius.mock.calls).toEqual([[CAND_ID, 2000]])
  })

  it('AC-7908.3: 지금 범위로 되돌리면 부르지 않는다', () => {
    vi.useFakeTimers()
    const onRadius = vi.fn()
    render(<CandidateFrame {...props({ onRadius })} />)
    fireEvent.change(slider(), { target: { value: '5' } })
    fireEvent.change(slider(), { target: { value: '3' } })
    act(() => vi.advanceTimersByTime(RADIUS_DELAY_MS))
    expect(onRadius).not.toHaveBeenCalled()
  })

  it('AC-7908.3: 기다리는 동안 화면이 사라지거나 다른 후보로 바뀌면 그 후보 범위를 바로 넘긴다', () => {
    vi.useFakeTimers()
    const onRadius = vi.fn()
    const first = render(<CandidateFrame {...props({ onRadius })} />)
    fireEvent.change(slider(), { target: { value: '0' } })
    first.unmount()
    expect(onRadius.mock.calls).toEqual([[CAND_ID, 300]])

    const second = render(<CandidateFrame {...props({ onRadius })} />)
    fireEvent.change(slider(), { target: { value: '6' } })
    second.rerender(<CandidateFrame {...props({ onRadius, candidate: makeCandidate({ id: OTHER_ID, radiusM: 500 }) })} />)
    expect(onRadius.mock.calls).toEqual([
      [CAND_ID, 300],
      [CAND_ID, 3000],
    ])
    expect(slider().getAttribute('aria-valuetext')).toBe('500m')
    act(() => vi.advanceTimersByTime(RADIUS_DELAY_MS))
    expect(onRadius).toHaveBeenCalledTimes(2)
  })

  it('AC-7908.3: 다시 받은 뒤 범위가 바뀌어 오면 그 값으로 놓는다', () => {
    const { rerender } = render(<CandidateFrame {...props()} />)
    rerender(<CandidateFrame {...props({ candidate: makeCandidate({ radiusM: 2000 }) })} />)
    expect(slider().getAttribute('aria-valuetext')).toBe('2km')
  })

  it('AC-7908.3: 받는 중이면 `자료 {n}/{m}`을 보이고 다시 받기·범위를 막는다', () => {
    const onRefresh = vi.fn()
    render(<CandidateFrame {...props({ onRefresh, progress: { done: 3, total: 22 } })} />)
    expect(screen.getByText('자료 3/22')).toBeTruthy()
    expect((refreshButton() as HTMLButtonElement).disabled).toBe(true)
    expect((slider() as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(refreshButton())
    expect(onRefresh).not.toHaveBeenCalled()
  })
})

describe('AC-7908.4: 카카오 자료는 열 때마다 새로', () => {
  it('AC-7908.4: 후보를 열 때마다 한 번 여는 콜백을 부른다(같은 후보를 다시 그릴 때는 부르지 않음)', () => {
    const onOpen = vi.fn()
    const view = render(<CandidateFrame {...props({ onOpen })} />)
    expect(onOpen.mock.calls).toEqual([[CAND_ID]])
    view.rerender(<CandidateFrame {...props({ onOpen, candidate: makeCandidate({ snapshotAt: '2026-11-20T03:00:00.000Z' }) })} />)
    expect(onOpen).toHaveBeenCalledTimes(1)
    view.rerender(<CandidateFrame {...props({ onOpen, candidate: makeCandidate({ id: OTHER_ID }) })} />)
    expect(onOpen.mock.calls).toEqual([[CAND_ID], [OTHER_ID]])
    view.unmount()
    render(<CandidateFrame {...props({ onOpen })} />)
    expect(onOpen.mock.calls).toEqual([[CAND_ID], [OTHER_ID], [CAND_ID]])
  })

  it('AC-7908.4: 카카오 주소 글은 볼 때만 보이고, 다시 받기·범위 콜백에는 후보 id와 범위만 넘긴다', () => {
    vi.useFakeTimers()
    const onRefresh = vi.fn()
    const onRadius = vi.fn()
    render(<CandidateFrame {...props({ onRefresh, onRadius, kakaoAddress: '예시시 예시구 가람로 12' })} />)
    expect(screen.getByText('예시시 예시구 가람로 12 · 전용 52평 · 보증금 1억 원 / 월세 520만 원')).toBeTruthy()
    expect(screen.queryByText(/예시구 가람동 123-4/)).toBeNull()
    fireEvent.click(refreshButton())
    fireEvent.change(slider(), { target: { value: '2' } })
    act(() => vi.advanceTimersByTime(RADIUS_DELAY_MS))
    expect(onRefresh.mock.calls).toEqual([[CAND_ID]])
    expect(onRadius.mock.calls).toEqual([[CAND_ID, 700]])
    expect(JSON.stringify([onRefresh.mock.calls, onRadius.mock.calls])).not.toContain('가람로')
  })
})

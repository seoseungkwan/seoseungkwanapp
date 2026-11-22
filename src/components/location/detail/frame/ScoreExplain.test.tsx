// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_DEPT_RULE } from '@/lib/location/depts'
import { explainCandidate, listingAverages, type ExplainRow } from '@/lib/location/explain'
import { scoreFactsOf } from '@/lib/location/facts'
import { DEFAULT_SCORE_RULE, type ScoreRule, type SubId } from '@/lib/location/score'
import type { Candidate, Listing, SggAvg } from '@/types/location'
import { CandidateFrame, type CandidateFrameProps } from './CandidateFrame'
import { OTHER_LISTING, SGG_AVG, TODAY, makeCandidate, makeListing } from './frame.test.data'

// 종합 점수 오른쪽 점수 풀이(TASK-68 · AC-7920.3, design.md 19절, 시안 ?s=candidate .why).
// 셈은 lib/location/explain.ts explainCandidate 한 곳 — 틀은 받은 줄을 requirements '화면 글 기본값' 점수 풀이 모양으로 그리기만 한다

const LISTINGS: Listing[] = [makeListing(), OTHER_LISTING]

function props(over: Partial<CandidateFrameProps> = {}): CandidateFrameProps {
  return {
    candidate: makeCandidate(),
    listings: LISTINGS,
    rule: DEFAULT_SCORE_RULE,
    deptRule: DEFAULT_DEPT_RULE,
    homeEswt: 50000,
    today: TODAY,
    sections: {},
    onOpen: vi.fn(),
    onRefresh: vi.fn(),
    onRadius: vi.fn(),
    onGo: vi.fn(),
    ...over,
  }
}

const expected = (rule: ScoreRule = DEFAULT_SCORE_RULE, sgg: SggAvg | null = SGG_AVG, candidate: Candidate = makeCandidate()) =>
  explainCandidate(scoreFactsOf({ candidate, listings: LISTINGS, homeEswt: 50000, today: TODAY, deptRule: DEFAULT_DEPT_RULE }), rule, {
    sgg,
    listings: listingAverages(LISTINGS),
  })

/** 한 줄이 보여야 할 글: 칩 · `{이름} {값 글} · {항목 이름}` · `세부 {s}점 · {만점 기준 글}` · (있을 때만) `견줄 값 {글}` */
const rowLines = (r: ExplainRow) => [
  r.pointsText,
  `${r.label} ${r.valueText} · ${r.groupLabel}`,
  `세부 ${r.sub}점 · ${r.fullText}`,
  ...(r.compareText === null ? [] : [`견줄 값 ${r.compareText}`]),
]

const panel = () => screen.getByRole('group', { name: '점수 풀이' })
const side = (name: '점수를 올린 것' | '점수를 내린 것') => within(panel()).queryByRole('list', { name })
const shownLines = (list: HTMLElement | null) =>
  list === null ? [] : within(list).getAllByRole('listitem').map((li) => [...li.querySelectorAll('[data-line]')].map((el) => el.textContent))

/** 그 항목만 무게 100, 세부 항목은 고른 것만 무게를 남긴 설정 */
function only(group: keyof ScoreRule['weights'], subs?: readonly SubId[]): ScoreRule {
  const weights = { people: 0, rivals: 0, transit: 0, site: 0, cost: 0, [group]: 100 }
  if (!subs) return { ...DEFAULT_SCORE_RULE, weights }
  const items = Object.fromEntries(
    Object.entries(DEFAULT_SCORE_RULE.items).map(([id, item]) => [id, subs.includes(id as SubId) ? item : { ...item, w: 0 }]),
  ) as ScoreRule['items']
  return { ...DEFAULT_SCORE_RULE, weights, items }
}

afterEach(cleanup)

describe('AC-7920.3: 점수 풀이 — 종합 점수 오른쪽', () => {
  it('AC-7920.3: 머리 `점수 풀이` + 곁글, 두 무리(올린 것·내린 것)와 곁글, 아래 도움말이 있다', () => {
    render(<CandidateFrame {...props()} />)
    const box = panel()
    expect(within(box).getByRole('heading', { level: 4 }).textContent).toBe('점수 풀이 세부 항목 가운데 많이 올린 것 3 · 많이 내린 것 3')
    expect(within(box).getByText('점수를 올린 것').parentElement?.textContent).toBe('점수를 올린 것 종합 점수에 보탠 점수')
    expect(within(box).getByText('점수를 내린 것').parentElement?.textContent).toBe('점수를 내린 것 만점이었다면 더 받았을 점수')
    expect(
      within(box).getByText(
        '세부 점수 50점 이상은 올린 것, 아래는 내린 것으로 나눠요. 항목마다 버림해 더해서 줄의 점수를 더하면 종합 점수와 조금 다를 수 있어요. 견줄 값은 지금 자료로 셀 수 있는 것만 붙여요.',
      ),
    ).toBeTruthy()
  })

  it('AC-7920.3: 종합 점수 칸 안에서 큰 점수 → 점수 풀이 → 살필 범위 차례다', () => {
    render(<CandidateFrame {...props()} />)
    const score = document.querySelector('#sec-score') as HTMLElement
    const big = within(score).getByTestId('score-total')
    const range = within(score).getByRole('slider', { name: '살필 범위' })
    expect(score.contains(panel())).toBe(true)
    expect(big.compareDocumentPosition(panel()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(panel().compareDocumentPosition(range) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-7920.3: 올린 것·내린 것은 explainCandidate가 고른 셋씩 그 차례로, 줄마다 칩 · 이름 값 · 항목 · 세부 점수와 만점 기준 · 견줄 값', () => {
    render(<CandidateFrame {...props()} />)
    const { up, down } = expected()
    expect(up).toHaveLength(3)
    expect(down).toHaveLength(3)
    expect(shownLines(side('점수를 올린 것'))).toEqual(up.map(rowLines))
    expect(shownLines(side('점수를 내린 것'))).toEqual(down.map(rowLines))
    // 글 모양(지어낸 후보 A: 역 450m, 시군구 행정동 가운데 평균 620m)
    const first = shownLines(side('점수를 올린 것'))[0]!
    expect(first[0]).toBe('+6점')
    expect(first[1]).toMatch(/ 450m · 교통·흐름$/)
    expect(first[2]).toBe('세부 80점 · 200m 이하면 100점 · 1,500m 이상이면 0점')
    expect(first[3]).toBe('견줄 값 예시구 행정동 가운데 평균 620m')
    expect(shownLines(side('점수를 내린 것'))[0]![0]).toMatch(/^−\d+점$/)
  })

  it('AC-7920.3: 올린 것은 초록(positive), 내린 것은 빨강(negative) 점수 글이다', () => {
    render(<CandidateFrame {...props()} />)
    const chip = (name: '점수를 올린 것' | '점수를 내린 것') =>
      within(side(name)!)
        .getAllByRole('listitem')
        .map((li) => li.querySelector('[data-line="points"]')!.className)
    expect(chip('점수를 올린 것').every((c) => c.includes('text-positive'))).toBe(true)
    expect(chip('점수를 내린 것').every((c) => c.includes('text-negative'))).toBe(true)
  })

  it('AC-7920.3: 견줄 값은 셀 수 있는 세부 항목에만 붙는다 — 받은 견줄 값(sggAvg)을 쓰고, 주지 않으면 그날 값의 sggAvg', () => {
    const { rerender } = render(<CandidateFrame {...props({ sggAvg: { ...SGG_AVG, stationM: 900 } })} />)
    expect(shownLines(side('점수를 올린 것'))[0]![3]).toBe('견줄 값 예시구 행정동 가운데 평균 900m')
    rerender(<CandidateFrame {...props({ sggAvg: null })} />)
    const { up, down } = expected(DEFAULT_SCORE_RULE, null)
    expect(shownLines(side('점수를 올린 것'))).toEqual(up.map(rowLines))
    expect(shownLines(side('점수를 내린 것'))).toEqual(down.map(rowLines))
    expect(within(panel()).queryByText(/^견줄 값/)).toBeNull()
    rerender(<CandidateFrame {...props()} />)
    expect(shownLines(side('점수를 올린 것'))[0]![3]).toBe('견줄 값 예시구 행정동 가운데 평균 620m')
  })

  it('AC-7920.3: 무게(설정)를 바꾸면 다시 받지 않고 점수 풀이를 바로 다시 고른다', () => {
    const onRefresh = vi.fn()
    const { rerender } = render(<CandidateFrame {...props({ onRefresh })} />)
    const rule = only('people')
    rerender(<CandidateFrame {...props({ onRefresh, rule })} />)
    const { up, down } = expected(rule)
    expect(shownLines(side('점수를 올린 것'))).toEqual(up.map(rowLines))
    expect(shownLines(side('점수를 내린 것'))).toEqual(down.map(rowLines))
    expect(shownLines(side('점수를 올린 것')).every((lines) => lines[1]!.endsWith(' · 사는 사람·수요'))).toBe(true)
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('AC-7920.3: 한쪽에 줄이 없으면 그 무리 자리에 안내 한 줄(시안 글)', () => {
    const { rerender } = render(<CandidateFrame {...props({ rule: only('transit') })} />)
    expect(expected(only('transit')).down).toEqual([])
    expect(side('점수를 내린 것')).toBeNull()
    expect(within(panel()).getByText('모든 세부 항목이 50점을 넘었어요.')).toBeTruthy()
    const lowOnly = only('rivals', ['c-perRival'])
    expect(expected(lowOnly).up).toEqual([])
    rerender(<CandidateFrame {...props({ rule: lowOnly })} />)
    expect(side('점수를 올린 것')).toBeNull()
    expect(within(panel()).getByText('세부 점수가 50점을 넘은 항목이 없어요.')).toBeTruthy()
    expect(shownLines(side('점수를 내린 것'))).toEqual(expected(lowOnly).down.map(rowLines))
  })

  it('AC-7920.3: 값 있는 세부 항목이 하나도 없으면(점수 없음) 점수 풀이를 그리지 않는다', () => {
    const candidate = makeCandidate({ snapshot: null, floorLabel: '', signVisible: null, violation: null })
    render(<CandidateFrame {...props({ candidate, listings: [] })} />)
    expect(screen.getByTestId('score-total').textContent).toBe('점수 없음')
    expect(screen.queryByRole('group', { name: '점수 풀이' })).toBeNull()
  })
})

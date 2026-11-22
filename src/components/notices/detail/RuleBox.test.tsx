// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorInfo } from '@/lib/errors'
import { checkRules } from '@/lib/storage/notices'
import { readNoticeRules, seeRuleChanges, setRuleReverted } from '@/lib/storage/ruleChanges'
import type { ErrorCode } from '@/types/errors'
import type { RuleHit } from '@/types/notices'
import type { NoticeRuleView, RuleCheckView } from '@/types/ruleAuto'
import { RuleBox } from './RuleBox'

// 글 화면 규칙 상자 (specs/rule-auto TASK-9, REQ-7814, design 11절, 승인 시안 docs/mockups/rule-auto ?v=detail).
// 저장소 함수(읽기·되돌리기·본 것·확인)만 가짜로 바꾼다. 글자 도구(lib/notices/ruleView·view)와 오류 안내(errors.ts)는 진짜를 쓴다.
// 고시·규칙 번호·제목·숫자는 시안의 지어낸 예시다(실제 규칙이 아니다)
vi.mock('@/lib/storage/ruleChanges', () => ({ readNoticeRules: vi.fn(), setRuleReverted: vi.fn(), seeRuleChanges: vi.fn() }))
vi.mock('@/lib/storage/notices', () => ({ checkRules: vi.fn() }))

const read = vi.mocked(readNoticeRules)
const revert = vi.mocked(setRuleReverted)
const see = vi.mocked(seeRuleChanges)
const rulesCheck = vi.mocked(checkRules)

const ID = '3f2c9a10-5b7d-4e21-9c8a-1d2e3f4a5b6c'
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const ES_OLD = '체외충격파 같은 부위 1년 5회'
const ES_NEW = '체외충격파 같은 부위 1년 6회'
const MN_TITLE = '도수치료 같은 날 열치료 함께 청구'

const HITS: RuleHit[] = [
  { id: 'LA-31', title: '요추 경막외 신경차단술 산정' },
  { id: 'HY-12', title: '히알루론산 기준 밖 약값 U항' },
  { id: 'ES-04', title: ES_OLD },
  { id: 'MN-03', title: MN_TITLE },
  { id: 'ES-01', title: '체외충격파 급여 입력' },
  { id: 'PH-02', title: '물리치료 하루 산정 개수' },
  { id: 'MN-01', title: '도수치료 차트 기록' },
  { id: 'MN-05', title: '도수치료 1회 시간' },
  { id: 'ES-07', title: '체외충격파 부위 기록' },
]

const SAME_WHY = '관련 있지만 규칙이 보는 숫자·코드는 그대로예요.'

function row(over: Partial<RuleCheckView> & Pick<RuleCheckView, 'changeId' | 'ruleId' | 'verdict' | 'title'>): RuleCheckView {
  return { why: '', before: '', after: '', from: null, seen: false, reverted: false, revertedAt: null, ...over }
}

const C_ES = row({
  changeId: uuid(1),
  ruleId: 'ES-04',
  verdict: 'change',
  title: ES_NEW,
  before: '같은 부위는 1년에 5회까지 인정해요',
  after: '같은 부위는 1년에 6회까지 인정해요',
  why: '고시가 체외충격파 인정 횟수를 같은 부위 1년 6회로 늘렸어요.',
  from: '2026-12-01',
})
const C_MN = row({
  changeId: uuid(2),
  ruleId: 'MN-03',
  verdict: 'change',
  title: MN_TITLE,
  before: '같은 날 표층열치료와 함께 청구하면 알려요',
  after: '같은 날 표층열치료·심층열치료와 함께 청구하면 알려요',
  why: '고시가 도수치료와 함께 청구할 수 없는 열치료에 심층열치료를 더했어요.',
  from: '2026-11-20',
})
const H_LA = row({ changeId: uuid(3), ruleId: 'LA-31', verdict: 'human', title: HITS[0].title, why: '새 수가 코드가 생겨 지금 규칙표에 없는 코드를 봐야 해요.' })
const H_HY = row({ changeId: uuid(4), ruleId: 'HY-12', verdict: 'human', title: HITS[1].title, why: '이 규칙은 앱 안 계산으로 돌아 저절로 바꿀 수 없어요.' })
const S_ES1 = row({ changeId: uuid(5), ruleId: 'ES-01', verdict: 'none', title: HITS[4].title, why: '이 고시와 상관없어요.' })
const S_PH = row({ changeId: uuid(6), ruleId: 'PH-02', verdict: 'same', title: HITS[5].title, why: SAME_WHY })
const S_MN1 = row({ changeId: uuid(7), ruleId: 'MN-01', verdict: 'same', title: HITS[6].title, why: SAME_WHY })
const PENDING = [HITS[7], HITS[8]]

const HUMAN_TITLE = '이 글이 점검 규칙 2개를 바꿔요 — 확인 필요'
const HUMAN_BODY = '저절로 고칠 수 없는 내용이에요. 아래 규칙이 새 기준과 맞는지 설정 → 점검 규칙에서 확인해 주세요.'
const CHANGE_TITLE = '이 글로 점검 규칙 2개가 저절로 바뀌었어요'
const CHANGE_BODY = 'AI가 새 고시를 읽고 규칙을 고쳤어요. 틀려 보이면 ‘되돌리기’를 누르세요. 우리 병원만 전 규칙으로 돌아가요.'
const CHANGE_NOTE = 'AI가 고친 규칙이라 틀릴 수 있어요. 바뀐 내용은 고시 원문과 꼭 맞춰 보세요.'
const PENDING_TITLE = 'AI가 점검 규칙 2개를 살펴보는 중이에요'
const PENDING_BODY = '이 글이 근거를 바꾸는 규칙이에요. 바꿀지 AI가 살펴보고 있어요. 끝나면 여기와 대시보드에 알려요.'
const CALM_TITLE = '살펴봤는데 바꿀 것 없는 점검 규칙 3개'

const view = (rows: RuleCheckView[], pending: RuleHit[] = []): NoticeRuleView => ({ rows, pending })

function show(found: NoticeRuleView | 'failed', checkedAt: string | null = null) {
  read.mockResolvedValue(found)
  return render(<RuleBox noticeId={ID} rules={HITS} checkedAt={checkedAt} />)
}

const region = (name: string | RegExp) => screen.getByRole('region', { name })
const findRegion = (name: string | RegExp) => screen.findByRole('region', { name })
const textOf = (el: Element) => el.textContent ?? ''
const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/)
const before = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

function expectErrorCard(code: ErrorCode, inside: HTMLElement) {
  const alert = within(inside).getByRole('alert')
  expect(alert.textContent).toContain(errorInfo(code).what)
  expect(alert.textContent).toContain(errorInfo(code).fix)
  expect(alert.textContent).toContain(`오류 번호 ${code}`)
}

// 바뀐 규칙 카드(listitem) 하나: 규칙 번호로 찾는다
function cardOf(ruleId: string): HTMLElement {
  const card = within(region(CHANGE_TITLE))
    .getAllByRole('listitem')
    .find((li) => within(li).queryByText(ruleId) !== null)
  if (card === undefined) throw new Error(`${ruleId} 카드가 없다`)
  return card
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

// 한국 2026-11-22 (일) 09:12
const NOW = new Date('2026-11-22T00:12:00.000Z')

beforeEach(() => {
  read.mockReset()
  revert.mockReset()
  see.mockReset()
  see.mockResolvedValue(true)
  rulesCheck.mockReset()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AC-7814.1: 읽기와 상자 차례', () => {
  it('AC-7814.1: readNoticeRules(글 id, ruleHits)로 읽고, 읽는 동안은 아무것도 그리지 않는다', async () => {
    const wait = deferred<NoticeRuleView | 'failed'>()
    read.mockReturnValue(wait.promise)
    const { container } = render(<RuleBox noticeId={ID} rules={HITS} checkedAt={null} />)
    expect(read).toHaveBeenCalledWith(ID, HITS)
    expect(container.innerHTML).toBe('')
    wait.resolve(view([H_LA, H_HY]))
    expect(await findRegion(HUMAN_TITLE)).toBeTruthy()
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('AC-7814.1: 사람이 봐야 함(노랑) → 저절로 바뀜(파랑) → 살펴보는 중(회색) → 바꿀 것 없음(회색) 차례다', async () => {
    // 줄 차례가 섞여 와도 상자 차례는 정해져 있다
    show(view([S_ES1, C_ES, H_LA, S_PH, C_MN, H_HY, S_MN1], PENDING))
    const human = await findRegion(HUMAN_TITLE)
    const change = region(CHANGE_TITLE)
    const pending = region(PENDING_TITLE)
    const calm = region(CALM_TITLE)
    expect(screen.getAllByRole('region')).toEqual([human, change, pending, calm])
    expect(before(human, change) && before(change, pending) && before(pending, calm)).toBe(true)
    expect(classesOf(human)).toContain('bg-warning-soft')
    expect(classesOf(change)).toContain('bg-accent-soft')
    expect(classesOf(pending)).toContain('bg-canvas')
    expect(classesOf(calm)).toContain('bg-canvas')
  })

  it('AC-7814.1: 줄이 있는 상자만 그린다 — 바뀜만 있으면 파랑 상자 하나다', async () => {
    show(view([C_ES, C_MN]))
    await findRegion(CHANGE_TITLE)
    expect(screen.getAllByRole('region')).toHaveLength(1)
    expect(screen.queryByText(/확인 필요/)).toBeNull()
    expect(screen.queryByText(/살펴보는 중/)).toBeNull()
    expect(screen.queryByText(/바꿀 것 없는/)).toBeNull()
  })

  it('AC-7814.1: 판정 줄도 살펴보는 중 규칙도 없으면(옛 판 줄만) 아무것도 그리지 않는다', async () => {
    const { container } = show(view([]))
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1))
    await Promise.resolve()
    expect(container.innerHTML).toBe('')
  })
})

describe('AC-7814.2: 사람이 봐야 함 상자', () => {
  it('AC-7814.2: 제목 · 안내 · 규칙마다 제목·규칙 번호·까닭 · 점검 규칙 보기(설정 점검 규칙 칸) · 확인했어요다', async () => {
    show(view([H_LA, H_HY]))
    const box = await findRegion(HUMAN_TITLE)
    expect(within(box).getByText(HUMAN_BODY)).toBeTruthy()
    const items = within(box).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    for (const [item, r] of [
      [items[0], H_LA],
      [items[1], H_HY],
    ] as const) {
      expect(within(item).getByText(r.title)).toBeTruthy()
      expect(within(item).getByText(r.ruleId)).toBeTruthy()
      expect(within(item).getByText(r.why)).toBeTruthy()
    }
    expect(within(box).getByRole('link', { name: '점검 규칙 보기' }).getAttribute('href')).toBe('/settings#rule-settings-title')
    expect(within(box).getByRole('button', { name: '확인했어요' })).toBeTruthy()
  })

  it('AC-7814.2: 확인했어요를 누르면(두 번 눌러도 한 번) checkRules 저장 뒤 점검 규칙 {n}개 확인함 · {시각}에 확인했어요.이고 규칙 목록은 그대로다', async () => {
    const wait = deferred<boolean>()
    rulesCheck.mockReturnValue(wait.promise)
    show(view([H_LA, H_HY]))
    const box = await findRegion(HUMAN_TITLE)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    const button = within(box).getByRole('button', { name: '확인했어요' })
    fireEvent.click(button)
    expect(button.getAttribute('aria-busy')).toBe('true')
    fireEvent.click(button)
    expect(rulesCheck).toHaveBeenCalledTimes(1)
    expect(rulesCheck).toHaveBeenCalledWith(ID)
    wait.resolve(true)
    const done = await findRegion('점검 규칙 2개 확인함')
    expect(within(done).getByText('11월 22일 (일) 09:12에 확인했어요.')).toBeTruthy()
    expect(within(done).getAllByRole('listitem').map(textOf)).toEqual([
      `${H_LA.title}${H_LA.ruleId}${H_LA.why}`,
      `${H_HY.title}${H_HY.ruleId}${H_HY.why}`,
    ])
    expect(classesOf(done)).toContain('bg-canvas')
    expect(screen.queryByRole('button', { name: '확인했어요' })).toBeNull()
    expect(screen.queryByText(/확인 필요/)).toBeNull()
  })

  it('AC-7814.2: 처음부터 확인한 글이면 확인함 모양과 그 시각이다', async () => {
    show(view([H_LA, H_HY]), '2026-11-16T23:40:00.000Z')
    const done = await findRegion('점검 규칙 2개 확인함')
    expect(within(done).getByText('11월 17일 (화) 08:40에 확인했어요.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '확인했어요' })).toBeNull()
  })

  it('AC-7814.2: 확인 저장이 실패하면 E-NOTICE-SAVE이고 확인 필요 상자가 그대로다', async () => {
    rulesCheck.mockResolvedValue(false)
    show(view([H_LA, H_HY]))
    const box = await findRegion(HUMAN_TITLE)
    fireEvent.click(within(box).getByRole('button', { name: '확인했어요' }))
    await within(box).findByRole('alert')
    expectErrorCard('E-NOTICE-SAVE', box)
    expect(within(box).getByRole('button', { name: '확인했어요' }).getAttribute('aria-busy')).toBeNull()
  })
})

describe('AC-7814.3: 저절로 바뀜 상자', () => {
  it('AC-7814.3: 제목 · 안내 · 카드마다 제목·규칙 번호·전·후·까닭·{날짜} 진료부터 적용·되돌리기 · 상자 끝 주의 글이다', async () => {
    show(view([C_ES, C_MN]))
    const box = await findRegion(CHANGE_TITLE)
    expect(within(box).getByText(CHANGE_BODY)).toBeTruthy()
    expect(within(box).getAllByRole('listitem')).toHaveLength(2)
    for (const [r, from] of [
      [C_ES, '12월 1일 진료부터 적용'],
      [C_MN, '11월 20일 진료부터 적용'],
    ] as const) {
      const card = cardOf(r.ruleId)
      expect(within(card).getByText(r.title)).toBeTruthy()
      expect(within(card).getAllByRole('term').map(textOf)).toEqual(['전', '후', '까닭'])
      expect(within(card).getAllByRole('definition').map(textOf)).toEqual([r.before, r.after, r.why])
      expect(within(card).getByText(from)).toBeTruthy()
      const button = within(card).getByRole('button', { name: `${r.ruleId} 되돌리기` })
      expect(button.textContent).toBe('되돌리기')
      expect(within(card).queryByText('우리 병원은 되돌림')).toBeNull()
    }
    // 바뀐 규칙 카드에는 바뀐 제목이다(원래 제목이 아님)
    expect(within(box).queryByText(ES_OLD)).toBeNull()
    const note = within(box).getByText(CHANGE_NOTE)
    for (const card of within(box).getAllByRole('listitem')) expect(before(card, note)).toBe(true)
  })

  it('AC-7814.3: 되돌리기 전 카드는 전 글이 흐린 지운 줄, 후 글이 굵다', async () => {
    show(view([C_ES]))
    await findRegion('이 글로 점검 규칙 1개가 저절로 바뀌었어요')
    const [was, now] = within(screen.getByRole('listitem')).getAllByRole('definition')
    expect(classesOf(was)).toEqual(expect.arrayContaining(['line-through', 'text-muted']))
    expect(classesOf(was)).not.toContain('font-semibold')
    expect(classesOf(now)).toContain('font-semibold')
    expect(classesOf(now)).not.toContain('line-through')
  })
})

describe('AC-7814.4: 되돌린 카드', () => {
  const REVERTED_ES = { ...C_ES, reverted: true, revertedAt: '2026-11-22T00:05:00.000Z', seen: true }

  it('AC-7814.4: 카드 제목은 ruleHits의 원래 제목 · 우리 병원은 되돌림 칩 · {시각}에 되돌렸어요. … · 다시 적용이다', async () => {
    show(view([REVERTED_ES, C_MN]))
    await findRegion(CHANGE_TITLE)
    const card = cardOf('ES-04')
    expect(within(card).getByText(ES_OLD)).toBeTruthy()
    expect(within(card).queryByText(ES_NEW)).toBeNull()
    expect(within(card).getByText('우리 병원은 되돌림')).toBeTruthy()
    expect(within(card).getByText('11월 22일 (일) 09:05에 되돌렸어요. 우리 병원은 전 규칙으로 점검해요.')).toBeTruthy()
    expect(within(card).getByText('12월 1일 진료부터 적용')).toBeTruthy()
    const button = within(card).getByRole('button', { name: 'ES-04 다시 적용' })
    expect(button.textContent).toBe('다시 적용')
    expect(within(card).queryByRole('button', { name: 'ES-04 되돌리기' })).toBeNull()
    // 다른 카드는 그대로
    expect(within(cardOf('MN-03')).queryByText('우리 병원은 되돌림')).toBeNull()
    expect(within(cardOf('MN-03')).getByRole('button', { name: 'MN-03 되돌리기' })).toBeTruthy()
  })

  it('AC-7814.4: 되돌린 카드는 전 글이 굵고 후 글이 지운 줄이다', async () => {
    show(view([REVERTED_ES]))
    await findRegion('이 글로 점검 규칙 1개가 저절로 바뀌었어요')
    const [was, now] = within(screen.getByRole('listitem')).getAllByRole('definition')
    expect(classesOf(was)).toContain('font-semibold')
    expect(classesOf(was)).not.toContain('line-through')
    expect(classesOf(now)).toContain('line-through')
    expect(classesOf(now)).not.toContain('font-semibold')
  })

  it('AC-7814.4: ruleHits에 없는 규칙을 되돌렸으면 규칙 번호가 제목 자리다', async () => {
    read.mockResolvedValue(view([{ ...REVERTED_ES, ruleId: 'XX-99' }]))
    render(<RuleBox noticeId={ID} rules={HITS.filter((h) => h.id !== 'ES-04')} checkedAt={null} />)
    await findRegion('이 글로 점검 규칙 1개가 저절로 바뀌었어요')
    expect(within(screen.getByRole('listitem')).getAllByText('XX-99').length).toBeGreaterThan(0)
    expect(screen.queryByText(ES_NEW)).toBeNull()
  })
})

describe('AC-7814.5: 되돌리기 · 다시 적용 누르기', () => {
  it('AC-7814.5: 되돌리기를 누르면 단추가 aria-busy이고 두 번 눌러도 setRuleReverted(판 id, true)를 한 번만 부르며, 성공하면 바로 되돌린 모양(시각은 지금)이다', async () => {
    const wait = deferred<boolean>()
    revert.mockReturnValue(wait.promise)
    show(view([C_ES, C_MN]))
    await findRegion(CHANGE_TITLE)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    const button = within(cardOf('ES-04')).getByRole('button', { name: 'ES-04 되돌리기' })
    fireEvent.click(button)
    expect(button.getAttribute('aria-busy')).toBe('true')
    fireEvent.click(button)
    expect(revert).toHaveBeenCalledTimes(1)
    expect(revert).toHaveBeenCalledWith(C_ES.changeId, true)
    // 다른 카드 단추는 기다리지 않는다
    expect(within(cardOf('MN-03')).getByRole('button', { name: 'MN-03 되돌리기' }).getAttribute('aria-busy')).toBeNull()
    wait.resolve(true)
    const again = await within(cardOf('ES-04')).findByRole('button', { name: 'ES-04 다시 적용' })
    expect(again.getAttribute('aria-busy')).toBeNull()
    const card = cardOf('ES-04')
    expect(within(card).getByText(ES_OLD)).toBeTruthy()
    expect(within(card).getByText('우리 병원은 되돌림')).toBeTruthy()
    expect(within(card).getByText('11월 22일 (일) 09:12에 되돌렸어요. 우리 병원은 전 규칙으로 점검해요.')).toBeTruthy()
    const [was, now] = within(card).getAllByRole('definition')
    expect(classesOf(was)).toContain('font-semibold')
    expect(classesOf(now)).toContain('line-through')
    expect(within(cardOf('MN-03')).queryByText('우리 병원은 되돌림')).toBeNull()
  })

  it('AC-7814.5: 다시 적용을 누르면 setRuleReverted(판 id, false) 뒤 바뀐 모양으로 돌아온다', async () => {
    revert.mockResolvedValue(true)
    show(view([{ ...C_ES, reverted: true, revertedAt: '2026-11-22T00:05:00.000Z', seen: true }]))
    await findRegion('이 글로 점검 규칙 1개가 저절로 바뀌었어요')
    fireEvent.click(screen.getByRole('button', { name: 'ES-04 다시 적용' }))
    const undo = await screen.findByRole('button', { name: 'ES-04 되돌리기' })
    expect(undo.textContent).toBe('되돌리기')
    expect(revert).toHaveBeenCalledWith(C_ES.changeId, false)
    expect(screen.getByText(ES_NEW)).toBeTruthy()
    expect(screen.queryByText('우리 병원은 되돌림')).toBeNull()
    expect(screen.queryByText(/에 되돌렸어요/)).toBeNull()
    const [was, now] = within(screen.getByRole('listitem')).getAllByRole('definition')
    expect(classesOf(was)).toContain('line-through')
    expect(classesOf(now)).toContain('font-semibold')
  })

  it('AC-7814.5: 저장이 실패하면 그 카드 안에 E-RULE-AUTO-SAVE 오류 상자이고 모양은 그대로다', async () => {
    revert.mockResolvedValue(false)
    show(view([C_ES, C_MN]))
    await findRegion(CHANGE_TITLE)
    fireEvent.click(within(cardOf('MN-03')).getByRole('button', { name: 'MN-03 되돌리기' }))
    const card = cardOf('MN-03')
    await within(card).findByRole('alert')
    expectErrorCard('E-RULE-AUTO-SAVE', card)
    expect(within(card).getByText(errorInfo('E-RULE-AUTO-SAVE').what).textContent).toBe('점검 규칙을 바꾸지 못했어요')
    expect(within(card).getByText(errorInfo('E-RULE-AUTO-SAVE').fix).textContent).toBe('잠시 뒤 다시 눌러 주세요. 지금은 누르기 전 규칙 그대로 점검해요')
    expect(within(card).getByRole('button', { name: 'MN-03 되돌리기' }).getAttribute('aria-busy')).toBeNull()
    expect(within(card).queryByText('우리 병원은 되돌림')).toBeNull()
    expect(within(cardOf('ES-04')).queryByRole('alert')).toBeNull()
  })

  it('AC-7814.5: 실패 뒤 다시 눌러 성공하면 오류 상자가 사라지고 되돌린 모양이다', async () => {
    revert.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    show(view([C_ES]))
    await findRegion('이 글로 점검 규칙 1개가 저절로 바뀌었어요')
    fireEvent.click(screen.getByRole('button', { name: 'ES-04 되돌리기' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'ES-04 되돌리기' }))
    await screen.findByRole('button', { name: 'ES-04 다시 적용' })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(revert).toHaveBeenCalledTimes(2)
  })
})

describe('AC-7814.6: 살펴보는 중 · 바꿀 것 없음 상자', () => {
  it('AC-7814.6: 판정 없는 ruleHits는 AI가 점검 규칙 {n}개를 살펴보는 중이에요 · 안내 · 규칙 제목 목록이다', async () => {
    show(view([], PENDING))
    const box = await findRegion(PENDING_TITLE)
    expect(within(box).getByText(PENDING_BODY)).toBeTruthy()
    expect(within(box).getAllByRole('listitem').map(textOf)).toEqual(PENDING.map((h) => h.title))
    expect(within(box).queryByRole('button')).toBeNull()
  })

  it('AC-7814.6: none·same 줄은 살펴봤는데 바꿀 것 없는 점검 규칙 {n}개 · 보기(접힘)이고, 누르면 접기와 규칙마다 제목·규칙 번호·까닭이다', async () => {
    show(view([S_ES1, S_PH, S_MN1]))
    const box = await findRegion(CALM_TITLE)
    const show_ = within(box).getByRole('button', { name: '보기' })
    expect(show_.getAttribute('aria-expanded')).toBe('false')
    expect(within(box).queryAllByRole('listitem')).toHaveLength(0)
    fireEvent.click(show_)
    const hide = within(box).getByRole('button', { name: '접기' })
    expect(hide.getAttribute('aria-expanded')).toBe('true')
    const items = within(box).getAllByRole('listitem')
    expect(items.map(textOf)).toEqual([S_ES1, S_PH, S_MN1].map((r) => `${r.title}${r.ruleId}${r.why}`))
    for (const [item, r] of items.map((li, i) => [li, [S_ES1, S_PH, S_MN1][i]] as const)) {
      expect(within(item).getByText(r.title)).toBeTruthy()
      expect(within(item).getByText(r.ruleId)).toBeTruthy()
      expect(within(item).getByText(r.why)).toBeTruthy()
    }
    fireEvent.click(hide)
    expect(within(box).getByRole('button', { name: '보기' }).getAttribute('aria-expanded')).toBe('false')
    expect(within(box).queryAllByRole('listitem')).toHaveLength(0)
  })
})

describe('AC-7814.7: 본 것으로 적기', () => {
  it('AC-7814.7: 아직 안 본, 되돌리지 않은 change 줄이 있으면 읽기가 끝난 뒤 seeRuleChanges(글 id)를 한 번 부른다', async () => {
    show(view([H_LA, { ...C_ES, seen: true }, C_MN]))
    await findRegion(CHANGE_TITLE)
    await waitFor(() => expect(see).toHaveBeenCalledWith(ID))
    expect(see).toHaveBeenCalledTimes(1)
  })

  it('AC-7814.7: change 줄이 모두 본 것이거나 되돌린 것이면, 또는 change 줄이 없으면 부르지 않는다', async () => {
    show(view([{ ...C_ES, seen: true }, { ...C_MN, reverted: true, revertedAt: '2026-11-22T00:05:00.000Z' }]))
    await findRegion(CHANGE_TITLE)
    cleanup()
    show(view([H_LA, S_ES1], PENDING))
    await findRegion('이 글이 점검 규칙 1개를 바꿔요 — 확인 필요')
    await Promise.resolve()
    expect(see).not.toHaveBeenCalled()
  })

  it('AC-7814.7: 본 것 저장이 실패해도 알리지 않는다', async () => {
    see.mockResolvedValue(false)
    show(view([C_ES]))
    await findRegion('이 글로 점검 규칙 1개가 저절로 바뀌었어요')
    await waitFor(() => expect(see).toHaveBeenCalledTimes(1))
    await Promise.resolve()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('AC-7814.8: 읽기 실패 · 글자로만', () => {
  it('AC-7814.8: 읽기 실패면 E-NOTICE-READ 오류 상자와 다시 읽기이고, 누르면 다시 읽어 상자를 그린다', async () => {
    const { container } = show('failed')
    const alert = await screen.findByRole('alert')
    expectErrorCard('E-NOTICE-READ', container)
    expect(alert).toBeTruthy()
    expect(screen.queryByRole('region')).toBeNull()
    read.mockResolvedValue(view([C_ES]))
    fireEvent.click(screen.getByRole('button', { name: '다시 읽기' }))
    expect(await findRegion('이 글로 점검 규칙 1개가 저절로 바뀌었어요')).toBeTruthy()
    expect(read).toHaveBeenCalledTimes(2)
    expect(read).toHaveBeenLastCalledWith(ID, HITS)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: '다시 읽기' })).toBeNull()
  })

  it('AC-7814.8: 읽기가 던져도 E-NOTICE-READ와 다시 읽기다', async () => {
    read.mockRejectedValue(new Error('network'))
    const { container } = render(<RuleBox noticeId={ID} rules={HITS} checkedAt={null} />)
    await screen.findByRole('alert')
    expectErrorCard('E-NOTICE-READ', container)
    expect(screen.getByRole('button', { name: '다시 읽기' })).toBeTruthy()
    expect(container.textContent).not.toContain('network')
  })

  it('AC-7814.8: 제목·까닭·전·후의 <b>x</b>는 HTML로 해석하지 않고 글자 그대로 보인다', async () => {
    const tag = '<b>x</b>'
    const { container } = show(
      view(
        [
          { ...H_LA, title: `사람 ${tag}`, why: `사람 까닭 ${tag}` },
          { ...C_ES, title: `바뀜 ${tag}`, before: `전 ${tag}`, after: `후 ${tag}`, why: `바뀜 까닭 ${tag}` },
          { ...S_ES1, title: `그대로 ${tag}`, why: `그대로 까닭 ${tag}` },
        ],
        [{ id: 'MN-05', title: `살펴보는 ${tag}` }],
      ),
    )
    await findRegion('이 글이 점검 규칙 1개를 바꿔요 — 확인 필요')
    fireEvent.click(within(region('살펴봤는데 바꿀 것 없는 점검 규칙 1개')).getByRole('button', { name: '보기' }))
    for (const text of [`사람 ${tag}`, `사람 까닭 ${tag}`, `바뀜 ${tag}`, `전 ${tag}`, `후 ${tag}`, `바뀜 까닭 ${tag}`, `그대로 ${tag}`, `그대로 까닭 ${tag}`, `살펴보는 ${tag}`]) {
      expect(screen.getByText(text)).toBeTruthy()
    }
    expect(container.querySelector('b')).toBeNull()
    expect(container.innerHTML).not.toContain(tag)
  })
})

// 앱에는 링크 밑줄·목록 점을 지우는 초기화가 없다 → 시안(밑줄·점 없음)처럼 요소마다 no-underline·list-none을 직접 준다
describe('AC-7814.1·AC-7814.3: 시안 모양(밑줄·점)', () => {
  it('AC-7814.1·AC-7814.3: 상자 안 모든 링크에 밑줄이 없고 모든 목록에 점이 없다', async () => {
    const { container } = show(view([H_LA, C_ES, S_ES1], PENDING))
    await findRegion('이 글이 점검 규칙 1개를 바꿔요 — 확인 필요')
    fireEvent.click(within(region('살펴봤는데 바꿀 것 없는 점검 규칙 1개')).getByRole('button', { name: '보기' }))
    const links = Array.from(container.querySelectorAll('a'))
    expect(links).toHaveLength(1)
    for (const a of links) expect(classesOf(a)).toContain('no-underline')
    // 사람이 봐야 함 · 바뀐 카드 · 살펴보는 중 · 바꿀 것 없음
    const lists = Array.from(container.querySelectorAll('ul, ol'))
    expect(lists).toHaveLength(4)
    for (const list of lists) expect(classesOf(list), textOf(list)).toContain('list-none')
  })
})

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ViewingProvider, type Viewing } from '@/components/shell/viewing'
import { addKeyword, askLeft, checkRules, fillProgress, listNotices, markRead, openNotice, readKeywords, removeKeyword, saveMemo, setStar, sourceStates } from '@/lib/storage/notices'
import { readNoticeRules, seeRuleChanges, setRuleReverted } from '@/lib/storage/ruleChanges'
import type { NoticeView } from '@/types/notices'
import type { RuleCheckView } from '@/types/ruleAuto'
import { NoticeDetail } from './detail/NoticeDetail'
import { KeywordsControl } from './keywords/KeywordsControl'
import { NoticesScreen } from './list/NoticesScreen'

// 다른 의원 보기 — 고시·공지 읽기만 (specs/admin-view TASK-10 · REQ-8010 AC-8010.1, design.md '탭마다 읽기만' 고시·공지 줄).
// 화면 부품은 진짜를 그리고 저장소만 흉내 낸다(Supabase에 닿지 않음). 보는 중(ViewingProvider viewing=가짜)과 아닐 때(viewing=null)를 견준다.
// 글 제목·고시 번호·메모는 지어낸 예시다(실제 고시가 아니다)
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }))
vi.mock('@/lib/storage/notices', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/notices')>()),
  openNotice: vi.fn(),
  markRead: vi.fn(),
  setStar: vi.fn(),
  saveMemo: vi.fn(),
  checkRules: vi.fn(),
  askLeft: vi.fn(),
  listNotices: vi.fn(),
  sourceStates: vi.fn(),
  fillProgress: vi.fn(),
  readKeywords: vi.fn(),
  addKeyword: vi.fn(),
  removeKeyword: vi.fn(),
}))
vi.mock('@/lib/storage/ruleChanges', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/ruleChanges')>()),
  readNoticeRules: vi.fn(),
  setRuleReverted: vi.fn(),
  seeRuleChanges: vi.fn(),
}))

const VIEW: Viewing = { hospitalId: '00000000-0000-4000-8000-0000000000a1', name: '가짜하늘정형외과의원' }
const ID = '3f2c9a10-5b7d-4e21-9c8a-1d2e3f4a5b6c'
const MEMO = '12월 회의 때 원장님들께 알리기(가짜 메모)'
const RULE1 = { id: 'rule-1', title: '가짜 주사 같은 관절 1년 횟수' }
const RULE2 = { id: 'rule-2', title: '가짜 주사 1개월 관절 수' }

function notice(over: Partial<NoticeView> = {}): NoticeView {
  return {
    id: ID,
    title: '가짜 고시 일부개정 — 관절강내 주사 인정기준',
    kind: 'gosi',
    postedOn: '2026-11-20',
    noticeNo: '2026-999',
    related: true,
    summary: { related: true, what: '가짜 요약이에요.', when: '2026년 12월 1일 진료분부터', who: '의원 포함', forUs: '가짜 안내예요.', amends: [] },
    readMode: 'full',
    state: 'done',
    ruleHits: [RULE1, RULE2],
    posts: [{ source: 'mohw_rss', title: '가짜 고시', url: 'https://www.mohw.go.kr/board.es?mid=a10409020000&bid=0026&list_no=9', postedOn: '2026-11-20', attachments: [] }],
    mark: { readAt: null, starred: true, memo: MEMO, memoAt: '2026-11-21T01:00:00.000Z', rulesCheckedAt: null },
    unread: true,
    keywords: ['관절강내 주사'],
    ...over,
  }
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const HUMAN: RuleCheckView = {
  changeId: uuid(1),
  ruleId: RULE1.id,
  verdict: 'human',
  why: '가짜 까닭이에요.',
  before: '',
  after: '',
  from: null,
  title: RULE1.title,
  seen: false,
  reverted: false,
  revertedAt: null,
}
// 우리 병원(보는 의원)이 아직 안 본, 되돌리지 않은 바뀐 판 — 보는 중이 아니면 seeRuleChanges를 부른다
const CHANGE: RuleCheckView = {
  ...HUMAN,
  changeId: uuid(2),
  ruleId: RULE2.id,
  verdict: 'change',
  before: '1개월 2관절',
  after: '1개월 3관절',
  from: '2026-12-01',
  title: '가짜 주사 1개월 관절 수(바뀜)',
}

const wrap = (viewing: Viewing | null, node: ReactNode) => <ViewingProvider viewing={viewing}>{node}</ViewingProvider>
const button = (name: string | RegExp) => screen.queryByRole('button', { name })

async function openDetail(viewing: Viewing | null) {
  render(wrap(viewing, <NoticeDetail id={ID} />))
  await screen.findByRole('heading', { level: 1 })
  // 규칙 상자를 다 읽을 때까지(사람이 봐야 함 · 저절로 바뀜 둘 다 그려진 뒤)
  await screen.findByText('이 글로 점검 규칙 1개가 저절로 바뀌었어요')
}

beforeEach(() => {
  vi.mocked(openNotice).mockResolvedValue(notice())
  vi.mocked(markRead).mockResolvedValue(true as never)
  vi.mocked(askLeft).mockResolvedValue(20)
  vi.mocked(readNoticeRules).mockResolvedValue({ rows: [HUMAN, CHANGE], pending: [] })
  vi.mocked(seeRuleChanges).mockResolvedValue(true as never)
  vi.mocked(listNotices).mockResolvedValue({ total: 1, unread: 1, rows: [notice()] } as never)
  vi.mocked(sourceStates).mockResolvedValue([])
  vi.mocked(fillProgress).mockResolvedValue('failed')
  vi.mocked(readKeywords).mockResolvedValue(['관절강내 주사', '도수치료'])
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AC-8010.1: 보는 중 고시·공지 — 글 화면', () => {
  it('AC-8010.1: 글을 열어도 읽음 표시(markRead)·바뀐 판 봄(seeRuleChanges)을 쓰지 않고, [별표]·[메모 저장]·[AI에게 묻기]·[확인했어요]·[되돌리기]가 없다', async () => {
    await openDetail(VIEW)
    expect(markRead).not.toHaveBeenCalled()
    expect(seeRuleChanges).not.toHaveBeenCalled()
    for (const name of ['별표', '별표함', '메모 저장', 'AI에게 묻기', '메모에 옮기기', '확인했어요', `${RULE2.id} 되돌리기`, `${RULE2.id} 다시 적용`]) {
      expect(button(name), name).toBeNull()
    }
    // 묻기 칸이 없으니 남은 횟수도 읽지 않는다
    expect(askLeft).not.toHaveBeenCalled()
    for (const write of [setStar, saveMemo, checkRules, setRuleReverted]) expect(write).not.toHaveBeenCalled()
  })

  it('AC-8010.1: 보는 의원의 별표·메모·맞춤(꼭 볼 글) 표시와 규칙 상자 글은 보인다 — 메모 칸은 읽기만', async () => {
    await openDetail(VIEW)
    expect(screen.getByText('별표함')).toBeTruthy()
    expect(screen.getByText('꼭 볼 글 · 관절강내 주사')).toBeTruthy()
    const memo = screen.getByRole('textbox', { name: '우리 병원 메모' }) as HTMLTextAreaElement
    expect(memo.value).toBe(MEMO)
    expect(memo.readOnly).toBe(true)
    expect(screen.getByText('이 글이 점검 규칙 1개를 바꿔요 — 확인 필요')).toBeTruthy()
    expect(screen.getByText('1개월 3관절')).toBeTruthy()
    // 설정의 점검 규칙 보기는 읽기라 그대로
    expect(screen.getByRole('link', { name: /점검 규칙 보기/ })).toBeTruthy()
  })

  it('AC-8010.1: 보는 중이 아니면(viewing=null) 지금과 같다 — 읽음·바뀐 판 봄을 적고 쓰기 단추가 있다', async () => {
    await openDetail(null)
    await waitFor(() => expect(markRead).toHaveBeenCalledWith(ID))
    await waitFor(() => expect(seeRuleChanges).toHaveBeenCalledWith(ID))
    for (const name of ['별표함', '메모 저장', 'AI에게 묻기', '확인했어요', `${RULE2.id} 되돌리기`]) expect(button(name), name).toBeTruthy()
    expect((screen.getByRole('textbox', { name: '우리 병원 메모' }) as HTMLTextAreaElement).readOnly).toBe(false)
  })
})

describe('AC-8010.1: 보는 중 고시·공지 — 글 목록 · 내 낱말', () => {
  it('AC-8010.1: 목록은 보이고 별 단추는 없다 — 보는 의원이 별표한 글은 별표 표시가 보인다', async () => {
    render(wrap(VIEW, <NoticesScreen />))
    const title = await screen.findByTestId('notice-title')
    expect(title.textContent).toContain('가짜 고시 일부개정')
    expect(button('별표 하기')).toBeNull()
    expect(button('별표 빼기')).toBeNull()
    expect(screen.getByRole('img', { name: '별표함' })).toBeTruthy()
    // 고르기(별표만·관련 글만)는 읽기라 그대로
    expect(screen.getByRole('button', { name: '별표만' })).toBeTruthy()
    expect(setStar).not.toHaveBeenCalled()
  })

  it('AC-8010.1: 내 낱말 — 보는 의원의 낱말은 보이고 더하기·빼기·추천 더하기가 없다', async () => {
    render(wrap(VIEW, <KeywordsControl />))
    fireEvent.click(await screen.findByRole('button', { name: '내 낱말 2개' }))
    const panel = screen.getByRole('region', { name: '내 낱말' })
    expect(within(panel).getByText('관절강내 주사')).toBeTruthy()
    expect(within(panel).getByText('도수치료')).toBeTruthy()
    expect(within(panel).queryAllByRole('button', { name: /빼기$/ })).toHaveLength(0)
    expect(within(panel).queryAllByRole('button', { name: /더하기$/ })).toHaveLength(0)
    expect(within(panel).queryByRole('textbox')).toBeNull()
    expect(addKeyword).not.toHaveBeenCalled()
    expect(removeKeyword).not.toHaveBeenCalled()
  })

  it('AC-8010.1: 보는 중이 아니면(viewing=null) 별 단추와 낱말 더하기·빼기가 지금처럼 있다', async () => {
    render(wrap(null, <NoticesScreen />))
    await screen.findByTestId('notice-title')
    expect(button('별표 빼기')).toBeTruthy()
    cleanup()
    render(wrap(null, <KeywordsControl />))
    fireEvent.click(await screen.findByRole('button', { name: '내 낱말 2개' }))
    const panel = screen.getByRole('region', { name: '내 낱말' })
    expect(within(panel).getByRole('button', { name: '관절강내 주사 빼기' })).toBeTruthy()
    expect(within(panel).getByRole('button', { name: '더하기' })).toBeTruthy()
  })
})

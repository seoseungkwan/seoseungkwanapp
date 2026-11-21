// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorInfo } from '@/lib/errors'
import { askLeft, checkRules, markRead, openNotice, saveMemo, setStar } from '@/lib/storage/notices'
import type { ErrorCode } from '@/types/errors'
import type { GroupPost, NoticeView } from '@/types/notices'
import { NoticeDetail } from './NoticeDetail'

// 글 화면 (specs/notices TASK-18, REQ-7420 · AC-7424.11, design 10절, 승인 시안 docs/mockups/notices ?s=detail·detail-mohw·ask-answer).
// 저장소 함수만 가짜로 바꾼다. 글자 도구(lib/notices/view·keywords·askCheck)와 오류 안내(errors.ts)는 진짜를 쓴다.
// 글 제목·고시 번호·요약은 시안의 지어낸 예시다(실제 고시가 아니다)
vi.mock('@/lib/storage/notices', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/notices')>()),
  openNotice: vi.fn(),
  markRead: vi.fn(),
  setStar: vi.fn(),
  saveMemo: vi.fn(),
  checkRules: vi.fn(),
  askLeft: vi.fn(),
}))
// 진짜 함수가 Supabase에 닿지 않게 한다
const { supabaseBrowser } = vi.hoisted(() => ({ supabaseBrowser: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))

const open = vi.mocked(openNotice)
const read = vi.mocked(markRead)
const star = vi.mocked(setStar)
const memoSave = vi.mocked(saveMemo)
const rulesCheck = vi.mocked(checkRules)
const left = vi.mocked(askLeft)

const ID = '3f2c9a10-5b7d-4e21-9c8a-1d2e3f4a5b6c'
const TITLE = '「요양급여의 적용기준 및 방법에 관한 세부사항」 일부개정 — 관절강내 주사 인정기준'
const MOHW_URL = 'https://www.mohw.go.kr/board.es?mid=a10409020000&bid=0026&act=view&list_no=1218'
const CRTR_URL = 'https://www.hira.or.kr/rc/insu/insuadtcrtr/InsuAdtCrtrPopup.do?mtgHmeDd=20261120&sno=1'
const FILE1 = { name: '붙임1. 고시 전문.hwpx', url: 'https://www.hira.or.kr/bbsDummy.do?file=1' }
const FILE2 = { name: '붙임2. 신구조문 대비표.pdf', url: 'https://www.hira.or.kr/bbsDummy.do?file=2' }
const RULE1 = '스테로이드 관절강내주사 같은 관절 1년 횟수'
const RULE2 = '스테로이드 관절강내주사 1개월 관절 수'
const WHAT = '스테로이드 관절강내 주사를 같은 관절에 1년에 인정하는 횟수가 6번에서 4번으로 줄고, 한 달에 주사하는 관절 수 기준도 정리돼요.'
const WHEN = '2026년 12월 1일 진료분부터'
const WHO = '스테로이드 관절강내 주사를 놓는 모든 의료기관(의원 포함)'
const FOR_US = '무릎·어깨에 스테로이드 주사를 1년에 5번 이상 맞는 환자는 12월부터 삭감될 수 있어요.'
const ANSWER = '네. 이번 개정은 관절 부위를 나누지 않아서 어깨에도 똑같이 적용돼요.'

const MOHW_POST: GroupPost = { source: 'mohw_rss', title: TITLE, url: MOHW_URL, postedOn: '2026-11-20', attachments: [] }
const CRTR_POST: GroupPost = {
  source: 'hira_crtr',
  title: '관절강내 주사 인정기준 개정 안내',
  url: CRTR_URL,
  postedOn: '2026-11-20',
  attachments: [FILE1, FILE2],
}

function notice(over: Partial<NoticeView> = {}): NoticeView {
  return {
    id: ID,
    title: TITLE,
    kind: 'gosi',
    postedOn: '2026-11-20',
    noticeNo: '2026-218',
    related: true,
    summary: { related: true, what: WHAT, when: WHEN, who: WHO, forUs: FOR_US, amends: [] },
    readMode: 'full',
    state: 'done',
    ruleHits: [
      { id: 'rule-1', title: RULE1 },
      { id: 'rule-2', title: RULE2 },
    ],
    // 출처 글 차례가 제목 차례와 달라도 [원문 보기]는 제목을 준 글(보건복지부)이다
    posts: [CRTR_POST, MOHW_POST],
    mark: { readAt: null, starred: false, memo: '', memoAt: null, rulesCheckedAt: null },
    unread: true,
    keywords: [],
    ...over,
  }
}

async function show(view: NoticeView | null | 'failed' = notice()) {
  open.mockResolvedValue(view)
  const result = render(<NoticeDetail id={ID} />)
  if (view !== null && view !== 'failed') await screen.findByRole('heading', { level: 1 })
  else await screen.findByRole('alert')
  return result
}

const region = (name: string | RegExp) => screen.getByRole('region', { name })
const textOf = (el: Element) => el.textContent ?? ''
const before = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
// 그 글을 가진 가장 안쪽 요소(아이콘 svg가 곁에 있어도 찾는다)
const exactText = (text: string) =>
  screen.getByText((_, el) => el !== null && el.textContent === text && !Array.from(el.children).some((child) => child.textContent === text))

function expectErrorCard(code: ErrorCode, inside?: HTMLElement) {
  const alert = inside ? within(inside).getByRole('alert') : screen.getByRole('alert')
  expect(alert.textContent).toContain(errorInfo(code).what)
  expect(alert.textContent).toContain(errorInfo(code).fix)
  expect(alert.textContent).toContain(`오류 번호 ${code}`)
}

// 한국 2026-11-21 (토) 09:20
const NOW = new Date('2026-11-21T00:20:00.000Z')

beforeEach(() => {
  open.mockReset()
  read.mockReset()
  read.mockResolvedValue(true)
  star.mockReset()
  memoSave.mockReset()
  rulesCheck.mockReset()
  left.mockReset()
  left.mockResolvedValue(17)
  supabaseBrowser.mockReset()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AC-7420.1: 글 머리 · 읽음 · 두 칸 배치', () => {
  it('AC-7420.1: 글 목록으로 · 출처 · {날짜} 올라옴 · 제목 · 글 번호 자리 · 정형외과 의원 관련 칩 · 별표 단추이고 읽음으로 저장한다', async () => {
    await show()
    const back = screen.getByRole('link', { name: '글 목록으로' })
    expect(back.getAttribute('href')).toBe('/notices')
    expect(exactText('보건복지부 · 심평원 심사기준')).toBeTruthy()
    expect(exactText('11월 20일 (금) 올라옴')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(TITLE)
    expect(exactText('보건복지부 고시 제2026-218호')).toBeTruthy()
    expect(exactText('정형외과 의원 관련')).toBeTruthy()
    const starButton = screen.getByRole('button', { name: '별표' })
    expect(starButton.getAttribute('aria-pressed')).toBe('false')
    expect(open).toHaveBeenCalledWith(ID)
    await waitFor(() => expect(read).toHaveBeenCalledWith(ID))
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('AC-7420.1: 고시 번호가 없으면 심사기준 종류가 글 번호 자리이고, 관련 아님이면 관련 칩이 없다', async () => {
    const { container } = await show(notice({ noticeNo: null, kind: 'case', related: false, posts: [CRTR_POST] }))
    expect(exactText('공개 심사사례')).toBeTruthy()
    expect(screen.queryByText('정형외과 의원 관련')).toBeNull()
    const head = container.querySelector('header')
    if (head === null) throw new Error('글 머리가 없다')
    expect(within(head).getByText('심평원 심사기준')).toBeTruthy()
  })

  it('AC-7420.1: 왼쪽 칸은 규칙 상자 → 요약 → AI에게 묻기, 오른쪽 칸은 메모 → 올라온 곳이다', async () => {
    const { container } = await show()
    const main = container.querySelector('article')
    const side = container.querySelector('aside')
    if (main === null || side === null) throw new Error('두 칸이 없다')
    const rule = region('이 글이 점검 규칙 2개의 근거를 바꿔요 — 확인 필요')
    const summary = region('AI 세 줄 요약')
    const ask = region('AI에게 묻기')
    const memo = region('우리 병원 메모')
    const origin = region('올라온 곳')
    for (const box of [rule, summary, ask]) expect(main.contains(box)).toBe(true)
    for (const box of [memo, origin]) expect(side.contains(box)).toBe(true)
    expect(before(rule, summary)).toBe(true)
    expect(before(summary, ask)).toBe(true)
    expect(before(memo, origin)).toBe(true)
    expect(before(main, side)).toBe(true)
  })

  it('AC-7420.1: 이미 별표한 글은 별표함(aria-pressed)이고, 누르면 setStar(id, false) 뒤 별표가 된다', async () => {
    star.mockResolvedValue(true)
    await show(notice({ mark: { readAt: null, starred: true, memo: '', memoAt: null, rulesCheckedAt: null } }))
    const on = screen.getByRole('button', { name: '별표함' })
    expect(on.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(on)
    const off = await screen.findByRole('button', { name: '별표' })
    expect(off.getAttribute('aria-pressed')).toBe('false')
    expect(star).toHaveBeenCalledWith(ID, false)
  })

  it('AC-7420.1: 별표를 누르면 setStar(id, true) 뒤 별표함이고, 저장 실패면 E-NOTICE-SAVE이고 별표는 그대로다', async () => {
    star.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    await show()
    fireEvent.click(screen.getByRole('button', { name: '별표' }))
    const on = await screen.findByRole('button', { name: '별표함' })
    expect(on.getAttribute('aria-pressed')).toBe('true')
    expect(star).toHaveBeenLastCalledWith(ID, true)
    fireEvent.click(on)
    await screen.findByRole('alert')
    expectErrorCard('E-NOTICE-SAVE')
    expect(screen.getByRole('button', { name: '별표함' }).getAttribute('aria-pressed')).toBe('true')
  })
})

describe('AC-7420.2: 점검 규칙 상자', () => {
  it('AC-7420.2: 규칙 연결이 있고 확인이 없으면 제목 · 안내 · 규칙 제목 목록 · 점검 규칙 보기(설정 점검 규칙 칸) · 확인했어요다', async () => {
    await show()
    const box = region('이 글이 점검 규칙 2개의 근거를 바꿔요 — 확인 필요')
    expect(
      within(box).getByText(
        '점검 규칙은 저절로 바뀌지 않아요. 아래 규칙이 새 기준과 맞는지 설정 → 점검 규칙에서 확인해 주세요.',
      ),
    ).toBeTruthy()
    expect(within(box).getAllByRole('listitem').map(textOf)).toEqual([RULE1, RULE2])
    expect(within(box).getByRole('link', { name: '점검 규칙 보기' }).getAttribute('href')).toBe('/settings#rule-settings-title')
    expect(within(box).getByRole('button', { name: '확인했어요' })).toBeTruthy()
  })

  it('AC-7420.2: 확인했어요를 누르면 checkRules 저장 뒤 점검 규칙 {n}개 확인함 · {날짜 시각}에 확인했어요.이고 규칙 목록은 그대로다', async () => {
    rulesCheck.mockResolvedValue(true)
    await show()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    fireEvent.click(screen.getByRole('button', { name: '확인했어요' }))
    const done = await screen.findByRole('region', { name: '점검 규칙 2개 확인함' })
    expect(rulesCheck).toHaveBeenCalledWith(ID)
    expect(within(done).getByText('11월 21일 (토) 09:20에 확인했어요.')).toBeTruthy()
    expect(within(done).getAllByRole('listitem').map(textOf)).toEqual([RULE1, RULE2])
    expect(screen.queryByRole('button', { name: '확인했어요' })).toBeNull()
    expect(screen.queryByText(/확인 필요/)).toBeNull()
  })

  it('AC-7420.2: 이미 확인한 글은 처음부터 확인함과 그 시각이다', async () => {
    await show(notice({ mark: { readAt: null, starred: false, memo: '', memoAt: null, rulesCheckedAt: '2026-11-16T23:40:00.000Z' } }))
    const done = region('점검 규칙 2개 확인함')
    expect(within(done).getByText('11월 17일 (화) 08:40에 확인했어요.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '확인했어요' })).toBeNull()
  })

  it('AC-7420.2: 확인 저장이 실패하면 E-NOTICE-SAVE이고 확인 필요 상자가 그대로다', async () => {
    rulesCheck.mockResolvedValue(false)
    await show()
    fireEvent.click(screen.getByRole('button', { name: '확인했어요' }))
    const box = region('이 글이 점검 규칙 2개의 근거를 바꿔요 — 확인 필요')
    await within(box).findByRole('alert')
    expectErrorCard('E-NOTICE-SAVE', box)
    expect(within(box).getByRole('button', { name: '확인했어요' })).toBeTruthy()
  })

  it('AC-7420.2: 규칙 연결이 없으면 규칙 상자가 없다', async () => {
    await show(notice({ ruleHits: [] }))
    expect(screen.queryByText(/점검 규칙/)).toBeNull()
  })
})

describe('AC-7420.3: AI 세 줄 요약 · 원문 · 붙임', () => {
  it('AC-7420.3: 붙임까지 읽은 요약은 칩 · 세 줄 · 우리 의원에는 · 주의 글이다', async () => {
    await show()
    const box = region('AI 세 줄 요약')
    expect(within(box).getByText('붙임 파일까지 읽고 요약')).toBeTruthy()
    const terms = within(box).getAllByRole('term').map(textOf)
    const values = within(box).getAllByRole('definition').map(textOf)
    expect(terms).toEqual(['무엇이 바뀌나', '언제부터', '누구 대상'])
    expect(values).toEqual([WHAT, WHEN, WHO])
    expect(within(box).getByText('우리 의원에는')).toBeTruthy()
    expect(within(box).getByText(FOR_US)).toBeTruthy()
    expect(within(box).getByText('AI가 만든 요약이라 틀릴 수 있어요. 중요한 내용은 원문에서 꼭 확인해 주세요.')).toBeTruthy()
    expect(within(box).queryByText(/본문만/)).toBeNull()
  })

  it("AC-7420.3: 읽기 방식 'text'도 붙임 파일까지 읽고 요약이다", async () => {
    await show(notice({ readMode: 'text' }))
    expect(within(region('AI 세 줄 요약')).getByText('붙임 파일까지 읽고 요약')).toBeTruthy()
  })

  it('AC-7420.3: 원문 보기는 제목을 준 글 주소를 새 창(noopener noreferrer)으로 열고, 붙임 파일 이름 링크들이 있다', async () => {
    await show()
    const box = region('AI 세 줄 요약')
    const original = within(box).getByRole('link', { name: '원문 보기' })
    expect(original.getAttribute('href')).toBe(MOHW_URL)
    expect(original.getAttribute('target')).toBe('_blank')
    expect(original.getAttribute('rel')).toBe('noopener noreferrer')
    expect(within(box).getByText('원래 게시판에서 새 창으로 열려요. 파일은 이 앱에 저장하지 않아요.')).toBeTruthy()
    expect(within(box).getByText('붙임 파일')).toBeTruthy()
    for (const file of [FILE1, FILE2]) {
      const link = within(box).getByRole('link', { name: file.name })
      expect(link.getAttribute('href')).toBe(file.url)
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    }
    expect(within(box).queryByText('붙임 파일은 원문에서 받아 주세요.')).toBeNull()
  })

  it('AC-7420.3: 본문만 본 보건복지부 글은 칩 본문만 보고 요약 · 이유 줄(기본값 4) · 붙임 없음 글(기본값 5)이다', async () => {
    await show(notice({ readMode: 'body', posts: [MOHW_POST] }))
    const box = region('AI 세 줄 요약')
    expect(within(box).getByText('본문만 보고 요약')).toBeTruthy()
    expect(
      within(box).getByText('보건복지부는 붙임 파일 가져가기를 막아 두어 본문만 보고 요약했어요. 붙임 파일은 원문에서 확인해 주세요.'),
    ).toBeTruthy()
    expect(within(box).getByText('붙임 파일은 원문에서 받아 주세요.')).toBeTruthy()
    expect(within(box).queryByText('붙임 파일까지 읽고 요약')).toBeNull()
  })

  it('AC-7420.3: 붙임이 있는데 본문만 보고 요약했으면 붙임을 읽지 못한 이유 줄이다(기본값 4)', async () => {
    await show(notice({ readMode: 'body' }))
    expect(
      within(region('AI 세 줄 요약')).getByText(
        '붙임 파일을 읽지 못해 본문만 보고 요약했어요. 붙임 파일은 원문에서 확인해 주세요.',
      ),
    ).toBeTruthy()
  })

  it('AC-7420.3: 붙임 없는 심평원 글만의 묶음은 붙임 칸과 붙임 없음 글이 없다(기본값 5)', async () => {
    await show(notice({ posts: [{ ...CRTR_POST, title: TITLE, attachments: [] }] }))
    const box = region('AI 세 줄 요약')
    expect(within(box).queryByText('붙임 파일')).toBeNull()
    expect(within(box).queryByText('붙임 파일은 원문에서 받아 주세요.')).toBeNull()
    expect(within(box).getByRole('link', { name: '원문 보기' }).getAttribute('href')).toBe(CRTR_URL)
  })

  it('AC-7420.3: 두 사이트 주소가 아니면 링크로 만들지 않는다', async () => {
    const bad = { name: '이상한 붙임.pdf', url: 'javascript:alert(1)' }
    await show(notice({ posts: [{ ...MOHW_POST, url: 'https://evil.example.com/x', attachments: [bad] }] }))
    const box = region('AI 세 줄 요약')
    expect(within(box).queryByRole('link', { name: '원문 보기' })).toBeNull()
    expect(within(box).queryByRole('link', { name: bad.name })).toBeNull()
    expect(within(box).getByText(bad.name)).toBeTruthy()
    expect(box.querySelector('a[href^="javascript"]')).toBeNull()
  })

  it('AC-7420.3: 요약 전이면 요약을 만드는 중이에요.이고 칩·세 줄이 없다', async () => {
    await show(notice({ summary: null, readMode: null, state: 'wait', related: null }))
    const box = region('AI 세 줄 요약')
    expect(within(box).getByText('요약을 만드는 중이에요.')).toBeTruthy()
    expect(within(box).queryAllByRole('term')).toHaveLength(0)
    expect(within(box).queryByText('붙임 파일까지 읽고 요약')).toBeNull()
    expect(within(box).queryByText('본문만 보고 요약')).toBeNull()
    expect(within(box).getByRole('link', { name: '원문 보기' })).toBeTruthy()
  })

  it('AC-7420.3: 요약이 실패한 글은 칩 없이 기본값 6 글이다', async () => {
    await show(notice({ summary: null, readMode: null, state: 'failed', related: null }))
    const box = region('AI 세 줄 요약')
    expect(within(box).getByText('요약을 만들지 못했어요. 원문에서 확인해 주세요.')).toBeTruthy()
    expect(within(box).queryByText('요약을 만드는 중이에요.')).toBeNull()
  })
})

describe('AC-7420.4: 우리 병원 메모', () => {
  it('AC-7420.4: 제목 · 칸(칸 안 글·500자) · 안내 · 메모 저장이고, 저장한 적이 없으면 저장 시각이 없다', async () => {
    await show()
    const box = region('우리 병원 메모')
    const area = within(box).getByRole('textbox', { name: '우리 병원 메모' }) as HTMLTextAreaElement
    expect(area.tagName).toBe('TEXTAREA')
    expect(area.placeholder).toBe('예: 12월 회의 때 원장님들께 알리기')
    expect(area.maxLength).toBe(500)
    expect(area.value).toBe('')
    expect(within(box).getByText('우리 병원 계정만 봐요. 환자 정보는 쓰지 마세요.')).toBeTruthy()
    expect(within(box).getByRole('button', { name: '메모 저장' })).toBeTruthy()
    expect(within(box).queryByText(/저장됨$/)).toBeNull()
  })

  it('AC-7420.4: 저장한 메모는 칸에 있고 {날짜 시각} 저장됨이다', async () => {
    await show(
      notice({ mark: { readAt: null, starred: false, memo: '물리치료실에 알림 끝.', memoAt: '2026-11-16T23:42:00.000Z', rulesCheckedAt: null } }),
    )
    const box = region('우리 병원 메모')
    expect((within(box).getByRole('textbox') as HTMLTextAreaElement).value).toBe('물리치료실에 알림 끝.')
    expect(within(box).getByText('11월 17일 (화) 08:42 저장됨')).toBeTruthy()
  })

  it('AC-7420.4: 메모 저장을 누르면 saveMemo(id, 적은 값) 뒤 {날짜 시각} 저장됨이다', async () => {
    memoSave.mockResolvedValue(true)
    await show()
    const box = region('우리 병원 메모')
    fireEvent.change(within(box).getByRole('textbox'), { target: { value: '12월 회의 때 원장님들께 알리기' } })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    fireEvent.click(within(box).getByRole('button', { name: '메모 저장' }))
    expect(await within(box).findByText('11월 21일 (토) 09:20 저장됨')).toBeTruthy()
    expect(memoSave).toHaveBeenCalledWith(ID, '12월 회의 때 원장님들께 알리기')
  })

  it('AC-7420.4: 환자 정보 모양으로 막히면 기본값 13 두 글이고 적은 값은 그대로다', async () => {
    memoSave.mockResolvedValue({ private: ['tel'] })
    await show()
    const box = region('우리 병원 메모')
    const area = within(box).getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(area, { target: { value: '010-1234-5678 환자 전화 옴' } })
    fireEvent.click(within(box).getByRole('button', { name: '메모 저장' }))
    expect(await within(box).findByText('환자 정보로 보이는 글자가 있어 저장하지 않았어요')).toBeTruthy()
    expect(within(box).getByText('전화번호로 보이는 글자를 지우고 다시 눌러 주세요.')).toBeTruthy()
    expect(area.value).toBe('010-1234-5678 환자 전화 옴')
    expect(within(box).queryByText(/저장됨$/)).toBeNull()
  })

  it('AC-7420.4: 저장 실패면 E-NOTICE-SAVE이고 적은 값은 그대로다', async () => {
    memoSave.mockResolvedValue(false)
    await show()
    const box = region('우리 병원 메모')
    const area = within(box).getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(area, { target: { value: '원장님 회의 안건' } })
    fireEvent.click(within(box).getByRole('button', { name: '메모 저장' }))
    await within(box).findByRole('alert')
    expectErrorCard('E-NOTICE-SAVE', box)
    expect(area.value).toBe('원장님 회의 안건')
  })
})

describe('AC-7420.5: 올라온 곳', () => {
  it('AC-7420.5: 출처마다 이름·날짜이고, 둘 이상이면 같은 고시 번호라 한 글로 묶었어요.다', async () => {
    await show()
    const box = region('올라온 곳')
    const items = within(box).getAllByRole('listitem')
    expect(items.map(textOf)).toEqual(['심평원 심사기준11월 20일 (금)', '보건복지부11월 20일 (금)'])
    expect(within(box).getByText('같은 고시 번호라 한 글로 묶었어요.')).toBeTruthy()
  })

  it('AC-7420.5: 출처가 하나면 묶음 글이 없다', async () => {
    await show(notice({ posts: [{ ...MOHW_POST, postedOn: '2026-11-16' }] }))
    const box = region('올라온 곳')
    expect(within(box).getAllByRole('listitem').map(textOf)).toEqual(['보건복지부11월 16일 (월)'])
    expect(within(box).queryByText('같은 고시 번호라 한 글로 묶었어요.')).toBeNull()
  })
})

describe('AC-7420.8: 메모에 옮기기(글 화면)', () => {
  function answerWith(answer: string) {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ answer, left: 16 }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  async function ask(question: string) {
    const box = region('AI에게 묻기')
    fireEvent.click(within(box).getByRole('button', { name: 'AI에게 묻기' }))
    fireEvent.change(within(box).getByRole('textbox', { name: '물어볼 것' }), { target: { value: question } })
    fireEvent.click(within(box).getByRole('button', { name: '묻기' }))
    await within(box).findByText('AI 답')
    return box
  }

  it('AC-7420.8: 메모에 옮기기는 메모 칸 끝에 줄을 바꿔 답을 붙이고 저장하지 않는다', async () => {
    answerWith(ANSWER)
    await show(notice({ mark: { readAt: null, starred: false, memo: '원장님께 알리기', memoAt: null, rulesCheckedAt: null } }))
    const box = await ask('어깨 관절 주사도 1년에 4번으로 줄어드나요?')
    fireEvent.click(within(box).getByRole('button', { name: '메모에 옮기기' }))
    const area = within(region('우리 병원 메모')).getByRole('textbox') as HTMLTextAreaElement
    expect(area.value).toBe(`원장님께 알리기\n${ANSWER}`)
    expect(memoSave).not.toHaveBeenCalled()
  })

  it('AC-7420.8: 빈 메모면 답만 들어가고, 500자를 넘으면 500자에서 자른다', async () => {
    const long = '가'.repeat(300)
    answerWith(long)
    await show()
    const box = await ask('어깨 관절 주사도 줄어드나요?')
    const area = within(region('우리 병원 메모')).getByRole('textbox') as HTMLTextAreaElement
    fireEvent.click(within(box).getByRole('button', { name: '메모에 옮기기' }))
    expect(area.value).toBe(long)
    fireEvent.click(within(box).getByRole('button', { name: '메모에 옮기기' }))
    expect(Array.from(area.value)).toHaveLength(500)
    expect(area.value).toBe(`${long}\n${long}`.slice(0, 500))
    expect(memoSave).not.toHaveBeenCalled()
  })
})

describe('AC-7420.10: 글자로만 · 읽기 실패', () => {
  it('AC-7420.10: 제목·요약·메모의 <b>x</b>는 HTML로 해석하지 않고 글자 그대로 보인다', async () => {
    const tag = '<b>x</b>'
    const { container } = await show(
      notice({
        title: `제목 ${tag}`,
        summary: { related: true, what: `무엇 ${tag}`, when: `언제 ${tag}`, who: `누구 ${tag}`, forUs: `우리 ${tag}`, amends: [] },
        ruleHits: [{ id: 'rule-1', title: `규칙 ${tag}` }],
        mark: { readAt: null, starred: false, memo: `메모 ${tag}`, memoAt: null, rulesCheckedAt: null },
      }),
    )
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(`제목 ${tag}`)
    expect(screen.getByText(`무엇 ${tag}`)).toBeTruthy()
    expect(screen.getByText(`우리 ${tag}`)).toBeTruthy()
    expect(screen.getByText(`규칙 ${tag}`)).toBeTruthy()
    expect((within(region('우리 병원 메모')).getByRole('textbox') as HTMLTextAreaElement).value).toBe(`메모 ${tag}`)
    expect(container.querySelector('b > b, h1 b, dd b')).toBeNull()
    expect(container.innerHTML).not.toContain('<b>x</b>')
  })

  it('AC-7420.10: 글이 없으면 E-NOTICE-READ 상자이고 읽음으로 적지 않는다', async () => {
    await show(null)
    expectErrorCard('E-NOTICE-READ')
    expect(screen.getByRole('link', { name: '글 목록으로' }).getAttribute('href')).toBe('/notices')
    expect(read).not.toHaveBeenCalled()
  })

  it('AC-7420.10: 읽기 실패면 E-NOTICE-READ 상자와 다시 읽기이고, 누르면 다시 읽어 글을 그린다', async () => {
    await show('failed')
    expectErrorCard('E-NOTICE-READ')
    expect(read).not.toHaveBeenCalled()
    open.mockResolvedValue(notice())
    fireEvent.click(screen.getByRole('button', { name: '다시 읽기' }))
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(TITLE)
    expect(open).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(read).toHaveBeenCalledWith(ID))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('AC-7424.11: 꼭 볼 글 칩', () => {
  it('AC-7424.11: keywords가 있으면 글 번호 자리 뒤 · 정형외과 의원 관련 칩 앞에 모든 낱말 칩이 있다', async () => {
    await show(notice({ keywords: ['도수치료', '관절강내 주사', 'MRI', '실손보험'] }))
    const chip = exactText('꼭 볼 글 · 도수치료·관절강내 주사·MRI·실손보험')
    const number = exactText('보건복지부 고시 제2026-218호')
    const related = exactText('정형외과 의원 관련')
    expect(before(number, chip)).toBe(true)
    expect(before(chip, related)).toBe(true)
    expect(screen.queryByText(/ 외 \d+개/)).toBeNull()
  })

  it('AC-7424.11: AI가 관련 아님으로 본 글도 낱말 칩은 있고, keywords가 없으면 칩이 없다', async () => {
    await show(notice({ related: false, keywords: ['도수치료'] }))
    expect(exactText('꼭 볼 글 · 도수치료')).toBeTruthy()
    cleanup()
    await show(notice({ keywords: [] }))
    expect(screen.queryByText(/꼭 볼 글/)).toBeNull()
  })
})

// 앱에는 링크 밑줄·목록 점을 지우는 초기화가 없다 → 시안(밑줄·점 없음)처럼 요소마다 no-underline·list-none을 직접 준다
describe('AC-7420.1·AC-7420.2·AC-7420.3·AC-7420.5: 시안 모양(밑줄·점·글자 크기)', () => {
  const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/)

  it('AC-7420.1·AC-7420.2·AC-7420.3·AC-7420.5: 모든 링크에 밑줄이 없고(no-underline) 모든 목록에 점이 없다(list-none)', async () => {
    const plain = { name: '붙임3. 바깥 주소.pdf', url: 'https://example.com/x.pdf' }
    // [글, 링크 수]: 확인 전 = 글 목록으로 · 점검 규칙 보기 · 원문 보기 · 붙임 둘 / 확인함 = 글 목록으로 · 원문 보기 · 붙임 하나(바깥 주소는 링크 아님)
    const views: [NoticeView, number][] = [
      [notice(), 5],
      [
        notice({
          mark: { readAt: null, starred: false, memo: '', memoAt: null, rulesCheckedAt: '2026-11-21T00:10:00.000Z' },
          posts: [MOHW_POST, { ...CRTR_POST, attachments: [FILE1, plain] }],
        }),
        3,
      ],
    ]
    for (const [view, linkCount] of views) {
      const { container } = await show(view)
      const links = Array.from(container.querySelectorAll('a'))
      expect(links).toHaveLength(linkCount)
      for (const a of links) expect(classesOf(a), textOf(a)).toContain('no-underline')
      // 규칙 목록 · 붙임 목록 · 올라온 곳
      const lists = Array.from(container.querySelectorAll('ul, ol'))
      expect(lists).toHaveLength(3)
      for (const list of lists) expect(classesOf(list), textOf(list)).toContain('list-none')
      cleanup()
    }
  })

  it('AC-7420.1: 읽기 실패 화면의 글 목록으로 링크도 밑줄이 없다', async () => {
    await show('failed')
    expect(classesOf(screen.getByRole('link', { name: '글 목록으로' }))).toContain('no-underline')
  })

  it('AC-7420.3: 붙임 파일 이름은 시안대로 본문 글자 크기(text-body, 14px)다. 링크로 만들지 않은 이름도 같다', async () => {
    const plain = { name: '붙임3. 바깥 주소.pdf', url: 'https://example.com/x.pdf' }
    await show(notice({ posts: [MOHW_POST, { ...CRTR_POST, attachments: [FILE1, plain] }] }))
    const box = region('AI 세 줄 요약')
    expect(classesOf(within(box).getByRole('link', { name: FILE1.name }))).toContain('text-body')
    expect(within(box).queryByRole('link', { name: plain.name })).toBeNull()
    const name = within(box).getByText(plain.name).parentElement
    if (name === null) throw new Error('붙임 이름 줄이 없다')
    expect(classesOf(name)).toContain('text-body')
  })
})

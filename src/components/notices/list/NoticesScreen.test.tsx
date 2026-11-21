// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fillProgress, listNotices, setStar, sourceStates } from '@/lib/storage/notices'
import type { FillProgress, NoticeFilter, NoticePage, NoticeView, SourceView } from '@/types/notices'
import { NoticesScreen } from './NoticesScreen'

// 고시·공지 글 목록 화면(specs/notices TASK-17 · REQ-7419 · AC-7424.10). 저장소만 가짜이고 글자 도구(lib/notices/view·keywords)는 진짜다.
// 글 제목·요약·숫자는 지어낸 예시이고 환자 자료가 없다
vi.mock('@/lib/storage/notices', () => ({
  NOTICES_CHANGED: 'notices:changed',
  listNotices: vi.fn(),
  setStar: vi.fn(),
  sourceStates: vi.fn(),
  fillProgress: vi.fn(),
}))

const list = vi.mocked(listNotices)
const star = vi.mocked(setStar)
const states = vi.mocked(sourceStates)
const fill = vi.mocked(fillProgress)

// 한국 시각 2026-11-21 (토) 08:20
const NOW = new Date('2026-11-20T23:20:00Z')
const ALL_SOURCES = ['hira_notice', 'hira_crtr', 'mohw_rss']

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const HIRA_URL = 'https://www.hira.or.kr/bbsDummy.do?pgmid=HIRAA020002000100&brdScnBltNo=4&brdBltNo=1'
const MOHW_URL = 'https://www.mohw.go.kr/board.es?mid=a10409020000&bid=0026&list_no=1'

function view(over: Partial<NoticeView> = {}): NoticeView {
  return {
    id: id(1),
    title: '요양기관 업무포털 일시 중단 안내',
    kind: 'notice',
    postedOn: '2026-11-17',
    noticeNo: null,
    related: true,
    summary: { related: true, what: '새벽에는 청구 파일을 보낼 수 없어요.', when: '글에 없어요', who: '모든 요양기관', forUs: '글에 없어요', amends: [] },
    readMode: 'body',
    state: 'done',
    ruleHits: [],
    posts: [{ source: 'hira_notice', title: '요양기관 업무포털 일시 중단 안내', url: HIRA_URL, postedOn: '2026-11-17', attachments: [] }],
    mark: { readAt: null, starred: false, memo: '', memoAt: null, rulesCheckedAt: null },
    unread: false,
    keywords: [],
    ...over,
  }
}

const file = (n: number) => ({ name: `붙임${n}.pdf`, url: `https://www.hira.or.kr/bbs/bbsCDownLoad.do?apndNo=${n}&apndBrdBltNo=1&apndBrdTyNo=2&apndBltNo=3` })

// 시안 '목록 · 관련 글만'을 닮은 예시 줄(최근 글부터)
const GOSI = view({
  id: id(218),
  title: '「요양급여의 적용기준 및 방법에 관한 세부사항」 일부개정 — 관절강내 주사 인정기준',
  kind: 'gosi',
  postedOn: '2026-11-20',
  noticeNo: '2026-218',
  summary: { related: true, what: '스테로이드 관절강내 주사를 같은 관절에 1년에 인정하는 횟수가 줄어요.', when: '2026년 12월 1일 진료분부터', who: '의원 포함', forUs: '삭감될 수 있어요.', amends: [] },
  readMode: 'full',
  ruleHits: [
    { id: 'INJ-01', title: '스테로이드 관절강내주사 같은 관절 1년 횟수' },
    { id: 'INJ-02', title: '스테로이드 관절강내주사 1개월 관절 수' },
  ],
  posts: [
    { source: 'hira_crtr', title: '관절강내 주사', url: 'https://www.hira.or.kr/rc/insu/insuadtcrtr/InsuAdtCrtrPopup.do?mtgHmeDd=1&sno=1&mtgMtrRegSno=1', postedOn: '2026-11-20', attachments: [file(1), file(2)] },
    { source: 'mohw_rss', title: '보건복지부 고시 제2026-218호', url: MOHW_URL, postedOn: '2026-11-20', attachments: [] },
  ],
  unread: true,
  keywords: ['관절강내 주사'],
})
const NEWS = view({
  id: id(2),
  title: '2026년 12월 진료분 요양급여비용 청구·지급 일정 안내',
  postedOn: '2026-11-20',
  summary: { related: true, what: '연말 연휴로 12월 진료분 청구 마감과 지급 날짜가 평소와 달라져요.', when: '', who: '', forUs: '', amends: [] },
  posts: [{ source: 'hira_notice', title: '청구 일정', url: HIRA_URL, postedOn: '2026-11-20', attachments: [file(3)] }],
  unread: true,
})
// AI는 관련 아님으로 봤지만 내 낱말이 맞아 관련 글만 보기에도 저장소가 준 글
const MUST = view({
  id: id(3),
  title: '한방병원 추나요법·도수 치료 같은 날 청구 점검 결과 안내',
  postedOn: '2026-11-19',
  related: false,
  summary: { related: false, what: '한방병원에서 추나요법과 도수치료를 같은 날 청구한 사례를 점검한 결과예요.', when: '', who: '', forUs: '', amends: [] },
  keywords: ['도수치료'],
})
const CASE = view({
  id: id(4),
  title: '체외충격파 치료 심사사례 공개 (어깨 석회성 건염 등 4건)',
  kind: 'case',
  postedOn: '2026-11-18',
  posts: [{ source: 'hira_crtr', title: '체외충격파', url: 'https://www.hira.or.kr/rc/insu/insuadtcrtr/InsuAdtCrtrPopup.do?mtgHmeDd=2&sno=2&mtgMtrRegSno=2', postedOn: '2026-11-18', attachments: [] }],
  mark: { readAt: '2026-11-19T00:00:00Z', starred: true, memo: '', memoAt: null, rulesCheckedAt: null },
  keywords: ['체외충격파', '도수치료', '실손보험'],
})
const CHECKED = view({
  id: id(214),
  title: '「건강보험 행위 급여·비급여 목록표 및 급여 상대가치점수」 일부개정 — 물리치료',
  kind: 'gosi',
  postedOn: '2026-11-16',
  noticeNo: '2026-214',
  ruleHits: [{ id: 'PT-01', title: '표층열 + 심층열' }],
  posts: [{ source: 'mohw_rss', title: '물리치료', url: MOHW_URL, postedOn: '2026-11-16', attachments: [] }],
  mark: { readAt: '2026-11-17T00:00:00Z', starred: false, memo: '', memoAt: null, rulesCheckedAt: '2026-11-16T23:40:00Z' },
})
const WAITING = view({
  id: id(121),
  title: '「요양급여의 적용기준 및 방법에 관한 세부사항」 일부개정 — 신경차단술',
  postedOn: '2026-06-30',
  related: null,
  summary: null,
  readMode: null,
  state: 'batch',
})
const FAILED = view({ id: id(122), title: '2026년 7월 진료분 청구 일정 안내', postedOn: '2026-06-29', related: null, summary: null, readMode: null, state: 'failed' })

const ROWS = [GOSI, NEWS, MUST, CASE, CHECKED, WAITING, FAILED]
const pageOf = (rows: NoticeView[], total = rows.length, unread = 2): NoticePage => ({ total, unread, rows })

const okSource = (source: SourceView['source']): SourceView => ({
  source,
  state: 'ok',
  errorCode: null,
  checkedAt: source === 'mohw_rss' ? '2026-11-20T22:03:00Z' : '2026-11-20T22:02:00Z',
  lastOkAt: source === 'mohw_rss' ? '2026-11-20T22:03:00Z' : '2026-11-20T22:02:00Z',
  stoppedSince: null,
  backfillDone: true,
})
const OK_SOURCES = [okSource('hira_notice'), okSource('hira_crtr'), okSource('mohw_rss')]
const DONE_FILL: FillProgress = { total: 1240, done: 1240, batching: 0 }

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const lastFilter = (): NoticeFilter => list.mock.calls.at(-1)?.[0] as NoticeFilter
const rowOf = (title: string) => screen.getByText(title).closest('li') as HTMLElement
// 여러 요소로 나뉜 글을 통째로 찾는다(가장 안쪽 요소 하나)
const byWhole = (text: string) => (_: string, el: Element | null) =>
  el !== null && el.textContent === text && Array.from(el.children).every((c) => c.textContent !== text)

async function shown(node = <NoticesScreen />) {
  const view = render(node)
  await screen.findByText(GOSI.title)
  return view
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  list.mockReset().mockResolvedValue(pageOf(ROWS, 318, 2))
  star.mockReset().mockResolvedValue(true)
  states.mockReset().mockResolvedValue(OK_SOURCES)
  fill.mockReset().mockResolvedValue(DONE_FILL)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AC-7419.1: 머리 · 작은 탭 · 고르기 줄', () => {
  it('AC-7419.1: 제목·안내·작은 탭(글 목록 지금 쪽, 주간 모음 링크)이 있다', async () => {
    await shown()
    expect(screen.getByRole('heading', { level: 1, name: '고시·공지' })).toBeTruthy()
    expect(screen.getByText('심평원·보건복지부 새 글을 매일 아침 모아 AI가 요약해요.')).toBeTruthy()
    const tabs = screen.getByRole('navigation', { name: '고시·공지' })
    const mine = within(tabs).getByRole('link', { name: '글 목록' })
    expect(mine.getAttribute('aria-current')).toBe('page')
    expect(mine.getAttribute('href')).toBe('/notices')
    const week = within(tabs).getByRole('link', { name: '주간 모음' })
    expect(week.getAttribute('href')).toBe('/notices/week')
    expect(week.getAttribute('aria-current')).toBeNull()
  })

  it('AC-7419.1: 관련 글만(처음 골라짐)·전체·별표만, 찾기 칸·단추, 출처 칩 셋(처음 모두 켜짐)이고 처음 읽기는 관련 글만·모든 출처다', async () => {
    await shown()
    expect(screen.getByRole('button', { name: '관련 글만' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '전체' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: '별표만' }).getAttribute('aria-pressed')).toBe('false')
    const box = screen.getByRole('textbox', { name: '글 찾기' })
    expect(box.getAttribute('placeholder')).toBe('제목·본문·붙임 파일 글자로 찾기')
    expect(screen.getByRole('button', { name: '찾기' })).toBeTruthy()
    const srcs = screen.getByRole('group', { name: '출처' })
    expect(within(srcs).getByText('출처')).toBeTruthy()
    for (const name of ['심평원 공지', '심평원 심사기준', '보건복지부']) {
      expect(within(srcs).getByRole('button', { name }).getAttribute('aria-pressed')).toBe('true')
    }
    expect(list).toHaveBeenCalledTimes(1)
    expect(lastFilter()).toEqual({ related: true, sources: ALL_SOURCES, starred: false, q: '', offset: 0 })
  })

  it('AC-7419.1: 출처는 여러 개 고르고 끌 수 있지만 마지막 하나는 끌 수 없다', async () => {
    const user = userEvent.setup()
    await shown()
    const srcs = screen.getByRole('group', { name: '출처' })
    await user.click(within(srcs).getByRole('button', { name: '심평원 공지' }))
    await waitFor(() => expect(lastFilter().sources).toEqual(['hira_crtr', 'mohw_rss']))
    expect(within(srcs).getByRole('button', { name: '심평원 공지' }).getAttribute('aria-pressed')).toBe('false')
    await user.click(within(srcs).getByRole('button', { name: '보건복지부' }))
    await waitFor(() => expect(lastFilter().sources).toEqual(['hira_crtr']))
    const calls = list.mock.calls.length
    // 마지막 하나: 눌러도 켜진 채이고 다시 읽지 않는다
    await user.click(within(srcs).getByRole('button', { name: '심평원 심사기준' }))
    expect(within(srcs).getByRole('button', { name: '심평원 심사기준' }).getAttribute('aria-pressed')).toBe('true')
    expect(list).toHaveBeenCalledTimes(calls)
    // 다시 켜면 출처 칩 차례대로다
    await user.click(within(srcs).getByRole('button', { name: '심평원 공지' }))
    await waitFor(() => expect(lastFilter().sources).toEqual(['hira_notice', 'hira_crtr']))
  })

  it('AC-7419.1: 고르기는 함께 걸린다(전체 + 별표만 + 출처)', async () => {
    const user = userEvent.setup()
    await shown()
    await user.click(screen.getByRole('button', { name: '전체' }))
    await waitFor(() => expect(lastFilter()).toEqual({ related: false, sources: ALL_SOURCES, starred: false, q: '', offset: 0 }))
    expect(screen.getByRole('button', { name: '전체' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '관련 글만' }).getAttribute('aria-pressed')).toBe('false')
    await user.click(screen.getByRole('button', { name: '별표만' }))
    await waitFor(() => expect(lastFilter()).toEqual({ related: false, sources: ALL_SOURCES, starred: true, q: '', offset: 0 }))
    expect(screen.getByRole('button', { name: '별표만' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(screen.getByRole('button', { name: '보건복지부' }))
    await waitFor(() => expect(lastFilter()).toEqual({ related: false, sources: ['hira_notice', 'hira_crtr'], starred: true, q: '', offset: 0 }))
    await user.click(screen.getByRole('button', { name: '관련 글만' }))
    await waitFor(() => expect(lastFilter()).toEqual({ related: true, sources: ['hira_notice', 'hira_crtr'], starred: true, q: '', offset: 0 }))
  })

  it('AC-7419.1: 관련 글만·전체 묶음은 PC 배치 하나다 — 폰 전용 배치(max-md:) 클래스가 없다(폰에서도 PC 모양 그대로, 2026-11-21 사용자 규칙)', async () => {
    await shown()
    const group = screen.getByRole('group', { name: '보기' })
    const buttons = within(group).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['관련 글만', '전체'])
    for (const el of [group, ...buttons]) {
      const classes = (el.getAttribute('class') ?? '').split(/\s+/)
      expect(classes.filter((c) => c.startsWith('max-md:')), el.textContent ?? '').toEqual([])
    }
    expect((group.getAttribute('class') ?? '').split(/\s+/)).toContain('inline-flex')
  })

  it('AC-7419.1·AC-7419.2·AC-7419.6: 링크는 모두 밑줄이 없고(no-underline) 목록은 모두 점이 없다(list-none) — 앱에는 a 밑줄·목록 점을 지우는 바탕 규칙이 없다(시안 a·ul 초기화)', async () => {
    states.mockResolvedValue([
      okSource('hira_notice'),
      okSource('hira_crtr'),
      { ...okSource('mohw_rss'), state: 'stopped', errorCode: 'shape', lastOkAt: '2026-11-18T22:03:00Z', stoppedSince: '2026-11-19T22:03:00Z' },
    ])
    const { container } = await shown()
    await screen.findByRole('link', { name: '보건복지부 게시판 열기' })
    const links = Array.from(container.querySelectorAll('a'))
    // 작은 탭 둘 · 글 줄마다 하나 · 게시판 열기 하나
    expect(links).toHaveLength(2 + ROWS.length + 1)
    for (const a of links) expect((a.getAttribute('class') ?? '').split(/\s+/), a.textContent ?? '').toContain('no-underline')
    const lists = Array.from(container.querySelectorAll('ul, ol'))
    expect(lists.length).toBeGreaterThan(0)
    for (const list of lists) expect((list.getAttribute('class') ?? '').split(/\s+/)).toContain('list-none')
  })
})

describe('AC-7419.2: 건수 · 달 머리 줄 · 글 줄', () => {
  it('AC-7419.2: 관련 글만이면 `관련 글 **{n}건** · 안 읽은 글 **{u}건**`(굵은 수, 천 단위 쉼표)과 옆 글', async () => {
    list.mockResolvedValue(pageOf(ROWS, 1318, 2))
    await shown()
    expect(screen.getByText(byWhole('관련 글 1,318건 · 안 읽은 글 2건'))).toBeTruthy()
    expect(screen.getByText('1,318건').tagName).toBe('B')
    expect(screen.getByText('2건').tagName).toBe('B')
    expect(screen.getByText('관련 여부는 AI가 정해요. 빠진 글이 걱정되면 [전체]로 보세요.')).toBeTruthy()
  })

  it('AC-7419.2: 전체면 `전체 **{n}건** · 안 읽은 글 **{u}건**`과 옆 글', async () => {
    const user = userEvent.setup()
    await shown()
    list.mockResolvedValue(pageOf(ROWS, 1184, 5))
    await user.click(screen.getByRole('button', { name: '전체' }))
    expect(await screen.findByText(byWhole('전체 1,184건 · 안 읽은 글 5건'))).toBeTruthy()
    expect(screen.getByText('정형외과 의원과 관련 적은 글도 함께 보여요.')).toBeTruthy()
    expect(screen.queryByText('관련 여부는 AI가 정해요. 빠진 글이 걱정되면 [전체]로 보세요.')).toBeNull()
  })

  it('AC-7419.2: 찾는 중이면 `찾은 글 **{n}건**`이고 옆 글이 없다', async () => {
    const user = userEvent.setup()
    await shown()
    list.mockResolvedValue(pageOf([GOSI, NEWS], 2, 2))
    await user.type(screen.getByRole('textbox', { name: '글 찾기' }), '청구{Enter}')
    expect(await screen.findByText(byWhole('찾은 글 2건'))).toBeTruthy()
    expect(screen.queryByText('관련 여부는 AI가 정해요. 빠진 글이 걱정되면 [전체]로 보세요.')).toBeNull()
  })

  it('AC-7419.2: 달마다 머리 줄(11월·6월)이 한 번씩 그 달 글 위에 있다', async () => {
    const { container } = await shown()
    // 달 머리 줄은 화면 읽기에서 숨긴다(줄마다 날짜를 읽는다, 시안 그대로) → 역할이 아니라 li로 센다
    const items = Array.from(container.querySelectorAll('li'))
    const heads = items.filter((li) => li.textContent === '11월' || li.textContent === '6월')
    expect(heads.map((li) => li.textContent)).toEqual(['11월', '6월'])
    const texts = items.map((li) => li.textContent ?? '')
    expect(texts.indexOf('11월')).toBeLessThan(texts.findIndex((t) => t.includes(GOSI.title)))
    expect(texts.indexOf('6월')).toBeLessThan(texts.findIndex((t) => t.includes(WAITING.title)))
    expect(texts.indexOf('6월')).toBeGreaterThan(texts.findIndex((t) => t.includes(CHECKED.title)))
  })

  it('AC-7419.2: 줄마다 날짜 · 출처(` · `) · 글 번호 자리 · 칩 차례(정형외과 의원 관련 → 점검 규칙 확인 필요 → 붙임 파일 {n}개) · 제목 · 무엇이 바뀌나', async () => {
    await shown()
    const row = rowOf(GOSI.title)
    expect(within(row).getByText('11월 20일 (금)')).toBeTruthy()
    expect(within(row).getByText('보건복지부 · 심평원 심사기준')).toBeTruthy()
    expect(within(row).getByText('보건복지부 고시 제2026-218호')).toBeTruthy()
    expect(within(row).getByText('스테로이드 관절강내 주사를 같은 관절에 1년에 인정하는 횟수가 줄어요.')).toBeTruthy()
    const chips = within(row).getAllByTestId('notice-chip').map((c) => c.textContent)
    expect(chips).toEqual(['꼭 볼 글 · 관절강내 주사', '정형외과 의원 관련', '점검 규칙 확인 필요', '붙임 파일 2개'])
  })

  it('AC-7419.2: 확인한 규칙은 `점검 규칙 확인함`, 심사기준 종류는 글 번호 자리, 번호 없는 공지는 빈 자리다', async () => {
    await shown()
    const checked = rowOf(CHECKED.title)
    expect(within(checked).getAllByTestId('notice-chip').map((c) => c.textContent)).toEqual(['정형외과 의원 관련', '점검 규칙 확인함'])
    expect(within(checked).getByText('보건복지부 고시 제2026-214호')).toBeTruthy()
    expect(within(rowOf(CASE.title)).getByText('공개 심사사례')).toBeTruthy()
    const news = rowOf(NEWS.title)
    expect(within(news).getByText('심평원 공지')).toBeTruthy()
    expect(within(news).getAllByTestId('notice-chip').map((c) => c.textContent)).toEqual(['정형외과 의원 관련', '붙임 파일 1개'])
  })

  it('AC-7419.2: 요약 전이면 `요약 만드는 중` 칩과 `요약을 만드는 중이에요.`, 실패면 칩 없이 기본값 6 글이다', async () => {
    await shown()
    const waiting = rowOf(WAITING.title)
    expect(within(waiting).getAllByTestId('notice-chip').map((c) => c.textContent)).toEqual(['요약 만드는 중'])
    expect(within(waiting).getByText('요약을 만드는 중이에요.')).toBeTruthy()
    const failed = rowOf(FAILED.title)
    expect(within(failed).queryAllByTestId('notice-chip')).toEqual([])
    expect(within(failed).getByText('요약을 만들지 못했어요. 원문에서 확인해 주세요.')).toBeTruthy()
    expect(within(failed).queryByText('요약을 만드는 중이에요.')).toBeNull()
  })

  it('AC-7419.2: 별 단추는 화면 읽기 `별표 하기`/`별표 빼기`이고 누르면 바로 바뀌며 저장한다', async () => {
    const user = userEvent.setup()
    await shown()
    const row = rowOf(NEWS.title)
    const btn = within(row).getByRole('button', { name: '별표 하기' })
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    await user.click(btn)
    expect(star).toHaveBeenCalledWith(NEWS.id, true)
    const on = within(row).getByRole('button', { name: '별표 빼기' })
    expect(on.getAttribute('aria-pressed')).toBe('true')
    await user.click(within(rowOf(CASE.title)).getByRole('button', { name: '별표 빼기' }))
    expect(star).toHaveBeenLastCalledWith(CASE.id, false)
    expect(within(rowOf(CASE.title)).getByRole('button', { name: '별표 하기' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-7419.2: 별표 저장이 실패하면 별이 되돌아가고 E-NOTICE-SAVE 상자다(기본값 12)', async () => {
    const user = userEvent.setup()
    star.mockResolvedValue(false)
    await shown()
    const row = rowOf(NEWS.title)
    await user.click(within(row).getByRole('button', { name: '별표 하기' }))
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('저장하지 못했어요')).toBeTruthy()
    expect(within(alert).getByText('오류 번호 E-NOTICE-SAVE')).toBeTruthy()
    expect(within(row).getByRole('button', { name: '별표 하기' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('AC-7419.2: 제목·요약 줄의 태그 모양 글은 HTML로 해석하지 않고 글자 그대로 보인다', async () => {
    list.mockResolvedValue(
      pageOf([GOSI, view({ id: id(9), title: '<em>제목</em> 안내', summary: { ...view().summary!, what: '<img src=x onerror=alert(1)> 바뀌어요' } })]),
    )
    const { container } = await shown()
    expect(screen.getByText('<em>제목</em> 안내')).toBeTruthy()
    expect(screen.getByText('<img src=x onerror=alert(1)> 바뀌어요')).toBeTruthy()
    expect(container.querySelector('em')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })
})

describe('AC-7419.3: 안 읽은 글 · 글 열기', () => {
  it('AC-7419.3: 안 읽은 글은 제목이 굵고 파란 점과 화면 읽기 `안 읽음`이 있고, 읽은 글은 없다', async () => {
    await shown()
    const unread = rowOf(GOSI.title)
    expect(within(unread).getByText('안 읽음')).toBeTruthy()
    expect(within(unread).getByTestId('unread-dot')).toBeTruthy()
    expect(within(unread).getByTestId('notice-title').className).toContain('font-semibold')
    const read = rowOf(CASE.title)
    expect(within(read).queryByText('안 읽음')).toBeNull()
    expect(within(read).queryByTestId('unread-dot')).toBeNull()
    expect(within(read).getByTestId('notice-title').className).not.toContain('font-semibold')
  })

  it('AC-7419.3: 줄을 누르면 `/notices?id=<id>`로 글을 연다', async () => {
    await shown()
    const link = within(rowOf(GOSI.title)).getByRole('link')
    expect(link.getAttribute('href')).toBe(`/notices?id=${GOSI.id}`)
    expect(within(rowOf(CASE.title)).getByRole('link').getAttribute('href')).toBe(`/notices?id=${CASE.id}`)
  })

  it('AC-7419.2·AC-7419.3: 줄 링크 안 글은 링크 색(파랑)이 아니라 시안 색이다 — 링크는 ink, 제목 ink · 무엇이 바뀌나 ink-2(만드는 중이면 muted) · 날짜·출처 줄 muted', async () => {
    await shown()
    const classes = (el: Element | null) => (el?.getAttribute('class') ?? '').split(/\s+/)
    const link = within(rowOf(GOSI.title)).getByRole('link')
    expect(classes(link)).toContain('text-ink')
    expect(classes(within(link).getByText('11월 20일 (금)'))).toContain('text-muted')
    expect(classes(within(link).getByTestId('notice-title'))).toContain('text-ink')
    expect(classes(within(link).getByText(GOSI.summary!.what))).toContain('text-ink-2')
    expect(classes(within(link).getByText('보건복지부 · 심평원 심사기준').parentElement)).toContain('text-muted')
    expect(classes(within(rowOf(WAITING.title)).getByText('요약을 만드는 중이에요.'))).toContain('text-muted')
  })
})

describe('AC-7419.4: 지난 글 더 보기', () => {
  const many = (from: number, n: number) => Array.from({ length: n }, (_, i) => view({ id: id(1000 + from + i), title: `지난 글 ${from + i}` }))

  it('AC-7419.4: 50개 넘는 목록은 `지난 글 더 보기`로 다음 50개를 잇고 맨 아래 안내 글이 있다', async () => {
    const user = userEvent.setup()
    list.mockResolvedValueOnce(pageOf(many(0, 50), 120, 3))
    render(<NoticesScreen />)
    await screen.findByText('지난 글 0')
    expect(screen.getByText('2026년 1월 1일부터 모은 글이에요.')).toBeTruthy()
    list.mockResolvedValueOnce(pageOf(many(50, 50), 120, 3))
    await user.click(screen.getByRole('button', { name: '지난 글 더 보기' }))
    await screen.findByText('지난 글 99')
    expect(lastFilter()).toEqual({ related: true, sources: ALL_SOURCES, starred: false, q: '', offset: 50 })
    expect(screen.getByText('지난 글 0')).toBeTruthy()
    expect(screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/notices?id='))).toHaveLength(100)
    list.mockResolvedValueOnce(pageOf(many(100, 20), 120, 3))
    await user.click(screen.getByRole('button', { name: '지난 글 더 보기' }))
    await screen.findByText('지난 글 119')
    expect(lastFilter().offset).toBe(100)
    // 다 읽었으면 단추가 없고 안내 글은 남는다
    expect(screen.queryByRole('button', { name: '지난 글 더 보기' })).toBeNull()
    expect(screen.getByText('2026년 1월 1일부터 모은 글이에요.')).toBeTruthy()
  })

  it('AC-7419.4·AC-7419.8: 더 읽기가 실패하면 읽은 글은 그대로이고 E-NOTICE-READ 상자와 [다시 읽기]가 다음 50개를 다시 읽는다', async () => {
    const user = userEvent.setup()
    list.mockResolvedValueOnce(pageOf(many(0, 50), 60, 0))
    render(<NoticesScreen />)
    await screen.findByText('지난 글 0')
    list.mockResolvedValueOnce('failed')
    await user.click(screen.getByRole('button', { name: '지난 글 더 보기' }))
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('오류 번호 E-NOTICE-READ')).toBeTruthy()
    expect(screen.getByText('지난 글 0')).toBeTruthy()
    list.mockResolvedValueOnce(pageOf(many(50, 10), 60, 0))
    await user.click(screen.getByRole('button', { name: '다시 읽기' }))
    await screen.findByText('지난 글 59')
    expect(lastFilter().offset).toBe(50)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  // 다시 읽는 동안(고르기를 바꿈 · notices:changed) 화면에 남은 앞 쪽의 줄 수는 새 고르기의 자리가 아니다.
  // 그때 누른 `지난 글 더 보기`는 읽지 않고, 다시 읽기가 끝난 뒤에는 새 쪽의 줄 수(50)로 새 고르기의 다음 50개를 읽는다
  it.each([
    ['고르기를 바꿈(전체)', 'filter'],
    ['notices:changed', 'changed'],
  ] as const)('AC-7419.4·AC-7424.10: 다시 읽는 중(%s)에 `지난 글 더 보기`를 눌러도 앞 쪽의 줄 수로 읽지 않는다 — 끝난 뒤 새 쪽에서 이어 읽는다', async (_, trigger) => {
    const user = userEvent.setup()
    list.mockResolvedValueOnce(pageOf(many(0, 50), 200, 3))
    render(<NoticesScreen />)
    await screen.findByText('지난 글 0')
    // 앞 쪽을 100줄로 늘려 둔다(새 쪽 50줄과 달라야 잘못 이은 자리가 보인다)
    list.mockResolvedValueOnce(pageOf(many(50, 50), 200, 3))
    await user.click(screen.getByRole('button', { name: '지난 글 더 보기' }))
    await screen.findByText('지난 글 99')

    const slow = deferred<NoticePage | 'failed'>()
    list.mockReturnValueOnce(slow.promise)
    if (trigger === 'filter') await user.click(screen.getByRole('button', { name: '전체' }))
    else await act(async () => void window.dispatchEvent(new Event('notices:changed')))
    const related = trigger !== 'filter'
    await waitFor(() => expect(lastFilter()).toEqual({ related, sources: ALL_SOURCES, starred: false, q: '', offset: 0 }))
    const calls = list.mock.calls.length
    // 앞 쪽 100줄과 단추가 아직 보인다 — 눌러도 읽지 않는다
    expect(screen.getByText('지난 글 99')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '지난 글 더 보기' }))
    expect(list).toHaveBeenCalledTimes(calls)

    await act(async () => slow.resolve(pageOf(many(500, 50), 200, 3)))
    await screen.findByText('지난 글 500')
    expect(screen.queryByText('지난 글 99')).toBeNull()
    list.mockResolvedValueOnce(pageOf(many(550, 50), 200, 3))
    await user.click(screen.getByRole('button', { name: '지난 글 더 보기' }))
    await screen.findByText('지난 글 599')
    expect(list).toHaveBeenCalledTimes(calls + 1)
    expect(lastFilter()).toEqual({ related, sources: ALL_SOURCES, starred: false, q: '', offset: 50 })
    expect(screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/notices?id='))).toHaveLength(100)
  })
})

describe('AC-7419.5: 찾기', () => {
  it('AC-7419.5: Enter나 `찾기`는 지금 고르기 안에서 앞뒤 공백을 뗀 말로 찾는다', async () => {
    const user = userEvent.setup()
    await shown()
    await user.click(screen.getByRole('button', { name: '전체' }))
    await user.type(screen.getByRole('textbox', { name: '글 찾기' }), '  도수치료  {Enter}')
    await waitFor(() => expect(lastFilter()).toEqual({ related: false, sources: ALL_SOURCES, starred: false, q: '도수치료', offset: 0 }))
    await user.clear(screen.getByRole('textbox', { name: '글 찾기' }))
    await user.type(screen.getByRole('textbox', { name: '글 찾기' }), '체외충격파 어깨')
    await user.click(screen.getByRole('button', { name: '찾기' }))
    await waitFor(() => expect(lastFilter().q).toBe('체외충격파 어깨'))
    expect(screen.getByRole('textbox', { name: '글 찾기' }).getAttribute('maxlength')).toBe('50')
  })

  it('AC-7419.5: 관련 글만에서 없으면 안내 · `전체에서 찾기` · `찾기 지우기`이고, 전체에서 찾기는 같은 말로 전체를 찾는다', async () => {
    const user = userEvent.setup()
    await shown()
    list.mockResolvedValue(pageOf([], 0, 0))
    await user.type(screen.getByRole('textbox', { name: '글 찾기' }), '도수치료 횟수{Enter}')
    const box = await screen.findByRole('status')
    expect(within(box).getByText('‘도수치료 횟수’와 맞는 글이 없어요')).toBeTruthy()
    expect(
      within(box).getByText('제목·본문·붙임 파일 글자에서 찾았어요. 낱말을 더 짧게 하거나 띄어쓰기를 바꿔 보세요. 지금은 관련 글만 보고 있어요.'),
    ).toBeTruthy()
    await user.click(within(box).getByRole('button', { name: '전체에서 찾기' }))
    await waitFor(() => expect(lastFilter()).toEqual({ related: false, sources: ALL_SOURCES, starred: false, q: '도수치료 횟수', offset: 0 }))
    const allBox = await screen.findByRole('status')
    expect(within(allBox).getByText('제목·본문·붙임 파일 글자에서 찾았어요. 낱말을 더 짧게 하거나 띄어쓰기를 바꿔 보세요.')).toBeTruthy()
    expect(within(allBox).queryByRole('button', { name: '전체에서 찾기' })).toBeNull()
    list.mockResolvedValue(pageOf(ROWS, 1184, 5))
    await user.click(within(allBox).getByRole('button', { name: '찾기 지우기' }))
    await waitFor(() => expect(lastFilter().q).toBe(''))
    expect((screen.getByRole('textbox', { name: '글 찾기' }) as HTMLInputElement).value).toBe('')
    expect(await screen.findByText(byWhole('전체 1,184건 · 안 읽은 글 5건'))).toBeTruthy()
  })

  it('AC-7419.5: 별표만인데 글이 없으면 `별표한 글이 없어요` · `글 오른쪽 별을 누르면 여기에 모여요.`', async () => {
    const user = userEvent.setup()
    await shown()
    list.mockResolvedValue(pageOf([], 0, 0))
    await user.click(screen.getByRole('button', { name: '별표만' }))
    const box = await screen.findByRole('status')
    expect(within(box).getByText('별표한 글이 없어요')).toBeTruthy()
    expect(within(box).getByText('글 오른쪽 별을 누르면 여기에 모여요.')).toBeTruthy()
    expect(screen.queryByText('2026년 1월 1일부터 모은 글이에요.')).toBeNull()
  })

  it('AC-7419.5: 빈 칸으로 찾으면 찾기를 지운다(찾은 글 건수가 아니다)', async () => {
    const user = userEvent.setup()
    await shown()
    await user.type(screen.getByRole('textbox', { name: '글 찾기' }), '청구{Enter}')
    await waitFor(() => expect(lastFilter().q).toBe('청구'))
    await user.clear(screen.getByRole('textbox', { name: '글 찾기' }))
    await user.type(screen.getByRole('textbox', { name: '글 찾기' }), '   {Enter}')
    await waitFor(() => expect(lastFilter().q).toBe(''))
    expect(await screen.findByText(byWhole('관련 글 318건 · 안 읽은 글 2건'))).toBeTruthy()
  })
})

describe('AC-7419.6: 확인 줄 · 못 가져옴 띠', () => {
  it('AC-7419.6: `매일 아침 확인해요`와 출처마다 `{출처} 오늘 {시각} 확인`', async () => {
    await shown()
    expect(await screen.findByText('매일 아침 확인해요')).toBeTruthy()
    expect(screen.getByText(byWhole('심평원 공지 오늘 07:02 확인'))).toBeTruthy()
    expect(screen.getByText(byWhole('심평원 심사기준 오늘 07:02 확인'))).toBeTruthy()
    expect(screen.getByText(byWhole('보건복지부 오늘 07:03 확인'))).toBeTruthy()
    expect(screen.queryByText(/못 가져왔어요/)).toBeNull()
  })

  it('AC-7419.6: 멈춘 출처는 확인 줄에 `{출처}: 어제부터 못 가져왔어요`이고 띠(제목·글·게시판 열기 새 창)가 있다', async () => {
    states.mockResolvedValue([
      okSource('hira_notice'),
      okSource('hira_crtr'),
      { ...okSource('mohw_rss'), state: 'stopped', errorCode: 'shape', checkedAt: '2026-11-20T22:03:00Z', lastOkAt: '2026-11-18T22:03:00Z', stoppedSince: '2026-11-19T22:03:00Z' },
    ])
    await shown()
    const titles = await screen.findAllByText('보건복지부: 어제부터 못 가져왔어요')
    expect(titles).toHaveLength(2)
    const band = titles.map((t) => t.closest('[data-band="stopped"]')).find((b) => b !== null) as HTMLElement
    expect(band).toBeTruthy()
    expect(
      within(band).getByText(
        '보건복지부 게시판 모양이 바뀌었거나 잠시 막힌 것 같아요. 마지막으로 11월 19일 (목) 07:03에 가져왔어요. 다른 곳 글은 오늘 아침에도 잘 가져왔어요. 고쳐질 때까지 보건복지부 새 글은 직접 확인해 주세요.',
      ),
    ).toBeTruthy()
    const link = within(band).getByRole('link', { name: '보건복지부 게시판 열기' })
    expect(link.getAttribute('href')).toBe('https://www.mohw.go.kr/board.es?mid=a10409020000&bid=0026')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.getByText(byWhole('심평원 공지 오늘 07:02 확인'))).toBeTruthy()
  })

  it('AC-7419.6: 가져온 적이 없고 다른 곳도 오늘 성공하지 못했으면 두 문장을 뺀다(기본값 2)', async () => {
    states.mockResolvedValue([
      { ...okSource('hira_notice'), state: 'stopped', errorCode: 'http', lastOkAt: null, stoppedSince: '2026-11-20T22:02:00Z' },
      { ...okSource('hira_crtr'), state: 'stopped', errorCode: 'blocked', stoppedSince: '2026-11-20T22:02:00Z' },
      okSource('mohw_rss'),
    ])
    await shown()
    expect(
      await screen.findByText('심평원 공지 게시판 모양이 바뀌었거나 잠시 막힌 것 같아요. 고쳐질 때까지 심평원 공지 새 글은 직접 확인해 주세요.'),
    ).toBeTruthy()
    expect(screen.getAllByText('심평원 공지: 오늘부터 못 가져왔어요')).toHaveLength(2)
    expect(screen.getAllByText('심평원 심사기준: 오늘부터 못 가져왔어요')).toHaveLength(2)
  })

  it('AC-7419.6: 출처 상태를 못 읽어도 목록은 그대로 보인다', async () => {
    states.mockResolvedValue('failed')
    await shown()
    expect(screen.queryByText('매일 아침 확인해요')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('AC-7419.7: 처음 채우기 띠', () => {
  it('AC-7419.7: 채움 끝이 아닌 출처가 있으면 띠 · 진행 막대 · `지난 글 {전체}건 중 {채운}건 채웠어요 ({퍼센트}%)`(버림) · 안내 글', async () => {
    states.mockResolvedValue([{ ...okSource('hira_notice'), backfillDone: false }, okSource('hira_crtr'), okSource('mohw_rss')])
    fill.mockResolvedValue({ total: 1240, done: 530, batching: 0 })
    await shown()
    expect(await screen.findByText('올해 1월부터 지난 글을 채우는 중이에요')).toBeTruthy()
    expect(screen.getByText('지난 글 1,240건 중 530건 채웠어요 (42%)')).toBeTruthy()
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuemin')).toBe('0')
    expect(bar.getAttribute('aria-valuemax')).toBe('1240')
    expect(bar.getAttribute('aria-valuenow')).toBe('530')
    expect(bar.getAttribute('aria-label')).toBe('지난 글 1,240건 중 530건 채웠어요')
    expect(
      screen.getByText(
        '요약을 한꺼번에 만들고 있어 하루쯤 걸려요. 채운 글은 바로 볼 수 있어요. 요약이 아직 없는 글은 관련 여부를 몰라 관련 글만 보기에도 함께 보여요.',
      ),
    ).toBeTruthy()
  })

  it('AC-7419.7: 모든 출처가 채움 끝이어도 일괄 중인 글이 있으면 띠가 있다', async () => {
    fill.mockResolvedValue({ total: 1300, done: 1290, batching: 10 })
    await shown()
    expect(await screen.findByText('지난 글 1,300건 중 1,290건 채웠어요 (99%)')).toBeTruthy()
  })

  it('AC-7419.7: 모두 채움 끝이고 일괄 중인 글이 없으면 띠가 없다', async () => {
    await shown()
    await waitFor(() => expect(fill).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText('매일 아침 확인해요')).toBeTruthy())
    expect(screen.queryByText('올해 1월부터 지난 글을 채우는 중이에요')).toBeNull()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('AC-7419.7: 찾은 글이 0건이면 0%다', async () => {
    states.mockResolvedValue([{ ...okSource('hira_notice'), backfillDone: false }, okSource('hira_crtr'), okSource('mohw_rss')])
    fill.mockResolvedValue({ total: 0, done: 0, batching: 0 })
    await shown()
    expect(await screen.findByText('지난 글 0건 중 0건 채웠어요 (0%)')).toBeTruthy()
  })
})

describe('AC-7419.8: 목록 읽기 실패', () => {
  it('AC-7419.8: E-NOTICE-READ 오류 상자와 [다시 읽기]이고, 누르면 같은 고르기로 다시 읽는다', async () => {
    const user = userEvent.setup()
    list.mockResolvedValueOnce('failed')
    render(<NoticesScreen />)
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('고시·공지를 읽지 못했어요')).toBeTruthy()
    expect(within(alert).getByText('인터넷 연결을 확인하고 [다시 읽기]를 눌러 주세요')).toBeTruthy()
    expect(within(alert).getByText('오류 번호 E-NOTICE-READ')).toBeTruthy()
    expect(screen.queryByText(/안 읽은 글/)).toBeNull()
    await user.click(screen.getByRole('button', { name: '다시 읽기' }))
    await screen.findByText(GOSI.title)
    expect(list).toHaveBeenCalledTimes(2)
    expect(lastFilter()).toEqual({ related: true, sources: ALL_SOURCES, starred: false, q: '', offset: 0 })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-7419.8: 늦게 온 앞 고르기 답은 버린다(마지막 고르기의 답만 그린다)', async () => {
    const user = userEvent.setup()
    await shown()
    const slow = deferred<NoticePage | 'failed'>()
    list.mockReturnValueOnce(slow.promise)
    await user.click(screen.getByRole('button', { name: '전체' }))
    list.mockResolvedValueOnce(pageOf([CASE], 1, 0))
    await user.click(screen.getByRole('button', { name: '별표만' }))
    await screen.findByText(byWhole('전체 1건 · 안 읽은 글 0건'))
    await act(async () => slow.resolve(pageOf(ROWS, 999, 9)))
    expect(screen.queryByText(GOSI.title)).toBeNull()
    expect(screen.getByText(byWhole('전체 1건 · 안 읽은 글 0건'))).toBeTruthy()
  })
})

describe('AC-7424.10: 내 낱말 자리 · 꼭 볼 글 칩', () => {
  it('AC-7424.10: 쪽 파일이 넣는 keywords 부품을 고르기 줄 `별표만` 바로 뒤에 그린다', async () => {
    await shown(<NoticesScreen keywords={<button type="button">내 낱말 4개</button>} />)
    const slot = screen.getByRole('button', { name: '내 낱말 4개' })
    expect(screen.getByRole('button', { name: '별표만' }).nextElementSibling).toBe(slot)
  })

  it('AC-7424.10: keywords 부품이 없으면 `별표만` 뒤는 찾기 칸이다', async () => {
    await shown()
    const after = screen.getByRole('button', { name: '별표만' }).nextElementSibling as HTMLElement
    expect(within(after).getByRole('textbox', { name: '글 찾기' })).toBeTruthy()
  })

  it('AC-7424.10: 줄의 keywords는 `mustSeeText(keywords, 2)` 칩(진한 파랑)으로 다른 칩 맨 앞에 그린다', async () => {
    await shown()
    const chips = within(rowOf(CASE.title)).getAllByTestId('notice-chip')
    expect(chips[0].textContent).toBe('꼭 볼 글 · 체외충격파·도수치료 외 1개')
    expect(chips[0].className).toContain('bg-accent-strong')
    expect(chips[0].className).toContain('text-surface')
    expect(chips.map((c) => c.textContent)).toEqual(['꼭 볼 글 · 체외충격파·도수치료 외 1개', '정형외과 의원 관련'])
  })

  it('AC-7424.10: 저장소가 준 줄을 related로 다시 거르지 않는다(AI가 관련 아님으로 본 꼭 볼 글도 관련 글만에 보인다)', async () => {
    await shown()
    const row = rowOf(MUST.title)
    expect(within(row).getAllByTestId('notice-chip').map((c) => c.textContent)).toEqual(['꼭 볼 글 · 도수치료'])
    expect(screen.getByRole('button', { name: '관련 글만' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getAllByTestId('notice-title')).toHaveLength(ROWS.length)
  })

  it('AC-7424.10: `notices:changed`가 오면 지금 고르기로 목록을 다시 읽는다', async () => {
    const user = userEvent.setup()
    await shown()
    await user.click(screen.getByRole('button', { name: '전체' }))
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
    list.mockResolvedValue(pageOf([MUST], 1, 0))
    await act(async () => {
      window.dispatchEvent(new Event('notices:changed'))
    })
    await waitFor(() => expect(list).toHaveBeenCalledTimes(3))
    expect(lastFilter()).toEqual({ related: false, sources: ALL_SOURCES, starred: false, q: '', offset: 0 })
    expect(await screen.findByText(byWhole('전체 1건 · 안 읽은 글 0건'))).toBeTruthy()
    expect(screen.queryByText(GOSI.title)).toBeNull()
  })

  it('AC-7424.10: 화면을 떠나면 `notices:changed`를 더 듣지 않는다', async () => {
    const { unmount } = await shown()
    unmount()
    const calls = list.mock.calls.length
    window.dispatchEvent(new Event('notices:changed'))
    expect(list).toHaveBeenCalledTimes(calls)
  })
})

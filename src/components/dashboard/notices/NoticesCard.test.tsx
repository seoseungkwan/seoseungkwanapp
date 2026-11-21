// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleProvider } from '@/components/shell/role'
import { ds } from '@/components/ui/classes'
import { listNotices, NOTICES_CHANGED, sourceStates, unreadCount } from '@/lib/storage/notices'
import type { NoticePage, NoticeView, SourceView } from '@/types/notices'
import { NoticesCard } from './NoticesCard'

// 대시보드 '고시·공지' 칸(specs/notices TASK-20 · AC-7422.2 · AC-7424.12 · 기본값 1·9·11·21, 시안 ?s=dashboard .ncard).
// 저장소만 가짜이고 글자 도구(lib/notices/view)는 진짜다. 글 제목·숫자는 지어낸 예시이고 환자 자료가 없다
vi.mock('@/lib/storage/notices', () => ({
  NOTICES_CHANGED: 'notices:changed',
  unreadCount: vi.fn(),
  listNotices: vi.fn(),
  sourceStates: vi.fn(),
}))

const count = vi.mocked(unreadCount)
const list = vi.mocked(listNotices)
const states = vi.mocked(sourceStates)

// 한국 시각 2026-11-21 (토) 09:20
const NOW = new Date('2026-11-21T00:20:00Z')

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const HIRA_URL = 'https://www.hira.or.kr/bbsDummy.do?pgmid=HIRAA020002000100&brdScnBltNo=4&brdBltNo=1'
const MOHW_URL = 'https://www.mohw.go.kr/board.es?mid=a10409020000&bid=0026&list_no=1'
const CRTR_URL = 'https://www.hira.or.kr/rc/insu/insuadtcrtr/InsuAdtCrtrPopup.do?mtgHmeDd=1&sno=1&mtgMtrRegSno=1'

function view(over: Partial<NoticeView> = {}): NoticeView {
  return {
    id: id(1),
    title: '요양기관 업무포털 일시 중단 안내',
    kind: 'notice',
    postedOn: '2026-11-17',
    noticeNo: null,
    related: true,
    summary: { related: true, what: '새벽에는 청구 파일을 보낼 수 없어요.', when: '', who: '', forUs: '', amends: [] },
    readMode: 'body',
    state: 'done',
    ruleHits: [],
    posts: [{ source: 'hira_notice', title: '요양기관 업무포털 일시 중단 안내', url: HIRA_URL, postedOn: '2026-11-17', attachments: [] }],
    mark: { readAt: null, starred: false, memo: '', memoAt: null, rulesCheckedAt: null },
    unread: true,
    keywords: [],
    ...over,
  }
}

// 시안 '대시보드 새 칸'의 두 줄(최근 글부터)
const GOSI = view({
  id: id(218),
  title: '「요양급여의 적용기준 및 방법에 관한 세부사항」 일부개정 — 관절강내 주사 인정기준',
  kind: 'gosi',
  postedOn: '2026-11-20',
  noticeNo: '2026-218',
  ruleHits: [
    { id: 'INJ-01', title: '스테로이드 관절강내주사 같은 관절 1년 횟수' },
    { id: 'INJ-02', title: '스테로이드 관절강내주사 1개월 관절 수' },
  ],
  posts: [
    { source: 'hira_crtr', title: '관절강내 주사', url: CRTR_URL, postedOn: '2026-11-20', attachments: [] },
    { source: 'mohw_rss', title: '보건복지부 고시 제2026-218호', url: MOHW_URL, postedOn: '2026-11-20', attachments: [] },
  ],
})
const NEWS = view({
  id: id(2),
  title: '2026년 12월 진료분 요양급여비용 청구·지급 일정 안내',
  postedOn: '2026-11-20',
  posts: [{ source: 'hira_notice', title: '청구 일정', url: HIRA_URL, postedOn: '2026-11-20', attachments: [] }],
})
// 이미 읽은 글: 목록에는 오지만 칸 줄에는 들지 않는다
const READ = view({ id: id(3), title: '이미 읽은 공지', postedOn: '2026-11-19', unread: false, mark: { readAt: '2026-11-19T01:00:00Z', starred: false, memo: '', memoAt: null, rulesCheckedAt: null } })
// 규칙을 이미 확인한 고시: 칩이 없다
const CHECKED = view({
  id: id(214),
  title: '「건강보험 행위 급여·비급여 목록표」 일부개정 — 물리치료',
  kind: 'gosi',
  postedOn: '2026-11-18',
  noticeNo: '2026-214',
  ruleHits: [{ id: 'PT-01', title: '표층열 + 심층열' }],
  posts: [{ source: 'mohw_rss', title: '물리치료', url: MOHW_URL, postedOn: '2026-11-18', attachments: [] }],
  mark: { readAt: null, starred: false, memo: '', memoAt: null, rulesCheckedAt: '2026-11-18T23:40:00Z' },
})
// AI는 관련 아님으로 봤지만 내 낱말이 맞아 저장소가 준 글(AC-7424.12)
const MUST = view({
  id: id(4),
  title: '한방병원 추나요법·도수 치료 같은 날 청구 점검 결과 안내',
  postedOn: '2026-11-19',
  related: false,
  summary: { related: false, what: '한방병원 점검 결과예요.', when: '', who: '', forUs: '', amends: [] },
  keywords: ['도수치료'],
})
const extra = (n: number) => view({ id: id(100 + n), title: `그 밖의 안내 ${n}`, postedOn: '2026-11-16' })

const page = (rows: NoticeView[], unread = rows.filter((r) => r.unread).length): NoticePage => ({ total: rows.length, unread, rows })

const source = (over: Partial<SourceView>): SourceView => ({
  source: 'hira_notice',
  state: 'ok',
  errorCode: null,
  checkedAt: null,
  lastOkAt: null,
  stoppedSince: null,
  backfillDone: true,
  ...over,
})
// 셋 다 오늘 아침 확인. 가장 늦은 확인은 07:03
const STATES: SourceView[] = [
  source({ source: 'hira_notice', checkedAt: '2026-11-20T22:02:00Z' }),
  source({ source: 'hira_crtr', checkedAt: '2026-11-20T22:03:00Z' }),
  source({ source: 'mohw_rss', checkedAt: '2026-11-20T22:01:00Z' }),
]

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const settle = () => act(async () => {})
const draw = () => render(<NoticesCard />)
const card = () => screen.getByRole('region', { name: '고시·공지' })
const rows = () => within(card()).queryAllByRole('listitem')
const rowLinks = () => rows().map((li) => within(li).getByRole('link'))

function given(n: number | 'failed', listed: NoticeView[] | 'failed', srcs: SourceView[] | 'failed' = STATES) {
  count.mockResolvedValue(n)
  list.mockResolvedValue(listed === 'failed' ? 'failed' : page(listed))
  states.mockResolvedValue(srcs)
}

beforeEach(() => {
  count.mockReset()
  list.mockReset()
  states.mockReset()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("NoticesCard — 대시보드 '고시·공지' 칸 (AC-7422.2)", () => {
  it('AC-7422.2: 칸 `고시·공지` · `새 관련 글 {n}건` · `고시·공지 열기`(/notices)와 안 읽은 관련 글 줄(날짜·제목·출처, 확인 안 한 규칙 연결이면 `점검 규칙 확인 필요` 칩, 누르면 그 글)이다', async () => {
    given(2, [GOSI, NEWS])
    draw()
    await settle()
    expect(within(card()).getByRole('heading', { level: 2, name: '고시·공지' })).toBeTruthy()
    expect(within(card()).getByText('새 관련 글 2건')).toBeTruthy()
    expect(within(card()).getByRole('link', { name: '고시·공지 열기' }).getAttribute('href')).toBe('/notices')

    expect(rows()).toHaveLength(2)
    const [first, second] = rows() as [HTMLElement, HTMLElement]
    expect(within(first).getByText('11월 20일 (금)')).toBeTruthy()
    expect(within(first).getByText(GOSI.title)).toBeTruthy()
    expect(within(first).getByText('보건복지부 · 심평원 심사기준')).toBeTruthy()
    const chip = within(first).getByText('점검 규칙 확인 필요')
    expect(chip.className).toBe(ds.chip.warning)
    expect(within(second).getByText(NEWS.title)).toBeTruthy()
    expect(within(second).getByText('심평원 공지')).toBeTruthy()
    expect(within(second).queryByText('점검 규칙 확인 필요')).toBeNull()
    expect(rowLinks().map((a) => a.getAttribute('href'))).toEqual([`/notices?id=${GOSI.id}`, `/notices?id=${NEWS.id}`])
    expect(within(card()).queryByText(/^그 밖에/)).toBeNull()
  })

  it('AC-7422.2: 링크는 모두 밑줄이 없고(no-underline, 제목 밑줄은 올림 반응뿐) 목록은 점이 없다(list-none) — 앱에는 a 밑줄·목록 점을 지우는 바탕 규칙이 없다(시안 .ncard)', async () => {
    given(2, [GOSI, NEWS])
    draw()
    await settle()
    const classes = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/)
    const links = within(card()).getAllByRole('link')
    // 고시·공지 열기 하나 · 줄마다 하나
    expect(links).toHaveLength(1 + 2)
    for (const a of links) expect(classes(a), a.textContent ?? '').toContain('no-underline')
    // 고시·공지 열기는 글자 단추 모양 그대로 + no-underline(대시보드 다른 글자 단추 링크와 같다)
    expect(classes(within(card()).getByRole('link', { name: '고시·공지 열기' }))).toEqual(expect.arrayContaining([...ds.textButton.split(/\s+/), 'no-underline']))
    // 줄 링크 안 글은 링크 색이 아니다: 링크 ink, 날짜·출처 muted, 제목 ink(올림 때만 밑줄)
    const link = rowLinks()[0]!
    expect(classes(link)).toContain('text-ink')
    expect(classes(within(link).getByText('11월 20일 (금)'))).toContain('text-muted')
    expect(classes(within(link).getByText(GOSI.title))).toEqual(expect.arrayContaining(['text-ink', 'group-hover:underline']))
    const lists = Array.from(card().querySelectorAll('ul, ol'))
    expect(lists).toHaveLength(1)
    for (const ul of lists) expect(classes(ul)).toContain('list-none')
  })

  it('AC-7422.2: 관련 글만(전체 출처·별표 없음·찾기 없음·첫 쪽)을 읽고, 안 읽은 글만 차례대로 줄로 놓는다(읽은 글·규칙을 확인한 글의 칩은 없음)', async () => {
    given(2, [GOSI, READ, CHECKED])
    draw()
    await settle()
    expect(list).toHaveBeenCalledWith({ related: true, sources: ['hira_notice', 'hira_crtr', 'mohw_rss'], starred: false, q: '', offset: 0 })
    expect(count).toHaveBeenCalledTimes(1)
    expect(rows()).toHaveLength(2)
    expect(within(rows()[0]!).getByText(GOSI.title)).toBeTruthy()
    expect(within(rows()[1]!).getByText(CHECKED.title)).toBeTruthy()
    expect(within(card()).queryByText(READ.title)).toBeNull()
    expect(within(rows()[1]!).queryByText('점검 규칙 확인 필요')).toBeNull()
  })

  it('AC-7422.2: 넘치면 3줄까지와 `그 밖에 {n}건`(n = 안 읽은 수 − 놓은 줄)이다', async () => {
    given(5, [GOSI, NEWS, extra(1), extra(2), extra(3)])
    draw()
    await settle()
    expect(within(card()).getByText('새 관련 글 5건')).toBeTruthy()
    expect(rows()).toHaveLength(3)
    expect(within(card()).getByText('그 밖에 2건')).toBeTruthy()
  })

  it('AC-7422.2·기본값 1: 0건이면 줄 대신 `새 관련 글이 없어요 · 오늘 {시각} 확인`(가장 늦은 출처 확인 시각)이고 건수 글은 없다', async () => {
    given(0, [READ])
    draw()
    await settle()
    expect(within(card()).getByText('새 관련 글이 없어요 · 오늘 07:03 확인')).toBeTruthy()
    expect(within(card()).queryByText(/^새 관련 글 \d+건$/)).toBeNull()
    expect(rows()).toEqual([])
    expect(within(card()).getByRole('link', { name: '고시·공지 열기' })).toBeTruthy()
  })

  it('AC-7422.2·기본값 1: 마지막 확인이 어제면 `어제 {시각}`, 출처 상태를 못 읽었거나 확인한 적이 없으면 시각 없이 `새 관련 글이 없어요`다', async () => {
    given(0, [], [source({ source: 'hira_notice', checkedAt: '2026-11-19T22:05:00Z' }), source({ source: 'mohw_rss', checkedAt: null })])
    const yesterday = draw()
    await settle()
    expect(within(card()).getByText('새 관련 글이 없어요 · 어제 07:05 확인')).toBeTruthy()
    yesterday.unmount()

    given(0, [], 'failed')
    const failed = draw()
    await settle()
    expect(within(card()).getByText('새 관련 글이 없어요')).toBeTruthy()
    failed.unmount()

    given(0, [], [source({ checkedAt: null })])
    draw()
    await settle()
    expect(within(card()).getByText('새 관련 글이 없어요')).toBeTruthy()
  })

  it('AC-7422.2·기본값 9: 안 읽은 수나 목록을 못 읽으면 그 칸만 `고시·공지를 불러오지 못했어요`이고 제목·`고시·공지 열기`는 그대로다', async () => {
    given('failed', [GOSI])
    const first = draw()
    await settle()
    expect(within(card()).getByText('고시·공지를 불러오지 못했어요')).toBeTruthy()
    expect(within(card()).getByRole('heading', { level: 2, name: '고시·공지' })).toBeTruthy()
    expect(within(card()).getByRole('link', { name: '고시·공지 열기' })).toBeTruthy()
    expect(within(card()).queryByText(/^새 관련 글/)).toBeNull()
    expect(rows()).toEqual([])
    first.unmount()

    given(2, 'failed')
    draw()
    await settle()
    expect(within(card()).getByText('고시·공지를 불러오지 못했어요')).toBeTruthy()
    expect(rows()).toEqual([])
  })

  it('AC-7424.12: 저장소가 준 related false · keywords 있는 안 읽은 글이 수와 줄에 든다(화면이 related로 다시 거르지 않음, 꼭 볼 글 칩 없음)', async () => {
    given(2, [NEWS, MUST])
    draw()
    await settle()
    expect(within(card()).getByText('새 관련 글 2건')).toBeTruthy()
    expect(rows()).toHaveLength(2)
    expect(within(rows()[1]!).getByText(MUST.title)).toBeTruthy()
    expect(within(card()).queryByText(/꼭 볼 글/)).toBeNull()
  })

  it('AC-7422.2: 읽는 중에는 칸을 놓지 않는다', async () => {
    const wait = deferred<number | 'failed'>()
    count.mockReturnValue(wait.promise)
    list.mockResolvedValue(page([GOSI]))
    states.mockResolvedValue(STATES)
    const { container } = draw()
    await settle()
    expect(container.innerHTML).toBe('')
    await act(async () => wait.resolve(1))
    expect(rows()).toHaveLength(1)
  })

  it('AC-7422.2: notices:changed마다 다시 읽어 수와 줄을 바꾼다(늦게 온 앞 읽기의 답은 버리고, 떠난 뒤에는 듣지 않는다)', async () => {
    given(2, [GOSI, NEWS])
    const view = draw()
    await settle()
    expect(rows()).toHaveLength(2)

    const late = deferred<number | 'failed'>()
    count.mockReturnValueOnce(late.promise)
    await act(async () => {
      window.dispatchEvent(new Event(NOTICES_CHANGED))
    })
    given(1, [NEWS])
    await act(async () => {
      window.dispatchEvent(new Event(NOTICES_CHANGED))
    })
    expect(within(card()).getByText('새 관련 글 1건')).toBeTruthy()
    await act(async () => late.resolve(9))
    expect(within(card()).getByText('새 관련 글 1건')).toBeTruthy()
    expect(rows()).toHaveLength(1)

    view.unmount()
    const calls = count.mock.calls.length
    window.dispatchEvent(new Event(NOTICES_CHANGED))
    expect(count).toHaveBeenCalledTimes(calls)
  })

  it('AC-7422.2: 바깥 글 제목은 글자로만 그린다(HTML로 해석하지 않음)', async () => {
    given(1, [view({ id: id(9), title: '<b>굵게</b><img src=x onerror=alert(1)>' })])
    draw()
    await settle()
    expect(within(card()).getByText('<b>굵게</b><img src=x onerror=alert(1)>')).toBeTruthy()
    expect(card().querySelector('img')).toBeNull()
    expect(card().querySelector('b')).toBeNull()
  })

  it('AC-7422.2: 데스크 계정(RoleProvider desk)에게는 칸을 그리지 않고 읽지도 않는다', async () => {
    given(2, [GOSI, NEWS])
    const { container } = render(
      <RoleProvider desk>
        <NoticesCard />
      </RoleProvider>,
    )
    await settle()
    window.dispatchEvent(new Event(NOTICES_CHANGED))
    await settle()
    expect(container.innerHTML).toBe('')
    expect(count).not.toHaveBeenCalled()
    expect(list).not.toHaveBeenCalled()
    expect(states).not.toHaveBeenCalled()
  })
})

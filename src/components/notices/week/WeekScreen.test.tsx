// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { isValidElement, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import NoticesWeekPage, { dynamic, metadata } from '@/app/(app)/notices/week/page'
import type { Me } from '@/lib/auth/hospital.server'
import { readWeek } from '@/lib/storage/notices'
import type { NoticeWeek, WeekItem } from '@/types/notices'
import { WeekScreen } from './WeekScreen'

// 고시·공지 주간 모음 /notices/week (specs/notices TASK-19 · REQ-7421, design 10절, 시안 docs/mockups/notices ?s=weekly).
// 저장소만 가짜이고 글자 도구(lib/notices/view)·날짜(lib/analytics/dates)는 진짜다. 글 제목·요약·숫자는 지어낸 예시이고 환자 자료가 없다
vi.mock('@/lib/storage/notices', () => ({ readWeek: vi.fn() }))
// 쪽 파일의 문지기 읽기(요청 안 한 번)는 가짜다. 문지기와 앱 틀(데스크 막힌 화면)은 (app)/layout·DeskGate 시험이 본다
const { currentMe } = vi.hoisted(() => ({ currentMe: vi.fn<() => Promise<Me>>() }))
vi.mock('@/app/(app)/currentMe.server', () => ({ currentMe }))

const read = vi.mocked(readWeek)

// 한국 날짜 2026-11-21 (토) → 가장 최근 모음 주는 지난주 월요일 2026-11-09
const TODAY = '2026-11-21'
const NAME = '가나 정형외과의원'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function item(over: Partial<WeekItem> = {}): WeekItem {
  return {
    id: id(1),
    title: '요양기관 현황 신고 기한 안내 (인력·장비 변경)',
    kind: 'notice',
    postedOn: '2026-11-10',
    related: true,
    summary: {
      related: true,
      what: '인력·장비가 바뀌었으면 11월 30일까지 신고해야 해요.',
      when: '2026년 11월 30일까지',
      who: '모든 요양기관',
      forUs: '물리치료사가 바뀌었으면 신고해 주세요.',
      amends: [],
    },
    state: 'done',
    posts: [{ source: 'hira_notice' }],
    ...over,
  }
}

const OSTEO = item({
  id: id(11),
  title: '골다공증 치료제 연장 투여 인정 여부 행정해석',
  kind: 'interp',
  postedOn: '2026-11-13',
  summary: {
    related: true,
    what: '연장 투여를 인정받으려면 추적 골밀도 결과가 있어야 한다는 해석이에요.',
    when: '',
    who: '골다공증 약을 처방하는 요양기관',
    forUs: '연장 처방 전 추적 골밀도를 확인해 주세요.',
    amends: [],
  },
  posts: [{ source: 'hira_crtr' }],
})
const GOSI = item({
  id: id(12),
  title: '「요양급여의 적용기준 및 방법에 관한 세부사항」 일부개정 — 도수치료',
  kind: 'gosi',
  postedOn: '2026-11-11',
  summary: {
    related: true,
    what: '주 2회를 세는 방법이 월요일~일요일로 정해져요.',
    when: '2026년 12월 1일 진료분부터',
    who: '의원 포함',
    forUs: '도수치료 청구 횟수를 주 단위로 확인해 주세요.',
    amends: [],
  },
  // 출처 글 차례와 상관없이 제목 차례(보건복지부 먼저)로 적는다
  posts: [{ source: 'hira_crtr' }, { source: 'mohw_rss' }],
})
const REPORT = item({ id: id(13) })
const DENTAL = item({
  id: id(21),
  title: '「치과 건강보험 요양급여 기준」 일부개정',
  postedOn: '2026-11-13',
  related: false,
  summary: { related: false, what: '치과 급여 기준이 바뀌어요.', when: '', who: '치과', forUs: '', amends: [] },
  posts: [{ source: 'mohw_rss' }],
})
// 요약을 아직 만들지 못한 글(관련 여부 모름) → 그 밖의 글
const WAITING = item({ id: id(22), title: '장기요양기관 평가 일정 안내', postedOn: '2026-11-10', related: null, summary: null, state: 'failed' })
const MENTAL = item({
  id: id(23),
  title: '정신건강의학과 수가 시범사업 공모',
  postedOn: '2026-11-09',
  related: false,
  summary: { related: false, what: '정신건강의학과 시범사업이에요.', when: '', who: '', forUs: '', amends: [] },
})

const WEEK: NoticeWeek = {
  weekStart: '2026-11-09',
  // 한국 시각 2026-11-16 (월) 07:10
  createdAt: '2026-11-15T22:10:00Z',
  top3: [
    { head: '도수치료 기준이 12월부터 바뀌어요', body: '주 2회를 세는 방법(월요일~일요일)이 고시에 들어갔어요.' },
    { head: '인력·장비가 바뀌었으면 11월 30일까지 신고하세요', body: '늦게 신고하면 그동안 청구한 것이 깎일 수 있어요.' },
    { head: '골다공증 약 연장 투여는 추적 골밀도가 있어야 해요', body: '연장 투여를 인정받으려면 추적 골밀도 결과가 있어야 해요.' },
  ],
  // 저장소가 준 차례(최근 글부터) 그대로 그린다
  items: [OSTEO, DENTAL, GOSI, REPORT, WAITING, MENTAL],
}

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

// 여러 요소로 나뉜 글을 통째로 찾는다(가장 안쪽 요소 하나)
const byWhole = (text: string) => (_: string, el: Element | null) =>
  el !== null && el.textContent === text && Array.from(el.children).every((c) => c.textContent !== text)

const region = (name: string) => screen.getByRole('region', { name })
const eachItems = () => within(region('글별 요약 정형외과 의원 관련 3건')).getAllByRole('listitem')
const itemOf = (title: string) => screen.getByText(title).closest('li') as HTMLElement

async function shown(props: Partial<Parameters<typeof WeekScreen>[0]> = {}) {
  const view = render(<WeekScreen hospitalName={NAME} today={TODAY} {...props} />)
  await screen.findByRole('heading', { level: 2, name: '고시·공지 주간 모음' })
  return view
}

beforeEach(() => {
  read.mockReset().mockResolvedValue(WEEK)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AC-7421.1: 모음이 있는 주', () => {
  it('AC-7421.1: 쪽 머리·작은 탭(주간 모음 지금 쪽, 글 목록 링크)이 있다', async () => {
    await shown()
    expect(screen.getByRole('heading', { level: 1, name: '고시·공지' })).toBeTruthy()
    expect(screen.getByText('심평원·보건복지부 새 글을 매일 아침 모아 AI가 요약해요.')).toBeTruthy()
    const tabs = screen.getByRole('navigation', { name: '고시·공지' })
    const mine = within(tabs).getByRole('link', { name: '주간 모음' })
    expect(mine.getAttribute('aria-current')).toBe('page')
    expect(mine.getAttribute('href')).toBe('/notices/week')
    const list = within(tabs).getByRole('link', { name: '글 목록' })
    expect(list.getAttribute('href')).toBe('/notices')
    expect(list.getAttribute('aria-current')).toBeNull()
  })

  it('AC-7421.1: 기본은 가장 최근 모음을 읽는다(readWeek("latest") 한 번)', async () => {
    await shown()
    expect(read).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledWith('latest')
  })

  it('AC-7421.1: ?w=<월요일>이면 그 주를 읽고, 월요일 날짜가 아니면 가장 최근 모음을 읽는다', async () => {
    read.mockResolvedValue({ ...WEEK, weekStart: '2026-11-02', createdAt: '2026-11-08T22:05:00Z', items: [] })
    await shown({ week: '2026-11-02' })
    expect(read).toHaveBeenLastCalledWith('2026-11-02')
    cleanup()
    for (const bad of ['2026-11-03', '2026-02-30', 'latest-ish', '']) {
      read.mockClear()
      await shown({ week: bad })
      expect(read, bad).toHaveBeenCalledWith('latest')
      cleanup()
    }
  })

  it('AC-7421.1: 모음 머리 — 제목 · `{기간} · 새 글 {n}건 · 정형외과 의원 관련 {r}건` · `{날짜} 아침에 AI가 정리했어요 · {병원 이름}`', async () => {
    await shown()
    expect(screen.getByRole('heading', { level: 2, name: '고시·공지 주간 모음' })).toBeTruthy()
    expect(screen.getByText(byWhole('11월 9일 (월) ~ 11월 15일 (일) · 새 글 6건 · 정형외과 의원 관련 3건'))).toBeTruthy()
    // 기간은 굵게
    expect(screen.getByText('11월 9일 (월) ~ 11월 15일 (일)', { selector: 'b' })).toBeTruthy()
    expect(screen.getByText(byWhole('11월 16일 (월) 아침에 AI가 정리했어요 · 가나 정형외과의원'))).toBeTruthy()
  })

  it('AC-7421.1: 이번 주 꼭 알 것 3가지 — 번호와 머리·글을 받은 차례대로', async () => {
    await shown()
    const top = region('이번 주 꼭 알 것 3가지')
    expect(within(top).getByRole('heading', { level: 3, name: '이번 주 꼭 알 것 3가지' })).toBeTruthy()
    const rows = within(top).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    WEEK.top3.forEach((t, i) => {
      expect(within(rows[i]!).getByText(String(i + 1))).toBeTruthy()
      expect(within(rows[i]!).getByText(t.head)).toBeTruthy()
      expect(within(rows[i]!).getByText(t.body)).toBeTruthy()
    })
  })

  it('AC-7421.1: 글별 요약 `정형외과 의원 관련 {n}건` — 관련 글만, 받은 차례대로, 글마다 날짜·출처·제목', async () => {
    await shown()
    expect(screen.getByRole('heading', { level: 3, name: '글별 요약 정형외과 의원 관련 3건' })).toBeTruthy()
    const rows = eachItems()
    expect(rows).toHaveLength(3)
    const titles = [OSTEO.title, GOSI.title, REPORT.title]
    rows.forEach((li, i) => expect(within(li).getByText(titles[i]!)).toBeTruthy())
    const gosi = itemOf(GOSI.title)
    expect(within(gosi).getByText('11월 11일 (수)')).toBeTruthy()
    expect(within(gosi).getByText('보건복지부 · 심평원 심사기준')).toBeTruthy()
    expect(within(itemOf(OSTEO.title)).getByText('심평원 심사기준')).toBeTruthy()
    expect(within(itemOf(REPORT.title)).getByText('심평원 공지')).toBeTruthy()
  })

  it('AC-7421.1: 글별 요약의 글마다 세 줄(무엇이 바뀌나·언제부터·누구 대상)과 우리 의원에는. 빈 줄은 그리지 않는다', async () => {
    await shown()
    const gosi = itemOf(GOSI.title)
    for (const [label, value] of [
      ['무엇이 바뀌나', GOSI.summary!.what],
      ['언제부터', GOSI.summary!.when],
      ['누구 대상', GOSI.summary!.who],
      ['우리 의원에는', GOSI.summary!.forUs],
    ]) {
      expect(within(gosi).getByText(label!)).toBeTruthy()
      expect(within(gosi).getByText(value!)).toBeTruthy()
    }
    // when이 빈 글은 '언제부터' 줄이 없다
    const osteo = itemOf(OSTEO.title)
    expect(within(osteo).queryByText('언제부터')).toBeNull()
    expect(within(osteo).getByText(OSTEO.summary!.what)).toBeTruthy()
    expect(within(osteo).getByText(OSTEO.summary!.forUs)).toBeTruthy()
  })

  it('AC-7421.1: 그 밖의 글 {n}건 — 관련 아님·관련 여부 모름 글의 날짜와 제목만(요약 없음)', async () => {
    await shown()
    const others = region('그 밖의 글 3건')
    expect(within(others).getByRole('heading', { level: 3, name: '그 밖의 글 3건' })).toBeTruthy()
    const rows = within(others).getAllByRole('listitem')
    expect(rows.map((li) => li.textContent)).toEqual([`11월 13일${DENTAL.title}`, `11월 10일${WAITING.title}`, `11월 9일${MENTAL.title}`])
    expect(screen.queryByText(DENTAL.summary!.what)).toBeNull()
    expect(screen.queryByText(MENTAL.summary!.what)).toBeNull()
  })

  it('AC-7421.1: 맨 아래 주의 글', async () => {
    await shown()
    expect(screen.getByText('AI가 만든 정리라 틀릴 수 있어요. 중요한 내용은 원문에서 꼭 확인해 주세요.')).toBeTruthy()
  })

  it('AC-7421.1·기본값 15: 관련 글이 0개인 주는 꼭 알 것 칸이 없고 글별 요약 옆은 `정형외과 의원 관련 0건`이다', async () => {
    read.mockResolvedValue({ ...WEEK, top3: [], items: [DENTAL, MENTAL] })
    await shown()
    expect(screen.queryByText('이번 주 꼭 알 것 3가지')).toBeNull()
    expect(screen.getByRole('heading', { level: 3, name: '글별 요약 정형외과 의원 관련 0건' })).toBeTruthy()
    expect(within(region('글별 요약 정형외과 의원 관련 0건')).queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByText(byWhole('11월 9일 (월) ~ 11월 15일 (일) · 새 글 2건 · 정형외과 의원 관련 0건'))).toBeTruthy()
    expect(within(region('그 밖의 글 2건')).getAllByRole('listitem')).toHaveLength(2)
  })

  it('AC-7421.1·기본값 15: 관련 글이 있어도 AI 정리(top3)가 비면 꼭 알 것 칸을 그리지 않는다', async () => {
    read.mockResolvedValue({ ...WEEK, top3: [] })
    await shown()
    expect(screen.queryByText('이번 주 꼭 알 것 3가지')).toBeNull()
    expect(eachItems()).toHaveLength(3)
  })

  it('AC-7421.1·기본값 15: 병원 이름이 없으면 ` · {병원 이름}`을 뺀다', async () => {
    await shown({ hospitalName: '  ' })
    expect(screen.getByText(byWhole('11월 16일 (월) 아침에 AI가 정리했어요'))).toBeTruthy()
    expect(screen.queryByText(/아침에 AI가 정리했어요 ·/)).toBeNull()
  })

  it('AC-7421.1: AI 글·제목은 글자로만 그린다(HTML을 해석하지 않는다)', async () => {
    const tagged = item({ id: id(31), title: '<b>굵게</b> 제목', summary: { ...REPORT.summary!, what: '<img src=x onerror=alert(1)>' } })
    read.mockResolvedValue({ ...WEEK, top3: [{ head: '<i>머리</i>', body: '<a href="https://x.test">글</a>' }], items: [tagged] })
    const { container } = await shown()
    expect(screen.getByText('<b>굵게</b> 제목')).toBeTruthy()
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy()
    expect(screen.getByText('<i>머리</i>')).toBeTruthy()
    expect(screen.getByText('<a href="https://x.test">글</a>')).toBeTruthy()
    expect(container.querySelector('img, i, a[href^="https://x.test"]')).toBeNull()
  })

  it('AC-7421.1·기본값 12: 읽기 실패면 E-NOTICE-READ 상자와 [다시 읽기], 누르면 같은 주를 다시 읽는다', async () => {
    const user = userEvent.setup()
    read.mockResolvedValueOnce('failed')
    render(<WeekScreen hospitalName={NAME} today={TODAY} week="2026-11-02" />)
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('고시·공지를 읽지 못했어요')).toBeTruthy()
    expect(within(alert).getByText(/E-NOTICE-READ/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '인쇄' })).toBeNull()
    read.mockResolvedValueOnce({ ...WEEK, weekStart: '2026-11-02' })
    await user.click(screen.getByRole('button', { name: '다시 읽기' }))
    await screen.findByRole('heading', { level: 2, name: '고시·공지 주간 모음' })
    expect(read).toHaveBeenCalledTimes(2)
    expect(read.mock.calls.map((c) => c[0])).toEqual(['2026-11-02', '2026-11-02'])
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('AC-7421.2: 모음이 없는 주 · 아직 없음', () => {
  it('AC-7421.2: 모음이 하나도 없으면 안내 글이고, 주 이름은 다음 모음이 나올 주(지난주)다', async () => {
    read.mockResolvedValue(null)
    render(<WeekScreen hospitalName={NAME} today={TODAY} />)
    expect(await screen.findByText('이번 주 모음은 월요일 아침에 나와요.')).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
    expect(screen.getByText('11월 9일 (월) ~ 11월 15일 (일)')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '인쇄' })).toBeNull()
    expect((screen.getByRole('button', { name: '다음 주' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('link', { name: '지난주' }).getAttribute('href')).toBe('/notices/week?w=2026-11-02')
  })

  it('AC-7421.2: 고른 주에 모음이 없어도 안내 글이고 주 이름은 그 주다', async () => {
    read.mockResolvedValue(null)
    render(<WeekScreen hospitalName={NAME} today={TODAY} week="2026-10-19" />)
    expect(await screen.findByText('이번 주 모음은 월요일 아침에 나와요.')).toBeTruthy()
    expect(read).toHaveBeenCalledWith('2026-10-19')
    expect(screen.getByText('10월 19일 (월) ~ 10월 25일 (일)')).toBeTruthy()
    expect(screen.getByRole('link', { name: '다음 주' }).getAttribute('href')).toBe('/notices/week?w=2026-10-26')
  })

  it('AC-7421.2: 월요일 아침 모음 전이면(가장 최근 모음이 2주 전) 다음 주로 옮겨 지난주 안내를 본다', async () => {
    // 한국 날짜 2026-11-23 (월) — 아직 11월 16일 주 모음이 없다
    read.mockResolvedValue(WEEK)
    await shown({ today: '2026-11-23' })
    expect(screen.getByRole('link', { name: '다음 주' }).getAttribute('href')).toBe('/notices/week?w=2026-11-16')
  })
})

describe('AC-7421.3: 지난주 · 다음 주 · 인쇄', () => {
  it('AC-7421.3: 가장 최근 주에서는 [다음 주]가 막히고 [지난주]는 한 주 앞 월요일로 간다', async () => {
    await shown()
    const tools = screen.getByRole('group', { name: '주 옮기기' })
    expect(within(tools).getByText('11월 9일 (월) ~ 11월 15일 (일)')).toBeTruthy()
    expect(within(tools).getByRole('link', { name: '지난주' }).getAttribute('href')).toBe('/notices/week?w=2026-11-02')
    const next = within(tools).getByRole('button', { name: '다음 주' }) as HTMLButtonElement
    expect(next.disabled).toBe(true)
    expect(within(tools).queryByRole('link', { name: '다음 주' })).toBeNull()
  })

  it('AC-7421.3: 지난 주를 보면 [다음 주]·[지난주]가 앞뒤 월요일로 간다', async () => {
    read.mockResolvedValue({ ...WEEK, weekStart: '2026-11-02', createdAt: '2026-11-08T22:05:00Z' })
    await shown({ week: '2026-11-02' })
    expect(screen.getByRole('link', { name: '지난주' }).getAttribute('href')).toBe('/notices/week?w=2026-10-26')
    expect(screen.getByRole('link', { name: '다음 주' }).getAttribute('href')).toBe('/notices/week?w=2026-11-09')
    expect(screen.getByText(byWhole('11월 2일 (월) ~ 11월 8일 (일) · 새 글 6건 · 정형외과 의원 관련 3건'))).toBeTruthy()
    expect(screen.getByText(byWhole('11월 9일 (월) 아침에 AI가 정리했어요 · 가나 정형외과의원'))).toBeTruthy()
  })

  it('AC-7421.3: 주를 옮기면(주소가 바뀌어 week가 바뀜) 그 주를 다시 읽어 그린다. 늦게 온 앞 주의 답은 버린다', async () => {
    const first = deferred<NoticeWeek | null | 'failed'>()
    read.mockReturnValueOnce(first.promise)
    const view = render(<WeekScreen hospitalName={NAME} today={TODAY} />)
    const older: NoticeWeek = { ...WEEK, weekStart: '2026-11-02', createdAt: '2026-11-08T22:05:00Z', top3: [], items: [DENTAL] }
    read.mockResolvedValueOnce(older)
    view.rerender(<WeekScreen hospitalName={NAME} today={TODAY} week="2026-11-02" />)
    await screen.findByText(byWhole('11월 2일 (월) ~ 11월 8일 (일) · 새 글 1건 · 정형외과 의원 관련 0건'))
    first.resolve(WEEK)
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText('11월 9일 (월) ~ 11월 15일 (일) · 새 글 6건 · 정형외과 의원 관련 3건')).toBeNull()
    expect(read.mock.calls.map((c) => c[0])).toEqual(['latest', '2026-11-02'])
    // 같은 주로 다시 그리면 다시 읽지 않는다
    view.rerender(<WeekScreen hospitalName={NAME} today={TODAY} week="2026-11-02" />)
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('AC-7421.3: [인쇄]는 window.print()를 한 번 부른다', async () => {
    const user = userEvent.setup()
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    await shown()
    await user.click(screen.getByRole('button', { name: '인쇄' }))
    expect(print).toHaveBeenCalledTimes(1)
  })

  it('AC-7421.3: 인쇄 때 쪽 머리·작은 탭·주 옮기기 줄(단추)은 숨기고 모음 종이는 숨기지 않는다', async () => {
    await shown()
    const hidden = (el: Element) => el.closest('.print\\:hidden') !== null
    expect(hidden(screen.getByRole('heading', { level: 1, name: '고시·공지' }))).toBe(true)
    expect(hidden(screen.getByRole('navigation', { name: '고시·공지' }))).toBe(true)
    expect(hidden(screen.getByRole('group', { name: '주 옮기기' }))).toBe(true)
    expect(hidden(screen.getByRole('button', { name: '인쇄' }))).toBe(true)
    const sheet = screen.getByRole('article')
    expect(hidden(sheet)).toBe(false)
    expect(within(sheet).getByRole('heading', { level: 2, name: '고시·공지 주간 모음' })).toBeTruthy()
    expect(within(sheet).queryAllByRole('button')).toHaveLength(0)
    expect(within(sheet).queryAllByRole('link')).toHaveLength(0)
  })
})

// 2026-11-21 마지막 검토 뒤 더함(requirements 기본값 24) · 시안 모양(앱에는 링크 밑줄·목록 점을 지우는 초기화가 없다)
describe('AC-7421.1·AC-7421.3: 그릴 수 없는 주 · 인쇄 여백 · 밑줄·점', () => {
  const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/)

  it('AC-7421.1·기본값 24: ?w=가 월요일이어도 그릴 수 없는 날짜(9999-12-27)면 가장 최근 모음을 읽는다', async () => {
    await shown({ week: '9999-12-27' })
    expect(read).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledWith('latest')
  })

  it('AC-7421.2·기본값 24: 그릴 수 없는 주에 모음이 없어도 오류 화면 없이 가장 최근 주 안내다', async () => {
    read.mockResolvedValue(null)
    render(<WeekScreen hospitalName={NAME} today={TODAY} week="9999-12-27" />)
    expect(await screen.findByText('이번 주 모음은 월요일 아침에 나와요.')).toBeTruthy()
    expect(read).toHaveBeenCalledWith('latest')
    expect(screen.getByText('11월 9일 (월) ~ 11월 15일 (일)')).toBeTruthy()
    expect(screen.getByRole('link', { name: '지난주' }).getAttribute('href')).toBe('/notices/week?w=2026-11-02')
  })

  it('AC-7421.3·기본값 24: 인쇄 쪽은 A4 한 장 여백(@page, 시안 14mm)이고 화면 부품 안 <style> 하나로 둔다', async () => {
    const { container } = await shown()
    const pageRules = Array.from(document.querySelectorAll('style')).filter((s) => s.textContent?.includes('@page'))
    expect(pageRules.map((s) => s.textContent)).toEqual(['@media print { @page { size: A4 portrait; margin: 14mm } }'])
    expect(container.contains(pageRules[0]!)).toBe(true)
  })

  it('AC-7421.1·AC-7421.3: 모든 링크에 밑줄이 없고(no-underline) 모든 목록에 점이 없다(list-none)', async () => {
    read.mockResolvedValue({ ...WEEK, weekStart: '2026-11-02', createdAt: '2026-11-08T22:05:00Z' })
    const { container } = await shown({ week: '2026-11-02' })
    const links = Array.from(container.querySelectorAll('a'))
    // 글 목록 · 주간 모음 · 지난주 · 다음 주
    expect(links).toHaveLength(4)
    for (const a of links) expect(classesOf(a), a.textContent ?? '').toContain('no-underline')
    // 꼭 알 것 3가지 · 글별 요약 · 그 밖의 글
    const lists = Array.from(container.querySelectorAll('ul, ol'))
    expect(lists).toHaveLength(3)
    for (const list of lists) expect(classesOf(list)).toContain('list-none')
  })
})

describe('AC-7421.1·AC-7421.3: /notices/week 쪽 파일', () => {
  const HOSPITAL: NonNullable<Me['hospital']> = {
    id: 'h1',
    name: NAME,
    applicantName: '홍길동',
    phone: null,
    email: 'manager@example.com',
    status: 'approved',
    createdAt: '2026-10-28T01:23:45+00:00',
  }
  const ME: Me = { email: 'manager@example.com', isAdmin: false, hospital: HOSPITAL }
  const page = async (w?: string | string[]) => NoticesWeekPage({ searchParams: Promise.resolve(w === undefined ? {} : { w }) })

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // 서버 시계(UTC)는 아직 11월 20일이지만 한국은 11월 21일 00:30
    vi.setSystemTime(new Date('2026-11-20T15:30:00Z'))
    currentMe.mockReset().mockResolvedValue(ME)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('AC-7421.1: WeekScreen에 내 병원 이름·요청 때 한국 날짜·?w 글자를 넘긴다', async () => {
    const el = await page('2026-11-02')
    expect(isValidElement(el)).toBe(true)
    expect((el as ReactElement).type).toBe(WeekScreen)
    expect((el as ReactElement).props).toEqual({ hospitalName: NAME, today: '2026-11-21', week: '2026-11-02' })
    expect(currentMe).toHaveBeenCalledTimes(1)
  })

  it('AC-7421.1: ?w가 없거나 여러 개면 week 없이(가장 최근 모음) 넘긴다', async () => {
    for (const w of [undefined, ['2026-11-02', '2026-11-09']]) {
      const el = (await page(w)) as ReactElement<{ week?: string }>
      expect(el.props.week, String(w)).toBeUndefined()
    }
  })

  it('AC-7421.1: 데스크 계정이면 아무것도 그리지 않는다(막힌 화면은 앱 틀 DeskGate가 그린다)', async () => {
    currentMe.mockResolvedValue({ email: 'desk@example.com', isAdmin: false, hospital: null, desk: { hospitalId: 'h1', hospitalName: NAME } } as Me)
    expect(await page()).toBeNull()
  })

  it('AC-7421.1: 승인된 병원 줄이 없으면(문지기가 막아 오지 않는 길) 던진다', async () => {
    currentMe.mockResolvedValue({ ...ME, hospital: null })
    await expect(page()).rejects.toThrow()
    currentMe.mockResolvedValue({ ...ME, hospital: { ...HOSPITAL, status: 'pending' } })
    await expect(page()).rejects.toThrow()
  })

  it('AC-7421.1: 요청마다 그리고(force-dynamic) 브라우저 탭 이름은 "고시·공지 주간 모음"이다', () => {
    expect(dynamic).toBe('force-dynamic')
    expect(metadata.title).toBe('고시·공지 주간 모음')
  })
})


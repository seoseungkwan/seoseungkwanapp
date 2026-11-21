// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardHome } from '@/components/dashboard/briefing/DashboardHome'
import { DASHBOARD_FEATURES, type FeatureStatus } from '@/components/dashboard/briefing/features'
import { DashboardSkeleton } from '@/components/dashboard/live/DashboardSkeleton'
import { DateControl } from '@/components/dashboard/live/DateControl'
import { StatusHeader } from '@/components/dashboard/live/ReadStatus'
import { LOOKBACK_DAYS } from '@/components/dashboard/live/readBitDays'
import { AiBrief } from '@/components/dashboard/ai/AiBrief'
import { NoticesCard } from '@/components/dashboard/notices/NoticesCard'
import { RuleAlert } from '@/components/dashboard/notices/RuleAlert'
import { DailySection } from '@/components/dashboard/summary/DailySection'
import { DashboardAnalysis } from '@/components/dashboard/summary/DashboardAnalysis'
import { FlowSection } from '@/components/dashboard/summary/FlowSection'
import { ReportBlock } from '@/components/dashboard/summary/ReportBlock'
import type { SummarySource } from '@/components/dashboard/summary/source'
import { addDays } from '@/lib/analytics/dates'
import { loadInventory } from '@/lib/storage/inventory'
import { readDays } from '@/lib/storage/stats'
import type { InvInventory } from '@/types/inventory'
import type { DayPayload } from '@/types/payload'
import DashboardPage, { dynamic } from './page'

// 자료 읽는 자리(브라우저의 저장 숫자 읽기 readDays)만 감싼다(AC-307.6, stats AC-516.4). 앱 코드에 시험용 길을 만들지 않는다.
// 서버 그림(renderToStaticMarkup)은 읽기 전이라 늘 뼈대(DashboardSkeleton, dashboard-ux AC-2701.1)다 — 연결 전 화면이 아니다.
// 연결 전 짜임은 브라우저에 그려 저장 숫자 읽기가 빈 줄로 끝난 뒤를 보고, 연결 뒤 짜임은 시험 안 가짜 자료를 돌려준다.
// 이 파일에는 chrome.runtime이 없어 비트는 읽지 않는다(비트 읽기는 BitDashboard.test.tsx, 읽기 차례·실패·한도는 LiveDashboard.test.tsx)
vi.mock('@/lib/storage/stats', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/storage/stats')>()
  return { ...real, readDays: vi.fn() }
})
// 통계 탭 묶음 읽기(listStatsRxGroups)도 감싼다: 이 파일의 계정은 묶음이 없다(bit-dashboard AC-606.8). 진짜 Supabase에 붙지 않는다
vi.mock('@/lib/storage/statsRxGroups', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/storage/statsRxGroups')>()
  return { ...real, listStatsRxGroups: vi.fn(async () => []) }
})
// 고시·공지(notices TASK-20): 맨 위 경고(RuleAlert)와 '고시·공지' 칸(NoticesCard)이 읽는 저장소도 감싼다. 늘 읽는 중이라 두 부품은
// 아무것도 그리지 않는다(BitDashboard.test.tsx·LiveDashboard.test.tsx와 같다). 진짜 Supabase에 붙지 않는다
vi.mock('@/lib/storage/notices', () => ({
  NOTICES_CHANGED: 'notices:changed',
  ruleAlerts: vi.fn(() => new Promise<never>(() => {})),
  unreadCount: vi.fn(() => new Promise<never>(() => {})),
  listNotices: vi.fn(() => new Promise<never>(() => {})),
  sourceStates: vi.fn(() => new Promise<never>(() => {})),
}))
// 대시보드 재고 칸(spec inventory AC-7512.4)은 스스로 loadInventory({ seed: false })로 읽는다 → 가짜. 이 파일의 계정은 처음은 물품이 없다(칸 없음, 지금 화면 그대로)
vi.mock('@/lib/storage/inventory', () => ({ loadInventory: vi.fn(async () => ({ categories: [], items: [] })) }))

// /dashboard 페이지 (tab-frame REQ-306, design.md '대시보드 짜임'·'대시보드 페이지 조립'). 문지기와 앱 틀(위쪽 띠·탭·<main>)은 (app)/layout이 준다(layout.test.tsx).
// 여기서는 오늘 한국 날짜로 대시보드(DashboardHome)를 그리는지, 자료 읽는 자리(저장 숫자 읽기) 하나로 연결 전·뒤 분석·보고 문장을 끼우는지 본다(AC-307.5·307.6)

// 뼈대의 화면 읽기 글(AC-2701.1)
const SKELETON_STATUS = '대시보드 숫자를 불러오고 있어요'
// 화면 시험(jsdom)에서는 import.meta.url이 file: 주소가 아니라 저장소 뿌리에서 찾는다
const SOURCE = readFileSync(join(process.cwd(), 'src/app/(app)/dashboard/page.tsx'), 'utf8')
// 날짜 줄 글자: 그린 마크업의 첫 <p>(브리핑 왼쪽 칸 맨 위)
const dateLineText = (markup: string) =>
  (/<p\b[^>]*>([\s\S]*?)<\/p>/.exec(markup)?.[1] ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const renderAt = (iso: string) => {
  vi.setSystemTime(new Date(iso))
  return renderToStaticMarkup(<DashboardPage />)
}
// 브라우저에 그려 저장 숫자 읽기(가짜 줄)가 끝날 때까지 기다린 마크업
const drawInBrowser = async (iso: string, rows: DayPayload[]) => {
  vi.setSystemTime(new Date(iso))
  vi.mocked(readDays).mockResolvedValueOnce({ rows, dropped: 0, latest: null, fromFile: false })
  let view!: ReturnType<typeof render>
  await act(async () => {
    view = render(<DashboardPage />)
  })
  return view.container.innerHTML
}
// 연결 전 대시보드: 브라우저에서 저장 숫자 읽기가 빈 줄로 끝난 뒤의 그림(AC-2701.1 — 읽는 동안은 뼈대다)
const drawBeforeConnect = async (iso: string) => {
  const html = await drawInBrowser(iso, [])
  cleanup()
  return html
}
// useId 값은 그린 차례마다 달라 빼고 견준다
const withoutIds = (html: string) => html.replace(/\s(?:id|for|aria-labelledby|aria-describedby|aria-controls)="[^"]*"/g, '')
const browserMarkupOf = (node: React.ReactElement) => {
  const { container, unmount } = render(node)
  const html = container.innerHTML
  unmount()
  return html
}

afterEach(() => {
  cleanup()
})

describe('/dashboard 화면', () => {
  const originalTz = process.env.TZ

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    process.env.TZ = originalTz
  })

  it('AC-306.1·AC-2701.1: 날짜 줄은 지금의 한국 날짜 — "10월 29일 목요일"(저장 숫자 읽기가 빈 줄로 끝난 뒤 연결 전 화면)', async () => {
    expect(dateLineText(await drawBeforeConnect('2026-10-29T00:42:00Z'))).toBe('10월 29일 목요일')
    expect(dateLineText(await drawBeforeConnect('2027-01-01T03:00:00Z'))).toBe('1월 1일 금요일')
  })

  it('AC-306.1·AC-2701.1: 한국 자정 경계 — 서버 시간대가 UTC여도 한국 날짜(todayInKorea)를 LiveDashboard에 넘긴다(날짜 줄·저장 숫자 읽는 범위)', async () => {
    process.env.TZ = 'UTC'
    expect(new Date('2026-10-28T15:30:00Z').getHours()).toBe(15) // 이 시험 안에서 정말 UTC로 바뀌었다
    vi.mocked(readDays).mockClear()
    expect(dateLineText(await drawBeforeConnect('2026-10-28T15:00:00Z'))).toBe('10월 29일 목요일')
    expect(dateLineText(await drawBeforeConnect('2026-10-28T14:59:59Z'))).toBe('10월 28일 수요일')
    expect(vi.mocked(readDays).mock.calls.map(([range]) => range)).toEqual([
      { from: addDays('2026-10-29', -LOOKBACK_DAYS), to: '2026-10-29' },
      { from: addDays('2026-10-28', -LOOKBACK_DAYS), to: '2026-10-28' },
    ])
  })

  it('AC-306.1: 날짜는 요청 때 계산한다 — 빌드 때 그린 날짜로 굳지 않는다(force-dynamic)', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  it('AC-306.2·AC-2701.1: 서버 그림은 뼈대(<DashboardSkeleton />) 그대로이고, 저장 숫자가 비면 브라우저 그림은 연결 전 대시보드 <DashboardHome today="2026-10-29" report={null} analysis={<DashboardAnalysis … source={{ kind: "none" }} />} /> 그대로다', async () => {
    const server = renderAt('2026-10-29T00:42:00Z')
    expect(server).toBe(renderToStaticMarkup(<DashboardSkeleton />))
    expect(plain(server)).toBe(SKELETON_STATUS)
    const browser = await drawBeforeConnect('2026-10-29T00:42:00Z')
    expect(withoutIds(browser)).toBe(
      withoutIds(
        browserMarkupOf(
          <DashboardHome today="2026-10-29" report={null} analysis={<DashboardAnalysis today="2026-10-29" source={{ kind: 'none' }} />} />,
        ),
      ),
    )
  })

  it('AC-306.8: 앱 틀을 한 번 더 그리지 않는다 — 위쪽 띠·탭·<main>·.app-ui는 (app)/layout 몫', () => {
    const html = renderAt('2026-10-29T00:42:00Z')
    for (const mark of [/<main\b/, /<header\b/, /<nav\b/, /\bapp-ui\b/]) expect(html).not.toMatch(mark)
  })

  it('AC-306.8: 숫자·자료를 읽지 않는다 — Supabase·문지기·fetch를 쓰지 않는다(대시보드 내용은 별도 명세)', () => {
    expect(SOURCE).not.toMatch(/@\/lib\/supabase|guard\.server|hospital\.server|\bfetch\(|'use client'/)
    expect(SOURCE).toMatch(/from '@\/lib\/analytics\/dates'/) // 날짜는 dates.ts 한 곳
  })

  it('AC-601.14·AC-516.1: 페이지는 LiveDashboard 하나를 오늘 한국 날짜로 놓고, 통계 표·통계 저장을 읽지 않는다(서버 코드)', () => {
    expect(SOURCE).toContain('<LiveDashboard today={todayInKorea()} />')
    expect(SOURCE).not.toMatch(/readDays|storage\/stats|stats_days|summary\/source|dashboardSummarySource/)
  })
})

// ── 대시보드 조립 (tab-frame REQ-307 AC-307.5·AC-307.6, design.md '대시보드 페이지 조립') ──
// 페이지가 자료 읽는 자리 하나로 연결 전·뒤를 정하고, 브리핑(DashboardHome)에 분석(DashboardAnalysis)·보고 문장(ReportBlock)을 끼운다.
// 이 파일은 node 환경이라 그린 마크업 글자로 본다(짜임·모양은 각 부품 시험이 본다)

const TODAY = '2026-10-31' // 토요일 · 그 달 마지막 날
const AT_TODAY = '2026-10-31T01:00:00Z' // 한국 10월 31일 오전 10시

// 그린 마크업 → 보이는 글자. 태그는 빈칸, React가 글자 사이에 넣는 <!-- -->는 지우고, 이스케이프 글자를 되돌린다
const plain = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
const h1Texts = (html: string) => [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => plain(m[1]!))
// 글자가 꼭 같은 그 태그 하나의 자리(마크업 안 위치)
const placeOf = (html: string, tag: string, text: string) => {
  const found = [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'g'))].filter((m) => plain(m[1]!) === text)
  expect(found, `<${tag}> ${text}`).toHaveLength(1)
  return found[0]!.index
}
// 글자가 꼭 같은 링크 하나의 주소
const hrefOf = (html: string, text: string) => {
  const found = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].filter((m) => plain(m[2]!) === text)
  expect(found, `<a> ${text}`).toHaveLength(1)
  return /\bhref="([^"]*)"/.exec(found[0]![1]!)?.[1]
}
const expectAscending = (places: Array<[string, number]>) => {
  for (let i = 1; i < places.length; i += 1) {
    expect(places[i]![1], `${places[i - 1]![0]} → ${places[i]![0]}`).toBeGreaterThan(places[i - 1]![1])
  }
}
const countOf = (text: string, part: string) => text.split(part).length - 1

// ui-90 REQ-414 연결 전 문구(시안 docs/mockups/ui-90/app/gen.py dash_body 글자 그대로)
const H1 = '비트 PC를 연결하면 오늘 숫자가 여기에 채워져요'
const ROW_TITLE = '연결하면 바로 쓸 수 있어요'
// 기능 목차의 개수는 손으로 적지 않고 목록에서 센다(spec revenue AC-010.1, worklog AC-012.5·ai-report-screen AC-714.4·patients AC-610.1: 다른 갈래가 탭을 채워도 그대로 통과한다)
const featureCount = (status: FeatureStatus) => DASHBOARD_FEATURES.filter((f) => f.status === status).length
const INDEX_SIDE = `${DASHBOARD_FEATURES.length}개 가운데 ${featureCount('ready')}개는 지금, ${featureCount('connect-first')}개는 연결하면 쓸 수 있어요`
const GAINS_TITLE = '연결하면 생기는 것 4가지'
const GAINS_NOTE = '연결한 뒤에는 이 자리에 그래프 4개가 그려지고, 기간 단추로 7일·30일·90일을 바꿔 볼 수 있어요.'
// 시안 gains 설명 가운데 숫자가 든 고정 글자(지어낸 통계가 아니다). 처방 상위 설명은 bit-dashboard AC-606.6이 바꾼 글이다
const GAINS_DIGIT_DESC = ['처음 온 환자가 7·14·30일 안에 다시 온 비율이에요.', '통계 탭에서 묶은 치료를 많이 한 순서로 5가지까지 적어요.']

describe('/dashboard 조립 — 지금 자리(늘 자료 없음) (AC-307.5)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.mocked(readDays).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('AC-307.5·AC-516.1·AC-601.14·AC-2701.1: 서버 그림은 읽지 않고(뼈대 — 연결 전 화면도 숫자도 없다), 브라우저에서 자료 읽는 자리를 한 번 읽는다. 줄이 없으면 연결 전 모양이다', async () => {
    const server = renderAt(AT_TODAY)
    expect(readDays).not.toHaveBeenCalled()
    expect(server).toContain('role="status"')
    expect(plain(server)).toBe(SKELETON_STATUS)
    expect(h1Texts(server)).toEqual([])
    expect(plain(server)).not.toMatch(/\d/)
    expect(server).not.toContain('비트 PC 연결 시작')
    const browser = await drawInBrowser(AT_TODAY, [])
    expect(readDays).toHaveBeenCalledTimes(1)
    expect(readDays).toHaveBeenCalledWith({ from: addDays(TODAY, -LOOKBACK_DAYS), to: TODAY })
    expect(h1Texts(browser)).toEqual([H1])
    expect(plain(browser)).not.toContain(SKELETON_STATUS)
  })

  it('AC-307.5·AC-414.2·AC-2701.1: 위에서부터 날짜 줄 → 큰 문장 h1 → 연결 순서 → 연결하면 바로 쓸 수 있어요 → 오늘 하루 분석 → 기간별 흐름 → 기능 목차', async () => {
    const html = await drawBeforeConnect(AT_TODAY)
    expect(dateLineText(html)).toBe('10월 31일 토요일 · 이번 달 마지막 날')
    expectAscending([
      ['날짜 줄', html.indexOf('<p')],
      ['큰 문장 h1', placeOf(html, 'h1', H1)],
      ['연결 순서', placeOf(html, 'h2', '연결 순서')],
      [ROW_TITLE, placeOf(html, 'h2', ROW_TITLE)],
      ['오늘 하루 분석', placeOf(html, 'h2', '오늘 하루 분석')],
      ['기간별 흐름', placeOf(html, 'h2', '기간별 흐름')],
      ['기능 목차', placeOf(html, 'h2', '기능 목차')],
    ])
    expect(hrefOf(html, '비트 PC 연결부터')).toBe('/claim/setup')
  })

  it('AC-603.1·AC-2701.1: [비트 PC 연결 시작](위 단추·휴대폰 아래 단추) 두 곳의 주소는 /claim/setup?next=dashboard다', async () => {
    const html = await drawBeforeConnect(AT_TODAY)
    const starts = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].filter((m) => plain(m[2]!) === '비트 PC 연결 시작')
    expect(starts).toHaveLength(2)
    for (const m of starts) expect(/\bhref="([^"]*)"/.exec(m[1]!)?.[1]).toBe('/claim/setup?next=dashboard')
  })

  it('AC-601.1·AC-601.14: 페이지는 오늘을 LiveDashboard에 넘기고, 저장 숫자 읽기·비트 읽기는 그 아래 화면이 맡는다', () => {
    expect(SOURCE).toMatch(/<LiveDashboard today=\{todayInKorea\(\)\} \/>/)
    expect(SOURCE).not.toMatch(/<BitDashboard\b|readBitDays|chrome/)
  })

  it('AC-307.5·AC-414.7·AC-2701.1: h1은 큰 문장 "비트 PC를 연결하면 오늘 숫자가 여기에 채워져요" 하나다', async () => {
    expect(h1Texts(await drawBeforeConnect(AT_TODAY))).toEqual([H1])
  })

  it('AC-307.5·AC-414.3·AC-414.4·AC-2701.1·AC-4404.1·AC-6302.3: 분석 칸은 모두 연결 전 모양이다 — 숫자 칸 여섯(물리치료 포함) "연결하면 보여요", 연결 전 칩, "연결하면 생기는 것 4가지"(빈 그래프 틀·차트 부품 없음)', async () => {
    const html = await drawBeforeConnect(AT_TODAY)
    const text = plain(html)
    expect(countOf(text, '연결하면 보여요')).toBe(6)
    expect(text).toContain('비트 PC 연결 전')
    expect(text).toContain('연결하면 이 숫자로 원장님 보고 문장을 만들어 숫자 칸 아래에 보여 드려요.')
    expect(text).toContain(GAINS_TITLE)
    expect(text).toContain(GAINS_NOTE)
    expect(text).not.toContain('비트 PC를 연결하면 이 기간의 하루하루가 막대로 그려집니다')
    // 연결 뒤에만 나오는 것: 보고 문장(이름 줄·칩) · 머리 줄 · 연결 뒤 빈 값 글자 · 그래프 칸 · 차트 부품(쌓은 막대의 화면 읽기 표)
    expect(text).not.toContain('보고 문장 자동 집계 요약')
    expect(text).not.toContain('자동 집계 요약')
    expect(text).not.toContain('자료 없음')
    expect(html).not.toMatch(/<table\b/)
    expect(html).not.toMatch(/<h3\b/)
  })

  it('AC-307.5·AC-414.7·AC-010.1·AC-606.6·AC-2701.1·AC-4404.1: 고정 글자(날짜 줄 · 기간 글자 · 기간 단추 셋 · 연결 순서 번호와 "5단계" · "4가지"와 번호 1~4 · 기능 수 글 · 시안 설명 · 안내 줄 · 칸 이름 "90일초진")를 빼면 숫자가 없다(지어낸 숫자 없음)', async () => {
    let html = await drawBeforeConnect(AT_TODAY)
    // 번호 줄(연결 순서 두 벌 1~5 · 연결하면 생기는 것 1~4): 줄 맨 앞 번호 칸의 번호만 뺀다
    const lists = [...html.matchAll(/<ol\b[^>]*>[\s\S]*?<\/ol>/g)].map((m) => m[0])
    expect(lists).toHaveLength(3)
    const expected = [
      ['1', '2', '3', '4', '5'],
      ['1', '2', '3', '4', '5'],
      ['1', '2', '3', '4'],
    ]
    lists.forEach((list, i) => {
      const numbers = [...list.matchAll(/<li\b[^>]*><span\b[^>]*>(\d+)<\/span>/g)].map((m) => m[1])
      expect(numbers).toEqual(expected[i])
      html = html.replace(list, list.replace(/(<li\b[^>]*><span\b[^>]*>)\d+(<\/span>)/g, '$1$2'))
    })
    const fixed = [
      '10월 31일 토요일',
      '10월 1일 – 10월 30일', // 기간 글자(처음 30일, 어제까지)
      '최근 7일',
      '최근 30일',
      '최근 90일',
      '5단계',
      INDEX_SIDE,
      GAINS_TITLE,
      ...GAINS_DIGIT_DESC,
      GAINS_NOTE,
      '아래 그래프 4개에 적용 · 기준일과 따로예요', // 추이 조회 기간 적용 글(dashboard-ux AC-2703.2) — 4는 그래프 수다
      '90일초진', // 숫자 칸 이름(first90 AC-4404.1) — 90은 이름의 일부다
    ].sort((a, b) => b.length - a.length)
    let text = plain(html)
    for (const s of fixed) {
      expect(text, s).toContain(s)
      text = text.split(s).join(' ')
    }
    expect(text).not.toMatch(/\d/)
  })
})

describe('/dashboard 조립 — 시험 안 가짜 자료로 바꾼 자리(연결 뒤) (AC-307.6)', () => {
  // 가짜 DayPayload는 이 시험 파일 안에서만 만든다(AC-312.3). 오늘(토) 끝남 13명 · 지난주 토요일 끝남 10명 · 어제 덜 끝남
  const day = (ymd: string, newPatients: number, returning: number, partial = false): DayPayload => ({
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial,
    totals: { patients: newPatients + returning, newPatients, returning, unknown: 0 },
    rx: [],
    groups: [],
    revisit: { cohort: newPatients, within7: 0, within14: 0 },
  })
  const DAYS: DayPayload[] = [day(TODAY, 4, 9), day('2026-10-30', 3, 7, true), day('2026-10-24', 2, 8)]
  const SOURCE_DATA: SummarySource = { kind: 'data', days: DAYS }
  // 자료 읽는 자리(브라우저의 저장 숫자 읽기)가 이번 한 번만 가짜 자료를 준다
  const renderConnected = async () => {
    const html = await drawInBrowser(AT_TODAY, DAYS)
    return html
  }
  // AI 요약(dashboard-ux AC-2704.1)의 저장 리포트 읽기에 주는 합성 답: 리포트 없음. 진짜 서버·유료 API에 닿지 않는다
  const AI_EMPTY = { report: null, stale: false, usage: { calls: 0, tokens: 0, costMicroUsd: 0 } }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(AI_EMPTY), { status: 200, headers: { 'Content-Type': 'application/json' } })))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('AC-307.6·AC-605.1·AC-2701.3·AC-2707.2: 화면 = <RuleAlert /> + <DashboardHome dateLine={null} report={<StatusHeader … />} analysis={<>일별 현황(기준일 DateControl · 보고 문장 ReportBlock) · 고시·공지 칸 · AI 요약 · 기간별 흐름</>} /> 그대로다', async () => {
    const html = withoutIds(await renderConnected())
    cleanup()
    const { container } = render(
      <>
        {/* 고시·공지 맨 위 경고 자리(notices AC-7422.1): LiveDashboard 맨 위. 저장소가 늘 읽는 중이라 아무것도 그리지 않는다 */}
        <RuleAlert />
        <DashboardHome
          today={TODAY}
          dateLine={null}
          report={
            // 비트를 읽을 수 없는 브라우저(chrome.runtime 없음) + 저장 숫자 새로고침(dashboard-ux AC-2701.7)
            <StatusHeader
              readAt={null}
              savedAt={null}
              reading={false}
              failed={false}
              onReread={() => {}}
              bitReadable={false}
              savedRefresh={{ refreshing: false, failed: false, onRefresh: () => {} }}
            />
          }
          analysis={
            <>
              <DailySection
                today={TODAY}
                source={SOURCE_DATA}
                dateLine={<DateControl today={TODAY} selected={TODAY} onChange={() => {}} />}
                sentence={<ReportBlock today={TODAY} days={DAYS} />}
              />
              {/* 고시·공지 칸 자리(notices AC-7422.2): 일별 현황 바로 아래. 저장소가 늘 읽는 중이라 아무것도 그리지 않는다 */}
              <NoticesCard />
              <div className="mt-12 max-md:mt-8">
                <AiBrief today={TODAY} />
              </div>
              <FlowSection today={TODAY} source={SOURCE_DATA} />
            </>
          }
        />
      </>,
    )
    await act(async () => {}) // AI 요약의 합성 답까지
    expect(html).toBe(withoutIds(container.innerHTML))
  })

  it('AC-307.6·AC-605.1·AC-2705.1·AC-2707.2: 위에서부터 머리 줄(대시보드) → 오늘 하루 분석(날짜 고르기 · 오늘 보고 문장 · 자동 집계 요약 · [복사] · 보고 문장 한 단락) → 기간별 흐름 → 지금 바로 쓸 수 있어요(사전점검 · [사전점검 열기] · [비트 PC 연결 다시 확인]) → 기능 목차', async () => {
    const html = await renderConnected()
    const dateControl = html.indexOf('role="group" aria-label="날짜 고르기"')
    expect(dateControl).toBeGreaterThanOrEqual(0)
    expect(html).toContain(`value="${TODAY}"`)
    expectAscending([
      ['머리 줄 대시보드', placeOf(html, 'h1', '대시보드')],
      ['오늘 하루 분석', placeOf(html, 'h2', '오늘 하루 분석')],
      ['날짜 고르기', dateControl],
      ['오늘 보고 문장', placeOf(html, 'p', '오늘 보고 문장 자동 집계 요약')],
      ['복사', placeOf(html, 'button', '복사')],
      ['보고 문장 한 단락', placeOf(html, 'p', '오늘 환자 13명이 왔습니다. 신환 4명, 재진 9명입니다. 지난주 토요일보다 3명 많습니다.')],
      ['기간별 흐름', placeOf(html, 'h2', '기간별 흐름')],
      ['지금 바로 쓸 수 있어요', placeOf(html, 'h2', '지금 바로 쓸 수 있어요')],
      ['사전점검', placeOf(html, 'p', '삭감 예방 사전점검')],
      ['사전점검 열기', placeOf(html, 'a', '사전점검 열기')],
      ['비트 PC 연결 다시 확인', placeOf(html, 'a', '비트 PC 연결 다시 확인')],
      ['기능 목차', placeOf(html, 'h2', '기능 목차')],
    ])
    expect(hrefOf(html, '사전점검 열기')).toBe('/claim')
    expect(hrefOf(html, '비트 PC 연결 다시 확인')).toBe('/claim/setup')
  })

  it('AC-605.8: 오늘이 10월 31일인 저장 숫자 화면에서도 날짜 고르기 옆에 "·"과 "이번 달 마지막 날"이 붙는다', async () => {
    const html = await renderConnected()
    const dateControl = /<div role="group" aria-label="날짜 고르기"[\s\S]*?<\/div>/.exec(html)?.[0] ?? ''
    expect(plain(dateControl)).toBe('10월 31일 토요일 · 이번 달 마지막 날')
    expect(html.match(/이번 달 마지막 날/g)).toHaveLength(1)
  })

  it('AC-307.6·AC-2705.1: h1은 머리 줄 "대시보드" 하나다 — 보고 문장은 h1이 아니다', async () => {
    const html = await renderConnected()
    expect(h1Texts(html)).toEqual(['대시보드'])
    expect(html).not.toMatch(/<h1\b[^>]*>[^<]*환자/)
  })

  it('AC-307.6·AC-414.2·AC-414.4: 연결 전 부품이 없다 — 큰 문장 · 주 단추 · 연결 순서 · 폰 아래 단추 · 연결하면 바로 쓸 수 있어요 줄 · 연결 전 빈 상태 · 연결하면 생기는 것', async () => {
    const html = await renderConnected()
    const text = plain(html)
    for (const gone of [
      H1,
      '비트 PC 연결 시작',
      '연결 순서',
      '크롬 확장 프로그램 설치',
      ROW_TITLE,
      '비트 PC 연결부터',
      '연결하면 보여요',
      '비트 PC 연결 전',
      GAINS_TITLE,
      GAINS_NOTE,
    ]) {
      expect(text, gone).not.toContain(gone)
    }
    expect(html).not.toContain('dashboard-connect-start') // 주 단추 자리(폰 아래 단추가 지켜보는 id)
    expect(html).not.toMatch(/\bsticky\b/) // 폰 아래 단추
    expect(countOf(text, '지금 바로 쓸 수 있어요')).toBe(1) // 오른쪽 칸 묶음 하나뿐
  })

  it('AC-307.6: 오늘 하루 분석은 가짜 자료의 숫자다 — 오늘 환자 수 13 · 신환 4 · 재진 9 · 지난주 토요일보다', async () => {
    const text = plain(await renderConnected())
    expect(text).toContain('오늘 환자 수 13 명')
    expect(text).toContain('신환 4 명')
    expect(text).toContain('재진 9 명')
    expect(text).toContain('지난주 같은 요일보다')
    expect(text).toContain('지난주 토요일')
  })
})

// ── 대시보드 재고 칸 (spec inventory REQ-7512 AC-7512.4, design.md 6절 TASK-15, 시안 docs/mockups/inventory ?s=dash) ──
// 알림이 있으면 비트 자료와 상관없이 늘 하나: 숫자가 있으면 보고 문장 오른쪽, 연결 전이면 대시보드 내용 맨 위. 알림이 없으면 지금 그대로(위 시험들)
describe('/dashboard 재고 칸 (AC-7512.4)', () => {
  const LOW: InvInventory = {
    categories: [{ id: 'c1', name: '약품', sortOrder: 0 }],
    items: [
      {
        id: 'i1',
        categoryId: 'c1',
        name: '히알루론산 주사 2mL',
        unit: '개',
        minQty: 10,
        qty: 4,
        lastCountQty: 4,
        lastCountedAt: null,
        expiry: null,
        vendor: null,
        unitPrice: null,
        bitCode: null,
        sortOrder: 0,
        hidden: false,
        orderedAt: null,
      },
    ],
  }
  const day = (ymd: string, newPatients: number, returning: number): DayPayload => ({
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial: false,
    totals: { patients: newPatients + returning, newPatients, returning, unknown: 0 },
    rx: [],
    groups: [],
    revisit: { cohort: newPatients, within7: 0, within14: 0 },
  })
  const AI_EMPTY = { report: null, stale: false, usage: { calls: 0, tokens: 0, costMicroUsd: 0 } }
  // 브라우저에 그리고 저장 숫자 읽기·재고 읽기가 끝난 뒤의 마크업
  const drawSettled = async (rows: DayPayload[]) => {
    await drawInBrowser(AT_TODAY, rows)
    await act(async () => {})
    return document.body.innerHTML
  }
  const inventoryTitles = (html: string) => [...html.matchAll(/<h2\b[^>]*>재고<\/h2>/g)]

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.mocked(readDays).mockReset()
    vi.mocked(loadInventory).mockReset()
    vi.mocked(loadInventory).mockResolvedValue(LOW)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(AI_EMPTY), { status: 200, headers: { 'Content-Type': 'application/json' } })))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.mocked(loadInventory).mockResolvedValue({ categories: [], items: [] })
  })

  it('AC-7512.4: 서버 그림은 알림이 있어도 뼈대 그대로다(재고는 브라우저가 읽는다)', () => {
    const server = renderAt(AT_TODAY)
    expect(server).toBe(renderToStaticMarkup(<DashboardSkeleton />))
    expect(loadInventory).not.toHaveBeenCalled()
  })

  it('AC-7512.4: 연결 전 대시보드 — 재고 칸 하나가 내용 맨 위(날짜 줄·큰 문장 h1보다 앞)이고, [재고 탭에서 보기]는 /inventory다', async () => {
    const html = await drawSettled([])
    const titles = inventoryTitles(html)
    expect(titles).toHaveLength(1)
    expect(titles[0]!.index).toBeLessThan(placeOf(html, 'h1', H1))
    expect(titles[0]!.index).toBeLessThan(html.indexOf('10월 31일 토요일'))
    expect(hrefOf(html, '재고 탭에서 보기')).toBe('/inventory')
    expect(loadInventory).toHaveBeenCalledWith({ seed: false })
  })

  it('AC-7512.4: 숫자가 있는 대시보드 — 재고 칸 하나가 오늘 보고 문장 뒤(오른쪽 칸)·기간별 흐름 앞이다', async () => {
    const html = await drawSettled([day(TODAY, 4, 9), day('2026-10-24', 2, 8)])
    const titles = inventoryTitles(html)
    expect(titles).toHaveLength(1)
    expectAscending([
      ['오늘 하루 분석', placeOf(html, 'h2', '오늘 하루 분석')],
      ['오늘 보고 문장', placeOf(html, 'p', '오늘 보고 문장 자동 집계 요약')],
      ['재고', titles[0]!.index],
      ['기간별 흐름', placeOf(html, 'h2', '기간별 흐름')],
    ])
  })
})

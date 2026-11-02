import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardHome } from '@/components/dashboard/briefing/DashboardHome'
import { DASHBOARD_FEATURES, type FeatureStatus } from '@/components/dashboard/briefing/features'
import { DateControl } from '@/components/dashboard/live/DateControl'
import { DashboardAnalysis } from '@/components/dashboard/summary/DashboardAnalysis'
import { ReportBlock } from '@/components/dashboard/summary/ReportBlock'
import { dashboardSummarySource, type SummarySource } from '@/components/dashboard/summary/source'
import type { DayPayload } from '@/types/payload'
import DashboardPage, { dynamic } from './page'

// 자료 읽는 자리(dashboardSummarySource)만 감싼다(AC-307.6). 기본은 진짜(지금은 늘 자료 없음)이고 isConnected는 진짜다.
// 연결 뒤 짜임 시험만 한 번 그릴 때 시험 안 가짜 자료를 돌려준다 — 앱 코드에 시험용 길을 만들지 않는다
vi.mock('@/components/dashboard/summary/source', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/components/dashboard/summary/source')>()
  return { ...real, dashboardSummarySource: vi.fn(real.dashboardSummarySource) }
})

// /dashboard 페이지 (tab-frame REQ-306, design.md '대시보드 짜임'·'대시보드 페이지 조립'). 문지기와 앱 틀(위쪽 띠·탭·<main>)은 (app)/layout이 준다(layout.test.tsx).
// 여기서는 오늘 한국 날짜로 대시보드(DashboardHome)를 그리는지, 자료 읽는 자리(dashboardSummarySource) 하나로 연결 전·뒤 분석·보고 문장을 끼우는지 본다(AC-307.5·307.6)

const SOURCE = readFileSync(fileURLToPath(new URL('./page.tsx', import.meta.url)), 'utf8')
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

describe('/dashboard 화면', () => {
  const originalTz = process.env.TZ

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    process.env.TZ = originalTz
  })

  it('AC-306.1: 날짜 줄은 지금의 한국 날짜 — "10월 29일 목요일"', () => {
    expect(dateLineText(renderAt('2026-10-29T00:42:00Z'))).toBe('10월 29일 목요일')
    expect(dateLineText(renderAt('2027-01-01T03:00:00Z'))).toBe('1월 1일 금요일')
  })

  it('AC-306.1: 한국 자정 경계 — 서버 시간대가 UTC여도 한국 날짜(todayInKorea)다', () => {
    process.env.TZ = 'UTC'
    expect(new Date('2026-10-28T15:30:00Z').getHours()).toBe(15) // 이 시험 안에서 정말 UTC로 바뀌었다
    expect(dateLineText(renderAt('2026-10-28T15:00:00Z'))).toBe('10월 29일 목요일')
    expect(dateLineText(renderAt('2026-10-28T14:59:59Z'))).toBe('10월 28일 수요일')
  })

  it('AC-306.1: 날짜는 요청 때 계산한다 — 빌드 때 그린 날짜로 굳지 않는다(force-dynamic)', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  it('AC-306.2: 화면은 연결 전 대시보드 — <DashboardHome today="2026-10-29" report={null} analysis={<DashboardAnalysis today="2026-10-29" source={{ kind: "none" }} />} /> 그대로다', () => {
    expect(renderAt('2026-10-29T00:42:00Z')).toBe(
      renderToStaticMarkup(
        <DashboardHome today="2026-10-29" report={null} analysis={<DashboardAnalysis today="2026-10-29" source={{ kind: 'none' }} />} />,
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
// 기능 목차의 개수는 손으로 적지 않고 목록에서 센다(spec revenue AC-010.1, worklog AC-012.5: 다른 갈래가 탭을 채워도 그대로 통과한다)
const featureCount = (status: FeatureStatus) => DASHBOARD_FEATURES.filter((f) => f.status === status).length
const INDEX_SIDE = `${DASHBOARD_FEATURES.length}개 가운데 ${featureCount('ready')}개는 지금, ${featureCount('connect-first')}개는 연결하면 쓸 수 있어요`
const GAINS_TITLE = '연결하면 생기는 것 4가지'
const GAINS_NOTE = '연결한 뒤에는 이 자리에 그래프 4개가 그려지고, 기간 단추로 7일·30일·90일을 바꿔 볼 수 있어요.'
// 시안 gains 설명 가운데 숫자가 든 고정 글자(지어낸 통계가 아니다)
const GAINS_DIGIT_DESC = ['처음 온 환자가 7·14·30일 안에 다시 온 비율이에요.', '많이 낸 처방 5가지를 차례로 적어요.']

describe('/dashboard 조립 — 지금 자리(늘 자료 없음) (AC-307.5)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.mocked(dashboardSummarySource).mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('AC-307.5: 페이지는 자료 읽는 자리를 한 번 읽고, 지금은 자료가 없다(연결 전)', () => {
    renderAt(AT_TODAY)
    expect(dashboardSummarySource).toHaveBeenCalledTimes(1)
    expect(vi.mocked(dashboardSummarySource).mock.results[0]?.value).toEqual({ kind: 'none' })
  })

  it('AC-307.5·AC-414.2: 위에서부터 날짜 줄 → 큰 문장 h1 → 연결 순서 → 연결하면 바로 쓸 수 있어요 → 오늘 하루 분석 → 기간별 흐름 → 기능 목차', () => {
    const html = renderAt(AT_TODAY)
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

  it('AC-603.1: [비트 PC 연결 시작](위 단추·휴대폰 아래 단추) 두 곳의 주소는 /claim/setup?next=dashboard다', () => {
    const html = renderAt(AT_TODAY)
    const starts = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].filter((m) => plain(m[2]!) === '비트 PC 연결 시작')
    expect(starts).toHaveLength(2)
    for (const m of starts) expect(/\bhref="([^"]*)"/.exec(m[1]!)?.[1]).toBe('/claim/setup?next=dashboard')
  })

  it('AC-601.1: 페이지는 오늘과 자료 읽는 자리의 값을 BitDashboard에 넘기고, 비트 읽기는 그 화면이 맡는다', () => {
    expect(SOURCE).toMatch(/<BitDashboard\b/)
    expect(SOURCE).toMatch(/initial=\{dashboardSummarySource\(\)\}/)
    expect(SOURCE).not.toMatch(/readBitDays|chrome/)
  })

  it('AC-307.5·AC-414.7: h1은 큰 문장 "비트 PC를 연결하면 오늘 숫자가 여기에 채워져요" 하나다', () => {
    expect(h1Texts(renderAt(AT_TODAY))).toEqual([H1])
  })

  it('AC-307.5·AC-414.3·AC-414.4: 분석 칸은 모두 연결 전 모양이다 — 숫자 칸 넷 "연결하면 보여요", 연결 전 칩, "연결하면 생기는 것 4가지"(빈 그래프 틀·차트 부품 없음)', () => {
    const html = renderAt(AT_TODAY)
    const text = plain(html)
    expect(countOf(text, '연결하면 보여요')).toBe(4)
    expect(text).toContain('비트 PC 연결 전')
    expect(text).toContain('연결하면 이 숫자로 원장님 보고 문장을 만들어 맨 위 큰 문장 자리에 올려요.')
    expect(text).toContain(GAINS_TITLE)
    expect(text).toContain(GAINS_NOTE)
    expect(text).not.toContain('비트 PC를 연결하면 이 기간의 하루하루가 막대로 그려집니다')
    // 연결 뒤에만 나오는 것: 보고 문장 · 연결 뒤 빈 값 글자 · 그래프 칸 · 차트 부품(쌓은 막대의 화면 읽기 표)
    expect(text).not.toContain('원장님 보고 문장 ')
    expect(text).not.toContain('자료 없음')
    expect(html).not.toMatch(/<table\b/)
    expect(html).not.toMatch(/<h3\b/)
  })

  it('AC-307.5·AC-414.7·AC-010.1: 고정 글자(날짜 줄 · 기간 글자 · 기간 단추 셋 · 연결 순서 번호와 "5단계" · "4가지"와 번호 1~4 · 기능 수 글 · 시안 설명 · 안내 줄)를 빼면 숫자가 없다(지어낸 숫자 없음)', () => {
    let html = renderAt(AT_TODAY)
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
  // 자료 읽는 자리가 이번 한 번만 가짜 자료를 준다
  const renderConnected = () => {
    vi.mocked(dashboardSummarySource).mockReturnValueOnce(SOURCE_DATA)
    return renderAt(AT_TODAY)
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('AC-307.6·AC-605.1: 화면 = <DashboardHome dateLine={<DateControl … />} report={<ReportBlock … />} analysis={<DashboardAnalysis … source={가짜 자료} />} /> 그대로다', () => {
    expect(renderConnected()).toBe(
      renderToStaticMarkup(
        <DashboardHome
          today={TODAY}
          dateLine={<DateControl today={TODAY} selected={TODAY} onChange={() => {}} />}
          report={<ReportBlock today={TODAY} days={DAYS} />}
          analysis={<DashboardAnalysis today={TODAY} source={SOURCE_DATA} />}
        />,
      ),
    )
  })

  it('AC-307.6·AC-605.1: 위에서부터 날짜 고르기(오늘) → 원장님 보고 문장 · [복사] → h1 첫 문장 → 지금 바로 쓸 수 있어요(사전점검 · [비트 PC 연결 다시 확인]) → 오늘 하루 분석 → 기간별 흐름 → 기능 목차', () => {
    const html = renderConnected()
    const dateControl = html.indexOf('role="group" aria-label="날짜 고르기"')
    expect(dateControl).toBeGreaterThanOrEqual(0)
    expect(html).toContain(`value="${TODAY}"`)
    expectAscending([
      ['날짜 고르기', dateControl],
      ['원장님 보고 문장', placeOf(html, 'p', '원장님 보고 문장')],
      ['복사', placeOf(html, 'button', '복사')],
      ['h1 첫 문장', placeOf(html, 'h1', '오늘 환자 13명이 왔습니다.')],
      ['나머지 문장', placeOf(html, 'p', '신환 4명, 재진 9명입니다. 지난주 토요일보다 3명 많습니다.')],
      ['지금 바로 쓸 수 있어요', placeOf(html, 'h2', '지금 바로 쓸 수 있어요')],
      ['사전점검', placeOf(html, 'p', '삭감 예방 사전점검')],
      ['사전점검 열기', placeOf(html, 'a', '사전점검 열기')],
      ['비트 PC 연결 다시 확인', placeOf(html, 'a', '비트 PC 연결 다시 확인')],
      ['오늘 하루 분석', placeOf(html, 'h2', '오늘 하루 분석')],
      ['기간별 흐름', placeOf(html, 'h2', '기간별 흐름')],
      ['기능 목차', placeOf(html, 'h2', '기능 목차')],
    ])
    expect(hrefOf(html, '사전점검 열기')).toBe('/claim')
    expect(hrefOf(html, '비트 PC 연결 다시 확인')).toBe('/claim/setup')
  })

  it('AC-605.8: 오늘이 10월 31일인 저장 숫자 화면에서도 날짜 고르기 옆에 "·"과 "이번 달 마지막 날"이 붙는다', () => {
    const html = renderConnected()
    const dateControl = /<div role="group" aria-label="날짜 고르기"[\s\S]*?<\/div>/.exec(html)?.[0] ?? ''
    expect(plain(dateControl)).toBe('10월 31일 토요일 · 이번 달 마지막 날')
    expect(html.match(/이번 달 마지막 날/g)).toHaveLength(1)
  })

  it('AC-307.6: h1은 보고 문장의 첫 문장 하나다', () => {
    expect(h1Texts(renderConnected())).toEqual(['오늘 환자 13명이 왔습니다.'])
  })

  it('AC-307.6·AC-414.2·AC-414.4: 연결 전 부품이 없다 — 큰 문장 · 주 단추 · 연결 순서 · 폰 아래 단추 · 연결하면 바로 쓸 수 있어요 줄 · 연결 전 빈 상태 · 연결하면 생기는 것', () => {
    const html = renderConnected()
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

  it('AC-307.6: 오늘 하루 분석은 가짜 자료의 숫자다 — 오늘 환자 수 13 · 신환 4 · 재진 9 · 지난주 토요일보다', () => {
    const text = plain(renderConnected())
    expect(text).toContain('오늘 환자 수 13 명')
    expect(text).toContain('신환 4 명')
    expect(text).toContain('재진 9 명')
    expect(text).toContain('지난주 같은 요일보다')
    expect(text).toContain('지난주 토요일')
  })
})

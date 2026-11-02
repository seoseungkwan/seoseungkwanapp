// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Icon, type IconName } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { nestedBoxes } from '@/testing/boxes'
import { DashboardHome } from './DashboardHome'
import { DASHBOARD_FEATURES, type FeatureStatus } from './features'

// 대시보드 짜임 (tab-frame REQ-306·REQ-316, design.md '대시보드 짜임', 시안 docs/mockups/dashboard-home/ + 메모 notes.md §3·§4·§6·§7).
// 연결 전(report null)과 연결 뒤(report 있음)를 둘 다 그린다. 연결 뒤의 보고 문장·분석은 갈래 라 몫이라 시험 안 가짜 노드로 자리만 본다.
// jsdom은 CSS를 계산하지 않는다 → 짜임·글자·주소는 DOM으로, 모양·폭별 칸·반응은 정해 둔 클래스로 본다(보이는 모양은 TASK-10 사진)
// ui-90 REQ-414(design.md '대시보드 (TASK-11)', 시안 docs/mockups/ui-90/app/gen.py dash_body·FEATS): 연결 전 문구(~요), "연결하면 바로 쓸 수 있어요" 줄,
// 기능 목차 상태 셋(연결 먼저 · 사용 가능 · 준비 중), 보조 글 small + 최대 폭, data-page-surface 없음, 연결 판정 report != null

const DIR = join(process.cwd(), 'src/components/dashboard/briefing')
const SOURCES = readdirSync(DIR)
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
  .map((f) => ({ file: f, text: readFileSync(join(DIR, f), 'utf8') }))

const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const classesOf = (el: Element) => tokens(el.getAttribute('class') ?? '')
const hasAll = (el: Element, classes: string) => expect(classesOf(el)).toEqual(expect.arrayContaining(tokens(classes)))
const hasNone = (el: Element, classes: string) => {
  for (const t of tokens(classes)) expect(classesOf(el), t).not.toContain(t)
}
const textOf = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
const iconInner = (name: IconName) => renderToStaticMarkup(<Icon name={name} />).replace(/^<svg\b[^>]*>|<\/svg>$/g, '')
// 꾸밈 아이콘: aria-hidden svg, 크기, 공통 그림
const expectIcon = (el: Element | null, name: IconName, size: number) => {
  expect(el?.tagName.toLowerCase()).toBe('svg')
  const svg = el as SVGElement
  expect(svg.getAttribute('aria-hidden')).toBe('true')
  expect(svg.getAttribute('width')).toBe(String(size))
  expect(svg.innerHTML).toBe(iconInner(name))
}
// a가 b보다 앞(문서 순서)
const expectOrder = (...els: Array<Element | null>) => {
  for (let i = 1; i < els.length; i += 1) {
    expect(els[i - 1], `${i - 1}번`).not.toBeNull()
    expect(els[i], `${i}번`).not.toBeNull()
    expect((els[i - 1] as Element).compareDocumentPosition(els[i] as Element) & Node.DOCUMENT_POSITION_FOLLOWING, `${i - 1}번 → ${i}번`).toBeTruthy()
  }
}
// 글자가 꼭 같은 요소 하나. selector가 없으면 가장 안쪽 요소, 있으면 그 태그
const byText = (root: Element, text: string, selector?: string) => {
  const found = Array.from(root.querySelectorAll(selector ?? '*')).filter(
    (el) => textOf(el) === text && (selector !== undefined || !Array.from(el.children).some((c) => textOf(c) === text)),
  )
  expect(found, text).toHaveLength(1)
  return found[0]
}
const noText = (root: Element, text: string) => expect(textOf(root)).not.toContain(text)

const TODAY = '2026-10-31' // 토요일 · 그 달 마지막 날
const ANALYSIS_TEXT = '가짜 분석 자리'
const REPORT_TEXT = '가짜 보고 문장 첫 문장'
const analysis = <section data-testid="analysis">{ANALYSIS_TEXT}</section>
const report: ReactNode = (
  <div data-testid="report">
    <h1>{REPORT_TEXT}</h1>
  </div>
)
const renderBefore = (today = TODAY) => render(<DashboardHome today={today} report={null} analysis={analysis} />).container
const renderAfter = (node: ReactNode = report) => render(<DashboardHome today={TODAY} report={node} analysis={analysis} />).container
// 연결 전을 그려 보고, 지운 뒤 연결 뒤를 그려 본다
const forBoth = (check: (container: HTMLElement) => void) => {
  check(renderBefore())
  cleanup()
  check(renderAfter())
}

const rootOf = (container: HTMLElement) => {
  expect(container.children).toHaveLength(1)
  return container.firstElementChild as HTMLElement
}
const brief = () => screen.getByRole('region', { name: '오늘 브리핑' })
const briefLeft = () => brief().children[0] as HTMLElement
const briefRight = () => brief().children[1] as HTMLElement
const dateLineEl = () => briefLeft().firstElementChild as HTMLElement
// 섹션: h2 이름으로 찾은 section
const sectionNamed = (name: string) => {
  const h2 = screen.getByRole('heading', { level: 2, name })
  const section = h2.closest('section')
  expect(section, name).not.toBeNull()
  return section as HTMLElement
}
const mainLink = () => screen.getByRole('link', { name: '비트 PC 연결 시작' }) // 아래 단추는 aria-hidden이라 빠진다
const STEPS = ['크롬 확장 프로그램 설치', '도우미 설치', '연결', '비트 자료 읽기', '요양기관기호 확인']
// 연결 전 문구 (AC-414.1·414.2·414.5, 시안 dash_body 글자 그대로)
const H1 = '비트 PC를 연결하면 오늘 숫자가 여기에 채워져요'
const LEAD = '아직 받은 진료 자료가 없어 오늘 분석이 비어 있어요. 연결은 처음 한 번만 하면 되고, 연결한 뒤에는 이 자리에 오늘의 보고 문장이 올라와요.'
const TRUST = '환자 개인정보는 의원 PC 밖으로 나가지 않아요. 비트 자료는 읽기만 해요.'
const ROW_TITLE = '연결하면 바로 쓸 수 있어요'
const ROW_SIDE = '삭감 예방 사전점검은 비트 PC를 연결한 뒤 열려요.'
const DESC = '청구하기 전에 삭감될 만한 처방을 미리 찾아 줘요.'
const DESC_SUB = '청구 점검은 비트 PC의 크롬에서 열려요.'
// 기능 목차의 개수는 손으로 적지 않고 목록에서 센다(worklog AC-012.5·ai-report-screen AC-714.4: 다른 갈래가 탭을 채워도 그대로 통과한다)
const featureCount = (status: FeatureStatus) => DASHBOARD_FEATURES.filter((f) => f.status === status).length
const INDEX_SIDE = `${DASHBOARD_FEATURES.length}개 가운데 ${featureCount('ready')}개는 지금, ${featureCount('connect-first')}개는 연결하면 쓸 수 있어요`
const PC_STEPS_NOTE = '설정의 비트 PC 연결 화면이 한 단계씩 안내해요.'
const PHONE_STEPS_NOTE = '연결은 비트 PC의 크롬에서 해요. 설정의 비트 PC 연결 화면이 한 단계씩 안내해요.'
// 보조 글(AC-414.6): small(13px) muted + 시안 40em(13px × 40 = 520px)에 가장 가까운 4px 단위 폭 단계
const NOTE = 'text-small text-muted max-w-130'
const SECTION = 'mt-12 border-t border-line-strong pt-5 max-md:mt-8 max-md:pt-4'
const SECTION_HEAD = 'mb-4 flex flex-wrap items-center gap-3'
const REACT_PRESS = 'transition not-disabled:active:translate-y-px'
const ARROW_MOVE = 'transition group-hover:translate-x-0.5'

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', undefined)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('DashboardHome: 날짜 줄 (AC-306.1)', () => {
  it('AC-306.1: 맨 위 날짜 줄(p, small muted) — 날짜 글자만 600 ink "10월 31일 토요일"', () => {
    renderBefore()
    const line = dateLineEl()
    expect(line.tagName.toLowerCase()).toBe('p')
    hasAll(line, 'text-small text-muted')
    const date = byText(line, '10월 31일 토요일')
    hasAll(date, 'font-semibold text-ink')
  })

  it('AC-306.1·AC-407.2: 그 달 마지막 날이면 뒤에 "·"(muted, 좌우 8px) + "이번 달 마지막 날"', () => {
    renderBefore()
    const line = dateLineEl()
    expect(textOf(line)).toBe('10월 31일 토요일 · 이번 달 마지막 날')
    hasAll(line, 'flex flex-wrap gap-x-2')
    const dot = byText(line, '·')
    hasAll(dot, 'text-muted')
    hasNone(dot, 'text-faint')
    // 왼쪽 8px = 줄의 사이, 오른쪽 8px = "·"와 덧말 묶음의 사이(넘치면 함께 내려간다)
    const note = dot.parentElement as HTMLElement
    expect(note.parentElement).toBe(line)
    expect(textOf(note)).toBe('· 이번 달 마지막 날')
    hasAll(note, 'inline-flex gap-x-2')
    hasNone(note, 'font-semibold text-ink')
  })

  it('AC-306.1: 보통 날은 덧말이 없다 — "10월 29일 목요일"만', () => {
    renderBefore('2026-10-29')
    const line = dateLineEl()
    expect(textOf(line)).toBe('10월 29일 목요일')
    expect(line.children).toHaveLength(1)
  })

  it('AC-306.1: 연결 뒤에도 같은 날짜 줄이 왼쪽 칸 맨 위에 있다', () => {
    renderAfter()
    expect(textOf(dateLineEl())).toBe('10월 31일 토요일 · 이번 달 마지막 날')
  })
})

describe('DashboardHome: 연결 전 큰 문장 (AC-306.2·AC-414.1)', () => {
  it('AC-306.2·AC-414.1: 화면의 h1은 큰 문장 하나 "비트 PC를 연결하면 오늘 숫자가 여기에 채워져요" — display-m 600(폰 heading-m), text-balance', () => {
    const container = renderBefore()
    const h1s = container.querySelectorAll('h1')
    expect(h1s).toHaveLength(1)
    expect(textOf(h1s[0])).toBe(H1)
    hasAll(h1s[0], 'text-display-m font-semibold text-ink text-balance max-md:text-heading-m mt-3 max-md:mt-2')
  })

  it('AC-306.2·AC-414.1: 날짜 줄 → h1 → 안내 문장(lead ink-2) → [비트 PC 연결 시작] → 안심 줄 차례, 문구는 시안 글자 그대로', () => {
    renderBefore()
    const left = briefLeft()
    const h1 = left.querySelector('h1')
    const lead = byText(left, LEAD)
    const trust = byText(left, TRUST, 'p')
    expectOrder(dateLineEl(), h1, lead, mainLink(), trust)
    expect(lead.tagName.toLowerCase()).toBe('p')
    hasAll(lead, 'mt-4 text-lead text-ink-2')
    expect(left.contains(mainLink())).toBe(true)
  })

  it('AC-306.2: [비트 PC 연결 시작]은 /claim/setup 링크, ds.button.primaryLarge + 오른쪽 꾸밈 arrow 16, 폰 전체 폭', () => {
    renderBefore()
    const link = mainLink()
    expect(link.getAttribute('href')).toBe('/claim/setup')
    expect(textOf(link)).toBe('비트 PC 연결 시작')
    hasAll(link, `${ds.button.primaryLarge} group max-md:w-full`)
    expect(link.id).toBe('dashboard-connect-start') // 휴대폰 아래 단추가 이 id로 지켜본다
    expectIcon(link.lastElementChild, 'arrow', 16)
    // 단추 위 24px(폰 20px)
    hasAll(link.parentElement as HTMLElement, 'mt-6 max-md:mt-5')
  })

  it('AC-306.2·AC-414.1·AC-414.6: 안심 줄은 small muted(최대 폭 max-w-130), 앞에 꾸밈 shield 14 positive', () => {
    renderBefore()
    const trust = byText(briefLeft(), TRUST, 'p')
    hasAll(trust, `mt-4 flex gap-1.5 ${NOTE}`)
    hasNone(trust, 'text-caption')
    expectIcon(trust.firstElementChild, 'shield', 14)
    hasAll(trust.firstElementChild as Element, 'text-positive shrink-0')
  })

  it('AC-306.2·AC-414.2: 짜임 차례 — 브리핑 → 연결하면 바로 쓸 수 있어요 → analysis 자리(받은 그대로) → 기능 목차 → 휴대폰 아래 단추', () => {
    const container = renderBefore()
    const root = rootOf(container)
    const analysisNode = screen.getByTestId('analysis')
    expect(textOf(analysisNode)).toBe(ANALYSIS_TEXT)
    expect(analysisNode.parentElement).toBe(root)
    expectOrder(brief(), sectionNamed(ROW_TITLE), analysisNode, sectionNamed('기능 목차'), root.querySelector('.sticky'))
    expect(root.lastElementChild).toBe(root.querySelector('.sticky'))
    expect(Array.from(root.children).map((el) => el.tagName.toLowerCase())).toEqual(['section', 'section', 'section', 'section', 'div'])
  })

  it('AC-306.2: analysis를 주지 않으면 그 자리가 비고 다른 짜임은 그대로', () => {
    const { container } = render(<DashboardHome today={TODAY} report={null} />)
    const root = rootOf(container)
    expect(Array.from(root.children).map((el) => el.tagName.toLowerCase())).toEqual(['section', 'section', 'section', 'div'])
  })
})

describe('DashboardHome: 연결 전 연결 순서 (AC-306.3)', () => {
  it('AC-306.3: 768px 이상 — 머리 "연결 순서" · "5단계"(아래 1px line-strong)와 ol 다섯 줄, 아래 줄 안내', () => {
    renderBefore()
    const pc = briefRight().querySelector('.max-md\\:hidden') as HTMLElement
    expect(pc).not.toBeNull()
    const title = within(pc).getByRole('heading', { level: 2, name: '연결 순서' })
    hasAll(title, 'text-small font-semibold text-ink')
    const head = title.parentElement as HTMLElement
    hasAll(head, 'flex justify-between border-b border-line-strong pb-2')
    hasAll(byText(head, '5단계'), 'text-small font-medium text-muted')
    const list = within(pc).getByRole('list', { name: '연결 순서' })
    expect(list.tagName.toLowerCase()).toBe('ol')
    hasAll(list, 'list-none')
    const rows = within(list).getAllByRole('listitem')
    expect(rows.map((li) => textOf(li.lastElementChild))).toEqual(STEPS)
    rows.forEach((li, i) => {
      hasAll(li, 'flex min-h-11 items-center gap-3 border-b border-line')
      const no = li.firstElementChild as HTMLElement
      expect(textOf(no)).toBe(String(i + 1))
      hasAll(no, 'size-5 shrink-0 border border-line-strong rounded-control text-caption font-semibold text-muted')
      hasAll(li.lastElementChild as Element, 'text-body text-ink-2')
    })
    const foot = byText(pc, PC_STEPS_NOTE, 'p')
    hasAll(foot, `mt-3 ${NOTE}`) // AC-414.6: 안내 줄 small + 최대 폭
    hasNone(foot, 'text-caption')
  })

  it('AC-306.3: 단계 칩("지금 할 일"·"대기")과 지금 단계 강조가 없다 — 대시보드는 연결 상태를 판정하지 않는다', () => {
    const container = renderBefore()
    noText(container, '지금 할 일')
    noText(container, '대기')
    const rows = Array.from(briefRight().querySelectorAll('li'))
    expect(rows).toHaveLength(10) // 펼친 목록 5 + 접는 칸 5
    for (const li of rows) {
      expect(li.children).toHaveLength(2) // 번호 상자 + 이름(칩 없음)
      hasNone(li, 'bg-accent')
      hasNone(li.children[0], 'bg-accent text-surface border-accent')
      hasNone(li.children[1], 'font-semibold text-ink')
    }
  })

  it('AC-306.3: 768px 미만 — 같은 목록이 처음 접힌 <details>(md:hidden) 안, 요약 줄 56px 이상 + 꺾쇠 chev(열리면 180° 회전, 150ms)', () => {
    renderBefore()
    const details = briefRight().querySelector('details') as HTMLDetailsElement
    expect(details).not.toBeNull()
    expect(details.open).toBe(false)
    hasAll(details, 'group md:hidden border-t border-b border-t-line-strong border-b-line')
    const summary = details.querySelector('summary') as HTMLElement
    hasAll(summary, 'min-h-14 cursor-pointer list-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent')
    hasAll(byText(summary, '연결 순서 5단계'), 'text-body font-semibold text-ink')
    hasAll(byText(summary, '처음은 크롬 확장 프로그램 설치'), 'text-caption text-muted')
    const chev = summary.querySelector('svg')
    expectIcon(chev, 'chev', 16)
    hasAll(chev as Element, 'transition group-open:rotate-180 text-muted')
    const list = details.querySelector('ol') as HTMLElement
    hasAll(list, 'list-none border-t border-line')
    expect(Array.from(list.querySelectorAll('li')).map((li) => textOf(li.lastElementChild))).toEqual(STEPS)
    expect(Array.from(list.querySelectorAll('li')).map((li) => textOf(li.firstElementChild))).toEqual(['1', '2', '3', '4', '5'])
    const foot = byText(details, PHONE_STEPS_NOTE, 'p')
    hasAll(foot, NOTE) // AC-414.6: 안내 줄 small + 최대 폭
    hasNone(foot, 'text-caption')
  })

  it('AC-306.3: 펼친 목록(max-md:hidden)과 접는 칸(md:hidden) 두 벌이고, 나머지 오른쪽 칸에는 다른 것이 없다', () => {
    renderBefore()
    const right = briefRight()
    expect(right.children).toHaveLength(2)
    hasAll(right.children[0], 'max-md:hidden')
    expect(right.children[1].tagName.toLowerCase()).toBe('details')
  })
})

describe('DashboardHome: 연결 뒤 (AC-306.5)', () => {
  it('AC-306.5: 날짜 줄 아래 왼쪽 칸에 받은 report를 그대로 그린다', () => {
    renderAfter()
    const left = briefLeft()
    const node = screen.getByTestId('report')
    expect(node.parentElement).toBe(left)
    expect(left.children).toHaveLength(2)
    expectOrder(dateLineEl(), node)
    expect(textOf(node)).toBe(REPORT_TEXT)
  })

  it('AC-306.5: DashboardHome은 h1을 그리지 않는다 — h1은 report 안의 것뿐', () => {
    const container = renderAfter()
    const h1s = Array.from(container.querySelectorAll('h1'))
    expect(h1s).toHaveLength(1)
    expect(screen.getByTestId('report').contains(h1s[0])).toBe(true)
    cleanup()
    expect(renderAfter(<p data-testid="report">h1 없는 보고</p>).querySelectorAll('h1')).toHaveLength(0)
  })

  it('AC-306.5·AC-414.2: 큰 문장 · 안내 문장 · 주 단추 · 안심 줄 · 연결 순서 · 폰 아래 단추 · 연결 전 "연결하면 바로 쓸 수 있어요" 줄이 없다', () => {
    const container = renderAfter()
    for (const text of [H1, LEAD, '비트 PC 연결 시작', TRUST, '연결 순서', '5단계', ROW_TITLE, ROW_SIDE, '비트 PC 연결부터'])
      noText(container, text)
    expect(container.querySelector('details')).toBeNull()
    expect(container.querySelector('ol')).toBeNull()
    expect(container.querySelector('.sticky')).toBeNull()
    expect(container.querySelectorAll('[id="dashboard-connect-start"]')).toHaveLength(0)
    // '지금 바로 쓸 수 있어요'는 브리핑 오른쪽 칸 안 하나뿐
    const heads = screen.getAllByRole('heading', { level: 2, name: '지금 바로 쓸 수 있어요' })
    expect(heads).toHaveLength(1)
    expect(briefRight().contains(heads[0])).toBe(true)
  })

  it('AC-306.5: 짜임 차례 — 브리핑(날짜·report | 지금 바로) → analysis 자리 → 기능 목차', () => {
    const container = renderAfter()
    const root = rootOf(container)
    expect(Array.from(root.children).map((el) => el.tagName.toLowerCase())).toEqual(['section', 'section', 'section'])
    expectOrder(brief(), screen.getByTestId('analysis'), sectionNamed('기능 목차'))
    expectOrder(screen.getByTestId('report'), briefRight())
  })
})

describe('DashboardHome: 폭별 칸·바탕 (AC-306.6·AC-414.6)', () => {
  it('AC-306.6·AC-414.6: 뿌리에 data-page-surface가 없고(바탕은 앱 틀이 늘 흰색, ui-90 AC-404.1), 앱 틀 안쪽 여백에 위 8px·아래 16px(폰 위 4px·아래 0)을 더한다', () => {
    forBoth((container) => {
      const root = rootOf(container)
      expect(root.tagName.toLowerCase()).toBe('div')
      expect(root.hasAttribute('data-page-surface')).toBe(false)
      expect(container.querySelector('[data-page-surface]')).toBeNull()
      expect(classesOf(root).sort()).toEqual(tokens('pt-2 pb-4 max-md:pt-1 max-md:pb-0').sort())
    })
  })

  it('AC-306.6: 1024px 이상 12칸 격자(사이 24px) — 왼쪽 1~7칸, 오른쪽 9~12칸(위 4px)', () => {
    renderBefore()
    hasAll(brief(), 'lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-6')
    expect(brief().children).toHaveLength(2)
    hasAll(briefLeft(), 'lg:col-span-7')
    hasAll(briefRight(), 'lg:col-span-4 lg:col-start-9 lg:pt-1 lg:mt-0')
  })

  it('AC-306.6: 768~1023px — 왼쪽 전체 폭(글 최대 32em), 오른쪽은 그 아래 전체 폭 위 32px(연결 순서는 펼친 목록)', () => {
    renderBefore()
    hasAll(briefLeft(), 'md:max-lg:max-w-128')
    hasAll(briefRight(), 'mt-8')
    hasAll(briefRight().children[0], 'max-md:hidden') // 768px 이상은 펼친 목록
    // 큰 문장 최대 15em(display-m 32px = 480px), 안내 문장 최대 32em(lead 16px = 512px)
    hasAll(document.querySelector('h1') as Element, 'max-w-120')
    hasAll(byText(briefLeft(), LEAD), 'max-w-128')
  })

  it('AC-306.6: 768px 미만은 위에서 아래로 쌓인다 — 격자는 lg:에서만, 연결 전 오른쪽은 위 20px(접는 칸)', () => {
    renderBefore()
    for (const t of classesOf(brief())) expect(t, t).toMatch(/^lg:/)
    hasAll(briefRight(), 'max-md:mt-5')
  })

  it('AC-306.6: 연결 뒤 오른쪽 칸 — 768~1023px 위 32px, 폰은 보고 문장 다음 위 1px line-strong + 위 32·16px로 나눈 덩어리', () => {
    renderAfter()
    hasAll(briefRight(), 'mt-8 lg:mt-0 lg:col-span-4 lg:col-start-9 lg:pt-1 max-md:border-t max-md:border-line-strong max-md:pt-4')
  })

  it('AC-306.6: 가로로 밀리지 않는다 — 고정 폭·화면 폭 클래스·옆 밀기가 없다', () => {
    forBoth((container) => {
      const all = Array.from(container.querySelectorAll('*')).flatMap(classesOf)
      for (const t of all) {
        expect(t, t).not.toMatch(/(?:^|:)(?:min-)?w-(?!full$|0$)/)
        expect(t, t).not.toMatch(/(?:^|:)(?:w-screen|overflow-x-auto|overflow-x-scroll)$/)
      }
    })
  })
})

describe('DashboardHome: 단추 반응 (AC-306.7)', () => {
  const buttonsOf = (container: HTMLElement) => Array.from(container.querySelectorAll('a'))

  it('AC-306.7: 모든 링크·단추가 색 150ms(transition)와 누름 아래 1px(not-disabled:active:translate-y-px)', () => {
    forBoth((container) => {
      const links = buttonsOf(container)
      expect(links.length).toBeGreaterThan(12)
      for (const a of links) hasAll(a, REACT_PRESS)
    })
  })

  it('AC-306.7: 단추 안 오른쪽 화살표는 올림에 오른쪽 2px — 단추에 group, 화살표에 group-hover:translate-x-0.5', () => {
    forBoth((container) => {
      const arrows = Array.from(container.querySelectorAll('a svg'))
      expect(arrows.length).toBeGreaterThan(2)
      for (const svg of arrows) {
        hasAll(svg, ARROW_MOVE)
        hasAll(svg.closest('a') as Element, 'group')
      }
    })
  })

  it('AC-306.7: 글자 단추 [비트 PC 연결 다시 확인]은 밑줄 색이 투명 → 글자색으로 짧게 바뀐다', () => {
    renderAfter()
    const link = screen.getByRole('link', { name: '비트 PC 연결 다시 확인' })
    hasAll(link, `${ds.textButton} ${REACT_PRESS} underline decoration-transparent not-disabled:not-aria-disabled:hover:decoration-current`)
  })

  it('AC-306.7·AC-406.1: 이 밖의 움직임이 없다 — 움직임 클래스는 정해 둔 짧은 반응뿐(ds 단추 누름 포함, animate-*·크기·높이·여백 바뀜 없음)', () => {
    const ALLOWED = new Set([
      'transition',
      'not-disabled:active:translate-y-px',
      'group-hover:translate-x-0.5',
      'group-open:rotate-180',
      // ds.button에서 온 누름(ui-90 AC-406.1): 막히지도 기다리지도 않을 때만 아래 1px
      'not-disabled:not-aria-disabled:not-aria-busy:active:translate-y-px',
      // 휴대폰 아래 단추(StickyConnect): 아래에서 올라옴 200ms
      'duration-200',
      'translate-y-full',
      'translate-y-0',
    ])
    forBoth((container) => {
      const moving = Array.from(container.querySelectorAll('*'))
        .flatMap(classesOf)
        .filter((t) => /(?:^|:)-?(?:transition|duration|delay|ease|animate|translate|rotate|scale|skew)(?:-|$)/.test(t))
      expect([...new Set(moving)].filter((t) => !ALLOWED.has(t))).toEqual([])
      // 올림·누름·열림 변형에 크기·높이·폭·여백·글자 크기·그림자가 바뀌지 않는다
      const changing = Array.from(container.querySelectorAll('*'))
        .flatMap(classesOf)
        .filter((t) => /(?:^|:)(?:hover|active|focus|group-hover|group-open|open):(?:-?(?:m|p)[trblxyse]?-|w-|h-|size-|min-|max-|text-(?:caption|small|body|lead|subtitle|title|heading|metric|display)|shadow)/.test(t))
      expect(changing).toEqual([])
    })
  })
})

describe('DashboardHome: 소스·짜임 규칙 (AC-306.8)', () => {
  it('AC-306.8: briefing 소스는 Supabase·문지기·fetch·브라우저 저장소를 쓰지 않는다', () => {
    expect(SOURCES.map((s) => s.file).sort()).toEqual(expect.arrayContaining(['DashboardHome.tsx', 'StickyConnect.tsx', 'dateLine.ts', 'features.ts']))
    for (const { file, text } of SOURCES) {
      expect(text, file).not.toMatch(/@\/lib\/supabase|supabase-js|guard\.server|hospital\.server|lib\/auth\b|\bfetch\(|localStorage|sessionStorage|indexedDB|document\.cookie|XMLHttpRequest|navigator\.sendBeacon/)
    }
  })

  it('AC-306.8: components/shell·dashboard/summary·common/notReadyFeatures·components/claim을 불러오지 않는다', () => {
    for (const { file, text } of SOURCES) {
      const specifiers = [...text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1])
      for (const spec of specifiers) {
        expect(spec, `${file}: ${spec}`).not.toMatch(/(?:^|\/)(?:shell|summary|claim)(?:\/|$)|notReadyFeatures/)
      }
    }
  })

  it("AC-306.8: 'use client'는 폰 아래 단추 파일(StickyConnect.tsx) 하나뿐이다", () => {
    const clients = SOURCES.filter(({ text }) => /^\s*['"]use client['"]/.test(text)).map((s) => s.file)
    expect(clients).toEqual(['StickyConnect.tsx'])
  })

  it('AC-306.8: 앱 틀(main·header·nav·.app-ui)을 다시 그리지 않는다', () => {
    forBoth((container) => {
      expect(container.querySelector('main, header, nav, .app-ui')).toBeNull()
    })
  })

  it('AC-306.8: 상자 안 상자가 없다(nestedBoxes) — 연결 전·뒤 모두', () => {
    forBoth((container) => expect(nestedBoxes(container)).toEqual([]))
  })

  it('AC-306.8: overflow-hidden 클래스를 쓰지 않는다(소스와 그린 클래스 모두)', () => {
    for (const { file, text } of SOURCES) expect(text, file).not.toContain('overflow-hidden')
    forBoth((container) => {
      expect(Array.from(container.querySelectorAll('*')).flatMap(classesOf)).not.toContain('overflow-hidden')
    })
  })

  // 숫자가 든 글자 조각마다 그 조각을 품은 요소의 글자를 모은다
  const digitTexts = (root: Element) => {
    const out = new Set<string>()
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (/\d/.test(node.textContent ?? '')) out.add(textOf(node.parentElement))
    }
    return [...out].sort()
  }

  it('AC-306.8·AC-414.7: 그린 글자의 숫자는 날짜 줄 · "5단계"와 번호 1~5 · 기능 수 글뿐이다(연결 전)', () => {
    const container = renderBefore()
    expect(digitTexts(container)).toEqual(['10월 31일 토요일', '5단계', '연결 순서 5단계', '1', '2', '3', '4', '5', INDEX_SIDE].sort())
  })

  it('AC-306.8·AC-414.7: 연결 뒤에도 그린 숫자는 날짜 줄 · 기능 수 글뿐이다(가짜 report·analysis에는 숫자가 없다)', () => {
    const container = renderAfter()
    expect(digitTexts(container)).toEqual(['10월 31일 토요일', INDEX_SIDE].sort())
  })
})

describe('DashboardHome: 연결하면 바로 쓸 수 있어요 — 연결 전 한 줄 (AC-316.1·AC-414.2)', () => {
  it('AC-316.1·AC-414.2: 브리핑 다음 섹션 — h2 "연결하면 바로 쓸 수 있어요" + 옆 글 "삭감 예방 사전점검은 비트 PC를 연결한 뒤 열려요."(small muted, 최대 폭), 섹션 나눔', () => {
    renderBefore()
    const section = sectionNamed(ROW_TITLE)
    expect(section.previousElementSibling).toBe(brief())
    hasAll(section, SECTION)
    const h2 = within(section).getByRole('heading', { level: 2 })
    hasAll(h2, 'text-title font-semibold text-ink')
    const head = h2.parentElement as HTMLElement
    hasAll(head, SECTION_HEAD)
    hasAll(byText(head, ROW_SIDE), NOTE)
    // 옛 h2·옆 글(기능 수)은 없다
    expect(screen.queryByRole('heading', { level: 2, name: '지금 바로 쓸 수 있어요' })).toBeNull()
    noText(section, '기능 12개')
  })

  it('AC-316.1·AC-414.2: 줄 하나(위아래 1px line) — "청구 탭"·"삭감 예방 사전점검", 설명 두 줄(둘째 줄 "…크롬에서 열려요."), [비트 PC 연결부터](/claim/setup)', () => {
    renderBefore()
    const section = sectionNamed(ROW_TITLE)
    expect(section.children).toHaveLength(2)
    const row = section.children[1] as HTMLElement
    hasAll(row, 'border-y border-line py-4 max-md:pt-3')
    expect(row.children).toHaveLength(3)
    const [name, desc, action] = Array.from(row.children) as HTMLElement[]
    hasAll(byText(name, '청구 탭'), 'text-small text-muted')
    hasNone(byText(name, '청구 탭'), 'text-caption')
    hasAll(byText(name, '삭감 예방 사전점검'), 'text-subtitle font-semibold text-ink')
    hasAll(name, 'flex flex-col gap-0.5')
    expectOrder(byText(name, '청구 탭'), byText(name, '삭감 예방 사전점검'))
    hasAll(byText(desc, DESC, 'p'), 'text-body text-ink-2')
    hasAll(byText(desc, DESC_SUB, 'p'), 'mt-0.5 text-small text-muted')
    expectOrder(byText(desc, DESC, 'p'), byText(desc, DESC_SUB, 'p'))
    // 단추 칸에는 [비트 PC 연결부터] 하나뿐: 보조 단추 + 오른쪽 꾸밈 arrow 16(ink-2), 폰 전체 폭
    expect(action.querySelectorAll('a, button')).toHaveLength(1)
    const link = within(action).getByRole('link', { name: '비트 PC 연결부터' })
    expect(link.getAttribute('href')).toBe('/claim/setup')
    hasAll(link, `${ds.button.secondary} group no-underline max-md:w-full`)
    expectIcon(link.lastElementChild, 'arrow', 16)
    hasAll(link.lastElementChild as Element, `${ARROW_MOVE} text-ink-2`)
  })

  it('AC-414.2: 연결 전에는 [사전점검 열기]·[비트 PC 연결 다시 확인]이 없다(연결 뒤 오른쪽 칸 묶음 몫)', () => {
    renderBefore()
    expect(screen.queryByRole('link', { name: '사전점검 열기' })).toBeNull()
    expect(screen.queryByRole('link', { name: '비트 PC 연결 다시 확인' })).toBeNull()
  })

  it('AC-316.1: 1024px 이상 이름 1~3칸 · 설명 4~9칸 · 단추 10~12칸(오른쪽 끝), 768~1023px 1~4 · 5~9 · 10~12, 폰은 쌓이고 단추 전체 폭', () => {
    renderBefore()
    const row = sectionNamed(ROW_TITLE).children[1] as HTMLElement
    hasAll(row, 'md:grid md:grid-cols-12 md:items-center md:gap-x-6')
    for (const t of classesOf(row)) expect(t, t).not.toMatch(/^(?:grid|grid-cols-)/) // 폰은 격자가 아니다
    const [name, desc, action] = Array.from(row.children) as HTMLElement[]
    hasAll(name, 'md:col-span-4 lg:col-span-3 min-w-0')
    hasAll(desc, 'md:col-span-5 md:col-start-5 lg:col-span-6 lg:col-start-4 min-w-0 max-md:mt-1')
    hasAll(action, 'md:col-span-3 md:col-start-10 md:justify-self-end max-md:mt-3')
  })
})

describe('DashboardHome: 지금 바로 쓸 수 있어요 — 연결 뒤 오른쪽 칸 (AC-316.2)', () => {
  it('AC-316.2: 머리 "지금 바로 쓸 수 있어요"(small 600, 폰 title) · 오른쪽 "청구 탭"(muted), 아래 1px line-strong(폰 없음)', () => {
    renderAfter()
    const right = briefRight()
    const h2 = within(right).getByRole('heading', { level: 2, name: '지금 바로 쓸 수 있어요' })
    hasAll(h2, 'text-small font-semibold text-ink max-md:text-title')
    const head = h2.parentElement as HTMLElement
    hasAll(head, 'flex items-center justify-between border-b border-line-strong pb-2 max-md:border-b-0 max-md:pb-0')
    hasAll(byText(head, '청구 탭'), 'text-small font-medium text-muted')
  })

  it('AC-316.2·AC-414.2: "삭감 예방 사전점검" → 설명 + 둘째 줄 "…크롬에서 열려요."(small muted) → [사전점검 열기](/claim, 보조) + [비트 PC 연결 다시 확인](/claim/setup, 글자 단추)', () => {
    renderAfter()
    const right = briefRight()
    const name = byText(right, '삭감 예방 사전점검')
    hasAll(name, 'text-subtitle font-semibold text-ink')
    const desc = byText(right, DESC, 'p')
    hasAll(desc, 'text-body text-ink-2')
    const second = byText(right, DESC_SUB, 'p')
    hasAll(second, 'mt-0.5 text-small text-muted')
    const open = within(right).getByRole('link', { name: '사전점검 열기' })
    const recheck = within(right).getByRole('link', { name: '비트 PC 연결 다시 확인' })
    expect(open.getAttribute('href')).toBe('/claim')
    expect(recheck.getAttribute('href')).toBe('/claim/setup')
    hasAll(open, `${ds.button.secondary} group`)
    expectIcon(open.lastElementChild, 'arrow', 16)
    hasAll(recheck, ds.textButton)
    expectOrder(within(right).getByRole('heading', { level: 2 }), name, desc, second, open, recheck)
    expect(open.parentElement).toBe(recheck.parentElement)
    hasAll(open.parentElement as HTMLElement, 'mt-4 flex flex-wrap items-center gap-x-4 gap-y-2')
  })

  it('AC-316.2: 768px 미만은 두 단추가 전체 폭으로 쌓인다', () => {
    renderAfter()
    const open = within(briefRight()).getByRole('link', { name: '사전점검 열기' })
    const recheck = within(briefRight()).getByRole('link', { name: '비트 PC 연결 다시 확인' })
    hasAll(open.parentElement as HTMLElement, 'max-md:grid max-md:gap-1')
    hasAll(open, 'max-md:w-full')
    hasAll(recheck, 'max-md:w-full max-md:justify-center')
  })

  it('AC-316.2·AC-414.2: 옆 글("기능 12개 …" · "…연결한 뒤 열려요.")과 [비트 PC 연결부터]는 없다', () => {
    renderAfter()
    noText(briefRight(), '기능 12개')
    noText(briefRight(), '다른 하나는')
    noText(briefRight(), ROW_SIDE)
    noText(briefRight(), '비트 PC 연결부터')
  })

  it('AC-316.2: 머리 h2의 id는 useId로 만든다 — 두 벌을 함께 그려도 id가 겹치지 않는다(고정 id 없음)', () => {
    render(
      <>
        <DashboardHome today={TODAY} report={report} />
        <DashboardHome today={TODAY} report={report} />
      </>,
    )
    const ids = screen.getAllByRole('heading', { level: 2, name: '지금 바로 쓸 수 있어요' }).map((h) => h.id)
    expect(ids).toHaveLength(2)
    for (const id of ids) expect(id).not.toBe('')
    expect(new Set(ids).size).toBe(2)
    expect(ids).not.toContain('dashboard-ready-now-side-title')
  })
})

describe('DashboardHome: 기능 목차 (AC-316.4·AC-414.5)', () => {
  const list = () => screen.getByRole('list', { name: '기능' })
  // 칸 하나의 상태 글자(이름 줄 오른쪽)
  const statusOf = (link: Element) => (link.children[0] as HTMLElement).children[1] as HTMLElement
  const linkOf = (name: string) => {
    const link = Array.from(list().querySelectorAll('a')).find((a) => textOf(a.querySelector('a > span > span')) === name)
    expect(link, name).toBeDefined()
    return link as HTMLElement
  }
  // "사용 가능"(accent 500 + 꾸밈 arrow 14) / "연결 먼저"(ink-2 600 + 꾸밈 arrow 14) / "준비 중"(muted, 화살표 없음). 셋 다 small(13px)
  const expectUsable = (status: HTMLElement) => {
    expect(textOf(status)).toBe('사용 가능')
    hasAll(status, 'inline-flex shrink-0 items-center gap-0.5 text-small font-medium text-accent')
    hasNone(status, 'text-caption text-ink-2 font-semibold')
    expectIcon(status.lastElementChild, 'arrow', 14)
    hasAll(status.lastElementChild as Element, ARROW_MOVE)
  }
  const expectConnectFirst = (status: HTMLElement) => {
    expect(textOf(status)).toBe('연결 먼저')
    hasAll(status, 'inline-flex shrink-0 items-center gap-0.5 text-small font-semibold text-ink-2')
    hasNone(status, 'text-caption text-accent font-medium')
    expectIcon(status.lastElementChild, 'arrow', 14)
    hasAll(status.lastElementChild as Element, ARROW_MOVE)
  }
  const expectSoon = (status: HTMLElement) => {
    expect(textOf(status)).toBe('준비 중')
    hasAll(status, 'shrink-0 text-small text-muted')
    hasNone(status, 'text-caption text-faint text-accent text-ink-2')
    expect(status.querySelector('svg')).toBeNull()
  }

  it('AC-316.4·AC-414.5·AC-714.4·AC-012.5: 섹션 h2 "기능 목차" + 옆 "n개 가운데 n개는 지금, n개는 연결하면 쓸 수 있어요"(숫자는 목록에서 센다, small muted, 최대 폭), 섹션 나눔 — 연결 전·뒤 모두', () => {
    forBoth(() => {
      const section = sectionNamed('기능 목차')
      hasAll(section, SECTION)
      const h2 = within(section).getByRole('heading', { level: 2 })
      hasAll(h2, 'text-title font-semibold text-ink')
      hasAll(h2.parentElement as HTMLElement, SECTION_HEAD)
      hasAll(byText(section, INDEX_SIDE), NOTE)
      noText(section, '2개를 지금 쓸 수 있어요')
      expect(section.contains(list())).toBe(true)
    })
  })

  it('AC-316.4: 목록(ul, 이름 "기능")에 칸 12개가 표 순서대로 — 칸 하나 = 링크 하나', () => {
    renderBefore()
    const ul = list()
    expect(ul.tagName.toLowerCase()).toBe('ul')
    const items = within(ul).getAllByRole('listitem')
    expect(items).toHaveLength(12)
    items.forEach((li, i) => {
      const feature = DASHBOARD_FEATURES[i]
      expect(li.children).toHaveLength(1)
      expect(li.querySelectorAll('a, button')).toHaveLength(1)
      const link = li.firstElementChild as HTMLElement
      expect(link.tagName.toLowerCase()).toBe('a')
      expect(link.getAttribute('href'), feature.name).toBe(feature.href)
    })
    expect(items.map((li) => textOf(li.querySelector('a > span > span')))).toEqual(DASHBOARD_FEATURES.map((f) => f.name))
  })

  it('AC-316.4: 칸 모양 — 위 1px line, 위 12·아래 16(폰 위아래 12·높이 56 이상), 누름 1px, 초점 고리 안쪽(-2px), 테두리 상자 없음', () => {
    renderBefore()
    for (const link of Array.from(list().querySelectorAll('a'))) {
      hasAll(link, `group block border-t border-line pt-3 pb-4 max-md:min-h-14 max-md:py-3 ${REACT_PRESS} focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent`)
      expect(classesOf(link)).not.toContain('border')
      expect(classesOf(link.parentElement as HTMLElement)).not.toContain('border')
    }
  })

  it('AC-316.4·AC-414.5·AC-714.4·AC-012.5: 1줄 이름(subtitle 600, 준비 중만 ink-2, 올림 accent) + 오른쪽 상태, 2줄 설명(small muted) — 연결 전 상태는 청구 "연결 먼저" · AI 리포트·업무일지·설정 "사용 가능" · 나머지는 목록대로(개수는 목록에서 센다)', () => {
    renderBefore()
    const links = Array.from(list().querySelectorAll('a'))
    links.forEach((link, i) => {
      const feature = DASHBOARD_FEATURES[i]
      const [line, desc] = Array.from(link.children) as HTMLElement[]
      expect(link.children).toHaveLength(2)
      hasAll(line, 'flex items-center justify-between gap-3')
      const [name, status] = Array.from(line.children) as HTMLElement[]
      expect(textOf(name)).toBe(feature.name)
      hasAll(name, 'text-subtitle font-semibold transition group-hover:text-accent')
      if (feature.status === 'soon') {
        hasAll(name, 'text-ink-2')
        hasNone(name, 'text-ink')
        expectSoon(status)
      } else {
        hasAll(name, 'text-ink')
        hasNone(name, 'text-ink-2')
        if (feature.status === 'connect-first') expectConnectFirst(status)
        else expectUsable(status)
      }
      expect(textOf(desc)).toBe(feature.desc)
      hasAll(desc, 'mt-0.5 block text-small text-muted')
    })
    expectConnectFirst(statusOf(linkOf('청구')))
    expectUsable(statusOf(linkOf('설정')))
    expectUsable(statusOf(linkOf('AI 리포트')))
    expect(textOf(linkOf('AI 리포트').children[1] as HTMLElement)).toBe('지난달·작년 같은 달과 견준 월간 AI 보고')
    expect(links.filter((a) => textOf(statusOf(a)) === '준비 중')).toHaveLength(featureCount('soon'))
    expect(links.filter((a) => textOf(statusOf(a)) === '연결 먼저')).toHaveLength(featureCount('connect-first'))
    expect(links.filter((a) => textOf(statusOf(a)) === '사용 가능')).toHaveLength(featureCount('ready'))
  })

  it('AC-012.3: 업무일지 칸은 연결 전·뒤 모두 "사용 가능"(accent + 화살표)이고 /worklog로 간다', () => {
    forBoth(() => {
      const link = linkOf('업무일지')
      expect(link.getAttribute('href')).toBe('/worklog')
      expectUsable(statusOf(link))
    })
  })

  it('AC-414.5·AC-714.4·AC-012.5: 연결 뒤에는 청구도 "사용 가능"(accent + 화살표)이고, AI 리포트·업무일지·설정은 그대로 "사용 가능", 준비 중 칸은 그대로 "준비 중"(개수는 목록에서 센다)', () => {
    renderAfter()
    expectUsable(statusOf(linkOf('청구')))
    expectUsable(statusOf(linkOf('AI 리포트')))
    expectUsable(statusOf(linkOf('설정')))
    const links = Array.from(list().querySelectorAll('a'))
    expect(links.filter((a) => textOf(statusOf(a)) === '연결 먼저')).toHaveLength(0)
    expect(links.filter((a) => textOf(statusOf(a)) === '사용 가능')).toHaveLength(featureCount('ready') + featureCount('connect-first'))
    for (const link of links.filter((a) => textOf(statusOf(a)) === '준비 중')) expectSoon(statusOf(link))
    expect(links.filter((a) => textOf(statusOf(a)) === '준비 중')).toHaveLength(featureCount('soon'))
  })

  it('AC-316.4: 1024px 이상 3열(사이 24px) · 768~1023px 2열 · 768px 미만 1열', () => {
    renderBefore()
    const ul = list()
    hasAll(ul, 'grid list-none gap-x-6 md:grid-cols-2 lg:grid-cols-3')
    for (const t of classesOf(ul)) expect(t, t).not.toMatch(/^grid-cols-/)
  })

  it('AC-414.5·AC-714.4·AC-012.5: 옆 글의 숫자는 DASHBOARD_FEATURES에서 센 값이다(전체 · 지금 · 연결하면) — 소스에 숫자를 박지 않는다', () => {
    const source = SOURCES.map((s) => s.text).join('\n')
    expect(source).not.toMatch(/\d+개 가운데|기능 \d+개|가운데 \d+개|\d+개는 지금|\d+개는 연결하면/)
    renderBefore()
    expect(byText(document.body, INDEX_SIDE, 'p')).toBeDefined()
    expect(INDEX_SIDE).toMatch(/^\d+개 가운데 \d+개는 지금, \d+개는 연결하면 쓸 수 있어요$/)
  })

  it('AC-316.4: 연결 뒤에도 같은 목록 — 12칸, 주소·이름 그대로', () => {
    renderAfter()
    const items = within(list()).getAllByRole('listitem')
    expect(items.map((li) => li.querySelector('a')?.getAttribute('href'))).toEqual(DASHBOARD_FEATURES.map((f) => f.href))
  })
})

describe('DashboardHome: 보조 글 · 연결 판정 (AC-414.6)', () => {
  it('AC-414.6: 보조 글(안심 줄 · 연결 순서 안내 줄 둘 · 섹션 옆 글 둘)은 모두 small(13px) muted + 최대 폭 max-w-130, caption이 아니다', () => {
    renderBefore()
    for (const text of [TRUST, PC_STEPS_NOTE, PHONE_STEPS_NOTE, ROW_SIDE, INDEX_SIDE]) {
      const el = byText(document.body, text, 'p')
      hasAll(el, NOTE)
      hasNone(el, 'text-caption')
    }
  })

  it('AC-414.6: 최대 폭은 대괄호 값 없이 폭 단계로만 준다 — 연결 전·뒤 모두, 소스에도 max-w-[ 가 없다', () => {
    forBoth((container) => {
      const all = Array.from(container.querySelectorAll('*')).flatMap(classesOf)
      expect(all.filter((t) => /(?:^|:)max-w-\[/.test(t))).toEqual([])
    })
    for (const { file, text } of SOURCES) expect(text, file).not.toContain('max-w-[')
  })

  it('AC-414.6: 소스에 data-page-surface가 없다', () => {
    for (const { file, text } of SOURCES) expect(text, file).not.toContain('data-page-surface')
  })

  it('AC-414.6: 연결 판정은 report != null — report를 주지 않거나(undefined) null이면 연결 전 모양이다', () => {
    const { container } = render(<DashboardHome today={TODAY} report={undefined} analysis={analysis} />)
    expect(textOf(container.querySelector('h1'))).toBe(H1)
    expect(sectionNamed(ROW_TITLE)).toBeTruthy()
    expect(container.querySelector('.sticky')).not.toBeNull()
    expect(container.querySelector('details')).not.toBeNull()
    expect(screen.queryByRole('link', { name: '사전점검 열기' })).toBeNull()
    for (const source of SOURCES.filter((s) => s.file === 'DashboardHome.tsx')) {
      expect(source.text).toMatch(/\breport != null\b/)
      expect(source.text).not.toMatch(/report !== null/)
    }
  })
})

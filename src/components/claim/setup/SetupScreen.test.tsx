// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { errorInfo } from '@/lib/errors'
import type { ChromeRuntimeLike, PortLike } from '@/types/bridge'
import type { ErrorCode } from '@/types/errors'
import { checkedAtText } from './checkedAt'
import { HELPER_RELEASES_URL } from './links'
import { SetupScreen } from './SetupScreen'

// 비트 PC 연결 화면 (precheck REQ-006 · ui-90 REQ-412, 시안 docs/mockups/ui-90/app/gen.py setup_body · 다른 창 카드는 precheck 목업 화면 6).
// 진짜 useBridge·connectScreenBridge·connectBridge에 가짜 확장(chrome.runtime)만 넣는다. 가짜 확장은 받은 명령마다 정해 둔 답을 돌려준다.
// "새 도우미가 있어요"를 시험하려고 웹이 아는 최신 도우미만 0.2.0으로 올린다(막는 기준 MIN_HELPER는 그대로 0.1.0)
vi.mock('@/lib/bridge/versions', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/bridge/versions')>()
  return { ...real, LATEST_HELPER: '0.2.0', WEB_VERSIONS: { ...real.WEB_VERSIONS, latestHelper: '0.2.0' } }
})

type Reply = Record<string, unknown>
/** 'hold' = 답을 잡아 둔다(release()로 보낸다) */
type Answer = Reply | 'hold'
type Script = { hello: Reply | 'busy'; check?: Answer[]; register?: Answer[] }

const HELLO: Reply = {
  type: 'result',
  data: { helperVersion: '0.2.0', protocol: 1, extensionVersion: '0.1.0', extensionProtocol: 1 },
}
const helloWith = (data: Record<string, unknown>): Reply => ({
  type: 'result',
  data: { ...(HELLO.data as Record<string, unknown>), ...data },
})
const step = (name: string, r: true | string) => (r === true ? { name, ok: true } : { name, ok: false, code: r })
function check(find: true | string, db: true | string, registration: true | string, more: Record<string, unknown> = {}): Reply {
  return {
    type: 'result',
    data: {
      steps: [step('find', find), step('db', db), step('registration', registration)],
      registered: true,
      institutionCode: '12345678',
      ...more,
    },
  }
}
const ALL_OK = check(true, true, true)
const NOT_REGISTERED = check(true, true, 'E-BIT-NOT-REGISTERED', { registered: false, institutionCode: undefined })
const STORE_BROKEN = check(true, true, 'E-STORE-BROKEN', { registered: false, institutionCode: undefined })
const MISMATCH = check(true, true, 'E-BIT-HOSPITAL-MISMATCH')
const DB_FAILED = check(true, 'E-BIT-DB-FAILED', 'E-BIT-DB-FAILED')

const RAW = '원래 오류 글 SqlException at Precheck.Core'
const STORE = 'https://chromewebstore.google.com/detail/example'

// 가짜 확장: 웹이 보낸 요청마다 script의 답(명령마다 줄 세움, 마지막 답은 되풀이)을 다음 차례에 보낸다
function fakeExtension(script: Script) {
  const sent: string[] = []
  const held: (() => void)[] = []
  const queues: Record<string, Answer[]> = {
    'bit.check': [...(script.check ?? [ALL_OK])],
    'bit.register': [...(script.register ?? [{ type: 'result', data: { registered: true } }])],
  }
  const next = (cmd: string): Answer => {
    const q = queues[cmd]
    return q.length > 1 ? (q.shift() as Answer) : q[0]
  }
  const ports: PortLike[] = []
  const drops: (() => void)[] = []

  const runtime: ChromeRuntimeLike = {
    connect() {
      const messageFns: ((m: unknown) => void)[] = []
      const disconnectFns: (() => void)[] = []
      let closed = false
      // 크롬이 Port를 끊었다(도우미가 꺼지는 등)
      drops.push(() => {
        closed = true
        disconnectFns.forEach((fn) => fn())
      })
      const deliver = (m: unknown) => setTimeout(() => !closed && messageFns.forEach((fn) => fn(m)), 0)
      const port: PortLike = {
        onMessage: { addListener: (fn) => void messageFns.push(fn) },
        onDisconnect: { addListener: (fn) => void disconnectFns.push(fn) },
        disconnect() {
          closed = true
        },
        postMessage(raw) {
          if (closed) throw new Error(`Attempting to use a disconnected port object ${RAW}`)
          const m = raw as { id: string; cmd: string }
          sent.push(m.cmd)
          if (m.cmd === 'hello') {
            if (script.hello === 'busy') {
              setTimeout(() => {
                messageFns.forEach((fn) => fn({ v: 1, id: '', type: 'error', code: 'E-BRIDGE-BUSY' }))
                closed = true
                disconnectFns.forEach((fn) => fn())
              }, 0)
              return
            }
            deliver({ v: 1, id: m.id, ...script.hello })
            return
          }
          const answer = next(m.cmd)
          if (answer === 'hold') {
            held.push(() => {
              const after = next(m.cmd)
              deliver({ v: 1, id: m.id, ...(after === 'hold' ? {} : after) })
            })
            return
          }
          deliver({ v: 1, id: m.id, ...answer })
        },
      }
      ports.push(port)
      return port
    },
  }
  vi.stubGlobal('chrome', { runtime })
  return {
    sent,
    ports,
    count: (cmd: string) => sent.filter((c) => c === cmd).length,
    release: () => held.shift()?.(),
    drop: () => drops[drops.length - 1](),
  }
}
type Fake = ReturnType<typeof fakeExtension>
const noExtension = () => void vi.stubGlobal('chrome', undefined)

const CLINIC = '가나 정형외과의원'
const renderSetup = (props: Partial<Parameters<typeof SetupScreen>[0]> = {}) =>
  render(<SetupScreen clinicName={CLINIC} {...props} />)

const stepList = () => screen.getByRole('list', { name: '준비 순서' })
const rows = () => Array.from(stepList().children) as HTMLElement[]
const row = (title: string) => within(stepList()).getByRole('heading', { level: 3, name: title }).closest('li') as HTMLElement
const alertCard = () => screen.getByRole('alert')
const pcPanel = () => screen.getByRole('region', { name: '이 PC' })
const pcValue = (term: string) => {
  const dt = within(pcPanel()).getByText(term, { selector: 'dt' })
  return dt.nextElementSibling as HTMLElement
}
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
/** 그 오류 번호의 errors.ts 문구와 번호가 그 자리에 그대로 있다 */
function expectInfo(el: HTMLElement, code: ErrorCode) {
  const info = errorInfo(code)
  expect(el.textContent).toContain(info.what)
  expect(el.textContent).toContain(info.fix)
  expect(el.textContent).toContain(`오류 번호 ${code}`)
}
const STEP_TITLES = ['크롬 확장 프로그램 설치', '도우미 설치', '연결', '비트 자료 읽기', '요양기관기호 확인']
// 시안 SDESC
const STEP_DESCS = [
  '크롬에 붙이는 작은 프로그램이에요. 우리 사이트와 도우미를 이어 줘요.',
  '비트를 읽고 메모를 넣는 윈도우 프로그램이에요. 설치할 때 윈도우가 경고를 띄워도 정상이에요.',
  '우리 사이트, 확장 프로그램, 도우미가 서로 이어졌는지 봐요.',
  '비트를 읽기만 해요. 비트 자료를 고치지 않아요.',
  '요양기관기호(심평원이 우리 의원에 준 번호)로 이 PC의 비트가 우리 의원 것인지 봐요.',
]
// 시안 .howto 4줄(웹스토어 등록 전)
const HOWTO = [
  '[확장 내려받기]를 눌러 파일을 받고, 파일을 오른쪽 클릭해 [모두 압축 풀기]를 눌러요.',
  '크롬 주소창에 chrome://extensions 를 넣고, 오른쪽 위 [개발자 모드]를 켜요.',
  '[압축해제된 확장 프로그램을 로드합니다]를 눌러 방금 푼 폴더를 골라요.',
  '이 화면으로 돌아와 [다시 확인]을 눌러요.',
]
const NOTE = ['이 화면은 비트 PC의 크롬에서 열어요.', '비트 PC는 비트가 깔린 의원 PC예요. 집 PC나 휴대폰에서는 연결하지 않아도 돼요.']
const KEEP = [
  '환자 자료는 이 PC 밖으로 나가지 않아요. 우리 사이트에는 건수와 설정만 가요.',
  '비트는 읽기만 해요. 메모를 넣을 때만 이 PC에 확인 창이 뜨고, 거기서 [확인]을 눌러야 들어가요.',
  '확장 프로그램과 도우미는 이 비트 PC 한 대에만 설치해요.',
]
const PC_TERMS = ['크롬 확장 프로그램', '도우미', '요양기관기호', '마지막 확인']

// 모양은 정해 둔 클래스가 있는지로 본다(jsdom은 CSS를 계산하지 않는다)
const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const classesOf = (el: Element) => tokens(el.getAttribute('class') ?? '')
const hasAll = (el: Element, classes: string) => expect(classesOf(el)).toEqual(expect.arrayContaining(tokens(classes)))
const hasNone = (el: Element, classes: string) => {
  for (const t of tokens(classes)) expect(classesOf(el), t).not.toContain(t)
}
/** 주 단추(accent 바탕·surface 글자의 a·button) */
const primaries = () =>
  Array.from(document.body.querySelectorAll('a, button')).filter((el) => {
    const c = classesOf(el)
    return c.includes('bg-accent') && c.includes('text-surface')
  })
const isSecondary = (el: Element) => classesOf(el).includes('border-line-strong') && classesOf(el).includes('bg-surface')

// 공용 Icon 그림(common/Icon.tsx SHAPES). 청구 화면은 직접 그린 svg·✓·✗ 글자 대신 이 아이콘을 쓴다 (ui-90 AC-408.2)
const CHECK_D = 'm3.5 8.25 2.9 2.9 6.1-6.65'
const X_D = 'm4.75 4.75 6.5 6.5m0-6.5-6.5 6.5'
const STOP_D = 'm3.9 3.9 8.2 8.2'
const MONITOR_D = 'M5.5 13.75h5M8 11.25v2.5'
const CHIP_CLASSES: string[] = Object.values(ds.chip)
/** 단계 줄의 칩(ds.chip 묶음 하나를 그대로 쓴 span) */
const chipOf = (li: HTMLElement) =>
  Array.from(li.querySelectorAll('span')).find((s) => CHIP_CLASSES.includes(s.getAttribute('class') ?? '')) as HTMLElement
/** 할 차례 단계의 안내 상자(canvas) */
const guideOf = (li: HTMLElement) => li.querySelector('.bg-canvas') as HTMLElement | null
// 단계 칩의 표시: 됨은 positive 칩 안 Icon check 12, 진짜 문제는 negative 칩 안 Icon x 12(꾸밈). ✓·✗ 글자는 없다
const MARK = { check: { d: CHECK_D, chip: ds.chip.positive }, x: { d: X_D, chip: ds.chip.negative } } as const
function expectMark(li: HTMLElement, mark: keyof typeof MARK, label = '') {
  const { d, chip } = MARK[mark]
  const svg = li.querySelector(`path[d="${d}"]`)?.closest('svg')
  expect(svg, `${label} Icon ${mark}`).toBeTruthy()
  expect(svg?.getAttribute('aria-hidden'), label).toBe('true')
  expect(svg?.getAttribute('viewBox'), label).toBe('0 0 16 16')
  expect([svg?.getAttribute('width'), svg?.getAttribute('height')], label).toEqual(['12', '12'])
  expect(svg?.parentElement?.getAttribute('class'), label).toBe(chip)
  expect(li.textContent, label).not.toMatch(/[✓✗]/)
}
/** 할 차례 칩(accent, 아이콘 없음) */
function expectTurn(li: HTMLElement, label = '') {
  const chip = chipOf(li)
  expect(chip?.textContent, label).toBe('할 차례')
  expect(chip?.getAttribute('class'), label).toBe(ds.chip.accent)
  expect(chip?.querySelector('svg'), label).toBeNull()
}
const isBefore = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('SetupScreen 틀', () => {
  it('AC-006.4·AC-412.5·AC-012.6: 제목 "설정"과 안쪽 메뉴 — [청구·연락]은 설정 화면(/settings) 링크이고, [비트 PC 연결]은 지금 화면(/claim/setup)', async () => {
    fakeExtension({ hello: HELLO })
    renderSetup()
    expect(screen.getByRole('heading', { level: 1, name: '설정' })).toBeTruthy()
    const sub = screen.getByRole('navigation', { name: '설정 안 메뉴' })
    const settings = within(sub).getByRole('link', { name: '청구·연락' })
    expect(settings.getAttribute('href')).toBe('/settings')
    expect(settings.getAttribute('aria-current')).toBeNull()
    const here = within(sub).getByRole('link', { name: '비트 PC 연결' })
    expect(here.getAttribute('href')).toBe('/claim/setup')
    expect(here.getAttribute('aria-current')).toBe('page')
    expect(sub.textContent).toBe('청구·연락비트 PC 연결')
    await screen.findByText('준비됨')
  })

  it('AC-006.2·AC-412.4·AC-412.5: 준비 순서 5단계(이름 그대로·설명은 시안 SDESC)와 이렇게 지켜요 세 줄, 아래 [연결 다시 확인] 줄이 없다', async () => {
    fakeExtension({ hello: HELLO })
    renderSetup()
    expect(rows().map((li) => within(li).getByRole('heading', { level: 3 }).textContent)).toEqual(STEP_TITLES)
    expect(rows().map((li) => li.querySelector('p')?.textContent)).toEqual(STEP_DESCS)
    expect(screen.getByRole('heading', { name: '이렇게 지켜요' })).toBeTruthy()
    const keep = screen.getByRole('region', { name: '이렇게 지켜요' })
    expect(within(keep).getAllByRole('listitem').map((li) => li.textContent)).toEqual(KEEP)
    await screen.findByText('준비됨')
    expect(screen.queryByRole('button', { name: '연결 다시 확인' })).toBeNull()
    expect(screen.queryByText('누르면 1번부터 5번까지 다시 확인해요.')).toBeNull()
  })

  it("AC-412.5: '이 PC' 줄 이름은 크롬 확장 프로그램·도우미·요양기관기호·마지막 확인이다", async () => {
    fakeExtension({ hello: HELLO })
    renderSetup()
    await screen.findByText('준비됨')
    expect(Array.from(pcPanel().querySelectorAll('dt')).map((dt) => dt.textContent)).toEqual(PC_TERMS)
  })
})

// b2b 관리자 화면 안 탭(AdminApplications, b2b AC-220.1)과 같은 모양 (REQ-034, design.md 18-3)
describe('AC-034.2 설정 안 메뉴 모양', () => {
  const subnav = () => screen.getByRole('navigation', { name: '설정 안 메뉴' })

  it('AC-034.2: 줄 아래 1px line, 항목은 40px(768px 미만 44px)·좌우 12px·body·rounded-control이고 첫 항목은 왼쪽으로 12px 당긴다', async () => {
    fakeExtension({ hello: HELLO })
    renderSetup()
    hasAll(subnav(), 'flex border-b border-line')
    const items = Array.from(subnav().children)
    expect(items.map((el) => el.getAttribute('aria-current') ?? el.getAttribute('aria-disabled'))).toEqual([null, 'page'])
    for (const item of items) {
      hasAll(item, 'relative inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control px-3 text-body first:-ml-3 max-md:h-11')
      hasNone(item, 'rounded-chip rounded-card gap-2')
    }
    await screen.findByText('준비됨')
  })

  it('AC-034.2·AC-412.5: 지금 [비트 PC 연결]은 ink 600 + 아래 2px accent 밑줄(좌우 12px 안쪽, 줄 선 위에 겹침), 키보드 초점은 안쪽 2px accent 고리 — 옛 700·accent 글자·3px 밑줄이 없다', async () => {
    fakeExtension({ hello: HELLO })
    renderSetup()
    const here = within(subnav()).getByRole('link', { name: '비트 PC 연결' })
    expect(here.getAttribute('aria-current')).toBe('page')
    hasAll(here, 'font-semibold text-ink after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-accent')
    hasAll(here, 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent')
    hasNone(here, 'font-bold font-medium text-accent text-ink-2 after:h-0.75 after:inset-x-2.5 after:rounded-t-xs')
    await screen.findByText('준비됨')
  })

  it('AC-034.2·AC-012.6: [청구·연락]은 설정 화면(/settings) 링크이고 기본 모양 ink-2 500(올림 ink)이며 칩이 없다', async () => {
    fakeExtension({ hello: HELLO })
    renderSetup()
    const link = within(subnav()).getByRole('link', { name: '청구·연락' })
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('/settings')
    expect(link.hasAttribute('aria-disabled')).toBe(false)
    expect(link.hasAttribute('aria-current')).toBe(false)
    hasAll(link, 'font-medium text-ink-2 hover:text-ink')
    hasNone(link, 'font-semibold font-bold text-ink text-accent cursor-pointer')
    expect(classesOf(link).filter((t) => t.startsWith('after:'))).toEqual([])
    expect(link.children).toHaveLength(0)
    expect(within(subnav()).queryByText('준비 중')).toBeNull()
    await screen.findByText('준비됨')
  })
})

describe('AC-412.1 처음 들어옴(확장 없음, 아무것도 안 함)', () => {
  it('AC-412.1: 맨 위 accent-soft 안내(Icon monitor) 두 줄, 위 오류 상자·negative 칩·text-negative가 화면 어디에도 없다', async () => {
    noExtension()
    renderSetup()
    const first = await screen.findByText(NOTE[0])
    expect(first.tagName).toBe('P')
    hasAll(first, 'font-semibold')
    const note = first.parentElement?.parentElement as HTMLElement
    hasAll(note, 'flex rounded-control bg-accent-soft')
    expect(note.textContent).toBe(NOTE.join(''))
    const monitor = note.querySelector(`path[d="${MONITOR_D}"]`)?.closest('svg')
    expect(monitor?.getAttribute('aria-hidden')).toBe('true')
    hasAll(monitor as Element, 'text-accent-strong')
    hasAll(screen.getByText(NOTE[1]), 'text-small text-ink-2')
    // 맨 위: 제목 "설정"보다 앞
    expect(isBefore(note, screen.getByRole('heading', { level: 1, name: '설정' }))).toBe(true)

    await waitFor(() => expectTurn(row(STEP_TITLES[0])))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.body.querySelectorAll(`[class="${ds.chip.negative}"]`)).toHaveLength(0)
    expect(document.body.querySelectorAll('.text-negative, .bg-negative-soft')).toHaveLength(0)
    expect(document.body.textContent).not.toContain('오류 번호')
  })

  it('AC-412.1: 1단계는 accent 칩 "할 차례" + 시안 순서 4줄 + [확장 내려받기](주, 새 탭) · [다시 확인](보조), 2~5단계는 neutral 칩 "대기"와 설명만("앞 단계를" 없음)', async () => {
    noExtension()
    renderSetup()
    await waitFor(() => expectTurn(row(STEP_TITLES[0])))
    const first = row(STEP_TITLES[0])
    const guide = guideOf(first) as HTMLElement
    expect(guide).toBeTruthy()
    expect(within(guide).getAllByRole('listitem').map((li) => li.textContent)).toEqual(HOWTO)
    expect(within(guide).getByText('chrome://extensions').tagName).toBe('CODE')
    const get = within(guide).getByRole('link', { name: '확장 내려받기' })
    expect(get.getAttribute('href')).toBe(HELPER_RELEASES_URL)
    expect(get.getAttribute('target')).toBe('_blank')
    expect(get.getAttribute('rel')).toContain('noopener')
    hasAll(get, ds.button.primary)
    const again = within(guide).getByRole('button', { name: '다시 확인' })
    hasAll(again, ds.button.secondary)
    expect(isBefore(get, again)).toBe(true)

    STEP_TITLES.slice(1).forEach((title, i) => {
      const li = row(title)
      expect(chipOf(li)?.getAttribute('class'), title).toBe(ds.chip.neutral)
      expect(li.textContent, title).toBe(`${i + 2}${title}대기${STEP_DESCS[i + 1]}`)
      expect(within(li).queryAllByRole('button'), title).toHaveLength(0)
      hasAll(within(li).getByRole('heading', { level: 3 }), 'text-ink-2')
    })
    expect(document.body.textContent).not.toContain('앞 단계를')
    for (const term of PC_TERMS) expect(pcValue(term).textContent, term).toBe('아직 없어요')
  })

  it('AC-412.1: 웹스토어 주소가 있으면 [확장 내려받기] 대신 지금처럼 [확장 설치하러 가기](주, 새 탭)와 설치 순서', async () => {
    noExtension()
    renderSetup({ extensionStoreUrl: STORE })
    await waitFor(() => expectTurn(row(STEP_TITLES[0])))
    const first = row(STEP_TITLES[0])
    const go = within(first).getByRole('link', { name: '확장 설치하러 가기' })
    expect(go.getAttribute('href')).toBe(STORE)
    expect(go.getAttribute('target')).toBe('_blank')
    expect(go.getAttribute('rel')).toContain('noopener')
    hasAll(go, ds.button.primary)
    expect(within(first).queryByRole('link', { name: '확장 내려받기' })).toBeNull()
    expect(first.textContent).toContain('이 확장은 웹스토어 검색에 나오지 않아서 꼭 이 단추로 열어야 해요.')
    expect(first.textContent).toContain('[Chrome에 추가]를 누르세요.')
    expect(within(first).getByRole('button', { name: '다시 확인' })).toBeTruthy()
  })

  it('AC-412.1·AC-412.7: 확장이 있으면 맨 위 안내가 없다', async () => {
    fakeExtension({ hello: HELLO })
    renderSetup()
    await screen.findByText('준비됨')
    expect(screen.queryByText(NOTE[0])).toBeNull()
  })
})

describe('AC-412.2 단계 칩 모양', () => {
  it('AC-412.2: 의원 다름 — 1~4단계 positive Icon check "완료", 5단계 negative Icon x "의원 다름"', async () => {
    fakeExtension({ hello: HELLO, check: [MISMATCH] })
    renderSetup()
    await screen.findByRole('alert')
    for (const title of STEP_TITLES.slice(0, 4)) {
      expectMark(row(title), 'check', title)
      expect(chipOf(row(title)).textContent, title).toBe('완료')
    }
    const hospital = row(STEP_TITLES[4])
    expectMark(hospital, 'x')
    expect(chipOf(hospital).textContent).toBe('의원 다름')
  })

  it('AC-412.2: 도우미 버전 안 맞음 — 2단계 negative Icon x "버전 안 맞음", 뒤 단계 neutral "대기"', async () => {
    fakeExtension({ hello: helloWith({ helperVersion: '0.0.9' }) })
    renderSetup()
    await screen.findByRole('alert')
    const second = row(STEP_TITLES[1])
    expectMark(second, 'x')
    expect(chipOf(second).textContent).toBe('버전 안 맞음')
    for (const title of STEP_TITLES.slice(2)) expect(chipOf(row(title)).getAttribute('class'), title).toBe(ds.chip.neutral)
  })

  it('AC-412.2: 확인하는 동안 4·5단계는 accent "확인 중"(아이콘 없음)', async () => {
    const fake = fakeExtension({ hello: HELLO, check: ['hold', ALL_OK] })
    renderSetup()
    await waitFor(() => expect(fake.count('bit.check')).toBe(1))
    for (const title of STEP_TITLES.slice(3)) {
      await waitFor(() => expect(chipOf(row(title)).textContent, title).toBe('확인 중'))
      expect(chipOf(row(title)).getAttribute('class'), title).toBe(ds.chip.accent)
    }
    fake.release()
    await screen.findByText('준비됨')
  })
})

describe('AC-412.3 진짜 문제(버전 안 맞음·의원 다름)는 위 오류 상자 하나', () => {
  /** 상자 하나 · negative-soft · Icon stop · what · fix · 오류 번호(ink-2) · 단추 줄(주 하나 + [다시 확인] 보조) */
  function expectProblemBox(code: ErrorCode, primary: string) {
    const alerts = screen.getAllByRole('alert')
    expect(alerts).toHaveLength(1)
    const box = alerts[0]
    hasAll(box, 'rounded-control bg-negative-soft')
    const svgs = box.querySelectorAll('svg')
    expect(svgs).toHaveLength(1)
    expect(svgs[0].querySelector(`path[d="${STOP_D}"]`)).not.toBeNull()
    expectInfo(box, code)
    const num = within(box).getByText(`오류 번호 ${code}`)
    hasAll(num, 'text-caption text-ink-2')
    hasNone(num, 'text-muted')
    const actions = Array.from(box.querySelectorAll('a, button'))
    expect(actions.map((el) => el.textContent)).toEqual([primary, '다시 확인'])
    hasAll(actions[0], ds.button.primary)
    expect(isSecondary(actions[1])).toBe(true)
    // 안쪽 메뉴 아래, 준비 순서 앞
    expect(isBefore(screen.getByRole('navigation', { name: '설정 안 메뉴' }), box)).toBe(true)
    expect(isBefore(box, stepList())).toBe(true)
    return box
  }
  /** 그 단계 줄에는 칩과 설명만 */
  function expectChipAndDescOnly(index: number, chipText: string) {
    const li = row(STEP_TITLES[index])
    expect(li.textContent).toBe(`${index + 1}${STEP_TITLES[index]}${chipText}${STEP_DESCS[index]}`)
    expect(within(li).queryAllByRole('button')).toHaveLength(0)
    expect(within(li).queryAllByRole('link')).toHaveLength(0)
    expect(guideOf(li)).toBeNull()
  }

  it('AC-412.3: 의원 다름 — 상자 안 [다시 등록](주) · [다시 확인](보조), 5단계 줄은 칩과 설명만', async () => {
    fakeExtension({ hello: HELLO, check: [MISMATCH] })
    renderSetup()
    await screen.findByRole('alert')
    expectProblemBox('E-BIT-HOSPITAL-MISMATCH', '다시 등록')
    expectChipAndDescOnly(4, '의원 다름')
    expect(within(pcValue('요양기관기호')).getByText('등록한 번호와 달라요')).toBeTruthy()
    hasAll(pcValue('요양기관기호'), 'text-negative')
    expect(pcValue('요양기관기호').querySelector(`path[d="${X_D}"]`)).not.toBeNull()
  })

  it('AC-412.3: 도우미 버전 안 맞음 — 상자 안 [새 도우미 내려받기](주, 새 탭) · [다시 확인](보조), 2단계 줄은 칩과 설명만, 이 PC 도우미 "버전이 안 맞아요"', async () => {
    fakeExtension({ hello: helloWith({ helperVersion: '0.0.9' }) })
    renderSetup()
    await screen.findByRole('alert')
    const box = expectProblemBox('E-HELPER-OLD', '새 도우미 내려받기')
    const get = within(box).getByRole('link', { name: '새 도우미 내려받기' })
    expect(get.getAttribute('href')).toBe(HELPER_RELEASES_URL)
    expect(get.getAttribute('target')).toBe('_blank')
    expectChipAndDescOnly(1, '버전 안 맞음')
    expect(pcValue('도우미').textContent).toBe('버전이 안 맞아요')
    hasAll(pcValue('도우미'), 'text-negative')
    expect(pcValue('도우미').querySelector(`path[d="${X_D}"]`)).not.toBeNull()
  })

  it('AC-412.3: 확장 버전 안 맞음 — 상자 안 [확장 내려받기](주) · [다시 확인], 1단계 줄은 칩과 설명만, 이 PC 크롬 확장 프로그램 "버전이 안 맞아요"', async () => {
    fakeExtension({ hello: helloWith({ extensionVersion: '0.0.9' }) })
    renderSetup()
    await screen.findByRole('alert')
    const box = expectProblemBox('E-EXT-OLD', '확장 내려받기')
    expect(within(box).getByRole('link', { name: '확장 내려받기' }).getAttribute('href')).toBe(HELPER_RELEASES_URL)
    expectChipAndDescOnly(0, '버전 안 맞음')
    expect(pcValue('크롬 확장 프로그램').textContent).toBe('버전이 안 맞아요')
  })

  it('AC-412.3: 확장 버전 안 맞음 + 웹스토어 주소 — 상자 안 [확장 설치하러 가기](주)', async () => {
    fakeExtension({ hello: helloWith({ extensionVersion: '0.0.9' }) })
    renderSetup({ extensionStoreUrl: STORE })
    await screen.findByRole('alert')
    const box = expectProblemBox('E-EXT-OLD', '확장 설치하러 가기')
    expect(within(box).getByRole('link', { name: '확장 설치하러 가기' }).getAttribute('href')).toBe(STORE)
  })

  it('AC-412.3·AC-412.1: 다시 확인으로 풀리는 실패(끊김·연결 안 됨·비트 읽기 실패)와 등록 없음에는 위 오류 상자가 없다', async () => {
    fakeExtension({ hello: HELLO, check: [DB_FAILED] })
    renderSetup()
    await waitFor(() => expectInfo(row('비트 자료 읽기'), 'E-BIT-DB-FAILED'))
    expect(screen.queryByRole('alert')).toBeNull()
    cleanup()
    fakeExtension({ hello: HELLO, check: [NOT_REGISTERED] })
    renderSetup()
    await screen.findByRole('button', { name: '처음 등록' })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

// 상태마다: 다른 창 카드 밖 (AC-412.4), 화면 글자 (AC-412.5)
type Scene = { arrange(): Fake | void; props?: Partial<Parameters<typeof SetupScreen>[0]>; settled(fake: Fake | void): Promise<unknown> }
const SCENES: [string, Scene][] = [
  ['처음(확장 없음)', { arrange: noExtension, settled: () => screen.findByText(NOTE[0]) }],
  ['처음 + 웹스토어 주소', { arrange: noExtension, props: { extensionStoreUrl: STORE }, settled: () => screen.findByRole('link', { name: '확장 설치하러 가기' }) }],
  ['도우미 없음', { arrange: () => fakeExtension({ hello: { type: 'error', code: 'E-HELPER-MISSING' } }), settled: () => screen.findByRole('link', { name: '도우미 내려받기' }) }],
  ['도우미 버전 안 맞음', { arrange: () => fakeExtension({ hello: helloWith({ helperVersion: '0.0.9' }) }), settled: () => screen.findByRole('alert') }],
  ['확장 버전 안 맞음', { arrange: () => fakeExtension({ hello: helloWith({ extensionVersion: '0.0.9' }) }), settled: () => screen.findByRole('alert') }],
  [
    '연결 안 됨(hello 실패)',
    { arrange: () => fakeExtension({ hello: helloWith({ extra: 'x' }) }), settled: () => waitFor(() => expect(row('연결').textContent).toContain('오류 번호')) },
  ],
  [
    '연결 끊김',
    {
      arrange: () => fakeExtension({ hello: HELLO, check: ['hold', ALL_OK] }),
      settled: async (fake) => {
        await waitFor(() => expect((fake as Fake).count('bit.check')).toBe(1))
        ;(fake as Fake).drop()
        await waitFor(() => expect(row('연결').textContent).toContain('오류 번호'))
      },
    },
  ],
  [
    '확인 중',
    {
      arrange: () => fakeExtension({ hello: HELLO, check: ['hold'] }),
      settled: () => waitFor(() => expect(chipOf(row('비트 자료 읽기')).textContent).toBe('확인 중')),
    },
  ],
  [
    '비트 읽기 실패',
    { arrange: () => fakeExtension({ hello: HELLO, check: [DB_FAILED] }), settled: () => waitFor(() => expect(row('비트 자료 읽기').textContent).toContain('오류 번호')) },
  ],
  ['등록 없음', { arrange: () => fakeExtension({ hello: HELLO, check: [NOT_REGISTERED] }), settled: () => screen.findByRole('button', { name: '처음 등록' }) }],
  ['등록 파일 깨짐', { arrange: () => fakeExtension({ hello: HELLO, check: [STORE_BROKEN] }), settled: () => screen.findByRole('button', { name: '처음 등록' }) }],
  ['의원 다름', { arrange: () => fakeExtension({ hello: HELLO, check: [MISMATCH] }), settled: () => screen.findByRole('alert') }],
  [
    '방금 누른 등록이 실패',
    {
      arrange: () => fakeExtension({ hello: HELLO, check: [NOT_REGISTERED], register: [{ type: 'error', code: 'E-BIT-DB-FAILED' }] }),
      settled: async () => {
        await userEvent.setup().click(await screen.findByRole('button', { name: '처음 등록' }))
        await screen.findByRole('alert')
      },
    },
  ],
  [
    '다시 등록이 실패(의원 다름)',
    {
      arrange: () => fakeExtension({ hello: HELLO, check: [MISMATCH], register: [{ type: 'error', code: 'E-BIT-DB-FAILED' }] }),
      settled: async () => {
        await userEvent.setup().click(await screen.findByRole('button', { name: '다시 등록' }))
        await waitFor(() => expect(alertCard().textContent).toContain('오류 번호 E-BIT-DB-FAILED'))
      },
    },
  ],
  [
    '등록을 기다리는 동안 연결 끊김',
    {
      arrange: () => fakeExtension({ hello: HELLO, check: [NOT_REGISTERED], register: ['hold'] }),
      settled: async (fake) => {
        await userEvent.setup().click(await screen.findByRole('button', { name: '처음 등록' }))
        await waitFor(() => expect((fake as Fake).count('bit.register')).toBe(1))
        ;(fake as Fake).drop()
        await waitFor(() => expect(row('연결').textContent).toContain('오류 번호 E-BRIDGE-DISCONNECTED'))
      },
    },
  ],
  ['모두 됨', { arrange: () => fakeExtension({ hello: HELLO }), settled: () => screen.findByText('준비됨') }],
  ['모두 됨 + 새 도우미', { arrange: () => fakeExtension({ hello: helloWith({ helperVersion: '0.1.0' }) }), settled: () => screen.findByText('준비됨') }],
]
async function renderScene(scene: Scene) {
  const fake = scene.arrange()
  renderSetup(scene.props)
  await scene.settled(fake)
}

describe('AC-412.4 어느 상태든 주 단추 하나·[다시 확인] 하나·오류 번호 한 번', () => {
  it.each(SCENES)('AC-412.4: %s', async (_name, scene) => {
    await renderScene(scene)
    expect(primaries().length).toBeLessThanOrEqual(1)
    expect(screen.queryAllByRole('button', { name: '다시 확인' }).length).toBeLessThanOrEqual(1)
    const codes = [...(document.body.textContent ?? '').matchAll(/오류 번호 (E-[A-Z0-9-]+)/g)].map((m) => m[1])
    expect(codes.length, codes.join(',')).toBe(new Set(codes).size)
    expect(screen.queryByRole('button', { name: '연결 다시 확인' })).toBeNull()
    expect(document.body.textContent).not.toContain('누르면 1번부터 5번까지 다시 확인해요.')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('AC-412.4·AC-412.3: 등록을 기다리는 동안 연결이 끊기면 위 오류 상자 없이 3번 연결의 할 차례 안내에만 번호가 한 번 보인다', async () => {
    const fake = fakeExtension({ hello: HELLO, check: [NOT_REGISTERED], register: ['hold'] })
    renderSetup()
    await userEvent.setup().click(await screen.findByRole('button', { name: '처음 등록' }))
    await waitFor(() => expect(fake.count('bit.register')).toBe(1))
    fake.drop()
    await waitFor(() => expectInfo(row('연결'), 'E-BRIDGE-DISCONNECTED'))
    expectTurn(row('연결'))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getAllByText('오류 번호 E-BRIDGE-DISCONNECTED')).toHaveLength(1)
  })

  it('AC-412.4: 진짜 문제에서 오류 번호는 위 상자에서만 보인다', async () => {
    fakeExtension({ hello: HELLO, check: [MISMATCH] })
    renderSetup()
    const box = await screen.findByRole('alert')
    expect(screen.getAllByText(/오류 번호/)).toEqual([within(box).getByText(/오류 번호/)])
  })
})

describe('AC-412.5 화면 글자', () => {
  it.each(SCENES)('AC-412.5: %s — "병원"·"설치·연결 확인"·"[비트 연결]"·"니다."가 없다', async (_name, scene) => {
    await renderScene(scene)
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/병원|설치·연결 확인|\[비트 연결\]|니다\./)
  })
})

describe('AC-412.6 768px 미만', () => {
  it('AC-412.6: 단계 줄은 폰 2칸(칩이 이름 바로 아래) · 768px 이상 3칸(칩은 오른쪽)이고, 설명은 body(14px)다', async () => {
    noExtension()
    renderSetup()
    await waitFor(() => expectTurn(row(STEP_TITLES[0])))
    for (const li of rows()) {
      hasAll(li, 'grid grid-cols-[28px_minmax(0,1fr)] md:grid-cols-[28px_minmax(0,1fr)_auto] gap-x-3 border-b border-line py-4 last:border-b-0')
      const title = within(li).getByRole('heading', { level: 3 })
      const chipBox = chipOf(li).parentElement as HTMLElement
      const desc = li.querySelector('p') as HTMLElement
      // 읽는 차례도 이름 → 칩 → 설명
      expect(isBefore(title, chipBox)).toBe(true)
      expect(isBefore(chipBox, desc)).toBe(true)
      hasAll(title, 'col-start-2 row-start-1')
      hasAll(chipBox, 'col-start-2 row-start-2 md:col-start-3 md:row-start-1')
      hasAll(desc, 'col-start-2 row-start-3 md:row-start-2 text-body text-ink-2')
      hasNone(desc, 'text-small text-muted')
    }
  })

  it('AC-412.6: 단계 안 단추와 위 오류 상자 단추는 768px 미만에서 전체 폭이다', async () => {
    noExtension()
    renderSetup()
    await waitFor(() => expectTurn(row(STEP_TITLES[0])))
    const guide = guideOf(row(STEP_TITLES[0])) as HTMLElement
    hasAll(guide, 'col-start-1 col-end-3 md:col-start-2 md:col-end-4')
    const inGuide = Array.from(guide.querySelectorAll('a, button'))
    expect(inGuide).toHaveLength(2)
    for (const el of inGuide) hasAll(el, 'max-md:w-full')
    cleanup()
    fakeExtension({ hello: HELLO, check: [MISMATCH] })
    renderSetup()
    const box = await screen.findByRole('alert')
    const inBox = Array.from(box.querySelectorAll('a, button'))
    expect(inBox).toHaveLength(2)
    for (const el of inBox) hasAll(el, 'max-md:w-full')
  })

  it('AC-412.6: 준비 순서·이 PC 격자는 1024px 미만 한 칸(minmax(0,1fr)), 이상에서 오른쪽 380px', async () => {
    fakeExtension({ hello: HELLO })
    renderSetup()
    await screen.findByText('준비됨')
    const grid = pcPanel().parentElement?.parentElement as HTMLElement
    expect(grid.contains(stepList())).toBe(true)
    hasAll(grid, 'grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] min-w-0')
  })
})

describe('AC-006.1·AC-412.7 상태별 안내 (동작 그대로)', () => {
  it('AC-006.1·AC-412.1: 도우미 없음 — 1번 Icon check, 2번 할 차례와 도우미 zip 받는 곳·설치 순서(경고 창 넘기는 법 포함)', async () => {
    fakeExtension({ hello: { type: 'error', code: 'E-HELPER-MISSING' } })
    renderSetup()
    await screen.findByRole('link', { name: '도우미 내려받기' })
    expect(screen.queryByRole('alert')).toBeNull()
    expectMark(row('크롬 확장 프로그램 설치'), 'check')
    const second = row('도우미 설치')
    expectTurn(second)
    const get = within(second).getByRole('link', { name: '도우미 내려받기' })
    expect(get.getAttribute('href')).toBe(HELPER_RELEASES_URL)
    hasAll(get, ds.button.primary)
    expect(HELPER_RELEASES_URL).toBe('https://github.com/seoseungkwan/seoseungkwanapp/releases')
    expect(second.textContent).toContain('[모두 압축 풀기]')
    expect(second.textContent).toContain('install.cmd')
    expect(second.textContent).toContain('"Windows의 PC 보호" 창이 뜨면 [추가 정보]를 누른 뒤 [실행]을 누르세요.')
    expect(second.textContent).toContain('크롬은 다시 켤 필요가 없어요.')
    expect(within(second).getByRole('button', { name: '다시 확인' })).toBeTruthy()
    expect(chipOf(row('연결')).textContent).toBe('대기')
  })

  it('AC-006.1·AC-412.7: 다른 창에서 작업 중 — 목업 화면 6의 카드(문구는 errors.ts)·[다시 확인]·[건수만 보기] /claim, 준비 순서는 그리지 않는다', async () => {
    const fake = fakeExtension({ hello: 'busy' })
    renderSetup()
    const card = await screen.findByRole('alert')
    await waitFor(() => expectInfo(card, 'E-BRIDGE-BUSY'))
    expect(within(card).getByRole('heading', { name: errorInfo('E-BRIDGE-BUSY').what })).toBeTruthy()
    expect(card.textContent).toContain('다른 창을 닫았다면 [다시 확인]을 누르세요.')
    expect(within(card).getByRole('link', { name: '건수만 보기' }).getAttribute('href')).toBe('/claim')
    expect(screen.queryByRole('list', { name: '준비 순서' })).toBeNull()
    expect(screen.getByRole('link', { name: '비트 PC 연결' }).getAttribute('aria-current')).toBe('page')
    // [다시 확인]은 새로 붙어 본다(다른 창을 닫았으면 이번엔 된다)
    await userEvent.setup().click(within(card).getByRole('button', { name: '다시 확인' }))
    await waitFor(() => expect(fake.ports).toHaveLength(2))
  })

  it('AC-006.1·AC-006.2·AC-412.3: 연결이 끊기면 3번 연결이 할 차례 + E-BRIDGE-DISCONNECTED 문구·번호, 그 [다시 확인]은 새로 붙어 처음부터 확인한다', async () => {
    const fake = fakeExtension({ hello: HELLO, check: ['hold', ALL_OK] })
    renderSetup()
    await waitFor(() => expect(fake.count('bit.check')).toBe(1))
    fake.drop()
    await waitFor(() => expectInfo(row('연결'), 'E-BRIDGE-DISCONNECTED'))
    const link = row('연결')
    expectTurn(link)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(chipOf(row('비트 자료 읽기')).textContent).toBe('대기')
    await userEvent.setup().click(within(link).getByRole('button', { name: '다시 확인' }))
    await screen.findByText('준비됨')
    expect(fake.ports).toHaveLength(2)
    expect(fake.sent).toEqual(['hello', 'bit.check', 'hello', 'bit.check'])
  })
})

describe('AC-006.1·AC-006.6 hello가 상태를 바꾸지 않고 실패할 때', () => {
  it.each([
    ['모르는 칸이 붙은 hello 답(옛 확장·새 도우미)', helloWith({ extra: 'x' }), 'E-BRIDGE-BAD-REPLY'],
    ['E-HELPER-MISSING 말고 다른 오류 답', { type: 'error', code: 'E-HELPER-BAD-MESSAGE' }, 'E-HELPER-BAD-MESSAGE'],
  ] as const)('AC-006.1·AC-006.6·AC-412.3: %s → 3번 연결이 할 차례 + %s 문구·번호, 그 [다시 확인]을 누를 수 있고 다시 붙는다', async (_n, reply, code) => {
    const script: Script = { hello: reply }
    const fake = fakeExtension(script)
    renderSetup()
    await waitFor(() => expectInfo(row('연결'), code))
    for (const title of STEP_TITLES.slice(0, 2)) expectMark(row(title), 'check', title)
    const link = row('연결')
    expectTurn(link)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(chipOf(row('비트 자료 읽기')).textContent).toBe('대기')
    expect(chipOf(row('요양기관기호 확인')).textContent).toBe('대기')
    const again = within(link).getByRole('button', { name: '다시 확인' }) as HTMLButtonElement
    expect(again.disabled).toBe(false)

    // 고친 확장·도우미로 다시 확인하면 이번엔 된다
    script.hello = HELLO
    await userEvent.setup().click(again)
    await screen.findByText('준비됨')
    expect(fake.ports).toHaveLength(2)
    expect(fake.sent).toEqual(['hello', 'hello', 'bit.check'])
  })
})

describe('AC-006.2 연결 확인 (bit.check)', () => {
  it('AC-006.2·AC-412.5: ready가 되면 bit.check를 불러 5단계 모두 Icon check, "준비됨"·마지막 확인 시각·[청구로 가기] /claim', async () => {
    const fake = fakeExtension({ hello: HELLO })
    renderSetup()
    await screen.findByText('준비됨')
    expect(fake.sent).toEqual(['hello', 'bit.check'])
    for (const li of rows()) {
      expectMark(li, 'check')
      expect(li.textContent).toContain('완료')
      expect(li.textContent).not.toContain('오류 번호')
    }
    expect(row('크롬 확장 프로그램 설치').textContent).toContain('버전 0.1.0')
    expect(row('도우미 설치').textContent).toContain('버전 0.2.0')
    expect(row('연결').textContent).toContain('이어졌어요')
    expect(row('비트 자료 읽기').textContent).toContain('읽을 수 있어요')
    expect(row('요양기관기호 확인').textContent).toContain('등록한 의원과 같아요')
    expect(screen.getByText('이 PC에서 청구 화면을 쓸 수 있어요.')).toBeTruthy()
    expect(screen.getByRole('link', { name: '청구로 가기' }).getAttribute('href')).toBe('/claim')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(pcValue('마지막 확인').textContent).toMatch(/^\d{1,2}월 \d{1,2}일 \([월화수목금토일]\) \d{2}:\d{2}$/)
  })

  it('AC-006.2·AC-412.4: 할 차례 단계의 [다시 확인]을 누르면 같은 연결로 hello부터 bit.check까지 다시 하고, 확인하는 동안 누를 수 있는 [다시 확인]이 없다', async () => {
    const fake = fakeExtension({ hello: HELLO, check: [DB_FAILED, 'hold', ALL_OK] })
    renderSetup()
    await waitFor(() => expectInfo(row('비트 자료 읽기'), 'E-BIT-DB-FAILED'))
    await userEvent.setup().click(within(row('비트 자료 읽기')).getByRole('button', { name: '다시 확인' }))
    await waitFor(() => expect(fake.count('bit.check')).toBe(2))
    expect(fake.sent).toEqual(['hello', 'bit.check', 'hello', 'bit.check'])
    expect(fake.ports).toHaveLength(1) // 붙어 있는 동안은 같은 연결로(확장이 다른 창으로 보지 않게)
    await waitFor(() => expect(chipOf(row('비트 자료 읽기')).textContent).toBe('확인 중'))
    for (const b of screen.queryAllByRole('button', { name: '다시 확인' })) expect((b as HTMLButtonElement).disabled).toBe(true)
    fake.release()
    await screen.findByText('준비됨')
    expectMark(row('요양기관기호 확인'), 'check')
  })

  it.each([
    ['비트를 찾지 못함', check('E-BIT-NOT-FOUND', 'E-BIT-NOT-FOUND', 'E-BIT-NOT-FOUND'), 'E-BIT-NOT-FOUND'],
    ['DB에 붙지 못함', DB_FAILED, 'E-BIT-DB-FAILED'],
    ['DB 읽기 실패', check(true, 'E-BIT-READ-FAILED', 'E-BIT-READ-FAILED'), 'E-BIT-READ-FAILED'],
  ] as const)('AC-006.2·AC-412.2: %s → 4번 비트 자료 읽기가 할 차례 + errors.ts 문구·오류 번호 한 번·[다시 확인], 5번은 대기', async (_n, reply, code) => {
    fakeExtension({ hello: HELLO, check: [reply] })
    renderSetup()
    await waitFor(() => expectInfo(row('비트 자료 읽기'), code))
    const bit = row('비트 자료 읽기')
    expectTurn(bit)
    expect(within(bit).getAllByText(`오류 번호 ${code}`)).toHaveLength(1)
    expect(within(bit).getByRole('button', { name: '다시 확인' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    for (const title of STEP_TITLES.slice(0, 3)) expectMark(row(title), 'check', title)
    expect(chipOf(row('요양기관기호 확인')).textContent).toBe('대기')
    expect(screen.queryByRole('button', { name: '처음 등록' })).toBeNull()
    expect(screen.queryByText('준비됨')).toBeNull()
  })

  it.each([
    ['등록 없음(E-BIT-NOT-REGISTERED)', NOT_REGISTERED],
    ['등록 파일이 깨짐(E-STORE-BROKEN)', STORE_BROKEN],
  ] as const)('AC-006.2·AC-005.5·AC-412.2: %s → 5번이 할 차례 + [처음 등록], 누르면 bit.register(PC 확인 창) 뒤 다시 확인, 누른 동안 막힘', async (_n, reply) => {
    const fake = fakeExtension({ hello: HELLO, check: [reply, ALL_OK], register: ['hold', { type: 'result', data: { registered: true } }] })
    renderSetup()
    await screen.findByRole('button', { name: '처음 등록' })
    const hospital = row('요양기관기호 확인')
    expectTurn(hospital)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: '다시 등록' })).toBeNull()
    hasAll(button('처음 등록'), ds.button.primary)

    await userEvent.setup().click(within(hospital).getByRole('button', { name: '처음 등록' }))
    await waitFor(() => expect(fake.count('bit.register')).toBe(1))
    expect(button('처음 등록').disabled).toBe(true)
    for (const b of screen.getAllByRole('button', { name: '다시 확인' })) expect((b as HTMLButtonElement).disabled).toBe(true)
    expect(fake.count('bit.check')).toBe(1)

    fake.release()
    await screen.findByText('준비됨')
    expect(fake.sent).toEqual(['hello', 'bit.check', 'bit.register', 'bit.check'])
    expect(screen.queryByRole('button', { name: '처음 등록' })).toBeNull()
    expectMark(row('요양기관기호 확인'), 'check')
  })

  it('AC-006.2·AC-005.5·AC-412.3: 의원이 다름(E-BIT-HOSPITAL-MISMATCH) → 위 상자의 [다시 등록]([처음 등록] 아님), 누르면 bit.register(PC 확인 창) 뒤 다시 확인', async () => {
    const fake = fakeExtension({ hello: HELLO, check: [MISMATCH, ALL_OK] })
    renderSetup()
    await waitFor(() => expectInfo(alertCard(), 'E-BIT-HOSPITAL-MISMATCH'))
    expect(screen.queryByRole('button', { name: '처음 등록' })).toBeNull()
    await userEvent.setup().click(within(alertCard()).getByRole('button', { name: '다시 등록' }))
    await screen.findByText('준비됨')
    expect(fake.sent).toEqual(['hello', 'bit.check', 'bit.register', 'bit.check'])
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-006.2·AC-005.5: PC 확인 창에서 취소하면({registered: false}) 다시 확인해 [처음 등록]이 그대로 있다', async () => {
    const fake = fakeExtension({
      hello: HELLO,
      check: [NOT_REGISTERED],
      register: [{ type: 'result', data: { registered: false } }],
    })
    renderSetup()
    await screen.findByRole('button', { name: '처음 등록' })
    await userEvent.setup().click(button('처음 등록'))
    await waitFor(() => expect(fake.count('bit.check')).toBe(2))
    await waitFor(() => expect(button('처음 등록').disabled).toBe(false))
  })

  it('AC-006.2·AC-006.6·AC-412.3: bit.register가 오류 번호로 끝나면 위 상자에 그 번호의 errors.ts 문구(단추는 5단계 안내에 그대로)', async () => {
    fakeExtension({
      hello: HELLO,
      check: [NOT_REGISTERED],
      register: [{ type: 'error', code: 'E-BIT-DB-FAILED' }],
    })
    renderSetup()
    await screen.findByRole('button', { name: '처음 등록' })
    await userEvent.setup().click(button('처음 등록'))
    await waitFor(() => expectInfo(alertCard(), 'E-BIT-DB-FAILED'))
    expect(within(alertCard()).queryAllByRole('button')).toHaveLength(0)
    expect(button('처음 등록').disabled).toBe(false)
    expect(within(row('요양기관기호 확인')).getByRole('button', { name: '다시 확인' })).toBeTruthy()
  })
})

describe('AC-006.3·AC-412.7 새 도우미', () => {
  it('AC-006.3: 도우미가 최신보다 낮으면 "새 도우미가 있어요" 한 줄과 받는 곳 링크, 나머지는 그대로 쓸 수 있다', async () => {
    fakeExtension({ hello: helloWith({ helperVersion: '0.1.0' }) })
    renderSetup()
    await screen.findByText('준비됨')
    expect(screen.getByText('새 도우미가 있어요.')).toBeTruthy()
    expect(screen.getByRole('link', { name: '새 도우미 내려받기' }).getAttribute('href')).toBe(HELPER_RELEASES_URL)
    expect(screen.getByRole('link', { name: '청구로 가기' })).toBeTruthy()
    for (const li of rows()) expectMark(li, 'check')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-006.3: 최신 도우미면 그 줄이 없다', async () => {
    fakeExtension({ hello: HELLO })
    renderSetup()
    await screen.findByText('준비됨')
    expect(screen.queryByText('새 도우미가 있어요.')).toBeNull()
  })
})

describe('AC-006.4·AC-412.5 이 PC 값', () => {
  it('AC-006.4·AC-412.5: 기관기호는 뒤 4자리를 가리고 그 옆 의원 이름은 사이트의 이름이다, 확장·도우미는 Icon check "맞아요"(positive)', async () => {
    fakeExtension({ hello: HELLO })
    renderSetup()
    await screen.findByText('준비됨')
    expect(pcValue('요양기관기호').textContent).toBe(`1234**** · ${CLINIC}`)
    expect(document.body.textContent).not.toContain('12345678')
    for (const term of ['크롬 확장 프로그램', '도우미']) {
      const dd = pcValue(term)
      expect(dd.textContent, term).toBe('맞아요')
      hasAll(dd, 'text-positive font-medium')
      expect(dd.querySelector(`path[d="${CHECK_D}"]`), term).not.toBeNull()
    }
  })

  it('AC-006.4·AC-412.5: 등록이 없으면(기관기호 없음) 요양기관기호 칸은 "아직 없어요"', async () => {
    fakeExtension({ hello: HELLO, check: [NOT_REGISTERED] })
    renderSetup()
    await screen.findByRole('button', { name: '처음 등록' })
    expect(pcValue('요양기관기호').textContent).toBe('아직 없어요')
  })

  it('AC-006.4: 마지막 확인 시각은 한국 시각 "11월 4일 (수) 09:12" 모양', () => {
    expect(checkedAtText(new Date('2026-11-04T00:12:00Z'))).toBe('11월 4일 (수) 09:12')
    expect(checkedAtText(new Date('2026-10-31T15:05:00Z'))).toBe('11월 1일 (일) 00:05')
  })
})

describe('AC-006.6 오류 문구는 errors.ts에서, 원래 오류 내용은 안 보임', () => {
  it('AC-006.6·AC-412.1: 확장 연결이 예외(원래 글)로 실패해도 원래 글은 보이지 않고 처음 상태(할 차례)다', async () => {
    vi.stubGlobal('chrome', {
      runtime: {
        connect() {
          throw new Error(`Invalid extension id ${RAW}`)
        },
      },
    })
    renderSetup()
    await waitFor(() => expectTurn(row(STEP_TITLES[0])))
    expect(screen.getByText(NOTE[0])).toBeTruthy()
    expect(document.body.textContent).not.toContain(RAW)
  })

  it('AC-006.6: 도우미 답에 다른 칸(원래 오류 글)이 붙어 오면 쓰지 않고 E-BRIDGE-BAD-REPLY만 보인다', async () => {
    fakeExtension({ hello: HELLO, check: [{ type: 'error', code: 'E-BIT-DB-FAILED', message: RAW }] })
    renderSetup()
    await waitFor(() => expectInfo(row('비트 자료 읽기'), 'E-BRIDGE-BAD-REPLY'))
    expect(document.body.textContent).not.toContain(RAW)
  })

  it('AC-006.6: errors.ts에 없는 번호는 번호만 보이고 지어낸 문구가 없다', async () => {
    fakeExtension({ hello: HELLO, check: [check(true, 'E-BIT-SOMETHING-NEW', 'E-BIT-SOMETHING-NEW')] })
    renderSetup()
    await waitFor(() => expect(row('비트 자료 읽기').textContent).toContain('오류 번호 E-BIT-SOMETHING-NEW'))
    const guide = guideOf(row('비트 자료 읽기')) as HTMLElement
    const lines = Array.from(guide.querySelectorAll('p')).map((p) => p.textContent)
    expect(lines).toEqual(['오류 번호 E-BIT-SOMETHING-NEW'])
  })
})

// ui-90 TASK-5가 청구 폴더를 규칙 시험에 넣으며 가까운 단계로 고친 간격·공용 Icon. TASK-9가 짜임을 시안대로 바꿨다
describe('AC-408.2 그림은 공용 Icon, 간격은 단계 안', () => {
  it('AC-408.2·AC-412.3: 위 오류 상자의 아이콘은 Icon stop 16(negative·꾸밈, 첫 줄에 맞춰 위 2px) 하나이고 직접 그린 그림이 아니다, 상자 안 사이는 8px·안쪽 16px 12px', async () => {
    fakeExtension({ hello: HELLO, check: [MISMATCH] })
    renderSetup()
    await waitFor(() => expectInfo(alertCard(), 'E-BIT-HOSPITAL-MISMATCH'))
    const svgs = alertCard().querySelectorAll('svg')
    expect(svgs).toHaveLength(1)
    const stop = svgs[0]
    expect(stop.querySelector(`path[d="${STOP_D}"]`)).not.toBeNull()
    expect(stop.getAttribute('viewBox')).toBe('0 0 16 16')
    expect([stop.getAttribute('width'), stop.getAttribute('height')]).toEqual(['16', '16'])
    expect(stop.getAttribute('aria-hidden')).toBe('true')
    hasAll(stop, 'mt-0.5 shrink-0 text-negative')
    hasNone(stop, 'mt-0.75')
    hasAll(alertCard(), 'flex items-start gap-2 rounded-control bg-negative-soft px-4 py-3')
    hasNone(alertCard(), 'gap-2.5')
  })

  it('AC-408.2·AC-412.1: 할 차례 안내 상자는 canvas·안쪽 16px(폰 12px), 순서 목록은 왼쪽 20px·사이 6px·body ink-2', async () => {
    noExtension()
    renderSetup({ extensionStoreUrl: null })
    await waitFor(() => expectTurn(row(STEP_TITLES[0])))
    const guide = guideOf(row(STEP_TITLES[0])) as HTMLElement
    hasAll(guide, 'mt-3 rounded-control bg-canvas p-4 max-md:p-3')
    hasNone(guide, 'bg-negative-soft px-3.5')
    const steps = within(guide).getByRole('list')
    hasAll(steps, 'grid list-decimal gap-1.5 pl-5 text-body text-ink-2')
    hasNone(steps, 'pl-4.5')
  })

  it('AC-408.2·AC-412.5: "준비됨" 줄·새 도우미 줄은 사이 8px, \'이렇게 지켜요\' 목록은 왼쪽 20px·사이 8px·body ink-2', async () => {
    fakeExtension({ hello: helloWith({ helperVersion: '0.1.0' }) })
    renderSetup()
    const ready = (await screen.findByText('준비됨')).parentElement as HTMLElement
    const update = screen.getByText('새 도우미가 있어요.').parentElement as HTMLElement
    for (const line of [ready, update]) {
      hasAll(line, 'flex flex-wrap items-center gap-2 rounded-control border border-line bg-surface px-4 py-3')
      hasNone(line, 'gap-2.5')
    }
    const keep = screen.getByText(KEEP[0]).closest('ul') as HTMLElement
    hasAll(keep, 'grid list-disc gap-2 pl-5 text-body text-ink-2')
    hasNone(keep, 'pl-4.5 text-small')
  })
})

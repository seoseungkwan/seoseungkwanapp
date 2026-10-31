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

// 설치·연결 확인 화면 (REQ-006, 목업 화면 1 '설치·연결 확인' · 화면 6 '다른 창에서 열려 있음').
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

const RAW = '원래 오류 글 SqlException at Precheck.Core'

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
/** 그 오류 번호의 errors.ts 문구가 카드에 그대로 있다 */
function expectInfo(el: HTMLElement, code: ErrorCode) {
  const info = errorInfo(code)
  expect(el.textContent).toContain(info.what)
  expect(el.textContent).toContain(info.fix)
  expect(el.textContent).toContain(`오류 번호 ${code}`)
}
const STEP_TITLES = ['크롬 확장 프로그램 설치', '도우미 설치', '연결', '비트 자료 읽기', '요양기관기호 확인']

// 모양은 정해 둔 클래스가 있는지로 본다(jsdom은 CSS를 계산하지 않는다)
const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const classesOf = (el: Element) => tokens(el.getAttribute('class') ?? '')
const hasAll = (el: Element, classes: string) => expect(classesOf(el)).toEqual(expect.arrayContaining(tokens(classes)))
const hasNone = (el: Element, classes: string) => {
  for (const t of tokens(classes)) expect(classesOf(el), t).not.toContain(t)
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('SetupScreen 틀 (목업 화면 1)', () => {
  it('AC-006.4: 제목 "설정"과 안쪽 메뉴 — [청구·연락]은 설정 화면이 아직 없어 링크가 아니고(준비 중), [비트 연결]은 지금 화면(/claim/setup)', async () => {
    fakeExtension({ hello: HELLO })
    renderSetup()
    expect(screen.getByRole('heading', { level: 1, name: '설정' })).toBeTruthy()
    const sub = screen.getByRole('navigation', { name: '설정 안 메뉴' })
    expect(within(sub).queryByRole('link', { name: /청구·연락/ })).toBeNull()
    const notReady = within(sub).getByText('청구·연락').closest('[aria-disabled="true"]')
    expect(notReady?.textContent).toContain('준비 중')
    const here = within(sub).getByRole('link', { name: '비트 연결' })
    expect(here.getAttribute('href')).toBe('/claim/setup')
    expect(here.getAttribute('aria-current')).toBe('page')
    await screen.findByText('준비됨')
  })

  it('AC-006.2: 준비 순서 5단계(확장 → 도우미 → 연결 → 비트 자료 읽기 → 요양기관기호 확인)와 [연결 다시 확인], 이렇게 지켜요', async () => {
    fakeExtension({ hello: HELLO })
    renderSetup()
    expect(rows().map((li) => within(li).getByRole('heading', { level: 3 }).textContent)).toEqual(STEP_TITLES)
    expect(screen.getByRole('heading', { name: '이렇게 지켜요' })).toBeTruthy()
    expect(screen.getByText('환자 자료는 이 PC 밖으로 나가지 않아요. 서버에는 건수와 설정만 가요.')).toBeTruthy()
    expect(screen.getByText('누르면 1번부터 5번까지 다시 확인해요.')).toBeTruthy()
    await screen.findByText('준비됨')
    expect(button('연결 다시 확인').disabled).toBe(false)
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
    expect(items.map((el) => el.getAttribute('aria-current') ?? el.getAttribute('aria-disabled'))).toEqual(['true', 'page'])
    for (const item of items) {
      hasAll(item, 'relative inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control px-3 text-body first:-ml-3 max-md:h-11')
      hasNone(item, 'rounded-chip rounded-card gap-2')
    }
    await screen.findByText('준비됨')
  })

  it('AC-034.2: 지금 [비트 연결]은 ink 600 + 아래 2px accent 밑줄(좌우 12px 안쪽, 줄 선 위에 겹침), 키보드 초점은 안쪽 2px accent 고리 — 옛 700·accent 글자·3px 밑줄이 없다', async () => {
    fakeExtension({ hello: HELLO })
    renderSetup()
    const here = within(subnav()).getByRole('link', { name: '비트 연결' })
    expect(here.getAttribute('aria-current')).toBe('page')
    hasAll(here, 'font-semibold text-ink after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-accent')
    hasAll(here, 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent')
    hasNone(here, 'font-bold font-medium text-accent text-ink-2 after:h-0.75 after:inset-x-2.5 after:rounded-t-xs')
    await screen.findByText('준비됨')
  })

  it('AC-034.2: 설정 화면이 아직 없으면 [청구·연락]은 링크가 아니고(aria-disabled) 기본 모양 ink-2 500(올림 변화 없음)에 ds.chip.neutral "준비 중"', async () => {
    fakeExtension({ hello: HELLO })
    renderSetup()
    const notReady = within(subnav()).getByText('청구·연락').closest('[aria-disabled="true"]') as HTMLElement
    expect(notReady.tagName).not.toBe('A')
    hasAll(notReady, 'font-medium text-ink-2')
    hasNone(notReady, 'font-semibold font-bold text-ink text-accent cursor-pointer')
    expect(classesOf(notReady).filter((t) => t.startsWith('hover:') || t.startsWith('after:'))).toEqual([])
    const chip = within(notReady).getByText('준비 중')
    expect(chip.getAttribute('class')).toBe(ds.chip.neutral)
    await screen.findByText('준비됨')
  })
})

describe('AC-006.1 상태별 안내', () => {
  it('AC-006.1: 확장 없음 — 오류 카드(errors.ts 문구·번호), 1번에 ✗와 설치 순서·[다시 확인], 뒤 단계는 대기', async () => {
    vi.stubGlobal('chrome', undefined)
    renderSetup()
    await waitFor(() => expectInfo(alertCard(), 'E-EXT-MISSING'))
    const first = row('크롬 확장 프로그램 설치')
    expect(first.textContent).toContain('✗')
    expect(first.textContent).toContain('없음')
    expect(first.textContent).toContain('오류 번호 E-EXT-MISSING')
    expect(within(first).getByRole('button', { name: '다시 확인' })).toBeTruthy()
    for (const title of STEP_TITLES.slice(1)) {
      expect(row(title).textContent, title).toContain('대기')
      expect(row(title).textContent, title).toContain('앞 단계를 먼저 해 주세요')
    }
    expect(pcValue('크롬 확장').textContent).toContain('—')
  })

  it('AC-006.1: 확장 없음 + 웹스토어 등록 전(주소 없음) — 확장 zip 받는 곳과 압축 풀린 확장 불러오기 순서', async () => {
    vi.stubGlobal('chrome', undefined)
    renderSetup({ extensionStoreUrl: null })
    const first = await waitFor(() => {
      const li = row('크롬 확장 프로그램 설치')
      expect(li.textContent).toContain('없음')
      return li
    })
    const get = within(first).getByRole('link', { name: '확장 내려받기' })
    expect(get.getAttribute('href')).toBe(HELPER_RELEASES_URL)
    expect(first.textContent).toContain('chrome://extensions')
    expect(first.textContent).toContain('[개발자 모드]')
    expect(first.textContent).toContain('[압축해제된 확장 프로그램을 로드합니다]')
  })

  it('AC-006.1: 확장 없음 + 웹스토어 주소가 있으면 [확장 설치하러 가기] 링크와 목업의 설치 순서', async () => {
    vi.stubGlobal('chrome', undefined)
    const store = 'https://chromewebstore.google.com/detail/example'
    renderSetup({ extensionStoreUrl: store })
    const first = await waitFor(() => {
      const li = row('크롬 확장 프로그램 설치')
      expect(li.textContent).toContain('없음')
      return li
    })
    const go = within(first).getByRole('link', { name: '확장 설치하러 가기' })
    expect(go.getAttribute('href')).toBe(store)
    expect(go.getAttribute('target')).toBe('_blank')
    expect(go.getAttribute('rel')).toContain('noopener')
    expect(first.textContent).toContain('이 확장은 웹스토어 검색에 나오지 않아서 꼭 이 단추로 열어야 해요.')
    expect(first.textContent).toContain('[Chrome에 추가]를 누르세요.')
  })

  it('AC-006.1: 도우미 없음 — 1번 ✓, 2번 ✗와 도우미 zip 받는 곳·설치 순서(경고 창 넘기는 법 포함)', async () => {
    fakeExtension({ hello: { type: 'error', code: 'E-HELPER-MISSING' } })
    renderSetup()
    await waitFor(() => expectInfo(alertCard(), 'E-HELPER-MISSING'))
    expect(row('크롬 확장 프로그램 설치').textContent).toContain('✓')
    const second = row('도우미 설치')
    expect(second.textContent).toContain('✗')
    expect(second.textContent).toContain('오류 번호 E-HELPER-MISSING')
    const get = within(second).getByRole('link', { name: '도우미 내려받기' })
    expect(get.getAttribute('href')).toBe(HELPER_RELEASES_URL)
    expect(HELPER_RELEASES_URL).toBe('https://github.com/seoseungkwan/seoseungkwanapp/releases')
    expect(second.textContent).toContain('[모두 압축 풀기]')
    expect(second.textContent).toContain('install.cmd')
    expect(second.textContent).toContain('"Windows의 PC 보호" 창이 뜨면 [추가 정보]를 누른 뒤 [실행]을 누르세요.')
    expect(second.textContent).toContain('크롬은 다시 켤 필요가 없어요.')
    expect(row('연결').textContent).toContain('대기')
  })

  it('AC-006.1: 도우미가 낮음 — "도우미를 업데이트하세요", 지금 버전·필요한 버전, [새 도우미 내려받기], 이 PC에 업데이트 필요', async () => {
    fakeExtension({ hello: helloWith({ helperVersion: '0.0.9' }) })
    renderSetup()
    await waitFor(() => expectInfo(alertCard(), 'E-HELPER-OLD'))
    expect(alertCard().textContent).toContain('도우미를 업데이트하세요')
    const second = row('도우미 설치')
    expect(second.textContent).toContain('버전 안 맞음')
    expect(second.textContent).toContain('이 PC 도우미는 0.0.9이에요. 0.1.0 이상이 필요해요.')
    expect(within(second).getByRole('link', { name: '새 도우미 내려받기' }).getAttribute('href')).toBe(HELPER_RELEASES_URL)
    expect(pcValue('도우미').textContent).toContain('0.0.9')
    expect(pcValue('도우미').textContent).toContain('업데이트 필요')
  })

  it('AC-006.1: 확장이 낮음 — "확장을 업데이트하세요", 1번 ✗ 버전 안 맞음', async () => {
    fakeExtension({ hello: helloWith({ extensionVersion: '0.0.9' }) })
    renderSetup()
    await waitFor(() => expectInfo(alertCard(), 'E-EXT-OLD'))
    expect(alertCard().textContent).toContain('확장을 업데이트하세요')
    const first = row('크롬 확장 프로그램 설치')
    expect(first.textContent).toContain('버전 안 맞음')
    expect(first.textContent).toContain('이 PC 확장은 0.0.9이에요. 0.1.0 이상이 필요해요.')
    expect(row('도우미 설치').textContent).toContain('대기')
  })

  it('AC-006.1: 다른 창에서 작업 중 — 목업 화면 6의 카드(문구는 errors.ts)·[다시 확인]·[건수만 보기] /claim, 준비 순서는 그리지 않는다', async () => {
    const fake = fakeExtension({ hello: 'busy' })
    renderSetup()
    const card = await screen.findByRole('alert')
    await waitFor(() => expectInfo(card, 'E-BRIDGE-BUSY'))
    expect(within(card).getByRole('heading', { name: errorInfo('E-BRIDGE-BUSY').what })).toBeTruthy()
    expect(card.textContent).toContain('다른 창을 닫았다면 [다시 확인]을 누르세요.')
    expect(within(card).getByRole('link', { name: '건수만 보기' }).getAttribute('href')).toBe('/claim')
    expect(screen.queryByRole('list', { name: '준비 순서' })).toBeNull()
    // [다시 확인]은 새로 붙어 본다(다른 창을 닫았으면 이번엔 된다)
    await userEvent.setup().click(within(card).getByRole('button', { name: '다시 확인' }))
    await waitFor(() => expect(fake.ports).toHaveLength(2))
  })

  it('AC-006.1·AC-006.2: 연결이 끊기면 3번 연결에 ✗ E-BRIDGE-DISCONNECTED, [다시 확인]은 새로 붙어 처음부터 확인한다', async () => {
    const fake = fakeExtension({ hello: HELLO, check: ['hold', ALL_OK] })
    renderSetup()
    await waitFor(() => expect(fake.count('bit.check')).toBe(1))
    fake.drop()
    await waitFor(() => expectInfo(alertCard(), 'E-BRIDGE-DISCONNECTED'))
    const link = row('연결')
    expect(link.textContent).toContain('✗')
    expect(link.textContent).toContain('오류 번호 E-BRIDGE-DISCONNECTED')
    expect(row('비트 자료 읽기').textContent).toContain('대기')
    await userEvent.setup().click(within(alertCard()).getByRole('button', { name: '다시 확인' }))
    await screen.findByText('준비됨')
    expect(fake.ports).toHaveLength(2)
    expect(fake.sent).toEqual(['hello', 'bit.check', 'hello', 'bit.check'])
  })
})

describe('AC-006.1·AC-006.6 hello가 상태를 바꾸지 않고 실패할 때', () => {
  it.each([
    ['모르는 칸이 붙은 hello 답(옛 확장·새 도우미)', helloWith({ extra: 'x' }), 'E-BRIDGE-BAD-REPLY'],
    ['E-HELPER-MISSING 말고 다른 오류 답', { type: 'error', code: 'E-HELPER-BAD-MESSAGE' }, 'E-HELPER-BAD-MESSAGE'],
  ] as const)('AC-006.1·AC-006.6: %s → 3번 연결에 ✗와 %s, 위 카드, [다시 확인]·[연결 다시 확인]을 누를 수 있고 다시 붙는다', async (_n, reply, code) => {
    const script: Script = { hello: reply }
    const fake = fakeExtension(script)
    renderSetup()
    await waitFor(() => expectInfo(alertCard(), code))
    for (const title of STEP_TITLES.slice(0, 2)) expect(row(title).textContent, title).toContain('✓')
    const link = row('연결')
    expect(link.textContent).toContain('✗')
    expect(link.textContent).toContain(`오류 번호 ${code}`)
    expect(row('비트 자료 읽기').textContent).toContain('대기')
    expect(row('요양기관기호 확인').textContent).toContain('대기')
    expect(button('연결 다시 확인').disabled).toBe(false)
    const again = within(alertCard()).getByRole('button', { name: '다시 확인' }) as HTMLButtonElement
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
  it('AC-006.2: ready가 되면 bit.check를 불러 5단계 모두 ✓, "준비됨"·마지막 확인 시각·[청구로 가기] /claim', async () => {
    const fake = fakeExtension({ hello: HELLO })
    renderSetup()
    await screen.findByText('준비됨')
    expect(fake.sent).toEqual(['hello', 'bit.check'])
    for (const li of rows()) {
      expect(li.textContent).toContain('✓')
      expect(li.textContent).toContain('완료')
      expect(li.textContent).not.toContain('오류 번호')
    }
    expect(row('크롬 확장 프로그램 설치').textContent).toContain('버전 0.1.0')
    expect(row('도우미 설치').textContent).toContain('버전 0.2.0')
    expect(row('연결').textContent).toContain('이어졌어요')
    expect(row('비트 자료 읽기').textContent).toContain('읽을 수 있어요')
    expect(row('요양기관기호 확인').textContent).toContain('등록한 병원과 같아요')
    expect(screen.getByText('이 PC에서 청구 화면을 쓸 수 있어요.')).toBeTruthy()
    expect(screen.getByRole('link', { name: '청구로 가기' }).getAttribute('href')).toBe('/claim')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(pcValue('마지막 확인').textContent).toMatch(/^\d{1,2}월 \d{1,2}일 \([월화수목금토일]\) \d{2}:\d{2}$/)
  })

  it('AC-006.2: [연결 다시 확인]을 누르면 hello부터 bit.check까지 다시 하고, 확인하는 동안 단추를 막는다', async () => {
    const fake = fakeExtension({ hello: HELLO, check: [ALL_OK, 'hold', ALL_OK] })
    renderSetup()
    await screen.findByText('준비됨')
    await userEvent.setup().click(button('연결 다시 확인'))
    await waitFor(() => expect(fake.count('bit.check')).toBe(2))
    expect(fake.sent).toEqual(['hello', 'bit.check', 'hello', 'bit.check'])
    expect(fake.ports).toHaveLength(1) // 붙어 있는 동안은 같은 연결로(확장이 다른 창으로 보지 않게)
    expect(button('연결 다시 확인').disabled).toBe(true)
    expect(row('비트 자료 읽기').textContent).toContain('확인 중')
    fake.release()
    await waitFor(() => expect(button('연결 다시 확인').disabled).toBe(false))
    expect(row('요양기관기호 확인').textContent).toContain('✓')
  })

  it.each([
    ['비트를 찾지 못함', check('E-BIT-NOT-FOUND', 'E-BIT-NOT-FOUND', 'E-BIT-NOT-FOUND'), 'E-BIT-NOT-FOUND'],
    ['DB에 붙지 못함', check(true, 'E-BIT-DB-FAILED', 'E-BIT-DB-FAILED'), 'E-BIT-DB-FAILED'],
    ['DB 읽기 실패', check(true, 'E-BIT-READ-FAILED', 'E-BIT-READ-FAILED'), 'E-BIT-READ-FAILED'],
  ] as const)('AC-006.2: %s → 4번 비트 자료 읽기에 ✗와 오류 번호, 5번은 대기, 위 카드는 errors.ts 문구', async (_n, reply, code) => {
    fakeExtension({ hello: HELLO, check: [reply] })
    renderSetup()
    await waitFor(() => expectInfo(alertCard(), code))
    const bit = row('비트 자료 읽기')
    expect(bit.textContent).toContain('✗')
    expect(bit.textContent).toContain(`오류 번호 ${code}`)
    expect(within(bit).getByRole('button', { name: '다시 확인' })).toBeTruthy()
    for (const title of STEP_TITLES.slice(0, 3)) expect(row(title).textContent, title).toContain('✓')
    expect(row('요양기관기호 확인').textContent).toContain('대기')
    expect(screen.queryByRole('button', { name: '처음 등록' })).toBeNull()
    expect(screen.queryByText('준비됨')).toBeNull()
  })

  it.each([
    ['등록 없음(E-BIT-NOT-REGISTERED)', NOT_REGISTERED, 'E-BIT-NOT-REGISTERED'],
    ['등록 파일이 깨짐(E-STORE-BROKEN)', STORE_BROKEN, 'E-STORE-BROKEN'],
  ] as const)('AC-006.2·AC-005.5: %s → 5번에 ✗와 [처음 등록], 누르면 bit.register(PC 확인 창) 뒤 다시 확인, 누른 동안 막힘', async (_n, reply, code) => {
    const fake = fakeExtension({ hello: HELLO, check: [reply, ALL_OK], register: ['hold', { type: 'result', data: { registered: true } }] })
    renderSetup()
    await waitFor(() => expectInfo(alertCard(), code))
    const hospital = row('요양기관기호 확인')
    expect(hospital.textContent).toContain('✗')
    expect(hospital.textContent).toContain(`오류 번호 ${code}`)
    expect(screen.queryByRole('button', { name: '다시 등록' })).toBeNull()

    await userEvent.setup().click(within(hospital).getByRole('button', { name: '처음 등록' }))
    await waitFor(() => expect(fake.count('bit.register')).toBe(1))
    expect(button('처음 등록').disabled).toBe(true)
    expect(button('연결 다시 확인').disabled).toBe(true)
    for (const b of screen.getAllByRole('button', { name: '다시 확인' })) expect((b as HTMLButtonElement).disabled).toBe(true)
    expect(fake.count('bit.check')).toBe(1)

    fake.release()
    await screen.findByText('준비됨')
    expect(fake.sent).toEqual(['hello', 'bit.check', 'bit.register', 'bit.check'])
    expect(screen.queryByRole('button', { name: '처음 등록' })).toBeNull()
    expect(row('요양기관기호 확인').textContent).toContain('✓')
  })

  it('AC-006.2·AC-005.5: 병원이 다름(E-BIT-HOSPITAL-MISMATCH) → [다시 등록]([처음 등록] 아님), 누르면 bit.register(PC 확인 창) 뒤 다시 확인', async () => {
    const fake = fakeExtension({ hello: HELLO, check: [MISMATCH, ALL_OK] })
    renderSetup()
    await waitFor(() => expectInfo(alertCard(), 'E-BIT-HOSPITAL-MISMATCH'))
    const hospital = row('요양기관기호 확인')
    expect(hospital.textContent).toContain('오류 번호 E-BIT-HOSPITAL-MISMATCH')
    expect(screen.queryByRole('button', { name: '처음 등록' })).toBeNull()
    await userEvent.setup().click(within(hospital).getByRole('button', { name: '다시 등록' }))
    await screen.findByText('준비됨')
    expect(fake.sent).toEqual(['hello', 'bit.check', 'bit.register', 'bit.check'])
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

  it('AC-006.2·AC-006.6: bit.register가 오류 번호로 끝나면 위 카드에 그 번호의 errors.ts 문구', async () => {
    fakeExtension({
      hello: HELLO,
      check: [NOT_REGISTERED],
      register: [{ type: 'error', code: 'E-BIT-DB-FAILED' }],
    })
    renderSetup()
    await screen.findByRole('button', { name: '처음 등록' })
    await userEvent.setup().click(button('처음 등록'))
    await waitFor(() => expectInfo(alertCard(), 'E-BIT-DB-FAILED'))
    expect(button('처음 등록').disabled).toBe(false)
  })
})

describe('AC-006.3 새 도우미', () => {
  it('AC-006.3: 도우미가 최신보다 낮으면 "새 도우미가 있어요" 한 줄과 받는 곳 링크, 나머지는 그대로 쓸 수 있다', async () => {
    fakeExtension({ hello: helloWith({ helperVersion: '0.1.0' }) })
    renderSetup()
    await screen.findByText('준비됨')
    expect(screen.getByText('새 도우미가 있어요.')).toBeTruthy()
    expect(screen.getByRole('link', { name: '새 도우미 내려받기' }).getAttribute('href')).toBe(HELPER_RELEASES_URL)
    expect(screen.getByRole('link', { name: '청구로 가기' })).toBeTruthy()
    for (const li of rows()) expect(li.textContent).toContain('✓')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-006.3: 최신 도우미면 그 줄이 없다', async () => {
    fakeExtension({ hello: HELLO })
    renderSetup()
    await screen.findByText('준비됨')
    expect(screen.queryByText('새 도우미가 있어요.')).toBeNull()
  })
})

describe('AC-006.4 이 PC', () => {
  it('AC-006.4: 기관기호는 뒤 4자리를 가리고, 그 옆 병원 이름은 도우미 답이 아니라 사이트의 병원 이름이다', async () => {
    fakeExtension({ hello: HELLO })
    renderSetup()
    await screen.findByText('준비됨')
    expect(pcValue('요양기관기호').textContent).toBe(`1234**** · ${CLINIC}`)
    expect(document.body.textContent).not.toContain('12345678')
    expect(pcValue('크롬 확장').textContent).toBe('0.1.0')
    expect(pcValue('도우미').textContent).toBe('0.2.0')
  })

  it('AC-006.4: 등록이 없으면(기관기호 없음) 요양기관기호 칸은 "—"', async () => {
    fakeExtension({ hello: HELLO, check: [NOT_REGISTERED] })
    renderSetup()
    await screen.findByRole('button', { name: '처음 등록' })
    expect(pcValue('요양기관기호').textContent).toContain('—')
  })

  it('AC-006.4: 마지막 확인 시각은 한국 시각 "11월 4일 (수) 09:12" 모양', () => {
    expect(checkedAtText(new Date('2026-11-04T00:12:00Z'))).toBe('11월 4일 (수) 09:12')
    expect(checkedAtText(new Date('2026-10-31T15:05:00Z'))).toBe('11월 1일 (일) 00:05')
  })
})

describe('AC-006.5 확장 없는 곳·휴대폰', () => {
  it('AC-006.5: 확장이 없으면 "비트 PC의 크롬에서 엽니다" 안내와 밖에서 보는 건수(/claim)로 가는 링크', async () => {
    vi.stubGlobal('chrome', undefined)
    renderSetup()
    await screen.findByRole('alert')
    expect(screen.getByText(/비트 PC의 크롬에서 엽니다/)).toBeTruthy()
    const outside = screen.getByRole('link', { name: '건수만 보기' })
    expect(outside.getAttribute('href')).toBe('/claim')
  })

  it('AC-006.5: 확장이 있으면 그 안내는 없다', async () => {
    fakeExtension({ hello: HELLO })
    renderSetup()
    await screen.findByText('준비됨')
    expect(screen.queryByText(/비트 PC의 크롬에서 엽니다/)).toBeNull()
  })
})

describe('AC-006.6 오류 문구는 errors.ts에서, 원래 오류 내용은 안 보임', () => {
  it('AC-006.6: 확장 연결이 예외(원래 글)로 실패해도 화면에는 번호와 errors.ts 문구만', async () => {
    vi.stubGlobal('chrome', {
      runtime: {
        connect() {
          throw new Error(`Invalid extension id ${RAW}`)
        },
      },
    })
    renderSetup()
    await waitFor(() => expectInfo(alertCard(), 'E-EXT-MISSING'))
    expect(document.body.textContent).not.toContain(RAW)
  })

  it('AC-006.6: 도우미 답에 다른 칸(원래 오류 글)이 붙어 오면 쓰지 않고 E-BRIDGE-BAD-REPLY만 보인다', async () => {
    fakeExtension({ hello: HELLO, check: [{ type: 'error', code: 'E-BIT-DB-FAILED', message: RAW }] })
    renderSetup()
    await waitFor(() => expectInfo(alertCard(), 'E-BRIDGE-BAD-REPLY'))
    expect(document.body.textContent).not.toContain(RAW)
  })

  it('AC-006.6: errors.ts에 없는 번호는 번호만 보이고 지어낸 문구가 없다', async () => {
    fakeExtension({ hello: HELLO, check: [check(true, 'E-BIT-SOMETHING-NEW', 'E-BIT-SOMETHING-NEW')] })
    renderSetup()
    await waitFor(() => expect(row('비트 자료 읽기').textContent).toContain('오류 번호 E-BIT-SOMETHING-NEW'))
    const lines = Array.from(alertCard().querySelectorAll('p')).map((p) => p.textContent)
    expect(lines).toEqual(['오류 번호 E-BIT-SOMETHING-NEW'])
  })
})

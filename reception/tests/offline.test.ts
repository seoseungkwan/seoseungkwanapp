// @vitest-environment jsdom
// 지우기 + 연결 끊김·불러오는 중 화면 offline.js (TASK-18, design.md 10절, 승인 시안 Offline.dc.html).
// 끊기면 그 자리에서 환자 줄·상세를 모두 지우고 시안 글 그대로 "지금 볼 수 없어요" 화면을 그린다(AC-1407.4).
// 확인 글의 N은 poll.js가 넘기는 마지막으로 받은 every다(TASK-31, AC-1403.9: 시안의 10은 그때 간격).
// 숨김 뒤 다시 보일 때는 환자 자료 없는 "불러오는 중이에요"(index.html의 처음 화면과 같은 모양, AC-1407.11). 자료는 가짜다
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import * as fx from './fixtures'

interface OfflineJs {
  renderOffline: (host: HTMLElement, options?: { lastAt?: string | null; every?: unknown }) => HTMLElement
  renderLoading: (host: HTMLElement) => HTMLElement
  /** 끊김 화면에 그릴 앞 판의 로고(cfg.logo, 받아 둔 그림 { ver, src }). null이면 잊는다 (reception-other-clinic AC-5709.4) */
  rememberLogo?: (logo: unknown, pic?: unknown) => void
}

interface BoardJs {
  renderBoard: (host: HTMLElement, board: fx.FakeBoard, view?: Record<string, unknown>) => HTMLElement
}

// 화면 파일은 빌드 없는 JS라 형 선언이 없다(design.md 결정 '화면은 빌드 없는 JS'). 경로를 값으로 두어 형 검사가 묻지 않게 한다
const OFFLINE_JS = '../www/offline.js'
const BOARD_JS = '../www/board.js'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
let off: OfflineJs
let board: BoardJs

beforeAll(async () => {
  // 아직 없으면(RED) 아무것도 그리지 않는 대역으로 시험마다 실패를 보인다
  const missing: OfflineJs = {
    renderOffline: (host) => host.appendChild(document.createElement('div')),
    renderLoading: (host) => host.appendChild(document.createElement('div')),
  }
  off = ((await import(/* @vite-ignore */ OFFLINE_JS).catch(() => missing)) ?? missing) as OfflineJs
  board = (await import(/* @vite-ignore */ BOARD_JS)) as BoardJs
})

afterEach(() => {
  document.body.replaceChildren()
  document.title = ''
})

function appHost(): HTMLElement {
  const app = document.createElement('div')
  app.id = 'app'
  document.body.appendChild(app)
  return app
}

function textOf(root: ParentNode, selector: string): string | null {
  return root.querySelector(selector)?.textContent?.trim() ?? null
}

/** 바로 아래 아이들의 '태그.class' */
function shapeOf(node: Element | null | undefined): string[] {
  return [...(node?.children ?? [])].map((c) => `${c.tagName.toLowerCase()}${c.className ? `.${c.className.split(' ').join('.')}` : ''}`)
}

/** 진료 순서(처음 고른 칸)에 보이는 환자 글. 정보는 화면에 보이는 조각(신환이면 " · 신환"을 뺀 글과 신환 표시, AC-1503.2) */
function queueTexts(b: fx.FakeBoard): string[] {
  return b.lists.queue.flatMap(fx.rowTexts)
}

/** 가짜 판의 환자 글(이름·차트번호·메모·정보의 보이는 조각과 받은 처방 글) 모두 */
function patientTexts(b: fx.FakeBoard): string[] {
  // 처방 글(rx)은 목록 줄에 안 보여도(AC-1504.1) 받은 판에 있으니 지운 뒤 남지 않았는지 함께 본다
  return [...new Set(b.lists.queue.concat(b.lists.pay, b.lists.done).flatMap((row) => [...fx.rowTexts(row), row.rx].filter((t) => t !== '')))]
}

/** 글 칸 사이 빈칸을 하나로 줄인 HTML(시안·index.html과 견주기) */
function squash(html: string): string {
  return html.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim()
}

const LEAD = '총괄 컴퓨터가 꺼져 있거나, 비트에 아직 로그인하지 않았어요.'
const SUB = '컴퓨터가 켜지고 비트에 로그인하면 이 화면이 저절로 다시 바뀌어요. 따로 누를 건 없어요.'
const FOOT = '연결이 끊기면 환자 정보는 화면에서 바로 지워져요'

describe('offline.js 연결 끊김 화면', () => {
  it('AC-1407.4: 목록이 있던 자리에 그리면 환자 줄을 모두 지우고 시안 글 그대로 연결 끊김 화면 하나만 남는다', () => {
    const app = appHost()
    const b = fx.mockupBoard()
    board.renderBoard(app, b)
    for (const t of queueTexts(b)) expect(app.textContent).toContain(t)

    const page = off.renderOffline(app, { lastAt: '13:42', every: 5 })
    expect(app.children.length).toBe(1)
    expect(app.firstElementChild).toBe(page)
    for (const t of patientTexts(b)) expect(document.body.textContent, t).not.toContain(t)
    expect(app.querySelector('.row, .rows, .detail, .pane')).toBeNull()

    expect(page.className).toBe('page off-page')
    expect(shapeOf(page)).toEqual(['header.top.is-offline', 'main.off', 'footer.foot'])
    const top = page.querySelector('header.top')
    expect(shapeOf(top)).toEqual(['h1.off-title', 'span.conn.is-off'])
    expect(textOf(page, 'h1.off-title')).toBe('접수 현황')
    expect(textOf(page, 'span.conn.is-off')).toBe('연결 끊김')

    const main = page.querySelector('main.off')
    // 앞 판의 로고가 메모리에 없으면 로고 없이 시안 글만이다(우리 의원 로고 그림을 쓰지 않음, reception-other-clinic AC-5709.4)
    expect(shapeOf(main)).toEqual(['h2.off-heading', 'p.off-lead', 'p.off-sub', 'div.off-status'])
    expect(textOf(page, 'h2.off-heading')).toBe('지금 볼 수 없어요')
    expect(textOf(page, 'p.off-lead')).toBe(LEAD)
    expect(textOf(page, 'p.off-sub')).toBe(SUB)
    expect(textOf(page, '.off-status')).toBe('5초마다 다시 확인하는 중 · 마지막 연결 13:42')
    expect(textOf(page, 'footer.foot')).toBe(FOOT)
  })

  it('AC-1407.4: 시안 Offline.dc.html의 글(머리·제목·두 줄·확인 글·아래 글)이 화면 글과 같다(확인 글의 N은 every: 시안의 숫자를 넘기면 시안 글 그대로)', () => {
    const mock = readFileSync(path.join(ROOT, 'docs', 'mockups', 'reception-phone', 'Offline.dc.html'), 'utf8')
    const text = mock.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '\n')
    const lines = text.split('\n').map((s) => s.trim()).filter(Boolean)
    const status = lines.find((line) => /^\d+초마다 다시 확인하는 중 · 마지막 연결 13:42$/.test(line))
    expect(status).toBeDefined()
    const every = Number(/^\d+/.exec(status!)![0])
    const app = appHost()
    const page = off.renderOffline(app, { lastAt: '13:42', every })
    for (const line of ['접수 현황', '연결 끊김', '지금 볼 수 없어요', LEAD, SUB, FOOT]) expect(lines, line).toContain(line)
    for (const [selector, line] of [['h1.off-title', '접수 현황'], ['span.conn.is-off', '연결 끊김'], ['h2.off-heading', '지금 볼 수 없어요'], ['p.off-lead', LEAD], ['p.off-sub', SUB], ['.off-status', status], ['footer.foot', FOOT]] as const)
      expect(textOf(page, selector), selector).toBe(line)
  })

  it('AC-1407.4: 확인 글 "N초마다 다시 확인하는 중"의 N은 받은 every(마지막으로 받은 간격, 처음 연결 전에는 poll.js 기본값)다', () => {
    const app = appHost()
    for (const every of [2, 3, 5, 7, 60]) {
      off.renderOffline(app, { lastAt: '13:42', every })
      expect(textOf(app, '.off-status'), String(every)).toBe(`${every}초마다 다시 확인하는 중 · 마지막 연결 13:42`)
      off.renderOffline(app, { every })
      expect(textOf(app, '.off-status'), String(every)).toBe(`${every}초마다 다시 확인하는 중`)
    }
  })

  it('AC-1407.4: every가 숫자가 아니면 간격 숫자를 지어내지 않는다(화면의 간격 숫자는 poll.js 기본값 하나, AC-1403.9)', () => {
    const app = appHost()
    for (const every of [undefined, null, '5', '<b>5</b>', 0, 2.5]) {
      off.renderOffline(app, { lastAt: '13:42', every })
      expect(textOf(app, '.off-status'), String(every)).toBe('다시 확인하는 중 · 마지막 연결 13:42')
    }
    off.renderOffline(app)
    expect(textOf(app, '.off-status')).toBe('다시 확인하는 중')
    expect(app.querySelector('b')).toBeNull()
  })

  it('AC-1407.10: 연결 끊김 화면에는 [새로 고침] 단추도 다른 단추·링크도 없다(every초마다 저절로 다시 본다)', () => {
    const app = appHost()
    off.renderOffline(app, { lastAt: '09:05', every: 5 })
    expect(app.querySelector('button, a')).toBeNull()
    expect(app.textContent).not.toContain('새로 고침')
  })

  it('AC-1407.4: 한 번도 연결하지 못했으면(마지막 연결 없음·모양 틀림) "마지막 연결" 없이 확인 글만 보인다', () => {
    const app = appHost()
    for (const lastAt of [undefined, null, '', '가상환자01', '13:42:10', '<b>1</b>']) {
      off.renderOffline(app, { lastAt, every: 5 })
      expect(textOf(app, '.off-status'), String(lastAt)).toBe('5초마다 다시 확인하는 중')
    }
    off.renderOffline(app, { every: 5 })
    expect(textOf(app, '.off-status')).toBe('5초마다 다시 확인하는 중')
  })

  it('AC-1407.4: 다시 그려도 화면은 하나이고 문서 제목은 바꾸지 않는다', () => {
    const app = appHost()
    document.title = '접수 현황'
    off.renderOffline(app, { lastAt: '13:42', every: 5 })
    off.renderOffline(app, { lastAt: '13:42', every: 5 })
    expect(app.querySelectorAll('.page').length).toBe(1)
    expect(document.title).toBe('접수 현황')
  })
})

describe('offline.js 불러오는 중 화면', () => {
  it('AC-1407.11: 상세·목록이 있던 자리에 그리면 환자 글을 모두 지우고 "불러오는 중이에요"만 남는다(index.html 처음 화면과 같은 모양)', () => {
    const app = appHost()
    const b = fx.mockupBoard()
    board.renderBoard(app, b, { tablet: true, picked: fx.fakeKey(2) })
    const page = off.renderLoading(app)
    expect(app.children.length).toBe(1)
    expect(app.firstElementChild).toBe(page)
    for (const t of patientTexts(b)) expect(document.body.textContent, t).not.toContain(t)
    expect(page.className).toBe('page off-page')
    expect(shapeOf(page)).toEqual(['header.top.is-offline', 'main.off'])
    expect(shapeOf(page.querySelector('header.top'))).toEqual(['h1.off-title'])
    expect(shapeOf(page.querySelector('main.off'))).toEqual(['p.off-lead'])
    expect(textOf(page, 'h1.off-title')).toBe('접수 현황')
    expect(textOf(page, 'p.off-lead')).toBe('불러오는 중이에요')
    expect(app.querySelector('button, a')).toBeNull()

    const html = readFileSync(path.join(ROOT, 'reception', 'www', 'index.html'), 'utf8')
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const first = doc.querySelector('#app')
    expect(first).not.toBeNull()
    expect(squash(app.innerHTML)).toBe(squash(first!.innerHTML))
  })
})

describe('offline.js 로고 (reception-other-clinic AC-5709.4)', () => {
  const PIC = { mode: 'pic', text: null, ver: 5 }

  it('AC-5709.4: 불러오는 중 화면·index.html 처음 화면에는 로고가 없고, 우리 의원 로고 그림과 "양지바른정형외과" 글이 없다', () => {
    const app = appHost()
    off.rememberLogo?.(PIC, { ver: 5, src: fx.fakeLogoUrl() })
    const page = off.renderLoading(app)
    expect(page.querySelector('img, .logo-text')).toBeNull()
    const html = readFileSync(path.join(ROOT, 'reception', 'www', 'index.html'), 'utf8')
    for (const text of [html, app.innerHTML, readFileSync(path.join(ROOT, 'reception', 'www', 'offline.js'), 'utf8')]) {
      expect(text).not.toMatch(/logo-wordmark|logo-mark\.png/)
      expect(text).not.toContain('양지바른정형외과')
    }
    expect(new DOMParser().parseFromString(html, 'text/html').querySelector('#app img')).toBeNull()
    off.rememberLogo?.(null)
  })

  it('AC-5709.4: 끊김 화면은 앞 판의 로고가 메모리에 있으면 그것을 맨 위에 그린다(pic이고 그 ver 그림 → img.off-logo data: URL, text → span.logo-text). 없거나 none이면 로고 없이 시안 글만이다', () => {
    expect(typeof off.rememberLogo).toBe('function')
    const app = appHost()
    const src = fx.fakeLogoUrl()
    off.rememberLogo?.(PIC, { ver: 5, src })
    let page = off.renderOffline(app, { lastAt: '13:42', every: 5 })
    expect(shapeOf(page.querySelector('main.off'))).toEqual(['img.off-logo', 'h2.off-heading', 'p.off-lead', 'p.off-sub', 'div.off-status'])
    expect(page.querySelector('img.off-logo')?.getAttribute('src')).toBe(src)
    expect(page.querySelector('img.off-logo')?.getAttribute('alt')).toBe('병원 로고')

    off.rememberLogo?.({ mode: 'text', text: '가나다<b>의원</b>', ver: 0 }, null)
    page = off.renderOffline(app, { lastAt: '13:42', every: 5 })
    expect(shapeOf(page.querySelector('main.off'))).toEqual(['span.logo-text', 'h2.off-heading', 'p.off-lead', 'p.off-sub', 'div.off-status'])
    expect(textOf(page, 'main.off > span.logo-text')).toBe('가나다<b>의원</b>')
    expect(page.querySelector('b')).toBeNull()

    for (const [logo, pic] of [
      [{ mode: 'none', text: null, ver: 5 }, { ver: 5, src }],
      [PIC, { ver: 4, src }],
      [PIC, { ver: 5, src: '/logo-wordmark.png' }],
      [PIC, null],
    ] as const) {
      off.rememberLogo?.(logo, pic)
      // 앞 화면이 끊김 화면이 아니어야 앞 로고를 이어 쓰지 않는다
      off.renderLoading(app)
      page = off.renderOffline(app, { lastAt: '13:42', every: 5 })
      expect(shapeOf(page.querySelector('main.off')), JSON.stringify([logo, pic])).toEqual(['h2.off-heading', 'p.off-lead', 'p.off-sub', 'div.off-status'])
    }
    off.rememberLogo?.(null)
  })

  it('AC-5709.4 · AC-5708.3: 끊김 뒤 지우기(rememberLogo(null), app.js wipe)로 메모리를 비워도 그려 둔 끊김 화면을 다시 그리면(다시 확인 실패마다) 같은 로고를 이어 쓴다. 불러오는 중을 거치면 로고가 없다', () => {
    const app = appHost()
    const src = fx.fakeLogoUrl('jpeg')
    off.rememberLogo?.(PIC, { ver: 5, src })
    off.renderOffline(app, { lastAt: '13:42', every: 5 })
    off.rememberLogo?.(null)
    const again = off.renderOffline(app, { lastAt: '13:42', every: 5 })
    expect(again.querySelector('main.off > img.off-logo')?.getAttribute('src')).toBe(src)
    expect(app.querySelectorAll('.page').length).toBe(1)
    off.renderLoading(app)
    const later = off.renderOffline(app, { lastAt: '13:42', every: 5 })
    expect(later.querySelector('img, .logo-text')).toBeNull()
  })
})

// 확장의 검사·넘기기 순수 함수(TASK-3, REQ-003). 명령 표·origin은 src/lib/bridge/commands.json 하나에서 온다
import { describe, expect, it } from 'vitest'
import commands from '../../src/lib/bridge/commands.json'
import { checkRequest, INPUT_KEEP_MS, isOurOrigin, withExtensionInfo } from './relay'

const ORIGIN = commands.origin
/** 옛 주소: 옛 주소 → 새 주소 넘기기가 끝날 때까지 함께 받는다(REQ-6401) */
const OLD_ORIGIN = 'https://seoseungkwanapp.vercel.app'
const ID = '0f8fad5b-d9cb-469f-a165-70867728950e'

function request(over: Record<string, unknown> = {}) {
  return { v: commands.protocol, id: ID, cmd: 'hello', args: {}, ...over }
}

describe('AC-003.2 AC-6401.1 우리 사이트 origin(새 주소·옛 주소)만 받는다', () => {
  it('AC-6401.1: commands.json origin은 새 주소 https://n-medi.vercel.app이고, 글자까지 같으면 받는다', () => {
    expect(ORIGIN).toBe('https://n-medi.vercel.app')
    expect(isOurOrigin(ORIGIN)).toBe(true)
  })

  it('AC-6401.1: 옛 주소 https://seoseungkwanapp.vercel.app도 글자까지 같으면 받는다', () => {
    expect(isOurOrigin(OLD_ORIGIN)).toBe(true)
  })

  it.each([
    undefined,
    '',
    'null',
    // 옛 주소의 비슷한 꼴
    'http://seoseungkwanapp.vercel.app',
    'https://seoseungkwanapp.vercel.app/',
    'https://seoseungkwanapp.vercel.app:443',
    'https://SEOSEUNGKWANAPP.vercel.app',
    'https://evil.seoseungkwanapp.vercel.app',
    'https://seoseungkwanapp.vercel.app.evil.com',
    // 새 주소의 비슷한 꼴
    'http://n-medi.vercel.app',
    'https://n-medi.vercel.app/',
    'https://n-medi.vercel.app:443',
    'https://N-MEDI.vercel.app',
    'https://N-medi.vercel.app',
    'https://evil.n-medi.vercel.app',
    'https://n-medi.vercel.app.evil.com',
    'https://n-medi.vercel.app/dashboard',
    ' https://n-medi.vercel.app',
    // 다른 vercel.app·그 밖
    'https://nmedi.vercel.app',
    'https://other-app.vercel.app',
    'https://vercel.app',
    'http://localhost:3000',
    `chrome-extension://${commands.extensionId}`,
  ])('AC-6401.1: %s 는 거절한다', (origin) => {
    expect(isOurOrigin(origin)).toBe(false)
  })
})

// spec google-link TASK-10: 확장 코드는 그대로, 새 명령표(수납 명령 여덟)로 다시 묶은 0.5.0이 sheet.*를 통과시킨다
describe('AC-8511.1 수납 명령 sheet.* 여덟은 통과한다', () => {
  const SHEET_ARGS: Record<string, Record<string, unknown>> = {
    'sheet.status': {},
    'sheet.code': {},
    'sheet.link': { url: 'https://script.google.com/macros/s/AKfycbFAKE0123456789/exec', shareWith: ['desk@fake.test'] },
    'sheet.import': {},
    'sheet.ping': { settings: { templateUrl: 'x' } },
    'sheet.catalog': {},
    'sheet.months': { settings: {}, months: ['2026-10'] },
    'sheet.fill': { day: '2026-10-30', mode: 'fillEmpty', auto: true, settings: {} },
  }

  it('AC-8511.1 명령 표에 sheet.* 여덟이 있다', () => {
    expect(Object.keys(commands.commands).filter((c) => c.startsWith('sheet.'))).toEqual(Object.keys(SHEET_ARGS))
  })

  it.each(Object.keys(SHEET_ARGS))('AC-8511.1 %s 요청은 checkRequest를 지나고 봉투를 고치지 않는다', (cmd) => {
    const msg = request({ cmd, args: SHEET_ARGS[cmd] })
    const checked = checkRequest(msg)
    expect(checked.ok).toBe(true)
    if (checked.ok) expect(checked.req).toBe(msg)
  })

  it('AC-8511.1 비슷한 이름(sheet.delete·sheet.Fill)은 여전히 E-BRIDGE-REJECTED', () => {
    for (const cmd of ['sheet.delete', 'sheet.Fill', 'sheet']) {
      expect(checkRequest(request({ cmd })).ok, cmd).toBe(false)
    }
  })
})

describe('AC-003.3 봉투 {v, id, cmd, args} 검사', () => {
  it.each(Object.keys(commands.commands))('명령 표의 %s 는 통과하고 같은 객체를 그대로 돌려준다', (cmd) => {
    const msg = request({ cmd, args: cmd === 'bit.input' ? { payload: '{"items":[]}' } : {} })
    const checked = checkRequest(msg)
    expect(checked.ok).toBe(true)
    if (checked.ok) expect(checked.req).toBe(msg)
    // 검사가 봉투를 고치지 않는다
    expect(msg).toEqual(request({ cmd, args: cmd === 'bit.input' ? { payload: '{"items":[]}' } : {} }))
  })

  it.each([
    ['명령 표에 없는 cmd', request({ cmd: 'bit.delete' })],
    ['객체의 기본 속성 이름 cmd(__proto__)', request({ cmd: '__proto__' })],
    ['객체의 기본 속성 이름 cmd(constructor)', request({ cmd: 'constructor' })],
    ['객체의 기본 속성 이름 cmd(toString)', request({ cmd: 'toString' })],
    ['cmd가 글자가 아님', request({ cmd: 1 })],
    ['v가 protocol과 다름', request({ v: commands.protocol + 1 })],
    ['v가 글자', request({ v: String(commands.protocol) })],
    ['args가 없음', { v: commands.protocol, id: ID, cmd: 'hello' }],
    ['args가 목록', request({ args: [] })],
    ['args가 null', request({ args: null })],
    ['args가 글자', request({ args: '{}' })],
    ['모르는 칸이 더 있음', request({ extra: 1 })],
    ['cmd가 없음', { v: commands.protocol, id: ID, args: {} }],
  ])('%s → E-BRIDGE-REJECTED (요청 id를 돌려준다)', (_name, msg) => {
    expect(checkRequest(msg)).toEqual({
      ok: false,
      reply: { v: commands.protocol, id: ID, type: 'error', code: 'E-BRIDGE-REJECTED' },
    })
  })

  it.each([
    ['봉투가 객체가 아님(글자)', JSON.stringify(request())],
    ['봉투가 null', null],
    ['봉투가 목록', [request()]],
    ['봉투가 숫자', 1],
    ['id가 없음', { v: commands.protocol, cmd: 'hello', args: {} }],
    ['id가 숫자', request({ id: 1 })],
    ['id가 빈 글자', request({ id: '' })],
    ['id에 허용하지 않는 글자', request({ id: '<script>' })],
    ['id가 64자보다 김', request({ id: 'a'.repeat(65) })],
  ])('%s → E-BRIDGE-REJECTED (id는 빈 글자)', (_name, msg) => {
    expect(checkRequest(msg)).toEqual({
      ok: false,
      reply: { v: commands.protocol, id: '', type: 'error', code: 'E-BRIDGE-REJECTED' },
    })
  })
})

describe('AC-003.6 hello 답에 확장 버전·protocol을 붙인다', () => {
  const ext = { version: '0.1.0', protocol: commands.protocol }

  it('result의 data에 extensionVersion·extensionProtocol을 더하고 원래 답은 고치지 않는다', () => {
    const reply = { v: 1, id: ID, type: 'result', data: { helperVersion: '0.1.0', protocol: 1 } }
    const before = structuredClone(reply)
    expect(withExtensionInfo(reply, ext)).toEqual({
      v: 1,
      id: ID,
      type: 'result',
      data: { helperVersion: '0.1.0', protocol: 1, extensionVersion: '0.1.0', extensionProtocol: commands.protocol },
    })
    expect(reply).toEqual(before)
  })

  it.each([
    ['error 답', { v: 1, id: ID, type: 'error', code: 'E-HELPER-BAD-MESSAGE' }],
    ['data가 객체가 아닌 result', { v: 1, id: ID, type: 'result', data: 'x' }],
    ['객체가 아닌 답', 'x'],
  ])('%s 는 그대로(같은 객체) 돌려준다', (_name, reply) => {
    expect(withExtensionInfo(reply, ext)).toBe(reply)
  })
})

describe('AC-003.7 bit.input 붙잡는 시간', () => {
  it('30분이다', () => {
    expect(INPUT_KEEP_MS).toBe(30 * 60 * 1000)
  })
})

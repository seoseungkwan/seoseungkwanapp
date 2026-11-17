import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { beforeAll, describe, expect, it } from 'vitest'

// 실제 파일을 만들지 않고, 경로만 빌려 eslint.config.mjs가 그 자리에 거는 규칙을 확인한다
const root = fileURLToPath(new URL('..', import.meta.url))
// ESLint 설정 읽기·검사가 느린 PC·CI에서도 흔들리지 않게
const SLOW = { timeout: 30_000 }
let eslint: ESLint

beforeAll(async () => {
  eslint = new ESLint({ cwd: root })
  await eslint.lintText('', { filePath: 'src/lib/parsers/warmup.ts' }) // 설정 읽기(느림)
}, 30_000)

async function lint(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages
}

// 그 규칙이 '오류'(severity 2)로 나는지. 경고는 AC를 통과해 버려 울타리가 아니다
async function errorRules(code: string, filePath: string) {
  const messages = await lint(code, filePath)
  return messages.filter((m) => m.severity === 2).map((m) => m.ruleId)
}

describe('AC-001.1·AC-001.2·AC-001.3 환자 자료 구역: 네트워크·React·Next·services·supabase·console 금지', SLOW, () => {
  const PARSERS = 'src/lib/parsers/probe.ts'

  it.each([
    ["fetch('x')", 'no-restricted-globals'],
    ["new XMLHttpRequest()", 'no-restricted-globals'],
    ["new WebSocket('x')", 'no-restricted-globals'],
    ["new EventSource('x')", 'no-restricted-globals'],
    ["importScripts('x')", 'no-restricted-globals'],
    ["navigator.sendBeacon('x')", 'no-restricted-properties'],
    ["window.navigator.sendBeacon('x')", 'no-restricted-properties'],
    ["window.fetch('x')", 'no-restricted-properties'],
    ["self.fetch('x')", 'no-restricted-properties'],
    ["globalThis.fetch('x')", 'no-restricted-properties'],
    ["new window.XMLHttpRequest()", 'no-restricted-properties'],
    ["new self.WebSocket('x')", 'no-restricted-properties'],
    ["new globalThis.EventSource('x')", 'no-restricted-properties'],
    ['console.log(1)', 'no-console'],
    ['console.error(1)', 'no-console'],
    // no-console은 전역 console을 바로 부를 때만 잡는다
    ['globalThis.console.log(1)', 'no-restricted-properties'],
    ['self.console.log(1)', 'no-restricted-properties'],
    ['const c = console; c.log(1)', 'no-restricted-globals'],
  ])('%s → %s', async (code, rule) => {
    expect(await errorRules(code, PARSERS)).toContain(rule)
  })

  it.each([
    "import React from 'react'",
    "import { useState } from 'react'",
    "import { jsx } from 'react/jsx-runtime'",
    "import { createRoot } from 'react-dom/client'",
    "import { NextResponse } from 'next/server'",
    "import next from 'next'",
    "import x from '@/services/claude'",
    "import x from '@/lib/supabase/browser'",
    "import x from '@/lib/supabase'",
    "import { createClient } from '@supabase/supabase-js'",
    "import x from '../../services/claude'",
    "import x from '../supabase/admin'",
  ])('%s → no-restricted-imports', async (code) => {
    expect(await errorRules(code, PARSERS)).toContain('no-restricted-imports')
  })

  // no-restricted-imports는 동적 import()를 검사하지 않는다
  it.each([
    "import('react')",
    "import('react-dom/client')",
    "import('next/server')",
    "import('next')",
    "import('@/services/claude')",
    "import('@/lib/supabase/browser')",
    "import('@/lib/supabase')",
    "import('@supabase/supabase-js')",
    "import('../../services/claude')",
    "import('../supabase/admin')",
  ])('await %s → no-restricted-syntax', async (expr) => {
    const code = `export const load = async () => await ${expr}`
    expect(await errorRules(code, PARSERS)).toContain('no-restricted-syntax')
  })

  it.each([
    'import(name)',
    'import(`${name}/claude`)',
    'import(`react`)',
    "import('@/ser' + 'vices/claude')",
  ])('글자로 고정되지 않은 %s → no-restricted-syntax', async (expr) => {
    const code = `export const load = async (name: string) => await ${expr}`
    expect(await errorRules(code, PARSERS)).toContain('no-restricted-syntax')
  })

  it.each(["import('xlsx')", "import('node:fs')", "import('./common')"])(
    '허용할 늦은 불러오기 %s는 통과한다',
    async (expr) => {
      expect(await lint(`export const load = async () => await ${expr}`, PARSERS)).toEqual([])
    },
  )

  // .tsx의 JSX는 import 줄 없이도 react/jsx-runtime을 불러온다
  it.each(['src/lib/analytics/probe.tsx', 'src/workers/probe.tsx'])('%s의 JSX → no-restricted-syntax', async (filePath) => {
    expect(await errorRules('export const A = () => <div />', filePath)).toContain('no-restricted-syntax')
    expect(await errorRules('export const A = () => <></>', filePath)).toContain('no-restricted-syntax')
  })

  it('src/workers도 막힌다', async () => {
    expect(await errorRules("fetch('x')", 'src/workers/probe.ts')).toContain('no-restricted-globals')
    expect(await errorRules("import x from '@/services/claude'", 'src/workers/probe.ts')).toContain(
      'no-restricted-imports',
    )
  })

  it('src/lib/analytics도 막힌다', async () => {
    expect(await errorRules('console.log(1)', 'src/lib/analytics/probe.ts')).toContain('no-console')
    expect(await errorRules("import React from 'react'", 'src/lib/analytics/probe.ts')).toContain(
      'no-restricted-imports',
    )
  })

  it('하위 폴더(lib/parsers/bit)도 막힌다', async () => {
    expect(await errorRules("fetch('x')", 'src/lib/parsers/bit/probe.ts')).toContain('no-restricted-globals')
  })

  it('구역 안 시험 파일도 같은 규칙 아래 있다', async () => {
    expect(await errorRules("fetch('x')", 'src/lib/parsers/probe.test.ts')).toContain('no-restricted-globals')
    expect(await errorRules('console.log(1)', 'src/lib/analytics/probe.test.ts')).toContain('no-console')
  })

  it('구역 안 시험이 node:fs로 가짜 파일을 읽는 것은 허용한다', async () => {
    const code = "import { readFileSync } from 'node:fs'\nexport const read = () => readFileSync('x')"
    expect(await lint(code, 'src/lib/parsers/probe.test.ts')).toEqual([])
  })
})

describe('AC-001.1·AC-001.2·AC-001.3 lib/payload도 환자 자료 구역, 구역 전체에서 브라우저 저장소 금지', SLOW, () => {
  const PAYLOAD = 'src/lib/payload/probe.ts'
  const ZONE = ['src/lib/parsers/probe.ts', 'src/lib/analytics/probe.ts', PAYLOAD, 'src/workers/probe.ts']

  it('lib/payload에서 fetch·console·React가 막힌다', async () => {
    expect(await errorRules("fetch('x')", PAYLOAD)).toContain('no-restricted-globals')
    expect(await errorRules("window.fetch('x')", PAYLOAD)).toContain('no-restricted-properties')
    expect(await errorRules('console.log(1)', PAYLOAD)).toContain('no-console')
    expect(await errorRules("import React from 'react'", PAYLOAD)).toContain('no-restricted-imports')
    expect(await errorRules("fetch('x')", 'src/lib/payload/probe.test.ts')).toContain('no-restricted-globals')
  })

  it.each(ZONE)('%s에서 localStorage가 막힌다', async (filePath) => {
    expect(await errorRules("localStorage.setItem('k', 'v')", filePath)).toContain('no-restricted-globals')
  })

  it.each([
    ["sessionStorage.getItem('k')", 'no-restricted-globals'],
    ["indexedDB.open('x')", 'no-restricted-globals'],
    ['const s = localStorage', 'no-restricted-globals'],
    ["window.localStorage.setItem('k', 'v')", 'no-restricted-properties'],
    ["self.indexedDB.open('x')", 'no-restricted-properties'],
    ['globalThis.sessionStorage.clear()', 'no-restricted-properties'],
  ])('%s → %s', async (code, rule) => {
    expect(await errorRules(code, PAYLOAD)).toContain(rule)
  })

  it.each([
    "import { saveMonths } from '@/lib/storage/monthStore'",
    "import x from '@/lib/storage'",
    "import x from '../storage/monthStore'",
    "import x from '../../lib/storage'",
  ])('%s → no-restricted-imports', async (code) => {
    expect(await errorRules(code, PAYLOAD)).toContain('no-restricted-imports')
  })

  it.each(["import('@/lib/storage/monthStore')", "import('../storage/monthStore')", "import('@/lib/storage')"])(
    'await %s → no-restricted-syntax',
    async (expr) => {
      expect(await errorRules(`export const load = async () => await ${expr}`, PAYLOAD)).toContain('no-restricted-syntax')
    },
  )

  // ESLint는 정해 준 안내 앞에 제 글(Unexpected use of …)을 붙인다
  it.each(["localStorage.getItem('k')", "import x from '@/lib/storage/monthStore'"])(
    '%s의 안내는 브라우저 저장소를 말한다',
    async (code) => {
      const messages = (await lint(code, PAYLOAD)).map((m) => m.message)
      expect(messages.join('\n')).toContain('환자 자료 구역은 브라우저 저장소를 쓸 수 없다')
    },
  )
})

describe('AC-001.2 환자 자료 구역: Supabase·lib/auth import 금지', SLOW, () => {
  const ZONE = ['src/lib/parsers/probe.ts', 'src/lib/analytics/probe.ts', 'src/lib/payload/probe.ts', 'src/workers/probe.ts']

  it.each(ZONE)('%s에서 @supabase/supabase-js·lib/supabase/browser·lib/auth/gate가 막힌다', async (filePath) => {
    for (const code of [
      "import { createClient } from '@supabase/supabase-js'",
      "import { supabaseBrowser } from '@/lib/supabase/browser'",
      "import { gate } from '@/lib/auth/gate'",
    ]) {
      expect(await errorRules(code, filePath)).toContain('no-restricted-imports')
    }
  })

  it.each([
    "import x from '@/lib/auth'",
    "import type { Gate } from '@/lib/auth/gate'",
    "import x from '../auth/gate'",
    "import x from '../../lib/auth'",
    "import x from '../../lib/auth/hospital/read'",
  ])('%s → no-restricted-imports', async (code) => {
    expect(await errorRules(code, 'src/lib/payload/probe.ts')).toContain('no-restricted-imports')
  })

  it.each(["import('@/lib/auth/gate')", "import('@/lib/auth')", "import('../auth/gate')", "import('@supabase/ssr')"])(
    'await %s → no-restricted-syntax',
    async (expr) => {
      const code = `export const load = async () => await ${expr}`
      expect(await errorRules(code, 'src/workers/probe.ts')).toContain('no-restricted-syntax')
    },
  )

  it('안내는 lib/auth를 말한다', async () => {
    const messages = (await lint("import { gate } from '@/lib/auth/gate'", 'src/lib/analytics/probe.ts')).map((m) => m.message)
    expect(messages.join('\n')).toContain('lib/auth')
  })
})


describe('AC-001.4 구역 밖', SLOW, () => {
  it('src/components에서 localStorage(마지막 탭 기억)는 막히지 않는다', async () => {
    expect(await lint("localStorage.setItem('k', 'v')", 'src/components/probe.tsx')).toEqual([])
  })

  it('src/components에서 fetch는 막히지 않는다', async () => {
    // 무시된 파일이면 '무시됨' 경고가 남으므로, 빈 목록 = 실제로 검사하고 통과했다는 뜻
    expect(await lint("fetch('/x')", 'src/components/probe.tsx')).toEqual([])
  })

  it('src/components에서 JSX·동적 import는 막히지 않는다', async () => {
    expect(await lint('export const A = () => <div />', 'src/components/probe.tsx')).toEqual([])
    expect(await lint("export const load = () => import('react')", 'src/components/probe.tsx')).toEqual([])
  })
})

describe('AC-001.4 react/no-danger: 어디서든 dangerouslySetInnerHTML 금지', SLOW, () => {
  const code = 'export const A = ({ x }: { x: string }) => <div dangerouslySetInnerHTML={{ __html: x }} />'

  it.each(['src/components/probe.tsx', 'src/app/probe/page.tsx', 'src/lib/report/probe.tsx'])(
    '%s',
    async (filePath) => {
      expect(await errorRules(code, filePath)).toContain('react/no-danger')
    },
  )
})

describe('AC-003.4 크롬 확장(extension/src/**): 저장소·console·네트워크 금지', SLOW, () => {
  const EXT = 'extension/src/probe.ts'

  it.each([
    // chrome.storage: 어느 객체를 거치든, 꺼내 쓰든 막힌다
    ["chrome.storage.local.set({ k: 1 })", 'no-restricted-properties'],
    ["chrome.storage.session.get('k')", 'no-restricted-properties'],
    ["chrome['storage'].local.get('k')", 'no-restricted-properties'],
    ['const { storage } = chrome', 'no-restricted-properties'],
    ["globalThis.chrome.storage.local.set({ k: 1 })", 'no-restricted-properties'],
    ["const c = chrome; c.storage.local.get('k')", 'no-restricted-properties'],
    ["export const f = (k: 'storage') => chrome[k]", 'no-restricted-syntax'],
    ["localStorage.setItem('k', 'v')", 'no-restricted-globals'],
    ["sessionStorage.getItem('k')", 'no-restricted-globals'],
    ["indexedDB.open('x')", 'no-restricted-globals'],
    ["self.indexedDB.open('x')", 'no-restricted-properties'],
    ["globalThis.localStorage.getItem('k')", 'no-restricted-properties'],
    ['console.log(1)', 'no-console'],
    ['const c = console; c.log(1)', 'no-restricted-globals'],
    ['self.console.error(1)', 'no-restricted-properties'],
    ["fetch('x')", 'no-restricted-globals'],
    ["self.fetch('x')", 'no-restricted-properties'],
    ['new XMLHttpRequest()', 'no-restricted-globals'],
    ["new WebSocket('x')", 'no-restricted-globals'],
    ["new EventSource('x')", 'no-restricted-globals'],
    ["new globalThis.WebSocket('x')", 'no-restricted-properties'],
  ])('%s → %s', async (code, rule) => {
    expect(await errorRules(code, EXT)).toContain(rule)
  })

  it('하위 폴더와 확장 시험 파일도 같은 규칙 아래 있다', async () => {
    expect(await errorRules('chrome.storage.local.clear()', 'extension/src/sub/probe.ts')).toContain(
      'no-restricted-properties',
    )
    expect(await errorRules('console.log(1)', 'extension/src/probe.test.ts')).toContain('no-console')
  })

  it('확장이 쓰는 chrome.runtime(웹 연결 받기·도우미 켜기)은 막히지 않는다', async () => {
    const code = [
      "const port = chrome.runtime.connectNative('com.seoseungkwan.precheck')",
      'chrome.runtime.onConnectExternal.addListener((p) => p.onMessage.addListener((m) => port.postMessage(m)))',
      'export const v = chrome.runtime.getManifest().version',
    ].join('\n')
    expect(await lint(code, EXT)).toEqual([])
  })

  it('빌드 산출물 extension/dist/는 ESLint가 보지 않는다', async () => {
    expect(await eslint.isPathIgnored('extension/dist/background.js')).toBe(true)
  })
})

describe('AC-004.1 통로 코드(src/lib/bridge/**)도 환자 자료 구역 규칙 전부 아래 있다', SLOW, () => {
  const BRIDGE = 'src/lib/bridge/probe.ts'

  it.each([
    ["fetch('x')", 'no-restricted-globals'],
    ['new XMLHttpRequest()', 'no-restricted-globals'],
    ["new WebSocket('x')", 'no-restricted-globals'],
    ["new EventSource('x')", 'no-restricted-globals'],
    ["navigator.sendBeacon('x')", 'no-restricted-properties'],
    ['console.log(1)', 'no-console'],
    ['const c = console; c.log(1)', 'no-restricted-globals'],
    ["localStorage.setItem('k', 'v')", 'no-restricted-globals'],
    ["sessionStorage.getItem('k')", 'no-restricted-globals'],
    ["indexedDB.open('x')", 'no-restricted-globals'],
    ["import React from 'react'", 'no-restricted-imports'],
    ["import { NextResponse } from 'next/server'", 'no-restricted-imports'],
    ["import { createClient } from '@supabase/supabase-js'", 'no-restricted-imports'],
    ["import { supabaseBrowser } from '@/lib/supabase/browser'", 'no-restricted-imports'],
    ["import { gate } from '@/lib/auth/gate'", 'no-restricted-imports'],
    ["import { saveMonths } from '@/lib/storage/monthStore'", 'no-restricted-imports'],
    ["export const load = async () => await import('react')", 'no-restricted-syntax'],
    ["export const load = async () => await import('@/lib/storage')", 'no-restricted-syntax'],
    ['export const load = async (name: string) => await import(name)', 'no-restricted-syntax'],
  ])('%s → %s', async (code, rule) => {
    expect(await errorRules(code, BRIDGE)).toContain(rule)
  })

  it('JSX가 막힌다(.tsx)', async () => {
    expect(await errorRules('export const A = () => <div />', 'src/lib/bridge/probe.tsx')).toContain('no-restricted-syntax')
  })

  it('통로 시험 파일도 같은 규칙 아래 있다', async () => {
    expect(await errorRules("fetch('x')", 'src/lib/bridge/probe.test.ts')).toContain('no-restricted-globals')
    expect(await errorRules('console.log(1)', 'src/lib/bridge/probe.test.ts')).toContain('no-console')
  })
})

describe('AC-004.1 통로 코드: 창 사이 통신 금지, 확장에는 EXTENSION_ID로만 말한다', SLOW, () => {
  const BRIDGE = 'src/lib/bridge/probe.ts'

  it.each([
    ["window.postMessage('x', '*')", 'no-restricted-properties'],
    ["self.postMessage('x')", 'no-restricted-properties'],
    ["globalThis.postMessage('x')", 'no-restricted-properties'],
    ["postMessage('x', '*')", 'no-restricted-globals'],
    ["new BroadcastChannel('x')", 'no-restricted-globals'],
    ["new window.BroadcastChannel('x')", 'no-restricted-properties'],
    ["new globalThis.BroadcastChannel('x')", 'no-restricted-properties'],
    ["parent.postMessage('x', '*')", 'no-restricted-globals'],
    ["top.postMessage('x', '*')", 'no-restricted-globals'],
    ["opener.postMessage('x', '*')", 'no-restricted-globals'],
    ["window.parent.postMessage('x', '*')", 'no-restricted-properties'],
    ["window.top.postMessage('x', '*')", 'no-restricted-properties'],
    ["window.opener.postMessage('x', '*')", 'no-restricted-properties'],
    ["globalThis.parent.postMessage('x', '*')", 'no-restricted-properties'],
    // 창 객체를 다른 이름에 담아 우회하지 못한다
    ["const w = window; w.postMessage('x', '*')", 'no-restricted-globals'],
    ["const g = globalThis; g.postMessage('x')", 'no-restricted-globals'],
    ["const { postMessage: p } = self; p('x')", 'no-restricted-globals'],
    // 문서 객체·전역 꺼내기로 창에 닿지 못한다
    ["document.defaultView.postMessage('x', '*')", 'no-restricted-globals'],
    ["export const f = (d: Document) => d.defaultView", 'no-restricted-properties'],
    ["export const f = () => Function('return this')()", 'no-restricted-globals'],
    ["export const f = () => eval('this')", 'no-restricted-globals'],
    ["export const f = (o: object) => Reflect.ownKeys(o)", 'no-restricted-globals'],
  ])('%s → %s', async (code, rule) => {
    expect(await errorRules(code, BRIDGE)).toContain(rule)
  })

  it.each([
    "chrome.runtime.connect('abcdefghijklmnopabcdefghijklmnop')",
    "chrome.runtime.sendMessage('abcdefghijklmnopabcdefghijklmnop', {})",
    'chrome.runtime.connect()',
    "chrome.runtime.connect({ name: 'x' })",
    // 주입받은 runtime도 같다
    'export const open = (runtime: R, id: string) => runtime.connect(id)',
    'export const ping = (runtime: R) => runtime.sendMessage(OTHER_ID, {})',
    'export const open = (runtime: R, ids: string[]) => runtime.connect(...ids)',
    // 꺼내 쓰기·글자 이름·call/apply/bind로 우회하지 못한다
    "const { connect } = chrome.runtime; connect('x')",
    "export const open = (runtime: R) => runtime['connect'](EXTENSION_ID)",
    'export const open = (runtime: R) => runtime.connect.call(runtime, EXTENSION_ID)',
    'export const open = (runtime: R) => runtime.sendMessage.apply(runtime, [EXTENSION_ID, {}])',
    'export const open = (runtime: R) => runtime.connect.bind(runtime)',
    "export const open = (runtime: R, k: 'connect') => runtime[k](EXTENSION_ID)",
    // 이름만 빌려 다른 값을 넣지 못한다
    "const EXTENSION_ID = 'other'; chrome.runtime.connect(EXTENSION_ID)",
    "let EXTENSION_ID = 'other'; chrome.runtime.connect(EXTENSION_ID)",
    "import { EXTENSION_ID } from './other'\nexport const open = (runtime: R) => runtime.connect(EXTENSION_ID)",
    "import { OTHER as EXTENSION_ID } from './extensionId'\nexport const open = (runtime: R) => runtime.connect(EXTENSION_ID)",
    'export const open = (runtime: R, EXTENSION_ID: string) => runtime.connect(EXTENSION_ID)',
    "export function open(runtime: R, EXTENSION_ID = 'other') { return runtime.connect(EXTENSION_ID) }",
    // connect·sendMessage를 값으로 꺼내 다른 이름으로 부르지 못한다
    "export const open = (runtime: R) => { const c = runtime.connect; return c('other') }",
    "const { connect: c } = chrome.runtime; c('other')",
    "const { sendMessage: s } = chrome.runtime; s('other', {})",
    "const { 'connect': c } = chrome.runtime; c('other')",
    "export const open = (runtime: R, k: string) => { const { [k]: c } = runtime; return c('other') }",
    "export const open = (runtime: R) => Reflect.apply(runtime.connect, runtime, ['other'])",
    "export const open = (runtime: R) => [runtime.connect][0]('other')",
    "export const open = (runtime: R) => Reflect.get(runtime, 'connect')('other')",
    "export const open = (runtime: R) => Object.getOwnPropertyDescriptor(runtime, `sendMessage`)",
  ])('%s → no-restricted-syntax', async (code) => {
    expect(await errorRules(code, BRIDGE)).toContain('no-restricted-syntax')
  })

  it('extensionId.ts의 EXTENSION_ID로 부르는 것은 막히지 않는다(주입받은 runtime·chrome.runtime 모두)', async () => {
    const code = [
      "import { EXTENSION_ID } from './extensionId'",
      'type R = { connect(id: string): unknown; sendMessage(id: string, m: unknown): unknown }',
      'export const open = (runtime: R) => runtime.connect(EXTENSION_ID)',
      'export const ping = (runtime: R) => runtime.sendMessage(EXTENSION_ID, {})',
      'export const viaChrome = () => chrome.runtime.connect(EXTENSION_ID)',
      // 확장이 있는지 보는 typeof는 된다
      "export const has = (runtime: R) => typeof runtime.connect === 'function'",
      'export const maybe = (runtime?: R) => runtime?.connect(EXTENSION_ID)',
    ].join('\n')
    expect(await lint(code, BRIDGE)).toEqual([])
  })

  it('EXTENSION_ID는 extensionId.ts에서만 commands.json으로 만든다', async () => {
    const code = "import commands from './commands.json'\nexport const EXTENSION_ID: string = commands.extensionId"
    expect(await lint(code, 'src/lib/bridge/extensionId.ts')).toEqual([])
    expect(await errorRules(code, 'src/lib/bridge/client.ts')).toContain('no-restricted-syntax')
  })

  it('Worker·MessagePort의 postMessage와 MessageChannel은 막히지 않는다', async () => {
    const code = [
      'type W = { postMessage(m: unknown, t: Transferable[]): void }',
      'export function open(worker: W) {',
      '  const channel = new MessageChannel()',
      "  worker.postMessage({ type: 'bridge-port' }, [channel.port2])",
      "  channel.port1.postMessage({ type: 'chunk' })",
      '  return channel.port1',
      '}',
    ].join('\n')
    expect(await lint(code, BRIDGE)).toEqual([])
  })
})

describe('AC-004.2 src/lib/precheck/**도 환자 자료 구역 규칙 아래 있다', SLOW, () => {
  const PRECHECK = 'src/lib/precheck/probe.ts'

  it.each([
    ["fetch('x')", 'no-restricted-globals'],
    ["window.fetch('x')", 'no-restricted-properties'],
    ["new WebSocket('x')", 'no-restricted-globals'],
    ["navigator.sendBeacon('x')", 'no-restricted-properties'],
    ['console.log(1)', 'no-console'],
    ['const c = console; c.log(1)', 'no-restricted-globals'],
    ["localStorage.setItem('k', 'v')", 'no-restricted-globals'],
    ["indexedDB.open('x')", 'no-restricted-globals'],
    ["import React from 'react'", 'no-restricted-imports'],
    ["import next from 'next'", 'no-restricted-imports'],
    ["import { createClient } from '@supabase/supabase-js'", 'no-restricted-imports'],
    ["import { gate } from '@/lib/auth/gate'", 'no-restricted-imports'],
    ["import { saveMonths } from '@/lib/storage/monthStore'", 'no-restricted-imports'],
    ["export const load = async () => await import('@/lib/supabase/browser')", 'no-restricted-syntax'],
    ['export const load = async (name: string) => await import(name)', 'no-restricted-syntax'],
  ])('%s → %s', async (code, rule) => {
    expect(await errorRules(code, PRECHECK)).toContain(rule)
  })

  it('JSX가 막히고, 하위 폴더·시험 파일도 같은 규칙 아래 있다', async () => {
    expect(await errorRules('export const A = () => <div />', 'src/lib/precheck/probe.tsx')).toContain('no-restricted-syntax')
    expect(await errorRules("fetch('x')", 'src/lib/precheck/rules/probe.ts')).toContain('no-restricted-globals')
    expect(await errorRules('console.log(1)', 'src/lib/precheck/probe.test.ts')).toContain('no-console')
  })

  it('규칙표를 글자로 고정한 경로의 import()로 불러오는 것은 된다', async () => {
    expect(await lint("export const load = async () => await import('./rules/table.json')", PRECHECK)).toEqual([])
  })

  it('안내는 lib/precheck·lib/bridge를 환자 자료 구역으로 말한다', async () => {
    const messages = (await lint("fetch('x')", PRECHECK)).map((m) => m.message).join('\n')
    expect(messages).toContain('lib/precheck')
    expect(messages).toContain('lib/bridge')
  })
})

describe('AC-004.11 client.ts는 src/lib/bridge 밖에서 import할 수 없다(화면은 workerSink.ts만)', SLOW, () => {
  it.each([
    ["import { connectBridge } from '@/lib/bridge/client'", 'src/components/claim/probe.ts'],
    ["import { connectBridge } from '../../lib/bridge/client'", 'src/components/claim/probe.ts'],
    ["import { connectBridge } from '@/lib/bridge/client.ts'", 'src/components/claim/probe.ts'],
    ["import type { Bridge } from '@/lib/bridge/client'", 'src/components/claim/probe.ts'],
    ["export { connectBridge } from '@/lib/bridge/client'", 'src/components/claim/probe.ts'],
    ["import { connectBridge } from '@/lib/bridge/client'", 'src/app/(app)/claim/page.tsx'],
    ["import { connectBridge } from '@/lib/bridge/client'", 'src/workers/probe.ts'],
    ["import { connectBridge } from '../bridge/client'", 'src/lib/precheck/probe.ts'],
    ["import { connectBridge } from '@/lib/bridge/client'", 'src/lib/parsers/probe.ts'],
  ])('%s (%s) → no-restricted-imports', async (code, filePath) => {
    expect(await errorRules(code, filePath)).toContain('no-restricted-imports')
  })

  it.each(['src/components/claim/probe.ts', 'src/workers/probe.ts', 'src/lib/precheck/probe.ts', 'extension/src/probe.ts'])(
    "%s에서 import('@/lib/bridge/client')도 막힌다",
    async (filePath) => {
      const code = "export const load = async () => await import('@/lib/bridge/client')"
      expect(await errorRules(code, filePath)).toContain('no-restricted-syntax')
    },
  )

  it('components/claim에서 workerSink.ts(화면 입구)와 types/bridge는 import할 수 있다', async () => {
    const code = [
      "import { connectScreenBridge } from '@/lib/bridge/workerSink'",
      "import type { BridgeState } from '@/types/bridge'",
      'export const open = connectScreenBridge',
      "export const first: BridgeState = 'connecting'",
    ].join('\n')
    expect(await lint(code, 'src/components/claim/probe.ts')).toEqual([])
  })

  it('lib/bridge 안(workerSink.ts)에서는 ./client를 import할 수 있다', async () => {
    const code = "import { connectBridge } from './client'\nexport const open = connectBridge"
    expect(await lint(code, 'src/lib/bridge/workerSink.ts')).toEqual([])
  })
})

describe('AC-601.1 src/lib/patients/**도 환자 자료 구역 규칙 전부 아래 있다', SLOW, () => {
  const PATIENTS = 'src/lib/patients/probe.ts'

  it.each([
    ["fetch('x')", 'no-restricted-globals'],
    ["window.fetch('x')", 'no-restricted-properties'],
    ['new XMLHttpRequest()', 'no-restricted-globals'],
    ["new WebSocket('x')", 'no-restricted-globals'],
    ["new EventSource('x')", 'no-restricted-globals'],
    ["navigator.sendBeacon('x')", 'no-restricted-properties'],
    ['console.log(1)', 'no-console'],
    ['const c = console; c.log(1)', 'no-restricted-globals'],
    ['self.console.log(1)', 'no-restricted-properties'],
    ["localStorage.setItem('k', 'v')", 'no-restricted-globals'],
    ["sessionStorage.getItem('k')", 'no-restricted-globals'],
    ["indexedDB.open('x')", 'no-restricted-globals'],
    ["window.localStorage.setItem('k', 'v')", 'no-restricted-properties'],
    ["import React from 'react'", 'no-restricted-imports'],
    ["import { NextResponse } from 'next/server'", 'no-restricted-imports'],
    ["import { createClient } from '@supabase/supabase-js'", 'no-restricted-imports'],
    ["import { supabaseBrowser } from '@/lib/supabase/browser'", 'no-restricted-imports'],
    ["import { gate } from '@/lib/auth/gate'", 'no-restricted-imports'],
    ["import x from '@/lib/storage/x'", 'no-restricted-imports'],
    ["import x from '../storage/contactCounts'", 'no-restricted-imports'],
    ["export const load = async () => await import('react')", 'no-restricted-syntax'],
    ["export const load = async () => await import('@/lib/storage/x')", 'no-restricted-syntax'],
    ['export const load = async (name: string) => await import(name)', 'no-restricted-syntax'],
  ])('%s → %s', async (code, rule) => {
    expect(await errorRules(code, PATIENTS)).toContain(rule)
  })

  it('JSX가 막힌다(.tsx)', async () => {
    expect(await errorRules('export const A = () => <div />', 'src/lib/patients/probe.tsx')).toContain('no-restricted-syntax')
    expect(await errorRules('export const A = () => <></>', 'src/lib/patients/probe.tsx')).toContain('no-restricted-syntax')
  })

  it('하위 폴더·시험 파일도 같은 규칙 아래 있다', async () => {
    expect(await errorRules("fetch('x')", 'src/lib/patients/sub/probe.ts')).toContain('no-restricted-globals')
    expect(await errorRules("fetch('x')", 'src/lib/patients/probe.test.ts')).toContain('no-restricted-globals')
    expect(await errorRules('console.log(1)', 'src/lib/patients/probe.test.ts')).toContain('no-console')
    expect(await errorRules("localStorage.getItem('k')", 'src/lib/patients/probe.test.ts')).toContain(
      'no-restricted-globals',
    )
  })

  it('날짜 계산(@/lib/analytics/dates) import는 된다', async () => {
    const code = "import { addDays } from '@/lib/analytics/dates'\nexport const next = addDays"
    expect(await lint(code, PATIENTS)).toEqual([])
  })

  it('구역 안 시험이 node:fs로 가짜 파일을 읽는 것은 된다', async () => {
    const code = "import { readFileSync } from 'node:fs'\nexport const read = () => readFileSync('x')"
    expect(await lint(code, 'src/lib/patients/probe.test.ts')).toEqual([])
  })

  it('안내는 lib/patients를 환자 자료 구역으로 말한다', async () => {
    const messages = (await lint("fetch('x')", PATIENTS)).map((m) => m.message).join('\n')
    expect(messages).toContain('lib/patients')
  })
})

describe('AC-601.2 components/patients/rows/**: JSX는 되고 네트워크·console·저장소·supabase·lib/storage·lib/auth는 막힌다', SLOW, () => {
  const ROWS = 'src/components/patients/rows/Probe.tsx'

  it.each([
    ["fetch('x')", 'no-restricted-globals'],
    ["window.fetch('x')", 'no-restricted-properties'],
    ['new XMLHttpRequest()', 'no-restricted-globals'],
    ["new WebSocket('x')", 'no-restricted-globals'],
    ["new EventSource('x')", 'no-restricted-globals'],
    ["navigator.sendBeacon('x')", 'no-restricted-properties'],
    ['console.log(1)', 'no-console'],
    ['const c = console; c.log(1)', 'no-restricted-globals'],
    ['globalThis.console.log(1)', 'no-restricted-properties'],
    ["localStorage.setItem('k', 'v')", 'no-restricted-globals'],
    ["sessionStorage.getItem('k')", 'no-restricted-globals'],
    ["indexedDB.open('x')", 'no-restricted-globals'],
    ["window.localStorage.setItem('k', 'v')", 'no-restricted-properties'],
    ["self.indexedDB.open('x')", 'no-restricted-properties'],
    ["import { supabaseBrowser } from '@/lib/supabase/browser'", 'no-restricted-imports'],
    ["import { createClient } from '@supabase/supabase-js'", 'no-restricted-imports'],
    ["import { saveCounts } from '@/lib/storage/contactCounts'", 'no-restricted-imports'],
    ["import { gate } from '@/lib/auth/gate'", 'no-restricted-imports'],
    ["import x from '../../../lib/storage/contactCounts'", 'no-restricted-imports'],
    ["import x from '../../../lib/supabase/browser'", 'no-restricted-imports'],
    ["import x from '../../../lib/auth/gate'", 'no-restricted-imports'],
    ["import x from '@/lib/auth/hospital/read'", 'no-restricted-imports'],
    ["import x from '@/lib/storage'", 'no-restricted-imports'],
    ["export const load = async () => await import('@/lib/supabase/browser')", 'no-restricted-syntax'],
    ["export const load = async () => await import('@/lib/storage/contactCounts')", 'no-restricted-syntax'],
    ["export const load = async () => await import('@/lib/auth/gate')", 'no-restricted-syntax'],
  ])('%s → %s', async (code, rule) => {
    expect(await errorRules(code, ROWS)).toContain(rule)
  })

  it('JSX와 react import는 된다(props로 받은 줄을 그린다)', async () => {
    const code = [
      "import { useState } from 'react'",
      'export function Rows({ rows }: { rows: string[] }) {',
      '  const [open] = useState(false)',
      '  return <>{open ? rows.map((r) => <div key={r}>{r}</div>) : null}</>',
      '}',
    ].join('\n')
    expect(await lint(code, ROWS)).toEqual([])
  })

  it('하위 폴더·시험 파일도 같은 울타리 아래 있다', async () => {
    expect(await errorRules("fetch('x')", 'src/components/patients/rows/sub/Probe.tsx')).toContain('no-restricted-globals')
    expect(await errorRules('console.log(1)', 'src/components/patients/rows/Probe.test.tsx')).toContain('no-console')
  })
})

describe('AC-601.3 components/patients/**·app/(app)/patients/**: 오류 보고 패키지 import 금지', SLOW, () => {
  const FILES = [
    'src/components/patients/Probe.tsx',
    'src/components/patients/rows/Probe.tsx',
    'src/app/(app)/patients/page.tsx',
  ]
  const IMPORTS = [
    "import * as Sentry from '@sentry/nextjs'",
    "import * as Sentry from '@sentry/browser'",
    "import { Analytics } from '@vercel/analytics/react'",
    "import { track } from '@vercel/analytics'",
    "import { SpeedInsights } from '@vercel/speed-insights/next'",
    "import { injectSpeedInsights } from '@vercel/speed-insights'",
  ]

  it.each(FILES.flatMap((filePath) => IMPORTS.map((code) => [code, filePath])))(
    '%s (%s) → no-restricted-imports',
    async (code, filePath) => {
      expect(await errorRules(code, filePath)).toContain('no-restricted-imports')
    },
  )

  it.each(
    FILES.flatMap((filePath) =>
      ["import('@sentry/nextjs')", "import('@vercel/analytics')", "import('@vercel/speed-insights/next')"].map((expr) => [
        expr,
        filePath,
      ]),
    ),
  )('await %s (%s) → no-restricted-syntax', async (expr, filePath) => {
    expect(await errorRules(`export const load = async () => await ${expr}`, filePath)).toContain('no-restricted-syntax')
  })

  it('components/patients(rows 밖)에서 lib/supabase/browser(건수 올리기)는 막히지 않는다', async () => {
    const code = "import { supabaseBrowser } from '@/lib/supabase/browser'\nexport const client = supabaseBrowser"
    expect(await lint(code, 'src/components/patients/Probe.tsx')).toEqual([])
  })

  it('app/(app)/patients에서 components/patients 화면 import는 된다', async () => {
    const code = "import { PatientsEntry } from '@/components/patients/PatientsEntry'\nexport default PatientsEntry"
    expect(await lint(code, 'src/app/(app)/patients/page.tsx')).toEqual([])
  })
})

describe('AC-601.4 새 블록이 기존 금지를 덮어 풀지 않는다(client.ts import)', SLOW, () => {
  it.each([
    'src/components/patients/Probe.tsx',
    'src/components/patients/rows/Probe.tsx',
    'src/app/(app)/patients/page.tsx',
    'src/lib/patients/probe.ts',
  ])('%s에서 @/lib/bridge/client import·import()가 막힌다', async (filePath) => {
    expect(await errorRules("import { connectBridge } from '@/lib/bridge/client'", filePath)).toContain(
      'no-restricted-imports',
    )
    expect(await errorRules("import { connectBridge } from '../../lib/bridge/client'", filePath)).toContain(
      'no-restricted-imports',
    )
    const code = "export const load = async () => await import('@/lib/bridge/client')"
    expect(await errorRules(code, filePath)).toContain('no-restricted-syntax')
  })

  it('components/patients에서 workerSink.ts(화면 입구)는 import할 수 있다', async () => {
    const code = "import { connectScreenBridge } from '@/lib/bridge/workerSink'\nexport const open = connectScreenBridge"
    expect(await lint(code, 'src/components/patients/Probe.tsx')).toEqual([])
    expect(await lint(code, 'src/components/patients/rows/Probe.tsx')).toEqual([])
  })
})

describe('AC-507.3 통계 저장(src/lib/storage/stats.ts) 울타리', SLOW, () => {
  const STATS = 'src/lib/storage/stats.ts'

  it.each([
    "import { parse } from '@/lib/parsers/bit'",
    "import x from '@/lib/parsers'",
    "import { parse } from '../parsers/bit'",
    "import type { Row } from '@/lib/parsers/bit'",
    "export { parse } from '@/lib/parsers/bit'",
    "import { connectScreenBridge } from '@/lib/bridge/workerSink'",
    "import { connectBridge } from '@/lib/bridge/client'",
    "import x from '@/lib/bridge'",
    "import { connectScreenBridge } from '../bridge/workerSink'",
    "import { open } from '@/workers/statsClient'",
    "import x from '@/workers'",
    "import { open } from '../../workers/statsClient'",
    "import x from '@/lib/analytics'",
    "import { aggregate } from '@/lib/analytics/aggregate'",
    "import { buildTrend } from '@/lib/analytics/rxTrend'",
    "import { buildSummary } from '../analytics/compare'",
    "import type { TrendPoint } from '@/lib/analytics/rxTrend'",
    "export { aggregate } from '@/lib/analytics/aggregate'",
    "import { aggregate } from '@/lib/analytics/dates/../aggregate'",
  ])('%s → no-restricted-imports', async (code) => {
    expect(await errorRules(code, STATS)).toContain('no-restricted-imports')
  })

  // no-restricted-imports는 동적 import()를 검사하지 않는다
  it.each([
    "import('@/lib/parsers/bit')",
    "import('../parsers/bit')",
    "import('@/lib/bridge/workerSink')",
    "import('@/lib/bridge/client')",
    "import('@/workers/statsClient')",
    "import('@/lib/analytics')",
    "import('@/lib/analytics/aggregate')",
    "import('../analytics/compare')",
  ])('await %s → no-restricted-syntax', async (expr) => {
    expect(await errorRules(`export const load = async () => await ${expr}`, STATS)).toContain('no-restricted-syntax')
  })

  it.each(['import(name)', 'import(`@/lib/parsers/${name}`)', "import('@/lib/par' + 'sers/bit')"])(
    '글자로 고정되지 않은 %s → no-restricted-syntax',
    async (expr) => {
      const code = `export const load = async (name: string) => await ${expr}`
      expect(await errorRules(code, STATS)).toContain('no-restricted-syntax')
    },
  )

  it.each([
    ['console.log(1)', 'no-console'],
    ['const c = console; c.log(1)', 'no-restricted-globals'],
    ['window.console.log(1)', 'no-restricted-properties'],
    ["localStorage.setItem('k', 'v')", 'no-restricted-globals'],
    ["sessionStorage.getItem('k')", 'no-restricted-globals'],
    ["indexedDB.open('k')", 'no-restricted-globals'],
    ["window.localStorage.setItem('k', 'v')", 'no-restricted-properties'],
    ["self.sessionStorage.getItem('k')", 'no-restricted-properties'],
    ["globalThis.indexedDB.open('k')", 'no-restricted-properties'],
  ])('%s → %s', async (code, rule) => {
    expect(await errorRules(code, STATS)).toContain(rule)
  })

  it('dates·coverage·검사·Supabase·오류 번호는 import할 수 있다', async () => {
    const code = [
      "import { isYmd } from '@/lib/analytics/dates'",
      "import { mergeRanges } from '@/lib/analytics/coverage'",
      "import { addDays } from '../analytics/dates'",
      "import { isCovered } from '../analytics/coverage'",
      "import { validateDayPayload } from '@/lib/payload/validate'",
      "import { supabaseBrowser } from '@/lib/supabase/browser'",
      "import type { SupabaseClient } from '@supabase/supabase-js'",
      "import type { ErrorCode } from '@/types/errors'",
      'export const used = [isYmd, mergeRanges, addDays, isCovered, validateDayPayload, supabaseBrowser]',
      'export type Used = SupabaseClient | ErrorCode',
    ].join('\n')
    expect(await lint(code, STATS)).toEqual([])
  })

  it("import('@/lib/analytics/dates')처럼 글자로 고정한 늦은 불러오기는 된다", async () => {
    const code = "export const load = async () => [await import('@/lib/analytics/dates'), await import('../analytics/coverage')]"
    expect(await lint(code, STATS)).toEqual([])
  })

  it('안내는 무엇을 쓸 수 없는지 말한다', async () => {
    const imports = (await lint("import { aggregate } from '@/lib/analytics/aggregate'", STATS)).map((m) => m.message).join('\n')
    expect(imports).toContain('lib/analytics')
    expect(imports).toContain('dates')
    expect(imports).toContain('coverage')
    const storage = (await lint("localStorage.setItem('k', 'v')", STATS)).map((m) => m.message).join('\n')
    expect(storage).toContain('브라우저 저장소')
  })

  it.each([
    "import { parse } from '@/lib/parsers/bit'\nexport const used = parse",
    "import { aggregate } from '@/lib/analytics/aggregate'\nexport const used = aggregate",
    'console.log(1)',
    "localStorage.setItem('k', 'v')",
  ])('통계 파일만: 같은 폴더의 다른 파일에는 규칙을 씌우지 않는다 — %s', async (code) => {
    expect(await lint(code, 'src/lib/storage/other.ts')).toEqual([])
  })

  it.each([
    'src/lib/parsers/probe.ts',
    'src/lib/analytics/probe.ts',
    'src/lib/payload/probe.ts',
    'src/lib/precheck/probe.ts',
    'src/lib/bridge/probe.ts',
    'src/workers/probe.ts',
  ])('환자 자료 구역 %s는 지금처럼 lib/storage를 import할 수 없다', async (filePath) => {
    expect(await errorRules("import { saveStats } from '@/lib/storage/stats'", filePath)).toContain('no-restricted-imports')
    expect(await errorRules("import { saveStats } from '../storage/stats'", filePath)).toContain('no-restricted-imports')
    const dynamic = "export const load = async () => await import('@/lib/storage/stats')"
    expect(await errorRules(dynamic, filePath)).toContain('no-restricted-syntax')
  })
})

describe('AC-013.7 환자 줄 화면 components/claim/rows: 네트워크·console·브라우저 저장소·supabase·storage·auth 금지, JSX는 된다', SLOW, () => {
  const ROWS = 'src/components/claim/rows/probe.tsx'

  it.each([
    ["fetch('x')", 'no-restricted-globals'],
    ["new XMLHttpRequest()", 'no-restricted-globals'],
    ["new WebSocket('x')", 'no-restricted-globals'],
    ["new EventSource('x')", 'no-restricted-globals'],
    ["navigator.sendBeacon('x')", 'no-restricted-properties'],
    ["window.fetch('x')", 'no-restricted-properties'],
    ['console.log(1)', 'no-console'],
    ['globalThis.console.log(1)', 'no-restricted-properties'],
    ['const c = console; c.log(1)', 'no-restricted-globals'],
    ["localStorage.setItem('a', 'b')", 'no-restricted-globals'],
    ["sessionStorage.setItem('a', 'b')", 'no-restricted-globals'],
    ["indexedDB.open('a')", 'no-restricted-globals'],
    ["window.localStorage.setItem('a', 'b')", 'no-restricted-properties'],
  ])('%s → %s', async (code, rule) => {
    expect(await errorRules(code, ROWS)).toContain(rule)
  })

  it.each([
    "import { supabaseBrowser } from '@/lib/supabase/browser'",
    "import { createClient } from '@supabase/supabase-js'",
    "import { readDayCounts } from '@/lib/storage/claimCounts'",
    "import { readDayCounts } from '../../../lib/storage/claimCounts'",
    "import { currentMe } from '@/lib/auth/gate'",
    "import { connectBridge } from '@/lib/bridge/client'",
    "import * as Sentry from '@sentry/nextjs'",
    "import { Analytics } from '@vercel/analytics/react'",
  ])('%s → no-restricted-imports', async (code) => {
    expect(await errorRules(`${code}\nexport {}`, ROWS)).toContain('no-restricted-imports')
  })

  it.each(["import('@/lib/supabase/browser')", "import('@/lib/storage/claimCounts')", "import('@/lib/auth/gate')", "import('@sentry/nextjs')", 'import(name)'])(
    '늦은 불러오기 %s → no-restricted-syntax',
    async (expr) => {
      const code = `export const load = async (name: string) => await ${expr}`
      expect(await errorRules(code, ROWS)).toContain('no-restricted-syntax')
    },
  )

  it('AC-013.7: JSX와 React·공통 모양 import는 된다(규칙이 받아야 할 줄 화면)', async () => {
    const code = [
      "import { useState } from 'react'",
      "import { ds } from '@/components/ui/classes'",
      'export function Row() {',
      '  const [open, setOpen] = useState(false)',
      '  return <button type="button" className={ds.textButton} onClick={() => setOpen(!open)}>근거 보기</button>',
      '}',
    ].join('\n')
    expect(await lint(code, ROWS)).toEqual([])
  })
})

describe('AC-013.7 청구 화면 폴더: 오류 보고 패키지 금지', SLOW, () => {
  const DIRS = ['src/components/claim/probe.tsx', 'src/components/claim/rows/probe.tsx', 'src/app/(app)/claim/probe.tsx']

  it.each(DIRS)('%s에서 오류 보고 패키지를 import하면 막힌다', async (filePath) => {
    for (const line of [
      "import * as Sentry from '@sentry/nextjs'",
      "import * as Browser from '@sentry/browser'",
      "import { Analytics } from '@vercel/analytics'",
      "import { Analytics } from '@vercel/analytics/react'",
      "import { SpeedInsights } from '@vercel/speed-insights'",
      "import { SpeedInsights } from '@vercel/speed-insights/next'",
    ]) {
      expect(await errorRules(`${line}\nexport {}`, filePath), line).toContain('no-restricted-imports')
    }
  })

  it.each(DIRS)('%s에서 늦은 불러오기로도 막힌다', async (filePath) => {
    for (const name of ['@sentry/nextjs', '@vercel/analytics', '@vercel/speed-insights/next']) {
      expect(await errorRules(`export const load = async () => await import('${name}')`, filePath), name).toContain('no-restricted-syntax')
    }
  })

  it.each(['src/components/claim/probe.tsx', 'src/app/(app)/claim/probe.tsx'])('%s에서 브라우저 저장소도 막힌다(화면이 환자 글자를 저장소에 두지 못하게)', async (filePath) => {
    expect(await errorRules("localStorage.setItem('a', 'b')", filePath)).toContain('no-restricted-globals')
    expect(await errorRules("window.sessionStorage.setItem('a', 'b')", filePath)).toContain('no-restricted-properties')
  })

  it('AC-013.7: components/claim(줄 밖)은 설정·건수를 읽으려고 supabase·storage를 import할 수 있다', async () => {
    const code = [
      "import { supabaseBrowser } from '@/lib/supabase/browser'",
      "import { readDayCounts } from '@/lib/storage/claimCounts'",
      'export const open = [supabaseBrowser, readDayCounts]',
    ].join('\n')
    expect(await lint(code, 'src/components/claim/probe.tsx')).toEqual([])
  })

  it('AC-013.7: components/claim 밖에는 이 울타리가 없다', async () => {
    expect(await lint("import { x } from '@vercel/analytics'\nexport const y = x", 'src/components/shell/probe.tsx')).toEqual([])
  })

  it('AC-013.7: package.json에 오류 보고 패키지가 없다', () => {
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf-8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    expect(names.filter((name) => /^@sentry\/|^@vercel\/(analytics|speed-insights)$/.test(name))).toEqual([])
  })
})

describe('AC-4901.8·AC-4907.3 src/lib/sunap/**(수납일지 장부 규칙)도 환자 자료 구역 규칙 전부 아래 있다', SLOW, () => {
  const SUNAP = 'src/lib/sunap/probe.ts'

  it.each([
    ["fetch('x')", 'no-restricted-globals'],
    ["window.fetch('x')", 'no-restricted-properties'],
    ['new XMLHttpRequest()', 'no-restricted-globals'],
    ["new WebSocket('x')", 'no-restricted-globals'],
    ["new EventSource('x')", 'no-restricted-globals'],
    ["navigator.sendBeacon('x')", 'no-restricted-properties'],
    ['console.log(1)', 'no-console'],
    ['const c = console; c.log(1)', 'no-restricted-globals'],
    ['self.console.log(1)', 'no-restricted-properties'],
    ["localStorage.setItem('k', 'v')", 'no-restricted-globals'],
    ["sessionStorage.getItem('k')", 'no-restricted-globals'],
    ["indexedDB.open('x')", 'no-restricted-globals'],
    ["window.localStorage.setItem('k', 'v')", 'no-restricted-properties'],
    ["import React from 'react'", 'no-restricted-imports'],
    ["import { NextResponse } from 'next/server'", 'no-restricted-imports'],
    ["import { createClient } from '@supabase/supabase-js'", 'no-restricted-imports'],
    ["import { supabaseBrowser } from '@/lib/supabase/browser'", 'no-restricted-imports'],
    ["import { gate } from '@/lib/auth/gate'", 'no-restricted-imports'],
    ["import { closeSunapDay } from '@/lib/storage/sunap'", 'no-restricted-imports'],
    ["import x from '../storage/sunap'", 'no-restricted-imports'],
    ["import { connect } from '@/lib/bridge/client'", 'no-restricted-imports'],
    ["export const load = async () => await import('react')", 'no-restricted-syntax'],
    ["export const load = async () => await import('@/lib/storage/sunap')", 'no-restricted-syntax'],
    ['export const load = async (name: string) => await import(name)', 'no-restricted-syntax'],
  ])('AC-4907.3: %s → %s', async (code, rule) => {
    expect(await errorRules(code, SUNAP)).toContain(rule)
  })

  it('AC-4907.3: JSX가 막힌다(.tsx)', async () => {
    expect(await errorRules('export const A = () => <div />', 'src/lib/sunap/probe.tsx')).toContain('no-restricted-syntax')
  })

  it('AC-4907.3: 하위 폴더·시험 파일도 같은 규칙 아래 있다', async () => {
    expect(await errorRules("fetch('x')", 'src/lib/sunap/sub/probe.ts')).toContain('no-restricted-globals')
    expect(await errorRules('console.log(1)', 'src/lib/sunap/probe.test.ts')).toContain('no-console')
    expect(await errorRules("localStorage.getItem('k')", 'src/lib/sunap/probe.test.ts')).toContain('no-restricted-globals')
  })

  it('AC-4907.3: 묶음 판단·날짜 계산·수납일지 타입 import는 된다', async () => {
    const code = [
      "import { groupMatches } from '@/lib/analytics/groupMatch'",
      "import { todayInKorea } from '@/lib/analytics/dates'",
      "import type { SunapLocalDay } from '@/types/sunap'",
      'export const pick = (local: SunapLocalDay) => [groupMatches, todayInKorea, local]',
    ].join('\n')
    expect(await lint(code, SUNAP)).toEqual([])
  })

  it('AC-4907.3: 안내는 lib/sunap을 환자 자료 구역으로 말한다', async () => {
    const messages = (await lint("fetch('x')", SUNAP)).map((m) => m.message).join('\n')
    expect(messages).toContain('lib/sunap')
  })

  it('AC-4901.8: 실제 장부 규칙 소스(lib/sunap·groupMatch·sunapRates)는 울타리에 걸리는 것이 없다', async () => {
    const files = [
      'src/lib/sunap/ledger.ts',
      'src/lib/sunap/memo.ts',
      'src/lib/analytics/groupMatch.ts',
      'src/lib/analytics/sunapRates.ts',
      'src/types/sunap.ts',
    ]
    const results = await eslint.lintFiles(files)
    expect(results.map((r) => r.filePath.replace(/\\/g, '/').replace(/^.*\/src\//, 'src/')).sort()).toEqual([...files].sort())
    expect(results.flatMap((r) => r.messages.map((m) => `${r.filePath}:${m.line} ${m.ruleId}`))).toEqual([])
  })
})

describe('AC-4905.8 components/sunap/rows/**(수납일지 장부 줄): JSX는 되고 네트워크·console·저장소·supabase·lib/storage·lib/auth·통로(lib/bridge)·workers는 막힌다', SLOW, () => {
  const ROWS = 'src/components/sunap/rows/Probe.tsx'

  it.each([
    ["fetch('x')", 'no-restricted-globals'],
    ["window.fetch('x')", 'no-restricted-properties'],
    ['new XMLHttpRequest()', 'no-restricted-globals'],
    ["new WebSocket('x')", 'no-restricted-globals'],
    ["new EventSource('x')", 'no-restricted-globals'],
    ["navigator.sendBeacon('x')", 'no-restricted-properties'],
    ['console.log(1)', 'no-console'],
    ['const c = console; c.log(1)', 'no-restricted-globals'],
    ['globalThis.console.log(1)', 'no-restricted-properties'],
    ["localStorage.setItem('k', 'v')", 'no-restricted-globals'],
    ["sessionStorage.getItem('k')", 'no-restricted-globals'],
    ["indexedDB.open('x')", 'no-restricted-globals'],
    ["window.localStorage.setItem('k', 'v')", 'no-restricted-properties'],
    ["import { supabaseBrowser } from '@/lib/supabase/browser'", 'no-restricted-imports'],
    ["import { createClient } from '@supabase/supabase-js'", 'no-restricted-imports'],
    ["import { addSpend } from '@/lib/storage/sunap'", 'no-restricted-imports'],
    ["import x from '../../../lib/storage/sunap'", 'no-restricted-imports'],
    ["import { gate } from '@/lib/auth/gate'", 'no-restricted-imports'],
    ["import { connectScreenBridge } from '@/lib/bridge/workerSink'", 'no-restricted-imports'],
    ["import { connectBridge } from '@/lib/bridge/client'", 'no-restricted-imports'],
    ["import x from '../../../lib/bridge/protocol'", 'no-restricted-imports'],
    ["import type { SunapPatch } from '@/workers/sunap/messages'", 'no-restricted-imports'],
    ["import * as Sentry from '@sentry/nextjs'", 'no-restricted-imports'],
    ["export const load = async () => await import('@/lib/supabase/browser')", 'no-restricted-syntax'],
    ["export const load = async () => await import('@/lib/storage/sunap')", 'no-restricted-syntax'],
    ["export const load = async () => await import('@/lib/bridge/workerSink')", 'no-restricted-syntax'],
    ["export const load = async () => await import('@/workers/sunap/handler')", 'no-restricted-syntax'],
    ['export const load = async (name: string) => await import(name)', 'no-restricted-syntax'],
  ])('AC-4905.8: %s → %s', async (code, rule) => {
    expect(await errorRules(code, ROWS)).toContain(rule)
  })

  it('AC-4905.8: JSX·react·장부 규칙(lib/sunap)·수납일지 타입·같은 폴더 모양 import는 된다(props로 받은 줄을 그린다)', async () => {
    const code = [
      "import { useState } from 'react'",
      "import { parseWon } from '@/lib/sunap/ledger'",
      "import type { LedgerRow } from '@/types/sunap'",
      "import { ds } from '@/components/ui/classes'",
      'export function Rows({ rows }: { rows: LedgerRow[] }) {',
      '  const [open] = useState(false)',
      '  return <div className={ds.panel}>{open ? rows.map((r) => <p key={r.chart}>{r.name}{parseWon(String(r.cash))}</p>) : null}</div>',
      '}',
    ].join('\n')
    expect(await lint(code, ROWS)).toEqual([])
  })

  it('AC-4905.8: 하위 폴더·시험 파일도 같은 울타리 아래 있다', async () => {
    expect(await errorRules("fetch('x')", 'src/components/sunap/rows/sub/Probe.tsx')).toContain('no-restricted-globals')
    expect(await errorRules('console.log(1)', 'src/components/sunap/rows/Probe.test.tsx')).toContain('no-console')
    expect(await errorRules("localStorage.getItem('k')", 'src/components/sunap/rows/Probe.test.tsx')).toContain('no-restricted-globals')
  })

  it('AC-4905.8: 안내는 수납일지 장부 줄 화면(components/sunap/rows)을 말한다', async () => {
    const messages = (await lint("fetch('x')", ROWS)).map((m) => m.message).join('\n')
    expect(messages).toContain('components/sunap/rows')
  })

  it('AC-4905.8: components/sunap(줄 밖)은 서버 저장·통로 입구를 import할 수 있고, 오류 보고 패키지·client.ts는 막힌다', async () => {
    const code = [
      "import { addSpend } from '@/lib/storage/sunap'",
      "import { supabaseBrowser } from '@/lib/supabase/browser'",
      "import type { ScreenBridge } from '@/lib/bridge/workerSink'",
      'export const parts = [addSpend, supabaseBrowser] as const',
      'export type Bridge = ScreenBridge',
    ].join('\n')
    expect(await lint(code, 'src/components/sunap/Probe.tsx')).toEqual([])
    expect(await errorRules("import * as Sentry from '@sentry/nextjs'", 'src/components/sunap/Probe.tsx')).toContain('no-restricted-imports')
    expect(await errorRules("import { connectBridge } from '@/lib/bridge/client'", 'src/components/sunap/Probe.tsx')).toContain(
      'no-restricted-imports',
    )
  })

  it('AC-4905.8: 실제 장부 줄 소스(rows/LedgerRows·rows/PaidRows·환자 이름을 그리는 rows/RsvPicker·rows/Pop)는 울타리에 걸리는 것이 없다', async () => {
    const files = ['src/components/sunap/rows/LedgerRows.tsx', 'src/components/sunap/rows/PaidRows.tsx', 'src/components/sunap/rows/RsvPicker.tsx', 'src/components/sunap/rows/Pop.tsx']
    const results = await eslint.lintFiles(files)
    expect(results.map((r) => r.filePath.replace(/\\/g, '/').replace(/^.*\/src\//, 'src/')).sort()).toEqual([...files].sort())
    expect(results.flatMap((r) => r.messages.map((m) => `${r.filePath}:${m.line} ${m.ruleId}`))).toEqual([])
  })
})

describe('AC-5902.8 src/lib/calendar/**(예약 셈: 환자 이름·차트번호 줄)도 환자 자료 구역 규칙 전부 아래 있다', SLOW, () => {
  const CALENDAR = 'src/lib/calendar/probe.ts'

  it.each([
    ["fetch('x')", 'no-restricted-globals'],
    ["window.fetch('x')", 'no-restricted-properties'],
    ['new XMLHttpRequest()', 'no-restricted-globals'],
    ["new WebSocket('x')", 'no-restricted-globals'],
    ["navigator.sendBeacon('x')", 'no-restricted-properties'],
    ['console.log(1)', 'no-console'],
    ['const c = console; c.log(1)', 'no-restricted-globals'],
    ["localStorage.setItem('k', 'v')", 'no-restricted-globals'],
    ["sessionStorage.getItem('k')", 'no-restricted-globals'],
    ["indexedDB.open('x')", 'no-restricted-globals'],
    ["window.localStorage.setItem('k', 'v')", 'no-restricted-properties'],
    ["import React from 'react'", 'no-restricted-imports'],
    ["import { useState } from 'react'", 'no-restricted-imports'],
    ["import { NextResponse } from 'next/server'", 'no-restricted-imports'],
    ["import { createClient } from '@supabase/supabase-js'", 'no-restricted-imports'],
    ["import { supabaseBrowser } from '@/lib/supabase/browser'", 'no-restricted-imports'],
    ["import { gate } from '@/lib/auth/gate'", 'no-restricted-imports'],
    ["import { listAppts } from '@/lib/storage/calendar'", 'no-restricted-imports'],
    ["import x from '../storage/calendar'", 'no-restricted-imports'],
    ["import { connectBridge } from '@/lib/bridge/client'", 'no-restricted-imports'],
    ["export const load = async () => await import('react')", 'no-restricted-syntax'],
    ["export const load = async () => await import('@/lib/storage/calendar')", 'no-restricted-syntax'],
    ['export const load = async (name: string) => await import(name)', 'no-restricted-syntax'],
  ])('AC-5902.8: %s → %s', async (code, rule) => {
    expect(await errorRules(code, CALENDAR)).toContain(rule)
  })

  it('AC-5902.8: JSX가 막히고(.tsx), 하위 폴더·시험 파일도 같은 규칙 아래 있다', async () => {
    expect(await errorRules('export const A = () => <div />', 'src/lib/calendar/probe.tsx')).toContain('no-restricted-syntax')
    expect(await errorRules("fetch('x')", 'src/lib/calendar/sub/probe.ts')).toContain('no-restricted-globals')
    expect(await errorRules('console.log(1)', 'src/lib/calendar/probe.test.ts')).toContain('no-console')
    expect(await errorRules("localStorage.getItem('k')", 'src/lib/calendar/probe.test.ts')).toContain('no-restricted-globals')
  })

  it('AC-5902.8: 날짜 계산(@/lib/analytics/dates)·같은 폴더 모양 import는 된다, 안내는 lib/calendar를 환자 자료 구역으로 말한다', async () => {
    const code = [
      "import { addDays } from '@/lib/analytics/dates'",
      "import type { CalAppt } from './shapes'",
      'export const next = (a: CalAppt) => addDays(a.day, 7)',
    ].join('\n')
    expect(await lint(code, CALENDAR)).toEqual([])
    const messages = (await lint("fetch('x')", CALENDAR)).map((m) => m.message).join('\n')
    expect(messages).toContain('lib/calendar')
  })

  it('AC-5902.8: 실제 예약 셈 소스(lib/calendar)는 울타리에 걸리는 것이 없다', async () => {
    const files = ['src/lib/calendar/shapes.ts', 'src/lib/calendar/layout.ts', 'src/lib/calendar/rules.ts', 'src/lib/calendar/counts.ts']
    const results = await eslint.lintFiles(files)
    expect(results.map((r) => r.filePath.replace(/\\/g, '/').replace(/^.*\/src\//, 'src/')).sort()).toEqual([...files].sort())
    expect(results.flatMap((r) => r.messages.map((m) => `${r.filePath}:${m.line} ${m.ruleId}`))).toEqual([])
  })
})

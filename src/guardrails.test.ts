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

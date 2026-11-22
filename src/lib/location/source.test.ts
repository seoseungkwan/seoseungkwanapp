import { readdirSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { join, posix } from 'node:path'
import { describe, expect, it } from 'vitest'

// 입지 분석 순수 함수 폴더 규칙(specs/location design.md 1절, REQ-7903 AC-7903.4).
// src/lib/location은 화면과 서버가 같이 쓰는 순수 함수만 둔다: 바깥 부르기는 서버 경로(app/api/ai/location)의 정해 둔 host로만 하므로
// 이 폴더는 네트워크·supabase·React·Next·브라우저 저장소·console을 쓰지 않는다. 환자 자료 구역이 아니고 그 구역 파일도 불러오지 않는다
// (날짜는 lib/analytics/dates.ts만). 새 eslint 규칙 대신 소스 글자로 본다(본보기 src/lib/contacts/source.test.ts)
const ROOT = process.cwd()
const DIR = 'src/lib/location'
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

const CODE_FILE = /\.(?:[cm]?[jt]sx?)$/
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/
// 시험 파일은 빼고 본다(시험은 node:fs로 소스를 읽는 등 앱 코드가 아니다)
function codeFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) return codeFiles(rel)
    return CODE_FILE.test(entry.name) && !TEST_FILE.test(entry.name) ? [rel] : []
  })
}

// 주석은 뺀다: 주석에 적은 "쓰지 않는다" 설명은 쓰는 것이 아니다. 'https://'처럼 글자 안의 //는 앞 글자가 ':'라 남는다
const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')

// 불러오는 자리: import·export … from, 맨 import '…', import('…'), require('…'), new URL('…')
const SPECIFIER = /(?:\bfrom|\bimport|\brequire|\bnew\s+URL)\s*\(?\s*(['"`])([^'"`\n]+)\1/g
const specifiers = (code: string) => [...withoutComments(code).matchAll(SPECIFIER)].map((m) => m[2])

// src 안 경로('lib/analytics/dates'처럼, 확장자·/index 뗌). 꾸러미 이름이면 null
function srcPathOf(spec: string, file: string): string | null {
  let path: string
  if (spec.startsWith('@/')) path = spec.slice(2)
  else if (spec.startsWith('./') || spec.startsWith('../')) {
    const joined = posix.normalize(posix.join(posix.dirname(file), spec))
    if (!joined.startsWith('src/')) return null
    path = joined.slice('src/'.length)
  } else return null
  return path.replace(/\.(?:[cm]?[jt]sx?)$/, '').replace(/\/index$/, '')
}

// 꾸러미: supabase·React·Next·서버 전용·날짜 꾸러미(날짜는 dates.ts 한 곳)·node 내장 모듈(파일·네트워크)
const BUILTINS = new Set(builtinModules.map((m) => m.replace(/^node:/, '')))
const BLOCKED_PACKAGE = /^(?:@supabase\/|react(?:-dom)?(?:\/|$)|next(?:\/|$)|server-only$|date-fns|dayjs|moment|luxon|node:)/
const isBlockedPackage = (spec: string) => BLOCKED_PACKAGE.test(spec) || BUILTINS.has(spec) || BUILTINS.has(spec.split('/')[0])
// src 안: 저장·supabase·로그인·화면·서버 코드와 환자 자료 구역(CLAUDE.md 아키텍처 규칙, eslint 구역 목록 + lib/bridge)
const BLOCKED_SRC = [
  'lib/storage',
  'lib/supabase',
  'lib/auth',
  'components',
  'app',
  'workers',
  'lib/parsers',
  'lib/analytics',
  'lib/payload',
  'lib/precheck',
  'lib/patients',
  'lib/sunap',
  'lib/calendar',
  'lib/bridge',
]
// 구역 안에서 여는 것은 한국 날짜 한 곳뿐(design.md 1절)
const ALLOWED_SRC = ['lib/analytics/dates']

function blockedImports(code: string, file: string): string[] {
  return specifiers(code).filter((spec) => {
    const path = srcPathOf(spec, file)
    if (path === null) return !spec.startsWith('.') && !spec.startsWith('@/') && isBlockedPackage(spec)
    if (ALLOWED_SRC.includes(path)) return false
    return BLOCKED_SRC.some((zone) => path === zone || path.startsWith(`${zone}/`))
  })
}

// 네트워크(맨 fetch 부르기·전역 fetch·XHR·소켓 등)·브라우저 저장소·console.
// 받은 함수 이름(deps.fetchX, q.fetch)은 점 뒤라 잡지 않는다 — 부르는 함수는 밖에서 받는다(design.md 1절 collect)
const BLOCKED_WORDS =
  /(?<![.\w$])fetch\s*\(|\b(?:globalThis|window|self)\s*\.\s*fetch\b|\b(?:XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|console)\b|\bdocument\s*\.\s*cookie\b/g
const blockedWords = (code: string) => withoutComments(code).match(BLOCKED_WORDS) ?? []

describe('AC-7903.4 src/lib/location은 바깥을 부르지 않는 순수 함수만 둔다', () => {
  it('AC-7903.4: 검사 규칙이 잡아야 할 것을 잡고 허용한 것은 잡지 않는다', () => {
    const FILE = 'src/lib/location/probe.ts'
    const caught = [
      "import { createClient } from '@supabase/supabase-js'",
      "import { supabaseBrowser } from '@/lib/supabase/browser'",
      "import { loadCandidates } from '@/lib/storage/location'",
      "import { loadCandidates } from '../storage/location'",
      "import { readMe } from '@/lib/auth/hospital.server'",
      "import { useState } from 'react'",
      "import Link from 'next/link'",
      "import 'server-only'",
      "import { readFileSync } from 'node:fs'",
      "import { readFileSync } from 'fs'",
      "import { format } from 'date-fns'",
      "import { fetchSource } from '@/app/api/ai/location/fetchSource'",
      "import { Fact } from '@/components/location/common/Fact'",
      "import { parseBit } from '@/lib/parsers/bit'",
      "import { aggregate } from '@/lib/analytics/aggregate'",
      "import * as analytics from '@/lib/analytics'",
      "const m = await import('../analytics/compare')",
      "import { open } from '@/lib/bridge/client'",
      "const p = require('@/lib/precheck/rules')",
    ]
    for (const line of caught) expect(blockedImports(line, FILE), line).not.toEqual([])
    const allowed = [
      "import { addMonthsToDay } from '@/lib/analytics/dates'",
      "import { isYmd } from '../analytics/dates'",
      "import type { Query } from '@/types/location'",
      "import { distM } from './coords'",
      "import income from './data/income.json'",
      "// import { x } from '@/lib/storage/location'",
    ]
    for (const line of allowed) expect(blockedImports(line, FILE), line).toEqual([])
    for (const line of [
      'await fetch(url)',
      "const res = await fetch('https://dapi.kakao.com')",
      'globalThis.fetch(url)',
      'const f = window.fetch',
      'new XMLHttpRequest()',
      'localStorage.getItem(k)',
      'sessionStorage.setItem(k, v)',
      'console.log(x)',
      'document.cookie = x',
    ])
      expect(blockedWords(line), line).not.toEqual([])
    for (const line of [
      '/* fetch(url)는 쓰지 않는다 */ const a = 1',
      "const href = 'https://dapi.kakao.com' // console 아님",
      'const prefetch = 1',
      'await deps.fetchQuery(q)',
      'await deps.fetch(q)',
      'const refetch = () => 1',
    ])
      expect(blockedWords(line), line).toEqual([])
  })

  it('AC-7903.4: 폴더에 종류·몸통 검사 query.ts가 있다', () => {
    expect(codeFiles(DIR)).toContain(`${DIR}/query.ts`)
  })

  it('AC-7903.4: supabase·React·Next·서버 코드·화면 코드·저장·환자 자료 구역(lib/analytics/dates 빼고)을 불러오지 않는다', () => {
    const found = codeFiles(DIR).flatMap((file) => blockedImports(read(file), file).map((spec) => `${file}: ${spec}`))
    expect(found).toEqual([])
  })

  it('AC-7903.4: 네트워크·브라우저 저장소·console을 쓰지 않는다', () => {
    const found = codeFiles(DIR).flatMap((file) => blockedWords(read(file)).map((word) => `${file}: ${word}`))
    expect(found).toEqual([])
  })

  it('AC-7903.4: eslint 환자 자료 구역 목록에 src/lib/location이 없다(환자 자료 구역이 아니다)', () => {
    const config = read('eslint.config.mjs')
    expect(config).toContain("'src/lib/parsers/**'")
    expect(config).not.toMatch(/src\/lib\/location/)
  })
})

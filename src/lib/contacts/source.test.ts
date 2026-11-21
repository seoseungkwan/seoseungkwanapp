import { readdirSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import { describe, expect, it } from 'vitest'

// 주소록 순수 함수 폴더 규칙(specs/contacts AC-6503.11, design.md '어디에 두나').
// src/lib/contacts는 환자 자료 구역 밖이지만 순수 함수만 둔다: supabase·lib/storage·React·Next·네트워크·브라우저 저장소·console·시계를 쓰지 않고,
// 환자 자료 구역 파일을 불러오지 않는다(날짜는 lib/analytics/dates.ts만). 새 eslint 규칙 대신 소스 글자로 본다
const ROOT = process.cwd()
const DIR = 'src/lib/contacts'
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

const CODE_FILE = /\.(?:[cm]?[jt]sx?)$/
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/
// 시험 파일은 빼고 본다(시험은 node:fs로 양식 파일을 읽는 등 앱 코드가 아니다)
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

// 꾸러미: supabase·React·Next
const BLOCKED_PACKAGE = /^(?:@supabase\/|react(?:-dom)?(?:\/|$)|next(?:\/|$))/
// src 안: 저장·supabase·로그인·화면 코드와 환자 자료 구역(CLAUDE.md 아키텍처 규칙, eslint 구역 목록 + lib/bridge)
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
// 구역 안에서 여는 것은 한국 날짜 한 곳뿐(design.md '어디에 두나')
const ALLOWED_SRC = ['lib/analytics/dates']

function blockedImports(code: string, file: string): string[] {
  return specifiers(code).filter((spec) => {
    if (BLOCKED_PACKAGE.test(spec)) return true
    const path = srcPathOf(spec, file)
    if (path === null || ALLOWED_SRC.includes(path)) return false
    return BLOCKED_SRC.some((zone) => path === zone || path.startsWith(`${zone}/`))
  })
}

// 네트워크·브라우저 저장소·console·시계(순수 함수는 오늘을 받는다)
const BLOCKED_WORDS =
  /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|cookie|console|todayInKorea)\b|\bDate\.now\b|\bnew\s+Date\b|\bperformance\.now\b/g
const blockedWords = (code: string) => withoutComments(code).match(BLOCKED_WORDS) ?? []

describe('AC-6503.11 src/lib/contacts는 순수 함수만 둔다', () => {
  it('AC-6503.11: 검사 규칙이 잡아야 할 것을 잡고 허용한 것은 잡지 않는다', () => {
    const FILE = 'src/lib/contacts/probe.ts'
    const caught = [
      "import { createClient } from '@supabase/supabase-js'",
      "import { supabaseBrowser } from '@/lib/supabase/browser'",
      "import { loadContacts } from '@/lib/storage/contacts'",
      "import { loadContacts } from '../storage/contacts'",
      "import { useState } from 'react'",
      "import Link from 'next/link'",
      "import { parseBit } from '@/lib/parsers/bit'",
      "import { cellText } from '../parsers/common'",
      "import { aggregate } from '@/lib/analytics/aggregate'",
      "import * as analytics from '@/lib/analytics'",
      "const m = await import('../analytics/compare')",
      "import { hasFinal } from '@/components/stats/periodPick'",
      "import { open } from '@/lib/bridge/client'",
      "const p = require('@/lib/precheck/rules')",
    ]
    for (const line of caught) expect(blockedImports(line, FILE), line).not.toEqual([])
    const allowed = [
      "import { parseDateCell } from '@/lib/analytics/dates'",
      "import { diffDays } from '../analytics/dates'",
      "import type { Company } from '@/types/contacts'",
      "import { cleanText } from './fields'",
      "const XLSX = await import('xlsx')",
      "// import { x } from '@/lib/storage/contacts'",
    ]
    for (const line of allowed) expect(blockedImports(line, FILE), line).toEqual([])
    for (const line of ['await fetch(url)', 'localStorage.getItem(k)', 'console.log(x)', 'const now = new Date()', 'Date.now()', 'todayInKorea()'])
      expect(blockedWords(line), line).not.toEqual([])
    for (const line of ["/* fetch는 쓰지 않는다 */ const a = 1", "const href = 'https://example.com' // console 아님", "const prefetch = 1"])
      expect(blockedWords(line), line).toEqual([])
  })

  it('AC-6503.11: 폴더에 순수 함수 파일 일곱이 있다', () => {
    const files = codeFiles(DIR)
    for (const name of ['categories', 'fields', 'korean', 'sheet', 'plan', 'warranty', 'search'])
      expect(files, name).toContain(`${DIR}/${name}.ts`)
  })

  it('AC-6503.11: supabase·lib/storage·React·Next·화면 코드·환자 자료 구역(lib/analytics/dates 빼고)을 불러오지 않는다', () => {
    const found = codeFiles(DIR).flatMap((file) => blockedImports(read(file), file).map((spec) => `${file}: ${spec}`))
    expect(found).toEqual([])
  })

  it('AC-6503.11: 네트워크·브라우저 저장소·console·시계를 쓰지 않는다', () => {
    const found = codeFiles(DIR).flatMap((file) => blockedWords(read(file)).map((word) => `${file}: ${word}`))
    expect(found).toEqual([])
  })

  it('AC-6503.11: eslint 환자 자료 구역 목록에 src/lib/contacts가 없다', () => {
    const config = read('eslint.config.mjs')
    expect(config).toContain("'src/lib/parsers/**'")
    expect(config).not.toMatch(/src\/lib\/contacts/)
  })
})

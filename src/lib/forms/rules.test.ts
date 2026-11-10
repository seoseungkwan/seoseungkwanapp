import { readdirSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import { describe, expect, it } from 'vitest'

// 서식 탭 규칙 시험 (specs/forms REQ-3510 AC-3510.2·AC-3510.3, REQ-3511 AC-3511.1·AC-3511.2, design.md 1·6·12·13절, ADR-028).
// 소스와 문서를 글자로 읽는다. 짝 시험: 안내문 글꼴 파일은 assets.test.ts(AC-3510.1), 안내문 SVG의 글꼴 이름·굵기 700·900은
// components/forms/Poster.test.tsx(AC-3510.2), 앱 글꼴 파일과 앱 화면 굵기 400·500·600은 src/app/fonts.test.ts(AC-203.1~203.3)가 본다
const ROOT = process.cwd()
// 줄바꿈이 CRLF로 받아져도 같은 글로 본다
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

// 이 파일은 검사 대상에서 뺀다: 검사 규칙을 시험하려고 막는 글(가짜 import·저장소 이름·글꼴 이름)을 글자로 품고 있다
const SELF = 'src/lib/forms/rules.test.ts'
const FORMS_DIRS = ['src/components/forms', 'src/lib/forms']

// 폴더 아래 파일(상대 경로, '/'로 잇는다)
function filesUnder(dir: string, keep: (name: string) => boolean): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) return filesUnder(rel, keep)
    return keep(entry.name) ? [rel] : []
  })
}
const CODE_FILE = /\.(?:[cm]?[jt]sx?)$/
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/
const formsCode = () => FORMS_DIRS.flatMap((dir) => filesUnder(dir, (name) => CODE_FILE.test(name))).filter((rel) => rel !== SELF)

// 주석은 뺀다: 주석에 적은 "쓰지 않는다" 설명은 쓰는 것이 아니다. 'https://'처럼 글자 안의 //는 앞 글자가 ':'라 남는다
const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')

// ---------- AC-3510.3: 서식 두 폴더는 환자 자료 구역·브라우저 저장소를 쓰지 않는다 ----------

// 불러오는 자리: import·export … from, 맨 import '…', import('…'), require('…'), vi.mock 무리('…'), new URL('…')(Worker 주소)
const SPECIFIER =
  /(?:\bfrom|\bimport|\brequire|\bvi\.(?:mock|doMock|importActual|importMock)|\bnew\s+URL)\s*\(?\s*(['"`])([^'"`\n]+)\1/g

// 그 자리가 가리키는 src 안 경로('lib/analytics/dates'처럼, 확장자·/index 뗌). 꾸러미 이름·src 밖·주소('/poster/…')는 null
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
const srcImports = (code: string, file: string) =>
  [...withoutComments(code).matchAll(SPECIFIER)].map((m) => srcPathOf(m[2], file)).filter((p): p is string => p !== null)

// 환자 자료 구역(CLAUDE.md 아키텍처 규칙, AC-3510.3). lib/patients는 docs/ARCHITECTURE.md의 [환자 구역]이라 같이 본다
const PATIENT_ZONE = ['lib/parsers', 'lib/analytics', 'lib/payload', 'lib/precheck', 'lib/bridge', 'lib/patients', 'workers']
// 구역 안에서 서식이 쓰는 두 파일만 연다: 한국 날짜 한 곳(CLAUDE.md '날짜 계산은 lib/analytics/dates.ts 한 곳')과
// 개인정보 모양 검사 hasPrivateShape(design.md 1절 'lib/payload/validate.ts에서 하나만 내보낸다')
const ALLOWED = ['lib/analytics/dates', 'lib/payload/validate']
const inPatientZone = (path: string) =>
  !ALLOWED.includes(path) && PATIENT_ZONE.some((zone) => path === zone || path.startsWith(`${zone}/`))
const zoneImports = (code: string, file: string) => srcImports(code, file).filter(inPatientZone)

const STORAGE = /\b(?:localStorage|sessionStorage|indexedDB)\b/g
const storageUses = (code: string) => withoutComments(code).match(STORAGE) ?? []

describe('AC-3510.3: 서식 폴더(src/components/forms·src/lib/forms)는 환자 자료 구역과 브라우저 저장소를 쓰지 않는다', () => {
  it('AC-3510.3: 검사 규칙 자체가 잡아야 할 것을 잡고, 허용한 것은 잡지 않는다', () => {
    const LIB = 'src/lib/forms/probe.ts'
    const UI = 'src/components/forms/Probe.tsx'
    const caught: [string, string][] = [
      ["import { parseBit } from '@/lib/parsers/bit'", LIB],
      ["import { aggregate } from '@/lib/analytics/aggregate'", LIB],
      ["import * as analytics from '@/lib/analytics'", LIB],
      ["import { x } from '@/lib/analytics/datesExtra'", LIB],
      ["import type { Rule } from '@/lib/precheck/rules'", LIB],
      ["export { send } from '@/lib/bridge'", LIB],
      ["import { toMonthPayload } from '@/lib/payload/month'", LIB],
      ["import { fuList } from '@/lib/patients/fu'", LIB],
      ["import '@/workers/analyze.worker'", LIB],
      ["const m = await import('../analytics/compare')", LIB],
      ["import { open } from '../../lib/bridge/client'", UI],
      ["const w = new Worker(new URL('../../workers/analyze.worker.ts', import.meta.url))", UI],
      ["const p = require('@/lib/parsers')", LIB],
      ["vi.mock('@/lib/precheck/run', () => ({}))", LIB],
      ["type T = typeof import('@/lib/analytics/compare')", LIB],
    ]
    for (const [code, file] of caught) expect(zoneImports(code, file), code).not.toEqual([])

    const passed: [string, string][] = [
      ["import { todayInKorea } from '@/lib/analytics/dates'", LIB],
      ["import { weekdayOf } from '../analytics/dates'", LIB],
      ["import { hasPrivateShape } from '@/lib/payload/validate'", LIB],
      ["import { sortCards } from './notice'", LIB],
      ["import { ds } from '@/components/ui/classes'", UI],
      ["import { listNotices } from '@/lib/storage/formNotices'", UI],
      ["import { useId } from 'react'", UI],
      ["const res = await fetch('/poster/themes/m05.svg')", UI],
      ["// import { parseBit } from '@/lib/parsers/bit'", LIB],
      ["/* await import('@/workers/analyze.worker') */", LIB],
      ["import { x } from '@/lib/parsersExtra'", LIB],
    ]
    for (const [code, file] of passed) expect(zoneImports(code, file), code).toEqual([])

    for (const code of [
      "localStorage.setItem('a', 'b')",
      'window.sessionStorage.clear()',
      "indexedDB.open('forms')",
      "globalThis['localStorage']",
    ]) {
      expect(storageUses(code), code).not.toEqual([])
    }
    for (const code of ['// localStorage에 두지 않는다', '/* indexedDB 안 씀 */', 'const storage = new Map()', 'const localStorageKey = 1']) {
      expect(storageUses(code), code).toEqual([])
    }
  })

  // 시험 파일도 본다: 서식 시험이 환자 자료 구역을 불러오면 서식 코드가 그 구역에 기대고 있다는 뜻이다(같은 vitest 안에서 실제로 불려 온다)
  it('AC-3510.3: 서식 두 폴더의 모든 코드 파일(시험 파일 포함, 이 파일 뺌)은 환자 자료 구역(lib/parsers·lib/analytics(dates 뺌)·lib/precheck·lib/bridge·workers)을 불러오지 않는다', () => {
    const files = formsCode()
    // 빈 검사가 아니다: 화면·순수 함수·시험 파일이 목록에 있다
    expect(files).toEqual(
      expect.arrayContaining([
        'src/components/forms/FormsScreen.tsx',
        'src/components/forms/Poster.tsx',
        'src/lib/forms/notice.ts',
        'src/lib/forms/ai.ts',
        'src/lib/forms/notice.test.ts',
      ]),
    )
    expect(files).not.toContain(SELF)
    expect(files.flatMap((rel) => zoneImports(read(rel), rel).map((path) => `${rel}: ${path}`))).toEqual([])
    // 허용한 날짜 한 곳은 실제로 불러온다(경로 풀기가 헛돌지 않는다)
    expect(files.some((rel) => srcImports(read(rel), rel).includes('lib/analytics/dates'))).toBe(true)
  })

  // 시험 파일은 뺀다: 시험은 저장소를 쓰지 않았음을 보이려고 localStorage 등을 가짜로 두거나 엿볼 수 있고, 시험 코드는 브라우저로 가지 않는다
  it('AC-3510.3: 서식 두 폴더의 시험 밖 코드는 브라우저 저장소(localStorage·sessionStorage·indexedDB)를 쓰지 않는다', () => {
    const files = formsCode().filter((rel) => !TEST_FILE.test(rel))
    expect(files).toEqual(expect.arrayContaining(['src/components/forms/FormsScreen.tsx', 'src/lib/forms/png.ts']))
    expect(files.some((rel) => TEST_FILE.test(rel))).toBe(false)
    expect(files.flatMap((rel) => storageUses(read(rel)).map((name) => `${rel}: ${name}`))).toEqual([])
  })
})

// ---------- AC-3510.2: 안내문 글꼴 이름은 서식 화면 폴더 안에서만 ----------

const POSTER_FONT = /PosterPretendard/i // CSS 글꼴 이름은 대소문자를 가리지 않는다
const TEXT_FILE = /\.(?:[cm]?[jt]sx?|css|json|md|svg|html|txt)$/

describe('AC-3510.2: 글꼴 이름 PosterPretendard(700·900)는 src/components/forms/ 안에서만 쓴다', () => {
  it('AC-3510.2: src/ 안의 글 파일(이 시험 파일 뺌)에서 src/components/forms/ 밖에는 PosterPretendard가 없다', () => {
    const files = filesUnder('src', (name) => TEXT_FILE.test(name)).filter((rel) => rel !== SELF)
    // 빈 검사가 아니다: 앱 글꼴을 내는 자리(layout.tsx·globals.css)와 서식 폴더가 목록에 있다
    expect(files).toEqual(
      expect.arrayContaining(['src/app/layout.tsx', 'src/app/globals.css', 'src/lib/forms/png.ts', 'src/components/forms/Poster.tsx']),
    )
    expect(files.filter((rel) => !rel.startsWith('src/components/forms/') && POSTER_FONT.test(read(rel)))).toEqual([])
    // 안내문 그림은 실제로 이 이름을 쓴다(쓰지 않는 예외를 남기지 않는다)
    expect(read('src/components/forms/Poster.tsx')).toMatch(POSTER_FONT)
  })
})

// ---------- AC-3511.1: ADR-028과 CLAUDE.md 예외 줄 ----------

const ADR_TITLE = /^### ADR-(\d{3}): (.+)$/gm
// 그 번호 ADR 절(제목 줄부터 다음 ADR 제목 앞까지). 없으면 ''
function adrSection(doc: string, no: string): string {
  const head = new RegExp(`^### ADR-${no}: `, 'm').exec(doc)
  if (head === null) return ''
  const rest = doc.slice(head.index + 1)
  const next = rest.search(/^### ADR-/m)
  return next === -1 ? doc.slice(head.index) : doc.slice(head.index, head.index + 1 + next)
}
// '## 제목' 절의 본문(다음 '## ' 앞까지). 없으면 ''
function section(doc: string, title: string): string {
  const head = doc.indexOf(`\n## ${title}\n`)
  if (head === -1) return ''
  const body = doc.slice(head + `\n## ${title}\n`.length)
  const next = body.search(/^## /m)
  return next === -1 ? body : body.slice(0, next)
}

describe('AC-3511.1: docs/ADR.md의 ADR-028과 CLAUDE.md 아키텍처 규칙의 예외 한 줄', () => {
  const adr028 = () => adrSection(read('docs/ADR.md'), '028')

  it('AC-3511.1: docs/ADR.md에 서식 ADR-028이 한 번 있다', () => {
    const titles = [...read('docs/ADR.md').matchAll(ADR_TITLE)].filter((m) => m[1] === '028')
    expect(titles).toHaveLength(1)
    expect(titles[0]![2]).toContain('서식')
  })

  it('AC-3511.1: ADR-028은 서식 AI 정리가 사용자가 적은 글(500자까지, 개인정보 모양 거부, 저장 안 함)을 Claude로 보낸다고 사용자 결정 2026-11-10과 함께 적는다', () => {
    const body = adr028()
    for (const word of ['Claude', '적은 글', '500자', '개인정보', '전화', '주민', '메일', 'app/api/ai/forms', '2026-11-10', '사용자']) {
      expect(body, word).toContain(word)
    }
    // 적은 글은 저장하지 않는다("저장하지 않는다"·"저장·로그하지 않는다"·"저장 안 함")
    expect(body).toMatch(/저장[^\n]{0,12}(?:않|안 )/)
  })

  it('AC-3511.1: ADR-028은 안내문 그림이 인쇄물이라 테마 색·글꼴 700·900을 그림 안(components/forms)에서만 쓴다고 적는다', () => {
    const body = adr028()
    for (const word of ['안내문', '인쇄', '색', '700', '900', 'components/forms']) expect(body, word).toContain(word)
  })

  it('AC-3511.1: CLAUDE.md 아키텍처 규칙에 ADR-028을 가리키는 서식 예외가 한 줄 있다', () => {
    const rules = section(read('CLAUDE.md'), '아키텍처 규칙')
    expect(rules).not.toBe('')
    const lines = rules.split('\n').filter((line) => line.includes('ADR-028'))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^- /)
    for (const word of ['서식', 'Claude', '500자']) expect(lines[0], word).toContain(word)
  })
})

// ---------- AC-3511.2: UI_GUIDE 준비된 탭 목록·ARCHITECTURE 자리 ----------

describe('AC-3511.2: docs/UI_GUIDE.md 준비된 탭 목록과 docs/ARCHITECTURE.md 폴더 자리', () => {
  it('AC-3511.2: UI_GUIDE 탭 줄 설명에서 서식은 ready가 true인 탭에 들고, 화면이 아직 없는 탭에는 없다', () => {
    const guide = read('docs/UI_GUIDE.md')
    const line = guide.split('\n').find((l) => l.includes('`ready`') && l.includes('`true`')) ?? ''
    const ready = /`ready`가 있고 (.+?)만 `true`/.exec(line)?.[1]
    const notReady = /화면이 아직 없는 탭\(([^)]*)\)/.exec(line)?.[1]
    expect(ready, line).toBeDefined()
    expect(notReady, line).toBeDefined()
    expect(ready!.split('·')).toContain('서식')
    expect(notReady!.split(/[,·]\s*/)).not.toContain('서식')
  })

  it('AC-3511.2: UI_GUIDE에 안내문 그림이 토큰 예외(ADR-028)라는 줄이 있다', () => {
    const lines = read('docs/UI_GUIDE.md')
      .split('\n')
      .filter((l) => l.includes('ADR-028'))
    expect(lines.some((l) => l.includes('안내문') && l.includes('components/forms'))).toBe(true)
  })

  it('AC-3511.2: ARCHITECTURE 디렉토리 구조에 components/forms·lib/forms·public/poster·app/api/ai/forms 자리가 적혀 있다', () => {
    const tree = section(read('docs/ARCHITECTURE.md'), '디렉토리 구조')
    expect(tree).not.toBe('')
    for (const place of ['components/forms', 'lib/forms', 'public/poster', 'api/ai/forms']) expect(tree, place).toContain(place)
  })

  it('AC-3511.2: tab-frame 계획의 서식 줄은 휴진 안내 첫 판(specs/forms)을 가리킨다', () => {
    const row = read('docs/tab-frame/plan.md')
      .split('\n')
      .find((l) => l.startsWith('| 서식 |'))
    expect(row).toBeDefined()
    expect(row).toContain('specs/forms')
  })
})

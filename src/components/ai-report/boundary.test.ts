import { readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 이 폴더 울타리(spec ai-report-screen REQ-715, AC-708.4). 폴더의 시험 아닌 파일을 읽어 규칙을 지키는지 본다.
// 판정 함수는 일부러 나쁜 글자로 먼저 시험하고(잡을 것을 잡는지), 그다음 실제 파일에 건다.
// components/ui/classes.test.ts의 검사 폴더에 ai-report가 없어(그 파일은 이 작업의 수정 범위 밖) 색과 움직임도 여기서 본다.
// 경로는 node:path로만 만든다. 글자로 슬래시를 견주지 않는다(윈도우에서 깨진다)

const DIR = dirname(fileURLToPath(import.meta.url))

// src/lib/ai/boundary.test.ts가 저장소 전체에서 SDK import를 찾는다. 이 파일의 나쁜 견본이 거기 걸리지 않게 이어 붙인다
const SDK = '@anthropic' + '-ai/sdk'

const isSource = (name: string) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)
const sourceNames = () => readdirSync(DIR, { recursive: true, encoding: 'utf8' }).filter(isSource)
const sources = () => sourceNames().map((name) => ({ name, text: readFileSync(join(DIR, name), 'utf8') }))

// components/ui/classes.test.ts의 code() 그대로: 주석과 SVG 그림 색을 뺀다
const code = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1')
    .replace(/\b(?:fill|stroke|stopColor|floodColor)=(?:"[^"]*"|'[^']*')/g, '')

// components/ui/classes.test.ts의 정규식 그대로
const ARBITRARY_COLOR = /\[#|\b(?:rgba?|hsla?|oklch|oklab|color-mix)\(/
const PALETTE =
  /\b(?:bg|text|border(?:-[trblxyse])?|outline|ring(?:-offset)?|fill|stroke|from|via|to|divide|placeholder|decoration|accent|caret|shadow)-(?:(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|[1-9]00|950)|white|black)\b/
const MOTION = /animate-|transition|@keyframes/

// src/lib/ai/boundary.test.ts와 같은 모양들: import·export from·동적 import()·require()
const SPECIFIER_PATTERNS = [
  /\bfrom\s*['"]([^'"\n]+)['"]/g,
  /\bimport\s*['"]([^'"\n]+)['"]/g,
  /\bimport\s*\(\s*['"`]([^'"`\n]+)['"`]/g,
  /\brequire\s*\(\s*['"`]([^'"`\n]+)['"`]/g,
]
const specifiers = (text: string) =>
  SPECIFIER_PATTERNS.flatMap((pattern) => [...code(text).matchAll(pattern)].map((match) => match[1]))

// 상대 경로도 잡으려고 앞뒤 경계만 본다: '@/lib/supabase' · '../../lib/supabase/client' · '@/app/api/x' · '../../app/api/x'
const SERVER_PATH = /(^|\/)(?:lib\/supabase|app\/api)(\/|$)/
const isForbiddenImport = (spec: string) =>
  spec === 'server-only' || spec === SDK || spec.startsWith(`${SDK}/`) || SERVER_PATH.test(spec)
const forbiddenImports = (text: string) => specifiers(text).filter(isForbiddenImport)

const FORBIDDEN_WORDS = ['dangerouslySetInnerHTML', 'localStorage', 'sessionStorage', 'console.']
const forbiddenWords = (text: string) => FORBIDDEN_WORDS.filter((word) => text.includes(word))

describe('AC-715.1: 검사할 파일 목록', () => {
  it('AC-715.1: 폴더의 다섯 파일이 목록에 있고(빈 검사가 아니다) 시험 파일은 없다', () => {
    const names = sourceNames().map((name) => basename(name))
    expect(names).toEqual(
      expect.arrayContaining(['AiReportScreen.tsx', 'ReportBody.tsx', 'UsageAside.tsx', 'RedoDialog.tsx', 'reportClient.ts']),
    )
    expect(names.filter((name) => name.includes('.test.'))).toEqual([])
  })
})

describe('AC-715.1: import 울타리', () => {
  it.each([
    ['정적 SDK', `import Anthropic from '${SDK}'`],
    ['SDK 아래 경로', `import type { Message } from "${SDK}/resources"`],
    ['별칭 supabase', `import { browser } from '@/lib/supabase/client'`],
    ['상대 경로 supabase', `import { browser } from '../../lib/supabase/client'`],
    ['별칭 서버 경로', `import { GET } from '@/app/api/ai/report/route'`],
    ['상대 경로 서버 경로', `import { x } from "../../app/api/x"`],
    ['from만 있는 줄', `from "../../app/api/x"`],
    ['타입 import', `import type { X } from '@/app/api/ai/generate'`],
    ['다시 내보내기', `export * from '@/lib/supabase'`],
    ['server-only', `import 'server-only'`],
    ['동적 import', `const m = await import('@/lib/supabase/server')`],
    ['require', `const m = require("../../app/api/x")`],
    ['여러 줄 import', `import {\r\n  a,\r\n  b,\r\n} from\r\n  '@/app/api/x'\r\n`],
  ])('AC-715.1: 규칙이 %s를 잡는다', (_, text) => {
    expect(forbiddenImports(text)).toHaveLength(1)
  })

  it.each([
    ['앱 부품', `import { ds } from '@/components/ui/classes'`],
    ['옆 파일', `import { loadMonth } from './reportClient'`],
    ['순수 함수', `import { longMonth } from '@/lib/ai/reportScreen'`],
    ['주석 속 이름', `// import { x } from '@/app/api/x'\n/* from '@/lib/supabase' */\nconst a = 1`],
  ])('AC-715.1: 규칙이 %s는 잡지 않는다', (_, text) => {
    expect(forbiddenImports(text)).toEqual([])
  })

  it('AC-715.1: 실제 파일의 import에 SDK·supabase·서버 경로·server-only가 없다', () => {
    for (const { name, text } of sources()) expect(forbiddenImports(text), name).toEqual([])
  })
})

describe('AC-715.1: 쓰면 안 되는 글자', () => {
  it.each([
    ['console.', 'console.log("x")'],
    ['localStorage', 'localStorage.setItem("k", "v")'],
    ['sessionStorage', 'sessionStorage.getItem("k")'],
    ['dangerouslySetInnerHTML', '<p dangerouslySetInnerHTML={{ __html: x }} />'],
  ])('AC-715.1: 규칙이 %s를 잡는다', (word, text) => {
    expect(forbiddenWords(text)).toEqual([word])
  })

  it('AC-715.1: 실제 파일에 HTML 넣기·브라우저 저장소·로그 글자가 없다', () => {
    for (const { name, text } of sources()) expect(forbiddenWords(text), name).toEqual([])
  })
})

describe('AC-715.1: 색은 토큰만', () => {
  it.each(['bg-[#fff]', 'text-[rgb(0,0,0)]', 'border-[color-mix(in_srgb,red,blue)]'])(
    'AC-715.1: 규칙이 임의 색 %s를 잡는다',
    (bad) => {
      expect(code(`<p className="${bad}" />`)).toMatch(ARBITRARY_COLOR)
    },
  )

  it.each(['bg-blue-500', 'text-white', 'border-t-gray-200'])('AC-715.1: 규칙이 기본 색 %s를 잡는다', (bad) => {
    expect(code(`<p className="${bad}" />`)).toMatch(PALETTE)
  })

  it('AC-715.1: 규칙이 주석과 SVG 그림 색은 빼고, 토큰 클래스는 잡지 않는다', () => {
    const text = `// bg-[#fff]\n<svg fill="#fff" stroke="rgb(0,0,0)" />\n<p className="bg-ink text-surface border-line" />`
    expect(code(text)).not.toMatch(ARBITRARY_COLOR)
    expect(code(text)).not.toMatch(PALETTE)
  })

  it('AC-715.1: 실제 파일에 임의 색과 Tailwind 기본 색이 없다', () => {
    for (const { name, text } of sources()) {
      expect(code(text), name).not.toMatch(ARBITRARY_COLOR)
      expect(code(text), name).not.toMatch(PALETTE)
    }
  })
})

describe('AC-708.4: 움직임 없음', () => {
  it.each(['animate-spin', 'animate-pulse', 'transition', 'transition-colors', '@keyframes spin'])(
    'AC-708.4: 규칙이 %s를 잡는다',
    (bad) => {
      expect(code(`<p className="${bad}" />`)).toMatch(MOTION)
    },
  )

  it('AC-708.4: 실제 파일에 움직임 클래스가 없다', () => {
    for (const { name, text } of sources()) expect(code(text), name).not.toMatch(MOTION)
  })
})

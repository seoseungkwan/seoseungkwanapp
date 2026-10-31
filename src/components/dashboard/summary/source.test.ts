import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, expectTypeOf, it } from 'vitest'
import type { DayPayload } from '@/types/payload'
import type { DashboardAnalysis } from './DashboardAnalysis'
import type { ReportBlock } from './ReportBlock'
import { dashboardSummarySource, isConnected, type SummarySource } from './source'

// 자료 읽는 자리 (tab-frame REQ-312, design.md '오늘 하루 분석 · 기간별 흐름 · 보고 문장'의 source.ts).
// 지금은 늘 '자료 없음'이다. 진짜 읽기(저장 표·RLS·브라우저 읽기)는 다음 통계 명세가 이 함수 하나만 바꾼다

const DIR = join(process.cwd(), 'src/components/dashboard/summary')
const read = (file: string) => readFileSync(join(DIR, file), 'utf8')
// 시험 밖 앱 파일
const appFiles = () => readdirSync(DIR).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
// 주석을 뺀 코드
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

function sourceFile(file: string) {
  return ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
}
// import 문마다 (경로, 타입만인가)
function importsOf(file: string): Array<{ from: string; typeOnly: boolean }> {
  return sourceFile(file)
    .statements.filter(ts.isImportDeclaration)
    .map((node) => ({ from: (node.moduleSpecifier as ts.StringLiteral).text, typeOnly: node.importClause?.isTypeOnly ?? false }))
}
// 내보낸 함수의 첫 인자 타입 글자의 칸 이름
function propNames(file: string, name: string): string[] | null {
  const sf = sourceFile(file)
  for (const node of sf.statements) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      const type = node.parameters[0]?.type
      if (type && ts.isTypeLiteralNode(type)) return type.members.map((m) => m.name?.getText(sf) ?? '')
    }
  }
  return null
}

const fakeDay = (day: string): DayPayload => ({
  schemaVersion: 2,
  quality: 'valid',
  day,
  partial: true,
  totals: { patients: 1, newPatients: 1, returning: 0, unknown: 0 },
  rx: [],
  groups: [],
  revisit: { cohort: 1, within7: null, within14: null },
})

describe('dashboardSummarySource — 지금은 늘 자료 없음', () => {
  it('AC-312.1: 부를 때마다 { kind: "none" }을 돌려준다', () => {
    expect(dashboardSummarySource()).toEqual({ kind: 'none' })
    expect(dashboardSummarySource()).toEqual({ kind: 'none' })
  })

  it('AC-312.1: source.ts는 Supabase·fetch·브라우저 저장소·서버 전용 파일을 쓰지 않고, 저장 모양 타입 하나만 불러온다', () => {
    const text = code(read('source.ts'))
    expect(text).not.toMatch(/supabase|\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|server-only|['"]use server['"]|next\/headers|cookies\(/)
    expect(importsOf('source.ts')).toEqual([{ from: '@/types/payload', typeOnly: true }])
  })
})

describe('SummarySource · isConnected — 자료 모양과 연결 판정', () => {
  it('AC-312.2: isConnected는 data이고 days가 하나 이상일 때만 참이다(빈 days는 연결 전과 같다)', () => {
    expect(isConnected({ kind: 'none' })).toBe(false)
    expect(isConnected({ kind: 'data', days: [] })).toBe(false)
    expect(isConnected({ kind: 'data', days: [fakeDay('2026-10-31')] })).toBe(true)
  })

  it('AC-312.2: 참이면 days를 그대로 꺼낼 수 있다(타입 좁히기)', () => {
    const source: SummarySource = { kind: 'data', days: [fakeDay('2026-10-30'), fakeDay('2026-10-31')] }
    if (!isConnected(source)) throw new Error('연결 뒤여야 한다')
    expect(source.days.map((d) => d.day)).toEqual(['2026-10-30', '2026-10-31'])
    expectTypeOf(source.days).toEqualTypeOf<readonly DayPayload[]>()
  })

  it('AC-312.2: days는 @/types/payload의 DayPayload를 다시 정의하지 않고 그대로 쓴다', () => {
    const text = code(read('source.ts'))
    expect(text).toMatch(/import type \{ DayPayload \} from '@\/types\/payload'/)
    expect(text).not.toMatch(/(?:type|interface)\s+DayPayload\b/)
    expectTypeOf<Extract<SummarySource, { kind: 'data' }>['days']>().toEqualTypeOf<readonly DayPayload[]>()
  })

  it('AC-312.2: DashboardAnalysis는 오늘 날짜와 SummarySource만, ReportBlock은 오늘 날짜와 days만 받는다', () => {
    expect(propNames('DashboardAnalysis.tsx', 'DashboardAnalysis')).toEqual(['today', 'source'])
    expect(propNames('ReportBlock.tsx', 'ReportBlock')).toEqual(['today', 'days'])
    expectTypeOf<Parameters<typeof DashboardAnalysis>[0]>().toEqualTypeOf<{ today: string; source: SummarySource }>()
    expectTypeOf<Parameters<typeof ReportBlock>[0]>().toEqualTypeOf<{ today: string; days: readonly DayPayload[] }>()
  })
})

describe('예시 자료 없음 — 가짜 자료는 시험 파일 안에서만', () => {
  it('AC-312.3: 시험 밖 summary 파일은 넷(자료 읽는 자리·계산·분석 화면·보고 문장)이다', () => {
    expect(appFiles().sort()).toEqual(['DashboardAnalysis.tsx', 'ReportBlock.tsx', 'source.ts', 'view.ts'])
  })

  it('AC-312.3: 시험 밖 파일에 DayPayload 값을 만드는 코드(schemaVersion:)와 예시 숫자 자료가 없다', () => {
    for (const file of appFiles()) {
      const text = code(read(file))
      expect(text, file).not.toContain('schemaVersion:')
      expect(text, file).not.toMatch(/\b(?:patients|newPatients|returning|unknown|cohort|within7|within14)\s*:\s*\d/)
      expect(text, file).not.toMatch(/\bday\s*:\s*['"`]\d{4}-/)
    }
  })
})

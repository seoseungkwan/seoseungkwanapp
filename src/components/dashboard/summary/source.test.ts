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
// 내보낸 함수의 첫 인자 타입의 칸들(글자로 쓴 타입 또는 같은 파일의 type 별칭). 칸 타입을 글자로 못 읽으면 type이 null이라 아래 검사에 걸린다
type Prop = { name: string; optional: boolean; type: string | null }
function propsOf(file: string, name: string): Prop[] | null {
  const sf = sourceFile(file)
  for (const node of sf.statements) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      const param = node.parameters[0]?.type
      const alias = param && ts.isTypeReferenceNode(param) ? param.typeName.getText(sf) : null
      const type = alias === null ? param : sf.statements.find((s): s is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(s) && s.name.text === alias)?.type
      if (type && ts.isTypeLiteralNode(type)) {
        return type.members.map((m) => ({
          name: m.name?.getText(sf) ?? '',
          optional: m.questionToken !== undefined,
          type: ts.isPropertySignature(m) ? (m.type?.getText(sf) ?? null) : null,
        }))
      }
    }
  }
  return null
}
// 필수 칸은 (이름, 타입) 그대로이고, 나머지는 모두 선택이며 글자·참거짓 같은 화면 값뿐이다. 자료(숫자·배열·SummarySource)가 선택 칸으로 들어오는 길이 없다
const SCREEN_VALUE = /^(?:string|boolean|null)(?: \| (?:string|boolean|null))*$/
function expectShape(props: Prop[] | null, required: Array<[string, string]>) {
  expect(props, '칸을 읽지 못했다').not.toBeNull()
  expect(props!.filter((p) => !p.optional).map((p) => [p.name, p.type])).toEqual(required)
  for (const p of props!.filter((prop) => prop.optional)) expect(p.type, p.name).toMatch(SCREEN_VALUE)
}
// 타입으로도 같은 것을 본다(tsc)
type RequiredKeys<T> = { [K in keyof T]-?: Record<never, never> extends Pick<T, K> ? never : K }[keyof T]
type OptionalValues<T> = Exclude<{ [K in Exclude<keyof T, RequiredKeys<T>>]: T[K] }[Exclude<keyof T, RequiredKeys<T>>], undefined>
type OnlyScreenValues<T> = [OptionalValues<T>] extends [string | boolean | null] ? true : false

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

  it('AC-312.2: DashboardAnalysis의 필수 칸은 정확히 today·source이고, 나머지는 모두 선택이며 글자·참거짓 같은 화면 값뿐이다', () => {
    expectShape(propsOf('DashboardAnalysis.tsx', 'DashboardAnalysis'), [
      ['today', 'string'],
      ['source', 'SummarySource'],
    ])
    type Props = Parameters<typeof DashboardAnalysis>[0]
    expectTypeOf<RequiredKeys<Props>>().toEqualTypeOf<'today' | 'source'>()
    expectTypeOf<Pick<Props, 'today' | 'source'>>().toEqualTypeOf<{ today: string; source: SummarySource }>()
    expectTypeOf<OnlyScreenValues<Props>>().toEqualTypeOf<true>()
  })

  it('AC-312.2: ReportBlock의 필수 칸은 정확히 today·days이고, 나머지는 모두 선택이며 글자·참거짓 같은 화면 값뿐이다', () => {
    expectShape(propsOf('ReportBlock.tsx', 'ReportBlock'), [
      ['today', 'string'],
      ['days', 'readonly DayPayload[]'],
    ])
    type Props = Parameters<typeof ReportBlock>[0]
    expectTypeOf<RequiredKeys<Props>>().toEqualTypeOf<'today' | 'days'>()
    expectTypeOf<Pick<Props, 'today' | 'days'>>().toEqualTypeOf<{ today: string; days: readonly DayPayload[] }>()
    expectTypeOf<OnlyScreenValues<Props>>().toEqualTypeOf<true>()
  })

  it('AC-605.1: 고른 날은 선택 글자 칸 하나다(ReportBlock selected, DashboardAnalysis day). 없으면 지금처럼 오늘이다', () => {
    expect(propsOf('ReportBlock.tsx', 'ReportBlock')).toContainEqual({ name: 'selected', optional: true, type: 'string' })
    expect(propsOf('DashboardAnalysis.tsx', 'DashboardAnalysis')).toContainEqual({ name: 'day', optional: true, type: 'string' })
  })

  it('AC-312.2: 모양 검사 자체가 잡아야 할 것을 잡는다', () => {
    for (const ok of ['string', 'boolean', 'string | null']) expect(ok, ok).toMatch(SCREEN_VALUE)
    for (const bad of ['number', 'string | number', 'readonly DayPayload[]', 'SummarySource', 'ReactNode', 'any', 'unknown']) expect(bad, bad).not.toMatch(SCREEN_VALUE)
    const req = (name: string, type: string): Prop => ({ name, optional: false, type })
    const opt = (name: string, type: string | null): Prop => ({ name, optional: true, type })
    const today: Array<[string, string]> = [['today', 'string']]
    expectShape([req('today', 'string'), opt('note', 'string | null')], today)
    expect(() => expectShape(null, today), '칸을 못 읽음').toThrow()
    expect(() => expectShape([req('today', 'string'), req('extra', 'string')], today), '필수 칸이 늘어남').toThrow()
    expect(() => expectShape([opt('today', 'string')], today), '필수 칸이 선택이 됨').toThrow()
    expect(() => expectShape([req('today', 'string'), opt('days', 'readonly DayPayload[]')], today), '선택 칸으로 자료가 들어옴').toThrow()
    expect(() => expectShape([req('today', 'string'), opt('onDone', null)], today), '타입을 못 읽는 칸').toThrow()
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

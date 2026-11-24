// TASK-2 (spec erp-uisarang) design.md 8-1: 의사랑판 공용 이름표(uisTypes.ts).
// 보고서 차례·꼭 있어야 할 것·환자별 표는 design.md 5-1 표, 매출 묶음 key는 3-1 `sales` enum에서 읽어 견준다
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ERROR_CODE } from './errors'
import { GROUP_KEYS, SETTINGS_KEY } from './types'

const SRC = path.dirname(fileURLToPath(import.meta.url))
const DESIGN = readFileSync(path.resolve(SRC, '..', '..', 'specs', 'erp-uisarang', 'design.md'), 'utf8')

// uisTypes.ts가 없을 때 파일 전체가 아니라 그 시험만 실패하게 시험 안에서 불러온다
const loadUis = () => import('./uisTypes')

/** design.md 5-1 표: 번호 차례 kind · 꼭/선택 · 환자 정보 */
function kindTable(): { kind: string; required: boolean; patient: boolean }[] {
  const start = DESIGN.indexOf('#### 5-1.')
  const end = DESIGN.indexOf('#### 5-2.')
  expect(start, 'design.md 5-1 절을 찾지 못했다').toBeGreaterThan(0)
  const rows: { kind: string; required: boolean; patient: boolean }[] = []
  for (const line of DESIGN.slice(start, end).split('\n')) {
    const cells = line.split('|').map((c) => c.trim())
    if (cells.length < 9 || !/^\d+$/.test(cells[1])) continue
    expect(Number(cells[1]), '번호 차례').toBe(rows.length + 1)
    rows.push({ kind: cells[2], required: cells[6] === '꼭', patient: cells[7].includes('있음') })
  }
  return rows
}

/** design.md 3-1 `sales` key enum(명세 고침 8 뒤 commands.json 꼴 `"type": "enum", "values": [...]`, 앞 꼴 `"enum": [...]`도 읽는다) */
function salesEnum(): string[] {
  const m = /"key":\s*\{[^}]*"(?:enum|values)":\s*\[([^\]]*)\]/.exec(DESIGN)
  expect(m, 'design.md 3-1 sales key enum을 찾지 못했다').not.toBeNull()
  return [...(m?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((x) => x[1])
}

describe('AC-4212.6 uisTypes.ts: 의사랑 이름표(design.md 8-1)', () => {
  it('AC-4212.6: 저장 칸 이름은 erpClosingUis · erpClosingUisCodes이고 비트 erpClosing과 겹치지 않는다', async () => {
    const { UIS_SETTINGS_KEY, UIS_CODES_KEY } = await loadUis()
    expect(UIS_SETTINGS_KEY).toBe('erpClosingUis')
    expect(UIS_CODES_KEY).toBe('erpClosingUisCodes')
    expect(new Set([UIS_SETTINGS_KEY, UIS_CODES_KEY, SETTINGS_KEY]).size).toBe(3)
  })

  it('AC-4212.6: UIS_KINDS 차례는 보고서 번호 차례(design.md 5-1 표 그대로)', async () => {
    const { UIS_KINDS } = await loadUis()
    expect([...UIS_KINDS]).toEqual(['income', 'rx', 'visits', 'visitPatients', 'rsv', 'rsvPatients'])
    expect([...UIS_KINDS]).toEqual(kindTable().map((r) => r.kind))
  })

  it("AC-4212.6: UIS_REQUIRED = 5-1 표 '꼭' 4개, UIS_PATIENT = 환자 정보 '있음' 2개(둘 다 UIS_KINDS 차례)", async () => {
    const { UIS_REQUIRED, UIS_PATIENT } = await loadUis()
    const table = kindTable()
    expect([...UIS_REQUIRED]).toEqual(['income', 'rx', 'visitPatients', 'rsvPatients'])
    expect([...UIS_REQUIRED]).toEqual(table.filter((r) => r.required).map((r) => r.kind))
    expect([...UIS_PATIENT]).toEqual(['visitPatients', 'rsvPatients'])
    expect([...UIS_PATIENT]).toEqual(table.filter((r) => r.patient).map((r) => r.kind))
    // 환자별 표는 둘 다 꼭 있어야 할 것
    for (const kind of UIS_PATIENT) expect(UIS_REQUIRED).toContain(kind)
  })

  it('AC-4212.6: 보고서 목록은 고칠 수 없다', async () => {
    const { UIS_KINDS, UIS_REQUIRED, UIS_PATIENT, UIS_COUNT_KEYS, UIS_SALES_KEYS } = await loadUis()
    for (const list of [UIS_KINDS, UIS_REQUIRED, UIS_PATIENT, UIS_COUNT_KEYS, UIS_SALES_KEYS]) expect(Object.isFrozen(list)).toBe(true)
  })

  it('AC-4212.6: 건수 묶음 13개 차례(design.md 8-1) — 주사(injection)·물리치료·기타는 없다', async () => {
    const { UIS_COUNT_KEYS } = await loadUis()
    expect([...UIS_COUNT_KEYS]).toEqual([
      'carm',
      'sono',
      'arthro',
      'manual',
      'eswt',
      'manualConsult',
      'lipus',
      'nail',
      'ct',
      'surgery',
      'eswtStd',
      'eswtRadial',
      'ptVisit',
    ])
    for (const key of ['injection', 'pt', 'etc1', 'etc2', 'etc3', 'etc4']) expect(UIS_COUNT_KEYS).not.toContain(key)
  })

  it('AC-4212.6: 매출 묶음 10개 차례 = commands.json closing.day sales key enum(design.md 3-1)', async () => {
    const { UIS_SALES_KEYS } = await loadUis()
    expect([...UIS_SALES_KEYS]).toEqual(['carm', 'sono', 'arthro', 'manual', 'eswt', 'pt', 'etc1', 'etc2', 'etc3', 'etc4'])
    expect([...UIS_SALES_KEYS]).toEqual(salesEnum())
  })

  it('AC-4212.6: 두 키 목록은 모두 GROUP_KEYS 안에 있고 GROUP_KEYS 차례이며 겹치는 key가 없다', async () => {
    const { UIS_COUNT_KEYS, UIS_SALES_KEYS } = await loadUis()
    for (const list of [UIS_COUNT_KEYS, UIS_SALES_KEYS]) {
      for (const key of list) expect(GROUP_KEYS as readonly string[], key).toContain(key)
      expect(new Set(list).size).toBe(list.length)
      const at = list.map((key) => (GROUP_KEYS as readonly string[]).indexOf(key))
      expect(at).toEqual([...at].sort((a, b) => a - b))
    }
  })

  it('AC-4212.6: 건수와 매출을 둘 다 고르는 줄은 씨암·SONO·관절조영·도수·충격파 다섯이다(design.md 9-5)', async () => {
    const { UIS_COUNT_KEYS, UIS_SALES_KEYS } = await loadUis()
    const both = UIS_COUNT_KEYS.filter((key) => (UIS_SALES_KEYS as readonly string[]).includes(key))
    expect(both).toEqual(['carm', 'sono', 'arthro', 'manual', 'eswt'])
  })

  it('AC-4212.6: 한셀 열림 안내의 보일 번호는 E-UIS-FILE-OPEN이고 오류 번호 꼴이다', async () => {
    const { UIS_OPEN_CODE } = await loadUis()
    expect(UIS_OPEN_CODE).toBe('E-UIS-FILE-OPEN')
    expect(UIS_OPEN_CODE).toMatch(ERROR_CODE)
  })
})

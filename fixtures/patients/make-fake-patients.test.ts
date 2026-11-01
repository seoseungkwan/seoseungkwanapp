import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildFakePatients, fakePatientsJson, recallBulkRecords, type RowsCase } from './make-fake-patients'

// 환자 탭 가짜 자료(fixtures/patients/fake/*.json). 실제 환자 자료가 섞이지 않았는지 모양으로 본다.

const FAKE_DIR = fileURLToPath(new URL('./fake/', import.meta.url))

// 가짜 모양: 이름 '가상환자NN', 차트번호 9로 시작하는 6자리(앞자리 0·끝 .0은 원본 맞추기 시험용), 전화 010-0000-NNNN, 내원번호 V+숫자
const FAKE_NAME = /^가상환자\d{2}$/
const FAKE_CHART = /^0*9\d{5}(?:\.0+)?$/
const FAKE_VISIT = /^V\d+(?:\.0)?$/
const SUMMARY_COUNT = /^\d+(?:,\d{3})*[건명]$/ // 비트 83 끝 총계 줄의 건수 칸(닮은 줄 사례 '3명' 포함)
// 가짜 전화 하나(구분 글자는 원본 phoneTokens가 받는 것들). 지운 뒤 숫자 셋 이상이 남으면 가짜가 아니다
const FAKE_PHONE = /(?:\+82[- ]?10|010)[- ]?0000[- ]?\d{4}/g
// 어느 글자에도 있으면 안 되는 진짜 같은 휴대폰 번호(가운데가 0000이 아닌 것)
const REAL_MOBILE = /(?<!\d)01[016789][- ]?(?!0000)\d{3,4}[- ]?\d{4}(?!\d)/

const key = (cell: unknown) => String(cell ?? '').replace(/\s/g, '')

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out))
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => strings(v, out))
  return out
}

// 머리줄(차트번호 칸이 있는 첫 줄) 뒤의 칸 값
function columnCells(rows: unknown[][], match: (header: string) => boolean): unknown[] {
  const head = rows.findIndex((row) => row.some((cell) => key(cell).includes('차트번호')))
  if (head < 0) return []
  const columns = rows[head].map((cell, index) => (match(key(cell)) ? index : -1)).filter((index) => index >= 0)
  return rows.slice(head + 1).flatMap((row) => columns.map((index) => row[index]))
}

type RowsRecord = { chart: string; name: string; phone: string }
const isBlank = (cell: unknown) => String(cell ?? '').trim() === ''
const notPhoneLike = (text: string) => !/\d{3,}/.test(text.replace(FAKE_PHONE, ''))

describe('make-fake-patients', () => {
  it('AC-602.3·AC-602.4 가짜 자료: 두 번 만들면 같다', () => {
    expect(buildFakePatients()).toEqual(buildFakePatients())
    expect(fakePatientsJson()).toEqual(fakePatientsJson())
  })

  it('AC-602.3·AC-602.4 저장된 fixtures/patients/fake 파일은 생성기 결과 그대로다', () => {
    const files = fakePatientsJson()
    expect(readdirSync(FAKE_DIR).sort()).toEqual(Object.keys(files).sort())
    for (const [name, text] of Object.entries(files)) expect(readFileSync(join(FAKE_DIR, name), 'utf8'), name).toBe(text)
  })

  it('AC-602.3 83 표 줄: 이름·차트번호·내원번호가 가짜 모양뿐이다', () => {
    const { 'chart-rows.json': chart } = buildFakePatients()
    expect(chart.cases.length).toBeGreaterThan(10)
    for (const { id, rows } of chart.cases) {
      for (const cell of columnCells(rows, (h) => h.includes('환자명'))) {
        expect(isBlank(cell) || FAKE_NAME.test(String(cell).trim()), `${id} 이름`).toBe(true)
      }
      for (const cell of columnCells(rows, (h) => h.includes('차트번호'))) {
        const text = String(cell ?? '').trim()
        expect(isBlank(cell) || FAKE_CHART.test(text) || SUMMARY_COUNT.test(key(cell)), `${id} 차트번호`).toBe(true)
      }
      for (const cell of columnCells(rows, (h) => h.includes('내원번호'))) {
        expect(isBlank(cell) || FAKE_VISIT.test(String(cell).trim()), `${id} 내원번호`).toBe(true)
      }
    }
  })

  it('AC-602.4 47 표 줄·번호 사례: 차트번호는 가짜 모양, 전화는 010-0000-NNNN뿐이다', () => {
    const { 'rx-rows.json': rx } = buildFakePatients()
    expect(rx.cases.length).toBeGreaterThan(5)
    for (const { id, rows } of rx.cases as RowsCase[]) {
      for (const cell of columnCells(rows, (h) => h.includes('차트번호'))) {
        const text = String(cell ?? '').trim()
        expect(isBlank(cell) || text === '0' || FAKE_CHART.test(text), `${id} 차트번호`).toBe(true)
      }
      for (const cell of columnCells(rows, (h) => !h.includes('차트번호'))) {
        expect(notPhoneLike(String(cell ?? '')), `${id} 전화`).toBe(true)
      }
    }
    rx.tokens.forEach((raw, index) => expect(notPhoneLike(raw), `번호 사례 ${index}`).toBe(true))
  })

  it('AC-603.2 정기 주사 쌓인 기록: 이름·차트번호·전화가 가짜 모양뿐이다', () => {
    const { 'recall-cases.json': recall } = buildFakePatients()
    const records = [
      ...recall.ingest.flatMap((c) => c.history.records),
      ...recall.compute.flatMap((c) => c.records),
      ...recall.coverage.flatMap((c) => c.history.records),
      ...recall.copy.flatMap((c) => c.records),
    ]
    expect(records.length).toBeGreaterThan(100)
    const odd = new Set(['constructor', 'toString']) // 객체 원형 이름과 같은 차트번호 사례
    records.forEach((r, index) => {
      expect(FAKE_NAME.test(r.name), `기록 ${index} 이름`).toBe(true)
      expect(FAKE_CHART.test(r.chart) || odd.has(r.chart), `기록 ${index} 차트번호`).toBe(true)
      expect(notPhoneLike(r.phone), `기록 ${index} 전화`).toBe(true)
    })
  })

  it('AC-603.2 정기 주사 83·47 표 줄: 이름은 가짜 모양으로 시작하고 차트번호는 가짜 모양이거나 짚어 둔 이상한 모양이다', () => {
    const { 'recall-cases.json': recall } = buildFakePatients()
    const tables = [
      ...recall.ingest.flatMap((c) => [c.chart, c.rx]),
      ...recall.copy.map((c) => c.rx),
      ...recall.rx.map((c) => c.rows),
      recall.bulk.chart,
      recall.bulk.rx,
    ].filter((rows): rows is unknown[][] => rows !== null)
    const oddChart = new Set(['constructor', 'toString', '9000 03', '9000.04', '900-005', '000', '0'])
    tables.forEach((rows, index) => {
      for (const cell of columnCells(rows, (h) => h.includes('환자명'))) {
        expect(isBlank(cell) || /^가상환자\d{2}/.test(String(cell)), `표 ${index} 이름`).toBe(true)
      }
      for (const cell of columnCells(rows, (h) => h.includes('차트번호'))) {
        const text = String(cell ?? '').trim()
        expect(isBlank(cell) || FAKE_CHART.test(text) || oddChart.has(text), `표 ${index} 차트번호`).toBe(true)
      }
      for (const cell of columnCells(rows, (h) => h === '휴대폰')) {
        expect(notPhoneLike(String(cell ?? '')), `표 ${index} 전화`).toBe(true)
      }
    })
  })

  it('AC-603.2 50,001건 사례는 만드는 법만 적고, 만들면 실제 수만큼 가짜 모양이다', () => {
    const { bulk } = buildFakePatients()['recall-cases.json']
    expect(bulk.counts).toEqual({ atLimit: 50_000, overLimit: 50_001 })
    expect(fakePatientsJson()['recall-cases.json'].length).toBeLessThan(1_000_000)
    const records = recallBulkRecords(bulk, bulk.counts.overLimit)
    expect(records).toHaveLength(50_001)
    expect(new Set(records.map((r) => r.chart)).size).toBe(50_001)
    expect(records.every((r) => FAKE_NAME.test(r.name) && FAKE_CHART.test(r.chart) && notPhoneLike(r.phone))).toBe(true)
  })

  it('AC-604.3 정기 주사·F/U 조각: 약속한 답 모양이고 이름·차트번호·전화가 가짜 모양뿐이다', () => {
    const files = buildFakePatients()
    const pieces = [...files['targets-followup.json'].pieces, ...files['targets-injection.json'].pieces]
    expect(files['targets-followup.json'].pieces).toHaveLength(4)
    expect(files['targets-injection.json'].pieces).toHaveLength(8)
    pieces.forEach((piece, index) => {
      expect(piece.v, `조각 ${index}`).toBe(1)
      expect(piece.chart[0], `조각 ${index}`).toEqual(['내원번호', '차트번호', '환자명', '증상', '기록날짜'])
      expect(piece.rx[0], `조각 ${index}`).toEqual(piece.kind === 'followup' ? ['차트번호', '휴대폰'] : ['처방코드', '차트번호', '처방일자', '휴대폰'])
      for (const cell of columnCells(piece.chart, (h) => h === '환자명')) expect(FAKE_NAME.test(String(cell)), `조각 ${index} 이름`).toBe(true)
      for (const table of [piece.chart, piece.rx]) {
        for (const cell of columnCells(table, (h) => h === '차트번호')) expect(FAKE_CHART.test(String(cell)), `조각 ${index} 차트번호`).toBe(true)
      }
      for (const cell of columnCells(piece.chart, (h) => h === '내원번호')) expect(FAKE_VISIT.test(String(cell)), `조각 ${index} 내원번호`).toBe(true)
      for (const cell of columnCells(piece.rx, (h) => h === '휴대폰')) expect(notPhoneLike(String(cell)), `조각 ${index} 전화`).toBe(true)
    })
  })

  it('AC-604.6 저장 사례: 빈 것과 표시·기록이 든 것, 기록은 가짜 모양뿐이다', () => {
    const files = buildFakePatients()
    expect(files['store-first.json'].contact).toEqual({})
    const marked = files['store-marked.json'].contact as { v: number; marks: Record<string, string>; recall: { records: RowsRecord[] } }
    expect(marked.v).toBe(1)
    expect(Object.keys(marked.marks).length).toBeGreaterThan(0)
    expect(marked.recall.records.length).toBeGreaterThan(0)
    marked.recall.records.forEach((r, index) => {
      expect(FAKE_NAME.test(r.name), `기록 ${index} 이름`).toBe(true)
      expect(FAKE_CHART.test(r.chart), `기록 ${index} 차트번호`).toBe(true)
      expect(notPhoneLike(r.phone), `기록 ${index} 전화`).toBe(true)
    })
    Object.keys(marked.marks).forEach((key, index) => expect(/^[fr]\|[^|]+\|9\d{5}\|\d{4}-\d{2}-\d{2}$/.test(key), `표시 ${index}`).toBe(true))
  })

  it('AC-602.3·AC-602.4 어느 글자에도 진짜 같은 휴대폰 번호가 없다', () => {
    strings(buildFakePatients()).forEach((text, index) => expect(REAL_MOBILE.test(text), `글자 ${index}`).toBe(false))
  })
})

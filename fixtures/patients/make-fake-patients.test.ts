import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildFakePatients, fakePatientsJson, type RowsCase } from './make-fake-patients'

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

  it('AC-602.3·AC-602.4 어느 글자에도 진짜 같은 휴대폰 번호가 없다', () => {
    strings(buildFakePatients()).forEach((text, index) => expect(REAL_MOBILE.test(text), `글자 ${index}`).toBe(false))
  })
})

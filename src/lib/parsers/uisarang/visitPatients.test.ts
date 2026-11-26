import { describe, expect, it } from 'vitest'
import { AGE_BANDS, NO_BIRTH } from '@/lib/analytics/patientMix'
import { validateUisAgePayload } from '@/lib/payload/uisarang'
import type { UisAgePayload, UisFileResult } from '@/types/uisarang'
import { readUisFile } from './readFile'
import { bookBytes, FAKE_TEXTS, PATIENT_LINES, patientRows, TODAY, type PatientLine, type PatientsOptions } from './testBooks'

// 내원일별 아래쪽 표 → 그날 나이대 수(design.md §4-4). 환자 글자는 모두 지어낸 것이다

const DAY = '2026-11-03'
const BANDS = [...AGE_BANDS, NO_BIRTH]
// testBooks PATIENT_LINES 열일곱 줄(그날 만 나이): 9 · 11·19 · 20·21 · 36 · 41 · 50 · 60 · 70 · 81·126·226 · 없음 넷
const PAYLOAD: UisAgePayload = {
  v: 1,
  patients: 17,
  newPatients: 3,
  bands: [1, 2, 2, 1, 1, 1, 1, 1, 3, 4],
  newBands: [0, 1, 0, 1, 0, 0, 0, 0, 1, 0],
}

function payloadOf(result: UisFileResult): UisAgePayload {
  if (result.status !== 'read' || result.read.kind !== 'visitPatients') throw new Error(`받지 못함: ${JSON.stringify(result)}`)
  return result.read.payload
}
const read = (options: PatientsOptions = {}) => readUisFile(bookBytes(patientRows(options)), TODAY)
const ages = (options: PatientsOptions = {}) => payloadOf(read(options))
const one = (rrn: PatientLine['rrn'], isNew = false): PatientLine => ({ chart: '880100', rrn, isNew })
const bandOf = (payload: UisAgePayload) => BANDS[payload.bands.findIndex((n) => n > 0)]

describe('AC-8806.1 차트번호가 1~12자리 숫자인 줄 = 환자 줄 · 신규환자 칸 신규 = 신환', () => {
  it('AC-8806.1: 열일곱 줄', () => {
    expect(PATIENT_LINES).toHaveLength(PAYLOAD.patients)
    expect(read()).toStrictEqual({ status: 'read', read: { kind: 'visitPatients', span: { from: DAY, to: DAY, unit: 'day' }, payload: PAYLOAD } })
  })

  it('AC-8806.1: 차트번호가 숫자 칸이어도 · 앞 0이 있어도 환자 줄', () => {
    expect(ages({ lines: [{ chart: 880101, rrn: null }, { chart: '000123', rrn: null, isNew: true }, { chart: '1', rrn: null }] })).toMatchObject({ patients: 3, newPatients: 1 })
  })

  it('AC-8806.1: 차트번호가 숫자 1~12자리가 아닌 줄(합계·쪽·13자리·글자)은 세지 않는다', () => {
    const lines: PatientLine[] = [one('900101-1234567'), { chart: '1234567890123', rrn: null }, { chart: '가1234', rrn: null }, { chart: '합계', rrn: null }, { chart: null, rrn: '900101-1234567' }, { chart: '12.5', rrn: null }]
    expect(ages({ lines })).toMatchObject({ patients: 1 })
  })

  it('AC-8806.1: 신규환자 칸은 빈칸을 빼고 신규일 때만', () => {
    const payload = ages({ lines: [{ chart: '1', rrn: null, newText: ' 신 규 ' }, { chart: '2', rrn: null, newText: '재진' }, { chart: '3', rrn: null, newText: '신규아님' }] })
    expect(payload).toMatchObject({ patients: 3, newPatients: 1 })
  })

  it('AC-8806.1: 환자 줄이 없으면 E-UIS-ROW', () => {
    expect(read({ lines: [] })).toStrictEqual({ status: 'refused', code: 'E-UIS-ROW', kind: 'visitPatients', span: { from: DAY, to: DAY } })
  })
})

describe('AC-8806.2 주민등록번호 앞 일곱 자 → 그날 만 나이 10살 띠', () => {
  it.each([
    ['900101-1234567', '30대'], // 1990-01-01 → 36
    ['161104-4123456', '10세 미만'], // 2016-11-04 → 9(생일 전날)
    ['151103-3123456', '10대'], // 2015-11-03 → 11(생일 날)
    ['061104-4123456', '10대'], // 2006-11-04 → 19
    ['051103-3123456', '20대'], // 2005-11-03 → 21
    ['560505-5123456', '70대'], // 5 → 1900년대
    ['010203-7123456', '20대'], // 7 → 2000년대
    ['760607-6123456', '50대'], // 6 → 1900년대
    ['450101-1******', '80세 이상'], // 뒤가 가려져도 앞 일곱 자로
    ['991231-9123456', '80세 이상'], // 9 → 1800년대
    ['000101-0123456', '80세 이상'], // 0 → 1800년대
    ['850505 2123456', '40대'], // 빈칸을 뗀다
    ['8505052123456', '40대'], // 붙여 쓴 13자리
    [9001011234567, '30대'], // 숫자 칸
    [null, NO_BIRTH],
    ['', NO_BIRTH],
    ['*******-*******', NO_BIRTH],
    ['901301-1234567', NO_BIRTH], // 없는 날
    ['270101-3123456', NO_BIRTH], // 그날 뒤 생일
    ['90010', NO_BIRTH],
  ] as const)('AC-8806.2: %j → %s', (rrn, band) => {
    const payload = ages({ lines: [one(rrn)] })
    expect(payload.patients).toBe(1)
    expect(bandOf(payload)).toBe(band)
  })

  it('AC-8806.2: 신환은 newBands의 같은 띠에도 센다', () => {
    expect(ages({ lines: [one('900101-1234567', true)] })).toStrictEqual({
      v: 1,
      patients: 1,
      newPatients: 1,
      bands: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
      newBands: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
    })
  })
})

describe('AC-8806.3 저장 모양에는 숫자만', () => {
  it('AC-8806.3: 열쇠는 v·patients·newPatients·bands·newBands뿐 · 저장 모양 검사를 그대로 지난다', () => {
    const payload = ages()
    expect(Object.keys(payload).sort()).toEqual(['bands', 'newBands', 'newPatients', 'patients', 'v'])
    expect(payload.bands).toHaveLength(10)
    expect(validateUisAgePayload(payload)).toStrictEqual(payload)
  })

  it('AC-8806.3: 결과 어디에도 차트번호·이름·주민번호·전화·주소·보험구분·진료실 글자가 없다', () => {
    const json = JSON.stringify(read())
    for (const text of FAKE_TEXTS) expect(json).not.toContain(text)
  })
})

describe('AC-8806.4 주민번호 모양 값을 받는다(비트 길 E-PARSE-RRN과 다름)', () => {
  it('AC-8806.4: 주민번호가 든 파일도 read — 그 칸은 나이 띠로만 바뀐다', () => {
    const result = read({ lines: [one('900101-1234567'), one('8505052123456')] })
    expect(result.status).toBe('read')
    expect(JSON.stringify(result)).not.toMatch(/\d{6}-?\d{7}/)
  })
})

describe('AC-8802.6 쪽마다 되풀이되는 머리 줄·빈 줄은 건너뛴다', () => {
  it('AC-8802.6: 20줄마다 머리 줄 · 빈 줄 · 쪽 줄', () => {
    expect(ages({ repeatEvery: 5, blankEvery: 3, footer: [['쪽 1/1'], ['출력: 의사랑']] })).toStrictEqual(PAYLOAD)
  })
})

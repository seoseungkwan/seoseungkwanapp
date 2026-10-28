import { describe, expect, it } from 'vitest'
import { BIT_HEADER } from '../../../../fixtures/make-fake-fixtures'
import { mapColumns, normalizeColumnName, readOutpatient, readVisit } from './columnMap'

const at = (name: string) => BIT_HEADER.indexOf(name)
const READ_NOT = ['성명', '주민번호', '전화번호', '휴대폰', '이메일', '우편번호', '금액', '주치의', '주상병']

function columnsOf(header: Array<string | number | null>) {
  const result = mapColumns(header)
  if (!result.ok) throw new Error(`없는 칸: ${result.missingColumns.join(',')}`)
  return result.columns
}

describe('AC-004.1 normalizeColumnName — 공백·괄호를 뺀 글자', () => {
  it.each([
    ['처방 코드', '처방코드'],
    [' 차트 번호 ', '차트번호'],
    ['처방일자(조제일)', '처방일자조제일'],
    ['[주소]', '주소'],
    ['초재진\t구분', '초재진구분'],
    ['외래/입원', '외래/입원'],
  ])('%j → %j', (name, normalized) => {
    expect(normalizeColumnName(name)).toBe(normalized)
  })
})

describe('AC-004.1 mapColumns — 허용 칸 8개만 찾는다', () => {
  it('비트 기본 23칸', () => {
    expect(columnsOf([...BIT_HEADER])).toEqual({
      rxCode: at('처방코드'),
      rxName: at('처방명칭'),
      rxType: at('유형'),
      date: at('처방일자'),
      chart: at('차트번호'),
      visit: at('초재진구분'),
      inOut: at('외래/입원'),
      address: at('주소'),
    })
  })

  it('읽지 않는 칸은 어느 자리에도 잡히지 않는다', () => {
    const indices = Object.values(columnsOf([...BIT_HEADER]))
    for (const name of READ_NOT) expect(indices).not.toContain(at(name))
  })

  it('칸 이름 변형: 공백·괄호, 뒤에 붙은 말(처방일자(조제일))', () => {
    const header = ['[주소]', '처방일자(조제일)', '차트 번호', '초재진 구분', '처방명칭', ' 유형 ', '처방 코드', '외래 / 입원']
    expect(columnsOf(header)).toEqual({
      address: 0, date: 1, chart: 2, visit: 3, rxName: 4, rxType: 5, rxCode: 6, inOut: 7,
    })
  })

  it('별칭: 등록번호·처방명·초재진·외래입원', () => {
    const header = ['처방코드', '처방명', '처방일자', '등록번호', '초재진', '외래입원', '주소']
    expect(columnsOf(header)).toEqual({
      rxCode: 0, rxName: 1, rxType: null, date: 2, chart: 3, visit: 4, inOut: 5, address: 6,
    })
  })

  it('딱 맞는 이름이 뒤에 붙은 말보다 먼저', () => {
    const header = ['처방일자(조제일)', '처방코드', '처방명칭', '처방일자', '차트번호', '초재진구분', '주소']
    expect(columnsOf(header).date).toBe(3)
  })

  it('같은 칸이 두 번 있으면 앞의 것', () => {
    const header = ['처방코드', '처방명칭', '처방일자', '차트번호', '초재진구분', '주소', '주소']
    expect(columnsOf(header).address).toBe(5)
  })

  it('숫자·빈 칸은 칸 이름으로 보지 않는다', () => {
    const header = [null, 1, '처방코드', '처방명칭', '처방일자', '차트번호', '초재진구분', '주소']
    expect(columnsOf(header).rxCode).toBe(2)
  })

  it('없어도 되는 칸: 유형·외래/입원이 없으면 null', () => {
    const columns = columnsOf(['처방코드', '처방명칭', '처방일자', '차트번호', '초재진구분', '주소'])
    expect(columns.rxType).toBeNull()
    expect(columns.inOut).toBeNull()
  })

  it.each([
    ['초재진구분', ['초재진구분']],
    ['주소', ['주소']],
    ['처방코드', ['처방코드']],
    ['처방명칭', ['처방명칭']],
    ['처방일자', ['처방일자']],
    ['차트번호', ['차트번호']],
  ])('꼭 있어야 하는 칸 %s가 없으면 E-PARSE-COLUMN용 목록', (name, missing) => {
    expect(mapColumns(BIT_HEADER.filter((n) => n !== name))).toEqual({ ok: false, missingColumns: missing })
  })

  it('여러 칸이 없으면 모두 정해진 순서로 알린다', () => {
    expect(mapColumns(['유형', '성명', '외래/입원'])).toEqual({
      ok: false,
      missingColumns: ['처방코드', '처방명칭', '처방일자', '차트번호', '초재진구분', '주소'],
    })
  })
})

describe('AC-004.2 readVisit — 신환·재진 값 표', () => {
  it.each([
    ['신환', true],
    ['  신환 ', true],
    ['재진', false],
    ['재진\t', false],
    ['초진외', null],
    ['기타', null],
    ['신환자', null],
    ['', null],
  ])('%j → %s', (value, expected) => {
    expect(readVisit(value)).toBe(expected)
  })
})

describe('AC-004.2 readOutpatient — 외래/입원 값 표', () => {
  it.each([
    ['외래', true],
    [' 외래 ', true],
    ['입원', false],
    ['입원 ', false],
    ['기타', null],
    ['', null],
  ])('%j → %s', (value, expected) => {
    expect(readOutpatient(value)).toBe(expected)
  })
})

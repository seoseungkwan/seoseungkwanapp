import { describe, expect, it } from 'vitest'
import type { Cell, Grid } from '@/types/parse'
import type { UisKind } from '@/types/uisarang'
import { checkSpan, filtersOk, parseSpanText, readLabels } from './labels'
import { readUisFile } from './readFile'
import { bookBytes, incomeRows, patientRows, rxRows, TODAY, visitsRows } from './testBooks'

// 라벨 · 조회일 → 기간 · 조건(design.md §3-2·§3-3) · 오류 차례(종류 → 열 → 조회일 → 조건 → 줄)

type Readable = Exclude<UisKind, 'rsv' | 'rsvPatients'>
const labelsOf = (entries: Array<[string, Cell]>) => new Map<string, Cell>(entries)
const spanCheck = (kind: Readable, value: Cell, today = TODAY) => checkSpan(kind, labelsOf([['조회일', value]]), today)

describe('AC-8802.2 라벨 이름·값과 조회일 글자', () => {
  it('AC-8802.2: 머리 줄 위의 [ ] 칸만 라벨 — 이름은 괄호 안 빈칸을 뺀 것, 값은 ] 뒤 글자 또는 오른쪽 첫 글자 칸', () => {
    const grid: Grid = [
      ['기간별처방통계'],
      ['[외/입 구분] 전체', null, '[조 회 일]', null, ' 2026-11-02 ~ 2026-11-08 '],
      ['메모 [가] 아님', '[빈 라벨]'],
      ['코드', '처방명칭', '총액'],
      ['[아래 라벨] 외래'],
    ]
    expect(readLabels(grid, 3)).toStrictEqual(
      labelsOf([
        ['외/입구분', '전체'],
        ['조회일', '2026-11-02 ~ 2026-11-08'],
        ['빈라벨', null],
      ]),
    )
  })

  it('AC-8802.2: 오른쪽 칸이 다른 라벨이면 값이 없다 · 숫자 칸은 숫자 그대로 · 같은 이름이 또 나오면 첫 값', () => {
    const grid: Grid = [['[외/입 구분]', '[조 회 일]', 46328], ['[조회일] 2026-01-01'], ['내원일', '인원수', '신규환자']]
    expect(readLabels(grid, 2)).toStrictEqual(
      labelsOf([
        ['외/입구분', null],
        ['조회일', 46328],
      ]),
    )
  })

  it.each([
    ['2026-11-02', '2026-11-02', '2026-11-02'],
    ['2026.11.02', '2026-11-02', '2026-11-02'],
    ['2026/11/2', '2026-11-02', '2026-11-02'],
    ['2026-1-5', '2026-01-05', '2026-01-05'],
    ['2026-11-02 ~ 2026-11-08', '2026-11-02', '2026-11-08'],
    ['2026-11-02~2026-11-08', '2026-11-02', '2026-11-08'],
    ['2026.10.01  ~  2026.10.31', '2026-10-01', '2026-10-31'],
    [46328, '2026-11-02', '2026-11-02'], // 엑셀 날짜 숫자
  ] as const)('AC-8802.2: %j → %s ~ %s', (value, from, to) => {
    expect(parseSpanText(value)).toStrictEqual({ from, to })
  })

  it.each([null, '', '가나다', '2026-13-01', '2026-02-30', '2026-11.02', '2026-11-02 ~', '~ 2026-11-02', '2026-11-08 ~ 2026-11-02', '2026-11-02 ~ 2026-11-03 ~ 2026-11-04', '26-11-02'])(
    'AC-8802.2: %j → 못 읽음',
    (value) => {
      expect(parseSpanText(value)).toBeNull()
    },
  )
})

describe('AC-8802.3 조회일 → 하루·한 주·한 달 · 받지 않는 기간', () => {
  it.each([
    ['2026-11-03', 'day'],
    ['2026-11-02 ~ 2026-11-08', 'week'],
    ['2026-10-01 ~ 2026-10-31', 'month'],
    ['2024-02-01 ~ 2024-02-29', 'month'],
  ] as const)('AC-8802.3: 기간별처방통계 %s → %s', (value, unit) => {
    const [from, to = from] = value.split(' ~ ')
    expect(spanCheck('rx', value)).toStrictEqual({ ok: true, span: { from, to, unit } })
  })

  it.each(['2026-11-02 ~ 2026-11-05', '2026-11-03 ~ 2026-11-09', '2026-10-01 ~ 2026-10-30', '2026-10-02 ~ 2026-10-31', '2026-10-01 ~ 2026-11-30'])(
    'AC-8802.3: 기간별처방통계·위쪽 표 %s → E-UIS-PERIOD(받지 않은 기간을 싣는다)',
    (value) => {
      const [from, to] = value.split(' ~ ')
      for (const kind of ['rx', 'visits'] as const) {
        expect(spanCheck(kind, value)).toStrictEqual({ ok: false, code: 'E-UIS-PERIOD', span: { from, to } })
      }
    },
  )

  it('AC-8802.3: 일일수입통계·아래쪽 표는 하루만 — 아니면 E-UIS-ONE-DAY', () => {
    for (const kind of ['income', 'visitPatients'] as const) {
      expect(spanCheck(kind, '2026-11-03')).toStrictEqual({ ok: true, span: { from: '2026-11-03', to: '2026-11-03', unit: 'day' } })
      expect(spanCheck(kind, '2026-11-02 ~ 2026-11-08')).toStrictEqual({
        ok: false,
        code: 'E-UIS-ONE-DAY',
        span: { from: '2026-11-02', to: '2026-11-08' },
      })
      expect(spanCheck(kind, '2026-11-02 ~ 2026-11-05')).toMatchObject({ ok: false, code: 'E-UIS-ONE-DAY' })
    }
  })

  it('AC-8802.3: 조회일이 없거나 못 읽거나 2020-01-01 앞이면 E-UIS-DATE(기간 없음)', () => {
    const date = { ok: false, code: 'E-UIS-DATE', span: null }
    expect(checkSpan('rx', labelsOf([['외/입구분', '전체']]), TODAY)).toStrictEqual(date)
    expect(spanCheck('rx', null)).toStrictEqual(date)
    expect(spanCheck('rx', '어제')).toStrictEqual(date)
    expect(spanCheck('rx', '2019-12-31')).toStrictEqual(date)
    expect(spanCheck('rx', '2019-12-30 ~ 2020-01-05')).toStrictEqual(date) // 시작이 2020년 앞인 한 주
    expect(spanCheck('rx', '2020-01-01')).toMatchObject({ ok: true })
  })

  it('AC-8802.3: 끝 날이 오늘보다 뒤면 E-UIS-FUTURE · 오늘까지는 받는다', () => {
    expect(spanCheck('income', TODAY)).toMatchObject({ ok: true })
    expect(spanCheck('income', '2026-11-28')).toStrictEqual({ ok: false, code: 'E-UIS-FUTURE', span: { from: '2026-11-28', to: '2026-11-28' } })
    expect(spanCheck('rx', '2026-11-23 ~ 2026-11-29')).toStrictEqual({ ok: false, code: 'E-UIS-FUTURE', span: { from: '2026-11-23', to: '2026-11-29' } })
    expect(spanCheck('visits', '2026-11-01 ~ 2026-11-30')).toMatchObject({ ok: false, code: 'E-UIS-FUTURE' })
  })

  it('AC-8802.3: 차례 DATE → PERIOD·ONE-DAY → FUTURE', () => {
    expect(spanCheck('rx', '2026-11-25 ~ 2026-11-30')).toMatchObject({ code: 'E-UIS-PERIOD' })
    expect(spanCheck('income', '2026-11-30 ~ 2026-12-06')).toMatchObject({ code: 'E-UIS-ONE-DAY' })
  })
})

describe('AC-8802.4 조회일 밖 라벨의 값은 빈칸·전체·날짜만', () => {
  it.each([
    [[['외/입구분', '전체']], true],
    [[['외/입구분', ' 전 체 ']], true],
    [[['외/입구분', null]], true],
    [[['출력일시', '2026-11-27 10:30']], true],
    [[['출력일', '2026-11-27']], true],
    [[['출력일', 46353]], true],
    [[['조회일', '아무 글자']], true], // 조회일은 조건이 아니다
    [[['외/입구분', '외래']], false],
    [[['외/입구분', '전체'], ['진료실', '제1진료실']], false],
    [[['쪽', 3]], false],
  ] as Array<[Array<[string, Cell]>, boolean]>)('AC-8802.4: %j → %s', (entries, ok) => {
    expect(filtersOk(labelsOf(entries))).toBe(ok)
  })

  it('AC-8802.4: 파일 — [외/입 구분] 외래면 E-UIS-FILTER(기간을 싣는다)', () => {
    expect(readUisFile(bookBytes(rxRows({ filter: '외래' })), TODAY)).toStrictEqual({
      status: 'refused',
      code: 'E-UIS-FILTER',
      kind: 'rx',
      span: { from: '2026-10-01', to: '2026-10-31' },
    })
  })
})

describe('AC-8802.3 파일에서의 차례: 종류 → 열 → 조회일(DATE → PERIOD/ONE-DAY → FUTURE) → 조건 → 줄', () => {
  const dropColumn = (rows: ReturnType<typeof incomeRows>, name: string) =>
    rows.map((row) => (row.includes(name) && row[0] === '보험구분' ? row.map((cell) => (cell === name ? null : cell)) : row))

  it('AC-8802.3: 열이 조회일보다 먼저(조회일이 없어도 E-UIS-COLUMN)', () => {
    const result = readUisFile(bookBytes(dropColumn(incomeRows({ span: null }), '비급여')), TODAY)
    expect(result).toStrictEqual({ status: 'refused', code: 'E-UIS-COLUMN', kind: 'income', span: null, columns: ['비급여'] })
  })

  it('AC-8802.3: 조회일이 조건보다 먼저', () => {
    expect(readUisFile(bookBytes(rxRows({ span: null, filter: '외래' })), TODAY)).toStrictEqual({
      status: 'refused',
      code: 'E-UIS-DATE',
      kind: 'rx',
      span: null,
    })
    expect(readUisFile(bookBytes(rxRows({ span: '2026-11-23 ~ 2026-11-29', filter: '외래' })), TODAY)).toMatchObject({ code: 'E-UIS-FUTURE' })
    expect(readUisFile(bookBytes(incomeRows({ span: '2026-11-02 ~ 2026-11-08', filter: '외래' })), TODAY)).toMatchObject({
      code: 'E-UIS-ONE-DAY',
      span: { from: '2026-11-02', to: '2026-11-08' },
    })
    expect(readUisFile(bookBytes(visitsRows({ span: '2026-11-02 ~ 2026-11-04' })), TODAY)).toMatchObject({ code: 'E-UIS-PERIOD', kind: 'visits' })
    expect(readUisFile(bookBytes(patientRows({ span: '2026-11-01 ~ 2026-11-30' })), TODAY)).toMatchObject({ code: 'E-UIS-ONE-DAY', kind: 'visitPatients' })
  })

  it('AC-8802.3: 조건이 줄보다 먼저(잘못된 줄이 있어도 E-UIS-FILTER)', () => {
    const rows = rxRows({ filter: '외래', lines: [{ code: 'carm', name: '카름정', qty: '많이', amount: 100 }], total: 100 })
    expect(readUisFile(bookBytes(rows), TODAY)).toMatchObject({ code: 'E-UIS-FILTER' })
  })

  it('AC-8802.3: 받으면 그 기간(단위 포함)을 싣는다', () => {
    expect(readUisFile(bookBytes(visitsRows()), TODAY)).toMatchObject({
      status: 'read',
      read: { kind: 'visits', span: { from: '2026-11-02', to: '2026-11-08', unit: 'week' } },
    })
  })
})

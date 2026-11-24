import { describe, expect, it } from 'vitest'
import { errorInfo } from '@/lib/errors'
import { DEFAULT_FILL_MONTHS, FILL_CHOICES, fillChangedText, fillRange, uploadStatus, type UploadRow } from './range'

// 저절로 올리기 — 채울 기간 셈·상태 글(spec admin-view REQ-8020 AC-8020.1·8020.2, design.md '저절로 올리기 — 셈 · 글 · 브라우저 함수'·
// '화면 글자' 2차). 순수 함수만. 글은 승인된 2차 시안(docs/mockups/admin-view index.html T 글) 그대로다. 의원 이름은 지어낸 것이다

const ROW: UploadRow = { months: 2, throughDay: '2026-11-23', filledFrom: '2026-09-01', lastOkAt: '2026-11-23T23:05:00Z', errorCode: null, errorAt: null }
const AT_0805 = '마지막으로 올린 때 11월 24일 (화) 08:05'

describe('AC-8020.1 채울 기간 고르기 값 · 기간 셈', () => {
  it('AC-8020.1: FILL_CHOICES는 시안 아홉(이름 ↔ 달 수) 차례이고 처음 값은 2달이다', () => {
    expect(FILL_CHOICES).toEqual([
      { months: 1, name: '1달' },
      { months: 2, name: '2달' },
      { months: 3, name: '3달' },
      { months: 6, name: '6달' },
      { months: 12, name: '1년' },
      { months: 24, name: '2년' },
      { months: 36, name: '3년' },
      { months: 60, name: '5년' },
      { months: 120, name: '10년' },
    ])
    expect(DEFAULT_FILL_MONTHS).toBe(2)
  })

  it.each([
    ['2026-11-24', 2, '2026-09-01', '2026-11-23'],
    ['2026-11-24', 120, '2016-11-01', '2026-11-23'],
    ['2026-11-24', 1, '2026-10-01', '2026-11-23'],
    ['2026-11-24', 12, '2025-11-01', '2026-11-23'],
    ['2026-12-01', 1, '2026-11-01', '2026-11-30'],
    ['2027-01-01', 1, '2026-12-01', '2026-12-31'],
    ['2027-01-01', 3, '2026-10-01', '2026-12-31'],
    ['2026-03-01', 1, '2026-02-01', '2026-02-28'],
    ['2028-03-01', 1, '2028-02-01', '2028-02-29'],
    ['2026-01-15', 24, '2024-01-01', '2026-01-14'],
  ] as const)('AC-8020.1: fillRange(%s, %i) = %s ~ %s (이번 달에서 그 달 수만큼 앞 달의 1일 ~ 어제)', (today, months, from, to) => {
    expect(fillRange(today, months)).toEqual({ from, to })
  })

  it.each([
    [2, 12, '다라정형외과 채울 기간을 1년으로 바꿨어요. 그 의원 PC에서 다음에 앱을 열 때부터 더 채워요.'],
    [2, 120, '다라정형외과 채울 기간을 10년으로 바꿨어요. 그 의원 PC에서 다음에 앱을 열 때부터 더 채워요.'],
    [1, 3, '다라정형외과 채울 기간을 3달로 바꿨어요. 그 의원 PC에서 다음에 앱을 열 때부터 더 채워요.'],
    [12, 2, '다라정형외과 채울 기간을 2달로 바꿨어요. 이미 올라온 숫자는 지우지 않아요.'],
    [120, 60, '다라정형외과 채울 기간을 5년으로 바꿨어요. 이미 올라온 숫자는 지우지 않아요.'],
    [6, 1, '다라정형외과 채울 기간을 1달로 바꿨어요. 이미 올라온 숫자는 지우지 않아요.'],
  ] as const)('AC-8020.1: fillChangedText(이름, %i → %i)는 시안 완료 줄(늘림·줄임, 로/으로)이다', (before, after, text) => {
    expect(fillChangedText('다라정형외과', before, after)).toBe(text)
  })
})

describe('AC-8020.2 저절로 올림 상태 글 uploadStatus', () => {
  it('AC-8020.2: 다 올라옴 — 첫 줄 {M월 D일}까지, 둘째 줄 없음, 마우스 글 = 마지막으로 올린 때(한국 시각)', () => {
    expect(uploadStatus({ row: ROW, months: 2, today: '2026-11-24' })).toEqual({ kind: 'done', first: '11월 23일까지', second: null, title: AT_0805 })
  })

  it('AC-8020.2: 채우는 중 — 둘째 줄 {YYYY년 M월}까지 채움, 마우스 글에 채울 기간 덧붙임', () => {
    expect(uploadStatus({ row: { ...ROW, months: 120, filledFrom: '2024-03-01' }, months: 120, today: '2026-11-24' })).toEqual({
      kind: 'filling',
      first: '11월 23일까지',
      second: '2024년 3월까지 채움',
      title: `${AT_0805} · 채울 기간 10년 가운데 2024년 3월까지 채웠어요. 앱을 열 때마다 5분쯤씩 더 채워요.`,
    })
  })

  it('AC-8020.2: 채울 기간 첫날 ≥ filled_from이면 다 올라옴, 기간을 늘리면 다시 채우는 중(손에 든 months로 셈)', () => {
    // 11월 24일·2달 → 첫날 9월 1일
    expect(uploadStatus({ row: { ...ROW, filledFrom: '2026-09-01' }, months: 2, today: '2026-11-24' }).kind).toBe('done')
    expect(uploadStatus({ row: { ...ROW, filledFrom: '2026-08-01' }, months: 2, today: '2026-11-24' }).kind).toBe('done')
    expect(uploadStatus({ row: { ...ROW, filledFrom: '2026-10-01' }, months: 2, today: '2026-11-24' })).toMatchObject({ kind: 'filling', second: '2026년 10월까지 채움' })
    // 줄의 months(2)가 아니라 넘긴 months(3)로 센다 → 첫날 8월 1일
    expect(uploadStatus({ row: { ...ROW, filledFrom: '2026-09-01' }, months: 3, today: '2026-11-24' })).toEqual({
      kind: 'filling',
      first: '11월 23일까지',
      second: '2026년 9월까지 채움',
      title: `${AT_0805} · 채울 기간 3달 가운데 2026년 9월까지 채웠어요. 앱을 열 때마다 5분쯤씩 더 채워요.`,
    })
  })

  it('AC-8020.2: 채운 달이 아직 없으면(filled_from null) 채우는 중이고 둘째 줄·덧붙임이 없다', () => {
    expect(uploadStatus({ row: { ...ROW, filledFrom: null }, months: 2, today: '2026-11-24' })).toEqual({
      kind: 'filling',
      first: '11월 23일까지',
      second: null,
      title: AT_0805,
    })
  })

  it.each([
    ['E-HELPER-OLD', '도우미를 업데이트하세요'],
    ['E-STATS-SAVE-FAILED', '통계 숫자를 저장하지 못했어요'],
    ['E-AUTO-OTHER-BIT', '다른 의원 비트 PC예요'],
    ['E-AUTO-UPLOAD', '비트 숫자를 올리지 못했어요'],
  ])('AC-8020.2: 실패 %s — 첫 줄 lib/errors.ts의 what(%s), 둘째 줄 {번호} · {M월 D일}까지', (code, what) => {
    const row: UploadRow = { ...ROW, throughDay: '2026-11-20', lastOkAt: '2026-11-20T23:47:00Z', errorCode: code, errorAt: '2026-11-21T00:00:00Z' }
    expect(uploadStatus({ row, months: 3, today: '2026-11-24' })).toEqual({
      kind: 'failed',
      first: what,
      second: `${code} · 11월 20일까지`,
      title: '마지막으로 올린 때 11월 21일 (토) 08:47',
    })
    expect(what).toBe(errorInfo(code as 'E-HELPER-OLD').what)
  })

  it('AC-8020.2: 실패는 채우는 중이어도 실패이고(덧붙임 없음), 모르는 번호는 E-AUTO-UPLOAD의 what, 날이 없으면 둘째 줄은 번호만', () => {
    const failing: UploadRow = { ...ROW, filledFrom: '2026-10-01', errorCode: 'E-SOMETHING-NEW', errorAt: '2026-11-24T00:00:00Z' }
    expect(uploadStatus({ row: failing, months: 120, today: '2026-11-24' })).toEqual({
      kind: 'failed',
      first: '비트 숫자를 올리지 못했어요',
      second: 'E-SOMETHING-NEW · 11월 23일까지',
      title: AT_0805,
    })
    expect(uploadStatus({ row: { ...ROW, throughDay: null, filledFrom: null, lastOkAt: null, errorCode: 'E-HELPER-OLD' }, months: 2, today: '2026-11-24' })).toEqual({
      kind: 'failed',
      first: '도우미를 업데이트하세요',
      second: 'E-HELPER-OLD',
      title: '',
    })
  })

  it('AC-8020.2: 한 번도 없음 — 아직 없음, 마우스 글 이 의원 비트 PC에서 아직 올라온 날이 없어요.(줄 없음·날 없음 모두)', () => {
    const none = { kind: 'none', first: '아직 없음', second: null, title: '이 의원 비트 PC에서 아직 올라온 날이 없어요.' }
    expect(uploadStatus({ row: null, months: 2, today: '2026-11-24' })).toEqual(none)
    expect(uploadStatus({ row: undefined, months: 120, today: '2026-11-24' })).toEqual(none)
    expect(uploadStatus({ row: { ...ROW, throughDay: null, filledFrom: null, lastOkAt: null }, months: 2, today: '2026-11-24' })).toEqual(none)
    expect(uploadStatus({ row: { ...ROW, throughDay: null, filledFrom: null }, months: 2, today: '2026-11-24' })).toEqual(none)
  })

  it('AC-8020.2: 마지막으로 올린 때는 한국 시각(자정은 00:00, 요일은 한국 날짜)이고 없거나 읽지 못하면 그 줄이 없다', () => {
    const at = (lastOkAt: string | null) => uploadStatus({ row: { ...ROW, lastOkAt }, months: 2, today: '2026-11-24' }).title
    expect(at('2026-11-23T15:00:00Z')).toBe('마지막으로 올린 때 11월 24일 (화) 00:00')
    expect(at('2026-11-23T14:59:00+00:00')).toBe('마지막으로 올린 때 11월 23일 (월) 23:59')
    expect(at('2026-11-22T03:12:45.123456+00:00')).toBe('마지막으로 올린 때 11월 22일 (일) 12:12')
    expect(at(null)).toBe('')
    expect(at('not-a-time')).toBe('')
  })

  it('AC-8020.2: 날 글자는 앞 0 없이(1월 5일까지 · 2025년 1월까지 채움)', () => {
    expect(
      uploadStatus({ row: { ...ROW, throughDay: '2026-01-05', filledFrom: '2025-01-01', lastOkAt: null }, months: 24, today: '2026-01-06' }),
    ).toEqual({
      kind: 'filling',
      first: '1월 5일까지',
      second: '2025년 1월까지 채움',
      title: '채울 기간 2년 가운데 2025년 1월까지 채웠어요. 앱을 열 때마다 5분쯤씩 더 채워요.',
    })
  })
})

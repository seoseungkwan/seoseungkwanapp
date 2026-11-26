import { describe, expect, it } from 'vitest'
import { fillWarnings, resultLines, type ResultCtx } from './result'
import type { FillReply } from './shapes'

// 넣기 결과 줄(spec google-link REQ-8512 AC-8512.2). 기대 글은 승인 시안 docs/mockups/google-link/notes-sunap.md
// `done`·`done-warn` 절의 글자를 그대로 적었다(상수를 다시 쓰지 않는다 — 복사 실수를 잡으려고).
// 무엇을 붙이는지·차례는 비트시트 MainForm.ShowResult·RunNotes(Warnings·OneLine·Combine·RatioLine)·DayStats.UncountedText 그대로다.
// 숫자는 모두 지어낸 값이다.

const ZERO: FillReply = {
  rows: 0,
  patients: 0,
  added: 0,
  filled: 0,
  overwritten: 0,
  skipped: 0,
  full: false,
  cancelCleared: 0,
  cancelKept: 0,
  freeFixed: 0,
  inserted: 0,
  cleaned: 0,
  shareFailed: 0,
  created: false,
  ratioFixed: 0,
  ratioSkipped: [],
  ratioSkippedCount: 0,
  ratioFailed: false,
  split: 0,
  free: 0,
  paidOnly: 0,
  notes: 0,
  notPut: { noName: 0, unlinked: 0, negative: 0, noChart: 0 },
  fileId: null,
  sheetGid: null,
  version: '8',
  oldCode: false,
}
const reply = (over: Partial<FillReply>): FillReply => ({ ...ZERO, ...over })
const at = (when: string) => new Date(`${when}:00+09:00`)
const HAND: ResultCtx = { day: '2026-11-26', mode: 'fillEmpty', via: 'hand', at: at('2026-11-26T14:41') }
const AUTO: ResultCtx = { day: '2026-11-26', mode: 'fillEmpty', via: 'auto', at: at('2026-11-26T14:40') }

describe('AC-8512.2: done — 손으로 넣은 결과 줄', () => {
  const lines = resultLines(
    reply({
      rows: 12,
      patients: 10,
      added: 2,
      filled: 1,
      skipped: 0,
      split: 1,
      free: 1,
      inserted: 1,
      freeFixed: 1,
      cancelCleared: 1,
      paidOnly: 1,
      notes: 2,
      notPut: { noName: 0, unlinked: 0, negative: 0, noChart: 1 },
    }),
    HAND,
  )

  it('AC-8512.2: 1줄 — ✔ 넣었어요 · 날·방식·시각 · 네 숫자', () => {
    expect(lines.head.tone).toBe('ok')
    expect(lines.head.title).toBe('✔ 넣었어요')
    expect(lines.head.where).toBe('— 11월 26일 시트 · 빈 칸만 채우기 · 14:41')
    expect(lines.head.countsText).toBe('오늘 환자 10명 · 새로 넣은 줄 2 · 채운 줄 1 · 건너뛴 줄 0')
    expect(lines.head.counts).toEqual([
      { label: '오늘 환자', n: 10, unit: '명' },
      { label: '새로 넣은 줄', n: 2, unit: '' },
      { label: '채운 줄', n: 1, unit: '' },
      { label: '건너뛴 줄', n: 0, unit: '' },
    ])
  })

  it('AC-8512.2: 2줄 — 있는 것만 · 로 이어 붙임', () => {
    expect(lines.extra).toBe(
      '나눠 낸 돈 1명(두 줄로) · FREE 1명 · 늦게 낸 돈 끼워 넣은 줄 1 · FREE로 고침 1명 · 취소된 접수 지움 1명 · 미수만 낸 환자 1명(이름 줄) · 비고 넣음 2칸 · 새 달 파일: 이번 달 파일 그대로 씀',
    )
  })

  it('AC-8512.2: 3줄 — 넣지 않음', () => {
    expect(lines.notPut).toBe('넣지 않음: 차트번호 없는 내원 1건')
    expect(lines.warn).toBeNull()
  })
})

describe('AC-8512.2: done-warn — 넣었지만 확인 필요', () => {
  const lines = resultLines(reply({ rows: 12, patients: 10, added: 1, filled: 0, skipped: 1, cancelKept: 1 }), AUTO)

  it('AC-8512.2: 1줄 — ⚠ 넣었어요 · 확인 필요 · 저절로 넣기', () => {
    expect(lines.head.tone).toBe('warn')
    expect(lines.head.title).toBe('⚠ 넣었어요 · 확인 필요')
    expect(lines.head.where).toBe('— 11월 26일 시트 · 저절로 넣기 · 14:40')
    expect(lines.head.countsText).toBe('오늘 환자 10명 · 새로 넣은 줄 1 · 채운 줄 0 · 건너뛴 줄 1')
  })

  it('AC-8512.2: 2줄 — 끝말 "— 시트에서 확인해 주세요"는 한 번', () => {
    expect(lines.warn?.line).toBe('취소된 접수 1명 · 건너뛴 줄 1개 — 시트에서 확인해 주세요')
  })

  it('AC-8512.2: 3줄 — 풀이', () => {
    expect(lines.warn?.why).toBe(
      '취소된 접수: 비고나 예약관리 칸에 직원 글이 있어서 그 줄을 지우지 않았어요. 건너뛴 줄: 늦게 낸 돈을 붙일 바로 아래 줄이 차 있고 맨 아래 줄도 차 있어서 넣지 못했어요.',
    )
  })

  it('AC-8512.2: 확인 필요 글 넷(비트시트 RunNotes 그대로, 끝말 한 번)', () => {
    const all = resultLines(reply({ cancelKept: 2, skipped: 3, full: true, oldCode: true }), HAND)
    expect(all.head.title).toBe('⚠ 넣었어요 · 확인 필요')
    expect(all.warn?.line).toBe(
      '취소된 접수 2명 · 건너뛴 줄 3개 — 시트에서 확인해 주세요 · 빈 줄이 모자라 다 넣지 못했어요 · 구글 코드가 옛 판이에요 — [설정] › 구글 연결에서 코드를 새로 붙여 주세요',
    )
    expect(fillWarnings(reply({ cancelKept: 2, skipped: 3, full: true, oldCode: true }))).toEqual([
      '취소된 접수 2명 — 시트에서 확인해 주세요',
      '건너뛴 줄 3개 — 시트에서 확인해 주세요',
      '빈 줄이 모자라 다 넣지 못했어요',
      '구글 코드가 옛 판이에요 — [설정] › 구글 연결에서 코드를 새로 붙여 주세요',
    ])
  })

  it('AC-8512.2: 풀이가 없는 확인 필요 글만이면 풀이는 빈 글', () => {
    const full = resultLines(reply({ full: true }), AUTO)
    expect(full.warn).toEqual({ line: '빈 줄이 모자라 다 넣지 못했어요', why: '' })
    expect(fillWarnings(ZERO)).toEqual([])
  })
})

describe('AC-8512.2: 덮어쓰기 · 있는 것만 · 그 밖에 붙는 글', () => {
  it("AC-8512.2: 덮어쓰기면 '덮어쓰기'·'바뀐 줄'", () => {
    const lines = resultLines(reply({ patients: 4, added: 0, filled: 9, overwritten: 3 }), { ...HAND, mode: 'overwrite' })
    expect(lines.head.where).toBe('— 11월 26일 시트 · 덮어쓰기 · 14:41')
    expect(lines.head.countsText).toBe('오늘 환자 4명 · 새로 넣은 줄 0 · 바뀐 줄 3 · 건너뛴 줄 0')
  })

  it('AC-8512.2: 0인 것은 붙이지 않고 새 달 파일 글만 남는다', () => {
    const lines = resultLines(ZERO, HAND)
    expect(lines.extra).toBe('새 달 파일: 이번 달 파일 그대로 씀')
    expect(lines.notPut).toBe('')
    expect(lines.warn).toBeNull()
  })

  it('AC-8512.2: 새 달 파일: 새로 만듦 · 공유 못 한 메일 n · 비율 식 고침 n칸', () => {
    const lines = resultLines(reply({ created: true, shareFailed: 2, ratioFixed: 128 }), AUTO)
    expect(lines.extra).toBe('새 달 파일: 새로 만듦 · 공유 못 한 메일 2 · 비율 식 고침 128칸')
    expect(lines.head.tone).toBe('ok')
  })

  it('AC-8512.2: 넣지 않음 — 그 밖의 셋도 있는 것만', () => {
    const lines = resultLines(reply({ notPut: { noName: 1, unlinked: 2, negative: 3, noChart: 1 } }), HAND)
    expect(lines.notPut).toBe('넣지 않음: 이름을 모르는 미수만 낸 환자 1명 · 내원에 안 붙은 수납 2줄 · 0보다 작은 돈 3개 · 차트번호 없는 내원 1건')
  })

  it('AC-8512.2: 비율 식을 그대로 둔 칸·고치지 못함은 넣지 않음 줄 뒤에(확인 필요는 아님)', () => {
    const cells = ['23!J9', '23!K9', '23!L9', '23!M9', '24!J9']
    const lines = resultLines(
      reply({ ratioSkipped: cells, ratioSkippedCount: 5, ratioFailed: true, notPut: { noName: 0, unlinked: 0, negative: 0, noChart: 1 } }),
      HAND,
    )
    expect(lines.head.tone).toBe('ok')
    expect(lines.notPut).toBe(
      '넣지 않음: 차트번호 없는 내원 1건 · 이 칸들은 식 모양이 달라 그대로 두었어요: 23!J9, 23!K9, 23!L9, 23!M9 등 (5칸) — 비율이 조금 낮게 나올 수 있어요. 필요하면 원장님께 알려 주세요 · 비율 식을 고치지 못했어요(다음 넣기 때 다시 해요)',
    )
    const only = resultLines(reply({ ratioSkipped: ['23!J9'], ratioSkippedCount: 1 }), HAND)
    expect(only.notPut).toBe('이 칸들은 식 모양이 달라 그대로 두었어요: 23!J9 (1칸) — 비율이 조금 낮게 나올 수 있어요. 필요하면 원장님께 알려 주세요')
  })
})

describe('AC-8512.2: 지난 날이면 M월 d일 시트: ', () => {
  it('AC-8512.2: 지난 날 다시 넣기의 경고 앞에 날을 붙인다', () => {
    const lines = resultLines(reply({ skipped: 1 }), { day: '2026-11-25', mode: 'fillEmpty', via: 'past', at: at('2026-11-26T08:00') })
    expect(lines.head.where).toBe('— 11월 25일 시트 · 저절로 넣기 · 08:00')
    expect(lines.warn?.line).toBe('11월 25일 시트: 건너뛴 줄 1개 — 시트에서 확인해 주세요')
  })

  it('AC-8512.2: 손으로 지난 날을 넣어도 같다 · 오늘이면 붙이지 않는다', () => {
    const old = resultLines(reply({ full: true }), { ...HAND, day: '2026-01-05', mode: 'overwrite' })
    expect(old.head.where).toBe('— 1월 5일 시트 · 덮어쓰기 · 14:41')
    expect(old.warn?.line).toBe('1월 5일 시트: 빈 줄이 모자라 다 넣지 못했어요')
    expect(resultLines(reply({ full: true }), HAND).warn?.line).toBe('빈 줄이 모자라 다 넣지 못했어요')
  })

  it('AC-8512.2: 날·시각은 한국 시각으로 본다', () => {
    // 2026-11-25 15:30 UTC = 한국 11월 26일 00:30
    const ctx: ResultCtx = { day: '2026-11-25', mode: 'fillEmpty', via: 'past', at: new Date('2026-11-25T15:30:00Z') }
    expect(resultLines(reply({ skipped: 1 }), ctx).head.where).toBe('— 11월 25일 시트 · 저절로 넣기 · 00:30')
    expect(resultLines(reply({ skipped: 1 }), ctx).warn?.line).toBe('11월 25일 시트: 건너뛴 줄 1개 — 시트에서 확인해 주세요')
    expect(resultLines(reply({ skipped: 1 }), { ...ctx, day: '2026-11-26' }).warn?.line).toBe('건너뛴 줄 1개 — 시트에서 확인해 주세요')
  })

  it('AC-8512.2: 저녁 넣기도 저절로 넣기로 적는다', () => {
    expect(resultLines(ZERO, { ...AUTO, via: 'evening', at: at('2026-11-26T19:30') }).head.where).toBe('— 11월 26일 시트 · 저절로 넣기 · 19:30')
  })
})

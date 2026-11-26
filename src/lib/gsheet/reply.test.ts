import { describe, expect, it } from 'vitest'
import { BAD_REPLY, readFill, readLink, readMonths, readStatus } from './reply'

// 도우미 수납 명령 답 읽기(spec google-link REQ-8513, design.md 9-2·10-4). 답에는 숫자·참거짓·칸 주소·파일 id·gid만 남긴다.
// 정해 둔 열쇠 밖이 섞이거나 칸 모양이 틀리면 null(부르는 쪽이 E-BRIDGE-BAD-REPLY). 환자 이름·차트번호가 브라우저로 오지 않게(CLAUDE.md).
// sheet.status의 코드 주소·함께 쓸 메일은 설정 칸 보이기용 pinned로만 내놓는다.

const TAG = '0123456789abcdef'
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbFAKEfakeFAKEfake0123/exec'
const FILE_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz_0123456789'

const status = (over: Record<string, unknown> = {}) => ({
  v: 1,
  secretTag: TAG,
  bitsheet: false,
  codeVersion: '8',
  url: SCRIPT_URL,
  shareWith: ['desk@example.com'],
  verified: true,
  ...over,
})

const fill = (over: Record<string, unknown> = {}) => ({
  v: 1,
  rows: 12,
  patients: 10,
  added: 3,
  filled: 2,
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
  ratioSkipped: ['23!J9'],
  ratioSkippedCount: 1,
  ratioFailed: false,
  split: 1,
  free: 0,
  paidOnly: 0,
  notes: 2,
  notPut: { noName: 0, unlinked: 0, negative: 0, noChart: 1 },
  fileId: FILE_ID,
  sheetGid: 123456,
  version: '8',
  oldCode: false,
  ...over,
})

const months = (over: Record<string, unknown> = {}) => ({
  v: 1,
  version: '8',
  months: [
    { ym: '2026-11', fileId: FILE_ID, gids: { '1': 0, '26': 987654 } },
    { ym: '2026-10', fileId: null, gids: {} },
  ],
  ...over,
})

describe('AC-8513.1: sheet.fill 답 — 숫자·칸 주소·파일 id·gid만', () => {
  it('AC-8513.1: 맞는 답은 v를 뺀 같은 칸의 새 값', () => {
    const data = fill()
    const read = readFill(data)
    const want: Record<string, unknown> = { ...data }
    delete want.v
    expect(read).toEqual(want)
    expect(read).not.toBe(data)
    expect((read as { notPut: unknown }).notPut).not.toBe(data.notPut)
    expect((read as { ratioSkipped: unknown }).ratioSkipped).not.toBe(data.ratioSkipped)
  })

  it('AC-8513.1: 지문이 같아 보내지 않은 답 {unchanged, rows}', () => {
    expect(readFill({ v: 1, unchanged: true, rows: 12 })).toEqual({ unchanged: true, rows: 12 })
    expect(readFill({ v: 1, unchanged: true, rows: 12, name: '홍길동' })).toBeNull()
    expect(readFill({ v: 1, unchanged: false, rows: 12 })).toBeNull()
    expect(readFill({ v: 1, unchanged: true, rows: -1 })).toBeNull()
  })

  it('AC-8513.1: 파일 id·gid는 없을 수 있다(null)', () => {
    expect(readFill(fill({ fileId: null, sheetGid: null }))).toMatchObject({ fileId: null, sheetGid: null })
  })

  it.each([
    ['다른 열쇠(이름)', { name: '홍길동' }],
    ['다른 열쇠(차트번호)', { chart: '000123' }],
    ['숫자 칸에 글', { added: '3' }],
    ['숫자 칸에 이름', { patients: '홍길동' }],
    ['0보다 작은 수', { skipped: -1 }],
    ['소수', { filled: 1.5 }],
    ['참거짓 칸에 숫자', { full: 0 }],
    ['칸 주소 자리에 이름', { ratioSkipped: ['홍길동'] }],
    ['칸 주소 자리에 숫자', { ratioSkipped: [9] }],
    ['칸 주소 21개', { ratioSkipped: Array.from({ length: 21 }, (_, i) => `1!J${i + 1}`) }],
    ['파일 id 모양이 틀림', { fileId: 'https://docs.google.com/x' }],
    ['gid가 글', { sheetGid: '12' }],
    ['gid가 0보다 작음', { sheetGid: -1 }],
    ['판이 숫자 글이 아님', { version: 'eight' }],
    ['넣지 않음 칸에 다른 열쇠', { notPut: { noName: 0, unlinked: 0, negative: 0, noChart: 1, who: '홍길동' } }],
    ['넣지 않음 칸이 빠짐', { notPut: { noName: 0, unlinked: 0, negative: 0 } }],
    ['넣지 않음 칸에 글', { notPut: { noName: '김', unlinked: 0, negative: 0, noChart: 1 } }],
    ['v가 1이 아님', { v: 2 }],
  ])('AC-8513.1: %s → null', (_why, over) => {
    expect(readFill(fill(over))).toBeNull()
  })

  it('AC-8513.1: 칸이 하나라도 빠지면 null', () => {
    const rest: Record<string, unknown> = fill()
    delete rest.oldCode
    expect(readFill(rest)).toBeNull()
  })

  it.each([null, undefined, 'ok', 12, [fill()]])('AC-8513.1: 묶음이 아닌 답(%s) → null', (data) => {
    expect(readFill(data)).toBeNull()
  })

  it('AC-8513.1: 모양이 틀린 답의 번호는 통로 번호 E-BRIDGE-BAD-REPLY', () => {
    expect(BAD_REPLY).toBe('E-BRIDGE-BAD-REPLY')
  })
})

describe('AC-8513.2: sheet.status 답 — 비밀 글자 표시, 주소·메일은 pinned로만', () => {
  it('AC-8513.2: 맞는 답 → 표시·판·확인 여부 + pinned(주소·메일)', () => {
    const read = readStatus(status())
    expect(read).toEqual({
      secretTag: TAG,
      bitsheet: false,
      codeVersion: '8',
      verified: true,
      pinned: { url: SCRIPT_URL, shareWith: ['desk@example.com'] },
    })
    // 주소·메일은 pinned 밖에 없다(기록·서버로 가는 값에 섞이지 않게)
    expect(Object.keys(read!)).not.toContain('url')
    expect(Object.keys(read!)).not.toContain('shareWith')
  })

  it('AC-8513.2: 비밀 글자가 없는 PC·주소가 없는 PC', () => {
    expect(readStatus(status({ secretTag: null, url: null, shareWith: [] }))).toMatchObject({
      secretTag: null,
      pinned: { url: null, shareWith: [] },
    })
  })

  it.each([
    ['비밀 글자 그대로(43자)', { secretTag: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ' }],
    ['표시가 대문자', { secretTag: '0123456789ABCDEF' }],
    ['표시가 15자', { secretTag: '0123456789abcde' }],
    ['다른 열쇠(비밀 글자)', { token: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ' }],
    ['다른 열쇠(이름)', { name: '홍길동' }],
    ['판이 숫자 글이 아님', { codeVersion: 8 }],
    ['비트시트 있음이 글', { bitsheet: 'yes' }],
    ['확인 여부가 빠짐', { verified: undefined }],
    ['주소가 숫자', { url: 12 }],
    ['주소에 빈칸·줄바꿈', { url: 'https://script.google.com/a b' }],
    ['메일이 목록이 아님', { shareWith: 'desk@example.com' }],
    ['메일이 11개', { shareWith: Array.from({ length: 11 }, (_, i) => `m${i}@example.com`) }],
    ['메일 자리에 숫자', { shareWith: [1] }],
    ['v가 1이 아님', { v: 0 }],
  ])('AC-8513.2: %s → null', (_why, over) => {
    const data = status(over)
    if ('verified' in over && over.verified === undefined) delete (data as Record<string, unknown>).verified
    expect(readStatus(data)).toBeNull()
  })
})

describe('AC-8513.2: sheet.link 답', () => {
  it('AC-8513.2: 바꿈 {ok} · 같은 값 {ok, same}', () => {
    expect(readLink({ v: 1, ok: true })).toEqual({ same: false })
    expect(readLink({ v: 1, ok: true, same: true })).toEqual({ same: true })
  })

  it.each([
    ['ok가 거짓', { v: 1, ok: false }],
    ['다른 열쇠(주소)', { v: 1, ok: true, url: SCRIPT_URL }],
    ['same이 글', { v: 1, ok: true, same: 'true' }],
    ['v 없음', { ok: true }],
    ['묶음이 아님', 'ok'],
  ])('AC-8513.2: %s → null', (_why, data) => {
    expect(readLink(data)).toBeNull()
  })
})

describe('AC-8513.5: sheet.months 답 — 달·파일 id·gid만', () => {
  it('AC-8513.5: 맞는 답 → 판 + 달 목록(파일 없는 달은 null)', () => {
    const data = months()
    const read = readMonths(data)
    expect(read).toEqual({
      version: '8',
      months: [
        { ym: '2026-11', fileId: FILE_ID, gids: { '1': 0, '26': 987654 } },
        { ym: '2026-10', fileId: null, gids: {} },
      ],
    })
    expect(read!.months[0]).not.toBe(data.months[0])
  })

  it.each([
    ['달 모양이 틀림', { months: [{ ym: '2026-13', fileId: FILE_ID, gids: {} }] }],
    ['파일 id 모양이 틀림', { months: [{ ym: '2026-11', fileId: '홍길동', gids: {} }] }],
    ['날짜 시트가 아닌 이름', { months: [{ ym: '2026-11', fileId: FILE_ID, gids: { 원본: 1 } }] }],
    ['32일 시트', { months: [{ ym: '2026-11', fileId: FILE_ID, gids: { '32': 1 } }] }],
    ['gid가 글', { months: [{ ym: '2026-11', fileId: FILE_ID, gids: { '1': '1' } }] }],
    ['달 안에 다른 열쇠', { months: [{ ym: '2026-11', fileId: FILE_ID, gids: {}, name: '홍길동' }] }],
    ['14달', { months: Array.from({ length: 14 }, () => ({ ym: '2026-11', fileId: null, gids: {} })) }],
    ['목록이 아님', { months: {} }],
    ['다른 열쇠', { rows: [] }],
    ['판이 없음', { version: undefined }],
  ])('AC-8513.5: %s → null', (_why, over) => {
    const data = months(over)
    if ('version' in over && over.version === undefined) delete (data as Record<string, unknown>).version
    expect(readMonths(data)).toBeNull()
  })
})

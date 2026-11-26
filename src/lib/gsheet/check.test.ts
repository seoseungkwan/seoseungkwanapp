import { describe, expect, it } from 'vitest'
import { checkGsheetSettings } from './check'
import type { GsheetPinned, GsheetSettings } from './shapes'

// 수납 시트 설정 검사(spec google-link REQ-8512 AC-8512.3). 막는 글은 승인 시안 notes-sunap.md `settings` 절의
// '저장 때 막는 글'·'진료실 저장 때 막는 글'·'저절로 넣기 막는 글'을 글자 그대로 적었다.
// 막는 조건은 비트시트 SettingsForm.TryCollect · ColumnSettings.IsValid · Settings.IsShiftValid · Clock.TryParse 그대로다.
// 코드 주소·함께 쓸 메일은 서버 설정에 없고 이 PC 도우미 칸 값(pinned)으로 본다(design.md 10-4). 주소·메일은 지어낸 것이다.

const URL_MSG = '구글에서 받은 주소는 https:// 로 시작해야 해요.'
const MAIL_MSG = '함께 쓸 직원 메일 모양을 확인해 주세요(쉼표로 나눠 적어요).'
const ROWS_MSG = '환자 줄(몇 줄부터 몇 줄까지)을 숫자로 넣어 주세요.'
const COL_MSG = '칸 글자는 A~Z 글자로 넣어 주세요.'
const NOTE_MSG = '비고 칸 글자는 A~Z 글자로 넣어 주세요(비우면 비고를 넣지 않아요).'
const DUP_MSG = '같은 칸 글자를 두 번 쓸 수 없어요.'
const SHIFT_FORM_MSG = '밀어 내릴 칸은 A:P처럼 넣어 주세요(비우면 줄을 끼우지 않아요).'
const SHIFT_ORDER_MSG = '밀어 내릴 칸은 앞 칸을 먼저 적어 주세요(예: A:P).'
const SHIFT_COVER_MSG = '밀어 내릴 칸은 비트가 채우는 칸과 비고·예약 칸을 모두 품어야 해요(예: A:P).'
const SIGN_MSG = '기호 번호는 0~99 숫자로 넣어 주세요.'
const ROOM_MSG = '진료실 번호는 1~10 가운데서 골라 주세요.'
const EVERY_MSG = '몇 분마다는 1~240 사이 숫자로 넣어 주세요.'
const CLOCK_MSG = '시각은 08:00처럼 넣어 주세요.'

// 비트시트 7판 기본값(design.md 10-2)
const BASE: GsheetSettings = {
  templateUrl: 'https://docs.google.com/spreadsheets/d/fake-template-id-000000/edit',
  namePattern: '{병원} 일일수납일지 {yyyy}년 {m}월',
  hospitalLabel: '',
  folderUrl: '',
  firstRow: 17,
  lastRow: 302,
  cols: { key: 'B', name: 'C', sign: 'D', amount: 'F', room: 'I', first: 'J', day90: 'K', block: 'L', therapy: 'M', note: 'G' },
  markValue: '0',
  signs: { cash: 1, card: 2, recvCash: 3, recvCard: 4, transfer: 5, recvTransfer: 5, free: 6 },
  shiftCols: 'A:P',
  staffCols: ['G', 'O'],
  bitHospital: '',
  deptRooms: { '01': 1, '02': 2 },
  deptRoomsHospital: '',
  firstKinds: ['1'],
  day90Kinds: ['3'],
  blockCodes: [],
  therapyCodes: [],
  free: 'discount',
  freeInsurance: [31],
  carInsurance: [21, 22],
  aidInsurance: [51, 52],
  noteCar: true,
  noteAid: true,
  autoOn: true,
  everyMin: 5,
  from: '08:00',
  to: '20:00',
  eveningOn: true,
  evening: '19:30',
}
const PIN: GsheetPinned = { url: 'https://script.google.com/macros/s/fake-script-id-0000/exec', shareWith: ['kim@fake.test', 'lee@fake.test'] }
const cols = (over: Partial<GsheetSettings['cols']>) => ({ ...BASE, cols: { ...BASE.cols, ...over } })

describe('AC-8512.3: 기본값 · 빈 값', () => {
  it('AC-8512.3: 비트시트 7판 기본값은 막는 글이 없다', () => {
    expect(checkGsheetSettings(BASE, PIN)).toEqual([])
  })

  it('AC-8512.3: 주소·메일·밀어 내릴 칸·비고 칸은 비워도 된다', () => {
    expect(checkGsheetSettings({ ...cols({ note: '' }), shiftCols: '' }, { url: null, shareWith: [] })).toEqual([])
    expect(checkGsheetSettings(BASE, { url: '  ', shareWith: [' ', ''] })).toEqual([])
  })
})

describe('AC-8512.3: 저장 때 막는 글 — 구글 연결 (이 PC 칸 값)', () => {
  it.each<[string, string, string[]]>([
    ['http 주소', 'http://script.google.com/macros/s/fake/exec', [URL_MSG]],
    ['주소 아닌 글', 'script.google.com', [URL_MSG]],
    ['대문자 HTTPS', 'HTTPS://script.google.com/macros/s/fake/exec', []],
    ['앞뒤 빈칸', '  https://script.google.com/macros/s/fake/exec  ', []],
  ])('AC-8512.3: %s', (_, url, problems) => {
    expect(checkGsheetSettings(BASE, { ...PIN, url })).toEqual(problems)
  })

  it('AC-8512.3: 함께 쓸 직원 메일에 @가 없는 글', () => {
    expect(checkGsheetSettings(BASE, { ...PIN, shareWith: ['kim@fake.test', 'park'] })).toEqual([MAIL_MSG])
  })
})

describe('AC-8512.3: 저장 때 막는 글 — 시트', () => {
  it.each<[string, number, number]>([
    ['0줄부터', 0, 302],
    ['끝이 앞보다 앞', 17, 16],
    ['소수', 17.5, 302],
    ['숫자 아님', Number.NaN, 302],
    ['너무 큰 수', 17, 2 ** 31],
  ])('AC-8512.3: 환자 줄 %s', (_, firstRow, lastRow) => {
    expect(checkGsheetSettings({ ...BASE, firstRow, lastRow }, PIN)).toEqual([ROWS_MSG])
  })

  it('AC-8512.3: 환자 줄 한 줄짜리는 된다', () => {
    expect(checkGsheetSettings({ ...BASE, firstRow: 17, lastRow: 17 }, PIN)).toEqual([])
  })

  it.each<[string, Partial<GsheetSettings['cols']>, string[]]>([
    ['숫자 칸 글자', { key: '1' }, [COL_MSG]],
    ['빈 칸 글자', { amount: ' ' }, [COL_MSG]],
    ['세 글자', { room: 'ABC' }, [COL_MSG]],
    ['A~Z 밖 글자', { name: 'ß' }, [COL_MSG]],
    ['소문자는 된다', { therapy: 'n' }, []],
    ['비고 칸 숫자', { note: '7' }, [NOTE_MSG]],
    ['비고 칸이 비트 칸과 겹침', { note: 'D' }, [DUP_MSG]],
    ['소문자로 겹침', { key: 'c' }, [DUP_MSG]],
  ])('AC-8512.3: %s', (_, over, problems) => {
    expect(checkGsheetSettings(cols(over), PIN)).toEqual(problems)
  })

  it('AC-8512.3: 두 글자 칸(AA)도 된다 — 밀어 내릴 칸이 품을 때', () => {
    expect(checkGsheetSettings({ ...cols({ therapy: 'aa' }), shiftCols: 'A:AB' }, PIN)).toEqual([])
    expect(checkGsheetSettings(cols({ therapy: 'aa' }), PIN)).toEqual([SHIFT_COVER_MSG])
  })

  it.each<[string, string, string[]]>([
    ['꼴이 틀림', 'A-P', [SHIFT_FORM_MSG]],
    ['네 글자', 'A:ZZZZ', [SHIFT_FORM_MSG]],
    ['뒤 칸이 앞', 'P:A', [SHIFT_ORDER_MSG]],
    ['비트 칸·예약 칸을 다 품지 못함', 'A:H', [SHIFT_COVER_MSG]],
    ['빈칸·소문자는 고쳐 읽음', ' a : p ', []],
    ['더 넓게', 'A:AB', []],
  ])('AC-8512.3: 밀어 내릴 칸 %s', (_, shiftCols, problems) => {
    expect(checkGsheetSettings({ ...BASE, shiftCols }, PIN)).toEqual(problems)
  })

  it('AC-8512.3: 직원 칸이 밀어 내릴 칸 밖이면 품어야 한다는 글', () => {
    expect(checkGsheetSettings({ ...BASE, staffCols: ['G', 'R'] }, PIN)).toEqual([SHIFT_COVER_MSG])
  })

  it('AC-8512.3: 칸 글자가 틀리면 밀어 내릴 칸은 보지 않는다(비트시트처럼 칸 글자부터)', () => {
    expect(checkGsheetSettings({ ...cols({ key: '1' }), shiftCols: 'P:A' }, PIN)).toEqual([COL_MSG])
  })

  it.each<[keyof GsheetSettings['signs'], number]>([
    ['cash', 100],
    ['free', -1],
    ['card', 1.5],
    ['recvTransfer', Number.NaN],
  ])('AC-8512.3: 기호 번호 %s = %d', (key, n) => {
    expect(checkGsheetSettings({ ...BASE, signs: { ...BASE.signs, [key]: n } }, PIN)).toEqual([SIGN_MSG])
  })

  it('AC-8512.3: 기호 번호 0과 99는 된다', () => {
    expect(checkGsheetSettings({ ...BASE, signs: { ...BASE.signs, cash: 0, free: 99 } }, PIN)).toEqual([])
  })
})

describe('AC-8512.3: 진료실 저장 때 막는 글', () => {
  it.each<[string, number]>([
    ['11', 11],
    ['0', 0],
    ['소수', 1.5],
  ])('AC-8512.3: 진료실 번호 %s', (_, room) => {
    expect(checkGsheetSettings({ ...BASE, deptRooms: { '01': 1, '02': room } }, PIN)).toEqual([ROOM_MSG])
  })

  it('AC-8512.3: 1~10은 된다', () => {
    expect(checkGsheetSettings({ ...BASE, deptRooms: { '01': 1, '02': 10 } }, PIN)).toEqual([])
  })
})

describe('AC-8512.3: 저절로 넣기 막는 글', () => {
  it.each<[number]>([[0], [241], [2.5], [Number.NaN]])('AC-8512.3: 몇 분마다 %d', (everyMin) => {
    expect(checkGsheetSettings({ ...BASE, everyMin }, PIN)).toEqual([EVERY_MSG])
  })

  it('AC-8512.3: 몇 분마다 1과 240은 된다', () => {
    expect(checkGsheetSettings({ ...BASE, everyMin: 1 }, PIN)).toEqual([])
    expect(checkGsheetSettings({ ...BASE, everyMin: 240 }, PIN)).toEqual([])
  })

  it.each<[string, Partial<GsheetSettings>]>([
    ['시작 8시', { from: '8시' }],
    ['끝 25:00', { to: '25:00' }],
    ['저녁 19:60', { evening: '19:60' }],
    ['저녁 비움', { evening: '' }],
  ])('AC-8512.3: 시각 %s', (_, over) => {
    expect(checkGsheetSettings({ ...BASE, ...over }, PIN)).toEqual([CLOCK_MSG])
  })

  it('AC-8512.3: 저녁 넣기를 꺼도 시각은 본다(비트시트 그대로) · 24:00·8:00은 된다', () => {
    expect(checkGsheetSettings({ ...BASE, eveningOn: false, evening: '저녁' }, PIN)).toEqual([CLOCK_MSG])
    expect(checkGsheetSettings({ ...BASE, from: '8:00', to: '24:00' }, PIN)).toEqual([])
  })
})

// 기호 번호는 웹 설정 화면에서 '시트' 칸으로 옮겼다(notes-sunap '비트시트와 달라진 곳') — 화면 차례(시트 안 칸 차례)로 낸다
describe('AC-8512.3: 여러 개면 설정 화면 차례로 모두', () => {
  it('AC-8512.3: 구글 연결 → 시트(메일·환자 줄·칸 글자·기호 번호·밀어 내릴 칸) → 비트 맞춤 → 저절로 넣기', () => {
    const bad: GsheetSettings = {
      ...cols({ note: '7' }),
      firstRow: 0,
      shiftCols: 'P:A',
      deptRooms: { '01': 12 },
      everyMin: 0,
      from: 'x',
      signs: { ...BASE.signs, cash: 100 },
    }
    expect(checkGsheetSettings(bad, { url: 'http://fake', shareWith: ['fake'] })).toEqual([
      URL_MSG,
      MAIL_MSG,
      ROWS_MSG,
      NOTE_MSG,
      SIGN_MSG,
      ROOM_MSG,
      EVERY_MSG,
      CLOCK_MSG,
    ])
    expect(checkGsheetSettings({ ...BASE, shiftCols: 'P:A', signs: { ...BASE.signs, cash: 100 } }, PIN)).toEqual([SIGN_MSG, SHIFT_ORDER_MSG])
  })
})

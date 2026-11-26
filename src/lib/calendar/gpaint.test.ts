import { describe, expect, it } from 'vitest'
import { apptPaint, colorWarnings, settingColor } from './gpaint'
import { DEFAULT_COLOR_NAME, G_COLORS, G_COLOR_ID, G_COLOR_NAME, colorFromId } from './gshapes'
import type { FixCell, GKind, GLook, GStaff, PaintAppt, PaintCtx, RowsGoogle } from './gshapes'

// 칸 색 고르기·같은 색 경고(spec google-link REQ-8521, notes-calendar '색 규칙'·colors 경고). 시행자·종류는 시안 기본값

const STAFF: GStaff[] = [
  { id: 'ho', name: '정호연', mark: '호', color: 'lavender' },
  { id: 'won', name: '박지원', mark: '원', color: 'banana' },
  { id: 'hyun', name: '이수현', mark: '현', color: 'flamingo' },
  { id: 'jang', name: '원장님', mark: '장', color: 'blueberry' },
]
const KINDS: GKind[] = [
  { id: 'dosu', name: '도수', len: 30, color: null, words: ['도수'] },
  { id: 'jabo', name: '자보도수', len: 30, color: null, words: ['자보도수', '자보'] },
  { id: 'shock', name: '충격파', len: 15, color: 'sage', words: ['충격파', '타'] },
  { id: 'inj', name: '주사', len: 10, color: null, words: ['주사'] },
  { id: 'visit', name: '진료', len: 10, color: null, words: ['진료'] },
  { id: 'memo', name: '상담', len: 10, color: 'default', words: ['상담'] },
]
const LOOK: GLook = {
  cancel: 'tomato',
  change: 'graphite',
  offWord: 'off',
  offColor: 'grape',
  noKind: 'dosu',
  staffByColor: true,
  noStaffKinds: ['shock'],
  titleLen: true,
  titleMemo: true,
}
const CTX: PaintCtx = { look: LOOK, kinds: KINDS, staff: STAFF }
const appt = (over: Partial<PaintAppt> = {}): PaintAppt => ({
  status: 'auto',
  origDay: null,
  origStart: null,
  gMoved: false,
  colorFrom: 'app',
  gColor: null,
  kindId: 'dosu',
  staffId: 'ho',
  ...over,
})

describe('AC-8521.2 G_COLOR_ID·이름 — 구글 일정 색 1~11 차례', () => {
  it('AC-8521.2: lavender 1 … tomato 11, 이름 글은 notes-calendar 그대로', () => {
    expect(G_COLORS.map((c) => [c, G_COLOR_ID[c], G_COLOR_NAME[c]])).toEqual([
      ['lavender', '1', '라벤더'],
      ['sage', '2', '세이지'],
      ['grape', '3', '포도'],
      ['flamingo', '4', '플라밍고'],
      ['banana', '5', '바나나'],
      ['tangerine', '6', '귤'],
      ['peacock', '7', '공작'],
      ['graphite', '8', '흑연'],
      ['blueberry', '9', '블루베리'],
      ['basil', '10', '바질'],
      ['tomato', '11', '토마토'],
    ])
    expect(DEFAULT_COLOR_NAME).toBe('캘린더 기본 색')
  })

  it("AC-8521.2: colorId → 색 이름(없거나 모르는 값은 null = 캘린더 기본 색)", () => {
    expect(colorFromId('1')).toBe('lavender')
    expect(colorFromId('11')).toBe('tomato')
    expect(colorFromId(null)).toBeNull()
    expect(colorFromId('')).toBeNull()
    expect(colorFromId('12')).toBeNull()
  })
})

describe('AC-8521.2 apptPaint — 칸 색 차례: 취소 → 변경 → 구글에서 온 색 → 설정 색', () => {
  it('AC-8521.2: ① 취소한 예약은 취소 색(구글 색·변경보다 먼저)', () => {
    expect(apptPaint(appt({ status: 'cancel' }), CTX)).toEqual({ key: 'tomato', colorId: '11', why: 'cancel' })
    expect(apptPaint(appt({ status: 'cancel', colorFrom: 'google', gColor: 'tangerine', origDay: '2026-11-25', origStart: 600 }), CTX)).toEqual({
      key: 'tomato',
      colorId: '11',
      why: 'cancel',
    })
  })

  it('AC-8521.2: ② 변경(처음 자리 있음·g_moved)은 변경 색', () => {
    expect(apptPaint(appt({ origDay: '2026-11-25', origStart: 900 }), CTX)).toEqual({ key: 'graphite', colorId: '8', why: 'change' })
    expect(apptPaint(appt({ gMoved: true, colorFrom: 'google', gColor: 'tangerine' }), CTX)).toEqual({ key: 'graphite', colorId: '8', why: 'change' })
  })

  it('AC-8521.2: ③ 구글에서 온 색은 그 일정 색, 색이 없으면 캘린더 기본 색(colorId 없음)', () => {
    expect(apptPaint(appt({ colorFrom: 'google', gColor: 'tangerine' }), CTX)).toEqual({ key: 'tangerine', colorId: '6', why: 'google' })
    expect(apptPaint(appt({ colorFrom: 'google', gColor: null }), CTX)).toEqual({ key: 'default', colorId: null, why: 'google' })
  })

  it('AC-8521.2: ④ 그 밖은 종류 고정 색, 없으면 시행자 색', () => {
    expect(apptPaint(appt({ kindId: 'shock', staffId: 'hyun' }), CTX)).toEqual({ key: 'sage', colorId: '2', why: 'setting' })
    expect(apptPaint(appt({ kindId: 'dosu', staffId: 'won' }), CTX)).toEqual({ key: 'banana', colorId: '5', why: 'setting' })
    expect(apptPaint(appt({ kindId: 'memo', staffId: 'won' }), CTX)).toEqual({ key: 'default', colorId: null, why: 'setting' })
    // 구글에서 온 줄이 아니면 g_color는 보지 않는다
    expect(apptPaint(appt({ gColor: 'tangerine' }), CTX)).toEqual({ key: 'lavender', colorId: '1', why: 'setting' })
  })

  it('AC-8521.2: 시행자 없는 예약·지운 종류·지운 시행자는 캘린더 기본 색', () => {
    expect(apptPaint(appt({ staffId: null }), CTX).key).toBe('default')
    expect(apptPaint(appt({ staffId: null, kindId: 'shock' }), CTX).key).toBe('sage')
    expect(apptPaint(appt({ kindId: 'gone' }), CTX).key).toBe('default')
    expect(apptPaint(appt({ staffId: 'gone' }), CTX).key).toBe('default')
    expect(apptPaint(appt({ staffId: 'gone', kindId: 'shock' }), CTX).key).toBe('default')
  })

  it('AC-8521.2: settingColor는 ④ 설정 색만 본다(취소·변경·구글 색과 상관없이)', () => {
    expect(settingColor(appt({ status: 'cancel', colorFrom: 'google', gColor: 'tangerine' }), CTX)).toBe('lavender')
    expect(settingColor(appt({ kindId: 'shock' }), CTX)).toBe('sage')
  })

  it('AC-8521.2: 예약표 prop 모양 RowsGoogle은 칠하기 바탕·고쳐야 할 칸·못 보낸 예약 id다', () => {
    const fix: FixCell = { id: 'f1', day: '2026-11-26', start: 960, len: 15, allDay: false, gTitle: '6402 윤모의 (4000타)', gColor: 'sage' }
    const rows: RowsGoogle = { ctx: CTX, fixes: [fix], waiting: new Set(['a1']) }
    expect(apptPaint(appt(), rows.ctx).key).toBe('lavender')
    expect(rows.waiting.has('a1')).toBe(true)
  })
})

describe('AC-8521.4 colorWarnings — notes-calendar colors 경고 다섯 글(그 경우에만, 저장은 막지 않음)', () => {
  const warn = (o: { staff?: GStaff[]; kinds?: GKind[]; look?: Partial<GLook> }) =>
    colorWarnings({ staff: o.staff ?? STAFF, kinds: o.kinds ?? KINDS, look: { ...LOOK, ...o.look } })
  const recolor = (id: string, color: GStaff['color']) => STAFF.map((s) => (s.id === id ? { ...s, color } : s))

  it('AC-8521.4: 시안 기본값에는 경고가 없다', () => {
    expect(warn({})).toEqual([])
  })

  it('AC-8521.4: 시행자끼리 같은 색', () => {
    expect(warn({ staff: recolor('won', 'lavender') })).toEqual([
      '(호) 정호연과 (원) 박지원이 같은 색(라벤더)이에요. 시행자 글이 없는 구글 예약은 색으로 누구인지 알아볼 수 없어요.',
    ])
  })

  it('AC-8521.4: 고정 색 종류와 시행자가 같은 색', () => {
    expect(warn({ staff: recolor('hyun', 'sage') })).toEqual(["'충격파' 색(세이지)이 (현) 이수현 색과 같아요. 색만으로는 종류와 시행자를 가려낼 수 없어요."])
  })

  it('AC-8521.4: 휴무 줄 색을 시행자·종류도 씀', () => {
    expect(warn({ staff: recolor('jang', 'grape') })).toEqual(['휴무 줄 색(포도)을 시행자·종류도 쓰고 있어요.'])
    expect(warn({ look: { offColor: 'sage' } })).toEqual(['휴무 줄 색(세이지)을 시행자·종류도 쓰고 있어요.'])
  })

  it("AC-8521.4: 취소 색·변경 색을 시행자·종류·휴무 줄도 씀 — '취소'로 · '변경'으로", () => {
    const kinds = KINDS.map((k) => (k.id === 'inj' ? { ...k, color: 'tomato' as const } : k))
    expect(warn({ staff: recolor('jang', 'tomato'), kinds, look: { offColor: 'tomato' } })).toContain(
      "취소 색(토마토)을 (장) 원장님·'주사'·휴무 줄도 쓰고 있어요. 구글에서 이 색 일정은 모두 '취소'로 알아봐요. 다른 색을 골라 주세요.",
    )
    expect(warn({ staff: recolor('ho', 'graphite') })).toEqual([
      "변경 색(흑연)을 (호) 정호연도 쓰고 있어요. 구글에서 이 색 일정은 모두 '변경'으로 알아봐요. 다른 색을 골라 주세요.",
    ])
  })

  it('AC-8521.4: 취소 색과 변경 색이 같음', () => {
    expect(warn({ look: { change: 'tomato' } })).toEqual(['취소 색과 변경 색이 같아요(토마토). 구글에서 취소와 변경을 가려낼 수 없어요.'])
  })

  it('AC-8521.4: 시행자 이름 끝 받침에 맞춰 와/과·이/가를 고른다', () => {
    const staff: GStaff[] = [
      { id: 'a', name: '이수', mark: '수', color: 'peacock' },
      { id: 'b', name: '정호', mark: '정', color: 'peacock' },
    ]
    expect(warn({ staff })).toEqual(['(수) 이수와 (정) 정호가 같은 색(공작)이에요. 시행자 글이 없는 구글 예약은 색으로 누구인지 알아볼 수 없어요.'])
  })
})

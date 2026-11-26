import { describe, expect, expectTypeOf, it } from 'vitest'
import { G_COLORS as SHAPE_COLORS, G_COLOR_ID as SHAPE_COLOR_ID, type GColor as ShapeColor } from '@/lib/calendar/gshapes'
import type * as Shapes from '@/lib/gsheet/shapes'
import { CAL_COLORS, CAL_COLOR_ID, type CalColor } from '@/types/calendar'
import { G_COLORS, G_COLOR_ID, type GColor } from '@/types/gcal'
import { DEFAULT_GSHEET_SETTINGS, GSHEET_MODES, GSHEET_OUTCOMES, GSHEET_VIAS, type GsheetPinned, type GsheetRun, type GsheetSettings } from '@/types/gsheet'

// 같은 Phase끼리 서로 부르지 않으려고 따로 둔 모양들이 같은지(spec google-link TASK-23, design.md 10-1·10-2·10-4).
// types/gcal(TASK-4)의 11색 = types/calendar(TASK-3) CAL_COLORS, lib/calendar/gshapes(TASK-7) colorId 표 = CAL_COLOR_ID,
// lib/gsheet/shapes(TASK-8)의 설정·기록·길 모양 = types/gsheet(TASK-4) 열쇠. 타입 쪽은 tsc가, 값 쪽은 이 시험이 본다

// 열쇠 표: 빠지거나 더한 열쇠가 있으면 타입 검사가 막는다(그 열쇠 목록을 값으로 견준다)
const SHAPE_SETTING_KEYS: Record<keyof Shapes.GsheetSettings, true> = {
  templateUrl: true,
  namePattern: true,
  hospitalLabel: true,
  folderUrl: true,
  firstRow: true,
  lastRow: true,
  cols: true,
  markValue: true,
  signs: true,
  shiftCols: true,
  staffCols: true,
  bitHospital: true,
  deptRooms: true,
  deptRoomsHospital: true,
  firstKinds: true,
  day90Kinds: true,
  blockCodes: true,
  therapyCodes: true,
  free: true,
  freeInsurance: true,
  carInsurance: true,
  aidInsurance: true,
  noteCar: true,
  noteAid: true,
  autoOn: true,
  everyMin: true,
  from: true,
  to: true,
  eveningOn: true,
  evening: true,
}
const SHAPE_COL_KEYS: Record<keyof Shapes.GsheetSettings['cols'], true> = {
  key: true,
  name: true,
  sign: true,
  amount: true,
  room: true,
  first: true,
  day90: true,
  block: true,
  therapy: true,
  note: true,
}
const SHAPE_SIGN_KEYS: Record<keyof Shapes.GsheetSettings['signs'], true> = {
  cash: true,
  card: true,
  recvCash: true,
  recvCard: true,
  transfer: true,
  recvTransfer: true,
  free: true,
}
const SHAPE_RUN_KEYS: Record<keyof Shapes.GsheetRun, true> = {
  at: true,
  day: true,
  via: true,
  mode: true,
  outcome: true,
  code: true,
  rows: true,
  counts: true,
  cells: true,
}
const TYPE_RUN_KEYS: Record<keyof GsheetRun, true> = {
  at: true,
  day: true,
  via: true,
  mode: true,
  outcome: true,
  code: true,
  rows: true,
  counts: true,
  cells: true,
}
const sorted = (record: object) => Object.keys(record).sort()

describe('google-link 따로 둔 모양 맞추기 (TASK-23)', () => {
  it('AC-8541.1: types/gcal의 11색(G_COLORS) = types/calendar의 CAL_COLORS(이름·구글 colorId 차례까지 같다)', () => {
    expect([...G_COLORS]).toEqual([...CAL_COLORS])
    expect(G_COLORS).toHaveLength(11)
    expectTypeOf<GColor>().toEqualTypeOf<CalColor>()
  })

  it('AC-8541.1: lib/calendar/gshapes의 색 이름·colorId 표 = types/calendar의 CAL_COLORS·CAL_COLOR_ID(lavender 1 … tomato 11)', () => {
    expect([...SHAPE_COLORS]).toEqual([...CAL_COLORS])
    expect({ ...SHAPE_COLOR_ID }).toEqual({ ...CAL_COLOR_ID })
    expect({ ...G_COLOR_ID }).toEqual({ ...CAL_COLOR_ID })
    expect(CAL_COLOR_ID.lavender).toBe('1')
    expect(CAL_COLOR_ID.tomato).toBe('11')
    expectTypeOf<ShapeColor>().toEqualTypeOf<CalColor>()
  })

  it('AC-8541.1: lib/gsheet/shapes의 설정 모양 = types/gsheet 설정 열쇠(기본값 열쇠·칸 글자·기호 번호까지)', () => {
    expect(sorted(DEFAULT_GSHEET_SETTINGS)).toEqual(sorted(SHAPE_SETTING_KEYS))
    expect(sorted(DEFAULT_GSHEET_SETTINGS.cols)).toEqual(sorted(SHAPE_COL_KEYS))
    expect(sorted(DEFAULT_GSHEET_SETTINGS.signs)).toEqual(sorted(SHAPE_SIGN_KEYS))
    expectTypeOf<Shapes.GsheetSettings>().toEqualTypeOf<GsheetSettings>()
    expectTypeOf<Shapes.GsheetPinned>().toEqualTypeOf<GsheetPinned>()
  })

  it('AC-8541.1: lib/gsheet/shapes의 넣은 기록·길·방식·결과 = types/gsheet 것', () => {
    expect(sorted(SHAPE_RUN_KEYS)).toEqual(sorted(TYPE_RUN_KEYS))
    expectTypeOf<Shapes.GsheetRun>().toEqualTypeOf<GsheetRun>()
    expectTypeOf<Shapes.FillVia>().toEqualTypeOf<(typeof GSHEET_VIAS)[number]>()
    expectTypeOf<Shapes.FillMode>().toEqualTypeOf<(typeof GSHEET_MODES)[number]>()
    expectTypeOf<Shapes.RunOutcome>().toEqualTypeOf<(typeof GSHEET_OUTCOMES)[number]>()
    expect([...GSHEET_VIAS]).toEqual(['auto', 'hand', 'evening', 'past'])
    expect([...GSHEET_MODES]).toEqual(['fillEmpty', 'overwrite'])
    expect([...GSHEET_OUTCOMES]).toEqual(['ok', 'warn', 'same', 'fail'])
  })
})

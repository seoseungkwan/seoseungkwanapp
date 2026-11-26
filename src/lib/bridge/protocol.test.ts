import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import commands from './commands.json'
import { EXTENSION_ID } from './extensionId'
import type { ArgsOf, CommandName, SheetCommand } from '@/types/bridge'
import {
  BridgeError,
  COMMANDS,
  PATIENT_COMMANDS,
  PROTOCOL,
  SEND_COMMANDS,
  SMALL_COMMANDS,
  checkResult,
  isErrorCode,
  isPatient,
  isSmallCommand,
} from './protocol'
import { CAL_HELPER, CAL_PAST_HELPER, LATEST_HELPER, MIN_EXTENSION, MIN_HELPER, SHEET_EXTENSION, SHEET_HELPER } from './versions'

describe('AC-004.1 확장 ID는 commands.json 한 곳에서', () => {
  it('AC-004.1 EXTENSION_ID는 commands.json의 extensionId 그대로다', () => {
    expect(EXTENSION_ID).toBe(commands.extensionId)
    expect(EXTENSION_ID).toMatch(/^[a-p]{32}$/)
  })

  it('AC-004.1 PROTOCOL은 commands.json의 protocol(1)이다', () => {
    expect(PROTOCOL).toBe(commands.protocol)
    expect(PROTOCOL).toBe(1)
  })
})

describe('AC-035.5 bit.input 묶음의 직접 확인 표시', () => {
  it('AC-035.5 items의 칸은 visitKey·chart·name·date·memo와 고르는 checkedByHand(참·거짓)다', () => {
    const payload = commands.commands['bit.input'].args.payload
    const fields = payload.fields.items.items.fields as Record<string, { type: string; optional?: boolean }>
    expect(Object.keys(fields).sort()).toEqual(['appends', 'chart', 'checkedByHand', 'date', 'memo', 'name', 'replaces', 'visitKey'])
    expect(fields.checkedByHand).toEqual({ type: 'bool', optional: true })
  })
})

describe('AC-037.1 bit.input 묶음의 승인한 비트 메모', () => {
  it('AC-037.1 replaces는 고르는 글자 칸이고 1~4,000자다(AC-016.1의 메모 한도)', () => {
    const fields = commands.commands['bit.input'].args.payload.fields.items.items.fields as Record<string, unknown>
    expect(fields.replaces).toEqual({ type: 'string', min: 1, max: 4000, optional: true })
  })

  it('AC-037.5 AC-037.1 명령 표 어디에도 묻지 않기 칸과 originals가 없다: 사이트는 켤 수도 쓸 수도 없다', () => {
    const table = JSON.stringify(commands.commands)
    expect(table).not.toMatch(/noAsk|no_ask|originals|previousMemo/i)
  })
})

describe('AC-036.1 bit.input 묶음의 처방코드', () => {
  const field = () => commands.commands['bit.input'].args.payload.fields.code
  const shape = () => new RegExp(field().pattern)

  it('AC-036.1 code는 고르는 글자 칸이고 도우미가 처방 코드를 읽을 때의 허용 목록과 같다', () => {
    expect(field()).toEqual({ type: 'string', min: 1, max: 20, pattern: '^[0-9A-Z][0-9A-Z.-]{0,19}$', optional: true })
    expect(commands.commands['bit.input'].args.payload.fields.items.min).toBe(1)
  })

  it('AC-036.1 코드 표 42개가 대문자로 모두 든다', () => {
    // 표 파일은 tables.ts만 import한다(AC-007.4). 시험은 파일 글자로 읽는다
    const codeMap = JSON.parse(readFileSync(new URL('../precheck/data/codeMap.json', import.meta.url), 'utf-8')) as Record<string, unknown>
    const codes = Object.keys(codeMap)
    expect(codes).toHaveLength(42)
    expect(codes.filter((code) => !shape().test(code.toUpperCase()))).toEqual([])
  })

  it.each(['', 'la358', '처방코드', ' LA358', 'LA358 ', 'LA 358', '.LA358', '-LA358', 'ABCDEFGHIJ0123456789X'])('AC-036.1 틀린 모양(%j)은 표에서 걸린다', (code) => {
    expect(shape().test(code)).toBe(false)
  })
})

describe('AC-004.5·AC-004.6·AC-004.9 명령 표 읽기', () => {
  const table = commands.commands as Record<string, { patient: boolean; send?: boolean }>

  it('AC-004.5 웹이 아는 명령 이름은 commands.json의 명령과 같다(빠짐·더함 없음)', () => {
    expect([...COMMANDS].sort()).toEqual(Object.keys(table).sort())
  })

  it.each(Object.keys(table))('AC-004.5 isPatient(%s)는 표의 patient 값이다', (cmd) => {
    expect(isPatient(cmd)).toBe(table[cmd].patient)
  })

  it('AC-004.5 모르는 명령은 환자 자료로 보지도 숫자 명령으로 보지도 않는다', () => {
    expect(isPatient('nope')).toBe(false)
    expect(isPatient('constructor')).toBe(false)
    expect(SMALL_COMMANDS).not.toContain('constructor')
  })

  it('AC-004.6 숫자·상태 명령은 hello를 뺀 patient:false 명령이다', () => {
    const small = Object.keys(table).filter((c) => !table[c].patient && c !== 'hello')
    expect([...SMALL_COMMANDS].sort()).toEqual(small.sort())
  })

  it('AC-004.5 조각으로 받는 환자 자료 명령은 patient:true이고 send가 아닌 명령이다', () => {
    const patient = Object.keys(table).filter((c) => table[c].patient && !table[c].send)
    expect([...PATIENT_COMMANDS].sort()).toEqual(patient.sort())
  })

  // spec patients-bit-lists: 새 명단 둘은 명령 이름을 더하지 않고 contact.targets의 kind 값만 더한다(크롬 확장은 명령 이름만 본다)
  // spec clinic-calendar: 예약 탭 비트 찾기·접수와 비트 예약도 kind 값(calfind·calday)과 선택 칸 q만 더한다(확장 새 판 없음)
  it('AC-2801.5·AC-4902.1·AC-5903.4 contact.targets kind 값은 followup·injection·lapsed·reservation·sunap·calfind·calday이고 칸은 kind·from·to + 선택 q(글자 1~20), 명령 이름은 그대로(환자 자료 조각 명령)다', () => {
    const targets = commands.commands['contact.targets']
    expect(targets.args.kind).toEqual({ type: 'enum', values: ['followup', 'injection', 'lapsed', 'reservation', 'sunap', 'calfind', 'calday'] })
    expect(Object.keys(targets.args)).toEqual(['kind', 'from', 'to', 'q'])
    expect((targets.args as Record<string, unknown>).q).toEqual({ type: 'string', min: 1, max: 20, optional: true })
    expect(targets.maxDays).toBe(1100)
    expect(COMMANDS).toContain('contact.targets')
    expect(PATIENT_COMMANDS).toContain('contact.targets')
    expect(Object.keys(table).filter((c) => c.startsWith('contact.'))).toEqual(['contact.targets'])
  })

  // spec sunap-ilji: 수납일지 고친 칸은 달 파일의 새 칸 sunap으로 저장한다(새 명령 없음)
  it('AC-4902.5 store.save payload 칸은 month·drafts·done·journal·sunap·contact·settings이고 sunap은 고르는 객체 칸이다', () => {
    const fields = commands.commands['store.save'].args.payload.fields as Record<string, unknown>
    expect(Object.keys(fields)).toEqual(['month', 'drafts', 'done', 'journal', 'sunap', 'contact', 'settings'])
    expect(fields.sunap).toEqual({ type: 'json', of: 'object', optional: true })
  })

  it('AC-004.9 보내는 명령은 store.save·bit.input 둘이다(표의 send:true)', () => {
    const send = Object.keys(table).filter((c) => table[c].send)
    expect([...SEND_COMMANDS].sort()).toEqual(['bit.input', 'store.save'])
    expect(send.sort()).toEqual(['bit.input', 'store.save'])
  })
})

describe('AC-004.6 오류 번호 모양', () => {
  it.each(['E-BRIDGE-BAD-REPLY', 'E-HELPER-MISSING', 'E-BIT-NOT-FOUND', 'E-X1'])('AC-004.6 %s는 오류 번호다', (code) => {
    expect(isErrorCode(code)).toBe(true)
  })

  it.each(['', 'E-', 'e-bridge', 'E-BRIDGE-', 'E--X', 'E-BRIDGE\n', 'E-가상환자01', `E-${'A'.repeat(70)}`, 1, null])(
    'AC-004.6 %j는 오류 번호가 아니다',
    (code) => {
      expect(isErrorCode(code)).toBe(false)
    },
  )

  it('AC-004.6 BridgeError는 번호만 싣는다', () => {
    const e = new BridgeError('E-BRIDGE-BAD-REPLY')
    expect(e).toBeInstanceOf(Error)
    expect(e.code).toBe('E-BRIDGE-BAD-REPLY')
    expect(e.message).toBe('E-BRIDGE-BAD-REPLY')
  })
})

// spec google-link TASK-10(REQ-8511·REQ-8541): 도우미 0.14.0 수납 명령 여덟 + 크롬 확장 0.5.0(새 명령표로 다시 묶음)
describe('AC-8511.1 수납 명령 여덟(sheet.*) — commands.json 모양', () => {
  const SHEET = ['sheet.status', 'sheet.code', 'sheet.link', 'sheet.import', 'sheet.ping', 'sheet.catalog', 'sheet.months', 'sheet.fill'] as const
  type Spec = { patient: boolean; send?: boolean; confirm?: boolean; maxDays?: number; args: Record<string, unknown> }
  const table = commands.commands as Record<string, Spec>
  const SETTINGS = { type: 'json', of: 'object' }

  it('AC-8511.1 commands.json에 sheet.* 여덟이 그 차례로 revenue.days 뒤에 있고 모두 patient:false·send 아님이다', () => {
    const names = Object.keys(table)
    expect(names.filter((c) => c.startsWith('sheet.'))).toEqual([...SHEET])
    expect(names.indexOf('sheet.status')).toBe(names.indexOf('revenue.days') + 1)
    for (const name of SHEET) {
      expect(table[name].patient, name).toBe(false)
      expect(table[name].send, name).toBeUndefined()
      expect(table[name].maxDays, name).toBeUndefined()
      expect(COMMANDS).toContain(name)
      expect(PATIENT_COMMANDS).not.toContain(name)
      expect(SEND_COMMANDS).not.toContain(name)
    }
  })

  it('AC-8511.1 confirm:true는 sheet.link 하나이고(확인 창은 도우미가 띄움), 주소·메일 칸(url·shareWith)도 sheet.link에만 있다', () => {
    expect(SHEET.filter((c) => table[c].confirm === true)).toEqual(['sheet.link'])
    for (const name of SHEET) {
      if (name === 'sheet.link') continue
      expect(table[name], name).not.toHaveProperty('confirm')
      const keys = Object.keys(table[name].args)
      for (const forbidden of ['url', 'shareWith', 'scriptUrl', 'webAppUrl', 'token', 'secret']) expect(keys, name).not.toContain(forbidden)
    }
  })

  it('AC-8511.1 args 모양: status·code·import {} · link {url 1~600자, shareWith 메일 0~10개} · ping {settings} · catalog {hospital?} · months {settings, months 1~13개} · fill {day, mode, auto, settings}', () => {
    expect(table['sheet.status'].args).toEqual({})
    expect(table['sheet.code'].args).toEqual({})
    expect(table['sheet.import'].args).toEqual({})
    const link = table['sheet.link'].args as Record<string, Record<string, unknown>>
    expect(Object.keys(link)).toEqual(['url', 'shareWith'])
    expect(link.url).toEqual({ type: 'string', min: 1, max: 600 })
    expect(link.shareWith).toMatchObject({ type: 'array', min: 0, max: 10, items: { type: 'string', min: 6, max: 254 } })
    const mail = new RegExp(String((link.shareWith.items as { pattern: string }).pattern))
    expect(mail.test('desk@fake.test')).toBe(true)
    for (const bad of ['not-a-mail', 'a@b', 'desk@fake.test' + String.fromCharCode(10), 'des k@fake.test', '가상@fake.test', 'desk@@fake.test']) expect(mail.test(bad), bad).toBe(false)
    expect(table['sheet.ping'].args).toEqual({ settings: SETTINGS })
    expect(table['sheet.catalog'].args).toEqual({ hospital: { type: 'string', min: 1, max: 32, optional: true } })
    expect(table['sheet.months'].args).toEqual({ settings: SETTINGS, months: { type: 'array', min: 1, max: 13, items: { type: 'month' } } })
    expect(table['sheet.fill'].args).toEqual({
      day: { type: 'date' },
      mode: { type: 'enum', values: ['fillEmpty', 'overwrite'] },
      auto: { type: 'bool' },
      settings: SETTINGS,
    })
  })

  it('AC-8511.1 types/bridge.ts의 SheetCommand·ArgsOf가 명령 표와 같은 모양이다', () => {
    const names: readonly SheetCommand[] = SHEET
    const asCommand: readonly CommandName[] = names
    expect(asCommand).toHaveLength(8)
    const fill: ArgsOf<'sheet.fill'> = { day: '2026-10-30', mode: 'fillEmpty', auto: true, settings: {} }
    const link: ArgsOf<'sheet.link'> = { url: 'https://script.google.com/macros/s/AKfycbFAKE0123456789/exec', shareWith: [] }
    const months: ArgsOf<'sheet.months'> = { settings: {}, months: ['2026-10'] }
    const catalog: ArgsOf<'sheet.catalog'> = {}
    expect(Object.keys(fill)).toEqual(Object.keys(table['sheet.fill'].args))
    expect(Object.keys(link)).toEqual(Object.keys(table['sheet.link'].args))
    expect(Object.keys(months)).toEqual(Object.keys(table['sheet.months'].args))
    expect(catalog).toEqual({})
  })

  // TASK-23 (라): 통로가 sheet.* 답을 모두 E-BRIDGE-BAD-REPLY로 거절하던 것(checkResult에 경우 없음)을 고친다 — 명령마다 정해 둔 읽기 함수로 본다
  it('AC-004.6 checkResult는 sheet.* 여덟마다 검사가 있다 — 맞는 답은 참, 빈 묶음·판(v) 없는 답은 거짓', () => {
    const TAG = '0123456789abcdef'
    const good: Record<SheetCommand, unknown> = {
      'sheet.status': { v: 1, secretTag: null, bitsheet: false, codeVersion: '0', url: null, shareWith: [], verified: false },
      'sheet.code': { v: 1, secretTag: TAG, codeVersion: '8' },
      'sheet.link': { v: 1, ok: true },
      'sheet.import': { v: 1, secretTag: TAG, settings: {} },
      'sheet.ping': { v: 1, ok: false, code: 'E-GSHEET-NET' },
      'sheet.catalog': { v: 1, hospitals: [], depts: [], rx: [], hospitalName: '' },
      'sheet.months': { v: 1, version: '8', months: [] },
      'sheet.fill': { v: 1, unchanged: true, rows: 0 },
    }
    for (const cmd of SHEET) {
      expect(isSmallCommand(cmd), cmd).toBe(true)
      expect(checkResult(cmd, good[cmd]), cmd).toBe(true)
      expect(checkResult(cmd, {}), cmd).toBe(false)
      expect(checkResult(cmd, { ...(good[cmd] as object), v: undefined }), cmd).toBe(false)
      expect(checkResult(cmd, null), cmd).toBe(false)
    }
  })
})

describe('AC-8511.1·AC-8541.2 판 글자 — 도우미 0.14.0 · 크롬 확장 0.5.0', () => {
  const root = new URL('../../../', import.meta.url)

  it('AC-8511.1 LATEST_HELPER·SHEET_HELPER·CAL_PAST_HELPER는 0.14.0이고 helper/Directory.Build.props와 같다', () => {
    expect(LATEST_HELPER).toBe('0.14.0')
    expect(SHEET_HELPER).toBe('0.14.0')
    expect(CAL_PAST_HELPER).toBe('0.14.0')
    const props = readFileSync(new URL('helper/Directory.Build.props', root), 'utf8')
    expect(props.match(/<Version>([^<]+)<\/Version>/)?.[1]).toBe(LATEST_HELPER)
  })

  it('AC-8511.1 SHEET_EXTENSION은 0.5.0이고 extension/manifest.json version과 같다', () => {
    expect(SHEET_EXTENSION).toBe('0.5.0')
    const manifest = JSON.parse(readFileSync(new URL('extension/manifest.json', root), 'utf8')) as { version: string }
    expect(manifest.version).toBe(SHEET_EXTENSION)
  })

  it('AC-8541.2 MIN_HELPER·MIN_EXTENSION은 그대로(0.3.0·0.1.0) — 옛 도우미·확장 PC도 다른 도구는 막지 않는다, 예약 탭 비트 읽기 판(CAL_HELPER 0.10.0)도 그대로', () => {
    expect(MIN_HELPER).toBe('0.3.0')
    expect(MIN_EXTENSION).toBe('0.1.0')
    expect(CAL_HELPER).toBe('0.10.0')
    expect(SHEET_HELPER.localeCompare('0.13.2', undefined, { numeric: true })).toBeGreaterThan(0)
    expect(SHEET_EXTENSION.localeCompare('0.4.0', undefined, { numeric: true })).toBeGreaterThan(0)
  })
})

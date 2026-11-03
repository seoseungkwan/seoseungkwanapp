import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import commands from './commands.json'
import { EXTENSION_ID } from './extensionId'
import {
  BridgeError,
  COMMANDS,
  PATIENT_COMMANDS,
  PROTOCOL,
  SEND_COMMANDS,
  SMALL_COMMANDS,
  isErrorCode,
  isPatient,
} from './protocol'

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
    expect(Object.keys(fields).sort()).toEqual(['chart', 'checkedByHand', 'date', 'memo', 'name', 'replaces', 'visitKey'])
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

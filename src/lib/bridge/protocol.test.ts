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

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_EMR, EMR_KINDS } from '@/types/clinicProfile'
import { EMR_LABEL, EMR_WITH_RO, emrWaitTitle, isEmrKind } from './emrText'

// 쓰는 EMR 글자 한 곳(spec emr-choice design.md 1절, TASK-3). 대시보드·연결 화면·병원 정보 칸이 같이 쓴다. 순수 글자라 React·네트워크를 쓰지 않는다

describe('AC-7102.1 쓰는 EMR 값', () => {
  it("AC-7102.1: 쓰는 EMR은 'bit'·'uisarang'·'egis'·'other' 넷이고 기본값은 'bit'다", () => {
    expect([...EMR_KINDS]).toEqual(['bit', 'uisarang', 'egis', 'other'])
    expect(DEFAULT_EMR).toBe('bit')
  })

  it('AC-7102.1: isEmrKind는 넷만 참이다(대소문자·빈칸·다른 모양은 거짓)', () => {
    for (const kind of EMR_KINDS) expect(isEmrKind(kind), kind).toBe(true)
    for (const wrong of ['BIT', ' bit', 'Uisarang', 'ubcare', '', null, undefined, 0, {}, ['bit']]) expect(isEmrKind(wrong), JSON.stringify(wrong)).toBe(false)
  })

  it("AC-7102.1: 단추 글은 '비트'·'의사랑'·'이지스'·'그 밖의 EMR'이다", () => {
    expect(EMR_LABEL).toEqual({ bit: '비트', uisarang: '의사랑', egis: '이지스', other: '그 밖의 EMR' })
  })
})

describe('AC-7102.3 비트가 아닌 병원의 안내 글', () => {
  it.each([
    ['uisarang', '의사랑 연결은 준비하고 있어요'],
    ['egis', '이지스 연결은 준비하고 있어요'],
    ['other', '우리 병원 EMR은 아직 연결할 수 없어요'],
  ] as const)('AC-7102.3: %s의 안내 제목은 "%s"다', (emr, title) => {
    expect(emrWaitTitle(emr)).toBe(title)
  })

  it("AC-7102.3: '…으로/로 되어 있어요'에 쓰는 말은 '의사랑으로'·'이지스로'·'그 밖의 EMR로'다", () => {
    expect(EMR_WITH_RO).toEqual({ uisarang: '의사랑으로', egis: '이지스로', other: '그 밖의 EMR로' })
  })

  it('AC-7102.3: 글은 한 파일(lib/clinic/emrText.ts)에 있고 React·네트워크·저장소를 쓰지 않는다', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/clinic/emrText.ts'), 'utf8')
    for (const word of ['react', 'supabase', '@/lib/storage', 'fetch(', 'localStorage', 'console.']) expect(source, word).not.toContain(word)
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_TEMPLATES, DEFAULT_TEMPLATE_NOTE } from './defaults'

// 골든 시험: 원본(seoseungkwan/shared@2a1069b)의 TPLS를 그대로 적은 fixtures/patients/golden/messages-defaults.json과 견준다.
// 원본 결과는 scripts/patients/golden/messages.mjs가 만든다(원본은 저장소 밖).
// 일부러 다르게 한 것은 골든 파일의 knownDiffs에 이유와 함께 적은 칸뿐이다.

type KnownDiff = { entry: string; field: string; reason: string; cases?: Record<string, unknown> }
type DefaultsGolden = {
  source: string
  file: string
  entry: string[]
  knownDiffs: KnownDiff[]
  TPLS: { id: string; name: string; note: string; text: string }[]
}

const ROOT = new URL('../../../', import.meta.url)
const golden = JSON.parse(
  readFileSync(new URL('fixtures/patients/golden/messages-defaults.json', ROOT), 'utf8'),
) as DefaultsGolden

// Postgres char_length처럼 글자 수를 센다(표 제약과 같은 기준)
const charLength = (text: string) => [...text].length

describe('AC-608.2 DEFAULT_TEMPLATES: 원본 TPLS와 같다 (골든)', () => {
  it('AC-608.2 골든 머리에 원본 파일과 커밋을 적어 둔다', () => {
    expect(golden.source).toBe('seoseungkwan/shared@2a1069b')
    expect(golden.file).toBe('YangjiBareun_사전점검/assets/message_templates.html')
    expect(golden.entry).toEqual(['TPLS'])
    expect(golden.TPLS.map(({ id }) => id)).toEqual(['jusa', 'jinryo'])
  })

  it('AC-608.2 이름·글이 순서까지 원본 그대로다', () => {
    expect(DEFAULT_TEMPLATES.map(({ name, body }) => ({ name, body }))).toEqual(
      golden.TPLS.map(({ name, text }) => ({ name, body: text })),
    )
  })

  it('AC-608.2 jusa는 injection(0) 주사 안내, jinryo는 followup(1) 진료 안내', () => {
    expect(DEFAULT_TEMPLATES.map(({ kind, name, sort_order }) => ({ kind, name, sort_order }))).toEqual([
      { kind: 'injection', name: '주사 안내', sort_order: 0 },
      { kind: 'followup', name: '진료 안내', sort_order: 1 },
    ])
  })

  it('AC-608.2 원본 note는 표에 칸이 없어 DEFAULT_TEMPLATE_NOTE로 내보낸다', () => {
    expect(golden.TPLS.map(({ note }) => note)).toEqual([DEFAULT_TEMPLATE_NOTE, DEFAULT_TEMPLATE_NOTE])
    for (const template of DEFAULT_TEMPLATES) expect(template).not.toHaveProperty('note')
  })

  it('AC-608.2 knownDiffs: 일부러 다르게 한 것은 id와 note뿐이고 사례가 코드와 같다', () => {
    expect(golden.knownDiffs.map(({ entry, field }) => `${entry}:${field}`)).toEqual(['TPLS:id', 'TPLS:note'])
    for (const { reason } of golden.knownDiffs) expect(reason).toBeTruthy()

    const [id, note] = golden.knownDiffs
    expect(id.cases).toEqual({
      jusa: { kind: 'injection', sort_order: 0 },
      jinryo: { kind: 'followup', sort_order: 1 },
    })
    expect(note.cases).toEqual({ DEFAULT_TEMPLATE_NOTE })
  })
})

describe('AC-608.2 DEFAULT_TEMPLATES: 표 제약 안이다', () => {
  it.each(DEFAULT_TEMPLATES.map((template) => [template.name, template] as const))(
    'AC-608.2 %s: 이름 1~30자, 글 1~2000자, 순서 0~99, 종류는 둘 중 하나',
    (_name, template) => {
      expect(charLength(template.name)).toBeGreaterThanOrEqual(1)
      expect(charLength(template.name)).toBeLessThanOrEqual(30)
      expect(charLength(template.body)).toBeGreaterThanOrEqual(1)
      expect(charLength(template.body)).toBeLessThanOrEqual(2000)
      expect(Number.isInteger(template.sort_order)).toBe(true)
      expect(template.sort_order).toBeGreaterThanOrEqual(0)
      expect(template.sort_order).toBeLessThanOrEqual(99)
      expect(['injection', 'followup']).toContain(template.kind)
    },
  )

  it('AC-608.2 자리 표시는 원본의 [*1*]·[*2*]·<<DATE>>뿐이다', () => {
    for (const { body } of DEFAULT_TEMPLATES) {
      expect(body).toContain('[*1*]')
      expect(body).toContain('[*2*]')
      expect(body).toContain('<<DATE>>')
      expect(body).not.toMatch(/\{[^}]*\}/)
      expect(body.match(/\[\*[^*]*\*\]/g)?.every((mark) => mark === '[*1*]' || mark === '[*2*]')).toBe(true)
    }
  })
})

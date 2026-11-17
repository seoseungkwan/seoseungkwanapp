import { describe, expect, it } from 'vitest'
import { DEFAULT_RSV_KINDS, DEFAULT_RSV_WORDS, type RsvKindDef } from '@/types/sunap'
import {
  FIXED_LABELS,
  isFixedKind,
  isHandKind,
  isKindId,
  KIND_ID,
  KIND_MAX,
  kindsFromLegacy,
  LABEL_MAX,
  newKindId,
  readKinds,
  splitWords,
  WORD_MAX,
  WORDS_TEXT_MAX,
} from './kinds'

// 다음 예약 종류 목록 규칙(spec sunap-kinds REQ-5501·AC-5502.4). 이름·말은 지어낸 값

const KINDS: RsvKindDef[] = [
  { id: 'inj', label: '주사치료', counts: true, words: ['주사', '블록'] },
  { id: 'visit', label: '진료(경과)', counts: true, words: ['경과', '진료'] },
  { id: 'kdosu01', label: '도수치료', counts: true, words: ['도수'] },
  { id: 'etc', label: '기타', counts: false, words: ['기타'] },
]
/** KINDS의 n번째 칸만 바꾼 목록(받은 목록은 그대로) */
const withKind = (at: number, over: Record<string, unknown>): unknown[] => KINDS.map((kind, i) => (i === at ? { ...kind, ...over } : kind))
const extra = (n: number): RsvKindDef[] =>
  Array.from({ length: n }, (_, i) => ({ id: `kextra${i}`, label: `새 종류 ${i}`, counts: false, words: [] }))

describe('AC-5501.1 기본 종류 목록·옛 말 목록', () => {
  it('AC-5501.1: 기본값은 주사치료(inj, ○, 주사·블록) → 진료(경과)(visit, ○, 경과·진료) → 기타(etc, ✕, 기타)', () => {
    expect(DEFAULT_RSV_KINDS).toEqual([
      { id: 'inj', label: '주사치료', counts: true, words: ['주사', '블록'] },
      { id: 'visit', label: '진료(경과)', counts: true, words: ['경과', '진료'] },
      { id: 'etc', label: '기타', counts: false, words: ['기타'] },
    ])
    expect(readKinds(DEFAULT_RSV_KINDS)).toEqual(DEFAULT_RSV_KINDS)
  })

  it('AC-5501.1: 옛 말 모양(DEFAULT_RSV_WORDS)은 그대로 남는다(DB 기본값과 같다)', () => {
    expect(DEFAULT_RSV_WORDS).toEqual({ inj: ['주사', '블록'], visit: ['경과', '진료'], etc: ['기타'] })
  })

  it('AC-5501.1: kindsFromLegacy는 기본 이름·예약률에 옛 말 목록을 넣는다', () => {
    expect(kindsFromLegacy({ inj: ['Inj', '블록'], visit: [], etc: ['서류'] })).toEqual([
      { id: 'inj', label: '주사치료', counts: true, words: ['Inj', '블록'] },
      { id: 'visit', label: '진료(경과)', counts: true, words: [] },
      { id: 'etc', label: '기타', counts: false, words: ['서류'] },
    ])
    expect(kindsFromLegacy(DEFAULT_RSV_WORDS)).toEqual(DEFAULT_RSV_KINDS)
  })

  it('AC-5501.1: kindsFromLegacy는 받은 말 목록·기본값을 바꾸거나 같이 쓰지 않는다', () => {
    const words = { inj: ['주사'], visit: ['경과'], etc: ['기타'] }
    const kinds = kindsFromLegacy(words)
    kinds[0].words.push('바뀜')
    kinds[1].label = '바뀜'
    expect(words).toEqual({ inj: ['주사'], visit: ['경과'], etc: ['기타'] })
    expect(DEFAULT_RSV_KINDS[1].label).toBe('진료(경과)')
    expect(kindsFromLegacy(DEFAULT_RSV_WORDS)[0].words).not.toBe(DEFAULT_RSV_WORDS.inj)
  })

  it('AC-5501.1: 옛 말에 새 규칙에 안 맞는 말(빈 말·21자·겹친 말·이은 글 40자 넘음)이 있어도 맞는 목록을 만든다(Worker가 load를 거절하지 않게)', () => {
    const long = 'ㄱ'.repeat(21)
    const kinds = kindsFromLegacy({
      inj: ['  주사 ', '', '   ', long, 'INJ', 'inj'],
      visit: ['가'.repeat(15), '나'.repeat(15), '다'.repeat(15), '라'.repeat(5)],
      etc: ['기타'],
    })
    expect(kinds[0].words).toEqual(['주사', 'INJ'])
    // 15 + 2 + 15 = 32자, 셋째(15자)를 넣으면 49자라 빼고, 넷째(5자)는 39자라 넣는다
    expect(kinds[1].words).toEqual(['가'.repeat(15), '나'.repeat(15), '라'.repeat(5)])
    expect(readKinds(kinds)).toEqual(kinds)
  })
})

describe('AC-5501.2 readKinds — 저장·Worker가 받는 종류 목록 검사', () => {
  it('AC-5501.2: 맞는 목록이면 같은 값의 새 배열(목록·말 목록 모두 복사)이다', () => {
    const read = readKinds(KINDS)
    expect(read).toEqual(KINDS)
    expect(read).not.toBe(KINDS)
    expect(read?.[0]).not.toBe(KINDS[0])
    expect(read?.[0].words).not.toBe(KINDS[0].words)
  })

  it('AC-5501.2: 받은 목록을 바꾸지 않는다', () => {
    const input = structuredClone(withKind(2, { label: ' 도수치료 ', words: [' 도수 '] }))
    const copy = structuredClone(input)
    readKinds(input)
    expect(input).toEqual(copy)
  })

  it('AC-5501.2: 기본 셋은 어느 자리에 있어도 된다(차례 그대로)', () => {
    const moved = [KINDS[3], KINDS[2], KINDS[1], KINDS[0]]
    expect(readKinds(moved)?.map((kind) => kind.id)).toEqual(['etc', 'kdosu01', 'visit', 'inj'])
  })

  it('AC-5501.2: 종류는 3~10개다(2개·11개는 틀림)', () => {
    expect(readKinds(DEFAULT_RSV_KINDS)).not.toBeNull()
    expect(readKinds([...DEFAULT_RSV_KINDS, ...extra(7)])).toHaveLength(10)
    expect(readKinds([...DEFAULT_RSV_KINDS, ...extra(8)])).toBeNull()
    expect(readKinds([])).toBeNull()
  })

  it.each<[string, unknown]>([
    ['목록 아님(객체)', { kinds: KINDS }],
    ['null', null],
    ['undefined', undefined],
    ['글자', 'inj'],
    ['칸이 객체 아님', [...KINDS.slice(0, 3), 'etc']],
    ['칸이 배열', [...KINDS.slice(0, 3), ['etc', '기타', false, []]]],
    ['etc 없음', KINDS.slice(0, 3).concat({ id: 'kother1', label: '그 밖', counts: false, words: [] })],
    ['inj 두 번', withKind(2, { id: 'inj' })],
    ['visit 없음(새 종류로 바꿈)', withKind(1, { id: 'kvisit1' })],
    ['새 종류 id 겹침', [...KINDS, { id: 'kdosu01', label: '도수 2', counts: false, words: [] }]],
    ['id 5자', withKind(2, { id: 'k12345' })],
    ['id 7자', withKind(2, { id: 'k1234567' })],
    ['id 대문자', withKind(2, { id: 'kDOSU01' })],
    ['id k로 시작 안 함', withKind(2, { id: 'xdosu01' })],
    ['id none', withKind(2, { id: 'none' })],
    ['id unknown', withKind(2, { id: 'unknown' })],
    ['id 숫자', withKind(2, { id: 1 })],
    ['id 없음', withKind(2, { id: undefined })],
  ])('AC-5501.2: id가 틀리면(%s) null', (_label, input) => {
    expect(readKinds(input)).toBeNull()
  })

  it.each<[string, unknown]>([
    ['빈 이름', ''],
    ['빈칸뿐', '   '],
    ['11자', '가'.repeat(LABEL_MAX + 1)],
    ['앞뒤 빈칸 빼고 11자', ` ${'가'.repeat(11)} `],
    ['늘 있는 줄 이름(예약 안 하고 가심)', '예약 안 하고 가심'],
    ['늘 있는 줄 이름(종류 모름, 앞뒤 빈칸)', ' 종류 모름 '],
    ['다른 종류와 같은 이름', '주사치료'],
    ['앞뒤 빈칸 빼면 같은 이름', ' 기타  '],
    ['숫자', 7],
    ['없음', undefined],
  ])('AC-5501.2: 이름이 틀리면(%s) null', (_label, label) => {
    expect(readKinds(withKind(2, { label }))).toBeNull()
  })

  it('AC-5501.2: 이름은 앞뒤 빈칸을 뺀 1~10자이고, 읽은 값은 앞뒤 빈칸을 뺀 이름이다', () => {
    expect(readKinds(withKind(2, { label: '가'.repeat(LABEL_MAX) }))?.[2].label).toBe('가'.repeat(10))
    expect(readKinds(withKind(2, { label: `  ${'가'.repeat(10)}  ` }))?.[2].label).toBe('가'.repeat(10))
    expect(readKinds(withKind(2, { label: 'A' }))?.[2].label).toBe('A')
  })

  it.each<[string, unknown]>([
    ['글자', 'true'],
    ['숫자', 1],
    ['없음', undefined],
    ['null', null],
  ])('AC-5501.2: counts가 참/거짓이 아니면(%s) null', (_label, counts) => {
    expect(readKinds(withKind(0, { counts }))).toBeNull()
  })

  it.each<[string, unknown]>([
    ['배열 아님', '도수'],
    ['없음', undefined],
    ['말에 숫자', ['도수', 1]],
    ['빈 말', ['도수', '']],
    ['빈칸뿐인 말', ['   ']],
    ['21자 말', ['ㄱ'.repeat(WORD_MAX + 1)]],
    ['","로 이은 글 41자', ['ㄱ'.repeat(20), 'ㄴ'.repeat(20)]],
    ['짧은 말이 많아 ","로 이은 글 41자', Array.from({ length: 21 }, (_, i) => String.fromCharCode(0xac00 + i))],
  ])('AC-5501.2: 말이 틀리면(%s) null', (_label, words) => {
    expect(readKinds(withKind(2, { words }))).toBeNull()
  })

  it('AC-5501.2: 말은 앞뒤 빈칸 뺀 1~20자, 한 종류의 말을 ","로 이은 글이 40자 이하면 맞고, 읽은 값은 앞뒤 빈칸을 뺀 말이다', () => {
    expect(readKinds(withKind(2, { words: ['ㄱ'.repeat(20)] }))?.[2].words).toEqual(['ㄱ'.repeat(20)])
    // 19 + ',' + 19 = 39자
    expect(readKinds(withKind(2, { words: ['ㄱ'.repeat(19), 'ㄴ'.repeat(19)] }))?.[2].words).toHaveLength(2)
    // 앞뒤 빈칸은 세지 않는다: 20 + 1 + 18 = 39자
    expect(readKinds(withKind(2, { words: [`  ${'ㄱ'.repeat(20)} `, ` ${'ㄴ'.repeat(18)} `] }))?.[2].words).toEqual([
      'ㄱ'.repeat(20),
      'ㄴ'.repeat(18),
    ])
    expect(WORDS_TEXT_MAX).toBe(40)
  })

  it('AC-5501.2: 말이 빈 목록인 종류도 맞다(직접 고를 때만 씀). 같은 말이 두 종류에 있어도 막지 않는다', () => {
    expect(readKinds(withKind(2, { words: [] }))?.[2].words).toEqual([])
    expect(readKinds(withKind(2, { words: ['주사'] }))?.[2].words).toEqual(['주사'])
  })

  it('AC-5501.2: 칸의 다른 열쇠는 옮기지 않고 {id, label, counts, words}만 둔다', () => {
    const read = readKinds(withKind(2, { color: 'red', __proto__: { x: 1 } }))
    expect(Object.keys(read?.[2] ?? {})).toEqual(['id', 'label', 'counts', 'words'])
  })

  it('AC-5501.2: 한도 숫자는 명세와 같다(종류 10개·이름 10자·말 20자·이은 글 40자·늘 있는 줄 이름 둘)', () => {
    expect([KIND_MAX, LABEL_MAX, WORD_MAX, WORDS_TEXT_MAX]).toEqual([10, 10, 20, 40])
    expect(FIXED_LABELS).toEqual(['예약 안 하고 가심', '종류 모름'])
  })

  it('AC-5501.2: 가장 긴 목록(10종류·이름 10자·말 40자)도 서버 칸 한도 4,000바이트 안이다', () => {
    const word = '가'.repeat(19)
    const kinds = [...DEFAULT_RSV_KINDS, ...extra(7)].map((kind, i) => ({
      ...kind,
      label: `${'가'.repeat(9)}${i}`,
      words: [word, word.replace(/^가/, '나')],
    }))
    const read = readKinds(kinds)
    expect(read).toHaveLength(10)
    expect(new TextEncoder().encode(JSON.stringify({ kinds: read })).length).toBeLessThan(4000)
  })
})

describe('AC-5501.2 newKindId — 새 종류 id', () => {
  it('AC-5501.2: k + 영문 소문자·숫자 6자이고 readKinds가 받는 모양이다', () => {
    for (let i = 0; i < 50; i++) {
      const id = newKindId([])
      expect(id).toMatch(/^k[a-z0-9]{6}$/)
      expect(isKindId(id)).toBe(true)
    }
  })

  it('AC-5501.2: 받은 random으로 글자를 고른다(0 → 0, 0.9999 → z)', () => {
    expect(newKindId([], () => 0)).toBe('k000000')
    expect(newKindId([], () => 0.9999)).toBe('kzzzzzz')
  })

  it('AC-5501.2: 이미 있는 id와 겹치면 다시 만든다', () => {
    const values = [0, 0, 0, 0, 0, 0, 0.9999, 0.9999, 0.9999, 0.9999, 0.9999, 0.9999]
    let at = 0
    expect(newKindId(['k000000'], () => values[at++])).toBe('kzzzzzz')
  })

  it('AC-5501.2: random이 늘 같은 값을 내도 겹치지 않는 id를 돌려준다(멈추지 않는다)', () => {
    const taken = ['inj', 'visit', 'etc', 'k000000', 'k000001']
    const id = newKindId(taken, () => 0)
    expect(id).toMatch(KIND_ID)
    expect(taken).not.toContain(id)
  })
})

describe('AC-5501.3 splitWords — 쉼표로 나눈 말 칸 글 다듬기', () => {
  it.each<[string, string[]]>([
    ['도수, 수기', ['도수', '수기']],
    ['도수,수기', ['도수', '수기']],
    ['도수，수기', ['도수', '수기']],
    ['  도수 ， 수기 ,경과  ', ['도수', '수기', '경과']],
    ['주사', ['주사']],
    ['', []],
    ['   ', []],
    [' , ，, ', []],
    ['도수,,, 수기,', ['도수', '수기']],
  ])('AC-5501.3: "%s" → %j (앞뒤 빈칸 빼고 빈 말 버림)', (text, words) => {
    expect(splitWords(text)).toEqual(words)
  })

  it('AC-5501.3: 겹친 말은 영문 대소문자를 가리지 않고 처음 하나만 남긴다', () => {
    expect(splitWords('Inj, INJ, inj , 주사, 주사')).toEqual(['Inj', '주사'])
    expect(splitWords('F/U, f/u, 경과')).toEqual(['F/U', '경과'])
  })
})

describe('AC-5502.4 종류 id 모양 — 직접 고르기·마감 고정값', () => {
  it.each(['inj', 'visit', 'etc', 'kdosu01', 'k000000', 'kzzzzzz'])('AC-5502.4: %s는 종류 id다', (id) => {
    expect(isKindId(id)).toBe(true)
    expect(isHandKind(id)).toBe(true)
    expect(isFixedKind(id)).toBe(true)
  })

  it.each<unknown>(['none', 'unknown', 'k12345', 'k1234567', 'kDOSU01', 'INJ', 'Inj', 'x123456', '', ' inj', 1, null, undefined, ['inj']])(
    'AC-5502.4: %j는 종류 id가 아니다',
    (x) => {
      expect(isKindId(x)).toBe(false)
    },
  )

  it("AC-5502.4: 직접 고르기는 'none'이나 종류 id, 고정값은 거기에 'unknown'까지", () => {
    expect(isHandKind('none')).toBe(true)
    expect(isHandKind('unknown')).toBe(false)
    expect(isFixedKind('none')).toBe(true)
    expect(isFixedKind('unknown')).toBe(true)
    for (const bad of ['x', 'k12345', 'NONE', '', 0, null]) {
      expect(isHandKind(bad)).toBe(false)
      expect(isFixedKind(bad)).toBe(false)
    }
  })
})

// ── 2026-11-17 검토 고침: 말 길이는 ','로 이은 글로 잰다(말 칸 40자 안에서 적은 글은 다듬은 뒤에도 늘 맞게) ─────────
describe('AC-5501.2 말 길이는 ","로 이은 글', () => {
  it('AC-5501.2: 띄어쓰기 없이 쉼표로 적은 37자 말(", "로 이으면 44자)도 맞고, ","로 이어 41자면 아니다', () => {
    const words = ['도수치료', '수기치료', '도수', '수기', '체외충격파', '충격파', 'ESWT', 'manual']
    expect(words.join(',')).toHaveLength(37)
    expect(readKinds(withKind(2, { words }))?.[2].words).toEqual(words)
    expect(readKinds(withKind(2, { words: ['ㄱ'.repeat(20), 'ㄴ'.repeat(20)] }))).toBeNull()
    expect(readKinds(withKind(2, { words: ['ㄱ'.repeat(20), 'ㄴ'.repeat(19)] }))?.[2].words).toHaveLength(2)
  })

  it('AC-5501.2·AC-5501.3: 40자 안에서 쉼표(,·，)로 적은 어떤 글도 splitWords로 다듬으면 readKinds가 받는다', () => {
    const texts = ['a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t', '도수치료,수기치료,도수,수기,체외충격파,충격파,ESWT,manual', ` 가 ，나 , 다,,라 ,${'ㅁ'.repeat(20)}`]
    for (const text of texts) {
      expect(text.length).toBeLessThanOrEqual(40)
      expect(readKinds(withKind(2, { words: splitWords(text) })), text).not.toBeNull()
    }
  })
})

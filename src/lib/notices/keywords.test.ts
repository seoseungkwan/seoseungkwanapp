import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  checkKeyword,
  cleanKeyword,
  KEYWORD_LEN,
  KEYWORD_MAX,
  mustSeeText,
  normKeyword,
  RECOMMENDED_KEYWORDS,
} from './keywords'

// 내 낱말 순수 도구(specs/notices REQ-7424, design 15절). normKeyword는 DB notice_norm과 같은 규칙이라
// 화면과 DB가 같은 낱말을 같다고 본다. 환자 정보 모양 낱말은 모두 지어낸 번호다

const NBSP = ' '
const IDEO = '　'

describe('AC-7424.1 normKeyword', () => {
  it.each([
    ['관절강내 주사', '관절강내주사'],
    ['MRI', 'mri'],
  ])('AC-7424.1: 명세 예 %j와 %j는 같은 낱말이다', (a, b) => {
    expect(normKeyword(a)).toBe(normKeyword(b))
  })

  it('AC-7424.1: 빈칸·탭·\\n·\\r·U+00A0·U+3000을 모두 뺀다', () => {
    expect(normKeyword(` 관\t절\n강\r내${NBSP}주${IDEO}사 `)).toBe('관절강내주사')
    expect(normKeyword(`  \t\n\r${NBSP}${IDEO}`)).toBe('')
  })

  it('AC-7424.1: 영문 A~Z만 소문자로 바꾼다(그 밖 글자는 그대로)', () => {
    expect(normKeyword('ABCDEFGHIJKLMNOPQRSTUVWXYZ')).toBe('abcdefghijklmnopqrstuvwxyz')
    expect(normKeyword('Mri 검사 abc')).toBe('mri검사abc')
    // DB translate()와 같게: 전각 영문·로마자 밖 대문자·숫자·기호는 바꾸지 않는다
    expect(normKeyword('ＭＲＩ')).toBe('ＭＲＩ')
    expect(normKeyword('ÄΣ')).toBe('ÄΣ')
    expect(normKeyword('X-ray 2차')).toBe('x-ray2차')
  })

  it('AC-7424.1: 정해 둔 여섯 빈칸 글자 밖의 빈칸(U+2003 등)은 빼지 않는다(DB 규칙과 같게)', () => {
    expect(normKeyword('도수 치료')).toBe('도수 치료')
    expect(normKeyword('도수​치료')).toBe('도수​치료')
  })

  it('AC-7424.1: 규칙이 DB notice_norm(design 15절 translate)과 같다 — 빼는 글자가 design 글자와 하나하나 같다', () => {
    const design = readFileSync(join(process.cwd(), 'specs/notices/design.md'), 'utf8')
    const m = design.match(/translate\(s, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' \|\| E'([^']*)', 'abcdefghijklmnopqrstuvwxyz'\)/)
    expect(m).not.toBeNull()
    const removed = m![1].replace('\\t', '\t').replace('\\n', '\n').replace('\\r', '\r')
    expect([...removed].map((c) => c.codePointAt(0))).toEqual([0x20, 0x09, 0x0a, 0x0d, 0xa0, 0x3000])
    for (const c of removed) expect(normKeyword(`가${c}나`), JSON.stringify(c)).toBe('가나')
  })
})

describe('AC-7424.1 cleanKeyword', () => {
  it('AC-7424.1: 앞뒤 공백을 뗀다', () => {
    expect(cleanKeyword('  도수치료  ')).toBe('도수치료')
    expect(cleanKeyword(`${IDEO}${NBSP}\t도수치료\n\r`)).toBe('도수치료')
  })

  it('AC-7424.1: 이어진 빈칸 글자(빈칸·탭·줄바꿈·U+00A0·U+3000)는 빈칸 하나로 줄인다', () => {
    expect(cleanKeyword('관절강내   주사')).toBe('관절강내 주사')
    expect(cleanKeyword(`비대면\t\n${NBSP}${IDEO} 진료`)).toBe('비대면 진료')
    expect(cleanKeyword(`비대면${NBSP}진료`)).toBe('비대면 진료')
    expect(cleanKeyword('비대면\r\n진료')).toBe('비대면 진료')
  })

  it('AC-7424.1: 그 밖 제어 문자는 뺀다', () => {
    expect(cleanKeyword('도수\u0000치료')).toBe('도수치료')
    expect(cleanKeyword('도수\u0007\u001b\u007f\u0085치료')).toBe('도수치료')
    expect(cleanKeyword('\u0001 도수치료 \u0002')).toBe('도수치료')
    expect(cleanKeyword('관절강내 \u0001 주사')).toBe('관절강내 주사')
  })

  it('AC-7424.1: 다듬은 낱말에는 제어 문자·앞뒤 공백·이어진 빈칸이 없다(DB 줄 제약을 넘는다)', () => {
    const cleaned = cleanKeyword(`\t\u0003 체외 \n\n 충격파${IDEO}\u0000`)
    expect(cleaned).toBe('체외 충격파')
    expect(cleaned).toBe(cleaned.trim())
    expect(cleaned).not.toMatch(/\p{Cc}/u)
    expect(cleaned).not.toMatch(/ {2}/)
  })

  it('AC-7424.1: 이미 다듬은 낱말은 그대로다', () => {
    for (const w of RECOMMENDED_KEYWORDS) expect(cleanKeyword(w)).toBe(w)
    expect(cleanKeyword('')).toBe('')
    expect(cleanKeyword(`  \t${IDEO}`)).toBe('')
  })
})

describe('AC-7424.1 RECOMMENDED_KEYWORDS', () => {
  it('AC-7424.1: 기본값 19의 추천 낱말 12개를 차례 그대로 둔다', () => {
    expect([...RECOMMENDED_KEYWORDS]).toEqual([
      '도수치료',
      '체외충격파',
      '물리치료',
      '관절강내 주사',
      '신경차단술',
      '증식치료',
      'MRI',
      '초음파',
      '골다공증',
      '비급여',
      '본인부담',
      '비대면 진료',
    ])
  })

  it('AC-7424.1: 추천 낱말은 모두 checkKeyword를 통과하고 서로 같은 낱말이 없다', () => {
    const picked: string[] = []
    for (const w of RECOMMENDED_KEYWORDS) {
      expect(checkKeyword(w, picked), w).toEqual({ ok: w })
      picked.push(w)
    }
  })
})

describe('AC-7424.2 checkKeyword', () => {
  it('AC-7424.2: 한도는 30개·20자다', () => {
    expect(KEYWORD_MAX).toBe(30)
    expect(KEYWORD_LEN).toBe(20)
  })

  it('AC-7424.2: 다듬은 낱말을 ok로 돌려준다', () => {
    expect(checkKeyword('  실손보험 ', [])).toEqual({ ok: '실손보험' })
    expect(checkKeyword('관절강내\t\t주사', ['도수치료'])).toEqual({ ok: '관절강내 주사' })
  })

  it.each(['', '   ', `\t\n${NBSP}${IDEO}`, '\u0000\u0001'])('AC-7424.2: 다듬은 뒤 빈 글자 %j는 empty다', (s) => {
    expect(checkKeyword(s, [])).toBe('empty')
  })

  it('AC-7424.2: 다듬은 뒤 20자 넘으면 too-long이고 20자까지는 된다(앞뒤 공백·이어진 빈칸은 세지 않는다)', () => {
    const twenty = '가'.repeat(20)
    expect(checkKeyword(twenty, [])).toEqual({ ok: twenty })
    expect(checkKeyword(`   ${twenty}   `, [])).toEqual({ ok: twenty })
    expect(checkKeyword('가'.repeat(21), [])).toBe('too-long')
    expect(checkKeyword(`${'가'.repeat(10)}     ${'나'.repeat(9)}`, [])).toEqual({ ok: `${'가'.repeat(10)} ${'나'.repeat(9)}` })
    expect(checkKeyword(`${'가'.repeat(10)} ${'나'.repeat(10)}`, [])).toBe('too-long')
  })

  it('AC-7424.2: 글자 수는 코드 포인트로 센다(DB char_length와 같게)', () => {
    const emoji = '😀'.repeat(20)
    expect(checkKeyword(emoji, [])).toEqual({ ok: emoji })
    expect(checkKeyword('😀'.repeat(21), [])).toBe('too-long')
  })

  it('AC-7424.2: 이미 30개면 full이다(29개까지는 더한다)', () => {
    const words = Array.from({ length: 30 }, (_, i) => `낱말${String.fromCharCode(0xac00 + i)}`)
    expect(checkKeyword('실손보험', words)).toBe('full')
    expect(checkKeyword('실손보험', words.slice(0, 29))).toEqual({ ok: '실손보험' })
  })

  it.each([
    ['010-1234-5678', ['tel']],
    ['차트 1234', ['chart']],
    ['9001011234567', ['rrn']],
    ['1234567', ['digits']],
  ] as const)('AC-7424.2: 환자 정보 모양 %j는 privateKinds 그대로 private다', (s, kinds) => {
    expect(checkKeyword(s, [])).toEqual({ private: kinds })
  })

  it('AC-7424.2: 환자 정보 모양은 다듬은 뒤 본다(제어 문자로 끊어도 걸린다)', () => {
    expect(checkKeyword('010-1234-\u00005678', [])).toEqual({ private: ['tel'] })
  })

  it.each([['도수치료'], ['도수 치료'], ['도수\t치료'], [`도수${IDEO}치료 `]])(
    'AC-7424.2: 띄어쓰기만 다른 %j는 고른 낱말 도수치료와 같아 dup이다',
    (s) => {
      expect(checkKeyword(s, ['체외충격파', '도수치료'])).toBe('dup')
    },
  )

  it('AC-7424.2: 영문 대소문자만 다른 낱말은 dup이고, 고른 쪽이 띄어 써도 같다', () => {
    expect(checkKeyword('mri', ['MRI'])).toBe('dup')
    expect(checkKeyword('Mri', ['MRI'])).toBe('dup')
    expect(checkKeyword('관절강내주사', ['관절강내 주사'])).toBe('dup')
    expect(checkKeyword('비대면 진료', ['비대면진료'])).toBe('dup')
  })

  it('AC-7424.2: 일부만 같은 낱말은 dup이 아니다', () => {
    expect(checkKeyword('도수', ['도수치료'])).toEqual({ ok: '도수' })
    expect(checkKeyword('도수치료비', ['도수치료'])).toEqual({ ok: '도수치료비' })
  })

  it('AC-7424.2: 검사 차례는 empty → too-long → full → private → dup이다', () => {
    const full = Array.from({ length: 30 }, (_, i) => `낱말${String.fromCharCode(0xac00 + i)}`)
    expect(checkKeyword('   ', full)).toBe('empty')
    expect(checkKeyword('1'.repeat(21), full)).toBe('too-long')
    expect(checkKeyword('010-1234-5678', full)).toBe('full')
    expect(checkKeyword(full[0], full)).toBe('full')
    expect(checkKeyword('010-1234-5678', ['010-1234-5678'])).toEqual({ private: ['tel'] })
  })

  it('AC-7424.2: 받은 낱말 목록을 바꾸지 않는다', () => {
    const words = ['도수치료', 'MRI']
    checkKeyword('실손보험', words)
    checkKeyword('mri', words)
    expect(words).toEqual(['도수치료', 'MRI'])
  })
})

describe('AC-7424.2 mustSeeText', () => {
  const words = ['도수치료', '체외충격파', '관절강내 주사', '실손보험']

  it('AC-7424.2: 빈 목록은 빈 글자다', () => {
    expect(mustSeeText([], 2)).toBe('')
    expect(mustSeeText([], Infinity)).toBe('')
  })

  it("AC-7424.2: 앞 max개를 '·'로 잇고 남으면 ' 외 {n}개'를 붙인다(design 예)", () => {
    expect(mustSeeText(['도수치료', '체외충격파', '실손보험'], 2)).toBe('꼭 볼 글 · 도수치료·체외충격파 외 1개')
    expect(mustSeeText(words, 2)).toBe('꼭 볼 글 · 도수치료·체외충격파 외 2개')
  })

  it('AC-7424.2: max개 이하면 남은 수를 붙이지 않는다', () => {
    expect(mustSeeText(['도수치료'], 2)).toBe('꼭 볼 글 · 도수치료')
    expect(mustSeeText(['도수치료', 'MRI'], 2)).toBe('꼭 볼 글 · 도수치료·MRI')
  })

  it('AC-7424.2: max가 Infinity면 모든 낱말이다(글 화면)', () => {
    expect(mustSeeText(words, Infinity)).toBe('꼭 볼 글 · 도수치료·체외충격파·관절강내 주사·실손보험')
  })
})

describe('AC-7424.1 keywords.ts는 브라우저 순수 모듈이다', () => {
  it('AC-7424.1: 서버 전용·네트워크·저장소·console을 쓰지 않고 askCheck의 privateKinds를 쓴다', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/notices/keywords.ts'), 'utf8')
    expect(src).not.toMatch(/server-only|fetch\(|localStorage|sessionStorage|console\.|supabase/)
    expect(src).toMatch(/import \{[^}]*\bprivateKinds\b[^}]*\} from '\.\/askCheck'/)
  })
})

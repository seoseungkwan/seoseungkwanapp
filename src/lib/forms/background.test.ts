import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BG_IMAGE_MAX_BYTES, BG_PER_DAY, BG_THUMB_MAX, MAX_BG_WORDS } from '@/types/formBackground'
import { backgroundPrompt, checkBackgroundRow, isJpegBase64, wordsOf, wordsProblem } from './background'

// 휴진 안내 AI 배경: 적은 말·프롬프트·JPEG base64·내 배경 줄 검사 (specs/forms-themes REQ-4606·REQ-4607·REQ-4609,
// design.md 4-1·4-2·8-5절, TASK-5). 순수 함수(SDK·네트워크·console 없음). 적은 말은 가짜 값만 쓴다

const MIGRATION = 'supabase/migrations/20261115020000_form_backgrounds.sql'
const migration = () => readFileSync(join(process.cwd(), MIGRATION), 'utf8').replace(/\r\n/g, '\n')

// 내 배경 한 줄(표에서 읽은 모양). id·병원 id는 소문자 uuid, path = '<병원 id>/<id>.jpg'
const HOSPITAL = 'abcdef12-2222-4333-8444-5555555555cd'
const ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const OTHER_ID = 'ffffffff-0000-4111-8222-333333333333'
const THUMB = `/9j/${'A'.repeat(96)}`
const ROW = {
  id: ID,
  words: '봄 벚꽃',
  accent: '#c2185b',
  thumb: THUMB,
  path: `${HOSPITAL}/${ID}.jpg`,
  created_at: '2026-11-15T05:00:00.000Z',
}
const rowWith = (over: Record<string, unknown>) => ({ ...ROW, ...over })

describe('AC-4606.4: 프롬프트 글(design.md 4-1절)', () => {
  it("AC-4606.4: backgroundPrompt('봄 벚꽃')은 design.md 4-1절 글과 한 글자도 다르지 않다(줄은 \\n으로 잇는다)", () => {
    const expected = [
      "Vertical background illustration for a Korean orthopedic clinic's monthly closed-days notice poster.",
      'Theme: 봄 벚꽃.',
      'Style: bright, soft, professional editorial illustration with fine detail and gentle gradients; warm and friendly for elderly patients; high print quality.',
      'Layout rules (very important):',
      '- Decorations only along the top corners, the left and right edges, and the bottom edge.',
      '- Keep a large, clean, very light and plain area in the center (about 70% of the width, from 12% to 85% of the height). Text will be placed there.',
      '- Keep the bottom-center strip plain and light for a logo.',
      '- Absolutely no text, letters, numbers, signs, logos, watermarks, frames with writing, or human faces.',
    ].join('\n')
    expect(backgroundPrompt('봄 벚꽃')).toBe(expected)
  })

  it('AC-4606.4: Theme 줄에는 앞뒤 공백을 뗀 적은 말이 들어가고, 나머지 줄은 그대로다', () => {
    expect(backgroundPrompt('   봄 벚꽃  ')).toBe(backgroundPrompt('봄 벚꽃'))
    const lines = backgroundPrompt(' 추석 보름달 ').split('\n')
    expect(lines).toHaveLength(8)
    expect(lines[1]).toBe('Theme: 추석 보름달.')
    expect(backgroundPrompt('겨울 눈').split('\n').filter((_, i) => i !== 1)).toEqual(backgroundPrompt('봄 벚꽃').split('\n').filter((_, i) => i !== 1))
  })
})

describe('AC-4606.4·AC-4609.1: 적은 말 wordsOf(앞뒤 공백을 뗀 1~30자)', () => {
  it('AC-4606.4: 앞뒤 공백을 뗀 글을 돌려준다', () => {
    expect(wordsOf('봄 벚꽃')).toBe('봄 벚꽃')
    expect(wordsOf('  봄 벚꽃  ')).toBe('봄 벚꽃')
    expect(wordsOf(` ${'가'.repeat(MAX_BG_WORDS)} `)).toBe('가'.repeat(MAX_BG_WORDS))
  })

  it('AC-4606.4: 0자(빈 글·공백뿐)는 null', () => {
    expect(wordsOf('')).toBeNull()
    expect(wordsOf('    ')).toBeNull()
  })

  it('AC-4606.4: 30자는 되고 31자는 null이다(그림 문자는 한 글자로 센다)', () => {
    expect(MAX_BG_WORDS).toBe(30)
    expect(wordsOf('가'.repeat(30))).toBe('가'.repeat(30))
    expect(wordsOf('가'.repeat(31))).toBeNull()
    expect(wordsOf('🌸'.repeat(30))).toBe('🌸'.repeat(30))
    expect(wordsOf('🌸'.repeat(31))).toBeNull()
    expect(wordsOf('벚꽃🌸'.repeat(10))).toBe('벚꽃🌸'.repeat(10))
    expect(wordsOf(`${'벚꽃🌸'.repeat(10)}꽃`)).toBeNull()
  })

  it('AC-4606.4: 글자가 아니면 null', () => {
    for (const value of [null, undefined, 30, true, ['봄 벚꽃'], { text: '봄 벚꽃' }]) expect(wordsOf(value), String(value)).toBeNull()
  })
})

describe('AC-4606.2: 개인정보·제어 문자 모양 wordsProblem', () => {
  it('AC-4606.2: 줄바꿈·탭·제어 문자가 있으면 참', () => {
    for (const text of ['봄\n벚꽃', '봄\r벚꽃', '봄\r\n벚꽃', '봄\t벚꽃', '봄\u0007벚꽃', '봄 벚꽃\u0000', '\u007f봄', '봄\u0085']) {
      expect(wordsProblem(text), JSON.stringify(text)).toBe(true)
    }
  })

  it('AC-4606.2: 전화(010-1234-5678)·메일·주민번호 모양이면 참', () => {
    for (const text of ['문의 010-1234-5678', '01012345678', 'a@b.kr 벚꽃', '900101-1234567', '9001011234567']) {
      expect(wordsProblem(text), text).toBe(true)
    }
  })

  it("AC-4606.2: '봄 벚꽃' 같은 짧은 말은 거짓", () => {
    for (const text of ['봄 벚꽃', '추석 보름달', '겨울 눈 ❄️', '5월 가정의 달', '2027 새해']) expect(wordsProblem(text), text).toBe(false)
  })
})

describe('AC-4609.1: JPEG base64 글 isJpegBase64', () => {
  it('AC-4609.1: /9j/로 시작하는 base64 글(= 0~2개)은 참', () => {
    expect(isJpegBase64('/9j/4AAQSkZJRgABAQ==')).toBe(true)
    expect(isJpegBase64('/9j/4AAQSkZJRgABAQA=')).toBe(true)
    expect(isJpegBase64(THUMB)).toBe(true)
    expect(isJpegBase64('/9j/+/+/')).toBe(true)
  })

  it('AC-4609.1: /9j/로 시작하지 않으면(PNG·data: 주소·빈 글) 거짓', () => {
    for (const value of ['iVBORw0KGgo=', 'data:image/jpeg;base64,/9j/4AAQ', '', 'AAAA/9j/', '/9i/AAAA']) {
      expect(isJpegBase64(value), value).toBe(false)
    }
  })

  it('AC-4609.1: 길이가 4의 배수가 아니면 거짓', () => {
    for (const value of ['/9j/4', '/9j/4A', '/9j/4AA', '/9j/4AAQ=']) expect(isJpegBase64(value), value).toBe(false)
  })

  it('AC-4609.1: =가 셋이거나 base64 밖 글자(공백·줄바꿈·-·_)가 있으면 거짓', () => {
    for (const value of ['/9j/A===', '/9j/AA=A', '/9j/AA A', '/9j/AA\nA', '/9j/AA-_']) {
      expect(isJpegBase64(value), JSON.stringify(value)).toBe(false)
    }
  })

  it('AC-4609.1: 글자가 아니면 거짓', () => {
    for (const value of [null, undefined, 123, ['/9j/'], { b64: '/9j/' }]) expect(isJpegBase64(value), String(value)).toBe(false)
  })

  it('AC-4609.1: 풀어 낸 바이트 수(⌊길이 × 3 / 4⌋ − = 수)가 한도를 넘으면 거짓', () => {
    expect(isJpegBase64('/9j/AAAA', 6)).toBe(true)
    expect(isJpegBase64('/9j/AAAA', 5)).toBe(false)
    expect(isJpegBase64('/9j/AA==', 4)).toBe(true)
    expect(isJpegBase64('/9j/AA==', 3)).toBe(false)
    expect(isJpegBase64('/9j/AAA=', 5)).toBe(true)
    expect(isJpegBase64('/9j/AAA=', 4)).toBe(false)
  })

  it('AC-4609.1: 기본 한도는 3,000,000바이트다(3,000,000은 참, 3,000,001은 거짓)', () => {
    expect(BG_IMAGE_MAX_BYTES).toBe(3_000_000)
    expect(isJpegBase64(`/9j/${'A'.repeat(3_999_996)}`)).toBe(true) // 4,000,000자 = 3,000,000바이트
    expect(isJpegBase64(`/9j/${'A'.repeat(3_999_998)}==`)).toBe(false) // 4,000,004자 − 2 = 3,000,001바이트
  })
})

describe('AC-4609.1: 내 배경 줄 검사 checkBackgroundRow', () => {
  it('AC-4609.1: 맞는 줄은 { id, words, accent, thumb, path, createdAt }이다', () => {
    expect(checkBackgroundRow(ROW)).toEqual({
      id: ID,
      words: '봄 벚꽃',
      accent: '#c2185b',
      thumb: THUMB,
      path: `${HOSPITAL}/${ID}.jpg`,
      createdAt: '2026-11-15T05:00:00.000Z',
    })
  })

  it('AC-4609.1: 열쇠가 하나 더 있거나 하나 모자라면 null', () => {
    expect(checkBackgroundRow(rowWith({ hospital_id: HOSPITAL }))).toBeNull()
    expect(checkBackgroundRow(rowWith({ createdAt: ROW.created_at }))).toBeNull()
    for (const key of Object.keys(ROW)) {
      const row: Record<string, unknown> = { ...ROW }
      delete row[key]
      expect(checkBackgroundRow(row), key).toBeNull()
    }
  })

  it('AC-4609.1: 줄이 객체가 아니면 null', () => {
    for (const value of [null, undefined, 'row', 1, [], [ROW]]) expect(checkBackgroundRow(value), String(value)).toBeNull()
  })

  it('AC-4609.1: id가 소문자 uuid가 아니면(대문자·모양 틀림·글자 아님) null', () => {
    const upper = ID.toUpperCase()
    expect(checkBackgroundRow(rowWith({ id: upper, path: `${HOSPITAL}/${upper}.jpg` }))).toBeNull()
    expect(checkBackgroundRow(rowWith({ id: 'aaaaaaaa', path: `${HOSPITAL}/aaaaaaaa.jpg` }))).toBeNull()
    expect(checkBackgroundRow(rowWith({ id: 7 }))).toBeNull()
  })

  it('AC-4609.1: path가 <병원 uuid>/<id>.jpg 모양이 아니면 null', () => {
    for (const path of [
      `${HOSPITAL}/${OTHER_ID}.jpg`, // 다른 id
      `${HOSPITAL.toUpperCase()}/${ID}.jpg`, // 대문자 병원 id
      `${HOSPITAL}/${ID}.png`,
      `${HOSPITAL}/${ID}`,
      `${ID}.jpg`, // 병원 폴더 없음
      `/${HOSPITAL}/${ID}.jpg`,
      `x/${HOSPITAL}/${ID}.jpg`,
      `${HOSPITAL}/${ID}.jpg `,
      `${HOSPITAL}/x/${ID}.jpg`,
      `12345678/${ID}.jpg`,
      '',
    ]) {
      expect(checkBackgroundRow(rowWith({ path })), path).toBeNull()
    }
    expect(checkBackgroundRow(rowWith({ path: null }))).toBeNull()
  })

  it('AC-4609.1: accent가 # + 소문자 16진수 6자리가 아니면 null', () => {
    for (const accent of ['#C2185B', '#c2185b0', '#c2185', 'c2185b', '#fff', '#g2185b', '', null]) {
      expect(checkBackgroundRow(rowWith({ accent })), String(accent)).toBeNull()
    }
  })

  it('AC-4609.1: words가 앞뒤 공백을 뗀 1~30자가 아니거나 개인정보·제어 문자 모양이면 null', () => {
    for (const words of ['', ' 봄 벚꽃', '봄 벚꽃 ', '가'.repeat(31), '봄\n벚꽃', '봄\t벚꽃', '문의 010-1234-5678', 3]) {
      expect(checkBackgroundRow(rowWith({ words })), JSON.stringify(words)).toBeNull()
    }
    expect(checkBackgroundRow(rowWith({ words: '🌸'.repeat(30) }))).not.toBeNull()
  })

  it('AC-4609.1: thumb가 JPEG base64가 아니거나 16,000자를 넘으면 null', () => {
    expect(BG_THUMB_MAX).toBe(16_000)
    expect(checkBackgroundRow(rowWith({ thumb: `/9j/${'A'.repeat(15_996)}` }))).not.toBeNull() // 16,000자
    for (const thumb of [`/9j/${'A'.repeat(16_000)}`, 'iVBORw0KGgo=', '/9j/A', 'data:image/jpeg;base64,/9j/AAAA', '', null]) {
      expect(checkBackgroundRow(rowWith({ thumb })), String(thumb).slice(0, 30)).toBeNull()
    }
  })

  it('AC-4609.1: created_at이 빈 글이거나 글자가 아니면 null', () => {
    for (const created_at of ['', null, 0]) expect(checkBackgroundRow(rowWith({ created_at })), String(created_at)).toBeNull()
  })

  it('AC-4609.1: 글자 수·강조색·작은 그림 한도가 migration 표 제약과 같다', () => {
    const sql = migration()
    expect(sql).toContain(`char_length(words) between 1 and ${MAX_BG_WORDS}`)
    expect(sql).toContain("accent ~ '^#[0-9a-f]{6}$'")
    expect(sql).toContain(`char_length(thumb) <= ${BG_THUMB_MAX}`)
    expect(sql).toContain(`file_size_limit = ${BG_IMAGE_MAX_BYTES}`)
  })
})

describe('AC-4607.3: 하루 한도 숫자', () => {
  it('AC-4607.3: BG_PER_DAY는 20이고 migration의 d.images < 20·between 0 and 20과 같다', () => {
    const sql = migration()
    const takes = [...sql.matchAll(/d\.images < (\d+)/g)].map((m) => Number(m[1]))
    const checks = [...sql.matchAll(/between 0 and (\d+)/g)].map((m) => Number(m[1]))
    expect(BG_PER_DAY).toBe(20)
    expect(takes).toEqual([BG_PER_DAY])
    expect(checks).toEqual([BG_PER_DAY])
  })
})

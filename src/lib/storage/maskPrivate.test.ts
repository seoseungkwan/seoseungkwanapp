import { describe, expect, it } from 'vitest'
import { privacyProblem } from '@/lib/worklog/notes'
import { maskPrivate } from './maskPrivate'

// 구글에서 온 글 가리기 (spec google-link AC-8505.3, design.md 10-3). 전화·주민번호·메일은 모두 지어낸 것이다.
// 모양은 lib/worklog/notes privacyProblem이 보는 것과 같다 — notes.test.ts의 '문제다' 예를 그대로 옮겨 견준다

const PHONES = [
  '010-0000-1234',
  '010.0000.1234',
  '010 0000 1234',
  '02-000-1234',
  '01000001234',
  '010-00001234',
  '0200001234',
  '020001234',
  '(02)000-1234',
  '(010)0000-1234',
  '+82 10-0000-1234',
  '+82-10-0000-1234',
  '+821000001234',
  '02)000-1234',
  '010 - 0000 - 1234',
]
const NATIONAL_IDS = ['900101-1234567', '900101 1234567', '900101.1234567', '9001011234567', '900101 - 1234567']
const MAILS = ['a@b.co', 'hong.gildong@fake.test']
const MARKED = ['①010-0000-1234', '010-0000-1234①', '①01000001234', '①900101-1234567']
const NUMBER_GLYPHS = ['⓪①⓪-⓪⓪⓪⓪-①②③④', '⁰¹⁰-⁰⁰⁰⁰-¹²³⁴', '0①0-0000-1234', '⑨⓪⓪①⓪①-①②③④⑤⑥⑦', '０１０-００００-１２３４', '010—0000—1234', '010ㅡ0000ㅡ1234']
const SHAPES = [...PHONES, ...NATIONAL_IDS, ...MAILS, ...MARKED, ...NUMBER_GLYPHS]

// notes.test.ts의 '문제가 아니다' 예 + 구글 예약 제목 꼴
const PLAIN = [
  '1234567',
  '12,000',
  '2건 12,000',
  '00012',
  '택배비',
  '',
  '2026-10-28 환불',
  '1,234,500원',
  '-12,000원',
  '10/28',
  '010\n0000\n1234',
  '900101\n1234567',
  '① 택배비 ② 5,000',
  '999999999999',
  '1234567890123',
  '01234567',
  '012345678901',
  '010-0000-12345',
  '0101-0000-1234',
  '1234 홍길동 도수 30분 (호)',
  '5521 최시안 (4000타)',
  '7345 한예제(1부위만 해 주세요',
  '원장님 회의…',
]

describe('AC-8505.3 maskPrivate 전화·주민번호·메일 조각 가리기', () => {
  it('AC-8505.3: 바탕 시험 — 옮긴 예가 모두 privacyProblem의 문제 모양이다', () => {
    for (const text of SHAPES) expect(privacyProblem(text), text).toBe(true)
    for (const text of PLAIN) expect(privacyProblem(text), text).toBe(false)
  })

  it.each(SHAPES)('AC-8505.3: %s 모양은 …로 바뀌고 남은 글에 개인정보 모양이 없다', (text) => {
    const masked = maskPrivate(text)
    expect(masked).toContain('…')
    expect(privacyProblem(masked)).toBe(false)
  })

  it.each(SHAPES)('AC-8505.3: 예약 제목 가운데 낀 %s도 그 조각만 …로 바뀌고 앞뒤 글은 그대로다', (text) => {
    const masked = maskPrivate(`1234 홍길동 ${text} 도수`)
    expect(privacyProblem(masked)).toBe(false)
    expect(masked.startsWith('1234 홍길동 ')).toBe(true)
    expect(masked.endsWith(' 도수')).toBe(true)
    expect(masked).toContain('…')
  })

  it.each(PLAIN)('AC-8505.3: 보통 글자 %j는 그대로다', (text) => {
    expect(maskPrivate(text)).toBe(text)
  })

  it('AC-8505.3: 조각마다 …로 바꾸고 원래 숫자·메일은 남기지 않는다', () => {
    const masked = maskPrivate('6230 정샘플 010-0000-1234 도수 (원) 연락 hong@fake.test 주민 900101-1234567 끝')
    expect(masked).toBe('6230 정샘플 … 도수 (원) 연락 … 주민 … 끝')
    for (const piece of ['0000-1234', '1234567', 'hong@fake.test', 'fake.test']) expect(masked).not.toContain(piece)
  })

  it('AC-8505.3: 빈칸으로 나뉜 두 조각은 … 둘, 빈칸 없이 붙은 두 메일은 … 하나가 된다', () => {
    expect(maskPrivate('010-0000-1234 010-0000-5678')).toBe('… …')
    expect(maskPrivate('a@b.co/c@d.co')).toBe('…')
  })

  it('AC-8505.3: 번호 글자가 옆에 붙어도 전화 조각만 가리고 번호 글자는 둔다', () => {
    expect(maskPrivate('①010-0000-1234')).toBe('①…')
    expect(maskPrivate('5521 최시안 ①010-0000-1234 (4000타)')).toBe('5521 최시안 ①… (4000타)')
  })

  it('AC-8505.3: 전각 숫자·긴 줄표로 적은 전화도 가린다', () => {
    expect(maskPrivate('8456 윤모의 ０１０-００００-１２３４')).toBe('8456 윤모의 …')
    expect(maskPrivate('8456 윤모의 010—0000—1234 도수')).toBe('8456 윤모의 … 도수')
  })

  it('AC-8505.3: 원래 …가 있는 글도 가린 뒤 개인정보 모양이 되살아나지 않는다', () => {
    for (const text of ['a@b…', 'x@y010-0000-1234', '010…0000…1234', '…a@b.co…']) {
      expect(privacyProblem(maskPrivate(text)), text).toBe(false)
    }
  })

  it('AC-8505.3: 받은 글을 바꾸지 않고 새 글을 돌려준다(글자가 아니면 빈 글)', () => {
    const text = '연락 010-0000-1234'
    expect(maskPrivate(text)).toBe('연락 …')
    expect(text).toBe('연락 010-0000-1234')
    expect(maskPrivate(undefined as unknown as string)).toBe('')
    expect(maskPrivate(12 as unknown as string)).toBe('')
  })
})

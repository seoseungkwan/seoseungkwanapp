import { describe, expect, it } from 'vitest'
import { canMove, insertToken, moveToken, pieces, removeToken } from './tokenPieces'

// 문구 칸의 조각(낱말·{항목}·빈칸)과 {항목} 옮기기·지우기·넣기(memo-settings REQ-3008, design.md §4 tokenPieces.ts)

const IA = 'IA injection of - {부위}{약제}'
const indexOf = (text: string, piece: string) => pieces(text).findIndex((p) => p.text === piece)

describe('AC-3008.2 조각 나누기', () => {
  it('AC-3008.2: 글을 낱말·{항목}·빈칸 조각으로 나누고, 이으면 처음 글이다', () => {
    expect(pieces(IA)).toEqual([
      { text: 'IA', kind: 'word' },
      { text: ' ', kind: 'space' },
      { text: 'injection', kind: 'word' },
      { text: ' ', kind: 'space' },
      { text: 'of', kind: 'word' },
      { text: ' ', kind: 'space' },
      { text: '-', kind: 'word' },
      { text: ' ', kind: 'space' },
      { text: '{부위}', kind: 'token' },
      { text: '{약제}', kind: 'token' },
    ])
    const text = '{좌우} 슬관절\n강내  {회차}회차 {'
    expect(pieces(text).map((p) => p.text).join('')).toBe(text)
    expect(pieces(text).filter((p) => p.kind === 'token').map((p) => p.text)).toEqual(['{좌우}', '{회차}'])
    expect(pieces('')).toEqual([])
  })
})

describe('AC-3008.2 {항목} 옮기기', () => {
  it('AC-3008.2: ◀는 바로 앞 조각과 자리를 바꾼다: {부위}{약제}에서 {약제} ◀ → {약제}{부위}', () => {
    expect(moveToken(IA, indexOf(IA, '{약제}'), -1)).toBe('IA injection of - {약제}{부위}')
  })

  it('AC-3008.2: 빈칸은 건너뛰고 제자리에 둔다', () => {
    expect(moveToken('{좌우} 슬관절 강내', 0, 1)).toBe('슬관절 {좌우} 강내')
    expect(moveToken('A  {x}\nB', indexOf('A  {x}\nB', '{x}'), 1)).toBe('A  B\n{x}')
    expect(moveToken('A  {x}\nB', indexOf('A  {x}\nB', '{x}'), -1)).toBe('{x}  A\nB')
  })

  it('AC-3008.2: 맨 앞·맨 뒤에서는 그쪽으로 옮길 수 없고 글이 그대로다', () => {
    const list = pieces(IA)
    const last = indexOf(IA, '{약제}')
    expect(canMove(list, last, 1)).toBe(false)
    expect(canMove(list, last, -1)).toBe(true)
    expect(moveToken(IA, last, 1)).toBe(IA)
    expect(canMove(pieces('{좌우} 무릎'), 0, -1)).toBe(false)
    expect(canMove(pieces(' {좌우} '), 1, 1)).toBe(false)
  })

  it('AC-3008.2: {항목}이 아닌 조각은 옮기지 않는다', () => {
    expect(moveToken(IA, 0, 1)).toBe(IA)
    expect(canMove(pieces(IA), 0, 1)).toBe(false)
  })
})

describe('AC-3008.2 {항목} 지우기', () => {
  it.each([
    ['맨 앞', '{좌우} 슬관절 강내 연골주사 {회차}회차', '{좌우}', '슬관절 강내 연골주사 {회차}회차'],
    ['가운데', 'a {x} b', '{x}', 'a b'],
    ['맨 뒤', 'a {x}', '{x}', 'a'],
    ['붙은 항목', IA, '{부위}', 'IA injection of - {약제}'],
    ['하나뿐', '{x}', '{x}', ''],
  ])('AC-3008.2: ×는 그 항목만 지우고 빈칸이 겹치지 않는다: %s', (_name, text, token, out) => {
    expect(removeToken(text, indexOf(text, token))).toBe(out)
  })

  it('AC-3008.2: {항목}이 아닌 조각은 지우지 않는다', () => {
    expect(removeToken(IA, 0)).toBe(IA)
  })
})

describe('AC-3008.1 {항목} 넣기', () => {
  it('AC-3008.1: 글쓰기 표시 자리에 넣고, 고른 글이 있으면 그 글을 바꾼다', () => {
    expect(insertToken('ab', 1, 1, '부위')).toBe('a{부위}b')
    expect(insertToken('ab', 2, 2, '부위')).toBe('ab{부위}')
    expect(insertToken('abc', 1, 2, '부위')).toBe('a{부위}c')
    expect(insertToken('ab', 9, 9, '부위')).toBe('ab{부위}')
  })
})

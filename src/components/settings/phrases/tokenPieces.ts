// 문구 칸의 조각(memo-settings REQ-3008, design.md §4): 글을 낱말·{항목}·빈칸으로 나누고 {항목}을 옮기거나 지우거나 넣는다. 순수 함수다

export type Piece = { text: string; kind: 'word' | 'token' | 'space' }

const SPLIT = /(\{[^{}]*\}|\s+)/
const TOKEN = /^\{[^{}]*\}$/
const SPACE = /^\s+$/

/** 글을 조각으로. 이으면 처음 글이다 */
export function pieces(text: string): Piece[] {
  return text
    .split(SPLIT)
    .filter((part) => part !== '')
    .map((part) => ({ text: part, kind: TOKEN.test(part) ? 'token' : SPACE.test(part) ? 'space' : 'word' }))
}

/** index 조각에서 dir 쪽으로 가장 가까운 빈칸 아닌 조각. 없으면 -1 */
function neighbor(list: readonly Piece[], index: number, dir: -1 | 1): number {
  let at = index + dir
  while (at >= 0 && at < list.length && list[at].kind === 'space') at += dir
  return at >= 0 && at < list.length ? at : -1
}

/** {항목} 조각을 dir 쪽으로 옮길 수 있나(맨 앞·맨 뒤면 못 옮긴다) */
export function canMove(list: readonly Piece[], index: number, dir: -1 | 1): boolean {
  return list[index]?.kind === 'token' && neighbor(list, index, dir) !== -1
}

/** {항목} 조각을 바로 앞·뒤 조각(빈칸 말고)과 자리를 바꾼다. 빈칸은 제자리에 둔다. 못 옮기면 글 그대로다 */
export function moveToken(text: string, index: number, dir: -1 | 1): string {
  const list = pieces(text)
  if (!canMove(list, index, dir)) return text
  const other = neighbor(list, index, dir)
  ;[list[index], list[other]] = [list[other], list[index]]
  return list.map((p) => p.text).join('')
}

/** {항목} 조각 하나를 지운다. 빈칸이 겹치거나 앞뒤에 남지 않게 옆 빈칸 하나를 함께 지운다 */
export function removeToken(text: string, index: number): string {
  const list = pieces(text)
  if (list[index]?.kind !== 'token') return text
  const before = list[index - 1]
  const after = list[index + 1]
  const drop = new Set([index])
  if (after?.kind === 'space' && (before === undefined || before.kind === 'space')) drop.add(index + 1)
  else if (before?.kind === 'space' && after === undefined) drop.add(index - 1)
  return list.filter((_, at) => !drop.has(at)).map((p) => p.text).join('')
}

/** start~end(고른 글)를 {token}으로 바꾼다. 글 밖이면 글 끝에 넣는다 */
export function insertToken(text: string, start: number, end: number, token: string): string {
  const from = Math.min(Math.max(start, 0), text.length)
  const to = Math.min(Math.max(end, from), text.length)
  return `${text.slice(0, from)}{${token}}${text.slice(to)}`
}

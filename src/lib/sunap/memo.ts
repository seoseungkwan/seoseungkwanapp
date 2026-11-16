import type { RsvKind, RsvWords } from '@/types/sunap'

// 비트 예약 메모 → 예약 종류 [환자 자료 구역] (spec sunap-ilji AC-4901.1).
// inj 말이 있으면 inj, 없고 visit 말이면 visit, 없고 etc 말이면 etc, 아무것도 없으면 unknown.
// 메모·말 모두 앞뒤 빈칸을 빼고 영문 대소문자를 가리지 않는다. 빈 말은 무시한다(빈 글은 모든 메모에 들어 있어서)
const ORDER = ['inj', 'visit', 'etc'] as const

const normal = (text: string) => text.trim().toLowerCase()

export function classifyMemo(memo: string, words: RsvWords): Exclude<RsvKind, 'none'> {
  const text = normal(memo)
  for (const kind of ORDER) {
    if (words[kind].some((word) => normal(word) !== '' && text.includes(normal(word)))) return kind
  }
  return 'unknown'
}

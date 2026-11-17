import type { RsvKindDef } from '@/types/sunap'

// 비트 예약 메모 → 예약 종류 id [환자 자료 구역] (spec sunap-ilji AC-4901.1, sunap-kinds AC-5502.1).
// 종류 목록 차례로 처음 말이 메모에 든 종류의 id, 아무것도 없으면 unknown.
// 메모·말 모두 앞뒤 빈칸을 빼고 영문 대소문자를 가리지 않는다. 빈 말은 무시한다(빈 글은 모든 메모에 들어 있어서)

const normal = (text: string) => text.trim().toLowerCase()

export function classifyMemo(memo: string, kinds: readonly RsvKindDef[]): string {
  const text = normal(memo)
  for (const kind of kinds) {
    if (kind.words.some((word) => normal(word) !== '' && text.includes(normal(word)))) return kind.id
  }
  return 'unknown'
}

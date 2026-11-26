import type { FixNeed } from '@/lib/calendar/gshapes'
import type { ImportPicks } from '@/lib/gcal/importRead'

// 처음 가져오기 미리 보기의 줄마다 고른 것(spec google-link AC-8530.3). 키 모양은 lib/calendar/gtitle fixChoices 그대로:
// 'staff:<id>'·'kind:<id>'·'len:<분>'·'person:<id>'·'memo'(종일 메모로)·'skip'(가져오지 않기). 고를 거리(needs)가 둘이면 키도 둘이다.
// '가져오지 않기'는 줄 전체에 걸린다(다른 고른 것을 비운다). 빈 값('고르기')을 고르면 그 고를 거리의 키와 '가져오지 않기'를 지운다(되돌리기)

/** 이 고를 거리의 키인가 */
export function ownsPick(need: FixNeed, key: string): boolean {
  switch (need) {
    case 'staff':
      return key.startsWith('staff:')
    case 'kind':
      return key.startsWith('kind:')
    case 'len':
      return key.startsWith('len:')
    case 'what':
      return key === 'memo'
    case 'person':
      return key.startsWith('person:') || key === 'memo'
  }
}

/** 한 줄 · 한 고를 거리에서 value를 골랐을 때의 새 고른 것('' = 되돌리기, 'skip' = 가져오지 않기) */
export function withPick(picks: ImportPicks, rowKey: string, need: FixNeed, value: string): ImportPicks {
  const keys = picks[rowKey] ?? []
  const next = value === 'skip' ? ['skip'] : [...keys.filter((k) => k !== 'skip' && !ownsPick(need, k)), ...(value ? [value] : [])]
  const out: Record<string, readonly string[]> = { ...picks }
  if (next.length) out[rowKey] = next
  else delete out[rowKey]
  return out
}

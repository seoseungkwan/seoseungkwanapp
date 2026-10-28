import type { BucketState } from '@/types/analysis'
import type { DateRange } from '@/types/dates'
import { addDays, compareYmd } from './dates'

// 파일이 실제로 덮은 날 → 칸이 완전한가. 여러 파일은 덮은 구간의 합집합이고, 파일 사이 공백은 채운 것으로 보지 않는다

export type { BucketState }

// 겹치거나 붙은(앞 끝 다음 날 = 뒤 시작) 구간을 합쳐 시작 순으로. 끝이 시작보다 앞인 구간은 덮은 날이 없어 버린다
export function mergeRanges(ranges: DateRange[]): DateRange[] {
  const sorted = ranges.filter((r) => compareYmd(r.from, r.to) <= 0).sort((a, b) => compareYmd(a.from, b.from))
  const merged: DateRange[] = []
  for (const { from, to } of sorted) {
    const last = merged.at(-1)
    if (last !== undefined && compareYmd(from, addDays(last.to, 1)) <= 0) {
      if (compareYmd(to, last.to) > 0) last.to = to
    } else {
      merged.push({ from, to })
    }
  }
  return merged
}

// merged(mergeRanges 결과) 중 한 구간 안에 통째로 들어가나
export function isCovered(range: DateRange, merged: DateRange[]): boolean {
  return merged.some((m) => compareYmd(m.from, range.from) <= 0 && compareYmd(range.to, m.to) <= 0)
}

// 끝 날이 오늘 이상이면 아직 진행 중(덮였어도). 오늘은 한국 날짜(todayInKorea)
export function bucketState(range: DateRange, merged: DateRange[], today: string): BucketState {
  if (compareYmd(range.to, today) >= 0) return 'in-progress'
  return isCovered(range, merged) ? 'complete' : 'partial'
}

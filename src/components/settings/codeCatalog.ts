import { addDays, compareYmd } from '@/lib/analytics/dates'
import type { MemoCode, Phrases } from '@/lib/precheck/memo'
import type { DayPayload } from '@/types/payload'

// 설정 '처방코드' 묶음의 코드 목록(memo-settings design.md §3, AC-3004.2). 통계에 저장된 날별 처방(집계뿐, 환자 자료가 아니다)과 코드 사전으로 만든다. 순수 함수다

/** 처방코드 목록 한 줄. row는 사전(CODEMAP) 줄이고 사전에 없으면 null이다. isNew는 사전에도 지운 목록에도 없는 코드다 */
export type CodeRow = { code: string; bitName: string; type: string; lastDay: string | null; isNew: boolean; row: MemoCode | null }

/** '최근 3개월': 오늘 포함 92일 */
export const RECENT_DAYS = 92

// 글자 순서. localeCompare는 브라우저마다 달라 쓰지 않는다(처방 코드 순과 같다)
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

type Seen = { code: string; bitName: string; type: string; lastDay: string; recent: boolean }

/**
 * 코드 목록: scope 'recent'는 최근 92일에 처방된 코드와 사전 코드, 'all'은 읽은 전체 기간의 코드와 사전 코드.
 * 비트 이름·종류는 마지막으로 처방된 날 것이고, 마지막 처방일은 읽은 전체 기간에서 본다. 새 코드가 먼저, 다음은 코드 순이다
 */
export function buildCodeRows(days: readonly DayPayload[], phrases: Pick<Phrases, 'CODEMAP' | 'CODEMAP_DEL'>, today: string, scope: 'recent' | 'all'): CodeRow[] {
  const from = addDays(today, -(RECENT_DAYS - 1))
  const seen = new Map<string, Seen>()
  for (const { day, rx } of days) {
    const recent = compareYmd(day, from) >= 0 && compareYmd(day, today) <= 0
    for (const line of rx) {
      const key = line.code.toUpperCase()
      const before = seen.get(key)
      if (!before || compareYmd(day, before.lastDay) > 0) seen.set(key, { code: line.code, bitName: line.name, type: line.type, lastDay: day, recent: recent || (before?.recent ?? false) })
      else if (recent) before.recent = true
    }
  }

  const deleted = new Set(phrases.CODEMAP_DEL.map((code) => code.toUpperCase()))
  const rows: CodeRow[] = []
  // 사전 코드와 대소문자만 다른 처방 코드는 사전 줄 하나로 본다(검사가 사전 안의 대소문자 겹침을 막는다)
  for (const [code, row] of Object.entries(phrases.CODEMAP)) {
    const stats = seen.get(code.toUpperCase())
    seen.delete(code.toUpperCase())
    rows.push({ code, bitName: stats?.bitName ?? row.bitName ?? '', type: stats?.type ?? '', lastDay: stats?.lastDay ?? null, isNew: false, row })
  }
  for (const stats of seen.values()) {
    if (scope === 'recent' && !stats.recent) continue
    rows.push({ code: stats.code, bitName: stats.bitName, type: stats.type, lastDay: stats.lastDay, isNew: !deleted.has(stats.code.toUpperCase()), row: null })
  }
  return rows.sort((a, b) => (a.isNew === b.isNew ? compareText(a.code, b.code) : a.isNew ? -1 : 1))
}

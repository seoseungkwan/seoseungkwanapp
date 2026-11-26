import { compareYmd, eachDay } from '@/lib/analytics/dates'
import type { UisFileResult, UisRead, UisVisitDay } from '@/types/uisarang'

// 한 번에 넣은 파일 묶음 — 같은 날 두 번(specs/uisarang-upload design.md §5) [환자 자료 구역]. 받은(read) 결과만 견준다.
// 일일수입통계·아래쪽 표는 같은 날, 기간별처방통계는 같은 조회일끼리: 숫자가 모두 같으면 첫 파일만 받고 나머지는 '같은 엑셀',
// 하나라도 다르면 모두 E-UIS-TWICE. 위쪽 표는 겹친 날 숫자(줄 있음/없음 포함)가 다른 두 파일을 모두 E-UIS-TWICE로

type Read = Extract<UisFileResult, { status: 'read' }>
type Visits = Extract<UisRead, { kind: 'visits' }>

// 견줄 숫자(파서가 늘 같은 열쇠 차례로 만든다)
function signOf(read: UisRead): string {
  switch (read.kind) {
    case 'income':
      return JSON.stringify(read.row)
    case 'rx':
    case 'visitPatients':
      return JSON.stringify(read.payload)
    case 'visits':
      return JSON.stringify(read.days)
  }
}

const sameOf = ({ read }: Read): UisFileResult => ({ status: 'skipped', why: 'same', kind: read.kind, span: { ...read.span } })
const twiceOf = ({ read }: Read): UisFileResult => ({
  status: 'refused',
  code: 'E-UIS-TWICE',
  kind: read.kind,
  span: { from: read.span.from, to: read.span.to },
})

function differs(a: Visits, b: Visits): boolean {
  const from = compareYmd(a.span.from, b.span.from) >= 0 ? a.span.from : b.span.from
  const to = compareYmd(a.span.to, b.span.to) <= 0 ? a.span.to : b.span.to
  if (compareYmd(from, to) > 0) return false
  const byDay = (days: readonly UisVisitDay[]) => new Map(days.map((d) => [d.day, d]))
  const left = byDay(a.days)
  const right = byDay(b.days)
  return eachDay({ from, to }).some((day) => {
    const x = left.get(day)
    const y = right.get(day)
    if (x === undefined || y === undefined) return x !== y
    return x.patients !== y.patients || x.newPatients !== y.newPatients
  })
}

/** 파일마다의 결과(차례 그대로) → 같은 날 두 번을 정리한 결과(차례 그대로). 받지 않음·건너뜀은 그대로 */
export function settleBatch(results: readonly UisFileResult[]): UisFileResult[] {
  const settled = [...results]
  const groups = new Map<string, number[]>()
  const visits: number[] = []
  results.forEach((result, i) => {
    if (result.status !== 'read') return
    const { kind, span } = result.read
    if (kind === 'visits') {
      visits.push(i)
      return
    }
    const key = `${kind}|${span.from}|${span.to}`
    const group = groups.get(key)
    if (group === undefined) groups.set(key, [i])
    else group.push(i)
  })

  const readAt = (i: number) => results[i] as Read
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const signs = group.map((i) => signOf(readAt(i).read))
    if (signs.every((sign) => sign === signs[0])) for (const i of group.slice(1)) settled[i] = sameOf(readAt(i))
    else for (const i of group) settled[i] = twiceOf(readAt(i))
  }

  const clash = new Set<number>()
  for (let x = 0; x < visits.length; x++) {
    for (let y = x + 1; y < visits.length; y++) {
      const [a, b] = [readAt(visits[x]), readAt(visits[y])]
      if (differs(a.read as Visits, b.read as Visits)) clash.add(visits[x]).add(visits[y])
    }
  }
  for (const i of clash) settled[i] = twiceOf(readAt(i))
  return settled
}

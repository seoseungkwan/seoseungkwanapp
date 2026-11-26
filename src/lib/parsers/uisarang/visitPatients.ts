import { compareYmd, isYmd } from '@/lib/analytics/dates'
import { AGE_BANDS } from '@/lib/analytics/patientMix'
import { validateUisAgePayload } from '@/lib/payload/uisarang'
import type { Cell } from '@/types/parse'
import type { UisRead, UisSpan } from '@/types/uisarang'
import { badRow, bodyRows, ok, squash, type Body, type Sheet } from './cells'

// 내원일별 아래쪽 표 → 그날 나이대 수(specs/uisarang-upload design.md §4-4) [환자 자료 구역].
// 차트번호는 '환자 줄인가'만 보고 버리고, 주민등록번호는 이 Worker 안에서 나이 띠 하나로만 바뀐다.
// 수진자명·보험구분·진료실·전화·주소·휴대전화 칸은 읽지 않는다. 결과에는 띠마다 수만 남는다

const CHART = /^\d{1,12}$/
const RRN_HEAD = /^\d{7}$/
const NEW = '신규'
const NO_BIRTH_AT = AGE_BANDS.length // 열째 칸 = 생년월일 없음
const ROWS = AGE_BANDS.length + 1

function isChart(cell: Cell | undefined): boolean {
  if (typeof cell === 'number') return Number.isSafeInteger(cell) && cell >= 0 && String(cell).length <= 12
  return typeof cell === 'string' && CHART.test(cell.trim())
}

const ymdNumber = (ymd: string) => Number(ymd.replaceAll('-', ''))

// 주민등록번호 앞 일곱 자 → 그날 만 나이의 10살 띠 자리. 일곱째 자리 1·2·5·6 → 1900년대, 3·4·7·8 → 2000년대, 9·0 → 1800년대
function bandAt(cell: Cell | undefined, day: string): number {
  const head = (cell === null || cell === undefined ? '' : String(cell)).replace(/[\s-]/g, '').slice(0, 7)
  if (!RRN_HEAD.test(head)) return NO_BIRTH_AT
  const century = '1256'.includes(head[6]) ? 1900 : '3478'.includes(head[6]) ? 2000 : 1800
  const birth = `${century + Number(head.slice(0, 2))}-${head.slice(2, 4)}-${head.slice(4, 6)}`
  if (!isYmd(birth) || compareYmd(birth, day) > 0) return NO_BIRTH_AT
  const age = Math.floor((ymdNumber(day) - ymdNumber(birth)) / 10000)
  return Math.min(Math.floor(age / 10), AGE_BANDS.length - 1)
}

export function readVisitPatients(sheet: Sheet, span: UisSpan): Body<UisRead> {
  const { col } = sheet
  const bands = Array<number>(ROWS).fill(0)
  const newBands = Array<number>(ROWS).fill(0)
  let patients = 0
  let newPatients = 0
  for (const { row } of bodyRows(sheet)) {
    if (!isChart(row[col['차트번호']])) continue // 합계·쪽 표시·빈 차트번호 줄
    const at = bandAt(row[col['주민등록번호']], span.from)
    bands[at]++
    patients++
    if (squash(row[col['신규환자']]) === NEW) {
      newBands[at]++
      newPatients++
    }
  }
  if (patients === 0) return badRow()
  const payload = validateUisAgePayload({ v: 1, patients, newPatients, bands, newBands })
  return payload === null ? badRow() : ok({ kind: 'visitPatients', span, payload })
}

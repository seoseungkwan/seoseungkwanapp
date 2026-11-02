import { ds } from '@/components/ui/classes'
import type { ClaimVisitView, Grade } from '@/types/precheck'
import { dayLabel } from '../dateList'
import { GRADE_LABEL, GRADES, gradeChip } from './grade'

// 환자 목록 줄(AC-013.3, 목업 화면 3 '환자' 표): 진료일 · 차트번호 · 환자 · 경고 · 추천 상병. 줄은 props로만 받는다.
// 이름 단추가 키보드 길이고, 줄 어디를 눌러도 고른다

const countOf = (visit: ClaimVisitView, grade: Grade) => visit.findings.filter((finding) => finding.grade === grade).length

/** 추천 상병 칸: 맞는 상병이 없는 처방 수. 진료에 상병이 아예 없으면 '상병 없음' */
function DxCell({ visit }: { visit: ClaimVisitView }) {
  const missing = visit.dx.issues.length
  if (missing > 0) return <span className={ds.chip.negative}>상병 없음 {missing}</span>
  if (visit.dx.missingDx) return <span className={ds.chip.negative}>상병 없음</span>
  return <span className="text-muted">—</span>
}

export function VisitRows({ visits, selected, onSelect }: { visits: readonly ClaimVisitView[]; selected: string | null; onSelect(key: string): void }) {
  return (
    <>
      {visits.map((visit) => {
        const picked = visit.key === selected
        return (
          <tr key={visit.key} className={`${ds.table.row} cursor-pointer ${picked ? 'bg-canvas' : ''}`} onClick={() => onSelect(visit.key)}>
            <td className={ds.table.tdSub}>{dayLabel(visit.date)}</td>
            <td className={ds.table.tdSub}>{visit.chart}</td>
            <td className={ds.table.td}>
              <button
                type="button"
                className={`inline-flex cursor-pointer items-center text-small text-ink hover:underline ${ds.focusRing} max-md:min-h-11 ${picked ? 'font-semibold' : ''}`}
                aria-pressed={picked}
                onClick={(event) => {
                  event.stopPropagation()
                  onSelect(visit.key)
                }}
              >
                {visit.name}
              </button>
            </td>
            <td className={ds.table.td}>
              <span className="inline-flex gap-1">
                {GRADES.map((grade) => {
                  const count = countOf(visit, grade)
                  return count > 0 ? (
                    <span key={grade} className={gradeChip(grade)}>
                      {GRADE_LABEL[grade]} {count}
                    </span>
                  ) : null
                })}
              </span>
            </td>
            <td className={ds.table.td}>
              <DxCell visit={visit} />
            </td>
          </tr>
        )
      })}
    </>
  )
}

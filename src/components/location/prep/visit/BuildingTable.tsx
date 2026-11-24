import { useId } from 'react'
import { useReadOnly } from '@/components/shell/viewing'
import { BUILDING_CHECKS, HOW_MAX, checkOf, countChecks, type CleanChecks } from '@/lib/location/checklist'
import { look } from './look'
import { LawLink, SectionHead } from './parts'
import { BUILDING_TEXT as T } from './text'

// 건물 요건 표(시안 ?s=plan 건물 요건 표, design.md 11절 BUILDING_CHECKS 10줄, AC-7913.3·AC-7913.5).
// 칸(○·✕·?)은 누를 때마다 바뀌고(nextCheck) 부모가 바로 저장한다. '어떻게 알았나'는 줄마다 40자 글이고, 칸을 떠날 때 저장한다.
// 값은 PrepVisit이 가진 checks(지금 고치는 값)를 그대로 그린다

export type BuildingTableProps = {
  checks: CleanChecks
  onCycle: (id: string) => void
  onHow: (id: string, text: string) => void
  onHowDone: () => void
  onOpenLaw?: (id: string) => void
}

export function BuildingTable({ checks, onCycle, onHow, onHowDone, onOpenLaw }: BuildingTableProps) {
  const titleId = useId()
  // 다른 의원을 보는 중(읽기만, admin-view AC-8010.2)이면 O·X 단추는 막히고 '어떻게 알았나' 칸은 읽기만
  const readOnly = useReadOnly()
  return (
    <section aria-labelledby={titleId} className="min-w-0">
      <SectionHead id={titleId} title={T.title} aside={T.aside} />
      <div className={look.tableWrap}>
        <table className={look.table}>
          <thead>
            <tr>
              {T.heads.map((h, i) => (
                <th key={h} scope="col" className={i === 2 ? look.thCenter : look.th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BUILDING_CHECKS.map((item) => {
              const v = checkOf(checks, item.id)
              return (
                <tr key={item.id} className={look.row}>
                  <td className={look.td}>
                    <b className="font-semibold">{item.label}</b>
                  </td>
                  <td className={`${look.td} text-ink-2`}>{item.need}</td>
                  <td className={look.tdCenter}>
                    <button type="button" className={look.oxButton} aria-label={T.oxLabel(item.label, v)} disabled={readOnly} onClick={() => onCycle(item.id)}>
                      <span aria-hidden="true" className={look.ox[v]}>
                        {T.mark[v]}
                      </span>
                    </button>
                  </td>
                  <td className={look.td}>
                    <input
                      type="text"
                      className={look.cellInput}
                      aria-label={T.howLabel(item.label)}
                      maxLength={HOW_MAX}
                      readOnly={readOnly}
                      value={checks.how?.[item.id] ?? ''}
                      onChange={(e) => onHow(item.id, e.currentTarget.value)}
                      onBlur={onHowDone}
                    />
                  </td>
                  <td className={look.td}>
                    <LawLink law={item.law} onOpen={onOpenLaw} noLaw />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className={`mt-2 ${look.small}`}>{T.count(countChecks(checks, BUILDING_CHECKS))}</p>
    </section>
  )
}

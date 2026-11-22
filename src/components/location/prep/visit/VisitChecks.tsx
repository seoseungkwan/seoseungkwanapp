import { useId } from 'react'
import { VISIT_CHECKS, checkOf, countChecks, type CleanChecks } from '@/lib/location/checklist'
import { look } from './look'
import { CheckRow, SectionHead } from './parts'
import { VISIT_TEXT as T } from './text'
import { VisitPhotos, type VisitPhotosProps } from './VisitPhotos'

// 보러 갈 때 점검표(시안 ?s=plan, design.md 11절 VISIT_CHECKS 10줄 체크 칸, AC-7913.3·AC-7913.5) + 그 아래 사진(AC-7913.4).
// 곁글 `{n} / 10 했어요`는 켠 줄 수다

export type VisitChecksProps = VisitPhotosProps & {
  checks: CleanChecks
  onToggle: (id: string, on: boolean) => void
  onOpenLaw?: (id: string) => void
}

export function VisitChecks({ checks, onToggle, onOpenLaw, ...photos }: VisitChecksProps) {
  const titleId = useId()
  const done = countChecks(checks, VISIT_CHECKS).yes
  return (
    <section aria-labelledby={titleId} className="min-w-0">
      <SectionHead id={titleId} title={T.title} aside={T.done(done, VISIT_CHECKS.length)} />
      <div className={`mt-3 ${look.checkList2}`}>
        {VISIT_CHECKS.map((item) => (
          <CheckRow key={item.id} item={item} value={checkOf(checks, item.id)} onToggle={onToggle} onOpenLaw={onOpenLaw} />
        ))}
      </div>
      <VisitPhotos {...photos} />
    </section>
  )
}

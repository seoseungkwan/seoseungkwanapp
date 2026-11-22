import { SourceLine } from '@/components/location/common/SourceLine'
import type { Flag } from '@/lib/location/flags'
import { isLawId } from '@/lib/location/sources'
import type { SourceId } from '@/types/location'
import { FlagIcon, WarnIcon } from './icons'
import { look } from './look'
import { TabLink, lawHref } from './TabLink'
import { FRAME_TEXT as T } from './text'

// 위험 신호 목록(시안 .flags, AC-7911.3·AC-7911.4): 받은 차례 그대로(flags.ts가 design.md 9절 차례로 고름).
// 빨간 깃발(red)은 깃발 그림·주황 제목, '확인 필요'(check, 위반 건축물을 안 고름·모름)는 경고 그림·검은 제목 + 칩.
// 근거는 법 id면 [법 근거](근거와 출처의 법 줄), 출처 id면 출처 줄(그날 값 기준 날짜)

export type FlagListProps = {
  flags: readonly Flag[]
  /** 출처 id → 그날 값 기준 날짜 */
  asOfOf: (src: SourceId) => string | null
  onOpenSource?: (id: SourceId) => void
  onOpenLaw?: (id: string) => void
}

export function FlagList({ flags, asOfOf, onOpenSource, onOpenLaw }: FlagListProps) {
  if (flags.length === 0) return <p className="text-body text-muted">{T.flagsNone}</p>
  return (
    <div role="list" aria-label={T.flagsList} className="rounded-control bg-negative-soft px-4 py-1">
      {flags.map((f) => {
        const check = f.level === 'check'
        const law = f.law
        return (
          <div
            key={f.id}
            role="listitem"
            data-level={f.level}
            className="grid grid-cols-[18px_minmax(0,1fr)] gap-2 border-negative/20 py-2.5 not-first:border-t"
          >
            {check ? <WarnIcon className="mt-0.75 text-warning" /> : <FlagIcon className="mt-0.75 text-negative" />}
            <div className="min-w-0">
              <p className="text-body text-ink">
                <b className={check ? 'font-semibold text-ink' : 'font-semibold text-negative'}>{f.title}</b>
                {check && (
                  <>
                    {' '}
                    <span className={look.chipWarning}>{T.check}</span>
                  </>
                )}
              </p>
              <p className="text-small text-ink-2">{f.detail}</p>
              {law !== null && isLawId(law) ? (
                <TabLink href={lawHref(law)} className={`text-small ${look.inlineLink}`} onOpen={onOpenLaw && (() => onOpenLaw(law))}>
                  {T.law}
                </TabLink>
              ) : (
                f.src !== null && <SourceLine src={f.src} asOf={asOfOf(f.src)} onOpen={onOpenSource} />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

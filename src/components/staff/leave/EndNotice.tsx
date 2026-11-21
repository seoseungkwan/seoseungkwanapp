import { useId } from 'react'
import { ds } from '@/components/ui/classes'
import { fmtDays, mmdd, type EndNotice as Notice } from './leaveView'

// 이번 달 연차 기간이 끝나는 직원 안내 (staff AC-7614.6, 시안 leave.html ⑥ '나'). 연차 현황 위에 뜬다.
// 수당으로 정산이면 사람마다 끝날과 정산 일수(금액은 세무사가 셈), 다음 해로 넘김이면 한 줄. 그런 사람이 없으면 그리지 않는다

export function EndNotice({ notice, month }: { notice: Notice; month: string }) {
  const titleId = useId()
  if (notice === null) return null
  if (notice.kind === 'carry') {
    return <p className="rounded-control bg-warning-soft px-4 py-3 text-small font-medium text-warning">남은 일수를 다음 기간에 더했어요</p>
  }
  const title = `이번 달 연차 기간이 끝나는 직원 ${notice.people.length}명 — ${Number(month.slice(5, 7))}월 세무사 자료에 일수가 들어가요.`
  return (
    <section aria-labelledby={titleId} className="grid gap-3 rounded-control border border-line bg-warning-soft px-4 py-3">
      <p id={titleId} className="text-body font-semibold text-warning">
        {title}
      </p>
      <ul className="rounded-control border border-line bg-surface">
        {notice.people.map((p) => (
          <li key={p.id} className="flex items-baseline justify-between gap-2 border-b border-line px-3 py-2 last:border-b-0">
            <span>
              <span className="text-body text-ink">{p.name}</span>{' '}
              <span className={ds.help}>{`${mmdd(p.end)}에 ${p.ended ? '끝났어요' : '끝나요'}`}</span>
            </span>{' '}
            <b className="font-semibold text-ink tabular-nums">{fmtDays(p.days)}</b>
          </li>
        ))}
      </ul>
      <p className="text-caption text-ink-2">
        {notice.firstEnd !== null ? `금액은 세무사가 계산해요. ${mmdd(notice.firstEnd)} 전에 쓰면 일수가 줄어요.` : '금액은 세무사가 계산해요.'}
      </p>
    </section>
  )
}

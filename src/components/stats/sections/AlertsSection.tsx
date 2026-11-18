'use client'

import { useMemo } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { groupKey } from '@/components/stats/treatmentView'
import type { WideDays } from '@/components/stats/useWideDays'
import { ds } from '@/components/ui/classes'
import { buildAlerts, type Alert, type AlertGroup } from '@/lib/analytics/alerts'
import type { CalCountRow } from '@/types/calendar'
import type { StatsRxGroup } from '@/types/rxGroups'
import { Note, Section } from './parts'

// 평소와 다른 것 (stats-insights REQ-6101 AC-6101.5, 시안 docs/mockups/stats-insights ① · 요약 칸 맨 위).
// 기간 고르기와 상관없이 오늘 기준: 이번 주(월~어제)를 앞선 4주의 같은 요일과 견준 알림 줄(lib/analytics/alerts buildAlerts)을 그대로 그린다.
// 줄 = 표시(▼ 적음 · ▲ 많음 · ! 주의, 색과 함께 — 뜻은 문장이 말해 화면 읽기에서는 뺀다) + 굵은 이름으로 시작하는 문장 + 오른쪽 기간.
// 묶음은 처방 칸 묶음(넣는 처방·빼는 처방·조건의 열쇠, treatmentView groupKey) 이름으로 센다. 예약 줄(null이면 예약 알림 없음)은 이름·차트번호 없는 수 세기 줄이다.
// 넓은 하루를 읽는 중이거나 견줄 날이 하루도 없으면 칸을 그리지 않는다. 읽기에 실패하면 오류 카드 + [다시 읽기]

const TITLE = '평소와 다른 것'
const CALM = '평소와 비슷해요'
const NOTE = '이번 주(월~어제)를 지난 4주의 같은 요일과 견줘요. 15% 넘게 달라지고 평소 수가 10 이상일 때만 보여요.'
const RETRY = '다시 읽기'
const MARK: Record<Alert['kind'], string> = { down: '▼', up: '▲', warn: '!' }
const TONE: Record<Alert['kind'], string> = { down: 'text-negative', up: 'text-positive', warn: 'text-warning' }
// 줄(시안 .alert): 1px 선 · 작은 모서리 · 안쪽 8px 12px, 사이 6px. 휴대폰은 기간이 문장 아래 줄로 내려간다(표시 폭만큼 들여서)
const LIST = 'mt-3 grid gap-1.5'
const ROW = 'flex flex-wrap items-baseline gap-x-2 rounded-st-sm border border-st-line px-3 py-2 text-st-15 leading-6'
const TEXT = 'min-w-0 flex-1 text-st-ink-2'
const RANGE = 'ml-auto whitespace-nowrap text-small tabular-nums text-st-muted max-md:basis-full max-md:pl-6'

type Props = {
  today: string // 한국 날짜
  wide: WideDays // 넓은 하루 읽기(useWideDays)
  groups: readonly StatsRxGroup[] // 처방 칸 묶음(useStatsRxGroups)
  cal: readonly CalCountRow[] | null // 예약 수 세기 줄(useStatsCalendar). 읽는 중·실패·없음이면 null
}

// 처방 든 묶음만, sortOrder 차례, 같은 열쇠는 한 번만(groupDefs와 같은 규칙)
function alertGroups(groups: readonly StatsRxGroup[]): AlertGroup[] {
  const seen = new Set<string>()
  return [...groups]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((group) => {
      if (group.codes.length === 0) return []
      const id = groupKey(group.codes, group)
      if (seen.has(id)) return []
      seen.add(id)
      return [{ id, name: group.name }]
    })
}

function AlertRow({ alert }: { alert: Alert }) {
  return (
    <li className={ROW}>
      <span aria-hidden="true" className={`w-4 shrink-0 text-center font-semibold ${TONE[alert.kind]}`}>
        {MARK[alert.kind]}
      </span>
      <span className={TEXT}>
        <span className="font-semibold text-st-ink">{alert.name}</span>
        {alert.text.slice(alert.name.length)}
      </span>
      <span className={RANGE}>{alert.range}</span>
    </li>
  )
}

export function AlertsSection({ today, wide, groups, cal }: Props) {
  const ready = wide.state === 'ready'
  const alerts = useMemo(() => (ready ? buildAlerts({ today, days: wide.days, groups: alertGroups(groups), cal }) : null), [ready, today, wide.days, groups, cal])

  if (wide.state === 'failed') {
    return (
      <Section title={TITLE}>
        <div className="mt-3">
          <ErrorCard code="E-STATS-READ-FAILED" />
        </div>
        <div className="mt-2">
          <button type="button" onClick={wide.retry} className={`${ds.button.secondarySmall} max-md:w-full`}>
            {RETRY}
          </button>
        </div>
      </Section>
    )
  }
  if (alerts === null) return null
  return (
    <Section title={TITLE}>
      {alerts.length === 0 ? (
        <p className="mt-3 text-body text-st-ink-2">{CALM}</p>
      ) : (
        <ul aria-label={TITLE} className={LIST}>
          {alerts.map((alert) => (
            <AlertRow key={`${alert.kind}|${alert.name}`} alert={alert} />
          ))}
        </ul>
      )}
      <Note>{NOTE}</Note>
    </Section>
  )
}

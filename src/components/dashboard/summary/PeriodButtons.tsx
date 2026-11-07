'use client'

import { useId } from 'react'
import { PeriodPicker } from '@/components/stats/PeriodPicker'
import { ds } from '@/components/ui/classes'
import type { Flow, FlowChoice } from './flow'
import { PERIODS } from './view'

// 추이 조회 기간 묶음 (dashboard-ux REQ-2703 AC-2703.2, design.md §4, 시안 docs/mockups/dashboard-ux .scope·.seg·.pick).
// 위에 묶음 이름 "추이 조회 기간"(role="group"의 이름), 그 아래 한 줄에 빠른 단추 셋(ds.segment) · 통계 탭 기간 고르기(판은 오른쪽 끝 맞춤),
// 맨 아래 적용 글. 기준일(일별 현황)과 따로 움직인다는 것을 글로 밝힌다. 고른 것은 부르는 쪽(추이 구역)이 쥔다 — props만 받는다.
// 768px 이상은 묶음 안 줄이 오른쪽 끝에 맞고(구역 머리 오른쪽에 놓인다), 768px 미만은 전체 폭으로 한 줄씩 쌓인다(빠른 단추는 같은 폭 세 칸·44px)

type Props = {
  /** 고른 것: 빠른 단추 일 수(7·30·90) 또는 기간 고르기에서 고른 기간 */
  choice: FlowChoice
  /** 빠른 단추 또는 고른 기간을 바꾼다 */
  onChoose: (next: FlowChoice) => void
  /** PeriodPicker choice(flow.picker — 빠른 단추는 '7d'·'30d'·'90d') */
  picker: Flow['picker']
  /** 끝난 마지막 날(flow.lastDay) */
  lastDay: string
  /** 오늘 진료가 끝났다(todayFinished) */
  todayDone: boolean
  /** [기간 골라 보기]를 그린다(그래프를 그리는 갈래만). 기본 true */
  showPicker?: boolean
}

export function PeriodButtons({ choice, onChoose, picker, lastDay, todayDone, showPicker = true }: Props) {
  const captionId = useId()
  return (
    <div role="group" aria-labelledby={captionId} className="flex min-w-0 flex-col gap-1 md:items-end max-md:w-full">
      <p id={captionId} className="text-caption font-medium text-muted">
        추이 조회 기간
      </p>
      <div className="flex flex-wrap items-end gap-2 md:justify-end max-md:flex-col max-md:items-stretch">
        <div role="group" aria-label="기간" className={`${ds.segment.group} max-md:grid-cols-3`}>
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={p === choice}
              onClick={() => onChoose(p)}
              className={`${ds.segment.button} ${p === choice ? ds.segment.on : ds.segment.off}`}
            >
              {`최근 ${p}일`}
            </button>
          ))}
        </div>
        {/* 통계 탭 기간 고르기 그대로. 부품은 고른 기간만 돌려준다(빠른 단추 값은 위 단추가 맡는다) */}
        {showPicker && (
          <PeriodPicker
            align="end"
            choice={picker}
            lastDay={lastDay}
            todayDone={todayDone}
            onChoose={(next) => {
              if (typeof next !== 'string') onChoose(next)
            }}
          />
        )}
      </div>
      <p className="text-caption text-muted">아래 그래프 4개에 적용 · 기준일과 따로예요</p>
    </div>
  )
}

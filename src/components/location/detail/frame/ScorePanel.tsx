'use client'

import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { sourceHref } from '@/components/location/common/text'
import { ds } from '@/components/ui/classes'
import { distText } from '@/lib/location/coords'
import { SCORE_GROUPS, type GroupId, type ScoreResult } from '@/lib/location/score'
import type { RadiusM } from '@/types/location'
import { look } from './look'
import { TabLink } from './TabLink'
import { FRAME_TEXT as T, RADII } from './text'

// 종합 점수 + 살필 범위(시안 .scorebox): 왼쪽 큰 점수 · 항목 다섯 막대(점수/만점) · 매기는 법, 오른쪽 범위 막대(일곱 값) · 지도 칸.
// 점수는 부르는 쪽(CandidateFrame)이 score.ts로 센 값을 받는다. 만점 = 버림(무게 × 100 ÷ 값 있는 항목 무게 합)(시안 maxPts).
// 범위 막대는 끄는 동안 글만 바꾸고, 멈춘 뒤 RADIUS_DELAY_MS가 지나면 한 번 onRadius(후보 id, m)를 부른다(다시 받기는 포털을 여러 번 부름).
// 기다리는 동안 다른 후보로 바뀌거나 화면이 사라지면 기다리던 값을 그 후보 id로 바로 넘긴다

/** 범위 막대를 멈춘 뒤 넘기기까지 기다리는 시간 */
export const RADIUS_DELAY_MS = 800

type Pending = { id: string; base: RadiusM; r: RadiusM }
type Saver = { timer: ReturnType<typeof setTimeout> | null; pending: Pending | null; onRadius: (id: string, r: RadiusM) => void }

function flush(s: Saver) {
  if (s.timer !== null) clearTimeout(s.timer)
  s.timer = null
  const p = s.pending
  s.pending = null
  if (p && p.r !== p.base) s.onRadius(p.id, p.r)
}

type RangeProps = { candidateId: string; radiusM: RadiusM; disabled: boolean; onRadius: (id: string, r: RadiusM) => void }

function RangeControl({ candidateId, radiusM, disabled, onRadius }: RangeProps) {
  const uid = useId()
  const [draft, setDraft] = useState({ id: candidateId, base: radiusM, r: radiusM })
  const saver = useRef<Saver>({ timer: null, pending: null, onRadius })

  useEffect(() => {
    saver.current.onRadius = onRadius
  })
  // 후보가 바뀌거나 화면이 사라지면 기다리던 범위를 넘긴다
  useEffect(() => {
    const s = saver.current
    return () => flush(s)
  }, [candidateId])

  // 다른 후보 · 다시 받은 범위가 오면 그 값으로 놓는다
  if (draft.id !== candidateId || draft.base !== radiusM) setDraft({ id: candidateId, base: radiusM, r: radiusM })

  function change(e: ChangeEvent<HTMLInputElement>) {
    const r = RADII[Number(e.target.value)]
    if (r === undefined) return
    setDraft((d) => ({ ...d, r }))
    const s = saver.current
    if (s.timer !== null) clearTimeout(s.timer)
    s.pending = { id: candidateId, base: radiusM, r }
    s.timer = setTimeout(() => flush(s), RADIUS_DELAY_MS)
  }

  const label = distText(draft.r)
  const ticks = [RADII[0]!, 1000, RADII[RADII.length - 1]!].map(distText)
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={`${uid}-range`} className="text-small font-semibold text-ink">
          {T.range}
        </label>
        <b className="text-title font-semibold tabular-nums text-ink">{label}</b>
      </div>
      <input
        id={`${uid}-range`}
        type="range"
        min={0}
        max={RADII.length - 1}
        step={1}
        value={Math.max(0, RADII.indexOf(draft.r))}
        aria-valuetext={label}
        disabled={disabled}
        onChange={change}
        className={`h-6 w-full min-w-0 cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-40 ${ds.focusRing}`}
      />
      <div className="flex justify-between text-caption tabular-nums text-muted" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <p className={look.help}>{T.rangeHelp}</p>
    </div>
  )
}

export type ScorePanelProps = {
  score: ScoreResult
  /** 바깥 무게 다섯(받은 설정 그대로) */
  weights: Record<GroupId, number>
  /** 후보 매물이 있나 — 없으면 비용 항목 자리에 `매물 없음` */
  hasListing: boolean
  candidateId: string
  radiusM: RadiusM
  /** 자료를 받는 중이면 범위를 막는다 */
  busy: boolean
  onRadius: (candidateId: string, radiusM: RadiusM) => void
  map?: ReactNode
  /** 매기는 법을 누르면(주지 않으면 '근거와 출처' 주소로 간다) */
  onOpenSource?: (id: string) => void
}

const SCORE_SRC = 'score'

export function ScorePanel({ score, weights, hasListing, candidateId, radiusM, busy, onRadius, map, onOpenSource }: ScorePanelProps) {
  const groups = SCORE_GROUPS.map((g) => ({ def: g, got: score.groups.find((x) => x.id === g.id) }))
  const usedW = groups.reduce((a, { def, got }) => (got && got.score !== null ? a + weights[def.id] : a), 0)
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-x-8 gap-y-6">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          {score.total === null ? (
            <b data-testid="score-total" className="text-title font-semibold text-muted">
              {T.noScore}
            </b>
          ) : (
            <>
              <b data-testid="score-total" className="text-display font-semibold tabular-nums text-ink">
                {score.total}
              </b>
              <span className="text-subtitle text-muted">{T.outOf}</span>
            </>
          )}
        </div>
        <div className="mt-2 border-t border-line">
          {groups.map(({ def, got }) => {
            const has = got !== undefined && got.score !== null && got.points !== null
            const max = usedW > 0 ? Math.floor((weights[def.id] * 100) / usedW) : 0
            const none = def.id === 'cost' && !hasListing ? T.noListing : T.noValue
            return (
              <div
                key={def.id}
                data-testid="score-row"
                className="grid grid-cols-[120px_minmax(0,1fr)_72px] items-center gap-3 border-b border-line py-2 text-small"
              >
                <span data-part="name" className="text-ink-2">
                  {def.name}
                </span>
                <div className="h-2 border border-line bg-canvas" aria-hidden="true">
                  <i className="block h-full bg-accent" style={{ width: `${has ? got.score : 0}%` }} />
                </div>
                <span data-part="points" className="text-right tabular-nums text-muted">
                  {has ? (
                    <>
                      <b className="font-semibold text-ink">{got.points}</b> / {max}
                    </>
                  ) : (
                    <span className="font-medium">{none}</span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
        <p className={`mt-2 ${look.help}`}>
          {T.scoreHelp}{' '}
          <TabLink href={sourceHref(SCORE_SRC)} className={look.inlineLink} onOpen={onOpenSource && (() => onOpenSource(SCORE_SRC))}>
            {T.scoreHow}
          </TabLink>
        </p>
      </div>
      <div className="min-w-0">
        <RangeControl candidateId={candidateId} radiusM={radiusM} disabled={busy} onRadius={onRadius} />
        {map != null && map !== false && (
          <div className="mt-2 overflow-clip rounded-control border border-line bg-canvas">
            {map}
            <p className="border-t border-line px-2.5 py-1.5 text-caption text-muted">{T.mapLegend}</p>
          </div>
        )}
      </div>
    </div>
  )
}

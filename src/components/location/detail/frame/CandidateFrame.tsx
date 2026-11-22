'use client'

// 후보 자세히 — 틀(spec location TASK-32 · AC-7909.1·AC-7911.3·AC-7908.3·AC-7908.4, design.md 9·14절, 시안 ?s=candidate).
// 차례: 머리([오늘 값으로 다시 받기]·기준 날짜) → 왼쪽 목차 | 위험 신호 → 종합 점수 + 살필 범위(지도 칸) → 묶음 열둘.
// 묶음 열둘은 칸(sections)으로 받아 차례대로 놓기만 한다 — 묶음 부품을 부르지 않고, 칸이 제 머리(제목·곁글)와 몸을 그린다.
// 위험 신호(flags.ts)·점수(score.ts, 받은 설정 그대로)는 후보 줄·그날 값·매물로 여기서 센다. 설정이 바뀌면 다시 받지 않고 바로 다시 센다.
// 부품은 props·콜백만 받는다(읽기·저장·바깥 부르기 없음):
//   onOpen(후보 id)     — 후보를 열 때마다 한 번(카카오 주소 글·둘레 시설·로드뷰를 새로 부르라는 뜻, 저장하지 않음 · AC-7908.4)
//   onRefresh(후보 id)  — [오늘 값으로 다시 받기](AC-7908.3)
//   onRadius(후보 id, m) — 살필 범위를 바꾼 뒤 멈추면 한 번(다시 받기, AC-7908.3)
//   onGo(탭)            — [한 장 보고서]·[개원 준비]·[매물 보기]

import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { todayInKorea } from '@/lib/analytics/dates'
import { m2ToPyeong, MAX_M2 } from '@/lib/location/area'
import { pickFlags } from '@/lib/location/flags'
import { wonText } from '@/lib/location/money'
import { fillScoreRule, scoreItems, type ScoreRule } from '@/lib/location/score'
import type { Candidate, Listing, RadiusM, SourceId } from '@/types/location'
import { candidateListing, flagInputOf, rivalCount, scoreFactsOf, sourceAsOf } from './facts'
import { FlagList } from './FlagList'
import { FrameHead, type FrameTab } from './FrameHead'
import { look } from './look'
import { ScorePanel } from './ScorePanel'
import { FRAME_TEXT as T, SECTIONS, STATUS_TEXT, type SectionId } from './text'
import { Toc, type TocItem } from './Toc'

export { RADIUS_DELAY_MS } from './ScorePanel'
export { SECTIONS, type SectionId } from './text'
export type { FrameTab } from './FrameHead'

export type CandidateFrameProps = {
  candidate: Candidate
  /** 후보 표시 글자(A·B…) — 칩 `후보 {글자}`. 없으면 칩을 그리지 않는다 */
  letter?: string
  /** 열 때 카카오에서 새로 받은 주소 글(저장하지 않음). 없으면 적은 주소 글 */
  kakaoAddress?: string | null
  /** 저장한 매물 모두(후보 매물 = 이 후보에 이어진 것 가운데 마지막으로 고친 것) */
  listings: readonly Listing[]
  /** 점수 설정(location_settings.score_rule) — 받은 값 그대로 쓴다 */
  rule: ScoreRule
  /** 지금 의원 체외충격파 값(원) */
  homeEswt: number | null
  /** 한국 날짜 'YYYY-MM-DD' */
  today: string
  /** 자료를 받는 중이면 `자료 {done}/{total}` — 다시 받기·범위를 막는다 */
  progress?: { done: number; total: number } | null
  /** 묶음 열둘(칸). 주지 않은 칸은 본문·목차에서 빠진다 */
  sections: Partial<Record<SectionId, ReactNode>>
  /** 살필 범위 아래 지도 칸 */
  map?: ReactNode
  onOpen: (candidateId: string) => void
  onRefresh: (candidateId: string) => void
  onRadius: (candidateId: string, radiusM: RadiusM) => void
  onGo: (tab: FrameTab) => void
  /** 출처 줄·매기는 법을 누르면(주지 않으면 '근거와 출처' 주소로 간다) */
  onOpenSource?: (id: SourceId) => void
  /** [법 근거]를 누르면(주지 않으면 '근거와 출처' 주소로 간다) */
  onOpenLaw?: (id: string) => void
}

/** 시각(ISO) → 한국 날짜. 읽을 수 없으면 null */
function koreanDay(at: string | null): string | null {
  if (at === null || Number.isNaN(Date.parse(at))) return null
  return todayInKorea(new Date(at))
}

/** 머리 한 줄: 주소 · 전용 {평}평 · 보증금 {금액} / 월세 {금액} */
function headLine(address: string, listing: Listing | null): string {
  const parts = address === '' ? [] : [address]
  if (listing) {
    const a = listing.areaM2
    if (a !== null && a > 0 && a <= MAX_M2) parts.push(`전용 ${m2ToPyeong(a)}평`)
    const money = [listing.deposit !== null ? `보증금 ${wonText(listing.deposit)}` : null, listing.rent !== null ? `월세 ${wonText(listing.rent)}` : null]
    const m = money.filter((x) => x !== null).join(' / ')
    if (m !== '') parts.push(m)
  }
  return parts.join(' · ')
}

function SectionHead({ title, count, aside }: { title: string; count?: number; aside: string }) {
  return (
    <div className={look.sectionHead}>
      <h3 className={look.sectionTitle}>
        {title}
        {count !== undefined && (
          <>
            {' '}
            <span className={look.sectionCount}>{count}</span>
          </>
        )}
      </h3>
      <span className={look.sectionAside}>{aside}</span>
    </div>
  )
}

export function CandidateFrame(props: CandidateFrameProps) {
  const { candidate: c, listings, rule, homeEswt, today, progress, sections, onOpenSource } = props

  // 후보를 열 때마다 한 번(같은 후보를 다시 그릴 때는 부르지 않는다). 콜백이 새로 와도 다시 부르지 않게 마지막 것을 담아 둔다
  const latest = useRef(props)
  useEffect(() => {
    latest.current = props
  })
  useEffect(() => {
    latest.current.onOpen(c.id)
  }, [c.id])

  const flags = useMemo(() => pickFlags(flagInputOf({ candidate: c, listings, today })), [c, listings, today])
  const filled = useMemo(() => fillScoreRule(rule), [rule])
  const score = useMemo(() => scoreItems(scoreFactsOf({ candidate: c, listings, homeEswt, today }), filled), [c, listings, homeEswt, today, filled])
  const listing = candidateListing(c.id, listings)
  const rivals = rivalCount(c)

  const day = koreanDay(c.snapshot ? (c.snapshotAt ?? c.snapshot.at) : null)
  const frozen = day === null ? T.noSnapshot : T.frozen(day, day !== koreanDay(c.createdAt))
  const busy = progress != null
  const address = (props.kakaoAddress ?? '').trim() || c.addressNote.trim()

  const shown = SECTIONS.filter((s) => sections[s.id] != null && sections[s.id] !== false)
  const toc: TocItem[] = [
    { id: 'flags', title: T.flagsTitle, badge: flags.length > 0 ? <span className={look.chipNegative}>{flags.length}</span> : undefined },
    { id: 'score', title: T.scoreTitle, badge: score.total !== null ? <span className="tabular-nums text-muted">{score.total}</span> : undefined },
    ...shown.map((s) => ({
      id: s.id,
      title: s.title,
      badge: s.id === 'rivals' && rivals !== null ? <span className="tabular-nums text-muted">{rivals}</span> : undefined,
    })),
  ]

  // 목차가 건너뛸 자리(칸 안에 같은 닻이 있어도 틀의 자리로 간다)
  const spots = useRef(new Map<string, HTMLElement>())
  const spot = (id: string) => (el: HTMLElement | null) => {
    if (el) spots.current.set(id, el)
    else spots.current.delete(id)
  }
  const jump = (id: string) => {
    const el = spots.current.get(id)
    if (!el) return
    el.scrollIntoView({ block: 'start' })
    el.focus({ preventScroll: true })
  }

  return (
    <div className="min-w-0">
      <FrameHead
        letter={props.letter}
        status={STATUS_TEXT[c.status]}
        name={c.name}
        line={headLine(address, listing)}
        frozen={frozen}
        progress={busy ? T.progress(progress.done, progress.total) : null}
        onRefresh={() => props.onRefresh(c.id)}
        onGo={props.onGo}
      />
      <div className="mt-5 grid grid-cols-[176px_minmax(0,1fr)] items-start gap-8">
        <Toc items={toc} onJump={jump} />
        <div className="grid min-w-0 gap-10">
          <section id="sec-flags" ref={spot('flags')} tabIndex={-1} className={look.section} aria-label={T.flagsTitle}>
            <SectionHead title={T.flagsTitle} count={flags.length} aside={T.flagsAside} />
            <div className={look.sectionBody}>
              <FlagList
                flags={flags}
                asOfOf={(src) => sourceAsOf(c.snapshot, src)}
                onOpenSource={onOpenSource}
                onOpenLaw={props.onOpenLaw}
              />
            </div>
          </section>
          <section id="sec-score" ref={spot('score')} tabIndex={-1} className={look.section} aria-label={T.scoreTitle}>
            <SectionHead title={T.scoreTitle} aside={T.scoreAside} />
            <div className={look.sectionBody}>
              <ScorePanel
                score={score}
                weights={filled.weights}
                hasListing={listing !== null}
                candidateId={c.id}
                radiusM={c.radiusM}
                busy={busy}
                onRadius={props.onRadius}
                map={props.map}
                onOpenSource={onOpenSource}
              />
            </div>
          </section>
          {shown.map((s) => (
            <section key={s.id} id={`sec-${s.id}`} ref={spot(s.id)} tabIndex={-1} className={look.section} aria-label={s.title}>
              {sections[s.id]}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

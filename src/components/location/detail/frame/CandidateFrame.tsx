'use client'

// 후보 자세히 — 틀(spec location TASK-32 · TASK-68 · AC-7909.1·AC-7911.1·AC-7911.3·AC-7920.3·AC-7908.3·AC-7908.4, design.md 9·14·18·19절, 시안 ?s=candidate).
// 차례: 머리([오늘 값으로 다시 받기]·기준 날짜) → 왼쪽 목차 | 위험 신호 → 종합 점수 + 점수 풀이 + 살필 범위(지도 칸) → 묶음 열셋.
// 묶음 열셋은 칸(sections)으로 받아 차례대로 놓기만 한다 — 묶음 부품을 부르지 않고, 칸이 제 머리(제목·곁글)·닻 id(`sec-…`)와 몸을 그린다.
// 칸 감싸개는 id 없이 ref·tabIndex만 둔다(목차는 ref로 건너뜀) — 같은 닻 id가 두 번 나오지 않게(AC-7909.1).
// 위험 신호(flags.ts)·점수(score.ts)·점수 풀이(explain.ts)는 후보 줄·그날 값·매물·설정으로 여기서 센다. 점수 입력은 lib/location/facts.ts 한 곳,
// 경쟁 의원 = 지금 과목 고르기(deptRule)의 경쟁 과목(18절). 설정이 바뀌면 다시 받지 않고 바로 다시 센다.
// 부품은 props·콜백만 받는다(읽기·저장·바깥 부르기 없음):
//   onOpen(후보 id)     — 후보를 열 때마다 한 번(카카오 주소 글·둘레 시설·로드뷰를 새로 부르라는 뜻, 저장하지 않음 · AC-7908.4)
//   onRefresh(후보 id)  — [오늘 값으로 다시 받기](AC-7908.3)
//   onRadius(후보 id, m) — 살필 범위를 바꾼 뒤 멈추면 한 번(다시 받기, AC-7908.3)
//   onGo(탭)            — [한 장 보고서]·[개원 준비]·[매물 보기]

import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { todayInKorea } from '@/lib/analytics/dates'
import { m2ToPyeong, MAX_M2 } from '@/lib/location/area'
import { deptOf, deptRole } from '@/lib/location/depts'
import { explainCandidate, listingAverages } from '@/lib/location/explain'
import { candidateListing, flagInputOf, rivalCount, scoreFactsOf, shownValue, sourceAsOf } from '@/lib/location/facts'
import { pickFlags } from '@/lib/location/flags'
import { manText } from '@/lib/location/money'
import { fillScoreRule, scoreItems, type ScoreRule } from '@/lib/location/score'
import { RefreshBusy } from '@/components/location/common/RefreshBusy'
import { refreshingText } from '@/components/location/common/text'
import type { Candidate, DeptRule, Listing, RadiusM, SggAvg, SourceId } from '@/types/location'
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
  /** 의원 과목 고르기(location_settings.dept_rule, fillDeptRule을 거친 값) — 경쟁 수·위험 신호·점수가 따른다 */
  deptRule: DeptRule
  /** 점수 풀이 견줄 값(후보 시군구 전체). 주지 않으면 그날 값의 sggAvg, null이면 견줄 값 없음 */
  sggAvg?: SggAvg | null
  /** 지금 의원 체외충격파 값(원) */
  homeEswt: number | null
  /** 한국 날짜 'YYYY-MM-DD' */
  today: string
  /** 자료를 받는 중이면 `자료 {done}/{total}` — 다시 받기·범위를 막는다 */
  progress?: { done: number; total: number } | null
  /** 묶음 열셋(칸). 주지 않은 칸은 본문·목차에서 빠진다 */
  sections: Partial<Record<SectionId, ReactNode>>
  /** 살필 범위 아래 지도 칸 */
  map?: ReactNode
  /** 지도 범례 글(고른 과목을 따르는 글). 없으면 처음 글 */
  mapLegend?: string
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

/** 머리 한 줄: 주소 · 전용 {평}평 · 보증금 {금액} / 월세 {금액}(만 원 칸 금액 글 manText) */
function headLine(address: string, listing: Listing | null): string {
  const parts = address === '' ? [] : [address]
  if (listing) {
    const a = listing.areaM2
    if (a !== null && a > 0 && a <= MAX_M2) parts.push(`전용 ${m2ToPyeong(a)}평`)
    const money = [listing.deposit !== null ? `보증금 ${manText(listing.deposit)}` : null, listing.rent !== null ? `월세 ${manText(listing.rent)}` : null]
    const m = money.filter((x) => x !== null).join(' / ')
    if (m !== '') parts.push(m)
  }
  return parts.join(' · ')
}

/** 둘레 다른 과 의원 수(목차 표시, design.md 18절): 범위 안 의원 가운데 대표 과목이 둘레로 보기이고 한의원이 아닌 곳. 못 받았으면 null */
function aroundCount(c: Candidate, rule: DeptRule): number | null {
  const all = shownValue(c.snapshot?.rivals)
  if (all === null) return null
  const r = c.snapshot?.radiusM ?? c.radiusM
  return all.filter((x) => {
    const dept = x.distM <= r ? deptOf(x, rule) : null
    return dept !== null && dept !== 'korean' && deptRole(dept, rule) === 'around'
  }).length
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

const countBadge = (n: number | null) => (n !== null ? <span className="tabular-nums text-muted">{n}</span> : undefined)

export function CandidateFrame(props: CandidateFrameProps) {
  const { candidate: c, listings, rule, deptRule, homeEswt, today, progress, sections, onOpenSource } = props

  // 후보를 열 때마다 한 번(같은 후보를 다시 그릴 때는 부르지 않는다). 콜백이 새로 와도 다시 부르지 않게 마지막 것을 담아 둔다
  const latest = useRef(props)
  useEffect(() => {
    latest.current = props
  })
  useEffect(() => {
    latest.current.onOpen(c.id)
  }, [c.id])

  const flags = useMemo(() => pickFlags(flagInputOf({ candidate: c, listings, today, deptRule })), [c, listings, today, deptRule])
  const filled = useMemo(() => fillScoreRule(rule), [rule])
  const facts = useMemo(() => scoreFactsOf({ candidate: c, listings, homeEswt, today, deptRule }), [c, listings, homeEswt, today, deptRule])
  const score = useMemo(() => scoreItems(facts, filled), [facts, filled])
  const sgg = props.sggAvg !== undefined ? props.sggAvg : shownValue(c.snapshot?.sggAvg)
  const explain = useMemo(() => explainCandidate(facts, filled, { sgg, listings: listingAverages(listings) }), [facts, filled, sgg, listings])
  const listing = candidateListing(c.id, listings)
  const rivals = rivalCount(c, deptRule)
  const around = aroundCount(c, deptRule)

  const day = koreanDay(c.snapshot ? (c.snapshotAt ?? c.snapshot.at) : null)
  const frozen = day === null ? T.noSnapshot : T.frozen(day, day !== koreanDay(c.createdAt))
  const busy = progress != null
  // 받는 중이면 칸마다 `다시 받는 중이에요 · 자료 n/m`(문맥 RefreshBusy, AC-7917.4, TASK-95)
  const busyText = busy ? refreshingText(progress.done, progress.total) : null
  const address = (props.kakaoAddress ?? '').trim() || c.addressNote.trim()

  const shown = SECTIONS.filter((s) => sections[s.id] != null && sections[s.id] !== false)
  const toc: TocItem[] = [
    { id: 'flags', title: T.flagsTitle, badge: flags.length > 0 ? <span className={look.chipNegative}>{flags.length}</span> : undefined },
    { id: 'score', title: T.scoreTitle, badge: countBadge(score.total) },
    ...shown.map((s) => ({
      id: s.id,
      title: s.title,
      anchor: s.anchor,
      badge: s.id === 'rivals' ? countBadge(rivals) : s.id === 'others' ? countBadge(around) : undefined,
    })),
  ]

  // 목차가 건너뛸 자리(칸 감싸개 — id 없이 ref로만)
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
                explain={explain}
                noDepts={deptRule.rival.length === 0}
                weights={filled.weights}
                hasListing={listing !== null}
                candidateId={c.id}
                radiusM={c.radiusM}
                busy={busy}
                onRadius={props.onRadius}
                map={props.map}
                mapLegend={props.mapLegend}
                onOpenSource={onOpenSource}
              />
            </div>
          </section>
          {shown.map((s) => (
            <div key={s.id} ref={spot(s.id)} tabIndex={-1} className={look.section}>
              <RefreshBusy.Provider value={busyText}>{sections[s.id]}</RefreshBusy.Provider>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

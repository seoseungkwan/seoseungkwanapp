'use client'

// 동네 훑기 화면(spec location REQ-7907 AC-7907.1~4, REQ-7919 AC-7919.3, design.md 8·14절, 시안 ?s=scan).
// 시·도 → 시·군·구 고르기 · 동마다 점수 색 지도 · 추천 동 순위(까닭 한 줄) · 점수 무게 판(weights/) · 고른 동 판([후보 더하기]·[네이버 부동산]).
// 부품은 props·콜백만 받는다(읽기·저장·바깥 부르기 없음): 시·군·구를 고르면 onPickSgg 하나, 받은 값은 result로 받는다.
// 동 점수는 score.ts scoreItems(값, 설정, 'scan') — 무게·세부 무게·기준·나이대를 바꾸면 받은 값으로 바로 다시 세고 onPickSgg는 부르지 않는다.
// 바뀐 설정은 onRuleChange(바로)·onRuleSave(멈춘 뒤 한 번, ScoreWeights)로 넘긴다. 훑기 결과는 저장하지 않는다
import Link from 'next/link'
import { useId, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { SourceLine } from '@/components/location/common/SourceLine'
import { RETRY_LABEL } from '@/components/location/common/text'
import { WhyLine } from '@/components/location/common/WhyLine'
import { KakaoMap, type MapArea, type MapMark } from '@/components/location/map/KakaoMap'
import { ScoreWeights } from '@/components/location/weights/ScoreWeights'
import { ds } from '@/components/ui/classes'
import { NEW_TAB, naverLandUrl } from '@/lib/location/links'
import { dongOf, type Dong, type DongIndex } from '@/lib/location/regions'
import { SCORE_GROUPS, type ScoreRule } from '@/lib/location/score'
import { sourceOf } from '@/lib/location/sources'
import type { Point, SourceId, Why } from '@/types/location'
import { ExternalIcon, PlusIcon } from './icons'
import { look } from './look'
import { maxPoints, rankDongs, scoreDongs, TONE_LABELS, toneOf, type DongScore, type ScanDong } from './rank'
import { atText, SCAN_TEXT as T } from './text'
import { whyLine } from './why'

export type { ScanDong }
/** 훑기 자료 하나의 받은 상태(출처 id·기준 날짜 또는 까닭) */
export type ScanPartState = { ok: true; src: SourceId; asOf: string } | { ok: false; src: SourceId; why: Why }
/** 훑기 값(lib/location/collect.ts collectScan이 되었을 때 모양) */
export type ScanData = {
  /** 받은 시각(ISO) */
  at: string
  sgg: string
  sggName: string
  sidoName: string
  dongs: readonly ScanDong[]
  parts: Readonly<Record<string, ScanPartState>>
}
export type ScanResult = ({ ok: true } & ScanData) | { ok: false; why: 'outside' | 'failed' }
/** 저장한 후보(내려놓은 후보는 부르는 쪽이 뺀다). label = 지도 표시 안 글자(A 등) */
export type ScanCandidate = { id: string; label: string; at: Point }
/** [{동}에서 후보 더하기]가 넘기는 것: 그 동 가운데 점(소수 6자리) */
export type ScanSpot = { code10: string; name: string; at: Point }

export type ScanViewProps = {
  /** 동 경계 목록(public/location/dongs/index.json). 없으면 고르기 칸이 막힌다 */
  index: DongIndex | null
  /** 고른 시·군·구 5자리 */
  sgg: string | null
  /** 시·군·구를 고르면(부르는 쪽이 동 경계를 읽고 collectScan을 부른다) */
  onPickSgg: (code5: string) => void
  /** 고른 시·군·구 동 경계 파일의 동(지도·가운데 점) */
  dongs: readonly Dong[] | null
  /** 훑기 값. null = 아직 안 받음 */
  result: ScanResult | null
  /** 받는 중 진행(있으면 받는 중으로 그린다) */
  progress?: { done: number; total: number } | null
  /** 지금 점수 설정(location_settings.score_rule) */
  rule: ScoreRule
  /** 칸 검사를 통과한 바뀐 설정 — 고칠 때마다 바로 */
  onRuleChange?: (rule: ScoreRule) => void
  /** 저장할 설정 — 멈춘 뒤 한 번 */
  onRuleSave: (rule: ScoreRule) => void
  candidates?: readonly ScanCandidate[]
  onAdd: (spot: ScanSpot) => void
  /** [다시 받기] */
  onRetry?: () => void
  /** [점수 매기는 법과 출처 보기]를 그냥 누르면(주지 않으면 주소로 간다) */
  onOpenSources?: () => void
}

const SOURCES_HREF = '/location?tab=sources#src-score'
const RANK_SHORT = 6
const MAP_HEIGHT = 476
const GROUP_NAME = Object.fromEntries(SCORE_GROUPS.map((g) => [g.id, g.name])) as Record<string, string>
// Tailwind가 소스 글자에서 클래스를 찾으므로 통째로 적는다(색 칸 0~4 = --chart-1~5, 지도와 같음)
const SWATCH = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5'] as const
const BAR = 'relative h-2 bg-canvas shadow-[inset_0_0_0_1px_var(--line)]'
const BAR_FILL = 'absolute inset-y-0 left-0 bg-accent'
const RANK_BUTTON = `grid w-full cursor-pointer grid-cols-[24px_minmax(0,1fr)_auto] items-baseline gap-x-2 gap-y-0.5 py-2.5 pr-2 text-left text-body hover:bg-canvas aria-[current=true]:bg-accent-soft aria-[current=true]:shadow-[inset_2px_0_0_var(--accent)] ${ds.focusRing}`
const STATE_BOX = 'flex h-119 items-center justify-center rounded-control border border-line bg-canvas p-4 text-center text-small text-muted'

const round6 = (v: number) => Math.round(v * 1e6) / 1e6
const plainClick = (e: MouseEvent) => e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey

function sggCenter(index: DongIndex | null, code5: string): Point | null {
  for (const sido of index?.sidos ?? []) {
    const hit = sido.sggs.find((g) => g.code5 === code5)
    if (hit) {
      const [w, s, e, n] = hit.bbox
      return { lat: (s + n) / 2, lng: (w + e) / 2 }
    }
  }
  return null
}

/** 받지 못한 자료 줄(같은 출처·까닭은 한 줄). 이름이 글에 없는 까닭(실패·없음·지역 밖)은 자료 이름을 앞에 붙인다 */
function missingOf(parts: Readonly<Record<string, ScanPartState>>) {
  const out: { key: string; src: SourceId; why: Why; label: string | null }[] = []
  for (const p of Object.values(parts)) {
    if (p.ok) continue
    const key = `${p.src}|${p.why}`
    if (out.some((x) => x.key === key)) continue
    const named = p.why === 'no-key' || p.why === 'not-applied'
    out.push({ key, src: p.src, why: p.why, label: named ? null : (sourceOf(p.src)?.name ?? null) })
  }
  return out
}

export function ScanView({
  index,
  sgg,
  onPickSgg,
  dongs,
  result,
  progress = null,
  rule,
  onRuleChange,
  onRuleSave,
  candidates = [],
  onAdd,
  onRetry,
  onOpenSources,
}: ScanViewProps) {
  const uid = useId()
  // 사용자가 고른 시·도(시·군·구를 고르기 전). 밖에서 다른 시·군·구가 오면 그 시·도로 돌아간다
  const [sidoPick, setSidoPick] = useState<string | null>(null)
  const [seenSgg, setSeenSgg] = useState(sgg)
  if (sgg !== seenSgg) {
    setSeenSgg(sgg)
    setSidoPick(null)
  }
  const [chosen, setChosen] = useState<string | null>(null)
  const [allDongs, setAllDongs] = useState(false)
  // 지금 점수 설정: 무게 판이 바꾼 값을 바로 쓰고, 밖에서 다른 설정이 오면 그 값으로
  const [live, setLive] = useState(rule)
  const [given, setGiven] = useState(rule)
  if (rule !== given) {
    setGiven(rule)
    setLive(rule)
  }

  const sidoOfSgg = index?.sidos.find((s) => s.sggs.some((g) => g.code5 === sgg))?.code2 ?? ''
  const sido = sidoPick ?? sidoOfSgg
  const sidoRow = index?.sidos.find((s) => s.code2 === sido) ?? null
  const sggValue = sgg !== null && sidoRow?.sggs.some((g) => g.code5 === sgg) ? sgg : ''

  const ready = progress === null && result?.ok ? result : null
  const rows = useMemo(() => (ready ? scoreDongs(ready.dongs, live) : []), [ready, live])
  const ranked = useMemo(() => rankDongs(rows), [rows])
  const whys = useMemo(() => new Map(rows.map((r) => [r.code10, whyLine(r, r.result, live)])), [rows, live])
  const geo = useMemo(() => new Map((dongs ?? []).map((d) => [d.code10, d])), [dongs])
  const chipsOf = useMemo(() => {
    const out = new Map<string, string[]>()
    for (const c of candidates) {
      const d = dongOf(c.at, dongs ?? [])
      if (d) out.set(d.code10, [...(out.get(d.code10) ?? []), c.label])
    }
    return out
  }, [candidates, dongs])
  const selected = rows.find((r) => r.code10 === chosen) ?? ranked[0] ?? null

  const change = (next: ScoreRule) => {
    setLive(next)
    onRuleChange?.(next)
  }

  const sidoId = `${uid}-sido`
  const sggId = `${uid}-sgg`
  const rankId = `${uid}-rank`
  const chips = (code10: string) =>
    (chipsOf.get(code10) ?? []).map((label) => (
      <span key={label} className={look.chip}>
        {T.candidate(label)}
      </span>
    ))

  let left
  if (progress !== null) {
    left = (
      <div aria-busy="true" className={STATE_BOX}>
        <p>{`${T.loading} · ${T.progress(progress.done, progress.total)}`}</p>
      </div>
    )
  } else if (result === null) {
    left = (
      <div className={STATE_BOX}>
        <p>{T.pickFirst}</p>
      </div>
    )
  } else if (!result.ok) {
    left =
      result.why === 'outside' ? (
        <div className={STATE_BOX}>
          <p>{T.outside}</p>
        </div>
      ) : (
        <div className="grid justify-items-start gap-3">
          <ErrorCard code="E-LOC-SOURCE" />
          {onRetry ? (
            <button type="button" className={look.button} onClick={onRetry}>
              {RETRY_LABEL}
            </button>
          ) : null}
        </div>
      )
  } else {
    left = (
      <ScanLeft
        data={result}
        rows={rows}
        selected={selected}
        whys={whys}
        geo={geo}
        center={sggCenter(index, result.sgg)}
        candidates={candidates}
        chips={chips}
        rule={live}
        onArea={setChosen}
        onAdd={onAdd}
        onRetry={onRetry}
      />
    )
  }

  const shown = allDongs ? ranked : ranked.slice(0, RANK_SHORT)

  return (
    <div className="min-w-0">
      <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className={look.field}>
          <label htmlFor={sidoId} className={look.label}>
            {T.sido}
          </label>
          <select id={sidoId} className={look.select} value={sido} disabled={!index} onChange={(e) => setSidoPick(e.target.value)}>
            <option value="">{T.sidoPick}</option>
            {index?.sidos.map((s) => (
              <option key={s.code2} value={s.code2}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className={look.field}>
          <label htmlFor={sggId} className={look.label}>
            {T.sgg}
          </label>
          <select
            id={sggId}
            className={look.select}
            value={sggValue}
            disabled={!sidoRow}
            onChange={(e) => {
              if (e.target.value) onPickSgg(e.target.value)
            }}
          >
            <option value="">{T.sggPick}</option>
            {sidoRow?.sggs.map((g) => (
              <option key={g.code5} value={g.code5}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        {ready ? (
          <p className="ml-auto text-right text-caption text-muted">
            {T.when(ready.dongs.length, atText(ready.at))}
            <br />
            <Link
              href={SOURCES_HREF}
              prefetch={false}
              className={look.textLink}
              onClick={
                onOpenSources
                  ? (e: MouseEvent<HTMLAnchorElement>) => {
                      if (!plainClick(e)) return
                      e.preventDefault()
                      onOpenSources()
                    }
                  : undefined
              }
            >
              {T.sourcesLink}
            </Link>
          </p>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_384px] items-start gap-x-8 gap-y-6">
        <div className="min-w-0">{left}</div>
        <aside className="min-w-0">
          {ready && ranked.length > 0 ? (
            <>
              <div className={look.head}>
                <h2 id={rankId} className="text-subtitle font-semibold text-ink">
                  {T.rankTitle}
                </h2>
                <span className="text-small text-muted">{T.rankAside}</span>
              </div>
              <ol aria-labelledby={rankId}>
                {shown.map((r, k) => {
                  const why = whys.get(r.code10) ?? ''
                  return (
                    <li key={r.code10} className="border-b border-line">
                      <button
                        type="button"
                        data-dong={r.code10}
                        aria-current={r.code10 === selected?.code10 ? 'true' : undefined}
                        className={RANK_BUTTON}
                        onClick={() => setChosen(r.code10)}
                      >
                        <span className="text-right font-semibold tabular-nums text-muted">{k + 1}</span>
                        <span className="flex flex-wrap items-center gap-1.5 font-semibold text-ink">
                          {r.name}
                          {chips(r.code10)}
                        </span>
                        <Score total={r.total} small />
                        {why ? <span className="col-span-2 col-start-2 text-small text-ink-2">{why}</span> : null}
                        <span className={`col-span-2 col-start-2 mt-1 h-1.5 ${BAR}`}>
                          <i className={BAR_FILL} style={{ width: `${r.total ?? 0}%` }} />
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ol>
              {ranked.length > RANK_SHORT ? (
                <button type="button" className={look.moreButton} onClick={() => setAllDongs(!allDongs)}>
                  {allDongs ? T.sixOnly : T.allDongs(ranked.length)}
                </button>
              ) : null}
            </>
          ) : null}
          <div className={ready ? 'mt-6' : undefined}>
            <ScoreWeights rule={live} onChange={change} onSave={onRuleSave} />
          </div>
        </aside>
      </div>
    </div>
  )
}

function Score({ total, small = false }: { total: number | null; small?: boolean }) {
  const big = small ? 'font-semibold tabular-nums text-ink' : 'text-heading-m font-semibold tabular-nums text-ink'
  if (total === null) return <span className={small ? 'text-small text-muted' : 'text-body font-medium text-muted'}>{T.noScore}</span>
  return (
    <span className={big}>
      {total}
      <small className={`ml-0.5 font-medium text-muted ${small ? 'text-caption' : 'text-small'}`}>{T.unit}</small>
    </span>
  )
}

type LeftProps = {
  data: ScanData
  rows: readonly DongScore[]
  selected: DongScore | null
  whys: ReadonlyMap<string, string>
  geo: ReadonlyMap<string, Dong>
  center: Point | null
  candidates: readonly ScanCandidate[]
  chips: (code10: string) => ReactNode
  rule: ScoreRule
  onArea: (code10: string) => void
  onAdd: (spot: ScanSpot) => void
  onRetry?: () => void
}

function ScanLeft({ data, rows, selected, whys, geo, center, candidates, chips, rule, onArea, onAdd, onRetry }: LeftProps) {
  const missing = missingOf(data.parts)
  const areas: MapArea[] = rows.flatMap((r) => {
    const d = geo.get(r.code10)
    if (!d?.rings) return []
    return [
      {
        id: r.code10,
        name: r.name,
        rings: d.rings,
        center: d.center,
        tone: toneOf(r.total),
        text: r.total === null ? T.noScore : `${r.total}${T.unit}`,
        selected: r.code10 === selected?.code10,
      },
    ]
  })
  const marks: MapMark[] = candidates.map((c) => ({ id: c.id, kind: 'candidate', at: c.at, label: c.label }))
  const first = geo.values().next().value
  const mapCenter = center ?? (first ? { lat: first.center[1], lng: first.center[0] } : null)

  return (
    <>
      {missing.length > 0 ? (
        <ul aria-label={T.missing} className="mb-3 grid gap-1">
          {missing.map((m) => (
            <li key={m.key} className="flex flex-wrap items-baseline gap-x-1 text-small text-muted">
              {m.label ? <span>{`${m.label} ·`}</span> : null}
              <WhyLine why={m.why} src={m.src} onRetry={onRetry} />
            </li>
          ))}
        </ul>
      ) : null}
      {mapCenter ? <KakaoMap label={T.mapLabel(data.sggName)} center={mapCenter} areas={areas} marks={marks} height={MAP_HEIGHT} onArea={onArea} /> : null}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-2">
        <span>{T.legend}</span>
        {TONE_LABELS.map((label, i) => (
          <span key={label} className="inline-flex items-center gap-1">
            <i aria-hidden="true" className={`inline-block h-2.5 w-3.5 border border-line ${SWATCH[i]}`} />
            {label}
          </span>
        ))}
        {candidates.length > 0 ? (
          <>
            <span aria-hidden="true">·</span>
            <span>{T.legendCandidate}</span>
          </>
        ) : null}
      </div>
      {selected ? <Picked data={data} row={selected} why={whys.get(selected.code10) ?? ''} dong={geo.get(selected.code10) ?? null} chips={chips} rule={rule} onAdd={onAdd} /> : null}
    </>
  )
}

type PickedProps = {
  data: ScanData
  row: DongScore
  why: string
  dong: Dong | null
  chips: (code10: string) => ReactNode
  rule: ScoreRule
  onAdd: (spot: ScanSpot) => void
}

function Picked({ data, row, why, dong, chips, rule, onAdd }: PickedProps) {
  const people = data.dongs.find((d) => d.code10 === row.code10)?.facts.people ?? null
  const peoplePart = data.parts.people
  const max = maxPoints(row.result, rule)
  const at = dong ? { lat: round6(dong.center[1]), lng: round6(dong.center[0]) } : null
  let naver: string | null = null
  try {
    naver = at ? naverLandUrl(at) : null
  } catch {
    naver = null
  }
  return (
    <section aria-label={T.picked} className="mt-4 grid gap-3 border-t border-line-strong pt-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-subtitle font-semibold text-ink">{row.name}</h3>
        <Score total={row.total} />
        {chips(row.code10)}
        {!row.unmatched && people ? (
          <span className="flex flex-wrap items-baseline gap-x-2 text-small text-muted">
            <span>{T.people(people.total)}</span>
            {peoplePart?.ok ? <SourceLine src={peoplePart.src} asOf={peoplePart.asOf} /> : null}
          </span>
        ) : null}
      </div>
      {why ? <p className="text-body text-ink-2">{why}</p> : null}
      <div className="grid grid-cols-3 gap-x-4 gap-y-3">
        {row.result.groups.map((g, i) => (
          <div key={g.id} data-group={g.id} className="min-w-0">
            <div className="flex justify-between gap-1 text-caption text-muted">
              <span>{GROUP_NAME[g.id]}</span>
              <b className="font-semibold tabular-nums text-ink">
                {g.points === null || max[i] === null ? (
                  <span className="font-medium text-muted">{T.noValue}</span>
                ) : (
                  <>
                    {g.points}
                    <span className="font-medium text-muted">{`/${max[i]}`}</span>
                  </>
                )}
              </b>
            </div>
            <div className={`mt-1 ${BAR}`}>
              <i className={BAR_FILL} style={{ width: `${g.score ?? 0}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="text-small text-muted">{T.used(row.result.used)}</p>
      <div className="flex flex-wrap gap-2">
        {at ? (
          <button type="button" className={look.primary} onClick={() => onAdd({ code10: row.code10, name: row.name, at })}>
            <PlusIcon />
            {T.add(row.name)}
          </button>
        ) : null}
        {naver ? (
          <a href={naver} {...NEW_TAB} className={look.button}>
            {T.naver(row.name)}
            <ExternalIcon />
          </a>
        ) : null}
      </div>
      <p className={look.help}>{T.help}</p>
    </section>
  )
}

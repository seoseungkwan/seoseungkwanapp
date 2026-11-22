'use client'

// 후보 견주기 (spec location REQ-7914 AC-7914.1 · AC-7919.3 · AC-7921.2, design.md 14·18절, 시안 ?s=compare).
// 후보 2~4곳을 나란히: 항목 점수(종합에 보탠 점수 / 그 항목 만점 + 막대) · 합계와 등수 · 숫자로 견주기(범위·사람·경쟁 의원·역·층·매물 값·평당 월세·위험 신호 수)
// · 진행 상태 단계 단추·[내려놓기] · 접힌 '내려놓은 후보'와 [다시 올리기].
// 부품은 props·콜백만 쓴다(읽기·저장·바깥 부르기 없음). 점수 값·경쟁 수·위험 신호·후보 매물은 후보 자세히와 같은 셈 한 곳
// lib/location/facts.ts(scoreFactsOf·rivalCount·flagInputOf → flags.ts pickFlags·candidateListing)에 받은 과목 고르기(deptRule)를 넣어 여기서 세고,
// 점수는 받은 설정(rule — 동네 훑기와 같은 location_settings.score_rule)을 그대로 score.ts scoreItems에 넣는다
// → 무게·과목 고르기가 바뀌면 다시 부르지 않고 바로 다시 센다. 경쟁 줄 이름은 `경쟁 의원` + 작은 글 고른 과목 짧은 이름(depts.ts rivalShortText).
// 만 원 칸에서 온 금액(보증금·월세·권리금)은 manText, 평당 월세는 wonText(design.md 5절).
// 진행 단계 바꾸기·내려놓기·다시 올리기는 모두 onStatus(후보 id, 새 상태) 하나로 넘긴다(다시 올리기 = 보는 중).
// 견줄 후보 고르기(2~4곳)는 이 화면에서만 쓰는 고름이라 저장하지 않는다
import { useMemo, useState, type ReactNode } from 'react'
import { ds } from '@/components/ui/classes'
import { todayInKorea } from '@/lib/analytics/dates'
import { areaText } from '@/lib/location/area'
import { distText } from '@/lib/location/coords'
import { rivalShortText } from '@/lib/location/depts'
import { candidateListing, flagInputOf, rivalCount, scoreFactsOf, shownValue } from '@/lib/location/facts'
import { pickFlags, type Flag } from '@/lib/location/flags'
import { compareListings, perPyeongOf, vsAverage } from '@/lib/location/listings'
import { commaText, manText, wonText } from '@/lib/location/money'
import { fillScoreRule, scoreItems, SCORE_GROUPS, type GroupScore, type ScoreRule } from '@/lib/location/score'
import type { Candidate, CandidateStatus, DeptRule, Listing, ScoreFacts } from '@/types/location'
import { COMPARE_TEXT as T, letterOf, MAX_PICK, MIN_PICK, STATUS_TEXT, STEPS } from './text'

export type CandidateCompareProps = {
  /** 모든 후보(내려놓은 후보 포함). 이 차례로 글자 A·B·C …를 붙이고, 처음에는 내려놓지 않은 앞 4곳을 견준다 */
  candidates: readonly Candidate[]
  /** 저장한 매물 모두 — 후보 매물(facts.ts candidateListing)·점수 값을 고르고, 평당 월세를 저장한 매물 평균과 견준다(2개보다 적으면 견주지 않음) */
  listings: readonly Listing[]
  /** 점수 설정(동네 훑기와 같은 것). 틀린 칸은 처음 값으로 본다 */
  rule: ScoreRule
  /** 의원 과목 고르기(location_settings.dept_rule, fillDeptRule을 거친 값) — 경쟁 수·점수·위험 신호·경쟁 줄 작은 글이 따른다 */
  deptRule: DeptRule
  /** 지금 의원 체외충격파 값(원, location_settings.home_eswt) — 점수 '경쟁'의 진료비 차이 */
  homeEswt: number | null
  /** 한국 날짜 'YYYY-MM-DD'(새로 연 경쟁 의원·건물 햇수·위험 신호) */
  today: string
  /** 진행 단계를 바꾸거나(watching·contacted·visited·reviewing) 내려놓거나(dropped) 다시 올릴 때(watching) */
  onStatus: (id: string, status: CandidateStatus) => void
  /** [무게 바꾸기](동네 훑기의 무게 판으로). 없으면 단추도 없다 */
  onEditWeights?: () => void
}

// ── 모양(시안 .sh·table.t·.cmp·.hb·.stp·.prog·details.drop·.cb 값, 앱 토큰만, 폰 전용 모양 없음) ──
const HEAD = 'flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line-strong pb-1.5'
const H2 = 'text-subtitle font-semibold text-ink'
const ASIDE = 'text-small text-muted'
const TEXT_BTN = `inline-flex cursor-pointer items-center whitespace-nowrap rounded-control font-medium text-accent hover:underline ${ds.focusRing}`
const SMALL_BTN = `inline-flex h-8 cursor-pointer items-center justify-center whitespace-nowrap rounded-control border border-line-strong bg-surface px-3 text-small font-medium text-ink transition hover:bg-canvas ${ds.focusRing}`
const LETTER = 'inline-grid size-5.5 shrink-0 place-items-center rounded-control bg-ink text-caption font-semibold text-surface'
const PICK_BTN = `inline-flex h-10 cursor-pointer items-center gap-2 whitespace-nowrap rounded-control border border-line-strong bg-surface px-3 text-small text-ink-2 hover:bg-canvas aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:font-semibold aria-pressed:text-ink aria-pressed:ring-1 aria-pressed:ring-inset aria-pressed:ring-accent disabled:cursor-not-allowed disabled:opacity-40 ${ds.focusRing}`
const TABLE = 'w-full border-collapse text-small'
const TH = 'h-10 whitespace-nowrap border-b border-line px-3 text-left align-middle font-medium text-muted first:pl-0 last:pr-0'
const TH_CAND = 'border-b border-line px-3 py-2 text-left align-bottom font-medium text-muted last:pr-0'
const ROW = 'hover:bg-canvas'
const ROW_HEAD = 'h-11 border-b border-line py-2 pr-3 text-left align-middle font-normal text-ink'
const TD = 'h-11 border-b border-line px-3 py-2 align-middle text-ink last:pr-0'
const TD_WEIGHT = `${TD} whitespace-nowrap text-right tabular-nums`
const TD_SCORE = `${TD} min-w-50`
const SUM_HEAD = 'h-11 border-t border-b border-line-strong py-2 pr-3 text-left align-middle font-semibold text-ink'
const SUM_TD = 'h-11 border-t border-b border-line-strong px-3 py-2 align-middle text-ink last:pr-0'
const GROUP_TD = 'h-9 border-b border-line pt-4 text-caption font-semibold text-muted'
const SUB = 'block text-caption text-muted'
const BAR = 'relative mt-1 h-2 bg-canvas ring-1 ring-inset ring-line'
const BAR_FILL = 'absolute inset-y-0 left-0 bg-accent'
const STEP = 'h-8 min-w-0 flex-1 cursor-pointer whitespace-nowrap border border-line-strong bg-surface px-1.5 text-caption text-ink-2 -ml-px first:ml-0 first:rounded-l-control last:rounded-r-control focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent'
const STEP_DONE = `${STEP} bg-accent-soft text-accent-strong`
const STEP_CUR = `${STEP} relative z-10 border-accent bg-accent font-semibold text-surface`
const PROG = 'grid grid-cols-[220px_minmax(0,1fr)_auto] items-center gap-x-6 gap-y-3 border-b border-line py-3'
const SUMMARY = 'cursor-pointer border-b border-line py-2 font-medium text-ink-2'

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const count = (v: unknown): number | null => {
  const n = num(v)
  return n !== null && n >= 0 ? Math.floor(n) : null
}
/** 만 원 칸에서 온 금액 글(manText: 0 `없음`, 없음 `–`). 원 정수가 아니면 '–' */
const man = (n: number | null | undefined) => (n == null || Number.isSafeInteger(n) ? manText(n) : T.dash)

/** ISO 시각 → 한국 날짜 'M월 D일'. 못 읽으면 null */
function dayText(iso: string | null | undefined): string | null {
  if (!iso) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  const ymd = todayInKorea(at)
  return `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일`
}

/** 60세 이상 %(버림) — score.ts가 센 세부 항목 'p-senior' 값 그대로(따로 셈 없음) */
function seniorPct(groups: readonly GroupScore[]): number | null {
  const v = groups.flatMap((g) => g.subs).find((x) => x.id === 'p-senior')?.value ?? null
  return v === null ? null : Math.floor(v)
}

/** 보이는 후보 id: 고른 적이 없으면 앞 4곳, 고른 뒤에는 고른 것(내려놓은 후보는 빠짐) — 모자라면 2곳까지 앞에서 채운다 */
function shownIds(live: readonly string[], chosen: readonly string[] | null): string[] {
  if (chosen === null) return live.slice(0, MAX_PICK)
  const kept = live.filter((id) => chosen.includes(id)).slice(0, MAX_PICK)
  for (const id of live) {
    if (kept.length >= Math.min(MIN_PICK, live.length)) break
    if (!kept.includes(id)) kept.push(id)
  }
  return live.filter((id) => kept.includes(id))
}

/** 견주는 후보 하나 — 점수 값·위험 신호·후보 매물·경쟁 수는 facts.ts가 받은 과목 고르기로 센 값 */
type CompareRow = {
  candidate: Candidate
  facts: ScoreFacts
  flags: readonly Flag[]
  listing: Listing | null
  /** 범위 안 경쟁 의원 수. 경쟁 과목을 하나도 안 고르면 0, 의원 목록을 못 받았으면 null */
  rivals: number | null
}

type Scored = { row: CompareRow; letter: string; groups: GroupScore[]; total: number | null; max: Map<string, number> }

export function CandidateCompare({ candidates, listings, rule, deptRule, homeEswt, today, onStatus, onEditWeights }: CandidateCompareProps) {
  const [chosen, setChosen] = useState<readonly string[] | null>(null)
  const filled = useMemo(() => fillScoreRule(rule), [rule])
  const rents = useMemo(() => compareListings(listings), [listings])
  const noDept = deptRule.rival.length === 0

  const letters = new Map(candidates.map((c, i) => [c.id, letterOf(i)]))
  const live = candidates.filter((c) => c.status !== 'dropped')
  const dropped = candidates.filter((c) => c.status === 'dropped')
  const liveIds = live.map((c) => c.id)
  const shown = shownIds(liveIds, chosen)

  const scored: Scored[] = live
    .filter((c) => shown.includes(c.id))
    .map((c) => {
      const row: CompareRow = {
        candidate: c,
        facts: scoreFactsOf({ candidate: c, listings, homeEswt, today, deptRule }),
        flags: pickFlags(flagInputOf({ candidate: c, listings, today, deptRule })),
        listing: candidateListing(c.id, listings),
        rivals: rivalCount(c, deptRule) ?? (noDept ? 0 : null),
      }
      const result = scoreItems(row.facts, filled, 'candidate')
      const sum = result.groups.reduce((a, g) => (g.score === null ? a : a + filled.weights[g.id]), 0)
      const max = new Map(result.groups.map((g) => [g.id, sum > 0 ? Math.floor((filled.weights[g.id] * 100) / sum) : 0]))
      return { row, letter: letters.get(c.id) ?? '', groups: result.groups, total: result.total, max }
    })

  function toggle(id: string) {
    if (shown.includes(id)) {
      if (shown.length <= MIN_PICK) return
      setChosen(shown.filter((x) => x !== id))
    } else {
      if (shown.length >= MAX_PICK) return
      setChosen([...shown, id])
    }
  }

  const weightSum = SCORE_GROUPS.reduce((a, g) => a + filled.weights[g.id], 0)
  const weightList = SCORE_GROUPS.map((g) => `${g.name} ${filled.weights[g.id]}`).join(' · ')

  return (
    <div className="mt-5 grid gap-10">
      <section className="min-w-0">
        <div className={HEAD}>
          <h2 className={H2}>{T.scoreTitle}</h2>
          <span className={ASIDE}>
            {`${T.weights} ${weightList}${onEditWeights ? ' · ' : ''}`}
            {onEditWeights && (
              <button type="button" className={TEXT_BTN} onClick={onEditWeights}>
                {T.editWeights}
              </button>
            )}
          </span>
        </div>
        {live.length > MIN_PICK && <Picker live={live} letters={letters} shown={shown} onToggle={toggle} />}
        {scored.length >= MIN_PICK ? (
          <>
            <ScoreTable scored={scored} filled={filled} weightSum={weightSum} rents={rents} rivalShort={rivalShortText(deptRule)} noDept={noDept} />
            <p className="mt-1.5 text-caption text-muted">
              {T.savedValues(scored.map((s) => `${s.letter} ${dayText(s.row.candidate.snapshotAt ?? s.row.candidate.snapshot?.at) ?? T.noSnapshot}`))}
            </p>
          </>
        ) : (
          <p className="mt-4 text-body text-ink-2">{T.few}</p>
        )}
      </section>

      {(live.length > 0 || dropped.length > 0) && (
        <section className="min-w-0">
          <div className={HEAD}>
            <h2 className={H2}>{T.progressTitle}</h2>
            <span className={ASIDE}>{T.progressAside}</span>
          </div>
          {live.map((c) => (
            <Progress key={c.id} candidate={c} letter={letters.get(c.id) ?? ''} onStatus={onStatus} />
          ))}
          {dropped.length > 0 && (
            <details>
              <summary className={SUMMARY}>{T.dropped(dropped.length)}</summary>
              {dropped.map((c) => (
                <div key={c.id} className={`${PROG} text-ink-2`}>
                  <span className="min-w-0">
                    <b className="font-semibold text-ink">{c.name}</b>
                    {c.addressNote.trim() !== '' && (
                      <>
                        {' '}
                        <span className="text-small text-muted">{c.addressNote}</span>
                      </>
                    )}
                  </span>
                  <span className="text-small">{T.droppedTag}</span>
                  <button type="button" className={SMALL_BTN} onClick={() => onStatus(c.id, 'watching')}>
                    {T.restore}
                  </button>
                </div>
              ))}
            </details>
          )}
        </section>
      )}
    </div>
  )
}

function Picker({
  live,
  letters,
  shown,
  onToggle,
}: {
  live: readonly Candidate[]
  letters: ReadonlyMap<string, string>
  shown: readonly string[]
  onToggle: (id: string) => void
}) {
  return (
    <div role="group" aria-label={T.pick} className="mt-4 flex flex-wrap items-center gap-2">
      <span className="mr-1 text-small text-muted">{T.pick}</span>
      {live.map((c) => {
        const on = shown.includes(c.id)
        const locked = on ? shown.length <= MIN_PICK : shown.length >= MAX_PICK
        return (
          <button key={c.id} type="button" className={PICK_BTN} aria-pressed={on} disabled={locked} onClick={() => onToggle(c.id)}>
            <span className={LETTER}>{letters.get(c.id)}</span> {c.name}
          </button>
        )
      })}
      <span className="text-caption text-muted">{T.pickHelp}</span>
    </div>
  )
}

function ScoreTable({
  scored,
  filled,
  weightSum,
  rents,
  rivalShort,
  noDept,
}: {
  scored: readonly Scored[]
  filled: ScoreRule
  weightSum: number
  rents: ReturnType<typeof compareListings>
  /** 경쟁 줄 작은 글 — 고른 과목 짧은 이름(없으면 '고른 과목 없음') */
  rivalShort: string
  /** 경쟁 과목을 하나도 안 골랐나 — 점수 '경쟁'이 값 없으면 '과목 없음' */
  noDept: boolean
}) {
  const totals = scored.map((s) => s.total).filter((t): t is number => t !== null)
  const bestTotal = totals.length > 0 ? Math.max(...totals) : null

  const numberRow = (label: string, cell: (s: Scored) => ReactNode, note?: string) => (
    <tr className={ROW}>
      <th scope="row" className={ROW_HEAD}>
        {label}
        {note && (
          <>
            {' '}
            <span className={SUB}>{note}</span>
          </>
        )}
      </th>
      <td className={TD} />
      {scored.map((s) => (
        <td key={s.row.candidate.id} className={TD}>
          {cell(s)}
        </td>
      ))}
    </tr>
  )

  return (
    <div className="mt-2 min-w-0 overflow-x-auto">
      <table className={TABLE}>
        <thead>
          <tr>
            <th scope="col" className={`${TH} w-50`}>
              {T.item}
            </th>
            <th scope="col" className={`${TH} w-16 text-right`}>
              {T.weights}
            </th>
            {scored.map((s) => (
              <th key={s.row.candidate.id} scope="col" className={TH_CAND}>
                <div className="grid gap-0.5 whitespace-normal">
                  <span className="flex items-center gap-1.5 text-body font-semibold text-ink">
                    <span className={ds.chip.accent}>{T.candidate(s.letter)}</span> {s.row.candidate.name}
                  </span>{' '}
                  <span className="text-small font-normal text-muted">
                    {[s.row.candidate.addressNote.trim(), STATUS_TEXT[s.row.candidate.status]].filter((t) => t !== '').join(' · ')}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SCORE_GROUPS.map((g, gi) => {
            const pts = scored.map((s) => pointsOf(s.groups[gi]))
            const values = pts.filter((p): p is number => p !== null)
            const best = values.length > 0 ? Math.max(...values) : null
            return (
              <tr key={g.id} className={ROW}>
                <th scope="row" className={ROW_HEAD}>
                  {g.name}
                </th>
                <td className={TD_WEIGHT}>{filled.weights[g.id]}</td>
                {scored.map((s, k) => {
                  const score = s.groups[gi].score
                  const p = pts[k]
                  const top = p !== null && best !== null && best > 0 && p === best
                  return (
                    <td key={s.row.candidate.id} className={TD_SCORE}>
                      {p === null ? (
                        <div className="font-medium text-muted">
                          {g.id === 'cost' && s.row.listing === null ? T.noListing : g.id === 'rivals' && noDept ? T.noDept : T.noValue}
                        </div>
                      ) : (
                        <div className="flex items-baseline justify-between gap-2">
                          <b className={`text-body font-semibold tabular-nums ${top ? 'text-accent-strong' : 'text-ink'}`}>{T.points(p)}</b>{' '}
                          <span className="text-small text-muted">
                            {T.outOf(s.max.get(g.id) ?? 0)}
                            {top ? ` · ${T.best}` : ''}
                          </span>
                        </div>
                      )}
                      <div data-bar className={BAR}>
                        <i className={BAR_FILL} style={{ width: `${score ?? 0}%` }} />
                      </div>
                    </td>
                  )
                })}
              </tr>
            )
          })}
          <tr>
            <th scope="row" className={SUM_HEAD}>
              {T.sum}
            </th>
            <td className={`${SUM_TD} whitespace-nowrap text-right tabular-nums`}>{weightSum}</td>
            {scored.map((s) => (
              <td key={s.row.candidate.id} className={SUM_TD}>
                {s.total === null ? (
                  <span className="font-medium text-muted">{T.noScore}</span>
                ) : (
                  <>
                    <b className={`text-heading-m font-semibold tabular-nums ${s.total === bestTotal ? 'text-accent-strong' : 'text-ink'}`}>{T.points(s.total)}</b>{' '}
                    <span className="text-small text-muted">{T.rank(totals.filter((t) => t > s.total!).length + 1)}</span>
                  </>
                )}
              </td>
            ))}
          </tr>
          <tr>
            <td colSpan={2 + scored.length} className={GROUP_TD}>
              {T.numbers}
            </td>
          </tr>
          {numberRow(T.rowRadius, (s) => distText(s.row.candidate.radiusM))}
          {numberRow(T.rowPeople, (s) => {
            const n = count(s.row.facts.people?.total)
            return n === null ? <NoData /> : `${commaText(n)}명`
          })}
          {numberRow(T.rowSeniors, (s) => {
            const pct = seniorPct(s.groups)
            return pct === null ? <NoData /> : `${pct}%`
          })}
          {numberRow(
            T.rowRivals,
            (s) => {
              const n = s.row.rivals
              return n === null ? <NoData /> : `${commaText(n)}곳`
            },
            rivalShort,
          )}
          {numberRow(T.rowPerRival, (s) => {
            const n = s.row.rivals
            const people = count(s.row.facts.people?.total)
            if (n === 0) return T.noRival
            if (n === null || people === null) return <NoData />
            return `${commaText(Math.floor(people / n))}명`
          })}
          {numberRow(T.rowStation, (s) => {
            const st = shownValue(s.row.candidate.snapshot?.station)
            const d = num(st?.distM)
            return st && d !== null && d >= 0 ? `${st.name} · ${distText(d)}` : <NoData />
          })}
          {numberRow(T.rowSite, (s) => {
            const area = num(s.row.listing?.areaM2 ?? s.row.candidate.areaM2)
            const parts = [s.row.candidate.floorLabel.trim(), area !== null && area > 0 ? areaText(area) : ''].filter((t) => t !== '')
            return parts.length > 0 ? parts.join(' · ') : T.dash
          })}
          {numberRow(T.rowMoney, (s) => (s.row.listing === null ? <NoListing /> : `${man(s.row.listing.deposit)} / ${man(s.row.listing.rent)}`))}
          {numberRow(T.rowRentPy, (s) => {
            const l = s.row.listing
            if (l === null) return <NoListing />
            const perPy = perPyeongOf(l.rent, l.areaM2)
            if (perPy === null) return T.dash
            const vs = rents.rentAvg === null ? null : vsAverage(perPy, rents.rentAvg)
            const tone = vs === null || vs.pct === 0 ? 'text-muted' : vs.pct > 0 ? 'font-medium text-warning' : 'font-medium text-positive'
            return (
              <>
                {wonText(perPy)}
                {vs && (
                  <>
                    {' '}
                    <span className={`block text-caption ${tone}`}>{vs.text}</span>
                  </>
                )}
              </>
            )
          })}
          {numberRow(T.rowPremium, (s) => (s.row.listing === null ? <NoListing /> : man(s.row.listing.premium)))}
          {numberRow(T.rowFlags, (s) =>
            s.row.flags.length > 0 ? <span className={ds.chip.negative}>{T.flagCount(s.row.flags.length)}</span> : <span className="text-muted">{T.noFlag}</span>,
          )}
        </tbody>
      </table>
    </div>
  )
}

/** 종합에 보탠 점수. 무게가 모두 0이라 셀 수 없으면(값은 있음) 0점, 값이 없으면 null */
function pointsOf(g: GroupScore): number | null {
  if (g.points !== null) return g.points
  return g.score === null ? null : 0
}

function NoData() {
  return <span className="text-muted">{T.noData}</span>
}
function NoListing() {
  return <span className="font-medium text-muted">{T.noListing}</span>
}

function Progress({ candidate: c, letter, onStatus }: { candidate: Candidate; letter: string; onStatus: CandidateCompareProps['onStatus'] }) {
  const cur = STEPS.indexOf(c.status)
  const saved = dayText(c.createdAt)
  const when = [c.addressNote.trim(), saved ? T.saved(saved) : ''].filter((t) => t !== '').join(' · ')
  return (
    <div className={PROG}>
      <div className="flex min-w-0 items-center gap-2">
        <span className={LETTER}>{letter}</span>
        <div className="min-w-0">
          <b className="font-semibold text-ink">{c.name}</b>
          {when !== '' && <p className="text-caption text-muted">{when}</p>}
        </div>
      </div>
      <div role="group" aria-label={T.progressGroup(c.name)} className="flex min-w-0">
        {STEPS.map((s, i) => (
          <button
            key={s}
            type="button"
            className={i === cur ? STEP_CUR : i < cur ? STEP_DONE : STEP}
            aria-pressed={i === cur}
            data-done={i < cur ? 'true' : undefined}
            onClick={() => {
              if (s !== c.status) onStatus(c.id, s)
            }}
          >
            {`${i + 1}. ${STATUS_TEXT[s]}`}
          </button>
        ))}
      </div>
      <button type="button" className={SMALL_BTN} onClick={() => onStatus(c.id, 'dropped')}>
        {T.drop}
      </button>
    </div>
  )
}

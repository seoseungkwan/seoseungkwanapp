'use client'

// 후보 더하기 판 (spec location REQ-7908 AC-7908.1·AC-7908.2, design.md 6·14절, ADR-045, 시안 ?s=add 오른쪽 판).
// 세 길로 점을 정한다: 주소로 찾기(카카오 k-address 결과 고르기) · 지도에서 찍기(KakaoMap onPick) · 붙여 넣은 매물에서(점이 없는 매물은 주소로 찾아 고름).
// 그다음 층·부르는 이름(1~40자)·살필 범위(일곱 값, 처음 1,000m)·메모를 정해 [후보로 저장] → onSave(몸통).
// 부품은 props·콜백만 쓴다: 주소 찾기·그 자리 주소는 부르는 쪽 콜백(onFind·onSpot)이 받고, 저장도 onSave가 한다.
// 카카오에서 받은 주소 글은 화면에 보이기만 하고 몸통에는 넣지 않는다 — 몸통은 고른 점·적은 이름·적은 주소 글(찾을 때 적은 글)뿐(addDraft.ts).
// 판을 새로 열 때마다 부르는 쪽이 새로 그린다(처음 길·매물은 열 때 한 번 읽음). Esc·바탕 누름·[닫기]·[그만두기]는 onClose
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { WhyLine } from '@/components/location/common/WhyLine'
import { KakaoMap, type MapMark } from '@/components/location/map/KakaoMap'
import { ds } from '@/components/ui/classes'
import { distText } from '@/lib/location/coords'
import type { Listing, Point } from '@/types/location'
import {
  DEFAULT_RADIUS_INDEX,
  FLOOR_MAX,
  MEMO_MAX,
  NAME_MAX,
  QUERY_MAX,
  RADII,
  makeDraft,
  nameOk,
  queryOk,
  radiusAt,
  suggestName,
  type CandidateDraft,
} from './addDraft'
import { ADD_TEXT as T, listingLine, progressText, readyText } from './text'

export type { CandidateDraft } from './addDraft'

export type AddWay = 'address' | 'map' | 'listing'
const WAYS: readonly AddWay[] = ['address', 'map', 'listing']

/** 주소 찾기 한 줄 — 카카오 주소 찾기 답(k-address)에서 이 판이 쓰는 칸만. 글은 보여 주기만 한다 */
export type AddressHit = { at: Point; road: string | null; jibun: string | null }
/** 주소 찾기 결과. 못 받으면 까닭(카카오 장소 찾기 열쇠 없음 · 받지 못함) */
export type AddressFind = { ok: true; hits: readonly AddressHit[] } | { ok: false; why: 'no-key' | 'failed' }
/** 찍은 점의 주소(카카오 k-point) — 보여 주기만 */
export type SpotFind = { ok: true; road: string | null; jibun: string | null } | { ok: false; why: 'no-key' | 'failed' }
/** 붙여 넣은 매물에서 이 판이 쓰는 칸. 후보가 있는 매물(candidateId)은 판이 뺀다 */
export type AddListing = Pick<Listing, 'id' | 'candidateId' | 'title' | 'floorLabel' | 'areaM2' | 'deposit' | 'rent' | 'brokerNote' | 'lat' | 'lng'>

export type AddCandidatePanelProps = {
  /** 오늘 한국 날짜 'YYYY-MM-DD'(저장 안내 글) */
  today: string
  /** 지도에서 찍기의 처음 가운데 */
  center: Point
  /** 붙여 넣은 매물 모두(후보가 아닌 것만 보인다) */
  listings: readonly AddListing[]
  /** 처음 길(기본 주소로 찾기) */
  way?: AddWay
  /** 처음 고를 매물(매물 탭 [후보로 저장]). 없으면 후보가 아닌 첫 매물 */
  listingId?: string | null
  /** 주소 찾기(앞뒤 빈칸을 뺀 2~100자). 부르는 쪽이 k-address를 부른다 */
  onFind: (q: string) => Promise<AddressFind>
  /** 찍은 점의 주소(k-point). 보여 주기만 한다 */
  onSpot: (at: Point) => Promise<SpotFind>
  /** 저장. 참이면 저장됨(부르는 쪽이 판을 닫음), 거짓이면 판이 E-LOC-SAVE-FAILED를 보이고 적은 값을 둔다 */
  onSave: (draft: CandidateDraft) => Promise<boolean>
  onClose: () => void
  /** 저장하며 자료를 모으는 동안 진행(`자료 {n}/{m}`) */
  progress?: { done: number; total: number } | null
}

type Found = { state: 'idle' } | { state: 'busy' } | { state: 'done'; hits: readonly AddressHit[] } | { state: 'fail'; why: 'no-key' | 'failed' }
type Spot = { state: 'idle' } | { state: 'busy' } | { state: 'done'; text: string } | { state: 'fail'; why: 'no-key' | 'failed' }

// ── 모양(시안 .drawer·.dwh·.dwb·.dwf·.ob·.field·.inp·.ares·.range 값). 폰 전용 모양 없음 — ds는 폭 따라 바뀌지 않는 묶음만 쓴다 ──
const BTN_BASE = `inline-flex h-9 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-control border px-4 text-body font-medium transition ${ds.focusRing} disabled:cursor-not-allowed disabled:opacity-40 aria-busy:cursor-progress aria-busy:opacity-60`
const BTN = `${BTN_BASE} border-line-strong bg-surface text-ink not-disabled:hover:bg-canvas`
const BTN_PRIMARY = `${BTN_BASE} border-transparent bg-accent text-surface not-disabled:not-aria-busy:hover:bg-accent-strong`
const ICON_BTN = `inline-flex size-9 cursor-pointer items-center justify-center rounded-control text-ink-2 transition hover:bg-canvas ${ds.focusRing}`
const OPTION_ON = 'border-accent bg-accent-soft font-semibold text-accent-strong ring-1 ring-inset ring-accent'
const OPTION_OFF = 'border-line-strong bg-surface text-ink hover:bg-canvas'
const option = (on: boolean) => `h-9 cursor-pointer whitespace-nowrap rounded-control border px-3 text-body ${ds.focusRing} ${on ? OPTION_ON : OPTION_OFF}`
const FIELD = 'grid min-w-0 content-start gap-1.5'
const LABEL = 'flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-small font-semibold text-ink'
const REQ = 'text-caption font-normal text-muted'
const BOX = 'w-full min-w-0 rounded-control border border-line-strong bg-surface px-3 text-body text-ink placeholder:text-muted hover:border-muted focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-hidden aria-invalid:border-negative'
const INPUT = `h-11 ${BOX}`
const TEXTAREA = `min-h-22 resize-y py-2 ${BOX}`
const LIST = 'border-t border-line'
const ROW = 'flex cursor-pointer items-start gap-2 border-b border-line py-3'
const RADIO = `mt-0.5 size-4 shrink-0 cursor-pointer accent-accent ${ds.focusRing}`
const ROW_MAIN = 'block font-semibold text-ink'
const ROW_SUB = 'block text-caption text-muted'
const LEAD = 'text-small text-ink-2'
const STATUS = 'text-small text-muted'
const SLIDER = `h-6 w-full min-w-0 cursor-pointer accent-accent ${ds.focusRing}`

// 지도에 찍은 자리 표시(후보 파랑 동그라미)
const PICK_MARK = 'pick'

export function AddCandidatePanel({ today, center, listings, way: startWay = 'address', listingId: startListing = null, onFind, onSpot, onSave, onClose, progress = null }: AddCandidatePanelProps) {
  const ids = useId()
  const free = listings.filter((l) => l.candidateId === null)
  const [way, setWay] = useState<AddWay>(startWay)
  const [listingId, setListingId] = useState<string | null>(() => (free.some((l) => l.id === startListing) ? startListing : (free[0]?.id ?? null)))

  // 주소로 찾기(점 없는 매물도 같이 씀)
  const [q, setQ] = useState('')
  const [queryBad, setQueryBad] = useState(false)
  const [searched, setSearched] = useState('')
  const [found, setFound] = useState<Found>({ state: 'idle' })
  const [hitIndex, setHitIndex] = useState<number | null>(null)
  // 지도에서 찍기
  const [spot, setSpot] = useState<Point | null>(null)
  const [spotText, setSpotText] = useState<Spot>({ state: 'idle' })
  // 칸
  const [floor, setFloor] = useState('')
  const [name, setName] = useState<string | null>(null) // null = 아직 안 고침(처음 이름을 보임)
  const [radiusIndex, setRadiusIndex] = useState(DEFAULT_RADIUS_INDEX)
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  // 늦게 온 답이 새 답을 덮지 않게 · 닫힌 뒤 상태를 고치지 않게 · 기다리는 동안 다시 누름 무시
  const findTicket = useRef(0)
  const spotTicket = useRef(0)
  const alive = useRef(true)
  const busy = useRef(false)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function find(raw: string) {
    const text = raw.trim()
    if (!queryOk(text)) {
      setQueryBad(true)
      return
    }
    setQueryBad(false)
    const ticket = ++findTicket.current
    setSearched(text)
    setFound({ state: 'busy' })
    setHitIndex(null)
    let got: AddressFind
    try {
      got = await onFind(text)
    } catch {
      got = { ok: false, why: 'failed' }
    }
    if (!alive.current || ticket !== findTicket.current) return
    if (got.ok) {
      setFound({ state: 'done', hits: got.hits })
      setHitIndex(got.hits.length > 0 ? 0 : null)
    } else setFound({ state: 'fail', why: got.why })
  }

  async function pick(at: Point) {
    const ticket = ++spotTicket.current
    setSpot(at)
    setSpotText({ state: 'busy' })
    let got: SpotFind
    try {
      got = await onSpot(at)
    } catch {
      got = { ok: false, why: 'failed' }
    }
    if (!alive.current || ticket !== spotTicket.current) return
    setSpotText(got.ok ? { state: 'done', text: got.road ?? got.jibun ?? T.noText } : { state: 'fail', why: got.why })
  }

  // ── 지금 고른 점 · 적은 주소 글 · 층 · 처음 이름 ──
  const hits = found.state === 'done' ? found.hits : []
  const hit = hitIndex === null ? null : (hits[hitIndex] ?? null)
  const listing = way === 'listing' ? (free.find((l) => l.id === listingId) ?? null) : null
  const listingPoint = listing && listing.lat !== null && listing.lng !== null ? { lat: listing.lat, lng: listing.lng } : null
  const searchPoint = hit ? hit.at : null
  const searchNote = hit ? searched : ''

  let point: Point | null
  let addressNote: string
  let needPoint: string
  if (way === 'address') {
    point = searchPoint
    addressNote = searchNote
    needPoint = T.need.address
  } else if (way === 'map') {
    point = spot
    addressNote = ''
    needPoint = T.need.map
  } else if (listing === null) {
    point = null
    addressNote = ''
    needPoint = T.need.listing
  } else if (listingPoint) {
    point = listingPoint
    addressNote = ''
    needPoint = T.need.listing
  } else {
    point = searchPoint
    addressNote = searchNote
    needPoint = T.need.listingPoint
  }
  const floorLabel = listing ? listing.floorLabel : floor
  const suggestion = way === 'address' ? (hit ? suggestName(searched, floor) : '') : listing ? suggestName(listing.title, listing.floorLabel) : ''
  const nameValue = name ?? suggestion
  const radiusM = radiusAt(radiusIndex)
  const draft = makeDraft({ point, name: nameValue, addressNote, radiusM, floorLabel, memo, listingId: listing?.id ?? null })
  const nameBad = !nameOk(nameValue) && (name !== null || point !== null)
  const foot = progress ? progressText(progress.done, progress.total) : draft ? readyText(today) : point === null ? needPoint : ''

  async function save() {
    if (busy.current || draft === null) return
    busy.current = true
    setSaving(true)
    setFailed(false)
    let ok: boolean
    try {
      ok = await onSave(draft)
    } catch {
      ok = false
    }
    busy.current = false
    if (!alive.current) return
    setSaving(false)
    setFailed(!ok)
  }

  // ── 조각 ──
  const search = (
    <AddressSearch
      id={`${ids}-q`}
      q={q}
      bad={queryBad}
      found={found}
      hitIndex={hitIndex}
      radioName={`${ids}-hit`}
      onQ={setQ}
      onFind={() => void find(q)}
      onRetry={() => void find(searched)}
      onHit={setHitIndex}
    />
  )
  const floorField = (
    <Field id={`${ids}-floor`} label={T.floor}>
      <input id={`${ids}-floor`} className={INPUT} value={floor} maxLength={FLOOR_MAX} placeholder={T.floorHolder} onChange={(e) => setFloor(e.target.value)} />
    </Field>
  )
  const nameField = (
    <Field id={`${ids}-name`} label={T.name} error={nameBad ? T.nameBad : null}>
      <input
        id={`${ids}-name`}
        className={INPUT}
        value={nameValue}
        maxLength={NAME_MAX}
        placeholder={T.nameHolder}
        aria-invalid={nameBad || undefined}
        aria-describedby={nameBad ? `${ids}-name-error` : undefined}
        onChange={(e) => setName(e.target.value)}
      />
    </Field>
  )
  const marks: MapMark[] = spot ? [{ id: PICK_MARK, kind: 'candidate', at: spot, label: '+' }] : []

  return (
    <>
      <div data-testid="add-scrim" aria-hidden="true" className="fixed inset-0 z-40 bg-ink/36" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        className="fixed top-0 right-0 bottom-0 z-50 flex w-140 max-w-full flex-col border-l border-line-strong bg-surface shadow-float"
      >
        <div className="flex items-center justify-between gap-2 border-b border-line py-2 pr-3 pl-6">
          <h2 id={`${ids}-title`} className="text-subtitle font-semibold text-ink">
            {T.title}
          </h2>
          <button type="button" aria-label={T.close} className={ICON_BTN} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>

        <div className="grid flex-1 content-start gap-5 overflow-y-auto px-6 pt-5 pb-6">
          <div role="group" aria-label={T.ways} className="flex flex-wrap gap-1.5">
            {WAYS.map((w) => (
              <button key={w} type="button" aria-pressed={way === w} className={option(way === w)} onClick={() => setWay(w)}>
                {T.way[w]}
              </button>
            ))}
          </div>

          {way === 'address' && (
            <>
              {search}
              <div className="grid grid-cols-2 gap-x-3 gap-y-5">
                {floorField}
                {nameField}
              </div>
            </>
          )}

          {way === 'map' && (
            <>
              <div className="grid gap-1.5">
                <KakaoMap label={T.mapLabel} center={center} marks={marks} height={280} onPick={(at) => void pick(at)} />
                <p className={ds.help}>{T.mapHelp}</p>
              </div>
              <dl>
                <div className="grid grid-cols-[148px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 border-b border-line py-2">
                  <dt className="text-small text-muted">{T.picked}</dt>
                  <dd className="min-w-0 text-body text-ink">
                    {spotText.state === 'idle' && <span className="text-muted">{T.notPicked}</span>}
                    {spotText.state === 'busy' && <span role="status" className="text-muted">{T.spotFinding}</span>}
                    {spotText.state === 'done' && spotText.text}
                    {spotText.state === 'fail' && <WhyLine why={spotText.why} src="kakao-local" />}
                  </dd>
                </div>
              </dl>
              <div className="grid grid-cols-2 gap-x-3 gap-y-5">
                {floorField}
                {nameField}
              </div>
            </>
          )}

          {way === 'listing' && (
            <>
              <p className={LEAD}>{T.listingLead}</p>
              {free.length === 0 ? (
                <p className={`${STATUS} py-2`}>{T.noListings}</p>
              ) : (
                <div role="radiogroup" aria-label={T.listings} className={LIST}>
                  {free.map((l) => {
                    const line = listingLine(l)
                    return (
                      <label key={l.id} className={ROW}>
                        <input type="radio" name={`${ids}-listing`} className={RADIO} checked={listingId === l.id} onChange={() => setListingId(l.id)} />
                        <span className="min-w-0">
                          <b className={ROW_MAIN}>{[l.title, l.floorLabel.trim()].filter(Boolean).join(' ')}</b>
                          {line && <small className={ROW_SUB}>{line}</small>}
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}
              {listing && !listingPoint && (
                <>
                  <p className={LEAD}>{T.listingNoPoint}</p>
                  {search}
                </>
              )}
              {nameField}
            </>
          )}

          <div className="grid gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor={`${ids}-range`} className="text-small font-semibold text-ink">
                {T.range}
              </label>
              <b data-testid="add-radius" className="text-title font-semibold tabular-nums text-ink">
                {distText(radiusM)}
              </b>
            </div>
            <input
              id={`${ids}-range`}
              type="range"
              className={SLIDER}
              min={0}
              max={RADII.length - 1}
              step={1}
              value={radiusIndex}
              aria-valuetext={distText(radiusM)}
              onChange={(e) => setRadiusIndex(Number(e.target.value))}
            />
            <div aria-hidden="true" className="flex justify-between text-caption text-muted tabular-nums">
              {T.ticks.map((tick) => (
                <span key={tick}>{tick}</span>
              ))}
            </div>
            <p className={ds.help}>{T.rangeHelp}</p>
          </div>

          <Field id={`${ids}-memo`} label={T.memo}>
            <textarea id={`${ids}-memo`} className={TEXTAREA} value={memo} maxLength={MEMO_MAX} placeholder={T.memoHolder} onChange={(e) => setMemo(e.target.value)} />
          </Field>

          {failed && <ErrorCard code="E-LOC-SAVE-FAILED" />}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-3">
          <p aria-live="polite" className="grow basis-50 text-caption text-muted">
            {foot}
          </p>
          <button type="button" className={BTN} onClick={onClose}>
            {T.cancel}
          </button>
          <button type="button" className={BTN_PRIMARY} disabled={draft === null} aria-busy={saving || undefined} onClick={() => void save()}>
            {T.save}
          </button>
        </div>
      </aside>
    </>
  )
}

// ── 칸 하나(이름 → 입력 → 오류 글) ──
function Field({ id, label, required = false, error = null, children }: { id: string; label: string; required?: boolean; error?: string | null; children: ReactNode }) {
  return (
    <div className={FIELD}>
      <label htmlFor={id} className={LABEL}>
        {label}
        {required && <span className={REQ}>{T.required}</span>}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className={ds.fieldError}>
          {error}
        </p>
      )}
    </div>
  )
}

// ── 주소로 찾기: 주소 칸 + [찾기](Enter도) → 결과 라디오(첫째가 골라짐) · 찾는 중 · 없음 · 열쇠 없음 · 받지 못함([다시 받기]) ──
function AddressSearch({
  id,
  q,
  bad,
  found,
  hitIndex,
  radioName,
  onQ,
  onFind,
  onRetry,
  onHit,
}: {
  id: string
  q: string
  bad: boolean
  found: Found
  hitIndex: number | null
  radioName: string
  onQ: (q: string) => void
  onFind: () => void
  onRetry: () => void
  onHit: (i: number) => void
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onFind()
  }
  return (
    <div className="grid gap-3">
      <form className={FIELD} onSubmit={submit}>
        <label htmlFor={id} className={LABEL}>
          {T.address}
          <span className={REQ}>{T.required}</span>
        </label>
        <div className="flex gap-2">
          <input
            id={id}
            className={INPUT}
            value={q}
            maxLength={QUERY_MAX}
            aria-invalid={bad || undefined}
            aria-describedby={bad ? `${id}-error` : `${id}-help`}
            onChange={(e) => onQ(e.target.value)}
          />
          <button type="submit" className={`${BTN} h-11`} aria-busy={found.state === 'busy' || undefined}>
            {T.find}
          </button>
        </div>
        <p id={`${id}-help`} className={ds.help}>
          {T.addressHelp}
        </p>
        {bad && (
          <p id={`${id}-error`} className={ds.fieldError}>
            {T.queryBad}
          </p>
        )}
      </form>
      {found.state === 'busy' && (
        <p role="status" className={STATUS}>
          {T.finding}
        </p>
      )}
      {found.state === 'fail' && <WhyLine why={found.why} src="kakao-local" onRetry={found.why === 'failed' ? onRetry : undefined} />}
      {found.state === 'done' && found.hits.length === 0 && <p className={STATUS}>{T.noHits}</p>}
      {found.state === 'done' && found.hits.length > 0 && (
        <div role="radiogroup" aria-label={T.hits} className={LIST}>
          {found.hits.map((hit, i) => (
            <label key={i} className={ROW}>
              <input type="radio" name={radioName} className={RADIO} checked={hitIndex === i} onChange={() => onHit(i)} />
              <span className="min-w-0">
                <b className={ROW_MAIN}>{hit.road ?? hit.jibun ?? T.noText}</b>
                {hit.road && hit.jibun && <small className={ROW_SUB}>{hit.jibun}</small>}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

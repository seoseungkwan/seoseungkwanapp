'use client'

// 입지 분석 화면(spec location TASK-44 · REQ-7901·REQ-7908·REQ-7917·REQ-7919, design.md 14절, 시안 docs/mockups/location/index.html).
// 머리(h1·관리자만 보여요·후보 수·[후보 더하기]) · 안쪽 탭 여섯 · 후보 고르기(후보 자세히·개원 준비·보고서) · 처음(후보 없음) · 열쇠 없음 · 보고서.
// 읽기·저장·부르기는 useLocation 한 곳이고, 안쪽 부품은 props·콜백만 받는다(Phase 3·4 부품을 고치지 않고 잇기만 한다).
// - 주소: ?tab=&c=로 열고, 탭·후보를 바꾸면 history.replaceState로 주소만 고친다(다시 그리지 않음)
// - 후보 글자 A·B·C…는 저장한 차례(내려놓은 후보 포함) 그대로 — 후보 고르기·자세히·견주기가 같다(내려놓은 후보는 고르기에서만 뺀다)
// - 점수 설정을 바꾸면 손에 든 설정만 바뀌고 훑기·후보 점수·견주기·보고서가 바로 다시 센다(다시 부르지 않음)
// - 열쇠 없음·처음 화면은 머리를 스스로 그리므로 이 화면의 머리는 그리지 않는다
// - PC 배치 하나: 두 칸 틀(훑기·후보 자세히)은 최소 폭 1,024px, 좁으면 그 감싸개 안에서만 옆으로 밀린다(폰 전용 모양 없음)
// - 인쇄(보고서): 머리·안쪽 탭·후보 고르기는 print:hidden
// - /location 안에서 다른 탭으로 가는 링크는 평범한 <a href>다(Next Link 없음, design.md 1절 CSP)
import { useMemo, useState, type ReactNode } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { shrinkPhoto } from '@/components/inventory/photo'
import { ds } from '@/components/ui/classes'
import { todayInKorea } from '@/lib/analytics/dates'
import { pickFlags } from '@/lib/location/flags'
import { scoreItems } from '@/lib/location/score'
import { SNAPSHOT_KEYS } from '@/lib/location/snapshot'
import type { Candidate, Point, Snapshot, SourceId } from '@/types/location'
import { AddCandidatePanel, type AddWay } from './add/AddCandidatePanel'
import { asOfText } from './common/text'
import { CandidateCompare } from './compare/CandidateCompare'
import { letterOf } from './compare/text'
import { DemandSection } from './detail/demand/DemandSection'
import { TrafficSection } from './detail/demand/TrafficSection'
import { CandidateFrame, type SectionId } from './detail/frame/CandidateFrame'
import { candidateListing, flagInputOf, scoreFactsOf } from './detail/frame/facts'
import { FutureSection, IncomeSection, PeopleSection } from './detail/people'
import { HoursSection } from './detail/rivals/HoursSection'
import { PriceSection } from './detail/rivals/PriceSection'
import { RivalsSection } from './detail/rivals/RivalsSection'
import { BuildingDocs, LandUse, StreetPhotos, Vacancy } from './detail/site'
import { ListingsView } from './listings/ListingsView'
import { KakaoMap } from './map/KakaoMap'
import { HomeEswt } from './prep/plan/HomeEswt'
import { OpenCosts } from './prep/plan/OpenCosts'
import { OpenSchedule } from './prep/plan/OpenSchedule'
import { PrepVisit } from './prep/visit/PrepVisit'
import { OnePageReport } from './report/OnePageReport'
import { ScanView } from './scan/ScanView'
import { SourcesView } from './sources/SourcesView'
import { EmptyScreen } from './start/EmptyScreen'
import { showNoKey, type FreeTool, type MapKeyState } from './start/keys'
import { NoKeyScreen } from './start/NoKeyScreen'
import { PlusIcon } from './start/icons'
import { StartHead } from './start/StartHead'
import { useLocation, usePhotoUrls, type LocationApi } from './useLocation'

export type LocationTab = 'scan' | 'detail' | 'listings' | 'compare' | 'prep' | 'sources' | 'report'
export type LocationScreenProps = {
  /** 주소 ?tab= (page.tsx가 일곱 가운데 하나만 넘긴다) */
  tab?: LocationTab
  /** 주소 ?c= (uuid 모양만). 없는 후보면 버리고 동네 훑기로 연다 */
  candidateId?: string
  /** 한 장 보고서 머리의 병원 이름 */
  hospitalName?: string
}

type ShownTab = Exclude<LocationTab, 'report'>
const TABS: readonly { id: ShownTab; label: string }[] = [
  { id: 'scan', label: '동네 훑기' },
  { id: 'detail', label: '후보 자세히' },
  { id: 'listings', label: '매물' },
  { id: 'compare', label: '후보 견주기' },
  { id: 'prep', label: '개원 준비' },
  { id: 'sources', label: '근거와 출처' },
]
/** 후보를 하나 골라 보는 탭(주소에 c를 붙이고 후보 고르기를 보인다) */
const WITH_CANDIDATE: readonly LocationTab[] = ['detail', 'prep', 'report']

const T = {
  loading: '입지 분석 자료를 불러오고 있어요',
  admin: '관리자만 보여요',
  count: (n: number) => `후보 ${n}곳`,
  when: '자료는 볼 때 받아요 · 후보는 저장한 날 값으로 굳혀 둬요',
  add: '후보 더하기',
  tabs: '입지 분석 안 메뉴',
  pick: '후보 고르기',
  pickLabel: '후보',
  score: (n: number | null) => (n === null ? '점수 없음' : `${n}점`),
  reload: '다시 읽기',
  close: '닫기',
  noCandidate: '아직 후보가 없어요. 후보를 더하면 여기서 볼 수 있어요.',
  prepNoCandidate: '후보를 저장하면 개원 비용·일정·보러 갈 때 점검표를 후보마다 남겨요. 지금 적는 비용은 저장하지 않고 계산만 해요.',
  mapLabel: (name: string) => `${name} 둘레 지도`,
} as const

// 모양(시안 .ltop·.subtabs·.candbar·.cb·.btn 값). 폰 전용 모양 없음 — 폭 따라 바뀌는 공용 묶음은 쓰지 않는다
const BUTTON = `inline-flex h-9 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-control border border-line-strong bg-surface px-4 text-body font-medium text-ink transition hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40 ${ds.focusRing}`
const TAB = `relative h-10 shrink-0 cursor-pointer whitespace-nowrap px-3 font-medium text-ink-2 hover:text-ink aria-[current=page]:font-semibold aria-[current=page]:text-ink aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-3 aria-[current=page]:after:bottom-0 aria-[current=page]:after:h-0.5 aria-[current=page]:after:bg-accent ${ds.focusRing}`
const CAND = `inline-flex h-10 cursor-pointer items-center gap-2 whitespace-nowrap rounded-control border border-line-strong bg-surface px-3 text-ink-2 hover:bg-canvas aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:shadow-[inset_0_0_0_1px_var(--accent)] ${ds.focusRing}`
const LETTER = 'inline-grid size-5.5 place-items-center rounded-control bg-ink text-caption font-semibold text-surface'
const SITE_HEAD = 'flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line-strong pb-1.5'
/** 두 칸 틀 감싸개: 최소 폭 1,024px, 좁으면 이 안에서만 옆으로 밀린다(AC-7901.4) */
function Wide({ children }: { children: ReactNode }) {
  return (
    <div className="mt-5 overflow-x-auto">
      <div className="min-w-[1024px]">{children}</div>
    </div>
  )
}

/** 지도 열쇠는 브라우저가 넣었는지만 안다(useKakaoSdk와 같은 값) */
const mapKeyState = (): MapKeyState => ((process.env.NEXT_PUBLIC_KAKAO_MAP_KEY ?? '').trim() !== '' ? 'ok' : 'missing')
/** 후보도 시군구도 없을 때 지도 가운데(서울시청) */
const FALLBACK_CENTER: Point = { lat: 37.5665, lng: 126.978 }

const pointOf = (c: Candidate): Point => ({ lat: c.lat, lng: c.lng })

/** '근거와 출처' 기준 날짜 글: 그날 값 칸마다 출처 id → 기준 날짜(지난 값이면 그 날짜) */
function asOfMap(s: Snapshot | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!s) return out
  for (const key of SNAPSHOT_KEYS) {
    const got = s[key]
    const day = got.ok ? got.asOf : got.prev?.asOf
    if (day && out[got.src] === undefined) out[got.src] = asOfText(day)
  }
  return out
}

/** 사이트 묶음 머리(36 부품의 머리를 끄고 같은 모양으로 그린다 — 틀의 sec-{칸}과 id가 겹치지 않게) */
function SiteBlock({ title, aside, children }: { title: string; aside: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className={SITE_HEAD}>
        <h3 className="text-subtitle font-semibold text-ink">{title}</h3>
        <span className="text-small text-muted">{aside}</span>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  )
}

type Adding = { way: AddWay; listingId?: string | null; center?: Point }

export function LocationScreen({ tab: startTab, candidateId: startId, hospitalName }: LocationScreenProps) {
  const api = useLocation()
  const today = todayInKorea()

  // 처음 탭·후보는 표를 읽은 뒤 한 번 정한다. tab이 null이면 아직 고른 탭이 없다(처음·열쇠 없음 화면을 보일 수 있음)
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState<LocationTab | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)
  const [adding, setAdding] = useState<Adding | null>(null)
  if (!ready && api.load.status === 'ready') {
    setReady(true)
    const hit = startId ? api.candidates.find((c) => c.id === startId) : undefined
    if (startId && !hit) setTab('scan')
    else {
      setTab(startTab ?? null)
      if (hit) setChosen(hit.id)
    }
  }

  const candidates = api.candidates
  const live = candidates.filter((c) => c.status !== 'dropped')
  const letters = useMemo(() => new Map(candidates.map((c, i) => [c.id, letterOf(i)])), [candidates])
  const selected = candidates.find((c) => c.id === chosen) ?? live[0] ?? null
  const shown: LocationTab = tab ?? 'scan'
  const rule = api.rule
  const homeEswt = api.settings?.homeEswt ?? null

  // 사진 주소: 개원 준비를 볼 때만 받고, 떠나면 되돌린다
  const selectedPhotos = useMemo(
    () => (shown === 'prep' && selected ? api.photos.filter((p) => p.candidateId === selected.id) : []),
    [api.photos, selected, shown],
  )
  const photoUrls = usePhotoUrls(api.readPhoto, selectedPhotos)

  // ── 주소 고치기(다시 그리지 않음) ──
  function writeUrl(next: LocationTab, id: string | null, hash = '') {
    const q = new URLSearchParams({ tab: next })
    if (id && WITH_CANDIDATE.includes(next)) q.set('c', id)
    window.history.replaceState(window.history.state, '', `/location?${q.toString()}${hash}`)
  }
  function go(next: LocationTab, id: string | null = selected?.id ?? null) {
    setTab(next)
    if (id) setChosen(id)
    writeUrl(next, id)
  }
  /** '근거와 출처'의 닻으로(이미 그 탭이면 닻만 따라가게 알린다) */
  function goSources(hash: string) {
    const already = shown === 'sources'
    setTab('sources')
    writeUrl('sources', null, hash)
    if (already) window.dispatchEvent(new HashChangeEvent('hashchange'))
  }
  // 출처 닻은 sourceHref와 같은 `#src-<id>`
  const openSource = (id: SourceId) => goSources(`#src-${id}`)
  const openLaw = (id: string) => goSources(`#law-${id}`)

  // ── 읽는 중 · 못 읽음 ──
  if (api.load.status === 'loading' && !ready) {
    return (
      <p role="status" className="text-body text-muted">
        {T.loading}
      </p>
    )
  }
  if (api.load.status === 'failed') {
    return (
      <div className="grid gap-4">
        <StartHead />
        <ErrorCard code="E-LOC-READ-FAILED" />
        <div>
          <button type="button" className={BUTTON} onClick={api.reload}>
            {T.reload}
          </button>
        </div>
      </div>
    )
  }

  const keys = api.keys ?? { data: 'failed', kakao: 'failed' }
  const mapKey = mapKeyState()
  const panel = adding ? (
    <AddCandidatePanel
      today={today}
      center={adding.center ?? (selected ? pointOf(selected) : FALLBACK_CENTER)}
      listings={api.listings}
      way={adding.way}
      listingId={adding.listingId ?? null}
      onFind={api.findAddress}
      onSpot={api.spotAddress}
      onSave={async (draft) => {
        const saved = await api.addCandidate(draft)
        if (!saved) return false
        setAdding(null)
        go('detail', saved.id)
        return true
      }}
      onClose={() => setAdding(null)}
      progress={api.adding}
    />
  ) : null

  // ── 처음 · 열쇠 없음(머리는 그 화면이 그린다) ──
  if (tab === null && (showNoKey(keys) || candidates.length === 0)) {
    const openFree = (to: FreeTool) => go(to === 'listings' ? 'listings' : 'prep')
    return (
      <>
        {showNoKey(keys) ? (
          <NoKeyScreen keys={keys} mapKey={mapKey} onOpen={openFree} />
        ) : (
          <EmptyScreen
            index={api.index}
            keys={keys}
            mapKey={mapKey}
            onScan={(code5) => {
              go('scan')
              api.pickSgg(code5)
            }}
            onAdd={() => setAdding({ way: 'address' })}
            onOpen={openFree}
          />
        )}
        {panel}
      </>
    )
  }

  const scoreOf = (c: Candidate) => scoreItems(scoreFactsOf({ candidate: c, listings: api.listings, homeEswt, today }), rule).total
  const currentTab: ShownTab = shown === 'report' ? 'detail' : shown

  return (
    <div className="min-w-0">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 print:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="text-title font-semibold text-ink">입지 분석</h1>
          <span className={ds.chip.neutral}>{T.admin}</span>
          <span className="whitespace-nowrap text-small text-muted">{T.count(live.length)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-muted">{T.when}</span>
          <button type="button" className={BUTTON} onClick={() => setAdding({ way: 'address' })}>
            <PlusIcon />
            {T.add}
          </button>
        </div>
      </header>

      <nav aria-label={T.tabs} className="mt-3 flex gap-1 overflow-x-auto border-b border-line print:hidden">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={TAB} aria-current={currentTab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
            {t.label}
            {t.id === 'listings' || t.id === 'compare' ? (
              <span className="ml-1 font-medium text-muted tabular-nums">{t.id === 'listings' ? api.listings.length : live.length}</span>
            ) : null}
          </button>
        ))}
      </nav>

      {WITH_CANDIDATE.includes(shown) && live.length > 0 ? (
        <div role="group" aria-label={T.pick} className="mt-4 flex flex-wrap items-center gap-2 print:hidden">
          <span className="mr-1 text-small text-muted">{T.pickLabel}</span>
          {live.map((c) => (
            <button key={c.id} type="button" className={CAND} aria-pressed={selected?.id === c.id} onClick={() => go(shown, c.id)}>
              <span className={LETTER}>{letters.get(c.id)}</span>
              <span className="font-medium text-ink">{c.name}</span>
              <span className="font-semibold text-ink tabular-nums">{T.score(scoreOf(c))}</span>
            </button>
          ))}
        </div>
      ) : null}

      {api.saveError ? (
        <div className="mt-4 grid gap-2 print:hidden">
          <ErrorCard code="E-LOC-SAVE-FAILED" />
          <div>
            <button type="button" className={BUTTON} onClick={api.clearSaveError}>
              {T.close}
            </button>
          </div>
        </div>
      ) : null}

      <TabBody
        api={api}
        tab={shown}
        selected={selected}
        letters={letters}
        today={today}
        homeEswt={homeEswt}
        hospitalName={hospitalName}
        photoUrls={photoUrls}
        go={go}
        goSources={goSources}
        openSource={openSource}
        openLaw={openLaw}
        onAdd={(a) => setAdding(a)}
      />
      {panel}
    </div>
  )
}

type BodyProps = {
  api: LocationApi
  tab: LocationTab
  selected: Candidate | null
  letters: ReadonlyMap<string, string>
  today: string
  homeEswt: number | null
  hospitalName?: string
  photoUrls: Record<string, string | null>
  go: (tab: LocationTab, id?: string | null) => void
  goSources: (hash: string) => void
  openSource: (id: SourceId) => void
  openLaw: (id: string) => void
  onAdd: (a: Adding) => void
}

function TabBody(p: BodyProps) {
  const { api, tab, selected: sel, letters, today, homeEswt } = p
  const rule = api.rule
  const listings = api.listings

  if (tab === 'scan') {
    return (
      <Wide>
        <ScanView
          index={api.index}
          sgg={api.scan.sgg}
          onPickSgg={api.pickSgg}
          dongs={api.scan.dongs}
          result={api.scan.result}
          progress={api.scan.progress}
          rule={rule}
          onRuleChange={api.changeRule}
          onRuleSave={(r) => void api.saveRule(r)}
          candidates={api.candidates.filter((c) => c.status !== 'dropped').map((c) => ({ id: c.id, label: p.letters.get(c.id) ?? '', at: pointOf(c) }))}
          onAdd={(spot) => p.onAdd({ way: 'map', center: spot.at })}
          onRetry={api.retryScan}
          onOpenSources={() => p.goSources('#src-score')}
        />
      </Wide>
    )
  }

  if (tab === 'listings') {
    return (
      <div className="mt-5">
        <ListingsView
          listings={listings}
          candidates={api.candidates.map((c) => ({ id: c.id, name: c.name, status: c.status, terms: c.terms }))}
          places={api.candidates.map((c) => ({ id: c.id, label: `후보 ${letters.get(c.id) ?? ''} ${c.name}`, point: pointOf(c) }))}
          defaultPlaceId={sel?.id}
          onSave={api.saveListing}
          onAddBroker={api.addBroker}
          onSaveTerms={api.saveTerms}
          onMakeCandidate={(l) => p.onAdd({ way: 'listing', listingId: l.id })}
        />
      </div>
    )
  }

  if (tab === 'compare') {
    const rows = api.candidates.map((c) => ({
      candidate: c,
      facts: scoreFactsOf({ candidate: c, listings, homeEswt, today }),
      flags: pickFlags(flagInputOf({ candidate: c, listings, today })),
      listing: candidateListing(c.id, listings),
    }))
    return (
      <div className="mt-5">
        <CandidateCompare rows={rows} listings={listings} rule={rule} onStatus={(id, s) => void api.setStatus(id, s)} onEditWeights={() => p.go('scan')} />
      </div>
    )
  }

  if (tab === 'sources') {
    return <SourcesView rule={rule} asOf={asOfMap(sel?.snapshot)} />
  }

  if (tab === 'prep') {
    return <PrepTab {...p} />
  }

  // 후보 자세히 · 보고서: 후보가 있어야 한다
  if (!sel) {
    return (
      <div className="mt-6 grid justify-items-start gap-3">
        <p className="text-body text-ink-2">{T.noCandidate}</p>
        <button type="button" className={BUTTON} onClick={() => p.onAdd({ way: 'address' })}>
          <PlusIcon />
          {T.add}
        </button>
      </div>
    )
  }

  if (tab === 'report') {
    return (
      <div className="mt-5">
        <OnePageReport
          candidate={sel}
          listing={candidateListing(sel.id, listings)}
          listings={listings}
          notes={api.notes.filter((n) => n.candidateId === sel.id)}
          facts={scoreFactsOf({ candidate: sel, listings, homeEswt, today })}
          rule={rule}
          today={today}
          hospitalName={p.hospitalName}
          onBack={() => p.go('detail', sel.id)}
        />
      </div>
    )
  }

  return <DetailTab {...p} selected={sel} />
}

function DetailTab(p: BodyProps & { selected: Candidate }) {
  const { api, selected: sel, letters, today, homeEswt, openSource, openLaw } = p
  const letter = letters.get(sel.id) ?? ''
  const viewed = api.viewed && api.viewed.candidateId === sel.id ? api.viewed : null
  const near = viewed?.near ?? {}
  const s = sel.snapshot
  const retry = () => void api.refresh(sel.id)
  const at = pointOf(sel)
  const save = (changes: Parameters<LocationApi['saveCandidate']>[1]) => void api.saveCandidate(sel.id, changes)

  const sections: Partial<Record<SectionId, ReactNode>> = {
    photo: (
      <SiteBlock title="거리 사진" aside="가지 않고 둘레를 봐요">
        <StreetPhotos head={false} at={at} markLabel={letter} sign={sel.signVisible} onSign={(v) => save({ signVisible: v })} onOpenSource={openSource} />
      </SiteBlock>
    ),
    land: (
      <SiteBlock title="땅 쓰임·계획" aside="토지이음 링크로 봐요">
        <LandUse head={false} pnu={viewed ? viewed.pnu : undefined} onOpenSource={openSource} />
      </SiteBlock>
    ),
  }
  if (s) {
    sections.people = <PeopleSection snapshot={s} onRetry={retry} onOpenSource={openSource} />
    sections.income = <IncomeSection snapshot={s} onRetry={retry} onOpenSource={openSource} />
    sections.demand = <DemandSection snapshot={s} bands={api.rule.bands} near={near} onRetry={retry} onRetryNear={api.retryNear} onOpenSource={openSource} />
    sections.rivals = <RivalsSection radiusM={s.radiusM} rivals={s.rivals} history={s.history} people={s.people} onRetry={retry} onOpenSource={openSource} />
    sections.price = (
      <PriceSection
        id="sec-price-in"
        radiusM={s.radiusM}
        rivals={s.rivals}
        homeEswt={homeEswt}
        onWriteHomeEswt={() => p.go('prep', sel.id)}
        onRetry={retry}
        onOpenSource={openSource}
      />
    )
    sections.hours = <HoursSection id="sec-hours-in" radiusM={s.radiusM} rivals={s.rivals} onRetry={retry} onOpenSource={openSource} />
    sections.traffic = <TrafficSection snapshot={s} near={near} onRetry={retry} onRetryNear={api.retryNear} onOpenSource={openSource} />
    sections.building = (
      <SiteBlock title="건물 서류" aside="건축물대장">
        <BuildingDocs
          head={false}
          building={s.building}
          floorLabel={sel.floorLabel}
          areaM2={sel.areaM2}
          today={today}
          violation={sel.violation}
          onViolation={(v) => save({ violation: v })}
          onRetry={retry}
          onOpenSource={openSource}
          onOpenLaw={openLaw}
        />
      </SiteBlock>
    )
    sections.vacancy = (
      <SiteBlock title="빈 칸 짐작" aside="층마다 들어선 가게로 빈 층을 짐작해요">
        <Vacancy head={false} building={s.building} stores={s.stores} floorLabel={sel.floorLabel} onRetry={retry} onOpenSource={openSource} />
      </SiteBlock>
    )
    sections.future = <FutureSection snapshot={s} onRetry={retry} onOpenSource={openSource} />
  }

  // 지도: 후보 점 + 살필 범위(경쟁 의원·역은 그날 값에 좌표가 없어 아직 찍지 않는다)
  const map = (
    <KakaoMap
      label={T.mapLabel(sel.name)}
      center={at}
      radiusM={s?.radiusM ?? sel.radiusM}
      marks={[{ id: sel.id, kind: 'candidate', at, label: letter }]}
      height={240}
    />
  )

  return (
    <Wide>
      <CandidateFrame
        candidate={sel}
        letter={letter}
        kakaoAddress={viewed ? (viewed.address ?? null) : null}
        listings={api.listings}
        rule={api.rule}
        homeEswt={homeEswt}
        today={today}
        progress={api.refreshing[sel.id] ?? null}
        sections={sections}
        map={map}
        onOpen={api.openCandidate}
        onRefresh={(id) => void api.refresh(id)}
        onRadius={(id, m) => void api.refresh(id, m)}
        onGo={(t) => p.go(t, sel.id)}
        onOpenSource={openSource}
        onOpenLaw={openLaw}
      />
    </Wide>
  )
}

function PrepTab(p: BodyProps) {
  const { api, selected: sel, today, homeEswt, openLaw, photoUrls } = p
  // 후보가 없을 때 비용 칸은 계산만 한다(저장하지 않음)
  const [looseCosts, setLooseCosts] = useState<Record<string, unknown>>({})
  const listing = sel ? candidateListing(sel.id, api.listings) : null

  return (
    <div className="mt-5 grid gap-10">
      <HomeEswt value={homeEswt} onSave={(won) => void api.saveHomeEswt(won)} />
      {sel ? (
        <>
          <OpenCosts
            costs={sel.costs}
            areaM2={sel.areaM2 ?? listing?.areaM2 ?? null}
            listing={listing}
            onSave={(costs) => void api.saveCandidate(sel.id, { costs })}
          />
          <OpenSchedule
            openOn={sel.openOn}
            today={today}
            done={sel.tasksDone}
            onOpenOn={(openOn) => void api.saveCandidate(sel.id, { openOn })}
            onDone={(tasksDone) => void api.saveCandidate(sel.id, { tasksDone })}
            onOpenLaw={openLaw}
          />
          <PrepVisit
            candidate={sel}
            photos={api.photos.filter((x) => x.candidateId === sel.id).map((x) => ({ id: x.id, label: x.label, takenOn: x.takenOn, url: photoUrls[x.id] ?? null }))}
            notes={api.notes.filter((n) => n.candidateId === sel.id)}
            today={today}
            onChecks={(checks) => void api.saveCandidate(sel.id, { checks })}
            onTerms={(terms) => void api.saveCandidate(sel.id, { terms })}
            onStatus={(status) => void api.setStatus(sel.id, status)}
            shrink={shrinkPhoto}
            onAddPhoto={(blob, fields) => api.addPhoto(sel.id, blob, fields)}
            onDeletePhoto={api.deletePhoto}
            onAddNote={(fields) => api.addNote(sel.id, fields)}
            onDeleteNote={api.deleteNote}
            onOpenLaw={openLaw}
          />
        </>
      ) : (
        <>
          <p className="text-body text-ink-2">{T.prepNoCandidate}</p>
          <OpenCosts costs={looseCosts} areaM2={null} listing={null} onSave={(costs) => setLooseCosts(costs)} />
        </>
      )}
    </div>
  )
}

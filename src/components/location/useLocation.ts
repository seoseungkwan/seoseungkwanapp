'use client'

// 입지 분석 화면의 읽기·저장·부르기 한 곳(spec location TASK-44 · REQ-7908·REQ-7917·REQ-7919, design.md 6·12·14절, ADR-045).
// 열 때: 표 여섯(loadLocation)·열쇠 상태(readKeys)·동 경계 목록(readDongIndex)을 한 번씩만 읽는다. 지금 의원 환자 숫자는 읽지 않는다.
// 저장(후보 더하기·다시 받기): collect(점, 범위, deps) → fitSnapshot(mergeSnapshot(새 값, checkSnapshot(옛 값))) 그대로 저장한다.
// 카카오 자료(주소 글·필지 번호·약국·마트·큰 병원·산업단지)는 후보를 열 때마다 새로 부르고 이 훅의 상태에만 둔다 — 저장 함수로 넘기지 않는다.
// 점수 설정은 손에 든 값(rule)만 바꾸고(다시 부르지 않음, 점수는 부품이 다시 센다) 저장은 saveScoreRule 하나로 한다.
// 과목 고르기(deptRule)도 같다: 손에 든 값만 바꾸고 다시 부르지 않으며, 저장은 saveDeptRule(처음 값이면 resetDeptRule) 하나로 한다.
// 모으기(후보 더하기·다시 받기·동네 훑기)는 그때 손에 든 과목 고르기로 부른다(바꾼 뒤 저절로 다시 부르지는 않는다).
// 저장이 실패하면 saveError를 켠다(화면이 E-LOC-SAVE-FAILED를 보임). 매물·사진·메모처럼 부품이 오류를 직접 보이는 저장은 던진다
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { todayInKorea } from '@/lib/analytics/dates'
import { cleanText } from '@/lib/contacts/fields'
import { collect, collectScan, industryParks, SAME_BUILDING_M, type CollectDeps, type CollectProgress, type ScanResult } from '@/lib/location/collect'
import { industryOf, incomeOf } from '@/lib/location/data'
import { DEFAULT_DEPT_RULE, fillDeptRule } from '@/lib/location/depts'
import { landCodes, type Dong, type DongFile, type DongIndex } from '@/lib/location/regions'
import { fillScoreRule, type ScoreRule } from '@/lib/location/score'
import { checkSnapshot, fitSnapshot, mergeSnapshot, SNAPSHOT_KEYS } from '@/lib/location/snapshot'
import { addCompany, addPerson, loadContacts } from '@/lib/storage/contacts'
import {
  addCandidate as addCandidateRow,
  addListing,
  addNote as addNoteRow,
  addPhoto as addPhotoRow,
  deleteNote as deleteNoteRow,
  deletePhoto as deletePhotoRow,
  loadLocation,
  markCandidateEventsSeen,
  readPhoto as readPhotoFile,
  resetDeptRule as resetDeptRuleRow,
  saveDeptRule as saveDeptRuleRow,
  saveHomeEswt as saveHomeEswtRow,
  saveScoreRule,
  updateCandidate,
  updateListing,
  type CandidateChanges,
  type LocationData,
  type NoteFields,
  type PhotoFields,
} from '@/lib/storage/location'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { CompanyFields, PersonFields } from '@/types/contacts'
import type { Candidate, CandidateStatus, DeptRule, KeysReply, Listing, LocationPhoto, Point, Query, QueryReply, RadiusM } from '@/types/location'
import type { AddressFind, CandidateDraft, SpotFind } from './add/AddCandidatePanel'
import { queryLocation, readBus, readDongIndex, readDongs, readKeys, readRail, readTransitIndex } from './clients'
import type { Near, NearKind, NearPlace, NearReply } from './detail/demand/near'
import { STATUS_TEXT } from './detail/frame/text'
import type { NearPharmacy } from './detail/rivals/OthersSection'

export type LoadState = { status: 'loading' } | { status: 'ready' } | { status: 'failed' }
export type Progress = CollectProgress
/** 후보를 열 때 카카오에서 새로 받은 것(저장하지 않음). undefined = 받는 중, null = 못 받음.
 * address = 머리에 보일 주소 글(도로명 → 지번), road = 도로명만(같은 건물 견주기), pharmacies = 30m 안 약국(이름·거리·도로명) */
export type Viewed = {
  candidateId: string
  address: string | null | undefined
  road: string | null | undefined
  pnu: string | null | undefined
  near: Near
  pharmacies: NearPharmacy[] | null | undefined
}
export type ScanState = { sgg: string | null; dongs: readonly Dong[] | null; result: ScanResult | null; progress: Progress | null }
export type BrokerBody = { company: CompanyFields; person: PersonFields | null }
export type ListingFields = Omit<Listing, 'id' | 'createdAt' | 'updatedAt'>

/** 진행 상태를 바꾸면 남기는 날짜 메모 한 줄(견주기 곁글 '진행 메모에 날짜가 남아요') */
export const statusNote = (from: CandidateStatus, to: CandidateStatus) => `진행 상태를 바꿨어요: ${STATUS_TEXT[from]} → ${STATUS_TEXT[to]}`

/** 모으기 진행 처음 값(그날 값 칸 수) */
const START: Progress = { done: 0, total: SNAPSHOT_KEYS.length }

const round6 = (v: number) => Math.round(v * 1e6) / 1e6
const at6 = (p: Point): Point => ({ lat: round6(p.lat), lng: round6(p.lng) })

type Row = Record<string, unknown>
const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v)
const textOr = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const pointOf = (v: unknown): Point | null => (isRow(v) && isNum(v.lat) && isNum(v.lng) ? { lat: v.lat, lng: v.lng } : null)

/** 카카오 k-point 값에서 화면에 보일 글·필지만(서버 KakaoSpot 모양을 믿지 않고 다시 본다) */
function spotOf(v: unknown): { road: string | null; jibun: string | null; pnu: string | null } | null {
  if (!isRow(v)) return null
  const lot = isRow(v.lot) ? v.lot : null
  const codes =
    lot && typeof lot.bcode === 'string' && isNum(lot.main) && isNum(lot.sub) && typeof lot.san === 'boolean'
      ? landCodes({ bcode: lot.bcode, main: lot.main, sub: lot.sub, san: lot.san })
      : null
  return { road: textOr(v.road), jibun: textOr(v.jibun), pnu: codes?.pnu ?? null }
}

type Place = { name: string; category: string; at: Point; distM: number; road: string | null }
function placesOf(v: unknown): { places: Place[]; capped: boolean } | null {
  if (!isRow(v) || !Array.isArray(v.places)) return null
  const places = v.places.flatMap((p: unknown) => {
    if (!isRow(p) || typeof p.name !== 'string' || !isNum(p.distM)) return []
    const at = pointOf(p.at) ?? { lat: 0, lng: 0 }
    return [{ name: p.name, category: typeof p.category === 'string' ? p.category : '', at, distM: p.distM, road: textOr(p.road) }]
  })
  return { places, capped: v.capped === true }
}

/** 약국 답 → 30m 안 약국(같은 건물·옆 건물 견주기, 볼 때만). 못 받았으면 null */
function pharmaciesOf(reply: QueryReply): NearPharmacy[] | null {
  const got = reply.ok ? placesOf(reply.value) : null
  if (got === null) return null
  return got.places.filter((p) => p.distM <= SAME_BUILDING_M).map((p) => ({ name: p.name, distM: p.distM, road: p.road }))
}

// 큰 병원: 카카오 병원 분류(HP8) 가운데 종합병원·대학병원·상급종합(분류 글 또는 이름)
const BIG_HOSPITAL = /종합병원|대학병원|대학교병원|상급종합/
const isBigHospital = (p: Place) => BIG_HOSPITAL.test(p.category) || BIG_HOSPITAL.test(p.name)

const NEAR_QUERY: Record<NearKind, (at: Point, r: number) => Query> = {
  pharmacy: (at, r) => ({ kind: 'k-near', at, r, cat: 'PM9' }),
  mart: (at, r) => ({ kind: 'k-near', at, r, cat: 'MT1' }),
  bigHospital: (at, r) => ({ kind: 'k-near', at, r, cat: 'HP8' }),
  industryPark: (at, r) => ({ kind: 'k-keyword', at, r, q: '산업단지' }),
}
const NEAR_KINDS = Object.keys(NEAR_QUERY) as NearKind[]

/** 장소 답 → 화면 값(이름·거리만). 큰 병원·산업단지는 여기서 고른다 */
function nearReplyOf(kind: NearKind, reply: QueryReply): NearReply {
  if (!reply.ok) return reply
  const got = placesOf(reply.value)
  if (got === null) return { ok: false, code: 'failed' }
  const picked = kind === 'bigHospital' ? got.places.filter(isBigHospital) : kind === 'industryPark' ? industryParks(got.places) : got.places
  const places: NearPlace[] = picked.map((p) => ({ name: p.name, distM: p.distM }))
  return { ok: true, value: { places, capped: got.capped }, src: reply.src, asOf: reply.asOf }
}

const why = (reply: QueryReply): 'no-key' | 'failed' => (!reply.ok && reply.code === 'no-key' ? 'no-key' : 'failed')

/** 처음 값([기본값으로])인가 — 차례·모르는 id는 fillDeptRule로 맞춰 견준다 */
const isDefaultDept = (rule: DeptRule) => JSON.stringify(fillDeptRule(rule)) === JSON.stringify(fillDeptRule(DEFAULT_DEPT_RULE))

/** 바뀐 줄 하나를 id로 바꿔 끼운다 */
const swap = <T extends { id: string }>(rows: readonly T[], row: T): T[] => rows.map((r) => (r.id === row.id ? row : r))
const fieldsOf = (l: Listing): ListingFields => {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = l
  void _id
  void _c
  void _u
  return rest
}

export function useLocation() {
  const client = useMemo(() => supabaseBrowser(), [])

  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [data, setData] = useState<LocationData | null>(null)
  const [keys, setKeys] = useState<KeysReply | null>(null)
  const [index, setIndex] = useState<DongIndex | null>(null)
  const [rule, setRule] = useState<ScoreRule>(() => fillScoreRule(null))
  const [deptRule, setDeptRule] = useState<DeptRule>(() => fillDeptRule(null))
  // 모으기가 그때 손에 든 과목 고르기를 읽게(부르기 함수를 다시 만들지 않는다)
  const deptNow = useRef<DeptRule>(deptRule)
  const [saveError, setSaveError] = useState(false)
  const [adding, setAdding] = useState<Progress | null>(null)
  const [refreshing, setRefreshing] = useState<Record<string, Progress>>({})
  const [viewed, setViewed] = useState<Viewed | null>(null)
  const [scan, setScan] = useState<ScanState>({ sgg: null, dongs: null, result: null, progress: null })
  const [tick, setTick] = useState(0)

  // 부르기 사이에 바뀐 값을 읽으려고 마지막 값을 담아 둔다
  const latest = useRef<LocationData | null>(null)
  useEffect(() => {
    latest.current = data
  })

  // ── 열 때(표 여섯 · 열쇠 · 동 경계 목록은 한 번만) ──
  const opening = useRef<Promise<[KeysReply, DongIndex | null]> | null>(null)
  const indexRef = useRef<DongIndex | null>(null)
  useEffect(() => {
    let live = true
    if (opening.current === null) {
      opening.current = Promise.all([readKeys(), readDongIndex()])
      void opening.current.then(([k, idx]) => {
        indexRef.current = idx
        setKeys(k)
        setIndex(idx)
      })
    }
    const head = opening.current
    Promise.all([loadLocation(client), head]).then(
      ([d]) => {
        if (!live) return
        latest.current = d
        setData(d)
        setRule(fillScoreRule(d.settings.scoreRule))
        const dept = fillDeptRule(d.settings.deptRule)
        deptNow.current = dept
        setDeptRule(dept)
        setLoad({ status: 'ready' })
      },
      () => {
        if (live) setLoad({ status: 'failed' })
      },
    )
    return () => {
      live = false
    }
  }, [client, tick])

  const reload = useCallback(() => {
    setLoad({ status: 'loading' })
    setTick((t) => t + 1)
  }, [])

  // 표 값 고치기(마지막 값에 바로 반영해 이어지는 부르기가 읽게 한다)
  const patch = useCallback((fn: (d: LocationData) => LocationData) => {
    const d = latest.current
    if (d === null) return
    const next = fn(d)
    latest.current = next
    setData(next)
  }, [])
  const putCandidate = useCallback((c: Candidate) => patch((d) => ({ ...d, candidates: swap(d.candidates, c) })), [patch])
  const putListing = useCallback((l: Listing) => patch((d) => ({ ...d, listings: swap(d.listings, l) })), [patch])

  // ── 모으기 deps(정적 파일은 같은 화면 안에서 다시 읽지 않는다) ──
  const dongFiles = useRef(new Map<string, DongFile>())
  const dongFile = useCallback(async (sgg: string): Promise<DongFile | null> => {
    const had = dongFiles.current.get(sgg)
    if (had) return had
    const got = await readDongs(sgg)
    if (got) dongFiles.current.set(sgg, got)
    return got
  }, [])
  const depsOf = useCallback(
    (onProgress: (p: Progress) => void): CollectDeps => ({
      ask: queryLocation,
      dongIndex: async () => {
        const idx = indexRef.current ?? (await readDongIndex())
        if (idx === null) throw new Error('dong-index')
        indexRef.current = idx
        return idx
      },
      dongFile,
      transitIndex: async () => {
        const t = await readTransitIndex()
        if (t === null) throw new Error('transit-index')
        return t
      },
      busFile: (sgg) => readBus(sgg),
      railFile: async () => {
        const r = await readRail()
        if (r === null) throw new Error('rail')
        return r
      },
      income: async (sgg) => {
        const g = incomeOf(sgg)
        return g.ok ? { v: g.v, asOf: g.asOf } : null
      },
      industry: async (sgg) => {
        const g = industryOf(sgg)
        return g.ok ? { v: g.v, asOf: g.asOf } : null
      },
      now: new Date().toISOString(),
      deptRule: deptNow.current,
      onProgress,
    }),
    [dongFile],
  )

  // ── 후보 더하기(AC-7908.1·AC-7908.2) ──
  const addCandidate = useCallback(
    async (draft: CandidateDraft): Promise<Candidate | null> => {
      setAdding(START)
      try {
        const point = { lat: draft.lat, lng: draft.lng }
        const got = await collect(point, draft.radiusM, depsOf(setAdding))
        const snapshot = fitSnapshot(mergeSnapshot(got, null))
        let saved = await addCandidateRow(client, { name: draft.name, addressNote: draft.addressNote, lat: draft.lat, lng: draft.lng, radiusM: draft.radiusM, snapshot })
        patch((d) => ({ ...d, candidates: [...d.candidates, saved] }))
        // 이어 하는 저장: 실패해도 후보는 저장됐다(저장 실패 알림만)
        if (draft.floorLabel !== '') {
          try {
            saved = await updateCandidate(client, saved.id, { floorLabel: draft.floorLabel })
            putCandidate(saved)
          } catch {
            setSaveError(true)
          }
        }
        if (draft.memo !== '') {
          try {
            const note = await addNoteRow(client, saved.id, { day: todayInKorea(), body: draft.memo })
            patch((d) => ({ ...d, notes: [...d.notes, note] }))
          } catch {
            setSaveError(true)
          }
        }
        const listing = draft.listingId ? latest.current?.listings.find((l) => l.id === draft.listingId) : undefined
        if (listing) {
          try {
            putListing(await updateListing(client, listing.id, { ...fieldsOf(listing), candidateId: saved.id }))
          } catch {
            setSaveError(true)
          }
        }
        return saved
      } catch {
        return null
      } finally {
        setAdding(null)
      }
    },
    [client, depsOf, patch, putCandidate, putListing],
  )

  // ── 다시 받기 · 범위 바꾸기(AC-7908.3) ──
  const refresh = useCallback(
    async (id: string, radiusM?: RadiusM): Promise<void> => {
      const c = latest.current?.candidates.find((x) => x.id === id)
      if (!c) return
      const show = (p: Progress) => setRefreshing((r) => ({ ...r, [id]: p }))
      show(START)
      try {
        const r = radiusM ?? c.radiusM
        const got = await collect({ lat: c.lat, lng: c.lng }, r, depsOf(show))
        const snapshot = fitSnapshot(mergeSnapshot(got, checkSnapshot(c.snapshot)))
        const changes: CandidateChanges = radiusM !== undefined && radiusM !== c.radiusM ? { radiusM, snapshot } : { snapshot }
        putCandidate(await updateCandidate(client, id, changes))
      } catch {
        setSaveError(true)
      } finally {
        setRefreshing((r) => {
          const { [id]: _done, ...rest } = r
          void _done
          return rest
        })
      }
    },
    [client, depsOf, putCandidate],
  )

  // ── 후보를 열 때(AC-7908.4·AC-7915.2): 알림 읽음 + 카카오 자료를 새로 ──
  const openTicket = useRef(0)
  const askNear = useCallback((kind: NearKind, at: Point, r: number, ticket: number, candidateId: string) => {
    void queryLocation(NEAR_QUERY[kind](at, r)).then((reply) => {
      if (ticket !== openTicket.current) return
      setViewed((v) => {
        if (!v || v.candidateId !== candidateId) return v
        const next = { ...v, near: { ...v.near, [kind]: nearReplyOf(kind, reply) } }
        return kind === 'pharmacy' ? { ...next, pharmacies: pharmaciesOf(reply) } : next
      })
    })
  }, [])
  const placeOf = (c: Candidate) => ({ at: { lat: c.lat, lng: c.lng }, r: c.snapshot?.radiusM ?? c.radiusM })
  const openCandidate = useCallback(
    (id: string) => {
      const c = latest.current?.candidates.find((x) => x.id === id)
      if (!c) return
      const ticket = ++openTicket.current
      setViewed({ candidateId: id, address: undefined, road: undefined, pnu: undefined, near: {}, pharmacies: undefined })
      markCandidateEventsSeen(client, id).catch(() => undefined) // 조용히(다음에 다시 읽음으로 한다)
      const { at, r } = placeOf(c)
      void queryLocation({ kind: 'k-point', at }).then((reply) => {
        if (ticket !== openTicket.current) return
        const spot = reply.ok ? spotOf(reply.value) : null
        setViewed((v) =>
          v && v.candidateId === id ? { ...v, address: spot ? (spot.road ?? spot.jibun) : null, road: spot?.road ?? null, pnu: spot?.pnu ?? null } : v,
        )
      })
      for (const kind of NEAR_KINDS) askNear(kind, at, r, ticket, id)
    },
    [askNear, client],
  )
  const retryNear = useCallback(
    (kind: NearKind) => {
      const v = viewed
      const c = v ? latest.current?.candidates.find((x) => x.id === v.candidateId) : undefined
      if (!v || !c) return
      setViewed((cur) =>
        cur && cur.candidateId === c.id
          ? { ...cur, near: { ...cur.near, [kind]: undefined }, ...(kind === 'pharmacy' ? { pharmacies: undefined } : {}) }
          : cur,
      )
      const { at, r } = placeOf(c)
      askNear(kind, at, r, openTicket.current, c.id)
    },
    [askNear, viewed],
  )

  // ── 주소 찾기 · 찍은 자리(후보 더하기 판에 보일 글만) ──
  const findAddress = useCallback(async (q: string): Promise<AddressFind> => {
    const reply = await queryLocation({ kind: 'k-address', q })
    if (!reply.ok) return { ok: false, why: why(reply) }
    if (!Array.isArray(reply.value)) return { ok: false, why: 'failed' }
    const hits = reply.value.flatMap((h: unknown) => {
      const at = isRow(h) ? pointOf(h.at) : null
      return at && isRow(h) ? [{ at, road: textOr(h.road), jibun: textOr(h.jibun) }] : []
    })
    return { ok: true, hits }
  }, [])
  const spotAddress = useCallback(async (at: Point): Promise<SpotFind> => {
    const reply = await queryLocation({ kind: 'k-point', at: at6(at) })
    if (!reply.ok) return { ok: false, why: why(reply) }
    const spot = spotOf(reply.value)
    return spot ? { ok: true, road: spot.road, jibun: spot.jibun } : { ok: false, why: 'failed' }
  }, [])

  // ── 점수 설정(AC-7919.3·AC-7919.4) ──
  const changeRule = useCallback((next: ScoreRule) => setRule(next), [])
  const saveRule = useCallback(
    async (next: ScoreRule) => {
      try {
        const s = await saveScoreRule(client, next)
        patch((d) => ({ ...d, settings: s }))
      } catch {
        setSaveError(true)
      }
    },
    [client, patch],
  )
  // ── 의원 과목 고르기(AC-7921.2): 바꾸면 손에 든 값만, 저장은 saveDeptRule([기본값으로]는 resetDeptRule) ──
  const changeDeptRule = useCallback((next: DeptRule) => {
    deptNow.current = next
    setDeptRule(next)
  }, [])
  const saveDeptRule = useCallback(
    async (next: DeptRule) => {
      try {
        const s = isDefaultDept(next) ? await resetDeptRuleRow(client) : await saveDeptRuleRow(client, next)
        patch((d) => ({ ...d, settings: s }))
      } catch {
        setSaveError(true)
      }
    },
    [client, patch],
  )
  const saveHomeEswt = useCallback(
    async (won: number | null) => {
      patch((d) => ({ ...d, settings: { ...d.settings, homeEswt: won } }))
      try {
        const s = await saveHomeEswtRow(client, won)
        patch((d) => ({ ...d, settings: { ...d.settings, homeEswt: s.homeEswt, updatedAt: s.updatedAt } }))
      } catch {
        setSaveError(true)
      }
    },
    [client, patch],
  )

  // ── 후보 칸 고치기 ──
  /** 던지는 저장(부품이 오류를 보일 때) */
  const changeCandidate = useCallback(
    async (id: string, changes: CandidateChanges): Promise<Candidate> => {
      const saved = await updateCandidate(client, id, changes)
      putCandidate(saved)
      return saved
    },
    [client, putCandidate],
  )
  /** 조용한 저장(실패하면 저장 실패 알림) */
  const saveCandidate = useCallback(
    async (id: string, changes: CandidateChanges): Promise<void> => {
      try {
        await changeCandidate(id, changes)
      } catch {
        setSaveError(true)
      }
    },
    [changeCandidate],
  )
  const setStatus = useCallback(
    async (id: string, status: CandidateStatus): Promise<void> => {
      const c = latest.current?.candidates.find((x) => x.id === id)
      if (!c || c.status === status) return
      try {
        await changeCandidate(id, { status })
      } catch {
        setSaveError(true)
        return
      }
      try {
        const note = await addNoteRow(client, id, { day: todayInKorea(), body: statusNote(c.status, status) })
        patch((d) => ({ ...d, notes: [...d.notes, note] }))
      } catch {
        setSaveError(true)
      }
    },
    [changeCandidate, client, patch],
  )

  // ── 매물 · 주소록(AC-7910.4) — 실패하면 던진다(매물 화면이 오류를 보임) ──
  const brokerOf = useCallback(
    async (broker: BrokerBody): Promise<string> => {
      const added = await addCompany(client, broker.company)
      let companyId: string
      if (added === 'invalid') throw new Error('broker-invalid')
      if (added === 'duplicate') {
        const book = await loadContacts(client)
        const name = cleanText(broker.company.name)
        const hit = book.companies.find((c) => cleanText(c.name) === name)
        if (!hit) throw new Error('broker-missing')
        companyId = hit.id
      } else companyId = added.id
      if (broker.person) {
        const person = await addPerson(client, companyId, broker.person)
        if (person === 'invalid') throw new Error('person-invalid')
      }
      return companyId
    },
    [client],
  )
  const linkBroker = useCallback(
    async (listing: Listing, broker: BrokerBody) => {
      const brokerId = await brokerOf(broker)
      putListing(await updateListing(client, listing.id, { ...fieldsOf(listing), brokerId }))
    },
    [brokerOf, client, putListing],
  )
  const saveListing = useCallback(
    async (fields: ListingFields, broker: BrokerBody | null) => {
      const saved = await addListing(client, fields)
      patch((d) => ({ ...d, listings: [...d.listings, saved] }))
      if (broker) await linkBroker(saved, broker)
    },
    [client, linkBroker, patch],
  )
  const addBroker = useCallback(
    async (listingId: string, broker: BrokerBody) => {
      const listing = latest.current?.listings.find((l) => l.id === listingId)
      if (!listing) throw new Error('listing-missing')
      await linkBroker(listing, broker)
    },
    [linkBroker],
  )
  const saveTerms = useCallback(async (candidateId: string, terms: Record<string, unknown>) => {
    await changeCandidate(candidateId, { terms })
  }, [changeCandidate])

  // ── 사진 · 메모(개원 준비) — 실패하면 던진다(부품이 E-LOC-PHOTO·E-LOC-SAVE-FAILED를 보임) ──
  const addPhoto = useCallback(
    async (candidateId: string, blob: Blob, fields: PhotoFields) => {
      const photo = await addPhotoRow(client, candidateId, blob, fields)
      patch((d) => ({ ...d, photos: [...d.photos, photo] }))
      return photo
    },
    [client, patch],
  )
  const deletePhoto = useCallback(
    async (id: string) => {
      await deletePhotoRow(client, id)
      patch((d) => ({ ...d, photos: d.photos.filter((p) => p.id !== id) }))
    },
    [client, patch],
  )
  const addNote = useCallback(
    async (candidateId: string, fields: NoteFields) => {
      const note = await addNoteRow(client, candidateId, fields)
      patch((d) => ({ ...d, notes: [...d.notes, note] }))
      return note
    },
    [client, patch],
  )
  const deleteNote = useCallback(
    async (id: string) => {
      await deleteNoteRow(client, id)
      patch((d) => ({ ...d, notes: d.notes.filter((n) => n.id !== id) }))
    },
    [client, patch],
  )
  const readPhoto = useCallback((path: string) => readPhotoFile(client, path), [client])

  // ── 동네 훑기(AC-7907.1): 동 경계를 읽고 collectScan 결과를 그대로(저장하지 않음) ──
  const scanTicket = useRef(0)
  const pickSgg = useCallback(
    (sgg: string) => {
      const ticket = ++scanTicket.current
      setScan({ sgg, dongs: null, result: null, progress: START })
      void dongFile(sgg).then((file) => {
        if (ticket === scanTicket.current) setScan((s) => ({ ...s, dongs: file?.dongs ?? null }))
      })
      const show = (p: Progress) => {
        if (ticket === scanTicket.current) setScan((s) => ({ ...s, progress: p }))
      }
      void collectScan(sgg, depsOf(show)).then(
        (result) => {
          if (ticket === scanTicket.current) setScan((s) => ({ ...s, result, progress: null }))
        },
        () => {
          if (ticket === scanTicket.current) setScan((s) => ({ ...s, result: { ok: false, why: 'failed' }, progress: null }))
        },
      )
    },
    [depsOf, dongFile],
  )
  const retryScan = useCallback(() => {
    if (scan.sgg) pickSgg(scan.sgg)
  }, [pickSgg, scan.sgg])

  return {
    load,
    reload,
    keys,
    index,
    settings: data?.settings ?? null,
    candidates: data?.candidates ?? [],
    listings: data?.listings ?? [],
    notes: data?.notes ?? [],
    photos: data?.photos ?? [],
    rule,
    changeRule,
    saveRule,
    deptRule,
    changeDeptRule,
    saveDeptRule,
    saveHomeEswt,
    saveError,
    clearSaveError: useCallback(() => setSaveError(false), []),
    adding,
    addCandidate,
    refreshing,
    refresh,
    viewed,
    openCandidate,
    retryNear,
    findAddress,
    spotAddress,
    setStatus,
    saveCandidate,
    saveListing,
    addBroker,
    saveTerms,
    addPhoto,
    deletePhoto,
    addNote,
    deleteNote,
    readPhoto,
    scan,
    pickSgg,
    retryScan,
  }
}

export type LocationApi = ReturnType<typeof useLocation>

/**
 * 사진 주소(AC-7913.4): readPhoto로 받은 사진을 blob 주소로 바꿔 id마다 준다(못 받으면 null).
 * 목록에서 빠진 사진·화면을 떠날 때는 만든 주소를 되돌린다(revoke). 있던 사진은 다시 받지 않는다
 */
export function usePhotoUrls(read: (path: string) => Promise<Blob | null>, photos: readonly Pick<LocationPhoto, 'id' | 'path'>[]): Record<string, string | null> {
  const [urls, setUrls] = useState<Record<string, string | null>>({})
  const made = useRef(new Map<string, string>())
  const asked = useRef(new Set<string>())
  const wanted = useRef(new Set<string>())
  const last = useRef({ read, photos })
  useEffect(() => {
    last.current = { read, photos }
  })
  const key = photos.map((p) => `${p.id}:${p.path}`).join('|')

  useEffect(() => {
    const { read: readNow, photos: list } = last.current
    const ids = new Set(list.map((p) => p.id))
    wanted.current = ids
    for (const [id, url] of made.current) {
      if (ids.has(id)) continue
      URL.revokeObjectURL(url)
      made.current.delete(id)
    }
    for (const id of asked.current) if (!ids.has(id)) asked.current.delete(id)
    setUrls((u) => Object.fromEntries(Object.entries(u).filter(([id]) => ids.has(id))))
    for (const p of list) {
      if (asked.current.has(p.id)) continue
      asked.current.add(p.id)
      readNow(p.path)
        .catch(() => null)
        .then((blob) => {
          if (!wanted.current.has(p.id)) return
          const url = blob ? URL.createObjectURL(blob) : null
          if (url) made.current.set(p.id, url)
          setUrls((u) => ({ ...u, [p.id]: url }))
        })
    }
  }, [key])

  useEffect(() => {
    const urlsMade = made.current
    const askedNow = asked.current
    return () => {
      for (const url of urlsMade.values()) URL.revokeObjectURL(url)
      urlsMade.clear()
      askedNow.clear()
      wanted.current = new Set()
    }
  }, [])

  return urls
}

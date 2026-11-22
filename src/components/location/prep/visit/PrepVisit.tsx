'use client'

// 개원 준비 — 건물 요건 표·계약 전 위험·보러 갈 때 점검표·사진·진행 메모·진행 상태
// (spec location REQ-7913 AC-7913.3·AC-7913.4·AC-7913.5, design.md 11·14절, 시안 docs/mockups/location/index.html ?s=plan의 아래 네 묶음).
// 부품은 props·콜백만 쓴다(읽기·저장·Storage·바깥 부르기 없음):
//   onChecks — 점검 셋 값(cleanChecks 모양 전체: 줄 id → yes·no·unknown + how). 칸·체크를 누를 때 바로, '어떻게 알았나'는 칸을 떠날 때·화면이 닫힐 때
//   onTerms  — 받은 terms에 memo(임대 조건 메모 300자)만 바꾼 전체. 칸을 떠날 때·화면이 닫힐 때
//   onStatus — 진행 상태 다섯 가운데 하나
//   shrink + onAddPhoto · onDeletePhoto — 사진(브라우저가 줄인 JPEG, 후보마다 30장), onAddNote · onDeleteNote — 날짜별 메모
// 부모는 이 콜백을 지금 후보의 updateCandidate·addPhoto·deletePhoto·addNote·deleteNote(lib/storage/location.ts)에 잇고, shrink에는
// components/inventory/photo.ts의 shrinkPhoto를 넘긴다. 점검 값은 이 화면이 고치는 동안 들고 있다(저장이 실패해도 고친 값이 그대로 보임 —
// E-LOC-SAVE-FAILED 글과 같음). 후보가 바뀌면(id) 그 후보 값으로 새로 그린다
import { useEffect, useRef, useState } from 'react'
import { HOW_MAX, checkOf, cleanChecks, nextCheck, type CleanChecks } from '@/lib/location/checklist'
import type { Candidate, CandidateStatus, LocationNote } from '@/types/location'
import { BuildingTable } from './BuildingTable'
import { ContractRisk } from './ContractRisk'
import { ProgressNotes, type NoteFields } from './ProgressNotes'
import { cutText } from './text'
import { VisitChecks } from './VisitChecks'
import type { PhotoFields, VisitPhoto } from './VisitPhotos'

export { PHOTO_LIMIT, type PhotoFields, type VisitPhoto } from './VisitPhotos'
export { MEMO_MAX } from './ContractRisk'
export type { NoteFields } from './ProgressNotes'

export type PrepVisitProps = {
  /** 고른 후보에서 쓰는 칸만 */
  candidate: Pick<Candidate, 'id' | 'status' | 'checks' | 'terms'>
  /** 그 후보 사진(만든 차례), 그림 주소는 부모가 readPhoto로 읽어 만든 것 */
  photos: readonly VisitPhoto[]
  /** 그 후보 메모(차례는 이 부품이 날짜 새것이 위로 맞춘다) */
  notes: readonly LocationNote[]
  /** 오늘(한국 날짜 'YYYY-MM-DD') — 메모 날짜 처음 값 · 사진 찍은 날 */
  today: string
  onChecks: (checks: CleanChecks) => void
  onTerms: (terms: Record<string, unknown>) => void
  onStatus: (status: CandidateStatus) => void
  /** 사진 줄이기(shrinkPhoto 모양): 긴 변 1,600px JPEG Blob, 못 하면 null */
  shrink: (file: Blob) => Promise<Blob | null>
  /** 사진 하나 올리기. 실패면 던진다(→ E-LOC-PHOTO) */
  onAddPhoto: (photo: Blob, fields: PhotoFields) => Promise<unknown>
  /** 사진 지우기. 실패면 던진다(→ E-LOC-SAVE-FAILED) */
  onDeletePhoto: (id: string) => Promise<unknown>
  /** 메모 더하기. 실패면 던진다(→ E-LOC-SAVE-FAILED, 적은 글은 그대로) */
  onAddNote: (fields: NoteFields) => Promise<unknown>
  onDeleteNote: (id: string) => Promise<unknown>
  /** 법 근거 링크를 그냥 누를 때 주소 이동 대신 부른다('근거와 출처' 탭으로 바꾸기 등). 없으면 /location?tab=sources#law-<id>로 간다 */
  onOpenLaw?: (id: string) => void
}

/** 후보가 바뀌면 고치던 값을 버리고 그 후보 값으로 새로 그린다 */
export function PrepVisit(props: PrepVisitProps) {
  return <PrepVisitFor key={props.candidate.id} {...props} />
}

type Latest = { checks: CleanChecks; onChecks: (checks: CleanChecks) => void }

/** 적기만 하고 저장하지 않은 '어떻게 알았나' 글이 있으면 지금 값을 넘긴다 */
function flushChecks(dirty: { current: boolean }, latest: { current: Latest }) {
  if (!dirty.current) return
  dirty.current = false
  latest.current.onChecks(cleanChecks(latest.current.checks))
}

function PrepVisitFor({ candidate, photos, notes, today, onChecks, onTerms, onStatus, shrink, onAddPhoto, onDeletePhoto, onAddNote, onDeleteNote, onOpenLaw }: PrepVisitProps) {
  const [checks, setChecks] = useState<CleanChecks>(() => cleanChecks(candidate.checks))
  const dirty = useRef(false)
  const latest = useRef<Latest>({ checks, onChecks })
  useEffect(() => {
    latest.current = { checks, onChecks }
  })
  useEffect(() => () => flushChecks(dirty, latest), [])

  function save(next: CleanChecks) {
    setChecks(next)
    dirty.current = false
    onChecks(cleanChecks(next))
  }

  const cycle = (id: string) => save({ ...checks, [id]: nextCheck(checkOf(checks, id)) })
  const toggle = (id: string, on: boolean) => save({ ...checks, [id]: on ? 'yes' : 'unknown' })
  const typeHow = (id: string, text: string) => {
    dirty.current = true
    setChecks((c) => ({ ...c, how: { ...c.how, [id]: cutText(text, HOW_MAX) } }))
  }

  return (
    <div className="grid min-w-0 gap-10">
      <BuildingTable checks={checks} onCycle={cycle} onHow={typeHow} onHowDone={() => flushChecks(dirty, latest)} onOpenLaw={onOpenLaw} />
      <ContractRisk terms={candidate.terms} checks={checks} onToggle={toggle} onTerms={onTerms} onOpenLaw={onOpenLaw} />
      <VisitChecks
        checks={checks}
        onToggle={toggle}
        onOpenLaw={onOpenLaw}
        photos={photos}
        today={today}
        shrink={shrink}
        onAddPhoto={onAddPhoto}
        onDeletePhoto={onDeletePhoto}
      />
      <ProgressNotes status={candidate.status} notes={notes} today={today} onStatus={onStatus} onAddNote={onAddNote} onDeleteNote={onDeleteNote} />
    </div>
  )
}

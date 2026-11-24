'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { REGION_UNKNOWN, regionOf } from '@/lib/admin/region'
import { listViewHospitals, startAdminView, type ViewHospital } from '@/lib/auth/adminView'
import { setViewKey } from '@/lib/supabase/viewKey'
import { leaveView } from './ViewBand'
import type { Viewing } from './viewing'

// 위쪽 띠 '보는 의원' 단추와 판 (admin-view REQ-8006 AC-8006.4·AC-8006.5·AC-8006.7, design.md '앱 틀'·'화면 글자', 시안 .vp '모양 결정').
// 관리자(데스크 아님)만, 시계 왼쪽. 단추 = 눈 아이콘 + '보는 의원' + 아래 화살표, 평소 ds.button.secondarySmall · 보는 중 accentOutline(켜짐).
// 판 = 계정 메뉴와 같은 떠 있는 층(ds.layer, 폭 320, 안쪽 4): 제목·설명 · 찾기 칸(36px, 이름에 든 글자로 거름) · 목록(최대 340px 안에서 내림):
// 묶음 '내 의원'(내 의원 한 줄) / '다른 의원 {n}곳'(이름 차례), 줄 36px = 이름 + 오른쪽 지역, 지금 보는 의원(보는 중이 아니면 내 의원)은 체크 + 파랑 굵게.
// 열 때마다 listViewHospitals()를 한 번 읽는다. 바깥 누름·Esc(초점은 단추로)·단추 다시 누름으로 닫힌다.
// 고르기(확인 창 없음): 다른 의원 → startAdminView → 받은 열쇠로 보기 쿠키 → /dashboard를 새로 연다. 보는 중 내 의원 = [내 의원으로](leaveView).
// 보는 중이 아닐 때 내 의원·지금 보는 의원을 고르면 닫기만 한다. 읽기·시작 실패는 판 안 E-VIEW-START 카드이고 쿠키를 쓰지 않는다

const TEXT = {
  button: '보는 의원',
  title: '다른 의원 보기',
  desc: '고르면 그 의원 화면을 읽기만 해요. 예약·환자·청구 탭은 보이지 않아요.',
  find: '의원 이름으로 찾기',
  mine: '내 의원',
  others: (n: number) => `다른 의원 ${n}곳`,
  none: '찾는 의원이 없어요',
}

// 평소: 보조 작은 단추, 열린 동안 바탕 canvas(계정 단추와 같다). 보는 중: 강조 테두리(켜짐)
const buttonOff = `${ds.button.secondarySmall} aria-expanded:bg-canvas`
const buttonOn = ds.button.accentOutlineSmall
// 찾기 칸 36px(ds.input과 같은 초점 모양, 높이만 시안 36px)
const findClass =
  'h-9 w-full min-w-0 rounded-control border border-line-strong bg-surface px-3 text-body text-ink placeholder:text-muted focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-hidden'
const captionClass = 'px-3 pt-2 pb-1 text-caption font-medium text-muted'
// 줄 36px: 보통 ink / 지금 줄 accent-strong 600. 올림 canvas(150ms)
const itemBase =
  'flex h-9 w-full cursor-pointer items-center gap-2 rounded-control px-3 text-left text-body transition hover:bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent'
const itemClass = `${itemBase} text-ink`
const itemCurrentClass = `${itemBase} font-semibold text-accent-strong`

type Read = { state: 'reading' } | { state: 'ready'; list: ViewHospital[] } | { state: 'failed' }

const regionText = (h: ViewHospital) => regionOf(h.address, h.regionSet ? h.region : undefined) ?? REGION_UNKNOWN

function Row({ hospital, current, onPick }: { hospital: ViewHospital; current: boolean; onPick: (h: ViewHospital) => void }) {
  return (
    <button type="button" aria-current={current ? 'true' : undefined} onClick={() => onPick(hospital)} className={current ? itemCurrentClass : itemClass}>
      <span className="w-4 shrink-0 text-accent">{current && <Icon name="check" />}</span>
      <span className="min-w-0 flex-1 truncate">{hospital.name}</span>
      <span className="shrink-0 text-caption text-muted">{regionText(hospital)}</span>
    </button>
  )
}

export function ViewPicker({ viewing }: { viewing: Viewing | null }) {
  const [open, setOpen] = useState(false)
  const [read, setRead] = useState<Read>({ state: 'reading' })
  const [find, setFind] = useState('')
  const [startFailed, setStartFailed] = useState(false)
  const picking = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const findRef = useRef<HTMLInputElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    let current = true
    listViewHospitals().then(
      (list) => {
        if (current) setRead({ state: 'ready', list })
      },
      () => {
        if (current) setRead({ state: 'failed' })
      },
    )
    findRef.current?.focus()
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      current = false
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const toggle = () => {
    if (!open) {
      setRead({ state: 'reading' })
      setFind('')
      setStartFailed(false)
    }
    setOpen((v) => !v)
  }

  const pick = (h: ViewHospital) => {
    if (picking.current) return // 시작·끝내는 동안 다른 줄을 눌러도 한 번만
    const isCurrent = viewing === null ? h.mine : h.hospitalId === viewing.hospitalId
    if (h.mine) {
      if (viewing === null) return setOpen(false)
      picking.current = true
      void leaveView()
      return
    }
    if (isCurrent) return setOpen(false)
    picking.current = true
    setStartFailed(false)
    startAdminView(h.hospitalId).then(
      (key) => {
        setViewKey(key)
        window.location.assign('/dashboard')
      },
      () => {
        picking.current = false
        setStartFailed(true)
      },
    )
  }

  const words = find.trim()
  const matches = (h: ViewHospital) => words === '' || h.name.includes(words)
  const list = read.state === 'ready' ? read.list : []
  const mine = list.find((h) => h.mine)
  const others = list.filter((h) => !h.mine).sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const shown = others.filter(matches)
  const isCurrent = (h: ViewHospital) => (viewing === null ? h.mine : h.hospitalId === viewing.hospitalId)

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
        className={viewing === null ? buttonOff : buttonOn}
      >
        <Icon name="eye" className="shrink-0" />
        <span>{TEXT.button}</span>
        <Icon name="chev" className="shrink-0" />
      </button>

      {open && (
        // 떠 있는 층: 단추 오른쪽 끝 아래 4px. 나타날 때만 투명·위 4px에서 제자리로(계정 메뉴와 같다), 닫으면 바로 사라진다
        <div
          id={panelId}
          role="dialog"
          aria-label={TEXT.title}
          className={`${ds.layer} absolute top-full right-0 z-20 mt-1 w-80 p-1 transition starting:opacity-0 starting:-translate-y-1`}
        >
          <div className="flex flex-col gap-0.5 px-3 pt-2 pb-3">
            <p className="text-small font-semibold text-ink">{TEXT.title}</p>
            <p className="text-caption text-muted">{TEXT.desc}</p>
          </div>
          <div className="px-2 pb-2">
            <input
              ref={findRef}
              type="search"
              value={find}
              onChange={(e) => setFind(e.target.value)}
              placeholder={TEXT.find}
              aria-label={TEXT.find}
              className={findClass}
            />
          </div>
          {(read.state === 'failed' || startFailed) && (
            <div className="px-2 pb-2">
              <ErrorCard code="E-VIEW-START" />
            </div>
          )}
          {read.state !== 'failed' && (
            <div aria-busy={read.state === 'reading' || undefined} className="max-h-85 overflow-y-auto border-t border-line pt-1">
              {read.state === 'ready' && (
                <>
                  {mine !== undefined && matches(mine) && (
                    <>
                      <p className={captionClass}>{TEXT.mine}</p>
                      <Row hospital={mine} current={isCurrent(mine)} onPick={pick} />
                    </>
                  )}
                  <p className={captionClass}>{TEXT.others(others.length)}</p>
                  {shown.length > 0 ? (
                    shown.map((h) => <Row key={h.hospitalId} hospital={h} current={isCurrent(h)} onPick={pick} />)
                  ) : (
                    <p className="px-3 pt-2 pb-3 text-small text-muted">{TEXT.none}</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

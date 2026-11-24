'use client'

// 의원 과목 고르기 판 (spec location REQ-7921 AC-7921.1·AC-7921.2, design.md 18절, 시안 ?s=kinds 승인 3 — 오른쪽 판 760px).
// 과목 스물하나(depts.ts DEPTS 차례)마다 경쟁 의원 · 둘레로 보기 · 안 보기 가운데 하나. 맨 위 요약(목록 차례)·0개면 노란 안내·도움말,
// 줄 오른쪽 `후보 {글자} {범위} 안 {n}곳`(글자·범위·수를 다 줄 때만), 곁글 둘, 바닥 글·[기본값으로]·[닫기]. Esc·바탕 누름·[닫기]는 onClose.
// 부품은 props·콜백만 쓴다: 설정은 rule로 받고(fillDeptRule로 채워 봄), 바뀐 설정은
//   onChange — 누를 때마다 바로(부르는 쪽이 다시 부르지 않고 점수·묶음을 다시 그림)
//   onSave   — 마지막으로 고친 뒤 SAVE_DELAY_MS가 지나면 한 번(점수 무게 판과 같은 weights/saveLater.ts). 판을 닫거나 사라지면 기다리던 것을 바로
// 로 넘긴다. 어디에 저장할지(saveDeptRule)는 부르는 쪽이 정한다. [기본값으로]도 처음 값을 같은 길로 넘긴다.
// 밖에서 내용이 다른 설정이 오면 그 값으로 다시 그리고, 판이 넘긴 것과 같은 설정이면 그대로 둔다.
// 다른 의원을 보는 중(읽기만, admin-view AC-8010.2)이면 보는 의원이 고른 값만 보인다: 고르기는 막히고 [기본값으로]가 없다(저장 없음, [닫기]는 그대로)
import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from '@/components/common/Icon'
import { useSaveLater } from '@/components/location/weights/saveLater'
import { useReadOnly, WriteOnly } from '@/components/shell/viewing'
import { ds } from '@/components/ui/classes'
import { DEFAULT_DEPT_RULE, DEPTS, checkDeptRule, deptRole, fillDeptRule, type Dept, type DeptRole } from '@/lib/location/depts'
import type { DeptId, DeptRule } from '@/types/location'
import { defaultRule, rivalNames, ruleKey, withRole } from './rule'
import { KINDS_TEXT as T, countText, rivalCountText, rivalNamesText } from './text'

export type DeptPickerProps = {
  /** 지금 설정(location_settings.dept_rule). 못 읽는 값·모르는 id는 fillDeptRule로 본다 */
  rule: DeptRule
  /** 지금 보는 후보 그날 값에서 과목마다 의원 수(depts에 그 과목이 든 의원, 고른 값과 상관없이). 빠진 과목은 0곳 */
  counts?: Partial<Record<DeptId, number>>
  /** 지금 보는 후보 글자(예 'A') */
  letter?: string
  /** 지금 보는 후보 살필 범위(m) */
  radiusM?: number
  /** 판이 열렸나. 거짓이면 아무것도 그리지 않고, 기다리던 저장을 바로 한다 */
  open: boolean
  /** 바뀐 설정 — 누를 때마다 바로 */
  onChange: (rule: DeptRule) => void
  /** 저장할 설정 — 멈춘 뒤 한 번 */
  onSave: (rule: DeptRule) => void
  onClose: () => void
}

const ROLES: readonly DeptRole[] = ['rival', 'around', 'hide']
const FIRST_RIVAL: ReadonlySet<DeptId> = new Set(DEFAULT_DEPT_RULE.rival)

// ── 모양(시안 .drawer.wide·.dwh·.dwb·.dwf·.ksum·.kwarn·.krow·.ob 값). 폰 전용 모양 없음 — ds는 폭 따라 바뀌지 않는 묶음만 쓴다 ──
const BTN = `inline-flex h-9 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-control border border-line-strong bg-surface px-4 text-body font-medium text-ink transition hover:bg-canvas ${ds.focusRing}`
const ICON_BTN = `inline-flex size-9 cursor-pointer items-center justify-center rounded-control text-ink-2 transition hover:bg-canvas ${ds.focusRing}`
const OPTION_ON = 'border-accent bg-accent-soft font-semibold text-accent-strong ring-1 ring-inset ring-accent'
const OPTION_OFF = 'border-line-strong bg-surface text-ink hover:bg-canvas'
const option = (on: boolean) => `h-7.5 cursor-pointer whitespace-nowrap rounded-control border px-2.5 text-small ${ds.focusRing} ${on ? OPTION_ON : OPTION_OFF}`
const ROW = 'grid grid-cols-[200px_auto_minmax(0,1fr)] items-center gap-3 border-b border-line py-2 last:border-b-0'

export function DeptPicker({ rule, counts, letter, radiusM, open, onChange, onSave, onClose }: DeptPickerProps) {
  const uid = useId()
  const titleId = `${uid}-title`
  const [shown, setShown] = useState(() => fillDeptRule(rule))
  const [seen, setSeen] = useState(() => ({ rule, key: ruleKey(rule) }))
  const save = useSaveLater(onSave)
  const panel = useRef<HTMLElement>(null)

  // 밖에서 다른 설정이 오면 그 값으로(판이 넘긴 설정과 같으면 그대로)
  if (rule !== seen.rule) {
    const key = ruleKey(rule)
    setSeen({ rule, key })
    if (key !== seen.key) setShown(fillDeptRule(rule))
  }

  // 닫으면 기다리던 저장을 바로
  useEffect(() => {
    if (!open) save.now()
  }, [open, save])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // 열리면 판으로 초점, 닫히면 연 곳(예 [과목 고르기])으로 돌려놓는다
  useEffect(() => {
    if (!open) return
    const back = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
    panel.current?.focus()
    return () => {
      if (back?.isConnected) back.focus()
    }
  }, [open])

  function apply(next: DeptRule) {
    if (checkDeptRule(next).length > 0) return
    setShown(next)
    setSeen((prev) => ({ rule: prev.rule, key: ruleKey(next) }))
    onChange(next)
    save.later(next)
  }

  function choose(id: DeptId, role: DeptRole) {
    if (deptRole(id, shown) === role) return
    apply(withRole(shown, id, role))
  }

  if (!open) return null

  const names = rivalNames(shown)
  const place = letter !== undefined && radiusM !== undefined && counts !== undefined ? { letter, radiusM, counts } : null

  return (
    <>
      <div data-testid="kinds-scrim" aria-hidden="true" className="fixed inset-0 z-40 bg-ink/36" onClick={onClose} />
      <aside
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed top-0 right-0 bottom-0 z-50 flex w-190 max-w-full flex-col border-l border-line-strong bg-surface shadow-float outline-hidden"
      >
        <div className="flex items-center justify-between gap-2 border-b border-line py-2.5 pr-3 pl-6">
          <h2 id={titleId} className="text-subtitle font-semibold text-ink">
            {T.title}
          </h2>
          <button type="button" aria-label={T.close} className={ICON_BTN} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>

        <div className="grid flex-1 content-start gap-5 overflow-y-auto px-6 pt-5 pb-6">
          <div className="grid gap-2 rounded-control border border-line bg-canvas px-3.5 py-3">
            <p className="text-body text-ink">
              <b className="font-semibold">{T.summaryHead}</b> {rivalNamesText(names)} <span className="text-muted">{rivalCountText(names.length)}</span>
            </p>
            {names.length === 0 ? (
              <p className="flex flex-wrap items-center gap-2 rounded-control border border-line-strong bg-warning-soft px-3 py-2.5 text-body font-medium text-ink">
                <Icon name="alert" className="shrink-0 text-warning" />
                <span className="flex-[1_1_240px]">{T.warn}</span>
              </p>
            ) : null}
          </div>

          <p className={ds.help}>
            {T.help.map((part) => (
              <span key={part.b}>
                <b className="font-semibold text-ink-2">{part.b}</b>
                {part.rest}
              </span>
            ))}
          </p>

          <div role="list" aria-label={T.list} className="grid">
            {DEPTS.map((d) => (
              <DeptRow key={d.id} dept={d} role={deptRole(d.id, shown)} place={place} onPick={(role) => choose(d.id, role)} />
            ))}
          </div>

          {T.notes.map((note) => (
            <p key={note} className={ds.help}>
              {note}
            </p>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-3">
          <p className="flex-[1_1_200px] text-caption text-muted">{T.foot}</p>
          <WriteOnly>
            <button type="button" className={BTN} onClick={() => apply(defaultRule())}>
              {T.reset}
            </button>
          </WriteOnly>
          <button type="button" className={BTN} onClick={onClose}>
            {T.close}
          </button>
        </div>
      </aside>
    </>
  )
}

type Place = { letter: string; radiusM: number; counts: Partial<Record<DeptId, number>> }
type RowProps = { dept: Dept; role: DeptRole; place: Place | null; onPick: (role: DeptRole) => void }

function DeptRow({ dept, role, place, onPick }: RowProps) {
  const readOnly = useReadOnly()
  return (
    <div role="listitem" className={ROW}>
      <span className="text-body font-medium text-ink">
        {dept.name}
        {FIRST_RIVAL.has(dept.id) ? <span className={`ml-1.5 ${ds.chip.neutral}`}>{T.firstRival}</span> : null}
        {dept.id === 'korean' ? <small className="block text-caption font-normal text-muted">{T.koreanNote}</small> : null}
      </span>
      <div role="group" aria-label={dept.name} className="flex gap-1.5">
        {ROLES.map((r) => (
          <button key={r} type="button" aria-pressed={role === r} disabled={readOnly} className={option(role === r)} onClick={() => onPick(r)}>
            {T.role[r]}
          </button>
        ))}
      </div>
      {place ? <span className="text-right text-caption text-muted">{countText(place.letter, place.radiusM, place.counts[dept.id] ?? 0)}</span> : <span />}
    </div>
  )
}

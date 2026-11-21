'use client'

import { useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import { checkPayItems, incentiveAmount, visibleItems } from '@/lib/staff/pay'
import type { PayItem, PayLine } from '@/types/staff'
import { monthNumber, objectParticle } from './format'
import { smallInput } from './parts'

// 지급 항목 고치기 (staff AC-7615.4, 시안 pay.html ④). 병원 설정 pay_items 하나를 고쳐 바로 저장한다(saveSettings).
// 보는 달에 보이는 항목만 줄로 보인다. 빼기 = 보는 달부터 안 보이게(removedFrom = 보는 달, 앞 달 표·엑셀에는 남음).
// 금액이 있었던 항목만 한 번 묻는다(모든 달 줄을 읽어 가장 늦은 달을 알린다). 30개·이름 10자·같은 이름은 checkPayItems가 막는다.
// 저장(과 빼기 전 금액 찾기)하는 동안은 이 창의 단추를 모두 막는다 — 두 번 저장하거나 앞 목록으로 덮어쓰지 않게,
// 저장이 끝난 뒤 새 항목 목록(items)을 다시 받을 때까지 막아 둔다(AC-7615.4)

const NAME_MAX = 10

type Ask = { id: string; month: string }

/** 그 항목에 금액이 있었던 가장 늦은 달(없으면 null) */
export function lastUsedMonth(item: PayItem, lines: readonly PayLine[]): string | null {
  let last: string | null = null
  for (const line of lines) {
    const used = item.kind === 'incentive' ? line.incentives.some((entry) => incentiveAmount(entry) > 0) : (line.amounts[item.id] ?? 0) > 0
    if (used && (last === null || line.month > last)) last = line.month
  }
  return last
}

function newId(items: readonly PayItem[]): string {
  for (;;) {
    const id = `c${Math.random().toString(36).slice(2, 10)}`
    if (!items.some((item) => item.id === id)) return id
  }
}

export function ItemsEditor({
  items,
  month,
  onSave,
  readAllLines,
  onClose,
}: {
  items: readonly PayItem[]
  month: string
  onSave: (items: PayItem[]) => Promise<boolean>
  readAllLines: () => Promise<PayLine[]>
  onClose: () => void
}) {
  const [problem, setProblem] = useState<string | null>(null)
  const [failed, setFailed] = useState<'save' | 'read' | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedOver, setSavedOver] = useState<readonly PayItem[] | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [ask, setAsk] = useState<Ask | null>(null)
  const [adding, setAdding] = useState('')
  const busy = saving || savedOver === items
  const shown = visibleItems(items, month)

  const save = async (next: PayItem[]): Promise<boolean> => {
    if (busy) return false
    const why = checkPayItems(next)
    setProblem(why)
    if (why !== null) return false
    setSaving(true)
    const ok = await onSave(next)
    setSaving(false)
    setFailed(ok ? null : 'save')
    // 이 목록(items)으로 저장했다 — 새 목록이 올 때까지 막는다
    if (ok) setSavedOver(items)
    return ok
  }

  const move = (id: string, step: -1 | 1) => {
    const at = shown.findIndex((item) => item.id === id)
    const other = shown[at + step]
    if (other === undefined) return
    const a = items.findIndex((item) => item.id === id)
    const b = items.findIndex((item) => item.id === other.id)
    const next = [...items]
    ;[next[a], next[b]] = [next[b], next[a]]
    void save(next)
  }

  const removeNow = (id: string) => save(items.map((item) => (item.id === id ? { ...item, removedFrom: month } : item)))

  const askRemove = async (item: PayItem) => {
    if (busy) return
    setFailed(null)
    setSaving(true)
    let lines: PayLine[]
    try {
      lines = await readAllLines()
    } catch {
      setSaving(false)
      setFailed('read')
      return
    }
    setSaving(false)
    const used = lastUsedMonth(item, lines)
    if (used === null) await removeNow(item.id)
    else setAsk({ id: item.id, month: used })
  }

  const rename = async () => {
    if (renaming === null) return
    const ok = await save(items.map((item) => (item.id === renaming.id ? { ...item, name: renaming.name.trim() } : item)))
    if (ok) setRenaming(null)
  }

  const add = async () => {
    const name = adding.trim()
    const ok = await save([...items, { id: newId(items), name, kind: 'amount', base: false, removedFrom: null }])
    if (ok) setAdding('')
  }

  return (
    <section role="dialog" aria-label="지급 항목 고치기" aria-busy={busy || undefined} className={`${ds.layer} w-full max-w-160 self-end`}>
      <div className="flex items-center gap-2 border-b border-line px-4 py-2">
        <b className="text-body font-semibold text-ink">지급 항목 고치기</b>
        <button type="button" disabled={busy} className={`${ds.button.ghostSmall} ml-auto`} onClick={onClose}>
          닫기
        </button>
      </div>
      <ul>
        {shown.map((item, i) => {
          const asking = ask?.id === item.id
          const editing = renaming?.id === item.id
          return (
            <li key={item.id} className={`flex flex-wrap items-center gap-2 border-b border-line px-4 py-2 ${asking ? 'bg-warning-soft' : ''}`}>
              <span className="inline-flex gap-0.5">
                <button type="button" aria-label={`${item.name} 위로`} disabled={busy || i === 0} className={ds.button.secondarySmall} onClick={() => move(item.id, -1)}>
                  ▲
                </button>
                <button
                  type="button"
                  aria-label={`${item.name} 아래로`}
                  disabled={busy || i === shown.length - 1}
                  className={ds.button.secondarySmall}
                  onClick={() => move(item.id, 1)}
                >
                  ▼
                </button>
              </span>
              {editing ? (
                <input
                  type="text"
                  aria-label="항목 이름"
                  maxLength={NAME_MAX}
                  className={`${smallInput} max-w-48`}
                  value={renaming.name}
                  onChange={(event) => setRenaming({ id: item.id, name: event.target.value })}
                />
              ) : (
                <span data-name="" className="min-w-16 text-small font-semibold text-ink">
                  {item.name}
                </span>
              )}
              {item.base ? <span className={ds.chip.neutral}>기본</span> : <span className={ds.chip.warning}>병원이 더함</span>}
              {item.kind === 'incentive' && <span className={ds.chip.accent}>실적으로 계산</span>}
              <span className="ml-auto inline-flex gap-1.5">
                {editing ? (
                  <>
                    <button type="button" disabled={busy} className={ds.button.primarySmall} onClick={() => void rename()}>
                      확인
                    </button>
                    <button type="button" disabled={busy} className={ds.button.secondarySmall} onClick={() => setRenaming(null)}>
                      그만두기
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" disabled={busy} className={ds.button.secondarySmall} onClick={() => setRenaming({ id: item.id, name: item.name })}>
                      이름 고치기
                    </button>
                    <button type="button" aria-pressed={asking} disabled={busy} className={ds.button.secondarySmall} onClick={() => void askRemove(item)}>
                      빼기
                    </button>
                  </>
                )}
              </span>
              {asking && (
                <div className="flex basis-full flex-wrap items-center gap-2 rounded-control border border-warning bg-surface px-3 py-2 text-small text-ink-2">
                  <p className="min-w-0 flex-[1_1_260px]">
                    <b className="font-semibold text-ink">{`${item.name}${objectParticle(item.name)} 뺄까요?`}</b>
                    {` ${monthNumber(ask.month)}월에 적은 금액이 있어요. 지난 달 기록은 그대로 남아요. ${monthNumber(month)}월 표부터 이 칸이 안 보여요.`}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    className={ds.button.danger}
                    onClick={() => {
                      setAsk(null)
                      void removeNow(item.id)
                    }}
                  >
                    빼기
                  </button>
                  <button type="button" disabled={busy} className={ds.button.secondary} onClick={() => setAsk(null)}>
                    그만두기
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap gap-2 px-4 py-3">
        <input
          type="text"
          aria-label="새 항목 이름"
          maxLength={NAME_MAX}
          placeholder="새 항목 이름 (예: 자격수당)"
          className={`${smallInput} min-w-0 flex-[1_1_140px]`}
          value={adding}
          onChange={(event) => setAdding(event.target.value)}
        />
        <button type="button" disabled={busy} className={ds.button.primarySmall} onClick={() => void add()}>
          + 항목 더하기
        </button>
      </div>
      <div className="flex flex-col gap-2 px-4 pb-3">
        {problem !== null && (
          <p role="alert" className={ds.fieldError}>
            {problem}
          </p>
        )}
        {failed === 'save' && <ErrorCard code="E-STAFF-SAVE-FAILED" />}
        {failed === 'read' && <ErrorCard code="E-STAFF-READ-FAILED" />}
        <p className="text-caption text-muted">더 일한 시간(연장·야간·휴일)·조정(±)·합계는 늘 있는 칸이라 이 목록에 없어요.</p>
      </div>
    </section>
  )
}

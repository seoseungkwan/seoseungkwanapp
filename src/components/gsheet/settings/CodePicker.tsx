'use client'

import { useMemo, useState } from 'react'
import { formatCount } from '@/components/charts/format'
import { ds } from '@/components/ui/classes'
import { RX } from './labels'
import { FIELD_GROW, HINT, LINE, RULE } from './parts'
import type { Rx } from './replies'

// Block(주사)·물리치료로 셀 처방 고르기 목록(spec google-link AC-8516.3, 시안 .pick · 비트시트 Ui/CodePicker.cs).
// 찾기(코드·이름·분류) + 표(☐ 코드 · 이름 · 분류 · 90일 건수). 그 분류 처방이 위, 그다음 많이 쓴 차례, 코드 차례.
// 고른 코드가 최근 90일 목록에 없어도 맨 위에 보인다(지우지 않게 — 비트시트 그대로).
// 목록 자리 글: 불러오는 중 · 불러오지 못함 + [다시 불러오기] · 처방 없음(비트시트 CodeListState.Message 그대로)

export type RxKind = 'block' | 'therapy'
export type CodeListState = { phase: 'loading' } | { phase: 'failed' } | { phase: 'ready'; rx: Rx[] }

/** 지금 기준 칩 + 풀이(시안 .rule + .hint) */
export function RuleLine({ kind, count, detail = true }: { kind: RxKind; count: number; detail?: boolean }) {
  return (
    <div className={LINE}>
      <span className={RULE}>{count > 0 ? RX.ruleSome(count) : RX.ruleNone[kind]}</span>
      {detail ? <span className={HINT}>{RX.detail[kind]}</span> : null}
    </div>
  )
}

function ordered(kind: RxKind, rx: readonly Rx[]): Rx[] {
  const cls = RX.cls[kind]
  return [...rx].sort(
    (a, b) =>
      (a.cls === cls ? 0 : 1) - (b.cls === cls ? 0 : 1) ||
      b.n90 - a.n90 ||
      a.code.localeCompare(b.code, 'en', { sensitivity: 'base' }),
  )
}

const CELL = 'h-9 whitespace-nowrap border-b border-line px-2.5'
const HEAD = 'sticky top-0 z-10 h-8 whitespace-nowrap border-b border-line bg-canvas px-2.5 text-left text-caption font-semibold text-muted'

export function CodePicker({
  kind,
  state,
  selected,
  onChange,
  onRetry,
}: {
  kind: RxKind
  state: CodeListState
  selected: readonly string[]
  onChange: (codes: string[]) => void
  onRetry: () => void
}) {
  const [query, setQuery] = useState('')
  const picked = useMemo(() => new Set(selected.map((c) => c.toUpperCase())), [selected])

  const rows = useMemo(() => {
    if (state.phase !== 'ready') return []
    const known = new Set(state.rx.map((r) => r.code.toUpperCase()))
    const missing: Rx[] = selected.filter((c) => !known.has(c.toUpperCase())).map((code) => ({ code, name: RX.unused, cls: '', n90: 0 }))
    const q = query.trim().toUpperCase()
    const hit = (r: Rx) => q.length === 0 || [r.code, r.name, r.cls].some((t) => t.toUpperCase().includes(q))
    return [...missing, ...ordered(kind, state.rx)].filter(hit)
  }, [state, selected, query, kind])

  const toggle = (code: string) => {
    const on = picked.has(code.toUpperCase())
    onChange(on ? selected.filter((c) => c.toUpperCase() !== code.toUpperCase()) : [...selected, code])
  }

  let cover: string | null = null
  if (state.phase === 'loading') cover = RX.loading
  else if (state.phase === 'failed') cover = RX.failed
  else if (state.rx.length === 0 && selected.length === 0) cover = RX.none

  return (
    <div className="grid gap-1.5">
      <div className={LINE}>
        <input type="search" aria-label={RX.search} placeholder={RX.search} className={FIELD_GROW} value={query} onChange={(e) => setQuery(e.target.value)} />
        <span className={HINT}>{RX.searchHint}</span>
      </div>
      {cover !== null ? (
        <div className="grid justify-items-start gap-2 rounded-control border border-line bg-canvas px-3 py-4">
          <p className="text-small text-ink-2">{cover}</p>
          {state.phase === 'failed' ? (
            <button type="button" className={ds.button.secondarySmall} onClick={onRetry}>
              {RX.retry}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="max-h-58 overflow-auto rounded-control border border-line">
          <table className="w-full border-collapse text-small">
            <thead>
              <tr>
                <th className={`${HEAD} w-10 text-center`} />
                {RX.heads.map((head, i) => (
                  <th key={head} className={i === RX.heads.length - 1 ? `${HEAD} text-right` : HEAD}>
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} className="hover:bg-canvas">
                  <td className={`${CELL} w-10 text-center`}>
                    <span className={`${ds.checkboxWrap} align-middle`}>
                      <input type="checkbox" aria-label={r.code} className={ds.checkbox} checked={picked.has(r.code.toUpperCase())} onChange={() => toggle(r.code)} />
                      <svg aria-hidden="true" viewBox="0 0 16 16" className={ds.checkboxMark} fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="m4 8.5 2.5 2.5L12 5.5" />
                      </svg>
                    </span>
                  </td>
                  <td className={`${CELL} text-ink-2`}>{r.code}</td>
                  <td className={`${CELL} text-ink`}>{r.name}</td>
                  <td className={`${CELL} text-muted`}>{r.cls}</td>
                  <td className={`${CELL} text-right tabular-nums text-ink-2`}>{formatCount(r.n90)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

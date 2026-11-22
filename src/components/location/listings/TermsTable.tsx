'use client'

// 임대 조건 협상표 (spec location AC-7910.3, design.md 11절, 시안 ?s=listings '임대 조건 협상표').
// 줄 여섯(terms.ts) × 내려놓지 않은 후보마다 제안(now)·바람(want) 칸(100자). 칸을 떠나면(또는 화면이 닫히면) 그 후보의 terms 전체 —
// 받은 terms(임대 조건 메모 terms.memo 포함) 위에 고친 칸을 얹은 것 — 로 onSaveTerms를 부른다(후보 줄 updateCandidate({ terms })에 그대로 쓰는 몸통).
// 고친 칸 글은 받은 값이 같아질 때까지 들고 있어서, 부모가 새 값을 주기 전에 다른 칸을 고쳐도 앞서 고친 칸이 빠지지 않는다
import { useEffect, useRef, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import type { Candidate } from '@/types/location'
import { look } from './look'
import { Section } from './Section'
import { TERM_MAX, TERM_ROWS, termOf, withTerm, type TermKey, type TermSide } from './terms'

export type TermsCandidate = Pick<Candidate, 'id' | 'name' | 'status' | 'terms'>
export type SaveTerms = (candidateId: string, terms: Record<string, unknown>) => Promise<void> | void

const SIDES: readonly [TermSide, string][] = [
  ['now', '제안'],
  ['want', '바람'],
]

type Drafts = Readonly<Record<string, string>>
const cellKey = (candidateId: string, key: TermKey, side: TermSide) => `${candidateId}|${key}|${side}`
const splitKey = (k: string) => {
  const [candidateId = '', key = '', side = ''] = k.split('|')
  return { candidateId, key: key as TermKey, side: side as TermSide }
}

/** 열쇠 차례와 상관없이 같은 내용이면 같은 글자 */
function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`
  if (typeof v === 'object' && v !== null) {
    const r = v as Record<string, unknown>
    return `{${Object.keys(r)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(r[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}

/** 받은 terms 위에 그 후보의 고친 칸을 모두 얹는다 */
function mergedTerms(c: TermsCandidate, drafts: Drafts): Record<string, unknown> {
  let next: Record<string, unknown> = c.terms
  for (const [k, value] of Object.entries(drafts)) {
    const { candidateId, key, side } = splitKey(k)
    if (candidateId === c.id) next = withTerm(next, key, side, value)
  }
  return next
}

/** 그 후보의 바뀐 terms 몸통. 받은 것·마지막으로 보낸 것(sentJson)과 같으면 null */
function pendingOf(c: TermsCandidate, d: Drafts, sentJson: string | undefined): { terms: Record<string, unknown>; json: string } | null {
  const terms = mergedTerms(c, d)
  const json = stableJson(terms)
  return json === stableJson(c.terms) || json === sentJson ? null : { terms, json }
}

export function TermsTable({ candidates, onSaveTerms }: { candidates: readonly TermsCandidate[]; onSaveTerms: SaveTerms }) {
  const live = candidates.filter((c) => c.status !== 'dropped')
  const [drafts, setDrafts] = useState<Drafts>({})
  const [failed, setFailed] = useState(false)
  // 후보마다 마지막으로 보낸 terms(같은 것을 두 번 보내지 않게)
  const sent = useRef<Record<string, string>>({})
  const latest = useRef({ candidates, drafts, onSaveTerms })
  useEffect(() => {
    latest.current = { candidates, drafts, onSaveTerms }
  })

  // 받은 값이 고친 글과 같아진 칸은 들고 있지 않는다(그 뒤로는 받은 값을 그린다)
  useEffect(() => {
    setDrafts((prev) => {
      let changed = false
      const next: Record<string, string> = { ...prev }
      for (const [k, value] of Object.entries(prev)) {
        const { candidateId, key, side } = splitKey(k)
        const c = candidates.find((x) => x.id === candidateId)
        if (c === undefined || termOf(c.terms, key)[side] === value) {
          delete next[k]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [candidates])

  async function commit(c: TermsCandidate) {
    const p = pendingOf(c, drafts, sent.current[c.id])
    if (p === null) return
    sent.current[c.id] = p.json
    try {
      await onSaveTerms(c.id, p.terms)
      setFailed(false)
    } catch {
      if (sent.current[c.id] === p.json) delete sent.current[c.id]
      setFailed(true)
    }
  }

  // 칸을 떠나기 전에 화면이 닫히면(안쪽 탭 바꾸기) 고친 칸을 보낸다
  useEffect(() => {
    const sentNow = sent.current
    return () => {
      const { candidates: cs, drafts: d, onSaveTerms: save } = latest.current
      for (const c of cs) {
        const p = pendingOf(c, d, sentNow[c.id])
        if (p !== null) void Promise.resolve(save(c.id, p.terms)).catch(() => undefined)
      }
    }
  }, [])

  return (
    <Section title="임대 조건 협상표" aside="중개사가 말한 것(제안)과 우리가 바라는 것(바람)을 후보끼리 나란히 적어요">
      {live.length === 0 ? (
        <p className={look.empty}>후보를 더하면 후보마다 협상표를 적을 수 있어요.</p>
      ) : (
        <>
          <div className={look.tableWrap}>
            <table className={look.table}>
              <thead>
                <tr>
                  <th scope="col" className={`${look.th} w-50`}>
                    조건
                  </th>
                  {live.map((c) => (
                    <th key={c.id} scope="col" className={look.th}>
                      {c.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TERM_ROWS.map((row) => (
                  <tr key={row.key}>
                    <th scope="row" className={look.termHead}>
                      <b className={`block ${look.strong}`}>{row.label}</b>
                      <span className={look.sub}>{row.help}</span>
                    </th>
                    {live.map((c) => (
                      <td key={c.id} className={look.termCell}>
                        <div className={look.termPair}>
                          {SIDES.map(([side, word]) => {
                            const k = cellKey(c.id, row.key, side)
                            return (
                              <label key={side} className={look.termLabel}>
                                {word}
                                <input
                                  type="text"
                                  className={look.inputSmall}
                                  aria-label={`${c.name} ${row.label} ${word}`}
                                  maxLength={TERM_MAX}
                                  placeholder={side === 'want' ? '바라는 것' : undefined}
                                  value={drafts[k] ?? termOf(c.terms, row.key)[side]}
                                  onChange={(e) => {
                                    const value = e.target.value
                                    setDrafts((d) => ({ ...d, [k]: value }))
                                  }}
                                  onBlur={() => void commit(c)}
                                  autoComplete="off"
                                />
                              </label>
                            )
                          })}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={look.termNote}>적은 것은 개원 준비의 &apos;계약 전 위험 · 임대 조건 메모&apos;와 한 장 보고서에도 나와요.</p>
        </>
      )}
      {failed && (
        <div className="mt-3">
          <ErrorCard code="E-LOC-SAVE-FAILED" />
        </div>
      )}
    </Section>
  )
}

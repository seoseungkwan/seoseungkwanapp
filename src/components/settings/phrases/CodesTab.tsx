'use client'

import { Fragment, useId, useMemo, useState } from 'react'
import { ds } from '@/components/ui/classes'
import type { MemoCode, Phrases } from '@/lib/precheck/memo'
import type { DayPayload } from '@/types/payload'
import { buildCodeRows, type CodeRow } from '../codeCatalog'
import { KINDS, REGIONS } from './constants'
import { ErrorList, errorsUnder, withRule, type TabProps } from './fields'
import { ROLE_OPTIONS, roleOf, withRole, type RoleChoice } from './saveDiffRows'
import { TemplateField } from './TemplateField'

// '처방코드' 묶음(memo-settings AC-3004.2~3004.5, 시안 #codes): 통계에 저장된 날별 처방과 코드 사전으로 만든 목록에서 코드마다
// 메모 이름(n)·구분(k)·부위(rg)·코드별 메모 문구(memo)·줄 순서(memoRules.order)를 고친다. '새 코드'는 저장된 사전(saved)에 없는 코드라
// 고치는 동안 표시와 자리가 그대로다. 통계 자료는 집계뿐이라 환자 자료가 아니다.
// 약 줄(구분이 약이거나 비트 종류가 약)에는 '역할' 고르기가 있고 CODEMAP 줄 깃발(steroid·localAnesthetic·cartilage)로 쓴다(clinic-profile AC-6608.5, design.md 10절)

export type CatalogState = 'idle' | 'reading' | 'ready' | 'failed'

const th = 'h-10 whitespace-nowrap border-b border-line px-2 text-left font-medium text-muted first:pl-0 last:pr-0'
const td = 'border-b border-line px-2 py-2 align-top first:pl-0 last:pr-0 text-ink'

/** 마지막 처방일: 올해면 월-일, 아니면 연-월-일 */
const dayShown = (day: string | null, today: string) => (day === null ? '—' : day.slice(0, 4) === today.slice(0, 4) ? day.slice(5) : day)

/** 약 줄: 구분이 약이거나 비트 종류가 약인 코드 */
const isDrugRow = (row: CodeRow, entry: MemoCode | undefined) => entry?.k === 'drug' || row.type === '약' || entry?.bitKind === '약'

/** 저장된 사전에 없고 고치는 값(draft)에도 아직 없는 새 코드: 메모에 [코드 확인]이 남는다 */
export const undecidedCodes = (rows: readonly CodeRow[], draft: Pick<Phrases, 'CODEMAP'>) => rows.filter((row) => row.isNew && !Object.hasOwn(draft.CODEMAP, row.code))

export function CodesTab({
  draft,
  saved,
  errors,
  onChange,
  days,
  state,
  today,
  onRetry,
}: TabProps & { saved: Phrases; days: readonly DayPayload[]; state: CatalogState; today: string; onRetry(): void }) {
  const [scope, setScope] = useState<'recent' | 'all'>('recent')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const searchId = useId()
  const ready = state === 'ready'
  const rows = useMemo(() => buildCodeRows(ready ? days : [], saved, today, scope), [ready, days, saved, today, scope])
  const entryOf = (code: string): MemoCode | undefined => (Object.hasOwn(draft.CODEMAP, code) ? draft.CODEMAP[code] : undefined)
  const words = query.trim().toUpperCase()
  const shown = words ? rows.filter((row) => [row.code, row.bitName, entryOf(row.code)?.n ?? ''].some((text) => text.toUpperCase().includes(words))) : rows
  const undecided = undecidedCodes(rows, draft)
  const undecidedShown = undecidedCodes(shown, draft)
  const order = draft.memoRules?.order ?? {}

  const withCodemap = (next: Record<string, MemoCode>) => onChange({ ...draft, CODEMAP: next })
  /** 코드 줄 고치기. 사전에 없는 새 코드는 비트 이름으로 줄을 만든다(구분은 고를 때까지 비어 검사가 알린다) */
  function edit(row: CodeRow, change: Partial<MemoCode>) {
    const next: MemoCode = { ...(entryOf(row.code) ?? { n: row.bitName || row.code, k: '', rg: null }), ...change }
    if (next.memo === '') delete next.memo
    withCodemap({ ...draft.CODEMAP, [row.code]: next })
  }
  function setKind(row: CodeRow, k: string) {
    if (k === '' && !Object.hasOwn(saved.CODEMAP, row.code)) {
      const next = { ...draft.CODEMAP }
      delete next[row.code]
      withCodemap(next)
      return
    }
    edit(row, { k })
  }
  /** 역할 고르기. 사전에 없는 새 약 코드는 약 구분으로 줄을 만든다([자동]이면 만들지 않는다) */
  function setRole(row: CodeRow, role: RoleChoice) {
    const entry = entryOf(row.code)
    if (!entry && role === 'auto') return
    withCodemap({ ...draft.CODEMAP, [row.code]: withRole(entry ?? { n: row.bitName || row.code, k: 'drug', rg: null }, role) })
  }
  function setOrder(code: string, text: string) {
    const key = code.toUpperCase()
    const next = { ...order }
    if (text.trim() === '') delete next[key]
    else next[key] = Number(text.trim())
    onChange(withRule(draft, 'order', next))
  }
  function skipAll() {
    const next = { ...draft.CODEMAP }
    for (const row of undecidedShown) next[row.code] = { n: row.bitName || row.code, k: 'skip', rg: null }
    withCodemap(next)
  }

  const shownCodes = new Set(shown.map((row) => row.code))
  const elsewhere = errors.filter((error) => {
    const [head, code] = error.path.split('.')
    if (head === 'CODEMAP') return code === undefined || !shownCodes.has(code)
    return head === 'CODEMAP_DEL' || error.path === 'memoRules.order'
  })

  return (
    <div className="flex flex-col gap-3">
      {undecided.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-accent-soft bg-accent-soft px-4 py-3 text-small text-ink">
          <span>
            <b>새 코드 {undecided.length}개</b> — 아직 정하지 않아 메모에 <b>[코드 확인: 이름]</b>이 남아요.
          </span>
          <button type="button" className={ds.button.secondarySmall} disabled={undecidedShown.length === 0} onClick={skipAll}>
            새 코드 모두 제외
          </button>
        </div>
      )}
      {(state === 'idle' || state === 'reading') && <p className={ds.help}>통계를 읽는 중이에요…</p>}
      {state === 'failed' && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-small text-ink-2">통계를 읽지 못했어요</p>
          <span aria-hidden="true" className="text-muted">
            ·
          </span>
          <button type="button" className={ds.button.secondarySmall} onClick={onRetry}>
            다시 읽기
          </button>
          <span className={ds.help}>지금은 사전에 있는 코드만 보여요.</span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={searchId} className="sr-only">
          코드나 이름으로 찾기
        </label>
        <input id={searchId} className={`${ds.input} max-w-70`} autoComplete="off" placeholder="코드나 이름으로 찾기" value={query} onChange={(event) => setQuery(event.target.value)} />
        <span className={ds.help}>{scope === 'recent' ? `최근 3개월에 처방된 코드와 사전 코드 ${rows.length}개` : `저장된 통계 전체 기간에 처방된 코드와 사전 코드 ${rows.length}개`}</span>
        <button type="button" className={ds.button.secondarySmall} onClick={() => setScope(scope === 'recent' ? 'all' : 'recent')}>
          {scope === 'recent' ? '전체 보기' : '최근 3개월만'}
        </button>
      </div>
      <div className={ds.table.wrap}>
        <table aria-label="처방코드 목록" className={ds.table.table}>
          <thead>
            <tr>
              <th className={th}>코드</th>
              <th className={th}>비트 이름 · 종류</th>
              <th className={th}>마지막 처방</th>
              <th className={th}>메모에 쓸 이름</th>
              <th className={th}>구분</th>
              <th className={th}>역할</th>
              <th className={th}>부위</th>
              <th className={th}>코드별 메모 문구</th>
              <th className={th}>순서</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const entry = entryOf(row.code)
              const key = row.code.toUpperCase()
              const rank = order[key]
              const open = editing === row.code
              const role = roleOf(entry)
              return (
                <Fragment key={row.code}>
                  <tr className={row.isNew ? 'bg-warning-soft' : undefined}>
                    <td className={td}>
                      <span className="flex flex-wrap items-center gap-1.5 whitespace-nowrap">
                        {row.code}
                        {row.isNew && <span className={ds.chip.warning}>새 코드</span>}
                      </span>
                    </td>
                    <td className={`${td} text-ink-2`}>{[row.bitName, row.type].filter(Boolean).join(' · ') || '—'}</td>
                    <td className={`${td} whitespace-nowrap text-ink-2`}>{dayShown(row.lastDay, today)}</td>
                    <td className={td}>
                      <input aria-label={`${row.code} 메모에 쓸 이름`} className={`${ds.input} min-w-30`} autoComplete="off" placeholder={row.bitName} value={entry?.n ?? ''} onChange={(event) => edit(row, { n: event.target.value })} />
                      <ErrorList errors={errorsUnder(errors, `CODEMAP.${row.code}`)} />
                    </td>
                    <td className={td}>
                      <select aria-label={`${row.code} 구분`} className={`${ds.input} min-w-24`} value={entry?.k ?? ''} onChange={(event) => setKind(row, event.target.value)}>
                        {/* 저장된 사전에 없는 코드는 '정하기'로 되돌릴 수 있다(사전에서 빠진다) */}
                        {(!Object.hasOwn(saved.CODEMAP, row.code) || !KINDS.some((kind) => kind.value === entry?.k)) && <option value="">정하기</option>}
                        {KINDS.map((kind) => (
                          <option key={kind.value} value={kind.value}>
                            {kind.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={td}>
                      {isDrugRow(row, entry) && (
                        <span className="flex flex-wrap items-center gap-2">
                          <select aria-label={`${row.code} 역할`} className={`${ds.input} min-w-28`} value={role} onChange={(event) => setRole(row, event.target.value as RoleChoice)}>
                            {ROLE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          {role === 'auto' && <span className={`${ds.help} whitespace-nowrap`}>보험코드 성분으로 정해요</span>}
                        </span>
                      )}
                    </td>
                    <td className={td}>
                      <select aria-label={`${row.code} 부위`} className={`${ds.input} min-w-32`} value={entry?.rg ?? ''} onChange={(event) => edit(row, { rg: event.target.value || null })}>
                        <option value="">자동</option>
                        {REGIONS.map((region) => (
                          <option key={region.key} value={region.key}>
                            {region.ko}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={td}>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="whitespace-pre-wrap break-words text-ink-2">{entry?.memo || '—'}</span>
                        <button type="button" className={ds.button.secondarySmall} aria-label={`${row.code} 메모 문구 고치기`} aria-expanded={open} onClick={() => setEditing(open ? null : row.code)}>
                          {open ? '닫기' : '고치기'}
                        </button>
                      </span>
                    </td>
                    <td className={td}>
                      <input
                        aria-label={`${row.code} 줄 순서`}
                        className={`${ds.input} max-w-20`}
                        inputMode="numeric"
                        autoComplete="off"
                        value={rank === undefined || Number.isNaN(rank) ? '' : String(rank)}
                        aria-invalid={errorsUnder(errors, `memoRules.order.${key}`).length > 0 || undefined}
                        onChange={(event) => setOrder(row.code, event.target.value)}
                      />
                      <ErrorList errors={errorsUnder(errors, `memoRules.order.${key}`)} />
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={9} className={td}>
                        <TemplateField label={`${row.code} 코드별 메모 문구`} path={`CODEMAP.${row.code}.memo`} value={entry?.memo ?? ''} draft={draft} onChange={(memo) => edit(row, { memo })} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <ErrorList errors={elsewhere} />
      <p className={ds.help}>순서: 번호를 넣은 코드의 줄이 번호 작은 차례로 먼저 오고, 번호 없는 줄은 차트에 적힌 차례로 그 뒤에 와요. 목록은 통계에 저장된 처방에서 모아요(한 번도 처방하지 않은 코드는 없어요).</p>
    </div>
  )
}

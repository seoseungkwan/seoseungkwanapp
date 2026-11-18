'use client'

import { ds } from '@/components/ui/classes'
import type { ChartWord } from '@/lib/precheck/memo'
import { ErrorList, errorOf, type TabProps } from './fields'

// '차트 줄임말' 묶음(clinic-profile AC-6612.1, design.md 14절): 차트에 이렇게 적으면 → 이렇게 읽어요 두 칸 줄 목록(chartWords).
// 100줄까지, 칸마다 40자까지, 같은 '적으면'은 한 번만 — 검사(validatePhrases)가 그 칸 아래에 까닭을 보인다. 환자 자료가 아니다

const MAX_ROWS = 100
const MAX_CHARS = 40

const th = 'h-10 whitespace-nowrap border-b border-line px-2 text-left font-medium text-muted first:pl-0 last:pr-0'
const td = 'border-b border-line px-2 py-2 align-top first:pl-0 last:pr-0 text-ink'

export function WordsTab({ draft, errors, onChange }: TabProps) {
  const rows = draft.chartWords ?? []
  const set = (next: ChartWord[]) => onChange({ ...draft, chartWords: next })
  const edit = (index: number, change: Partial<ChartWord>) => set(rows.map((row, at) => (at === index ? { ...row, ...change } : row)))

  return (
    <div className="flex flex-col gap-3">
      <div className={ds.table.wrap}>
        <table aria-label="차트 줄임말" className={ds.table.table}>
          <thead>
            <tr>
              <th className={th}>차트에 이렇게 적으면</th>
              <th className={th}>이렇게 읽어요</th>
              <th className={th}>
                <span className="sr-only">빼기</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="h-12 text-muted">
                  적은 줄임말이 없어요.
                </td>
              </tr>
            )}
            {rows.map((row, index) => {
              const n = index + 1
              const termError = [errorOf(errors, `chartWords.${index}`), errorOf(errors, `chartWords.${index}.term`)].filter((message) => message !== undefined)
              const targetError = errorOf(errors, `chartWords.${index}.target`)
              return (
                <tr key={index}>
                  <td className={td}>
                    <input
                      aria-label={`${n}번 줄 차트에 이렇게 적으면`}
                      className={`${ds.input} min-w-30`}
                      autoComplete="off"
                      maxLength={MAX_CHARS}
                      value={row.term}
                      aria-invalid={termError.length > 0 || undefined}
                      onChange={(event) => edit(index, { term: event.target.value })}
                    />
                    {termError.map((message) => (
                      <p key={message} className={ds.fieldError}>
                        {message}
                      </p>
                    ))}
                  </td>
                  <td className={td}>
                    <input
                      aria-label={`${n}번 줄 이렇게 읽어요`}
                      className={`${ds.input} min-w-30`}
                      autoComplete="off"
                      maxLength={MAX_CHARS}
                      value={row.target}
                      aria-invalid={targetError ? true : undefined}
                      onChange={(event) => edit(index, { target: event.target.value })}
                    />
                    {targetError && <p className={ds.fieldError}>{targetError}</p>}
                  </td>
                  <td className={td}>
                    <button type="button" className={ds.button.secondarySmall} aria-label={`${n}번 줄 빼기`} onClick={() => set(rows.filter((_, at) => at !== index))}>
                      빼기
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={ds.button.secondarySmall} disabled={rows.length >= MAX_ROWS} onClick={() => set([...rows, { term: '', target: '' }])}>
          + 줄 더하기
        </button>
      </div>
      <ErrorList errors={errors.filter((error) => error.path === 'chartWords')} />
      <p className={ds.help}>메모 시험 탭에서 바로 확인할 수 있어요.</p>
    </div>
  )
}

'use client'

import { useId } from 'react'
import { ds } from '@/components/ui/classes'
import type { PhraseDiffRow } from '@/lib/precheck/memo'

// 저장 전 '바뀐 부분' 표(memo-settings AC-3007.5, 시안 .diff): 바뀐 칸의 이름·전·후. [이대로 저장]을 눌러야 저장한다. 줄은 saveDiffRows가 만든다

const th = 'h-10 whitespace-nowrap border-b border-line px-2 text-left font-medium text-muted first:pl-0 last:pr-0'
const td = 'border-b border-line px-2 py-2 align-top first:pl-0 last:pr-0 text-ink break-words'

export function SaveDiff({ rows, busy, onConfirm, onCancel }: { rows: readonly PhraseDiffRow[]; busy: boolean; onConfirm(): void; onCancel(): void }) {
  const titleId = useId()
  return (
    <section aria-label="바뀐 부분" className="flex flex-col gap-3 rounded-control border border-accent bg-surface px-4 py-3">
      <h3 id={titleId} className="text-body font-semibold text-ink">
        바뀐 부분을 확인해 주세요
      </h3>
      <div className={ds.table.wrap}>
        <table aria-labelledby={titleId} className={ds.table.table}>
          <thead>
            <tr>
              <th className={th}>칸</th>
              <th className={th}>전</th>
              <th className={th}>후</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.path}>
                <td className={td}>{row.label}</td>
                <td className={`${td} whitespace-pre-wrap text-ink-2`}>{row.before}</td>
                <td className={`${td} whitespace-pre-wrap`}>{row.after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={ds.button.primary} aria-busy={busy || undefined} onClick={onConfirm}>
          이대로 저장
        </button>
        <button type="button" className={ds.button.secondary} onClick={onCancel}>
          더 고치기
        </button>
      </div>
    </section>
  )
}

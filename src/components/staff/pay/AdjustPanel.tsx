'use client'

import { useState } from 'react'
import { ds } from '@/components/ui/classes'
import type { AdjustReason, PayLine } from '@/types/staff'
import { monthNumber } from './format'
import { smallInput, WonInput } from './parts'

// 조정(±) 작은 창 (staff AC-7615.3, 시안 pay.html ① 오른쪽 .pop). 저장 단추 없이 고를 때·칸에서 나갈 때 그 줄을 바로 저장한다.
// 까닭(일할 계산·공제·기타 + 짧은 글 30자)은 세무사 엑셀 '메모' 칸에 들어간다(taxExcel.ts)

export const ADJUST_REASON_LABEL: Record<AdjustReason, string> = { prorate: '일할 계산', deduct: '공제', other: '기타' }
const REASONS: readonly AdjustReason[] = ['prorate', 'deduct', 'other']
const MEMO_MAX = 30

export function AdjustPanel({ line, name, onSave, onClose }: { line: PayLine; name: string; onSave: (line: PayLine) => void; onClose: () => void }) {
  const [minus, setMinus] = useState(line.adjust < 0)
  const [memo, setMemo] = useState(line.adjustMemo ?? '')
  const amount = Math.abs(line.adjust)
  const title = `조정(±) · ${name} · ${monthNumber(line.month)}월`
  const put = (change: Partial<PayLine>) => {
    const next = { ...line, ...change }
    if (next.adjust !== line.adjust || next.adjustReason !== line.adjustReason || next.adjustMemo !== line.adjustMemo) onSave(next)
  }
  const seg = (on: boolean) => `${ds.segment.button} ${on ? ds.segment.on : ds.segment.off}`
  return (
    <section role="dialog" aria-label={title} className={`${ds.layer} min-w-0`}>
      <div className="flex items-center gap-2 border-b border-line px-4 py-2">
        <b className="text-body font-semibold text-ink">{title}</b>
        <button type="button" className={`${ds.button.ghostSmall} ml-auto`} onClick={onClose}>
          닫기
        </button>
      </div>
      <div className="flex flex-col gap-3 px-4 py-3">
        <div className="flex flex-col gap-1">
          <span className="text-caption text-muted">더하거나 뺄 금액</span>
          <div className="flex flex-wrap items-center gap-1.5 text-small text-ink">
            <span role="group" aria-label="더하기·빼기" className={ds.segment.group}>
              <button
                type="button"
                aria-pressed={!minus}
                className={seg(!minus)}
                onClick={() => {
                  setMinus(false)
                  put({ adjust: amount })
                }}
              >
                + 더하기
              </button>
              <button
                type="button"
                aria-pressed={minus}
                className={seg(minus)}
                onClick={() => {
                  setMinus(true)
                  put({ adjust: -amount })
                }}
              >
                − 빼기
              </button>
            </span>
            <WonInput label="조정 금액" value={amount === 0 ? null : amount} className="max-w-32" onCommit={(value) => put({ adjust: (minus ? -1 : 1) * (value ?? 0) })} />
            <span>원</span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-caption text-muted">까닭</span>
          <span role="group" aria-label="까닭" className={`${ds.segment.group} self-start`}>
            {REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                aria-pressed={line.adjustReason === reason}
                className={seg(line.adjustReason === reason)}
                onClick={() => put({ adjustReason: line.adjustReason === reason ? null : reason })}
              >
                {ADJUST_REASON_LABEL[reason]}
              </button>
            ))}
          </span>
          <input
            type="text"
            aria-label="까닭 글"
            maxLength={MEMO_MAX}
            placeholder="짧게 적어요 (예: 무급 1일 공제)"
            className={smallInput}
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            onBlur={() => {
              const text = memo.trim()
              put({ adjustMemo: text === '' ? null : text })
            }}
          />
        </div>
        <p className="text-caption text-muted">적은 까닭은 세무사 엑셀 &apos;메모&apos; 칸에도 들어가요.</p>
      </div>
    </section>
  )
}

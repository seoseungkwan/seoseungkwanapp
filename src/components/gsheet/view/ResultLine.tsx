'use client'

import { Fragment } from 'react'
import { resultLines } from '@/lib/gsheet/result'
import type { FillDone } from '@/lib/gsheet/status'
import { VIEW } from './labels'

// 띠 아래 결과 줄(spec google-link AC-8515.4, 시안 notes-sunap `done`·`done-warn`). 글은 lib/gsheet/result(resultLines)가 준다.
//   보통(✔): 1줄 머리 + 2줄 덧붙임 + 3줄 넣지 않음(있을 때만)
//   확인 필요(⚠, 주황): 1줄 머리 + 2줄 확인 필요 글(주황) + 3줄 풀이 — 시안 done-warn처럼 덧붙임 줄 대신. 넣지 않음은 있을 때만 그 뒤
// 띄울지(손 넣기·확인 필요만)는 lib/gsheet/status가 정한다. 답 숫자가 없는 결과(실패 등)는 그리지 않는다

const ROW = 'text-muted pr-8'

export function ResultLine({ done, onClose }: { done: FillDone; onClose: () => void }) {
  if (!done.reply) return null
  const lines = resultLines(done.reply, { day: done.day, mode: done.mode, via: done.via, at: new Date(done.at) })
  const warn = lines.head.tone === 'warn'
  return (
    <div
      role="status"
      className={`grid gap-0.5 rounded-control border border-l-3 border-line py-2 pr-2 pl-3 text-small ${warn ? 'border-l-warning bg-warning-soft/40' : 'border-l-positive bg-surface'}`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-2">
        <span className={`font-semibold ${warn ? 'text-warning' : 'text-positive'}`}>{lines.head.title}</span>{' '}
        <span>{lines.head.where}</span>{' '}
        <span aria-hidden="true" className="h-3.5 w-px bg-line" />
        <span>
          {lines.head.counts.map((count, i) => (
            <Fragment key={count.label}>
              {i > 0 && ' · '}
              {count.label} <b className="font-semibold text-ink tabular-nums">{count.n}</b>
              {count.unit}
            </Fragment>
          ))}
        </span>
        <button
          type="button"
          aria-label={VIEW.resultClose}
          onClick={onClose}
          className="ml-auto inline-flex size-8 cursor-pointer items-center justify-center rounded-control text-ink-2 transition hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      {warn && lines.warn ? (
        <>
          <div className="pr-8 font-medium text-warning">{lines.warn.line}</div>
          {lines.warn.why !== '' && <div className={ROW}>{lines.warn.why}</div>}
        </>
      ) : (
        lines.extra !== '' && <div className={ROW}>{lines.extra}</div>
      )}
      {lines.notPut !== '' && <div className={ROW}>{lines.notPut}</div>}
    </div>
  )
}

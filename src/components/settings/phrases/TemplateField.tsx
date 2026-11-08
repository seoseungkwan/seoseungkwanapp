'use client'

import { useId, useLayoutEffect, useMemo, useRef } from 'react'
import { ds } from '@/components/ui/classes'
import { allowedTokens, createMemoEngine, type Phrases } from '@/lib/precheck/memo'
import { fixedOf, PREVIEW_VALUES } from './constants'
import { canMove, insertToken, moveToken, pieces, removeToken } from './tokenPieces'

// 틀 글 칸 하나(memo-settings REQ-3008, 시안 .tf, 메디코어 tokenRow): 글 칸 + '자동 채움 넣기' 단추 + 조각 줄(◀ ▶ ×) + 보기 한 줄.
// 단추는 검사가 그 칸에 허용하는 {항목}(allowedTokens)이라 고정 멘트를 더하거나 이름을 바꾸면 바로 바뀐다. 보기는 엔진 fill로 채운다. 환자 자료가 아니다

const tokenButton = `inline-flex h-6 cursor-pointer items-center rounded-control border border-accent-soft bg-accent-soft px-2 text-caption font-medium text-accent-strong hover:border-accent ${ds.focusRing}`
const tokenButtonMine = `inline-flex h-6 cursor-pointer items-center rounded-control border border-warning-soft bg-warning-soft px-2 text-caption font-medium text-warning hover:border-warning ${ds.focusRing}`
const wordPiece = 'inline-flex h-6 items-center rounded-control border border-line bg-canvas px-1.5 text-caption text-ink-2'
const tokenPiece = 'inline-flex h-6 items-center gap-0.5 rounded-control border border-accent bg-surface px-0.5 text-caption font-semibold text-accent-strong'
const pieceButton = `inline-flex size-5 cursor-pointer items-center justify-center rounded-control text-caption text-ink-2 hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40 ${ds.focusRing}`

/** 보기 한 줄(AC-3008.3). 고치는 중이라 엔진이 못 채우면 빈 줄로 둔다 */
function previewOf(draft: Phrases, text: string): string {
  try {
    return createMemoEngine(draft, {}).fill(text, PREVIEW_VALUES)
  } catch {
    return ''
  }
}

export function TemplateField({
  label,
  path,
  value,
  draft,
  error,
  rows,
  onChange,
}: {
  label: string
  /** 검사 경로(예: 'TPL.iaEtc', 'TPL.byProc.SSNB', 'CODEMAP.KK090.memo') */
  path: string
  value: string
  draft: Phrases
  error?: string
  rows?: number
  onChange(value: string): void
}) {
  const id = useId()
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  /** 글 칸에 글쓰기 표시를 둔 적이 있나. 없으면 단추는 글 끝에 넣는다 */
  const placed = useRef(false)
  /** 넣은 뒤 글쓰기 표시를 둘 자리(다음 그리기 뒤) */
  const caretAfter = useRef<number | null>(null)
  const tokens = allowedTokens(path, draft)
  const mine = new Set(fixedOf(draft.TPL).map((row) => row.token))
  const list = pieces(value)
  const preview = useMemo(() => previewOf(draft, value), [draft, value])

  useLayoutEffect(() => {
    const at = caretAfter.current
    if (at === null || !field.current) return
    caretAfter.current = null
    field.current.setSelectionRange(at, at)
  })

  /** 글쓰기 표시 자리(고른 글이 있으면 그 끝)에 넣는다. 고른 글은 지우지 않는다 */
  function insert(token: string) {
    const element = field.current
    const at = placed.current && element ? (element.selectionEnd ?? value.length) : value.length
    caretAfter.current = Math.min(at, value.length) + token.length + 2
    placed.current = true
    onChange(insertToken(value, at, at, token))
    element?.focus()
  }
  const markPlaced = () => {
    placed.current = true
  }

  const common = {
    id,
    ref: field,
    value,
    className: rows ? `${ds.input} h-auto py-2` : ds.input,
    'aria-invalid': error ? true : undefined,
    onChange: (event: { target: { value: string } }) => onChange(event.target.value),
    onFocus: markPlaced,
    onSelect: markPlaced,
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className={ds.label} htmlFor={id}>
        {label}
      </label>
      {rows ? <textarea rows={rows} {...common} /> : <input autoComplete="off" {...common} />}
      {error && <p className={ds.fieldError}>{error}</p>}
      {tokens.length > 0 && (
        <div role="group" aria-label={`${label} 자동 채움 넣기`} className="flex flex-wrap items-center gap-1">
          <span aria-hidden="true" className="mr-1 text-caption text-muted">
            자동 채움 넣기
          </span>
          {tokens.map((token) => (
            <button key={token} type="button" className={mine.has(token) ? tokenButtonMine : tokenButton} onMouseDown={(event) => event.preventDefault()} onClick={() => insert(token)}>
              {`{${token}}`}
            </button>
          ))}
        </div>
      )}
      {list.some((piece) => piece.kind === 'token') && (
        <div role="group" aria-label={`${label} 조각`} className="flex flex-wrap items-center gap-1">
          {list.map((piece, index) =>
            piece.kind === 'space' ? null : piece.kind === 'word' ? (
              <span key={index} className={wordPiece}>
                {piece.text}
              </span>
            ) : (
              <span key={index} className={tokenPiece}>
                <button type="button" className={pieceButton} aria-label={`${piece.text} 앞으로`} disabled={!canMove(list, index, -1)} onClick={() => onChange(moveToken(value, index, -1))}>
                  ◀
                </button>
                {piece.text}
                <button type="button" className={pieceButton} aria-label={`${piece.text} 뒤로`} disabled={!canMove(list, index, 1)} onClick={() => onChange(moveToken(value, index, 1))}>
                  ▶
                </button>
                <button type="button" className={pieceButton} aria-label={`${piece.text} 지우기`} onClick={() => onChange(removeToken(value, index))}>
                  ×
                </button>
              </span>
            ),
          )}
        </div>
      )}
      <p className="text-caption text-ink-2">
        보기: <span className="font-medium text-ink">{preview || '(빈 줄)'}</span>
      </p>
    </div>
  )
}

'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { formatCount } from '@/components/charts/format'
import { Icon } from '@/components/common/Icon'
import { searchCatalog } from '@/components/stats/rxPickView'
import { codeKey, type RxLine } from '@/components/stats/view'
import { ds } from '@/components/ui/classes'

// 처방 찾기 칸·목록·칩·[모두 지우기] (rx-picker REQ-802·803·809, 시안 docs/mockups/rx-picker). 저장·읽기는 부르는 쪽 훅이 하고 props만 받는다.
// 혼자 갖는 상태는 글자·옮겨 간 줄·열림뿐이다

export type RxPickSearchProps = {
  catalog: readonly RxLine[]
  picks: readonly RxLine[] // 고른 차례. 코드는 저장된 글자, 이름은 그 처방 표 줄의 이름이다
  counts: ReadonlyMap<string, number> // 대문자 코드 → 이 기간 건수(rxPeriodCounts)
  catalogState: 'idle' | 'reading' | 'ready' | 'failed'
  disabled: boolean // 고른 처방을 아직 모른다(읽는 중·읽기 실패). 칸만 막혀 있고 칩·빈 안내를 그리지 않는다
  onToggle: (line: RxLine) => void
  onRemove: (code: string) => void
  onClear: () => void
  onOpen: () => void // 닫힌 목록이 열릴 때마다, 그리고 열린 채 catalogState가 idle로 돌아올 때 부른다. 넓은 범위를 읽을지는 훅이 정한다
  onRetryCatalog: () => void
}

// 칩의 빼기 단추는 칩 안에 꽉 차서 초점 고리를 안쪽에 그린다(시안 .pill button:focus-visible)
const INNER_RING = 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent'

// 이름이 빈 글자이거나 코드와 같으면 코드 하나만 보인다 (AC-803.5)
const shownName = ({ code, name }: RxLine) => name.trim() || code

export function RxPickSearch({ catalog, picks, counts, catalogState, disabled, onToggle, onRemove, onClear, onOpen, onRetryCatalog }: RxPickSearchProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const quietFocus = useRef(false) // 칩을 뺀 뒤처럼 초점만 돌려줄 때: 칸의 '초점이 오면 연다'를 건너뛴다
  const stateBefore = useRef(catalogState)
  const inputId = useId()
  const listId = useId()
  const helpId = useId()

  const isOpen = open && !disabled
  const rows = isOpen ? searchCatalog(catalog, query) : []
  const activeAt = Math.min(active, rows.length - 1) // 받은 목록이 줄어도 남은 끝 줄을 가리킨다
  const activeId = activeAt >= 0 ? `${listId}-${activeAt}` : undefined
  const pickedKeys = new Set(picks.map((pick) => codeKey(pick.code)))
  const wanted = query.trim()

  // 새 숫자가 저장되면 훅이 읽지 않고 idle로 돌아간다. 열려 있으면 바로 다시 읽게 알린다 (AC-802.7). 닫혀 있으면 다음에 열 때 openList가 알린다
  useEffect(() => {
    const before = stateBefore.current
    stateBefore.current = catalogState
    if (isOpen && catalogState === 'idle' && before !== 'idle') onOpen()
  }, [catalogState, isOpen, onOpen])

  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  useEffect(() => {
    if (!isOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      setOpen(false)
      setActive(-1)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [isOpen])

  const openList = () => {
    if (disabled || open) return
    setOpen(true)
    onOpen()
  }
  const closeList = () => {
    setOpen(false)
    setActive(-1)
  }
  const focusWithoutOpening = () => {
    quietFocus.current = true
    inputRef.current?.focus()
    quietFocus.current = false
  }
  const toggle = (line: RxLine) => {
    onToggle(line)
    setQuery('')
    setActive(-1)
    inputRef.current?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return
    if (event.key === 'Escape') {
      closeList()
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!isOpen) openList()
      else setActive(event.key === 'ArrowDown' ? Math.min(rows.length - 1, activeAt + 1) : Math.max(0, activeAt - 1))
    } else if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) {
      // 사파리는 조합을 끝낸 Enter에 isComposing false + keyCode 229를 준다. 닫혀 있으면 rows가 비어 보이지 않는 줄을 고르지 않는다
      event.preventDefault()
      const line = rows[Math.max(activeAt, 0)]
      if (line) toggle(line)
    }
  }

  return (
    <>
      <div
        ref={rootRef}
        onBlur={(event) => {
          // 키보드로 칸 밖으로 나가면 닫는다. 층 안의 단추로 옮겨 가거나 창을 떠나는 것(relatedTarget 없음)은 닫지 않는다
          if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) closeList()
        }}
        className="mt-3 max-w-120 max-md:max-w-none"
      >
        <label htmlFor={inputId} className={`${ds.label} mb-1`}>
          처방 찾기
        </label>
        <div className="relative">
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            role="combobox"
            aria-expanded={isOpen}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            aria-describedby={helpId}
            aria-disabled={disabled || undefined}
            readOnly={disabled}
            autoComplete="off"
            placeholder="이름이나 코드를 적어 주세요"
            value={query}
            onChange={(event) => {
              if (disabled) return
              setQuery(event.target.value)
              setActive(-1)
              openList()
            }}
            onFocus={() => {
              if (!quietFocus.current) openList()
            }}
            onClick={openList}
            onKeyDown={onKeyDown}
            className={ds.input}
          />
          {/* 떠 있는 층: 칸 바로 아래에 떠서 아래 내용을 밀지 않는다. 층을 눌러도 초점이 칸을 떠나지 않는다(mousedown 막기). z-5: 위에 붙는 탭 줄(z-10) 아래로 지나간다 */}
          <div hidden={!isOpen} onMouseDown={(event) => event.preventDefault()} className={`${ds.layer} absolute inset-x-0 top-full z-5 mt-1.5 overflow-clip`}>
            {/* tabIndex -1: 브라우저가 밀리는 칸을 Tab 자리로 넣지 않게 한다. 초점은 칸에 두고 aria-activedescendant로 가리킨다 */}
            <ul id={listId} role="listbox" aria-label="찾은 처방" aria-multiselectable="true" tabIndex={-1} className="max-h-66 overflow-y-auto">
              {rows.map((line, at) => {
                const picked = pickedKeys.has(codeKey(line.code))
                const name = shownName(line)
                return (
                  <li
                    key={codeKey(line.code)}
                    id={`${listId}-${at}`}
                    role="option"
                    aria-selected={picked}
                    onClick={() => toggle(line)}
                    className={`flex min-h-11 cursor-pointer items-center gap-2 px-3 py-1 text-body text-ink hover:bg-canvas ${at === activeAt ? 'bg-canvas' : ''}`}
                  >
                    <span className="min-w-0 flex-1 wrap-anywhere">
                      {name}
                      {name !== line.code && <span className="ml-1.5 text-caption text-muted">{line.code}</span>}
                    </span>
                    <span className="shrink-0 text-small tabular-nums text-muted">{formatCount(counts.get(codeKey(line.code)) ?? 0)}건</span>
                    <span className="w-11 shrink-0 text-right text-caption font-medium text-accent-strong">{picked ? '고름' : ''}</span>
                  </li>
                )
              })}
            </ul>
            {isOpen && rows.length === 0 && wanted !== '' && <p role="status" className="p-3 text-small text-ink-2">{`“${wanted}”에 맞는 처방이 없어요. 불러온 숫자에 있는 처방만 찾을 수 있어요.`}</p>}
            {isOpen && rows.length === 0 && wanted === '' && (catalogState === 'ready' || catalogState === 'idle') && <p className="p-3 text-small text-ink-2">불러온 숫자에 처방이 없어요.</p>}
            {isOpen && catalogState === 'reading' && (
              <p role="status" className="px-3 py-2 text-small text-ink-2">
                처방 목록을 더 읽는 중이에요
              </p>
            )}
            {isOpen && catalogState === 'failed' && (
              <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                <p role="alert" className="min-w-0 flex-1 text-small text-ink-2">
                  전체 처방 목록을 읽지 못해 지금 보는 기간의 처방만 보여요.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onRetryCatalog()
                    inputRef.current?.focus() // 이 단추는 곧 사라진다
                  }}
                  className={ds.button.secondarySmall}
                >
                  다시 읽기
                </button>
              </div>
            )}
            <div className="flex justify-end border-t border-line px-3">
              <button
                type="button"
                onClick={() => {
                  closeList()
                  focusWithoutOpening()
                }}
                className={`min-h-11 cursor-pointer text-small font-medium text-ink-2 ${ds.focusRing}`}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
        <p id={helpId} className={`${ds.help} mt-1`}>
          불러온 숫자에 있는 처방만 찾아요. 고른 처방은 다음에도 남아요.
        </p>
      </div>

      {!disabled && picks.length === 0 && (
        <div className="mt-4 border-t border-line py-4">
          <p className="text-body font-semibold text-ink">아직 고른 처방이 없어요</p>
          <p className="text-body text-ink-2">위 칸에 이름이나 코드를 적어 찾아보세요. 여러 개를 고를 수 있어요.</p>
        </div>
      )}

      {!disabled && picks.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {picks.map((pick) => {
            const name = shownName(pick)
            return (
              <span key={codeKey(pick.code)} className="inline-flex h-8 max-w-full items-center rounded-control bg-accent-soft pl-3 text-small font-medium text-accent-strong max-md:h-11">
                <span className="min-w-0 truncate">{name}</span>
                <button
                  type="button"
                  aria-label={`${name} 빼기`}
                  onClick={() => {
                    onRemove(pick.code)
                    closeList()
                    focusWithoutOpening()
                  }}
                  className={`inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-control ${INNER_RING} max-md:size-11`}
                >
                  <Icon name="x" size={12} />
                </button>
              </span>
            )
          })}
          <button
            type="button"
            onClick={() => {
              onClear()
              closeList()
              focusWithoutOpening() // 누른 단추가 사라진다
            }}
            className={`${ds.textButton} min-h-8`}
          >
            모두 지우기
          </button>
        </div>
      )}
    </>
  )
}

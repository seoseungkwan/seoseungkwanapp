'use client'

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { formatCount } from '@/components/charts/format'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { searchCatalog } from '@/components/stats/rxPickView'
import {
  addBlankGroup,
  draftProblem,
  forSave,
  groupLabel,
  moveGroup,
  movedNote,
  ownerOf,
  pickCode,
  removeCode,
  removeGroup,
  setName,
  TOO_MANY_GROUPS,
} from '@/components/stats/treatmentEdit'
import { codeKey, type RxLine } from '@/components/stats/view'
import { ds } from '@/components/ui/classes'
import { renameGroup } from '@/lib/revenue/treatments'
import { RX_GROUPS_MAX, type RxGroup } from '@/types/rxGroups'

// 처방별 추세 묶음 고치기 화면 (spec treatment-trend TASK-10, REQ-1210·REQ-1212, 시안 docs/mockups/treatment-trend renderEdit()).
// props만 받는다: 저장·읽기는 부르는 쪽(TreatmentTrendSection·묶음 훅·찾기 목록 훅)이 한다. 고치는 초안·열린 찾기 목록은 이 안의 React 상태에만 있고 [저장] 때 onSave를 한 번 부른다.
// 칸 제목('처방별 추세 · 묶음 고치기')·돌아가기·초점 돌려주기·저장 글은 부르는 쪽이 그린다. 처방 이름·코드·건수만 다루고 환자 자료는 없다.
// 시안에서 바꾼 곳(design.md '시안과 다른 곳'): 들여쓰기 72px → 64px(간격 단계), 휴대폰 이름 칸 옆 80px → 96px(▲▼ 두 칸 + 사이), 입력은 ds.input이라 PC에서도 44px

export type CatalogState = 'idle' | 'reading' | 'ready' | 'failed'

export type TreatmentGroupEditorProps = {
  /** 고치기를 열 때의 묶음(sortOrder 차례). 처음 그릴 때만 초안으로 옮기고 그 뒤에 바뀌어도 따라가지 않는다 */
  groups: readonly RxGroup[]
  /** 찾기 목록 줄(rxCatalog: 넓은 범위 + 화면의 일 숫자 + 묶음에 든 처방, 코드 대소문자 합침). 묶음 안 처방 이름도 여기서 찾는다 */
  lines: readonly RxLine[]
  /** 대문자 코드 → 이 기간 건수(rxPeriodCounts, 표의 건수와 같은 셈) */
  counts: ReadonlyMap<string, number>
  /** PERIOD_NAME[기간], 예: '최근 30일' */
  periodName: string
  catalogState: CatalogState
  /** 닫힌 찾기 목록이 열릴 때마다, 그리고 열린 채 catalogState가 idle로 돌아올 때 부른다. 넓은 범위를 읽을지는 훅이 정한다 */
  onOpenCatalog: () => void
  onRetryCatalog: () => void
  /** 부르는 쪽이 저장하는 중 */
  saving: boolean
  /** 마지막 저장이 실패함. 초안은 그대로 두고 오류 카드를 보인다 */
  saveFailed: boolean
  /** forSave 값(앞뒤 빈칸 뗀 이름, sortOrder 0부터)으로 한 번 부른다. 성공하면 부르는 쪽이 이 화면을 닫는다 */
  onSave: (after: RxGroup[]) => Promise<boolean>
  /** [그만두기]: 초안을 버리고 닫는다. 저장을 부르지 않는다 */
  onCancel: () => void
}

const INTRO =
  '묶음 이름을 짓고, 넣을 처방을 고르세요. 처방 하나는 한 묶음에만 들어가요. 어느 묶음에도 없는 처방은 이 칸에 나오지 않아요. 여기서 바꿔도 매출 탭 묶음은 그대로예요.'
const WARN = '처방을 넣거나 뺀 묶음과 새로 만든 묶음은, 다시 불러온 뒤부터 숫자가 나와요. 이름과 순서만 바꾸면 바로 바뀌어요.'
const NO_CODES = '넣은 처방이 없어요'
const NO_MATCH = '맞는 처방이 없어요. 불러온 숫자에 있는 처방만 찾아요.'
const READING = '처방 목록을 더 읽는 중이에요'
const READ_FAILED = '전체 처방 목록을 읽지 못해 지금 보는 기간의 처방만 보여요.'
const KEPT = '고치던 내용은 이 화면에 그대로 있어요.'
const UNNAMED = '이 묶음'

// 묶음 안 처방 목록·옮긴 글·찾기 칸은 이름 칸 아래로 들여 쓴다. 휴대폰은 들여 쓰지 않는다(AC-1212.2)
const INDENT = 'ml-16 max-md:ml-0'
// ▲▼: 32px 네모, 휴대폰 44px
const ORDER_BUTTON = `${ds.button.ghostSmall} w-8 max-md:w-11`
const NAME_FIELD = `${ds.input} flex-1 font-semibold md:max-w-80`
// 글자 단추의 색만 바꾼다(같은 속성 클래스를 겹치지 않게, classes.ts 머리말)
const DELETE_BUTTON = `${ds.textButton.replace('text-accent ', 'text-negative ')} ml-auto min-h-8 max-md:col-start-2 max-md:ml-0 max-md:justify-self-start`
const PLAIN_BUTTON = `${ds.textButton.replace('text-accent ', 'text-ink-2 ')} min-h-8`
const ADD_CODE_BUTTON = `${ds.textButton} min-h-8`
const CLOSE_BUTTON = `min-h-11 cursor-pointer text-small font-medium text-ink-2 ${ds.focusRing}`
// 목록 줄은 층(overflow-clip) 안에 꽉 차서 초점 고리를 안쪽에 그린다(RxPickSearch와 같다)
const OPTION =
  'flex min-h-11 w-full cursor-pointer flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-1 text-left text-small text-ink not-disabled:hover:bg-canvas disabled:cursor-default focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent'

type Draft = { groups: readonly RxGroup[]; keys: readonly string[] }
type Part = 'up' | 'down' | 'name' | 'add' | 'search'

const byName = (a: RxLine, b: RxLine) => a.name.localeCompare(b.name, 'ko') || (codeKey(a.code) < codeKey(b.code) ? -1 : codeKey(a.code) > codeKey(b.code) ? 1 : 0)

/**
 * [저장] 때 걸리는 이름 칸 자리 모두. 규칙은 draftProblem과 같고(renameGroup, 앞뒤 빈칸 뗌, 겹치면 뒤쪽 칸) 맨 앞 자리가 draftProblem의 자리다.
 * 걸린 칸은 뒤 칸의 '겹침'을 보는 데 넣지 않는다
 */
function badFields(groups: readonly RxGroup[]): Set<number> {
  const bad = new Set<number>()
  const fine: RxGroup[] = []
  groups.forEach((group, index) => {
    const trimmed = { ...group, name: group.name.trim() }
    if (typeof renameGroup([...fine, trimmed], fine.length, trimmed.name) === 'string') bad.add(index)
    else fine.push(trimmed)
  })
  return bad
}

const swap = (list: readonly string[], a: number, b: number) => {
  const next = [...list]
  ;[next[a], next[b]] = [next[b], next[a]]
  return next
}

export function TreatmentGroupEditor({
  groups,
  lines,
  counts,
  periodName,
  catalogState,
  onOpenCatalog,
  onRetryCatalog,
  saving,
  saveFailed,
  onSave,
  onCancel,
}: TreatmentGroupEditorProps) {
  const [draft, setDraft] = useState<Draft>(() => ({ groups: [...groups], keys: groups.map((_, i) => `g${i}`) }))
  const nextKey = useRef(groups.length)
  const [open, setOpen] = useState<string | null>(null) // 찾기 목록이 열린 묶음 열쇠(한 번에 하나)
  const [query, setQuery] = useState('')
  const [moved, setMoved] = useState<Readonly<Record<string, string>>>({}) // 묶음 열쇠 → 옮긴 글
  const [tried, setTried] = useState(false) // [저장]을 한 번 눌렀다: 그 뒤로 이름 검사를 보인다
  const [tooMany, setTooMany] = useState(false)
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)
  const focusNext = useRef<string[] | null>(null) // 다음 그림 뒤 초점을 줄 자리(앞에서부터 있고 막히지 않은 것)
  const stateBefore = useRef(catalogState)
  const base = useId()

  const idOf = (key: string, part: Part) => `${base}-${key}-${part}`
  const removeId = (key: string, at: number) => `${base}-${key}-rm-${at}`
  const addGroupId = `${base}-add-group`
  const busy = saving || pending
  const { groups: rows, keys } = draft

  useEffect(() => {
    const wanted = focusNext.current
    if (!wanted) return
    focusNext.current = null
    for (const id of wanted) {
      const target = document.getElementById(id) as HTMLButtonElement | HTMLInputElement | null
      if (target && !target.disabled) {
        target.focus()
        return
      }
    }
  })

  // 새 숫자가 저장되면 찾기 목록 훅이 idle로 돌아간다. 열려 있으면 바로 다시 읽게 알린다(RxPickSearch와 같다)
  useEffect(() => {
    const before = stateBefore.current
    stateBefore.current = catalogState
    if (open !== null && catalogState === 'idle' && before !== 'idle') onOpenCatalog()
  }, [catalogState, open, onOpenCatalog])

  const sorted = useMemo(() => [...lines].sort(byName), [lines])
  const nameByKey = useMemo(() => new Map(lines.map((line) => [codeKey(line.code), line.name])), [lines])
  const problem = tried ? draftProblem(rows) : null
  const bad = useMemo(() => (tried ? badFields(rows) : new Set<number>()), [tried, rows])

  const shownName = (code: string) => nameByKey.get(codeKey(code))?.trim() || code
  const countOf = (code: string) => formatCount(counts.get(codeKey(code)) ?? 0)

  const change = (next: Draft, focus?: string[]) => {
    focusNext.current = focus ?? null
    setDraft(next)
  }

  const move = (index: number, step: -1 | 1) => {
    const key = keys[index]
    const [same, other]: Part[] = step === -1 ? ['up', 'down'] : ['down', 'up']
    change({ groups: moveGroup(rows, index, step), keys: swap(keys, index, index + step) }, [idOf(key, same), idOf(key, other)])
  }

  const deleteAt = (index: number) => {
    const nextKeys = keys.filter((_, i) => i !== index)
    if (open === keys[index]) setOpen(null)
    // 누른 단추가 함께 없어진다 → 그 자리에 올라온 묶음의 이름 칸, 끝이었으면 [+ 묶음 더하기]
    change({ groups: removeGroup(rows, index), keys: nextKeys }, [...(nextKeys[index] ? [idOf(nextKeys[index], 'name')] : []), addGroupId])
  }

  const dropCode = (index: number, code: string, at: number) => {
    const key = keys[index]
    change({ groups: removeCode(rows, index, code), keys }, [removeId(key, at), removeId(key, at - 1), idOf(key, 'search'), idOf(key, 'add')])
  }

  const addGroup = () => {
    const next = addBlankGroup(rows)
    if (next === 'tooMany') {
      setTooMany(true)
      return
    }
    setTooMany(false)
    const key = `g${nextKey.current++}`
    change({ groups: next, keys: [...keys, key] }, [idOf(key, 'name')])
  }

  const openAdder = (key: string) => {
    focusNext.current = [idOf(key, 'search')]
    setOpen(key)
    setQuery('')
    onOpenCatalog()
  }

  const closeAdder = () => {
    if (open === null) return
    focusNext.current = [idOf(open, 'add')]
    setOpen(null)
  }

  const pick = (index: number, code: string) => {
    const key = keys[index]
    const result = pickCode(rows, index, code)
    const from = result.from
    if (from !== null) setMoved((now) => ({ ...now, [key]: movedNote(code, from) }))
    change({ groups: result.groups, keys }, [idOf(key, 'search')])
  }

  const onPickerKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    closeAdder()
  }

  async function submit() {
    if (busy || inFlight.current) return
    setTried(true)
    const found = draftProblem(rows)
    if (found) {
      document.getElementById(idOf(keys[found.index], 'name'))?.focus()
      return
    }
    inFlight.current = true
    setPending(true)
    try {
      await onSave(forSave(rows))
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  function picker(index: number, key: string) {
    const found = searchCatalog(sorted, query)
    return (
      <div className="mt-1 max-w-105 max-md:max-w-none" onKeyDown={onPickerKey}>
        <input
          id={idOf(key, 'search')}
          type="text"
          aria-label="넣을 처방 찾기"
          placeholder="처방 이름이나 코드로 찾기"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={ds.input}
        />
        <div className={`${ds.layer} mt-1 overflow-clip`}>
          <ul aria-label="찾은 처방" className="max-h-62 overflow-y-auto">
            {found.map((line) => {
              const owner = ownerOf(rows, line.code)
              const here = owner === index
              const name = line.name.trim() || line.code
              return (
                <li key={codeKey(line.code)}>
                  <button type="button" disabled={here} onClick={() => pick(index, line.code)} className={OPTION}>
                    <span className="min-w-0 flex-1 wrap-anywhere">
                      {name}
                      {name !== line.code && <span className="ml-1.5 text-caption text-muted">{line.code}</span>}
                    </span>
                    {here ? (
                      <span className="shrink-0 text-caption font-medium text-accent-strong">이 묶음에 있음</span>
                    ) : (
                      <span className="shrink-0 text-caption tabular-nums text-muted">{`${countOf(line.code)}건`}</span>
                    )}
                    {owner >= 0 && !here && <span className="basis-full text-caption text-warning">{`${groupLabel(rows[owner])}에 있어요. 고르면 이 묶음으로 옮겨요`}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
          {found.length === 0 && (
            <p role="status" className="p-3 text-small text-ink-2">
              {NO_MATCH}
            </p>
          )}
          {catalogState === 'reading' && (
            <p role="status" className="px-3 py-2 text-small text-ink-2">
              {READING}
            </p>
          )}
          {catalogState === 'failed' && (
            <div className="flex flex-wrap items-center gap-2 px-3 py-2">
              <p className="min-w-0 flex-1 text-small text-ink-2">{READ_FAILED}</p>
              <button
                type="button"
                onClick={() => {
                  onRetryCatalog()
                  document.getElementById(idOf(key, 'search'))?.focus() // 이 단추는 곧 사라진다
                }}
                className={ds.button.secondarySmall}
              >
                다시 읽기
              </button>
            </div>
          )}
          <div className="flex justify-end border-t border-line px-3">
            <button type="button" onClick={closeAdder} className={CLOSE_BUTTON}>
              닫기
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <p className="mt-2 max-w-182 text-small text-ink-2">{INTRO}</p>

      <ol className="mt-4 border-t border-line">
        {rows.map((group, index) => {
          const key = keys[index]
          const label = group.name.trim() || UNNAMED
          return (
            <li key={key} className="border-b border-line py-3">
              <div className="flex items-center gap-2 max-md:grid max-md:grid-cols-[auto_minmax(0,1fr)] max-md:gap-y-1">
                <span className="flex shrink-0">
                  <button type="button" id={idOf(key, 'up')} aria-label={`${label} 위로`} disabled={index === 0} onClick={() => move(index, -1)} className={ORDER_BUTTON}>
                    <Icon name="chev" className="rotate-180" />
                  </button>
                  <button type="button" id={idOf(key, 'down')} aria-label={`${label} 아래로`} disabled={index === rows.length - 1} onClick={() => move(index, 1)} className={ORDER_BUTTON}>
                    <Icon name="chev" />
                  </button>
                </span>
                <input
                  id={idOf(key, 'name')}
                  type="text"
                  aria-label="묶음 이름"
                  placeholder="묶음 이름"
                  autoComplete="off"
                  value={group.name}
                  aria-invalid={bad.has(index) || undefined}
                  onChange={(event) => change({ groups: setName(rows, index, event.target.value), keys })}
                  className={NAME_FIELD}
                />
                <button type="button" onClick={() => deleteAt(index)} className={DELETE_BUTTON}>
                  묶음 지우기
                </button>
              </div>

              {group.codes.length === 0 ? (
                <p className={`${INDENT} mt-1 flex min-h-9 items-center text-small text-muted`}>{NO_CODES}</p>
              ) : (
                <ul className={`${INDENT} mt-1`}>
                  {group.codes.map((code, at) => {
                    const name = shownName(code)
                    return (
                      <li key={code} className="flex min-h-9 flex-wrap items-center gap-x-2 border-t border-dashed border-line text-small first:border-t-0">
                        <span className="min-w-0 wrap-anywhere font-medium text-ink">{name}</span>
                        {name !== code && <span className="text-caption text-muted">{code}</span>}
                        <span className="ml-auto text-caption tabular-nums text-muted">{`${periodName} ${countOf(code)}건`}</span>
                        <button type="button" id={removeId(key, at)} onClick={() => dropCode(index, code, at)} className={PLAIN_BUTTON}>
                          빼기
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}

              {moved[key] && <p className={`${INDENT} mt-1 text-caption text-warning`}>{moved[key]}</p>}

              <div className={`${INDENT} mt-1`}>
                {open === key ? (
                  picker(index, key)
                ) : (
                  <button type="button" id={idOf(key, 'add')} onClick={() => openAdder(key)} className={ADD_CODE_BUTTON}>
                    + 처방 넣기
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <button type="button" id={addGroupId} onClick={addGroup} className={ds.button.secondarySmall}>
          + 묶음 더하기
        </button>
        {tooMany && rows.length >= RX_GROUPS_MAX && (
          <p role="alert" className={ds.fieldError}>
            {TOO_MANY_GROUPS}
          </p>
        )}
      </div>

      <p className="mt-3 max-w-182 text-small text-warning">{WARN}</p>

      {saveFailed && (
        <div className="mt-4 flex flex-col gap-2">
          <ErrorCard code="E-STATS-GROUP-SAVE-FAILED" />
          <p className="text-small text-ink-2">{KEPT}</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        {problem && (
          <p role="alert" className="min-w-0 flex-1 text-small text-negative">
            {problem.message}
          </p>
        )}
        <div className="ml-auto flex gap-2 max-md:ml-0 max-md:w-full">
          <button type="button" disabled={busy} onClick={onCancel} className={`${ds.button.secondary} max-md:flex-1`}>
            그만두기
          </button>
          <button type="button" aria-busy={busy || undefined} onClick={() => void submit()} className={`${ds.button.primary} max-md:flex-1`}>
            {busy ? '저장하는 중' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

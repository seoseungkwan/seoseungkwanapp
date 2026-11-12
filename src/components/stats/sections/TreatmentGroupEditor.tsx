'use client'

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { formatCount } from '@/components/charts/format'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { searchCatalog } from '@/components/stats/rxPickView'
import {
  addBlankGroup,
  addCond,
  draftProblem,
  forSave,
  groupLabel,
  moveGroup,
  movedNote,
  outNote,
  ownerOf,
  pickCode,
  pickOut,
  pickOutGroup,
  removeCode,
  removeCond,
  removeGroup,
  removeOut,
  setName,
  TOO_MANY_GROUPS,
} from '@/components/stats/treatmentEdit'
import { groupCond, groupOut } from '@/components/stats/treatmentView'
import { codeKey, type RxLine } from '@/components/stats/view'
import { ds } from '@/components/ui/classes'
import { renameGroup } from '@/lib/revenue/treatments'
import { RX_GROUPS_MAX, type RxGroup, type StatsRxGroup } from '@/types/rxGroups'

// 처방별 추세 묶음 고치기 화면 (spec treatment-trend TASK-10, REQ-1210·REQ-1212, 시안 docs/mockups/treatment-trend renderEdit()).
// group-exclude TASK-14(REQ-3711, 시안 docs/mockups/group-exclude renderEdit()·?s=edit): 묶음마다 넣는 처방·빼는 처방 두 칸, 넣는 처방마다 조건 칸,
// 찾기 칸 셋(넣을 처방·뺄 처방·조건 처방, 화면에 하나만 열림), 빼는 처방 묶음째 고르기. 고치기 규칙은 treatmentEdit 함수만 쓴다.
// props만 받는다: 저장·읽기는 부르는 쪽(TreatmentTrendSection·묶음 훅·찾기 목록 훅)이 한다. 고치는 초안·열린 찾기 목록은 이 안의 React 상태에만 있고 [저장] 때 onSave를 한 번 부른다.
// 칸 제목('처방별 추세 · 묶음 고치기')·돌아가기·초점 돌려주기·저장 글은 부르는 쪽이 그린다. 처방 이름·코드·건수만 다루고 환자 자료는 없다.
// 시안에서 바꾼 곳(design.md '시안과 다른 곳'): 들여쓰기 72px → 64px(간격 단계), 휴대폰 이름 칸 옆 80px → 96px(▲▼ 두 칸 + 사이), 입력은 ds.input이라 PC에서도 44px,
// 두 칸 위 10px → 8·12px(간격 단계), 조건 칸은 휴대폰에서 들여 쓰지 않는다(AC-3711.14)

export type CatalogState = 'idle' | 'reading' | 'ready' | 'failed'

export type TreatmentGroupEditorProps = {
  /** 고치기를 열 때의 묶음(sortOrder 차례). 처음 그릴 때만 초안으로 옮기고 그 뒤에 바뀌어도 따라가지 않는다 */
  groups: readonly StatsRxGroup[]
  /** 찾기 목록 줄(rxCatalog: 넓은 범위 + 화면의 일 숫자 + 묶음에 든 넣는 처방·빼는 처방·조건 처방, 코드 대소문자 합침). 묶음 안 처방 이름도 여기서 찾는다 */
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
  /** forSave 값(앞뒤 빈칸 뗀 이름, sortOrder 0부터, 빼는 처방·조건이 있으면 out·cond)으로 한 번 부른다. 성공하면 부르는 쪽이 이 화면을 닫는다 */
  onSave: (after: StatsRxGroup[]) => Promise<boolean>
  /** [그만두기]: 초안을 버리고 닫는다. 저장을 부르지 않는다 */
  onCancel: () => void
}

const INTRO =
  '묶음 이름을 짓고, 넣을 처방을 고르세요. 처방 하나는 한 묶음에만 들어가요. 넣는 처방마다 [조건 더하기]로 같이 받으면 안 세는 처방을 정할 수 있어요. 빼는 처방을 고르면, 그날 그 처방을 하나라도 받은 환자는 이 묶음에서 빠져요. 여기서 바꿔도 매출 탭 묶음은 그대로예요.'
const WARN = '넣는 처방·빼는 처방·조건을 바꾼 묶음과 새로 만든 묶음은, 다시 불러온 뒤부터 숫자가 나와요. 이름과 순서만 바꾸면 바로 바뀌어요.'
const IN_TITLE = '넣는 처방'
const IN_HINT = '그날 이 중 하나라도 받으면 1건'
const OUT_TITLE = '빼는 처방'
const OUT_HINT = '그날 이 중 하나라도 받은 환자는 빼요 · 충격파·도수뿐 아니라 주사·약·촬영 등 어떤 처방이든 골라요 · 없어도 돼요'
const NO_CODES = '넣은 처방이 없어요'
const NO_OUT = '빼는 처방이 없어요'
const NO_COND = '아직 고른 처방이 없어요'
const COND_HINT = '(그날 다른 넣는 처방을 받았으면 그걸로 1건)'
const WHOLE = '묶음째 고르기 · 누르면 그 묶음 처방이 한 번에 빼는 처방에 들어가요'
const NO_MATCH = '맞는 처방이 없어요. 불러온 숫자에 있는 처방만 찾아요.'
const READING = '처방 목록을 더 읽는 중이에요'
const READ_FAILED = '전체 처방 목록을 읽지 못해 지금 보는 기간의 처방만 보여요.'
const KEPT = '고치던 내용은 이 화면에 그대로 있어요.'
const UNNAMED = '이 묶음'
const SEARCH_LABEL: Record<'in' | 'out', string> = { in: '넣을 처방 찾기', out: '뺄 처방 찾기' }
const condSearchLabel = (code: string) => `${code}와 같이 받으면 안 셀 처방 찾기`
const condTitle = (code: string) => `조건 · ${code}은(는) 아래 처방과 같은 날 받으면 세지 않아요`

// 묶음 안 두 칸 제목·처방 목록·빈 글·옮긴 글·찾기 칸은 이름 칸 아래로 들여 쓴다. 휴대폰은 들여 쓰지 않는다(AC-1212.2·AC-3711.14)
const INDENT = 'ml-16 max-md:ml-0'
// ▲▼: 32px 네모, 휴대폰 44px
const ORDER_BUTTON = `${ds.button.ghostSmall} w-8 max-md:w-11`
const NAME_FIELD = `${ds.input} flex-1 font-semibold md:max-w-80`
// 글자 단추의 색만 바꾼다(같은 속성 클래스를 겹치지 않게, classes.ts 머리말). 휴대폰은 ds.textButton이 44px(max-md:min-h-11)
const DELETE_BUTTON = `${ds.textButton.replace('text-accent ', 'text-negative ')} ml-auto min-h-8 max-md:col-start-2 max-md:ml-0 max-md:justify-self-start`
const PLAIN_BUTTON = `${ds.textButton.replace('text-accent ', 'text-ink-2 ')} min-h-8`
const ADD_CODE_BUTTON = `${ds.textButton} min-h-8`
const CLOSE_BUTTON = `min-h-11 cursor-pointer text-small font-medium text-ink-2 ${ds.focusRing}`
// 두 칸 제목: 이름 옆에 보통 굵기 muted 설명(시안 .part-title)
const PART_TITLE = 'flex flex-wrap items-baseline gap-x-2 text-small font-semibold'
const PART_HINT = 'font-normal text-muted'
const CODE_ROW = 'flex min-h-9 flex-wrap items-center gap-x-2 border-t border-dashed border-line text-small first:border-t-0'
const EMPTY_LINE = 'flex min-h-9 items-center text-small text-muted'
const COUNT = 'ml-auto text-caption tabular-nums text-muted'
// 조건 칸: 그 처방 줄 아래 한 줄 전체, 왼쪽 2px warning 선 + warning-soft 바탕(테두리 상자가 아니라 상자 안 상자가 되지 않는다). 휴대폰은 들여 쓰지 않는다
const COND_BOX = 'mb-2 ml-4 min-w-0 basis-full border-l-2 border-warning bg-warning-soft px-3 py-2 max-md:ml-0'
const COND_ROW = 'flex min-h-8 flex-wrap items-center gap-x-1.5 text-small'
// 묶음째 고르기: 찾기 층 안 맨 위 줄, 아래 1px line(design.md '화면')
const WHOLE_ROW = 'flex flex-wrap items-center gap-1.5 border-b border-line bg-canvas px-3 py-2'
// 목록 줄은 층(overflow-clip) 안에 꽉 차서 초점 고리를 안쪽에 그린다(RxPickSearch와 같다)
const OPTION =
  'flex min-h-11 w-full cursor-pointer flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-1 text-left text-small text-ink not-disabled:hover:bg-canvas disabled:cursor-default focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent'
// 막힌 찾기 줄의 표시: 그 칸에 이미 있으면 accent-strong, 다른 칸에 있거나 자기 자신이면 muted
const TAG_HERE = 'shrink-0 text-caption font-medium text-accent-strong'
const TAG_ELSEWHERE = 'shrink-0 text-caption font-medium text-muted'

type Draft = { groups: readonly StatsRxGroup[]; keys: readonly string[] }
type Part = 'up' | 'down' | 'name' | 'add' | 'search' | 'add-out' | 'search-out'
// 열린 찾기 칸(화면에 하나): 넣을 처방·뺄 처방은 묶음마다, 조건 처방은 넣는 처방 code마다
type Picker = { key: string; kind: 'in' } | { key: string; kind: 'out' } | { key: string; kind: 'cond'; code: string }

const byName = (a: RxLine, b: RxLine) => a.name.localeCompare(b.name, 'ko') || (codeKey(a.code) < codeKey(b.code) ? -1 : codeKey(a.code) > codeKey(b.code) ? 1 : 0)
const sameCode = (a: string, b: string) => codeKey(a) === codeKey(b)
const hasCode = (codes: readonly string[], code: string) => codes.some((c) => sameCode(c, code))
// 넣는 처방 code의 조건 처방(없으면 빈 목록)
const condOf = (group: StatsRxGroup, code: string) => groupCond(group).find((item) => sameCode(item.code, code))?.unless ?? []

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
  const [open, setOpen] = useState<Picker | null>(null) // 열린 찾기 칸(한 번에 하나)
  const [query, setQuery] = useState('')
  const [moved, setMoved] = useState<Readonly<Record<string, string>>>({}) // 묶음 열쇠 → 옮긴 글
  const [outNotes, setOutNotes] = useState<Readonly<Record<string, string>>>({}) // 묶음 열쇠 → 묶음째 고르기 글
  const [tried, setTried] = useState(false) // [저장]을 한 번 눌렀다: 그 뒤로 이름 검사를 보인다
  const [tooMany, setTooMany] = useState(false)
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)
  const focusNext = useRef<string[] | null>(null) // 다음 그림 뒤 초점을 줄 자리(앞에서부터 있고 막히지 않은 것)
  const stateBefore = useRef(catalogState)
  const base = useId()

  // id 규칙: {base}-{묶음 열쇠}-{자리}. at = 넣는 처방(또는 빼는 처방) 줄 자리, n = 조건 처방 줄 자리
  const idOf = (key: string, part: Part) => `${base}-${key}-${part}`
  const removeId = (key: string, at: number) => `${base}-${key}-rm-${at}`
  const outRemoveId = (key: string, at: number) => `${base}-${key}-rm-out-${at}`
  // [조건 더하기]와 조건 칸의 [+ 처방 고르기]는 함께 보이지 않아 같은 id를 쓴다: 찾기 칸을 닫으면 남은 쪽으로 초점이 간다(AC-3711.11)
  const condAddId = (key: string, at: number) => `${base}-${key}-cadd-${at}`
  const condSearchId = (key: string, at: number) => `${base}-${key}-search-cond-${at}`
  const condRemoveId = (key: string, at: number, n: number) => `${base}-${key}-crm-${at}-${n}`
  const addGroupId = `${base}-add-group`
  const busy = saving || pending
  const { groups: rows, keys } = draft

  // 찾기 칸의 입력 칸 id와 그 칸을 여는 단추 id
  const codeAt = (target: Extract<Picker, { kind: 'cond' }>) => rows[keys.indexOf(target.key)]?.codes.findIndex((c) => sameCode(c, target.code)) ?? -1
  const searchIdOf = (target: Picker) =>
    target.kind === 'in' ? idOf(target.key, 'search') : target.kind === 'out' ? idOf(target.key, 'search-out') : condSearchId(target.key, codeAt(target))
  const openerIdOf = (target: Picker) =>
    target.kind === 'in' ? idOf(target.key, 'add') : target.kind === 'out' ? idOf(target.key, 'add-out') : condAddId(target.key, codeAt(target))
  const isOpen = (key: string, kind: Picker['kind'], code?: string) =>
    open !== null && open.key === key && open.kind === kind && (open.kind !== 'cond' || (code !== undefined && sameCode(open.code, code)))

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
    if (open?.key === keys[index]) setOpen(null)
    // 누른 단추가 함께 없어진다 → 그 자리에 올라온 묶음의 이름 칸, 끝이었으면 [+ 묶음 더하기]
    change({ groups: removeGroup(rows, index), keys: nextKeys }, [...(nextKeys[index] ? [idOf(nextKeys[index], 'name')] : []), addGroupId])
  }

  // [지우기] 뒤 초점(AC-3711.12): 같은 목록의 다음 줄(지운 자리로 올라온 줄) [지우기], 앞 줄 [지우기], 열린 찾기 칸, 그 목록의 더하기 단추 차례
  const dropCode = (index: number, code: string, at: number) => {
    const key = keys[index]
    if (isOpen(key, 'cond', code)) setOpen(null) // 지운 처방의 조건 칸은 함께 없어진다
    change({ groups: removeCode(rows, index, code), keys }, [removeId(key, at), removeId(key, at - 1), idOf(key, 'search'), idOf(key, 'add')])
  }

  const dropOut = (index: number, code: string, at: number) => {
    const key = keys[index]
    change({ groups: removeOut(rows, index, code), keys }, [outRemoveId(key, at), outRemoveId(key, at - 1), idOf(key, 'search-out'), idOf(key, 'add-out')])
  }

  // 조건 처방을 다 지워 조건 칸이 없어지면 그 처방의 [조건 더하기](같은 id)로 간다
  const dropCond = (index: number, code: string, unless: string, at: number, n: number) => {
    const key = keys[index]
    change({ groups: removeCond(rows, index, code, unless), keys }, [
      condRemoveId(key, at, n),
      condRemoveId(key, at, n - 1),
      condSearchId(key, at),
      condAddId(key, at),
    ])
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

  const openPicker = (target: Picker) => {
    focusNext.current = [searchIdOf(target)]
    setOpen(target)
    setQuery('')
    onOpenCatalog()
  }

  // Esc·[닫기]: 그 칸을 연 단추로 초점을 돌려준다(AC-1210.7·AC-3711.11)
  const closeAdder = () => {
    if (open === null) return
    focusNext.current = [openerIdOf(open)]
    setOpen(null)
  }

  // 찾기 줄을 누름: 찾기 칸은 열린 채이고 초점은 찾기 칸이다
  const choose = (index: number, target: Picker, code: string) => {
    const key = keys[index]
    if (target.kind === 'in') {
      const result = pickCode(rows, index, code)
      const from = result.from
      if (from !== null) setMoved((now) => ({ ...now, [key]: movedNote(code, from) }))
      change({ groups: result.groups, keys }, [searchIdOf(target)])
    } else if (target.kind === 'out') {
      change({ groups: pickOut(rows, index, code), keys }, [searchIdOf(target)])
    } else {
      change({ groups: addCond(rows, index, target.code, code), keys }, [searchIdOf(target)])
    }
  }

  // 묶음째 고르기(AC-3711.7): 그 묶음 넣는 처방을 복사해 넣고 이 묶음 아래에 글을 둔다
  const pickWhole = (index: number, from: number) => {
    const key = keys[index]
    const result = pickOutGroup(rows, index, from)
    setOutNotes((now) => ({ ...now, [key]: outNote(groupLabel(rows[from]), result.added) }))
    change({ groups: result.groups, keys }, [idOf(key, 'search-out')])
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

  // 처방 이름(없으면 코드)과 코드. 줄의 맨 앞 칸이 이름이다
  const nameAndCode = (code: string) => {
    const name = shownName(code)
    return (
      <>
        <span className="min-w-0 wrap-anywhere font-medium text-ink">{name}</span>
        {name !== code && <span className="text-caption text-muted">{code}</span>}
      </>
    )
  }

  // 찾기 줄 하나. 막힌 줄은 표시(tag), 고를 수 있는 줄은 건수와 덧붙임 글(note)
  function optionRow(index: number, target: Picker, line: RxLine) {
    const group = rows[index]
    const owner = ownerOf(rows, line.code)
    const name = line.name.trim() || line.code
    const inOut = hasCode(groupOut(group), line.code)
    let tag: { text: string; here: boolean } | null = null
    let note: { text: string; warn: boolean } | null = null
    if (target.kind === 'in') {
      // AC-1210.5·1210.6·3711.9
      if (owner === index) tag = { text: '이 묶음에 있음', here: true }
      else if (inOut) tag = { text: '빼는 처방에 있음', here: false }
      else if (owner >= 0) note = { text: `${groupLabel(rows[owner])}에 있어요. 고르면 이 묶음으로 옮겨요`, warn: true }
    } else if (target.kind === 'out') {
      // AC-3711.8: 다른 묶음 넣는 처방은 옮기지 않는다
      if (inOut) tag = { text: '빼는 처방에 있음', here: true }
      else if (owner === index) tag = { text: '넣는 처방에 있음', here: false }
      else if (owner >= 0) note = { text: `${groupLabel(rows[owner])} 묶음 처방이에요. 골라도 그 묶음은 그대로예요`, warn: false }
    } else if (sameCode(line.code, target.code)) {
      tag = { text: '이 처방', here: false } // AC-3711.5
    } else if (hasCode(condOf(group, target.code), line.code)) {
      tag = { text: '조건에 있음', here: true }
    }
    return (
      <li key={codeKey(line.code)}>
        <button type="button" disabled={tag !== null} onClick={() => choose(index, target, line.code)} className={OPTION}>
          <span className="min-w-0 flex-1 wrap-anywhere">
            {name}
            {name !== line.code && <span className="ml-1.5 text-caption text-muted">{line.code}</span>}
          </span>
          {tag ? (
            <span className={tag.here ? TAG_HERE : TAG_ELSEWHERE}>{tag.text}</span>
          ) : (
            <span className="shrink-0 text-caption tabular-nums text-muted">{`${countOf(line.code)}건`}</span>
          )}
          {note && <span className={note.warn ? 'basis-full text-caption text-warning' : 'basis-full text-caption text-muted'}>{note.text}</span>}
        </button>
      </li>
    )
  }

  function picker(index: number, target: Picker) {
    const found = searchCatalog(sorted, query)
    const searchId = searchIdOf(target)
    // 묶음째 고르기는 빼는 처방 찾기 칸에만, 처방이 든 다른 묶음마다(AC-3711.7)
    const others = target.kind === 'out' ? rows.flatMap((other, at) => (at !== index && other.codes.length > 0 ? [{ other, at }] : [])) : []
    return (
      <div className="mt-1 max-w-105 max-md:max-w-none" onKeyDown={onPickerKey}>
        <input
          id={searchId}
          type="text"
          aria-label={target.kind === 'cond' ? condSearchLabel(target.code) : SEARCH_LABEL[target.kind]}
          placeholder="처방 이름이나 코드로 찾기"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={ds.input}
        />
        <div className={`${ds.layer} mt-1 overflow-clip`}>
          {others.length > 0 && (
            <div className={WHOLE_ROW}>
              <p className="basis-full text-caption text-ink-2">{WHOLE}</p>
              {others.map(({ other, at }) => (
                <button key={keys[at]} type="button" onClick={() => pickWhole(index, at)} className={ds.button.secondarySmall}>
                  {`${groupLabel(other)} (${other.codes.length}개)`}
                </button>
              ))}
            </div>
          )}
          <ul aria-label="찾은 처방" className="max-h-62 list-none overflow-y-auto">
            {found.map((line) => optionRow(index, target, line))}
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
                  document.getElementById(searchId)?.focus() // 이 단추는 곧 사라진다
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

  // 넣는 처방 code 줄 아래 조건 칸(AC-3711.4). 조건이 있거나 그 처방의 조건 찾기 칸이 열렸을 때만 그린다
  function condBox(index: number, key: string, code: string, at: number, unless: readonly string[]) {
    const target: Picker = { key, kind: 'cond', code }
    return (
      <div className={COND_BOX}>
        <p className="text-caption font-semibold text-warning">
          {condTitle(code)}
          {' '}
          <span className="font-normal text-ink-2">{COND_HINT}</span>
        </p>
        {unless.length === 0 ? (
          <p className="flex min-h-8 items-center text-small text-muted">{NO_COND}</p>
        ) : (
          <ul aria-label={`${code} 조건 처방`} className="list-none">
            {unless.map((other, n) => (
              <li key={other} className={COND_ROW}>
                {nameAndCode(other)}
                <button type="button" id={condRemoveId(key, at, n)} onClick={() => dropCond(index, code, other, at, n)} className={`${PLAIN_BUTTON} ml-auto`}>
                  지우기
                </button>
              </li>
            ))}
          </ul>
        )}
        {isOpen(key, 'cond', code) ? (
          picker(index, target)
        ) : (
          <button type="button" id={condAddId(key, at)} onClick={() => openPicker(target)} className={ADD_CODE_BUTTON}>
            + 처방 고르기
          </button>
        )}
      </div>
    )
  }

  return (
    <div>
      <p className="mt-2 max-w-182 text-small text-ink-2">{INTRO}</p>

      <ol className="mt-4 list-none border-t border-line">
        {rows.map((group, index) => {
          const key = keys[index]
          const label = group.name.trim() || UNNAMED
          const out = groupOut(group)
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

              {/* 넣는 처방(AC-3711.2·3711.3) */}
              <p className={`${INDENT} mt-2 ${PART_TITLE} text-ink-2`}>
                <span>{IN_TITLE}</span>
                <span className={PART_HINT}>{IN_HINT}</span>
              </p>
              {group.codes.length === 0 ? (
                <p className={`${INDENT} mt-1 ${EMPTY_LINE}`}>{NO_CODES}</p>
              ) : (
                <ul aria-label={IN_TITLE} className={`${INDENT} mt-1 list-none`}>
                  {group.codes.map((code, at) => {
                    const unless = condOf(group, code)
                    const showCond = unless.length > 0 || isOpen(key, 'cond', code)
                    return (
                      <li key={code} className={CODE_ROW}>
                        {nameAndCode(code)}
                        <span className={COUNT}>{`${periodName} ${countOf(code)}건`}</span>
                        {!showCond && (
                          <button type="button" id={condAddId(key, at)} onClick={() => openPicker({ key, kind: 'cond', code })} className={ADD_CODE_BUTTON}>
                            조건 더하기
                          </button>
                        )}
                        <button type="button" id={removeId(key, at)} onClick={() => dropCode(index, code, at)} className={PLAIN_BUTTON}>
                          지우기
                        </button>
                        {showCond && condBox(index, key, code, at, unless)}
                      </li>
                    )
                  })}
                </ul>
              )}

              {moved[key] && <p className={`${INDENT} mt-1 text-caption text-warning`}>{moved[key]}</p>}

              <div className={`${INDENT} mt-1`}>
                {isOpen(key, 'in') ? (
                  picker(index, { key, kind: 'in' })
                ) : (
                  <button type="button" id={idOf(key, 'add')} onClick={() => openPicker({ key, kind: 'in' })} className={ADD_CODE_BUTTON}>
                    + 처방 넣기
                  </button>
                )}
              </div>

              {/* 빼는 처방(AC-3711.2·3711.6) */}
              <p className={`${INDENT} mt-3 ${PART_TITLE} text-negative`}>
                <span>{OUT_TITLE}</span>
                <span className={PART_HINT}>{OUT_HINT}</span>
              </p>
              {out.length === 0 ? (
                <p className={`${INDENT} mt-1 ${EMPTY_LINE}`}>{NO_OUT}</p>
              ) : (
                <ul aria-label={OUT_TITLE} className={`${INDENT} mt-1 list-none`}>
                  {out.map((code, at) => (
                    <li key={code} className={CODE_ROW}>
                      {nameAndCode(code)}
                      <span className={COUNT}>{`${periodName} ${countOf(code)}건`}</span>
                      <button type="button" id={outRemoveId(key, at)} onClick={() => dropOut(index, code, at)} className={PLAIN_BUTTON}>
                        지우기
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {outNotes[key] && <p className={`${INDENT} mt-1 text-caption text-warning`}>{outNotes[key]}</p>}

              <div className={`${INDENT} mt-1`}>
                {isOpen(key, 'out') ? (
                  picker(index, { key, kind: 'out' })
                ) : (
                  <button type="button" id={idOf(key, 'add-out')} onClick={() => openPicker({ key, kind: 'out' })} className={ADD_CODE_BUTTON}>
                    + 빼는 처방 고르기
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

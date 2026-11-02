'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import { deleteGroup, moveCode, suggestGroups, type GroupEditError } from '@/lib/revenue/treatments'
import { RxGroupStoreError } from '@/lib/storage/rxGroups'
import type { ErrorCode } from '@/types/errors'
import type { RxGroup } from '@/types/rxGroups'
import { formatManWon } from '../money'
import { Note, PageTitle } from '../RevenueParts'
import { DeleteGroupDialog } from './DeleteGroupDialog'
import type { KnownCode } from './known'
import { addNewGroup, checkNames, NAME_REASON } from './names'

// 치료 묶음 고치기 (TASK-14, REQ-014, 시안 gen.py group_editor(), design.md 9절). 고치는 중인 목록은 이 화면에만 있고 저장은 [저장]을 누를 때 save 한 번이다.
// 서버 표만 쓰므로 폰·연결 안 된 PC에서도 된다. 처방 코드·이름·금액 합계만 다루고 환자 자료는 없다.
// 시안에서 바꾼 곳: 입력은 ds.input이라 PC에서도 44px이다. 이름 칸에 maxlength가 없다(자르면 30자 넘을 때의 이유 글이 나올 수 없다)

const SAVE_FAILED: ErrorCode = 'E-REVENUE-GROUP-SAVE-FAILED'
const NO_GROUP = ''
const DASH = '–'
const CHIP = '제안 묶음 · 아직 저장 안 함'
const INTRO = "묶음 이름을 짓고, 묶음에 넣을 처방을 고르세요. 처방 하나는 한 묶음에만 들어가요. 어느 묶음에도 없는 처방은 '그 밖 처방'으로 세요."
const INTRO_SUGGESTED = '처음에는 지금 쓰시는 일일 보고의 다섯 가지로 채워 두었어요.'
const REST_NOTE = '최근 13달 동안 비트에서 나온 처방만 보여요. 처방 이름과 코드만 쓰고, 환자 정보는 없어요.'

const BAR = 'flex min-h-8 items-center justify-between gap-3 border-b border-line-strong pb-2'
const BAR_TITLE = 'text-lead font-semibold text-ink'
const SELECT = `h-8 w-full cursor-pointer rounded-control border border-line-strong bg-surface px-2 text-small text-ink ${ds.focusRing} max-md:h-11 max-md:text-lead`
// 시안의 빨간 글자만 단추. 같은 속성 클래스를 겹치면 어느 쪽이 이길지 모르므로 글자색 하나를 바꿔 쓴다(classes.ts 머리말)
const DELETE_BUTTON = ds.button.ghostSmall.replace('text-ink-2', 'text-negative')

const monthName = (month: string) => `${Number(month.slice(5, 7))}월`

type MoveProps = { names: string[]; at: number | null; onMove(to: number | null): void }

function MoveSelect({ names, at, onMove }: MoveProps) {
  return (
    <select aria-label="옮길 묶음" className={SELECT} value={at === null ? NO_GROUP : String(at)} onChange={(event) => onMove(event.target.value === NO_GROUP ? null : Number(event.target.value))}>
      {names.map((name, index) => (
        <option key={index} value={index}>
          {name}
        </option>
      ))}
      <option value={NO_GROUP}>묶음 없음</option>
    </select>
  )
}

const CODE_ROW = 'flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2 text-small last:border-b-0 md:flex-nowrap md:py-0'

type GroupBlockProps = {
  group: RxGroup
  fieldId: string
  error: GroupEditError | null
  names: string[]
  index: number
  known: ReadonlyMap<string, KnownCode>
  monthLabel: string
  onRename(name: string): void
  onDelete(): void
  onMove(code: string, to: number | null): void
}

function GroupBlock({ group, fieldId, error, names, index, known, monthLabel, onRename, onDelete, onMove }: GroupBlockProps) {
  const reasonId = `${fieldId}-reason`
  return (
    <section className="border-b border-line pt-4 pb-2">
      <div className="flex items-center gap-3">
        <label className="min-w-0 flex-1">
          <span className="sr-only">묶음 이름</span>
          <input id={fieldId} className={ds.input} value={group.name} aria-invalid={error ? true : undefined} aria-describedby={error ? reasonId : undefined} onChange={(event) => onRename(event.target.value)} />
        </label>
        <span className="whitespace-nowrap text-small text-muted">{`처방 ${group.codes.length}개`}</span>
        <button type="button" className={DELETE_BUTTON} onClick={onDelete}>
          묶음 지우기
        </button>
      </div>
      {error && (
        <p id={reasonId} className={`mt-1.5 ${ds.fieldError}`}>
          {NAME_REASON[error]}
        </p>
      )}
      {group.codes.length > 0 && (
        <ul className="mt-1">
          {group.codes.map((code) => {
            const item = known.get(code)
            const amount = item?.amount ?? null
            return (
              <li key={code} className={CODE_ROW}>
                <span className="w-14 shrink-0 break-all text-muted md:w-18">{code}</span>
                <span className="min-w-0 flex-1 text-ink">{item?.name ?? DASH}</span>
                <span className="whitespace-nowrap text-muted max-md:hidden">{`${monthLabel} ${amount === null ? DASH : formatManWon(amount)}`}</span>
                <span className="w-full md:w-42 md:shrink-0">
                  <MoveSelect names={names} at={index} onMove={(to) => onMove(code, to)} />
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

type RestProps = { rest: KnownCode[]; names: string[]; onMove(code: string, to: number | null): void }

function RestCodes({ rest, names, onMove }: RestProps) {
  const [query, setQuery] = useState('')
  const wanted = query.trim().toLowerCase()
  const shown = wanted === '' ? rest : rest.filter((item) => item.code.toLowerCase().includes(wanted) || item.name?.toLowerCase().includes(wanted))
  return (
    <div className="max-md:mt-8 md:col-span-5">
      <div className={BAR}>
        <h2 className={BAR_TITLE}>{`그 밖 처방 ${rest.length}개`}</h2>
      </div>
      <label className="mt-3 block">
        <span className="sr-only">처방 찾기</span>
        <input className={ds.input} placeholder="처방 이름이나 코드로 찾기" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {shown.length > 0 && (
        <ul className="mt-1">
          {shown.map((item) => (
            <li key={item.code} className={CODE_ROW}>
              <span className="w-14 shrink-0 break-all text-muted md:w-16">{item.code}</span>
              <span className="min-w-0 flex-1 text-ink">{item.name ?? DASH}</span>
              <span className="w-full md:w-38 md:shrink-0">
                <MoveSelect names={names} at={null} onMove={(to) => onMove(item.code, to)} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <Note>{REST_NOTE}</Note>
    </div>
  )
}

type Props = {
  /** 저장된 묶음. 비어 있으면 제안 다섯 개로 채운다(저장은 [저장]을 누를 때만) */
  groups: RxGroup[]
  /** 아는 처방(knownCodes) */
  known: KnownCode[]
  /** 금액 앞에 붙는 고른 달 'YYYY-MM' */
  month: string
  /** createRxGroupStore(...).saveGroups */
  save(after: RxGroup[]): Promise<RxGroup[]>
  onCancel(): void
  onSaved(saved: RxGroup[]): void
}

export function GroupEditor({ groups, known, month, save, onCancel, onSaved }: Props) {
  const suggested = groups.length === 0
  const [rows, setRows] = useState<RxGroup[]>(() => (suggested ? suggestGroups(known.map((item) => item.code)) : groups))
  const [deleting, setDeleting] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<ErrorCode | null>(null)
  const [addError, setAddError] = useState<GroupEditError | null>(null)
  const baseId = useId()
  const titleRef = useRef<HTMLDivElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const retryRef = useRef<HTMLButtonElement>(null)

  // 세 번째 덩어리에서 눌러 열리고 창 전체가 밀리는 화면이라, 초점으로 제목과 [취소]·[저장]까지 데려간다. 값은 AppShell.tsx의 main과 같다(붙어 있는 띠 높이)
  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  const fieldId = (index: number) => `${baseId}-name-${index}`
  const nameInput = (index: number) => document.getElementById(fieldId(index)) as HTMLInputElement | null

  const { errors, after } = checkNames(rows)
  const names = rows.map((row) => row.name)
  const knownByCode = new Map(known.map((item) => [item.code, item]))
  const placed = new Set(rows.flatMap((row) => row.codes))
  const rest = known.filter((item) => !placed.has(item.code))
  const target = deleting === null ? null : rows[deleting]

  const move = (code: string, to: number | null) => setRows(moveCode(rows, code, to))
  const rename = (index: number, name: string) => setRows(rows.map((row, at) => (at === index ? { ...row, name } : row)))

  function addNew() {
    const result = addNewGroup(rows)
    if (typeof result === 'string') {
      setAddError(result)
      return
    }
    setAddError(null)
    // 긴 목록의 끝에 생기므로 바로 그 칸으로 간다
    flushSync(() => setRows(result))
    const field = nameInput(result.length - 1)
    field?.focus()
    field?.select()
  }

  function confirmDelete() {
    if (deleting === null) return
    const wasLast = deleting === rows.length - 1
    flushSync(() => {
      setRows(deleteGroup(rows, deleting))
      setDeleting(null)
      setAddError(null)
    })
    // 끝 줄이면 창을 연 단추가 함께 없어져 초점을 돌려줄 곳이 없다
    if (wasLast) addRef.current?.focus()
  }

  async function submit() {
    if (saving) return
    const firstBad = errors.findIndex((error) => error !== null)
    if (firstBad >= 0) {
      nameInput(firstBad)?.focus()
      return
    }
    setSaving(true)
    try {
      onSaved(await save(after))
    } catch (error) {
      // 폰에서는 [저장]이 맨 아래라 카드가 화면 밖일 수 있다. 초점이 카드 아래 단추로 데려간다
      flushSync(() => setSaveError(error instanceof RxGroupStoreError ? error.code : SAVE_FAILED))
      retryRef.current?.focus()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div ref={titleRef} tabIndex={-1} className="flex scroll-mt-25.5 flex-wrap items-center justify-between gap-x-6 gap-y-2 focus:outline-none max-md:scroll-mt-23.5">
        <PageTitle>
          치료 묶음 고치기
          {suggested && <span className={ds.chip.accent}>{CHIP}</span>}
        </PageTitle>
        <div className="flex items-center gap-4 max-md:hidden">
          <button type="button" className={ds.button.ghost} disabled={saving} onClick={onCancel}>
            취소
          </button>
          <button type="button" className={ds.button.primary} aria-busy={saving} onClick={submit}>
            저장
          </button>
        </div>
      </div>
      <p className="mt-2 max-w-182 text-body text-ink-2">{suggested ? `${INTRO} ${INTRO_SUGGESTED}` : INTRO}</p>

      {saveError && (
        <div className="mt-4">
          <ErrorCard code={saveError} />
          <button ref={retryRef} type="button" className={`${ds.button.secondary} mt-3 max-md:w-full`} aria-busy={saving} onClick={submit}>
            다시 저장
          </button>
        </div>
      )}

      <div className="mt-6 md:grid md:grid-cols-12 md:gap-x-6">
        <div className="md:col-span-7">
          <div className={BAR}>
            <h2 className={BAR_TITLE}>{`묶음 ${rows.length}개`}</h2>
            <button ref={addRef} type="button" className={ds.button.secondarySmall} onClick={addNew}>
              새 묶음
            </button>
          </div>
          {addError && <p className={`mt-1.5 ${ds.fieldError}`}>{NAME_REASON[addError]}</p>}
          {rows.map((row, index) => (
            <GroupBlock
              key={index}
              group={row}
              fieldId={fieldId(index)}
              error={errors[index] ?? null}
              names={names}
              index={index}
              known={knownByCode}
              monthLabel={monthName(month)}
              onRename={(name) => rename(index, name)}
              onDelete={() => setDeleting(index)}
              onMove={move}
            />
          ))}
        </div>
        <RestCodes rest={rest} names={names} onMove={move} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-2 md:hidden">
        <button type="button" className={`${ds.button.secondary} w-full`} disabled={saving} onClick={onCancel}>
          취소
        </button>
        <button type="button" className={`${ds.button.primary} w-full`} aria-busy={saving} onClick={submit}>
          저장
        </button>
      </div>

      {target && deleting !== null && <DeleteGroupDialog name={target.name} codeCount={target.codes.length} onCancel={() => setDeleting(null)} onConfirm={confirmDelete} />}
    </div>
  )
}

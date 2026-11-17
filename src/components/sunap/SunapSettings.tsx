'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { BASE_KIND_IDS, FIXED_LABELS, KIND_MAX, LABEL_MAX, WORDS_TEXT_MAX, WORD_MAX, newKindId, splitWords } from '@/lib/sunap/kinds'
import type { StatsRxGroup } from '@/types/rxGroups'
import type { RsvKindDef, SunapSettings as Settings } from '@/types/sunap'

// 수납일지 설정 판(spec sunap-ilji AC-4905.5, 시안 ?s=settings). 오른쪽에서 나온다(480px, 휴대폰 전체 폭).
// Block·물리치료 = 통계 탭 처방 묶음 하나씩 고르기. 저장은 부르는 쪽이 한다(onSave가 실패하면 판을 닫지 않는다).
// 시안과 다른 곳: '지출 종류' 이름 바꾸기 칸을 뺐다(design.md). 시안의 '처방 묶음 고치러 가기' 글자 단추는 통계 탭으로 가는 링크다.
// 지운 묶음을 가리키는 설정은 '고르지 않음'으로 보인다.
// 다음 예약 종류(spec sunap-kinds AC-5503.1~5503.3, 시안 docs/mockups/sunap-kinds ?s=kinds): 종류마다 이름 · 예약률 ○·✕ · 순서 · 지우기(기본 셋은 못 지움) · 메모 말.
// [저장] 때 이름 빔·같은 이름·20자 넘는 말을 보고, 맞으면 이름·말을 다듬어(splitWords) 목록 차례대로 넘긴다. 저장 뒤 알림 없이 판이 닫힌다(지금처럼).
// PC는 한 칸이 두 줄(이름·예약률·순서 / 메모 말), 휴대폰은 세 줄(이름·순서 / 예약률 / 메모 말). 시안의 동그란 차례 번호는 토큰 모서리(4px)로 그린다

const SELECT = `h-9 min-w-55 cursor-pointer rounded-control border border-line-strong bg-surface px-3 text-small text-ink ${ds.focusRing} max-md:h-11 max-md:w-full`

const KINDS_HELP = [
  '비트 예약 메모에 이 말이 있으면 그 종류로 정해요. 위에 있을수록 먼저 맞춰 봐요(메모에 말이 둘 다 있으면 위 종류). 말은 쉼표(,)로 나눠 적어요.',
  '예약률 ○ 넣음인 종류만 신환·90일 예약률에 세요. 주사치료·진료(경과)·기타는 기본 종류라 이름은 바꿀 수 있지만 지울 수는 없어요.',
]
const FIXED_ROWS: readonly [string, string][] = [
  [FIXED_LABELS[0], '비트에 다음 예약이 없을 때'],
  [FIXED_LABELS[1], '비트 예약은 있는데 메모에 맞는 말이 없을 때'],
]
const AFTER = '예약률 ○·✕를 바꾸면 아직 마감 안 한 날부터 새로 세요. 마감한 날 숫자는 그대로예요(마감을 풀고 다시 마감하면 새 설정으로 세요).'
const FULL = `${KIND_MAX}개를 다 만들었어요. 더 만들려면 안 쓰는 종류를 지워 주세요.`
const NO_LABEL = '이름을 적어 주세요'
const SAME_LABEL = '같은 이름이 이미 있어요'
const LONG_WORD = '말 하나는 20자까지 적을 수 있어요'
const FIX_RED = '빨간 칸을 고쳐 주세요'

// 종류 한 칸(시안 .kgrid·.kind): PC 차례 22px · 이름 · 예약률 116px · 순서 108px, 휴대폰 차례 · 이름 · 순서
const KIND_GRID = 'grid grid-cols-[22px_minmax(0,1fr)_116px_108px] gap-x-2 max-md:grid-cols-[22px_minmax(0,1fr)_auto]'
const BOX = `${ds.input} h-8! max-md:h-11!`
// 예약률 단추 둘(시안 .tog): 테두리 안쪽 초점 고리. 넣음이 눌리면 초록, 뺌이 눌리면 회색 바탕
const TOGGLE = `inline-flex h-7.5 cursor-pointer items-center whitespace-nowrap bg-surface px-2 text-caption font-medium text-muted aria-pressed:font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-md:h-11 max-md:px-3`
const TOGGLE_YES = `${TOGGLE} aria-pressed:bg-positive-soft aria-pressed:text-positive`
const TOGGLE_NO = `${TOGGLE} border-l border-line-strong aria-pressed:bg-canvas aria-pressed:text-ink`
// ▲·▼(시안 .mini)와 지우기·기본(44px 폭)
const MINI = `inline-grid size-7 cursor-pointer place-items-center rounded-control border border-line-strong bg-surface text-caption text-ink-2 not-disabled:hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40 ${ds.focusRing} max-md:size-11`
const SIDE = 'inline-flex h-7 w-11 items-center justify-center rounded-control text-caption max-md:h-11'

/** 판 안에서 고치는 종류 하나. text = 메모 말 칸 글(쉼표로 나눔) */
type Draft = { id: string; label: string; counts: boolean; text: string }
type Problem = { field: 'label' | 'words'; text: string }
type Arrow = 'up' | 'down'

const isBase = (id: string) => (BASE_KIND_IDS as readonly string[]).includes(id)

/** 저장 전 검사(AC-5503.3): 종류마다 처음 걸린 것 하나. 같은 이름은 늘 있는 줄 이름과 위 종류 이름을 본다 */
function check(drafts: readonly Draft[]): Record<string, Problem> {
  const taken = new Set<string>(FIXED_LABELS)
  const problems: Record<string, Problem> = {}
  for (const draft of drafts) {
    const label = draft.label.trim()
    if (label === '') problems[draft.id] = { field: 'label', text: NO_LABEL }
    else if (taken.has(label)) problems[draft.id] = { field: 'label', text: SAME_LABEL }
    else if (splitWords(draft.text).some((word) => word.length > WORD_MAX)) problems[draft.id] = { field: 'words', text: LONG_WORD }
    taken.add(label)
  }
  return problems
}

function GroupPick({
  label,
  help,
  groups,
  value,
  onChange,
  children,
}: {
  label: string
  help: string
  groups: readonly StatsRxGroup[]
  value: string | null
  onChange(id: string | null): void
  children?: ReactNode
}) {
  const id = useId()
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-body font-semibold text-ink">
        {label}
      </label>
      <p className="text-caption text-muted">{help}</p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <select id={id} value={value ?? ''} onChange={(event) => onChange(event.target.value || null)} className={SELECT}>
          <option value="">고르지 않음</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id ?? ''}>
              {`${group.name} (코드 ${group.codes.length}개)`}
            </option>
          ))}
        </select>
        {children}
      </div>
    </div>
  )
}

function KindRow({
  draft,
  n,
  last,
  fresh,
  problem,
  idOf,
  onChange,
  onMove,
  onDelete,
}: {
  draft: Draft
  /** 1부터 센 차례 */
  n: number
  last: boolean
  /** 이 판에서 새로 더한 종류(이름 칸에 초점, 테두리 accent) */
  fresh: boolean
  problem: Problem | undefined
  idOf(field: 'label' | 'words' | 'error' | Arrow): string
  onChange(patch: Partial<Draft>): void
  onMove(arrow: Arrow): void
  onDelete(): void
}) {
  const bad = (field: Problem['field']) => (problem?.field === field ? { 'aria-invalid': true, 'aria-describedby': idOf('error') } : {})
  return (
    <li className={`${KIND_GRID} items-center gap-y-2 rounded-control border bg-surface px-3 py-2 ${fresh ? 'border-accent' : 'border-line'}`}>
      <span
        aria-hidden="true"
        className="col-start-1 row-start-1 grid size-5.5 place-items-center rounded-control border border-line-strong bg-canvas text-caption font-semibold text-muted tabular-nums"
      >
        {n}
      </span>
      {/* 이름 오류 글은 이름 칸 바로 아래(같은 칸 안), 말 오류 글은 말 줄 아래(2026-11-17 검토) */}
      <div className="col-start-2 row-start-1 grid min-w-0 gap-1">
        <input
          id={idOf('label')}
          type="text"
          aria-label={`${n}번째 종류 이름`}
          placeholder="이름 (예: 도수치료)"
          autoComplete="off"
          autoFocus={fresh}
          maxLength={LABEL_MAX}
          value={draft.label}
          onChange={(event) => onChange({ label: event.target.value })}
          className={`${BOX} font-semibold`}
          {...bad('label')}
        />
        {problem?.field === 'label' && (
          <p id={idOf('error')} className={ds.fieldError}>
            {problem.text}
          </p>
        )}
      </div>
      <div className="col-start-3 row-start-1 flex items-center gap-1.5 max-md:col-span-2 max-md:col-start-2 max-md:row-start-2">
        <span className="text-caption text-muted md:hidden">예약률</span>
        <div role="group" aria-label={`${draft.label.trim() || `${n}번째 종류`} 예약률`} className="inline-flex overflow-clip rounded-control border border-line-strong">
          <button type="button" aria-pressed={draft.counts} className={TOGGLE_YES} onClick={() => onChange({ counts: true })}>
            ○ 넣음
          </button>
          <button type="button" aria-pressed={!draft.counts} className={TOGGLE_NO} onClick={() => onChange({ counts: false })}>
            ✕ 뺌
          </button>
        </div>
      </div>
      <div className="col-start-4 row-start-1 flex items-center gap-1 max-md:col-start-3">
        <button id={idOf('up')} type="button" aria-label={`${n}번째 종류 위로`} disabled={n === 1} className={MINI} onClick={() => onMove('up')}>
          ▲
        </button>
        <button id={idOf('down')} type="button" aria-label={`${n}번째 종류 아래로`} disabled={last} className={MINI} onClick={() => onMove('down')}>
          ▼
        </button>
        {isBase(draft.id) ? (
          <span title="기본 종류라 지울 수 없어요" className={`${SIDE} text-muted`}>
            기본
          </span>
        ) : (
          <button type="button" className={`${SIDE} cursor-pointer font-medium text-negative hover:bg-negative-soft ${ds.focusRing}`} onClick={onDelete}>
            지우기
          </button>
        )}
      </div>
      <div className="col-span-3 col-start-2 row-start-2 flex min-w-0 items-center gap-2 max-md:col-span-2 max-md:row-start-3 max-md:flex-wrap max-md:gap-1">
        <label htmlFor={idOf('words')} className="text-caption whitespace-nowrap text-muted max-md:basis-full">
          메모에 이 말이 있으면
        </label>
        <input
          id={idOf('words')}
          type="text"
          placeholder="예: 도수, 수기 (비우면 직접 고를 때만 써요)"
          autoComplete="off"
          maxLength={WORDS_TEXT_MAX}
          value={draft.text}
          onChange={(event) => onChange({ text: event.target.value })}
          className={BOX}
          {...bad('words')}
        />
      </div>
      {problem?.field === 'words' && (
        <p id={idOf('error')} className={`${ds.fieldError} col-span-3 col-start-2 row-start-3 max-md:col-span-2 max-md:row-start-4`}>
          {problem.text}
        </p>
      )}
    </li>
  )
}

export function SunapSettings({
  settings,
  groups,
  onSave,
  onClose,
}: {
  settings: Settings
  groups: readonly StatsRxGroup[]
  onSave(next: Settings): Promise<void>
  onClose(): void
}) {
  const titleId = useId()
  const kindsId = useId()
  // 서버에 저장된 묶음(id 있음)만 고를 수 있다
  const sorted = groups.filter((group) => group.id !== null).sort((a, b) => a.sortOrder - b.sortOrder)
  const known = (id: string | null) => (id !== null && groups.some((group) => group.id === id) ? id : null)
  const [blockGroup, setBlockGroup] = useState(() => known(settings.blockGroup))
  const [ptGroup, setPtGroup] = useState(() => known(settings.ptGroup))
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    settings.kinds.map((kind) => ({ id: kind.id, label: kind.label, counts: kind.counts, text: kind.words.join(', ') })),
  )
  const [problems, setProblems] = useState<Record<string, Problem>>({})
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const addRef = useRef<HTMLButtonElement>(null)
  // 그린 뒤 초점 줄 곳: ▲·▼로 옮긴 칸의 단추(줄을 옮기면 브라우저가 초점을 잃을 수 있다), 지운 뒤에는 [+ 종류 더하기](10개였으면 그린 뒤에야 눌린다)
  const refocus = useRef<{ id: string; arrow: Arrow } | 'add' | null>(null)
  const idOf = (kind: string, field: string) => `${kindsId}-${kind}-${field}`
  const full = drafts.length >= KIND_MAX
  const wrong = drafts.some((draft) => problems[draft.id] !== undefined)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const want = refocus.current
    if (want === null) return
    refocus.current = null
    if (want === 'add') {
      addRef.current?.focus()
      return
    }
    const same = document.getElementById(`${kindsId}-${want.id}-${want.arrow}`) as HTMLButtonElement | null
    const other = document.getElementById(`${kindsId}-${want.id}-${want.arrow === 'up' ? 'down' : 'up'}`)
    ;(same !== null && !same.disabled ? same : other)?.focus()
  }, [drafts, kindsId])

  const change = (id: string, patch: Partial<Draft>) => setDrafts((prev) => prev.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)))

  function move(index: number, arrow: Arrow) {
    const to = arrow === 'up' ? index - 1 : index + 1
    if (to < 0 || to >= drafts.length) return
    const next = [...drafts]
    const [moved] = next.splice(index, 1)
    next.splice(to, 0, moved!)
    refocus.current = { id: moved!.id, arrow }
    setDrafts(next)
  }

  function remove(id: string) {
    refocus.current = 'add'
    setDrafts((prev) => prev.filter((draft) => draft.id !== id))
  }

  function add() {
    if (full) return
    // 이 판을 열 때 있던 id도 피한다(지운 종류의 직접 고른 값이 새 종류로 살아나지 않게)
    const id = newKindId([...drafts, ...settings.kinds].map((kind) => kind.id))
    setDrafts((prev) => [...prev, { id, label: '', counts: false, text: '' }])
  }

  async function save() {
    if (saving) return
    const found = check(drafts)
    setProblems(found)
    const first = drafts.find((draft) => found[draft.id] !== undefined)
    if (first !== undefined) {
      document.getElementById(idOf(first.id, found[first.id]!.field))?.focus()
      return
    }
    const kinds: RsvKindDef[] = drafts.map((draft) => ({ id: draft.id, label: draft.label.trim(), counts: draft.counts, words: splitWords(draft.text) }))
    setSaving(true)
    setFailed(false)
    try {
      await onSave({ blockGroup, ptGroup, kinds })
    } catch {
      setFailed(true)
      setSaving(false)
    }
  }

  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-40 bg-ink/20" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed top-0 right-0 bottom-0 z-50 flex w-120 max-w-full flex-col border-l border-line-strong bg-surface shadow-float"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4 max-md:px-4">
          <h3 id={titleId} className="text-lead font-semibold text-ink">
            수납일지 설정
          </h3>
          <button type="button" aria-label="닫기" className={`${ds.button.ghostSmall} text-muted`} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="grid flex-1 content-start gap-5 overflow-y-auto px-5 py-4 max-md:px-4">
          <GroupPick
            label="Block으로 셀 처방"
            help="통계 탭에 만들어 둔 처방 묶음 중 하나를 골라요. 묶음 안 코드를 바꾸면 수납일지·통계가 같이 바뀌어요."
            groups={sorted}
            value={blockGroup}
            onChange={setBlockGroup}
          >
            <Link href="/stats" className={`${ds.textButton} text-small!`}>
              처방 묶음 고치러 가기 →
            </Link>
          </GroupPick>
          <GroupPick label="물리치료로 셀 처방" help="같은 방법으로 처방 묶음 하나를 골라요." groups={sorted} value={ptGroup} onChange={setPtGroup} />
          <div className="grid min-w-0 gap-2">
            <b id={kindsId} className="text-body font-semibold text-ink">
              다음 예약 종류
            </b>
            {KINDS_HELP.map((line) => (
              <p key={line} className="text-caption text-muted">
                {line}
              </p>
            ))}
            <div aria-hidden="true" className={`${KIND_GRID} px-3 text-caption font-semibold text-muted max-md:hidden`}>
              <span />
              <span>이름</span>
              <span>예약률</span>
              <span>순서</span>
            </div>
            <ol aria-labelledby={kindsId} className="grid gap-1.5">
              {drafts.map((draft, index) => (
                <KindRow
                  key={draft.id}
                  draft={draft}
                  n={index + 1}
                  last={index === drafts.length - 1}
                  fresh={!settings.kinds.some((kind) => kind.id === draft.id)}
                  problem={problems[draft.id]}
                  idOf={(field) => idOf(draft.id, field)}
                  onChange={(patch) => change(draft.id, patch)}
                  onMove={(arrow) => move(index, arrow)}
                  onDelete={() => remove(draft.id)}
                />
              ))}
            </ol>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <button ref={addRef} type="button" disabled={full} className={ds.button.secondarySmall} onClick={add}>
                + 종류 더하기
              </button>
              <span className="text-caption text-muted">{full ? FULL : `종류는 ${KIND_MAX}개까지 만들 수 있어요 · 지금 ${drafts.length}개`}</span>
            </div>
            <div className="rounded-control border border-line bg-canvas">
              <p className="px-3 pt-2 pb-1.5 text-caption font-semibold text-muted">늘 있는 줄 · 바꿀 수 없어요</p>
              {FIXED_ROWS.map(([label, help]) => (
                <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-t border-line px-3 py-2">
                  <b className="text-small font-semibold text-ink-2">{label}</b>
                  <small className="col-start-1 text-caption text-muted">{help}</small>
                  <span className="col-start-2 row-span-2 row-start-1 text-caption font-semibold whitespace-nowrap text-muted">예약률 ✕</span>
                </div>
              ))}
            </div>
            <p className="text-caption text-muted">{AFTER}</p>
          </div>
          {failed && <ErrorCard code="E-SETTINGS-FAILED" />}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3 max-md:px-4">
          {wrong && (
            <p role="alert" className={`${ds.fieldError} basis-full text-right`}>
              {FIX_RED}
            </p>
          )}
          <button type="button" className={ds.button.secondary} onClick={onClose}>
            취소
          </button>
          <button type="button" aria-busy={saving || undefined} className={ds.button.primary} onClick={() => void save()}>
            저장
          </button>
        </div>
      </aside>
    </>
  )
}

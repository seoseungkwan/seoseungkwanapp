'use client'

import Link from 'next/link'
import { useEffect, useId, useState, type ReactNode } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import type { StatsRxGroup } from '@/types/rxGroups'
import type { RsvWords, SunapSettings as Settings } from '@/types/sunap'

// 수납일지 설정 판(spec sunap-ilji AC-4905.5, 시안 ?s=settings). 오른쪽에서 나온다(480px, 휴대폰 전체 폭).
// Block·물리치료 = 통계 탭 처방 묶음 하나씩 고르기, 예약 메모 말 = 세 줄(위 줄이 이긴다). 저장은 부르는 쪽이 한다(onSave가 실패하면 판을 닫지 않는다).
// 시안과 다른 곳: '지출 종류' 이름 바꾸기 칸을 뺐다(design.md). 시안의 '처방 묶음 고치러 가기' 글자 단추는 통계 탭으로 가는 링크다.
// 지운 묶음을 가리키는 설정은 '고르지 않음'으로 보인다

const WORD_ROWS: { key: keyof RsvWords; label: string }[] = [
  { key: 'inj', label: '주사치료' },
  { key: 'visit', label: '진료(경과)' },
  { key: 'etc', label: '기타' },
]
// 메모 앞 40자만 오니 말도 그보다 짧게
const WORD_MAX = 20

const SELECT = `h-9 min-w-55 cursor-pointer rounded-control border border-line-strong bg-surface px-3 text-small text-ink ${ds.focusRing} max-md:h-11 max-md:w-full`
const WORD = 'inline-flex h-6.5 items-center gap-1 rounded-control border border-line-strong bg-canvas pr-1 pl-2 text-small text-ink'

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

function WordRow({ label, words, onChange }: { label: string; words: readonly string[]; onChange(next: string[]): void }) {
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')

  function add() {
    const word = text.trim()
    if (word !== '' && !words.includes(word)) onChange([...words, word])
    setText('')
    setAdding(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-small">
      <span className="w-23 flex-none font-medium text-ink-2">{label}</span>
      {words.map((word) => (
        <span key={word} className={WORD}>
          {word}
          <button
            type="button"
            aria-label={`${word} 지우기`}
            className={`cursor-pointer rounded-control px-0.5 text-muted hover:text-ink ${ds.focusRing}`}
            onClick={() => onChange(words.filter((item) => item !== word))}
          >
            <Icon name="x" size={12} />
          </button>
        </span>
      ))}
      {adding ? (
        <input
          type="text"
          aria-label={`${label} 새 말`}
          autoComplete="off"
          autoFocus
          maxLength={WORD_MAX}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={add}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              add()
            }
            if (event.key === 'Escape') {
              event.stopPropagation()
              setText('')
              setAdding(false)
            }
          }}
          className={`h-6.5 w-24 rounded-control border border-accent bg-surface px-2 text-small text-ink ${ds.focusRing} max-md:h-11`}
        />
      ) : (
        <button
          type="button"
          aria-label={`${label} 말 더하기`}
          className={`inline-flex h-6.5 cursor-pointer items-center rounded-control border border-dashed border-line-strong bg-surface px-2 text-small text-accent ${ds.focusRing} max-md:h-11`}
          onClick={() => setAdding(true)}
        >
          + 말 더하기
        </button>
      )}
    </div>
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
  // 서버에 저장된 묶음(id 있음)만 고를 수 있다
  const sorted = groups.filter((group) => group.id !== null).sort((a, b) => a.sortOrder - b.sortOrder)
  const known = (id: string | null) => (id !== null && groups.some((group) => group.id === id) ? id : null)
  const [blockGroup, setBlockGroup] = useState(() => known(settings.blockGroup))
  const [ptGroup, setPtGroup] = useState(() => known(settings.ptGroup))
  const [words, setWords] = useState<RsvWords>(() => ({ inj: [...settings.words.inj], visit: [...settings.words.visit], etc: [...settings.words.etc] }))
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function save() {
    if (saving) return
    setSaving(true)
    setFailed(false)
    try {
      await onSave({ blockGroup, ptGroup, words })
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
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 id={titleId} className="text-lead font-semibold text-ink">
            수납일지 설정
          </h3>
          <button type="button" aria-label="닫기" className={`${ds.button.ghostSmall} text-muted`} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="grid flex-1 content-start gap-5 overflow-y-auto px-5 py-4">
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
          <div className="grid gap-2">
            <b className="text-body font-semibold text-ink">예약 메모 말</b>
            <p className="text-caption text-muted">비트 예약 메모에 이 말이 들어 있으면 예약 종류를 자동으로 정해요. 여러 말이 겹치면 위 줄이 이겨요.</p>
            {WORD_ROWS.map(({ key, label }) => (
              <WordRow key={key} label={label} words={words[key]} onChange={(next) => setWords((prev) => ({ ...prev, [key]: next }))} />
            ))}
            <p className="rounded-control border border-dashed border-warning bg-warning-soft px-3 py-2 text-caption text-ink-2">
              정해진 말이 없는 예약을 어떻게 셀지는 아직 안 정했어요(지금은 &apos;종류 모름&apos;으로 보여 주고 예약률에서 뺌).
            </p>
          </div>
          {failed && <ErrorCard code="E-SETTINGS-FAILED" />}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
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

'use client'

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ds } from '@/components/ui/classes'
import { literalSlots, toSlot, whenCount, type LearnRule, type LearnWhen, type SlotKey, type SlotWords } from '@/lib/precheck/memo'
import { regionShort } from './saveDiffRows'

// 학습 칸 고치기(claim-learn AC-9301.3·AC-9301.4·AC-9304.2, design.md 12절, 시안 ?s=learn, notes '학습 창'). 환자 자료 없이 그린다:
// 이름 · 조건 체크리스트('이럴 때 쓰기') · 학습할 문장 + 바뀌는 칸 단추 {좌우}{레벨}{부위} · '글자 그대로' 노란 안내 · '조건 없음' 글.
// 설정 학습 탭 [고치기]와 청구 화면 학습 창(TASK-6 rows/LearnDialog)이 같이 쓴다 — 고를 칩 목록은 밖에서 받고(chips), 없으면 그 학습의 조건 값만 칩이다.
// 학습 창은 줄마다 문장 칸을 두고 조건은 하나라서 LearnConditions·LearnSentence를 따로도 내보낸다. 저장·검사 단추는 부르는 쪽이 둔다(조건 없음이면 whenCount(when) === 0)

/** 고를 칩 목록(그 진료의 값). 없으면 그 학습의 조건 값만 칩이다. names = 코드 → 칩에 보일 이름(함께 한 다른 시술, 없으면 코드) */
export type LearnChips = {
  codes?: readonly string[]
  regions?: readonly string[]
  withCodes?: readonly string[]
  doctors?: readonly { code: string; name: string }[]
  names?: Readonly<Record<string, string>>
}

const SLOTS: readonly SlotKey[] = ['좌우', '레벨', '부위']

const chipBase = `inline-flex h-6 cursor-pointer items-center whitespace-nowrap rounded-full border px-2 text-caption ${ds.focusRing} disabled:cursor-not-allowed disabled:opacity-40`
const chipOn = `${chipBase} border-accent bg-accent-soft font-semibold text-accent-strong`
const chipOff = `${chipBase} border-line-strong bg-surface font-medium text-ink-2 hover:bg-canvas`
const slotButton = `inline-flex h-7 cursor-pointer items-center rounded-control border border-line-strong bg-surface px-2 text-small font-semibold text-accent-strong hover:bg-accent-soft ${ds.focusRing} disabled:cursor-not-allowed disabled:opacity-40`

/** 겹침 없이 앞 목록 차례대로 */
const union = (...lists: (readonly string[] | undefined)[]) => [...new Set(lists.flatMap((list) => list ?? []))]
/** 차트에 쓴 말 칸 글 → 말 목록(쉼표로 나눔, 빈 말 뺌) */
const splitWords = (text: string) =>
  text
    .split(',')
    .map((word) => word.trim())
    .filter(Boolean)

type Chip = { value: string; label: string }

/** 조건 한 줄: 켜기 체크(이름) + 칩. 체크를 끄면 그 줄 칩이 모두 꺼지고, 켜면 모두 켜진다 */
function ChipRow({ label, options, picked, onChange }: { label: string; options: readonly Chip[]; picked: readonly string[]; onChange(next: string[]): void }) {
  const toggle = (value: string) => onChange(options.map((chip) => chip.value).filter((option) => (option === value ? !picked.includes(option) : picked.includes(option))))
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="inline-flex w-36 shrink-0 cursor-pointer items-center gap-2 text-small text-ink">
        <input type="checkbox" className="size-4 accent-accent" checked={picked.length > 0} onChange={(event) => onChange(event.target.checked ? options.map((chip) => chip.value) : [])} />
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-1.5">
        {options.map((chip) => {
          const on = picked.includes(chip.value)
          return (
            <button key={chip.value} type="button" aria-pressed={on} className={on ? chipOn : chipOff} onClick={() => toggle(chip.value)}>
              {chip.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * 조건 체크리스트(AC-9301.3): 처방 코드 · 부위 · 차트에 쓴 말 · 함께 한 다른 시술 · 진료한 원장님(진료의 칩이 없으면 줄 없음).
 * 칩은 받은 목록 + 그 학습의 조건 값이고, 끈 칩도 그 자리에 남는다. 켠 조건이 없으면 '조건 없음' 글
 */
export function LearnConditions({ when, chips, onChange }: { when: LearnWhen; chips?: LearnChips; onChange(when: LearnWhen): void }) {
  const titleId = useId()
  const [first] = useState(when)
  const [wordsOn, setWordsOn] = useState(when.chartWords.length > 0)
  const [wordsText, setWordsText] = useState(when.chartWords.join(', '))
  const set = (patch: Partial<LearnWhen>) => onChange({ ...when, ...patch })
  const names = chips?.names ?? {}
  const asChips = (values: readonly string[], label: (value: string) => string = (value) => value): Chip[] => values.map((value) => ({ value, label: label(value) }))
  const doctorNames = new Map((chips?.doctors ?? []).map((doctor) => [doctor.code, doctor.name]))
  const codes = asChips(union(chips?.codes, first.codes, when.codes))
  const regions = asChips(union(chips?.regions, first.regions, when.regions), regionShort)
  const withCodes = asChips(union(chips?.withCodes, first.withCodes, when.withCodes), (code) => names[code] ?? code)
  const doctors = asChips(union([...doctorNames.keys()], first.doctors, when.doctors), (code) => doctorNames.get(code) ?? code)

  return (
    <div role="group" aria-labelledby={titleId} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 id={titleId} className="text-body font-semibold text-ink">
          이럴 때 쓰기
        </h3>
        <span className={ds.help}>켠 조건이 모두 맞을 때만 써요.</span>
      </div>
      <ChipRow label="처방 코드" options={codes} picked={when.codes} onChange={(next) => set({ codes: next })} />
      <ChipRow label="부위" options={regions} picked={when.regions} onChange={(next) => set({ regions: next })} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex w-36 shrink-0 cursor-pointer items-center gap-2 text-small text-ink">
          <input
            type="checkbox"
            className="size-4 accent-accent"
            checked={wordsOn}
            onChange={(event) => {
              setWordsOn(event.target.checked)
              set({ chartWords: event.target.checked ? splitWords(wordsText) : [] })
            }}
          />
          차트에 쓴 말
        </label>
        <div className="w-full max-w-65">
          <input
            aria-label="차트에 쓴 말"
            className={ds.input}
            autoComplete="off"
            placeholder="예: C-arm"
            value={wordsText}
            onChange={(event) => {
              const text = event.target.value
              setWordsText(text)
              setWordsOn(true)
              set({ chartWords: splitWords(text) })
            }}
          />
        </div>
      </div>
      <ChipRow label="함께 한 다른 시술" options={withCodes} picked={when.withCodes} onChange={(next) => set({ withCodes: next })} />
      {doctors.length > 0 && <ChipRow label="진료한 원장님" options={doctors} picked={when.doctors} onChange={(next) => set({ doctors: next })} />}
      {whenCount(when) === 0 && <p className={ds.fieldError}>조건을 하나 이상 골라 주세요.</p>}
    </div>
  )
}

/**
 * 학습할 문장 칸 하나(AC-9301.4): 글 칸 + 바뀌는 칸 단추(커서 자리에 넣음, 고른 글이 있으면 그 자리를 바꿈, 칸을 누른 적 없으면 끝에) + 작은 글
 * + 문장에 {} 없이 남은 좌우·레벨·부위 글자마다 '글자 그대로' 노란 안내와 [{…}로 바꾸기]. 안내가 있어도 저장은 막지 않는다
 */
export function LearnSentence({ value, words, label = '학습할 문장', caption, onChange }: { value: string; words: SlotWords; label?: string; caption?: ReactNode; onChange(value: string): void }) {
  const field = useRef<HTMLInputElement>(null)
  /** 글 칸에 글쓰기 표시를 둔 적이 있나. 없으면 단추는 글 끝에 넣는다 */
  const placed = useRef(false)
  /** 넣은 뒤 글쓰기 표시를 둘 자리(다음 그리기 뒤) */
  const caretAfter = useRef<number | null>(null)
  const hits = literalSlots(value, words)

  useLayoutEffect(() => {
    const at = caretAfter.current
    if (at === null || !field.current) return
    caretAfter.current = null
    field.current.setSelectionRange(at, at)
  })

  function insert(slot: SlotKey) {
    const token = `{${slot}}`
    const element = field.current
    const start = placed.current && element ? Math.min(element.selectionStart ?? value.length, value.length) : value.length
    const end = placed.current && element ? Math.max(start, Math.min(element.selectionEnd ?? start, value.length)) : start
    caretAfter.current = start + token.length
    placed.current = true
    onChange(value.slice(0, start) + token + value.slice(end))
    element?.focus()
  }
  const markPlaced = () => {
    placed.current = true
  }

  return (
    <div className="flex flex-col gap-2">
      {caption && <p className={ds.help}>{caption}</p>}
      <input ref={field} aria-label={label} className={ds.input} autoComplete="off" value={value} onChange={(event) => onChange(event.target.value)} onFocus={markPlaced} onSelect={markPlaced} />
      <div className="flex flex-wrap items-center gap-2">
        {SLOTS.map((slot) => (
          <button key={slot} type="button" className={slotButton} onMouseDown={(event) => event.preventDefault()} onClick={() => insert(slot)}>
            {`{${slot}}`}
          </button>
        ))}
        <span className={ds.help}>환자마다 다른 칸은 단추로 바꿔 두세요. 다음 진료의 값이 들어가요.</span>
      </div>
      {hits.map((hit) => (
        <div key={`${hit.slot}:${hit.word}`} className="flex flex-wrap items-center gap-2 rounded-control bg-warning-soft px-3 py-1.5 text-small text-warning">
          <span>{`‘${hit.word}’가 글자 그대로 있어요. 다른 환자에게도 ‘${hit.word}’로 나와요.`}</span>
          <button type="button" className={ds.button.secondarySmall} onClick={() => onChange(toSlot(value, hit, words))}>
            {`{${hit.slot}}로 바꾸기`}
          </button>
        </div>
      ))}
    </div>
  )
}

/** 학습 하나 고치기: 이름 · 조건 · 학습할 문장(줄 뺌은 문장이 없다). 고친 학습은 onChange로만 올린다 */
export function LearnEditor({ rule, words, chips, onChange }: { rule: LearnRule; words: SlotWords; chips?: LearnChips; onChange(rule: LearnRule): void }) {
  const nameId = useId()
  const sentenceId = useId()
  return (
    <div className="flex flex-col gap-4">
      <div className={`${ds.field} max-w-100`}>
        <label className={ds.label} htmlFor={nameId}>
          이름
        </label>
        <input id={nameId} className={ds.input} autoComplete="off" value={rule.name} onChange={(event) => onChange({ ...rule, name: event.target.value })} />
      </div>
      <LearnConditions when={rule.when} chips={chips} onChange={(when) => onChange({ ...rule, when })} />
      {rule.kind !== 'remove' && (
        <div className="flex flex-col gap-2">
          <h3 id={sentenceId} className="text-body font-semibold text-ink">
            학습할 문장
          </h3>
          <LearnSentence value={rule.to} words={words} onChange={(to) => onChange({ ...rule, to })} />
        </div>
      )}
    </div>
  )
}

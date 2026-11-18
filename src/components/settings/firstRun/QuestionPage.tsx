'use client'

import { useId, useState } from 'react'
import { ds } from '@/components/ui/classes'
import { CARM_CHOICES, ENDING_CHOICES, MARK_CHOICES, SONO_CHOICES, type Answers } from '@/lib/precheck/memo/onboarding/answers'

// 처음 질문의 질문 쪽 하나(clinic-profile AC-6614.5, design.md 16절). 네 쪽: 좌우 · 가이드·끝맺음 · 레벨·검사 · 모양·기호.
// 고르기는 라디오 칩이고, 가이드·끝맺음·줄 머리 기호는 '직접 적기' 칸이 있다(20자·16자). 답은 부르는 쪽(FirstRunScreen) 상태에만 있다(저장소 안 씀)

export type Key = keyof Answers
export const PAGE_NAMES = ['좌우', '가이드·끝맺음', '레벨·검사', '모양·기호'] as const
export const PAGE_COUNT = PAGE_NAMES.length

/** 질문(항목) 이름. 붙여 넣기 표의 '항목'과 확인 쪽 '바뀌는 것'의 칸 이름도 이 글이다 */
export const ITEM_LABELS: Readonly<Record<Key, string>> = {
  sideStyle: '좌우 모양',
  cartilageSideLang: '연골주사 좌우',
  sideMode: '좌우 쓰는 경우',
  sideSpread: '앞에 적힌 좌우',
  carm: '신경차단술 C-arm 글자',
  sono: '관절 주사 초음파 글자',
  ending: '끝맺음',
  levelSep: '레벨',
  klg: 'K-L 문장',
  mark: '줄 머리 기호',
  lineJoin: '줄 나눔',
}

type ListKey = 'sideStyle' | 'cartilageSideLang' | 'sideMode' | 'sideSpread' | 'levelSep' | 'klg' | 'lineJoin'
type TextKey = 'carm' | 'sono' | 'ending' | 'mark'

/** 목록에서 고르는 항목의 값 → 보이는 글(차례 = 고르기 차례) */
const LIST_CHOICES: { readonly [K in ListKey]: readonly (readonly [Answers[K], string])[] } = {
  sideStyle: [
    ['Rt', 'Rt·Lt·both'],
    ['upper', 'RT·LT·BOTH'],
    ['dot', 'Rt.·Lt.·Both'],
    ['bil', 'Rt·Lt·Bil'],
    ['ko', '우측·좌측·양측'],
    ['koShort', '우·좌·양'],
  ],
  cartilageSideLang: [
    ['ko', '한글'],
    ['en', '영어'],
  ],
  sideMode: [
    ['chart', '차트 그대로'],
    ['quantity', '1.5 이상만 both'],
  ],
  sideSpread: [
    ['all', '뒤 시술 모두에'],
    ['adjacent', '바로 옆 시술만'],
  ],
  levelSep: [
    ['comma', 'L4,5,S1'],
    ['dash', 'L4-5-S1'],
    ['repeat', 'L4, L5, S1'],
  ],
  klg: [
    ['paren', 'K-L grade (n)/(n)'],
    ['plain', 'K-L grade n/n'],
    ['ko', 'K-L 등급 n/n'],
  ],
  lineJoin: [
    ['lines', '시술마다 한 줄'],
    ['oneLine', '한 줄로 이어 쓰기'],
  ],
}

/** 글자로 답하는 항목: 고르는 글 · 안 쓰는 값과 그 이름 · 직접 적기 길이 */
const TEXT_CHOICES: { readonly [K in TextKey]: { choices: readonly string[]; none: Answers[K]; noneLabel: string; max: number } } = {
  carm: { choices: CARM_CHOICES, none: null, noneLabel: '안 씀', max: 20 },
  sono: { choices: SONO_CHOICES, none: null, noneLabel: '안 씀', max: 20 },
  ending: { choices: ENDING_CHOICES, none: null, noneLabel: '없음', max: 20 },
  mark: { choices: MARK_CHOICES, none: '', noneLabel: '없음', max: 16 },
}

const PAGES: readonly (readonly Key[])[] = [
  ['sideStyle', 'cartilageSideLang', 'sideMode', 'sideSpread'],
  ['carm', 'sono', 'ending'],
  ['levelSep', 'klg'],
  ['mark', 'lineJoin'],
]

const isText = (key: Key): key is TextKey => Object.hasOwn(TEXT_CHOICES, key)

/** 답 하나를 보이는 글로(붙여 넣기 '읽은 값'·확인 쪽 전·후) */
export function answerText<K extends Key>(key: K, value: Answers[K]): string {
  if (isText(key)) {
    const { none, noneLabel } = TEXT_CHOICES[key]
    return value === none || value === null || value === '' ? noneLabel : String(value)
  }
  const found = (LIST_CHOICES[key as ListKey] as readonly (readonly [unknown, string])[]).find(([choice]) => choice === value)
  return found ? found[1] : String(value)
}

/** 직접 적은 글: 문구 검사에 걸리는 중괄호·제어 문자는 넣지 않고 길이를 자른다 */
const clean = (value: string, max: number) => value.replace(/[{}\p{Cc}]/gu, '').slice(0, max)

// 라디오 칩: 숨긴 라디오 + 글. 고른 것은 accent 테두리·accent-soft 바탕·600. 휴대폰 44px
const chip =
  'inline-flex h-9 cursor-pointer items-center rounded-control border border-line-strong bg-surface px-3 text-body text-ink transition hover:bg-canvas peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:font-semibold peer-checked:text-accent-strong peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent max-md:h-11'

/** 이미 골라진 값을 다시 눌러도(change 없음) 고른 것으로 친다('골라 주세요' 표시를 뗀다) → click에도 onPick. 두 번 불려도 같은 값이다 */
function Chip({ name, label, checked, onPick }: { name: string; label: string; checked: boolean; onPick(): void }) {
  return (
    <label className="inline-flex">
      <input type="radio" name={name} className="peer sr-only" checked={checked} onChange={onPick} onClick={onPick} />
      <span className={chip}>{label}</span>
    </label>
  )
}

function Legend({ label, unsure }: { label: string; unsure: boolean }) {
  return (
    <legend className="mb-2 flex items-center gap-2 text-small font-semibold text-ink">
      {label}
      {unsure && (
        <>
          {' '}
          <span className={ds.chip.warning}>골라 주세요</span>
        </>
      )}
    </legend>
  )
}

function ListQuestion<K extends ListKey>({ item, value, unsure, onChange }: { item: K; value: Answers[K]; unsure: boolean; onChange(value: Answers[K]): void }) {
  const name = useId()
  return (
    <fieldset className="min-w-0">
      <Legend label={ITEM_LABELS[item]} unsure={unsure} />
      <div className="flex flex-wrap gap-2">
        {LIST_CHOICES[item].map(([choice, label]) => (
          <Chip key={String(choice)} name={name} label={label} checked={value === choice} onPick={() => onChange(choice)} />
        ))}
      </div>
    </fieldset>
  )
}

function TextQuestion<K extends TextKey>({ item, value, unsure, onChange }: { item: K; value: Answers[K]; unsure: boolean; onChange(value: Answers[K]): void }) {
  const name = useId()
  const { choices, none, noneLabel, max } = TEXT_CHOICES[item]
  const own = value !== none && !choices.includes(String(value))
  const [custom, setCustom] = useState(own)
  const [typed, setTyped] = useState(own ? String(value ?? '') : '')
  const label = ITEM_LABELS[item]
  return (
    <fieldset className="min-w-0">
      <Legend label={label} unsure={unsure} />
      <div className="flex flex-wrap items-center gap-2">
        {choices.map((choice) => (
          <Chip
            key={choice}
            name={name}
            label={choice}
            checked={!custom && value === choice}
            onPick={() => {
              setCustom(false)
              onChange(choice as Answers[K])
            }}
          />
        ))}
        <Chip
          name={name}
          label={noneLabel}
          checked={!custom && value === none}
          onPick={() => {
            setCustom(false)
            onChange(none)
          }}
        />
        <Chip
          name={name}
          label="직접 적기"
          checked={custom}
          onPick={() => {
            setCustom(true)
            onChange(typed as Answers[K])
          }}
        />
        {custom && (
          <input
            aria-label={`${label} 직접 적기`}
            className={`${ds.input} max-w-60`}
            maxLength={max}
            autoComplete="off"
            value={typed}
            onChange={(event) => {
              const next = clean(event.target.value, max)
              setTyped(next)
              onChange(next as Answers[K])
            }}
          />
        )}
      </div>
    </fieldset>
  )
}

export type QuestionPageProps = {
  page: number
  answers: Answers
  /** 붙여 넣기에서 '섞여 있어요'·'못 찾았어요'였고 아직 고르지 않은 항목 */
  unsure: ReadonlySet<Key>
  onChange<K extends Key>(key: K, value: Answers[K]): void
  onPrev(): void
  onNext(): void
}

export function QuestionPage({ page, answers, unsure, onChange, onPrev, onNext }: QuestionPageProps) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className={`${ds.panel} flex min-w-0 flex-1 flex-col gap-5 p-5 max-md:p-4`}>
      <h2 id={titleId} className={ds.panelTitle}>
        {`${page + 1}쪽 / ${PAGE_COUNT}쪽 · ${PAGE_NAMES[page]}`}
      </h2>
      {PAGES[page].map((item) =>
        isText(item) ? (
          <TextQuestion key={item} item={item} value={answers[item]} unsure={unsure.has(item)} onChange={(value) => onChange(item, value)} />
        ) : (
          <ListQuestion key={item} item={item} value={answers[item]} unsure={unsure.has(item)} onChange={(value) => onChange(item, value)} />
        ),
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <button type="button" className={ds.button.secondary} onClick={onPrev}>
          이전
        </button>
        <button type="button" className={ds.button.primary} onClick={onNext}>
          다음
        </button>
      </div>
    </section>
  )
}

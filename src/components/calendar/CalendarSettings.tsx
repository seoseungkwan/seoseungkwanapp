'use client'

import Link from 'next/link'
import { useRef, useState, type ReactNode } from 'react'
import { useDesk } from '@/components/shell/role'
import { ds } from '@/components/ui/classes'
import { CAL_LABEL_MAX, KIND_LEN_MAX, checkCalendarKinds, type CalKindProblem } from '@/lib/storage/calendar'
import { CAL_COLORS, type CalKind, type CalSettings, type KindColor } from '@/types/calendar'
import { Drawer } from './AddPanel'
import { CalIcon, Swatch, calVar } from './CalendarToolbar'
import { CAL_COLOR_LABEL, CAL_DEFAULT_LABEL, CAL_FOLLOW_LABEL, kindColorLabel } from './colors'

// 예약 설정 판 (spec clinic-calendar AC-5905.5, 시안 ?s=settings).
// 종류: ▲▼ 차례·이름(10자)·기본 길이(5~120분)·색(시행자 색 따름 · 캘린더 기본 색 · 구글 일정 11색, google-link AC-8503.2)·지우기(하나는 남긴다).
// 알아볼 글(words)은 이 판이 고치지 않고 그대로 넘긴다(새 종류는 이름 하나 — 고치는 곳은 구글 캘린더 설정).
// 검사는 lib/storage checkCalendarKinds(+ 같은 종류 이름은 이 판이 본다).
// 시행자·보이는 시간·주 보기 요일은 병원 정보에서 온다(spec clinic-profile AC-6603.4): 그 구역 대신 안내 글 + 원장에게만 [병원 정보로 가기](/settings).
// 판 안에서 고친 종류 사본을 쥐고 [저장]은 onSave로 받은 설정에 고친 종류만 바꿔 넘긴다(저장은 화면이 한다, 서버로는 종류만 간다)

type Problem = CalKindProblem | 'kind-dup'
const PROBLEM_TEXT: Record<Problem, string> = {
  'kinds-empty': '종류를 하나 이상 두어 주세요',
  'kind-id': '종류를 지우고 다시 더해 주세요',
  'kind-name': '종류 이름을 적어 주세요',
  'kind-dup': '같은 종류 이름이 있어요',
  'kind-len': '기본 길이를 골라 주세요',
  'kind-color': '종류 색을 골라 주세요',
}
// 같은 종류 이름은 종류 이름 문제 바로 뒤 차례(시안 setErrors)
const KIND_FIRST: readonly CalKindProblem[] = ['kinds-empty', 'kind-id', 'kind-name']

/** 첫 문제(없으면 null). 종류만 본다 — 시행자·시간은 병원 정보 값이라 이 판이 막지 않는다 */
function firstProblem(kinds: readonly CalKind[]): Problem | null {
  const problems = checkCalendarKinds(kinds)
  const early = problems.find((p) => KIND_FIRST.includes(p))
  if (early) return early
  const names = kinds.map((kind) => kind.name.trim())
  if (new Set(names).size !== names.length) return 'kind-dup'
  return problems[0] ?? null
}

const LENS = Array.from({ length: KIND_LEN_MAX / 5 }, (_, i) => (i + 1) * 5)
const CLINIC_NOTE = '시행자와 진료시간은 설정 → 병원 정보에서 고쳐요.'
const CLINIC_HREF = '/settings'

const FIELD = `h-8 min-w-0 rounded-control border border-line-strong bg-surface px-2 text-small text-ink placeholder:text-muted focus-visible:border-accent focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-accent max-md:h-11 max-md:text-lead`
const SMALL_INPUT = `${FIELD} w-full`
const SELECT = `h-8 rounded-control border border-line-strong bg-surface px-1.5 text-small text-ink ${ds.focusRing} max-md:h-11`
const MINI = `grid size-7 cursor-pointer place-items-center rounded-control border border-line-strong bg-surface text-caption text-ink-2 hover:bg-canvas disabled:cursor-default disabled:opacity-40 ${ds.focusRing} max-md:size-11`
const DELETE = `${ds.button.ghostSmall} text-negative`
const ROW = 'rounded-control border border-line px-3 py-2'
const SECTION_TEXT = 'text-caption text-muted'

function colorButton(open: boolean) {
  return `inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-control border bg-surface px-2 text-small whitespace-nowrap text-ink ${ds.focusRing} max-md:h-11 ${
    open ? 'border-accent ring-1 ring-accent ring-inset' : 'border-line-strong'
  }`
}

const pickButton = (on: boolean) =>
  `inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-control border bg-surface px-2 text-caption text-ink ${ds.focusRing} ${
    on ? 'border-ink font-semibold ring-1 ring-ink ring-inset' : 'border-line-strong'
  }`

/** 종류 색판(시안 .gpal): '시행자 색 따름' · '캘린더 기본 색'이 앞, 그다음 구글 일정 11색(colorId 1~11 차례) */
function Palette({ color, onPick }: { color: KindColor; onPick(color: KindColor): void }) {
  return (
    <div role="group" aria-label="색 고르기" className="flex flex-wrap items-center gap-1.5 rounded-control bg-canvas p-2">
      <button type="button" aria-pressed={color === null} className={pickButton(color === null)} onClick={() => onPick(null)}>
        <Swatch color={null} />
        {CAL_FOLLOW_LABEL}
      </button>
      <button type="button" aria-pressed={color === 'default'} className={pickButton(color === 'default')} onClick={() => onPick('default')}>
        <Swatch color="default" />
        {CAL_DEFAULT_LABEL}
      </button>
      {CAL_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={CAL_COLOR_LABEL[c]}
          title={CAL_COLOR_LABEL[c]}
          aria-pressed={color === c}
          className={`size-7 cursor-pointer rounded-control border-2 border-surface ${ds.focusRing} max-md:size-11 ${color === c ? 'ring-2 ring-ink' : 'ring-1 ring-line-strong'}`}
          style={{ backgroundColor: calVar(c) }}
          onClick={() => onPick(c)}
        />
      ))}
    </div>
  )
}

function Fieldset({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="text-body font-semibold text-ink">{title}</h3>
      <p className={SECTION_TEXT}>{text}</p>
      {children}
    </section>
  )
}

const PlusIcon = () => <CalIcon name="plus" size={14} />

type SettingsProps = {
  settings: CalSettings
  busy?: boolean
  error?: ReactNode
  onSave(next: CalSettings): void
  onClose(): void
}

/** 예약 설정 판 */
export function CalendarSettings({ settings, busy = false, error, onSave, onClose }: SettingsProps) {
  const desk = useDesk()
  const [kinds, setKinds] = useState<CalKind[]>(() => [...settings.kinds])
  const [palette, setPalette] = useState<string | null>(null) // 'k:<id>'
  const seq = useRef(0)
  const problem = firstProblem(kinds)

  const setKind = (id: string, next: Partial<CalKind>) => setKinds((prev) => prev.map((k) => (k.id === id ? { ...k, ...next } : k)))

  // 새 id: 시각 + 차례(열 때 있던 id·지금 id와 겹치지 않게)
  function newId(): string {
    const taken = new Set([...settings.kinds, ...kinds].map((item) => item.id))
    for (;;) {
      seq.current += 1
      const id = `k-${Date.now().toString(36)}-${seq.current}`
      if (!taken.has(id)) return id
    }
  }

  function moveKind(index: number, by: -1 | 1) {
    const to = index + by
    if (to < 0 || to >= kinds.length) return
    const next = [...kinds]
    const [moved] = next.splice(index, 1)
    next.splice(to, 0, moved!)
    setKinds(next)
  }

  // 받은 설정(병원 정보와 합친 시행자·시간 포함)에 고친 종류만 바꿔 넘긴다
  function save() {
    if (problem !== null || busy) return
    const words = (k: CalKind) => (k.words.length > 0 ? k.words : [k.name.trim()]) // 새 종류 = 이름 하나
    onSave({ ...settings, kinds: kinds.map((k) => ({ id: k.id, name: k.name.trim(), len: k.len, color: k.color, words: words(k) })) })
  }

  const foot = (
    <>
      <span data-problem={problem ? '' : undefined} className="min-w-35 flex-1 text-caption text-negative">
        {problem ? PROBLEM_TEXT[problem] : ''}
      </span>
      {error && (
        <p role="alert" className={`${ds.fieldError} basis-full text-right`}>
          {error}
        </p>
      )}
      <button type="button" className={ds.button.secondary} onClick={onClose}>
        취소
      </button>
      <button type="button" disabled={problem !== null} aria-busy={busy || undefined} className={ds.button.primary} onClick={save}>
        저장
      </button>
    </>
  )

  return (
    <Drawer title="예약 설정" onClose={onClose} foot={foot}>
      <Fieldset title="종류" text="종류마다 기본 길이와 색을 정해요. 색은 고정 색이나 '시행자 색 따름' 중 하나예요. 위에 있을수록 예약 더하기에서 앞에 보여요.">
        <ul aria-label="종류" className="grid gap-1.5">
          {kinds.map((kind, i) => {
            const open = palette === `k:${kind.id}`
            return (
              <li key={kind.id} className={`${ROW} grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2`}>
                <div className="row-span-2 grid gap-1 self-start">
                  <button type="button" aria-label={`${i + 1}번째 종류 위로`} disabled={i === 0} className={MINI} onClick={() => moveKind(i, -1)}>
                    ▲
                  </button>
                  <button
                    type="button"
                    aria-label={`${i + 1}번째 종류 아래로`}
                    disabled={i === kinds.length - 1}
                    className={MINI}
                    onClick={() => moveKind(i, 1)}
                  >
                    ▼
                  </button>
                </div>
                <input
                  aria-label="종류 이름"
                  value={kind.name}
                  maxLength={CAL_LABEL_MAX}
                  placeholder="이름 (예: 체외충격파)"
                  aria-invalid={kind.name.trim() === '' || undefined}
                  className={`${SMALL_INPUT} font-semibold`}
                  onChange={(event) => setKind(kind.id, { name: event.target.value })}
                />
                <button
                  type="button"
                  disabled={kinds.length < 2}
                  className={DELETE}
                  onClick={() => setKinds(kinds.filter((k) => k.id !== kind.id))}
                >
                  지우기
                </button>
                <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-caption text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    기본 길이
                    <select aria-label="기본 길이" value={kind.len} className={SELECT} onChange={(event) => setKind(kind.id, { len: Number(event.target.value) })}>
                      {(LENS.includes(kind.len) ? LENS : [...LENS, kind.len].sort((a, b) => a - b)).map((m) => (
                        <option key={m} value={m}>
                          {`${m}분`}
                        </option>
                      ))}
                    </select>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    색
                    <button
                      type="button"
                      aria-label="색 고르기"
                      aria-expanded={open}
                      className={colorButton(open)}
                      onClick={() => setPalette(open ? null : `k:${kind.id}`)}
                    >
                      <Swatch color={kind.color} />
                      {kindColorLabel(kind.color)}
                      <span aria-hidden="true" className="text-caption text-muted">
                        ▼
                      </span>
                    </button>
                  </span>
                </div>
                {open && (
                  <div className="col-span-3">
                    <Palette
                      color={kind.color}
                      onPick={(color) => {
                        setKind(kind.id, { color })
                        setPalette(null)
                      }}
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <button
            type="button"
            className={ds.button.secondarySmall}
            onClick={() => setKinds([...kinds, { id: newId(), name: '', len: 30, color: null, words: [] }])}
          >
            <PlusIcon />
            종류 더하기
          </button>
          <span className="text-caption text-muted">지운 종류의 지난 예약은 그 이름 그대로 남아요</span>
        </div>
      </Fieldset>
      <div aria-hidden="true" className="h-px bg-line" />

      <section aria-label="시행자와 진료시간" className="grid justify-items-start gap-2">
        <p className="flex items-start gap-2 text-small text-ink-2">
          <CalIcon name="info" size={14} className="mt-0.5" />
          <span>{CLINIC_NOTE}</span>
        </p>
        {!desk && (
          <Link href={CLINIC_HREF} className={ds.button.secondarySmall}>
            병원 정보로 가기
          </Link>
        )}
      </section>
      <div aria-hidden="true" className="h-px bg-line" />

      <div className="grid gap-1.5 rounded-control border border-line bg-canvas px-3 py-2 text-caption text-ink-2">
        <p className="flex items-start gap-2">
          <CalIcon name="info" size={14} className="mt-0.5" />
          <span>지난 예약은 1년 뒤 자동으로 지워져요.</span>
        </p>
        <p className="flex items-start gap-2">
          <CalIcon name="lock" size={14} className="mt-0.5" />
          <span>환자 이름과 차트번호는 서버에 저장되고, 의원 계정으로 로그인해야만 보여요.</span>
        </p>
        <p className="flex items-start gap-2">
          <CalIcon name="sync" size={14} className="mt-0.5" />
          <span>다른 PC에서 고친 것도 몇 초 안에 이 화면에 보여요.</span>
        </p>
      </div>
    </Drawer>
  )
}

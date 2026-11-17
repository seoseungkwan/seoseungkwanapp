'use client'

import { useRef, useState, type ReactNode } from 'react'
import { ds } from '@/components/ui/classes'
import { CAL_LABEL_MAX, KIND_LEN_MAX, checkCalendarSettings, type CalSettingsProblem } from '@/lib/storage/calendar'
import { CAL_COLORS, type CalColor, type CalKind, type CalSettings, type CalStaff } from '@/types/calendar'
import { Drawer } from './AddPanel'
import { CalIcon, Swatch, calVar, hm } from './CalendarToolbar'

// 예약 설정 판 (spec clinic-calendar AC-5905.5, 시안 ?s=settings).
// 종류: ▲▼ 차례·이름(10자)·기본 길이(5~120분)·색(고정 10색 또는 시행자 색 따름)·지우기(하나는 남긴다) / 시행자: 이름·한 글자 표시·색·지우기 /
// 보이는 시간(1시간 단위)·주 보기 요일. 검사는 lib/storage checkCalendarSettings(+ 같은 종류 이름은 이 판이 본다).
// 판 안에서 고친 사본을 쥐고 [저장]은 onSave로 고친 설정을 넘긴다(저장은 화면이 한다)

/** 색 이름(시안 PALETTE 차례 = CAL_COLORS 차례) */
export const COLOR_NAMES: Record<CalColor, string> = {
  blue: '파랑',
  teal: '청록',
  purple: '보라',
  orange: '주황',
  pink: '분홍',
  lime: '연두',
  navy: '남색',
  sky: '하늘',
  brown: '갈색',
  gray: '회색',
}

type Problem = CalSettingsProblem | 'kind-dup'
const PROBLEM_TEXT: Record<Problem, string> = {
  'kinds-empty': '종류를 하나 이상 두어 주세요',
  'kind-id': '종류를 지우고 다시 더해 주세요',
  'kind-name': '종류 이름을 적어 주세요',
  'kind-dup': '같은 종류 이름이 있어요',
  'kind-len': '기본 길이를 골라 주세요',
  'kind-color': '종류 색을 골라 주세요',
  'staff-id': '시행자를 지우고 다시 더해 주세요',
  'staff-name': '시행자 이름을 적어 주세요',
  'staff-mark': '표시는 한 글자예요',
  'staff-mark-dup': '같은 표시가 있어요',
  'staff-color': '시행자 색을 골라 주세요',
  hours: '끝 시간이 시작 시간보다 늦어야 해요',
  sunday: '주 보기 요일을 골라 주세요',
}
// 같은 종류 이름은 종류 이름 문제 바로 뒤 차례(시안 setErrors)
const KIND_FIRST: readonly CalSettingsProblem[] = ['kinds-empty', 'kind-id', 'kind-name']

/** 첫 문제(없으면 null) */
function firstProblem(settings: CalSettings): Problem | null {
  const problems = checkCalendarSettings(settings)
  const early = problems.find((p) => KIND_FIRST.includes(p))
  if (early) return early
  const names = settings.kinds.map((kind) => kind.name.trim())
  if (new Set(names).size !== names.length) return 'kind-dup'
  return problems[0] ?? null
}

const LENS = Array.from({ length: KIND_LEN_MAX / 5 }, (_, i) => (i + 1) * 5)
const OPEN_HOURS = [5, 6, 7, 8, 9, 10, 11, 12]
const CLOSE_HOURS = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]

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

/** 색판(시안 .pal): 종류는 '시행자 색 따름'이 맨 앞. 동그라미 10색 */
function Palette({ color, forKind, onPick }: { color: CalColor | null; forKind: boolean; onPick(color: CalColor | null): void }) {
  return (
    <div role="group" aria-label="색 고르기" className="flex flex-wrap items-center gap-1.5 rounded-control bg-canvas p-2">
      {forKind && (
        <button
          type="button"
          aria-pressed={color === null}
          className={`inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-control border bg-surface px-2 text-caption text-ink ${ds.focusRing} ${
            color === null ? 'border-ink font-semibold ring-1 ring-ink ring-inset' : 'border-line-strong'
          }`}
          onClick={() => onPick(null)}
        >
          <Swatch color={null} />
          시행자 색 따름
        </button>
      )}
      {CAL_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={COLOR_NAMES[c]}
          title={COLOR_NAMES[c]}
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
  const [draft, setDraft] = useState<CalSettings>(() => ({ ...settings, kinds: [...settings.kinds], staff: [...settings.staff] }))
  const [palette, setPalette] = useState<string | null>(null) // 'k:<id>' · 's:<id>'
  const seq = useRef(0)
  const problem = firstProblem(draft)

  const patch = (next: Partial<CalSettings>) => setDraft((prev) => ({ ...prev, ...next }))
  const setKind = (id: string, next: Partial<CalKind>) => setDraft((prev) => ({ ...prev, kinds: prev.kinds.map((k) => (k.id === id ? { ...k, ...next } : k)) }))
  const setStaff = (id: string, next: Partial<CalStaff>) => setDraft((prev) => ({ ...prev, staff: prev.staff.map((s) => (s.id === id ? { ...s, ...next } : s)) }))

  // 새 id: 시각 + 차례(열 때 있던 id·지금 id와 겹치지 않게)
  function newId(prefix: 'k' | 's'): string {
    const taken = new Set([...settings.kinds, ...settings.staff, ...draft.kinds, ...draft.staff].map((item) => item.id))
    for (;;) {
      seq.current += 1
      const id = `${prefix}-${Date.now().toString(36)}-${seq.current}`
      if (!taken.has(id)) return id
    }
  }

  function moveKind(index: number, by: -1 | 1) {
    const to = index + by
    if (to < 0 || to >= draft.kinds.length) return
    const kinds = [...draft.kinds]
    const [moved] = kinds.splice(index, 1)
    kinds.splice(to, 0, moved!)
    patch({ kinds })
  }

  function addStaff() {
    const used = new Set(draft.staff.map((s) => s.color))
    const color = CAL_COLORS.find((c) => !used.has(c)) ?? 'gray'
    patch({ staff: [...draft.staff, { id: newId('s'), name: '', mark: '', color }] })
  }

  function save() {
    if (problem !== null || busy) return
    onSave({
      kinds: draft.kinds.map((k) => ({ id: k.id, name: k.name.trim(), len: k.len, color: k.color })),
      staff: draft.staff.map((s) => ({ id: s.id, name: s.name.trim(), mark: s.mark.trim(), color: s.color })),
      openHour: draft.openHour,
      closeHour: draft.closeHour,
      sunday: draft.sunday,
    })
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
          {draft.kinds.map((kind, i) => {
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
                    disabled={i === draft.kinds.length - 1}
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
                  disabled={draft.kinds.length < 2}
                  className={DELETE}
                  onClick={() => patch({ kinds: draft.kinds.filter((k) => k.id !== kind.id) })}
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
                      {kind.color ? COLOR_NAMES[kind.color] : '시행자 색 따름'}
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
                      forKind
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
            onClick={() => patch({ kinds: [...draft.kinds, { id: newId('k'), name: '', len: 30, color: null }] })}
          >
            <PlusIcon />
            종류 더하기
          </button>
          <span className="text-caption text-muted">지운 종류의 지난 예약은 그 이름 그대로 남아요</span>
        </div>
      </Fieldset>
      <div aria-hidden="true" className="h-px bg-line" />

      <Fieldset title="시행자" text="예약 칸 끝에 (가)처럼 한 글자로 보여요. 담당 색을 따르는 종류는 이 색으로 칠해요.">
        <ul aria-label="시행자" className="grid gap-1.5">
          {draft.staff.map((person) => {
            const open = palette === `s:${person.id}`
            const markBad = [...person.mark.trim()].length !== 1
            return (
              <li key={person.id} className={`${ROW} grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2`}>
                <input
                  aria-label="시행자 이름"
                  value={person.name}
                  maxLength={CAL_LABEL_MAX}
                  placeholder="이름"
                  aria-invalid={person.name.trim() === '' || undefined}
                  className={SMALL_INPUT}
                  onChange={(event) => setStaff(person.id, { name: event.target.value })}
                />
                <span className="inline-flex items-center gap-1.5 text-caption text-muted">
                  표시
                  <input
                    aria-label="표시 한 글자"
                    value={person.mark}
                    maxLength={2}
                    aria-invalid={markBad || undefined}
                    className={`${FIELD} w-10 text-center font-semibold max-md:w-11`}
                    onChange={(event) => setStaff(person.id, { mark: event.target.value })}
                  />
                </span>
                <button
                  type="button"
                  aria-label="색 고르기"
                  aria-expanded={open}
                  className={colorButton(open)}
                  onClick={() => setPalette(open ? null : `s:${person.id}`)}
                >
                  <Swatch color={person.color} />
                  <span aria-hidden="true" className="text-caption text-muted">
                    ▼
                  </span>
                </button>
                <button type="button" className={DELETE} onClick={() => patch({ staff: draft.staff.filter((s) => s.id !== person.id) })}>
                  지우기
                </button>
                {open && (
                  <div className="col-span-4">
                    <Palette
                      color={person.color}
                      forKind={false}
                      onPick={(color) => {
                        if (color) setStaff(person.id, { color })
                        setPalette(null)
                      }}
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        <div>
          <button type="button" className={ds.button.secondarySmall} onClick={addStaff}>
            <PlusIcon />
            시행자 더하기
          </button>
        </div>
      </Fieldset>
      <div aria-hidden="true" className="h-px bg-line" />

      <Fieldset title="보이는 시간" text="예약표에 보이는 시간이에요. 칸은 10분 단위예요.">
        <div className="flex flex-wrap items-center gap-2 text-small text-ink-2">
          <select aria-label="시작 시간" value={draft.openHour} className={SELECT} onChange={(event) => patch({ openHour: Number(event.target.value) })}>
            {OPEN_HOURS.map((h) => (
              <option key={h} value={h}>
                {hm(h * 60)}
              </option>
            ))}
          </select>
          부터
          <select aria-label="끝 시간" value={draft.closeHour} className={SELECT} onChange={(event) => patch({ closeHour: Number(event.target.value) })}>
            {CLOSE_HOURS.map((h) => (
              <option key={h} value={h}>
                {hm(h * 60)}
              </option>
            ))}
          </select>
          까지
        </div>
        <div className="flex flex-wrap items-center gap-2 text-small text-ink-2">
          주 보기 요일
          <div role="group" aria-label="주 보기 요일" className={ds.segment.group}>
            {(
              [
                [false, '월~토'],
                [true, '월~일'],
              ] as const
            ).map(([sunday, label]) => (
              <button
                key={label}
                type="button"
                aria-pressed={draft.sunday === sunday}
                className={`${ds.segment.button} ${draft.sunday === sunday ? ds.segment.on : ds.segment.off}`}
                onClick={() => patch({ sunday })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </Fieldset>

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

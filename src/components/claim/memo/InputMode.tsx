'use client'

import { useId, type ReactNode } from 'react'
import { ds } from '@/components/ui/classes'
import type { DateRange } from '@/types/dates'
import type { CodeChip, InputSelection } from '@/types/precheck'
import { dayLabel } from '../dateList'

// 입력 방식 칸(AC-018.8~AC-018.11, 입력 쪽 승인 목업). 처방코드별이 왼쪽이고 먼저 골라져 있다. 안내 글과 코드 단추는 Worker의 inputTargets가 정한다.
// 고른 방식은 어디에도 저장하지 않는다

const PREP = {
  code: '입력 전에 비트 내원내역 창을 이 기간이 모두 들어가게 띄워 두세요. 처방코드 칸은 비우거나 같은 코드로 맞추고, 상병 검색칸은 비워 두세요.',
  date: '입력 전에 비트 내원내역 창을 이 날짜가 모두 들어가게 띄워 두고, 처방코드·상병 검색칸은 비워 두세요.',
} as const
/** 없으면 크롬 날짜 칸이 연도를 여섯 자리까지 받는다 */
const DATE_MAX = '9999-12-31'

/** 처음 값: 처방코드별, 시작·끝은 그 기간 전체. 날짜별은 하루(그 기간 첫날), 시작~끝은 그 기간 전체(AC-018.8) */
export function defaultSelection(visible: DateRange): InputSelection {
  return { mode: 'code', from: visible.from, to: visible.to, typed: '', chip: '', kind: 'day', day: visible.from, rangeFrom: visible.from, rangeTo: visible.to }
}

function DateField({ label, value, disabled, onChange }: { label: string; value: string; disabled: boolean; onChange(value: string): void }) {
  const id = useId()
  return (
    <div className={ds.field}>
      <label className={ds.label} htmlFor={id}>
        {label}
      </label>
      <input id={id} type="date" max={DATE_MAX} className={ds.input} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}

const choice = 'flex cursor-pointer flex-col gap-0.5 rounded-control border border-line-strong bg-surface px-3 py-2 has-checked:border-accent has-checked:bg-accent-soft has-disabled:cursor-not-allowed has-disabled:opacity-60'

export type InputModeProps = { visible: DateRange; selection: InputSelection; onSelection(next: InputSelection): void; problem: string | null; chips: readonly CodeChip[]; typedOverChip: boolean; locked: boolean; children?: ReactNode }

export function InputMode({ visible, selection, onSelection, problem, chips, typedOverChip, locked, children }: InputModeProps) {
  const set = (over: Partial<InputSelection>) => onSelection({ ...selection, ...over })
  const typedId = useId()
  const radioName = useId()
  const kindName = useId()
  return (
    <section aria-label="입력 방식" className={`${ds.panel} flex min-w-0 flex-col gap-3 p-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className={ds.panelTitle}>입력 방식</h3>
        <span className={ds.count}>
          불러온 기간 {dayLabel(visible.from)} ~ {dayLabel(visible.to)}
        </span>
      </div>
      {children}
      <div role="radiogroup" aria-label="입력 방식 고르기" className="grid grid-cols-2 gap-2">
        <label className={choice}>
          <span className="flex items-center gap-2 text-small font-semibold text-ink">
            <input type="radio" name={radioName} value="code" aria-label="처방코드별" checked={selection.mode === 'code'} disabled={locked} onChange={() => set({ mode: 'code' })} />
            처방코드별
          </span>
          <span className={ds.help}>기간 안에서 코드 하나가 있는 사람</span>
        </label>
        <label className={choice}>
          <span className="flex items-center gap-2 text-small font-semibold text-ink">
            <input type="radio" name={radioName} value="date" aria-label="날짜별" checked={selection.mode === 'date'} disabled={locked} onChange={() => set({ mode: 'date' })} />
            날짜별
          </span>
          <span className={ds.help}>고른 날의 아직 안 된 사람 모두</span>
        </label>
      </div>
      {locked && <p className="text-small font-medium text-ink-2">입력이 끝난 뒤 입력 방식을 바꿔 주세요</p>}
      {selection.mode === 'code' ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <DateField label="시작" value={selection.from} disabled={locked} onChange={(from) => set({ from })} />
            <DateField label="끝" value={selection.to} disabled={locked} onChange={(to) => set({ to })} />
          </div>
          <div className={ds.field}>
            <label className={ds.label} htmlFor={typedId}>
              처방코드 넣기
            </label>
            <input id={typedId} className={ds.input} placeholder="예: LA358" autoComplete="off" spellCheck={false} value={selection.typed} disabled={locked} onChange={(event) => set({ typed: event.target.value })} />
          </div>
          <div className={ds.field}>
            <span className={ds.label}>또는 코드 단추 고르기</span>
            <div className="flex flex-wrap gap-2">
              {chips.map((chip) => (
                <button key={chip.code} type="button" aria-pressed={selection.chip === chip.code} disabled={locked} className={`${ds.button.secondarySmall} aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent-strong`} onClick={() => set({ chip: selection.chip === chip.code ? '' : chip.code })}>
                  <b className="font-semibold">{chip.code}</b> {chip.name} · {chip.count}건
                </button>
              ))}
            </div>
            <span className={ds.help}>많은 차례예요. 건수는 불러온 기간에서 완료와 메모 없는 사람을 뺀 수예요.</span>
            {typedOverChip && <span className="text-caption font-medium text-warning">칸에 적은 코드를 먼저 써요. 단추를 쓰려면 칸을 비워 주세요.</span>}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div role="radiogroup" aria-label="날짜 고르는 법" className="flex flex-wrap gap-3 text-small text-ink">
            <label className="inline-flex cursor-pointer items-center gap-1.5">
              <input type="radio" name={kindName} value="day" checked={selection.kind === 'day'} disabled={locked} onChange={() => set({ kind: 'day' })} />
              하루
            </label>
            <label className="inline-flex cursor-pointer items-center gap-1.5">
              <input type="radio" name={kindName} value="range" checked={selection.kind === 'range'} disabled={locked} onChange={() => set({ kind: 'range' })} />
              시작~끝
            </label>
          </div>
          {selection.kind === 'day' ? (
            <DateField label="날짜" value={selection.day} disabled={locked} onChange={(day) => set({ day })} />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <DateField label="시작" value={selection.rangeFrom} disabled={locked} onChange={(rangeFrom) => set({ rangeFrom })} />
              <DateField label="끝" value={selection.rangeTo} disabled={locked} onChange={(rangeTo) => set({ rangeTo })} />
            </div>
          )}
        </div>
      )}
      {!locked && problem && (
        <p role="status" aria-live="polite" className="rounded-control bg-warning-soft px-3 py-2 text-small font-medium text-ink">
          {problem}
        </p>
      )}
      <p className={ds.help}>{PREP[selection.mode]}</p>
    </section>
  )
}

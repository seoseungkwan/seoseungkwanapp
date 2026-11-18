'use client'

import { useId } from 'react'
import { ds } from '@/components/ui/classes'
import type { DateRange } from '@/types/dates'
import type { CodeChip, InputSelection } from '@/types/precheck'
import { dayLabel } from '../dateList'

// 입력 방식(AC-018.8~AC-018.11). 두 칸 위 한 줄 모양이다(AC-3106.2, memo-split 목업): 고르는 것·이름·동작은 그대로이고 좁으면 줄이 바뀐다.
// 안내 글과 코드 단추는 Worker의 inputTargets가 정한다. 고른 방식(처방코드별·날짜별)만 ClaimScreen이 병원 설정 줄에 기억한다(clinic-profile REQ-6610):
// 처음 값은 defaultSelection(visible, savedMode)이 정하고, 이 칸은 저장소를 부르지 않는다. 날짜·코드 같은 다른 칸은 어디에도 저장하지 않는다

const PREP = {
  code: '입력 전에 비트 내원내역 창을 이 기간이 모두 들어가게 띄워 두세요. 처방코드 칸은 비우거나 같은 코드로 맞추고, 상병 검색칸은 비워 두세요.',
  date: '입력 전에 비트 내원내역 창을 이 날짜가 모두 들어가게 띄워 두고, 처방코드·상병 검색칸은 비워 두세요.',
} as const
/** 방식 설명(예전 고르기 칸 아래 글) */
const MODE_HELP = { code: '처방코드별: 기간 안에서 코드 하나가 있는 사람', date: '날짜별: 고른 날의 아직 안 된 사람 모두' } as const
const CHIP_HELP = '많은 차례예요. 건수는 불러온 기간에서 완료와 메모 없는 사람을 뺀 수예요.'
/** 없으면 크롬 날짜 칸이 연도를 여섯 자리까지 받는다 */
const DATE_MAX = '9999-12-31'

/**
 * 처음 값: 날짜별 · 시작~끝 · 불러온 기간 전체(AC-3106.3, 기간의 모든 환자가 목록에 나온다). 처방코드별은 그 기간 전체, 하루는 그 기간 첫날(AC-018.8).
 * 저장된 방식이 'code'면 처방코드별로 시작한다. 없거나 'date'면 지금처럼 날짜별이다(clinic-profile AC-6610.1)
 */
export function defaultSelection(visible: DateRange, savedMode?: InputSelection['mode'] | null): InputSelection {
  return { mode: savedMode === 'code' ? 'code' : 'date', from: visible.from, to: visible.to, typed: '', chip: '', kind: 'range', day: visible.from, rangeFrom: visible.from, rangeTo: visible.to }
}

/** 줄 안의 작은 칸: 28px 높이 */
const small =
  'h-7 min-w-0 rounded-control border border-line-strong bg-surface px-2 text-small text-ink placeholder:text-muted not-disabled:hover:border-muted focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-60'
const radio = 'inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-small text-ink has-disabled:cursor-not-allowed has-disabled:opacity-60'

function DateField({ label, value, disabled, onChange }: { label: string; value: string; disabled: boolean; onChange(value: string): void }) {
  const id = useId()
  return (
    <span className="inline-flex items-center gap-1.5">
      <label className="whitespace-nowrap text-caption text-muted" htmlFor={id}>
        {label}
      </label>
      <input id={id} type="date" max={DATE_MAX} className={`${small} w-34`} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </span>
  )
}

export type InputModeProps = { visible: DateRange; selection: InputSelection; onSelection(next: InputSelection): void; problem: string | null; chips: readonly CodeChip[]; typedOverChip: boolean; locked: boolean }

export function InputMode({ visible, selection, onSelection, problem, chips, typedOverChip, locked }: InputModeProps) {
  const set = (over: Partial<InputSelection>) => onSelection({ ...selection, ...over })
  const typedId = useId()
  const radioName = useId()
  const kindName = useId()
  const help = [MODE_HELP[selection.mode], ...(selection.mode === 'code' ? [CHIP_HELP] : []), PREP[selection.mode]]
  return (
    <section aria-label="입력 방식" className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <span className="whitespace-nowrap text-small font-semibold text-ink">입력 방식</span>
        <div role="radiogroup" aria-label="입력 방식 고르기" className="flex items-center gap-3">
          <label className={radio}>
            <input type="radio" name={radioName} value="code" aria-label="처방코드별" className="accent-accent" checked={selection.mode === 'code'} disabled={locked} onChange={() => set({ mode: 'code' })} />
            처방코드별
          </label>
          <label className={radio}>
            <input type="radio" name={radioName} value="date" aria-label="날짜별" className="accent-accent" checked={selection.mode === 'date'} disabled={locked} onChange={() => set({ mode: 'date' })} />
            날짜별
          </label>
        </div>
        <span aria-hidden="true" className="h-4.5 w-px bg-line-strong" />
        {selection.mode === 'code' ? (
          <>
            <DateField label="시작" value={selection.from} disabled={locked} onChange={(from) => set({ from })} />
            <DateField label="끝" value={selection.to} disabled={locked} onChange={(to) => set({ to })} />
            <label className="sr-only" htmlFor={typedId}>
              처방코드 넣기
            </label>
            <input id={typedId} className={`${small} w-28`} placeholder="예: LA358" autoComplete="off" spellCheck={false} value={selection.typed} disabled={locked} onChange={(event) => set({ typed: event.target.value })} />
            <span className="text-small text-muted">또는</span>
            {chips.map((chip) => (
              <button
                key={chip.code}
                type="button"
                aria-pressed={selection.chip === chip.code}
                disabled={locked}
                className={`${ds.button.secondarySmall} aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent-strong`}
                onClick={() => set({ chip: selection.chip === chip.code ? '' : chip.code })}
              >
                <b className="font-semibold">{chip.code}</b> {chip.name} · {chip.count}건
              </button>
            ))}
          </>
        ) : (
          <>
            <div role="radiogroup" aria-label="날짜 고르는 법" className="flex items-center gap-3">
              <label className={radio}>
                <input type="radio" name={kindName} value="day" className="accent-accent" checked={selection.kind === 'day'} disabled={locked} onChange={() => set({ kind: 'day' })} />
                하루
              </label>
              <label className={radio}>
                <input type="radio" name={kindName} value="range" className="accent-accent" checked={selection.kind === 'range'} disabled={locked} onChange={() => set({ kind: 'range' })} />
                시작~끝
              </label>
            </div>
            {selection.kind === 'day' ? (
              <DateField label="날짜" value={selection.day} disabled={locked} onChange={(day) => set({ day })} />
            ) : (
              <>
                <DateField label="시작" value={selection.rangeFrom} disabled={locked} onChange={(rangeFrom) => set({ rangeFrom })} />
                <DateField label="끝" value={selection.rangeTo} disabled={locked} onChange={(rangeTo) => set({ rangeTo })} />
              </>
            )}
          </>
        )}
        <span className={`${ds.count} ml-auto`}>
          불러온 기간 {dayLabel(visible.from)} ~ {dayLabel(visible.to)}
        </span>
      </div>
      {locked && <p className="text-small font-medium text-ink-2">입력이 끝난 뒤 입력 방식을 바꿔 주세요</p>}
      {!locked && problem && (
        <p role="status" aria-live="polite" className="rounded-control bg-warning-soft px-3 py-1.5 text-small font-medium text-ink">
          {problem}
        </p>
      )}
      {selection.mode === 'code' && typedOverChip && <p className="text-caption font-medium text-warning">칸에 적은 코드를 먼저 써요. 단추를 쓰려면 칸을 비워 주세요.</p>}
      <p className={`${ds.help} flex flex-wrap gap-x-1.5`}>
        {help.map((text) => (
          <span key={text}>{text}</span>
        ))}
      </p>
    </section>
  )
}

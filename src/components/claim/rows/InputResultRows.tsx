import { ds } from '@/components/ui/classes'
import type { InputResultLine } from '@/types/precheck'
import { dayLabel } from '../dateList'

// 입력 결과 줄(AC-018.4). 자료에 없는 진료는 이름 대신 날짜(모르면 달)다: 자리 채움 값은 여기 오지 않는다(AC-018.16). 줄은 props로만 받는다

const when = (line: InputResultLine) => (line.date ? dayLabel(line.date) : `${Number(line.month.slice(5))}월`)

export function InputResultRows({ lines }: { lines: readonly InputResultLine[] }) {
  return (
    <ul className="flex list-none flex-col">
      {lines.map((line) => (
        <li key={line.key} className="flex flex-col gap-1 border-t border-line py-2">
          <span className="flex flex-wrap items-center gap-2">
            <span className="whitespace-nowrap text-small text-ink-2">{when(line)}</span>
            {line.name && <span className="whitespace-nowrap text-small font-semibold text-ink">{line.name}</span>}
            {line.previousMemo !== undefined && <span className={ds.chip.warning}>바꿈 (기존 메모 덮어씀)</span>}
            {line.retry && <span className={ds.chip.neutral}>다시 할 수 있음</span>}
          </span>
          {line.reason && <span className="text-small text-ink-2">{line.reason}</span>}
          {line.previousMemo !== undefined && (
            <div className="grid gap-2 md:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-0.5 rounded-control border border-line bg-canvas px-2 py-1.5 text-caption text-ink-2">
                <i className="font-medium not-italic text-muted">이전 메모 (기록에 남아 있어요)</i>
                <span className="whitespace-pre-wrap break-words">{line.previousMemo}</span>
              </div>
              <div className="flex min-w-0 flex-col gap-0.5 rounded-control border border-line bg-canvas px-2 py-1.5 text-caption text-ink-2">
                <i className="font-medium not-italic text-muted">넣은 메모</i>
                <span className="whitespace-pre-wrap break-words">{line.memo}</span>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

import { ds } from '@/components/ui/classes'
import type { BitGhost, BlockPlace } from '@/lib/calendar/shapes'
import { linesFor, placeStyle, type BlockMode } from './ApptBlock'
import { ghostLabel, Hatch, hm } from './parts'

// 비트 예약 칸(spec clinic-calendar AC-5905.7, 시안 .ev.ghost·기본값 18번). 비트 PC에서만 화면이 넘겨주고 보기만 한다:
// 흐린 회색 빗금·점선, `비트 예약 차트번호 이름`. 비트에 길이가 없어 20분 칸으로 그린다. 누르면 화면이 아래 안내 글을 띄운다

export const GHOST_LEN = 20
export const GHOST_NOTE = '비트에 있는 예약이에요. 여기서는 보기만 하고, 고치려면 비트에서 해요.'

const PAD = { week: 'py-px pr-0.5 pl-1 leading-3.5', day: 'py-0.5 pr-1.5 pl-1.5 leading-4' } as const

export function GhostBlock({
  ghost,
  place,
  top,
  height,
  mode,
  onOpen,
}: {
  ghost: BitGhost
  place: BlockPlace
  top: number
  height: number
  mode: BlockMode
  onOpen: (key: string) => void
}) {
  const label = ghostLabel(ghost)
  return (
    <button
      type="button"
      data-block="ghost"
      data-col={place.col}
      data-cols={place.cols}
      data-span={place.span}
      aria-label={label}
      title={label}
      onClick={() => onOpen(ghost.key)}
      style={placeStyle(place, top, height)}
      className={`absolute z-1 flex cursor-help flex-col overflow-clip rounded-control border border-dashed border-faint bg-canvas text-left text-caption text-muted ${PAD[mode]} ${ds.focusRing}`}
    >
      <Hatch kind="ghost" className="text-line" />
      <span className="relative line-clamp-1" style={{ WebkitLineClamp: linesFor(height, mode) }}>
        <span className="whitespace-nowrap font-semibold text-ink-2">비트 예약</span>
        {ghost.chart ? (
          <>
            {' '}
            <span className="whitespace-nowrap tabular-nums">{ghost.chart}</span>
          </>
        ) : null}
        {ghost.name ? (
          <>
            {' '}
            <span className="whitespace-nowrap">{ghost.name}</span>
          </>
        ) : null}
        {mode === 'day' ? (
          <>
            {' '}
            <span className="whitespace-nowrap text-ink-2">{hm(ghost.start)}</span>
          </>
        ) : null}
      </span>
    </button>
  )
}

import { ds } from '@/components/ui/classes'
import type { FixCell } from '@/lib/calendar/gshapes'
import type { BlockPlace } from '@/lib/calendar/shapes'
import { linesFor, placeStyle, type BlockMode } from './ApptBlock'
import { FIX_LOOK, FixText, fixLabel, Hatch } from './parts'

// 고쳐야 할 구글 일정 칸(spec google-link AC-8532.2, 시안 ?s=fix .ev.gfix). 웹앱이 알아보지 못한 구글 일정을 그 시간 자리에
// 노란 빗금·점선 칸 '고쳐야 함 {구글 제목}'으로 그린다(구글 색 아님). 예약 칸과 같이 layoutDay로 나란히 놓고, 누르면 고쳐야 할 판(onOpen)

const PAD = { week: 'py-px pr-0.5 pl-1 leading-3.5', day: 'py-0.5 pr-1.5 pl-1.5 leading-4' } as const

export function FixBlock({
  fix,
  place,
  top,
  height,
  mode,
  onOpen,
}: {
  fix: FixCell
  place: BlockPlace
  top: number
  height: number
  mode: BlockMode
  onOpen: (id: string) => void
}) {
  const label = fixLabel(fix)
  return (
    <button
      type="button"
      data-block="fix"
      data-col={place.col}
      data-cols={place.cols}
      data-span={place.span}
      aria-label={label}
      title={label}
      onClick={() => onOpen(fix.id)}
      style={placeStyle(place, top, height)}
      className={`absolute z-1 flex cursor-pointer flex-col overflow-clip rounded-control text-left text-caption hover:z-4 hover:shadow-float focus-visible:z-4 ${PAD[mode]} ${FIX_LOOK} ${ds.focusRing}`}
    >
      <Hatch kind="fix" className="text-warning opacity-10" />
      <span className="relative line-clamp-1" style={{ WebkitLineClamp: linesFor(height, mode) }}>
        <FixText fix={fix} />
      </span>
    </button>
  )
}

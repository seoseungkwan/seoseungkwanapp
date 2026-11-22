import { ClockIcon, PrintIcon } from './icons'
import { look } from './look'
import { FRAME_TEXT as T } from './text'

// 후보 머리(시안 .chead): 후보 표시·진행 상태 칩 · 이름 · 주소와 후보 매물 한 줄 · 굳혀 둔 날 + [오늘 값으로 다시 받기] · 단추 셋.
// 글은 모두 부르는 쪽(CandidateFrame)이 만들어 넘긴다

export type FrameTab = 'report' | 'prep' | 'listings'

export type FrameHeadProps = {
  letter?: string
  status: string
  name: string
  /** 주소 · 전용 평 · 보증금 / 월세 한 줄(없으면 그리지 않음) */
  line: string
  /** 굳혀 둔 날 글 또는 `아직 받은 값이 없어요.` */
  frozen: string
  /** 받는 중 글(`자료 {n}/{m}`) — 있으면 다시 받기를 막는다 */
  progress: string | null
  onRefresh: () => void
  onGo: (tab: FrameTab) => void
}

export function FrameHead({ letter, status, name, line, frozen, progress, onRefresh, onGo }: FrameHeadProps) {
  return (
    <div className="mt-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          {letter && <span className={look.chipAccent}>{T.candidate(letter)}</span>}
          <span className={look.chipNeutral}>{status}</span>
        </div>
        <h2 className="mt-1.5 text-heading-m font-semibold text-ink">{name}</h2>
        {line !== '' && <p className="mt-0.5 text-body text-ink-2">{line}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-muted">
          <ClockIcon />
          <span>{frozen}</span>
          {progress !== null && (
            <span role="status" className="font-medium tabular-nums text-ink-2">
              {progress}
            </span>
          )}
          <button type="button" className={look.textButton} disabled={progress !== null} onClick={onRefresh}>
            {T.refresh}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={look.button} onClick={() => onGo('report')}>
          <PrintIcon />
          {T.report}
        </button>
        <button type="button" className={look.button} onClick={() => onGo('prep')}>
          {T.prep}
        </button>
        <button type="button" className={look.button} onClick={() => onGo('listings')}>
          {T.listings}
        </button>
      </div>
    </div>
  )
}

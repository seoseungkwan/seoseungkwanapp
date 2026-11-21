import { ds } from '@/components/ui/classes'
import { BOARD_URLS, boardLinkText, checkedText, safeLink, sourceName, stoppedBody, stoppedTitle } from '@/lib/notices/view'
import type { FillProgress, SourceView } from '@/types/notices'
import { ClockIcon, ExternalIcon, WarnIcon } from './icons'

// 글 목록의 출처 상태(specs/notices AC-7419.6·AC-7419.7, 시안 .checked·.note): 확인 줄 · 못 가져옴 띠 · 처음 채우기 띠.
// 글자는 lib/notices/view(기본값 1·2)가 만들고 여기서는 놓기만 한다

const countText = (n: number) => n.toLocaleString('ko-KR')

// 띠 링크: 글자 단추 모양(ds.textButton)의 small 크기
const BAND_LINK = `inline-flex items-center gap-1 rounded-control text-small font-medium text-accent underline-offset-3 transition hover:underline ${ds.focusRing}`

/** 확인 줄: '매일 아침 확인해요'와 출처마다 '{출처} 오늘 {시각} 확인' 또는 못 가져옴 글. 확인한 적 없는 출처는 뺀다 */
export function CheckedLine({ rows, now }: { rows: readonly SourceView[]; now: Date }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3.5 gap-y-0.5 text-caption text-muted">
      <span className="inline-flex items-center gap-1 font-medium text-ink-2">
        <ClockIcon />
        매일 아침 확인해요
      </span>
      {rows.map((row) => {
        const text = checkedText(row, now)
        if (text === null) return null
        if (row.state === 'stopped') {
          return (
            <span key={row.source} className="font-semibold text-warning">
              {text}
            </span>
          )
        }
        const name = sourceName(row.source)
        return (
          <span key={row.source}>
            <b className="font-medium text-ink-2">{name}</b>
            {text.slice(name.length)}
          </span>
        )
      })}
    </p>
  )
}

/** 멈춘 출처 하나의 노란 띠: 제목 · 글(기본값 2) · 그 출처 게시판 열기(새 창) */
export function StoppedBand({ row, rows, now }: { row: SourceView; rows: readonly SourceView[]; now: Date }) {
  const href = safeLink(BOARD_URLS[row.source])
  return (
    <div role="status" data-band="stopped" className="mt-4 flex items-start gap-2.5 rounded-control bg-warning-soft px-4 py-3 text-small">
      <WarnIcon className="mt-0.5 shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        <b className="block text-body font-semibold text-ink">{stoppedTitle(row, now)}</b>
        <p className="text-ink-2">{stoppedBody(row, rows, now)}</p>
        {href && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <a className={BAND_LINK} href={href} target="_blank" rel="noopener noreferrer">
              {boardLinkText(row.source)}
              <ExternalIcon />
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

/** 지난 글 채우기가 남았나: 출처 하나라도 채움 끝이 아니거나 일괄 중인 글이 있음 */
export function filling(rows: readonly SourceView[] | null, fill: FillProgress): boolean {
  return fill.batching > 0 || (rows !== null && rows.some((row) => !row.backfillDone))
}

/** 처음 채우기 파란 띠: 진행 막대와 '지난 글 {전체}건 중 {채운}건 채웠어요 ({퍼센트}%)'(퍼센트는 버림, 기본값 3) */
export function BackfillBand({ fill }: { fill: FillProgress }) {
  const percent = fill.total > 0 ? Math.min(100, Math.floor((fill.done * 100) / fill.total)) : 0
  const progress = `지난 글 ${countText(fill.total)}건 중 ${countText(fill.done)}건 채웠어요`
  return (
    <div role="status" data-band="backfill" className="mt-4 flex items-start gap-2.5 rounded-control bg-accent-soft px-4 py-3 text-small">
      <ClockIcon className="mt-0.5 shrink-0 text-accent-strong" />
      <div className="min-w-0 flex-1">
        <b className="block text-body font-semibold text-ink">올해 1월부터 지난 글을 채우는 중이에요</b>
        <div className="mt-2 flex items-center gap-2.5">
          <span
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={fill.total}
            aria-valuenow={fill.done}
            aria-label={progress}
            className="block h-2 max-w-105 flex-1 overflow-clip rounded-control bg-surface ring-1 ring-accent/25 ring-inset"
          >
            <span className="block h-full rounded-control bg-accent" style={{ width: `${percent}%` }} />
          </span>
          <span className="whitespace-nowrap text-small font-semibold text-accent-strong">{`${progress} (${percent}%)`}</span>
        </div>
        <p className="mt-1.5 text-ink-2">
          요약을 한꺼번에 만들고 있어 하루쯤 걸려요. 채운 글은 바로 볼 수 있어요. 요약이 아직 없는 글은 관련 여부를 몰라 관련 글만 보기에도 함께 보여요.
        </p>
      </div>
    </div>
  )
}

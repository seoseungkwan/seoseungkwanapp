'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { ds } from '@/components/ui/classes'
import { errorInfo } from '@/lib/errors'
import type { FillDone, FillStatus } from '@/lib/gsheet/status'
import { ExtIcon, FillingIcon, SheetIcon, WarnIcon } from './icons'
import { VIEW } from './labels'
import { clockOf, stopReason } from './sheetParts'

// 수납일지 구글 시트 위 한 줄 띠(spec google-link AC-8514.3·AC-8514.7·AC-8515.1·AC-8515.2·AC-8515.5, 시안 notes-sunap '공통'·filling·nobit·err-google).
// 왼쪽: 시트 그림 + 파일 이름(달 자리 뺀 것) + 달 고르기(받은 picker) + '· {d}일 시트'
// 가운데(넣기 상태, lib/gsheet/status): 넣는 PC가 아님(아직 모름 포함) → [보기만] · 넣는 중 → 넣는 중 그림 · 멈춤 → [넣기 멈춤] · 그 밖 → 저절로 넣기 칩
// 오른쪽: 넣는 PC만 [지금 넣기]([다시 해 보기])·[덮어쓰기…]·[설정], 늘 [새 창으로 열기 ↗](파일을 알 때)
// '마지막 HH:mm (n줄)'은 오늘 시트에 넣은 마지막 성공(lastOk)이 오늘 것일 때만. 넣은 줄 수(n)는 도우미 답 rows 그대로.
// 아래 두 알림도 이 파일: 멈춤 주황 알림(StopNotice, 넣는 PC)·옛 도우미·옛 확장 안내(OldVersionNotice, design.md 2절 표 2)

export type SheetBandProps = {
  /** 파일 이름 앞부분(달 자리는 picker가 맡음) */
  title: string
  picker: ReactNode
  /** 틀이 연 날짜 시트(이번 달은 오늘, 지난 달은 1) */
  day: number
  status: FillStatus
  autoOn: boolean
  everyMin: number
  /** 한국 오늘 */
  today: string
  /** 새 창 주소(파일을 모르면 null — 단추 없음) */
  openHref: string | null
  onFillNow: () => void
  onOverwrite: () => void
  onOpenSettings: () => void
}

/** 오늘 시트에 넣은 마지막 성공(오늘 것만) */
const todayOk = (lastOk: FillDone | null, today: string) => (lastOk !== null && lastOk.day === today ? lastOk : null)

export function OpenLink({ href, primary = false, children }: { href: string; primary?: boolean; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${primary ? ds.button.primarySmall : ds.button.secondarySmall} no-underline`}>
      {children}
      <ExtIcon />
    </a>
  )
}

function BandStatus({ status, autoOn, everyMin, today }: Pick<SheetBandProps, 'status' | 'autoOn' | 'everyMin' | 'today'>) {
  const ok = todayOk(status.lastOk, today)
  if (status.pc !== 'filler') {
    return (
      <>
        <span className={ds.chip.neutral}>{VIEW.viewOnly}</span>{' '}
        <span>
          <b className="font-semibold text-ink-2">{VIEW.viewOnlyHead}</b>
          {VIEW.viewOnlyText}
          {ok && VIEW.viewOnlyLast(clockOf(ok.at), ok.rows)}
        </span>
      </>
    )
  }
  if (status.filling) {
    const day = Number(status.filling.day.slice(8, 10))
    const mode = status.filling.mode === 'overwrite' ? VIEW.modeOverwrite : VIEW.modeFillEmpty
    return (
      <>
        <FillingIcon />
        <b className="font-semibold text-accent-strong">{VIEW.filling}</b>{' '}
        <span>{VIEW.fillingWhat(day, mode)}</span>
      </>
    )
  }
  if (status.stopped) {
    return (
      <>
        <span className={ds.chip.warning}>{VIEW.stopped}</span>{' '}
        <span>
          <b className="font-semibold text-ink-2">{stopReason(status.stopped.code).band}</b>
          {VIEW.stoppedAt(clockOf(status.stopped.at))}
          {autoOn && VIEW.stoppedRetry(everyMin)}
        </span>
      </>
    )
  }
  if (!autoOn) {
    return (
      <>
        <span className={ds.chip.neutral}>{VIEW.autoOff}</span> <span>{VIEW.autoOffHint}</span>
      </>
    )
  }
  const check = ok !== null && ok.outcome === 'warn'
  return (
    <>
      <span className={check ? ds.chip.warning : ds.chip.positive}>{check ? VIEW.autoOnCheck : VIEW.autoOn}</span>{' '}
      <span>
        {VIEW.autoEvery(everyMin)}
        {ok ? VIEW.autoLast(clockOf(ok.at), ok.rows) : VIEW.autoNotYet}
      </span>
    </>
  )
}

export function SheetBand(props: SheetBandProps) {
  const { title, picker, day, status, openHref, onFillNow, onOverwrite, onOpenSettings } = props
  const filler = status.pc === 'filler'
  const filling = status.filling !== null
  const stopped = status.stopped !== null && !filling
  return (
    <div data-testid="sheet-band" className="flex min-h-12.5 flex-wrap items-center gap-x-3 gap-y-2 rounded-control border border-line bg-surface py-2 pr-2 pl-3">
      <span className="inline-flex min-w-0 items-center gap-2 font-semibold whitespace-nowrap text-ink">
        <SheetIcon />
        {title !== '' && <span>{title}</span>} {picker} <small className="text-small font-medium text-muted">{VIEW.daySheet(day)}</small>
      </span>
      <span aria-hidden="true" className="h-5 w-px shrink-0 bg-line" />
      <span data-testid="sheet-band-status" className="inline-flex min-w-0 flex-wrap items-center gap-2 text-small text-muted">
        <BandStatus {...props} />
      </span>
      <span className="ml-auto inline-flex items-center gap-1.5">
        {filler &&
          (stopped ? (
            <button type="button" onClick={onFillNow} className={ds.button.primarySmall}>
              {VIEW.retry}
            </button>
          ) : (
            <button type="button" onClick={onFillNow} disabled={filling} aria-busy={filling ? true : undefined} className={ds.button.primarySmall}>
              {VIEW.fillNow}
            </button>
          ))}
        {filler && (
          <button type="button" onClick={onOverwrite} disabled={filling || stopped} className={ds.button.secondarySmall}>
            {VIEW.overwriteOpen}
          </button>
        )}
        {openHref !== null && <OpenLink href={openHref}>{VIEW.openNew}</OpenLink>}
        {filler && (
          <button type="button" onClick={onOpenSettings} className={ds.button.secondarySmall}>
            {VIEW.settings}
          </button>
        )}
      </span>
    </div>
  )
}

/** 넣기 멈춤 주황 알림(err-google): 까닭 글(굵게) + 오늘 넣은 줄은 그대로 + [연결 시험] 안내 */
export function StopNotice({ stopped, lastOk, today }: { stopped: FillDone; lastOk: FillDone | null; today: string }) {
  const ok = todayOk(lastOk, today)
  return (
    <div role="alert" className="flex items-start gap-3 rounded-control bg-warning-soft px-4 py-2 text-small text-ink-2">
      <WarnIcon />
      <p className="min-w-0 flex-1">
        <b className="font-semibold text-ink">{stopReason(stopped.code).fix}</b>
        {ok && VIEW.stopKept(clockOf(ok.at))}
        {VIEW.stopTip}
      </p>
    </div>
  )
}

/** 옛 도우미(0.14.0 미만)·옛 크롬 확장(0.5.0 미만) 안내 두 줄 + [비트 PC 연결](design.md 2절 표 2). 둘 다 새 판이면 없음 */
export function OldVersionNotice({ helper, extension }: { helper: boolean; extension: boolean }) {
  if (!helper && !extension) return null
  return (
    <div role="status" className="flex items-start gap-3 rounded-control bg-warning-soft px-4 py-2 text-small text-ink-2">
      <WarnIcon />
      <div className="grid min-w-0 flex-1 gap-0.5">
        {helper && <p>{VIEW.oldHelper}</p>}
        {extension && <p>{errorInfo('E-GSHEET-EXT').fix}</p>}
      </div>{' '}
      <Link href={VIEW.setupHref} className={ds.button.secondarySmall}>
        {VIEW.setupLink}
      </Link>
    </div>
  )
}

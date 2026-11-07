'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { compareYmd } from '@/lib/analytics/dates'
import { readOutsideCounts, type ClaimDayCount, type OutsideCounts as Counts } from '@/lib/storage/claimCounts'
import { closeDays, readClosedDays, reopenDays, type ClaimDayClose } from '@/lib/storage/claimDayCloses'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { dayLabel, statusOf } from './dateList'
import { checkedAtText } from './setup/checkedAt'

// 밖에서 보는 건수(AC-019.5). 비트 PC가 아닌 곳(집 PC·휴대폰)에서 숫자·날짜·시각만 본다. 환자 정보·경고 내용은 서버에 없어 그릴 길이 없다.
// ui-90 화면(setup/ClaimEntry)의 '준비 중' 칩 자리에 들어간다: 마지막으로 바뀐 시각 줄과 '메모 입력 현황' 패널 하나이고, 자리 전체 폭을 쓴다. h1·안내 글·링크는 그 화면의 것이다.
// 표 모양은 목업 화면 11이고 다른 곳은 둘: 끝난 날을 빼고(AC-019.5), 줄마다 바뀐 시각을 날짜 아래에 더했다.
// 날짜를 골라 완료로(spec claim-day-done REQ-2801~2803, 시안 docs/mockups/claim-day-done B): 줄 첫 칸 체크 칸으로 고르고 [완료로 저장] → 완료 표시 표(claim_day_closes)에 날짜만 보낸다.
// 완료로 바꾼 날은 위 목록·'N일 남음'에서 빠지고, 패널 맨 아래 접힌 "완료로 바꾼 날"에서 하나씩 되돌린다(누르면 바로 지운다). 건수 표의 숫자와 '마지막으로 바뀐 시각'은 그대로다
// 월말 마감 남은 일(AC-022.4)·연락 남은 건수(AC-026.4)는 뒤 TASK가 이 패널 아래에 세로로 더한다

const EMPTY = '아직 올린 건수가 없어요'
const STATUS_CHIP = { neutral: ds.chip.neutral, accent: ds.chip.accent, positive: ds.chip.positive } as const
const numHead = `${ds.table.th} text-right`
// 고르기 줄: 고르는 중은 옅은 파랑, 저장 뒤 알림은 옅은 초록(시안 .pickbar · .pickbar.saved)
const PICK_BAR = 'mx-5 mt-3 flex min-h-11 items-center justify-between gap-2 rounded-control px-3 py-1 text-small font-medium max-md:mx-4'
const PICK_TONE = 'bg-accent-soft text-accent-strong'
const SAVED_TONE = 'bg-positive-soft text-positive'
// 접는 칸 요약 줄: 44px 이상, 꺾쇠만 돈다(대시보드 ConnectSteps와 같은 초점·표식 숨김)
const SUMMARY =
  'flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-5 text-small font-medium text-ink-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-md:px-4 [&::-webkit-details-marker]:hidden'

const stamp = (at: string) => checkedAtText(new Date(at))

/** 완료로 저장·되돌리기. 실패는 던진다(패널이 E-DAYCLOSE-FAILED를 보인다) */
type Write = (dates: string[]) => Promise<void>

function DayRow({ day, picked, locked, onPick }: { day: ClaimDayCount; picked: boolean; locked: boolean; onPick(date: string): void }) {
  const status = statusOf({ done: false, needMemo: day.need_memo, entered: day.entered })
  const label = dayLabel(day.visit_date)
  const id = useId()
  return (
    <tr className={ds.table.row}>
      <td className={`${ds.table.check} relative`}>
        {/* 휴대폰에서 상자 둘레 칸 전체(44px)를 눌러도 고르게 한다(UI_GUIDE 8). 이름은 상자의 aria-label이 맡는다 */}
        <label htmlFor={id} aria-hidden="true" className="absolute inset-0 cursor-pointer" />
        <span className={ds.checkboxWrap}>
          <input id={id} type="checkbox" aria-label={`${label} 고르기`} checked={picked} disabled={locked} onChange={() => onPick(day.visit_date)} className={ds.checkbox} />
          <Icon name="check" className={ds.checkboxMark} />
        </span>
      </td>
      <td className={ds.table.td}>
        {label}
        <span className={`${ds.help} block`}>{stamp(day.updated_at)}에 바뀜</span>
      </td>
      <td className={`${ds.table.tdNum} max-md:hidden`}>{day.need_memo}</td>
      <td className={`${ds.table.tdNum} max-md:hidden`}>{day.entered}</td>
      <td className={`${ds.table.tdNum} md:hidden`}>
        {day.entered} / {day.need_memo}
      </td>
      <td className={ds.table.td}>
        <span className={STATUS_CHIP[status.tone]}>
          <span className="max-md:hidden">{status.label}</span>
          <span className="md:hidden">{status.label.replace(/ \d+\/\d+$/, '')}</span>
        </span>
      </td>
    </tr>
  )
}

function ClosedRow({ close, count, busy, onReopen }: { close: ClaimDayClose; count: ClaimDayCount | undefined; busy: boolean; onReopen(): void }) {
  const label = dayLabel(close.visit_date)
  return (
    <tr className={ds.table.row}>
      <td className={ds.table.td}>
        {label}
        {/* 폰에서는 시각 줄이 접혀 표가 옆으로 밀리지 않게 한다 */}
        <span className={`${ds.help} block max-md:whitespace-normal`}>완료로 바꿈 · {stamp(close.closed_at)}</span>
      </td>
      {/* 남은 메모가 있는 날만 숫자(비트에서 올라온 그대로). 다 입력됐거나 건수에 없는 날은 비운다(AC-2802.4) */}
      <td className={ds.table.tdNum}>{count ? `${count.entered} / ${count.need_memo}` : ''}</td>
      <td className={ds.table.td}>
        <span className={ds.chip.positive}>완료</span>
      </td>
      <td className={`${ds.table.td} text-right`}>
        <button type="button" aria-label={`${label} 되돌리기`} disabled={busy} onClick={onReopen} className={ds.button.secondarySmall}>
          되돌리기
        </button>
      </td>
    </tr>
  )
}

/** 패널 맨 아래 접힌 "완료로 바꾼 날"(AC-2802.1). 최근 날짜부터 */
function ClosedDays({ closed, left, reopening, onReopen }: { closed: readonly ClaimDayClose[]; left: readonly ClaimDayCount[]; reopening: ReadonlySet<string>; onReopen(date: string): void }) {
  const byDate = new Map(left.map((day) => [day.visit_date, day]))
  const rows = [...closed].sort((a, b) => compareYmd(b.visit_date, a.visit_date))
  return (
    <details className="group border-t border-line">
      <summary className={SUMMARY}>
        <span>
          완료로 바꾼 날 <b className="font-semibold text-ink">{closed.length}</b>
        </span>
        <Icon name="chev" className="text-muted transition group-open:rotate-180" />
      </summary>
      <p className={`${ds.help} px-5 pb-2 max-md:px-4`}>숫자는 비트에서 올라온 그대로예요. [되돌리기]를 누르면 위 목록으로 돌아가요.</p>
      {/* 빈 칸은 표가 아니라 글 한 줄이다(패널 안 표는 위 목록 하나로 둔다) */}
      {rows.length === 0 ? (
        <p className="px-5 pb-4 text-small text-muted max-md:px-4">아직 없어요</p>
      ) : (
        <div className={ds.table.wrap}>
          <table aria-label="완료로 바꾼 날" className={ds.table.table}>
            <tbody>
              {rows.map((close) => (
                <ClosedRow key={close.visit_date} close={close} count={byDate.get(close.visit_date)} busy={reopening.has(close.visit_date)} onReopen={() => onReopen(close.visit_date)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  )
}

function MemoPanel({ counts, closed, onClose, onReopen }: { counts: Counts; closed: readonly ClaimDayClose[]; onClose: Write; onReopen: Write }) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set())
  const [saving, setSaving] = useState(false)
  const [reopening, setReopening] = useState<ReadonlySet<string>>(() => new Set())
  const [justSaved, setJustSaved] = useState<readonly string[]>([])
  const [failed, setFailed] = useState(false)

  const { total } = counts
  const closedSet = new Set(closed.map((close) => close.visit_date))
  // 위 목록과 'N일 남음'은 완료 표시가 없는 남은 날만(AC-2803.3)
  const days = counts.days.filter((day) => !closedSet.has(day.visit_date))
  // 고른 것은 지금 목록에 있는 날만 목록 차례로 센다(다른 창에서 바뀌어 빠진 날은 뺀다)
  const chosen = days.map((day) => day.visit_date).filter((date) => picked.has(date))
  // 방금 저장한 날 가운데 아직 완료인 날. 아래 칸에서 하나씩 되돌리면 준다
  const undoable = justSaved.filter((date) => closedSet.has(date))
  // 목록이 바뀌면(다시 읽기·저장·되돌리기) 보이지 않게 된 날은 고른 것에서 뺀다: 뒤에 되돌아와도 골라진 채로 오지 않게
  const shownKey = days.map((day) => day.visit_date).join(' ')
  const [shownBefore, setShownBefore] = useState(shownKey)
  if (shownBefore !== shownKey) {
    setShownBefore(shownKey)
    const shown = new Set(days.map((day) => day.visit_date))
    if ([...picked].some((date) => !shown.has(date))) setPicked(new Set([...picked].filter((date) => shown.has(date))))
  }

  const pick = (date: string) => {
    setPicked((now) => {
      const next = new Set(now)
      if (!next.delete(date)) next.add(date)
      return next
    })
    setJustSaved([])
  }

  const save = async () => {
    if (saving || chosen.length === 0) return
    setSaving(true)
    setFailed(false)
    try {
      await onClose(chosen)
      setPicked(new Set())
      setJustSaved(chosen)
    } catch {
      // 고른 것·목록은 그대로 두고 다시 누를 수 있다(AC-2801.5)
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  const reopen = async (dates: readonly string[]) => {
    if (dates.length === 0 || dates.some((date) => reopening.has(date))) return
    setReopening((now) => new Set([...now, ...dates]))
    setFailed(false)
    try {
      await onReopen([...dates])
      // 되돌린 날은 '방금 저장한 날'에서도 뺀다: 다른 창이 다시 완료로 바꿔도 옛 알림이 돌아오지 않게
      setJustSaved((now) => now.filter((date) => !dates.includes(date)))
    } catch {
      setFailed(true)
    } finally {
      setReopening((now) => new Set([...now].filter((date) => !dates.includes(date))))
    }
  }

  return (
    <section className={ds.panel}>
      <div className={ds.panelHead}>
        <h2 className={ds.panelTitle}>메모 입력 현황</h2>
        <span className={ds.count}>날짜별</span>
      </div>
      {total === 0 ? (
        <p className={`${ds.panelBody} text-small text-muted`}>{EMPTY}</p>
      ) : (
        <>
          <p className="px-5 pt-3 max-md:px-4">
            <b className="text-title font-semibold text-ink">
              {days.length}
              <small className="text-small font-normal">일 남음</small>
            </b>
          </p>
          {/* 고르기 줄은 위 목록이 있을 때만(AC-2801.7). 고른 수·저장 알림은 읽기 프로그램이 바로 읽는다 */}
          {days.length > 0 && (
            <div role="status" className={`${PICK_BAR} ${undoable.length > 0 ? SAVED_TONE : PICK_TONE}`}>
              {undoable.length > 0 ? (
                <>
                  <span>{undoable.length}일을 완료로 바꿨어요</span>
                  <button type="button" disabled={undoable.some((date) => reopening.has(date))} onClick={() => void reopen(undoable)} className={ds.textButton}>
                    되돌리기
                  </button>
                </>
              ) : (
                <>
                  <span>{chosen.length > 0 ? `${chosen.length}일 골랐어요` : '완료로 바꿀 날을 골라 주세요'}</span>
                  <button type="button" disabled={saving || chosen.length === 0} onClick={() => void save()} className={ds.button.primarySmall}>
                    {saving ? '저장 중…' : '완료로 저장'}
                  </button>
                </>
              )}
            </div>
          )}
          {failed && (
            <div className="px-5 pt-2 max-md:px-4">
              <ErrorCard code="E-DAYCLOSE-FAILED" />
            </div>
          )}
          {days.length === 0 ? (
            <p className={`${ds.panelBody} text-small text-muted`}>남은 메모가 없어요</p>
          ) : (
            <div className={`${ds.table.wrap} pt-2`}>
              <table aria-label="메모 입력 현황" className={ds.table.table}>
                <thead className="max-md:hidden">
                  <tr>
                    {/* 체크 칸 머리는 비우고 이름만 준다. sr-only는 absolute라 옆으로 밀리는 표 밖까지 나가 좁은 화면을 민다 */}
                    <th aria-label="고르기" className={ds.table.th} />
                    <th className={ds.table.th}>날짜</th>
                    <th className={`${numHead} max-md:hidden`}>메모 필요</th>
                    <th className={`${numHead} max-md:hidden`}>입력함</th>
                    <th className={ds.table.th}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((day) => (
                    <DayRow key={day.visit_date} day={day} picked={picked.has(day.visit_date)} locked={saving} onPick={pick} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <ClosedDays closed={closed} left={counts.days} reopening={reopening} onReopen={(date) => void reopen([date])} />
        </>
      )}
    </section>
  )
}

type State = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; counts: Counts; closed: ClaimDayClose[] }

export function OutsideCounts() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  /** 저장·되돌리기 뒤 다시 읽기. 실패해도 고친 화면을 둔다(저장은 이미 됐다) */
  const reread = useRef<() => void>(() => {})

  // 창 초점이 오면 다시 읽는다: 폰에 열어 둔 화면이 옛 숫자로 남지 않게. 마지막으로 부른 답만 쓴다
  useEffect(() => {
    let last = 0
    const read = (afterWrite = false) => {
      const ask = ++last
      // 클라이언트를 못 만들어도 던지지 않게 약속 안에서 부른다: 둘레 화면(연결 단추·[다시 확인])까지 깨지면 안 된다.
      // 건수와 완료 표시를 함께 읽고, 어느 하나라도 실패하면 E-COUNTS-FAILED(완료 표시 표가 없으면 빈 목록)
      Promise.resolve()
        .then(() => {
          const sb = supabaseBrowser()
          return Promise.all([readOutsideCounts(sb), readClosedDays(sb)])
        })
        .then(
          ([counts, closed]) => ask === last && setState({ kind: 'ready', counts, closed }),
          () => ask === last && !afterWrite && setState({ kind: 'failed' }),
        )
    }
    const onFocus = () => read()
    reread.current = () => read(true)
    read()
    window.addEventListener('focus', onFocus)
    return () => {
      last = -1
      reread.current = () => {}
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  // 서버에 쓴 뒤 화면을 바로 고치고(시각은 서버 답이 올 때까지 지금 시각) 다시 읽어 맞춘다
  const close: Write = async (dates) => {
    await closeDays(supabaseBrowser(), dates)
    const at = new Date().toISOString()
    setState((now) => {
      if (now.kind !== 'ready') return now
      const added = dates.filter((date) => !now.closed.some((c) => c.visit_date === date)).map((visit_date) => ({ visit_date, closed_at: at }))
      return { ...now, closed: [...now.closed, ...added] }
    })
    reread.current()
  }
  const reopen: Write = async (dates) => {
    await reopenDays(supabaseBrowser(), dates)
    setState((now) => (now.kind === 'ready' ? { ...now, closed: now.closed.filter((c) => !dates.includes(c.visit_date)) } : now))
    reread.current()
  }

  if (state.kind === 'loading') return <p className="text-small text-muted">건수를 읽는 중이에요…</p>
  if (state.kind === 'failed') return <ErrorCard code="E-COUNTS-FAILED" />
  const { counts, closed } = state
  return (
    <div className="flex flex-col gap-3">
      {/* 건수 표 세 개의 시각만 쓴다. 완료 표시 시각은 섞지 않는다(AC-2803.2) */}
      {counts.updatedAt && (
        <p className="text-small text-ink-2">
          마지막으로 바뀐 시각 <br className="md:hidden" />
          <b className="font-semibold text-ink">{stamp(counts.updatedAt)}</b> · 비트 PC에서 올라옴
        </p>
      )}
      <MemoPanel counts={counts} closed={closed} onClose={close} onReopen={reopen} />
    </div>
  )
}

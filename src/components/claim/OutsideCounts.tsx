'use client'

import { useEffect, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import { readOutsideCounts, type ClaimDayCount, type OutsideCounts as Counts } from '@/lib/storage/claimCounts'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { dayLabel, statusOf } from './dateList'
import { checkedAtText } from './setup/checkedAt'

// 밖에서 보는 건수(AC-019.5). 비트 PC가 아닌 곳(집 PC·휴대폰)에서 숫자·날짜·시각만 본다. 환자 정보·경고 내용은 서버에 없어 그릴 길이 없다.
// ui-90 화면(setup/ClaimEntry)의 '준비 중' 칩 자리에 들어간다: 마지막으로 바뀐 시각 줄과 '메모 입력 현황' 패널 하나이고, 자리 전체 폭을 쓴다. h1·안내 글·링크는 그 화면의 것이다.
// 표 모양은 목업 화면 11이고 다른 곳은 둘: 끝난 날을 빼고(AC-019.5), 줄마다 바뀐 시각을 날짜 아래에 더했다.
// 월말 마감 남은 일(AC-022.4)·연락 남은 건수(AC-026.4)는 뒤 TASK가 이 패널 아래에 세로로 더한다

const EMPTY = '아직 올린 건수가 없어요'
const STATUS_CHIP = { neutral: ds.chip.neutral, accent: ds.chip.accent, positive: ds.chip.positive } as const
const numHead = `${ds.table.th} text-right`

const stamp = (at: string) => checkedAtText(new Date(at))

function DayRow({ day }: { day: ClaimDayCount }) {
  const status = statusOf({ done: false, needMemo: day.need_memo, entered: day.entered })
  return (
    <tr className={ds.table.row}>
      <td className={ds.table.td}>
        {dayLabel(day.visit_date)}
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

function MemoPanel({ counts }: { counts: Counts }) {
  const { days, total } = counts
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
          {days.length === 0 ? (
            <p className={`${ds.panelBody} text-small text-muted`}>남은 메모가 없어요</p>
          ) : (
            <div className={`${ds.table.wrap} pt-2`}>
              <table aria-label="메모 입력 현황" className={ds.table.table}>
                <thead className="max-md:hidden">
                  <tr>
                    <th className={ds.table.th}>날짜</th>
                    <th className={`${numHead} max-md:hidden`}>메모 필요</th>
                    <th className={`${numHead} max-md:hidden`}>입력함</th>
                    <th className={ds.table.th}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((day) => (
                    <DayRow key={day.visit_date} day={day} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}

type State = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; counts: Counts }

export function OutsideCounts() {
  const [state, setState] = useState<State>({ kind: 'loading' })

  // 창 초점이 오면 다시 읽는다: 폰에 열어 둔 화면이 옛 숫자로 남지 않게. 마지막으로 부른 답만 쓴다
  useEffect(() => {
    let last = 0
    const read = () => {
      const ask = ++last
      // 클라이언트를 못 만들어도 던지지 않게 약속 안에서 부른다: 둘레 화면(연결 단추·[다시 확인])까지 깨지면 안 된다
      Promise.resolve()
        .then(() => readOutsideCounts(supabaseBrowser()))
        .then(
          (counts) => ask === last && setState({ kind: 'ready', counts }),
          () => ask === last && setState({ kind: 'failed' }),
        )
    }
    read()
    window.addEventListener('focus', read)
    return () => {
      last = -1
      window.removeEventListener('focus', read)
    }
  }, [])

  if (state.kind === 'loading') return <p className="text-small text-muted">건수를 읽는 중이에요…</p>
  if (state.kind === 'failed') return <ErrorCard code="E-COUNTS-FAILED" />
  const { counts } = state
  return (
    <div className="flex flex-col gap-3">
      {counts.updatedAt && (
        <p className="text-small text-ink-2">
          마지막으로 바뀐 시각 <br className="md:hidden" />
          <b className="font-semibold text-ink">{stamp(counts.updatedAt)}</b> · 비트 PC에서 올라옴
        </p>
      )}
      <MemoPanel counts={counts} />
    </div>
  )
}

'use client'

import Link from 'next/link'
import { useEffect, useId, useState } from 'react'
import { useDesk } from '@/components/shell/role'
import { ds } from '@/components/ui/classes'
import { dateText, SOURCES, sourcesText, whenText } from '@/lib/notices/view'
import { listNotices, NOTICES_CHANGED, sourceStates, unreadCount } from '@/lib/storage/notices'
import type { NoticeFilter, NoticeView, SourceView } from '@/types/notices'
import { ArrowIcon } from './icons'

// 대시보드 '고시·공지' 칸(specs/notices AC-7422.2 · AC-7424.12 · 기본값 1·9·11·21, 시안 ?s=dashboard .dsec·.ncard). BitDashboard가 일별 현황 바로 아래에 놓는다
// (숫자가 있는 화면에서만 — 연결 전·읽는 중에는 놓지 않는다).
// 수는 unreadCount(안 읽은 관련 글 + 꼭 볼 글), 줄은 관련 글만 첫 쪽(listNotices) 가운데 안 읽은 글 3개까지, 0건 글의 시각은 출처 상태(sourceStates)의 가장 늦은 확인이다.
// 화면은 받은 줄을 related로 다시 거르지 않는다(꼭 볼 글은 DB가 넣는다, AC-7424.12). 줄에 꼭 볼 글 칩은 없다(기본값 21).
// 그릴 때 한 번, notices:changed마다 다시 읽는다. 읽는 중에는 칸을 그리지 않고, 수나 목록을 못 읽으면 그 칸만 기본값 9다.
// 제목은 바깥 글이라 글자 노드로만 그린다. 데스크 계정(useDesk)에게는 그리지 않고 읽지도 않는다

const MAX_ROWS = 3
const FAILED = '고시·공지를 불러오지 못했어요' // 기본값 9
const LIST_HREF = '/notices'
// 관련 글만 · 모든 출처 · 별표 없음 · 찾기 없음 · 첫 쪽
const FILTER: NoticeFilter = { related: true, sources: [...SOURCES], starred: false, q: '', offset: 0 }

type Loaded = { count: number; rows: NoticeView[]; checkedAt: string | null }

const noticeHref = (id: string) => `/notices?id=${encodeURIComponent(id)}`

/** 출처 상태 가운데 가장 늦은 확인 시각(없으면 null) */
function latestCheck(rows: readonly SourceView[]): string | null {
  let latest: string | null = null
  for (const row of rows) {
    if (row.checkedAt === null || Number.isNaN(Date.parse(row.checkedAt))) continue
    if (latest === null || Date.parse(row.checkedAt) > Date.parse(latest)) latest = row.checkedAt
  }
  return latest
}

/** 수·목록을 함께 읽는다. 둘 중 하나라도 못 읽으면 failed. 출처 상태를 못 읽으면 시각만 뺀다 */
async function readCard(): Promise<Loaded | 'failed'> {
  const [count, page, states] = await Promise.all([unreadCount(), listNotices(FILTER), sourceStates()])
  if (count === 'failed' || page === 'failed') return 'failed'
  return {
    count,
    rows: page.rows.filter((row) => row.unread).slice(0, MAX_ROWS),
    checkedAt: states === 'failed' ? null : latestCheck(states),
  }
}

// 날짜 글자가 틀린 줄이 와도 칸 전체가 멈추지 않게 빈 글자로 둔다
function safeText(make: () => string): string {
  try {
    return make()
  } catch {
    return ''
  }
}

function emptyText(checkedAt: string | null): string {
  const when = checkedAt === null ? '' : safeText(() => whenText(checkedAt, new Date()))
  return when === '' ? '새 관련 글이 없어요' : `새 관련 글이 없어요 · ${when} 확인`
}

function Row({ n }: { n: NoticeView }) {
  const needsCheck = n.ruleHits.length > 0 && !n.mark.rulesCheckedAt
  return (
    <li className="border-b border-line last:border-b-0">
      <Link href={noticeHref(n.id)} prefetch={false} className={`group grid grid-cols-[112px_minmax(0,1fr)] gap-x-3 gap-y-0.5 rounded-control py-3 ${ds.focusRing}`}>
        <span className="whitespace-nowrap text-small leading-[22px] text-muted">{safeText(() => dateText(n.postedOn))}</span>
        <span className="min-w-0 text-body font-semibold text-ink underline-offset-3 group-hover:underline">{n.title}</span>
        <span className="col-start-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted">
          <span>{sourcesText(n.posts)}</span>
          {needsCheck && <span className={ds.chip.warning}>점검 규칙 확인 필요</span>}
        </span>
      </Link>
    </li>
  )
}

export function NoticesCard() {
  const desk = useDesk()
  const titleId = useId()
  // null = 읽는 중(칸을 그리지 않는다)
  const [card, setCard] = useState<Loaded | 'failed' | null>(null)

  useEffect(() => {
    if (desk) return
    let live = true
    let seq = 0
    const read = () => {
      const mine = ++seq
      void readCard()
        .catch((): 'failed' => 'failed')
        .then((result) => {
          if (live && mine === seq) setCard(result)
        })
    }
    read()
    window.addEventListener(NOTICES_CHANGED, read)
    return () => {
      live = false
      window.removeEventListener(NOTICES_CHANGED, read)
    }
  }, [desk])

  if (desk || card === null) return null
  const rest = card === 'failed' ? 0 : card.count - card.rows.length
  return (
    <section aria-labelledby={titleId} className="mt-12">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <h2 id={titleId} className="text-title font-semibold text-ink">
          고시·공지
        </h2>
        {card !== 'failed' && card.count > 0 && <span className="text-body font-semibold text-accent-strong">{`새 관련 글 ${card.count}건`}</span>}
        <Link href={LIST_HREF} prefetch={false} className={`${ds.textButton} ml-auto`}>
          고시·공지 열기
          <ArrowIcon />
        </Link>
      </div>
      <div className={`${ds.panel} px-5 py-1`}>
        {card === 'failed' ? (
          <p className="py-3 text-body text-muted">{FAILED}</p>
        ) : card.count === 0 ? (
          <p className="py-3 text-body text-muted">{emptyText(card.checkedAt)}</p>
        ) : (
          <>
            {card.rows.length > 0 && (
              <ul>
                {card.rows.map((n) => (
                  <Row key={n.id} n={n} />
                ))}
              </ul>
            )}
            {rest > 0 && <p className={`py-3 text-small text-muted ${card.rows.length > 0 ? 'border-t border-line' : ''}`}>{`그 밖에 ${rest}건`}</p>}
          </>
        )}
      </div>
    </section>
  )
}

'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useDesk } from '@/components/shell/role'
import { ds } from '@/components/ui/classes'
import { noticeNoText } from '@/lib/notices/view'
import { NOTICES_CHANGED, ruleAlerts } from '@/lib/storage/notices'
import type { RuleAlert as RuleAlertRow } from '@/types/notices'
import { ArrowIcon, WarnIcon } from './icons'

// 대시보드 맨 위 점검 규칙 경고(specs/notices AC-7422.1 · 기본값 8·17, 시안 ?s=dashboard .dwarn). LiveDashboard가 맨 위에 놓는다.
// 규칙 연결이 있고 내가 확인하지 않은 글(ruleAlerts)이 하나라도 있을 때만 그린다. 읽는 중·0개·읽기 실패면 아무것도 그리지 않는다.
// 그릴 때 한 번, notices:changed(글 화면에서 [확인했어요]를 누름 등)마다 다시 읽는다. 늦게 온 앞 읽기의 답과 떠난 뒤의 답은 버린다.
// 데스크 계정(useDesk)에게는 그리지 않고 읽지도 않는다(화면 숨김일 뿐 — 자료는 RLS가 막는다)

const TITLE = '점검 규칙 확인 필요'
const TAIL = '규칙은 저절로 바뀌지 않아요.'
const LIST_HREF = '/notices'

const noticeHref = (id: string) => `/notices?id=${encodeURIComponent(id)}`

/** 경고 글과 [글 보기] 곳. 하나면 그 글(번호가 있으면 '새 고시({번호})가', 없으면 '새 글이'), 둘 이상이면 '새 고시 {k}개가'와 목록(기본값 8). 규칙 수는 글마다의 합 */
function alertText(alerts: readonly RuleAlertRow[]): { body: string; href: string } {
  const rules = alerts.reduce((sum, a) => sum + a.ruleCount, 0)
  const one = alerts.length === 1 ? alerts[0] : undefined
  if (one === undefined) return { body: `새 고시 ${alerts.length}개가 점검 규칙 ${rules}개의 근거를 바꿨어요. ${TAIL}`, href: LIST_HREF }
  const what = one.noticeNo ? `새 고시(${noticeNoText(one.noticeNo)})가` : '새 글이'
  return { body: `${what} 점검 규칙 ${rules}개의 근거를 바꿨어요. ${TAIL}`, href: noticeHref(one.id) }
}

export function RuleAlert() {
  const desk = useDesk()
  // null = 읽는 중이거나 읽지 못함(그리지 않는다)
  const [alerts, setAlerts] = useState<RuleAlertRow[] | null>(null)

  useEffect(() => {
    if (desk) return
    let live = true
    let seq = 0
    const read = () => {
      const mine = ++seq
      void ruleAlerts().then((result) => {
        if (live && mine === seq) setAlerts(result === 'failed' ? null : result)
      })
    }
    read()
    window.addEventListener(NOTICES_CHANGED, read)
    return () => {
      live = false
      window.removeEventListener(NOTICES_CHANGED, read)
    }
  }, [desk])

  if (desk || alerts === null || alerts.length === 0) return null
  const { body, href } = alertText(alerts)
  return (
    <div role="status" className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control border border-warning/30 bg-warning-soft px-4 py-2 text-body text-ink-2">
      <WarnIcon className="shrink-0 text-warning" />
      <span className="min-w-0 flex-1">
        <b className="font-semibold text-warning">{TITLE}</b> · {body}
      </span>
      <Link href={href} prefetch={false} className={ds.textButton}>
        글 보기
        <ArrowIcon />
      </Link>
    </div>
  )
}

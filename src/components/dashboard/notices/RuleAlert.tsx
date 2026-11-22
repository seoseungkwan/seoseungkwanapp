'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import { useDesk } from '@/components/shell/role'
import { ds } from '@/components/ui/classes'
import { changeBandText, humanBandText } from '@/lib/notices/ruleView'
import { NOTICES_CHANGED, ruleAlerts } from '@/lib/storage/notices'
import { ruleChangeAlerts } from '@/lib/storage/ruleChanges'
import type { RuleAlert as RuleAlertRow } from '@/types/notices'
import type { RuleChangeAlert } from '@/types/ruleAuto'
import { ArrowIcon, WarnIcon } from './icons'

// 대시보드 맨 위 띠 둘(specs/rule-auto REQ-7816 · 기본값 9·10, 시안 docs/mockups/rule-auto ?v=dashboard .bands). LiveDashboard가 맨 위에 놓는다.
// 노랑 '점검 규칙 확인 필요' = 사람이 봐야 함이 남고 내가 확인하지 않은 글(ruleAlerts) · 파랑 '점검 규칙이 바뀌었어요' = 내가 안 본, 되돌리지 않은 바뀐 판이 있는 글(ruleChangeAlerts).
// 노랑 먼저, 파랑 다음. 띠마다 따로: 읽는 중·0개·읽기 실패인 띠만 없고, 둘 다 없으면 아무것도 그리지 않는다.
// 그릴 때 한 번, notices:changed(글 화면에서 [확인했어요]·바뀐 내용을 봄·되돌리기 등)마다 둘 다 다시 읽는다. 늦게 온 앞 읽기의 답과 떠난 뒤의 답은 버린다.
// 데스크 계정(useDesk)에게는 그리지 않고 읽지도 않는다(화면 숨김일 뿐 — 자료는 RLS가 막는다). 글은 ruleView가 만든 글자이고 글자 노드로만 그린다

const LIST_HREF = '/notices'

const noticeHref = (id: string) => `/notices?id=${encodeURIComponent(id)}`

/** 시안 I.spark 그대로(18px). 늘 꾸밈이다(aria-hidden), 색은 글자색 */
function SparkIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1.5 9.3 6.7 14.5 8 9.3 9.3 8 14.5 6.7 9.3 1.5 8l5.2-1.3z" />
    </svg>
  )
}

// 띠 색: 노랑(warning) · 파랑(accent). 시안 .dwarn · .dwarn.dchg
const TONES = {
  warning: { box: 'border-warning/30 bg-warning-soft', title: 'text-warning' },
  accent: { box: 'border-accent/20 bg-accent-soft', title: 'text-accent-strong' },
} as const

type BandProps = { tone: keyof typeof TONES; icon: ReactNode; title: string; body: string; link: string; href: string }

function Band({ tone, icon, title, body, link, href }: BandProps) {
  const t = TONES[tone]
  return (
    <div role="status" className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control border px-4 py-2 text-body text-ink-2 ${t.box}`}>
      {icon}
      <span className="min-w-0 flex-1">
        <b className={`font-semibold ${t.title}`}>{title}</b> · {body}
      </span>
      {/* 글자 단추 모양 + no-underline: 앱에는 a 밑줄을 지우는 바탕 규칙이 없다(밑줄은 올림 반응뿐) */}
      <Link href={href} prefetch={false} className={`${ds.textButton} no-underline`}>
        {link}
        <ArrowIcon />
      </Link>
    </div>
  )
}

export function RuleAlert() {
  const desk = useDesk()
  // null = 읽는 중이거나 읽지 못함(그 띠를 그리지 않는다)
  const [human, setHuman] = useState<RuleAlertRow[] | null>(null)
  const [changes, setChanges] = useState<RuleChangeAlert[] | null>(null)

  useEffect(() => {
    if (desk) return
    let live = true
    let seq = 0
    const read = () => {
      const mine = ++seq
      const fresh = () => live && mine === seq
      void ruleAlerts().then((result) => {
        if (fresh()) setHuman(result === 'failed' ? null : result)
      })
      void ruleChangeAlerts().then((result) => {
        if (fresh()) setChanges(result === 'failed' ? null : result)
      })
    }
    read()
    window.addEventListener(NOTICES_CHANGED, read)
    return () => {
      live = false
      window.removeEventListener(NOTICES_CHANGED, read)
    }
  }, [desk])

  if (desk) return null
  const showHuman = human !== null && human.length > 0
  const showChange = changes !== null && changes.length > 0
  if (!showHuman && !showChange) return null
  return (
    <div className="mb-3 grid gap-2">
      {showHuman && (
        <Band
          tone="warning"
          icon={<WarnIcon className="shrink-0 text-warning" />}
          title="점검 규칙 확인 필요"
          body={humanBandText(human)}
          link="글 보기"
          // 하나면 그 글, 둘 이상이면 목록(기본값 10)
          href={human.length === 1 ? noticeHref(human[0].id) : LIST_HREF}
        />
      )}
      {showChange && (
        <Band
          tone="accent"
          icon={<SparkIcon className="shrink-0 text-accent" />}
          title="점검 규칙이 바뀌었어요"
          body={changeBandText(changes)}
          link="바뀐 내용 보기"
          // 목록의 첫 글 = 가장 최근 글(기본값 9)
          href={noticeHref(changes[0].id)}
        />
      )}
    </div>
  )
}

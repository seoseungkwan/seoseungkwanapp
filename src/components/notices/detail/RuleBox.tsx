'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import { checkRules } from '@/lib/storage/notices'
import type { RuleHit } from '@/types/notices'
import { ArrowIcon, CheckCircleIcon, CheckIcon, WarnIcon } from './icons'
import { safeDateTimeText } from './parts'

// 점검 규칙 상자 (specs/notices AC-7420.2, 승인 시안 .rule·.rule.done). 규칙 연결이 있는 글에만 놓는다(부모가 정한다).
// [확인했어요]는 내 확인 시각만 저장한다(checkRules) — 규칙은 바꾸지 않는다. 실패면 E-NOTICE-SAVE이고 확인 필요 상자 그대로다.
// [점검 규칙 보기]는 설정의 '점검 규칙' 칸(기본값 17)

const RULE_SETTINGS = '/settings#rule-settings-title'

function RuleList({ rules }: { rules: RuleHit[] }) {
  return (
    <ul className="grid gap-1">
      {rules.map((rule, i) => (
        <li key={`${rule.id}-${i}`} className="whitespace-pre-wrap break-words rounded-control bg-surface/70 px-3 py-1.5 text-body font-medium text-ink">
          {rule.title}
        </li>
      ))}
    </ul>
  )
}

export type RuleBoxProps = { noticeId: string; rules: RuleHit[]; checkedAt: string | null }

export function RuleBox({ noticeId, rules, checkedAt: firstCheckedAt }: RuleBoxProps) {
  const headId = useId()
  const [checkedAt, setCheckedAt] = useState(firstCheckedAt)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const busy = useRef(false)
  const alive = useRef(true)
  const n = rules.length

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const confirm = async () => {
    if (busy.current) return
    busy.current = true
    setSaving(true)
    setFailed(false)
    const ok = await checkRules(noticeId)
    busy.current = false
    if (!alive.current) return
    setSaving(false)
    if (ok) setCheckedAt(new Date().toISOString())
    else setFailed(true)
  }

  if (checkedAt !== null) {
    return (
      <section aria-labelledby={headId} className="grid gap-3 rounded-control border border-line bg-canvas px-5 py-4">
        <h2 id={headId} className="flex items-start gap-2 text-subtitle font-semibold text-ink-2">
          <CheckCircleIcon className="mt-0.5 text-positive" />
          <span>{`점검 규칙 ${n}개 확인함`}</span>
        </h2>
        <RuleList rules={rules} />
        <p className="text-small text-ink-2">{`${safeDateTimeText(checkedAt)}에 확인했어요.`}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby={headId} className="grid gap-3 rounded-control border border-warning/30 bg-warning-soft px-5 py-4">
      <h2 id={headId} className="flex items-start gap-2 text-subtitle font-semibold text-warning">
        <WarnIcon className="mt-0.5" />
        <span>{`이 글이 점검 규칙 ${n}개의 근거를 바꿔요 — 확인 필요`}</span>
      </h2>
      <p className="text-small text-ink-2">
        점검 규칙은 저절로 바뀌지 않아요. 아래 규칙이 새 기준과 맞는지 설정 → 점검 규칙에서 확인해 주세요.
      </p>
      <RuleList rules={rules} />
      {failed && <ErrorCard code="E-NOTICE-SAVE" />}
      <div className="flex flex-wrap gap-2">
        <Link href={RULE_SETTINGS} className={ds.button.secondarySmall}>
          점검 규칙 보기
          <ArrowIcon />
        </Link>
        <button type="button" className={ds.button.secondarySmall} aria-busy={saving ? true : undefined} onClick={() => void confirm()}>
          <CheckIcon />
          확인했어요
        </button>
      </div>
    </section>
  )
}

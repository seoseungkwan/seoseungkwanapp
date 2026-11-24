'use client'

import { useEffect, useRef, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { WriteOnly } from '@/components/shell/viewing'
import { ds } from '@/components/ui/classes'
import { fromText } from '@/lib/notices/ruleView'
import { setRuleReverted } from '@/lib/storage/ruleChanges'
import type { RuleCheckView } from '@/types/ruleAuto'
import { safeDateTimeText } from './parts'

// 저절로 바뀐 규칙 카드 하나 (specs/rule-auto AC-7814.3~AC-7814.5, design 11절, 승인 시안 docs/mockups/rule-auto ?v=detail .ccard).
// [되돌리기]·[다시 적용]은 우리 병원 표시만 바꾼다(setRuleReverted). 기다리는 동안 그 단추만 aria-busy이고 다시 눌러도 한 번만 부른다.
// 성공하면 카드가 바로 바뀐 모양(되돌린 시각은 지금), 실패하면 카드 안에 E-RULE-AUTO-SAVE 오류 상자이고 모양은 그대로다.
// 되돌리기 전: 전 = 흐린 지운 줄, 후 = 굵게 / 되돌린 뒤: 반대. 되돌린 카드 제목은 원래 규칙 제목(ruleHits)이다.
// 모든 글(제목·전·후·까닭 — AI가 쓴 글)은 글자 노드로만 그린다. 아이콘은 공용 Icon의 reload(되돌리기는 좌우를 뒤집어 거꾸로 도는 화살표).
// 다른 의원을 보는 중(읽기만, admin-view AC-8010.1)이면 [되돌리기]/[다시 적용]이 없다(보는 의원의 되돌림 표시는 그대로)

const card = 'grid gap-2 rounded-control border px-3 py-3'
const cardOn = `${card} border-accent/20 bg-surface`
const cardOff = `${card} border-line bg-surface/60`
const term = 'pt-0.5 text-caption font-semibold text-muted'
const value = 'min-w-0 whitespace-pre-wrap break-words text-body'
const struck = `${value} text-muted line-through decoration-faint`
const strong = `${value} font-semibold text-ink`

// 날짜가 틀린 값이면 적용 날짜 줄을 그리지 않는다(화면이 깨지지 않게)
function safeFromText(ymd: string | null): string | null {
  if (ymd === null) return null
  try {
    return fromText(ymd)
  } catch {
    return null
  }
}

export type RuleChangeCardProps = { row: RuleCheckView; originalTitle: string }

export function RuleChangeCard({ row, originalTitle }: RuleChangeCardProps) {
  const [reverted, setReverted] = useState(row.reverted)
  const [revertedAt, setRevertedAt] = useState(row.revertedAt)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const busy = useRef(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const toggle = async () => {
    if (busy.current) return
    busy.current = true
    setSaving(true)
    setFailed(false)
    const next = !reverted
    const ok = await setRuleReverted(row.changeId, next).catch(() => false)
    busy.current = false
    if (!alive.current) return
    setSaving(false)
    if (ok) {
      setReverted(next)
      setRevertedAt(next ? new Date().toISOString() : null)
    } else {
      setFailed(true)
    }
  }

  const from = safeFromText(row.from)

  return (
    <li className={reverted ? cardOff : cardOn}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="min-w-0 whitespace-pre-wrap break-words text-subtitle font-semibold text-ink">{reverted ? originalTitle : row.title}</span>
        <span className="text-caption text-muted">{row.ruleId}</span>
        {reverted && <span className={ds.chip.neutral}>우리 병원은 되돌림</span>}
        <WriteOnly>
          <button
            type="button"
            className={`ml-auto ${ds.button.secondarySmall}`}
            aria-label={reverted ? `${row.ruleId} 다시 적용` : `${row.ruleId} 되돌리기`}
            aria-busy={saving ? true : undefined}
            onClick={() => void toggle()}
          >
            <Icon name="reload" size={14} className={reverted ? undefined : '-scale-x-100'} />
            {reverted ? '다시 적용' : '되돌리기'}
          </button>
        </WriteOnly>
      </div>
      <dl className="grid grid-cols-[44px_minmax(0,1fr)] gap-x-3 gap-y-1">
        <dt className={term}>전</dt>
        <dd className={reverted ? strong : struck}>{row.before}</dd>
        <dt className={term}>후</dt>
        <dd className={reverted ? struck : strong}>{row.after}</dd>
        <dt className={term}>까닭</dt>
        <dd className={`${value} text-ink`}>{row.why}</dd>
      </dl>
      {(from !== null || (reverted && revertedAt !== null)) && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted">
          {from !== null && <span className="font-semibold text-ink-2">{from}</span>}
          {reverted && revertedAt !== null && <span>{`${safeDateTimeText(revertedAt)}에 되돌렸어요. 우리 병원은 전 규칙으로 점검해요.`}</span>}
        </p>
      )}
      {failed && <ErrorCard code="E-RULE-AUTO-SAVE" />}
    </li>
  )
}

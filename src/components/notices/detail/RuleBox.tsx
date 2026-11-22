'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { checkRules } from '@/lib/storage/notices'
import { readNoticeRules, seeRuleChanges } from '@/lib/storage/ruleChanges'
import type { RuleHit } from '@/types/notices'
import type { NoticeRuleView, RuleCheckView } from '@/types/ruleAuto'
import { ArrowIcon, CheckCircleIcon, CheckIcon, ClockIcon, InfoIcon, SparkIcon, WarnIcon } from './icons'
import { safeDateTimeText } from './parts'
import { RuleChangeCard } from './RuleChangeCard'

// 점검 규칙 상자 넷 (specs/rule-auto REQ-7814 — notices AC-7420.2를 대체, design 11절, 승인 시안 docs/mockups/rule-auto ?v=detail).
// 규칙 연결이 있는 글에만 놓는다(부모가 정한다). readNoticeRules로 읽고, 읽는 동안은 아무것도 그리지 않는다. 실패면 E-NOTICE-READ와 [다시 읽기].
// 차례: 사람이 봐야 함(노랑) → 저절로 바뀜(파랑, 카드는 RuleChangeCard) → 살펴보는 중(회색) → 바꿀 것 없음(회색, 처음엔 접힘). 줄이 있는 상자만 그린다.
// [확인했어요]는 내 확인 시각만 저장한다(checkRules, 실패면 E-NOTICE-SAVE). [점검 규칙 보기]는 설정의 '점검 규칙' 칸(notices 기본값 17).
// 읽은 줄에 우리 병원이 아직 안 본, 되돌리지 않은 바뀐 판이 있으면 seeRuleChanges를 한 번 부른다(대시보드 파랑 띠가 빠진다. 실패는 알리지 않는다).
// 모든 글(제목·까닭 — AI가 쓴 글)은 글자 노드로만 그린다

const RULE_SETTINGS = '/settings#rule-settings-title'

const box = 'grid gap-3 rounded-control border px-5 py-4'
const heading = 'flex items-start gap-2 text-subtitle font-semibold'
const lede = 'text-small text-ink-2'
const list = 'grid list-none gap-1'
const item = 'grid gap-0.5 rounded-control bg-surface/70 px-3 py-1.5'

// 규칙 한 줄(시안 .rlist li): 제목 · 규칙 번호 · 까닭
function RuleRows({ rows }: { rows: RuleCheckView[] }) {
  return (
    <ul className={list}>
      {rows.map((row) => (
        <li key={row.changeId} className={item}>
          <p className="min-w-0 whitespace-pre-wrap break-words text-body font-medium text-ink">
            <span>{row.title}</span>
            <span className="ml-1.5 text-caption font-normal text-muted">{row.ruleId}</span>
          </p>
          <p className="min-w-0 whitespace-pre-wrap break-words text-small text-ink-2">{row.why}</p>
        </li>
      ))}
    </ul>
  )
}

// ── 사람이 봐야 함 (AC-7814.2) ───────────────────────────────

function HumanBox({ noticeId, rows, checkedAt: firstCheckedAt }: { noticeId: string; rows: RuleCheckView[]; checkedAt: string | null }) {
  const headId = useId()
  const [checkedAt, setCheckedAt] = useState(firstCheckedAt)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const busy = useRef(false)
  const alive = useRef(true)
  const n = rows.length

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
    const ok = await checkRules(noticeId).catch(() => false)
    busy.current = false
    if (!alive.current) return
    setSaving(false)
    if (ok) setCheckedAt(new Date().toISOString())
    else setFailed(true)
  }

  if (checkedAt !== null) {
    return (
      <section aria-labelledby={headId} className={`${box} border-line bg-canvas`}>
        <h2 id={headId} className={`${heading} text-ink-2`}>
          <CheckCircleIcon className="mt-0.5 text-positive" />
          <span>{`점검 규칙 ${n}개 확인함`}</span>
        </h2>
        <RuleRows rows={rows} />
        <p className={lede}>{`${safeDateTimeText(checkedAt)}에 확인했어요.`}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby={headId} className={`${box} border-warning/30 bg-warning-soft`}>
      <h2 id={headId} className={`${heading} text-warning`}>
        <WarnIcon className="mt-0.5" />
        <span>{`이 글이 점검 규칙 ${n}개를 바꿔요 — 확인 필요`}</span>
      </h2>
      <p className={lede}>저절로 고칠 수 없는 내용이에요. 아래 규칙이 새 기준과 맞는지 설정 → 점검 규칙에서 확인해 주세요.</p>
      <RuleRows rows={rows} />
      {failed && <ErrorCard code="E-NOTICE-SAVE" />}
      <div className="flex flex-wrap gap-2">
        <Link href={RULE_SETTINGS} className={`${ds.button.secondarySmall} no-underline`}>
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

// ── 저절로 바뀜 (AC-7814.3~AC-7814.5) ─────────────────────────

function ChangeBox({ rows, rules }: { rows: RuleCheckView[]; rules: RuleHit[] }) {
  const headId = useId()
  const originalTitle = (ruleId: string) => rules.find((hit) => hit.id === ruleId)?.title ?? ruleId
  return (
    <section aria-labelledby={headId} className={`${box} border-accent/25 bg-accent-soft`}>
      <h2 id={headId} className={`${heading} text-accent-strong`}>
        <SparkIcon className="mt-1 text-accent" />
        <span>{`이 글로 점검 규칙 ${rows.length}개가 저절로 바뀌었어요`}</span>
      </h2>
      <p className={lede}>AI가 새 고시를 읽고 규칙을 고쳤어요. 틀려 보이면 ‘되돌리기’를 누르세요. 우리 병원만 전 규칙으로 돌아가요.</p>
      <ul className="grid list-none gap-2">
        {rows.map((row) => (
          <RuleChangeCard key={row.changeId} row={row} originalTitle={originalTitle(row.ruleId)} />
        ))}
      </ul>
      <p className="flex items-start gap-1.5 text-caption text-muted">
        <InfoIcon className="mt-px" />
        <span>AI가 고친 규칙이라 틀릴 수 있어요. 바뀐 내용은 고시 원문과 꼭 맞춰 보세요.</span>
      </p>
    </section>
  )
}

// ── 살펴보는 중 · 바꿀 것 없음 (AC-7814.6) ─────────────────────

function PendingBox({ rules }: { rules: RuleHit[] }) {
  const headId = useId()
  return (
    <section aria-labelledby={headId} className={`${box} border-line bg-canvas`}>
      <h2 id={headId} className={`${heading} text-ink-2`}>
        <ClockIcon className="mt-1 text-muted" />
        <span>{`AI가 점검 규칙 ${rules.length}개를 살펴보는 중이에요`}</span>
      </h2>
      <p className={lede}>이 글이 근거를 바꾸는 규칙이에요. 바꿀지 AI가 살펴보고 있어요. 끝나면 여기와 대시보드에 알려요.</p>
      <ul className={list}>
        {rules.map((rule, i) => (
          <li key={`${rule.id}-${i}`} className={`${item} whitespace-pre-wrap break-words text-body font-medium text-ink`}>
            {rule.title}
          </li>
        ))}
      </ul>
    </section>
  )
}

function CalmBox({ rows }: { rows: RuleCheckView[] }) {
  const headId = useId()
  const [open, setOpen] = useState(false)
  return (
    <section aria-labelledby={headId} className={`${box} border-line bg-canvas`}>
      <div className="flex items-center justify-between gap-2">
        <h2 id={headId} className={`${heading} text-ink-2`}>
          <CheckCircleIcon className="mt-0.5 text-muted" />
          <span>{`살펴봤는데 바꿀 것 없는 점검 규칙 ${rows.length}개`}</span>
        </h2>
        <button type="button" className={ds.textButton} aria-expanded={open} onClick={() => setOpen((now) => !now)}>
          {open ? '접기' : '보기'}
          <Icon name="chev" size={14} className={open ? 'rotate-180' : undefined} />
        </button>
      </div>
      {open && <RuleRows rows={rows} />}
    </section>
  )
}

// ── 상자 넷 (AC-7814.1·AC-7814.7·AC-7814.8) ────────────────────

type Loaded = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; view: NoticeRuleView }

const unseenChange = (row: RuleCheckView) => row.verdict === 'change' && !row.seen && !row.reverted

export type RuleBoxProps = { noticeId: string; rules: RuleHit[]; checkedAt: string | null }

export function RuleBox({ noticeId, rules, checkedAt }: RuleBoxProps) {
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    readNoticeRules(noticeId, rules)
      .catch(() => 'failed' as const)
      .then((found) => {
        if (!alive) return
        if (found === 'failed') {
          setLoaded({ kind: 'failed' })
          return
        }
        setLoaded({ kind: 'ready', view: found })
        if (found.rows.some(unseenChange)) void seeRuleChanges(noticeId).catch(() => false)
      })
    return () => {
      alive = false
    }
  }, [noticeId, rules, attempt])

  if (loaded.kind === 'loading') return null

  if (loaded.kind === 'failed') {
    return (
      <div className="grid justify-items-start gap-3">
        <ErrorCard code="E-NOTICE-READ" />
        <button
          type="button"
          className={ds.button.secondarySmall}
          onClick={() => {
            setLoaded({ kind: 'loading' })
            setAttempt((n) => n + 1)
          }}
        >
          다시 읽기
        </button>
      </div>
    )
  }

  const { rows, pending } = loaded.view
  const human = rows.filter((row) => row.verdict === 'human')
  const changed = rows.filter((row) => row.verdict === 'change')
  const calm = rows.filter((row) => row.verdict === 'none' || row.verdict === 'same')

  return (
    <>
      {human.length > 0 && <HumanBox noticeId={noticeId} rows={human} checkedAt={checkedAt} />}
      {changed.length > 0 && <ChangeBox rows={changed} rules={rules} />}
      {pending.length > 0 && <PendingBox rules={pending} />}
      {calm.length > 0 && <CalmBox rows={calm} />}
    </>
  )
}

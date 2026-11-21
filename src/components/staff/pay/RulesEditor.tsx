'use client'

import { useState } from 'react'
import { INCENTIVE_METHOD_LABEL, jobLabel } from '@/components/staff/labels'
import { ds } from '@/components/ui/classes'
import type { RuleDraft } from '@/lib/storage/staff'
import { INCENTIVE_METHODS, type IncentiveMethod, type IncentiveRule, type StaffMember } from '@/types/staff'
import { parseWon, won } from './format'
import { Note, smallInput } from './parts'

// 인센티브 규칙 (staff AC-7615.6, 시안 pay.html ③). 사람마다 항목 여럿(이름·방식·금액 또는 %).
// 고치면 그 사람 규칙 목록을 통째로 저장하고(saveRules) 저장 층이 보는 달부터 그 사람 급여 줄 인센티브를 새 값으로 바꾼다(앞 달은 그대로, AC-7606.4).
// 카드는 규칙이 있는 그달 재직자 + 이름 단추로 연 사람, 명단 차례.
// 저장하는 동안은 이 화면의 단추를 모두 막고 글 칸은 읽기만·방식 고르기는 막는다 — 두 번 넣거나 앞 규칙으로 덮어쓰지 않게,
// 저장이 끝난 뒤 새 규칙 목록(rules)을 다시 받을 때까지 막아 둔다(AC-7615.4)

const NAME_MAX = 20
const BAD_NAME = '항목 이름은 1~20자로 적어 주세요.'
const BAD_AMOUNT = '금액은 0 이상 숫자로 적어 주세요.'
const BAD_PERCENT = '%는 0~100, 소수 둘째 자리까지 적어 주세요.'

type Draft = { name: string; method: IncentiveMethod; value: string }
type SaveRules = (staffId: string, drafts: RuleDraft[]) => Promise<boolean>

const valueText = (rule: Pick<IncentiveRule, 'method' | 'unitAmount' | 'percent'>) =>
  rule.method === 'percent' ? (rule.percent === null ? '' : String(rule.percent)) : rule.unitAmount === null ? '' : won(rule.unitAmount)

/** 칸 글 → 규칙 값. 틀리면 까닭 글 */
export function ruleOf(draft: Draft): Omit<RuleDraft, 'sort' | 'id'> | string {
  const name = draft.name.trim()
  if (name.length === 0 || [...name].length > NAME_MAX) return BAD_NAME
  if (draft.method === 'percent') {
    const text = draft.value.trim()
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(text) || Number(text) > 100) return BAD_PERCENT
    return { name, method: 'percent', unitAmount: null, percent: Number(text) }
  }
  const amount = parseWon(draft.value)
  if (amount === null || amount === 'bad') return BAD_AMOUNT
  return { name, method: draft.method, unitAmount: amount, percent: null }
}

const asDraft = (rule: IncentiveRule): RuleDraft => ({ id: rule.id, name: rule.name, method: rule.method, unitAmount: rule.unitAmount, percent: rule.percent, sort: rule.sort })

function MethodSelect({ label, value, disabled, onChange }: { label: string; value: IncentiveMethod; disabled: boolean; onChange: (method: IncentiveMethod) => void }) {
  return (
    <select aria-label={label} disabled={disabled} className={`${smallInput} w-30`} value={value} onChange={(event) => onChange(event.target.value as IncentiveMethod)}>
      {INCENTIVE_METHODS.map((method) => (
        <option key={method} value={method}>
          {INCENTIVE_METHOD_LABEL[method]}
        </option>
      ))}
    </select>
  )
}

function RuleRow({
  who,
  index,
  rule,
  busy,
  onCommit,
  onRemove,
}: {
  who: string
  index: number
  rule: IncentiveRule
  busy: boolean
  onCommit: (draft: Draft) => void
  onRemove: () => void
}) {
  const [draft, setDraft] = useState<Draft>({ name: rule.name, method: rule.method, value: valueText(rule) })
  const label = `${who} ${index + 1}번째 항목`
  const changedFrom = (next: Draft) => next.name !== rule.name || next.method !== rule.method || next.value !== valueText(rule)
  const commit = (next: Draft) => {
    if (changedFrom(next)) onCommit(next)
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2">
      <input
        type="text"
        aria-label={`${label} 이름`}
        readOnly={busy}
        maxLength={NAME_MAX}
        className={`${smallInput} min-w-0 flex-[1_1_120px]`}
        value={draft.name}
        onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        onBlur={() => commit(draft)}
      />
      <MethodSelect
        label={`${label} 방식`}
        value={draft.method}
        disabled={busy}
        onChange={(method) => {
          const next = { ...draft, method }
          setDraft(next)
          commit(next)
        }}
      />
      <input
        type="text"
        inputMode="decimal"
        aria-label={`${label} 값`}
        readOnly={busy}
        className={`${smallInput} w-21 text-right tabular-nums`}
        value={draft.value}
        onChange={(event) => setDraft({ ...draft, value: event.target.value })}
        onBlur={() => commit(draft)}
      />
      <span className="w-4 text-small text-muted">{draft.method === 'percent' ? '%' : '원'}</span>
      <button type="button" disabled={busy} className={ds.button.secondarySmall} onClick={onRemove}>
        빼기
      </button>
    </div>
  )
}

function RuleCard({ member, rules, busy, onSave }: { member: StaffMember; rules: readonly IncentiveRule[]; busy: boolean; onSave: SaveRules }) {
  const [adding, setAdding] = useState<Draft | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const drafts = rules.map(asDraft)
  const save = async (next: RuleDraft[]) => {
    setProblem(null)
    return onSave(member.id, next.map((draft, sort) => ({ ...draft, sort })))
  }
  const commitRow = (index: number, draft: Draft) => {
    const rule = ruleOf(draft)
    if (typeof rule === 'string') {
      setProblem(rule)
      return
    }
    void save(drafts.map((old, i) => (i === index ? { ...old, ...rule } : old)))
  }
  const add = async () => {
    if (adding === null) return
    const rule = ruleOf(adding)
    if (typeof rule === 'string') {
      setProblem(rule)
      return
    }
    if (await save([...drafts, { ...rule, id: null, sort: drafts.length }])) setAdding(null)
  }
  return (
    <section role="group" aria-label={`${member.name} 인센티브 규칙`} className={`${ds.panel} rounded-float`}>
      <div className="flex items-baseline gap-2 border-b border-line px-4 py-2">
        <b className="text-subtitle font-semibold text-ink">{member.name}</b>
        <small className="text-caption text-muted">{jobLabel(member)}</small>
        <span className="ml-auto text-caption text-muted">{`항목 ${rules.length}개`}</span>
      </div>
      {rules.map((rule, i) => (
        <RuleRow
          key={`${rule.id}|${rule.name}|${rule.method}|${rule.unitAmount}|${rule.percent}`}
          who={member.name}
          index={i}
          rule={rule}
          busy={busy}
          onCommit={(draft) => commitRow(i, draft)}
          onRemove={() => void save(drafts.filter((_, j) => j !== i))}
        />
      ))}
      {adding !== null && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-accent-soft px-4 py-2 outline-2 -outline-offset-2 outline-dashed outline-accent">
          <input
            type="text"
            aria-label={`${member.name} 새 항목 이름`}
            readOnly={busy}
            maxLength={NAME_MAX}
            placeholder="항목 이름"
            className={`${smallInput} min-w-0 flex-[1_1_120px]`}
            value={adding.name}
            onChange={(event) => setAdding({ ...adding, name: event.target.value })}
          />
          <MethodSelect label={`${member.name} 새 항목 방식`} value={adding.method} disabled={busy} onChange={(method) => setAdding({ ...adding, method })} />
          <input
            type="text"
            inputMode="decimal"
            aria-label={`${member.name} 새 항목 값`}
            readOnly={busy}
            placeholder={adding.method === 'percent' ? '%' : '금액'}
            className={`${smallInput} w-21 text-right tabular-nums`}
            value={adding.value}
            onChange={(event) => setAdding({ ...adding, value: event.target.value })}
          />
          <span className="w-4 text-small text-muted">{adding.method === 'percent' ? '%' : '원'}</span>
          <button type="button" disabled={busy} className={ds.button.primarySmall} onClick={() => void add()}>
            넣기
          </button>
          <button
            type="button"
            disabled={busy}
            className={ds.button.ghostSmall}
            onClick={() => {
              setAdding(null)
              setProblem(null)
            }}
          >
            그만두기
          </button>
        </div>
      )}
      <div className="flex flex-col gap-2 px-4 py-3">
        {problem !== null && (
          <p role="alert" className={ds.fieldError}>
            {problem}
          </p>
        )}
        {adding === null && (
          <button
            type="button"
            disabled={busy}
            className={`${ds.button.secondarySmall} self-start`}
            onClick={() => setAdding({ name: '', method: 'per_case', value: '' })}
          >
            + 항목 더하기
          </button>
        )}
      </div>
    </section>
  )
}

export function RulesEditor({
  members,
  rules,
  onSave,
  onBack,
}: {
  members: readonly StaffMember[]
  rules: readonly IncentiveRule[]
  onSave: SaveRules
  onBack: () => void
}) {
  const [opened, setOpened] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [savedOver, setSavedOver] = useState<readonly IncentiveRule[] | null>(null)
  const busy = saving || savedOver === rules
  const save: SaveRules = async (staffId, drafts) => {
    if (busy) return false
    setSaving(true)
    const ok = await onSave(staffId, drafts)
    setSaving(false)
    // 이 규칙 목록(rules)으로 저장했다 — 다시 읽은 목록이 올 때까지 막는다
    if (ok) setSavedOver(rules)
    return ok
  }
  const rulesOf = (staffId: string) => rules.filter((rule) => rule.staffId === staffId).sort((a, b) => a.sort - b.sort)
  const cards = members.filter((member) => rulesOf(member.id).length > 0 || opened.includes(member.id))
  const none = members.filter((member) => !cards.includes(member))
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} className={ds.button.secondarySmall} onClick={onBack}>
          ‹ 이달 실적으로
        </button>
        <h2 className="text-subtitle font-semibold text-ink">인센티브 규칙</h2>
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1.5 text-caption text-ink-2">
        <span>
          <b className="font-semibold text-ink">건당 정액</b> = 건수 × 금액
        </span>
        {' · '}
        <span>
          <b className="font-semibold text-ink">매출의 %</b> = 매출 × %
        </span>
        {' · '}
        <span>
          <b className="font-semibold text-ink">고정 수당</b> = 매달 같은 금액
        </span>
      </p>
      <div className="grid min-w-0 grid-cols-2 items-start gap-3">
        {cards.map((member) => (
          <RuleCard key={member.id} member={member} rules={rulesOf(member.id)} busy={busy} onSave={save} />
        ))}
        {none.length > 0 && (
          <div
            role="group"
            aria-label="규칙 없음"
            className="flex min-w-0 flex-wrap items-center gap-2 rounded-float border border-dashed border-line-strong bg-surface px-4 py-2 text-small text-ink-2"
          >
            <span>규칙 없음</span>
            {none.map((member) => (
              <button
                key={member.id}
                type="button"
                disabled={busy}
                className={ds.button.secondarySmall}
                onClick={() => setOpened((ids) => [...ids, member.id])}
              >
                {`+ ${member.name}`}
              </button>
            ))}
            <span className="basis-full text-caption text-muted">이름을 누르면 그 사람 카드가 생기고 항목을 더할 수 있어요.</span>
          </div>
        )}
      </div>
      <Note>금액·%를 고치면 지금 보는 달부터 새 값으로 계산하고, 지난 달 인센티브는 그때 금액 그대로 둬요.</Note>
    </div>
  )
}

'use client'

import { useRef, useState } from 'react'
import { ds } from '@/components/ui/classes'
import { parseWon } from '@/lib/sunap/ledger'
import { addSpend, deleteSpend, SPEND_KINDS, SPEND_MEMO_MAX, updateSpend, type SpendInput, type SpendKind, type SunapSpend } from '@/lib/storage/sunap'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { WON_PROBLEM, won } from './labels'
import { PanelHead, TABLE, TD, TF, TF_NUM, TH, TH_NUM } from './rows/parts'
import { SPEND_LABEL } from './SunapCards'

// 지출 칸(spec sunap-ilji AC-4905.6, 시안 bottomPanels '지출'): 환자 정보가 아니라 서버(sunap_spends)에 바로 저장한다.
// 종류를 바꾸면 바로, 내용·금액은 그 줄을 나가면 저장한다. 새 줄은 내용을 적고 나가면 넣는다(내용 1~50자).
// 개인정보 모양 내용은 저장 함수가 보내지 않고('blocked') 까닭을 보인다. 마감한 날(editable 거짓)은 저장된 줄을 글자로만 보인다.
// 줄 상태는 ref에 먼저 적고 그린다: 늦게 끝난 저장이 그 사이 친 글자를 덮지 않고, 저장 뒤 바로 지금 줄로 부모에게 알린다

type Problem = 'blocked' | 'amount' | 'empty' | 'failed'
type Line = { key: string; kind: SpendKind; memo: string; amount: string; saved: SunapSpend | null; saving: boolean; problem: Problem | null }

const PROBLEM: Record<Problem, string> = {
  blocked: '전화번호·주민번호 같은 글자가 있어 저장하지 않았어요. 환자 정보는 적지 말아 주세요.',
  amount: WON_PROBLEM,
  empty: '내용을 적어 주세요',
  failed: '지출을 저장하지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요.',
}

const lineOf = (spend: SunapSpend): Line => ({
  key: spend.id,
  kind: spend.kind,
  memo: spend.memo,
  amount: won(spend.amount),
  saved: spend,
  saving: false,
  problem: null,
})

const SELECT = `h-8 min-w-30 cursor-pointer rounded-control border border-line-strong bg-surface px-2 text-small text-ink ${ds.focusRing} max-md:h-11`
const INPUT = `h-8 w-full min-w-35 rounded-control border border-line-strong bg-surface px-2 text-small text-ink ${ds.focusRing} aria-invalid:border-negative max-md:h-11`

export function SpendPanel({
  day,
  spends,
  editable,
  onSpends,
}: {
  day: string
  spends: readonly SunapSpend[]
  editable: boolean
  onSpends(next: SunapSpend[]): void
}) {
  const [lines, setLines] = useState<Line[]>(() => spends.map(lineOf))
  const now = useRef(lines)
  const made = useRef(0)

  const apply = (change: (prev: Line[]) => Line[]) => {
    now.current = change(now.current)
    setLines(now.current)
  }
  const set = (key: string, patch: Partial<Line>) => apply((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  const report = () => onSpends(now.current.flatMap((line) => (line.saved ? [line.saved] : [])))

  async function commit(key: string): Promise<void> {
    const line = now.current.find((item) => item.key === key)
    if (!line || line.saving) return
    const memo = line.memo.trim()
    const amount = parseWon(line.amount)
    if (amount === 'invalid') return set(key, { problem: 'amount' })
    const saved = line.saved
    let body: Partial<SpendInput>
    if (saved === null) {
      if (memo === '') return set(key, { problem: null })
      body = { kind: line.kind, memo, amount }
    } else {
      if (memo === '') return set(key, { problem: 'empty' })
      body = {}
      if (line.kind !== saved.kind) body.kind = line.kind
      if (memo !== saved.memo) body.memo = memo
      if (amount !== saved.amount) body.amount = amount
      if (Object.keys(body).length === 0) return set(key, { problem: null })
    }
    set(key, { saving: true, problem: null })
    try {
      const client = supabaseBrowser()
      const reply = saved === null ? await addSpend(client, day, body as SpendInput) : await updateSpend(client, saved.id, body)
      if (reply === 'blocked') return set(key, { saving: false, problem: 'blocked' })
      const current = now.current.find((item) => item.key === key)
      // 그 사이 금액을 다시 고치지 않았으면 쉼표 모양으로 맞춘다
      const amountText = current && parseWon(current.amount) === reply.amount ? won(reply.amount) : current?.amount
      set(key, { saving: false, saved: reply, ...(amountText !== undefined ? { amount: amountText } : {}) })
      report()
      // 저장하는 사이 바뀐 칸이 있으면 한 번 더
      await commit(key)
    } catch {
      set(key, { saving: false, problem: 'failed' })
    }
  }

  async function remove(key: string) {
    const line = now.current.find((item) => item.key === key)
    if (!line || line.saving) return
    if (line.saved === null) return apply((prev) => prev.filter((item) => item.key !== key))
    set(key, { saving: true, problem: null })
    try {
      await deleteSpend(supabaseBrowser(), line.saved.id)
      apply((prev) => prev.filter((item) => item.key !== key))
      report()
    } catch {
      set(key, { saving: false, problem: 'failed' })
    }
  }

  function addLine() {
    made.current += 1
    apply((prev) => [...prev, { key: `new-${made.current}`, kind: 'cash', memo: '', amount: '', saved: null, saving: false, problem: null }])
  }

  const saved = lines.flatMap((line) => (line.saved ? [line.saved] : []))
  const total = saved.reduce((sum, spend) => sum + spend.amount, 0)

  return (
    <section aria-label="지출 목록" className="min-w-0 rounded-control border border-line bg-surface">
      <PanelHead id="sunap-spend-title" title="지출" hint="손으로 적어요 · 환자 정보가 없어 서버에도 저장돼요" />
      <div className="overflow-x-auto">
        <table className={`${TABLE} min-w-115`}>
          <thead>
            <tr>
              <th className={TH}>종류</th>
              <th className={TH}>내용</th>
              <th className={TH_NUM}>금액</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody>
            {editable
              ? lines.map((line) => (
                  <SpendLine
                    key={line.key}
                    line={line}
                    onKind={(kind) => {
                      set(line.key, { kind })
                      void commit(line.key)
                    }}
                    onText={(patch) => set(line.key, patch)}
                    onLeave={() => void commit(line.key)}
                    onRemove={() => void remove(line.key)}
                  />
                ))
              : saved.map((spend) => (
                  <tr key={spend.id}>
                    <td className={TD}>{SPEND_LABEL[spend.kind]}</td>
                    <td className={TD}>{spend.memo}</td>
                    <td className={`${TD} text-right! tabular-nums`}>{won(spend.amount)}</td>
                    <td className={TD} />
                  </tr>
                ))}
            {editable && (
              <tr>
                <td colSpan={4} className={`${TD} h-11`}>
                  <button type="button" className={ds.button.secondarySmall} onClick={addLine}>
                    + 지출 줄 더하기
                  </button>
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className={TF}>{`합계 · ${won(saved.length)}건`}</td>
              <td className={TF_NUM}>{won(total)}</td>
              <td className={TF} />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

function SpendLine({
  line,
  onKind,
  onText,
  onLeave,
  onRemove,
}: {
  line: Line
  onKind(kind: SpendKind): void
  onText(patch: Pick<Partial<Line>, 'memo' | 'amount'>): void
  onLeave(): void
  onRemove(): void
}) {
  const row = useRef<HTMLTableRowElement>(null)
  return (
    <>
      <tr
        ref={row}
        aria-busy={line.saving || undefined}
        onBlur={() => {
          // 같은 줄 안에서 칸을 옮기면 저장하지 않는다. 초점이 옮겨 간 뒤에 본다
          setTimeout(() => {
            if (row.current && !row.current.contains(document.activeElement)) onLeave()
          }, 0)
        }}
      >
        <td className={TD}>
          <select aria-label="지출 종류" value={line.kind} onChange={(event) => onKind(event.target.value as SpendKind)} className={SELECT}>
            {SPEND_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {SPEND_LABEL[kind]}
              </option>
            ))}
          </select>
        </td>
        <td className={TD}>
          <input
            type="text"
            aria-label="지출 내용"
            autoComplete="off"
            autoFocus={line.saved === null && line.memo === ''}
            maxLength={SPEND_MEMO_MAX}
            value={line.memo}
            aria-invalid={line.problem === 'blocked' || line.problem === 'empty' || undefined}
            onChange={(event) => onText({ memo: event.target.value })}
            className={INPUT}
          />
        </td>
        <td className={`${TD} text-right!`}>
          <input
            type="text"
            inputMode="numeric"
            aria-label="지출 금액"
            autoComplete="off"
            value={line.amount}
            aria-invalid={line.problem === 'amount' || undefined}
            onChange={(event) => onText({ amount: event.target.value })}
            className={`${INPUT} min-w-24! text-right tabular-nums`}
          />
        </td>
        <td className={`${TD} text-center!`}>
          <button type="button" aria-label="지우기" title="지우기" className={`${ds.button.ghostSmall} text-muted`} onClick={onRemove}>
            ×
          </button>
        </td>
      </tr>
      {line.problem !== null && (
        <tr>
          <td colSpan={4} className={`${TD} h-auto! py-2`}>
            <p role="alert" className={ds.fieldError}>
              {PROBLEM[line.problem]}
            </p>
          </td>
        </tr>
      )}
    </>
  )
}

import { Fragment, useId, type ReactNode } from 'react'
import { SPEND_KINDS, type SpendKind, type SunapSpend } from '@/lib/storage/sunap'
import type { SunapTotals } from '@/types/sunap'
import { pct, won } from './labels'

// 수납일지 요약 네 칸(spec sunap-ilji AC-4905.1·4905.7, 시안 summaryCards): 수납·지출·내원·예약 · Block 전환.
// 숫자만 받는다(마감 숫자 24칸 + 그날 지출) → 접수 PC 장부와 다른 기기 화면이 같이 쓴다

export const SPEND_LABEL: Record<SpendKind, string> = { cash: '현금', card: '카드', etc: '기타', parking: '현금(주차지원)' }

type Line = { name: ReactNode; mid: string; value: string; sub?: boolean; tone?: 'negative' | 'zero' } | 'hr'

/** 이름 · 가운데(옅게) · 값(진하게) 세 칸 줄. 'hr'은 가는 선 */
function Kv({ lines }: { lines: Line[] }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 gap-y-1 text-small">
      {lines.map((line, index) =>
        line === 'hr' ? (
          <i key={index} aria-hidden="true" className="col-span-3 my-0.5 h-px bg-line" />
        ) : (
          <Fragment key={index}>
            <span className={line.sub ? 'text-muted' : 'text-ink-2'}>{line.name}</span>
            <span className="text-right whitespace-nowrap text-muted tabular-nums">{line.mid}</span>
            <span
              className={`text-right font-semibold whitespace-nowrap tabular-nums ${
                line.tone === 'negative' ? 'text-negative' : line.tone === 'zero' ? 'text-muted' : 'text-ink'
              }`}
            >
              {line.value}
            </span>
          </Fragment>
        ),
      )}
    </div>
  )
}

function Card({ title, small, children }: { title: string; small?: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="grid min-w-0 content-start gap-3 rounded-control border border-line bg-surface px-5 py-4">
      <h3 id={id} className="flex items-baseline justify-between gap-2 text-body font-semibold text-ink">
        {title} {small !== undefined && <small className="text-caption font-medium text-muted">{small}</small>}
      </h3>
      {children}
    </section>
  )
}

function Big({ value, unit }: { value: string; unit?: string }) {
  return (
    <div className="text-title font-semibold text-ink tabular-nums">
      {value}
      {unit !== undefined && <small className="ml-1 text-small font-medium text-muted">{unit}</small>}
    </div>
  )
}

function Rate({ name, a, b, note, teal }: { name: string; a: number; b: number; note: string; teal?: boolean }) {
  const width = b ? Math.min(100, (a / b) * 100) : 0
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 text-small">
      <span className="font-medium text-ink-2">{name}</span>
      <b className="text-right text-lead font-semibold text-ink tabular-nums">{pct(a, b)}</b>
      <em className="col-span-2 text-caption text-muted not-italic tabular-nums">{note}</em>
      <span aria-hidden="true" className="col-span-2 mt-0.5 h-1.5 overflow-clip rounded-control bg-line">
        <i className={`block h-full rounded-control ${teal ? 'bg-cat-2' : 'bg-accent'}`} style={{ width: `${width}%` }} />
      </span>
    </div>
  )
}

export function SunapCards({ totals: t, spends }: { totals: SunapTotals; spends: readonly SunapSpend[] }) {
  const pay: [string, number, number][] = [
    ['현금', t.cash_n, t.cash_won],
    ['카드', t.card_n, t.card_won],
    ['계좌이체', t.transfer_n, t.transfer_won],
    ['미수 입금(현금)', t.paid_cash_n, t.paid_cash_won],
    ['미수 입금(카드)', t.paid_card_n, t.paid_card_won],
    ['FREE', t.free_n, 0],
  ]
  const payCount = pay.reduce((sum, [, n]) => sum + n, 0)
  const payTotal = pay.reduce((sum, [, , w]) => sum + w, 0)
  const spend = SPEND_KINDS.map((kind) => {
    const mine = spends.filter((s) => s.kind === kind)
    return [SPEND_LABEL[kind], mine.length, mine.reduce((sum, s) => sum + s.amount, 0)] as const
  })
  const spendTotal = spends.reduce((sum, s) => sum + s.amount, 0)

  return (
    <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-md:grid-cols-1">
      <Card title="수납" small={`${won(payCount)}건`}>
        <Big value={won(payTotal)} unit="원" />
        <Kv
          lines={[
            ...pay.map(([name, n, w]): Line => ({ name, mid: `${won(n)}건`, value: won(w) })),
            'hr',
            { name: '오늘 생긴 미수', mid: `${won(t.unpaid_n)}건`, value: won(t.unpaid_won), sub: true, tone: 'negative' },
          ]}
        />
      </Card>
      <Card title="지출" small={`${won(spends.length)}건`}>
        <Big value={won(spendTotal)} unit="원" />
        <Kv lines={spend.map(([name, n, w]): Line => ({ name, mid: `${won(n)}건`, value: won(w), tone: w ? undefined : 'zero' }))} />
      </Card>
      <Card title="내원" small="총 내원 대비">
        <Big value={won(t.visits)} unit="명" />
        <Kv
          lines={[
            { name: '초진', mid: pct(t.first_n, t.visits), value: `${won(t.first_n)}명` },
            { name: '90일초진', mid: pct(t.d90_n, t.visits), value: `${won(t.d90_n)}명` },
            { name: '재진', mid: pct(t.ret_n, t.visits), value: `${won(t.ret_n)}명` },
            'hr',
            { name: 'Block', mid: pct(t.block_n, t.visits), value: `${won(t.block_n)}명` },
            { name: '물리치료', mid: pct(t.pt_n, t.visits), value: `${won(t.pt_n)}명` },
          ]}
        />
      </Card>
      <Card title="예약 · Block 전환">
        <Rate name="초진 예약률" a={t.rsv_first} b={t.first_n} note={`초진 ${won(t.first_n)}명 중 ${won(t.rsv_first)}명 · 주사치료·진료(경과) 예약만`} />
        <Rate name="90일 예약률" a={t.rsv_d90} b={t.d90_n} note={`90일초진 ${won(t.d90_n)}명 중 ${won(t.rsv_d90)}명`} teal />
        <Kv
          lines={[
            'hr',
            { name: '초진+Block', mid: `${t.first_block}/${t.first_n}`, value: pct(t.first_block, t.first_n) },
            { name: '90일+Block', mid: `${t.d90_block}/${t.d90_n}`, value: pct(t.d90_block, t.d90_n) },
            {
              name: (
                <>
                  재진+Block <span className="text-muted">(Block 중)</span>
                </>
              ),
              mid: `${t.ret_block}/${t.block_n}`,
              value: pct(t.ret_block, t.block_n),
            },
          ]}
        />
      </Card>
    </div>
  )
}

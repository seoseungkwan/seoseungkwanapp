import type { PaidRow } from '@/types/sunap'
import { cellWon } from '../labels'
import { PanelHead, TABLE, TD, TD_INK, TD_MUTED, TD_NUM, TH, TH_NUM } from './parts'

// 미수 입금 칸(spec sunap-ilji AC-4905.1, 시안 bottomPanels) [장부 줄 화면 울타리 안]. 받은 줄을 그리기만 한다.
// 시안의 '미수 생긴 날' 칸은 뺐다(design.md '시안과 다른 곳'). 비트는 미수 입금에 날짜만 두어 시각이 빈 글이면 –

export function PaidRows({ paid }: { paid: readonly PaidRow[] }) {
  return (
    <section aria-labelledby="sunap-paid-title" className="min-w-0 rounded-control border border-line bg-surface">
      <PanelHead id="sunap-paid-title" title="미수 입금" hint="예전 미수를 오늘 내신 분 · 내원 수에는 안 들어가요" />
      <div className="overflow-x-auto">
        <table className={`${TABLE} min-w-100`}>
          <thead>
            <tr>
              <th className={TH}>접수</th>
              <th className={TH}>차트</th>
              <th className={TH}>이름</th>
              <th className={TH_NUM}>현금</th>
              <th className={TH_NUM}>카드</th>
            </tr>
          </thead>
          <tbody>
            {paid.length === 0 ? (
              <tr>
                <td colSpan={5} className={TD_MUTED}>
                  미수 입금이 없어요
                </td>
              </tr>
            ) : (
              paid.map((row, index) => (
                <tr key={`${row.chart}-${index}`}>
                  <td className={`${TD} tabular-nums`}>{row.time === '' ? '–' : row.time}</td>
                  <td className={`${TD_MUTED} tabular-nums`}>{row.chart}</td>
                  <td className={`${TD_INK} font-semibold`}>{row.name}</td>
                  <td className={TD_NUM}>{cellWon(row.cash)}</td>
                  <td className={TD_NUM}>{cellWon(row.card)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

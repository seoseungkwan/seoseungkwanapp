import { useId } from 'react'
import { formatCount } from '@/components/charts/format'
import { sunapPct } from '@/components/stats/sunapView'
import type { DoctorBreakdown, SunapRates } from '@/types/sunap'
import { PanelHead, TABLE, TD, TD_INK, TF, TF_NUM, TH, TH_NUM } from './rows/parts'

// 원장님별 표 (spec sunap-doctors AC-5001.5, 시안 docs/mockups/sunap-ilji/index.html doctorPanel).
// 수납일지 하루 화면(장부 아래)과 통계 '예약·전환' 칸이 같이 쓴다. 원장님 이름과 수만 받는다(환자 정보 없음).
// 칸마다 수 옆에 작은 비율(sunapPct, 분모가 0이면 '–'): 초진·90일초진·Block·물리치료 = 내원 중, 초진+Block = 초진 중,
// 90일+Block = 90일초진 중, 재진+Block = Block 중. 가로 스크롤 안 최소 너비 860px, 끝 줄 합계, 아래 설명 한 줄(시안 그대로)

const TITLE = '원장님별'
const COLUMNS = ['원장님', '내원', '초진', '90일초진', 'Block', '물리치료', '초진+Block', '90일+Block', '재진+Block'] as const
const LEGEND = [
  '초진·90일초진·Block·물리치료 % = 그 원장님 내원 중',
  '초진+Block % = 초진 중 · 90일+Block % = 90일초진 중 · 재진+Block % = Block 받은 사람 중(엑셀과 같음)',
]

// 몸 줄: 원장님 이름은 진하게, 숫자는 오른쪽(시안 .dr td). 합계 줄은 TF 모양
const NAME = `${TD_INK} font-semibold`
const NUM = `${TD} text-right! tabular-nums`
const PCT = 'ml-1 font-normal text-muted'

// 내원 다음 칸들의 [수, 분모]
function parts(rates: SunapRates): [number, number][] {
  return [
    [rates.first_n, rates.visits],
    [rates.d90_n, rates.visits],
    [rates.block_n, rates.visits],
    [rates.pt_n, rates.visits],
    [rates.first_block, rates.first_n],
    [rates.d90_block, rates.d90_n],
    [rates.ret_block, rates.block_n],
  ]
}

function Line({ label, rates, total }: { label: string; rates: SunapRates; total: boolean }) {
  const num = total ? TF_NUM : NUM
  return (
    <tr>
      <td className={total ? TF : NAME}>{label}</td>
      <td className={num}>{`${formatCount(rates.visits)}명`}</td>
      {parts(rates).map(([part, whole], i) => (
        <td key={i} className={num}>
          {formatCount(part)}
          <span className={PCT}>{sunapPct(part, whole)}</span>
        </td>
      ))}
    </tr>
  )
}

export function DoctorTable({ data, hint }: { data: DoctorBreakdown; hint: string }) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="min-w-0 rounded-control border border-line bg-surface">
      <PanelHead id={titleId} title={TITLE} hint={hint} />
      <div className="overflow-x-auto">
        <table className={`${TABLE} min-w-215`}>
          <thead>
            <tr>
              {COLUMNS.map((column, i) => (
                <th key={column} scope="col" className={i === 0 ? TH : TH_NUM}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, i) => (
              <Line key={i} label={row.label} rates={row.rates} total={false} />
            ))}
          </tbody>
          <tfoot>
            <Line label="합계" rates={data.total} total />
          </tfoot>
        </table>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line px-5 py-3 text-caption text-muted max-md:px-4">
        {LEGEND.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </div>
    </section>
  )
}

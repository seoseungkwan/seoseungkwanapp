import { formatCount } from '@/components/charts/format'
import { Icon } from '@/components/common/Icon'
import base from './base.module.css'
import styles from './FeaturesSection.module.css'

// 급여 패널 예시 줄(승인 시안 그대로인 예시, 원 단위 정수). 바닥 줄 합계는 줄 합계의 합이다(plan.md §5)
const PAYROLL = [
  { name: '직원 1', job: '물리치료사', incentive: 420_000, total: 3_120_000 },
  { name: '직원 2', job: '도수치료사', incentive: 680_000, total: 3_480_000 },
  { name: '직원 3', job: '간호조무사', incentive: 120_000, total: 2_510_000 },
  { name: '직원 4', job: '방사선사', incentive: 150_000, total: 2_890_000 },
]
const PAYROLL_SUM = PAYROLL.reduce((sum, row) => sum + row.total, 0)
const won = (n: number) => `${formatCount(n)}원`

// 기능 목록 다섯 줄. pc는 768px 이상 긴 설명(지금 문구), phone은 768px 미만 짧은 설명(시안 휴대폰 문구).
// 02 급여·인센티브는 768px 이상에서 왼쪽 급여 덩어리가 대신하므로 휴대폰에만 보인다(pc 없음)
const FEATURES: { num: string; title: string; pc?: string; phone: string }[] = [
  {
    num: '01',
    title: '환자 통계',
    pc: 'EMR에서 내려받은 통계 파일을 올리면 신환율·재진율, 7일·14일 재방문, 처방 그룹별 환자 수가 바로 계산됩니다.',
    phone: '통계 파일을 올리면 신환율·재진율, 재방문이 바로 계산됩니다.',
  },
  { num: '02', title: '급여·인센티브', phone: '월 실적만 넣으면 급여 계산이 끝납니다.' },
  {
    num: '03',
    title: '매출·재고',
    pc: '매출 흐름을 보고, 재고가 떨어지면 대시보드에 발주 알림을 띄웁니다.',
    phone: '재고가 떨어지면 발주 알림을 띄웁니다.',
  },
  {
    num: '04',
    title: '일일마감·보고',
    pc: '일일마감, 일일보고, 월말보고를 정해진 양식에 맞춰 빠르게 씁니다.',
    phone: '정해진 양식에 맞춰 빠르게 씁니다.',
  },
  {
    num: '05',
    title: '원장님 월간 보고',
    pc: '월말보고·통계 그래프·AI 분석을 한 장에 모아 PDF로 저장합니다.',
    phone: '한 장에 모아 PDF로 저장합니다.',
  },
]

// 기능 섹션(#features, 흰 바탕·내용 위 1px 선) (specs/b2b-redesign AC-210.1, 시안 screens.mjs landingPC·landingPhone #features).
// 1024px 이상 12칸에서 급여 덩어리 1~6칸 · 기능 목록 7칸 비우고 8~12칸, 미만은 쌓인다. 급여 덩어리는 768px 이상만이다.
// 상자는 급여 패널 하나다. 표는 읽히고(aria-hidden 없음) 아무것도 받지 않는다
export default function FeaturesSection() {
  return (
    <section id="features" className={base.sec}>
      <div className={`${base.wrap} ${styles.inner}`}>
        <h2 className={`${base.tHeading} ${styles.title}`}>매일 하던 일, 이제 숫자가 알아서 움직입니다</h2>
        <div className={`${base.grid} ${styles.layout}`}>
          <div className={`${styles.pay} ${base.pcOnly}`}>
            <p className={`${base.tSmall} ${styles.kicker}`}>02 · 급여·인센티브</p>
            <h3 className={`${base.tTitle} ${styles.payTitle}`}>월 실적만 넣으면 급여 계산이 끝납니다</h3>
            <p className={styles.payLead}>
              직원별 인센티브 규칙을 한 번 정해 두면, 월 실적으로 급여를 계산하고 확정합니다. 세무사 전달표와 인건비율·치료사 생산성도 함께 나옵니다.
            </p>
            <div className={styles.panel}>
              <div className={styles.panelHead}>
                <p className={base.tSubtitle}>
                  10월 급여 <span className={`${base.tSmall} ${styles.sample}`}>예시</span>
                </p>
                <span className={`${base.chip} ${base.chipPositive}`}>
                  <Icon name="check" size={12} />
                  10월 확정됨
                </span>
              </div>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col" className={styles.head}>
                      직원
                    </th>
                    <th scope="col" className={styles.head}>
                      직종
                    </th>
                    <th scope="col" className={`${styles.head} ${styles.amount}`}>
                      인센티브
                    </th>
                    <th scope="col" className={`${styles.head} ${styles.amount}`}>
                      합계
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {PAYROLL.map((row) => (
                    <tr key={row.name} className={styles.row}>
                      <td className={styles.cell}>{row.name}</td>
                      <td className={styles.cell}>{row.job}</td>
                      <td className={`${styles.cell} ${styles.amount}`}>{won(row.incentive)}</td>
                      <td className={`${styles.cell} ${styles.amount}`}>{won(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className={`${styles.cell} ${styles.sum}`}>
                      합계 {PAYROLL.length}명
                    </td>
                    <td className={`${styles.cell} ${styles.sum} ${styles.amount}`}>{won(PAYROLL_SUM)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <ol className={styles.list}>
            {FEATURES.map((item) => (
              <li key={item.num} className={item.pc ? styles.item : `${styles.item} ${base.phoneOnly}`}>
                <span className={styles.num}>{item.num}</span>
                <h3 className={`${base.tSubtitle} ${styles.itemTitle}`}>{item.title}</h3>
                {item.pc && <p className={`${styles.desc} ${base.pcOnly}`}>{item.pc}</p>}
                <p className={`${styles.short} ${base.phoneOnly}`}>{item.phone}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

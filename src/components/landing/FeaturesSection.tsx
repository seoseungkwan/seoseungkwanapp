import { Icon } from '@/components/common/Icon'
import base from './base.module.css'
import styles from './FeaturesSection.module.css'

// 기능 목록 네 줄(시안 docs/mockups/ui-90/entry/screens.mjs FEATURES). pc는 768px 이상 긴 설명, phone은 768px 미만 짧은 설명.
// 01 청구 사전점검은 지금 쓸 수 있고(ready), 768px 이상에서는 왼쪽 사전점검 덩어리가 대신하므로 목록에서는 휴대폰에만 보인다(pc 없음).
// 아직 없는 기능(02~04)에는 "준비 중" 칩이 붙는다
const FEATURES: { num: string; title: string; ready?: boolean; pc?: string; phone: string }[] = [
  { num: '01', title: '청구 · 삭감 예방 사전점검', ready: true, phone: '청구하기 전에 삭감될 만한 처방을 미리 찾아 줘요.' },
  {
    num: '02',
    title: '환자 통계',
    pc: 'EMR에서 내려받은 통계 파일을 올리면 신환율·재진율, 7일·14일 재방문, 처방 그룹별 환자 수를 바로 계산해요.',
    phone: '통계 파일을 올리면 신환율·재진율, 재방문을 바로 계산해요.',
  },
  {
    num: '03',
    title: '매출·재고',
    pc: '매출 흐름을 보고, 재고가 떨어지면 대시보드에 발주 알림을 띄워요.',
    phone: '재고가 떨어지면 발주 알림을 띄워요.',
  },
  {
    num: '04',
    title: '직원·업무일지',
    pc: '직원 명단과 급여 계산, 엑셀 양식 그대로의 업무일지를 한곳에서 써요.',
    phone: '급여 계산과 엑셀 양식 그대로의 업무일지를 써요.',
  },
]

// 사전점검 예시 패널 줄(시안 그대로인 예시, 환자는 이름 대신 번호). basis가 없는 줄은 근거 줄이 없다
const CHECKS: { patient: string; tone: string; result: string; text: string; basis?: string }[] = [
  { patient: '환자 1', tone: base.chipWarning, result: '확인 필요', text: '도수치료 처방에 맞는 상병이 없어요', basis: '근거 · 고시 기준' },
  { patient: '환자 2', tone: base.chipAccent, result: '알림', text: '같은 주 물리치료 횟수가 기준보다 많아요', basis: '근거 · 고시 기준' },
  { patient: '환자 3', tone: base.chipNeutral, result: '참고', text: '추천 상병이 하나 있어요' },
]

// 지금 쓸 수 있는 기능 표시(positive 칩, 체크 12px)
function ReadyChip() {
  return (
    <span className={`${base.chip} ${base.chipPositive}`}>
      <Icon name="check" size={12} />
      쓸 수 있어요
    </span>
  )
}

// 기능 섹션(#features, 흰 바탕·내용 위 1px 선) (specs/b2b-redesign AC-210.1, specs/ui-90 AC-421.6, 시안 screens.mjs landingPC·landingPhone #features).
// h2 · 안내 → 1024px 이상 12칸에서 01 사전점검 덩어리 1~6칸 · 기능 목록(02~04) 7칸 비우고 8~12칸, 미만은 쌓인다.
// 사전점검 덩어리는 768px 이상만이고, 휴대폰은 01~04 목록 하나다. 상자는 사전점검 예시 패널 하나다. 표는 읽히고 아무것도 받지 않는다
export default function FeaturesSection() {
  return (
    <section id="features" className={base.sec}>
      <div className={`${base.wrap} ${styles.inner}`}>
        <h2 className={`${base.tHeading} ${styles.title}`}>매일 하던 일을 한곳에 모아요</h2>
        <p className={`${base.tLead} ${styles.lead}`}>지금은 청구 사전점검을 쓸 수 있고, 나머지 기능은 차례로 열려요.</p>
        <div className={`${base.grid} ${styles.layout}`}>
          <div className={`${styles.pre} ${base.pcOnly}`}>
            <p className={styles.kicker}>
              <span className={`${base.tSmall} ${styles.kickerText}`}>01 · 청구 · 삭감 예방 사전점검</span>
              <ReadyChip />
            </p>
            <h3 className={`${base.tTitle} ${styles.preTitle}`}>청구하기 전에 삭감될 만한 처방을 미리 찾아 줘요</h3>
            <p className={styles.preLead}>
              비트 PC의 크롬에서 열면 환자마다 점검 결과와 고시 근거, 추천 상병을 보여 줘요. 환자 자료는{' '}
              <span className={base.nw}>그 PC 안에서만</span> 점검해요.
            </p>
            <div className={styles.panel}>
              <div className={styles.panelHead}>
                <p className={base.tSubtitle}>
                  10월 28일 사전점검 <span className={`${base.tSmall} ${styles.sample}`}>예시</span>
                </p>
                <p className={`${base.tSmall} ${styles.count}`}>환자 32명 점검</p>
              </div>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col" className={styles.head}>
                      환자
                    </th>
                    <th scope="col" className={styles.head}>
                      점검 결과
                    </th>
                    <th scope="col" className={styles.head}>
                      내용
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {CHECKS.map((row) => (
                    <tr key={row.patient} className={styles.row}>
                      <td className={`${styles.cell} ${styles.patient}`}>{row.patient}</td>
                      <td className={`${styles.cell} ${styles.result}`}>
                        <span className={`${base.chip} ${row.tone}`}>{row.result}</span>
                      </td>
                      <td className={styles.cell}>
                        {row.text}
                        {row.basis && <span className={`${base.tCaption} ${styles.basis}`}>{row.basis}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <ol className={styles.list}>
            {FEATURES.map((item) => (
              <li key={item.num} className={item.pc ? styles.item : `${styles.item} ${base.phoneOnly}`}>
                <span className={styles.num}>{item.num}</span>
                <h3 className={`${base.tSubtitle} ${styles.itemTitle}`}>
                  {item.title}
                  {item.ready ? <ReadyChip /> : <span className={`${base.chip} ${base.chipNeutral}`}>준비 중</span>}
                </h3>
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

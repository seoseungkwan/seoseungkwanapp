import base from './base.module.css'
import styles from './OrthoSection.module.css'

// 카드 4장: 제목·설명 + 숫자 조각(기간 · "예시" · 두 줄). 조각 값은 승인 시안 그대로인 예시다
const TILES: { title: string; desc: string; period: string; rows: [label: string, value: string][] }[] = [
  {
    title: '주사',
    desc: '주사 치료 수와 F/U 기록',
    period: '이번 달',
    rows: [
      ['주사 치료', '142건'],
      ['F/U 기록', '37건'],
    ],
  },
  {
    title: '물리치료',
    desc: '물리치료 내원 환자 수',
    period: '오늘',
    rows: [
      ['오전', '21명'],
      ['오후', '17명'],
    ],
  },
  {
    title: '비급여',
    desc: '비급여 치료 내역',
    period: '이번 달',
    rows: [
      ['도수치료', '86건'],
      ['체외충격파', '31건'],
    ],
  },
  {
    title: '월말 보고',
    desc: '한 장으로 받는 월간 보고',
    period: '10월',
    rows: [
      ['보고서', 'PDF 1장'],
      ['AI 분석', '포함'],
    ],
  },
]

// 정형외과·통증 의원 섹션(#ortho) (specs/landing-v2 AC-108.3): 제목 → 카드 4장(글 | 숫자 조각).
// 카드 모양은 base .card·.group이 정하고, .orthoCard는 안쪽 배치만 정한다
export default function OrthoSection() {
  return (
    <section id="ortho" className={base.sec}>
      <div className={`${base.wrap} ${base.stack}`}>
        <div className={base.head}>
          <h2 className={base.tH2}>정형외과·통증 의원을 위해 만들었습니다</h2>
          <p className={base.tLead}>
            척추·관절 환자 흐름, 도수·물리치료 처방, 치료사 생산성까지. 정형외과에서 매일 보는 숫자에 맞췄습니다.
          </p>
        </div>
        <ul className={`${base.grid4} ${base.group}`}>
          {TILES.map(({ title, desc, period, rows }) => (
            <li key={title} className={`${base.card} ${styles.orthoCard}`}>
              <div className={styles.text}>
                <h3 className={base.tH3}>{title}</h3>
                <p className={base.tBody}>{desc}</p>
              </div>
              <div aria-hidden="true" className={styles.snip}>
                <div className={styles.snipHead}>
                  <span>{period}</span>
                  <span>예시</span>
                </div>
                {rows.map(([label, value]) => (
                  <div key={label} className={styles.snipRow}>
                    <span>{label}</span>
                    <b>{value}</b>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

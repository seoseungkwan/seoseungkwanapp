import base from './base.module.css'
import styles from './OrthoSection.module.css'

// 비교표 한 열: 이름 · 보는 숫자 · 기준 · 예시 값 쌍(승인 시안 docs/mockups/ui-90/entry/screens.mjs ORTHO 그대로인 예시, 영어 줄임말 대신 "재방문").
// PC 표(열 4개)와 휴대폰 표(줄 4개)가 이 배열 하나에서 나온다(design.md '정형외과 표' — 표는 CSS로 뒤집을 수 없다)
const ORTHO: { name: string; sees: string; basis: string; pairs: [label: string, value: string][] }[] = [
  {
    name: '주사',
    sees: '주사 치료 수와 재방문',
    basis: '이번 달',
    pairs: [
      ['주사 치료', '142건'],
      ['재방문', '37건'],
    ],
  },
  {
    name: '물리치료',
    sees: '물리치료 내원 환자 수',
    basis: '오늘',
    pairs: [
      ['오전', '21명'],
      ['오후', '17명'],
    ],
  },
  {
    name: '비급여',
    sees: '비급여 치료 내역',
    basis: '이번 달',
    pairs: [
      ['도수치료', '86건'],
      ['체외충격파', '31건'],
    ],
  },
  {
    name: '월말 보고',
    sees: '한 장으로 받는 월간 보고',
    basis: '10월',
    pairs: [
      ['보고서', 'PDF 1장'],
      ['AI 분석', '포함'],
    ],
  },
]

// 값 쌍: 이름 | 값 양 끝 한 줄
function Pairs({ pairs }: { pairs: [label: string, value: string][] }) {
  return pairs.map(([label, value]) => (
    <span key={label} className={styles.kv}>
      <span>{label}</span>
      <b className={styles.value}>{value}</b>
    </span>
  ))
}

// 정형외과·통증 의원 섹션(#ortho, 흰 바탕) (specs/b2b-redesign AC-209.2, specs/ui-90 AC-421.5, 시안 screens.mjs landingPC·landingPhone #ortho).
// 머리(h2 1~6칸 · 안내 7~11칸) → PC 비교표(768px 이상) · 휴대폰 표(768px 미만). 카드·그림이 없다
export default function OrthoSection() {
  return (
    <section id="ortho" className={base.sec}>
      <div className={base.wrap}>
        <div className={`${base.grid} ${styles.head}`}>
          <h2 className={`${base.tHeading} ${styles.title}`}>정형외과·통증 의원을 위해 만들었어요</h2>
          <p className={`${base.tLead} ${styles.lead}`}>
            척추·관절 환자 흐름, 도수·물리치료 처방, 치료사 생산성까지. 정형외과에서 매일 보는 숫자에 맞췄어요.
          </p>
        </div>

        <table className={`${styles.table} ${base.pcOnly}`}>
          <thead>
            <tr>
              <td className={styles.corner} />
              {ORTHO.map((col) => (
                <th key={col.name} scope="col" className={styles.colHead}>
                  {col.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className={styles.rowHead}>
                보는 숫자
              </th>
              {ORTHO.map((col) => (
                <td key={col.name} className={styles.cell}>
                  {col.sees}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={styles.rowHead}>
                기준
              </th>
              {ORTHO.map((col) => (
                <td key={col.name} className={styles.cell}>
                  {col.basis}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={styles.rowHead}>
                예시
              </th>
              {ORTHO.map((col) => (
                <td key={col.name} className={styles.cell}>
                  <Pairs pairs={col.pairs} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>

        <table className={`${styles.mobile} ${base.phoneOnly}`}>
          <caption className={styles.caption}>예시 값</caption>
          <tbody>
            {ORTHO.map((col) => (
              <tr key={col.name} className={styles.mRow}>
                <th scope="row" className={styles.mRowHead}>
                  {col.name}
                  <span className={styles.mBasis}>{col.basis}</span>
                </th>
                <td className={styles.mCell}>
                  <Pairs pairs={col.pairs} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

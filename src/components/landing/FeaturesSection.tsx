import type { ReactNode } from 'react'
import base from './base.module.css'
import styles from './FeaturesSection.module.css'

// 통계 미리보기 예시 값(승인 시안 그대로). 비율 4개와 처방 그룹 4줄(막대 폭 %)
const RATES: [label: string, value: string][] = [
  ['신환율', '18.2%'],
  ['재진율', '81.8%'],
  ['7일 재방문', '41.0%'],
  ['14일 재방문', '52.6%'],
]
const GROUPS: [name: string, width: number, count: number][] = [
  ['물리치료', 100, 214],
  ['주사', 66, 142],
  ['도수', 40, 86],
  ['체외충격파', 14, 31],
]

// 급여표 예시. 이름·금액은 [ ] 빈칸
const STAFF = [
  { name: '[직원 A]', job: '물리치료사' },
  { name: '[직원 B]', job: '도수치료사' },
  { name: '[직원 C]', job: '간호조무사' },
  { name: '[직원 D]', job: '방사선사' },
]

// 작은 기능 카드 3개. 아이콘은 20px 선 그림(stroke="currentColor", 색은 CSS가 정한다)
const SMALL: { title: string; desc: string; icon: ReactNode }[] = [
  {
    title: '매출·재고',
    desc: '매출 흐름을 보고, 재고가 떨어지면 대시보드에 발주 알림을 띄웁니다.',
    icon: <path d="M4 16.5V10M8 16.5V6M12 16.5V11M16 16.5V3.5" />,
  },
  {
    title: '일일마감·보고',
    desc: '일일마감, 일일보고, 월말보고를 정해진 양식에 맞춰 빠르게 씁니다.',
    icon: (
      <>
        <rect x="4" y="3" width="12" height="15" rx="1.5" />
        <path d="M7 7.5h6M7 10.5h6M7 13.5h4" />
      </>
    ),
  },
  {
    title: '원장님 월간 보고',
    desc: '월말보고·통계 그래프·AI 분석을 한 장에 모아 PDF로 저장합니다.',
    icon: (
      <>
        <path d="M5 2.5h7l3.5 3.5v11.5H5z" />
        <path d="M7.5 14l2-2.5 2 1.5 2.5-3.5" />
      </>
    ),
  },
]

// 기능 카드 하나: 글(이름표 · 제목 · 설명 · 칩 3개) | 미리보기
function FeatureCard(props: { label: string; title: ReactNode; desc: ReactNode; chips: string[]; children: ReactNode }) {
  return (
    <article className={styles.fcard}>
      <div className={styles.fcardText}>
        <p className={base.tLabel}>{props.label}</p>
        <h3 className={base.tH3l}>{props.title}</h3>
        <p className={base.tBody}>{props.desc}</p>
        <div className={`${base.chips} ${styles.fcardChips}`}>
          {props.chips.map((chip) => (
            <span key={chip} className={`${base.chip} ${base.chipNeutral}`}>
              {chip}
            </span>
          ))}
        </div>
      </div>
      <div className={styles.fcardShot}>{props.children}</div>
    </article>
  )
}

// 기능 섹션(#features) (specs/landing-v2 AC-109.1): 제목 → 기능 카드 2개(통계·급여 미리보기) → 작은 카드 3개.
// 미리보기는 그림일 뿐 아무것도 받지 않는다(파일 놓는 칸은 div). 통계 패널은 aria-hidden, 급여표는 읽힌다
export default function FeaturesSection() {
  return (
    <section id="features" className={`${base.sec} ${base.secCanvas}`}>
      <div className={`${base.wrap} ${base.stack}`}>
        <div className={base.head}>
          <h2 className={base.tH2}>
            매일 하던 일,
            <br />
            이제 숫자가 알아서 움직입니다
          </h2>
        </div>

        <div className={styles.featBig}>
          <FeatureCard
            label="01 · 환자 통계"
            title={
              <>
                파일을 끌어다 놓으면,
                <br />
                숫자가 살아납니다
              </>
            }
            desc={
              <>
                EMR에서 내려받은 통계 파일을 올리면 신환율·재진율, <span className={base.nowrap}>7일·14일</span> 재방문,
                처방 그룹별 환자 수가 바로 계산됩니다.
              </>
            }
            chips={['신환율·재진율', '7·14일 재방문', '처방 그룹']}
          >
            <div className={styles.drop}>
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 18 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              >
                <path d="M4 2h7l4 4v10H4z" />
                <path d="M11 2v4h4" />
              </svg>
              통계 파일을 여기에 놓기
            </div>
            <div aria-hidden="true" className={styles.mini}>
              <div className={styles.miniHead}>
                <span className={styles.miniTitle}>환자 통계</span>
                <span className={`${base.chip} ${base.chipSample}`}>예시</span>
              </div>
              <div className={styles.miniBody}>
                <dl className={styles.rates}>
                  {RATES.map(([label, value]) => (
                    <div key={label} className={styles.rate}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className={styles.groups}>
                  <div className={styles.groupsTitle}>처방 그룹 · 환자 수</div>
                  {GROUPS.map(([name, width, count], i) => (
                    <div key={name} className={styles.grp}>
                      <span>{name}</span>
                      <span className={styles.track}>
                        <i
                          className={i === 0 ? `${styles.fill} ${styles.fillFirst}` : styles.fill}
                          style={{ width: `${width}%` }}
                        />
                      </span>
                      <b>{count}</b>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </FeatureCard>

          <FeatureCard
            label="02 · 급여·인센티브"
            title={
              <>
                월 실적만 넣으면
                <br />
                급여 계산이 끝납니다
              </>
            }
            desc="직원별 인센티브 규칙을 한 번 정해 두면, 월 실적으로 급여를 계산하고 확정합니다. 세무사 전달표와 인건비율·치료사 생산성도 함께 나옵니다."
            chips={['인센티브 규칙', '확정하면 잠금', '세무사 전달표']}
          >
            <div className={styles.mini}>
              <div className={styles.miniHead}>
                <span className={styles.miniTitle}>10월 급여</span>
                <span className={`${base.chip} ${base.chipOk}`}>
                  <svg
                    aria-hidden="true"
                    width="12"
                    height="12"
                    viewBox="0 0 14 14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2.5 7.5l3 3 6-7" />
                  </svg>
                  10월 확정됨
                </span>
              </div>
              <div className={styles.tblWrap}>
                <table className={styles.tbl}>
                  <thead>
                    <tr>
                      <th>직원</th>
                      <th>직종</th>
                      <th className={styles.right}>인센티브</th>
                      <th className={styles.right}>합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {STAFF.map((s) => (
                      <tr key={s.name}>
                        <td>{s.name}</td>
                        <td className={styles.sub}>{s.job}</td>
                        <td className={styles.right}>[금액]</td>
                        <td className={styles.right}>[금액]</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </FeatureCard>
        </div>

        <ul className={`${base.grid3} ${base.group}`}>
          {SMALL.map(({ title, desc, icon }) => (
            <li key={title} className={`${base.card} ${styles.smallCard}`}>
              <div className={styles.smallHead}>
                <svg
                  aria-hidden="true"
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {icon}
                </svg>
                <h3 className={base.tH3}>{title}</h3>
              </div>
              <p className={base.tBody}>{desc}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

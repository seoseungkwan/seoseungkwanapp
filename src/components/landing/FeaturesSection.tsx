import Image from 'next/image'
import styles from './FeaturesSection.module.css'
import { LANDING_IMAGES } from './images'

const STATS = LANDING_IMAGES.featureStats
const PAYROLL = LANDING_IMAGES.featurePayroll

// 급여표 예시. 이름·금액은 [ ] 빈칸
const STAFF = [
  { name: '[직원 A]', job: '물리치료사' },
  { name: '[직원 B]', job: '도수치료사' },
  { name: '[직원 C]', job: '간호조무사' },
  { name: '[직원 D]', job: '방사선사' },
]

// 기능 섹션(#features): 01 환자 통계 · 02 급여·인센티브 · 작은 기능 카드 3개
export default function FeaturesSection() {
  return (
    <section id="features" className={styles.section}>
      <div className={styles.inner}>
        <div className={styles.head}>
          <span className={styles.eyebrow}>FEATURES</span>
          <h2 className={styles.title}>
            매일 하던 일,
            <br />
            이제 숫자가 알아서 움직입니다
          </h2>
        </div>

        <div className={styles.row}>
          <div className={styles.text}>
            <span className={`${styles.step} ${styles.stepTeal}`}>01 · 환자 통계</span>
            <h3 className={styles.featureTitle}>
              파일을 끌어다 놓으면,
              <br />
              숫자가 살아납니다
            </h3>
            <p className={styles.desc}>
              EMR에서 내려받은 통계 파일을 올리면 신환율·재진율, 7일·14일 재방문, 처방 그룹별 환자 수가 바로
              계산됩니다.
            </p>
            <div className={styles.chips}>
              <span className={`${styles.chip} ${styles.chipTeal}`}>신환율·재진율</span>
              <span className={`${styles.chip} ${styles.chipTeal}`}>7·14일 재방문</span>
              <span className={`${styles.chip} ${styles.chipTeal}`}>처방 그룹</span>
            </div>
          </div>
          <div className={`${styles.visual} ${styles.visualStats}`}>
            <Image
              src={STATS.src}
              alt={STATS.alt}
              width={STATS.width}
              height={STATS.height}
              unoptimized
              className={styles.img}
            />
            <div aria-hidden="true" className={styles.bars}>
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className={styles.bar} />
              ))}
            </div>
            <div className={styles.drop}>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M4 2h7l4 4v10H4z" stroke="#077A73" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M11 2v4h4" stroke="#077A73" strokeWidth="1.6" />
              </svg>
              통계 파일을 여기에 놓기
            </div>
          </div>
        </div>

        <div className={`${styles.row} ${styles.rowReverse}`}>
          <div className={styles.text}>
            <span className={`${styles.step} ${styles.stepAmber}`}>02 · 급여·인센티브</span>
            <h3 className={styles.featureTitle}>
              월 실적만 넣으면
              <br />
              급여 계산이 끝납니다
            </h3>
            <p className={styles.desc}>
              직원별 인센티브 규칙을 한 번 정해 두면, 월 실적으로 급여를 계산하고 확정합니다. 세무사 전달표와
              인건비율·치료사 생산성도 함께 나옵니다.
            </p>
            <div className={styles.chips}>
              <span className={`${styles.chip} ${styles.chipAmber}`}>인센티브 규칙</span>
              <span className={`${styles.chip} ${styles.chipAmber}`}>확정하면 잠금</span>
              <span className={`${styles.chip} ${styles.chipAmber}`}>세무사 전달표</span>
            </div>
          </div>
          <div className={`${styles.visual} ${styles.visualPayroll}`}>
            <Image
              src={PAYROLL.src}
              alt={PAYROLL.alt}
              width={PAYROLL.width}
              height={PAYROLL.height}
              unoptimized
              className={styles.img}
            />
            <div className={styles.table}>
              <div className={`${styles.tr} ${styles.th}`}>
                <span>직원</span>
                <span>직종</span>
                <span className={styles.right}>인센티브</span>
                <span className={styles.right}>합계</span>
              </div>
              {STAFF.map((s) => (
                <div key={s.name} className={styles.tr}>
                  <span>{s.name}</span>
                  <span className={styles.job}>{s.job}</span>
                  <span className={`${styles.right} ${styles.incentive}`}>[금액]</span>
                  <span className={styles.right}>[금액]</span>
                </div>
              ))}
              <div aria-hidden="true" className={styles.scan} />
            </div>
            <span className={styles.done}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M2.5 7.5l3 3 6-7"
                  stroke="#077A73"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              10월 확정됨
            </span>
          </div>
        </div>

        <div className={styles.cards}>
          <div className={`${styles.card} ${styles.cardAmber}`}>
            <svg aria-hidden="true" width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M5 26V14M12 26V8M19 26V16M26 26V5" stroke="#F59E0B" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
            <h3 className={styles.cardTitle}>매출·재고</h3>
            <p className={styles.cardDesc}>매출 흐름을 보고, 재고가 떨어지면 대시보드에 발주 알림을 띄웁니다.</p>
          </div>
          <div className={`${styles.card} ${styles.cardPink}`}>
            <svg aria-hidden="true" width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect x="6" y="4" width="20" height="24" rx="3" stroke="#E11D74" strokeWidth="2.4" />
              <path d="M11 12h10M11 17h10M11 22h6" stroke="#E11D74" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
            <h3 className={styles.cardTitle}>일일마감·보고</h3>
            <p className={styles.cardDesc}>일일마감, 일일보고, 월말보고를 정해진 양식에 맞춰 빠르게 씁니다.</p>
          </div>
          <div className={`${styles.card} ${styles.cardBlue}`}>
            <svg aria-hidden="true" width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M8 4h11l6 6v18H8z" stroke="#2556D6" strokeWidth="2.4" strokeLinejoin="round" />
              <path
                d="M12 22l3-4 3 2 4-6"
                stroke="#2556D6"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <h3 className={styles.cardTitle}>원장님 월간 보고</h3>
            <p className={styles.cardDesc}>월말보고·통계 그래프·AI 분석을 한 장에 모아 PDF로 저장합니다.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

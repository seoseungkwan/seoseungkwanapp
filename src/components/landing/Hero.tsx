import styles from './Hero.module.css'
import HeroChart from './HeroChart'
import { START_HREF } from './links'

// 반짝이 모양 (AI 표시). 히어로 칩과 [AI 분석 보기]에 쓴다
function Sparkle({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5l1.6 4.2 4.4 1.3-4.4 1.3L8 12.5 6.4 8.3 2 7l4.4-1.3z" fill="#6D5DF5" />
    </svg>
  )
}

// 히어로(#top): 왼쪽은 제목·설명·버튼·개인정보 한 줄, 오른쪽은 예시 차트
export default function Hero() {
  return (
    <section id="top" className={styles.hero}>
      <div aria-hidden="true" className={styles.grid} />
      <div aria-hidden="true" className={`${styles.glow} ${styles.glowTeal}`} />
      <div aria-hidden="true" className={`${styles.glow} ${styles.glowViolet}`} />
      <div aria-hidden="true" className={styles.dots}>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>

      <div className={styles.inner}>
        <div className={styles.text}>
          <span className={styles.chip}>
            <Sparkle className={styles.sparkle} />
            통증 의원 관리자를 위한 AI 업무 도구
          </span>
          <h1 className={styles.title}>
            숫자로 보는
            <br />
            <span className={styles.titleAccent}>우리 의원</span>
          </h1>
          <p className={styles.lead}>
            환자 통계, 급여·인센티브, 매출·재고, 일일마감과 <span className={styles.nowrap}>원장님 보고까지</span> 한
            화면에서. 이번 달 숫자는 <b className={styles.leadAi}>AI가 읽고 근거와 함께 설명</b>합니다.
          </p>
          <div className={styles.actions}>
            <a href={START_HREF} className={styles.start}>
              구글로 시작하기
            </a>
            <a href="#ai" className={styles.aiLink}>
              <Sparkle />
              AI 분석 보기
            </a>
          </div>
          <p className={styles.privacy}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 22 22" fill="none">
              <path
                d="M11 2l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V5l7-3z"
                stroke="#077A73"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path
                d="M7.5 11l2.5 2.5 4.5-5"
                stroke="#077A73"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            환자 개인정보는 병원 PC 밖으로 나가지 않습니다
          </p>
        </div>

        <HeroChart />
      </div>
    </section>
  )
}

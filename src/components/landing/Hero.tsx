import base from './base.module.css'
import styles from './Hero.module.css'
import HeroChart from './HeroChart'
import { START_HREF } from './links'

// 히어로(#top) (specs/landing-v2 AC-107.1): 소개 줄·제목 | 안내·단추 2개·개인정보 한 줄, 그 아래 앱 화면 미리보기.
// 배경 장식(격자·원형 빛·점)과 반짝이는 없다. 색은 base·Hero 모듈의 변수만 쓴다
export default function Hero() {
  return (
    <section id="top" className={styles.hero}>
      <div className={base.wrap}>
        <div className={styles.grid}>
          <div className={styles.text}>
            <p className={styles.kicker}>통증 의원 관리자를 위한 AI 업무 도구</p>
            <h1 className={base.tDisplay}>
              숫자로 보는
              <br />
              우리 의원
            </h1>
          </div>
          <div className={styles.side}>
            <p className={base.tLead}>
              환자 통계, 급여·인센티브, 매출·재고, 일일마감과 <span className={base.nowrap}>원장님 보고까지</span> 한
              화면에서. 이번 달 숫자는 AI가 읽고 근거와 함께 설명합니다.
            </p>
            <div className={styles.actions}>
              <a href={START_HREF} className={`${base.btn} ${base.btnLg} ${base.btnPrimary}`}>
                구글로 시작하기
              </a>
              <a href="#ai" className={`${base.btn} ${base.btnLg} ${base.btnSecondary}`}>
                AI 분석 보기
              </a>
            </div>
            <p className={styles.privacy}>
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 22 22"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              >
                <path d="M11 2l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V5l7-3z" />
                <path d="M7.5 11l2.5 2.5 4.5-5" strokeLinecap="round" />
              </svg>
              환자 개인정보는 병원 PC 밖으로 나가지 않습니다
            </p>
          </div>
        </div>

        <div className={styles.shot}>
          <HeroChart />
        </div>
      </div>
    </section>
  )
}

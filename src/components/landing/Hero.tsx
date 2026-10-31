import { Icon, type IconName } from '@/components/common/Icon'
import { DashboardPreview } from '@/components/preview/DashboardPreview'
import base from './base.module.css'
import styles from './Hero.module.css'
import { START_HREF } from './links'

// 약속 3개(768px 이상). "0건"만 굵게 보인다
const PROMISES: Array<{ icon: IconName; text: string; zero?: string }> = [
  { icon: 'shield', text: '환자 개인정보 서버 전송 ', zero: '0건' },
  { icon: 'monitor', text: '환자 파일은 브라우저 안에서만 계산' },
  { icon: 'sigma', text: 'AI에는 합계 숫자만' },
]

// 히어로(#top) (specs/b2b-redesign REQ-208 AC-208.1, 시안 docs/mockups/b2b-redesign/screens.mjs .l-hero):
// 글 덩어리(소개 · 제목 · 안내 · 단추 줄 · 약속) → 대시보드 미리보기(예시 숫자). 숫자 순환·움직임이 없고 서버에서 그대로 그린다.
// 휴대폰은 [AI 분석 보기]와 약속 목록 대신 개인정보 한 줄을 보인다(.pcOnly·.phoneOnly). 배경 장식·반짝이는 없다
export default function Hero() {
  return (
    <section id="top" className={styles.hero}>
      <div className={base.wrap}>
        <div className={`${base.grid} ${styles.layout}`}>
          <div className={styles.text}>
            <p className={`${base.tSmall} ${styles.kicker}`}>통증 의원 관리자를 위한 AI 업무 도구</p>
            <h1 className={base.tDisplay}>숫자로 보는 우리 의원</h1>
            <p className={styles.lead}>
              환자 통계, 급여·인센티브, 매출·재고, 일일마감과 원장님 보고까지 한 화면에서. 이번 달 숫자는 AI가 읽고 근거와 함께
              설명합니다.
            </p>
            <div className={styles.actions}>
              <a href={START_HREF} className={`${base.btn} ${base.btnLg} ${base.btnPrimary} ${styles.start}`}>
                구글로 시작하기
              </a>
              <a href="#ai" className={`${base.btn} ${base.btnLg} ${base.btnSecondary} ${base.pcOnly}`}>
                AI 분석 보기
              </a>
            </div>
            <ul className={`${styles.promises} ${base.pcOnly}`}>
              {PROMISES.map((item) => (
                <li key={item.icon} className={styles.promise}>
                  <Icon name={item.icon} className={styles.icon} />
                  <span>
                    {item.text}
                    {item.zero && <span className={styles.zero}>{item.zero}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <p className={`${base.tSmall} ${styles.phoneLine} ${base.phoneOnly}`}>
              <Icon name="shield" size={14} />
              환자 개인정보는 병원 PC 밖으로 나가지 않습니다
            </p>
          </div>
          <div className={styles.shot}>
            <DashboardPreview />
          </div>
        </div>
      </div>
    </section>
  )
}

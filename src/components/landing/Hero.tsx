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

// 히어로(#top) (specs/b2b-redesign REQ-208 AC-208.1, specs/ui-90 AC-421.3, 시안 docs/mockups/ui-90/entry/screens.mjs landingPC·landingPhone .l-hero):
// 글 덩어리(소개 · 제목 · 안내 · 단추 줄 · 약속) → 대시보드 미리보기(예시 숫자). 숫자 순환·움직임이 없고 서버에서 그대로 그린다.
// 소개 줄은 body 600, 안내는 모든 폭 lead(AC-421.8). 안내의 "원장님 보고까지"·"한 화면에서"는 줄 끝에서 끊기지 않는다(.nw).
// 휴대폰은 [AI 분석 보기]와 약속 목록 대신 개인정보 한 줄을 보인다(.pcOnly·.phoneOnly). 배경 장식·반짝이는 없다
export default function Hero() {
  return (
    <section id="top" className={styles.hero}>
      <div className={base.wrap}>
        <div className={`${base.grid} ${styles.layout}`}>
          <div className={styles.text}>
            <p className={styles.kicker}>통증 의원 관리자를 위한 AI 업무 도구</p>
            <h1 className={base.tDisplay}>숫자로 보는 우리 의원</h1>
            <p className={`${base.tLead} ${styles.lead}`}>
              청구 전 삭감 예방 사전점검부터 환자 통계·매출·<span className={base.nw}>원장님 보고까지</span>, 의원 일을{' '}
              <span className={base.nw}>한 화면에서</span> 봐요. 지금은 사전점검을 먼저 쓸 수 있고, 나머지는 차례로 열려요.
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
              <span>
                환자 개인정보는 <span className={base.nw}>병원 PC</span> 밖으로 나가지 않아요
              </span>
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

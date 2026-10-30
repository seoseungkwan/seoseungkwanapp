import base from './base.module.css'
import { START_HREF } from './links'
import styles from './StartSection.module.css'

// 시작하기 섹션(#start) (specs/landing-v2 AC-110.4): 글(왼쪽) | 마지막 [구글로 시작하기](오른쪽), 휴대폰은 위아래.
// 목업의 href="#top" 대신 로그인으로 보낸다(사용자 결정)
export default function StartSection() {
  return (
    <section id="start" className={base.sec}>
      <div className={base.wrap}>
        <div className={styles.start}>
          <div className={styles.text}>
            <h2 className={base.tH2}>
              우리 의원도
              <br />
              숫자로 운영해 보세요
            </h2>
            <p className={base.tLead}>처음이면 가입 신청 후 관리자 승인을 받습니다.</p>
          </div>
          <a href={START_HREF} className={`${base.btn} ${base.btnLg} ${base.btnPrimary}`}>
            구글로 시작하기
          </a>
        </div>
      </div>
    </section>
  )
}

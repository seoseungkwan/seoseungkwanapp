import { START_HREF } from './links'
import styles from './StartSection.module.css'

// 시작하기 섹션(#start): 마지막 [구글로 시작하기]. 목업의 href="#top" 대신 로그인으로 보낸다(사용자 결정)
export default function StartSection() {
  return (
    <section id="start" className={styles.section}>
      <div aria-hidden="true" className={styles.glow} />
      <div className={styles.inner}>
        <h2 className={styles.title}>
          우리 의원도
          <br />
          숫자로 운영해 보세요
        </h2>
        <p className={styles.lead}>처음이면 가입 신청 후 관리자 승인을 받습니다.</p>
        <a href={START_HREF} className={styles.start}>
          구글로 시작하기
        </a>
      </div>
    </section>
  )
}

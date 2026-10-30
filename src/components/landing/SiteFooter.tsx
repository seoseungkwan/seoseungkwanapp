import base from './base.module.css'
import styles from './SiteFooter.module.css'

// 푸터 (specs/landing-v2 AC-110.5): 왼쪽 이름 | 오른쪽 문의 · ©. 서비스 이름·문의 메일은 정해질 때까지 빈칸
export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`${base.wrap} ${styles.inner}`}>
        <span>[서비스 이름]</span>
        <span className={styles.right}>
          <span>문의 [이메일 주소]</span>
          <span>© 2026</span>
        </span>
      </div>
    </footer>
  )
}

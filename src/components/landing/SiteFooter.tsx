import styles from './SiteFooter.module.css'

// 푸터. 서비스 이름·문의 메일은 정해질 때까지 빈칸
export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <span>[서비스 이름]</span>
        <span>문의 [이메일 주소]</span>
        <span>© 2026</span>
      </div>
    </footer>
  )
}

import { LogoMark } from '@/components/common/LogoMark'
import base from './base.module.css'
import styles from './SiteFooter.module.css'

// 바닥글 (specs/b2b-redesign REQ-207 AC-207.3, 시안 docs/mockups/b2b-redesign/screens.mjs .l-foot):
// 왼쪽 로고 + 소개 한 줄 · 오른쪽 ©. 링크·서비스 이름·문의 메일은 두지 않는다
export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`${base.wrap} ${styles.inner}`}>
        <div className={styles.brand}>
          <LogoMark size={18} />
          <p className={base.tCaption}>통증 의원 관리자를 위한 AI 업무 도구</p>
        </div>
        <p className={base.tCaption}>© 2026</p>
      </div>
    </footer>
  )
}

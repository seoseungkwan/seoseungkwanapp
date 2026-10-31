import { LogoMark } from '@/components/common/LogoMark'
import base from './base.module.css'
import styles from './SiteHeader.module.css'
import { START_HREF } from './links'

const NAV = [
  { href: '#ai', label: 'AI 분석' },
  { href: '#features', label: '기능' },
  { href: '#privacy', label: '개인정보 보호' },
  { href: '#how', label: '시작 방법' },
] as const

// 위쪽 메뉴 (specs/b2b-redesign REQ-207 AC-207.1, 시안 docs/mockups/b2b-redesign/screens.mjs .l-hdr):
// 로고 링크(보이는 글자 없이 화면 읽기 "맨 위로") · 섹션 링크 4개 · [구글로 시작하기]. 모든 폭에서 한 줄이고 화면 위에 붙어 따라온다.
// 섹션 링크는 768px부터 보인다. 여닫는 단추는 없다
export default function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={`${base.wrap} ${styles.inner}`}>
        <a href="#top" className={styles.logo}>
          <LogoMark size={24} />
          <span className={base.srOnly}>맨 위로</span>
        </a>
        <nav aria-label="주요 메뉴" className={styles.nav}>
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className={styles.navLink}>
              {item.label}
            </a>
          ))}
        </nav>
        <a href={START_HREF} className={`${base.btn} ${base.btnMd} ${base.btnPrimary} ${styles.start}`}>
          구글로 시작하기
        </a>
      </div>
    </header>
  )
}

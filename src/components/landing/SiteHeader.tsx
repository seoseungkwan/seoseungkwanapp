import styles from './SiteHeader.module.css'
import { START_HREF } from './links'

const NAV = [
  { href: '#ai', label: 'AI 분석' },
  { href: '#features', label: '기능' },
  { href: '#privacy', label: '개인정보 보호' },
  { href: '#how', label: '시작 방법' },
] as const

// 위쪽 메뉴 띠: 로고 · 섹션 링크 4개 · [구글로 시작하기]. 화면 위에 붙어 따라온다
export default function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <a href="#top" className={styles.logo}>
          <svg aria-hidden="true" width="30" height="30" viewBox="0 0 30 30" fill="none">
            <rect x="9" y="3" width="12" height="6" rx="3" stroke="#14C8BA" strokeWidth="2.2" />
            <rect x="11" y="12" width="12" height="6" rx="3" stroke="#14C8BA" strokeWidth="2.2" />
            <rect x="8" y="21" width="12" height="6" rx="3" stroke="#6D5DF5" strokeWidth="2.2" />
          </svg>
          <span>[서비스 이름]</span>
        </a>
        <nav aria-label="주요 메뉴" className={styles.nav}>
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className={styles.navLink}>
              {item.label}
            </a>
          ))}
        </nav>
        <a href={START_HREF} className={styles.start}>
          구글로 시작하기
        </a>
      </div>
    </header>
  )
}
